import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { RivalManager, pickLineup, RIVAL_ROSTER, tauntFor, type Standing } from '../src/game/rivals';
import { DEFAULT_TUNING } from '../src/physics/car';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { DraftTracker } from '../src/game/draft';

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

interface RaceResult {
  track: string;
  finished: boolean;
  allFinished: boolean;
  playerPos: number;
  beatsEasyMid: boolean;
  maxGap: number;
  cpHits: number;
  cpTotal: number;
  completedLaps: number;
  pbWritten: boolean;
}

const results: RaceResult[] = [];
const RACE_TRACKS = [TRACKS[0], TRACKS[4]];

for (const def of RACE_TRACKS) {
  const lineup = pickLineup(def.id);
  const easyMidNames = lineup.filter((r) => r.tier !== 'pro').map((r) => r.name);
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const events: string[] = [];
  const race = new RaceController(car, curve, def, save, (ev) => events.push(ev), { laps: 2, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
  const playerSlot = rivals.gridSlot(3);
  car.placeAt(playerSlot.dist, playerSlot.lateral);
  rivals.placeOnGrid();
  race.start();
  race.countdownMs = 1;

  const ap = { smooth: 0 };
  const draft = new DraftTracker();
  const playerRef = { dist: 0, lateral: 0 };
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
  let maxGap = 0;
  let playerPos = -1;
  let beatsEasyMid = false;
  let finishOrder: Standing[] | null = null;

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
    rivals.scanPlayerDraft(car.state.trackDist, car.state.lateral);
    draft.update(simDt, rivals.draftScan.gap, rivals.draftScan.lat);
    race.draftFactor = draft.factor();
    playerRef.dist = car.state.trackDist;
    playerRef.lateral = car.state.lateral;
    race.update(simDt * 1000, input);
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress, null, 0, playerRef);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;

    if (race.phase === 'racing') {
      const pp = race.totalProgress;
      for (const rv of rivals.standings(pp)) {
        if (!rv.isPlayer) maxGap = Math.max(maxGap, Math.abs(pp - rv.progress));
      }
    }
    if (race.phase === 'finished') {
      if (finishWallMs < 0) {
        finishWallMs = wall;
        finishOrder = rivals.freeze(race.totalProgress);
        playerPos = (finishOrder.findIndex((s) => s.isPlayer) + 1) || -1;
        const easyMidIdx = finishOrder.filter((s) => easyMidNames.includes(s.name)).map((s) => finishOrder!.indexOf(s));
        beatsEasyMid = easyMidIdx.every((i) => i > (playerPos - 1));
      }
      if (rivals.allFinished() || wall - finishWallMs > 20000) break;
    }
  }

  const allFinished = rivals.allFinished();
  const cpHits = events.filter((e) => e === 'checkpoint').length;
  const ts = save.trackSave(def.id);
  const pbWritten = ts.bestTimeMs !== null || ts.ghost !== null;
  const ok = race.phase === 'finished' && allFinished && finishOrder !== null;
  results.push({ track: def.id, finished: race.phase === 'finished', allFinished, playerPos, beatsEasyMid, maxGap, cpHits, cpTotal: def.checkpoints.length, completedLaps: race.completedLaps, pbWritten });
  const order = finishOrder ? finishOrder.map((s, i) => `P${i + 1} ${s.name}`).join(' ') : 'n/a';
  const lineupStr = lineup.map((r) => `${r.name}(${r.tier[0]})`).join(' ');
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${def.id}: player ${race.phase === 'finished' ? 'finished 2 laps' : 'DID NOT FINISH'} | all4=${allFinished} | lineup: ${lineupStr} | order: ${order} | maxGap=${maxGap.toFixed(1)}m | cpHits=${cpHits}/${def.checkpoints.length * 2} | lapsDone=${race.lapsDone} | pbWritten=${pbWritten}`,
  );
}

// Slow-mo accumulator integrity: a forced 0.35x time-dilation window (same scaling
// point as main.ts — incoming frame dt scaled BEFORE the fixed-step accumulator
// divides it into 120Hz steps) must not drop or double-run any sim step. Trajectory
// is a pure function of the step index, so total steps, final progress and the race
// clock must match the non-slowmo run (only wall-clock duration differs).
{
  const def = TRACKS[0];
  const lineup = pickLineup(def.id);
  const runAccumulated = (slowmo: boolean) => {
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
    const wallDt = 1 / 60;
    let acc = 0;
    let wall = 0;
    let steps = 0;
    const ap = { smooth: 0 };
    let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
    let recover = 0;
    let recoverDir = 1;
    let stuck = 0;
    while (race.phase !== 'finished' && wall < 90000) {
      const timeScale = slowmo && wall >= 5000 && wall < 5250 ? 0.35 : 1;
      acc += wallDt * timeScale;
      let frameSteps = 0;
      while (acc >= simDt && frameSteps < 8) {
        if (race.phase === 'racing') {
          if (recover > 0) {
            recover -= 1;
            input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
            if (recover === 0) ap.smooth = 0;
          } else {
            const r = autopilotDrive(car, curve, simDt, ap);
            if (car.state.speed < 2.5 && Math.abs(car.state.lateral) > 3) stuck++;
            else stuck = 0;
            if (stuck > 40) {
              stuck = 0;
              recover = 55;
              recoverDir = -(Math.sign(car.state.lateral) || 1);
            }
            input = { steer: r.steer, throttle: r.throttle, brake: r.brake, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
          }
        }
        race.update(simDt * 1000, input);
        rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress);
        acc -= simDt;
        frameSteps++;
        steps++;
      }
      if (frameSteps === 8) acc = 0;
      wall += wallDt;
    }
    return { finished: race.phase === 'finished', steps, progress: race.totalProgress, timeMs: race.elapsedMs };
  };
  const normal = runAccumulated(false);
  const dilated = runAccumulated(true);
  console.log(
    `slow-mo integrity: normal {steps=${normal.steps}, progress=${normal.progress.toFixed(2)}m, clock=${normal.timeMs.toFixed(0)}ms} | ` +
    `dilated {steps=${dilated.steps}, progress=${dilated.progress.toFixed(2)}m, clock=${dilated.timeMs.toFixed(0)}ms}`,
  );
  if (normal.finished && dilated.finished) pass(`slow-mo: both accumulator runs finished (${normal.steps} vs ${dilated.steps} steps)`);
  else fail(`slow-mo: run did not finish (normal=${normal.finished}, dilated=${dilated.finished})`);
  if (Math.abs(normal.steps - dilated.steps) <= 2) pass(`slow-mo: sim step count preserved (delta ${Math.abs(normal.steps - dilated.steps)})`);
  else fail(`slow-mo: step count diverged (normal=${normal.steps}, dilated=${dilated.steps})`);
  if (Math.abs(normal.progress - dilated.progress) < 0.5) pass(`slow-mo: final progress matches (delta ${Math.abs(normal.progress - dilated.progress).toFixed(4)}m)`);
  else fail(`slow-mo: final progress diverged (delta ${Math.abs(normal.progress - dilated.progress).toFixed(3)}m)`);
  if (Math.abs(normal.timeMs - dilated.timeMs) < 20) pass(`slow-mo: race clock dilates coherently (delta ${Math.abs(normal.timeMs - dilated.timeMs).toFixed(2)}ms)`);
  else fail(`slow-mo: race clock diverged (delta ${Math.abs(normal.timeMs - dilated.timeMs).toFixed(2)}ms)`);
}

// v9 P4: champion tier tuning + banter table
{
  const def = TRACKS[0];
  const curve = new TrackCurve(def.points, true);
  const sov = RIVAL_ROSTER.find((r) => r.name === 'SOVEREIGN')!;
  const apex = RIVAL_ROSTER.find((r) => r.name === 'APEX')!;
  const rm = new RivalManager(curve, def, new THREE.Group(), false, [sov, apex]);
  const champ = rm.rivals[0];
  const pro = rm.rivals[1];
  if (
    Math.abs(champ.car.tuning.accel - DEFAULT_TUNING.accel * 1.07) < 1e-9 &&
    Math.abs(champ.car.tuning.maxSpeed - DEFAULT_TUNING.maxSpeed * 1.04) < 1e-9
  ) {
    pass(`champion tuning: accel ${champ.car.tuning.accel.toFixed(2)} (= default x1.07), maxSpeed ${champ.car.tuning.maxSpeed.toFixed(2)} (= default x1.04)`);
  } else {
    fail(`champion tuning wrong: accel=${champ.car.tuning.accel} maxSpeed=${champ.car.tuning.maxSpeed}`);
  }
  if (
    Math.abs(pro.car.tuning.accel - DEFAULT_TUNING.accel * 1.05) < 1e-9 &&
    Math.abs(pro.car.tuning.maxSpeed - DEFAULT_TUNING.maxSpeed * 1.025) < 1e-9 &&
    champ.car.tuning.maxSpeed > pro.car.tuning.maxSpeed &&
    champ.car.tuning.accel > pro.car.tuning.accel
  ) {
    pass(`champion strictly above pro tier: top ${champ.car.tuning.maxSpeed.toFixed(2)} vs ${pro.car.tuning.maxSpeed.toFixed(2)}, accel ${champ.car.tuning.accel.toFixed(2)} vs ${pro.car.tuning.accel.toFixed(2)}`);
  } else {
    fail(`pro tier deltas drifted or champion not above pro: pro accel=${pro.car.tuning.accel} max=${pro.car.tuning.maxSpeed}`);
  }
  if (champ.skill.pace === 1.0 && champ.skill.lookaheadScale === 1.15 && champ.skill.steerNoise === 0 && champ.skill.lookaheadJitter === 0) {
    pass('champion autopilot skill = pro params with pace 1.0');
  } else {
    fail(`champion skill wrong: pace=${champ.skill.pace} ls=${champ.skill.lookaheadScale}`);
  }
  if (rm.hasChampion() && !new RivalManager(curve, def, new THREE.Group(), false, pickLineup(def.id)).hasChampion() && rm.presets[0].name === 'SOVEREIGN') {
    pass('hasChampion() detects champion grids only; presets expose the lineup');
  } else {
    fail('hasChampion()/presets plumbing broken');
  }
  if (RIVAL_ROSTER.length === 12 && RIVAL_ROSTER.every((r) => (r.tauntStart ?? '').length > 0 && (r.tauntStart ?? '').length <= 48 && (r.tauntFinish ?? '').length > 0 && (r.tauntFinish ?? '').length <= 48)) {
    pass(`banter table complete: 12/12 rivals carry start+finish one-liners (all <=48 chars)`);
  } else {
    fail('banter table incomplete or lines too long: ' + RIVAL_ROSTER.map((r) => `${r.name}:${(r.tauntStart ?? '').length}/${(r.tauntFinish ?? '').length}`).join(' '));
  }
  if (tauntFor('VESPER', 'start') === 'VESPER: TRY TO KEEP UP.' && tauntFor('VESPER', 'finish') === 'VESPER: REMATCH. NOW.' && tauntFor('NOBODY', 'start') === null) {
    pass('tauntFor composes NAME: LINE and returns null for unknown rivals');
  } else {
    fail(`tauntFor broken: '${tauntFor('VESPER', 'start')}' / '${tauntFor('VESPER', 'finish')}'`);
  }
  const starts = new Set(RIVAL_ROSTER.map((r) => r.tauntStart));
  const finishes = new Set(RIVAL_ROSTER.map((r) => r.tauntFinish));
  if (starts.size === 12 && finishes.size === 12) {
    pass('all 12 start + 12 finish lines are distinct');
  } else {
    fail(`banter lines repeat: ${starts.size} starts / ${finishes.size} finishes`);
  }
  if (RIVAL_ROSTER.slice(0, 8).every((r) => r.tier === (['easy', 'easy', 'easy', 'mid', 'mid', 'mid', 'pro', 'pro'] as const)[RIVAL_ROSTER.indexOf(r)])) {
    pass('legacy 8 presets keep their tiers (frozen roster order)');
  } else {
    fail('legacy preset tiers/order changed');
  }
  const newcomerTiers = RIVAL_ROSTER.slice(8).map((r) => `${r.name}:${r.tier}`).join(',');
  if (newcomerTiers === 'NOVA:mid,KESTREL:pro,VESUVIUS:pro,SOVEREIGN:champion') {
    pass(`newcomers appended in order: ${newcomerTiers}`);
  } else {
    fail(`newcomer roster wrong: ${newcomerTiers}`);
  }
}

// Aggregate assertions
for (const r of results) {
  if (!r.finished) fail(`${r.track}: player did not finish`);
  if (!r.allFinished) fail(`${r.track}: not all 4 cars finished`);
  if (!r.beatsEasyMid) fail(`${r.track}: player failed to beat easy+mid rivals`);
  if (r.maxGap >= 120) fail(`${r.track}: rubber-band gap ${r.maxGap.toFixed(1)}m >= 120m`);
  if (r.cpHits !== r.cpTotal * 2) fail(`${r.track}: per-lap checkpoints wrong (cpHits=${r.cpHits}, expected ${r.cpTotal * 2})`);
  if (r.completedLaps !== 2) fail(`${r.track}: player completedLaps=${r.completedLaps} (expected 2)`);
  if (r.pbWritten) fail(`${r.track}: rival race wrote PB/ghost data`);
}
if (results.length >= 2 && results.every((r) => r.playerPos === 1)) fail('player is always P1 — tiers need tuning');
if (results.length >= 2 && results.every((r) => r.playerPos === 4)) fail('player is always P4 — tiers need tuning');

const total = 2 + results.length * 6 + 2 + 4 + 9;
console.log(`\nrivals test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
