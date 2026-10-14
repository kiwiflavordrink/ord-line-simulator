import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulate} from './dist/engine.mjs';
import {simulateV2} from './dist/engine_v2.mjs';

const data=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));
for(const hero of data.heroes){
  const old=simulate(data,hero.code,{cut:201,coverage:1});
  const v2=simulateV2(data,[{code:hero.code}],{cut:201,coverage:1,finisher:{mode:'off'}});
  assert.equal(v2.remaining,old.remaining,hero.code);
  assert.equal(v2.failedRound,old.failedRound,hero.code);
}
const team=[{code:'TR19'},{code:'MAGIC_CUSTOM'}];
const magic={aps:5,chance:.15,flat:1_000_000};
const noFinish=simulateV2(data,team,{customMagic:magic,finisher:{mode:'off'}});
const novice=simulateV2(data,team,{customMagic:magic,finisher:{mode:'oneShot',interval:5}});
const half=simulateV2(data,team,{customMagic:magic,finisher:{mode:'oneShot',interval:5,successChance:.5}});
const zeroHit=simulateV2(data,team,{customMagic:magic,finisher:{mode:'damage',interval:5,flat:0}});
assert.equal(noFinish.finisherAttempts,0);
assert.equal(novice.finisherAttempts,38);
assert.equal(novice.finisherKills,38);
assert.ok(novice.remaining<noFinish.remaining);
assert.equal(half.finisherKills,19);
assert.equal(zeroHit.finisherKills,0);
const noMagic=simulateV2(data,team,{customMagic:{...magic,chance:0},finisher:{mode:'off'}});
assert.equal(noMagic.sourceDamage.MAGIC_CUSTOM??0,0);
const ab=simulateV2(data,[{code:'TR19'},{code:'D3',damage:false,ab:true}],{finisher:{mode:'off'}});
assert.ok(ab.averageAb>0&&ab.averageAb<=75);
console.log('V2: 31 legacy heroes, magic, finisher pacing, success rate, damage threshold, AB: passed');
