import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BOOTSTRAP_PATH = 'js/game/bootstrap.js';
const DOMAIN_PATH = 'js/game/bootstrap/profile-share-setup.js';
const START_MARKER = 'function enforceTelegramWalletUiHidden() {';
const NEXT_MARKER = '// ===== RANK WATCHER =====';
const DOMAIN_IMPORT = "from './bootstrap/profile-share-setup.js'";
const EXPORT_MARKER = '\nexport {';
const EXPECTED_FUNCTIONS = [
  'enforceTelegramWalletUiHidden',
  'getCachedProfile',
  'invalidateProfileCache',
  'cancelGameOverOnboardingRetries',
  'refreshOnboardingAfterLeaderboardSaveSuccess',
  'updateGameOverShareButton',
  'updatePlayerAvatarVisibility',
  'checkXOAuthCallback',
  'syncFirstRunOnboardingUiState'
];

function normalizeSource(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBootstrapSection(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(START_MARKER);
  if (startIndex < 0) return null;
  const nextIndex = normalized.indexOf(NEXT_MARKER, startIndex + START_MARKER.length);
  if (nextIndex < 0) throw new Error(`${BOOTSTRAP_PATH} contains ${START_MARKER} but no ${NEXT_MARKER}`);
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
  if (exportIndex < 0) throw new Error(`${DOMAIN_PATH} must export profile/share setup helpers after extraction`);
  const exportBlock = domainSource.slice(exportIndex);
  for (const name of EXPECTED_FUNCTIONS) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DOMAIN_PATH} must export ${name}`);
    }
  }
}

function analyzeBootstrapProfileShareStaging({ bootstrapSource, domainSource }) {
  const bootstrapSection = extractBootstrapSection(bootstrapSource);
  const domainSection = extractDomainSection(domainSource);
  if (!domainSection) throw new Error(`${DOMAIN_PATH} must contain ${START_MARKER}`);
  assertFunctionInventory(domainSection);

  const hasDomainImport = String(bootstrapSource || '').includes(DOMAIN_IMPORT);
  const hasDomainExports = String(domainSource || '').includes(EXPORT_MARKER);

  if (!bootstrapSection) {
    if (!hasDomainImport) {
      throw new Error(`${BOOTSTRAP_PATH} must import ${DOMAIN_PATH} after profile/share setup extraction`);
    }
    assertExtractedExports(domainSource);
    return { state: 'extracted', hasDomainImport: true };
  }

  if (hasDomainImport || hasDomainExports) {
    throw new Error(`${BOOTSTRAP_PATH} has a partial profile/share setup extraction`);
  }
  if (normalizeSource(bootstrapSection) !== normalizeSource(domainSection)) {
    throw new Error(`${DOMAIN_PATH} must match profile/share setup in ${BOOTSTRAP_PATH}`);
  }

  return {
    state: 'staged-duplicate',
    hasDomainImport: false,
    lines: domainSection.split('\n').length
  };
}

function runBootstrapProfileShareStagingCheck() {
  const result = analyzeBootstrapProfileShareStaging({
    bootstrapSource: readFileSync(BOOTSTRAP_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Bootstrap profile/share staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runBootstrapProfileShareStagingCheck();
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
  analyzeBootstrapProfileShareStaging
};
