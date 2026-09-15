# RACE2 v8 — Progress Log

## Phase 1 — Camera suite (2026-09-14, commit `v8 Phase 1`)

**Shipped**
- `CameraRig` 3 modes (src/render/camera.ts): CHASE (v2.2 behavior, byte-identical — proven by a legacy-rig oracle over a full scripted lap, max pos err < 1e-9), CLOSE (follow 8.8→5.7 = −35%, height 3.1→1.9 = −39%, look-ahead 7→8; lookBack 8.4→5.5 / −14→−9), HOOD (eye = pos + up·1.05 + fwd·0.5, look-ahead 10→12.5 = +25%, FOV base forced 70). Mode transitions are instant (snap-on-change, no eased swings).
- Hood POV hides `carVisual.bodyGroup` only — wheels + contact shadow stay; restored automatically in photo/podium/menu/replay states (main.ts per-frame `pov` check).
- Settings: `settings.cam` ('chase'|'close'|'hood', default chase) + `settings.fov` (60–100, default 72) + `settings.hintCam`. Legacy v2.2 `settings.camera` ('chase'|'hood') migrates into `cam` on load; invalid values sanitized, fov clamped. Wired live-applied via onSettingsChanged (the old `camera` select was dead — it never reached the rig; now it does).
- FOV mapping: slider value is the stored preference; CHASE/CLOSE base = fov − 10 (default 72 → base 62 = today's chase, satisfying the byte-identical hard constraint), HOOD base forced 70. Speed-FOV response shapes unchanged on top of the base (chase/close: speedRatio·22 + eased 4° + kick; hood: speedRatio·16 + eased 4°).
- C key (and gamepad RB / touch camera button) cycles CHASE→CLOSE→HOOD during racing, persists to settings, one-time "C — CAMERA" HUD hint (fires at race start only when no mode hint claims the slot). Photo mode and menu orbit/replay cameras untouched.
- Hood speed lines intensify: onset 0.62→0.45 speed ratio, cap 0.85→1.0.
- QA hook: `__race2.cam()` get / `__race2.cam('chase'|'close'|'hood')` set (persists).

**Tests**
- New permanent gate `test/camera.ts` (28 checks): cycle order, FOV base math per mode/pref, CHASE byte-identity vs inline v2.2 oracle over a full lap (1e-9), per-mode scripted laps (no NaNs every step; car-in-frustum 100% chase/close; ahead-facing 100% hood; hood fov ≥ 70), mid-lap cycling (6 swaps, no NaNs, stays framed). Exit 1 on failure.
- `test/allocs.ts` now runs the rig (all 3 modes cycled) inside the probe — PASS, +0.000MB/30s gc-forced.

**Gates (all green)**: typecheck ✓ build ✓ laps 14/14 rivals 20/20 career 119/119 share 34/34 knockout 50/50 daily 59/59 probe 24/24 allocs PASS camera 28/28.

**Evidence** (qa/v8-phase1/, muted, not committed): alpine-day-{chase,close,hood}, neon-night-{chase,close,hood}, fov-60 vs fov-100 (live fov 64 vs 104 at same corner/speed), ckey-1/2/3 (real keypress cycle), settings-panel{,-changed} (CAMERA select + FOV slider live-apply), persistence reload check (cam=close fov=88 → reload → rig applies both).

**Verdicts (lead-reviewed; no subagent tool in this session)** — CHASE: readable, unchanged ✓. CLOSE: readable + more immersive, car fills more frame, curbs/braking marks clearer — YES. HOOD: usable at 137–144 km/h, road well centered (look-ahead +25% works), body hidden with front wheel hubs grounding the view; night variant slightly dark but headlights carry it — YES, with a nit: a close ghost can occlude the view (same as any chase view).

**Deviations / notes**
1. FOV slider semantic: task said "slider value is the FOV base" (default 72) AND "chase byte-identical when settings untouched". Both can only hold if the base is offset: CHASE/CLOSE base = slider − 10. Documented in save.ts + camera.ts comments; one-line change if literal mapping is preferred instead.
2. `settings.camera` key replaced by `settings.cam` (per spec) with one-time migration from the old key; old JSON key is deleted on load. No data loss.
3. Screenshot judging done by the lead agent (no subagent dispatch available in this environment); all shots are real muted gameplay at 97–144 km/h.

## Phase 2 — Ghost battle (2026-09-14, commit `v8 Phase 2`)

**Shipped**
- `race.ts` refactor: the single-ghost fields (`ghost`/`ghostDists`/`ghostCpSplits`) became `GhostTrack[]` (`{samples, dists, cpSplits, label, color}`), built per-ghost by `buildGhostTrack()` (surfaceQuery dist precompute + checkpoint split scan, previously done inline in `start()`). Public API now indexed: `ghostCount()`, `ghostTrack(i)`, `ghostTracks()`, `ghostSampleAt(t, i)` (+ allocation-free `ghostSampleInto(t, i, posOut, quatOut)`), `ghostDistAt(t, i)`, `liveGhostDelta(dist, t, i)`, `ghostSplitDelta(ghostIndex, cpIndex)`, and new `battleRank(dist, t)` → `{rank, of}` (player rank among player+ghosts by progress at that instant). Checkpoint-event split deltas and finish-panel split deltas still use the primary ghost (index 0). `ghostActive` = any ghost present. Behavior with a single active ghost is byte-equivalent to v2.2.
- Slot filling (`loadGhostTracks`): candidates in order FRIEND (external/imported ghost — keeps v2.2 semantics where an imported friend ghost is THE ghost), PB (`trackSave.ghost`), BOT (`DEV_GHOSTS`); fill up to `maxGhosts` (settings.ghosts, clamped 1–3). Dedupe per spec: dev is skipped when a PB occupies a slot and the limit leaves no room (limit 2 + PB + friend → FRIEND+PB; limit 2 + PB → PB+BOT; no PB → FRIEND+BOT; default 3 → FRIEND+PB+BOT). `writesRecords=false` (rival/knockout/daily/traffic-era modes) loads zero ghosts — suppression unchanged. Deviation from the task's literal priority order (PB first): FRIEND takes the primary slot so GHOSTS=1 in a friend race still shows the friend ghost and checkpoint deltas compare against it, preserving the v2.2 friend-race contract; noted as intentional.
- Finish: `FinishResult.ghostResults[]` (`{label, color, deltaMs}`) where `deltaMs = player − ghostLapMs` (negative = beat). PB submission/medal/records untouched; `#g=` import flow untouched; SOCIAL CLIMBER wiring (`friendRaceActive` → `addStats({friendGhostRaces:1})`) intact and now also fires when the friend ghost races alongside PB/BOT.
- Friend ghosts now survive reloads: `decodeSavedFriendGhosts()` decodes persisted `save.friendGhosts[*].code` at boot into an in-memory per-track cache (async deflate; failures silently ignored). `raceFriendGhost`/`startTrack` read cache with fallback to the legacy in-session import.
- HUD: per-ghost delta chips (stacked `.hud-ghost-delta` rows, label colored per `GHOST_COLORS` — PB white, FRIEND accent-2 #ffb52e, BOT grey; value green/red ahead/behind; hidden in drift mode like the old live delta); battle-rank chip `.hud-battle-rank` ("2ND OF 4" ordinals, hidden when <2 racers or rival mode); progress bar now renders up to 3 per-ghost dots. Old single `hud-live-delta` element kept (always null in time-trial now — chips replace it). Minimap `update()` takes `{x,z,color}[]` ghost dots (preallocated buffer + length-mutated view, no per-frame allocs).
- Car rendering: 3 ghost visuals (one per slot) built per track; paint per label (PB = translucent player paint as today, FRIEND = #ffb52e, BOT = #8d96a5) via existing `CarVisual.setPaint`; garage paint changes live-update all slots.
- Settings: `settings.ghosts` (1/2/3, default 3, sanitized in `loadSettings`) + "GHOSTS" select in Settings (time-trial only — rival/knockout never load ghosts regardless). `race.maxGhosts` set from settings at startTrack; changing mid-race applies next race.
- QA hook: `__race2.ghosts()` → `{active, maxGhosts, settings, tracks:[{index,label,color,samples,lapMs}]}`.

**Tests**
- New permanent gate `test/ghostbattle.ts` — 39 checks, exit 1 on failure: slot filling/dedupe matrix for limits 1/2/3 × PB/friend/dev availability + rival-suppression; per-ghost sample lookup at t=0/mid/past-end + out-of-range index; battleRank ahead/midfield/behind mixtures + of-count + boundary stability; per-ghost live deltas (≈0 at the ghost's own position, sign convention vs slower ghost, distinct per ghost, null outside range); a real autopilot finish on sunrise-sprint with 3 ghosts asserting the emitted `ghostResults` rows (labels, colors, delta math vs synthetic lap times); allocs probe (30s 3-ghost sim with per-step `battleRank`/`liveGhostDelta`/`ghostDistAt` + render-pattern `ghostSampleInto`, gc-forced, +0.30MB ≤ 2MB PASS). Run `npx tsx --expose-gc test/ghostbattle.ts`.

**Gates (all green)**: typecheck ✓ build ✓ laps 14/14 rivals 20/20 career 119/119 share 34/34 knockout 50/50 daily 59/59 probe 24/24 allocs PASS camera 28/28 ghostbattle 39/39.

**Evidence** (qa/v8-phase2/, muted `?mute=1`, real races, not committed): seeded synthetic PB (1.06–1.22× dev pace) + imported friend code + real dev ghost on sunrise-sprint and salt-flats (`?alltracks`). battle-midrace.png (sunrise: FRIEND −6.53 / PB −3.17 / BOT +0.05 chips, FRIEND pill, "2ND OF 4", 3 progress dots + minimap dots); battle-3cars.png (salt-flats, 4TH OF 4 with all three ghosts ahead +2.4/+1.6/+1.7s); battle-midrace-closeup.png (ghost chain ~30m ahead visible); battle-finish.png (GHOST BATTLE rows: FRIEND BEAT BY 7.77s, PB BEAT BY 3.76s, BOT LOST BY 0.08s — math verified vs seeded lap times, and a second run on salt-flats: LOST BY 3.37/1.66/1.82s); battle-ghosts1.png (GHOSTS=1: single FRIEND chip, "2ND OF 2", one ghost car visible); settings-ghosts.png (GHOSTS select = 3); render-probe.png (frozen-ghost render check).

**Verdicts (lead-reviewed, honest)** — HUD: chips/rank/dots all legible at speed, color-coding reads instantly, rank chip is a genuine race-feel addition ✓. Finish rows: exactly the right "beat/lost by" summary, correct signs and colors ✓. GHOSTS=1 vs 3 comparison: clean behavioral difference (chips count, rank denominator, dot count) ✓. Ghost CARS: render correctly (render-probe) but in real racing they follow the same recorded line time-shifted, so at typical gaps they read as a tight chain/one blob at distance, and they're occluded by crests/bends like any car; on flats with 15–40m gaps the chain is clearly visible. Acceptable for v8; a future polish could add per-ghost lateral offsets or larger ghost labels above cars.

**Deviations / notes**
1. FRIEND outranks PB in slot order (see above) — deliberate, preserves friend-race semantics; default-3 line-up matches the spec (PB + dev + friend; no-PB → dev + friend).
2. Settings default is 3 per the task spec (roadmap said default 2 — task supersedes).
3. Live delta chips vs BOT/PB become `null` (chip hides) when the player's dist is outside a ghost's sampled range (lap wrap vicinity) — pre-existing liveGhostDelta boundary behavior, now per-ghost.
4. `useExternalGhost` kept as the FRIEND-slot feed (main.ts call site unchanged in name); it now coexists with PB/BOT instead of replacing them.
5. Pre-existing bug found (out of scope, unfixed): controls help advertises "Restart — R" but `input.restart` is never consumed in main.ts; restart works only via pause menu. QA restarts were done by reloading the page.
6. Screenshot evidence methodology: dev ghosts and the autopilot share one racing line, so staged evidence used synthetic PB/FRIEND paces (generated from DEV_GHOSTS via serialize/encode) seeded into localStorage plus scripted throttle control; all screenshots are real muted gameplay.
