import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics, BODY_TUNING, type CarBodyId } from '../../src/physics/car';
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

// GLIDE drift-identity evidence (v10 P1). Engine mechanics (documented in v8 P6 notes):
// car.ts rebuilds velocity along the heading each step, so drift slip (driftAmount)
// only accumulates from align-to-frame on sharp/banked bends — pure steering never
// generates it. A drift-mode lap therefore holds drift + reacts late to the road
// (steer lag), which sustains heading-vs-frame error through banked hairpins.

// Production drift-score accrual (main.ts): driftAmount > 0.3 && grounded && speed > 14
//   score += driftAmount * speed * dt * 12
function scoreStep(car: CarPhysics, dt: number): number {
  const s = car.state;
  if (s.driftAmount > 0.3 && s.grounded && s.speed > 14) return s.driftAmount * s.speed * dt * 12;
  return 0;
}

// Slide-retention: 40 m/s straight, +6 m/s lateral impulse, drift held, steer 0.
// Time until driftAmount falls back under 0.3 — the "longest drifts" metric.
function slideRetention(body: CarBodyId): number {
  const def = TRACKS.find((t) => t.id === 'salt-flats')!;
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve, BODY_TUNING[body]);
  car.placeAt(60, 0);
  car.state.vel.addScaledVector(curve.frames[car.state.trackIndex].tangent, 40);
  car.state.vel.addScaledVector(curve.frames[car.state.trackIndex].binormal, 6);
  const simDt = 1 / 120;
  let t = 0;
  while (t < 6000) {
    car.step(simDt, 0, 1, 0, true, true);
    t += simDt * 1000;
    if (car.state.driftAmount < 0.3) break;
  }
  return t / 1000;
}

interface LapResult {
  finished: boolean;
  score: number;
  timeMs: number;
  wallHits: number;
  driftSeconds: number;
  maxDrift: number;
}

// Drift-mode lap: drift held from GO, pure-pursuit steer delayed 27 steps (0.225s)
// x0.9 gain + centering damper — a repeatable drifter that keeps the slide alive.
function driftLap(trackId: string, body: CarBodyId): LapResult {
  const def = TRACKS.find((t) => t.id === trackId)!;
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve, BODY_TUNING[body]);
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
  let wall = 0, score = 0, driftSeconds = 0, maxDrift = 0;
  let pendingRespawn = false, recover = 0, recoverDir = 1, stuck = 0;
  let input = { steer: 0, throttle: 1, brake: 0, drift: true, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  while (wall < 240000) {
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    race.update(simDt * 1000, input);
    wall += simDt * 1000;
    score += scoreStep(car, simDt);
    if (car.state.driftAmount > 0.3 && car.state.grounded && car.state.speed > 14) driftSeconds += simDt;
    if (car.state.driftAmount > maxDrift) maxDrift = car.state.driftAmount;
    if (race.phase === 'finished') {
      return {
        finished: true,
        score: Math.round(score),
        timeMs: Math.round(race.elapsedMs),
        wallHits: events.filter((e) => e === 'wallHit').length,
        driftSeconds,
        maxDrift,
      };
    }
    if (recover > 0) {
      recover -= 1;
      input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      if (recover === 0) ap.smooth = 0;
      continue;
    }
    const r = autopilotDrive(car, curve, simDt, ap);
    pendingRespawn = !!r.respawn;
    const speedNow = car.state.speed, latNow = car.state.lateral;
    if (speedNow < 2.5 && Math.abs(latNow) > 3) stuck++;
    else stuck = 0;
    if (stuck > 40) {
      stuck = 0;
      recover = 55;
      recoverDir = -(Math.sign(latNow) || 1);
    }
    buf[bufIdx] = r.respawn ? 0 : r.steer;
    const delayed = buf[(bufIdx + 120 - 27) % 120];
    bufIdx = (bufIdx + 1) % 120;
    const center = -Math.max(-1, Math.min(1, car.state.lateral * 0.12));
    input = {
      steer: r.respawn ? 0 : Math.max(-1, Math.min(1, delayed * 0.9 + center)),
      throttle: r.respawn ? 0 : r.throttle,
      brake: r.respawn ? 0 : r.brake,
      drift: !r.respawn,
      lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false,
    };
  }
  return { finished: false, score: Math.round(score), timeMs: Math.round(race.elapsedMs), wallHits: events.filter((e) => e === 'wallHit').length, driftSeconds, maxDrift };
}

const BODIES: CarBodyId[] = ['standard', 'aero', 'tank', 'glide'];

console.log('=== slide retention (s; longer = longer drifts) ===');
for (const body of BODIES) {
  console.log(`${body.padEnd(9)} ${slideRetention(body).toFixed(2)}s`);
}

for (const trackId of ['serpents-tail', 'salt-flats']) {
  console.log(`\n=== drift-mode laps: ${trackId} (drift held, steer lag 27 x0.9 + damper) ===`);
  console.log('body       fin    score     lap      walls driftT maxD');
  for (const body of BODIES) {
    const r = driftLap(trackId, body);
    console.log(
      `${body.padEnd(9)}  ${String(r.finished).padEnd(5)}  ${String(r.score).padEnd(8)}  ${(r.timeMs / 1000).toFixed(2).padEnd(7)}  ${String(r.wallHits).padEnd(5)} ${r.driftSeconds.toFixed(1).padEnd(5)} ${r.maxDrift.toFixed(2)}`,
    );
  }
}
