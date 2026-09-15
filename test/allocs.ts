import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS, VARIANTS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { RivalManager, pickLineup } from '../src/game/rivals';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { ParticleSystem, RainSystem } from '../src/render/particles';
import { CameraRig } from '../src/render/camera';
import { advanceReplayTime, sampleReplayAt, REPLAY_SPEEDS } from '../src/ui/replay';
import type { CarState } from '../src/physics/car';
import { computeOnSlick, surfaceGripFor } from '../src/game/rules';
import { TrafficManager } from '../src/systems/traffic';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

// 60s headless rival-race allocation probe: mirrors the main.ts sim-loop composition
// (race + rivals + particles + rain + surface rules), samples JS heap every 5s.
// Run: node --expose-gc node_modules/tsx/dist/cli.mjs test/allocs.ts

const simDt = 1 / 120;
const def = TRACKS[4]; // dune-rush (rival harness staple)
const curve = new TrackCurve(def.points, true);
const save = new SaveManager();
const rain = true;
const particles = new ParticleSystem();
const rainFx = new RainSystem(950);
rainFx.lines.visible = true;
rainFx.setCount(520);

const player = new CarPhysics(curve);
const race = new RaceController(player, curve, def, save, () => {});
race.totalLaps = 2;
race.writesRecords = false;
const rivals = new RivalManager(curve, def, { add: () => {} } as unknown as THREE.Group, false, pickLineup(def.id));
rivals.totalLaps = 2;
rivals.rain = rain;

const traffic = new TrafficManager(curve, def, { add: () => {} } as unknown as THREE.Group);
traffic.place(8);
traffic.setVisible(true);

const camPos = new THREE.Vector3();
const rig = new CameraRig(16 / 9);
const moverSnap: { dist: number; lat: number }[] = [];
const input = { steer: 0, throttle: 0, brake: 0, drift: false };

let acc = 0;
let wallMs = 0;
const sampleEvery = 5;
let nextSample = 5000;
let heap0: number | null = null;
const rows: string[] = [];

const gc = (globalThis as unknown as { gc?: () => void }).gc;
const heap = (): number => {
  if (gc) gc();
  return (process.memoryUsage().heapUsed / 1048576);
};

player.placeAt(8, 2.5);
rivals.placeOnGrid();
traffic.place(8);
race.start();

// warm-up (shader-free; steady-state allocation)
for (let i = 0; i < 3600; i++) {
  race.update(simDt * 1000, input);
  rig.setMode(i % 3600 < 1200 ? 'chase' : i % 3600 < 2400 ? 'close' : 'hood');
  rig.update(simDt, player.state);
  rivals.update(simDt * 1000, 'racing', race.totalProgress, moverSnap);
  player.state.surfaceGrip = surfaceGripFor(rain);
  player.state.onSlick = computeOnSlick(def.slicks, player.state.trackDist, player.state.lateral);
  rivals.updateVisuals(simDt, particles, def.accent);
  rainFx.update(simDt, camPos);
  particles.update(simDt);
  traffic.update(simDt * 1000, player, race.phase === 'racing');
  traffic.updateVisuals();
}
heap0 = heap();
let lastSample = 0;
let done = '';
const t0 = performance.now();

for (let i = 0; i < 60 * 120; i++) {
  wallMs += simDt * 1000;
  race.update(simDt * 1000, input);
  rig.setMode(i % 3600 < 1200 ? 'chase' : i % 3600 < 2400 ? 'close' : 'hood');
  rig.update(simDt, player.state);
  const mode = race.phase === 'countdown' ? 'countdown' : 'racing';
  rivals.update(simDt * 1000, mode, race.totalProgress, moverSnap);
  player.state.surfaceGrip = surfaceGripFor(rain);
  player.state.onSlick = computeOnSlick(def.slicks, player.state.trackDist, player.state.lateral);
  particles.update(simDt);
  rainFx.update(simDt, camPos);
  rivals.standings(race.totalProgress);
  traffic.update(simDt * 1000, player, race.phase === 'racing');
  traffic.updateVisuals();
  if (race.phase === 'finished') {
    done = `finished at ${((performance.now() - t0) / 1000).toFixed(1)}s wall-sim`;
    break;
  }
  if (wallMs >= nextSample) {
    rows.push(`t=${(wallMs / 1000).toFixed(0).padStart(3)}s heap=${heap().toFixed(2)}MB`);
    nextSample += 5000;
  }
}
if (!done) rows.push(`t=60s heap=${heap().toFixed(2)}MB`);
void lastSample;

// allocation rate over a fixed window with forced GC
const h1 = heap();
for (let i = 0; i < 30 * 120; i++) {
  race.update(simDt * 1000, input);
  if (race.phase === 'finished') break;
  rig.setMode(i % 3600 < 1200 ? 'chase' : i % 3600 < 2400 ? 'close' : 'hood');
  rig.update(simDt, player.state);
  rivals.update(simDt * 1000, 'racing', race.totalProgress, moverSnap);
  particles.update(simDt);
  traffic.update(simDt * 1000, player, race.phase === 'racing');
  traffic.updateVisuals();
}
const h2 = heap();
const delta = h2 - h1;

console.log(`allocs probe: track=${def.id} rain=${rain} gc=${gc ? 'forced' : 'not-available'}`);
for (const r of rows) console.log('  ' + r);
console.log(`  30s steady-state window: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}MB (gc-forced)`);
console.log(done ? `  ${done}` : '  60s elapsed, race still running');

// ---- replay theater window (v8 P8): shared lookup + rig in manual-cam mode + time scale ----
{
  const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const xAxis = new THREE.Vector3();
  const rp = new THREE.Vector3();
  const samples: { t: number; pos: THREE.Vector3; quat: THREE.Quaternion }[] = [];
  const n = 480;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * curve.length;
    curve.frameAtDist(d, f);
    rp.copy(f.pos).addScaledVector(f.normal, 0.55);
    xAxis.crossVectors(f.normal, f.tangent);
    m.makeBasis(xAxis, f.normal, f.tangent);
    q.setFromRotationMatrix(m);
    samples.push({ t: (i / n) * 20000, pos: rp.clone(), quat: q.clone() });
  }
  const replayPos = new THREE.Vector3();
  const replayQuat = new THREE.Quaternion();
  const spd = { v: 0 };
  const fake = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), grounded: true, offroad: false, driftAmount: 0, speed: 0, forwardSpeed: 0, trackIndex: 0, trackDist: 0, lateral: 0, airborneTime: 0, boostTime: 0, wallHit: 0, onSlick: false, surfaceGrip: 1, landedAt: 0 } as unknown as CarState;
  let rt = samples[0].t;
  const theaterRig = new CameraRig(16 / 9);
  theaterRig.fovPref = 72;
  const hR1 = heap();
  const totalMs = samples[n - 1].t + 800;
  for (let i = 0; i < 30 * 120; i++) {
    rt = advanceReplayTime(rt, simDt * 1000, REPLAY_SPEEDS[i % 3]);
    if (rt > totalMs) rt = samples[0].t;
    sampleReplayAt(samples, rt, replayPos, replayQuat, spd);
    fake.pos.copy(replayPos);
    fake.quat.copy(replayQuat);
    fake.speed = spd.v;
    theaterRig.setMode(i % 7200 < 2400 ? 'chase' : i % 7200 < 4800 ? 'close' : 'hood');
    theaterRig.update(simDt, fake as CarState);
  }
  const hR2 = heap();
  const replayDelta = hR2 - hR1;
  console.log(`  30s theater window: ${replayDelta >= 0 ? '+' : ''}${replayDelta.toFixed(3)}MB (gc-forced)`);
  if (gc && replayDelta > 2) {
    console.log(`FAIL theater allocation churn > 2MB per 30s forced-GC window (${replayDelta.toFixed(2)}MB)`);
    process.exit(1);
  }
}

if (gc && delta > 2) {
  console.log(`FAIL allocation churn > 2MB per 30s forced-GC window (${delta.toFixed(2)}MB)`);
  process.exit(1);
}
console.log('PASS allocation probe');
