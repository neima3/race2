import * as THREE from 'three';
import type { CarState } from '../physics/car';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: 'chase' | 'hood' = 'chase';
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private lookBack = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.3, 5000);
  }

  toggleMode(): 'chase' | 'hood' {
    this.mode = this.mode === 'chase' ? 'hood' : 'chase';
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  setLookBack(v: boolean): void {
    this.lookBack = v;
  }

  snapBehind(state: CarState): void {
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quat);
    this.camPos.copy(state.pos).addScaledVector(back, 9).addScaledVector(new THREE.Vector3(0, 1, 0), 3.4);
    this.camera.position.copy(this.camPos);
    this.camLook.copy(state.pos);
  }

  update(dt: number, state: CarState): void {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quat);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(state.quat);
    const speedRatio = Math.min(1, state.speed / 58);

    if (this.mode === 'hood') {
      const eye = state.pos.clone().addScaledVector(up, 1.05).addScaledVector(forward, 0.5);
      this.camera.position.copy(eye);
      const look = eye.clone().addScaledVector(forward, this.lookBack ? -10 : 10).addScaledVector(up, this.lookBack ? -0.4 : 0.1);
      this.camera.up.copy(up);
      this.camera.lookAt(look);
      this.camera.fov = 72 + speedRatio * 16;
    } else {
      const back = forward.clone().multiplyScalar(this.lookBack ? 8.4 : -8.8);
      const target = state.pos.clone().add(back).addScaledVector(up, 3.1);
      const lerpRate = 1 - Math.exp(-(state.grounded ? 6.5 : 3.4) * dt);
      this.camPos.lerp(target, lerpRate);
      this.camera.position.copy(this.camPos);
      const lookTarget = state.pos.clone().addScaledVector(forward, this.lookBack ? -14 : 7).addScaledVector(up, 0.9);
      this.camLook.lerp(lookTarget, 1 - Math.exp(-9 * dt));
      const worldUp = up;
      this.camera.up.lerp(worldUp, 1 - Math.exp(-(state.grounded ? 8 : 2.2) * dt));
      this.camera.lookAt(this.camLook);
      this.camera.fov = 62 + speedRatio * 22;
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
