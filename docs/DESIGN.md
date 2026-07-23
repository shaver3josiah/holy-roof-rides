# Design

This is the design bible for **Holey Lift** — the user-facing brand for the
app built on the Holy Roof Rides codebase. It's condensed from the fuller
Holey Lift Design System; the canonical token source is
[`app/src/theme.ts`](../app/src/theme.ts) — read that first if a value here
and the code ever disagree, the code wins.

## Naming layer

**Holey Lift** is the brand members see: app name, splash screen, store
listing, copy. The **codebase, repo, server package, and bundle/app IDs stay
`holy-roof-rides`** — that's the open-source project name and doesn't change
when a church re-skins or forks it. Don't rename directories, npm package
names, or identifiers to match the brand; the brand lives in UI strings and
assets, not in code.

## Brand story

The name is a three-way pun that drives the whole brand:

- **Holy** — it's a church app.
- **Holey** — the saw-cut hole in the logo intro (a cartoon hand saws a
  circle, the camera dives *through the hole*, the coin is revealed).
- **Lift** — a ride, and lifting one another up. The mark's flying carpet is
  carried by four pairs of hands on a rope — community carrying each other
  to their destination, no wings.

The mark is an **epic coin**: a Greek meander border (the classic Greek key,
which doubles as a winding road/route motif) framing a sunburst behind that
flying carpet. `HOLEY LIFT` arcs across the top; `MEMBER · SUPPORTED ·
CHURCH · RIDES` runs along the bottom. It's an original v1 — the source app
ships no logo, only emoji — treat it as a first draft to refine.

There are no fares, tips, or ratings. This is ministry, not a taxi business,
and every design decision should point toward *getting somewhere and feeling
connected*, never toward maximizing time-in-app.

## Palette — "stained glass"

Deep slate blue and warm gold on warm white, with hairline warm-gray
borders. Earthy, reverent, welcoming — never cold or corporate. Max two
background colors in any screen: warm-white page and white cards. Anchors
below are copied verbatim from `theme.ts`; every other shade in that file is
a ramp step derived from these.

| Role | Token | Hex |
|---|---|---|
| Primary (buttons, links, active) | `slate700` | `#2E3A59` |
| Strongest ink (headings) | `slate900` | `#1F2A44` |
| Accent (DEACON badge, driver car) | `gold500` | `#D9A441` |
| Page background | `warm50` | `#FAF7F2` |
| Cards | `white` | `#FFFFFF` |
| Hairline border | `warm200` | `#E5E0D8` |
| Body text | `ink900` | `#232323` |
| Muted text | `ink500` | `#6B7280` |
| Danger (terracotta) | `danger600` | `#B3462E` |
| Danger surface | `danger100` | `#FBEAE5` |
| Success (sage) | `success600` | `#3E7C4F` |
| Success surface | `success100` | `#E7F3EA` |
| Notice surface | `gold100` | `#FCEFD8` |

No gradients, no photographic hero imagery in-app — the OpenStreetMap map
*is* the canvas. Member profiles are the one place for warm, personal
photography (opt-in photo, bio, testimony).

## Type

- **Display** — Bricolage Grotesque (warm, characterful): brand, hero,
  headings.
- **UI/body** — Plus Jakarta Sans (clean, friendly, legible): everything
  else.
- **Mono** — Space Mono: invite codes, PINs, server URLs — always tracked
  wide, never any other content.

The source app itself renders in the platform system font; these three faces
are the chosen brand direction layered on top (see `Substitutions` in the
full design system).

Scale is size- and weight-driven, from `theme.ts`'s `type` tokens:

| Style | Size / line-height | Weight |
|---|---|---|
| h1 | 26 / ~30 | 700 (Bricolage) |
| h2 | 19 / ~25 | 600 (Jakarta SemiBold) |
| body | 16 / 24 | 400 |
| muted | 14 / 21 | 400 |
| helper | 13 | 400 |
| invite-code hero | 32, letter-spacing 3.8 | 700 (Space Mono) |
| badge (xs) | 12 | — |

Never pair a custom face with a `fontWeight` style — on Android the custom
face silently drops and falls back to system font. Each entry in `fonts` is
already a specific loaded weight.

## Spacing, radius, motion

**Spacing** — a 4/8 rhythm: `4 · 8 · 12 · 16 · 24 · 32 · 48` (`xs s m l xl
xxl` in `theme.ts`). Inputs use a literal 12px vertical pad.

**Corner radii** — `4` tiny · `8` inputs/buttons · `12` cards & map insets ·
`20` large · `999` pills/toggles/badges.

**Motion** — calm and rare, never attention-grabbing:
- `fast` 120ms, `base` 200ms, `slow` 300ms for ordinary transitions and map
  recenters.
- The one signature animation: a slow opacity **"breath" pulse** on the
  waiting card — `1 → 0.4 → 1`, 900ms each direction.
- Modals fade + rise gently. No spring, no bounce. Respect
  `prefers-reduced-motion`.
- Interaction states: hover darkens primary toward `slate800` or washes
  secondary with `slate100` (web-only); press = 1px nudge down; busy/disabled
  dampen to ~0.5–0.6 opacity; focus = a soft gold ring.

## Elevation — flat, on purpose

The app is **flat**: elevation is a single **1px hairline border**
(`colors.border`, `#E5E0D8`) on a white card over the warm-white page —
**no shadows in-product, ever**. If you're reaching for a `boxShadow` /
`elevation` prop on an in-app screen, that's the tell to stop and use a
hairline border instead. (Soft shadow tokens may exist for web/marketing
materials outside the app — never inside it.)

## Iconography

The source app has **no icon set** — it uses emoji as icons (⛪ 🚗 🧭 ⚠️ 📞
⚙️ 👋 🙋 🙌 ✅) plus native map pins. The design system standardizes UI
chrome on **[Lucide](https://lucide.dev)** (ISC-licensed, rounded line
caps), inheriting `currentColor`. Names in use:

`map-pin` · `navigation` · `car-front` · `church` · `hand-heart` ·
`shield-check` · `users-round` · `user-round` · `user-check` · `phone` ·
`settings` · `search` · `clock` · `triangle-alert` · `heart-handshake` ·
`check` · `chevron-right` · `plus` · `camera` · `info` · `circle-check` ·
`bell-ring` · `share-2`

Emoji may still appear as a warm aside in copy, matching the source voice,
but never as primary UI iconography. Never hand-roll icon SVGs — use a
Lucide name, or add a real asset.

## Content fundamentals — how Holey Lift writes

The voice is **pastoral, plain-spoken, and reassuring** — a trusted
neighbor, never a growth-hacking app.

- **Person.** Warm **"we"** (the app/church) speaking to **"you/your"** (the
  member). "**We'll** let **you** know as soon as someone can take **you**."
- **Case.** Sentence case everywhere. Titles are short and human ("Almost
  there", "Where do you need to go?"), never ALL-CAPS except the tiny
  `DEACON` badge.
- **Contractions & warmth.** Always ("We'll", "don't", "you're"). Em-dashes
  and gentle ellipses set a calm pace ("Asking the congregation…").
- **Ministry vocabulary.** *Congregation, deacon, member, church* — not
  driver-partner, rider, customer, fare.
- **Reassurance is a throughline**, especially about privacy: "We never
  store your rides, locations, or ride history." Empty states comfort
  rather than nag: "No safety reports have been filed. That's good news." ·
  "No one needs a ride right now 🙌 — Pull down to check again."
- **Non-manipulative.** Copy points people *toward a destination and each
  other*, never toward staying in the app. No streaks, no upsells, no
  urgency.
- **Emoji.** Sparingly and warmly, matching the source (⛪ 🚗 🙌 👋). Prefer
  proper icons in UI chrome; reserve emoji for the occasional friendly
  aside. Never decorative-heavy.

Representative lines to match:

> "Rides to church, from people you already trust."
> "Take me to Church"
> "This goes straight to the deacons. Tell them what happened — only share
> what's needed."
> "Your driver had to step away — we're asking the congregation again."

When writing new copy, hold it against these lines before shipping it — if
it sounds like an app trying to keep you engaged rather than a neighbor
trying to help you get somewhere, rewrite it.
