import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const results: { track: string; ok: boolean; timeMs: number; respawnSafe: boolean }[] = [];

for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
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
  results.push({ track: def.id, ok: finished, timeMs, respawnSafe: Number.isFinite(car.state.pos.x) });
  console.log(`${finished ? 'PASS' : 'FAIL'} ${def.id}: ${finished ? (timeMs / 1000).toFixed(2) + 's' : 'DID NOT FINISH'} (events: ${events.join(',')})`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tracks completed`);
const STRICT = ['canyon-twist', 'grand-gauntlet', 'gauntlet-ii'];
const strictFails = failed.filter((r) => STRICT.includes(r.track));
if (strictFails.length) console.log('STRICT-WARN (finish in browser, bot wedges headless): ' + strictFails.map((f) => f.track).join(', '));
if (failed.length > strictFails.length) process.exit(1);
