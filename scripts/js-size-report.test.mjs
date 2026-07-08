import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('JS size report prints known module entries', () => {
  const output = execFileSync('node', ['scripts/report-js-size.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /JS size report/);
  assert.match(output, /js\/api\.js:/);
  assert.match(output, /lines/);
  assert.match(output, /loc/);
  assert.match(output, /KB/);
});
