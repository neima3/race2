import { SaveManager } from '../src/core/save';
import { PAINTS, PAINT_LOCK_IDS, type PaintLockId } from '../src/render/car-model';
import { paintSelectState } from '../src/systems/garage';
import { checkPaintUnlocks, paintUnlockState, PAINT_LOCK_INFO } from '../src/game/unlocks';
import { driverStats } from '../src/game/stats';
import { weekKeyFor } from '../src/game/weekly';
import type { UnlockSave } from '../src/core/save';

// Map-backed storage mock that survives simulated reloads (same pattern as test/career.ts).
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
function pass(msg: string): void {
  checks++;
  console.log(`PASS ${msg}`);
}
function expect(cond: boolean, msg: string): void {
  if (cond) pass(msg);
  else fail(msg);
}

const STATS_KEY = 'race2.stats.v1';
const SAVE_KEY = 'race2.save.v1';

// ---------- 1. Paint roster: 6 free (byte-identical) + 4 locked ----------
{
  expect(PAINTS.length === 10, `10 paints defined (got ${PAINTS.length})`);
  const free = PAINTS.filter((p) => !p.lock);
  const locked = PAINTS.filter((p) => p.lock);
  expect(free.length === 6, `6 free paints (got ${free.length})`);
  expect(locked.length === 4, `4 locked paints (got ${locked.length})`);
  const pinned = [
    ['Cyan Flux', 0x29e6ff],
    ['Solar', 0xffb52e],
    ['Rose Rush', 0xff4d6d],
    ['Volt', 0x7dff6e],
    ['Frost', 0xe8f2ff],
    ['Lime Pop', 0xc8ff2e],
  ];
  expect(
    JSON.stringify(free.map((p) => [p.name, p.color])) === JSON.stringify(pinned),
    `free paints byte-identical to v2.2 roster (${free.map((p) => p.name).join('/')})`,
  );
  expect(
    locked.every((p) => typeof p.lock === 'string' && (PAINT_LOCK_IDS as string[]).includes(p.lock)),
    'every locked paint carries a valid lock id',
  );
  expect(new Set(PAINT_LOCK_IDS).size === 4, '4 distinct paint lock ids');
  expect(
    PAINT_LOCK_IDS.every((id) => PAINT_LOCK_INFO[id] && PAINT_LOCK_INFO[id].label.length > 0 && PAINT_LOCK_INFO[id].req.length > 0),
    'every lock id has label + requirement text',
  );
  expect(new Set(PAINTS.map((p) => p.color)).size === 10, 'paint colors unique (saved profiles key on color)');
}

// ---------- 2. Fresh profile: locks closed, free paints selectable ----------
{
  store.clear();
  const save = new SaveManager();
  const state = paintUnlockState(save);
  expect(save.unlocks.paints.length === 0, 'fresh profile has no earned paints');
  expect(PAINT_LOCK_IDS.every((id) => !state[id].unlocked && state[id].req.length > 0), 'all locks closed with requirement text on fresh profile');
  expect(
    PAINTS.filter((p) => !p.lock).every((p) => paintSelectState(save, p.color).allowed),
    'all 6 free paints selectable on fresh profile',
  );
  expect(
    PAINTS.filter((p) => p.lock).every((p) => !paintSelectState(save, p.color).allowed && paintSelectState(save, p.color).req.length > 0),
    'all 4 locked paints rejected with requirement text on fresh profile',
  );
  expect(!paintSelectState(save, 0x123456).allowed, 'unknown color rejected');
}

// ---------- 3. MIDNIGHT: knockout win unlocks exactly at the win ----------
{
  store.clear();
  const save = new SaveManager();
  expect(checkPaintUnlocks(save).length === 0, 'no unlocks before any trigger');
  save.addStats({ knockoutWins: 1 });
  const fresh = checkPaintUnlocks(save);
  expect(fresh.length === 1 && fresh[0] === 'knockout-win', `knockout win unlocks MIDNIGHT only (${fresh.join(',')})`);
  expect(checkPaintUnlocks(save).length === 0, 'unlock sweep idempotent on repeat');
  expect(paintSelectState(save, 0x223055).allowed, 'MIDNIGHT selectable after knockout win');
}

// ---------- 4. ULTRAVIOLET: near-miss threshold is exactly 25 ----------
{
  store.clear();
  const save = new SaveManager();
  save.addStats({ nearMisses: 24 });
  expect(!paintUnlockState(save)['near-miss'].unlocked, '24 near misses: ULTRAVIOLET still locked');
  save.addStats({ nearMisses: 1 });
  const fresh = checkPaintUnlocks(save);
  expect(fresh.includes('near-miss'), '25th near miss unlocks ULTRAVIOLET');
  expect(checkPaintUnlocks(save).length === 0, 'near-miss unlock not re-fired');
  expect(save.stats.nearMisses === 25, `lifetime nearMisses accumulates (got ${save.stats.nearMisses})`);
  // one-shot crossing (e.g. migrated stats): 0 → 99 unlocks in a single sweep
  store.clear();
  const save2 = new SaveManager();
  save2.addStats({ nearMisses: 99 });
  expect(checkPaintUnlocks(save2).includes('near-miss'), 'single 0→99 sweep unlocks ULTRAVIOLET');
}

// ---------- 5. SUNBURST: 7-day daily streak ----------
{
  store.clear();
  const save = new SaveManager();
  const dayKey = (day: number): string => {
    const d = new Date(Date.UTC(2026, 8, 1) + day * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  for (let day = 0; day < 6; day++) save.recordDailyFinish(dayKey(day), 1, 60000);
  expect(save.daily.bestStreak === 6, `streak 6 tracked (best=${save.daily.bestStreak})`);
  expect(!paintUnlockState(save)['daily-streak'].unlocked, 'streak 6: SUNBURST still locked');
  save.recordDailyFinish(dayKey(6), 2, 61000);
  expect(save.daily.streak === 7 && save.daily.bestStreak === 7, 'streak reaches 7 on day 7');
  const fresh = checkPaintUnlocks(save);
  expect(fresh.includes('daily-streak'), '7-day streak unlocks SUNBURST');
  // gap resets the streak but the earned paint stays earned; bestStreak holds
  save.recordDailyFinish(dayKey(8), 1, 59000);
  expect(save.daily.streak === 1 && save.daily.bestStreak === 7, 'gap resets streak to 1, bestStreak keeps 7');
  expect(paintSelectState(save, 0xff5c39).allowed, 'SUNBURST stays selectable after the streak breaks');
  expect(checkPaintUnlocks(save).length === 0, 'no re-unlock after streak break');
}

// ---------- 6. GOLD LEAF: weekly gold trophy (position 1) ----------
{
  store.clear();
  const save = new SaveManager();
  const monday = (week: number): Date => new Date(Date.UTC(2026, 8, 7) + week * 7 * 86400000);
  const w1 = weekKeyFor(monday(0));
  const w2 = weekKeyFor(monday(1));
  save.recordWeeklyFinish(w1, 43, 2);
  expect(!paintUnlockState(save)['weekly-gold'].unlocked, 'weekly silver (P2): GOLD LEAF still locked');
  save.recordWeeklyFinish(w2, 61, 1);
  const fresh = checkPaintUnlocks(save);
  expect(fresh.includes('weekly-gold'), 'weekly P1 (gold trophy) unlocks GOLD LEAF');
  expect(paintSelectState(save, 0xd78a4a).allowed, 'GOLD LEAF selectable after weekly gold');
  expect(checkPaintUnlocks(save).length === 0, 'weekly-gold unlock idempotent');
}

// ---------- 7. unlockPaint direct API: idempotent + sanitized store ----------
{
  store.clear();
  const save = new SaveManager();
  expect(save.unlockPaint('knockout-win') === true, 'unlockPaint returns true on first earn');
  expect(save.unlockPaint('knockout-win') === false, 'unlockPaint returns false when already earned');
  expect(save.unlocks.paints.length === 1, 'no duplicate lock entries');
  // corrupt persisted unlocks: unknown ids + duplicates are sanitized on load
  store.set(SAVE_KEY, JSON.stringify({ tracks: {}, unlocks: { paints: ['near-miss', 'bogus', 'near-miss', 'weekly-gold', 42] } }));
  const reloaded = new SaveManager();
  expect(
    JSON.stringify(reloaded.unlocks.paints.slice().sort()) === JSON.stringify(['near-miss', 'weekly-gold']),
    `corrupt unlocks sanitized to valid unique ids (${reloaded.unlocks.paints.join(',')})`,
  );
}

// ---------- 8. Lifetime stats sanitizers keep legacy data ----------
{
  store.clear();
  store.set(STATS_KEY, JSON.stringify({ laps: 12, totalDrift: 3456.5, nearMisses: 'garbage', rivalWinsBy: { APEX: 'x', SABLE: 3, '': 9, VESPER: -2 }, knockoutWins: null, distanceKm: 7.25 }));
  const save = new SaveManager();
  expect(save.stats.laps === 12 && save.stats.totalDrift === 3456.5, 'legacy stat fields survive sanitize');
  expect(save.stats.nearMisses === 0 && save.stats.knockoutWins === 0, 'corrupt numeric stats default to 0');
  expect(save.stats.distanceKm === 7.25, 'distanceKm survives sanitize');
  expect(
    JSON.stringify(save.stats.rivalWinsBy) === JSON.stringify({ SABLE: 3 }),
    `rivalWinsBy sanitized to valid entries only (${save.stats.rivalWinsBy})`,
  );
}

// ---------- 9. driverStats: full simulated career ----------
{
  store.clear();
  const save = new SaveManager();
  save.addStats({ laps: 41, distanceKm: 41 * 0.9, totalDrift: 12345.6, totalAir: 88.4, nearMisses: 37, rivalWins: 12, knockoutWins: 3, rivalsBeaten: ['SABLE', 'APEX'], rivalWinsBy: { SABLE: 5, APEX: 4 } });
  save.addStats({ laps: 2, rivalWinsBy: { SABLE: 1 } });
  save.recordCupFinish('sprint-cup', { positions: [1, 1, 2, 1], points: 80, trophy: 'gold', dateMs: 1 });
  save.recordCupFinish('sprint-cup', { positions: [2, 1, 1, 1], points: 78, trophy: 'gold', dateMs: 2 });
  save.recordCupFinish('street-cup', { positions: [2, 2, 1, 2], points: 71, trophy: 'silver', dateMs: 3 });
  save.recordCupFinish('gauntlet-cup', { positions: [3, 3, 2, 3], points: 55, trophy: 'bronze', dateMs: 4 });
  save.recordCupFinish('grand-tour', { positions: [4, 3, 3, 4], points: 52, trophy: null, dateMs: 5 });
  // a never-beaten rival must not appear: plant a 0 directly in the persisted stats
  const raw = JSON.parse(store.get(STATS_KEY)!);
  raw.rivalWinsBy.VESPER = 0;
  store.set(STATS_KEY, JSON.stringify(raw));
  const dayKey = (day: number): string => {
    const d = new Date(Date.UTC(2026, 8, 1) + day * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  for (let day = 0; day < 7; day++) save.recordDailyFinish(dayKey(day), 1, 60000);
  save.recordWeeklyFinish(weekKeyFor(new Date(Date.UTC(2026, 8, 7))), 25, 2);
  save.recordWeeklyFinish(weekKeyFor(new Date(Date.UTC(2026, 8, 14))), 61, 1);

  const st = driverStats(save);
  expect(st.laps === 43, `driverStats.laps (got ${st.laps})`);
  expect(Math.abs(st.distanceKm - 36.9) < 1e-6, `driverStats.distanceKm sums (got ${st.distanceKm})`);
  expect(st.driftPoints === 12345.6, `driverStats.driftPoints (got ${st.driftPoints})`);
  expect(st.airSeconds === 88.4, `driverStats.airSeconds (got ${st.airSeconds})`);
  expect(st.nearMisses === 37, `driverStats.nearMisses (got ${st.nearMisses})`);
  expect(st.rivalWins === 12, `driverStats.rivalWins (got ${st.rivalWins})`);
  expect(st.knockoutWins === 3, `driverStats.knockoutWins (got ${st.knockoutWins})`);
  expect(st.trophies.gold === 2 && st.trophies.silver === 1 && st.trophies.bronze === 1, `driverStats.trophies by metal (got ${JSON.stringify(st.trophies)})`);
  expect(st.bestDailyStreak === 7, `driverStats.bestDailyStreak (got ${st.bestDailyStreak})`);
  expect(st.bestWeeklyStreak === 2, `driverStats.bestWeeklyStreak counts back-to-back weeks (got ${st.bestWeeklyStreak})`);
  expect(st.headToHead.length === 2, `zero-win rivals omitted from head-to-head (got ${st.headToHead.map((h) => h.name).join('/')})`);
  expect(
    st.headToHead[0].name === 'SABLE' && st.headToHead[0].wins === 6 && st.headToHead[1].name === 'APEX' && st.headToHead[1].wins === 4,
    `head-to-head accumulates + sorts desc (${st.headToHead.map((h) => `${h.name}:${h.wins}`).join(',')})`,
  );
  // every DriverStats field is populated (no undefined holes from a real career)
  const fields = Object.keys(st) as (keyof ReturnType<typeof driverStats>)[];
  expect(fields.every((f) => st[f] !== undefined), 'driverStats exposes every panel field after a simulated career');
}

// ---------- 10. Reload round-trip preserves everything ----------
{
  store.clear();
  let save = new SaveManager();
  save.addStats({ laps: 9, nearMisses: 25, knockoutWins: 1, distanceKm: 8.1, rivalWinsBy: { APEX: 2 } });
  save.unlockPaint('knockout-win');
  save.unlockPaint('near-miss');
  const dayKey = (day: number): string => {
    const d = new Date(Date.UTC(2026, 8, 1) + day * 86400000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  for (let day = 0; day < 7; day++) save.recordDailyFinish(dayKey(day), 1, 60000);
  checkPaintUnlocks(save); // the app fires the sweep on the finish path — mirror it before reloading
  const reloaded = new SaveManager();
  expect(reloaded.stats.laps === 9 && reloaded.stats.nearMisses === 25 && reloaded.stats.knockoutWins === 1, 'lifetime stats round-trip through reload');
  expect(Math.abs(reloaded.stats.distanceKm - 8.1) < 1e-9, 'distanceKm round-trips through reload');
  expect(
    JSON.stringify(reloaded.stats.rivalWinsBy) === JSON.stringify({ APEX: 2 }),
    `rivalWinsBy round-trips through reload (${JSON.stringify(reloaded.stats.rivalWinsBy)})`,
  );
  expect(
    reloaded.unlocks.paints.length === 3 && reloaded.isPaintUnlocked('knockout-win') && reloaded.isPaintUnlocked('near-miss') && reloaded.isPaintUnlocked('daily-streak'),
    'earned paints persist across reload',
  );
  expect(reloaded.daily.bestStreak === 7, 'daily bestStreak persists across reload');
  expect(paintSelectState(reloaded, 0x223055).allowed && paintSelectState(reloaded, 0xb44dff).allowed && paintSelectState(reloaded, 0xff5c39).allowed, 'unlocked paints remain selectable after reload');
  expect(!paintSelectState(reloaded, 0xd78a4a).allowed, 'un-earned paint still locked after reload');
  // a further sweep after reload stays quiet (no duplicate toasts in the real app)
  expect(checkPaintUnlocks(reloaded).length === 0, 'boot sweep after reload fires nothing new');
}

// ---------- 11. Unlock map stays in sync with the roster ----------
{
  expect(
    PAINTS.filter((p) => p.lock).every((p) => (PAINT_LOCK_IDS as string[]).includes(p.lock as PaintLockId)),
    'roster locks ⊆ PAINT_LOCK_IDS',
  );
  const unlocksShape: UnlockSave = { paints: [...PAINT_LOCK_IDS] };
  expect(unlocksShape.paints.length === 4, 'UnlockSave accepts the full lock set');
}

console.log(`\nstats test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
