import * as THREE from 'three';
import type { ThemeDef } from '../track/defs';

function makeSkyMaterial(theme: ThemeDef): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(theme.skyTop) },
      midColor: { value: new THREE.Color(theme.skyMid) },
      horizonColor: { value: new THREE.Color(theme.skyHorizon) },
      sunColor: { value: new THREE.Color(theme.sunColor) },
      sunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.18, h));
        col = mix(col, topColor, smoothstep(0.18, 0.65, h));
        float sunAmt = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * pow(sunAmt, 350.0) * 1.6;
        col += sunColor * pow(sunAmt, 18.0) * 0.32;
        col += vec3(1.0, 0.75, 0.45) * pow(sunAmt, 3.5) * 0.12;
        float stars = step(0.9993, fract(sin(dot(floor(vDir * 260.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453));
        col += stars * smoothstep(0.05, 0.4, h) * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeMesa(rng: () => number, radius: number, height: number): THREE.BufferGeometry {
  const segments = 9;
  const positions: number[] = [];
  const indices: number[] = [];
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const rr = radius * (0.75 + rng() * 0.5);
    verts.push(new THREE.Vector3(Math.cos(a) * rr, height * (0.55 + rng() * 0.3), Math.sin(a) * rr));
  }
  positions.push(0, 0, 0);
  for (const v of verts) positions.push(v.x, v.y, v.z);
  positions.push(0, height, 0);
  const topIdx = positions.length / 3 - 1;
  for (let i = 0; i < segments; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % segments);
    indices.push(0, b, a);
    indices.push(a, b, topIdx);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export interface Environment {
  group: THREE.Group;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  update(cameraPos: THREE.Vector3): void;
}

export function buildEnvironment(scene: THREE.Scene, theme: ThemeDef, quality: 'low' | 'medium' | 'high'): Environment {
  const group = new THREE.Group();
  scene.add(group);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 18), makeSkyMaterial(theme));
  group.add(sky);

  scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);

  const sunLight = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  const sunOffset = new THREE.Vector3(...theme.sunDir).normalize().multiplyScalar(460);
  if (quality !== 'low') {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    sunLight.shadow.camera.near = 60;
    sunLight.shadow.camera.far = 700;
    const s = 90;
    sunLight.shadow.camera.left = -s;
    sunLight.shadow.camera.right = s;
    sunLight.shadow.camera.top = s;
    sunLight.shadow.camera.bottom = -s;
    sunLight.shadow.bias = -0.0004;
  }
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 0.85);
  scene.add(hemiLight);

  const groundMat = new THREE.MeshStandardMaterial({ color: theme.groundColor, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3600, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  group.add(ground);

  const rng = seededRandom(1337);
  const mesaMat = new THREE.MeshStandardMaterial({ color: theme.mesaColor, roughness: 0.95, flatShading: true });
  const mesaMatFar = new THREE.MeshStandardMaterial({ color: theme.mesaFarColor, roughness: 1, flatShading: true });
  const mesaGeoCache = new Map<string, THREE.BufferGeometry>();
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const dist = 700 + rng() * 2300;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    const radius = 90 + rng() * 260;
    const height = radius * (0.5 + rng() * 0.9);
    const key = `${Math.round(radius)}-${Math.round(height)}`;
    let geo = mesaGeoCache.get(key);
    if (!geo) {
      geo = makeMesa(rng, radius, height);
      mesaGeoCache.set(key, geo);
    }
    const far = dist > 1600;
    const m = new THREE.Mesh(geo, far ? mesaMatFar : mesaMat);
    m.position.set(x, height * 0.18 - 2, z);
    m.rotation.y = rng() * Math.PI * 2;
    group.add(m);
  }

  const rockMat = new THREE.MeshStandardMaterial({ color: theme.rockColor, roughness: 1, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 140);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 140; i++) {
    const a = rng() * Math.PI * 2;
    const dist = 60 + rng() * 500;
    dummy.position.set(Math.cos(a) * dist, -1.2 + rng() * 0.8, Math.sin(a) * dist);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const sc = 0.8 + rng() * 5;
    dummy.scale.set(sc * (0.7 + rng() * 0.6), sc * (0.5 + rng() * 0.5), sc);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  group.add(rocks);

  const cloudMat = new THREE.MeshBasicMaterial({ color: theme.cloudColor, transparent: true, opacity: theme.cloudOpacity, fog: false });
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 4);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(26 + rng() * 34, 10, 8), cloudMat);
      puff.position.set((rng() - 0.5) * 90, (rng() - 0.5) * 16, (rng() - 0.5) * 50);
      puff.scale.y = 0.42;
      cloud.add(puff);
    }
    const a = rng() * Math.PI * 2;
    const dist = 900 + rng() * 1900;
    cloud.position.set(Math.cos(a) * dist, 240 + rng() * 320, Math.sin(a) * dist);
    clouds.add(cloud);
  }
  group.add(clouds);

  const update = (cameraPos: THREE.Vector3): void => {
    sky.position.copy(cameraPos);
    ground.position.x = cameraPos.x;
    ground.position.z = cameraPos.z;
    sunLight.target.position.copy(cameraPos);
    sunLight.position.copy(cameraPos).add(sunOffset);
  };

  return { group, sunLight, hemiLight, update };
}
