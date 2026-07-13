import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const staticAnalysisPath = path.join(rootDir, 'scripts/check-static-analysis.mjs');
const source = readFileSync(staticAnalysisPath, 'utf8');
const MAX_BASELINE_OVERSIZED = 1;

const match = source.match(/const BASELINE_OVERSIZED = new Set\(\[([\s\S]*?)\]\);/);
if (!match) {
  console.error('Could not find BASELINE_OVERSIZED in static-analysis script.');
  process.exit(1);
}

const entries = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
if (entries.length > MAX_BASELINE_OVERSIZED) {
  console.error(`Oversized baseline budget exceeded: ${entries.length}/${MAX_BASELINE_OVERSIZED}`);
  for (const entry of entries) console.error(`- ${entry}`);
  process.exit(1);
}

console.log(`✅ Oversized baseline budget: ${entries.length}/${MAX_BASELINE_OVERSIZED}`);
