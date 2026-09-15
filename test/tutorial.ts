import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import {
  TutorialRun,
  TUTORIAL_TRACK_ID,
  TUTORIAL_RINGS,
  TUTORIAL_PADS,
  DRILL_START_DIST,
  DRILL_ORDER,
  DRILL_BANNERS,
  TUTORIAL_MAX_TRIES,
  STEER_MISS_METERS,
  PAD_HIT_METERS,
  DRIFT_MIN_SECONDS,
  BRAKE_MAX_KMH,
  type TutorialEvent,
} from '../src/game/tutorial';

// Map-backed storage mock that survives simulated reloads.
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
function expect(cond: boolean, msg: string): void {
  checks++;
  if (cond) console.log(`PASS ${msg}`);
  else {
    failures++;
    console.log(`FAIL ${msg}`);
  }
}

const def = TRACKS.find((t) => t.id === TUTORIAL_TRACK_ID)!;
const curve = new TrackCurve(def.points, true);
const LEN = curve.length;

type Frame = { pos: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; binormal: THREE.Vector3; halfWidth: number; dist: number };
function makeFrame(): Frame {
  return { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
}
function tangentAt(dist: number): THREE.Vector3 {
  const f = makeFrame();
  curve.frameAtDist(dist, f);
  return f.tangent;
}
function halfWidthAt(dist: number): number {
  const f = makeFrame();
  curve.frameAtDist(dist, f);
  return f.halfWidth;
}
function headingDelta(dist: number, span = 12): number {
  const a = tangentAt(Math.max(0.5, dist - span / 2));
  const b = tangentAt(Math.min(LEN - 0.5, dist + span / 2));
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
}
function maxBendRate(from: number, to: number): number {
  let max = 0;
  for (let d = from; d <= to; d += 3) max = Math.max(max, headingDelta(d));
  return max;
}

// ---------- 1. Layout pins + sunrise-sprint geometry sanity ----------
{
  expect(def.checkpoints.length === 2 && def.checkpoints[0].dist === 210 && def.checkpoints[1].dist === 420, 'sunrise-sprint checkpoints at 210/420 (layout assumptions hold)');
  expect(LEN > 600 && LEN < 660, `track length sane for the drill layout (${LEN.toFixed(1)}m)`);

  expect(TUTORIAL_RINGS.map((r) => r.dist).join(',') === '60,140,220,450,545,600', 'ring dists pinned: steer 60/140/220, drift sector 450-545, brake gate 600');
  expect(TUTORIAL_PADS.map((p) => p.dist).join(',') === '365,400', 'boost pads pinned at 365/400');
  expect(TUTORIAL_RINGS.map((r) => r.id).join(',') === 'steer-1,steer-2,steer-3,drift-a,drift-b,brake-gate', 'ring ids pinned');
  expect(DRILL_ORDER.join(',') === 'steer,boost,drift,brake', 'drill order: steer, boost, drift, brake');
  expect(DRILL_BANNERS.steer.title === 'STEER — PASS THE GATES', 'steer banner matches spec');
  expect(DRILL_BANNERS.boost.title === 'BOOST — RIDE THE ORANGE PADS', 'boost banner matches spec');
  expect(DRILL_BANNERS.drift.title === 'DRIFT — HOLD SPACE THROUGH THE BEND', 'drift banner matches spec');
  expect(DRILL_BANNERS.brake.title === 'BRAKE — CROSS UNDER 90 KM/H', 'brake banner matches spec');
  expect(TUTORIAL_MAX_TRIES === 3 && STEER_MISS_METERS === 6 && PAD_HIT_METERS === 2.2 && DRIFT_MIN_SECONDS === 1.2 && BRAKE_MAX_KMH === 90, 'thresholds pinned (3 tries, 6m gate miss, 2.2m pad, 1.2s drift, 90 km/h)');

  const ringDists = TUTORIAL_RINGS.map((r) => r.dist);
  const all = [...ringDists, ...TUTORIAL_PADS.map((p) => p.dist)];
  expect(all.every((d) => d > 20 && d < LEN - 25), `all targets inside the lap with margin (max ${Math.max(...all)} < ${LEN.toFixed(0)} - 25)`);
  expect(all.every((d) => def.checkpoints.every((c) => Math.abs(d - c.dist) >= 8)), 'no target within 8m of a checkpoint gate');
  expect(
    TUTORIAL_RINGS.every((r) => halfWidthAt(r.dist) - (Math.abs(r.lateral) + r.radius) > 0.5),
    'every ring fits inside the road with margin',
  );
  expect(TUTORIAL_PADS.every((p) => halfWidthAt(p.dist) - (Math.abs(p.lateral) + 1.7) > 0.5), 'both pads fit inside the road with margin');

  // Steering gates sit on straighter ground than the drift bend; the brake gate is a
  // corner-entry check (by design bendier than the straights, gentler than the bend).
  const steerMax = Math.max(...[60, 140, 220].map((d) => headingDelta(d)));
  const bendMax = maxBendRate(450, 545);
  const gateRate = headingDelta(600);
  expect(steerMax < 0.135, `steer gates on straight/gentle ground (max ${((steerMax * 180) / Math.PI).toFixed(1)}deg/12m)`);
  expect(bendMax > steerMax + 0.02 && bendMax > 0.15, `drift sector is the sharpest stretch (${((bendMax * 180) / Math.PI).toFixed(1)}deg/12m)`);
  expect(gateRate < bendMax, 'brake gate sits on corner approach, not the apex');
  expect(DRILL_START_DIST.steer < 60 && DRILL_START_DIST.boost < 365 && DRILL_START_DIST.drift < 450 && DRILL_START_DIST.brake < 600, 'drill restart points sit before each drill first target');
  expect(DRILL_START_DIST.boost > 220 && DRILL_START_DIST.drift > 400 && DRILL_START_DIST.brake > 545, 'drill restart points sit after the previous drill targets');
}

// ---------- 2. State machine helpers ----------
function makeRun(): { run: TutorialRun; events: TutorialEvent[] } {
  const events: TutorialEvent[] = [];
  const run = new TutorialRun(LEN, (e) => events.push(e));
  return { run, events };
}
function lastOf<T extends TutorialEvent['type']>(events: TutorialEvent[], type: T, drill?: string): Extract<TutorialEvent, { type: T }> | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as Extract<TutorialEvent, { type: T }>;
    if (e.type === type && (drill === undefined || (e as { drill?: string }).drill === drill)) return e;
  }
  return undefined;
}
const dt = 1 / 60;
function feedDist(run: TutorialRun, from: number, to: number, lateral: number, speedKmh = 100, drifting = false): void {
  const step = 1;
  const dir = to >= from ? 1 : -1;
  for (let d = from; dir > 0 ? d <= to : d >= to; d += dir * step) {
    run.observe({ dist: d, lateral, speedKmh, drifting }, dt);
  }
}

// ---------- 3. Steer drill success path ----------
{
  const { run, events } = makeRun();
  const first = events[0];
  expect(!!first && first.type === 'drill-start' && first.drill === 'steer' && first.banner === DRILL_BANNERS.steer.title, 'run opens with the steer drill banner');
  feedDist(run, 8, 62, 1, 100);
  const h1 = lastOf(events, 'hit');
  expect(!!h1 && h1.targetId === 'steer-1' && h1.done === 1 && h1.total === 3, 'gate 1 registers (1/3)');
  feedDist(run, 62, 142, -1, 100);
  const h2 = lastOf(events, 'hit');
  expect(!!h2 && h2.targetId === 'steer-2' && h2.done === 2 && h2.total === 3, 'gate 2 registers (2/3)');
  feedDist(run, 142, 222, 1, 100);
  const h3 = lastOf(events, 'hit');
  const clear = lastOf(events, 'drill-clear');
  const next = lastOf(events, 'drill-start');
  expect(!!h3 && h3.targetId === 'steer-3' && h3.done === 3, 'gate 3 registers (3/3)');
  expect(!!clear && clear.drill === 'steer', 'steer drill clears');
  expect(!!next && next.type === 'drill-start' && next.drill === 'boost', 'boost drill auto-starts after steer');
  expect(run.drill === 'boost' && run.tries === 0 && run.done === 0, 'run state advanced to boost, tries/done reset');
}

// ---------- 4. Steer fail -> retry -> auto-skip after 3 fails ----------
{
  const { run, events } = makeRun();
  feedDist(run, 8, 62, 7.5, 100); // 7.5m off ring 1 lateral (+1) -> 6.5 > 6m miss band
  const f1 = lastOf(events, 'fail');
  expect(!!f1 && f1.drill === 'steer' && f1.tries === 1 && f1.reason === 'missed', 'off-line gate cross fails with reason missed (try 1)');
  expect(run.tries === 1 && run.done === 0, 'fail resets drill progress');
  feedDist(run, 8, 62, 1, 100); // respawn at drill start (as main.ts does) and pass cleanly
  expect(!!lastOf(events, 'hit') && lastOf(events, 'hit')!.targetId === 'steer-1', 'retry from drill start re-crosses gate 1');
  feedDist(run, 62, 142, 8, 100); // try 2
  expect(!!lastOf(events, 'fail') && lastOf(events, 'fail')!.tries === 2, 'second miss records try 2');
  feedDist(run, 8, 62, 1, 100); // retry
  feedDist(run, 62, 142, 8.2, 100); // try 3 -> auto-skip
  const skip = lastOf(events, 'drill-skipped');
  const next = lastOf(events, 'drill-start');
  expect(!!skip && skip.drill === 'steer', 'third miss auto-skips the steer drill');
  expect(!!next && next.drill === 'boost', 'boost drill starts after steer skip');
  expect(run.skippedAny === true && run.drill === 'boost', 'skippedAny latched and run advanced');
}

// ---------- 5. Boost drill: clean center-line drive hits both pads ----------
{
  const { run, events } = makeRun();
  feedDist(run, 8, 402, 0, 110); // lateral 0 passes all steer gates AND both pads (|0±1.5| = 1.5 <= 2.2)
  const h2 = lastOf(events, 'hit');
  expect(!!h2 && h2.targetId === 'pad-2' && h2.done === 2 && h2.total === 2, 'center-line drive registers pad 2 (2/2)');
  expect(events.some((e) => e.type === 'hit' && (e as { targetId: string }).targetId === 'pad-1'), 'pad 1 registered along the way');
  expect(!!lastOf(events, 'drill-clear', 'boost'), 'boost drill clears');
  expect(!!lastOf(events, 'drill-start', 'drift'), 'drift drill auto-starts after boost');
}

// ---------- 6. Boost miss (pad overshot laterally) -> retry -> skip ----------
{
  const { run, events } = makeRun();
  feedDist(run, 8, 235, 0, 110); // clear the steer gates first (center-line passes all three)
  feedDist(run, 235, 367, -5, 110); // pad 1 at -5 vs -1.5 = 3.5 > 2.2 -> miss
  const f1 = lastOf(events, 'fail');
  expect(!!f1 && f1.reason === 'missed' && f1.tries === 1 && f1.drill === 'boost', 'driving past a pad fails the boost attempt (try 1)');
  feedDist(run, 235, 367, 5, 110); // try 2: pads missed on the other side
  expect(!!lastOf(events, 'fail') && lastOf(events, 'fail')!.tries === 2, 'wrong-side approach misses pad 1 (try 2)');
  feedDist(run, 235, 367, 3, 110); // try 3: |3+1.5| = 4.5 > 2.2 -> third miss -> skip
  expect(!!lastOf(events, 'drill-skipped', 'boost'), 'third pad miss auto-skips the boost drill');
  expect(!!lastOf(events, 'drill-start', 'drift') && run.skippedAny === true, 'drift drill starts after boost skip');
}

// ---------- 7. Drift drill: entry arms, banking only inside, exit decides ----------
{
  const { run, events } = makeRun();
  // coast to just before the sector, drifting the whole way (nothing may bank yet)
  feedDist(run, 8, 449, 0, 110, true);
  expect(run.driftTime === 0, `drift outside the sector never banks (${run.driftTime.toFixed(2)}s)`);
  expect(!!lastOf(events, 'drill-start', 'drift'), 'reached the drift drill via clean center-line driving');
  feedDist(run, 449, 452, 0, 80, true); // cross the entry ring (clock resets at 450)
  const entry = events.find((e) => e.type === 'hit' && (e as { targetId: string }).targetId === 'drift-a');
  expect(!!entry, 'sector entry ring registered');
  expect(!!entry && (entry as { done: number }).done === 0 && (entry as { total: number }).total === 1, 'entry hit does not count toward the 1/1 gate');
  feedDist(run, 452, 530, 0, 80, true); // bank inside the sector
  expect(run.driftTime > DRIFT_MIN_SECONDS, `drift banks inside the sector (${run.driftTime.toFixed(2)}s)`);
  feedDist(run, 530, 547, 0, 80, false);
  const exitHit = lastOf(events, 'hit');
  const clear = lastOf(events, 'drill-clear');
  const next = lastOf(events, 'drill-start');
  expect(!!exitHit && exitHit.targetId === 'drift-b', 'exit ring registers with enough banked drift');
  expect(!!clear && clear.drill === 'drift', 'drift drill clears');
  expect(!!next && next.drill === 'brake', 'brake drill auto-starts after drift');
}

// ---------- 8. Drift fail: exit without 1.2s, then retry clean ----------
{
  const { run, events } = makeRun();
  feedDist(run, 8, 547, 0, 110, false); // coast the entire sector with no drift
  const f1 = lastOf(events, 'fail');
  expect(!!f1 && f1.reason === 'no-drift' && f1.tries === 1 && f1.drill === 'drift', 'exiting the sector without 1.2s of drift fails');
  feedDist(run, 425, 470, 0, 80, false); // respawn to drift start, re-arm entry
  feedDist(run, 470, 545, 0, 80, true); // bank ~1.25s then exit
  const clear = lastOf(events, 'drill-clear');
  expect(!!clear && clear.drill === 'drift' && !!lastOf(events, 'drill-start', 'brake'), 'retry with enough banked drift clears the sector');
}

// ---------- 9. Brake drill: speed gate + tutorial completion ----------
{
  const { run, events } = makeRun();
  feedDist(run, 8, 449, 0, 100, false);
  feedDist(run, 449, 546, 0, 100, true); // clear the drift sector legitimately
  feedDist(run, 546, 602, 0, 95, false); // cross the gate at 95 km/h
  const f1 = lastOf(events, 'fail');
  expect(!!f1 && f1.reason === 'too-fast' && f1.tries === 1 && f1.drill === 'brake', 'crossing at 95 km/h fails the speed gate');
  feedDist(run, 565, 602, 0, 85, false); // retry under the limit
  const hit = lastOf(events, 'hit');
  const clear = lastOf(events, 'drill-clear');
  const done = lastOf(events, 'complete');
  expect(!!hit && hit.targetId === 'brake-gate', 'gate registers under 90 km/h');
  expect(!!clear && clear.drill === 'brake', 'brake drill clears');
  expect(!!done && done.type === 'complete' && done.skippedAny === false, 'all four drills clean -> complete with no skips');
  expect(run.status === 'complete', 'run is complete');
  feedDist(run, 565, 620, 0, 50, false);
  expect(lastOf(events, 'complete') === done && events[events.length - 1] === done, 'observe after completion is a no-op');
}

// ---------- 10. SKIP (ESC) path ----------
{
  const { run, events } = makeRun();
  feedDist(run, 8, 30, 0, 100);
  run.skipAll();
  const done = lastOf(events, 'complete');
  expect(!!done && done.skippedAny === true, 'skipAll completes the tutorial as completion-with-skips');
  feedDist(run, 30, 500, 0, 100);
  run.skipAll();
  expect(events.filter((e) => e.type === 'complete').length === 1, 'skipAll and observe are no-ops after completion');
}

// ---------- 11. Completion flags persist (reload round-trip) ----------
{
  store.clear();
  const save = new SaveManager();
  expect(save.settings.tutorialDone !== true && save.settings.tutorialSkipped !== true, 'fresh profile: tutorial flags unset');
  save.updateSettings({ tutorialDone: true, tutorialSkipped: false });
  const reloaded = new SaveManager();
  expect(reloaded.settings.tutorialDone === true && reloaded.settings.tutorialSkipped === false, 'tutorialDone survives a reload; skipped stays false');
  reloaded.updateSettings({ tutorialSkipped: true });
  const reloaded2 = new SaveManager();
  expect(reloaded2.settings.tutorialDone === true && reloaded2.settings.tutorialSkipped === true, 'both flags round-trip independently');
}

// ---------- 12. Practice-style real-car run: timer stopped, zero records, tutorial completes ----------
{
  store.clear();
  const save = new SaveManager();
  const car = new CarPhysics(curve);
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: false });
  car.placeAtFrame(0, 8);
  race.practice = true;
  race.start();
  race.countdownMs = 1;

  const events: TutorialEvent[] = [];
  const run = new TutorialRun(LEN, (e) => events.push(e));
  const simDt = 1 / 120;
  const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  const ap = { smooth: 0 };
  let complete: Extract<TutorialEvent, { type: 'complete' }> | null = null;
  let nan = false;
  let step = 0;
  let drifted = false;
  let braked = false;
  let gateSpeed = Infinity;
  let sectorDriftSeen = false;
  let lastCount = 0;
  while (!complete && step < 140 * 120) {
    if (race.phase === 'racing') {
      const d = car.state.trackDist;
      const r = autopilotDrive(car, curve, simDt, ap);
      if (r.respawn) {
        race.respawnAtCheckpoint();
      } else {
        input.steer = r.steer;
        input.throttle = r.throttle;
        input.brake = r.brake;
      }
      input.drift = false;
      // scripted coaching on top of the autopilot: hold the drift input through the
      // sector, brake for the final gate
      if (d > 448 && d < 546) {
        input.drift = true;
        input.throttle = Math.min(input.throttle, 0.8);
        drifted = true;
      }
      if (d > 552 && car.state.forwardSpeed > 20) {
        input.throttle = 0;
        input.brake = 1;
        braked = true;
      }
      if (d > 596 && d < 604) gateSpeed = Math.min(gateSpeed, Math.abs(car.state.forwardSpeed) * 3.6);
      if (d > 450 && d < 545 && input.drift && car.state.grounded && car.state.speed > 10) sectorDriftSeen = true;
    }
    race.update(simDt * 1000, input);
    if (race.phase === 'racing') {
      const cs = car.state;
      run.observe(
        {
          dist: cs.trackDist,
          lateral: cs.lateral,
          speedKmh: Math.abs(cs.forwardSpeed) * 3.6,
          drifting: input.drift && cs.grounded && cs.speed > 10,
        },
        simDt,
      );
    }
    // mirror main.ts: on a failed attempt, place the car back before the drill
    if (lastCount < events.length) {
      for (let i = lastCount; i < events.length; i++) {
        const e = events[i];
        if (e.type === 'fail') {
          car.placeAt(Math.max(8, DRILL_START_DIST[run.drill]), 0);
        } else if (e.type === 'complete') {
          complete = e;
        }
      }
      lastCount = events.length;
    }
    if (!Number.isFinite(car.state.pos.x + car.state.pos.y + car.state.pos.z)) nan = true;
    step++;
  }
  const skips = events.filter((e) => e.type === 'drill-skipped').length;
  const fails = events.filter((e) => e.type === 'fail').map((e) => `${(e as { drill: string }).drill}:${(e as { reason: string }).reason}`);
  expect(!nan, `sim stays finite through the whole tutorial (steps ${step})`);
  expect(!!complete, `scripted tutorial run reaches completion headless (fails: ${fails.join(' ') || 'none'}, skips: ${skips}, )`);
  if (complete) expect(complete.skippedAny === false, 'headless run completes every drill (no skips)');
  expect(drifted && sectorDriftSeen, 'sector coaching actually produced drift (driftAmount > 0.3)');
  expect(braked && gateSpeed < BRAKE_MAX_KMH, `brake coaching got the gate cross under 90 (min ${gateSpeed.toFixed(0)} km/h)`);
  expect(race.phase !== 'finished', 'practice run never reaches the finish phase');
  expect(race.elapsedMs === 0, 'practice timer never starts (0.000)');
  const ts = save.trackSave(TUTORIAL_TRACK_ID);
  expect(ts.bestTimeMs === null && ts.ghost === null && ts.history.length === 0, 'no PB, ghost, or history written by the tutorial run');
  expect(skips === 0, 'no drill auto-skipped in the scripted run');
}

// ---------- 13. Shared track defs untouched ----------
{
  const before = JSON.stringify(TRACKS.find((t) => t.id === TUTORIAL_TRACK_ID));
  void makeRun();
  expect(JSON.stringify(TRACKS.find((t) => t.id === TUTORIAL_TRACK_ID)) === before, 'tutorial module never mutates the shared track defs');
}

console.log(`\ntutorial test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
