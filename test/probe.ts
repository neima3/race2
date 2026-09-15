import { AudioEngine, AUDIO_CEILINGS } from '../src/core/audio';

// Virtual-clock AudioContext mock: automation events are evaluated analytically
// so gain envelopes can be asserted headless (no audio device, no real time).
type Ev = { seq: number; type: 'set' | 'linear' | 'exp' | 'target'; time: number; value: number; tc: number };

class MockAudioParam {
  private events: Ev[] = [];
  private seq = 0;
  constructor(private initial: number, private now: () => number) {}
  get value(): number {
    return this.evalAt(this.now());
  }
  set value(v: number) {
    this.push({ type: 'set', time: this.now(), value: v, tc: 0 });
  }
  setValueAtTime(v: number, t: number): void {
    this.push({ type: 'set', time: t, value: v, tc: 0 });
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.push({ type: 'linear', time: t, value: v, tc: 0 });
  }
  exponentialRampToValueAtTime(v: number, t: number): void {
    this.push({ type: 'exp', time: t, value: v, tc: 0 });
  }
  setTargetAtTime(v: number, t: number, tc: number): void {
    this.push({ type: 'target', time: t, value: v, tc });
  }
  cancelScheduledValues(): void {
    this.events = [];
  }
  private push(e: Omit<Ev, 'seq'>): void {
    this.events.push({ ...e, seq: this.seq++ });
  }
  private evalAt(t: number): number {
    const evs = [...this.events].sort((a, b) => a.time - b.time || a.seq - b.seq);
    let v = this.initial;
    let cur = -Infinity;
    let hold: { time: number; value: number; tc: number } | null = null;
    let i = 0;
    const evolve = (to: number): void => {
      const from = Math.max(cur, hold ? hold.time : -Infinity);
      if (hold && to > from) v = hold.value + (v - hold.value) * Math.exp(-(to - from) / hold.tc);
      cur = Math.max(cur, to);
    };
    for (; i < evs.length; i++) {
      const e = evs[i];
      if (e.time > t) break;
      evolve(e.time);
      hold = null;
      if (e.type === 'target') hold = { time: e.time, value: e.value, tc: e.tc };
      else v = e.value;
    }
    const lastEvT = cur;
    evolve(t);
    const nxt = evs[i];
    if (nxt && (nxt.type === 'linear' || nxt.type === 'exp') && nxt.time > lastEvT) {
      const f = (t - lastEvT) / (nxt.time - lastEvT);
      v = nxt.type === 'linear'
        ? v + (nxt.value - v) * f
        : v * Math.pow(Math.max(nxt.value, 1e-9) / Math.max(v, 1e-9), f);
    }
    return v;
  }
}

class MockNode {
  connect(target: unknown): unknown {
    return target;
  }
  disconnect(): void {}
}

class MockGain extends MockNode {
  gain: MockAudioParam;
  constructor(now: () => number) {
    super();
    this.gain = new MockAudioParam(1, now);
  }
}

class MockOscillator extends MockNode {
  type: OscillatorType = 'sine';
  frequency: MockAudioParam;
  constructor(now: () => number) {
    super();
    this.frequency = new MockAudioParam(440, now);
  }
  start(): void {}
  stop(): void {}
}

class MockSource extends MockNode {
  buffer: unknown = null;
  loop = false;
  start(): void {}
  stop(): void {}
}

class MockFilter extends MockNode {
  type: BiquadFilterType = 'lowpass';
  frequency: MockAudioParam;
  Q: MockAudioParam;
  constructor(now: () => number) {
    super();
    this.frequency = new MockAudioParam(350, now);
    this.Q = new MockAudioParam(1, now);
  }
}

class MockCompressor extends MockNode {
  threshold = { value: 0 };
  knee = { value: 0 };
  ratio = { value: 1 };
  attack = { value: 0 };
  release = { value: 0 };
}

class MockAudioContext {
  now = 0;
  sampleRate = 48000;
  state: AudioContextState = 'running';
  destination = new MockNode();
  get currentTime(): number {
    return this.now;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  createGain(): MockGain {
    return new MockGain(() => this.now);
  }
  createOscillator(): MockOscillator {
    return new MockOscillator(() => this.now);
  }
  createBufferSource(): MockSource {
    return new MockSource();
  }
  createBiquadFilter(): MockFilter {
    return new MockFilter(() => this.now);
  }
  createDynamicsCompressor(): MockCompressor {
    return new MockCompressor();
  }
  createBuffer(_channels: number, length: number): { getChannelData: (i: number) => Float32Array } {
    const data = new Float32Array(Math.max(1, length));
    return { getChannelData: () => data };
  }
}

let failures = 0;
let checks = 0;
function fail(msg: string): void {
  failures++;
  checks++;
  console.log(`FAIL ${msg}`);
}
function pass(msg: string): void {
  checks++;
  console.log(`PASS ${msg}`);
}
function expect(cond: boolean, msg: string): void {
  if (cond) pass(msg);
  else fail(msg);
}

(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
(globalThis as unknown as { setInterval: typeof setInterval }).setInterval = (cb: () => void, ms?: number) => {
  void cb;
  void ms;
  return -1 as unknown as ReturnType<typeof setInterval>;
};

type Probe = ReturnType<AudioEngine['audioProbe']>;

const engine = new AudioEngine();

{
  const p = engine.audioProbe();
  expect(p.ctxState === null && p.events.length === 0 && p.musicLayers === null && p.sfxBus === 0, 'probe is safe before any context exists');
}

engine.ensureContext();
const ctx = (engine as unknown as { ctx: MockAudioContext }).ctx;
expect(!!ctx && ctx.state === 'running', 'mock context created and running');

{
  const p = engine.audioProbe();
  expect(Math.abs(p.sfxBus - 1) < 1e-6 && Math.abs(p.musicBus - 0.34) < 1e-6, `bus gains exposed (sfx ${p.sfxBus}, music ${p.musicBus})`);
}

engine.startMusic('neon');
{
  const p = engine.audioProbe();
  expect(!!p.musicLayers && Math.abs(p.musicLayers.base - 0.5) < 1e-6 && Math.abs(p.musicLayers.intense) < 1e-6, `music layers exposed (base ${p.musicLayers?.base}, intense ${p.musicLayers?.intense})`);
}
expect(Math.abs(engine.audioProbe().musicIntensity) < 1e-6, 'music intensity starts at 0');

// OVERTAKE chime: instant attack, exponential decay visible across virtual time
{
  const fireTime = ctx.now;
  engine.overtake();
  const taps = engine.audioProbe().events.filter((e) => e.name === 'overtake');
  expect(taps.length >= 2, `overtake taps registered (${taps.length})`);
  const first = taps.filter((t) => t.start === fireTime);
  const peak = Math.max(...first.map((t) => t.gain));
  expect(peak >= 0.15, `overtake attack reaches vol (peak ${peak.toFixed(3)})`);
  ctx.now += 0.04;
  const mid = Math.max(...engine.audioProbe().events.filter((e) => e.name === 'overtake' && e.start === fireTime).map((t) => t.gain));
  expect(mid < peak * 0.25 && mid > 0, `overtake decay in progress (mid ${mid.toFixed(4)} < 25% of peak)`);
  ctx.now += 0.2;
  const end = Math.max(...engine.audioProbe().events.filter((e) => e.name === 'overtake').map((t) => t.gain));
  expect(end < 0.005, `overtake envelope finished (end ${end.toFixed(5)})`);
}

// GO stinger: noise burst + 2 blips, all wired
{
  const fireTime = ctx.now;
  engine.goStinger();
  const taps = engine.audioProbe().events.filter((e) => e.name === 'go');
  expect(taps.length >= 3, `go stinger taps registered (${taps.length})`);
  const first = taps.filter((t) => t.start === fireTime);
  const peak = Math.max(...first.map((t) => t.gain));
  expect(peak >= 0.3, `go stinger attack reaches vol (peak ${peak.toFixed(3)})`);
  ctx.now += 0.6;
  const end = Math.max(...engine.audioProbe().events.filter((e) => e.name === 'go').map((t) => t.gain));
  expect(end < 0.005, `go stinger envelope finished (end ${end.toFixed(5)})`);
}

// Crowd swell: linear attack, brief hold at vol, exponential release
{
  engine.crowd(1.2, 0.09);
  const start = engine.audioProbe().events.filter((e) => e.name === 'crowd').pop();
  expect(!!start && start.gain <= 0.001, `crowd starts silent (start ${start?.gain.toFixed(5)})`);
  ctx.now += 0.15;
  const mid = engine.audioProbe().events.filter((e) => e.name === 'crowd').pop();
  expect(!!mid && mid.gain > 0.01, `crowd attack audible (mid ${mid?.gain.toFixed(4)})`);
  ctx.now += 0.46;
  const hold = engine.audioProbe().events.filter((e) => e.name === 'crowd').pop();
  expect(!!hold && hold.gain >= 0.08, `crowd reaches swell vol (hold ${hold?.gain.toFixed(4)})`);
  ctx.now += 0.9;
  const end = engine.audioProbe().events.filter((e) => e.name === 'crowd').pop();
  expect(!!end && end.gain < 0.005, `crowd release complete (end ${end?.gain.toFixed(5)})`);
}

// Music intensity layer: kick raises it, layers move, decay after kick expires
{
  const baseBefore = engine.audioProbe().musicLayers!;
  engine.musicKick(3);
  const kicked = engine.audioProbe().musicIntensity;
  expect(kicked >= 0.7, `musicKick raises intensity (intensity ${kicked.toFixed(2)})`);
  for (let i = 0; i < 12; i++) {
    engine.setSpeedIntensity(0.4, false);
    ctx.now += 0.1;
  }
  const p = engine.audioProbe();
  expect(p.musicIntensity >= 0.85, `intensity climbs while kicked (intensity ${p.musicIntensity.toFixed(3)})`);
  expect(p.musicLayers!.intense > 0.25, `intense layer gain rises (${p.musicLayers!.intense.toFixed(3)})`);
  expect(p.musicLayers!.base < baseBefore.base - 0.1, `base layer gain falls (${p.musicLayers!.base.toFixed(3)})`);
  const peakIntense = p.musicLayers!.intense;
  ctx.now += 3;
  for (let i = 0; i < 20; i++) {
    engine.setSpeedIntensity(0.2, false);
    ctx.now += 0.1;
  }
  const after = engine.audioProbe();
  expect(after.musicIntensity < 0.7, `intensity decays after kick expires (intensity ${after.musicIntensity.toFixed(3)})`);
  expect(after.musicLayers!.intense < peakIntense, `intense layer falls back (intense ${after.musicLayers!.intense.toFixed(3)} < ${peakIntense.toFixed(3)})`);
}

// SFX mute gating is visible through the probe
{
  engine.setSfxEnabled(false);
  const muted = engine.audioProbe().sfxBus;
  engine.setSfxEnabled(true);
  const unmuted = engine.audioProbe().sfxBus;
  expect(muted === 0 && unmuted === 1, `sfx bus gating visible (muted ${muted}, unmuted ${unmuted})`);
}

// Tap ring buffer stays bounded
{
  for (let i = 0; i < 20; i++) engine.overtake();
  const n = engine.audioProbe().events.length;
  expect(n <= 12, `probe tap buffer bounded (${n} <= 12)`);
}

// ---------- v8 P7: audio 2.0 ----------

// Engine not yet started: engine/slip introspection is null-safe.
{
  const p = engine.audioProbe();
  expect(p.engine === null && p.slip === null, `engine/slip probes null before startEngine (engine ${String(p.engine)}, slip ${String(p.slip)})`);
  expect(p.limiter === true, `master limiter in chain (limiter ${String(p.limiter)})`);
}

// Per-body engine timbre: same drive inputs, distinct voice params + converged filter cutoff
{
  engine.startEngine('standard');
  const voices = ['standard', 'aero', 'tank'] as const;
  const filterHz: Record<string, number> = {};
  for (const v of voices) {
    engine.setEngineBody(v);
    const before = engine.audioProbe().engine!;
    expect(before.voice === v, `engine voice applied (${v})`);
    if (v === 'standard') expect(before.osc1 === 'sawtooth' && before.osc2 === 'square' && Math.abs(before.sub - 0.5) < 1e-6, `standard voice neutral (osc1 ${before.osc1}, osc2 ${before.osc2}, sub ${before.sub.toFixed(2)})`);
    if (v === 'aero') expect(before.osc1 === 'sawtooth' && before.osc2 === 'sawtooth' && before.sub < 0.5, `aero voice brighter blend (osc2 ${before.osc2}, sub ${before.sub.toFixed(2)})`);
    if (v === 'tank') expect(before.osc1 === 'square' && before.osc2 === 'square' && before.sub > 0.5, `tank voice deeper blend (osc1 ${before.osc1}, sub ${before.sub.toFixed(2)})`);
    expect(Math.abs(before.cutoffMul - { standard: 1, aero: 1.3, tank: 0.75 }[v]) < 1e-6, `${v} cutoff multiplier pinned (${before.cutoffMul})`);
    engine.updateEngine(0.5, 1, false);
    ctx.now += 0.4; // ≫ 50ms filter time constant → converged
    filterHz[v] = engine.audioProbe().engine!.filterHz;
  }
  expect(filterHz.aero / filterHz.standard > 1.25 && filterHz.aero / filterHz.standard < 1.35, `aero cutoff brighter (aero ${filterHz.aero.toFixed(0)}Hz / std ${filterHz.standard.toFixed(0)}Hz = ${(filterHz.aero / filterHz.standard).toFixed(2)})`);
  expect(filterHz.tank / filterHz.standard > 0.7 && filterHz.tank / filterHz.standard < 0.8, `tank cutoff deeper (tank ${filterHz.tank.toFixed(0)}Hz = ${(filterHz.tank / filterHz.standard).toFixed(2)} of std)`);
}

// Slip screech: envelope attacks with slip, releases to near-zero
{
  const p0 = engine.audioProbe().slip!;
  expect(p0.gain < 0.001, `slip layer silent at rest (gain ${p0.gain.toFixed(4)})`);
  engine.setSlip(1);
  ctx.now += 0.5; // ≫ 80ms attack tc
  const up = engine.audioProbe().slip!;
  expect(up.gain > 0.05 && up.gain <= AUDIO_CEILINGS.slip, `slip attack reaches level (gain ${up.gain.toFixed(4)} ≤ cap ${AUDIO_CEILINGS.slip})`);
  expect(up.level === 1, `slip commanded level exposed (level ${up.level})`);
  engine.setSlip(0);
  ctx.now += 0.8; // ≫ 200ms release tc
  const down = engine.audioProbe().slip!;
  expect(down.gain < 0.005, `slip release complete (gain ${down.gain.toFixed(5)})`);
}

// Near-miss whoosh: fires, sweeps, decays within ~0.3s
{
  engine.nearMissWhoosh();
  let taps = engine.audioProbe().events.filter((e) => e.name === 'whoosh');
  expect(taps.length === 1, `whoosh tap registered (${taps.length})`);
  const peak = taps[0].gain;
  expect(peak >= 0.1 && peak <= AUDIO_CEILINGS.oneShot, `whoosh subtle level (peak ${peak.toFixed(3)})`);
  ctx.now += 0.4;
  taps = engine.audioProbe().events.filter((e) => e.name === 'whoosh');
  expect(taps[0].gain < 0.005, `whoosh decayed (end ${taps[0].gain.toFixed(5)})`);
}

// Collision thud: low sine thump + noise crunch, both on the crash() hook
{
  engine.crash();
  const thud = engine.audioProbe().events.filter((e) => e.name === 'thud');
  const crunch = engine.audioProbe().events.filter((e) => e.name === 'crash');
  expect(thud.length === 1 && crunch.length === 1, `crash taps registered (thud ${thud.length}, crunch ${crunch.length})`);
  expect(thud[0].gain >= 0.4 && thud[0].gain <= AUDIO_CEILINGS.oneShot, `thud level (peak ${thud[0].gain.toFixed(3)})`);
  ctx.now += 0.6;
  const after = engine.audioProbe().events.filter((e) => e.name === 'thud' || e.name === 'crash');
  expect(after.every((e) => e.gain < 0.005), `crash envelope finished (max ${Math.max(...after.map((e) => e.gain)).toFixed(5)})`);
}

// Daily + weekly fanfares: fire distinctly, both ≤ 1.5s, levels within ceiling
{
  engine.dailyFanfare();
  const daily = engine.audioProbe().events.filter((e) => e.name === 'daily');
  expect(daily.length === 3, `daily fanfare taps (${daily.length})`);
  const dailySpan = daily[2].start + daily[2].dur - daily[0].start;
  expect(dailySpan <= 1.5, `daily fanfare ≤1.5s (span ${dailySpan.toFixed(2)}s)`);
  ctx.now += 0.25; // past all daily onsets → live envelopes
  const dailyPeak = Math.max(...engine.audioProbe().events.filter((e) => e.name === 'daily').map((e) => e.gain));
  expect(dailyPeak > 0.03 && dailyPeak <= AUDIO_CEILINGS.oneShot, `daily fanfare level within ceiling (peak ${dailyPeak.toFixed(3)} ≤ ${AUDIO_CEILINGS.oneShot})`);
  engine.weeklyFanfare();
  const weekly = engine.audioProbe().events.filter((e) => e.name === 'weekly');
  expect(weekly.length === 4, `weekly fanfare taps (${weekly.length})`);
  const weeklySpan = weekly[3].start + weekly[3].dur - weekly[0].start;
  expect(weeklySpan <= 1.5, `weekly fanfare ≤1.5s (span ${weeklySpan.toFixed(2)}s)`);
  expect(Math.abs(weeklySpan - dailySpan) > 0.1, `fanfares distinct contours (daily ${dailySpan.toFixed(2)}s vs weekly ${weeklySpan.toFixed(2)}s)`);
  ctx.now += 0.45; // past all weekly onsets
  const weeklyPeak = Math.max(...engine.audioProbe().events.filter((e) => e.name === 'weekly').map((e) => e.gain));
  expect(weeklyPeak > 0.03 && weeklyPeak <= AUDIO_CEILINGS.oneShot, `weekly fanfare level within ceiling (peak ${weeklyPeak.toFixed(3)} ≤ ${AUDIO_CEILINGS.oneShot})`);
  ctx.now += 1.2;
  const done = engine.audioProbe().events.filter((e) => e.name === 'daily' || e.name === 'weekly');
  expect(done.every((e) => e.gain < 0.005), `fanfares decayed (max ${Math.max(...done.map((e) => e.gain)).toFixed(5)})`);
}

// Gain ceilings: no bus or continuous layer exceeds its cap
{
  engine.updateEngine(0.95, 1, false);
  ctx.now += 0.5;
  const g = engine.audioProbe().gains;
  const c = engine.audioProbe().ceilings;
  expect(g.master > 0 && g.master <= c.master, `master within cap (${g.master.toFixed(2)} ≤ ${c.master})`);
  expect(g.sfx <= c.sfxBus, `sfx bus within cap (${g.sfx} ≤ ${c.sfxBus})`);
  expect(g.music <= c.musicBus, `music bus within cap (${g.music} ≤ ${c.musicBus})`);
  expect(g.engine > 0 && g.engine <= c.engine, `engine layer within cap (${g.engine.toFixed(3)} ≤ ${c.engine})`);
  expect(g.wind >= 0 && g.wind <= c.wind, `wind layer within cap (${g.wind.toFixed(3)} ≤ ${c.wind})`);
  expect(g.musicBase <= c.musicLayer && g.musicIntense <= c.musicLayer, `music layers within cap (${g.musicBase.toFixed(2)}, ${g.musicIntense.toFixed(2)} ≤ ${c.musicLayer})`);
}

engine.stopMusic();
console.log(`\n${checks - failures}/${checks} audio-probe checks passed`);
if (failures > 0) process.exit(1);
