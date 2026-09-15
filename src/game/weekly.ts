import { TRACKS, type TrackDef, type TrackVariant } from '../track/defs';
import { hashSeed, pickLineup, PLAYER_NAME, type RivalPreset, type Standing } from './rivals';
import { CUP_POINTS } from './career';
import type { CupRunEntry, TrophyKind, WeeklyRun } from '../core/save';

export const WEEKLY_LAPS = 2;
export const WEEKLY_RACES = 3;

export type WeeklyModifierId = 'rain-finals' | 'night-owl' | 'slick-mayhem' | 'boost-fest';

export interface WeeklyModifier {
  id: WeeklyModifierId;
  name: string;
  blurb: string;
}

/** One modifier per week, indexed by continuous epoch-week (Monday-aligned) % 4. */
export const WEEKLY_MODIFIERS: WeeklyModifier[] = [
  { id: 'rain-finals', name: 'RAIN FINALS', blurb: 'RACES 2 AND 3 RUN IN THE RAIN' },
  { id: 'night-owl', name: 'NIGHT OWL', blurb: 'THE WHOLE CUP RUNS AT NIGHT' },
  { id: 'slick-mayhem', name: 'SLICK MAYHEM', blurb: 'SLICK ZONES RUN TWICE AS LONG AND WIDE' },
  { id: 'boost-fest', name: 'BOOST FEST', blurb: 'BOOST PADS PUSH 1.5X HARDER' },
];

const SEED_PREFIX = 'race2-weekly:';
const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const WEEKLY_TIERS: ('mid' | 'pro')[] = ['mid', 'mid', 'pro'];

/** UTC ISO-week key `YYYYWnn` (Monday-based, week 1 contains the first Thursday). */
export function weekKeyFor(date: Date): string {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3); // Thursday of this ISO week
  const isoYear = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  const week = 1 + Math.round((t.getTime() - week1Thu.getTime()) / WEEK_MS);
  return `${isoYear}W${String(week).padStart(2, '0')}`;
}

function weekMonday(key: string): Date | null {
  const m = /^(\d{4})W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = +m[1];
  const week = +m[2];
  if (year < 1970 || year > 9999 || week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Thu = new Date(Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7) + 3));
  const monday = new Date(week1Thu.getTime() - 3 * DAY_MS + (week - 1) * WEEK_MS);
  return weekKeyFor(monday) === key ? monday : null;
}

export function isValidWeekKey(key: string): boolean {
  return weekMonday(key) !== null;
}

export function prevWeekKey(key: string): string {
  const monday = weekMonday(key);
  if (!monday) return key;
  return weekKeyFor(new Date(monday.getTime() - WEEK_MS));
}

export function weekIsLive(key: string, now: Date = new Date()): boolean {
  return isValidWeekKey(key) && key === weekKeyFor(now);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function modifierForWeek(weekKey: string): WeeklyModifier {
  const monday = weekMonday(weekKey);
  const idx = monday ? Math.floor(monday.getTime() / WEEK_MS) % WEEKLY_MODIFIERS.length : 0;
  return WEEKLY_MODIFIERS[idx];
}

export interface WeeklyDef {
  weekKey: string;
  tracks: TrackDef[];
  lineups: RivalPreset[][];
  laps: number;
  modifier: WeeklyModifier;
}

export function weeklyFor(weekKey: string): WeeklyDef {
  const h = hashSeed(SEED_PREFIX + weekKey);
  const rng = mulberry32(h);
  const order = TRACKS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const tracks: TrackDef[] = [];
  const themes = new Set<string>();
  for (const i of order) {
    const t = TRACKS[i];
    if (themes.has(t.theme)) continue;
    tracks.push(t);
    themes.add(t.theme);
    if (tracks.length === WEEKLY_RACES) break;
  }
  for (const i of order) {
    if (tracks.length >= WEEKLY_RACES) break;
    const t = TRACKS[i];
    if (!tracks.some((p) => p.id === t.id)) tracks.push(t);
  }
  return {
    weekKey,
    tracks,
    lineups: tracks.map((t, i) => pickLineup(t.id, i + 1, [...WEEKLY_TIERS])),
    laps: WEEKLY_LAPS,
    modifier: modifierForWeek(weekKey),
  };
}

export function weeklyVariant(def: WeeklyDef, raceIndex: number): TrackVariant {
  if (def.modifier.id === 'night-owl') return 'night';
  if (def.modifier.id === 'rain-finals' && raceIndex >= 1) return 'rain';
  return 'day';
}

/**
 * Modifier-applied race track. Slick/pad modifiers return a runtime COPY with the
 * rects scaled — the shared TRACKS defs are never mutated. Weather/night modifiers
 * flow through the variant plumbing instead and return the shared def as-is.
 */
export function weeklyRaceTrack(def: WeeklyDef, raceIndex: number): TrackDef {
  const base = def.tracks[Math.max(0, Math.min(WEEKLY_RACES - 1, raceIndex))];
  if (def.modifier.id === 'slick-mayhem') {
    const doubled = (base.slicks ?? []).map((sl) => ({ dist: sl.dist, lateral: sl.lateral, w: sl.w * 2, l: sl.l * 2 }));
    // Most tracks ship without base slicks — a mayhem week on one of them would be a
    // no-op. Synthesize deterministic patches at 25/50/75% of the lap (alternating
    // lateral) so every mayhem race actually plays slick.
    const slicks = doubled.length > 0 ? doubled : synthSlicks(base);
    return { ...base, slicks };
  }
  if (def.modifier.id === 'boost-fest') {
    return { ...base, boosts: base.boosts.map((b) => ({ ...b, strength: b.strength * 1.5 })) };
  }
  return base;
}

/** Deterministic slick patches for slick-less tracks (slick-mayhem weeks only). */
function synthSlicks(base: TrackDef): NonNullable<TrackDef['slicks']> {
  const len = trackCurveLength(base);
  const w = 4;
  const l = 24;
  return [0.25, 0.5, 0.75].map((f, i) => ({
    dist: Math.round(len * f),
    lateral: i % 2 === 0 ? -2 : 2,
    w,
    l,
  }));
}

/** Curve length without instantiating a full TrackCurve (control-point polyline estimate). */
function trackCurveLength(base: TrackDef): number {
  let total = 0;
  for (let i = 0; i < base.points.length; i++) {
    const a = base.points[i].pos;
    const b = base.points[(i + 1) % base.points.length].pos;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return Math.max(200, total * 0.95);
}

export function startWeeklyRun(weekKey: string): WeeklyRun {
  return {
    weekKey,
    nextRace: 0,
    entries: [{ name: PLAYER_NAME, isPlayer: true, paint: 0, points: 0, wins: 0 }],
    positions: [],
  };
}

function entryFor(run: WeeklyRun, name: string, isPlayer: boolean, paint: number): CupRunEntry {
  let e = run.entries.find((x) => x.name === name);
  if (!e) {
    e = { name, isPlayer, paint, points: 0, wins: 0 };
    run.entries.push(e);
  }
  return e;
}

export function applyWeeklyResult(run: WeeklyRun, standings: Standing[], playerPaint: number): { playerPos: number; playerPoints: number } {
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
  run.nextRace = Math.min(WEEKLY_RACES, run.nextRace + 1);
  return { playerPos, playerPoints };
}

export function weeklyStandings(run: WeeklyRun): CupRunEntry[] {
  return [...run.entries].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (a.isPlayer ? -1 : 1) - (b.isPlayer ? -1 : 1) ||
      a.name.localeCompare(b.name),
  );
}

export function weeklyComplete(run: WeeklyRun): boolean {
  return run.positions.length >= WEEKLY_RACES;
}

export function weeklyTrophy(run: WeeklyRun): TrophyKind {
  if (!weeklyComplete(run)) return null;
  const idx = weeklyStandings(run).findIndex((e) => e.isPlayer);
  if (idx === 0) return 'gold';
  if (idx === 1) return 'silver';
  if (idx === 2) return 'bronze';
  return null;
}

export interface WeeklyPanelData {
  weekKey: string;
  raceNumber: number;
  totalRaces: number;
  playerPos: number;
  racePoints: number;
  totalPoints: number;
  standings: CupRunEntry[];
  isFinal: boolean;
  trophy: TrophyKind;
  modifierName: string;
}

export interface WeeklyShareLink {
  weekKey: string;
  points: number;
  position: number;
}

export function buildWeeklyLink(weekKey: string, points: number, position: number): string {
  return `#w=${weekKey}.${Math.max(0, Math.min(999, Math.round(points)))}.${Math.max(1, Math.min(99, Math.round(position)))}`;
}

export function parseWeeklyLink(hash: string): WeeklyShareLink | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith('w=')) return null;
  const parts = h.slice(2).split('.');
  if (parts.length !== 3) return null;
  const weekKey = parts[0];
  if (!isValidWeekKey(weekKey)) return null;
  const points = Number(parts[1]);
  if (!Number.isInteger(points) || points < 0 || points > 999) return null;
  const position = Number(parts[2]);
  if (!Number.isInteger(position) || position < 1 || position > 99) return null;
  return { weekKey, points, position };
}
