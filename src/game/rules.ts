import type { CarPhysics } from '../physics/car';
import type { TrackDef } from '../track/defs';

export interface PadState {
  lastBoostIndex: number;
  boostCooldown: number;
}

export function resetPads(pads: PadState): void {
  pads.lastBoostIndex = -1;
  pads.boostCooldown = 0;
}

export function updateBoostPads(car: CarPhysics, def: TrackDef, pads: PadState, dtMs: number): number | null {
  if (pads.boostCooldown > 0) pads.boostCooldown -= dtMs;
  const boosts = def.boosts;
  for (let i = 0; i < boosts.length; i++) {
    const b = boosts[i];
    if (i === pads.lastBoostIndex) continue;
    if (pads.boostCooldown > 0) continue;
    const d = car.state.trackDist;
    const near = Math.abs(d - b.dist) < 6;
    const latOk = Math.abs(car.state.lateral - b.lateral) < 3.6;
    if (near && latOk && car.state.grounded) {
      car.applyBoost(b.strength, 1.6);
      pads.lastBoostIndex = i;
      pads.boostCooldown = 400;
      return i;
    }
  }
  return null;
}

export function computeOnSlick(slicks: TrackDef['slicks'], trackDist: number, lateral: number): boolean {
  if (!slicks) return false;
  for (const sl of slicks) {
    if (Math.abs(trackDist - sl.dist) < sl.l / 2 && Math.abs(lateral - sl.lateral) < sl.w / 2) return true;
  }
  return false;
}

export function moverOverlap(trackDist: number, lateral: number, mDist: number, mLat: number): boolean {
  return Math.abs(trackDist - mDist) < 2.2 && Math.abs(lateral - mLat) < 1.5;
}

export function applyMoverScrub(car: CarPhysics, dt: number): void {
  car.state.vel.multiplyScalar(Math.max(0, 1 - 3.5 * dt));
}
