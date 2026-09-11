export interface InputFrame {
  steer: number;
  throttle: number;
  brake: number;
  drift: boolean;
  lookBack: boolean;
  respawn: boolean;
  restart: boolean;
  cameraToggle: boolean;
  pause: boolean;
  photo: boolean;
}

const KEY_STEER_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_STEER_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEY_THROTTLE = new Set(['ArrowUp', 'KeyW']);
const KEY_BRAKE = new Set(['ArrowDown', 'KeyS']);
const KEY_DRIFT = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const KEY_RESPAWN = new Set(['Backspace', 'KeyX']);
const KEY_RESTART = new Set(['KeyR', 'Enter']);
const KEY_CAMERA = new Set(['KeyC']);
const KEY_PAUSE = new Set(['Escape', 'KeyP']);
const KEY_LOOKBACK = new Set(['KeyQ', 'KeyB']);
const KEY_PHOTO = new Set(['KeyP']);

export class InputManager {
  private keysDown = new Set<string>();
  private touch = {
    steer: 0,
    throttle: 0,
    brake: 0,
    drift: false,
    respawn: false,
    restart: false,
    pause: false,
    camera: false,
    lookBack: false,
  };
  private prevAction = { respawn: false, restart: false, camera: false, pause: false, photo: false };
  private gamepadIndex: number | null = null;
  private tilt = { gamma: 0, active: false };
  private steerSmoothed = 0;
  private virtual: Partial<Pick<InputFrame, 'steer' | 'throttle' | 'brake' | 'drift'>> = {};

  setVirtual(v: Partial<Pick<InputFrame, 'steer' | 'throttle' | 'brake' | 'drift'>>): void {
    this.virtual = v;
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    window.addEventListener('deviceorientation', this.onDeviceOrientation);
  }

  private onGamepadConnected = (e: Event): void => {
    const gpe = e as GamepadEvent;
    if (this.gamepadIndex === null) this.gamepadIndex = gpe.gamepad.index;
  };

  private onGamepadDisconnected = (e: Event): void => {
    const gpe = e as GamepadEvent;
    if (this.gamepadIndex === gpe.gamepad.index) this.gamepadIndex = null;
  };

  private onDeviceOrientation = (e: DeviceOrientationEvent): void => {
    if (e.gamma === null) return;
    this.tilt.gamma = e.gamma;
    this.tilt.active = true;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keysDown.add(e.code);
    if (
      e.code === 'Space' ||
      e.code === 'Backspace' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private onBlur = (): void => {
    this.keysDown.clear();
  };

  setTouch(partial: Partial<typeof this.touch>): void {
    Object.assign(this.touch, partial);
  }

  requestTiltPermission(): Promise<boolean> {
    type RequestPermission = () => Promise<'granted' | 'denied'>;
    const doe = DeviceOrientationEvent as unknown as { requestPermission?: RequestPermission };
    if (typeof doe.requestPermission === 'function') {
      return doe
        .requestPermission()
        .then((r) => r === 'granted')
        .catch(() => false);
    }
    return Promise.resolve(true);
  }

  get gamepadConnected(): boolean {
    this.pollGamepads();
    return this.gamepadIndex !== null;
  }

  private pollGamepads(): void {
    if (this.gamepadIndex !== null) {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads[this.gamepadIndex];
      if (!pad) this.gamepadIndex = null;
    } else if (typeof navigator.getGamepads === 'function') {
      for (const pad of navigator.getGamepads()) {
        if (pad && pad.connected) {
          this.gamepadIndex = pad.index;
          break;
        }
      }
    }
  }

  rumble(strong: number, weak: number, ms: number): void {
    this.pollGamepads();
    if (this.gamepadIndex === null) return;
    const pad = navigator.getGamepads()[this.gamepadIndex];
    const act = pad?.vibrationActuator as
      | { playEffect?: (t: string, o: object) => Promise<unknown> }
      | undefined;
    if (act?.playEffect) {
      act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: ms,
        weakMagnitude: weak,
        strongMagnitude: strong,
      }).catch(() => {});
    }
  }

  sample(sensitivity: number): InputFrame {
    this.pollGamepads();
    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let drift = false;
    let lookBack = false;
    let photo = false;
    let respawn = false;
    let restart = false;
    let cameraToggle = false;
    let pause = false;

    for (const code of this.keysDown) {
      if (KEY_STEER_LEFT.has(code)) steer -= 1;
      else if (KEY_STEER_RIGHT.has(code)) steer += 1;
      else if (KEY_THROTTLE.has(code)) throttle = 1;
      else if (KEY_BRAKE.has(code)) brake = 1;
      else if (KEY_DRIFT.has(code)) drift = true;
      else if (KEY_LOOKBACK.has(code)) lookBack = true;
      else if (KEY_PHOTO.has(code)) photo = true;
      else if (KEY_RESPAWN.has(code)) respawn = true;
      else if (KEY_RESTART.has(code)) restart = true;
      else if (KEY_CAMERA.has(code)) cameraToggle = true;
      else if (KEY_PAUSE.has(code)) pause = true;
    }

    if (this.virtual.steer !== undefined && this.virtual.steer !== 0) steer = this.virtual.steer;
    if (this.virtual.throttle) throttle = Math.max(throttle, this.virtual.throttle);
    if (this.virtual.brake) brake = Math.max(brake, this.virtual.brake);
    if (this.virtual.drift) drift = true;

    if (this.touch.steer !== 0) steer = this.touch.steer;
    if (this.touch.throttle > 0) throttle = Math.max(throttle, this.touch.throttle);
    if (this.touch.brake > 0) brake = Math.max(brake, this.touch.brake);
    if (this.touch.drift) drift = true;
    if (this.touch.respawn) respawn = true;
    if (this.touch.restart) restart = true;
    if (this.touch.pause) pause = true;
    if (this.touch.camera) cameraToggle = true;
    if (this.touch.lookBack) lookBack = true;

    const pad = this.gamepadIndex !== null ? navigator.getGamepads()[this.gamepadIndex] : null;
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.12) steer = ax;
      const dead = (i: number) => {
        const v = pad.buttons[i]?.value ?? 0;
        return v > 0.08 ? v : 0;
      };
      throttle = Math.max(throttle, dead(7), pad.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, dead(6));
      if (pad.buttons[1]?.pressed) drift = true;
      if (pad.buttons[2]?.pressed) respawn = true;
      if (pad.buttons[3]?.pressed) restart = true;
      if (pad.buttons[5]?.pressed) cameraToggle = true;
      if (pad.buttons[9]?.pressed) pause = true;
      if (pad.buttons[4]?.pressed) lookBack = true;
    }

    if (this.tilt.active && Math.abs(this.tilt.gamma) > 2 && steer === 0) {
      const g = Math.max(-1, Math.min(1, this.tilt.gamma / 22));
      if (Math.abs(g) > 0.06) steer = g;
    }

    const target = Math.max(-1, Math.min(1, steer));
    const rate = target === 0 ? 10 : 7 * sensitivity;
    if (Math.abs(target - this.steerSmoothed) < 0.001) this.steerSmoothed = target;
    else {
      const step = rate * (1 / 60);
      this.steerSmoothed += Math.max(-step, Math.min(step, target - this.steerSmoothed));
    }

    const edgeRespawn = respawn && !this.prevAction.respawn;
    const edgeRestart = restart && !this.prevAction.restart;
    const edgeCamera = cameraToggle && !this.prevAction.camera;
    const edgePause = pause && !this.prevAction.pause;
    const edgePhoto = photo && !this.prevAction.photo;
    this.prevAction = { respawn, restart, camera: cameraToggle, pause, photo };

    return {
      steer: this.steerSmoothed,
      throttle,
      brake,
      drift,
      lookBack,
      respawn: edgeRespawn,
      restart: edgeRestart,
      cameraToggle: edgeCamera,
      pause: edgePause,
      photo: edgePhoto,
    };
  }
}
