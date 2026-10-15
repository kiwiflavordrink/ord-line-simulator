import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONDITIONAL_UNITS,simulateV2} from './dist/engine_v3.mjs';

const data=JSON.parse(readFileSync(new URL('./dist/data.json',import.meta.url)));
assert.equal(CONDITIONAL_UNITS.I8.attack,407502);
assert.equal(CONDITIONAL_UNITS.H15.aps,8);

const gaban=simulateV2(data,[{code:'I8'}],{red:false});
assert.ok(gaban.lineDamage.single>0);
assert.equal(gaban.lineDamage.area,0);
assert.equal(gaban.control.sunnyCasts,0);

const team=[{code:'TR28',damage:false},{code:'H15',count:2}];
const unlinked=simulateV2(data,team,{red:false,frankyAura:false});
const linked=simulateV2(data,team,{red:false,frankyAura:true});
const staggered=simulateV2(data,team,{red:false,frankyAura:true,sunnyStagger:true});
assert.equal(unlinked.control.sunnyCasts,0);
assert.ok(linked.control.sunnyCasts>0);
assert.ok(staggered.control.stunnedLineMobSeconds>linked.control.stunnedLineMobSeconds);
assert.ok(linked.control.frankyAuraSeconds>0);
assert.equal(linked.sourceDamage.TR28??0,0);
assert.deepEqual(simulateV2(data,team,{red:false,frankyAura:false,deletion:{seed:42}}).control,
  simulateV2(data,team,{red:false,frankyAura:false,deletion:{seed:42}}).control);
console.log('Conditional Gaban single and Franky/Sunny resource-stun coupling: passed');
