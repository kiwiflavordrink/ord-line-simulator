// Version 2: shared 60–65 round battlefield for a selected combination.
// Enemy HP/armor comes from the extracted 2.305 map; abilities use the 2.323 card model.
import {SUPPORTS} from './engine.mjs';

// Delete skills are counted as removed units, never as line damage.
// Default proc/cooldown settings follow the current ORDR character tooltips.
export const DELETERS={
  L12:{name:'겟코 모리아 전설',aps:2.24,cooldown:8.5,proc:1,mode:'attack'},
  D4:{name:'페로나 왜곡',aps:4.634,cooldown:7.5,proc:.1,mode:'attack'},
  L19:{name:'슈가 전설',cooldown:85,proc:1,mode:'active'}
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
const isSummon=e=>/완두콩|백설콩|파견 해군|거인족|부유물|릴리스|아틀라스|요크/.test(String(e.index));

function formAt(hero,t){
  const base=hero.forms[0];
  if(hero.forms.length<2)return {form:base,transformed:false};
  if(['TR19','TR20'].includes(hero.code))return {form:hero.forms[1],transformed:true};
  const windows={TR3:[4.5,150,.25],TR6:[7,130,.25],TR18:[3.5,95,.33],TR23:[4,150,0],I11:[11,0,0],E10:[2,100,0]};
  const w=windows[hero.code];if(!w)return {form:base,transformed:false};
  let period=w[1]?w[0]+w[1]/(base.aps+w[2]):w[0]+1/(base.aps*.14);
  if(hero.code==='E10')period=w[0]+100/(base.aps*.2);
  const transformed=t%period<w[0];
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
    else if(item.code==='MAGIC_CUSTOM')for(let i=0;i<count;i++)units.push({kind:'magic',code:'MAGIC_CUSTOM',damage:item.damage!==false});
  }
  if(!units.length)throw new Error('조합에 유닛을 한 기 이상 넣어 주세요.');
  const cut=clamp(options.cut??201,0,300),coverage=clamp(options.coverage??1,0,1);
  const fullResource=options.fullResource!==false,summons=options.summons!==false;
  const red=options.red!==false,redDamage=red&&options.redDamage!==false;
  const magicReduction=clamp(options.magicReduction??0,0,1);
  const magicAmp=clamp(options.magicAmp??0,0,5);
  const magicFactor=(1-Math.max(0,.05-magicReduction))*(1+magicAmp);
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
  for(const [index,u] of units.entries())if(u.kind==='deleter'){
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
  const lineDamage={area:0,basic:0,finisher:0,magic:0,physical:0,fixed:0};
  const mobs=[],specials=[],checkpoints=[],timeline=[];
  let totalLineSpawned=0,totalLineKilled=0,finisherAttempts=0,finisherKills=0,successBank=0;
  const casts=new Map(units.map((u,i)=>[i,u.kind==='support'?supportCastSchedule(u.code,fullResource):[]]));
  const armor=(m,extra)=>m.armor+(m.kind==='line'?extra:0)-cut-m.ab;
  const factor=(kind,m,extra)=>kind==='physical'?pf(armor(m,extra)):kind==='magic'?magicFactor:1;
  const deal=(m,amount,source,scope,kind)=>{
    if(!m||m.hp<=0||!Number.isFinite(amount)||amount<=0)return;
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
    finisherAttempts,finisherKills,lineDamage,sourceDamage,deleteCounts,unitCount:units.length,
    magicFactor,cut,coverage});

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
        const hero=u.model,form=formAt(hero,t).form;
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
        const hero=u.model,{form,transformed}=formAt(hero,t),baseAps=hero.forms[0].aps;
        let aps=form.aps;if(hero.code==='E10'&&transformed)aps=1/.11;
        const giant=['E1','E2'].includes(hero.code)&&(t%(4.25+115/(baseAps+.25)))<4.25;
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
          if(fullResource&&e.initial&&step===0)rate+=10;
          if(!rate)continue;
          let targets;
          switch(e.target){
            case 'frenzy':targets=active?.kind==='frenzy'&&target===active?[active]:[];break;
            case 'line':targets=mobs;break;
            case 'special':targets=specials;break;
            case 'line_or_frenzy':targets=[...mobs,...specials.filter(s=>s.kind==='frenzy')];break;
            default:targets=[...mobs,...specials];
          }
          for(const m of targets)if(m.hp>0)
            deal(m,eventDamage(e,m,attack,extraArmor)*rate*.1*(m===target||e.target==='frenzy'?1:coverage),u.code,'area','mixed');
        }
      }
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
