import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = path.resolve('scripts/check-no-static-runtime-script.mjs');
const marker = 'src="https://' + ['tele', 'gram.org/js/tele', 'gram-web-app.js'].join('') + '"';

function runFixture(content) {
  const workspace = mkdtempSync(path.join(tmpdir(), 'runtime-guard-'));
  try {
    const fixturePath = path.join(workspace, 'index.html');
    writeFileSync(fixturePath, content);
    return spawnSync(process.execPath, [scriptPath, fixturePath], { encoding: 'utf8' });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test('no static runtime guard fails on old fixture', () => {
  const result = runFixture(`<script ${marker} defer></script>`);
  assert.equal(result.status, 1);
});

test('no static runtime guard passes after cutover', () => {
  const result = runFixture('<script>window.__URSASS_POSTHOG_KEY__ = "test";</script>');
  assert.equal(result.status, 0, result.stderr);
});
