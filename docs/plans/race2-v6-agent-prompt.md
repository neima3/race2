# RACE2 v6 "Knockout & Daily" — Agent Execution Prompt

You are executing a phased development push on RACE2, an arcade racing game (vanilla TypeScript + three.js, DOM UI, no framework). Repo: current working directory. Read `AGENTS.md` first — physics conventions there are sacred. v2.0 (rivals, career, weather, ghost share, podium) is live; this push adds knockout, new tracks + a 4th cup, daily challenge, polish, offline PWA.

## Where the plan lives
- Roadmap: `docs/plans/2026-09-13-race2-v6-roadmap.md` — work phases strictly in order, tick the checklist box as each phase completes, append notes to `docs/plans/v6-progress.md`.

## Execution rules
1. One phase at a time. Full gate list is in the roadmap header — every gate must pass before you may tick a phase (including tests added by earlier v6 phases).
2. Commit per phase: `v6 Phase N: <summary>`. Never commit `qa/` artifacts, screenshots, or secrets. Do not push (push happens at Phase 6).
3. Do not break: `window.__race2` QA API (extend only), time-trial behavior, physics sign conventions (AGENTS.md: car local +x = LEFT, binormal = tangent × normal = RIGHT), save data (additive default-merge on the versioned store, never wipe/rename).
4. ALL browser testing muted: load with `?mute=1`, rely on `navigator.webdriver` auto-mute. Never unmute, never create audio in tests.
5. New headless tests become permanent gates: `test/knockout.ts` (P1), expanded `test/laps.ts` 11/14 (P2), `test/daily.ts` (P3).
6. If a phase's verification fails twice, stop and write the blocker into `docs/plans/v6-progress.md` under "Blockers" instead of hacking around it.
7. After any change to `src/physics/car.ts` or `src/track/curve.ts`: steering-direction check before committing.

## QA hooks
`window.__race2`: `start(i, rivals?|'knockout')`, `auto(bool)`, `drive({steer,throttle,brake,drift})`, `state()`, `skipCountdown()`, `respawn()`, `mute()`, `rivals()`, `standings()` (rows gain `eliminated` in v6). URL: `?mute=1`, `?touch=1`, `?alltracks`, `?variant=`.

## Known-good baselines
Autopilot (solo, mute=1): T1 ≈ 17.5s, T2 ≈ 30.8s, T3 ≈ 21.7s, T4 ≈ 28.4s — ±35% band. Laps gate expectation becomes 11/14 after Phase 2 (STRICT-exempt set unchanged).

## Final phase (6) includes deploy
Push → Coolify `cool.neima.me` builds git main → race2.neima.me. App UUID `qgpdmafn677kx6aoiahrlfyy`; deploy = POST `https://cool.neima.me/api/v1/deploy?uuid=<uuid>` (token in 1Password "cool.neima.me coolify api" — never `source`, `|` breaks shell). Verify live muted: v2.1.0 string, knockout, daily, a new track autopilot lap, screenshots.
