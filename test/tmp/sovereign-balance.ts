// v9 P5 champion balance probe: GRAND TOUR R4 (serpents-tail) — is SOVEREIGN
// usually P1 but beatable with a strong lap? 3 seeded autopilot attempts:
//   stock player            → champion expected to win
//   player +4% pace         → mid-pack fight
//   player champion tuning  → player expected to beat the champion
// Deterministic lineups (cupLineup), no pace bias on GT. Not a permanent gate.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { RivalManager, type Standing } from '../../src/game/rivals';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { CUPS, cupById, cupLineup, cupRaceTrack } from '../../src/game/career';
import { surfaceGripFor } from '../../src/game/rules';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const cup = cupById('grand-tour') ?? CUPS[CUPS.length - 1];
const raceIndex = cup.trackIds.length - 1;
const def = cupRaceTrack(cup, raceIndex);
const lineup = cupLineup(cup, raceIndex);
console.log(`GT R4: ${def.id} | grid: ${lineup.map((r) => `${r.name}(${r.tier})`).join(', ')}\n`);

function runAttempt(label: string, tuning: { accel?: number; maxSpeed?: number }, rain = false): void {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve, tuning);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 2, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
  rivals.rain = rain;
  const slot = rivals.gridSlot(3);
  car.placeAt(slot.dist, slot.lateral);
  rivals.placeOnGrid();
  race.start();
  race.countdownMs = 1;

  const simDt = 1 / 120;
  const ap = { smooth: 0 };
  let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let pendingRespawn = false;
  let recover = 0;
  let recoverDir = 1;
  let stuck = 0;
  let wall = 0;
  let finishOrder: Standing[] | null = null;
  let finishWallMs = -1;
  while (wall < 160000) {
    const playerFinished = race.phase === 'finished';
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    if (!playerFinished) {
      if (recover > 0) {
        recover -= 1;
        input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
        if (recover === 0) ap.smooth = 0;
      } else {
        const r = autopilotDrive(car, curve, simDt, ap);
        pendingRespawn = !!r.respawn;
        if (car.state.speed < 2.5 && Math.abs(car.state.lateral) > 3) stuck++;
        else stuck = 0;
        if (stuck > 40) {
          stuck = 0;
          recover = 55;
          recoverDir = -(Math.sign(car.state.lateral) || 1);
        }
        input = {
          steer: r.respawn ? 0 : r.steer,
          throttle: r.respawn ? 0 : r.throttle,
          brake: r.respawn ? 0 : r.brake,
          drift: false, lookBack: false, respawn: false, restart: false,
          cameraToggle: false, pause: false, photo: false,
        };
      }
    }
    race.update(simDt * 1000, input);
    // production rain parity (main.ts): player surfaceGrip per step, rivals via rivals.rain
    car.state.surfaceGrip = surfaceGripFor(rain);
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress);
    wall += simDt * 1000;
    if (race.phase === 'finished' && finishWallMs < 0) {
      finishWallMs = wall;
      finishOrder = rivals.freeze(race.totalProgress, race.elapsedMs);
    }
    if (finishWallMs > 0 && (rivals.allFinished() || wall - finishWallMs > 30000)) break;
  }
  const order = finishOrder ?? rivals.freeze(race.totalProgress, race.elapsedMs);
  const pIdx = order.findIndex((s) => s.isPlayer);
  const sIdx = order.findIndex((s) => s.name === 'SOVEREIGN');
  const gap = pIdx >= 0 && sIdx >= 0 ? (order[sIdx].progress - order[pIdx].progress).toFixed(0) : '?';
  console.log(`${label}`);
  console.log(`  player P${pIdx + 1} | SOVEREIGN P${sIdx + 1} | progress gap ${gap}m | finished=${race.phase === 'finished'} all=${rivals.allFinished()}`);
  console.log(`  order: ${order.map((s, i) => `P${i + 1} ${s.name}`).join(' > ')}\n`);
}

runAttempt('attempt 1 — stock player, DRY control:', {});
runAttempt('attempt 2 — stock player, RAIN (production GT R4 conditions):', {}, true);
runAttempt('attempt 3 — player +4% pace, RAIN:', { accel: 34 * 1.04, maxSpeed: 58 * 1.02 }, true);
runAttempt('attempt 4 — player at champion tuning, RAIN:', { accel: 34 * 1.07, maxSpeed: 58 * 1.04 }, true);
