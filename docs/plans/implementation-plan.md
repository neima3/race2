# RACE2 — Implementation Plan

Execute phases in order. Verification gates: `npm run typecheck`, `npm run build`, then browser QA.

## Phase 1 — Scaffold + engine core
- Vite + TS strict, three dependency. index.html, styles.
- core/loop: fixed 120 Hz sim + render interp. core/input: unified InputState from keyboard + gamepad + touch. core/save: localStorage wrapper. core/audio: procedural engine + SFX.
- main.ts bootstrap with placeholder spinning scene to verify pipeline.
- Gate: typecheck + build + page renders.

## Phase 2 — Physics + track system
- track/curve.ts: Catmull-Rom centerline → frames w/ banking. track-query: nearest-frame walk.
- physics/car.ts: arcade car per design (ground snap, align-to-normal, grip/drift, boost, edge clamp).
- Gate: debug car drives along a test spline, loop traversal stable.

## Phase 3 — Rendering
- render/scene (ACES, fog, resize), environment (sky shader, sun, mesas, clouds, ground), car-model (low-poly), track-mesh (asphalt, stripes, walls, pads, arches), particles, chase/hood cams.
- Gate: golden-hour scene looks great, 60 fps desktop.

## Phase 4 — Content + game systems
- 4 track defs w/ features (boosts, jumps, loop, corkscrew). race controller: countdown, timer, checkpoints, respawn, finish. medals, ghost record/playback, save integration.
- Gate: all 4 tracks finishable, medals + ghosts persist.

## Phase 5 — UI/UX
- HUD (timer, speed, splits, medal), menus (title, tracks, settings, pause, finish), touch controls, control remap-free presets, PWA manifest.
- Gate: full flow keyboard + touch + gamepad.

## Phase 6 — QA (subagents, real browser)
- Desktop run-through all tracks; mobile-viewport touch session; gamepad CDP injection; 10-min soak; fix findings.

## Phase 7 — Deploy + live verify
- Dockerfile/nginx, GitHub repo push, Coolify deploy, live URL verification + final QA on production.

## STATUS — SHIPPED 2026-09-10
All phases complete. Live: https://race2.neima.me (Coolify app `race2`, uuid qgpdmafn677kx6aoiahrlfyy, project nnGames Portal, server localhost on cool.neima.me).
Repo: https://github.com/neima3/race2 (public — required for Coolify clone; repo had no secrets).
QA: 26/26 soak laps (14.5 min), desktop/mobile/gamepad input verified, 4/4 tracks completable, autopilot baselines: T1 17.3s / T2 28.9s / T3 21.7s / T4 26.9–28.4s.
Known follow-ups: per-repo deploy key + private repo (blocked by Coolify API whitelist on private_key_id — set via UI if desired), favicon HUD spacing on very small landscape phones.
