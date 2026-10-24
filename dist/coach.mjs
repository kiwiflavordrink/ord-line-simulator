// Coach warnings (수정내역 85, docs/코치_설계안.md 6절): at most three short lines, each only at the moment it matters.
// Inputs come from the overlay (hand of this player, other players' units when the memory probe finds them, round,
// the story stage that is still alive, difficulty, 오로성). Numbers: 2.305 map (docs/coach/quests.md) unless noted.
import {storyKillTime} from './story.mjs';
import {controlSums} from './advisor.mjs';
import {planTarget,priceModel,lockedPieces} from './planner.mjs';

export const ROUND_SECONDS=35;                       // 신세계 전 라운드 길이 (2.305 j:85387)
export const BOSS_ROUNDS=[10,20,30,40,50];           // 보스 라운드: 60초 안에 내 보스 처치 (j:25157, 50103-50125)
export const BOSS_SECONDS=60;
export const EGGHEAD_SECONDS=240;                    // 신·악몽: 와노쿠니(13) 처치 120초 뒤 등장, 그때부터 240초 (j:69060-69086, 14284-14288)
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
  stats=null,red=false,limit=3,difficultyKnown=true}={}){
  const all=team??myTeam,out=[];
  const goro=goroseiActive(all,gorosei);
  const push=(level,priority,text,detail='',id=null)=>out.push({level,priority,text,detail,id});
  if(gorosei&&!goro)push('green',10,'니카 영원: 오로성 효과 없음','니카 영원이 오로성을 없앤다(이스터 에그).');
  // 스토리 경고는 셋으로 나눈다(유저 결정, 수정내역 87): 신(36라 시작 전 12단계), 악몽(36라 시작 전 13단계), 에그헤드
  // (등장한 뒤부터 240초). 난이도가 측정되었을 때(difficultyKnown)만 그 난이도의 경고가 켜진다.
  const STORY_RULES={신:{id:'story-신',stage:12},악몽:{id:'story-악몽',stage:13}};
  const rule=difficultyKnown?STORY_RULES[difficulty]:null;
  // 1. 신·악몽 36라 패배선.
  if(rule&&round!=null&&storyStage!=null&&storyStage<=rule.stage&&round<=35&&all.length){
    const left=secondsUntil(round,35);let need=0;
    for(let s=storyStage;s<=rule.stage;s++){const t=storyKillTime(data,all,s,{difficulty,players,seconds:600,gorosei:goro});need+=Number.isFinite(t)?t:600;}
    const name=data.stories.stages[rule.stage-1]?.name??rule.stage+'단계';
    const detail=`${difficulty}: ${storyStage===rule.stage?rule.stage+'단계':storyStage+'~'+rule.stage+'단계'} 처치 예상 ${Math.round(need)}초 / 35라 끝까지 약 ${left}초 (팀 전원이 스토리를 칠 때, 업그레이드 최대 기준)`;
    if(need>left)push('red',100,`[${difficulty}] 36라 시작 전까지 ${name} 못 깸 → 패배 위험`,detail,rule.id);
    else if(round>=25&&need>left*.6)push('yellow',60,`[${difficulty}] 36라 전 ${name}까지 빠듯함 (${Math.round(need)}초 필요)`,detail,rule.id);
  }
  // 2. 에그헤드: 난이도와 상관없이 에그헤드가 발견되면(남은 스토리 단계 14) 띄운다(유저). 와노쿠니 처치 120초 뒤 등장,
  // 240초 제한. 체력 배수는 알려진 난이도(모르면 신)로 계산.
  if(storyStage===14&&all.length){
    const t=storyKillTime(data,all,14,{difficulty,players,seconds:EGGHEAD_SECONDS+60,gorosei:goro});
    const detail=`에그헤드 처치 예상 ${Number.isFinite(t)?Math.round(t)+'초':'300초 이상'} / 제한 ${EGGHEAD_SECONDS}초 (팀 전원이 칠 때)`;
    if(!(t<=EGGHEAD_SECONDS))push('red',95,'[에그헤드] 240초 안에 못 잡음 → 패배 위험',detail,'egghead');
    else if(t>EGGHEAD_SECONDS*.75)push('yellow',58,`[에그헤드] 빠듯함 (${Math.round(t)}초 / 240초)`,detail,'egghead');
    else push('green',40,`[에그헤드] ${Math.round(t)}초 예상 — 팀 전원 스토리로`,detail,'egghead');
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

// ---- 3단계: 개인 퀘스트·미션 (수정내역 86) ------------------------------------------------------------------------
// docs/coach/quests.md (2.305 맵). 도박 관련 개인 퀘스트(목재수집·도박중독·도박실패)는 유저 결정으로 조언하지 않는다.
export const PERSONAL_QUESTS=[
  {id:'Q000',name:'고고학자',hint:'유니크 아이템 2개'},
  {id:'Q001',name:'오늘만산다',hint:'14라까지 선택위습 11회',until:14},
  {id:'Q002',name:'목재수집',gamble:true},{id:'Q003',name:'도박중독',gamble:true},{id:'Q004',name:'도박실패(하급)',gamble:true},
  {id:'Q005',name:'도박실패(중급)',gamble:true},{id:'Q006',name:'도박실패(고급)',gamble:true},
  {id:'Q007',name:'MVP 선정',hint:'스토리 기여도 1등 4회'},
  {id:'Q008',name:'유닛조합(초월)',grade:/^초월/},{id:'Q009',name:'유닛조합(불멸)',grade:/^불멸/},{id:'Q010',name:'유닛조합(영원)',grade:/^영원/},
  {id:'Q011',name:'유닛조합(제한)',grade:/^제한/},{id:'Q012',name:'유닛조합(왜곡)',grade:/^왜곡/},
  {id:'Q013',name:'유닛조합(아이템)',items:true},
  {id:'Q014',name:'콰트로',top:4},{id:'Q015',name:'트리플',top:3},
  {id:'Q016',name:'리사이클',hint:'흔함 9개 판매'},
  {id:'Q017',name:'유닛조합(신비)',grade:/^신비/},
];
const TOP_GRADE=/^(초월|불멸|영원|제한|신비)/;

// Nearest target (by 흔함 price) among recipe outputs passing `want`; null if none.
function nearest(hand,recipes,tier,name,want){
  const locked=lockedPieces(hand,recipes,name),prices=priceModel(recipes,tier,name,{locked});
  let best=null;
  for(const id of recipes.keys()){
    if(!want(id)||(hand[id]??0)>0)continue;
    const p=planTarget(id,hand,recipes,tier,{prices});
    if(Number.isFinite(p.price)&&(!best||p.price<best.price))best={id,price:p.price};
  }
  return best;
}

// Hints for the 3 personal quests and the missions that have a deadline. Same shape as coachWarnings.
export function questHints(data,{quests=[],hand={},round=null,storyStage=null,team=[],difficulty='신',players=1,recipes=null,tier=()=>null,name=()=>null}={}){
  const out=[],push=(level,priority,text,detail='')=>out.push({level,priority,text,detail});
  const nm=id=>name(id)??id,cost=n=>n.price<.5?'지금 조합 가능':`흔함 ${Math.round(n.price)}`;
  for(const qid of quests){
    const q=PERSONAL_QUESTS.find(x=>x.id===qid);if(!q||q.gamble)continue;
    if(q.until!=null){if(round==null||round<=q.until)push(round!=null&&round>=q.until-4?'yellow':'green',round!=null&&round>=q.until-4?45:15,`퀘스트 ${q.name}: ${q.hint}`,`${q.until}라가 지나면 못 깹니다.`);continue;}
    if(!recipes?.size){if(q.hint)push('green',10,`퀘스트 ${q.name}: ${q.hint}`);continue;}
    if(q.grade){
      const n=nearest(hand,recipes,tier,name,id=>q.grade.test(tier(id)??''));
      if(n)push('green',22,`퀘스트 ${q.name}: 가장 가까운 ${nm(n.id)} (${n.price<.5?'지금 조합 가능':'남은 흔함 '+Math.round(n.price)})`,'가이드 탭에서 눌러 목표로 지정하세요.');
      continue;
    }
    if(q.top){
      const have=Object.entries(hand).filter(([id,n])=>n>0&&TOP_GRADE.test(tier(id)??'')).reduce((a,[,n])=>a+n,0);
      if(have>=q.top)continue;
      const n=nearest(hand,recipes,tier,name,id=>TOP_GRADE.test(tier(id)??''));
      push('green',22,`퀘스트 ${q.name}: 최상위 ${have}/${q.top}`+(n?` · 다음 ${nm(n.id)} (${cost(n)})`:''),'최상위 = 초월·불멸·영원·제한·신비.');
      continue;
    }
    if(q.items){
      const n=nearest(hand,recipes,tier,name,id=>(recipes.get(id)??[]).some(r=>r.special.some(s=>s.kind==='ITEM')));
      if(n)push('green',20,`퀘스트 ${q.name}: 가장 가까운 ${nm(n.id)} (${cost(n)}, 유니크 아이템 필요)`);
      continue;
    }
    if(q.hint)push('green',10,`퀘스트 ${q.name}: ${q.hint}`);
  }
  // 미션 — 패스트유니크(7라까지 희귀 1기), 신속한 철거(8라까지 알라바스타, 2.320), 파괴왕(29라까지 드레스로자).
  if(round!=null&&round<=7&&recipes?.size&&!Object.entries(hand).some(([id,n])=>n>0&&/^희귀/.test(tier(id)??''))){
    const n=nearest(hand,recipes,tier,name,id=>/^희귀/.test(tier(id)??''));
    push(round>=5?'yellow':'green',round>=5?48:18,`미션 패스트유니크: 7라까지 희귀 1기`+(n?` · ${nm(n.id)} (${cost(n)})`:''));
  }
  if(round!=null&&round<=8&&storyStage!=null&&storyStage<=2)push(round>=6?'yellow':'green',round>=6?47:16,'미션 신속한 철거: 8라까지 알라바스타(2단계) 파괴','보상: 모두에게 랜덤위습.');
  if(round!=null&&round>=18&&round<=29&&storyStage!=null&&storyStage<=11&&team.length){
    let need=0;for(let s=storyStage;s<=11;s++){const t=storyKillTime(data,team,s,{difficulty,players,seconds:600});need+=Number.isFinite(t)?t:600;}
    const left=secondsUntil(round,29),detail=`${storyStage}~11단계 처치 예상 ${Math.round(need)}초 / 29라 끝까지 약 ${left}초. 보상: 목재 2 + 모두 아이템 발굴.`;
    if(need<=left)push('green',35,'미션 파괴왕 가능: 29라까지 드레스로자',detail);
    else push('yellow',34,'미션 파괴왕 어려움 (29라까지 드레스로자)',detail);
  }
  return out;
}
