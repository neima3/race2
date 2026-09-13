import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController, type RaceEvents } from '../src/game/race';
import { RivalManager, pickLineup, KNOCKOUT_LAPS, type KnockoutEvent, type Standing } from '../src/game/rivals';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const simDt = 1 / 120;
let failures = 0;
function fail(msg: string): void {
  failures++;
  console.log(`FAIL ${msg}`);
}
function pass(msg: string): void {
  console.log(`PASS ${msg}`);
}

// Steering direction: steer left input (-1) must yaw the car left (car local +x is LEFT).
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  car.placeAt(30, 0);
  for (let i = 0; i < 90; i++) car.step(simDt, -1, 1, 0, false, true);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.state.quat);
  const f = curve.frames[car.state.trackIndex];
  const headingRight = fwd.dot(f.binormal);
  if (headingRight < -0.02 && car.state.lateral < -0.1) {
    pass('steering-direction: steer left -> yaws/moves left (heading·right = ' + headingRight.toFixed(3) + ', lateral ' + car.state.lateral.toFixed(2) + ')');
  } else {
    fail(`steering-direction: heading·right=${headingRight.toFixed(3)} lateral=${car.state.lateral.toFixed(2)} (expected leftward yaw)`);
  }
}

// Lateral sign: lateral +2.5 must sit on the road's RIGHT edge relative to travel direction.
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  car.placeAt(30, 2.5);
  const frame = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
    halfWidth: 0,
    dist: 0,
  };
  curve.frameAtDist(30, frame);
  const rel = car.state.pos.clone().sub(frame.pos);
  const dotRight = rel.dot(frame.binormal);
  const q = {
    index: 0,
    frame: {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      binormal: new THREE.Vector3(),
      halfWidth: 0,
      dist: 0,
    },
    lateral: 0,
    vertical: 0,
    longitudinal: 0,
    dist: 0,
  };
  curve.surfaceQuery(car.state.pos, 0, q);
  if (Math.abs(dotRight - 2.5) < 0.35 && q.lateral > 1.5) {
    pass(`lateral-sign: placeAt(+2.5) sits right (rel·right=${dotRight.toFixed(2)}, surfaceQuery lateral=${q.lateral.toFixed(2)})`);
  } else {
    fail(`lateral-sign: rel·right=${dotRight.toFixed(2)} surface lateral=${q.lateral.toFixed(2)} (expected ≈ +2.5 / positive)`);
  }
}

interface KoRaceResult {
  track: string;
  finished: boolean;
  completedLaps: number;
  events: KnockoutEvent[];
  playerKo: boolean;
  finishPayload: RaceEvents['finish'] | null;
  finishOrder: Standing[] | null;
  playerPos: number;
  pbWritten: boolean;
  frozenProgressViolations: number;
}

// Full 3-lap knockout race with an autopilot player. Mirrors the main.ts sim loop:
// prevLaps captured before race.update, playerLapEff forwarded to rivals.update after it.
function runKnockoutRace(
  def: (typeof TRACKS)[number],
  playerDrive: 'auto' | 'slow',
  tiers: ('easy' | 'mid' | 'pro')[] = ['easy', 'mid', 'pro'],
): KoRaceResult {
  const lineup = pickLineup(def.id, 0, tiers);
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  let finishPayload: RaceEvents['finish'] | null = null;
  const race = new RaceController(car, curve, def, save, (ev, payload) => {
    if (ev === 'finish') finishPayload = payload as RaceEvents['finish'];
  }, { laps: KNOCKOUT_LAPS, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
  rivals.totalLaps = KNOCKOUT_LAPS;
  rivals.knockout = true;

  const koEvents: KnockoutEvent[] = [];
  const frozen = new Map<string, { progress: number; speedMs: number }>();
  let frozenViolations = 0;
  rivals.onKnockout = (ev) => {
    koEvents.push({ ...ev, lap: rivals['koLapsFired'] } as KnockoutEvent & { lap: number });
    if (ev.isPlayer) {
      race.finishKnockedOut(ev.position);
      if (race.phase !== 'finished') fail('player KO: race did not end synchronously');
    } else {
      frozen.set(ev.name, { progress: rivals.telemetry().find((t) => t.name === ev.name)!.totalProgress, speedMs: rivals.telemetry().find((t) => t.name === ev.name)!.speedMs });
    }
  };

  const playerSlot = rivals.gridSlot(3);
  car.placeAt(playerSlot.dist, playerSlot.lateral);
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
  const maxSteps = 90000;
  let finishWallMs = -1;
  let finishOrder: Standing[] | null = null;

  while (wall < maxSteps) {
    const playerFinished = race.phase === 'finished';
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    if (!playerFinished) {
      if (playerDrive === 'slow') {
        input = { steer: 0, throttle: 0.3, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      } else if (recover > 0) {
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
    const prevLaps = race.completedLaps;
    race.update(simDt * 1000, input);
    const playerLapEff = race.phase === 'racing' && race.completedLaps > prevLaps ? race.completedLaps : 0;
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress, null, playerLapEff);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;

    if (frozen.size > 0) {
      for (const t of rivals.telemetry()) {
        const snap = frozen.get(t.name);
        if (snap && (t.totalProgress !== snap.progress || t.speedMs !== snap.speedMs)) {
          frozenViolations++;
          frozen.set(t.name, { progress: t.totalProgress, speedMs: t.speedMs });
        }
      }
    }

    if (race.phase === 'finished') {
      if (finishWallMs < 0) {
        finishWallMs = wall;
        finishOrder = rivals.freeze(race.totalProgress);
      }
      if (playerDrive === 'slow' || rivals.allFinished() || wall - finishWallMs > 20000) break;
    }
  }

  const ts = save.trackSave(def.id);
  const finishPayloadKo = finishPayload as RaceEvents['finish'] | null;
  return {
    track: def.id,
    finished: race.phase === 'finished',
    completedLaps: race.completedLaps,
    events: koEvents,
    playerKo: rivals['playerOut'],
    finishPayload: finishPayloadKo,
    finishOrder,
    playerPos: finishOrder ? finishOrder.findIndex((s) => s.isPlayer) + 1 : -1,
    pbWritten: ts.bestTimeMs !== null || ts.ghost !== null,
    frozenProgressViolations: frozenViolations,
  };
}

// ---------- Win/survive path: 3 laps, 2 rival eliminations at lap boundaries ----------
const results: KoRaceResult[] = [];
const RACE_TRACKS = [TRACKS[0], TRACKS[4]];

for (const def of RACE_TRACKS) {
  const r = runKnockoutRace(def, 'auto');
  results.push(r);
  const lineupStr = pickLineup(def.id).map((x) => x.name).join(' ');
  const order = r.finishOrder ? r.finishOrder.map((s, i) => `P${i + 1} ${s.name}${s.eliminated ? '(OUT)' : ''}`).join(' ') : 'n/a';
  console.log(
    `${r.finished ? 'PASS' : 'FAIL'} ${def.id}: finished=${r.finished} laps=${r.completedLaps}/${KNOCKOUT_LAPS} | lineup: ${lineupStr} | order: ${order} | koEvents=${r.events.map((e) => `${e.name}@L${(e as KnockoutEvent & { lap: number }).lap}P${e.position}`).join(',')} | playerPos=${r.playerPos} | pbWritten=${r.pbWritten}`,
  );
}

// P1-win path on an easy+easy+mid grid (the SPRINT-cup mix the autopilot wins comfortably)
const winRun = runKnockoutRace(TRACKS[0], 'auto', ['easy', 'easy', 'mid']);
results.push(winRun);
{
  const lineupStr = pickLineup(TRACKS[0].id, 0, ['easy', 'easy', 'mid']).map((x) => x.name).join(' ');
  const order = winRun.finishOrder ? winRun.finishOrder.map((s, i) => `P${i + 1} ${s.name}${s.eliminated ? '(OUT)' : ''}`).join(' ') : 'n/a';
  console.log(
    `${winRun.finished && winRun.playerPos === 1 ? 'PASS' : 'FAIL'} sunrise-sprint(win-grid): finished=${winRun.finished} laps=${winRun.completedLaps}/${KNOCKOUT_LAPS} | lineup: ${lineupStr} | order: ${order} | koEvents=${winRun.events.map((e) => `${e.name}@L${(e as KnockoutEvent & { lap: number }).lap}P${e.position}`).join(',')} | playerPos=${winRun.playerPos}`,
  );
}

for (const r of results) {
  if (!r.finished) fail(`${r.track}: race did not finish`);
  if (r.completedLaps !== KNOCKOUT_LAPS) fail(`${r.track}: completedLaps=${r.completedLaps} (expected ${KNOCKOUT_LAPS})`);
  if (r.events.length !== 2) fail(`${r.track}: expected exactly 2 rival eliminations at lap boundaries, got ${r.events.length}`);
  if (r.events.some((e) => e.isPlayer)) fail(`${r.track}: player was eliminated on the survive path`);
  if (r.frozenProgressViolations > 0) fail(`${r.track}: eliminated rival kept simming (${r.frozenProgressViolations} progress/speed changes after elimination)`);
  if (!(r.finishPayload && r.finishPayload.knockout === undefined)) fail(`${r.track}: win-path finish must not carry a knockout payload`);
  if (r.pbWritten) fail(`${r.track}: knockout race wrote PB/ghost data`);
  const laps = r.events.map((e) => (e as KnockoutEvent & { lap: number }).lap);
  const positions = r.events.map((e) => e.position);
  if (!(positions.length === 2 && positions[0] === 4 && positions[1] === 3)) fail(`${r.track}: elimination positions wrong (${positions.join(',')} — expected 4 then 3)`);
  if (!(laps.length === 2 && laps[0] === 1 && laps[1] === 2)) fail(`${r.track}: eliminations not at lap boundaries (laps: ${laps.join(',')} — expected 1 then 2)`);
  if (r.finishOrder) {
    const out = r.finishOrder.filter((s) => s.eliminated);
    if (out.length !== 2) fail(`${r.track}: standings should flag 2 eliminated rows, got ${out.length}`);
    const bottomTwo = r.finishOrder.slice(-2);
    if (!(bottomTwo.every((s) => s.eliminated === true))) fail(`${r.track}: eliminated cars not pinned to the bottom of the standings`);
    const alive = r.finishOrder.slice(0, 2);
    if (!(alive.every((s) => !s.eliminated))) fail(`${r.track}: alive duelists not ranked above eliminated cars`);
  } else {
    fail(`${r.track}: no frozen standings at race end`);
  }
}

const [sunrise, dune] = results;
if (sunrise && sunrise.finished && !(sunrise.playerPos >= 1 && sunrise.playerPos <= 2)) fail(`sunrise-sprint: player missed the duel (${sunrise.playerPos})`);
else if (sunrise) pass(`sunrise-sprint: player reached the duel (P${sunrise.playerPos})`);
if (dune && dune.finished && !(dune.playerPos >= 1 && dune.playerPos <= 2)) fail(`dune-rush: player finished outside the duel (${dune.playerPos})`);
else if (dune) pass(`dune-rush: player reached the duel (P${dune.playerPos})`);
if (winRun && winRun.finished && winRun.playerPos !== 1) fail(`sunrise-sprint(win-grid): P1-win path failed (playerPos=${winRun.playerPos})`);
else if (winRun) pass(`sunrise-sprint(win-grid): duel won by player (P${winRun.playerPos}) — win path works`);

// ---------- Forced player-elimination path: scripted slow player is last at lap 1 ----------
{
  const r = runKnockoutRace(TRACKS[0], 'slow');
  const order = r.finishOrder ? r.finishOrder.map((s, i) => `P${i + 1} ${s.name}${s.eliminated ? '(OUT)' : ''}`).join(' ') : 'n/a';
  console.log(
    `${r.finished && r.playerKo ? 'PASS' : 'FAIL'} sunrise-sprint(slow): finished=${r.finished} playerKo=${r.playerKo} | order: ${order} | koEvents=${r.events.map((e) => `${e.name}P${e.position}${e.isPlayer ? '(YOU)' : ''}`).join(',')} | finishPayload.knockout=${JSON.stringify((r.finishPayload as RaceEvents['finish'] | null)?.knockout ?? null)}`,
  );
  if (!r.finished) fail('slow path: race did not end');
  if (!r.playerKo) fail('slow path: player was not knocked out');
  if (r.events.length !== 1) fail(`slow path: expected exactly 1 elimination (the player), got ${r.events.length}`);
  const ev = r.events[0];
  if (!(ev && ev.isPlayer && ev.position === 4 && ev.survivors === 3)) fail(`slow path: player KO event wrong (position=${ev?.position}, survivors=${ev?.survivors})`);
  if (!(r.finishPayload && r.finishPayload.knockout && r.finishPayload.knockout.position === 4)) fail(`slow path: finish payload missing knockout position (got ${JSON.stringify(r.finishPayload?.knockout)})`);
  if (r.pbWritten) fail('slow path: knocked-out race wrote PB/ghost data');
  const playerRow = r.finishOrder?.find((s) => s.isPlayer);
  if (!playerRow || playerRow.eliminated !== true) fail('slow path: player standings row not flagged eliminated');
  if (!(r.finishOrder && r.finishOrder[r.finishOrder.length - 1].isPlayer)) fail('slow path: knocked-out player not classified last');
  if (r.frozenProgressViolations > 0) fail('slow path: unexpected rival sim after elimination');
}

const total = 2 + results.length * 12 + 3 + 9;
console.log(`\nknockout test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
