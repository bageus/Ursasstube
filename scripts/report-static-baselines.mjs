import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const staticAnalysisPath = path.join(rootDir, 'scripts/check-static-analysis.mjs');
const staticAnalysisSource = readFileSync(staticAnalysisPath, 'utf8');

function parseSet(name) {
  const match = staticAnalysisSource.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function getLineCount(file) {
  const absolutePath = path.join(rootDir, file);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, 'utf8').split('\n').length;
}

function printSection(title, lines) {
  console.log(`\n${title}`);
  if (lines.length === 0) {
    console.log('- none');
    return;
  }
  for (const line of lines) console.log(`- ${line}`);
}

const oversized = parseSet('BASELINE_OVERSIZED');
const unusedExports = parseSet('BASELINE_UNUSED_EXPORTS');
const implicitGlobalWrites = parseSet('BASELINE_IMPLICIT_GLOBAL_WRITES');

printSection('Oversized baseline', oversized.map((file) => {
  const lineCount = getLineCount(file);
  return lineCount === null ? `${file}: missing file` : `${file}: ${lineCount} lines`;
}));

printSection('Unused export baseline', unusedExports);
printSection('Implicit global-write baseline', implicitGlobalWrites);

console.log('\nReview notes');
console.log('- Remove baseline entries only after `npm run check:static-analysis` passes without them.');
console.log('- If an oversized file drops below the guard threshold, remove it from BASELINE_OVERSIZED.');
console.log('- If an implicit global write no longer reproduces, remove it from BASELINE_IMPLICIT_GLOBAL_WRITES.');
