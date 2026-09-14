// Phase 5: localize worst same-level overlap pairs per track (top offenders with world pos).
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';

const ids = process.argv.slice(2);
const targets = ids.length ? TRACKS.filter((t) => ids.includes(t.id)) : TRACKS;

for (const def of targets) {
  const curve = new TrackCurve(def.points, true);
  const fr = curve.frames;
  const n = fr.length;
  const pairs: { di: number; dj: number; gap: number; dy: number; xi: number; zi: number; xj: number; zj: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const arc = Math.min(fr[j].dist - fr[i].dist, curve.length - (fr[j].dist - fr[i].dist));
      if (arc < 25) continue;
      const horiz = Math.hypot(fr[j].pos.x - fr[i].pos.x, fr[j].pos.z - fr[i].pos.z);
      const gap = horiz - (fr[i].halfWidth + fr[j].halfWidth);
      if (gap < 0.5 && Math.abs(fr[i].pos.y - fr[j].pos.y) < 3) {
        pairs.push({ di: fr[i].dist, dj: fr[j].dist, gap, dy: Math.abs(fr[i].pos.y - fr[j].pos.y), xi: fr[i].pos.x, zi: fr[i].pos.z, xj: fr[j].pos.x, zj: fr[j].pos.z });
      }
    }
  }
  pairs.sort((a, b) => a.gap - b.gap);
  console.log(`\n=== ${def.id} len=${curve.length.toFixed(0)} same-level pairs=${pairs.length}`);
  const seen: string[] = [];
  for (const p of pairs) {
    const key = `${Math.round(p.di / 40)}-${Math.round(p.dj / 40)}`;
    if (seen.includes(key)) continue;
    seen.push(key);
    console.log(`  d=${p.di.toFixed(0)}(${p.xi.toFixed(0)},${p.zi.toFixed(0)}) <-> d=${p.dj.toFixed(0)}(${p.xj.toFixed(0)},${p.zj.toFixed(0)}) gap=${p.gap.toFixed(2)} dy=${p.dy.toFixed(1)}`);
    if (seen.length >= 12) break;
  }
}
