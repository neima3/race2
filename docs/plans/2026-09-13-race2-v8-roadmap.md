# RACE2 — 10x Development Roadmap v8 "More Ways to Race" (2026-09-13)

## Progress tracker
- [x] Phase 1: Camera suite — chase/near/bumper modes + FOV slider
- [x] Phase 2: Ghost battle — race 3 ghosts at once (PB vs dev vs friend)
- [x] Phase 3: Traffic rush — dodge traffic, near-miss bonuses, per-track best
- [ ] Phase 4: Weekly event — seeded 3-race modifier cup, streaks, sharing
- [ ] Phase 5: Paint unlocks + driver stats page
- [ ] Phase 6: Interactive tutorial — guided steer/boost/drift drills
- [ ] Phase 7: Audio 2.0 — per-body engines, slip screech, near-miss whoosh
- [ ] Phase 8: Replay theater — scrub, speeds, camera cycling
- [ ] Phase 9: Achievements 3.0 + mode balance pass
- [ ] Phase 10: QA sweep + accessibility + v2.3.0 + deploy + live verify

**Goal statement (full ambition):** Multiply the reasons to come back: a camera for every taste, racing your own PB and a friend's ghost side by side, threading traffic for near-miss bonuses, a seeded weekly championship with modifiers, visible progression (paints to earn, stats to brag about), a tutorial that actually teaches the drift, engines that sound like the car you picked, and a replay theater worth sharing — shipped as v2.3.0 with every gate green, verified live and muted.

**Grounding (verified 2026-09-13 at f78a0d4):** v2.2.0 live (14 tracks, 4 cups, knockout, daily, weather, ghost share, podium, offline PWA, v7 visuals). Confirmed gaps: camera is a single fixed chase rig with auto-FOV only (camera.ts:65,77 — no mode select, no slider); race.ts loads exactly ONE ghost (`playerGhost ?? devGhost`, race.ts:126-129) — no multi-ghost racing; no traffic/obstacle mode beyond movers; no weekly cadence (daily is 1 race); paints: 10 free colors, nothing locked (car-model.ts:13-26); no stats screen (lifetime stats exist in save but are only shown as achievement progress); replay is fixed-speed trackside cuts (no scrub/speed control); audio engine is one synth voice for all bodies. Harness is 14/14; all gates listed in Ground rules are green.

## Ground rules
- ALL browser testing muted (`?mute=1`, webdriver auto-mute). Never unmute.
- Gates per phase (all must pass before ticking): `npm run typecheck && npm run build`, laps 14/14, rivals 20/20, career 119/119, share 34/34, knockout 50/50, daily 59/59, probe 24/24, allocs PASS. New tests from new phases join the permanent gate list (P1: camera 28/28; P2: ghostbattle 39/39, run with `--expose-gc`).
- Physics conventions sacred (AGENTS.md). Steering-direction check after any car.ts/curve.ts touch. Time-trial semantics (PBs/ghosts/medals) unchanged except where a phase explicitly extends them (P2).
- Save: additive default-merge on the versioned store; never wipe/rename keys.
- Commit per phase `v8 Phase N: <summary>`; do NOT push (P10 pushes + deploys). Evidence in `qa/v8-phaseN/` (never committed).
- Perf: draw calls ≤220 Medium rain-rivals; allocs PASS; no per-frame allocation in sim/render loops.
- Subagent gameplay testing (muted, real races, screenshots judged honestly) required per phase; lead personally reviews key screenshots of visual/mode phases.

---

### Phase 1 — Camera suite
- `CameraRig`: 3 modes — CHASE (today), CLOSE (tighter/lower), HOOD (bumper/hood POV). Setting in Settings menu ("CAMERA") + quick-cycle key (C) during race; persists (`settings.cam`). FOV slider 60–100° (base, slider multiplies the existing speed-FOV response; HOOD uses 70+ forced). Works in rival/knockout/traffic modes and replay (P8 builds on this).
- Hood cam details: car body hidden (or dash cowl bar visible), contact shadow kept, speed lines intensify, look-ahead further down the road (frame lookDist + 25%).
- QA hook: `__race2.cam(mode?)` get/set. Test: headless camera-mode smoke (no NaNs, car visible in frustum for all 3 modes during a scripted lap — assert camera positions finite + car in view via projection).
- Files: `src/render/camera.ts`, `src/ui/menus.ts`, `src/core/save.ts`, `src/main.ts`, `test/rivals.ts` (add camera check) or new `test/camera.ts`.
- Evidence: muted screenshots per mode × 2 themes; slider extremes shot; subagent drives a lap per mode and judges readability.
- Done: gates green; modes + slider live in settings + C key; commit `v8 Phase 1`.

### Phase 2 — Ghost battle
- `race.ts`: load up to 3 ghosts simultaneously — PB ghost, friend ghost (if saved), dev ghost — priority fills empty slots; each gets its own sample arrays + dists (generalize the single-ghost fields into a small array of `GhostTrack {samples, dists, cpSplits, label}`).
- HUD: ghost delta chips per ghost (label + colored delta, existing delta pattern); minimap ghost dots per ghost (minimap already supports one — extend `dotPositions`); live position vs ghosts ("2ND OF 4" style chip: rank among player + active ghosts by totalProgress at player's dist).
- Finish panel: rows per ghost (beat/lost by X.XXs). Time-trial only (rival/knockout/traffic modes keep ghosts hidden). PB submission unchanged; racing a friend ghost still counts for SOCIAL CLIMBER.
- Settings: ghost count select (1/2/3, default 2: PB+dev when no friend; "GHOSTS" option).
- Headless `test/ghostbattle.ts`: 3-ghost setup on sunrise-sprint (PB synthetic + dev + friend synthetic), assert: 3 ghosts render positions each sample, ranks computed correctly, finish rows deltas correct, no per-frame allocs. Exit 1 on failure.
- Evidence: muted screenshots — 3 ghost cars visible mid-race + delta chips + minimap dots; finish panel rows.
- Done: gates + new test green; commit `v8 Phase 2`.

### Phase 3 — Traffic rush
- New mode (chip "TRAFFIC" alongside RIVALS/DRIFT/KNOCKOUT): 1 lap, 8-12 traffic cars ahead streaming along the road at 55-70% of autopilot pace, distributed dists, alternating lateral offsets (they follow simple kinematics: `dist += v·dt` along a fixed lateral, NO full CarPhysics — cheap, deterministic), receding slower than player so overtakes happen naturally; traffic loop-respawns ahead when passed.
- Collision (player↔traffic, same lap band ±3m lateral): strong slowdown (reuse mover-scrub pattern + spark burst + thud sfx hook); traffic car nudged lateral ±2m briefly. NO physics damage.
- Near-miss: pass within 2.2m lateral at relative speed >12 m/s without collision → "NEAR MISS" chip + small time bonus (−0.15s off final time, capped 5/lap); HUD counter.
- Result: finish panel shows time, near-miss count, score (time − bonuses); per-track traffic best saved (`trafficBest[trackId]`); traffic mode writes NO PB/ghost/drift stats. Podium skipped (solo mode); share code optional (P4 pattern, skip for now).
- Headless `test/traffic.ts`: autopilot on sunrise-sprint + dune-rush — finish achievable, ≥1 near-miss occurs naturally, collisions resolve (no NaN/stuck), traffic count constant (loop-respawn works), frame-step integrity. Exit 1 on failure.
- Files: new `src/systems/traffic.ts`, `src/main.ts`, `src/ui/menus.ts` (chip + panel), `src/ui/hud.ts`, `src/core/save.ts`, new `test/traffic.ts`.
- Evidence: muted screenshots — traffic pack + near-miss chip + collision sparks; subagent plays 2 races and judges fun/readability.
- Done: gates + new test green; commit `v8 Phase 3`.

### Phase 4 — Weekly event
- Seed = UTC ISO week (`GWWWW` e.g. 2026W38) → deterministic: 3-race cup (tracks from the 14, mixed themes, no repeats) + ONE modifier per week from rotation: `RAIN FINALS` (races 2-3 rain), `NIGHT OWL` (all night), `SLICK MAYHEM` (extra slick zones ×2 coverage), `BOOST FEST` (pad strength ×1.5). Lineup 2 mid + 1 pro, 2 laps each; points 25/18/15/12; total across 3 races vs rivals (rival points accumulate per name like career).
- Title entry "WEEKLY" (with streak text); flow mirrors daily (card → 3 sequential races with interstitials → final standings + trophy-ish banner; resume mid-week persisted `weekly: {weekKey, nextRace, entries, positions}` reusing cup-run save pattern).
- Streak: a week with all 3 races finished → streak+1 (gap → reset). Share: `#w=<weekKey>.<points>.<position>` → recipient card → RACE TODAY'S WEEKLY (same seed).
- Headless `test/weekly.ts`: seed determinism, 4-week rotation covers all 4 modifiers, resume mid-week, streak logic, share round-trip, races completable headless (autopilot; may use `finishLine()` for STRICT-prone tracks as established). Exit 1 on failure.
- Files: new `src/game/weekly.ts`, `src/main.ts`, `src/ui/menus.ts`, `src/core/save.ts`, new `test/weekly.ts`.
- Evidence: muted screenshots — weekly card with modifier badge, interstitial, final standings, share import.
- Done: gates + new test green; commit `v8 Phase 4`.

### Phase 5 — Paint unlocks + driver stats
- Paints: 6 of 10 stay free; 4 locked — `MIDNIGHT` (win a knockout), `SUNBURST` (7-day daily streak), `ULTRAVIOLET` (25 career near-misses), `GOLD LEAF` (weekly gold). Locked swatches show requirement; unlock check on relevant events (toast "NEW PAINT UNLOCKED"). Persist selection (`settings.paint` unchanged key; new `unlocks.paints[]` additive).
- Stats page: new menu panel "STATS" (title nav, next to achievements) — lifetime: laps, distance km, drift points, air seconds, near misses, rival wins, cups/trophies, best daily/weekly streaks, per-rival head-to-head wins (rivalsBeaten set exists; add per-rival win counts additively). Numbers tabular, existing design language, no emoji.
- Files: `src/render/car-model.ts` (labels), `src/systems/garage.ts` (locked swatches), `src/game/achievements.ts`, `src/core/save.ts`, `src/ui/menus.ts` (stats panel), `src/main.ts` (unlock triggers + near-miss stat hook from P3).
- Evidence: muted screenshots — garage locked paints, unlock toast, stats page fully populated (forced-save for demo values).
- Done: gates green; persistence across reload verified headless; commit `v8 Phase 5`.

### Phase 6 — Interactive tutorial
- First PLAY press (fresh profile, after onboarding cards): guided run on sunrise-sprint with 4 drills as glowing gate rings on the road (existing ring visual style): (1) STEER — pass 3 gates, (2) BOOST — hit 2 orange pads, (3) DRIFT — hold drift ≥1.2s through the bend sector, (4) BRAKE — enter the corner gate under 90 km/h. Each drill: instruction banner + success chime + next; fail = retry drill (max 3 tries then skip). Completion flag (`settings.tutorialDone`), skippable anytime (ESC/SKIP).
- After tutorial → straight into a time-trial with "NOW SET A TIME!" banner. Returning players never see it.
- Headless `test/tutorial.ts` (or extend daily test): drill state machine — sequences, retry, skip, completion flag; triggers fire at right dists. Exit 1 on failure.
- Files: new `src/game/tutorial.ts`, `src/main.ts`, `src/ui/hud.ts` (banners + rings reuse), `src/core/save.ts`.
- Evidence: muted screenshots/video of each drill + completion banner; subagent walks the flow fresh-profile.
- Done: gates + new test green; commit `v8 Phase 6`.

### Phase 7 — Audio 2.0
- Per-body engine: filter/wave detune per body (aero = brighter whine, tank = deeper burble, standard = neutral) — synth param map keyed by `settings.style`/player body; rivals keep neutral (cheap).
- Tire slip screech: continuous layer keyed by lateral slip (exists? tighten) + drift-keyed layer; near-miss whoosh (P3 event); collision thud (P3); weekly/daily completion fanfares (2 short stingers); tutorial drill chimes reuse overtake chime bus.
- Extend `test/probe.ts` with the new buses (engine timbre param shift per body, slip screech envelope, whoosh, thud, fanfares) — exit 1 on no envelope movement. Keep ALL levels subtle; audio design = supportive, not flashy.
- Files: `src/core/audio.ts`, `src/core/music.ts` (fanfares may live here), `src/main.ts` (event wiring), `test/probe.ts`.
- Evidence: probe table (gains before/after per event); muted smoke (no errors, no runaway gains — assert max gain ceilings in probe).
- Done: gates + extended probe green; commit `v8 Phase 7`.

### Phase 8 — Replay theater
- Time-trial replays (already recorded) gain a theater UI: scrub bar (drag to any t), speed buttons 0.25× / 0.5× / 1× (replay-only time scale, sim untouched), camera-cycle button (CHASE/CLOSE/HOOD from P1) + existing director cuts. Keep last 5 replays in-session (ring buffer; no persistence this phase).
- UI: bottom overlay (existing design language), hides during cuts; ESC exits. Reduced-motion: no auto-cuts in theater unless enabled.
- Headless `test/replay.ts` (small): scrub determinism (same sample at same t after random seeks), speed scale math, camera cycle no NaNs. Exit 1 on failure.
- Files: `src/main.ts` (replay state machine), `src/render/camera.ts` (mode blend), `src/ui/hud.ts` or new `src/ui/replay.ts` (theater UI).
- Evidence: muted screenshots — scrub bar mid-drag, 0.25× slow-mo frame, hood-cam replay shot; subagent scrubs through a real replay.
- Done: gates + new test green; commit `v8 Phase 8`.

### Phase 9 — Achievements 3.0 + balance
- New achievements (additive ids): `GHOSTBUSTER` (beat a friend ghost by >2s), `THREAD THE NEEDLE` (5 near-misses in one traffic run), `WEEKLY WARRIOR` (weekly gold), `FRESH GRAD` (complete tutorial), `PAINT COLLECTOR` (unlock all 4 locked paints). Panel rows + counters per existing pattern.
- Balance pass: traffic pace/coverage per track via harness (player should finish with 3-8 near-misses naturally, collisions rare for clean runs); weekly modifier difficulty (autopilot results per modifier within reason); FOV slider extremes sanity; career/knockout pins unchanged.
- Update `test/career.ts`/`test/traffic.ts` pins if needed (additive).
- Files: `src/game/achievements.ts`, `src/ui/menus.ts`, balance knobs in `src/systems/traffic.ts`/`src/game/weekly.ts`.
- Evidence: achievement pop screenshots (forced triggers), balance table in progress doc.
- Done: gates green; commit `v8 Phase 9`.

### Phase 10 — QA sweep + accessibility + v2.3.0 + deploy
- Full subagent QA matrix (muted, real gameplay): every mode (time-trial, rivals, knockout, traffic, daily, weekly, drift, ghost battle, tutorial fresh-profile), every camera mode, replay theater session, stats page, paint unlock flow, touch + reduced-motion + lefty spot-checks.
- Accessibility: high-contrast HUD accents option (`settings.hudContrast` — boosts chip/edge-line contrast; verify neon-night + rain readability shots with it on/off).
- Perf census + soak spot-check (10 min mixed modes); draw calls ≤220; allocs PASS.
- Version 2.3.0 (title credits + package.json). Commit, push, Coolify deploy (POST `https://cool.neima.me/api/v1/deploy?uuid=qgpdmafn677kx6aoiahrlfyy`), poll finished, live-verify muted: v2.3.0 string, one race per new mode, screenshots `qa/v8-live/`. Update AGENTS.md (new modes/tests/settings) + tick checklist + progress log.
- Done: v2.3.0 live, all gates green, checklist ticked.
