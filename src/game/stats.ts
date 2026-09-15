import { CUPS } from './career';
import type { SaveManager } from '../core/save';

export interface HeadToHeadRow {
  name: string;
  wins: number;
}

export interface DriverStats {
  laps: number;
  distanceKm: number;
  driftPoints: number;
  airSeconds: number;
  nearMisses: number;
  rivalWins: number;
  knockoutWins: number;
  /** All-time trophy finishes across the four cups, by metal. */
  trophies: { gold: number; silver: number; bronze: number };
  bestDailyStreak: number;
  bestWeeklyStreak: number;
  /** Per-rival head-to-head wins; rivals never beaten are omitted. */
  headToHead: HeadToHeadRow[];
}

/** Single source of truth for the STATS panel; headless-tested. */
export function driverStats(save: SaveManager): DriverStats {
  const trophies = { gold: 0, silver: 0, bronze: 0 };
  for (const cup of CUPS) {
    for (const f of save.cupSave(cup.id).finishes) {
      if (f.trophy) trophies[f.trophy]++;
    }
  }
  const headToHead = Object.entries(save.stats.rivalWinsBy)
    .filter(([, wins]) => wins > 0)
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  return {
    laps: save.stats.laps,
    distanceKm: save.stats.distanceKm,
    driftPoints: save.stats.totalDrift,
    airSeconds: save.stats.totalAir,
    nearMisses: save.stats.nearMisses,
    rivalWins: save.stats.rivalWins,
    knockoutWins: save.stats.knockoutWins,
    trophies,
    bestDailyStreak: save.daily.bestStreak,
    bestWeeklyStreak: save.weekly.bestStreak,
    headToHead,
  };
}
