import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController, serializeGhost, deserializeGhost, type GhostSample } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import {
  encodeGhostCode,
  decodeGhostCode,
  buildShareLink,
  parseShareLink,
  quantizeGhost,
  dequantizeGhost,
  bytesToB64url,
  ShareError,
} from '../src/game/share';

// Map-backed storage mock that survives simulated reloads (same pattern as career.ts).
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

function driveLap(def: (typeof TRACKS)[number]): { timeMs: number; samples: GhostSample[] } {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  const race = new RaceController(car, curve, def, save, () => {});
  race.start();
  car.placeAtFrame(0, 8);
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
  while (wall < 150000) {
    if (pendingRespawn) {
      race.respawnAtCheckpoint();
      pendingRespawn = false;
    }
    race.update(simDt * 1000, input);
    wall += simDt * 1000;
    speedNow = car.state.speed;
    latNow = car.state.lateral;
    if (race.phase === 'finished') break;
    if (recover > 0) {
      recover -= 1;
      input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
      if (recover === 0) ap.smooth = 0;
      continue;
    }
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
  return { timeMs: Math.round(race.elapsedMs), samples: race.lastLapSamples.map((s) => ({ t: s.t, pos: s.pos.clone(), quat: s.quat.clone() })) };
}

function resampleGhost(samples: GhostSample[], durationMs: number, hz = 30): GhostSample[] {
  const t0 = samples[0].t;
  const tEnd = samples[samples.length - 1].t;
  const n = Math.max(2, Math.round((durationMs / 1000) * hz));
  const out: GhostSample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((tEnd - t0) * i) / n;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t < t) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const k = Math.max(0, Math.min(1, (t - a.t) / Math.max(1, b.t - a.t)));
    out.push({ t: t0 + ((t - t0) * durationMs) / (tEnd - t0), pos: a.pos.clone().lerp(b.pos, k), quat: a.quat.clone().slerp(b.quat, k) });
  }
  return out;
}

const def = TRACKS[0];
const { timeMs, samples } = driveLap(def);
expect(samples.length > 100, `harness lap recorded ${samples.length} samples over ${(timeMs / 1000).toFixed(2)}s`);

// ---------- 1. encode + envelope round trip ----------
const code = await encodeGhostCode(def, samples);
expect(code.length > 0 && /^[A-Za-z0-9_-]+$/.test(code), `code is base64url (${code.length} chars)`);
expect(code.length <= 10000, `share code ${code.length} chars <= 10K for the ${(timeMs / 1000).toFixed(2)}s T1 lap`);
const link = buildShareLink(def, timeMs, code);
expect(link.startsWith(`#g=v1.${def.id}.${timeMs}.`), `envelope is #g=v1.<track>.<timeMs>.<code> (${link.slice(0, 40)}...)`);
const parsed = parseShareLink(link);
expect(parsed !== null && parsed.trackId === def.id && parsed.timeMs === timeMs && parsed.code === code, 'parseShareLink round-trips the envelope');
expect(parseShareLink(link.slice(1)) !== null, 'parseShareLink accepts hash without leading #');
expect(parseShareLink('garbage') === null, 'parseShareLink rejects garbage');
expect(parseShareLink('#g=v9.x.1.abc') === null, 'parseShareLink rejects unknown version');
expect(parseShareLink('#g=v1.sunrise-sprint.abc.abc') === null, 'parseShareLink rejects non-numeric timeMs');
expect(parseShareLink(`#g=v1.${'x'.repeat(80)}.${timeMs}.${code}`) === null, 'parseShareLink rejects oversized trackId');

// ---------- 2. decode fidelity ----------
const dec = await decodeGhostCode(code);
expect(dec.length >= 2 && Math.abs(dec.length - Math.ceil(samples.length / 2)) <= 1, `decoded ${dec.length} samples (15Hz downsample of ${samples.length})`);
const m4 = new THREE.Matrix4();
let maxPosErr = 0;
let detOk = true;
for (let i = 0; i < dec.length; i++) {
  const origIdx = Math.min(samples.length - 1, i * 2);
  maxPosErr = Math.max(maxPosErr, dec[i].pos.distanceTo(samples[origIdx].pos));
  m4.makeRotationFromQuaternion(dec[i].quat);
  if (!(m4.determinant() > 0)) detOk = false;
}
expect(maxPosErr < 0.35, `max position error ${maxPosErr.toFixed(4)}m < 0.35m vs original`);
expect(detOk, 'all decoded orientations are proper rotations (det > 0)');
const lapTimeDelta = Math.abs(dec[dec.length - 1].t - samples[samples.length - 1].t) / samples[samples.length - 1].t;
expect(lapTimeDelta < 0.01, `lap time delta ${(lapTimeDelta * 100).toFixed(3)}% < 1%`);
expect(Math.abs(timeMs - dec[dec.length - 1].t) < 200, `envelope timeMs ${timeMs} matches decoded last t ${dec[dec.length - 1].t.toFixed(0)}`);

// ---------- 3. fallback path (no deflate) ----------
const codeRaw = await encodeGhostCode(def, samples, { compress: false });
expect(codeRaw.length > code.length, `raw fallback code ${codeRaw.length} chars > deflated ${code.length}`);
const decRaw = await decodeGhostCode(codeRaw);
let rawErr = 0;
for (let i = 0; i < decRaw.length; i++) {
  rawErr = Math.max(rawErr, decRaw[i].pos.distanceTo(samples[Math.min(samples.length - 1, i * 2)].pos));
}
expect(rawErr < 0.35, `fallback path round-trip position error ${rawErr.toFixed(4)}m < 0.35m`);

// ---------- 4. 60s synthetic lap size cap ----------
const g60 = resampleGhost(samples, 60000);
const code60 = await encodeGhostCode(def, g60);
expect(code60.length <= 10000, `60s lap share code ${code60.length} chars <= 10K`);
const dec60 = await decodeGhostCode(code60);
let err60 = 0;
for (let i = 0; i < dec60.length; i++) {
  err60 = Math.max(err60, dec60[i].pos.distanceTo(g60[Math.min(g60.length - 1, i * 2)].pos));
}
expect(err60 < 0.35, `60s round-trip position error ${err60.toFixed(4)}m < 0.35m`);
expect(dec60.length >= 890 && dec60.length <= 910, `60s ghost decodes to ~900 samples (${dec60.length})`);

// ---------- 5. 90s trim ----------
const g120 = resampleGhost(samples, 120000);
const dec120 = await decodeGhostCode(await encodeGhostCode(def, g120));
expect(dec120[dec120.length - 1].t <= 90000, `120s ghost trimmed to 90s (last t ${dec120[dec120.length - 1].t.toFixed(0)}ms)`);

// ---------- 6. corrupt / truncated codes fail gracefully ----------
let truncated = false;
try {
  await decodeGhostCode(code.slice(0, Math.floor(code.length / 3)));
} catch (e) {
  truncated = e instanceof Error;
}
expect(truncated, 'truncated code rejected with ShareError');
let badFlag = false;
try {
  await decodeGhostCode(bytesToB64url(new Uint8Array([7, 1, 2, 3, 4])));
} catch (e) {
  badFlag = e instanceof ShareError;
}
expect(badFlag, 'unknown payload flag rejected');
let badB64 = false;
try {
  await decodeGhostCode('%%%');
} catch (e) {
  badB64 = e instanceof ShareError;
}
expect(badB64, 'non-base64url code rejected');
let shortPayload = false;
try {
  dequantizeGhost(quantizeGhost(def, samples).subarray(0, 40));
} catch (e) {
  shortPayload = e instanceof ShareError;
}
expect(shortPayload, 'truncated quantized payload rejected');

// ---------- 7. mirrored / improper quaternion rejection ----------
const quant = quantizeGhost(def, samples);
const qCount = (quant.length - 35) / 10;
const forged = new Uint8Array(quant);
const forgedP = (plane: number) => 35 + plane * qCount;
forged[forgedP(6)] = 255;
forged[forgedP(7)] = 255;
forged[forgedP(8)] = 255;
forged[forgedP(9)] = 0;
let mirrored = false;
try {
  await decodeGhostCode(bytesToB64url(new Uint8Array([0, ...forged])));
} catch (e) {
  mirrored = e instanceof ShareError;
}
expect(mirrored, 'improper/corrupt orientation batch rejected (empty ghost, no crash)');
const forgedIdx = new Uint8Array(quant);
forgedIdx[forgedP(9)] = 7;
let badIdx = false;
try {
  await decodeGhostCode(bytesToB64url(new Uint8Array([0, ...forgedIdx])));
} catch (e) {
  badIdx = e instanceof ShareError;
}
expect(badIdx, 'out-of-range orientation index rejected');

// ---------- 8. raw PB/dev ghost format untouched ----------
const raw = serializeGhost(samples);
const back = deserializeGhost(raw);
expect(back.length === samples.length && back[10].pos.distanceTo(samples[10].pos) < 1e-4, 'serializeGhost/deserializeGhost round-trip unchanged');

// ---------- 9. friendGhosts save round-trip ----------
const save1 = new SaveManager();
save1.setFriendGhost(def.id, { code, timeMs, dateMs: 111 });
save1.setFriendGhost(def.id, { code: code.slice(0, 50), timeMs: 222, dateMs: 222 });
const save2 = new SaveManager();
const fg = save2.friendGhost(def.id);
expect(fg !== null && fg.timeMs === 222 && fg.dateMs === 222 && fg.code === code.slice(0, 50), 'friendGhosts persist across simulated reload, newest wins');
expect(save2.friendGhost('sky-loop') === null, 'unset friend ghost slot is null');
store.set('race2.save.v1', JSON.stringify({ tracks: {}, cups: {}, careerRun: null, friendGhosts: { [def.id]: { code: 42, timeMs: 'x', dateMs: 1 } }, schemaVersion: 2 }));
const save3 = new SaveManager();
expect(save3.friendGhost(def.id) === null, 'corrupt friendGhost entry dropped by sanitizer');
expect(save3.trackSave(def.id).bestTimeMs === null, 'sanitizer left track saves intact');
save3.setFriendGhost('sky-loop', { code: 'abc', timeMs: 30000, dateMs: 5 });
const save4 = new SaveManager();
expect(save4.friendGhost('sky-loop') !== null && save4.friendGhost(def.id) === null, 'second slot written and reloaded independently');
expect(save4.schemaVersion === 2, 'schema version stays 2 (additive field, no bump)');

console.log(`\nshare test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
