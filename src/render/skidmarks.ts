import * as THREE from 'three';

const MAX_QUADS = 700;

export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private alphas: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;

  constructor() {
    this.positions = new Float32Array(MAX_QUADS * 4 * 3);
    this.alphas = new Float32Array(MAX_QUADS * 4);
    const indices = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4;
      indices.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], q * 6);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.05, 0.05, 0.07, vAlpha * 0.55);
        }
      `,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  addSegment(left: THREE.Vector3, right: THREE.Vector3, leftPrev: THREE.Vector3, rightPrev: THREE.Vector3, strength: number): void {
    const q = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_QUADS;
    const v = q * 4;
    const pts = [leftPrev, left, rightPrev, right];
    for (let i = 0; i < 4; i++) {
      this.positions[(v + i) * 3] = pts[i].x;
      this.positions[(v + i) * 3 + 1] = pts[i].y;
      this.positions[(v + i) * 3 + 2] = pts[i].z;
      this.alphas[v + i] = Math.min(1, strength);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  fadeAll(dt: number): void {
    let changed = false;
    for (let i = 0; i < this.alphas.length; i++) {
      if (this.alphas[i] > 0) {
        this.alphas[i] = Math.max(0, this.alphas[i] - dt * 0.08);
        changed = true;
      }
    }
    if (changed) (this.geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}
