import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('static baseline report prints all baseline sections', () => {
  const output = execFileSync('node', ['scripts/report-static-baselines.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /Oversized baseline/);
  assert.match(output, /Unused export baseline/);
  assert.match(output, /Implicit global-write baseline/);
  assert.match(output, /Review notes/);
});
