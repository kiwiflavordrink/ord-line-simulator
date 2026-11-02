// 수정내역 96: 에그헤드(스토리 14단계) 딜량 표 — 전설급 이상 모든 유닛을 1기씩, 자기 방깎만(혼자 시뮬), 난이도(신·악몽) ×
// 오로성(없음·나스쥬로·워큐리·새턴)별로 잰다. 계산은 dist/story.mjs storyDps(엔진)만 쓴다. 결과는 dist/egghead_dps.json
// (오버레이 상황 추천이 읽는다). 사용: node scripts/egghead_dps.mjs
import fs from 'node:fs';
import {storyDps} from '../dist/story.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../dist/data.json',import.meta.url),'utf8'));
const GRADES=new Set(['전설','히든','초월함','불멸의','영원한','제한됨','신비함','변화','왜곡됨','세라핌']);
const GORO=['없음','나스쥬로','워큐리','새턴'],DIFFS=['신','악몽'];
const units={};let n=0;const t0=Date.now();
for(const h of data.heroes){
  if(!GRADES.has(h.grade))continue;
  const row={};
  for(const dif of DIFFS){row[dif]={};for(const g of GORO){
    let v=null;try{v=Math.round(storyDps(data,[{code:h.code,count:1}],14,{difficulty:dif,gorosei:g==='없음'?null:g}));}catch(e){v=null;}
    row[dif][g]=v;}}
  units[h.code]={name:h.name,grade:h.grade,...row};n++;
}
const out={version:data.version??null,note:'수정내역 96: 에그헤드(14단계) 1인 체력, 240초, 1기 혼자(자기 방깎만), 최대 업그레이드, 레드포스 없음. 값 = 초당 피해. 처치하면 체력÷처치 시간. 엔진 근사(시뮬레이터 결과)이며 게임 실측 아님.',
  difficulties:DIFFS,gorosei:GORO,units};
fs.writeFileSync(new URL('../dist/egghead_dps.json',import.meta.url),JSON.stringify(out,null,0).replace(/\},"/g,'},\n"'));
console.log(`egghead_dps: ${n} units, ${((Date.now()-t0)/1000).toFixed(1)} s`);
