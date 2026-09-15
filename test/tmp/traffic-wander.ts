// P9 lateral-wander census: plain autopilot lap per track; |lateral| percentiles while racing.
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;

for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  car.placeAtFrame(0, 8);
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  const lats: number[] = [];
  const hw: number[] = [];
  while (race.phase !== 'finished') {
    if (race.phase === 'racing') {
      const r = autopilotDrive(car, curve, simDt, ap);
      if (r.respawn) race.respawnAtCheckpoint();
      input.steer = r.respawn ? 0 : r.steer;
      input.throttle = r.respawn ? 0 : r.throttle;
      input.brake = r.respawn ? 0 : r.brake;
    }
    race.update(simDt * 1000, input);
    if (race.phase === 'racing' && car.state.speed > 15) {
      lats.push(Math.abs(car.state.lateral));
      hw.push(curve.frames[car.state.trackIndex].halfWidth);
    }
  }
  lats.sort((a, b) => a - b);
  const pct = (p: number) => lats[Math.min(lats.length - 1, Math.floor(p * lats.length))];
  const meanHw = hw.reduce((s, x) => s + x, 0) / hw.length;
  console.log(
    `${def.id.padEnd(18)} len=${Math.round(curve.length).toString().padStart(4)} hw=${meanHw.toFixed(1)} | lat p50=${pct(0.5).toFixed(2)} p75=${pct(0.75).toFixed(2)} p90=${pct(0.9).toFixed(2)} p97=${pct(0.97).toFixed(2)} max=${lats[lats.length - 1].toFixed(2)}`,
  );
}
