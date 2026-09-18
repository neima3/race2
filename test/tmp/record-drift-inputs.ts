import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics, BODY_TUNING } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { writeFileSync } from 'node:fs';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

// Distance-keyed input recording of the verified glide drifter (1m resolution).
const def = TRACKS.find((t) => t.id === 'serpents-tail')!;
const curve = new TrackCurve(def.points, true);
const car = new CarPhysics(curve, BODY_TUNING.glide);
const save = new SaveManager();
const race = new RaceController(car, curve, def, save, () => {});
race.start();
car.placeAtFrame(0, 8);
race.countdownMs = 1;
const simDt = 1 / 120;
const ap = { smooth: 0 };
const buf = new Float32Array(120).fill(0);
let bufIdx = 0;
let wall = 0, score = 0, driftSeconds = 0;
let input = { steer: 0, throttle: 1, brake: 0, drift: true, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
const byDist: { d: number; s: number; th: number; b: number }[] = [];
let nextDist = 5;
while (wall < 120000) {
  race.update(simDt * 1000, input);
  wall += simDt * 1000;
  const da = car.state.driftAmount;
  if (da > 0.3 && car.state.grounded && car.state.speed > 14) {
    score += da * car.state.speed * simDt * 12;
    driftSeconds += simDt;
  }
  if (race.phase === 'finished') break;
  const dist = car.state.trackDist;
  while (dist >= nextDist) {
    byDist.push({ d: +nextDist.toFixed(1), s: +input.steer.toFixed(3), th: +input.throttle.toFixed(2), b: +input.brake.toFixed(2) });
    nextDist += 1;
  }
  if (dist > 628) break;
  const r = autopilotDrive(car, curve, simDt, ap);
  if ((r as { respawn?: boolean }).respawn) break;
  buf[bufIdx] = r.steer;
  const delayed = buf[(bufIdx + 120 - 27) % 120];
  bufIdx = (bufIdx + 1) % 120;
  const center = -Math.max(-1, Math.min(1, car.state.lateral * 0.12));
  input = {
    steer: Math.max(-1, Math.min(1, delayed * 0.9 + center)),
    throttle: r.throttle, brake: r.brake,
    drift: true, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false,
  };
}
console.log(`recorded: dist=${car.state.trackDist.toFixed(0)} timeMs=${Math.round(race.elapsedMs)} driftScore=${Math.round(score)} driftSeconds=${driftSeconds.toFixed(1)} samples=${byDist.length}`);
writeFileSync('qa/v10-phase1/drift-inputs-dist.json', JSON.stringify(byDist));
