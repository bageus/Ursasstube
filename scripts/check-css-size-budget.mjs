import { readFileSync } from 'node:fs';

const file = 'css/style.css';
const maxLines = 1600;
const lines = readFileSync(file, 'utf8').split('\n').length;

console.log(`${file}: ${lines}/${maxLines} lines`);

if (lines > maxLines) {
  process.exit(1);
}
