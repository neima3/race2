# RACE2 v9 "Depth & Sharing" — Agent Execution Prompt

You are executing a phased push on RACE2 (vanilla TypeScript + three.js, DOM UI). Read `AGENTS.md` first — physics conventions sacred. v2.3.0 is live (camera suite, ghost battle, traffic, weekly, tutorial, replay theater, paints/stats). Roadmap: `docs/plans/2026-09-15-race2-v9-roadmap.md` — phases strictly in order, tick boxes, append to `docs/plans/v9-progress.md`.

## Rules (condensed from v8 — all still apply)
1. Full 16-gate list (roadmap header) before ticking any phase; new tests join permanently. Commit `v9 Phase N: <summary>`; never push (P6 does). Never commit `qa/`.
2. ALL browser testing muted (`?mute=1`). Subagent gameplay testing per phase: real races, mid-race screenshots (car visible, moving), honest verdicts — iterate or revert if worse.
3. Physics conventions sacred (AGENTS.md). No gameplay-semantic changes beyond the phase spec. PB/medal ledger stays dry-condition only (P1 policy is explicit — follow it).
4. Save additive; `window.__race2` extend-only; perf budgets hold (≤220 calls, allocs PASS).
5. Stuck twice on a verification → write the blocker in `docs/plans/v9-progress.md`, flag in report.

## QA hooks
`__race2`: `start(i, rivals?|'knockout'|'traffic')`, `startDaily()`, `startWeekly()`, `startTutorial()`, `auto()`, `drive()`, `cam()`, `variant()` (P1+), `traffic()`, `weekly()`, `standings()`, `state()`, `skipCountdown()`, `mute()`, `audioProbe()`. URL: `?mute=1`, `?touch=1`, `?alltracks`, `?variant=`, `?week=`.

## Deploy (P6 only)
Push → Coolify builds git main → race2.neima.me. App UUID `qgpdmafn677kx6aoiahrlfyy`; POST `https://cool.neima.me/api/v1/deploy?uuid=<uuid>` (token in 1Password "cool.neima.me coolify api" — never `source`, `|` breaks shell). Live-verify muted.
