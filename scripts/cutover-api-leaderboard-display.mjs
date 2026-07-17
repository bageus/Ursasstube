import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  NEXT_MARKER,
  START_MARKER,
  analyzeApiLeaderboardDisplayStaging
} from './check-api-leaderboard-display-staging.mjs';

const DEFAULT_API_PATH = 'js/api.js';
const DEFAULT_DOMAIN_PATH = 'js/api/leaderboard-display.js';
const EXPORT_MARKER = '\nexport {';
const DOMAIN_IMPORT_ANCHOR = "import { canPersistProgress, isEligibleForLeaderboardFlow, isUnauthRuntimeMode } from './features/store/index.js';";
const DOMAIN_IMPORT_STATEMENT = "import { loadAndDisplayLeaderboard } from './api/leaderboard-display.js';";
const DOMAIN_EXPORT_BLOCK = `export {
  loadAndDisplayLeaderboard
};`;
const IMPORT_REWRITES = [
  {
    before: "import { BACKEND_URL, buildBackendUrl } from './config.js';",
    after: "import { BACKEND_URL } from './config.js';"
  },
  {
    before: "import { showBonusText, showLeaderboardSkeletons, displayLeaderboard, updateGameOverLeaderboardNotice, setGameOverPrompt } from './ui.js';",
    after: "import { showBonusText, updateGameOverLeaderboardNotice, setGameOverPrompt } from './ui.js';"
  },
  {
    before: "import { validatePlayerInsights, getRankBucket } from './game/leaderboard-insights.js';\n",
    after: ''
  },
  {
    before: "import { isTelegramAuthMode, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier, getAuthStateSnapshot } from './features/auth/index.js';",
    after: "import { isTelegramAuthMode, hasAuthenticatedSession, getPrimaryAuthIdentifier, getSigningWalletAddress as getSigningWalletAddressFromAuth, getTelegramAuthIdentifier } from './features/auth/index.js';"
  }
];

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
  const startIndex = source.indexOf(START_MARKER);

  if (startIndex < 0) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_API_PATH} has no leaderboard display section and no domain import`);
    }
    return { changed: false, source };
  }

  const nextIndex = source.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) {
    throw new Error(`${DEFAULT_API_PATH} contains ${START_MARKER} but no ${NEXT_MARKER}`);
  }
  if (source.includes(DOMAIN_IMPORT)) {
    throw new Error(`${DEFAULT_API_PATH} has a partial leaderboard display extraction`);
  }
  if (!source.includes(DOMAIN_IMPORT_ANCHOR)) {
    throw new Error(`API leaderboard display import anchor not found: ${DOMAIN_IMPORT_ANCHOR}`);
  }

  for (const rewrite of IMPORT_REWRITES) {
    source = applyRequiredRewrite(source, rewrite);
  }
  source = source.replace(DOMAIN_IMPORT_ANCHOR, `${DOMAIN_IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`);

  const updatedStartIndex = source.indexOf(START_MARKER);
  const updatedNextIndex = source.indexOf(NEXT_MARKER, updatedStartIndex + START_MARKER.length);
  source = `${source.slice(0, updatedStartIndex)}${source.slice(updatedNextIndex)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return { changed: true, source: `${source}\n` };
}

function assertDomainExportBlock(source) {
  const exportIndex = source.lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) return false;
  const exportBlock = source.slice(exportIndex);
  if (!/\bloadAndDisplayLeaderboard\b/.test(exportBlock)) {
    throw new Error(`${DEFAULT_DOMAIN_PATH} export block is incomplete: loadAndDisplayLeaderboard`);
  }
  return true;
}

function transformDomainModule(domainSource) {
  const source = String(domainSource || '').replace(/\r\n/g, '\n').trimEnd();
  if (!source.includes(START_MARKER)) {
    throw new Error(`${DEFAULT_DOMAIN_PATH} must contain ${START_MARKER}`);
  }
  if (assertDomainExportBlock(source)) {
    return { changed: false, source: `${source}\n` };
  }
  return {
    changed: true,
    source: `${source}\n\n${DOMAIN_EXPORT_BLOCK}\n`
  };
}

function analyzeApiLeaderboardDisplayCutover({ apiSource, domainSource }) {
  const before = analyzeApiLeaderboardDisplayStaging({ apiSource, domainSource });
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
  const after = analyzeApiLeaderboardDisplayStaging({
    apiSource: apiResult.source,
    domainSource: domainResult.source
  });

  if (after.state !== 'extracted') {
    throw new Error('Leaderboard display API cutover did not reach extracted state');
  }

  return {
    changed: apiResult.changed || domainResult.changed,
    apiSource: apiResult.source,
    domainSource: domainResult.source,
    before,
    after
  };
}

function runApiLeaderboardDisplayCutover(options = parseArgs()) {
  for (const path of [options.apiPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzeApiLeaderboardDisplayCutover({
    apiSource: readFileSync(options.apiPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Leaderboard display API is already extracted; pass --force or use --dry-run to accept a no-op');
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
  console.log('API leaderboard display cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runApiLeaderboardDisplayCutover(parseArgs());
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_REWRITES,
  analyzeApiLeaderboardDisplayCutover,
  transformApiFacade,
  transformDomainModule
};
