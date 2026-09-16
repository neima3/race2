import * as THREE from 'three';
import { el, formatTime } from './common';
import type { GhostSample } from '../game/race';
import type { CameraMode } from '../render/camera';
import type { TrackVariant } from '../track/defs';

/**
 * Replay theater (v8 P8) — session replay buffer, deterministic sample lookup and
 * the bottom-overlay theater UI. Pure sample math lives here so playback and
 * scrubbing share ONE code path (scrub determinism) and headless tests can pin it.
 */

export interface ReplayEntry {
  trackId: string;
  samples: GhostSample[];
  timeMs: number;
  dateMs: number;
  /** Variant the lap was recorded under (undefined = day); non-day laps are not shareable. */
  variant?: TrackVariant;
  /** v9 P3: imported from a #r= friend link — watched directly, never shareable. */
  imported?: boolean;
}

const BUFFER_MAX = 5;

/** Ring buffer of the last 5 time-trial replays this session (oldest evicted first). */
export class ReplayBuffer {
  readonly entries: ReplayEntry[] = [];
  readonly max = BUFFER_MAX;

  push(entry: ReplayEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.max) this.entries.shift();
  }
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1] as const;

/** Auto-cuts default for a theater session: ON unless reduced-motion is set. */
export function defaultAutoCuts(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

/** Replay-only time scale: sample-time advances at `speed` ms per real ms. */
export function advanceReplayTime(tMs: number, dtMs: number, speed: number): number {
  return tMs + dtMs * speed;
}

export function clampReplayTime(tMs: number, startMs: number, endMs: number): number {
  return tMs < startMs ? startMs : tMs > endMs ? endMs : tMs;
}

export interface ReplayLookup {
  lo: number;
  hi: number;
  k: number;
}

/**
 * Binary-search the sample pair bracketing `t` — the same search/interpolation
 * shape as RaceController's ghost lookup, so any t maps to one deterministic transform.
 */
export function replayLookupAt(samples: GhostSample[], t: number, out: ReplayLookup): void {
  const n = samples.length;
  if (t <= samples[0].t) {
    out.lo = 0;
    out.hi = 1;
    out.k = 0;
    return;
  }
  if (t >= samples[n - 1].t) {
    out.lo = n - 2;
    out.hi = n - 1;
    out.k = 1;
    return;
  }
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid;
    else hi = mid;
  }
  out.lo = lo;
  out.hi = hi;
  out.k = (t - samples[lo].t) / Math.max(1, samples[hi].t - samples[lo].t);
}

const lookupScratch: ReplayLookup = { lo: 0, hi: 1, k: 0 };

/**
 * THE shared lookup used by playback, seek and the camera rig feed.
 * Writes pos/quat at `t` (clamped at both ends); when `outSpd` is given, also the
 * sample-space speed in m/s between the bracketing samples. Allocation-free.
 */
export function sampleReplayAt(
  samples: GhostSample[],
  t: number,
  outPos: THREE.Vector3,
  outQuat: THREE.Quaternion,
  outSpd?: { v: number },
): boolean {
  if (samples.length < 2) return false;
  replayLookupAt(samples, t, lookupScratch);
  const a = samples[lookupScratch.lo];
  const b = samples[lookupScratch.hi];
  outPos.copy(a.pos).lerp(b.pos, lookupScratch.k);
  outQuat.copy(a.quat).slerp(b.quat, lookupScratch.k);
  if (outSpd) {
    const dtS = Math.max(0.001, (b.t - a.t) / 1000);
    outSpd.v = a.pos.distanceTo(b.pos) / dtS;
  }
  return true;
}

interface TheaterOpts {
  trackName: string;
  totalMs: number;
  index: number;
  count: number;
  /** Title prefix — 'REPLAY' by default, 'FRIEND REPLAY' for imported #r= laps. */
  label?: string;
}

/**
 * Bottom-overlay theater bar. Owns no replay state — buttons raise callbacks and
 * main pushes state back via the setters. Keyboard: space play/pause, arrows ±2s,
 * 1/2/3 speeds, C camera, ESC exit (active only while shown; never touches InputManager).
 */
export class TheaterUI {
  readonly root: HTMLElement;
  onPlayToggle: () => void = () => {};
  onSeek: (tMs: number) => void = () => {};
  onSeekStep: (deltaMs: number) => void = () => {};
  onScrubEnd: () => void = () => {};
  onSpeed: (speed: number) => void = () => {};
  onCamera: () => void = () => {};
  onAutoCuts: (on: boolean) => void = () => {};
  onShare: () => void = () => {};
  onExit: () => void = () => {};
  onPrev: () => void = () => {};
  onNext: () => void = () => {};

  private bar: HTMLElement;
  private titleEl: HTMLElement;
  private timeEl: HTMLElement;
  private fillEl: HTMLElement;
  private dotEl: HTMLElement;
  private playBtn: HTMLElement;
  private camBtn: HTMLElement;
  private cutsBtn: HTMLElement;
  private shareBtn: HTMLElement;
  private spdBtns: HTMLElement[] = [];
  private shown = false;
  private dragging = false;
  private totalMs = 1;
  private startMs = 0;
  private lastTimeText = '';
  private cutFadeUntil = 0;

  constructor() {
    this.root = el('div', 'theater hidden');

    const head = el('div', 'theater-head');
    const prevBtn = el('button', 'theater-btn', '&#8592; PREV');
    prevBtn.addEventListener('click', () => this.onPrev());
    const nextBtn = el('button', 'theater-btn', 'NEXT &#8594;');
    nextBtn.addEventListener('click', () => this.onNext());
    this.titleEl = el('div', 'theater-title');
    head.append(prevBtn, this.titleEl, nextBtn);

    const scrubRow = el('div', 'theater-scrub-row');
    const scrub = el('div', 'theater-scrub');
    const trackBg = el('div', 'theater-scrub-track');
    const fill = el('div', 'theater-scrub-fill');
    const dot = el('div', 'theater-scrub-dot');
    scrub.append(trackBg, fill, dot);
    this.fillEl = fill;
    this.dotEl = dot;
    scrub.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      try {
        scrub.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      this.seekFromPointer(scrub, e);
    });
    scrub.addEventListener('pointermove', (e) => {
      if (this.dragging) this.seekFromPointer(scrub, e);
    });
    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.onScrubEnd();
    };
    scrub.addEventListener('pointerup', endDrag);
    scrub.addEventListener('pointercancel', endDrag);
    this.timeEl = el('div', 'theater-time');
    scrubRow.append(scrub, this.timeEl);

    const row = el('div', 'theater-row');
    this.playBtn = el('button', 'theater-btn play', 'PAUSE');
    this.playBtn.addEventListener('click', () => this.onPlayToggle());
    const speeds = el('div', 'theater-speeds');
    for (const s of REPLAY_SPEEDS) {
      const b = el('button', 'theater-btn spd', `${s}&times;`);
      b.addEventListener('click', () => this.onSpeed(s));
      speeds.append(b);
      this.spdBtns.push(b);
    }
    this.camBtn = el('button', 'theater-btn', 'CAM CHASE');
    this.camBtn.addEventListener('click', () => this.onCamera());
    this.cutsBtn = el('button', 'theater-btn', 'AUTO CUTS ON');
    this.cutsBtn.addEventListener('click', () => this.onAutoCuts(!this.cutsBtn.classList.contains('on')));
    this.shareBtn = el('button', 'theater-btn share hidden', 'SHARE REPLAY');
    this.shareBtn.addEventListener('click', () => this.onShare());
    const hint = el('div', 'theater-hint', 'SPACE PLAY &middot; &larr;&rarr; SEEK &middot; 1/2/3 SPEED &middot; C CAM &middot; ESC EXIT');
    const exitBtn = el('button', 'theater-btn exit', 'EXIT');
    exitBtn.addEventListener('click', () => this.onExit());
    row.append(this.playBtn, speeds, this.camBtn, this.cutsBtn, this.shareBtn, hint, exitBtn);

    this.bar = el('div', 'theater-bar');
    this.bar.append(head, scrubRow, row);
    this.root.append(this.bar);

    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.shown || e.repeat) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.onPlayToggle();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.onSeekStep(-2000);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.onSeekStep(2000);
        break;
      case 'Digit1':
        this.onSpeed(0.25);
        break;
      case 'Digit2':
        this.onSpeed(0.5);
        break;
      case 'Digit3':
        this.onSpeed(1);
        break;
      case 'KeyC':
        this.onCamera();
        break;
      case 'Escape':
        this.onExit();
        break;
    }
  };

  private seekFromPointer(scrub: HTMLElement, e: PointerEvent): void {
    const rect = scrub.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    this.onSeek(this.startMs + f * (this.totalMs - this.startMs));
  }

  get scrubbing(): boolean {
    return this.dragging;
  }

  show(opts: TheaterOpts): void {
    this.totalMs = Math.max(1, opts.totalMs);
    this.titleEl.innerHTML = `${opts.label ?? 'REPLAY'} &middot; ${opts.trackName.toUpperCase()} &middot; <b>${opts.index + 1}/${opts.count}</b>`;
    this.lastTimeText = '';
    this.root.classList.remove('hidden');
    this.shown = true;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.shown = false;
    this.dragging = false;
    this.cutFadeUntil = 0;
    this.bar.classList.remove('theater-cut');
  }

  setIndex(index: number, count: number): void {
    const b = this.titleEl.querySelector('b');
    if (b) b.textContent = `${index + 1}/${count}`;
  }

  setTime(tMs: number, startMs: number, totalMs: number): void {
    const text = `${formatTime(tMs)} <span>/ ${formatTime(totalMs)}</span>`;
    if (text !== this.lastTimeText) {
      this.lastTimeText = text;
      this.timeEl.innerHTML = text;
    }
    const f = Math.max(0, Math.min(1, (tMs - startMs) / Math.max(1, totalMs - startMs)));
    const pct = `${(f * 100).toFixed(2)}%`;
    this.fillEl.style.width = pct;
    this.dotEl.style.left = pct;
  }

  setPlaying(playing: boolean): void {
    this.playBtn.textContent = playing ? 'PAUSE' : 'PLAY';
    this.playBtn.classList.toggle('on', playing);
  }

  setSpeed(speed: number): void {
    this.spdBtns.forEach((b, i) => b.classList.toggle('on', REPLAY_SPEEDS[i] === speed));
  }

  setCam(mode: CameraMode): void {
    this.camBtn.textContent = `CAM ${mode.toUpperCase()}`;
  }

  setAutoCuts(on: boolean): void {
    this.cutsBtn.textContent = `AUTO CUTS ${on ? 'ON' : 'OFF'}`;
    this.cutsBtn.classList.toggle('on', on);
  }

  /** v9 P3: SHARE REPLAY is visible only for real recorded day-condition laps. */
  setShareVisible(visible: boolean): void {
    this.shareBtn.classList.toggle('hidden', !visible);
  }

  /** Briefly fade the bar so a director cut reads cleanly (skipped while scrubbing). */
  flashCut(): void {
    if (this.dragging) return;
    this.cutFadeUntil = performance.now() + 620;
    this.bar.classList.add('theater-cut');
  }

  /**
   * RAF-driven fade clear — page setTimeout can be throttled (background tabs),
   * so the frame loop owns removing `theater-cut`.
   */
  tickCut(now: number): void {
    if (this.cutFadeUntil !== 0 && now >= this.cutFadeUntil) {
      this.cutFadeUntil = 0;
      this.bar.classList.remove('theater-cut');
    }
  }
}
