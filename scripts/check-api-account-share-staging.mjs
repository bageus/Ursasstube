import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_PATH = 'js/api.js';
const DOMAIN_PATH = 'js/api/account-share.js';
const DOMAIN_MARKER = '/* ===== NEW PROFILE & REFERRAL & SHARE & X API HELPERS ===== */';
const EXPORT_MARKER = '\nexport {';
const DOMAIN_IMPORT = "from './api/account-share.js'";
const EXPECTED_FUNCTIONS = [
  'applyReferralCode',
  'buildAuthHeaders',
  'confirmShare',
  'disconnectX',
  'fetchCoinHistory',
  'fetchMyProfile',
  'getXOAuthAuthorizeUrl',
  'getXStatus',
  'handleUnauthorizedResponse',
  'setLeaderboardDisplay',
  'setNickname',
  'startShare'
];

function normalizeSource(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomainSection(source, label, { toEnd = false } = {}) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(DOMAIN_MARKER);
  if (startIndex < 0) return null;

  if (toEnd) return normalized.slice(startIndex).trimEnd();

  const exportIndex = normalized.indexOf(EXPORT_MARKER, startIndex + DOMAIN_MARKER.length);
  if (exportIndex < 0) {
    throw new Error(`${label} contains ${DOMAIN_MARKER} but no facade export block`);
  }

  return normalized.slice(startIndex, exportIndex).trimEnd();
}

function assertExpectedFunctions(domainSection) {
  for (const name of EXPECTED_FUNCTIONS) {
    const declarationPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
    if (!declarationPattern.test(domainSection)) {
      throw new Error(`${DOMAIN_PATH} must declare ${name}`);
    }
  }
}

function analyzeApiAccountShareStaging({ apiSource, domainSource }) {
  const apiSection = extractDomainSection(apiSource, API_PATH);
  const domainSection = extractDomainSection(domainSource, DOMAIN_PATH, { toEnd: true });

  if (!domainSection) {
    throw new Error(`${DOMAIN_PATH} must contain ${DOMAIN_MARKER}`);
  }
  assertExpectedFunctions(domainSection);

  const hasDomainImport = String(apiSource || '').includes(DOMAIN_IMPORT);
  if (!apiSection) {
    if (!hasDomainImport) {
      throw new Error(`${API_PATH} must import ${DOMAIN_PATH} after account/share extraction`);
    }
    return { state: 'extracted', hasDomainImport: true };
  }

  if (hasDomainImport) {
    throw new Error(`${API_PATH} must not import ${DOMAIN_PATH} while the staged duplicate remains`);
  }

  if (normalizeSource(apiSection) !== normalizeSource(domainSection)) {
    throw new Error(`${DOMAIN_PATH} must match the account/share section in ${API_PATH} before extraction`);
  }

  return {
    state: 'staged-duplicate',
    hasDomainImport: false,
    lines: domainSection.split('\n').length
  };
}

function runApiAccountShareStagingCheck({ apiPath = API_PATH, domainPath = DOMAIN_PATH } = {}) {
  const result = analyzeApiAccountShareStaging({
    apiSource: readFileSync(apiPath, 'utf8'),
    domainSource: readFileSync(domainPath, 'utf8')
  });

  console.log('API account/share staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runApiAccountShareStagingCheck();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_IMPORT,
  DOMAIN_MARKER,
  EXPECTED_FUNCTIONS,
  analyzeApiAccountShareStaging
};
