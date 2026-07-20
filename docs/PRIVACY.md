# Privacy Model

Holy Roof Rides is built so that "we don't have that data" is true by
construction, not just a policy. This page explains, in plain language,
exactly what your church's server stores, what it never touches, and what
that means for whoever runs it.

## What is stored (in the SQLite database file)

| Data | Why |
|---|---|
| Member name & phone number | So deacons can identify who's asking to join, and members can be contacted if needed. |
| PIN — **hashed**, never in plain text | Login. Even the server operator can't read anyone's PIN, only whether one matches. |
| Invite codes (who made them, how many uses, expiry) | Controls who can join. |
| Safety reports (description, who filed it, who it's about, resolved or not) | So deacons can look into concerns. |
| Login sessions (a random token, hashed, with an expiry) | Keeps you logged in without storing your PIN anywhere reusable. |
| Church name, address & coordinates | The congregation's own public meeting place, set once by a deacon in Admin > Church — powers "Take me to Church." Not personal data about any member. |

That's the whole list. It lives in one file — `holy-roof-rides.db` — on
your server.

## What is never stored — anywhere, ever

- **Ride requests or ride history.** Once a ride is completed or canceled,
  it's deleted from server memory. There is no `rides` table in the
  database at all — on purpose.
- **Pickup, dropoff, or destination locations.** (The church's own home
  address is the one exception — see "Map services" below.)
- **Live GPS location**, even during an active ride. It's relayed
  rider-to-driver in real time and never written to disk or to a log file.
- **Who rode with whom, or when.** There is no trip log to look back on.
- **Analytics, telemetry, or usage tracking** of any kind.

## Map services

Place search and routing don't go through your church's server at all —
they call two public OpenStreetMap-ecosystem services directly from the
member's phone (see `app/src/geo.ts`):

- **[Nominatim](https://nominatim.openstreetmap.org)** — place search and
  reverse geocoding. Receives whatever text you type into the search box,
  or the coordinates of a pin you drop. See its
  [usage policy](https://operations.osmfoundation.org/policies/nominatim/)
  and the [OSM Foundation privacy policy](https://osmfoundation.org/wiki/Privacy_Policy).
- **[OSRM](https://router.project-osrm.org)** — route preview and ETA.
  Receives the coordinates of your pickup and destination. See its
  [API usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy).

Neither request carries any Holy Roof Rides account, login, or identity —
just the search text or coordinates, same as typing an address into either
service's own website. A church that wants this traffic to never leave its
own infrastructure can self-host both (both projects support it) and point
the app at the self-hosted URLs.

**Recent destinations** live only on the member's device, never the server,
and can be cleared from Settings at any time.

**The church's home address**, set once by a deacon in Admin > Church, is
the single location the server does persist — the congregation's own
public meeting place, not personal data about any member.

## The in-memory design

Rides and live locations live only in the running server's memory (see
`server/src/state.js`), not the database. That means:

- The instant a ride is completed or canceled, all trace of it is gone.
- If the server restarts, every in-progress ride vanishes with it (riders
  and drivers would need to re-request/re-accept — a deliberate trade-off
  for never having a ride log to lose, leak, or be subpoenaed for).
- There is nothing for a server backup, database export, or disk snapshot
  to ever contain about where anyone went.

## What a server operator can and cannot see

**Can see** (anyone with access to the server or its database file):
- The member directory: names, phone numbers, deacon status, approval
  status.
- Invite codes and who created them.
- The text of safety reports and who they're about.

**Cannot see, because it doesn't exist anywhere:**
- Where any member has ever been picked up, dropped off, or driven.
- Who gave whom a ride, or how often.
- Any live location, once the ride it belonged to has ended.

If your church gets a records request, a subpoena, or just a curious
volunteer with database access, there is no ride or location history to
hand over — because none was ever written down.

## Deleting data

- **Wipe everything:** stop the server and delete the `holy-roof-rides.db`
  file (plus any `-wal`/`-shm` files next to it). Every member, invite,
  session, and safety report is gone. This is a full reset — everyone
  would need to rejoin.
- **Remove one member:** Phase 1 doesn't have an in-app "delete member"
  button yet (deacons can approve, reject, or reject a pending applicant).
  To fully remove an approved member's row, a deacon with file access to
  the server can delete their row directly from the SQLite database (e.g.
  `DELETE FROM users WHERE phone = '...'`, which also cascades to their
  sessions). A proper in-app offboarding action is a good Phase 2
  candidate — see [`ROADMAP.md`](../ROADMAP.md).
