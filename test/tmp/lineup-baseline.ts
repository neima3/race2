import { TRACKS } from '../../src/track/defs';
import { pickLineup } from '../../src/game/rivals';
import { CUPS, cupLineup } from '../../src/game/career';
import { dailyFor } from '../../src/game/daily';
import { weeklyFor } from '../../src/game/weekly';

const out: string[] = [];
for (const cup of CUPS) {
  for (let i = 0; i < 4; i++) {
    out.push(`${cup.id}#${i}: ${cupLineup(cup, i).map((r) => r.name).join('/')}`);
  }
}
for (const t of TRACKS) {
  out.push(`free:${t.id}: ${pickLineup(t.id).map((r) => r.name).join('/')}`);
}
const days: string[] = [];
for (let i = 0; i < 30; i++) {
  const d = new Date(Date.UTC(2026, 8, 15) - i * 86400000);
  const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  days.push(key);
  out.push(`daily:${key}: ${dailyFor(key).lineup.map((r) => r.name).join('/')}`);
}
for (const wk of ['2026W36', '2026W37', '2026W38', '2026W39']) {
  out.push(`weekly:${wk}: ${weeklyFor(wk).lineups.map((lu) => lu.map((r) => r.name).join('/')).join(' | ')}`);
}
console.log(out.join('\n'));
