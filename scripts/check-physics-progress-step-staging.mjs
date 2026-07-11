import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHYSICS_PATH = 'js/physics.js';
const DOMAIN_PATH = 'js/physics/progress-step.js';
const DOMAIN_IMPORT = "from './physics/progress-step.js'";
const INLINE_START = '  const speedLevel = Math.floor(gameState.distance / CONFIG.SPEED_INCREMENT_INTERVAL);';
const INLINE_END = '  const adaptiveProfile = getAdaptiveDifficultyProfile';
const CALL_MARKER = 'calculateProgressStep({';
const REQUIRED_DOMAIN_TOKENS = [
  'function calculateProgressStep',
  'const speedLevel = Math.floor(distance / speedIncrementInterval);',
  'distance >= speedIncrementBoostDistance',
  'speed * METERS_PER_SECOND_MULT * delta',
  'speed / speedStart',
  'invertActive && invertScoreMultiplier > 1',
  'scoreDelta: metersDelta * pointsPerMeter',
  'export {',
  'calculateProgressStep'
];

function extractInlineProgressBlock(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const startIndex = normalized.indexOf(INLINE_START);
  if (startIndex < 0) return null;
  const endIndex = normalized.indexOf(INLINE_END, startIndex + INLINE_START.length);
  if (endIndex < 0) throw new Error(`${PHYSICS_PATH} has the progress start anchor but no adaptive-profile end anchor`);
  return normalized.slice(startIndex, endIndex).trimEnd();
}

function assertDomainContract(domainSource) {
  const source = String(domainSource || '');
  for (const token of REQUIRED_DOMAIN_TOKENS) {
    if (!source.includes(token)) {
      throw new Error(`${DOMAIN_PATH} is missing required progress contract token: ${token}`);
    }
  }
}

function analyzePhysicsProgressStepStaging({ physicsSource, domainSource }) {
  assertDomainContract(domainSource);

  const inlineBlock = extractInlineProgressBlock(physicsSource);
  const hasDomainImport = String(physicsSource || '').includes(DOMAIN_IMPORT);
  const hasDomainCall = String(physicsSource || '').includes(CALL_MARKER);

  if (inlineBlock) {
    if (hasDomainImport || hasDomainCall) {
      throw new Error(`${PHYSICS_PATH} has a partial progress-step extraction`);
    }
    return {
      state: 'staged-inline',
      hasDomainImport: false,
      inlineLines: inlineBlock.split('\n').length
    };
  }

  if (!hasDomainImport) {
    throw new Error(`${PHYSICS_PATH} must import ${DOMAIN_PATH} after progress-step extraction`);
  }
  if (!hasDomainCall) {
    throw new Error(`${PHYSICS_PATH} must call calculateProgressStep after removing the inline calculation`);
  }

  return {
    state: 'extracted',
    hasDomainImport: true
  };
}

function runPhysicsProgressStepStagingCheck() {
  const result = analyzePhysicsProgressStepStaging({
    physicsSource: readFileSync(PHYSICS_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Physics progress step staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPhysicsProgressStepStagingCheck();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  CALL_MARKER,
  DOMAIN_IMPORT,
  INLINE_END,
  INLINE_START,
  analyzePhysicsProgressStepStaging,
  extractInlineProgressBlock
};
