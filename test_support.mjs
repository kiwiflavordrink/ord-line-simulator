import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulate} from './dist/engine.mjs';

const data=JSON.parse(readFileSync(new URL('./dist/data_legacy.json',import.meta.url)));
const hero='TR19',base={cut:201,coverage:1};
const none=simulate(data,hero,base);
const abOnly=simulate(data,hero,{...base,supportCode:'D3',supportDamage:false});
const damageOnly=simulate(data,hero,{...base,supportCode:'D3',supportAb:false});
const both=simulate(data,hero,{...base,supportCode:'D3'});
const combo=simulate(data,hero,{...base,supportCode:'D3',extraCode:'L23'});
const duplicate=simulate(data,hero,{...base,supportCode:'D3',extraCode:'D3'});

assert.equal(none.averageAb,0);
assert.ok(abOnly.averageAb>0);
assert.ok(abOnly.remaining<none.remaining);
assert.equal(damageOnly.averageAb,0);
assert.ok(both.remaining<abOnly.remaining);
assert.ok(combo.averageAb>both.averageAb);
assert.equal(duplicate.remaining,both.remaining);
assert.equal(duplicate.averageAb,both.averageAb);
assert.ok(both.checkpoints.every(x=>x.averageAb>=0&&x.averageAb<=75));
console.log('Support damage/AB toggles, combination, deduplication, and stack cap: passed');
