import type { ControlPoint } from './curve';

export type ThemeId = 'alpine' | 'canyon' | 'neon' | 'mesa';

export type TrackVariant = 'day' | 'dusk' | 'night' | 'rain';

export interface VariantDef {
  skyTint: number;
  skyTintAmt: number;
  sunTint: number;
  sunTintAmt: number;
  sunElev: number | null;
  sunIntensityMult: number;
  sunGlow: number;
  starBrightness: number;
  hemiMult: number;
  fogColorMult: number;
  fogNearMult: number;
  fogFarMult: number;
  ambientDim: number;
  cloudColorMult: number;
  cloudOpacityMult: number;
  reflectorMult: number;
  headlights: boolean;
  rain: boolean;
}

export const VARIANTS: Record<TrackVariant, VariantDef> = {
  day: {
    skyTint: 0x000000, skyTintAmt: 0, sunTint: 0xffffff, sunTintAmt: 0, sunElev: null,
    sunIntensityMult: 1, sunGlow: 1, starBrightness: 0, hemiMult: 1,
    fogColorMult: 1, fogNearMult: 1, fogFarMult: 1, ambientDim: 1,
    cloudColorMult: 1, cloudOpacityMult: 1, reflectorMult: 1,
    headlights: false, rain: false,
  },
  dusk: {
    skyTint: 0xff7a3a, skyTintAmt: 0.3, sunTint: 0xffa04a, sunTintAmt: 0.55, sunElev: 0.09,
    sunIntensityMult: 0.8, sunGlow: 1.2, starBrightness: 0, hemiMult: 0.72,
    fogColorMult: 0.9, fogNearMult: 0.9, fogFarMult: 0.85, ambientDim: 0.86,
    cloudColorMult: 0.82, cloudOpacityMult: 1.1, reflectorMult: 1.35,
    headlights: false, rain: false,
  },
  night: {
    skyTint: 0x060a1a, skyTintAmt: 0.78, sunTint: 0xbcd2ff, sunTintAmt: 0.85, sunElev: 0.42,
    sunIntensityMult: 0.22, sunGlow: 0.3, starBrightness: 2.31, hemiMult: 0.4,
    fogColorMult: 0.3, fogNearMult: 0.85, fogFarMult: 0.78, ambientDim: 0.64,
    cloudColorMult: 0.3, cloudOpacityMult: 0.8, reflectorMult: 2.4,
    headlights: true, rain: false,
  },
  rain: {
    skyTint: 0x5a6472, skyTintAmt: 0.5, sunTint: 0x8a94a2, sunTintAmt: 0.6, sunElev: null,
    sunIntensityMult: 0.42, sunGlow: 0.25, starBrightness: 0, hemiMult: 0.72,
    fogColorMult: 0.78, fogNearMult: 0.55, fogFarMult: 0.5, ambientDim: 0.8,
    cloudColorMult: 0.55, cloudOpacityMult: 1.6, reflectorMult: 1.6,
    headlights: false, rain: true,
  },
};

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
  hemiIntensity: number;
  ambientSound: 'birds' | 'wind' | 'synth' | 'waves';
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  alpine: {
    skyTop: 0x2c4a7c, skyMid: 0x7fa8d8, skyHorizon: 0xffd9c4, sunColor: 0xfff2d8,
    sunDir: [0.4, 0.35, -0.84], fogColor: 0xc4d4e8, fogNear: 290, fogFar: 2600,
    groundColor: 0x5d7a52, mesaColor: 0x8a97a8, mesaFarColor: 0x64748e, rockColor: 0x9aa5b0,
    cloudColor: 0xffffff, cloudOpacity: 0.75, sunIntensity: 2.35, hemiSky: 0xbdd4f0, hemiGround: 0x5a6a4a, hemiIntensity: 0.95,
    ambientSound: 'birds',
  },
  canyon: {
    skyTop: 0x1a2440, skyMid: 0x7a4a8c, skyHorizon: 0xff9a4d, sunColor: 0xffc06a,
    sunDir: [-0.55, 0.28, -0.79], fogColor: 0xd88a5c, fogNear: 260, fogFar: 2400,
    groundColor: 0x7a4f34, mesaColor: 0x9c5a38, mesaFarColor: 0x6e4468, rockColor: 0x8a5638,
    cloudColor: 0xffc9a0, cloudOpacity: 0.55, sunIntensity: 3.4, hemiSky: 0x7a68d8, hemiGround: 0x54301e, hemiIntensity: 0.6,
    ambientSound: 'wind',
  },
  neon: {
    skyTop: 0x05060f, skyMid: 0x14082b, skyHorizon: 0x3b1a6e, sunColor: 0x8be9ff,
    sunDir: [0.2, 0.2, -0.97], fogColor: 0x1a1038, fogNear: 220, fogFar: 2100,
    groundColor: 0x141824, mesaColor: 0x1e2438, mesaFarColor: 0x252b4a, rockColor: 0x232a3e,
    cloudColor: 0x40286a, cloudOpacity: 0.4, sunIntensity: 2.2, hemiSky: 0x5a6cf8, hemiGround: 0x2a3a5c, hemiIntensity: 2.6,
    ambientSound: 'synth',
  },
  mesa: {
    skyTop: 0x2a1a3e, skyMid: 0xc4552e, skyHorizon: 0xffb347, sunColor: 0xffd9a0,
    sunDir: [0.75, 0.2, 0.63], fogColor: 0xe0985c, fogNear: 280, fogFar: 2500,
    groundColor: 0x8a5232, mesaColor: 0xa85c30, mesaFarColor: 0x7a4050, rockColor: 0x96582f,
    cloudColor: 0xffd9a8, cloudOpacity: 0.6, sunIntensity: 3.2, hemiSky: 0x9db4e0, hemiGround: 0x6a4028, hemiIntensity: 0.8,
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

export interface RingDef {
  dist: number;
  lateral: number;
  height: number;
  radius: number;
}

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  accent: number;
  accentName: string;
  theme: ThemeId;
  variant?: TrackVariant;
  points: ControlPoint[];
  checkpoints: CheckpointDef[];
  boosts: BoostDef[];
  rings?: RingDef[];
  slicks?: { dist: number; lateral: number; w: number; l: number }[];
  movers?: { dist: number; speed: number; range: number }[];
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
    cp(-4, 0, -112, 8.5, 2),
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
  slicks: [
    { dist: 120, lateral: -2, w: 3.5, l: 20 },
    { dist: 700, lateral: 1.5, w: 4, l: 24 },
  ],
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

const TRACK_5: TrackDef = {
  id: 'dune-rush',
  name: 'Dune Rush',
  subtitle: 'Wide, fast, huge air',
  accent: 0x7dff6e,
  accentName: '#7dff6e',
  theme: 'alpine',
  points: [
    cp(0, 0, 0, 10),
    cp(0, 0, -70, 10),
    cp(-5, 4, -140, 10),
    cp(-10, 10, -210, 10),
    cp(-10, 12, -255, 10),
    cp(-12, 15.5, -295, 10),
    cp(-20, 8, -318, 10),
    cp(-45, 8.5, -348, 9.5, 12),
    cp(-105, 4, -368, 9.5, 16),
    cp(-170, 1, -340, 9.5, 18),
    cp(-195, 0, -280, 10, 14),
    cp(-185, 2, -210, 10, 10),
    cp(-150, 6, -150, 10, 8),
    cp(-110, 8, -90, 10, 6),
    cp(-65, 6, -60, 10, 4),
    cp(-30, 2, -30, 10, 0),
  ],
  checkpoints: [{ dist: 280 }, { dist: 560 }, { dist: 840 }],
  boosts: [
    { dist: 60, lateral: 0, strength: 7 },
    { dist: 620, lateral: 0, strength: 8 },
  ],
  rings: [
    { dist: 268, lateral: 0, height: 3.2, radius: 3.8 },
    { dist: 292, lateral: 0, height: 2.6, radius: 3.8 },
    { dist: 316, lateral: 0, height: 2.2, radius: 3.8 },
  ],
  medals: { author: 23000, gold: 25500, silver: 29500, bronze: 37000 },
};

const TRACK_6: TrackDef = {
  id: 'serpents-tail',
  name: "Serpent's Tail",
  subtitle: 'Technical narrow esses',
  accent: 0xffe14d,
  accentName: '#ffe14d',
  theme: 'canyon',
  points: [
    cp(0, 0, 0, 6.5),
    cp(0, 0, -45, 6),
    cp(-18, 1, -85, 5.5, 18),
    cp(-55, 2, -105, 5.5, -20),
    cp(-95, 3, -85, 5.5, 22),
    cp(-135, 4, -105, 5.5, -22),
    cp(-172, 5, -85, 5.5, 20),
    cp(-195, 6, -45, 6, -16),
    cp(-185, 7, -5, 6, 14),
    cp(-150, 8, 25, 6.5, -10),
    cp(-105, 8, 35, 6.5, 12),
    cp(-60, 6, 25, 7, -10),
    cp(-35, 3, -5, 7, 0),
    cp(-25, 1, -45, 7, 0),
  ],
  checkpoints: [{ dist: 220 }, { dist: 430 }],
  boosts: [{ dist: 500, lateral: 0, strength: 6 }],
  medals: { author: 21000, gold: 23500, silver: 27000, bronze: 34000 },
  movers: [
    { dist: 300, speed: 0.8, range: 26 },
    { dist: 520, speed: 1.1, range: 26 },
  ],
};

const TRACK_7: TrackDef = {
  id: 'neon-vertical',
  name: 'Neon Vertical',
  subtitle: 'High banks in the dark',
  accent: 0xff3dd2,
  accentName: '#ff3dd2',
  theme: 'neon',
  points: [
    cp(0, 0, 40, 8),
    cp(0, 0, -10, 8),
    cp(-2, 2, -60, 8, 20),
    cp(-25, 5, -105, 7.5, 48),
    cp(-75, 9, -130, 7.5, 55),
    cp(-135, 12, -120, 7, 45),
    cp(-178, 13, -80, 7, -40),
    cp(-185, 12, -25, 7, -52),
    cp(-155, 9, 25, 7.5, 50),
    cp(-100, 6, 48, 8, 35),
    cp(-48, 3, 40, 8, 18),
    cp(-15, 1, 5, 8, 6),
    cp(-6, 0, -40, 8, 0),
  ],
  checkpoints: [{ dist: 230 }, { dist: 470 }, { dist: 700 }],
  boosts: [
    { dist: 30, lateral: 0, strength: 8 },
    { dist: 460, lateral: 0, strength: 8 },
  ],
  medals: { author: 24000, gold: 26500, silver: 31000, bronze: 39000 },
};

const TRACK_8: TrackDef = {
  id: 'gauntlet-ii',
  name: 'Gauntlet II',
  subtitle: 'Expert — 1.4km of everything',
  accent: 0x50ffa8,
  accentName: '#50ffa8',
  theme: 'mesa',
  points: [
    cp(0, 0, 0, 8),
    cp(0, 0, -65, 8),
    cp(-6, 3, -130, 8, 16),
    cp(-42, 7, -175, 7.5, 24),
    cp(-100, 11, -190, 7, 30),
    cp(-160, 14, -160, 6.8, -26),
    cp(-185, 16, -100, 6.8, -34),
    cp(-172, 17, -40, 7, 26),
    cp(-130, 18, -5, 7, 18),
    cp(-80, 18, 5, 7.5, -12),
    cp(-45, 16, -20, 7.5, -20),
    cp(-40, 12, -70, 7.5, -18),
    cp(-75, 8, -110, 8, -8),
    cp(-130, 4, -118, 8, 8),
    cp(-168, 2, -150, 8, 14),
    cp(-155, 0, -195, 8, 18),
    cp(-105, 0, -215, 8, 16),
    cp(-55, 0, -200, 8, 12),
    cp(-25, 0, -155, 8, 6),
    cp(-14, 0, -105, 8, 0),
  ],
  checkpoints: [{ dist: 360 }, { dist: 740 }, { dist: 1100 }],
  boosts: [
    { dist: 350, lateral: 0, strength: 8 },
    { dist: 1080, lateral: 0, strength: 9 },
  ],
  medals: { author: 32000, gold: 35500, silver: 41000, bronze: 52000 },
  movers: [
    { dist: 500, speed: 0.9, range: 26 },
    { dist: 900, speed: 1.2, range: 26 },
  ],
};

const TRACK_9: TrackDef = {
  id: 'twilight-gauntlet',
  name: 'Twilight Gauntlet',
  subtitle: 'Dusk marathon over the mesas',
  accent: 0xff8a3d,
  accentName: '#ff8a3d',
  theme: 'mesa',
  points: [
    cp(0, 0, 0, 8),
    cp(-4, 2, -70, 8, 12),
    cp(-30, 6, -130, 7.5, 22),
    cp(-85, 10, -160, 7.5, 26),
    cp(-150, 12, -150, 7, -24),
    cp(-185, 13, -95, 7, -28),
    cp(-175, 14, -35, 7, 24),
    cp(-130, 15, -5, 7, 18),
    cp(-80, 14, 10, 7.5, -14),
    cp(-45, 11, -10, 7.5, -22),
    cp(-42, 7, -65, 7.5, -20),
    cp(-80, 4, -100, 8, -10),
    cp(-135, 2, -110, 8, 10),
    cp(-172, 0, -145, 8, 16),
    cp(-158, 0, -192, 8, 18),
    cp(-108, 0, -210, 8, 14),
    cp(-58, 0, -195, 8, 10),
    cp(-5, 0, -130, 8, 0),
    cp(35, 0, -105, 8, 0),
    cp(58, 0, -60, 8, 0),
    cp(52, 0, -12, 8, 0),
    cp(28, 0, 28, 8, 0),
    cp(-6, 0, 52, 8, 0),
    cp(-18, 0, 58, 8, 0),
  ],
  checkpoints: [{ dist: 330 }, { dist: 680 }, { dist: 1020 }],
  boosts: [
    { dist: 330, lateral: 0, strength: 8 },
    { dist: 1000, lateral: 0, strength: 9 },
  ],
  medals: { author: 37500, gold: 41500, silver: 48000, bronze: 60000 },
};

const TRACK_10: TrackDef = {
  id: 'neon-circuit',
  name: 'Neon Circuit',
  subtitle: 'Short, fast, glowing',
  accent: 0x9dff3d,
  accentName: '#9dff3d',
  theme: 'neon',
  points: [
    cp(0, 0, 0, 9),
    cp(0, 0, -55, 9),
    cp(-3, 1, -110, 8.5, 14),
    cp(-30, 3, -150, 8, 20),
    cp(-80, 5, -168, 8, 24),
    cp(-130, 6, -150, 8, -20),
    cp(-158, 6, -105, 8, -22),
    cp(-148, 5, -55, 8.5, 18),
    cp(-110, 3, -22, 9, 12),
    cp(-60, 1, -8, 9, 6),
  ],
  checkpoints: [{ dist: 190 }, { dist: 380 }],
  boosts: [{ dist: 100, lateral: 0, strength: 7 }],
  medals: { author: 15500, gold: 17500, silver: 20500, bronze: 26000 },
};

const TRACK_11: TrackDef = {
  id: 'ring-runner',
  name: 'Ring Runner',
  subtitle: 'Thread the rings or walk home',
  accent: 0xffd23d,
  accentName: '#ffd23d',
  theme: 'alpine',
  points: [
    cp(0, 0, 0, 9),
    cp(0, 1, -60, 9),
    cp(-4, 6, -120, 8.5),
    cp(-10, 13, -172, 8.5),
    cp(-16, 16, -198, 8.5),
    cp(-28, 7, -226, 8.5),
    cp(-50, 4, -262, 8.5),
    cp(-60, 12, -318, 8.5),
    cp(-66, 15, -346, 8.5),
    cp(-80, 6, -376, 8.5),
    cp(-110, 3, -412, 8.5, 10),
    cp(-160, 1, -435, 9, 14),
    cp(-215, 0, -415, 9, 16),
    cp(-240, 0, -360, 9, 14),
    cp(-230, 1, -295, 9, 10),
    cp(-195, 3, -250, 9, 6),
    cp(-150, 4, -235, 9, 0),
    cp(-110, 3, -255, 9, -4),
    cp(-75, 1, -290, 9, -6),
    cp(-60, 0, -345, 9, 0),
  ],
  checkpoints: [{ dist: 300 }, { dist: 620 }, { dist: 930 }],
  boosts: [
    { dist: 40, lateral: 0, strength: 8 },
    { dist: 830, lateral: 0, strength: 8 },
  ],
  rings: [
    { dist: 212, lateral: 0, height: 3.4, radius: 3.8 },
    { dist: 238, lateral: 0, height: 2.6, radius: 3.8 },
    { dist: 340, lateral: 0, height: 3.2, radius: 3.8 },
    { dist: 366, lateral: 0, height: 2.4, radius: 3.8 },
  ],
  medals: { author: 37500, gold: 41500, silver: 48000, bronze: 60000 },
};

const TRACK_12: TrackDef = {
  id: 'volt-alley',
  name: 'Volt Alley',
  subtitle: 'Technical neon sprint',
  accent: 0x3dffec,
  accentName: '#3dffec',
  theme: 'neon',
  points: [
    cp(0, 0, 0, 7),
    cp(0, 0, -50, 7),
    cp(-10, 2, -98, 6.5, 16),
    cp(-42, 4, -132, 6.5, -18),
    cp(-86, 6, -140, 6.5, 20),
    cp(-128, 8, -118, 6.5, -22),
    cp(-152, 9, -75, 6.5, 24),
    cp(-142, 10, -28, 6.5, -24),
    cp(-104, 10, -4, 7, 20),
    cp(-62, 9, -8, 7, -18),
    cp(-38, 7, -42, 7, -16),
    cp(-52, 4, -88, 7.5, -10),
    cp(-95, 2, -105, 8, 6),
    cp(-70, 0, -140, 8, 8),
    cp(-30, 0, -165, 8, 8),
    cp(15, 0, -175, 8, 4),
    cp(50, 0, -148, 8, 0),
    cp(62, 0, -100, 8, 0),
    cp(52, 0, -55, 8, 0),
    cp(25, 0, -28, 8, 4),
    cp(-4, 0, -5, 8, 0),
  ],
  checkpoints: [{ dist: 260 }, { dist: 620 }],
  boosts: [{ dist: 480, lateral: 0, strength: 7 }],
  rings: [
    { dist: 196, lateral: 0, height: 3, radius: 3.4 },
    { dist: 222, lateral: 0, height: 2.4, radius: 3.4 },
  ],
  slicks: [
    { dist: 320, lateral: 0, w: 4, l: 24 },
    { dist: 560, lateral: -2, w: 3.5, l: 18 },
  ],
  medals: { author: 28500, gold: 32000, silver: 37000, bronze: 46000 },
};

const TRACK_13: TrackDef = {
  id: 'salt-flats',
  name: 'Salt Flats',
  subtitle: 'High-speed sweepers · flat out',
  accent: 0x7dd8ff,
  accentName: '#7dd8ff',
  theme: 'mesa',
  points: [
    cp(0, 0, 0, 12),
    cp(8, 0, -94, 12),
    cp(-4, 1, -186, 12),
    cp(-48, 3, -256, 11.5, 6),
    cp(-120, 4, -296, 11.5, 7),
    cp(-200, 4, -280, 11.5, 6),
    cp(-256, 2, -214, 11.5, 5),
    cp(-272, 0, -128, 12, 4),
    cp(-244, 0, -44, 12, 2),
    cp(-168, 0, 10, 12),
    cp(-84, 0, 26, 12, 3),
  ],
  checkpoints: [{ dist: 300 }, { dist: 650 }],
  boosts: [
    { dist: 50, lateral: 0, strength: 11 },
    { dist: 560, lateral: 0, strength: 9 },
    { dist: 760, lateral: 0, strength: 12 },
  ],
  medals: { author: 23500, gold: 26500, silver: 31000, bronze: 40000 },
};

const TRACK_14: TrackDef = {
  id: 'harbor-nine',
  name: 'Harbor Nine',
  subtitle: 'Nine turns on the neon waterfront',
  accent: 0xff5c8a,
  accentName: '#ff5c8a',
  theme: 'neon',
  points: [
    cp(0, 0, -168, 9),
    cp(44, 2, -136, 9),
    cp(94, 4, -108, 8.5),
    cp(134, 6, -62, 8.5),
    cp(170, 7, -16, 8.5),
    cp(138, 5, 36, 8.5),
    cp(98, 3, 88, 8.5),
    cp(32, 1, 150, 9, -20),
    cp(-38, 0, 128, 9),
    cp(-80, 0, 82, 8.5),
    cp(-138, 2, 22, 8.5, -14),
    cp(-148, 1, -52, 8.5),
    cp(-94, 0, -136, 9),
  ],
  checkpoints: [{ dist: 265 }, { dist: 500 }, { dist: 780 }],
  boosts: [
    { dist: 60, lateral: 0, strength: 8 },
    { dist: 610, lateral: 0, strength: 7 },
  ],
  slicks: [{ dist: 555, lateral: 0, w: 4, l: 24 }],
  medals: { author: 25500, gold: 29000, silver: 34000, bronze: 43500 },
};

export const TRACKS: TrackDef[] = [TRACK_1, TRACK_2, TRACK_3, TRACK_4, TRACK_5, TRACK_6, TRACK_7, TRACK_8, TRACK_9, TRACK_10, TRACK_11, TRACK_12, TRACK_13, TRACK_14];
