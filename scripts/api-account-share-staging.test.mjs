import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  DOMAIN_MARKER,
  EXPECTED_EXPORTS,
  analyzeApiAccountShareStaging
} from './check-api-account-share-staging.mjs';

const SECTION = `${DOMAIN_MARKER}
function buildAuthHeaders() {
  return { 'Content-Type': 'application/json' };
}

async function fetchMyProfile() {
  return null;
}`;

function exportBlock(names = EXPECTED_EXPORTS) {
  return `export {\n  ${names.join(',\n  ')}\n};\n`;
}

function domainSource(section = SECTION, names = EXPECTED_EXPORTS) {
  return `import { value } from '../fixture.js';\n\n${section}\n\n${exportBlock(names)}`;
}

test('accepts a matching staged account/share duplicate', () => {
  const result = analyzeApiAccountShareStaging({
    apiSource: `${SECTION}\n\nexport { buildAuthHeaders, fetchMyProfile };\n`,
    domainSource: domainSource()
  });

  assert.equal(result.state, 'staged-duplicate');
  assert.equal(result.hasDomainImport, false);
});

test('accepts the extracted facade state', () => {
  const result = analyzeApiAccountShareStaging({
    apiSource: `import { fetchMyProfile } ${DOMAIN_IMPORT};\nexport { fetchMyProfile };\n`,
    domainSource: domainSource()
  });

  assert.deepEqual(result, { state: 'extracted', hasDomainImport: true });
});

test('rejects staged domain drift', () => {
  assert.throws(() => analyzeApiAccountShareStaging({
    apiSource: `${SECTION}\n\nexport { buildAuthHeaders, fetchMyProfile };\n`,
    domainSource: domainSource(SECTION.replace('return null', 'return {}'))
  }), /must match the account\/share section/);
});

test('rejects extraction without the facade import', () => {
  assert.throws(() => analyzeApiAccountShareStaging({
    apiSource: 'export const untouched = true;\n',
    domainSource: domainSource()
  }), /must import js\/api\/account-share\.js/);
});

test('requires the complete facade export inventory', () => {
  assert.throws(() => analyzeApiAccountShareStaging({
    apiSource: `${SECTION}\n\nexport { buildAuthHeaders, fetchMyProfile };\n`,
    domainSource: domainSource(SECTION, EXPECTED_EXPORTS.filter((name) => name !== 'startShare'))
  }), /must export startShare/);
});
