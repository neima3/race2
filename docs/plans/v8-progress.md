# RACE2 v8 — Progress Log

## Phase 1 — Camera suite (2026-09-14, commit `v8 Phase 1`)

**Shipped**
- `CameraRig` 3 modes (src/render/camera.ts): CHASE (v2.2 behavior, byte-identical — proven by a legacy-rig oracle over a full scripted lap, max pos err < 1e-9), CLOSE (follow 8.8→5.7 = −35%, height 3.1→1.9 = −39%, look-ahead 7→8; lookBack 8.4→5.5 / −14→−9), HOOD (eye = pos + up·1.05 + fwd·0.5, look-ahead 10→12.5 = +25%, FOV base forced 70). Mode transitions are instant (snap-on-change, no eased swings).
- Hood POV hides `carVisual.bodyGroup` only — wheels + contact shadow stay; restored automatically in photo/podium/menu/replay states (main.ts per-frame `pov` check).
- Settings: `settings.cam` ('chase'|'close'|'hood', default chase) + `settings.fov` (60–100, default 72) + `settings.hintCam`. Legacy v2.2 `settings.camera` ('chase'|'hood') migrates into `cam` on load; invalid values sanitized, fov clamped. Wired live-applied via onSettingsChanged (the old `camera` select was dead — it never reached the rig; now it does).
- FOV mapping: slider value is the stored preference; CHASE/CLOSE base = fov − 10 (default 72 → base 62 = today's chase, satisfying the byte-identical hard constraint), HOOD base forced 70. Speed-FOV response shapes unchanged on top of the base (chase/close: speedRatio·22 + eased 4° + kick; hood: speedRatio·16 + eased 4°).
- C key (and gamepad RB / touch camera button) cycles CHASE→CLOSE→HOOD during racing, persists to settings, one-time "C — CAMERA" HUD hint (fires at race start only when no mode hint claims the slot). Photo mode and menu orbit/replay cameras untouched.
- Hood speed lines intensify: onset 0.62→0.45 speed ratio, cap 0.85→1.0.
- QA hook: `__race2.cam()` get / `__race2.cam('chase'|'close'|'hood')` set (persists).

**Tests**
- New permanent gate `test/camera.ts` (28 checks): cycle order, FOV base math per mode/pref, CHASE byte-identity vs inline v2.2 oracle over a full lap (1e-9), per-mode scripted laps (no NaNs every step; car-in-frustum 100% chase/close; ahead-facing 100% hood; hood fov ≥ 70), mid-lap cycling (6 swaps, no NaNs, stays framed). Exit 1 on failure.
- `test/allocs.ts` now runs the rig (all 3 modes cycled) inside the probe — PASS, +0.000MB/30s gc-forced.

**Gates (all green)**: typecheck ✓ build ✓ laps 14/14 rivals 20/20 career 119/119 share 34/34 knockout 50/50 daily 59/59 probe 24/24 allocs PASS camera 28/28.

**Evidence** (qa/v8-phase1/, muted, not committed): alpine-day-{chase,close,hood}, neon-night-{chase,close,hood}, fov-60 vs fov-100 (live fov 64 vs 104 at same corner/speed), ckey-1/2/3 (real keypress cycle), settings-panel{,-changed} (CAMERA select + FOV slider live-apply), persistence reload check (cam=close fov=88 → reload → rig applies both).

**Verdicts (lead-reviewed; no subagent tool in this session)** — CHASE: readable, unchanged ✓. CLOSE: readable + more immersive, car fills more frame, curbs/braking marks clearer — YES. HOOD: usable at 137–144 km/h, road well centered (look-ahead +25% works), body hidden with front wheel hubs grounding the view; night variant slightly dark but headlights carry it — YES, with a nit: a close ghost can occlude the view (same as any chase view).

**Deviations / notes**
1. FOV slider semantic: task said "slider value is the FOV base" (default 72) AND "chase byte-identical when settings untouched". Both can only hold if the base is offset: CHASE/CLOSE base = slider − 10. Documented in save.ts + camera.ts comments; one-line change if literal mapping is preferred instead.
2. `settings.camera` key replaced by `settings.cam` (per spec) with one-time migration from the old key; old JSON key is deleted on load. No data loss.
3. Screenshot judging done by the lead agent (no subagent dispatch available in this environment); all shots are real muted gameplay at 97–144 km/h.
