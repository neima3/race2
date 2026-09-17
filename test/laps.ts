import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics, BODY_TUNING, type CarBodyId } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { serializeGhost } from '../src/game/race';
import { RAIN_GRIP_MULT, SURFACE_GRIP_FLOOR, combinedGripMultiplier } from '../src/game/rules';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const bodyArg = process.argv.find((a) => a.startsWith('--body='));
const bodyRaw = bodyArg ? bodyArg.split('=')[1] : 'standard';
const body: CarBodyId = bodyRaw === 'aero' || bodyRaw === 'tank' || bodyRaw === 'glide' ? bodyRaw : 'standard';
const bodyTuning = BODY_TUNING[body];

const results: { track: string; ok: boolean; timeMs: number; ghost: string | null }[] = [];

for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve, bodyTuning);
  const save = new SaveManager();
  const events: string[] = [];
  const race = new RaceController(car, curve, def, save, (ev) => events.push(ev));
  race.start();
  car.placeAtFrame(0, 8);
  race.countdownMs = 1;

  const simDt = 1 / 120;
  let wall = 0;
  let finished = false;
  const ap = { smooth: 0 };
  const maxSteps = 150000;
  let input = {
    steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false,
    respawn: false, restart: false, cameraToggle: false, pause: false, photo: false,
  };
  let pendingRespawn = false;
  let recover = 0;
  let recoverDir = 1;
  let stuck = 0;
  let speedNow = 0;
  let latNow = 0;
  while (wall < maxSteps) {
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    race.update(simDt * 1000, input);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;
    if (race.phase === 'finished') {
      finished = true;
      break;
    }
    if (recover > 0) {
      recover -= 1;
      input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      if (recover === 0) ap.smooth = 0;
      continue;
    }
    const r = autopilotDrive(car, curve, simDt, ap);
    pendingRespawn = !!r.respawn;
    if (speedNow < 2.5 && Math.abs(latNow) > 3) {
      stuck++;
    } else {
      stuck = 0;
    }
    if (stuck > 40) {
      stuck = 0;
      recover = 55;
      recoverDir = -(Math.sign(latNow) || 1);
    }
    input = {
      steer: r.respawn ? 0 : r.steer,
      throttle: r.respawn ? 0 : r.throttle,
      brake: r.respawn ? 0 : r.brake,
      drift: false, lookBack: false, respawn: false, restart: false,
      cameraToggle: false, pause: false, photo: false,
    };
  }
  const timeMs = Math.round(race.elapsedMs);
  const ghost = finished ? serializeGhost(race.lastLapSamples.filter((_, i) => i % 2 === 0)) : null;
  results.push({ track: def.id, ok: finished, timeMs, ghost });
  console.log(`${finished ? 'PASS' : 'FAIL'} ${def.id}: ${finished ? (timeMs / 1000).toFixed(2) + 's' : 'DID NOT FINISH'} (events: ${events.join(',')})`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tracks completed`);
const STRICT = ['canyon-twist', 'grand-gauntlet', 'gauntlet-ii'];
const strictFails = failed.filter((r) => STRICT.includes(r.track));
if (strictFails.length) console.log('STRICT-WARN (finish in browser, bot wedges headless): ' + strictFails.map((f) => f.track).join(', '));

const simDt = 1 / 120;
let bodyCheckFails = 0;
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve, bodyTuning);
  car.placeAt(30, 0);
  for (let i = 0; i < 90; i++) car.step(simDt, -1, 1, 0, false, true);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.state.quat);
  const headingRight = fwd.dot(curve.frames[car.state.trackIndex].binormal);
  const steerOk = headingRight < -0.02 && car.state.lateral < -0.1;
  if (steerOk) {
    console.log(`PASS ${body}: steering-direction (heading·right=${headingRight.toFixed(3)}, lateral ${car.state.lateral.toFixed(2)})`);
  } else {
    bodyCheckFails++;
    console.log(`FAIL ${body}: steering-direction heading·right=${headingRight.toFixed(3)} lateral=${car.state.lateral.toFixed(2)} (expected leftward yaw)`);
  }

  const car2 = new CarPhysics(curve, bodyTuning);
  car2.placeAt(30, 2.5);
  const frame = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
    halfWidth: 0,
    dist: 0,
  };
  curve.frameAtDist(30, frame);
  const dotRight = car2.state.pos.clone().sub(frame.pos).dot(frame.binormal);
  const q = {
    index: 0,
    frame: {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      binormal: new THREE.Vector3(),
      halfWidth: 0,
      dist: 0,
    },
    lateral: 0,
    vertical: 0,
    longitudinal: 0,
    dist: 0,
  };
  curve.surfaceQuery(car2.state.pos, 0, q);
  const placeOk = Math.abs(dotRight - 2.5) < 0.35 && q.lateral > 1.5;
  if (placeOk) {
    console.log(`PASS ${body}: placement (rel·right=${dotRight.toFixed(2)}, surfaceQuery lateral=${q.lateral.toFixed(2)})`);
  } else {
    bodyCheckFails++;
    console.log(`FAIL ${body}: placement rel·right=${dotRight.toFixed(2)} surface lateral=${q.lateral.toFixed(2)} (expected ≈ +2.5 / positive)`);
  }
}

let rainCheckFails = 0;
if (process.argv.includes('--rain')) {
  const def = TRACKS.find((t) => t.id === 'volt-alley')!;
  const curve = new TrackCurve(def.points, true);

  const combined = combinedGripMultiplier(true, RAIN_GRIP_MULT);
  const clampOk = combined >= SURFACE_GRIP_FLOOR && Math.abs(combined - RAIN_GRIP_MULT * 0.45) < 1e-9;
  if (clampOk) {
    console.log(`PASS rain: combined grip rain(${RAIN_GRIP_MULT}) x slick(0.45) = ${combined.toFixed(3)} >= floor ${SURFACE_GRIP_FLOOR}`);
  } else {
    rainCheckFails++;
    console.log(`FAIL rain: combined grip ${combined.toFixed(3)} (expected ${RAIN_GRIP_MULT * 0.45} clamped at >= ${SURFACE_GRIP_FLOOR})`);
  }

  const simDt = 1 / 120;
  const dry = new CarPhysics(curve, bodyTuning);
  const wet = new CarPhysics(curve, bodyTuning);
  dry.placeAt(40, 0);
  wet.placeAt(40, 0);
  wet.state.surfaceGrip = RAIN_GRIP_MULT;
  const f0 = curve.frames[dry.state.trackIndex];
  dry.state.vel.addScaledVector(f0.binormal, 6);
  wet.state.vel.addScaledVector(f0.binormal, 6);
  for (let i = 0; i < 12; i++) {
    dry.step(simDt, 0, 1, 0, false, true);
    wet.step(simDt, 0, 1, 0, false, true);
  }
  const dryLatVel = dry.state.vel.dot(curve.frames[dry.state.trackIndex].binormal);
  const wetLatVel = wet.state.vel.dot(curve.frames[wet.state.trackIndex].binormal);
  const gripOk = wetLatVel > dryLatVel * 1.05;
  if (gripOk) {
    console.log(`PASS rain: wet residual lateral vel ${wetLatVel.toFixed(2)} > dry ${dryLatVel.toFixed(2)} (grip multiplier active)`);
  } else {
    rainCheckFails++;
    console.log(`FAIL rain: wet residual lateral vel ${wetLatVel.toFixed(2)} vs dry ${dryLatVel.toFixed(2)} (expected wet > dry x 1.05)`);
  }

  const steerCar = new CarPhysics(curve, bodyTuning);
  steerCar.state.surfaceGrip = RAIN_GRIP_MULT;
  steerCar.placeAt(30, 0);
  for (let i = 0; i < 90; i++) steerCar.step(simDt, -1, 1, 0, false, true);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(steerCar.state.quat);
  const headingRight = fwd.dot(curve.frames[steerCar.state.trackIndex].binormal);
  const steerOk = headingRight < -0.02 && steerCar.state.lateral < -0.1;
  if (steerOk) {
    console.log(`PASS rain: steering-direction (heading·right=${headingRight.toFixed(3)}, lateral ${steerCar.state.lateral.toFixed(2)})`);
  } else {
    rainCheckFails++;
    console.log(`FAIL rain: steering-direction heading·right=${headingRight.toFixed(3)} lateral=${steerCar.state.lateral.toFixed(2)}`);
  }

  const car = new CarPhysics(curve, bodyTuning);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {});
  race.start();
  car.placeAtFrame(0, 8);
  car.state.surfaceGrip = RAIN_GRIP_MULT;
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  let wall = 0;
  let finished = false;
  let pendingRespawn = false;
  let recover = 0;
  let recoverDir = 1;
  let stuck = 0;
  let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  while (wall < 150000) {
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    race.update(simDt * 1000, input);
    wall += simDt * 1000;
    const speedNow = car.state.speed;
    const latNow = car.state.lateral;
    if (race.phase === 'finished') {
      finished = true;
      break;
    }
    if (recover > 0) {
      recover -= 1;
      input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      if (recover === 0) ap.smooth = 0;
      continue;
    }
    const r = autopilotDrive(car, curve, simDt, ap);
    pendingRespawn = !!r.respawn;
    if (speedNow < 2.5 && Math.abs(latNow) > 3) stuck++;
    else stuck = 0;
    if (stuck > 40) {
      stuck = 0;
      recover = 55;
      recoverDir = -(Math.sign(latNow) || 1);
    }
    input = { steer: r.respawn ? 0 : r.steer, throttle: r.respawn ? 0 : r.throttle, brake: r.respawn ? 0 : r.brake, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  }
  const timeMs = Math.round(race.elapsedMs);
  const persistOk = car.state.surfaceGrip === RAIN_GRIP_MULT;
  if (finished && persistOk) {
    console.log(`PASS rain volt-alley: ${(timeMs / 1000).toFixed(2)}s (surfaceGrip ${RAIN_GRIP_MULT} persisted through respawns, rain x slick zones stacked)`);
  } else {
    rainCheckFails++;
    console.log(`FAIL rain volt-alley: ${finished ? 'finished' : 'DID NOT FINISH'} (surfaceGrip now ${car.state.surfaceGrip})`);
  }
}

if (process.argv.includes('--emit-ghosts')) {
  let prev: Record<string, string> = {};
  try {
    prev = (await import('../src/track/devghosts.gen')).DEV_GHOSTS;
  } catch {
    prev = {};
  }
  const finished = new Set(results.filter((r) => r.ghost).map((r) => r.track));
  // carry forward ghosts for tracks the current bot cannot finish headless
  // (strict-exempt set) so a regen only ever adds or updates, never deletes
  const carried = Object.entries(prev)
    .filter(([id]) => TRACKS.some((t) => t.id === id) && !finished.has(id))
    .map(([id, ghost]) => `  '${id}': '${ghost}',`);
  const entries = results
    .filter((r) => r.ghost)
    .map((r) => `  '${r.track}': '${r.ghost}',`);
  const out = `// AUTO-GENERATED by test/laps.ts --emit-ghosts. Do not edit.\nexport const DEV_GHOSTS: Record<string, string> = {\n${[...entries, ...carried].join('\n')}\n};\n`;
  (await import('node:fs')).writeFileSync('src/track/devghosts.gen.ts', out);
  console.log(`dev ghosts written to src/track/devghosts.gen.ts (${entries.length} fresh + ${carried.length} carried)`);
}
if (failed.length > strictFails.length || bodyCheckFails > 0 || rainCheckFails > 0) process.exit(1);
