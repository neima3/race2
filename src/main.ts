import * as THREE from 'three';
import './styles.css';
import { InputManager } from './core/input';
import { SaveManager } from './core/save';
import { AudioEngine } from './core/audio';
import { TrackCurve } from './track/curve';
import { TRACKS, THEMES, VARIANTS, type TrackDef, type TrackVariant } from './track/defs';

function curveLen(def: TrackDef): number {
  return new TrackCurve(def.points, true, 6).length;
}
import { buildTrackMeshes, buildTutorialRig, type TrackMeshes, type TutorialRig } from './track/builder';
import { CarPhysics, BODY_TUNING } from './physics/car';
import { buildCarVisual, contactShadowTexture, type CarVisual } from './render/car-model';
import { SkidMarks } from './render/skidmarks';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GarageSystem } from './systems/garage';
import { buildTrackProps } from './render/props';
import { autopilotDrive } from './systems/autopilot';
import { el } from './ui/common';
import { buildEnvironment, type Environment } from './render/environment';
import { ParticleSystem, RainSystem } from './render/particles';
import { CameraRig, type CameraMode } from './render/camera';
import type { CarState } from './physics/car';
import { RaceController, deserializeGhost, GHOST_COLORS, type GhostLabel, type GhostSample, type RaceEvents } from './game/race';
import {
  ReplayBuffer,
  TheaterUI,
  REPLAY_SPEEDS,
  advanceReplayTime,
  clampReplayTime,
  defaultAutoCuts,
  sampleReplayAt,
  type ReplayEntry,
} from './ui/replay';
import { decodeGhostCode, encodeGhostCode, buildShareLink, parseShareLink, buildReplayLink, parseReplayLink, ShareError } from './game/share';
import { buildDailyLink, dailyFor, parseDailyLink, todayKey, DAILY_LAPS, type DailyShareLink } from './game/daily';
import {
  WEEKLY_LAPS,
  WEEKLY_RACES,
  buildWeeklyLink,
  parseWeeklyLink,
  isValidWeekKey,
  weekKeyFor,
  weeklyFor,
  weeklyRaceTrack,
  weeklyVariant,
  weeklyComplete,
  weeklyTrophy,
  weeklyStandings,
  startWeeklyRun,
  applyWeeklyResult,
  type WeeklyDef,
  type WeeklyPanelData,
} from './game/weekly';
import { RivalManager, DEFAULT_RIVAL_LAPS, KNOCKOUT_LAPS, tauntFor, type RivalMode, type Standing, type RivalPreset, type KnockoutEvent } from './game/rivals';
import { variantWritesRecords } from './game/variants';
import { DraftTracker, gapAhead, DRAFT_GAP_MIN, DRAFT_GAP_MAX } from './game/draft';

import {
  TutorialRun,
  TUTORIAL_TRACK_ID,
  TUTORIAL_RINGS,
  TUTORIAL_PADS,
  DRILL_START_DIST,
  DRIFT_ACTIVE_MIN_SPEED,
  BRAKE_MAX_KMH,
  DRIFT_MIN_SECONDS,
  type TutorialEvent,
} from './game/tutorial';
import { computeOnSlick, moverOverlap, applyMoverScrub, surfaceGripFor } from './game/rules';
import { TrafficManager, NEAR_MISS_BONUS_MS, NEAR_MISS_MAX_CREDITED, type TrafficFinishData } from './systems/traffic';
import { cupRaceTrack, cupLineup, cupRaceVariant, applyRaceResult, cupStandings, cupTrophy, cupComplete, startCupRun, type CupDef, type CareerPanelData } from './game/career';
import { achievementPops, achievementList, rivalAchievementState, GHOSTBUST_MARGIN_MS, NEEDLE_NEAR_MISSES, type RivalAchievementState } from './game/achievements';
import { driverStats } from './game/stats';
import { checkPaintUnlocks, PAINT_LOCK_INFO, paintUnlockState } from './game/unlocks';
import { PAINT_LOCK_IDS, type PaintLockId } from './render/car-model';
import type { TrophyKind } from './core/save';
import { HUD } from './ui/hud';
import { MenuManager } from './ui/menus';
import { TouchControls } from './ui/touch';

type AppState = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished' | 'replay' | 'photo';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

const kmh = 3.6;
const EMPTY_DOTS: { x: number; z: number; paint: number }[] = [];

function cssHex(paint: number): string {
  return '#' + paint.toString(16).padStart(6, '0');
}

function parseVariantParam(v: string | null): TrackVariant | null {
  return v === 'day' || v === 'dusk' || v === 'night' || v === 'rain' ? v : null;
}

class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private input = new InputManager();
  private save = new SaveManager();
  private audio = new AudioEngine();
  private hud = new HUD();
  private garage: GarageSystem;
  private particles = new ParticleSystem();
  private menu: MenuManager;
  private touch: TouchControls;

  private quality: 'low' | 'medium' | 'high' = 'medium';
  private autoDowngrade: 'low' | 'medium' | null = null;
  private environment: Environment | null = null;
  private trackGroup: THREE.Group | null = null;
  private meshes: TrackMeshes | null = null;
  private curve: TrackCurve | null = null;
  private car: CarPhysics | null = null;
  private sceneBody: 'standard' | 'aero' | 'tank' = 'standard';
  private carVisual: CarVisual | null = null;
  private ghostVisuals: CarVisual[] = [];
  private race: RaceController | null = null;
  private rivals: RivalManager | null = null;
  private rivalMode = false;
  private knockoutMode = false;
  private trafficMode = false;
  private traffic: TrafficManager | null = null;
  private rivalLineup: RivalPreset[] | null = null;
  private rivalsBuiltWith: string | null = null;
  private championInRace = false;
  private championBeaten = false;
  private banterIdx = 0;
  private banterPending: { line: string; atMs: number } | null = null;
  private playerDraft = new DraftTracker();
  private draftGap = -1;
  private playerRef = { dist: 0, lateral: 0 };
  private careerRace: { cup: CupDef; raceIndex: number } | null = null;
  private hudAcc = 0;
  private mapAcc = 0;
  private moverSnap: { dist: number; lat: number }[] = [];
  private track: TrackDef = TRACKS[0];
  private urlVariant: TrackVariant | null = parseVariantParam(new URLSearchParams(window.location.search).get('variant'));
  private devOverrides = new URLSearchParams(window.location.search);
  private variant: TrackVariant = 'day';
  private rainFx: RainSystem | null = null;

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
  private autoSmooth = { smooth: 0 };
  private autoDbg: Record<string, number> = {};
  private runtimeMuted: boolean;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private offroadTime = 0;
  private wasOnSlick = false;
  private lapDrift = 0;
  private lapAir = 0;
  private lapWalls = 0;
  private moverCooldown = new Set<number>();
  private boostKick = 0;
  private skidMarks: SkidMarks | null = null;
  private shadowBlob: THREE.Sprite | null = null;
  private frameMsAvg = 16;
  private resScale = 1;
  private prevForwardSpeed = 0;
  private accelSmoothed = 0;
  private skidPrevL: THREE.Vector3 | null = null;
  private skidPrevR: THREE.Vector3 | null = null;
  private skidPrevL2: THREE.Vector3 | null = null;
  private skidPrevR2: THREE.Vector3 | null = null;
  private slowmoUntil = 0;
  private lastPlayerPos = 0;
  private overtakeCooldownUntil = 0;
  private wasDrifting = false;
  private lastPodiumOrder: Standing[] | null = null;
  private podium: {
    group: THREE.Group;
    angle: number;
    center: THREE.Vector3;
    camPos: THREE.Vector3;
    timers: number[];
    cleanup: () => void;
  } | null = null;
  private podiumUi: HTMLElement | null = null;
  private photo: { yaw: number; pitch: number; dist: number; filterIdx: number } | null = null;
  private photoUi: HTMLElement | null = null;
  private readonly photoFilters = ['none', 'sepia(0.5) saturate(1.3)', 'hue-rotate(180deg) saturate(1.2)', 'grayscale(1)'];
  private ringsHit = new Set<string>();
  private driftScore = 0;
  private driftMode = false;
  private tutorialMode = false;
  private tutorial: TutorialRun | null = null;
  private tutorialRig: TutorialRig | null = null;
  private tutorialProgressText = '';
  private tutorialSplashPending: string | null = null;
  private tutorialDropTimer: number | null = null;
  private tutorialSample = { dist: 0, lateral: 0, speedKmh: 0, drifting: false };
  private replayCar: CarVisual | null = null;
  /** v8 P8 theater state: null when not watching; speed/playing are theater-only. */
  private replay: {
    samples: GhostSample[];
    t: number;
    startMs: number;
    endMs: number;
    camPos: THREE.Vector3;
    nextCut: number;
    speed: number;
    playing: boolean;
    autoCuts: boolean;
  } | null = null;
  private replayBuffer = new ReplayBuffer();
  private replayList: ReplayEntry[] = [];
  private replayIdx = -1;
  private theater: TheaterUI;
  private replayCam: CameraMode = 'chase';
  private replayCutHint = 0;
  private replaySpd = { v: 0 };
  private replayPos = new THREE.Vector3();
  private replayQuat = new THREE.Quaternion();
  /** Minimal CarState view of the replay car for the P1 rig in manual-cam theater mode. */
  private replayFake: CarState = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(),
    grounded: true,
    offroad: false,
    driftAmount: 0,
    speed: 0,
    forwardSpeed: 0,
    trackIndex: 0,
    trackDist: 0,
    lateral: 0,
    airborneTime: 0,
    boostTime: 0,
    wallHit: 0,
    onSlick: false,
    surfaceGrip: 1,
    landedAt: 0,
  };
  private photoFrom: 'racing' | 'replay' = 'racing';
  private lastFinish: { result: RaceEvents['finish']; hasNext: boolean; drift: number | null; standings: Standing[] | null; career: CareerPanelData | null; podium: boolean; daily: { dateKey: string; position: number; streak: number } | null; traffic: TrafficFinishData | null; weekly: WeeklyPanelData | null } | null = null;
  private friendGhost: { trackId: string; timeMs: number; samples: GhostSample[] } | null = null;
  /** v9 P3: imported #r= friend replay — session-only (in-memory), never persisted to the save. */
  private friendReplay: { trackId: string; timeMs: number; samples: GhostSample[] } | null = null;
  /** Decoded friend ghosts per track (from #g= imports this session + persisted save), so ghost battles survive reloads. */
  private friendGhostCache: Record<string, { timeMs: number; samples: GhostSample[] }> = {};
  private friendRaceActive = false;
  private ghostDotBuf: { x: number; z: number; color: string }[] = [
    { x: 0, z: 0, color: '#fff' },
    { x: 0, z: 0, color: '#fff' },
    { x: 0, z: 0, color: '#fff' },
  ];
  private ghostDotView: { x: number; z: number; color: string }[] = this.ghostDotBuf;
  private ghostRatioBuf: (number | null)[] = [null, null, null];
  private ghostPosBuf: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private ghostQuatBuf: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  /** Car paint per ghost label; PB keeps the translucent player paint (existing look). */
  private ghostCarPaint(label: GhostLabel): number {
    return label === 'PB' ? this.save.profile.paint : label === 'FRIEND' ? GHOST_COLORS.FRIEND : GHOST_COLORS.BOT;
  }
  private shareBusy = false;
  private dailyRace: { dateKey: string } | null = null;
  private weeklyRace: { def: WeeklyDef; raceIndex: number } | null = null;
  private canvasEl: HTMLCanvasElement = canvas;
  private get canvas(): HTMLCanvasElement { return this.canvasEl; }
  private photoCleanup: (() => void) | null = null;
  private debugCensus = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

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
    this.rig.fovPref = this.save.settings.fov;
    this.rig.setMode(this.save.settings.cam);
    this.applyQualitySettings();

    this.touch = new TouchControls(this.input);
    this.menu = new MenuManager(this.save, TRACKS);
    if (this.save.settings.leftyTouch) this.touch.root.classList.add('touch-lefty');
    if (this.save.settings.hudContrast) document.documentElement.classList.add('hud-contrast');
    document.getElementById('ui-root')!.append(this.hud.root, this.touch.root, this.menu.root);

    this.menu.onPlayTrack = (t) => {
      this.driftMode = this.menu.driftAttack;
      this.careerRace = null;
      this.rivalLineup = null;
      this.dailyRace = null;
      this.startTrack(t);
    };
    this.menu.onCareerStartRace = (cup, raceIndex) => {
      this.careerRace = { cup, raceIndex };
      this.rivalLineup = cupLineup(cup, raceIndex);
      this.menu.trafficMode = false;
      this.dailyRace = null;
      this.startTrack(cupRaceTrack(cup, raceIndex));
    };
    this.menu.onCareerNextRace = () => {
      const run = this.save.getCupRun();
      if (!this.careerRace || !run) return;
      this.menu.showCareerInterstitial(this.careerRace.cup, run.nextRace);
    };
    this.menu.onCareerHubReturn = () => {
      this.careerRace = null;
      this.rivalLineup = null;
      this.quitToMenu('career');
    };
    this.menu.onResume = () => this.resume();
    this.menu.onPractice = () => {
      if (this.race) this.race.practice = true;
      this.hud.root.classList.add('practice');
      this.resume();
    };
    this.menu.onStartTutorial = () => this.startTutorial();
    this.menu.onRestart = () => this.startTrack(this.track);
    this.menu.onQuitToMenu = () => this.quitToMenu(this.careerRace ? 'career' : 'tracks');
    this.menu.onTiltRequest = () => void this.input.requestTiltPermission();
    this.menu.onGarageChange = (paint, body) => {
      this.applyPlayerStyle(paint, body);
    };
    this.menu.onWatchReplay = () => this.startReplay();
    this.menu.onViewPodium = () => this.enterPodium(this.lastPodiumOrder);
    this.menu.onShareGhost = (track) => this.shareGhost(track);
    this.menu.onFriendRace = (track) => this.raceFriendGhost(track);
    this.menu.onWatchFriendReplay = (track) => this.watchFriendReplay(track);
    this.menu.onStartDaily = () => this.startDaily();
    this.menu.onShareDaily = () => this.shareDailyResult();
    this.menu.onStartWeekly = () => this.startWeekly();
    this.menu.onWeeklyStartRace = (raceIndex) => this.startWeeklyRace(raceIndex);
    this.menu.onWeeklyNextRace = () => {
      const run = this.save.getWeeklyRun();
      if (!run) return;
      this.menu.showWeeklyInterstitial(weeklyFor(run.weekKey), run.nextRace);
    };
    this.menu.onWeeklyQuit = () => {
      this.weeklyRace = null;
      this.quitToMenu('title');
    };
    this.menu.onShareWeekly = () => this.shareWeeklyResult();
    this.garage = new GarageSystem(this.save);
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
      for (const gv of this.ghostVisuals) gv.group.visible = s.showGhost && gv.group.visible;
      this.rig.fovPref = s.fov;
      this.rig.setMode(s.cam);
      this.touch.root.classList.toggle('touch-lefty', s.leftyTouch);
      document.documentElement.classList.toggle('hud-contrast', s.hudContrast === true);
    };
    this.touch.onPause = () => {
      if (this.state === 'racing' || this.state === 'countdown') this.pause();
    };

    // ---------- Replay theater (v8 P8) ----------
    this.theater = new TheaterUI();
    document.getElementById('ui-root')!.append(this.theater.root);
    this.theater.onPlayToggle = () => {
      if (this.replay) {
        this.replay.playing = !this.replay.playing;
        this.theater.setPlaying(this.replay.playing);
      }
    };
    this.theater.onSeek = (t) => this.seekReplay(t);
    this.theater.onSeekStep = (d) => {
      if (this.replay) this.seekReplay(this.replay.t + d);
    };
    this.theater.onScrubEnd = () => {};
    this.theater.onSpeed = (s) => {
      if (this.replay) {
        this.replay.speed = s;
        this.theater.setSpeed(s);
      }
    };
    this.theater.onCamera = () => this.cycleReplayCam();
    this.theater.onAutoCuts = (on) => this.setReplayAutoCuts(on);
    this.theater.onShare = () => void this.shareReplay();
    this.theater.onExit = () => this.stopReplay();
    this.theater.onPrev = () => this.openReplay(this.replayIdx - 1);
    this.theater.onNext = () => this.openReplay(this.replayIdx + 1);

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
    void this.checkShareHash();
    this.decodeSavedFriendGhosts();
    this.announcePaintUnlocks();
  }

  /** Persisted friend ghosts decode async (deflate); populate the cache so ghost battles survive reloads. */
  private decodeSavedFriendGhosts(): void {
    for (const [trackId, entry] of Object.entries(this.save.allSaves.friendGhosts)) {
      if (this.friendGhostCache[trackId]) continue;
      void decodeGhostCode(entry.code)
        .then((samples) => {
          if (samples.length > 1) this.friendGhostCache[trackId] = { timeMs: entry.timeMs, samples };
        })
        .catch(() => {
          /* corrupted saved ghost — ignore */
        });
    }
  }

  private async shareGhost(track: TrackDef): Promise<void> {
    if (this.shareBusy) return;
    const ts = this.save.trackSave(track.id);
    if (!ts.ghost || ts.bestTimeMs == null) {
      this.menu.showToast('NO GHOST TO SHARE');
      return;
    }
    this.shareBusy = true;
    try {
      const samples = deserializeGhost(ts.ghost);
      if (samples.length < 2) {
        this.menu.showToast('NO GHOST TO SHARE');
        return;
      }
      const code = await encodeGhostCode(track, samples);
      const url = window.location.origin + window.location.pathname + buildShareLink(track, ts.bestTimeMs, code);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'RACE2 ghost', text: `Beat my ${track.name} ghost: ${(ts.bestTimeMs / 1000).toFixed(2)}s`, url });
          return;
        } catch (e) {
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      this.menu.showToast('GHOST LINK COPIED');
    } catch {
      this.menu.showToast('SHARE FAILED');
    } finally {
      this.shareBusy = false;
    }
  }

  /** v9 P3: share the replay currently open in the theater via #r= link (Web Share -> clipboard). */
  private async shareReplay(): Promise<void> {
    if (this.shareBusy) return;
    const entry = this.replayList[this.replayIdx];
    if (!entry || entry.imported) return;
    if (entry.variant !== undefined && entry.variant !== 'day') return;
    this.shareBusy = true;
    let shared = false;
    try {
      const url = window.location.origin + window.location.pathname + await buildReplayLink(this.track, entry.timeMs, entry.samples);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'RACE2 replay', text: `Watch my ${this.track.name} replay: ${(entry.timeMs / 1000).toFixed(2)}s`, url });
          shared = true;
          return;
        } catch (e) {
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      this.menu.showToast('REPLAY LINK COPIED');
      shared = true;
    } catch {
      this.menu.showToast('SHARE FAILED');
    } finally {
      if (shared) window.dispatchEvent(new CustomEvent('race2:replay-shared'));
      this.shareBusy = false;
    }
  }

  /** v9 P3: WATCH on the FRIEND REPLAY card — load the track and drop the lap into the theater. */
  private watchFriendReplay(track: TrackDef): void {
    const fr = this.friendReplay;
    if (!fr || fr.trackId !== track.id) return;
    this.menu.driftAttack = false;
    this.menu.rivalsMode = false;
    this.menu.knockoutMode = false;
    this.menu.trafficMode = false;
    this.driftMode = false;
    this.careerRace = null;
    this.rivalLineup = null;
    this.dailyRace = null;
    this.weeklyRace = null;
    this.knockoutMode = false;
    this.trafficMode = false;
    this.rivalMode = false;
    if (track !== this.track || this.resolveVariant(track) !== this.variant) this.loadTrackIntoScene(track);
    this.replayList = [{ trackId: track.id, samples: fr.samples, timeMs: fr.timeMs, dateMs: Date.now(), imported: true }];
    this.openReplay(0);
  }

  private raceFriendGhost(track: TrackDef): void {
    const cached = this.friendGhostCache[track.id];
    const legacyMatch = this.friendGhost && this.friendGhost.trackId === track.id;
    if (!cached && !legacyMatch) return;
    this.menu.driftAttack = false;
    this.menu.rivalsMode = false;
    this.menu.knockoutMode = false;
    this.menu.trafficMode = false;
    this.driftMode = false;
    this.careerRace = null;
    this.rivalLineup = null;
    this.dailyRace = null;
    this.startTrack(track);
  }

  private startDaily(): void {
    const dateKey = todayKey();
    const def = dailyFor(dateKey);
    this.dailyRace = { dateKey };
    this.careerRace = null;
    this.rivalLineup = def.lineup;
    this.menu.driftAttack = false;
    this.menu.rivalsMode = false;
    this.menu.knockoutMode = false;
    this.menu.trafficMode = false;
    this.driftMode = false;
    this.startTrack(def.track);
  }

  /** Dev seed override (?week=2026W41) for QA on non-current weeks; mirrors ?variant= / ?alltracks. */
  private devWeekKey(): string {
    if (!this.devOverrides) return weekKeyFor(new Date());
    const forced = this.devOverrides.get('week');
    return forced && isValidWeekKey(forced) ? forced : weekKeyFor(new Date());
  }

  private startWeekly(): void {
    const weekKey = this.devWeekKey();
    const run = this.save.getWeeklyRun();
    const raceIndex = run && run.weekKey === weekKey ? run.nextRace : 0;
    this.startWeeklyRace(raceIndex);
  }

  private startWeeklyRace(raceIndex: number): void {
    const def = weeklyFor(this.devWeekKey());
    const idx = Math.max(0, Math.min(WEEKLY_RACES - 1, raceIndex));
    this.weeklyRace = { def, raceIndex: idx };
    this.careerRace = null;
    this.dailyRace = null;
    this.rivalLineup = def.lineups[idx];
    this.menu.driftAttack = false;
    this.menu.rivalsMode = false;
    this.menu.knockoutMode = false;
    this.menu.trafficMode = false;
    this.driftMode = false;
    this.startTrack(weeklyRaceTrack(def, idx));
  }

  private async shareWeeklyResult(): Promise<void> {
    if (this.shareBusy || !this.lastFinish?.weekly) return;
    const w = this.lastFinish.weekly;
    this.shareBusy = true;
    try {
      const url = window.location.origin + window.location.pathname + buildWeeklyLink(w.weekKey, w.totalPoints, w.playerPos);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'RACE2 weekly event', text: `Race2 weekly ${w.weekKey}: ${w.totalPoints} pts, P${w.playerPos} overall — beat my score`, url });
          return;
        } catch (e) {
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      this.menu.showToast('WEEKLY LINK COPIED');
    } catch {
      this.menu.showToast('SHARE FAILED');
    } finally {
      this.shareBusy = false;
    }
  }

  private applyWeeklyFinish(standings: Standing[]): WeeklyPanelData {
    const wr = this.weeklyRace!;
    let run = this.save.getWeeklyRun();
    if (!run || run.weekKey !== wr.def.weekKey) run = startWeeklyRun(wr.def.weekKey);
    const res = applyWeeklyResult(run, standings, this.save.profile.paint);
    const isFinal = weeklyComplete(run);
    let trophy: TrophyKind = null;
    let totalPoints = 0;
    if (isFinal) {
      const playerEntry = run.entries.find((e) => e.isPlayer);
      totalPoints = playerEntry ? playerEntry.points : 0;
      trophy = weeklyTrophy(run);
      this.save.recordWeeklyFinish(wr.def.weekKey, totalPoints, res.playerPos);
      this.save.setWeeklyRun(null);
    } else {
      this.save.setWeeklyRun(run);
      const playerEntry = run.entries.find((e) => e.isPlayer);
      totalPoints = playerEntry ? playerEntry.points : 0;
    }
    return {
      weekKey: wr.def.weekKey,
      raceNumber: wr.raceIndex + 1,
      totalRaces: WEEKLY_RACES,
      playerPos: res.playerPos,
      racePoints: res.playerPoints,
      totalPoints,
      standings: weeklyStandings(run),
      isFinal,
      trophy,
      modifierName: wr.def.modifier.name,
    };
  }

  private async shareDailyResult(): Promise<void> {
    if (this.shareBusy || !this.lastFinish?.daily) return;
    const d = this.lastFinish.daily;
    this.shareBusy = true;
    try {
      const url = window.location.origin + window.location.pathname + buildDailyLink(d.dateKey, d.position, this.lastFinish.result.timeMs);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'RACE2 daily challenge', text: `Race2 daily ${d.dateKey}: I finished P${d.position} in ${(this.lastFinish.result.timeMs / 1000).toFixed(2)}s — beat my time`, url });
          return;
        } catch (e) {
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      this.menu.showToast('DAILY LINK COPIED');
    } catch {
      this.menu.showToast('SHARE FAILED');
    } finally {
      this.shareBusy = false;
    }
  }

  private async checkShareHash(): Promise<void> {
    const hash = window.location.hash;
    if (hash.startsWith('#d=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      const link: DailyShareLink | null = parseDailyLink(hash);
      if (!link) {
        this.menu.showToast('INVALID DAILY LINK');
        return;
      }
      this.menu.showDailyImport(link);
      return;
    }
    if (hash.startsWith('#w=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      const link = parseWeeklyLink(hash);
      if (!link) {
        this.menu.showToast('INVALID WEEKLY LINK');
        return;
      }
      this.menu.showWeeklyImport(link);
      return;
    }
    if (hash.startsWith('#r=')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      const link = parseReplayLink(hash);
      if (!link) {
        this.menu.showToast('INVALID REPLAY LINK');
        return;
      }
      const def = TRACKS.find((t) => t.id === link.trackId);
      if (!def) {
        this.menu.showToast('INVALID REPLAY LINK');
        return;
      }
      try {
        const samples = await decodeGhostCode(link.code);
        if (samples.length < 2) throw new ShareError('empty replay');
        this.friendReplay = { trackId: def.id, timeMs: link.timeMs, samples };
        this.menu.showFriendReplay(def, link.timeMs);
      } catch {
        this.menu.showToast('INVALID REPLAY LINK');
      }
      return;
    }
    if (!hash.startsWith('#g=')) return;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    const link = parseShareLink(hash);
    if (!link) {
      this.menu.showToast('INVALID GHOST LINK');
      return;
    }
    const def = TRACKS.find((t) => t.id === link.trackId);
    if (!def) {
      this.menu.showToast('INVALID GHOST LINK');
      return;
    }
    try {
      const samples = await decodeGhostCode(link.code);
      if (samples.length < 2) throw new ShareError('empty ghost');
      this.friendGhost = { trackId: def.id, timeMs: link.timeMs, samples };
      this.friendGhostCache[def.id] = { timeMs: link.timeMs, samples };
      this.save.setFriendGhost(def.id, { code: link.code, timeMs: link.timeMs, dateMs: Date.now() });
      this.menu.showFriendChallenge(def, link.timeMs);
    } catch {
      this.menu.showToast('INVALID GHOST LINK');
    }
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
      if (this.autoDowngrade) {
        this.quality = this.autoDowngrade;
      } else {
        const isMobile =
          matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0 ||
          'ontouchstart' in window;
        this.quality = isMobile ? 'low' : 'medium';
      }
    } else {
      this.quality = s;
      this.autoDowngrade = null;
    }
    const dpr = window.devicePixelRatio;
    const maxDpr = this.quality === 'low' ? 1.4 : this.quality === 'medium' ? 1.8 : 2.2;
    this.renderer.setPixelRatio(Math.min(dpr, maxDpr));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.onResize();
    this.setupComposer();
  }

  private shake(amount: number): void {
    const s = this.save.settings;
    if (s.reducedMotion) return;
    this.rig.addShake(amount * s.shakeIntensity);
  }

  private enterPhoto(): void {
    if (this.state !== 'racing' && this.state !== 'replay') return;
    this.photoFrom = this.state === 'replay' ? 'replay' : 'racing';
    this.photo = { yaw: Math.PI, pitch: 0.35, dist: 9, filterIdx: 0 };
    this.state = 'photo';
    this.hud.hide();
    this.touch.hide();
    if (this.photoFrom === 'replay') this.theater.hide();
    if (!this.photoUi) {
      const ui = el('div', 'photo-ui');
      ui.innerHTML = `<div class="photo-hint">DRAG orbit · WHEEL zoom · P exit</div>`;
      const filters = el('button', 'menu-btn small', 'FILTER');
      filters.addEventListener('click', () => {
        if (!this.photo) return;
        this.photo.filterIdx = (this.photo.filterIdx + 1) % this.photoFilters.length;
        this.canvas.style.filter = this.photoFilters[this.photo.filterIdx];
      });
      const snap = el('button', 'menu-btn small primary', 'SNAP');
      snap.addEventListener('click', () => {
        this.canvas.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `race2-photo-${Date.now()}.png`;
          a.click();
        }, 'image/png');
      });
      const exit = el('button', 'menu-btn small', 'EXIT (P)');
      exit.addEventListener('click', () => this.exitPhoto());
      const bar = el('div', 'photo-bar');
      bar.append(filters, snap, exit);
      ui.append(bar);
      document.getElementById('ui-root')!.append(ui);
      this.photoUi = ui;
    }
    this.photoUi.classList.remove('hidden');
    this.setupPhotoInput();
  }

  private exitPhoto(): void {
    this.photo = null;
    this.canvas.style.filter = '';
    this.photoCleanup?.();
    this.photoUi?.classList.add('hidden');
    if (this.photoFrom === 'replay' && this.replay && this.replayCar) {
      this.state = 'replay';
      const entry = this.replayList[this.replayIdx];
      this.theater.setShareVisible(this.theaterShareable(entry));
      this.theater.show({ trackName: this.track.name, totalMs: this.replay.endMs, index: this.replayIdx, count: this.replayList.length, label: this.theaterLabel(entry) });
      this.theater.setPlaying(this.replay.playing);
      this.theater.setSpeed(this.replay.speed);
      this.theater.setCam(this.replayCam);
      this.theater.setAutoCuts(this.replay.autoCuts);
      this.pushTheaterTime();
      return;
    }
    this.state = 'racing';
    this.hud.show(this.track.name, this.save.trackSave(this.track.id).bestTimeMs, this.track.checkpoints.length);
    if (matchMedia('(pointer: coarse)').matches) this.touch.show();
  }

  private setupPhotoInput(): void {
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging || !this.photo) return;
      this.photo.yaw -= (e.clientX - lx) * 0.008;
      this.photo.pitch = Math.max(-0.2, Math.min(1.2, this.photo.pitch + (e.clientY - ly) * 0.006));
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = () => {
      dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      if (!this.photo) return;
      e.preventDefault();
      this.photo.dist = Math.max(3.5, Math.min(30, this.photo.dist + e.deltaY * 0.01));
    };
    this.canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.photoCleanup = () => {
      this.canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.canvas.removeEventListener('wheel', wheel);
    };
  }

  private updatePhoto(): void {
    if (!this.photo) return;
    const carPos = this.photoFrom === 'replay' && this.replayCar ? this.replayCar.group.position : this.car?.state.pos;
    if (!carPos) return;
    const cp = this.photo;
    const x = carPos.x + cp.dist * Math.cos(cp.pitch) * Math.sin(cp.yaw);
    const y = carPos.y + cp.dist * Math.sin(cp.pitch) + 1;
    const z = carPos.z + cp.dist * Math.cos(cp.pitch) * Math.cos(cp.yaw);
    this.rig.camera.position.set(x, y, z);
    this.rig.camera.up.set(0, 1, 0);
    this.rig.camera.lookAt(carPos);
    this.rig.camera.fov = 50;
    this.rig.camera.updateProjectionMatrix();
  }

  private setupComposer(): void {
    if (this.quality === 'high') {
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.32,
          0.42,
          1.0,
        );
        this.composer.addPass(this.bloomPass);
      }
      this.composer.passes[0] = new RenderPass(this.scene, this.rig.camera);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    } else {
      this.composer = null;
      this.bloomPass = null;
    }
  }

  private renderFrame(): void {
    if (this.composer && this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.rig.camera);
  }

  private dynamicRes(fps: number): void {
    if (this.save.settings.quality !== 'auto') return;
    const base = this.quality === 'low' ? 1.4 : this.quality === 'medium' ? 1.8 : 2.2;
    const cap = Math.min(window.devicePixelRatio, base) * this.resScale;
    if (fps < 48 && this.resScale > 0.6) {
      this.resScale = Math.max(0.6, this.resScale - 0.15);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, base) * this.resScale);
    } else if (fps > 58 && this.resScale < 1) {
      this.resScale = Math.min(1, this.resScale + 0.1);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, base) * this.resScale);
    }
    void cap;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  private clearTrackScene(): void {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (!o.geometry.userData.shared) o.geometry.dispose();
          const kill = (m: THREE.Material) => {
            if (m.userData.shared) return;
            const map = (m as THREE.MeshStandardMaterial).map;
            if (map && !map.userData.shared) map.dispose();
            m.dispose();
          };
          const m = o.material;
          if (Array.isArray(m)) m.forEach(kill);
          else kill(m);
        }
      });
    }
    if (this.environment) this.environment.dispose();
    this.trackGroup = null;
    this.meshes = null;
    this.environment = null;
  }

  private rebuildScene(): void {
    this.clearTrackScene();
    this.loadTrackIntoScene(this.track);
  }

  private applyPlayerStyle(_paint: number, body: 'standard' | 'aero' | 'tank'): void {
    this.audio.setEngineBody(body);
    this.garage.applyTo(this.carVisual!, null);
    for (let i = 0; i < this.ghostVisuals.length; i++) {
      const gt = this.race?.ghostTrack(i);
      this.ghostVisuals[i].setPaint(gt ? this.ghostCarPaint(gt.label) : this.save.profile.paint);
    }
    if (this.track && this.sceneBody !== body) {
      this.loadTrackIntoScene(this.track);
      if (this.state === 'menu') this.car!.placeAtFrame(0, 8);
    }
  }

  private resolveVariant(def: TrackDef): TrackVariant {
    if (this.urlVariant) return this.urlVariant;
    if (this.dailyRace) return 'day';
    if (this.weeklyRace) return weeklyVariant(this.weeklyRace.def, this.weeklyRace.raceIndex);
    if (this.careerRace) return cupRaceVariant(this.careerRace.cup, this.careerRace.raceIndex);
    if (this.rivalMode || this.knockoutMode) return def.variant ?? 'day';
    return this.save.settings.variant ?? 'day';
  }

  private loadTrackIntoScene(def: TrackDef): void {
    this.clearTrackScene();
    this.track = def;
    const curve = new TrackCurve(def.points, true);
    this.curve = curve;
    const variant = this.resolveVariant(def);
    this.variant = variant;

    this.environment = buildEnvironment(this.scene, THEMES[def.theme], this.quality, curve, variant);
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    this.scene.add(this.particles.points);

    this.meshes = buildTrackMeshes(curve, def, variant);
    this.trackGroup.add(this.meshes.group);
    this.trackGroup.add(buildTrackProps(curve, def.theme, this.quality));

    if (VARIANTS[variant].rain) {
      if (!this.rainFx) {
        this.rainFx = new RainSystem(950);
        this.scene.add(this.rainFx.lines);
      }
      this.rainFx.lines.visible = true;
      this.rainFx.setCount(this.quality === 'low' ? 220 : this.quality === 'medium' ? 520 : 950);
    } else if (this.rainFx) {
      this.rainFx.lines.visible = false;
    }

    if (!this.shadowBlob) {
      this.shadowBlob = new THREE.Sprite(new THREE.SpriteMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }));
      this.shadowBlob.scale.set(3.4, 3.4, 1);
    }
    this.trackGroup.add(this.shadowBlob);

    if (this.quality !== 'low') {
      this.meshes.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.receiveShadow = true;
      });
    }

    this.car = new CarPhysics(curve, BODY_TUNING[this.save.profile.body]);
    this.sceneBody = this.save.profile.body;
    this.car.placeAtFrame(0, 8);
    if (this.skidMarks) {
      this.skidMarks.mesh.geometry.dispose();
      (this.skidMarks.mesh.material as THREE.Material).dispose();
      this.scene.remove(this.skidMarks.mesh);
      this.skidMarks = null;
    }
    this.skidMarks = new SkidMarks();
    this.trackGroup.add(this.skidMarks.mesh);

    this.carVisual = buildCarVisual(this.save.profile.paint, false, this.save.profile.body, VARIANTS[variant].headlights);
    this.carVisual.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = this.quality !== 'low';
    });
    this.trackGroup.add(this.carVisual.group);

    this.ghostVisuals = [];
    for (let i = 0; i < 3; i++) {
      const gv = buildCarVisual(this.save.profile.paint, true);
      gv.group.visible = false;
      this.trackGroup.add(gv.group);
      this.ghostVisuals.push(gv);
    }

    this.race = new RaceController(this.car, curve, def, this.save, <K extends keyof RaceEvents>(
      ev: K,
      payload?: RaceEvents[K]
    ) => this.onRaceEvent(ev, payload));

    this.rivals = new RivalManager(curve, def, this.trackGroup, this.quality !== 'low', this.rivalLineup ?? undefined, { night: VARIANTS[variant].headlights });
    this.rivals.rain = VARIANTS[variant].rain;
    this.rivals.onKnockout = (ev) => this.onKnockoutEvent(ev);
    this.rivals.onRivalFinish = (name) => {
      if (!this.rivalMode || this.race?.phase !== 'racing') return;
      const line = tauntFor(name, 'finish');
      if (line) this.hud.showSplash(line, 'splash-banter', 1700);
    };
    this.rivalsBuiltWith = this.rivalLineup ? this.rivalLineup.map((r) => `${r.name}:${r.paint}`).join('|') : null;

    this.traffic?.dispose();
    this.traffic = new TrafficManager(curve, def, this.trackGroup);
    this.traffic.onContact = (pos) => {
      this.playerDraft.reset();
      this.audio.crash();
      this.particles.wallSparks(pos.clone(), new THREE.Vector3(0, 1, 0));
      this.input.rumble(0.9, 0.7, 200);
      this.shake(0.7);
    };
    this.traffic.onNearMiss = (count) => {
      this.hud.setNearMisses(count);
      this.hud.showNearMissFlash();
      this.audio.nearMissWhoosh();
    };

    this.rig.snapBehind(this.car.state);
    this.menuOrbitAngle = 0;
  }

  private startTrack(def: TrackDef): void {
    this.teardownTutorial();
    this.knockoutMode = this.menu.knockoutMode && this.careerRace === null && this.dailyRace === null && this.weeklyRace === null;
    this.trafficMode = this.menu.trafficMode && this.careerRace === null && this.dailyRace === null && this.weeklyRace === null;
    this.rivalMode = this.menu.rivalsMode || this.knockoutMode || this.careerRace !== null || this.dailyRace !== null || this.weeklyRace !== null;
    if (!this.rivalMode) this.rivalLineup = null;
    if (this.knockoutMode || this.trafficMode) this.menu.driftAttack = false;
    this.hudAcc = 0;
    this.mapAcc = 0;
    this.lastPlayerPos = 0;
    this.overtakeCooldownUntil = 0;
    this.playerDraft.reset();
    this.draftGap = -1;
    this.lastPodiumOrder = null;
    this.exitPodium();
    const lineupSig = this.rivalLineup ? this.rivalLineup.map((r) => `${r.name}:${r.paint}`).join('|') : null;
    if (def !== this.track || (this.rivalMode && lineupSig !== this.rivalsBuiltWith) || this.resolveVariant(def) !== this.variant) {
      this.loadTrackIntoScene(def);
    }
    this.hud.setMinimapTrack(this.curve!, def.accent);
    this.hud.setPlayerPaint(this.save.profile.paint);
    if (this.rivalMode && this.rivals) {
      const slot = this.rivals.gridSlot(3);
      this.car!.placeAt(slot.dist, slot.lateral);
      this.rivals.totalLaps = this.knockoutMode ? KNOCKOUT_LAPS : this.weeklyRace ? WEEKLY_LAPS : this.dailyRace ? DAILY_LAPS : DEFAULT_RIVAL_LAPS;
      this.rivals.knockout = this.knockoutMode;
      this.rivals.setPlayerPaint(this.save.profile.paint);
      this.rivals.placeOnGrid();
      this.rivals.setVisible(true);
      this.hud.showRivalHUD();
      this.championInRace = this.rivals.hasChampion();
      this.championBeaten = false;
      this.banterPending = null;
    } else {
      this.car!.placeAtFrame(0, 8);
      this.rivals?.setVisible(false);
      this.hud.hideRivalHUD();
      this.championInRace = false;
      this.championBeaten = false;
      this.banterPending = null;
    }
    if (this.trafficMode && this.traffic) {
      this.traffic.place(this.car!.state.trackDist);
      this.traffic.setVisible(true);
      this.hud.showNearMissCounter(true);
      this.hud.setNearMisses(0);
    } else {
      this.traffic?.setVisible(false);
      this.hud.showNearMissCounter(false);
    }
    this.rig.snapBehind(this.car!.state);
    this.state = 'countdown';
    this.race!.practice = false;
    this.hud.root.classList.remove('practice');
    this.menu.hideAll();
    this.menu.hidePause();
    this.hud.show(
      def.name,
      this.driftMode || this.trafficMode ? null : this.save.trackSave(def.id).bestTimeMs,
      def.checkpoints.length,
      def.checkpoints.map((c) => c.dist),
      curveLen(def),
    );
    this.hud.setDriftMode(this.driftMode, this.save.trackSave(def.id).driftBest ?? 0);
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
    this.audio.startEngine(this.save.profile.body);
    this.audio.startMusic(def.theme);
    this.audio.startAmbience(THEMES[def.theme].ambientSound);
    this.race!.totalLaps = this.rivalMode ? (this.knockoutMode ? KNOCKOUT_LAPS : this.weeklyRace ? WEEKLY_LAPS : this.dailyRace ? DAILY_LAPS : DEFAULT_RIVAL_LAPS) : 1;
    // v9 P1: non-day free-play variants run dry — PB/ghost/friend/drift/traffic ledgers untouched.
    const dryVariant = !this.rivalMode && !variantWritesRecords(this.variant);
    this.race!.writesRecords = !this.rivalMode && !this.trafficMode && !dryVariant;
    this.race!.recordReplay = dryVariant && !this.trafficMode;
    const cachedFriend = this.friendGhostCache[def.id] ?? null;
    const legacyFriend = this.friendGhost && this.friendGhost.trackId === def.id ? this.friendGhost : null;
    const friendEntry = cachedFriend ?? legacyFriend;
    const friendActive = !this.rivalMode && !this.trafficMode && !dryVariant && !!friendEntry;
    this.race!.maxGhosts = this.rivalMode || this.trafficMode || dryVariant ? 0 : this.save.settings.ghosts;
    this.race!.useExternalGhost(friendActive ? friendEntry!.samples : null);
    this.friendRaceActive = friendActive;
    this.hud.setGhostTag(friendActive ? 'FRIEND' : null);
    let modeHinted = false;
    if (this.knockoutMode && !this.save.settings.hintKnockout) {
      this.save.updateSettings({ hintKnockout: true });
      this.hud.showContextHint('LAST PLACE EACH LAP IS ELIMINATED');
      modeHinted = true;
    } else if (this.trafficMode && !this.save.settings.hintTraffic) {
      this.save.updateSettings({ hintTraffic: true });
      this.hud.showContextHint('TRAFFIC AHEAD — THREAD IT: NEAR MISSES PAY −0.15s');
      modeHinted = true;
    } else if (this.rivalMode && !this.knockoutMode && !this.save.settings.hintRival) {
      this.save.updateSettings({ hintRival: true });
      this.hud.showContextHint('3 RIVALS — BEAT THEM TO THE LINE');
      modeHinted = true;
    }
    if (!modeHinted && !this.save.settings.hintCam) {
      this.save.updateSettings({ hintCam: true });
      this.hud.showContextHint('C — CAMERA');
    }
    this.race!.start();
    this.hud.setLapCounter(this.rivalMode ? `LAP ${this.race!.lapNumber}/${this.race!.totalLaps}` : null);
    this.ringsHit.clear();
    this.driftScore = 0;
    const ghostN = this.race!.ghostCount();
    for (let i = 0; i < this.ghostVisuals.length; i++) {
      const gv = this.ghostVisuals[i];
      const gt = this.race!.ghostTrack(i);
      if (gt) gv.setPaint(this.ghostCarPaint(gt.label));
      gv.group.visible = !!gt && this.save.settings.showGhost;
    }
    this.hud.setGhostDeltaCount(ghostN);
    this.hud.setBattleRank(this.rivalMode || ghostN === 0 ? null : { rank: ghostN + 1, of: ghostN + 1 });
    this.hud.clearCenter();
  }

  // ---------- Interactive tutorial (v8 P6) ----------

  /** First PLAY on a fresh profile (or the settings REPLAY TUTORIAL button). */
  private startTutorial(): void {
    this.careerRace = null;
    this.rivalLineup = null;
    this.dailyRace = null;
    this.weeklyRace = null;
    this.menu.driftAttack = false;
    this.menu.rivalsMode = false;
    this.menu.knockoutMode = false;
    this.menu.trafficMode = false;
    this.driftMode = false;
    this.startTrack(TRACKS.find((t) => t.id === TUTORIAL_TRACK_ID) ?? TRACKS[0]);
    if (!this.race || !this.curve) return;
    this.tutorialMode = true;
    this.tutorial = new TutorialRun(this.curve.length, (ev) => this.onTutorialEvent(ev));
    this.race.practice = true;
    this.race.writesRecords = false;
    this.race.maxGhosts = 0;
    this.race.useExternalGhost(null);
    this.race.start();
    this.hud.root.classList.add('practice');
    for (const gv of this.ghostVisuals) gv.group.visible = false;
    this.hud.setGhostDeltaCount(0);
    this.hud.setBattleRank(null);
    this.hud.setGhostTag(null);
    this.hud.setLapCounter(null);
    this.hud.showNearMissCounter(false);
    this.buildTutorialRigVisuals();
    this.hud.showTutorial(true);
    this.hud.onSkipTutorial = () => this.skipTutorial();
    this.tutorialProgressText = '';
  }

  private buildTutorialRigVisuals(): void {
    if (!this.curve || !this.trackGroup) return;
    this.tutorialRig = buildTutorialRig(this.curve, TUTORIAL_RINGS, TUTORIAL_PADS);
    this.trackGroup.add(this.tutorialRig.group);
  }

  /** Removes ALL tutorial state + visuals. Called from startTrack/quitToMenu so no
   *  normal race (including the post-tutorial time-trial) ever keeps them. */
  private teardownTutorial(): void {
    if (this.tutorialDropTimer !== null) {
      clearTimeout(this.tutorialDropTimer);
      this.tutorialDropTimer = null;
    }
    if (!this.tutorialMode && !this.tutorialRig) return;
    this.tutorialMode = false;
    this.tutorial = null;
    this.hud.showTutorial(false);
    if (this.tutorialRig) {
      this.trackGroup?.remove(this.tutorialRig.group);
      this.tutorialRig.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const kill = (m: THREE.Material) => {
            const map = (m as THREE.MeshBasicMaterial).map;
            if (map) map.dispose();
            m.dispose();
          };
          if (Array.isArray(o.material)) o.material.forEach(kill);
          else kill(o.material as THREE.Material);
        }
      });
      this.tutorialRig = null;
    }
  }

  private skipTutorial(): void {
    this.tutorial?.skipAll();
  }

  private onTutorialEvent(ev: TutorialEvent): void {
    switch (ev.type) {
      case 'drill-start':
        this.hud.setTutorialBanner(ev.banner, ev.hint);
        if (this.tutorial && this.tutorial.drillIndex === 0) {
          if (this.state === 'racing') this.hud.showSplash(ev.banner, 'splash-tut');
          else this.tutorialSplashPending = ev.banner;
        }
        this.tutorialProgressText = '';
        this.hud.setTutorialProgress(null);
        break;
      case 'hit':
        this.flashTutorialTarget(ev.targetId);
        this.audio.checkpoint();
        break;
      case 'fail':
        this.hud.showSplash('TRY AGAIN', 'splash-bad');
        this.audio.countdownBeep(false);
        this.resetPlayerForTutorialDrill();
        break;
      case 'drill-clear':
        this.hud.showSplash('DRILL CLEAR', 'splash-good');
        this.audio.checkpoint();
        break;
      case 'drill-skipped':
        this.hud.showSplash('SKIPPED', 'splash-bad');
        break;
      case 'complete':
        this.finishTutorial(ev.skippedAny);
        break;
    }
  }

  private flashTutorialTarget(id: string): void {
    const rig = this.tutorialRig;
    if (!rig) return;
    const ring = rig.rings.find((r) => r.id === id);
    const pad = ring ? undefined : rig.pads.find((p) => p.id === id);
    const mesh = ring ? ring.mesh : pad?.mesh;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(0x35ff7a).multiplyScalar(1.8);
    mat.opacity = 1;
    mesh.scale.set(1.22, 1.22, 1.22);
    window.setTimeout(() => mesh.scale.set(1, 1, 1), 260);
  }

  private resetPlayerForTutorialDrill(): void {
    const t = this.tutorial;
    if (!t || !this.car) return;
    this.car.placeAt(Math.max(8, DRILL_START_DIST[t.drill]), 0);
    this.rig.snapBehind(this.car.state);
  }

  private updateTutorialProgressHud(): void {
    const t = this.tutorial;
    if (!t) return;
    let text: string;
    if (t.drill === 'steer') text = `GATES ${t.done}/${t.total}`;
    else if (t.drill === 'boost') text = `PADS ${t.done}/${t.total}`;
    else if (t.drill === 'drift') text = `DRIFT ${t.driftTime.toFixed(1)} / ${DRIFT_MIN_SECONDS.toFixed(1)}s`;
    else text = `UNDER ${BRAKE_MAX_KMH} KM/H`;
    if (text !== this.tutorialProgressText) {
      this.tutorialProgressText = text;
      this.hud.setTutorialProgress(text);
    }
  }

  private finishTutorial(skippedAny: boolean): void {
    const achvBefore = rivalAchievementState(this.save);
    this.save.updateSettings({
      tutorialDone: true,
      tutorialSkipped: skippedAny || this.save.settings.tutorialSkipped === true,
    });
    // FRESH GRAD placeholder — P9 wires the achievement; emit + persist the event now.
    window.dispatchEvent(new CustomEvent('race2:tutorial-complete', { detail: { completed: !skippedAny } }));
    this.announceAchievementPops(achvBefore);
    this.hud.showSplash('NOW SET A TIME!', 'splash-tut');
    // Hold the (inert, status=complete) tutorial visuals under the banner, then drop
    // into the time-trial — startTrack's teardown removes everything before the rebuild.
    this.tutorialDropTimer = window.setTimeout(() => {
      this.tutorialDropTimer = null;
      this.startTrack(this.track);
    }, 1700);
  }

  private pause(): void {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.state = 'paused';
    this.menu.showPause(!this.race?.practice);
    this.audio.suspend();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = this.race!.phase === 'countdown' ? 'countdown' : 'racing';
    this.menu.hidePause();
    this.audio.resume();
    this.lastT = performance.now();
  }

  private quitToMenu(dest: 'tracks' | 'career' | 'title' = 'tracks'): void {
    this.state = 'menu';
    this.teardownTutorial();
    this.dailyRace = null;
    this.weeklyRace = null;
    this.menu.hidePause();
    this.menu.hideFinish();
    this.menu.show(dest);
    this.hud.hide();
    this.hud.showRespawnHint(false);
    this.touch.hide();
    this.audio.stopEngine();
    this.audio.stopAmbience();
    if (this.car) this.car.placeAtFrame(0, 8);
    for (const gv of this.ghostVisuals) gv.group.visible = false;
    this.rivals?.setVisible(false);
    this.traffic?.setVisible(false);
    this.hud.showNearMissCounter(false);
    this.rig.snapBehind(this.car!.state);
  }

  private onRaceEvent<K extends keyof RaceEvents>(ev: K, payload?: RaceEvents[K]): void {
    if (ev === 'countdownTick') {
      const n = payload as unknown as number;
      this.audio.countdownBeep(false);
      this.hud.setCountdown(String(n), '');
    } else if (ev === 'go') {
      this.audio.countdownBeep(true);
      this.audio.goStinger();
      this.hud.setCountdown('GO!', 'go');
      if (this.state === 'countdown') this.state = 'racing';
      if (!this.save.settings.reducedMotion && this.curve) {
        const f = this.curve.frames[0];
        this.particles.startBurst(f.pos.clone().addScaledVector(f.normal, 1.2), f.tangent.clone(), this.rivalMode ? 64 : 36);
        this.rig.addPunch(this.rivalMode ? 13 : 8);
      }
      window.setTimeout(() => this.hud.clearCenter(), 900);
      // v9 P4 banter: the strongest rival (champion when present) trash-talks on GO.
      // Deferred via the frame loop (banterPending) rather than setTimeout so the
      // splash lands even under aggressive timer throttling (headless QA).
      if (this.rivalMode && this.rivals && this.rivals.presets.length > 0) {
        const presets = this.rivals.presets;
        const champion = presets.find((p) => p.tier === 'champion');
        const preset = champion ?? presets[this.banterIdx++ % presets.length];
        if (preset.tauntStart) {
          this.banterPending = { line: `${preset.name}: ${preset.tauntStart}`, atMs: performance.now() + 950 };
        }
      }
      if (this.tutorialSplashPending) {
        const banner = this.tutorialSplashPending;
        this.tutorialSplashPending = null;
        window.setTimeout(() => {
          if (this.tutorialMode) this.hud.showSplash(banner, 'splash-tut');
        }, 950);
      }
    } else if (ev === 'checkpoint') {
      const cp = payload as RaceEvents['checkpoint'];
      this.audio.checkpoint();
      this.hud.showSplit(cp);
      const gate = this.meshes?.checkpointGates[cp.index];
      if (gate) {
        gate.group.scale.set(1.12, 1.12, 1.12);
        window.setTimeout(() => gate.group.scale.set(1, 1, 1), 240);
      }
    } else if (ev === 'boost') {
      this.audio.boost();
      this.input.rumble(0.7, 0.4, 220);
      this.shake(0.5);
      this.boostKick = 1;
    } else if (ev === 'wallHit') {
      this.lapWalls++;
      this.audio.crash();
      this.input.rumble(0.9, 0.6, 180);
      this.shake(0.7);
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
      this.shake(Math.min(0.9, l.airTime * 0.8));
      if (this.car) this.particles.landingDust(this.car.state.pos.clone());
      this.carVisual?.setBodyPose(0, 0, Math.min(0.34, l.airTime * 0.45));
    } else if (ev === 'respawn') {
      this.rig.snapBehind(this.car!.state);
    } else if (ev === 'lap') {
      const l = payload as RaceEvents['lap'];
      this.hud.setLapCounter(`LAP ${l.lap}/${l.totalLaps}`);
    } else if (ev === 'finalLap') {
      this.hud.setLapCounter('FINAL LAP');
      if (this.rivalMode && this.race!.phase === 'racing') {
        this.hud.showSplash('FINAL LAP', 'splash-final');
        this.audio.musicKick(7);
        this.audio.crowd(2.2, 0.08);
      }
    } else if (ev === 'finish') {
      const r = payload as RaceEvents['finish'];
      this.hud.setDraft(false);
      // v8 P8: keep the just-driven time-trial replay in the session buffer
      // (same availability rule as the WATCH REPLAY button: time-trial only).
      if (!this.rivalMode && !this.trafficMode) {
        const rec = this.race?.lastLapSamples ?? [];
        if (rec.length >= 10) this.replayBuffer.push({ trackId: this.track.id, samples: rec, timeMs: r.timeMs, dateMs: Date.now(), variant: this.variant });
      }
      const achvBefore: RivalAchievementState = rivalAchievementState(this.save);
      if (r.knockout) {
        this.audio.crash();
        this.input.rumble(0.9, 0.6, 300);
        this.shake(0.8);
        this.hud.showSplash('KNOCKED OUT', 'splash-out');
      } else {
        this.audio.finish(r.medal);
        this.input.rumble(0.5, 0.9, 500);
        this.hud.showFinish(this.trafficMode ? { ...r, medal: 'none' as const } : r);
      }
      let rivalStandings: Standing[] | null = null;
      if (this.rivalMode && this.rivals) {
        rivalStandings = this.rivals.freeze(this.race!.totalProgress, r.timeMs);
        console.log('[rivals] finish order: ' + rivalStandings.map((s, i) => `P${i + 1} ${s.name}${s.eliminated ? ' OUT' : s.gapMeters > 0 ? ` +${Math.round(s.gapMeters)}m` : ''}`).join(' | '));
        // v9 P4 KINGMAKER prep: finished the race ahead of a participating champion
        if (!r.knockout && this.rivals.hasChampion()) {
          const pIdx = rivalStandings.findIndex((s) => s.isPlayer);
          const cIdx = rivalStandings.findIndex((s) => s.name === 'SOVEREIGN');
          if (pIdx >= 0 && cIdx > pIdx) {
            this.championBeaten = true;
            window.dispatchEvent(new CustomEvent('race2:champion-beaten', { detail: { track: this.track.id, position: pIdx + 1, sovereignPosition: cIdx + 1 } }));
          }
        }
      }
      if (!r.knockout) {
        const tierBase = r.medal === 'author' ? 0x29e6ff : r.medal === 'gold' ? 0xffcf3f : r.medal === 'silver' ? 0xd7dee8 : r.medal === 'bronze' ? 0xe08d4f : 0x29e6ff;
        const tierColors = [new THREE.Color(tierBase), new THREE.Color(tierBase).lerp(new THREE.Color(0xffffff), 0.6), new THREE.Color(tierBase).lerp(new THREE.Color(0x000000), 0.25)];
        this.particles.confetti(this.car!.state.pos.clone(), tierColors);
        this.slowmoUntil = this.save.settings.reducedMotion ? 0 : performance.now() + 850;
      }
      window.setTimeout(() => {
        this.state = 'finished';
        this.hud.clearCenter();
        this.hud.showRespawnHint(false);
        if (!this.rivalMode && !this.trafficMode) {
          this.save.addStats({
            laps: 1,
            totalDrift: Math.round(this.lapDrift),
            totalAir: Math.round(this.lapAir * 100) / 100,
            wallHits: this.lapWalls,
            cleanLaps: this.lapWalls === 0 ? 1 : 0,
            distanceKm: this.curve ? this.curve.length / 1000 : 0,
          });
          this.lapDrift = 0;
          this.lapAir = 0;
          this.lapWalls = 0;
          if (this.driftMode && variantWritesRecords(this.variant)) {
            const ts = this.save.trackSave(this.track.id);
            const prevBest = ts.driftBest ?? 0;
            if (this.driftScore > prevBest) {
              ts.driftBest = Math.round(this.driftScore);
              this.save.persistSaves();
            }
          }
        }
        const idx = TRACKS.findIndex((t) => t.id === this.track.id);
        let dailyPanel: { dateKey: string; position: number; streak: number } | null = null;
        let trafficPanel: TrafficFinishData | null = null;
        let weeklyPanel: WeeklyPanelData | null = null;
        if (this.knockoutMode) {
          // knockout writes no PB/ghost records; v8 P5 adds win + head-to-head lifetime stats
          if (rivalStandings && !r.knockout) {
            const pos = rivalStandings.findIndex((s) => s.isPlayer) + 1;
            const beaten = rivalStandings.slice(Math.max(0, pos)).filter((s) => !s.isPlayer && !s.eliminated).map((s) => s.name);
            const winsBy: Record<string, number> = {};
            for (const name of beaten) winsBy[name] = (winsBy[name] ?? 0) + 1;
            this.save.addStats({ knockoutWins: pos === 1 ? 1 : 0, rivalWinsBy: winsBy });
          }
        } else if (this.trafficMode) {
          // traffic is a standalone time mode — only the per-track traffic-best ledger
          // (v9 P1: dry in non-day variants)
          const dryTraffic = !variantWritesRecords(this.variant);
          const nm = this.traffic?.nearMisses ?? 0;
          this.save.addStats({ nearMisses: nm, trafficNeedles: nm >= NEEDLE_NEAR_MISSES ? 1 : 0 });
          const credited = Math.min(nm, NEAR_MISS_MAX_CREDITED);
          const bonusMs = credited * NEAR_MISS_BONUS_MS;
          const scoreMs = Math.max(0, r.timeMs - bonusMs);
          const newBest = dryTraffic ? false : this.save.recordTrafficBest(this.track.id, scoreMs);
          trafficPanel = { nearMisses: nm, credited, bonusMs, scoreMs, best: dryTraffic ? null : this.save.allSaves.trafficBest[this.track.id] ?? null, newBest };
        } else if (this.dailyRace && rivalStandings && !r.knockout) {
          // daily is a seeded rival race — records only into the daily ledger, never PB/ghost/lifetime stats
          const pos = rivalStandings.findIndex((s) => s.isPlayer) + 1;
          const res = this.save.recordDailyFinish(this.dailyRace.dateKey, pos, r.timeMs);
          dailyPanel = { dateKey: this.dailyRace.dateKey, position: pos, streak: res.streak };
        } else if (this.weeklyRace && rivalStandings && !r.knockout) {
          // weekly is a seeded rival cup — records only into the weekly run/best ledger, never PB/ghost/cup/daily/lifetime stats
          weeklyPanel = this.applyWeeklyFinish(rivalStandings);
        } else if (this.rivalMode && rivalStandings) {
          const pos = rivalStandings.findIndex((s) => s.isPlayer) + 1;
          const beaten = rivalStandings.slice(Math.max(0, pos)).filter((s) => !s.isPlayer).map((s) => s.name);
          const winsBy: Record<string, number> = {};
          for (const name of beaten) winsBy[name] = (winsBy[name] ?? 0) + 1;
          this.save.addStats({ rivalWins: pos === 1 ? 1 : 0, rivalsBeaten: beaten, rivalWinsBy: winsBy });
        } else if (!this.rivalMode && this.friendRaceActive) {
          // v8 P9 GHOSTBUSTER: the FRIEND finish row's delta is player − ghost (negative = beat)
          const friendRow = (r.ghostResults ?? []).find((g) => g.label === 'FRIEND');
          this.save.addStats({
            friendGhostRaces: 1,
            friendGhostBusts: friendRow && friendRow.deltaMs <= -GHOSTBUST_MARGIN_MS ? 1 : 0,
          });
        }
        this.friendRaceActive = false;
        let careerPanel: CareerPanelData | null = null;
        if (this.careerRace && rivalStandings) {
          careerPanel = this.applyCareerResult(rivalStandings);
        }
        this.announceAchievementPops(achvBefore);
        this.announcePaintUnlocks();
        const hasNext = !careerPanel && !r.knockout && !this.dailyRace && !this.weeklyRace && idx < TRACKS.length - 1;
        const playerPosInRace = rivalStandings ? rivalStandings.findIndex((s) => s.isPlayer) + 1 : -1;
        let podiumEligible =
          !!rivalStandings &&
          !this.dailyRace &&
          !this.weeklyRace &&
          ((careerPanel !== null && careerPanel.isFinal && playerPosInRace >= 1 && playerPosInRace <= 3) ||
            (!this.careerRace && playerPosInRace === 1));
        if (weeklyPanel && weeklyPanel.isFinal && playerPosInRace >= 1 && playerPosInRace <= 3) podiumEligible = true;
        this.lastPodiumOrder = podiumEligible ? rivalStandings : null;
        const driftArg = this.driftMode ? Math.round(this.driftScore) : null;
        const variantRace = !this.rivalMode && !variantWritesRecords(this.variant);
        this.lastFinish = { result: r, hasNext, drift: driftArg, standings: rivalStandings, career: careerPanel, podium: podiumEligible, daily: dailyPanel, traffic: trafficPanel, weekly: weeklyPanel };
        this.menu.showFinish(this.track, r, hasNext, driftArg, rivalStandings, careerPanel, podiumEligible, dailyPanel, trafficPanel, weeklyPanel, variantRace);
        this.touch.hide();
        if (dailyPanel) this.audio.dailyFanfare();
        else if (weeklyPanel?.isFinal) this.audio.weeklyFanfare();
        this.audio.setSlip(0);
        this.audio.stopEngine();
      }, 1400);
    }
  }

  private announceAchievementPops(before: RivalAchievementState): void {
    for (const pop of achievementPops(before, rivalAchievementState(this.save))) {
      this.menu.showToast(`ACHIEVEMENT UNLOCKED — ${pop.name}`);
    }
  }

  /** Paint unlock sweep: fires at the trigger events AND on boot (migrated stats). Idempotent per lock id. */
  private announcePaintUnlocks(): void {
    const achvBefore = rivalAchievementState(this.save);
    for (const id of checkPaintUnlocks(this.save)) {
      this.menu.showToast(`NEW PAINT UNLOCKED — ${PAINT_LOCK_INFO[id].label}`);
      this.audio.unlockChime();
    }
    // the sweep can complete PAINT COLLECTOR (e.g. a knockout win earning the 4th paint)
    this.announceAchievementPops(achvBefore);
  }

  private onKnockoutEvent(ev: KnockoutEvent): void {
    if (ev.isPlayer) {
      this.race?.finishKnockedOut(ev.position);
      return;
    }
    this.hud.showSplash(`${ev.name} ELIMINATED`, 'splash-out');
    if (!this.save.settings.reducedMotion) {
      for (let i = 0; i < 7; i++) {
        this.particles.driftSmoke(
          ev.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6)),
          new THREE.Vector3(0, 0, 0),
          1,
        );
      }
    }
    this.audio.crowd(1.4, 0.08);
  }

  private applyCareerResult(standings: Standing[]): CareerPanelData {
    const { cup, raceIndex } = this.careerRace!;
    const run = this.save.getCupRun()?.cupId === cup.id ? this.save.getCupRun()! : startCupRun(cup.id);
    const res = applyRaceResult(run, standings, this.save.profile.paint);
    const totalRaces = cup.trackIds.length;
    const isFinal = cupComplete(run);
    let trophy: TrophyKind = null;
    if (isFinal) {
      const playerEntry = run.entries.find((e) => e.isPlayer);
      const totalPoints = playerEntry ? playerEntry.points : 0;
      trophy = cupTrophy(run);
      this.save.recordCupFinish(cup.id, { positions: [...run.positions], points: totalPoints, trophy, dateMs: Date.now() });
      this.save.setCupRun(null);
    } else {
      this.save.setCupRun(run);
    }
    return {
      cupName: cup.name,
      cupId: cup.id,
      raceNumber: raceIndex + 1,
      totalRaces,
      playerPos: res.playerPos,
      racePoints: res.playerPoints,
      standings: cupStandings(run),
      isFinal,
      trophy,
    };
  }

  /** v9 P2 slipstream: scan rival/traffic targets (ghosts never draft) + step the player's tracker. */
  private updatePlayerDraft(dt: number): void {
    const car = this.car;
    const curve = this.curve;
    if (!car || !curve) return;
    const s = car.state;
    if (s.wallHit > 0.3) this.playerDraft.reset();
    let bestGap = -1;
    let bestLat = 0;
    if (this.rivalMode && this.rivals) {
      this.rivals.scanPlayerDraft(s.trackDist, s.lateral);
      bestGap = this.rivals.draftScan.gap;
      bestLat = this.rivals.draftScan.lat;
    } else if (this.trafficMode && this.traffic) {
      for (const c of this.traffic.cars) {
        const g = gapAhead(curve.length, s.trackDist, c.dist);
        if (g < DRAFT_GAP_MIN || g > DRAFT_GAP_MAX) continue;
        const dl = Math.abs(c.lat - s.lateral);
        if (bestGap < 0 || dl < bestLat) {
          bestGap = g;
          bestLat = dl;
        }
      }
    }
    this.playerDraft.update(dt, bestGap, bestLat);
    this.draftGap = bestGap;
  }

  private checkOvertake(order: Standing[]): void {
    const pos = order.findIndex((s) => s.isPlayer) + 1;
    const prev = this.lastPlayerPos;
    this.lastPlayerPos = pos;
    if (prev > 0 && pos > 0 && pos < prev) this.triggerOvertake(pos, false);
  }

  /**
   * Overtake moment: 250ms time dilation + soft chime. The ▲P flash itself is the
   * Phase-3 position-change flash, driven by hud.updateRivals in the same tick.
   * Dilation scales the incoming frame dt before the fixed-step accumulator divides
   * it into 120Hz steps, so physics, rivals and race timers all dilate coherently
   * with zero dropped or double-run steps. This is a fair-time arcade effect: race
   * elapsedMs dilates with the sim, so no real-time is gained or lost on the ledger.
   */
  private triggerOvertake(_newPos: number, force: boolean): void {
    if (!this.rivalMode || this.save.settings.reducedMotion) return;
    if (this.state !== 'racing' || this.race!.phase !== 'racing' || !this.car || !this.curve) return;
    const now = performance.now();
    if (!force) {
      if (now < this.overtakeCooldownUntil) return;
      const speed = Math.max(4, Math.abs(this.car.state.forwardSpeed));
      const remainingS = (this.race!.totalLaps * this.curve.length - this.race!.totalProgress) / speed;
      if (remainingS < 3) return;
    }
    this.overtakeCooldownUntil = now + 2000;
    this.slowmoUntil = now + 250;
    this.audio.overtake();
  }

  private enterPodium(order: Standing[] | null): void {
    if (!order || this.podium || this.state !== 'finished' || !this.curve || !this.carVisual || !this.rivals || !this.trackGroup) return;
    const top3 = order.filter((s) => !s.eliminated).slice(0, 3);
    if (top3.length < 2) return;
    const reduced = this.save.settings.reducedMotion;
    const f = this.curve.frames[0];
    const group = new THREE.Group();
    const heights = [1.5, 1.0, 0.65];
    const lats = [0, -3.6, 3.6];
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x111830, roughness: 0.55, metalness: 0.25 });
    const trimMat = new THREE.MeshStandardMaterial({
      color: this.track.accent,
      roughness: 0.4,
      metalness: 0.3,
      emissive: this.track.accent,
      emissiveIntensity: 0.55,
    });
    const xAxis = new THREE.Vector3().crossVectors(f.normal, f.tangent);
    const frameQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, f.normal, f.tangent));
    const centers: THREE.Vector3[] = [];
    for (let i = 0; i < top3.length; i++) {
      const h = heights[i];
      const block = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), blockMat);
      block.position.copy(f.pos).addScaledVector(f.binormal, lats[i]).addScaledVector(f.normal, h / 2);
      block.castShadow = this.quality !== 'low';
      block.receiveShadow = this.quality !== 'low';
      group.add(block);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(3.14, 0.07, 3.14), trimMat);
      trim.position.copy(block.position).addScaledVector(f.normal, h / 2 + 0.035);
      group.add(trim);
      centers.push(f.pos.clone().addScaledVector(f.binormal, lats[i]).addScaledVector(f.normal, h));
    }
    for (let i = 0; i < top3.length; i++) {
      const s = top3[i];
      const visual = s.isPlayer ? this.carVisual : this.rivals.rivals.find((r) => r.skill.name === s.name)?.visual ?? null;
      if (!visual) continue;
      visual.group.position.copy(centers[i]);
      visual.group.quaternion.copy(frameQuat);
    }
    this.trackGroup.add(group);
    const center = f.pos.clone().addScaledVector(f.normal, 1.2);

    this.menu.hideAll();
    this.hud.hide();
    this.touch.hide();
    this.hud.clearCenter();

    const overlay = el('div', 'podium-overlay');
    const strip = el('div', 'podium-strip');
    strip.append(el('div', 'fh-title', 'PODIUM'));
    const cupPoints = new Map<string, number>();
    if (this.lastFinish?.career) for (const e of this.lastFinish.career.standings) cupPoints.set(e.name, e.points);
    top3.forEach((s, i) => {
      const row = el('div', `podium-row podium-${i + 1}${s.isPlayer ? ' you' : ''}`);
      const swatch = el('span', 'fp-swatch');
      swatch.style.background = '#' + s.paint.toString(16).padStart(6, '0');
      const pts = cupPoints.get(s.name);
      row.append(
        el('span', 'fp-pos', `P${i + 1}`),
        swatch,
        el('span', 'fp-name', s.name),
        el('span', 'fp-gap', pts !== undefined ? `${pts} PTS` : i === 0 ? 'WINNER' : `+${Math.round(s.gapMeters)}m`),
      );
      strip.append(row);
    });
    const hint = el('div', 'podium-hint', 'TAP OR PRESS ANY KEY TO CONTINUE');
    overlay.append(strip, hint);
    document.getElementById('ui-root')!.append(overlay);
    this.podiumUi = overlay;

    const skip = () => this.exitPodium();
    overlay.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);

    const timers: number[] = [];
    this.audio.crowd(2.8, 0.11);
    timers.push(window.setTimeout(() => this.audio.crowd(2.2, 0.08), 3200));
    if (!reduced) {
      const confettiPos = center.clone().addScaledVector(f.normal, 5.5);
      const palette = [0xffcf3f, 0xd7dee8, 0xe08d4f, this.track.accent, top3[0].paint].map((h) => new THREE.Color(h));
      this.particles.confetti(confettiPos, palette);
      timers.push(window.setTimeout(() => this.particles.confetti(confettiPos, palette), 900));
      timers.push(window.setTimeout(() => this.particles.confetti(confettiPos, palette), 2100));
    }

    this.podium = {
      group,
      angle: reduced ? Math.PI * 0.75 : Math.PI * 0.25,
      center,
      camPos: new THREE.Vector3(),
      timers,
      cleanup: () => {
        window.removeEventListener('keydown', skip);
        this.trackGroup?.remove(group);
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
      },
    };
  }

  private updatePodium(dt: number): void {
    const p = this.podium;
    if (!p) return;
    if (!this.save.settings.reducedMotion) p.angle += dt * 0.22;
    p.camPos.set(p.center.x + Math.cos(p.angle) * 13, p.center.y + 4.6, p.center.z + Math.sin(p.angle) * 13);
    const cam = this.rig.camera;
    cam.position.lerp(p.camPos, 1 - Math.exp(-3 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(p.center.x, p.center.y + 1.1, p.center.z);
    cam.fov = 55;
    cam.updateProjectionMatrix();
  }

  private exitPodium(): void {
    const p = this.podium;
    if (!p) return;
    this.podium = null;
    for (const t of p.timers) clearTimeout(t);
    p.cleanup();
    this.podiumUi?.remove();
    this.podiumUi = null;
    this.hud.root.classList.remove('hidden');
    const lf = this.lastFinish;
    if (lf) this.menu.showFinish(this.track, lf.result, lf.hasNext, lf.drift, lf.standings, lf.career, lf.podium, lf.daily, lf.traffic, lf.weekly);
  }

  // ---------- Replay theater (v8 P8) ----------

  private startReplay(): void {
    this.replayList = this.replayBuffer.entries.filter((e) => e.trackId === this.track.id);
    if (this.replayList.length > 0) this.openReplay(this.replayList.length - 1);
  }

  /** Open (or cycle to) a replay; index wraps within the current track's session buffer. */
  private openReplay(index: number): void {
    const n = this.replayList.length;
    if (n === 0) return;
    const i = ((index % n) + n) % n;
    const entry = this.replayList[i];
    this.replayIdx = i;
    if (!this.replayCar) {
      this.replayCar = buildCarVisual(this.save.profile.paint, false, this.save.profile.body);
      this.trackGroup!.add(this.replayCar.group);
    }
    this.replayCar.group.visible = true;
    this.replayCar.bodyGroup.visible = true;
    this.rivals?.setVisible(false);
    const samples = entry.samples;
    this.replay = {
      samples,
      t: samples[0].t,
      startMs: samples[0].t,
      endMs: samples[samples.length - 1].t + 800,
      camPos: new THREE.Vector3(),
      nextCut: 0,
      speed: 1,
      playing: true,
      autoCuts: defaultAutoCuts(this.save.settings.reducedMotion),
    };
    this.replayCam = 'chase';
    this.replayCutHint = 0;
    this.state = 'replay';
    this.menu.hideAll();
    this.hud.hide();
    this.touch.hide();
    this.theater.setShareVisible(this.theaterShareable(entry));
    this.theater.show({ trackName: this.track.name, totalMs: this.replay.endMs, index: i, count: n, label: this.theaterLabel(entry) });
    this.theater.setPlaying(true);
    this.theater.setSpeed(1);
    this.theater.setCam('chase');
    this.theater.setAutoCuts(this.replay.autoCuts);
    this.applyReplayFrame(0);
  }

  /** v9 P3: SHARE REPLAY only for real recorded day laps — never imported friend replays. */
  private theaterShareable(entry: ReplayEntry | undefined): boolean {
    return !!entry && !entry.imported && (entry.variant === undefined || entry.variant === 'day');
  }

  private theaterLabel(entry: ReplayEntry | undefined): string {
    return entry?.imported ? 'FRIEND REPLAY' : 'REPLAY';
  }

  private stopReplay(): void {
    this.theater.hide();
    if (this.replayCar) this.replayCar.group.visible = false;
    this.replay = null;
    this.rig.setMode(this.save.settings.cam);
    if (this.friendReplay) {
      this.friendReplay = null;
      this.state = 'menu';
      this.menu.show('title');
      return;
    }
    this.state = 'finished';
    const lf = this.lastFinish;
    if (lf) this.menu.showFinish(this.track, lf.result, lf.hasNext, lf.drift, lf.standings, lf.career, lf.podium, lf.daily, lf.traffic, lf.weekly);
  }

  /** Seek the playhead to t (ms sample-time) and re-derive the frame — one deterministic lookup. */
  private seekReplay(tMs: number): void {
    if (!this.replay) return;
    this.replay.t = clampReplayTime(tMs, this.replay.startMs, this.replay.endMs);
    if (this.replay.autoCuts) this.replay.nextCut = this.replay.t;
    this.applyReplayFrame(0);
    this.pushTheaterTime();
  }

  /** Deterministic render transform at the playhead; shared by playback and seeks. */
  private applyReplayFrame(dt: number): void {
    if (!this.replay || !this.replayCar) return;
    const r = this.replay;
    if (!sampleReplayAt(r.samples, r.t, this.replayPos, this.replayQuat, this.replaySpd)) return;
    this.replayCar.group.position.copy(this.replayPos);
    this.replayCar.group.quaternion.copy(this.replayQuat);
    // wheels spin with SAMPLE-space speed scaled by the replay time scale (slow-mo = slow wheels)
    this.replayCar.wheelSpin += (this.replaySpd.v / 0.34) * dt * r.speed;
    for (const w of this.replayCar.wheels) w.rotation.x = this.replayCar.wheelSpin;
    this.replayFake.pos.copy(this.replayPos);
    this.replayFake.quat.copy(this.replayQuat);
    this.replayFake.speed = this.replaySpd.v;
  }

  private pushTheaterTime(): void {
    if (!this.replay) return;
    this.theater.setTime(this.replay.t, this.replay.startMs, this.replay.endMs);
  }

  /** Manual camera cycle in theater: chase -> close -> hood; stops the director for this session. */
  private cycleReplayCam(): void {
    if (!this.replay) return;
    this.replayCam = this.replayCam === 'chase' ? 'close' : this.replayCam === 'close' ? 'hood' : 'chase';
    this.theater.setCam(this.replayCam);
    if (this.replay.autoCuts) this.setReplayAutoCuts(false);
    else {
      this.rig.setMode(this.replayCam);
      this.rig.snapBehind(this.replayFake);
    }
  }

  private setReplayAutoCuts(on: boolean): void {
    const r = this.replay;
    if (!r) return;
    this.theater.setAutoCuts(on);
    if (r.autoCuts === on) return;
    r.autoCuts = on;
    if (on) {
      r.nextCut = r.t + 400;
    } else {
      this.rig.setMode(this.replayCam);
      this.rig.snapBehind(this.replayFake);
    }
  }

  /** Director cut: flash + new trackside vantage near the playhead (existing v2.2 behavior). */
  private cutReplayCamera(): void {
    const r = this.replay;
    if (!r || !this.replayCar || !this.curve) return;
    const flash = el('div', 'cut-flash');
    document.getElementById('ui-root')!.append(flash);
    window.setTimeout(() => flash.remove(), 260);
    this.theater.flashCut();
    // hint from the playhead's own frame, not the parked player car — the v2.2 hint
    // pinned cuts near the finish line once the hint window missed the replay car
    const idx = this.curve.closestFrameIndex(this.replayCar.group.position, this.replayCutHint, 40);
    this.replayCutHint = idx;
    const f = this.curve.frames[idx];
    const side = Math.random() > 0.5 ? 1 : -1;
    r.camPos
      .copy(f.pos)
      .addScaledVector(f.binormal, side * (f.halfWidth + 8 + Math.random() * 6))
      .addScaledVector(f.normal, 3.5 + Math.random() * 3);
  }

  private updateReplay(dt: number): void {
    if (!this.replay || !this.replayCar) return;
    const r = this.replay;
    this.theater.tickCut(performance.now());
    if (r.playing && !this.theater.scrubbing) {
      r.t = clampReplayTime(advanceReplayTime(r.t, dt * 1000, r.speed), r.startMs, r.endMs);
    }
    this.applyReplayFrame(dt);
    // hood POV in the theater hides the replay body exactly like the P1 race hood cam
    this.replayCar.bodyGroup.visible = !(this.rig.mode === 'hood' && !r.autoCuts);
    this.pushTheaterTime();
    if (r.playing && !this.theater.scrubbing && r.t >= r.endMs) {
      this.stopReplay();
      return;
    }
    if (r.autoCuts) {
      if (r.t >= r.nextCut) {
        r.nextCut = r.t + 6500;
        this.cutReplayCamera();
      }
      const cam = this.rig.camera;
      // a big jump (seek past a cut boundary) snaps instead of lerping across the map
      if (cam.position.distanceTo(r.camPos) > 60) cam.position.copy(r.camPos);
      else cam.position.lerp(r.camPos, 1 - Math.exp(-2.2 * dt));
      cam.up.set(0, 1, 0);
      cam.lookAt(this.replayCar.group.position);
      cam.fov = 55;
      cam.updateProjectionMatrix();
    } else {
      this.rig.setLookBack(false);
      this.rig.boostKick = 0;
      this.rig.speedFovEnabled = !this.save.settings.reducedMotion;
      this.rig.update(dt, this.replayFake);
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
      if (this.debugCensus) {
        const info = this.renderer.info;
        console.log('[census] fps:' + fps.toFixed(0) + ' calls:' + info.render.calls + ' tris:' + info.render.triangles + ' geoms:' + info.memory.geometries + ' tex:' + info.memory.textures);
      }
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.frameMsAvg = (this.frameMsAvg * 0.5 + (1000 / Math.max(1, fps)) * 0.5);
      if (fps < 42) this.lowFpsStreak++;
      else this.lowFpsStreak = 0;
      if (this.lowFpsStreak >= 2 && this.quality !== 'low' && this.save.settings.quality === 'auto') {
        this.quality = this.quality === 'high' ? 'medium' : 'low';
        this.autoDowngrade = this.quality;
        this.applyQualitySettings();
        if (this.state === 'menu') this.rebuildScene();
        this.lowFpsStreak = 0;
      }
      if (this.state !== 'menu') this.dynamicRes(fps);
    }

    const input = this.input.sample(this.save.settings.steeringSensitivity);

    if (this.carVisual) {
      const pov = this.rig.mode === 'hood' && this.state !== 'photo' && !this.podium && this.state !== 'menu' && this.state !== 'replay';
      this.carVisual.bodyGroup.visible = !pov;
    }

    if (input.pause && this.tutorialMode && (this.state === 'racing' || this.state === 'countdown')) {
      // ESC during the tutorial = skip (completion-with-skips); P still pauses.
      this.skipTutorial();
    } else if (input.pause) {
      if (this.podium) {
        this.exitPodium();
      } else if (this.state === 'photo') {
        this.exitPhoto();
      } else if (this.state === 'racing' || this.state === 'countdown') {
        if (this.race?.phase !== 'finished') this.pause();
      } else if (this.state === 'paused') {
        this.resume();
      } else if (this.state === 'finished') {
        if (!this.lastFinish) this.quitToMenu();
      } else if (this.state === 'replay') {
        this.stopReplay();
      }
    }

    if (input.cameraToggle) {
      if (this.state === 'racing' || this.state === 'photo') {
        if (this.state === 'racing') {
          const mode = this.rig.cycleMode();
          this.save.updateSettings({ cam: mode });
        } else this.exitPhoto();
      }
    }

    if (this.state === 'paused') {
      this.renderFrame();
      return;
    }

    if (input.photo) {
      if (this.state === 'racing' || this.state === 'replay') this.enterPhoto();
      else if (this.state === 'photo') this.exitPhoto();
    }

    if (this.state === 'replay') {
      this.updateReplay(dt);
      this.environment?.update(this.rig.camera.position);
      this.environment?.animate(now / 1000, dt);
      this.particles.update(dt);
      this.renderFrame();
      return;
    }

    if (this.state === 'photo') {
      this.updatePhoto();
      this.environment?.update(this.rig.camera.position);
      this.renderFrame();
      return;
    }

    if (this.podium && this.state === 'finished') {
      this.updatePodium(dt);
      this.environment?.update(this.rig.camera.position);
      this.environment?.animate(now / 1000, dt);
      if (this.rainFx?.lines.visible) this.rainFx.update(dt, this.rig.camera.position);
      this.particles.update(dt);
      this.renderFrame();
      return;
    }

    if (this.state === 'menu') {
      if (this.menu.isGarageOpen) {
        this.garage.renderPreview(this.menu.garageCanvas!);
      } else {
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
      }
      this.environment?.update(this.rig.camera.position);
      this.environment?.animate(now / 1000, dt);
      if (this.rainFx?.lines.visible) this.rainFx.update(dt, this.rig.camera.position);
      this.renderFrame();
      return;
    }

    const simDt = 1 / 120;
    const timeScale = performance.now() < this.slowmoUntil ? 0.35 : 1;

    const onSlick = computeOnSlick(this.track.slicks, this.car!.state.trackDist, this.car!.state.lateral);
    this.car!.state.onSlick = onSlick;
    this.car!.state.surfaceGrip = surfaceGripFor(VARIANTS[this.variant].rain);
    if (onSlick !== this.wasOnSlick && Math.abs(this.car!.state.forwardSpeed) > 12) {
      this.particles.landingDust(this.car!.state.pos.clone());
      this.audio.drift();
      this.wasOnSlick = onSlick;
    } else {
      this.wasOnSlick = onSlick;
    }

    this.acc += dt * timeScale;
    let steps = 0;
    // v9 P2: slipstream lives in the free rival/knockout + traffic modes; career/daily/
    // weekly are ledger-balanced (career street-cup silver pin) and keep pre-draft physics.
    const draftMode = (this.rivalMode && !this.careerRace && !this.dailyRace && !this.weeklyRace) || this.trafficMode;
    while (this.acc >= simDt && steps < 8) {
      const prevLaps = this.race!.completedLaps;
      if (draftMode) this.updatePlayerDraft(simDt);
      this.race!.draftFactor = draftMode ? this.playerDraft.factor() : 1;
      this.race!.update(simDt * 1000, input);
      if (this.rivalMode && this.rivals) {
        const mode: RivalMode = this.race!.phase === 'countdown' ? 'countdown' : 'racing';
        const playerLapEff =
          this.knockoutMode && this.race!.phase === 'racing' && this.race!.completedLaps > prevLaps
            ? this.race!.completedLaps
            : 0;
        this.playerRef.dist = this.car!.state.trackDist;
        this.playerRef.lateral = this.car!.state.lateral;
        this.rivals.update(simDt * 1000, mode, this.race!.totalProgress, this.moverSnap, playerLapEff, this.playerRef);
      }
      if (this.trafficMode && this.traffic) {
        this.traffic.update(simDt * 1000, this.car!, this.race!.phase === 'racing');
      }
      this.acc -= simDt;
      steps++;
    }
    if (steps === 8) this.acc = 0;

    // v9 P4: GO banter fires ~950ms after the start, driven by the frame loop
    if (this.banterPending && this.state === 'racing' && this.race?.phase === 'racing' && performance.now() >= this.banterPending.atMs) {
      const line = this.banterPending.line;
      this.banterPending = null;
      this.hud.showSplash(line, 'splash-banter', 1600);
    }

    const s = this.car!.state;
    if (!Number.isFinite(s.pos.x + s.pos.y + s.pos.z + s.vel.x + s.vel.y + s.vel.z)) {
      this.race!.respawnAtCheckpoint();
      this.rig.snapBehind(this.car!.state);
    }
    this.carVisual!.group.position.copy(s.pos);
    this.carVisual!.group.quaternion.copy(s.quat);

    if (this.shadowBlob) {
      const f = this.curve!.frames[s.trackIndex];
      this.shadowBlob.position.copy(s.pos).addScaledVector(f.normal, -0.25);
      this.shadowBlob.position.x = s.pos.x;
      this.shadowBlob.position.z = s.pos.z;
      const air = s.grounded ? 0 : Math.min(1, s.airborneTime * 1.4);
      this.shadowBlob.scale.set(3.4 + air * 2.2, 3.4 + air * 2.2, 1);
      (this.shadowBlob.material as THREE.SpriteMaterial).opacity = 1 - air * 0.8;
    }
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

    if (this.rivalMode && this.rivals) {
      this.rivals.updateVisuals(dt, this.particles, this.track.accent);
    }
    if (this.trafficMode && this.traffic) {
      this.traffic.updateVisuals();
    }

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
      if (this.tutorialMode && this.tutorial && this.car && this.curve) {
        const cs = this.car.state;
        this.tutorialSample.dist = cs.trackDist;
        this.tutorialSample.lateral = cs.lateral;
        this.tutorialSample.speedKmh = Math.abs(cs.forwardSpeed) * 3.6;
        this.tutorialSample.drifting = input.drift && cs.grounded && cs.speed > DRIFT_ACTIVE_MIN_SPEED;
        this.tutorial.observe(this.tutorialSample, dt);
        this.updateTutorialProgressHud();
      }
      const ghostN = this.race!.ghostCount();
      const elapsed = this.race!.elapsedMs;
      for (let i = 0; i < this.ghostVisuals.length; i++) {
        const gv = this.ghostVisuals[i];
        if (i < ghostN && this.save.settings.showGhost && this.race!.ghostSampleInto(elapsed, i, this.ghostPosBuf[i], this.ghostQuatBuf[i])) {
          gv.group.visible = true;
          gv.group.position.copy(this.ghostPosBuf[i]);
          gv.group.quaternion.copy(this.ghostQuatBuf[i]);
        } else {
          gv.group.visible = false;
        }
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

      if (this.meshes) {
        for (let ri = 0; ri < this.meshes.rings.length; ri++) {
          const ring = this.meshes.rings[ri];
          const key = `${this.track.id}:${ri}`;
          if (this.ringsHit.has(key)) continue;
          if (s.pos.distanceTo(ring.pos) < ring.radius) {
            this.ringsHit.add(key);
            this.car!.applyBoost(7, 1.2);
            this.audio.boost();
            this.shake(0.4);
            this.boostKick = 0.8;
            this.particles.wallSparks(s.pos.clone(), new THREE.Vector3(0, 1, 0));
            this.input.rumble(0.6, 0.5, 200);
          }
        }
      }

      if (s.driftAmount > 0.3 && s.grounded && s.speed > 14) {
        this.driftScore += s.driftAmount * s.speed * dt * 12;
        this.lapDrift += s.driftAmount * s.speed * dt * 12;
      }
      const drifting = s.driftAmount > 0.35 && s.grounded && s.speed > 14;
      if (drifting && !this.wasDrifting && !onSlick) this.audio.drift();
      this.wasDrifting = drifting;
      if (!s.grounded) this.lapAir += dt;

      const stuckOffroad = s.offroad && s.grounded && s.speed < 6;
      if (stuckOffroad) {
        this.offroadTime += dt;
      } else {
        this.offroadTime = 0;
      }
      this.hud.showRespawnHint(this.offroadTime > 1.5 && (this.state === 'racing' || this.state === 'countdown'));

      const liveDelta = null;
      const speedRatio = Math.min(1, Math.abs(s.forwardSpeed) / 58);
      this.hud.setDraft(this.playerDraft.active);
      const sl = document.getElementById('speedlines');
      if (sl) {
        const hood = this.rig.mode === 'hood';
        const start = hood ? 0.45 : 0.62;
        let op = Math.min(1, Math.max(0, (speedRatio - start) / 0.38) * (hood ? 1 : 0.85));
        if (this.playerDraft.active && !this.save.settings.reducedMotion) op = Math.max(op, 0.5);
        sl.style.opacity = this.save.settings.reducedMotion ? '0' : String(op);
      }
      const vg = document.getElementById('vignette');
      if (vg) vg.style.opacity = this.save.settings.reducedMotion ? '0.2' : String(0.25 + speedRatio * 0.45);
      this.hud.driftPoints = this.driftScore;
      this.hud.updateDriftScore(this.driftScore);
      this.hud.update(
        this.race!.elapsedMs,
        Math.abs(s.forwardSpeed) * kmh,
        s.driftAmount > 0.35 && s.grounded,
        this.race!.nextCheckpoint,
        this.track.checkpoints.length,
        liveDelta,
      );
      for (let i = 0; i < ghostN; i++) {
        const gt = this.race!.ghostTrack(i)!;
        this.hud.setGhostDelta(i, gt.label, cssHex(gt.color), this.race!.liveGhostDelta(s.trackDist, elapsed, i));
      }
      this.hud.setBattleRank(this.rivalMode || ghostN === 0 ? null : this.race!.battleRank(s.trackDist, elapsed));
      for (let i = 0; i < ghostN; i++) {
        const gd = this.race!.ghostDistAt(elapsed, i);
        this.ghostRatioBuf[i] = gd === null ? null : gd / this.curve!.length;
      }
      for (let i = ghostN; i < this.ghostRatioBuf.length; i++) this.ghostRatioBuf[i] = null;
      this.hud.updateProgress(s.trackDist / this.curve!.length, this.ghostRatioBuf);
      this.audio.updateEngine(Math.min(1, Math.abs(s.forwardSpeed) / 58), input.throttle, !s.grounded);
      // Slip screech: car.state.driftAmount = |lateral velocity| / 9 — continuous tire-slip magnitude.
      this.audio.setSlip(s.grounded && s.speed > 4 ? s.driftAmount : 0);
      this.audio.setSpeedIntensity(Math.min(1, Math.abs(s.forwardSpeed) / 58), s.boostTime > 0);
    }

    if (this.rivalMode && this.rivals && (this.state === 'racing' || this.state === 'countdown')) {
      this.hudAcc += dt;
      if (this.hudAcc >= 0.2) {
        this.hudAcc = 0;
        const order = this.rivals.standings(this.race!.totalProgress);
        this.hud.updateRivals(order, this.save.settings.reducedMotion);
        if (this.state === 'racing' && this.race!.phase === 'racing') this.checkOvertake(order);
      }
    }

    if (this.state === 'racing' || this.state === 'countdown') {
      this.mapAcc += dt;
      if (this.mapAcc >= 1 / 30) {
        this.mapAcc = 0;
        const ghostN = this.race!.ghostCount();
        const showDots = this.save.settings.showGhost;
        for (let i = 0; i < ghostN; i++) {
          const gt = this.race!.ghostTrack(i)!;
          const found = showDots && this.race!.ghostSampleInto(this.race!.elapsedMs, i, this.ghostPosBuf[i], this.ghostQuatBuf[i]);
          this.ghostDotBuf[i].x = found ? this.ghostPosBuf[i].x : 0;
          this.ghostDotBuf[i].z = found ? this.ghostPosBuf[i].z : 0;
          this.ghostDotBuf[i].color = cssHex(gt.color);
        }
        this.ghostDotView.length = showDots ? ghostN : 0;
        this.hud.minimap.update(
          this.car!.state.pos,
          this.rivalMode && this.rivals ? this.rivals.dotPositions() : EMPTY_DOTS,
          this.ghostDotView,
        );
      }
    }

    if (this.state === 'finished') {
      const gh = this.race!.ghostSampleAt(this.race!.elapsedMs, 0);
      void gh;
    }

    for (const pad of this.meshes!.boostPads) {
      const t = now * 0.002;
      pad.mat.map!.offset.y = -t % 1;
    }
    if (this.tutorialRig) {
      const t = now * 0.002;
      for (const pad of this.tutorialRig.pads) pad.mat.map!.offset.y = -t % 1;
    }

    for (let mi = 0; mi < this.meshes!.movers.length; mi++) {
      const m = this.meshes!.movers[mi];
      const f = this.curve!.frames[this.curve!.closestFrameIndex(m.mesh.position, Math.floor((m.dist / this.curve!.length) * this.curve!.frames.length), 30)];
      const lat = (f.halfWidth + 0.8) * Math.sin(now * 0.001 * m.speed + m.phase);
      m.mesh.position.copy(f.pos).addScaledVector(f.binormal, lat).addScaledVector(f.normal, 2.3);
      if (mi >= this.moverSnap.length) this.moverSnap.push({ dist: 0, lat: 0 });
      this.moverSnap[mi].dist = m.dist;
      this.moverSnap[mi].lat = lat;
      if (this.state === 'racing' && this.car) {
        const s = this.car.state;
        if (moverOverlap(s.trackDist, s.lateral, m.dist, lat)) {
          applyMoverScrub(this.car, 1 / 120);
          if (!this.moverCooldown.has(mi)) {
            this.moverCooldown.add(mi);
            this.audio.crash();
            this.particles.wallSparks(s.pos.clone(), new THREE.Vector3(0, 1, 0));
            this.input.rumble(0.9, 0.7, 200);
            this.shake(0.8);
            window.setTimeout(() => this.moverCooldown.delete(mi), 700);
          }
        }
      }
    }
    this.moverSnap.length = this.meshes!.movers.length;
    for (const gate of this.meshes!.checkpointGates) {
      const passed = this.race!.nextCheckpoint > this.meshes!.checkpointGates.indexOf(gate);
      gate.mat.color.set(passed ? 0x35ff7a : 0x7ef3ff);
    }

    this.rig.setLookBack(input.lookBack);
    this.rig.boostKick = this.boostKick;
    this.boostKick = 0;
    this.rig.speedFovEnabled = !this.save.settings.reducedMotion;
    this.rig.update(dt, s);
    this.environment?.update(this.rig.camera.position);
      this.environment?.animate(now / 1000, dt);
    if (this.rainFx?.lines.visible) this.rainFx.update(dt, this.rig.camera.position);
    this.particles.update(dt);
    this.renderFrame();
  };
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

declare global {
  interface Window {
    __race2: {
      inst: Game;
      start: (trackIndex: number, rivals?: boolean | 'knockout' | 'traffic') => void;
      traffic: () => object;
      drive: (v: { steer?: number; throttle?: number; brake?: number; drift?: boolean }) => void;
      auto: (on: boolean) => string;
      state: () => object;
      respawn: () => void;
      skipCountdown: () => void;
      mute: () => void;
      finishLine: () => void;
      rivals: () => object;
      draft: () => object;
      standings: () => object;
      champion: () => object;
      career: () => object;
      friend: () => object | null;
      overtake: () => string;
      podium: () => boolean;
      startDaily: () => object;
      daily: () => object;
      startWeekly: () => object | null;
      weekly: () => object;
      audioProbe: () => object;
      ghosts: () => object;
      cam: (mode?: 'chase' | 'close' | 'hood') => 'chase' | 'close' | 'hood';
      variant: (v?: 'day' | 'dusk' | 'night' | 'rain') => object;
      stats: () => object;
      achievements: () => object;
      paints: () => object;
      unlockPaint: (id?: string) => object;
      startTutorial: () => object;
      tutorial: () => object;
      replay: (cmd?: 'open' | 'seek' | 'speed' | 'cam' | 'cuts' | 'prev' | 'next' | 'pause' | 'play', arg?: number | boolean) => object;
    };
  }
}

window.__race2 = {
  inst: game,
  start: (trackIndex: number, rivals?: boolean | 'knockout' | 'traffic') => {
    game['menu'].rivalsMode = rivals === true;
    game['menu'].knockoutMode = rivals === 'knockout';
    game['menu'].trafficMode = rivals === 'traffic';
    if (rivals === 'knockout' || rivals === 'traffic') {
      game['menu'].driftAttack = false;
      game['driftMode'] = false;
    }
    game['startTrack'](TRACKS[Math.max(0, Math.min(TRACKS.length - 1, trackIndex))]);
  },
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
    game['autoSmooth'] = { smooth: 0 };
    game['autoTimer'] = setInterval(() => {
      game['autoTicks'] = (game['autoTicks'] ?? 0) + 1;
      try {
        const car = game['car'];
        const race = game['race'];
        if (!car || !race) return;
        const s = car.state;
        const curve = car['curve'];
        const frame = curve.frames[s.trackIndex];
        const r = autopilotDrive(car, curve, 0.05, game['autoSmooth']);
        if ((r as { respawn?: boolean }).respawn) {
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
        game['input'].setVirtual({ steer: r.steer, throttle: r.throttle, brake: r.brake, drift: false });
      } catch (e) {
        /* autopilot tick skipped */
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
      pitch: car ? +(Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(0, 0, 1).applyQuaternion(car.state.quat).y))) * (180 / Math.PI)).toFixed(0) : 0,
      grounded: car?.state.grounded,
      trackDist: car ? Math.round(car.state.trackDist) : 0,
      trackLen: car ? Math.round(car['curve'].length ?? 0) : 0,
      lateral: car ? +car.state.lateral.toFixed(1) : 0,
      track: game['track'].id,
      variant: game['variant'],
      surfaceGrip: car ? car.state.surfaceGrip : 1,
       fov: +game['rig'].camera.fov.toFixed(0),
       countdownMs: Math.round(game['race']?.countdownMs ?? -1),
       acc: +game['acc'].toFixed(4),
       lastT: Math.round(game['lastT']),
       perfNow: Math.round(performance.now()),
        timeScale: performance.now() < game['slowmoUntil'] ? 0.35 : 1,
        slowmo: performance.now() < game['slowmoUntil'],
        podium: !!game['podium'],
        knockout: game['knockoutMode'],
        daily: !!game['dailyRace'],
        weekly: !!game['weeklyRace'],
        autoDbg: game['autoDbg'],
        draft: {
          charge: +game['playerDraft'].charge.toFixed(2),
          active: game['playerDraft'].active,
          gap: Math.round(game['draftGap']),
          factor: +game['playerDraft'].factor().toFixed(2),
        },
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
  rivals: () => game['rivals']?.telemetry() ?? [],
  draft: () => ({ charge: +game['playerDraft'].charge.toFixed(2), active: game['playerDraft'].active, gap: Math.round(game['draftGap']), factor: +game['playerDraft'].factor().toFixed(2) }),
  traffic: () => ({ mode: game['trafficMode'], ...(game['traffic']?.telemetry() ?? { count: 0, nearMisses: 0, credited: 0, collisions: 0, cars: [] }) }),
  friend: () => {
    const fg = game['friendGhost'];
    return fg ? { track: fg.trackId, timeMs: fg.timeMs, samples: fg.samples.length } : null;
  },
  career: () => {
    const save = game['save'];
    return {
      run: save.getCupRun(),
      cup: game['careerRace'] ? { id: game['careerRace'].cup.id, raceIndex: game['careerRace'].raceIndex } : null,
      cups: save.allSaves.cups,
      schemaVersion: save.schemaVersion,
    };
  },
  standings: () => {
    const race = game['race'];
    const rivals = game['rivals'];
    if (!game['rivalMode'] || !rivals || !race) return [];
    return rivals.standings(race.totalProgress);
  },
  champion: () => ({ inRace: game['championInRace'], beaten: game['championBeaten'] }),
  overtake: () => {
    const pos = game['lastPlayerPos'] > 1 ? game['lastPlayerPos'] - 1 : 2;
    game['triggerOvertake'](pos, true);
    return 'slowmo-forced';
  },
  podium: () => {
    let order = game['lastPodiumOrder'];
    if (!order) {
      const race = game['race'];
      const rivals = game['rivals'];
      if (race && rivals) order = rivals.standings(race.totalProgress);
    }
    game['enterPodium'](order);
    return !!game['podium'];
  },
  startDaily: () => {
    game['menu'].onStartDaily();
    const save = game['save'];
    return { today: todayKey(), save: save.daily, lastFinish: game['lastFinish']?.daily ?? null };
  },
  daily: () => {
    const save = game['save'];
    return { today: todayKey(), save: save.daily, lastFinish: game['lastFinish']?.daily ?? null };
  },
  startWeekly: () => {
    game['startWeekly']();
    const wr = game['weeklyRace'];
    return wr ? { weekKey: wr.def.weekKey, raceIndex: wr.raceIndex, track: game['track'].id, variant: game['variant'] } : null;
  },
  weekly: () => {
    const save = game['save'];
    const weekKey = game['devWeekKey']();
    const def = weeklyFor(weekKey);
    const wr = game['weeklyRace'];
    return {
      weekKey,
      modifier: { id: def.modifier.id, name: def.modifier.name },
      tracks: def.tracks.map((t) => t.id),
      laps: def.laps,
      lineups: def.lineups.map((lu) => lu.map((r) => `${r.name}(${r.tier})`)),
      race: wr ? { weekKey: wr.def.weekKey, raceIndex: wr.raceIndex, track: game['track'].id, variant: game['variant'] } : null,
      run: save.getWeeklyRun(),
      weekly: { streak: save.weekly.streak, lastWeek: save.weekly.lastWeek, best: save.weekly.best[weekKey] ?? null },
      lastFinish: game['lastFinish']?.weekly ?? null,
    };
  },
  audioProbe: () => game['audio'].audioProbe(),
  ghosts: () => {
    const race = game['race'];
    if (!race) return { active: 0, tracks: [] };
    const tracks = race.ghostTracks().map((g, i) => ({
      index: i,
      label: g.label,
      color: g.color,
      samples: g.samples.length,
      lapMs: Math.round(g.samples[g.samples.length - 1].t),
    }));
    return { active: race.ghostCount(), maxGhosts: race.maxGhosts, settings: game['save'].settings.ghosts, tracks };
  },
  cam: (mode?: 'chase' | 'close' | 'hood') => {
    if (mode === 'chase' || mode === 'close' || mode === 'hood') {
      game['rig'].setMode(mode);
      game['save'].updateSettings({ cam: mode });
    }
    return game['rig'].mode;
  },
  variant: (v?: 'day' | 'dusk' | 'night' | 'rain') => {
    if (v === 'day' || v === 'dusk' || v === 'night' || v === 'rain') {
      game['save'].updateSettings({ variant: v });
    }
    return {
      setting: game['save'].settings.variant,
      active: game['variant'],
      urlOverride: game['urlVariant'],
      dry: !game['rivalMode'] && !variantWritesRecords(game['variant']),
      writesRecords: game['race']?.writesRecords ?? null,
    };
  },
  stats: () => driverStats(game['save']),
  achievements: () => achievementList(game['save']),
  paints: () => {
    const save = game['save'];
    return {
      profilePaint: save.profile.paint,
      unlocked: [...save.unlocks.paints],
      state: paintUnlockState(save),
    };
  },
  unlockPaint: (id?: string) => {
    const ids = PAINT_LOCK_IDS;
    const targets = id && (ids as string[]).includes(id) ? [id as PaintLockId] : ids;
    for (const lock of targets) game['save'].unlockPaint(lock);
    return paintUnlockState(game['save']);
  },
  startTutorial: () => {
    game['startTutorial']();
    const t = game['tutorial'];
    return t ? { active: true, drill: t.drill, drillIndex: t.drillIndex } : { active: false };
  },
  tutorial: () => {
    const t = game['tutorial'];
    const rig = game['tutorialRig'];
    return {
      mode: game['tutorialMode'],
      active: !!t,
      status: t?.status ?? 'off',
      drill: t?.drill ?? null,
      drillIndex: t?.drillIndex ?? -1,
      tries: t?.tries ?? 0,
      done: t?.done ?? 0,
      total: t?.total ?? 0,
      driftTime: +(t?.driftTime.toFixed(2) ?? 0),
      skippedAny: t?.skippedAny ?? false,
      rings: rig
        ? rig.rings.map((r) => ({ id: r.id, pos: { x: +r.pos.x.toFixed(1), y: +r.pos.y.toFixed(1), z: +r.pos.z.toFixed(1) }, radius: r.radius }))
        : [],
      pads: rig ? rig.pads.map((p) => p.id) : [],
      settings: {
        done: game['save'].settings.tutorialDone === true,
        skipped: game['save'].settings.tutorialSkipped === true,
      },
    };
  },
  replay: (cmd?: 'open' | 'seek' | 'speed' | 'cam' | 'cuts' | 'prev' | 'next' | 'pause' | 'play', arg?: number | boolean) => {
    interface ReplayState {
      t: number;
      startMs: number;
      endMs: number;
      speed: number;
      playing: boolean;
      autoCuts: boolean;
    }
    const g = game as unknown as {
      state: string;
      startReplay: () => void;
      seekReplay: (tMs: number) => void;
      cycleReplayCam: () => void;
      setReplayAutoCuts: (on: boolean) => void;
      openReplay: (index: number) => void;
      replayIdx: number;
      replayList: { trackId: string; timeMs: number; samples: unknown[] }[];
      replayBuffer: { entries: { trackId: string; timeMs: number; samples: unknown[] }[] };
      replay: ReplayState | null;
      replayCam: 'chase' | 'close' | 'hood';
      theater: { onSpeed: (s: number) => void; setPlaying: (p: boolean) => void };
      save: { settings: { reducedMotion: boolean } };
    };
    if (cmd === 'open') {
      if (g.state !== 'finished') return { error: 'not-finished' };
      g.startReplay();
    } else if (cmd === 'seek' && typeof arg === 'number') g.seekReplay(arg);
    else if (cmd === 'speed' && typeof arg === 'number' && (REPLAY_SPEEDS as readonly number[]).includes(arg)) g.theater.onSpeed(arg);
    else if (cmd === 'cam') g.cycleReplayCam();
    else if (cmd === 'cuts' && typeof arg === 'boolean') g.setReplayAutoCuts(arg);
    else if (cmd === 'prev') g.openReplay(g.replayIdx - 1);
    else if (cmd === 'next') g.openReplay(g.replayIdx + 1);
    else if (cmd === 'pause' || cmd === 'play') {
      const rp = g.replay;
      if (rp) {
        rp.playing = cmd === 'play';
        g.theater.setPlaying(rp.playing);
      }
    }
    const r = g.replay;
    return {
      available: g.replayList.length > 0,
      buffer: g.replayBuffer.entries.map((e) => ({ trackId: e.trackId, timeMs: e.timeMs, samples: e.samples.length })),
      count: g.replayList.length,
      index: g.replayIdx,
      open: !!r,
      state: g.state,
      tMs: r ? Math.round(r.t) : null,
      totalMs: r ? Math.round(r.endMs) : null,
      playing: r?.playing ?? null,
      speed: r?.speed ?? null,
      cam: g['replayCam'],
      autoCuts: r?.autoCuts ?? null,
      reducedMotion: g.save.settings.reducedMotion,
    };
  },
};

