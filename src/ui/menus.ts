import { el, formatTimePrecise } from './common';
import type { SaveManager, Settings, QualityTier } from '../core/save';
import type { TrackDef } from '../track/defs';
import type { FinishResult } from '../game/race';

export type MenuScreen = 'title' | 'tracks' | 'settings' | 'none';

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

export class MenuManager {
  readonly root: HTMLElement;
  onPlayTrack: (track: TrackDef) => void = () => {};
  onQuitToMenu: () => void = () => {};
  onResume: () => void = () => {};
  onRestart: () => void = () => {};
  onSettingsChanged: (s: Settings) => void = () => {};
  onTiltRequest: () => void = () => {};

  private titleScreen: HTMLElement;
  private tracksScreen: HTMLElement;
  private settingsScreen: HTMLElement;
  private pauseScreen: HTMLElement;
  private finishScreen: HTMLElement;

  constructor(private save: SaveManager, private tracks: TrackDef[]) {
    this.root = el('div', 'menu-layer');

    this.titleScreen = this.buildTitle();
    this.tracksScreen = el('div', 'screen hidden');
    this.settingsScreen = el('div', 'screen hidden');
    this.pauseScreen = this.buildPause();
    this.finishScreen = el('div', 'screen hidden');

    this.root.append(this.titleScreen, this.tracksScreen, this.settingsScreen, this.pauseScreen, this.finishScreen);
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
    const settings = el('button', 'menu-btn', 'SETTINGS');
    settings.addEventListener('click', () => {
      this.buildSettingsScreen();
      this.show('settings');
    });
    buttons.append(play, settings);
    const hint = el('div', 'title-hint', 'Keyboard · Touch · Gamepad supported');
    screen.append(logo, buttons, hint);
    return screen;
  }

  private buildTracksScreen(): void {
    this.tracksScreen.replaceChildren();
    const header = el('div', 'screen-header');
    header.append(el('h2', 'screen-title', 'SELECT TRACK'));
    const back = el('button', 'menu-btn small', '&#8592; BACK');
    back.addEventListener('click', () => this.show('title'));
    header.append(back);
    const grid = el('div', 'track-grid');
    this.tracks.forEach((track, i) => {
      const ts = this.save.trackSave(track.id);
      const ms = medalForTime(ts.bestTimeMs, track.medals);
      const card = el('button', 'track-card');
      const medalOrder: (keyof MedalState)[] = ['author', 'gold', 'silver', 'bronze'];
      const medalsRow = medalOrder
        .map((k) => `<span class="mini-medal ${ms && ms[k] ? `earned mm-${k}` : ''}" title="${k}"></span>`)
        .join('');
      card.innerHTML = `
        <div class="track-card-top" style="--accent:${track.accentName}">
          <span class="track-num">${String(i + 1).padStart(2, '0')}</span>
          <div>
            <div class="track-name">${track.name}</div>
            <div class="track-sub">${track.subtitle}</div>
          </div>
        </div>
        <div class="track-card-bottom">
          <div class="track-best">${ts.bestTimeMs != null ? formatTimePrecise(ts.bestTimeMs) : '&mdash;:--.---'}</div>
          <div class="track-medals">${medalsRow}</div>
        </div>
      `;
      card.addEventListener('click', () => {
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
    back.addEventListener('click', () => this.show('title'));
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

  private buildPause(): HTMLElement {
    const screen = el('div', 'screen overlay-screen hidden');
    const panel = el('div', 'panel');
    panel.append(el('h2', 'screen-title', 'PAUSED'));
    const resume = el('button', 'menu-btn primary', 'RESUME');
    resume.addEventListener('click', () => this.onResume());
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
    panel.append(resume, restart, settings, quit);
    screen.append(panel);
    return screen;
  }

  showPause(): void {
    this.pauseScreen.classList.remove('hidden');
    this.titleScreen.classList.add('hidden');
    this.tracksScreen.classList.add('hidden');
    this.settingsScreen.classList.add('hidden');
  }

  hidePause(): void {
    this.pauseScreen.classList.add('hidden');
  }

  showFinish(track: TrackDef, result: FinishResult, hasNext: boolean): void {
    this.finishScreen.replaceChildren();
    const panel = el('div', 'panel finish-panel');
    const medalHtml =
      result.medal === 'none'
        ? '<div class="finish-medal none">NO MEDAL</div>'
        : `<div class="finish-medal banner-${result.medal}">${result.medal.toUpperCase()}</div>`;
    panel.innerHTML = `
      <h2 class="screen-title">${track.name}</h2>
      <div class="finish-time">${formatTimePrecise(result.timeMs)}</div>
      ${medalHtml}
      <div class="finish-best">${result.newBest ? '&#127942; NEW PERSONAL BEST' : `Best: ${formatTimePrecise(result.previousBest ?? result.timeMs)}`}</div>
    `;
    const retry = el('button', 'menu-btn primary', 'RETRY');
    retry.addEventListener('click', () => this.onRestart());
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
    panel.append(retry, menu);
    this.finishScreen.append(panel);
    this.finishScreen.classList.remove('hidden');
  }

  hideFinish(): void {
    this.finishScreen.classList.add('hidden');
  }

  hideAll(): void {
    for (const s of [this.titleScreen, this.tracksScreen, this.settingsScreen, this.pauseScreen, this.finishScreen]) {
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
  }

  private patchSettings(patch: Partial<Settings>): void {
    this.save.updateSettings(patch);
    this.onSettingsChanged(this.save.settings);
  }
}
