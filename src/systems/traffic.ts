import * as THREE from 'three';
import type { TrackCurve } from '../track/curve';
import type { TrackDef } from '../track/defs';
import type { CarPhysics } from '../physics/car';
import { contactShadowTexture, trafficCarGeometry } from '../render/car-model';
import { hashSeed } from '../game/rivals';

// Traffic Rush: cheap kinematic road traffic for the TRAFFIC mode. Cars own NO
// CarPhysics — each is a (dist, lane, speed) point mass stepping along the road
// frame; collisions scrub the player only. Deterministic per track (seeded).

export const TRAFFIC_REFERENCE_SPEED = 40; // m/s baseline player pace
export const TRAFFIC_SPEED_MIN = 0.55; // fraction of reference
export const TRAFFIC_SPEED_MAX = 0.7;
export const TRAFFIC_COUNT_MIN = 8;
export const TRAFFIC_COUNT_MAX = 12;
export const TRAFFIC_RESPAWN_BEHIND = 80; // m behind player -> loop-respawn ahead
export const TRAFFIC_RESPAWN_AHEAD = 120; // m ahead of player after respawn
export const TRAFFIC_HIT_DIST = 3.2; // contact band: |Δdist|
export const TRAFFIC_HIT_LAT = 1.7; // contact band: |Δlateral| — car-width touch; the
// 1.7→2.2 corridor is the clean-squeeze band that earns NEAR MISS (a 2.2 contact
// band would make near misses unreachable: every pass crosses Δdist≈0)
export const TRAFFIC_CONTACT_COOLDOWN = 0.8; // s per car between hit effects
export const TRAFFIC_SCRUB_RATE = 6; // strong slowdown while overlapping (mover scrub is 3.5)
export const TRAFFIC_NUDGE_TIME = 1; // s of nudged lane offset, then ease back
export const NEAR_MISS_LAT = 2.2;
export const NEAR_MISS_REL_SPEED = 12; // m/s closing speed
export const NEAR_MISS_WINDOW = 0.4; // s around the Δdist crossing
export const NEAR_MISS_CROSS_MAX = 10; // guard: real crossings happen within ~10m
export const NEAR_MISS_BONUS_MS = 150;
export const NEAR_MISS_MAX_CREDITED = 5;

const MULBERRY = 0x6d2b79f5;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + MULBERRY) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRAFFIC_PAINTS = [0x9aa3ad, 0xcdd3da, 0x5f6871, 0x8d6b5a, 0x77836f, 0xb4bcc7, 0x53606e, 0xa89a8a, 0x7f8a99, 0x8f8577, 0xb8b0a4, 0x6d7b8c];

interface TrafficCar {
  dist: number;
  lane: number;
  speed: number;
  paint: number;
  /** current lateral = lane + nudge offset */
  lat: number;
  nudgeDir: number;
  nudgeT: number;
  contactT: number;
  wasAhead: boolean;
  passT: number;
  passMinLat: number;
  passRelSpeed: number;
  passHit: boolean;
}

/** Data the finish panel needs for a TRAFFIC race result. */
export interface TrafficFinishData {
  nearMisses: number;
  credited: number;
  bonusMs: number;
  scoreMs: number;
  best: number | null;
  newBest: boolean;
}

/** Signed shortest delta a→b along a looping track of length len. */
function wrapDelta(a: number, b: number, len: number): number {
  let d = (a - b) % len;
  if (d > len / 2) d -= len;
  if (d < -len / 2) d += len;
  return d;
}

function smooth01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

export class TrafficManager {
  readonly cars: TrafficCar[] = [];
  nearMisses = 0;
  collisions = 0;
  onContact: (pos: THREE.Vector3) => void = () => {};
  onNearMiss: (count: number) => void = () => {};
  private curve: TrackCurve;
  private def: TrackDef;
  private visible = false;
  private bodyMesh: THREE.InstancedMesh;
  private trimMesh: THREE.InstancedMesh;
  private blobMesh: THREE.InstancedMesh;
  private meshes: THREE.InstancedMesh[];
  private frame: { pos: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; binormal: THREE.Vector3; halfWidth: number; dist: number };
  private xAxis = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private tmpColor = new THREE.Color();
  private contactPos = new THREE.Vector3();

  constructor(curve: TrackCurve, def: TrackDef, parent: THREE.Group) {
    this.curve = curve;
    this.def = def;
    const geo = trafficCarGeometry('standard');
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35 });
    bodyMat.userData.shared = true;
    const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
    trimMat.userData.shared = true;
    const blobPlane = new THREE.PlaneGeometry(3.6, 4.6);
    blobPlane.rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7 });
    blobMat.userData.shared = true;
    blobPlane.userData.shared = true;
    this.bodyMesh = new THREE.InstancedMesh(geo.painted, bodyMat, TRAFFIC_COUNT_MAX);
    this.trimMesh = new THREE.InstancedMesh(geo.trim, trimMat, TRAFFIC_COUNT_MAX);
    this.blobMesh = new THREE.InstancedMesh(blobPlane, blobMat, TRAFFIC_COUNT_MAX);
    this.meshes = [this.bodyMesh, this.trimMesh, this.blobMesh];
    for (const m of this.meshes) {
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      m.castShadow = false;
      m.receiveShadow = false;
      parent.add(m);
    }
    const f0 = this.curve.frames[0];
    this.frame = {
      pos: f0.pos.clone(),
      tangent: f0.tangent.clone(),
      normal: f0.normal.clone(),
      binormal: f0.binormal.clone(),
      halfWidth: f0.halfWidth,
      dist: 0,
    };
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.parent?.remove(m);
      m.dispose();
    }
  }

  setVisible(on: boolean): void {
    this.visible = on;
    for (const m of this.meshes) m.visible = on && m.count > 0;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Deterministic seeded pack: 8-12 cars ahead of the player, spread over the lap. */
  place(playerDist: number): void {
    const len = this.curve.length;
    const rng = mulberry32(hashSeed('traffic:' + this.def.id));
    const count = TRAFFIC_COUNT_MIN + Math.floor(rng() * (TRAFFIC_COUNT_MAX - TRAFFIC_COUNT_MIN + 1));
    this.cars.length = 0;
    for (let i = 0; i < count; i++) {
      const spread = (len - 160) / count;
      let dist = (playerDist + 50 + (i + 0.35 + rng() * 0.3) * spread) % len;
      if (dist < 0) dist += len;
      const side = i % 2 === 0 ? -1 : 1;
      this.curve.frameAtDist(dist, this.frame);
      // edge-biased lanes keep the racing line (center-ish) open for clean squeezes
      const lane = side * Math.min(1.8 + rng() * 1.4, Math.max(0.5, this.frame.halfWidth - 1.2));
      // low-biased pace (55-70% band, weighted down) keeps closing speeds >12 m/s so
      // passes resolve as near misses rather than slow chases
      const speed = TRAFFIC_REFERENCE_SPEED * (TRAFFIC_SPEED_MIN + rng() * rng() * (TRAFFIC_SPEED_MAX - TRAFFIC_SPEED_MIN));
      this.cars.push({
        dist,
        lane,
        speed,
        paint: TRAFFIC_PAINTS[i % TRAFFIC_PAINTS.length],
        lat: lane,
        nudgeDir: 0,
        nudgeT: 0,
        contactT: 0,
        wasAhead: true,
        passT: 0,
        passMinLat: 99,
        passRelSpeed: 0,
        passHit: false,
      });
    }
    this.nearMisses = 0;
    this.collisions = 0;
    for (let i = 0; i < this.cars.length; i++) this.bodyMesh.setColorAt(i, this.tmpColor.setHex(this.cars[i].paint));
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    for (const m of this.meshes) m.count = this.cars.length;
    this.updateVisuals();
  }

  /**
   * Fixed-step kinematic update. `racing` gates collision/near-miss bookkeeping;
   * cars always flow (also during countdown). Allocation-free.
   */
  update(dtMs: number, player: CarPhysics, racing: boolean): void {
    const dt = dtMs / 1000;
    const len = this.curve.length;
    const s = player.state;
    const playerSpeed = Math.abs(s.forwardSpeed);
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      c.dist = (c.dist + c.speed * dt) % len;
      if (c.dist < 0) c.dist += len;
      if (c.contactT > 0) c.contactT -= dt;
      let nudgeOffset = 0;
      if (c.nudgeT > 0) {
        c.nudgeT -= dt;
        nudgeOffset = c.nudgeDir * 2 * smooth01(c.nudgeT / 0.35);
      }
      this.curve.frameAtDist(c.dist, this.frame);
      const latMax = Math.max(0.4, this.frame.halfWidth - 1);
      c.lat = Math.max(-latMax, Math.min(latMax, c.lane + nudgeOffset));
      if (!racing) continue;
      const rel = wrapDelta(c.dist, s.trackDist, len); // + = car ahead of player
      const ahead = rel > 0;
      const dLat = c.lat - s.lateral;
      const overlap = Math.abs(rel) < TRAFFIC_HIT_DIST && Math.abs(dLat) < TRAFFIC_HIT_LAT;
      if (overlap) {
        // strong slowdown on the player only (mover-scrub pattern, stronger rate)
        s.vel.multiplyScalar(Math.max(0, 1 - TRAFFIC_SCRUB_RATE * dt));
        if (c.contactT <= 0) {
          c.contactT = TRAFFIC_CONTACT_COOLDOWN;
          c.passHit = true;
          this.collisions++;
          c.nudgeDir = Math.sign(dLat) || Math.sign(c.lane) || 1;
          c.nudgeT = TRAFFIC_NUDGE_TIME;
          this.contactPos
            .copy(this.frame.pos)
            .addScaledVector(this.frame.binormal, s.lateral + dLat * 0.5)
            .addScaledVector(this.frame.normal, 0.6);
          this.onContact(this.contactPos);
        }
      }
      if (c.passT > 0) {
        c.passT -= dt;
        if (overlap) c.passHit = true;
        if (Math.abs(dLat) < c.passMinLat) c.passMinLat = Math.abs(dLat);
        if (c.passT <= 0 && !c.passHit && c.passMinLat < NEAR_MISS_LAT && c.passRelSpeed > NEAR_MISS_REL_SPEED) {
          this.nearMisses++;
          this.onNearMiss(this.nearMisses);
        }
      }
      if (c.wasAhead && !ahead && Math.abs(rel) < NEAR_MISS_CROSS_MAX && c.passT <= 0) {
        // ahead→behind crossing: open the pass window
        c.passT = NEAR_MISS_WINDOW;
        c.passMinLat = Math.abs(dLat);
        c.passRelSpeed = playerSpeed - c.speed;
        c.passHit = false;
      } else if (!c.wasAhead && ahead) {
        c.passT = 0;
      }
      c.wasAhead = ahead;
      // constant density: loop-respawn cars that fall far behind
      if (wrapDelta(s.trackDist, c.dist, len) > TRAFFIC_RESPAWN_BEHIND) {
        c.dist = (s.trackDist + TRAFFIC_RESPAWN_AHEAD) % len;
        if (c.dist < 0) c.dist += len;
        c.wasAhead = true;
        c.passT = 0;
        c.passHit = false;
        c.contactT = 0;
        c.nudgeT = 0;
        c.lat = c.lane;
      }
    }
  }

  /** Per-frame instance matrices (allocation-free). */
  updateVisuals(): void {
    const n = Math.min(this.cars.length, TRAFFIC_COUNT_MAX);
    for (let i = 0; i < n; i++) {
      const c = this.cars[i];
      this.curve.frameAtDist(c.dist, this.frame);
      this.xAxis.crossVectors(this.frame.normal, this.frame.tangent);
      this.m4.makeBasis(this.xAxis, this.frame.normal, this.frame.tangent);
      this.m4.setPosition(
        this.frame.pos.x + this.frame.binormal.x * c.lat,
        this.frame.pos.y + this.frame.binormal.y * c.lat + 0.02,
        this.frame.pos.z + this.frame.binormal.z * c.lat,
      );
      this.bodyMesh.setMatrixAt(i, this.m4);
      this.trimMesh.setMatrixAt(i, this.m4);
      this.m4.setPosition(
        this.frame.pos.x + this.frame.binormal.x * c.lat,
        this.frame.pos.y + this.frame.binormal.y * c.lat + 0.06,
        this.frame.pos.z + this.frame.binormal.z * c.lat,
      );
      this.blobMesh.setMatrixAt(i, this.m4);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.trimMesh.instanceMatrix.needsUpdate = true;
    this.blobMesh.instanceMatrix.needsUpdate = true;
  }

  telemetry(): {
    mode: boolean;
    count: number;
    nearMisses: number;
    credited: number;
    collisions: number;
    cars: { dist: number; lateral: number; speed: number; paint: string }[];
  } {
    return {
      mode: this.visible,
      count: this.cars.length,
      nearMisses: this.nearMisses,
      credited: Math.min(this.nearMisses, NEAR_MISS_MAX_CREDITED),
      collisions: this.collisions,
      cars: this.cars.map((c) => ({
        dist: Math.round(c.dist),
        lateral: +c.lat.toFixed(2),
        speed: +c.speed.toFixed(1),
        paint: '#' + c.paint.toString(16).padStart(6, '0'),
      })),
    };
  }
}
