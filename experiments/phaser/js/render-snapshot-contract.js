const SNAPSHOT_SCHEMA_VERSION = 1;

const REQUIRED_TOP_LEVEL_KEYS = [
  'schemaVersion',
  'backend',
  'viewport',
  'tube',
  'player',
  'obstacles',
  'bonuses',
  'coins',
  'spinTargets',
  'lamps',
  'fx',
  'runtime'
];

const REQUIRED_VIEWPORT_KEYS = ['width', 'height', 'dpr', 'centerX', 'centerY'];
const REQUIRED_TUBE_KEYS = [
  'rotation',
  'scroll',
  'waveMod',
  'curveAngle',
  'curveStrength',
  'curveDirection',
  'centerOffsetX',
  'centerOffsetY',
  'speed',
  'quality'
];
const REQUIRED_PLAYER_KEYS = [
  'lane',
  'targetLane',
  'lanePrev',
  'laneAnimFrame',
  'isLaneTransition',
  'state',
  'frameIndex',
  'shield',
  'shieldCount',
  'magnetActive',
  'magnetTimer',
  'invertActive',
  'invertTimer',
  'spinActive',
  'spinProgress'
];
const REQUIRED_RUNTIME_KEYS = [
  'distance',
  'score',
  'baseMultiplier',
  'invertScoreMultiplier',
  'silverCoins',
  'goldCoins',
  'config'
];
const REQUIRED_RUNTIME_CONFIG_KEYS = ['lanes', 'playerZ', 'tubeRadius', 'playerOffset'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectMissingKeys(target, requiredKeys, path, errors) {
  requiredKeys.forEach((key) => {
    if (!(key in target)) {
      errors.push(`${path}.${key}`);
    }
  });
}

/**
 * Validates canonical render snapshot shape in dev mode to detect gameplay ↔ renderer
 * contract drift early.
 *
 * @param {unknown} snapshot
 * @returns {{ok: boolean, issues: string[]}}
 */
function validateRenderSnapshot(snapshot) {
  /** @type {string[]} */
  const issues = [];
  if (!isPlainObject(snapshot)) {
    return { ok: false, issues: ['snapshot must be a plain object'] };
  }

  const typedSnapshot = /** @type {Record<string, unknown>} */ (snapshot);
  collectMissingKeys(typedSnapshot, REQUIRED_TOP_LEVEL_KEYS, 'snapshot', issues);
  if (typedSnapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    issues.push(`snapshot.schemaVersion expected ${SNAPSHOT_SCHEMA_VERSION}`);
  }

  if (typedSnapshot.backend !== 'phaser' && typedSnapshot.backend !== 'canvas') {
    issues.push('snapshot.backend expected "phaser" or "canvas"');
  }

  const viewport = typedSnapshot.viewport;
  if (!isPlainObject(viewport)) {
    issues.push('snapshot.viewport must be a plain object');
  } else {
    collectMissingKeys(viewport, REQUIRED_VIEWPORT_KEYS, 'snapshot.viewport', issues);
  }

  const tube = typedSnapshot.tube;
  if (!isPlainObject(tube)) {
    issues.push('snapshot.tube must be a plain object');
  } else {
    collectMissingKeys(tube, REQUIRED_TUBE_KEYS, 'snapshot.tube', issues);
  }

  const player = typedSnapshot.player;
  if (!isPlainObject(player)) {
    issues.push('snapshot.player must be a plain object');
  } else {
    collectMissingKeys(player, REQUIRED_PLAYER_KEYS, 'snapshot.player', issues);
  }

  const runtime = typedSnapshot.runtime;
  if (!isPlainObject(runtime)) {
    issues.push('snapshot.runtime must be a plain object');
  } else {
    collectMissingKeys(runtime, REQUIRED_RUNTIME_KEYS, 'snapshot.runtime', issues);
    if (!isPlainObject(runtime.config)) {
      issues.push('snapshot.runtime.config must be a plain object');
    } else {
      collectMissingKeys(runtime.config, REQUIRED_RUNTIME_CONFIG_KEYS, 'snapshot.runtime.config', issues);
    }
  }

  ['obstacles', 'bonuses', 'coins', 'spinTargets', 'lamps'].forEach((arrayKey) => {
    if (!Array.isArray(typedSnapshot[arrayKey])) {
      issues.push(`snapshot.${arrayKey} must be an array`);
    }
  });

  if (!isPlainObject(typedSnapshot.fx)) {
    issues.push('snapshot.fx must be a plain object');
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export { SNAPSHOT_SCHEMA_VERSION, validateRenderSnapshot };
