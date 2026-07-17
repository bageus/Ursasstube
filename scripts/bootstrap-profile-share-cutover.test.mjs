import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  START_MARKER
} from './check-bootstrap-profile-share-staging.mjs';
import {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_REWRITES,
  PRIVATE_PREAMBLE,
  PRESERVED_SESSION_FLAGS,
  analyzeBootstrapProfileShareCutover,
  transformBootstrap,
  transformDomain
} from './cutover-bootstrap-profile-share.mjs';

const IMPORT_ANCHOR = "import { markGameRuntimeReady } from '../app-loading.js';";
const TIMER_STATE = 'let onboardingGameOverRetryTimer = null;\nlet onboardingGameOverRetryJobId = 0;';
const ASYNC_FUNCTIONS = new Set([
  'getCachedProfile',
  'refreshOnboardingAfterLeaderboardSaveSuccess',
  'updateGameOverShareButton'
]);

function declaration(name) {
  const prefix = ASYNC_FUNCTIONS.has(name) ? 'async ' : '';
  return `${prefix}function ${name}() {\n  return '${name}';\n}`;
}

function ownedSection(names = EXPECTED_FUNCTIONS) {
  return names.map((name) => (
    name === 'cancelGameOverOnboardingRetries'
      ? `${TIMER_STATE}\n${declaration(name)}`
      : declaration(name)
  )).join('\n\n');
}

function imports() {
  return `${IMPORT_REWRITES[0].before}\n${IMPORT_REWRITES[1].before.trimEnd()}\n${IMPORT_REWRITES[2].before}\n${IMPORT_ANCHOR}`;
}

function bootstrapSource({ section = ownedSection(), preamble = PRIVATE_PREAMBLE, importSource = imports() } = {}) {
  return `${importSource}\n${preamble}\n// Flag: true only when the user actively initiated a wallet connect this session tick.\n${PRESERVED_SESSION_FLAGS[0]}\n// Tracks whether a wallet session was active on the previous auth callback.\n${PRESERVED_SESSION_FLAGS[1]}\n\n${section}\n\n${NEXT_MARKER}\nfunction updateStartHook() {}`;
}

function domainSource({ section = ownedSection(), exportBlock = '' } = {}) {
  return `const dependency = true;\nconst PROFILE_CACHE_TTL_MS = 30000;\n\n${section}${exportBlock ? `\n\n${exportBlock}` : ''}\n`;
}

test('cuts over the staged profile/share setup atomically', () => {
  assert.equal(IMPORT_REWRITES.length, 3);
  assert.equal(ownedSection().startsWith(START_MARKER), true);
  assert.equal(transformBootstrap(bootstrapSource()).changed, true);
  assert.equal(transformDomain(domainSource()).changed, true);

  const result = analyzeBootstrapProfileShareCutover({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource()
  });

  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-duplicate');
  assert.equal(result.after.state, 'extracted');
  assert.equal(result.bootstrapSource.includes(START_MARKER), false);
  assert.equal(result.bootstrapSource.includes(PRIVATE_PREAMBLE), false);
  assert.equal(result.bootstrapSource.includes(DOMAIN_IMPORT_STATEMENT), true);
  assert.equal(result.bootstrapSource.includes('fetchMyProfile'), false);
  assert.equal(result.bootstrapSource.includes("from './onboarding-hints.js'"), false);
  assert.equal(result.bootstrapSource.includes('isPlayerMenuOpen'), false);
  assert.equal(result.bootstrapSource.includes('refreshPlayerMenu'), false);
  assert.equal(result.domainSource.includes(DOMAIN_EXPORT_BLOCK), true);
  for (const token of PRESERVED_SESSION_FLAGS) {
    assert.equal(result.bootstrapSource.includes(token), true);
  }
});

test('accepts an already extracted no-op', () => {
  const first = analyzeBootstrapProfileShareCutover({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource()
  });
  const second = analyzeBootstrapProfileShareCutover({
    bootstrapSource: first.bootstrapSource,
    domainSource: first.domainSource
  });

  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects staged parity drift before changing files', () => {
  assert.throws(() => analyzeBootstrapProfileShareCutover({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource({ section: ownedSection().replace("return 'checkXOAuthCallback'", "return 'changed'") })
  }), /must match profile\/share setup/);
});

test('rejects a partial domain import while the duplicate remains', () => {
  assert.throws(() => analyzeBootstrapProfileShareCutover({
    bootstrapSource: bootstrapSource({ importSource: `${imports()}\nimport { updateGameOverShareButton } ${DOMAIN_IMPORT};` }),
    domainSource: domainSource()
  }), /partial profile\/share setup extraction/);
});

test('rejects a missing private preamble', () => {
  assert.throws(() => transformBootstrap(bootstrapSource({ preamble: 'const unrelated = true;' })), /missing the exact profile\/share private preamble/);
});

test('rejects an unexpected import layout', () => {
  const source = bootstrapSource().replace(IMPORT_REWRITES[0].before, "import { isAuthenticated } from '../api.js';");
  assert.throws(() => transformBootstrap(source), /Expected bootstrap import not found/);
});

test('rejects removal of a wallet-session flag', () => {
  const source = bootstrapSource().replace(PRESERVED_SESSION_FLAGS[0], '');
  assert.throws(() => transformBootstrap(source), /must preserve session flag/);
});

test('rejects an incomplete extracted export block', () => {
  const incomplete = `export {\n${EXPECTED_FUNCTIONS.slice(0, -1).map((name) => `  ${name}`).join(',\n')}\n};`;
  assert.throws(() => transformDomain(domainSource({ exportBlock: incomplete })), /export block is incomplete: syncFirstRunOnboardingUiState/);
});
