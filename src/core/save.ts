export type QualityTier = 'low' | 'medium' | 'high';
export type TouchSteerMode = 'buttons' | 'tilt';

export interface TrackSave {
  bestTimeMs: number | null;
  history: number[];
  ghost: string | null;
  driftBest?: number;
}

export interface Settings {
  quality: 'auto' | QualityTier;
  camera: 'chase' | 'hood';
  music: boolean;
  sfx: boolean;
  steeringSensitivity: number;
  touchSteer: TouchSteerMode;
  showGhost: boolean;
  reducedMotion: boolean;
  shakeIntensity: number;
  leftyTouch: boolean;
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
}

const DEFAULT_STATS: LifetimeStats = { laps: 0, totalDrift: 0, totalAir: 0, wallHits: 0, cleanLaps: 0 };

const DEFAULT_PROFILE: PlayerProfile = { paint: 0x29e6ff, body: 'standard' };

const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  camera: 'chase',
  music: true,
  sfx: true,
  steeringSensitivity: 1.0,
  touchSteer: 'buttons',
  showGhost: true,
  reducedMotion: false,
  shakeIntensity: 1,
  leftyTouch: false,
};

function emptyTrackSave(): TrackSave {
  return { bestTimeMs: null, history: [], ghost: null };
}

export interface AllSaves {
  tracks: Record<string, TrackSave>;
  cups: Record<string, CupSave>;
  careerRun: CupRun | null;
  friendGhosts: Record<string, FriendGhostEntry>;
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

export class SaveManager {
  private saves: AllSaves;
  private _settings: Settings;
  private _profile: PlayerProfile;
  private _stats: LifetimeStats;
  private storedSchemaVersion = 0;

  constructor() {
    this.saves = this.loadSaves();
    this._settings = this.loadSettings();
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
        return { ...DEFAULT_STATS, ...parsed };
      }
    } catch {
      /* blocked */
    }
    return { ...DEFAULT_STATS };
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
    this._stats = {
      laps: this._stats.laps + (delta.laps ?? 0),
      totalDrift: this._stats.totalDrift + (delta.totalDrift ?? 0),
      totalAir: this._stats.totalAir + (delta.totalAir ?? 0),
      wallHits: this._stats.wallHits + (delta.wallHits ?? 0),
      cleanLaps: this._stats.cleanLaps + (delta.cleanLaps ?? 0),
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
          };
        }
      }
    } catch {
      /* corrupted — start fresh */
    }
    return { tracks: {}, cups: {}, careerRun: null, friendGhosts: {} };
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<Partial<Settings>>;
        this.noteSchemaVersion(parsed.schemaVersion);
        return { ...DEFAULT_SETTINGS, ...parsed };
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
