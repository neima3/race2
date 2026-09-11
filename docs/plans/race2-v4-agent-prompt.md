# RACE2 v1.4 execution — agent handoff prompt

Execute phases from /Users/nn/Apps/race2/docs/plans/2026-09-10-race2-v4-roadmap.md (RACE2, TS + Vite + Three.js). Repo github.com/neima3/race2, live race2.neima.me.

## Read first
- AGENTS.md (commands, gotchas, QA hooks, baselines)
- The v4 roadmap. Claim the lowest unticked phase.

## Rules
- Dev server: `npx vite --port 5199` background. NOTE: browser RAF can starve system-wide — if state freezes, relaunch agent-browser (`close --all`, then `caffeinate -u -t 5` and reopen). The headless harness (`npx tsx test/laps.ts`, expect 9/12 + STRICT-WARN for canyon-twist/grand-gauntlet/gauntlet-ii) verifies logic without a browser.
- Per phase: typecheck + build + evidence (qa/v4-phaseN/), commit `v4 Phase N: <summary>`.
- window.__race2 API stable. Autopilot ±35%. Physics conventions sacred.
- Design/visual work in main session; subagents QA only. Push + deploy at Phase 10 (fleet tokens /Users/nn/Apps/fleetmcp/.env, uuid qgpdmafn677kx6aoiahrlfyy), live-verify after.
