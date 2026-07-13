import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  START_MARKER,
  analyzeApiLeaderboardDisplayStaging
} from './check-api-leaderboard-display-staging.mjs';

const ASYNC_FUNCTIONS = new Set(['loadAndDisplayLeaderboard']);

function declaration(name) {
  const prefix = ASYNC_FUNCTIONS.has(name) ? 'async ' : '';
  return `${prefix}function ${name}() {\n  return '${name}';\n}`;
}

function section(names = EXPECTED_FUNCTIONS) {
  return names.map(declaration).join('\n');
}

function apiSource(body = section(), importLine = '') {
  return `${importLine}${importLine ? '\n' : ''}${body}\n${NEXT_MARKER}\n  return null;\n}`;
}

function domainSource(body = section(), exportBlock = '') {
  return `const dependency = true;\n${body}${exportBlock ? `\n${exportBlock}` : ''}\n`;
}

function exportBlock(names = ['loadAndDisplayLeaderboard']) {
  return `export {\n${names.map((name) => `  ${name}`).join(',\n')}\n};`;
}

test('accepts an exact staged leaderboard display duplicate', () => {
  const result = analyzeApiLeaderboardDisplayStaging({
    apiSource: apiSource(),
    domainSource: domainSource()
  });

  assert.equal(result.state, 'staged-duplicate');
  assert.equal(result.hasDomainImport, false);
  assert.equal(result.lines > 1, true);
  assert.equal(section().startsWith(START_MARKER), true);
});

test('rejects staged leaderboard display drift', () => {
  assert.throws(() => analyzeApiLeaderboardDisplayStaging({
    apiSource: apiSource(),
    domainSource: domainSource(section().replace("return 'loadAndDisplayLeaderboard'", "return 'changed'"))
  }), /must match leaderboard display ownership/);
});

test('rejects a domain import while the duplicate remains', () => {
  assert.throws(() => analyzeApiLeaderboardDisplayStaging({
    apiSource: apiSource(section(), `import { loadAndDisplayLeaderboard } ${DOMAIN_IMPORT};`),
    domainSource: domainSource()
  }), /partial leaderboard display extraction/);
});

test('rejects premature exports while the duplicate remains', () => {
  assert.throws(() => analyzeApiLeaderboardDisplayStaging({
    apiSource: apiSource(),
    domainSource: domainSource(section(), exportBlock())
  }), /partial leaderboard display extraction/);
});

test('accepts a complete extracted leaderboard display state', () => {
  const result = analyzeApiLeaderboardDisplayStaging({
    apiSource: `import { loadAndDisplayLeaderboard } ${DOMAIN_IMPORT};\n${NEXT_MARKER}\n  return null;\n}`,
    domainSource: domainSource(section(), exportBlock())
  });

  assert.equal(result.state, 'extracted');
  assert.equal(result.hasDomainImport, true);
});

test('rejects incomplete extracted exports', () => {
  assert.throws(() => analyzeApiLeaderboardDisplayStaging({
    apiSource: `import { loadAndDisplayLeaderboard } ${DOMAIN_IMPORT};\n${NEXT_MARKER}`,
    domainSource: domainSource(section(), 'export {\n  buildBackendApiUrl\n};')
  }), /must export loadAndDisplayLeaderboard/);
});

test('requires the complete function inventory', () => {
  const names = EXPECTED_FUNCTIONS.filter((name) => name !== 'buildBackendApiUrl');
  assert.throws(() => analyzeApiLeaderboardDisplayStaging({
    apiSource: apiSource(section(names)),
    domainSource: domainSource(section(names))
  }), /must define buildBackendApiUrl/);
});
