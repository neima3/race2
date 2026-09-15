import * as THREE from 'three';
import { TrackCurve, type TrackFrame } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController, serializeGhost, type GhostSample, type GhostLabel, type RaceEvents } from '../src/game/race';
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
let total = 0;
let failures = 0;
function ok(cond: boolean, msg: string): void {
  total++;
  if (cond) console.log(`PASS ${msg}`);
  else {
    failures++;
    console.log(`FAIL ${msg}`);
  }
}

const def = TRACKS[0]; // sunrise-sprint
const curve = new TrackCurve(def.points, true);

/** Synthetic ghost: constant-pace lap along the road centerline (real geometry, so surfaceQuery recovers dist). */
function makeSyntheticGhost(lapMs: number, count = 160): GhostSample[] {
  const f: TrackFrame = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const x = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const samples: GhostSample[] = [];
  for (let i = 0; i < count; i++) {
    const d = (i / count) * curve.length;
    curve.frameAtDist(d, f);
    pos.copy(f.pos).addScaledVector(f.normal, 0.55);
    x.crossVectors(f.normal, f.tangent);
    m.makeBasis(x, f.normal, f.tangent);
    q.setFromRotationMatrix(m);
    samples.push({ t: (i / count) * lapMs, pos: pos.clone(), quat: q.clone() });
  }
  return samples;
}

interface Setup {
  race: RaceController;
  car: CarPhysics;
  save: SaveManager;
}

const input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };

/** Fresh sunrise-sprint race; synthetic PB (default 30s, slow) + synthetic friend (default 36s) + real dev ghost (~17.5s). */
function makeRace(opts: {
  maxGhosts: number;
  withPb?: boolean;
  withFriend?: boolean;
  writesRecords?: boolean;
  pbLapMs?: number;
  friendLapMs?: number;
  laps?: number;
  onEvent?: <K extends keyof RaceEvents>(ev: K, payload?: RaceEvents[K]) => void;
}): Setup {
  const save = new SaveManager();
  const pbLapMs = opts.pbLapMs ?? 30000;
  const friendLapMs = opts.friendLapMs ?? 36000;
  if (opts.withPb) save.trackSave(def.id).ghost = serializeGhost(makeSyntheticGhost(pbLapMs));
  const car = new CarPhysics(curve);
  car.placeAt(8, 0);
  const race = new RaceController(car, curve, def, save, (ev, payload) => opts.onEvent?.(ev, payload), {
    laps: opts.laps ?? 1,
    writesRecords: opts.writesRecords ?? true,
  });
  race.maxGhosts = opts.maxGhosts;
  race.useExternalGhost(opts.withFriend === false ? null : makeSyntheticGhost(friendLapMs));
  race.start();
  race.countdownMs = 1;
  return { race, car, save };
}

function labels(race: RaceController): GhostLabel[] {
  const out: GhostLabel[] = [];
  for (let i = 0; i < race.ghostCount(); i++) out.push(race.ghostTrack(i)!.label);
  return out;
}

// ---- 1. slot filling + dedupe per settings (1/2/3) ----
{
  let s = makeRace({ maxGhosts: 3, withPb: true, withFriend: true });
  ok(labels(s.race).join(',') === 'FRIEND,PB,BOT', `limit 3 + PB + friend -> FRIEND,PB,BOT (got ${labels(s.race).join(',')})`);
  ok(s.race.ghostActive && s.race.ghostCount() === 3, 'limit 3: ghostActive with 3 tracks');
  ok(
    s.race.ghostTrack(0)!.color === 0xffb52e && s.race.ghostTrack(1)!.color === 0xffffff && s.race.ghostTrack(2)!.color === 0x8d96a5,
    'ghost colors: PB white, FRIEND accent2, BOT grey',
  );

  s = makeRace({ maxGhosts: 2, withPb: true, withFriend: true });
  ok(labels(s.race).join(',') === 'FRIEND,PB', `limit 2 + all -> FRIEND,PB (dev deduped; got ${labels(s.race).join(',')})`);

  s = makeRace({ maxGhosts: 1, withPb: true, withFriend: true });
  ok(labels(s.race).join(',') === 'FRIEND', `limit 1 + all -> FRIEND (friend race keeps its ghost; got ${labels(s.race).join(',')})`);

  s = makeRace({ maxGhosts: 2, withPb: true, withFriend: false });
  ok(labels(s.race).join(',') === 'PB,BOT', `limit 2, no friend -> PB,BOT (got ${labels(s.race).join(',')})`);

  s = makeRace({ maxGhosts: 1, withPb: true, withFriend: false });
  ok(labels(s.race).join(',') === 'PB', `limit 1, no friend -> PB (PB outranks dev, as today; got ${labels(s.race).join(',')})`);

  s = makeRace({ maxGhosts: 2, withPb: false, withFriend: true });
  ok(labels(s.race).join(',') === 'FRIEND,BOT', `limit 2, no PB -> FRIEND,BOT (got ${labels(s.race).join(',')})`);

  s = makeRace({ maxGhosts: 3, withPb: false, withFriend: false });
  ok(labels(s.race).join(',') === 'BOT', `no PB no friend -> BOT only (got ${labels(s.race).join(',')})`);

  s = makeRace({ maxGhosts: 3, withPb: false, withFriend: false, writesRecords: false });
  ok(!s.race.ghostActive && s.race.ghostCount() === 0 && s.race.battleRank(100, 5000) === null, 'rival/knockout mode (writesRecords=false): ghosts hidden exactly as before');
}

// ---- 2. per-ghost sample lookup at t = 0 / mid / end ----
{
  const s = makeRace({ maxGhosts: 3, withPb: true, withFriend: true, pbLapMs: 20000, friendLapMs: 28000 });
  const race = s.race;
  ok(race.ghostTrack(0)!.label === 'FRIEND' && race.ghostTrack(1)!.label === 'PB', 'slot order FRIEND(0), PB(1), BOT(2)');
  const indexed: [GhostLabel, number][] = [
    ['FRIEND', 0],
    ['PB', 1],
  ];
  for (const [label, i] of indexed) {
    const g = race.ghostTrack(i)!;
    const at0 = race.ghostSampleAt(0, i);
    ok(at0 !== null && at0.pos.distanceTo(g.samples[0].pos) < 1e-6, `${label}: sample at t=0 is first sample`);
    const last = g.samples[g.samples.length - 1];
    const atEnd = race.ghostSampleAt(last.t + 9999, i);
    ok(atEnd !== null && atEnd.pos.distanceTo(last.pos) < 1e-6, `${label}: sample past lap end clamps to last sample`);
    const midT = last.t * 0.5;
    const atMid = race.ghostSampleAt(midT, i);
    ok(atMid !== null && Number.isFinite(atMid.pos.x + atMid.pos.y + atMid.pos.z), `${label}: mid-lap sample finite`);
    const dMid = race.ghostDistAt(midT, i);
    ok(dMid !== null && dMid > 0.3 * curve.length && dMid < 0.7 * curve.length, `${label}: mid-lap dist on the road (${dMid?.toFixed(1)}m of ${curve.length.toFixed(0)}m)`);
    void g;
  }
  // per-ghost independence: the slower ghost is further behind at the same instant
  const t = 10000;
  const dFast = race.ghostDistAt(t, 1)!; // PB 20s pace
  const dSlow = race.ghostDistAt(t, 0)!; // FRIEND 28s pace
  ok(dFast > dSlow + curve.length * 0.05, `pacing: PB(${dFast.toFixed(0)}m) ahead of FRIEND(${dSlow.toFixed(0)}m) at t=${t}ms`);
  ok(race.ghostSampleAt(t, 5) === null && race.ghostDistAt(t, 5) === null, 'out-of-range ghost index returns null');
}

// ---- 3. battleRank correctness (ahead/behind mixtures) ----
{
  const s = makeRace({ maxGhosts: 3, withPb: true, withFriend: true, pbLapMs: 20000, friendLapMs: 28000 });
  const race = s.race;
  const t = 10000;
  const dPb = race.ghostDistAt(t, 1)!;
  const dFriend = race.ghostDistAt(t, 0)!;
  const dDev = race.ghostDistAt(t, 2)!;
  ok(dPb !== dFriend && dFriend !== dDev && dPb !== dDev, `battle fields distinct (PB ${dPb.toFixed(0)} / FRIEND ${dFriend.toFixed(0)} / BOT ${dDev.toFixed(0)})`);
  const expected = (dist: number): number => 1 + [dPb, dFriend, dDev].filter((d) => d > dist).length;
  const r1 = race.battleRank(dDev + 5, t);
  ok(r1 !== null && r1.rank === 1 && r1.of === 4, `ahead of all three -> 1ST OF 4 (got ${r1 ? `${r1.rank} of ${r1.of}` : 'null'})`);
  const mid = (dPb + dFriend) / 2;
  const r2 = race.battleRank(mid, t);
  ok(r2 !== null && r2.rank === expected(mid) && r2.of === 4, `midfield between ghosts -> rank ${expected(mid)} OF 4 (got ${r2 ? `${r2.rank} of ${r2.of}` : 'null'})`);
  const r4 = race.battleRank(Math.min(dPb, dFriend, dDev) - 5, t);
  ok(r4 !== null && r4.rank === 4 && r4.of === 4, `behind all three -> 4TH OF 4 (got ${r4 ? `${r4.rank} of ${r4.of}` : 'null'})`);
  ok(race.battleRank(dPb + 0.001, t)!.rank === expected(dPb + 0.001), 'rank formula stable at a ghost boundary');
}

// ---- 4. live per-ghost deltas ----
{
  const s = makeRace({ maxGhosts: 3, withPb: true, withFriend: true, pbLapMs: 20000, friendLapMs: 28000 });
  const race = s.race;
  const t = 9000;
  const distAt = race.ghostDistAt(t, 1)!; // stand exactly where PB is at t
  const deltaPb = race.liveGhostDelta(distAt, t, 1)!;
  const deltaFriend = race.liveGhostDelta(distAt, t, 0)!;
  const deltaDev = race.liveGhostDelta(distAt, t, 2)!;
  ok(Math.abs(deltaPb) < 200, `delta vs PB at PB's own position ~ 0 (${deltaPb.toFixed(1)}ms)`);
  ok(deltaFriend < -1000, `slower FRIEND is behind us -> negative (ahead) delta (${(deltaFriend / 1000).toFixed(2)}s)`);
  ok(Math.abs(deltaDev - deltaFriend) > 100, `BOT delta distinct from FRIEND (${(deltaDev / 1000).toFixed(2)}s vs ${(deltaFriend / 1000).toFixed(2)}s)`);
  ok(race.liveGhostDelta(distAt + curve.length, t, 0) === null, 'delta null beyond ghost dist range');
}

// ---- 5. finish panel ghost rows (real autopilot race, 3 ghosts) ----
{
  let lastFinish: RaceEvents['finish'] | null = null;
  const s = makeRace({
    maxGhosts: 3,
    withPb: true,
    withFriend: true,
    pbLapMs: 30000,
    friendLapMs: 36000,
    onEvent: (ev, payload) => {
      if (ev === 'finish') lastFinish = payload as RaceEvents['finish'];
    },
  });
  const race = s.race;
  const ap = { smooth: 0 };
  let steps = 0;
  while (race.phase !== 'finished' && steps < 40000) {
    const r = autopilotDrive(s.car, curve, simDt, ap);
    if (r.respawn) race.respawnAtCheckpoint();
    input.steer = r.respawn ? 0 : r.steer;
    input.throttle = r.respawn ? 0 : r.throttle;
    input.brake = r.respawn ? 0 : r.brake;
    race.update(simDt * 1000, input);
    steps++;
  }
  const res = lastFinish;
  ok(race.phase === 'finished' && !!res, `autopilot finished the 3-ghost battle (${(race.elapsedMs / 1000).toFixed(2)}s, ${steps} steps)`);
  const rows = res?.ghostResults ?? [];
  ok(rows.length === 3, `finish result carries 3 ghost rows (got ${rows.length})`);
  ok(
    rows.map((g) => g.label).sort().join(',') === 'BOT,FRIEND,PB',
    `ghost rows labeled PB/FRIEND/BOT (got ${rows.map((g) => g.label).join(',')})`,
  );
  const byLabel = new Map(rows.map((g) => [g.label, g]));
  // synthetic ghosts sample at i/count of the lap, so the recorded lap ends at (count-1)/count * lapMs
  const sampleTol = 30000 / 160 + 65;
  ok(Math.abs((byLabel.get('PB')?.deltaMs ?? NaN) - ((res?.timeMs ?? 0) - 30000)) <= sampleTol, `PB row delta = player − PB lap (${((byLabel.get('PB')?.deltaMs ?? 0) / 1000).toFixed(2)}s)`);
  ok(Math.abs((byLabel.get('FRIEND')?.deltaMs ?? NaN) - ((res?.timeMs ?? 0) - 36000)) <= 36000 / 160 + 65, `FRIEND row delta = player − FRIEND lap (${((byLabel.get('FRIEND')?.deltaMs ?? 0) / 1000).toFixed(2)}s)`);
  ok((byLabel.get('PB')?.deltaMs ?? 1) < 0 && (byLabel.get('FRIEND')?.deltaMs ?? 1) < 0, 'slow PB/FRIEND ghosts beaten (rows would say BEAT)');
  ok(byLabel.get('PB')?.color === 0xffffff && byLabel.get('FRIEND')?.color === 0xffb52e && byLabel.get('BOT')?.color === 0x8d96a5, 'ghost rows carry chip colors');
  ok(race.ghostTrack(0)!.label === 'FRIEND', 'primary ghost (index 0, checkpoint deltas) is FRIEND during a friend race');
}

// ---- 6. zero per-frame allocations in the per-step ghost updates (30s, --expose-gc) ----
{
  const s = makeRace({ maxGhosts: 3, withPb: true, withFriend: true, pbLapMs: 20000, friendLapMs: 28000, laps: 99 });
  const race = s.race;
  const ap = { smooth: 0 };
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  const heap = (): number => {
    if (gc) gc();
    return process.memoryUsage().heapUsed / 1048576;
  };
  let steps = 0;
  const step = (): void => {
    const r = autopilotDrive(s.car, curve, simDt, ap);
    if (r.respawn) race.respawnAtCheckpoint();
    input.steer = r.respawn ? 0 : r.steer;
    input.throttle = r.respawn ? 0 : r.throttle;
    input.brake = r.respawn ? 0 : r.brake;
    race.update(simDt * 1000, input);
    const d = s.car.state.trackDist;
    const t = race.elapsedMs;
    race.battleRank(d, t);
    for (let i = 0; i < race.ghostCount(); i++) {
      race.liveGhostDelta(d, t, i);
      race.ghostDistAt(t, i);
      if ((i + steps) % 4 === 0) race.ghostSampleInto(t, i, pos, quat);
    }
    steps++;
  };
  for (let i = 0; i < 3600; i++) step(); // warm-up
  const h0 = heap();
  for (let i = 0; i < 30 * 120 && race.phase === 'racing'; i++) step();
  const h1 = heap();
  const delta = h1 - h0;
  console.log(`ghostbattle allocs: 30s window ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}MB (gc=${gc ? 'forced' : 'unavailable'}, lapsDone=${race.lapsDone})`);
  if (gc) ok(delta <= 2, `30s 3-ghost sim allocates <= 2MB (${delta.toFixed(3)}MB)`);
  else ok(race.phase === 'racing', 'sim still racing after 30s (gc-unavailable fallback)');
}

console.log(`\nghostbattle test: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
