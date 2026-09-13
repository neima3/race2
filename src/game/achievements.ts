import { CUPS } from './career';
import type { SaveManager } from '../core/save';

export interface RivalAchievementState {
  rivalWins: number;
  cupsWithTrophy: number;
  rivalsBeaten: number;
  friendGhostRaces: number;
}

export function rivalAchievementState(save: SaveManager): RivalAchievementState {
  const cupsWithTrophy = CUPS.filter((c) => save.cupSave(c.id).finishes.some((f) => f.trophy)).length;
  return {
    rivalWins: save.stats.rivalWins,
    cupsWithTrophy,
    rivalsBeaten: save.stats.rivalsBeaten.length,
    friendGhostRaces: save.stats.friendGhostRaces,
  };
}

export interface AchievementPop {
  id: string;
  name: string;
}

const RIVAL_ACHIEVEMENTS: { id: string; name: string; done: (s: RivalAchievementState) => boolean }[] = [
  { id: 'first-blood', name: 'FIRST BLOOD', done: (s) => s.rivalWins >= 1 },
  { id: 'cup-cadet', name: 'CUP CADET', done: (s) => s.cupsWithTrophy >= 1 },
  { id: 'triple-crown', name: 'TRIPLE CROWN', done: (s) => s.cupsWithTrophy >= 3 },
  { id: 'social-climber', name: 'SOCIAL CLIMBER', done: (s) => s.friendGhostRaces >= 1 },
  { id: 'full-house', name: 'FULL HOUSE', done: (s) => s.rivalsBeaten >= 8 },
];

export function achievementPops(before: RivalAchievementState, after: RivalAchievementState): AchievementPop[] {
  return RIVAL_ACHIEVEMENTS.filter((a) => !a.done(before) && a.done(after)).map((a) => ({ id: a.id, name: a.name }));
}
