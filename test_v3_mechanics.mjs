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
console.log('V3 mechanics: resource clock: passed');
