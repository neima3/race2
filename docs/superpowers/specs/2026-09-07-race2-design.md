# RACE2 — Trackmania-style Arcade Racer: Design

**Date:** 2026-09-07 · **Target:** race2.neima.me (Coolify, public VPS) · **Repo:** github.com/neima3/race2

## Goal
A high-quality, visually impressive, fun Trackmania-style time-trial racer in the browser.
Playable on desktop and mobile with every major input: keyboard, touch, and gamepads
(Xbox/PS/Switch Pro) — including on iOS via the Web Gamepad API.

## Assumptions (autonomy mode — no clarifying questions)
- Single-player time trial (Trackmania's core). No multiplayer/server backend.
- 4 handcrafted tracks, medal times, local leaderboards, ghost replays.
- English UI. No accounts. Saves in localStorage.
- Static hosting (nginx on Coolify). No server runtime needed.

## Tech stack
- **TypeScript + Vite** — fast builds, strict types.
- **Three.js** — WebGL rendering (best iOS/Android support), ACES tonemapping, fog, shadows, optional bloom on high tier.
- **Custom arcade physics** — Trackmania feel cannot come from a rigid-body lib. Fixed 120 Hz steps with a centerline-frame ground model (see Physics).
- **Web Gamepad API** — standard mapping, rumble where available.
- **WebAudio (procedural)** — engine, boosts, chimes, music; zero audio assets.
- **PWA** — manifest + icons for iPhone add-to-home-screen.

## Architecture
```
src/
  main.ts            bootstrap, RAF, resize
  core/    loop, input (kb/gamepad/touch), save, audio, events
  physics/ car body + arcade forces, track surface queries
  track/   spline frames, mesh builder, track definitions, features
  render/  scene, environment, car model, track meshes, particles, ghost, cameras
  game/    race controller, medals, ghost recording
  ui/      HUD, menus, touch controls
```
Fixed-timestep sim (120 Hz) + interpolated render. Tiny event bus for race events.

## Physics (the heart)
- Car = position + quaternion + velocity + yaw rate (arcade), 4-wheel visual suspension.
- Tracks are Catmull-Rom centerline splines with computed frames (tangent/normal/binormal, banking).
- Ground query: nearest frame by cached-u walk + refine. If car within road width → grounded:
  - align car up-vector to frame normal (slerp) → banked turns, loops, corkscrews work naturally;
  - forward accel from throttle, drag, lateral friction (grip), handbrake lowers grip → drift;
  - lateral clamp at road edge (sparks + velocity kill).
- Airborne: ballistic, slight air pitch control, land alignment.
- Boost pads add forward velocity; grass = high drag, low grip.
- Respawn at last checkpoint (Backspace / X / touch button) — Trackmania signature.

## Game flow
Menu → track select (medals, best times) → countdown 3-2-1-GO → race
(checkpoints, live splits vs best) → finish (time, medal, ghost save) → retry / next.
Pause anytime. Ghost of best run races alongside (translucent car).

## Controls
- **Keyboard:** WASD/arrows, Space drift, Backspace respawn, R restart, C camera, Esc pause.
- **Gamepad:** LS steer, RT gas, LT brake, B/X drift, X respawn, Y restart, RB camera, Start pause, rumble events.
- **Touch:** left steering zone (or tilt), right gas/brake pedals, respawn/pause buttons, haptics.

## Content
1. Sunrise Sprint — gentle intro, hills, 2 checkpoints (~30 s)
2. Canyon Twist — banked esses, jump, boosts (~55 s)
3. Sky Loop — vertical loop, corkscrew, big jumps (~75 s)
4. Grand Gauntlet — long combo finale (~100 s)
Medals per track: Bronze/Silver/Gold/Author (hand-tuned from ideal-path speed).

## Visuals
Golden-hour canyon: gradient sky shader + sun, warm fog, low-poly mesas, clouds.
Dark asphalt road, cyan emissive edge stripes, glowing boost pads, checkpoint rings.
Chunky low-poly open-wheel car, glossy paint, spin-wheel. Drift smoke, boost sparks,
speed FOV, finish confetti. Chase cam w/ spring lag + speed shake; hood cam option.

## Quality tiers
Low (mobile default): pixelRatio ≤1.5, no shadows, no bloom.
Med: 1024 shadows. High: 2048 + bloom. Auto-downgrade if FPS < 45.

## Testing (subagent QA in real browser)
- Menu flow, all 4 tracks finishable, checkpoint/respawn correctness.
- Keyboard, emulated touch viewport, CDP gamepad injection.
- 10+ min soak: perf, memory, no stuck states; screenshot/video evidence.

## Deploy
Dockerfile (nginx:alpine, static) → Coolify `cool.neima.me` → domain **race2.neima.me**.
Live verification after every deploy.
