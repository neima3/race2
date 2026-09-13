# RACE2 — 10x Development Roadmap v5 "Rivals & Career" (2026-09-12)

## Progress tracker
- [x] Phase 1: Correctness sweep — ship-stoppers & latent bugs
- [x] Phase 2: Rivals core — AI opponents, grid starts, positions, multi-lap races
- [x] Phase 3: Rival identity + race HUD — names/colors, position tracker, minimap
- [x] Phase 4: Career — cups, points, podiums, trophies
- [x] Phase 5: Car progression — distinct tuning per body, unlocks, stat bars
- [ ] Phase 6: Weather & time-of-day — rain, dusk, night variants with real grip effects
- [x] Phase 7: Ghost sharing — share/import PB ghosts via URL codes
- [ ] Phase 8: Race feel & podium — overtake/final-lap moments, podium ceremony
- [ ] Phase 9: Performance & soak — 4-car + weather budget, memory, 10-min soak
- [x] Phase 10: Balance + release QA + deploy v2.0 *(code+QA done; Coolify deploy + live-verify is the human-run post-phase step)*

**Goal statement (full ambition):** Turn RACE2 from a time-trial sim into a complete arcade racing game: line up on a grid against 3 named AI rivals with real position racing, fight through a 3-cup career with points and podiums, unlock and choose between cars that actually drive differently, race in rain and at night, share your ghosts with friends, and feel every overtake — all while the headless harness stays green, perf budgets hold, and v2.0 ships live to race2.neima.me.

**Grounding (verified 2026-09-12):** v4 roadmap complete (dev ghosts, music 2.0, slicks, movers, drift attack, achievements 2.0, world life, camera, perf audit, deploy). Survey findings driving this plan: no opponents/positions anywhere; `★ x/40` header vs 48 max (menus.ts:118); "Untouchable" achievement hardcoded `done:false` (menus.ts:392); pause→settings BACK dead-ends at title (menus.ts:418); drift-mode air-time only accrues while drifting (main.ts:933-937); FPS census console.log ships in prod (main.ts:714-717); body styles are physics-identical (car.ts DEFAULT_TUNING); ghost serialization exists but is shareless (race.ts:46-86); main.ts is a 1,127-line god class.

## Ground rules (unchanged from v4)
- Gates per commit: `npm run typecheck && npm run build`. Headless harness after every phase: `npx tsx test/laps.ts` must stay 9/12+ (STRICT-exempt: canyon-twist, grand-gauntlet, gauntlet-ii).
- Physics conventions sacred (AGENTS.md): three.js car local +x is LEFT; basis `(normal×tangent, normal, tangent)`; `binormal = tangent × normal` = RIGHT; sim fixed 120 Hz. After touching curve.ts/car.ts, verify steering direction.
- `window.__race2` API stable — extend, never break. Rival QA hooks added in Phase 2 (`rivals()`, `standings()`).
- Save schema: version-bump + migration defaults; never wipe existing profiles.
- Commit per phase: `v5 Phase N: <summary>`. Push at Phase 10 + deploy via Coolify + live-verify.
- Evidence per phase: screenshots/notes in `qa/v5-phaseN/` (never committed unless asked).
- Rival mode must NOT affect time-trial: PBs, ghosts, medals, harness all run solo. Autopilot baselines (T1≈17.5s … T4≈28.4s) ±35% still hold.

---

### Phase 1 — Correctness sweep  *(cheap-subagent friendly)*
- Fix `★ x/40` → `★ x/48` (menus.ts:118).
- Wire "Untouchable" achievement to a real clean-lap stat: track clean laps (0 wall hits) in save lifetime stats (the counter exists: `lapWalls` in main.ts), make achievement progress live.
- Fix pause→settings→BACK: honor `dataset.returnTo = 'pause'` (menus.ts:418) so it returns to the pause menu, not title.
- Drift mode: accrue air-time regardless of drift state (unwrap nested `if` at main.ts:933-937).
- Gate FPS census console.log behind a dev flag (`?debug=1` or import.meta.env.DEV).
- Move `canvasEl`/`photoCleanup` field declarations to the top of the Game class (organizational).
- Save safety: `cleanLaps` is additive-only — default-merge into existing stored objects (save.ts uses separate per-key stores; do NOT rename keys, do NOT wipe). Introduce an explicit schema version field now (additive) to anchor later phases.
- Files: `src/ui/menus.ts`, `src/main.ts`, `src/core/save.ts`.
- Verify: typecheck+build+harness green; explicit checks (not vibes): `★ x/48` screenshot; pause→settings→BACK lands on pause menu; clean lap increments stat + achievement progress; drift air accrues while airborne w/o drift; old-profile object (pre-cleanLaps JSON) loads without data loss.
- Done: all fixed, no behavior regressions in harness, commit `v5 Phase 1`.

### Phase 2 — Rivals core  *(the centerpiece)*
- New `src/game/rivals.ts`: `RivalManager` owning 3 AI opponents. Each rival = `CarPhysics` + `autopilotDrive` base + per-rival skill profile `{pace (0.90–1.02× targetSpeed), lookahead jitter, steer noise, name, color, body}`.
- Rubber-band: rival pace eases toward player within ±6% based on progress gap (keeps races close, never launches past a flying player). Hard skill cap so author-time ghosts are still faster.
- Grid start: 4 cars staggered behind start line. Wrap-safe: define `startDist = 8`, grid slots at `startDist − k*6` (mod curve length) so slot dists live near the end of the lap; trackDist progress uses `lapsDone * len + dist` with wrap-aware crossing checks (reuse the existing `curr − prev < len * 0.5` guard everywhere). Lateral grid offsets require new placement math — `placeAtFrame` forces `lateral = 0`; add `placeAt(dist, lateral)` using binormal (RIGHT) with sign per AGENTS.md, and verify steering direction after touching car.ts. Per-lap anti-cheat: `maxProgress`/92% rule resets per lap (is not wrap-safe today).
- Rivals run the same rules: boost pads, slicks (0.45× grip applies to them too — refactor slick/mover surface checks so they apply per-car, not just player), mover slowdown, respawn on stuck (>4s low progress → checkpoint respawn).
- Player finish → race freezes order by current progress (arcade standard); rival mode skips ghost rendering and never writes PB/ghost/drift stats.
- Mode select: track-select chip row gains "RIVALS" (alongside existing DRIFT chip); default remains TIME TRIAL.
- Initial rival pace tiers (rough; P10 final-tunes): easy ≈0.92×, mid ≈0.97×, pro ≈1.01× of autopilot targetSpeed, ±skill noise.
- QA hooks: `__race2.rivals()` telemetry, `__race2.standings()` current order.
- Files: new `src/game/rivals.ts`, `src/game/race.ts`, `src/main.ts`, `src/ui/menus.ts`, `src/ui/hud.ts` (minimal lap counter).
- Verify: harness green (solo unchanged); new headless check `npx tsx test/rivals.ts` on sunrise-sprint + dune-rush (both non-STRICT) — all 4 finishers, player finishes mid-pack, per-lap checkpoint crossing verified, rubber-band gap stays <~120m (asserted, not eyeballed); screenshots of grid start + mid-race pack; steering-direction check in browser.
- Done: `v5 Phase 2`, rival race winnable but not free.

### Phase 3 — Rival identity + race HUD  *(design-sensitive)*
- Rival roster: 8 named rivals (e.g. "VESPER", "JUNO", "HALCYON", "MIRAGE"…) with signature paint/body; 3 sampled per race, deterministic per (track, cup).
- Position tracker HUD: big `P2/4` readout with live standings strip (names + gaps in meters); position-change flash (+P / −P).
- Minimap: canvas-drawn track outline (top-down projection of curve points, cached per track) with 4 dots (player accent) + start-line notch; positioned under progress bar; matches design language (thin lines, theme accent).
- Finish panel: final positions table with gaps, podium highlight; "beat rival X" narrative lands in Phase 4.
- Files: `src/game/rivals.ts`, `src/ui/hud.ts`, `src/ui/menus.ts`, `src/main.ts`, new `src/ui/minimap.ts`.
- Verify: screenshots of standings strip + minimap on 2 themes (readable on neon + mesa); touch layout not occluded.
- Done: `v5 Phase 3`; a cold viewer can read who's winning within 2 seconds.

### Phase 4 — Career: cups, points, podiums
- New `src/game/career.ts` + save versioning: 3 cups — "SPRINT CUP" (T1/T2/T5/T8), "STREET CUP" (T3/T6/T9/T12), "GAUNTLET CUP" (T4/T7/T10/T11) — each = 4 rival races (2 laps), F1-style points 25/18/15/12 by finish position; cup unlocked when its tracks unlock. Difficulty tiers ride the Phase 2 pace presets: Sprint = easy/mid mix, Street = mid, Gauntlet = mid/pro mix (P10 final-tunes).
- Cup hub screen: cup cards (theme art from existing palettes), per-race results, points table, trophy state (gold = won cup, silver = 2nd, bronze = 3rd); save `cups: {id: {bestPoints, finishes[]}}`. Migration is additive default-merge on the versioned store from Phase 1; existing `*.v1` keys keep their names. Persistence test must exercise a real storage mock (the harness localStorage stub is a no-op — write the test with a Map-backed mock that survives a simulated reload).
- Entering a cup race uses rivals mode with cup rival lineups; finishing a cup race records points + advances; completing all 4 shows final standings + trophy ceremony hookup (Phase 8 visual).
- Menu nav: title gets CAREER entry; track select remains for solo play.
- Files: new `src/game/career.ts`, `src/core/save.ts` (v3 migration), `src/ui/menus.ts`, `src/main.ts`.
- Verify: headless career sim (reuse harness primitives): full cup runs, points math correct, persistence across reload; screenshot of cup hub + results.
- Done: `v5 Phase 4`; a new player can go title → career → win Sprint Cup with everything persisted.

### Phase 5 — Car progression: make bodies matter
- Real tuning per body: `standard` (balanced), `aero` (+top speed 5%, −grip 4%), `tank` (+grip 6%, −top speed 4%, higher boost kick) via `CarTuning` (car.ts already accepts partial tuning — wire it). Deltas deliberately conservative so medal calibration stays valid. Steering direction check after car.ts touch.
- Harness must pass on ALL three bodies within the ±35% band (not just default) — a body that farms stars breaks medal gates, since PB ledger stays car-agnostic by design (single ledger, as today).
- Garage: stat bars (SPEED/GRIP/DRIFT/ACCEL) derived from tuning values; rival AI cars may use bodies for identity.
- Unlock chain: aero = 12★, tank = win any cup (Phase 4 save already tracks). Locked cards show requirement.
- Car pick persists (`save.car`).
- Files: `src/physics/car.ts`, `src/systems/garage.ts`, `src/render/car-model.ts`, `src/core/save.ts`, `src/ui/menus.ts`, `src/main.ts`.
- Verify: harness ×3 bodies green within band; screenshot of garage stat bars + locked card; manual drive feel check per body.
- Done: `v5 Phase 5`; picking a car is a real tradeoff, visible in 10 seconds of driving.

### Phase 6 — Weather & time-of-day
- Per-cup ambience, config-driven (`defs.ts` theme variant overrides): `dusk` (warm low sun, long shadows), `night` (dark sky + stars bright, headlight cones on player + rivals, emissive reflectors up), `rain` (neon/street cups: grip multiplier 0.82× on all cars — clamp combined grip floor 0.32× so rain×slick never goes uncontrollable; feeds the same lateral-g budget so autopilot brakes naturally, no special-casing; streak particles + wet sheen stripe on road; skip puddle shimmer if perf cost >2ms).
- Sky shader gains uniforms for sun elevation/tint intensity (no rebuild per variant — uniform swap only).
- Files: `src/render/environment.ts`, `src/track/defs.ts`, `src/game/career.ts`, `src/main.ts`, maybe `src/render/particles.ts`.
- Verify: 4 screenshots (dusk/night/rain ×2 themes); FPS overlay before/after rain on Medium tier; harness green + one rain-variant headless lap (grip change must not break autopilot); steering-direction check after grip plumbing.
- Done: `v5 Phase 6`; night race reads instantly in a screenshot.

### Phase 7 — Ghost sharing
- Compact ghost codec (new, separate from in-memory format): downsample to 15 Hz, quantize position to 16-bit within track bbox, quaternion to smallest-three 8-bit, RLE + deflate (`CompressionStream`, base64url fallback). Target ≤8KB share code for a 90s lap cap (raw is ~70KB — a plain base64 URL is impossible, hence this codec). Round-trip must sanity-check orientation (reject mirrored/improper quats).
- Share: URL fragment `#g=<code>` carrying track id + time + code; "SHARE GHOST" on finish panel + track select PB row (Web Share API, clipboard fallback with toast).
- Import: opening a shared URL shows "FRIEND GHOST CHALLENGE" card (name/time) → race it; friend ghost renders like dev ghost, labeled, saved under `friendGhosts[trackId]` (one slot, additive save field on the versioned store).
- No backend — everything in the fragment.
- Files: new `src/game/share.ts`, `src/game/race.ts` (codec adapters), `src/ui/menus.ts`, `src/main.ts`, `src/core/save.ts`.
- Verify: round-trip test (share → fresh profile → ghost present, orientation sane, lap time within ±1%); screenshot of challenge card; share code ≤10K chars for a 60s lap (asserted in test).
- Done: `v5 Phase 7`.

### Phase 8 — Race feel & podium
- Overtake moments: position pass → 250ms slow-mo + chime; slow-mo scales dt for ALL cars equally (fixed-step accumulator already clamps — scale before accumulation so rival sim never drops steps), and is skipped under reduced-motion.
- "FINAL LAP" banner + music intensity kick (hook into music bus); countdown/GO punch: camera pull-in, light streak on GO.
- Podium ceremony: after cup win/top-3 — top-3 cars on start-line podium blocks, confetti burst (existing particle system), orbiting camera, results overlay; skippable.
- Crowd cheer layers on overtake/podium (procedural audio bus), tire screech polish trigger thresholds.
- Files: `src/main.ts`, `src/ui/hud.ts`, `src/core/audio.ts`, `src/core/music.ts`, `src/render/camera.ts`.
- Verify: video/screenshot sequence of overtake slow-mo + podium; audio probe gains; sim-time assertion in rivals harness during forced slow-mo (no step loss); harness green.
- Done: `v5 Phase 8`; winning feels like an event.

### Phase 9 — Performance & soak
- Budgets: draw calls ≤ v4 census +20% with 4 cars + heaviest weather; GPU memory flat over 20 cup-mode track switches; frame time ≤16ms on Medium for the rain cup race.
- Rival visual LOD: rival cars reuse car model instancing where cheap; shadow-blob only below High; particles share pools.
- Dynamic-res tuning under rain particles; memory leak sweep (dispose audit on cup exit).
- 10-minute soak: scripted cup loop in browser, RSS + renderer.info.memory sampled every 30s, zero growth tolerance.
- Files: mostly `src/main.ts`, `src/render/*` touch-ups.
- Verify: census table in `qa/v5-phase9/`; soak log; harness green.
- Done: `v5 Phase 9`; numbers recorded, regressions fixed or features trimmed.

### Phase 10 — Balance + release QA + deploy v2.0
- Difficulty curve final pass: rival pace per cup tier, rubber-band clamp tuning (cold starts welcome: gap telemetry asserted in rivals harness per track); medal times untouched (solo ledger intact).
- Achievements: add rival-era achievements (first rival win, cup sweep, beat all 8 rivals) — extends, never renumbers existing ids.
- Full QA sweep via subagents: desktop keyboard, touch (`?touch=1`), reduced-motion, fresh-profile career run end-to-end, shared-ghost round-trip, soak spot-check, old-profile migration load.
- Bump version to 2.0.0 (menus.ts title + manifest), commit, push, deploy via Coolify, live-verify race2.neima.me: `?mute=1` autopilot lap, rival race screenshot, steering-direction check on prod, 4-car perf spot-check.
- Done: v2.0.0 live, all gates green, checklist ticked, AGENTS.md updated.
