import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  DOMAIN_MARKER,
  analyzeApiAccountShareStaging
} from './check-api-account-share-staging.mjs';

const DEFAULT_API_PATH = 'js/api.js';
const DEFAULT_DOMAIN_PATH = 'js/api/account-share.js';
const EXPORT_MARKER = '\nexport {';
const DOMAIN_IMPORT_STATEMENT = "import { applyReferralCode, buildAuthHeaders, confirmShare, disconnectX, fetchCoinHistory, fetchMyProfile, getXOAuthAuthorizeUrl, handleUnauthorizedResponse, setLeaderboardDisplay, setNickname, startShare } from './api/account-share.js';";
const DOMAIN_EXPORT_BLOCK = `export {
  applyReferralCode,
  buildAuthHeaders,
  confirmShare,
  disconnectX,
  fetchCoinHistory,
  fetchMyProfile,
  getXOAuthAuthorizeUrl,
  handleUnauthorizedResponse,
  setLeaderboardDisplay,
  setNickname,
  startShare
};`;

const IMPORT_REWRITES = [
  {
    before: "import { request, requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ, REQUEST_PROFILE_AUTH_WRITE } from './request.js';",
    after: "import { request, requestJsonResult, REQUEST_PROFILE_LEADERBOARD_READ } from './request.js';"
  },
  {
    before: "import { isTelegramAuthMode, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getAuthStateSnapshot, isTelegramMiniApp } from './features/auth/index.js';",
    after: "import { isTelegramAuthMode, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getAuthStateSnapshot } from './features/auth/index.js';"
  },
  {
    before: "import { authState, markAuthExpired } from './auth-state.js';\n",
    after: ''
  },
  {
    before: "import { updateCachedBalance } from './balance-cache.js';\n",
    after: ''
  }
];

const DOMAIN_IMPORT_ANCHOR = "import { canPersistProgress, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './features/store/index.js';";

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    apiPath: readArg('api', DEFAULT_API_PATH),
    domainPath: readArg('domain', DEFAULT_DOMAIN_PATH)
  };
}

function applyRequiredRewrite(source, { before, after }) {
  if (!source.includes(before)) {
    throw new Error(`Expected API import not found: ${before}`);
  }
  return source.replace(before, after);
}

function transformApiFacade(apiSource) {
  let source = String(apiSource || '').replace(/\r\n/g, '\n');
  const startIndex = source.indexOf(DOMAIN_MARKER);

  if (startIndex < 0) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_API_PATH} has no staged section and no account/share domain import`);
    }
    return { changed: false, source };
  }

  const exportIndex = source.indexOf(EXPORT_MARKER, startIndex + DOMAIN_MARKER.length);
  if (exportIndex < 0) throw new Error(`${DEFAULT_API_PATH} staged section has no facade export block`);

  for (const rewrite of IMPORT_REWRITES) {
    source = applyRequiredRewrite(source, rewrite);
  }

  if (!source.includes(DOMAIN_IMPORT_ANCHOR)) {
    throw new Error(`API domain import anchor not found: ${DOMAIN_IMPORT_ANCHOR}`);
  }
  source = source.replace(DOMAIN_IMPORT_ANCHOR, `${DOMAIN_IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`);

  const updatedStartIndex = source.indexOf(DOMAIN_MARKER);
  const updatedExportIndex = source.indexOf(EXPORT_MARKER, updatedStartIndex + DOMAIN_MARKER.length);
  source = `${source.slice(0, updatedStartIndex)}${source.slice(updatedExportIndex)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return { changed: true, source: `${source}\n` };
}

function transformDomainModule(domainSource) {
  const source = String(domainSource || '').replace(/\r\n/g, '\n').trimEnd();
  if (!source.includes(DOMAIN_MARKER)) {
    throw new Error(`${DEFAULT_DOMAIN_PATH} must contain ${DOMAIN_MARKER}`);
  }

  if (source.includes(EXPORT_MARKER)) {
    for (const name of DOMAIN_EXPORT_BLOCK.match(/[A-Za-z][A-Za-z0-9]*/g) || []) {
      if (name === 'export') continue;
      if (!source.slice(source.lastIndexOf(EXPORT_MARKER)).includes(name)) {
        throw new Error(`${DEFAULT_DOMAIN_PATH} export block is incomplete: ${name}`);
      }
    }
    return { changed: false, source: `${source}\n` };
  }

  return {
    changed: true,
    source: `${source}\n\n${DOMAIN_EXPORT_BLOCK}\n`
  };
}

function analyzeApiAccountShareCutover({ apiSource, domainSource }) {
  const before = analyzeApiAccountShareStaging({ apiSource, domainSource });
  if (before.state === 'extracted') {
    return {
      changed: false,
      apiSource: String(apiSource || '').replace(/\r\n/g, '\n'),
      domainSource: String(domainSource || '').replace(/\r\n/g, '\n'),
      before,
      after: before
    };
  }

  const apiResult = transformApiFacade(apiSource);
  const domainResult = transformDomainModule(domainSource);
  const after = analyzeApiAccountShareStaging({
    apiSource: apiResult.source,
    domainSource: domainResult.source
  });

  if (after.state !== 'extracted') {
    throw new Error('Account/share API cutover did not reach extracted state');
  }

  return {
    changed: apiResult.changed || domainResult.changed,
    apiSource: apiResult.source,
    domainSource: domainResult.source,
    before,
    after
  };
}

function runApiAccountShareCutover(options = parseArgs()) {
  for (const path of [options.apiPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzeApiAccountShareCutover({
    apiSource: readFileSync(options.apiPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Account/share API is already extracted; pass --force or use --dry-run to accept a no-op');
  }

  if (result.changed && !options.dryRun) {
    writeFileSync(options.apiPath, result.apiSource);
    writeFileSync(options.domainPath, result.domainSource);
  }

  const report = {
    dryRun: options.dryRun,
    changed: result.changed,
    before: result.before.state,
    after: result.after.state,
    apiLines: result.apiSource.split('\n').length,
    domainLines: result.domainSource.split('\n').length
  };

  console.log('API account/share cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runApiAccountShareCutover(parseArgs());
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_REWRITES,
  analyzeApiAccountShareCutover,
  transformApiFacade,
  transformDomainModule
};
