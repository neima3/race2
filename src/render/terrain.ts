import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeDef } from '../track/defs';
import type { TrackCurve } from '../track/curve';

export const GROUND_Y = -0.45;
export const LANDFORM_MIN_ROAD_DIST = 60;
export const ROCK_MIN_ROAD_DIST = 25;
const GROUND_RADIUS = 3600;

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function rgba(c: THREE.Color, a: number): string {
  const hx = c.getHexString();
  return `rgba(${parseInt(hx.slice(0, 2), 16)}, ${parseInt(hx.slice(2, 4), 16)}, ${parseInt(hx.slice(4, 6), 16)}, ${a})`;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Horizontal (x/z) distance from a world point to the closest track frame center. */
export function minRoadDistance(curve: TrackCurve, x: number, z: number): number {
  let best = Infinity;
  const frames = curve.frames;
  for (let i = 0; i < frames.length; i++) {
    const dx = frames[i].pos.x - x;
    const dz = frames[i].pos.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------- ground

export interface GroundSurface {
  mesh: THREE.Mesh;
  anchor(x: number, z: number): void;
  dim(v: number): void;
}

function organicCanvas(theme: ThemeDef, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d')!;
  const base = new THREE.Color(theme.groundColor);
  g.fillStyle = '#' + base.getHexString();
  g.fillRect(0, 0, size, size);
  const rng = seededRandom(4127);
  const patch = (h: number, s: number, l: number, count: number, rMin: number, rMax: number, alpha: number): void => {
    const c = base.clone().offsetHSL(h, s, l);
    const fill = rgba(c, alpha);
    for (let i = 0; i < count; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = rMin + rng() * (rMax - rMin);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, rgba(c, 0));
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  };
  switch (theme.terrainStyle) {
    case 'meadow':
      patch(0.02, -0.04, 0.085, 26, size * 0.08, size * 0.25, 0.26);
      patch(0.045, -0.1, 0.13, 14, size * 0.05, size * 0.14, 0.2);
      patch(-0.015, 0.02, -0.06, 22, size * 0.07, size * 0.22, 0.28);
      break;
    case 'sand':
      patch(0.015, -0.06, 0.075, 26, size * 0.08, size * 0.26, 0.24);
      patch(0.03, -0.12, 0.13, 12, size * 0.05, size * 0.13, 0.2);
      patch(-0.01, 0.02, -0.05, 20, size * 0.07, size * 0.2, 0.26);
      break;
    case 'terracotta':
      patch(0.008, -0.04, 0.06, 24, size * 0.08, size * 0.24, 0.24);
      patch(-0.005, 0.04, -0.07, 18, size * 0.06, size * 0.2, 0.26);
      patch(0.02, -0.1, 0.1, 10, size * 0.05, size * 0.13, 0.18);
      break;
    case 'city':
      break;
  }
  const n = size * 8;
  for (let i = 0; i < n; i++) {
    const lum = rng();
    g.fillStyle = `rgba(${lum > 0.5 ? '255,255,255' : '0,0,0'}, ${0.03 + rng() * 0.05})`;
    g.fillRect(rng() * size, rng() * size, 1 + (rng() < 0.2 ? 1 : 0), 1);
  }
  return cv;
}

function cityCanvases(theme: ThemeDef, size: number): { color: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const base = new THREE.Color(theme.groundColor);
  const cell = size / 8;
  const street = size / 73;

  const color = document.createElement('canvas');
  color.width = size;
  color.height = size;
  const g = color.getContext('2d')!;
  g.fillStyle = rgba(base.clone().multiplyScalar(0.55), 1);
  g.fillRect(0, 0, size, size);
  const rng = seededRandom(911);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const x = gx * cell + street * 0.5;
      const y = gy * cell + street * 0.5;
      const w = cell - street;
      const plaza = rng() < 0.08;
      const c = base.clone().multiplyScalar(plaza ? 1.5 : 0.85 + rng() * 0.55).offsetHSL((rng() - 0.5) * 0.015, 0, 0);
      g.fillStyle = rgba(c, 1);
      g.fillRect(x, y, w, w);
      if (rng() < 0.4) {
        const c2 = base.clone().multiplyScalar(0.7 + rng() * 0.5);
        g.fillStyle = rgba(c2, 1);
        g.fillRect(x + w * (0.1 + rng() * 0.3), y + w * (0.1 + rng() * 0.3), w * (0.2 + rng() * 0.3), w * (0.2 + rng() * 0.3));
      }
    }
  }

  const emissive = document.createElement('canvas');
  emissive.width = size;
  emissive.height = size;
  const e = emissive.getContext('2d')!;
  e.fillStyle = '#000000';
  e.fillRect(0, 0, size, size);
  e.strokeStyle = 'rgba(64, 215, 255, 0.09)';
  e.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = Math.min(size - 1, Math.round(i * cell));
    e.beginPath();
    e.moveTo(p, 0);
    e.lineTo(p, size);
    e.moveTo(0, p);
    e.lineTo(size, p);
    e.stroke();
  }
  const dots = ['#8be9ff', '#ff6ad5', '#ffd98a', '#d0f0ff', '#9dff3d'];
  const rng2 = seededRandom(1207);
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const bx = gx * cell + street;
      const by = gy * cell + street;
      const bw = cell - street * 2;
      if (rng2() < 0.3) {
        const n = 4 + Math.floor(rng2() * 10);
        for (let i = 0; i < n; i++) {
          e.fillStyle = rgba(new THREE.Color(dots[Math.floor(rng2() * dots.length)]), 0.35 + rng2() * 0.55);
          e.fillRect(bx + rng2() * (bw - 2), by + rng2() * (bw - 3), 2, 3);
        }
      }
      if (rng2() < 0.06) {
        e.strokeStyle = rgba(new THREE.Color(dots[Math.floor(rng2() * dots.length)]), 0.3);
        e.strokeRect(bx + 5, by + 5, bw - 10, bw - 10);
      }
    }
  }
  return { color, emissive };
}

export function buildGround(theme: ThemeDef): GroundSurface {
  const city = theme.terrainStyle === 'city';
  const size = city ? 1024 : 512;
  const tile = city ? 512 : 240;
  const repeat = (GROUND_RADIUS * 2) / tile;
  const mk = (cv: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  };
  let emissiveMap: THREE.CanvasTexture | null = null;
  let map: THREE.CanvasTexture;
  let material: THREE.MeshStandardMaterial;
  if (city) {
    const canvases = cityCanvases(theme, size);
    map = mk(canvases.color);
    emissiveMap = mk(canvases.emissive);
    material = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.92 });
  } else {
    map = mk(organicCanvas(theme, size));
    material = new THREE.MeshStandardMaterial({ map, roughness: 1 });
  }
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(GROUND_RADIUS, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = GROUND_Y;
  const anchor = (x: number, z: number): void => {
    mesh.position.set(x, GROUND_Y, z);
    map.offset.set(x / tile, -z / tile);
    emissiveMap?.offset.set(x / tile, -z / tile);
  };
  anchor(0, 0);
  return {
    mesh,
    anchor,
    dim(v: number) {
      material.color.setScalar(v);
    },
  };
}

// ---------------------------------------------------------------- landforms

export interface LandformSpec {
  kind: 'hill' | 'mesa' | 'butte' | 'tower';
  x: number;
  z: number;
  rot: number;
  radius: number;
  height: number;
  top: number;
}

const LANDFORM_COUNT: Record<ThemeDef['terrainStyle'], number> = { meadow: 26, sand: 20, terracotta: 20, city: 30 };

function rollLandform(rng: () => number, theme: ThemeDef): { kind: LandformSpec['kind']; radius: number; height: number } {
  switch (theme.terrainStyle) {
    case 'meadow':
      return { kind: 'hill', radius: 55 + rng() * 80, height: 15 + rng() * 30 };
    case 'sand':
      return { kind: 'mesa', radius: 48 + rng() * 70, height: 30 + rng() * 75 };
    case 'terracotta':
      return { kind: 'butte', radius: 34 + rng() * 52, height: 36 + rng() * 62 };
    case 'city':
      return { kind: 'tower', radius: 9 + rng() * 17, height: 42 + rng() * 85 };
  }
}

export function placeLandforms(rng: () => number, theme: ThemeDef, curve: TrackCurve): LandformSpec[] {
  const specs: LandformSpec[] = [];
  const target = LANDFORM_COUNT[theme.terrainStyle];
  let guard = 0;
  while (specs.length < target && guard++ < 600) {
    const a = rng() * Math.PI * 2;
    const dist = 430 + rng() * 1150;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const roll = rollLandform(rng, theme);
    if (dist + roll.radius > 1700) continue;
    if (minRoadDistance(curve, x, z) < roll.radius + LANDFORM_MIN_ROAD_DIST) continue;
    specs.push({ ...roll, x, z, rot: rng() * Math.PI * 2, top: GROUND_Y + roll.height });
    if (theme.terrainStyle === 'meadow' && rng() < 0.5) {
      for (let n = 0; n < 2 && specs.length < target; n++) {
        const na = rng() * Math.PI * 2;
        const off = roll.radius * (0.7 + rng() * 0.5);
        const nx = x + Math.cos(na) * off;
        const nz = z + Math.sin(na) * off;
        const nroll = rollLandform(rng, theme);
        if (minRoadDistance(curve, nx, nz) < nroll.radius + LANDFORM_MIN_ROAD_DIST) continue;
        specs.push({ ...nroll, x: nx, z: nz, rot: rng() * Math.PI * 2, top: GROUND_Y + nroll.height });
      }
    }
  }
  return specs;
}

function stripUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}

function jitterRadial(g: THREE.BufferGeometry, amp: number, rng: () => number): void {
  const p0 = rng() * Math.PI * 2;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const th = Math.atan2(z, x);
    const s = 1 + amp * (0.55 * Math.sin(2 * th + p0) + 0.3 * Math.sin(3 * th + p1) + 0.15 * Math.sin(5 * th + p2));
    p.setX(i, x * s);
    p.setZ(i, z * s);
  }
}

function mesaGeo(rng: () => number, r: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.88, r, h, 9, 1, false);
  g.translate(0, h / 2, 0);
  jitterRadial(g, 0.14 + rng() * 0.14, rng);
  const ni = g.toNonIndexed();
  g.dispose();
  return stripUv(ni);
}

function butteGeo(rng: () => number, r: number, h: number): THREE.BufferGeometry {
  const lower = mesaGeo(rng, r, h * (0.5 + rng() * 0.12));
  const upper = mesaGeo(rng, r * (0.55 + rng() * 0.15), h * (0.38 + rng() * 0.12));
  upper.translate(0, h * (0.52 + rng() * 0.1), 0);
  const merged = mergeGeometries([lower, upper], false)!;
  lower.dispose();
  upper.dispose();
  return merged;
}

function hillGeo(rng: () => number, r: number, h: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 11, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const p0 = rng() * Math.PI * 2;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const th = Math.atan2(z, x);
    const s = 1 + 0.18 * Math.sin(2 * th + p0) + 0.12 * Math.sin(3 * th + p1) + 0.07 * Math.sin(5 * th + p2);
    p.setX(i, x * s);
    p.setZ(i, z * s);
    p.setY(i, y * (1 + 0.1 * Math.sin(3 * th + p2)));
  }
  g.scale(r, h, r * (0.8 + rng() * 0.35));
  const ni = g.toNonIndexed();
  g.dispose();
  return stripUv(ni);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const ni = g.toNonIndexed();
  g.dispose();
  return stripUv(ni);
}

const NEON_ACCENTS = [0x36f0ff, 0xff3dd2, 0xffd23d, 0x9dff3d, 0xff8a3d];

function towerGeos(rng: () => number, w: number, h: number): { body: THREE.BufferGeometry; windows: THREE.BufferGeometry | null } {
  const parts = [box(w, h, w, 0, h / 2, 0)];
  if (rng() < 0.4) parts.push(box(w * 0.68, h * 0.16, w * 0.68, 0, h + h * 0.08, 0));
  if (rng() < 0.3) parts.push(box(w * 1.45, h * 0.1, w * 1.45, 0, h * 0.05, 0));
  if (rng() < 0.3) parts.push(box(w * 0.18, h * (0.18 + rng() * 0.22), w * 0.18, 0, h + h * 0.22, 0));
  const body = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
  if (body !== parts[0]) for (const p of parts) p.dispose();
  const stripCount = 1 + Math.floor(rng() * 3);
  const strips: THREE.BufferGeometry[] = [];
  for (let i = 0; i < stripCount; i++) {
    const face = Math.floor(rng() * 4);
    const len = h * (0.3 + rng() * 0.45);
    const y = h * (0.25 + rng() * 0.45);
    const sw = w * (0.14 + rng() * 0.1);
    const lateral = (rng() - 0.5) * w * 0.5;
    const out = w / 2 + 0.06;
    let s: THREE.BufferGeometry;
    if (face === 0) s = box(0.22, len, sw, out, y, lateral);
    else if (face === 1) s = box(0.22, len, sw, -out, y, lateral);
    else if (face === 2) s = box(sw, len, 0.22, lateral, y, out);
    else s = box(sw, len, 0.22, lateral, y, -out);
    const c = new THREE.Color(NEON_ACCENTS[Math.floor(rng() * NEON_ACCENTS.length)]).multiplyScalar(1.4 + rng() * 1.6);
    const count = s.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      colors[v * 3] = c.r;
      colors[v * 3 + 1] = c.g;
      colors[v * 3 + 2] = c.b;
    }
    s.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    strips.push(s);
  }
  const windows = strips.length ? mergeGeometries(strips, false)! : null;
  if (windows) for (const s of strips) s.dispose();
  return { body, windows };
}

function applyFaceColors(
  geo: THREE.BufferGeometry,
  base: THREE.Color,
  sun: THREE.Vector3,
  lo: number,
  hi: number,
  faceJitter: number,
  rng: () => number,
): void {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2).normalize();
    const k = smoothstep(-0.12, 0.55, n.dot(sun));
    col.copy(base).multiplyScalar((lo + (hi - lo) * k) * (1 + (rng() - 0.5) * faceJitter));
    for (let v = 0; v < 3; v++) {
      colors[(i + v) * 3] = col.r;
      colors[(i + v) * 3 + 1] = col.g;
      colors[(i + v) * 3 + 2] = col.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function bake(geo: THREE.BufferGeometry, x: number, z: number, rot: number): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, GROUND_Y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
}

export function buildLandformMeshes(
  theme: ThemeDef,
  specs: LandformSpec[],
  seed = 5150,
): { meshes: THREE.Mesh[]; landMat: THREE.MeshStandardMaterial } {
  const rng = seededRandom(seed);
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true });
  const sun = new THREE.Vector3(...theme.sunDir).normalize();
  const contrast: [number, number] =
    theme.terrainStyle === 'meadow' ? [0.58, 1.06] : theme.terrainStyle === 'city' ? [0.5, 1.15] : [0.46, 1.12];
  const bodyGeos: THREE.BufferGeometry[] = [];
  const windowGeos: THREE.BufferGeometry[] = [];
  for (const s of specs) {
    const base = new THREE.Color(theme.mesaColor).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
    let body: THREE.BufferGeometry;
    let windows: THREE.BufferGeometry | null = null;
    if (s.kind === 'hill') body = hillGeo(rng, s.radius, s.height);
    else if (s.kind === 'mesa') body = mesaGeo(rng, s.radius, s.height);
    else if (s.kind === 'butte') body = butteGeo(rng, s.radius, s.height);
    else {
      const t = towerGeos(rng, s.radius, s.height);
      body = t.body;
      windows = t.windows;
    }
    if (body.getAttribute('normal') === undefined) body.computeVertexNormals();
    applyFaceColors(body, base, sun, contrast[0], contrast[1], 0.06, rng);
    bake(body, s.x, s.z, s.rot);
    bodyGeos.push(body);
    if (windows) {
      bake(windows, s.x, s.z, s.rot);
      windowGeos.push(windows);
    }
  }
  const meshes: THREE.Mesh[] = [];
  if (bodyGeos.length) {
    const merged = mergeGeometries(bodyGeos, false)!;
    for (const g of bodyGeos) g.dispose();
    meshes.push(new THREE.Mesh(merged, landMat));
  }
  if (windowGeos.length) {
    const merged = mergeGeometries(windowGeos, false)!;
    for (const g of windowGeos) g.dispose();
    meshes.push(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })));
  }
  return { meshes, landMat };
}

// ---------------------------------------------------------------- rocks

export interface RockTransform {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  tint: number;
}

export function placeRocks(rng: () => number, curve: TrackCurve, count = 140): RockTransform[] {
  const out: RockTransform[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const a = rng() * Math.PI * 2;
    const dist = 60 + rng() * 640;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const sc = 0.7 + rng() * 4.6;
    const sx = sc * (0.7 + rng() * 0.6);
    const sy = sc * (0.5 + rng() * 0.5);
    const sz = sc;
    if (minRoadDistance(curve, x, z) < ROCK_MIN_ROAD_DIST + sz) continue;
    const sink = 0.1 + rng() * 0.1;
    out.push({
      x,
      y: GROUND_Y + sy * (1 - sink),
      z,
      sx,
      sy,
      sz,
      rx: rng() * Math.PI,
      ry: rng() * Math.PI,
      rz: rng() * Math.PI,
      tint: 0.78 + rng() * 0.44,
    });
  }
  return out;
}

// ---------------------------------------------------------------- horizon ridges

export interface RidgeRings {
  group: THREE.Group;
  setTint(fog: THREE.Color, dim: number): void;
}

function ridgeGeo(rng: () => number, theme: ThemeDef, radius: number, hScale: number, seg: number): THREE.BufferGeometry {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const hAt = (th: number): number => {
    let h: number;
    switch (theme.terrainStyle) {
      case 'meadow':
        h = 70 + 55 * Math.sin(2 * th + p1) + 30 * Math.sin(5 * th + p2) + 10 * Math.sin(9 * th + p3);
        break;
      case 'sand':
        h = 85 + 60 * Math.sin(3 * th + p1) + 26 * Math.sin(7 * th + p2) + 8 * Math.sin(13 * th + p3);
        h -= ((h % 9) + 9) % 9;
        break;
      case 'terracotta':
        h = 95 + 62 * Math.sin(4 * th + p1) + 24 * Math.sin(9 * th + p2) + 10 * Math.sin(17 * th + p3);
        break;
      case 'city':
        h = 26 + 85 * Math.pow(Math.abs(Math.sin(2 * th + p1)), 3) + 25 * Math.abs(Math.sin(5 * th + p2));
        h -= ((h % 14) + 14) % 14;
        break;
    }
    return Math.max(20, h) * hScale;
  };
  const positions = new Float32Array((seg + 1) * 2 * 3);
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    const cx = Math.cos(th) * radius;
    const cz = Math.sin(th) * radius;
    positions[i * 6] = cx;
    positions[i * 6 + 1] = hAt(th);
    positions[i * 6 + 2] = cz;
    positions[i * 6 + 3] = cx;
    positions[i * 6 + 4] = -10;
    positions[i * 6 + 5] = cz;
  }
  const indices: number[] = [];
  for (let i = 0; i < seg; i++) {
    const t0 = i * 2;
    indices.push(t0, t0 + 1, t0 + 2, t0 + 1, t0 + 3, t0 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

export function buildRidges(rng: () => number, theme: ThemeDef): RidgeRings {
  const base = new THREE.Color(theme.mesaFarColor);
  const nearMat = new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide });
  const farMat = new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(ridgeGeo(rng, theme, 1850, 1, 96), nearMat));
  group.add(new THREE.Mesh(ridgeGeo(rng, theme, 2850, 1.28, 96), farMat));
  const tmp = new THREE.Color();
  return {
    group,
    setTint(fog: THREE.Color, dim: number): void {
      nearMat.color.copy(tmp.copy(base).lerp(fog, 0.32)).multiplyScalar(dim);
      farMat.color.copy(tmp.copy(base).lerp(fog, 0.5)).multiplyScalar(dim * 0.78);
    },
  };
}
