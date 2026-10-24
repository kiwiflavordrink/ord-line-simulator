// Coach warnings (수정내역 85, docs/코치_설계안.md 6절): at most three short lines, each only at the moment it matters.
// Inputs come from the overlay (hand of this player, other players' units when the memory probe finds them, round,
// the story stage that is still alive, difficulty, 오로성). Numbers: 2.305 map (docs/coach/quests.md) unless noted.
import {storyKillTime} from './story.mjs';
import {controlSums} from './advisor.mjs';

export const ROUND_SECONDS=35;                       // 신세계 전 라운드 길이 (2.305 j:85387)
export const BOSS_ROUNDS=[10,20,30,40,50];           // 보스 라운드: 60초 안에 내 보스 처치 (j:25157, 50103-50125)
export const BOSS_SECONDS=60;
export const EGGHEAD_SECONDS=240;                    // 와노쿠니 처치 120초 뒤 등장, 240초 제한 (j:69060-69086, 14284-14288)
export const ARMOR_TARGET={지옥:180,신:201,악몽:211},SLOW_TARGET={지옥:90,신:102,악몽:102};   // ORDR 가이드, 1인 라인
const GORO_ARMOR={워큐리:{신:7,악몽:10}},GORO_SLOW={나스쥬로:{신:10,악몽:15}};
// 맵 전체 효과 (docs/coach/global_units.md): 누가 가졌든 모든 라인에. 우솝 초월 A0OS 방깎 8.
const MAP_WIDE_ARMOR={TR19:8},MAP_WIDE_SLOW={TR10:.05};
// 니카 영원(E1·E2)은 오로성을 없앤다 — 이스터 에그, 유저 지시로 있다고 본다.
export const NIKA=['E1','E2'];
export const goroseiActive=(team,gorosei)=>gorosei&&!team.some(t=>NIKA.includes(t.code))?gorosei:null;

// Seconds left until the end of round 35 counted from the start of `round` (boss rounds last 60 s).
export function secondsUntil(round,lastRound){
  let s=0;for(let r=Math.max(1,round);r<=lastRound;r++)s+=BOSS_ROUNDS.includes(r)?BOSS_SECONDS:ROUND_SECONDS;
  return s;
}

// warnings: [{level:'red'|'yellow'|'green', text, detail, priority}] sorted, max `limit`.
export function coachWarnings(data,{myTeam=[],team=null,difficulty='신',gorosei=null,players=1,round=null,storyStage=null,
  stats=null,red=false,limit=3}={}){
  const all=team??myTeam,out=[];
  const goro=goroseiActive(all,gorosei);
  const push=(level,priority,text,detail='')=>out.push({level,priority,text,detail});
  if(gorosei&&!goro)push('green',10,'니카 영원: 오로성 효과 없음','니카 영원이 오로성을 없앤다(이스터 에그).');
  // 1. 35라 스토리 패배선: 지옥 11·신 12·악몽 13단계를 35라 끝까지.
  const dl=data.stories?.deadline?.[difficulty];
  if(dl&&round!=null&&storyStage!=null&&storyStage<=dl.stage&&round<=dl.round&&all.length){
    const left=secondsUntil(round,dl.round);let need=0;
    for(let s=storyStage;s<=dl.stage;s++){const t=storyKillTime(data,all,s,{difficulty,players,seconds:600,gorosei:goro});need+=Number.isFinite(t)?t:600;}
    const name=data.stories.stages[dl.stage-1]?.name??dl.stage+'단계';
    const detail=`${storyStage}~${dl.stage}단계 처치 예상 ${Math.round(need)}초 / 35라 끝까지 약 ${left}초 (팀 전원이 스토리를 칠 때, 업그레이드 최대 기준)`;
    if(need>left)push('red',100,`35라까지 ${name} 못 깸 → 패배 위험`,detail);
    else if(round>=25&&need>left*.6)push('yellow',60,`35라 스토리 빠듯함: ${name}까지 ${Math.round(need)}초 필요`,detail);
  }
  // 2. 에그헤드 (신·악몽): 와노쿠니가 남았거나 막 깬 때.
  if(['신','악몽'].includes(difficulty)&&storyStage!=null&&storyStage>=12&&storyStage<=14&&all.length){
    const t=storyKillTime(data,all,14,{difficulty,players,seconds:EGGHEAD_SECONDS+60,gorosei:goro});
    const detail=`에그헤드 처치 예상 ${Number.isFinite(t)?Math.round(t)+'초':'300초 이상'} / 제한 ${EGGHEAD_SECONDS}초 (와노쿠니 처치 120초 뒤 등장)`;
    if(!(t<=EGGHEAD_SECONDS))push('red',90,'에그헤드 240초 안에 못 잡음 → 패배 위험',detail);
    else if(t>EGGHEAD_SECONDS*.75)push('yellow',55,`에그헤드 빠듯함 (${Math.round(t)}초)`,detail);
  }
  // 3. 보스 라운드 직전.
  if(round!=null&&BOSS_ROUNDS.includes(round+1))push('yellow',50,`다음 ${round+1}라 보스: 60초 안에 처치`,'못 잡으면 그 플레이어 패배. 단일·보스 피해 유닛을 내 라인에 두세요.');
  // 4. 방깎·이감 (내 라인, 맵 전체 효과 포함, 오로성 반영).
  if(myTeam.length){
    const c=controlSums(data,myTeam,red);
    const others=(team??[]).filter(t=>!myTeam.some(m=>m.code===t.code));
    const cut=c.armorCut+others.reduce((a,t)=>a+(MAP_WIDE_ARMOR[t.code]??0),0);
    const slow=c.slow+others.reduce((a,t)=>a+(MAP_WIDE_SLOW[t.code]??0),0);
    const at=ARMOR_TARGET[difficulty]+(GORO_ARMOR[goro]?.[difficulty]??0),st=SLOW_TARGET[difficulty]+(GORO_SLOW[goro]?.[difficulty]??0);
    const lack=[];if(cut<at)lack.push(`방깎 ${cut}/${at}`);if(slow*100<st)lack.push(`이감 ${Math.round(slow*100)}/${st}%`);
    if(lack.length&&(round==null||round>=40))push('yellow',30,'내 라인 '+lack.join(' · ')+' 부족',`ORDR 가이드 목표(1인 라인, 상시 오라)${goro?`, 오로성 ${goro} 반영`:''}.`);
  }
  // 5. 60~65라 클리어 각 (시뮬, 50라 이후).
  const s=stats?.[difficulty];
  if(s&&(round==null||round>=50)){
    if(!s.clear)push('red',80,`지금 조합: ${s.failedRound}라 패배 (시뮬)`,'라인딜·단일·끝딜을 보강하세요. 가이드 탭의 "보완"을 보세요.');
    else if(round!=null&&round>=55)push('green',20,`지금 조합 ${difficulty} 클리어 각 (남은 몹 ${s.remaining})`,'시뮬은 실제보다 조금 비관적입니다.');
  }
  return out.sort((a,b)=>b.priority-a.priority).slice(0,limit);
}
