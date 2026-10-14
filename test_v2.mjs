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
const legacyLink=simulateV2(data,team,{customMagic:magic,finisher:{mode:'oneShot',interval:5}});
const manual=simulateV2(data,team,{customMagic:magic,finisher:{mode:'damage',interval:5,flat:30_000_000}});
const half=simulateV2(data,team,{customMagic:magic,finisher:{mode:'damage',interval:5,flat:30_000_000,successChance:.5}});
const zeroHit=simulateV2(data,team,{customMagic:magic,finisher:{mode:'damage',interval:5,flat:0}});
assert.equal(noFinish.finisherAttempts,0);
assert.equal(legacyLink.finisherAttempts,0);
assert.equal(manual.finisherAttempts,38);
assert.ok(manual.finisherKills>0&&manual.finisherKills<=manual.finisherAttempts);
assert.ok((manual.sourceDamage['단일 마무리']??0)>0);
assert.ok(half.finisherKills<=manual.finisherKills);
assert.equal(zeroHit.finisherKills,0);
const noMagic=simulateV2(data,team,{customMagic:{...magic,chance:0},finisher:{mode:'off'}});
assert.equal(noMagic.sourceDamage.MAGIC_CUSTOM??0,0);
const ab=simulateV2(data,[{code:'TR19'},{code:'D3',damage:false,ab:true}],{finisher:{mode:'off'}});
assert.ok(ab.averageAb>0&&ab.averageAb<=75);
for(const code of ['L12','D4','L19']){
  const run=simulateV2(data,[{code}],{red:false});
  assert.ok(run.deleteCounts[code]>0,code);
  assert.equal(run.lineDamage.area,0,code);
  assert.equal(Object.keys(run.sourceDamage).length,0,code);
  assert.equal(run.totalLineKilled,run.deleteCounts[code],code);
}
assert.equal(simulateV2(data,[{code:'D4'}],{red:false,deletion:{D4Proc:0}}).deleteCounts.D4,0);
assert.ok(simulateV2(data,[{code:'L12'}],{red:false,deletion:{L12Cooldown:18}}).deleteCounts.L12<
  simulateV2(data,[{code:'L12'}],{red:false}).deleteCounts.L12);
console.log('V2: 31 legacy heroes, magic, finisher pacing, success rate, damage threshold, AB: passed');
