# RACE2 v1.3 execution — agent handoff prompt

Execute phases from /Users/nn/Apps/race2/docs/plans/2026-09-10-race2-v3-roadmap.md for RACE2 (TypeScript + Vite + Three.js Trackmania-style racer). Repo: github.com/neima3/race2 — live at race2.neima.me.

## Read first
- /Users/nn/Apps/race2/AGENTS.md — commands, gotchas, QA hooks, autopilot baselines (now 12 tracks).
- The v3 roadmap above. Claim the lowest unticked phase.

## Rules
- Dev server: `npx vite --port 5199` background. Verify via agent-browser muted sessions (`--args "--mute-audio"`, URL `http://localhost:5199/?mute=1`).
- Per phase: typecheck + build + browser evidence in qa/v3-phaseN/, commit `v3 Phase N: <summary>`.
- window.__race2 API stays compatible. Autopilot baselines ±35% after every phase. Physics conventions sacred (AGENTS.md).
- Design/visual work in the main session; subagents for QA sweeps only. Push + deploy only at Phase 10 (fleet tokens /Users/nn/Apps/fleetmcp/.env, app uuid qgpdmafn677kx6aoiahrlfyy), then live-verify.
