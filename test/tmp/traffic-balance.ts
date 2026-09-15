// P9 traffic balance harness (scratch, not committed): 1-lap autopilot traffic race
// per track; reports finish / time / near-misses / collisions / pack size against the
// P9 target (3-8 natural near misses, <=4 collisions on a clean autopilot run).
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { TrafficManager } from '../../src/systems/traffic';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;

function runTrafficRace(def: (typeof TRACKS)[number]): { finished: boolean; timeMs: number; nm: number; col: number; count: number; nan: boolean } {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  const traffic = new TrafficManager(curve, def, new THREE.Group());
  car.placeAtFrame(0, 8);
  traffic.place(car.state.trackDist);
  traffic.setVisible(true);
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let step = 0;
  let nan = false;
  while (race.phase !== 'finished' && step < 90000) {
    if (race.phase === 'racing') {
      const r = autopilotDrive(car, curve, simDt, ap);
      if (r.respawn) race.respawnAtCheckpoint();
      input.steer = r.respawn ? 0 : r.steer;
      input.throttle = r.respawn ? 0 : r.throttle;
      input.brake = r.respawn ? 0 : r.brake;
    }
    race.update(simDt * 1000, input);
    traffic.update(simDt * 1000, car, race.phase === 'racing');
    if (!Number.isFinite(car.state.pos.x + car.state.pos.y + car.state.pos.z + car.state.vel.x + car.state.vel.y + car.state.vel.z)) nan = true;
    step++;
  }
  return { finished: race.phase === 'finished', timeMs: race.elapsedMs, nm: traffic.nearMisses, col: traffic.collisions, count: traffic.cars.length, nan };
}

const rows: { id: string; finished: boolean; timeMs: number; nm: number; col: number; count: number }[] = [];
for (const def of TRACKS) {
  const r = runTrafficRace(def);
  rows.push({ id: def.id, finished: r.finished, timeMs: r.timeMs, nm: r.nm, col: r.col, count: r.count });
  console.log(
    `${r.finished && !r.nan ? 'ok ' : 'BAD'} ${def.id.padEnd(16)} cars=${r.count} nm=${String(r.nm).padStart(2)} col=${r.col} time=${(r.timeMs / 1000).toFixed(2)}s`,
  );
}
const nmOk = rows.filter((r) => r.nm >= 3 && r.nm <= 8).length;
const colOk = rows.filter((r) => r.col <= 4).length;
const finished = rows.filter((r) => r.finished).length;
console.log(`\nfinished ${finished}/14 | nm in 3-8: ${nmOk}/14 | col <=4: ${colOk}/14`);
console.log(`nm total ${rows.reduce((s, r) => s + r.nm, 0)} | col total ${rows.reduce((s, r) => s + r.col, 0)}`);
const bad = rows.filter((r) => !r.finished || r.nm < 3 || r.nm > 8 || r.col > 4).map((r) => r.id);
if (bad.length) console.log('OUT OF BAND: ' + bad.join(', '));
