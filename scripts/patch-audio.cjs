const fs = require('fs');

let src = fs.readFileSync('src/core/audio.ts', 'utf8');
const start = src.indexOf('  startMusic(): void {');
const endMarker = '    this.musicTimer = window.setInterval(tick, 120);';
const endIdx = src.indexOf(endMarker);
if (start < 0 || endIdx < 0) {
  console.log('markers not found', start, endIdx);
  process.exit(1);
}
const end = src.indexOf('\n', endIdx + endMarker.length);
const newBlock = [
  "  startMusic(theme: MusicTheme = 'neon'): void {",
  '    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;',
  '    const ctx = this.ctx;',
  '    const pattern = getPattern(theme);',
  '    const stepDur = 60 / pattern.bpm / 4;',
  '    this.musicStep = 0;',
  '    this.musicNextTime = ctx.currentTime + 0.1;',
  '',
  '    const playNote = (freq: number, when: number, dur: number, type: OscillatorType, vol: number, layer: 0 | 1 = 0) => {',
  '      const osc = ctx.createOscillator();',
  '      osc.type = type;',
  '      osc.frequency.value = freq;',
  '      const g = ctx.createGain();',
  '      g.gain.setValueAtTime(vol, when);',
  '      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);',
  '      osc.connect(g);',
  '      g.connect(this.musicLayers[layer]?.gain ?? this.musicGain!);',
  '      osc.start(when);',
  '      osc.stop(when + dur + 0.02);',
  '    };',
  '    const playPerc = (freq: number, when: number, dur: number, vol: number) => {',
  '      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur) || 1, ctx.sampleRate);',
  '      const data = buf.getChannelData(0);',
  '      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);',
  '      const srcNode = ctx.createBufferSource();',
  '      srcNode.buffer = buf;',
  '      const g = ctx.createGain();',
  '      g.gain.value = vol;',
  '      const hp = ctx.createBiquadFilter();',
  "      hp.type = 'highpass';",
  '      hp.frequency.value = freq;',
  '      srcNode.connect(hp);',
  '      hp.connect(g);',
  '      g.connect(this.musicLayers[1]?.gain ?? this.musicGain!);',
  '      srcNode.start(when);',
  '    };',
  '',
  '    const tick = () => {',
  '      if (!this.ctx || this.musicTimer === null) return;',
  '      while (this.musicNextTime < ctx.currentTime + 0.2) {',
  '        const s = this.musicStep % pattern.steps;',
  '        for (const b of pattern.bass) if (b.step === s) playNote(b.freq, this.musicNextTime, b.len * stepDur, b.type, b.vol, b.layer);',
  '        for (const l of pattern.lead) if (l.step === s) playNote(l.freq, this.musicNextTime, l.len * stepDur, l.type, l.vol, 1);',
  '        for (const p of pattern.perc) if (p.step === s) playPerc(p.freq, this.musicNextTime, p.len, p.vol);',
  '        this.musicNextTime += stepDur;',
  '        this.musicStep++;',
  '      }',
  '    };',
  '    tick();',
  '    this.musicTimer = window.setInterval(tick, 100);',
].join('\n');
src = src.slice(0, start) + newBlock + src.slice(end + endMarker.length);
src = src.replace("import { SaveManager } from './core/save';", "import { SaveManager } from './core/save';");
if (!src.includes("from './music'")) {
  src = src.replace("import { EventBus", "import { getPattern, type MusicTheme } from './music';\nimport { EventBus");
}
fs.writeFileSync('src/core/audio.ts', src);
console.log('replaced ok');
