import * as THREE from 'three';

export interface TrackFrame {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  halfWidth: number;
  dist: number;
}

export interface ControlPoint {
  pos: [number, number, number];
  width?: number;
  bank?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export class TrackCurve {
  readonly controlPoints: ControlPoint[];
  readonly closed: boolean;
  readonly frames: TrackFrame[] = [];
  readonly length: number;

  constructor(controlPoints: ControlPoint[], closed: boolean, sampleStep = 1.2) {
    this.controlPoints = controlPoints;
    this.closed = closed;
    this.buildFrames(sampleStep);
    this.length = this.frames[this.frames.length - 1].dist;
  }

  private pointAt(segIndex: number, t: number, out: THREE.Vector3): void {
    const cps = this.controlPoints;
    const n = cps.length;
    const i0 = (segIndex - 1 + n) % n;
    const i1 = segIndex % n;
    const i2 = (segIndex + 1) % n;
    const i3 = (segIndex + 2) % n;
    if (!this.closed && (segIndex === 0 || segIndex === n - 1)) {
      const a0 = segIndex - 1 < 0 ? 0 : segIndex - 1;
      const a1 = segIndex;
      const a2 = segIndex + 1 <= n - 1 ? segIndex + 1 : n - 1;
      const a3 = segIndex + 2 <= n - 1 ? segIndex + 2 : n - 1;
      out.set(
        catmullRom(cps[a0].pos[0], cps[a1].pos[0], cps[a2].pos[0], cps[a3].pos[0], t),
        catmullRom(cps[a0].pos[1], cps[a1].pos[1], cps[a2].pos[1], cps[a3].pos[1], t),
        catmullRom(cps[a0].pos[2], cps[a1].pos[2], cps[a2].pos[2], cps[a3].pos[2], t),
      );
      return;
    }
    void i0;
    out.set(
      catmullRom(cps[i0].pos[0], cps[i1].pos[0], cps[i2].pos[0], cps[i3].pos[0], t),
      catmullRom(cps[i0].pos[1], cps[i1].pos[1], cps[i2].pos[1], cps[i3].pos[1], t),
      catmullRom(cps[i0].pos[2], cps[i1].pos[2], cps[i2].pos[2], cps[i3].pos[2], t),
    );
  }

  private widthAt(segIndex: number, t: number): number {
    const cps = this.controlPoints;
    const n = cps.length;
    const w0 = cps[(segIndex + n) % n].width ?? 7;
    const w1 = cps[(segIndex + 1) % n].width ?? 7;
    return w0 + (w1 - w0) * t;
  }

  private bankAt(segIndex: number, t: number): number {
    const cps = this.controlPoints;
    const n = cps.length;
    const b0 = cps[segIndex % n].bank ?? 0;
    const b1 = cps[(segIndex + 1) % n].bank ?? 0;
    return (b0 + (b1 - b0) * t) * (Math.PI / 180);
  }

  private buildFrames(sampleStep: number): void {
    const cps = this.controlPoints;
    const n = cps.length;
    const segs = this.closed ? n : n - 1;

    const tmp = new THREE.Vector3();
    const prev = new THREE.Vector3();
    this.pointAt(0, 0, prev);

    let normal = new THREE.Vector3(0, 1, 0);
    let tangent = new THREE.Vector3();
    this.pointAt(0, 0.01, tmp);
    tangent.subVectors(tmp, prev).normalize();
    if (Math.abs(tangent.dot(normal)) > 0.98) normal.set(1, 0, 0);
    normal.crossVectors(tangent, normal).normalize().cross(tangent).normalize();

    let dist = 0;
    let lastPos = prev.clone();

    const pushFrame = (pos: THREE.Vector3, tangent: THREE.Vector3, normal: THREE.Vector3, width: number, bank: number) => {
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      const n2 = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
      if (bank !== 0) {
        n2.applyAxisAngle(tangent, bank);
        binormal.applyAxisAngle(tangent, bank);
      }
      this.frames.push({
        pos: pos.clone(),
        tangent: tangent.clone(),
        normal: n2.clone(),
        binormal: binormal.clone(),
        halfWidth: width,
        dist,
      });
    };

    for (let s = 0; s < segs; s++) {
      const segLen = this.approxSegLength(s);
      const steps = Math.max(2, Math.ceil(segLen / sampleStep));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        this.pointAt(s, t, tmp);
        dist += tmp.distanceTo(lastPos);
        lastPos.copy(tmp);
        const nextT = new THREE.Vector3();
        const te = t + 0.008;
        if (te < 1) this.pointAt(s, te, nextT);
        else {
          this.pointAt(s + 1, te - 1, nextT);
        }
        nextT.sub(tmp).normalize();
        if (nextT.lengthSq() < 0.5) nextT.copy(tangent);
        const axis = new THREE.Vector3().crossVectors(tangent, nextT);
        const angle = Math.min(Math.asin(Math.min(1, axis.length())), 0.35);
        if (axis.lengthSq() > 1e-10) {
          axis.normalize();
          normal.applyAxisAngle(axis, angle).normalize();
        }
        tangent.copy(nextT);
        pushFrame(tmp, tangent, normal, this.widthAt(s, t), this.bankAt(s, t));
      }
    }

    if (this.closed) {
      const closePos = new THREE.Vector3();
      this.pointAt(0, 0, closePos);
      dist += closePos.distanceTo(lastPos);
      pushFrame(closePos, this.frames[0].tangent.clone(), this.frames[0].normal.clone(), this.frames[0].halfWidth, 0);
      const first = this.frames[0];
      const last = this.frames[this.frames.length - 1];
      const axis = new THREE.Vector3().crossVectors(last.normal, first.normal);
      if (axis.lengthSq() > 1e-10) {
        const fullAngle = Math.acos(Math.max(-1, Math.min(1, last.normal.dot(first.normal))));
        axis.normalize();
        const m = this.frames.length;
        for (let i = 0; i < m; i++) {
          const f = this.frames[i];
          f.normal.applyAxisAngle(f.tangent, (fullAngle * i) / m).normalize();
          f.binormal.crossVectors(f.tangent, f.normal).normalize();
        }
      }
    }
  }

  private approxSegLength(segIndex: number): number {
    const n = this.controlPoints.length;
    const segs = this.closed ? n : n - 1;
    void segs;
    const tmp = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    this.pointAt(segIndex, 0, p0);
    this.pointAt(segIndex, 1, p1);
    let len = 0;
    for (let i = 1; i <= 8; i++) {
      this.pointAt(segIndex, i / 8, tmp);
      len += tmp.distanceTo(p0);
      p0.copy(tmp);
    }
    void p1;
    return len;
  }

  frameAtDist(targetDist: number, out: TrackFrame): void {
    const frames = this.frames;
    const d = ((targetDist % this.length) + this.length) % this.length;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].dist < d) lo = mid + 1;
      else hi = mid;
    }
    const i1 = lo === 0 ? frames.length - 1 : lo - 1;
    const i2 = lo;
    const f1 = frames[i1];
    const f2 = frames[i2];
    const span = Math.max(0.0001, f2.dist - f1.dist);
    const t = Math.max(0, Math.min(1, (d - f1.dist) / span));
    out.pos.lerpVectors(f1.pos, f2.pos, t);
    out.tangent.copy(f1.tangent).lerp(f2.tangent, t).normalize();
    out.normal.copy(f1.normal).lerp(f2.normal, t).normalize();
    out.binormal.crossVectors(out.tangent, out.normal).normalize();
    out.halfWidth = f1.halfWidth + (f2.halfWidth - f1.halfWidth) * t;
    out.dist = d;
  }

  closestFrameIndex(pos: THREE.Vector3, hintIndex: number, windowSize: number): number {
    const frames = this.frames;
    const n = frames.length;
    const last = n - 1;
    const consider = (i: number): number => (i === last ? 0 : i);
    let best = -1;
    let bestDist = Infinity;
    for (let k = -windowSize; k <= windowSize; k++) {
      const i = consider(((((hintIndex + k) % n) + n) % n));
      const d = frames[i].pos.distanceToSquared(pos);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best < 0 || bestDist > 3600) {
      for (let i = 0; i < last; i++) {
        const d = frames[i].pos.distanceToSquared(pos);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
    }
    return Math.max(0, best);
  }

  surfaceQuery(
    pos: THREE.Vector3,
    hintIndex: number,
    out: {
      index: number;
      frame: TrackFrame;
      lateral: number;
      vertical: number;
      longitudinal: number;
      dist: number;
    },
  ): void {
    const idx = this.closestFrameIndex(pos, hintIndex, 24);
    const f = this.frames[idx];
    out.index = idx;
    out.frame = f;
    const rel = new THREE.Vector3().subVectors(pos, f.pos);
    out.lateral = rel.dot(f.binormal);
    out.vertical = rel.dot(f.normal);
    out.longitudinal = rel.dot(f.tangent);
    out.dist = f.dist + out.longitudinal;
  }
}

export function refFrame(curve: TrackCurve, dist: number): TrackFrame {
  const f: TrackFrame = {
    pos: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
    halfWidth: 0,
    dist: 0,
  };
  curve.frameAtDist(dist, f);
  return f;
}

export { UP };
