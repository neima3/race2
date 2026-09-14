# RACE2 v7 "Beautiful Worlds" — Agent Execution Prompt

You are executing a VISUAL QUALITY push on RACE2, an arcade racing game (vanilla TypeScript + three.js, DOM UI, no framework). Repo: current working directory. Read `AGENTS.md` first — physics conventions sacred. v2.1.0 is live (knockout, daily, career, weather, PWA). This push makes the game beautiful: lighting, ground, landforms, road, props, menus.

## Where the plan lives
- Roadmap: `docs/plans/2026-09-13-race2-v7-roadmap.md` — phases strictly in order; tick checklist boxes; append notes to `docs/plans/v7-progress.md`.
- Baseline "before" screenshots: `qa/v7-ground/00-05.png` (the problems to fix are catalogued in the roadmap grounding section — READ IT).

## Execution rules
1. One phase at a time. Full gate list in the roadmap header — every gate must pass before ticking. A/B screenshot evidence per phase (after shots in `qa/v7-phaseN/`, never committed).
2. **Subagent gameplay testing is mandatory per phase**: actually drive races in the browser (muted) — autopilot via `__race2.auto(true)` + `skipCountdown()`, plus scripted `drive()` inputs for specific shots — and capture mid-race screenshots from real gameplay (car visible, moving, camera sane). Judge them honestly; if a change looks worse than baseline, iterate or revert. Report what you saw, not what you changed.
3. **ALL browser testing muted**: `?mute=1`, never unmute.
4. Visual direction belongs to the LEAD: implement the roadmap's art direction exactly (theme palettes, mood per theme as specified); where the roadmap says "theme-tuned", use the def.ts palette conventions and stay consistent across themes. Do not invent new art directions.
5. Commit per phase `v7 Phase N: <summary>`. Never push (Phase 6 does). Never commit `qa/`.
6. Do not break: physics (no gameplay changes — this is a RENDER push; if autopilot baselines shift beyond ±35%, find the accidental gameplay change), `window.__race2` API, save schema, existing modes.
7. Perf budgets: draw calls ≤220 (Medium, rain rivals), frame time no regression vs v2.1.0, allocs PASS. Merge/instance new geometry.
8. If stuck twice on the same verification: write the blocker in `docs/plans/v7-progress.md` and stop that item.

## QA hooks
`window.__race2`: `start(i, rivals?|'knockout')`, `startDaily()`, `auto(bool)`, `drive()`, `state()`, `skipCountdown()`, `standings()`, `mute()`. URL: `?mute=1`, `?touch=1`, `?alltracks`, `?variant=night|dusk|rain`.

## Final phase includes deploy
Push → Coolify builds git main → race2.neima.me. App UUID `qgpdmafn677kx6aoiahrlfyy`; deploy = POST `https://cool.neima.me/api/v1/deploy?uuid=<uuid>` (token in 1Password "cool.neima.me coolify api" — never `source`, `|` breaks shell). Live-verify muted.
