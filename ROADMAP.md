# Holy Roof Rides — Roadmap

Open-source ridesharing for churches. Members give and receive rides inside a
trusted, deacon-approved community. Privacy by architecture: live locations and
rides exist only in server memory and are gone when the ride ends.

## Guiding constraints

- **Trust boundary is the church.** Every member is invited (invite code) and
  approved by a deacon before they can see or be seen by anyone.
- **Data minimization.** Persisted data is only: member name + phone, invite
  codes, safety reports, and login sessions. No ride history, no location
  trails, no analytics.
- **Self-hostable.** One small Node server + SQLite file. A church can run it
  on a $5 VPS or a closet PC.
- **Open source maps.** OpenStreetMap tiles; no Google/Apple map dependency.

## Phase 0 — Foundations (this build)

- [x] Monorepo scaffold: `app/` (Expo React Native, TypeScript) + `server/`
      (Node 22+, Fastify, built-in `node:sqlite`)
- [x] Research report expanding the ride-sharing landscape study (`docs/RESEARCH.md`)
- [x] Architecture + privacy documentation

## Phase 1 — MVP (v0.1)

**Membership & auth**
- [x] Join with invite code → name + phone → set PIN → *pending* until approved
- [x] Deacon approval queue; first user to join with the bootstrap code becomes
      the founding deacon
- [x] PIN login (server-side scrypt hash, rate limited), session tokens

**Rides**
- [x] "Receiving Rides" default view: map (OSM), request a ride
      (pickup = current location, destination = map pin)
- [x] "Give a Ride" mode via toggle: see open requests, accept one
- [x] Live driver location during an active ride only (WebSocket, in-memory,
      relayed rider↔driver, never stored)
- [x] Complete / cancel ride → all trace of it evaporates

**Settings**
- [x] "Stay in Give a Ride mode" — app reopens in driver mode
- [x] Server URL setting (self-hosted deployments)

**Admin (deacons)**
- [x] Approve / reject pending members
- [x] Generate + revoke invite codes
- [x] Safety reports: any member can file; deacons triage
- [x] Member directory with contact info

**Release**
- [x] GitHub Actions: Android APK on every tag
- [x] iOS TestFlight path from Windows (EAS Build — no Mac required), documented
- [x] Public GitHub repo, MIT license

## Phase 2 — Beta (v0.2)

- [ ] Push notifications (ride requested / accepted / arriving) via Expo Push
- [ ] Scheduled rides ("I need a ride to Sunday 10am service")
- [ ] Ride notes & seat count (family of 4, wheelchair space)
- [ ] Vector tiles via MapLibre (replaces raster OSM tiles; self-hostable styles)
- [ ] Multi-congregation support (one server, several churches)

## Phase 3 — v1.0

- [ ] Recurring ride commitments (drivers "adopt" a rider for a season)
- [ ] Simple pooling (one driver, several riders on one loop)
- [ ] Accessibility pass (large-text, screen reader, high contrast)
- [ ] App Store / Play Store public releases
- [ ] Translated UI (Spanish first)

## Explicitly out of scope

Payments, fares, tips (this is ministry, not gig work) · ratings/scores ·
background location · analytics/telemetry · any third-party data sharing.
