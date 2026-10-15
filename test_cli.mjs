// Integration test: CLI output must equal direct calls to the dist/ engines.
// The direct calls below are written out by hand (same mapping as dist/v3.mjs options()),
// so a mistake in the CLI's option mapping shows up as a mismatch.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {simulateV2} from './dist/engine_v3.mjs';
import {simulateSingle,referenceSingle} from './dist/engine_single_v3.mjs';
import {damageContext} from './dist/v3_effects.mjs';

const data=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));
const CLI=new URL('./cli/ordsim.mjs',import.meta.url).pathname;
const cli=(args,input)=>{
  const p=spawnSync(process.execPath,[CLI,...args],{input,encoding:'utf8'});
  return {status:p.status,stderr:p.stderr,json:p.stdout?JSON.parse(p.stdout):null};
};
const fromFile=f=>cli([`examples/${f}`,'--compact']);
const lineOpts=(ctx,extra)=>({...extra,magicReduction:ctx.magicCut/100,magicAmp:ctx.magicAmp/100,
  allAmp:ctx.allAmp/100,explosiveAmp:ctx.generalExplosiveAmp/100,
  normalOnlyExplosiveAmp:ctx.normalOnlyExplosiveAmp/100,warcury:ctx.warcury});

function assertLine(out,direct){
  assert.equal(out.clear,direct.clear);
  assert.equal(out.failedRound,direct.failedRound);
  assert.equal(out.failedSecond,direct.failedSecond);
  assert.deepEqual(out.final,{remaining:direct.remaining,lineRemaining:direct.lineRemaining,averageAb:direct.averageAb});
  for(const cp of direct.checkpoints){
    const row=out.rounds.find(r=>r.round===cp.round);
    assert.equal(row.remaining,cp.remaining,`round ${cp.round} remaining`);
    assert.equal(row.lineRemaining,cp.lineRemaining);
    assert.equal(row.priorRoundRemaining,cp.priorRoundRemaining);
    assert.equal(row.currentRoundRemaining,cp.currentRoundRemaining);
    assert.equal(row.averageAb,cp.averageAb);
    if(row.special)assert.equal(row.special.killSecond,cp.specialKillSecond,`round ${cp.round} special`);
  }
  assert.equal(out.rounds.filter(r=>r.completed).length,direct.checkpoints.length);
  assert.deepEqual(out.damage.byCategory,direct.lineDamage);
  assert.deepEqual(out.damage.bySource,direct.sourceDamage);
  assert.deepEqual(out.deletions,direct.deleteCounts);
  assert.deepEqual(out.executions,direct.executeCounts);
  assert.deepEqual(out.buffs,direct.buffs);
  assert.deepEqual(out.finisher,{attempts:direct.finisherAttempts,kills:direct.finisherKills});
  assert.deepEqual(out.control,direct.control);
  assert.deepEqual(out.totals,{lineSpawned:direct.totalLineSpawned,lineKilled:direct.totalLineKilled,unitCount:direct.unitCount});
  assert.deepEqual(out.applied,{cut:direct.cut,coverage:direct.coverage,magicFactor:direct.magicFactor,resourceMode:direct.resourceMode});
}
function assertSingle(out,direct,refs){
  assert.equal(out.to15Seconds,direct.to15);
  assert.equal(out.killSeconds,direct.kill);
  assert.equal(out.finishFrom15Seconds,direct.finishFrom15);
  assert.equal(out.remainingAt3,direct.remainingAt3);
  assert.equal(out.reference.danRatio,refs.lucci.to15/direct.to15);
  assert.equal(out.reference.endRatio,refs.hancock.finishFrom15/direct.finishFrom15);
}
function assertReportShape(r){
  assert.equal(r.ok,true);
  assert.equal(r.data.version,data.version);
  assert.match(r.data.sha256,/^[0-9a-f]{64}$/);
  const ids=r.limitations.map(l=>l.id);
  for(const id of ['map-2305-approximation','heroes-not-registered','no-stun-or-movement'])assert.ok(ids.includes(id),id);
}

// 1. Basic line (engine defaults) — via file and via stdin, both identical to the engine.
{
  const ctx=damageContext({});
  const direct=simulateV2(data,[{code:'TR19',count:1},{code:'D3',count:1}],lineOpts(ctx,{}));
  const a=fromFile('line_basic.json');
  assert.equal(a.status,0,a.stderr);assertReportShape(a.json);assertLine(a.json.line,direct);
  const b=cli(['-','--compact'],readFileSync('examples/line_basic.json'));
  assert.equal(b.status,0,b.stderr);assertLine(b.json.line,direct);
  const c=cli(['--compact'],readFileSync('examples/line_basic.json'));
  assert.equal(c.status,0,c.stderr);assertLine(c.json.line,direct);
}
// 2. Defeat case: failed round, second and remaining reported.
{
  const direct=simulateV2(data,[{code:'TR11',count:1}],lineOpts(damageContext({}),{cut:80,coverage:.7}));
  assert.equal(direct.clear,false);
  const r=fromFile('line_low_cut_fail.json');
  assert.equal(r.status,0,r.stderr);assertLine(r.json.line,direct);
  const failed=r.json.line.rounds.find(x=>x.round===direct.failedRound);
  assert.equal(failed.remaining,direct.remaining);
  assert.ok(r.json.line.rounds.filter(x=>x.round>direct.failedRound).every(x=>!x.reached));
}
// 3. Context effects, deleter and finisher.
{
  const ctx=damageContext({selected:['TR10','TR10_CUT','H9_EXP','I2'],warcury:true});
  const direct=simulateV2(data,[{code:'E1',count:1},{code:'TR30',count:1},{code:'D3',count:1,ab:true},{code:'L12',count:1}],lineOpts(ctx,{
    cut:201,coverage:.85,red:true,fullResource:true,summons:true,
    finisher:{mode:'damage',interval:5,successChance:1,damageType:'magic',flat:30000000},
    deletion:{seed:202323,L12Cooldown:8.5,L12Proc:1}}));
  const r=fromFile('line_amp_finisher.json');
  assert.equal(r.status,0,r.stderr);assertLine(r.json.line,direct);
  assert.ok(direct.deleteCounts.L12>0&&direct.finisherAttempts>0);
  assert.equal(r.json.damageContext.level,ctx.level);
}
// 4. Single tester.
{
  const team=[{code:'L9',count:1},{code:'L36',count:1}],ctx=damageContext({});
  const direct=simulateSingle(team,{trials:3000,seed:202323,context:ctx});
  const refs=referenceSingle({trials:3000,seed:202323,context:ctx});
  const r=fromFile('single_lucci_hancock.json');
  assert.equal(r.status,0,r.stderr);assertReportShape(r.json);assertSingle(r.json.single,direct,refs);
}
// 5. Line + single sharing one context.
{
  const ctx=damageContext({selected:['L1','L1_ALL'],customMagicCut:3});
  const line=simulateV2(data,[{code:'I12',count:1},{code:'L23',count:1}],lineOpts(ctx,{}));
  const team=[{code:'L16',count:2},{code:'L36',count:1}];
  const single=simulateSingle(team,{trials:2000,seed:202323,context:ctx});
  const refs=referenceSingle({trials:2000,seed:202323,context:ctx});
  const r=fromFile('combined.json');
  assert.equal(r.status,0,r.stderr);assertLine(r.json.line,line);assertSingle(r.json.single,single,refs);
}
// 5b. Conditional units (Gaban, Franky, Sunny) with their placement options.
{
  const direct=simulateV2(data,[{code:'TR28',count:1},{code:'H15',count:2},{code:'I8',count:1}],
    lineOpts(damageContext({}),{frankyAura:true,sunnyStagger:true}));
  const r=fromFile('line_conditional.json');
  assert.equal(r.status,0,r.stderr);assertLine(r.json.line,direct);
  assert.ok(direct.control.sunnyCasts>0&&direct.lineDamage.single>0);
}
// 6. --timeline passes the engine timeline through unchanged.
{
  const direct=simulateV2(data,[{code:'TR19',count:1},{code:'D3',count:1}],lineOpts(damageContext({}),{}));
  const r=cli(['examples/line_basic.json','--compact','--timeline']);
  assert.deepEqual(r.json.line.timeline,direct.timeline);
  assert.equal(fromFile('line_basic.json').json.line.timeline,undefined);
}

// 7. Input errors: reason in JSON + stderr, exit code 2, no invented numbers.
const bad=(scenario,code,path)=>{
  const r=cli(['-','--compact'],typeof scenario==='string'?scenario:JSON.stringify(scenario));
  assert.equal(r.status,2,`${code}: exit ${r.status}`);
  assert.equal(r.json.ok,false);
  assert.ok(r.json.errors.some(e=>e.code===code&&(path===undefined||e.path===path)),JSON.stringify(r.json.errors));
  assert.ok(r.stderr.includes('오류'));
  return r.json;
};
{
  const r=fromFile('invalid_unsupported.json');
  assert.equal(r.status,2);
  assert.deepEqual(r.json.errors.map(e=>e.code),['UNSUPPORTED_UNIT','UNSUPPORTED_UNIT','OUT_OF_RANGE']);
  assert.match(r.json.errors[0].message,/미지원/);
}
bad('{not json','INVALID_JSON');
bad([],'NOT_AN_OBJECT');
bad({},'NOTHING_TO_RUN');
bad({line:{team:[]}},'EMPTY_TEAM');
bad({line:{team:[{code:'ZZ99'}]}},'UNSUPPORTED_UNIT','line.team[0].code');
bad({line:{team:[{code:'TR19',count:1.5}]}},'NOT_AN_INTEGER');
bad({line:{team:[{code:'TR19',count:0}]}},'OUT_OF_RANGE');
bad({line:{team:[{code:'TR19'}],options:{cut:301}}},'OUT_OF_RANGE','line.options.cut');
bad({line:{team:[{code:'TR19'}],options:{coverage:85}}},'OUT_OF_RANGE','line.options.coverage');
bad({line:{team:[{code:'TR19'}],options:{red:'yes'}}},'NOT_A_BOOLEAN');
bad({line:{team:[{code:'TR19'}],options:{stun:true}}},'UNKNOWN_KEY','line.options.stun');
bad({line:{team:[{code:'TR19'}],options:{finisher:{mode:'auto'}}}},'INVALID_VALUE');
bad({line:{team:[{code:'TR19'}],options:{resourceMode:'always'}}},'INVALID_VALUE','line.options.resourceMode');
bad({line:{team:[{code:'TR19'}],options:{tr19Plants:{pea:2,snow:1,muk:1}}}},'TOO_MANY_PLANTS','line.options.tr19Plants');
bad({line:{team:[{code:'TR19'}],options:{buffTargets:{I4:'TR19'}}}},'NOT_AN_ARRAY');
bad({line:{team:[{code:'TR19'}]},context:{selected:['NOPE']}},'UNKNOWN_EFFECT');
bad({single:{team:[{code:'TR19'}]}},'UNSUPPORTED_UNIT','single.team[0].code');
bad({single:{team:[{code:'L9',count:7},{code:'L36',count:6}]}},'TOO_MANY_UNITS');
bad({single:{team:[{code:'L9'}],trials:50}},'OUT_OF_RANGE','single.trials');
{
  const r=cli(['examples/does_not_exist.json']);
  assert.equal(r.status,2);assert.equal(r.json.errors[0].code,'READ_FAILED');
  const f=cli(['--bogus']);assert.equal(f.status,2);
}
// 8. Unit listing matches data.json.
{
  const r=cli(['--list-units','--compact']);
  assert.equal(r.status,0);
  assert.deepEqual(r.json.line.heroes.map(h=>h.code),data.heroes.map(h=>h.code));
}
console.log('CLI: 6 example scenarios match direct engine calls, stdin, timeline, input errors, unit list: passed');
