import { prevDateKey } from '../game/daily';
import { prevWeekKey } from '../game/weekly';
import { PAINT_LOCK_IDS, type PaintLockId } from '../render/car-model';

export type QualityTier = 'low' | 'medium' | 'high';
export type TouchSteerMode = 'buttons' | 'tilt';
export type CameraMode = 'chase' | 'close' | 'hood';

export interface TrackSave {
  bestTimeMs: number | null;
  history: number[];
  ghost: string | null;
  driftBest?: number;
}

export interface Settings {
  quality: 'auto' | QualityTier;
  cam: CameraMode;
  /** FOV preference 60-100 (slider value; CHASE/CLOSE base = fov - 10, HOOD forces 70). */
  fov: number;
  /** Max simultaneous time-trial ghosts (1-3). */
  ghosts: number;
  music: boolean;
  sfx: boolean;
  steeringSensitivity: number;
  touchSteer: TouchSteerMode;
  showGhost: boolean;
  reducedMotion: boolean;
  hudContrast?: boolean;
  shakeIntensity: number;
  leftyTouch: boolean;
  onboarded?: boolean;
  hintRival?: boolean;
  hintKnockout?: boolean;
  hintTraffic?: boolean;
  hintCam?: boolean;
  /** Interactive tutorial finished (any path — completed or skipped) (v8 P6). Additive. */
  tutorialDone?: boolean;
  /** True when any tutorial drill was skipped via fails or the SKIP/ESC exit (v8 P6). Additive. */
  tutorialSkipped?: boolean;
}

const SAVE_KEY = 'race2.save.v1';
const SETTINGS_KEY = 'race2.settings.v1';
const PLAYER_KEY = 'race2.player.v1';
const STATS_KEY = 'race2.stats.v1';

export const SCHEMA_VERSION = 2;

type Stored<T> = T & { schemaVersion?: number };

export type TrophyKind = 'gold' | 'silver' | 'bronze' | null;

export interface CupFinishRecord {
  positions: number[];
  points: number;
  trophy: TrophyKind;
  dateMs: number;
}

export interface CupSave {
  bestPoints: number;
  finishes: CupFinishRecord[];
}

export interface CupRunEntry {
  name: string;
  isPlayer: boolean;
  paint: number;
  points: number;
  wins: number;
}

export interface CupRun {
  cupId: string;
  nextRace: number;
  entries: CupRunEntry[];
  positions: number[];
}

export interface FriendGhostEntry {
  code: string;
  timeMs: number;
  dateMs: number;
}

export interface DailyResult {
  position: number;
  timeMs: number;
}

export interface DailySave {
  lastFinishDate: string | null;
  streak: number;
  /** Highest streak ever reached (v8 P5, drives SUNBURST + stats page). Additive. */
  bestStreak: number;
  results: Record<string, DailyResult>;
}

export interface WeeklyRun {
  weekKey: string;
  nextRace: number;
  entries: CupRunEntry[];
  positions: number[];
}

export interface WeeklyBestEntry {
  points: number;
  position: number;
}

export interface WeeklySave {
  run: WeeklyRun | null;
  best: Record<string, WeeklyBestEntry>;
  streak: number;
  /** Highest streak ever reached (v8 P5, stats page). Additive. */
  bestStreak: number;
  lastWeek: string | null;
}

const DEFAULT_WEEKLY: WeeklySave = { run: null, best: {}, streak: 0, bestStreak: 0, lastWeek: null };

function sanitizeWeeklyRun(v: unknown): WeeklyRun | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<WeeklyRun>;
  if (typeof r.weekKey !== 'string' || !/^\d{4}W\d{2}$/.test(r.weekKey)) return null;
  if (typeof r.nextRace !== 'number' || !Number.isFinite(r.nextRace) || r.nextRace < 0 || r.nextRace > 3) return null;
  if (!Array.isArray(r.entries) || !Array.isArray(r.positions)) return null;
  return { weekKey: r.weekKey, nextRace: Math.round(r.nextRace), entries: r.entries, positions: r.positions };
}

function sanitizeWeekly(v: unknown): WeeklySave {
  if (!v || typeof v !== 'object') return { run: null, best: {}, streak: 0, bestStreak: 0, lastWeek: null };
  const r = v as Partial<WeeklySave>;
  const best: Record<string, WeeklyBestEntry> = {};
  const src = (r.best && typeof r.best === 'object' ? r.best : {}) as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!/^\d{4}W\d{2}$/.test(key)) continue;
    const e = src[key] as Partial<WeeklyBestEntry> | null;
    if (!e || typeof e !== 'object') continue;
    const pts = e.points;
    const pos = e.position;
    if (typeof pts !== 'number' || !Number.isFinite(pts) || pts < 0 || pts > 999) continue;
    if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 1 || pos > 99) continue;
    best[key] = { points: Math.round(pts), position: Math.round(pos) };
  }
  const streak =
    typeof r.streak === 'number' && Number.isFinite(r.streak) && r.streak >= 0 ? Math.min(9999, Math.round(r.streak)) : 0;
  const bestStreakRaw = typeof r.bestStreak === 'number' && Number.isFinite(r.bestStreak) && r.bestStreak >= 0 ? Math.min(9999, Math.round(r.bestStreak)) : 0;
  const bestStreak = Math.max(streak, bestStreakRaw);
  const lastWeek = typeof r.lastWeek === 'string' && /^\d{4}W\d{2}$/.test(r.lastWeek) ? r.lastWeek : null;
  return { run: sanitizeWeeklyRun(r.run), best, streak, bestStreak, lastWeek };
}

export interface PlayerProfile {
  paint: number;
  body: 'standard' | 'aero' | 'tank';
}

export interface LifetimeStats {
  laps: number;
  totalDrift: number;
  totalAir: number;
  wallHits: number;
  cleanLaps: number;
  rivalWins: number;
  friendGhostRaces: number;
  rivalsBeaten: string[];
  /** Traffic-mode near misses over the career (v8 P5). Additive. */
  nearMisses: number;
  /** Lifetime distance driven on stat-counted laps, km (v8 P5). Additive. */
  distanceKm: number;
  /** Knockout races won (v8 P5). Additive. */
  knockoutWins: number;
  /** Head-to-head wins per rival name: player finished above that rival (v8 P5). Additive. */
  rivalWinsBy: Record<string, number>;
  /** Friend-ghost races won by >2s (v8 P9 GHOSTBUSTER). Additive. */
  friendGhostBusts: number;
  /** Traffic runs finished with >= 5 near misses (v8 P9 THREAD THE NEEDLE). Additive. */
  trafficNeedles: number;
}

const DEFAULT_STATS: LifetimeStats = {
  laps: 0,
  totalDrift: 0,
  totalAir: 0,
  wallHits: 0,
  cleanLaps: 0,
  rivalWins: 0,
  friendGhostRaces: 0,
  rivalsBeaten: [],
  nearMisses: 0,
  distanceKm: 0,
  knockoutWins: 0,
  rivalWinsBy: {},
  friendGhostBusts: 0,
  trafficNeedles: 0,
};

function sanitizeWinBy(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  const r = v as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    const n = r[key];
    if (key.length > 0 && key.length <= 24 && typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      out[key] = Math.round(n);
    }
  }
  return Object.keys(out).length > 32 ? Object.fromEntries(Object.entries(out).slice(0, 32)) : out;
}

function sanitizeStats(v: Stored<Partial<LifetimeStats>>): LifetimeStats {
  const beaten = Array.isArray(v.rivalsBeaten)
    ? Array.from(new Set(v.rivalsBeaten.filter((n): n is string => typeof n === 'string' && n.length > 0 && n.length <= 24))).slice(0, 32)
    : [];
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  return {
    laps: num(v.laps),
    totalDrift: num(v.totalDrift),
    totalAir: num(v.totalAir),
    wallHits: num(v.wallHits),
    cleanLaps: num(v.cleanLaps),
    rivalWins: num(v.rivalWins),
    friendGhostRaces: num(v.friendGhostRaces),
    rivalsBeaten: beaten,
    nearMisses: num(v.nearMisses),
    distanceKm: num(v.distanceKm),
    knockoutWins: num(v.knockoutWins),
    rivalWinsBy: sanitizeWinBy(v.rivalWinsBy),
    friendGhostBusts: num(v.friendGhostBusts),
    trafficNeedles: num(v.trafficNeedles),
  };
}

const DEFAULT_PROFILE: PlayerProfile = { paint: 0x29e6ff, body: 'standard' };

const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  cam: 'chase',
  fov: 72,
  ghosts: 3,
  music: true,
  sfx: true,
  steeringSensitivity: 1.0,
  touchSteer: 'buttons',
  showGhost: true,
  reducedMotion: false,
  shakeIntensity: 1,
  leftyTouch: false,
  onboarded: false,
  hintRival: false,
  hintKnockout: false,
  hintTraffic: false,
};

function emptyTrackSave(): TrackSave {
  return { bestTimeMs: null, history: [], ghost: null };
}

/** Earned unlocks ledger (v8 P5). Additive key. */
export interface UnlockSave {
  /** Earned paint lock ids (see PAINT_LOCK_IDS in render/car-model). */
  paints: PaintLockId[];
}

const DEFAULT_UNLOCKS: UnlockSave = { paints: [] };

function sanitizeUnlocks(v: unknown): UnlockSave {
  if (!v || typeof v !== 'object') return { paints: [] };
  const raw = (v as Partial<UnlockSave>).paints;
  const paints = Array.isArray(raw)
    ? Array.from(new Set(raw.filter((id): id is PaintLockId => typeof id === 'string' && (PAINT_LOCK_IDS as string[]).includes(id))))
    : [];
  return { paints };
}

export interface AllSaves {
  tracks: Record<string, TrackSave>;
  cups: Record<string, CupSave>;
  careerRun: CupRun | null;
  friendGhosts: Record<string, FriendGhostEntry>;
  daily: DailySave;
  /** Traffic Rush per-track best finishing score (bonus-adjusted ms). Additive key. */
  trafficBest: Record<string, number>;
  /** Weekly Event: mid-week run resume + best ledger + streak. Additive key. */
  weekly: WeeklySave;
  /** Earned paints + future unlock ledgers. Additive key. */
  unlocks: UnlockSave;
}

function emptyCupSave(): CupSave {
  return { bestPoints: 0, finishes: [] };
}

function sanitizeCupRun(v: unknown): CupRun | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<CupRun>;
  if (typeof r.cupId !== 'string' || typeof r.nextRace !== 'number' || !Array.isArray(r.entries) || !Array.isArray(r.positions)) return null;
  return { cupId: r.cupId, nextRace: r.nextRace, entries: r.entries, positions: r.positions };
}

function sanitizeFriendGhosts(v: unknown): Record<string, FriendGhostEntry> {
  const out: Record<string, FriendGhostEntry> = {};
  if (!v || typeof v !== 'object') return out;
  const r = v as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    const e = r[key] as Partial<FriendGhostEntry> | null;
    if (!e || typeof e !== 'object') continue;
    if (typeof e.code !== 'string' || !e.code || e.code.length > 20000) continue;
    if (typeof e.timeMs !== 'number' || !Number.isFinite(e.timeMs) || e.timeMs <= 0) continue;
    if (typeof e.dateMs !== 'number' || !Number.isFinite(e.dateMs)) continue;
    out[key] = { code: e.code, timeMs: e.timeMs, dateMs: e.dateMs };
  }
  return out;
}

function sanitizeTrafficBest(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  const r = v as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    const n = r[key];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

const DEFAULT_DAILY: DailySave = { lastFinishDate: null, streak: 0, bestStreak: 0, results: {} };

function sanitizeDaily(v: unknown): DailySave {
  if (!v || typeof v !== 'object') return { lastFinishDate: null, streak: 0, bestStreak: 0, results: {} };
  const r = v as Partial<DailySave>;
  const results: Record<string, DailyResult> = {};
  const src = (r.results && typeof r.results === 'object' ? r.results : {}) as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!/^\d{8}$/.test(key)) continue;
    const e = src[key] as Partial<DailyResult> | null;
    if (!e || typeof e !== 'object') continue;
    const pos = e.position;
    const t = e.timeMs;
    if (typeof pos !== 'number' || !Number.isFinite(pos) || pos < 1 || pos > 99) continue;
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t > 3600000) continue;
    results[key] = { position: Math.round(pos), timeMs: Math.round(t) };
  }
  const streak =
    typeof r.streak === 'number' && Number.isFinite(r.streak) && r.streak >= 0
      ? Math.min(9999, Math.round(r.streak))
      : 0;
  const bestStreak = Math.max(
    streak,
    typeof r.bestStreak === 'number' && Number.isFinite(r.bestStreak) && r.bestStreak >= 0
      ? Math.min(9999, Math.round(r.bestStreak))
      : 0,
  );
  const lastFinishDate = typeof r.lastFinishDate === 'string' && /^\d{8}$/.test(r.lastFinishDate) ? r.lastFinishDate : null;
  return { lastFinishDate, streak, bestStreak, results };
}

export class SaveManager {
  private saves: AllSaves;
  private _settings: Settings;
  private _profile: PlayerProfile;
  private _stats: LifetimeStats;
  private storedSchemaVersion = 0;

  constructor() {
    const hadPriorProfile =
      !!localStorage.getItem(SAVE_KEY) ||
      !!localStorage.getItem(SETTINGS_KEY) ||
      !!localStorage.getItem(PLAYER_KEY) ||
      !!localStorage.getItem(STATS_KEY);
    this.saves = this.loadSaves();
    this._settings = this.loadSettings();
    if (hadPriorProfile) {
      let storedHasOnboarded = false;
      let storedHasTutorialKey = false;
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as object;
          storedHasOnboarded = 'onboarded' in parsed;
          // The tutorial shipped in v8 — a stored settings object without the key is a
          // pre-v8 veteran, and veterans are never forced into the tutorial.
          storedHasTutorialKey = 'tutorialDone' in parsed;
        }
      } catch {
        /* corrupted settings — treat returning player as onboarded */
      }
      if (!storedHasOnboarded) this._settings.onboarded = true;
      if (!storedHasTutorialKey) this._settings.tutorialDone = true;
    }
    this._profile = this.loadProfile();
    this._stats = this.loadStats();
  }

  private noteSchemaVersion(v: unknown): void {
    if (typeof v === 'number' && Number.isFinite(v) && v > this.storedSchemaVersion) this.storedSchemaVersion = v;
  }

  private loadStats(): LifetimeStats {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<Partial<LifetimeStats>>;
        this.noteSchemaVersion(parsed.schemaVersion);
        return sanitizeStats({ ...DEFAULT_STATS, ...parsed });
      }
    } catch {
      /* blocked */
    }
    return { ...DEFAULT_STATS, rivalsBeaten: [] };
  }

  private loadProfile(): PlayerProfile {
    try {
      const raw = localStorage.getItem(PLAYER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<Partial<PlayerProfile>>;
        this.noteSchemaVersion(parsed.schemaVersion);
        const profile: PlayerProfile = { ...DEFAULT_PROFILE, ...parsed };
        if (profile.body !== 'standard' && profile.body !== 'aero' && profile.body !== 'tank') profile.body = 'standard';
        return profile;
      }
    } catch {
      /* corrupted — defaults */
    }
    return { ...DEFAULT_PROFILE };
  }

  get stats(): LifetimeStats {
    return this._stats;
  }

  addStats(delta: Partial<LifetimeStats>): void {
    const beaten = new Set(this._stats.rivalsBeaten);
    for (const n of delta.rivalsBeaten ?? []) beaten.add(n);
    const winsBy = { ...this._stats.rivalWinsBy };
    for (const [name, wins] of Object.entries(delta.rivalWinsBy ?? {})) {
      winsBy[name] = (winsBy[name] ?? 0) + wins;
    }
    this._stats = {
      laps: this._stats.laps + (delta.laps ?? 0),
      totalDrift: this._stats.totalDrift + (delta.totalDrift ?? 0),
      totalAir: this._stats.totalAir + (delta.totalAir ?? 0),
      wallHits: this._stats.wallHits + (delta.wallHits ?? 0),
      cleanLaps: this._stats.cleanLaps + (delta.cleanLaps ?? 0),
      rivalWins: this._stats.rivalWins + (delta.rivalWins ?? 0),
      friendGhostRaces: this._stats.friendGhostRaces + (delta.friendGhostRaces ?? 0),
      rivalsBeaten: Array.from(beaten).slice(0, 32),
      nearMisses: this._stats.nearMisses + (delta.nearMisses ?? 0),
      distanceKm: this._stats.distanceKm + (delta.distanceKm ?? 0),
      knockoutWins: this._stats.knockoutWins + (delta.knockoutWins ?? 0),
      rivalWinsBy: winsBy,
      friendGhostBusts: this._stats.friendGhostBusts + (delta.friendGhostBusts ?? 0),
      trafficNeedles: this._stats.trafficNeedles + (delta.trafficNeedles ?? 0),
    };
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify({ ...this._stats, schemaVersion: SCHEMA_VERSION }));
    } catch {
      /* blocked */
    }
  }

  get schemaVersion(): number {
    return this.storedSchemaVersion || SCHEMA_VERSION;
  }

  get profile(): PlayerProfile {
    return this._profile;
  }

  updateProfile(patch: Partial<PlayerProfile>): void {
    this._profile = { ...this._profile, ...patch };
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify({ ...this._profile, schemaVersion: SCHEMA_VERSION }));
    } catch {
      /* storage blocked */
    }
  }

  private loadSaves(): AllSaves {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<Partial<AllSaves>>;
        if (parsed && typeof parsed.tracks === 'object') {
          this.noteSchemaVersion(parsed.schemaVersion);
          return {
            tracks: parsed.tracks,
            cups: parsed.cups ?? {},
            careerRun: sanitizeCupRun(parsed.careerRun),
            friendGhosts: sanitizeFriendGhosts(parsed.friendGhosts),
            daily: sanitizeDaily(parsed.daily),
            trafficBest: sanitizeTrafficBest(parsed.trafficBest),
            weekly: sanitizeWeekly(parsed.weekly),
            unlocks: sanitizeUnlocks(parsed.unlocks),
          };
        }
      }
    } catch {
      /* corrupted — start fresh */
    }
    return { tracks: {}, cups: {}, careerRun: null, friendGhosts: {}, daily: { ...DEFAULT_DAILY, results: {} }, trafficBest: {}, weekly: { ...DEFAULT_WEEKLY, best: {} }, unlocks: { ...DEFAULT_UNLOCKS, paints: [] } };
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<Partial<Settings>> & { camera?: unknown };
        this.noteSchemaVersion(parsed.schemaVersion);
        const merged: Settings = { ...DEFAULT_SETTINGS, ...parsed };
        // v2.2 stored a 'camera' select ('chase'|'hood') — migrate it into `cam` once.
        if (parsed.cam === undefined && parsed.camera !== undefined) {
          merged.cam = parsed.camera === 'hood' ? 'hood' : 'chase';
        }
        if (merged.cam !== 'chase' && merged.cam !== 'close' && merged.cam !== 'hood') merged.cam = 'chase';
        merged.fov =
          typeof merged.fov === 'number' && Number.isFinite(merged.fov)
            ? Math.min(100, Math.max(60, Math.round(merged.fov)))
            : DEFAULT_SETTINGS.fov;
        merged.ghosts =
          typeof merged.ghosts === 'number' && Number.isInteger(merged.ghosts) && merged.ghosts >= 1 && merged.ghosts <= 3
            ? merged.ghosts
            : DEFAULT_SETTINGS.ghosts;
        delete (merged as { camera?: unknown }).camera;
        return merged;
      }
    } catch {
      /* corrupted — defaults */
    }
    return { ...DEFAULT_SETTINGS };
  }

  persistSaves(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.saves, schemaVersion: SCHEMA_VERSION }));
    } catch {
      /* storage full or blocked */
    }
  }

  persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...this._settings, schemaVersion: SCHEMA_VERSION }));
    } catch {
      /* storage blocked */
    }
  }

  trackSave(trackId: string): TrackSave {
    let t = this.saves.tracks[trackId];
    if (!t) {
      t = emptyTrackSave();
      this.saves.tracks[trackId] = t;
    }
    return t;
  }

  submitTime(trackId: string, timeMs: number, ghostData: string | null): boolean {
    const t = this.trackSave(trackId);
    t.history.push(timeMs);
    t.history.sort((a, b) => a - b);
    t.history = t.history.slice(0, 8);
    const isBest = t.bestTimeMs === null || timeMs < t.bestTimeMs;
    if (isBest) {
      t.bestTimeMs = timeMs;
      if (ghostData) t.ghost = ghostData;
    }
    this.persistSaves();
    return isBest;
  }

  clearTrack(trackId: string): void {
    this.saves.tracks[trackId] = emptyTrackSave();
    this.persistSaves();
  }

  cupSave(id: string): CupSave {
    let c = this.saves.cups[id];
    if (!c) {
      c = emptyCupSave();
      this.saves.cups[id] = c;
    }
    return c;
  }

  recordCupFinish(id: string, result: CupFinishRecord): void {
    const c = this.cupSave(id);
    c.finishes.push(result);
    if (c.finishes.length > 10) c.finishes = c.finishes.slice(-10);
    if (result.points > c.bestPoints) c.bestPoints = result.points;
    this.persistSaves();
  }

  getCupRun(): CupRun | null {
    return this.saves.careerRun;
  }

  setCupRun(run: CupRun | null): void {
    this.saves.careerRun = run;
    this.persistSaves();
  }

  friendGhost(trackId: string): FriendGhostEntry | null {
    return this.saves.friendGhosts[trackId] ?? null;
  }

  setFriendGhost(trackId: string, entry: FriendGhostEntry): void {
    this.saves.friendGhosts[trackId] = entry;
    this.persistSaves();
  }

  get daily(): DailySave {
    return this.saves.daily;
  }

  /**
   * Record a daily-challenge finish. Best result per date is kept (lowest position,
   * then lowest time); same-day retries never move the streak. Streak: +1 when the
   * previous finished day was exactly yesterday (UTC), reset to 1 after any gap.
   */
  recordDailyFinish(dateKey: string, position: number, timeMs: number): { streak: number; improved: boolean } {
    const d = this.saves.daily;
    const prev = d.results[dateKey];
    const improved = !prev || position < prev.position || (position === prev.position && timeMs < prev.timeMs);
    if (improved) d.results[dateKey] = { position, timeMs };
    if (d.lastFinishDate !== dateKey) {
      d.streak = d.lastFinishDate !== null && d.lastFinishDate === prevDateKey(dateKey) ? d.streak + 1 : 1;
      d.lastFinishDate = dateKey;
      if (d.streak > d.bestStreak) d.bestStreak = d.streak;
    }
    this.persistSaves();
    return { streak: d.streak, improved };
  }

  /** Traffic Rush per-track best (bonus-adjusted score). Best result per track is kept. */
  recordTrafficBest(trackId: string, scoreMs: number): boolean {
    const cur = this.saves.trafficBest[trackId];
    const improved = cur === undefined || scoreMs < cur;
    if (improved) {
      this.saves.trafficBest[trackId] = scoreMs;
      this.persistSaves();
    }
    return improved;
  }

  get weekly(): WeeklySave {
    return this.saves.weekly;
  }

  getWeeklyRun(): WeeklyRun | null {
    return this.saves.weekly.run;
  }

  setWeeklyRun(run: WeeklyRun | null): void {
    this.saves.weekly.run = run;
    this.persistSaves();
  }

  /**
   * Record a completed weekly event (all 3 races finished). Best ledger per week keeps
   * the most points (then the best position). Streak: +1 when the finished week is the
   * previous ISO week, reset to 1 after a gap; same-week retries keep the streak.
   */
  recordWeeklyFinish(weekKey: string, points: number, position: number): { streak: number; improved: boolean } {
    const w = this.saves.weekly;
    const prev = w.best[weekKey];
    const improved = !prev || points > prev.points || (points === prev.points && position < prev.position);
    if (improved) w.best[weekKey] = { points, position };
    if (w.lastWeek !== weekKey) {
      w.streak = w.lastWeek !== null && w.lastWeek === prevWeekKey(weekKey) ? w.streak + 1 : 1;
      w.lastWeek = weekKey;
      if (w.streak > w.bestStreak) w.bestStreak = w.streak;
    }
    this.persistSaves();
    return { streak: w.streak, improved };
  }

  get unlocks(): UnlockSave {
    return this.saves.unlocks;
  }

  isPaintUnlocked(lock: PaintLockId): boolean {
    return this.saves.unlocks.paints.includes(lock);
  }

  /** Records an earned paint. Returns false when it was already unlocked (idempotent). */
  unlockPaint(lock: PaintLockId): boolean {
    if (this.isPaintUnlocked(lock)) return false;
    this.saves.unlocks.paints.push(lock);
    this.persistSaves();
    return true;
  }

  get settings(): Settings {
    return this._settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this._settings = { ...this._settings, ...patch };
    this.persistSettings();
  }

  get allSaves(): AllSaves {
    return this.saves;
  }
}
