import { CUPS } from './career';
import { PAINT_LOCK_IDS } from '../render/car-model';
import type { SaveManager } from '../core/save';

/** Margin a friend-ghost finish must clear to count as a bust (v8 P9 GHOSTBUSTER). */
export const GHOSTBUST_MARGIN_MS = 2000;
/** Near misses required in ONE traffic run for THREAD THE NEEDLE (v8 P9). */
export const NEEDLE_NEAR_MISSES = 5;
/** Cumulative active-slipstream seconds a rival finish needs for DRAFT KING (v9 P5). */
export const DRAFT_KING_SECONDS = 8;

export interface RivalAchievementState {
  rivalWins: number;
  cupsWithTrophy: number;
  rivalsBeaten: number;
  friendGhostRaces: number;
  tourist: number;
  /** Friend-ghost races won by > GHOSTBUST_MARGIN_MS (v8 P9). */
  friendGhostBusts: number;
  /** Traffic runs finished with >= NEEDLE_NEAR_MISSES near misses (v8 P9). */
  trafficNeedles: number;
  /** 1 when any weekly event finished P1 (gold trophy) (v8 P9). */
  weeklyGold: number;
  /** 1 when the tutorial has been finished (v8 P9). */
  tutorialDone: number;
  /** Earned locked paints (v8 PAINT COLLECTOR denominator = PAINT_LOCK_IDS.length). */
  paintsUnlocked: number;
  /** Races finished with >= DRAFT_KING_SECONDS cumulative slipstream (v9 P5). */
  draftKingRaces: number;
  /** Solo night-variant races completed (v9 P5 STORM CHASER). */
  nightRaces: number;
  /** Solo rain-variant races completed (v9 P5 STORM CHASER). */
  rainRaces: number;
  /** Replays shared (v9 P5 DIRECTOR). */
  replaysShared: number;
  /** Times SOVEREIGN was beaten (v9 P5 KINGMAKER). */
  championBeaten: number;
  /** 1 when the APEX LEAGUE has a gold trophy finish (v10 P4). */
  apexGold: number;
  /** Rival/knockout races won in the GLIDE body (v10 P4). */
  glideWins: number;
  /** halo-flats laps with every ring hit (v10 P4). */
  ringPerfectLaps: number;
}

const GRAND_TOUR_CUP = 'grand-tour';
const APEX_LEAGUE_CUP = 'apex-league';

export function rivalAchievementState(save: SaveManager): RivalAchievementState {
  const cupsWithTrophy = CUPS.filter((c) => save.cupSave(c.id).finishes.some((f) => f.trophy)).length;
  return {
    rivalWins: save.stats.rivalWins,
    cupsWithTrophy,
    rivalsBeaten: save.stats.rivalsBeaten.length,
    friendGhostRaces: save.stats.friendGhostRaces,
    tourist: save.cupSave(GRAND_TOUR_CUP).finishes.filter((f) => f.trophy).length,
    friendGhostBusts: save.stats.friendGhostBusts,
    trafficNeedles: save.stats.trafficNeedles,
    weeklyGold: Object.values(save.weekly.best).some((b) => b.position === 1) ? 1 : 0,
    tutorialDone: save.settings.tutorialDone === true ? 1 : 0,
    paintsUnlocked: save.unlocks.paints.length,
    draftKingRaces: save.stats.draftKingRaces,
    nightRaces: save.stats.nightRaces,
    rainRaces: save.stats.rainRaces,
    replaysShared: save.stats.replaysShared,
    championBeaten: save.stats.championBeaten,
    apexGold: save.cupSave(APEX_LEAGUE_CUP).finishes.some((f) => f.trophy === 'gold') ? 1 : 0,
    glideWins: save.stats.glideWins,
    ringPerfectLaps: save.stats.ringPerfectLaps,
  };
}

export interface AchievementPop {
  id: string;
  name: string;
}

export interface AchievementRow {
  id: string;
  name: string;
  done: boolean;
}

const RIVAL_ACHIEVEMENTS: { id: string; name: string; done: (s: RivalAchievementState) => boolean }[] = [
  { id: 'first-blood', name: 'FIRST BLOOD', done: (s) => s.rivalWins >= 1 },
  { id: 'cup-cadet', name: 'CUP CADET', done: (s) => s.cupsWithTrophy >= 1 },
  { id: 'triple-crown', name: 'TRIPLE CROWN', done: (s) => s.cupsWithTrophy >= 3 },
  { id: 'social-climber', name: 'SOCIAL CLIMBER', done: (s) => s.friendGhostRaces >= 1 },
  { id: 'full-house', name: 'FULL HOUSE', done: (s) => s.rivalsBeaten >= 8 },
  { id: 'tourist', name: 'TOURIST', done: (s) => s.tourist >= 1 },
  { id: 'ghostbuster', name: 'GHOSTBUSTER', done: (s) => s.friendGhostBusts >= 1 },
  { id: 'thread-needle', name: 'THREAD THE NEEDLE', done: (s) => s.trafficNeedles >= 1 },
  { id: 'weekly-warrior', name: 'WEEKLY WARRIOR', done: (s) => s.weeklyGold >= 1 },
  { id: 'fresh-grad', name: 'FRESH GRAD', done: (s) => s.tutorialDone >= 1 },
  { id: 'paint-collector', name: 'PAINT COLLECTOR', done: (s) => s.paintsUnlocked >= PAINT_LOCK_IDS.length },
  { id: 'draft-king', name: 'DRAFT KING', done: (s) => s.draftKingRaces >= 1 },
  { id: 'storm-chaser', name: 'STORM CHASER', done: (s) => s.nightRaces >= 1 && s.rainRaces >= 1 },
  { id: 'director', name: 'DIRECTOR', done: (s) => s.replaysShared >= 1 },
  { id: 'kingmaker', name: 'KINGMAKER', done: (s) => s.championBeaten >= 1 },
  { id: 'apex-champion', name: 'APEX CHAMPION', done: (s) => s.apexGold >= 1 },
  { id: 'glide-rider', name: 'GLIDE RIDER', done: (s) => s.glideWins >= 1 },
  { id: 'ringmaster', name: 'RINGMASTER', done: (s) => s.ringPerfectLaps >= 1 },
];

export function achievementPops(before: RivalAchievementState, after: RivalAchievementState): AchievementPop[] {
  return RIVAL_ACHIEVEMENTS.filter((a) => !a.done(before) && a.done(after)).map((a) => ({ id: a.id, name: a.name }));
}

/** Done-state per achievement id — QA hook + any panel that wants the raw booleans. */
export function achievementList(save: SaveManager): AchievementRow[] {
  const s = rivalAchievementState(save);
  return RIVAL_ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, done: a.done(s) }));
}
