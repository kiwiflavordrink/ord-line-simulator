// Snapshot of v3 line results for every selectable unit, used to document
// how each calculation change moves the results (docs/수정내역.md).
// Usage: node scripts/hero_results.mjs [out.json] [--options='{"resourceMode":"perRound"}']
//        (prints a summary; writes JSON if a path is given)
import {readFileSync,writeFileSync} from 'node:fs';
import {SUPPORTS} from '../dist/engine.mjs';
import {simulateV2,DELETERS,CONDITIONAL_UNITS} from '../dist/engine_v3.mjs';

const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const optArg=process.argv.find(a=>a.startsWith('--options='));
const opts=optArg?JSON.parse(optArg.slice(10)):{};
const outPath=process.argv.slice(2).find(a=>!a.startsWith('--'));
const codes=[...data.heroes.map(h=>h.code),...Object.keys(CONDITIONAL_UNITS)];
const summary=r=>({clear:r.clear,failedRound:r.failedRound,failedSecond:r.failedSecond,remaining:r.remaining,
  rounds:r.checkpoints.map(c=>c.remaining),
  specialKill:r.checkpoints.map(c=>c.specialKillSecond)});
const rows={};
for(const code of codes)for(const count of [1,3])
  rows[`${code}x${count}`]=summary(simulateV2(data,[{code,count}],opts));
// Supports and deleters next to a fixed carry, so their own effect is visible.
for(const code of [...Object.keys(SUPPORTS),...Object.keys(DELETERS)])
  rows[`TR19+${code}`]=summary(simulateV2(data,[{code:'TR19'},{code}],opts));

const text=r=>r.clear?`clear ${r.remaining}`:`${r.failedRound}R ${r.failedSecond}s`;
for(const [k,r] of Object.entries(rows))console.log(k.padEnd(10),text(r).padEnd(14),r.rounds.join('/'));
if(outPath)writeFileSync(outPath,JSON.stringify({data:data.version,options:opts,rows},null,1)+'\n');
