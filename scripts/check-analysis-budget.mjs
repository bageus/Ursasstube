import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/check-static-analysis.mjs', 'utf8');
const budgets = [
  ['BASELINE_' + 'UNUSED_EXPORTS', 1],
  ['BASELINE_' + 'IMPLICIT_GLOBAL_WRITES', 1],
];

let failed = false;

for (const [name, maxEntries] of budgets) {
  const pattern = new RegExp('const ' + name + ' = new Set\\(\\[([\\s\\S]*?)\\]\\);');
  const match = source.match(pattern);
  const entries = match ? [...match[1].matchAll(/'[^']+'/g)].length : 0;
  console.log(`${name}: ${entries}/${maxEntries}`);
  if (entries > maxEntries) failed = true;
}

if (failed) process.exit(1);
