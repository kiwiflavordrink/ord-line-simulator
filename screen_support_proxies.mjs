import fs from 'node:fs';
import {simulate} from './dist/engine.mjs';

const data = JSON.parse(fs.readFileSync(new URL('./dist/data.json', import.meta.url), 'utf8'));
const estimate = JSON.parse(fs.readFileSync(new URL('../work/support_damage_65_proxy.json', import.meta.url), 'utf8'));
const rows=[];
for (const support of estimate.rows) {
  for (const hero of data.heroes) {
    const results={};
    for (const [label,key] of [['full','at_full_hp'],['half','at_half_hp']]) {
      const effectiveDps=support[key].passive_effective_dps_per_mob;
      const result=simulate(data,hero.code,{cut:201,coverage:1,fullResource:true,
        summons:true,redDamage:true,supportEffectiveDps:effectiveDps});
      results[label]={effectiveDps,clear:result.clear,
        failedRound:result.failedRound,remaining:result.remaining};
    }
    rows.push({heroCode:hero.code,heroName:hero.name,
      supportCode:support.code,supportName:support.name,...results});
  }
}
fs.writeFileSync(new URL('./support_proxy_combos_201.json',import.meta.url),
  JSON.stringify({warning:'Constant 65-round per-mob support DPS proxy. Mana casts, stun pathing, and target distribution are not modeled. These are screens, not actual clear predictions.',rows},null,2)+'\n');
for(const support of estimate.rows){
  const subset=rows.filter(r=>r.supportCode===support.code);
  console.log(`${support.code}\t${support.name}\tfull ${subset.filter(r=>r.full.clear).length}/31\thalf ${subset.filter(r=>r.half.clear).length}/31`);
}
