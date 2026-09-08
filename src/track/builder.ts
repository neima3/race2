import * as THREE from 'three';
import { TrackCurve } from './curve';
import type { TrackDef } from './defs';

function makeRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3f4c';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 45 + Math.random() * 30;
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 10},${0.25 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.6, 1.6);
  }
  ctx.fillStyle = 'rgba(235,240,255,0.85)';
  ctx.fillRect(61, 8, 6, 42);
  ctx.fillRect(61, 72, 6, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

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
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface TrackMeshes {
  group: THREE.Group;
  boostPads: { mesh: THREE.Mesh; dist: number; lateral: number; strength: number; mat: THREE.MeshBasicMaterial }[];
  checkpointGates: { group: THREE.Group; dist: number; mat: THREE.MeshBasicMaterial }[];
  roadMat: THREE.MeshStandardMaterial;
}

export function buildTrackMeshes(curve: TrackCurve, def: TrackDef): TrackMeshes {
  const group = new THREE.Group();
  const frames = curve.frames;
  const n = frames.length;
  const accentHex = '#' + def.accent.toString(16).padStart(6, '0');

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const skirtPositions: number[] = [];
  const skirtNormals: number[] = [];
  const skirtUvs: number[] = [];
  const skirtIndices: number[] = [];

  const roadHalfScale = 1;
  const uvVScale = 0.14;

  for (let i = 0; i <= n; i++) {
    const f = frames[i % n];
    const v = f.dist * uvVScale;
    const l = f.binormal.clone().multiplyScalar(-f.halfWidth * roadHalfScale);
    const r = f.binormal.clone().multiplyScalar(f.halfWidth * roadHalfScale);
    const lp = f.pos.clone().add(l);
    const rp = f.pos.clone().add(r);
    positions.push(lp.x, lp.y, lp.z, rp.x, rp.y, rp.z);
    normals.push(f.normal.x, f.normal.y, f.normal.z, f.normal.x, f.normal.y, f.normal.z);
    uvs.push(0, v, 1, v);
    if (i < n) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    const skirtDrop = 0.65;
    const lipOut = 0.12;
    const lb = lp.clone().addScaledVector(f.binormal, -lipOut).addScaledVector(f.normal, -skirtDrop);
    const rb = rp.clone().addScaledVector(f.binormal, lipOut).addScaledVector(f.normal, -skirtDrop);
    skirtPositions.push(lp.x, lp.y, lp.z, lb.x, lb.y, lb.z, rp.x, rp.y, rp.z, rb.x, rb.y, rb.z);
    const nl = f.binormal.clone().multiplyScalar(-1);
    const nr = f.binormal.clone();
    skirtNormals.push(nl.x, nl.y, nl.z, nl.x, nl.y, nl.z, nr.x, nr.y, nr.z, nr.x, nr.y, nr.z);
    skirtUvs.push(0, v, 0, v - skirtDrop * uvVScale, 0, v, 0, v - skirtDrop * uvVScale);
    if (i < n) {
      const a = i * 4;
      skirtIndices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
      skirtIndices.push(a + 2, a + 3, a + 6, a + 3, a + 6, a + 7);
    }
  }

  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.82,
    metalness: 0.05,
  });
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  group.add(roadMesh);

  const skirtMat = new THREE.MeshBasicMaterial({ color: 0x14181f, side: THREE.DoubleSide });
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirtGeo.setAttribute('normal', new THREE.Float32BufferAttribute(skirtNormals, 3));
  skirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUvs, 2));
  skirtGeo.setIndex(skirtIndices);
  group.add(new THREE.Mesh(skirtGeo, skirtMat));

  const stripePositions: number[] = [];
  const stripeNormals: number[] = [];
  const stripeUvs: number[] = [];
  const stripeIndices: number[] = [];
  for (let i = 0; i <= n; i++) {
    const f = frames[i % n];
    const v = f.dist * uvVScale * 4;
    for (const side of [-1, 1]) {
      const inner = f.pos.clone().addScaledVector(f.binormal, side * (f.halfWidth - 0.55));
      const outer = f.pos.clone().addScaledVector(f.binormal, side * (f.halfWidth - 0.05));
      stripePositions.push(inner.x, inner.y + 0.02, inner.z, outer.x, outer.y + 0.02, outer.z);
      stripeNormals.push(f.normal.x, f.normal.y, f.normal.z, f.normal.x, f.normal.y, f.normal.z);
      stripeUvs.push(0, v, 0.18, v);
    }
    if (i < n) {
      const aL = i * 4;
      stripeIndices.push(aL, aL + 4, aL + 1, aL + 1, aL + 4, aL + 5);
      const aR = i * 4 + 2;
      stripeIndices.push(aR, aR + 4, aR + 1, aR + 1, aR + 4, aR + 5);
    }
  }
  const stripeMat = new THREE.MeshBasicMaterial({ color: def.accent });
  const stripeGeo = new THREE.BufferGeometry();
  stripeGeo.setAttribute('position', new THREE.Float32BufferAttribute(stripePositions, 3));
  stripeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(stripeNormals, 3));
  stripeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(stripeUvs, 2));
  stripeGeo.setIndex(stripeIndices);
  group.add(new THREE.Mesh(stripeGeo, stripeMat));

  const boostPads: TrackMeshes['boostPads'] = [];
  const chevronTex = makeChevronTexture('#7ef3ff');
  for (const b of def.boosts) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(b.dist, f);
    const w = Math.min(3.4, f.halfWidth * 0.7);
    const geo = new THREE.PlaneGeometry(w * 2, 7);
    const mat = new THREE.MeshBasicMaterial({
      map: chevronTex.clone(),
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
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x7ef3ff, transparent: true, opacity: 0.9 });
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
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a2032, roughness: 0.6, metalness: 0.3 });
  const bannerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 512;
  bannerCanvas.height = 96;
  const bctx = bannerCanvas.getContext('2d')!;
  bctx.fillStyle = '#0d1222';
  bctx.fillRect(0, 0, 512, 96);
  bctx.fillStyle = accentHex;
  bctx.fillRect(0, 0, 512, 10);
  bctx.fillRect(0, 86, 512, 10);
  bctx.font = '700 56px Rajdhani, sans-serif';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillStyle = '#ffffff';
  bctx.fillText('START / FINISH', 256, 50);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  bannerMat.map = bannerTex;
  bannerMat.color.set(0xffffff);
  const w0 = startF.halfWidth + 0.6;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w0 * 2, 1.8, 0.3), bannerMat);
  banner.position.copy(startF.pos).addScaledVector(startF.normal, 5.6);
  const pl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.6, 0.8), pillarMat);
  pl.position.copy(startF.pos).addScaledVector(startF.binormal, -w0).addScaledVector(startF.normal, 2.8);
  const pr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.6, 0.8), pillarMat);
  pr.position.copy(startF.pos).addScaledVector(startF.binormal, w0).addScaledVector(startF.normal, 2.8);
  gateGroup.add(banner, pl, pr);
  gateGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(startF.normal, startF.tangent).normalize(), startF.normal, startF.tangent));
  group.add(gateGroup);

  return { group, boostPads, checkpointGates, roadMat };
}
