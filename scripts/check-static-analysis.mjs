import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { parseAst } from 'rollup/parseAst';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const MAX_LINES = 600;
const BASELINE_OVERSIZED = new Set([]);
const BASELINE_UNUSED_EXPORTS = new Set([
  'js/logger.js:logger',
]);
const EXTRA_GLOBALS = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history',
  'fetch', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams', 'AbortController',
  'Image', 'Audio', 'HTMLElement', 'HTMLCanvasElement', 'CustomEvent', 'Event', 'MouseEvent',
  'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'crypto', 'TextEncoder', 'TextDecoder', 'FormData',
  'btoa', 'atob', 'alert', 'confirm', 'prompt'
]);
const KNOWN_GLOBALS = new Set([...Object.getOwnPropertyNames(globalThis), ...EXTRA_GLOBALS]);
const ENTRYPOINTS = new Set(['js/main.js', 'js/game-runtime.js']);

const BASELINE_BURN_DOWN_MILESTONES = Object.freeze([
  {
    dueDate: '2026-04-05',
    maxOversizedModules: 3,
    maxUnusedExports: 1,
    maxImplicitGlobalWrites: 3,
  },
  {
    dueDate: '2026-06-01',
    maxOversizedModules: 3,
    maxUnusedExports: 1,
    maxImplicitGlobalWrites: 2,
  },
  {
    dueDate: '2026-09-01',
    maxOversizedModules: 4,
    maxUnusedExports: 0,
    maxImplicitGlobalWrites: 1,
  },
]);

function getActiveBurnDownMilestone(now = new Date()) {
  const isoToday = now.toISOString().slice(0, 10);
  const eligible = BASELINE_BURN_DOWN_MILESTONES.filter((milestone) => milestone.dueDate <= isoToday);
  if (eligible.length === 0) return null;
  return eligible[eligible.length - 1];
}

function evaluateBurnDown(errors, now = new Date()) {
  const milestone = getActiveBurnDownMilestone(now);
  if (!milestone) return null;

  const counts = {
    oversizedModules: BASELINE_OVERSIZED.size,
    unusedExports: BASELINE_UNUSED_EXPORTS.size,
    implicitGlobalWrites: BASELINE_IMPLICIT_GLOBAL_WRITES.size,
  };

  if (counts.oversizedModules > milestone.maxOversizedModules) {
    errors.push(`burn-down: oversized baseline ${counts.oversizedModules} exceeds target ${milestone.maxOversizedModules} (due ${milestone.dueDate})`);
  }
  if (counts.unusedExports > milestone.maxUnusedExports) {
    errors.push(`burn-down: unused export baseline ${counts.unusedExports} exceeds target ${milestone.maxUnusedExports} (due ${milestone.dueDate})`);
  }
  if (counts.implicitGlobalWrites > milestone.maxImplicitGlobalWrites) {
    errors.push(`burn-down: implicit global write baseline ${counts.implicitGlobalWrites} exceeds target ${milestone.maxImplicitGlobalWrites} (due ${milestone.dueDate})`);
  }

  return { milestone, counts };
}

const BASELINE_UNUSED_IMPORTS = new Set([]);
const BASELINE_IMPLICIT_GLOBAL_WRITES = new Set([
  'js/store.js:playerUpgrades',
  'js/store.js:playerEffects',
  'js/store.js:playerBalance'
]);

function rel(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function getModuleFiles() {
  try {
    return execSync("rg --files js scripts -g '*.js' -g '*.mjs'", { cwd: rootDir, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch (_error) {
    // CI fallback when ripgrep is unavailable.
    const roots = [path.join(rootDir, 'js'), path.join(rootDir, 'scripts')];
    const files = [];

    for (const base of roots) {
      walkDir(base, files);
    }

    return files.map((absolutePath) => rel(absolutePath)).sort();
  }
}

function walkDir(dirPath, bucket) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, bucket);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      bucket.push(fullPath);
    }
  }
}

function createScope(parent = null) {
  return { parent, names: new Set() };
}

function declarePattern(pattern, scope) {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      scope.names.add(pattern.name);
      break;
    case 'ObjectPattern':
      for (const prop of pattern.properties) {
        if (prop.type === 'Property') declarePattern(prop.value, scope);
        else if (prop.type === 'RestElement') declarePattern(prop.argument, scope);
      }
      break;
    case 'ArrayPattern':
      for (const item of pattern.elements) declarePattern(item, scope);
      break;
    case 'AssignmentPattern':
      declarePattern(pattern.left, scope);
      break;
    case 'RestElement':
      declarePattern(pattern.argument, scope);
      break;
    default:
      break;
  }
}

function isDeclared(name, scope) {
  for (let cur = scope; cur; cur = cur.parent) {
    if (cur.names.has(name)) return true;
  }
  return false;
}

function resolveImport(fromFile, source) {
  if (!source.startsWith('.')) return null;
  const base = path.resolve(path.dirname(path.join(rootDir, fromFile)), source);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
    const relative = rel(candidate);
    if (moduleInfos.has(relative)) return relative;
  }
  return null;
}

function walk(node, ctx) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'Program': {
      for (const stmt of node.body) walk(stmt, ctx);
      return;
    }
    case 'ImportDeclaration':
      return;
    case 'VariableDeclaration':
      for (const decl of node.declarations) {
        declarePattern(decl.id, ctx.scope);
        walk(decl.init, ctx);
      }
      return;
    case 'FunctionDeclaration':
      if (node.id) ctx.scope.names.add(node.id.name);
      walkFunction(node, ctx);
      return;
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      walkFunction(node, ctx);
      return;
    case 'ClassDeclaration':
      if (node.id) ctx.scope.names.add(node.id.name);
      walk(node.superClass, ctx);
      for (const item of node.body.body) walk(item, ctx);
      return;
    case 'ClassExpression':
      walk(node.superClass, ctx);
      for (const item of node.body.body) walk(item, ctx);
      return;
    case 'ExpressionStatement':
      walk(node.expression, ctx);
      return;
    case 'AssignmentExpression':
      handleAssignmentTarget(node.left, ctx);
      walk(node.right, ctx);
      return;
    case 'UpdateExpression':
      handleAssignmentTarget(node.argument, ctx);
      return;
    case 'Identifier':
      ctx.references.add(node.name);
      return;
    case 'MemberExpression':
      walk(node.object, ctx);
      if (node.computed) walk(node.property, ctx);
      return;
    case 'Property':
      if (node.computed) walk(node.key, ctx);
      walk(node.value, ctx);
      return;
    case 'MethodDefinition':
      if (node.computed) walk(node.key, ctx);
      walk(node.value, ctx);
      return;
    case 'ExportNamedDeclaration':
      if (node.declaration) walk(node.declaration, ctx);
      return;
    case 'ExportDefaultDeclaration':
      walk(node.declaration, ctx);
      return;
    case 'CatchClause': {
      const catchScope = createScope(ctx.scope);
      declarePattern(node.param, catchScope);
      walk(node.body, { ...ctx, scope: catchScope });
      return;
    }
    case 'BlockStatement': {
      const blockScope = createScope(ctx.scope);
      for (const stmt of node.body) walk(stmt, { ...ctx, scope: blockScope });
      return;
    }
    case 'ForStatement': {
      const forScope = createScope(ctx.scope);
      walk(node.init, { ...ctx, scope: forScope });
      walk(node.test, { ...ctx, scope: forScope });
      walk(node.update, { ...ctx, scope: forScope });
      walk(node.body, { ...ctx, scope: forScope });
      return;
    }
    case 'ForInStatement':
    case 'ForOfStatement': {
      const forScope = createScope(ctx.scope);
      walk(node.left, { ...ctx, scope: forScope });
      walk(node.right, { ...ctx, scope: forScope });
      walk(node.body, { ...ctx, scope: forScope });
      return;
    }
    default:
      break;
  }

  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, ctx);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, ctx);
    }
  }
}

function walkFunction(fn, ctx) {
  const fnScope = createScope(ctx.scope);
  if (fn.id) fnScope.names.add(fn.id.name);
  for (const param of fn.params) declarePattern(param, fnScope);
  walk(fn.body, { ...ctx, scope: fnScope });
}

function handleAssignmentTarget(target, ctx) {
  if (!target) return;
  if (target.type === 'Identifier') {
    const name = target.name;
    ctx.references.add(name);
    if (!isDeclared(name, ctx.scope) && !KNOWN_GLOBALS.has(name)) {
      ctx.implicitGlobalWrites.add(name);
    }
    return;
  }
  if (target.type === 'MemberExpression') {
    walk(target.object, ctx);
    if (target.computed) walk(target.property, ctx);
    return;
  }
  if (target.type === 'ObjectPattern' || target.type === 'ArrayPattern' || target.type === 'RestElement' || target.type === 'AssignmentPattern') {
    walk(target, ctx);
  }
}

const moduleInfos = new Map();
for (const file of getModuleFiles()) {
  const source = readFileSync(path.join(rootDir, file), 'utf8');
  const ast = parseAst(source);
  const info = {
    file,
    source,
    ast,
    imports: [],
    exports: [],
    reExports: [],
    references: new Set(),
    implicitGlobalWrites: new Set(),
    lines: source.split('\n').length
  };

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        info.imports.push({
          local: spec.local.name,
          imported: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name,
          source: node.source.value
        });
      }
      continue;
    }
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const decl = node.declaration;
        if (decl.declarations) {
          for (const entry of decl.declarations) {
            if (entry.id.type === 'Identifier') info.exports.push({ exported: entry.id.name, local: entry.id.name });
          }
        } else if (decl.id?.name) {
          info.exports.push({ exported: decl.id.name, local: decl.id.name });
        }
      }
      for (const spec of node.specifiers || []) {
        info.exports.push({ exported: spec.exported.name, local: spec.local.name });
        if (node.source) {
          info.reExports.push({ imported: spec.local.name, source: node.source.value });
        }
      }
      continue;
    }
    if (node.type === 'ExportDefaultDeclaration') {
      info.exports.push({ exported: 'default', local: node.declaration.id?.name || 'default' });
    }
  }

  const moduleScope = createScope();
  for (const imp of info.imports) moduleScope.names.add(imp.local);
  walk(ast, { scope: moduleScope, references: info.references, implicitGlobalWrites: info.implicitGlobalWrites });
  moduleInfos.set(file, info);
}

const importedExports = new Map();
for (const info of moduleInfos.values()) {
  for (const imp of info.imports) {
    const target = resolveImport(info.file, imp.source);
    if (!target) continue;
    const key = `${target}:${imp.imported}`;
    importedExports.set(key, (importedExports.get(key) || 0) + 1);
  }
  for (const reExp of info.reExports) {
    const target = resolveImport(info.file, reExp.source);
    if (!target) continue;
    const key = `${target}:${reExp.imported}`;
    importedExports.set(key, (importedExports.get(key) || 0) + 1);
  }
}

const errors = [];
const warnings = [];

for (const info of moduleInfos.values()) {
  const unusedImports = info.imports
    .filter((imp) => !info.references.has(imp.local))
    .map((imp) => imp.local);
  const newUnusedImports = unusedImports.filter((name) => !BASELINE_UNUSED_IMPORTS.has(`${info.file}:${name}`));
  if (newUnusedImports.length > 0) {
    errors.push(`${info.file}: unused imports -> ${newUnusedImports.join(', ')}`);
  }

  for (const name of info.implicitGlobalWrites) {
    if (!BASELINE_IMPLICIT_GLOBAL_WRITES.has(`${info.file}:${name}`)) {
      errors.push(`${info.file}: implicit global write -> ${name}`);
    }
  }

  if (info.lines > MAX_LINES) {
    const hotspot = `${info.file} (${info.lines} lines)`;
    if (BASELINE_OVERSIZED.has(info.file)) warnings.push(`baseline oversized module: ${hotspot}`);
    else errors.push(`${info.file}: exceeds ${MAX_LINES} lines (${info.lines})`);
  }

  if (!ENTRYPOINTS.has(info.file)) {
    for (const exp of info.exports) {
      const exportKey = `${info.file}:${exp.exported}`;
      if (BASELINE_UNUSED_EXPORTS.has(exportKey)) continue;
      if (!importedExports.has(exportKey)) {
        errors.push(`${info.file}: unused export -> ${exp.exported}`);
      }
    }
  }
}

console.log('Static analysis guardrails');
console.log(`- max lines threshold: ${MAX_LINES}`);
console.log(`- baseline oversized modules: ${BASELINE_OVERSIZED.size}`);
const burnDownState = evaluateBurnDown(errors);
if (burnDownState) {
  const { milestone, counts } = burnDownState;
  console.log(`- active burn-down milestone: ${milestone.dueDate}`);
  console.log(`  · oversized baseline: ${counts.oversizedModules}/${milestone.maxOversizedModules}`);
  console.log(`  · unused export baseline: ${counts.unusedExports}/${milestone.maxUnusedExports}`);
  console.log(`  · implicit global-write baseline: ${counts.implicitGlobalWrites}/${milestone.maxImplicitGlobalWrites}`);
}
if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
if (errors.length > 0) {
  console.error('\nViolations:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('\n✅ Static analysis checks passed.');
