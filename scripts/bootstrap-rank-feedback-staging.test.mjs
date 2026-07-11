import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  NEXT_MARKER,
  START_MARKER,
  analyzeBootstrapRankFeedbackStaging
} from './check-bootstrap-rank-feedback-staging.mjs';

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

function bootstrapSource(section = SECTION, importLine = '') {
  return `${importLine}${importLine ? '\n' : ''}${section}\n\n${NEXT_MARKER}\nfunction updateStartHook() {}`;
}

function domainSource(section = SECTION, exportBlock = '') {
  return `import { dependency } from '../../fixture.js';\n\n${section}${exportBlock ? `\n\n${exportBlock}` : ''}\n`;
}

const EXPORT_BLOCK = `export {
  buildTakeBackSub,
  showRankLossToast
};`;

test('accepts a matching private staged duplicate', () => {
  const result = analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource()
  });
  assert.equal(result.state, 'staged-duplicate');
  assert.equal(result.hasDomainImport, false);
});

test('accepts the extracted rank feedback state', () => {
  const result = analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: `${DOMAIN_IMPORT};\n${NEXT_MARKER}\nfunction updateStartHook() {}`,
    domainSource: domainSource(SECTION, EXPORT_BLOCK)
  });
  assert.deepEqual(result, { state: 'extracted', hasDomainImport: true });
});

test('rejects staged rank feedback drift', () => {
  assert.throws(() => analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource(SECTION.replace("'take-back'", "'changed'"))
  }), /must match the rank watcher section/);
});

test('rejects a partial extraction with import and local block', () => {
  assert.throws(() => analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: bootstrapSource(SECTION, DOMAIN_IMPORT),
    domainSource: domainSource()
  }), /partial rank feedback extraction/);
});

test('keeps the staged module private before cutover', () => {
  assert.throws(() => analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource(SECTION, EXPORT_BLOCK)
  }), /must remain private/);
});

test('requires the complete rank feedback function inventory', () => {
  assert.throws(() => analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: bootstrapSource(),
    domainSource: domainSource(SECTION.replace(/function isValidDelta[\s\S]*?\n}/, ''))
  }), /must define isValidDelta/);
});
