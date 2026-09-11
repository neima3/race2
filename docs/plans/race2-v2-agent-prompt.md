# RACE2 v1.2 execution — agent handoff prompt

You are executing phases from /Users/nn/Apps/race2/docs/plans/2026-09-10-race2-v2-roadmap.md for RACE2 (Trackmania-style racer, TypeScript + Vite + Three.js). Repo: github.com/neima3/race2, live at race2.neima.me.

## Read first
- /Users/nn/Apps/race2/AGENTS.md (commands, gotchas, QA hooks, baselines)
- The v2 roadmap above; claim the lowest unticked phase.

## Rules
- Dev server: `npx vite --port 5199` in background. Verify with agent-browser (muted): `agent-browser --session <yours> --args "--mute-audio" open "http://localhost:5199/?mute=1"`.
- Per phase: typecheck + build + in-browser evidence (qa/v2-phaseN/), commit `v2 Phase N: <summary>`.
- `window.__race2` API must stay compatible. Autopilot must complete laps within baselines ±35% after every phase.
- Physics conventions (AGENTS.md) are sacred. After touching curve/car physics, verify steering direction.
- Design/visual work happens in the main session; subagents do QA sweeps and mechanical tasks only.
- Push + deploy only at Phase 10 (Coolify public instance, fleet tokens at /Users/nn/Apps/fleetmcp/.env), then verify live.
