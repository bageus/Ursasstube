import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  START_MARKER
} from './check-api-leaderboard-display-staging.mjs';
import {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_REWRITES,
  analyzeApiLeaderboardDisplayCutover,
  transformApiFacade,
  transformDomainModule
} from './cutover-api-leaderboard-display.mjs';

const IMPORT_ANCHOR = "import { canPersistProgress, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './features/store/index.js';";
const ASYNC_FUNCTIONS = new Set(['loadAndDisplayLeaderboard']);
const FUNCTION_PARAMS = {
  buildBackendApiUrl: 'pathname',
  loadAndDisplayLeaderboard: 'options = {}'
};

function declaration(name) {
  const prefix = ASYNC_FUNCTIONS.has(name) ? 'async ' : '';
  return `${prefix}function ${name}(${FUNCTION_PARAMS[name] ?? ''}) {\n  return '${name}';\n}`;
}

function section() {
  return EXPECTED_FUNCTIONS.map(declaration).join('\n');
}

function imports() {
  return `${IMPORT_REWRITES.map(({ before }) => before.trimEnd()).join('\n')}\n${IMPORT_ANCHOR}`;
}

function apiSource({ body = section(), importSource = imports(), exportNames = ['loadAndDisplayLeaderboard', 'saveResultToLeaderboard'] } = {}) {
  return `${importSource}\nconst before = true;\n${body}\n${NEXT_MARKER}\n  return null;\n}\nconst after = true;\nexport {\n${exportNames.map((name) => `  ${name}`).join(',\n')}\n};\n`;
}

function domainSource({ body = section(), exportBlock = '' } = {}) {
  return `const dependency = true;\n${body}${exportBlock ? `\n${exportBlock}` : ''}\n`;
}

test('cuts over leaderboard display ownership atomically', () => {
  const result = analyzeApiLeaderboardDisplayCutover({
    apiSource: apiSource(),
    domainSource: domainSource()
  });

  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-duplicate');
  assert.equal(result.after.state, 'extracted');
  assert.equal(result.apiSource.includes(START_MARKER), false);
  assert.equal(result.apiSource.includes(DOMAIN_IMPORT_STATEMENT), true);
  assert.equal(result.apiSource.includes('loadAndDisplayLeaderboard,'), true);
  assert.equal(result.domainSource.includes(DOMAIN_EXPORT_BLOCK), true);
  assert.equal(result.domainSource.slice(result.domainSource.lastIndexOf('\nexport {')).includes('buildBackendApiUrl'), false);
  assert.equal(result.apiSource.length < apiSource().length, true);
});

test('accepts an already extracted no-op', () => {
  const first = analyzeApiLeaderboardDisplayCutover({
    apiSource: apiSource(),
    domainSource: domainSource()
  });
  const second = analyzeApiLeaderboardDisplayCutover({
    apiSource: first.apiSource,
    domainSource: first.domainSource
  });

  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects staged parity drift before changing files', () => {
  assert.throws(() => analyzeApiLeaderboardDisplayCutover({
    apiSource: apiSource(),
    domainSource: domainSource({ body: section().replace("return 'loadAndDisplayLeaderboard'", "return 'changed'") })
  }), /must match leaderboard display ownership/);
});

test('rejects a partial domain import while the duplicate remains', () => {
  assert.throws(() => analyzeApiLeaderboardDisplayCutover({
    apiSource: apiSource({ importSource: `${imports()}\nimport { loadAndDisplayLeaderboard } ${DOMAIN_IMPORT};` }),
    domainSource: domainSource()
  }), /partial leaderboard display extraction/);
});

test('rejects an unexpected import layout', () => {
  const source = apiSource().replace(IMPORT_REWRITES[0].before, "import { BACKEND_URL } from './config.js';");
  assert.throws(() => transformApiFacade(source), /Expected API import not found/);
});

test('rejects a missing import anchor', () => {
  const source = apiSource({ importSource: imports().replace(IMPORT_ANCHOR, '') });
  assert.throws(() => transformApiFacade(source), /import anchor not found/);
});

test('rejects an incomplete extracted domain export block', () => {
  assert.throws(() => transformDomainModule(domainSource({
    exportBlock: 'export {\n  buildBackendApiUrl\n};'
  })), /export block is incomplete: loadAndDisplayLeaderboard/);
});

test('preserves unrelated facade exports', () => {
  const result = analyzeApiLeaderboardDisplayCutover({
    apiSource: apiSource({ exportNames: ['loadAndDisplayLeaderboard', 'saveResultToLeaderboard', 'fetchGameOverPreview'] }),
    domainSource: domainSource()
  });

  assert.equal(result.apiSource.includes('saveResultToLeaderboard'), true);
  assert.equal(result.apiSource.includes('fetchGameOverPreview'), true);
});
