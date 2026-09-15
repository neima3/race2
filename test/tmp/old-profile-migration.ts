import { SaveManager } from '../../src/core/save';

/** Pre-v8 (v2.2.0-era) profile: no v8 fields anywhere + legacy settings.camera key. */
const V22_SAVE = {
  tracks: {
    'sunrise-sprint': { bestTimeMs: 19123, history: [19123, 20400], ghost: null, cpSplits: [6521, 11802], medals: {} },
  },
  cups: {},
  careerRun: null,
  friendGhosts: {},
  daily: { results: { '20260801': { position: 2, timeMs: 55123 } }, streak: 3, lastFinishDate: '20260801' },
};
const V22_SETTINGS = { camera: 'hood', style: 'standard', onboarded: true, hintRival: true, shakeIntensity: 1 };
const V22_PLAYER = { paint: 0xffb52e, body: 'standard' };
const V22_STATS = { laps: 42, driftPoints: 12345, rivalWins: 6 };

const store = new Map<string, string>([
  ['race2.save.v1', JSON.stringify(V22_SAVE)],
  ['race2.settings.v1', JSON.stringify(V22_SETTINGS)],
  ['race2.player.v1', JSON.stringify(V22_PLAYER)],
  ['race2.stats.v1', JSON.stringify(V22_STATS)],
]);
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

let total = 0;
let failures = 0;
function ok(cond: boolean, msg: string): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const save = new SaveManager();
const s = save.allSaves;

// no throw + v2.2 data preserved
ok(s.tracks['sunrise-sprint']?.bestTimeMs === 19123, 'v2.2 track PB preserved');
ok(s.daily.streak === 3 && s.daily.results['20260801'], 'v2.2 daily results + streak preserved');
ok(save.profile.paint === 0xffb52e && save.profile.body === 'standard', 'v2.2 player profile preserved');
ok(save.settings.style === 'standard' && save.settings.onboarded === true, 'v2.2 settings preserved');
ok(save.stats.rivalWins === 6 && save.stats.laps === 42, 'v2.2 lifetime stats preserved');

// v8 additive defaults appear
ok(s.trafficBest !== undefined && Object.keys(s.trafficBest).length === 0, 'trafficBest default-merged (empty)');
ok(s.weekly && s.weekly.run === null && s.weekly.streak === 0 && s.weekly.bestStreak === 0, 'weekly ledger default-merged');
ok(s.unlocks && Array.isArray(s.unlocks.paints) && s.unlocks.paints.length === 0, 'unlocks.paints default-merged');
ok(s.daily.bestStreak === 3, 'daily.bestStreak backfilled from existing streak (3)');
ok(s.weekly.bestStreak === 0, 'weekly.bestStreak defaulted');

// v8 lifetime stats default to 0 without clobbering v2.2 keys
const st = save.stats as unknown as Record<string, unknown>;
ok(st.nearMisses === 0 && st.knockoutWins === 0 && st.distanceKm === 0, 'v8 lifetime stat fields defaulted');
ok(Array.isArray(st.rivalWinsBy) === false && st.rivalWinsBy !== undefined, 'rivalWinsBy present');

// legacy settings.camera migrates into cam
ok((save.settings as unknown as { cam?: string }).cam === 'hood', 'legacy settings.camera migrated to settings.cam');
ok((save.settings as unknown as { camera?: string }).camera === undefined, 'legacy settings.camera key removed');
ok(save.settings.fov === 72, 'fov default applied (72)');
ok((save.settings as unknown as { ghosts?: number }).ghosts === 3, 'ghosts default applied (3)');
ok(save.settings.tutorialDone === true, 'legacy v2.2 profile treated as returning (tutorialDone force-set)');

// schema version noted
ok(save.schemaVersion === 2, 'schema version 2 noted');

// round-trip: re-reading the store does not throw and keeps data
const save2 = new SaveManager();
ok(save2.allSaves.tracks['sunrise-sprint']?.bestTimeMs === 19123, 'reload round-trip clean');

console.log(`\nmigration test: ${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
