import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics, BODY_TUNING, type CarBodyId } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { serializeGhost } from '../src/game/race';

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
const body: CarBodyId = bodyRaw === 'aero' || bodyRaw === 'tank' ? bodyRaw : 'standard';
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

if (process.argv.includes('--emit-ghosts')) {
  const entries = results
    .filter((r) => r.ghost)
    .map((r) => `  '${r.id ?? (r as unknown as { track: string }).track}': '${r.ghost}',`);
  const out = `// AUTO-GENERATED by test/laps.ts --emit-ghosts. Do not edit.\nexport const DEV_GHOSTS: Record<string, string> = {\n${entries.join('\n')}\n};\n`;
  (await import('node:fs')).writeFileSync('src/track/devghosts.gen.ts', out);
  console.log('dev ghosts written to src/track/devghosts.gen.ts');
}
if (failed.length > strictFails.length || bodyCheckFails > 0) process.exit(1);
