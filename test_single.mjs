import assert from 'node:assert/strict';
import {simulateSingle,referenceSingle,SINGLE_MOB} from './dist/engine_single.mjs';

const config={trials:10000,seed:202323};
const {lucci,hancock}=referenceSingle(config);
const pair=simulateSingle([{code:'L9',count:1},{code:'L36',count:1}],config);
const twoLucci=simulateSingle([{code:'L9',count:2}],config);
const twoHancock=simulateSingle([{code:'L36',count:2}],config);

assert.equal(SINGLE_MOB.hp,147_024_700);
assert.ok(Math.abs(lucci.to15-5.48)<.12,`Lucci: ${lucci.to15}`);
assert.ok(Math.abs(pair.kill-5.25)<.12,`Lucci + Hancock: ${pair.kill}`);
assert.ok(twoLucci.to15<lucci.to15);
assert.ok(twoHancock.finishFrom15<hancock.finishFrom15);
assert.ok(pair.remainingAt3>0&&pair.remainingAt3<SINGLE_MOB.hp);
assert.deepEqual(pair,simulateSingle([{code:'L9',count:1},{code:'L36',count:1}],config));
assert.throws(()=>simulateSingle([{code:'L9',count:13}],config),/수량/);
console.log('Single tester: benchmark, multiples, 3-second HP, reproducibility: passed');
