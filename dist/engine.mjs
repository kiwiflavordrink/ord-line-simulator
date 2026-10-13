// Expected-damage, 0.1-second step model. Mirrors work/physical_cut_screen.py.
const ROUND_ORDER=[60,61,62,63,64,65];
const physFactor=a=>a>=0?1/(1+.02*a):2-Math.pow(.98,-a);
const magicFactor=.95;

function formAt(hero,t){
  const code=hero.code,forms=hero.forms,base=forms[0];
  if(forms.length<2)return {form:base,transformed:false};
  if(code==='TR19'||code==='TR20')return {form:forms[1],transformed:true};
  const windows={TR3:[4.5,150,.25],TR6:[7,130,.25],TR18:[3.5,95,.33],
                 TR23:[4,150,0],I11:[11,0,0],E10:[2,100,0]};
  const w=windows[code];if(!w)return {form:base,transformed:false};
  let period=w[1]?w[0]+w[1]/(base.aps+w[2]):w[0]+1/(base.aps*.14);
  if(code==='E10')period=w[0]+100/(base.aps*.2);
  const transformed=(t%period)<w[0];
  return {form:transformed?forms[1]:base,transformed};
}

function eventDamage(event,mob,attack,cut,extraArmor){
  const pf=physFactor(mob.armor+(mob.kind==='line'?extraArmor:0)-cut);
  let damage=0;
  for(const part of event.parts){
    const [kind,flat,perc,attackMul=0]=part;
    let raw=flat+attackMul*attack;
    for(const [basis,ratio] of perc){
      const hp=basis==='max'?mob.maxhp:basis==='current'?mob.hp:mob.maxhp-mob.hp;
      raw+=ratio*hp;
    }
    damage+=raw*(kind==='physical'?pf:kind==='magic'?magicFactor:1);
  }
  return damage;
}

function isSummonEvent(event){
  return /완두콩|백설콩|파견 해군|거인족|부유물|릴리스|아틀라스|요크/.test(String(event.index));
}

export function simulate(data,heroCode,options={}){
  const hero=data.heroes.find(h=>h.code===heroCode);
  if(!hero)throw new Error('영웅을 찾을 수 없습니다');
  const cut=Math.max(0,Math.min(300,Number(options.cut??201)));
  const coverage=Math.max(0,Math.min(1,Number(options.coverage??1)));
  const fullResource=options.fullResource!==false;
  const summons=options.summons!==false;
  const events=hero.events.filter(e=>summons||!isSummonEvent(e));
  const baseAps=hero.forms[0].aps,hiddenAps=5.625,hiddenAttack=67806.45;
  const mobs=[],specials=[],checkpoints=[],timeline=[];
  let totalLineSpawned=0,totalLineKilled=0;
  for(const round of ROUND_ORDER){
    const [hp0,armor0]=data.rounds[String(round)];
    let spawned=0,specialKill=null;
    if(data.boss[String(round)]){
      const [bhp,barmor]=data.boss[String(round)];
      specials.push({hp:bhp,maxhp:bhp,armor:barmor,round,kind:'boss'});
    }
    for(let step=0;step<320;step++){
      const t=step*.1;
      const {form,transformed}=formAt(hero,t);
      let aps=form.aps;
      if(hero.code==='E10'&&transformed)aps=1/.11;
      const giant=(hero.code==='E1'||hero.code==='E2') && (t%(4.25+115/(baseAps+.25)))<4.25;
      if(giant)aps/=3.25;
      let attack=form.attack*1.35*((hero.code==='E1'||hero.code==='E2')?1.25:1);
      if(hero.code==='Z2')attack+=60000;
      if(hero.code==='I11')attack*=.25;
      if(hero.code==='TR11')attack*=1.45;
      if(hero.code==='TR19')attack*=1.375;
      let newMob=null;
      if(step%5===0&&spawned<35){
        newMob={hp:hp0,maxhp:hp0,armor:armor0,round,kind:'line'};
        mobs.push(newMob);spawned++;totalLineSpawned++;
      }
      if(data.frenzy[String(round)]&&step===75){
        const fhp=data.frenzy[String(round)];
        specials.push({hp:fhp,maxhp:fhp,armor:armor0+5,round,kind:'frenzy'});
      }
      for(let i=mobs.length-1;i>=0;i--)if(mobs[i].hp<=0){mobs.splice(i,1);totalLineKilled++;}
      for(let i=specials.length-1;i>=0;i--)if(specials[i].hp<=0)specials.splice(i,1);
      if(mobs.length+specials.length>=55){
        timeline.push({second:(round-60)*32+t,count:mobs.length+specials.length,round});
        return {hero,cut,coverage,clear:false,failedRound:round,failedSecond:+t.toFixed(1),
                remaining:mobs.length+specials.length,checkpoints,timeline,
                totalLineSpawned,totalLineKilled};
      }
      const active=specials.find(s=>s.round===round);
      const bossAura=specials.some(s=>s.kind==='boss');
      const frenzyAura=specials.some(s=>s.kind==='frenzy');
      const extraArmor=(bossAura?10:0)+(frenzyAura?5:0);
      if(newMob){
        for(const event of events){
          if(!event.on_spawn)continue;
          newMob.hp-=event.on_spawn*eventDamage(event,newMob,attack,cut,extraArmor);
        }
      }
      const regen=((bossAura?500000:0)+(frenzyAura?1000000:0))*.1;
      if(regen)for(const m of mobs)m.hp=Math.min(m.maxhp,m.hp+regen);
      for(const s of specials)s.hp=Math.min(s.maxhp,s.hp+(s.kind==='boss'?550000:1000000)*.1);
      const target=specials[0]??mobs[0]??null;
      if(target){
        const pf=physFactor(target.armor+(target.kind==='line'?extraArmor:0)-cut);
        const typeFactor=form.rounds[String(target.round)];
        target.hp-=attack*aps*typeFactor*pf*.1;
        if(form.splash){
          for(const m of mobs){
            if(m===target||m.hp<=0)continue;
            const mpf=physFactor(m.armor+extraArmor-cut);
            m.hp-=attack*aps*form.rounds[String(m.round)]*mpf*form.splash*.1*coverage;
          }
        }
        const bossCrit=target.kind==='boss'?2.2:1;
        target.hp-=hiddenAttack*hiddenAps*1.05*pf*bossCrit*.1;
      }
      const redAoe=hiddenAps*.15*275000*magicFactor*.1;
      for(const m of mobs)m.hp-=redAoe*(m===target?1:coverage);
      if(target&&target.kind!=='line'){
        const bonus=(target.kind==='frenzy'?.075:.0175)*target.maxhp;
        target.hp-=hiddenAps*.15*(550000+bonus)*magicFactor*.1;
      }
      for(const event of events){
        if(event.phase==='trans'&&!transformed)continue;
        if(event.phase==='base'&&transformed)continue;
        if(event.phase==='giant'&&!giant)continue;
        if(event.phase==='nongiant'&&giant)continue;
        let rate=event.rate*(event.per_attack?aps/baseAps:1);
        if(fullResource&&event.initial&&step===0)rate+=10;
        if(rate===0)continue;
        let targets;
        switch(event.target){
          case 'frenzy': targets=active?.kind==='frenzy'&&target===active?[active]:[];break;
          case 'line': targets=mobs;break;
          case 'special': targets=specials;break;
          case 'line_or_frenzy': targets=[...mobs,...specials.filter(s=>s.kind==='frenzy')];break;
          default: targets=[...mobs,...specials];
        }
        for(const m of targets){
          if(m.hp<=0)continue;
          const hit=m===target||event.target==='frenzy'?1:coverage;
          m.hp-=eventDamage(event,m,attack,cut,extraArmor)*rate*.1*hit;
        }
      }
      if(active&&active.hp<=0)specialKill=+t.toFixed(1);
      if(step%10===9)timeline.push({second:(round-60)*32+(step+1)*.1,
                                   count:mobs.filter(m=>m.hp>0).length+specials.filter(s=>s.hp>0).length,round});
    }
    for(let i=mobs.length-1;i>=0;i--)if(mobs[i].hp<=0){mobs.splice(i,1);totalLineKilled++;}
    for(let i=specials.length-1;i>=0;i--)if(specials[i].hp<=0)specials.splice(i,1);
    checkpoints.push({round,remaining:mobs.length+specials.length,
      priorRoundRemaining:[...mobs,...specials].filter(m=>m.round<round).length,
      currentRoundRemaining:[...mobs,...specials].filter(m=>m.round===round).length,
      specialKillSecond:specialKill});
  }
  return {hero,cut,coverage,clear:true,failedRound:null,failedSecond:null,
          remaining:mobs.length+specials.length,checkpoints,timeline,
          totalLineSpawned,totalLineKilled};
}
