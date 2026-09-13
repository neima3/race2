# RACE2 v6 — Progress Log

## Phase 4 — Feel & honesty polish (2026-09-13) ✅

Shipped:

- **Stat-honest bodies** (`src/physics/car.ts`, tuning constants only): aero gains `driftGrip: 1.976` (+4% vs default 1.9 — looser slides, rewards skill), tank gains `accel: 35.7` (+5% vs default 34). Nothing else touched; standard stays identical. Garage bars (menus.ts `bodyStatRatios`) derive from tuning, so they now differentiate with zero UI changes: STANDARD 70/70/70/70, AERO speed 74/grip 67/**drift 73**/accel 70, TANK speed 67/grip 74/drift 70/**accel 74** (% widths).
- **Night readability** (`src/track/defs.ts` night variant + `src/render/car-model.ts` headlights): `ambientDim` 0.52 → **0.64** (mesas/ground/rocks +23% brighter — both read clearly at a glance now), `starBrightness` 2.1 → **2.31** (+10%), headlight spotlight intensity 340 → **410**, angle 0.48 → **0.55 rad** (pools brighter + wider), decay 1.55 → 1.5. Dusk/day/rain variant rows and the `headlights:false` build path untouched.
- **Speed FOV** (`src/render/camera.ts`): existing response was a linear widen `62 + 22·(speed/58)` (0→+22° across the whole range, no high-speed-specific term). Added an eased high-speed term on top: smoothstep from 45→58 m/s capped at **+4°**, temporally eased (rate 4/s, scalar state, zero allocation), applied in both chase and hood modes. `CameraRig.speedFovEnabled` flag set per-frame from `!settings.reducedMotion` (main.ts) — reduced-motion skips it entirely. Verified live: 40.8 m/s → fov 77 (old formula), 60.2 m/s → **88** (84 baseline + 4 saturated), 51.8 m/s with reducedMotion → **82** (baseline only).
- **Audio probes** (`src/core/audio.ts` + new `test/probe.ts`): `blip`/`noiseBurst` gained an internal tag param; overtake chime, GO stinger (noise + 2 blips) and crowd swell register envelope taps (ring buffer, cap 12) in `probeTaps`; `AudioEngine.audioProbe()` returns `{ time, ctxState, sfxBus, musicBus, musicIntensity, musicLayers{base,intense}, events[{name,start,dur,gain}] }` — gain values read live from the AudioParams. Exposed as `window.__race2.audioProbe()` (extend-only). `test/probe.ts` (24 checks, permanent gate) runs the engine headless on a virtual-clock AudioContext mock (automation events evaluated analytically: set/linear/exp ramps + setTarget) and asserts each event actually moves its envelope: overtake attack 0.17 → mid-decay 0.0062 → 0.0001; GO peak 0.38 → done; crowd silent → attack 0.043 → hold 0.089 → release; `musicKick` intensity 0 → 0.7 → 0.972 with intense layer 0 → 0.447 and base 0.5 → 0.187, then decay after kick expiry; sfx mute gating; tap-buffer bounded. Exit 1 on no movement (event → no-op = broken wiring).

Verified:

- Gates: typecheck ✅, build ✅ (993.96 kB / 372.48 kB gzip, +1.0 kB vs Phase 3), `test/laps.ts` **11/14** ✅ on **all three bodies** (STRICT-exempt set unchanged), `test/rivals.ts` **20/20** ✅, `test/career.ts` **119/119** ✅, `test/share.ts` **34/34** ✅, `test/knockout.ts` **50/50** ✅, `test/daily.ts` **59/59** ✅, `test/probe.ts` **24/24** ✅, `test/allocs.ts` **PASS** ✅ (+0.000MB/30s).
- **Steering-direction check after car.ts touch: PASS on all 3 bodies** (standard −0.999 / aero −0.999 / tank −0.998 heading·right; placement +2.50 rel·right each).
- Harness ×3 table (autopilot, seconds; all within the ±35% band of T1 17.5 / T2 30.8 / T3 21.7 / T4 28.4):

  | track | standard | aero | tank |
  |---|---|---|---|
  | sunrise-sprint | 17.47 | 17.02 | 17.63 |
  | sky-loop | 24.72 | 24.40 | 24.78 |
  | dune-rush | 23.52 | 22.98 | 23.77 |
  | serpents-tail | 20.49 | 20.24 | 20.54 |
  | neon-vertical | 23.18 | 22.85 | 23.24 |
  | twilight-gauntlet | 36.58 | 35.97 | 36.77 |
  | neon-circuit | 15.13 | 14.87 | 15.20 |
  | ring-runner | 39.38 | 38.59 | 39.74 |
  | volt-alley | 27.90 | 27.52 | 28.05 |
  | salt-flats | 22.18 | 21.62 | 22.38 |
  | harbor-nine | 24.23 | 23.78 | 24.43 |

  standard times byte-identical to pre-change baseline (tuning untouched); aero identical too (driftGrip only affects drift, which the autopilot never engages — the gate proves the delta doesn't wedge anything); tank slightly faster in places (accel +5%). No track broke a body; the +4% aero driftGrip needed no reduction to +3%.
- Browser (?mute=1, headless Chrome, evidence `qa/v6-phase4/`, not committed):
  - Night A/B mesa (salt-flats): before — ground near-black, mesas indistinguishable from sky; after — mesas read as shapes against the sky, ground/rocks readable, headlight pool visible. Night A/B neon (harbor-nine): before — terrain mush; after — mesas/ground read clearly, pink edge line + brighter star field, night mood retained (`before/after-night-{mesa,neon}.png`).
  - Day-unchanged proof: controlled pair (car at rest, same countdown moment, `git stash` for the before side) → **0.20% pixels differ**, diff image shows only countdown-splash animation edges + subpixel tree AA; zero 3D-field change (`before/after-day-controlled.png`, `day-controlled-diff.png`).
  - Garage bars per body distinct (DOM-verified widths + screenshot `after-garage-bars.png`); locked cards show stats too, so honesty is visible pre-unlock.
  - High-speed FOV frame + numbers above (`after-fov-highspeed.png`); `__race2.audioProbe()` returns live buses/taps on the muted page (ctxState "suspended", go-stinger taps present).

Deviations:

- **FOV interpretation**: the task's "if it already exists, tune to +4° max" was read as cap the *added high-speed term* at +4° — the existing linear +22° response is core camera feel and was left intact; the new term is a separate eased ≤+4° bonus above 45 m/s (documented current vs new above). Nerfing 22° → 4° would have been a drastic, out-of-scope feel regression.
- Crowd probe uses `crowd(1.2, 0.09)` (game default 2.4 unchanged) so the hold-at-vol segment exists within a short virtual window; with dur 0.5 the release starts immediately after attack (correct engine behavior, unusable for a hold assert).
- `test/probe.ts` no-ops `setInterval` during music scheduling for virtual-time determinism (`startMusic`'s synchronous first tick still schedules); `engine.stopMusic()` at test end.
- AGENTS.md: added the probe gate line and fixed stale counts left from Phases 2/3 (laps 9/12+ → 11/14, career 109 → 119, 12 tracks → 14); full AGENTS.md refresh stays with Phase 6.

Notes for Phase 5+: `CameraRig.speedFovEnabled` is the pattern for any future reduced-motion-gated camera work. `audioProbe()` taps only the four Phase-4 events; adding a tag string to other `blip`/`noiseBurst` call sites extends it trivially (buffer cap 12, oldest evicted). The night ambientDim floor (0.64) is a defs-data change — if Phase 6 balance wants it different per theme, `applyVariant` would need a theme-dim multiplier.

## Phase 3 — Daily Challenge (2026-09-13) ✅

Shipped:

- **`src/game/daily.ts`** (new) — seeded daily definition. Seed = FNV-1a (`hashSeed`, now exported from rivals.ts) over `'race2-daily:' + dateKey` (UTC `YYYYMMDD`). Track pick = `h % TRACKS.length` with a deterministic +1 shift when it collides with the *previous* day's pick (no consecutive-day repeats). Lineup = `pickLineup(trackId, h % 100000, ['easy','pro','pro'])` — spicy but roster-capacity-guarded (pickLineup re-picks from the remaining pro pool, no duplicates). Laps 2, variant forced `'day'` (`resolveVariant` short-circuits when a daily race is active). API: `dailyFor(dateKey)` (byte-identical per date), `todayKey()` (UTC), `prevDateKey`, `isValidDateKey` (real-calendar validation incl. leap years), `dailyIsLive` (only today playable), `buildDailyLink`/`parseDailyLink` (`#d=<dateKey>.<pos>.<timeMs>`). Rotation sample (Sep 2026): salt-flats → gauntlet-ii → sky-loop → volt-alley → neon-vertical → canyon-twist → ring-runner → canyon-twist → ring-runner → dune-rush; 30 days cover **14/14 distinct** tracks, 0 immediate repeats.
- **Save (additive, schemaVersion stays 2)**: `AllSaves.daily: { lastFinishDate: string|null, streak: number, results: {[dateKey]: {position, timeMs}} }` — all dates kept (tiny ledger), `sanitizeDaily` drops malformed keys/entries. `recordDailyFinish(dateKey, position, timeMs)` implements the streak semantics: same-day retry keeps streak and only overwrites the stored result when better (**lowest position first, then lowest time**); otherwise `lastFinishDate === prevDateKey(dateKey)` → streak+1, any gap → streak = 1. Verified invariants: retry never double-counts, position beats a faster time, round-trips the Map-backed storage mock.
- **UI**: title gains a DAILY button (PLAY→DAILY→CAREER order) with a `STREAK N` sub-line when streak > 0 (refreshed on every `show('title')`); daily card screen (date, track, lineup paint+tier rows, "2 LAPS · 1 EASY + 2 PRO RIVALS", today's result + streak when present, RACE/RETRY TODAY'S CHALLENGE + BACK); `#d=` import card ("BEAT MY TIME", their P + time, today's track when live — RACE enabled; old dates show "THAT DAY'S CHALLENGE — DAILIES ARE ONLY PLAYABLE SAME-DAY" with RACE disabled; DISMISS always). Finish panel gains the accent `DAILY: P3 · STREAK 1` line + SHARE RESULT button + BACK TO TITLE (replaces TRACK SELECT for dailies; RETRY replays the same seeded daily and keeps best).
- **Share**: SHARE RESULT builds `origin+path+#d=20260913.3.41150` via `navigator.share` else clipboard + `DAILY LINK COPIED` toast (same envelope as ghost share). Import: `checkShareHash` handles `#d=` before `#g=`, clears the hash via `history.replaceState` immediately, `INVALID DAILY LINK` toast on parse failure.
- **Guard rails**: daily is a rival-race internally but writes only to the daily ledger — the finish handler gained a dedicated `else if (this.dailyRace …)` branch *before* the `rivalWins/rivalsBeaten` branch; `writesRecords` stays false (no PB/ghost), `friendRaceActive`/career/cup/knockout all unreachable. Verified in browser: after a full daily finish `race2.stats.v1` is never created and `tracks['serpents-tail']` stays `{bestTimeMs: null, ghost: null}`. `dailyRace` is cleared by onPlayTrack/onCareerStartRace/raceFriendGhost/quitToMenu; RETRY intentionally preserves it.
- **`test/daily.ts`** (new permanent gate, 59 checks): byte-identical defs, 30-day rotation (≥8 distinct — actual 14, 0 repeats, all lineups valid), UTC key math (midnight rollover, month/year boundaries, leap years), full streak matrix (+1 / retry-no-double / gap-reset / position-then-time best-keeping), save round-trip + sanitizer (negative streak, malformed dates, junk result keys), `#d=` round-trip + 10 rejection cases, old/future/invalid-date liveness. Exit 1 on failure.
- **QA hooks (extend-only)**: `__race2.startDaily()` (starts today's seeded daily, returns the daily snapshot), `__race2.daily()` (`{today, save.daily, lastFinish.daily}`), `state()` gained `daily: boolean`.

Verified:

- Gates: typecheck ✅, build ✅ (992.97 kB / 372.11 kB gzip, +7.5 kB vs Phase 2), `test/laps.ts` **11/14** ✅ (STRICT-exempt set unchanged; sunrise 17.47 / dune-rush 23.52 baselines unchanged), `test/rivals.ts` **20/20** ✅, `test/career.ts` **119/119** ✅, `test/share.ts` **34/34** ✅, `test/knockout.ts` **50/50** ✅, `test/allocs.ts` **PASS** ✅ (+0.000MB/30s), `test/daily.ts` **59/59** ✅.
- Browser (?mute=1, headless Chrome, evidence `qa/v6-phase3/`, not committed):
  - 01: `#d=20260913.1.95000` import card (fresh load) — SERPENT'S TAIL, THEIR RESULT P1 · 1:35.000, TODAY'S CHALLENGE, RACE enabled, hash cleared.
  - 02: `#d=20260910.2.88000` — DUNE RUSH / 2026-09-10, "THAT DAY'S CHALLENGE — DAILIES ARE ONLY PLAYABLE SAME-DAY", RACE `disabled`, DISMISS.
  - 03/04: title DAILY button (no streak on fresh profile) → daily card: HALCYON EASY / APEX PRO / VESPER PRO, 2 LAPS, RACE TODAY'S CHALLENGE.
  - 05 + `daily-race.webm`: mid-race on serpents-tail (day), standings P1 APEX / P2 VESPER / P3 YOU / P4 HALCYON, FINAL LAP splash, `state().daily = true`.
  - 06: finish panel — accent `DAILY: P3 · STREAK 1` line, RACE RESULT table, SHARE RESULT / RETRY / BACK TO TITLE; save ledger `{lastFinishDate: '20260913', streak: 1, results: {'20260913': {position: 3, timeMs: 41150}}}`; **no PB/ghost/lifetime-stat writes**.
  - SHARE RESULT → clipboard captured exactly `http://localhost:5173/#d=20260913.3.41150` + `DAILY LINK COPIED` toast; 07: pasted URL in a fresh navigation → import card with THEIR RESULT P3 · 0:41.150, RACE enabled.
  - 08/09: title DAILY now reads `STREAK 1`; daily card gains `TODAY: P3 · 0:41.150` + RETRY TODAY'S CHALLENGE.

Deviations:

- **schemaVersion stays 2** (task allowed an additive bump): `test/share.ts` explicitly pins "schema version stays 2 (additive field, no bump)" and `test/career.ts` asserts `schemaVersion === 2`; the `daily` field is additive and defaults on old saves, so no bump is warranted.
- The daily retry button on the card reads "RETRY TODAY'S CHALLENGE" after a finish (spec's "RACE TODAY'S CHALLENGE" is the fresh-state label; both start the same seeded race).
- `parseDailyLink` accepts positions 1-99 and any valid calendar date (not just the last 14 days) — lenient validation by design; playability is governed solely by `dailyIsLive` (today only, so future-dated links are disabled too).
- Same-document hash changes (e.g. editing the hash in-place) do not re-trigger import — matching the existing `#g=` flow, which only parses at boot. Verified intentionally during QA via fresh loads.

Notes for Phase 4+: the daily's seeded rivals are full `RivalPreset`s — nothing in rivals/race was touched, so Phase 4 tuning deltas propagate to dailies automatically. `recordDailyFinish` is position-first by design; if Phase 6 wants "beat your time" secondary display, `results[dateKey].timeMs` is already the best time for the kept position. The `#d=` import writes nothing to save — a future "add friend's result to HUD" feature can extend `showDailyImport` without save changes.

## Phase 2 — 2 new tracks + GRAND TOUR cup (2026-09-13) ✅

Shipped:

- **`salt-flats` (T13, mesa)** — high-speed speed-palace: 976 m loop of long sweepers (min centerline radius ~31 m only at the start-line wrap, house-style kink shared with dune-rush; everything else ≥ 60 m), 11.5-12 m wide road, gentle 0-4 m elevation, banks ≤ 7° (positive — the loop runs counterclockwise/left), 2 checkpoints, 3 boost pads on the straights (str 11/9/12), no slicks/movers/rings. Authored via a polar star-shaped layout probe (test/tmp, scratch) that guaranteed loop closure + ≥ 36 m non-adjacent road clearance (actual 56 m).
- **`harbor-nine` (T14, neon)** — technical 9-turn street circuit: 954 m, 8.5-9 m narrow road, 0-7 m harbor-terrace elevation, 3 checkpoints, 2 boosts on the two short straights (str 8/7), 1 slick zone mid-lap (d555, 4×24 m), no movers/rings. Nine distinct corners; the eastern-tip hairpin softened from r≈15 m to r≈19 m after a rival-race insurance probe. Banks −20/−14 on the two sweeper arcs (negative = right turns; the loop runs clockwise).
- **Baselines (headless autopilot, laps harness)**: salt-flats **22.18 s** (avg 44 m/s, peak 63.9 m/s on pads), harbor-nine **24.23 s**. Medals calibrated from these: salt 23.5/26.5/31/40 s, harbor 25.5/29/34/43.5 s (×1.05/1.2/1.4/1.8, nearest 500 ms).
- **laps gate → 11/14** (STRICT-exempt set unchanged: canyon-twist, grand-gauntlet, gauntlet-ii). New tracks are NOT exempt — both finish headless with 0 respawns.
- **Dev ghosts**: `--emit-ghosts` regenerated with both new tracks. `test/laps.ts` emit block now carries forward existing ghosts for tracks the current bot can't finish headless (regen = additions/updates only, never deletions) — canyon-twist + grand-gauntlet ghosts preserved byte-identical; the junk `'0'/'1'` keys (artifacts of the old emit line's `r.id ?? r.track` fallback) are gone and can't recur.
- **GRAND TOUR cup** (4th): `salt-flats → harbor-nine (night) → ring-runner (dusk) → serpents-tail (rain)` — all 4 variants in play across cups. Tiers `['easy','mid','pro']`, accent `#7dd8ff`, gridLabel "EASY + MID + PRO GRID". Unlocks when all member tracks unlock (gates on volt-alley + salt-flats medals = the last cup to open, correct for the finale).
- **`tourist` achievement** (additive id, appended last): TOURIST pops on any grand-tour trophy finish. `RivalAchievementState` gained `tourist: number` (count of trophy finishes on `grand-tour`); TRIPLE CROWN untouched at 3 cups (cupsWithTrophy now reaches 4 — pops at 3 as before). Display row added to the achievements screen.
- **Star counter → dynamic**: track-select header shows `★ x/${TRACKS.length * 4}` = 56; Galaxy Brain's progress denominator now dynamic too (0/56). Completionist relabeled **"48★ CLUB"** (display-only def in menus.ts; threshold stays `total >= 48`, progress stays /48). No saved ids touched.
- **`test/career.ts` updated additively**: cup-count check 3→4, grand-tour joined to the roster-capacity + fresh-profile-locked loops, tier-mix check (1 easy + mid + pro), unlock-progression checks (locked until salt-flats medaled), tourist state + TOURIST pop checks, all achievement-state literals gained the `tourist` field. 109 → **119 checks**.

Verified:

- Gates: typecheck ✅, build ✅ (985.44 kB / 370.81 kB gzip, +28 kB: 2 tracks + 2 dev ghosts), `test/laps.ts` **11/14** ✅ (baselines unchanged: sunrise 17.47, dune-rush 23.52, volt-alley 27.90), `test/rivals.ts` **20/20** ✅, `test/career.ts` **119/119** ✅, `test/share.ts` **34/34** ✅, `test/allocs.ts` **PASS** ✅, `test/knockout.ts` **50/50** ✅.
- Headless rival-race insurance on both new tracks (default lineup, 2 laps, autopilot player): all 4 cars finish — salt order P1 APEX / P2 SABLE / P3 JUNO, harbor P1 VESPER / P2 SABLE / P3 ROOKIE; no DNF, no wedge.
- Browser (?mute=1, headless Chrome, evidence `qa/v6-phase2/`, not committed): track grid 14 cards + `★ 0/56` (cards 13/14 with correct accents/subtitles); salt-flats day — wide road, 143 km/h, minimap loop, CP 0/2, boost gates; harbor-nine night (via `?variant=night`) — pink edge reflectors + headlight pools readable, minimap loop, CP 0/3, live split deltas vs the new dev ghost (−0.133 at CP2); slick zone hit confirmed in-page (onSlick replica fired at d=544, lateral 0.4, patch visible on the road); career hub GRAND TOUR card + interstitial "RACE 1/4 · SALT FLATS · 2 LAPS"; grand-tour grid = ROOKIE/ONYX/APEX/YOU (easy/mid/pro, distinct roster members); full rival race on salt-flats finished P1 VESPER / **P2 YOU** / P3 ONYX / P4 ROOKIE. Achievements DOM: `48★ CLUB | 48 stars | 0/48`, `Galaxy Brain … 0/56`, `Tourist … 0/1`. 14.4 s race footage `05-grand-tour-race.webm`.
- Browser autopilot lap on salt-flats: 22.25 s vs 22.18 s headless (deterministic sim confirmed in-browser).

Deviations:

- **Task text's grand-tour tier mix "1 easy + 2 mid + 1 pro" sums to 4 rival slots** — the cup grid is 3 rivals + player (main.ts hardcodes `gridSlot(3)`, CUP_POINTS has 4 entries, knockout/classification all assume 4 cars); a 5-car cup would be a cross-cutting change far beyond Phase 2's data-only scope. Implemented the roadmap's "mid/pro (roster-capacity-guarded like existing cups)" as `['easy','mid','pro']` — a mixed easy/mid/pro tour field, all within roster capacity (3/3/2).
- `--emit-ghosts` previously wrote junk `'0'/'1'` keys (old `r.id ?? r.track` fallback hit array index props); the rewritten emit block keys by `r.track` and carries forward ghosts of unfinished tracks. Net devghosts diff vs HEAD: +salt-flats, +harbor-nine, −2 junk keys; the 9 previously-live ghosts byte-identical, canyon-twist/grand-gauntlet preserved.
- Menus medal-count achievements still say "/12" (Regular/Collector/Midas Fleet/Neima Standard, thresholds 12) — not star totals, so out of Phase 2's enumerated scope (roadmap scopes the pass to hardcoded 48s); flagged for the Phase 6 balance pass.
- One headless-Chrome renderer crash mid-QA (tab reload to title during a recording, ~2 min into a long session) — same documented QA-tooling family from v5/v6-phase1; race re-verified fine in a fresh session, save intact.

Notes for Phase 3+: grand-tour cup id `grand-tour` (save-layer cupSave works for any id — no schema change needed). `RivalAchievementState.tourist` is the pattern to copy if later achievements need cup-specific state. The knockout mode works on the new tracks unchanged (lap-boundary logic is track-agnostic). Daily (Phase 3) can seed from all 14 TRACKS — unlock flow derives from array order, new tracks appended last.

## Phase 1 — Knockout mode (2026-09-13) ✅

Shipped:

- **Knockout racing** on the existing race/rivals plumbing: `RivalManager.knockout` flag + `KNOCKOUT_LAPS = 3` (4 cars = 3 rivals + player, default lineup). At each **lap-line boundary** (leader's first real crossing of each completed racing lap — the same wrap-safe `prev > 0.75len && curr < 0.25len` crossing logic rivals already use in `trackProgress`, with the grid-rollout crossing excluded via the `lapOffset + lapsDone >= 1` guard) the last-place car by `totalProgress` among non-eliminated cars is eliminated **while more than 2 survivors remain**. One elimination per boundary, tracked by `koLapsFired`.
  - Rival eliminated: sim skipped entirely (`if (r.eliminated) continue;` before `car.step`/autopilot — zero per-frame cost), visual despawned (`group.visible = false`), minimap dot dropped, red `"SABLE ELIMINATED"` HUD splash (`.finish-flash.splash-out`, skipped puffs under reduced-motion) + grey smoke puffs (existing `ParticleSystem.driftSmoke`), crowd swell.
  - Player last at a boundary → race ends immediately: `RaceController.finishKnockedOut(position)` → normal finish flow with `FinishResult.knockout = { position }`; position = place among survivors at the KO (P4 at the first boundary). Panel shows `KNOCKED OUT · P4` (`.finish-medal.ko`), RETRY + TRACK SELECT only; no PB/ghost/rival-stat/lifetime writes (knockout is excluded from the rival-era `rivalWins`/`rivalsBeaten` write AND the time-trial stat block — verified in browser: PB null, rivalWins 0, laps 0 after a full KO run).
  - At 2 survivors: no more eliminations; final lap is the duel (`FINAL LAP` chip + splash via the existing finalLap path). Finish decides P1/P2 as normal; P1 → podium (podium order now filters eliminated rows; `enterPodium` accepts a 2-car ceremony for the duel — 3-car podiums unchanged).
- **Standings**: `Standing.eliminated?: boolean` (optional — career test's synthetic standings untouched). Eliminated cars pin to the bottom of the order (key `-1e12 + (999 - koPos)`, so earlier eliminations sit lower: P4-out below P3-out); alive cars rank exactly as before (byte-identical when no one is eliminated). HUD strip greys them (`.standing-row.out` opacity/saturate) with a red `OUT` gap tag; finish panel `finishGap` returns `OUT`; `__race2.standings()` rows carry `eliminated`. Console finish-order log tags `OUT`.
- **Mode chip**: `KNOCKOUT` joins DRIFT ATTACK / RIVALS as a mutually-exclusive trio (`.mode-chip.knockout.on` red gradient). Knockout implies rivalMode (grid start P4, rival HUD, `writesRecords=false`); friend-ghost + career paths clear it; `startTrack` guards `knockoutMode && careerRace === null`.
- **QA hooks**: `__race2.start(i, 'knockout')` (existing `start(i, true)` rivals / `start(i)` time-trial behavior byte-identical); `__race2.state()` gained `knockout`; standings rows gained `eliminated`.
- **`test/knockout.ts`** (new permanent gate, 50 checks): physics sign checks + full 3-lap knockout races mirroring the main.ts step loop (prevLaps → race.update → playerLapEff → rivals.update) on sunrise-sprint + dune-rush (default e/m/p grids), an easy+easy+mid win-grid run, and a scripted slow-player KO run. Asserts: exactly 2 rival eliminations at boundaries L1+L2 with positions P4→P3 (see Deviations for the task text's "3 events"), eliminated rivals never step again (progress+speed frozen snapshot compare), win path finishes with a knockout-free payload + 3 laps + no PB writes, standings classification (alive duelists above OUT rows), P1-win path on the easy grid, forced player-KO ends the race synchronously with `finish.knockout = {position: 4}` and the player row flagged OUT.

Where the check lives: `RivalManager.update()` tail (`src/game/rivals.ts` — `processKnockoutBoundary`), fed by per-rival `lapCrossed` flags set in `trackProgress` and the player's `completedLaps` delta computed in the main.ts step loop (`src/main.ts` sim block). Player KO wiring: `onKnockoutEvent` (main.ts) → `race.finishKnockedOut`.

Verified:

- Gates: typecheck ✅, build ✅ (957.18 kB / 351.20 kB gzip, +3.5 kB vs v2.0.0), `test/laps.ts` 9/12 (same 3 STRICT-exempt; volt-alley 27.90 baseline unchanged) ✅, `test/rivals.ts` **20/20** ✅ (maxGap 41.4m / 103.5m, slow-mo 4108 vs 4108 steps — byte-identical), `test/career.ts` **109/109** ✅, `test/share.ts` **34/34** ✅, `test/allocs.ts` **PASS** (−0.000MB/30s) ✅, `test/knockout.ts` **50/50** ✅.
- Browser (?mute=1, headless Chrome, evidence `qa/v6-phase1/`, not committed):
  - 01: KNOCKOUT chip in the track-select trio, mutual exclusivity verified both directions via chip classes.
  - 08: first elimination — red `HALCYON ELIMINATED` splash, standings strip `4 HALCYON OUT` greyed while LAP 1/3→2/3.
  - 02: second elimination — `SABLE ELIMINATED` splash with both OUT rows pinned bottom.
  - 03: FINAL LAP duel — only 2 cars on track, 2 OUT rows, position 2/4.
  - 04/05: P1 win (finishLine-forced) → finish panel with OUT rows + VIEW PODIUM → 2-car podium (P1 YOU WINNER / P2 APEX +110m), eliminated cars excluded from the ceremony.
  - 06/07: scripted slow player → `KNOCKED OUT` red splash at the lap-1 boundary (0:17.2) → panel `KNOCKED OUT · P4`, RACE RESULT with P4 YOU — OUT, RETRY/TRACK SELECT only; save untouched (PB null, rivalWins 0, laps 0).
- Headless per-track: sunrise-sprint order P1 APEX / P2 YOU / P3 SABLE(OUT) / P4 HALCYON(OUT), elims ROOKIE-set@L1P4 + SABLE@L2P3; dune-rush P1 APEX / P2 YOU / P3 MIRAGE(OUT) / P4 HALCYON(OUT); win-grid sunrise P1 YOU (duel won vs SABLE).

Deviations:

- **Task text said "exactly 3 elimination events fire across a full race"** — with 4 cars and the spec's own ">2 survivors" + "at 2 survivors: no more eliminations" rules, a full race yields exactly **2** mid-race eliminations (lap-1 and lap-2 boundaries) plus the finish-line duel decision. The test asserts 2 per win-path race (at boundaries L1/L2, positions P4/P3) + 1 player-KO event on the forced path; the "3rd event" reading as the finish-line check firing with no elimination is covered by the no-knockout-payload finish assert.
- The elimination check fires at the **leader's** crossing of each lap boundary (first crossing event of a new boundary) rather than waiting for every car to cross — with the grid-rollout crossing excluded (`eff >= 1`), so no start-line elimination. This matches "at each lap-line crossing" while guaranteeing one elimination per completed racing lap; the last-place car is the same at first-crossing as at last-crossing within autopilot spread (±1-3s).
- `start(i, 'knockout')` also clears the drift flag (knockout is a rivals-class mode); `start(i, true)` / `start(i)` behavior untouched.
- Two headless-Chrome renderer crashes (~2-3 min into long WebGL sessions, tab → about:blank) and one agent-browser shell-escaping artifact during QA — same family as the v5 Phase-10 documented QA-tooling artifacts; no game code involved. Worked around with shorter sessions + in-page watchers (splash cloned into `document.body` so it outlives the 2.4s splash window and the finish panel's `clearCenter`).

Notes for Phase 2+: `KNOCKOUT_LAPS` exported from rivals.ts; knockout config is two flags (`rivals.knockout` + 3 laps) — the Phase-3 Daily can reuse it by setting `menu.knockoutMode`-equivalent state + a seeded lineup. `Standing.eliminated` is optional so career/synthetic standings are untouched. The eliminated-row standings key pins OUT rows below alive cars — if Phase 3 needs KO positions in the share payload, `finish.knockout.position` + frozen standings already carry everything needed.
