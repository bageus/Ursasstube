import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const START_MARKER = '/* ===== TOKENS / BASE ===== */';
const NEXT_SECTION_MARKER = '/* ===== WALLET CORNER ===== */';
const IMPORT_LINE = "@import './base.css';";
const SCRIPT_PATH = resolve('scripts/extract-css-base.mjs');

function fixtureSource() {
  return `${START_MARKER}
:root { --color-bg: #000; }

/* ===== UI BUTTON SYSTEM ===== */
.ui-btn { display: inline-flex; }
body { margin: 0; }

${NEXT_SECTION_MARKER}
#walletCorner { position: fixed; }
`;
}

function runTool(args) {
  return execFileSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8' });
}

test('CSS base extraction dry-run reports without writing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-extract-'));
  const stylePath = join(dir, 'style.css');
  const basePath = join(dir, 'base.css');
  writeFileSync(stylePath, fixtureSource());

  const output = runTool(['--dry-run', `--style=${stylePath}`, `--base=${basePath}`]);

  assert.match(output, /CSS base extraction/);
  assert.match(output, /"dryRun": true/);
  assert.equal(readFileSync(stylePath, 'utf8'), fixtureSource());
  assert.throws(() => readFileSync(basePath, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
});

test('CSS base extraction writes base file and import through CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-extract-'));
  const stylePath = join(dir, 'style.css');
  const basePath = join(dir, 'base.css');
  writeFileSync(stylePath, fixtureSource());

  runTool([`--style=${stylePath}`, `--base=${basePath}`]);

  const nextStyle = readFileSync(stylePath, 'utf8');
  const baseSource = readFileSync(basePath, 'utf8');
  assert.ok(nextStyle.startsWith(`${IMPORT_LINE}\n\n${NEXT_SECTION_MARKER}`));
  assert.match(baseSource, /:root/);
  assert.match(baseSource, /\.ui-btn/);
  assert.doesNotMatch(baseSource, /#walletCorner/);
  rmSync(dir, { recursive: true, force: true });
});
