# RACE2 — 10x Development Roadmap v7 "Beautiful Worlds" (2026-09-13)

## Progress tracker
- [x] Phase 1: Lighting, sky & atmosphere overhaul
- [x] Phase 2: Ground & landforms — kill the floating black diamonds
- [x] Phase 3: Road & trackside quality
- [x] Phase 4: Props density, clusters & scatter
- [x] Phase 5: Track geometry audit + full gameplay QA sweep (subagents)
- [ ] Phase 6: Title/menu polish + v2.2.0 + deploy + live verify

**Goal statement (full ambition):** Make RACE2 look like a premium, art-directed arcade racer: warm contrasty lighting, themed living ground instead of a placeholder disc, grounded well-lit landforms with depth layers, quality asphalt with edge lines and apex curbs, dense varied props, a neon theme that reads as a night city — verified by subagents actually playing every theme and mode in the browser (muted), harness green, perf budgets held, shipped as v2.2.0 and live-verified.

**Grounding (verified 2026-09-13, screenshots in `qa/v7-ground/`):** Current visual verdict per theme — alpine day: giant flat-black faceted boulders FLOATING overhead, dead-flat green disc with faint grid, flat white blob clouds, stars visible in day sky, weak car contact shadow. Mesa day: same floating diamonds, sun is a hard white disc, ground reads green (should be sand). Canyon day: huge unlit brown blobs ON the roadside (occlude the car), flat clouds, grid lines on ground. Neon "day": world is nearly pitch black — ground invisible, track floats in a void; edge stripes are the only color. Root causes live in `src/render/environment.ts` (26 mesas as unlit faceted octahedra placed high, one flat ground disc + grid texture shared across themes, 14 flat-blob clouds), `src/render/props.ts` (sparse uniform props, no min-distance from road), `src/track/defs.ts` theme palettes, lighting setup in environment.ts, bloom threshold in `src/main.ts`.

## Ground rules
- ALL browser testing muted (`?mute=1`, webdriver auto-mute). Never unmute.
- Gates per phase: typecheck + build + laps 11/14 + rivals 20/20 + career 119/119 + share 34/34 + knockout 50/50 + daily 59/59 + probe 24/24 + allocs PASS. Render phases must also re-check: draw calls ≤220 Medium (rain rivals), frame time not regressed.
- Physics conventions sacred; no gameplay semantics changes. Day-time-trial must stay playable (medals untouched) — visual only. If a render change shifts autopilot times beyond ±35% band, find the cause (usually accidental collision/geometry change) before proceeding.
- Save/`window.__race2` untouched except additive QA additions.
- Every phase delivers A/B screenshot evidence (before = `qa/v7-ground/*`, after = `qa/v7-phaseN/`, NOT committed) reviewed by the LEAD, plus a subagent gameplay pass: actually drive (autopilot + scripted input), capture in-world racing shots from multiple corners/themes, and LOOK at them.
- Commit per phase `v7 Phase N: <summary>`. Deploy at Phase 6.

---

### Phase 1 — Lighting, sky & atmosphere
- Per-theme lighting rig: warm key (sun) + cool sky fill (hemisphere) with theme-tuned colors/intensities; raise neon-day from pitch black to a readable night-city (dark blue ambience + emissive accents, NOT gray daylight); mesa/canyon get stronger warm contrast; alpine stays soft morning.
- Sky shader: stars ONLY visible at night variants; sun disc → softer core + glow halo (no hard white circle blowout); add horizon haze band tinted per theme; dusk/night variants retune within the same uniforms (no rebuilds).
- Bloom: raise threshold/lower strength so only true emissives bloom (sun core, neon strips, boost pads, headlights) — the sun must stop clipping into a white blob.
- Clouds: replace flat blobs with soft multi-billboard puffs (3-5 overlapping alpha sprites per cloud, theme-tinted, slow drift), roughly 10-14 clouds, no per-frame allocation.
- Contact shadow: slightly darker + softer car blob.
- Files: `src/render/environment.ts`, `src/main.ts` (bloom/exposure), `src/track/defs.ts` (theme light values only).
- Evidence: A/B per theme (alpine/mesa/canyon/neon × day, + neon-night/dusk), no-stars-in-day proof, sun close-up. Subagent gameplay pass: 2 races driven (alpine + neon day) with mid-corner screenshots. Perf census.

### Phase 2 — Ground & landforms
- Ground: replace shared flat disc with per-theme treated ground — large-scale color variation (generated canvas texture: alpine meadow greens w/ lighter patches; mesa sand/ochre; canyon red-rock; neon dark city blocks + dim grid glow), subtle radial haze fade into fog color at distance. Keep y flat enough that skirts/props never clip (road skirts still own the near-road band).
- Landforms: DELETE the giant floating faceted boulders. Replace with: (a) distant mountain silhouette ring — 2 depth layers of flat-shaded ridgelines tinted/fog-faded per theme; (b) mid-distance grounded landforms (mesa: flat-topped orange/red with sun-facing lit faces; alpine: rounded forested hills; canyon: layered red buttes; neon: distant lit towers) — all resting on the ground plane, scaled DOWN vs today, min lateral distance from road ≥ 60m, lit by the same key/fill rig, vertex-color or 2-tone materials.
- Rocks (the 140 instanced small ones): keep but re-skin (theme color, lit, size variance, slight sink into ground, ≥ 25m from road).
- Files: `src/render/environment.ts`, `src/track/defs.ts` (palettes), maybe new `src/render/terrain.ts`.
- Evidence: A/B all 4 themes day + neon night; horizon composition shots; zoom check no clipping through road on 3 tracks with elevation (sky-loop, neon-vertical, harbor-nine). Subagent gameplay pass on mesa + canyon. Perf census (draw calls must NOT balloon — merge landform geometry per layer).

### Phase 3 — Road & trackside quality
- Asphalt: subtle generated noise texture (canvas, repeated), slight tone variation per theme; faint darker "tire wear" band along the driving line (static baked texture, not dynamic).
- Edge lines: crisp continuous white edge line + theme-accent outer stripe (current harsh black skirts become tapered embankments — slope to ground with skirt material tinted to the ground palette).
- Apex curbs: red/white striped curbs on the inside of corners with curvature above a threshold (procedural from curve data, instanced), laid flush (no collision change).
- Start/finish gantry: simple two-post gantry with CHECKERED banner at start line (themed materials).
- Reflectors/boost pads/slicks/rings keep behavior; re-skin reflectors to be brighter theme accents.
- Files: `src/track/builder.ts`, new generated textures module, `src/render/environment.ts` (gantry), `src/track/defs.ts` (accent colors).
- Evidence: close-up shots of straights/corners/apex curbs/start line on 3 themes; subagent gameplay pass confirming no visual glitches at speed (boost pad hits, curbs under camera). Perf census.

### Phase 4 — Props density, clusters & scatter
- Distribution: cluster-based placement (alpine: forest groves + clearings; mesa/canyon: cactus/joshua clusters + dry washes; neon: signage clusters + light poles along straights), Poisson-ish jitter within clusters, min distance from road enforced (today props occasionally hug the shoulder).
- Variety: 2-3 geometry variants per prop type with scale/rotation variance; palette jitter (±8% lightness) so instancing doesn't read as repeats.
- Ground scatter: cheap instanced tufts/details (alpine grass tufts, mesa scrub, canyon pebbles, neon floor light dots) — 200-400 instances, one draw call per theme, off-road only.
- All instanced/merged; no per-frame cost beyond existing wind bob patterns.
- Files: `src/render/props.ts`, maybe `src/render/environment.ts` (scatter), `src/track/defs.ts` (density knobs).
- Evidence: wide shots per theme showing density WITHOUT clutter; zoom on cluster variety; subagent gameplay pass per theme. Perf census (budget ≤220 total calls holds; scatter merged).

### Phase 5 — Track geometry audit + full gameplay QA sweep
- Geometry audit (data-only, defs.ts control points): hunt visible kinks/self-overlaps/uneven point spacing across all 14 tracks (top-down minimap + on-track screenshots); smooth ONLY where visually broken. After any change: autopilot baseline within band (recalibrate medals ONLY if baseline shifts >5%, using the ×1.05/1.2/1.4/1.8 scheme), regen dev ghosts, harness green.
- Full QA sweep by subagents (ALL muted): drive real races — time-trial on 4 themes, rival race, knockout race, daily, night + rain variants, drift attack — screenshot mid-race from multiple camera angles per run; check HUD readability against the new backgrounds in every theme (contrast!), touch layout spot-check, reduced-motion spot-check. Report a theme × mode table with shot paths + honest visual verdicts. Perf: rain rivals draw calls ≤220 Medium, frame time no regression.
- Grok scoped review (timeboxed): feed grok the render diff (`git diff v2.1.0..HEAD -- src/render src/track/builder.ts`) with instructions to find performance traps + three.js misuse only; 5-minute budget; skip on timeout.
- Files: `src/track/defs.ts` (only if kinks found), docs updates.
- Evidence: QA table + per-theme verdicts; fix-list executed before Phase 6.

### Phase 6 — Title/menu polish + v2.2.0 + deploy
- Title screen: background = live rotating replay-style scene of a themed track (existing menu orbit camera, pick most photogenic theme) instead of static frame; subtle vignette; version 2.2.0.
- Menu panels: match new world palette (bg blur + tinted glass consistent with themes); verify garage/achievements/career panels readable over the new scene.
- Final gates + full subagent QA re-run (muted), version bump, commit, push, Coolify deploy (POST `https://cool.neima.me/api/v1/deploy?uuid=qgpdmafn677kx6aoiahrlfyy`), poll, live-verify muted (v2.2.0 string, 4 theme screenshots from prod, rival race, sw still offline-capable).
- Done: v2.2.0 live, checklist ticked, AGENTS.md updated.
