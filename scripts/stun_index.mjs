// Stun index per unit (수정내역 32): rate x duration x range weight from dist/data.json, 바르톨로메오 전설 = 1.
// Usage: node scripts/stun_index.mjs [singleWeight=0.25] [out.json]
import {readFileSync,writeFileSync} from 'node:fs';
const R=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const {SUPPORT_STUNS}=await import(R+'/dist/engine_v3.mjs');
const {SUPPORTS}=await import(R+'/dist/engine.mjs');
const data=JSON.parse(readFileSync(R+'/dist/data.json'));
const LOW=new Set(['흔함','안흔함','특별함']);
const W=Number(process.argv[2]??0.25);           // single-target weight vs a 550 area
const CAP=3;                                      // a stun longer than the gap to the next proc adds nothing
const cond=e=>{const t=[];
  if(e.on_approach)t.push('접근');else if(e.resource_cost)t.push(`${e.resource_kind==='hp'?'체력':'마나'}${e.resource_cost}`);
  else if(e.per_attack){const m=(e.rate_kind||'').match(/공격당 ([0-9.]+)/);t.push(m?`${+(Number(m[1])*100).toFixed(2)}%`:'매 공격');}
  else t.push('주기');
  if(e.target==='boss')t.push('보스만');else if(e.target==='frenzy')t.push('광폭만');else if(e.target==='target_special')t.push('보스·광폭만');
  else if(e.target==='single_line'||e.when_target==='line')t.push('라인만');
  return t.join('·');};
const rows=[];
const add=(code,name,grade,parts)=>{
  let line=0,boss=0;
  for(const p of parts){
    if(p.onlySpecial)continue;
    const w=p.single?W:(p.radius??550)/550;
    line+=Math.min(p.rate*p.normal,CAP)*w;
  }
  for(const p of parts)if(!p.onlyLine)boss+=Math.min(p.rate*p.hero,CAP);
  rows.push({code,name,grade,line,boss,parts});
};
for(const h of data.heroes){
  if(LOW.has(h.grade))continue;
  const ev=h.events.filter(e=>e.stun&&!e.on_approach);if(!ev.length)continue;
  add(h.code,h.name,h.grade,ev.map(e=>{const single=!!(e.stun.single||['single','single_line','boss','frenzy','target_special'].includes(e.target));
    return {cond:cond(e),rate:e.rate,single,radius:e.radius,normal:e.stun.normal,hero:e.stun.hero??e.stun.normal,
      onlySpecial:['boss','frenzy','target_special'].includes(e.target),onlyLine:e.target==='single_line'||e.when_target==='line'};}));
}
for(const [code,list] of Object.entries(SUPPORT_STUNS)){
  const aps=SUPPORTS[code].aps;
  add(code,{L7:'레일리',L23:'시키',D3:'퀸'}[code],code==='D3'?'왜곡됨':'전설',list.map(x=>({cond:x.on==='cast'?'시전':`${x.chance*100}%`,
    rate:x.on==='cast'?1/(SUPPORTS[code].cooldown??25):x.chance*aps,single:!!x.stun.single,radius:x.radius,normal:x.stun.normal,hero:x.stun.hero})));
}
const b=rows.find(r=>r.code==='L13');
for(const r of rows){r.lineIdx=r.line/b.line;r.bossIdx=r.boss/b.boss;}
rows.sort((a,b)=>b.lineIdx-a.lineIdx);
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(rows,null,1)+'\n');
const f=n=>n.toFixed(2);
console.log(`단일 가중 ${W}. 기준: 바르톨 전설 라인 ${f(b.line)}초/초, 보스·광폭 ${f(b.boss)}초/초`);
for(const c of ['L13','L4','L32','L23','H16','L37']){const r=rows.find(x=>x.code===c);console.log('  ',r.name,r.grade,'라인',f(r.lineIdx),'보스',f(r.bossIdx));}
