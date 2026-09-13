import { el, formatTimePrecise } from './common';
import type { SaveManager, Settings, QualityTier, CupRunEntry, TrophyKind } from '../core/save';
import type { TrackDef } from '../track/defs';
import type { FinishResult } from '../game/race';
import type { Standing } from '../game/rivals';
import { CUPS, cupUnlock, cupTracks, cupStandings, startCupRun, type CupDef, type CareerPanelData } from '../game/career';
import { PAINTS, type CarBodyStyle } from '../render/car-model';
import { bodyUnlocks, bodyStatRatios, hasCupTrophy } from '../systems/garage';

function cssHex(paint: number): string {
  return '#' + paint.toString(16).padStart(6, '0');
}

function trophyLabel(t: TrophyKind): string {
  return t ? `${t.toUpperCase()} TROPHY` : '';
}

function finishGap(s: Standing, leader: Standing): string {
  if (s.finished && s.finishTimeMs != null) {
    if (leader.finished && leader.finishTimeMs != null && s !== leader) {
      return `+${((s.finishTimeMs - leader.finishTimeMs) / 1000).toFixed(1)}s`;
    }
    return formatTimePrecise(s.finishTimeMs);
  }
  return `DNF +${Math.round(s.gapMeters)}m`;
}

export type MenuScreen = 'title' | 'tracks' | 'settings' | 'garage' | 'achievements' | 'career' | 'none';

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
  readonly root: HTMLElement;
  onPlayTrack: (track: TrackDef) => void = () => {};
  onQuitToMenu: () => void = () => {};
  onResume: () => void = () => {};
  onPractice: () => void = () => {};
  onRestart: () => void = () => {};
  onSettingsChanged: (s: Settings) => void = () => {};
  onTiltRequest: () => void = () => {};

  onWatchReplay: () => void = () => {};
  onCareerStartRace: (cup: CupDef, raceIndex: number) => void = () => {};
  onCareerNextRace: () => void = () => {};
  onCareerHubReturn: () => void = () => {};
  onShareGhost: (track: TrackDef) => Promise<void> = async () => {};
  onFriendRace: (track: TrackDef) => void = () => {};

  private titleScreen: HTMLElement;
  private tracksScreen: HTMLElement;
  private settingsScreen: HTMLElement;
  private pauseScreen: HTMLElement;
  private finishScreen: HTMLElement;
  private garageScreen: HTMLElement;
  private achievementsScreen: HTMLElement;
  private careerScreen: HTMLElement;
  private friendScreen: HTMLElement;
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
    this.careerScreen = el('div', 'screen hidden');
    this.friendScreen = el('div', 'screen overlay-screen hidden');

    this.root.append(this.titleScreen, this.tracksScreen, this.settingsScreen, this.garageScreen, this.achievementsScreen, this.careerScreen, this.pauseScreen, this.finishScreen, this.friendScreen);
    this.buildTracksScreen();
  }

  private buildTitle(): HTMLElement {
    const screen = el('div', 'screen title-screen');
    const logo = el('div', 'game-logo');
    logo.innerHTML = `
      <div class="logo-race">RACE<span class="logo-2">2</span></div>
      <div class="logo-tag">TRACKMANIA-STYLE TIME ATTACK</div>
    `;
    const buttons = el('div', 'menu-buttons');
    const play = el('button', 'menu-btn primary', 'PLAY');
    play.addEventListener('click', () => this.show('tracks'));
    const career = el('button', 'menu-btn', 'CAREER');
    career.addEventListener('click', () => this.show('career'));
    const garage = el('button', 'menu-btn', 'GARAGE');
    garage.addEventListener('click', () => {
      this.buildGarage();
      this.show('garage');
    });
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
    buttons.append(play, career, garage, achievements, settings);
    const hint = el('div', 'title-hint', 'Keyboard · Touch · Gamepad supported');
    const credits = el('div', 'title-credits', `v1.2.0 — built with Three.js · © 2026 neima.me`);
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
      this.buildTracksScreen();
    });
    const rivalsChip = el('button', 'mode-chip rivals' + (this.rivalsMode ? ' on' : ''), 'RIVALS');
    rivalsChip.addEventListener('click', () => {
      this.rivalsMode = !this.rivalsMode;
      if (this.rivalsMode) this.driftAttack = false;
      this.buildTracksScreen();
    });
    right.append(driftChip, rivalsChip);
    right.append(el('div', 'star-total', `&#11088; ${totalStars}/48`));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    right.append(back);
    header.append(right);
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
    this.tracksScreen.append(header, grid);
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
      select(s.camera, [
        { value: 'chase', label: 'Chase' },
        { value: 'hood', label: 'Hood' },
      ], (v) => this.patchSettings({ camera: v })),
    );
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
    const paints = el('div', 'paint-grid');
    for (const p of PAINTS) {
      const sw = el('button', 'paint-swatch');
      sw.style.background = '#' + p.color.toString(16).padStart(6, '0');
      sw.title = p.name;
      if (p.color === profile.paint) sw.classList.add('selected');
      sw.addEventListener('click', () => {
        this.save.updateProfile({ paint: p.color });
        for (const s of paints.children) s.classList.remove('selected');
        sw.classList.add('selected');
        this.onGarageChange(p.color, this.save.profile.body);
      });
      paints.append(sw);
    }
    wrap.append(paints);

    const unlocks = bodyUnlocks(this.totalStars(), hasCupTrophy(this.save));
    const bodies = el('div', 'body-grid');
    for (const b of ['standard', 'aero', 'tank'] as CarBodyStyle[]) {
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
        if (!unlock.unlocked || b === this.save.profile.body) return;
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
    const defs: { name: string; desc: string; done: boolean; progress?: string }[] = [
      { name: 'First Blood', desc: 'Earn any medal', done: medaled > 0 },
      { name: 'Regular', desc: 'Medal 5 tracks', done: medaled >= 5, progress: `${medaled}/12` },
      { name: 'Collector', desc: 'Medal all 12 tracks', done: medaled >= 12, progress: `${medaled}/12` },
      { name: 'Golden Touch', desc: '3 gold medals', done: golds >= 3, progress: `${golds}/3` },
      { name: 'Midas Fleet', desc: 'Gold on every track', done: golds >= 12, progress: `${golds}/12` },
      { name: 'Dev Time', desc: '1 author medal', done: authors >= 1, progress: `${authors}/1` },
      { name: 'Studio Record', desc: 'Author on 6 tracks', done: authors >= 6, progress: `${authors}/6` },
      { name: 'Neima Standard', desc: 'Author on all 12 tracks', done: authors >= 12, progress: `${authors}/12` },
      { name: 'Star Struck', desc: '10 stars', done: total >= 10, progress: `${total}/10` },
      { name: 'Constellation', desc: '24 stars', done: total >= 24, progress: `${total}/24` },
      { name: 'Galaxy Brain', desc: '40+ stars', done: total >= 40, progress: `${total}/48` },
      { name: 'Completionist', desc: '48 stars — everything', done: total >= 48, progress: `${total}/48` },
      { name: 'Lane Hopper', desc: 'Complete 5 laps', done: st.laps >= 5, progress: `${Math.min(st.laps, 5)}/5` },
      { name: 'Sideways Society', desc: '10,000 drift points (lifetime)', done: st.totalDrift >= 10000, progress: `${Math.min(Math.round(st.totalDrift), 10000)}/10000` },
      { name: 'Frequent Flyer', desc: '60s of total air time', done: st.totalAir >= 60, progress: `${Math.min(Math.round(st.totalAir), 60)}/60s` },
      { name: 'Wallflower', desc: '50 wall hits — try the middle', done: st.wallHits >= 50, progress: `${Math.min(st.wallHits, 50)}/50` },
      { name: 'Marathoner', desc: 'Complete 25 laps', done: st.laps >= 25, progress: `${Math.min(st.laps, 25)}/25` },
      { name: 'Untouchable', desc: '3 laps with no wall hits', done: st.cleanLaps >= 3, progress: `${Math.min(st.cleanLaps, 3)}/3` },
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

  showToast(text: string): void {
    if (!this.toastEl) {
      this.toastEl = el('div', 'menu-toast');
      this.root.append(this.toastEl);
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

  showFinish(track: TrackDef, result: FinishResult, hasNext: boolean, driftScore: number | null = null, standings: Standing[] | null = null, career: CareerPanelData | null = null): void {
    this.finishScreen.replaceChildren();
    const panel = el('div', 'panel finish-panel');
    const rivalMode = standings != null && standings.length > 0;
    const careerFinal = career?.isFinal === true;
    const titleText = careerFinal ? career!.cupName : track.name;
    let trophyHtml = '';
    if (careerFinal) {
      trophyHtml = career!.trophy
        ? `<div class="finish-medal banner-${career!.trophy}">${trophyLabel(career!.trophy)}</div>`
        : '<div class="finish-medal none">P4 — NO TROPHY</div>';
    }
    const medalHtml = rivalMode
      ? ''
      : result.medal === 'none'
        ? '<div class="finish-medal none">NO MEDAL</div>'
        : `<div class="finish-medal banner-${result.medal}">${result.medal.toUpperCase()}</div>`;
    const deltaRows = rivalMode
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
            return `<div class="finish-drift">DRIFT SCORE <b>${Math.round(driftScore)}</b>${best > 0 && driftScore >= best ? ' &#127942; NEW BEST' : driftScore > 0 ? ` · BEST ${best}` : ''}</div>`;
          })()
        : '';
    const deltaTable = deltaRows ? `<div class="finish-deltas">${deltaRows}</div>` : '';
    const history = rivalMode ? [] : this.save.trackSave(track.id).history.slice(0, 5);
    const historyHtml =
      history.length > 1 && driftScore === null
        ? `<div class="finish-history"><div class="fh-title">TOP TIMES</div>${history
            .map((t, i) => `<div class="delta-row"><span>${i + 1}</span><span class="delta-split">${formatTimePrecise(t)}</span><span></span></div>`)
            .join('')}</div>`
        : '';
    const bestHtml = rivalMode
      ? ''
      : `<div class="finish-best">${result.newBest ? '&#127942; NEW PERSONAL BEST' : `Best: ${formatTimePrecise(result.previousBest ?? result.timeMs)}`}</div>`;
    panel.innerHTML = `
      <h2 class="screen-title">${titleText}</h2>
      <div class="finish-time">${formatTimePrecise(result.timeMs)}</div>
      ${trophyHtml}
      ${medalHtml}
      ${driftHtml}
      ${bestHtml}
      ${deltaTable}
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
    }
    if (career) {
      if (careerFinal) {
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
    if (hasNext) {
      const next = el('button', 'menu-btn', 'NEXT TRACK &#8594;');
      next.addEventListener('click', () => {
        const idx = this.tracks.findIndex((t) => t.id === track.id);
        this.onPlayTrack(this.tracks[(idx + 1) % this.tracks.length]);
      });
      panel.append(next);
    }
    const menu = el('button', 'menu-btn', 'TRACK SELECT');
    menu.addEventListener('click', () => {
      this.hideAll();
      this.show('tracks');
    });
    panel.append(retry);
    if (!rivalMode) panel.append(replay);
    if (!rivalMode && this.save.trackSave(track.id).ghost) {
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
    for (const s of [this.titleScreen, this.tracksScreen, this.settingsScreen, this.garageScreen, this.achievementsScreen, this.careerScreen, this.pauseScreen, this.finishScreen, this.friendScreen]) {
      s.classList.add('hidden');
    }
  }

  show(screen: MenuScreen): void {
    this.hideAll();
    if (screen === 'title') this.titleScreen.classList.remove('hidden');
    else if (screen === 'tracks') {
      this.buildTracksScreen();
      this.tracksScreen.classList.remove('hidden');
    } else if (screen === 'settings') this.settingsScreen.classList.remove('hidden');
    else if (screen === 'garage') {
      this.isGarageOpen = true;
      this.garageScreen.classList.remove('hidden');
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
