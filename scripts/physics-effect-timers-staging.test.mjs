import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCK,
  analyzePhysicsEffectTimersStaging
} from './check-physics-effect-timers-staging.mjs';

const DOMAIN_SOURCE = `function calculateEffectTimersStep({ player, gameState, delta }) {
  let spinCooldown = gameState.spinCooldown;
  let baseMultiplier = gameState.baseMultiplier;
  let x2Timer = gameState.x2Timer;
  let magnetActive = player.magnetActive;
  let magnetTimer = player.magnetTimer;
  let invertActive = player.invertActive;
  let invertTimer = player.invertTimer;
  if (spinCooldown > 0) spinCooldown--;
  if (magnetActive) { magnetTimer -= delta; if (magnetTimer <= 0) magnetActive = false; }
  if (invertActive) { invertTimer -= delta; if (invertTimer <= 0) invertActive = false; }
  if (baseMultiplier > 1) { x2Timer -= delta; if (x2Timer <= 0) baseMultiplier = 1; }
  return { player: { magnetActive, magnetTimer, invertActive, invertTimer }, gameState: { spinCooldown, baseMultiplier, x2Timer } };
}
export { calculateEffectTimersStep };
`;

function stagedPhysics(block = LEGACY_BLOCK, importDomain = false) {
  return `${importDomain ? `import { calculateEffectTimersStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
  updateSpin(delta);
${block}
  const p = projectPlayer(1);
}`;
}

function extractedPhysics({ importDomain = true, omitToken = null, includeReset = false } = {}) {
  const body = EXTRACTED_TOKENS.filter((token) => token !== omitToken).join('\n  ');
  return `${importDomain ? `import { calculateEffectTimersStep } ${DOMAIN_IMPORT};\n` : ''}${includeReset ? 'function resetSession() { gameState.baseMultiplier = 1; }\n' : ''}function update(delta) {
  updateSpin(delta);
  ${body}
  const p = projectPlayer(1);
}`;
}

test('accepts the complete staged timer block', () => {
  const result = analyzePhysicsEffectTimersStaging({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.state, 'staged-inline');
  assert.equal(result.legacyLines, 17);
});

test('accepts the future extracted state', () => {
  const result = analyzePhysicsEffectTimersStaging({ physicsSource: extractedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.state, 'extracted');
});

test('allows the independent session-reset base multiplier assignment', () => {
  const result = analyzePhysicsEffectTimersStaging({
    physicsSource: extractedPhysics({ includeReset: true }),
    domainSource: DOMAIN_SOURCE
  });
  assert.equal(result.state, 'extracted');
});

test('rejects import or extracted call while legacy timers remain', () => {
  assert.throws(() => analyzePhysicsEffectTimersStaging({
    physicsSource: stagedPhysics(LEGACY_BLOCK, true),
    domainSource: DOMAIN_SOURCE
  }), /partial effect-timers extraction/);
  assert.throws(() => analyzePhysicsEffectTimersStaging({
    physicsSource: `${stagedPhysics()}\n${EXTRACTED_TOKENS[0]}`,
    domainSource: DOMAIN_SOURCE
  }), /partial effect-timers extraction/);
});

test('rejects partial legacy timer fragments', () => {
  const partial = LEGACY_BLOCK.replace(/\n\n  if \(gameState\.baseMultiplier[\s\S]*$/, '');
  assert.throws(() => analyzePhysicsEffectTimersStaging({
    physicsSource: stagedPhysics(partial),
    domainSource: DOMAIN_SOURCE
  }), /partial legacy effect-timer fragments/);
});

test('requires import and every extracted application token', () => {
  assert.throws(() => analyzePhysicsEffectTimersStaging({
    physicsSource: extractedPhysics({ importDomain: false }),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
  for (const token of EXTRACTED_TOKENS) {
    assert.throws(() => analyzePhysicsEffectTimersStaging({
      physicsSource: extractedPhysics({ omitToken: token }),
      domainSource: DOMAIN_SOURCE
    }), /incomplete extracted effect-timers application/);
  }
});

test('rejects drift in the pure timer contract', () => {
  assert.throws(() => analyzePhysicsEffectTimersStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE.replace('if (spinCooldown > 0) spinCooldown--;', 'spinCooldown -= delta;')
  }), /missing required token/);
});
