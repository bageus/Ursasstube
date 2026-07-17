import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeUnusedExports,
  buildModuleMap,
  getFiles
} from './check-unused-code.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const MAX_LINES = 600;
const BASELINE_OVERSIZED = new Set([
  'js/physics.js',
]);
const BASELINE_UNUSED_EXPORTS = new Set([]);
const BASELINE_UNUSED_IMPORTS = new Set([]);
const BASELINE_IMPLICIT_GLOBAL_WRITES = new Set([]);

const BASELINE_BURN_DOWN_MILESTONES = Object.freeze([
  {
    dueDate: '2026-04-05',
    maxOversizedModules: 3,
    maxUnusedExports: 1,
    maxImplicitGlobalWrites: 3,
  },
  {
    dueDate: '2026-06-01',
    maxOversizedModules: 1,
    maxUnusedExports: 1,
    maxImplicitGlobalWrites: 2,
  },
  {
    dueDate: '2026-09-01',
    maxOversizedModules: 1,
    maxUnusedExports: 0,
    maxImplicitGlobalWrites: 0,
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

function getLineCount(file) {
  return readFileSync(path.join(rootDir, file), 'utf8').split('\n').length;
}

const files = getFiles(rootDir);
const moduleMap = buildModuleMap({ rootDir, files });
const errors = [];
const warnings = [];

for (const [file, info] of moduleMap.entries()) {
  const unusedImports = info.importBindings
    .filter((binding) => !info.references.has(binding.local) && !info.exportedLocals.has(binding.local))
    .map((binding) => binding.local)
    .filter((name) => !BASELINE_UNUSED_IMPORTS.has(`${file}:${name}`));

  if (unusedImports.length > 0) {
    errors.push(`${file}: unused imports -> ${unusedImports.join(', ')}`);
  }

  for (const name of info.implicitGlobalWrites) {
    if (!BASELINE_IMPLICIT_GLOBAL_WRITES.has(`${file}:${name}`)) {
      errors.push(`${file}: implicit global write -> ${name}`);
    }
  }

  const lines = getLineCount(file);
  if (lines > MAX_LINES) {
    const hotspot = `${file} (${lines} lines)`;
    if (BASELINE_OVERSIZED.has(file)) warnings.push(`baseline oversized module: ${hotspot}`);
    else errors.push(`${file}: exceeds ${MAX_LINES} lines (${lines})`);
  }
}

for (const key of analyzeUnusedExports({
  rootDir,
  files,
  moduleMap,
  baseline: BASELINE_UNUSED_EXPORTS
})) {
  const separator = key.lastIndexOf(':');
  const file = key.slice(0, separator);
  const exported = key.slice(separator + 1);
  errors.push(`${file}: unused export -> ${exported}`);
}

console.log('Static analysis guardrails');
console.log(`- max lines threshold: ${MAX_LINES}`);
console.log(`- baseline oversized modules: ${BASELINE_OVERSIZED.size}`);
console.log(`- baseline unused exports: ${BASELINE_UNUSED_EXPORTS.size}`);
console.log(`- baseline implicit global writes: ${BASELINE_IMPLICIT_GLOBAL_WRITES.size}`);
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
