import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHYSICS_PATH = 'js/physics.js';
const DOMAIN_PATH = 'js/physics/center-offset-step.js';
const DOMAIN_IMPORT = "from './physics/center-offset-step.js'";
const CALL_MARKER = 'const centerOffsetStep = calculateCenterOffsetStep({';
const LEGACY_BLOCK = `  const centerOffsetMultiplier = Math.max(0, Number(adaptiveProfile.centerOffsetMultiplier) || 0);
  const rawTargetCenterOffsetX = Math.cos(gameState.curveDirection) * gameState.tubeCurveStrength * CONFIG.TUBE_RADIUS * CONFIG.CURVE_OFFSET_X;
  const rawTargetCenterOffsetY = Math.sin(gameState.curveDirection) * gameState.tubeCurveStrength * CONFIG.TUBE_RADIUS * CONFIG.CURVE_OFFSET_Y;
  const targetCenterOffsetX = rawTargetCenterOffsetX * centerOffsetMultiplier;
  const targetCenterOffsetY = rawTargetCenterOffsetY * centerOffsetMultiplier;
  const noDownwardTurnsDistanceLimit = adaptiveProfile.noDownwardTurns && adaptiveProfile.tier !== 'standard' ? 2000 : 1500;
  const constrainedCenterOffsetY = gameState.distance < noDownwardTurnsDistanceLimit ? Math.min(targetCenterOffsetY, 0) : targetCenterOffsetY;
  const centerOffsetLerp = Math.min(1, delta * Math.max(1, adaptiveProfile.centerOffsetSmoothing || 1));
  gameState.centerOffsetX += (targetCenterOffsetX - gameState.centerOffsetX) * centerOffsetLerp;
  gameState.centerOffsetY += (constrainedCenterOffsetY - gameState.centerOffsetY) * centerOffsetLerp;`;
const EXTRACTED_TOKENS = [
  CALL_MARKER,
  'gameState.centerOffsetX = centerOffsetStep.centerOffsetX;',
  'gameState.centerOffsetY = centerOffsetStep.centerOffsetY;'
];
const REQUIRED_DOMAIN_TOKENS = [
  'function calculateCenterOffsetStep({ gameState, adaptiveProfile, config, delta })',
  'Math.cos(gameState.curveDirection)',
  'Math.sin(gameState.curveDirection)',
  'config.TUBE_RADIUS',
  "adaptiveProfile.noDownwardTurns && adaptiveProfile.tier !== 'standard' ? 2000 : 1500",
  'Math.min(targetCenterOffsetY, 0)',
  'Math.min(1, delta * Math.max(1, adaptiveProfile.centerOffsetSmoothing || 1))',
  'gameState.centerOffsetX + (targetCenterOffsetX - gameState.centerOffsetX)',
  'export {',
  'calculateCenterOffsetStep'
];

function normalizeSource(source) {
  return String(source || '').replace(/\r\n/g, '\n');
}

function assertDomainContract(domainSource) {
  const source = String(domainSource || '');
  for (const token of REQUIRED_DOMAIN_TOKENS) {
    if (!source.includes(token)) throw new Error(`${DOMAIN_PATH} is missing required token: ${token}`);
  }
}

function analyzePhysicsCenterOffsetStaging({ physicsSource, domainSource }) {
  assertDomainContract(domainSource);
  const source = normalizeSource(physicsSource);
  const hasLegacyBlock = source.includes(LEGACY_BLOCK);
  const hasDomainImport = source.includes(DOMAIN_IMPORT);
  const extractedTokens = Object.fromEntries(EXTRACTED_TOKENS.map((token) => [token, source.includes(token)]));
  const extractedCount = Object.values(extractedTokens).filter(Boolean).length;

  if (hasLegacyBlock) {
    if (hasDomainImport || extractedCount > 0) throw new Error(`${PHYSICS_PATH} has a partial center-offset extraction`);
    return { state: 'staged-inline', hasDomainImport: false, legacyLines: LEGACY_BLOCK.split('\n').length };
  }

  const legacyFragments = [
    'const centerOffsetMultiplier =',
    'const rawTargetCenterOffsetX =',
    'const constrainedCenterOffsetY =',
    'centerOffsetX += (targetCenterOffsetX',
    'centerOffsetY += (constrainedCenterOffsetY'
  ].filter((token) => source.includes(token));
  if (legacyFragments.length > 0) throw new Error(`${PHYSICS_PATH} has partial legacy center-offset fragments: ${legacyFragments.join(', ')}`);
  if (!hasDomainImport) throw new Error(`${PHYSICS_PATH} must import ${DOMAIN_PATH} after center-offset extraction`);
  if (extractedCount !== EXTRACTED_TOKENS.length) {
    throw new Error(`${PHYSICS_PATH} has incomplete extracted center-offset application: ${JSON.stringify(extractedTokens)}`);
  }
  return { state: 'extracted', hasDomainImport: true, extractedTokens };
}

function runPhysicsCenterOffsetStagingCheck() {
  const result = analyzePhysicsCenterOffsetStaging({
    physicsSource: readFileSync(PHYSICS_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Physics center offset staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runPhysicsCenterOffsetStagingCheck(); }
  catch (error) { console.error(error?.message || error); process.exit(1); }
}

export {
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCK,
  analyzePhysicsCenterOffsetStaging
};
