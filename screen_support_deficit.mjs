import fs from 'node:fs';
import { simulate } from './dist/engine.mjs';

const data = JSON.parse(fs.readFileSync(new URL('./dist/data.json', import.meta.url), 'utf8'));
const rows = [];
const unit = 10000; // Round upward to 10,000 effective AoE damage per mob per second.
const maxUnits = 5000;
for (const hero of data.heroes) {
  const opts = supportEffectiveDps => ({cut: 201, coverage: 1, fullResource: true,
    summons: true, redDamage: true, supportEffectiveDps});
  const baseline = simulate(data, hero.code, opts(0));
  let low = 0, high = maxUnits;
  if (!simulate(data, hero.code, opts(high * unit)).clear) {
    rows.push({code: hero.code, name: hero.name, threshold: null,
      baselineRemaining: baseline.remaining, baselineFailedRound: baseline.failedRound});
    continue;
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (simulate(data, hero.code, opts(mid * unit)).clear) high = mid;
    else low = mid + 1;
  }
  const threshold = low * unit;
  if (threshold && simulate(data, hero.code, opts(threshold - unit)).clear)
    throw new Error(`Unexpected threshold for ${hero.code}`);
  rows.push({code: hero.code, name: hero.name, threshold,
    baselineRemaining: baseline.remaining, baselineFailedRound: baseline.failedRound,
    resultRemaining: simulate(data, hero.code, opts(threshold)).remaining});
  console.log(`${hero.code}\t${hero.name}\t${threshold}\t${baseline.failedRound ?? 'pass'}`);
}
fs.writeFileSync(new URL('./support_deficit_201.json', import.meta.url),
  JSON.stringify({scenario: {cut: 201, coverage: 1, fullResource: true, summons: true,
    redDamage: true, cap: 55, support: 'constant effective AoE DPS per covered line mob'},
    rows}, null, 2) + '\n');
