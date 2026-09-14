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
