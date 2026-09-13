# RACE2 — 10x Development Roadmap v6 "Knockout & Daily" (2026-09-13)

## Progress tracker
- [x] Phase 1: Knockout mode — lap-based elimination racing
- [x] Phase 2: 2 new tracks + GRAND TOUR cup
- [x] Phase 3: Daily Challenge — seeded race of the day, streaks, result sharing
- [x] Phase 4: Feel & honesty polish — real stat deltas, night tuning, speed feel, audio probes
- [ ] Phase 5: Offline PWA + first-run onboarding
- [ ] Phase 6: Release QA + v2.1.0 + deploy + live verify

**Goal statement (full ambition):** Give RACE2 staying power: a knockout mode that creates elimination drama, two genuinely new tracks plus a fourth cup, a daily seeded challenge with streaks and shareable results, stat-honest cars, night races that read beautifully, and a game that plays offline after the first visit — shipped as v2.1.0, all gates green, verified live and muted.

**Grounding (verified 2026-09-13 at 925920e):** v2.0 live on race2.neima.me (rivals, career ×3 cups, weather, ghost share, podium). Confirmed gaps: no service worker (offline impossible); garage DRIFT/ACCEL bars identical across bodies because tuning deltas never touch `driftGrip`/`accel` (menus.ts:438 honest-but-flat); night variant relies on `ambientDim` scalars (environment.ts:425-428) and reads slightly muddy; only 12 tracks / 3 cups; single-shot modes (no daily hook). Version string currently "v2.0.0".

## Ground rules (same as v5)
- Gates per phase: `npm run typecheck && npm run build`; harness `npx tsx test/laps.ts` (STRICT-exempt: canyon-twist, grand-gauntlet, gauntlet-ii), `npx tsx test/rivals.ts` (20/20), `npx tsx test/career.ts` (109/109), `npx tsx test/share.ts` (34/34), `npx tsx --expose-gc test/allocs.ts` (PASS). New tests added by phases join the gate list permanently.
- ALL browser QA muted: `?mute=1` + `navigator.webdriver` auto-mute. Never unmute.
- Physics conventions sacred (AGENTS.md). Steering-direction check after any car.ts/curve.ts touch.
- Time-trial semantics untouched. Save: additive default-merge on the versioned store; never wipe, never rename keys.
- Commit per phase `v6 Phase N: <summary>`. Deploy at Phase 6 only (Coolify, build-from-git-main → push first). Verify live muted + screenshot.
- Autopilot baselines ±35%: T1≈17.5s, T2≈30.8s, T3≈21.7s, T4≈28.4s.

---

### Phase 1 — Knockout mode
- `RaceController`/`RivalManager`: optional `knockout` config — 3 laps, 4 cars. At each lap-line crossing, the last-place car that is NOT yet eliminated and NOT the player-protected leader is eliminated: rivals despawn (visual smoke puff + "SABLE ELIMINATED" toast in existing banner style); if the PLAYER is last at a lap line → race over immediately ("KNOCKED OUT" finish panel with position).
- Final lap = 1v1 duel (after lap-2 elimination). Finish → normal rival finish flow + podium if P1. Standings rows show eliminated cars greyed with "OUT" tag (existing strip pattern).
- Mode select: "KNOCKOUT" chip joins RIVALS/DRIFT (mutually exclusive trio, same UI row). Knockout never writes PB/ghost/drift stats (same guard as rival mode). Daily (Phase 3) may reuse it later.
- QA hooks: extend `__race2.standings()` rows with `eliminated: boolean`; `__race2.start(i, 'knockout')` convenience.
- New headless test `test/knockout.ts`: autopilot player on sunrise-sprint + dune-rush — exactly 3 eliminations fire at lap lines, eliminated rival stops consuming sim (assert), player P1 win path + player-eliminated path both covered. Exit 1 on failure.
- Files: `src/game/race.ts`, `src/game/rivals.ts`, `src/main.ts`, `src/ui/menus.ts`, `src/ui/hud.ts`, new `test/knockout.ts`.
- Done: gates + new test green; muted screenshots of elimination toast + greyed standings row; commit `v6 Phase 1`.

### Phase 2 — 2 new tracks + GRAND TOUR cup
- `salt-flats` (mesa): high-speed oval-ish sweepers, wide road (12m), 2-3 boost pads, minimal elevation — a speed track. `harbor-nine` (neon): technical 9-turn street circuit, narrow (9m), 1 slick zone, night-prone (cup assigns variant).
- Author with the existing control-point/width/bank schema; verify: autopilot laps BOTH headless (they join `test/laps.ts` roster → expect "11/14" with same STRICT policy; if a new track wedges headless, fix the track shape not the bot), medals calibrated from autopilot baseline (author ×1.05, gold ×1.2, silver ×1.4, bronze ×1.8; P6 balance-pass finalizes), dev ghosts regenerated (`--emit-ghosts`), checkpoints/boosts placed, minimap auto-renders (data-driven — verify visually), star counter becomes dynamic `x/{TRACKS.length*4}` = 56 (menus.ts:121 + any hardcoded 48s EXCEPT the Completionist achievement which stays 48★, relabel "48★ CLUB" — no id renumber).
- New cup GRAND TOUR: `salt-flats → harbor-nine (night) → ring-runner → serpents-tail`, tier mix mid/pro (roster-capacity-guarded like existing cups), unlock when member tracks unlock. Trophy feeds a new additive achievement `tourist` ("TOURIST — win the Grand Tour"); TRIPLE CROWN stays 3-cups (do not renumber).
- Files: `src/track/defs.ts`, `src/game/career.ts`, `src/game/achievements.ts` (or wherever Phase-10 ids live), `src/ui/menus.ts`, `src/track/devghosts.gen.ts` (regen), `test/laps.ts`.
- Done: gates green incl. 11/14; muted screenshots of both tracks (day + night) with minimap; grand tour visible in career hub; commit `v6 Phase 2`.

### Phase 3 — Daily Challenge
- Seed = UTC date string → deterministic hash → picks: track (rotation across all 14), variant (day always for fairness), rival lineup + tier mix (fixed spicy mix: 1 easy + 2 pro), laps (2). Same race for everyone that day.
- Flow: title screen gains DAILY entry (with streak count text, no emoji) → single daily race per day → result saved: `daily: { lastDate, streak, best: {[date]: positionMs} }` (additive). Replaying the same day = retry (best result kept, no streak double-count).
- Streak: +1 per day with a finished race (any position), reset when a day is skipped. Displayed on the DAILY button + finish panel ("STREAK 4").
- Share: result code in URL fragment `#d=<yyyymmdd>.<pos>.<timeMs>` (tiny, no codec) → recipient sees "DAILY CHALLENGE — beat my time" card → RACE loads the same seeded daily. Clipboard fallback + toast (existing pattern). Clear hash after import (existing Phase-7 behavior).
- Headless: `test/daily.ts` — seed determinism (same date → same track/lineup; different dates → variation), streak logic incl. skip-reset, share-code round-trip. Exit 1 on failure.
- Files: new `src/game/daily.ts`, `src/main.ts`, `src/ui/menus.ts`, `src/core/save.ts`, new `test/daily.ts`.
- Done: gates + new test green; muted screenshots (title DAILY button, daily finish with streak, shared-card import); commit `v6 Phase 3`.

### Phase 4 — Feel & honesty polish
- Stat honesty: bodies gain small drift/accel deltas — aero `driftGrip +4%` (looser, rewards skill), tank `accel +5%` — verify harness ×3 bodies all 11/14 in band; garage bars now differentiate (screenshots).
- Night tuning: raise `ambientDim` floor for night (target: mesas/road clearly readable in screenshot at a glance), brighten headlight pools slightly, star brightness +10%. A/B screenshots day/night on mesa + neon themes.
- Speed feel: audit existing FOV/speedline response — add a subtle high-speed FOV widen (+4° at >45 m/s, eased) if missing; reduced-motion skips it.
- Audio probes: headless assertions that overtake chime, GO stinger, crowd swell, music kick change their bus gains when their events fire (WebAudio in headless — assert gain param values, not sound). Report the probe table.
- Files: `src/physics/car.ts` (tuning constants only), `src/systems/garage.ts`, `src/render/environment.ts`, `src/render/camera.ts`, `src/core/audio.ts`/`music.ts` (probe API), `src/ui/menus.ts`.
- Done: all gates green; A/B screenshots; probe table; steering-direction check after car.ts touch; commit `v6 Phase 4`.

### Phase 5 — Offline PWA + first-run onboarding
- Service worker: precache all build assets (hashed names from Vite manifest — use `vite-plugin-pwa` ONLY if trivially compatible, otherwise a tiny hand-rolled sw + build step injecting the asset list; prefer hand-rolled to avoid dep risk). Strategy: app shell + assets cache-first, versioned by content hash, updated on reload; never cache cross-origin. Game must fully boot + play a time-trial offline (browser offline profile screenshot as proof).
- Manifest already exists (PWA icons) — verify `display: standalone` + theme color correct; bump icons if version visible.
- Onboarding: first-run overlay (save flag) — 3 compact cards: steer/brake keys (or touch), drift + boost tips, "career or daily?" nudge. Dismiss-once, respect reduced-motion. Contextual firsts: first rival race shows a one-line "Finish P2 or better to score points" hint under the standings (auto-fades).
- Files: `vite.config.ts`, new `public/sw.js` + registration in `src/main.ts`, `index.html`, `src/ui/menus.ts` (overlay), `src/core/save.ts` (flag).
- Done: gates green; offline boot proof (devtools offline screenshot, muted); first-run overlay screenshot; commit `v6 Phase 5`.

### Phase 6 — Release QA + v2.1.0 + deploy
- Balance pass: knockout pacing (elimination margins feel fair — telemetry from headless runs), new-track medals vs playtest times, daily difficulty (pro rivals should be beatable by a silver-level player ~50% of days).
- Full subagent QA sweep (ALL muted `?mute=1`): desktop knockout win + knocked-out path; daily race + streak + share-import round-trip in fresh profile; new tracks in career grand tour; offline boot; touch spot-check; reduced-motion; old-profile migration.
- Version bump 2.1.0 (title string + manifest + sw cache name), commit, push, Coolify deploy (POST `https://cool.neima.me/api/v1/deploy?uuid=qgpdmafn677kx6aoiahrlfyy`, token via 1Password — never `source` it), poll to finished.
- Live verify (muted): v2.1.0 string served, knockout race runs, daily button + streak visible, one new track laps via autopilot, screenshot set in `qa/v6-live/`. Update AGENTS.md + tick checklist + progress log.
- Done: v2.1.0 live, all gates green, checklist ticked.
