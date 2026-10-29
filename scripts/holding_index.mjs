// Holding per unit (수정내역 33): each rare+ unit with a stun or a slow, alone and control-only (no damage, no
// defeat), position model, 신. Line mobs within `radius` of the units during 60라 4–16 s (the stream before the
// first lap returns): count, share, mean gap along the path, gap CV, piled share (gaps < 25).
// Usage: node scripts/holding_index.mjs [radius=600] [out.json] [--base=TR16,E9]
import {readFileSync,writeFileSync} from 'node:fs';
import {simulateV2,SUPPORT_STUNS} from '../dist/engine_v3.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const radius=Number(process.argv[2]??600),out=process.argv.slice(3).find(a=>!a.startsWith('--'));
const base=(process.argv.find(a=>a.startsWith('--base='))?.slice(7).split(',').filter(Boolean)??[]).map(code=>({code}));
const LOW=new Set(['흔함','안흔함','특별함']);
const opt={positionModel:true,difficulty:'신',red:false,redDamage:false,holding:{radius,noDefeat:true,window:[4,16]}};
const measure=team=>{
  const rs=[1,2].map(seed=>simulateV2(data,team,{...opt,controlOnly:team.map(t=>t.code),deletion:{seed}}).holding);
  const avg=k=>rs.reduce((a,r)=>a+r[k],0)/rs.length;
  return {inZone:avg('inZone'),share:avg('share'),gapMean:avg('gapMean'),gapCV:avg('gapCV'),piled:avg('piled')};
};
const ref=measure(base.length?base:[{code:'H17',damage:false}]);
const rows=[];
const cands=data.heroes.filter(h=>!LOW.has(h.grade)&&(h.events.some(e=>e.stun)||h.enemy_slow_auras?.length)).map(h=>h.code)
  .concat(Object.keys(SUPPORT_STUNS));
for(const code of cands){
  const h=data.heroes.find(x=>x.code===code);
  const r=measure([...base,{code}]);
  rows.push({code,name:h?.name??{L7:'레일리',L23:'시키',D3:'퀸'}[code],grade:h?.grade??(code==='D3'?'왜곡됨':'전설'),
    slow:(h?.enemy_slow_auras??[]).reduce((a,x)=>a+x.value,0),...r});
}
rows.sort((a,b)=>b.share-a.share||a.piled-b.piled);
console.log(`반경 ${radius}, 기준(${base.map(b=>b.code).join('+')||'제어 없음'}): 범위 안 ${ref.inZone.toFixed(1)} (${(ref.share*100).toFixed(0)}%), 간격 ${ref.gapMean.toFixed(0)}, 겹침 ${(ref.piled*100).toFixed(0)}%`);
for(const r of rows)console.log(`${(r.share*100).toFixed(0).padStart(4)}% ${r.inZone.toFixed(1).padStart(5)} 간격 ${r.gapMean.toFixed(0).padStart(4)} CV ${r.gapCV.toFixed(2)} 겹침 ${(r.piled*100).toFixed(0).padStart(3)}% 이감 ${Math.round(r.slow*100).toString().padStart(3)}% ${r.code.padEnd(5)} ${r.name} ${r.grade}`);
if(out)writeFileSync(out,JSON.stringify({radius,base:base.map(b=>b.code),ref,rows},null,1)+'\n');
