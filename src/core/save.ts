import { prevDateKey } from '../game/daily';

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
  shakeIntensity: number;
  leftyTouch: boolean;
  onboarded?: boolean;
  hintRival?: boolean;
  hintKnockout?: boolean;
  hintTraffic?: boolean;
  hintCam?: boolean;
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
  results: Record<string, DailyResult>;
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
}

const DEFAULT_STATS: LifetimeStats = { laps: 0, totalDrift: 0, totalAir: 0, wallHits: 0, cleanLaps: 0, rivalWins: 0, friendGhostRaces: 0, rivalsBeaten: [] };

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

export interface AllSaves {
  tracks: Record<string, TrackSave>;
  cups: Record<string, CupSave>;
  careerRun: CupRun | null;
  friendGhosts: Record<string, FriendGhostEntry>;
  daily: DailySave;
  /** Traffic Rush per-track best finishing score (bonus-adjusted ms). Additive key. */
  trafficBest: Record<string, number>;
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

const DEFAULT_DAILY: DailySave = { lastFinishDate: null, streak: 0, results: {} };

function sanitizeDaily(v: unknown): DailySave {
  if (!v || typeof v !== 'object') return { lastFinishDate: null, streak: 0, results: {} };
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
  const lastFinishDate = typeof r.lastFinishDate === 'string' && /^\d{8}$/.test(r.lastFinishDate) ? r.lastFinishDate : null;
  return { lastFinishDate, streak, results };
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
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        storedHasOnboarded = !!raw && 'onboarded' in (JSON.parse(raw) as object);
      } catch {
        /* corrupted settings — treat returning player as onboarded */
      }
      if (!storedHasOnboarded) this._settings.onboarded = true;
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
    this._stats = {
      laps: this._stats.laps + (delta.laps ?? 0),
      totalDrift: this._stats.totalDrift + (delta.totalDrift ?? 0),
      totalAir: this._stats.totalAir + (delta.totalAir ?? 0),
      wallHits: this._stats.wallHits + (delta.wallHits ?? 0),
      cleanLaps: this._stats.cleanLaps + (delta.cleanLaps ?? 0),
      rivalWins: this._stats.rivalWins + (delta.rivalWins ?? 0),
      friendGhostRaces: this._stats.friendGhostRaces + (delta.friendGhostRaces ?? 0),
      rivalsBeaten: Array.from(beaten).slice(0, 32),
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
    };
        }
      }
    } catch {
      /* corrupted — start fresh */
    }
    return { tracks: {}, cups: {}, careerRun: null, friendGhosts: {}, daily: { ...DEFAULT_DAILY, results: {} }, trafficBest: {} };
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
