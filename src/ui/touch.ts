import { el } from './common';
import type { InputManager } from '../core/input';

export class TouchControls {
  readonly root: HTMLElement;
  private leftBtn: HTMLElement;
  private rightBtn: HTMLElement;
  private gasBtn: HTMLElement;
  private brakeBtn: HTMLElement;
  private pauseBtn: HTMLElement;
  private respawnBtn: HTMLElement;
  private lookBtn: HTMLElement;
  onPause: () => void = () => {};

  constructor(private input: InputManager) {
    this.root = el('div', 'touch-controls hidden');

    const steerPad = el('div', 'tc-steer');
    this.leftBtn = el('button', 'tc-btn tc-left', '&#9664;');
    this.rightBtn = el('button', 'tc-btn tc-right', '&#9654;');
    steerPad.append(this.leftBtn, this.rightBtn);

    const pedalPad = el('div', 'tc-pedals');
    this.brakeBtn = el('button', 'tc-btn tc-brake', '<span>BRAKE</span>');
    this.gasBtn = el('button', 'tc-btn tc-gas', '<span>GAS</span>');
    pedalPad.append(this.brakeBtn, this.gasBtn);

    const utilPad = el('div', 'tc-utils');
    this.respawnBtn = el('button', 'tc-btn tc-small tc-respawn', '&#8634;');
    this.lookBtn = el('button', 'tc-btn tc-small tc-look', '&#128065;');
    utilPad.append(this.lookBtn, this.respawnBtn);

    this.pauseBtn = el('button', 'tc-btn tc-small tc-pause', 'II');

    this.root.append(steerPad, pedalPad, utilPad, this.pauseBtn);

    const hold = (btn: HTMLElement, on: () => void, off: () => void): void => {
      const start = (e: Event) => {
        e.preventDefault();
        btn.classList.add('pressed');
        on();
      };
      const end = (e: Event) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        off();
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', end);
    };

    hold(this.leftBtn, () => this.steerDir(-1), () => this.steerOff(-1));
    hold(this.rightBtn, () => this.steerDir(1), () => this.steerOff(1));
    hold(this.gasBtn, () => this.input.setTouch({ throttle: 1 }), () => this.input.setTouch({ throttle: 0 }));
    hold(this.brakeBtn, () => this.input.setTouch({ brake: 1 }), () => this.input.setTouch({ brake: 0 }));
    hold(this.lookBtn, () => this.input.setTouch({ lookBack: true }), () => this.input.setTouch({ lookBack: false }));

    this.respawnBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.setTouch({ respawn: true });
      window.setTimeout(() => this.input.setTouch({ respawn: false }), 80);
    });
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onPause();
    });
  }

  private steerDirs = new Set<number>();

  private steerDir(d: number): void {
    this.steerDirs.add(d);
    this.input.setTouch({ steer: d });
  }

  private steerOff(d: number): void {
    this.steerDirs.delete(d);
    if (this.steerDirs.size === 0) this.input.setTouch({ steer: 0 });
    else this.input.setTouch({ steer: [...this.steerDirs][0] });
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.input.setTouch({ steer: 0, throttle: 0, brake: 0, lookBack: false });
  }
}
