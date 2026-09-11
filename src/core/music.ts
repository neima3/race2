// Per-theme procedural music pattern data. Scheduling lives in AudioEngine.

export type MusicTheme = 'alpine' | 'canyon' | 'neon' | 'mesa';

export interface MusicPattern {
  bpm: number;
  steps: number; // pattern length in 16ths
  bass: { step: number; freq: number; len: number; type: OscillatorType; vol: number; layer: 0 | 1 }[];
  lead: { step: number; freq: number; len: number; type: OscillatorType; vol: number }[];
  perc: { step: number; freq: number; len: number; vol: number }[];
}

function n(semi: number): number {
  return 440 * Math.pow(2, (semi - 9) / 12);
}

const patterns: Record<MusicTheme, MusicPattern> = {
  alpine: {
    bpm: 100,
    steps: 64,
    bass: [0, 16, 32, 48].flatMap((s, i) =>
      [n(-15 + [0, -4, -7, -4][i])].map((f) => ({ step: s, freq: f, len: 14, type: 'triangle' as OscillatorType, vol: 0.4, layer: 0 as 0 | 1 })),
    ),
    lead: [
      ...[0, 8, 16, 24, 32, 40, 48, 56].map((s, i) => ({
        step: s + 4,
        freq: n(12 + [0, 3, 5, 3, 7, 5, 3, 0][i]),
        len: 6,
        type: 'sine' as OscillatorType,
        vol: 0.16,
      })),
    ],
    perc: [],
  },
  canyon: {
    bpm: 96,
    steps: 48,
    bass: [0, 12, 24, 36].flatMap((s, i) =>
      [n(-17 + [0, 3, -2, 5][i])].map((f) => ({ step: s, freq: f, len: 10, type: 'triangle' as OscillatorType, vol: 0.42, layer: 0 as 0 | 1 })),
    ),
    lead: [
      ...[2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46].map((s, i) => ({
        step: s,
        freq: n(7 + [0, 3, 5, 7, 5, 3, 0, -2, 0, 3, 7, 10][i]),
        len: 3,
        type: 'triangle' as OscillatorType,
        vol: 0.18,
      })),
    ],
    perc: [4, 20, 28, 44].map((s) => ({ step: s, freq: 1800, len: 0.04, vol: 0.05 })),
  },
  neon: {
    bpm: 124,
    steps: 64,
    bass: Array.from({ length: 16 }, (_, i) => ({
      step: i * 4,
      freq: n(-24 + (i % 8 < 4 ? 0 : 5)),
      len: 3.2,
      type: 'sawtooth' as OscillatorType,
      vol: 0.4,
      layer: 0 as 0 | 1,
    })),
    lead: Array.from({ length: 32 }, (_, i) => ({
      step: 16 + i * 2,
      freq: n([12, 15, 19, 22, 19, 15, 12, 10][i % 8] + (i >= 16 ? 5 : 0)),
      len: 2.2,
      type: 'sawtooth' as OscillatorType,
      vol: 0.08,
    })),
    perc: Array.from({ length: 16 }, (_, i) => ({ step: i * 4 + 2, freq: 3200, len: 0.03, vol: 0.06 })),
  },
  mesa: {
    bpm: 84,
    steps: 64,
    bass: [0, 24, 48].flatMap((s, i) =>
      [n(-19 + [0, -5, 2][i])].map((f) => ({ step: s, freq: f, len: 22, type: 'sine' as OscillatorType, vol: 0.45, layer: 0 as 0 | 1 })),
    ),
    lead: [
      ...[8, 20, 28, 36, 44, 52, 60, 4].map((s, i) => ({
        step: s,
        freq: n(4 + [0, 4, 7, 11, 7, 4, 2, 0][i]),
        len: 10,
        type: 'sine' as OscillatorType,
        vol: 0.14,
      })),
    ],
    perc: [16, 48].map((s) => ({ step: s, freq: 900, len: 0.08, vol: 0.04 })),
  },
};

export function getPattern(theme: MusicTheme): MusicPattern {
  return patterns[theme];
}
