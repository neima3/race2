import * as THREE from 'three';
import type { TrackDef } from '../track/defs';
import type { GhostSample } from './race';

export class ShareError extends Error {}

const MAX_GHOST_MS = 90000;
const HDR_SIZE = 35;
const SAMPLE_SIZE = 10;
const QUAT_HALF_RANGE = Math.SQRT1_2;
const FLAG_DEFLATE = 1;

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToB64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b0 = bytes[i];
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 3) << 4) | (b1 >> 4)];
    if (has1) out += B64URL[((b1 & 15) << 2) | (b2 >> 6)];
    if (has2) out += B64URL[b2 & 63];
  }
  return out;
}

export function b64urlToBytes(s: string): Uint8Array {
  const len = s.length;
  const rem = len % 4;
  if (rem === 1) throw new ShareError('bad base64url length');
  const outLen = (len >> 2) * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n = Math.min(4, len - i);
    const c0 = B64URL.indexOf(s[i]);
    const c1 = B64URL.indexOf(s[i + 1]);
    if (c0 < 0 || c1 < 0) throw new ShareError('bad base64url char');
    const c2 = n > 2 ? B64URL.indexOf(s[i + 2]) : 0;
    const c3 = n > 3 ? B64URL.indexOf(s[i + 3]) : 0;
    if (c2 < 0 || c3 < 0) throw new ShareError('bad base64url char');
    const v = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out[o++] = (v >> 16) & 255;
    if (n > 2) out[o++] = (v >> 8) & 255;
    if (n > 3) out[o++] = v & 255;
  }
  return out;
}

function trackBounds(def: TrackDef): { min: number[]; scale: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of def.points) {
    for (let a = 0; a < 3; a++) {
      if (p.pos[a] < min[a]) min[a] = p.pos[a];
      if (p.pos[a] > max[a]) max[a] = p.pos[a];
    }
  }
  const scale: number[] = [];
  for (let a = 0; a < 3; a++) {
    let span = max[a] - min[a];
    if (!Number.isFinite(span) || span < 1) span = 1;
    const pad = 30 + span * 0.05;
    min[a] -= pad;
    scale[a] = (span + pad * 2) / 65535;
  }
  return { min, scale };
}

function transposeBytes(src: Uint8Array, count: number, stride: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let s = 0; s < count; s++) {
    for (let b = 0; b < stride; b++) out[b * count + s] = src[s * stride + b];
  }
  return out;
}

function untransposeBytes(src: Uint8Array, count: number, stride: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let s = 0; s < count; s++) {
    for (let b = 0; b < stride; b++) out[s * stride + b] = src[b * count + s];
  }
  return out;
}

export function quantizeGhost(def: TrackDef, samples: GhostSample[]): Uint8Array {
  const trimmed = samples.filter((s) => s.t <= MAX_GHOST_MS);
  const picked: GhostSample[] = [];
  for (let i = 0; i < trimmed.length; i += 2) picked.push(trimmed[i]);
  if (picked.length < 2) throw new ShareError('ghost too short');
  const t0 = Math.round(picked[0].t);
  const tSpan = Math.max(0, Math.round(picked[picked.length - 1].t) - t0);
  const { min, scale } = trackBounds(def);
  const inter = new Uint8Array(HDR_SIZE + picked.length * SAMPLE_SIZE);
  const dv = new DataView(inter.buffer);
  dv.setUint16(1, picked.length, true);
  dv.setUint32(3, t0, true);
  dv.setUint32(7, tSpan, true);
  let o = 11;
  for (let a = 0; a < 3; a++) {
    dv.setFloat32(o, min[a], true);
    dv.setFloat32(o + 4, scale[a], true);
    o += 8;
  }
  const comps = [0, 0, 0, 0];
  for (const s of picked) {
    comps[0] = s.quat.x;
    comps[1] = s.quat.y;
    comps[2] = s.quat.z;
    comps[3] = s.quat.w;
    let idx = 0;
    for (let i = 1; i < 4; i++) {
      if (Math.abs(comps[i]) > Math.abs(comps[idx])) idx = i;
    }
    const sign = comps[idx] < 0 ? -1 : 1;
    for (let a = 0; a < 3; a++) {
      const v = a === 0 ? s.pos.x : a === 1 ? s.pos.y : s.pos.z;
      dv.setUint16(o, Math.max(0, Math.min(65535, Math.round((v - min[a]) / scale[a]))), true);
      o += 2;
    }
    for (let k = 0; k < 3; k++) {
      const j = k < idx ? k : k + 1;
      const v = Math.max(-QUAT_HALF_RANGE, Math.min(QUAT_HALF_RANGE, comps[j] * sign));
      inter[o++] = Math.round((v + QUAT_HALF_RANGE) * (255 / (2 * QUAT_HALF_RANGE)));
    }
    inter[o++] = idx;
  }
  const out = new Uint8Array(HDR_SIZE + picked.length * SAMPLE_SIZE);
  out.set(inter.subarray(0, HDR_SIZE), 0);
  out.set(transposeBytes(inter.subarray(HDR_SIZE), picked.length, SAMPLE_SIZE), HDR_SIZE);
  return out;
}

export function dequantizeGhost(payload: Uint8Array): GhostSample[] {
  if (payload.length < HDR_SIZE + 2 * SAMPLE_SIZE) throw new ShareError('payload too short');
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const count = dv.getUint16(1, true);
  if (count < 2 || payload.length !== HDR_SIZE + count * SAMPLE_SIZE) throw new ShareError('payload length mismatch');
  const t0 = dv.getUint32(3, true);
  const tSpan = dv.getUint32(7, true);
  if (tSpan > MAX_GHOST_MS) throw new ShareError('lap exceeds 90s cap');
  const min: number[] = [];
  const scale: number[] = [];
  let o = 11;
  for (let a = 0; a < 3; a++) {
    min.push(dv.getFloat32(o, true));
    scale.push(dv.getFloat32(o + 4, true));
    o += 8;
  }
  for (let a = 0; a < 3; a++) {
    if (!Number.isFinite(min[a]) || !Number.isFinite(scale[a]) || scale[a] <= 0 || scale[a] > 1000) {
      throw new ShareError('bad track bounds');
    }
  }
  const samples: GhostSample[] = [];
  const m4 = new THREE.Matrix4();
  const inter = untransposeBytes(payload.subarray(HDR_SIZE), count, SAMPLE_SIZE);
  const dv2 = new DataView(inter.buffer);
  for (let i = 0; i < count; i++) {
    const pos = new THREE.Vector3();
    for (let a = 0; a < 3; a++) {
      pos.setComponent(a, min[a] + dv2.getUint16(i * SAMPLE_SIZE + a * 2, true) * scale[a]);
    }
    const base = i * SAMPLE_SIZE + 6;
    const c0 = inter[base] / 255;
    const c1 = inter[base + 1] / 255;
    const c2 = inter[base + 2] / 255;
    const idx = inter[base + 3];
    if (idx > 3) throw new ShareError('bad orientation index');
    const v0 = c0 * 2 * QUAT_HALF_RANGE - QUAT_HALF_RANGE;
    const v1 = c1 * 2 * QUAT_HALF_RANGE - QUAT_HALF_RANGE;
    const v2 = c2 * 2 * QUAT_HALF_RANGE - QUAT_HALF_RANGE;
    const sumSq = v0 * v0 + v1 * v1 + v2 * v2;
    if (sumSq > 1 + 0.05) throw new ShareError('orientation sanity failed');
    const dropped = Math.sqrt(Math.max(0, 1 - sumSq));
    const arr = [0, 0, 0, 0];
    const vs = [v0, v1, v2];
    for (let k = 0; k < 3; k++) arr[k < idx ? k : k + 1] = vs[k];
    arr[idx] = dropped;
    const quat = new THREE.Quaternion(arr[0], arr[1], arr[2], arr[3]);
    m4.makeRotationFromQuaternion(quat);
    if (!(m4.determinant() > 0.5)) throw new ShareError('improper orientation');
    samples.push({ t: count > 1 ? t0 + (tSpan * i) / (count - 1) : t0, pos, quat });
  }
  return samples;
}

export function rleEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  const lit: number[] = [];
  const flush = () => {
    while (lit.length > 0) {
      const n = Math.min(128, lit.length);
      out.push(n - 1);
      for (let k = 0; k < n; k++) out.push(lit.shift() as number);
    }
  };
  let i = 0;
  while (i < data.length) {
    let r = 1;
    while (r < 129 && i + r < data.length && data[i + r] === data[i]) r++;
    if (r >= 2) {
      flush();
      out.push(128 + (r - 2));
      out.push(data[i]);
      i += r;
    } else {
      lit.push(data[i]);
      i++;
      if (lit.length === 128) flush();
    }
  }
  flush();
  return new Uint8Array(out);
}

export function rleDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c <= 127) {
      const n = c + 1;
      if (i + n > data.length) throw new ShareError('rle overrun');
      for (let k = 0; k < n; k++) out.push(data[i + k]);
      i += n;
    } else {
      if (i >= data.length) throw new ShareError('rle overrun');
      const n = c - 128 + 2;
      for (let k = 0; k < n; k++) out.push(data[i]);
      i++;
    }
  }
  return new Uint8Array(out);
}

async function pumpStream(data: Uint8Array, Ctor: typeof CompressionStream | typeof DecompressionStream): Promise<Uint8Array> {
  const stream = new Ctor('deflate');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const writing = (async () => {
    await writer.write(data as Uint8Array<ArrayBuffer>);
    await writer.close();
  })();
  writing.catch(() => {});
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writing;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const streamDeflate = (data: Uint8Array) => pumpStream(data, CompressionStream);
const streamInflate = (data: Uint8Array) => pumpStream(data, DecompressionStream);

function concat(flag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1);
  out[0] = flag;
  out.set(body, 1);
  return out;
}

export async function encodeGhostCode(def: TrackDef, samples: GhostSample[], opts: { compress?: boolean } = {}): Promise<string> {
  const body = quantizeGhost(def, samples);
  if (opts.compress !== false && typeof CompressionStream === 'function') {
    try {
      return bytesToB64url(concat(FLAG_DEFLATE, await streamDeflate(rleEncode(body))));
    } catch {
      /* deflate unavailable/failed — fall back to raw quantized payload */
    }
  }
  return bytesToB64url(concat(0, body));
}

export async function decodeGhostCode(code: string): Promise<GhostSample[]> {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) throw new ShareError('invalid code');
  const bytes = b64urlToBytes(code);
  if (bytes.length < 2) throw new ShareError('code too short');
  const flag = bytes[0];
  if ((flag & ~FLAG_DEFLATE) !== 0) throw new ShareError('unknown payload flags');
  let body: Uint8Array;
  if (flag & FLAG_DEFLATE) {
    if (typeof DecompressionStream !== 'function') throw new ShareError('deflate unavailable');
    try {
      body = rleDecode(await streamInflate(bytes.subarray(1)));
    } catch (e) {
      if (e instanceof ShareError) throw e;
      throw new ShareError('deflate failed');
    }
  } else {
    body = bytes.subarray(1);
  }
  return dequantizeGhost(body);
}

function buildV1Envelope(kind: 'g' | 'r', def: TrackDef, timeMs: number, code: string): string {
  return `#${kind}=v1.${def.id}.${Math.max(0, Math.round(timeMs))}.${code}`;
}

export function buildShareLink(def: TrackDef, timeMs: number, code: string): string {
  return buildV1Envelope('g', def, timeMs, code);
}

/**
 * v9 P3: full `#r=` share URL hash for a recorded replay. The samples run through the
 * SAME quantize/rle/deflate pipeline as ghosts (encodeGhostCode) — replay recording is
 * 30Hz, so the codec's inherent 15Hz payload is the shared fidelity.
 */
export async function buildReplayLink(def: TrackDef, timeMs: number, samples: GhostSample[]): Promise<string> {
  const code = await encodeGhostCode(def, samples);
  return buildV1Envelope('r', def, timeMs, code);
}

export interface ShareLink {
  trackId: string;
  timeMs: number;
  code: string;
}

function parseV1Envelope(hash: string, kind: 'g' | 'r'): ShareLink | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith(`${kind}=v1.`)) return null;
  const parts = h.split('.');
  if (parts.length !== 4) return null;
  const trackId = parts[1];
  if (!/^[a-z0-9-]{1,64}$/i.test(trackId)) return null;
  const timeMs = Number(parts[2]);
  if (!Number.isInteger(timeMs) || timeMs <= 0 || timeMs > 3600000) return null;
  const code = parts[3];
  if (!code || code.length > 20000) return null;
  return { trackId, timeMs, code };
}

export function parseShareLink(hash: string): ShareLink | null {
  return parseV1Envelope(hash, 'g');
}

/** Symmetric parser for `#r=` replay envelopes (same validation as ghost links). */
export function parseReplayLink(hash: string): ShareLink | null {
  return parseV1Envelope(hash, 'r');
}
