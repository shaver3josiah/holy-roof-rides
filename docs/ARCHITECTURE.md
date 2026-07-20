# Architecture

## Shape of the system

```
                    ┌─────────────────────────┐
                    │   Expo React Native app │
                    │   (iOS / Android)        │
                    │   app/src/*              │
                    └───────────┬──────────────┘
                                │
                REST (JSON)     │     WebSocket (/live)
                                │
                    ┌───────────▼──────────────┐
                    │        Fastify server     │
                    │        server/src/*.js    │
                    └─────┬──────────────┬──────┘
                           │              │
                 persisted │              │ in-memory only
                           │              │ (never written to disk)
                    ┌──────▼──────┐  ┌────▼──────────────┐
                    │   SQLite     │  │  state.js maps     │
                    │  (node:sqlite)│  │  rides, sockets    │
                    │  users        │  │                    │
                    │  invite_codes │  │  gone when a ride  │
                    │  sessions     │  │  ends or the       │
                    │  safety_reports│ │  process restarts  │
                    │  settings     │  │                    │
                    └───────────────┘  └────────────────────┘
```

One Fastify process serves both plain REST endpoints and a `/live`
WebSocket. There's no separate API gateway, queue, or cache layer — a
church-sized deployment doesn't need one.

## Module map

### `server/src/`

| File | Responsibility |
|---|---|
| `db.js` | Opens the SQLite file, creates the schema on boot (`users`, `invite_codes`, `sessions`, `safety_reports`, `settings`). `settings` is a small key/value table for admin-configured values like the church's home address. Deliberately has **no** rides/locations table. |
| `state.js` | The entire live-ride model: an in-process `Map` of active rides (tracked through stages `open` → `accepted` → `picked_up`) and a `Map` of open WebSocket connections per user. `publish`/`broadcast` helpers push events out. |
| `util.js` | PIN hashing (scrypt) and verification, session token issuance/hashing, `requireUser`/`requireDeacon` Fastify preHandlers, a small in-memory rate limiter. |
| `auth.js` | `/join`, `/login`, `/logout`, `/me` — membership and sessions. |
| `rides.js` | `/rides` (list/create) and `/rides/:id/accept|picked-up|complete|cancel` — all backed by `state.js`, nothing touches the database. |
| `church.js` | `GET /church` (any member) and `PUT /admin/church` (deacon-only) — the congregation's own public address, read/written from the `settings` table. Powers "Take me to Church". |
| `admin.js` | Deacon-only member approval, invite code management, safety report triage; plus the member-facing `POST /reports`. |
| `live.js` | The `/live` WebSocket: authenticates the connection, relays `location`/`rider_location` messages between the two people on an active ride, and nothing else. |
| `index.js` | Wires everything into a Fastify app, generates the founding-deacon bootstrap code, starts the HTTP listener. |

### `app/src/`

| File | Responsibility |
|---|---|
| `types.ts` | Shapes shared with the server route contracts — kept in lockstep by convention, not codegen. |
| `api.ts` | Thin REST + WebSocket client; one function per server route. |
| `store.ts` | Client-side session and settings state (server URL, "stay in Give a Ride mode", auth token). |
| `theme.ts` | Shared visual tokens. |
| `geo.ts` | Client-side place search, reverse geocoding, and route/ETA — calls Nominatim/OSRM directly from the phone; the server never sees it. |
| `components/OsmMap.tsx` | OpenStreetMap-tile map component (no Google/Apple Maps dependency). |
| `screens/JoinScreen.tsx`, `PinLoginScreen.tsx` | Onboarding: invite code → profile → PIN, and returning-member login. |
| `screens/RiderScreen.tsx` | Default "Receiving Rides" view — request a ride, watch driver arrive. |
| `screens/DriverScreen.tsx` | "Give a Ride" mode — browse open requests, accept, share location. |
| `screens/AdminScreen.tsx` | Deacon tools — approvals, invites, safety reports. |
| `screens/SettingsScreen.tsx` | Server URL, default mode, logout. |

## Route contract summary

| Route | Auth | Purpose |
|---|---|---|
| `POST /join` | invite code | Create a membership (pending, unless it's the bootstrap code) |
| `POST /login` | phone + PIN | Issue a session token |
| `POST /logout` | session | Delete the session |
| `GET /me` | session | Current user (pending members included) |
| `GET /rides` | member | Open rides + caller's active ride |
| `POST /rides` | member | Request a ride |
| `POST /rides/:id/accept` | member | Driver accepts an open ride |
| `POST /rides/:id/picked-up` | member | Driver marks the rider picked up |
| `POST /rides/:id/complete` | member | Ends and deletes a ride |
| `POST /rides/:id/cancel` | member | Rider cancels (deletes) or driver cancels (reopens) |
| `POST /reports` | member | File a safety report |
| `GET /church` | member | The church's public home address (for "Take me to Church") |
| `PUT /admin/church` | deacon | Set the church's home address |
| `GET /admin/pending`, `/admin/members` | deacon | Membership lists |
| `POST /admin/users/:id/approve\|reject\|make-deacon` | deacon | Membership decisions |
| `POST /admin/invites`, `GET /admin/invites`, `POST /admin/invites/:code/revoke` | deacon | Invite code lifecycle |
| `GET /admin/reports`, `POST /admin/reports/:id/resolve` | deacon | Safety report triage |
| `WS /live?token=...` | session | Real-time ride events + location relay |

Full request/response shapes live as contract comments at the top of each
`server/src/*.js` file — that's the source of truth, not this table.

## Why these choices

**`node:sqlite`, no ORM.** Node 22 ships a built-in SQLite driver. A church
server has one writer process and a few hundred rows of members/invites —
raw `prepare()`/`.run()`/`.get()` calls are plenty, and it means zero
native dependencies to compile or update for a volunteer running this on a
Raspberry Pi or a $5 VPS.

**In-memory rides, not a database table.** This is the privacy model, not
a performance shortcut. If ride and location data were ever written to
disk, it would exist to be backed up, leaked, or subpoenaed. Keeping it in
a process-memory `Map` (`state.js`) means it structurally cannot outlive
the ride — see [`PRIVACY.md`](PRIVACY.md).

**No separate API gateway/queue/cache.** One Fastify process handles
everything a congregation throws at it. Adding infrastructure layers here
would be solving a scale problem this app doesn't have.

**Geocoding/routing happen on the phone, not the server.** `app/src/geo.ts`
calls Nominatim and OSRM directly from the client for place search, reverse
geocoding, and route/ETA — the church server never sees a search query or a
route request. See [`PRIVACY.md`](PRIVACY.md#map-services) for what those
third-party services receive.

## Scaling notes

A congregation is roughly 50–500 people, almost all of whom are idle most
of the day. That's a light load — one small VPS (or even a machine on the
church's own network) comfortably runs the whole stack: Fastify, SQLite,
and the in-memory ride state, together.

Known ceilings and their Phase 2/3 upgrade paths (see
[`ROADMAP.md`](../ROADMAP.md) for the full list):

- **In-memory rides don't survive a restart.** Fine at this scale (a
  restart mid-ride is rare and just means re-requesting); a durable queue
  would only be worth it at a size this app isn't designed for.
- **Raster OSM tiles** are simplest today; Phase 2 moves to self-hostable
  MapLibre vector tiles if tile-server load becomes a concern.
- **One congregation per server** today; Phase 2 adds multi-congregation
  support (one server, several churches) for smaller churches who'd rather
  share hosting.
- **No push notifications yet** — the app has to be open to see a new
  ride event live over the WebSocket; Phase 2 adds Expo Push for
  requested/accepted/arriving notifications.

None of this requires re-architecting: it's additive on top of the same
Fastify + SQLite + in-memory-state shape.
