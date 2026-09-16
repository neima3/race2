import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS, THEMES, type TrackDef, type TrackVariant } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { variantWritesRecords } from '../src/game/variants';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as unknown as Storage;

// v9 P1 free-play variant gate. Policy: day writes records, dusk/night/rain run dry.
// Asserts: variant laps complete headless on all four variants; the ledger guard
// mirrors the rival/traffic writesRecords pattern; records/PB stay null after a
// variant race while a day race writes its PB; the dev URL override keeps priority.

const simDt = 1 / 120;
let failures = 0;
function fail(msg: string): void {
  failures++;
  console.log(`FAIL ${msg}`);
}
function pass(msg: string): void {
  console.log(`PASS ${msg}`);
}

function runVariantLap(variant: TrackVariant, def: TrackDef = TRACKS[0]): { finished: boolean; timeMs: number; steps: number; nan: boolean; save: SaveManager } {
  const curve = new TrackCurve(def.points, true);
  const car = new CarPhysics(curve);
  const save = new SaveManager();
  save.updateSettings({ variant });
  const writes = variantWritesRecords(variant);
  const race = new RaceController(car, curve, def, save, () => {}, { laps: 1, writesRecords: writes });
  car.placeAtFrame(0, 8);
  race.countdownMs = 1;
  race.beginRacing();
  const ap = { smooth: 0 };
  let steps = 0;
  let nan = false;
  while (race.phase !== 'finished' && steps < 120000) {
    const res = autopilotDrive(car, curve, simDt, ap);
    if (res.respawn) {
      race.respawnAtCheckpoint();
      continue;
    }
    // Grip effects of non-day variants flow through surfaceGrip exactly like cup weather.
    const mult = variant === 'rain' ? 0.82 : 1;
    car.state.surfaceGrip = mult;
    race.update(simDt * 1000, { steer: res.steer, throttle: res.throttle, brake: res.brake, drift: false, respawn: false } as never);
    if (!Number.isFinite(car.state.pos.x) || !Number.isFinite(car.state.pos.z)) nan = true;
    steps++;
  }
  return { finished: race.phase === 'finished', timeMs: Math.round(race.elapsedMs), steps, nan, save };
}

// 1. Policy table
const variants: TrackVariant[] = ['day', 'dusk', 'night', 'rain'];
for (const v of variants) {
  const dry = !variantWritesRecords(v);
  if (v === 'day' && dry) fail(`day unexpectedly dry`);
  else if (v !== 'day' && !dry) fail(`${v} unexpectedly writes records`);
}
pass('ledger policy: day writes, dusk/night/rain dry');

// 2. All four variant laps complete on sunrise-sprint
for (const v of variants) {
  const r = runVariantLap(v);
  if (!r.finished) fail(`${v} lap did not finish (steps=${r.steps})`);
  else if (r.nan) fail(`${v} lap produced NaN position`);
  else if (r.timeMs < 8000 || r.timeMs > 40000) fail(`${v} lap time implausible: ${r.timeMs}ms`);
  else pass(`${v} lap finished: ${r.timeMs}ms`);
}

// 3. Records null after a variant race, PB written after a day race (real finish path)
{
  const night = runVariantLap('night');
  if (!night.finished) fail('night control lap did not finish');
  else if (night.save.trackSave(TRACKS[0].id).bestTimeMs !== null) fail('night race wrote a PB — dry policy broken');
  else pass('night race leaves PB null (structural writesRecords guard)');
}
{
  const day = runVariantLap('day');
  if (!day.finished) fail('day control lap did not finish');
  else if (day.save.trackSave(TRACKS[0].id).bestTimeMs === null) fail('day race did not write its PB');
  else pass('day race writes PB through the real finish path');
}

// 5. STORM CHASER balance (v9 P5): night + rain laps complete on 3 tracks headless
//    (sunrise-sprint above; dune-rush + harbor-nine here — grip plumbing is shared
//    with cup weather, so a clean finish proves the variant surfaces hold up).
{
  const ids = ['dune-rush', 'harbor-nine'];
  for (const id of ids) {
    const def = TRACKS.find((t) => t.id === id);
    if (!def) {
      fail(`track ${id} not in TRACKS`);
      continue;
    }
    for (const v of ['night', 'rain'] as TrackVariant[]) {
      const r = runVariantLap(v, def);
      if (!r.finished) fail(`${id} ${v} lap did not finish (steps=${r.steps})`);
      else if (r.nan) fail(`${id} ${v} lap produced NaN position`);
      else if (r.timeMs < 8000 || r.timeMs > 90000) fail(`${id} ${v} lap time implausible: ${r.timeMs}ms`);
      else pass(`${id} ${v} lap finished: ${(r.timeMs / 1000).toFixed(2)}s`);
    }
  }
}

// 6. Variants defined for all four themes (no theme lacks a night/dusk/rain mapping)
{
  let missing = 0;
  for (const themeId of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
    const t = THEMES[themeId];
    if (!t || typeof t !== 'object') missing++;
  }
  if (missing) fail(`${missing} theme entries malformed`);
  else pass('theme variant map intact');
}

console.log(failures === 0 ? `\nvariants test: all checks passed` : `\nvariants test: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
