import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  START_MARKER,
  analyzeBootstrapProfileShareStaging
} from './check-bootstrap-profile-share-staging.mjs';

const DEFAULT_BOOTSTRAP_PATH = 'js/game/bootstrap.js';
const DEFAULT_DOMAIN_PATH = 'js/game/bootstrap/profile-share-setup.js';
const EXPORT_MARKER = '\nexport {';
const IMPORT_ANCHOR = "import { markGameRuntimeReady } from '../app-loading.js';";
const DOMAIN_IMPORT_STATEMENT = `import { ${EXPECTED_FUNCTIONS.join(', ')} } from './bootstrap/profile-share-setup.js';`;
const DOMAIN_EXPORT_BLOCK = `export {\n${EXPECTED_FUNCTIONS.map((name) => `  ${name}`).join(',\n')}\n};`;
const PRIVATE_PREAMBLE = `const ONBOARDING_GAME_OVER_RETRY_ATTEMPTS = 5;
const ONBOARDING_GAME_OVER_RETRY_DELAY_MS = 500;
let cachedProfile = null;
let profileCacheTimestamp = 0;
// Cache TTL: 30s balances freshness vs API calls. Invalidated explicitly after share or X connect.
const PROFILE_CACHE_TTL_MS = 30000;`;
const PRESERVED_SESSION_FLAGS = [
  'let _walletJustConnected = false;',
  'let _lastKnownWalletSession = false;'
];
const IMPORT_REWRITES = [
  {
    before: "import { isAuthenticated, loadAndDisplayLeaderboard, refreshPlayerStats, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI, fetchMyProfile } from '../api.js';",
    after: "import { isAuthenticated, loadAndDisplayLeaderboard, refreshPlayerStats, updateWalletUI, resetWalletPlayerUI, resetLeaderboardUI } from '../api.js';"
  },
  {
    before: "import { shouldShowFirstRunHint } from './onboarding-hints.js';\n",
    after: ''
  },
  {
    before: "import { initPlayerMenu, openPlayerMenu, isPlayerMenuOpen, refreshPlayerMenu } from '../features/player-menu/index.js';",
    after: "import { initPlayerMenu, openPlayerMenu } from '../features/player-menu/index.js';"
  }
];

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    bootstrapPath: readArg('bootstrap', DEFAULT_BOOTSTRAP_PATH),
    domainPath: readArg('domain', DEFAULT_DOMAIN_PATH)
  };
}

function applyRequiredRewrite(source, { before, after }) {
  if (!source.includes(before)) {
    throw new Error(`Expected bootstrap import not found: ${before}`);
  }
  return source.replace(before, after);
}

function assertPreservedSessionFlags(source) {
  for (const token of PRESERVED_SESSION_FLAGS) {
    if (!source.includes(token)) {
      throw new Error(`${DEFAULT_BOOTSTRAP_PATH} must preserve session flag: ${token}`);
    }
  }
}

function transformBootstrap(bootstrapSource) {
  let source = String(bootstrapSource || '').replace(/\r\n/g, '\n');
  const startIndex = source.indexOf(START_MARKER);

  if (startIndex < 0) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_BOOTSTRAP_PATH} has no profile/share section and no domain import`);
    }
    if (source.includes(PRIVATE_PREAMBLE)) {
      throw new Error(`${DEFAULT_BOOTSTRAP_PATH} still contains the profile/share private preamble after extraction`);
    }
    assertPreservedSessionFlags(source);
    return { changed: false, source };
  }

  const nextIndex = source.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) {
    throw new Error(`${DEFAULT_BOOTSTRAP_PATH} contains ${START_MARKER} but no ${NEXT_MARKER}`);
  }
  if (source.includes(DOMAIN_IMPORT)) {
    throw new Error(`${DEFAULT_BOOTSTRAP_PATH} has a partial profile/share extraction`);
  }
  if (!source.includes(PRIVATE_PREAMBLE)) {
    throw new Error(`${DEFAULT_BOOTSTRAP_PATH} is missing the exact profile/share private preamble`);
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(`Bootstrap profile/share import anchor not found: ${IMPORT_ANCHOR}`);
  }

  assertPreservedSessionFlags(source);
  for (const rewrite of IMPORT_REWRITES) {
    source = applyRequiredRewrite(source, rewrite);
  }
  source = source.replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`);
  source = source.replace(`${PRIVATE_PREAMBLE}\n`, '');

  const updatedStartIndex = source.indexOf(START_MARKER);
  const updatedNextIndex = source.indexOf(NEXT_MARKER, updatedStartIndex + START_MARKER.length);
  source = `${source.slice(0, updatedStartIndex)}${source.slice(updatedNextIndex)}`
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  assertPreservedSessionFlags(source);
  if (source.includes(PRIVATE_PREAMBLE)) {
    throw new Error(`${DEFAULT_BOOTSTRAP_PATH} retained the profile/share private preamble`);
  }

  return { changed: true, source: `${source}\n` };
}

function assertDomainExportBlock(source) {
  const exportIndex = source.lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) return false;
  const exportBlock = source.slice(exportIndex);
  for (const name of EXPECTED_FUNCTIONS) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DEFAULT_DOMAIN_PATH} export block is incomplete: ${name}`);
    }
  }
  return true;
}

function transformDomain(domainSource) {
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

function analyzeBootstrapProfileShareCutover({ bootstrapSource, domainSource }) {
  const before = analyzeBootstrapProfileShareStaging({ bootstrapSource, domainSource });
  const bootstrapResult = transformBootstrap(bootstrapSource);
  const domainResult = transformDomain(domainSource);

  if (before.state === 'extracted' && !bootstrapResult.changed && !domainResult.changed) {
    return {
      changed: false,
      bootstrapSource: bootstrapResult.source,
      domainSource: domainResult.source,
      before,
      after: before
    };
  }

  const after = analyzeBootstrapProfileShareStaging({
    bootstrapSource: bootstrapResult.source,
    domainSource: domainResult.source
  });
  if (after.state !== 'extracted') {
    throw new Error('Bootstrap profile/share cutover did not reach extracted state');
  }

  return {
    changed: bootstrapResult.changed || domainResult.changed,
    bootstrapSource: bootstrapResult.source,
    domainSource: domainResult.source,
    before,
    after
  };
}

function runBootstrapProfileShareCutover(options = parseArgs()) {
  for (const path of [options.bootstrapPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzeBootstrapProfileShareCutover({
    bootstrapSource: readFileSync(options.bootstrapPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Bootstrap profile/share setup is already extracted; pass --force or use --dry-run to accept a no-op');
  }
  if (result.changed && !options.dryRun) {
    writeFileSync(options.bootstrapPath, result.bootstrapSource);
    writeFileSync(options.domainPath, result.domainSource);
  }

  const report = {
    dryRun: options.dryRun,
    changed: result.changed,
    before: result.before.state,
    after: result.after.state,
    bootstrapLines: result.bootstrapSource.split('\n').length,
    domainLines: result.domainSource.split('\n').length
  };
  console.log('Bootstrap profile/share cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runBootstrapProfileShareCutover(parseArgs());
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_EXPORT_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_REWRITES,
  PRIVATE_PREAMBLE,
  PRESERVED_SESSION_FLAGS,
  analyzeBootstrapProfileShareCutover,
  transformBootstrap,
  transformDomain
};
