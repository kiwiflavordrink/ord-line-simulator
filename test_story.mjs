// Story mode and story kill times (수정내역 38).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateV2} from './dist/engine_v3.mjs';
import {storyKillTime,storyHpMultiplier,dataAtUpgrade,upgradeBonus} from './dist/story.mjs';
const data=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));

assert.equal(data.stories.stages.length,14);
assert.deepEqual(data.stories.stages[11],{stage:12,rawcode:'n00D',name:'홀케이크섬',hp:155000000,armor:240,armor_type:'fort',regen:1000});
assert.ok(Math.abs(storyHpMultiplier(data,'신',1,12)-1.27)<1e-9,'신 solo: +58% +14% −45%');
assert.ok(Math.abs(storyHpMultiplier(data,'신',4,12)-(1+.58+.56))<1e-9);
assert.ok(Math.abs(storyHpMultiplier(data,'신',1,14)-1.02)<1e-9,'solo R02I on 13·14단계');

// Upgrade: L13 바르톨로메오 R000 = 7250 + 20 x 725 at 21; level 0 removes it.
const L13=data.heroes.find(h=>h.code==='L13').forms[0];
assert.deepEqual(L13.attack_upgrade,{id:'R000',first:7250,per_level:725,max_level:21});
assert.equal(upgradeBonus(L13.attack_upgrade,21),21750);
assert.equal(dataAtUpgrade(data,()=>0).heroes.find(h=>h.code==='L13').forms[0].attack,L13.attack-21750);
assert.equal(dataAtUpgrade(data,()=>12).heroes.find(h=>h.code==='L13').forms[0].attack,L13.attack-21750+7250+11*725);

// Story mode: one target, no line spawns, ends on the kill; more upgrades kill faster; impossible → Infinity.
const r=simulateV2(data,[{code:'L13'}],{story:{hp:1e6,armor:46,regen:0,seconds:300}});
assert.equal(r.story.killed,true);assert.equal(r.totalLineSpawned,0);
const t0=storyKillTime(data,['L13'],4,{level:()=>0}),t21=storyKillTime(data,['L13'],4,{level:()=>21});
assert.ok(t21<t0,'upgrades shorten the kill');
assert.equal(storyKillTime(data,['C6'],12,{seconds:60}),Infinity);
// Percent-HP parts apply to a story as the tooltip says unless an event has a story/boss line (수정내역 40, user:
// "이런 퍼뎀은 그냥 튤팁 뎀지 적용", e.g. 시라호시 초월). A story_parts line replaces them (시류 히든 "스토리 제외").
const pct=structuredClone(data);pct.heroes.push({code:'XPCT',name:'퍼뎀 테스트',grade:'전설',forms:[{attack:1,aps:1,attack_type:'normal',splash:0,splash_radius:0,
  rounds:{60:1,61:1,62:1,63:1,64:1,65:1},cooldown:1,range:600}],events:[{index:'p',rate:1,parts:[['fixed',0,[['max',.5]],0]],target:'single'}]});
assert.equal(simulateV2(pct,[{code:'XPCT'}],{red:false,story:{hp:1e6,armor:0,regen:0,seconds:20}}).story.killed,true);
pct.heroes.at(-1).events[0].story_parts=[['fixed',0,[],0]];
assert.equal(simulateV2(pct,[{code:'XPCT'}],{red:false,story:{hp:1e6,armor:0,regen:0,seconds:20}}).story.killed,false);
assert.deepEqual(data.heroes.find(h=>h.code==='H14').events.find(e=>e.index==='혈우').story_parts,[['magic',2250000,[],0]]);
// The 60~65 line run is unchanged by the story option's absence.
assert.equal(simulateV2(data,[{code:'Z2',count:3}],{difficulty:'신'}).remaining,16);
// [수정 39] Tooltip story lines: story_parts (아카이누 히든 "스토리에게는 150%"), boss/story lines via boss_parts,
// story_hits on boss/special events, 슈가 전설 = itself + No.31 toy.
{
  const H17=data.heroes.find(h=>h.code==='H17').events.find(e=>e.index==='스킬');
  assert.deepEqual(H17.story_parts,[['magic',625000,[],0]]);
  // Without the story line a story would take the boss line (1000%); with a plain 25만 line it would be slower.
  const bossLine=structuredClone(data);delete bossLine.heroes.find(h=>h.code==='H17').events.find(e=>e.index==='스킬').story_parts;
  const plain=structuredClone(data);plain.heroes.find(h=>h.code==='H17').events.find(e=>e.index==='스킬').story_parts=[['magic',250000,[],0]];
  const t=storyKillTime(data,['H17'],5);
  assert.ok(storyKillTime(bossLine,['H17'],5)<t&&t<storyKillTime(plain,['H17'],5),'story 150% line, not the boss 1000% line');
  assert.equal(data.heroes.find(h=>h.code==='L18').events.find(e=>e.index==='사람사람열매 보스 추가').story_hits,true);
  const noHit=structuredClone(data);delete noHit.heroes.find(h=>h.code==='L18').events.find(e=>e.index==='사람사람열매 보스 추가').story_hits;
  assert.ok(storyKillTime(data,['L18'],6)<storyKillTime(noHit,['L18'],6));
  // 핸콕 전설 피스톨키스 / 스튜시 흡혈: bosses and stories take the flat tooltip damage, not percent.
  assert.deepEqual(data.heroes.find(h=>h.code==='L36').events.find(e=>e.index==='피스톨키스 상태 단일').boss_parts,[['magic',150000,[],0]]);
  // 슈가 전설 brings No.31: faster than 슈가 alone.
  const d=dataAtUpgrade(data,()=>99);
  assert.ok(d.heroes.some(h=>h.code==='L19T'));
  const r=simulateV2(d,[{code:'L19S'}],{red:false,cut:0,heroArmorCuts:true,story:{hp:4456200*1.27,armor:75,regen:0,seconds:600}}).story.second;
  assert.ok(storyKillTime(data,['L19'],5)<r,'No.31 adds story damage');
}
console.log('Story: stages, HP scaling, upgrade levels, story mode, tooltip percent rule, tooltip story lines, 슈가 toy: passed');
