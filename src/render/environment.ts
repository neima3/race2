import * as THREE from 'three';
import { VARIANTS, type ThemeDef, type TrackVariant } from '../track/defs';
import type { TrackCurve } from '../track/curve';
import {
  buildGround,
  buildLandformMeshes,
  buildRidges,
  placeLandforms,
  placeRocks,
  seededRandom,
  type GroundSurface,
  type RidgeRings,
} from './terrain';

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
      sunGlow: { value: 1 },
      starBrightness: { value: 1 },
      hazeColor: { value: new THREE.Color(theme.fogColor) },
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
      uniform float sunGlow;
      uniform float starBrightness;
      uniform vec3 hazeColor;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.18, h));
        col = mix(col, topColor, smoothstep(0.18, 0.65, h));
        float sunAmt = max(dot(normalize(vDir), sunDir), 0.0);
        float core = smoothstep(0.99860, 0.99955, sunAmt);
        col += sunColor * core * 1.22 * sunGlow;
        col += sunColor * pow(sunAmt, 24.0) * 0.28 * sunGlow;
        col += sunColor * pow(sunAmt, 6.0) * 0.13 * sunGlow;
        col += vec3(1.0, 0.75, 0.45) * pow(sunAmt, 2.6) * 0.09 * sunGlow;
        col = mix(col, hazeColor, (1.0 - smoothstep(0.0, 0.16, h)) * 0.62);
        float stars = step(0.9993, fract(sin(dot(floor(vDir * 260.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453));
        col += stars * smoothstep(0.05, 0.4, h) * 0.55 * starBrightness;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export interface Environment {
  group: THREE.Group;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  readonly variant: TrackVariant;
  applyVariant(variant: TrackVariant): void;
  update(cameraPos: THREE.Vector3): void;
  animate(t: number, dt: number): void;
  dispose(): void;
}

export function buildEnvironment(scene: THREE.Scene, theme: ThemeDef, quality: 'low' | 'medium' | 'high', curveRef: TrackCurve, variant: TrackVariant = 'day'): Environment {
  const group = new THREE.Group();
  scene.add(group);

  const skyMat = makeSkyMaterial(theme);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 18), skyMat);
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

  const hemiLight = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
  scene.add(hemiLight);

  const base = {
    skyTop: new THREE.Color(theme.skyTop),
    skyMid: new THREE.Color(theme.skyMid),
    skyHorizon: new THREE.Color(theme.skyHorizon),
    sun: new THREE.Color(theme.sunColor),
    sunDir: new THREE.Vector3(...theme.sunDir).normalize(),
    fog: new THREE.Color(theme.fogColor),
    fogNear: theme.fogNear,
    fogFar: theme.fogFar,
    sunIntensity: theme.sunIntensity,
    hemiIntensity: theme.hemiIntensity,
    mesaFar: new THREE.Color(theme.mesaFarColor),
    rock: new THREE.Color(theme.rockColor),
    cloud: new THREE.Color(theme.cloudColor),
    cloudOpacity: theme.cloudOpacity,
    reflector: new THREE.Color(theme.reflectorColor),
  };

  const groundSurface: GroundSurface = buildGround(theme);
  group.add(groundSurface.mesh);

  const landRng = seededRandom(90217);
  const landformSpecs = placeLandforms(landRng, theme, curveRef);
  const { meshes: landformMeshes, landMat } = buildLandformMeshes(theme, landformSpecs);
  for (const m of landformMeshes) group.add(m);

  const ridgeRings: RidgeRings = buildRidges(seededRandom(7101), theme);
  group.add(ridgeRings.group);

  const rockMat = new THREE.MeshStandardMaterial({ color: theme.rockColor, roughness: 1, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 140);
  const dummy = new THREE.Object3D();
  const rockTransforms = placeRocks(seededRandom(3313), curveRef, 140);
  const rockTint = new THREE.Color();
  for (let i = 0; i < rockTransforms.length; i++) {
    const t = rockTransforms[i];
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(t.rx, t.ry, t.rz);
    dummy.scale.set(t.sx, t.sy, t.sz);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, rockTint.setScalar(t.tint));
  }
  rocks.count = rockTransforms.length;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  group.add(rocks);

  const rng = seededRandom(1337);
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uDrift: { value: 2.2 },
      uColor: { value: new THREE.Color(theme.cloudColor) },
      uOpacity: { value: theme.cloudOpacity },
    },
    vertexShader: `
      attribute vec3 aBase;
      attribute vec4 aPuff;
      attribute float aSeed;
      uniform float uTime;
      uniform float uDrift;
      varying vec2 vPuffUv;
      void main() {
        float span = 5200.0;
        float x = mod(aBase.x + uTime * uDrift * (0.7 + 0.6 * aSeed) + span * 0.5, span) - span * 0.5;
        vec4 mv = modelViewMatrix * vec4(x + aPuff.x, aBase.y + aPuff.y, aBase.z + aPuff.z, 1.0);
        if (mv.z > -4.0) {
          vPuffUv = vec2(0.0);
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return;
        }
        mv.xy += position.xy * aPuff.w;
        vPuffUv = position.xy + 0.5;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vPuffUv;
      void main() {
        float r = length(vPuffUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.32, r);
        a *= mix(0.5, 1.0, vPuffUv.y) * uOpacity;
        vec3 col = uColor * mix(0.82, 1.1, vPuffUv.y);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const CLOUD_COUNT = 12;
  const cloudBase: number[] = [];
  const puffData: number[] = [];
  const puffSeeds: number[] = [];
  let puffTotal = 0;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const a = rng() * Math.PI * 2;
    const dist = 900 + rng() * 1900;
    const cx = Math.cos(a) * dist;
    const cy = 240 + rng() * 320;
    const cz = Math.sin(a) * dist;
    const puffCount = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffCount; p++) {
      cloudBase.push(cx, cy, cz);
      puffData.push((rng() - 0.5) * 110, (rng() - 0.5) * 18, (rng() - 0.5) * 60, 34 + rng() * 52);
      puffSeeds.push(rng());
      puffTotal++;
    }
  }
  const puffGeo = new THREE.InstancedBufferGeometry();
  const puffQuad = new THREE.PlaneGeometry(1, 1);
  puffGeo.index = puffQuad.index;
  puffGeo.attributes.position = puffQuad.attributes.position;
  puffGeo.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(cloudBase), 3));
  puffGeo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(puffData), 4));
  puffGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(puffSeeds), 1));
  puffGeo.instanceCount = puffTotal;
  puffQuad.dispose();
  const clouds = new THREE.Mesh(puffGeo, cloudMat);
  clouds.frustumCulled = false;
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

  const reflectorMat = new THREE.MeshBasicMaterial({ color: base.reflector.clone() });
  const reflectors = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.14, 6, 5),
    reflectorMat,
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

  const waterRef = { mesh: null as THREE.Mesh | null };
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
    waterRef.mesh = new THREE.Mesh(waterGeo, waterMat);
    const water = waterRef.mesh as THREE.Mesh;
    water.rotation.x = -Math.PI / 2;
    water.position.y = -8;
    group.add(water);
  }

  let currentVariant: TrackVariant = 'day';
  const scratch = new THREE.Color();

  const applyVariant = (v: TrackVariant): void => {
    const d = VARIANTS[v];
    currentVariant = v;
    const u = skyMat.uniforms;
    u.topColor.value.copy(scratch.copy(base.skyTop).lerp(new THREE.Color(d.skyTint), d.skyTintAmt));
    u.midColor.value.copy(scratch.copy(base.skyMid).lerp(new THREE.Color(d.skyTint), d.skyTintAmt));
    u.horizonColor.value.copy(scratch.copy(base.skyHorizon).lerp(new THREE.Color(d.skyTint), d.skyTintAmt));
    u.sunColor.value.copy(scratch.copy(base.sun).lerp(new THREE.Color(d.sunTint), d.sunTintAmt));
    const dir = base.sunDir.clone();
    if (d.sunElev !== null) {
      dir.y = d.sunElev;
      dir.normalize();
    }
    u.sunDir.value.copy(dir);
    u.sunGlow.value = d.sunGlow;
    u.starBrightness.value = d.starBrightness;

    sunOffset.copy(dir).multiplyScalar(460);
    sunLight.color.copy(u.sunColor.value as THREE.Color);
    sunLight.intensity = base.sunIntensity * d.sunIntensityMult;
    hemiLight.intensity = base.hemiIntensity * d.hemiMult;

    const fog = scene.fog as THREE.Fog;
    fog.color.copy(scratch.copy(base.fog).multiplyScalar(d.fogColorMult));
    fog.near = base.fogNear * d.fogNearMult;
    fog.far = base.fogFar * d.fogFarMult;
    (u.hazeColor.value as THREE.Color).copy(fog.color);

    groundSurface.dim(d.ambientDim);
    landMat.color.setScalar(d.ambientDim);
    ridgeRings.setTint(fog.color, d.ambientDim);
    rockMat.color.copy(scratch.copy(base.rock).multiplyScalar(d.ambientDim));
    (cloudMat.uniforms.uColor.value as THREE.Color).copy(scratch.copy(base.cloud).multiplyScalar(d.cloudColorMult));
    cloudMat.uniforms.uOpacity.value = Math.min(1, base.cloudOpacity * d.cloudOpacityMult);
    reflectorMat.color.copy(scratch.copy(base.reflector).multiplyScalar(d.reflectorMult));
  };

  applyVariant(variant);

  let clock2 = 0;
  const update = (cameraPos: THREE.Vector3): void => {
    sky.position.copy(cameraPos);
    groundSurface.anchor(cameraPos.x, cameraPos.z);
    ridgeRings.group.position.set(cameraPos.x, 0, cameraPos.z);
    sunLight.target.position.copy(cameraPos);
    sunLight.position.copy(cameraPos).add(sunOffset);
    const w = waterRef.mesh;
    if (w) {
      clock2 += 0.016;
      (w.material as THREE.ShaderMaterial).uniforms.uTime.value = clock2;
      w.position.x = cameraPos.x;
      w.position.z = cameraPos.z;
    }
  };

  const animate = (t: number, dt: number): void => {
    clock += dt;
    cloudMat.uniforms.uTime.value = clock;
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

  const dispose = (): void => {
    group.traverse((o) => {
      const anyO = o as THREE.Mesh;
      if (anyO.geometry) anyO.geometry.dispose();
      const m = anyO.material as THREE.Material | THREE.Material[] | undefined;
      const kill = (mm: THREE.Material) => {
        const std = mm as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        if (std.emissiveMap) std.emissiveMap.dispose();
        mm.dispose();
      };
      if (Array.isArray(m)) m.forEach(kill);
      else if (m) kill(m);
    });
    scene.remove(group);
    scene.remove(sunLight.target);
    scene.remove(sunLight);
    scene.remove(hemiLight);
    sunLight.shadow.dispose();
  };

  return {
    group,
    sunLight,
    hemiLight,
    get variant() {
      return currentVariant;
    },
    applyVariant,
    update,
    animate,
    dispose,
  };
}
