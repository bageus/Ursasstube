import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('instance field report prints header', () => {
  const output = execFileSync('node', ['scripts/report-instance-fields.mjs'], { encoding: 'utf8' });
  assert.match(output, /Instance field report/);
});
