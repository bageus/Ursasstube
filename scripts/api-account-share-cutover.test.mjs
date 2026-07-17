import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DOMAIN_MARKER, EXPECTED_FUNCTIONS } from './check-api-account-share-staging.mjs';
import {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_PUBLIC_NAMES,
  DOMAIN_REEXPORT_STATEMENT,
  IMPORT_REWRITES,
  analyzeApiAccountShareCutover,
  removeDomainNamesFromFacadeExport,
  transformApiFacade,
  transformDomainModule
} from './cutover-api-account-share.mjs';

const REQUEST_IMPORT = "import { request, requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_AUTH_WRITE } from './request.js';";
const AUTH_IMPORT = "import { isTelegramAuthMode, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getAuthStateSnapshot, isTelegramMiniApp } from './features/auth/index.js';";
const AUTH_STATE_IMPORT = "import { authState, markAuthExpired } from './auth-state.js';";
const STORE_IMPORT = "import { canPersistProgress, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './features/store/index.js';";
const BALANCE_IMPORT = "import { updateCachedBalance } from './balance-cache.js';";

function declaration(name) {
  const asyncPrefix = ['buildAuthHeaders', 'handleUnauthorizedResponse'].includes(name) ? '' : 'async ';
  return `${asyncPrefix}function ${name}() {\n  return '${name}';\n}`;
}

function stagedSection() {
  return `${DOMAIN_MARKER}\n${EXPECTED_FUNCTIONS.map(declaration).join('\n\n')}`;
}

function facadeExportBlock() {
  return `export {\n  localFacade,\n${DOMAIN_PUBLIC_NAMES.map((name) => `  ${name},`).join('\n')}\n};`;
}

function apiSource(section = stagedSection()) {
  return `${REQUEST_IMPORT}\n${AUTH_IMPORT}\n${AUTH_STATE_IMPORT}\n${STORE_IMPORT}\n${BALANCE_IMPORT}\n\nfunction localFacade() { return true; }\n\n${section}\n\n${facadeExportBlock()}\n`;
}

function domainSource(section = stagedSection(), exportBlock = '') {
  return `import { dependency } from '../fixture.js';\n\n${section}${exportBlock ? `\n\n${exportBlock}` : ''}\n`;
}

test('cuts over the staged account/share API atomically', () => {
  assert.equal(IMPORT_REWRITES.length, 4);
  assert.equal(transformApiFacade(apiSource()).changed, true);
  assert.equal(transformDomainModule(domainSource()).changed, true);

  const result = analyzeApiAccountShareCutover({
    apiSource: apiSource(),
    domainSource: domainSource()
  });

  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-duplicate');
  assert.equal(result.after.state, 'extracted');
  assert.equal(result.apiSource.includes(DOMAIN_MARKER), false);
  assert.equal(result.apiSource.includes(DOMAIN_REEXPORT_STATEMENT), true);
  assert.equal(result.apiSource.includes(REQUEST_IMPORT), false);
  assert.equal(result.apiSource.includes(AUTH_STATE_IMPORT), false);
  assert.equal(result.apiSource.includes(BALANCE_IMPORT), false);
  assert.equal(result.domainSource.includes(DOMAIN_EXPORT_BLOCK), true);
});

test('uses a direct ESM re-export instead of facade-only imports', () => {
  const result = analyzeApiAccountShareCutover({
    apiSource: apiSource(),
    domainSource: domainSource()
  });
  assert.ok(result.apiSource.includes(`} from './api/account-share.js';`));
  assert.equal(result.apiSource.includes("import { applyReferralCode"), false);

  const localExport = result.apiSource.slice(result.apiSource.lastIndexOf('\nexport {'));
  assert.ok(localExport.includes('localFacade'));
  for (const name of DOMAIN_PUBLIC_NAMES) {
    assert.equal(new RegExp(`^\\s*${name},?\\s*$`, 'm').test(localExport), false);
  }
});

test('requires every staged public name in the facade export block', () => {
  const incomplete = apiSource().replace('  startShare,\n', '');
  assert.throws(() => transformApiFacade(incomplete), /missing staged domain export: startShare/);
});

test('removes only domain names from the local facade export block', () => {
  const source = `function localFacade() {}\n${facadeExportBlock()}\n`;
  const result = removeDomainNamesFromFacadeExport(source);
  assert.ok(result.includes('localFacade'));
  for (const name of DOMAIN_PUBLIC_NAMES) {
    assert.equal(new RegExp(`^\\s*${name},?\\s*$`, 'm').test(result), false);
  }
});

test('accepts an already extracted no-op', () => {
  const first = analyzeApiAccountShareCutover({
    apiSource: apiSource(),
    domainSource: domainSource()
  });
  const second = analyzeApiAccountShareCutover({
    apiSource: first.apiSource,
    domainSource: first.domainSource
  });

  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects staged parity drift before changing files', () => {
  assert.throws(() => analyzeApiAccountShareCutover({
    apiSource: apiSource(),
    domainSource: domainSource(stagedSection().replace("return 'fetchMyProfile'", "return 'changed'"))
  }), /must match the account\/share section/);
});

test('rejects an unexpected API import layout', () => {
  assert.throws(() => analyzeApiAccountShareCutover({
    apiSource: apiSource().replace(REQUEST_IMPORT, "import { request } from './request.js';"),
    domainSource: domainSource()
  }), /Expected API import not found/);
});
