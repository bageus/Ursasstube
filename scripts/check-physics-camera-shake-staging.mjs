import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHYSICS_PATH = 'js/physics.js';
const DOMAIN_PATH = 'js/physics/camera-shake-step.js';
const DOMAIN_IMPORT = "from './physics/camera-shake-step.js'";
const CALL_MARKER = 'const cameraShakeStep = calculateCameraShakeStep({';
const LEGACY_BLOCK = `  const adaptiveTier = adaptiveProfile.tier;
  const suppressShake = adaptiveTier !== 'standard' && gameState.distance < 2000;
  if (suppressShake) {
    gameState.cameraShakeX = 0;
    gameState.cameraShakeY = 0;
  } else {
    const speedRatio = (gameState.speed - CONFIG.SPEED_START) / (CONFIG.SPEED_MAX - CONFIG.SPEED_START);
    const shakeLerp = Math.min(1, delta * CAMERA_SHAKE_SMOOTHING);
    const shakeIntensity = speedRatio > 0.3 ? (speedRatio - 0.3) * 4 : 0;
    const shakeTargetX = (Math.random() - 0.5) * shakeIntensity;
    const shakeTargetY = (Math.random() - 0.5) * shakeIntensity;
    gameState.cameraShakeX += (shakeTargetX - gameState.cameraShakeX) * shakeLerp;
    gameState.cameraShakeY += (shakeTargetY - gameState.cameraShakeY) * shakeLerp;
  }
  gameState.renderCenterOffsetX = gameState.centerOffsetX + gameState.cameraShakeX;
  gameState.renderCenterOffsetY = gameState.centerOffsetY + gameState.cameraShakeY;`;
const EXTRACTED_TOKENS = [
  CALL_MARKER,
  'gameState.cameraShakeX = cameraShakeStep.cameraShakeX;',
  'gameState.cameraShakeY = cameraShakeStep.cameraShakeY;',
  'gameState.renderCenterOffsetX = cameraShakeStep.renderCenterOffsetX;',
  'gameState.renderCenterOffsetY = cameraShakeStep.renderCenterOffsetY;'
];
const REQUIRED_DOMAIN_TOKENS = [
  'function calculateCameraShakeStep',
  "adaptiveTier !== 'standard' && gameState.distance < 2000",
  '(gameState.speed - config.SPEED_START) / (config.SPEED_MAX - config.SPEED_START)',
  'Math.min(1, delta * cameraShakeSmoothing)',
  '(randomX - 0.5) * shakeIntensity',
  '(randomY - 0.5) * shakeIntensity',
  'renderCenterOffsetX: gameState.centerOffsetX + cameraShakeX',
  'renderCenterOffsetY: gameState.centerOffsetY + cameraShakeY',
  'export {',
  'calculateCameraShakeStep'
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

function analyzePhysicsCameraShakeStaging({ physicsSource, domainSource }) {
  assertDomainContract(domainSource);
  const source = normalizeSource(physicsSource);
  const hasLegacyBlock = source.includes(LEGACY_BLOCK);
  const hasDomainImport = source.includes(DOMAIN_IMPORT);
  const extractedTokens = Object.fromEntries(EXTRACTED_TOKENS.map((token) => [token, source.includes(token)]));
  const extractedCount = Object.values(extractedTokens).filter(Boolean).length;

  if (hasLegacyBlock) {
    if (hasDomainImport || extractedCount > 0) throw new Error(`${PHYSICS_PATH} has a partial camera-shake extraction`);
    return { state: 'staged-inline', hasDomainImport: false, legacyLines: LEGACY_BLOCK.split('\n').length };
  }

  const legacyFragments = [
    'const adaptiveTier = adaptiveProfile.tier;',
    'const suppressShake =',
    'const shakeIntensity =',
    'const shakeTargetX =',
    'cameraShakeX += (shakeTargetX',
    'renderCenterOffsetX = gameState.centerOffsetX'
  ].filter((token) => source.includes(token));
  if (legacyFragments.length > 0) throw new Error(`${PHYSICS_PATH} has partial legacy camera-shake fragments: ${legacyFragments.join(', ')}`);
  if (!hasDomainImport) throw new Error(`${PHYSICS_PATH} must import ${DOMAIN_PATH} after camera-shake extraction`);
  if (extractedCount !== EXTRACTED_TOKENS.length) {
    throw new Error(`${PHYSICS_PATH} has incomplete extracted camera-shake application: ${JSON.stringify(extractedTokens)}`);
  }
  return { state: 'extracted', hasDomainImport: true, extractedTokens };
}

function runPhysicsCameraShakeStagingCheck() {
  const result = analyzePhysicsCameraShakeStaging({
    physicsSource: readFileSync(PHYSICS_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Physics camera shake staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runPhysicsCameraShakeStagingCheck(); }
  catch (error) { console.error(error?.message || error); process.exit(1); }
}

export {
  CALL_MARKER,
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCK,
  analyzePhysicsCameraShakeStaging
};
