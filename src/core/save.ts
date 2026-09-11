export type QualityTier = 'low' | 'medium' | 'high';
export type TouchSteerMode = 'buttons' | 'tilt';

export interface TrackSave {
  bestTimeMs: number | null;
  history: number[];
  ghost: string | null;
}

export interface Settings {
  quality: 'auto' | QualityTier;
  camera: 'chase' | 'hood';
  music: boolean;
  sfx: boolean;
  steeringSensitivity: number;
  touchSteer: TouchSteerMode;
  showGhost: boolean;
}

const SAVE_KEY = 'race2.save.v1';
const SETTINGS_KEY = 'race2.settings.v1';
const PLAYER_KEY = 'race2.player.v1';

export interface PlayerProfile {
  paint: number;
  body: 'standard' | 'aero' | 'tank';
}

const DEFAULT_PROFILE: PlayerProfile = { paint: 0x29e6ff, body: 'standard' };

const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  camera: 'chase',
  music: true,
  sfx: true,
  steeringSensitivity: 1.0,
  touchSteer: 'buttons',
  showGhost: true,
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

  constructor() {
    this.saves = this.loadSaves();
    this._settings = this.loadSettings();
    this._profile = this.loadProfile();
  }

  private loadProfile(): PlayerProfile {
    try {
      const raw = localStorage.getItem(PLAYER_KEY);
      if (raw) return { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<PlayerProfile>) };
    } catch {
      /* corrupted — defaults */
    }
    return { ...DEFAULT_PROFILE };
  }

  get profile(): PlayerProfile {
    return this._profile;
  }

  updateProfile(patch: Partial<PlayerProfile>): void {
    this._profile = { ...this._profile, ...patch };
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(this._profile));
    } catch {
      /* storage blocked */
    }
  }

  private loadSaves(): AllSaves {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AllSaves;
        if (parsed && typeof parsed.tracks === 'object') return parsed;
      }
    } catch {
      /* corrupted — start fresh */
    }
    return { tracks: {} };
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* corrupted — defaults */
    }
    return { ...DEFAULT_SETTINGS };
  }

  persistSaves(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.saves));
    } catch {
      /* storage full or blocked */
    }
  }

  persistSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
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
