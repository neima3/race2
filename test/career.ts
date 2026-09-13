import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { RivalManager, pickLineup, type Standing } from '../src/game/rivals';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import {
  CUPS,
  CUP_POINTS,
  cupById,
  cupLineup,
  cupUnlock,
  cupRaceTrack,
  cupStandings,
  cupTrophy,
  cupComplete,
  startCupRun,
  applyRaceResult,
} from '../src/game/career';

// Map-backed storage mock that survives simulated reloads (the plain harness
// localStorage stub is a no-op — career persistence must NOT rely on it).
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
} as unknown as Storage;

let failures = 0;
let checks = 0;
function fail(msg: string): void {
  failures++;
  checks++;
  console.log(`FAIL ${msg}`);
}
function pass(msg: string): void {
  checks++;
  console.log(`PASS ${msg}`);
}
function expect(cond: boolean, msg: string): void {
  if (cond) pass(msg);
  else fail(msg);
}

function mkStanding(name: string, isPlayer: boolean, paint: number): Standing {
  return { name, progress: 0, isPlayer, gapMeters: 0, paint, finished: true, finishTimeMs: 60000 + Math.random() * 1000 };
}

const PLAYER_PAINT = 0x29e6ff;

// ---------- 1. Points math on synthetic standings ----------
{
  const run = startCupRun('street-cup');
  expect(CUP_POINTS.join(',') === '25,18,15,12', `points table is 25/18/15/12 (${CUP_POINTS.join(',')})`);
  const r1 = applyRaceResult(run, [mkStanding('SABLE', false, 0x7dff6e), mkStanding('YOU', true, PLAYER_PAINT), mkStanding('MIRAGE', false, 0xc8ff2e), mkStanding('ONYX', false, 0xd78a4a)], PLAYER_PAINT);
  expect(r1.playerPos === 2 && r1.playerPoints === 18, `P2 scores 18 (got pos=${r1.playerPos} pts=${r1.playerPoints})`);
  const pts = (n: string) => run.entries.find((e) => e.name === n)?.points ?? -1;
  expect(pts('SABLE') === 25 && pts('YOU') === 18 && pts('MIRAGE') === 15 && pts('ONYX') === 12, 'per-position points distributed 25/18/15/12');
  const r2 = applyRaceResult(run, [mkStanding('YOU', true, PLAYER_PAINT), mkStanding('MIRAGE', false, 0xc8ff2e), mkStanding('ONYX', false, 0xd78a4a), mkStanding('SABLE', false, 0x7dff6e)], PLAYER_PAINT);
  expect(r2.playerPos === 1 && r2.playerPoints === 25, 'P1 scores 25');
  expect(pts('YOU') === 43 && pts('MIRAGE') === 33 && pts('ONYX') === 27 && pts('SABLE') === 37, 'points accumulate across races (YOU 18+25=43, SABLE 25+12=37)');
  const order = cupStandings(run);
  expect(order.map((e) => e.points).every((p, i) => i === 0 || order[i - 1].points >= p), 'standings sorted by points desc');
  expect(order[0].name === 'YOU', 'YOU leads standings after P1+P2');
  expect(run.nextRace === 2 && run.positions.length === 2, `run advanced to race 3 of 4 (nextRace=${run.nextRace})`);
  expect(run.positions[0] === 2 && run.positions[1] === 1, 'per-race player positions recorded');
  expect(cupTrophy(run) === null, 'trophy null while cup incomplete');
  const playerEntry = run.entries.find((e) => e.isPlayer)!;
  expect(playerEntry.wins === 1, 'player win counted (wins=1)');
  const sable = run.entries.find((e) => e.name === 'SABLE')!;
  expect(sable.wins === 1, 'rival win counted (wins=1)');
}

// ---------- 2. Free-play pickLineup unchanged (default path) ----------
{
  const lu = pickLineup('sunrise-sprint');
  expect(lu.map((r) => r.name).join('/') === 'HALCYON/SABLE/APEX', `free-play lineup unchanged (sunrise-sprint: ${lu.map((r) => r.name).join('/')})`);
  expect(JSON.stringify(lu) === JSON.stringify(pickLineup('sunrise-sprint', 0, ['easy', 'mid', 'pro'])), 'explicit default tiers === implicit default');
}

// ---------- 3. Cup lineups: deterministic, tiered, distinct ----------
{
  const street = cupById('street-cup')!;
  const sprint = cupById('sprint-cup')!;
  const gauntlet = cupById('gauntlet-cup')!;
  const l0 = cupLineup(street, 0);
  expect(JSON.stringify(l0) === JSON.stringify(cupLineup(street, 0)), 'cup lineup deterministic for (track, slot)');
  expect(l0.every((r) => r.tier === 'mid'), 'street cup grid is all-mid');
  expect(new Set(cupLineup(sprint, 0).map((r) => r.tier)).toString() === new Set(['easy', 'mid']).toString(), 'sprint cup grid is easy+mid mix');
  expect(cupLineup(gauntlet, 2).some((r) => r.tier === 'pro'), 'gauntlet cup grid includes pro');
  const names = new Set(l0.map((r) => r.name));
  expect(names.size === 3, `no duplicate rivals in one lineup (${[...names].join('/')})`);
  const allRaces = [0, 1, 2, 3].map((i) => cupLineup(street, i).map((r) => r.name).join('/'));
  expect(new Set(allRaces).size > 1, 'lineups differ across cup races');
  expect([0, 1, 2, 3].every((i) => JSON.stringify(cupLineup(street, i)) === JSON.stringify(cupLineup(street, i))), 'every cup race lineup stable under repeated calls');
}

// ---------- 4. Unlock gating + ?alltracks bypass ----------
{
  store.clear();
  const save = new SaveManager();
  expect(save.schemaVersion === 2, `schema version observed as 2 (got ${save.schemaVersion})`);
  const sprint = cupById('sprint-cup')!;
  const street = cupById('street-cup')!;
  const gauntlet = cupById('gauntlet-cup')!;
  for (const c of [sprint, street, gauntlet]) {
    const u = cupUnlock(c, TRACKS, save, false);
    expect(!u.unlocked && !!u.reason, `fresh profile: ${c.name} locked (${u.reason})`);
  }
  expect(cupUnlock(street, TRACKS, save, true).unlocked, '?alltracks bypass unlocks cups');
  // Medal T1..T7 → sprint (T1,T2,T5,T8) enterable, street/gauntlet still locked
  for (let i = 0; i < 7; i++) save.submitTime(TRACKS[i].id, TRACKS[i].medals.bronze - 1000, null);
  expect(cupUnlock(sprint, TRACKS, save, false).unlocked, 'sprint cup unlocked after medals on T1-T7');
  expect(!cupUnlock(gauntlet, TRACKS, save, false).unlocked, 'gauntlet cup still locked');
  expect(!cupUnlock(street, TRACKS, save, false).unlocked, 'street cup still locked');
  for (let i = 7; i < 10; i++) save.submitTime(TRACKS[i].id, TRACKS[i].medals.bronze - 1000, null);
  expect(cupUnlock(gauntlet, TRACKS, save, false).unlocked, 'gauntlet cup unlocked after medals on T1-T10');
  expect(!cupUnlock(street, TRACKS, save, false).unlocked, `street cup locked until T11 medaled (${cupUnlock(street, TRACKS, save, false).reason})`);
  save.submitTime(TRACKS[10].id, TRACKS[10].medals.bronze - 1000, null);
  expect(cupUnlock(street, TRACKS, save, false).unlocked, 'street cup unlocked after medals on all prior tracks');
}

// ---------- 5. Mid-cup quit + resume (persisted through simulated reload) ----------
{
  store.clear();
  let save = new SaveManager();
  const run = startCupRun('sprint-cup');
  applyRaceResult(run, [mkStanding('SABLE', false, 0x7dff6e), mkStanding('YOU', true, PLAYER_PAINT), mkStanding('MIRAGE', false, 0xc8ff2e), mkStanding('ROOKIE', false, 0xff4d6d)], PLAYER_PAINT);
  applyRaceResult(run, [mkStanding('YOU', true, PLAYER_PAINT), mkStanding('SABLE', false, 0x7dff6e), mkStanding('MIRAGE', false, 0xc8ff2e), mkStanding('ROOKIE', false, 0xff4d6d)], PLAYER_PAINT);
  save.setCupRun(run);
  // simulated quit: fresh SaveManager over the same storage
  const save2 = new SaveManager();
  const resumed = save2.getCupRun();
  expect(!!resumed && resumed.cupId === 'sprint-cup' && resumed.nextRace === 2 && resumed.positions.length === 2, 'mid-cup run survives simulated reload');
  expect(resumed!.entries.length === 4, 'standings entries preserved across reload');
  applyRaceResult(resumed!, [mkStanding('HALCYON', false, 0xe8f2ff), mkStanding('YOU', true, PLAYER_PAINT), mkStanding('SABLE', false, 0x7dff6e), mkStanding('JUNO', false, 0xffb52e)], PLAYER_PAINT);
  applyRaceResult(resumed!, [mkStanding('YOU', true, PLAYER_PAINT), mkStanding('HALCYON', false, 0xe8f2ff), mkStanding('JUNO', false, 0xffb52e), mkStanding('SABLE', false, 0x7dff6e)], PLAYER_PAINT);
  save2.setCupRun(resumed!);
  expect(cupComplete(resumed!), 'resumed cup completes (4 races recorded)');
  const trophy = cupTrophy(resumed!);
  const rank = cupStandings(resumed!).findIndex((e) => e.isPlayer) + 1;
  const expected = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
  expect(trophy === expected, `trophy matches final standings rank (P${rank} → ${trophy})`);
  save2.recordCupFinish('sprint-cup', { positions: [...resumed!.positions], points: resumed!.entries.find((e) => e.isPlayer)!.points, trophy, dateMs: 42 });
  save2.setCupRun(null);
  const cs = save2.cupSave('sprint-cup');
  expect(cs.finishes.length === 1 && cs.bestPoints === resumed!.entries.find((e) => e.isPlayer)!.points, 'cup finish recorded with best points');
  const save3 = new SaveManager();
  expect(save3.cupSave('sprint-cup').finishes.length === 1 && save3.getCupRun() === null, 'finish persists + run cleared after reload');
}

// ---------- 6. recordCupFinish keeps last 10 ----------
{
  store.clear();
  const save = new SaveManager();
  for (let i = 0; i < 12; i++) {
    save.recordCupFinish('sprint-cup', { positions: [1, 1, 1, 1], points: 40 + i, trophy: 'gold', dateMs: i });
  }
  const cs = save.cupSave('sprint-cup');
  expect(cs.finishes.length === 10, `finish history capped at 10 (got ${cs.finishes.length})`);
  expect(cs.bestPoints === 51, `bestPoints keeps max (got ${cs.bestPoints})`);
  expect(cs.finishes[0].dateMs === 2 && cs.finishes[9].dateMs === 11, 'oldest finishes dropped, newest kept');
}

// ---------- 7. Full STREET CUP sim — 4 real rival races, autopilot player ----------
interface RaceOutcome {
  finished: boolean;
  allFinished: boolean;
  playerPos: number;
  pbWritten: boolean;
}

function runCupRace(raceIndex: number, cupId: string, save: SaveManager): { standings: Standing[]; outcome: RaceOutcome } {
  const cup = cupById(cupId)!;
  const def = cupRaceTrack(cup, raceIndex);
  const lineup = cupLineup(cup, raceIndex);
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 2, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
  const playerSlot = rivals.gridSlot(3);
  car.placeAt(playerSlot.dist, playerSlot.lateral);
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
  let speedNow = 0;
  let latNow = 0;
  let wall = 0;
  let finishWallMs = -1;
  let finishOrder: Standing[] | null = null;
  const maxSteps = 160000;

  while (wall < maxSteps) {
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
        if (speedNow < 2.5 && Math.abs(latNow) > 3) stuck++;
        else stuck = 0;
        if (stuck > 40) {
          stuck = 0;
          recover = 55;
          recoverDir = -(Math.sign(latNow) || 1);
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
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;
    if (race.phase === 'finished') {
      if (finishWallMs < 0) {
        finishWallMs = wall;
        finishOrder = rivals.freeze(race.totalProgress);
      }
      if (rivals.allFinished() || wall - finishWallMs > 30000) {
        if (!rivals.allFinished()) {
          console.log(`  [debug] R${raceIndex + 1} ${def.id}: unfinished at break: ` + rivals.telemetry().filter((t) => !t.finished).map((t) => `${t.name} prog=${t.totalProgress}/${2 * Math.round(curve.length)} laps=${t.lapsDone} spd=${t.speedMs} dist=${t.trackDist}`).join(', '));
        }
        break;
      }
    }
  }

  const standings = finishOrder ?? rivals.freeze(race.totalProgress);
  const playerPos = standings.findIndex((s) => s.isPlayer) + 1;
  const ts = save.trackSave(def.id);
  return {
    standings,
    outcome: {
      finished: race.phase === 'finished',
      allFinished: rivals.allFinished(),
      playerPos,
      pbWritten: ts.bestTimeMs !== null || ts.ghost !== null,
    },
  };
}

{
  store.clear();
  const cup = cupById('street-cup')!;
  let save = new SaveManager();
  save.setCupRun(startCupRun(cup.id));
  let run = save.getCupRun()!;
  const raceStartPts = () => run.entries.reduce((a, e) => a + e.points, 0);
  const positions: number[] = [];
  const totalPerRace = CUP_POINTS.reduce((a, b) => a + b, 0);

  for (let raceIndex = 0; raceIndex < 4; raceIndex++) {
    const def = cupRaceTrack(cup, raceIndex);
    const before = raceStartPts();
    const { standings, outcome } = runCupRace(raceIndex, cup.id, save);
    const label = `${cup.name} R${raceIndex + 1}/4 @ ${def.id}`;
    expect(outcome.finished, `${label}: player finished (2 laps)`);
    expect(outcome.allFinished, `${label}: all 4 cars finished`);
    expect(standings.length === 4 && standings.some((s) => s.isPlayer), `${label}: classification has 4 entries incl. player`);
    expect(!outcome.pbWritten, `${label}: rival race wrote no PB/ghost`);
    // resume from the persisted run (what the game does after a reload mid-cup)
    save = new SaveManager();
    run = save.getCupRun()!;
    expect(run.cupId === cup.id && run.nextRace === raceIndex, `${label}: run state at race ${raceIndex + 1} before applying`);
    const res = applyRaceResult(run, standings, PLAYER_PAINT);
    save.setCupRun(run);
    const gained = raceStartPts() - before;
    expect(gained === totalPerRace, `${label}: race distributed exactly ${totalPerRace} pts (got ${gained})`);
    expect(res.playerPos === outcome.playerPos && CUP_POINTS[res.playerPos - 1] === res.playerPoints, `${label}: player P${res.playerPos} → ${res.playerPoints} pts`);
    expect(run.positions[raceIndex] === res.playerPos, `${label}: position recorded in run`);
    expect(run.nextRace === raceIndex + 1, `${label}: nextRace advanced to ${raceIndex + 1}`);
    positions.push(res.playerPos);
    console.log(`  ${label}: P${res.playerPos} (+${res.playerPoints} pts) | order: ${standings.map((s, i) => `P${i + 1} ${s.name}`).join(' ')}`);
  }

  expect(cupComplete(run), 'cup run complete after 4 races');
  const trophy = cupTrophy(run);
  const playerRank = cupStandings(run).findIndex((e) => e.isPlayer) + 1;
  const expectedTrophy = playerRank === 1 ? 'gold' : playerRank === 2 ? 'silver' : playerRank === 3 ? 'bronze' : null;
  expect(trophy === expectedTrophy, `trophy consistent with final rank (P${playerRank} → ${trophy})`);
  const playerEntry = run.entries.find((e) => e.isPlayer)!;
  save.recordCupFinish(cup.id, { positions: [...run.positions], points: playerEntry.points, trophy, dateMs: Date.now() });
  save.setCupRun(null);
  const cs = save.cupSave(cup.id);
  expect(cs.bestPoints === playerEntry.points && cs.finishes.length === 1, `cup save: bestPoints=${cs.bestPoints}, finishes=1`);
  // Simulated reload: cup results persist, active run cleared
  const reloaded = new SaveManager();
  const cs2 = reloaded.cupSave(cup.id);
  expect(JSON.stringify(cs2) === JSON.stringify(cs), 'cup save round-trips through simulated reload');
  expect(reloaded.getCupRun() === null, 'active run cleared after cup completion (persisted)');
  console.log(`  cup result: player P${playerRank} → ${trophy ?? 'no trophy'} with ${playerEntry.points} pts (races: ${positions.map((p, i) => `R${i + 1}=P${p}`).join(' ')})`);
}

// ---------- 8. Isolation: time-trial writes never touch cup state ----------
{
  store.clear();
  const save = new SaveManager();
  save.submitTime('sunrise-sprint', 17500, null);
  const s = save.allSaves;
  expect(Object.keys(s.cups).length === 0, 'time-trial writes create no cup state');
  expect(s.careerRun === null, 'time-trial writes create no career run');
  expect(s.tracks['sunrise-sprint'].bestTimeMs === 17500, 'time-trial PB still written');
  expect(CUPS.length === 3 && CUPS.every((c) => c.trackIds.length === 4), '3 cups × 4 races defined');
  expect(CUPS.every((c) => c.trackIds.every((id) => TRACKS.some((t) => t.id === id))), 'all cup track ids exist in TRACKS');
}

console.log(`\ncareer test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
