import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const staticAnalysisPath = path.join(rootDir, 'scripts/check-static-analysis.mjs');
const source = readFileSync(staticAnalysisPath, 'utf8');
const MAX_BASELINE_OVERSIZED = 1;

const baselineMatch = source.match(/const BASELINE_OVERSIZED = new Set\(\[([\s\S]*?)\]\);/);
if (!baselineMatch) {
  console.error('Could not find BASELINE_OVERSIZED in static-analysis script.');
  process.exit(1);
}

const maxLinesMatch = source.match(/const MAX_LINES = (\d+);/);
if (!maxLinesMatch) {
  console.error('Could not find MAX_LINES in static-analysis script.');
  process.exit(1);
}

const maxLines = Number(maxLinesMatch[1]);
const entries = [...baselineMatch[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
if (entries.length > MAX_BASELINE_OVERSIZED) {
  console.error(`Oversized baseline budget exceeded: ${entries.length}/${MAX_BASELINE_OVERSIZED}`);
  for (const entry of entries) console.error(`- ${entry}`);
  process.exit(1);
}

let failed = false;
for (const entry of entries) {
  const lines = readFileSync(path.join(rootDir, entry), 'utf8').split('\n').length;
  if (lines <= maxLines) {
    console.error(`Stale oversized baseline entry: ${entry} (${lines}/${maxLines} lines)`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`✅ Oversized baseline budget: ${entries.length}/${MAX_BASELINE_OVERSIZED}`);
