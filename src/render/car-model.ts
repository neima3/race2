import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface CarVisual {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Mesh[];
  wheelSpin: number;
  bodyMat: THREE.MeshStandardMaterial;
  setPaint(color: number): void;
  setBodyPose(roll: number, pitch: number, squash: number): void;
}

export type CarBodyStyle = 'standard' | 'aero' | 'tank';

export const PAINTS: { name: string; color: number }[] = [
  { name: 'Cyan Flux', color: 0x29e6ff },
  { name: 'Solar', color: 0xffb52e },
  { name: 'Rose Rush', color: 0xff4d6d },
  { name: 'Volt', color: 0x7dff6e },
  { name: 'Ultra', color: 0xb44dff },
  { name: 'Magma', color: 0xff5c39 },
  { name: 'Frost', color: 0xe8f2ff },
  { name: 'Midnight', color: 0x223055 },
  { name: 'Lime Pop', color: 0xc8ff2e },
  { name: 'Copper', color: 0xd78a4a },
];

// ---- shared resource caches: one GPU copy of every static geometry/material across all cars ----
const sharedGeos = new Map<string, THREE.BufferGeometry>();
const sharedMats = new Map<string, THREE.Material>();

function sharedGeo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = sharedGeos.get(key);
  if (!g) {
    g = build();
    g.userData.shared = true;
    sharedGeos.set(key, g);
  }
  return g;
}

function sharedMat<T extends THREE.Material>(key: string, build: () => T): T {
  let m = sharedMats.get(key) as T | undefined;
  if (!m) {
    m = build();
    m.userData.shared = true;
    sharedMats.set(key, m);
  }
  return m;
}

interface PartSpec {
  geo: THREE.BufferGeometry;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

function bakeParts(parts: PartSpec[]): THREE.BufferGeometry {
  const baked = parts.map((p) => {
    const g = p.geo.index ? p.geo.clone() : p.geo.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0));
    m.compose(
      new THREE.Vector3(p.pos?.[0] ?? 0, p.pos?.[1] ?? 0, p.pos?.[2] ?? 0),
      q,
      new THREE.Vector3(p.scale?.[0] ?? 1, p.scale?.[1] ?? 1, p.scale?.[2] ?? 1),
    );
    g.applyMatrix4(m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(baked, false);
  if (!merged) throw new Error('car-model: part merge failed');
  for (const b of baked) b.dispose();
  merged.userData.shared = true;
  return merged;
}

function noseGeometry(): THREE.BufferGeometry {
  const noseGeo = new THREE.BufferGeometry();
  noseGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.68, 0.2, 1.7, 0.68, 0.2, 1.7, 0.68, 0.62, 1.55, -0.68, 0.62, 1.55, -0.68, 0.2, 3.05, 0.68, 0.2, 3.05, 0.06, 0.5, 3.3, -0.06, 0.5, 3.3],
      3,
    ),
  );
  noseGeo.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 4, 5, 6, 4, 6, 7, 3, 4, 7, 3, 7, 0, 1, 2, 6, 1, 5, 6, 2, 6, 5]);
  noseGeo.computeVertexNormals();
  return noseGeo;
}

export function buildCarVisual(paintColor = 0x29e6ff, ghost = false, style: CarBodyStyle = 'standard', headlights = false): CarVisual {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const ghostFlags = { transparent: ghost, opacity: ghost ? 1 : 1, depthWrite: !ghost };
  void ghostFlags;

  if (ghost) {
    const gBodyMat = buildLegacyGhost(group, bodyGroup, paintColor);
    return finishVisual(group, bodyGroup, gBodyMat, [], false);
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    color: paintColor,
    roughness: 0.28,
    metalness: 0.55,
  });
  const darkMat = sharedMat('dark', () => new THREE.MeshStandardMaterial({ color: 0x12151f, roughness: 0.5, metalness: 0.4 }));
  const accentMat = sharedMat('accent', () => new THREE.MeshBasicMaterial({ color: 0xff3355 }));
  const glassMat = sharedMat('glass', () => new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }));
  const helmetMat = sharedMat('helmet', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  const lightMat = sharedMat('lamp', () => new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  const wheelMat = sharedMat('wheel', () => new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.85 }));
  const hubMat = sharedMat('hub', () => new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.3, metalness: 0.8 }));
  const discMat = sharedMat('disc', () => new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5, emissive: 0x330b00 }));

  const accent2Mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(paintColor).offsetHSL(0.5, 0, 0.08),
  });

  const chassisH = style === 'tank' ? 0.45 : 0.34;
  const stripeY = chassisH / 2 + 0.42 + 0.011;
  const pontoonW = style === 'tank' ? 0.34 : style === 'aero' ? 0.2 : 0.26;
  const wingW = style === 'aero' ? 2.25 : style === 'tank' ? 1.7 : 1.9;
  const wingH = style === 'aero' ? 0.06 : 0.09;

  const bodyCastGeo = sharedGeo(`bodyCast:${style}`, () => bakeParts([
    { geo: new THREE.BoxGeometry(style === 'tank' ? 1.95 : style === 'aero' ? 1.55 : 1.7, chassisH, 3.4), pos: [0, 0.42, 0] },
    { geo: sharedGeo('nose', noseGeometry), pos: [0, 0.05, -1.55] },
    { geo: new THREE.BoxGeometry(wingW, wingH, 0.5), pos: [0, 1.02, -1.72] },
  ]));
  const darkCastGeo = sharedGeo(`darkCast:${style}`, () => bakeParts([
    { geo: new THREE.BoxGeometry(pontoonW, 0.26, 2.1), pos: [-(1.7 / 2 + pontoonW / 2 - 0.02), 0.4, -0.35] },
    { geo: new THREE.BoxGeometry(pontoonW, 0.26, 2.1), pos: [1.7 / 2 + pontoonW / 2 - 0.02, 0.4, -0.35] },
  ]));
  const darkGeo = sharedGeo(`dark:${style}`, () => bakeParts([
    { geo: new THREE.BoxGeometry(1.5, 0.06, 0.5), pos: [0, 0.24, 1.6] },
    { geo: new THREE.BoxGeometry(1.5, 0.2, 0.4), pos: [0, 0.3, -1.75] },
    { geo: new THREE.TorusGeometry(0.38, 0.05, 6, 14, Math.PI), rot: [-Math.PI / 2, 0, 0], pos: [0, 0.84, -0.1] },
    { geo: new THREE.BoxGeometry(0.1, 0.4, 0.3), pos: [0, 0.82, -1.7] },
    { geo: new THREE.BoxGeometry(0.7, 0.4, 1.3), pos: [0, 0.72, -1.0] },
  ]));
  const accent2Geo = sharedGeo(`accent2:${style}`, () => bakeParts([
    { geo: new THREE.BoxGeometry(0.14, 0.02, 1.4), pos: [-0.22, stripeY, 0.6] },
    { geo: new THREE.BoxGeometry(0.14, 0.02, 1.4), pos: [0.22, stripeY, 0.6] },
    { geo: new THREE.BoxGeometry(0.14, 0.02, 1.4), pos: [-0.22, stripeY, -0.4] },
    { geo: new THREE.BoxGeometry(0.14, 0.02, 1.4), pos: [0.22, stripeY, -0.4] },
    { geo: new THREE.CapsuleGeometry(0.05, 0.28, 3, 6), rot: [Math.PI / 2.2, 0, 0], pos: [-0.16, 0.62, 0.22] },
    { geo: new THREE.CapsuleGeometry(0.05, 0.28, 3, 6), rot: [Math.PI / 2.2, 0, 0], pos: [0.16, 0.62, 0.22] },
  ]));
  const glassGeo = sharedGeo('glass', () => bakeParts([
    { geo: new THREE.SphereGeometry(0.42, 12, 8), scale: [0.85, 0.62, 1.15], pos: [0, 0.72, -0.15] },
  ]));
  const helmetGeo = sharedGeo('helmet', () => bakeParts([
    { geo: new THREE.SphereGeometry(0.24, 10, 8), pos: [0, 0.86, -0.18] },
  ]));
  const accentGeo = sharedGeo('accent', () => bakeParts([
    { geo: new THREE.BoxGeometry(0.06, 0.3, 0.6), pos: [-0.85, 1.02, -1.72] },
    { geo: new THREE.BoxGeometry(0.06, 0.3, 0.6), pos: [0.85, 1.02, -1.72] },
  ]));
  const lampGeo = sharedGeo('lamp', () => bakeParts([
    { geo: new THREE.BoxGeometry(0.28, 0.1, 0.06), pos: [-0.5, 0.42, 1.78] },
    { geo: new THREE.BoxGeometry(0.28, 0.1, 0.06), pos: [0.5, 0.42, 1.78] },
  ]));

  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast: boolean) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    bodyGroup.add(mesh);
  };
  addMesh(bodyCastGeo, bodyMat, true);
  addMesh(darkCastGeo, darkMat, true);
  addMesh(darkGeo, darkMat, false);
  addMesh(accent2Geo, accent2Mat, false);
  addMesh(glassGeo, glassMat, false);
  addMesh(helmetGeo, helmetMat, false);
  addMesh(accentGeo, accentMat, false);
  addMesh(lampGeo, lightMat, false);

  const wheelGeo = sharedGeo('wheel', () => {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const hubGeo = sharedGeo('hub', () => {
    const g = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const discGeo = sharedGeo('disc', () => {
    const g = new THREE.TorusGeometry(0.2, 0.035, 6, 16);
    g.rotateY(Math.PI / 2);
    return g;
  });

  const wheels: THREE.Mesh[] = [];
  const wheelPos: [number, number, number][] = [
    [-0.88, 0.34, 1.12],
    [0.88, 0.34, 1.12],
    [-0.92, 0.36, -1.18],
    [0.92, 0.36, -1.18],
  ];
  for (const [x, y, z] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(hub);
    const disc = new THREE.Mesh(discGeo, discMat);
    wheel.add(disc);
    group.add(wheel);
    wheels.push(wheel);
  }

  if (headlights) {
    const spot = new THREE.SpotLight(0xf2f6ff, 410, 85, 0.55, 0.6, 1.5);
    spot.position.set(0, 0.85, 1.7);
    spot.castShadow = false;
    const target = new THREE.Object3D();
    target.position.set(0, -0.6, 26);
    group.add(target);
    spot.target = target;
    group.add(spot);
  }

  return finishVisual(group, bodyGroup, bodyMat, wheels, true);
}

// Ghost cars keep the original per-part build (pixel-identical translucency sort order)
// and own their resources (disposed on track teardown — one ghost exists at a time).
function buildLegacyGhost(group: THREE.Group, bodyGroup: THREE.Group, paintColor: number): THREE.MeshStandardMaterial {
  const gm = (opacity: number, depthWrite: boolean) => ({ transparent: true, opacity, depthWrite });
  const bodyMat = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.28, metalness: 0.55, ...gm(0.32, false) });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x12151f, roughness: 0.5, metalness: 0.4, ...gm(0.3, false) });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0xff3355, ...gm(0.25, false) });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.1, ...gm(0.2, false) });
  const accent2Mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(paintColor).offsetHSL(0.5, 0, 0.08), ...gm(0.25, false) });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.85, ...gm(0.3, false) });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.3, metalness: 0.8, ...gm(0.3, false) });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    bodyGroup.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(1.7, 0.34, 3.4), bodyMat, 0, 0.42, 0);
  for (const z of [0.6, -0.4]) {
    add(new THREE.BoxGeometry(0.14, 0.02, 1.4), accent2Mat, -0.22, 0.34 / 2 + 0.42 + 0.011, z);
    add(new THREE.BoxGeometry(0.14, 0.02, 1.4), accent2Mat, 0.22, 0.34 / 2 + 0.42 + 0.011, z);
  }
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.26, 0.26, 2.1), darkMat, sx * (1.7 / 2 + 0.26 / 2 - 0.02), 0.4, -0.35);
  }
  add(new THREE.BoxGeometry(1.5, 0.06, 0.5), darkMat, 0, 0.24, 1.6);
  add(new THREE.BoxGeometry(1.5, 0.2, 0.4), darkMat, 0, 0.3, -1.75);
  const nose = add(noseGeometry(), bodyMat, 0, 0.05, -1.55);
  void nose;
  const cockpit = add(new THREE.SphereGeometry(0.42, 12, 8), glassMat, 0, 0.72, -0.15);
  cockpit.scale.set(0.85, 0.62, 1.15);
  add(new THREE.SphereGeometry(0.24, 10, 8), helmetMat, 0, 0.86, -0.18);
  for (const sx of [-0.16, 0.16]) {
    const arm = add(new THREE.CapsuleGeometry(0.05, 0.28, 3, 6), accent2Mat, sx, 0.62, 0.22);
    arm.rotation.x = Math.PI / 2.2;
  }
  const halo = add(new THREE.TorusGeometry(0.38, 0.05, 6, 14, Math.PI), darkMat, 0, 0.84, -0.1);
  halo.rotation.x = -Math.PI / 2;
  add(new THREE.BoxGeometry(1.9, 0.09, 0.5), bodyMat, 0, 1.02, -1.72);
  add(new THREE.BoxGeometry(0.1, 0.4, 0.3), darkMat, 0, 0.82, -1.7);
  for (const sx of [-0.85, 0.85]) {
    add(new THREE.BoxGeometry(0.06, 0.3, 0.6), accentMat, sx, 1.02, -1.72);
  }
  add(new THREE.BoxGeometry(0.7, 0.4, 1.3), darkMat, 0, 0.72, -1.0);
  for (const sx of [-0.5, 0.5]) {
    add(new THREE.BoxGeometry(0.28, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), sx, 0.42, 1.78);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const wheelPos: [number, number, number][] = [
    [-0.88, 0.34, 1.12],
    [0.88, 0.34, 1.12],
    [-0.92, 0.36, -1.18],
    [0.92, 0.36, -1.18],
  ];
  for (const [x, y, z] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, y, z);
    wheel.add(new THREE.Mesh(hubGeo, hubMat));
    const disc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5, emissive: 0x330b00 }));
    disc.rotation.y = Math.PI / 2;
    wheel.add(disc);
    group.add(wheel);
  }
  return bodyMat;
}

function finishVisual(group: THREE.Group, bodyGroup: THREE.Group, bodyMat: THREE.MeshStandardMaterial | null, wheels: THREE.Mesh[], _merged: boolean): CarVisual {
  let wheelSpin = 0;
  let squashSpring = { v: 0, x: 0 };
  return {
    group,
    bodyGroup,
    wheels,
    get wheelSpin() {
      return wheelSpin;
    },
    set wheelSpin(v: number) {
      wheelSpin = v;
    },
    bodyMat: bodyMat as THREE.MeshStandardMaterial,
    setPaint(color: number) {
      bodyMat?.color.set(color);
    },
    setBodyPose(roll: number, pitch: number, squash: number) {
      bodyGroup.rotation.z = roll;
      bodyGroup.rotation.x = pitch;
      const target = 1 - squash;
      const accel = (target - squashSpring.x) * 140 - squashSpring.v * 14;
      squashSpring.v += accel * 0.016;
      squashSpring.x += squashSpring.v * 0.016;
      bodyGroup.scale.y = Math.max(0.6, squashSpring.x);
      bodyGroup.position.y = (1 - squashSpring.x) * 0.18;
    },
  };
}
