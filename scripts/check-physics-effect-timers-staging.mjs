import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PHYSICS_PATH = 'js/physics.js';
const DOMAIN_PATH = 'js/physics/effect-timers-step.js';
const DOMAIN_IMPORT = "from './physics/effect-timers-step.js'";
const CALL_MARKER = 'const effectTimersStep = calculateEffectTimersStep({';
const LEGACY_BLOCK = `  if (gameState.spinCooldown > 0) gameState.spinCooldown--;

  // Bonus timers
  if (player.magnetActive) {
    player.magnetTimer -= delta;
    if (player.magnetTimer <= 0) player.magnetActive = false;
  }

  if (player.invertActive) {
    player.invertTimer -= delta;
    if (player.invertTimer <= 0) player.invertActive = false;
  }

  if (gameState.baseMultiplier > 1) {
    gameState.x2Timer -= delta;
    if (gameState.x2Timer <= 0) gameState.baseMultiplier = 1;
  }`;
const EXTRACTED_TOKENS = [
  CALL_MARKER,
  'Object.assign(player, effectTimersStep.player);',
  'Object.assign(gameState, effectTimersStep.gameState);'
];
const REQUIRED_DOMAIN_TOKENS = [
  'function calculateEffectTimersStep',
  'if (spinCooldown > 0) spinCooldown--;',
  'if (magnetActive)',
  'magnetTimer -= delta;',
  'if (invertActive)',
  'invertTimer -= delta;',
  'if (baseMultiplier > 1)',
  'x2Timer -= delta;',
  'if (x2Timer <= 0) baseMultiplier = 1;',
  'export {',
  'calculateEffectTimersStep'
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

function analyzePhysicsEffectTimersStaging({ physicsSource, domainSource }) {
  assertDomainContract(domainSource);
  const source = normalizeSource(physicsSource);
  const hasLegacyBlock = source.includes(LEGACY_BLOCK);
  const hasDomainImport = source.includes(DOMAIN_IMPORT);
  const extractedTokens = Object.fromEntries(EXTRACTED_TOKENS.map((token) => [token, source.includes(token)]));
  const extractedCount = Object.values(extractedTokens).filter(Boolean).length;

  if (hasLegacyBlock) {
    if (hasDomainImport || extractedCount > 0) throw new Error(`${PHYSICS_PATH} has a partial effect-timers extraction`);
    return { state: 'staged-inline', hasDomainImport: false, legacyLines: LEGACY_BLOCK.split('\n').length };
  }

  const legacyFragments = [
    'gameState.spinCooldown--',
    'player.magnetTimer -= delta',
    'player.invertTimer -= delta',
    'gameState.x2Timer -= delta',
    'if (gameState.x2Timer <= 0) gameState.baseMultiplier = 1;'
  ].filter((token) => source.includes(token));
  if (legacyFragments.length > 0) throw new Error(`${PHYSICS_PATH} has partial legacy effect-timer fragments: ${legacyFragments.join(', ')}`);
  if (!hasDomainImport) throw new Error(`${PHYSICS_PATH} must import ${DOMAIN_PATH} after effect-timers extraction`);
  if (extractedCount !== EXTRACTED_TOKENS.length) {
    throw new Error(`${PHYSICS_PATH} has incomplete extracted effect-timers application: ${JSON.stringify(extractedTokens)}`);
  }
  return { state: 'extracted', hasDomainImport: true, extractedTokens };
}

function runPhysicsEffectTimersStagingCheck() {
  const result = analyzePhysicsEffectTimersStaging({
    physicsSource: readFileSync(PHYSICS_PATH, 'utf8'),
    domainSource: readFileSync(DOMAIN_PATH, 'utf8')
  });
  console.log('Physics effect timers staging check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runPhysicsEffectTimersStagingCheck(); }
  catch (error) { console.error(error?.message || error); process.exit(1); }
}

export {
  CALL_MARKER,
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCK,
  analyzePhysicsEffectTimersStaging
};
