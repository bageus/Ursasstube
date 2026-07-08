import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const roots = ['index.html', 'js'];
const patterns = [
  'isTelegramRuntime',
  '__URSASS_IS_TELEGRAM_RUNTIME__',
  'Telegram?.WebApp',
  'window.Telegram',
  'tgWebAppData',
  'tgWebAppStartParam',
  'telegram-runtime',
  'telegram-mini-app',
];

function walk(entryPath, bucket) {
  const absolutePath = path.join(rootDir, entryPath);
  const stat = statSync(absolutePath);
  if (stat.isFile()) {
    bucket.push(absolutePath);
    return;
  }

  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      walk(childPath, bucket);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
      bucket.push(path.join(rootDir, childPath));
    }
  }
}

const files = [];
for (const root of roots) walk(root, files);

const matches = [];
for (const absolutePath of files) {
  const relativePath = path.relative(rootDir, absolutePath).replaceAll(path.sep, '/');
  const lines = readFileSync(absolutePath, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const hits = patterns.filter((pattern) => line.includes(pattern));
    if (hits.length === 0) return;
    matches.push({
      file: relativePath,
      line: index + 1,
      hits,
      text: line.trim(),
    });
  });
}

console.log('Runtime detection report');
if (matches.length === 0) {
  console.log('- no runtime detection markers found');
} else {
  for (const match of matches) {
    console.log(`- ${match.file}:${match.line} [${match.hits.join(', ')}] ${match.text}`);
  }
}

const filesWithMatches = new Set(matches.map((match) => match.file));
console.log(`\nFiles with runtime detection markers: ${filesWithMatches.size}`);
