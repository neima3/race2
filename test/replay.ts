import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController, type GhostSample } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { CameraRig, type CameraMode } from '../src/render/camera';
import type { CarState } from '../src/physics/car';
import {
  ReplayBuffer,
  REPLAY_SPEEDS,
  advanceReplayTime,
  clampReplayTime,
  defaultAutoCuts,
  replayLookupAt,
  sampleReplayAt,
  type ReplayEntry,
  type ReplayLookup,
} from '../src/ui/replay';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

let total = 0;
let failures = 0;
function ok(cond: boolean, msg: string): void {
  total++;
  if (cond) console.log(`PASS ${msg}`);
  else {
    failures++;
    console.log(`FAIL ${msg}`);
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 1. ring buffer: keep last 5, evict oldest in FIFO order ----
{
  const buf = new ReplayBuffer();
  ok(buf.max === 5, 'buffer max is 5');
  for (let i = 1; i <= 7; i++) {
    const entry: ReplayEntry = { trackId: `t${i}`, samples: [], timeMs: 1000 * i, dateMs: i };
    buf.push(entry);
  }
  ok(buf.entries.length === 5, `buffer holds 5 entries after 7 pushes (got ${buf.entries.length})`);
  ok(
    buf.entries.map((e) => e.trackId).join(',') === 't3,t4,t5,t6,t7',
    `oldest entries evicted FIFO (kept ${buf.entries.map((e) => e.trackId).join(',')})`,
  );
  ok(buf.entries[0].timeMs === 3000 && buf.entries[4].timeMs === 7000, 'entry payloads intact');
  ok(buf.entries.every((e, i) => i === 0 || e.dateMs >= buf.entries[i - 1].dateMs), 'entries stay date-ordered');
}

// ---- 2. record a REAL lap (autopilot, sunrise-sprint) as theater source material ----
const def = TRACKS[0];
const curve = new TrackCurve(def.points, true);
const car = new CarPhysics(curve);
const save = new SaveManager();
const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: true });
car.placeAt(8, 0);
race.start();
race.countdownMs = 1;
const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
const ap = { smooth: 0 };
const simDt = 1 / 120;
let steps = 0;
while (race.phase !== 'finished' && steps < 40000) {
  const r = autopilotDrive(car, curve, simDt, ap);
  if (r.respawn) race.respawnAtCheckpoint();
  input.steer = r.respawn ? 0 : r.steer;
  input.throttle = r.respawn ? 0 : r.throttle;
  input.brake = r.respawn ? 0 : r.brake;
  race.update(simDt * 1000, input);
  steps++;
}
const samples: GhostSample[] = race.lastLapSamples;
ok(race.phase === 'finished' && steps < 40000, `autopilot lap finished (${steps} sim steps)`);
ok(samples.length > 300, `recording has samples at 30 Hz (${samples.length})`);
ok(samples.every((s, i) => i === 0 || s.t > samples[i - 1].t), 'sample times strictly monotonic');
const startMs = samples[0].t;
const endMs = samples[samples.length - 1].t + 800;

// ---- 3. scrub determinism: shuffled seeks == linear playback at the same t ----
{
  const dtMs = 1000 / 60;
  const linearT: number[] = [];
  const linearPos: THREE.Vector3[] = [];
  const linearQuat: THREE.Quaternion[] = [];
  let t = startMs;
  let lookupFails = 0;
  let guard = 0;
  while (t < endMs && guard < 20000) {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    if (!sampleReplayAt(samples, t, p, q)) lookupFails++;
    linearT.push(t);
    linearPos.push(p);
    linearQuat.push(q);
    t = advanceReplayTime(t, dtMs, 1);
    guard++;
  }
  ok(lookupFails === 0, `every linear playback frame resolved a sample (${lookupFails} failures)`);
  ok(linearT.length > 1000, `linear playback produced ${linearT.length} frames`);

  const rng = mulberry32(0x1e2a3b4c);
  const order = linearT.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const spd = { v: 0 };
  let worstPos = 0;
  let worstQuat = 0;
  const quatDiff = (a: THREE.Quaternion, b: THREE.Quaternion): number =>
    Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z), Math.abs(a.w - b.w));
  for (const idx of order) {
    sampleReplayAt(samples, linearT[idx], p, q, spd);
    worstPos = Math.max(worstPos, p.distanceTo(linearPos[idx]));
    worstQuat = Math.max(worstQuat, quatDiff(q, linearQuat[idx]));
  }
  // NOTE: quat equality is compared component-wise — Quaternion.angleTo() has ~1e-8
  // acos noise near dot=1 and cannot resolve bit-identical inputs.
  ok(worstPos < 1e-9 && worstQuat < 1e-12, `shuffled seeks match linear playback exactly (pos ${worstPos.toExponential(2)}, quat ${worstQuat.toExponential(2)})`);

  // pure determinism: the same random t twice (in any visit order) is bit-identical
  let nonDet = 0;
  for (let i = 0; i < 200; i++) {
    const rt = startMs + rng() * (endMs - startMs);
    const p1 = new THREE.Vector3();
    const q1 = new THREE.Quaternion();
    sampleReplayAt(samples, rt, p1, q1);
    const p2 = new THREE.Vector3();
    const q2 = new THREE.Quaternion();
    sampleReplayAt(samples, rt, p2, q2);
    if (p1.distanceTo(p2) > 0 || quatDiff(q1, q2) > 0) nonDet++;
  }
  ok(nonDet === 0, 'random-t lookups are bit-identical across repeat visits');
}

// ---- 4. speed scale: 0.25x advances sample-time at quarter rate; full replay 4x slower ----
{
  let quarter = startMs;
  for (let i = 0; i < 60; i++) quarter = advanceReplayTime(quarter, 1000 / 60, 0.25);
  ok(Math.abs(quarter - (startMs + 250)) < 1e-9, `0.25x: 60 frames advance 250ms of sample time (got ${quarter - startMs})`);

  let half = startMs;
  for (let i = 0; i < 60; i++) half = advanceReplayTime(half, 1000 / 60, 0.5);
  ok(Math.abs(half - (startMs + 500)) < 1e-9, `0.5x: 60 frames advance 500ms of sample time (got ${half - startMs})`);

  const framesToEnd = (speed: number): number => {
    let tt = startMs;
    let n = 0;
    while (tt < endMs && n < 200000) {
      tt = advanceReplayTime(tt, 1000 / 60, speed);
      n++;
    }
    return n;
  };
  const full = framesToEnd(1);
  const slow = framesToEnd(0.25);
  const ratio = slow / full;
  ok(Math.abs(ratio - 4) < 0.05, `0.25x replay takes 4x wall frames (ratio ${ratio.toFixed(3)})`);

  let past = advanceReplayTime(endMs + 5000, 1000 / 60, 1);
  past = clampReplayTime(past, startMs, endMs);
  ok(past === endMs, 'clamp pins t at the replay end');
  const before = clampReplayTime(startMs - 400, startMs, endMs);
  ok(before === startMs, 'clamp pins t at the replay start');
}

// ---- 5. edge lookups: clamped at both ends, spd is sample-space m/s ----
{
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const spd = { v: 0 };
  ok(sampleReplayAt(samples, startMs - 9999, p, q, spd), 'lookup before start ok');
  ok(p.distanceTo(samples[0].pos) < 1e-9, 't before start clamps to first sample');
  ok(sampleReplayAt(samples, endMs + 9999, p, q, spd), 'lookup past end ok');
  ok(p.distanceTo(samples[samples.length - 1].pos) < 1e-9, 't past end clamps to last sample');
  const mid = startMs + (endMs - startMs) * 0.5;
  sampleReplayAt(samples, mid, p, q, spd);
  ok(spd.v > 5, `sample-space speed mid-lap ${spd.v.toFixed(1)} m/s`);
  ok(sampleReplayAt(samples, startMs, new THREE.Vector3(), new THREE.Quaternion()) === true, '2+ samples: lookup succeeds');
  ok(sampleReplayAt([{ t: 0, pos: p, quat: q }], 0, new THREE.Vector3(), new THREE.Quaternion()) === false, 'single sample: lookup refused');
  const lk: ReplayLookup = { lo: -1, hi: -1, k: -1 };
  replayLookupAt(samples, mid, lk);
  ok(lk.lo >= 0 && lk.hi === lk.lo + 1 && lk.k >= 0 && lk.k <= 1, `bracket search returns adjacent pair (lo ${lk.lo}, hi ${lk.hi}, k ${lk.k.toFixed(3)})`);
}

// ---- 6. theater manual-cam path: rig over fake state from the shared lookup, no NaNs ----
{
  const rig = new CameraRig(16 / 9);
  rig.fovPref = 72;
  const fakePos = new THREE.Vector3();
  const fakeQuat = new THREE.Quaternion();
  const fake = {
    pos: fakePos,
    quat: fakeQuat,
    vel: new THREE.Vector3(),
    grounded: true,
    offroad: false,
    driftAmount: 0,
    speed: 0,
    forwardSpeed: 0,
    trackIndex: 0,
    trackDist: 0,
    lateral: 0,
    airborneTime: 0,
    boostTime: 0,
    wallHit: 0,
    onSlick: false,
    surfaceGrip: 1,
    landedAt: 0,
  } as CarState;
  const modes: CameraMode[] = ['chase', 'close', 'hood'];
  const dt = 1 / 60;
  const spd = { v: 0 };
  const v = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const back = new THREE.Vector3();
  let t = startMs;
  let frame = 0;
  let nan = 0;
  let samplesSeen = 0;
  let framed = 0;
  let hoodFovBad = 0;
  const perMode: Record<string, { seen: number; framed: number }> = { chase: { seen: 0, framed: 0 }, close: { seen: 0, framed: 0 }, hood: { seen: 0, framed: 0 } };
  let missPrinted = 0;
  while (t < endMs && frame < 20000) {
    const mode = modes[Math.floor(frame / 40) % 3];
    rig.setMode(mode);
    sampleReplayAt(samples, t, fakePos, fakeQuat, spd);
    fake.speed = spd.v;
    rig.setLookBack(false);
    rig.update(dt, fake as CarState);
    const cam = rig.camera;
    const finite =
      Number.isFinite(cam.position.x + cam.position.y + cam.position.z) &&
      Number.isFinite(cam.fov) &&
      Number.isFinite(cam.quaternion.x + cam.quaternion.y + cam.quaternion.z + cam.quaternion.w);
    if (!finite) nan++;
    if (finite && fake.speed > 5) {
      samplesSeen++;
      const pm = perMode[mode];
      pm.seen++;
      let good = false;
      if (mode === 'hood') {
        if (cam.fov < 70 - 1e-6) hoodFovBad++;
        // three.js cameras look down local -Z; the car looks down local +Z
        fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
        back.set(0, 0, 1).applyQuaternion(fakeQuat);
        good = fwd.dot(back) > 0.9;
      } else {
        cam.updateMatrixWorld();
        cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        v.copy(fakePos).project(cam);
        good = v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      }
      if (good) {
        framed++;
        pm.framed++;
      } else if (missPrinted < 5) {
        missPrinted++;
        console.log(`  miss frame=${frame} mode=${mode} t+${(t - startMs).toFixed(0)} proj=(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) fov=${cam.fov.toFixed(1)}`);
      }
    }
    t = advanceReplayTime(t, dt * 1000, 1);
    frame++;
  }
  ok(frame >= 1000, `theater rig playback ran ${frame} frames`);
  ok(nan === 0, `no NaNs across ${frame} frames with mode cycling every 40 frames`);
  for (const m of Object.keys(perMode)) {
    const pm = perMode[m];
    const f = pm.seen > 0 ? pm.framed / pm.seen : 0;
    ok(f >= 0.9, `${m}: framed/ahead-facing on ${(f * 100).toFixed(1)}% of moving samples (${pm.framed}/${pm.seen})`);
  }
  ok(hoodFovBad === 0, 'hood fov never dips below 70');
}

// ---- 7. defaults + speeds table ----
{
  ok(defaultAutoCuts(false) === true, 'auto-cuts default ON without reduced-motion');
  ok(defaultAutoCuts(true) === false, 'auto-cuts default OFF with reduced-motion');
  ok(REPLAY_SPEEDS.join(',') === '0.25,0.5,1', `speeds table 0.25/0.5/1 (got ${REPLAY_SPEEDS.join(',')})`);
}

console.log(`\nreplay test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
