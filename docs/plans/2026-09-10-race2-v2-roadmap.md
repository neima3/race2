# RACE2 — 10x Development Roadmap v2 (2026-09-10)

## Progress tracker
- [x] Phase 1: Architecture refactor — main.ts into systems (no behavior change)
- [x] Phase 2: Post-processing — selective bloom on high tier (neon/sun pops)
- [x] Phase 3: Car model v2 + animation polish
- [x] Phase 4: Air control physics (TM-style air pitch/yaw)
- [x] Phase 5: Boost rings (air feature) + drift score UI
- [x] Phase 6: Replay system — last-lap replay with cinematic camera
- [x] Phase 7: Progression — stars, track unlocking, profile level
- [x] Phase 8: World life — animated clouds, night fireflies, dawn birds, banners
- [x] Phase 9: Modes & accessibility — practice mode, ghost toggle, reduced motion, lefty touch
- [x] Phase 10: 2 ring-tracks + achievements panel + release QA + deploy

**Goal statement (full ambition):** Push RACE2 to true "wow" territory: post-FX glow, a car that looks handcrafted, air control that enables skill play, a replay system, progression that rewards mastery, and a living world — while keeping 60fps and the entire existing QA baseline green. STATUS: SHIPPED v1.2.0 — 2026-09-10. All phases verified in browser, deployed and live-verified.

## Ground rules for executors (unchanged from v1)
- Gates per commit: `npm run typecheck && npm run build`.
- QA hooks `window.__race2`, test URLs `?mute=1` / `?touch=1`, automation auto-mutes.
- Autopilot baselines ±35%: T1 17.3s, T2 28.9s, T3 21.7s, T4 26.9s, T5 21.3s, T6 20.7s, T7 23.1s, T8 31.1s, T9 30.7s, T10 15.1s.
- Physics conventions in AGENTS.md are sacred (binormal = RIGHT; steer +1 → lateral +).
- Evidence per phase in `qa/v2-phaseN/` (desktop + mobile where UI-relevant). Commit per phase `v2 Phase N: <summary>`.

---

### Phase 1 — Architecture refactor (main.ts → systems)
main.ts has grown past 1100 lines. Extract, with zero behavior change:
- `game/RaceApp.ts` — the Game class, split into: `systems/InputSystem` (already input.ts), `systems/TrackLoader` (load/clear/rebuild scene), `systems/Effects` (slow-mo, boost kick, offroad hint timers), `systems/Garage` (preview renderer + style application).
- Keep `window.__race2` API byte-identical (QA automation depends on it).
Done: typecheck+build green, full autopilot lap on T1 + T3, state() identical.

### Phase 2 — Post-processing bloom (high tier only)
- three/examples UnrealBloomPass via EffectComposer on quality 'high'; scene renders through composer; tone mapping preserved.
- Neon theme: emissive stripes/gates/sun bloom; other themes subtle (threshold high).
- Dynamic-res + bloom co-exist; low/medium tiers unchanged (no composer).
Done: neon track screenshot with visible glow vs medium tier; FPS ≥55 on high-tier desktop.

### Phase 3 — Car model v2
- Beveled/layered body: main tub + side pontoons + tapered nose + diffuser, driver with arms+helmet stripe, accent livery stripes (2nd color derived from paint HSL shift).
- Wheel arches; wheels get brake discs; body style differences kept (standard/aero/tank).
- Exhaust flame anchor used by boost flames; headlight actual SpotLight on neon theme (cheap, one light).
Done: garage screenshots of all 3 styles; in-race screenshots; no perf regression on low.

### Phase 4 — Air control
- In air: steer = yaw (existing, weak), throttle = pitch nose down, brake = pitch nose up (TM-style), damped.
- Landing alignment strengthens if pitch aligned with landing plane (skill expression).
- state() exposes pitch/airControl for QA.
Done: scripted air-control test on a jump (drive+eval), screenshot mid-air pitch, laps unaffected.

### Phase 5 — Boost rings + drift score
- New track feature: air boost rings (torus, additive glow) placed over jumps; flying through = boost + sparkle burst. defs: `rings: {dist, lateral, height, radius}`.
- Drift score: points accrue while drifting (speed × drift), shown as a floating counter; banks into a session total on clean landing; displayed on finish panel.
Done: a track with rings (edit T5 to add rings over its jump), screenshot flying through ring, drift counter visible during drift.

### Phase 6 — Replay system
- Record dense ghost-style samples of the LAST lap always (not only PB).
- Finish screen: "WATCH REPLAY" button → plays back the lap with a cinematic camera: 3s chase, then trackside fixed cam nearest the car every 6s, slow-mo at finish; ESC/click to exit.
- Keep recording cost low (30Hz, reuse ghost serialization; do not persist — session only).
Done: replay watchable end-to-end on T1; ESC exits; screenshots of two camera styles.

### Phase 7 — Progression
- Stars per track: bronze=1★, silver=2★, gold=3★, author=4★ (max 40★).
- Tracks 3+ gated: unlock next track when previous has ≥1★ (setting to disable gating for QA/automation: `?alltracks=1`, hooks bypass too).
- Profile level = total stars → shown in title footer + track select header.
Done: locked track shows lock + star requirement; automation (`start(i)`) bypasses locks; screenshots.

### Phase 8 — World life
- Clouds drift slowly (wind direction per theme); night theme gets fireflies (drifting glow sprites); dawn gets a small bird flock (5-7 V-shapes flapping) circling far.
- Neon roads get a subtle scrolling energy line on the center dashes (shader offset already exists for pads — reuse).
- Finish gate gets a waving banner (vertex sine in shader or cheap CSS-free mesh deformation on CPU at low vertex count).
Done: two 10s-apart screenshots per theme showing motion; FPS unchanged on low tier.

### Phase 9 — Modes & accessibility
- Practice mode: from pause menu — timer hidden, no finish, free roam + respawn; back via pause.
- Ghost race toggle in settings (on by default).
- Options: reduced motion (kills slow-mo/shake/speed lines/vignette), camera shake slider, left-handed touch layout (mirrors pedals/steer), all persisted.
- Medal colors get distinct shapes for colorblind users (done in finish/track cards: ★ count already differs; add icon shape suffix).
Done: screenshots of options; practice mode functional; reduced motion verified (shake absent).

### Phase 10 — Content + release
- T11 "Ring Runner" (alpine, rings over canyon gap chain), T12 "Volt Alley" (neon, technical + rings) — use new features.
- Achievements panel (title screen): first win, all-gold, drift 50k, air time 60s, etc. — persisted.
- Full subagent QA sweep (desktop/mobile/soak/gamepad) on final build; deploy via Coolify; live verification incl. one full autopilot lap + screenshots.
Done: v1.2.0 live, all QA green, roadmap ticked.
