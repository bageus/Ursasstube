import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('runtime loading report runs', () => {
  const result = spawnSync(process.execPath, ['scripts/report-runtime-sdk-loading.mjs'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(typeof report.index_html, 'object');
});
