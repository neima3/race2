import * as THREE from 'three';
import type { CarPhysics } from '../physics/car';
import type { TrackCurve } from '../track/curve';

export interface AutoPilotResult {
  steer: number;
  throttle: number;
  brake: number;
  respawn?: boolean;
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

export interface AutoPilotState {
  smooth: number;
}

export function autopilotDrive(
  car: CarPhysics,
  curve: TrackCurve,
  dt: number,
  state: AutoPilotState = { smooth: 0 },
): AutoPilotResult {
  const s = car.state;
  const frame = curve.frames[s.trackIndex];
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quat);
  const cross = new THREE.Vector3().crossVectors(fwd, frame.tangent).dot(frame.normal);
  const dot = Math.max(-1, Math.min(1, fwd.dot(frame.tangent)));
  const headingErr = Math.atan2(cross, dot);
  if (Math.abs(headingErr) > 2.2) {
    return { respawn: true, steer: 0, throttle: 0, brake: 0 };
  }
  const lookahead = 12 + s.speed * 0.55;
  curve.frameAtDist(s.trackDist + lookahead, scratchFrame);
  const invQ = s.quat.clone().invert();
  const local = scratchFrame.pos.clone().sub(s.pos).applyQuaternion(invQ);
  const angle = Math.atan2(local.x, local.z);
  const rawSteer = Math.max(-1, Math.min(1, -angle * 2.4));
  const maxStep = 7 * dt;
  state.smooth += Math.max(-maxStep, Math.min(maxStep, rawSteer - state.smooth));
  const steer = state.smooth;
  const absA = Math.abs(angle);

  let maxCurv = 0;
  let prevTangent: THREE.Vector3 | null = null;
  for (const dd of [8, 18, 28, 38, 50]) {
    curve.frameAtDist(s.trackDist + dd, tmpF);
    if (prevTangent) {
      maxCurv = Math.max(maxCurv, prevTangent.angleTo(tmpF.tangent) / 10);
    }
    prevTangent = tmpF.tangent.clone();
  }
  const targetSpeed = Math.min(58, Math.max(14, Math.sqrt(38 / Math.max(maxCurv, 1e-4))));
  let throttle: number;
  let brake: number;
  if (s.forwardSpeed > targetSpeed * 1.1) {
    throttle = 0;
    brake = 0.75;
  } else if (s.forwardSpeed > targetSpeed * 0.95) {
    throttle = 0.3;
    brake = 0;
  } else {
    throttle = absA > 1.1 ? 0.3 : 1;
    brake = 0;
  }
  return { steer, throttle, brake, respawn: false };
}

export type AutoPilotDrive = ReturnType<typeof autopilotDrive>;
