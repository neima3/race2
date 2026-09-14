// Phase 5: fold diagnostics — seam CPs + overlap cluster metrics per track.
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';

interface Pair {
  di: number;
  dj: number;
  gap: number;
  dy: number;
}

for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  const fr = curve.frames;
  const n = fr.length;
  const pairs: Pair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const arc = Math.min(fr[j].dist - fr[i].dist, curve.length - (fr[j].dist - fr[i].dist));
      if (arc < 25) continue;
      const horiz = Math.hypot(fr[j].pos.x - fr[i].pos.x, fr[j].pos.z - fr[i].pos.z);
      const gap = horiz - (fr[i].halfWidth + fr[j].halfWidth);
      if (gap < 0.5) {
        pairs.push({ di: fr[i].dist, dj: fr[j].dist, gap, dy: Math.abs(fr[i].pos.y - fr[j].pos.y) });
      }
    }
  }
  if (pairs.length === 0) {
    console.log(`${def.id}: no overlap`);
    continue;
  }
  // cluster by arc position of i (crossing the seam = di > L-60)
  interface Cluster {
    lo: number;
    hi: number;
    minGap: number;
    minDy: number;
    atSeam: boolean;
    count: number;
  }
  const clusters: Cluster[] = [];
  for (const p of pairs) {
    const diEff = p.di > curve.length - 60 ? p.di - curve.length : p.di; // seam-relative
    const djEff = p.dj > curve.length - 60 ? p.dj - curve.length : p.dj;
    const lo = Math.min(diEff, djEff);
    const hi = Math.max(diEff, djEff);
    // note: for seam pairs lo is negative (before line), hi positive (after line)
    let c = clusters.find((x) => lo <= x.hi + 30 && hi >= x.lo - 30);
    if (!c) {
      c = { lo, hi, minGap: 0, minDy: 99, atSeam: lo < -60 || hi > curve.length - 60, count: 0 };
      clusters.push(c);
    }
    c.lo = Math.min(c.lo, lo);
    c.hi = Math.max(c.hi, hi);
    c.minGap = Math.min(c.minGap, p.gap);
    c.minDy = Math.min(c.minDy, p.dy);
    c.count++;
    c.atSeam = c.atSeam || lo < -60 || hi > curve.length - 60;
  }
  clusters.sort((a, b) => b.count - a.count);
  console.log(`${def.id}: ${pairs.length} pairs, ${clusters.length} clusters`);
  for (const c of clusters.slice(0, 4)) {
    console.log(
      `   arc d=${c.lo.toFixed(0)}..${c.hi.toFixed(0)} (span ${(c.hi - c.lo).toFixed(0)}m) minGap=${c.minGap.toFixed(2)} minDy=${c.minDy.toFixed(1)} seam=${c.atSeam} n=${c.count}`,
    );
  }
  // seam CPs
  const cps = def.points;
  const fmt = (p: { pos: [number, number, number] }) => `[${p.pos.map((v) => v.toFixed(0)).join(',')}]`;
  console.log(`   CPs: last3=${fmt(cps[cps.length - 3])}${fmt(cps[cps.length - 2])}${fmt(cps[cps.length - 1])} first3=${fmt(cps[0])}${fmt(cps[1])}${fmt(cps[2])}`);
}
