import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_PATH = 'js/api.js';
const DOMAIN_PATH = 'js/api/leaderboard-display.js';
const START_MARKER = 'function buildBackendApiUrl(pathname) {';
const NEXT_MARKER = 'async function saveResultToLeaderboard(options = {}) {';
const DOMAIN_IMPORT = "from './api/leaderboard-display.js'";
const EXPORT_MARKER = '\nexport {';
const EXPECTED_FUNCTIONS = [
  'buildBackendApiUrl',
  'loadAndDisplayLeaderboard'
];
const REQUIRED_EXPORTS = [
  'loadAndDisplayLeaderboard'
];

function normalizeSource(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBoundedSection(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(START_MARKER);
  if (startIndex < 0) return null;
  const nextIndex = normalized.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) throw new Error(`${API_PATH} contains ${START_MARKER} but no ${NEXT_MARKER}`);
  return normalized.slice(startIndex, nextIndex).trimEnd();
}

function extractDomainSection(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(START_MARKER);
  if (startIndex < 0) return null;
  const exportIndex = normalized.indexOf(EXPORT_MARKER, startIndex + START_MARKER.length);
  return normalized.slice(startIndex, exportIndex < 0 ? normalized.length : exportIndex).trimEnd();
}

function assertFunctionInventory(domainSection) {
  for (const name of EXPECTED_FUNCTIONS) {
    if (!new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).test(domainSection)) {
      throw new Error(`${DOMAIN_PATH} must define ${name}`);
    }
  }
}

function assertExtractedExports(domainSource) {
  const exportIndex = String(domainSource || '').lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) throw new Error(`${DOMAIN_PATH} must export leaderboard display helpers after extraction`);
  const exportBlock = domainSource.slice(exportIndex);
  for (const name of REQUIRED_EXPORTS) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DOMAIN_PATH} must export ${name}`);
    }
  }
}

function analyzeApiLeaderboardDisplayStaging({ apiSource, domainSource }) {
  const apiSection = extractBoundedSection(apiSource);
  const domainSection = extractDomainSection(domainSource);
  if (!domainSection) throw new Error(`${DOMAIN_PATH} must contain ${START_MARKER}`);
  assertFunctionInventory(domainSection);

  const hasDomainImport = String(apiSource || '').includes(DOMAIN_IMPORT);
  const hasDomainExports = String(domainSource || '').includes(EXPORT_MARKER);

  if (!apiSection) {
    if (!hasDomainImport) {
      throw new Error(`${API_PATH} must import ${DOMAIN_PATH} after leaderboard display extraction`);
    }
    assertExtractedExports(domainSource);
    return { state: 'extracted', hasDomainImport: true };
  }

  if (hasDomainImport || hasDomainExports) {
    throw new Error(`${API_PATH} has a partial leaderboard display extraction`);
  }
  if (normalizeSource(apiSection) !== normalizeSource(domainSection)) {
    throw new Error(`${DOMAIN_PATH} must match leaderboard display ownership in ${API_PATH}`);
  }

  return {
    state: 'staged-duplicate',
    hasDomainImport: false,
    lines: domainSection.split('\n').length
  };
}

function runApiLeaderboardDisplayStagingCheck() {
  const result = analyzeApiLeaderboardDisplayStaging({
    apiSource: readFileSync(API_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('API leaderboard display staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runApiLeaderboardDisplayStagingCheck();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  START_MARKER,
  analyzeApiLeaderboardDisplayStaging
};
