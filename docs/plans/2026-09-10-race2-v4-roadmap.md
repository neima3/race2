# RACE2 — 10x Development Roadmap v4 (2026-09-10)

## Progress tracker
- [x] Phase 1: Dev ghosts — harness-generated, shipped per track
- [x] Phase 2: Music 2.0 — four per-theme procedural generators
- [x] Phase 3: Slick zones (grip patches) + tire spray
- [x] Phase 4: Moving shoulder pillars (T6 + T8)
- [x] Phase 5: Drift attack mode — score UI + separate best per track
- [x] Phase 6: Achievements 2.0 — telemetry-driven (drift, air, clean laps)
- [x] Phase 7: World life 2 — banner wave, crowd bob, theme particle ambience
- [x] Phase 8: Camera 2 — photo filters upgrade, replay auto-cut director
- [x] Phase 9: Performance & memory audit
- [x] Phase 10: Balance pass + full QA (harness + subagent sweep) + deploy

**Goal statement (full ambition):** Deepen mastery and identity: race shipped dev ghosts day one, four distinct soundtracks, drift scoring as a meta, hazards that create skill moments, and a living crowd — with the headless harness green for all tracks and a clean deploy of v1.4 to race2.neima.me.

## Ground rules (unchanged)
- Gates per commit: `npm run typecheck && npm run build`; evidence per phase in `qa/v4-phaseN/`.
- `window.__race2` API stable; physics conventions sacred (AGENTS.md).
- Headless harness: `npx tsx test/laps.ts` must stay 9/12+ (3 known-strict) after every phase.
- Autopilot baselines ±35%. Commit per phase `v4 Phase N: <summary>`. Push + deploy at Phase 10, then live-verify.

---

### Phase 1 — Dev ghosts
- Extend `test/laps.ts`: on PASS, serialize lap samples (30Hz, quantized to 15Hz) into `src/track/devghosts.gen.ts` as base64 strings per track id.
- RaceController: when no player ghost, load dev ghost labeled "RACE2 BOT"; HUD ghost label.
- Settings: ghost source select (auto → PB else dev / off).
Done: fresh profile races the dev ghost on every track; screenshot with both cars.

### Phase 2 — Music 2.0
- `core/music.ts`: four generators (dawn pads 100bpm, canyon plucks 96, neon synthwave 124 w/ drums, mesa cinematic 84) sharing the intensity-layer bus; crossfade on track change; menu = dawn variant.
Done: theme switch changes generator (probe gains), no clicks; build green.

### Phase 3 — Slick zones
- New track feature `slicks: {dist, lateral, w, l}` — dark shiny patches (canvas texture) with grip 0.45× while over them (car.ts flag from surface query).
- Tire spray particles when entering/exiting at speed; subtle tire noise filter change.
- Apply to T3 + T12 (2-3 patches each).
Done: screenshot of patch + spray; autopilot laps still finish.

### Phase 4 — Moving shoulder pillars
- Feature `movers: {dist, lateral, speed, range}` — pillars sweeping the outer shoulder (never the racing line center), collision = strong slowdown + sparks.
- Applied to T6 + T8; autopilot unaffected (center line clear) but laps vary slightly.
Done: video/screenshot of pillar sweep; autopilot finishes both tracks.

### Phase 5 — Drift attack
- Toggle on track select (filter chip "DRIFT") or per-race: score = drift points only, timer hidden, finish panel shows drift score + best drift saved per track (`driftBestMs` in save).
Done: screenshot of drift HUD + finish score; persisted best.

### Phase 6 — Achievements 2.0
- Persist lifetime stats: totalDrift, totalAir, laps, cleanLaps (no wall hits).
- 8 new achievements from stats; achievements panel shows progress counters.
Done: panel screenshot; stats persist across reload.

### Phase 7 — World life 2
- Start banner wave (CPU vertex sine on low-poly plane), crowd bob (instanced y-scale sin), theme particle ambience: dawn pollen, canyon dust devils (rare), neon light rain streaks, mesa heat shimmer (refraction-lite via vertex noise on a near-plane).
Done: two screenshots 10s apart per theme showing motion.

### Phase 8 — Camera 2
- Photo mode: 4 filters upgraded with vignette+grain options, FOV readout, rule-of-thirds overlay.
- Replay director: cut types (chase/trackside/heli-orbit) auto-selected by speed; cut flash.
Done: replay screenshots showing two different cut types.

### Phase 9 — Performance & memory audit
- Draw-call census (renderer.info) per theme; merge remaining per-object billboards; cap total instances by tier; dispose audit on track switch (GPU memory before/after via renderer.info.memory).
Done: census table before/after; no growth over 10 track switches.

### Phase 10 — Balance + release
- Medal rebalance from harness baselines across all tracks; achievements tune.
- Full subagent QA: harness + desktop sweep + mobile touch + soak; deploy via Coolify; live autopilot verification + screenshots.
Done: v1.4.0 live; all green; checklist ticked.
