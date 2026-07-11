import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_PATH = 'js/api.js';
const DOMAIN_PATH = 'js/api/account-share.js';
const DOMAIN_MARKER = '/* ===== NEW PROFILE & REFERRAL & SHARE & X API HELPERS ===== */';
const EXPORT_MARKER = '\nexport {';
const DOMAIN_IMPORT = "from './api/account-share.js'";
const EXPECTED_EXPORTS = [
  'applyReferralCode',
  'buildAuthHeaders',
  'confirmShare',
  'disconnectX',
  'fetchCoinHistory',
  'fetchMyProfile',
  'getXOAuthAuthorizeUrl',
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

function extractDomainSection(source, label) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(DOMAIN_MARKER);
  if (startIndex < 0) return null;

  const exportIndex = normalized.indexOf(EXPORT_MARKER, startIndex + DOMAIN_MARKER.length);
  if (exportIndex < 0) {
    throw new Error(`${label} contains ${DOMAIN_MARKER} but no export block`);
  }

  return normalized.slice(startIndex, exportIndex).trimEnd();
}

function assertExpectedExports(domainSource) {
  const exportIndex = String(domainSource || '').lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) throw new Error(`${DOMAIN_PATH} must include an export block`);
  const exportBlock = domainSource.slice(exportIndex);

  for (const name of EXPECTED_EXPORTS) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DOMAIN_PATH} must export ${name}`);
    }
  }
}

function analyzeApiAccountShareStaging({ apiSource, domainSource }) {
  const apiSection = extractDomainSection(apiSource, API_PATH);
  const domainSection = extractDomainSection(domainSource, DOMAIN_PATH);

  if (!domainSection) {
    throw new Error(`${DOMAIN_PATH} must contain ${DOMAIN_MARKER}`);
  }
  assertExpectedExports(domainSource);

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
  EXPECTED_EXPORTS,
  analyzeApiAccountShareStaging,
  extractDomainSection,
  normalizeSource
};
