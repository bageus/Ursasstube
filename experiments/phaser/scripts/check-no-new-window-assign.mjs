import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASELINE = new Set([
  'js/assets.js:101:Object.assign(window, { AssetManager, assetManager });',
  'js/particles.js:88:Object.assign(window, { particlePool, spawnParticles, updateParticles, drawParticles });',
  'js/request.js:110:Object.assign(window, { RequestError, request });'
]);

const regex = /Object\.assign\(\s*window\b/g;
const jsDir = path.join(rootDir, 'js');
const files = readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .sort();

const actual = [];

for (const fileName of files) {
  const filePath = path.join(jsDir, fileName);
  const src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    if (regex.test(lines[i])) {
      actual.push(`js/${fileName}:${i + 1}:${lines[i].trim()}`);
    }
    regex.lastIndex = 0;
  }
}

const newEntries = actual.filter((entry) => !BASELINE.has(entry));

if (newEntries.length > 0) {
  console.error('❌ Found new Object.assign(window, ...) usage in js/:');
  for (const entry of newEntries) {
    console.error(`   ${entry}`);
  }
  console.error('Please use ES module exports/imports instead of adding globals on window.');
  process.exit(1);
}

console.log('✅ No new Object.assign(window, ...) usages in js/.');
