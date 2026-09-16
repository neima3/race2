// v9 P2 slipstream drafting. Pure per-car helper: feed the forward gap to the
// nearest aligned car ahead each step; the tracker owns the charge state machine
// and the top-speed factor consumed by CarPhysics.step's speed-cap path.
// Scalars only — no per-frame allocation.

export const DRAFT_GAP_MIN = 4;
export const DRAFT_GAP_MAX = 9;
export const DRAFT_LAT_MAX = 2.2;
export const DRAFT_BUILD_TIME = 0.5;
export const DRAFT_DECAY_TIME = 0.3;
export const DRAFT_ACTIVE_MIN = 0.5;
export const DRAFT_TOP_SPEED = 1.08;

/** Signed shortest forward gap from `behindDist` to `aheadDist` on a loop of `len` (negative = target behind). */
export function gapAhead(len: number, behindDist: number, aheadDist: number): number {
  let d = (aheadDist - behindDist) % len;
  if (d > len / 2) d -= len;
  if (d < -len / 2) d += len;
  return d;
}

export class DraftTracker {
  charge = 0;
  /** Perk live (charge >= DRAFT_ACTIVE_MIN) — drives the HUD chip. */
  active = false;
  /** Previous in-pocket gap: the pocket only builds while CLOSING on the car ahead
   *  (slipstream is a catch/slingshot reward, not matched-following cruise). */
  private prevGap = Number.NaN;

  /** Collision (or respawn) — pocket lost instantly. */
  reset(): void {
    this.charge = 0;
    this.active = false;
    this.prevGap = Number.NaN;
  }

  /**
   * One fixed step. `gap` = forward distance to the nearest candidate ahead (m),
   * or -1 when nothing qualifies as ahead. `latDelta` = |lateral difference| to
   * that car (ignored when gap < 0).
   */
  update(dt: number, gap: number, latDelta: number): void {
    const pocket = gap >= DRAFT_GAP_MIN && gap <= DRAFT_GAP_MAX && latDelta < DRAFT_LAT_MAX;
    const entering = pocket && Number.isNaN(this.prevGap);
    const closing = pocket && !Number.isNaN(this.prevGap) && gap < this.prevGap - 1e-4;
    if (pocket && (entering || closing)) this.charge = Math.min(1, this.charge + dt / DRAFT_BUILD_TIME);
    else this.charge = Math.max(0, this.charge - dt / DRAFT_DECAY_TIME);
    this.prevGap = pocket ? gap : Number.NaN;
    this.active = this.charge >= DRAFT_ACTIVE_MIN;
  }

  /** Top-speed multiplier for CarPhysics.step (byte-identical 1 when inactive). */
  factor(): number {
    return this.active ? DRAFT_TOP_SPEED : 1;
  }
}
