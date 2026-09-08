# RACE2 — Agent Notes

## Commands
- `npm run dev` — Vite dev server (default port 5173)
- `npm run build` — production build → `dist/`
- `npm run typecheck` — `tsc --noEmit` (strict; run before committing)
- `node scripts/make-icons.mjs` — regenerate PWA icons

## Architecture (src/)
- `core/` — loop, input (keyboard/gamepad/touch + test hooks), save (localStorage), audio (all procedural WebAudio), events
- `track/curve.ts` — Catmull-Rom centerline → parallel-transport frames w/ banking; `surfaceQuery` is the physics ground truth
- `track/defs.ts` — the 4 tracks (control points, widths, banks, checkpoints, boosts, medal times)
- `track/builder.ts` — road/skirt/stripe/gate/pad mesh generation
- `physics/car.ts` — arcade car: yaw-rate steering capped by lateral-g budget (38 m/s²), grip/drift, boost, wall scrub, align-to-frame (loops/banks work because the car snaps to the road frame)
- `game/race.ts` — countdown/timer/checkpoints/finish/ghost record+serialize; finish requires real progress (>92% track) to block line-crossing exploits
- `render/` — environment (sky shader, mesas), car model, particles, camera rig
- `ui/` — HUD, menus, touch controls; DOM only, no framework

## Conventions gotchas
- three.js car local +x is the car's LEFT; basis matrices must be `(normal×tangent, normal, tangent)` — improper (mirrored) matrices silently produce garbage quaternions
- `binormal = tangent × normal` = road RIGHT; lateral positive = right
- Sim runs fixed 120 Hz; dt clamped to [0, 0.25] (RAF/performance.now drift after reloads)
- Binormal/lateral sign flips are the #1 regression risk — verify steering direction after touching curve.ts/car.ts

## QA hooks (window.__race2)
`start(i)`, `auto(bool)` (pure-pursuit autopilot), `drive({steer,throttle,brake,drift})`, `state()` telemetry, `skipCountdown()`, `respawn()`, `mute()`. URL: `?mute=1`, `?touch=1`. Audio auto-mutes under `navigator.webdriver`.

## Known QA baselines (autopilot, mute=1)
Track laps: T1 ≈ 17.5s, T2 ≈ 30.8s, T3 ≈ 21.7s, T4 ≈ 28.4s. Medal times in defs.ts are calibrated to these.

## Deploy
Static build in Docker (nginx) → Coolify `cool.neima.me` → race2.neima.me. Verify live with `?mute=1` + autopilot.
