import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NEXT_MARKER,
  START_MARKER
} from './check-bootstrap-rank-feedback-staging.mjs';
import {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  analyzeBootstrapRankFeedbackCutover,
  transformBootstrap,
  transformDomain
} from './cutover-bootstrap-rank-feedback.mjs';

const SECTION = `${START_MARKER}
function getRankToastSessionKey(primaryId) {
  return \`rankToastShown_\${primaryId}\`;
}
function isValidDelta(delta) {
  return Number(delta) > 0;
}
function buildTakeBackSub(snapshot, lostPosition) {
  return snapshot && lostPosition ? 'take-back' : null;
}
function showRankLossToast(profile, primaryId) {
  return Boolean(profile && primaryId);
}`;

function bootstrapSource(section = SECTION) {
  return `import { dependency } from '../fixture.js';
${IMPORT_ANCHOR}

${section}

${NEXT_MARKER}
function updateStartHook() {}
`;
}

function domainSource(section = SECTION, exportBlock = '') {
  return `import { dependency } from '../../fixture.js';

${section}${exportBlock ? `\n\n${exportBlock}` : ''}
`;
}

test('cuts over staged rank feedback atomically', () => {
  const result = analyzeBootstrapRankFeedbackCutover({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource()
  });

  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-duplicate');
  assert.equal(result.after.state, 'extracted');
  assert.equal(result.bootstrapSource.includes(START_MARKER), false);
  assert.equal(result.bootstrapSource.includes(DOMAIN_IMPORT_STATEMENT), true);
  assert.equal(result.domainSource.includes(DOMAIN_EXPORT_BLOCK), true);
});

test('accepts an already extracted no-op', () => {
  const first = analyzeBootstrapRankFeedbackCutover({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource()
  });
  const second = analyzeBootstrapRankFeedbackCutover({
    bootstrapSource: first.bootstrapSource,
    domainSource: first.domainSource
  });

  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects parity drift before transforming files', () => {
  assert.throws(() => analyzeBootstrapRankFeedbackCutover({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource(SECTION.replace("'take-back'", "'changed'"))
  }), /must match the rank watcher section/);
});

test('rejects a missing bootstrap import anchor', () => {
  assert.throws(() => transformBootstrap(
    bootstrapSource().replace(`${IMPORT_ANCHOR}\n`, '')
  ), /import anchor not found/);
});

test('rejects an incomplete existing domain export block', () => {
  assert.throws(() => transformDomain(
    domainSource(SECTION, 'export { buildTakeBackSub };')
  ), /export block is incomplete: showRankLossToast/);
});

test('requires a domain import after the local block is removed', () => {
  const extractedWithoutImport = `${IMPORT_ANCHOR}\n${NEXT_MARKER}\nfunction updateStartHook() {}\n`;
  assert.throws(() => analyzeBootstrapRankFeedbackCutover({
    bootstrapSource: extractedWithoutImport,
    domainSource: domainSource(SECTION, DOMAIN_EXPORT_BLOCK)
  }), /must import js\/game\/bootstrap\/rank-feedback\.js/);
});
