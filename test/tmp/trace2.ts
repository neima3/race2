import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const results: { track: string; ok: boolean; timeMs: number; respawnSafe: boolean }[] = [];

for (const def of [TRACKS[1]]) {
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
  const maxSteps = 150 * 120;
  let input = {
    steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false,
    respawn: false, restart: false, cameraToggle: false, pause: false, photo: false,
  };
  let pendingRespawn = false;
  let lastSec = -1;
  while (wall < maxSteps) {
    if (Math.floor(wall / 1000) !== lastSec) { lastSec = Math.floor(wall / 1000); const s2 = car.state; console.log(lastSec + "s d=" + Math.round(s2.trackDist) + " v=" + Math.round(s2.speedMs) + " lat=" + Math.round(s2.lateral)); }
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    race.update(simDt * 1000, input);
    wall += simDt * 1000;
    if (race.phase === 'finished') {
      finished = true;
      break;
    }
    const r = autopilotDrive(car, curve, simDt, ap);
    pendingRespawn = !!r.respawn;
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
  console.log(`TRACE ${finished ? 'PASS' : 'FAIL'} ${def.id}: ${finished ? (timeMs / 1000).toFixed(2) + 's' : 'DID NOT FINISH'} (events: ${events.join(',')})`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tracks completed`);

