import { TRACKS, type TrackDef, type TrackVariant } from '../track/defs';
import { hashSeed, pickLineup, type RivalPreset } from './rivals';

export const DAILY_LAPS = 2;

const DAILY_TIERS: ('easy' | 'mid' | 'pro')[] = ['easy', 'pro', 'pro'];
const SEED_PREFIX = 'race2-daily:';

export function todayKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
}

export function prevDateKey(key: string): string {
  if (!/^\d{8}$/.test(key)) return key;
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)) - 86400000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{8}$/.test(key)) return false;
  const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)));
  return (
    d.getUTCFullYear() === +key.slice(0, 4) &&
    d.getUTCMonth() + 1 === +key.slice(4, 6) &&
    d.getUTCDate() === +key.slice(6, 8)
  );
}

export function dailyIsLive(dateKey: string, now: Date = new Date()): boolean {
  return isValidDateKey(dateKey) && dateKey === todayKey(now);
}

export interface DailyDef {
  dateKey: string;
  track: TrackDef;
  lineup: RivalPreset[];
  laps: number;
  variant: TrackVariant;
}

export function dailyFor(dateKey: string): DailyDef {
  const h = hashSeed(SEED_PREFIX + dateKey);
  const n = TRACKS.length;
  let idx = h % n;
  if (isValidDateKey(dateKey) && hashSeed(SEED_PREFIX + prevDateKey(dateKey)) % n === idx) {
    idx = (idx + 1) % n;
  }
  const track = TRACKS[idx];
  return {
    dateKey,
    track,
    lineup: pickLineup(track.id, h % 100000, [...DAILY_TIERS]),
    laps: DAILY_LAPS,
    variant: 'day',
  };
}

export interface DailyShareLink {
  dateKey: string;
  position: number;
  timeMs: number;
}

export function buildDailyLink(dateKey: string, position: number, timeMs: number): string {
  return `#d=${dateKey}.${Math.max(1, Math.min(99, Math.round(position)))}.${Math.max(0, Math.round(timeMs))}`;
}

export function parseDailyLink(hash: string): DailyShareLink | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith('d=')) return null;
  const parts = h.slice(2).split('.');
  if (parts.length !== 3) return null;
  const dateKey = parts[0];
  if (!isValidDateKey(dateKey)) return null;
  const position = Number(parts[1]);
  if (!Number.isInteger(position) || position < 1 || position > 99) return null;
  const timeMs = Number(parts[2]);
  if (!Number.isInteger(timeMs) || timeMs <= 0 || timeMs > 3600000) return null;
  return { dateKey, position, timeMs };
}
