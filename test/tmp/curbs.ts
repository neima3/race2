import { TrackCurve } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';
import { computeCurbZones } from '../../src/track/builder';

let totalZones = 0;
let fail = false;
for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  const zones = computeCurbZones(curve.frames, curve.length);
  const meters = zones.reduce((s, z) => s + (z.end - z.start), 0);
  const pct = ((meters / curve.length) * 100).toFixed(1);
  const sides = zones.map((z) => z.side).join('');
  totalZones += zones.length;
  const plausible = meters / curve.length < 0.6;
  if (!plausible) fail = true;
  console.log(
    `${def.id.padEnd(18)} len=${curve.length.toFixed(0).padStart(5)}m zones=${String(zones.length).padStart(2)} curbs=${meters.toFixed(0).padStart(4)}m (${pct}%) sides=${sides}`,
  );
}
console.log(`\nTOTAL zones=${totalZones} ${fail ? 'FAIL: coverage implausible' : 'OK'}`);
if (fail) process.exit(1);
