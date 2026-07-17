import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NEXT_MARKER,
  START_MARKER
} from './check-physics-collision-phase-staging.mjs';
import {
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  analyzePhysicsCollisionPhaseCutover,
  transformPhysics
} from './cutover-physics-collision-phase.mjs';

const SECTION = `${START_MARKER}
  fence: { start: 28, end: 45 }
});
function isObstacleInCollisionPhase(subtype, z, zMin, zMax) {
  return Boolean(subtype && Number.isFinite(z) && zMax > zMin);
}`;
const DOMAIN_SOURCE = `${SECTION}

export {
  OBSTACLE_COLLISION_PHASE_WINDOW,
  isObstacleInCollisionPhase
};
`;

function physicsSource(section = SECTION) {
  return `import { dependency } from './fixture.js';
${IMPORT_ANCHOR}

${section}
${NEXT_MARKER} (index) => index;
`;
}

test('cuts over staged physics collision phase atomically', () => {
  const result = analyzePhysicsCollisionPhaseCutover({
    physicsSource: physicsSource(),
    domainSource: DOMAIN_SOURCE
  });

  assert.equal(result.changed, true);
  assert.equal(result.before.state, 'staged-duplicate');
  assert.equal(result.after.state, 'extracted');
  assert.equal(result.physicsSource.includes(START_MARKER), false);
  assert.equal(result.physicsSource.includes(DOMAIN_IMPORT_STATEMENT), true);
});

test('accepts an already extracted no-op', () => {
  const first = analyzePhysicsCollisionPhaseCutover({
    physicsSource: physicsSource(),
    domainSource: DOMAIN_SOURCE
  });
  const second = analyzePhysicsCollisionPhaseCutover({
    physicsSource: first.physicsSource,
    domainSource: DOMAIN_SOURCE
  });

  assert.equal(second.changed, false);
  assert.equal(second.before.state, 'extracted');
  assert.equal(second.after.state, 'extracted');
});

test('rejects parity drift before transforming physics', () => {
  assert.throws(() => analyzePhysicsCollisionPhaseCutover({
    physicsSource: physicsSource(),
    domainSource: DOMAIN_SOURCE.replace('start: 28', 'start: 29')
  }), /must match the collision phase section/);
});

test('rejects a missing physics import anchor', () => {
  assert.throws(() => transformPhysics(
    physicsSource().replace(`${IMPORT_ANCHOR}\n`, '')
  ), /import anchor not found/);
});

test('rejects a partial extraction', () => {
  assert.throws(() => transformPhysics(
    physicsSource().replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`)
  ), /partial collision phase extraction/);
});

test('requires the import after the local collision block is gone', () => {
  const extractedWithoutImport = `${IMPORT_ANCHOR}\n${NEXT_MARKER} (index) => index;\n`;
  assert.throws(() => analyzePhysicsCollisionPhaseCutover({
    physicsSource: extractedWithoutImport,
    domainSource: DOMAIN_SOURCE
  }), /must import js\/physics\/collision-phase\.js/);
});
