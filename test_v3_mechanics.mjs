// Focused checks for v3 calculation fixes. Each block names the change in docs/수정내역.md.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateV2,alabastaEvents,randomPicks,stackVariant,chainTargets,hitsSpecial} from './dist/engine_v3.mjs';
import {simulateSingle,singleConditions,SINGLE_MOB} from './dist/engine_single_v3.mjs';

const fullData=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));
// Blocks 1-18 check mechanisms on the 신 baseline they were written for: no 2.323 common HP/regen (#19)
// and no 61라 unit regen. Block 19 uses fullData.
const data=structuredClone(fullData);
data.difficulties['신'].common={hp:0,regen:0};delete data.round_regen;
const run=(team,o={})=>simulateV2(data,team,{red:false,redDamage:false,...o});

// [수정 1] 자원·변신 시계: 60라 시작 시 1회 만충 후 연속 시간.
{
  const legacy=run([{code:'TR11'}],{resourceMode:'perRound'});
  const start=run([{code:'TR11'}],{resourceMode:'start'});
  const empty=run([{code:'TR11'}],{resourceMode:'empty'});
  assert.equal(start.resourceMode,'start');
  assert.equal(run([{code:'TR11'}],{}).resourceMode,'start');
  assert.equal(run([{code:'TR11'}],{fullResource:false}).resourceMode,'empty');
  // Legacy gets a free cast again at the start of round 61; the new default does not.
  const at=(r,sec)=>r.timeline.find(p=>Math.abs(p.second-sec)<1e-6).count;
  assert.ok(at(legacy,41)<at(start,41));
  assert.equal(at(legacy,32),at(start,32));
  // A full start clears more of round 60 than an empty start.
  assert.ok(start.checkpoints[0].remaining<empty.checkpoints[0].remaining);
  // Transform clocks no longer restart every round: legacy and continuous TR18 results differ.
  assert.notDeepEqual(run([{code:'TR18',count:3}],{resourceMode:'perRound'}).checkpoints,
    run([{code:'TR18',count:3}]).checkpoints);
}
// [수정 2] TR23 특강 영구 몬스터포인트 폼.
{
  const tr23=data.heroes.find(h=>h.code==='TR23');
  assert.equal(tr23.permanent_form,1);
  assert.equal(tr23.forms[1].splash_radius,400);
}
// [수정 3·11] TR19: 기본 폼 H09B(300 스플래시), 우솝해머 H09C는 45초마다 5초.
{
  const tr19=data.heroes.find(h=>h.code==='TR19');
  assert.equal(tr19.permanent_form,undefined);
  assert.equal(tr19.forms[0].rawcode,'H09B');
  assert.equal(tr19.forms[0].splash_radius,300);
  assert.deepEqual([tr19.cooldown_form.window,tr19.cooldown_form.cooldown],[5,45]);
  const noHammer=structuredClone(data);delete noHammer.heroes.find(h=>h.code==='TR19').cooldown_form;
  assert.notDeepEqual(simulateV2(noHammer,[{code:'TR19'}],{}).checkpoints,simulateV2(data,[{code:'TR19'}],{}).checkpoints);
}
// [수정 4a] 단일 대상 종류: single(공격 대상 전체) / boss / frenzy / boss_parts.
{
  const probe=(target,parts,boss_parts)=>{
    const d=structuredClone(data),h=d.heroes.find(x=>x.code==='TR4');
    h.events=[{index:'probe',rate:1,rate_kind:'',parts,target,boss_parts,per_attack:false,phase:null,source:'',note:''}];
    return simulateV2(d,[{code:'TR4'}],{red:false,redDamage:false});
  };
  const fixed=[['fixed',3e7,[],0]];
  const single=probe('single',fixed),boss=probe('boss',fixed),frenzy=probe('frenzy',fixed);
  // 'single' hits line targets too; boss/frenzy-only kinds never touch line mobs.
  assert.ok(single.sourceDamage.TR4>0);
  assert.ok(Math.abs(single.lineDamage.single-(single.sourceDamage.TR4-single.lineDamage.basic-single.lineDamage.area))<1);
  assert.equal(boss.lineDamage.single,0);
  assert.equal(frenzy.lineDamage.single,0);
  // boss_parts replaces parts only against a boss: a huge boss value must speed up the 60R boss kill.
  const weakBoss=probe('single',fixed,[['fixed',1,[],0]]),strongBoss=probe('single',fixed,[['fixed',1e9,[],0]]);
  assert.ok(strongBoss.checkpoints[0].specialKillSecond<(weakBoss.checkpoints[0].specialKillSecond??99));
}
// [수정 4b] TR19 저격 보스 추가 피해: 보스 이벤트를 빼면 60라 보스 처치가 늦어진다.
{
  const without=structuredClone(data);
  const h=without.heroes.find(x=>x.code==='TR19');h.events=h.events.filter(e=>e.target!=='boss');
  const withBoss=simulateV2(data,[{code:'TR19'}],{}),noBoss=simulateV2(without,[{code:'TR19'}],{});
  assert.ok(withBoss.checkpoints[0].specialKillSecond<(noBoss.checkpoints[0].specialKillSecond??99));
  assert.ok(data.heroes.flatMap(x=>x.events).every(e=>e.target!=='single'||/근거/.test(e.note)));
}
// [수정 5] 영웅 스킬 아머브레이크: 스택이 쌓이고(상한 75) 조건부 효과를 연다.
{
  const strip=(code,fields)=>{const d=structuredClone(data),h=d.heroes.find(x=>x.code===code);
    for(const e of h.events)for(const f of fields)delete e[f];delete h.target_ab_aps_bonus;return d;};
  const ab=simulateV2(data,[{code:'TR29'}],{}),noAb=simulateV2(strip('TR29',['ab']),[{code:'TR29'}],{});
  // Round 61 (TR29 alone clears round 60 completely, so its average is over zero mobs).
  assert.ok(ab.checkpoints[1].averageAb>40&&ab.checkpoints[1].averageAb<=75);
  assert.equal(noAb.checkpoints[1].averageAb,0);
  // 운석낙하 needs AB 40: without hero AB it never fires, so TR29 does worse.
  assert.ok(ab.clear&&!noAb.clear);
  const tr22=simulateV2(data,[{code:'TR22'}],{}),flat=simulateV2(strip('TR22',['ab_scaling']),[{code:'TR22'}],{});
  assert.ok(tr22.sourceDamage.TR22>flat.sourceDamage.TR22);
}
// [수정 6a·6b] 공격력 오라 가산, 절대쿨·자원 발동률.
{
  const h=c=>data.heroes.find(x=>x.code===c),ev=(c,i)=>h(c).events.find(e=>e.index===i);
  assert.equal(h('I11').auras.find(a=>a.id==='A0Q1').value,-0.75);
  assert.ok(Math.abs(ev('I3','6').rate-1/(3.5+1/(0.025*h('I3').forms[0].aps)))<1e-12);
  assert.ok(Math.abs(ev('Z6','1').rate-(h('Z6').forms[0].aps*(1+5/3)+10/8)/55)<1e-12);
  assert.equal(ev('TR6','2').phase,'trans');
}
// [수정 7] I3 라인몹 제거: 라인 대상일 때만 집계된다.
{
  const r=simulateV2(data,[{code:'I3',count:3}],{});
  assert.ok(r.executeCounts.I3>0);
  const off=structuredClone(data);for(const e of off.heroes.find(x=>x.code==='I3').events)delete e.execute_line;
  assert.deepEqual(simulateV2(off,[{code:'I3',count:3}],{}).executeCounts,{});
}
// [수정 9] I8 공격력 버프, E12 파퓸페뮤르 상한, TR16·H16 중첩 불가.
{
  const e12=data.heroes.find(x=>x.code==='E12').events.find(e=>e.index==='1 단일 타격');
  assert.equal(e12.per_proc_cap_maxhp,1);
  {
    const ctx=await import('./dist/v3_effects.mjs');
    assert.equal(ctx.damageContext({selected:['TR16','H16']}).explosiveAmp,10);
    assert.equal(ctx.damageContext({selected:['H16','I2']}).explosiveAmp,25);
  }
}
// [수정 10] 크리티컬 기대값: 데이터 필드로 옮긴 TR11·TR19는 결과가 그대로, 크리를 빼면 약해진다.
{
  const tr20=simulateV2(data,[{code:'TR20'}],{});
  const noCrit=structuredClone(data);for(const f of noCrit.heroes.find(x=>x.code==='TR20').forms)delete f.crit;
  assert.ok(simulateV2(noCrit,[{code:'TR20'}],{}).sourceDamage.TR20<tr20.sourceDamage.TR20);
}
// [수정 12] 지속시간이 있는 방어력 감소: 디버프를 빼면 약해진다.
{
  const without=(code,f)=>{const d=structuredClone(data),h=d.heroes.find(x=>x.code===code);f(h);return d;};
  const tr6=simulateV2(data,[{code:'TR6',count:3}],{});
  const tr6off=simulateV2(without('TR6',h=>{for(const e of h.events)delete e.armor_debuff;}),[{code:'TR6',count:3}],{});
  assert.ok(tr6.remaining<tr6off.remaining);
  const i11=simulateV2(data,[{code:'I11'}],{});
  const i11off=simulateV2(without('I11',h=>{delete h.armor_stack_debuff;}),[{code:'I11'}],{});
  assert.ok(i11.clear&&!i11off.clear);
}
// [수정 13] Z10 처형자: 암브 조건을 0으로 낮추면 처형 상태가 자주 열려 피해가 늘어난다.
{
  const easy=structuredClone(data);easy.heroes.find(x=>x.code==='Z10').executioner.min_ab=0;
  const base=simulateV2(data,[{code:'Z10'}],{}),boosted=simulateV2(easy,[{code:'Z10'}],{});
  assert.ok(boosted.lineDamage.single>base.lineDamage.single);
}
// [수정 14] TR19 식물 배분: 기본(2/1/0)은 옵션 없음과 같고, 먹깨비는 처형을 만든다.
{
  const t=[{code:'TR19'}];
  assert.deepEqual(simulateV2(data,t,{tr19Plants:{pea:2,snow:1,muk:0}}).checkpoints,simulateV2(data,t,{}).checkpoints);
  assert.ok(simulateV2(data,t,{tr19Plants:{pea:0,snow:0,muk:3}}).executeCounts.TR19>0);
  assert.equal(simulateV2(data,t,{tr19Plants:{pea:3,snow:3,muk:3}}).executeCounts.TR19,undefined); // capped at 3 peas
}
// [수정 15] 아군 오라: 같은 오라는 한 번, 다른 오라는 합산, buffTargets로 대상 제한, 공속은 +400% 상한.
{
  const buffsOf=(team,o={})=>simulateV2(data,team,o).buffs;
  const two=buffsOf([{code:'I4'},{code:'I4'},{code:'TR19'}]);
  assert.equal(two.find(b=>b.code==='TR19').attack_pct,0.6);            // two I4 copies, one aura
  const mix=buffsOf([{code:'I4'},{code:'TR30'},{code:'TR19'}]).find(b=>b.code==='TR19');
  assert.ok(Math.abs(mix.attack_pct-1.0)<1e-12&&Math.abs(mix.aps-0.4)<1e-12);
  const limited=buffsOf([{code:'I4'},{code:'TR19'},{code:'TR11'}],{buffTargets:{I4:['TR11']}});
  assert.equal(limited.find(b=>b.code==='TR19').attack_pct,0);
  assert.equal(limited.find(b=>b.code==='TR11').attack_pct,0.6);
  const kaido=buffsOf([{code:'I11'},{code:'TR19'}]).find(b=>b.code==='TR19');
  assert.equal(kaido.attack_pct,-0.75);                                   // A0Q1 hits every own unit
  const tr22=buffsOf([{code:'TR22'},{code:'TR19'}]);
  assert.equal(tr22.find(b=>b.code==='TR22').mana_regen,0);               // own regen already in its rates
  assert.equal(tr22.find(b=>b.code==='TR19').mana_regen,3);
}
// [수정 16] 위치 모델(옵션): 기본값은 꺼짐, 스턴이 이동을 멈추게 해 결과를 바꾼다.
{
  assert.equal(simulateV2(data,[{code:'TR19'}],{}).positionModel,false);
  const on=simulateV2(data,[{code:'TR29',count:2}],{positionModel:true});
  assert.equal(on.positionModel,true);
  assert.ok(on.control.stunnedLineMobSeconds>0);
  const noStun=structuredClone(data);for(const e of noStun.heroes.find(h=>h.code==='TR29').events)delete e.stun;
  const off=simulateV2(noStun,[{code:'TR29',count:2}],{positionModel:true});
  assert.ok(off.remaining>on.remaining||!off.clear);
}
// [수정 18] 난이도 이속, 같은 이감 오라는 최고값 하나, 확률 스턴은 시드로 고정, 소환수 스킬.
{
  assert.deepEqual(data.difficulties['신'].speed,{aura:.25,line_flat:87});   // #19 replaced the +50% text
  const pos={positionModel:true},team=[{code:'TR29',count:2}];
  const slowMobs=structuredClone(data);slowMobs.difficulties['신'].speed={aura:0,line_flat:0};
  assert.notDeepEqual(simulateV2(slowMobs,team,pos).checkpoints,simulateV2(data,team,pos).checkpoints);
  const aura=(list)=>{const d=structuredClone(data);d.heroes.find(h=>h.code==='TR19').enemy_slow_auras=list;return simulateV2(d,[{code:'TR19'}],pos).checkpoints;};
  const a={id:'X',range:900};
  assert.deepEqual(aura([{...a,value:.3},{...a,value:.5}]),aura([{...a,value:.5}]));   // same id: highest only
  assert.notDeepEqual(aura([{...a,value:.5},{...a,id:'Y',value:.5}]),aura([{...a,value:.5}])); // different ids add
  const seeded=seed=>simulateV2(data,[{code:'I12',count:3}],{...pos,deletion:{seed}});
  assert.deepEqual(seeded(7).checkpoints,seeded(7).checkpoints);
  assert.ok(seeded(7).control.stunnedLineMobSeconds>0);
  const e5=data.heroes.find(h=>h.code==='E5');
  assert.ok(['파견 해적','이완코브'].every(i=>e5.events.some(e=>e.index===i))&&e5.enemy_armor_auras[0].value===11);
  const noSummon=structuredClone(data),h=noSummon.heroes.find(x=>x.code==='E5');
  h.events=h.events.filter(e=>!['파견 해적','이완코브'].includes(e.index));delete h.enemy_armor_auras;
  // same target rule for both (removing the summon lines would otherwise also change who it attacks, 수정내역 45)
  assert.ok(simulateV2(data,[{code:'E5'}],{specialFocus:'all'}).sourceDamage.E5>simulateV2(noSummon,[{code:'E5'}],{specialFocus:'all'}).sourceDamage.E5);
  const tr30=data.heroes.find(x=>x.code==='TR30').events.filter(e=>e.stun);
  assert.ok(tr30.some(e=>e.index==='스턴 아틀라스 타격')&&tr30.some(e=>e.index==='스턴 릴리스 버블건'));
  assert.ok(simulateV2(data,[{code:'TR30'}],pos).control.stunnedLineMobSeconds>0);
}
// [수정 19] 난이도(지옥·신·악몽)와 오로성: 몹 수치·패배 기준·마방·이속 공식·BHtc 이감 덮어쓰기·아군 저주.
{
  const D=fullData.difficulties;
  assert.deepEqual(D['신'].rounds,fullData.rounds);assert.deepEqual(D['신'].boss,fullData.boss);
  assert.deepEqual([D['지옥'].defeat,D['신'].defeat,D['악몽'].defeat],[70,55,50]);
  assert.ok(D['악몽'].rounds['65'][0]>D['신'].rounds['65'][0]&&D['지옥'].rounds['65'][0]<D['신'].rounds['65'][0]);
  // 신 102% slow target: (300 + 87) x (1.25 - 1.02) is MinUnitSpeed 89.
  assert.ok(Math.abs((300+D['신'].speed.line_flat)*(1+D['신'].speed.aura-1.02)-89)<0.1);
  const r=(o,team=[{code:'TR19'}])=>simulateV2(fullData,team,o);
  assert.deepEqual([r({}).difficulty,r({}).gorosei],['신','없음']);
  assert.equal(r({warcury:true}).gorosei,'워큐리');                           // legacy checkbox
  assert.equal(r({difficulty:'지옥',gorosei:'새턴'}).gorosei,'없음');           // 지옥 has no 오로성
  const mf=o=>r(o).magicFactor;
  assert.ok(Math.abs(mf({})-.95)<1e-9&&Math.abs(mf({difficulty:'악몽'})-.90)<1e-9);
  assert.ok(Math.abs(mf({gorosei:'워큐리'})-.85)<1e-9&&Math.abs(mf({difficulty:'악몽',gorosei:'워큐리'})-.80)<1e-9);
  const tr19=o=>r(o).buffs.find(b=>b.code==='TR19');
  assert.ok(Math.abs(tr19({gorosei:'새턴'}).attack_pct+.2)<1e-9&&Math.abs(tr19({gorosei:'나스쥬로',difficulty:'악몽'}).aps+.15)<1e-9);
  // Harder difficulties keep more mobs alive; the 2.323 common HP/regen makes 신 harder than the old baseline.
  const left=o=>r(o,[{code:'TR29',count:2}]).timeline.reduce((a,p)=>a+p.count,0);
  assert.ok(left({difficulty:'지옥'})<left({})&&left({})<=left({difficulty:'악몽'}));
  assert.ok(simulateV2(data,[{code:'TR29',count:2}],{}).timeline.reduce((a,p)=>a+p.count,0)<=left({}));
  // Thunder Clap slows share BHtc: tagging them as separate buffs changes the position-model result.
  const sep=structuredClone(fullData);for(const h of sep.heroes)for(const e of h.events)if(e.slow)delete e.slow.buff;
  const team=[{code:'I4'},{code:'TR22'},{code:'E12'}],pos={positionModel:true};
  assert.notDeepEqual(simulateV2(sep,team,pos).timeline,simulateV2(fullData,team,pos).timeline);
}
// [수정 20] 오로성 아군 감소의 보조·조건형·레드포스·단일 테스터 적용, 방어 공식 옵션, 레오.
{
  // Weak single units on 신, so line damage is not capped at the mobs' HP.
  const sup=o=>simulateV2(fullData,[{code:'L23'}],o).sourceDamage.L23;
  assert.ok(simulateV2(fullData,[{code:'L25'}],{gorosei:'새턴'}).sourceDamage.L25<simulateV2(fullData,[{code:'L25'}],{}).sourceDamage.L25&&sup({gorosei:'나스쥬로'})<sup({}));
  const red=o=>simulateV2(fullData,[{code:'L25'}],o).sourceDamage.H2;
  assert.ok(red({gorosei:'나스쥬로'})<red({}));
  const cond=o=>simulateV2(fullData,[{code:'H15'}],o).sourceDamage.H15;
  assert.ok(cond({gorosei:'새턴'})<cond({}));
  // Armor model (수정내역 22): default 'map' is the 2.305 formula (62라 171, 60라 boss 332); 'data' the old values.
  assert.equal(fullData.difficulties['신'].rounds['62'][1],171);assert.equal(fullData.difficulties['신'].boss['60'][1],332);
  assert.equal(fullData.difficulties['신'].armor_legacy.line['62'],181);assert.equal(fullData.difficulties['신'].armor_legacy.boss['60'],327);
  const t=[{code:'TR19',count:3}];
  assert.equal(simulateV2(fullData,t,{}).armorModel,'map');
  assert.notDeepEqual(simulateV2(fullData,t,{armorModel:'data'}).lineDamage,simulateV2(fullData,t,{}).lineDamage);
  // 레오 slow aura only matters in the position model.
  const pos={positionModel:true},team=[{code:'TR29',count:2}];
  assert.deepEqual(simulateV2(fullData,team,{leo:true}).checkpoints,simulateV2(fullData,team,{}).checkpoints);
  assert.notDeepEqual(simulateV2(fullData,team,{...pos,leo:true}).timeline,simulateV2(fullData,team,pos).timeline);
  // Single tester conditions: 신 adds the 2.323 common HP; 악몽 is tougher; 새턴 slows the kill.
  const god=singleConditions(fullData,{});
  assert.equal(god.hp,SINGLE_MOB.hp+5000000);assert.equal(god.armor,181);
  const s=(c)=>simulateSingle([{code:'L9',count:2}],{trials:300,seed:7,conditions:singleConditions(fullData,c)}).kill;
  assert.ok(s({})<s({difficulty:'악몽'})&&s({})<s({gorosei:'나스쥬로'}));
  // 새턴 mostly hits basic attacks, which are small next to 루치's procs; check its inputs instead of a noisy time.
  assert.deepEqual([singleConditions(fullData,{gorosei:'새턴'}).attackPct,singleConditions(fullData,{gorosei:'새턴'}).explosive],[-.2,-.07]);
  assert.equal(singleConditions(fullData,{difficulty:'지옥',gorosei:'새턴'}).gorosei,'없음');
}
// [수정 21] E6 비비 영원: 알라바스타 레벨, 랜덤 대상, 보스·광폭 전용 수치, 공격 가동률, 이동사격.
{
  const e6=fullData.heroes.find(h=>h.code==='E6');
  assert.equal(e6.forms[0].attack,187001);assert.equal(e6.own_range,true);
  // Level 10 rebuilt from level_formula equals the stored default parts.
  const mob={maxhp:1e8,hp:6e7};
  const tot=parts=>parts.reduce((a,[,f,p,mul=0])=>a+f+p.reduce((b,[bs,r])=>b+r*(bs==='max'?mob.maxhp:bs==='current'?mob.hp:mob.maxhp-mob.hp),0),0);
  alabastaEvents(e6,10).forEach((e,i)=>assert.ok(Math.abs(tot(e.parts)-tot(e6.events[i].parts))<1e-3));
  const idx=L=>alabastaEvents(e6,L).map(e=>e.index);
  assert.ok(!idx(4).includes('이동사격')&&!idx(6).includes('헤드샷 강화 라인')&&idx(7).includes('헤드샷 강화 라인'));
  assert.ok(!alabastaEvents(e6,10,false).some(e=>e.index==='이동사격'));
  assert.ok(alabastaEvents(e6,10,false).find(e=>e.index==='3연사 라인').rate<e6.events.find(e=>e.index==='3연사 라인').rate);
  const killed=o=>simulateV2(fullData,[{code:'E6'}],o).totalLineKilled;
  assert.ok(killed({e6AlabastaLevel:10})>killed({e6AlabastaLevel:5})&&killed({e6AlabastaLevel:5})>killed({e6AlabastaLevel:1}));
  // Random picks spread damage over every living enemy (no coverage): a lower coverage does not reduce 난사.
  const nansaOnly=structuredClone(fullData),h=nansaOnly.heroes.find(x=>x.code==='E6');
  h.events=h.events.filter(e=>e.index==='난사');h.alabasta=null;
  const d=o=>simulateV2(nansaOnly,[{code:'E6'}],o).sourceDamage.E6;
  assert.ok(d({})>0&&Math.abs(d({coverage:.5})-d({}))<1e-6*d({}));
}
// [수정 22] 검수 반영: 랜덤 대상 표본, Z8 접근 스킬, 레드포스 +35%(TR28·H15), TR6 양분, E6 가정 표시.
{
  // Two mobs of HP 100, one random hit of 100: exactly one dies (spreading 50/50 would kill none).
  for(const seed of [.1,.9]){
    const ms=[{hp:100},{hp:100}];
    randomPicks(ms,1,()=>seed,m=>{m.hp-=100;});
    assert.equal(ms.filter(m=>m.hp<=0).length,1);
  }
  // Draws skip dead candidates: two hits of 100 kill both.
  const two=[{hp:100},{hp:100}];randomPicks(two,2,()=>0,m=>{m.hp-=100;});
  assert.equal(two.filter(m=>m.hp<=0).length,2);
  // Same seed, same result; E6 still reports its unresolved assumptions.
  const e6=o=>simulateV2(fullData,[{code:'E6'}],o);
  assert.deepEqual(e6({deletion:{seed:5}}).checkpoints,e6({deletion:{seed:5}}).checkpoints);
  assert.equal(e6({}).assumptions.length,2);assert.match(e6({}).assumptions.join(),/이동사격/);
  assert.deepEqual(simulateV2(fullData,[{code:'TR19'}],{}).assumptions,[]);
  // Z8 approach: area (parts) and single (single_parts) split, once per enemy shared by copies, boss/frenzy 100%.
  const z8=fullData.heroes.find(h=>h.code==='Z8').events.find(e=>e.on_approach);
  assert.deepEqual([z8.parts[0][1],z8.single_parts[0][1],z8.on_approach.line,z8.on_approach.special],[450000,4500000,.2,1]);
  const noSpecial=structuredClone(fullData);noSpecial.heroes.find(h=>h.code==='Z8').events.find(e=>e.on_approach).on_approach.special=0;
  const z=(d,n)=>simulateV2(d,[{code:'Z8',count:n}],{}).sourceDamage.Z8;
  assert.ok(z(fullData,1)>z(noSpecial,1));                       // bosses and frenzy mobs trigger it
  const approachOnly=structuredClone(fullData),za=approachOnly.heroes.find(h=>h.code==='Z8');
  za.events=za.events.filter(e=>e.on_approach);za.events[0].ab=0;
  const one=simulateV2(approachOnly,[{code:'Z8',count:1}],{red:false,specialFocus:'all'}).sourceDamage.Z8;
  const three=simulateV2(approachOnly,[{code:'Z8',count:3}],{red:false,specialFocus:'all'}).sourceDamage.Z8;
  assert.ok(Math.abs(three-one)<1e-6*one);                       // copies share the once-per-enemy roll
  // Red Force +35% reaches TR28 and H15 basic attacks.
  for(const c of ['TR28','H15']){
    const dmg=red=>simulateV2(fullData,[{code:c}],{red,redDamage:false}).sourceDamage[c];
    assert.ok(dmg(true)>dmg(false),c);
  }
  // TR6 양분: shared counter, grows during the run, capped at 80, more stacks = more damage.
  const tr6=(s,n=1)=>simulateV2(fullData,[{code:'TR6',count:n}],{tr6Nutrients:s});
  assert.ok(tr6(0).nutrients.TR6>0&&tr6(80).nutrients.TR6===80);
  assert.ok(tr6(40).sourceDamage.TR6>tr6(0).sourceDamage.TR6);
  assert.ok(tr6(0,3).nutrients.TR6>tr6(0,1).nutrients.TR6);       // three copies feed one counter
  assert.equal(Object.keys(tr6(0,3).nutrients).length,1);
}
// [수정 23] 아카이누 히든(H17)과 외부 이감·스턴(위치 모델).
{
  const h17=fullData.heroes.find(h=>h.code==='H17');
  assert.equal(h17.forms[0].attack,51226.5);assert.ok(Math.abs(h17.forms[0].aps-4.8)<1e-9);
  // Its skill hits bosses for 275만 and frenzy mobs for 18% max HP: the boss dies sooner with it.
  const bossKill=team=>simulateV2(fullData,team,{}).checkpoints[0].specialKillSecond??99;
  assert.ok(bossKill([{code:'TR19'},{code:'H17'}])<bossKill([{code:'TR19'}]));
  const pos={positionModel:true},team=[{code:'TR19',count:2}];
  const left=o=>simulateV2(fullData,team,{...pos,...o}).totalLineKilled;
  assert.ok(left({externalSlow:1.02})>left({}));                    // slower mobs stay in range longer
  const stun=simulateV2(fullData,team,{...pos,externalStuns:[{rate:1,radius:600,normal:1.4,hero:.7}]});
  assert.ok(stun.control.stunnedLineMobSeconds>simulateV2(fullData,team,pos).control.stunnedLineMobSeconds);
  assert.deepEqual(simulateV2(fullData,team,{externalSlow:1.02}).checkpoints,simulateV2(fullData,team,{}).checkpoints); // coverage model ignores it
}
// [수정 24] 단일 컨: 단(15%까지)과 끝(15%부터 처치)이 동시에 돈다.
{
  const run=sc=>simulateV2(fullData,[{code:'H17'}],{red:false,singleControl:sc});
  assert.equal(run(null).totalLineKilled,0);
  const two=run({to15:2.78,finish:2.83});
  assert.ok(two.totalLineKilled>=8&&two.sourceDamage['단일 컨']>0);
  // Without a 끝 stream fast enough, mobs stop at 15%: a very slow finish kills far fewer.
  assert.ok(run({to15:2.78,finish:60}).totalLineKilled<two.totalLineKilled);
}
// [수정 27] 마딜 상위 30명: 모두 숫자 결과, 팀 효과(마방깎·증폭), 체력 자원, 라인 대상 조건.
{
  const added=fullData.heroes.filter(h=>h.source_group?.startsWith('docs/마딜_근거'));
  assert.equal(added.length,30);
  for(const h of added)for(const pos of [false,true]){
    const r=simulateV2(fullData,[{code:h.code,count:1}],{positionModel:pos});
    assert.ok(Number.isFinite(r.remaining)&&Object.values(r.sourceDamage).every(Number.isFinite),h.code);
    assert.ok(h.events.every(e=>/근거/.test(e.note)),h.code);
  }
  // team_effects add to the magic factor once per hero code (TR10 브룩: 라인존 마방깎 3레벨; 우타 라이브의 10레벨은
  // 수정내역 31부터 맞은 몹별 디버프라 팀 배율에 들어가지 않는다).
  assert.ok(Math.abs(simulateV2(fullData,[{code:'TR10',count:2}],{}).magicFactor-.98)<1e-9);
  assert.ok(Math.abs(simulateV2(fullData,[{code:'E9',count:2}],{}).magicFactor-.95)<1e-9);
  assert.ok(Math.abs(simulateV2(fullData,[{code:'TR19'}],{}).magicFactor-.95)<1e-9);
  // HP-resource skills ignore mana-regen buffs; when_target 'line' skips bosses and frenzy mobs.
  const i6=fullData.heroes.find(h=>h.code==='I6');
  assert.ok(i6.events.some(e=>e.when_target==='line')&&i6.events.some(e=>e.resource_kind==='hp'));
  const gated=structuredClone(fullData);for(const e of gated.heroes.find(h=>h.code==='I6').events)delete e.when_target;
  assert.ok(simulateV2(gated,[{code:'I6'}],{}).checkpoints[0].specialKillSecond<=(simulateV2(fullData,[{code:'I6'}],{}).checkpoints[0].specialKillSecond??99));
}
// [수정 28a] 아카이누 초월 철저한 정의 누적, 아인 뒤로뒤로 열매, 보니 나이 조작·세월관통 (몹별 시뮬레이션).
{
  // TR17: on one long-lived boss the justice multiplier counts 1, 2, 3, … per hero.
  const t=simulateV2(fullData,[{code:'TR17',count:1}],{});
  assert.deepEqual(t.justiceLog['TR17#0'].slice(0,3),[1,2,3]);
  // Z5: mobs are sent back to lower rounds and some reach the kill rule; no NaN.
  for(const n of [1,3]){const r=simulateV2(fullData,[{code:'Z5',count:n}],{difficulty:'지옥'});
    assert.ok(r.lowerCounts.moved>0&&r.lowerCounts.killed>0);assert.ok(Object.values(r.sourceDamage).every(Number.isFinite));}
  // TR21: per-mob 나이 조작 stacks replace the fixed armor_debuff event; runs in both models.
  assert.ok(!fullData.heroes.find(h=>h.code==='TR21').events.some(e=>e.index==='나이 조작 40'));
  for(const pm of [false,true])for(const n of [1,3]){const r=simulateV2(fullData,[{code:'TR21',count:n}],{positionModel:pm});
    assert.ok(Object.values(r.sourceDamage).every(Number.isFinite)&&r.sourceDamage.TR21>0);}
}
// [수정 29] 전 유닛 등록: 모든 유닛이 두 모델에서 돈다, 영웅 방깎 오라(heroArmorCuts), 추가 스택(extra_stacks·rate_mul).
{
  const units=fullData.heroes.filter(h=>h.source_group?.startsWith('docs/유닛_근거'));
  assert.ok(units.length>=170);
  for(const h of units){
    assert.ok(h.events.every(e=>/근거/.test(e.note)),h.code);
    const r=simulateV2(fullData,[{code:h.code,count:1}],{positionModel:true,heroArmorCuts:true});
    assert.ok(Number.isFinite(r.remaining)&&Object.values(r.sourceDamage).every(Number.isFinite),h.code);
  }
  // own_armor_cut adds to options.cut once per distinct hero (copies share one aura).
  assert.equal(simulateV2(fullData,[{code:'L22',count:2}],{cut:0,heroArmorCuts:true}).cut,30);
  assert.equal(simulateV2(fullData,[{code:'L22'},{code:'L24'}],{cut:0,heroArmorCuts:true}).cut,63);
  assert.equal(simulateV2(fullData,[{code:'L22'}],{cut:0}).cut,0);
  // TR24 버프 수: extra stack scales the 분신 rate on top of the 군함 백 level (rate_mul) and replaces parts.
  const tr24=fullData.heroes.find(h=>h.code==='TR24');
  const ev=(lv,ex)=>stackVariant(tr24,lv,ex).events.find(e=>e.index==='콤비네이션 분신 평타').rate;
  const mul=(.05+.0023*22)/(.05+.0023*3);
  assert.ok(Math.abs(ev('zero','max')/ev('zero',undefined)-mul)<1e-9);
  assert.ok(Math.abs(ev('max','max')/ev('max',undefined)-mul)<1e-9);
  // I5 불릿: stored data is the 30-charge (max) state; zero has fewer events' damage.
  const i5=fullData.heroes.find(h=>h.code==='I5');
  assert.equal(i5.stack.max,30);assert.deepEqual(i5.stack.variants.max,{});
}
// [수정 30] 체력 조건 처형(L27 조로 전설): 공격 대상 라인몹 체력 ≤ 15%일 때만 제거.
{
  const z=fullData.heroes.find(h=>h.code==='L27').events.find(e=>e.execute_below!=null);
  assert.equal(z.execute_below,.15);
  const off=structuredClone(fullData);off.heroes.find(h=>h.code==='L27').events=off.heroes.find(h=>h.code==='L27').events.filter(e=>e.execute_below==null);
  const team=[{code:'L27',count:3},{code:'H17'},{code:'TR11',count:2}];
  const a=simulateV2(off,team,{}),b=simulateV2(fullData,team,{});
  assert.ok(b.executeCounts.L27>0&&!a.executeCounts.L27);
  assert.ok(b.remaining<=a.remaining);
  // Alone, Zoro cannot bring line mobs to 15%: (almost) no executes.
  assert.ok((simulateV2(fullData,[{code:'L27'}],{}).executeCounts.L27??0)<=2);
  // 'lowest' target picks qualifying mobs in range at least as often as the attack target (position model).
  const p=o=>simulateV2(fullData,[{code:'L27',count:2},{code:'H17'},{code:'I12',count:2}],{positionModel:true,deletion:{seed:1},...o}).executeCounts.L27;
  assert.ok(p({executeTarget:'lowest'})>=p({}));
}
// [수정 31] 멀티샷, 연쇄·포크 번개, 서로 다른 무작위 대상, 지정 아군 버프, 적 개체별 디버프.
{
  // Multishot: removing it lowers TR4's line damage; the 15% 멀티샷 강타 hits the target plus the extra targets.
  const noMs=structuredClone(fullData);for(const f of noMs.heroes.find(h=>h.code==='TR4').forms)delete f.multishot;
  const ms=simulateV2(fullData,[{code:'TR4',count:3}],{}),plain=simulateV2(noMs,[{code:'TR4',count:3}],{});
  assert.ok(ms.lineDamage.area>plain.lineDamage.area);
  assert.equal(fullData.heroes.find(h=>h.code==='TR4').forms[0].multishot.extra,6);
  // chainTargets: bounce goes to the nearest unhit enemy of the previous hit; fork stays around the first target.
  const P=(x)=>({x,y:0,hp:1});const a=P(0),b=P(100),c=P(250),far=P(2000);
  const d=(m,q)=>Math.abs(m.x-q.x);
  assert.deepEqual(chainTargets(a,[a,c,b,far],{targets:4,range:200,mode:'bounce'},true,d),[a,b,c]);
  assert.deepEqual(chainTargets(a,[a,c,b,far],{targets:4,range:200,mode:'fork'},true,d),[a,b]);
  // Distinct random picks never repeat a mob.
  const seen=[];randomPicks([a,b,c],3,()=>0,m=>seen.push(m),true);assert.equal(new Set(seen).size,3);
  // Chosen-ally buff: L8 외과수술 goes to one receiver (default the other hero, or the listed code).
  const dflt=simulateV2(fullData,[{code:'TR4',count:2},{code:'L8'}],{});
  assert.deepEqual(dflt.chosenBuffs,{'L8#0':['TR4']});
  assert.equal(dflt.buffs.filter(x=>x.code==='TR4'&&x.aps>0).length,1);
  const self=simulateV2(fullData,[{code:'TR4'},{code:'L8'}],{chosenBuffTargets:{L8:['L8']}});
  assert.ok(self.buffs.find(x=>x.code==='L8').aps>0&&self.buffs.find(x=>x.code==='TR4').aps===0);
  // Same non-stacking group (가속): L8 150% and S5 100% on one unit keep the stronger value with combined uptime.
  const both=simulateV2(fullData,[{code:'TR4'},{code:'L8'},{code:'S5'}],{chosenBuffTargets:{L8:['TR4'],S5:['TR4']}});
  const up=1-(1-12/50)*(1-7/50);
  assert.ok(Math.abs(both.buffs.find(x=>x.code==='TR4').aps-1.5*up)<1e-9);
  // Per-mob debuff: 우타 라이브 no longer changes the team factor, but its hits still raise magic damage on the hit mobs.
  const noDbf=structuredClone(fullData);for(const e of noDbf.heroes.find(h=>h.code==='E9').events)delete e.mob_debuff;
  assert.ok(simulateV2(fullData,[{code:'E9',count:3}],{}).sourceDamage.E9>simulateV2(noDbf,[{code:'E9',count:3}],{}).sourceDamage.E9);
}
// [수정 32] controlOnly: the unit deals no damage but its stuns still act (position model).
{
  const r=simulateV2(fullData,[{code:'L13'}],{positionModel:true,controlOnly:['L13']});
  assert.equal(r.sourceDamage.L13??0,0);
}
// [수정 33] 홀딩 진단: 풀이감만이면 생성 간격(0.5초 × 최저 이속 89 = 44.5)대로 고른 직선, 범위 스턴을 얹으면 겹침이 생긴다.
{
  const o={positionModel:true,red:false,redDamage:false,externalSlow:1.02,holding:{radius:600,noDefeat:true,window:[4,16]}};
  const even=simulateV2(fullData,[{code:'H17',damage:false}],o).holding;
  assert.ok(Math.abs(even.gapMean-44.5)<1&&even.gapCV<.01&&even.piled===0);
  const stun=simulateV2(fullData,[{code:'L13'}],{...o,controlOnly:['L13']}).holding;
  assert.ok(stun.inZone>even.inZone&&stun.piled>.2);
  // Stun leaks: stunned share and the chance a stun episode ends with 1 s or more free; no stuns = 0.
  assert.ok(stun.stunnedShare>0&&stun.stunnedShare<1&&stun.leakChance>=0&&stun.leakChance<=1);
  assert.equal(even.stunnedShare,0);
  assert.equal(simulateV2(fullData,[{code:'L13'}],{}).holding,null);
}
// [수정 35] Z2 전설의 후예 레벨 성장: 시작 20은 그대로(이전 고정 20과 같음), 낮은 시작 레벨은 발동마다 2%씩 오르고
// 공격력·스킬 피해가 레벨을 따른다. 스택 zero/half는 시작 1/10.
{
  const t=[{code:'Z2',count:3}];
  const r20=simulateV2(fullData,t,{difficulty:'신'}),r10=simulateV2(fullData,t,{difficulty:'신',z2Level:10});
  assert.equal(r20.remaining,16);
  assert.deepEqual(r20.levels['Z2#0'],{start:20,end:20});
  const lv=r10.levels['Z2#0'];
  assert.equal(lv.start,10);assert.ok(lv.end>11&&lv.end<14,'about +2 levels over rounds 60-65');
  assert.ok(r10.sourceDamage.Z2<r20.sourceDamage.Z2);
  assert.equal(simulateV2(fullData,t,{difficulty:'신',stackLevel:'half'}).levels['Z2#0'].start,10);
  assert.equal(simulateV2(fullData,t,{difficulty:'신',stackLevel:'zero'}).levels['Z2#0'].start,1);
  assert.equal(simulateV2(fullData,t,{difficulty:'신',z2Level:5,stackLevel:'max'}).levels['Z2#0'].start,5,'z2Level wins over the stack level');
  // Growth rate: (8% + 10%) procs per attack x 2% per proc.
  const g=fullData.heroes.find(h=>h.code==='Z2').level_growth;
  assert.equal(g.chance,.02);assert.deepEqual(g.proc_events,['3','4','4 특수 확률 증가']);
}
// [수정 36] 그린블러드: 전설/히든 1기에 공속 +30%와 3초마다 825 범위 40만 + 최대 체력 0.4% 고정 피해. 제한 등급은 거부.
// 카타쿠리 특강: 접근 스킬이 라인몹에도 100%.
{
  const t=[{code:'L37'},{code:'Z2'}];
  const off=simulateV2(fullData,t,{difficulty:'신'}),on=simulateV2(fullData,t,{difficulty:'신',greenBlood:'L37'});
  assert.equal(off.greenBlood,null);assert.deepEqual(on.greenBlood,{code:'L37',applied:true});
  assert.ok(Math.abs(on.buffs.find(b=>b.code==='L37').aps-.3)<1e-12);
  assert.ok(on.sourceDamage.L37>off.sourceDamage.L37);
  const bad=simulateV2(fullData,t,{difficulty:'신',greenBlood:'Z2'});
  assert.equal(bad.greenBlood.applied,false);assert.equal(bad.sourceDamage.Z2,off.sourceDamage.Z2);
  assert.equal(simulateV2(fullData,t,{greenBlood:'H18'}).greenBlood.reason,'조합에 없음');
  // Only one copy gets it.
  const two=simulateV2(fullData,[{code:'L37',count:2}],{greenBlood:'L37'});
  assert.equal(two.buffs.filter(b=>b.aps>=.3-1e-12).length,1);
  const k0=simulateV2(fullData,[{code:'Z8',count:2}],{difficulty:'지옥'}),k1=simulateV2(fullData,[{code:'Z8',count:2}],{difficulty:'지옥',traits:{Z8:'on'}});
  assert.ok(k1.sourceDamage.Z8>k0.sourceDamage.Z8&&k1.remaining<k0.remaining);
}
// [수정 37] 엔진 내장 보조의 자기 방깎 오라(L7 레일리 20, L25 울티 27)도 heroArmorCuts에 들어간다.
{
  assert.equal(simulateV2(fullData,[{code:'L7'},{code:'Z2'}],{heroArmorCuts:true,cut:0}).cut,58);
  assert.equal(simulateV2(fullData,[{code:'L25'}],{heroArmorCuts:true,cut:0}).cut,27);
  assert.equal(simulateV2(fullData,[{code:'L7'}],{cut:0}).cut,0,'off by default');
}
// [수정 44] specialTimer: 보스·광폭은 나온 뒤 정한 시간이 지나면 사라지고, 살아 있을 때만 붙는 원혼 폭발 매 타격도 그만큼만 붙는다.
{
  const off=simulateV2(fullData,[{code:'L10'}],{red:false,redDamage:false,cut:0});
  const on=simulateV2(fullData,[{code:'L10'}],{red:false,redDamage:false,cut:0,specialTimer:{boss:3,frenzy:3}});
  assert.ok(on.checkpoints[0].specialKillSecond!=null&&on.checkpoints[0].specialKillSecond<=3.1,'boss removed by the timer');
  assert.ok(on.sourceDamage.L10<off.sourceDamage.L10||on.failedRound>off.failedRound||on.clear,'less boss-time bonus, or longer survival');
  assert.deepEqual(simulateV2(fullData,[{code:'L10'}],{specialTimer:null}).checkpoints.map(c=>c.remaining),
    simulateV2(fullData,[{code:'L10'}]).checkpoints.map(c=>c.remaining),'off by default');
}
// [수정 45] 보스·광폭: 단일 피해 문장이 있는 영웅만 보스·광폭을 때리고, 광폭은 받는 피해 +50%·폭발형 0.8배,
// 제파 흑완·네코 광분의 보스·광폭 공격 시 범위는 라인몹에도 들어간다.
{
  const ev=c=>fullData.heroes.find(h=>h.code===c).events;
  assert.equal(hitsSpecial(ev('L9')),true,'루치: 단일 34만5천·육식 25만은 보스에도 들어간다');
  assert.equal(hitsSpecial([{target:'single_line',parts:[['magic',0,[['current',.34]],0]]},{radius:300,parts:[['magic',1e5,[],0]]}]),false,'라인 전용 단일·범위만이면 보스를 안 때린다');
  assert.equal(hitsSpecial(ev('E1')),false);
  const r=simulateV2(fullData,[{code:'E1'}],{red:false,redDamage:false});
  const all=simulateV2(fullData,[{code:'E1'}],{red:false,redDamage:false,specialFocus:'all'});
  assert.ok(r.sourceDamage.E1>all.sourceDamage.E1,'광역 유닛은 보스가 살아 있어도 라인몹을 때린다');
  const t0=simulateV2(fullData,[{code:'L26'}],{frenzyDamageTaken:0}),t1=simulateV2(fullData,[{code:'L26'}]);
  const k=x=>x.checkpoints.slice(1,5).map(c=>c.specialKillSecond);
  assert.ok(k(t1).every((v,i)=>v!=null&&(k(t0)[i]==null||v<=k(t0)[i])),'광폭 받는 피해 증가로 더 빨리 잡힌다');
  const z=ev('L26').find(e=>e.index==='흑완 보스·광폭 범위');
  assert.deepEqual([z.radius,z.when_target,z.parts[0][2][0]],[650,['boss','frenzy'],['max',.004]]);
  const g=ev('L3').find(e=>e.index==='광분 범위');assert.deepEqual([g.radius,g.when_target],[600,['boss']]);
  const noArea=structuredClone(fullData);noArea.heroes.find(h=>h.code==='L26').events=noArea.heroes.find(h=>h.code==='L26').events.filter(e=>e.index!=='흑완 보스·광폭 범위');
  assert.ok(simulateV2(fullData,[{code:'L26'}]).sourceDamage.L26>simulateV2(noArea,[{code:'L26'}]).sourceDamage.L26,'보스·광폭 공격 시 범위가 라인몹에 들어간다');
}
// [수정 46] 범위 체력 비례의 기준: 로우 4개는 공격 대상의 체력으로 범위 전체에 같은 값, 타시기 난향접 체력 비례는 단일.
{
  const ev=c=>fullData.heroes.find(h=>h.code===c).events;
  assert.deepEqual(['인젝션 샷','수술수술열매'].map(i=>ev('L8').find(e=>e.index===i).pct_basis),['target','target']);
  assert.deepEqual(['인젝션샷','라디오나이프'].map(i=>ev('TR5').find(e=>e.index===i).pct_basis),['target','target']);
  assert.deepEqual(ev('TR27').filter(e=>/최대체력/.test(e.index)).map(e=>[e.target,e.radius]),[['single_line',undefined],['target_special',undefined]]);
  const own=structuredClone(fullData);for(const e of own.heroes.find(h=>h.code==='L8').events)delete e.pct_basis;
  const a=simulateV2(fullData,[{code:'L8'}]).sourceDamage.L8,b=simulateV2(own,[{code:'L8'}]).sourceDamage.L8;
  assert.ok(a!==b,'공격 대상 기준과 각자 기준의 피해가 다르다');
}
// [수정 50] 단일 테스터에 루치 초월(TR7): 툴팁 4스킬, 1기의 100→15%가 루치 전설 2기(2단)와 비슷하다.
{
  const c=singleConditions(fullData,{});
  const tr=simulateSingle([{code:'TR7',count:1}],{trials:1000,seed:7,conditions:c});
  const l2=simulateSingle([{code:'L9',count:2}],{trials:1000,seed:7,conditions:c});
  assert.ok(Math.abs(tr.to15-l2.to15)<.5,`루치 초월 1기 ${tr.to15.toFixed(2)}초 ≈ 루치 전설 2기 ${l2.to15.toFixed(2)}초`);
  assert.ok(tr.kill<10&&tr.to15>2&&tr.to15<4);
  const L=simulateSingle([{code:'L36',count:1}],{trials:1000,seed:7,conditions:c}),LT=simulateSingle([{code:'L36',count:1},{code:'TR7',count:1}],{trials:1000,seed:7,conditions:c});
  assert.ok(LT.kill<L.kill,'함께 넣으면 더 빨리 잡는다');
}
// [수정 51] 프랑키 초월: 꾸드방 단일 추가, 솔져도크 미사일 2+써니호, 특성(프랑키 장군) 옵션, 써니호 선제공격.
{
  const t=n=>[{code:'TR28'},{code:'H15',count:n}];
  const o={red:false,redDamage:false};
  const dmg=(n,x={})=>{const r=simulateV2(fullData,t(n),{...o,...x});return r.sourceDamage.TR28;};
  assert.ok(dmg(3)>dmg(2)&&dmg(4)>dmg(3),'써니호가 늘면 미사일이 늘어 프랑키 피해가 는다');
  const g=simulateV2(fullData,t(3),{...o,frankyTrait:true});
  assert.ok(g.control.frankyGenerals>0,'특성이면 마나 150마다 프랑키 장군');
  assert.ok(!simulateV2(fullData,t(3),o).control.frankyGenerals,'기본은 라디칼 빔');
  assert.ok(g.lineDamage.single>0);
  // 선제공격: 써니호 혼자(프랑키 없음)라도 보스·광폭 첫 공격에 185만 범위가 터진다.
  const solo=simulateV2(fullData,[{code:'H15'}],{...o,frankyAura:false});
  assert.equal(solo.control.sunnyCasts,0);
  assert.ok(solo.sourceDamage.H15>0);
}
// [수정 52] 마나재생 오라가 프랑키·써니호에도: 코알라 왜곡 3.25, 슈가 전설 1.25, 프랑키 자신 제외 5(영웅에게도).
{
  const o={red:false,redDamage:false,frankyTrait:true};
  const base=simulateV2(fullData,[{code:'TR28'},{code:'H15',count:4}],o);
  const mana=simulateV2(fullData,[{code:'TR28'},{code:'H15',count:4},{code:'D2',damage:false},{code:'L19',damage:false}],o);
  assert.ok(mana.control.sunnyCasts>base.control.sunnyCasts,'써니호 마나가 더 빨리 찬다');
  assert.ok(mana.control.frankyGenerals>base.control.frankyGenerals,'프랑키도 아군 마나재생을 받는다');
  const d2=simulateV2(fullData,[{code:'D2'}],{red:false}),d2f=simulateV2(fullData,[{code:'D2'},{code:'TR28',damage:false}],{red:false});
  assert.ok(d2f.sourceDamage.D2>d2.sourceDamage.D2,'프랑키 오라 마나재생 5가 다른 영웅 스킬도 빠르게 한다');
}
// [수정 53] freshTarget: 단일 유닛이 새 몹(15% 초과 중 가장 최근)을 치면 현재체력 비례 단일이 세져 라인이 줄어든다.
{
  const team=[{code:'E9'},{code:'L16'},{code:'L31'},{code:'L9'}];
  const o={red:false,redDamage:false,cut:0};
  const a=simulateV2(fullData,team,{...o,freshTarget:false}),b=simulateV2(fullData,team,o),c=simulateV2(fullData,team,{...o,freshTarget:['L16','L31','L9']});
  assert.ok(b.sourceDamage.L9>a.sourceDamage.L9&&b.sourceDamage.L31>a.sourceDamage.L31,'새 몹이면 현재체력 비례가 크다');
  assert.equal(b.sourceDamage.L9,c.sourceDamage.L9,'기본(54) = 단 유닛 목록');
  assert.equal(simulateV2(fullData,team,{...o,freshTarget:true}).sourceDamage.L9,b.sourceDamage.L9);
  assert.equal(simulateV2(fullData,team,{...o,freshTarget:['L36']}).sourceDamage.E9,a.sourceDamage.E9,'목록에 없는 유닛은 그대로');
}
// [수정 56] 로얄로더(패왕의길 노드): 최상위 1기에 공속 +25%·공격력 +25,000·8% 400범위 고정(671,052.6 × 기본 쿨).
{
  const o={red:false,redDamage:false};
  const a=simulateV2(fullData,[{code:'TR12'}],o),b=simulateV2(fullData,[{code:'TR12'}],{...o,royalRoader:true});
  assert.ok(b.sourceDamage.TR12>a.sourceDamage.TR12,'로얄로더가 최상위 유닛을 강화한다');
  assert.equal(simulateV2(fullData,[{code:'L16'}],{...o,royalRoader:true}).sourceDamage.L16,simulateV2(fullData,[{code:'L16'}],o).sourceDamage.L16,'전설은 대상이 아니다');
  const c=simulateV2(fullData,[{code:'L16'},{code:'TR12'}],{...o,royalRoader:'TR12'});
  assert.ok(c.sourceDamage.TR12>simulateV2(fullData,[{code:'L16'},{code:'TR12'}],o).sourceDamage.TR12);
}
// [수정 57] 특강 데이터: 핸콕 영원(석화 2레벨: 석화발현 7.5→10%, 방깎 35→40, 슬레이브 애로우 0.1% 폭발형), 상디 초월(H09G 제르마 블랙).
{
  const o={red:false,redDamage:false};
  const e0=simulateV2(fullData,[{code:'E12'}],o),e1=simulateV2(fullData,[{code:'E12'}],{...o,traits:{E12:'on'}});
  assert.ok(e1.sourceDamage.E12>e0.sourceDamage.E12,'핸콕 영원 특강이 더 세다');
  assert.equal(simulateV2(fullData,[{code:'E12'}],{...o,heroArmorCuts:true,cut:0,traits:{E12:'on'}}).cut,40);
  const t0=simulateV2(fullData,[{code:'TR12'}],o),t1=simulateV2(fullData,[{code:'TR12'}],{...o,traits:{TR12:'on'}});
  assert.ok(t1.sourceDamage.TR12>t0.sourceDamage.TR12,'상디 초월 특강(제르마 블랙)이 더 세다');
}
console.log('V3 mechanics: resource clock, forms, single-target kinds, boss lines, hero armor break, auras and rates, execute, P1 omissions, crit, armor debuffs, executioner, TR19 plants, ally auras, position model, difficulty/slow auras/summons, difficulty tables and 오로성, curse on supports/single, armor model, 레오, E6, review fixes (random picks, Z8, Red Force, TR6), H17 and external control, single control, 30 magic heroes, TR17/Z5/TR21 mechanics, all units, hero armor auras, extra stacks, HP-condition execute, multishot/chain/chosen buffs/per-mob debuffs, holding probe, Z2 level growth, green blood, Z8 trait, support armor auras, special timer, boss/frenzy targeting, target-based area percent, TR7 single, TR28 franky, unit mana auras, fresh single targets, royal roader, E12/TR12 traits: passed');
