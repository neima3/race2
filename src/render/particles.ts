import * as THREE from 'three';

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  color: THREE.Color;
  gravity: number;
}

const MAX = 420;

export class ParticleSystem {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private cursor = 0;

  constructor() {
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.12, d);
          gl_FragColor = vec4(vColor, alpha * 0.85);
        }
      `,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        grow: 0,
        color: new THREE.Color(),
        gravity: 0,
      });
    }
  }

  private spawn(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    size: number,
    grow: number,
    color: THREE.Color,
    gravity: number,
  ): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.active = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.grow = grow;
    p.color.copy(color);
    p.gravity = gravity;
  }

  driftSmoke(pos: THREE.Vector3, vel: THREE.Vector3, intensity: number): void {
    const c = new THREE.Color().setHSL(0.08, 0.05, 0.55 + Math.random() * 0.25);
    this.spawn(
      pos,
      vel.clone().multiplyScalar(0.25).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.8 + Math.random(), (Math.random() - 0.5) * 1.6)),
      0.55 + Math.random() * 0.4,
      0.7 + intensity * 0.9,
      2.4,
      c,
      -1.2,
    );
  }

  boostFlames(pos: THREE.Vector3, forward: THREE.Vector3, accent: THREE.Color): void {
    for (let i = 0; i < 3; i++) {
      const c = accent.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.5);
      this.spawn(
        pos,
        forward.clone().multiplyScalar(-6 - Math.random() * 6).add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4)),
        0.28 + Math.random() * 0.18,
        0.5 + Math.random() * 0.4,
        1.6,
        c,
        0,
      );
    }
  }

  wallSparks(pos: THREE.Vector3, normal: THREE.Vector3): void {
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Color().setHSL(0.09 + Math.random() * 0.04, 1, 0.6);
      this.spawn(
        pos,
        normal.clone().multiplyScalar(3 + Math.random() * 7).add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5)),
        0.3 + Math.random() * 0.25,
        0.28,
        0.4,
        c,
        -14,
      );
    }
  }

  landingDust(pos: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Color().setHSL(0.07, 0.4, 0.55 + Math.random() * 0.2);
      this.spawn(
        pos,
        new THREE.Vector3((Math.random() - 0.5) * 7, 0.6 + Math.random() * 2.4, (Math.random() - 0.5) * 7),
        0.5 + Math.random() * 0.4,
        0.6,
        2.8,
        c,
        -0.6,
      );
    }
  }

  confetti(pos: THREE.Vector3, palette?: THREE.Color[]): void {
    const colors = palette ?? [0x29e6ff, 0xffb52e, 0xff4d6d, 0x7dff6e, 0xb44dff].map((h) => new THREE.Color(h));
    for (let i = 0; i < 60; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.spawn(
        pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8)),
        new THREE.Vector3((Math.random() - 0.5) * 9, 6 + Math.random() * 8, (Math.random() - 0.5) * 9),
        1.8 + Math.random() * 1.2,
        0.3 + Math.random() * 0.25,
        0.2,
        c,
        -9,
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.sizes[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.sizes[i] = 0;
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - 1.6 * dt);
      const t = p.life / p.maxLife;
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      this.colors[i * 3] = p.color.r;
      this.colors[i * 3 + 1] = p.color.g;
      this.colors[i * 3 + 2] = p.color.b;
      this.sizes[i] = (p.size + (1 - t) * p.grow) * Math.min(1, t * 3);
    }
    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
  }
}
