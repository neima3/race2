import { el, formatTime, formatTimePrecise } from './common';
import type { CheckpointEvent, FinishResult } from '../game/race';
import type { Standing } from '../game/rivals';
import type { TrackCurve } from '../track/curve';
import { Minimap } from './minimap';

function cssHex(paint: number): string {
  return '#' + paint.toString(16).padStart(6, '0');
}

/** Mirror of systems/traffic NEAR_MISS_MAX_CREDITED — display-only cap for the counter. */
const NEAR_MISS_DISPLAY_CAP = 5;

export class HUD {
  readonly root: HTMLElement;
  readonly minimap: Minimap;
  private timerEl: HTMLElement;
  private speedEl: HTMLElement;
  private speedUnitEl: HTMLElement;
  private trackNameEl: HTMLElement;
  private cpEl: HTMLElement;
  private centerEl: HTMLElement;
  private splitToast: HTMLElement;
  private bestEl: HTMLElement;
  private driftEl: HTMLElement;
  private respawnHint: HTMLElement;
  private liveDeltaEl: HTMLElement;
  private ghostTagEl: HTMLElement;
  private ghostDeltasEl: HTMLElement;
  private ghostDeltaRows: { root: HTMLElement; label: HTMLElement; value: HTMLElement }[] = [];
  private battleRankEl: HTMLElement;
  private lapEl: HTMLElement;
  private nearMissEl: HTMLElement;
  private toastTimer: number | null = null;
  private countdownNum: HTMLElement | null = null;
  driftPoints = 0;
  private driftModeEl: HTMLElement | null = null;
  private driftMode = false;
  private driftBest = 0;
  private progressTrack: HTMLElement;
  private progressPlayer: HTMLElement;
  private progressGhostDots: HTMLElement[] = [];
  private progressTicks: HTMLElement;
  private posWrap: HTMLElement;
  private posNumEl: HTMLElement;
  private posTotalEl: HTMLElement;
  private posFlashEl: HTMLElement;
  private standingsEl: HTMLElement;
  private standRows: { root: HTMLElement; pos: HTMLElement; dot: HTMLElement; name: HTMLElement; gap: HTMLElement }[] = [];
  private ctxHintEl: HTMLElement;
  private ctxHintTimer: number | null = null;
  private tutBannerEl: HTMLElement;
  private tutTitleEl: HTMLElement;
  private tutHintEl: HTMLElement;
  private tutProgressEl: HTMLElement;
  private tutSkipBtn: HTMLElement;
  private lastRivalPos = 0;

  constructor() {
    this.root = el('div', 'hud hidden');

    const topBar = el('div', 'hud-top');
    this.trackNameEl = el('div', 'hud-track-name');
    const timerWrap = el('div', 'hud-timer-wrap');
    this.timerEl = el('div', 'hud-timer', '0:00.000');
    this.bestEl = el('div', 'hud-best');
    this.liveDeltaEl = el('div', 'hud-live-delta');
    this.ghostTagEl = el('div', 'hud-ghost-tag hidden');
    this.ghostDeltasEl = el('div', 'hud-ghost-deltas');
    for (let i = 0; i < 3; i++) {
      const root = el('div', 'hud-ghost-delta hidden');
      const label = el('span', 'gd-label');
      const value = el('span', 'gd-value');
      root.append(label, value);
      this.ghostDeltasEl.append(root);
      this.ghostDeltaRows.push({ root, label, value });
    }
    this.battleRankEl = el('div', 'hud-battle-rank hidden');
    this.posWrap = el('div', 'hud-pos-wrap');
    this.posFlashEl = el('div', 'hud-pos-flash');
    const posLine = el('div', 'hud-pos');
    this.posNumEl = el('span', 'hud-pos-num', '4');
    this.posTotalEl = el('span', 'hud-pos-total', '/4');
    posLine.append(this.posNumEl, this.posTotalEl);
    this.posWrap.append(this.posFlashEl, posLine);
    timerWrap.append(this.timerEl, this.bestEl, this.liveDeltaEl, this.ghostDeltasEl, this.ghostTagEl, this.battleRankEl, this.posWrap);
    const cpWrap = el('div', 'hud-cp-wrap');
    this.cpEl = el('div', 'hud-cp');
    this.lapEl = el('div', 'hud-lap hidden');
    this.nearMissEl = el('div', 'hud-nearmiss hidden');
    cpWrap.append(this.lapEl, this.cpEl, this.nearMissEl);
    topBar.append(this.trackNameEl, timerWrap, cpWrap);

    this.speedEl = el('div', 'hud-speed', '0');
    this.speedUnitEl = el('div', 'hud-speed-unit', 'km/h');
    const speedWrap = el('div', 'hud-speed-wrap');
    speedWrap.append(this.speedEl, this.speedUnitEl);

    this.driftEl = el('div', 'hud-drift', 'DRIFT');

    const bottomBar = el('div', 'hud-bottom');
    bottomBar.append(this.driftEl, speedWrap);

    this.progressTrack = el('div', 'progress-track');
    this.progressTicks = el('div', 'progress-ticks');
    for (let i = 0; i < 3; i++) {
      const dot = el('div', 'progress-dot ghost');
      this.progressGhostDots.push(dot);
    }
    this.progressPlayer = el('div', 'progress-dot player');
    this.progressTrack.append(this.progressTicks, ...this.progressGhostDots, this.progressPlayer);

    this.centerEl = el('div', 'hud-center');
    this.splitToast = el('div', 'hud-split-toast');
    this.respawnHint = el('div', 'hud-respawn-hint', 'OFF TRACK &mdash; RESPAWN &#8634; / X');

    this.standingsEl = el('div', 'hud-standings');
    for (let i = 0; i < 4; i++) {
      const row = el('div', 'standing-row');
      const pos = el('span', 'sr-pos');
      const dot = el('span', 'sr-dot');
      const name = el('span', 'sr-name');
      const gap = el('span', 'sr-gap');
      row.append(pos, dot, name, gap);
      this.standingsEl.append(row);
      this.standRows.push({ root: row, pos, dot, name, gap });
    }

    this.minimap = new Minimap();

    this.ctxHintEl = el('div', 'hud-ctx-hint');

    this.tutBannerEl = el('div', 'hud-tut-banner hidden');
    this.tutTitleEl = el('div', 'tut-title');
    this.tutHintEl = el('div', 'tut-hint');
    this.tutProgressEl = el('div', 'tut-progress');
    this.tutBannerEl.append(this.tutTitleEl, this.tutHintEl, this.tutProgressEl);
    this.tutSkipBtn = el('button', 'hud-tut-skip hidden', 'SKIP TUTORIAL');
    this.tutSkipBtn.addEventListener('click', () => this.onSkipTutorial());

    this.root.append(topBar, bottomBar, this.progressTrack, this.centerEl, this.splitToast, this.respawnHint, this.standingsEl, this.ctxHintEl, this.tutBannerEl, this.tutSkipBtn, this.minimap.root);
  }

  onSkipTutorial: () => void = () => {};

  setTutorialBanner(title: string, hint: string): void {
    this.tutTitleEl.textContent = title;
    this.tutHintEl.textContent = hint;
  }

  setTutorialProgress(text: string | null): void {
    this.tutProgressEl.textContent = text ?? '';
    this.tutProgressEl.classList.toggle('hidden', text === null);
  }

  showTutorial(on: boolean): void {
    this.tutBannerEl.classList.toggle('hidden', !on);
    this.tutSkipBtn.classList.toggle('hidden', !on);
    if (!on) this.setTutorialProgress(null);
  }

  showContextHint(text: string): void {
    this.ctxHintEl.textContent = text;
    this.ctxHintEl.classList.add('show');
    if (this.ctxHintTimer !== null) clearTimeout(this.ctxHintTimer);
    this.ctxHintTimer = window.setTimeout(() => this.ctxHintEl.classList.remove('show'), 4000);
  }

  setDriftMode(on: boolean, best: number): void {
    this.driftMode = on;
    this.driftBest = best;
    if (on && !this.driftModeEl) {
      this.driftModeEl = el('div', 'hud-driftmode');
      this.root.append(this.driftModeEl);
    }
    if (this.driftModeEl) {
      this.driftModeEl.classList.toggle('hidden', !on);
      if (on) this.driftModeEl.innerHTML = `<div class="dm-title">DRIFT ATTACK</div><div class="dm-score" id="dm-score">0</div><div class="dm-best">BEST ${Math.round(best)}</div>`;
    }
    if (on) {
      this.timerEl.style.visibility = 'hidden';
      this.bestEl.style.visibility = 'hidden';
    } else {
      this.timerEl.style.visibility = '';
      this.bestEl.style.visibility = '';
    }
  }

  updateDriftScore(score: number): void {
    if (!this.driftMode) return;
    const elScore = document.getElementById('dm-score');
    if (elScore) elScore.textContent = String(Math.round(score));
  }

  setGhostTag(tag: string | null): void {
    if (tag === null) {
      this.ghostTagEl.classList.add('hidden');
      this.ghostTagEl.textContent = '';
    } else {
      this.ghostTagEl.textContent = tag;
      this.ghostTagEl.classList.remove('hidden');
    }
  }

  /** How many per-ghost delta chips are in play this race (0-3). */
  setGhostDeltaCount(n: number): void {
    for (let i = 0; i < this.ghostDeltaRows.length; i++) {
      this.ghostDeltaRows[i].root.classList.toggle('hidden', i >= n);
      if (i >= n) {
        this.ghostDeltaRows[i].label.textContent = '';
        this.ghostDeltaRows[i].value.textContent = '';
      }
    }
  }

  setGhostDelta(index: number, label: string, cssColor: string, deltaMs: number | null): void {
    const row = this.ghostDeltaRows[index];
    if (!row) return;
    if (this.driftMode || deltaMs === null) {
      row.root.classList.add('hidden');
      return;
    }
    row.root.classList.remove('hidden');
    row.label.textContent = label;
    row.label.style.color = cssColor;
    row.value.textContent = `${deltaMs <= 0 ? '−' : '+'}${(Math.abs(deltaMs) / 1000).toFixed(2)}`;
    row.value.classList.toggle('ahead', deltaMs <= 0);
    row.value.classList.toggle('behind', deltaMs > 0);
  }

  setBattleRank(rank: { rank: number; of: number } | null): void {
    if (!rank || rank.of < 2) {
      this.battleRankEl.classList.add('hidden');
      return;
    }
    const ords = ['1ST', '2ND', '3RD', '4TH'];
    this.battleRankEl.textContent = `${ords[rank.rank - 1] ?? `${rank.rank}TH`} OF ${rank.of}`;
    this.battleRankEl.classList.remove('hidden');
  }

  show(trackName: string, bestMs: number | null, cpTotal: number, cpDists: number[] = [], trackLen = 1): void {
    this.trackNameEl.textContent = trackName;
    this.bestEl.textContent = bestMs != null ? `PB ${formatTimePrecise(bestMs)}` : '';
    this.cpEl.textContent = `CP 0/${cpTotal}`;
    this.timerEl.textContent = '0:00.000';
    this.speedEl.textContent = '0';
    this.progressTicks.replaceChildren();
    for (const d of cpDists) {
      const tick = el('div', 'progress-tick');
      tick.style.left = `${(d / trackLen) * 100}%`;
      this.progressTicks.append(tick);
    }
    this.progressPlayer.style.left = '0%';
    for (const dot of this.progressGhostDots) {
      dot.style.left = '0%';
      dot.style.display = 'none';
    }
    this.lastRivalPos = 0;
    this.posNumEl.textContent = '–';
    this.posFlashEl.classList.remove('show', 'up', 'down');
    this.battleRankEl.classList.add('hidden');
    this.setGhostDeltaCount(0);
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setPlayerPaint(paint: number): void {
    this.standingsEl.style.setProperty('--player-accent', cssHex(paint));
    this.minimap.setPlayerPaint(paint);
  }

  setMinimapTrack(curve: TrackCurve, accent: number): void {
    this.minimap.setTrack(curve, accent);
  }

  showRivalHUD(): void {
    this.root.classList.add('rivals');
  }

  hideRivalHUD(): void {
    this.root.classList.remove('rivals');
  }

  updateRivals(order: Standing[], reducedMotion: boolean): void {
    if (order.length === 0) return;
    const pos = order.findIndex((s) => s.isPlayer) + 1;
    this.posNumEl.textContent = String(pos > 0 ? pos : order.length);
    this.posTotalEl.textContent = `/${order.length}`;
    if (this.lastRivalPos > 0 && pos !== this.lastRivalPos && pos > 0 && !reducedMotion) {
      const up = pos < this.lastRivalPos;
      this.posFlashEl.textContent = `${up ? '\u25b2' : '\u25bc'} P${pos}`;
      this.posFlashEl.classList.remove('show', 'up', 'down');
      void this.posFlashEl.offsetWidth;
      this.posFlashEl.classList.add(up ? 'up' : 'down', 'show');
    }
    this.lastRivalPos = pos;
    for (let i = 0; i < order.length && i < this.standRows.length; i++) {
      const s = order[i];
      const row = this.standRows[i];
      row.pos.textContent = String(i + 1);
      row.name.textContent = s.name;
      row.gap.textContent = s.eliminated ? 'OUT' : i === 0 ? '' : `+${Math.round(s.gapMeters)}m`;
      row.dot.style.background = cssHex(s.paint);
      row.root.classList.toggle('you', s.isPlayer);
      row.root.classList.toggle('out', s.eliminated === true);
      this.standingsEl.append(row.root);
    }
  }

  update(elapsedMs: number, speedKmh: number, drift: boolean, cpDone: number, cpTotal: number, liveDelta: number | null): void {
    this.timerEl.textContent = formatTimePrecise(elapsedMs);
    this.speedEl.textContent = String(Math.round(speedKmh));
    this.cpEl.textContent = `CP ${cpDone}/${cpTotal}`;
    this.driftEl.classList.toggle('active', drift);
    if (drift) {
      this.driftEl.textContent = this.driftMode
        ? `DRIFT ${Math.round(this.driftPoints)} / ${this.driftBest}`
        : `DRIFT +${Math.round(this.driftPoints)}`;
    }
    if (liveDelta === null || this.driftMode) {
      this.liveDeltaEl.textContent = '';
      this.liveDeltaEl.classList.remove('ahead', 'behind');
    } else {
      const sign = liveDelta <= 0 ? '−' : '+';
      this.liveDeltaEl.textContent = `${sign}${(Math.abs(liveDelta) / 1000).toFixed(2)}`;
      this.liveDeltaEl.classList.toggle('ahead', liveDelta <= 0);
      this.liveDeltaEl.classList.toggle('behind', liveDelta > 0);
    }
  }

  setCountdown(label: string, cls: string): void {
    if (this.countdownNum) this.countdownNum.remove();
    this.countdownNum = el('div', `countdown ${cls}`, label);
    this.centerEl.append(this.countdownNum);
    void this.countdownNum.offsetWidth;
    this.countdownNum.classList.add('pop');
  }

  clearCenter(): void {
    this.centerEl.replaceChildren();
    this.countdownNum = null;
  }

  showSplit(ev: CheckpointEvent): void {
    const deltaHtml =
      ev.deltaMs === null
        ? ''
        : `<div class="split-delta ${ev.deltaMs <= 0 ? 'ahead' : 'behind'}">${ev.deltaMs <= 0 ? '−' : '+'}${(Math.abs(ev.deltaMs) / 1000).toFixed(3)}</div>`;
    this.splitToast.innerHTML = `<div class="split-time">${formatTime(ev.splitMs)}</div><div class="split-cp">CP ${ev.index + 1}/${ev.total}</div>${deltaHtml}`;
    this.splitToast.classList.remove('show');
    void this.splitToast.offsetWidth;
    this.splitToast.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.splitToast.classList.remove('show'), 1600);
  }

  /** Ghost dot ratios indexed per ghost; null hides that dot. Pass a preallocated array. */
  updateProgress(playerRatio: number, ghostRatios: ArrayLike<number | null>): void {
    this.progressPlayer.style.left = `${Math.min(100, Math.max(0, playerRatio * 100))}%`;
    for (let i = 0; i < this.progressGhostDots.length; i++) {
      const dot = this.progressGhostDots[i];
      const r = ghostRatios[i];
      if (r == null) {
        dot.style.display = 'none';
      } else {
        dot.style.display = 'block';
        dot.style.left = `${Math.min(100, Math.max(0, r * 100))}%`;
      }
    }
  }

  setLapCounter(text: string | null): void {
    if (text === null) {
      this.lapEl.classList.add('hidden');
    } else {
      this.lapEl.textContent = text;
      this.lapEl.classList.remove('hidden');
    }
  }

  showNearMissCounter(on: boolean): void {
    this.nearMissEl.classList.toggle('hidden', !on);
    if (on) this.nearMissEl.textContent = 'NEAR MISS 0';
  }

  setNearMisses(n: number): void {
    if (this.nearMissEl.classList.contains('hidden')) return;
    this.nearMissEl.textContent = `NEAR MISS ${n >= NEAR_MISS_DISPLAY_CAP ? NEAR_MISS_DISPLAY_CAP + '+' : n}`;
    this.nearMissEl.classList.remove('bump');
    void this.nearMissEl.offsetWidth;
    this.nearMissEl.classList.add('bump');
  }

  showNearMissFlash(): void {
    this.showSplash('NEAR MISS', 'splash-nearmiss');
  }

  showRespawnHint(show: boolean): void {
    this.respawnHint.classList.toggle('show', show);
  }

  showFinish(result: FinishResult): void {
    const medalClass = result.medal === 'none' ? '' : `medal-banner-${result.medal}`;
    const label = result.medal === 'none' ? 'FINISHED' : `${result.medal.toUpperCase()} MEDAL`;
    this.centerEl.innerHTML = `<div class="finish-flash ${medalClass}">${label}</div>`;
  }

  showSplash(text: string, cls: string): void {
    const splash = el('div', `finish-flash ${cls}`, text);
    this.centerEl.replaceChildren();
    this.centerEl.append(splash);
    window.setTimeout(() => splash.remove(), 2400);
  }
}
