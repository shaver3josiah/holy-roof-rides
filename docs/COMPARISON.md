# Holy Roof Rides vs. Uber vs. Lyft

## Why compare at all

Holy Roof Rides and Uber/Lyft are different species, not competitors. Uber
and Lyft are commercial marketplaces: they price a stranger's time and car
by the minute and mile, run 24/7 across every city they operate in, and
answer to shareholders for take rate and growth. Holy Roof Rides is a trust
network for one congregation: it moves people who already know each other,
costs nothing, and only works as far as the church's own volunteers reach.
Nobody is choosing between them — a member without a car on a Tuesday
afternoon might use both in the same week. This document isn't about who
wins; it's about what a decade of Uber/Lyft product iteration got right that
a small church app can learn from, what it got right that we deliberately
walked away from, and where their scale genuinely does something we can't
(and shouldn't try to).

## Feature matrix

| | Uber | Lyft | Holy Roof Rides |
|---|---|---|---|
| **Destination entry** | "Where to?" search box front-loads the trip; Saved Places + algorithmically-ranked "shortcuts" surface likely destinations by time of day [1][2][3] | Opens on "Set pickup" (current location) first; destination needs a second tap on "Add destination"/"Set destination" — criticized as a learnability tax vs. the where-to convention [42][43][44] | "Where do you need to go?" search box (debounced Nominatim address search biased near you), recent-destination chips (device-local), a one-tap "⛪ Take me to Church" button, or long-press a pin on the map; a route preview with distance + ETA appears before you confirm (`app/src/screens/RiderScreen.tsx`, `app/src/geo.ts`) |
| **Price** | Upfront fixed price + route preview before requesting, from ETA/demand/tolls/surcharges; national avg. ~$0.97/mi + $0.32/min ($15–22 for 5 mi); under 2026 "surveillance pricing" scrutiny [4][5][46][58][59][60] | Upfront fare shown pre-confirm; ~$1.15–1.20/mi, 5–9% cheaper than Uber on comparable routes; Price Lock ($2.99/mo) caps a commute fare, Wait & Save trades wait time for a lower quote [26][27][28][47][48] | None. No fares, tips, or payments exist anywhere in the app — a ride costs a member nothing |
| **Matching** | Pulsing radar-style animation while searching nearby drivers — deliberate system-status feedback, not just decoration [1][23][24][25] | Similar post-destination matching; Women+ Connect lets women/nonbinary riders and drivers opt into preferring each other (not exclusive routing) [29][30] | Request broadcasts to every member currently in "Give a Ride" mode; rider sees an "Asking the congregation…" card, first driver to accept gets it (`RiderScreen.tsx`, `DriverScreen.tsx`, `server/src/rides.js`) |
| **Live tracking & ETA** | Persistent driver card (photo, name, star rating, vehicle, partial plate) + live ETA countdown through assigned → arriving → on-trip [1][19] | Accurate real-time tracking, well-reviewed; Amp/Glow beacon adds a physical color-coded light for visual ID in the dark [31][32][42] | Driver location relayed rider↔driver over WebSocket only while a ride is active — name, live car marker, and an OSRM-computed "about N min away" ETA (refreshed at most every 20s, haversine fallback); no vehicle/plate collected at all (`server/src/live.js`, `RiderScreen.tsx`, `app/src/geo.ts`) |
| **Ride stages** | Strict state machine (assigned → arriving → on-trip); swipe-to-confirm gestures at pickup/drop-off guard against accidental taps [1][18][19] | Comparable stage progression, plus airport/venue pickup-queue guidance for drivers [39][41] | `open` → `accepted` (driver on the way) → `picked_up` (in the car) → gone, driven by WebSocket events (`ride_accepted`, `ride_picked_up`, `driver_location`, `ride_ended`, `ride_reopened`); plain tap-to-confirm buttons, not swipe (`RiderScreen.tsx`, `DriverScreen.tsx`, `server/src/rides.js`) |
| **Driver vetting** | Checkr-class MVR + criminal-database + National Sex Offender Registry + sanctions/terror-watchlist check, 3–10 day turnaround, annual rerun plus continuous monitoring [49][50] | Same class of third-party vendor pipeline [49][50] | A deacon personally reviews and approves every joining member (invite code required just to apply); no automated background-check integration (`AdminScreen.tsx` Approvals tab, `server/src/admin.js`) |
| **Safety tools** | PIN verification (opt-in), Share Trip Status, RideCheck GPS-anomaly detection, 911 emergency button, silent audio recording [6][7][8][9][10][11] | Smart Trip Check-in with ADT — anomaly monitoring plus a silent connect to ADT/authorities [33][34] | "Report a concern" button live during any ride, goes straight to the deacon safety-report queue for triage — human-to-human, not GPS-triggered (`RiderScreen.tsx`, `DriverScreen.tsx`, `AdminScreen.tsx` Reports tab) |
| **Privacy / data retention** | Continuous location tracking, including between trips; retains data "as long as needed," no fully specified window; discloses to law enforcement when legally compelled [53][54][57] | Requires a subpoena for records, a search warrant specifically for GPS location; states it does not sell data or act as a data broker [55][56] | No ride or location history exists anywhere — there is no `rides` table in the database at all. Live GPS lives only in server RAM during an active ride, never written to disk (`docs/PRIVACY.md`, `server/src/state.js`) |
| **Payments** | In-app card/wallet; driver-facing service fee ~20–25%; Q4 2025 Mobility take rate 29.9% [62] | Driver fee capped at 30%/mo, effective avg. ~14% [45]; revenue/gross-bookings ~34.7% Q1 2026 [61] | None — no fares, tips, or take rate of any kind |
| **Scheduled rides** | Reserve — book up to a week ahead, guaranteed fare shown before acceptance, driver online ~40 min pre-pickup [20][21][22] | Bookable up to 90 days ahead incl. flight-based airport scheduling; on-time pickup promise ($15 credit if 10+ min late, $50 if unmatched) [37][38] | Not built yet — a named Phase 2 roadmap item ("I need a ride to Sunday 10am service") (`ROADMAP.md`) |
| **Accessibility** | Uber/Lyft WAV for wheelchair access; Uber Health for Medicare Advantage-covered medical rides [63] | WAV ride type in major markets (LA, NYC, Chicago, SF, Boston, Philadelphia); Lyft Assisted for door-to-door help without needing a WAV [35][36] | No dedicated ride type yet; a free-text note field lets a rider mention a need (e.g. wheelchair space) (`RiderScreen.tsx`). A formal accessibility pass (large-text, screen reader, high contrast) is a named Phase 3 item (`ROADMAP.md`) |
| **Cost to operate** | Venture-scale marketplace business funding a large engineering/ops/legal org across every operating city | Same, at Lyft's scale | One small Node/Fastify server + one SQLite file; a $5/month VPS or a spare closet PC is enough (`README.md`) |

## What we borrowed

Uber and Lyft have spent a decade of user research on exactly the problem
Holy Roof Rides also has — "get a rider and a driver to trust each other and
find each other with the fewest taps." A few of their patterns showed up
directly in this build:

- **Destination-first over pickup-first.** UX reviewers single out Lyft's
  pickup-first flow as a friction tax precisely because it breaks the
  "where to?" convention every other map app trained users on [42][43][44].
  We follow the "where to?" convention directly: the Rider screen opens on
  the map with a search box as the first control — type an address
  (debounced Nominatim search biased near you), tap a recent destination
  chip, hit the one-tap "⛪ Take me to Church" button, or long-press the map
  to drop a pin. Then a route preview with distance and ETA appears before
  you commit (`app/src/screens/RiderScreen.tsx`, `app/src/geo.ts`).
- **Staged trip progress.** Uber's assigned → arriving → on-trip state
  machine exists because a silent screen between "I requested a ride" and
  "someone showed up" is where trust breaks down [1][19][23]. We borrowed
  the shape of that directly: an `open` request becomes `accepted` the
  moment a member taps "Accept" (the rider immediately sees the driver's
  name, a live car marker, and an ETA), the driver taps "{rider} is in the
  car" to move it to `picked_up` (the rider's map swings to the
  destination), and both sides get a clean end state — `completed` or
  `cancelled` — pushed over the same WebSocket (`RiderScreen.tsx`,
  `DriverScreen.tsx`, `server/src/rides.js`, `server/src/live.js`).
- **A driver's request list shows distance, not just a name.** Uber's
  driver-side trip card leads with pickup distance/ETA before the driver
  decides to accept [15][16][17]. `DriverScreen.tsx` does the same thing
  with a plain haversine distance ("2.3 mi away") sorted nearest-first — no
  route engine needed for that part.
- **In-trip safety reporting, one tap away.** Uber's Safety Toolkit and
  Lyft's ADT check-in both exist so a rider or driver never has to leave the
  trip screen to flag a problem [9][10][11][33][34]. We kept the *access
  point* — a persistent "⚠️ Report a concern" button on both the Rider and
  Driver screens — and simplified the *destination*: it goes to a deacon's
  triage queue, not a GPS-anomaly algorithm or a third-party monitoring
  vendor (`RiderScreen.tsx`, `DriverScreen.tsx`, `server/src/admin.js`,
  `AdminScreen.tsx` Reports tab).
- **Keep the driver oriented toward the next stop without leaving the app.**
  Uber's "Navigate" button hands the driver off to Google Maps, Waze, or
  Apple Maps at each leg of the trip [12][13][14]; Lyft went the other way
  and built its own in-house map for the same reason — drivers shouldn't
  have to juggle apps mid-trip [39][40][41]. We took Uber's approach: the
  in-app map draws the OSRM route line to the current leg (pickup, then
  destination) so the driver stays oriented, and a "🧭 Navigate" button
  hands off to the phone's own maps app (Apple Maps / Google Maps) for real
  turn-by-turn (`DriverScreen.tsx`, `OsmMap.tsx`, `app/src/geo.ts`).
  Building an in-house nav stack like Lyft's is exactly the kind of thing a
  volunteer church app should never do.

## What we deliberately don't do

- **Surge pricing.** There's no price at all, so there's nothing to surge.
  A ride is a favor between church members, not a transaction with a
  market-clearing rate.
- **Ratings.** No stars, no scores, on either side. Deacon approval is
  already the trust gate — rating a fellow member like an anonymous Uber
  driver would replace a relationship with a number.
- **In-app payments.** No card on file, no fares, no tips, ever. Turning a
  diaconal act into a paid transaction is exactly the thing this app exists
  to avoid (see README: "This is ministry, not a taxi business").
- **Gig economics.** No take rate, no acceptance-rate quotas, no earnings
  dashboards, no incentive engineering. Nobody's income depends on this
  app, so there's nothing here to optimize or coerce.
- **Data retention.** No ride history, no location trail, no analytics or
  telemetry — there isn't even a `rides` table in the database. "We don't
  have that data" is true by construction, not a policy promise resting on
  good behavior with data we chose to keep (`docs/PRIVACY.md`).

## Where Uber and Lyft are honestly better

- **Routing and navigation quality.** Lyft built its own in-house maps
  stack and reports 98% of drivers who try it stick with it; Uber hands
  drivers off to Google Maps, Waze, or Apple Maps on request
  [12][13][39][41]. Holy Roof Rides draws OSRM route lines on OSM raster
  tiles and, like Uber, hands turn-by-turn off to the phone's own maps app
  via the driver's "🧭 Navigate" button — but there's no in-app voice
  guidance, live-traffic rerouting, or lane-level detail. *What a church
  should do:* nothing urgent — the handoff covers real navigation, and
  vector tiles via MapLibre are a named Phase 2 item (`ROADMAP.md`). This
  isn't a safety gap, just a polish gap.
- **24/7 liquidity.** Uber and Lyft have thousands of drivers online in any
  city at any hour. Holy Roof Rides only has as many drivers as happen to
  be in "Give a Ride" mode from one congregation at that moment. *What a
  church should do:* this isn't solvable in-app — it's a recruiting and
  scheduling problem. Lean on the Phase 2/3 roadmap items (scheduled
  rides, recurring "adopt a rider" commitments) to guarantee coverage for
  known-need windows like Sunday service, rather than promising
  anytime-anywhere like a commercial fleet can.
- **Insurance frameworks.** Uber/Lyft carry structured, phase-based
  commercial coverage: Period 1 (app on, no ride accepted) is a thin
  $50k/$100k/$25k third-party-liability-only window; Periods 2 (en route to
  pickup) and 3 (passenger aboard) carry up to $1M in third-party liability
  plus contingent collision/comprehensive (actual cash value, $2,500
  deductible) [51]. California's SB 371, effective January 1, 2026, cut the
  mandatory uninsured/underinsured-motorist coverage required during Period
  3 from $1M to the state minimum — roughly a 94% reduction [52]. Holy Roof
  Rides has *zero* built-in insurance of any kind: a volunteer's personal
  auto policy is primary and can be denied as "business use" without a
  Hired and Non-Owned Auto (HNOA) rider. *What a church should do:* this is
  explicitly a church-policy job, not an app feature — see the Practical
  Checklist in `docs/RESEARCH.md` (§ Privacy & Safeguarding), which
  recommends requiring HNOA + an umbrella policy before anyone drives, and
  having the app surface a one-time acknowledgment pointing volunteers to
  the church's insurance requirement rather than implying it provides any
  coverage itself.
- **Formal background checks.** Uber and Lyft both run a Checkr-class MVR
  check plus a criminal-history search across local/state/national
  databases, the National Sex Offender Public Website, and
  sanctions/terror watchlists, with 3–10 day turnaround and Uber rerunning
  annually with continuous monitoring in between [49][50]. Holy Roof Rides
  has no automated screening pipeline at all — deacon approval is a human
  judgment call. *What a church should do:* again, per the
  `docs/RESEARCH.md` checklist — require a deacon sign-off gate that
  references an *offline* Checkr/MVR check before marking a driver
  "approved" in the Admin panel, and encode a hard two-adult/minor-ride
  safeguard with deacon-recorded consent rather than relying on the honor
  system. The app can enforce the gate; it can't run the check.

## The gap we fill

Uber and Lyft's own research on senior and low-income riders names the real
barriers plainly: smartphone/app literacy, a mandatory card on file, and
trust in an unknown driver [63][64][65] — gaps real enough that whole
bolt-on services (GoGoGrandparent, Arrive) exist just to convert a phone
call into an app-booked ride. Faith-based volunteer-driver programs solve
the trust and cost problems but are usually phone-scheduled days in advance
and limited to specific purposes like medical appointments [65]. Holy Roof
Rides tries to sit in the gap between those two: it keeps the immediacy of
an app — open it, drop a pin, get a ride — without the two things that
actually keep vulnerable members off Uber and Lyft:

- **No payment barrier, ever.** No card on file, no fare, no tip — not a
  discount, an absence. Average U.S. rideshare fares climbed from $21.58 to
  $23.66 in 2025 and toward roughly $26 in 2026 [46][47]; that's real money
  for someone on a fixed income or living paycheck to paycheck.
- **Known drivers, not vetted strangers.** The trust barrier for a lot of
  seniors isn't paperwork — it's "I don't know this person." Every driver
  in Holy Roof Rides is a deacon-approved member of the same congregation,
  not a stranger whose only credential is a passed background check.
- **A UI small enough to trust.** One map, one long-press, one button to
  request a ride — closer to what a member who's never used a rideshare
  app can manage on their own, with a deacon a phone call away if they
  can't.

## Sources

**Uber rider/driver UX**
1. [The redesigned Uber app](https://www.uber.com/us/en/u/redesigned-uber-app/)
2. [How to Save Destinations | Uber Rider App](https://www.uber.com/us/en/ride/how-it-works/saved-places/)
3. [Where to? | Uber Newsroom](https://www.uber.com/newsroom/newriderapp/)
4. [Ride Prices and Rates - How It Works | Uber](https://www.uber.com/us/en/ride/how-it-works/upfront-pricing/)
5. [More transparency with Upfront Fares](https://www.uber.com/us/en/blog/all-new-upfront-fares/)
6. [What's Verify my Ride? | Riders | Uber Help](https://help.uber.com/riders/article/whats-verify-my-ride/?nodeId=2ddbb5e8-0dd3-4048-b9ee-f6b5e5311e25)
7. [For drivers: How PIN verification works](https://www.uber.com/us/en/blog/pin-verification-drivers/)
8. [Understanding and using Ride PINs | Driving & Delivering | Uber Help](https://help.uber.com/en/driving-and-delivering/article/understanding-and-using-ride-pins?nodeId=8e52f7b4-05f4-4535-8912-43bec96d7488)
9. [Added safety on your rides with Audio Recording](https://www.uber.com/us/en/ride/safety/audio-recording/)
10. [Is Uber Safe for Riders? | Uber](https://www.uber.com/us/en/ride/safety/)
11. [Uber's new Safety Toolkit featuring Live Help from a safety agent](https://www.uber.com/newsroom/ubers-new-safety-toolkit/)
12. [Using a third-party navigation app | Driving & Delivering | Uber Help](https://help.uber.com/driving-and-delivering/article/using-a-third-party-navigation-app?nodeId=36a70c53-4bb0-4e17-a044-d91c2d1ff080)
13. [Uber driver app navigation features | Driving & Delivering | Uber Help](https://help.uber.com/en/driving-and-delivering/article/uber-driver-app-navigation-features?nodeId=357c291a-9b6e-45e9-9614-aea820f089ce)
14. [Improving the Driver app (Summer 2024)](https://www.uber.com/us/en/drive/product-updates/summer-2024/)
15. [Getting a trip request | Driving & Delivering | Uber Help](https://help.uber.com/driving-and-delivering/article/getting-a-trip-request?nodeId=e7228ac8-7c7f-4ad6-b120-086d39f2c94c)
16. [Uber Extends Offer-Acceptance Time (Ping) For Drivers](https://therideshareguy.com/uber-extends-offer-acceptance-time-ping-for-drivers/)
17. [Understanding acceptance and cancellation rates | Uber Blog](https://www.uber.com/us/en/blog/understanding-acceptance-and-cancellation-rates/)
18. [How to Take Trips | Driver App | Uber](https://www.uber.com/sa/en/drive/basics/how-to-take-trips/)
19. [Your Ride, Redesigned: Seamless Pickups | Uber Newsroom](https://www.uber.com/us/en/newsroom/seamless-pickups/)
20. [Reserve FAQ | Driving & Delivering | Uber Help](https://help.uber.com/en/driving-and-delivering/article/reserve-faq?nodeId=edd655fe-d600-44bf-97cf-e917fbd6cc72)
21. [What is Uber Reserve? | Riders | Uber Help](https://help.uber.com/en/riders/article/what-is-uber-reserve?nodeId=ce72b9b3-e24c-453d-b770-ef0ac13cba1a)
22. [Uber Reserve Revisited: What's Changed (2025)](https://yourmileagemayvary.com/2025/03/26/uber-reserve-revisited-whats-changed-for-the-better-and-what-hasnt/)
23. [Progress Indicators Make a Slow System Less Insufferable - NN/g](https://www.nngroup.com/articles/progress-indicators/)
24. [Designing for Long Waits and Interruptions - NN/g](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/)
25. [Usability Heuristic 1: Visibility of System Status - NN/g](https://www.nngroup.com/videos/usability-heuristic-system-status/)

**Lyft UX**
26. [Price Lock | Lyft](https://www.lyft.com/rider/commute/pricelock)
27. [Price Lock around the clock - Lyft Blog](https://www.lyft.com/blog/posts/price-lock-around-the-clock)
28. [Lyft rolls out Price Lock to address app's "most hated feature" - CBS News](https://www.cbsnews.com/news/lyft-monthly-membership-surge-pricing/)
29. [Lyft Launches Women+ Connect - Lyft Blog](https://www.lyft.com/blog/posts/women-plus-connect)
30. [Lyft's popular Women+ Connect feature is now available nationwide - Lyft Blog](https://www.lyft.com/blog/posts/lyfts-popular-women-connect-feature-is-now-available-nationwide)
31. [Amp - Lyft Help](https://help.lyft.com/hc/en-us/all/articles/115012925587-Amp)
32. [Lyft shaves the stache for amp - TechCrunch](https://techcrunch.com/2016/11/14/lyft-shaves-the-stache-for-amp-a-color-coded-led-display-to-tell-you-which-ride-is-yours/)
33. [Lyft Launches Emergency Help, Supported by ADT - Lyft Blog](https://www.lyft.com/blog/posts/lyft-launches-emergency-help)
34. [ADT Mobile Safety Powers Lyft's New Emergency Help Feature - ADT Newsroom](https://newsroom.adt.com/corporate-news/adt-mobile-safety-powers-lyfts-new-emergency-help-feature)
35. [Lyft's commitment to accessibility - Lyft Help](https://help.lyft.com/hc/en-us/all/articles/360045782413-Lyft-s-commitment-to-accessibility)
36. [WAV rides - Lyft Help](https://help.lyft.com/hc/lt/articles/115013081668-wav-rides)
37. [Scheduled rides for riders - Lyft Help](https://help.lyft.com/hc/en-us/all/articles/115013078668-Scheduled-rides-for-riders)
38. [Our on-time pickup promise - Lyft Blog](https://www.lyft.com/blog/posts/our-on-time-pickup-promise)
39. [Lyft's secret plan to take control of its maps — and its future - Lyft Blog](https://www.lyft.com/blog/posts/lyfts-secret-plan-to-take-control-of-its-maps-and-its-future)
40. [Lyft "quietly" removes app integration w/ Apple Maps, Waze and Google - Uber Drivers Forum](https://www.uberpeople.net/threads/lyft-%E2%80%9Cquietly%E2%80%9D-removes-app-integration-w-apple-maps-waze-and-google.498170/)
41. [How To Use The Lyft Driver App - Ridester](https://www.ridester.com/topics/lyft-driver-app/)
42. [UX Wars: Lyft vs. Uber - Trymata](https://trymata.com/blog/ux-wars-lyft-vs-uber/)
43. [Lyft: Pretty Bad UX - Lauren Ciulla (Medium)](https://medium.com/@lauren.ciulla/lyft-pretty-bad-ux-be057d28af32)
44. [Showdown of the Rideshare Start-ups: Uber vs. Lyft - UserTesting](https://www.usertesting.com/blog/uber-vs-lyft)

**Business/trust layer, insurance & data**
45. [Lyft: An update for drivers — the Lyft fee is capped every month](https://www.lyft.com/blog/posts/an-update-for-drivers-now-the-lyft-fee-is-capped-every-month)
46. [RideWise: Uber Fare Estimate 2026](https://getridewise.com/blog/uber-fare-calculator-2026)
47. [RideWise: Lyft Price Estimate 2026](https://getridewise.com/blog/how-much-does-lyft-cost)
48. [RideWise: How Much Is Lyft Per Mile? 2026 Rates](https://getridewise.com/blog/how-much-is-lyft-per-mile)
49. [Uber Newsroom: Background Checks and Safety Incident Response](https://www.uber.com/us/en/newsroom/background-checks/)
50. [Gridwise: Uber Background Check Guide](https://gridwise.io/blog/uber-background-check)
51. [Cunningham & Mears: Rideshare Insurance Gaps in 2026](https://www.cunninghamandmears.com/blog/rideshare-insurance-gaps-in-2026-what-happens-when-the-app-is-on-but-no-ride-is-accepted/)
52. [Kubota Craig: Uber & Lyft Accident Claims 2026 Guide (CA SB 371)](https://www.kubotacraig.com/motor-vehicle-accident-articles/uber-lyft-accident-claims-who-pays-california-2026/)
53. [Uber Privacy Notice: Drivers and Delivery People](https://www.uber.com/global/en/privacy-notice-drivers-delivery-people/)
54. [Uber Law Enforcement Data Request Guidelines](https://www.uber.com/legal/data-requests/guidelines-for-law-enforcement-united-states/en-US/)
55. [Lyft's Law Enforcement Support](https://help.lyft.com/hc/e/articles/115012925607-Lyft-s-law-enforcement-support)
56. [Lyft Privacy Policy](https://www.lyft.com/privacy)
57. [The Hill: Uber details law enforcement data requests (2016 report)](https://thehill.com/policy/technology/275976-uber-details-law-enforcement-data-requests-in-new-report/)
58. [Cybernews: US lawmakers probe AI pricing by Uber, Lyft, Expedia](https://cybernews.com/ai-news/victims-surveillance-pricing-demand-answers-uber-lyft/)
59. [Jayapal House.gov: Monopoly Busters Caucus Press Uber and Lyft on AI Surveillance Pricing](https://jayapal.house.gov/2026/06/23/monopoly-busters-caucus-co-chairs-press-uber-and-lyft-following-reports-of-ai-driven-surveillance-pricing/)
60. [House Oversight: Comer Investigates Use of AI to Set Prices](https://oversight.house.gov/release/comer-investigates-use-of-artificial-intelligence-to-set-prices-for-consumers/)
61. [Lyft Q1 2026 Earnings Release](https://investor.lyft.com/news-events-presentations/press-releases/detail/197/lyft-reports-strong-q1-2026-financial-results)
62. [Uber Q1 2026 Results Press Release](https://investor.uber.com/news-events/news/press-release-details/2026/Uber-Announces-Results-for-First-Quarter-2026/default.aspx)
63. [RideWise: Uber & Lyft for Seniors — Complete 2026 Guide](https://getridewise.com/blog/uber-lyft-for-seniors-complete-guide)
64. [GoGoGrandparent: Rideshare Experience for Seniors](https://www.gogograndparent.com/blog/how-to-have-a-great-rideshare-experience-for-seniors)
65. [RHIhub: Ridesharing Models for Rural Transportation](https://www.ruralhealthinfo.org/toolkits/transportation/2/ridesharing-models)

See also [`docs/RESEARCH.md`](RESEARCH.md) for the full research write-ups
behind this comparison, including the safeguarding Practical Checklist
referenced above, and [`docs/PRIVACY.md`](PRIVACY.md) /
[`ROADMAP.md`](../ROADMAP.md) for how Holy Roof Rides itself is built and
where it's headed.
