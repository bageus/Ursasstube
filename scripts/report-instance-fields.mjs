import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const roots = ['js'];
const ignoredFields = new Set([
  'constructor',
]);

function walk(dirPath, bucket) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, bucket);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) bucket.push(fullPath);
  }
}

const files = [];
for (const root of roots) {
  const absoluteRoot = path.join(rootDir, root);
  try {
    if (statSync(absoluteRoot).isDirectory()) walk(absoluteRoot, files);
  } catch (_error) {}
}

const assignments = new Map();
const reads = new Map();

function addHit(bucket, key, hit) {
  if (!bucket.has(key)) bucket.set(key, []);
  bucket.get(key).push(hit);
}

for (const absolutePath of files) {
  const file = path.relative(rootDir, absolutePath).replaceAll(path.sep, '/');
  const lines = readFileSync(absolutePath, 'utf8').split('\n');

  lines.forEach((line, index) => {
    const assignmentMatches = [...line.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*=/g)];
    const accessMatches = [...line.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\b/g)];

    for (const match of assignmentMatches) {
      const field = match[1];
      if (ignoredFields.has(field)) continue;
      addHit(assignments, `${file}:${field}`, { file, field, line: index + 1, text: line.trim() });
    }

    for (const match of accessMatches) {
      const field = match[1];
      if (ignoredFields.has(field)) continue;
      const isAssignment = new RegExp(`\\bthis\\.${field}\\s*=`).test(line);
      if (!isAssignment) {
        addHit(reads, `${file}:${field}`, { file, field, line: index + 1, text: line.trim() });
      }
    }
  });
}

const writeOnly = [...assignments.entries()]
  .filter(([key]) => !reads.has(key))
  .flatMap(([, hits]) => hits)
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

console.log('Instance field report');
if (writeOnly.length === 0) {
  console.log('- no write-only instance fields found');
} else {
  console.log('Write-only instance fields:');
  for (const hit of writeOnly) {
    console.log(`- ${hit.file}:${hit.line} this.${hit.field} -> ${hit.text}`);
  }
}
