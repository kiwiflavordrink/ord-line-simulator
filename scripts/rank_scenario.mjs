// Ranks physical carries in one fixed environment (docs/수정내역.md 23). Every assumption is listed in ENV.
// Usage: node scripts/rank_scenario.mjs [out.json] [--seeds=5] [--difficulty=신] [--dan=2] [--kkeut=1]
//        [--stun=bartolomeo|dragon] [--stunUnits=1.5] [--cut=auto|<number>] [--role=physical|magic]
//        [--stack=zero|half|max|data] [--trait=on|off|data]
import {readFileSync,writeFileSync} from 'node:fs';
import {simulateV2} from '../dist/engine_v3.mjs';
import {referenceSingle,singleConditions} from '../dist/engine_single_v3.mjs';

const data=JSON.parse(readFileSync(new URL('../dist/data.json',import.meta.url)));
const arg=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.split('=')[1]??d;
const seeds=Array.from({length:Number(arg('seeds',5))},(_,i)=>202323+i);
const difficulty=arg('difficulty','신');
const outPath=process.argv.slice(2).find(a=>!a.startsWith('--'));

// 마딜 N단 M끝 + 단일 컨 (수정내역 24): two concurrent streams (engine option singleControl). 단 brings a mob to
// 15% in (루치 1기 100→15% 시간 / N); 끝 finishes a 15% mob in (핸콕 1기 15%→처치 시간 / M); line damage melts the rest.
// Times are measured with the single tester on the same difficulty (definition of 단·끝 in dist/engine_single_v3.mjs).
const dan=Number(arg('dan',2)),kkeut=Number(arg('kkeut',1));
const ref=referenceSingle({trials:3000,seed:202323,conditions:singleConditions(data,{difficulty})});
const singleControl={to15:+(ref.lucci.to15/dan).toFixed(2),finish:+(ref.hancock.finishFrom15/kkeut).toFixed(2)};
// N 전설급 스턴 (수정내역 25): user scale "바르톨로메오·드래곤 전설 = 1스턴" (쿠마 = 0.5). Stuns only, no damage.
// aps = 2.305 full upgrade (1 + min(gba1 + 20 x gmo1, 4)) / ua1c. Boss/frenzy duration 0.2x like 시키 전설's area stun [추정]
// (both 2.75 s stuns are trigger-cast in 2.305, no ahdu on record).
const STUN_UNITS={
  // L13 "배리어배리어열매 :: 공격시 10% 확률로 ▶ 550범위 … ▶ 해당 범위 2.75초 스턴", "배리어 피스트 :: 공격시 17% … 단일 적 … 0.5초 스턴"
  // 2.305 h02Z ua1c 0.71, R000 → 5.563/s; A09D AHbh adur 0.5 ahdu 0.25
  bartolomeo:{name:'바르톨로메오 전설',cut:12,stuns:aps=>[{rate:.10*aps,radius:550,normal:2.75,hero:.55},{rate:.17*aps,radius:0,normal:.5,hero:.25}],aps:5.563},
  // L4 "바람바람 열매 :: 공격시 10% 확률로 ▶ 500범위 … ▶ 해당 범위 2.75초 스턴"; 2.305 h02W ua1c 0.77, R000 → 5.130/s
  dragon:{name:'드래곤 전설',cut:10,stuns:aps=>[{rate:.10*aps,radius:500,normal:2.75,hero:.55}],aps:5.130}
};
const stunUnit=STUN_UNITS[arg('stun','bartolomeo')],stunUnits=Number(arg('stunUnits',1.5));
// 방깎 (수정내역 26, 사용자 기준 "단일을 짜면 방깎은 상위 유닛에 붙어 있는 깍만"): --cut=auto (default) = only the
// carry's own aura (2.323 buff_lines "방어력 감소 N"; the same aura counts once however many copies), no Red Force
// and no armor reduction from the stun/single units. Hero armor break and timed debuffs are modeled by the engine
// on top. --cut=201 = 풀깍 (then Red Force +35% is kept as before).
const units=new Map(JSON.parse(readFileSync(new URL('../dist/ordr_units.json',import.meta.url))).units.map(u=>[u.code,u]));
const auraCut=code=>{
  const u=units.get(code);if(!u)return 0;
  const text=[...(u.base_info?.buff_lines??[]),...(u.trait_info?.buff_lines??[])].join(' ');
  return Math.max(0,...[...text.matchAll(/방어력 감소 (\d+)/g)].map(m=>Number(m[1])));
};
const cutArg=arg('cut','auto');
const cutFor=code=>cutArg==='auto'?auraCut(code):Number(cutArg);
// 스택 단계·특강 (수정내역 28): data.json stack variants + option-based stacks (tr6Nutrients, e6AlabastaLevel, …).
const stack=arg('stack','data'),trait=arg('trait','data');
const stackOptions=stack==='data'?{}:Object.assign({},...(data.stack_options?.heroes??[]).map(h=>h.variants?.[stack]?.options??{}));
const ENV={
  ...(stack==='data'?{}:{stackLevel:stack}),...stackOptions,...(trait==='data'?{}:{trait}),
  difficulty,positionModel:true,red:cutArg!=='auto',redDamage:false,
  externalSlow:1.02,                                  // 풀이감: 신 기준 이감 102% (최저 이속)
  externalStuns:stunUnit.stuns(stunUnit.aps).map(x=>({...x,rate:x.rate*stunUnits})),
  singleControl
};
// --role=physical: focus contains 물리; --role=magic: focus contains 마법 (H17 is the fixed boss killer, excluded).
const role=arg('role','physical');
const carries=data.heroes.filter(h=>h.code!=='H17'&&(role==='magic'?/마법/:/물리/).test(h.focus)).map(h=>h.code);
const label=r=>r.clear?`클리어 ${r.remaining}`:`${r.failedRound}라 ${r.failedSecond}초 패배`;
const rows=[];
for(const code of carries){
  const byCount={};
  for(const count of [1,2,3]){
    const runs=seeds.map(seed=>simulateV2(data,[{code,count},{code:'H17',count:1}],{...ENV,cut:cutFor(code),deletion:{seed}}));
    const clears=runs.filter(r=>r.clear);
    byCount[count]={clearRate:clears.length/runs.length,
      avgRemaining:clears.length?clears.reduce((a,r)=>a+r.remaining,0)/clears.length:null,
      // progress for failures: seconds survived out of 192
      avgSurvived:runs.reduce((a,r)=>a+(r.clear?192:(r.failedRound-60)*32+r.failedSecond),0)/runs.length,
      runs:runs.map(label)};
  }
  const name=data.heroes.find(h=>h.code===code).name+' '+data.heroes.find(h=>h.code===code).grade;
  const minCount=[1,2,3].find(c=>byCount[c].clearRate>=.8)??null;
  rows.push({code,name,cut:cutFor(code),minCount,byCount});
}
// Rank: fewest copies that clear in ≥80% of seeds, then (at that count) fewer remaining, then longer survival at 1 copy.
const score=r=>[r.minCount??9,r.minCount?r.byCount[r.minCount].avgRemaining:99,-r.byCount[1].avgSurvived,-r.byCount[1].clearRate];
rows.sort((a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;});
console.log(`대상: ${role==='magic'?'마딜':'물딜'} ${carries.length}명. 스택 ${stack}, 특강 ${trait}. 환경: ${difficulty}, 방깎 ${cutArg==='auto'?'물딜 자기 오라만, 레드포스 없음':cutArg+', 레드 공증만'}, 풀이감 ${ENV.externalSlow}, ${stunUnit.name} ${stunUnits}기분 스턴, 아카이누 히든 1기, 단일 컨 ${dan}단(${singleControl.to15}초) ${kkeut}끝(${singleControl.finish}초), 시드 ${seeds.length}개`);
rows.forEach((r,i)=>console.log(`${String(i+1).padStart(2)} ${r.code.padEnd(5)} ${r.name.padEnd(12)} 방깎 ${String(r.cut).padStart(3)} 최소 ${r.minCount??'4+'}기 | `+
  [1,2,3].map(c=>`${c}기 ${Math.round(r.byCount[c].clearRate*100)}% ${r.byCount[c].avgRemaining==null?'':'잔존 '+r.byCount[c].avgRemaining.toFixed(1)}`).join(' | ')));
if(outPath)writeFileSync(outPath,JSON.stringify({data:data.version,role,stack,trait,env:ENV,dan,kkeut,seeds,rows},null,1)+'\n');
