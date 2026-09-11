import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TrackCurve } from '../track/curve';
import type { ThemeId } from '../track/defs';

function vineColor(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

function pineGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  const c1 = new THREE.ConeGeometry(1.7, 2.6, 7);
  c1.translate(0, 3.1, 0);
  const c2 = new THREE.ConeGeometry(1.25, 2.2, 7);
  c2.translate(0, 4.6, 0);
  const c3 = new THREE.ConeGeometry(0.8, 1.8, 7);
  c3.translate(0, 5.9, 0);
  const merged = mergeGeometries([trunk, c1, c2, c3].map(g => g.toNonIndexed()))!;
  const count = merged.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const brown = vineColor(0x5a4630);
  const green = vineColor(0x3f6b3a);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = merged.getAttribute('position').getY(i);
    c.copy(y < 2.2 ? brown : green).multiplyScalar(0.85 + Math.random() * 0.3);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

function cactusGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.32, 0.4, 3.4, 7);
  body.translate(0, 1.7, 0);
  const armL = new THREE.CylinderGeometry(0.2, 0.22, 1.3, 6);
  armL.rotateZ(1.1);
  armL.translate(-0.75, 1.9, 0);
  const armR = new THREE.CylinderGeometry(0.2, 0.22, 1.1, 6);
  armR.rotateZ(-1.2);
  armR.translate(0.7, 1.5, 0);
  const merged = mergeGeometries([body, armL, armR].map(g => g.toNonIndexed()))!;
  const count = merged.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const green = vineColor(0x4f7a44);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    c.copy(green).multiplyScalar(0.8 + Math.random() * 0.4);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

function joshuaGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 1.8, 6);
  trunk.translate(0, 0.9, 0);
  const blobs: THREE.BufferGeometry[] = [trunk];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.IcosahedronGeometry(0.65 + Math.random() * 0.35, 0);
    const a = (i / 5) * Math.PI * 2;
    b.translate(Math.cos(a) * 0.8, 2.1 + Math.random() * 0.5, Math.sin(a) * 0.8);
    blobs.push(b);
  }
  const merged = mergeGeometries(blobs.map(g => g.toNonIndexed()))!;
  const count = merged.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = merged.getAttribute('position').getY(i);
    c.set(y < 1.8 ? 0x6a4f34 : 0x7d9a4f).multiplyScalar(0.8 + Math.random() * 0.35);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

function pylonGeometry(): THREE.BufferGeometry {
  const post = new THREE.BoxGeometry(0.3, 5.2, 0.3);
  post.translate(0, 2.6, 0);
  const top = new THREE.BoxGeometry(0.9, 0.5, 0.9);
  top.translate(0, 5.2, 0);
  const merged = mergeGeometries([post, top].map(g => g.toNonIndexed()))!;
  const count = merged.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = merged.getAttribute('position').getY(i);
    c.set(y > 4.6 ? 0x36f0ff : 0x1a2030).multiplyScalar(0.9 + Math.random() * 0.2);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

function billboardGeometry(): THREE.BufferGeometry {
  const legs = new THREE.BoxGeometry(0.4, 3.4, 0.4);
  legs.translate(0, 1.7, 0);
  const board = new THREE.BoxGeometry(5.4, 2.4, 0.18);
  board.translate(0, 4.2, 0);
  const merged = mergeGeometries([legs, board].map(g => g.toNonIndexed()))!;
  const count = merged.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const y = merged.getAttribute('position').getY(i);
    c.set(y > 3 ? 0x12151f : 0x232a3c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

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

export function buildTrackProps(curve: TrackCurve, theme: ThemeId, quality: 'low' | 'medium' | 'high'): THREE.Group {
  const group = new THREE.Group();
  const DISABLED = false;
  if (DISABLED) return group;
  const rng = (() => {
    let s = 90210;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const frames = curve.frames;
  const step = quality === 'low' ? 36 : 18;
  const mats: THREE.InstancedMesh[] = [];

  const geoMap: Partial<Record<ThemeId, { geo: THREE.BufferGeometry; kind: string }[]>> = {
    alpine: [
      { geo: pineGeometry(), kind: 'pine' },
      { geo: pineGeometry(), kind: 'pine' },
    ],
    canyon: [
      { geo: cactusGeometry(), kind: 'cactus' },
      { geo: pineGeometry(), kind: 'spire' },
    ],
    neon: [
      { geo: pylonGeometry(), kind: 'pylon' },
      { geo: billboardGeometry(), kind: 'billboard' },
    ],
    mesa: [
      { geo: joshuaGeometry(), kind: 'joshua' },
      { geo: pineGeometry(), kind: 'spire' },
    ],
  };
  const kinds = geoMap[theme] ?? [];

  const dummies = kinds.map(() => new THREE.Object3D());
  const meshes = kinds.map((k) => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const im = new THREE.InstancedMesh(k.geo, mat, 400);
    im.count = 0;
    im.castShadow = quality !== 'low';
    mats.push(im);
    group.add(im);
    return im;
  });

  const billboardTex = makeBillboardTexture();

  for (let i = 0; i < frames.length; i += step) {
    const f = frames[i];
    if (f.dist < 30 || f.dist > curve.length - 30) continue;
    if (rng() < 0.25) continue;
    const side = rng() > 0.5 ? 1 : -1;
    const lateral = side * (f.halfWidth + 5 + rng() * 30);
    const pos = f.pos.clone().addScaledVector(f.binormal, lateral);
    pos.y -= 0.4;

    if (theme === 'neon' && rng() < 0.12) {
      const im = meshes[1];
      if (im.count < 400) {
        const d = dummies[1];
        d.position.copy(pos);
        d.position.y = f.pos.y + 2.2;
        d.rotation.y = Math.atan2(f.tangent.x, f.tangent.z) + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        d.scale.setScalar(0.8 + rng() * 0.5);
        d.updateMatrix();
        im.setMatrixAt(im.count++, d.matrix);
        const tex = new THREE.MeshBasicMaterial({ map: billboardTex });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), tex);
        face.position.copy(d.position);
        face.position.y += 2;
        face.rotation.y = d.rotation.y;
        group.add(face);
      }
      continue;
    }

    const kindIdx = rng() < 0.65 ? 0 : 1;
    const im = meshes[kindIdx];
    if (im.count >= 400) continue;
    const d = dummies[kindIdx];
    d.position.copy(pos);
    d.rotation.y = rng() * Math.PI * 2;
    const scaleBase = kinds[kindIdx].kind === 'pine' ? 0.8 : 1;
    d.scale.setScalar((scaleBase * (0.7 + rng() * 0.8)) * (kinds[kindIdx].kind === 'spire' ? 1.6 : 1));
    if (kinds[kindIdx].kind === 'spire') d.position.y -= 0.5;
    d.updateMatrix();
    im.setMatrixAt(im.count++, d.matrix);
  }
  for (const im of mats) im.instanceMatrix.needsUpdate = true;

  const grandstand = new THREE.Group();
  const standMat = new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.9 });
  for (let r = 0; r < 4; r++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(26, 0.8, 1.6), standMat);
    row.position.set(0, 0.5 + r * 0.8, -r * 1.7);
    grandstand.add(row);
    const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 5, 4), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 26);
    const cd = new THREE.Object3D();
    const palette = [0x29e6ff, 0xffb52e, 0xff4d6d, 0x7dff6e, 0xffffff].map((h) => new THREE.Color(h));
    for (let c = 0; c < 26; c++) {
      cd.position.set(-12 + c, 1.15 + r * 0.8, -r * 1.7);
      cd.updateMatrix();
      crowd.setMatrixAt(c, cd.matrix);
      crowd.setColorAt(c, palette[Math.floor(rng() * palette.length)]);
    }
    grandstand.add(crowd);
  }
  const f0 = frames[0];
  grandstand.position.copy(f0.pos).addScaledVector(f0.binormal, -(f0.halfWidth + 14)).addScaledVector(f0.normal, 0.2);
  grandstand.rotation.y = Math.atan2(f0.tangent.x, f0.tangent.z);
  group.add(grandstand);

  const bbs: [number, number][] = [
    [14, 1],
    [-curve.length * 0.45, -1],
  ];
  for (const [dist, side] of bbs) {
    const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
    curve.frameAtDist(dist, f);
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: billboardTex, side: THREE.DoubleSide }));
    bb.position.copy(f.pos).addScaledVector(f.binormal, side * (f.halfWidth + 10)).addScaledVector(f.normal, 3);
    bb.lookAt(f.pos.clone().addScaledVector(f.binormal, side * f.halfWidth).addScaledVector(f.normal, 1.5));
    group.add(bb);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), standMat);
    leg.position.copy(bb.position).addScaledVector(f.normal, -1.8);
    group.add(leg);
  }

  return group;
}
