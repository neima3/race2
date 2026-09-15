import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics, type CarState } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { CameraRig } from '../src/render/camera';
import { autopilotDrive } from '../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const simDt = 1 / 120;
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

const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };

function driveStep(car: CarPhysics, race: RaceController, curve: TrackCurve, ap: { smooth: number }): void {
  const r = autopilotDrive(car, curve, simDt, ap);
  if (r.respawn) race.respawnAtCheckpoint();
  input.steer = r.respawn ? 0 : r.steer;
  input.throttle = r.respawn ? 0 : r.throttle;
  input.brake = r.respawn ? 0 : r.brake;
  race.update(simDt * 1000, input);
}

// ---- 1. C-key cycle order: CHASE -> CLOSE -> HOOD -> CHASE ----
{
  const rig = new CameraRig(16 / 9);
  const a = rig.cycleMode();
  const b = rig.cycleMode();
  const c = rig.cycleMode();
  ok(a === 'close' && b === 'hood' && c === 'chase' && rig.mode === 'chase', `cycle order: ${a} -> ${b} -> ${c}`);
}

// ---- 2. FOV base math at rest (speed 0, no kick/punch) ----
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  car.placeAt(30, 0);
  const rig = new CameraRig(16 / 9);
  const fovAt = (): number => {
    rig.update(simDt, car.state);
    return rig.camera.fov;
  };
  rig.fovPref = 72;
  rig.setMode('chase');
  const chaseDef = fovAt();
  rig.setMode('close');
  const closeDef = fovAt();
  rig.setMode('hood');
  const hoodDef = fovAt();
  ok(Math.abs(chaseDef - 62) < 1e-9, `fov default chase base = 62 (got ${chaseDef.toFixed(6)})`);
  ok(Math.abs(closeDef - 62) < 1e-9, `fov default close base = 62 (got ${closeDef.toFixed(6)})`);
  ok(Math.abs(hoodDef - 70) < 1e-9, `fov hood forced base = 70 (got ${hoodDef.toFixed(6)})`);
  rig.fovPref = 100;
  rig.setMode('chase');
  const chaseMax = fovAt();
  rig.setMode('close');
  const closeMax = fovAt();
  rig.setMode('hood');
  const hoodMax = fovAt();
  ok(Math.abs(chaseMax - 90) < 1e-9, `fov pref 100 -> chase base 90 (got ${chaseMax.toFixed(6)})`);
  ok(Math.abs(closeMax - 90) < 1e-9, `fov pref 100 -> close base 90 (got ${closeMax.toFixed(6)})`);
  ok(Math.abs(hoodMax - 70) < 1e-9, `fov pref 100 -> hood still 70 (got ${hoodMax.toFixed(6)})`);
  rig.fovPref = 60;
  rig.setMode('chase');
  const chaseMin = fovAt();
  ok(Math.abs(chaseMin - 50) < 1e-9, `fov pref 60 -> chase base 50 (got ${chaseMin.toFixed(6)})`);
}

// ---- reference: exact v2.2 chase rig (byte-identical oracle) ----
class LegacyChaseRig {
  camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 5000);
  private speedFov = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private punch = 0;
  boostKick = 0;
  speedFovEnabled = true;
  snapBehind(state: CarState): void {
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quat);
    this.camPos.copy(state.pos).addScaledVector(back, 9).addScaledVector(new THREE.Vector3(0, 1, 0), 3.4);
    this.camera.position.copy(this.camPos);
    this.camLook.copy(state.pos);
  }
  update(dt: number, state: CarState, lookBack: boolean): void {
    this.punch = Math.max(0, this.punch - dt * 20);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quat);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(state.quat);
    const speedRatio = Math.min(1, state.speed / 58);
    const hi = this.speedFovEnabled ? Math.min(1, Math.max(0, (state.speed - 45) / 13)) : 0;
    const eased = hi * hi * (3 - 2 * hi);
    this.speedFov += (eased - this.speedFov) * Math.min(1, 4 * dt);
    const speedFov = this.speedFov * 4;
    const kick = this.boostKick * 9;
    const back = forward.clone().multiplyScalar(lookBack ? 8.4 : -8.8);
    const target = state.pos.clone().add(back).addScaledVector(up, 3.1);
    const lerpRate = 1 - Math.exp(-(state.grounded ? 6.5 : 3.4) * dt);
    this.camPos.lerp(target, lerpRate);
    this.camera.position.copy(this.camPos);
    const lookTarget = state.pos.clone().addScaledVector(forward, lookBack ? -14 : 7).addScaledVector(up, 0.9);
    this.camLook.lerp(lookTarget, 1 - Math.exp(-9 * dt));
    this.camera.up.lerp(up, 1 - Math.exp(-(state.grounded ? 8 : 2.2) * dt));
    this.camera.lookAt(this.camLook);
    this.camera.fov = 62 + speedRatio * 22 + speedFov + kick - this.punch;
    this.camera.updateProjectionMatrix();
  }
}

// ---- 3. CHASE byte-identical to v2.2 over a scripted lap ----
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  car.placeAt(8, 0);
  const rig = new CameraRig(16 / 9);
  rig.fovPref = 72;
  const legacy = new LegacyChaseRig();
  rig.setMode('chase');
  rig.snapBehind(car.state);
  legacy.snapBehind(car.state);
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  let maxErr = 0;
  let fovErr = 0;
  let steps = 0;
  while (race.phase !== 'finished' && steps < 20000) {
    driveStep(car, race, curve, ap);
    rig.setLookBack(false);
    rig.boostKick = 0;
    rig.update(simDt, car.state);
    legacy.update(simDt, car.state, false);
    maxErr = Math.max(maxErr, rig.camera.position.distanceTo(legacy.camera.position));
    fovErr = Math.max(fovErr, Math.abs(rig.camera.fov - legacy.camera.fov));
    steps++;
  }
  ok(steps > 1000 && race.phase === 'finished', `byte-identical lap drove to finish (${steps} steps, phase=${race.phase})`);
  ok(maxErr < 1e-9 && fovErr < 1e-9, `chase matches v2.2 rig exactly (pos err ${maxErr.toExponential(2)}, fov err ${fovErr.toExponential(2)})`);
}

// ---- 4. scripted lap per mode: finite every step + car in frustum / ahead-facing ----
{
  const v = new THREE.Vector3();
  const cf = new THREE.Vector3();
  const kf = new THREE.Vector3();
  for (const mode of ['chase', 'close', 'hood'] as const) {
    const def = TRACKS[0];
    const curve = new TrackCurve(def.points, true);
    const car = new CarPhysics(curve);
    const save = new SaveManager();
    const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
    car.placeAt(8, 0);
    const rig = new CameraRig(16 / 9);
    rig.fovPref = 72;
    rig.setMode(mode);
    rig.snapBehind(car.state);
    race.start();
    race.countdownMs = 1;
    const ap = { smooth: 0 };
    let steps = 0;
    let samples = 0;
    let nan = 0;
    let good = 0;
    let fovBad = 0;
    while (race.phase !== 'finished' && steps < 20000) {
      driveStep(car, race, curve, ap);
      rig.setLookBack(false);
      rig.update(simDt, car.state);
      const cam = rig.camera;
      const finite =
        Number.isFinite(cam.position.x) && Number.isFinite(cam.position.y) && Number.isFinite(cam.position.z) &&
        Number.isFinite(cam.fov) &&
        Number.isFinite(cam.quaternion.x) && Number.isFinite(cam.quaternion.y) && Number.isFinite(cam.quaternion.z) && Number.isFinite(cam.quaternion.w);
      if (!finite) nan++;
      if (mode === 'hood' && cam.fov < 70 - 1e-6) fovBad++;
      if (finite && race.phase === 'racing' && car.state.speed > 5 && steps % 4 === 0) {
        samples++;
        if (mode === 'hood') {
          cf.set(0, 0, -1).applyQuaternion(cam.quaternion);
          kf.set(0, 0, 1).applyQuaternion(car.state.quat);
          if (cf.dot(kf) > 0.9) good++;
        } else {
          cam.updateMatrixWorld();
          cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
          v.copy(car.state.pos).project(cam);
          if (v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) good++;
        }
      }
      steps++;
    }
    const goodFrac = samples > 0 ? good / samples : 0;
    ok(race.phase === 'finished' && steps > 1000, `${mode}: scripted lap finished (${steps} steps)`);
    ok(nan === 0, `${mode}: no NaNs across ${steps} steps`);
    ok(mode === 'hood' ? fovBad === 0 : true, `${mode}: fov never dips below forced base 70`);
    ok(samples > 150, `${mode}: sampled ${samples} racing frames`);
    ok(goodFrac >= 0.97, `${mode}: ${mode === 'hood' ? 'ahead-facing' : 'car-in-frustum'} on ${(goodFrac * 100).toFixed(1)}% of samples (${good}/${samples})`);
  }
}

// ---- 5. live mode cycling mid-lap: instant transitions, stays finite, car recentered ----
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  car.placeAt(8, 0);
  const rig = new CameraRig(16 / 9);
  rig.fovPref = 72;
  rig.snapBehind(car.state);
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  const order = ['close', 'hood', 'chase', 'hood', 'close', 'chase'] as const;
  let steps = 0;
  let nextSwap = 400;
  let swaps = 0;
  let nan = 0;
  let recenters = 0;
  const cam = rig.camera;
  const v = new THREE.Vector3();
  while (race.phase !== 'finished' && steps < 20000) {
    if (steps === nextSwap && swaps < order.length) {
      rig.setMode(order[swaps]);
      swaps++;
      nextSwap = steps + 280;
    }
    driveStep(car, race, curve, ap);
    rig.setLookBack(false);
    rig.update(simDt, car.state);
    if (!Number.isFinite(cam.position.x + cam.position.y + cam.position.z + cam.fov)) nan++;
    if (rig.mode !== 'hood' && car.state.speed > 5) {
      cam.updateMatrixWorld();
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      v.copy(car.state.pos).project(cam);
      if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1) recenters++;
    }
    steps++;
  }
  ok(swaps === order.length, `mid-lap cycle performed ${swaps}/${order.length} swaps`);
  ok(nan === 0, `mid-lap cycle: no NaNs across ${steps} steps`);
  ok(recenters > 100, `mid-lap cycle: car stayed framed (${recenters} in-frustum chase/close steps)`);
}

console.log(`\ncamera test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
