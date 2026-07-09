import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = path.resolve('scripts/remove-static-runtime-sdk-script.mjs');
const sdkUrl = ['https://tele', 'gram.org/js/tele', 'gram-web-app.js'].join('');

function createFixture() {
  return [
    '<head>',
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <!-- Intentional external runtime dependency for Telegram Mini App APIs -->',
    `  <script src="${sdkUrl}" defer></script>`,
    '  <script>',
    '    window.__URSASS_POSTHOG_KEY__ = "test";',
    '  </script>',
    '</head>',
    '',
  ].join('\n');
}

test('runtime SDK cutover codemod removes only the static script block', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'runtime-sdk-cutover-'));
  const previousCwd = process.cwd();
  try {
    writeFileSync(path.join(workspace, 'index.html'), createFixture());
    process.chdir(workspace);

    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);

    const output = readFileSync('index.html', 'utf8');
    assert.equal(output.includes('telegram-web-app.js'), false);
    assert.equal(output.includes('__URSASS_POSTHOG_KEY__'), true);
    assert.equal(output.includes('fonts.googleapis.com'), true);
  } finally {
    process.chdir(previousCwd);
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('runtime SDK cutover dry run leaves index unchanged', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'runtime-sdk-cutover-dry-run-'));
  const previousCwd = process.cwd();
  try {
    const fixture = createFixture();
    writeFileSync(path.join(workspace, 'index.html'), fixture);
    process.chdir(workspace);

    const result = spawnSync(process.execPath, [scriptPath, '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /can be removed/);
    assert.equal(readFileSync('index.html', 'utf8'), fixture);
  } finally {
    process.chdir(previousCwd);
    rmSync(workspace, { recursive: true, force: true });
  }
});
