// Holding of the usual control set (수정내역 33): 2 legend-grade stun units + 1 slow unit, control only.
// Usage: node scripts/holding_trios.mjs [radius=600] [out.json]
import {readFileSync,writeFileSync} from 'node:fs';
import {simulateV2} from '../dist/engine_v3.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const idx=JSON.parse(readFileSync(new URL('../docs/results/32_stun_index.json',import.meta.url)));
const radius=Number(process.argv[2]??600),out=process.argv[3];
// tmo.gg "[스턴]" units and the slow units most used in real 신 clears (ORD_JHelper Data/tmo-clear-samples.json).
const STUN=['L4','L13','H16','L37','H11','L5','L23','H18','L17','H22','L32'];
const SLOW=['H6','L20','L3','H12','L35','L6','L11','L18'];
const opt={positionModel:true,difficulty:'신',red:false,redDamage:false,holding:{radius,noDefeat:true,window:[4,16]}};
const name=c=>{const h=data.heroes.find(h=>h.code===c);return h?h.name+(h.grade==='히든'?'(히)':''):({L23:'시키',L7:'레일리',D3:'퀸'}[c]??c);};
const slowOf=codes=>{const by=new Map();for(const c of codes)for(const a of data.heroes.find(h=>h.code===c)?.enemy_slow_auras??[])by.set(a.id,Math.max(by.get(a.id)??0,a.value));return [...by.values()].reduce((a,v)=>a+v,0);};
const stunOf=codes=>codes.reduce((a,c)=>a+(idx.find(r=>r.code===c)?.lineIdx??0),0);
const rows=[];
for(let i=0;i<STUN.length;i++)for(let j=i;j<STUN.length;j++)for(const sl of SLOW){
  const codes=[STUN[i],STUN[j],sl];const cnt={};codes.forEach(c=>cnt[c]=(cnt[c]??0)+1);
  const team=Object.entries(cnt).map(([code,count])=>({code,count}));
  const rs=[1,2].map(seed=>simulateV2(data,team,{...opt,controlOnly:Object.keys(cnt),deletion:{seed}}).holding);
  const a=k=>rs.reduce((x,r)=>x+r[k],0)/rs.length;
  rows.push({stun:[STUN[i],STUN[j]],slowUnit:sl,slow:slowOf(codes),stunIdx:stunOf(codes),inZone:a('inZone'),share:a('share'),gapMean:a('gapMean'),gapCV:a('gapCV'),piled:a('piled')});
}
rows.sort((a,b)=>b.inZone-a.inZone||a.piled-b.piled);
const line=r=>`${r.inZone.toFixed(1).padStart(5)}기 겹침 ${(r.piled*100).toFixed(0).padStart(3)}% 간격 ${r.gapMean.toFixed(0).padStart(3)} | 이감 ${Math.round(r.slow*100)}% 스턴 ${r.stunIdx.toFixed(2)} | ${r.stun.map(name).join(' + ')} / ${name(r.slowUnit)}`;
console.log(`반경 ${radius}, ${rows.length}조합. 범위 안 몹 많은 순:`);rows.slice(0,15).forEach(r=>console.log(line(r)));
console.log('겹침 35% 이하(고른 직선) 중 범위 안 몹 많은 순:');rows.filter(r=>r.piled<=.35).slice(0,15).forEach(r=>console.log(line(r)));
if(out)writeFileSync(out,JSON.stringify({radius,rows},null,1)+'\n');
