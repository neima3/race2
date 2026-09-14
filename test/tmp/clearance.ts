import { TrackCurve, type TrackFrame } from '../../src/track/curve';
import { TRACKS, THEMES } from '../../src/track/defs';
import {
  GROUND_Y,
  LANDFORM_MIN_ROAD_DIST,
  ROCK_MIN_ROAD_DIST,
  minRoadDistance,
  placeLandforms,
  placeRocks,
  seededRandom,
  type LandformSpec,
  type RockTransform,
} from '../../src/render/terrain';

const ELEVATION_TRACKS = new Set(['sky-loop', 'neon-vertical', 'harbor-nine']);
const MARGIN_M = 2.5;

let failures = 0;
const fail = (msg: string): void => {
  failures++;
  console.error('  FAIL ' + msg);
};

function corridorCheck(name: string, curve: TrackCurve, landforms: LandformSpec[], rocks: RockTransform[]): void {
  const frames: TrackFrame[] = curve.frames;
  for (const f of frames) {
    for (const s of landforms) {
      const dx = s.x - f.pos.x;
      const dz = s.z - f.pos.z;
      const horiz = Math.sqrt(dx * dx + dz * dz);
      if (horiz < s.radius + f.halfWidth + 2) {
        const underside = f.pos.y - MARGIN_M;
        if (s.top > underside) fail(`${name}: landform top ${s.top.toFixed(1)} pokes into road underside ${underside.toFixed(1)} at dist ${f.dist.toFixed(0)} (horiz ${horiz.toFixed(1)}m)`);
      }
    }
    for (const r of rocks) {
      const dx = r.x - f.pos.x;
      const dz = r.z - f.pos.z;
      const horiz = Math.sqrt(dx * dx + dz * dz);
      if (horiz < r.sz + f.halfWidth + 2) {
        const top = r.y + r.sy;
        const underside = f.pos.y - MARGIN_M;
        if (top > underside) fail(`${name}: rock top ${top.toFixed(1)} pokes into road underside ${underside.toFixed(1)} at dist ${f.dist.toFixed(0)}`);
      }
    }
  }
}

for (const def of TRACKS) {
  const theme = THEMES[def.theme];
  const curve = new TrackCurve(def.points, true);
  const specs = placeLandforms(seededRandom(90217), theme, curve);
  const rocks = placeRocks(seededRandom(3313), curve, 140);
  let minRoadY = Infinity;
  let maxExtent = 0;
  for (const f of curve.frames) {
    minRoadY = Math.min(minRoadY, f.pos.y);
    maxExtent = Math.max(maxExtent, Math.hypot(f.pos.x, f.pos.z));
  }
  console.log(`${def.id} [${def.theme}] frames=${curve.frames.length} len=${curve.length.toFixed(0)}m minRoadY=${minRoadY.toFixed(2)} extent=${maxExtent.toFixed(0)}m landforms=${specs.length} rocks=${rocks.length}`);

  if (minRoadY < GROUND_Y + 0.05) fail(`${def.id}: road dips to ${minRoadY.toFixed(2)} vs ground ${GROUND_Y}`);

  for (const s of specs) {
    const d = minRoadDistance(curve, s.x, s.z);
    if (d < s.radius + LANDFORM_MIN_ROAD_DIST - 0.01) fail(`${def.id}: landform at (${s.x.toFixed(0)},${s.z.toFixed(0)}) road dist ${d.toFixed(1)} < radius+60=${(s.radius + LANDFORM_MIN_ROAD_DIST).toFixed(1)}`);
    if (s.top > GROUND_Y + 170) fail(`${def.id}: landform too tall (${s.top.toFixed(0)})`);
  }
  for (const r of rocks) {
    const d = minRoadDistance(curve, r.x, r.z);
    if (d < ROCK_MIN_ROAD_DIST - 0.01) fail(`${def.id}: rock at (${r.x.toFixed(0)},${r.z.toFixed(0)}) road dist ${d.toFixed(1)} < ${ROCK_MIN_ROAD_DIST}`);
    if (r.y - r.sy > GROUND_Y + 0.01) fail(`${def.id}: rock floating (bottom ${ (r.y - r.sy).toFixed(2) } above ground)`);
  }
  if (ELEVATION_TRACKS.has(def.id)) {
    corridorCheck(def.id, curve, specs, rocks);
  }
  if (maxExtent > 900) fail(`${def.id}: track extent ${maxExtent.toFixed(0)}m reaches horizon rings (1850m)`);
}

if (failures > 0) {
  console.error(`\nclearance: ${failures} FAILURES`);
  process.exit(1);
}
console.log('\nclearance: ALL PASS');
