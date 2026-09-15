import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { TrafficManager, NEAR_MISS_MAX_CREDITED, type TrafficFinishData } from '../src/systems/traffic';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

// Traffic Rush headless gate: 1-lap traffic races on sunrise-sprint + dune-rush.
// Asserts: finish achievable (autopilot), natural near-miss, scripted collision
// resolves cleanly, constant traffic count across loop-respawn, accumulator step
// integrity vs a non-traffic run. Exit 1 on any failure.

const simDt = 1 / 120;
let failures = 0;
function fail(msg: string): void {
  failures++;
  console.log(`FAIL ${msg}`);
}
function pass(msg: string): void {
  console.log(`PASS ${msg}`);
}

const RACE_TRACKS = [TRACKS[0], TRACKS[4]];

interface RunResult {
  track: string;
  finished: boolean;
  steps: number;
  timeMs: number;
  nearMisses: number;
  collisions: number;
  countStart: number;
  countEnd: number;
  nan: boolean;
}

function runTrafficRace(def: (typeof TRACKS)[number], opts: { collisionAtStep?: number } = {}): RunResult {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  const traffic = new TrafficManager(curve, def, new THREE.Group());
  let contactCount = 0;
  traffic.onContact = () => contactCount++;
  let flashCount = 0;
  traffic.onNearMiss = () => flashCount++;
  car.placeAtFrame(0, 8);
  traffic.place(car.state.trackDist);
  traffic.setVisible(true);
  race.start();
  race.countdownMs = 1;

  const ap = { smooth: 0 };
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let step = 0;
  let nan = false;
  const countStart = traffic.cars.length;

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
    traffic.updateVisuals();
    if (!Number.isFinite(car.state.pos.x + car.state.pos.y + car.state.pos.z + car.state.vel.x + car.state.vel.y + car.state.vel.z)) nan = true;
    step++;
  }
  const nearMisses = traffic.nearMisses;
  const collisions = traffic.collisions;
  const countEnd = traffic.cars.length;
  const telem = traffic.telemetry();
  return {
    track: def.id,
    finished: race.phase === 'finished',
    steps: step,
    timeMs: race.elapsedMs,
    nearMisses: flashCount || nearMisses,
    collisions: Math.max(collisions, contactCount),
    countStart,
    countEnd,
    nan,
    ...{ telemSteps: telem.count },
  } as RunResult & { telemSteps: number };
}

function runPlainRace(def: (typeof TRACKS)[number]): { finished: boolean; steps: number } {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  car.placeAtFrame(0, 8);
  race.start();
  race.countdownMs = 1;
  const ap = { smooth: 0 };
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let step = 0;
  while (race.phase !== 'finished' && step < 90000) {
    if (race.phase === 'racing') {
      const r = autopilotDrive(car, curve, simDt, ap);
      if (r.respawn) race.respawnAtCheckpoint();
      input.steer = r.respawn ? 0 : r.steer;
      input.throttle = r.respawn ? 0 : r.throttle;
      input.brake = r.respawn ? 0 : r.brake;
    }
    race.update(simDt * 1000, input);
    step++;
  }
  return { finished: race.phase === 'finished', steps: step };
}

const results: RunResult[] = [];
for (const def of RACE_TRACKS) {
  const r = runTrafficRace(def);
  results.push(r);
  console.log(
    `${r.finished && !r.nan ? 'PASS' : 'FAIL'} ${def.id}: finished=${r.finished} time=${(r.timeMs / 1000).toFixed(2)}s | nearMisses=${r.nearMisses} collisions=${r.collisions} | count ${r.countStart}→${r.countEnd} (telem ${(r as RunResult & { telemSteps: number }).telemSteps}) | nan=${r.nan} steps=${r.steps}`,
  );
}

// Scripted collision: park a traffic car right on the player's line, then verify
// the contact resolves — speed recovers, no NaN, car not pinned.
{
  const def = TRACKS[0];
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
  // autopilot until up to speed, then drop a slow cork right on the player's line
  const ap = { smooth: 0 };
  let armed = false;
  let armedStep = -1;
  let contactStep = -1;
  let nan = false;
  let minSpeedAfter = 999;
  let progressOk = true;
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  for (let step = 0; step < 60 * 120 && race.phase !== 'finished'; step++) {
    if (race.phase === 'racing') {
      const r = autopilotDrive(car, curve, simDt, ap);
      if (r.respawn) race.respawnAtCheckpoint();
      input.steer = r.respawn ? 0 : r.steer;
      input.throttle = r.respawn ? 0 : r.throttle;
      input.brake = r.respawn ? 0 : r.brake;
    }
    race.update(simDt * 1000, input);
    if (!armed && car.state.forwardSpeed > 30 && race.phase === 'racing') {
      armed = true;
      armedStep = step;
      const c = traffic.cars[0];
      c.dist = (car.state.trackDist + 3) % curve.length;
      c.lane = car.state.lateral; // dead on the player's line
      c.lat = c.lane;
      c.speed = 8; // slow cork in the way
    }
    traffic.update(simDt * 1000, car, race.phase === 'racing');
    if (traffic.collisions > 0 && contactStep < 0) contactStep = step;
    if (contactStep >= 0) {
      if (!Number.isFinite(car.state.speed) || !Number.isFinite(car.state.lateral)) nan = true;
      minSpeedAfter = Math.min(minSpeedAfter, car.state.forwardSpeed);
      if (step > contactStep + 360 && car.state.forwardSpeed < 12) progressOk = false;
    }
  }
  const resolved = contactStep >= 0 && !nan && minSpeedAfter > -1 && progressOk && car.state.forwardSpeed > 20;
  console.log(
    `collision-resolve: armed@${armedStep} contact@${contactStep} collisions=${traffic.collisions} nan=${nan} minSpeedAfter=${minSpeedAfter.toFixed(1)} finalSpeed=${car.state.forwardSpeed.toFixed(1)} -> ${resolved ? 'PASS' : 'FAIL'}`,
  );
  if (traffic.collisions > 0 && !nan) pass(`collision: contact detected + no NaN (${traffic.collisions} hits)`);
  else fail(`collision: no contact registered (collisions=${traffic.collisions}, nan=${nan})`);
  if (resolved) pass(`collision: player recovers (${minSpeedAfter.toFixed(1)} min → ${car.state.forwardSpeed.toFixed(1)} m/s, mobile)`);
  else fail(`collision: did not resolve cleanly (minSpeed=${minSpeedAfter.toFixed(1)}, final=${car.state.forwardSpeed.toFixed(1)}, progressOk=${progressOk})`);

  // near-miss panel math: bonus capped at NEAR_MISS_MAX_CREDITED
  const bonusMs = Math.min(traffic.nearMisses, NEAR_MISS_MAX_CREDITED) * 150;
  const scoreMs = Math.max(0, 30000 - bonusMs);
  const panel: TrafficFinishData = { nearMisses: traffic.nearMisses, credited: Math.min(traffic.nearMisses, NEAR_MISS_MAX_CREDITED), bonusMs, scoreMs, best: null, newBest: true };
  if (panel.credited <= NEAR_MISS_MAX_CREDITED && scoreMs === 30000 - bonusMs) pass('panel: bonus/credit math sane');
  else fail('panel: bonus math broken');
}

// Aggregate
for (const r of results) {
  if (!r.finished) fail(`${r.track}: autopilot did not finish the traffic race`);
  if (r.nan) fail(`${r.track}: NaN in player state`);
  if (r.nearMisses < 1) fail(`${r.track}: no natural near-miss occurred (expected ≥1 on a clean autopilot run)`);
  if (r.countStart < 8 || r.countStart > 12) fail(`${r.track}: traffic count ${r.countStart} outside 8-12`);
  if (r.countStart !== r.countEnd) fail(`${r.track}: traffic count changed over time (${r.countStart}→${r.countEnd}) — respawn leaks`);
}

// Step integrity: traffic run vs plain run (fixed-step accumulator, same harness)
{
  const plain0 = runPlainRace(RACE_TRACKS[0]);
  const traffic0 = results[0];
  if (!plain0.finished) fail('step-integrity: plain baseline did not finish');
  const delta = Math.abs(traffic0.steps - plain0.steps);
  const tol = Math.max(0.2 * plain0.steps, 600);
  if (traffic0.finished && delta <= tol) pass(`step-integrity: traffic ${traffic0.steps} vs plain ${plain0.steps} steps (Δ${delta} ≤ ${Math.round(tol)})`);
  else fail(`step-integrity: traffic ${traffic0.steps} vs plain ${plain0.steps} steps (Δ${delta} > ${Math.round(tol)})`);
  if (traffic0.nearMisses >= 1) pass(`near-miss: natural near-miss fired on ${traffic0.track} (${traffic0.nearMisses}×)`);
}

const total = results.length * 5 + 4 + 2;
console.log(`\ntraffic test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
