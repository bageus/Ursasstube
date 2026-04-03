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

function extractModuleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g, // static import
    /\bexport\s+[^'"()]*?\s+from\s+['"]([^'"]+)['"]/g, // re-export from
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g // dynamic import with literal
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function resolveRelativeImport(file, spec) {
  const resolved = path.resolve(path.dirname(file), spec);
  const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`, path.join(resolved, 'index.js')];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

const files = collectJsFiles(PHASER_JS_ROOT);
const missing = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const specifiers = extractModuleSpecifiers(content);

  for (const spec of specifiers) {
    if (!spec.startsWith('.')) continue;
    if (resolveRelativeImport(file, spec)) continue;

    missing.push({
      file: path.relative(ROOT, file),
      spec
    });
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
