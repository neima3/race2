# RACE2 v7 "Beautiful Worlds" — progress log

## Phase 1 — Lighting, sky & atmosphere (2026-09-13) ✅

Shipped:

- **Per-theme lighting rig** (defs.ts `THEMES` + environment.ts): `ThemeDef` gained `hemiIntensity` (was hardcoded 0.85 in environment.ts). Values now:
  - alpine: sun 2.35 `0xfff2d8`, hemi sky/ground/ⓘ `0xbdd4f0`/`0x5a6a4a` @ 0.95, fogNear 320→290 (mistier) — soft cool morning.
  - mesa: sun 2.8→**3.2** `0xffd080`→`0xffd9a0`, hemi `0xffc490`→**`0x9db4e0` (cool fill)** / `0x6a4028` @ 0.8 — strong warm key vs cool fill; ground reads sunlit ochre.
  - canyon: sun 2.6→**3.4** `0xffe9b0`→**`0xffc06a` (hot orange key)**, hemi `0x8fb4ff`→**`0x7a68d8` (purple fill)** / `0x8a5a3a`→`0x54301e` @ **0.6** — highest contrast, sunset drama.
  - neon: sun 1.2→**2.2**, sunDir y 0.12→0.2, hemi `0x4a5af0`→**`0x5a6cf8`** / `0x141824`→**`0x2a3a5c`** @ 0.85→**2.6** — night city that reads (dark blue, not gray, not black). Two iteration steps (1.6 → 2.3 → 2.6) driven by screenshots.
- **Sky shader** (environment.ts): sun = soft-edged disc `smoothstep(0.99860, 0.99955, dot)` peak 1.6→1.22 + 3-layer glow (pow 24/6/2.6 @ 0.28/0.13/0.09, was pow 350/18/3.5 @ 1.6/0.32/0.12) — no more hard white blob. **Horizon haze band**: new `hazeColor` uniform = fog color × variant fogColorMult, mixed `(1-smoothstep(0,0.16,h))×0.62` — sky meets fog per theme. **Stars night-only**: `VARIANTS.day.starBrightness` 1→0, dusk 1.1→0 (night keeps 2.31, rain 0).
- **Bloom retune** (main.ts): UnrealBloomPass (strength, radius, threshold) 0.42/0.65/0.82 → **0.32/0.42/1.0** — only true HDR >1.0 blooms. To keep emissives popping through the higher threshold: boost pads color ×1.7, checkpoint gates `0x7ef3ff`×1.5, rings `0x9df3ff`×1.8 (builder.ts; neon edge stripes were already HDR ×2.2). Headlight pop = SpotLight pools (unaffected by bloom threshold). Removed dead `sunFlare` sprite (created+added to scene at origin, never positioned/updated — also leaked across track loads).
- **Clouds** (environment.ts): flat sphere-blob meshes (14 draw calls) → ONE InstancedBufferGeometry of camera-facing quads (12 clouds × 3-5 puffs = 48 instances, 1 draw call). Per-instance `aBase`/`aPuff(xyz offset+scale)`/`aSeed`; drift computed in the vertex shader (`mod(x + uTime*uDrift*(0.7+0.6*aSeed) + span/2, span) - span/2`) — zero per-frame CPU cost, no allocation; theme tint via `uColor`/`uOpacity` retuned in applyVariant by the same cloudColorMult/cloudOpacityMult plumbing. Fragment: radial `smoothstep(1.0,0.32,r)` alpha, bottom softening, top-lit shading.
- **Contact shadow** (car-model.ts + main.ts + rivals.ts): new shared `contactShadowTexture()` — 128px canvas radial gradient, 3 stops (0.7 / 0.38 @50% / 0) = darker + softer than the old 2-stop 64px 0.55 blob. Player sprite uses it (air-scale/fade logic unchanged); **each rival visual now carries a blob sprite** (opacity 0.85, local y −0.25 so it follows the road normal on banks; hidden with the group on elimination). DOM-guarded for headless tests.
- Variants (dusk/night/rain) retune everything via the SAME value plumbing (no rebuilds); `?variant=` used for QA.

Verification:

- Gates at HEAD: typecheck ✅ build ✅ (998.17 kB / 373.84 kB gzip) `laps.ts` **11/14** ✅ with lap times byte-identical to baselines (sunrise 17.47, dune-rush 23.52, volt-alley 27.90, salt-flats 22.18, harbor 24.23 — 3 STRICT-exempt unchanged) — **day time-trial gameplay provably untouched**. `rivals` **20/20**, `career` **119/119**, `share` **34/34**, `knockout` **50/50**, `daily` **59/59**, `probe` **24/24**, `allocs` **PASS**.
- Perf census (headless Medium, `?debug`, controlled A/B same race phase 9.5s, salt-flats rivals): old 185 calls / 42.8k tris → new **184-187 calls / 39.7k tris** (fewer tris: cloud quads < sphere puffs; +4 blob sprites −13 cloud meshes ≈ net −9 offset by measurement window). Rain rivals worst case **185-195 calls ≤ 220 budget** ✅. FPS converges 54-59 in headless software GL both sides — no regression.
- Gameplay evidence (muted `?mute=1`, `qa/v7-phase1/`, NOT committed):
  - `01/02/03` alpine day (dune-rush) real rival race: chase, cornering, scripted `drive()` steering pass @161 km/h. Soft sun, no stars, haze band, darker contact shadow.
  - `04/05` neon day (neon-circuit) rival race P2 battle: night city reads — road, cars, glowing billboards, terrain grid. `13` scripted drive close-up showing ground readability.
  - `06/07a-c` mesa day (salt-flats): sunlit ochre ground, warm key, boost pad bloom.
  - `08-mesa-sun-closeup`: photo-mode shot aimed down sun azimuth — soft warm disc + gentle halo, NO white blowout (vs baseline `qa/v7-ground/02`).
  - `09` canyon day (canyon-twist): purple sky + burning orange horizon, hot key, highest contrast.
  - `10` neon + `?variant=night`: stars ONLY here (night), cyan moon, lit road.
  - `11` alpine horizon haze close-up (photo mode): misty pink→blue gradient blend into fog.
  - `12` alpine `?variant=dusk`: warm dusk sky, low soft sun, stars correctly absent.
  - `14-neon-race.webm`: 14.5s gameplay recording.
- Honest verdicts vs `qa/v7-ground/`: alpine **YES** (softer sun, no stars, misty horizon; was flat blowout + day stars). mesa **YES** (sunlit warm ground + soft sun vs greenish flat + white blob). canyon **YES** (deepest oranges/purples, hot key; was generic warm). neon day **YES** (readable night city vs near pitch black; road asphalt albedo still dark — Phase 3's asphalt work will lift it further). neon night **YES** (stars + readable). Known remaining issues are all Phase 2 scope (floating faceted mesas, flat ground disc).

Deviations:

- builder.ts touched beyond the roadmap's file list (pads/gates/rings → HDR colors): required so "only true emissives bloom" keeps boost pads/gates/rings visible above the new threshold 1.0. Neon stripes were already HDR. No gameplay semantics (materials only).
- Dusk `starBrightness` set to 0 (roadmap says stars ONLY at night variants — strict reading; dusk keeps its warm sky).
- Neon hemi landed at 2.6 after 2 screenshot iterations (1.6 and 2.3 left the world too dark vs the "never pitch black" requirement).
- One headless-Chrome renderer crash after ~3 min of continuous WebGL QA (page reloaded to title + onboarding) — same documented QA-tooling family from v5/v6; all evidence re-taken in fresh sessions; game code not involved.

Notes for Phase 2+: clouds are a single instanced draw with GPU drift — reuse the pattern for scatter in Phase 4. `contactShadowTexture()` is the shared blob for any new car-like visuals. Ground/landform work (Phase 2) should keep the new haze band in mind (hazeColor already = fog color, so a new ground palette should update `fogColor` + sky horizon together). The neon road albedo lift belongs to Phase 3 asphalt.

## Phase 2 — Ground & landforms (2026-09-13) ✅

Shipped (new `src/render/terrain.ts` + `environment.ts` rewiring + `defs.ts` palettes):

- **Ground**: shared flat disc+grid → per-theme generated canvas texture on the same flat disc (y kept flat; disc still follows camera). Meadow/sand/terracotta themes: 512px tile @ 240m world (radial soft blotches in 2-3 HSL-offset tones of `groundColor` + per-pixel grain), `SRGBColorSpace`, anisotropy 4. Neon ('city'): 1024px tile @ 512m — color map = dark city blocks (8×8 cells, 7m streets, per-block tone/hue jitter, occasional plaza + inner slab) + **emissiveMap** (faint cyan street lines @ 0.09 α + sparse window dots 2×3px in cyan/magenta/amber/white/lime @ 0.35-0.9 α + rare rooftop outlines), emissiveIntensity 1 (constant across variants → city lights stay lit at night). `ThemeDef.terrainStyle: 'meadow'|'sand'|'terracotta'|'city'` added as the single per-theme discriminator. Texture is now **world-anchored** (map.offset = camPos/tile in `update()`) — the old grid visibly swam with the camera; fixed. Fog still owns the distance fade (rings/far ground sit past fogFar).
- **Distant mountains**: 2 ridge silhouette rings (r=1850 h×1.0, r=2850 h×1.28, 96 segs, DoubleSide `MeshBasicMaterial fog:false`), heights = seeded integer-frequency sine stacks per style (meadow rounded / sand stepped terraces / terracotta jagged / city quantized blocky skyline), bottom skirt y=−10. Tinted per variant in `setTint(fog, dim)`: near = mesaFar ⊗lerp fog 0.32, far = lerp fog 0.5 ×0.78 (fog-tinted, darker with distance); rings follow camera x/z. 2 draw calls.
- **Mid landforms** (replaces ALL floating octahedra): 20-30 grounded shapes per theme — meadow: rounded low-poly dome hills w/ cluster neighbors; sand: flat-topped jittered-radius mesas (cap + jitterRadial walls); terracotta: stacked 2-tier buttes; city: box towers (crown/podium/antenna variants) + HDR vertex-color window strips (accent palette ×1.4-3.0, blooms on High). All non-indexed with **2-tone sun-facing lit vs shaded face colors** (per-face normal ⊗ theme.sunDir smoothstep, per-object HSL jitter, per-face ±6%), `MeshStandardMaterial vertexColors+flatShading`, merged to 1 draw call (+1 windows on neon). Tallest ≈ 160 vs old ≈ 490 (≈1/3). Placement: 430-1580m from origin, ≤1700m+radius, **minRoadDistance ≥ radius+60** enforced against the live curve.
- **Rocks**: 140 instanced dodecahedra re-skinned — per-instance `setColorAt` tint 0.78-1.22, size 0.7-5.3 w/ axis variance, **sink 10-20%** (center = GROUND_Y + sy×(1−sink)), **minRoadDistance ≥ 25+sz** (old ones landed ON the road — see qa/v7-ground/01).
- **Clearance harness** `test/tmp/clearance.ts`: for ALL 14 tracks — ground-vs-road dip check, landform radius+60m lateral rule, rock 25m rule, rock sink/float check, track-extent < ridge radius, and for sky-loop/neon-vertical/harbor-nine a per-frame corridor check (anything horizontally inside footprint+halfWidth+2 must top out ≥2.5m under road underside). **ALL PASS**; caught a real pre-existing bug: dune-rush road dips to y=−0.38, below the old ground −0.35 → **GROUND_Y −0.35 → −0.45**, props sink −0.4 → −0.5 (props.ts, render-only).
- **Cloud sliver fix** (environment.ts, Phase-1 file): thin radiating lines over the sky (visible in Phase-1 baselines, e.g. `qa/v7-phase1/06`) = cloud billboards whose base crosses the camera plane producing clip-space slivers; vertex shader now collapses puffs with `mv.z > −4`. Isolation-verified (hide clouds → lines gone). Residual ultra-faint broad banding still matches the Phase-1 baseline — not a Phase-2 regression, noted for Phase 3+.
- `dispose()` now also kills `emissiveMap` (latent neon-ground leak).

Verification:

- Gates at HEAD: typecheck ✅ build ✅ (1005.55 kB / 377.29 kB gzip) `laps.ts` **11/14** (same 3 STRICT-exempt; lap times byte-identical: sunrise 17.47, dune-rush 23.52, volt-alley 27.90, salt-flats 22.18, harbor 24.23) — gameplay untouched. `rivals` **20/20**, `career` **119/119**, `share` **34/34**, `knockout` **50/50**, `daily` **59/59**, `probe` **24/24**, `allocs` **PASS** (+0.000MB steady-state). `test/tmp/clearance.ts` **ALL PASS** (14 tracks).
- Perf census (headless Medium, `?debug`, salt-flats rivals): day 181-185 calls / ~40.3k tris; **rain rivals worst case 182-196 calls ≤ 220 budget** ✅; 60fps headless. Landform+mountain+ground = **4 draw calls (5 on neon)** ≤ 12 budget ✅. No per-frame allocation (anchor = 2 float writes/map; ring follow = 1 position set).
- Gameplay evidence (muted `?mute=1`, `qa/v7-phase2/`, NOT committed — real rival races, car visible & moving, P-battles at 95-219 km/h):
  - `01/02` alpine day (dune-rush): chase + corner; meadow patches, forested hill dome, hazy ridge, sunk rocks; floaters/grid gone.
  - `03/04` mesa day (salt-flats): chase @143 + boost run @219; sand plain, grounded flat-topped mesas w/ lit tops + shaded faces, ridge band.
  - `05/06` canyon day (canyon-twist): banked chase + start/finish straight; terracotta ground, two-tone tiered buttes, backlit silhouettes on ridge.
  - `07/09/10` neon day (neon-circuit + volt-alley): night-city plain w/ block grid, faint emissive street lines + window dots, distant lit towers; P2 battles @137-167.
  - `11/12` neon `?variant=night`: stars only here, glowing window strips, readable road.
  - `13` alpine `?variant=dusk`: purple-pink dusk, misty horizon, hill silhouettes.
  - `14/15` sky-loop, `16/17` neon-vertical, `18` harbor-nine: elevated road sections with ground/landforms/rocks far below — nothing pokes through the ribbon (matches numeric harness).
  - `19` mesa horizon composition: layered mesas → stepped ridge → haze band.
- Honest verdicts vs `qa/v7-ground` + `qa/v7-phase1`: alpine **YES** (floating diamonds gone; ground alive; hills+ridge depth). mesa **YES** (ochre sand not brown-flat; grounded mesas; horizon layers). canyon **YES** (buttes w/ lit/shaded faces; terracotta ground). neon day **YES** (city plain + emissive dots + lit towers vs invisible void ground). neon night **YES**. dusk **YES**. Sky-line sliver artifact: improved (dense fan eliminated; faint residual = Phase-1 baseline).

Deviations:

- `props.ts` one-line sink change (−0.4 → −0.5) + new `terrainStyle` field in `ThemeDef` + palette retunes (mesa ground `0x8a5232→0xa26a3c`, mesa landform `→0xb4643a`, mesa far `→0x9a5c46`; canyon ground `→0x8a5238`; alpine landform `0x8a97a8→0x5e7c58` forested, far `→0x607592`) — all render-palette only, per the art direction.
- Cloud shader touched (Phase-1 file) for the sliver guard — visual-bug fix required for honest evidence; zero gameplay surface.
- Window strips on neon towers use HDR vertex colors (≤3.0) — they bloom on High quality by design ("distant lit towers"); Medium unchanged behavior verified.

Notes for Phase 3+: ridge tint plumbing lives in `RidgeRings.setTint(fog, dim)` — road palette work should keep fog + hazeColor + ridge tints coherent. Neon asphalt lift (Phase 3) will further separate road from the new dark city plain. Scatter (Phase 4) can reuse `terrain.ts` placement helpers (`minRoadDistance`, seeded rng convention).

## Phase 3 — Road & trackside quality (2026-09-13) ✅

Shipped (rewrote `src/track/builder.ts` road-side + new `src/render/roadTextures.ts`):

- **Asphalt texture** (roadTextures.ts): 512² canvas, per-theme base (alpine `0x767c88`, mesa `0x857462`, canyon `0x7d6a5c`, neon `0x555e74` — cooler/darker for neon, all much lighter than the old `#3a3f4c`), per-pixel grain ±18, periodic tonal banding along V (3+7 sine cycles/tile, seam-free), ~2800 speckles, baked **tire-wear band** at u=0.5 (≈2m wide core + soft feather, α .15, dark `rgba(8,10,14)`). SRGB, repeat, aniso 4, mipmaps. **Gotcha fixed en route:** `new THREE.Color(hex)` returns *linear* components — deriving canvas bytes from `.r*255` yields near-black; must use `getHexString()` (sRGB), the terrain.ts convention.
- **Edge lines**: one 4-strip ribbon mesh (MeshBasic, vertexColors, DoubleSide): white inner line (`hw−0.30..hw−0.05`, +0.02) + theme-accent outer stripe on the embankment shelf (`hw+0.10..hw+0.45`); neon accent stays HDR ×2.2. 1 draw call.
- **Apex curbs**: `computeCurbZones` (exported for harness) — heading-κ per frame (vertical-loop sections excluded), 9m box smooth, threshold **κ>0.015 (r<67m)**, ±4m dilation, ≥7m runs, inside side = −sign(κ). One merged BufferGeometry, red/white 2.4m-period canvas texture, flush +0.025, DoubleSide. Coverage 4.5% (salt-flats) → 50% (serpent's-tail), 119 zones total (`test/tmp/curbs.ts` harness, committed). Wrap-at-start-line zones merge into span>length (UVs from unwrapped dist).
- **Embankments** (replaces black skirts): per-side 3-vertex cross-section — road edge → 0.55m flush shelf → slope to `max(GROUND_Y, edgeY−min(drop,2.4))`, outset = 0.55+1.3·drop; vertex-colored edgeTone→midTone→groundColor, MeshStandard + computeVertexNormals, DoubleSide. Road sits "in" the landscape; elevated sections get a capped shoulder.
- **Road-base underlay** (new, unlit): road ribbon cloned at −0.06 along normal, MeshBasic vertexColors (soil tone) — see deviations for why.
- **Start gantry**: checkered banner canvas (512×96: checker rows top/bottom, accent trim, START/FINISH) + two posts **merged into 1 mesh**, themed per-theme post colors (`GANTRY_POST` table). 2 draw calls.
- **Reflectors**: were permanently `visible=false` since an old build — re-enabled, theme-accent colors via new `ThemeDef.reflectorColor` (alpine `0xd9e8ff`, mesa `0xffe0a8`, canyon `0xffc890`, neon `0x9defff`), sphere 0.12→0.14, same reflectorMult variant plumbing (night ×2.4 pops).
- Pads/slicks/rings/movers/gates untouched (materials only where shared already).

Verification:

- Gates at HEAD: typecheck ✅ build ✅ (1008.91 kB / 378.87 kB gzip, +3.3 kB vs P2) `laps.ts` **11/14** (same 3 STRICT-exempt; **byte-identical**: sunrise 17.47, dune-rush 23.52, volt-alley 27.90, salt-flats 22.18, harbor 24.23) — physics untouched (harness never imports builder). `rivals` **20/20**, `career` **119/119**, `share` **34/34**, `knockout` **50/50**, `daily` **59/59**, `probe` **24/24**, `allocs` **PASS** (±0.000MB).
- Perf census (headless Medium `?debug`, salt-flats rivals, 60fps): day 141–189 calls / 48–54k tris; **rain rivals peak 202 calls ≤ 220 budget** ✅ (P2: 182–196). Road-side draw calls: road 1 + underlay 1 + embankment 1 + lines 1 + curbs ≤1 + gantry 2 = **≤7 ≤ 10 budget** ✅.
- Gameplay evidence (muted, `qa/v7-phase3/`, real races, car visible/moving): `01` alpine gantry countdown (checkers + curbs wrap the start bend), `02` alpine straight @133-136 km/h (crest base visible), `03` alpine embankment close-up, `04` canyon serpent's-tail corner @88 with **apex curbs inside** ✓, `05` neon day volt-alley lines+curbs, `06` **neon night** — edge lines + HDR stripes carry readability ✓, `07` **rain** salt-flats wet road @171 ✓, `08` mesa salt-flats close-up @162, no shimmer/moiré at speed anywhere (mipmapped 512² tile).
- Honest verdicts vs P2 baselines: alpine **YES** (asphalt reads as asphalt; crest void gone), mesa **YES** (warm asphalt + sand embankments), canyon **YES** (curbs+lines in sunset grade — standout shot 04), neon day **YES** (dark cool asphalt + HDR stripes), neon night **YES** (lines carry the road), rain **YES** (wet tint readable). Crest underside = flat soil tone (unlit) — slightly flat but coherent; future polish candidate.

Deviations:

- **Pre-existing bug fixed: see-through road at crests.** The road was single-sided; on climbs/crests the chase camera sits below the road plane ahead → backface culled → meadow visible through the road (visible in `qa/v7-ground`/P2 baselines once you know what to look for). My crisp DoubleSide lines made it glaring. Final fix: unlit soil-toned **underlay ribbon** (−0.06 along normal) renders the road's underside as embankment cross-section; road stays FrontSide. DoubleSide road alone was rejected: backface = sun-flipped normal → black slab. +1 draw call, within budget.
- **Two real bugs found & fixed during QA**: (1) accent-stripe latitudes missing the `halfWidth` offset (rendered as center double-yellow); (2) asphalt canvas bytes derived from linear-space `THREE.Color` → near-black texture (use `getHexString()`).
- `ThemeDef.reflectorColor` added (additive palette field, same pattern as P2 `terrainStyle`); environment.ts reflector base from it.
- New files: `src/render/roadTextures.ts`, `test/tmp/curbs.ts` (harness, committed like prior tmp harnesses).
- Long QA detour honest note: mid-phase "black road" panics were partly QA-churn artifacts (mutations applied to a stale mesh reference, results-panel dimming, photo-mode camera) — the albedo lift + underlay are the only lasting changes; all final evidence re-taken pristine.

Notes for Phase 4+: scatter should keep `minRoadDistance` discipline (props hug the shoulder in places — P4 scope); crest-underside tone could take a subtle vertical gradient later; curbs+underlay add ~10k tris — budget headroom still comfortable.
