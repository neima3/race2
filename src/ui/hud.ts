import { el, formatTime, formatTimePrecise } from './common';
import type { CheckpointEvent, FinishResult } from '../game/race';

export class HUD {
  readonly root: HTMLElement;
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
  private toastTimer: number | null = null;
  private countdownNum: HTMLElement | null = null;
  private progressTrack: HTMLElement;
  private progressPlayer: HTMLElement;
  private progressGhost: HTMLElement;
  private progressTicks: HTMLElement;

  constructor() {
    this.root = el('div', 'hud hidden');

    const topBar = el('div', 'hud-top');
    this.trackNameEl = el('div', 'hud-track-name');
    const timerWrap = el('div', 'hud-timer-wrap');
    this.timerEl = el('div', 'hud-timer', '0:00.000');
    this.bestEl = el('div', 'hud-best');
    this.liveDeltaEl = el('div', 'hud-live-delta');
    timerWrap.append(this.timerEl, this.bestEl, this.liveDeltaEl);
    const cpWrap = el('div', 'hud-cp-wrap');
    this.cpEl = el('div', 'hud-cp');
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
    this.progressGhost = el('div', 'progress-dot ghost');
    this.progressPlayer = el('div', 'progress-dot player');
    this.progressTrack.append(this.progressTicks, this.progressGhost, this.progressPlayer);

    this.centerEl = el('div', 'hud-center');
    this.splitToast = el('div', 'hud-split-toast');
    this.respawnHint = el('div', 'hud-respawn-hint', 'OFF TRACK &mdash; RESPAWN &#8634; / X');

    this.root.append(topBar, bottomBar, this.progressTrack, this.centerEl, this.splitToast, this.respawnHint);
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
    this.progressGhost.style.left = '0%';
    this.progressGhost.style.display = 'none';
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  update(elapsedMs: number, speedKmh: number, drift: boolean, cpDone: number, cpTotal: number, liveDelta: number | null): void {
    this.timerEl.textContent = formatTimePrecise(elapsedMs);
    this.speedEl.textContent = String(Math.round(speedKmh));
    this.cpEl.textContent = `CP ${cpDone}/${cpTotal}`;
    this.driftEl.classList.toggle('active', drift);
    if (liveDelta === null) {
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

  updateProgress(playerRatio: number, ghostRatio: number | null): void {
    this.progressPlayer.style.left = `${Math.min(100, Math.max(0, playerRatio * 100))}%`;
    if (ghostRatio === null) {
      this.progressGhost.style.display = 'none';
    } else {
      this.progressGhost.style.display = 'block';
      this.progressGhost.style.left = `${Math.min(100, Math.max(0, ghostRatio * 100))}%`;
    }
  }

  showRespawnHint(show: boolean): void {
    this.respawnHint.classList.toggle('show', show);
  }

  showFinish(result: FinishResult): void {
    const medalClass = result.medal === 'none' ? '' : `medal-banner-${result.medal}`;
    const label = result.medal === 'none' ? 'FINISHED' : `${result.medal.toUpperCase()} MEDAL`;
    this.centerEl.innerHTML = `<div class="finish-flash ${medalClass}">${label}</div>`;
  }
}
