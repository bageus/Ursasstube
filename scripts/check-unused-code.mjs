import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseAst } from 'rollup/parseAst';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASELINE_UNUSED_EXPORTS = new Set([]);
const BASELINE_UNUSED_CONTROLLER_PROPERTIES = new Set([]);
const EXTRA_GLOBALS = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history',
  'fetch', 'Headers', 'Request', 'Response', 'URL', 'URLSearchParams', 'AbortController',
  'Image', 'Audio', 'HTMLElement', 'HTMLCanvasElement', 'CustomEvent', 'Event', 'MouseEvent',
  'MediaMetadata', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
  'clearTimeout', 'setInterval', 'clearInterval', 'crypto', 'TextEncoder', 'TextDecoder',
  'FormData', 'btoa', 'atob', 'alert', 'confirm', 'prompt'
]);
const KNOWN_GLOBALS = new Set([...Object.getOwnPropertyNames(globalThis), ...EXTRA_GLOBALS]);

function getFiles(rootDir = ROOT_DIR) {
  try {
    const out = execSync("rg --files js scripts -g '*.js' -g '*.mjs'", { cwd: rootDir, encoding: 'utf8' });
    return out.trim().split('\n').filter(Boolean).sort();
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

function collectPatternEntries(pattern, entries, metadata = {}) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    entries.push({ name: pattern.name, ...metadata });
    return;
  }
  if (pattern.type === 'RestElement') {
    collectPatternEntries(pattern.argument, entries, metadata);
    return;
  }
  if (pattern.type === 'AssignmentPattern') {
    collectPatternEntries(pattern.left, entries, metadata);
    return;
  }
  if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements || []) collectPatternEntries(element, entries, metadata);
    return;
  }
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties || []) {
      if (property.type === 'RestElement') {
        collectPatternEntries(property.argument, entries, metadata);
        continue;
      }
      collectPatternEntries(property.value, entries, {
        ...metadata,
        returnedProperty: identifierName(property.key) || metadata.returnedProperty || null
      });
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

function getCalleeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) return identifierName(node.property);
  return null;
}

function getReturnedOwnerName(node) {
  if (!node) return null;
  if (node.type === 'CallExpression') return getCalleeName(node.callee);
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'AwaitExpression') return getReturnedOwnerName(node.argument);
  return null;
}

function isControllerOwner(name) {
  return Boolean(name && (/^create[A-Z]/.test(name) || /(Controller|Service|Bootstrap)$/.test(name)));
}

function createScope(parent = null) {
  return { parent, names: new Set() };
}

function declarePattern(pattern, scope) {
  const names = new Set();
  collectPatternNames(pattern, names);
  for (const name of names) scope.names.add(name);
}

function isDeclared(name, scope) {
  for (let current = scope; current; current = current.parent) {
    if (current.names.has(name)) return true;
  }
  return false;
}

function predeclareStatements(statements, scope) {
  for (const statement of statements || []) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (!declaration) continue;
    if (declaration.type === 'VariableDeclaration') {
      for (const item of declaration.declarations || []) declarePattern(item.id, scope);
    } else if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id) {
      scope.names.add(declaration.id.name);
    }
  }
}

function walkAssignmentTarget(target, context) {
  if (!target) return;
  if (target.type === 'Identifier') {
    context.references.add(target.name);
    if (!isDeclared(target.name, context.scope) && !context.knownGlobals.has(target.name)) {
      context.implicitGlobalWrites.add(target.name);
    }
    return;
  }
  if (target.type === 'MemberExpression') {
    walk(target.object, context);
    if (target.computed) walk(target.property, context);
    return;
  }
  if (target.type === 'ObjectPattern' || target.type === 'ArrayPattern') {
    const entries = [];
    collectPatternEntries(target, entries);
    for (const entry of entries) walkAssignmentTarget({ type: 'Identifier', name: entry.name }, context);
    return;
  }
  if (target.type === 'RestElement') {
    walkAssignmentTarget(target.argument, context);
    return;
  }
  if (target.type === 'AssignmentPattern') {
    walkAssignmentTarget(target.left, context);
    walk(target.right, context);
  }
}

function walkFunction(node, context) {
  const scope = createScope(context.scope);
  if (node.id) scope.names.add(node.id.name);
  for (const parameter of node.params || []) {
    declarePattern(parameter, scope);
    if (parameter.type === 'AssignmentPattern') walk(parameter.right, { ...context, scope });
  }
  walk(node.body, { ...context, scope });
}

function walk(node, context) {
  if (!node || typeof node !== 'object') return;
  switch (node.type) {
    case 'Program':
      predeclareStatements(node.body, context.scope);
      for (const statement of node.body || []) walk(statement, context);
      return;
    case 'ImportDeclaration':
      return;
    case 'VariableDeclaration':
      for (const declaration of node.declarations || []) walk(declaration.init, context);
      return;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      walkFunction(node, context);
      return;
    case 'ClassDeclaration':
    case 'ClassExpression':
      walk(node.superClass, context);
      for (const item of node.body?.body || []) walk(item, context);
      return;
    case 'BlockStatement': {
      const scope = createScope(context.scope);
      predeclareStatements(node.body, scope);
      for (const statement of node.body || []) walk(statement, { ...context, scope });
      return;
    }
    case 'CatchClause': {
      const scope = createScope(context.scope);
      declarePattern(node.param, scope);
      walk(node.body, { ...context, scope });
      return;
    }
    case 'ForStatement': {
      const scope = createScope(context.scope);
      if (node.init?.type === 'VariableDeclaration') {
        for (const declaration of node.init.declarations || []) declarePattern(declaration.id, scope);
      }
      walk(node.init, { ...context, scope });
      walk(node.test, { ...context, scope });
      walk(node.update, { ...context, scope });
      walk(node.body, { ...context, scope });
      return;
    }
    case 'ForInStatement':
    case 'ForOfStatement': {
      const scope = createScope(context.scope);
      if (node.left?.type === 'VariableDeclaration') {
        for (const declaration of node.left.declarations || []) declarePattern(declaration.id, scope);
      }
      walk(node.left, { ...context, scope });
      walk(node.right, { ...context, scope });
      walk(node.body, { ...context, scope });
      return;
    }
    case 'AssignmentExpression':
      walkAssignmentTarget(node.left, context);
      walk(node.right, context);
      return;
    case 'UpdateExpression':
      walkAssignmentTarget(node.argument, context);
      return;
    case 'Identifier':
      context.references.add(node.name);
      return;
    case 'MemberExpression':
      walk(node.object, context);
      if (node.computed) walk(node.property, context);
      return;
    case 'Property':
      if (node.computed) walk(node.key, context);
      walk(node.value, context);
      return;
    case 'MethodDefinition':
    case 'PropertyDefinition':
      if (node.computed) walk(node.key, context);
      walk(node.value, context);
      return;
    case 'ExportNamedDeclaration':
      if (node.declaration) walk(node.declaration, context);
      return;
    case 'ExportDefaultDeclaration':
      walk(node.declaration, context);
      return;
    case 'LabeledStatement':
      walk(node.body, context);
      return;
    case 'BreakStatement':
    case 'ContinueStatement':
      return;
    default:
      break;
  }

  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof item.type === 'string') walk(item, context);
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, context);
    }
  }
}

function collectModuleInfo(content, { knownGlobals = KNOWN_GLOBALS } = {}) {
  const ast = parseAst(String(content || ''));
  const info = {
    ast,
    exports: new Set(),
    exportedLocals: new Set(),
    imports: [],
    importBindings: [],
    moduleDeclarations: [],
    references: new Set(),
    implicitGlobalWrites: new Set()
  };

  for (const statement of ast.body || []) {
    if (statement.type === 'ImportDeclaration') {
      const names = [];
      for (const specifier of statement.specifiers || []) {
        let imported = null;
        if (specifier.type === 'ImportDefaultSpecifier') imported = 'default';
        else if (specifier.type === 'ImportNamespaceSpecifier') imported = '*';
        else if (specifier.type === 'ImportSpecifier') imported = identifierName(specifier.imported);
        if (imported) names.push(imported);
        if (specifier.local?.name) {
          info.importBindings.push({ local: specifier.local.name, imported, source: statement.source.value });
        }
      }
      if (names.length > 0) info.imports.push({ source: statement.source.value, names });
      continue;
    }

    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations || []) {
        const ownerName = getReturnedOwnerName(item.init);
        collectPatternEntries(item.id, info.moduleDeclarations, {
          kind: declaration.kind,
          ownerName,
          controllerProperty: item.id.type === 'ObjectPattern' && isControllerOwner(ownerName)
        });
      }
    } else if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
      if (declaration.id?.name) {
        info.moduleDeclarations.push({
          name: declaration.id.name,
          kind: declaration.type === 'FunctionDeclaration' ? 'function' : 'class',
          ownerName: null,
          controllerProperty: false,
          returnedProperty: null
        });
      }
    }

    if (statement.type === 'ExportDefaultDeclaration') {
      info.exports.add('default');
      if (statement.declaration?.type === 'Identifier') info.exportedLocals.add(statement.declaration.name);
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
    const declarationLocals = new Set();
    collectDeclarationExports(statement.declaration, declarationLocals);
    for (const name of declarationLocals) info.exportedLocals.add(name);

    const reexportedNames = [];
    for (const specifier of statement.specifiers || []) {
      const exported = identifierName(specifier.exported);
      const local = identifierName(specifier.local);
      if (exported) info.exports.add(exported);
      if (statement.source && local) reexportedNames.push(local);
      else if (local) info.exportedLocals.add(local);
    }
    if (statement.source && reexportedNames.length > 0) {
      info.imports.push({ source: statement.source.value, names: reexportedNames });
    }
  }

  const moduleScope = createScope();
  for (const binding of info.importBindings) moduleScope.names.add(binding.local);
  predeclareStatements(ast.body, moduleScope);
  walk(ast, {
    scope: moduleScope,
    references: info.references,
    implicitGlobalWrites: info.implicitGlobalWrites,
    knownGlobals
  });

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

function buildModuleMap({ rootDir = ROOT_DIR, files = getFiles(rootDir) } = {}) {
  const moduleMap = new Map();
  for (const file of files) {
    moduleMap.set(file, collectModuleInfo(readFileSync(path.join(rootDir, file), 'utf8')));
  }
  return moduleMap;
}

function analyzeUnusedExports({
  rootDir = ROOT_DIR,
  files = getFiles(rootDir),
  baseline = BASELINE_UNUSED_EXPORTS,
  moduleMap = null
} = {}) {
  const modules = moduleMap || buildModuleMap({ rootDir, files });
  const used = new Set();

  for (const [fromFile, info] of modules.entries()) {
    for (const imported of info.imports) {
      const target = resolveImport(fromFile, imported.source, modules, rootDir);
      if (!target) continue;
      if (imported.names.includes('*')) {
        for (const name of modules.get(target).exports) used.add(`${target}:${name}`);
        continue;
      }
      for (const name of imported.names) used.add(`${target}:${name}`);
    }
  }

  const unused = [];
  for (const [file, info] of modules.entries()) {
    for (const name of info.exports) {
      const key = `${file}:${name}`;
      if (!used.has(key) && !baseline.has(key)) unused.push(key);
    }
  }
  return unused.sort();
}

function findUnusedModuleLocals(info) {
  const seen = new Set();
  return info.moduleDeclarations.filter((declaration) => {
    if (!declaration.name || declaration.name.startsWith('_')) return false;
    if (seen.has(declaration.name)) return false;
    seen.add(declaration.name);
    return !info.references.has(declaration.name) && !info.exportedLocals.has(declaration.name);
  });
}

function analyzeUnusedLocals({ rootDir = ROOT_DIR, files = getFiles(rootDir), moduleMap = null } = {}) {
  const modules = moduleMap || buildModuleMap({ rootDir, files });
  const unused = [];
  for (const [file, info] of modules.entries()) {
    for (const declaration of findUnusedModuleLocals(info)) {
      unused.push({ file, ...declaration, key: `${file}:${declaration.name}` });
    }
  }
  return unused.sort((left, right) => left.key.localeCompare(right.key));
}

function analyzeUnusedControllerProperties({
  rootDir = ROOT_DIR,
  files = getFiles(rootDir),
  baseline = BASELINE_UNUSED_CONTROLLER_PROPERTIES,
  moduleMap = null
} = {}) {
  return analyzeUnusedLocals({ rootDir, files, moduleMap })
    .filter((entry) => entry.controllerProperty && !baseline.has(entry.key));
}

function runUnusedCodeCheck() {
  const files = getFiles();
  const moduleMap = buildModuleMap({ files });
  const unusedExports = analyzeUnusedExports({ files, moduleMap });
  const unusedLocals = analyzeUnusedLocals({ files, moduleMap });
  const unusedControllerProperties = analyzeUnusedControllerProperties({ files, moduleMap });
  let failed = false;

  if (unusedExports.length > 0) {
    failed = true;
    console.error('❌ Unused exports detected:');
    for (const key of unusedExports) console.error(` - ${key}`);
  }

  if (unusedControllerProperties.length > 0) {
    failed = true;
    console.error('❌ Unused returned controller properties detected:');
    for (const entry of unusedControllerProperties) {
      console.error(` - ${entry.key} (${entry.ownerName}.${entry.returnedProperty || entry.name})`);
    }
  }

  const controllerKeys = new Set(unusedControllerProperties.map((entry) => entry.key));
  const advisoryLocals = unusedLocals.filter((entry) => !controllerKeys.has(entry.key));
  if (advisoryLocals.length > 0) {
    console.warn('⚠️ Unused module-local candidates (advisory rollout):');
    for (const entry of advisoryLocals) console.warn(` - ${entry.key}`);
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log('✅ Unused-code check passed (exports and returned controller properties are used).');
  }

  return { unusedExports, unusedLocals, unusedControllerProperties };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUnusedCodeCheck();
}

export {
  analyzeUnusedControllerProperties,
  analyzeUnusedExports,
  analyzeUnusedLocals,
  buildModuleMap,
  collectModuleInfo,
  findUnusedModuleLocals,
  getFiles
};
