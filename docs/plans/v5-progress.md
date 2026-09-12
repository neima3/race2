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
