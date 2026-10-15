// Markdown table of rows that differ between two hero_results.mjs snapshots.
// Usage: node scripts/diff_results.mjs docs/results/A.json docs/results/B.json
import {readFileSync} from 'node:fs';

const [a,b]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8')).rows);
const text=r=>r?(r.clear?`클리어 (65라 잔존 ${r.remaining})`:`${r.failedRound}라 ${r.failedSecond}초 패배`)+` · ${r.rounds.join('/')}`:'—';
const changed=Object.keys({...a,...b}).filter(k=>JSON.stringify(a[k]?.rounds)!==JSON.stringify(b[k]?.rounds)||a[k]?.clear!==b[k]?.clear);
console.log('| 조합 | 수정 전 | 수정 후 |\n|---|---|---|');
for(const k of changed)console.log(`| ${k} | ${text(a[k])} | ${text(b[k])} |`);
console.log(`\n변경 ${changed.length}건 / 전체 ${Object.keys(b).length}건`);
