// Stun leaks of the usual 2 stun units (+ 모비딕호 slow), 수정내역 33. Simulation: holding probe, share of in-zone
// line mobs stunned and the chance that a stun episode ends with the mob free for 1 s or more. Theory (random procs):
// leak after a stun = e^(-R), R = area stun procs per second; boss/frenzy free time = e^(-Σ rate x boss duration).
// Usage: node scripts/stun_leak.mjs [slowUnit=H6] [out.json] [--window=4,16] [--seeds=4]
import {readFileSync,writeFileSync} from 'node:fs';
import {simulateV2,SUPPORT_STUNS} from '../dist/engine_v3.mjs';
import {SUPPORTS} from '../dist/engine.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const pos=process.argv.slice(2).filter(a=>!a.startsWith('--')),flag=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.split('=')[1]??d;
const slowUnit=pos[0]??'H6',out=pos[1];
const windowSec=flag('window','4,16').split(',').map(Number),seeds=Array.from({length:Number(flag('seeds',4))},(_,i)=>i+1);
const STUN=['L4','L13','H16','L37','H11','L5','L23','H18','L17','H22','L32'];
const opt={positionModel:true,difficulty:'신',red:false,redDamage:false,holding:{radius:600,noDefeat:true,window:windowSec}};
const stunsOf=c=>{const h=data.heroes.find(h=>h.code===c);
  if(h)return h.events.filter(e=>e.stun&&!e.on_approach&&!['boss','frenzy','target_special'].includes(e.target)).map(e=>({rate:e.rate,
    single:!!(e.stun.single||['single','single_line'].includes(e.target)),normal:e.stun.normal,hero:e.stun.hero??e.stun.normal}));
  return SUPPORT_STUNS[c].map(x=>({rate:x.on==='cast'?1/25:x.chance*SUPPORTS[c].aps,single:!!x.stun.single,normal:x.stun.normal,hero:x.stun.hero}));};
const name=c=>{const h=data.heroes.find(h=>h.code===c);return h?h.name+(h.grade==='히든'?'(히)':''):{L23:'시키'}[c];};
const rows=[];
for(let i=0;i<STUN.length;i++)for(let j=i;j<STUN.length;j++){
  const pair=[STUN[i],STUN[j]],st=[...stunsOf(pair[0]),...stunsOf(pair[1])],area=st.filter(s=>!s.single);
  const R=area.reduce((a,s)=>a+s.rate,0),S=area.reduce((a,s)=>a+s.rate*s.normal,0),B=st.reduce((a,s)=>a+s.rate*s.hero,0);
  const cnt={};[...pair,slowUnit].forEach(c=>cnt[c]=(cnt[c]??0)+1);
  const team=Object.entries(cnt).map(([code,count])=>({code,count}));
  const rs=seeds.map(seed=>simulateV2(data,team,{...opt,controlOnly:Object.keys(cnt),deletion:{seed}}).holding);
  const a=k=>rs.reduce((x,r)=>x+r[k],0)/rs.length;
  rows.push({pair,procsPerSec:R,theoryFree:Math.exp(-S),theoryLeak:Math.exp(-R),theoryBossFree:Math.exp(-B),
    simStunned:a('stunnedShare'),simLeak:a('leakChance'),inZone:a('inZone'),piled:a('piled')});
}
rows.sort((a,b)=>a.simLeak-b.simLeak);
const p=x=>(x*100).toFixed(0).padStart(3)+'%';
console.log(`창 ${windowSec.join('~')}초, 시드 ${seeds.length}. 이감 ${name(slowUnit)} 포함. 시뮬: 스턴 유지 / 스턴 끝난 뒤 1초 이상 샐 확률 | 이론: 라인 샐 확률 e^-R, 라인 무스턴 시간, 보스·광폭 무스턴 시간`);
for(const r of rows)console.log(`시뮬 유지${p(r.simStunned)} 샘${p(r.simLeak)} | 이론 샘${p(r.theoryLeak)} 무스턴${p(r.theoryFree)} 보스무스턴${p(r.theoryBossFree)} | 범위안 ${r.inZone.toFixed(1)} | ${r.pair.map(name).join(' + ')}`);
if(out)writeFileSync(out,JSON.stringify({slowUnit,window:windowSec,seeds:seeds.length,rows},null,1)+'\n');
