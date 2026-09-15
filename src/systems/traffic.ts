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
export const TRAFFIC_SPEED_MIN = 0.5; // fraction of reference — P9 balance: a lower band
// raises closing speeds so passes clear the 12 m/s near-miss credit bar even where the
// player is off-throttle mid-corner, and spends less time inside the contact band
export const TRAFFIC_SPEED_MAX = 0.65;
export const TRAFFIC_COUNT_MIN = 10; // P9 balance: 10-14 pack (was 8-12) — more pass
export const TRAFFIC_COUNT_MAX = 14; // events per lap, the sparse side of 3-8 near misses
export const TRAFFIC_RESPAWN_BEHIND = 80; // m behind player -> loop-respawn ahead
export const TRAFFIC_RESPAWN_AHEAD = 120; // m ahead of player after respawn
export const TRAFFIC_RESPAWN_GAP = 28; // P9: min spacing to the next traffic car at respawn
// (kills the passed-together convoys that produced chain rear-end contacts)
export const TRAFFIC_TRAIN_GAP = 24; // P9: continuous following distance — traffic holds
// this gap behind the car ahead instead of clumping at speed differentials
export const TRAFFIC_HIT_DIST = 3.2; // contact band: |Δdist|
export const TRAFFIC_HIT_LAT = 1.5; // contact band: |Δlateral| — P9 widened the squeeze
// corridor: the [1.5, 2.2) clean-pass annulus is what separates near misses from
// contacts (a 1.7 band left only a 0.5 m window and both counts move the wrong way)
export const TRAFFIC_CONTACT_COOLDOWN = 3; // P9: s per car between counted contacts (was
// 0.8 for effect-spam control only) — a scrubbed player bump-following a slow cork
// re-contacts every ~2 s; a 3 s non-overlap re-arm counts the EPISODE, not each bump.
// Effects still fire per contact, collisions increment at most once per window.
export const TRAFFIC_SCRUB_RATE = 6; // strong slowdown while overlapping (mover scrub is 3.5)
export const TRAFFIC_NUDGE_TIME = 1; // s of nudged lane offset, then ease back
export const NEAR_MISS_LAT = 2.2;
export const NEAR_MISS_REL_SPEED = 10; // m/s closing speed — P9: recalibrated to the
// lower pace band (12 was set against the 0.55-0.7 band; corner passes at the current
// 0.5-0.65 band were dying one step under the old bar)
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
  /** inside the contact band this step (rising-edge collision counting) */
  wasOver: boolean;
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
    // P9: count scales inversely with how many passes a run offers — short laps get
    // denser packs (more squeeze passes), long wild laps get relief (~one car per 60 m
    // of racing room, clamped to 10-14; deterministic, no per-track seed lottery)
    const count = Math.max(TRAFFIC_COUNT_MIN, Math.min(TRAFFIC_COUNT_MAX, Math.round(len / 60)));
    this.cars.length = 0;
    for (let i = 0; i < count; i++) {
      const spread = (len - 160) / count;
      let dist = (playerDist + 50 + (i + 0.35 + rng() * 0.3) * spread) % len;
      if (dist < 0) dist += len;
      this.curve.frameAtDist(dist, this.frame);
      // P9 lane plan, deterministic per car: most of the pack takes the SQUEEZE band
      // (1.75-2.15 — hugs the [1.5, 2.2) near-miss annulus from inside), the rest the
      // EDGE band (2.4-3.2 — scenery that never corks the line). Sparse short-track
      // packs lean 2/3 squeeze so a 1-lap run still offers enough passes; long wild-
      // line tracks hold 1/2 (their excursions find squeeze lanes without help).
      // Band and side use independent index bits so squeeze lanes sit on BOTH sides.
      const side = i % 2 === 0 ? -1 : 1;
      const squeeze = count <= 12 ? i % 3 !== 2 : Math.floor(i / 2) % 2 === 0;
      const lane = side * Math.min(squeeze ? 1.75 + rng() * 0.4 : 2.4 + rng() * 0.8, Math.max(0.5, this.frame.halfWidth - 1.2));
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
        wasOver: false,
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
      // P9 following distance: never close on the car ahead inside TRAFFIC_TRAIN_GAP
      // (differential speeds clump the pack into trains that produce chain rear-end
      // contacts when the player threads them). Speed identity is kept — only the
      // step movement is clamped, so trains dissolve naturally once space opens.
      let v = c.speed;
      for (let j = 0; j < this.cars.length; j++) {
        if (j === i) continue;
        const gap = wrapDelta(this.cars[j].dist, c.dist, len); // + = j ahead of c
        if (gap > 0 && gap < TRAFFIC_TRAIN_GAP) v = Math.min(v, this.cars[j].speed);
      }
      c.dist = (c.dist + v * dt) % len;
      if (c.dist < 0) c.dist += len;
      // contact cooldown only decays OUTSIDE the band, so one continuous overlap
      // counts as ONE collision (a scrubbed player sitting beside a cork used to
      // re-count every 0.8 s cooldown expiry)
      if (c.contactT > 0 && !c.wasOver) c.contactT -= dt;
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
        c.passHit = true;
        if (c.contactT <= 0) {
          c.contactT = TRAFFIC_CONTACT_COOLDOWN;
          this.collisions++;
          // P9: nudge toward the car's OWN road edge, not blindly away from the
          // player — when contact happens out wide, sign(dLat) shoved the cork
          // toward the center and back into the player's path for a second hit
          c.nudgeDir = Math.sign(c.lane) || Math.sign(dLat) || 1;
          c.nudgeT = TRAFFIC_NUDGE_TIME;
          this.contactPos
            .copy(this.frame.pos)
            .addScaledVector(this.frame.binormal, s.lateral + dLat * 0.5)
            .addScaledVector(this.frame.normal, 0.6);
          this.onContact(this.contactPos);
        }
      }
      c.wasOver = overlap;
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
        // P9 anti-convoy spacing: cars passed together respawn together and form a
        // clump the player then rear-ends in a chain of contacts — push the respawn
        // point forward until it clears every other car by TRAFFIC_RESPAWN_GAP
        let dist = (s.trackDist + TRAFFIC_RESPAWN_AHEAD) % len;
        for (let k = 0; k < TRAFFIC_COUNT_MAX; k++) {
          let clear = true;
          for (let j = 0; j < this.cars.length; j++) {
            if (j === i) continue;
            if (Math.abs(wrapDelta(dist, this.cars[j].dist, len)) < TRAFFIC_RESPAWN_GAP) {
              clear = false;
              break;
            }
          }
          if (clear) break;
          dist = (dist + TRAFFIC_RESPAWN_GAP) % len;
        }
        if (dist < 0) dist += len;
        c.dist = dist;
        c.wasAhead = true;
        c.passT = 0;
        c.passHit = false;
        c.contactT = 0;
        c.wasOver = false;
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
