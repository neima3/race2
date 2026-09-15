import { PAINT_LOCK_IDS, type PaintLockId } from '../render/car-model';
import type { SaveManager } from '../core/save';

export interface PaintLockInfo {
  /** Display name for unlock toasts (already uppercase). */
  label: string;
  /** Requirement shown on the locked garage swatch. */
  req: string;
}

export const PAINT_LOCK_INFO: Record<PaintLockId, PaintLockInfo> = {
  'knockout-win': { label: 'MIDNIGHT', req: 'WIN ANY KNOCKOUT RACE' },
  'daily-streak': { label: 'SUNBURST', req: 'REACH A 7-DAY DAILY STREAK' },
  'near-miss': { label: 'ULTRAVIOLET', req: '25 CAREER NEAR MISSES' },
  'weekly-gold': { label: 'GOLD LEAF', req: 'WIN A WEEKLY GOLD TROPHY' },
};

export interface PaintUnlockState {
  unlocked: boolean;
  req: string;
}

export type PaintUnlockMap = Record<PaintLockId, PaintUnlockState>;

/** Garage display state per lock id — mirrors the bodyUnlocks pattern. */
export function paintUnlockState(save: SaveManager): PaintUnlockMap {
  const state = {} as PaintUnlockMap;
  for (const id of PAINT_LOCK_IDS) {
    state[id] = { unlocked: save.isPaintUnlocked(id), req: PAINT_LOCK_INFO[id].req };
  }
  return state;
}

/** Is the requirement for this lock currently satisfied by save state? */
export function paintRequirementMet(save: SaveManager, lock: PaintLockId): boolean {
  switch (lock) {
    case 'knockout-win':
      return save.stats.knockoutWins >= 1;
    case 'daily-streak':
      return save.daily.bestStreak >= 7 || save.daily.streak >= 7;
    case 'near-miss':
      return save.stats.nearMisses >= 25;
    case 'weekly-gold':
      return Object.values(save.weekly.best).some((b) => b.position === 1);
  }
}

/**
 * Awards every newly-satisfied paint unlock. Idempotent: a lock already in
 * unlocks.paints is skipped, so repeat calls never double-toast. Returns the
 * lock ids unlocked by THIS call (empty when nothing new).
 */
export function checkPaintUnlocks(save: SaveManager): PaintLockId[] {
  const fresh: PaintLockId[] = [];
  for (const id of PAINT_LOCK_IDS) {
    if (!save.isPaintUnlocked(id) && paintRequirementMet(save, id)) {
      save.unlockPaint(id);
      fresh.push(id);
    }
  }
  return fresh;
}
