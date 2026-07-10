import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const roots = ['index.html', 'js'];
const maxFilesWithRuntimeMarkers = 5;
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
    if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html'))) {
      bucket.push(path.join(rootDir, childPath));
    }
  }
}

const files = [];
for (const root of roots) walk(root, files);

const filesWithMarkers = files.filter((absolutePath) => {
  const source = readFileSync(absolutePath, 'utf8');
  return patterns.some((pattern) => source.includes(pattern));
}).map((absolutePath) => path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'));

if (filesWithMarkers.length > maxFilesWithRuntimeMarkers) {
  console.error(`Runtime detection marker budget exceeded: ${filesWithMarkers.length}/${maxFilesWithRuntimeMarkers}`);
  for (const file of filesWithMarkers) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`✅ Runtime detection marker budget: ${filesWithMarkers.length}/${maxFilesWithRuntimeMarkers}`);
