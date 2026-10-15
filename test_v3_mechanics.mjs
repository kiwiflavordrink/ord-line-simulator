// Focused checks for v3 calculation fixes. Each block names the change in docs/수정내역.md.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateV2} from './dist/engine_v3.mjs';
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
  assert.ok(simulateV2(data,[{code:'E5'}],{}).sourceDamage.E5>simulateV2(noSummon,[{code:'E5'}],{}).sourceDamage.E5);
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
  // Armor model: 'map' uses the 2.305 formula (62라 171 instead of 181), default unchanged.
  assert.equal(fullData.difficulties['신'].armor_map.line['62'],171);
  const t=[{code:'TR19',count:3}];
  assert.equal(simulateV2(fullData,t,{}).armorModel,'data');
  assert.notDeepEqual(simulateV2(fullData,t,{armorModel:'map'}).lineDamage,simulateV2(fullData,t,{}).lineDamage);
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
console.log('V3 mechanics: resource clock, forms, single-target kinds, boss lines, hero armor break, auras and rates, execute, P1 omissions, crit, armor debuffs, executioner, TR19 plants, ally auras, position model, difficulty/slow auras/summons, difficulty tables and 오로성, curse on supports/single, armor model, 레오: passed');
