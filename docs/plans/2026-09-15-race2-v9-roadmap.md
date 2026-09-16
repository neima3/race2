# RACE2 — Development Roadmap v9 "Depth & Sharing" (2026-09-15)

## Progress tracker
- [x] Phase 1: Free-play variant picker — dusk/night/rain for any track
- [x] Phase 2: Slipstream drafting — race behind cars for extra speed
- [x] Phase 3: Replay sharing — `#r=` codes watch a friend's lap in the theater
- [x] Phase 4: Rival roster +4 (champion finale) — start/finish banter
- [ ] Phase 5: New-feature achievements + balance + full QA sweep
- [ ] Phase 6: v2.4.0 + deploy + live verify

**Goal statement (full ambition):** Deepen the racing itself and complete the social loop: pick dusk, night or rain for any free-play race, earn speed by drafting behind rivals and traffic like a real racer, send a friend a code that plays your actual lap in their replay theater, and give the rival roster a champion to chase — shipped as v2.4.0, all gates green, live-verified muted.

**Grounding (verified 2026-09-15 at e272aab):** v2.3.0 live. Confirmed: variants exist but free play is day-locked (only dev `?variant=` override; cup/weekly assign variants — no UI); no draft/slipstream mechanic anywhere (grep clean); share codec has reusable primitives (quantizeGhost/dequantizeGhost/rle/buildShareLink in share.ts) but only carries `#g=` ghost codes, not replays; RIVAL_ROSTER = 8 presets (rivals.ts:20) with tier-based deterministic pickLineup. All 16 gates green at HEAD.

## Ground rules (unchanged)
- ALL browser testing muted (`?mute=1`, webdriver auto-mute). Never unmute.
- Gates per phase: typecheck + build + the full 16-gate list (laps 14/14, rivals 20/20, career 119/119, share 34/34, knockout 50/50, daily 59/59, probe 61/61, allocs PASS, camera 28/28, ghostbattle 39/39, traffic 16/16, weekly 116/116, stats 64/64, tutorial 73/73, replay 34/34). New tests join permanently.
- Physics conventions sacred; steering-direction check after car.ts/curve.ts touch. Save additive. `window.__race2` extend-only.
- Perf budgets hold (≤220 draw calls Medium rain-rivals; allocs PASS; no per-frame allocs).
- Subagent gameplay testing per phase (muted, real races, honest screenshot verdicts); lead reviews key evidence.
- Commit per phase `v9 Phase N: <summary>`; push + deploy at Phase 6 only.

---

### Phase 1 — Free-play variant picker
- Track-select gains a VARIANT chip row (DAY/DUSK/NIGHT/RAIN) next to mode chips, free-play only; selection persists in settings (`settings.variant`, default day) and applies to time-trial/ghost-battle/traffic/drift runs (rival/knockout/career keep their assigned variants).
- PB ledger policy: PBs/ghosts/medals/records stay DRY-CONDITION ONLY — non-day free-play variants run with `writesRecords=false` semantics for time trial (finish panel shows "VARIANT RACE — NO PB" note). Traffic/drift bests likewise day-only. This keeps leaderboards fair without per-variant ledgers.
- Visual pass: rain has wet-road + streaks, night headlights + city glow — verify each variant on 2 themes (screenshots muted).
- QA hook: `__race2.variant()` get/set for free play. Test: headless variant lap (night + rain) completes; records null after variant race; day race still writes PB.
- Done: gates + new test green; variant screenshots; commit `v9 Phase 1`.

### Phase 2 — Slipstream drafting
- Mechanic: behind any car (rival, traffic, ghost OFF — ghosts don't draft) within Δdist 4–9m behind and |Δlateral| < 2.2m → draft charge builds (~0.5s to full): top-speed boost +8% and gentle accel assist while held; HUD "SLIPSTREAM" chip + speed-lines tint; breaks instantly when out of the pocket or on collision.
- Applies in: rivals, knockout, traffic. Solo modes unaffected (nothing to draft). No new physics files — a per-car draft factor consumed by car.ts's existing speed cap path (additive param; conventions respected; steering-direction check).
- Tuning: autopilot rivals may use draft too (same rules layer) — verify pack racing tightens without rubber-band conflict (gap asserts in test/rivals.ts still pass; tune constants if the 120m band breaks).
- Headless `test/draft.ts` (or extend rivals test additively): draft builds in pocket / decays outside / +8% top speed held / traffic drafting works / no effect in solo. Exit 1 on failure.
- Done: gates green; muted screenshots of the chip in a rival pack + traffic train; commit `v9 Phase 2`.

### Phase 3 — Replay sharing
- Extend the share codec: `#r=v1.<trackId>.<timeMs>.<code>` where code = the same quantized ghost payload BUT replay-fidelity (keep 30Hz — reuse `quantizeGhost` on the replay's recorded samples; cap 90s). "SHARE REPLAY" button in the replay theater (Web Share + clipboard fallback, existing pattern).
- Import: `#r=` shows "FRIEND REPLAY" card (name-less; time + track) → WATCH loads it straight into the replay theater (labeled FRIEND REPLAY, scrub/HD cams all work). Hash cleared after import. Persist last imported friend replay in-session only (no save change) — OR additive `friendReplays` single slot if persistence is cheap; your call, document it.
- `test/share.ts` additive: replay round-trip (30Hz preserved within codec error), code size ≤12K chars for 60s, theater auto-opens imported replay headlessly.
- Done: gates green; muted screenshots — share button, import card, friend replay playing in theater; commit `v9 Phase 3`.

### Phase 4 — Rival roster +4 + champion
- 4 new rivals: `NOVA` (mid), `KESTREL` (pro), `VESUVIUS` (pro), `SOVEREIGN` (champion — pro+ tuning deltas {accel 1.07, maxSpeed 1.04} + pace 1.0, distinct paint/body). Roster capacity guard respected in pickLineup (tier pools grow accordingly).
- CHAMPION slot: SOVEREIGN is the fixed final-race opponent in GRAND TOUR race 4 (replaces one pro pick) — beating the Grand Tour WITH SOVEREIGN beaten = new achievement `KINGMAKER` (additive).
- Banter: one-line start splash per rival ("VESPER: TRY TO KEEP UP.") + finish line ("VESPER: REMATCH. NOW.") — tiny inline table on the rival preset; muted text only, existing splash style; reduced-motion safe (no extra animation).
- Career test additive: roster pools, champion placement, KINGMAKER trigger; lineup determinism unaffected for existing cups (verify byte-identical lineups for cups 1-3 + daily).
- Done: gates green; muted screenshots — champion on grid, banter splashes; commit `v9 Phase 4`.

### Phase 5 — Achievements + balance + QA sweep
- Achievements (additive): `DRAFT KING` (finish a rival race with ≥8s cumulative draft), `STORM CHASER` (win a night rain variant race), `DIRECTOR` (share a replay), plus KINGMAKER from P4. Panel rows + counters.
- Balance: draft constants vs pack racing (no train-breaking), variant race difficulty (night rain autopilot laps complete on 3 tracks), replay code size table.
- Full QA sweep (subagent, muted): every mode × new features (variant chips, slipstream in rivals+traffic, replay share round-trip, champion race, banter, touch + reduced-motion + lefty spot checks), old-profile migration, perf census ≤220 + allocs.
- Done: gates green; balance tables; QA table all PASS (fix small visual bugs directly); commit `v9 Phase 5`.

### Phase 6 — v2.4.0 + deploy + live verify
- Version 2.4.0 (title credits + package.json). AGENTS.md update (new modes/tests/mechanics/hooks). Progress log + roadmap tick.
- Commit, push, Coolify deploy (POST `https://cool.neima.me/api/v1/deploy?uuid=qgpdmafn677kx6aoiahrlfyy`, token via 1Password "cool.neima.me coolify api" — never `source`), poll finished.
- Live verify muted: v2.4.0 string; variant picker on prod (night race screenshot); slipstream chip in a rival race; replay share round-trip on prod; `qa/v9-live/` screenshots.
- Done: v2.4.0 live, checklist ticked.
