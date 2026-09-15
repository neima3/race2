import type { TrackCurve } from '../track/curve';
import type { MinimapDot } from '../game/rivals';
import { el } from './common';

const SIZE = 128;
const PAD = 10;
const SAMPLES = 128;

function cssHex(paint: number): string {
  return '#' + paint.toString(16).padStart(6, '0');
}

export class Minimap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outline: Path2D | null = null;
  private notch: Path2D | null = null;
  private accentCss = '#29e6ff';
  private playerPaint = 0x29e6ff;
  private minX = 0;
  private minZ = 0;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

  constructor() {
    this.root = el('div', 'minimap-wrap');
    this.canvas = el('canvas', 'minimap-canvas') as HTMLCanvasElement;
    this.canvas.width = Math.round(SIZE * this.dpr);
    this.canvas.height = Math.round(SIZE * this.dpr);
    this.root.append(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  setPlayerPaint(paint: number): void {
    this.playerPaint = paint;
  }

  setTrack(curve: TrackCurve, accent: number): void {
    const frames = curve.frames;
    const last = frames.length - 1;
    const pts: { x: number; z: number }[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const f = frames[Math.round((i / SAMPLES) * last)];
      const x = f.pos.x;
      const z = f.pos.z;
      pts.push({ x, z });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const spanX = Math.max(1e-3, maxX - minX);
    const spanZ = Math.max(1e-3, maxZ - minZ);
    this.minX = minX;
    this.minZ = minZ;
    this.scale = (SIZE - PAD * 2) / Math.max(spanX, spanZ);
    this.offX = (SIZE - spanX * this.scale) / 2;
    this.offY = (SIZE - spanZ * this.scale) / 2;

    const path = new Path2D();
    for (let i = 0; i < pts.length; i++) {
      const px = this.px(pts[i].x);
      const py = this.py(pts[i].z);
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    }
    path.closePath();
    this.outline = path;

    const f0 = frames[0];
    const notch = new Path2D();
    notch.moveTo(this.px(f0.pos.x + f0.binormal.x * f0.halfWidth), this.py(f0.pos.z + f0.binormal.z * f0.halfWidth));
    notch.lineTo(this.px(f0.pos.x - f0.binormal.x * f0.halfWidth), this.py(f0.pos.z - f0.binormal.z * f0.halfWidth));
    this.notch = notch;
    this.accentCss = cssHex(accent);
  }

  private px(x: number): number {
    return this.offX + (x - this.minX) * this.scale;
  }

  private py(z: number): number {
    return this.offY + (z - this.minZ) * this.scale;
  }

  private dot(x: number, y: number, r: number, fill: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  update(player: { x: number; z: number }, rivals: MinimapDot[], ghosts: { x: number; z: number; color: string }[]): void {
    const ctx = this.ctx;
    if (!this.outline) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke(this.outline);
    if (this.notch) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = this.accentCss;
      ctx.stroke(this.notch);
    }
    for (const g of ghosts) this.dot(this.px(g.x), this.py(g.z), 2.6, g.color);
    for (const r of rivals) this.dot(this.px(r.x), this.py(r.z), 3, cssHex(r.paint));
    const px = this.px(player.x);
    const py = this.py(player.z);
    this.dot(px, py, 3.8, cssHex(this.playerPaint));
    ctx.beginPath();
    ctx.arc(px, py, 4.8, 0, Math.PI * 2);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
  }
}
