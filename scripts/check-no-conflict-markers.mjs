import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);
const MARKERS = ['<<<<<<<', '=======', '>>>>>>>'];
const findings = [];

function walk(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    let content;
    try {
      content = readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (MARKERS.some((marker) => line.startsWith(marker))) {
        findings.push(`${relativePath}:${i + 1}:${line.trim()}`);
      }
    }
  }
}

walk(rootDir);

if (findings.length > 0) {
  console.error('❌ Found unresolved merge conflict markers:');
  for (const finding of findings) {
    console.error(`   ${finding}`);
  }
  process.exit(1);
}

console.log('✅ No unresolved merge conflict markers found.');
