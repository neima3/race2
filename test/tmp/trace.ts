import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const def = TRACKS[1];
const curve = new TrackCurve(def.points, true);
const car = new CarPhysics(curve);
const save = new SaveManager();
const race = new RaceController(car, curve, def, save, (ev) => { if (ev === 'finish') console.log('FINISH'); });
race.start();
car.placeAtFrame(0, 8);
race.countdownMs = 1;
const ap = { smooth: 0 };
const simDt = 1 / 120;
const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
let lastLog = 0;
for (let step = 0; step < 120 * 120; step++) {
  const r = autopilotDrive(car, curve, simDt, ap);
  if (r.respawn) { race.respawnAtCheckpoint(); console.log(`respawn at t=${(step/120).toFixed(1)}s`); }
  input.steer = r.respawn ? 0 : r.steer;
  input.throttle = r.respawn ? 0 : r.throttle;
  input.brake = r.respawn ? 0 : r.brake;
  race.update(simDt * 1000, input);
  if (step % 120 === 0) {
    const s = car.state;
    console.log(`${(step/120).toFixed(0)}s d=${Math.round(s.trackDist)} v=${Math.round(s.speedMs)} lat=${Math.round(s.lateral)} g=${s.grounded?1:0}`);
  }
  if (race.phase === 'finished') { console.log('FINISHED at', Math.round(race.elapsedMs)); break; }
}
