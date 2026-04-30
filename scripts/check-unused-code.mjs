import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASELINE_UNUSED_EXPORTS = new Set([
  'js/logger.js:logger',
  'js/player-menu/controller.js:initPlayerMenu',
  'js/player-menu/controller.js:openPlayerMenu',
  'js/player-menu/controller.js:refreshPlayerMenu',
  'js/player-menu/controller.js:isPlayerMenuOpen',
  'js/game-runtime.js:initGameBootstrap',
]);

function getFiles() {
  const out = execSync("rg --files js scripts -g '*.js' -g '*.mjs'", { cwd: rootDir, encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(rootDir, path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')];
  for (const c of candidates) {
    const rel = path.relative(rootDir, c).replaceAll(path.sep, '/');
    if (moduleMap.has(rel)) return rel;
  }
  return null;
}

const moduleMap = new Map();
for (const file of getFiles()) {
  const content = readFileSync(path.join(rootDir, file), 'utf8');
  moduleMap.set(file, { content, exports: new Set(), imports: [] });
}

const exportDeclRE = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
const exportListRE = /export\s*\{([^}]+)\}/g;
const importNamedRE = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
const importDefaultRE = /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g;

for (const [file, info] of moduleMap.entries()) {
  let m;
  while ((m = exportDeclRE.exec(info.content)) !== null) info.exports.add(m[1]);
  while ((m = exportListRE.exec(info.content)) !== null) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const n of names) {
      const left = n.split(' as ')[0].trim();
      if (left && left !== 'default') info.exports.add(left);
    }
  }

  while ((m = importNamedRE.exec(info.content)) !== null) {
    info.imports.push({ source: m[2], names: m[1].split(',').map((s) => s.trim().split(' as ')[0].trim()) });
  }
  while ((m = importDefaultRE.exec(info.content)) !== null) {
    info.imports.push({ source: m[2], names: ['default'] });
  }
}

const used = new Set();
for (const [fromFile, info] of moduleMap.entries()) {
  for (const imp of info.imports) {
    const target = resolveImport(fromFile, imp.source);
    if (!target) continue;
    for (const name of imp.names) used.add(`${target}:${name}`);
  }
}

const unused = [];
for (const [file, info] of moduleMap.entries()) {
  for (const name of info.exports) {
    const key = `${file}:${name}`;
    if (!used.has(key) && !BASELINE_UNUSED_EXPORTS.has(key)) unused.push(key);
  }
}

if (unused.length > 0) {
  console.error('❌ New unused exports detected:');
  for (const key of unused) console.error(` - ${key}`);
  process.exit(1);
}

console.log('✅ Unused-code check passed (no new unused exports outside baseline).');
if (BASELINE_UNUSED_EXPORTS.size > 0) {
  console.log(`ℹ️ Baseline tolerated: ${[...BASELINE_UNUSED_EXPORTS].join(', ')}`);
}
