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
  private toastTimer: number | null = null;
  private countdownNum: HTMLElement | null = null;

  constructor() {
    this.root = el('div', 'hud hidden');

    const topBar = el('div', 'hud-top');
    this.trackNameEl = el('div', 'hud-track-name');
    const timerWrap = el('div', 'hud-timer-wrap');
    this.timerEl = el('div', 'hud-timer', '0:00.000');
    this.bestEl = el('div', 'hud-best');
    timerWrap.append(this.timerEl, this.bestEl);
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

    this.centerEl = el('div', 'hud-center');
    this.splitToast = el('div', 'hud-split-toast');

    this.root.append(topBar, bottomBar, this.centerEl, this.splitToast);
  }

  show(trackName: string, bestMs: number | null, cpTotal: number): void {
    this.trackNameEl.textContent = trackName;
    this.bestEl.textContent = bestMs != null ? `PB ${formatTimePrecise(bestMs)}` : '';
    this.cpEl.textContent = `CP 0/${cpTotal}`;
    this.timerEl.textContent = '0:00.000';
    this.speedEl.textContent = '0';
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  update(elapsedMs: number, speedKmh: number, drift: boolean, cpDone: number, cpTotal: number): void {
    this.timerEl.textContent = formatTimePrecise(elapsedMs);
    this.speedEl.textContent = String(Math.round(speedKmh));
    this.cpEl.textContent = `CP ${cpDone}/${cpTotal}`;
    this.driftEl.classList.toggle('active', drift);
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
    this.splitToast.innerHTML = `<div class="split-time">${formatTime(ev.splitMs)}</div>`;
    this.splitToast.classList.remove('show');
    void this.splitToast.offsetWidth;
    this.splitToast.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.splitToast.classList.remove('show'), 1600);
  }

  showFinish(result: FinishResult): void {
    const medalClass = result.medal === 'none' ? '' : `medal-banner-${result.medal}`;
    const label = result.medal === 'none' ? 'FINISHED' : `${result.medal.toUpperCase()} MEDAL`;
    this.centerEl.innerHTML = `<div class="finish-flash ${medalClass}">${label}</div>`;
  }
}
