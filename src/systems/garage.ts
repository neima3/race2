import * as THREE from 'three';
import { buildCarVisual, PAINTS, type CarBodyStyle, type CarVisual } from '../render/car-model';
import { BODY_TUNING, DEFAULT_TUNING } from '../physics/car';
import type { SaveManager } from '../core/save';
import { paintUnlockState } from '../game/unlocks';

export const AERO_UNLOCK_STARS = 12;

export interface BodyUnlockState {
  unlocked: boolean;
  req: string;
}

export type BodyUnlockMap = Record<CarBodyStyle, BodyUnlockState>;

export function bodyUnlocks(totalStars: number, hasTrophy: boolean): BodyUnlockMap {
  return {
    standard: { unlocked: true, req: '' },
    aero: { unlocked: totalStars >= AERO_UNLOCK_STARS, req: `${AERO_UNLOCK_STARS}\u2605` },
    tank: { unlocked: hasTrophy, req: 'WIN ANY CUP TROPHY' },
  };
}

export function hasCupTrophy(save: SaveManager): boolean {
  for (const c of Object.values(save.allSaves.cups)) {
    if (c.finishes.some((f) => f.trophy)) return true;
  }
  return false;
}

export interface PaintSelectState {
  allowed: boolean;
  name: string;
  req: string;
}

/**
 * Garage selection gate for a paint color. Free paints always pass; locked
 * paints pass only once their lock id sits in unlocks.paints.
 */
export function paintSelectState(save: SaveManager, color: number): PaintSelectState {
  const paint = PAINTS.find((p) => p.color === color);
  if (!paint) return { allowed: false, name: 'UNKNOWN', req: '' };
  if (!paint.lock) return { allowed: true, name: paint.name, req: '' };
  const state = paintUnlockState(save)[paint.lock];
  return { allowed: state.unlocked, name: paint.name, req: state.req };
}

export interface BodyStatRatios {
  speed: number;
  grip: number;
  drift: number;
  accel: number;
}

export function bodyStatRatios(style: CarBodyStyle): BodyStatRatios {
  const t = { ...DEFAULT_TUNING, ...BODY_TUNING[style] };
  return {
    speed: t.maxSpeed / DEFAULT_TUNING.maxSpeed,
    grip: t.grip / DEFAULT_TUNING.grip,
    drift: t.driftGrip / DEFAULT_TUNING.driftGrip,
    accel: t.accel / DEFAULT_TUNING.accel,
  };
}

export class GarageSystem {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private car: CarVisual | null = null;
  private style: CarBodyStyle = 'standard';

  constructor(private save: SaveManager) {}

  applyTo(car: CarVisual, ghost: CarVisual | null): void {
    car.setPaint(this.save.profile.paint);
    ghost?.setPaint(this.save.profile.paint);
  }

  renderPreview(canvas: HTMLCanvasElement): void {
    if (!this.renderer || !this.scene || !this.camera) {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 50);
      this.camera.position.set(3.6, 2.2, 4.6);
      this.camera.lookAt(0, 0.4, 0);
      const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
      key.position.set(4, 6, 3);
      const rim = new THREE.DirectionalLight(0x8fb4ff, 1.4);
      rim.position.set(-5, 3, -4);
      this.scene.add(key, rim, new THREE.HemisphereLight(0xbdd4f0, 0x222222, 0.9));
      this.car = buildCarVisual(this.save.profile.paint, false, this.save.profile.body);
      this.scene.add(this.car.group);
      this.style = this.save.profile.body;
    }
    if (this.car && this.save.profile.body !== this.style) {
      this.scene.remove(this.car.group);
      this.car = buildCarVisual(this.save.profile.paint, false, this.save.profile.body);
      this.scene.add(this.car.group);
      this.style = this.save.profile.body;
    }
    if (this.car) {
      this.car.group.rotation.y = performance.now() * 0.0006;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
