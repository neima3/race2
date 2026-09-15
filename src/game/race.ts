import * as THREE from 'three';
import { CarPhysics } from '../physics/car';
import type { TrackCurve } from '../track/curve';
import type { TrackDef } from '../track/defs';
import type { InputFrame } from '../core/input';
import type { SaveManager } from '../core/save';
import { DEV_GHOSTS } from '../track/devghosts.gen';
import { updateBoostPads, resetPads, type PadState } from './rules';

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
  knockout?: { position: number };
  ghostResults?: GhostFinishRow[];
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
  lap: { lap: number; totalLaps: number };
  finalLap: undefined;
}

export interface GhostSample {
  t: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export type GhostLabel = 'PB' | 'FRIEND' | 'BOT';

/** Chip/dot color per ghost kind (car paint is chosen per label in main.ts). */
export const GHOST_COLORS: Record<GhostLabel, number> = { PB: 0xffffff, FRIEND: 0xffb52e, BOT: 0x8d96a5 };

export interface GhostTrack {
  samples: GhostSample[];
  dists: number[];
  cpSplits: number[];
  label: GhostLabel;
  color: number;
}

export interface GhostFinishRow {
  label: GhostLabel;
  color: number;
  /** player time minus ghost lap time; negative = player beat the ghost */
  deltaMs: number;
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
  totalLaps = 1;
  writesRecords = true;
  lapsDone = 0;
  private lapOffset = 0;
  private progressDatum = 0;
  private prevDist = 0;
  private maxProgress = 0;
  private pads: PadState = { lastBoostIndex: -1, boostCooldown: 0 };
  private recording: GhostSample[] = [];
  private ghosts: GhostTrack[] = [];
  private externalGhost: GhostSample[] | null = null;
  /** Max simultaneous ghosts (from the GHOSTS setting); capped at 3. */
  maxGhosts = 3;
  ghostActive = false;
  checkpointSplits: number[] = [];
  controlsEnabled = false;
  practice = false;

  constructor(
    private car: CarPhysics,
    private curve: TrackCurve,
    private def: TrackDef,
    private save: SaveManager,
    private emit: <K extends keyof RaceEvents>(event: K, payload?: RaceEvents[K]) => void,
    opts: { laps?: number; writesRecords?: boolean } = {},
  ) {
    if (opts.laps !== undefined) this.totalLaps = opts.laps;
    if (opts.writesRecords !== undefined) this.writesRecords = opts.writesRecords;
  }

  start(): void {
    this.phase = 'countdown';
    this.elapsedMs = 0;
    this.countdownMs = 3600;
    this.nextCheckpoint = 0;
    this.checkpointSplits = [];
    this.recording = [];
    resetPads(this.pads);
    this.controlsEnabled = false;
    this.prevDist = this.car.state.trackDist;
    this.maxProgress = this.car.state.trackDist;
    this.lapsDone = 0;
    this.lapOffset = this.car.state.trackDist > this.curve.length * 0.5 ? -1 : 0;
    this.progressDatum = this.lapOffset * this.curve.length + this.car.state.trackDist;
    if (this.writesRecords) {
      this.ghosts = this.loadGhostTracks();
    } else {
      this.ghosts = [];
    }
    this.ghostActive = this.ghosts.length > 0;
  }

  /**
   * Slot filling: up to `maxGhosts` (1-3) from the available candidates.
   * FRIEND (external ghost) takes the primary slot — preserves today's behavior
   * where an imported friend ghost is THE ghost. Then PB, then dev ("BOT").
   * Dev is skipped when a PB occupies a slot and the limit leaves no room
   * (dedupe: BOT never displaces PB, it only fills genuinely empty slots).
   */
  private loadGhostTracks(): GhostTrack[] {
    const limit = Math.max(0, Math.min(3, Math.round(this.maxGhosts)));
    if (limit === 0) return [];
    const ts = this.save.trackSave(this.def.id);
    const pbData = ts.ghost;
    const devData = DEV_GHOSTS[this.def.id];
    const slots: { samples: GhostSample[]; label: GhostLabel }[] = [];
    if (this.externalGhost && this.externalGhost.length > 1) slots.push({ samples: this.externalGhost, label: 'FRIEND' });
    if (pbData) {
      const samples = deserializeGhost(pbData);
      if (samples.length > 1) slots.push({ samples, label: 'PB' });
    }
    const slotsFree = limit - slots.length;
    if (devData && !(pbData && slotsFree < 1)) {
      const samples = deserializeGhost(devData);
      if (samples.length > 1) slots.push({ samples, label: 'BOT' });
    }
    return slots.slice(0, limit).map((s) => this.buildGhostTrack(s.samples, s.label));
  }

  private buildGhostTrack(samples: GhostSample[], label: GhostLabel): GhostTrack {
    const dists: number[] = [];
    const q = { index: 0, frame: { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3(), halfWidth: 0, dist: 0 }, lateral: 0, vertical: 0, longitudinal: 0, dist: 0 };
    let hint = 0;
    for (const sample of samples) {
      this.curve.surfaceQuery(sample.pos, hint, q);
      hint = q.index;
      dists.push(q.dist);
    }
    const cpSplits: number[] = [];
    for (const cp of this.def.checkpoints) {
      let split: number | null = null;
      for (let i = 1; i < dists.length; i++) {
        const prev = dists[i - 1];
        const curr = dists[i];
        if (prev < cp.dist && curr >= cp.dist && curr - prev < this.curve.length * 0.5) {
          split = samples[i].t;
          break;
        }
      }
      cpSplits.push(split ?? -1);
    }
    return { samples, dists, cpSplits, label, color: GHOST_COLORS[label] };
  }

  useExternalGhost(samples: GhostSample[] | null): void {
    this.externalGhost = samples;
  }

  ghostCount(): number {
    return this.ghosts.length;
  }

  ghostTrack(index: number): GhostTrack | null {
    return this.ghosts[index] ?? null;
  }

  /** All active ghost tracks (for HUD/minimap wiring). */
  ghostTracks(): readonly GhostTrack[] {
    return this.ghosts;
  }

  /** Primary ghost split delta (friend > PB > dev), compared at checkpoint `cpIndex`. */
  ghostSplitDelta(ghostIndex: number, cpIndex: number): number | null {
    const g = this.ghosts[ghostIndex];
    if (!g || cpIndex >= g.cpSplits.length) return null;
    const gt = g.cpSplits[cpIndex];
    if (gt < 0) return null;
    const playerSplit = this.checkpointSplits[cpIndex];
    if (playerSplit === undefined) return null;
    return playerSplit - gt;
  }

  get lastLapSamples(): GhostSample[] {
    return this.recording;
  }

  ghostDistAt(elapsedMs: number, index = 0): number | null {
    const g = this.ghosts[index];
    if (!g || !this.ghostActive || g.dists.length < 2) return null;
    return this.trackDistAt(g, elapsedMs);
  }

  private trackDistAt(g: GhostTrack, elapsedMs: number): number {
    const d = g.dists;
    const s = g.samples;
    if (elapsedMs <= s[0].t) return d[0];
    if (elapsedMs >= s[s.length - 1].t) return d[d.length - 1];
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].t < elapsedMs) lo = mid;
      else hi = mid;
    }
    const t = (elapsedMs - s[lo].t) / Math.max(1, s[hi].t - s[lo].t);
    return d[lo] + (d[hi] - d[lo]) * t;
  }

  /** Signed time delta vs ghost `index` at the player's current distance (negative = ahead). */
  liveGhostDelta(currentDist: number, elapsedMs: number, index = 0): number | null {
    const g = this.ghosts[index];
    if (!g || !this.ghostActive || g.dists.length < 2) return null;
    const d = g.dists;
    const s = g.samples;
    if (currentDist < d[0] || currentDist > d[d.length - 1]) return null;
    let lo = 0;
    let hi = d.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (d[mid] < currentDist) lo = mid;
      else hi = mid;
    }
    const ghostTimeAtDist = s[lo].t + ((currentDist - d[lo]) / Math.max(0.001, d[hi] - d[lo])) * (s[hi].t - s[lo].t);
    return elapsedMs - ghostTimeAtDist;
  }

  /**
   * Player's live rank among player + active ghosts by progress at this instant.
   * Time-trial only (ghosts never load in rival/knockout modes). Returns null when
   * no ghost is active.
   */
  battleRank(dist: number, elapsedMs: number): { rank: number; of: number } | null {
    if (!this.ghostActive || this.ghosts.length === 0) return null;
    let rank = 1;
    for (const g of this.ghosts) {
      if (this.trackDistAt(g, elapsedMs) > dist) rank++;
    }
    return { rank, of: this.ghosts.length + 1 };
  }

  beginRacing(): void {
    this.phase = 'racing';
    this.controlsEnabled = true;
    this.emit('go');
  }

  get bestTimeMs(): number | null {
    return this.save.trackSave(this.def.id).bestTimeMs;
  }

  get totalProgress(): number {
    return (this.lapOffset + this.lapsDone) * this.curve.length + this.car.state.trackDist;
  }

  get lapNumber(): number {
    const traveled = this.totalProgress - this.progressDatum;
    return Math.min(this.totalLaps, Math.max(1, Math.floor(traveled / this.curve.length) + 1));
  }

  get completedLaps(): number {
    return this.lapOffset + this.lapsDone;
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
    this.pads.lastBoostIndex = -1;
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

    if (this.phase === 'racing' && !this.practice) {
      this.elapsedMs += dtMs;
    }
    car.step(dtMs / 1000, input.steer, input.throttle, input.brake, input.drift, true);

    if (this.practice) {
      this.prevDist = car.state.trackDist;
      return;
    }

    if (car.state.forwardSpeed > 1) {
      this.maxProgress = Math.max(this.maxProgress, car.state.trackDist);
    }

    const picked = updateBoostPads(car, this.def, this.pads, dtMs);
    if (picked !== null) this.emit('boost', { index: picked });

    const prev = this.prevDist;
    const curr = car.state.trackDist;
    const len = this.curve.length;
    const cps = this.def.checkpoints;
    const crossedWrap = prev > len * 0.75 && curr < len * 0.25;
    if (this.nextCheckpoint < cps.length && !crossedWrap) {
      const target = cps[this.nextCheckpoint].dist;
      const crossed = prev < target && curr >= target && curr - prev < len * 0.5;
      if (crossed && Math.abs(car.state.lateral) < car.tuning.restHeight + 12) {
        const splitMs = this.elapsedMs;
        this.checkpointSplits.push(splitMs);
        this.emit('checkpoint', {
          index: this.nextCheckpoint,
          total: cps.length,
          splitMs,
          deltaMs: this.ghostSplitDelta(0, this.nextCheckpoint),
        });
        this.nextCheckpoint++;
      }
    } else if (crossedWrap) {
      const cpsDone = this.nextCheckpoint >= cps.length;
      const rollout = this.lapsDone === 0 && this.lapOffset === -1 && this.nextCheckpoint === 0;
      if (cpsDone || rollout) {
        const roadHalf = this.curve.frames[car.state.trackIndex].halfWidth;
        const onRoad = Math.abs(car.state.lateral) < roadHalf + 2.0;
        const moving = car.state.forwardSpeed > 8;
        const progressValid = rollout || this.maxProgress > len * 0.92;
        if (onRoad && moving && progressValid) {
          this.lapsDone++;
          const eff = this.lapOffset + this.lapsDone;
          this.nextCheckpoint = 0;
          this.maxProgress = curr;
          this.pads.lastBoostIndex = -1;
          if (eff >= this.totalLaps && cpsDone) {
            this.finish();
          } else {
            this.emit('lap', { lap: this.lapNumber, totalLaps: this.totalLaps });
            if (eff === this.totalLaps - 1) this.emit('finalLap');
          }
        }
      }
    }
    this.prevDist = curr;

    if (this.writesRecords && (this.recording.length === 0 || this.recording[this.recording.length - 1].t <= this.elapsedMs - GHOST_INTERVAL_MS)) {
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
    let newBest = false;
    const prevBest = this.save.trackSave(this.def.id).bestTimeMs;
    if (this.writesRecords) {
      const ghostData = serializeGhost(this.recording);
      newBest = this.save.submitTime(this.def.id, timeMs, ghostData);
    }
    const splitDetail = this.checkpointSplits.map((splitMs, i) => ({
      splitMs,
      deltaMs: this.ghostSplitDelta(0, i),
    }));
    const ghostResults: GhostFinishRow[] = this.ghosts.map((g) => ({
      label: g.label,
      color: g.color,
      deltaMs: timeMs - g.samples[g.samples.length - 1].t,
    }));
    this.emit('finish', { timeMs, medal, newBest, previousBest: prevBest, splitDetail, ghostResults });
  }

  finishKnockedOut(position: number): void {
    if (this.phase !== 'racing') return;
    this.phase = 'finished';
    this.controlsEnabled = false;
    const timeMs = Math.round(this.elapsedMs);
    const prevBest = this.save.trackSave(this.def.id).bestTimeMs;
    const splitDetail = this.checkpointSplits.map((splitMs, i) => ({
      splitMs,
      deltaMs: this.ghostSplitDelta(0, i),
    }));
    this.emit('finish', { timeMs, medal: 'none', newBest: false, previousBest: prevBest, splitDetail, knockout: { position } });
  }

  ghostSampleAt(elapsedMs: number, index = 0): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    const g = this.ghosts[index];
    if (!g || !this.ghostActive || g.samples.length < 2) return null;
    const s = g.samples;
    if (elapsedMs <= s[0].t) return { pos: s[0].pos.clone(), quat: s[0].quat.clone() };
    if (elapsedMs >= s[s.length - 1].t) return { pos: s[s.length - 1].pos.clone(), quat: s[s.length - 1].quat.clone() };
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].t < elapsedMs) lo = mid;
      else hi = mid;
    }
    const a = s[lo];
    const b = s[hi];
    const t = (elapsedMs - a.t) / Math.max(1, b.t - a.t);
    return {
      pos: a.pos.clone().lerp(b.pos, t),
      quat: a.quat.clone().slerp(b.quat, t),
    };
  }

  /** Allocation-free variant of ghostSampleAt for per-frame render loops. */
  ghostSampleInto(elapsedMs: number, index: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): boolean {
    const g = this.ghosts[index];
    if (!g || !this.ghostActive || g.samples.length < 2) return false;
    const s = g.samples;
    if (elapsedMs <= s[0].t) {
      outPos.copy(s[0].pos);
      outQuat.copy(s[0].quat);
      return true;
    }
    if (elapsedMs >= s[s.length - 1].t) {
      outPos.copy(s[s.length - 1].pos);
      outQuat.copy(s[s.length - 1].quat);
      return true;
    }
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid].t < elapsedMs) lo = mid;
      else hi = mid;
    }
    const a = s[lo];
    const b = s[hi];
    const t = (elapsedMs - a.t) / Math.max(1, b.t - a.t);
    outPos.copy(a.pos).lerp(b.pos, t);
    outQuat.copy(a.quat).slerp(b.quat, t);
    return true;
  }
}
