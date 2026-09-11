export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNextTime = 0;
  private lastGear = -1;
  private shiftBlipUntil = 0;
  private musicLayers: { gain: GainNode; intense: boolean }[] = [];
  private musicIntensity = 0;
  private ambienceNodes: { src: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode }[] = [];
  private ambienceKind: string | null = null;

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
    this.master.connect(this.ctx.destination);
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

  startEngine(): void {
    if (!this.ctx || !this.sfxGain || this.engineOsc1) return;
    const ctx = this.ctx;
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 2.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const sub = ctx.createGain();
    sub.gain.value = 0.5;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(sub);
    sub.connect(this.engineFilter);
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
  }

  updateEngine(speedRatio: number, throttle: number, airborne: boolean): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain || !this.engineFilter || !this.windGain || !this.windFilter) return;
    const t = this.ctx.currentTime;
    const gears = 6;
    const clamped = Math.min(0.999, speedRatio);
    const gear = Math.min(gears - 1, Math.floor(clamped * gears));
    const inGear = clamped * gears - gear;
    const rpm = 0.25 + inGear * 0.75;
    const f = 46 + rpm * 112 + gear * 6;
    this.engineOsc1.frequency.setTargetAtTime(f, t, 0.035);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.035);
    this.engineFilter.frequency.setTargetAtTime(420 + rpm * 1900 + gear * 180, t, 0.05);
    const shiftCut = this.lastGear !== gear && this.lastGear >= 0 ? 0.35 : 1;
    if (this.lastGear !== gear) {
      this.lastGear = gear;
      this.shiftBlipUntil = t + 0.09;
    }
    if (t < this.shiftBlipUntil) this.engineGain.gain.setTargetAtTime(0.02, t, 0.01);
    else this.engineGain.gain.setTargetAtTime((0.05 + throttle * 0.06 + speedRatio * 0.05) * shiftCut, t, 0.08);
    this.windGain.gain.setTargetAtTime(airborne ? 0.02 + speedRatio * 0.06 : speedRatio * speedRatio * 0.09, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + speedRatio * 900, t, 0.1);
  }

  stopEngine(): void {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.windSource?.stop();
    } catch {
      /* already stopped */
    }
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.windSource = null;
    this.engineGain = null;
    this.windGain = null;
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
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
  }

  private noiseBurst(dur: number, vol: number, from: number, to: number): void {
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

  crash(): void {
    this.noiseBurst(0.3, 0.4, 800, 150);
  }

  finish(medal: 'none' | 'bronze' | 'silver' | 'gold' | 'author'): void {
    const notes = medal === 'none' ? [523, 415] : medal === 'bronze' ? [523, 523, 659] : medal === 'silver' ? [523, 659, 784] : medal === 'gold' ? [523, 659, 784, 1046] : [659, 784, 988, 1319];
    notes.forEach((n, i) => this.blip(n, 0.24, 'triangle', 0.3, i * 0.11));
  }

  setSpeedIntensity(speedRatio: number, boosting: boolean): void {
    if (!this.ctx) return;
    const target = boosting || speedRatio > 0.82 ? 1 : speedRatio > 0.35 ? 0.55 : 0;
    this.musicIntensity += (target - this.musicIntensity) * 0.04;
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

  startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;
    const ctx = this.ctx;
    const bpm = 128;
    const stepDur = 60 / bpm / 4;
    this.musicStep = 0;
    this.musicNextTime = ctx.currentTime + 0.1;

    const bass = [55, 55, 65.4, 55, 55, 55, 49, 49];
    const arp = [440, 523, 659, 523, 392, 523, 659, 784, 587, 698, 880, 698, 523, 659, 784, 659];

    const playNote = (freq: number, when: number, dur: number, type: OscillatorType, vol: number, layer = 0) => {
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

    const tick = () => {
      if (!this.ctx || this.musicTimer === null) return;
      while (this.musicNextTime < ctx.currentTime + 0.2) {
        const s = this.musicStep % 128;
        const bar = Math.floor(s / 16) % 2;
        if (s % 8 === 0) playNote(bass[(s / 8) % 8 | 0] ?? bass[0], this.musicNextTime, stepDur * 7, 'triangle', 0.5, 0);
        if (bar === 0 && s % 2 === 0) playNote(arp[s % 16] / 2, this.musicNextTime, stepDur * 1.6, 'square', 0.05, 0);
        if (bar === 1) playNote(arp[s % 16], this.musicNextTime, stepDur * 1.4, 'sawtooth', 0.035, 1);
        if (s % 4 === 2) playNote(3200, this.musicNextTime, 0.03, 'square', 0.015, 1);
        this.musicNextTime += stepDur;
        this.musicStep++;
      }
    };
    tick();
    this.musicTimer = window.setInterval(tick, 120);
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
