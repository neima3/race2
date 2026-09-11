import * as THREE from 'three';
import { CarPhysics } from '../physics/car';
import type { TrackCurve } from '../track/curve';
import type { TrackDef } from '../track/defs';
import type { InputFrame } from '../core/input';
import type { SaveManager } from '../core/save';

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface CheckpointEvent {
  index: number;
  total: number;
  splitMs: number;
  deltaMs: number | null;
}

export interface FinishResult {
  timeMs: number;
  medal: 'none' | 'bronze' | 'silver' | 'gold' | 'author';
  newBest: boolean;
  previousBest: number | null;
  splitDetail: { splitMs: number; deltaMs: number | null }[];
  isRecordLapCount?: number;
}

export interface RaceEvents {
  countdownTick: number;
  go: undefined;
  checkpoint: CheckpointEvent;
  boost: { index: number };
  wallHit: undefined;
  landed: { airTime: number };
  finish: FinishResult;
  respawn: undefined;
}

interface GhostSample {
  t: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

const GHOST_INTERVAL_MS = 1000 / 30;

export function serializeGhost(samples: GhostSample[]): string {
  const arr = new Float32Array(samples.length * 8);
  let o = 0;
  for (const s of samples) {
    arr[o++] = s.t;
    arr[o++] = s.pos.x;
    arr[o++] = s.pos.y;
    arr[o++] = s.pos.z;
    arr[o++] = s.quat.x;
    arr[o++] = s.quat.y;
    arr[o++] = s.quat.z;
    arr[o++] = s.quat.w;
  }
  let bin = '';
  const bytes = new Uint8Array(arr.buffer);
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function deserializeGhost(data: string): GhostSample[] {
  try {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const arr = new Float32Array(bytes.buffer);
    const samples: GhostSample[] = [];
    for (let o = 0; o + 7 < arr.length; o += 8) {
      samples.push({
        t: arr[o],
        pos: new THREE.Vector3(arr[o + 1], arr[o + 2], arr[o + 3]),
        quat: new THREE.Quaternion(arr[o + 4], arr[o + 5], arr[o + 6], arr[o + 7]),
      });
    }
    return samples;
  } catch {
    return [];
  }
}

export class RaceController {
  phase: RacePhase = 'countdown';
  elapsedMs = 0;
  countdownMs = 3600;
  nextCheckpoint = 0;
  private prevDist = 0;
  private maxProgress = 0;
  private lastBoostIndex = -1;
  private boostCooldown = 0;
  private recording: GhostSample[] = [];
  private ghost: GhostSample[] = [];
  private ghostDists: number[] = [];
  private ghostCpSplits: number[] = [];
  ghostActive = false;
  checkpointSplits: number[] = [];
  controlsEnabled = false;

  constructor(
    private car: CarPhysics,
    private curve: TrackCurve,
    private def: TrackDef,
    private save: SaveManager,
    private emit: <K extends keyof RaceEvents>(event: K, payload?: RaceEvents[K]) => void,
  ) {}

  start(): void {
    this.phase = 'countdown';
    this.elapsedMs = 0;
    this.countdownMs = 3600;
    this.nextCheckpoint = 0;
    this.checkpointSplits = [];
    this.recording = [];
    this.lastBoostIndex = -1;
    this.boostCooldown = 0;
    this.controlsEnabled = false;
    this.prevDist = this.car.state.trackDist;
    this.maxProgress = this.car.state.trackDist;
    const ghostData = this.save.trackSave(this.def.id).ghost;
    this.ghost = ghostData ? deserializeGhost(ghostData) : [];
    this.ghostActive = this.ghost.length > 1;
    this.ghostDists = [];
    this.ghostCpSplits = [];
    if (this.ghostActive) {
      const q = { index: 0, frame: { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 }, lateral: 0, vertical: 0, longitudinal: 0, dist: 0 };
      let hint = 0;
      for (const sample of this.ghost) {
        this.curve.surfaceQuery(sample.pos, hint, q);
        hint = q.index;
        this.ghostDists.push(q.dist);
      }
      for (const cp of this.def.checkpoints) {
        let split: number | null = null;
        for (let i = 1; i < this.ghostDists.length; i++) {
          const prev = this.ghostDists[i - 1];
          const curr = this.ghostDists[i];
          if (prev < cp.dist && curr >= cp.dist && curr - prev < this.curve.length * 0.5) {
            split = this.ghost[i].t;
            break;
          }
        }
        this.ghostCpSplits.push(split ?? -1);
      }
    }
  }

  ghostSplitDelta(index: number): number | null {
    if (index >= this.ghostCpSplits.length) return null;
    const gt = this.ghostCpSplits[index];
    if (gt < 0) return null;
    const playerSplit = this.checkpointSplits[index];
    if (playerSplit === undefined) return null;
    return playerSplit - gt;
  }

  get lastLapSamples(): GhostSample[] {
    return this.recording;
  }

  ghostDistAt(elapsedMs: number): number | null {
    if (!this.ghostActive || this.ghostDists.length < 2) return null;
    const g = this.ghost;
    if (elapsedMs <= g[0].t) return this.ghostDists[0];
    if (elapsedMs >= g[g.length - 1].t) return this.ghostDists[this.ghostDists.length - 1];
    let lo = 0;
    let hi = g.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (g[mid].t < elapsedMs) lo = mid;
      else hi = mid;
    }
    const t = (elapsedMs - g[lo].t) / Math.max(1, g[hi].t - g[lo].t);
    return this.ghostDists[lo] + (this.ghostDists[hi] - this.ghostDists[lo]) * t;
  }

  liveGhostDelta(currentDist: number, elapsedMs: number): number | null {
    if (!this.ghostActive || this.ghostDists.length < 2) return null;
    const d = this.ghostDists;
    let lo = 0;
    let hi = d.length - 1;
    if (currentDist < d[0] || currentDist > d[d.length - 1]) return null;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (d[mid] < currentDist) lo = mid;
      else hi = mid;
    }
    const ghostTimeAtDist = this.ghost[lo].t + ((currentDist - d[lo]) / Math.max(0.001, d[hi] - d[lo])) * (this.ghost[hi].t - this.ghost[lo].t);
    return elapsedMs - ghostTimeAtDist;
  }

  beginRacing(): void {
    this.phase = 'racing';
    this.controlsEnabled = true;
    this.emit('go');
  }

  get bestTimeMs(): number | null {
    return this.save.trackSave(this.def.id).bestTimeMs;
  }

  respawnAtCheckpoint(): void {
    if (this.phase !== 'racing') return;
    const targetDist = this.nextCheckpoint === 0 ? 8 : this.def.checkpoints[this.nextCheckpoint - 1].dist;
    let idx = 0;
    for (let i = 0; i < this.curve.frames.length; i++) {
      if (this.curve.frames[i].dist >= targetDist) {
        idx = i;
        break;
      }
    }
    this.car.placeAtFrame(idx, targetDist);
    this.prevDist = targetDist;
    this.lastBoostIndex = -1;
    this.emit('respawn');
  }

  update(dtMs: number, input: InputFrame): void {
    const car = this.car;

    if (input.respawn) this.respawnAtCheckpoint();

    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdownMs / 1000);
      this.countdownMs -= dtMs;
      const after = Math.ceil(this.countdownMs / 1000);
      if (after < before && after > 0) this.emit('countdownTick', after);
      if (this.countdownMs <= 0) this.beginRacing();
      car.step(dtMs / 1000, 0, 0, 0, false, false);
      return;
    }

    if (this.phase === 'finished') {
      car.step(dtMs / 1000, 0, 0, 0.6, false, false);
      return;
    }

    this.elapsedMs += dtMs;
    car.step(dtMs / 1000, input.steer, input.throttle, input.brake, input.drift, true);

    if (car.state.forwardSpeed > 1) {
      this.maxProgress = Math.max(this.maxProgress, car.state.trackDist);
    }

    if (this.boostCooldown > 0) this.boostCooldown -= dtMs;

    for (let i = 0; i < this.def.boosts.length; i++) {
      const b = this.def.boosts[i];
      if (i === this.lastBoostIndex) continue;
      if (this.boostCooldown > 0) continue;
      const d = car.state.trackDist;
      const near = Math.abs(d - b.dist) < 6;
      const latOk = Math.abs(car.state.lateral - b.lateral) < 3.6;
      if (near && latOk && car.state.grounded) {
        car.applyBoost(b.strength, 1.6);
        this.lastBoostIndex = i;
        this.boostCooldown = 400;
        this.emit('boost', { index: i });
      }
    }

    const prev = this.prevDist;
    const curr = car.state.trackDist;
    const len = this.curve.length;
    const cps = this.def.checkpoints;
    if (this.nextCheckpoint < cps.length) {
      const target = cps[this.nextCheckpoint].dist;
      const crossed = prev < target && curr >= target && curr - prev < len * 0.5;
      if (crossed && Math.abs(car.state.lateral) < car.tuning.restHeight + 12) {
        const splitMs = this.elapsedMs;
        this.checkpointSplits.push(splitMs);
        this.emit('checkpoint', {
          index: this.nextCheckpoint,
          total: cps.length,
          splitMs,
          deltaMs: this.ghostSplitDelta(this.nextCheckpoint),
        });
        this.nextCheckpoint++;
      }
    } else {
            const crossedFinish = prev > len * 0.75 && curr < len * 0.25;
      const progressValid = this.maxProgress > len * 0.92;
      const roadHalf = this.curve.frames[car.state.trackIndex].halfWidth;
      const onRoad = Math.abs(car.state.lateral) < roadHalf + 1.2;
      const moving = car.state.forwardSpeed > 8;
      if (crossedFinish && progressValid && onRoad && moving) {
        this.finish();
      }
    }
    this.prevDist = curr;

    if (this.recording.length === 0 || this.recording[this.recording.length - 1].t <= this.elapsedMs - GHOST_INTERVAL_MS) {
      this.recording.push({
        t: this.elapsedMs,
        pos: car.state.pos.clone(),
        quat: car.state.quat.clone(),
      });
    }

    if (car.state.wallHit > 0.31) {
      this.emit('wallHit');
    }
    if (car.state.grounded && car.state.landedAt > 0 && car.state.airborneTime < 0.001 && this.landedFlag !== car.state.landedAt) {
      this.landedFlag = car.state.landedAt;
      this.emit('landed', { airTime: car.state.landedAt });
    }
  }

  private landedFlag = -1;

  private finish(): void {
    this.phase = 'finished';
    this.controlsEnabled = false;
    const timeMs = Math.round(this.elapsedMs);
    const m = this.def.medals;
    const medal =
      timeMs <= m.author ? 'author' : timeMs <= m.gold ? 'gold' : timeMs <= m.silver ? 'silver' : timeMs <= m.bronze ? 'bronze' : 'none';
    const ghostData = serializeGhost(this.recording);
    const prevBest = this.save.trackSave(this.def.id).bestTimeMs;
    const newBest = this.save.submitTime(this.def.id, timeMs, ghostData);
    const splitDetail = this.checkpointSplits.map((splitMs, i) => ({
      splitMs,
      deltaMs: (() => {
        const gt = this.ghostCpSplits[i];
        return gt !== undefined && gt >= 0 ? splitMs - gt : null;
      })(),
    }));
    this.emit('finish', { timeMs, medal, newBest, previousBest: prevBest, splitDetail });
  }

  ghostSampleAt(elapsedMs: number): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    if (!this.ghostActive || this.ghost.length < 2) return null;
    const g = this.ghost;
    if (elapsedMs <= g[0].t) return { pos: g[0].pos.clone(), quat: g[0].quat.clone() };
    if (elapsedMs >= g[g.length - 1].t) return { pos: g[g.length - 1].pos.clone(), quat: g[g.length - 1].quat.clone() };
    let lo = 0;
    let hi = g.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (g[mid].t < elapsedMs) lo = mid;
      else hi = mid;
    }
    const a = g[lo];
    const b = g[hi];
    const t = (elapsedMs - a.t) / Math.max(1, b.t - a.t);
    return {
      pos: a.pos.clone().lerp(b.pos, t),
      quat: a.quat.clone().slerp(b.quat, t),
    };
  }
}
