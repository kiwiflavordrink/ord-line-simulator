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
const SINGLE_TARGETS=new Set(['single','single_line','target_special','boss','frenzy']);
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
  const w=windows[hero.code];if(!w)return {form:base,transformed:false};
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
  const heroMap=new Map(data.heroes.map(h=>[h.code,h]));
  // Difficulty (data.difficulties: 2.305 structure, 2.323 common HP/regen) and 오로성 (data.gorosei, 2.323 values).
  // The legacy option warcury=true selects 워큐리. 지옥 has no 오로성.
  const diffName=['지옥','신','악몽'].includes(options.difficulty)?options.difficulty:'신';
  const diff=data.difficulties?.[diffName]??{rounds:data.rounds,boss:data.boss,frenzy:data.frenzy,defeat:55,magic_level:16,
    speed:{aura:0,line_flat:0},frenzy_aura:{armor:5,regen:1000000},stun_resist:true,common:{hp:0,regen:0},gorosei:true};
  const goroWanted=options.gorosei??(options.warcury===true?'워큐리':null);
  const goroName=diff.gorosei&&(data.gorosei?data.gorosei[goroWanted]:goroWanted==='워큐리')?goroWanted:null;
  const armorModel=options.armorModel==='map'&&data.difficulties?'map':'data';
  const curse=goroName?(data.gorosei?.[goroName]?.[diffName]??{armor:10,magic_levels:10}):{};
  // 나스쥬로 attack-speed penalty on any allied unit: WC3 aps = min(5, aps x cooldown + bonus) / cooldown.
  const allyAps=(aps,cooldown)=>curse.ally_aps&&cooldown?Math.max(0,Math.min(5,aps*cooldown+curse.ally_aps))/cooldown:aps;
  const units=[];
  for(const item of composition){
    const count=clamp(Math.floor(item.count??1),1,6);
    if(heroMap.has(item.code))for(let i=0;i<count;i++)units.push({kind:'hero',code:item.code,model:heroMap.get(item.code),damage:item.damage!==false});
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
  for(const [j,u] of units.entries()){
    if(u.kind!=='hero')continue;
    const byId=new Map();
    for(const src of auraSources)for(const a of src.auras){
      if(a.targets==='self'&&src.i!==j||a.targets==='others'&&src.i===j)continue;
      if(src.i!==j&&buffTargets[src.code]&&!buffTargets[src.code].includes(u.code))continue;
      let up=1;
      if(a.uptime){
        const h=units[src.i].model,base=h.forms[0].aps;
        const rate=a.uptime.proc!=null?null:(h.events.find(e=>e.index===a.uptime.cast_event)?.rate??0);
        up=a.uptime.proc!=null?1-Math.pow(1-a.uptime.proc,base*a.uptime.duration):Math.min(1,rate*a.uptime.duration);
      }
      const prev=byId.get(a.id);
      byId.set(a.id,{a,miss:(prev?prev.miss:1)*(1-up)});
    }
    const buffs={attack_pct:0,attack_flat:0,aps:0,mana_regen:0};
    for(const {a,miss} of byId.values())buffs[a.kind]+=a.value*(1-miss);
    // 새턴 A13G (ACac) and 나스쥬로 A13E are enemy-side auras on every allied unit; they add like other auras.
    buffs.attack_pct+=curse.ally_attack??0;buffs.aps+=curse.ally_aps??0;
    u.buffs=buffs;
  }
  const cut=clamp(options.cut??201,0,300),coverage=clamp(options.coverage??1,0,1);
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
  const magicReduction=clamp(options.magicReduction??0,0,.35);
  const magicAmp=clamp(options.magicAmp??0,0,.25);
  const allAmp=clamp(options.allAmp??0,0,5);
  const explosiveAmp=clamp(options.explosiveAmp??0,0,.25);
  const normalOnlyExplosiveAmp=clamp(options.normalOnlyExplosiveAmp??0,0,.25);
  // A04Q: level L = 0.79 + 0.01 x L (16 = 0.95, 악몽 11 = 0.90); 워큐리 lowers the level, minimum level 1.
  const defenceFactor=clamp(.79+.01*Math.max(1,diff.magic_level-(curse.magic_levels??0))+magicReduction,.80,1.15);
  const magicFactor=defenceFactor*(1+magicAmp);
  const custom=options.customMagic??{};
  const customRate=clamp(custom.aps??5,0,100)*clamp(custom.chance??.15,0,1);
  const customFlat=clamp(custom.flat??0,0,1e10),customMax=clamp(custom.maxPct??0,0,1);
  const customCurrent=clamp(custom.currentPct??0,0,1),customLost=clamp(custom.lostPct??0,0,1);
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
    if(m.kind==='frenzy'&&lp.frenzy){
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
  const ccProcs=rate=>{let n=0;const p=1-Math.exp(-rate*.1);while(n<20&&ccRandom()<p)n++;return n;};
  const slowOf=m=>{
    let sum=0;
    if(m.slows)for(const v of Object.values(m.slows))if(v.until>now)sum+=v.value;
    for(const a of enemySlowAuras.values())if(dist(m,spawnPt)<=a.range)sum+=a.value;
    return sum;
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
  const debuffSum=m=>{
    let sum=0;
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
  const factor=(kind,m,extra)=>kind==='physical'?pf(armor(m,extra)):kind==='magic'?magicFactor:
    kind==='explosive'?1+Math.min(.25,explosiveAmp+(m.kind==='line'?normalOnlyExplosiveAmp:0))+(curse.explosive??0):1;
  const deal=(m,amount,source,scope,kind)=>{
    if(!m||m.hp<=0||!Number.isFinite(amount)||amount<=0)return;
    amount*=1+allAmp;
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
  // TR11/TR19 multipliers are crit expectations; Z2 +60000 is bonus damage outside the aura.
  const heroAttack=(u,form)=>{
    const hero=u.model,b=u.buffs;
    let attack=form.attack*(1+(red?.35:0)+b.attack_pct)+b.attack_flat;
    if(hero.code==='Z2')attack+=60000;
    return attack;
  };
  // Crit as an expected multiplier 1 + chance x (mult - 1). form.crit: basic-attack crit (target and
  // splash); form.target_crit: '타격' crit on the attack target only; event.crit: skill crit.
  const critEV=c=>c?1+c[0]*(c[1]-1):1;
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
  const result=(clear,failedRound=null,failedSecond=null)=>({clear,failedRound,failedSecond,
    ...snapshot(),checkpoints,timeline,totalLineSpawned,totalLineKilled,
    finisherAttempts,finisherKills,lineDamage,sourceDamage,deleteCounts,executeCounts,control,
    buffs:units.map(u=>u.buffs?{code:u.code,...u.buffs}:null).filter(Boolean),unitCount:units.length,
    magicFactor,cut,coverage,resourceMode,positionModel:posModel,difficulty:diffName,gorosei:goroName??'없음',armorModel});

  for(const round of rounds){
    // armorModel 'map': 2.305 formula udef + udup x level (diff.armor_map); default keeps the 신 values.
    const mapArmor=armorModel==='map'?diff.armor_map:null;
    const [lineHp,dataArmor]=diff.rounds[String(round)],armor0=mapArmor?.line[String(round)]??dataArmor;
    const hp0=lineHp+diff.common.hp+(curse.line_hp??0);
    let spawned=0,specialKill=null;
    if(diff.boss[String(round)]){
      const [bossHp,dataBossArmor]=diff.boss[String(round)],hp=bossHp+diff.common.hp+(curse.boss_hp??0);
      const baseArmor=mapArmor?.boss[String(round)]??dataBossArmor;
      const boss={hp,maxhp:hp,armor:baseArmor,ab:0,kind:'boss',round};
      if(posModel){boss.s=0;boss.speed=lp.boss_speed;place(boss);}
      specials.push(boss);
    }
    for(let step=0;step<320;step++){
      const t=step*.1,globalT=(round-60)*32+t,globalStep=(round-60)*320+step;
      now=globalT;
      let newMob=null;
      if(step%5===0&&spawned<35){
        newMob={hp:hp0,maxhp:hp0,armor:armor0,ab:0,kind:'line',round};
        if(posModel){newMob.s=0;newMob.speed=lp.mob_speed;place(newMob);}
        mobs.push(newMob);spawned++;totalLineSpawned++;
      }
      if(diff.frenzy[String(round)]&&step===75){
        const hp=diff.frenzy[String(round)]+diff.common.hp+(curse.line_hp??0);
        const frenzy={hp,maxhp:hp,armor:armor0+(diff.frenzy_aura?.armor??0),ab:0,kind:'frenzy',round};
        if(posModel){frenzy.s=0;frenzy.speed=lp.mob_speed;place(frenzy);}
        specials.push(frenzy);
      }
      for(let i=mobs.length-1;i>=0;i--)if(mobs[i].hp<=0){mobs.splice(i,1);totalLineKilled++;}
      for(let i=specials.length-1;i>=0;i--)if(specials[i].hp<=0)specials.splice(i,1);
      if(mobs.length+specials.length>=diff.defeat){
        timeline.push({second:globalT,count:mobs.length+specials.length,round});
        return result(false,round,+t.toFixed(1));
      }
      const active=specials.find(s=>s.round===round);
      const bossAura=specials.some(s=>s.kind==='boss'),frenzyAura=specials.some(s=>s.kind==='frenzy');
      const extraArmor=(bossAura?10:0)+(frenzyAura?diff.frenzy_aura?.armor??0:0);
      if(newMob)for(const u of units){
        if(u.kind!=='hero'||!u.damage)continue;
        const hero=u.model,form=formAt(hero,globalT,t,resourceMode).form;
        const attack=heroAttack(u,form);
        for(const e of hero.events)if(e.on_spawn&& (summons||!isSummon(e))){
          deal(newMob,e.on_spawn*eventDamage(e,newMob,attack,extraArmor),hero.code,'area','mixed');
          if(e.ab&&newMob.hp>0)abAdd(newMob,e.ab*e.on_spawn);
          if(e.armor_debuff&&newMob.hp>0)applyDebuff(newMob,e.armor_debuff,e.on_spawn);
        }
      }
      // Regen per second: unit base (w3u uhpr, 61라 45,000), boss aura 500,000, frenzy aura (신 1,000,000,
      // 악몽 1,200,000, 지옥 none), difficulty common regen and 새턴 on every enemy.
      const enemyRegen=diff.common.regen+(curse.regen??0),frenzyRegen=diff.frenzy_aura?.regen??0;
      const unitRegen=r=>data.round_regen?.[String(r)]??0;
      const regen=(bossAura?500000:0)+(frenzyAura?frenzyRegen:0)+enemyRegen;
      for(const m of mobs){const g=(regen+unitRegen(m.round))*.1;if(g)m.hp=Math.min(m.maxhp,m.hp+g);}
      for(const s of specials)s.hp=Math.min(s.maxhp,s.hp+((s.kind==='boss'?550000:frenzyRegen+unitRegen(s.round))+enemyRegen)*.1);
      if(posModel)for(const m of [...mobs,...specials])if(m.hp>0)move(m);
      // Supports, Red Force and conditional units: engage range (default lp.engage_range), splash lp.support_splash.
      const globalTarget=pickTarget(engageRange);
      let target=globalTarget;
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
          if(target)deal(target,attack*s.aps*typeFor(s.attackType,target.round,data)*pf(armor(target,extraArmor))*.1,u.code,'basic','physical');
          if(s.splash)for(const m of mobs)if(m!==target)
            deal(m,attack*s.aps*s.splash*typeFor(s.attackType,m.round,data)*pf(armor(m,extraArmor))*.1*coverage,u.code,'area','physical');
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
        if(u.buffs.aps&&form.cooldown)aps=Math.min(5,aps*form.cooldown+u.buffs.aps)/form.cooldown;
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
        const attack=heroAttack(u,form);
        if(target){
          const crit=critEV(form.crit);
          deal(target,attack*crit*critEV(form.target_crit)*aps*form.rounds[String(target.round)]*pf(armor(target,extraArmor))*.1,u.code,'basic','physical');
          if(form.splash)for(const m of mobs)if(m!==target&&(!posModel||dist(m,target)<=form.splash_radius))
            deal(m,attack*crit*aps*form.rounds[String(m.round)]*pf(armor(m,extraArmor))*form.splash*.1*cov,u.code,'area','physical');
        }
        for(const e of hero.events){
          if(!summons&&isSummon(e))continue;
          if(e.phase==='trans'&&!transformed||e.phase==='base'&&transformed||e.phase==='giant'&&!giant||e.phase==='nongiant'&&giant)continue;
          let rate=e.rate*(e.per_attack?aps/baseAps:1);
          if(e.plant)rate*=plantCount(hero,e.plant);
          if(e.resource_cost&&u.buffs.mana_regen)rate+=u.buffs.mana_regen/e.resource_cost;
          if(executing&&e.index===exe.boost_event)rate=aps;
          if(e.initial&&(resourceMode==='perRound'&&step===0||resourceMode==='start'&&globalStep===0))rate+=10;
          if(!rate)continue;
          if(e.min_target_ab&&!(target&&target.ab>=e.min_target_ab))continue;
          // Position model: a skill needs a target in range unless it is centred on the hero.
          const center=posModel?(e.center==='self'?spawnPt:target):null;
          if(posModel&&!center)continue;
          let targets;
          // Single-target kinds hit only the current attack target:
          // 'single' any target (boss_parts replaces parts against a boss), 'single_line' a line mob,
          // 'target_special' a boss or frenzy, 'boss' / 'frenzy' that kind only.
          const single=SINGLE_TARGETS.has(e.target);
          switch(e.target){
            case 'single':targets=target?[target]:[];break;
            case 'single_line':targets=target?.kind==='line'?[target]:[];break;
            case 'target_special':targets=target&&target.kind!=='line'?[target]:[];break;
            case 'boss':targets=target?.kind==='boss'?[target]:[];break;
            case 'frenzy':targets=target?.kind==='frenzy'?[target]:[];break;
            case 'line':targets=mobs;break;
            case 'special':targets=specials;break;
            case 'line_or_frenzy':targets=[...mobs,...specials.filter(s=>s.kind==='frenzy')];break;
            default:targets=[...mobs,...specials];
          }
          if(posModel&&!single)targets=targets.filter(m=>m===target||dist(m,center)<=(e.radius??lp.default_radius));
          for(const m of targets)if(m.hp>0){
            const ev=e.boss_parts&&m.kind==='boss'?{...e,parts:e.boss_parts}:e;
            const share=rate*.1*(m===target||single?1:cov);
            deal(m,eventDamage(ev,m,attack,extraArmor)*critEV(e.crit)*share,u.code,single?'single':'area','mixed');
            // Armor break as an expected stack per step, like the supports (cap 75 in abAdd).
            if(m.hp>0&&e.ab)abAdd(m,e.ab*share);
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
            const basic=(spec.attack*(1+(red?.35:0)+allyAttack)+buff)*typeFor(spec.attackType,single.round,data)*pf(armor(single,extraArmor));
            deal(single,basic,u.code,'single','physical');
            // 525% fixed crit: 55%, bosses 13% (tooltip "스토리 및 보스에게는 발동확률 13%로 감소").
            deal(single,(single.kind==='boss'?.13:.55)*5.25*basic,u.code,'single','fixed');
            const proc=(8_750_000*1.25+(single.kind==='line'?.2*single.maxhp:0))*pf(armor(single,extraArmor));
            deal(single,.0425*proc,u.code,'single','physical');
            deal(single,.45*350_000*pf(armor(single,extraArmor)),u.code,'single','physical');
            // 타격 45%: single 3 s stun (hero 1.5 s, 2.305 bash ratio 0.5) in the position model.
            if(posModel&&ccRandom()<.45)applyStun(single,{normal:3,hero:1.5});
            if(u.energy>=45&&globalT+1e-8>=u.nextCast){
              // 참격: 일반 50% / 보스 10% (frenzy mobs are neither boss nor story, so 일반).
              deal(single,(single.kind==='boss'?.1:.5)*single.maxhp,u.code,'single','fixed');
              u.energy-=45;u.nextCast=globalT+2.5;
            }
          }
        }else if(u.code==='TR28'){
          while(u.attackBank>=1-1e-9){u.attackBank-=1;if(single)u.energy=Math.min(150,u.energy+1);}
          if(!u.damage)continue;
          if(single)deal(single,spec.attack*(1+allyAttack)*attacks*typeFor(spec.attackType,single.round,data)*pf(armor(single,extraArmor)),u.code,'basic','physical');
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
            if(u.damage)deal(single,spec.attack*(1+allyAttack)*typeFor(spec.attackType,single.round,data)*pf(armor(single,extraArmor)),u.code,'basic','physical');
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
        if(target.kind!=='line'){
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
