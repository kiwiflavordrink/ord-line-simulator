// 실전 검증(docs/validation/real_games.json): 사용자 실전 판을 현재 엔진으로 돌려 실제 결과와 비교한다.
// Usage: node scripts/real_games.mjs [out.json]
import {readFileSync,writeFileSync} from 'node:fs';
import {simulateV2} from '../dist/engine_v3.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const {games}=JSON.parse(readFileSync(new URL('../docs/validation/real_games.json',import.meta.url)));
const rows=[];
for(const g of games){
  const team=g.team.map(x=>typeof x==='string'?{code:x}:x);
  const opts={difficulty:g.difficulty,cut:0,heroArmorCuts:true,red:false,redDamage:false,...g.options};
  const r=simulateV2(data,team,opts);
  const hold=simulateV2(data,team,{...opts,holding:{noDefeat:true}});
  const peak=Math.max(0,...hold.timeline.map(t=>t.count),...hold.checkpoints.map(c=>c.remaining));
  const sim={clear:r.clear,count:r.clear?r.remaining:null,failed:r.clear?null:`${r.failedRound}라 ${r.failedSecond}초`,rounds:hold.checkpoints.map(c=>c.remaining)};
  rows.push({id:g.id,label:g.label,actual:g.actual,sim,diff:g.actual.count!=null&&sim.count!=null?sim.count-g.actual.count:null});
}
for(const x of rows)console.log(x.id.padEnd(3),x.label.padEnd(34),'실제',x.actual.clear?`클 ${x.actual.count??'?'}`:'패','| 시뮬',x.sim.clear?`클 ${x.sim.count}`:`패 ${x.sim.failed}`,'| 라운드 끝',x.sim.rounds.join('/'),x.diff!=null?`| 차이 ${x.diff>0?'+':''}${x.diff}`:'');
const out=process.argv[2];if(out)writeFileSync(out,JSON.stringify({data:data.version,rows},null,1)+'\n');
