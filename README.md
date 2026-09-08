# RACE2

Trackmania-style arcade time-trial racer for the browser. Built with TypeScript, Vite, Three.js, and a custom centerline-based arcade physics engine.

**Live: https://race2.neima.me**

## Features

- 4 handcrafted tracks: Sunrise Sprint, Canyon Twist, Sky Loop (vertical loop + corkscrew), Grand Gauntlet
- Author/Gold/Silver/Bronze medal times per track
- Ghost car replay of your best run
- Full input support: keyboard, touch (buttons + tilt), gamepads (Xbox/PS/Switch Pro via the Web Gamepad API, including iOS)
- Procedural audio (engine, boosts, chimes, music) — zero audio assets
- Golden-hour canyon environment, low-poly styling, particles, dynamic chase/hood cams
- Local leaderboard history + settings persistence (localStorage)
- PWA manifest — installable on iOS/Android home screens

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | A/D or ←/→ | Left stick | Left arrows |
| Gas | W or ↑ | RT / A | GAS pedal |
| Brake/reverse | S or ↓ | LT | BRAKE pedal |
| Drift | Space | B | — |
| Respawn at checkpoint | X / Backspace | X | ↺ button |
| Restart | R / Enter | Y | — |
| Camera toggle | C | RB | — |
| Look back | Q | LB | eye button |
| Pause | Esc / P | Start | ⏸ button |

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # production build to dist/
npm run preview    # preview dist/
npm run typecheck  # strict TS check
```

## QA test hooks

Automation hooks are exposed on `window.__race2` (used by agents for gameplay testing):

```js
__race2.start(2)          // start track by index
__race2.auto(true)        // autopilot drives a lap
__race2.drive({throttle: 1, steer: -0.5})
__race2.state()           // full car/race telemetry
__race2.skipCountdown()
__race2.respawn()
__race2.mute()            // silence audio
```

URL params: `?mute=1` silences audio, `?touch=1` forces touch UI. Audio is
auto-muted under automation (`navigator.webdriver`).

## Deployment

Dockerfile serves the static build via nginx. Deployed on Coolify
(`cool.neima.me`) at **race2.neima.me** — see docs/plans/implementation-plan.md.
