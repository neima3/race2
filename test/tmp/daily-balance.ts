// Phase 6 daily-difficulty scratch harness (not a gate): autopilot player races the
// seeded daily (2 laps, 1 easy + 2 pro) across N consecutive days; reports finish position.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { RivalManager, DEFAULT_RIVAL_LAPS, type Standing } from '../../src/game/rivals';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { dailyFor, todayKey, DAILY_LAPS } from '../../src/game/daily';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;

function runDaily(dateKey: string): { pos: number; time: number; track: string; lineup: string } {
  const daily = dailyFor(dateKey);
  const def = daily.track;
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: DAILY_LAPS, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, daily.lineup);
  rivals.totalLaps = DAILY_LAPS;
  const slot = rivals.gridSlot(3);
  car.placeAt(slot.dist, slot.lateral);
  rivals.placeOnGrid();
  race.start();
  race.countdownMs = 1;

  const ap = { smooth: 0 };
  let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let pendingRespawn = false;
  let recover = 0;
  let recoverDir = 1;
  let stuck = 0;
  let speedNow = 0;
  let latNow = 0;
  let wall = 0;
  let finishWallMs = -1;
  let finishOrder: Standing[] | null = null;
  const maxSteps = 120000;

  while (wall < maxSteps) {
    const playerFinished = race.phase === 'finished';
    if (pendingRespawn) { race.respawnAtCheckpoint(); pendingRespawn = false; }
    if (!playerFinished) {
      if (recover > 0) {
        recover -= 1;
        input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
        if (recover === 0) ap.smooth = 0;
      } else {
        const r = autopilotDrive(car, curve, simDt, ap);
        pendingRespawn = !!r.respawn;
        if (speedNow < 2.5 && Math.abs(latNow) > 3) stuck++;
        else stuck = 0;
        if (stuck > 40) { stuck = 0; recover = 55; recoverDir = -(Math.sign(latNow) || 1); }
        input = { steer: r.respawn ? 0 : r.steer, throttle: r.respawn ? 0 : r.throttle, brake: r.respawn ? 0 : r.brake, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      }
    }
    race.update(simDt * 1000, input);
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;
    if (race.phase === 'finished') {
      if (finishWallMs < 0) { finishWallMs = wall; finishOrder = rivals.freeze(race.totalProgress); }
      if (rivals.allFinished() || wall - finishWallMs > 20000) break;
    }
  }

  const order = finishOrder ?? rivals.freeze(race.totalProgress);
  return {
    pos: order.findIndex((s) => s.isPlayer) + 1,
    time: race.elapsedMs,
    track: def.id,
    lineup: daily.lineup.map((r) => `${r.name}:${r.tier[0]}`).join(' '),
  };
}

const args = process.argv.slice(2);
const days = Number(args[0] ?? 10) || 10;
const start = Date.UTC(2026, 8, 14); // 10 days from "today" (2026-09-13) forward
const rows: string[] = [];
const positions: number[] = [];
for (let i = 0; i < days; i++) {
  const key = todayKey(new Date(start + i * 86400000));
  const r = runDaily(key);
  positions.push(r.pos);
  rows.push(`${key} ${r.track.padEnd(15)} P${r.pos} ${(r.time / 1000).toFixed(1)}s [${r.lineup}]`);
}
console.log(rows.join('\n'));
const mid = positions.filter((p) => p === 2 || p === 3).length;
const p4 = positions.filter((p) => p === 4).length;
console.log(`\npositions: ${positions.join(',')} — mid-pack (P2/P3) on ${mid}/${days}, P4 on ${p4}/${days}`);
