import * as THREE from 'three';
import type { TrackCurve } from '../track/curve';

export interface CarTuning {
  maxSpeed: number;
  accel: number;
  brakeDecel: number;
  reverseMax: number;
  maxYawRate: number;
  grip: number;
  driftGrip: number;
  drag: number;
  gravity: number;
  offroadDrag: number;
  offroadGrip: number;
  restHeight: number;
}

export const DEFAULT_TUNING: CarTuning = {
  maxSpeed: 58,
  accel: 34,
  brakeDecel: 52,
  reverseMax: 14,
  maxYawRate: 2.35,
  grip: 7.5,
  driftGrip: 1.9,
  drag: 0.35,
  gravity: 32,
  offroadDrag: 2.6,
  offroadGrip: 3.2,
  restHeight: 0.55,
};

export interface CarState {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  grounded: boolean;
  offroad: boolean;
  driftAmount: number;
  speed: number;
  forwardSpeed: number;
  trackIndex: number;
  trackDist: number;
  lateral: number;
  airborneTime: number;
  boostTime: number;
  wallHit: number;
  onSlick: boolean;
  landedAt: number;
}

const worldDown = new THREE.Vector3(0, -1, 0);

export class CarPhysics {
  readonly tuning: CarTuning;
  state: CarState;
  private curve: TrackCurve;
  private query = {
    index: 0,
    frame: {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      binormal: new THREE.Vector3(),
      halfWidth: 0,
      dist: 0,
    },
    lateral: 0,
    vertical: 0,
    longitudinal: 0,
    dist: 0,
  };
  private tmpV1 = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private targetQuat = new THREE.Quaternion();
  private m = new THREE.Matrix4();
  private yawRate = 0;
  get currentYawRate(): number {
    return this.yawRate;
  }
  private prevSignedDist = 0;

  constructor(curve: TrackCurve, tuning: Partial<CarTuning> = {}) {
    this.curve = curve;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.state = {
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      vel: new THREE.Vector3(),
      grounded: true,
      offroad: false,
      driftAmount: 0,
      speed: 0,
      forwardSpeed: 0,
      trackIndex: 0,
      trackDist: 0,
      lateral: 0,
      airborneTime: 0,
      boostTime: 0,
      wallHit: 0,
      onSlick: false,
      landedAt: -10,
    };
  }

  placeAtFrame(frameIndex: number, dist: number): void {
    const f = this.curve.frames[(((frameIndex % this.curve.frames.length) + this.curve.frames.length) % this.curve.frames.length)];
    this.state.pos.copy(f.pos).addScaledVector(f.normal, this.tuning.restHeight);
    const left = this.tmpV3.crossVectors(f.normal, f.tangent).normalize();
    this.m.makeBasis(left, f.normal, f.tangent);
    this.state.quat.setFromRotationMatrix(this.m);
    this.state.vel.set(0, 0, 0);
    this.state.grounded = true;
    this.state.offroad = false;
    this.state.driftAmount = 0;
    this.state.boostTime = 0;
    this.state.airborneTime = 0;
    this.yawRate = 0;
    this.state.trackIndex = (((frameIndex % this.curve.frames.length) + this.curve.frames.length) % this.curve.frames.length);
    this.state.trackDist = dist;
    this.state.lateral = 0;
    this.prevSignedDist = this.tuning.restHeight;
    this.query.index = this.state.trackIndex;
  }

  applyBoost(strength: number, duration: number): void {
    this.state.boostTime = Math.max(this.state.boostTime, duration);
    const forward = this.tmpV1.set(0, 0, 1).applyQuaternion(this.state.quat);
    const fs = this.state.vel.dot(forward);
    const target = Math.min(fs + strength, this.tuning.maxSpeed * 1.26);
    this.state.vel.addScaledVector(forward, Math.max(0, target - fs));
  }

  step(dt: number, steer: number, throttle: number, brake: number, drift: boolean, controlsEnabled: boolean): void {
    const s = this.state;
    const t = this.tuning;

    this.curve.surfaceQuery(s.pos, s.trackIndex, this.query);
    s.trackIndex = this.query.index;
    s.trackDist = this.query.dist;
    s.lateral = this.query.lateral;

    const f = this.query.frame;
    const halfRoad = f.halfWidth;

    if (s.boostTime > 0) s.boostTime = Math.max(0, s.boostTime - dt);

    if (s.grounded) {
      s.offroad = Math.abs(s.lateral) > halfRoad + 0.25;

      const forward = this.tmpV1.set(0, 0, 1).applyQuaternion(s.quat);
      forward.addScaledVector(f.normal, -forward.dot(f.normal));
      if (forward.lengthSq() < 0.01) forward.copy(f.tangent);
      forward.normalize();
      const right = this.tmpV2.crossVectors(f.normal, forward).normalize();

      let vF = s.vel.dot(forward);
      let vL = s.vel.dot(right);

      if (controlsEnabled) {
        const boostFactor = s.boostTime > 0 ? 1.26 : 1;
        const maxS = t.maxSpeed * boostFactor;
        if (throttle > 0 && brake < 0.05) {
          const accelTaper = Math.max(0.25, 1 - Math.max(0, vF) / maxS);
          vF += throttle * t.accel * accelTaper * dt * (s.boostTime > 0 ? 1.8 : 1);
          if (vF > maxS) vF = maxS;
        }
        if (brake > 0) {
          if (vF > 0.5) vF -= t.brakeDecel * brake * dt;
          else vF = Math.max(-t.reverseMax, vF - t.accel * 0.6 * brake * dt);
        }
      } else {
        vF -= Math.min(Math.abs(vF), 18 * dt) * Math.sign(vF);
      }

      const slopeAccel = worldDown.dot(forward) * t.gravity * 0.55;
      vF += slopeAccel * dt;

      const gripBase = drift ? t.driftGrip : t.grip;
      const grip = s.onSlick ? gripBase * 0.45 : gripBase;
      const gripMult = s.offroad ? t.offroadGrip / t.grip : 1;
      vL *= Math.max(0, 1 - grip * gripMult * dt);

      const drag = s.offroad ? t.offroadDrag : t.drag;
      vF -= vF * drag * dt * (0.4 + 0.6 * Math.min(1, Math.abs(vF) / t.maxSpeed));
      if (s.boostTime > 0 && vF < t.maxSpeed * 1.18) vF += 26 * dt;

      const speed = Math.abs(vF);
      const yawCapRaw = Math.min(t.maxYawRate, 38 / Math.max(speed, 3));
      const yawCap = yawCapRaw * (s.onSlick ? 0.75 : 1);
      const steerAuth = controlsEnabled ? steer : 0;
      let targetYaw = -steerAuth * yawCap;
      if (drift) targetYaw *= 1.4;
      if (vF < 0) targetYaw = -targetYaw;
      this.yawRate += (targetYaw - this.yawRate) * Math.min(1, 10 * dt);

      if (Math.abs(vF) > 0.15) {
        const rot = this.tmpQ.setFromAxisAngle(f.normal, this.yawRate * dt);
        s.quat.premultiply(rot).normalize();
        forward.set(0, 0, 1).applyQuaternion(s.quat);
        forward.addScaledVector(f.normal, -forward.dot(f.normal));
        if (forward.lengthSq() < 0.01) forward.copy(f.tangent);
        forward.normalize();
        right.crossVectors(f.normal, forward).normalize();
      }

      s.driftAmount = Math.min(1, Math.abs(vL) / 9);
      s.vel.copy(forward).multiplyScalar(vF).addScaledVector(right, vL);
      s.vel.addScaledVector(f.normal, -s.vel.dot(f.normal));

      s.pos.addScaledVector(s.vel, dt);

      this.curve.surfaceQuery(s.pos, s.trackIndex, this.query);
      s.trackIndex = this.query.index;
      const nf = this.query.frame;
      const maxAbsLat = nf.halfWidth + 2.1;
      if (Math.abs(this.query.lateral) > maxAbsLat) {
        const clampedLat = Math.sign(this.query.lateral) * maxAbsLat;
        const delta = clampedLat - this.query.lateral;
        s.pos.addScaledVector(nf.binormal, delta);
        const latVel = s.vel.dot(nf.binormal);
        if (latVel * Math.sign(this.query.lateral) > 0) {
          s.vel.addScaledVector(nf.binormal, -latVel);
          if (Math.abs(latVel) > 5) {
            s.wallHit = 0.35;
            s.vel.multiplyScalar(0.55);
            this.yawRate *= 0.3;
          }
        }
        s.vel.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
        s.lateral = clampedLat;
      }

      const newSigned = this.tmpV3.subVectors(s.pos, nf.pos).dot(nf.normal);
      const snap = t.restHeight - newSigned;
      if (snap < -0.85) {
        s.grounded = false;
        s.airborneTime = 0;
      } else {
        s.pos.addScaledVector(nf.normal, snap);
        this.alignToFrame(nf, dt, 14);
        this.prevSignedDist = t.restHeight;
      }

      s.forwardSpeed = vF;
      s.speed = s.vel.length();
    } else {
      s.airborneTime += dt;
      s.vel.addScaledVector(worldDown, t.gravity * dt);
      s.pos.addScaledVector(s.vel, dt);

      const airYaw = this.tmpQ.setFromAxisAngle(worldDown, steer * 0.9 * dt);
      s.quat.premultiply(airYaw);

      const pitchInput = (throttle - brake) * (controlsEnabled ? 1 : 0);
      if (Math.abs(pitchInput) > 0.05) {
        const localX = this.tmpV1.set(1, 0, 0).applyQuaternion(s.quat).normalize();
        const airPitch = this.tmpQ.setFromAxisAngle(localX, pitchInput * 2.4 * dt);
        s.quat.premultiply(airPitch).normalize();
      }

      this.curve.surfaceQuery(s.pos, s.trackIndex, this.query);
      s.trackIndex = this.query.index;
      const nf = this.query.frame;
      const signed = this.tmpV3.subVectors(s.pos, nf.pos).dot(nf.normal);
      const within = Math.abs(this.query.lateral) < nf.halfWidth + 1.2;

      if (within && this.prevSignedDist >= t.restHeight - 0.1 && signed <= t.restHeight && s.vel.dot(nf.normal) < 2) {
        s.pos.addScaledVector(nf.normal, t.restHeight - signed);
        s.vel.addScaledVector(nf.normal, -s.vel.dot(nf.normal));
        s.grounded = true;
        s.landedAt = s.airborneTime;
        this.alignToFrame(nf, dt, 20);
        this.yawRate *= 0.4;
      } else {
        this.prevSignedDist = signed;
      }

      s.forwardSpeed = s.vel.dot(this.tmpV1.set(0, 0, 1).applyQuaternion(s.quat));
      s.speed = s.vel.length();
      s.driftAmount = 0;
    }

    if (s.wallHit > 0) s.wallHit = Math.max(0, s.wallHit - dt * 2);
  }

  private alignToFrame(f: { normal: THREE.Vector3; tangent: THREE.Vector3 }, dt: number, rate: number): void {
    const forward = this.tmpV1.set(0, 0, 1).applyQuaternion(this.state.quat);
    forward.addScaledVector(f.normal, -forward.dot(f.normal));
    if (forward.lengthSq() < 0.02) forward.copy(f.tangent);
    forward.normalize();
    const left = this.tmpV2.crossVectors(f.normal, forward).normalize();
    this.m.makeBasis(left, f.normal, forward);
    this.targetQuat.setFromRotationMatrix(this.m);
    this.state.quat.slerp(this.targetQuat, Math.min(1, rate * dt));
  }

  getAirborneRatio(): number {
    return Math.min(1, this.state.airborneTime / 0.6);
  }
}
