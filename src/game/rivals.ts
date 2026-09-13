import * as THREE from 'three';
import { CarPhysics, DEFAULT_TUNING } from '../physics/car';
import type { TrackCurve } from '../track/curve';
import type { TrackDef } from '../track/defs';
import { buildCarVisual, type CarVisual, type CarBodyStyle } from '../render/car-model';
import type { ParticleSystem } from '../render/particles';
import { autopilotDrive, type AutoPilotState } from '../systems/autopilot';
import { updateBoostPads, computeOnSlick, moverOverlap, applyMoverScrub, resetPads, surfaceGripFor, type PadState } from './rules';

export type RivalTier = 'easy' | 'mid' | 'pro';

export interface RivalPreset {
  name: string;
  tier: RivalTier;
  paint: number;
  body: CarBodyStyle;
}

export const RIVAL_ROSTER: RivalPreset[] = [
  { name: 'ROOKIE', tier: 'easy', paint: 0xff4d6d, body: 'standard' },
  { name: 'HALCYON', tier: 'easy', paint: 0xe8f2ff, body: 'standard' },
  { name: 'JUNO', tier: 'easy', paint: 0xffb52e, body: 'tank' },
  { name: 'SABLE', tier: 'mid', paint: 0x7dff6e, body: 'standard' },
  { name: 'MIRAGE', tier: 'mid', paint: 0xc8ff2e, body: 'aero' },
  { name: 'ONYX', tier: 'mid', paint: 0xd78a4a, body: 'tank' },
  { name: 'APEX', tier: 'pro', paint: 0xb44dff, body: 'standard' },
  { name: 'VESPER', tier: 'pro', paint: 0x29e6ff, body: 'aero' },
];

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickLineup(trackId: string, cupSlot = 0, tiers: RivalTier[] = ['easy', 'mid', 'pro']): RivalPreset[] {
  const picked: RivalPreset[] = [];
  const tierSeen = new Map<RivalTier, number>();
  return tiers.map((tier) => {
    const n = (tierSeen.get(tier) ?? 0) + 1;
    tierSeen.set(tier, n);
    const key = n === 1 ? tier : `${tier}:${n}`;
    let pool = RIVAL_ROSTER.filter((r) => r.tier === tier);
    if (n > 1) {
      const remaining = pool.filter((p) => !picked.some((q) => q.name === p.name));
      if (remaining.length > 0) pool = remaining;
    }
    const rng = mulberry32(hashSeed(trackId + ':' + cupSlot + ':' + key));
    const pick = pool[Math.floor(rng() * pool.length) % pool.length];
    picked.push(pick);
    return pick;
  });
}

export interface RivalSkill {
  name: string;
  tier: RivalTier;
  pace: number;
  lookaheadJitter: number;
  steerNoise: number;
  lookaheadScale: number;
  paint: number;
  body: CarBodyStyle;
}

const TIER_PARAMS: Record<RivalTier, { pace: number; lookaheadJitter: number; steerNoise: number; lookaheadScale: number }> = {
  easy: { pace: 0.94, lookaheadJitter: -0.12, steerNoise: 0.05, lookaheadScale: 1.3 },
  mid: { pace: 0.955, lookaheadJitter: 0.04, steerNoise: 0.03, lookaheadScale: 1.3 },
  pro: { pace: 1.0, lookaheadJitter: 0, steerNoise: 0, lookaheadScale: 1.15 },
};

const TIER_TUNING: Record<RivalTier, { accel: number; maxSpeed: number }> = {
  easy: { accel: 0.94, maxSpeed: 0.975 },
  mid: { accel: 0.97, maxSpeed: 0.985 },
  pro: { accel: 1.05, maxSpeed: 1.025 },
};

export const DEFAULT_RIVAL_LAPS = 2;
export const PLAYER_NAME = 'YOU';

const RUBBER_BAND = 0.08;
const RUBBER_BAND_DEADZONE = 10;
const RUBBER_BAND_RAMP = 45;
const STUCK_SPEED = 2;
const STUCK_TIME_MS = 4000;
const STALL_TIME_MS = 6000;
const STALL_MARGIN_M = 2;
const RIVAL_RESPAWN_SPEED = 8;
const GRID_START_DIST = 8;
const GRID_GAP = 6;
const GRID_LATERAL = 2.5;

export type RivalMode = 'countdown' | 'racing' | 'idle';

export interface RivalTelemetry {
  name: string;
  tier: RivalTier;
  paint: number;
  finished: boolean;
  lapsDone: number;
  totalProgress: number;
  speedMs: number;
  trackDist: number;
  lateral: number;
  effectivePace: number;
}

export interface Standing {
  name: string;
  progress: number;
  isPlayer: boolean;
  gapMeters: number;
  paint: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface MinimapDot {
  x: number;
  z: number;
  paint: number;
}

export interface MoverSnapshot {
  dist: number;
  lat: number;
}

interface Rival {
  skill: RivalSkill;
  car: CarPhysics;
  visual: CarVisual;
  ap: AutoPilotState;
  pads: PadState;
  prevDist: number;
  lapOffset: number;
  lapsDone: number;
  nextCheckpoint: number;
  maxProgress: number;
  totalProgress: number;
  stuckMs: number;
  stallMs: number;
  stallMark: number;
  finished: boolean;
  finishRank: number;
  finishTimeMs: number | null;
  band: number;
}

const tmpPos = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpColor = new THREE.Color();

export class RivalManager {
  readonly rivals: Rival[] = [];
  totalLaps = DEFAULT_RIVAL_LAPS;
  rain = false;
  private curve: TrackCurve;
  private def: TrackDef;
  private frozen: Standing[] | null = null;
  private finishCounter = 0;
  private raceClockMs = 0;
  private playerPaint = 0x29e6ff;
  private playerFinished = false;
  private playerFinishMs: number | null = null;
  private dotBuf: MinimapDot[] = [];

  constructor(curve: TrackCurve, def: TrackDef, parent: THREE.Group, shadows: boolean, lineup: RivalPreset[] = pickLineup(def.id), opts: { night?: boolean } = {}) {
    this.curve = curve;
    this.def = def;
    for (const preset of lineup) {
      const visual = buildCarVisual(preset.paint, false, preset.body, opts.night === true);
      visual.group.visible = false;
      visual.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = shadows;
      });
      parent.add(visual.group);
      this.rivals.push({
        skill: { name: preset.name, tier: preset.tier, ...TIER_PARAMS[preset.tier], paint: preset.paint, body: preset.body },
        car: new CarPhysics(curve, {
          accel: DEFAULT_TUNING.accel * TIER_TUNING[preset.tier].accel,
          maxSpeed: DEFAULT_TUNING.maxSpeed * TIER_TUNING[preset.tier].maxSpeed,
        }),
        visual,
        ap: { smooth: 0 },
        pads: { lastBoostIndex: -1, boostCooldown: 0 },
        prevDist: 0,
        lapOffset: 0,
        lapsDone: 0,
        nextCheckpoint: 0,
        maxProgress: 0,
        totalProgress: 0,
        stuckMs: 0,
        stallMs: 0,
        stallMark: 0,
        finished: false,
        finishRank: 0,
        finishTimeMs: null,
        band: 0,
      });
    }
  }

  gridSlot(k: number): { dist: number; lateral: number } {
    const len = this.curve.length;
    let d = (GRID_START_DIST - k * GRID_GAP) % len;
    if (d < 0) d += len;
    return { dist: d, lateral: k % 2 === 0 ? -GRID_LATERAL : GRID_LATERAL };
  }

  placeOnGrid(): void {
    const len = this.curve.length;
    this.frozen = null;
    this.finishCounter = 0;
    this.raceClockMs = 0;
    this.playerFinished = false;
    this.playerFinishMs = null;
    for (let k = 0; k < this.rivals.length; k++) {
      const r = this.rivals[k];
      const slot = this.gridSlot(k);
      r.car.placeAt(slot.dist, slot.lateral);
      r.prevDist = slot.dist;
      r.lapOffset = slot.dist > len * 0.5 ? -1 : 0;
      r.lapsDone = 0;
      r.nextCheckpoint = 0;
      r.maxProgress = slot.dist;
      r.totalProgress = r.lapOffset * len + slot.dist;
      r.stuckMs = 0;
      r.stallMs = 0;
      r.stallMark = r.totalProgress;
      r.finished = false;
      r.finishRank = 0;
      r.finishTimeMs = null;
      r.band = 0;
      r.ap.smooth = 0;
      resetPads(r.pads);
    }
  }

  setVisible(on: boolean): void {
    for (const r of this.rivals) r.visual.group.visible = on;
  }

  update(dtMs: number, mode: RivalMode, playerProgress: number, movers: MoverSnapshot[] | null = null): void {
    const dt = dtMs / 1000;
    if (mode === 'racing') this.raceClockMs += dtMs;
    for (const r of this.rivals) {
      const car = r.car;
      if (mode === 'countdown') {
        car.step(dt, 0, 0, 0, false, false);
        continue;
      }
      if (mode === 'idle' || r.finished) {
        car.step(dt, 0, 0, 0.6, false, false);
        continue;
      }
      car.state.onSlick = computeOnSlick(this.def.slicks, car.state.trackDist, car.state.lateral);
      car.state.surfaceGrip = surfaceGripFor(this.rain);
      const gap = playerProgress - r.totalProgress;
      const raw = gap >= 0 ? Math.max(0, gap - RUBBER_BAND_DEADZONE) : Math.min(0, gap + RUBBER_BAND_DEADZONE);
      r.band = Math.max(-1, Math.min(1, raw / RUBBER_BAND_RAMP)) * RUBBER_BAND;
      const res = autopilotDrive(car, this.curve, dt, r.ap, {
        pace: r.skill.pace + r.band,
        lookaheadJitter: r.skill.lookaheadJitter,
        steerNoise: r.skill.steerNoise,
        lookaheadScale: r.skill.lookaheadScale,
      });
      if (res.respawn && car.state.speed < RIVAL_RESPAWN_SPEED) {
        this.respawnRival(r);
        continue;
      }
      if (car.state.speed < STUCK_SPEED) r.stuckMs += dtMs;
      else r.stuckMs = 0;
      if (r.stuckMs > STUCK_TIME_MS) {
        this.respawnRival(r);
        continue;
      }
      car.step(dt, res.steer, res.throttle, res.brake, false, true);
      updateBoostPads(car, this.def, r.pads, dtMs);
      if (movers) {
        for (let i = 0; i < movers.length; i++) {
          const m = movers[i];
          if (moverOverlap(car.state.trackDist, car.state.lateral, m.dist, m.lat)) applyMoverScrub(car, dt);
        }
      }
      this.trackProgress(r);
      if (r.totalProgress > r.stallMark + STALL_MARGIN_M) {
        r.stallMark = r.totalProgress;
        r.stallMs = 0;
      } else {
        r.stallMs += dtMs;
        if (r.stallMs > STALL_TIME_MS) {
          this.respawnRival(r);
          r.stallMark = r.totalProgress;
          r.stallMs = 0;
        }
      }
    }
  }

  private respawnRival(r: Rival): void {
    const cps = this.def.checkpoints;
    const targetDist = r.nextCheckpoint === 0 ? 8 : cps[r.nextCheckpoint - 1].dist;
    r.car.placeAt(targetDist, 0);
    r.prevDist = targetDist;
    r.stuckMs = 0;
    r.ap.smooth = 0;
    r.pads.lastBoostIndex = -1;
  }

  private trackProgress(r: Rival): void {
    const car = r.car;
    const len = this.curve.length;
    if (car.state.forwardSpeed > 1) {
      r.maxProgress = Math.max(r.maxProgress, car.state.trackDist);
    }
    const cps = this.def.checkpoints;
    const prev = r.prevDist;
    const curr = car.state.trackDist;
    const crossedFinish = prev > len * 0.75 && curr < len * 0.25;
    if (r.nextCheckpoint < cps.length && !crossedFinish) {
      const target = cps[r.nextCheckpoint].dist;
      if (prev < target && curr >= target && curr - prev < len * 0.5) {
        r.nextCheckpoint++;
      }
    } else if (crossedFinish) {
      const cpsDone = r.nextCheckpoint >= cps.length;
      const rollout = r.lapsDone === 0 && r.lapOffset === -1 && r.nextCheckpoint === 0;
      if (cpsDone || rollout) {
        const progressValid = rollout || r.maxProgress > len * 0.92;
        if (progressValid) {
          r.lapsDone++;
          r.nextCheckpoint = 0;
          r.maxProgress = curr;
          r.pads.lastBoostIndex = -1;
          if (r.lapOffset + r.lapsDone >= this.totalLaps) {
            r.finished = true;
            r.finishRank = ++this.finishCounter;
            r.finishTimeMs = this.raceClockMs;
          }
        }
      }
    }
    r.prevDist = curr;
    r.totalProgress = (r.lapOffset + r.lapsDone) * len + curr;
  }

  allFinished(): boolean {
    return this.rivals.every((r) => r.finished);
  }

  setPlayerPaint(paint: number): void {
    this.playerPaint = paint;
  }

  dotPositions(): MinimapDot[] {
    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];
      const d = this.dotBuf[i];
      if (d) {
        d.x = r.car.state.pos.x;
        d.z = r.car.state.pos.z;
        d.paint = r.skill.paint;
      } else {
        this.dotBuf[i] = { x: r.car.state.pos.x, z: r.car.state.pos.z, paint: r.skill.paint };
      }
    }
    this.dotBuf.length = this.rivals.length;
    return this.dotBuf;
  }

  standings(playerProgress: number): Standing[] {
    if (this.frozen) return this.frozen;
    const finishDatum = this.totalLaps * this.curve.length;
    const keys: number[] = [];
    const list: Standing[] = [];
    for (const r of this.rivals) {
      const finished = r.finished && r.finishRank > 0;
      keys.push(finished ? Number.MAX_SAFE_INTEGER - r.finishRank : r.totalProgress);
      list.push({
        name: r.skill.name,
        progress: finished ? finishDatum : r.totalProgress,
        isPlayer: false,
        gapMeters: 0,
        paint: r.skill.paint,
        finished: r.finished,
        finishTimeMs: r.finishTimeMs,
      });
    }
    keys.push(playerProgress);
    list.push({
      name: PLAYER_NAME,
      progress: playerProgress,
      isPlayer: true,
      gapMeters: 0,
      paint: this.playerPaint,
      finished: this.playerFinished,
      finishTimeMs: this.playerFinishMs,
    });
    const order = keys.map((k, i) => [k, i] as const).sort((a, b) => b[0] - a[0]);
    const ordered = order.map(([, i]) => list[i]);
    const leaderProgress = ordered.length > 0 ? ordered[0].progress : 0;
    for (const s of ordered) s.gapMeters = Math.max(0, leaderProgress - s.progress);
    return ordered;
  }

  freeze(playerProgress: number, playerFinishMs: number | null = null): Standing[] {
    if (!this.frozen) {
      this.playerFinished = true;
      this.playerFinishMs = playerFinishMs;
      this.frozen = this.standings(playerProgress);
    }
    return this.frozen;
  }

  telemetry(): RivalTelemetry[] {
    return this.rivals.map((r) => ({
      name: r.skill.name,
      tier: r.skill.tier,
      paint: r.skill.paint,
      finished: r.finished,
      lapsDone: r.lapsDone,
      totalProgress: Math.round(r.totalProgress),
      speedMs: +r.car.state.forwardSpeed.toFixed(1),
      trackDist: Math.round(r.car.state.trackDist),
      lateral: +r.car.state.lateral.toFixed(1),
      effectivePace: +(r.skill.pace + r.band).toFixed(3),
    }));
  }

  updateVisuals(dt: number, particles: ParticleSystem | null, accent: number): void {
    for (const r of this.rivals) {
      const v = r.visual;
      v.group.position.copy(r.car.state.pos);
      v.group.quaternion.copy(r.car.state.quat);
      v.wheelSpin += (r.car.state.forwardSpeed / 0.34) * dt;
      for (const w of v.wheels) w.rotation.x = v.wheelSpin;
      if (particles && r.car.state.boostTime > 0) {
        tmpDir.set(0, 0.15, -1.9).applyQuaternion(r.car.state.quat);
        tmpPos.copy(r.car.state.pos).add(tmpDir);
        tmpDir.set(0, 0, 1).applyQuaternion(r.car.state.quat);
        particles.boostFlames(tmpPos, tmpDir, tmpColor.set(accent));
      }
    }
  }
}
