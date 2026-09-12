# RACE2 v5 "Rivals & Career" — Agent Execution Prompt

You are executing a phased development push on RACE2, an arcade racing game (vanilla TypeScript + three.js, DOM UI, no framework). Repo: current working directory. Read `AGENTS.md` first — physics conventions there are sacred.

## Where the plan lives
- Roadmap: `docs/plans/2026-09-12-race2-v5-roadmap.md` — work phases strictly in order, tick the checklist box as each phase completes, and append a short note to `docs/plans/v5-progress.md` (what shipped, what was verified, any deviations) so future sessions can resume.

## Execution rules
1. One phase at a time. Gates before you may tick a phase: `npm run typecheck && npm run build` and `npx tsx test/laps.ts` (must report 9/12+ passes; canyon-twist, grand-gauntlet, gauntlet-ii are STRICT-exempt). From Phase 2 onward, `npx tsx test/rivals.ts` is also a gate (all 4 finishers, rubber-band gap <~120m asserted).
2. Commit per phase with message format `v5 Phase N: <summary>`. Never commit `qa/` artifacts, screenshots, or secrets.
3. Do not break: `window.__race2` QA API (extend only), time-trial behavior (PBs/ghosts/medals/harness are solo and must stay byte-for-byte semantically identical), physics sign conventions (AGENTS.md: car local +x = LEFT, binormal = tangent × normal = RIGHT, basis `(normal×tangent, normal, tangent)`), save data (migrate, never wipe: bump schema version + default-fill new fields).
4. Visual/design work: implement to the existing design language (thin lines, theme accents, monospace-ish HUD numerals — see `src/styles.css`). Take screenshots as evidence but keep them out of commits.
5. If a phase's verification fails twice, stop and write the blocker into `docs/plans/v5-progress.md` under "Blockers" instead of hacking around it.
6. Rival races must not write PB/ghost/drift/lifetime time-trial stats. Rubber-band keeps races close but capped so a perfect player still wins.
7. After any change to `src/physics/car.ts` or `src/track/curve.ts`: verify steering direction in-browser (left key turns left) before committing.

## QA hooks available
`window.__race2`: `start(i)`, `auto(bool)`, `drive({steer,throttle,brake,drift})`, `state()`, `skipCountdown()`, `respawn()`, `mute()`. URL flags: `?mute=1`, `?touch=1`, `?alltracks`. Audio auto-mutes under `navigator.webdriver`. New hooks from Phase 2: `rivals()`, `standings()`.

## Known-good baselines
Autopilot (solo, mute=1): T1 ≈ 17.5s, T2 ≈ 30.8s, T3 ≈ 21.7s, T4 ≈ 28.4s — ±35% band. If a phase changes these beyond the band, find out why before proceeding.

## Final phase (10) includes deploy
Static build in Docker (nginx) → Coolify `cool.neima.me` → race2.neima.me. Verify live with `?mute=1` + autopilot and a rival-race screenshot. Report truthfully what was and was not verified.
