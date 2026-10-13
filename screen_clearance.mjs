import fs from 'node:fs';
import { simulate } from './dist/engine.mjs';

const data = JSON.parse(fs.readFileSync(new URL('./dist/data.json', import.meta.url), 'utf8'));
const opts = cut => ({cut, coverage: 1, fullResource: true, summons: true});
const rows = [];

for (const hero of data.heroes) {
  const cache = new Map();
  const at = cut => {
    if (!cache.has(cut)) cache.set(cut, simulate(data, hero.code, opts(cut)));
    return cache.get(cut);
  };
  let minimum = null;
  let seenClear = false, nonmonotone = false;
  // Evaluate every integer input. The first clear is the minimum even if
  // target changes make the model non-monotone at some higher armor cut.
  for (let cut = 20; cut <= 300; cut++) {
    const clear = at(cut).clear;
    if (clear && minimum === null) minimum = cut;
    if (seenClear && !clear) nonmonotone = true;
    seenClear ||= clear;
  }
  const result = minimum === null ? at(300) : at(minimum);
  const below = minimum === null || minimum === 20 ? null : at(minimum - 1);
  if (below?.clear || minimum !== null && !result.clear)
    throw new Error(`Threshold check failed for ${hero.code}`);
  const row = {
    code: hero.code, name: hero.name, grade: hero.grade,
    minimumCut: minimum, minimumAdditionalCut: minimum === null ? null : minimum - 20,
    remaining: result.remaining,
    rounds: result.checkpoints.map(p => p.remaining),
    failedAtMax: result.clear ? null : `${result.failedRound}라 ${result.failedSecond.toFixed(1)}초`,
    belowFailure: below?.clear === false ? `${below.failedRound}라 ${below.failedSecond.toFixed(1)}초` : null,
    nonmonotone
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}

fs.writeFileSync(new URL('./clearance_results.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
