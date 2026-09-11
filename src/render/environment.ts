import * as THREE from 'three';
import type { ThemeDef } from '../track/defs';
import type { TrackCurve } from '../track/curve';

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
  animate(t: number, dt: number): void;
}

export function buildEnvironment(scene: THREE.Scene, theme: ThemeDef, quality: 'low' | 'medium' | 'high', curveRef: TrackCurve): Environment {
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

  let groundMat: THREE.Material;
  if (theme.ambientSound === 'synth') {
    const gc = document.createElement('canvas');
    gc.width = 256;
    gc.height = 256;
    const gx = gc.getContext('2d')!;
    gx.fillStyle = '#10131f';
    gx.fillRect(0, 0, 256, 256);
    gx.strokeStyle = 'rgba(54, 240, 255, 0.16)';
    gx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      gx.beginPath();
      gx.moveTo(i, 0);
      gx.lineTo(i, 256);
      gx.moveTo(0, i);
      gx.lineTo(256, i);
      gx.stroke();
    }
    const gtex = new THREE.CanvasTexture(gc);
    gtex.wrapS = THREE.RepeatWrapping;
    gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(60, 60);
    groundMat = new THREE.MeshStandardMaterial({ map: gtex, color: theme.groundColor, roughness: 0.8, emissive: 0x0a1a24, emissiveIntensity: 0.6 });
  } else {
    groundMat = new THREE.MeshStandardMaterial({ color: theme.groundColor, roughness: 1 });
  }
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
  const cloudDirs: number[] = [];
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
    cloudDirs.push(0.6 + rng() * 0.8);
    clouds.add(cloud);
  }
  group.add(clouds);

  let fireflies: THREE.Points | null = null;
  if (theme.ambientSound === 'synth') {
    const N = 90;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rng() - 0.5) * 700;
      pos[i * 3 + 1] = 1.5 + rng() * 7;
      pos[i * 3 + 2] = (rng() - 0.5) * 700;
      seed[i] = rng() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float seed;
        uniform float uTime;
        varying float vTw;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.4 + seed) * 3.0;
          p.y += sin(uTime * 0.7 + seed * 2.0) * 1.2;
          vTw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.2 + seed * 3.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 7.0 * (120.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vTw;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(0.55, 1.0, 0.75, a * vTw);
        }
      `,
    });
    fireflies = new THREE.Points(geo, mat);
    fireflies.frustumCulled = false;
    group.add(fireflies);
  }

  const birds = new THREE.Group();
  if (theme.ambientSound === 'birds') {
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2c3242, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.6, 0.25, -0.5, 1.6, 0.25, 0.5], 3));
      wingGeo.computeVertexNormals();
      const wl = new THREE.Mesh(wingGeo, birdMat);
      const wr = wl.clone();
      wr.scale.x = -1;
      b.add(wl, wr);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 220, 90 + Math.sin(i * 2.1) * 22, Math.sin(a) * 220);
      b.userData = { angle: a, flap: rng() * Math.PI * 2, wl, wr, r: 220, h: 90 + Math.sin(i * 2.1) * 22 };
      birds.add(b);
    }
    group.add(birds);
  }

  let clock = 0;

  const reflectors = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.12, 6, 5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.hemiSky).lerp(new THREE.Color(0xffffff), 0.5) }),
    260,
  );
  {
    const d = new THREE.Object3D();
    let n = 0;
    const spacing = 26;
    const count = Math.floor(curveRef.length / spacing);
    for (let i = 0; i < count && n < 260; i++) {
      const dist = i * spacing;
      const f = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 };
      curveRef.frameAtDist(dist, f);
      for (const side of [-1, 1]) {
        d.position.copy(f.pos).addScaledVector(f.binormal, side * (f.halfWidth + 0.3)).addScaledVector(f.normal, 0.35);
        d.updateMatrix();
        reflectors.setMatrixAt(n++, d.matrix);
      }
    }
    reflectors.count = n;
  }
  group.add(reflectors);

  let water: THREE.Mesh | null = null;
  if (theme.ambientSound === 'birds' || theme.ambientSound === 'waves') {
    const waterGeo = new THREE.CircleGeometry(3200, 40);
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, colorA: { value: new THREE.Color(theme.ambientSound === 'birds' ? 0x3a6a9a : 0x2a5a6a) } },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv2;
        varying float vWave;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.008 + uTime * 0.9) * cos(p.y * 0.006 - uTime * 0.7);
          p.z += w * 2.2;
          vWave = w;
          vUv2 = p.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 colorA;
        varying float vWave;
        void main() {
          vec3 c = colorA + vWave * 0.12;
          gl_FragColor = vec4(c, 0.82);
        }
      `,
    });
    water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -8;
    group.add(water);
  }

  let clock2 = 0;
  const update = (cameraPos: THREE.Vector3): void => {
    sky.position.copy(cameraPos);
    ground.position.x = cameraPos.x;
    ground.position.z = cameraPos.z;
    sunLight.target.position.copy(cameraPos);
    sunLight.position.copy(cameraPos).add(sunOffset);
    if (water) {
      clock2 += 0.016;
      (water.material as THREE.ShaderMaterial).uniforms.uTime.value = clock2;
      water.position.x = cameraPos.x;
      water.position.z = cameraPos.z;
    }
  };

  const animate = (t: number, dt: number): void => {
    clock += dt;
    clouds.children.forEach((c, i) => {
      c.position.x += cloudDirs[i] * dt * 2.4;
      if (c.position.x > 2600) c.position.x = -2600;
    });
    if (fireflies) {
      (fireflies.material as THREE.ShaderMaterial).uniforms.uTime.value = clock;
      fireflies.position.x = t;
    }
    birds.children.forEach((b) => {
      const u = b.userData as { angle: number; flap: number; wl: THREE.Mesh; wr: THREE.Mesh; r: number; h: number };
      u.angle += dt * 0.05;
      u.flap += dt * 9;
      b.position.set(Math.cos(u.angle) * u.r, u.h + Math.sin(clock * 0.7 + u.r) * 4, Math.sin(u.angle) * u.r);
      b.rotation.y = -u.angle;
      u.wl.rotation.z = Math.sin(u.flap) * 0.55;
      u.wr.rotation.z = -Math.sin(u.flap) * 0.55;
    });
  };

  return { group, sunLight, hemiLight, update, animate };
}
