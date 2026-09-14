import * as THREE from 'three';
import type { ThemeId } from '../track/defs';

const ASPHALT: Record<ThemeId, number> = {
  alpine: 0x767c88,
  mesa: 0x857462,
  canyon: 0x7d6a5c,
  neon: 0x555e74,
};

const TAU = Math.PI * 2;

export function makeAsphaltTexture(theme: ThemeId, halfWidth: number): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(ASPHALT[theme]);
  const hx = base.getHexString();
  const r8 = parseInt(hx.slice(0, 2), 16);
  const g8 = parseInt(hx.slice(2, 4), 16);
  const b8 = parseInt(hx.slice(4, 6), 16);
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const f1 = (TAU * 3) / S;
  const f2 = (TAU * 7) / S;
  for (let y = 0; y < S; y++) {
    const band = Math.sin(y * f1) * 4 + Math.sin(y * f2 + 1.7) * 3;
    for (let x = 0; x < S; x++) {
      const n = (Math.random() - 0.5) * 18;
      const l = band + n;
      const i = (y * S + x) * 4;
      d[i] = Math.max(0, Math.min(255, r8 + l));
      d[i + 1] = Math.max(0, Math.min(255, g8 + l));
      d[i + 2] = Math.max(0, Math.min(255, b8 + l));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 2800; i++) {
    const light = Math.random() < 0.5;
    const a = 0.05 + Math.random() * 0.11;
    ctx.fillStyle = light ? `rgba(210,215,224,${a})` : `rgba(8,10,14,${a})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
  }
  const mU = 0.5 / Math.max(3, halfWidth);
  const grad = ctx.createLinearGradient(0, 0, S, 0);
  const aMax = 0.15;
  const soft = Math.min(0.49, 1.15 * mU);
  const core = Math.min(0.49, 0.42 * mU);
  grad.addColorStop(0, 'rgba(8,10,14,0)');
  grad.addColorStop(0.5 - soft, 'rgba(8,10,14,0)');
  grad.addColorStop(0.5 - core, `rgba(8,10,14,${aMax})`);
  grad.addColorStop(0.5 + core, `rgba(8,10,14,${aMax})`);
  grad.addColorStop(0.5 + soft, 'rgba(8,10,14,0)');
  grad.addColorStop(1, 'rgba(8,10,14,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function makeCurbTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8352c';
  ctx.fillRect(0, 0, 16, 32);
  ctx.fillStyle = '#e9e7e2';
  ctx.fillRect(0, 32, 16, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(0, 30, 16, 2);
  ctx.fillRect(0, 62, 16, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function checkerBannerCanvas(accentHex: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0d1222';
  ctx.fillRect(0, 0, 512, 96);
  const sq = 16;
  for (let row = 0; row < 2; row++) {
    for (let x = 0; x < 512 / sq; x++) {
      for (const y of [row * sq, 96 - (row + 1) * sq]) {
        ctx.fillStyle = (x + row) % 2 === 0 ? '#f2f3f5' : '#12151d';
        ctx.fillRect(x * sq, y, sq, sq);
      }
    }
  }
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 2 * sq, 512, 3);
  ctx.fillRect(0, 96 - 2 * sq - 3, 512, 3);
  ctx.font = '700 44px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('START / FINISH', 256, 50);
  return c;
}
