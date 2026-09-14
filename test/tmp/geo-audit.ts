// Phase 5 geometry audit (data-only): top-down self-overlap/pinch, kinks, CP spacing, grade/bank sanity.
import { TrackCurve, type TrackFrame } from '../../src/track/curve';
import { TRACKS } from '../../src/track/defs';

const OVERLAP_HARD = 0.5; // ribbon edge gap below this = actual overlap
const OVERLAP_NEAR = 2.0; // informational near-miss band
const MIN_ARC_SEP = 25; // ignore neighbors closer than this along the arc
const DY_SAME_LEVEL = 3.0; // vertical separation below which an overlap is a real collision
const KINK_RAD = 0.1; // >5.7deg per 1.2m frame = r < 11.5m
const SPIKE_RAD = 0.055; // isolated direction break (neighbors stay calm)
const SPIKE_CALM = 0.012;
const MAX_GRADE = 0.45;
const MAX_BANK_DEG = 35;

let problems = 0;

function heading(f: TrackFrame): number {
  return Math.atan2(f.tangent.x, f.tangent.z);
}

function audit(defId: string, curve: TrackCurve): void {
  const frames = curve.frames;
  const n = frames.length;
  const tags: string[] = [];

  // --- 1. top-down ribbon overlap / pinch ---
  interface Overlap {
    i: number;
    j: number;
    gap: number;
    dy: number;
    hard: boolean;
  }
  const overlaps: Overlap[] = [];
  for (let i = 0; i < n; i++) {
    const a = frames[i];
    for (let j = i + 1; j < n; j++) {
      const b = frames[j];
      const arcSep = Math.min(b.dist - a.dist, curve.length - (b.dist - a.dist));
      if (arcSep < MIN_ARC_SEP) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const horiz = Math.sqrt(dx * dx + dz * dz);
      const edgeGap = horiz - (a.halfWidth + b.halfWidth);
      if (edgeGap < OVERLAP_NEAR) {
        overlaps.push({ i, j, gap: edgeGap, dy: Math.abs(a.pos.y - b.pos.y), hard: edgeGap < OVERLAP_HARD });
      }
    }
  }
  const hardEvents = overlaps.filter((o) => o.hard);
  const realHits = hardEvents.filter((o) => o.dy < DY_SAME_LEVEL);
  if (realHits.length > 0) {
    problems++;
    const ex = realHits[0];
    tags.push(
      'PINCH x' + realHits.length + ' (same-level ribbon overlap, e.g. d=' + frames[ex.i].dist.toFixed(0) + '/' + frames[ex.j].dist.toFixed(0) + 'm gap=' + ex.gap.toFixed(2) + ' dy=' + ex.dy.toFixed(1) + ')',
    );
  } else if (hardEvents.length > 0) {
    let maxDy = 0;
    for (const o of hardEvents) maxDy = Math.max(maxDy, o.dy);
    tags.push('topdown-cross x' + hardEvents.length + ' all stacked (dy>=' + DY_SAME_LEVEL + ', max ' + maxDy.toFixed(0) + ')');
  }
  const nearCount = overlaps.length - hardEvents.length;
  if (nearCount > 0) tags.push('near-pass x' + nearCount + ' (gap<' + OVERLAP_NEAR + 'm)');

  // --- 2. kinks ---
  const head = frames.map(heading);
  const dh: number[] = [];
  for (let i = 0; i < n; i++) {
    let d = head[(i + 1) % n] - head[i];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    dh.push(d);
  }
  let kinkMax = 0;
  let kinkAt = -1;
  const spikes: number[] = [];
  for (let i = 0; i < n; i++) {
    const mag = Math.abs(dh[i]);
    if (mag > kinkMax) {
      kinkMax = mag;
      kinkAt = i;
    }
    const prev = Math.abs(dh[(i - 1 + n) % n]);
    const next = Math.abs(dh[(i + 1) % n]);
    if (mag > SPIKE_RAD && prev < SPIKE_CALM && next < SPIKE_CALM) spikes.push(i);
  }
  if (kinkMax > KINK_RAD) {
    problems++;
    tags.push('KINK ' + ((kinkMax * 180) / Math.PI).toFixed(1) + 'deg/1.2m at d=' + frames[kinkAt].dist.toFixed(0) + 'm');
  }
  if (spikes.length > 0) {
    problems++;
    tags.push('dir-spikes x' + spikes.length + ' first d=' + frames[spikes[0]].dist.toFixed(0) + 'm');
  }

  // --- 3. wiggle (sign churn with meaningful magnitude = uneven weirdness) ---
  let churn = 0;
  for (let i = 2; i < n; i++) {
    if (Math.abs(dh[i - 1]) > 0.008 && Math.abs(dh[i]) > 0.008 && Math.sign(dh[i - 1]) !== Math.sign(dh[i])) churn++;
  }
  const churnPct = (100 * churn) / n;
  if (churnPct > 30) tags.push('wiggle ' + churnPct.toFixed(0) + '% (high curvature churn)');

  // --- 4. grade / bank ---
  let maxGrade = 0;
  let gradeAt = -1;
  let maxBank = 0;
  for (let i = 0; i < n; i++) {
    const a = frames[i];
    const b = frames[(i + 1) % n];
    const dd = b.dist - a.dist;
    if (dd > 0) {
      const g = Math.abs(b.pos.y - a.pos.y) / dd;
      if (g > maxGrade) {
        maxGrade = g;
        gradeAt = i;
      }
    }
    const bank = Math.acos(Math.max(-1, Math.min(1, a.normal.y)));
    if (Math.abs(bank) > maxBank) maxBank = Math.abs(bank);
  }
  if (maxGrade > MAX_GRADE) {
    problems++;
    tags.push('GRADE ' + (maxGrade * 100).toFixed(0) + '% at d=' + frames[gradeAt].dist.toFixed(0) + 'm');
  }
  if ((maxBank * 180) / Math.PI > MAX_BANK_DEG) tags.push('bank ' + ((maxBank * 180) / Math.PI).toFixed(0) + 'deg');

  // --- 5. control point spacing evenness (chord lengths) ---
  const cps = curve.controlPoints;
  let minSeg = Infinity;
  let maxSeg = 0;
  for (let i = 0; i < cps.length; i++) {
    const a = cps[i].pos;
    const b = cps[(i + 1) % cps.length].pos;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    minSeg = Math.min(minSeg, len);
    maxSeg = Math.max(maxSeg, len);
  }
  const segRatio = maxSeg / minSeg;
  if (segRatio > 8) tags.push('cp-spacing ratio ' + segRatio.toFixed(1) + ' (min ' + minSeg.toFixed(0) + 'm max ' + maxSeg.toFixed(0) + 'm)');

  console.log(
    defId.padEnd(18) +
      ' len=' + curve.length.toFixed(0).padStart(5) + 'm' +
      ' kinkMax=' + (((kinkMax * 180) / Math.PI) | 0) + 'deg' +
      ' grade=' + ((maxGrade * 100) | 0) + '%' +
      ' bank=' + ((maxBank * 180) / Math.PI).toFixed(0) + 'deg' +
      ' churn=' + churnPct.toFixed(0) + '%' +
      (tags.length ? '  >> ' + tags.join(' | ') : '  CLEAN'),
  );
}

console.log('geometry audit (data-only, top-down xz):');
for (const def of TRACKS) {
  const curve = new TrackCurve(def.points, true);
  audit(def.id, curve);
}

if (problems > 0) {
  console.error('\ngeo-audit: ' + problems + ' problem tag(s) — review before fixing anything');
  process.exit(1);
}
console.log('\ngeo-audit: NO BLOCKING ISSUES');
