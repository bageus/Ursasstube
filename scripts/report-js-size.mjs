import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const roots = ['js', 'scripts'];

function walk(dirPath, bucket) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, bucket);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) bucket.push(fullPath);
  }
}

const files = [];
for (const root of roots) {
  const absoluteRoot = path.join(rootDir, root);
  try {
    if (statSync(absoluteRoot).isDirectory()) walk(absoluteRoot, files);
  } catch (_error) {}
}

const rows = files.map((absolutePath) => {
  const source = readFileSync(absolutePath, 'utf8');
  const lines = source.split('\n').length;
  const loc = source.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('//');
  }).length;
  const bytes = Buffer.byteLength(source, 'utf8');
  return {
    file: path.relative(rootDir, absolutePath).replaceAll(path.sep, '/'),
    lines,
    loc,
    kb: Number((bytes / 1024).toFixed(1)),
  };
}).sort((a, b) => b.lines - a.lines || b.kb - a.kb);

console.log('JS size report');
for (const row of rows) {
  console.log(`- ${row.file}: ${row.lines} lines, ${row.loc} loc, ${row.kb} KB`);
}
