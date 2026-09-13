import * as THREE from 'three';
import type { CarPhysics } from '../physics/car';
import type { TrackCurve } from '../track/curve';

export interface AutoPilotResult {
  steer: number;
  throttle: number;
  brake: number;
  respawn?: boolean;
}

export interface AutoPilotSkill {
  pace?: number;
  lookaheadJitter?: number;
  steerNoise?: number;
  /** Extra fine curvature scan (0-1 window extension) so fast drivers brake for hairpins earlier. */
  lookaheadScale?: number;
}

const scratchFrame = {
  pos: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  binormal: new THREE.Vector3(),
  halfWidth: 0,
  dist: 0,
};

const tmpF = {
  pos: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  binormal: new THREE.Vector3(),
  halfWidth: 0,
  dist: 0,
};

const vFwd = new THREE.Vector3();
const vCross = new THREE.Vector3();
const vLocal = new THREE.Vector3();
const vPrevTangent = new THREE.Vector3();
const qInv = new THREE.Quaternion();
const result: AutoPilotResult = { steer: 0, throttle: 0, brake: 0, respawn: false };

const CURVATURE_LOOKAHEADS = [8, 18, 28, 38, 50];

export interface AutoPilotState {
  smooth: number;
}

export function autopilotDrive(
  car: CarPhysics,
  curve: TrackCurve,
  dt: number,
  state: AutoPilotState = { smooth: 0 },
  skill: AutoPilotSkill = {},
): AutoPilotResult {
  const s = car.state;
  const frame = curve.frames[s.trackIndex];
  const fwd = vFwd.set(0, 0, 1).applyQuaternion(s.quat);
  const cross = vCross.crossVectors(fwd, frame.tangent).dot(frame.normal);
  const dot = Math.max(-1, Math.min(1, fwd.dot(frame.tangent)));
  const headingErr = Math.atan2(cross, dot);
  if (Math.abs(headingErr) > 2.2) {
    result.steer = 0;
    result.throttle = 0;
    result.brake = 0;
    result.respawn = true;
    return result;
  }
  const lookahead = (12 + s.speed * 0.55) * (1 + (skill.lookaheadJitter ?? 0));
  curve.frameAtDist(s.trackDist + lookahead, scratchFrame);
  qInv.copy(s.quat).invert();
  const local = vLocal.copy(scratchFrame.pos).sub(s.pos).applyQuaternion(qInv);
  const angle = Math.atan2(local.x, local.z);
  let rawSteer = Math.max(-1, Math.min(1, -angle * 2.4));
  const noise = skill.steerNoise ?? 0;
  if (noise > 0) rawSteer = Math.max(-1, Math.min(1, rawSteer + noise * Math.sin(s.trackDist * 0.019)));
  const maxStep = 7 * dt;
  state.smooth += Math.max(-maxStep, Math.min(maxStep, rawSteer - state.smooth));
  const steer = state.smooth;
  const absA = Math.abs(angle);

  let maxCurv = 0;
  let prevSet = false;
  for (let i = 0; i < CURVATURE_LOOKAHEADS.length; i++) {
    curve.frameAtDist(s.trackDist + CURVATURE_LOOKAHEADS[i], tmpF);
    if (prevSet) maxCurv = Math.max(maxCurv, vPrevTangent.angleTo(tmpF.tangent) / 10);
    vPrevTangent.copy(tmpF.tangent);
    prevSet = true;
  }
  const scanScale = skill.lookaheadScale ?? 1;
  if (scanScale > 1) {
    const maxOff = CURVATURE_LOOKAHEADS[CURVATURE_LOOKAHEADS.length - 1] * scanScale;
    for (let off = CURVATURE_LOOKAHEADS[CURVATURE_LOOKAHEADS.length - 2] + 10; off <= maxOff; off += 10) {
      curve.frameAtDist(s.trackDist + off, tmpF);
      maxCurv = Math.max(maxCurv, vPrevTangent.angleTo(tmpF.tangent) / 10);
      vPrevTangent.copy(tmpF.tangent);
    }
  }
  const paceHugging = skill.pace !== undefined;
  const targetSpeed = Math.min(58, Math.max(14, Math.sqrt((38 * s.surfaceGrip) / Math.max(maxCurv, 1e-4)))) * (skill.pace ?? 1);
  const brakeAt = paceHugging ? 1.03 : 1.1;
  const liftAt = paceHugging ? 1.0 : 0.95;
  let throttle: number;
  let brake: number;
  if (s.forwardSpeed > targetSpeed * brakeAt) {
    throttle = 0;
    brake = 0.75;
  } else if (s.forwardSpeed > targetSpeed * liftAt) {
    throttle = 0.3;
    brake = 0;
  } else {
    throttle = absA > 1.1 ? 0.3 : 1;
    brake = 0;
  }
  result.steer = steer;
  result.throttle = throttle;
  result.brake = brake;
  result.respawn = false;
  return result;
}

export type AutoPilotDrive = ReturnType<typeof autopilotDrive>;
