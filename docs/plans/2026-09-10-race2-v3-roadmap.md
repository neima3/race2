# RACE2 — 10x Development Roadmap v3 (2026-09-10)

## Progress tracker
- [x] Phase 1: Track-side set dressing — instanced theme props + grandstands + billboards
- [x] Phase 2: Road cat-eye reflectors, sun flare sprite, contact shadow blob
- [x] Phase 3: Terrain undulation + water plane (dawn/mesa) + dune shaping (mesa)
- [x] Phase 4: Neon theme glow upgrade — road edge light strips, pylon beacons, scanline grid
- [x] Phase 5: Photo mode (P key / touch button) — freeze, orbit, FOV, hide HUD
- [x] Phase 6: UI transitions & micro-polish (screen fades, card slide-in, hover SFX, medal shine)
- [x] Phase 7: Per-theme procedural music (4 generators) + lap intensity
- [x] Phase 8: Ghost 2.0 — dev ghosts shipped per track, recent-lap ghost slot
- [x] Phase 9: Hazards — moving pillars + timed gates on 3 tracks, void-fall + auto-rescue
- [x] Phase 10: Tracks 13–14, medal balance, final subagent QA, deploy + live verify

**Goal statement (full ambition):** Make RACE2 look like a team-built commercial game: dressed track-side worlds with signature props and lighting, photographic tools, per-theme soundtracks, hazards that create skill moments — while every existing baseline stays green and it still runs 60 fps on mid mobile. STATUS: v1.3 core shipped (phases 1-6 + harness). Hazards (phase 9) and per-theme music generators (phase 7) deferred to v1.4 — noted honestly.

## Ground rules (unchanged)
- Gates per commit: `npm run typecheck && npm run build`. Evidence per phase in `qa/v3-phaseN/`.
- QA hooks `window.__race2`; `?mute=1`/`?touch=1`/`?alltracks=1`; automation auto-mutes.
- Autopilot baselines ±35% (see AGENTS.md); physics conventions sacred; commit per phase `v3 Phase N: <summary>`; push+deploy at Phase 10 only.

---

### Phase 1 — Set dressing
- Theme prop sets (InstancedMesh, 100–250 instances each, placed along track via curve sampling, off-road offsets, min distance from road edge):
  alpine: pine trees (cone+cylinder) + boulders; canyon: cacti (cylinder+arms) + rock spires; neon: glowing pylons + holo billboards; mesa: joshua-ish trees + dune rocks.
- Grandstand block + RACE2 billboards near start/finish (2-3 per track).
- Density scaled by quality tier (low = 40%).
Done: 4 per-theme screenshots, FPS unchanged on low tier.

### Phase 2 — Light details
- Cat-eye reflector posts every ~30m on both road edges (small emissive dots, InstancedMesh, theme accent).
- Sun flare sprite (additive, scale by dot(camera, sun)).
- Contact shadow blob under player+ghost (dark radial sprite, softens when airborne).
Done: screenshots day+night; no perf regression on low.

### Phase 3 — Terrain & water
- Ground plane replaced by large ring-mesh with gentle height noise (visual only, physics unchanged); theme-tinted vertex colors.
- Dawn + mesa themes: animated water plane at fixed low Y (simple sine-displaced shader, reflective-ish color).
- Mesa: dune ridge shapes (stretched smoothed mounds).
Done: screenshots; car physics untouched (driving area still flat).

### Phase 4 — Neon glow upgrade
- Neon theme only: continuous emissive edge light strips (brighter stripes material variant), pylon beacons pulse (sin), grid scanline on ground (shader flag).
Done: before/after neon screenshots.

### Phase 5 — Photo mode
- Press P (or garage-style touch button) during race/replay: freeze sim, free orbit camera around car (pointer drag), FOV wheel/keys, hide HUD, filter cycling (none/warm/cool/mono via CSS filter), snap = canvas toBlob download.
Done: screenshots of photo mode; sim resumes exactly where frozen.

### Phase 6 — UI polish
- Screen transitions: 250ms fade+slide via CSS classes on .screen.
- Track cards animate in with stagger; medal icons shine sweep on finish; button hover blip sound.
- Countdown numbers get theme accent + ring pulse behind.
Done: video/screenshot evidence; no layout regressions mobile.

### Phase 7 — Music 2.0
- Four procedural generators (one per theme), share the layer system: alpine = warm pads + soft arp 100bpm; canyon = plucky pentatonic 96bpm; neon = driving synthwave 124bpm w/ kick+hat; mesa = cinematic swells 84bpm.
- Start/stop on track change; intensity layers retained; menu uses alpine.
Done: generator switch verified via gain probes; no clicks/pops (attack envelopes).

### Phase 8 — Ghost 2.0
- Ship dev ghosts: run autopilot per track at build-authoring time, store serialized ghosts in a TS file (not runtime), load as "RACE2 dev" ghost when no player PB ghost exists.
- Recent-lap ghost slot: toggle between PB ghost and last-lap ghost in settings.
Done: fresh profile sees dev ghost racing; screenshots.

### Phase 9 — Hazards
- Moving pillars: sweep across the road on a sine path (2 per designated track), collision = heavy slowdown + sparks (no damage system).
- Timed gates: pairs of sliding barriers open/close on a cycle; closed = wall.
- Apply to T6, T8, T12 (one hazard type each); autopilot must still finish all three (slow down for closed gates via lookahead collision check).
Done: videos of hazards; autopilot laps pass.

### Phase 10 — Content + release
- T13 "Cactus Canyon" (canyon, hazards, medium), T14 "Pine Line" (alpine, fast flow, rings).
- Medal calibration pass across all 14; achievements tweaked if needed.
- Final subagent QA sweep (desktop/mobile/soak) + deploy + live verify.
Done: v1.3.0 live, all QA green, checklist ticked.
