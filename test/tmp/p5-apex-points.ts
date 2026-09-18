// Points-math verification: if the player turns the +0.3-0.8s autopilot margins into
// 2 wins + 2 P2s (with SOVEREIGN winning R4), does gold land? Real cup code path.
import { cupById, cupLineup, applyRaceResult, cupComplete, cupTrophy, cupStandings, startCupRun } from '../../src/game/career';
const PLAYER_PAINT = 0x29e6ff;
import type { Standing } from '../../src/game/rivals';

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
} as unknown as Storage;

function field(cupId: string, raceIndex: number, playerPos: number): Standing[] {
  const cup = cupById(cupId)!;
  const names = cupLineup(cup, raceIndex).map((r) => r.name);
  const rows: Standing[] = [{ name: 'YOU', progress: 0, isPlayer: true, gapMeters: 0, paint: PLAYER_PAINT, finished: true, finishTimeMs: 60000 }];
  for (const n of names) rows.push({ name: n, progress: 0, isPlayer: false, gapMeters: 0, paint: 0, finished: true, finishTimeMs: 60100 });
  // rows[0] is the ordered P1 slot holder; place player at playerPos
  const order = [...rows];
  const p = order.splice(0, 1)[0];
  order.splice(Math.max(0, playerPos - 1), 0, p);
  return order;
}

const cup = cupById('apex-league')!;
const save = {
  setCupRun: (r: unknown) => {}, getCupRun: () => run,
} as never;

for (const scenario of [[1, 1, 2, 2], [1, 1, 1, 2], [2, 1, 2, 1], [1, 2, 2, 2]]) {
  let run = startCupRun(cup.id);
  for (let ri = 0; ri < 4; ri++) {
    const standings = field(cup.id, ri, scenario[ri]);
    applyRaceResult(run, standings, PLAYER_PAINT);
  }
  const rank = cupStandings(run).findIndex((e) => e.isPlayer) + 1;
  const trophy = cupTrophy(run);
  console.log(`scenario ${scenario.join('-')}: pts=${run.entries.find((e) => e.isPlayer)!.points} rank=P${rank} trophy=${trophy} complete=${cupComplete(run)} | field: ${cupStandings(run).map((e, i) => `${i + 1}.${e.name} ${e.points}`).join(' ')}`);
}
