import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IMPORT_LINE,
  NEXT_SECTION_MARKER,
  START_MARKER,
  buildBaseExtraction,
  runCssBaseExtraction,
} from './extract-css-base.mjs';

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

test('buildBaseExtraction moves only the base block', () => {
  const result = buildBaseExtraction(fixtureSource());

  assert.match(result.baseSource, new RegExp(START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.baseSource, /\.ui-btn/);
  assert.doesNotMatch(result.baseSource, /#walletCorner/);
  assert.ok(result.styleSource.startsWith(`${IMPORT_LINE}\n\n${NEXT_SECTION_MARKER}`));
  assert.match(result.styleSource, /#walletCorner/);
});

test('runCssBaseExtraction supports dry-run without writing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-extract-'));
  const stylePath = join(dir, 'style.css');
  const basePath = join(dir, 'base.css');
  writeFileSync(stylePath, fixtureSource());

  const report = runCssBaseExtraction({ dryRun: true, force: false, stylePath, basePath });

  assert.equal(report.dryRun, true);
  assert.equal(readFileSync(stylePath, 'utf8'), fixtureSource());
  assert.throws(() => readFileSync(basePath, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
});

test('runCssBaseExtraction writes base file and import when not dry-run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'css-base-extract-'));
  const stylePath = join(dir, 'style.css');
  const basePath = join(dir, 'base.css');
  writeFileSync(stylePath, fixtureSource());

  runCssBaseExtraction({ dryRun: false, force: false, stylePath, basePath });

  const nextStyle = readFileSync(stylePath, 'utf8');
  const baseSource = readFileSync(basePath, 'utf8');
  assert.ok(nextStyle.startsWith(`${IMPORT_LINE}\n\n${NEXT_SECTION_MARKER}`));
  assert.match(baseSource, /:root/);
  assert.doesNotMatch(baseSource, /#walletCorner/);
  rmSync(dir, { recursive: true, force: true });
});
