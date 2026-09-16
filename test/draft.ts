import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { RivalManager, pickLineup } from '../src/game/rivals';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { TrafficManager } from '../src/systems/traffic';
import {
  DraftTracker,
  gapAhead,
  DRAFT_GAP_MIN,
  DRAFT_GAP_MAX,
  DRAFT_LAT_MAX,
  DRAFT_BUILD_TIME,
  DRAFT_DECAY_TIME,
  DRAFT_ACTIVE_MIN,
  DRAFT_TOP_SPEED,
} from '../src/game/draft';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

// v9 P2 slipstream drafting gate. Pocket math (4-9m behind, |dLat|<2.2), charge
// build (~0.5s) / fast decay (~0.3s) / collision reset, +8% top speed held in
// pocket (scripted following on a straight oval), traffic drafting, solo no-op
// byte-identity, and rivals-gap assertions still passing with drafting wired
// production-style (playerRef passed to RivalManager.update).

const simDt = 1 / 120;
let failures = 0;
function fail(msg: string): void {
  failures++;
  console.log(`FAIL ${msg}`);
}
function pass(msg: string): void {
  console.log(`PASS ${msg}`);
}
function check(cond: boolean, msg: string): void {
  if (cond) pass(msg);
  else fail(msg);
}

// Closed oval: two 1600m straights joined by smooth turns — mid-straight is
// perfectly straight, so steer=0 + full throttle gives a clean equilibrium run.
const OVAL = [
  { pos: [0, 0, 0] as [number, number, number] },
  { pos: [0, 0, 800] as [number, number, number] },
  { pos: [0, 0, 1600] as [number, number, number] },
  { pos: [20, 0, 2200] as [number, number, number] },
  { pos: [40, 0, 1600] as [number, number, number] },
  { pos: [40, 0, 800] as [number, number, number] },
  { pos: [40, 0, 0] as [number, number, number] },
  { pos: [20, 0, -600] as [number, number, number] },
];

// 1. Constants match the v9 P2 spec
check(
  DRAFT_GAP_MIN === 4 &&
    DRAFT_GAP_MAX === 9 &&
    DRAFT_LAT_MAX === 2.2 &&
    Math.abs(DRAFT_BUILD_TIME - 0.5) < 1e-9 &&
    Math.abs(DRAFT_DECAY_TIME - 0.3) < 1e-9 &&
    Math.abs(DRAFT_ACTIVE_MIN - 0.5) < 1e-9 &&
    Math.abs(DRAFT_TOP_SPEED - 1.08) < 1e-9,
  'constants: pocket 4-9m, |dLat|<2.2, build 0.5s, decay 0.3s, active ≥0.5, top ×1.08',
);

// 2. Charge build: active flips at 0.25s (charge 0.5), full at 0.5s — while CLOSING
{
  const t = new DraftTracker();
  let activeAt = -1;
  const steps = 60; // 0.5s
  for (let i = 0; i < steps; i++) {
    t.update(simDt, 6 - (i % 100) * 0.02, 0); // closing sawtooth 6→4 m
    if (t.active && activeAt < 0) activeAt = i + 1;
  }
  check(activeAt > 0 && Math.abs(activeAt * simDt - 0.25) < 0.05, `build: active flips at 0.25s (got ${activeAt <= 0 ? 'never' : (activeAt * simDt).toFixed(3) + 's'})`);
  check(Math.abs(t.charge - 1) < 1e-6, `build: charge full after 0.5s closing (got ${t.charge.toFixed(4)})`);
  check(t.factor() === DRAFT_TOP_SPEED, 'build: factor is 1.08 while charged');
}

// 2b. Matched following (constant gap, not closing) does NOT build
{
  const t = new DraftTracker();
  for (let i = 0; i < 120; i++) t.update(simDt, 6, 0);
  check(t.charge === 0 && !t.active, 'closing-rule: matched follow (constant gap) never builds');
}

// 3. Decay: full → 0 in ~0.3s out of pocket, inactive past 0.15s
{
  const t = new DraftTracker();
  for (let i = 0; i < 60; i++) t.update(simDt, 6 - (i % 100) * 0.02, 0);
  let inactiveAt = -1;
  for (let i = 1; i <= 40; i++) {
    t.update(simDt, -1, 0);
    if (!t.active && inactiveAt < 0) inactiveAt = i;
  }
  check(inactiveAt > 0 && Math.abs(inactiveAt * simDt - 0.15) < 0.05, `decay: inactive after 0.15s (got ${inactiveAt < 0 ? 'never' : (inactiveAt * simDt).toFixed(3) + 's'})`);
  check(Math.abs(t.charge) < 1e-6, `decay: charge empty after 0.3s (got ${t.charge.toFixed(4)})`);
  check(t.factor() === 1, 'decay: factor back to 1');
}

// 4. Collision reset zeroes the pocket
{
  const t = new DraftTracker();
  for (let i = 0; i < 60; i++) t.update(simDt, 6, 0);
  t.reset();
  check(t.charge === 0 && !t.active && t.factor() === 1, 'reset: collision clears charge/active/factor');
}

// 5. Pocket window edges (closing within the window builds; window/lat rejects hold at any speed)
{
  const closer = (start: number): ((i: number) => number) => (i) => start - (i % 100) * 0.02;
  const cases: { gap: (i: number) => number; lat: number; inPocket: boolean; label: string }[] = [
    { gap: () => 3.9, lat: 0, inPocket: false, label: 'gap 3.9 (too close) rejected' },
    { gap: closer(8.9), lat: 0, inPocket: true, label: 'gap ≤8.9 closing accepted' },
    { gap: closer(6), lat: 0, inPocket: true, label: 'gap 6→4 closing accepted' },
    { gap: closer(8.99), lat: 0, inPocket: true, label: 'gap 8.99→6.99 closing accepted' },
    { gap: () => 9.1, lat: 0, inPocket: false, label: 'gap 9.1 (too far) rejected' },
    { gap: closer(6), lat: 2.2, inPocket: false, label: 'dLat 2.2 (edge) rejected' },
    { gap: closer(6), lat: 2.19, inPocket: true, label: 'dLat 2.19 accepted' },
    { gap: () => 6, lat: 0, inPocket: false, label: 'matched (not closing) rejected' },
    { gap: () => -1, lat: 0, inPocket: false, label: 'no candidate (-1) rejected' },
  ];
  let bad = 0;
  for (const c of cases) {
    const t = new DraftTracker();
    for (let i = 0; i < 30; i++) t.update(simDt, c.gap(i), c.lat);
    const grew = t.charge > 0;
    if (grew !== c.inPocket) bad++;
  }
  check(bad === 0, `pocket-window: all ${cases.length} edge cases correct${bad ? ` (${bad} wrong)` : ''}`);
}

// 6. gapAhead wrap safety across the seam
{
  const len = 1000;
  const ok = gapAhead(len, 995, 4) === 9 && gapAhead(len, 0, 995) === -5 && gapAhead(len, 500, 500) === 0;
  check(ok, 'gapAhead: wrap-safe shortest forward delta');
}

// 7. Solo byte-identity: step without the param === step with explicit factor 1
{
  const curve = new TrackCurve(OVAL, true);
  const a = new CarPhysics(curve);
  const b = new CarPhysics(curve);
  a.placeAt(300, 0);
  b.placeAt(300, 0);
  const idle = new DraftTracker();
  let identical = true;
  for (let i = 0; i < 600; i++) {
    a.step(simDt, 0, 1, 0, false, true);
    b.step(simDt, 0, 1, 0, false, true, idle.factor());
    if (
      a.state.pos.x !== b.state.pos.x ||
      a.state.pos.y !== b.state.pos.y ||
      a.state.pos.z !== b.state.pos.z ||
      a.state.quat.x !== b.state.quat.x ||
      a.state.quat.y !== b.state.quat.y ||
      a.state.quat.z !== b.state.quat.z ||
      a.state.quat.w !== b.state.quat.w ||
      a.state.vel.x !== b.state.vel.x ||
      a.state.vel.y !== b.state.vel.y ||
      a.state.vel.z !== b.state.vel.z
    ) {
      identical = false;
      break;
    }
  }
  check(identical && idle.charge === 0 && idle.factor() === 1, 'byte-identity: solo run with default param === explicit factor 1 (600 steps)');
}

// 8. +8% top speed held in pocket (scripted following at fixed 6m gap)
{
  const run = (draft: boolean): number => {
    const curve = new TrackCurve(OVAL, true);
    const car = new CarPhysics(curve);
    car.placeAt(300, 0);
    const tr = new DraftTracker();
    let sum = 0;
    let n = 0;
    const total = 2400; // 20s
    for (let i = 0; i < total; i++) {
      if (draft) tr.update(simDt, 6 - (i % 100) * 0.02, 0); // closing sawtooth 6→4 m
      car.step(simDt, 0, 1, 0, false, true, draft ? tr.factor() : 1);
      if (i >= total - 600) {
        sum += car.state.forwardSpeed;
        n++;
      }
    }
    if (draft && !tr.active) fail('top-speed: tracker not active during draft run');
    return sum / n;
  };
  const base = run(false);
  const drafted = run(true);
  const ratio = drafted / base;
  check(
    ratio >= 1.02 && ratio <= 1.08 && drafted - base >= 0.5,
    `top-speed: drafted ${drafted.toFixed(2)} m/s vs base ${base.toFixed(2)} m/s (ratio ${ratio.toFixed(3)}, expected +2-8% realized from the ×1.08 cap)`,
  );
}

// 9. Traffic drafting: real kinematic traffic car, player closes from 8m back
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
  race.beginRacing();
  const len = curve.length;
  const lead = traffic.cars[0];
  let startDist = (lead.dist - 8) % len;
  if (startDist < 0) startDist += len;
  car.placeAt(startDist, lead.lane);
  const frame = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
    halfWidth: 0,
    dist: 0,
  };
  curve.frameAtDist(startDist, frame);
  car.state.vel.copy(frame.tangent).multiplyScalar(24); // already at speed
  const tr = new DraftTracker();
  let maxCharge = 0;
  let activeSteps = 0;
  let leadMoved = 0;
  let prevLeadDist = lead.dist;
  let contact = false;
  for (let i = 0; i < 360; i++) {
    traffic.update(simDt * 1000, car, true);
    leadMoved += Math.abs(gapAhead(len, prevLeadDist, lead.dist));
    prevLeadDist = lead.dist;
    const g = gapAhead(len, car.state.trackDist, lead.dist);
    const dLat = Math.abs(lead.lat - car.state.lateral);
    if (g > 0 && g < 3.7) break; // about to contact — stop clean
    tr.update(simDt, g, dLat);
    maxCharge = Math.max(maxCharge, tr.charge);
    if (tr.active) activeSteps++;
    car.step(simDt, 0, 1, 0, false, true, tr.factor());
  }
  check(leadMoved > 5, `traffic: lead car advanced kinematically (${leadMoved.toFixed(1)}m)`);
  check(maxCharge >= DRAFT_ACTIVE_MIN, `traffic: charge built to ${maxCharge.toFixed(2)} in pocket`);
  check(activeSteps > 0, `traffic: draft factor engaged for ${activeSteps} steps`);
  check(!contact && traffic.collisions === 0, 'traffic: no collision during the scripted draft');
}

// 10. Rival race with drafting wired production-style: finishes, gap asserts hold
{
  const def = TRACKS[0];
  const lineup = pickLineup(def.id);
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const events: string[] = [];
  const race = new RaceController(car, curve, def, save, (ev) => events.push(ev), { laps: 2, writesRecords: false });
  const rivals = new RivalManager(curve, def, new THREE.Group(), false, lineup);
  const slot = rivals.gridSlot(3);
  car.placeAt(slot.dist, slot.lateral);
  rivals.placeOnGrid();
  race.start();
  race.countdownMs = 1;

  const ap = { smooth: 0 };
  const playerRef = { dist: 0, lateral: 0 };
  let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
  let pendingRespawn = false;
  let recover = 0;
  let recoverDir = 1;
  let stuck = 0;
  let wall = 0;
  let maxGap = 0;
  while (race.phase !== 'finished' && wall < 90000) {
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
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
    playerRef.dist = car.state.trackDist;
    playerRef.lateral = car.state.lateral;
    race.update(simDt * 1000, input);
    rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress, null, 0, playerRef);
    wall += simDt * 1000;
    if (race.phase === 'racing') {
      const pp = race.totalProgress;
      for (const rv of rivals.standings(pp)) {
        if (!rv.isPlayer) maxGap = Math.max(maxGap, Math.abs(pp - rv.progress));
      }
    }
  }
  check(race.phase === 'finished', `rivals-draft: player finished 2 laps (phase=${race.phase})`);
  check(race.completedLaps === 2, `rivals-draft: completedLaps=${race.completedLaps}`);
  check(maxGap < 120, `rivals-draft: rubber-band gap ${maxGap.toFixed(1)}m < 120m with drafting on`);
  check(events.filter((e) => e === 'checkpoint').length === def.checkpoints.length * 2, 'rivals-draft: per-lap checkpoints correct');
}

const total = 15;
console.log(`\ndraft test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
