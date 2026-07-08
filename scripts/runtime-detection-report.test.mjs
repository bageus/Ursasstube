import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('runtime detection report prints known markers', () => {
  const output = execFileSync('node', ['scripts/report-runtime-detection.mjs'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /Runtime detection report/);
  assert.match(output, /index\.html/);
  assert.match(output, /telegram-runtime/);
  assert.match(output, /Files with runtime detection markers:/);
});
