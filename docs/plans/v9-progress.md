# v9 progress

## Phase 1 (subagent hit rate limit mid-phase; lead finished)
- WIP completed: variant chips row (track select, settings.variant additive + sanitizer), free-play variant application (career/weekly/knockout keep own variants; ?variant= dev override keeps priority), dry-ledger policy via `variantWritesRecords()` → `race.writesRecords=false` + `recordReplay=true` so theater still works on variant laps; drift/traffic ledgers guarded; "VARIANT RACE — NO PB" finish note; `__race2.variant()` get/set hook.
- New permanent gate `test/variants.ts`: 4 variant laps complete headless (rain 17.78s vs 17.47 dry — grip flows), night race leaves PB null through the REAL finish path (structural writesRecords guard), day writes PB.
- All 17 gates green. Browser (muted): night neon-vertical + rain sunrise races, finish note, PB null check, chip row (`qa/v9-phase1/`).
