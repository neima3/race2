import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeCurbZones } from '../track/builder';
import type { TrackCurve, TrackFrame } from '../track/curve';
import type { ThemeId } from '../track/defs';
import { GROUND_Y, seededRandom } from './terrain';

type Rng = () => number;

interface PropXf {
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
  syK: number;
  cr: number;
  cg: number;
  cb: number;
}

interface Anchor {
  x: number;
  z: number;
}

const SOLID_MIN_CLEAR = 6.5;
const SCATTER_MIN_CLEAR = 2.8;

function hdr(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

function mergeColored(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

function coneAt(r: number, h: number, x: number, y: number, z: number, seg = 7): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

function paintByHeight(geo: THREE.BufferGeometry, splitY: number, below: number, above: number, rng: Rng): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.set(pos.getY(i) < splitY ? below : above).multiplyScalar(0.85 + rng() * 0.3);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function paintFlat(geo: THREE.BufferGeometry, col: THREE.Color, rng: Rng, jitter = 0.08): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (rng() - 0.5) * jitter * 2;
    colors[i * 3] = col.r * k;
    colors[i * 3 + 1] = col.g * k;
    colors[i * 3 + 2] = col.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function paintStrata(geo: THREE.BufferGeometry, tones: number[], bandH: number, rng: Rng): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    c.set(tones[Math.abs(Math.floor(y / bandH)) % tones.length]).multiplyScalar(0.9 + rng() * 0.18);
    for (let v = 0; v < 3; v++) {
      colors[(i + v) * 3] = c.r;
      colors[(i + v) * 3 + 1] = c.g;
      colors[(i + v) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ---------------------------------------------------------------- geometry variants

const BROWN = 0x5a4630;
const PINE_GREEN = 0x3f6b3a;
const STRATA = [0x7a4a30, 0x9c6a48, 0x6e4028, 0xa5754f];
const NEON_ACCENTS = [0x36f0ff, 0xff3dd2, 0xffd23d, 0x9dff3d, 0xff8a3d];

function pineTall(rng: Rng): THREE.BufferGeometry {
  const g = mergeParts([
    cyl(0.16, 0.3, 2.6, 0, 0, 0, 6),
    coneAt(1.6, 2.8, 0, 2.4, 0),
    coneAt(1.15, 2.3, 0, 4.1, 0),
    coneAt(0.72, 1.9, 0, 5.6, 0),
  ]);
  return paintByHeight(g, 2.6, BROWN, PINE_GREEN, rng);
}

function pineShort(rng: Rng): THREE.BufferGeometry {
  const g = mergeParts([
    cyl(0.18, 0.32, 1.9, 0, 0, 0, 6),
    coneAt(1.5, 2.4, 0, 1.7, 0),
    coneAt(1.0, 1.9, 0, 3.3, 0),
  ]);
  return paintByHeight(g, 1.9, BROWN, PINE_GREEN, rng);
}

function pineDouble(rng: Rng): THREE.BufferGeometry {
  const a = mergeParts([
    cyl(0.14, 0.26, 2.2, -0.55, 0, 0.1, 6),
    coneAt(1.15, 2.2, -0.55, 2.0, 0.1),
    coneAt(0.75, 1.8, -0.55, 3.5, 0.1),
  ]);
  paintByHeight(a, 2.2, BROWN, PINE_GREEN, rng);
  const b = mergeParts([
    cyl(0.14, 0.26, 1.7, 0.55, 0, -0.15, 6),
    coneAt(1.0, 1.9, 0.55, 1.5, -0.15),
    coneAt(0.62, 1.5, 0.55, 2.8, -0.15),
  ]);
  paintByHeight(b, 1.7, BROWN, PINE_GREEN, rng);
  return mergeColored([a, b]);
}

function saguaro(rng: Rng): THREE.BufferGeometry {
  const armL = new THREE.CylinderGeometry(0.2, 0.22, 1.3, 6);
  armL.rotateZ(1.1);
  armL.translate(-0.75, 1.9, 0);
  const armR = new THREE.CylinderGeometry(0.2, 0.22, 1.1, 6);
  armR.rotateZ(-1.2);
  armR.translate(0.7, 1.5, 0);
  const g = mergeParts([cyl(0.32, 0.4, 3.4, 0, 0, 0), armL, armR]);
  return paintByHeight(g, 1e9, 0x4f7a44, 0x4f7a44, rng);
}

function joshua(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [cyl(0.22, 0.34, 1.8, 0, 0, 0, 6)];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.IcosahedronGeometry(0.65 + rng() * 0.35, 0);
    const a = (i / 5) * Math.PI * 2;
    b.translate(Math.cos(a) * 0.8, 2.1 + rng() * 0.5, Math.sin(a) * 0.8);
    parts.push(b);
  }
  const g = mergeParts(parts);
  return paintByHeight(g, 1.8, 0x6a4f34, 0x7d9a4f, rng);
}

function barrelCluster(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number][] = [
    [0, 0, 0.42],
    [0.75, 0.2, 0.32],
    [-0.55, -0.38, 0.27],
  ];
  for (const [x, z, r] of spots) {
    const s = 0.8 + rng() * 0.5;
    parts.push(cyl(r * s, r * s * 1.12, 0.85 * s, x, 0, z, 9));
    const top = new THREE.SphereGeometry(r * s, 9, 4);
    top.scale(1, 0.5, 1);
    top.translate(x, 0.85 * s, z);
    parts.push(top);
  }
  const g = mergeParts(parts);
  return paintByHeight(g, 1e9, 0x5e8a48, 0x5e8a48, rng);
}

function spireThin(rng: Rng): THREE.BufferGeometry {
  const g = mergeParts([
    cyl(0.95, 1.35, 2.8, 0, 0, 0),
    cyl(0.62, 0.98, 2.4, 0.12, 2.7, -0.06),
    cyl(0.3, 0.66, 2.0, -0.08, 5.0, 0.1),
  ]);
  return paintStrata(g, STRATA, 1.7, rng);
}

function spireWide(rng: Rng): THREE.BufferGeometry {
  const g = mergeParts([
    cyl(1.7, 2.3, 3.0, 0, 0, 0, 9),
    cyl(1.15, 1.75, 2.6, 0.1, 2.9, 0, 9),
    cyl(0.7, 1.2, 1.6, -0.05, 5.4, 0, 9),
  ]);
  return paintStrata(g, STRATA, 1.9, rng);
}

function spireTwin(rng: Rng): THREE.BufferGeometry {
  const a = mergeParts([cyl(0.7, 1.0, 3.2, -0.75, 0, 0), cyl(0.4, 0.75, 2.6, -0.7, 3.1, 0.05)]);
  paintStrata(a, STRATA, 1.6, rng);
  const b = mergeParts([cyl(0.55, 0.85, 2.4, 0.85, 0, 0.15), cyl(0.3, 0.6, 1.8, 0.9, 2.3, -0.05)]);
  paintStrata(b, STRATA, 1.6, rng);
  return mergeColored([a, b]);
}

function pylon(rng: Rng): THREE.BufferGeometry {
  const g = mergeParts([boxAt(0.3, 5.2, 0.3, 0, 2.6, 0), boxAt(0.9, 0.5, 0.9, 0, 5.2, 0)]);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const lamp = hdr(0x36f0ff, 1.5);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 4.6) c.copy(lamp);
    else c.set(0x1a2030).multiplyScalar(0.9 + rng() * 0.2);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function pylonGate(rng: Rng): THREE.BufferGeometry {
  const frame = mergeParts([
    boxAt(0.26, 4.6, 0.26, -1.9, 2.3, 0),
    boxAt(0.26, 4.6, 0.26, 1.9, 2.3, 0),
    boxAt(4.3, 0.42, 0.3, 0, 4.72, 0),
  ]);
  paintFlat(frame, new THREE.Color(0x1a2030), rng, 0.14);
  const sL = paintFlat(boxAt(0.34, 1.5, 0.1, -0.85, 3.85, 0.12), hdr(0xff3dd2, 1.5), rng, 0.06);
  const sR = paintFlat(boxAt(0.34, 1.5, 0.1, 0.85, 3.85, 0.12), hdr(0x36f0ff, 1.5), rng, 0.06);
  return mergeColored([frame, sL, sR]);
}

function lightPole(rng: Rng): THREE.BufferGeometry {
  const pole = mergeParts([cyl(0.06, 0.1, 5.6, 0, 0, 0, 6), boxAt(0.09, 0.09, 1.25, 0, 5.42, 0.62)]);
  paintFlat(pole, new THREE.Color(0x232c42), rng, 0.14);
  const lamp = paintFlat(boxAt(0.36, 0.12, 0.55, 0, 5.32, 1.05), hdr(0x9defff, 1.7), rng, 0.06);
  return mergeColored([pole, lamp]);
}

function signWide(rng: Rng): THREE.BufferGeometry {
  const frame = mergeParts([
    boxAt(4.6, 2.3, 0.16, 0, 3.1, 0),
    boxAt(0.16, 3.1, 0.16, -2.0, 1.55, 0),
    boxAt(0.16, 3.1, 0.16, 2.0, 1.55, 0),
  ]);
  paintFlat(frame, new THREE.Color(0x10131f), rng, 0.15);
  const parts: THREE.BufferGeometry[] = [frame];
  for (let i = 0; i < 3; i++) {
    const a = hdr(NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)], 1.2 + rng() * 0.5);
    parts.push(paintFlat(boxAt(3.9 - rng() * 0.9, 0.36, 0.06, (rng() - 0.5) * 0.5, 2.35 + i * 0.75, 0.12), a, rng, 0.06));
  }
  return mergeColored(parts);
}

function signTall(rng: Rng): THREE.BufferGeometry {
  const frame = mergeParts([
    boxAt(1.9, 3.5, 0.16, 0, 3.35, 0),
    boxAt(0.16, 3.3, 0.16, -0.7, 1.65, 0),
    boxAt(0.16, 3.3, 0.16, 0.7, 1.65, 0),
  ]);
  paintFlat(frame, new THREE.Color(0x10131f), rng, 0.15);
  const parts: THREE.BufferGeometry[] = [
    frame,
    paintFlat(boxAt(0.42, 2.9, 0.06, (rng() - 0.5) * 0.6, 3.35, 0.12), hdr(NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)], 1.35), rng, 0.06),
  ];
  for (let i = 0; i < 4; i++) {
    const a = hdr(NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)], 1.2 + rng() * 0.5);
    parts.push(paintFlat(boxAt(0.3, 0.3, 0.06, i % 2 === 0 ? -0.45 : 0.35, 2.4 + Math.floor(i / 2) * 0.95, 0.12), a, rng, 0.06));
  }
  return mergeColored(parts);
}

function signDuo(rng: Rng): THREE.BufferGeometry {
  const frame = mergeParts([
    boxAt(0.18, 4.5, 0.18, 0, 2.25, 0),
    boxAt(2.2, 1.4, 0.14, 0, 1.85, 0),
    boxAt(2.2, 1.4, 0.14, 0.15, 3.55, 0),
  ]);
  paintFlat(frame, new THREE.Color(0x10131f), rng, 0.15);
  const a1 = hdr(NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)], 1.3);
  const a2 = hdr(NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)], 1.3);
  return mergeColored([
    frame,
    paintFlat(boxAt(1.7, 0.5, 0.06, 0, 1.85, 0.1), a1, rng, 0.06),
    paintFlat(boxAt(1.7, 0.5, 0.06, 0.15, 3.55, 0.1), a2, rng, 0.06),
  ]);
}

// ---------------------------------------------------------------- scatter geometry

function tuftGeo(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.ConeGeometry(0.09 + rng() * 0.05, 0.35 + rng() * 0.3, 5);
    g.rotateZ((rng() - 0.5) * 0.55);
    g.rotateX((rng() - 0.5) * 0.55);
    g.translate((rng() - 0.5) * 0.5, 0.16, (rng() - 0.5) * 0.5);
    parts.push(g);
  }
  return mergeParts(parts);
}

function scrubGeo(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.IcosahedronGeometry(0.26 + rng() * 0.12, 0);
    g.scale(1, 0.55, 1);
    g.translate((rng() - 0.5) * 0.6, 0.14, (rng() - 0.5) * 0.6);
    parts.push(g);
  }
  for (let i = 0; i < 2; i++) {
    parts.push(coneAt(0.1, 0.3 + rng() * 0.2, (rng() - 0.5) * 0.55, 0, (rng() - 0.5) * 0.55, 5));
  }
  return mergeParts(parts);
}

function pebbleGeo(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(0.2 + rng() * 0.14, 0);
    g.scale(1, 0.6 + rng() * 0.3, 1);
    g.translate((rng() - 0.5) * 0.7, 0.08, (rng() - 0.5) * 0.7);
    parts.push(g);
  }
  return mergeParts(parts);
}

function dotGeo(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(0.34, 8);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------- placement

function nearestFrame(curve: TrackCurve, x: number, z: number): TrackFrame {
  const frames = curve.frames;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const dx = f.pos.x - x;
    const dz = f.pos.z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return frames[best];
}

function frameAt(curve: TrackCurve, dist: number): TrackFrame {
  const f: TrackFrame = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
    halfWidth: 0,
    dist: 0,
  };
  curve.frameAtDist(dist, f);
  return f;
}

/** Embankment/shoulder surface height at a lateral offset from the road edge. */
function shoulderY(f: TrackFrame, lat: number): number {
  const drop = Math.max(0, f.pos.y - GROUND_Y);
  return f.pos.y - Math.min(drop, Math.max(0, (lat - 0.55) / 1.3));
}

function yawToward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

function pickWeighted(rng: Rng, w: number[]): number {
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

/** Best-candidate (blue-noise) cluster anchors hugging the track corridor. */
function clusterAnchors(rng: Rng, curve: TrackCurve, count: number, minSep: number): Anchor[] {
  const frames = curve.frames;
  const out: Anchor[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    let bx = 0;
    let bz = 0;
    let bestScore = -1;
    for (let k = 0; k < 10; k++) {
      const f = frames[Math.floor(rng() * frames.length)];
      if (f.dist < 20 || f.dist > curve.length - 20) continue;
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * (f.halfWidth + 12 + rng() * 55);
      const x = f.pos.x + f.binormal.x * lat;
      const z = f.pos.z + f.binormal.z * lat;
      const nf = nearestFrame(curve, x, z);
      if (Math.hypot(x - nf.pos.x, z - nf.pos.z) < nf.halfWidth + 9) continue;
      let score = Infinity;
      for (const a of out) {
        const d = Math.hypot(a.x - x, a.z - z);
        if (d < score) score = d;
      }
      if (score > bestScore) {
        bestScore = score;
        bx = x;
        bz = z;
      }
    }
    if (bestScore < 0 || (out.length > 0 && bestScore < minSep)) continue;
    out.push({ x: bx, z: bz });
  }
  return out;
}

function scatterCluster(
  rng: Rng,
  curve: TrackCurve,
  a: Anchor,
  R: number,
  n: number,
  faceRoad: boolean,
): PropXf[] {
  const out: PropXf[] = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 6) {
    const rr = R * ((rng() + rng()) / 2);
    const th = rng() * Math.PI * 2;
    const x = a.x + Math.cos(th) * rr;
    const z = a.z + Math.sin(th) * rr;
    const f = nearestFrame(curve, x, z);
    if (Math.hypot(x - f.pos.x, z - f.pos.z) < f.halfWidth + SOLID_MIN_CLEAR) continue;
    const shade = 0.92 + rng() * 0.16;
    out.push({
      x,
      y: GROUND_Y - 0.15,
      z,
      rot: faceRoad ? yawToward(x, z, f.pos.x, f.pos.z) : rng() * Math.PI * 2,
      s: 0.7 + rng() * 0.7,
      syK: 0.9 + rng() * 0.25,
      cr: shade,
      cg: shade,
      cb: shade,
    });
  }
  return out;
}

function solitaryProps(rng: Rng, curve: TrackCurve, target: number, faceRoad: boolean): PropXf[] {
  const out: PropXf[] = [];
  const frames = curve.frames;
  let guard = 0;
  while (out.length < target && guard++ < target * 12) {
    const f = frames[Math.floor(rng() * frames.length)];
    if (f.dist < 20 || f.dist > curve.length - 20) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const lat = side * (f.halfWidth + 8 + rng() * 48);
    const x = f.pos.x + f.binormal.x * lat;
    const z = f.pos.z + f.binormal.z * lat;
    const nf = nearestFrame(curve, x, z);
    if (Math.hypot(x - nf.pos.x, z - nf.pos.z) < nf.halfWidth + SOLID_MIN_CLEAR) continue;
    const shade = 0.92 + rng() * 0.16;
    out.push({
      x,
      y: GROUND_Y - 0.15,
      z,
      rot: faceRoad ? yawToward(x, z, nf.pos.x, nf.pos.z) : rng() * Math.PI * 2,
      s: 0.7 + rng() * 0.7,
      syK: 0.9 + rng() * 0.25,
      cr: shade,
      cg: shade,
      cb: shade,
    });
  }
  return out;
}

const SCATTER_PALETTE: Record<ThemeId, number[]> = {
  alpine: [0x5d8a46, 0x6f9a52, 0x4e7a40, 0x86a05a],
  mesa: [0x8a8a4e, 0x9a8a56, 0x6f7a42, 0xa2925e],
  canyon: [0x8a5638, 0x9c6a48, 0x7a4a30, 0xa5754f],
  neon: [0x36f0ff, 0xff3dd2, 0xffd23d, 0x9dff3d, 0xff8a3d],
};

function scatterTint(rng: Rng, theme: ThemeId): { cr: number; cg: number; cb: number } {
  const c = new THREE.Color(SCATTER_PALETTE[theme][Math.floor(rng() * SCATTER_PALETTE[theme].length)]);
  c.multiplyScalar(theme === 'neon' ? 1.25 + rng() * 0.55 : 0.88 + rng() * 0.28);
  return { cr: c.r, cg: c.g, cb: c.b };
}

function buildScatterXfs(rng: Rng, curve: TrackCurve, anchors: Anchor[], R: number, target: number, theme: ThemeId): PropXf[] {
  const out: PropXf[] = [];
  const y = GROUND_Y + (theme === 'neon' ? 0.035 : 0.02);
  const push = (x: number, z: number): boolean => {
    const f = nearestFrame(curve, x, z);
    if (Math.hypot(x - f.pos.x, z - f.pos.z) < f.halfWidth + SCATTER_MIN_CLEAR) return false;
    const t = scatterTint(rng, theme);
    out.push({ x, y, z, rot: rng() * Math.PI * 2, s: 0.7 + rng() * 0.8, syK: 0.85 + rng() * 0.4, ...t });
    return true;
  };
  const perCluster = Math.floor(target * 0.5 / Math.max(1, anchors.length));
  for (const a of anchors) {
    let placed = 0;
    let guard = 0;
    while (placed < perCluster && guard++ < perCluster * 6) {
      const rr = (R + 12) * ((rng() + rng()) / 2);
      const th = rng() * Math.PI * 2;
      if (push(a.x + Math.cos(th) * rr, a.z + Math.sin(th) * rr)) placed++;
    }
  }
  const lines = theme === 'neon' ? 6 : 8;
  const perLine = Math.max(6, Math.floor((target - out.length) / lines));
  const frames = curve.frames;
  for (let l = 0; l < lines; l++) {
    let f = frames[Math.floor(rng() * frames.length)];
    let tries = 0;
    while ((f.dist < 25 || f.dist > curve.length - 25) && tries++ < 20) {
      f = frames[Math.floor(rng() * frames.length)];
    }
    const side = rng() < 0.5 ? -1 : 1;
    const baseLat = f.halfWidth + (theme === 'neon' ? 3.2 + rng() * 2.5 : 4 + rng() * 14);
    const yaw = Math.atan2(f.tangent.x, f.tangent.z) + (rng() - 0.5) * 1.2;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const jit = theme === 'neon' ? 1.0 : 4.5;
    const step = theme === 'neon' ? 4.5 : 3 + rng() * 2;
    let px = f.pos.x + f.binormal.x * side * baseLat;
    let pz = f.pos.z + f.binormal.z * side * baseLat;
    for (let k = 0; k < perLine; k++) {
      px += dx * step + -dz * (rng() - 0.5) * jit * 2;
      pz += dz * step + dx * (rng() - 0.5) * jit * 2;
      push(px, pz);
    }
  }
  return out;
}

function fillInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, xfs: PropXf[], castShadow: boolean): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, xfs.length);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  for (let i = 0; i < xfs.length; i++) {
    const t = xfs[i];
    d.position.set(t.x, t.y, t.z);
    d.rotation.set(0, t.rot, 0);
    d.scale.set(t.s, t.s * t.syK, t.s);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, c.setRGB(t.cr, t.cg, t.cb));
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = castShadow;
  return im;
}

// ---------------------------------------------------------------- theme configs

interface ThemePropConf {
  clusters: number;
  R: number;
  per: number;
  minSep: number;
  scatter: number;
}

const CONF: Record<ThemeId, ThemePropConf> = {
  alpine: { clusters: 15, R: 30, per: 18, minSep: 55, scatter: 300 },
  mesa: { clusters: 13, R: 27, per: 16, minSep: 55, scatter: 300 },
  canyon: { clusters: 12, R: 31, per: 15, minSep: 62, scatter: 280 },
  neon: { clusters: 11, R: 21, per: 12, minSep: 58, scatter: 320 },
};

// ---------------------------------------------------------------- start-line kit

function makeBillboardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0d1222';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#29e6ff';
  ctx.font = '900 120px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RACE2', 256, 118);
  ctx.font = '700 30px Rajdhani, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('TIME ATTACK', 256, 205);
  return new THREE.CanvasTexture(c);
}

function buildStartKit(curve: TrackCurve, rng: Rng, quality: 'low' | 'medium' | 'high'): THREE.Group {
  const g = new THREE.Group();
  const f0 = curve.frames[0];
  const standLat = f0.halfWidth + 14;
  const baseY = shoulderY(f0, standLat);
  const yaw0 = Math.atan2(f0.tangent.x, f0.tangent.z);
  const px = f0.pos.x + f0.binormal.x * -standLat + f0.normal.x * 0.2;
  const pz = f0.pos.z + f0.binormal.z * -standLat + f0.normal.z * 0.2;

  const structGeos: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 4; r++) {
    const row = boxAt(26, 0.8, 1.6, 0, 0.5 + r * 0.8, -r * 1.7);
    row.rotateY(yaw0);
    row.translate(px, baseY, pz);
    structGeos.push(row);
  }

  const faceGeos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const bbTex = makeBillboardTexture();
  const sites: [number, number][] = [
    [14, 1],
    [-curve.length * 0.45, -1],
  ];
  for (const [dist, side] of sites) {
    const f = frameAt(curve, dist);
    const lat = side * (f.halfWidth + 10);
    const bx = f.pos.x + f.binormal.x * lat;
    const bz = f.pos.z + f.binormal.z * lat;
    const gy = shoulderY(f, Math.abs(lat));
    const faceGeo = new THREE.PlaneGeometry(7, 3.5);
    eye.set(bx, gy + 3, bz);
    tgt.set(f.pos.x + f.binormal.x * side * f.halfWidth, f.pos.y + 1.5, f.pos.z + f.binormal.z * side * f.halfWidth);
    m.lookAt(tgt, eye, up);
    faceGeo.applyMatrix4(m);
    faceGeo.translate(bx, gy + 3, bz);
    faceGeos.push(faceGeo);
    structGeos.push(boxAt(0.3, 3, 0.3, bx, gy + 1.5, bz));
  }

  const structMesh = new THREE.Mesh(mergeColored(structGeos), new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.9 }));
  structMesh.castShadow = quality !== 'low';
  g.add(structMesh);

  const faces = new THREE.Mesh(
    mergeColored(faceGeos),
    new THREE.MeshBasicMaterial({ map: bbTex, side: THREE.DoubleSide }),
  );
  g.add(faces);

  const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 5, 4), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 104);
  const cd = new THREE.Object3D();
  const palette = [0x29e6ff, 0xffb52e, 0xff4d6d, 0x7dff6e, 0xffffff].map((h) => new THREE.Color(h));
  const v = new THREE.Vector3();
  let n = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 26; c++) {
      v.set(-12 + c, 1.15 + r * 0.8, -r * 1.7).applyAxisAngle(up, yaw0);
      cd.position.set(px + v.x, baseY + v.y, pz + v.z);
      cd.updateMatrix();
      crowd.setMatrixAt(n, cd.matrix);
      crowd.setColorAt(n, palette[Math.floor(rng() * palette.length)]);
      n++;
    }
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  crowd.computeBoundingSphere();
  g.add(crowd);
  return g;
}

// ---------------------------------------------------------------- neon signage + poles

function straightMask(curve: TrackCurve, zones: { start: number; end: number }[]): Uint8Array {
  const frames = curve.frames;
  const step = curve.length / frames.length;
  const mask = new Uint8Array(frames.length);
  for (const z of zones) {
    const i0 = Math.max(0, Math.floor((z.start - 26) / step));
    const i1 = Math.min(frames.length - 1, Math.ceil((z.end + 26) / step));
    for (let i = i0; i <= i1; i++) mask[i] = 1;
  }
  return mask;
}

function buildNeonPoles(rng: Rng, curve: TrackCurve, zones: { start: number; end: number }[]): PropXf[] {
  const mask = straightMask(curve, zones);
  const step = curve.length / curve.frames.length;
  const out: PropXf[] = [];
  let side = 1;
  for (let d = 30; d < curve.length - 30 && out.length < 22; d += 47) {
    const idx = Math.min(mask.length - 1, Math.round(d / step));
    if (mask[idx]) continue;
    const f = frameAt(curve, d);
    const lat = side * (f.halfWidth + 3.6);
    side = -side;
    const x = f.pos.x + f.binormal.x * lat;
    const z = f.pos.z + f.binormal.z * lat;
    out.push({
      x,
      y: shoulderY(f, Math.abs(lat)) - 0.15,
      z,
      rot: yawToward(x, z, f.pos.x, f.pos.z),
      s: 0.9 + rng() * 0.3,
      syK: 1,
      cr: 1,
      cg: 1,
      cb: 1,
    });
  }
  return out;
}

function buildSignage(rng: Rng, curve: TrackCurve, zones: { start: number; end: number; side: number }[]): PropXf[] {
  const out: PropXf[] = [];
  let last = -999;
  const pushSign = (f: TrackFrame, outSign: number): void => {
    const lat = outSign * (f.halfWidth + 4.2 + rng() * 2.4);
    const x = f.pos.x + f.binormal.x * lat;
    const z = f.pos.z + f.binormal.z * lat;
    out.push({
      x,
      y: shoulderY(f, Math.abs(lat)) - 0.05,
      z,
      rot: yawToward(x, z, f.pos.x, f.pos.z),
      s: 0.85 + rng() * 0.35,
      syK: 1,
      cr: 1,
      cg: 1,
      cb: 1,
    });
  };
  for (const z of zones) {
    if (z.end - z.start < 16) continue;
    if (z.start - last < 55) continue;
    last = z.start;
    const n = 2 + Math.floor(rng() * 2.6);
    const mid = (z.start + z.end) / 2;
    for (let k = 0; k < n && out.length < 24; k++) {
      pushSign(frameAt(curve, mid + (k - (n - 1) / 2) * (4 + rng() * 2.5)), -z.side);
    }
  }
  let i = 0;
  for (let d = 40; d < curve.length - 40; d += 92, i++) {
    if (rng() > 0.42 || out.length >= 30) continue;
    pushSign(frameAt(curve, d), i % 2 === 0 ? 1 : -1);
  }
  return out;
}

// ---------------------------------------------------------------- main

export function buildTrackProps(curve: TrackCurve, theme: ThemeId, quality: 'low' | 'medium' | 'high'): THREE.Group {
  const group = new THREE.Group();
  const q = quality === 'low' ? 0.6 : 1;
  const rng = seededRandom(90210);
  const geoRng = seededRandom(777);
  const conf = CONF[theme];

  const faceRoad = theme === 'neon';
  const anchors = clusterAnchors(rng, curve, Math.round(conf.clusters * q), conf.minSep);
  const solidXfs: PropXf[] = [];
  for (const a of anchors) solidXfs.push(...scatterCluster(rng, curve, a, conf.R, Math.round(conf.per * q), faceRoad));
  solidXfs.push(...solitaryProps(rng, curve, Math.round(conf.clusters * conf.per * q * 0.2), faceRoad));

  const geos: Record<ThemeId, (() => THREE.BufferGeometry)[]> = {
    alpine: [
      () => pineTall(geoRng),
      () => pineShort(geoRng),
      () => pineDouble(geoRng),
    ],
    mesa: [
      () => saguaro(geoRng),
      () => joshua(geoRng),
      () => barrelCluster(geoRng),
    ],
    canyon: [
      () => spireThin(geoRng),
      () => spireWide(geoRng),
      () => spireTwin(geoRng),
    ],
    neon: [
      () => pylon(geoRng),
      () => pylonGate(geoRng),
      () => lightPole(geoRng),
    ],
  };
  const weights: Record<ThemeId, number[]> = {
    alpine: [0.42, 0.36, 0.22],
    mesa: [0.4, 0.32, 0.28],
    canyon: [0.4, 0.3, 0.3],
    neon: [0.5, 0.24, 0.26],
  };

  const zones = computeCurbZones(curve.frames, curve.length);
  if (theme === 'neon') solidXfs.push(...buildNeonPoles(rng, curve, zones));

  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const buckets: PropXf[][] = [[], [], []];
  for (const t of solidXfs) buckets[pickWeighted(rng, weights[theme])].push(t);
  const built = geos[theme].map((mk) => mk());
  for (let i = 0; i < 3; i++) {
    if (!buckets[i].length) {
      built[i].dispose();
      continue;
    }
    group.add(fillInstanced(built[i], propMat, buckets[i], quality !== 'low'));
  }

  if (theme === 'neon') {
    const signXfs = buildSignage(rng, curve, zones);
    const signGeos = [signWide(geoRng), signTall(geoRng), signDuo(geoRng)];
    const signMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const sb: PropXf[][] = [[], [], []];
    for (const t of signXfs) sb[pickWeighted(rng, [1, 1, 1])].push(t);
    for (let i = 0; i < 3; i++) {
      if (!sb[i].length) {
        signGeos[i].dispose();
        continue;
      }
      group.add(fillInstanced(signGeos[i], signMat, sb[i], false));
    }
  }

  const scatterGeoMk: Record<ThemeId, () => THREE.BufferGeometry> = {
    alpine: () => tuftGeo(geoRng),
    mesa: () => scrubGeo(geoRng),
    canyon: () => pebbleGeo(geoRng),
    neon: () => dotGeo(),
  };
  const scatterXfs = buildScatterXfs(rng, curve, anchors, conf.R, Math.round(conf.scatter * q), theme);
  if (scatterXfs.length) {
    const scatterMat =
      theme === 'neon'
        ? new THREE.MeshBasicMaterial()
        : new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    group.add(fillInstanced(scatterGeoMk[theme](), scatterMat, scatterXfs, false));
  }

  group.add(buildStartKit(curve, rng, quality));
  return group;
}
