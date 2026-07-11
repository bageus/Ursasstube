import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CALL_MARKER,
  DOMAIN_IMPORT,
  INLINE_END,
  INLINE_START,
  analyzePhysicsProgressStepStaging,
  extractInlineProgressBlock
} from './check-physics-progress-step-staging.mjs';

const INLINE_BLOCK = `${INLINE_START}
  const speedIncrementMultiplier = gameState.distance >= CONFIG.SPEED_INCREMENT_BOOST_DISTANCE
    ? CONFIG.SPEED_INCREMENT_BOOST_MULTIPLIER
    : 1;
  gameState.speed = Math.min(
    CONFIG.SPEED_START + speedLevel * CONFIG.SPEED_INCREMENT * speedIncrementMultiplier,
    CONFIG.SPEED_MAX
  );
  const metersDelta = gameState.speed * 300 * delta;
  gameState.distance += metersDelta;
  const speedFactor = gameState.speed / CONFIG.SPEED_START;
  let pointsPerMeter = speedFactor;
  if (player.invertActive && gameState.invertScoreMultiplier > 1) {
    pointsPerMeter *= gameState.invertScoreMultiplier;
  }
  gameState.score += metersDelta * pointsPerMeter;`;

const DOMAIN_SOURCE = `const METERS_PER_SECOND_MULT = 300;
function calculateProgressStep({ distance, delta, speedStart, speedIncrementInterval, speedIncrementBoostDistance, speedIncrementBoostMultiplier, speedIncrement, speedMax, invertActive, invertScoreMultiplier }) {
  const speedLevel = Math.floor(distance / speedIncrementInterval);
  const speedIncrementMultiplier = distance >= speedIncrementBoostDistance ? speedIncrementBoostMultiplier : 1;
  const speed = Math.min(speedStart + speedLevel * speedIncrement * speedIncrementMultiplier, speedMax);
  const metersDelta = speed * METERS_PER_SECOND_MULT * delta;
  const speedFactor = speed / speedStart;
  let pointsPerMeter = speedFactor;
  if (invertActive && invertScoreMultiplier > 1) pointsPerMeter *= invertScoreMultiplier;
  return { scoreDelta: metersDelta * pointsPerMeter };
}
export { calculateProgressStep };
`;

function stagedPhysics() {
  return `function update(delta) {
${INLINE_BLOCK}
${INLINE_END}({ completedRuns: 0, distance: gameState.distance });
}`;
}

function extractedPhysics({ importDomain = true, callDomain = true } = {}) {
  return `${importDomain ? `import { calculateProgressStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
  ${callDomain ? `${CALL_MARKER} distance: gameState.distance });` : 'gameState.distance += delta;'}
  ${INLINE_END}({ completedRuns: 0, distance: gameState.distance });
}`;
}

test('accepts the staged inline ownership state', () => {
  const result = analyzePhysicsProgressStepStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE
  });
  assert.equal(result.state, 'staged-inline');
  assert.ok(result.inlineLines > 10);
});

test('extracts the complete inline block using stable anchors', () => {
  assert.equal(extractInlineProgressBlock(stagedPhysics()), INLINE_BLOCK);
});

test('accepts the future extracted ownership state', () => {
  const result = analyzePhysicsProgressStepStaging({
    physicsSource: extractedPhysics(),
    domainSource: DOMAIN_SOURCE
  });
  assert.equal(result.state, 'extracted');
});

test('rejects an import while the inline duplicate still exists', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: `import { calculateProgressStep } ${DOMAIN_IMPORT};\n${stagedPhysics()}`,
    domainSource: DOMAIN_SOURCE
  }), /partial progress-step extraction/);
});

test('requires both import and domain call after inline removal', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: extractedPhysics({ importDomain: false }),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: extractedPhysics({ callDomain: false }),
    domainSource: DOMAIN_SOURCE
  }), /must call calculateProgressStep/);
});

test('rejects drift in the staged domain contract', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE.replace('scoreDelta: metersDelta * pointsPerMeter', 'scoreDelta: metersDelta')
  }), /missing required progress contract token/);
});
