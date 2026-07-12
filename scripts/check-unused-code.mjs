import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseAst } from 'rollup/parseAst';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASELINE_UNUSED_EXPORTS = new Set([
  'js/logger.js:logger',
]);

function getFiles(rootDir = ROOT_DIR) {
  try {
    const out = execSync("rg --files js scripts -g '*.js' -g '*.mjs'", { cwd: rootDir, encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    const roots = ['js', 'scripts'];
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(path.join(rootDir, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (entry.isFile() && (rel.endsWith('.js') || rel.endsWith('.mjs'))) {
          files.push(rel.replaceAll(path.sep, '/'));
        }
      }
    };
    for (const dir of roots) walk(dir);
    return files.sort();
  }
}

function identifierName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.value);
  return null;
}

function collectPatternNames(pattern, names) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    names.add(pattern.name);
    return;
  }
  if (pattern.type === 'RestElement') {
    collectPatternNames(pattern.argument, names);
    return;
  }
  if (pattern.type === 'AssignmentPattern') {
    collectPatternNames(pattern.left, names);
    return;
  }
  if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements || []) collectPatternNames(element, names);
    return;
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties || []) {
      collectPatternNames(property.type === 'RestElement' ? property.argument : property.value, names);
    }
  }
}

function collectDeclarationExports(declaration, exports) {
  if (!declaration) return;
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
    if (declaration.id?.name) exports.add(declaration.id.name);
    return;
  }
  if (declaration.type === 'VariableDeclaration') {
    for (const item of declaration.declarations || []) collectPatternNames(item.id, exports);
  }
}

function collectModuleInfo(content) {
  const ast = parseAst(String(content || ''));
  const info = { exports: new Set(), imports: [] };

  for (const statement of ast.body || []) {
    if (statement.type === 'ImportDeclaration') {
      const names = [];
      for (const specifier of statement.specifiers || []) {
        if (specifier.type === 'ImportDefaultSpecifier') names.push('default');
        else if (specifier.type === 'ImportNamespaceSpecifier') names.push('*');
        else if (specifier.type === 'ImportSpecifier') names.push(identifierName(specifier.imported));
      }
      if (names.length > 0) info.imports.push({ source: statement.source.value, names: names.filter(Boolean) });
      continue;
    }

    if (statement.type === 'ExportDefaultDeclaration') {
      info.exports.add('default');
      continue;
    }

    if (statement.type === 'ExportAllDeclaration') {
      const exported = identifierName(statement.exported);
      if (exported) info.exports.add(exported);
      info.imports.push({ source: statement.source.value, names: ['*'] });
      continue;
    }

    if (statement.type !== 'ExportNamedDeclaration') continue;

    collectDeclarationExports(statement.declaration, info.exports);
    const reexportedNames = [];
    for (const specifier of statement.specifiers || []) {
      const exported = identifierName(specifier.exported);
      const local = identifierName(specifier.local);
      if (exported) info.exports.add(exported);
      if (statement.source && local) reexportedNames.push(local);
    }
    if (statement.source && reexportedNames.length > 0) {
      info.imports.push({ source: statement.source.value, names: reexportedNames });
    }
  }

  return info;
}

function resolveImport(fromFile, spec, moduleMap, rootDir = ROOT_DIR) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(rootDir, path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')];
  for (const candidate of candidates) {
    const rel = path.relative(rootDir, candidate).replaceAll(path.sep, '/');
    if (moduleMap.has(rel)) return rel;
  }
  return null;
}

function analyzeUnusedExports({ rootDir = ROOT_DIR, files = getFiles(rootDir), baseline = BASELINE_UNUSED_EXPORTS } = {}) {
  const moduleMap = new Map();
  for (const file of files) {
    moduleMap.set(file, collectModuleInfo(readFileSync(path.join(rootDir, file), 'utf8')));
  }

  const used = new Set();
  for (const [fromFile, info] of moduleMap.entries()) {
    for (const imported of info.imports) {
      const target = resolveImport(fromFile, imported.source, moduleMap, rootDir);
      if (!target) continue;
      if (imported.names.includes('*')) {
        for (const name of moduleMap.get(target).exports) used.add(`${target}:${name}`);
        continue;
      }
      for (const name of imported.names) used.add(`${target}:${name}`);
    }
  }

  const unused = [];
  for (const [file, info] of moduleMap.entries()) {
    for (const name of info.exports) {
      const key = `${file}:${name}`;
      if (!used.has(key) && !baseline.has(key)) unused.push(key);
    }
  }
  return unused.sort();
}

function runUnusedCodeCheck() {
  const unused = analyzeUnusedExports();
  if (unused.length > 0) {
    console.error('❌ New unused exports detected:');
    for (const key of unused) console.error(` - ${key}`);
    process.exitCode = 1;
    return unused;
  }

  console.log('✅ Unused-code check passed (no new unused exports outside baseline).');
  if (BASELINE_UNUSED_EXPORTS.size > 0) {
    console.log(`ℹ️ Baseline tolerated: ${[...BASELINE_UNUSED_EXPORTS].join(', ')}`);
  }
  return unused;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUnusedCodeCheck();
}

export {
  analyzeUnusedExports,
  collectModuleInfo
};
