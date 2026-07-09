import { readFileSync, writeFileSync } from 'node:fs';

const targetPath = 'index.html';
const source = readFileSync(targetPath, 'utf8');
const staticScriptPattern = /\n\s*<!-- Intentional external runtime dependency for Telegram Mini App APIs -->\n\s*<script\s+src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"\s+defer><\/script>\n/;

if (!staticScriptPattern.test(source)) {
  console.error('Static runtime SDK script block was not found or already removed.');
  process.exit(1);
}

const nextSource = source.replace(staticScriptPattern, '\n');

if (nextSource === source) {
  console.error('index.html was not changed.');
  process.exit(1);
}

writeFileSync(targetPath, nextSource);
console.log('Removed static runtime SDK script block from index.html.');
