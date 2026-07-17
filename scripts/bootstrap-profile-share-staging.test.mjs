import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  START_MARKER,
  analyzeBootstrapProfileShareStaging
} from './check-bootstrap-profile-share-staging.mjs';

const ASYNC_FUNCTIONS = new Set([
  'getCachedProfile',
  'refreshOnboardingAfterLeaderboardSaveSuccess',
  'updateGameOverShareButton'
]);
const ONBOARDING_TIMER_STATE = 'let onboardingGameOverRetryTimer = null;\nlet onboardingGameOverRetryJobId = 0;';
const RANK_DOMAIN_IMPORT = "import { buildTakeBackSub, showRankLossToast } from './bootstrap/rank-feedback.js';";
const START_HOOK_MARKER = '// ===== START HOOK =====';

function declaration(name) {
  const prefix = ASYNC_FUNCTIONS.has(name) ? 'async ' : '';
  return `${prefix}function ${name}() {\n  return '${name}';\n}`;
}

function section(names = EXPECTED_FUNCTIONS) {
  return names.map(declaration).join('\n\n');
}

function sectionWithTimerState() {
  return section().replace(
    declaration('cancelGameOverOnboardingRetries'),
    `${ONBOARDING_TIMER_STATE}\n${declaration('cancelGameOverOnboardingRetries')}`
  );
}

function bootstrapSource(body = section(), importLine = '') {
  return `${importLine}${importLine ? '\n' : ''}${body}\n\n${NEXT_MARKER}\nfunction updateStartHook() {}`;
}

function domainSource(body = section(), exportBlock = '') {
  return `const dependency = true;\n\n${body}${exportBlock ? `\n\n${exportBlock}` : ''}\n`;
}

function exportBlock(names = EXPECTED_FUNCTIONS) {
  return `export {\n${names.map((name) => `  ${name}`).join(',\n')}\n};`;
}

test('accepts an exact staged profile/share duplicate', () => {
  const result = analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource()
  });

  assert.equal(result.state, 'staged-duplicate');
  assert.equal(result.hasDomainImport, false);
  assert.equal(result.lines > 1, true);
  assert.equal(section().startsWith(START_MARKER), true);
});

test('accepts staged profile/share ownership after rank feedback extraction', () => {
  const result = analyzeBootstrapProfileShareStaging({
    bootstrapSource: `${RANK_DOMAIN_IMPORT}\n${section()}\n\n${START_HOOK_MARKER}\nfunction updateStartHook() {}`,
    domainSource: domainSource()
  });

  assert.equal(result.state, 'staged-duplicate');
  assert.equal(result.hasDomainImport, false);
});

test('rejects staged parity drift', () => {
  assert.throws(() => analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource(section().replace("return 'checkXOAuthCallback'", "return 'changed'"))
  }), /must match profile\/share setup/);
});

test('rejects timer state moved outside the owned section', () => {
  assert.throws(() => analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapSource(sectionWithTimerState()),
    domainSource: `${ONBOARDING_TIMER_STATE}\n${domainSource()}`
  }), /must match profile\/share setup/);
});

test('rejects a domain import while the duplicate remains', () => {
  assert.throws(() => analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapSource(section(), `import { updateGameOverShareButton } ${DOMAIN_IMPORT};`),
    domainSource: domainSource()
  }), /partial profile\/share setup extraction/);
});

test('rejects premature domain exports while the duplicate remains', () => {
  assert.throws(() => analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource(section(), exportBlock())
  }), /partial profile\/share setup extraction/);
});

test('accepts a complete extracted state', () => {
  const result = analyzeBootstrapProfileShareStaging({
    bootstrapSource: `import { updateGameOverShareButton } ${DOMAIN_IMPORT};\n\n${NEXT_MARKER}\nfunction updateStartHook() {}`,
    domainSource: domainSource(section(), exportBlock())
  });

  assert.equal(result.state, 'extracted');
  assert.equal(result.hasDomainImport, true);
});

test('rejects an incomplete extracted export block', () => {
  assert.throws(() => analyzeBootstrapProfileShareStaging({
    bootstrapSource: `import { updateGameOverShareButton } ${DOMAIN_IMPORT};\n\n${NEXT_MARKER}`,
    domainSource: domainSource(section(), exportBlock(EXPECTED_FUNCTIONS.slice(0, -1)))
  }), /must export syncFirstRunOnboardingUiState/);
});

test('rejects a staged module with a missing function', () => {
  const names = EXPECTED_FUNCTIONS.filter((name) => name !== 'updatePlayerAvatarVisibility');
  assert.throws(() => analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapSource(section(names)),
    domainSource: domainSource(section(names))
  }), /must define updatePlayerAvatarVisibility/);
});
