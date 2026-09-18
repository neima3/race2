// v10 Phase 5 balance tables (headless, evidence):
//  A. GLIDE drift identity on the NEW tracks: drift-mode laps x4 bodies on
//     summit-run (twisty — GLIDE should outscore standard) + halo-flats (speed —
//     GLIDE must NOT trivially dominate) + regression anchors serpents-tail/salt-flats.
//  B. Daily rotation walk: first upcoming days hitting summit-run / halo-flats,
//     each raced headless (2 laps, real finish path, dry ledger).
//  C. Weekly rotation walk: next weeks containing the new tracks, one race each.
//  D. APEX LEAGUE full 4-race autopilot run through the real cup path:
//     placements, points, champion-defense outcome, trophy.
import * as THREE from 'three';
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics, BODY_TUNING, type CarBodyId } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { RivalManager, pickLineup, PLAYER_NAME, type Standing } from '../../src/game/rivals';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';
import { dailyFor, todayKey } from '../../src/game/daily';

function nextDateKey(key: string): string {
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)) + 86400000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
import { weeklyFor, isValidWeekKey } from '../../src/game/weekly';

function mondayOf(key: string): Date | null {
  const m = /^(\d{4})W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = +m[1];
  const week = +m[2];
  if (year < 1970 || year > 9999 || week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Thu = new Date(Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  const monday = new Date(week1Thu.getTime() - 3 * 86400000 + (week - 1) * 7 * 86400000);
  return weekKeyFor(monday) === key ? monday : null;
}

function weekKeyFor(date: Date): string {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const isoYear = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  const week = 1 + Math.round((t.getTime() - week1Thu.getTime()) / (7 * 86400000));
  return `${isoYear}W${String(week).padStart(2, '0')}`;
}

function nextWeekKey(key: string): string | null {
  const monday = mondayOf(key);
  if (!monday) return null;
  const next = weekKeyFor(new Date(monday.getTime() + 7 * 86400000));
  return isValidWeekKey(next) ? next : null;
}
import {
  CUPS, cupById, cupRaceTrack, cupLineup, applyRaceResult, cupComplete, cupTrophy, cupStandings, CUP_POINTS, startCupRun,
} from '../../src/game/career';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

// ---------- A. drift-mode laps (copied verbatim from drift-balance.ts) ----------
function scoreStep(car: CarPhysics, dt: number): number {
  const s = car.state;
  if (s.driftAmount > 0.3 && s.grounded && s.speed > 14) return s.driftAmount * s.speed * dt * 12;
  return 0;
}

interface LapResult {
  finished: boolean;
  score: number;
  timeMs: number;
  wallHits: number;
  driftSeconds: number;
  maxDrift: number;
}

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

console.log('===== A. GLIDE drift identity on new tracks =====');
for (const trackId of ['summit-run', 'halo-flats', 'serpents-tail', 'salt-flats']) {
  console.log(`--- drift-mode laps: ${trackId} ---`);
  console.log('body       fin    score     lap      walls driftT maxD');
  for (const body of BODIES) {
    const r = driftLap(trackId, body);
    console.log(
      `${body.padEnd(9)}  ${String(r.finished).padEnd(5)}  ${String(r.score).padEnd(8)}  ${(r.timeMs / 1000).toFixed(2).padEnd(7)}  ${String(r.wallHits).padEnd(5)} ${r.driftSeconds.toFixed(1).padEnd(5)} ${r.maxDrift.toFixed(2)}`,
    );
  }
}

// ---------- shared headless rival-race runner (career.ts runCupRace pattern) ----------
interface RaceOutcome {
  finished: boolean;
  allFinished: boolean;
  playerPos: number;
  playerTimeMs: number | null;
  order: string[];
  gaps: number[];
}

function runRivalRace(
  def: ReturnType<typeof cupRaceTrack>,
  lineup: ReturnType<typeof pickLineup>,
  save: SaveManager,
  laps = 2,
  variantNote = '',
): { standings: Standing[]; outcome: RaceOutcome } {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const race = new RaceController(car, curve, def, save, () => {}, { laps, writesRecords: false });
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
  let playerTimeMs: number | null = null;
  const maxSteps = 200000;

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
      if (playerTimeMs === null && finishWallMs < 0) playerTimeMs = race.elapsedMs;
      if (finishWallMs < 0) {
        finishWallMs = wall;
        finishOrder = rivals.freeze(race.totalProgress);
      }
      if (rivals.allFinished() || wall - finishWallMs > 30000) break;
    }
  }

  const standings = finishOrder ?? rivals.freeze(race.totalProgress);
  const playerPos = standings.findIndex((s) => s.isPlayer) + 1;
  return {
    standings,
    outcome: {
      finished: race.phase === 'finished',
      allFinished: rivals.allFinished(),
      playerPos,
      playerTimeMs,
      order: standings.map((s, i) => `P${i + 1} ${s.name}${s.isPlayer ? '*' : ''}`),
      gaps: standings.map((s) => s.gapMeters),
    },
  };
}

// ---------- B. daily rotation hits ----------
console.log('\n===== B. daily rotation: next 10 days, new-track hits raced headless =====');
{
  let d = todayKey();
  let hits = 0;
  for (let i = 0; i < 30 && hits < 2; i++) {
    const dd = dailyFor(d);
    if (dd.track.id === 'summit-run' || dd.track.id === 'halo-flats') {
      hits++;
      console.log(`--- daily ${d}: ${dd.track.id} (${dd.lineup.map((r) => `${r.name}:${r.tier}`).join(', ')}) laps=${dd.laps} variant=${dd.variant} ---`);
      const save = new SaveManager();
      const { standings, outcome } = runRivalRace(dd.track, dd.lineup, save, dd.laps);
      console.log(`  ${outcome.finished ? 'FINISHED' : 'DID NOT FINISH'} all4=${outcome.allFinished} | ${outcome.order.join(' ')}`);
      console.log(`  playerTime=${outcome.playerTimeMs ? (outcome.playerTimeMs / 1000).toFixed(2) + 's' : 'n/a'} author=${(dd.track.medals.author / 1000).toFixed(1)}s bronze=${(dd.track.medals.bronze / 1000).toFixed(1)}s`);
      const pb = save.trackSave(dd.track.id).bestTimeMs;
      console.log(`  dry-ledger check: bestTimeMs=${pb} (expect null)`);
    }
    d = nextDateKey(d);
  }
  if (hits === 0) console.log('  (no new-track daily hits in the next 30 days)');
}

// ---------- C. weekly rotation hits ----------
console.log('\n===== C. weekly rotation: next 8 weeks, new-track races headless =====');
{
  let wk = nextWeekKey(todayWeekKey());
  let found = 0;
  for (let i = 0; i < 8 && wk; i++) {
    const ww = weeklyFor(wk);
    for (let ri = 0; ri < ww.tracks.length; ri++) {
      const t = ww.tracks[ri];
      if (t.id === 'summit-run' || t.id === 'halo-flats') {
        found++;
        console.log(`--- weekly ${wk} R${ri + 1}/3: ${t.id} (modifier ${ww.modifier.id}) ---`);
        const save = new SaveManager();
        const { outcome } = runRivalRace(t, ww.lineups[ri], save, ww.laps);
        console.log(`  ${outcome.finished ? 'FINISHED' : 'DID NOT FINISH'} all4=${outcome.allFinished} | ${outcome.order.join(' ')}`);
        console.log(`  playerTime=${outcome.playerTimeMs ? (outcome.playerTimeMs / 1000).toFixed(2) + 's' : 'n/a'} author=${(t.medals.author / 1000).toFixed(1)}s`);
      }
    }
    wk = nextWeekKey(wk) ?? "";
  }
  if (found === 0) console.log('  (no new-track weekly hits in the next 8 weeks)');
}

function todayWeekKey(): string {
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const isoYear = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  const week = 1 + Math.round((t.getTime() - week1Thu.getTime()) / (7 * 86400000));
  return `${isoYear}W${String(week).padStart(2, '0')}`;
}

// ---------- D. APEX LEAGUE full cup run ----------
console.log('\n===== D. APEX LEAGUE full 4-race autopilot cup run =====');
{
  const cup = cupById('apex-league')!;
  const save = new SaveManager();
  save.setCupRun(startCupRun(cup.id));
  let run = save.getCupRun()!;
  const positions: number[] = [];
  for (let raceIndex = 0; raceIndex < 4; raceIndex++) {
    const def = cupRaceTrack(cup, raceIndex);
    const lineup = cupLineup(cup, raceIndex);
    console.log(`--- R${raceIndex + 1}/4 @ ${def.id} (variant ${cup.variants?.[raceIndex] ?? 'day'}) lineup ${lineup.map((r) => `${r.name}:${r.tier === 'champion' ? 'CHAMPION' : r.tier}`).join(', ')} ---`);
    const { standings, outcome } = runRivalRace(def, lineup, save, 2);
    console.log(`  ${outcome.finished ? 'FINISHED' : 'DID NOT FINISH'} all4=${outcome.allFinished} | ${outcome.order.join(' ')}`);
    const fin = standings.map((s, i) => `P${i + 1} ${s.name}${s.isPlayer ? '*' : ''} ${s.finishTimeMs ? (s.finishTimeMs / 1000).toFixed(2) + 's' : 'n/a'} gap=${s.gapMeters.toFixed(0)}m`).join(' | ');
    console.log(`  finish times: ${fin}`);
    const res = applyRaceResult(run, standings, 0);
    save.setCupRun(run);
    positions.push(res.playerPos);
    console.log(`  player P${res.playerPos} (+${res.playerPoints} pts, total ${run.entries.find((e) => e.isPlayer)!.points})`);
    const sov = standings.find((s) => s.name === 'SOVEREIGN');
    if (sov) console.log(`  champion defense: SOVEREIGN P${standings.indexOf(sov) + 1} on track`);
  }
  const complete = cupComplete(run);
  const trophy = cupTrophy(run);
  const rank = cupStandings(run).findIndex((e) => e.isPlayer) + 1;
  const playerPts = run.entries.find((e) => e.isPlayer)!.points;
  console.log(`  cup complete=${complete} player rank P${rank} pts=${playerPts} positions=${positions.join(',')} trophy=${trophy}`);
  const wins = positions.filter((p) => p === 1).length;
  console.log(`  wins=${wins} P2s=${positions.filter((p) => p === 2).length} P3s=${positions.filter((p) => p === 3).length} P4s=${positions.filter((p) => p === 4).length}`);
  const apexGoldAchievement = trophy === 'gold';
  console.log(`  APEX CHAMPION (gold) achieved: ${apexGoldAchievement}`);
}
