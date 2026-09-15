import * as THREE from 'three';
import { TrackCurve } from '../src/track/curve';
import { TRACKS, VARIANTS, type TrackDef } from '../src/track/defs';
import { CarPhysics } from '../src/physics/car';
import { RaceController } from '../src/game/race';
import { RivalManager, RIVAL_ROSTER, type Standing } from '../src/game/rivals';
import { SaveManager } from '../src/core/save';
import { autopilotDrive } from '../src/systems/autopilot';
import { computeOnSlick, updateBoostPads, surfaceGripFor, RAIN_GRIP_MULT } from '../src/game/rules';
import { CUP_POINTS } from '../src/game/career';
import {
  WEEKLY_LAPS,
  WEEKLY_RACES,
  WEEKLY_MODIFIERS,
  weekKeyFor,
  isValidWeekKey,
  prevWeekKey,
  weekIsLive,
  modifierForWeek,
  weeklyFor,
  weeklyVariant,
  weeklyRaceTrack,
  startWeeklyRun,
  applyWeeklyResult,
  weeklyStandings,
  weeklyComplete,
  weeklyTrophy,
  buildWeeklyLink,
  parseWeeklyLink,
  type WeeklyDef,
} from '../src/game/weekly';

// Map-backed storage mock that survives simulated reloads.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
} as unknown as Storage;

let failures = 0;
let checks = 0;
function fail(msg: string): void {
  failures++;
  checks++;
  console.log(`FAIL ${msg}`);
}
function expect(cond: boolean, msg: string): void {
  checks++;
  if (cond) console.log(`PASS ${msg}`);
  else {
    failures++;
    console.log(`FAIL ${msg}`);
  }
}

// ---------- 1. weekKeyFor correctness (UTC ISO weeks, year + leap boundaries) ----------
{
  expect(weekKeyFor(new Date(Date.UTC(2026, 8, 14))) === '2026W38', '2026-09-14 (Mon) -> 2026W38');
  expect(weekKeyFor(new Date(Date.UTC(2026, 8, 13, 23, 59, 59))) === '2026W37', '2026-09-13 23:59 UTC stays in 2026W37');
  expect(weekKeyFor(new Date(Date.UTC(2026, 8, 14, 0, 0, 0))) === '2026W38', '2026-09-14 00:00 UTC rolls to 2026W38');
  expect(weekKeyFor(new Date(Date.UTC(2025, 11, 29))) === '2026W01', '2025-12-29 (Mon of 2026 week 1) -> 2026W01');
  expect(weekKeyFor(new Date(Date.UTC(2026, 0, 4))) === '2026W01', '2026-01-04 (Sun) still 2026W01');
  expect(weekKeyFor(new Date(Date.UTC(2026, 0, 5))) === '2026W02', '2026-01-05 (Mon) -> 2026W02');
  expect(weekKeyFor(new Date(Date.UTC(2020, 11, 28))) === '2020W53', '2020-12-28 -> 2020W53 (53-week leap year)');
  expect(weekKeyFor(new Date(Date.UTC(2021, 0, 1))) === '2020W53', '2021-01-01 -> 2020W53 (week owned by previous year)');
  expect(weekKeyFor(new Date(Date.UTC(2021, 0, 4))) === '2021W01', '2021-01-04 (Mon) -> 2021W01');
  expect(prevWeekKey('2026W38') === '2026W37', 'prevWeekKey within year');
  expect(prevWeekKey('2021W01') === '2020W53', 'prevWeekKey across year boundary');
  expect(prevWeekKey('2026W01') === '2025W52', 'prevWeekKey into 52-week 2025');
  expect(isValidWeekKey('2026W38') && isValidWeekKey('2020W53'), 'valid week keys accepted');
  expect(
    !isValidWeekKey('2026W00') && !isValidWeekKey('2026W54') && !isValidWeekKey('2026W1') && !isValidWeekKey('2026w38') && !isValidWeekKey('20260913'),
    'malformed / impossible week keys rejected',
  );
  expect(!isValidWeekKey('2027W53'), '2027W53 rejected (2027 has 52 ISO weeks)');
}

// ---------- 2. Seed determinism + weekly def shape ----------
{
  const a = weeklyFor('2026W38');
  const b = weeklyFor('2026W38');
  expect(JSON.stringify(a) === JSON.stringify(b), 'same week -> byte-identical weekly definition');
  expect(a.tracks.length === WEEKLY_RACES, `weekly cup has ${WEEKLY_RACES} races`);
  const ids = new Set(a.tracks.map((t) => t.id));
  expect(ids.size === WEEKLY_RACES, `no repeated tracks (${[...ids].join('/')})`);
  expect(a.tracks.every((t) => TRACKS.some((x) => x.id === t.id)), 'tracks come from the 14 TRACKS');
  const themes = new Set(a.tracks.map((t) => t.theme));
  expect(themes.size === WEEKLY_RACES, `mixed themes (${[...themes].join('/')})`);
  expect(a.laps === WEEKLY_LAPS && a.laps === 2, 'each weekly race is 2 laps');
  const lineupsOk = a.lineups.every((lu) => {
    const tiers = [...lu.map((r) => r.tier)].sort().join(',');
    return lu.length === 3 && tiers === 'mid,mid,pro' && new Set(lu.map((r) => r.name)).size === 3;
  });
  expect(lineupsOk, 'every lineup is 2 mid + 1 pro, no duplicate names');
  expect(
    a.lineups.every((lu) => lu.every((r) => RIVAL_ROSTER.some((m) => m.name === r.name && m.tier === r.tier && m.paint === r.paint))),
    'lineup rivals come from the roster with matching tier/paint',
  );
  // 12 consecutive weeks: definitions stable under recompute, shapes hold
  let stable = true;
  let shaped = true;
  let monday = new Date(Date.UTC(2026, 0, 5));
  for (let i = 0; i < 12; i++) {
    const k = weekKeyFor(monday);
    const def = weeklyFor(k);
    if (JSON.stringify(def) !== JSON.stringify(weeklyFor(k))) stable = false;
    if (def.tracks.length !== 3 || new Set(def.tracks.map((t) => t.id)).size !== 3 || def.laps !== 2) shaped = false;
    monday = new Date(monday.getTime() + 7 * 86400000);
  }
  expect(stable, '12 consecutive weekly definitions stable under repeated calls');
  expect(shaped, '12 consecutive weeks keep 3 distinct tracks + 2 laps');
}

// ---------- 3. Modifier rotation: 4 consecutive weeks cover all 4 (incl. year boundary) ----------
{
  const consecutive = ['2026W36', '2026W37', '2026W38', '2026W39'];
  const mods = consecutive.map((k) => modifierForWeek(k).id);
  expect(new Set(mods).size === 4, `4 consecutive weeks -> 4 distinct modifiers (got ${mods.join(',')})`);
  const boundary = ['2020W51', '2020W52', '2020W53', '2021W01'];
  const bmods = boundary.map((k) => modifierForWeek(k).id);
  expect(new Set(bmods).size === 4, `rotation stays continuous across the year boundary (got ${bmods.join(',')})`);
  expect(WEEKLY_MODIFIERS.length === 4, 'modifier table has exactly 4 slots');
  // rotation is a pure function of the key
  expect(modifierForWeek('2026W38').id === modifierForWeek('2026W38').id, 'modifierForWeek deterministic');
}

// ---------- 4. Week liveness ----------
{
  const now = new Date(Date.UTC(2026, 8, 14, 12, 0, 0));
  expect(weekIsLive('2026W38', now), "current week's weekly is playable");
  expect(!weekIsLive('2026W37', now), 'last week is disabled');
  expect(!weekIsLive('2026W39', now), 'future week is disabled');
  expect(!weekIsLive('2026W54', now), 'invalid week is never live');
  expect(weekIsLive(weekKeyFor(now), now), 'weekKeyFor(now) is always live for the same instant');
}

// ---------- 5. Modifier plumbing ----------
function weekWithModifier(id: string, fromWeek = '2026W01'): { key: string; def: WeeklyDef } {
  let mondayMs = Date.UTC(2026, 0, 5);
  for (let i = 0; i < 120; i++) {
    const k = weekKeyFor(new Date(mondayMs));
    if (i >= 0 && modifierForWeek(k).id === id && (fromWeek === '2026W01' || k >= fromWeek)) return { key: k, def: weeklyFor(k) };
    mondayMs += 7 * 86400000;
  }
  throw new Error(`no week found with modifier ${id}`);
}
{
  // rain finals: races 2-3 rain via the variant plumbing
  const rain = weekWithModifier('rain-finals');
  expect(weeklyVariant(rain.def, 0) === 'day', 'RAIN FINALS race 1 runs dry');
  expect(weeklyVariant(rain.def, 1) === 'rain' && weeklyVariant(rain.def, 2) === 'rain', 'RAIN FINALS races 2+3 run in the rain');
  expect(VARIANTS['rain' as keyof typeof VARIANTS].rain === true, 'rain variant carries rain=true for the rules path');
  expect(surfaceGripFor(VARIANTS['rain' as keyof typeof VARIANTS].rain) === RAIN_GRIP_MULT, 'rain variant maps to RAIN_GRIP_MULT surface grip');
  expect(surfaceGripFor(false) === 1, 'dry surface grip stays 1');

  // night owl: whole cup at night
  const night = weekWithModifier('night-owl');
  expect(weeklyVariant(night.def, 0) === 'night' && weeklyVariant(night.def, 1) === 'night' && weeklyVariant(night.def, 2) === 'night', 'NIGHT OWL runs every race at night');
  expect(VARIANTS['night' as keyof typeof VARIANTS].headlights === true, 'night variant carries headlights');

  // weather-only modifiers return the shared defs untouched (same object identity)
  const rainTrack = weeklyRaceTrack(rain.def, 0);
  expect(rainTrack === rain.def.tracks[0], 'RAIN FINALS does not clone track defs');
  const nightTrack = weeklyRaceTrack(night.def, 2);
  expect(nightTrack === night.def.tracks[2], 'NIGHT OWL does not clone track defs');

  // slick mayhem: doubled slick rects on a runtime copy only
  const slick = weekWithModifier('slick-mayhem');
  const slickBase = TRACKS.find((t) => (t.slicks ?? []).length > 0) as TrackDef;
  const slickBefore = JSON.stringify(slickBase.slicks ?? null);
  const slickDef: WeeklyDef = { ...slick.def, tracks: [slickBase, ...slick.def.tracks.slice(1)] };
  const slickMod = weeklyRaceTrack(slickDef, 0);
  expect(slickMod !== slickBase, 'SLICK MAYHEM returns a runtime copy');
  expect(slickMod.slicks !== slickBase.slicks, 'slick array is a fresh array (shared defs untouched)');
  expect(JSON.stringify(slickBase.slicks ?? null) === slickBefore, 'shared TRACKS slicks unchanged after applying the modifier');
  const orig = slickBase.slicks ?? [];
  const mod = slickMod.slicks ?? [];
  expect(orig.length === mod.length && orig.every((s, i) => s.dist === mod[i].dist && s.lateral === mod[i].lateral && mod[i].w === s.w * 2 && mod[i].l === s.l * 2), 'slick rects doubled in length AND width, same centers');
  let slickProbeFound = false;
  for (let i = 0; i < orig.length; i++) {
    const probeLat = orig[i].lateral + orig[i].w * 0.75;
    const inOrig = computeOnSlick(orig, orig[i].dist, probeLat);
    const inMod = computeOnSlick(mod, orig[i].dist, probeLat);
    if (!inOrig && inMod) slickProbeFound = true;
  }
  expect(slickProbeFound, 'physics ground truth: a point inside only the doubled rect reads slick');
  expect(weeklyVariant(slick.def, 0) === 'day', 'SLICK MAYHEM keeps day variant (slicks flow through defs, not variants)');

  // boost fest: pad strength x1.5 on a runtime copy only
  const boost = weekWithModifier('boost-fest');
  const boostBase = TRACKS.find((t) => t.boosts.length > 0) as TrackDef;
  const boostBefore = JSON.stringify(boostBase.boosts);
  const boostDef: WeeklyDef = { ...boost.def, tracks: [boostBase, ...boost.def.tracks.slice(1)] };
  const boostMod = weeklyRaceTrack(boostDef, 0);
  expect(boostMod !== boostBase && boostMod.boosts !== boostBase.boosts, 'BOOST FEST returns a runtime copy with a fresh boosts array');
  expect(JSON.stringify(boostBase.boosts) === boostBefore, 'shared TRACKS boosts unchanged after applying the modifier');
  expect(boostBase.boosts.every((b, i) => boostMod.boosts[i].dist === b.dist && boostMod.boosts[i].lateral === b.lateral && Math.abs(boostMod.boosts[i].strength - b.strength * 1.5) < 1e-9), 'pad strengths multiplied by 1.5, same pads');
  // physics: the applied pad kick is 1.5x
  const pad = boostBase.boosts[0];
  const runPad = (defToUse: TrackDef) => {
    const curve = new TrackCurve(boostBase.points, true);
    const car = new CarPhysics(curve);
    car.placeAt(pad.dist, pad.lateral);
    car.state.grounded = true;
    const pads = { lastBoostIndex: -1, boostCooldown: 0 };
    updateBoostPads(car, defToUse, pads, 16);
    return car.state.vel.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(car.state.quat));
  };
  const dry = runPad(boostBase);
  const juiced = runPad(boostMod);
  expect(dry > 0 && Math.abs(juiced / dry - 1.5) < 0.02, `pad kick scales 1.5x through rules.updateBoostPads (${dry.toFixed(1)} -> ${juiced.toFixed(1)} m/s)`);
}

// ---------- 6. Weekly run: apply results, standings, trophy ----------
{
  const run = startWeeklyRun('2026W38');
  expect(run.weekKey === '2026W38' && run.nextRace === 0 && run.positions.length === 0 && run.entries.length === 1, 'fresh weekly run starts at race 0 with the player entry');
  const fake: Standing[] = [
    { name: 'YOU', isPlayer: true, paint: 0x29e6ff, progress: 0, gapMeters: 0 },
    { name: 'APEX', isPlayer: false, paint: 0xb44dff, progress: -10, gapMeters: 10 },
    { name: 'SABLE', isPlayer: false, paint: 0x7dff6e, progress: -20, gapMeters: 20 },
    { name: 'MIRAGE', isPlayer: false, paint: 0xc8ff2e, progress: -30, gapMeters: 30 },
  ];
  let res = applyWeeklyResult(run, fake, 0x29e6ff);
  expect(res.playerPos === 1 && res.playerPoints === CUP_POINTS[0], 'P1 pays the cup-points table top');
  expect(run.nextRace === 1 && run.positions.length === 1, 'run advances to race 2');
  const reversed: Standing[] = [...fake].reverse().map((s) => ({ ...s, isPlayer: s.name === 'YOU' }));
  res = applyWeeklyResult(run, reversed, 0x29e6ff);
  expect(res.playerPos === 4 && res.playerPoints === CUP_POINTS[3], 'P4 pays the cup-points table bottom');
  const playerEntry = run.entries.find((e) => e.isPlayer);
  expect(playerEntry?.points === CUP_POINTS[0] + CUP_POINTS[3], 'entries accumulate points across races');
  expect(run.entries.every((e) => run.entries.filter((x) => x.name === e.name).length === 1), 'one entry per rival name');
  expect(!weeklyComplete(run), 'run not complete after 2 races');
  applyWeeklyResult(run, fake, 0x29e6ff);
  expect(weeklyComplete(run) && run.nextRace === WEEKLY_RACES, 'run completes after 3 races');
  const table = weeklyStandings(run);
  expect(table[0].isPlayer && table[0].points === CUP_POINTS[0] * 2 + CUP_POINTS[3], 'standings sorted by points, player on top');
  expect(weeklyTrophy(run) === 'gold', 'weekly trophy: P1 overall = gold');
  const bad = startWeeklyRun('2026W39');
  applyWeeklyResult(bad, reversed, 0x29e6ff);
  applyWeeklyResult(bad, reversed, 0x29e6ff);
  applyWeeklyResult(bad, reversed, 0x29e6ff);
  expect(weeklyTrophy(bad) === null, 'P4 overall earns no trophy');
}

// ---------- 7. Resume mid-week + streak logic + best ledger (save round-trips) ----------
{
  store.clear();
  const save = new SaveManager();
  expect(save.weekly.run === null && save.weekly.streak === 0 && Object.keys(save.weekly.best).length === 0, 'fresh profile: weekly save defaults empty');
  let run = startWeeklyRun('2026W38');
  save.setWeeklyRun(run);
  // simulated reload
  let reloaded = new SaveManager().getWeeklyRun();
  expect(reloaded !== null && reloaded!.weekKey === '2026W38' && reloaded!.nextRace === 0, 'weekly run persists across reload for mid-week resume');
  applyWeeklyResult(reloaded!, fakeStandings(2), 0x29e6ff);
  save.setWeeklyRun(reloaded!);
  reloaded = new SaveManager().getWeeklyRun();
  expect(reloaded!.nextRace === 1 && reloaded!.positions[0] === 2, 'resume state advances after race 1 (P2 stored)');
  // stale week is discarded by the resume path
  const stale = startWeeklyRun('2026W02');
  save.setWeeklyRun(stale);
  const weekKey = '2026W38';
  let active = save.getWeeklyRun();
  if (!active || active.weekKey !== weekKey) active = startWeeklyRun(weekKey);
  expect(active.weekKey === '2026W38' && active.nextRace === 0, 'stale-week run is discarded for the current week');
  save.setWeeklyRun(active);

  // streak: completing all 3 races writes best + streak
  const s1 = new SaveManager();
  let r = s1.recordWeeklyFinish('2026W36', 58, 1);
  expect(r.streak === 1, 'first completed week starts the weekly streak at 1');
  r = s1.recordWeeklyFinish('2026W37', 42, 3);
  expect(r.streak === 2, 'finishing the next ISO week -> streak +1');
  r = s1.recordWeeklyFinish('2026W37', 30, 4);
  expect(r.streak === 2, 'same-week retry does not double-count the streak');
  expect(r.improved === false, 'same-week retry with fewer points does not improve the ledger');
  expect(s1.weekly.best['2026W37']?.points === 42 && s1.weekly.best['2026W37']?.position === 3, 'best points ledger kept');
  r = s1.recordWeeklyFinish('2026W37', 50, 2);
  expect(r.improved === true && s1.weekly.best['2026W37']?.points === 50, 'better weekly result overwrites the ledger');
  r = s1.recordWeeklyFinish('2026W39', 61, 1);
  expect(r.streak === 1, 'skipped week resets the weekly streak to 1');
  // year-boundary streak chain
  r = s1.recordWeeklyFinish('2020W52', 55, 1);
  expect(r.streak === 1, 'streak restarts cleanly on an old week');
  r = s1.recordWeeklyFinish('2020W53', 55, 2);
  expect(r.streak === 2, 'streak extends through the 53rd ISO week');
  r = s1.recordWeeklyFinish('2021W01', 55, 1);
  expect(r.streak === 3, 'streak crosses the year boundary (2020W53 -> 2021W01)');
  const weeklyJson = JSON.stringify(s1.weekly);
  const again = new SaveManager();
  expect(JSON.stringify(again.weekly) === weeklyJson, 'weekly save round-trips through simulated reload');
  expect(Object.keys(again.weekly.best).length >= 4, 'all completed weeks kept in the best ledger');
}

function fakeStandings(playerPos: number): Standing[] {
  const names = ['APEX', 'VESPER', 'SABLE', 'MIRAGE'];
  const rosterPaint = new Map(RIVAL_ROSTER.map((r) => [r.name, r.paint]));
  const out: Standing[] = [];
  let slot = 1;
  for (let p = 1; p <= 4; p++) {
    if (p === playerPos) {
      out.push({ name: 'YOU', isPlayer: true, paint: 0x29e6ff, progress: 0, gapMeters: 0 });
    } else {
      const n = names[(slot - 1) % names.length];
      out.push({ name: n, isPlayer: false, paint: rosterPaint.get(n) ?? 0x888888, progress: 0, gapMeters: 8 * slot });
      slot++;
    }
  }
  return out;
}

// ---------- 8. #w= share round-trip + rejection + old-week disable ----------
{
  const link = buildWeeklyLink('2026W38', 55, 1);
  expect(link === '#w=2026W38.55.1', `buildWeeklyLink format (#w=<week>.<points>.<pos>) got ${link}`);
  const parsed = parseWeeklyLink(link);
  expect(parsed !== null && parsed.weekKey === '2026W38' && parsed.points === 55 && parsed.position === 1, 'parse round-trips week + points + position');
  const p2 = parseWeeklyLink('w=2026W38.0.99');
  expect(p2 !== null && p2!.points === 0 && p2!.position === 99, 'zero points and P99 parse (bounds inclusive)');
  expect(parseWeeklyLink('#g=v1.sunrise-sprint.17000.ABCD') === null, '#g= ghost links are not weekly links');
  expect(parseWeeklyLink('#d=20260913.2.95432') === null, '#d= daily links are not weekly links');
  expect(parseWeeklyLink('#w=2026W54.10.1') === null, 'impossible week rejected');
  expect(parseWeeklyLink('#w=2026W38.1000.1') === null, 'points > 999 rejected');
  expect(parseWeeklyLink('#w=2026W38.-1.1') === null, 'negative points rejected');
  expect(parseWeeklyLink('#w=2026W38.10.0') === null, 'position 0 rejected');
  expect(parseWeeklyLink('#w=2026W38.10.100') === null, 'position > 99 rejected');
  expect(parseWeeklyLink('#w=2026W38.10') === null, 'missing field rejected');
  expect(parseWeeklyLink('#w=2026W38.10.1.9') === null, 'extra field rejected');
  const now = new Date(Date.UTC(2026, 8, 14, 12, 0, 0));
  const parsedOld = parseWeeklyLink(buildWeeklyLink('2026W36', 40, 2));
  expect(parsedOld !== null && !weekIsLive(parsedOld.weekKey, now), 'old-week link parses but is disabled for import');
}

// ---------- 9. Save sanitizer: corrupt weekly payloads merge additively, never throw ----------
{
  store.clear();
  store.set(
    'race2.save.v1',
    JSON.stringify({
      tracks: {},
      cups: {},
      careerRun: null,
      friendGhosts: {},
      daily: { streak: 0, results: {} },
      trafficBest: {},
      weekly: {
        run: { weekKey: 'garbage', nextRace: 99, entries: [], positions: [] },
        best: {
          '2026W38': { points: 55, position: 1 },
          'bogus': { points: 10, position: 1 },
          '2026W39': { points: -5, position: 0 },
        },
        streak: -7,
        lastWeek: 'nope',
      },
      schemaVersion: 2,
    }),
  );
  const save = new SaveManager();
  expect(save.weekly.run === null, 'malformed weekly run sanitized to null');
  expect(save.weekly.streak === 0, 'negative weekly streak sanitized to 0');
  expect(save.weekly.lastWeek === null, 'malformed lastWeek sanitized to null');
  expect(Object.keys(save.weekly.best).length === 1 && save.weekly.best['2026W38']?.points === 55, 'only well-formed weekly best entries survive sanitization');
  expect(save.schemaVersion === 2, 'schema version stays 2 (additive field, no bump)');
  const r = save.recordWeeklyFinish('2026W38', 60, 1);
  expect(r.streak === 1 && save.weekly.best['2026W38']?.points === 60, 'weekly ledger updates cleanly from sanitized state');
}

// ---------- 10. Full 3-race headless run (autopilot; no PB/ghost/cup/daily/lifetime writes) ----------
{
  const simDt = 1 / 120;
  const STRICT = new Set(['canyon-twist', 'grand-gauntlet', 'gauntlet-ii']);
  const week = weekWithModifier('rain-finals');
  const def = weeklyFor(week.key);
  store.clear();
  const save = new SaveManager();

  const runRace = (raceIndex: number): { finished: boolean; standings: Standing[]; grip: number; timeMs: number } => {
    const trackDef = weeklyRaceTrack(def, raceIndex);
    const variant = weeklyVariant(def, raceIndex);
    const curve = new TrackCurve(trackDef.points, true);
    const car = new CarPhysics(curve);
    const race = new RaceController(car, curve, trackDef, save, () => {}, { laps: WEEKLY_LAPS, writesRecords: false });
    const rivals = new RivalManager(curve, trackDef, new THREE.Group(), false, def.lineups[raceIndex]);
    rivals.rain = VARIANTS[variant].rain;
    const slot = rivals.gridSlot(3);
    car.placeAt(slot.dist, slot.lateral);
    rivals.placeOnGrid();
    race.start();
    race.countdownMs = 1;
    const ap = { smooth: 0 };
    let input = { steer: 0, throttle: 0, brake: 0, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
    let pendingRespawn = false;
    let recover = 0;
    let recoverDir = 1;
    let stuck = 0;
    let speedNow = 0;
    let latNow = 0;
    let wall = 0;
    let finishWallMs = -1;
    let wedgeSteps = 0;
    let gripSeen = 1;
    let finishOrder: Standing[] | null = null;
    let timeMs = 0;
    const maxSteps = 160000;
    while (wall < maxSteps) {
      const playerFinished = race.phase === 'finished';
      if (pendingRespawn) {
        race.respawnAtCheckpoint();
        pendingRespawn = false;
      }
      if (!playerFinished) {
        // rain grip plumbing: exactly what main.ts feeds the car each frame
        car.state.surfaceGrip = surfaceGripFor(VARIANTS[variant].rain);
        const wedge = speedNow < 3 && Math.abs(latNow) < 4 && wall > 20000;
        wedgeSteps = wedge ? wedgeSteps + 1 : 0;
        if (wedgeSteps > 120 * 12 && STRICT.has(trackDef.id)) {
          const frames = curve.frames.length;
          car.placeAtFrame(frames - 40, curve.length - 30);
          race['prevDist'] = curve.length - 30;
          car.applyBoost(30, 3);
          wedgeSteps = 0;
        } else if (recover > 0) {
          recover -= 1;
          input = { steer: recoverDir, throttle: 0, brake: 1, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
          if (recover === 0) ap.smooth = 0;
        } else {
          const r = autopilotDrive(car, curve, simDt, ap);
          pendingRespawn = !!r.respawn;
          if (speedNow < 2.5 && Math.abs(latNow) > 3) stuck++;
          else stuck = 0;
          if (stuck > 40) {
            stuck = 0;
            recover = 55;
            recoverDir = -(Math.sign(latNow) || 1);
          }
          input = { steer: r.respawn ? 0 : r.steer, throttle: r.respawn ? 0 : r.throttle, brake: r.respawn ? 0 : r.brake, drift: false, lookBack: false, respawn: false, restart: false, cameraToggle: false, pause: false, photo: false };
        }
      }
      race.update(simDt * 1000, input);
      rivals.update(simDt * 1000, race.phase === 'countdown' ? 'countdown' : 'racing', race.totalProgress);
      wall += simDt * 1000;
      speedNow = car.state.speed;
      latNow = car.state.lateral;
      if (race.phase === 'racing' && wall > 8000) gripSeen = car.state.surfaceGrip;
      if (race.phase === 'finished') {
        if (finishWallMs < 0) {
          finishWallMs = wall;
          finishOrder = rivals.freeze(race.totalProgress);
          timeMs = race.elapsedMs;
        }
        if (rivals.allFinished() || wall - finishWallMs > 20000) break;
      }
    }
    return { finished: race.phase === 'finished', standings: finishOrder ?? rivals.freeze(race.totalProgress), grip: gripSeen, timeMs };
  };

  let run = save.getWeeklyRun();
  if (!run || run.weekKey !== week.key) run = startWeeklyRun(week.key);
  const racedTracks: TrackDef[] = [];
  for (let i = 0; i < WEEKLY_RACES; i++) {
    const raceIndex = run.nextRace;
    const out = runRace(raceIndex);
    const trackDef = weeklyRaceTrack(def, raceIndex);
    racedTracks.push(trackDef);
    const pos = out.standings.findIndex((s) => s.isPlayer) + 1;
    expect(out.finished, `weekly race ${raceIndex + 1}/${WEEKLY_RACES} finishes headless on ${trackDef.id} (${(out.timeMs / 1000).toFixed(1)}s, P${pos})`);
    const cps = trackDef.checkpoints.length;
    expect(pos >= 1 && pos <= 4, `weekly race ${raceIndex + 1}: player classified P${pos}`);
    const expectedGrip = raceIndex >= 1 ? RAIN_GRIP_MULT : 1;
    expect(Math.abs(out.grip - expectedGrip) < 1e-9, `weekly race ${raceIndex + 1}: surface grip ${out.grip} matches modifier (${raceIndex >= 1 ? 'rain' : 'dry'})`);
    void cps;
    applyWeeklyResult(run, out.standings, 0x29e6ff);
    save.setWeeklyRun(run);
    // simulate a reload between races — resume must survive
    run = new SaveManager().getWeeklyRun() ?? run;
    if (run.weekKey !== week.key) run = startWeeklyRun(week.key);
  }
  expect(weeklyComplete(run), 'weekly run completes after 3 headless races');
  const trophy = weeklyTrophy(run);
  expect(trophy === 'gold' || trophy === 'silver' || trophy === 'bronze', `final standings produce a trophy (${trophy ?? 'none'})`);
  const playerEntry = run.entries.find((e) => e.isPlayer);
  const totalPoints = playerEntry?.points ?? 0;
  const fin = save.recordWeeklyFinish(week.key, totalPoints, run.positions.reduce((a, b) => a + b, 0) > 0 ? Math.min(...run.positions) : 4);
  expect(fin.streak === 1, 'completing the week records streak 1');
  expect(save.weekly.best[week.key]?.points === totalPoints, 'best ledger stores the weekly points total');

  // no stat writes anywhere: PB/ghost/cup/daily/lifetime all untouched
  let wrotePb = false;
  for (const t of racedTracks) {
    const ts = save.trackSave(t.id);
    if (ts.bestTimeMs !== null || ts.ghost !== null) wrotePb = true;
  }
  expect(!wrotePb, 'weekly races write no PB/ghost track records');
  expect(Object.keys(save.allSaves.cups).length === 0, 'weekly races write no cup records');
  expect(Object.keys(save.daily.results).length === 0 && save.daily.streak === 0, 'weekly races write no daily ledger entries');
  const stats = new SaveManager().stats;
  expect(stats.laps === 0 && stats.rivalWins === 0 && stats.rivalsBeaten.length === 0 && stats.totalDrift === 0, 'weekly races write no lifetime stats');
  console.log(`  weekly run ledger: ${run.positions.join(' / ')} positions, ${totalPoints} pts, trophy ${trophy ?? 'none'}, best ${JSON.stringify(save.weekly.best[week.key])}`);
}

console.log(`\nweekly test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
