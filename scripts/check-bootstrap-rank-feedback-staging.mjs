import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BOOTSTRAP_PATH = 'js/game/bootstrap.js';
const DOMAIN_PATH = 'js/game/bootstrap/rank-feedback.js';
const START_MARKER = '// ===== RANK WATCHER =====';
const NEXT_MARKER = '// ===== START HOOK =====';
const DOMAIN_IMPORT = "from './bootstrap/rank-feedback.js'";
const EXPORT_MARKER = '\nexport {';
const EXPECTED_FUNCTIONS = [
  'getRankToastSessionKey',
  'isValidDelta',
  'buildTakeBackSub',
  'showRankLossToast'
];
const REQUIRED_EXPORTS = [
  'buildTakeBackSub',
  'showRankLossToast'
];

function normalizeSource(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBoundedSection(source, startMarker = START_MARKER, nextMarker = NEXT_MARKER) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(startMarker);
  if (startIndex < 0) return null;
  const nextIndex = normalized.indexOf(nextMarker, startIndex + startMarker.length);
  if (nextIndex < 0) throw new Error(`Found ${startMarker} but no following ${nextMarker}`);
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
    if (!new RegExp(`\\bfunction\\s+${name}\\b`).test(domainSection)) {
      throw new Error(`${DOMAIN_PATH} must define ${name}`);
    }
  }
}

function assertExtractedExports(domainSource) {
  const exportIndex = String(domainSource || '').lastIndexOf(EXPORT_MARKER);
  if (exportIndex < 0) throw new Error(`${DOMAIN_PATH} must export rank feedback helpers after extraction`);
  const exportBlock = domainSource.slice(exportIndex);
  for (const name of REQUIRED_EXPORTS) {
    if (!new RegExp(`\\b${name}\\b`).test(exportBlock)) {
      throw new Error(`${DOMAIN_PATH} must export ${name}`);
    }
  }
}

function analyzeBootstrapRankFeedbackStaging({ bootstrapSource, domainSource }) {
  const bootstrapSection = extractBoundedSection(bootstrapSource);
  const domainSection = extractDomainSection(domainSource);
  if (!domainSection) throw new Error(`${DOMAIN_PATH} must contain ${START_MARKER}`);
  assertFunctionInventory(domainSection);

  const hasDomainImport = String(bootstrapSource || '').includes(DOMAIN_IMPORT);
  const hasDomainExports = String(domainSource || '').includes(EXPORT_MARKER);

  if (!bootstrapSection) {
    if (!hasDomainImport) {
      throw new Error(`${BOOTSTRAP_PATH} must import ${DOMAIN_PATH} after rank feedback extraction`);
    }
    assertExtractedExports(domainSource);
    return { state: 'extracted', hasDomainImport: true };
  }

  if (hasDomainImport) {
    throw new Error(`${BOOTSTRAP_PATH} has a partial rank feedback extraction`);
  }
  if (hasDomainExports) {
    throw new Error(`${DOMAIN_PATH} must remain private while the staged duplicate exists`);
  }
  if (normalizeSource(bootstrapSection) !== normalizeSource(domainSection)) {
    throw new Error(`${DOMAIN_PATH} must match the rank watcher section in ${BOOTSTRAP_PATH}`);
  }

  return {
    state: 'staged-duplicate',
    hasDomainImport: false,
    lines: domainSection.split('\n').length
  };
}

function runBootstrapRankFeedbackStagingCheck() {
  const result = analyzeBootstrapRankFeedbackStaging({
    bootstrapSource: readFileSync(BOOTSTRAP_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Bootstrap rank feedback staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runBootstrapRankFeedbackStagingCheck();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DOMAIN_IMPORT,
  EXPECTED_FUNCTIONS,
  NEXT_MARKER,
  REQUIRED_EXPORTS,
  START_MARKER,
  analyzeBootstrapRankFeedbackStaging
};
