// Version 3: shared 60–65 round battlefield with explicit damage categories.
// Enemy HP/armor comes from the extracted 2.305 map; abilities use the 2.323 card model.
import {SUPPORTS} from './engine.mjs';

// Delete skills are counted as removed units, never as line damage.
// Default proc/cooldown settings follow the current ORDR character tooltips.
export const DELETERS={
  L12:{name:'겟코 모리아 전설',aps:2.24,cooldown:8.5,proc:1,mode:'attack'},
  D4:{name:'페로나 왜곡',aps:4.634,cooldown:7.5,proc:.1,mode:'attack'},
  L19:{name:'슈가 전설',cooldown:85,proc:1,mode:'active'}
};

// 2.305 object-data full upgrades, paired with the 2.323 ORDR cards.
// These need individual targeting/resource clocks and cannot use the generic AoE hero events.
// Ally auras of the support units (heroes carry theirs in data.json "auras").
export const SUPPORT_AURAS={
  L7:[{id:'L7',kind:'attack_pct',value:.25,targets:'all',note:'2.323 버프 "공격력 증가 25%"'}]
};

// Stuns of the hard-coded support units for the position model (2.323 tooltip numbers; hero
// durations from the 2.305 dummy abilities, see docs/수정내역.md #17).
export const SUPPORT_STUNS={
  L7:[{on:'cast',radius:800,stun:{normal:3,hero:.6},note:'패기발산 "적 중심 800범위 ▶ 해당 범위 3초 스턴"'},
    {on:'attack',chance:.12,stun:{normal:.6,hero:.3,single:true},note:'"공격시 12% 확률로 단일 적 8만 물리데미지 및 0.6초 스턴"'}],
  L23:[{on:'attack',chance:.10,radius:525,stun:{normal:3,hero:.6},note:'바닷물 가두기 "공격시 10% 확률로 ▶ 525범위 ▶ 해당 범위 3초 스턴"'}],
  D3:[{on:'attack',chance:.15,radius:500,stun:{normal:.95,hero:.19},note:'빙귀 "공격시 15% 확률로 ▶ 500범위 ▶ 해당 범위 0.95초 스턴"'}]
};

// 2.305 base attack cooldowns (w3u ua1c) for units whose aps is a fixed theory value: supports
// h03A L7 .58, h039 L23 .75, h03S L25 1.02, h0CI D3 .85; conditional h04F I8 .24, H08Y TR28 .75,
// h03L H15 .45; Red Force hidden h03U .64. Used only for the 나스쥬로 attack-speed penalty (수정내역 20).
// Own enemy armor auras of engine-built supports (2.323 buff_lines), used with options.heroArmorCuts (수정내역 37).
export const SUPPORT_ARMOR_CUTS={L7:20,L25:27};
const BASE_COOLDOWN={L7:.58,L23:.75,L25:1.02,D3:.85,I8:.24,TR28:.75,H15:.45,H2:.64};
export const CONDITIONAL_UNITS={
  I8:{name:'스코퍼가반 불멸',attack:407502,aps:17.916666558,attackType:'pierce',
    url:'https://ordr.kr/character/I8'},
  TR28:{name:'프랑키 초월',attack:135502,aps:5.800000091,attackType:'siege',
    url:'https://ordr.kr/character/TR28'},
  H15:{name:'써니호 히든',attack:34226,aps:8,attackType:'normal',
    url:'https://ordr.kr/character/H15'}
};

const rounds=[60,61,62,63,64,65];
const pf=a=>a>=0?1/(1+.02*a):2-Math.pow(.98,-a);
const typeMatrix={
  normal:{normal:1.25,large:1,fort:.75,hero:1},
  pierce:{normal:.75,large:1.25,fort:1,hero:.9},
  siege:{normal:1,large:.75,fort:1.25,hero:.8},
  hero:{normal:1.05,large:1.05,fort:1.05,hero:1.05},
  magic:{normal:1,large:1,fort:1,hero:.8},
  chaos:{normal:1,large:1,fort:1,hero:1}
};
const typeFor=(type,round,data)=>typeMatrix[type]?.[data.rounds[String(round)][2]]??1;
const clamp=(x,min,max)=>Math.min(max,Math.max(min,Number.isFinite(+x)?+x:min));
const abAdd=(m,n)=>{m.ab=Math.min(75,m.ab+n);};
// Caps of per-mob debuffs: A04R 25%, A04Q 36 levels, A11S 25% (수정내역 31).
const MOB_DEBUFF_CAP={magic_amp:.25,magic_cut_levels:36,explosive_amp:.25,all_amp:1};
const SINGLE_TARGETS=new Set(['single','single_line','target_special','boss','frenzy','multishot']);
// E6 알라바스타 건 level (hero.alabasta): data events hold the default level; level_formula rebuilds parts for
// another level. per_level parts are multiplied by the level; per_hit parts by the hit count (hits_by_level
// raises it from that level on); level_mul scales the line parts by (1 + k x level); min_level drops the
// event below that level. Without 이동사격 (option off or level < 5) the 3연사/웨스턴 rates use
// rate_without_move_shot and 이동사격 itself is dropped (docs/수정내역.md 21).
// Random-target hits: `picks` draws, each among the candidates still alive, applying `hit` in full.
// distinct (수정내역 31): "최대 N명" fan of knives / forked lightning hit N different enemies (no repeats).
export function randomPicks(candidates,picks,rng,hit,distinct=false){
  const used=new Set();
  for(let k=0;k<picks;k++){
    const alive=candidates.filter(m=>m.hp>0&&!used.has(m));
    if(!alive.length)return;
    const m=alive[Math.min(alive.length-1,Math.floor(rng()*alive.length))];
    if(distinct)used.add(m);
    hit(m);
  }
}
// Chain lightning (AOcl, mode 'bounce'): the first hit is the attack target, each next hit is the nearest enemy not yet
// hit within `range` of the previous one, damage x factor per bounce. Forked lightning (ACfl, mode 'fork'): the
// target plus the nearest other enemies around it, same damage. Basic model (no positions): next line mobs in order.
export function chainTargets(start,pool,c,posModel,dist){
  const out=[];if(!start)return out;
  const left=pool.filter(m=>m!==start&&m.hp>0);out.push(start);
  let cur=start;
  while(out.length<c.targets&&left.length){
    let i=0;
    if(posModel){
      const from=c.mode==='fork'?start:cur;
      let best=-1,bd=Infinity;
      left.forEach((m,j)=>{const dd=dist(m,from);if(dd<=c.range&&dd<bd){bd=dd;best=j;}});
      if(best<0)break;i=best;
    }
    cur=left.splice(i,1)[0];out.push(cur);
  }
  return out;
}
const scaleParts=(parts,k)=>parts.map(([kind,flat,perc,mul=0])=>[kind,flat*k,perc.map(([b,r])=>[b,r*k]),mul*k]);
// 특강 on/off (수정내역 28): hero.trait {current:'on'|'off', other:{events, add_events, forms, auras, ...}} — data
// holds `current`; asking for the other state applies `other` (event overrides by index, {removed:true} drops one,
// add_events appends, any other key replaces the hero field). options.trait 'on'|'off' for every hero,
// options.traits {code: 'on'|'off'} per hero; unset keeps each hero's stored state.
export function traitVariant(hero,want){
  const t=hero.trait;
  if(!t||!want||want===t.current)return hero;
  const o=t.other??{},events=[];
  for(const e of hero.events){
    const x=o.events?.[e.index];
    if(x?.removed)continue;
    events.push(x?{...e,...x}:e);
  }
  const out={...hero,events:[...events,...(o.add_events??[])]};
  for(const [k,v] of Object.entries(o))if(!['events','add_events','note'].includes(k))out[k]=v;
  return out;
}
// Stack scenarios (수정내역 28): hero.stack.variants {zero, half, max} override events by index ({removed:true}
// drops one) and replace any other hero field they carry (auras, forms, team_effects, attack_uptime …).
// options.stackLevel picks the level for every hero, options.stackLevels {code: level} per hero; unset keeps the
// stored data (which may sit between levels, e.g. one application of a per-enemy debuff).
export function stackVariant(hero,level,extraLevels){
  // hero.stack: the main user-set stack; hero.extra_stacks: further independent stacks (수정내역 29, e.g. TR24 버프 수
  // on top of 군함 백). Their event overrides may scale a rate (rate_mul) instead of replacing it, so they combine
  // with the main stack's rate. extraLevels: level per extra stack (array) or one level for all.
  const apply=(h,v)=>{
    if(!v)return h;
    const events=[];
    for(const e of h.events){
      const o=v.events?.[e.index];
      if(o?.removed)continue;
      if(!o){events.push(e);continue;}
      const {rate_mul,...rest}=o;
      events.push({...e,...rest,...(rate_mul!=null?{rate:e.rate*rate_mul}:{})});
    }
    const out={...h,events};
    for(const [k,x] of Object.entries(v))if(!['events','note','options'].includes(k))out[k]=x;
    return out;
  };
  let out=apply(hero,hero.stack?.variants?.[level]);
  (hero.extra_stacks??[]).forEach((st,i)=>{
    const l=Array.isArray(extraLevels)?extraLevels[i]:extraLevels;
    out=apply(out,st.variants?.[l]);
  });
  return out;
}
export function alabastaEvents(hero,level,moveShot=true){
  const a=hero.alabasta;if(!a)return hero.events;
  const L=Math.round(clamp(level??a.default,a.min,a.max)),shot=moveShot&&L>=5;
  const out=[];
  for(const e of hero.events){
    const lf=e.level_formula;
    if(lf?.min_level&&L<lf.min_level)continue;
    if(e.index==='이동사격'&&!shot)continue;
    const ev={...e};
    if(!shot&&e.rate_without_move_shot!=null)ev.rate=e.rate_without_move_shot;
    if(lf?.per_hit_parts||lf?.per_hit_parts_per_level){
      let hits=lf.hits;for(const [lv,h] of Object.entries(lf.hits_by_level??{}))if(L>=Number(lv))hits=h;
      ev.parts=scaleParts([...(lf.per_hit_parts??[]),...scaleParts(lf.per_hit_parts_per_level??[],L)],hits);
    }else if(lf?.parts||lf?.parts_per_level){
      ev.parts=[...(lf.parts??[]),...scaleParts(lf.parts_per_level??[],L)];
      if(lf.level_mul)ev.parts=scaleParts(ev.parts,1+lf.level_mul*L);
    }
    out.push(ev);
  }
  return out;
}
const isSummon=e=>/완두콩|백설콩|먹깨비|파견 해군|거인족|부유물|릴리스|아틀라스|요크/.test(String(e.index));

// Resource modes: 'start' = full mana once at the start of round 60 (2.305 has no
// round-start mana refill; only cheat functions refill mana), 'empty' = no starting
// mana, 'perRound' = legacy model that refilled mana at every round start.
// Mana-driven cycles start transformed when mana is full; proc-driven cycles (I11)
// and empty mana first wait for the trigger (period - window).
function inWindow(window,period,g,t,mode,resourceDriven){
  if(mode==='perRound')return t%period<window;
  const offset=resourceDriven&&mode==='start'?0:period-window;
  return g>=offset&&(g-offset)%period<window;
}
function formAt(hero,g,t,mode){
  const base=hero.forms[0];
  if(hero.forms.length<2)return {form:base,transformed:false};
  if(hero.permanent_form!=null)return {form:hero.forms[hero.permanent_form],transformed:hero.permanent_form>0};
  // Cooldown-driven active transform (data cooldown_form): used whenever the cooldown is ready,
  // so the window opens at time 0 and every cooldown seconds (TR19 우솝해머 5 s / 45 s).
  const cd=hero.cooldown_form;
  if(cd){
    const on=mode==='perRound'?t%cd.cooldown<cd.window:g%cd.cooldown<cd.window;
    return {form:on?hero.forms[1]:base,transformed:on};
  }
  const windows={TR3:[4.5,150,.25],TR6:[7,130,.25],TR18:[3.5,95,.33],TR23:[4,150,0],I11:[11,0,0],E10:[2,100,0]};
  // hero.transform_window [duration s, mana cost, mana regen per s] (수정내역 27) for new heroes; mana +1 per attack.
  const w=hero.transform_window??windows[hero.code];if(!w)return {form:base,transformed:false};
  let period=w[1]?w[0]+w[1]/(base.aps+w[2]):w[0]+1/(base.aps*.14);
  if(hero.code==='E10')period=w[0]+100/(base.aps*.2);
  const transformed=inWindow(w[0],period,g,t,mode,w[1]>0);
  return {form:transformed?hero.forms[1]:base,transformed};
}

function supportCastSchedule(code,full){
  const spec={L7:[115,0],L25:[35,.5],D3:[65,1]}[code];
  if(!spec)return [];
  const [cost,regen]=spec,interval=1/SUPPORTS[code].aps,casts=[];
  let energy=full?cost:0;
  for(let t=interval;t<=192+1e-9;t+=interval){
    energy=Math.min(cost,energy+1+regen*interval);
    if(energy+1e-9>=cost){casts.push(t);energy-=cost;}
  }
  return casts;
}

export function simulateV2(data,composition,options={}){
  const stackLevelOf=code=>['zero','half','max'].includes(options.stackLevels?.[code])?options.stackLevels[code]:
    ['zero','half','max'].includes(options.stackLevel)?options.stackLevel:null;
  const traitOf=code=>['on','off'].includes(options.traits?.[code])?options.traits[code]:['on','off'].includes(options.trait)?options.trait:null;
  // Extra stacks follow options.extraStackLevels[code] (level or array of levels), else the hero's stack level.
  const extraLevelsOf=code=>options.extraStackLevels?.[code]??stackLevelOf(code);
  const heroMap=new Map(data.heroes.map(h=>[h.code,stackVariant(traitVariant(h,traitOf(h.code)),stackLevelOf(h.code),extraLevelsOf(h.code))]));
  // Difficulty (data.difficulties: 2.305 structure, 2.323 common HP/regen) and 오로성 (data.gorosei, 2.323 values).
  // The legacy option warcury=true selects 워큐리. 지옥 has no 오로성.
  const diffName=['지옥','신','악몽'].includes(options.difficulty)?options.difficulty:'신';
  const diff=data.difficulties?.[diffName]??{rounds:data.rounds,boss:data.boss,frenzy:data.frenzy,defeat:55,magic_level:16,
    speed:{aura:0,line_flat:0},frenzy_aura:{armor:5,regen:1000000},stun_resist:true,common:{hp:0,regen:0},gorosei:true};
  const goroWanted=options.gorosei??(options.warcury===true?'워큐리':null);
  const goroName=diff.gorosei&&(data.gorosei?data.gorosei[goroWanted]:goroWanted==='워큐리')?goroWanted:null;
  // Armor (수정내역 22): default 'map' = 2.305 formula in diff.rounds/boss; 'data' = the pre-22 values.
  const armorModel=options.armorModel==='data'&&data.difficulties?'data':'map';
  const curse=goroName?(data.gorosei?.[goroName]?.[diffName]??{armor:10,magic_levels:10}):{};
  // 나스쥬로 attack-speed penalty on any allied unit: WC3 aps = min(5, aps x cooldown + bonus) / cooldown.
  const allyAps=(aps,cooldown)=>curse.ally_aps&&cooldown?Math.max(0,Math.min(5,aps*cooldown+curse.ally_aps))/cooldown:aps;
  // Skill level growth (hero.level_growth, 수정내역 35: Z2 전설의 후예). Start level at round 60: options.levelStart
  // {code: level}, else options[growth.option] (z2Level), else the stack level (zero/half/max -> stack_levels), else
  // growth.default. Each copy then gains chance x (proc rate) expected levels while it fights, up to growth.max.
  const levelStartOf=hero=>{
    const g=hero.level_growth,st=stackLevelOf(hero.code);
    const v=options.levelStart?.[hero.code]??options[g.option]??(st?g.stack_levels?.[st]:null)??g.default;
    return clamp(Number(v)||g.min,g.min,g.max);
  };
  const levelEvent=(e,u)=>{
    const sc=u.model.level_growth?.scale?.[e.index];
    return sc?{...e,parts:sc.map(([kind,base,per])=>[kind,base+per*u.level,[],0])}:e;
  };
  // Green Blood (그린블러드, 수정내역 36): options.greenBlood = code of one 전설/히든 hero in the team (one per player).
  // 2.305 war3map.j:78517-78525 adds A134 (display) + A13C (AIsx 공속 +30%) to a unit with A912/A07N (전설/히든), else
  // "전설/히든 유닛에만 적용 가능". BNA (j:7590-7628) every 3 s: enemies within 825 of the unit take IfA (j:19155)
  // 40만 + max HP 0.4% CHAOS·UNIVERSAL (fixed), and dummy e0BN casts A13B 지옥불 (aare 825, adur 1.2, ahdu 0.24) = stun.
  // Values match the 2.305 tooltip (STRING 3281); 2.323 has no tooltip for it [2.305 기준].
  const GREEN_BLOOD_EVENT={index:'그린블러드 진력해방',rate:1/3,per_attack:false,parts:[['fixed',400000,[['max',.004]],0]],
    radius:825,center:'self',stun:{normal:1.2,hero:.24},source:'2.305 war3map.j:7590-7628, :19155, w3a A13B/A13C'};
  const gbCode=options.greenBlood??null;
  let gbState=gbCode?{code:gbCode,applied:false,reason:'조합에 없음'}:null;
  const units=[];
  for(const item of composition){
    const count=clamp(Math.floor(item.count??1),1,6);
    if(heroMap.has(item.code)){
      const model=heroMap.get(item.code);
      const events=model.alabasta?alabastaEvents(model,options.e6AlabastaLevel,options.e6MoveShot!==false):model.events;
      const level=model.level_growth?levelStartOf(model):undefined;
      for(let i=0;i<count;i++){
        let ev=events,gb=false;
        if(gbCode===item.code&&!gbState.applied){
          if(['전설','히든'].includes(model.grade)){ev=[...events,GREEN_BLOOD_EVENT];gb=true;gbState={code:gbCode,applied:true};}
          else gbState={code:gbCode,applied:false,reason:`전설/히든 유닛에만 적용 (${model.grade})`};
        }
        units.push({kind:'hero',code:item.code,model,events:ev,damage:item.damage!==false,level,levelStart:level,greenBlood:gb});
      }
    }
    else if(SUPPORTS[item.code])for(let i=0;i<count;i++)units.push({kind:'support',code:item.code,model:{...SUPPORTS[item.code],aps:allyAps(SUPPORTS[item.code].aps,BASE_COOLDOWN[item.code])},damage:item.damage!==false,ab:item.ab!==false});
    else if(DELETERS[item.code])for(let i=0;i<count;i++)units.push({kind:'deleter',code:item.code,model:DELETERS[item.code],damage:item.damage!==false,nextAttack:1/(DELETERS[item.code].aps||1),nextReady:0});
    else if(CONDITIONAL_UNITS[item.code])for(let i=0;i<count;i++)units.push({kind:'conditional',code:item.code,
      model:{...CONDITIONAL_UNITS[item.code],aps:allyAps(CONDITIONAL_UNITS[item.code].aps,BASE_COOLDOWN[item.code])},damage:item.damage!==false,energy:0,
      attackBank:0,nextCast:0});
    else if(item.code==='MAGIC_CUSTOM')for(let i=0;i<count;i++)units.push({kind:'magic',code:'MAGIC_CUSTOM',damage:item.damage!==false});
  }
  if(!units.length)throw new Error('조합에 유닛을 한 기 이상 넣어 주세요.');
  // Ally buffs. An aura id counts once even with several copies (WC3 same-ability auras do not stack);
  // different auras add. targets: all (team), self, others. options.buffTargets {sourceCode:[targetCodes]}
  // limits who receives a source's buffs (default: the whole team is in range). Timed buffs use their
  // expected uptime: proc chance per attack over duration, or cast rate x duration.
  const buffTargets=options.buffTargets??{};
  const auraSources=units.map((u,i)=>({i,code:u.code,
    auras:u.kind==='hero'?u.model.auras??[]:u.kind==='support'?SUPPORT_AURAS[u.code]??[]:[]})).filter(x=>x.auras.length);
  // targets 'one' (수정내역 31): a buff cast on chosen allies — `picks` receivers per source copy (default 1), plus the
  // source itself when self_always. options.chosenBuffTargets {sourceCode:[codes in order]} picks them; the source's
  // own code may be listed (self-cast). Default: the other heroes in team order. Copies of a source take the next
  // receivers in that order, so two 로우 buff two different units.
  const chosen=options.chosenBuffTargets??{},oneReceivers=new Map();
  for(const code of new Set(auraSources.filter(x=>x.auras.some(a=>a.targets==='one')).map(x=>x.code))){
    const picks=Math.max(...auraSources.find(x=>x.code===code).auras.filter(a=>a.targets==='one').map(a=>a.picks??1));
    const order=chosen[code]?.length?chosen[code]:[...new Set(units.filter(x=>x.kind==='hero'&&x.code!==code).map(x=>x.code))];
    const cands=[];for(const c of order)units.forEach((x,i)=>{if(x.kind==='hero'&&x.code===c)cands.push(i);});
    let next=0;
    for(const src of auraSources.filter(x=>x.code===code)){
      const got=new Set();
      for(let k=0;k<cands.length&&got.size<picks;k++){const i=cands[(next+k)%cands.length];if(i!==src.i||order.includes(code))got.add(i);}
      next+=picks;oneReceivers.set(src.i,got);
    }
  }
  for(const [j,u] of units.entries()){
    if(u.kind!=='hero')continue;
    const byId=new Map();
    for(const src of auraSources)for(const a of src.auras){
      if(a.targets==='self'&&src.i!==j||a.targets==='others'&&src.i===j)continue;
      if(a.targets==='one'&&!(oneReceivers.get(src.i)?.has(j)||a.self_always&&src.i===j))continue;
      if(a.targets!=='one'&&src.i!==j&&buffTargets[src.code]&&!buffTargets[src.code].includes(u.code))continue;
      let up=1;
      if(a.uptime?.fixed!=null)up=a.uptime.fixed;
      else if(a.uptime){
        const h=units[src.i].model,base=h.forms[0].aps;
        const rate=a.uptime.proc!=null?null:(h.events.find(e=>e.index===a.uptime.cast_event)?.rate??0);
        up=a.uptime.proc!=null?1-Math.pow(1-a.uptime.proc,base*a.uptime.duration):Math.min(1,rate*a.uptime.duration);
      }
      // group: buffs the tooltip says do not stack with each other ("다른 가속 스킬과 중복 불가능") share one slot,
      // like the same buff id (the stronger value is kept, uptimes combine).
      const key=a.group?a.group+':'+a.kind:a.id,prev=byId.get(key);
      byId.set(key,{a:prev&&prev.a.value>a.value?prev.a:a,miss:(prev?prev.miss:1)*(1-up)});
    }
    const buffs={attack_pct:0,attack_flat:0,aps:0,mana_regen:0};
    for(const {a,miss} of byId.values())buffs[a.kind]+=a.value*(1-miss);
    // 새턴 A13G (ACac) and 나스쥬로 A13E are enemy-side auras on every allied unit; they add like other auras.
    buffs.attack_pct+=curse.ally_attack??0;buffs.aps+=curse.ally_aps??0;
    if(u.greenBlood)buffs.aps+=.3;   // A13C AIsx Isx1 0.30
    u.buffs=buffs;
  }
  // Heroes' own enemy armor auras (data hero.own_armor_cut, 2.323 buff_lines "방어력 감소 N", 수정내역 29): with
  // options.heroArmorCuts they add to options.cut, once per distinct hero (copies share the aura's buff; different
  // heroes' auras have different buffs and add). Off by default: options.cut (201) already stands for 풀깍.
  // Engine-built supports carry their own armor auras too (수정내역 37, 2.323 buff_lines: L7 레일리 "방어력 감소 20",
  // L25 울티 "방어력 감소 27").
  const heroCut=options.heroArmorCuts?[...new Set(units.filter(u=>u.kind==='hero'||u.kind==='support').map(u=>u.code))]
    .reduce((a,code)=>a+(heroMap.get(code)?.own_armor_cut??SUPPORT_ARMOR_CUTS[code]??0),0):0;
  const cut=clamp((options.cut??201)+heroCut,0,300),coverage=clamp(options.coverage??1,0,1);
  const resourceMode=['start','empty','perRound'].includes(options.resourceMode)?options.resourceMode:
    options.fullResource===false?'empty':'start';
  const fullResource=resourceMode!=='empty',summons=options.summons!==false;
  for(const u of units)if(u.kind==='conditional')u.energy=fullResource?(u.code==='I8'?45:u.code==='H15'?100:150):0;
  const red=options.red!==false,redDamage=red&&options.redDamage!==false;
  // 새턴 A13G (ACac) adds to Red Force's +35% like any attack aura (supports, conditional units, Red Force).
  const allyAttack=curse.ally_attack??0;
  const frankyLinked=options.frankyAura!==false&&units.some(u=>u.code==='TR28');
  const sunnyUnits=units.filter(u=>u.code==='H15');
  const sunnyStagger=options.sunnyStagger===true;
  for(const [index,u] of sunnyUnits.entries())u.openingDelay=sunnyStagger&&sunnyUnits.length>1?
    index*(100/(u.model.aps+(frankyLinked?5:0)))/sunnyUnits.length:0;
  // TR19 수상한 씨앗 상자: plant counts per kind (option tr19Plants), at most hero.plants.max in total.
  const plantCount=(hero,kind)=>{
    const p=hero.plants;if(!p)return 1;
    const chosen={...p.default,...(options.tr19Plants??{})};
    let left=p.max;const out={};
    for(const k of Object.keys(p.default)){out[k]=Math.min(left,Math.max(0,Math.floor(chosen[k]??0)));left-=out[k];}
    return out[kind]??0;
  };
  // Team effects of heroes in the team (data hero.team_effects, 수정내역 27): 마방깎 levels, magic/explosive/all
  // amplification. One copy of a hero applies them once; they add to the context options (same caps). Do not also
  // tick the same effect in the web's effect list.
  const teamFx={magic_cut_levels:0,magic_amp:0,explosive_amp:0,normal_only_explosive_amp:0,all_amp:0};
  for(const code of new Set(units.filter(u=>u.kind==='hero').map(u=>u.code))){
    const fx=heroMap.get(code).team_effects;
    if(fx)for(const k of Object.keys(teamFx))teamFx[k]+=fx[k]??0;
  }
  const magicReduction=clamp((options.magicReduction??0)+teamFx.magic_cut_levels*.01,0,.35);
  const magicAmp=clamp((options.magicAmp??0)+teamFx.magic_amp,0,.25);
  const allAmp=clamp((options.allAmp??0)+teamFx.all_amp,0,5);
  const explosiveAmp=clamp((options.explosiveAmp??0)+teamFx.explosive_amp,-.25,.25);  // TR24 코비: −10%
  const normalOnlyExplosiveAmp=clamp((options.normalOnlyExplosiveAmp??0)+teamFx.normal_only_explosive_amp,0,.25);
  // A04Q: level L = 0.79 + 0.01 x L (16 = 0.95, 악몽 11 = 0.90); 워큐리 lowers the level, minimum level 1.
  const defenceFactor=clamp(.79+.01*Math.max(1,diff.magic_level-(curse.magic_levels??0))+magicReduction,.80,1.15);
  const magicFactor=defenceFactor*(1+magicAmp);
  const custom=options.customMagic??{};
  const customRate=clamp(custom.aps??5,0,100)*clamp(custom.chance??.15,0,1);
  const customFlat=clamp(custom.flat??0,0,1e10),customMax=clamp(custom.maxPct??0,0,1);
  const customCurrent=clamp(custom.currentPct??0,0,1),customLost=clamp(custom.lostPct??0,0,1);
  const sc=options.singleControl;
  const singleControl=sc&&sc.to15>0&&sc.finish>0?{to15:clamp(sc.to15,.1,120),finish:clamp(sc.finish,.1,120)}:null;
  const finish=options.finisher??{},finishMode=finish.mode??'off';
  const finishInterval=clamp(finish.interval??5,.5,60);
  const finishChance=clamp(finish.successChance??1,0,1);
  const finishFlat=clamp(finish.flat??0,0,1e10),finishMax=clamp(finish.maxPct??0,0,1);
  const finishCurrent=clamp(finish.currentPct??0,0,1),finishLost=clamp(finish.lostPct??0,0,1);
  const finishType=finish.damageType??'magic';
  const deleteOptions=options.deletion??{};
  const deleteSeed=clamp(Math.floor(deleteOptions.seed??202323),0,2147483647);
  for(const [index,u] of units.entries())if(u.kind==='deleter'||u.code==='H15'){
    let hash=0;
    for(const ch of u.code)hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;
    u.rngState=(deleteSeed^hash^Math.imul(index+1,0x9e3779b9))>>>0||1;
  }
  const random=u=>{
    let x=u.rngState;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    u.rngState=x>>>0;
    return u.rngState/4294967296;
  };
  const deleteCounts={L12:0,D4:0,L19:0},executeCounts={};
  // Position model (options.positionModel): every unit stands at the line spawn point; mobs walk the
  // 2.305 waypoint loop (data.line_path). Each hero attacks only mobs within its attack range, AoE hits
  // only mobs within the skill radius, stuns stop movement and slows reduce speed (floor MinUnitSpeed).
  const lp=options.positionModel===true?data.line_path:null,posModel=!!lp;
  const pathPts=lp?lp.loop:[],pathSeg=[];let pathLen=0;
  for(let i=0;i<pathPts.length;i++){
    const a=pathPts[i],b=pathPts[(i+1)%pathPts.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    pathSeg.push({a,b,start:pathLen,len});pathLen+=len;
  }
  const spawnPt=lp?{x:lp.loop[0][0],y:lp.loop[0][1]}:null;
  const place=m=>{
    if((m.kind==='frenzy'||m.shuttle)&&lp.frenzy){
      const [a,b]=lp.frenzy.shuttle,d=Math.hypot(b[0]-a[0],b[1]-a[1]),u=m.s%(2*d),f=(u<=d?u:2*d-u)/d;
      m.x=a[0]+(b[0]-a[0])*f;m.y=a[1]+(b[1]-a[1])*f;return;
    }
    const u=((m.s%pathLen)+pathLen)%pathLen;
    const seg=pathSeg.find(g=>u<=g.start+g.len)??pathSeg[pathSeg.length-1],f=(u-seg.start)/seg.len;
    m.x=seg.a[0]+(seg.b[0]-seg.a[0])*f;m.y=seg.a[1]+(seg.b[1]-seg.a[1])*f;
  };
  const dist=(m,c)=>Math.hypot(m.x-c.x,m.y-c.y);
  // Same slow aura (id) never stacks: the highest value applies. Different auras add.
  const enemySlowAuras=new Map();
  if(posModel)for(const u of units)if(u.kind==='hero')for(const a of u.model.enemy_slow_auras??[])
    if(!(enemySlowAuras.get(a.id)?.value>=a.value))enemySlowAuras.set(a.id,a);
  // 2.320 패왕의길 항법: summons legend unit 레오 with a 10% move-speed reduction aura (option leo).
  // Its range and support damage are not published: range 800 [추정], damage not modeled.
  if(posModel&&options.leo===true&&!(enemySlowAuras.get('LEO')?.value>=.1))enemySlowAuras.set('LEO',{id:'LEO',value:.1,range:800});
  // Every unit is bunched at the spawn point, so one engage range applies to all (user decision).
  const engageRange=lp?clamp(options.engageRange??lp.engage_range,100,3000):0;
  // Stuns and slows proc randomly (seeded) so stun chains can leak; damage stays an expected value.
  let ccState=(clamp(Math.floor((options.deletion??{}).seed??202323),0,2147483647)^0x5bd1e995)>>>0||1;
  const ccRandom=()=>{ccState^=ccState<<13;ccState^=ccState>>>17;ccState^=ccState<<5;ccState>>>=0;return ccState/4294967296;};
  // Separate seeded stream for random-target draws so they do not shift the stun/slow sequence.
  let pickState=(clamp(Math.floor((options.deletion??{}).seed??202323),0,2147483647)^0x27d4eb2f)>>>0||1;
  const pickRandom=()=>{pickState^=pickState<<13;pickState^=pickState>>>17;pickState^=pickState<<5;pickState>>>=0;return pickState/4294967296;};
  // External control (position model, 수정내역 23): a slow on every enemy (e.g. 1.02 = full slow on 신)
  // and stun sources without damage {rate per s, radius, normal, hero} centred on the shared attack target.
  const externalSlow=clamp(options.externalSlow??0,0,3);
  const externalStuns=Array.isArray(options.externalStuns)?options.externalStuns:[];
  const ccProcs=rate=>{let n=0;const p=1-Math.exp(-rate*.1);while(n<20&&ccRandom()<p)n++;return n;};
  const slowOf=m=>{
    let sum=0;
    if(m.slows)for(const v of Object.values(m.slows))if(v.until>now)sum+=v.value;
    for(const a of enemySlowAuras.values())if(dist(m,spawnPt)<=a.range)sum+=a.value;
    return sum+externalSlow;
  };
  // WC3: speed = (base + flat bonuses) x (1 + sum of % modifiers), clamped to [MinUnitSpeed, MaxUnitSpeed].
  // Flat: R024 (line and frenzy, not bosses). %: difficulty aura AUau, 나스쥬로 A13F, minus every slow.
  // 신: (300 + 87) x (1.25 - slow) reaches 89 at slow 102% (ORDR's 신 slow target).
  const move=m=>{
    if((m.stunnedUntil??0)>now)return;
    const base=m.speed+(m.kind==='boss'?0:diff.speed.line_flat);
    const pct=1+diff.speed.aura+(curse.enemy_speed??0)-slowOf(m);
    m.s+=clamp(base*pct,lp.min_speed,lp.max_speed??490)*.1;place(m);
  };
  // Attack target in range: bosses and frenzy mobs first (players focus them), then the nearest line mob.
  const pickTarget=range=>{
    if(!posModel)return specials[0]??mobs[0]??null;
    const near=list=>list.filter(m=>m.hp>0&&dist(m,spawnPt)<=range).sort((a,b)=>dist(a,spawnPt)-dist(b,spawnPt))[0];
    return near(specials)??near(mobs)??null;
  };
  // Bosses and frenzy mobs carry A08Q (Resistant Skin) only on 신·악몽 (R01R); 지옥 takes the normal duration.
  const stunFor=(m,st)=>m.kind==='line'||!diff.stun_resist?st.normal:m.kind==='boss'?(st.boss??st.hero??st.normal):(st.hero??st.normal);
  const applyStun=(m,st)=>{const d=stunFor(m,st);if(d)m.stunnedUntil=Math.max(m.stunnedUntil??0,now+d);};
  // One buff id holds one slow: the last application replaces value and duration (WC3 same-buff rule).
  // Thunder Clap (AHtc) copies without a custom buff all share BHtc (data slow.buff), so they overwrite each other.
  const applySlow=(m,sl,key)=>{
    const d=m.kind==='line'||!diff.stun_resist?sl.duration:(sl.hero_duration??sl.duration);
    (m.slows??={})[sl.buff??key]={value:sl.value,until:now+d};
  };
  const cov=posModel?1:coverage;
  const sourceDamage={};
  const lineDamage={area:0,basic:0,single:0,finisher:0,magic:0,physical:0,fixed:0};
  const mobs=[],specials=[],checkpoints=[],timeline=[];
  const control={sunnyCasts:0,sunnyProcExpected:0,frankyAuraSeconds:0,
    activeLineMobSeconds:0,stunnedLineMobSeconds:0,stunFieldSeconds:0};
  let totalLineSpawned=0,totalLineKilled=0,finisherAttempts=0,finisherKills=0,successBank=0;
  // 양분 counters (option tr6Nutrients = stacks at the start of round 60), one per hero code (= per player).
  const nutrients={};
  const nutrientState=hero=>nutrients[hero.code]??={S:clamp(Math.floor(options[hero.nutrients.option]??hero.nutrients.default),0,hero.nutrients.cap)};
  const casts=new Map(units.map((u,i)=>[i,u.kind==='support'?supportCastSchedule(u.code,fullResource):[]]));
  // Timed armor reductions per mob: one entry per debuff key (same skill refreshes, different skills add).
  let now=0;
  // Enemy armor auras of temporary summons (data enemy_armor_auras): value x probability that at least
  // one summon is present, 1 - exp(-chance x attacks per second x duration). Same id applies once.
  const armorAuras=new Map();
  for(const u of units)if(u.kind==='hero')for(const a of u.model.enemy_armor_auras??[]){
    const up=a.uptime?1-Math.exp(-a.uptime.proc*u.model.forms[0].aps*a.uptime.duration):1;
    const prev=armorAuras.get(a.id);armorAuras.set(a.id,{...a,eff:a.value*(1-(1-up)*(prev?1-prev.eff/a.value:1))});
  }
  // MECH-A: per-mob integer stacks (TR21 나이 조작 A04P), once-per-target flags, round lowering (Z5 뒤로뒤로).
  const stackArmor={};
  for(const u of units)if(u.kind==='hero'&&u.model.age_stack)stackArmor[u.model.age_stack.key]=u.model.age_stack.armor_per_stack??0;
  // WC3 SetUnitAbilityLevel above alev is ignored (over_cap 'ignore'); 'clamp' caps instead.
  const stackAdd=(m,spec,n)=>{const st=m.stk??={},cur=st[spec.key]??0;
    if(cur+n<=spec.max)st[spec.key]=cur+n;else if(spec.over_cap==='clamp')st[spec.key]=spec.max;};
  const lowerCounts={moved:0,killed:0};
  const TYPE_ROUND={normal:60,large:61,fort:62,hero:64};
  const levelStats=L=>{
    const k=String(L),r=diff.rounds[k];
    if(r)return {hp:r[0]+diff.common.hp+(curse.line_hp??0),armor:r[1],typeRound:L};
    const t=data.mob_levels?.[k];
    if(!t||diff.line_hp_mult==null||diff.line_armor_level==null)return null;
    return {hp:t.uhpm*diff.line_hp_mult+diff.common.hp+(curse.line_hp??0),armor:t.udef+t.udup*diff.line_armor_level,typeRound:TYPE_ROUND[t.udty]};
  };
  // 2.305 sGM j:23762-23831: level = acquire range; new level = level - rand(drop); 39 -> 41, x0 (<=50) -> +1;
  // new level <= round - kill_at: killed; else O3M j:23723: new DU[level] at the frenzy spawn rect, HP = ratio x hp_keep.
  const lowerMob=(m,lr,round)=>{
    let V=(m.level??m.round)-(lr.drop[0]+Math.floor(pickRandom()*(lr.drop[1]-lr.drop[0]+1)));
    if(V===39)V+=2;if(V%10===0&&V<=50)V+=1;
    const s=V>round-lr.kill_at?levelStats(V):null;
    if(!s){m.hp=0;lowerCounts.killed++;return;}
    const ratio=Math.max(0,m.hp)/m.maxhp*lr.hp_keep;
    for(const k of ['debuffs','slows','stk','once','approached','huntSingle','huntArea','stunnedUntil'])delete m[k];
    Object.assign(m,{level:V,maxhp:s.hp,hp:s.hp*ratio,armor:s.armor,typeRound:s.typeRound,ab:0});
    if(m.kind==='frenzy'){specials.splice(specials.indexOf(m),1);m.kind='line';mobs.push(m);totalLineSpawned++;}
    lowerCounts.moved++;
    if(posModel){m.shuttle=true;m.s=0;m.speed=lp.mob_speed;place(m);}
  };
  const debuffSum=m=>{
    let sum=0;
    if(m.stk)for(const k in m.stk)sum+=m.stk[k]*(stackArmor[k]??0);
    for(const a of armorAuras.values())if(!posModel||dist(m,spawnPt)<=a.range)sum+=a.eff;
    if(m.debuffs)for(const d of Object.values(m.debuffs))if(d.until>now)sum+=d.value;
    if(m.huntSingle>0)sum+=Math.min(145,70+5*m.huntSingle);
    if(m.huntArea>0)sum+=Math.min(30,3*m.huntArea);
    return sum;
  };
  const applyDebuff=(m,d,scale)=>{
    if(d.min_ab&&m.ab<d.min_ab)return;
    const list=m.debuffs??={},cur=list[d.key],until=now+(d.duration??Infinity),value=d.value*scale;
    if(cur&&d.once)return;
    if(!cur||cur.until<=now)list[d.key]={value,until};
    else{cur.value=Math.max(cur.value,value);cur.until=Math.max(cur.until,until);}
  };
  const armor=(m,extra)=>m.armor+(curse.armor??0)+(m.kind==='line'?extra:0)-cut-m.ab-debuffSum(m);
  // Per-mob debuffs (event mob_debuff, 수정내역 31): magic amp (A04R), magic defence cut levels (A04Q), explosive amp
  // (A11S) and all-damage amp stay on the mob that was hit and add to the team values under the same caps.
  const mobMagic=m=>{
    const d=m.dbf;if(!d)return magicFactor;
    const red=clamp((options.magicReduction??0)+teamFx.magic_cut_levels*.01+(d.magic_cut_levels??0)*.01,0,.35);
    return clamp(.79+.01*Math.max(1,diff.magic_level-(curse.magic_levels??0))+red,.80,1.15)*(1+Math.min(.25,magicAmp+(d.magic_amp??0)));
  };
  const mobDebuff=(m,dbf,share)=>{
    const d=m.dbf??={};
    // dbf.nonstack [keys] (수정내역 41): a single-instance buff ("다른 속공과 중복되지 않습니다") — the expected share of
    // having been hit at least once, at most v, instead of adding per hit.
    for(const [k,v] of Object.entries(dbf)){
      if(k==='note'||k==='nonstack')continue;
      if(dbf.nonstack?.includes(k)){const h=m.dbfHit??={};h[k]=Math.min(1,(h[k]??0)+share);d[k]=Math.max(d[k]??0,Math.min(MOB_DEBUFF_CAP[k]??1,v*h[k]));}
      else d[k]=Math.min(MOB_DEBUFF_CAP[k]??1,(d[k]??0)+v*share);
    }
  };
  const factor=(kind,m,extra)=>kind==='physical'?pf(armor(m,extra)):kind==='magic'?mobMagic(m):
    kind==='explosive'?1+Math.min(.25,explosiveAmp+(m.dbf?.explosive_amp??0)+(m.kind==='line'?normalOnlyExplosiveAmp:0))+(curse.explosive??0):1;
  // options.controlOnly [codes] (수정내역 32): those units deal no damage but keep stuns and slows (control evaluation).
  const controlOnly=new Set(options.controlOnly??[]);
  const holdStat={samples:0,count:0,share:0,gaps:0,gapSum:0,gapSq:0,piled:0,stunned:0,free:0,leaks:0,episodes:0,exits:0,dwell:0};
  const deal=(m,amount,source,scope,kind)=>{
    if(!m||m.hp<=0||!Number.isFinite(amount)||amount<=0||controlOnly.has(source))return;
    amount*=1+allAmp+(m.dbf?.all_amp??0);
    const applied=Math.min(m.hp,amount);
    m.hp-=amount;
    if(m.kind==='line'){
      sourceDamage[source]=(sourceDamage[source]??0)+applied;
      lineDamage[scope]+=applied;
      if(kind in lineDamage)lineDamage[kind]+=applied;
    }
  };
  // Command Aura (ACac) bonuses add before multiplying base attack in WC3: Red Force A0BC +35%
  // plus the hero's own aura (data attack_aura: I11 A0Q1 -75%, E1/E2 A0UD +25%).
  // TR11/TR19 multipliers are crit expectations; Z2 +3000 x 전설의 후예 level is bonus damage outside the aura.
  const heroAttack=(u,form)=>{
    const hero=u.model,b=u.buffs;
    let attack=form.attack*(1+(red?.35:0)+b.attack_pct)+b.attack_flat;
    if(hero.level_growth)attack+=hero.level_growth.attack_per_level*u.level;
    return attack;
  };
  // Crit as an expected multiplier 1 + chance x (mult - 1). form.crit: basic-attack crit (target and
  // splash); form.target_crit: '타격' crit on the attack target only; event.crit: skill crit.
  const critEV=c=>c?1+c[0]*(c[1]-1):1;
  // Story target (수정내역 39·40): the tooltip's story damage (story_parts), else its boss/story line (boss_parts, then
  // nonline_parts), else the tooltip damage as written, percent parts included (user: area percent skills such as
  // 시라호시 초월 apply as the tooltip says; single percent skills carry their own boss/story lines).
  const storyEvent=e=>e.story_parts?{...e,parts:e.story_parts}:e.boss_parts?{...e,parts:e.boss_parts}:
    e.nonline_parts?{...e,parts:e.nonline_parts}:e;
  const eventDamage=(event,m,attack,extra)=>{
    let out=0;
    for(const [kind,flat,perc,mul=0] of event.parts){
      let raw=flat+mul*attack;
      for(const [basis,ratio] of perc){
        const hp=basis==='max'?m.maxhp:basis==='current'?Math.max(0,m.hp):m.maxhp-Math.max(0,m.hp);
        raw+=ratio*hp;
      }
      out+=raw*factor(kind,m,extra);
    }
    // Armor-break scaled parts: ab_fixed adds fixed damage per AB point (Z10 카류우돈),
    // ab_scaling raises the whole skill by that fraction per AB point (TR22).
    if(event.ab_fixed)out+=event.ab_fixed*m.ab*factor('fixed',m,extra);
    if(event.ab_scaling)out*=1+event.ab_scaling*m.ab;
    // One proc cannot deal more than this share of the target's max HP (overkill on one target is lost).
    if(event.per_proc_cap_maxhp!=null)out=Math.min(out,event.per_proc_cap_maxhp*m.maxhp);
    return out;
  };
  const snapshot=()=>({remaining:mobs.length+specials.length,lineRemaining:mobs.length,
    averageAb:mobs.length?mobs.reduce((a,m)=>a+m.ab,0)/mobs.length:0});
  let storyKill=null;
  const result=(clear,failedRound=null,failedSecond=null)=>({clear,failedRound,failedSecond,
    story:options.story?{killed:storyKill!=null,second:storyKill,hpLeft:specials.find(x=>x.kind==='story')?.hp??0}:null,
    ...snapshot(),checkpoints,timeline,totalLineSpawned,totalLineKilled,
    holding:holdStat.samples?(()=>{const H=holdStat,m=H.gaps?H.gapSum/H.gaps:0,v=H.gaps?H.gapSq/H.gaps-m*m:0;
      return {radius:options.holding.radius??600,inZone:H.count/H.samples,share:H.share/H.samples,gapMean:m,gapCV:m?Math.sqrt(Math.max(0,v))/m:0,piled:H.gaps?H.piled/H.gaps:0,
        stunnedShare:H.stunned+H.free?H.stunned/(H.stunned+H.free):0,leakChance:H.episodes?H.leaks/H.episodes:0,
        exitsPerMin:H.exits/(H.samples*.5/60),dwellMean:H.exits?H.dwell/H.exits:0};})():null,
    chosenBuffs:Object.fromEntries([...oneReceivers].map(([i,got])=>[`${units[i].code}#${units.slice(0,i).filter(x=>x.code===units[i].code).length}`,[...got].map(j=>units[j].code)])),
    finisherAttempts,finisherKills,lineDamage,sourceDamage,deleteCounts,executeCounts,control,lowerCounts,
    justiceLog:Object.fromEntries(units.map((u,i)=>[u.code+'#'+i,u.justiceLog]).filter(x=>x[1])),
    buffs:units.map(u=>u.buffs?{code:u.code,...u.buffs}:null).filter(Boolean),unitCount:units.length,
    magicFactor,cut,coverage,resourceMode,positionModel:posModel,difficulty:diffName,gorosei:goroName??'없음',armorModel,defeatThreshold:diff.defeat,
    // Unresolved model assumptions of the heroes in the team (data hero.assumptions), shown by the web and CLI.
    mobTable,
    assumptions:[...new Set(units.flatMap(u=>u.kind==='hero'?u.model.assumptions??[]:[]))],
    nutrients:Object.fromEntries(Object.entries(nutrients).map(([k,v])=>[k,+v.S.toFixed(2)])),
    // Skill level of each growing hero copy (level_growth): start at round 60 and expected level at the end.
    greenBlood:gbState&&!gbState.applied&&gbState.reason==='조합에 없음'&&SUPPORTS[gbCode]?{code:gbCode,applied:false,reason:'엔진 내장 보조 유닛은 미지원'}:gbState,
    levels:Object.fromEntries(units.map((u,i)=>[u,i]).filter(([u])=>u.level!=null).map(([u,i])=>[u.code+'#'+i,{start:u.levelStart,end:+u.level.toFixed(2)}]))});

  // Mob values actually used per round (difficulty, 2.323 common HP, 오로성, armor model) for reports.
  const mobTable={};
  for(const r of [60,61,62,63,64,65]){
    const k=String(r),legacy=armorModel==='data'?diff.armor_legacy:null,[hp,armor]=diff.rounds[k];
    const lineArmor=(legacy?.line[k]??armor)+(curse.armor??0);
    const row={hp:hp+diff.common.hp+(curse.line_hp??0),armor:lineArmor};
    if(diff.boss[k])row.special={type:'boss',hp:diff.boss[k][0]+diff.common.hp+(curse.boss_hp??0),armor:(legacy?.boss[k]??diff.boss[k][1])+(curse.armor??0)};
    else if(diff.frenzy[k])row.special={type:'frenzy',hp:diff.frenzy[k]+diff.common.hp+(curse.line_hp??0),armor:lineArmor+(diff.frenzy_aura?.armor??0)};
    mobTable[k]=row;
  }
  // Story mode (수정내역 38): options.story {hp, armor, regen, seconds} = one stationary story unit (2.305 w3u n000~n009,
  // fort armor, the same armor/magic debuff abilities as line mobs). No line, boss or frenzy; no defeat; the run ends
  // when the story dies or after `seconds`. Result `story {killed, second}`.
  const story=options.story??null;
  const loopRounds=story?Array.from({length:Math.max(1,Math.ceil((story.seconds??600)/32))},(_,i)=>60+i):rounds;
  for(const round of loopRounds){
    const legacyArmor=armorModel==='data'?diff.armor_legacy:null;
    const [lineHp,mapArmor]=diff.rounds[String(round)]??[0,0],armor0=legacyArmor?.line[String(round)]??mapArmor;
    const hp0=lineHp+diff.common.hp+(curse.line_hp??0);
    let spawned=0,specialKill=null;
    if(story&&round===60){
      // Fort armor: attack-type multipliers of round 62 (fort line mob). Not an arrival (no approach skills).
      specials.push({hp:story.hp,maxhp:story.hp,armor:story.armor,ab:0,kind:'story',round,typeRound:'62',regen:story.regen??0,arrived:true});
    }
    if(!story&&diff.boss[String(round)]){
      const [bossHp,dataBossArmor]=diff.boss[String(round)],hp=bossHp+diff.common.hp+(curse.boss_hp??0);
      const baseArmor=legacyArmor?.boss[String(round)]??dataBossArmor;
      const boss={hp,maxhp:hp,armor:baseArmor,ab:0,kind:'boss',round};
      if(posModel){boss.s=0;boss.speed=lp.boss_speed;place(boss);}
      specials.push(boss);
    }
    for(let step=0;step<320;step++){
      const t=step*.1,globalT=(round-60)*32+t,globalStep=(round-60)*320+step;
      now=globalT;
      let newMob=null;
      if(!story&&step%5===0&&spawned<35){
        newMob={hp:hp0,maxhp:hp0,armor:armor0,ab:0,kind:'line',round};
        if(posModel){newMob.s=0;newMob.speed=lp.mob_speed;place(newMob);}
        mobs.push(newMob);spawned++;totalLineSpawned++;
      }
      if(!story&&diff.frenzy[String(round)]&&step===75){
        const hp=diff.frenzy[String(round)]+diff.common.hp+(curse.line_hp??0);
        const frenzy={hp,maxhp:hp,armor:armor0+(diff.frenzy_aura?.armor??0),ab:0,kind:'frenzy',round};
        if(posModel){frenzy.s=0;frenzy.speed=lp.mob_speed;place(frenzy);}
        specials.push(frenzy);
      }
      for(let i=mobs.length-1;i>=0;i--)if(mobs[i].hp<=0){mobs.splice(i,1);totalLineKilled++;}
      for(let i=specials.length-1;i>=0;i--)if(specials[i].hp<=0)specials.splice(i,1);
      if(story&&!specials.length){storyKill=+globalT.toFixed(1);return result(true);}
      if(story&&globalT>=(story.seconds??600))return result(false);
      if(!story&&!options.holding?.noDefeat&&mobs.length+specials.length>=diff.defeat){
        timeline.push({second:globalT,count:mobs.length+specials.length,round});
        return result(false,round,+t.toFixed(1));
      }
      const active=specials.find(s=>s.round===round);
      const bossAura=specials.some(s=>s.kind==='boss'),frenzyAura=specials.some(s=>s.kind==='frenzy');
      const extraArmor=(bossAura?10:0)+(frenzyAura?diff.frenzy_aura?.armor??0:0);
      // Enemies arriving this step: the new line mob, the round's boss (step 0) and frenzy mob (7.5 s).
      const arrivals=[newMob,...specials.filter(s=>s.round===round&&!s.arrived)].filter(Boolean);
      for(const s of arrivals)s.arrived=true;
      for(const m of arrivals)for(const u of units){
        if(u.kind!=='hero'||!u.damage)continue;
        const hero=u.model,form=formAt(hero,globalT,t,resourceMode).form;
        const attack=heroAttack(u,form);
        for(const e0 of u.events){
          const e=u.level==null?e0:levelEvent(e0,u);
          if(!summons&&isSummon(e))continue;
          if(e.on_spawn&&m===newMob){
            deal(newMob,e.on_spawn*eventDamage(e,newMob,attack,extraArmor),hero.code,'area','mixed');
            if(e.ab&&newMob.hp>0)abAdd(newMob,e.ab*e.on_spawn);
            if(e.armor_debuff&&newMob.hp>0)applyDebuff(newMob,e.armor_debuff,e.on_spawn);
          }
          // on_approach (Z8 접근 스킬, 2.305 j:79460-79512): each enemy rolls once in its life when it first
          // comes near (the map marks it with turn speed 0.49, shared by every copy of the hero): chance
          // line / special (boss·frenzy 100%). parts hit every enemy within radius of the approaching one,
          // single_parts hit the approaching enemy only.
          const ap=e.on_approach;
          if(!ap)continue;
          const key=`${hero.code}:${e.index}`;
          if((m.approached??=new Set()).has(key))continue;
          m.approached.add(key);
          const p=m.kind==='line'?ap.line:ap.special;
          if(!p)continue;
          const area=[...mobs,...specials].filter(x=>x.hp>0&&(!posModel||dist(x,m)<=(e.radius??lp.default_radius)));
          for(const x of area){
            const share=p*(x===m||posModel?1:cov);
            deal(x,share*eventDamage(e,x,attack,extraArmor),hero.code,'area','mixed');
            if(e.ab&&x.hp>0)abAdd(x,e.ab*share);
          }
          if(e.single_parts&&m.hp>0)deal(m,p*eventDamage({...e,parts:e.single_parts},m,attack,extraArmor),hero.code,'single','mixed');
          if(e.mob_debuff&&m.hp>0)mobDebuff(m,e.mob_debuff,p);   // 독심술 (MY8): the approaching enemy only
        }
      }
      // Regen per second: unit base (w3u uhpr, 61라 45,000), boss aura 500,000, frenzy aura (신 1,000,000,
      // 악몽 1,200,000, 지옥 none), difficulty common regen and 새턴 on every enemy.
      const enemyRegen=diff.common.regen+(curse.regen??0),frenzyRegen=diff.frenzy_aura?.regen??0;
      const unitRegen=r=>data.round_regen?.[String(r)]??0;
      const regen=(bossAura?500000:0)+(frenzyAura?frenzyRegen:0)+enemyRegen;
      for(const m of mobs){const g=(regen+unitRegen(m.level??m.round))*.1;if(g)m.hp=Math.min(m.maxhp,m.hp+g);}
      for(const s of specials)s.hp=Math.min(s.maxhp,s.hp+(s.kind==='story'?s.regen:(s.kind==='boss'?550000:frenzyRegen+unitRegen(s.round))+enemyRegen)*.1);
      if(posModel)for(const m of [...mobs,...specials])if(m.hp>0)move(m);
      // options.holding {radius, noDefeat} (수정내역 33): every 0.5 s, line mobs within `radius` of the units (the main
      // dealer's skill range): count, share of all line mobs, and how evenly they are spaced along the path (gap mean,
      // coefficient of variation, share of gaps under 25 = piled on one spot). Even spacing = a held straight line.
      if(posModel&&options.holding&&step%5===0&&globalT>=(options.holding.window?.[0]??0)&&globalT<=(options.holding.window?.[1]??1e9)){
        const H=holdStat;const R=options.holding.radius??600;
        const inZone=mobs.filter(m=>m.hp>0&&dist(m,spawnPt)<=R);
        H.samples++;H.count+=inZone.length;H.share+=mobs.length?inZone.length/mobs.length:0;
        const ss=inZone.map(m=>((m.s%pathLen)+pathLen)%pathLen).map(u=>u>pathLen/2?u-pathLen:u).sort((a,b)=>a-b);
        for(let i=1;i<ss.length;i++){const g=ss[i]-ss[i-1];H.gaps++;H.gapSum+=g;H.gapSq+=g*g;if(g<25)H.piled++;}
        // Stun leaks: share of in-zone mobs stunned now; a leak = an in-zone mob free (not stunned) for 1 s or more in a row.
        // A stun episode ends when a stunned mob is seen free; it leaked if the mob stays free 1 s or more.
        // Range exits (사용자 기준 "샘 = 범위 이탈"): a mob seen in range at the last sample and outside now has left;
        // dwell = time from entering (or spawning) in range to leaving.
        for(const m of mobs){
          const inside=inZone.includes(m);
          if(inside&&!m.inRange){m.inRange=true;m.enterT=now;}
          else if(!inside&&m.inRange){m.inRange=false;H.exits++;H.dwell+=now-m.enterT;}
        }
        // Leaving the range resets the record, so a mob coming back after a lap starts fresh.
        for(const m of mobs)if(!inZone.includes(m)){m.inStun=false;m.wasStunned=false;m.freeRun=0;}
        for(const m of inZone){
          if((m.stunnedUntil??0)>now){H.stunned++;if(!m.inStun){m.inStun=true;H.episodes++;}m.freeRun=0;}
          else{H.free++;m.inStun=false;m.freeRun=(m.freeRun??0)+.5;if(m.freeRun===1&&m.wasStunned)H.leaks++;}
          if(m.inStun)m.wasStunned=true;
        }
      }
      // Supports, Red Force and conditional units: engage range (default lp.engage_range), splash lp.support_splash.
      const globalTarget=pickTarget(engageRange);
      let target=globalTarget;
      if(posModel&&globalTarget)for(const x of externalStuns)for(let k=ccProcs(x.rate);k>0;k--)
        for(const m of [...mobs,...specials])if(m.hp>0&&dist(m,globalTarget)<=x.radius)applyStun(m,{normal:x.normal,hero:x.hero??x.normal});
      const aoeTargets=posModel?[...mobs,...specials].filter(m=>m===target||target&&dist(m,target)<=lp.support_splash)
        :[...mobs,...specials.filter(s=>s===target)];
      const hit=m=>m===target?1:coverage;

      // Armor break is stored on each individual enemy and survives wave changes.
      for(let i=0;i<units.length;i++){
        const u=units[i];if(u.kind!=='support')continue;
        const s=u.model,attack=s.attack*(1+(red?.35:0)+allyAttack);
        const cast=casts.get(i).some(x=>x>=globalT-1e-8&&x<globalT+.1-1e-8);
        if(u.ab&&s.abProc)for(const m of aoeTargets)if(m.hp>0)abAdd(m,s.aps*s.abProc*.1*hit(m));
        if(cast&&u.ab&&u.code!=='D3')for(const m of aoeTargets)if(m.hp>0)abAdd(m,s.abCast*hit(m));
        if(u.damage){
          if(target)deal(target,attack*s.aps*typeFor(s.attackType,target.typeRound??target.round,data)*pf(armor(target,extraArmor))*.1,u.code,'basic','physical');
          if(s.splash)for(const m of mobs)if(m!==target)
            deal(m,attack*s.aps*s.splash*typeFor(s.attackType,m.typeRound??m.round,data)*pf(armor(m,extraArmor))*.1*coverage,u.code,'area','physical');
          for(const m of aoeTargets){
            if(m.hp<=0)continue;
            let d=0,kind='mixed';
            if(u.code==='L23')d=s.aps*.1*(.05*182500*pf(armor(m,extraArmor))+.10*145000*magicFactor);
            if(u.code==='L25'){d=s.aps*.1*.15*(.85*attack+115000)*pf(armor(m,extraArmor));kind='physical';}
            if(u.code==='D3'){d=s.aps*.1*(.14*250000+.15*500000)*magicFactor;kind='magic';}
            if(u.code==='L7'&&cast)d+=1500000*pf(armor(m,extraArmor))+1000000*magicFactor;
            if(u.code==='L25'&&cast){d+=1.7*attack+230000;kind='fixed';}
            if(u.code==='D3'&&cast)d+=1815000*pf(armor(m,extraArmor))+650000*magicFactor;
            deal(m,d*hit(m),u.code,'area',kind);
          }
        }
        if(cast&&u.ab&&u.code==='D3')for(const m of aoeTargets)if(m.hp>0)abAdd(m,s.abCast*hit(m));
        if(posModel&&target&&u.damage)for(const sk of SUPPORT_STUNS[u.code]??[]){
          for(let k=sk.on==='cast'?(cast?1:0):ccProcs(s.aps*sk.chance);k>0;k--){
            for(const m of sk.stun.single?[target]:[...mobs,...specials].filter(m=>dist(m,target)<=sk.radius))if(m.hp>0)applyStun(m,sk.stun);
          }
        }
      }

      for(const u of units){
        if(u.kind==='magic'&&u.damage){
          for(const m of aoeTargets){
            const raw=customFlat+customMax*m.maxhp+customCurrent*Math.max(0,m.hp)+customLost*(m.maxhp-Math.max(0,m.hp));
            deal(m,customRate*.1*raw*magicFactor*hit(m),'MAGIC_CUSTOM','area','magic');
          }
          continue;
        }
        if(u.kind!=='hero'||!u.damage)continue;
        const hero=u.model,{form,transformed}=formAt(hero,globalT,t,resourceMode),baseAps=hero.forms[0].aps;
        if(posModel)target=pickTarget(hero.own_range?form.range:engageRange);
        let aps=form.aps;if(hero.code==='E10'&&transformed)aps=1/.11;
        // Attack-speed auras add to the form's bonus (aps x base cooldown - 1), capped at +400% in WC3.
        // 양분 (TR6, hero.nutrients, 수정내역 22): one counter per player shared by every copy. A transform
        // snapshots it (S_cast) and then adds +1; the transformed form gets +attack and +attack speed per
        // 10 stacks of S_cast for the whole window; every attack adds the expected per-attack gain.
        const nut=hero.nutrients,nst=nut?nutrientState(hero):null;
        if(nut){
          if(transformed&&!u.wasTransformed){u.castS=nst.S;nst.S=Math.min(nut.cap,nst.S+nut.per_transform);}
          u.wasTransformed=transformed;
        }
        const tens=nut&&transformed?Math.floor((u.castS??nst.S)/10):0;
        const apsBonus=u.buffs.aps+tens*(nut?.aps_per_10??0);
        if(apsBonus&&form.cooldown)aps=Math.min(5,aps*form.cooldown+apsBonus)/form.cooldown;
        const giant=['E1','E2'].includes(hero.code)&&inWindow(4.25,4.25+115/(baseAps+.25),globalT,t,resourceMode,true);
        if(giant)aps/=3.25;
        // A self attack-speed buff that holds while the attack target has enough armor break (TR29 운석낙하).
        // I11 약육강식: per-attack stacks on the target (single) and on area mobs; no duration in the tooltip.
        const hunt=hero.armor_stack_debuff;
        if(hunt&&target){
          const attacks=aps*.1,i=transformed?1:0;
          target.huntSingle=(target.huntSingle??0)+attacks*hunt.single_stacks[i];
          for(const m of [...mobs,...specials])m.huntArea=(m.huntArea??0)+attacks*hunt.area_stacks[i]*(m===target?1:coverage);
        }
        // Executioner state (Z10 처형자, 2.305 war3map.j 45618-45720): +1 mana per attack; when the attack
        // target has AB >= min_ab, not already active and mana >= need, spend cost for duration seconds of
        // +aps_bonus attack speed, during which boost_event procs on every attack plus a single fixed hit.
        const exe=hero.executioner;let executing=false;
        if(exe){
          const st=u.executioner??={mana:fullResource?exe.mana_max:0,until:-1};
          const qualifies=target&&target.ab>=exe.min_ab;
          if(qualifies&&st.until<=now&&st.mana>=exe.mana_need){st.mana-=exe.mana_cost;st.until=now+exe.duration;}
          executing=qualifies&&st.until>now;
          if(st.until>now)aps*=1+exe.aps_bonus;
          st.mana=Math.min(exe.mana_max,st.mana+aps*.1);
          if(executing){
            const n=aps*.1;
            deal(target,(target.kind==='boss'?exe.boss_fixed:exe.single_fixed)*n,u.code,'single','fixed');
            for(const m of [...mobs,...specials])if(m!==target&&m.hp>0)abAdd(m,exe.area_ab*n*coverage);
          }
        }
        const haste=hero.target_ab_aps_bonus;
        if(haste&&target&&target.ab>=haste.min_ab)aps*=1+haste.bonus;
        const attack=heroAttack(u,form)+tens*(nut?.attack_per_10??0);
        if(nut&&target)nst.S=Math.min(nut.cap,nst.S+aps*.1*nut.per_attack);
        if(target){
          const crit=critEV(form.crit);
          // attack_uptime: share of time the hero attacks (E6 난사 channels 1.27 s per cast).
          const up=hero.attack_uptime??1;
          deal(target,attack*crit*critEV(form.target_crit)*aps*up*form.rounds[String(target.typeRound??target.round)]*pf(armor(target,extraArmor))*.1,u.code,'basic','physical');
          if(form.splash)for(const m of mobs)if(m!==target&&(!posModel||dist(m,target)<=form.splash_radius))
            deal(m,attack*crit*aps*up*form.rounds[String(m.typeRound??m.round)]*pf(armor(m,extraArmor))*form.splash*.1*cov,u.code,'area','physical');
          // form.multishot (Aroc 다중 공격, 수정내역 31): every attack also sends `extra` missiles at other enemies within
          // `range` of the hero (position model: nearest first; basic model: line mobs in order). Each takes the basic
          // attack (type and armor; Barrage missiles carry no crit and no on-attack procs [추정]). Event target
          // 'multishot' hits the attack target plus these.
          const ms=form.multishot;
          if(ms){
            let pool=[...mobs,...specials].filter(m=>m!==target&&m.hp>0&&(!posModel||dist(m,spawnPt)<=ms.range));
            if(posModel)pool.sort((a,b)=>dist(a,spawnPt)-dist(b,spawnPt));
            u.msTargets=pool.slice(0,ms.extra);
            for(const m of u.msTargets)
              deal(m,attack*aps*up*form.rounds[String(m.typeRound??m.round)]*pf(armor(m,extraArmor))*.1,u.code,'area','physical');
          }else u.msTargets=[];
        }else u.msTargets=[];
        // MECH-C: hero.age_stack (TR21 2.305 UtM j:45865 / OEA j:36971 +10 per attack, then oJ → rHA j:76368:
        // every enemy within check_radius at max stacks without A0VG takes once_parts once, riA j:77294-77326).
        const ag=hero.age_stack;
        if(ag&&target){
          u.ageClock=(u.ageClock??0)+aps*(hero.attack_uptime??1)*.1;
          for(;u.ageClock>=1-1e-9;u.ageClock--){
            if(target.hp>0)stackAdd(target,ag,ag.per_attack);
            for(const m of [...mobs,...specials]){
              if(m.hp<=0||(m.stk?.[ag.key]??0)<ag.max||m.once?.has(ag.key)||posModel&&dist(m,spawnPt)>ag.check_radius)continue;
              (m.once??=new Set()).add(ag.key);
              deal(m,eventDamage({parts:ag.once_parts},m,attack,extraArmor),u.code,m===target?'single':'area','magic');
              if(posModel&&ag.line_stun&&m.kind==='line'&&m.hp>0)applyStun(m,ag.line_stun);
            }
          }
        }
        for(const e0 of u.events){
          const e=u.level==null?e0:levelEvent(e0,u);
          if(!summons&&isSummon(e))continue;
          if(e.phase==='trans'&&!transformed||e.phase==='base'&&transformed||e.phase==='giant'&&!giant||e.phase==='nongiant'&&giant)continue;
          let rate=e.rate*(e.per_attack?aps/baseAps:1);
          if(e.plant)rate*=plantCount(hero,e.plant);
          // Mana-regen buffs speed up mana skills only (resource_kind 'hp' skills spend HP, 수정내역 27).
          if(e.resource_cost&&e.resource_kind!=='hp'&&u.buffs.mana_regen)rate+=u.buffs.mana_regen/e.resource_cost;
          if(executing&&e.index===exe.boost_event)rate=aps;
          if(e.initial&&(resourceMode==='perRound'&&step===0||resourceMode==='start'&&globalStep===0))rate+=10;
          // execute_below (L27 사자의노래, 수정내역 30): the hero's attack clock (actual aps incl. buffs) runs every
          // step; on each whole attack, if the attack target is a line mob at or below execute_below x max HP, the
          // skill fires 100% and removes it. Line damage brings mobs down; only the attack target is checked (2.305).
          if(e.execute_below!=null){
            const bank=u.executeBank??={};
            bank[e.index]=(bank[e.index]??0)+aps*(hero.attack_uptime??1)*.1;
            // options.executeTarget 'lowest' (끝딜처럼 직접 지정): the attack goes to the line mob with the lowest HP
            // share within the hero's range (base model: any line mob) when that mob qualifies.
            const range=hero.own_range?form.range:engageRange;
            while(bank[e.index]>=1-1e-9){
              bank[e.index]-=1;
              let x=target;
              if(options.executeTarget==='lowest'){
                let best=null;
                for(const m of mobs)if(m.hp>0&&(!posModel||dist(m,spawnPt)<=range)&&(!best||m.hp/m.maxhp<best.hp/best.maxhp))best=m;
                x=best;
              }
              if(x?.kind==='line'&&x.hp>0&&x.hp<=e.execute_below*x.maxhp){
                x.hp=0;executeCounts[u.code]=(executeCounts[u.code]??0)+1;
              }
            }
            continue;
          }
          if(!rate)continue;
          if(e.min_target_ab&&!(target&&target.ab>=e.min_target_ab))continue;
          // min_hit {damage, ignore_on} (수정내역 41, L10 원혼 폭발 "단일 적에게 36만 이상의 피해를 가할시 (방어력계산포함)"):
          // fires only for basic hits on the attack target that reach `damage` after type and armor (crit included);
          // targets of a kind in ignore_on (보스·광폭) skip the condition.
          if(e.min_hit&&!(target&&(e.min_hit.ignore_on??[]).includes(target.kind))){
            if(!target)continue;
            const hit=attack*form.rounds[String(target.typeRound??target.round)]*pf(armor(target,extraArmor)),[cc,cm]=form.crit??[0,1];
            const frac=(hit>=e.min_hit.damage?1-cc:0)+(hit*cm>=e.min_hit.damage?cc:0);
            if(!frac)continue;
            rate*=frac;
          }
          if(e.when_target==='line'&&target?.kind!=='line')continue;   // fires only while attacking a line mob
          // Position model: a skill needs a target in range unless it is centred on the hero.
          const center=posModel?(e.center==='self'?spawnPt:target):null;
          if(posModel&&!center)continue;
          if(e.when_target_stack!=null&&(target?.stk?.[hero.age_stack?.key]??0)!==e.when_target_stack)continue;
          // Level growth: a proc of a listed skill (needs an attack target; 'target_special' only on a boss/frenzy)
          // levels up with growth.chance (expected value).
          const lg=hero.level_growth;
          if(lg&&u.level<lg.max&&lg.proc_events.includes(e.index)&&target&&(e.target!=='target_special'||target.kind!=='line'))
            u.level=Math.min(lg.max,u.level+rate*.1*lg.chance);
          // MECH-B: stack_target (TR17 철저한 정의, 2.305 j:76404-76422 + oLM j:72651-72716): on the first whole
          // attack on a boss/frenzy after `cooldown` s, cast with multiplier mult (same target as this hero's
          // last proc: +step, else 1). area_parts hit radius around the target, parts the target, frenzy_parts x1.
          const sj=e.stack_target;
          if(sj){
            const st=(u.stackState??={})[e.index]??={clock:0,ready:0,m:null,mult:0};
            st.clock+=aps*(hero.attack_uptime??1)*.1;
            for(;st.clock>=1-1e-9;st.clock--){
              if(!target||target.hp<=0||target.kind==='line'||now+1e-9<st.ready)continue;
              st.ready=now+sj.cooldown;st.mult=st.m===target?st.mult+sj.step:1;st.m=target;
              const k=st.mult*critEV(e.crit);
              for(const x of [...mobs,...specials])if(x.hp>0&&(x===target||!posModel||dist(x,target)<=sj.radius))
                deal(x,eventDamage({...e,parts:sj.area_parts},x,attack,extraArmor)*k*(x===target||posModel?1:cov),u.code,x===target?'single':'area','mixed');
              deal(target,eventDamage(e,target,attack,extraArmor)*k,u.code,'single','mixed');
              if(sj.frenzy_parts&&target.kind==='frenzy')deal(target,eventDamage({...e,parts:sj.frenzy_parts},target,attack,extraArmor),u.code,'single','fixed');
              if(posModel&&e.stun&&target.hp>0)applyStun(target,e.stun);
              (u.justiceLog??=[]).push(st.mult);
            }
            continue;
          }
          let targets;
          // Single-target kinds hit only the current attack target:
          // 'single' any target (boss_parts replaces parts against a boss), 'single_line' a line mob,
          // 'target_special' a boss or frenzy, 'boss' / 'frenzy' that kind only.
          const single=SINGLE_TARGETS.has(e.target);
          switch(e.target){
            case 'single':targets=target?[target]:[];break;
            case 'multishot':targets=target?[target,...(u.msTargets??[])]:[];break;
            case 'single_line':targets=target?.kind==='line'?[target]:[];break;
            case 'target_special':targets=target&&(target.kind==='boss'||target.kind==='frenzy'||target.kind==='story'&&e.story_hits)?[target]:[];break;
            case 'boss':targets=target&&(target.kind==='boss'||target.kind==='story'&&e.story_hits)?[target]:[];break;
            case 'frenzy':targets=target?.kind==='frenzy'?[target]:[];break;
            case 'line':targets=mobs;break;
            case 'special':targets=specials;break;
            case 'line_or_frenzy':targets=[...mobs,...specials.filter(s=>s.kind==='frenzy')];break;
            // 'random': candidates are the living enemies (position model: within pick_range of the hero); the
            // hits are sampled below (randomPicks), not spread, so a hit that kills one mob kills it.
            case 'random':targets=[...mobs,...specials].filter(m=>m.hp>0&&(!posModel||dist(m,spawnPt)<=(e.pick_range??engageRange)));break;
            default:targets=[...mobs,...specials];
          }
          const random=e.target==='random';
          if(random){
            // Whole procs from an expected-count bank (exact average timing); each proc makes `picks` draws,
            // each a uniformly chosen living candidate (seeded), and deals the full per-hit damage (수정내역 22).
            const bank=u.randomBank??={};
            bank[e.index]=(bank[e.index]??0)+rate*.1;
            for(;bank[e.index]>=1;bank[e.index]--)randomPicks(targets,e.picks??1,pickRandom,m=>{
              const ev=m.kind==='story'?storyEvent(e):e.nonline_parts&&m.kind!=='line'?{...e,parts:e.nonline_parts}:e;
              deal(m,eventDamage(ev,m,attack,extraArmor)*critEV(e.crit),u.code,'area','mixed');
              if(e.mob_debuff&&m.hp>0)mobDebuff(m,e.mob_debuff,1);
            },e.distinct===true);
            continue;
          }
          if(e.chain){
            // Whole procs from an expected-count bank, like random picks (수정내역 31).
            const bank=u.chainBank??={};
            bank[e.index]=(bank[e.index]??0)+rate*.1;
            for(;bank[e.index]>=1;bank[e.index]--){
              chainTargets(target,[...mobs,...specials],e.chain,posModel,dist).forEach((m,k)=>{
                const ev=m.kind==='story'?storyEvent(e):e.nonline_parts&&m.kind!=='line'?{...e,parts:e.nonline_parts}:e;
                deal(m,eventDamage(ev,m,attack,extraArmor)*critEV(e.crit)*(e.chain.factor??1)**k,u.code,k?'area':'single','mixed');
                if(posModel&&e.stun&&m.hp>0)applyStun(m,e.stun);
                if(e.mob_debuff&&m.hp>0)mobDebuff(m,e.mob_debuff,1);
              });
            }
            continue;
          }
          if(posModel&&!single)targets=targets.filter(m=>m===target||dist(m,center)<=(e.radius??lp.default_radius));
          const preTargets=targets;
          if(e.requires_stack!=null)targets=targets.filter(m=>(m.stk?.[hero.age_stack?.key]??0)===e.requires_stack);
          for(const m of targets)if(m.hp>0){
            // boss_parts replace parts against a boss; nonline_parts against a boss or frenzy (E6 "보스").
            let ev=m.kind==='story'?storyEvent(e):e.nonline_parts&&m.kind!=='line'?{...e,parts:e.nonline_parts}:e.boss_parts&&m.kind==='boss'?{...e,parts:e.boss_parts}:e;
            const ns=nut?.skill?.[e.index];
            if(ns)ev={...ev,parts:[...ev.parts,[ns.kind,ns.flat*(ns.basis==='cast'?(u.castS??nst.S):nst.S),[],0]]};
            const share=rate*.1*(m===target||single?1:cov);
            deal(m,eventDamage(ev,m,attack,extraArmor)*critEV(e.crit)*share,u.code,single?'single':'area','mixed');
            // Armor break as an expected stack per step, like the supports (cap 75 in abAdd).
            if(m.hp>0&&e.ab)abAdd(m,e.ab*share);
            if(m.hp>0&&e.mob_debuff)mobDebuff(m,e.mob_debuff,share);
            if(m.hp>0&&e.ab_target&&m===target)abAdd(m,e.ab_target*rate*.1);
          }
          // execute_line: each proc removes the attack target if it is a line mob (I3 순속·패기발산).
          // Procs accumulate as an expected-value bank, like the finisher success bank.
          // Stuns and slows (position model): each whole expected proc applies them to the hit mobs.
          if(posModel&&(e.stun||e.slow)){
            for(let k=ccProcs(rate);k>0;k--){
              for(const m of targets)if(m.hp>0){
                if(e.stun&&(!e.stun.single||m===target))applyStun(m,e.stun);
                if(e.slow)applySlow(m,e.slow,u.code+':'+e.index);
              }
            }
          }
          // armor_debuff: each whole proc applies the timed reduction to the skill's targets
          // (non-target mobs scaled by coverage).
          if(e.armor_debuff){
            const bank=u.debuffBank??={};
            bank[e.index]=(bank[e.index]??0)+rate*.1;
            while(bank[e.index]>=1-1e-9){
              bank[e.index]-=1;
              for(const m of targets)if(m.hp>0)applyDebuff(m,e.armor_debuff,m===target||single?1:coverage);
            }
          }
          // MECH-C: stack_add — each whole proc adds n stacks to the skill's (pre-filter) targets.
          if(e.stack_add&&hero.age_stack){
            const bank=u.stackBank??={};bank[e.index]=(bank[e.index]??0)+rate*.1;
            for(;bank[e.index]>=1-1e-9;bank[e.index]--)for(const m of preTargets)
              if(m.hp>0&&(m===target||single||posModel||pickRandom()<cov))stackAdd(m,hero.age_stack,e.stack_add);
          }
          // MECH-A: lower_round (Z5 뒤로뒤로 열매) — each whole cast rolls chance; up to picks distinct random
          // non-excluded enemies within radius of the skill centre are lowered (or killed).
          if(e.lower_round){
            const lr=e.lower_round,bank=u.lowerBank??={};
            bank[e.index]=(bank[e.index]??0)+rate*.1*lr.chance;
            for(;bank[e.index]>=1-1e-9;bank[e.index]--){
              const pool=[...mobs,...specials].filter(m=>m.hp>0&&!lr.exclude.includes(m.kind)&&(!posModel||dist(m,center)<=lr.radius));
              for(let k=0;k<lr.picks&&pool.length;k++)lowerMob(pool.splice(Math.floor(pickRandom()*pool.length),1)[0],lr,round);
            }
          }
          if(e.execute_line){
            const bank=u.executeBank??={};
            bank[e.index]=(bank[e.index]??0)+rate*.1;
            while(bank[e.index]>=1-1e-9){
              bank[e.index]-=1;
              if(target?.kind==='line'&&target.hp>0){
                target.hp=0;executeCounts[u.code]=(executeCounts[u.code]??0)+1;
              }
            }
          }
        }
      }
      target=globalTarget;
      // Conditional units use their own attack clocks. Gaban damages one target;
      // Sunny area stuns are measured, but movement/escape is not modeled here.
      for(const u of units){
        if(u.kind!=='conditional')continue;
        const spec=u.model,attacks=spec.aps*.1;
        u.attackBank+=attacks;
        const inReach=m=>m.hp>0&&(!posModel||dist(m,spawnPt)<=engageRange);
        const normal=mobs.find(inReach),single=normal??specials.find(inReach);
        if(u.code==='I8'){
          while(u.attackBank>=1-1e-9){
            u.attackBank-=1;
            if(!single||!u.damage)continue;
            u.energy=Math.min(45,u.energy+1);
            single.ab=Math.max(single.ab,single.kind==='line'?60:70);
            // 4.5% per attack: +75만 attack for 5 s (2.305 wts STRING 5937). A re-proc refreshes the
            // buff [추정], so the expected bonus is 75만 x P(at least one proc in the last 5 s).
            const buff=750_000*(1-Math.pow(1-.045,spec.aps*5));
            const basic=(spec.attack*(1+(red?.35:0)+allyAttack)+buff)*typeFor(spec.attackType,single.typeRound??single.round,data)*pf(armor(single,extraArmor));
            deal(single,basic,u.code,'single','physical');
            // 525% fixed crit: 55%, bosses 13% (tooltip "스토리 및 보스에게는 발동확률 13%로 감소").
            deal(single,(single.kind==='boss'||single.kind==='story'?.13:.55)*5.25*basic,u.code,'single','fixed');
            const proc=(8_750_000*1.25+(single.kind==='line'?.2*single.maxhp:0))*pf(armor(single,extraArmor));
            deal(single,.0425*proc,u.code,'single','physical');
            deal(single,.45*350_000*pf(armor(single,extraArmor)),u.code,'single','physical');
            // 타격 45%: single 3 s stun (hero 1.5 s, 2.305 bash ratio 0.5) in the position model.
            if(posModel&&ccRandom()<.45)applyStun(single,{normal:3,hero:1.5});
            if(u.energy>=45&&globalT+1e-8>=u.nextCast){
              // 참격: 일반 50% / 보스 10% (frenzy mobs are neither boss nor story, so 일반).
              deal(single,(single.kind==='boss'||single.kind==='story'?.1:.5)*single.maxhp,u.code,'single','fixed');
              u.energy-=45;u.nextCast=globalT+2.5;
            }
          }
        }else if(u.code==='TR28'){
          while(u.attackBank>=1-1e-9){u.attackBank-=1;if(single)u.energy=Math.min(150,u.energy+1);}
          if(!u.damage)continue;
          if(single)deal(single,spec.attack*(1+(red?.35:0)+allyAttack)*attacks*typeFor(spec.attackType,single.typeRound??single.round,data)*pf(armor(single,extraArmor)),u.code,'basic','physical');
          const missiles=frankyLinked&&sunnyUnits.length?2+sunnyUnits.length:0;
          for(const m of aoeTargets)if(m.hp>0){
            deal(m,(spec.aps*.05*460_000+spec.aps*.08*250_000*missiles)*.1*magicFactor*hit(m),u.code,'area','magic');
          }
          if(single&&u.energy>=150){
            u.energy-=150;
            for(const m of aoeTargets)if(m.hp>0)deal(m,500_000*magicFactor*hit(m),u.code,'area','magic');
          }
        }else if(u.code==='H15'){
          if(frankyLinked)u.energy=Math.min(100,u.energy+.5);
          while(u.attackBank>=1-1e-9){
            u.attackBank-=1;
            if(!single)continue;
            u.energy=Math.min(100,u.energy+1);
            if(u.damage)deal(single,spec.attack*(1+(red?.35:0)+allyAttack)*typeFor(spec.attackType,single.typeRound??single.round,data)*pf(armor(single,extraArmor)),u.code,'basic','physical');
            const cast=frankyLinked&&globalT+1e-8>=u.openingDelay&&u.energy>=100;
            const proc=!frankyLinked&&random(u)<.1;
            if(!u.damage||!cast&&!proc)continue;
            if(cast){u.energy-=100;control.sunnyCasts++;}
            else control.sunnyProcExpected++;
            const duration=cast?3:1.2,flat=cast?1_850_000:200_000;
            for(const m of aoeTargets)if(m.hp>0){
              deal(m,(flat+(m.kind==='frenzy'?.45*m.maxhp:0))*magicFactor*hit(m),u.code,'area','magic');
              if(m.kind==='line')m.stunnedUntil=Math.max(m.stunnedUntil??0,globalT+duration);
            }
          }
        }
      }
      if(frankyLinked&&sunnyUnits.length)control.frankyAuraSeconds+=.1;
      if(redDamage&&target){
        const hiddenAps=allyAps(5.625,BASE_COOLDOWN.H2),hiddenAttack=67806.45*(1+allyAttack);
        deal(target,hiddenAttack*hiddenAps*1.05*pf(armor(target,extraArmor))*(target.kind==='boss'?2.2:1)*.1,'H2','basic','physical');
        if(target.kind==='boss'||target.kind==='frenzy'){
          const bonus=(target.kind==='frenzy'?.075:.0175)*target.maxhp;
          deal(target,hiddenAps*.15*(550000+bonus)*magicFactor*.1,'H2','area','magic');
        }
      }
      if(redDamage)for(const m of mobs)
        deal(m,allyAps(5.625,BASE_COOLDOWN.H2)*.15*275000*magicFactor*.1*hit(m),'H2','area','magic');

      // After absolute cooldown, each attack rolls its tooltip proc chance.
      // Sugar is an active used as soon as it is ready.
      for(const u of units){
        if(u.kind!=='deleter'||!u.damage)continue;
        const spec=u.model;
        const cd=clamp(deleteOptions[`${u.code}Cooldown`]??spec.cooldown,.1,300);
        const proc=clamp(deleteOptions[`${u.code}Proc`]??spec.proc,0,1);
        const tryDelete=()=>{
          if(globalT+1e-8<u.nextReady)return;
          const victim=mobs.find(m=>m.hp>0);
          if(!victim)return;
          if(proc<1&&random(u)>=proc)return;
          victim.hp=0;
          deleteCounts[u.code]++;
          u.nextReady=globalT+cd;
        };
        if(spec.mode==='active')tryDelete();
        else while(globalT+1e-8>=u.nextAttack){
          tryDelete();
          u.nextAttack+=1/spec.aps;
        }
      }

      // 단일 컨 (options.singleControl, 수정내역 24): two concurrent single-target streams on line mobs.
      // 단: pushes the most-damaged mob above 15% down at 0.85 x max HP per `to15` seconds (e.g. 2단 = 루치 1기 시간 / 2).
      // 끝: finishes the lowest mob at or below 15% at 0.15 x max HP per `finish` seconds (1끝 = 핸콕 1기 시간);
      // with nothing at 15% it waits. Times come from the single tester, so resistances are already inside.
      if(singleControl){
        const reach=mobs.filter(m=>m.hp>0&&(!posModel||dist(m,spawnPt)<=engageRange));
        const high=reach.filter(m=>m.hp>.15*m.maxhp).sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp)[0];
        if(high)deal(high,Math.min(high.hp-.15*high.maxhp+1,.85*high.maxhp/singleControl.to15*.1),'단일 컨','single','mixed');
        const low=reach.filter(m=>m.hp>0&&m.hp<=.15*m.maxhp).sort((a,b)=>a.hp-b.hp)[0];
        if(low)deal(low,.15*low.maxhp/singleControl.finish*.1,'단일 컨','single','mixed');
      }
      if(finishMode==='damage'&&globalStep>0&&globalStep%Math.max(1,Math.round(finishInterval*10))===0){
        finisherAttempts++;
        successBank+=finishChance;
        if(successBank>=1-1e-9){
          successBank-=1;
          const eligible=mobs.filter(m=>m.hp>0).sort((a,b)=>a.hp-b.hp);
          const m=eligible[0];
          if(m){
            const before=m.hp;
            let amount=finishFlat+finishMax*m.maxhp+finishCurrent*m.hp+finishLost*(m.maxhp-m.hp);
            amount*=factor(finishType,m,extraArmor);
            deal(m,amount,'단일 마무리','finisher',finishType);
            if(m.hp<=0&&before>0)finisherKills++;
          }
        }
      }
      if(active&&active.hp<=0)specialKill=+t.toFixed(1);
      const aliveLines=mobs.filter(m=>m.hp>0);
      control.activeLineMobSeconds+=aliveLines.length*.1;
      const stunned=aliveLines.filter(m=>(m.stunnedUntil??0)>globalT).length;
      control.stunnedLineMobSeconds+=stunned*.1*cov;
      if(stunned)control.stunFieldSeconds+=.1;
      if(step%10===9)timeline.push({second:(round-60)*32+(step+1)*.1,
        count:mobs.filter(m=>m.hp>0).length+specials.filter(s=>s.hp>0).length,round});
    }
    for(let i=mobs.length-1;i>=0;i--)if(mobs[i].hp<=0){mobs.splice(i,1);totalLineKilled++;}
    for(let i=specials.length-1;i>=0;i--)if(specials[i].hp<=0)specials.splice(i,1);
    checkpoints.push({round,...snapshot(),priorRoundRemaining:[...mobs,...specials].filter(m=>m.round<round).length,
      currentRoundRemaining:[...mobs,...specials].filter(m=>m.round===round).length,specialKillSecond:specialKill});
  }
  return result(true);
}
