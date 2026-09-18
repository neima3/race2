# RACE2 — Development Roadmap v10 "New Metal, New Miles" (2026-09-15)

## Progress tracker
- [x] Phase 1: 4th car body — GLIDE (drift identity)
- [x] Phase 2: Track #15 — summit-run (alpine technical)
- [ ] Phase 3: Track #16 — halo-flats (mesa rings speed-lap)
- [ ] Phase 4: 5th cup — APEX LEAGUE + achievements
- [ ] Phase 5: Balance + full QA sweep
- [ ] Phase 6: v2.5.0 + deploy + live verify

**Goal statement (full ambition):** Give veterans new metal and new miles: a fourth car whose entire identity is drift, two authored tracks that exercise the v7 visual language (one technical alpine climb, one mesa ring-runner sprint), and a fifth cup that turns the new content into a pro-tier championship with the champion to beat — shipped as v2.5.0, harness 16/16, every gate green, live-verified muted.

**Grounding (verified 2026-09-15 at e182836):** v2.4.0 live. `CarBodyStyle` union at car-model.ts:14 ('standard'|'aero'|'tank'); body tuning wired via `CarTuning` (v5 pattern: aero +5% top −4% grip; tank +6% grip −4% top +8% boostKick); harness supports `--body=aero|tank` (v5) — needs `glide` added; unlocks live in save/unlocks + garage (aero 12★, tank cup trophy); 14 tracks / 4 cups; career roster-capacity guard + `V230_POOL_DEPTH` lineup freeze (v9) — NEW cup slots must draw from FULL pool depth (deep slots only) so existing lineups stay byte-stable. Gamepad already supported. All 19 gates green at HEAD.

## Ground rules (unchanged)
- ALL browser testing muted (`?mute=1`). Never unmute.
- Gates per phase: full list (roadmap header of v9 applies; laps expectation becomes 16/16 from Phase 3). New tests join permanently.
- Physics conventions sacred; steering-direction check after car.ts/curve.ts touch. Save additive. `window.__race2` extend-only.
- Lineup determinism: existing cups/daily/weekly/free-play lineups byte-stable (V230_POOL_DEPTH pattern; prove with `test/tmp/lineup-baseline.ts` diff = zero lines for existing content).
- Perf budgets hold. Subagent gameplay testing per phase (muted, honest verdicts); lead reviews key evidence.
- Commit per phase `v10 Phase N: <summary>`; push + deploy at Phase 6.

---

### Phase 1 — GLIDE body
- New `CarBodyStyle` 'glide': drift-identity tuning — driftGrip +10% (longer, controllable slides), accel −4%, grip −2% (slidey), top speed neutral. Visual: sleek long-tail coupe with rear wing extension (new geometry in buildCarVisual style switch; distinct silhouette at a glance).
- Unlock: beat SOVEREIGN (championBeaten stat exists from v9) — garage card "BEAT SOVEREIGN"; toast reuse; `unlocks.bodies[]` additive (or extend the existing unlock check pattern).
- Garage stat bars honest (DRIFT bar now maxes on GLIDE); harness `--body=glide` (extend laps.ts body flag) 14/14 within band; steering-direction check per body (existing checks in laps.ts run per body — verify glide included).
- Test: extend stats/unlocks test additively (unlock trigger from championBeaten, locked card, selection persistence).
- Done: gates green; muted screenshots — garage card, GLIDE drifting (skid marks + chip), stat bars; commit `v10 Phase 1`.

### Phase 2 — Track #15 summit-run
- Alpine technical climb: significant elevation delta (use the over/underpass bridge patterns proven in sky-loop), 3-4 hairpin-ish sections with radii the autopilot handles (volt-alley lesson: no knots), narrow-ish (9m), 2 checkpoints, 1 boost pad, no slicks. Theme alpine, dusk variant default in cup use.
- Author → harness: autopilot lap completes headless (16/16 expectation begins), calibrate medals (baseline ×1.05/1.2/1.4/1.8), `--emit-ghosts`, minimap auto-verifies, clearance check (`test/tmp/clearance.ts` pattern) passes.
- Target lap: ~24-30s (technical scale).
- Done: harness green; muted screenshots (2 corners + minimap); commit `v10 Phase 2`.

### Phase 3 — Track #16 halo-flats
- Mesa speed-lap built around RINGS: 4-5 rings on a wide fast arc (ring visuals exist), wide road (11m), long sweepers, 2 boost pads, night variant default in cup use. Target autopilot ~20-24s with ring-line mastery mattering.
- Same pipeline as P2: harness 16/16, medals, ghosts, clearance.
- Done: harness green; muted screenshots incl. a ring-line shot; commit `v10 Phase 3`.

### Phase 4 — APEX LEAGUE (5th cup) + achievements
- New cup: summit-run (dusk) → halo-flats (night) → volt-alley (day) → grand-gauntlet (rain) with SOVEREIGN in race 4 (champion defense; roster guard respected). Unlock: win Grand Tour trophy (or all-tracks unlock fallback) — pick: requires grand-gauntlet + volt-alley unlocked naturally (track-chain) AND any GT trophy; document.
- Achievements (additive): `APEX CHAMPION` (win APEX LEAGUE), `GLIDE RIDER` (win any race with GLIDE), `RINGMASTER` (all rings in one halo-flats lap). Panel rows + counters; wiring per existing pattern.
- Lineup determinism: new cup slots draw from full pool (deep slots) — baseline diff (`test/tmp/lineup-baseline.ts`) must show ONLY the new cup's lines.
- Done: gates green incl. career test extended (5 cups, new unlock chain, achievements); muted screenshots (cup card, champion defense race, new achievement pops); commit `v10 Phase 4`.

### Phase 5 — Balance + full QA sweep
- Balance tables: GLIDE harness band + drift feel (autopilot drift-mode lap with GLIDE vs standard — GLIDE should score higher on twisty, lower on speed); new-track medal sanity (author reachable ±5% of baseline); APEX LEAGUE difficulty (autopilot mid-pack on pro-heavy mix); champion defense winnable with a strong lap.
- Full QA sweep (subagent, muted): new body in garage/unlock/races, both new tracks in career + free play (day/night/dusk/rain variants), APEX LEAGUE flow end-to-end (fresh profile forced-unlock), new achievements pop, touch + reduced-motion + old-profile migration, perf census ≤220 + allocs, soak spot-check (10 min mixed).
- Done: gates green; tables + QA verdict table all PASS (fix small bugs directly); commit `v10 Phase 5`.

### Phase 6 — v2.5.0 + deploy + live verify
- Version 2.5.0 (title credits + package.json). AGENTS.md (16 tracks / 5 cups / GLIDE body / new gates). Progress log + roadmap tick.
- Commit, push, Coolify deploy (POST uuid `qgpdmafn677kx6aoiahrlfyy`, token via 1Password "cool.neima.me coolify api" — never `source`), poll finished.
- Live verify muted: v2.5.0 string; summit-run + halo-flats races on prod; GLIDE in garage (forced unlock); APEX LEAGUE card; `qa/v10-live/` screenshots.
- Done: v2.5.0 live, checklist ticked.
