# Holy Roof Rides 🚗⛪

An open-source rideshare app for churches. Members ask for rides, other
members give them, and a deacon approves everyone who joins — so it's never
open to strangers off the street. It runs on a server your church controls,
and it doesn't keep a record of anyone's trips.

No fares, no tips, no ratings. This is ministry, not a taxi business.

## What it does

- **Ask for a ride.** Drop a pin for where you're going, and see it on an
  open map (no Google account needed — it uses OpenStreetMap).
- **Give a ride.** Flip into "Give a Ride" mode to see open requests nearby
  and accept one.
- **Live location, only during the ride.** While a ride is active, rider and
  driver can see each other's location on the map. The moment the ride ends,
  that location data is gone — it was never written to disk.
- **Deacon approval.** New members join with an invite code, then wait for a
  deacon to approve them before they can request or give rides.
- **Safety reports.** Any member can file a report; deacons see and resolve
  them.
- **Self-hosted.** Your church runs the server. Nobody else's company sits
  in the middle of your congregation's rides.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) for exactly what is and isn't
stored, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it's
built.

## Screenshots

_placeholder — add screenshots of the Rider, Driver, and Admin screens here
once the app has a first coat of paint._

## Setting this up for your church (about 10 minutes)

You don't need to be a developer to do this — just comfortable typing a few
commands. You'll need a computer or a small server that can stay on and
reachable (a $5/month VPS works great; so does an old laptop on your church
network).

### 1. Get a server running

Install [Node.js](https://nodejs.org) version 22 or newer on the machine
that will host the app, then:

```bash
git clone https://github.com/<your-org>/holy-roof-rides.git
cd holy-roof-rides/server
npm install
npm start
```

You'll see a line in the log like:

```
No members yet. Founding-deacon bootstrap code: 7F3K9QRT
```

**Write that code down.** It's a one-time code — whoever joins the app with
it first becomes your first deacon (the person who approves everyone else).
It only appears while there are zero members in the database, so if you miss
it, stop the server, delete the `holy-roof-rides.db` file, and start again.

Leave this running. It's your church's server — the app on everyone's phone
talks to it.

### 2. Become the founding deacon

Install the app (see step 4 below), point it at your server's address in
Settings, and join using the bootstrap code from step 1 as your invite code.
You're now a deacon and can approve other members.

### 3. Invite your congregation

From the Admin screen in the app, generate invite codes and hand them out
(print them, text them, whatever works for your church). When someone joins
with a code, they show up in your pending-approval list — tap approve and
they're in.

### 4. Install the app

- **Android:** grab the latest APK from this repo's
  [Releases](../../releases) page (built automatically by GitHub Actions on
  every tag) and install it directly on the phone.
- **iOS:** we build and ship to TestFlight via Expo's EAS Build, which
  doesn't require a Mac. See the release workflow in `.github/workflows/`
  for the exact steps, or ask whoever maintains your church's install to
  invite you to the TestFlight beta.

Once installed, each member sets their server's address once in Settings
and they're set.

## Monorepo layout

```
holy-roof-rides/
├── app/                  Expo React Native app (TypeScript)
│   └── src/
│       ├── screens/      Join, PinLogin, Rider, Driver, Admin, Settings
│       ├── components/   OsmMap and friends
│       ├── api.ts        REST + WebSocket client
│       ├── store.ts      client-side session/settings state
│       └── types.ts      shapes shared with the server contracts
├── server/               Fastify server (Node 22+, node:sqlite, zero native deps)
│   └── src/
│       ├── db.js         SQLite schema (members, invites, sessions, reports)
│       ├── state.js      in-memory rides + live sockets (never persisted)
│       ├── auth.js       join / login / sessions
│       ├── rides.js      request / accept / complete / cancel a ride
│       ├── admin.js      deacon approval queue, invites, safety reports
│       ├── live.js       WebSocket relay for live ride location
│       └── util.js       PIN hashing, tokens, rate limiting, auth guards
├── docs/                 PRIVACY.md, ARCHITECTURE.md, RESEARCH.md
└── ROADMAP.md            what's built, what's next
```

## License

MIT — see [`LICENSE`](LICENSE). Use it, fork it, run it for your church.

## Contributing

This is a small, deliberately simple project. Before opening a PR, check
[`ROADMAP.md`](ROADMAP.md) to see what phase we're in and whether your idea
fits — new features that add tracking, ratings, or payments are out of
scope by design (see "Explicitly out of scope" in the roadmap). Bug fixes
and Phase 2/3 items are welcome.
