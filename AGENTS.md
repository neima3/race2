# RACE2 — Agent Notes

## Commands
- `npm run dev` — Vite dev server (default port 5173)
- `npm run build` — production build → `dist/`
- `npm run typecheck` — `tsc --noEmit` (strict; run before committing)
- `node scripts/make-icons.mjs` — regenerate PWA icons
- `npx tsx test/variants.ts` — free-play variant gate (4 variant laps, dry-ledger policy through the real finish path, theme map)
- `npx tsx test/draft.ts` — slipstream gate (pocket build/decay, +8% top speed, traffic draft, solo no-op)
- `npx tsx test/laps.ts` — headless time-trial harness (16/16; `--body=standard|aero|tank|glide` runs the roster per body — v10 GLIDE = driftGrip −10% (longest slides; NOTE: driftGrip is the slide-DECAY rate, lower = longer), accel −4%, grip −2%; originally authored by a v10 roadmap; since the v7 geometry repairs — canyon-twist/grand-gauntlet/gauntlet-ii used to wedge on seam folds, now fixed; `--body=aero|tank` runs the same roster with that body's tuning, `--emit-ghosts` regenerates dev ghosts)
- `npx tsx test/camera.ts` — camera-suite gate (28 checks: chase byte-identity vs v2.2, per-mode frustum/ahead-facing, mid-lap cycling)
- `npx tsx test/ghostbattle.ts` — multi-ghost gate (39 checks: slot filling/dedupe, battle rank, finish deltas, no per-frame allocs)
- `npx tsx test/traffic.ts` — traffic-mode gate (16 checks: finishes, natural near-miss, collision recovery, constant density, step integrity)
- `npx tsx test/weekly.ts` — weekly-event gate (116 checks: ISO-week keys, seed determinism, 4-modifier rotation, modifier plumbing, resume, streaks, `#w=` round-trip)
- `npx tsx test/stats.ts` — paint-unlock/stats gate (64 checks)
- `npx tsx test/tutorial.ts` — tutorial state-machine gate (73 checks)
- `npx tsx test/replay.ts` — replay-theater gate (34 checks: scrub determinism, speed scale, buffer eviction)
- `npx tsx test/rivals.ts` — headless rival-race gate (20 checks: steering sign, lateral sign, 2-lap races on sunrise-sprint + dune-rush, slow-mo accumulator integrity, rubber-band gap <120m)
- `npx tsx test/career.ts` — career gate (119 checks incl. difficulty-curve pins: street cup = autopilot silver, never P4; roster-capacity guard on cup tier mixes; rival-era stats migration)
- `npx tsx test/share.ts` — ghost-share codec gate (34 checks)
- `npx tsx test/knockout.ts` — knockout gate (50 checks: eliminations at lap boundaries, frozen sim, win + player-KO paths)
- `npx tsx test/daily.ts` — daily-challenge gate (59 checks: seed determinism + 30-day rotation, streak matrix, save sanitize/round-trip, `#d=` link round-trip)
- `npx tsx test/probe.ts` — audio-probe gate (61 checks: overtake chime, GO stinger, crowd swell, music intensity layer fire + envelope movement on a virtual-clock AudioContext mock; exit 1 on no movement)
- `npx tsx --expose-gc test/allocs.ts` — headless allocation probe (must PASS; catches per-frame churn)

## Architecture (src/)
- `core/` — loop, input (keyboard/gamepad/touch + test hooks), save (localStorage), audio (all procedural WebAudio), events
- `track/curve.ts` — Catmull-Rom centerline → parallel-transport frames w/ banking; `surfaceQuery` is the physics ground truth
- `track/defs.ts` — the 16 tracks (control points, widths, banks, checkpoints, boosts, slicks, movers, medal times) + 4 themes
- `track/builder.ts` — road/skirt/stripe/gate/pad mesh generation
- `physics/car.ts` — arcade car: yaw-rate steering capped by lateral-g budget (38 m/s²), grip/drift, boost, wall scrub, align-to-frame (loops/banks work because the car snaps to the road frame); `placeAt(dist, lateral)` = grid/respawn placement via road frame
- `game/race.ts` — countdown/timer/checkpoints/finish/ghost record+serialize; finish requires real progress (>92% track) per lap; multi-lap via `opts {laps, writesRecords}` (time-trial = defaults); wrap-safe progress `totalProgress = (lapOffset + lapsDone) * len + dist` (lapOffset = −1 when starting past 50% of track)
- `game/rules.ts` — shared per-car surface rules (boost pads, slick zones, mover overlap) used by both player and rivals
- `game/rivals.ts` — `RivalManager`: 3 AI rivals (easy/mid/pro tiers = CarPhysics tuning deltas + autopilot skill {pace, lookaheadJitter, steerNoise, lookaheadScale}), grid start (player P4), rubber band (±8%, 10m dead zone), stuck respawn, per-car boost/slick/mover rules, standings with finish-rank classification. Tier params (v2.0 balance): easy pace .94/ls 1.3, mid .955/ls 1.3, pro 1.0/ls 1.15 + pro tuning {accel 1.05, maxSpeed 1.025}. Knockout (`knockout` flag + `KNOCKOUT_LAPS` 3): at each lap-line boundary the last-place car is eliminated while >2 survive (`processKnockoutBoundary`); eliminated rivals skip the sim entirely and pin greyed `OUT` rows to the standings bottom; player-last-at-boundary → `finishKnockedOut` race end; knockout never writes PB/ghost/lifetime stats
- `game/career.ts` — 5 cups (v10 +APEX LEAGUE: summit-run dusk → halo-flats night → volt-alley day → grand-gauntlet rain, all-pro grid, SOVEREIGN defends R4; unlock = grand-gauntlet+volt-alley chain AND any GT trophy): SPRINT (easy+easy+mid, forgiving), STREET (mid+pro+pro, medium — autopilot lands silver), GAUNTLET (pro+pro+mid, spicy), GRAND TOUR (easy+mid+pro across salt-flats/harbor-nine/ring-runner/serpents-tail with day/night/dusk/rain — all 4 variants in play); cup tier mixes are roster-capacity-guarded (pro roster = 2, a third pro slot would duplicate APEX)
- `game/daily.ts` — Daily Challenge: seed = FNV-1a('race2-daily:' + UTC YYYYMMDD) → track (no consecutive-day repeats), lineup 1 easy + 2 pro, 2 laps, day variant; `dailyFor(dateKey)` deterministic; `recordDailyFinish` in save.ts keeps best result per day (position, then time) and computes streaks (yesterday→+1, same-day→keep, gap→1); share/import via `#d=<dateKey>.<pos>.<timeMs>` hash; daily never writes PB/ghost/cup/lifetime stats
- `game/achievements.ts` — rival-era achievement state + pop detection (FIRST BLOOD, CUP CADET, TRIPLE CROWN, SOCIAL CLIMBER, FULL HOUSE, TOURIST); stats live in lifetime `rivalWins`/`friendGhostRaces`/`rivalsBeaten` (additive save fields). Display-only rows in menus.ts keep denominators dynamic off `TRACKS.length` (14) except 48★ CLUB (intentionally 48★)
- `systems/autopilot.ts` — pure-pursuit + curvature lookahead; optional `skill` param for rivals (identical behavior when omitted)
- `game/share.ts` — compact ghost codec (15Hz, 16-bit bbox-relative pos, smallest-three quat, transposed planes + deflate) → `#g=v1.<track>.<time>.<code>` URL share/import
- Offline PWA: `dist/sw.js` is generated at build time by the `race2ServiceWorker` plugin in `vite.config.ts` (asset list inlined, cache name = content hash of the asset list → any content change = new cache, old cache deleted on activate). Network-first navigations, cache-first assets, same-origin GET only. Registered in `main.ts` (PROD only — dev never registers). First-run onboarding overlay + once-per-mode contextual HUD hints (`hud.ts showContextHint`, `settings.onboarded/hintRival/hintKnockout` — optional flags, old saves default-merge)
- Version string: `v2.5.0` lives in `menus.ts` title credits + `package.json`; the sw cache name needs no version constant (content-hash-derived). Title shows on the credits line only
- Car bodies: standard/aero/tank = real `CarTuning` deltas (aero +5% top −4% grip; tank +6% grip −4% top +8% boostKick); aero unlock 12★, tank unlock any cup trophy; single car-agnostic PB ledger
- Weather variants (`dusk|night|rain`) via uniform swaps + `rules.ts` grip plumbing (`RAIN_GRIP_MULT 0.82`, floor 0.32× combined); cups assign variants, free-play stays day; `?variant=` dev override
- `game/variants.ts` — free-play variant policy: day writes records, dusk/night/rain run dry (`race.writesRecords=false`, replay still recorded); settings.variant + `__race2.variant()`; `?variant=` dev override keeps priority
- `game/draft.ts` — slipstream: pocket 4-9m behind + |Δlat|<2.2 + CLOSING; build 0.5s → +8% top speed (car.ts `draftFactor` param, default 1 byte-identical); player-only, rivals/knockout/traffic scopes (career/daily/weekly excluded — autopilot exploit); ghosts never draft
- Replay share: `#r=v1.<track>.<time>.<code>` same ghost codec, 30Hz, 90s cap; theater import labeled FRIEND REPLAY; session-only
- Rival roster 12 (v9 +NOVA/KESTREL/VESUVIUS/SOVEREIGN-champion); bodies 4 (v10 +GLIDE, unlock = beat SOVEREIGN); achievements 18 (v10 +APEX CHAMPION/GLIDE RIDER/RINGMASTER) {accel×1.07, maxSpeed×1.04}); champion rides GT race 4; `V230_POOL_DEPTH` freezes pre-v9 lineup pools so seeded lineups stay byte-stable; per-rival banter splashes; KINGMAKER/DRAFT KING/STORM CHASER/DIRECTOR achievements
- `game/traffic.ts` → `systems/traffic.ts` — kinematic traffic mode (10-14 cars, `dist += v·dt` along fixed lanes, wrap-safe; contact band Δlat<1.5 scrubs player, [1.5,2.2) clean-pass corridor = NEAR MISS, 5 credited × −0.15s at finish; per-track `trafficBest`)
- `game/weekly.ts` — Weekly Event: seed = FNV-1a('race2-weekly:' + ISO `GWWWW`) → 3 tracks/lineup + modifier rotation (rain-finals/night-owl/slick-mayhem/boost-fest; slick-mayhem SYNTHESIZES patches on slick-less tracks); career-style run resume + streaks + `#w=` share
- `game/tutorial.ts` — 4-drill guided tutorial (steer/boost/drift/brake) on sunrise-sprint, practice rules, 3 tries → auto-skip; fresh profiles only (pre-v8 profiles get `tutorialDone=true` at migration — never force veterans)
- `game/stats.ts` — driverStats() source for the STATS panel; lifetime `nearMisses/distanceKm/knockoutWins/rivalWinsBy`, `unlocks.paints[]` (4 locked paints: knockout win / 7-day streak / 25 near-misses / weekly gold)
- `render/camera.ts` — 3 modes (CHASE byte-default / CLOSE / HOOD) + FOV slider 60-100 (base −10 for chase/close; HOOD forces 70); C cycles; `settings.cam/fov`
- Replay theater: scrub/speed(0.25/0.5/1)/camera-cycle over a 5-slot in-session buffer; sample lookup shared with photo anchor
- `render/` — environment (per-theme lighting rig, sky shader w/ soft sun + haze + night-only stars, instanced soft clouds, ground/landform disposal patterns), `terrain.ts` (themed ground textures, grounded 2-tone landforms, ridge silhouette rings, GROUND_Y), `roadTextures.ts` (asphalt/wear/curb/banner canvases — keep colorSpace SRGB on any new CanvasTexture), props (clustered placement + variants + palette jitter), car model, particles, camera rig (speed FOV)
- Track geometry (v7 repairs): control-point seam folds/kinks on 8 tracks fixed (canyon-twist, sky-loop over/underpass bridge, grand-gauntlet, neon-vertical hairpin, gauntlet-ii, twilight-gauntlet, ring-runner, volt-alley) — harness is 14/14; geometry conventions: strands must not fold below dy −3 near the seam, keep tangent continuity at the wrap point (`test/tmp/geo-*.ts` harnesses)
- `ui/` — HUD, menus, touch controls; DOM only, no framework

## Conventions gotchas
- three.js car local +x is the car's LEFT; basis matrices must be `(normal×tangent, normal, tangent)` — improper (mirrored) matrices silently produce garbage quaternions
- `binormal = tangent × normal` = road RIGHT; lateral positive = right
- Sim runs fixed 120 Hz; dt clamped to [0, 0.25] (RAF/performance.now drift after reloads)
- Binormal/lateral sign flips are the #1 regression risk — verify steering direction after touching curve.ts/car.ts

## QA hooks (window.__race2)
`start(i, rivals?)` (`true` = rivals, `'knockout'` = knockout), `auto(bool)` (pure-pursuit autopilot), `drive({steer,throttle,brake,drift})`, `state()` telemetry, `skipCountdown()`, `respawn()`, `mute()`, `rivals()` (per-rival telemetry), `standings()` (live order; rows carry `eliminated`), `finishLine()` (teleport-to-line QA cheat — defeated by the 92%-per-lap anti-cheat mid-lap), `startDaily()`, `daily()`, `audioProbe()`, `startWeekly()`, `weekly()`, `startTutorial()`, `tutorial()`, `cam(mode?)`, `traffic()`. URL: `?mute=1`, `?touch=1`, `?alltracks` (unlock override), `?variant=`. Audio auto-mutes under `navigator.webdriver`.

## Known QA baselines (autopilot, mute=1)
Track laps: T1 ≈ 17.5s, T2 ≈ 30.8s, T3 ≈ 21.7s, T4 ≈ 28.4s; salt-flats ≈ 22.2s, harbor-nine ≈ 24.3s (browser ≈ headless, deterministic). Medal times in defs.ts are calibrated to these. Knockout pacing (3-lap, default e/m/p grid): autopilot reaches the duel on 4/4 probed tracks, elimination margins 0.3–35m (balance harness: `npx tsx test/tmp/ko-balance.ts [easy,mid,mid]`). Daily difficulty (10 seeded days): autopilot P1×3 / P3×5, P4 only on the 2 headless-exempt wedge tracks (`npx tsx test/tmp/daily-balance.ts 10`). NOTE: v7 road/curb/embankment geometry is visual-only — road collision surface unchanged; curbs sit +0.025 flush with no grip effect.

## Deploy
Static build in Docker (nginx) → Coolify `cool.neima.me` → race2.neima.me. App UUID `qgpdmafn677kx6aoiahrlfyy`; deploy = POST `https://cool.neima.me/api/v1/deploy?uuid=<uuid>` (token in 1Password "cool.neima.me coolify api" — do NOT `source` it, `|` breaks shell). Builds from git main, so push first. Verify live with `?mute=1` + autopilot + a rival race (`standings()`).
