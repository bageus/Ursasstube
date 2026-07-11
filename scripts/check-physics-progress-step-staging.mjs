import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHYSICS_PATH = 'js/physics.js';
const DOMAIN_PATH = 'js/physics/progress-step.js';
const DOMAIN_IMPORT = "from './physics/progress-step.js'";
const CALL_MARKER = 'const progressStep = calculateProgressStep({';
const LEGACY_SPEED_BLOCK = `  const speedLevel = Math.floor(gameState.distance / CONFIG.SPEED_INCREMENT_INTERVAL);
  const speedIncrementMultiplier = gameState.distance >= CONFIG.SPEED_INCREMENT_BOOST_DISTANCE
    ? CONFIG.SPEED_INCREMENT_BOOST_MULTIPLIER
    : 1;
  gameState.speed = Math.min(
    CONFIG.SPEED_START + speedLevel * CONFIG.SPEED_INCREMENT * speedIncrementMultiplier,
    CONFIG.SPEED_MAX
  );`;
const LEGACY_DISTANCE_BLOCK = `  const METERS_PER_SECOND_MULT = 300;
  const metersDelta = gameState.speed * METERS_PER_SECOND_MULT * delta;
  gameState.distance += metersDelta;`;
const LEGACY_SCORE_BLOCK = `  const basePointsPerMeter = 1;
  const speedFactor = gameState.speed / CONFIG.SPEED_START;
  let pointsPerMeter = basePointsPerMeter * speedFactor;
  if (player.invertActive && gameState.invertScoreMultiplier > 1) {
    pointsPerMeter *= gameState.invertScoreMultiplier;
  }
  gameState.score += metersDelta * pointsPerMeter;`;
const LEGACY_DISTANCE_USAGE = 'gameState.distance - metersDelta';
const EXTRACTED_DISTANCE_USAGE = 'gameState.distance - progressStep.metersDelta';
const LEGACY_BLOCKS = Object.freeze({
  speed: LEGACY_SPEED_BLOCK,
  distance: LEGACY_DISTANCE_BLOCK,
  score: LEGACY_SCORE_BLOCK
});
const EXTRACTED_TOKENS = [
  CALL_MARKER,
  'gameState.speed = progressStep.speed;',
  'gameState.distance += progressStep.metersDelta;',
  'gameState.score += progressStep.scoreDelta;',
  EXTRACTED_DISTANCE_USAGE
];
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

function normalizeSource(source) {
  return String(source || '').replace(/\r\n/g, '\n');
}

function inspectLegacyProgressBlocks(source) {
  const normalized = normalizeSource(source);
  return Object.fromEntries(
    Object.entries(LEGACY_BLOCKS).map(([name, block]) => [name, normalized.includes(block)])
  );
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

  const source = normalizeSource(physicsSource);
  const legacyBlocks = inspectLegacyProgressBlocks(source);
  const legacyCount = Object.values(legacyBlocks).filter(Boolean).length;
  const hasLegacyDistanceUsage = source.includes(LEGACY_DISTANCE_USAGE);
  const hasDomainImport = source.includes(DOMAIN_IMPORT);
  const extractedTokens = Object.fromEntries(
    EXTRACTED_TOKENS.map((token) => [token, source.includes(token)])
  );
  const extractedCount = Object.values(extractedTokens).filter(Boolean).length;

  if (legacyCount > 0 && legacyCount < Object.keys(LEGACY_BLOCKS).length) {
    throw new Error(`${PHYSICS_PATH} has a partial legacy progress calculation: ${JSON.stringify(legacyBlocks)}`);
  }

  if (legacyCount === Object.keys(LEGACY_BLOCKS).length) {
    if (!hasLegacyDistanceUsage) {
      throw new Error(`${PHYSICS_PATH} is missing the legacy metersDelta distance-threshold usage`);
    }
    if (hasDomainImport || extractedCount > 0) {
      throw new Error(`${PHYSICS_PATH} has a partial progress-step extraction`);
    }
    return {
      state: 'staged-inline',
      hasDomainImport: false,
      legacyBlocks,
      hasLegacyDistanceUsage: true
    };
  }

  if (hasLegacyDistanceUsage) {
    throw new Error(`${PHYSICS_PATH} still references metersDelta after progress-step extraction`);
  }
  if (!hasDomainImport) {
    throw new Error(`${PHYSICS_PATH} must import ${DOMAIN_PATH} after progress-step extraction`);
  }
  if (extractedCount !== EXTRACTED_TOKENS.length) {
    throw new Error(`${PHYSICS_PATH} has an incomplete extracted progress-step application: ${JSON.stringify(extractedTokens)}`);
  }

  return {
    state: 'extracted',
    hasDomainImport: true,
    extractedTokens
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
  EXTRACTED_DISTANCE_USAGE,
  EXTRACTED_TOKENS,
  LEGACY_BLOCKS,
  LEGACY_DISTANCE_BLOCK,
  LEGACY_DISTANCE_USAGE,
  LEGACY_SCORE_BLOCK,
  LEGACY_SPEED_BLOCK,
  analyzePhysicsProgressStepStaging,
  inspectLegacyProgressBlocks
};
