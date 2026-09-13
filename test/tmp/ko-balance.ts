// Phase 6 knockout-pacing scratch harness (not a gate): 3-lap knockout races with the
// autopilot player; reports elimination margins (gap between the eliminated last-place
// car and second-last at each lap boundary) + player survival.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { RivalManager, pickLineup, KNOCKOUT_LAPS, type KnockoutEvent, type Standing } from '../../src/game/rivals';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;

interface KoRow {
  track: string;
  lineup: string;
  margins: { lap: number; who: string; gapM: number }[];
  playerPos: number;
  playerSurvived: boolean;
  playerTime: number | null;
  order: string;
}

function runKnockout(def: (typeof TRACKS)[number], tiers: ('easy' | 'mid' | 'pro')[] = ['easy', 'mid', 'pro']): KoRow {
  const lineup = pickLineup(def.id, 0, tiers);
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: KNOCKOUT_LAPS, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
  rivals.totalLaps = KNOCKOUT_LAPS;
  rivals.knockout = true;

  const margins: KoRow['margins'] = [];
  let playerSurvived = true;
  rivals.onKnockout = (ev: KnockoutEvent) => {
    if (ev.isPlayer) {
      playerSurvived = false;
      race.finishKnockedOut(ev.position);
      return;
    }
    const order = rivals.standings(race.totalProgress).filter((s) => !s.eliminated);
    const last = order[order.length - 1];
    const secondLast = order[order.length - 2];
    margins.push({ lap: rivals['koLapsFired'], who: ev.name, gapM: last && secondLast ? Math.max(0, secondLast.progress - last.progress) : 0 });
    console.log(`    [${def.id}] boundary L${rivals['koLapsFired']}: elim ${ev.name} — exact gap ${last && secondLast ? (secondLast.progress - last.progress).toFixed(2) : 'n/a'}m vs ${secondLast?.name ?? 'n/a'}`);
  };

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
  let playerTime: number | null = null;
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
    const prevLaps = race.completedLaps;
    race.update(simDt * 1000, input);
    const playerLapEff = race.phase === 'racing' && race.completedLaps > prevLaps ? race.completedLaps : 0;
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress, null, playerLapEff);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;
    if (race.phase === 'finished') {
      if (finishWallMs < 0) { finishWallMs = wall; finishOrder = rivals.freeze(race.totalProgress); playerTime = race.elapsedMs; }
      if (rivals.allFinished() || wall - finishWallMs > 20000) break;
    }
  }

  const order = finishOrder ?? rivals.freeze(race.totalProgress);
  const playerPos = order.findIndex((s) => s.isPlayer) + 1;
  const orderStr = order.map((s, i) => `P${i + 1} ${s.name}${s.eliminated ? '(OUT)' : ''}${s.finished && s.finishTimeMs != null && i > 0 && order[0].finishTimeMs != null ? ` +${((s.finishTimeMs - (order[0].finishTimeMs as number)) / 1000).toFixed(1)}s` : ''}`).join(' ');
  return { track: def.id, lineup: lineup.map((r) => `${r.name}:${r.tier[0]}`).join(' '), margins, playerPos, playerSurvived, playerTime, order: orderStr };
}

const args = process.argv.slice(2);
const TIERS = (args[0]?.split(',') ?? []) as ('easy' | 'mid' | 'pro')[];
const tierArg = TIERS.length === 3 ? TIERS : ['easy', 'mid', 'pro'];
const TRACK_IDS = ['sunrise-sprint', 'dune-rush', 'salt-flats', 'harbor-nine'];
const rows: KoRow[] = [];
for (const id of TRACK_IDS) {
  const def = TRACKS.find((t) => t.id === id)!;
  rows.push(runKnockout(def, tierArg));
}

console.log(`\nkockout pacing — tiers [${tierArg.join(',')}]`);
let survived = 0;
for (const r of rows) {
  if (r.playerSurvived) survived++;
  const m = r.margins.map((x) => `L${x.lap} ${x.who} gap ${(x.gapM).toFixed(0)}m`).join(' | ') || 'player KO';
  console.log(`${r.track.padEnd(15)} | player P${r.playerPos}${r.playerSurvived ? ' (duel)' : ' (KO)'} ${r.playerTime ? `${(r.playerTime / 1000).toFixed(1)}s` : ''} | margins: ${m}`);
  console.log(`    order: ${r.order}`);
}
console.log(`\nautopilot survived to the duel on ${survived}/${rows.length} tracks`);
