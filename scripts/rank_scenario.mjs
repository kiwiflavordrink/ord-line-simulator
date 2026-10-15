// Ranks physical carries in one fixed environment (docs/수정내역.md 23). Every assumption is listed in ENV.
// Usage: node scripts/rank_scenario.mjs [out.json] [--seeds=5] [--difficulty=신] [--dan=2] [--kkeut=1]
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
// 1.5 전설급 스턴 = 1.5 × 쿠마 폭군(L32, role "마뎀 · 스턴") stuns only, no damage. aps 5.72 (2.305, dist/resources/files/file-04.md),
// 우르스스 쇼크 마나 115 at +1 per attack [추정] → 600범위 1.05초; 발바닥 열매 10% → 500범위 1.4초. Bosses/frenzy 0.5× [추정].
const kumaAps=5.72;
const ENV={
  difficulty,positionModel:true,cut:201,red:true,redDamage:false,
  externalSlow:1.02,                                  // 풀이감: 신 기준 이감 102% (최저 이속)
  externalStuns:[
    {rate:1.5*kumaAps/115,radius:600,normal:1.05,hero:.525},
    {rate:1.5*.10*kumaAps,radius:500,normal:1.4,hero:.7}],
  singleControl
};
const carries=data.heroes.filter(h=>/물리/.test(h.focus)).map(h=>h.code);
const label=r=>r.clear?`클리어 ${r.remaining}`:`${r.failedRound}라 ${r.failedSecond}초 패배`;
const rows=[];
for(const code of carries){
  const byCount={};
  for(const count of [1,2,3]){
    const runs=seeds.map(seed=>simulateV2(data,[{code,count},{code:'H17',count:1}],{...ENV,deletion:{seed}}));
    const clears=runs.filter(r=>r.clear);
    byCount[count]={clearRate:clears.length/runs.length,
      avgRemaining:clears.length?clears.reduce((a,r)=>a+r.remaining,0)/clears.length:null,
      // progress for failures: seconds survived out of 192
      avgSurvived:runs.reduce((a,r)=>a+(r.clear?192:(r.failedRound-60)*32+r.failedSecond),0)/runs.length,
      runs:runs.map(label)};
  }
  const name=data.heroes.find(h=>h.code===code).name+' '+data.heroes.find(h=>h.code===code).grade;
  const minCount=[1,2,3].find(c=>byCount[c].clearRate>=.8)??null;
  rows.push({code,name,minCount,byCount});
}
// Rank: fewest copies that clear in ≥80% of seeds, then (at that count) fewer remaining, then longer survival at 1 copy.
const score=r=>[r.minCount??9,r.minCount?r.byCount[r.minCount].avgRemaining:99,-r.byCount[1].avgSurvived,-r.byCount[1].clearRate];
rows.sort((a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;});
console.log(`환경: ${difficulty}, 풀깍 ${ENV.cut}, 레드 공증만, 풀이감 ${ENV.externalSlow}, 쿠마 폭군 1.5기분 스턴, 아카이누 히든 1기, 단일 컨 ${dan}단(${singleControl.to15}초) ${kkeut}끝(${singleControl.finish}초), 시드 ${seeds.length}개`);
rows.forEach((r,i)=>console.log(`${String(i+1).padStart(2)} ${r.code.padEnd(5)} ${r.name.padEnd(12)} 최소 ${r.minCount??'4+'}기 | `+
  [1,2,3].map(c=>`${c}기 ${Math.round(r.byCount[c].clearRate*100)}% ${r.byCount[c].avgRemaining==null?'':'잔존 '+r.byCount[c].avgRemaining.toFixed(1)}`).join(' | ')));
if(outPath)writeFileSync(outPath,JSON.stringify({data:data.version,env:ENV,dan,kkeut,seeds,rows},null,1)+'\n');
