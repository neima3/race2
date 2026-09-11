# RACE2 — 10x Development Roadmap (2026-09-10)

## Progress tracker
- [ ] Phase 1: Game feel & car dynamics depth
- [ ] Phase 2: Per-track visual themes (4 environments)
- [ ] Phase 3: Content — 4 new tracks (5–8)
- [ ] Phase 4: Time-attack depth — splits, deltas, top-10
- [ ] Phase 5: HUD/UI 2.0
- [ ] Phase 6: Audio 2.0 — adaptive layers + theme ambience
- [ ] Phase 7: Garage — paint + body variants
- [ ] Phase 8: Performance & mobile hardening
- [ ] Phase 9: Juice & polish sweep
- [ ] Phase 10: Bonus content + release QA + deploy

**Goal statement (full ambition, not sliced):** Make RACE2 a genuinely fun, visually stunning, professional Trackmania-class browser racer: 8 tracks across 4 distinct visual themes, deep time-attack (splits, deltas, top-10), a garage, rich game feel, adaptive audio, 60 fps on mid mobile — shipped to race2.neima.me with full QA evidence.

## Ground rules for executors
- Gates before every commit: `npm run typecheck && npm run build`.
- QA hooks: `window.__race2` (see AGENTS.md). Test URLs: `?mute=1`, `?touch=1`. Audio auto-mutes under automation.
- Autopilot baselines (must stay within ±35%): T1 17.3s, T2 28.9s, T3 21.7s, T4 26.9–28.4s.
- Never break the binormal/lateral conventions (see AGENTS.md gotchas).
- Evidence per phase: screenshots (desktop 1280×720 + mobile 390×844) saved to `qa/phaseN/`.
- Commit after each phase with message `Phase N: <summary>`.

---

### Phase 1 — Game feel & car dynamics depth (files: physics/car.ts, render/*, core/audio.ts, main.ts)
Objective: the car should feel alive.
- Visual body roll/pitch: chassis tilts into accel/brake/corners via a visual-only spring (wheel/suspension illusion).
- Persistent skid marks when drifting (fading ribbon mesh pool, capped ~600 segments).
- Landing squash + small dust burst scale by air time.
- Engine audio: 6-speed RPM ladder (pitch resets per gear, subtle shift blip).
- Camera: boost FOV kick +10° decaying, drift slight roll-in, landing shake scale by air time.
Done: drift shows marks + smoke + shift blips; screenshots mid-drift; autopilot laps still complete.

### Phase 2 — Per-track visual themes (files: render/environment.ts, track/defs.ts, builder.ts, main.ts)
Objective: each track = its own world. Theme spec per track id in defs (`theme` field): sky top/mid/horizon colors, sun position/intensity, fog color+near/far, ground color, prop palette + density, light warmth.
- T1 Alpine Dawn: pale blue→pink sky, low warm sun, white-capped gray rocks, green-ish ground.
- T2 Red Canyon Dusk (current look, formalized).
- T3 Night Neon: dark indigo sky + stars, cyan/magenta accents (boost pads/stripe glow brighter), city-ish glow blocks on horizon.
- T4 Golden Mesa Sunset (deep orange, long shadows).
- Theme-aware checkpoint gate + boost pad colors; environment.update keeps sky/ground following camera.
Done: 4 distinct screenshots (one per track), fog/sky match spec, no FPS regression on low tier.

### Phase 3 — Content: tracks 5–8 (files: track/defs.ts; maybe new feature types in curve/builder)
Objective: double the content with real variety.
- T5 Dune Rush (easy, wide, fast, big jumps) — alpine dawn.
- T6 Serpent's Tail (technical narrow esses, medium) — red canyon.
- T7 Neon vertical (loop + wallride-style high bank + short corkscrew) — night neon.
- T8 Gauntlet II (expert, everything, ~1.4km) — golden mesa.
- New feature: `narrow` width dips (min width 4.5) and `highBank` sections (45–55°) — verify drivable.
- Medal times set from autopilot lap (author = bot+6%, gold +12%, silver +22%, bronze +45%).
Done: autopilot finishes each new track; per-track screenshots; medal times recorded in defs.

### Phase 4 — Time-attack depth (files: game/race.ts, core/save.ts, ui/hud.ts, ui/menus.ts)
Objective: Trackmania-style split feedback.
- Checkpoint split deltas vs your PB ghost (−0.42 green / +1.10 red, shown 1.6s).
- Finish screen: per-checkpoint delta table + best/median of session.
- Top-10 times list per track (track select detail or finish screen panel), persisted.
- Live "vs ghost" delta near timer (ghost time at player's current dist − player time).
Done: screenshots of green/red splits, finish delta table, top-10 panel; saves schema v2 with migration from v1.

### Phase 5 — HUD/UI 2.0 (files: ui/*, styles.css)
Objective: professional racing UI.
- Track progress bar (bottom center): CP ticks, player dot, ghost dot.
- Redesigned speedo: arc gauge (SVG/canvas), gear number, km/h.
- Countdown: theme-accent colored, scale/fade, GO sting.
- Finish panel: medal reveal animation, delta table, next-track preview color.
- Main menu: slow orbiting track camera already exists — add subtle vignette + logo shimmer, version footer.
- Mobile: verify no overlap at 390×844 and 844×390 (progress bar hides on touch, speedo repositioned).
Done: desktop + mobile screenshots of HUD mid-race, countdown, finish.

### Phase 6 — Audio 2.0 (files: core/audio.ts)
Objective: adaptive, theme-aware soundscape.
- Music: 3 intensity layers (calm menu, cruise, boost/final-lap) crossfaded by speed/state.
- Wind rush by speed; skid noise gain follows driftAmount; landing thud scale by air time.
- Theme ambience: dawn birds (T1), canyon wind (T2), night synth pad (T3), evening waves-ish noise (T4).
- All procedural; verify via analyser/gain inspection + code review (automation is muted).
Done: layer switching verified by gain probes at 0/40/90% speed; no audio errors in console.

### Phase 7 — Garage (files: ui/menus.ts, render/car-model.ts, core/save.ts)
Objective: player identity.
- Garage screen: 10 paint colors + 3 body styles (Standard, Aero, Tank) rendered as live 3D preview (separate small renderer or scene swap).
- Persisted in save; player's paint used by ghost too; finish screen shows your car.
Done: screenshot of garage with each style; paint persists across reload; ghost wears paint.

### Phase 8 — Performance & mobile hardening (files: render/*, main.ts)
Objective: 60 fps mid-mobile, stable desktop.
- Merge static track geometry into few draw calls (props instanced already; merge rocks/mesas into instanced meshes).
- Dynamic resolution: monitor frame time, scale pixelRatio 1.0–1.8 stepwise.
- Shadow tune: shadow camera bounds per tier; disable shadows on low.
- Memory: dispose theme switch resources.
Done: FPS probe evidence (rAF counter) ≥55fps avg in a 2-min soak on medium tier; mobile viewport soak without crashes.

### Phase 9 — Juice & polish sweep (files: render/particles.ts, main.ts, ui/*)
Objective: make moments memorable.
- Speed lines at >70% max speed (screen-space shader quad, subtle).
- Finish-line slow-mo: 0.35× time for 0.8s as you cross, then normal.
- Checkpoint ring pulse + radial flash; medal confetti burst color = medal tier.
- Vignette + slight desaturation at high speed; sun flare sprite.
Done: video of finish-line slow-mo + confetti; screenshots; autopilot times unaffected (±5%).

### Phase 10 — Bonus content + release (files: track/defs.ts, ui/menus.ts, qa)
Objective: ship it.
- T9 + T10 bonus tracks (one theme mashup "Twilight Gauntlet", one sprint "Neon Circuit").
- Credits screen + version stamp; README screenshots section.
- Full subagent QA sweep: desktop all-tracks, mobile touch, gamepad path, 10-min soak on new build.
- Deploy via fleet (coolify) and verify live with autopilot on 3 tracks + screenshots.
Done: live URL serving new build, all QA green, this checklist fully ticked.
