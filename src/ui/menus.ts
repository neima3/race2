import { el, formatTimePrecise } from './common';
import type { SaveManager, Settings, QualityTier, CupRunEntry, TrophyKind } from '../core/save';
import type { TrackDef, TrackVariant } from '../track/defs';
import type { FinishResult } from '../game/race';
import type { Standing } from '../game/rivals';
import type { TrafficFinishData } from '../systems/traffic';
import { CUPS, cupUnlock, cupTracks, cupStandings, startCupRun, type CupDef, type CareerPanelData } from '../game/career';
import { dailyFor, dailyIsLive, todayKey, type DailyShareLink } from '../game/daily';
import { WEEKLY_RACES, isValidWeekKey, weeklyFor, weekKeyFor, weekIsLive, weeklyStandings, type WeeklyDef, type WeeklyPanelData, type WeeklyShareLink } from '../game/weekly';
import { rivalAchievementState } from '../game/achievements';
import { driverStats } from '../game/stats';
import { paintUnlockState } from '../game/unlocks';
import { PAINTS, PAINT_LOCK_IDS, type CarBodyStyle } from '../render/car-model';
import { bodyUnlocks, bodyStatRatios, hasCupTrophy } from '../systems/garage';

function cssHex(paint: number): string {
  return '#' + paint.toString(16).padStart(6, '0');
}

function trophyLabel(t: TrophyKind): string {
  return t ? `${t.toUpperCase()} TROPHY` : '';
}

function finishGap(s: Standing, leader: Standing): string {
  if (s.eliminated) return 'OUT';
  if (s.finished && s.finishTimeMs != null) {
    if (leader.finished && leader.finishTimeMs != null && s !== leader) {
      return `+${((s.finishTimeMs - leader.finishTimeMs) / 1000).toFixed(1)}s`;
    }
    return formatTimePrecise(s.finishTimeMs);
  }
  return `DNF +${Math.round(s.gapMeters)}m`;
}

export type MenuScreen = 'title' | 'tracks' | 'settings' | 'garage' | 'achievements' | 'stats' | 'career' | 'none';

interface MedalState {
  author: boolean;
  gold: boolean;
  silver: boolean;
  bronze: boolean;
}

function medalForTime(bestMs: number | null, medals: TrackDef['medals']): MedalState | null {
  if (bestMs == null) return null;
  return {
    author: bestMs <= medals.author,
    gold: bestMs <= medals.gold,
    silver: bestMs <= medals.silver,
    bronze: bestMs <= medals.bronze,
  };
}

function starsForTime(bestMs: number | null, medals: TrackDef['medals']): number {
  if (bestMs == null) return 0;
  if (bestMs <= medals.author) return 4;
  if (bestMs <= medals.gold) return 3;
  if (bestMs <= medals.silver) return 2;
  if (bestMs <= medals.bronze) return 1;
  return 0;
}

export class MenuManager {
  driftAttack = false;
  rivalsMode = false;
  knockoutMode = false;
  trafficMode = false;
  readonly root: HTMLElement;
  onPlayTrack: (track: TrackDef) => void = () => {};
  onQuitToMenu: () => void = () => {};
  onResume: () => void = () => {};
  onPractice: () => void = () => {};
  onStartTutorial: () => void = () => {};
  onRestart: () => void = () => {};
  onSettingsChanged: (s: Settings) => void = () => {};
  onTiltRequest: () => void = () => {};

  onWatchReplay: () => void = () => {};
  onViewPodium: () => void = () => {};
  onCareerStartRace: (cup: CupDef, raceIndex: number) => void = () => {};
  onCareerNextRace: () => void = () => {};
  onCareerHubReturn: () => void = () => {};
  onShareGhost: (track: TrackDef) => Promise<void> = async () => {};
  onFriendRace: (track: TrackDef) => void = () => {};
  onWatchFriendReplay: (track: TrackDef) => void = () => {};
  onStartDaily: () => void = () => {};
  onShareDaily: () => Promise<void> = async () => {};
  onStartWeekly: () => void = () => {};
  onWeeklyStartRace: (raceIndex: number) => void = () => {};
  onWeeklyNextRace: () => void = () => {};
  onWeeklyQuit: () => void = () => {};
  onShareWeekly: () => Promise<void> = async () => {};

  private titleScreen: HTMLElement;
  private tracksScreen: HTMLElement;
  private settingsScreen: HTMLElement;
  private pauseScreen: HTMLElement;
  private finishScreen: HTMLElement;
  private garageScreen: HTMLElement;
  private achievementsScreen: HTMLElement;
  private statsScreen: HTMLElement;
  private careerScreen: HTMLElement;
  private friendScreen: HTMLElement;
  private dailyScreen: HTMLElement;
  private weeklyScreen: HTMLElement;
  private onboardScreen: HTMLElement;
  private dailyStreakEl: HTMLElement | null = null;
  private weeklyStreakEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer: number | null = null;
  careerCup: CupDef | null = null;
  garageCanvas: HTMLCanvasElement | null = null;
  isGarageOpen = false;
  onGarageChange: (paint: number, body: CarBodyStyle) => void = () => {};
  private pausePractice = false;

  constructor(private save: SaveManager, private tracks: TrackDef[]) {
    this.root = el('div', 'menu-layer');

    this.titleScreen = this.buildTitle();
    this.tracksScreen = el('div', 'screen hidden');
    this.settingsScreen = el('div', 'screen hidden');
    this.pauseScreen = this.buildPause();
    this.finishScreen = el('div', 'screen hidden');
    this.garageScreen = el('div', 'screen hidden');
    this.achievementsScreen = el('div', 'screen hidden');
    this.statsScreen = el('div', 'screen hidden');
    this.careerScreen = el('div', 'screen hidden');
    this.friendScreen = el('div', 'screen overlay-screen hidden');
    this.dailyScreen = el('div', 'screen overlay-screen hidden');
    this.weeklyScreen = el('div', 'screen overlay-screen hidden');
    this.onboardScreen = this.buildOnboarding();

    this.root.append(this.titleScreen, this.tracksScreen, this.settingsScreen, this.garageScreen, this.achievementsScreen, this.statsScreen, this.careerScreen, this.pauseScreen, this.finishScreen, this.friendScreen, this.dailyScreen, this.weeklyScreen, this.onboardScreen);
    this.buildTracksScreen();
  }

  private buildOnboarding(): HTMLElement {
    const screen = el('div', 'screen overlay-screen hidden');
    const panel = el('div', 'panel onboard-panel');
    panel.append(el('div', 'fh-title', 'WELCOME TO RACE2'));
    panel.append(el('h2', 'screen-title', 'HOW TO RACE'));
    const cards = el('div', 'onboard-cards');
    const card = (title: string, lines: string[]) => {
      const c = el('div', 'onboard-card');
      c.append(el('div', 'onboard-card-title', title));
      for (const l of lines) c.append(el('div', 'onboard-card-line', l));
      return c;
    };
    cards.append(
      card('DRIVE', [
        'STEER &mdash; A / D or &#8592; &#8594;',
        'GAS &mdash; W or &#8593; &nbsp;&middot;&nbsp; BRAKE &mdash; S or &#8595;',
        'TOUCH &mdash; left pad steers, right pedals gas / brake',
      ]),
      card('DRIFT &amp; BOOST', [
        'HOLD SPACE or SHIFT to drift through corners',
        'ORANGE PADS &mdash; drive over them for free speed',
      ]),
      card('GO RACING', [
        'CAREER &mdash; race rivals across cups for trophies',
        'DAILY &mdash; a new seeded challenge every day',
      ]),
    );
    panel.append(cards);
    const actions = el('div', 'onboard-actions');
    const skip = el('button', 'menu-btn', 'SKIP');
    const got = el('button', 'menu-btn primary', 'GOT IT');
    const dismiss = () => {
      this.patchSettings({ onboarded: true });
      this.show('title');
    };
    skip.addEventListener('click', dismiss);
    got.addEventListener('click', dismiss);
    actions.append(skip, got);
    panel.append(actions);
    screen.append(panel);
    return screen;
  }

  private buildTitle(): HTMLElement {
    const screen = el('div', 'screen title-screen');
    const logo = el('div', 'game-logo');
    logo.innerHTML = `
      <div class="logo-race">RACE<span class="logo-2">2</span></div>
      <div class="logo-tag">HIGH-SPEED ARCADE RACING</div>
    `;
    const buttons = el('div', 'menu-buttons');
    const play = el('button', 'menu-btn primary', 'PLAY');
    play.addEventListener('click', () => {
      // Fresh profile: first PLAY goes through the interactive tutorial (v8 P6).
      if (!this.save.settings.tutorialDone && this.save.settings.onboarded) {
        this.onStartTutorial();
        return;
      }
      this.show('tracks');
    });
    const daily = el('button', 'menu-btn', 'DAILY');
    const dailyStreak = el('span', 'daily-streak hidden');
    daily.append(dailyStreak);
    this.dailyStreakEl = dailyStreak;
    daily.addEventListener('click', () => this.showDailyCard());
    const weekly = el('button', 'menu-btn', 'WEEKLY');
    const weeklyStreak = el('span', 'daily-streak weekly-streak hidden');
    weekly.append(weeklyStreak);
    this.weeklyStreakEl = weeklyStreak;
    weekly.addEventListener('click', () => this.showWeeklyCard());
    const career = el('button', 'menu-btn', 'CAREER');
    career.addEventListener('click', () => this.show('career'));
    const garage = el('button', 'menu-btn', 'GARAGE');
    garage.addEventListener('click', () => {
      this.buildGarage();
      this.show('garage');
    });
    const stats = el('button', 'menu-btn', 'STATS');
    stats.addEventListener('click', () => this.show('stats'));
    const settings = el('button', 'menu-btn', 'SETTINGS');
    settings.addEventListener('click', () => {
      this.buildSettingsScreen();
      this.settingsScreen.dataset.returnTo = 'title';
      this.show('settings');
    });
    const achievements = el('button', 'menu-btn', 'ACHIEVEMENTS');
    achievements.addEventListener('click', () => {
      this.buildAchievements();
      this.show('achievements');
    });
    buttons.append(play, daily, weekly, career, garage, stats, achievements, settings);
    const hint = el('div', 'title-hint', 'Keyboard · Touch · Gamepad supported');
    const credits = el('div', 'title-credits', `v2.4.0 — built with Three.js · © 2026 neima.me`);
    screen.append(logo, buttons, hint, credits);
    return screen;
  }

  private totalStars(): number {
    return this.tracks.reduce((sum, t) => sum + starsForTime(this.save.trackSave(t.id).bestTimeMs, t.medals), 0);
  }

  private buildTracksScreen(): void {
    this.tracksScreen.replaceChildren();
    const totalStars = this.totalStars();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'SELECT TRACK'));
    const right = el('div', 'tracks-header-right');
    const driftChip = el('button', 'mode-chip' + (this.driftAttack ? ' on' : ''), 'DRIFT ATTACK');
    driftChip.addEventListener('click', () => {
      this.driftAttack = !this.driftAttack;
      if (this.driftAttack) this.rivalsMode = false;
      this.knockoutMode = false;
      this.trafficMode = false;
      this.buildTracksScreen();
    });
    const rivalsChip = el('button', 'mode-chip rivals' + (this.rivalsMode ? ' on' : ''), 'RIVALS');
    rivalsChip.addEventListener('click', () => {
      this.rivalsMode = !this.rivalsMode;
      if (this.rivalsMode) this.driftAttack = false;
      this.knockoutMode = false;
      this.trafficMode = false;
      this.buildTracksScreen();
    });
    const knockoutChip = el('button', 'mode-chip knockout' + (this.knockoutMode ? ' on' : ''), 'KNOCKOUT');
    knockoutChip.addEventListener('click', () => {
      this.knockoutMode = !this.knockoutMode;
      if (this.knockoutMode) {
        this.driftAttack = false;
        this.rivalsMode = false;
      }
      this.trafficMode = false;
      this.buildTracksScreen();
    });
    const trafficChip = el('button', 'mode-chip traffic' + (this.trafficMode ? ' on' : ''), 'TRAFFIC');
    trafficChip.addEventListener('click', () => {
      this.trafficMode = !this.trafficMode;
      if (this.trafficMode) {
        this.driftAttack = false;
        this.rivalsMode = false;
      }
      this.knockoutMode = false;
      this.buildTracksScreen();
    });
    right.append(driftChip, rivalsChip, knockoutChip, trafficChip);
    right.append(el('div', 'star-total', `&#11088; ${totalStars}/${this.tracks.length * 4}`));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    right.append(back);
    header.append(right);
    const variantRow = el('div', 'variant-row');
    variantRow.append(el('span', 'variant-label', 'VARIANT'));
    const currentVariant: TrackVariant = this.save.settings.variant ?? 'day';
    for (const v of ['day', 'dusk', 'night', 'rain'] as TrackVariant[]) {
      const chip = el('button', 'mode-chip variant' + (currentVariant === v ? ' on' : ''), v.toUpperCase());
      chip.addEventListener('click', () => {
        if (currentVariant === v) return;
        this.patchSettings({ variant: v });
        this.buildTracksScreen();
      });
      variantRow.append(chip);
    }
    const forceAll = new URLSearchParams(window.location.search).has('alltracks');
    const grid = el('div', 'track-grid');
    this.tracks.forEach((track, i) => {
      const ts = this.save.trackSave(track.id);
      const stars = starsForTime(ts.bestTimeMs, track.medals);
      const unlocked = forceAll || i === 0 || starsForTime(this.save.trackSave(this.tracks[i - 1].id).bestTimeMs, this.tracks[i - 1].medals) >= 1;
      const ms = medalForTime(ts.bestTimeMs, track.medals);
      const card = el('button', 'track-card' + (unlocked ? '' : ' locked'));
      const medalOrder: (keyof MedalState)[] = ['author', 'gold', 'silver', 'bronze'];
      const medalsRow = medalOrder
        .map((k) => `<span class="mini-medal ${ms && ms[k] ? `earned mm-${k}` : ''}" title="${k}"></span>`)
        .join('');
      const starRow = Array.from({ length: 4 }, (_, si) => `<span class="pstar ${si < stars ? 'on' : ''}">&#11088;</span>`).join('');
      const shareAffordance = unlocked && ts.ghost ? `<span class="track-share" role="button" title="SHARE GHOST">&#10548;</span>` : '';
      card.innerHTML = `
        <div class="track-card-top" style="--accent:${track.accentName}">
          <span class="track-num">${unlocked ? String(i + 1).padStart(2, '0') : '&#128274;'}</span>
          <div>
            <div class="track-name">${track.name}</div>
            <div class="track-sub">${unlocked ? track.subtitle : `Earn a medal on ${this.tracks[i - 1].name}`}</div>
          </div>
        </div>
        <div class="track-card-bottom">
          <div class="track-best">${unlocked ? (ts.bestTimeMs != null ? formatTimePrecise(ts.bestTimeMs) : '&mdash;:--.---') : 'LOCKED'}</div>
          <div class="track-medals">${medalsRow}</div>
          ${shareAffordance}
        </div>
        <div class="track-stars">${starRow}</div>
      `;
      const shareEl = card.querySelector('.track-share');
      if (shareEl) {
        shareEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (shareEl.classList.contains('busy')) return;
          shareEl.classList.add('busy');
          void this.onShareGhost(track).finally(() => shareEl.classList.remove('busy'));
        });
      }
      card.addEventListener('click', () => {
        if (!unlocked) return;
        this.onPlayTrack(track);
      });
      grid.append(card);
    });
    this.tracksScreen.append(header, variantRow, grid);
  }

  private buildSettingsScreen(): void {
    this.settingsScreen.replaceChildren();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'SETTINGS'));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => {
      if (this.settingsScreen.dataset.returnTo === 'pause') {
        this.settingsScreen.dataset.returnTo = 'title';
        this.showPause(this.pausePractice);
      } else {
        this.show('title');
      }
    });
    header.append(back);

    const list = el('div', 'settings-list');
    const s = this.save.settings;

    const row = (label: string, control: HTMLElement) => {
      const r = el('div', 'setting-row');
      r.append(el('div', 'setting-label', label), control);
      list.append(r);
    };

    const select = <T extends string>(value: T, options: { value: T; label: string }[], cb: (v: T) => void) => {
      const sel = el('select', 'setting-select') as HTMLSelectElement;
      for (const o of options) {
        const opt = el('option') as HTMLOptionElement;
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === value) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener('change', () => cb(sel.value as T));
      return sel;
    };

    row(
      'GRAPHICS',
      select<QualityTier | 'auto'>(s.quality, [
        { value: 'auto', label: 'Auto' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ], (v) => this.patchSettings({ quality: v })),
    );
    row(
      'CAMERA',
      select(s.cam, [
        { value: 'chase', label: 'Chase' },
        { value: 'close', label: 'Close' },
        { value: 'hood', label: 'Hood' },
      ], (v) => this.patchSettings({ cam: v })),
    );

    const fovWrap = el('div', 'setting-range-wrap');
    const fov = el('input', 'setting-range') as HTMLInputElement;
    fov.type = 'range';
    fov.min = '60';
    fov.max = '100';
    fov.step = '1';
    fov.value = String(s.fov);
    const fovVal = el('div', 'setting-range-val', `${s.fov}°`);
    fov.addEventListener('input', () => {
      const v = parseFloat(fov.value);
      fovVal.textContent = `${Math.round(v)}°`;
      this.patchSettings({ fov: v });
    });
    fovWrap.append(fov, fovVal);
    row('FIELD OF VIEW', fovWrap);

    row(
      'TOUCH STEERING',
      select(s.touchSteer, [
        { value: 'buttons', label: 'Buttons' },
        { value: 'tilt', label: 'Tilt device' },
      ], (v) => {
        if (v === 'tilt') this.onTiltRequest();
        this.patchSettings({ touchSteer: v });
      }),
    );
    row(
      'MUSIC',
      select(s.music ? 'on' : 'off', [
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ], (v) => this.patchSettings({ music: v === 'on' })),
    );
    row(
      'SOUND FX',
      select(s.sfx ? 'on' : 'off', [
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ], (v) => this.patchSettings({ sfx: v === 'on' })),
    );
    row(
      'GHOSTS',
      select(String(s.ghosts), [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
      ], (v) => this.patchSettings({ ghosts: Math.max(1, Math.min(3, parseInt(v, 10) || 3)) })),
    );
    row(
      'GHOST CAR',
      select(s.showGhost ? 'on' : 'off', [
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ], (v) => this.patchSettings({ showGhost: v === 'on' })),
    );
    row(
      'REDUCED MOTION',
      select(s.reducedMotion ? 'on' : 'off', [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ], (v) => this.patchSettings({ reducedMotion: v === 'on' })),
    );
    row(
      'HIGH CONTRAST HUD',
      select(s.hudContrast ? 'on' : 'off', [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ], (v) => this.patchSettings({ hudContrast: v === 'on' })),
    );
    row(
      'CAMERA SHAKE',
      select(String(s.shakeIntensity), [
        { value: '1', label: 'Full' },
        { value: '0.5', label: 'Half' },
        { value: '0', label: 'Off' },
      ], (v) => this.patchSettings({ shakeIntensity: parseFloat(v) })),
    );
    row(
      'LEFT-HANDED TOUCH',
      select(s.leftyTouch ? 'on' : 'off', [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ], (v) => {
        this.patchSettings({ leftyTouch: v === 'on' });
        this.root.classList.toggle('touch-lefty', v === 'on');
      }),
    );

    const sensWrap = el('div', 'setting-range-wrap');
    const sens = el('input', 'setting-range') as HTMLInputElement;
    sens.type = 'range';
    sens.min = '0.5';
    sens.max = '1.5';
    sens.step = '0.05';
    sens.value = String(s.steeringSensitivity);
    const sensVal = el('div', 'setting-range-val', `${Math.round(s.steeringSensitivity * 100)}%`);
    sens.addEventListener('input', () => {
      const v = parseFloat(sens.value);
      sensVal.textContent = `${Math.round(v * 100)}%`;
      this.patchSettings({ steeringSensitivity: v });
    });
    sensWrap.append(sens, sensVal);
    row('STEERING SENSITIVITY', sensWrap);

    const tutBtn = el('button', 'menu-btn small', 'REPLAY TUTORIAL');
    tutBtn.addEventListener('click', () => this.onStartTutorial());
    row('TUTORIAL', tutBtn);

    const controlsHelp = el('div', 'controls-help');
    controlsHelp.innerHTML = `
      <div class="controls-col">
        <h4>KEYBOARD</h4>
        <div>Steer &mdash; A/D or &larr;/&rarr;</div>
        <div>Gas &mdash; W or &uarr;</div>
        <div>Brake &mdash; S or &darr;</div>
        <div>Drift &mdash; SPACE</div>
        <div>Respawn &mdash; X / BACKSPACE</div>
        <div>Restart &mdash; R</div>
        <div>Camera &mdash; C</div>
      </div>
      <div class="controls-col">
        <h4>GAMEPAD</h4>
        <div>Steer &mdash; Left stick</div>
        <div>Gas &mdash; RT (or A)</div>
        <div>Brake &mdash; LT</div>
        <div>Drift &mdash; B</div>
        <div>Respawn &mdash; X</div>
        <div>Restart &mdash; Y</div>
        <div>Camera &mdash; RB</div>
        <div>Pause &mdash; START</div>
      </div>
      <div class="controls-col">
        <h4>TOUCH</h4>
        <div>Steer &mdash; left arrows</div>
        <div>Gas/brake &mdash; right pedals</div>
        <div>Respawn &mdash; &#8634; button</div>
      </div>
    `;
    this.settingsScreen.append(header, list, controlsHelp);
  }

  private buildGarage(): void {
    this.garageScreen.replaceChildren();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'GARAGE'));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    header.append(back);

    const wrap = el('div', 'garage-wrap');
    this.garageCanvas = el('canvas', 'garage-canvas') as HTMLCanvasElement;
    this.garageCanvas.width = 420;
    this.garageCanvas.height = 280;
    wrap.append(this.garageCanvas);

    const profile = this.save.profile;
    const lockState = paintUnlockState(this.save);
    const paints = el('div', 'paint-grid');
    for (const p of PAINTS) {
      const lock = p.lock ? lockState[p.lock] : null;
      const cell = el('div', 'paint-cell' + (lock && !lock.unlocked ? ' locked' : ''));
      const sw = el('button', 'paint-swatch');
      sw.style.background = '#' + p.color.toString(16).padStart(6, '0');
      sw.title = lock && !lock.unlocked ? `${p.name.toUpperCase()} — ${lock.req}` : p.name;
      if ((!lock || lock.unlocked) && p.color === profile.paint) sw.classList.add('selected');
      sw.addEventListener('click', () => {
        if (lock && !lock.unlocked) {
          sw.classList.remove('deny');
          void sw.offsetWidth;
          sw.classList.add('deny');
          this.showToast(`LOCKED — ${lock.req}`);
          return;
        }
        this.save.updateProfile({ paint: p.color });
        for (const s of Array.from(paints.querySelectorAll('.paint-swatch'))) s.classList.remove('selected');
        sw.classList.add('selected');
        this.onGarageChange(p.color, this.save.profile.body);
      });
      cell.append(sw);
      if (lock && !lock.unlocked) cell.append(el('div', 'paint-req', lock.req));
      paints.append(cell);
    }
    wrap.append(paints);

    const unlocks = bodyUnlocks(this.totalStars(), hasCupTrophy(this.save), this.save.stats.championBeaten);
    const bodies = el('div', 'body-grid');
    for (const b of ['standard', 'aero', 'tank', 'glide'] as CarBodyStyle[]) {
      const unlock = unlocks[b];
      const stats = bodyStatRatios(b);
      const selected = b === profile.body && unlock.unlocked;
      const card = el('button', 'body-card' + (selected ? ' selected' : '') + (unlock.unlocked ? '' : ' locked'));
      const top = el('div', 'body-card-top');
      top.append(el('span', 'body-name', b.toUpperCase()));
      if (!unlock.unlocked) {
        const lock = el('span', 'body-lock');
        lock.innerHTML = `&#128274; ${unlock.req}`;
        top.append(lock);
      }
      card.append(top);
      const statRows = el('div', 'body-stats');
      const bar = (label: string, ratio: number) => {
        const row = el('div', 'stat-row');
        row.append(el('span', 'stat-label', label));
        const track = el('div', 'stat-track');
        const fill = document.createElement('i');
        fill.className = 'stat-fill';
        fill.style.width = `${Math.max(10, Math.min(100, Math.round(ratio * 70)))}%`;
        track.append(fill);
        row.append(track);
        return row;
      };
      statRows.append(bar('SPEED', stats.speed), bar('GRIP', stats.grip), bar('DRIFT', stats.drift), bar('ACCEL', stats.accel));
      card.append(statRows);
      card.addEventListener('click', () => {
        if (!unlock.unlocked) {
          this.showToast(`LOCKED — ${unlock.req}`);
          return;
        }
        if (b === this.save.profile.body) return;
        this.save.updateProfile({ body: b });
        for (const s of bodies.children) s.classList.remove('selected');
        card.classList.add('selected');
        this.onGarageChange(this.save.profile.paint, b);
      });
      bodies.append(card);
    }
    wrap.append(bodies);

    this.garageScreen.append(header, wrap);
  }

  private buildStats(): void {
    const screen = this.statsScreen;
    screen.replaceChildren();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'STATS'));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    header.append(back);

    const st = driverStats(this.save);
    const list = el('div', 'stats-list');
    const section = (title: string) => list.append(el('div', 'fh-title stats-section', title));
    const row = (label: string, value: string) => {
      const r = el('div', 'stats-row');
      r.append(el('span', 'stats-label', label), el('span', 'stats-value', value));
      list.append(r);
    };

    section('CAREER');
    row('LAPS', String(st.laps));
    row('DISTANCE', `${st.distanceKm.toFixed(1)} KM`);
    row('DRIFT POINTS', st.driftPoints.toLocaleString('en-US'));
    row('AIR TIME', `${st.airSeconds.toFixed(1)}s`);
    row('NEAR MISSES', String(st.nearMisses));
    section('RACING');
    row('RIVAL WINS', String(st.rivalWins));
    row('KNOCKOUT WINS', String(st.knockoutWins));
    section('TROPHIES');
    row('GOLD', String(st.trophies.gold));
    row('SILVER', String(st.trophies.silver));
    row('BRONZE', String(st.trophies.bronze));
    section('STREAKS');
    row('BEST DAILY STREAK', `${st.bestDailyStreak} ${st.bestDailyStreak === 1 ? 'DAY' : 'DAYS'}`);
    row('BEST WEEKLY STREAK', `${st.bestWeeklyStreak} ${st.bestWeeklyStreak === 1 ? 'WEEK' : 'WEEKS'}`);
    if (st.headToHead.length > 0) {
      section('HEAD TO HEAD');
      for (const h of st.headToHead) row(h.name, `${h.wins} ${h.wins === 1 ? 'WIN' : 'WINS'}`);
    }
    screen.append(header, list);
  }

  private buildAchievements(): void {
    const screen = this.achievementsScreen;
    screen.replaceChildren();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'ACHIEVEMENTS'));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    header.append(back);

    const stats = this.tracks.map((t) => ({ stars: starsForTime(this.save.trackSave(t.id).bestTimeMs, t.medals), best: this.save.trackSave(t.id).bestTimeMs }));
    const total = stats.reduce((s, x) => s + x.stars, 0);
    const medaled = stats.filter((s) => s.stars > 0).length;
    const golds = stats.filter((s) => s.stars >= 3).length;
    const authors = stats.filter((s) => s.stars >= 4).length;
    const st = this.save.stats;
    const ra = rivalAchievementState(this.save);
    const defs: { name: string; desc: string; done: boolean; progress?: string }[] = [
      { name: 'First Medal', desc: 'Earn any medal', done: medaled > 0 },
      { name: 'Regular', desc: 'Medal 5 tracks', done: medaled >= 5, progress: `${medaled}/${this.tracks.length}` },
      { name: 'Collector', desc: 'Medal all 14 tracks', done: medaled >= this.tracks.length, progress: `${medaled}/${this.tracks.length}` },
      { name: 'Golden Touch', desc: '3 gold medals', done: golds >= 3, progress: `${golds}/3` },
      { name: 'Midas Fleet', desc: 'Gold on every track', done: golds >= this.tracks.length, progress: `${golds}/${this.tracks.length}` },
      { name: 'Dev Time', desc: '1 author medal', done: authors >= 1, progress: `${authors}/1` },
      { name: 'Studio Record', desc: 'Author on 6 tracks', done: authors >= 6, progress: `${authors}/6` },
      { name: 'Neima Standard', desc: 'Author on all 14 tracks', done: authors >= this.tracks.length, progress: `${authors}/${this.tracks.length}` },
      { name: 'Star Struck', desc: '10 stars', done: total >= 10, progress: `${total}/10` },
      { name: 'Constellation', desc: '24 stars', done: total >= 24, progress: `${total}/24` },
      { name: 'Galaxy Brain', desc: '40+ stars', done: total >= 40, progress: `${total}/${this.tracks.length * 4}` },
      { name: '48★ CLUB', desc: '48 stars', done: total >= 48, progress: `${total}/48` },
      { name: 'Lane Hopper', desc: 'Complete 5 laps', done: st.laps >= 5, progress: `${Math.min(st.laps, 5)}/5` },
      { name: 'Sideways Society', desc: '10,000 drift points (lifetime)', done: st.totalDrift >= 10000, progress: `${Math.min(Math.round(st.totalDrift), 10000)}/10000` },
      { name: 'Frequent Flyer', desc: '60s of total air time', done: st.totalAir >= 60, progress: `${Math.min(Math.round(st.totalAir), 60)}/60s` },
      { name: 'Wallflower', desc: '50 wall hits — try the middle', done: st.wallHits >= 50, progress: `${Math.min(st.wallHits, 50)}/50` },
      { name: 'Marathoner', desc: 'Complete 25 laps', done: st.laps >= 25, progress: `${Math.min(st.laps, 25)}/25` },
      { name: 'Untouchable', desc: '3 laps with no wall hits', done: st.cleanLaps >= 3, progress: `${Math.min(st.cleanLaps, 3)}/3` },
      { name: 'First Blood', desc: 'Win any rival race', done: ra.rivalWins >= 1, progress: `${Math.min(ra.rivalWins, 1)}/1` },
      { name: 'Cup Cadet', desc: 'Win your first cup trophy — any', done: ra.cupsWithTrophy >= 1, progress: `${Math.min(ra.cupsWithTrophy, 1)}/1` },
      { name: 'Triple Crown', desc: 'Trophy in any 3 cups', done: ra.cupsWithTrophy >= 3, progress: `${ra.cupsWithTrophy}/3` },
      { name: 'Social Climber', desc: 'Import a friend ghost and race it', done: ra.friendGhostRaces >= 1, progress: `${Math.min(ra.friendGhostRaces, 1)}/1` },
      { name: 'Full House', desc: 'Beat all 8 roster rivals across races', done: ra.rivalsBeaten >= 8, progress: `${ra.rivalsBeaten}/8` },
      { name: 'Tourist', desc: 'Trophy in the Grand Tour', done: ra.tourist >= 1, progress: `${Math.min(ra.tourist, 1)}/1` },
      { name: 'Ghostbuster', desc: 'Beat a friend ghost by 2s or more', done: ra.friendGhostBusts >= 1, progress: `${Math.min(ra.friendGhostBusts, 1)}/1` },
      { name: 'Thread the Needle', desc: `5 near misses in one traffic run`, done: ra.trafficNeedles >= 1, progress: `${Math.min(ra.trafficNeedles, 1)}/1` },
      { name: 'Weekly Warrior', desc: 'Gold trophy in a weekly event', done: ra.weeklyGold >= 1, progress: `${ra.weeklyGold}/1` },
      { name: 'Fresh Grad', desc: 'Complete the tutorial', done: ra.tutorialDone >= 1, progress: `${ra.tutorialDone}/1` },
      { name: 'Paint Collector', desc: `Unlock all ${PAINT_LOCK_IDS.length} locked paints`, done: ra.paintsUnlocked >= PAINT_LOCK_IDS.length, progress: `${Math.min(ra.paintsUnlocked, PAINT_LOCK_IDS.length)}/${PAINT_LOCK_IDS.length}` },
      { name: 'Draft King', desc: 'Finish a rival race with 8s+ total slipstream', done: ra.draftKingRaces >= 1, progress: `${Math.min(ra.draftKingRaces, 1)}/1` },
      { name: 'Storm Chaser', desc: 'Complete a night AND a rain variant race', done: ra.nightRaces >= 1 && ra.rainRaces >= 1, progress: `${Math.min(ra.nightRaces, 1) + Math.min(ra.rainRaces, 1)}/2` },
      { name: 'Director', desc: 'Share a replay link', done: ra.replaysShared >= 1, progress: `${Math.min(ra.replaysShared, 1)}/1` },
      { name: 'Kingmaker', desc: 'Beat SOVEREIGN, the champion', done: ra.championBeaten >= 1, progress: `${Math.min(ra.championBeaten, 1)}/1` },
      { name: 'Apex Champion', desc: 'Win the APEX LEAGUE gold trophy', done: ra.apexGold >= 1, progress: `${Math.min(ra.apexGold, 1)}/1` },
      { name: 'Glide Rider', desc: 'Win a rival or knockout race in the GLIDE', done: ra.glideWins >= 1, progress: `${Math.min(ra.glideWins, 1)}/1` },
      { name: 'Ringmaster', desc: 'Hit all five rings in one halo-flats lap', done: ra.ringPerfectLaps >= 1, progress: `${Math.min(ra.ringPerfectLaps, 1)}/1` },
    ];
    const list = el('div', 'achv-list');
    for (const a of defs) {
      const row = el('div', 'achv-row' + (a.done ? ' done' : ''));
      row.innerHTML = `<div><div class="achv-name">${a.name}</div><div class="achv-desc">${a.desc}</div></div><div class="achv-meta">${a.progress ? `<div class="achv-progress">${a.progress}</div>` : ''}<div class="achv-check">${a.done ? '&#10003;' : '&#9675;'}</div></div>`;
      list.append(row);
    }
    screen.append(header, list);
  }

  private careerStandingsTable(entries: CupRunEntry[], title: string): HTMLElement {
    const wrap = el('div', 'finish-positions career-standings');
    wrap.append(el('div', 'fh-title', title));
    entries.forEach((e, i) => {
      const row = el('div', 'fp-row' + (i < 3 ? ` podium-${i + 1}` : '') + (e.isPlayer ? ' you' : ''));
      row.append(el('span', 'fp-pos', `P${i + 1}`));
      const swatch = el('span', 'fp-swatch');
      swatch.style.background = e.isPlayer ? cssHex(this.save.profile.paint) : cssHex(e.paint);
      row.append(swatch, el('span', 'fp-name', e.name), el('span', 'fp-gap', `${e.points} PTS`));
      wrap.append(row);
    });
    return wrap;
  }

  private buildCareerHub(): void {
    const screen = this.careerScreen;
    screen.replaceChildren();
    const forceAll = new URLSearchParams(window.location.search).has('alltracks');
    const run = this.save.getCupRun();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'CAREER'));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    header.append(back);

    const list = el('div', 'cup-list');
    for (const cup of CUPS) {
      const unlock = cupUnlock(cup, this.tracks, this.save, forceAll);
      const cs = this.save.cupSave(cup.id);
      const activeRun = run && run.cupId === cup.id ? run : null;
      const tracks = cupTracks(cup);
      const card = el('div', 'cup-card' + (unlock.unlocked ? '' : ' locked'));
      card.style.setProperty('--accent', cup.accentName);

      const top = el('div', 'cup-card-top');
      const idBlock = el('div');
      idBlock.append(el('div', 'cup-name', cup.name), el('div', 'cup-sub', `${cup.subtitle} · ${cup.gridLabel}`));
      top.append(idBlock);
      const best = cs.finishes[cs.finishes.length - 1];
      const trophy = el('div', 'cup-trophy');
      if (best) {
        const dot = el('span', 'cup-medal' + (best.trophy ? ` ${best.trophy}` : ''));
        trophy.append(dot, el('span', 'cup-trophy-label' + (best.trophy ? ` t-${best.trophy}` : ''), best.trophy ? trophyLabel(best.trophy) : 'NO TROPHY'));
      }
      top.append(trophy);
      card.append(top);

      const chipRow = el('div', 'cup-tracks');
      tracks.forEach((t, i) => {
        const ts = this.save.trackSave(t.id);
        const bestMs = ts.bestTimeMs;
        const m = bestMs != null
          ? bestMs <= t.medals.author ? 'author' : bestMs <= t.medals.gold ? 'gold' : bestMs <= t.medals.silver ? 'silver' : bestMs <= t.medals.bronze ? 'bronze' : null
          : null;
        const chip = el('span', 'cup-track-chip');
        chip.style.setProperty('--accent', t.accentName);
        chip.append(el('span', 'cup-chip-num', String(i + 1)));
        chip.append(el('span', 'cup-chip-name', t.name.toUpperCase()));
        chip.append(el('span', 'mini-medal' + (m ? ` earned mm-${m}` : '')));
        const done = activeRun && activeRun.positions[i] !== undefined;
        if (done) chip.append(el('span', 'cup-chip-pos', `P${activeRun!.positions[i]}`));
        else if (activeRun && i === activeRun.nextRace) chip.classList.add('next');
        chipRow.append(chip);
      });
      card.append(chipRow);

      const bottom = el('div', 'cup-card-bottom');
      const bestLabel = activeRun
        ? `RACE ${activeRun.nextRace + 1}/${cup.trackIds.length} · ${activeRun.entries.find((e) => e.isPlayer)?.points ?? 0} PTS`
        : cs.bestPoints > 0 ? `BEST ${cs.bestPoints} PTS` : 'NOT ENTERED';
      const bestEl = el('div', 'cup-best', bestLabel);
      bottom.append(bestEl);
      if (unlock.unlocked) {
        const resume = !!activeRun;
        const btn = el('button', 'menu-btn small cup-enter' + (resume ? ' primary' : ''), resume ? `RESUME · RACE ${activeRun!.nextRace + 1}/${cup.trackIds.length}` : 'ENTER');
        btn.addEventListener('click', () => {
          if (!this.save.getCupRun() || this.save.getCupRun()!.cupId !== cup.id) {
            this.save.setCupRun(startCupRun(cup.id));
          }
          this.showCareerInterstitial(cup, this.save.getCupRun()!.nextRace);
        });
        bottom.append(btn);
      } else {
        bottom.append(el('div', 'cup-lock-reason', `LOCKED — ${unlock.reason}`));
      }
      card.append(bottom);
      list.append(card);
    }
    screen.append(header, list);
  }

  showCareerInterstitial(cup: CupDef, raceIndex: number): void {
    this.careerCup = cup;
    const screen = this.careerScreen;
    screen.replaceChildren();
    const run = this.save.getCupRun();
    const trackIdx = Math.max(0, Math.min(cup.trackIds.length - 1, raceIndex));
    const panel = el('div', 'panel career-panel');
    panel.style.setProperty('--accent', cup.accentName);
    panel.append(el('div', 'fh-title', cup.name));
    panel.append(el('h2', 'screen-title', `RACE ${raceIndex + 1}/${cup.trackIds.length}`));
    const track = cupTracks(cup)[trackIdx];
    const sub = el('div', 'cup-race-track');
    sub.innerHTML = `<span class="cup-chip-num">${trackIdx + 1}</span> ${track.name.toUpperCase()} · 2 LAPS`;
    panel.append(sub);
    if (run && run.cupId === cup.id) {
      if (run.positions.length > 0) panel.append(this.careerStandingsTable(cupStandings(run), 'STANDINGS'));
      const done = el('div', 'cup-race-history');
      run.positions.forEach((p, i) => {
        done.append(el('span', 'cup-race-pill', `R${i + 1} <b>P${p}</b>`));
      });
      if (done.children.length > 0) panel.append(done);
    } else {
      panel.append(this.careerStandingsTable(run ? cupStandings(run) : [], 'STANDINGS'));
    }
    const start = el('button', 'menu-btn primary', 'START RACE');
    start.addEventListener('click', () => this.onCareerStartRace(cup, raceIndex));
    const leave = el('button', 'menu-btn', 'LEAVE CUP');
    leave.addEventListener('click', () => this.show('career'));
    panel.append(start, leave);
    screen.append(panel);
    this.hideAll();
    screen.classList.remove('hidden');
  }

  showFriendChallenge(track: TrackDef, timeMs: number): void {
    this.friendScreen.replaceChildren();
    const panel = el('div', 'panel friend-panel');
    panel.style.setProperty('--accent', track.accentName);
    panel.append(el('div', 'fh-title', 'CHALLENGE'));
    panel.append(el('h2', 'screen-title', 'FRIEND GHOST CHALLENGE'));
    panel.append(el('div', 'friend-track', track.name.toUpperCase()));
    panel.append(el('div', 'friend-time', formatTimePrecise(timeMs)));
    const pb = this.save.trackSave(track.id).bestTimeMs;
    panel.append(el('div', 'friend-pb', pb != null ? `YOUR PB ${formatTimePrecise(pb)}` : 'NO PB YET &mdash; SET ONE'));
    const race = el('button', 'menu-btn primary', 'RACE');
    race.addEventListener('click', () => this.onFriendRace(track));
    const dismiss = el('button', 'menu-btn', 'DISMISS');
    dismiss.addEventListener('click', () => this.show('title'));
    panel.append(race, dismiss);
    this.friendScreen.append(panel);
    this.hideAll();
    this.friendScreen.classList.remove('hidden');
  }

  /** v9 P3: #r= import card — WATCH drops the friend's lap straight into the theater. */
  showFriendReplay(track: TrackDef, timeMs: number): void {
    this.friendScreen.replaceChildren();
    const panel = el('div', 'panel friend-panel');
    panel.style.setProperty('--accent', track.accentName);
    panel.append(el('div', 'fh-title', 'REPLAY'));
    panel.append(el('h2', 'screen-title', 'FRIEND REPLAY'));
    panel.append(el('div', 'friend-track', track.name.toUpperCase()));
    panel.append(el('div', 'friend-time', formatTimePrecise(timeMs)));
    const watch = el('button', 'menu-btn primary', 'WATCH');
    watch.addEventListener('click', () => this.onWatchFriendReplay(track));
    const dismiss = el('button', 'menu-btn', 'DISMISS');
    dismiss.addEventListener('click', () => this.show('title'));
    panel.append(watch, dismiss);
    this.friendScreen.append(panel);
    this.hideAll();
    this.friendScreen.classList.remove('hidden');
  }

  private refreshDailyStreak(): void {
    if (!this.dailyStreakEl) return;
    const streak = this.save.daily.streak;
    this.dailyStreakEl.textContent = streak > 0 ? `STREAK ${streak}` : '';
    this.dailyStreakEl.classList.toggle('hidden', streak <= 0);
  }

  private refreshWeeklyStreak(): void {
    if (!this.weeklyStreakEl) return;
    const streak = this.save.weekly.streak;
    this.weeklyStreakEl.textContent = streak > 0 ? `STREAK ${streak}` : '';
    this.weeklyStreakEl.classList.toggle('hidden', streak <= 0);
  }

  private dailyLineupRows(lineup: { name: string; tier: string; paint: number }[]): HTMLElement {
    const wrap = el('div', 'daily-lineup');
    for (const r of lineup) {
      const row = el('div', 'daily-lineup-row');
      const swatch = el('span', 'fp-swatch');
      swatch.style.background = cssHex(r.paint);
      row.append(swatch, el('span', 'daily-lineup-name', r.name), el('span', 'daily-lineup-tier', r.tier.toUpperCase()));
      wrap.append(row);
    }
    return wrap;
  }

  showDailyCard(): void {
    this.dailyScreen.replaceChildren();
    const dateKey = todayKey();
    const def = dailyFor(dateKey);
    const d = this.save.daily;
    const panel = el('div', 'panel friend-panel daily-panel');
    panel.style.setProperty('--accent', def.track.accentName);
    panel.append(el('div', 'fh-title', 'DAILY CHALLENGE'));
    panel.append(el('div', 'daily-date', `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`));
    panel.append(el('div', 'friend-track', def.track.name.toUpperCase()));
    panel.append(this.dailyLineupRows(def.lineup));
    panel.append(el('div', 'daily-meta', `${def.laps} LAPS · 1 EASY + 2 PRO RIVALS`));
    const res = d.results[dateKey];
    if (res) {
      panel.append(el('div', 'daily-result', `TODAY: P${res.position} · ${formatTimePrecise(res.timeMs)}`));
    }
    if (d.streak > 0) {
      panel.append(el('div', 'daily-streak-line', `STREAK ${d.streak}`));
    }
    const race = el('button', 'menu-btn primary', res ? 'RETRY TODAY&#8217;S CHALLENGE' : 'RACE TODAY&#8217;S CHALLENGE');
    race.addEventListener('click', () => this.onStartDaily());
    const back = el('button', 'menu-btn', 'BACK');
    back.addEventListener('click', () => this.show('title'));
    panel.append(race, back);
    this.dailyScreen.append(panel);
    this.hideAll();
    this.dailyScreen.classList.remove('hidden');
  }

  showDailyImport(link: DailyShareLink): void {
    this.dailyScreen.replaceChildren();
    const live = dailyIsLive(link.dateKey);
    const def = dailyFor(link.dateKey);
    const panel = el('div', 'panel friend-panel daily-panel');
    panel.style.setProperty('--accent', def.track.accentName);
    panel.append(el('div', 'fh-title', 'DAILY CHALLENGE'));
    panel.append(el('h2', 'screen-title', 'BEAT MY TIME'));
    panel.append(el('div', 'daily-date', `${link.dateKey.slice(0, 4)}-${link.dateKey.slice(4, 6)}-${link.dateKey.slice(6, 8)}`));
    panel.append(el('div', 'friend-track', def.track.name.toUpperCase()));
    panel.append(el('div', 'daily-result', `THEIR RESULT: P${link.position} · ${formatTimePrecise(link.timeMs)}`));
    panel.append(el('div', 'daily-meta', live ? 'TODAY&#8217;S CHALLENGE' : 'THAT DAY&#8217;S CHALLENGE — DAILIES ARE ONLY PLAYABLE SAME-DAY'));
    const race = el('button', 'menu-btn primary', 'RACE TODAY&#8217;S CHALLENGE') as HTMLButtonElement;
    race.disabled = !live;
    race.addEventListener('click', () => {
      if (race.disabled) return;
      this.onStartDaily();
    });
    const dismiss = el('button', 'menu-btn', 'DISMISS');
    dismiss.addEventListener('click', () => this.show('title'));
    panel.append(race, dismiss);
    this.dailyScreen.append(panel);
    this.hideAll();
    this.dailyScreen.classList.remove('hidden');
  }

  private weeklyModifierBadge(modifier: { name: string; blurb: string }): HTMLElement {
    const badge = el('div', 'weekly-modifier');
    badge.innerHTML = `<b>${modifier.name}</b> — ${modifier.blurb}`;
    return badge;
  }

  private weeklyTrackChips(def: WeeklyDef): HTMLElement {
    const row = el('div', 'weekly-tracks');
    def.tracks.forEach((t, i) => {
      const chip = el('span', 'cup-track-chip');
      chip.style.setProperty('--accent', t.accentName);
      chip.append(el('span', 'cup-chip-num', String(i + 1)));
      chip.append(el('span', 'cup-chip-name', t.name.toUpperCase()));
      row.append(chip);
    });
    return row;
  }

  showWeeklyCard(): void {
    this.weeklyScreen.replaceChildren();
    const forced = new URLSearchParams(window.location.search).get('week');
    const weekKey = forced && isValidWeekKey(forced) ? forced : weekKeyFor(new Date());
    const def = weeklyFor(weekKey);
    const w = this.save.weekly;
    const run = w.run && w.run.weekKey === weekKey ? w.run : null;
    const panel = el('div', 'panel friend-panel daily-panel weekly-panel');
    panel.style.setProperty('--accent', def.tracks[0].accentName);
    panel.append(el('div', 'fh-title', 'WEEKLY EVENT'));
    panel.append(el('div', 'daily-date', `${weekKey.slice(0, 4)} · WEEK ${weekKey.slice(5)}`));
    panel.append(this.weeklyModifierBadge(def.modifier));
    panel.append(this.weeklyTrackChips(def));
    const seen = new Set<string>();
    const roster: { name: string; tier: string; paint: number }[] = [];
    for (const lu of def.lineups) {
      for (const r of lu) {
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        roster.push(r);
      }
    }
    panel.append(this.dailyLineupRows(roster));
    panel.append(el('div', 'daily-meta', `3 RACES · ${def.laps} LAPS EACH · 2 MID + 1 PRO · 25/18/15/12 PTS`));
    if (run && run.positions.length > 0) {
      const done = el('div', 'cup-race-history');
      run.positions.forEach((p, i) => done.append(el('span', 'cup-race-pill', `R${i + 1} <b>P${p}</b>`)));
      panel.append(done);
    }
    const best = w.best[weekKey];
    if (best) panel.append(el('div', 'daily-result', `DONE: P${best.position} · ${best.points} PTS`));
    if (w.streak > 0) panel.append(el('div', 'daily-streak-line', `STREAK ${w.streak}`));
    const weekDone = !!best;
    const race = el('button', 'menu-btn primary', run && run.positions.length > 0 && !weekDone ? `RESUME · RACE ${run.nextRace + 1}/${WEEKLY_RACES}` : weekDone ? 'RE-RACE THIS WEEK' : 'RACE THIS WEEK');
    race.addEventListener('click', () => this.onStartWeekly());
    const back = el('button', 'menu-btn', 'BACK');
    back.addEventListener('click', () => this.show('title'));
    panel.append(race, back);
    this.weeklyScreen.append(panel);
    this.hideAll();
    this.weeklyScreen.classList.remove('hidden');
  }

  showWeeklyInterstitial(def: WeeklyDef, raceIndex: number): void {
    this.weeklyScreen.replaceChildren();
    const idx = Math.max(0, Math.min(WEEKLY_RACES - 1, raceIndex));
    const panel = el('div', 'panel career-panel');
    panel.style.setProperty('--accent', def.tracks[idx].accentName);
    panel.append(el('div', 'fh-title', 'WEEKLY EVENT'));
    panel.append(el('h2', 'screen-title', `RACE ${idx + 1}/${WEEKLY_RACES}`));
    const sub = el('div', 'cup-race-track');
    sub.innerHTML = `<span class="cup-chip-num">${idx + 1}</span> ${def.tracks[idx].name.toUpperCase()} · ${def.laps} LAPS`;
    panel.append(sub);
    panel.append(this.weeklyModifierBadge(def.modifier));
    const run = this.save.getWeeklyRun();
    if (run && run.weekKey === def.weekKey && run.positions.length > 0) {
      panel.append(this.careerStandingsTable(weeklyStandings(run), 'STANDINGS'));
      const done = el('div', 'cup-race-history');
      run.positions.forEach((p, i) => done.append(el('span', 'cup-race-pill', `R${i + 1} <b>P${p}</b>`)));
      panel.append(done);
    }
    const start = el('button', 'menu-btn primary', 'START RACE');
    start.addEventListener('click', () => this.onWeeklyStartRace(idx));
    const leave = el('button', 'menu-btn', 'LEAVE');
    leave.addEventListener('click', () => this.show('title'));
    panel.append(start, leave);
    this.weeklyScreen.append(panel);
    this.hideAll();
    this.weeklyScreen.classList.remove('hidden');
  }

  showWeeklyImport(link: WeeklyShareLink): void {
    this.weeklyScreen.replaceChildren();
    const live = weekIsLive(link.weekKey);
    const def = weeklyFor(link.weekKey);
    const panel = el('div', 'panel friend-panel daily-panel weekly-panel');
    panel.style.setProperty('--accent', def.tracks[0].accentName);
    panel.append(el('div', 'fh-title', 'WEEKLY EVENT'));
    panel.append(el('h2', 'screen-title', 'BEAT MY SCORE'));
    panel.append(el('div', 'daily-date', `${link.weekKey.slice(0, 4)} · WEEK ${link.weekKey.slice(5)}`));
    panel.append(this.weeklyModifierBadge(def.modifier));
    panel.append(el('div', 'daily-result', `THEIR WEEK: ${link.points} PTS · P${link.position}`));
    panel.append(el('div', 'daily-meta', live ? 'THIS WEEK&#8217;S EVENT' : 'THAT WEEK&#8217;S EVENT — WEEKLIES ARE ONLY PLAYABLE THE WEEK THEY RUN'));
    const race = el('button', 'menu-btn primary', 'RACE THIS WEEK&#8217;S EVENT') as HTMLButtonElement;
    race.disabled = !live;
    race.addEventListener('click', () => {
      if (race.disabled) return;
      this.onStartWeekly();
    });
    const dismiss = el('button', 'menu-btn', 'DISMISS');
    dismiss.addEventListener('click', () => this.show('title'));
    panel.append(race, dismiss);
    this.weeklyScreen.append(panel);
    this.hideAll();
    this.weeklyScreen.classList.remove('hidden');
  }

  showToast(text: string): void {
    if (!this.toastEl) {
      this.toastEl = el('div', 'menu-toast');
      document.body.append(this.toastEl);
    }
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl?.classList.remove('show'), 2200);
  }

  private buildPause(): HTMLElement {
    const screen = el('div', 'screen overlay-screen hidden');
    const panel = el('div', 'panel');
    panel.append(el('h2', 'screen-title', 'PAUSED'));
    const resume = el('button', 'menu-btn primary', 'RESUME');
    resume.addEventListener('click', () => this.onResume());
    const practice = el('button', 'menu-btn', 'PRACTICE MODE');
    practice.id = 'practice-btn';
    practice.addEventListener('click', () => this.onPractice());
    const restart = el('button', 'menu-btn', 'RESTART TRACK');
    restart.addEventListener('click', () => this.onRestart());
    const settings = el('button', 'menu-btn', 'SETTINGS');
    settings.addEventListener('click', () => {
      this.buildSettingsScreen();
      this.show('settings');
      this.settingsScreen.dataset.returnTo = 'pause';
    });
    const quit = el('button', 'menu-btn danger', 'QUIT TO MENU');
    quit.addEventListener('click', () => this.onQuitToMenu());
    panel.append(resume, practice, restart, settings, quit);
    screen.append(panel);
    return screen;
  }

  showPause(practiceAvailable: boolean): void {
    this.pausePractice = practiceAvailable;
    this.pauseScreen.classList.remove('hidden');
    const p = document.getElementById('practice-btn');
    if (p) p.classList.toggle('hidden', !practiceAvailable);
    this.titleScreen.classList.add('hidden');
    this.tracksScreen.classList.add('hidden');
    this.settingsScreen.classList.add('hidden');
  }

  hidePause(): void {
    this.pauseScreen.classList.add('hidden');
  }

  showFinish(track: TrackDef, result: FinishResult, hasNext: boolean, driftScore: number | null = null, standings: Standing[] | null = null, career: CareerPanelData | null = null, podium = false, daily: { dateKey: string; position: number; streak: number } | null = null, traffic: TrafficFinishData | null = null, weekly: WeeklyPanelData | null = null, variantRace = false): void {
    this.finishScreen.replaceChildren();
    const panel = el('div', 'panel finish-panel');
    const rivalMode = standings != null && standings.length > 0;
    const trafficMode = traffic != null;
    const careerFinal = career?.isFinal === true;
    const weeklyFinal = weekly?.isFinal === true;
    const titleText = careerFinal ? career!.cupName : track.name;
    let trophyHtml = '';
    if (careerFinal) {
      trophyHtml = career!.trophy
        ? `<div class="finish-medal banner-${career!.trophy}">${trophyLabel(career!.trophy)}</div>`
        : '<div class="finish-medal none">P4 — NO TROPHY</div>';
    } else if (weeklyFinal) {
      trophyHtml = weekly!.trophy
        ? `<div class="finish-medal banner-${weekly!.trophy}">${trophyLabel(weekly!.trophy)} — WEEKLY</div>`
        : `<div class="finish-medal none">P${weekly!.playerPos} — NO TROPHY</div>`;
    }
    const medalHtml = rivalMode
      ? result.knockout
        ? `<div class="finish-medal ko">KNOCKED OUT &middot; P${result.knockout.position}</div>`
        : ''
      : trafficMode
        ? ''
        : result.medal === 'none'
          ? '<div class="finish-medal none">NO MEDAL</div>'
          : `<div class="finish-medal banner-${result.medal}">${result.medal.toUpperCase()}</div>`;
    const variantHtml = variantRace ? '<div class="finish-daily variant-note">VARIANT RACE &mdash; NO PB</div>' : '';
    const deltaRows = rivalMode || trafficMode
      ? ''
      : result.splitDetail
          .map(
            (s, i) =>
              `<div class="delta-row"><span>CP ${i + 1}</span><span class="delta-split">${formatTimePrecise(s.splitMs)}</span><span class="${
                s.deltaMs === null ? 'delta-none' : s.deltaMs <= 0 ? 'delta-ahead' : 'delta-behind'
              }">${s.deltaMs === null ? '' : `${s.deltaMs <= 0 ? '−' : '+'}${(Math.abs(s.deltaMs) / 1000).toFixed(3)}`}</span></div>`,
          )
          .join('');
    const driftHtml =
      !rivalMode && driftScore !== null
        ? (() => {
            const best = this.save.trackSave(track.id).driftBest ?? 0;
            const suffix = variantRace ? '' : best > 0 && driftScore >= best ? ' &#127942; NEW BEST' : driftScore > 0 ? ` · BEST ${best}` : '';
            return `<div class="finish-drift">DRIFT SCORE <b>${Math.round(driftScore)}</b>${suffix}</div>`;
          })()
        : '';
    const deltaTable = deltaRows ? `<div class="finish-deltas">${deltaRows}</div>` : '';
    const ghostRows = rivalMode || trafficMode
      ? ''
      : (result.ghostResults ?? [])
          .map(
            (g) =>
              `<div class="delta-row ghost-finish-row"><span class="ghost-finish-label" style="color:${cssHex(g.color)}">${g.label}</span><span></span><span class="${
                g.deltaMs <= 0 ? 'delta-ahead' : 'delta-behind'
              }">${g.deltaMs <= 0 ? 'BEAT' : 'LOST'} BY ${(Math.abs(g.deltaMs) / 1000).toFixed(2)}s</span></div>`,
          )
          .join('');
    const ghostTable = ghostRows ? `<div class="finish-deltas finish-ghosts"><div class="fh-title">GHOST BATTLE</div>${ghostRows}</div>` : '';
    const history = rivalMode || trafficMode ? [] : this.save.trackSave(track.id).history.slice(0, 5);
    const historyHtml =
      history.length > 1 && driftScore === null
        ? `<div class="finish-history"><div class="fh-title">TOP TIMES</div>${history
            .map((t, i) => `<div class="delta-row"><span>${i + 1}</span><span class="delta-split">${formatTimePrecise(t)}</span><span></span></div>`)
            .join('')}</div>`
        : '';
    const bestHtml = rivalMode || trafficMode
      ? ''
      : `<div class="finish-best">${result.newBest ? '&#127942; NEW PERSONAL BEST' : `Best: ${formatTimePrecise(result.previousBest ?? result.timeMs)}`}</div>`;
    const dailyHtml = daily
      ? `<div class="finish-daily">DAILY: P${daily.position} · STREAK ${daily.streak}</div>`
      : '';
    const weeklyHtml = weekly
      ? `<div class="finish-daily">WEEKLY R${weekly.raceNumber}/${weekly.totalRaces}: P${weekly.playerPos} · +${weekly.racePoints} PTS · ${weekly.totalPoints} TOTAL</div>`
      : '';
    const trafficHtml = traffic
      ? `<div class="finish-daily">NEAR MISSES <b>${traffic.nearMisses}</b>${traffic.nearMisses > traffic.credited ? ` (${traffic.credited} CREDITED)` : ''} · BONUS &minus;${(traffic.bonusMs / 1000).toFixed(2)}s</div>
         <div class="finish-daily">SCORE <b>${formatTimePrecise(traffic.scoreMs)}</b></div>
         ${traffic.newBest ? '<div class="finish-medal banner-gold">&#127942; NEW TRAFFIC BEST</div>' : traffic.best != null ? `<div class="finish-best">Traffic best: ${formatTimePrecise(traffic.best)}</div>` : ''}`
      : '';
    panel.innerHTML = `
      <h2 class="screen-title">${titleText}</h2>
      <div class="finish-time">${formatTimePrecise(result.timeMs)}</div>
      ${trophyHtml}
      ${medalHtml}
      ${variantHtml}
      ${dailyHtml}
      ${weeklyHtml}
      ${trafficHtml}
      ${driftHtml}
      ${bestHtml}
      ${deltaTable}
      ${ghostTable}
      ${historyHtml}
    `;
    if (rivalMode) {
      const wrap = el('div', 'finish-positions');
      wrap.style.setProperty('--player-accent', cssHex(this.save.profile.paint));
      wrap.append(el('div', 'fh-title', career ? `RACE ${career.raceNumber}/${career.totalRaces} RESULT` : 'RACE RESULT'));
      const leader = standings![0];
      standings!.forEach((s, i) => {
        const row = el('div', 'fp-row' + (i < 3 ? ` podium-${i + 1}` : '') + (s.isPlayer ? ' you' : ''));
        const pos = el('span', 'fp-pos', `P${i + 1}`);
        const swatch = el('span', 'fp-swatch');
        swatch.style.background = cssHex(s.paint);
        const name = el('span', 'fp-name', s.name);
        const gap = el('span', 'fp-gap', finishGap(s, leader));
        row.append(pos, swatch, name, gap);
        wrap.append(row);
      });
      panel.append(wrap);
      if (career) {
        const table = this.careerStandingsTable(career.standings, careerFinal ? 'FINAL STANDINGS' : 'CUP STANDINGS');
        table.style.setProperty('--player-accent', cssHex(this.save.profile.paint));
        panel.append(table);
      }
      if (weekly) {
        const table = this.careerStandingsTable(weekly.standings, weekly.isFinal ? 'FINAL WEEKLY STANDINGS' : `WEEKLY STANDINGS · R${weekly.raceNumber}/${weekly.totalRaces}`);
        table.style.setProperty('--player-accent', cssHex(this.save.profile.paint));
        panel.append(table);
      }
    }
    if (weekly) {
      if (weekly.isFinal) {
        const share = el('button', 'menu-btn primary', 'SHARE RESULT');
        share.addEventListener('click', () => {
          if (share.textContent !== 'SHARE RESULT') return;
          share.textContent = 'SHARING…';
          void this.onShareWeekly().finally(() => {
            share.textContent = 'SHARE RESULT';
          });
        });
        panel.append(share);
        const done = el('button', 'menu-btn', 'BACK TO TITLE');
        done.addEventListener('click', () => {
          this.hideAll();
          this.show('title');
        });
        panel.append(done);
      } else {
        const next = el('button', 'menu-btn primary', 'NEXT RACE &#8594;');
        next.addEventListener('click', () => this.onWeeklyNextRace());
        const quit = el('button', 'menu-btn', 'SAVE &amp; QUIT');
        quit.addEventListener('click', () => this.onWeeklyQuit());
        panel.append(next, quit);
      }
      this.finishScreen.append(panel);
      this.finishScreen.classList.remove('hidden');
      return;
    }
    if (career) {
      if (careerFinal) {
        if (podium) {
          const pod = el('button', 'menu-btn', 'VIEW PODIUM');
          pod.addEventListener('click', () => this.onViewPodium());
          panel.append(pod);
        }
        const hub = el('button', 'menu-btn primary', 'CAREER HUB');
        hub.addEventListener('click', () => this.onCareerHubReturn());
        panel.append(hub);
      } else {
        const next = el('button', 'menu-btn primary', 'NEXT RACE &#8594;');
        next.addEventListener('click', () => this.onCareerNextRace());
        const quit = el('button', 'menu-btn', 'SAVE &amp; QUIT');
        quit.addEventListener('click', () => this.onCareerHubReturn());
        panel.append(next, quit);
      }
      this.finishScreen.append(panel);
      this.finishScreen.classList.remove('hidden');
      return;
    }
    const retry = el('button', 'menu-btn primary', 'RETRY');
    retry.addEventListener('click', () => this.onRestart());
    const replay = el('button', 'menu-btn', '&#9654; WATCH REPLAY');
    replay.addEventListener('click', () => this.onWatchReplay());
    if (podium) {
      const pod = el('button', 'menu-btn', 'VIEW PODIUM');
      pod.addEventListener('click', () => this.onViewPodium());
      panel.append(pod);
    }
    if (hasNext) {
      const next = el('button', 'menu-btn', 'NEXT TRACK &#8594;');
      next.addEventListener('click', () => {
        const idx = this.tracks.findIndex((t) => t.id === track.id);
        this.onPlayTrack(this.tracks[(idx + 1) % this.tracks.length]);
      });
      panel.append(next);
    }
    if (daily) {
      const shareDaily = el('button', 'menu-btn', 'SHARE RESULT');
      shareDaily.addEventListener('click', () => {
        if (shareDaily.textContent !== 'SHARE RESULT') return;
        shareDaily.textContent = 'SHARING…';
        void this.onShareDaily().finally(() => {
          shareDaily.textContent = 'SHARE RESULT';
        });
      });
      panel.append(shareDaily);
    }
    const menu = el('button', 'menu-btn', daily ? 'BACK TO TITLE' : 'TRACK SELECT');
    menu.addEventListener('click', () => {
      this.hideAll();
      this.show(daily ? 'title' : 'tracks');
    });
    panel.append(retry);
    if (!rivalMode && !trafficMode) panel.append(replay);
    if (!rivalMode && !trafficMode && !variantRace && this.save.trackSave(track.id).ghost) {
      const share = el('button', 'menu-btn', 'SHARE GHOST');
      share.addEventListener('click', () => {
        if (share.disabled) return;
        share.textContent = 'ENCODING…';
        share.disabled = true;
        void this.onShareGhost(track).finally(() => {
          share.textContent = 'SHARE GHOST';
          share.disabled = false;
        });
      });
      panel.append(share);
    }
    panel.append(menu);
    this.finishScreen.append(panel);
    this.finishScreen.classList.remove('hidden');
  }

  hideFinish(): void {
    this.finishScreen.classList.add('hidden');
  }

  hideAll(): void {
    this.isGarageOpen = false;
    for (const s of [this.titleScreen, this.tracksScreen, this.settingsScreen, this.garageScreen, this.achievementsScreen, this.statsScreen, this.careerScreen, this.pauseScreen, this.finishScreen, this.friendScreen, this.dailyScreen, this.weeklyScreen, this.onboardScreen]) {
      s.classList.add('hidden');
    }
  }

  show(screen: MenuScreen): void {
    this.hideAll();
    if (screen === 'title') {
      this.refreshDailyStreak();
      this.refreshWeeklyStreak();
      if (!this.save.settings.onboarded) {
        this.onboardScreen.classList.remove('hidden');
        return;
      }
      this.titleScreen.classList.remove('hidden');
    }
    else if (screen === 'tracks') {
      this.buildTracksScreen();
      this.tracksScreen.classList.remove('hidden');
    } else if (screen === 'settings') this.settingsScreen.classList.remove('hidden');
    else if (screen === 'garage') {
      this.isGarageOpen = true;
      this.garageScreen.classList.remove('hidden');
    }
    else if (screen === 'stats') {
      this.buildStats();
      this.statsScreen.classList.remove('hidden');
    }
    else if (screen === 'achievements') this.achievementsScreen.classList.remove('hidden');
    else if (screen === 'career') {
      this.careerCup = null;
      this.buildCareerHub();
      this.careerScreen.classList.remove('hidden');
    }
  }

  private patchSettings(patch: Partial<Settings>): void {
    this.save.updateSettings(patch);
    this.onSettingsChanged(this.save.settings);
  }
}
