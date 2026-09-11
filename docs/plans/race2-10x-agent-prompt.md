# RACE2 10x Execution — agent handoff prompt

You are executing a phased improvement plan for RACE2, a Trackmania-style browser racer (TypeScript + Vite + Three.js, custom arcade physics). It is LIVE at https://race2.neima.me and developed in /Users/nn/Apps/race2 (repo: github.com/neima3/race2).

## Read first
1. /Users/nn/Apps/race2/AGENTS.md — commands, architecture, conventions gotchas, QA hooks, autopilot baselines.
2. /Users/nn/Apps/race2/docs/plans/2026-09-10-race2-10x-roadmap.md — the phase checklist + specs. Claim the lowest unticked phase.

## Execution rules
- Start the dev server: `npx vite --port 5199` (background). Never use other ports.
- Implement one phase at a time. After each: `npm run typecheck && npm run build` must pass, then verify IN THE BROWSER with agent-browser (muted): `agent-browser --session <yours> --args "--mute-audio" open "http://localhost:5199/?mute=1"`.
- Gameplay verification: `window.__race2.start(i)`, `__race2.skipCountdown()`, `__race2.auto(true)`, `__race2.state()` telemetry. Autopilot must still complete laps within baselines (±35%) after your changes.
- Save evidence screenshots into qa/phaseN/ (desktop 1280×720 and mobile 390×844 where UI-relevant).
- Commit per phase: `Phase N: <summary>`. Do NOT push or deploy unless the phase list says so (Phase 10 only).
- NEVER break the physics conventions in AGENTS.md (binormal = tangent × normal = road RIGHT; improper basis matrices produce garbage quaternions). After touching curve.ts/car.ts, verify steering direction (hold steer +1 → lateral should increase → wall on the right).
- Design/visual work is done in the main session, not by subagents. Subagents may run QA sweeps and mechanical bulk edits.
- If a phase spec conflicts with reality (code drifted), adapt and note it in progress.md.

## Finish condition (only when ALL phases ticked)
Update progress tracker, run full typecheck+build, dispatch a final QA subagent sweep (desktop/mobile/soak), then push to GitHub and deploy via the Coolify public instance (app uuid in fleet config / docs), then verify the live URL with an autopilot lap + screenshots. Report honestly what was verified.
