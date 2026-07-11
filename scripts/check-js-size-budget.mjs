import { readFileSync } from 'node:fs';

const budgets = [
  ['js/api.js', 700],
  ['js/game/bootstrap.js', 700],
  ['js/physics.js', 638],
];

let failed = false;

for (const [file, maxLines] of budgets) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  console.log(`${file}: ${lines}/${maxLines} lines`);
  if (lines > maxLines) failed = true;
}

if (failed) process.exit(1);
