# RACE2 v5 — Progress Log

## Phase 1 — Correctness sweep (2026-09-12) ✅
Shipped: star counter 40→48; Untouchable wired to new lifetime `cleanLaps` stat (additive, default-merged); pause→settings→BACK honors `returnTo='pause'`; drift-mode air-time accrues whenever airborne; FPS census gated behind `import.meta.env.DEV || ?debug=1`; `canvasEl`/`photoCleanup` fields moved to class top; `schemaVersion: 1` stamped on all four save payloads (keys unchanged, additive only) + `save.schemaVersion` getter for future migrations.

Verified:
- Gates: typecheck ✅, build ✅, harness 9/12 (STRICT-exempt: canyon-twist, grand-gauntlet, gauntlet-ii) ✅. Autopilot baselines unchanged (T1 17.47s).
- Prod bundle: census log compiled out (DEV folded to false; only reachable via `?debug=1`).
- Browser (?mute=1): `★ 0/48` on track select; pause→SETTINGS→BACK lands on PAUSED (RESUME works after); autopilot clean lap → `stats.cleanLaps 0→1`, achievements row "Untouchable 1/3"; airborne test with `drift:false` → `lapAir` accrued 0→0.611s (was structurally impossible before).
- Headless save mock: pre-cleanLaps profile loads with all fields preserved + cleanLaps=0; clean-lap addStats round-trips; `schemaVersion:1` stamped.
- Evidence: `qa/v5-phase1/` (not committed).

Deviations: none.

## Phase 2 — Rivals core (2026-09-12) ✅
Shipped:
- `src/game/rivals.ts` — `RivalManager`: 3 AI rivals (ROOKIE/easy, SABLE/mid, APEX/pro) each with own `CarPhysics` + tier tuning (accel/maxSpeed multipliers) + skill `{pace, lookaheadJitter, steerNoise}` + distinct paint. Stuck recovery (speed <2 m/s for 4s → checkpoint respawn, RaceController pattern), autopilot heading-error respawn, boost pads per rival, mover scrub per rival, slick zones per rival (set per sim step).
- `src/game/rules.ts` (new) — shared per-car surface rules so player and rivals run identical math: `updateBoostPads` (extracted verbatim from RaceController.update), `computeOnSlick`, `moverOverlap`, `applyMoverScrub`. RaceController + main.ts player paths refactored onto it; time-trial behavior unchanged.
- Multi-lap in RaceController: `opts {laps, writesRecords}` (additive; defaults = today). Wrap-safe progress: `totalProgress = (lapOffset + lapsDone) * len + dist` with `lapOffset = −1` for cars starting past 50% of track; finish when `lapOffset + lapsDone >= totalLaps` with all prior validity gates (cps done, >92% per lap, onRoad, moving) — time-trial byte-identical. Per-lap resets: nextCheckpoint, maxProgress, boost-pad lastBoostIndex. New events `lap`/`finalLap`. Grid-rollout crossing counted (car starting behind line, no cps crossed yet) — without this, grid cars drove a full extra lap vs slot-1 rivals (verified via telemetry: 1909m vs 1258m race lengths before fix).
- `CarPhysics.placeAt(dist, lateral)` — road-frame placement via `frameAtDist` + binormal (RIGHT per AGENTS.md), proper basis `(normal×tangent, normal, tangent)`.
- Autopilot: optional `skill` param (byte-identical when omitted); pace-hugging throttle thresholds (brake 1.03×target / lift 1.0×target) so pace tiers express; allocation-free refactor (module scratch vectors/quat + shared result object).
- Rubber band: ±6% with 15m dead zone, 60m ramp keyed to player−rival progress gap; rivals kept within ~100m worst-case (asserted <120m per step in harness).
- Standings/finish: completed cars classified by `finishRank` (completion order) ahead of unfinished by progress; `progress` for finishers reported as `totalLaps*len`; gapMeters = meters behind leader datum. Player finish → `freeze()` snapshot (arcade standard); rival races skip PB/ghost writes (save verified null post-race), skip ghost rendering/recording, skip lifetime stat writes in main.ts finish handler.
- Grid start: slots `(8 − k*6) mod len`, lateral alternating ±2.5 via binormal; player P4 (k=3). Countdown steps all 4 cars at 0 input; rivals step inside the same 120Hz fixed-step accumulator. Rival races default 2 laps.
- UI: RIVALS mode chip (cyan) next to DRIFT ATTACK, mutually exclusive both directions; HUD lap counter chip (`LAP 1/2`, `FINAL LAP`) shown only in rival mode; time-trial stays clean.
- QA hooks: `__race2.rivals()` (per-rival telemetry incl. effectivePace), `__race2.standings()`; `start(i, rivals?)` extended.
- `test/rivals.ts` — headless gate: steering-direction check (steer −1 → yaws/moves left), lateral-sign check (placeAt +2.5 → sits road-RIGHT, surfaceQuery agrees), full 2-lap rival races on sunrise-sprint + dune-rush with autopilot player: all 4 finish, player beats easy+mid, not always P1/P4, per-step rubber-band gap <120m, per-lap checkpoints, no PB/ghost writes.

Verified:
- Gates: typecheck ✅, build ✅, `test/laps.ts` 9/12 (same 3 STRICT-exempt; T1 17.47s unchanged) ✅, `test/rivals.ts` 16/16 ✅. Rival results: sunrise-sprint P1 APEX / P2 YOU (+0m, finished 2nd by ~2m — photo finish) / P3 SABLE +6m / P4 ROOKIE +30m, maxGap 32.9m; dune-rush P1 APEX / P2 YOU / P3 SABLE +66m / P4 ROOKIE +92m, maxGap 98.6m.
- Browser (?mute=1, headless Chrome): grid start screenshot (4 cars staggered, LAP 1/2 chip, P4 camera); mid-race 4-wide pack through ring on dune-rush with boost flames; FINAL LAP chip fired; standings/rivals hooks return clean data; finish order printed to console telemetry; PB+ghost remain null after rival race; time-trial: rivals hidden, lap chip hidden, ghostActive true, totalLaps 1, PB write path works (17.475 written by autopilot during test); steering: virtual steer −1 → lateral 0→−10.1 (left wall clamp); mode chips mutually exclusive both directions.
- Evidence: `qa/v5-phase2/` (not committed).

Deviations:
- Tier values tuned from spec's rough numbers to make tiers actually express: easy pace 0.93 (tuning accel 0.94×/maxSpeed 0.975×), mid 0.955 (0.97×/0.985×), pro 1.0 (1.04×/1.015×). Pro's edge comes from tuning, NOT targetSpeed overdrive: pace >1.0 pushes the √(38/curv) target past the 38 m/s² lateral-g budget → understeer wall scrub → pro was slower than player on twisty tracks. Spec latitude: tiers were marked "rough; P10 final-tunes".
- Autopilot gained pace-hugging thresholds (brake >1.03×target, lift >1.0×target) ONLY when a skill pace is passed; omitted-skill path keeps 1.1/0.95 byte-identical (base autopilot's dead zone otherwise absorbed 0.90–1.01 pace multipliers entirely).
- Rings (dune-rush/ring-runner) remain player-only pickups in Phase 2; rivals get pad boosts only (autopilot doesn't target rings either, so harness stays fair). Revisit in Phase 3+ if needed.
- Standings `progress` for cars that completed the race reports `totalLaps*len` (finish datum) — raw trackDist at the crossing is arbitrary noise (a 2m difference flipped P1/P2 in a photo finish before the fix); order among finishers uses completion rank.

Notes for Phase 3+: rival body styles are all `standard` with placeholder names/paints (identity work pending); finished rivals coast to a stop on track (no collision model — cars pass through); `hud-lap`/`FINAL LAP` chip text persists under menus (pre-existing HUD-under-menu pattern).
