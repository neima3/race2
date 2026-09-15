/**
 * Interactive tutorial (v8 P6): a 4-drill guided run on sunrise-sprint.
 *
 * Practice-style: the race controller runs with `practice = true` (timer stopped,
 * no checkpoints, no records) and the tutorial layer observes the car each frame.
 * Drill layout is pinned to sunrise-sprint geometry (length ~633m, checkpoints at
 * 210/420): steer gates on the opening straights, orange pads on the mid straight,
 * a drift sector across the big right-hander, and a speed-check gate before the line.
 *
 * Pure state machine — no three.js, no DOM — so test/tutorial.ts can drive it headless.
 */

export const TUTORIAL_TRACK_ID = 'sunrise-sprint';

export type DrillId = 'steer' | 'boost' | 'drift' | 'brake';

export const DRILL_ORDER: DrillId[] = ['steer', 'boost', 'drift', 'brake'];

/** Failed attempts allowed per drill before it auto-skips. */
export const TUTORIAL_MAX_TRIES = 3;
/** Gate ring is missed when crossed farther than this from the ring center (m). */
export const STEER_MISS_METERS = 6;
/** Boost pad registers when crossed within this lateral distance of its center (m). */
export const PAD_HIT_METERS = 2.2;
/** Drift seconds required inside the drift sector. */
export const DRIFT_MIN_SECONDS = 1.2;
/** Brake gate speed limit (km/h) at the crossing. */
export const BRAKE_MAX_KMH = 90;
/** Drift banks while the drift input is held, grounded, above this speed (m/s).
 *  The drill teaches the INPUT (hold space), so credit the button — not the
 *  emergent slip angle, which on gentle bends stays small even when drifting. */
export const DRIFT_ACTIVE_MIN_SPEED = 10;

export interface TutorialRingSpec {
  id: string;
  drill: DrillId;
  dist: number;
  lateral: number;
  height: number;
  radius: number;
}

export interface TutorialPadSpec {
  id: string;
  dist: number;
  lateral: number;
}

/**
 * Gate rings: three steer gates on the opening straights (alternating laterals per
 * spec), the drift-sector entry/exit pair across the main bend, and the brake
 * speed-check gate before the finish line. All clear of the checkpoints (210/420).
 */
export const TUTORIAL_RINGS: TutorialRingSpec[] = [
  { id: 'steer-1', drill: 'steer', dist: 60, lateral: 1, height: 1.5, radius: 3.2 },
  { id: 'steer-2', drill: 'steer', dist: 140, lateral: -1, height: 1.5, radius: 3.2 },
  { id: 'steer-3', drill: 'steer', dist: 220, lateral: 1, height: 1.5, radius: 3.2 },
  { id: 'drift-a', drill: 'drift', dist: 450, lateral: 0, height: 1.5, radius: 3.2 },
  { id: 'drift-b', drill: 'drift', dist: 545, lateral: 0, height: 1.5, radius: 3.2 },
  { id: 'brake-gate', drill: 'brake', dist: 600, lateral: 0, height: 1.5, radius: 3.4 },
];

/** Orange chevron pads for the BOOST drill (visual-only; no record/boost wiring). */
export const TUTORIAL_PADS: TutorialPadSpec[] = [
  { id: 'pad-1', dist: 365, lateral: -1.5 },
  { id: 'pad-2', dist: 400, lateral: 1.5 },
];

export const DRILL_BANNERS: Record<DrillId, { title: string; hint: string }> = {
  steer: { title: 'STEER — PASS THE GATES', hint: 'AIM THROUGH EACH GLOWING RING' },
  boost: { title: 'BOOST — RIDE THE ORANGE PADS', hint: 'PADS MEAN FREE SPEED — HIT BOTH' },
  drift: { title: 'DRIFT — HOLD SPACE THROUGH THE BEND', hint: `BANK ${DRIFT_MIN_SECONDS.toFixed(1)}s OF DRIFT BETWEEN THE GATES` },
  brake: { title: 'BRAKE — CROSS UNDER 90 KM/H', hint: 'LIFT AND BRAKE BEFORE THE LAST GATE' },
};

/** Where the car is placed after a failed attempt (before the drill's first target). */
export const DRILL_START_DIST: Record<DrillId, number> = { steer: 8, boost: 235, drift: 425, brake: 565 };

export interface TutorialSample {
  dist: number;
  lateral: number;
  speedKmh: number;
  drifting: boolean;
}

export type TutorialEvent =
  | { type: 'drill-start'; drill: DrillId; banner: string; hint: string }
  | { type: 'hit'; drill: DrillId; targetId: string; done: number; total: number }
  | { type: 'fail'; drill: DrillId; tries: number; reason: 'missed' | 'too-fast' | 'no-drift' }
  | { type: 'drill-clear'; drill: DrillId }
  | { type: 'drill-skipped'; drill: DrillId }
  | { type: 'complete'; skippedAny: boolean };

export type TutorialEmit = (event: TutorialEvent) => void;

const DRILL_TOTAL: Record<DrillId, number> = { steer: 3, boost: 2, drift: 1, brake: 1 };

const SECTOR_ENTRY = 'drift-a';
const SECTOR_EXIT = 'drift-b';

export class TutorialRun {
  drillIndex = 0;
  tries = 0;
  done = 0;
  driftTime = 0;
  status: 'running' | 'complete' = 'running';
  skippedAny = false;

  private lapBase = 0;
  private lastDist: number | null = null;
  private prevProgress = 0;
  private progress = 0;
  private hitIds = new Set<string>();

  constructor(
    private trackLength: number,
    private emit: TutorialEmit,
  ) {
    this.announceDrill();
  }

  get drill(): DrillId {
    return DRILL_ORDER[Math.min(this.drillIndex, DRILL_ORDER.length - 1)];
  }

  get total(): number {
    return DRILL_TOTAL[this.drill];
  }

  /** SKIP button / ESC: finish the whole tutorial immediately (completion-with-skips). */
  skipAll(): void {
    if (this.status !== 'running') return;
    this.skippedAny = true;
    this.status = 'complete';
    this.emit({ type: 'complete', skippedAny: true });
  }

  observe(sample: TutorialSample, dt: number): void {
    if (this.status !== 'running') return;
    this.updateProgress(sample.dist);
    const drill = this.drill;

    if (drill === 'drift' && this.inSector() && sample.drifting) this.driftTime += dt;

    if (drill === 'boost') {
      for (const pad of TUTORIAL_PADS) {
        if (this.hitIds.has(pad.id)) continue;
        if (!this.crossed(pad.dist)) continue;
        if (Math.abs(sample.lateral - pad.lateral) <= PAD_HIT_METERS) this.registerHit(pad.id);
        else this.fail('missed');
        return;
      }
      return;
    }

    for (const ring of TUTORIAL_RINGS) {
      if (ring.drill !== drill || this.hitIds.has(ring.id)) continue;
      if (!this.crossed(ring.dist)) continue;
      if (drill === 'steer') {
        if (Math.abs(sample.lateral - ring.lateral) <= STEER_MISS_METERS) this.registerHit(ring.id);
        else this.fail('missed');
      } else if (drill === 'drift') {
        if (ring.id === SECTOR_ENTRY) {
          // Sector entry arms the drift clock but does NOT count toward the drill's
          // single required gate — only the exit ring (with enough banked drift) clears it.
          this.driftTime = 0;
          this.registerHit(ring.id, false);
        } else if (this.driftTime >= DRIFT_MIN_SECONDS) {
          this.registerHit(ring.id);
        } else {
          this.fail('no-drift');
        }
      } else {
        if (sample.speedKmh < BRAKE_MAX_KMH) this.registerHit(ring.id);
        else this.fail('too-fast');
      }
      return;
    }
  }

  private registerHit(id: string, counts = true): void {
    this.hitIds.add(id);
    if (counts) this.done++;
    const drill = this.drill;
    this.emit({ type: 'hit', drill, targetId: id, done: this.done, total: this.total });
    if (counts && this.done >= this.total) {
      this.emit({ type: 'drill-clear', drill });
      this.advance();
    }
  }

  private fail(reason: 'missed' | 'too-fast' | 'no-drift'): void {
    this.tries++;
    this.done = 0;
    this.driftTime = 0;
    this.hitIds.clear();
    const drill = this.drill;
    if (this.tries >= TUTORIAL_MAX_TRIES) {
      this.skippedAny = true;
      this.emit({ type: 'drill-skipped', drill });
      this.advance();
    } else {
      this.emit({ type: 'fail', drill, tries: this.tries, reason });
    }
  }

  private advance(): void {
    if (this.drillIndex >= DRILL_ORDER.length - 1) {
      this.status = 'complete';
      this.emit({ type: 'complete', skippedAny: this.skippedAny });
      return;
    }
    this.drillIndex++;
    this.tries = 0;
    this.done = 0;
    this.driftTime = 0;
    this.hitIds.clear();
    this.announceDrill();
  }

  private announceDrill(): void {
    const banner = DRILL_BANNERS[this.drill];
    this.emit({ type: 'drill-start', drill: this.drill, banner: banner.title, hint: banner.hint });
  }

  /** Monotonic lap-unwrapped progress from the wrapping track dist. */
  private updateProgress(dist: number): void {
    if (this.lastDist === null) {
      this.lastDist = dist;
      this.prevProgress = dist;
      this.progress = dist;
      return;
    }
    if (dist < this.lastDist - this.trackLength * 0.5) this.lapBase += this.trackLength;
    else if (dist > this.lastDist + this.trackLength * 0.5) this.lapBase -= this.trackLength;
    this.lastDist = dist;
    this.prevProgress = this.progress;
    this.progress = this.lapBase + dist;
  }

  private crossed(targetDist: number): boolean {
    return this.prevProgress < targetDist && this.progress >= targetDist;
  }

  private inSector(): boolean {
    const entry = TUTORIAL_RINGS.find((r) => r.id === SECTOR_ENTRY)!.dist;
    const exit = TUTORIAL_RINGS.find((r) => r.id === SECTOR_EXIT)!.dist;
    const local = this.progress - this.lapBase;
    return local >= entry && local < exit;
  }
}
