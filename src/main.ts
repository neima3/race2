import * as THREE from 'three';
import './styles.css';
import { InputManager } from './core/input';
import { SaveManager } from './core/save';
import { AudioEngine } from './core/audio';
import { TrackCurve } from './track/curve';
import { TRACKS, type TrackDef } from './track/defs';
import { buildTrackMeshes, type TrackMeshes } from './track/builder';
import { CarPhysics } from './physics/car';
import { buildCarVisual, type CarVisual } from './render/car-model';
import { SkidMarks } from './render/skidmarks';
import { buildEnvironment, type Environment } from './render/environment';
import { ParticleSystem } from './render/particles';
import { CameraRig } from './render/camera';
import { RaceController, type RaceEvents } from './game/race';
import { HUD } from './ui/hud';
import { MenuManager } from './ui/menus';
import { TouchControls } from './ui/touch';

type AppState = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';

const kmh = 3.6;

class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private input = new InputManager();
  private save = new SaveManager();
  private audio = new AudioEngine();
  private hud = new HUD();
  private particles = new ParticleSystem();
  private menu: MenuManager;
  private touch: TouchControls;

  private quality: 'low' | 'medium' | 'high' = 'medium';
  private environment: Environment | null = null;
  private trackGroup: THREE.Group | null = null;
  private meshes: TrackMeshes | null = null;
  private curve: TrackCurve | null = null;
  private car: CarPhysics | null = null;
  private carVisual: CarVisual | null = null;
  private ghostVisual: CarVisual | null = null;
  private race: RaceController | null = null;
  private track: TrackDef = TRACKS[0];

  private state: AppState = 'menu';
  private menuOrbitAngle = 0;
  private acc = 0;
  private lastT = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private lowFpsStreak = 0;
  private autoTimer: number | null = null;
  private autoStuck = 0;
  private autoTicks = 0;
  private autoDbg: Record<string, number> = {};
  private runtimeMuted: boolean;
  private offroadTime = 0;
  private boostKick = 0;
  private skidMarks: SkidMarks | null = null;
  private prevForwardSpeed = 0;
  private accelSmoothed = 0;
  private skidPrevL: THREE.Vector3 | null = null;
  private skidPrevR: THREE.Vector3 | null = null;
  private skidPrevL2: THREE.Vector3 | null = null;
  private skidPrevR2: THREE.Vector3 | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.runtimeMuted =
      new URLSearchParams(window.location.search).has('mute') ||
      (typeof navigator !== 'undefined' && navigator.webdriver === true);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.applyQualitySettings();

    this.menu = new MenuManager(this.save, TRACKS);
    this.touch = new TouchControls(this.input);
    document.getElementById('ui-root')!.append(this.hud.root, this.touch.root, this.menu.root);

    this.menu.onPlayTrack = (t) => this.startTrack(t);
    this.menu.onResume = () => this.resume();
    this.menu.onRestart = () => this.startTrack(this.track);
    this.menu.onQuitToMenu = () => this.quitToMenu();
    this.menu.onTiltRequest = () => void this.input.requestTiltPermission();
    this.menu.onSettingsChanged = (s) => {
      this.audio.setMusicEnabled(this.runtimeMuted ? false : s.music);
      this.audio.setSfxEnabled(this.runtimeMuted ? false : s.sfx);
      if (s.quality !== 'auto') {
        const q = s.quality;
        if (q !== this.quality) {
          this.quality = q;
          this.applyQualitySettings();
          this.rebuildScene();
        }
      }
      if (this.ghostVisual) this.ghostVisual.group.visible = s.showGhost;
    };
    this.touch.onPause = () => {
      if (this.state === 'racing' || this.state === 'countdown') this.pause();
    };

    this.loadTrackIntoScene(this.track);
    this.menu.show('title');

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'racing' || this.state === 'countdown')) this.pause();
    });
    window.addEventListener('pointerdown', () => this.audio.ensureContext(), { once: true });
    window.addEventListener('keydown', () => this.audio.ensureContext(), { once: true });

    this.applyAudioSettings();
    this.lastT = performance.now();
    requestAnimationFrame(this.frame);
  }

  private applyAudioSettings(): void {
    const music = this.runtimeMuted ? false : this.save.settings.music;
    const sfx = this.runtimeMuted ? false : this.save.settings.sfx;
    this.audio.setMusicEnabled(music);
    this.audio.setSfxEnabled(sfx);
  }

  private applyQualitySettings(): void {
    const s = this.save.settings.quality;
    if (s === 'auto') {
      const isMobile =
        matchMedia('(pointer: coarse)').matches ||
        navigator.maxTouchPoints > 0 ||
        'ontouchstart' in window;
      this.quality = isMobile ? 'low' : 'medium';
    } else {
      this.quality = s;
    }
    const dpr = window.devicePixelRatio;
    const maxDpr = this.quality === 'low' ? 1.4 : this.quality === 'medium' ? 1.8 : 2.2;
    this.renderer.setPixelRatio(Math.min(dpr, maxDpr));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.onResize();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
  }

  private clearTrackScene(): void {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
    }
    if (this.environment) this.scene.remove(this.environment.group);
    this.trackGroup = null;
    this.meshes = null;
    this.environment = null;
  }

  private rebuildScene(): void {
    this.clearTrackScene();
    this.loadTrackIntoScene(this.track);
  }

  private loadTrackIntoScene(def: TrackDef): void {
    this.clearTrackScene();
    this.track = def;
    const curve = new TrackCurve(def.points, true);
    this.curve = curve;

    this.environment = buildEnvironment(this.scene, this.quality);
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    this.scene.add(this.particles.points);

    this.meshes = buildTrackMeshes(curve, def);
    this.trackGroup.add(this.meshes.group);

    if (this.quality !== 'low') {
      this.meshes.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.receiveShadow = true;
      });
    }

    this.car = new CarPhysics(curve);
    this.car.placeAtFrame(0, 8);
    if (this.skidMarks) {
      this.scene.remove(this.skidMarks.mesh);
      this.skidMarks = null;
    }
    this.skidMarks = new SkidMarks();
    this.trackGroup.add(this.skidMarks.mesh);

    this.carVisual = buildCarVisual(0x29e6ff);
    this.carVisual.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = this.quality !== 'low';
    });
    this.trackGroup.add(this.carVisual.group);

    this.ghostVisual = buildCarVisual(0xffffff, true);
    this.ghostVisual.group.visible = false;
    this.trackGroup.add(this.ghostVisual.group);

    this.race = new RaceController(this.car, curve, def, this.save, <K extends keyof RaceEvents>(
      ev: K,
      payload?: RaceEvents[K]
    ) => this.onRaceEvent(ev, payload));

    this.rig.snapBehind(this.car.state);
    this.menuOrbitAngle = 0;
  }

  private startTrack(def: TrackDef): void {
    if (def.id !== this.track.id) {
      this.loadTrackIntoScene(def);
    } else {
      this.car!.placeAtFrame(0, 8);
      this.rig.snapBehind(this.car!.state);
    }
    this.state = 'countdown';
    this.menu.hideAll();
    this.menu.hidePause();
    this.hud.show(def.name, this.save.trackSave(def.id).bestTimeMs, def.checkpoints.length);
    const forceTouch = new URLSearchParams(window.location.search).has('touch');
    const isTouch =
      forceTouch ||
      matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      'ontouchstart' in window;
    if (isTouch) {
      this.touch.show();
      this.hud.root.classList.add('touch-active');
    }
    this.audio.ensureContext();
    this.audio.startEngine();
    this.audio.startMusic();
    this.race!.start();
    this.ghostVisual!.group.visible = this.save.settings.showGhost && this.race!.ghostActive;
    this.hud.clearCenter();
  }

  private pause(): void {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.menu.showPause();
    this.audio.suspend();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = this.race!.phase === 'countdown' ? 'countdown' : 'racing';
    this.menu.hidePause();
    this.audio.resume();
    this.lastT = performance.now();
  }

  private quitToMenu(): void {
    this.state = 'menu';
    this.menu.hidePause();
    this.menu.show('tracks');
    this.hud.hide();
    this.hud.showRespawnHint(false);
    this.touch.hide();
    this.audio.stopEngine();
    if (this.car) this.car.placeAtFrame(0, 8);
    if (this.ghostVisual) this.ghostVisual.group.visible = false;
    this.rig.snapBehind(this.car!.state);
  }

  private onRaceEvent<K extends keyof RaceEvents>(ev: K, payload?: RaceEvents[K]): void {
    if (ev === 'countdownTick') {
      const n = payload as unknown as number;
      this.audio.countdownBeep(false);
      this.hud.setCountdown(String(n), '');
    } else if (ev === 'go') {
      this.audio.countdownBeep(true);
      this.hud.setCountdown('GO!', 'go');
      if (this.state === 'countdown') this.state = 'racing';
      window.setTimeout(() => this.hud.clearCenter(), 900);
    } else if (ev === 'checkpoint') {
      const cp = payload as RaceEvents['checkpoint'];
      this.audio.checkpoint();
      this.hud.showSplit(cp);
    } else if (ev === 'boost') {
      this.audio.boost();
      this.input.rumble(0.7, 0.4, 220);
      this.rig.addShake(0.5);
      this.boostKick = 1;
    } else if (ev === 'wallHit') {
      this.audio.crash();
      this.input.rumble(0.9, 0.6, 180);
      this.rig.addShake(0.7);
      if (this.meshes && this.car) {
        const f = this.curve!.frames[this.car.state.trackIndex];
        const side = Math.sign(this.car.state.lateral) || 1;
        this.particles.wallSparks(
          this.car.state.pos.clone().addScaledVector(f.binormal, side * f.halfWidth),
          f.binormal.clone().multiplyScalar(-side),
        );
      }
    } else if (ev === 'landed') {
      const l = payload as RaceEvents['landed'];
      this.audio.land();
      this.input.rumble(0.8, 0.5, 140);
      this.rig.addShake(Math.min(0.9, l.airTime * 0.8));
      if (this.car) this.particles.landingDust(this.car.state.pos.clone());
      this.carVisual?.setBodyPose(0, 0, Math.min(0.34, l.airTime * 0.45));
    } else if (ev === 'respawn') {
      this.rig.snapBehind(this.car!.state);
    } else if (ev === 'finish') {
      const r = payload as RaceEvents['finish'];
      this.audio.finish(r.medal);
      this.input.rumble(0.5, 0.9, 500);
      this.hud.showFinish(r);
      this.particles.confetti(this.car!.state.pos.clone());
      window.setTimeout(() => {
        this.state = 'finished';
        this.hud.clearCenter();
        this.hud.showRespawnHint(false);
        const idx = TRACKS.findIndex((t) => t.id === this.track.id);
        this.menu.showFinish(this.track, r, idx < TRACKS.length - 1);
        this.touch.hide();
        this.audio.stopEngine();
      }, 1400);
    }
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 2) {
      const fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (fps < 42) this.lowFpsStreak++;
      else this.lowFpsStreak = 0;
      if (this.lowFpsStreak >= 2 && this.quality !== 'low' && this.save.settings.quality === 'auto') {
        this.quality = this.quality === 'high' ? 'medium' : 'low';
        this.applyQualitySettings();
        this.rebuildScene();
        this.lowFpsStreak = 0;
      }
    }

    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.rig.camera);
      return;
    }

    const input = this.input.sample(this.save.settings.steeringSensitivity);

    if (input.pause) {
      if (this.state === 'racing' || this.state === 'countdown') this.pause();
      else if (this.state === 'finished') this.quitToMenu();
    }

    if (this.state === 'menu') {
      this.menuOrbitAngle += dt * 0.08;
      if (this.curve && this.car) {
        const radius = 60;
        const cx = Math.cos(this.menuOrbitAngle) * radius;
        const cz = Math.sin(this.menuOrbitAngle) * radius - 90;
        this.rig.camera.position.set(cx, 34, cz);
        this.rig.camera.lookAt(0, 6, -90);
        this.carVisual!.group.position.copy(this.car.state.pos);
        this.carVisual!.group.quaternion.copy(this.car.state.quat);
      }
      this.environment?.update(this.rig.camera.position);
      this.renderer.render(this.scene, this.rig.camera);
      return;
    }

    const simDt = 1 / 120;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= simDt && steps < 8) {
      this.race!.update(simDt * 1000, input);
      this.acc -= simDt;
      steps++;
    }
    if (steps === 8) this.acc = 0;

    const s = this.car!.state;
    this.carVisual!.group.position.copy(s.pos);
    this.carVisual!.group.quaternion.copy(s.quat);
    const wheelR = 0.34;
    this.carVisual!.wheelSpin += (s.forwardSpeed / wheelR) * dt;
    const spin = this.carVisual!.wheelSpin;
    for (let i = 0; i < this.carVisual!.wheels.length; i++) {
      const w = this.carVisual!.wheels[i];
      w.rotation.x = spin;
      if (i < 2) w.rotation.y = -input.steer * 0.42;
    }

    const accel = (s.forwardSpeed - this.prevForwardSpeed) / Math.max(dt, 0.001);
    this.prevForwardSpeed = s.forwardSpeed;
    this.accelSmoothed += (accel - this.accelSmoothed) * Math.min(1, 6 * dt);
    const bodyRoll = -this.car!.currentYawRate * 0.055 - s.driftAmount * input.steer * 0.05;
    const bodyPitch = -this.accelSmoothed * 0.0032;
    const squash = s.grounded ? 0 : Math.min(0.3, s.airborneTime * 0.25);
    this.carVisual!.setBodyPose(bodyRoll, bodyPitch, squash);

    if (this.skidMarks) {
      this.skidMarks.fadeAll(dt);
      if (s.driftAmount > 0.3 && s.grounded && s.speed > 10) {
        const rearZ = -1.18;
        const offsets = [-0.92, 0.92].map((x) => new THREE.Vector3(x, -0.3, rearZ).applyQuaternion(s.quat).add(s.pos));
        const widthDir = new THREE.Vector3(1, 0, 0).applyQuaternion(s.quat).multiplyScalar(0.14);
        const l = offsets[0].clone().addScaledVector(widthDir, -1).setY(offsets[0].y - 0.28);
        const r = offsets[0].clone().addScaledVector(widthDir, 1).setY(offsets[0].y - 0.28);
        const l2 = offsets[1].clone().addScaledVector(widthDir, -1).setY(offsets[1].y - 0.28);
        const r2 = offsets[1].clone().addScaledVector(widthDir, 1).setY(offsets[1].y - 0.28);
        if (this.skidPrevL && this.skidPrevR) {
          this.skidMarks.addSegment(l, r, this.skidPrevL, this.skidPrevR, s.driftAmount);
          this.skidMarks.addSegment(l2, r2, this.skidPrevL2 ?? l2, this.skidPrevR2 ?? r2, s.driftAmount);
        }
        this.skidPrevL = l;
        this.skidPrevR = r;
        this.skidPrevL2 = l2;
        this.skidPrevR2 = r2;
      } else {
        this.skidPrevL = null;
        this.skidPrevR = null;
        this.skidPrevL2 = null;
        this.skidPrevR2 = null;
      }
    }

    if (this.state === 'racing') {
      const gh = this.race!.ghostSampleAt(this.race!.elapsedMs);
      if (gh && this.save.settings.showGhost) {
        this.ghostVisual!.group.visible = true;
        this.ghostVisual!.group.position.copy(gh.pos);
        this.ghostVisual!.group.quaternion.copy(gh.quat);
      } else {
        this.ghostVisual!.group.visible = false;
      }

      if (s.driftAmount > 0.32 && s.grounded && s.speed > 14 && Math.random() < 0.75) {
        const back = new THREE.Vector3(0, 0, -1.2).applyQuaternion(s.quat);
        const down = new THREE.Vector3(0, -0.3, 0).applyQuaternion(s.quat);
        this.particles.driftSmoke(s.pos.clone().add(back).add(down), s.vel, s.driftAmount);
      }
      if (s.boostTime > 0) {
        const back = new THREE.Vector3(0, 0.15, -1.9).applyQuaternion(s.quat);
        this.particles.boostFlames(s.pos.clone().add(back), new THREE.Vector3(0, 0, 1).applyQuaternion(s.quat), new THREE.Color(this.track.accent));
      }
      if (s.wallHit > 0.28 && Math.random() < 0.6) {
        const f = this.curve!.frames[s.trackIndex];
        const side = Math.sign(s.lateral) || 1;
        this.particles.wallSparks(s.pos.clone().addScaledVector(f.binormal, side * f.halfWidth), f.binormal.clone().multiplyScalar(-side));
      }

      const stuckOffroad = s.offroad && s.grounded && s.speed < 6;
      if (stuckOffroad) {
        this.offroadTime += dt;
      } else {
        this.offroadTime = 0;
      }
      this.hud.showRespawnHint(this.offroadTime > 1.5 && (this.state === 'racing' || this.state === 'countdown'));

      this.hud.update(
        this.race!.elapsedMs,
        Math.abs(s.forwardSpeed) * kmh,
        s.driftAmount > 0.35 && s.grounded,
        this.race!.nextCheckpoint,
        this.track.checkpoints.length,
      );
      this.audio.updateEngine(Math.min(1, Math.abs(s.forwardSpeed) / 58), input.throttle, !s.grounded);
    }

    if (this.state === 'finished') {
      const gh = this.race!.ghostSampleAt(this.race!.elapsedMs);
      void gh;
    }

    for (const pad of this.meshes!.boostPads) {
      const t = now * 0.002;
      pad.mat.map!.offset.y = -t % 1;
    }
    for (const gate of this.meshes!.checkpointGates) {
      const passed = this.race!.nextCheckpoint > this.meshes!.checkpointGates.indexOf(gate);
      gate.mat.color.set(passed ? 0x35ff7a : 0x7ef3ff);
    }

    this.rig.setLookBack(input.lookBack);
    this.rig.boostKick = this.boostKick;
    this.boostKick = 0;
    this.rig.update(dt, s);
    this.environment?.update(this.rig.camera.position);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.rig.camera);
  };
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

declare global {
  interface Window {
    __race2: {
      inst: Game;
      start: (trackIndex: number) => void;
      drive: (v: { steer?: number; throttle?: number; brake?: number; drift?: boolean }) => void;
      auto: (on: boolean) => string;
      state: () => object;
      respawn: () => void;
      skipCountdown: () => void;
      mute: () => void;
      finishLine: () => void;
    };
  }
}

window.__race2 = {
  inst: game,
  start: (trackIndex: number) => game['startTrack'](TRACKS[Math.max(0, Math.min(TRACKS.length - 1, trackIndex))]),
  auto: (on: boolean) => {
    if (!on) {
      game['input'].setVirtual({ steer: 0, throttle: 0, brake: 0, drift: false });
      if (game['autoTimer'] !== null) {
        clearInterval(game['autoTimer'] as unknown as number);
        game['autoTimer'] = null;
      }
      return 'off';
    }
    if (game['autoTimer'] !== null) return 'already';
    game['autoTimer'] = setInterval(() => {
      game['autoTicks'] = (game['autoTicks'] ?? 0) + 1;
      try {
        const car = game['car'];
        const race = game['race'];
        if (!car || !race) return;
      const s = car.state;
      const curve = car['curve'];
      const frame = curve.frames[s.trackIndex];
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quat);
      const cross = new THREE.Vector3().crossVectors(fwd, frame.tangent).dot(frame.normal);
      const dot = Math.max(-1, Math.min(1, fwd.dot(frame.tangent)));
      const headingErr = Math.atan2(cross, dot);
      if (Math.abs(headingErr) > 2.2) {
        race.respawnAtCheckpoint();
        return;
      }
      if (s.speed < 2.5 && Math.abs(s.lateral) > frame.halfWidth + 1.4) {
        game['autoStuck']++;
      } else if (Math.abs(s.lateral) > frame.halfWidth + 1.6) {
        game['autoStuck'] += 3;
      } else {
        game['autoStuck'] = 0;
      }
      if (game['autoStuck'] > 60) {
        game['autoStuck'] = 0;
        race.respawnAtCheckpoint();
        return;
      }
      const lookahead = 12 + s.speed * 0.55;
      const targetFrame = {
        pos: new THREE.Vector3(),
        tangent: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        binormal: new THREE.Vector3(),
        halfWidth: 0,
        dist: 0,
      };
      curve.frameAtDist(s.trackDist + lookahead, targetFrame);
      const invQ = s.quat.clone().invert();
      const local = targetFrame.pos.clone().sub(s.pos).applyQuaternion(invQ);
      const angle = Math.atan2(local.x, local.z);
      const steer = Math.max(-1, Math.min(1, -angle * 2.4));
      const absA = Math.abs(angle);
      const throttle = absA > 1.1 ? 0.2 : absA > 0.45 ? 0.5 : 1;
      const brake = absA > 0.9 && s.speed > 4 ? 0.8 : 0;
      game['autoDbg'] = { angle: +angle.toFixed(2), steer: +steer.toFixed(2), throttle, brake, heading: +headingErr.toFixed(2), lat: +s.lateral.toFixed(1), spd: +s.speed.toFixed(1) };
      game['input'].setVirtual({ steer, throttle, brake, drift: false });
      } catch (e) {
        game['autoDbg'] = { err: 1, msg: 0 };
        (window as unknown as { __aerr2: string }).__aerr2 = String(e);
      }
    }, 50) as unknown as number;
    return 'on';
  },
  drive: (v) => game['input'].setVirtual(v),
  state: () => {
    const race = game['race'];
    const car = game['car'];
    return {
      appState: game['state'],
      phase: race?.phase,
      timeMs: Math.round(race?.elapsedMs ?? 0),
      nextCp: race?.nextCheckpoint,
      cpTotal: game['track'].checkpoints.length,
      pos: car ? { x: +car.state.pos.x.toFixed(1), y: +car.state.pos.y.toFixed(1), z: +car.state.pos.z.toFixed(1) } : null,
      speedMs: car ? +car.state.speed.toFixed(1) : 0,
      forwardMs: car ? +car.state.forwardSpeed.toFixed(1) : 0,
      grounded: car?.state.grounded,
      trackDist: car ? Math.round(car.state.trackDist) : 0,
      trackLen: car ? Math.round(car['curve'].length ?? 0) : 0,
      lateral: car ? +car.state.lateral.toFixed(1) : 0,
      track: game['track'].id,
      fov: +game['rig'].camera.fov.toFixed(0),
      countdownMs: Math.round(game['race']?.countdownMs ?? -1),
      acc: +game['acc'].toFixed(4),
      lastT: Math.round(game['lastT']),
      perfNow: Math.round(performance.now()),
      autoDbg: game['autoDbg'],
    };
  },
      respawn: () => game['race']?.respawnAtCheckpoint(),
      skipCountdown: () => {
        if (game['race']) game['race'].countdownMs = 1;
      },
      mute: () => {
        game['audio'].setMusicEnabled(false);
        game['audio'].setSfxEnabled(false);
        game['audio'].suspend();
      },
  finishLine: () => {
    const race = game['race'];
    const car = game['car'];
    if (race && car && game['track'].checkpoints.length === race.nextCheckpoint) {
      const frames = game['curve']!.frames.length;
      car.placeAtFrame(frames - 40, car['curve'].length - 30);
      race['prevDist'] = car['curve'].length - 30;
      car.applyBoost(30, 3);
    }
  },
};

