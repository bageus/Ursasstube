import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCK,
  analyzePhysicsCenterOffsetStaging
} from './check-physics-center-offset-staging.mjs';

const DOMAIN_SOURCE = `function calculateCenterOffsetStep({ curveDirection, tubeCurveStrength, tubeRadius, curveOffsetX, curveOffsetY, centerOffsetMultiplier, noDownwardTurns, tier, distance, centerOffsetSmoothing, delta, centerOffsetX, centerOffsetY }) {
  const multiplier = Math.max(0, Number(centerOffsetMultiplier) || 0);
  const targetCenterOffsetX = Math.cos(curveDirection) * tubeCurveStrength * tubeRadius * curveOffsetX * multiplier;
  const targetCenterOffsetY = Math.sin(curveDirection) * tubeCurveStrength * tubeRadius * curveOffsetY * multiplier;
  const limit = noDownwardTurns && tier !== 'standard' ? 2000 : 1500;
  const constrained = distance < limit ? Math.min(targetCenterOffsetY, 0) : targetCenterOffsetY;
  const lerp = Math.min(1, delta * Math.max(1, centerOffsetSmoothing || 1));
  return { centerOffsetX, centerOffsetY: constrained, lerp };
}
export { calculateCenterOffsetStep };
`;

function stagedPhysics(block = LEGACY_BLOCK, importDomain = false) {
  return `${importDomain ? `import { calculateCenterOffsetStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
${block}
  const adaptiveTier = adaptiveProfile.tier;
}`;
}

function extractedPhysics({ importDomain = true, omitToken = null } = {}) {
  const body = EXTRACTED_TOKENS.filter((token) => token !== omitToken).join('\n  ');
  return `${importDomain ? `import { calculateCenterOffsetStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
  ${body}
  const adaptiveTier = adaptiveProfile.tier;
}`;
}

test('accepts the complete staged inline state', () => {
  const result = analyzePhysicsCenterOffsetStaging({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.state, 'staged-inline');
  assert.equal(result.legacyLines, 10);
});

test('accepts the future extracted state', () => {
  const result = analyzePhysicsCenterOffsetStaging({ physicsSource: extractedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.state, 'extracted');
});

test('rejects import or extracted call while the legacy block remains', () => {
  assert.throws(() => analyzePhysicsCenterOffsetStaging({
    physicsSource: stagedPhysics(LEGACY_BLOCK, true),
    domainSource: DOMAIN_SOURCE
  }), /partial center-offset extraction/);
  assert.throws(() => analyzePhysicsCenterOffsetStaging({
    physicsSource: `${stagedPhysics()}\n${EXTRACTED_TOKENS[0]}`,
    domainSource: DOMAIN_SOURCE
  }), /partial center-offset extraction/);
});

test('rejects partial legacy fragments', () => {
  const partial = LEGACY_BLOCK.replace(/\n  gameState\.centerOffsetY[\s\S]*$/, '');
  assert.throws(() => analyzePhysicsCenterOffsetStaging({
    physicsSource: stagedPhysics(partial),
    domainSource: DOMAIN_SOURCE
  }), /partial legacy center-offset fragments/);
});

test('requires import and every extracted application token', () => {
  assert.throws(() => analyzePhysicsCenterOffsetStaging({
    physicsSource: extractedPhysics({ importDomain: false }),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
  for (const token of EXTRACTED_TOKENS) {
    assert.throws(() => analyzePhysicsCenterOffsetStaging({
      physicsSource: extractedPhysics({ omitToken: token }),
      domainSource: DOMAIN_SOURCE
    }), /incomplete extracted center-offset application/);
  }
});

test('rejects drift in the pure domain contract', () => {
  assert.throws(() => analyzePhysicsCenterOffsetStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE.replace("? 2000 : 1500", "? 2500 : 1500")
  }), /missing required token/);
});
