import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics, BODY_TUNING } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { buildReplayLink } from '../../src/game/share';
import { writeFileSync } from 'node:fs';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

function scoreStep(car: CarPhysics, dt: number): number {
  const s = car.state;
  if (s.driftAmount > 0.3 && s.grounded && s.speed > 14) return s.driftAmount * s.speed * dt * 12;
  return 0;
}

// the verified drift-mode lap (glide) — recorded into a #r= replay link
const def = TRACKS.find((t) => t.id === 'serpents-tail')!;
const curve = new TrackCurve(def.points, true);
const car = new CarPhysics(curve, BODY_TUNING.glide);
const save = new SaveManager();
const events: string[] = [];
const race = new RaceController(car, curve, def, save, (ev) => events.push(ev));
race.start();
car.placeAtFrame(0, 8);
race.countdownMs = 1;
const simDt = 1 / 120;
const ap = { smooth: 0 };
const buf = new Float32Array(120).fill(0);
let bufIdx = 0;
let wall = 0, score = 0, driftSeconds = 0;
let pendingRespawn = false, recover = 0, recoverDir = 1, stuck = 0;
let input = { steer: 0, throttle: 1, brake: 0, drift: true, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
while (wall < 240000) {
  if (pendingRespawn) { race.respawnAtCheckpoint(); pendingRespawn = false; }
  race.update(simDt * 1000, input);
  wall += simDt * 1000;
  score += scoreStep(car, simDt);
  if (car.state.driftAmount > 0.3 && car.state.grounded && car.state.speed > 14) driftSeconds += simDt;
  if (race.phase === 'finished') break;
  if (recover > 0) {
    recover -= 1;
    input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
    if (recover === 0) ap.smooth = 0;
    continue;
  }
  const r = autopilotDrive(car, curve, simDt, ap);
  pendingRespawn = !!r.respawn;
  const speedNow = car.state.speed, latNow = car.state.lateral;
  if (speedNow < 2.5 && Math.abs(latNow) > 3) stuck++; else stuck = 0;
  if (stuck > 40) { stuck = 0; recover = 55; recoverDir = -(Math.sign(latNow) || 1); }
  buf[bufIdx] = r.respawn ? 0 : r.steer;
  const delayed = buf[(bufIdx + 120 - 27) % 120];
  bufIdx = (bufIdx + 1) % 120;
  const center = -Math.max(-1, Math.min(1, car.state.lateral * 0.12));
  input = {
    steer: r.respawn ? 0 : Math.max(-1, Math.min(1, delayed * 0.9 + center)),
    throttle: r.respawn ? 0 : r.throttle, brake: r.respawn ? 0 : r.brake,
    drift: !r.respawn, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false,
  };
}

const timeMs = Math.round(race.elapsedMs);
console.log(`lap: finished=${race.phase === 'finished'} timeMs=${timeMs} driftScore=${Math.round(score)} driftSeconds=${driftSeconds.toFixed(1)} events=${events.join(',')}`);
const samples = race.lastLapSamples.filter((_, i) => i % 2 === 0);
const link = await buildReplayLink(def, timeMs, samples);
writeFileSync('qa/v10-phase1/drift-replay-link.txt', link);
console.log(`replay link written (${link.length} chars)`);
