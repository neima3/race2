import { TRACKS } from '../src/track/defs';
import { SaveManager } from '../src/core/save';
import { RIVAL_ROSTER } from '../src/game/rivals';
import {
  buildDailyLink,
  dailyFor,
  dailyIsLive,
  isValidDateKey,
  parseDailyLink,
  prevDateKey,
  todayKey,
  DAILY_LAPS,
} from '../src/game/daily';

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
function pass(msg: string): void {
  checks++;
  console.log(`PASS ${msg}`);
}
function expect(cond: boolean, msg: string): void {
  if (cond) pass(msg);
  else fail(msg);
}

// ---------- 1. Seed determinism: same date -> byte-identical definition ----------
{
  const a = dailyFor('20260913');
  const b = dailyFor('20260913');
  expect(JSON.stringify(a) === JSON.stringify(b), 'same date -> byte-identical daily definition');
  expect(TRACKS.includes(a.track), 'daily track comes from TRACKS');
  expect(a.laps === DAILY_LAPS && a.laps === 2, 'daily is 2 laps');
  expect(a.variant === 'day', 'daily variant is always day');
  expect(a.lineup.length === 3, 'daily lineup has 3 rivals');
  const tiers = a.lineup.map((r) => r.tier).sort().join(',');
  expect(tiers === 'easy,pro,pro', `daily lineup is 1 easy + 2 pro (got ${tiers})`);
  const names = new Set(a.lineup.map((r) => r.name));
  expect(names.size === 3, `no duplicate rivals in a daily lineup (${[...names].join('/')})`);
  expect(
    a.lineup.every((r) => RIVAL_ROSTER.some((m) => m.name === r.name && m.tier === r.tier && m.paint === r.paint)),
    'daily rivals come from the roster with matching tier/paint',
  );
  const other = dailyFor('20260914');
  expect(a.track.id !== other.track.id, `consecutive dates differ (${a.track.id} vs ${other.track.id})`);
}

// ---------- 2. 30 consecutive days: variety >= 8 distinct, no immediate repeats, deterministic ----------
{
  const start = Date.UTC(2026, 8, 1);
  const keys: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start + i * 86400000);
    keys.push(todayKey(d));
  }
  expect(keys[0] === '20260901' && keys[29] === '20260930', '30 consecutive UTC keys generated in order');
  const defs = keys.map((k) => dailyFor(k));
  const replay = keys.map((k) => JSON.stringify(dailyFor(k)));
  expect(
    defs.every((d, i) => JSON.stringify(d) === replay[i]),
    'every daily definition stable under repeated calls (30/30)',
  );
  const distinct = new Set(defs.map((d) => d.track.id)).size;
  expect(distinct >= 8, `30 days cover >= 8 distinct tracks (got ${distinct})`);
  let repeats = 0;
  for (let i = 1; i < defs.length; i++) {
    if (defs[i].track.id === defs[i - 1].track.id) repeats++;
  }
  expect(repeats === 0, `no track on consecutive days (got ${repeats} immediate repeats)`);
  const lineupsOk = defs.every(
    (d) => d.lineup.length === 3 && new Set(d.lineup.map((r) => r.name)).size === 3 && d.laps === 2 && d.variant === 'day',
  );
  expect(lineupsOk, 'all 30 lineups: 3 distinct rivals, 2 laps, day variant');
  console.log(`  rotation sample: ${defs.slice(0, 10).map((d) => d.track.id).join(' | ')}`);
}

// ---------- 3. UTC date-key math (rollover + month/year boundaries) ----------
{
  expect(todayKey(new Date(Date.UTC(2026, 8, 13, 23, 59, 59))) === '20260913', 'todayKey stays on UTC date before midnight');
  expect(todayKey(new Date(Date.UTC(2026, 8, 14, 0, 0, 0))) === '20260914', 'todayKey rolls over at UTC midnight (not local)');
  expect(prevDateKey('20260301') === '20260228', 'prevDateKey crosses month boundary (leap year)');
  expect(prevDateKey('20210101') === '20201231', 'prevDateKey crosses year boundary');
  expect(prevDateKey('20260101') === '20251231', 'prevDateKey non-leap February');
  expect(isValidDateKey('20260229') === false, 'invalid Feb 29 rejected (non-leap)');
  expect(isValidDateKey('20240229') === true, 'valid Feb 29 accepted (leap year)');
  expect(isValidDateKey('20261301') === false && isValidDateKey('20260900') === false, 'bad month/day rejected');
}

// ---------- 4. Streak logic: yesterday -> +1, same-day retry no double, gap -> reset ----------
{
  store.clear();
  const save = new SaveManager();
  expect(save.daily.lastFinishDate === null && save.daily.streak === 0 && Object.keys(save.daily.results).length === 0, 'fresh profile: daily save defaults empty');
  let r = save.recordDailyFinish('20260910', 1, 100000);
  expect(r.streak === 1, 'first daily finish starts streak at 1');
  r = save.recordDailyFinish('20260911', 2, 110000);
  expect(r.streak === 2, 'finish the next day -> streak +1');
  r = save.recordDailyFinish('20260911', 1, 105000);
  expect(r.streak === 2, 'same-day retry does not double-count the streak');
  expect(r.improved === true, 'same-day retry with better position improves the stored result');
  expect(save.daily.results['20260911']?.position === 1 && save.daily.results['20260911']?.timeMs === 105000, 'best result kept (P1 · 105000)');
  r = save.recordDailyFinish('20260911', 3, 90000);
  expect(r.streak === 2 && r.improved === false, 'same-day retry with worse position keeps the streak and the old result');
  expect(save.daily.results['20260911']?.position === 1 && save.daily.results['20260911']?.timeMs === 105000, 'lowest position wins even against a faster time (position then time)');
  r = save.recordDailyFinish('20260913', 4, 120000);
  expect(r.streak === 1, 'skipped day resets the streak to 1');
  r = save.recordDailyFinish('20260913', 4, 90000);
  expect(r.streak === 1 && r.improved === true, 'same-day retry after reset keeps streak and improves time');
  expect(save.daily.results['20260913']?.timeMs === 90000, 'better time stored for the same position');
  r = save.recordDailyFinish('20260914', 2, 80000);
  expect(r.streak === 2, 'consecutive next day extends the streak again');
  const dailyJson = JSON.stringify(save.daily);
  const reloaded = new SaveManager();
  expect(JSON.stringify(reloaded.daily) === dailyJson, 'daily save round-trips through simulated reload (Map-backed storage)');
  expect(reloaded.daily.results['20260910']?.position === 1, 'all dated results kept (tiny ledger, no pruning)');
}

// ---------- 5. Sanitizer: corrupted daily payloads merge additively, never throw ----------
{
  store.clear();
  store.set(
    'race2.save.v1',
    JSON.stringify({
      tracks: {},
      cups: {},
      careerRun: null,
      friendGhosts: {},
      daily: {
        streak: -5,
        lastFinishDate: '2026-09-10',
        results: {
          '20260910': { position: 2, timeMs: 50000 },
          'junkkey': { position: 1, timeMs: 1 },
          '20260911': { position: 0, timeMs: -3 },
        },
      },
      schemaVersion: 2,
    }),
  );
  const save = new SaveManager();
  expect(save.daily.streak === 0, 'negative streak sanitized to 0');
  expect(save.daily.lastFinishDate === null, 'malformed lastFinishDate sanitized to null');
  expect(
    Object.keys(save.daily.results).length === 1 && save.daily.results['20260910']?.position === 2,
    'only well-formed dated results survive sanitization',
  );
  expect(save.schemaVersion === 2, 'schema version stays 2 (additive field, no bump)');
  const r = save.recordDailyFinish('20260911', 1, 40000);
  expect(r.streak === 1, 'streak restarts cleanly from sanitized state');
}

// ---------- 6. #d= share-code round-trip + rejection ----------
{
  const link = buildDailyLink('20260913', 2, 95432);
  expect(link === '#d=20260913.2.95432', `buildDailyLink format (#d=<date>.<pos>.<timeMs>) got ${link}`);
  const parsed = parseDailyLink(link);
  expect(
    parsed !== null && parsed.dateKey === '20260913' && parsed.position === 2 && parsed.timeMs === 95432,
    'parse round-trips position + timeMs + date',
  );
  const big = parseDailyLink(buildDailyLink('20240229', 4, 3599999));
  expect(big !== null && big.position === 4 && big.timeMs === 3599999, 'P4 and large timeMs round-trip; leap-day key valid');
  expect(parseDailyLink('#g=v1.sunrise-sprint.17000.ABCD') === null, '#g= ghost links are not daily links');
  expect(parseDailyLink('#d=20261399.1.100') === null, 'impossible date rejected');
  expect(parseDailyLink('#d=2026091.1.100') === null, 'short date key rejected');
  expect(parseDailyLink('#d=20260913.0.100') === null, 'position 0 rejected');
  expect(parseDailyLink('#d=20260913.101.100') === null, 'position > 99 rejected');
  expect(parseDailyLink('#d=20260913.2.-5') === null, 'negative time rejected');
  expect(parseDailyLink('#d=20260913.2.0') === null, 'zero time rejected');
  expect(parseDailyLink('#d=20260913.2') === null, 'missing field rejected');
  expect(parseDailyLink('#d=20260913.2.100.99') === null, 'extra field rejected');
  expect(parseDailyLink('d=20260913.2.100') !== null, 'parses with or without leading #');
}

// ---------- 7. Old-date disable logic: only TODAY is playable ----------
{
  const now = new Date(Date.UTC(2026, 8, 13, 12, 0, 0));
  expect(dailyIsLive('20260913', now), "today's daily is playable");
  expect(!dailyIsLive('20260912', now), 'yesterday daily is disabled (old date)');
  expect(!dailyIsLive('20260914', now), 'future-dated link is disabled (not today)');
  expect(!dailyIsLive('20261399', now), 'invalid date key is never live');
  expect(dailyIsLive(todayKey(now), now), 'todayKey output is always live for the same instant');
}

console.log(`\ndaily test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
