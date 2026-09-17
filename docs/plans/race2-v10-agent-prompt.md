# RACE2 v10 "New Metal, New Miles" — Agent Execution Prompt

You are executing a content push on RACE2 (vanilla TypeScript + three.js, DOM UI). Read `AGENTS.md` first — physics conventions sacred. v2.4.0 is live (variants, slipstream, replay share, champion, weekly). This push: GLIDE 4th car body, 2 new tracks, 5th cup. Roadmap: `docs/plans/2026-09-15-race2-v10-roadmap.md` — phases strictly in order, tick boxes, append to `docs/plans/v10-progress.md`.

## Rules (condensed — all prior rules apply)
1. Full gate list (v9 roadmap header + new tests) before ticking. Commit `v10 Phase N: <summary>`; never push (P6 does). Never commit `qa/`.
2. ALL browser testing muted (`?mute=1`). Subagent gameplay testing per phase: real drives, mid-race screenshots, honest verdicts.
3. Physics conventions sacred. Lineup determinism for ALL existing content is non-negotiable (prove via `test/tmp/lineup-baseline.ts` diff). Save additive. Perf budgets hold.
4. Track authoring: follow the v7 geometry conventions (no seam folds below dy −3 near wrap, tangent continuity, autopilot-friendly radii — see AGENTS.md + `test/tmp/geo-*.ts` harnesses). New tracks must NOT be STRICT-exempt.
5. Stuck twice → blocker in `docs/plans/v10-progress.md`, flag in report.

## QA hooks
`__race2`: `start(i, rivals?|'knockout'|'traffic')`, `startDaily()`, `startWeekly()`, `startTutorial()`, `auto()`, `drive()`, `cam()`, `variant()`, `traffic()`, `weekly()`, `champion()`, `standings()`, `state()`, `skipCountdown()`, `mute()`, `audioProbe()`. URL: `?mute=1`, `?touch=1`, `?alltracks`, `?variant=`, `?week=`.

## Deploy (P6 only)
Push → Coolify builds git main → race2.neima.me. App UUID `qgpdmafn677kx6aoiahrlfyy`; POST `https://cool.neima.me/api/v1/deploy?uuid=<uuid>` (token in 1Password "cool.neima.me coolify api" — never `source`, `|` breaks shell). Live-verify muted.
