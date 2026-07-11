import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  DOMAIN_MARKER,
  EXPECTED_FUNCTIONS,
  analyzeApiAccountShareStaging
} from './check-api-account-share-staging.mjs';

function functionSource(name) {
  return `${name === 'buildAuthHeaders' ? '' : 'async '}function ${name}() {\n  return '${name}';\n}`;
}

function section(names = EXPECTED_FUNCTIONS) {
  return `${DOMAIN_MARKER}\n${names.map(functionSource).join('\n\n')}`;
}

function apiSource(domainSection = section()) {
  return `${domainSection}\n\nexport { buildAuthHeaders, fetchMyProfile };\n`;
}

function domainSource(domainSection = section()) {
  return `import { value } from '../fixture.js';\n\n${domainSection}\n`;
}

test('accepts a matching staged account/share duplicate', () => {
  const result = analyzeApiAccountShareStaging({
    apiSource: apiSource(),
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
    apiSource: apiSource(),
    domainSource: domainSource(section().replace("return 'fetchMyProfile'", "return 'changed'"))
  }), /must match the account\/share section/);
});

test('rejects extraction without the facade import', () => {
  assert.throws(() => analyzeApiAccountShareStaging({
    apiSource: 'export const untouched = true;\n',
    domainSource: domainSource()
  }), /must import js\/api\/account-share\.js/);
});

test('requires the complete staged function inventory', () => {
  assert.throws(() => analyzeApiAccountShareStaging({
    apiSource: apiSource(),
    domainSource: domainSource(section(EXPECTED_FUNCTIONS.filter((name) => name !== 'startShare')))
  }), /must declare startShare/);
});
