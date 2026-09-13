// Phase 10 balance harness (scratch, not committed): run any (track, lineup) race
// with the autopilot player; report positions / time gaps / maxGap attribution.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { RivalManager, pickLineup, type RivalPreset, type Standing } from '../../src/game/rivals';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { CUPS, cupLineup, cupRaceTrack } from '../../src/game/career';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

const simDt = 1 / 120;
const STRICT = new Set(['canyon-twist', 'grand-gauntlet', 'gauntlet-ii']);

interface Row {
  label: string; race: string; strict: boolean; pos: number; gaps: string; maxGap: number;
  maxGapWho: string; respawns: string; playerTime: number;
}

function runRace(label: string, def: (typeof TRACKS)[number], lineup: RivalPreset[], forceFinish = false): Row {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 2, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
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
  let maxGap = 0;
  let maxGapWho = '';
  let maxGapT = 0;
  const prevProg = new Map<string, number>();
  const lastRespawnT = new Map<string, number>();
  const respawns = new Map<string, number>();
  let finishOrder: Standing[] | null = null;
  let playerTime = 0;
  let wedgeSteps = 0;
  const maxSteps = 200000;

  while (wall < maxSteps) {
    const playerFinished = race.phase === 'finished';
    if (pendingRespawn) { race.respawnAtCheckpoint(); pendingRespawn = false; }
    if (!playerFinished) {
      const wedge = speedNow < 3 && Math.abs(latNow) < 4 && wall > 20000;
      wedgeSteps = wedge ? wedgeSteps + 1 : 0;
      if (wedgeSteps > 120 * 12 && forceFinish && STRICT.has(def.id)) {
        const frames = curve.frames.length;
        car.placeAtFrame(frames - 40, curve.length - 30);
        race['prevDist'] = curve.length - 30;
        car.applyBoost(30, 3);
        wedgeSteps = 0;
      } else if (recover > 0) {
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
    if (race.phase === 'racing') {
      const pp = race.totalProgress;
      for (const rv of rivals.standings(pp)) {
        if (rv.isPlayer) continue;
        const prev = prevProg.get(rv.name);
        if (prev !== undefined && prev - rv.progress > 10) {
          respawns.set(rv.name, (respawns.get(rv.name) ?? 0) + 1);
          lastRespawnT.set(rv.name, wall);
        }
        prevProg.set(rv.name, rv.progress);
        const g = Math.abs(pp - rv.progress);
        if (g > maxGap) {
          maxGap = g;
          maxGapWho = `${rv.name}${wall - (lastRespawnT.get(rv.name) ?? -1e9) < 3000 ? ' (post-respawn)' : ''} t=${(wall / 1000).toFixed(0)}s side=${rv.progress > pp ? 'ahead' : 'behind'}`;
          maxGapT = wall;
        }
      }
    }
    if (race.phase === 'finished') {
      if (finishWallMs < 0) { finishWallMs = wall; finishOrder = rivals.freeze(race.totalProgress); playerTime = race.elapsedMs; }
      if (rivals.allFinished() || wall - finishWallMs > 30000) break;
    }
  }

  const order = finishOrder ?? rivals.freeze(race.totalProgress);
  const pos = order.findIndex((s) => s.isPlayer) + 1;
  const leader = order[0];
  const gaps = order.map((s, i) => {
    if (s.isPlayer) return `P${i + 1} YOU(${(playerTime / 1000).toFixed(1)}s)`;
    const tg = s.finished && s.finishTimeMs != null && leader.finished && leader.finishTimeMs != null
      ? ` +${((s.finishTimeMs - (leader.finishTimeMs ?? 0)) / 1000).toFixed(1)}s`
      : ` +${Math.round(s.gapMeters)}m`;
    return `P${i + 1} ${s.name}${tg}`;
  }).join(' ');
  const respawnStr = Array.from(respawns.entries()).map(([k, v]) => `${k}:${v}`).join(',') || 'none';
  return { label, race: def.id, strict: STRICT.has(def.id), pos, gaps, maxGap, maxGapWho, respawns: respawnStr, playerTime };
}

const args = process.argv.slice(2);
const rows: Row[] = [];

if (args[0] === '--gate') {
  rows.push(runRace('gate-T1', TRACKS[0], pickLineup(TRACKS[0].id)));
  rows.push(runRace('gate-T5', TRACKS[4], pickLineup(TRACKS[4].id)));
} else if (args[0] === '--race' && args.length >= 3) {
  const def = TRACKS.find((t) => t.id === args[1])!;
  const lineup = args[2].split(',').map((s) => {
    const [name, tier] = s.split(':');
    const roster = { ROOKIE: 'easy', HALCYON: 'easy', JUNO: 'easy', SABLE: 'mid', MIRAGE: 'mid', ONYX: 'mid', APEX: 'pro', VESPER: 'pro' } as Record<string, string>;
    return pickLineup(def.id, 9, [roster[name] ?? 'mid']).find((r) => r.name === name) ?? pickLineup(def.id, 9, [(tier as 'easy') ?? 'mid'])[0];
  });
  rows.push(runRace('custom', def, lineup, args[3] === 'force'));
} else {
  for (const cup of CUPS) {
    for (let i = 0; i < 4; i++) {
      rows.push(runRace(cup.name, cupRaceTrack(cup, i), cupLineup(cup, i), true));
    }
  }
}

console.log('\nlabel       | race               | pos | maxGap | attribution');
for (const r of rows) {
  console.log(`${r.label.padEnd(11)} | ${r.race.padEnd(18)} | P${r.pos}   | ${r.maxGap.toFixed(1).padStart(6)} | ${r.maxGapWho}`);
  console.log(`    order: ${r.gaps} | respawns: ${r.respawns}`);
}
console.log(`\npositions — ${rows.map((r) => `${r.race.slice(0, 6)}:P${r.pos}`).join(' ')}`);
