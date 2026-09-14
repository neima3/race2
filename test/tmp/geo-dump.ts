import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';

function dump(id: string) {
  const def = TRACKS.find((t) => t.id === id)!;
  const c = new TrackCurve(def.points, true);
  const fr = c.frames;
  console.log(`\n=== ${id} len=${c.length.toFixed(1)} cps=${def.points.length}`);
  console.log('CPs:');
  def.points.forEach((p, i) => console.log(`  ${i}: [${p.pos.map((v) => v.toFixed(1)).join(', ')}] w=${p.width ?? 7} bank=${p.bank ?? 0}`));
  const near = (d: number) => fr.reduce((best, f) => (Math.abs(f.dist - d) < Math.abs(best.dist - d) ? f : best));
  console.log('frames around seam:');
  for (const d of [0, 3, 6, 9, 12, 15, c.length - 15, c.length - 12, c.length - 9, c.length - 6, c.length - 3]) {
    const f = near(d);
    console.log(`  d=${f.dist.toFixed(0).padStart(5)} pos=[${f.pos.x.toFixed(1)}, ${f.pos.y.toFixed(1)}, ${f.pos.z.toFixed(1)}] tan=[${f.tangent.x.toFixed(2)}, ${f.tangent.y.toFixed(2)}, ${f.tangent.z.toFixed(2)}] hw=${f.halfWidth.toFixed(1)}`);
  }
  // worst pinch pairs
  const pairs: string[] = [];
  for (let i = 0; i < fr.length; i++) {
    for (let j = i + 1; j < fr.length; j++) {
      const arc = Math.min(fr[j].dist - fr[i].dist, c.length - (fr[j].dist - fr[i].dist));
      if (arc < 25) continue;
      const horiz = Math.hypot(fr[j].pos.x - fr[i].pos.x, fr[j].pos.z - fr[i].pos.z);
      const gap = horiz - (fr[i].halfWidth + fr[j].halfWidth);
      if (gap < 0.5) pairs.push(`d=${fr[i].dist.toFixed(0)}/${fr[j].dist.toFixed(0)} gap=${gap.toFixed(2)} dy=${Math.abs(fr[i].pos.y - fr[j].pos.y).toFixed(1)}`);
    }
  }
  console.log(`pinch pairs(<0.5): ${pairs.length}`);
  const uniq = [...new Set(pairs)];
  uniq.slice(0, 8).forEach((p) => console.log('  ' + p));
}
for (const id of ['canyon-twist', 'ring-runner', 'sky-loop', 'dune-rush']) dump(id);
