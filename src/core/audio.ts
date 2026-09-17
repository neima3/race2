import { getPattern, type MusicTheme } from './music';

export type EngineVoice = 'standard' | 'aero' | 'tank' | 'glide';

/** Per-body engine timbre (v8 P7): real synth deltas keyed by the player body. Rivals stay neutral. */
export interface EngineTimbre {
  osc1: OscillatorType;
  osc2: OscillatorType;
  cutoffMul: number;
  freqMul: number;
  sub: number;
}

const ENGINE_TIMBRE: Record<EngineVoice, EngineTimbre> = {
  standard: { osc1: 'sawtooth', osc2: 'square', cutoffMul: 1, freqMul: 1, sub: 0.5 },
  aero: { osc1: 'sawtooth', osc2: 'sawtooth', cutoffMul: 1.3, freqMul: 1.03, sub: 0.42 },
  tank: { osc1: 'square', osc2: 'square', cutoffMul: 0.75, freqMul: 0.92, sub: 0.7 },
  glide: { osc1: 'sawtooth', osc2: 'triangle', cutoffMul: 1.1, freqMul: 0.97, sub: 0.55 },
};

/** Absolute gain ceilings per bus/layer — asserted in test/probe.ts (v8 P7). */
export const AUDIO_CEILINGS = {
  master: 1,
  sfxBus: 1,
  musicBus: 0.34,
  engine: 0.16,
  wind: 0.1,
  slip: 0.07,
  musicLayer: 0.5,
  oneShot: 0.55,
} as const;

const SLIP_ATTACK_TC = 0.08;
const SLIP_RELEASE_TC = 0.2;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineSub: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineVoice: EngineVoice = 'standard';

  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  private slipSource: AudioBufferSourceNode | null = null;
  private slipFilter: BiquadFilterNode | null = null;
  private slipGain: GainNode | null = null;
  private slipLevel = 0;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNextTime = 0;
  private lastGear = -1;
  private shiftBlipUntil = 0;
  private musicLayers: { gain: GainNode; intense: boolean }[] = [];
  private musicIntensity = 0;
  private musicKickUntil = 0;
  private musicTheme: MusicTheme | null = null;
  private ambienceNodes: { src: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode }[] = [];
  private ambienceKind: string | null = null;
  private probeTaps: { name: string; t0: number; dur: number; gain: AudioParam }[] = [];

  musicEnabled = true;
  sfxEnabled = true;

  ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicEnabled ? 0.34 : 0;
    this.musicGain.connect(this.master);
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.34 : 0;
    if (on) this.startMusic();
  }

  setSfxEnabled(on: boolean): void {
    this.sfxEnabled = on;
    if (this.sfxGain) this.sfxGain.gain.value = on ? 1 : 0;
  }

  /** Revoice the running engine for a body change (or pre-select the next start). */
  setEngineBody(body: EngineVoice): void {
    const t = ENGINE_TIMBRE[body];
    this.engineVoice = body;
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineSub || !this.engineFilter) return;
    this.engineOsc1.type = t.osc1;
    this.engineOsc2.type = t.osc2;
    this.engineSub.gain.value = t.sub;
    this.engineFilter.frequency.value = 700 * t.cutoffMul;
  }

  startEngine(body: EngineVoice = 'standard'): void {
    if (!this.ctx || !this.sfxGain || this.engineOsc1) return;
    this.engineVoice = body;
    const t = ENGINE_TIMBRE[body];
    const ctx = this.ctx;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = t.osc1;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = t.osc2;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700 * t.cutoffMul;
    this.engineFilter.Q.value = 2.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineSub = ctx.createGain();
    this.engineSub.gain.value = t.sub;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineSub);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);
    this.engineOsc1.start();
    this.engineOsc2.start();

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = noiseBuf;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.sfxGain);
    this.windSource.start();

    // Tire slip screech (v8 P7): continuous layer, gain tracks |lateral slip|.
    this.slipSource = ctx.createBufferSource();
    this.slipSource.buffer = noiseBuf;
    this.slipSource.loop = true;
    this.slipFilter = ctx.createBiquadFilter();
    this.slipFilter.type = 'bandpass';
    this.slipFilter.frequency.value = 2200;
    this.slipFilter.Q.value = 1.6;
    this.slipGain = ctx.createGain();
    this.slipGain.gain.value = 0;
    this.slipSource.connect(this.slipFilter);
    this.slipFilter.connect(this.slipGain);
    this.slipGain.connect(this.sfxGain);
    this.slipSource.start();
  }

  updateEngine(speedRatio: number, throttle: number, airborne: boolean): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain || !this.engineFilter || !this.windGain || !this.windFilter) return;
    const t = ENGINE_TIMBRE[this.engineVoice];
    const now = this.ctx.currentTime;
    const gears = 6;
    const clamped = Math.min(0.999, speedRatio);
    const gear = Math.min(gears - 1, Math.floor(clamped * gears));
    const inGear = clamped * gears - gear;
    const rpm = 0.25 + inGear * 0.75;
    const f = (46 + rpm * 112 + gear * 6) * t.freqMul;
    this.engineOsc1.frequency.setTargetAtTime(f, now, 0.035);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, now, 0.035);
    this.engineFilter.frequency.setTargetAtTime((420 + rpm * 1900 + gear * 180) * t.cutoffMul, now, 0.05);
    const shiftCut = this.lastGear !== gear && this.lastGear >= 0 ? 0.35 : 1;
    if (this.lastGear !== gear) {
      this.lastGear = gear;
      this.shiftBlipUntil = now + 0.09;
    }
    if (now < this.shiftBlipUntil) this.engineGain.gain.setTargetAtTime(0.02, now, 0.01);
    else this.engineGain.gain.setTargetAtTime((0.05 + throttle * 0.06 + speedRatio * 0.05) * shiftCut, now, 0.08);
    this.windGain.gain.setTargetAtTime(airborne ? 0.02 + speedRatio * 0.06 : speedRatio * speedRatio * 0.09, now, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + speedRatio * 900, now, 0.1);
  }

  /**
   * Continuous tire-slip screech (v8 P7). `slip01` = 0..1 magnitude of lateral slip
   * (car.state.driftAmount = |lateral velocity| / 9). Attack 80ms, release 200ms.
   */
  setSlip(slip01: number): void {
    if (!this.ctx || !this.slipGain || !this.slipFilter) return;
    const now = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0, slip01));
    this.slipLevel = s;
    const target = s * (AUDIO_CEILINGS.slip - 0.01);
    const rising = target > this.slipGain.gain.value;
    this.slipGain.gain.setTargetAtTime(target, now, rising ? SLIP_ATTACK_TC : SLIP_RELEASE_TC);
    this.slipFilter.frequency.setTargetAtTime(1800 + s * 1400, now, 0.06);
  }

  stopEngine(): void {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.windSource?.stop();
      this.slipSource?.stop();
    } catch {
      /* already stopped */
    }
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.windSource = null;
    this.slipSource = null;
    this.engineGain = null;
    this.windGain = null;
    this.slipGain = null;
    this.slipFilter = null;
    this.slipLevel = 0;
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, tag?: string): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    if (tag) this.addTap(tag, t0, dur, g.gain);
  }

  private noiseBurst(dur: number, vol: number, from: number, to: number, tag?: string): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    if (tag) this.addTap(tag, t0, dur, g.gain);
  }

  private addTap(name: string, t0: number, dur: number, gain: AudioParam): void {
    this.probeTaps.push({ name, t0, dur, gain });
    if (this.probeTaps.length > 12) this.probeTaps.shift();
  }

  /** Headless/audio-QA introspection: bus gains, engine voice, slip layer, music intensity and recent event envelopes. */
  audioProbe(): {
    time: number;
    ctxState: string | null;
    sfxBus: number;
    musicBus: number;
    musicIntensity: number;
    musicLayers: { base: number; intense: number } | null;
    engine: { osc1: OscillatorType; osc2: OscillatorType; sub: number; cutoffMul: number; freqMul: number; filterHz: number; gain: number; voice: EngineVoice } | null;
    slip: { gain: number; level: number; hz: number } | null;
    gains: { master: number; sfx: number; music: number; engine: number; wind: number; musicBase: number; musicIntense: number };
    ceilings: typeof AUDIO_CEILINGS;
    limiter: boolean;
    events: { name: string; start: number; dur: number; gain: number }[];
  } {
    return {
      time: this.ctx?.currentTime ?? 0,
      ctxState: this.ctx?.state ?? null,
      sfxBus: this.sfxGain?.gain.value ?? 0,
      musicBus: this.musicGain?.gain.value ?? 0,
      musicIntensity: this.musicIntensity,
      musicLayers: this.musicLayers.length === 2
        ? { base: this.musicLayers[0].gain.gain.value, intense: this.musicLayers[1].gain.gain.value }
        : null,
      engine: this.engineOsc1 && this.engineOsc2 && this.engineFilter && this.engineSub && this.engineGain
        ? {
            osc1: this.engineOsc1.type,
            osc2: this.engineOsc2.type,
            sub: this.engineSub.gain.value,
            cutoffMul: ENGINE_TIMBRE[this.engineVoice].cutoffMul,
            freqMul: ENGINE_TIMBRE[this.engineVoice].freqMul,
            filterHz: this.engineFilter.frequency.value,
            gain: this.engineGain.gain.value,
            voice: this.engineVoice,
          }
        : null,
      slip: this.slipGain && this.slipFilter
        ? { gain: this.slipGain.gain.value, level: this.slipLevel, hz: this.slipFilter.frequency.value }
        : null,
      gains: {
        master: this.master?.gain.value ?? 0,
        sfx: this.sfxGain?.gain.value ?? 0,
        music: this.musicGain?.gain.value ?? 0,
        engine: this.engineGain?.gain.value ?? 0,
        wind: this.windGain?.gain.value ?? 0,
        musicBase: this.musicLayers[0]?.gain.gain.value ?? 0,
        musicIntense: this.musicLayers[1]?.gain.gain.value ?? 0,
      },
      ceilings: AUDIO_CEILINGS,
      limiter: this.limiter !== null,
      events: this.probeTaps.map((t) => ({ name: t.name, start: t.t0, dur: t.dur, gain: t.gain.value })),
    };
  }

  uiClick(): void {
    this.blip(660, 0.06, 'triangle', 0.25);
  }

  countdownBeep(final: boolean): void {
    this.blip(final ? 880 : 440, final ? 0.42 : 0.14, 'square', 0.22);
  }

  checkpoint(): void {
    this.blip(740, 0.1, 'sine', 0.3);
    this.blip(1108, 0.16, 'sine', 0.3, 0.07);
  }

  boost(): void {
    this.noiseBurst(0.5, 0.5, 300, 3200);
    this.blip(180, 0.35, 'sawtooth', 0.2, 0, 520);
  }

  drift(): void {
    this.noiseBurst(0.22, 0.1, 900, 500);
  }

  land(): void {
    this.blip(90, 0.16, 'sine', 0.4, 0, 45);
    this.noiseBurst(0.12, 0.22, 500, 200);
  }

  /** Collision: low body thump + noise crunch (v8 P7 revoice — was noise-only). */
  crash(): void {
    this.blip(64, 0.26, 'sine', 0.5, 0, 30, 'thud');
    this.noiseBurst(0.3, 0.4, 800, 150, 'crash');
  }

  finish(medal: 'none' | 'bronze' | 'silver' | 'gold' | 'author'): void {
    const notes = medal === 'none' ? [523, 415] : medal === 'bronze' ? [523, 523, 659] : medal === 'silver' ? [523, 659, 784] : medal === 'gold' ? [523, 659, 784, 1046] : [659, 784, 988, 1319];
    notes.forEach((n, i) => this.blip(n, 0.24, 'triangle', 0.3, i * 0.11));
  }

  overtake(): void {
    this.blip(880, 0.09, 'sine', 0.17, 0, undefined, 'overtake');
    this.blip(1318, 0.16, 'sine', 0.17, 0.07, undefined, 'overtake');
  }

  /** Paint-unlock moment (v8 P5); P7 audio pass may revoice this bus. */
  unlockChime(): void {
    this.blip(784, 0.12, 'sine', 0.2, 0, undefined, 'unlock');
    this.blip(988, 0.12, 'sine', 0.2, 0.09, undefined, 'unlock');
    this.blip(1319, 0.22, 'sine', 0.2, 0.18, undefined, 'unlock');
  }

  goStinger(): void {
    this.noiseBurst(0.35, 0.38, 240, 2600, 'go');
    this.blip(150, 0.3, 'sawtooth', 0.22, 0, 70, 'go');
    this.blip(587, 0.22, 'square', 0.11, 0.06, undefined, 'go');
  }

  /** Near-miss pass whoosh (v8 P7): short band-pass noise sweep, subtle. */
  nearMissWhoosh(): void {
    this.noiseBurst(0.25, 0.14, 350, 2600, 'whoosh');
  }

  /** Daily-challenge completion stinger (v8 P7): rising fourths, D-major, ≤0.6s. */
  dailyFanfare(): void {
    const notes: [number, number][] = [[587, 0.14], [880, 0.14], [1175, 0.3]];
    notes.forEach(([f, d], i) => this.blip(f, d, 'triangle', 0.2, i * 0.1, undefined, 'daily'));
  }

  /** Weekly-event final stinger (v8 P7): fifth-based C-major arpeggio, ≤1.2s — distinct contour from the daily one. */
  weeklyFanfare(): void {
    const notes: [number, number][] = [[523, 0.12], [784, 0.12], [1046, 0.12], [1319, 0.4]];
    notes.forEach(([f, d], i) => this.blip(f, d, i === notes.length - 1 ? 'triangle' : 'square', 0.18, i * 0.13, undefined, 'weekly'));
  }

  /** Procedural crowd swell: brownish noise through a wide bandpass with slow attack/release. */
  crowd(dur = 2.4, vol = 0.09): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * w;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 750;
    bp.Q.value = 0.55;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    const attack = Math.min(0.5, dur * 0.25);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.setValueAtTime(vol, Math.max(attack, t0 + dur - 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    this.addTap('crowd', t0, dur, g.gain);
  }

  /** Force the music intensity bus to full for a few seconds (FINAL LAP moment). */
  musicKick(seconds = 6): void {
    if (!this.ctx) return;
    this.musicKickUntil = this.ctx.currentTime + seconds;
    this.musicIntensity = Math.max(this.musicIntensity, 0.7);
  }

  setSpeedIntensity(speedRatio: number, boosting: boolean): void {
    if (!this.ctx) return;
    const kicked = this.ctx.currentTime < this.musicKickUntil;
    const target = kicked ? 1 : boosting || speedRatio > 0.82 ? 1 : speedRatio > 0.35 ? 0.55 : 0;
    this.musicIntensity += (target - this.musicIntensity) * (kicked ? 0.18 : 0.04);
    const t = this.ctx.currentTime;
    for (const layer of this.musicLayers) {
      const wanted = layer.intense ? this.musicIntensity : 1 - this.musicIntensity * 0.7;
      layer.gain.gain.setTargetAtTime(0.5 * wanted, t, 0.4);
    }
  }

  startAmbience(kind: 'birds' | 'wind' | 'synth' | 'waves'): void {
    if (!this.ctx || !this.master) return;
    if (this.ambienceKind === kind) return;
    this.stopAmbience();
    this.ambienceKind = kind;
    const ctx = this.ctx;
    const noise = () => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = 0.985 * last + 0.015 * w;
        data[i] = last * 8;
      }
      return buf;
    };
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    if (kind === 'wind') {
      src.buffer = noise();
      filter.type = 'bandpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.4;
      gain.gain.value = 0.05;
    } else if (kind === 'waves') {
      src.buffer = noise();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      gain.gain.value = 0.045;
    } else if (kind === 'synth') {
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 55;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = 55.6;
      const g2 = ctx.createGain();
      g2.gain.value = 0.035;
      o1.connect(filter);
      o2.connect(filter);
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      filter.connect(g2);
      g2.connect(this.master);
      o1.start();
      o2.start();
      this.ambienceNodes.push({ src: o1 as unknown as AudioBufferSourceNode, gain: g2 });
      this.ambienceNodes.push({ src: o2 as unknown as AudioBufferSourceNode, gain: g2 });
      return;
    } else {
      src.buffer = noise();
      filter.type = 'bandpass';
      filter.frequency.value = 2800;
      filter.Q.value = 2.5;
      gain.gain.value = 0.012;
    }
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.loop = true;
    src.start();
    this.ambienceNodes.push({ src, gain, filter });
  }

  stopAmbience(): void {
    for (const n of this.ambienceNodes) {
      try {
        n.src.stop();
      } catch {
        /* not started */
      }
    }
    this.ambienceNodes = [];
    this.ambienceKind = null;
  }

  startMusic(theme: MusicTheme = 'neon'): void {
    if (this.ctx && this.musicTheme && this.musicTheme !== theme) this.stopMusic();
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;
    this.musicTheme = theme;
    const ctx = this.ctx;
    const pattern = getPattern(theme);
    const stepDur = 60 / pattern.bpm / 4;
    this.musicStep = 0;
    this.musicNextTime = ctx.currentTime + 0.1;

    const playNote = (freq: number, when: number, dur: number, type: OscillatorType, vol: number, layer: 0 | 1 = 0) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      g.connect(this.musicLayers[layer]?.gain ?? this.musicGain!);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    };
    const playPerc = (freq: number, when: number, dur: number, vol: number) => {
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur) || 1, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const srcNode = ctx.createBufferSource();
      srcNode.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = vol;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = freq;
      srcNode.connect(hp);
      hp.connect(g);
      g.connect(this.musicLayers[1]?.gain ?? this.musicGain!);
      srcNode.start(when);
    };

    const tick = () => {
      if (!this.ctx || this.musicTimer === null) return;
      while (this.musicNextTime < ctx.currentTime + 0.2) {
        const s = this.musicStep % pattern.steps;
        for (const b of pattern.bass) if (b.step === s) playNote(b.freq, this.musicNextTime, b.len * stepDur, b.type, b.vol, b.layer);
        for (const l of pattern.lead) if (l.step === s) playNote(l.freq, this.musicNextTime, l.len * stepDur, l.type, l.vol, 1);
        for (const p of pattern.perc) if (p.step === s) playPerc(p.freq, this.musicNextTime, p.len, p.vol);
        this.musicNextTime += stepDur;
        this.musicStep++;
      }
    };
    tick();
    this.musicTimer = window.setInterval(tick, 100);
    if (this.musicLayers.length === 0) {
      for (const intense of [false, true]) {
        const g = ctx.createGain();
        g.gain.value = intense ? 0 : 0.5;
        g.connect(this.musicGain);
        this.musicLayers.push({ gain: g, intense });
      }
    }
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
}
