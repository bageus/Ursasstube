import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const roots = ['js'];
const runtimeDetectionOwner = 'js/runtime-detection.js';
const implementationPatterns = [
  /(?:export\s+)?function\s+isTelegramRuntime\s*\(/,
  /(?:const|let|var)\s+isTelegramRuntime\s*=/,
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
    if (entry.isFile() && entry.name.endsWith('.js')) {
      bucket.push(path.join(rootDir, childPath));
    }
  }
}

function hasRuntimeDetectorImplementation(source) {
  return implementationPatterns.some((pattern) => pattern.test(source));
}

const files = [];
for (const root of roots) walk(root, files);

const implementationFiles = files
  .filter((absolutePath) => hasRuntimeDetectorImplementation(readFileSync(absolutePath, 'utf8')))
  .map((absolutePath) => path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'))
  .sort();

if (implementationFiles.length !== 1 || implementationFiles[0] !== runtimeDetectionOwner) {
  console.error('Telegram runtime detection must have exactly one implementation owner.');
  console.error(`Expected: ${runtimeDetectionOwner}`);
  console.error(`Found: ${implementationFiles.length > 0 ? implementationFiles.join(', ') : 'none'}`);
  process.exit(1);
}

console.log(`✅ Runtime detection implementations: 1/1 (${runtimeDetectionOwner})`);
