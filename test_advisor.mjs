// Regression checks for dist/planner.mjs and dist/advisor.mjs (수정내역 34). Uses a small synthetic recipe fixture;
// ORD_JHelper data is not part of this repository.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reverseRawcode,indexRecipes,planTarget,reachable,handFromUnits,craftStages} from './dist/planner.mjs';
import {unitIndex,teamFromHand,controlSums,comboStats,similarClears,RED_FORCE_RAWCODE} from './dist/advisor.mjs';

const data=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));

// --- planner ---------------------------------------------------------------------------------------------------
assert.equal(reverseRawcode('Z20h'),'h02Z');
// LEGD = RARE + UNCM + 2 wood; RARE = CMA + CMB (both 흔함); UNCM has no recipe (안흔함 -> missing leaf).
const fixture={recipes:[
  {recipeId:'r1',outputs:[{kind:'UNIT',id:'LEGD'}],conditions:[{kind:'UNIT',id:'RARE',count:1},{kind:'UNIT',id:'UNCM',count:1},{kind:'WOOD',count:2},{kind:'UPUN',id:'NEXT'}]},
  {recipeId:'r2',outputs:[{kind:'UNIT',id:'RARE'}],conditions:[{kind:'UNIT',id:'CMA',count:1},{kind:'UNIT',id:'CMB',count:1}]},
  {recipeId:'r3',outputs:[{kind:'UNIT',id:'RARE'}],conditions:[{kind:'UNIT',id:'CMA',count:3},{kind:'KING',id:'x'}]},
  {recipeId:'r4',outputs:[{kind:'UNIT',id:'HIDN'}],conditions:[{kind:'UNIT',id:'LEGD',count:1},{kind:'UNIT',id:'CMA',count:1}]},
]};
const tiers={LEGD:'전설',RARE:'희귀함',UNCM:'안흔함',CMA:'흔함',CMB:'흔함',HIDN:'히든'};
const tier=id=>tiers[id];
const rec=indexRecipes(fixture);
assert.equal(rec.get('RARE').length,2,'two recipes for RARE');
assert.deepEqual(rec.get('LEGD')[0].special,[],'UPUN is not a requirement');

let p=planTarget('LEGD',{},rec,tier);
assert.equal(p.wisps,2,'empty hand: CMA + CMB = 2 wisps (r2 beats r3)');
assert.deepEqual(p.missing,{UNCM:1});
assert.equal(p.wood,2);assert.equal(p.ok,false);
assert.deepEqual(p.steps.map(s=>s.recipe),['r2','r1'],'craft order');

p=planTarget('LEGD',{RARE:1,UNCM:1},rec,tier);
assert.equal(p.wisps,0);assert.deepEqual(p.used,{RARE:1,UNCM:1});assert.equal(p.ok,true,'owned materials used first');

p=planTarget('HIDN',{LEGD:1,CMA:1},rec,tier);
assert.equal(p.ok,true,'an owned 전설 is not broken down');assert.equal(p.steps.length,1);

const r=reachable({LEGD:1},rec,tier,id=>['LEGD','HIDN'].includes(id));
assert.deepEqual(r.map(x=>x.id),['HIDN'],'owned units are not next targets');
assert.equal(r[0].plan.wisps,1);
// 수정내역 79: a recipe that consumes nothing (helper data: 해적선, 레일리(희귀)) is a special piece, not a free craft;
// craft stages list the crafts by grade with counts.
{
  const fx={recipes:[...fixture.recipes,
    {recipeId:'r5',outputs:[{kind:'UNIT',id:'SHIP'}],conditions:[]},
    {recipeId:'r6',outputs:[{kind:'UNIT',id:'BOAT'}],conditions:[{kind:'UNIT',id:'RARE',count:2},{kind:'UNIT',id:'SHIP',count:1}]}]};
  const t2=id=>({...tiers,SHIP:'기타',BOAT:'해적선'})[id];
  const rec2=indexRecipes(fx),q=planTarget('BOAT',{},rec2,t2);
  assert.deepEqual(q.missing,{SHIP:1},'해적선 piece is reported, not crafted for free');
  const st=craftStages(q,rec2,t2);
  assert.deepEqual(st.stages.map(g=>[g.tier,g.items.map(x=>x.id+'x'+x.count).join()]),[['희귀함','RAREx2'],['해적선','BOATx1']]);
  assert.deepEqual(st.commons,{CMA:2,CMB:2});
}

assert.deepEqual(handFromUnits([{Rawcode:'Z20h',Count:2,Owner:0},{Rawcode:'Z20h',Count:5,Owner:1},{c:'Z20h',k:1}]),{h02Z:3},
  'owner filter and tmo-style keys');

// --- advisor ---------------------------------------------------------------------------------------------------
const idx=unitIndex(data);
const raw=code=>data.heroes.find(h=>h.code===code).forms[0].rawcode;
const bart=raw('L13'),low=data.heroes.find(h=>h.grade==='흔함');
assert.equal(idx.get(bart),'L13');assert.equal(idx.get('h039'),'L23','alias for an engine-built support');
const t=teamFromHand(data,{[bart]:2,[low.forms[0].rawcode]:3,[RED_FORCE_RAWCODE]:1,zzzz:1},idx);
assert.deepEqual(t.team,[{code:'L13',count:2}],'흔함 units do not join the line team');
assert.equal(t.red,true);assert.deepEqual(t.unknown,['zzzz']);

const c=controlSums(data,[{code:'L13',count:1}],false);
assert.ok(Math.abs(c.stun-1)<1e-9,'바르톨로메오 전설 = stun index 1');
const z9=data.heroes.find(h=>h.code==='Z9');
assert.equal(controlSums(data,[{code:'Z9',count:2}],true).armorCut,z9.own_armor_cut+20,'distinct units + Red Force 20');

assert.deepEqual(comboStats(data,[]),{신:null,악몽:null,지옥:null},'empty team');
const s=comboStats(data,[{code:'L13',count:1}],{difficulties:['신']});
assert.equal(typeof s.신.remaining,'number');

const samples=[{d:'신',n:5,u:[{c:reverseRawcode(bart),k:1}]},{d:'신',n:30,u:[{c:'YYYY',k:1}]},{d:'악몽',n:1,u:[{c:reverseRawcode(bart),k:1}]}];
const sc=similarClears(samples,{[bart]:1});
assert.equal(sc.count,1);assert.equal(sc.median,5,'difficulty filter and overlap');

console.log('test_advisor: ok');

// --- overlay log parser (overlay/renderer/logparse.mjs) -----------------------------------------------------------
const {parseHelperText,goalId}=await import('./overlay/renderer/logparse.mjs');
assert.equal(goalId('rawcode:A90H'),'H09A');
const frame={Round:40,Difficulty:'악몽',GoalUnitId:'rawcode:A90H',Lumber:12,Units:[{Rawcode:'300h',Count:3,Owner:0}]};
let snap=parseHelperText(JSON.stringify({Frames:[frame]}));
assert.equal(snap.round,40);assert.equal(snap.goal,'H09A');assert.equal(snap.lumber,12);
assert.deepEqual(handFromUnits(snap.units),{h003:3});
snap=parseHelperText(['{"note":"no units"}',JSON.stringify({observation:{state:{Difficulty:'신',Round:61},units:[{rawcode:'Z20h',count:1,owner:0}]}}),'not json'].join('\n'));
assert.equal(snap.difficulty,'신');assert.equal(snap.round,61);assert.equal(snap.units[0].rawcode,'Z20h','newest JSON line with a unit list');
assert.equal(parseHelperText('garbage'),null);
console.log('test_advisor: log parser ok');

// --- memscan live file (tools/memscan/memscan.ps1 -Watch, 수정내역 43): helper-style reversed rawcodes + Code ------
{
  const live={Source:'memscan',Status:'빠름',Units:[{Rawcode:'500h',Code:'h005',Count:2,Owner:0,Name:'|cff20b2aa버기|r - |cff00ff00흔함|r'},
    {Rawcode:'A10h',Code:'h01A',Count:1,Owner:0,Name:'|c00b7b7f7크로커다일|r - |cff0080ff특별|r'}]};
  assert.deepEqual(handFromUnits(live.Units,0),{h005:2,h01A:1},'memscan live units -> hand');
  assert.deepEqual(handFromUnits(live.Units,1),{},'other player slot');
  assert.equal(parseHelperText(JSON.stringify(live)).units.length,2,'log parser also accepts the live file');
  console.log('test_advisor: memscan live ok');
}
