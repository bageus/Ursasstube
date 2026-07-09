import { readFileSync, writeFileSync } from 'node:fs';

const targetPath = 'index.html';
const dryRun = process.argv.includes('--dry-run');
const source = readFileSync(targetPath, 'utf8');
const staticScriptPattern = /\n\s*<!-- Intentional external runtime dependency for Telegram Mini App APIs -->\n\s*<script\s+src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"\s+defer><\/script>\n/g;
const matches = source.match(staticScriptPattern) || [];

if (matches.length !== 1) {
  console.error(`Expected exactly one static runtime SDK script block, found ${matches.length}.`);
  process.exit(1);
}

const nextSource = source.replace(staticScriptPattern, '\n');

if (nextSource === source) {
  console.error('index.html was not changed.');
  process.exit(1);
}

if (dryRun) {
  console.log('Static runtime SDK script block can be removed from index.html.');
  process.exit(0);
}

writeFileSync(targetPath, nextSource);
console.log('Removed static runtime SDK script block from index.html.');
