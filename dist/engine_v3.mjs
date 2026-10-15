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
const isSummon=e=>/완두콩|백설콩|파견 해군|거인족|부유물|릴리스|아틀라스|요크/.test(String(e.index));

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
  const units=[];
  for(const item of composition){
    const count=clamp(Math.floor(item.count??1),1,6);
    if(heroMap.has(item.code))for(let i=0;i<count;i++)units.push({kind:'hero',code:item.code,model:heroMap.get(item.code),damage:item.damage!==false});
    else if(SUPPORTS[item.code])for(let i=0;i<count;i++)units.push({kind:'support',code:item.code,model:SUPPORTS[item.code],damage:item.damage!==false,ab:item.ab!==false});
    else if(DELETERS[item.code])for(let i=0;i<count;i++)units.push({kind:'deleter',code:item.code,model:DELETERS[item.code],damage:item.damage!==false,nextAttack:1/(DELETERS[item.code].aps||1),nextReady:0});
    else if(CONDITIONAL_UNITS[item.code])for(let i=0;i<count;i++)units.push({kind:'conditional',code:item.code,
      model:CONDITIONAL_UNITS[item.code],damage:item.damage!==false,energy:0,
      attackBank:0,nextCast:0});
    else if(item.code==='MAGIC_CUSTOM')for(let i=0;i<count;i++)units.push({kind:'magic',code:'MAGIC_CUSTOM',damage:item.damage!==false});
  }
  if(!units.length)throw new Error('조합에 유닛을 한 기 이상 넣어 주세요.');
  const cut=clamp(options.cut??201,0,300),coverage=clamp(options.coverage??1,0,1);
  const resourceMode=['start','empty','perRound'].includes(options.resourceMode)?options.resourceMode:
    options.fullResource===false?'empty':'start';
  const fullResource=resourceMode!=='empty',summons=options.summons!==false;
  for(const u of units)if(u.kind==='conditional')u.energy=fullResource?(u.code==='I8'?45:u.code==='H15'?100:150):0;
  const red=options.red!==false,redDamage=red&&options.redDamage!==false;
  const frankyLinked=options.frankyAura!==false&&units.some(u=>u.code==='TR28');
  const sunnyUnits=units.filter(u=>u.code==='H15');
  const sunnyStagger=options.sunnyStagger===true;
  for(const [index,u] of sunnyUnits.entries())u.openingDelay=sunnyStagger&&sunnyUnits.length>1?
    index*(100/(u.model.aps+(frankyLinked?5:0)))/sunnyUnits.length:0;
  const magicReduction=clamp(options.magicReduction??0,0,.35);
  const magicAmp=clamp(options.magicAmp??0,0,.25);
  const warcury=options.warcury===true;
  const allAmp=clamp(options.allAmp??0,0,5);
  const explosiveAmp=clamp(options.explosiveAmp??0,0,.25);
  const normalOnlyExplosiveAmp=clamp(options.normalOnlyExplosiveAmp??0,0,.25);
  const defenceFactor=clamp(.95-(warcury?.10:0)+magicReduction,.80,1.15);
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
  const deleteCounts={L12:0,D4:0,L19:0};
  const sourceDamage={};
  const lineDamage={area:0,basic:0,single:0,finisher:0,magic:0,physical:0,fixed:0};
  const mobs=[],specials=[],checkpoints=[],timeline=[];
  const control={sunnyCasts:0,sunnyProcExpected:0,frankyAuraSeconds:0,
    activeLineMobSeconds:0,stunnedLineMobSeconds:0,stunFieldSeconds:0};
  let totalLineSpawned=0,totalLineKilled=0,finisherAttempts=0,finisherKills=0,successBank=0;
  const casts=new Map(units.map((u,i)=>[i,u.kind==='support'?supportCastSchedule(u.code,fullResource):[]]));
  const armor=(m,extra)=>m.armor+(warcury?10:0)+(m.kind==='line'?extra:0)-cut-m.ab;
  const factor=(kind,m,extra)=>kind==='physical'?pf(armor(m,extra)):kind==='magic'?magicFactor:
    kind==='explosive'?1+Math.min(.25,explosiveAmp+(m.kind==='line'?normalOnlyExplosiveAmp:0)):1;
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
    return out;
  };
  const snapshot=()=>({remaining:mobs.length+specials.length,lineRemaining:mobs.length,
    averageAb:mobs.length?mobs.reduce((a,m)=>a+m.ab,0)/mobs.length:0});
  const result=(clear,failedRound=null,failedSecond=null)=>({clear,failedRound,failedSecond,
    ...snapshot(),checkpoints,timeline,totalLineSpawned,totalLineKilled,
    finisherAttempts,finisherKills,lineDamage,sourceDamage,deleteCounts,control,unitCount:units.length,
    magicFactor,cut,coverage,resourceMode});

  for(const round of rounds){
    const [hp0,armor0]=data.rounds[String(round)];
    let spawned=0,specialKill=null;
    if(data.boss[String(round)]){
      const [hp,baseArmor]=data.boss[String(round)];
      specials.push({hp,maxhp:hp,armor:baseArmor,ab:0,kind:'boss',round});
    }
    for(let step=0;step<320;step++){
      const t=step*.1,globalT=(round-60)*32+t,globalStep=(round-60)*320+step;
      let newMob=null;
      if(step%5===0&&spawned<35){
        newMob={hp:hp0,maxhp:hp0,armor:armor0,ab:0,kind:'line',round};
        mobs.push(newMob);spawned++;totalLineSpawned++;
      }
      if(data.frenzy[String(round)]&&step===75){
        const hp=data.frenzy[String(round)];
        specials.push({hp,maxhp:hp,armor:armor0+5,ab:0,kind:'frenzy',round});
      }
      for(let i=mobs.length-1;i>=0;i--)if(mobs[i].hp<=0){mobs.splice(i,1);totalLineKilled++;}
      for(let i=specials.length-1;i>=0;i--)if(specials[i].hp<=0)specials.splice(i,1);
      if(mobs.length+specials.length>=55){
        timeline.push({second:globalT,count:mobs.length+specials.length,round});
        return result(false,round,+t.toFixed(1));
      }
      const active=specials.find(s=>s.round===round);
      const bossAura=specials.some(s=>s.kind==='boss'),frenzyAura=specials.some(s=>s.kind==='frenzy');
      const extraArmor=(bossAura?10:0)+(frenzyAura?5:0);
      if(newMob)for(const u of units){
        if(u.kind!=='hero'||!u.damage)continue;
        const hero=u.model,form=formAt(hero,globalT,t,resourceMode).form;
        let attack=form.attack*(red?1.35:1);
        if(hero.code==='Z2')attack+=60000;
        if(hero.code==='I11')attack*=.25;
        if(hero.code==='TR11')attack*=1.45;
        if(hero.code==='TR19')attack*=1.375;
        if(['E1','E2'].includes(hero.code))attack*=1.25;
        for(const e of hero.events)if(e.on_spawn&& (summons||!isSummon(e)))
          deal(newMob,e.on_spawn*eventDamage(e,newMob,attack,extraArmor),hero.code,'area','mixed');
      }
      const regen=((bossAura?500000:0)+(frenzyAura?1000000:0))*.1;
      if(regen)for(const m of mobs)m.hp=Math.min(m.maxhp,m.hp+regen);
      for(const s of specials)s.hp=Math.min(s.maxhp,s.hp+(s.kind==='boss'?550000:s.round===61?1045000:1000000)*.1);
      const target=specials[0]??mobs[0]??null;
      const aoeTargets=[...mobs,...specials.filter(s=>s===target)];
      const hit=m=>m===target?1:coverage;

      // Armor break is stored on each individual enemy and survives wave changes.
      for(let i=0;i<units.length;i++){
        const u=units[i];if(u.kind!=='support')continue;
        const s=u.model,attack=s.attack*(red?1.35:1);
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
        let aps=form.aps;if(hero.code==='E10'&&transformed)aps=1/.11;
        const giant=['E1','E2'].includes(hero.code)&&inWindow(4.25,4.25+115/(baseAps+.25),globalT,t,resourceMode,true);
        if(giant)aps/=3.25;
        let attack=form.attack*(red?1.35:1)*(['E1','E2'].includes(hero.code)?1.25:1);
        if(hero.code==='Z2')attack+=60000;
        if(hero.code==='I11')attack*=.25;
        if(hero.code==='TR11')attack*=1.45;
        if(hero.code==='TR19')attack*=1.375;
        if(target){
          deal(target,attack*aps*form.rounds[String(target.round)]*pf(armor(target,extraArmor))*.1,u.code,'basic','physical');
          if(form.splash)for(const m of mobs)if(m!==target)
            deal(m,attack*aps*form.rounds[String(m.round)]*pf(armor(m,extraArmor))*form.splash*.1*coverage,u.code,'area','physical');
        }
        for(const e of hero.events){
          if(!summons&&isSummon(e))continue;
          if(e.phase==='trans'&&!transformed||e.phase==='base'&&transformed||e.phase==='giant'&&!giant||e.phase==='nongiant'&&giant)continue;
          let rate=e.rate*(e.per_attack?aps/baseAps:1);
          if(e.initial&&(resourceMode==='perRound'&&step===0||resourceMode==='start'&&globalStep===0))rate+=10;
          if(!rate)continue;
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
          for(const m of targets)if(m.hp>0){
            const ev=e.boss_parts&&m.kind==='boss'?{...e,parts:e.boss_parts}:e;
            deal(m,eventDamage(ev,m,attack,extraArmor)*rate*.1*(m===target||single?1:coverage),u.code,single?'single':'area','mixed');
          }
        }
      }
      // Conditional units use their own attack clocks. Gaban damages one target;
      // Sunny area stuns are measured, but movement/escape is not modeled here.
      for(const u of units){
        if(u.kind!=='conditional')continue;
        const spec=u.model,attacks=spec.aps*.1;
        u.attackBank+=attacks;
        const normal=mobs.find(m=>m.hp>0),single=normal??specials.find(s=>s.hp>0);
        if(u.code==='I8'){
          while(u.attackBank>=1-1e-9){
            u.attackBank-=1;
            if(!single||!u.damage)continue;
            u.energy=Math.min(45,u.energy+1);
            single.ab=Math.max(single.ab,single.kind==='line'?60:70);
            const basic=spec.attack*(red?1.35:1)*typeFor(spec.attackType,single.round,data)*pf(armor(single,extraArmor));
            deal(single,basic,u.code,'single','physical');
            deal(single,.55*5.25*basic,u.code,'single','fixed');
            const proc=(8_750_000*1.25+(single.kind==='line'?.2*single.maxhp:0))*pf(armor(single,extraArmor));
            deal(single,.0425*proc,u.code,'single','physical');
            deal(single,.45*350_000*pf(armor(single,extraArmor)),u.code,'single','physical');
            if(u.energy>=45&&globalT+1e-8>=u.nextCast){
              deal(single,(single.kind==='line'?.5:.1)*single.maxhp,u.code,'single','fixed');
              u.energy-=45;u.nextCast=globalT+2.5;
            }
          }
        }else if(u.code==='TR28'){
          while(u.attackBank>=1-1e-9){u.attackBank-=1;if(single)u.energy=Math.min(150,u.energy+1);}
          if(!u.damage)continue;
          if(single)deal(single,spec.attack*attacks*typeFor(spec.attackType,single.round,data)*pf(armor(single,extraArmor)),u.code,'basic','physical');
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
            if(u.damage)deal(single,spec.attack*typeFor(spec.attackType,single.round,data)*pf(armor(single,extraArmor)),u.code,'basic','physical');
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
        const hiddenAps=5.625,hiddenAttack=67806.45;
        deal(target,hiddenAttack*hiddenAps*1.05*pf(armor(target,extraArmor))*(target.kind==='boss'?2.2:1)*.1,'H2','basic','physical');
        if(target.kind!=='line'){
          const bonus=(target.kind==='frenzy'?.075:.0175)*target.maxhp;
          deal(target,hiddenAps*.15*(550000+bonus)*magicFactor*.1,'H2','area','magic');
        }
      }
      if(redDamage)for(const m of mobs)
        deal(m,5.625*.15*275000*magicFactor*.1*hit(m),'H2','area','magic');

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
      control.stunnedLineMobSeconds+=stunned*.1*coverage;
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
