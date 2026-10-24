// In-game advisor (수정내역 34): turns a player's hand (map rawcodes) into a simulator team and reports the combination
// stats, the nearest real clears and how far other upper units are. Used by overlay/ (game HUD) and usable from the
// web. Helper data (recipes, catalog, tmo clears) is read from the player's own ORD_JHelper Data folder at run time.
import {simulateV2} from './engine_v3.mjs';
import {reverseRawcode,planTarget,reachable} from './planner.mjs';

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
