// summit-run authoring probe: geo metrics + autopilot lap for a single track id.
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { CarPhysics, BODY_TUNING } from '../../src/physics/car';
import { RaceController } from '../../src/game/race';
import { SaveManager } from '../../src/core/save';
import { autopilotDrive } from '../../src/systems/autopilot';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

const id = process.argv[2] ?? 'summit-run';
const def = TRACKS.find((t) => t.id === id)!;
const curve = new TrackCurve(def.points, true);
const fr = curve.frames;
const n = fr.length;

// --- overlap / fold scan (geo-audit math) ---
let hard = 0;
let stacked = 0;
let near = 0;
let worst = '';
for (let i = 0; i < n; i++) {
  const a = fr[i];
  for (let j = i + 1; j < n; j++) {
    const b = fr[j];
    const arcSep = Math.min(b.dist - a.dist, curve.length - (b.dist - a.dist));
    if (arcSep < 25) continue;
    const horiz = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    const gap = horiz - (a.halfWidth + b.halfWidth);
    const dy = Math.abs(a.pos.y - b.pos.y);
    if (gap < 0.5) {
      if (dy < 3) {
        hard++;
        worst = `d=${a.dist.toFixed(0)}/${b.dist.toFixed(0)} gap=${gap.toFixed(2)} dy=${dy.toFixed(1)}`;
      } else stacked++;
    } else if (gap < 2) near++;
  }
}

// --- kinks / grade / bank / elevation ---
let kinkMax = 0;
let kinkAt = -1;
const head = fr.map((f) => Math.atan2(f.tangent.x, f.tangent.z));
for (let i = 0; i < n; i++) {
  let d = head[(i + 1) % n] - head[i];
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) > kinkMax) {
    kinkMax = Math.abs(d);
    kinkAt = i;
  }
}
let maxGrade = 0;
let gradeAt = -1;
let maxY = -99;
let minY = 99;
let maxBank = 0;
for (let i = 0; i < n; i++) {
  const a = fr[i];
  const b = fr[(i + 1) % n];
  const dd = b.dist - a.dist;
  if (dd > 0) {
    const g = Math.abs(b.pos.y - a.pos.y) / dd;
    if (g > maxGrade) {
      maxGrade = g;
      gradeAt = i;
    }
  }
  maxY = Math.max(maxY, a.pos.y);
  minY = Math.min(minY, a.pos.y);
  maxBank = Math.max(maxBank, Math.abs(Math.acos(Math.max(-1, Math.min(1, a.normal.y)))));
}

// --- seam: approach gap vs start straight (geo-seam math) ---
let minGap = 99;
let at = -1;
for (let i = n - 1; i > 0; i--) {
  const f = fr[i];
  if (curve.length - f.dist > 90) break;
  for (let j = 0; j < Math.floor(40 / 1.2); j++) {
    const g = fr[j];
    const horiz = Math.hypot(f.pos.x - g.pos.x, f.pos.z - g.pos.z);
    const gap = horiz - (f.halfWidth + g.halfWidth);
    if (gap < minGap) {
      minGap = gap;
      at = f.dist;
    }
  }
}

console.log(
  `${id}: len=${curve.length.toFixed(0)}m frames=${n} y=[${minY.toFixed(1)}..${maxY.toFixed(1)}] ` +
    `kink=${((kinkMax * 180) / Math.PI).toFixed(1)}deg@d${fr[kinkAt].dist.toFixed(0)} grade=${(maxGrade * 100).toFixed(0)}%@d${fr[gradeAt].dist.toFixed(0)} bank=${((maxBank * 180) / Math.PI).toFixed(0)}deg`,
);
console.log(`  overlaps: hard-same-level=${hard} ${worst} | stacked-cross=${stacked} | near=${near} | seamApproachGap=${minGap.toFixed(1)}@d${at.toFixed(0)}`);

// --- autopilot lap (laps.ts loop) ---
const car = new CarPhysics(curve, BODY_TUNING.standard);
const save = new SaveManager();
const events: string[] = [];
const race = new RaceController(car, curve, def, save, (ev) => events.push(ev));
race.start();
car.placeAtFrame(0, 8);
race.countdownMs = 1;
const simDt = 1 / 120;
const ap = { smooth: 0 };
let wall = 0;
let finished = false;
let pendingRespawn = false;
let recover = 0;
let recoverDir = 1;
let stuck = 0;
let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
let minSpeed = 99;
const speedLog: { s: number; d: number }[] = [];
while (wall < 150000) {
  if (pendingRespawn) {
    race.respawnAtCheckpoint();
    pendingRespawn = false;
  }
  race.update(simDt * 1000, input);
  wall += simDt * 1000;
  if (race.phase === 'finished') {
    finished = true;
    break;
  }
  if (recover > 0) {
    recover -= 1;
    input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
    if (recover === 0) ap.smooth = 0;
    continue;
  }
  const r = autopilotDrive(car, curve, simDt, ap);
  pendingRespawn = !!r.respawn;
  const speedNow = car.state.speed;
  const latNow = car.state.lateral;
  if (speedNow < minSpeed) minSpeed = speedNow;
  if (Math.floor(car.state.trackDist / 25) !== Math.floor((car.state.trackDist - car.state.speed * simDt) / 25)) {
    speedLog.push({ d: Math.round(car.state.trackDist), s: Math.round(speedNow * 3.6) });
  }
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
    drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false,
  };
}
console.log(
  finished
    ? `  LAP PASS ${(race.elapsedMs / 1000).toFixed(2)}s minSpeed=${minSpeed.toFixed(1)}m/s events=[${events.join(',')}] respawns≈${speedLog.length}`
    : '  LAP FAIL: DID NOT FINISH',
);
if (!finished) {
  console.log(`  final: dist=${car.state.trackDist.toFixed(0)}/${curve.length.toFixed(0)} lap=${race.lapsDone} speed=${car.state.speed.toFixed(1)} lat=${car.state.lateral.toFixed(1)}`);
}
console.log(`  speed(km/h) every 25m: ${speedLog.map((p) => `${p.d}:${p.s}`).join(' ')}`);
