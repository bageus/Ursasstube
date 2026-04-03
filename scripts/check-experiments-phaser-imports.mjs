#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PHASER_JS_ROOT = path.join(ROOT, 'experiments', 'phaser', 'js');

if (!fs.existsSync(PHASER_JS_ROOT)) {
  console.log('ℹ️ No experiments/phaser/js directory found; skipping Phaser import integrity check.');
  process.exit(0);
}

function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, out);
      continue;
    }
    if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = collectJsFiles(PHASER_JS_ROOT);
const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
const missing = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(importRe)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;

    const resolved = path.resolve(path.dirname(file), spec);
    const candidates = [resolved, `${resolved}.js`, path.join(resolved, 'index.js')];
    const exists = candidates.some((candidate) => fs.existsSync(candidate));

    if (!exists) {
      missing.push({
        file: path.relative(ROOT, file),
        spec
      });
    }
  }
}

if (missing.length) {
  console.error('❌ Broken relative imports found in experiments/phaser/js:');
  for (const item of missing) {
    console.error(` - ${item.file}: ${item.spec}`);
  }
  process.exit(1);
}

console.log(`✅ Phaser import integrity check passed (${files.length} files scanned).`);
