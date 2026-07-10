import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BASE_IMPORT,
  NEXT_SECTION_MARKER,
  START_MARKER,
  STYLE_IMPORT,
  analyzeCssBaseStaging,
  getStyleBaseBlock,
  getStyleState,
  normalizeCss,
} from './check-css-base-staging.mjs';

const BASE_BLOCK = `${START_MARKER}
:root { --color-bg: #000; }

/* ===== UI BUTTON SYSTEM ===== */
.ui-btn { display: inline-flex; }
body { margin: 0; }`;

function mainSource() {
  return `import './logger.js';
${BASE_IMPORT}
${STYLE_IMPORT}
import '../css/menu-layout.css';
`;
}

test('normalizeCss trims trailing whitespace without changing body content', () => {
  assert.equal(normalizeCss('a\n\n'), 'a');
});

test('getStyleBaseBlock reads the duplicated base block', () => {
  const styleSource = `${BASE_BLOCK}

${NEXT_SECTION_MARKER}
#walletCorner { position: fixed; }
`;

  assert.equal(getStyleBaseBlock(styleSource), BASE_BLOCK);
});

test('getStyleState detects staged duplicate and extracted states', () => {
  assert.equal(getStyleState(`${BASE_BLOCK}\n${NEXT_SECTION_MARKER}\n`), 'staged-duplicate');
  assert.equal(getStyleState(`${NEXT_SECTION_MARKER}\n#walletCorner {}`), 'extracted');
});

test('analyzeCssBaseStaging accepts the staged duplicate state', () => {
  const result = analyzeCssBaseStaging({
    baseSource: `${BASE_BLOCK}\n`,
    styleSource: `${BASE_BLOCK}\n\n${NEXT_SECTION_MARKER}\n#walletCorner { position: fixed; }\n`,
    mainSource: mainSource(),
  });

  assert.deepEqual(result, {
    state: 'staged-duplicate',
    baseLines: BASE_BLOCK.split('\n').length,
    hasStyleDuplicate: true,
  });
});

test('analyzeCssBaseStaging accepts the extracted state', () => {
  const result = analyzeCssBaseStaging({
    baseSource: `${BASE_BLOCK}\n`,
    styleSource: `${NEXT_SECTION_MARKER}\n#walletCorner { position: fixed; }\n`,
    mainSource: mainSource(),
  });

  assert.equal(result.state, 'extracted');
  assert.equal(result.hasStyleDuplicate, false);
});

test('analyzeCssBaseStaging rejects mismatched staged blocks', () => {
  assert.throws(() => analyzeCssBaseStaging({
    baseSource: `${BASE_BLOCK}\n`,
    styleSource: `${START_MARKER}\n:root { --color-bg: red; }\n${NEXT_SECTION_MARKER}\n`,
    mainSource: mainSource(),
  }), /must match/);
});

test('analyzeCssBaseStaging requires css/base.css before css/style.css', () => {
  assert.throws(() => analyzeCssBaseStaging({
    baseSource: `${BASE_BLOCK}\n`,
    styleSource: `${NEXT_SECTION_MARKER}\n`,
    mainSource: `${STYLE_IMPORT}\n${BASE_IMPORT}\n`,
  }), /before css\/style\.css/);
});
