import { readFileSync } from 'node:fs';

const targetPath = process.argv[2] || 'index.html';
const source = readFileSync(targetPath, 'utf8');
const host = ['tele', 'gram.org'].join('');
const file = ['tele', 'gram-web-app.js'].join('');
const marker = `src="https://${host}/js/${file}"`;

if (source.includes(marker)) {
  console.error(`${targetPath} still contains the static runtime loader marker.`);
  process.exit(1);
}

console.log(`${targetPath} does not contain the static runtime loader marker.`);
