import fs from 'node:fs';
import {simulate} from './dist/engine.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./dist/data_legacy.json',import.meta.url),'utf8'));
const expected=JSON.parse(fs.readFileSync(new URL('../work/physical_cut_screen.json',import.meta.url),'utf8'));
let checked=0;
for(const row of expected){
  for(const cut of [20,50,100,150,180,201,220]){
    const actual=simulate(data,row.code,{cut,coverage:1,fullResource:true,summons:true});
    const prior=row.series[String(cut)];
    const aa=actual.checkpoints.map(x=>x.remaining);
    const bb=prior.checkpoints.map(x=>x.remaining);
    if(actual.clear!==prior.clear||actual.remaining!==prior.remaining||JSON.stringify(aa)!==JSON.stringify(bb)){
      throw new Error(`${row.code} cut=${cut}: JS ${actual.clear}/${actual.remaining}/${aa} vs Python ${prior.clear}/${prior.remaining}/${bb}`);
    }
    checked++;
  }
}
const varied=simulate(data,'TR19',{cut:201,coverage:.5,fullResource:false,summons:false});
if(!varied.timeline.length||!Number.isFinite(varied.remaining))throw new Error('가변 입력 결과 누락');
const withRed=simulate(data,'TR19',{cut:201,redDamage:true});
const withoutRed=simulate(data,'TR19',{cut:201,redDamage:false});
if(!withRed.clear||withoutRed.clear)throw new Error('레포 직접피해 토글 결과 불일치');
console.log(`Parity cases: ${checked}; variable-input and Redforce toggle: passed`);
