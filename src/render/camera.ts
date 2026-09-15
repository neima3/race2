import * as THREE from 'three';
import type { CarState } from '../physics/car';

export type CameraMode = 'chase' | 'close' | 'hood';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  /** FOV preference from settings (60-100). CHASE/CLOSE base = pref - 10 (default 72 -> 62, unchanged); HOOD forces base 70. */
  fovPref = 72;
  boostKick = 0;
  /** Eased FOV widen above 45 m/s, capped at +4 deg. Disabled by reduced-motion. */
  speedFovEnabled = true;
  private speedFov = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private lookBack = false;
  private punch = 0;
  private lastMode: CameraMode | null = null;
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.3, 5000);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** CHASE -> CLOSE -> HOOD -> CHASE */
  cycleMode(): CameraMode {
    this.mode = this.mode === 'chase' ? 'close' : this.mode === 'close' ? 'hood' : 'chase';
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  /** Additive FOV impulse; positive = pull-in (zoom), decays over ~0.7s. */
  addPunch(magnitude: number): void {
    this.punch = Math.max(this.punch, magnitude);
  }

  setLookBack(v: boolean): void {
    this.lookBack = v;
  }

  snapBehind(state: CarState): void {
    this.lastMode = this.mode;
    const up = this.v2.set(0, 1, 0);
    if (this.mode === 'hood') {
      const fwd = this.v1.set(0, 0, 1).applyQuaternion(state.quat);
      up.applyQuaternion(state.quat);
      this.camPos.copy(state.pos).addScaledVector(up, 1.05).addScaledVector(fwd, 0.5);
      this.camera.position.copy(this.camPos);
      this.camLook.copy(state.pos);
      this.camera.up.copy(up);
      this.camera.lookAt(this.camLook);
      this.camera.fov = 70;
      this.camera.updateProjectionMatrix();
      return;
    }
    const close = this.mode === 'close';
    const back = this.v1.set(0, 0, -1).applyQuaternion(state.quat);
    this.camPos
      .copy(state.pos)
      .addScaledVector(back, close ? 5.85 : 9)
      .addScaledVector(this.v2.set(0, 1, 0), close ? 2.05 : 3.4);
    this.camera.position.copy(this.camPos);
    this.camLook.copy(state.pos);
  }

  update(dt: number, state: CarState): void {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.boostKick = Math.max(0, this.boostKick - dt * 1.4);
    this.punch = Math.max(0, this.punch - dt * 20);
    const modeChanged = this.lastMode !== this.mode;
    this.lastMode = this.mode;
    const up = this.v1.set(0, 1, 0).applyQuaternion(state.quat);
    const forward = this.v2.set(0, 0, 1).applyQuaternion(state.quat);
    const speedRatio = Math.min(1, state.speed / 58);
    const hi = this.speedFovEnabled ? Math.min(1, Math.max(0, (state.speed - 45) / 13)) : 0;
    const eased = hi * hi * (3 - 2 * hi);
    this.speedFov += (eased - this.speedFov) * Math.min(1, 4 * dt);
    const speedFov = this.speedFov * 4;
    const kick = this.boostKick * 9;

    if (this.mode === 'hood') {
      const eye = this.camPos.copy(state.pos).addScaledVector(up, 1.05).addScaledVector(forward, 0.5);
      this.camera.position.copy(eye);
      this.camLook
        .copy(eye)
        .addScaledVector(forward, this.lookBack ? -10 : 12.5)
        .addScaledVector(up, this.lookBack ? -0.4 : 0.1);
      this.camera.up.copy(up);
      this.camera.lookAt(this.camLook);
      this.camera.fov = 70 + speedRatio * 16 + speedFov - this.punch;
    } else {
      const close = this.mode === 'close';
      const backDist = this.lookBack ? (close ? 5.5 : 8.4) : close ? -5.7 : -8.8;
      const height = close ? 1.9 : 3.1;
      const lookAhead = this.lookBack ? (close ? -9 : -14) : close ? 8 : 7;
      const target = this.v3.copy(state.pos).addScaledVector(forward, backDist).addScaledVector(up, height);
      if (modeChanged) this.camPos.copy(target);
      else this.camPos.lerp(target, 1 - Math.exp(-(state.grounded ? 6.5 : 3.4) * dt));
      this.camera.position.copy(this.camPos);
      const lookTarget = this.v4.copy(state.pos).addScaledVector(forward, lookAhead).addScaledVector(up, 0.9);
      if (modeChanged) this.camLook.copy(lookTarget);
      else this.camLook.lerp(lookTarget, 1 - Math.exp(-9 * dt));
      if (modeChanged) this.camera.up.copy(up);
      else this.camera.up.lerp(up, 1 - Math.exp(-(state.grounded ? 8 : 2.2) * dt));
      this.camera.lookAt(this.camLook);
      this.camera.fov = this.fovPref - 10 + speedRatio * 22 + speedFov + kick - this.punch;
    }

    if (this.shake > 0) {
      const s = this.shake * 0.22;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.updateProjectionMatrix();
  }
}
