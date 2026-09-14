import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TrackCurve, type TrackFrame } from './curve';
import { THEMES, type TrackDef, type TrackVariant, type ThemeId } from './defs';
import { GROUND_Y } from '../render/terrain';
import { makeAsphaltTexture, makeCurbTexture, checkerBannerCanvas } from '../render/roadTextures';

const TAU = Math.PI * 2;

function makeChevronTexture(accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 256);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  for (const y of [48, 124, 200]) {
    ctx.beginPath();
    ctx.moveTo(24, y + 26);
    ctx.lineTo(64, y - 12);
    ctx.lineTo(104, y + 26);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const CURB_KAPPA = 0.015;
const CURB_MIN_LEN = 7;
const CURB_DILATE_M = 4;
const CURB_STRIPE_M = 2.4;

interface CurbZone {
  start: number;
  end: number;
  side: number;
}

export function computeCurbZones(frames: TrackFrame[], length: number): CurbZone[] {
  const n = frames.length;
  const step = length / n;
  const kappa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = frames[i];
    const b = frames[(i + 1) % n];
    if (Math.hypot(a.tangent.x, a.tangent.z) < 0.25 || Math.hypot(b.tangent.x, b.tangent.z) < 0.25) continue;
    let d = Math.atan2(b.tangent.x, b.tangent.z) - Math.atan2(a.tangent.x, a.tangent.z);
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    kappa[i] = d / Math.max(0.001, b.dist - a.dist);
  }
  const win = Math.max(1, Math.round(4.5 / step));
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -win; k <= win; k++) sum += kappa[(i + k + n * 4) % n];
    smooth[i] = sum / (win * 2 + 1);
  }
  const on = new Uint8Array(n);
  const dil = Math.max(1, Math.round(CURB_DILATE_M / step));
  for (let i = 0; i < n; i++) {
    if (Math.abs(smooth[i]) <= CURB_KAPPA) continue;
    for (let k = -dil; k <= dil; k++) on[(i + k + n * 4) % n] = 1;
  }
  const zones: CurbZone[] = [];
  let i = 0;
  while (i < n) {
    if (!on[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && on[j]) j++;
    let sum = 0;
    for (let k = i; k < j; k++) sum += smooth[k];
    if ((j - i) * step >= CURB_MIN_LEN) {
      zones.push({ start: frames[i].dist, end: j < n ? frames[j].dist : length, side: sum >= 0 ? -1 : 1 });
    }
    i = j;
  }
  if (zones.length > 1 && zones[0].start <= 0.001 && zones[zones.length - 1].end >= length - 0.001) {
    const first = zones.shift()!;
    zones[zones.length - 1].end = first.end + length;
  }
  return zones;
}

const GANTRY_POST: Record<ThemeId, number> = {
  alpine: 0x2e3648,
  mesa: 0x4a3a28,
  canyon: 0x453122,
  neon: 0x1e2540,
};

function lineAccentColor(def: TrackDef): THREE.Color {
  const c = new THREE.Color(def.accent);
  if (def.theme === 'neon') c.multiplyScalar(2.2);
  return c;
}

export interface TrackMeshes {
  group: THREE.Group;
  boostPads: { mesh: THREE.Mesh; dist: number; lateral: number; strength: number; mat: THREE.MeshBasicMaterial }[];
  checkpointGates: { group: THREE.Group; dist: number; mat: THREE.MeshBasicMaterial }[];
  roadMat: THREE.MeshStandardMaterial;
  rings: { pos: THREE.Vector3; radius: number }[];
  movers: { mesh: THREE.Mesh; dist: number; speed: number; range: number; phase: number }[];
}

export function buildTrackMeshes(curve: TrackCurve, def: TrackDef, variant: TrackVariant = 'day'): TrackMeshes {
  const group = new THREE.Group();
  const frames = curve.frames;
  const n = frames.length;
  const length = curve.length;
  const accentHex = '#' + def.accent.toString(16).padStart(6, '0');
  const theme = THEMES[def.theme];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const underPositions: number[] = [];
  const underColors: number[] = [];
  const bankPositions: number[] = [];
  const bankColors: number[] = [];
  const bankIndices: number[] = [];
  const linePositions: number[] = [];
  const lineColors: number[] = [];
  const lineIndices: number[] = [];

  const uvVScale = 0.14;

  let halfWidthAvg = 0;
  for (const f of frames) halfWidthAvg += f.halfWidth;
  halfWidthAvg /= n;

  const groundTone = new THREE.Color(theme.groundColor).multiplyScalar(def.theme === 'neon' ? 1.15 : 0.94);
  const edgeTone = groundTone.clone().lerp(new THREE.Color(0x2a2d36), 0.55);
  const midTone = edgeTone.clone().lerp(groundTone, 0.45);
  const underTone = edgeTone.clone().multiplyScalar(0.82);
  const accentCol = lineAccentColor(def);

  for (let i = 0; i <= n; i++) {
    const f = frames[i % n];
    const v = f.dist * uvVScale;
    const lp = f.pos.clone().addScaledVector(f.binormal, -f.halfWidth);
    const rp = f.pos.clone().addScaledVector(f.binormal, f.halfWidth);
    positions.push(lp.x, lp.y, lp.z, rp.x, rp.y, rp.z);
    normals.push(f.normal.x, f.normal.y, f.normal.z, f.normal.x, f.normal.y, f.normal.z);
    uvs.push(0, v, 1, v);
    if (i < n) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const ul = lp.clone().addScaledVector(f.normal, -0.06);
    const ur = rp.clone().addScaledVector(f.normal, -0.06);
    underPositions.push(ul.x, ul.y, ul.z, ur.x, ur.y, ur.z);
    underColors.push(underTone.r, underTone.g, underTone.b, underTone.r, underTone.g, underTone.b);

    const groundDrop = f.pos.y - GROUND_Y;
    const drop = Math.min(Math.max(0.3, groundDrop), 2.4);
    const outset = 0.55 + drop * 1.3;
    for (const side of [-1, 1]) {
      const e = side === -1 ? lp : rp;
      const shelf = e.clone().addScaledVector(f.binormal, side * 0.55);
      const foot = e.clone().addScaledVector(f.binormal, side * outset);
      foot.y = Math.max(GROUND_Y, e.y - drop);
      const base = (i % n) * 6 + (side === -1 ? 0 : 3);
      bankPositions.push(e.x, e.y, e.z, shelf.x, shelf.y, shelf.z, foot.x, foot.y, foot.z);
      bankColors.push(edgeTone.r, edgeTone.g, edgeTone.b, midTone.r, midTone.g, midTone.b, groundTone.r, groundTone.g, groundTone.b);
      if (i < n) {
        const nb = ((i + 1) % n) * 6 + (side === -1 ? 0 : 3);
        bankIndices.push(base, nb, base + 1, base + 1, nb, nb + 1);
        bankIndices.push(base + 1, nb + 1, base + 2, base + 2, nb + 1, nb + 2);
      }
    }

    for (const side of [-1, 1]) {
      for (const line of [0, 1]) {
        const inLat = line === 0 ? f.halfWidth - 0.3 : f.halfWidth + 0.1;
        const outLat = line === 0 ? f.halfWidth - 0.05 : f.halfWidth + 0.45;
        const a = f.pos.clone().addScaledVector(f.binormal, side * inLat).addScaledVector(f.normal, 0.02);
        const b = f.pos.clone().addScaledVector(f.binormal, side * outLat).addScaledVector(f.normal, 0.02);
        const base = (i % n) * 8 + (side === -1 ? 0 : 4) + line * 2;
        linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        if (line === 0) lineColors.push(1, 1, 1, 1, 1, 1);
        else lineColors.push(accentCol.r, accentCol.g, accentCol.b, accentCol.r, accentCol.g, accentCol.b);
        if (i < n) {
          const nb = ((i + 1) % n) * 8 + (side === -1 ? 0 : 4) + line * 2;
          lineIndices.push(base, nb, base + 1, base + 1, nb, nb + 1);
        }
      }
    }
  }

  const roadTex = makeAsphaltTexture(def.theme, halfWidthAvg);
  const wet = variant === 'rain';
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: wet ? 0.34 : 0.82,
    metalness: wet ? 0.32 : 0.05,
  });
  if (wet) roadMat.color.set(0x8f95a2);
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  group.add(new THREE.Mesh(roadGeo, roadMat));

  const bankGeo = new THREE.BufferGeometry();
  bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(bankPositions, 3));
  bankGeo.setAttribute('color', new THREE.Float32BufferAttribute(bankColors, 3));
  bankGeo.setIndex(bankIndices);
  bankGeo.computeVertexNormals();
  const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(bankGeo, bankMat));

  const underMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const underGeo = new THREE.BufferGeometry();
  underGeo.setAttribute('position', new THREE.Float32BufferAttribute(underPositions, 3));
  underGeo.setAttribute('color', new THREE.Float32BufferAttribute(underColors, 3));
  const underIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    underIdx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  underGeo.setIndex(underIdx);
  underGeo.computeVertexNormals();
  group.add(new THREE.Mesh(underGeo, underMat));

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
  lineGeo.setIndex(lineIndices);
  const lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(lineGeo, lineMat));

  const curbZones = computeCurbZones(frames, length);
  if (curbZones.length) {
    const cPos: number[] = [];
    const cUv: number[] = [];
    const cIdx: number[] = [];
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    for (const z of curbZones) {
      const span = z.end - z.start;
      const count = Math.max(1, Math.ceil(span / 1.2));
      const zBase = cPos.length / 3;
      for (let s = 0; s <= count; s++) {
        curve.frameAtDist(z.start + (span * s) / count, f);
        const inner = f.pos.clone().addScaledVector(f.binormal, z.side * (f.halfWidth - 2.65)).addScaledVector(f.normal, 0.025);
        const outer = f.pos.clone().addScaledVector(f.binormal, z.side * (f.halfWidth - 0.05)).addScaledVector(f.normal, 0.025);
        cPos.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
        const v = (z.start + (span * s) / count) / CURB_STRIPE_M;
        cUv.push(0, v, 1, v);
        if (s < count) {
          const a = zBase + s * 2;
          cIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2));
    curbGeo.setIndex(cIdx);
    curbGeo.computeVertexNormals();
    const curbMat = new THREE.MeshStandardMaterial({ map: makeCurbTexture(), roughness: 0.75, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(curbGeo, curbMat));
  }

  const boostPads: TrackMeshes['boostPads'] = [];
  const chevronTex = makeChevronTexture('#7ef3ff');
  for (const b of def.boosts) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(b.dist, f);
    const w = Math.min(3.4, f.halfWidth * 0.7);
    const geo = new THREE.PlaneGeometry(w * 2, 7);
    const mat = new THREE.MeshBasicMaterial({
      map: chevronTex.clone(),
      color: new THREE.Color(1.7, 1.7, 1.7),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    mat.map!.wrapT = THREE.RepeatWrapping;
    mat.map!.repeat.set(1, 1.6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(f.pos).addScaledVector(f.binormal, b.lateral).addScaledVector(f.normal, 0.06);
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(f.normal, f.tangent).normalize(), f.normal, f.tangent),
    );
    mesh.rotateX(-Math.PI / 2);
    group.add(mesh);
    boostPads.push({ mesh, dist: b.dist, lateral: b.lateral, strength: b.strength, mat });
  }

  const checkpointGates: TrackMeshes['checkpointGates'] = [];
  const gateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ef3ff).multiplyScalar(1.5), transparent: true, opacity: 0.9 });
  for (const c of def.checkpoints) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(c.dist, f);
    const gate = new THREE.Group();
    const w = f.halfWidth + 0.4;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.6, 0.5, 0.5), gateMat);
    bar.position.copy(f.pos).addScaledVector(f.normal, 5.2);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), gateMat);
    left.position.copy(f.pos).addScaledVector(f.binormal, -w).addScaledVector(f.normal, 2.6);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), gateMat);
    right.position.copy(f.pos).addScaledVector(f.binormal, w).addScaledVector(f.normal, 2.6);
    gate.add(bar, left, right);
    gate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(f.normal, f.tangent).normalize(), f.normal, f.tangent));
    gate.add(new THREE.Object3D());
    group.add(gate);
    checkpointGates.push({ group: gate, dist: c.dist, mat: gateMat });
  }

  const startF = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
  curve.frameAtDist(0.01, startF);
  const gateGroup = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: GANTRY_POST[def.theme], roughness: 0.55, metalness: 0.35 });
  const bannerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  bannerMat.map = new THREE.CanvasTexture(checkerBannerCanvas(accentHex));
  bannerMat.map.colorSpace = THREE.SRGBColorSpace;
  const w0 = startF.halfWidth + 0.6;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w0 * 2, 1.8, 0.3), bannerMat);
  banner.position.copy(startF.pos).addScaledVector(startF.normal, 5.6);
  const postL = new THREE.BoxGeometry(0.8, 5.6, 0.8);
  postL.translate(-w0, 2.8, 0);
  const postR = new THREE.BoxGeometry(0.8, 5.6, 0.8);
  postR.translate(w0, 2.8, 0);
  const posts = new THREE.Mesh(mergeGeometries([postL, postR], false)!, postMat);
  posts.position.copy(startF.pos);
  gateGroup.add(banner, posts);
  gateGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(startF.normal, startF.tangent).normalize(), startF.normal, startF.tangent));
  group.add(gateGroup);

  for (const sl of def.slicks ?? []) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(sl.dist, f);
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(sl.w, sl.l),
      new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.15, metalness: 0.6 }),
    );
    patch.position.copy(f.pos).addScaledVector(f.binormal, sl.lateral).addScaledVector(f.normal, 0.03);
    patch.rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.binormal, f.normal, f.tangent));
    patch.rotateX(-Math.PI / 2);
    group.add(patch);
  }

  const rings: TrackMeshes['rings'] = [];
  const ringGroup = new THREE.Group();
  for (const r of def.rings ?? []) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(r.dist, f);
    const center = f.pos.clone().addScaledVector(f.binormal, r.lateral).addScaledVector(f.normal, r.height);
    const geo = new THREE.TorusGeometry(r.radius, 0.22, 10, 40);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9df3ff).multiplyScalar(1.8), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(center);
    ring.lookAt(center.clone().add(f.tangent));
    ringGroup.add(ring);
    rings.push({ pos: center, radius: r.radius });
  }
  if ((def.rings?.length ?? 0) > 0) group.add(ringGroup);

  const movers: TrackMeshes['movers'] = [];
  const pillarCanvas = document.createElement('canvas');
  pillarCanvas.width = 64;
  pillarCanvas.height = 64;
  const px2 = pillarCanvas.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    px2.fillStyle = i % 2 === 0 ? '#ff7a3d' : '#1c1f2a';
    px2.fillRect(0, i * 8, 64, 8);
  }
  const pillarTex = new THREE.CanvasTexture(pillarCanvas);
  pillarTex.colorSpace = THREE.SRGBColorSpace;
  const moverMat = new THREE.MeshStandardMaterial({ map: pillarTex, roughness: 0.6 });
  let mphase = 0;
  for (const m of def.movers ?? []) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(m.dist, f);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 4.6, 10), moverMat);
    pillar.position.copy(f.pos).addScaledVector(f.normal, 2.3);
    group.add(pillar);
    movers.push({ mesh: pillar, dist: m.dist, speed: m.speed, range: m.range, phase: mphase });
    mphase += 2.1;
  }

  return { group, boostPads, checkpointGates, roadMat, rings, movers };
}
