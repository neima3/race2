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

export const SCHEMA_VERSION = 1;

type Stored<T> = T & { schemaVersion?: number };

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
        return { ...DEFAULT_PROFILE, ...parsed };
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
        const parsed = JSON.parse(raw) as Stored<AllSaves>;
        if (parsed && typeof parsed.tracks === 'object') {
          this.noteSchemaVersion(parsed.schemaVersion);
          return parsed;
        }
      }
    } catch {
      /* corrupted — start fresh */
    }
    return { tracks: {} };
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
