// Focused checks for v3 calculation fixes. Each block names the change in docs/수정내역.md.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateV2} from './dist/engine_v3.mjs';

const data=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));
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
// [수정 3] TR19는 저격왕 기본 폼 H09B(300 스플래시).
{
  const tr19=data.heroes.find(h=>h.code==='TR19');
  assert.equal(tr19.permanent_form,undefined);
  assert.equal(tr19.forms[0].rawcode,'H09B');
  assert.equal(tr19.forms[0].splash_radius,300);
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
console.log('V3 mechanics: resource clock, TR23 form, TR19 form, single-target kinds, boss lines, hero armor break: passed');
