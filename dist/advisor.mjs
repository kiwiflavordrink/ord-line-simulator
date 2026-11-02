// In-game advisor (수정내역 34): turns a player's hand (map rawcodes) into a simulator team and reports the combination
// stats, the nearest real clears and how far other upper units are. Used by overlay/ (game HUD) and usable from the
// web. Helper data (recipes, catalog, tmo clears) is read from the player's own ORD_JHelper Data folder at run time.
import {simulateV2,FRESH_SINGLES} from './engine_v3.mjs';
import {reverseRawcode,planTarget,reachable,priceModel,lockedPieces} from './planner.mjs';
import {storyKillTime} from './story.mjs';

// 2.321~2.323 alternative rawcodes for units whose data.json form uses a 2.305 rawcode, and engine-built units.
export const RAWCODE_ALIASES={H09G:'TR12',H093:'TR23',h0BM:'I7',H0B1:'TR16',H08J:'TR26',H0CL:'TR7',h0CE:'MY1',h07Z:'E4',
  h03S:'L25',h0CI:'D3',h03A:'L7',h039:'L23',h02N:'L12',h037:'L19',h04F:'I8',h048:'D4',H08Y:'TR28',H0BV:'TR28',h03L:'H15'};
export const RED_FORCE_RAWCODE='h03U';   // 레드포스호 = engine option red
const UPPER=new Set(['전설','히든','제한됨','초월함','영원한','불멸의','신비함','변화','왜곡됨','세라핌','랜덤','특수함','희귀함']);
// Helper catalog tiers ('전설 [물딜]', '해적선', ...): upper units = what a 60~65 line deck is built from.
export const isUpperTier=t=>/전설|히든|초월|불멸|영원|제한|신비|변화|왜곡|세라핌|해적선|특수/.test(t??'');
const TARGET_TIER=/전설|히든|초월|불멸|영원|제한|신비|변화|왜곡|세라핌|해적선/;
const ENGINE_BUILT=new Set(['L25','D3','L7','L23','L12','L19','I8','D4','TR28','H15']);

// rawcode (normal order) -> simulator code
export function unitIndex(data){
  const map=new Map();
  for(const h of data.heroes)for(const f of h.forms)if(f.rawcode&&!map.has(f.rawcode))map.set(f.rawcode,h.code);
  for(const [r,c] of Object.entries(RAWCODE_ALIASES))if(!map.has(r))map.set(r,c);
  return map;
}

// hand {rawcode: count} -> {team:[{code,count}], red, unknown:[rawcode], raws:{code:rawcode}} (only units the simulator models; 흔함·안흔함
// and other materials are left out because they do not fight in the 60~65 line).
export function teamFromHand(data,hand,index=unitIndex(data)){
  const cnt={},unknown=[],raws={};let red=false;
  for(const [raw,n] of Object.entries(hand)){
    if(raw===RED_FORCE_RAWCODE){red=true;continue;}
    const code=index.get(raw);
    if(!code){unknown.push(raw);continue;}
    const h=data.heroes.find(x=>x.code===code);
    if(h&&!UPPER.has(h.grade))continue;
    if(!h&&!ENGINE_BUILT.has(code))continue;
    cnt[code]=(cnt[code]??0)+n;raws[code]??=raw;
  }
  return {team:Object.entries(cnt).map(([code,count])=>({code,count:Math.min(6,count)})),red,unknown,raws};
}

// Sums the advisor shows next to the simulation: own armor cut (distinct units + Red Force 20), enemy slow auras
// (same aura id counts once), stun index (바르톨로메오 전설 = 1, same formula as scripts/stun_index.mjs).
export function controlSums(data,team,red){
  const codes=[...new Set(team.map(t=>t.code))];
  let cut=red?20:0;const slow=new Map();let stun=0;
  const bart=stunLine(data.heroes.find(h=>h.code==='L13'));
  for(const c of codes){
    const h=data.heroes.find(x=>x.code===c);if(!h)continue;
    cut+=h.own_armor_cut??0;
    for(const a of h.enemy_slow_auras??[])slow.set(a.id,Math.max(slow.get(a.id)??0,a.value));
    stun+=stunLine(h)*(team.find(t=>t.code===c).count)/bart;
  }
  return {armorCut:cut,slow:[...slow.values()].reduce((a,v)=>a+v,0),stun};
}
function stunLine(h){
  if(!h)return 0;let s=0;
  for(const e of h.events){
    if(!e.stun||e.on_approach||['boss','frenzy','target_special'].includes(e.target))continue;
    const single=e.stun.single||['single','single_line'].includes(e.target);
    s+=Math.min(e.rate*e.stun.normal,3)*(single?.25:(e.radius??550)/550);
  }
  return s;
}

// Simulation per difficulty (basic model, armor cut = the units' own auras + growth, options passed through).
export function comboStats(data,team,{red=false,growthCut=0,difficulties=['신','악몽','지옥'],seed=1,...opts}={}){
  const out={};
  if(!team.length)return Object.fromEntries(difficulties.map(d=>[d,null]));   // no fighting unit yet
  for(const d of difficulties){
    const r=simulateV2(data,team,{difficulty:d,red,redDamage:red,cut:growthCut,heroArmorCuts:true,deletion:{seed},...opts});
    out[d]={clear:r.clear,remaining:r.remaining,failedRound:r.failedRound,failedSecond:r.failedSecond,threshold:r.defeatThreshold};
  }
  return out;
}

// Nearest real clears (tmo samples, reversed rawcodes): Jaccard similarity on the upper units of the hand.
export function similarClears(samples,hand,{difficulty='신',k=30,isUpper}={}){
  const mine=new Set(Object.keys(hand).filter(r=>!isUpper||isUpper(r)));
  if(!mine.size)return {count:0,remaining:[],examples:[]};
  const scored=[];
  for(const s of samples){
    if(difficulty&&s.d!==difficulty)continue;
    const theirs=new Set(s.u.map(u=>reverseRawcode(u.c)).filter(r=>!isUpper||isUpper(r)));
    let inter=0;for(const r of mine)if(theirs.has(r))inter++;
    if(!inter)continue;
    scored.push({score:inter/(mine.size+theirs.size-inter),n:s.n,units:[...theirs]});
  }
  scored.sort((a,b)=>b.score-a.score);
  const top=scored.slice(0,k),rem=top.map(x=>x.n).sort((a,b)=>a-b);
  return {count:top.length,remaining:rem,median:rem.length?rem[Math.floor(rem.length/2)]:null,examples:top.slice(0,5)};
}

// Next targets: upper units the hand can reach, cheapest first, each with the simulated result if it joins the team.
export function nextTargets(data,hand,recipes,tier,{limit=6,difficulty='신',red=false,growthCut=0,isTarget,simulate=true}={}){
  const index=unitIndex(data);
  const list=reachable(hand,recipes,tier,id=>isTarget?isTarget(id):TARGET_TIER.test(tier(id)??'')).slice(0,limit*3);
  const out=[];
  for(const {id,plan} of list){
    const code=index.get(id);
    const after={...hand};after[id]=(after[id]??0)+1;for(const [u,n] of Object.entries(plan.used))after[u]-=n;
    const {team}=teamFromHand(data,after,index);
    // simulate false (수정내역 79): plans and the team after crafting only; the caller simulates later (sim undefined).
    if(!simulate)out.push({id,code,plan,team});
    else out.push({id,code,plan,sim:code?comboStats(data,team,{red,growthCut,difficulties:[difficulty]})[difficulty]:null});
    if(out.length>=limit)break;
  }
  return out;
}

export {planTarget};

// ---- 가까운 상위 가이드 (수정내역 83) -------------------------------------------------------------------------------
// 유저: "보통은 가장 가까운 상위부터 가고서 그걸 토대로 덱을 짠다. 가까운 상위와 어떤 게 어울리며 어떤 점을 보완해야
// 하는지가 가이드의 핵심". For the nearest upper targets (흔함-equivalent price, 특수 기물 included): how much the hand
// already covers, role, units that real clears pair it with, what the team still lacks after making it, and which
// other targets need the same 희귀·전설급 material or 특수 기물 (겹침패).
export const ROLE_CODES={single:FRESH_SINGLES,finish:['L36'],special:['H17','L26','L3','D2','SR4','I8','L10'],
  mana:['D2','L19','L28','TR22','MY8','SP2','L31'],deleter:['OB1','L12','D4','L19']};
const ROLE_LABEL={single:'단일',finish:'끝딜',special:'보스·광폭',mana:'마나',deleter:'삭제'};
export const ARMOR_TARGET={지옥:180,신:201,악몽:211},SLOW_TARGET={지옥:90,신:102,악몽:102};   // ORDR 가이드, 1인 라인
const GORO_ARMOR={워큐리:{신:7,악몽:10}},GORO_SLOW={나스쥬로:{신:10,악몽:15}};
const UPPER_GRADE=/^(초월|불멸|영원|제한|신비|변화|왜곡|세라핌)/,LEGEND_GRADE=/^(전설|히든|해적선)/;
const KEY_GRADE=/^(희귀|전설|히든)/;   // 겹침패: 희귀급·전설급 재료 + 특수 기물(위습으로 못 뽑는 잎)

export function roleOf(data,code,tierText){
  const h=data.heroes.find(x=>x.code===code),out=[];
  const tag=String(tierText??'').match(/\[(.+)\]/)?.[1];if(tag)out.push(tag);
  for(const [k,list] of Object.entries(ROLE_CODES))if(list.includes(code))out.push(ROLE_LABEL[k]);
  if(h?.own_armor_cut)out.push('방깎 '+h.own_armor_cut);
  const sl=(h?.enemy_slow_auras??[]).reduce((a,x)=>Math.max(a,x.value),0);if(sl)out.push('이감 '+Math.round(sl*100)+'%');
  return out;
}
// Real clears (tmo samples): units most often in the same final deck as `id` (upper grades), with the median 남은 몹.
export function pairIndex(samples,isUpper){
  const sets=samples.map(s=>({n:s.n,d:s.d,u:new Set(s.u.map(x=>reverseRawcode(x.c)).filter(isUpper))}));
  return {sets};
}
export function partnersOf(index,id,{difficulty,limit=5}={}){
  const cnt=new Map();let n=0;const rem=[];
  for(const s of index.sets){if(difficulty&&s.d!==difficulty)continue;if(!s.u.has(id))continue;n++;rem.push(s.n);for(const u of s.u)if(u!==id)cnt.set(u,(cnt.get(u)??0)+1);}
  rem.sort((a,b)=>a-b);
  return {games:n,median:rem.length?rem[rem.length>>1]:null,list:[...cnt].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([u,c])=>({id:u,share:c/n}))};
}
// Key materials of a plan: 희귀·전설급 units crafted or consumed, and 특수 기물 leaves.
export function keyMaterials(plan,tier){
  const k=new Set();
  for(const st of plan.steps)if(KEY_GRADE.test(tier(st.output)??''))k.add(st.output);
  for(const id of Object.keys(plan.used))if(KEY_GRADE.test(tier(id)??''))k.add(id);
  for(const id of Object.keys(plan.missing))k.add(id);
  return k;
}
export function guideTargets(data,hand,recipes,tier,name,{samplesIndex=null,difficulty='신',gorosei=null,red=false,limit=8,grades='upper',keyIndex=null}={}){
  const index=unitIndex(data),locked=lockedPieces(hand,recipes,name),prices=priceModel(recipes,tier,name,{locked});
  const want=grades==='legend'?LEGEND_GRADE:UPPER_GRADE;
  const have=new Map(Object.entries(hand));
  const cands=[];
  for(const id of recipes.keys()){
    if(!want.test(tier(id)??'')||(have.get(id)??0)>0)continue;
    const plan=planTarget(id,hand,recipes,tier,{prices});
    if(!Number.isFinite(plan.price)){cands.push({id,plan,locked:true});continue;}
    cands.push({id,plan});
  }
  cands.sort((a,b)=>(a.locked-b.locked)||a.plan.price-b.plan.price);
  const free=priceModel(recipes,tier,name),fullOf=id=>planTarget(id,{},recipes,tier,{prices:free}).price;
  const out=[];
  for(const c of cands.slice(0,limit)){
    const full=fullOf(c.id),pct=c.locked?0:Math.max(0,Math.min(1,1-c.plan.price/full));
    const code=index.get(c.id);
    const after={...hand};after[c.id]=(after[c.id]??0)+1;if(!c.locked)for(const [u,n] of Object.entries(c.plan.used))after[u]-=n;
    const {team}=teamFromHand(data,after,index);
    const ctrl=controlSums(data,team,red);
    const codes=new Set(team.map(t=>t.code));const has=r=>ROLE_CODES[r].some(x=>codes.has(x));
    const at=ARMOR_TARGET[difficulty]+(GORO_ARMOR[gorosei]?.[difficulty]??0),st=SLOW_TARGET[difficulty]+(GORO_SLOW[gorosei]?.[difficulty]??0);
    const gaps=[];
    if(ctrl.armorCut<at)gaps.push(`방깎 ${ctrl.armorCut}/${at}`);
    if(ctrl.slow*100<st)gaps.push(`이감 ${Math.round(ctrl.slow*100)}/${st}%`);
    if(!has('single'))gaps.push('단일 없음');else if(!has('finish'))gaps.push('끝딜 없음');
    if(!has('special'))gaps.push('보스·광폭 처리 없음');
    const keys=keyMaterials(c.plan,tier);
    const overlaps=[];
    if(keyIndex)for(const [other,ks] of keyIndex){if(other===c.id||keys.has(other)||(have.get(other)??0)>0||ks.has(c.id))continue;const sh=[...ks].filter(x=>keys.has(x));if(sh.length)overlaps.push({id:other,shared:sh});}
    overlaps.sort((a,b)=>b.shared.length-a.shared.length);
    out.push({id:c.id,code,locked:!!c.locked,price:c.plan.price,full,pct,plan:c.plan,role:roleOf(data,code,tier(c.id)),
      partners:samplesIndex?partnersOf(samplesIndex,c.id,{difficulty}):null,gaps,overlaps:overlaps.slice(0,4),
      specials:Object.keys(c.plan.missing).map(id=>({id,price:prices.leaf(id)}))});
  }
  return {L:prices.L,locked:[...locked],list:out};
}
// 겹침패 index: for every upper/legend target, its key materials from an empty hand (computed once per recipe set).
export function buildKeyIndex(recipes,tier){
  const m=new Map();
  for(const id of recipes.keys())if(UPPER_GRADE.test(tier(id)??'')||LEGEND_GRADE.test(tier(id)??''))m.set(id,keyMaterials(planTarget(id,{},recipes,tier),tier));
  return m;
}

// ---- 유닛 찾기 (수정내역 94) -----------------------------------------------------------------------------------------
// 등급을 고르고 이름 일부를 친다. 등급은 헬퍼 카탈로그 tier에서 "[마딜]" 같은 꼬리를 뗀 것. 왜곡됨은 따로 둔다.
export const FIND_GRADES=['흔함','안흔함','특별함','희귀함','전설','히든','변화된','세라핌','왜곡됨','초월','불멸','영원','제한됨','신비함','특수함','해적선','랜덤유닛'];
export const gradeOf=tier=>String(tier??'').replace(/\s*\[.*\]/,'').trim();
// 유저가 부르는 이름(별칭). 이름에 match가 들어 있으면 also의 말로도 찾힌다. mode는 결과에 붙는 설명.
export const FIND_ALIASES=[
  {match:/파이러츠/,also:['프랑키']},                                        // 파이러츠 도킹 5 = 프랑키 특별
  {match:/^루피 기어포스$/,also:['스네이크맨','기어4','기어포스'],mode:'스네이크맨'},   // 유저: 기어포스 = 스네이크맨
  {match:/^니카\(루초\)$/,also:['니카'],mode:'루피 초월에서'},
  {match:/^니카\(뱀초\)$/,also:['니카'],mode:'스네이크맨에서'},
];
const norm=s=>String(s??'').toLowerCase().replace(/[\s.()\-·]/g,'');
// units: [{id,name,tier}] → 걸린 것 [{id,name,tier,grade,mode}], 이름이 정확히 같은 것 → 짧은 이름 순.
export function findUnits(units,{grade='',query=''}={}){
  const q=norm(query),out=[];
  for(const u of units){
    const g=gradeOf(u.tier);if(!FIND_GRADES.includes(g)||(grade&&g!==grade))continue;
    const al=FIND_ALIASES.filter(a=>a.match.test(u.name));
    const keys=[u.name,...al.flatMap(a=>a.also)].map(norm);
    if(q&&!keys.some(k=>k.includes(q)))continue;
    out.push({...u,grade:g,mode:al.find(a=>a.mode)?.mode??null,exact:q&&keys.includes(q)?1:0});
  }
  return out.sort((a,b)=>b.exact-a.exact||a.name.length-b.name.length||a.name.localeCompare(b.name,'ko'));
}

// ---- 상황 추천 (수정내역 95) -----------------------------------------------------------------------------------------
// 유저: 후반에는 선택위습을 수십 개 태워서라도 올려야 하는 유닛만 남는데 가까운 5개만 떠서 못 쓴다, 지금 상황에 맞는
// 추천이 없다. → 지금 무엇이 급한지(보스 임박·스토리 늦음·후반 라인)를 정하고, 거리 제한 없이 모든 상위·전설 후보 중
// 값싼 순으로 pool개를 시뮬로 비교해 효과가 큰 것을 고른다. 결과 = {needs:[...], picks:[{id,price,why,gain}]}.
const BOSS_RECOMMEND=[10,20,30,40,50];
export function situationPicks(data,hand,recipes,tier,name,{round=null,storyStage=null,storyRisk=false,difficulty='신',players=1,gorosei=null,red=false,others=[],pool=12,limit=5}={}){
  const index=unitIndex(data),locked=lockedPieces(hand,recipes,name),prices=priceModel(recipes,tier,name,{locked});
  const have=new Map(Object.entries(hand)),cands=[];
  for(const id of recipes.keys()){
    if(!(UPPER_GRADE.test(tier(id)??'')||LEGEND_GRADE.test(tier(id)??''))||(have.get(id)??0)>0||!index.get(id))continue;
    const plan=planTarget(id,hand,recipes,tier,{prices});if(Number.isFinite(plan.price))cands.push({id,code:index.get(id),plan});
  }
  cands.sort((a,b)=>a.plan.price-b.plan.price);
  const teamAfter=c=>{const after={...hand};after[c.id]=(after[c.id]??0)+1;for(const [u,n] of Object.entries(c.plan.used))after[u]-=n;return teamFromHand(data,after,index).team;};
  const mine=teamFromHand(data,hand,index).team,codes=new Set(mine.map(t=>t.code));
  const needs=[];
  const nextBoss=round==null?null:BOSS_RECOMMEND.find(b=>b>=round&&b-round<=2);
  if(nextBoss&&!ROLE_CODES.single.some(x=>codes.has(x))&&!ROLE_CODES.special.some(x=>codes.has(x)))needs.push('boss');
  if(storyRisk&&storyStage)needs.push('story');
  if(round!=null&&round>=40)needs.push('line');
  if(!needs.length)needs.push('build');
  const need=needs[0],picks=[];
  // 비교 후보: 가장 싼 pool개 + 상위 등급(초월·불멸·영원 …) 중 가장 싼 8개 — 후반에 위습을 많이 태워야 하는 유닛도 넣는다.
  const near=cands.slice(0,pool),upper=cands.filter(c=>UPPER_GRADE.test(tier(c.id)??'')&&!near.includes(c)).slice(0,8),test=[...near,...upper];
  if(need==='boss'){
    for(const c of cands){if(![...ROLE_CODES.single,...ROLE_CODES.special].includes(c.code))continue;
      picks.push({id:c.id,price:c.plan.price,why:`${nextBoss}라 보스 대비: ${roleOf(data,c.code,tier(c.id)).filter(r=>r==='단일'||r==='보스·광폭').join('·')}`});if(picks.length>=limit)break;}
  }else if(need==='story'){
    const st=Math.min(14,storyStage),opt={difficulty,players,seconds:600,gorosei};
    const kill=team=>team.length?storyKillTime(data,team,st,opt):Infinity;   // 팀이 비면 못 잡음
    const t0=kill([...mine,...others]);
    for(const c of test){const t=kill([...teamAfter(c),...others]);
      if(Number.isFinite(t)&&!(t>=t0))picks.push({id:c.id,price:c.plan.price,gain:(Number.isFinite(t0)?t0:600)-t,why:`스토리 ${st}단계 처치 ${Number.isFinite(t0)?Math.round(t0):'600+'}→${Math.round(t)}초`});}
    picks.sort((a,b)=>b.gain/Math.max(1,b.price)-a.gain/Math.max(1,a.price));picks.length=Math.min(picks.length,limit);
  }else if(need==='line'){
    const stats=team=>team.length?comboStats(data,team,{red,difficulties:[difficulty]})[difficulty]:null;
    const base=stats(mine);
    for(const c of test){const s=stats(teamAfter(c));if(!s)continue;
      const gain=(base?.remaining??0)-s.remaining;
      if(gain>0||s.clear)picks.push({id:c.id,price:c.plan.price,gain,why:`${difficulty} 남은 몹 ${base?.remaining??'?'}→${s.remaining}`+(s.clear?' (클리어)':` (${s.failedRound}라 패배)`)});}
    picks.sort((a,b)=>b.gain-a.gain);picks.length=Math.min(picks.length,limit);
  }else{
    for(const c of cands.slice(0,limit))picks.push({id:c.id,price:c.plan.price,why:'가장 가까운 상위·전설: '+roleOf(data,c.code,tier(c.id)).slice(0,3).join('·')});
  }
  return {needs,need,picks};
}
