import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walk(full, acc);
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(rootDir)
  .filter((f) => !f.includes(`${path.sep}dist${path.sep}`))
  .sort();

let failed = false;
for (const file of files) {
  const rel = path.relative(rootDir, file);
  const res = spawnSync('node', ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    failed = true;
    console.error(`❌ Syntax check failed: ${rel}`);
    if (res.stdout) console.error(res.stdout.trim());
    if (res.stderr) console.error(res.stderr.trim());
  } else {
    console.log(`✅ ${rel}`);
  }
}

if (failed) process.exit(1);
