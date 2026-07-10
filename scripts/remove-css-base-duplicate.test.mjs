import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const START_MARKER = '/* ===== TOKENS / BASE ===== */';
const NEXT_SECTION_MARKER = '/* ===== WALLET CORNER ===== */';
const SCRIPT_PATH = resolve('scripts/remove-css-base-duplicate.mjs');

function baseFixture() {
  return `${START_MARKER}
:root { --color-bg: #000; }
body { margin: 0; }
`;
}

function styleFixture() {
  return `${baseFixture()}
${NEXT_SECTION_MARKER}
#walletCorner { position: fixed; }
`;
}

function runTool(args) {
  return execFileSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8' });
}

test('CSS base duplicate removal dry-run reports without writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-remove-'));
  const basePath = join(dir, 'base.css');
  const stylePath = join(dir, 'style.css');
  writeFileSync(basePath, baseFixture());
  writeFileSync(stylePath, styleFixture());

  const output = runTool(['--dry-run', `--base=${basePath}`, `--style=${stylePath}`]);

  assert.match(output, /CSS base duplicate removal/);
  assert.match(output, /"changed": true/);
  assert.match(output, /"nextStyleStartsWith": "\/\* ===== WALLET CORNER ===== \*\/"/);
  assert.equal(readFileSync(stylePath, 'utf8'), styleFixture());
  rmSync(dir, { recursive: true, force: true });
});

test('CSS base duplicate removal writes style without base block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-remove-'));
  const basePath = join(dir, 'base.css');
  const stylePath = join(dir, 'style.css');
  writeFileSync(basePath, baseFixture());
  writeFileSync(stylePath, styleFixture());

  runTool([`--base=${basePath}`, `--style=${stylePath}`]);

  const styleSource = readFileSync(stylePath, 'utf8');
  assert.ok(styleSource.startsWith(NEXT_SECTION_MARKER));
  assert.doesNotMatch(styleSource, /--color-bg/);
  assert.match(styleSource, /#walletCorner/);
  rmSync(dir, { recursive: true, force: true });
});

test('CSS base duplicate removal rejects mismatched base block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-remove-'));
  const basePath = join(dir, 'base.css');
  const stylePath = join(dir, 'style.css');
  writeFileSync(basePath, `${START_MARKER}\n:root { --color-bg: #111; }\n`);
  writeFileSync(stylePath, styleFixture());

  assert.throws(() => runTool([`--base=${basePath}`, `--style=${stylePath}`]));
  rmSync(dir, { recursive: true, force: true });
});
