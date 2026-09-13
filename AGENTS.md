# RACE2 — Agent Notes

## Commands
- `npm run dev` — Vite dev server (default port 5173)
- `npm run build` — production build → `dist/`
- `npm run typecheck` — `tsc --noEmit` (strict; run before committing)
- `node scripts/make-icons.mjs` — regenerate PWA icons
- `npx tsx test/laps.ts` — headless time-trial harness (9/12+; canyon-twist, grand-gauntlet, gauntlet-ii are STRICT-exempt)
- `npx tsx test/rivals.ts` — headless rival-race gate (20 checks: steering sign, lateral sign, 2-lap races on sunrise-sprint + dune-rush, slow-mo accumulator integrity, rubber-band gap <120m)
- `npx tsx test/career.ts` — career gate (109 checks incl. difficulty-curve pins: street cup = autopilot silver, never P4; roster-capacity guard on cup tier mixes; rival-era stats migration)
- `npx tsx test/share.ts` — ghost-share codec gate (34 checks)

## Architecture (src/)
- `core/` — loop, input (keyboard/gamepad/touch + test hooks), save (localStorage), audio (all procedural WebAudio), events
- `track/curve.ts` — Catmull-Rom centerline → parallel-transport frames w/ banking; `surfaceQuery` is the physics ground truth
- `track/defs.ts` — the 4 tracks (control points, widths, banks, checkpoints, boosts, medal times)
- `track/builder.ts` — road/skirt/stripe/gate/pad mesh generation
- `physics/car.ts` — arcade car: yaw-rate steering capped by lateral-g budget (38 m/s²), grip/drift, boost, wall scrub, align-to-frame (loops/banks work because the car snaps to the road frame); `placeAt(dist, lateral)` = grid/respawn placement via road frame
- `game/race.ts` — countdown/timer/checkpoints/finish/ghost record+serialize; finish requires real progress (>92% track) per lap; multi-lap via `opts {laps, writesRecords}` (time-trial = defaults); wrap-safe progress `totalProgress = (lapOffset + lapsDone) * len + dist` (lapOffset = −1 when starting past 50% of track)
- `game/rules.ts` — shared per-car surface rules (boost pads, slick zones, mover overlap) used by both player and rivals
- `game/rivals.ts` — `RivalManager`: 3 AI rivals (easy/mid/pro tiers = CarPhysics tuning deltas + autopilot skill {pace, lookaheadJitter, steerNoise, lookaheadScale}), grid start (player P4), rubber band (±8%, 10m dead zone), stuck respawn, per-car boost/slick/mover rules, standings with finish-rank classification. Tier params (v2.0 balance): easy pace .94/ls 1.3, mid .955/ls 1.3, pro 1.0/ls 1.15 + pro tuning {accel 1.05, maxSpeed 1.025}
- `game/career.ts` — 3 cups: SPRINT (easy+easy+mid, forgiving), STREET (mid+pro+pro, medium — autopilot lands silver), GAUNTLET (pro+pro+mid, spicy); cup tier mixes are roster-capacity-guarded (pro roster = 2, a third pro slot would duplicate APEX)
- `game/achievements.ts` — rival-era achievement state + pop detection (FIRST BLOOD, CUP CADET, TRIPLE CROWN, SOCIAL CLIMBER, FULL HOUSE); stats live in lifetime `rivalWins`/`friendGhostRaces`/`rivalsBeaten` (additive save fields)
- `systems/autopilot.ts` — pure-pursuit + curvature lookahead; optional `skill` param for rivals (identical behavior when omitted)
- `render/` — environment (sky shader, mesas), car model, particles, camera rig
- `ui/` — HUD, menus, touch controls; DOM only, no framework

## Conventions gotchas
- three.js car local +x is the car's LEFT; basis matrices must be `(normal×tangent, normal, tangent)` — improper (mirrored) matrices silently produce garbage quaternions
- `binormal = tangent × normal` = road RIGHT; lateral positive = right
- Sim runs fixed 120 Hz; dt clamped to [0, 0.25] (RAF/performance.now drift after reloads)
- Binormal/lateral sign flips are the #1 regression risk — verify steering direction after touching curve.ts/car.ts

## QA hooks (window.__race2)
`start(i, rivals?)`, `auto(bool)` (pure-pursuit autopilot), `drive({steer,throttle,brake,drift})`, `state()` telemetry, `skipCountdown()`, `respawn()`, `mute()`, `rivals()` (per-rival telemetry), `standings()` (live order). URL: `?mute=1`, `?touch=1`. Audio auto-mutes under `navigator.webdriver`.

## Known QA baselines (autopilot, mute=1)
Track laps: T1 ≈ 17.5s, T2 ≈ 30.8s, T3 ≈ 21.7s, T4 ≈ 28.4s. Medal times in defs.ts are calibrated to these.

## Deploy
Static build in Docker (nginx) → Coolify `cool.neima.me` → race2.neima.me. Verify live with `?mute=1` + autopilot.
