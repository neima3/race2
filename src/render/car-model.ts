import * as THREE from 'three';

export interface CarVisual {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Mesh[];
  wheelSpin: number;
  bodyMat: THREE.MeshStandardMaterial;
  setPaint(color: number): void;
  setBodyPose(roll: number, pitch: number, squash: number): void;
}

export function buildCarVisual(paintColor = 0x29e6ff, ghost = false): CarVisual {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: paintColor,
    roughness: 0.28,
    metalness: 0.55,
    transparent: ghost,
    opacity: ghost ? 0.32 : 1,
    depthWrite: !ghost,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x12151f,
    roughness: 0.5,
    metalness: 0.4,
    transparent: ghost,
    opacity: ghost ? 0.3 : 1,
    depthWrite: !ghost,
  });
  const accentMat = new THREE.MeshBasicMaterial({
    color: 0xff3355,
    transparent: ghost,
    opacity: ghost ? 0.25 : 1,
    depthWrite: !ghost,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: ghost ? 0.2 : 0.85,
    depthWrite: !ghost,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 3.4), bodyMat);
  chassis.position.y = 0.42;
  chassis.castShadow = !ghost;
  bodyGroup.add(chassis);

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
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.set(0, 0.05, -1.55);
  nose.castShadow = !ghost;
  bodyGroup.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), glassMat);
  cockpit.scale.set(0.85, 0.62, 1.15);
  cockpit.position.set(0, 0.72, -0.15);
  bodyGroup.add(cockpit);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  helmet.position.set(0, 0.86, -0.18);
  bodyGroup.add(helmet);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 14, Math.PI), darkMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, 0.84, -0.1);
  bodyGroup.add(halo);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), bodyMat);
  wing.position.set(0, 1.02, -1.72);
  wing.castShadow = !ghost;
  bodyGroup.add(wing);

  const wingPylon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.3), darkMat);
  wingPylon.position.set(0, 0.82, -1.7);
  bodyGroup.add(wingPylon);
  for (const sx of [-0.85, 0.85]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.6), accentMat);
    endplate.position.set(sx, 1.02, -1.72);
    bodyGroup.add(endplate);
  }

  const engineCover = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 1.3), darkMat);
  engineCover.position.set(0, 0.72, -1.0);
  bodyGroup.add(engineCover);

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const sx of [-0.5, 0.5]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.06), lightMat);
    lamp.position.set(sx, 0.42, 1.78);
    bodyGroup.add(lamp);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.85, transparent: ghost, opacity: ghost ? 0.3 : 1, depthWrite: !ghost });
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.3, metalness: 0.8, transparent: ghost, opacity: ghost ? 0.3 : 1, depthWrite: !ghost });

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
    wheel.castShadow = !ghost;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheel.add(hub);
    group.add(wheel);
    wheels.push(wheel);
  }

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
    bodyMat,
    setPaint(color: number) {
      bodyMat.color.set(color);
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
