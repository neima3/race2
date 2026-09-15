# RACE2 v8 "More Ways to Race" — Agent Execution Prompt

You are executing a phased push on RACE2, an arcade racing game (vanilla TypeScript + three.js, DOM UI, no framework). Repo: current working directory. Read `AGENTS.md` first — physics conventions sacred. v2.2.0 is live (14 tracks, 4 cups, knockout, daily, weather, ghost share, podium, offline PWA, premium visuals). This push adds cameras, ghost battle, traffic mode, weekly event, progression, tutorial, audio, replay theater.

## Where the plan lives
- Roadmap: `docs/plans/2026-09-13-race2-v8-roadmap.md` — phases strictly IN ORDER (they share main.ts/menus.ts); tick checklist boxes; append notes to `docs/plans/v8-progress.md`.

## Execution rules
1. One phase at a time. Full gate list in the roadmap header — every gate passes before ticking. New tests join the permanent gate list.
2. Commit per phase `v8 Phase N: <summary>`. Never push (P10 does). Never commit `qa/`.
3. ALL browser testing muted (`?mute=1`, webdriver auto-mute). Subagent gameplay testing mandatory per phase: actually drive (autopilot `__race2.auto(true)` + `skipCountdown()` + scripted `drive()`), capture mid-race screenshots (car visible, moving), judge them honestly, iterate or revert if worse.
4. Do not break: physics conventions (AGENTS.md), time-trial PB/medal semantics (except P2's explicit ghost extension), `window.__race2` API (extend only), save data (additive default-merge, never wipe/rename).
5. Perf: draw calls ≤220 (Medium rain rivals); no per-frame allocations in sim/render loops; allocs gate every phase.
6. Traffic (P3) uses cheap kinematics, NOT full CarPhysics — follow the roadmap spec exactly.
7. If stuck twice on a verification: write the blocker in `docs/plans/v8-progress.md`, move on, flag it in your report.

## QA hooks
`window.__race2`: `start(i, rivals?|'knockout')`, `startDaily()`, `auto(bool)`, `drive()`, `state()`, `skipCountdown()`, `standings()`, `cam(mode?)` (P1+), `mute()`, `audioProbe()`. URL: `?mute=1`, `?touch=1`, `?alltracks`, `?variant=`.

## Deploy (P10 only)
Push → Coolify `cool.neima.me` builds git main → race2.neima.me. App UUID `qgpdmafn677kx6aoiahrlfyy`; deploy = POST `https://cool.neima.me/api/v1/deploy?uuid=<uuid>` (token in 1Password "cool.neima.me coolify api" — never `source`, `|` breaks shell). Live-verify muted.
