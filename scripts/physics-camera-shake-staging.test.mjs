import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_IMPORT,
  EXTRACTED_TOKENS,
  LEGACY_BLOCK,
  analyzePhysicsCameraShakeStaging
} from './check-physics-camera-shake-staging.mjs';

const DOMAIN_SOURCE = `function calculateCameraShakeStep({ gameState, adaptiveProfile, config, delta, cameraShakeSmoothing, randomX, randomY }) {
  const adaptiveTier = adaptiveProfile.tier;
  const suppressShake = adaptiveTier !== 'standard' && gameState.distance < 2000;
  let cameraShakeX = gameState.cameraShakeX;
  let cameraShakeY = gameState.cameraShakeY;
  if (suppressShake) {
    cameraShakeX = 0;
    cameraShakeY = 0;
  } else {
    const speedRatio = (gameState.speed - config.SPEED_START) / (config.SPEED_MAX - config.SPEED_START);
    const shakeLerp = Math.min(1, delta * cameraShakeSmoothing);
    const shakeIntensity = speedRatio > 0.3 ? (speedRatio - 0.3) * 4 : 0;
    const shakeTargetX = (randomX - 0.5) * shakeIntensity;
    const shakeTargetY = (randomY - 0.5) * shakeIntensity;
    cameraShakeX += (shakeTargetX - cameraShakeX) * shakeLerp;
    cameraShakeY += (shakeTargetY - cameraShakeY) * shakeLerp;
  }
  return {
    cameraShakeX,
    cameraShakeY,
    renderCenterOffsetX: gameState.centerOffsetX + cameraShakeX,
    renderCenterOffsetY: gameState.centerOffsetY + cameraShakeY
  };
}
export { calculateCameraShakeStep };
`;

function stagedPhysics(block = LEGACY_BLOCK, importDomain = false) {
  return `${importDomain ? `import { calculateCameraShakeStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
${block}
  const collisionDepthMin = 1;
}`;
}

function extractedPhysics({ importDomain = true, omitToken = null } = {}) {
  const body = EXTRACTED_TOKENS.filter((token) => token !== omitToken).join('\n  ');
  return `${importDomain ? `import { calculateCameraShakeStep } ${DOMAIN_IMPORT};\n` : ''}function update(delta) {
  ${body}
  const collisionDepthMin = 1;
}`;
}

test('accepts the complete staged inline state', () => {
  const result = analyzePhysicsCameraShakeStaging({ physicsSource: stagedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.state, 'staged-inline');
  assert.equal(result.legacyLines, 16);
});

test('accepts the future extracted state', () => {
  const result = analyzePhysicsCameraShakeStaging({ physicsSource: extractedPhysics(), domainSource: DOMAIN_SOURCE });
  assert.equal(result.state, 'extracted');
});

test('rejects an import or extracted call while the legacy block remains', () => {
  assert.throws(() => analyzePhysicsCameraShakeStaging({
    physicsSource: stagedPhysics(LEGACY_BLOCK, true),
    domainSource: DOMAIN_SOURCE
  }), /partial camera-shake extraction/);
  assert.throws(() => analyzePhysicsCameraShakeStaging({
    physicsSource: `${stagedPhysics()}\n${EXTRACTED_TOKENS[0]}`,
    domainSource: DOMAIN_SOURCE
  }), /partial camera-shake extraction/);
});

test('rejects partial legacy fragments', () => {
  const partial = LEGACY_BLOCK.replace(/\n  gameState\.renderCenterOffsetY[\s\S]*$/, '');
  assert.throws(() => analyzePhysicsCameraShakeStaging({
    physicsSource: stagedPhysics(partial),
    domainSource: DOMAIN_SOURCE
  }), /partial legacy camera-shake fragments/);
});

test('requires the import and every extracted application token', () => {
  assert.throws(() => analyzePhysicsCameraShakeStaging({
    physicsSource: extractedPhysics({ importDomain: false }),
    domainSource: DOMAIN_SOURCE
  }), /must import/);
  for (const token of EXTRACTED_TOKENS) {
    assert.throws(() => analyzePhysicsCameraShakeStaging({
      physicsSource: extractedPhysics({ omitToken: token }),
      domainSource: DOMAIN_SOURCE
    }), /incomplete extracted camera-shake application/);
  }
});

test('rejects drift in the pure domain contract', () => {
  assert.throws(() => analyzePhysicsCameraShakeStaging({
    physicsSource: stagedPhysics(),
    domainSource: DOMAIN_SOURCE.replace('cameraShakeSmoothing)', 'cameraShakeSmoothing * 2)')
  }), /missing required token/);
});
