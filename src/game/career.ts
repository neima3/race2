import { TRACKS, type TrackDef } from '../track/defs';
import { pickLineup, PLAYER_NAME, type RivalPreset, type RivalTier, type Standing } from './rivals';
import type { SaveManager, CupRun, CupRunEntry, TrophyKind } from '../core/save';

export interface CupDef {
  id: string;
  name: string;
  subtitle: string;
  gridLabel: string;
  accent: number;
  accentName: string;
  tiers: RivalTier[];
  trackIds: string[];
}

export const CUP_POINTS = [25, 18, 15, 12];
export const CUP_RACES = 4;

export const CUPS: CupDef[] = [
  {
    id: 'sprint-cup',
    name: 'SPRINT CUP',
    subtitle: 'Sunrise hills to the first gauntlet',
    gridLabel: 'EASY + MID GRID',
    accent: 0xffb52e,
    accentName: '#ffb52e',
    tiers: ['easy', 'easy', 'mid'],
    trackIds: ['sunrise-sprint', 'canyon-twist', 'dune-rush', 'gauntlet-ii'],
  },
  {
    id: 'street-cup',
    name: 'STREET CUP',
    subtitle: 'Loops, esses and neon sprints',
    gridLabel: 'MID GRID',
    accent: 0x29e6ff,
    accentName: '#29e6ff',
    tiers: ['mid', 'mid', 'mid'],
    trackIds: ['sky-loop', 'serpents-tail', 'twilight-gauntlet', 'volt-alley'],
  },
  {
    id: 'gauntlet-cup',
    name: 'GAUNTLET CUP',
    subtitle: 'Everything, everywhere, at pace',
    gridLabel: 'MID + PRO GRID',
    accent: 0xb44dff,
    accentName: '#b44dff',
    tiers: ['mid', 'mid', 'pro'],
    trackIds: ['grand-gauntlet', 'neon-vertical', 'neon-circuit', 'ring-runner'],
  },
];

export function cupById(id: string): CupDef | null {
  return CUPS.find((c) => c.id === id) ?? null;
}

export function cupTracks(cup: CupDef): TrackDef[] {
  return cup.trackIds.map((id) => TRACKS.find((t) => t.id === id)).filter((t): t is TrackDef => !!t);
}

export function cupRaceTrack(cup: CupDef, raceIndex: number): TrackDef {
  const id = cup.trackIds[Math.max(0, Math.min(cup.trackIds.length - 1, raceIndex))];
  const def = TRACKS.find((t) => t.id === id);
  if (!def) throw new Error(`cup ${cup.id} references unknown track ${id}`);
  return def;
}

export function cupLineup(cup: CupDef, raceIndex: number): RivalPreset[] {
  return pickLineup(cup.trackIds[raceIndex], raceIndex + 1, cup.tiers);
}

function hasMedal(save: SaveManager, t: TrackDef): boolean {
  const best = save.trackSave(t.id).bestTimeMs;
  return best !== null && best <= t.medals.bronze;
}

export function cupUnlock(
  cup: CupDef,
  tracks: TrackDef[],
  save: SaveManager,
  forceAll: boolean,
): { unlocked: boolean; reason: string | null } {
  if (forceAll) return { unlocked: true, reason: null };
  for (const id of cup.trackIds) {
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx <= 0) continue;
    if (!hasMedal(save, tracks[idx - 1])) {
      return { unlocked: false, reason: `MEDAL ON ${tracks[idx - 1].name.toUpperCase()}` };
    }
  }
  return { unlocked: true, reason: null };
}

export function startCupRun(cupId: string): CupRun {
  return {
    cupId,
    nextRace: 0,
    entries: [{ name: PLAYER_NAME, isPlayer: true, paint: 0, points: 0, wins: 0 }],
    positions: [],
  };
}

function entryFor(run: CupRun, name: string, isPlayer: boolean, paint: number): CupRunEntry {
  let e = run.entries.find((x) => x.name === name);
  if (!e) {
    e = { name, isPlayer, paint, points: 0, wins: 0 };
    run.entries.push(e);
  }
  return e;
}

export function applyRaceResult(
  run: CupRun,
  standings: Standing[],
  playerPaint: number,
): { playerPos: number; playerPoints: number } {
  const playerPos = Math.max(1, standings.findIndex((s) => s.isPlayer) + 1);
  const playerPoints = CUP_POINTS[playerPos - 1] ?? 0;
  standings.forEach((s, i) => {
    const pts = CUP_POINTS[i] ?? 0;
    const e = entryFor(run, s.name, s.isPlayer, s.paint);
    e.points += pts;
    if (i === 0) e.wins += 1;
    if (s.isPlayer) e.paint = playerPaint;
  });
  run.positions.push(playerPos);
  run.nextRace = Math.min(CUP_RACES, run.nextRace + 1);
  return { playerPos, playerPoints };
}

export function cupStandings(run: CupRun): CupRunEntry[] {
  return [...run.entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (a.isPlayer ? -1 : 1) - (b.isPlayer ? -1 : 1) ||
      a.name.localeCompare(b.name),
  );
}

export function cupComplete(run: CupRun): boolean {
  return run.positions.length >= CUP_RACES;
}

export function cupTrophy(run: CupRun): TrophyKind {
  if (!cupComplete(run)) return null;
  const order = cupStandings(run);
  const idx = order.findIndex((e) => e.isPlayer);
  if (idx === 0) return 'gold';
  if (idx === 1) return 'silver';
  if (idx === 2) return 'bronze';
  return null;
}

export interface CareerPanelData {
  cupName: string;
  cupId: string;
  raceNumber: number;
  totalRaces: number;
  playerPos: number;
  racePoints: number;
  standings: CupRunEntry[];
  isFinal: boolean;
  trophy: TrophyKind;
}
