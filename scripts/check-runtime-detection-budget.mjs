import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const roots = ['index.html', 'js'];
const runtimeDetectionOwner = 'js/runtime-detection.js';
const directRuntimePatterns = [
  /(?:window|globalThis)\.Telegram\b/,
  /\bTelegram\?\.WebApp\b/,
  /\btgWebAppData\b/,
  /\btgWebAppStartParam\b/,
  /__URSASS_IS_TELEGRAM_RUNTIME__/,
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

function hasDirectRuntimeProbe(source) {
  return directRuntimePatterns.some((pattern) => pattern.test(source));
}

const files = [];
for (const root of roots) walk(root, files);

const directProbeFiles = files
  .filter((absolutePath) => hasDirectRuntimeProbe(readFileSync(absolutePath, 'utf8')))
  .map((absolutePath) => path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'))
  .sort();
const violations = directProbeFiles.filter((file) => file !== runtimeDetectionOwner);

if (!directProbeFiles.includes(runtimeDetectionOwner)) {
  console.error(`Runtime detection owner is missing direct runtime probes: ${runtimeDetectionOwner}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error('Direct Telegram runtime probes must remain centralized:');
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`✅ Runtime detection owner: ${runtimeDetectionOwner}`);
console.log('✅ Direct Telegram runtime probes outside owner: 0');
