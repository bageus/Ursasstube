import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCKS,
  LEGACY_DISTANCE_USAGE,
  analyzePhysicsProgressStepStaging,
  inspectLegacyProgressBlocks
} from './check-physics-progress-step-staging.mjs';

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

function stagedPhysics({ omit = null, importDomain = false, includeDistanceUsage = true } = {}) {
  const blocks = Object.entries(LEGACY_BLOCKS)
    .filter(([name]) => name !== omit)
    .map(([, block]) => block);
  return `${importDomain ? `import { calculateProgressStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
${blocks[0] || ''}
  gameState.tubeVisualSpeed += delta;
${blocks[1] || ''}
  const adaptiveProfile = getAdaptiveDifficultyProfile({ distance: gameState.distance });
${blocks[2] || ''}
  ${includeDistanceUsage ? `if (gameState.distance - metersDelta > 100) queueCoinRingSpawn();` : ''}
}`;
}

function extractedPhysics({ importDomain = true, omitToken = null } = {}) {
  const body = EXTRACTED_TOKENS
    .filter((token) => token !== omitToken)
    .join('\n  ');
  return `${importDomain ? `import { calculateProgressStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
  ${body}
}`;
}

test('accepts staged ownership only with all blocks and threshold usage', () => {
  const result = analyzePhysicsProgressStepStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE
  });
  assert.equal(result.state, 'staged-inline');
  assert.deepEqual(result.legacyBlocks, { speed: true, distance: true, score: true });
  assert.equal(result.hasLegacyDistanceUsage, true);
});

test('reports the three legacy ownership blocks independently', () => {
  assert.deepEqual(inspectLegacyProgressBlocks(stagedPhysics({ omit: 'score' })), {
    speed: true,
    distance: true,
    score: false
  });
});

test('rejects partial removal of any legacy progress block', () => {
  for (const name of Object.keys(LEGACY_BLOCKS)) {
    assert.throws(() => analyzePhysicsProgressStepStaging({
      physicsSource: stagedPhysics({ omit: name }),
      domainSource: DOMAIN_SOURCE
    }), /partial legacy progress calculation/);
  }
});

test('rejects staged ownership without the metersDelta threshold usage', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: stagedPhysics({ includeDistanceUsage: false }),
    domainSource: DOMAIN_SOURCE
  }), /missing the legacy metersDelta distance-threshold usage/);
});

test('rejects an extracted import while legacy blocks remain', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: stagedPhysics({ importDomain: true }),
    domainSource: DOMAIN_SOURCE
  }), /partial progress-step extraction/);
});

test('accepts the future extracted state with every application token', () => {
  const result = analyzePhysicsProgressStepStaging({
    physicsSource: extractedPhysics(),
    domainSource: DOMAIN_SOURCE
  });
  assert.equal(result.state, 'extracted');
});

test('requires the import and every extracted application token', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: extractedPhysics({ importDomain: false }),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
  for (const token of EXTRACTED_TOKENS) {
    assert.throws(() => analyzePhysicsProgressStepStaging({
      physicsSource: extractedPhysics({ omitToken: token }),
      domainSource: DOMAIN_SOURCE
    }), /incomplete extracted progress-step application/);
  }
});

test('rejects any remaining bare metersDelta reference after extraction', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: `${extractedPhysics()}\nif (${LEGACY_DISTANCE_USAGE}) queueCoinRingSpawn();`,
    domainSource: DOMAIN_SOURCE
  }), /still references metersDelta/);
});

test('rejects drift in the staged domain contract', () => {
  assert.throws(() => analyzePhysicsProgressStepStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE.replace('scoreDelta: metersDelta * pointsPerMeter', 'scoreDelta: metersDelta')
  }), /missing required progress contract token/);
});
