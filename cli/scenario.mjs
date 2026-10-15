// Scenario validation and execution for the ordsim CLI.
// The calculation itself lives only in dist/: this module validates input,
// calls simulateV2 / simulateSingle / damageContext unchanged, and reshapes
// their return values into a stable JSON report. No damage formula is copied here.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SUPPORTS} from '../dist/engine.mjs';
import {simulateV2,DELETERS,CONDITIONAL_UNITS} from '../dist/engine_v3.mjs';
import {SINGLE_MOB,SINGLE_UNITS,simulateSingle,referenceSingle} from '../dist/engine_single_v3.mjs';
import {EFFECTS,damageContext} from '../dist/v3_effects.mjs';

export const TOOL={name:'ordsim',version:'1.0.0'};
export const DATA_URL=new URL('../dist/data.json',import.meta.url);
export const ENGINES={
  line:'dist/engine_v3.mjs#simulateV2',
  single:'dist/engine_single_v3.mjs#simulateSingle',
  context:'dist/v3_effects.mjs#damageContext'
};
const ROUNDS=[60,61,62,63,64,65];
const DEFEAT_THRESHOLD=55;
const SINGLE_BY_CODE=new Map(SINGLE_UNITS.map(u=>[u.code,u]));
const EFFECT_CODES=new Set(EFFECTS.map(e=>e.code));

export const LIMITATIONS=[
  {id:'map-2305-approximation',text:'몹 HP·방어, 영웅 공격력·공속은 2.305 맵 추출값이고 스킬 수치는 2.323 ORDR 카드 설명을 얹은 근사다. 2.323 원본 스크립트를 실행 검증한 결과가 아니다.'},
  {id:'heroes-not-registered',text:'라인 계산은 dist/data.json에 등록된 물리 중심·물리·마법 혼합 상위 영웅 31명과 보조 4종(L7·L23·L25·D3), 조건형 3종(I8·TR28·H15), 삭제 3종(L12·D4·L19)만 지원한다. 그 밖의 상위 영웅은 미등록이며 임의 수치를 만들지 않는다.'},
  {id:'single-units-limited',text:'65라 단일 테스터는 엔진에 정의된 단일·끝딜 유닛 10종만 지원한다.'},
  {id:'no-stun-or-movement',text:'스턴·슬로우 등 제어 효과, 몹 이동 경로와 위치, 사거리는 구현되지 않았다(써니호 스턴은 line.control에 시간만 집계하고 판정에는 쓰지 않는다). 범위 피해는 coverage(범위 적중률)로 근사하고 타깃은 보스·광폭이 있으면 그쪽, 없으면 가장 먼저 나온 몹이다.'},
  {id:'resource-start',text:'자원은 60라 시작 시 1회 만충 후 연속으로 쌓인다(2.305 맵에 라운드 시작 마나 회복 없음). line.options.resourceMode로 empty·perRound(이전 모델)를 고를 수 있다.'},
  {id:'unmodeled-effects',text:'아직 계산하지 않는 툴팁 효과: 스턴·이동, 아군 공격력·공속 오라와 대상 지정 버프(I4·I11·E5·Z6 등), 소환수 크리티컬(TR30 아틀라스·E5 거인족), Z10 처형·참수, TR19 먹깨비 처형, I4 카무사리, 프랑키 장군. 목록과 근거는 docs/수정내역.md.'},
  {id:'expected-value-procs',text:'확률 스킬·아머브레이크·처형은 발동 기대값으로 매 0.1초 나누어 적용한다. 실제 발동 순서와 운에 따른 편차는 없다.'},
  {id:'effects-always-on',text:'context.selected의 증폭·마방 감소 효과는 대상에 계속 붙어 있다고 가정한다. 발동 확률, 지속시간, 범위·대상 조건을 자동 판정하지 않는다.'},
  {id:'amp-combination-order',text:'서로 다른 저항·증폭 단계(A04Q 마방, A04R 마법 증폭, 모든 피해 증폭)의 결합 순서는 실측되지 않아 곱셈으로 가정한다.'},
  {id:'line-damage-scope',text:'line.damage의 피해량은 라인 일반몹에 실제로 들어간 양(초과 피해 제외)만 집계한다. 보스·광폭에 들어간 피해량은 엔진이 집계하지 않으므로 처치 여부와 처치 시각으로만 보고한다.'},
  {id:'not-a-clear-guarantee',text:'clear는 모델상 55기 미만 유지 여부이며 실제 게임 클리어를 보장하지 않는다.'}
];

export function loadData(url=DATA_URL){
  const raw=readFileSync(url);
  return {data:JSON.parse(raw),sha256:createHash('sha256').update(raw).digest('hex')};
}

export function supportedUnits(data){
  return {
    dataVersion:data.version,
    line:{
      heroes:data.heroes.map(h=>({code:h.code,name:h.name,grade:h.grade,focus:h.focus})),
      supports:Object.entries(SUPPORTS).map(([code,s])=>({code,name:s.name})),
      deleters:Object.entries(DELETERS).map(([code,d])=>({code,name:d.name})),
      conditional:Object.entries(CONDITIONAL_UNITS).map(([code,c])=>({code,name:c.name})),
      custom:[{code:'MAGIC_CUSTOM',name:'사용자 정의 범위 마법 (line.options.customMagic 사용)'}]
    },
    single:SINGLE_UNITS.map(u=>({code:u.code,name:u.name,role:u.role})),
    effects:EFFECTS.map(e=>({code:e.code,name:e.name,kind:e.kind,value:e.value}))
  };
}

// ---------- validation ----------
class Issues{
  constructor(){this.errors=[];this.warnings=[];}
  error(path,code,message){this.errors.push({path,code,message});}
  warn(path,message){this.warnings.push({path,message});}
}
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function onlyKeys(obj,allowed,path,is){
  for(const k of Object.keys(obj))if(!allowed.includes(k))
    is.error(`${path}.${k}`,'UNKNOWN_KEY',`알 수 없는 항목입니다. 허용: ${allowed.join(', ')}`);
}
function num(obj,key,path,is,{min,max,integer=false}){
  if(obj[key]===undefined)return undefined;
  const v=obj[key];
  if(typeof v!=='number'||!Number.isFinite(v)){is.error(`${path}.${key}`,'NOT_A_NUMBER','숫자여야 합니다.');return undefined;}
  if(integer&&!Number.isInteger(v)){is.error(`${path}.${key}`,'NOT_AN_INTEGER','정수여야 합니다.');return undefined;}
  if(v<min||v>max){is.error(`${path}.${key}`,'OUT_OF_RANGE',`${min}~${max} 범위여야 합니다. (입력 ${v})`);return undefined;}
  return v;
}
function bool(obj,key,path,is){
  if(obj[key]===undefined)return undefined;
  if(typeof obj[key]!=='boolean'){is.error(`${path}.${key}`,'NOT_A_BOOLEAN','true 또는 false여야 합니다.');return undefined;}
  return obj[key];
}
function oneOf(obj,key,path,is,values){
  if(obj[key]===undefined)return undefined;
  if(!values.includes(obj[key])){is.error(`${path}.${key}`,'INVALID_VALUE',`${values.join(', ')} 중 하나여야 합니다.`);return undefined;}
  return obj[key];
}
// Copies only defined values so omitted fields keep the engine's own defaults.
const compact=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));

function unsupportedMessage(code,data,where){
  const hints=[];
  if(where==='line'&&SINGLE_BY_CODE.has(code))hints.push('이 코드는 single.team(65라 단일 테스터)에서만 지원됩니다.');
  if(where==='single'&&(data.heroes.some(h=>h.code===code)||SUPPORTS[code]||DELETERS[code]||CONDITIONAL_UNITS[code]))hints.push('이 코드는 line.team(60~65라 조합)에서만 지원됩니다.');
  if(EFFECT_CODES.has(code))hints.push('증폭·마방 감소 효과로는 context.selected에 넣을 수 있습니다.');
  const base=where==='line'
    ?`미지원: '${code}'는 현재 data.json(${data.version})과 라인 엔진에 등록되지 않은 유닛입니다. 임의 수치를 만들지 않습니다.`
    :`미지원: '${code}'는 65라 단일 테스터 엔진에 등록되지 않은 유닛입니다. 임의 수치를 만들지 않습니다.`;
  return [base,...hints].join(' ');
}

function validateContext(raw,is){
  if(raw===undefined)return {};
  if(!isObj(raw)){is.error('context','NOT_AN_OBJECT','객체여야 합니다.');return {};}
  onlyKeys(raw,['selected','customMagicAmp','customMagicCut','customAllAmp','customExplosiveAmp','warcury'],'context',is);
  const out={};
  if(raw.selected!==undefined){
    if(!Array.isArray(raw.selected))is.error('context.selected','NOT_AN_ARRAY','효과 코드 배열이어야 합니다.');
    else{
      raw.selected.forEach((c,i)=>{if(!EFFECT_CODES.has(c))is.error(`context.selected[${i}]`,'UNKNOWN_EFFECT',`알 수 없는 효과 코드 '${c}'입니다. --list-units로 effects 목록을 확인하세요.`);});
      if(new Set(raw.selected).size!==raw.selected.length)is.warn('context.selected','중복된 효과 코드는 한 번만 적용됩니다.');
      out.selected=[...new Set(raw.selected)];
    }
  }
  for(const k of ['customMagicAmp','customMagicCut','customAllAmp','customExplosiveAmp'])
    out[k]=num(raw,k,'context',is,{min:0,max:500});
  out.warcury=bool(raw,'warcury','context',is);
  return compact(out);
}

function validateLine(raw,data,is){
  if(!isObj(raw)){is.error('line','NOT_AN_OBJECT','객체여야 합니다.');return null;}
  onlyKeys(raw,['team','options'],'line',is);
  const heroCodes=new Set(data.heroes.map(h=>h.code));
  const team=[];
  if(!Array.isArray(raw.team)||!raw.team.length)is.error('line.team','EMPTY_TEAM','유닛을 한 기 이상 넣은 배열이어야 합니다.');
  else raw.team.forEach((item,i)=>{
    const p=`line.team[${i}]`;
    if(!isObj(item)){is.error(p,'NOT_AN_OBJECT','{"code": "...", "count": 1} 형식이어야 합니다.');return;}
    onlyKeys(item,['code','count','damage','ab'],p,is);
    if(typeof item.code!=='string'||!item.code){is.error(`${p}.code`,'MISSING_CODE','유닛 코드 문자열이 필요합니다.');return;}
    const known=heroCodes.has(item.code)||SUPPORTS[item.code]||DELETERS[item.code]||CONDITIONAL_UNITS[item.code]||item.code==='MAGIC_CUSTOM';
    if(!known){is.error(`${p}.code`,'UNSUPPORTED_UNIT',unsupportedMessage(item.code,data,'line'));return;}
    const count=num(item,'count',p,is,{min:1,max:6,integer:true});
    const damage=bool(item,'damage',p,is),ab=bool(item,'ab',p,is);
    if(ab!==undefined&&!SUPPORTS[item.code])is.warn(`${p}.ab`,'ab(암브)는 보조 유닛(L7·L23·L25·D3)에만 의미가 있어 무시됩니다.');
    team.push(compact({code:item.code,count:count??1,damage,ab}));
  });

  const o=raw.options??{};
  const options={};
  if(!isObj(o))is.error('line.options','NOT_AN_OBJECT','객체여야 합니다.');
  else{
    onlyKeys(o,['cut','coverage','red','redDamage','fullResource','resourceMode','summons','frankyAura','sunnyStagger','tr19Plants','buffTargets','customMagic','finisher','deletion'],'line.options',is);
    Object.assign(options,compact({
      cut:num(o,'cut','line.options',is,{min:0,max:300}),
      coverage:num(o,'coverage','line.options',is,{min:0,max:1}),
      red:bool(o,'red','line.options',is),
      redDamage:bool(o,'redDamage','line.options',is),
      fullResource:bool(o,'fullResource','line.options',is),
      resourceMode:oneOf(o,'resourceMode','line.options',is,['start','empty','perRound']),
      summons:bool(o,'summons','line.options',is),
      frankyAura:bool(o,'frankyAura','line.options',is),
      sunnyStagger:bool(o,'sunnyStagger','line.options',is)
    }));
    if(o.buffTargets!==undefined){
      const b=o.buffTargets,p='line.options.buffTargets';
      if(!isObj(b))is.error(p,'NOT_AN_OBJECT','{"버프 유닛 코드": ["받는 유닛 코드", ...]} 형식이어야 합니다.');
      else{
        for(const [src,list] of Object.entries(b)){
          if(!Array.isArray(list)||list.some(x=>typeof x!=='string'))is.error(`${p}.${src}`,'NOT_AN_ARRAY','받는 유닛 코드 배열이어야 합니다.');
        }
        options.buffTargets=b;
      }
    }
    if(o.tr19Plants!==undefined){
      const t=o.tr19Plants,p='line.options.tr19Plants';
      if(!isObj(t))is.error(p,'NOT_AN_OBJECT','객체여야 합니다.');
      else{
        onlyKeys(t,['pea','snow','muk'],p,is);
        options.tr19Plants=compact({pea:num(t,'pea',p,is,{min:0,max:3,integer:true}),
          snow:num(t,'snow',p,is,{min:0,max:3,integer:true}),muk:num(t,'muk',p,is,{min:0,max:3,integer:true})});
        const total=Object.values(options.tr19Plants).reduce((a,b)=>a+b,0);
        if(total>3)is.error(p,'TOO_MANY_PLANTS',`식물은 최대 3기입니다. (입력 ${total}기)`);
      }
    }
    if(o.customMagic!==undefined){
      const c=o.customMagic,p='line.options.customMagic';
      if(!isObj(c))is.error(p,'NOT_AN_OBJECT','객체여야 합니다.');
      else{
        onlyKeys(c,['aps','chance','flat','maxPct','currentPct','lostPct'],p,is);
        options.customMagic=compact({aps:num(c,'aps',p,is,{min:0,max:100}),chance:num(c,'chance',p,is,{min:0,max:1}),
          flat:num(c,'flat',p,is,{min:0,max:1e10}),maxPct:num(c,'maxPct',p,is,{min:0,max:1}),
          currentPct:num(c,'currentPct',p,is,{min:0,max:1}),lostPct:num(c,'lostPct',p,is,{min:0,max:1})});
      }
    }
    if(o.finisher!==undefined){
      const f=o.finisher,p='line.options.finisher';
      if(!isObj(f))is.error(p,'NOT_AN_OBJECT','객체여야 합니다.');
      else{
        onlyKeys(f,['mode','interval','successChance','damageType','flat','maxPct','currentPct','lostPct'],p,is);
        options.finisher=compact({mode:oneOf(f,'mode',p,is,['off','damage']),interval:num(f,'interval',p,is,{min:.5,max:60}),
          successChance:num(f,'successChance',p,is,{min:0,max:1}),damageType:oneOf(f,'damageType',p,is,['magic','physical','fixed','explosive']),
          flat:num(f,'flat',p,is,{min:0,max:1e10}),maxPct:num(f,'maxPct',p,is,{min:0,max:1}),
          currentPct:num(f,'currentPct',p,is,{min:0,max:1}),lostPct:num(f,'lostPct',p,is,{min:0,max:1})});
        if(f.mode!=='damage'&&Object.keys(f).some(k=>k!=='mode'))is.warn(p,'finisher.mode가 "damage"가 아니면 마무리 설정은 계산에 쓰이지 않습니다.');
      }
    }
    if(o.deletion!==undefined){
      const d=o.deletion,p='line.options.deletion';
      if(!isObj(d))is.error(p,'NOT_AN_OBJECT','객체여야 합니다.');
      else{
        const keys=['seed',...Object.keys(DELETERS).flatMap(c=>[`${c}Cooldown`,`${c}Proc`])];
        onlyKeys(d,keys,p,is);
        const out={seed:num(d,'seed',p,is,{min:0,max:2147483647,integer:true})};
        for(const c of Object.keys(DELETERS)){
          out[`${c}Cooldown`]=num(d,`${c}Cooldown`,p,is,{min:.1,max:300});
          out[`${c}Proc`]=num(d,`${c}Proc`,p,is,{min:0,max:1});
        }
        options.deletion=compact(out);
      }
    }
  }
  if(team.some(t=>t.code==='MAGIC_CUSTOM')&&!(options.customMagic?.flat||options.customMagic?.maxPct||options.customMagic?.currentPct||options.customMagic?.lostPct))
    is.warn('line.options.customMagic','MAGIC_CUSTOM이 있지만 피해 수치(flat·maxPct·currentPct·lostPct)가 모두 0이라 피해를 주지 않습니다.');
  return {team,options};
}

function validateSingle(raw,data,is){
  if(!isObj(raw)){is.error('single','NOT_AN_OBJECT','객체여야 합니다.');return null;}
  onlyKeys(raw,['team','trials','seed','reference'],'single',is);
  const team=[];
  if(!Array.isArray(raw.team)||!raw.team.length)is.error('single.team','EMPTY_TEAM','유닛을 한 기 이상 넣은 배열이어야 합니다.');
  else raw.team.forEach((item,i)=>{
    const p=`single.team[${i}]`;
    if(!isObj(item)){is.error(p,'NOT_AN_OBJECT','{"code": "...", "count": 1} 형식이어야 합니다.');return;}
    onlyKeys(item,['code','count'],p,is);
    if(typeof item.code!=='string'||!item.code){is.error(`${p}.code`,'MISSING_CODE','유닛 코드 문자열이 필요합니다.');return;}
    if(!SINGLE_BY_CODE.has(item.code)){is.error(`${p}.code`,'UNSUPPORTED_UNIT',unsupportedMessage(item.code,data,'single'));return;}
    const count=num(item,'count',p,is,{min:1,max:12,integer:true});
    team.push({code:item.code,count:count??1});
  });
  const total=team.reduce((n,t)=>n+t.count,0);
  if(total>12)is.error('single.team','TOO_MANY_UNITS',`단일 테스터는 한 번에 최대 12기까지 계산합니다. (입력 ${total}기)`);
  return {team,
    trials:num(raw,'trials','single',is,{min:100,max:20000,integer:true})??3000,
    seed:num(raw,'seed','single',is,{min:0,max:2147483647,integer:true})??202323,
    reference:bool(raw,'reference','single',is)??true};
}

export function validateScenario(raw,data){
  const is=new Issues();
  if(!isObj(raw)){is.error('$','NOT_AN_OBJECT','시나리오는 JSON 객체여야 합니다.');return {...is,scenario:null};}
  onlyKeys(raw,['name','description','context','line','single','output'],'$',is);
  for(const k of ['name','description'])if(raw[k]!==undefined&&typeof raw[k]!=='string')is.error(k,'NOT_A_STRING','문자열이어야 합니다.');
  if(raw.line===undefined&&raw.single===undefined)is.error('$','NOTHING_TO_RUN','line(60~65라 조합)과 single(65라 단일 테스터) 중 하나 이상이 필요합니다.');
  const scenario={name:raw.name??null,description:raw.description??null,context:validateContext(raw.context,is)};
  if(raw.line!==undefined)scenario.line=validateLine(raw.line,data,is);
  if(raw.single!==undefined)scenario.single=validateSingle(raw.single,data,is);
  scenario.output={timeline:false};
  if(raw.output!==undefined){
    if(!isObj(raw.output))is.error('output','NOT_AN_OBJECT','객체여야 합니다.');
    else{onlyKeys(raw.output,['timeline'],'output',is);scenario.output.timeline=bool(raw.output,'timeline','output',is)??false;}
  }
  return {errors:is.errors,warnings:is.warnings,scenario};
}

// ---------- execution ----------
// Same mapping v3.mjs options() uses: one damageContext feeds both engines.
export function lineEngineOptions(options,ctx){
  const red=options.red;
  return {
    ...options,
    ...(red!==undefined&&options.redDamage===undefined?{redDamage:red}:{}),
    magicReduction:ctx.magicCut/100,magicAmp:ctx.magicAmp/100,allAmp:ctx.allAmp/100,
    explosiveAmp:ctx.generalExplosiveAmp/100,normalOnlyExplosiveAmp:ctx.normalOnlyExplosiveAmp/100,
    warcury:ctx.warcury
  };
}

function lineReport(r,data,includeTimeline){
  const byRound=new Map(r.checkpoints.map(c=>[c.round,c]));
  const rounds=ROUNDS.map(round=>{
    const key=String(round),c=byRound.get(round);
    const special=data.boss[key]?{type:'boss',hp:data.boss[key][0],armor:data.boss[key][1]}
      :data.frenzy[key]?{type:'frenzy',hp:data.frenzy[key],armor:data.rounds[key][1]+5}:null;
    const reached=round<=(r.failedRound??65);
    const base={round,mobHp:data.rounds[key][0],mobArmor:data.rounds[key][1],reached,completed:!!c};
    if(!c&&round===r.failedRound)return {...base,remaining:r.remaining,lineRemaining:r.lineRemaining,failedSecond:r.failedSecond,
      special:special&&{...special,result:'unknown_round_failed',killed:null,killSecond:null}};
    if(!c)return {...base,special:special&&{...special,result:reached?'unknown_round_failed':'not_reached',killed:null,killSecond:null}};
    return {...base,remaining:c.remaining,lineRemaining:c.lineRemaining,
      priorRoundRemaining:c.priorRoundRemaining,currentRoundRemaining:c.currentRoundRemaining,
      averageAb:c.averageAb,
      special:special&&{...special,result:c.specialKillSecond!=null?'killed':'survived',
        killed:c.specialKillSecond!=null,killSecond:c.specialKillSecond}};
  });
  const lineTotal=Object.values(r.sourceDamage).reduce((a,b)=>a+b,0);
  return {
    clear:r.clear,
    verdict:r.clear?'65라 종료까지 55기 미만 유지':`${r.failedRound}라 ${r.failedSecond}초에 55기 도달`,
    failedRound:r.failedRound,failedSecond:r.failedSecond,defeatThreshold:DEFEAT_THRESHOLD,
    final:{remaining:r.remaining,lineRemaining:r.lineRemaining,averageAb:r.averageAb},
    rounds,
    specials:rounds.filter(x=>x.special).map(x=>({round:x.round,...x.special})),
    damage:{
      scope:'라인 일반몹에 실제 적용된 피해(초과 피해 제외). 보스·광폭 피해는 미집계.',
      lineTotal,
      byCategory:r.lineDamage,
      bySource:r.sourceDamage
    },
    totals:{lineSpawned:r.totalLineSpawned,lineKilled:r.totalLineKilled,unitCount:r.unitCount},
    finisher:{attempts:r.finisherAttempts,kills:r.finisherKills},
    deletions:r.deleteCounts,
    executions:r.executeCounts,
    control:r.control,
    buffs:r.buffs,
    applied:{cut:r.cut,coverage:r.coverage,magicFactor:r.magicFactor,resourceMode:r.resourceMode},
    ...(includeTimeline?{timeline:r.timeline}:{})
  };
}

function singleReport(r,refs){
  const out={
    target:{...SINGLE_MOB,description:'65라 일반몹 한 기 (2.305)'},
    team:r.team,count:r.count,trials:r.trials,seed:r.seed,
    to15Seconds:r.to15,killSeconds:r.kill,finishFrom15Seconds:r.finishFrom15,
    remainingAt3:r.remainingAt3,remainingAt3Pct:r.remainingAt3/SINGLE_MOB.hp,
    damageBy3Seconds:SINGLE_MOB.hp-r.remainingAt3
  };
  if(refs)out.reference={
    lucci:{to15Seconds:refs.lucci.to15},hancock:{finishFrom15Seconds:refs.hancock.finishFrom15},
    danRatio:refs.lucci.to15/r.to15,endRatio:refs.hancock.finishFrom15/r.finishFrom15,
    note:'단 = 루치 1기 100→15% 시간 ÷ 이 조합 시간, 끝 = 핸콕 1기 15%→처치 시간 ÷ 이 조합 시간'
  };
  return out;
}

export function runScenario(scenario,{data,sha256},warnings=[]){
  const ctx=damageContext(scenario.context);
  const warn=[...warnings];
  if(ctx.magicAmp>=25)warn.push({path:'context',message:'마법 피해 증폭이 상한 25%에 도달했습니다.'});
  if(ctx.explosiveAmp>=25)warn.push({path:'context',message:'폭발형 증폭이 상한 25%에 도달했습니다.'});
  if(ctx.level>=36||ctx.level<=1)warn.push({path:'context',message:`마방 단계가 범위 끝(${ctx.level})에 도달했습니다.`});
  const report={
    ok:true,tool:TOOL,
    scenario:{name:scenario.name,description:scenario.description},
    data:{version:data.version,sha256,source:'dist/data.json'},
    engines:ENGINES,
    input:{context:scenario.context},
    damageContext:{selected:ctx.enabled.map(e=>e.code),level:ctx.level,defenceFactor:ctx.defenceFactor,
      magicAmp:ctx.magicAmp,magicCut:ctx.magicCut,allAmp:ctx.allAmp,explosiveAmp:ctx.explosiveAmp,
      generalExplosiveAmp:ctx.generalExplosiveAmp,normalOnlyExplosiveAmp:ctx.normalOnlyExplosiveAmp,
      magic:ctx.magic,explosive:ctx.explosive,all:ctx.all,armor:ctx.armor,warcury:ctx.warcury}
  };
  if(scenario.line){
    const engineOptions=lineEngineOptions(scenario.line.options,ctx);
    report.input.line={team:scenario.line.team,options:scenario.line.options,engineOptions};
    report.line=lineReport(simulateV2(data,scenario.line.team,engineOptions),data,scenario.output.timeline);
  }
  if(scenario.single){
    const {team,trials,seed,reference}=scenario.single;
    report.input.single={team,trials,seed,reference};
    const r=simulateSingle(team,{trials,seed,context:ctx});
    report.single=singleReport(r,reference?referenceSingle({trials,seed,context:ctx}):null);
  }
  report.warnings=warn;
  report.limitations=LIMITATIONS;
  return report;
}
