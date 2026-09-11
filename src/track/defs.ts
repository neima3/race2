import type { ControlPoint } from './curve';

export type ThemeId = 'alpine' | 'canyon' | 'neon' | 'mesa';

export interface ThemeDef {
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  sunColor: number;
  sunDir: [number, number, number];
  fogColor: number;
  fogNear: number;
  fogFar: number;
  groundColor: number;
  mesaColor: number;
  mesaFarColor: number;
  rockColor: number;
  cloudColor: number;
  cloudOpacity: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  ambientSound: 'birds' | 'wind' | 'synth' | 'waves';
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  alpine: {
    skyTop: 0x2c4a7c, skyMid: 0x7fa8d8, skyHorizon: 0xffd9c4, sunColor: 0xfff2d8,
    sunDir: [0.4, 0.35, -0.84], fogColor: 0xc4d4e8, fogNear: 320, fogFar: 2600,
    groundColor: 0x5d7a52, mesaColor: 0x8a97a8, mesaFarColor: 0x64748e, rockColor: 0x9aa5b0,
    cloudColor: 0xffffff, cloudOpacity: 0.75, sunIntensity: 2.4, hemiSky: 0xbdd4f0, hemiGround: 0x5a6a4a,
    ambientSound: 'birds',
  },
  canyon: {
    skyTop: 0x1a2440, skyMid: 0x7a4a8c, skyHorizon: 0xff9a4d, sunColor: 0xffe9b0,
    sunDir: [-0.55, 0.28, -0.79], fogColor: 0xd88a5c, fogNear: 260, fogFar: 2400,
    groundColor: 0x7a4f34, mesaColor: 0x9c5a38, mesaFarColor: 0x6e4468, rockColor: 0x8a5638,
    cloudColor: 0xffc9a0, cloudOpacity: 0.55, sunIntensity: 2.6, hemiSky: 0x8fb4ff, hemiGround: 0x8a5a3a,
    ambientSound: 'wind',
  },
  neon: {
    skyTop: 0x05060f, skyMid: 0x14082b, skyHorizon: 0x3b1a6e, sunColor: 0x8be9ff,
    sunDir: [0.2, 0.12, -0.97], fogColor: 0x1a1038, fogNear: 220, fogFar: 2100,
    groundColor: 0x141824, mesaColor: 0x1e2438, mesaFarColor: 0x252b4a, rockColor: 0x232a3e,
    cloudColor: 0x40286a, cloudOpacity: 0.4, sunIntensity: 1.2, hemiSky: 0x4a5af0, hemiGround: 0x141824,
    ambientSound: 'synth',
  },
  mesa: {
    skyTop: 0x2a1a3e, skyMid: 0xc4552e, skyHorizon: 0xffb347, sunColor: 0xffd080,
    sunDir: [0.75, 0.2, 0.63], fogColor: 0xe0985c, fogNear: 280, fogFar: 2500,
    groundColor: 0x8a5232, mesaColor: 0xa85c30, mesaFarColor: 0x7a4050, rockColor: 0x96582f,
    cloudColor: 0xffd9a8, cloudOpacity: 0.6, sunIntensity: 2.8, hemiSky: 0xffc490, hemiGround: 0x6a4028,
    ambientSound: 'waves',
  },
};

export interface BoostDef {
  dist: number;
  lateral: number;
  strength: number;
}

export interface CheckpointDef {
  dist: number;
}

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  accent: number;
  accentName: string;
  theme: ThemeId;
  points: ControlPoint[];
  checkpoints: CheckpointDef[];
  boosts: BoostDef[];
  medals: { author: number; gold: number; silver: number; bronze: number };
}

function cp(x: number, y: number, z: number, width?: number, bank?: number): ControlPoint {
  const p: ControlPoint = { pos: [x, y, z] };
  if (width !== undefined) p.width = width;
  if (bank !== undefined) p.bank = bank;
  return p;
}

const TRACK_1: TrackDef = {
  id: 'sunrise-sprint',
  name: 'Sunrise Sprint',
  subtitle: 'Warm-up · rolling hills',
  accent: 0xffb52e,
  accentName: '#ffb52e',
  theme: 'alpine',
  points: [
    cp(0, 0, 0, 8),
    cp(0, 0, -60, 8),
    cp(-8, 3, -125, 8),
    cp(-45, 7, -170, 7.5),
    cp(-110, 9, -182, 7.5),
    cp(-160, 6, -150, 7.5, 12),
    cp(-176, 2, -85, 8, 10),
    cp(-155, 0, -15, 8, 8),
    cp(-100, 1, 22, 8, 6),
    cp(-40, 0, 26, 8, 6),
  ],
  checkpoints: [{ dist: 210 }, { dist: 420 }],
  boosts: [],
  medals: { author: 18000, gold: 20500, silver: 24000, bronze: 31000 },
};

const TRACK_2: TrackDef = {
  id: 'canyon-twist',
  name: 'Canyon Twist',
  subtitle: 'Banked esses · canyon jump',
  accent: 0xff5c39,
  accentName: '#ff5c39',
  theme: 'canyon',
  points: [
    cp(0, 0, 0, 8),
    cp(0, 0, -55, 8),
    cp(-6, 0, -105, 8, 22),
    cp(-40, 1, -145, 8, 26),
    cp(-95, 2, -150, 8, -24),
    cp(-140, 4, -115, 7.5, -28),
    cp(-158, 8, -60, 7.5, 18),
    cp(-150, 14, -5, 7.5, 14),
    cp(-118, 20, 38, 8, 8),
    cp(-62, 24, 48, 8, 0),
    cp(-20, 22, 30, 8, 0),
    cp(-14, 16, -18, 8, -10),
    cp(-48, 8, -55, 8, -8),
    cp(-105, 3, -62, 8, 6),
    cp(-140, 1, -100, 8, 12),
    cp(-120, 0, -150, 8, 16),
    cp(-70, 0, -172, 8, 14),
    cp(-25, 0, -160, 8, 10),
    cp(-2, 0, -110, 8, 4),
  ],
  checkpoints: [{ dist: 300 }, { dist: 620 }, { dist: 900 }],
  boosts: [
    { dist: 40, lateral: 0, strength: 9 },
    { dist: 880, lateral: 0, strength: 12 },
  ],
  medals: { author: 32000, gold: 36000, silver: 42000, bronze: 54000 },
};

const TRACK_3: TrackDef = {
  id: 'sky-loop',
  name: 'Sky Loop',
  subtitle: 'Vertical loop · corkscrew',
  accent: 0x29e6ff,
  accentName: '#29e6ff',
  theme: 'neon',
  points: [
    cp(0, 0, 60, 9),
    cp(0, 0, 10, 9),
    cp(0, 0.6, -1, 8),
    cp(0, 4, -6.5, 7),
    cp(0, 9.8, -8.5, 6.2),
    cp(0, 14.2, -14, 5.8),
    cp(0, 9.8, -19.5, 6.2),
    cp(0, 4, -21.5, 7),
    cp(0, 0.6, -27, 8),
    cp(0, 2, -55, 8),
    cp(-5, 6, -95, 7.5, 18),
    cp(-40, 10, -125, 7.5, 24),
    cp(-95, 12, -135, 7.5, 20),
    cp(-140, 10, -108, 7, 45),
    cp(-155, 7, -60, 6.5, 70),
    cp(-140, 4, -18, 6.5, 70),
    cp(-100, 2, 12, 7, 45),
    cp(-65, 1, 18, 8, 22),
    cp(-35, 0.5, 28, 8, 10),
    cp(-8, 0.5, 52, 8, 0),
    cp(8, 0.5, 85, 8, 0),
    cp(12, 0.5, 120, 8, 0),
    cp(8, 0.5, 150, 8, 0),
    cp(-8, 0.5, 165, 8, 0),
    cp(-25, 0.5, 155, 8, 0),
    cp(-32, 0.5, 130, 8, 0),
    cp(-28, 0.5, 105, 8, 0),
    cp(-14, 0, 92, 9, 0),
  ],
  checkpoints: [{ dist: 250 }, { dist: 520 }, { dist: 800 }],
  boosts: [
    { dist: 5, lateral: 0, strength: 13 },
    { dist: 380, lateral: 0, strength: 10 },
    { dist: 640, lateral: 0, strength: 11 },
  ],
  medals: { author: 22500, gold: 25000, silver: 29000, bronze: 38000 },
};

const TRACK_4: TrackDef = {
  id: 'grand-gauntlet',
  name: 'Grand Gauntlet',
  subtitle: 'Everything · the final test',
  accent: 0xb44dff,
  accentName: '#b44dff',
  theme: 'mesa',
  points: [
    cp(0, 0, 0, 8),
    cp(0, 0, -60, 8),
    cp(-4, 2, -115, 8, 14),
    cp(-38, 6, -152, 7.5, 22),
    cp(-92, 9, -160, 7.5, 18),
    cp(-138, 13, -132, 7, -20),
    cp(-158, 17, -80, 7, -24),
    cp(-150, 21, -28, 7, 18),
    cp(-118, 26, 12, 7, 12),
    cp(-70, 28, 20, 7.5, 4),
    cp(-30, 26, 4, 7.5, -8),
    cp(-24, 20, -40, 7.5, -14),
    cp(-52, 12, -80, 8, -10),
    cp(-105, 5, -88, 8, 6),
    cp(-140, 2, -122, 8, 14),
    cp(-126, 0, -168, 8, 18),
    cp(-78, 0, -184, 8, 16),
    cp(-32, 0, -172, 8, 12),
    cp(-8, 0, -128, 8, 6),
  ],
  checkpoints: [{ dist: 340 }, { dist: 700 }, { dist: 1050 }],
  boosts: [
    { dist: 30, lateral: 0, strength: 10 },
    { dist: 705, lateral: 0, strength: 12 },
    { dist: 1020, lateral: 0, strength: 10 },
  ],
  medals: { author: 29500, gold: 33000, silver: 38000, bronze: 48000 },
};

export const TRACKS: TrackDef[] = [TRACK_1, TRACK_2, TRACK_3, TRACK_4];
