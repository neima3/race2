// Phase 5: seam report — final CPs, seam headings, start straight, clearance of final approach vs start straight.
import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';

for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  const fr = curve.frames;
  const cps = def.points;
  const f0 = fr[0];
  const startTan = Math.atan2(f0.tangent.x, f0.tangent.z) * (180 / Math.PI);
  // frame at 20m before the end (final approach) and its heading
  const near = (d: number) => fr.reduce((best, f) => (Math.abs(f.dist - d) < Math.abs(best.dist - d) ? f : best));
  const fEnd = near(curve.length - 20);
  const endTan = Math.atan2(fEnd.tangent.x, fEnd.tangent.z) * (180 / Math.PI);
  // clearance of final approach frames (last 90m) vs the start straight ribbon (frames dist<40)
  let minGap = 99;
  let at = -1;
  for (let i = fr.length - 1; i > 0; i--) {
    const f = fr[i];
    if (curve.length - f.dist > 90) break;
    for (let j = 0; j < 40 / 1.2; j++) {
      const g = fr[j];
      const horiz = Math.hypot(f.pos.x - g.pos.x, f.pos.z - g.pos.z);
      const gap = horiz - (f.halfWidth + g.halfWidth);
      if (gap < minGap) { minGap = gap; at = f.dist; }
    }
  }
  const last = cps.slice(-4).map((p) => `[${p.pos.map((v) => Math.round(v)).join(',')}]`).join(' ');
  console.log(
    def.id.padEnd(18) +
      ` startHdg=${startTan.toFixed(0).padStart(4)} endHdg=${endTan.toFixed(0).padStart(4)} (turn=${(((endTan - startTan + 540) % 360) - 180).toFixed(0)})` +
      ` approachGap=${minGap.toFixed(1)}@d${at.toFixed(0)} len=${curve.length.toFixed(0)}\n    last4: ${last}`,
  );
}
