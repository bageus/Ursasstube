import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  EXTRACTED_DISTANCE_USAGE,
  LEGACY_DISTANCE_BLOCK,
  LEGACY_DISTANCE_USAGE,
  LEGACY_SCORE_BLOCK,
  LEGACY_SPEED_BLOCK,
  analyzePhysicsProgressStepStaging
} from './check-physics-progress-step-staging.mjs';

const DEFAULT_PHYSICS_PATH = 'js/physics.js';
const DEFAULT_DOMAIN_PATH = 'js/physics/progress-step.js';
const IMPORT_ANCHOR = "import { createPhysicsSpawning } from './physics-spawning.js';";
const DOMAIN_IMPORT_STATEMENT = "import { calculateProgressStep } from './physics/progress-step.js';";
const PROGRESS_CALL_BLOCK = `  const progressStep = calculateProgressStep({
    distance: gameState.distance,
    delta,
    speedStart: CONFIG.SPEED_START,
    speedIncrementInterval: CONFIG.SPEED_INCREMENT_INTERVAL,
    speedIncrementBoostDistance: CONFIG.SPEED_INCREMENT_BOOST_DISTANCE,
    speedIncrementBoostMultiplier: CONFIG.SPEED_INCREMENT_BOOST_MULTIPLIER,
    speedIncrement: CONFIG.SPEED_INCREMENT,
    speedMax: CONFIG.SPEED_MAX,
    invertActive: player.invertActive,
    invertScoreMultiplier: gameState.invertScoreMultiplier
  });
  gameState.speed = progressStep.speed;`;
const DISTANCE_APPLICATION = '  gameState.distance += progressStep.metersDelta;';
const SCORE_APPLICATION = '  gameState.score += progressStep.scoreDelta;';

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    physicsPath: readArg('physics', DEFAULT_PHYSICS_PATH),
    domainPath: readArg('domain', DEFAULT_DOMAIN_PATH)
  };
}

function replaceExactlyOnce(source, target, replacement, label) {
  const firstIndex = source.indexOf(target);
  if (firstIndex < 0) throw new Error(`${label} was not found`);
  if (source.indexOf(target, firstIndex + target.length) >= 0) {
    throw new Error(`${label} appears more than once`);
  }
  return source.replace(target, replacement);
}

function transformPhysics(physicsSource) {
  let source = String(physicsSource || '').replace(/\r\n/g, '\n');
  const hasLegacySpeed = source.includes(LEGACY_SPEED_BLOCK);

  if (!hasLegacySpeed) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_PHYSICS_PATH} has no legacy progress calculation and no progress-step import`);
    }
    return { changed: false, source };
  }

  if (source.includes(DOMAIN_IMPORT)) {
    throw new Error(`${DEFAULT_PHYSICS_PATH} has a partial progress-step extraction`);
  }
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(`Physics progress-step import anchor not found: ${IMPORT_ANCHOR}`);
  }

  source = replaceExactlyOnce(
    source,
    IMPORT_ANCHOR,
    `${IMPORT_ANCHOR}\n${DOMAIN_IMPORT_STATEMENT}`,
    'Physics progress-step import anchor'
  );
  source = replaceExactlyOnce(source, LEGACY_SPEED_BLOCK, PROGRESS_CALL_BLOCK, 'Legacy speed block');
  source = replaceExactlyOnce(source, LEGACY_DISTANCE_BLOCK, DISTANCE_APPLICATION, 'Legacy distance block');
  source = replaceExactlyOnce(source, LEGACY_SCORE_BLOCK, SCORE_APPLICATION, 'Legacy score block');
  source = replaceExactlyOnce(source, LEGACY_DISTANCE_USAGE, EXTRACTED_DISTANCE_USAGE, 'Legacy metersDelta distance-threshold usage');

  return { changed: true, source: `${source.trimEnd()}\n` };
}

function analyzePhysicsProgressStepCutover({ physicsSource, domainSource }) {
  const before = analyzePhysicsProgressStepStaging({ physicsSource, domainSource });
  const transformed = transformPhysics(physicsSource);

  if (before.state === 'extracted' && !transformed.changed) {
    return {
      changed: false,
      physicsSource: transformed.source,
      before,
      after: before
    };
  }

  const after = analyzePhysicsProgressStepStaging({
    physicsSource: transformed.source,
    domainSource
  });
  if (after.state !== 'extracted') {
    throw new Error('Physics progress-step cutover did not reach extracted state');
  }

  return {
    changed: transformed.changed,
    physicsSource: transformed.source,
    before,
    after
  };
}

function runPhysicsProgressStepCutover(options = parseArgs()) {
  for (const path of [options.physicsPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzePhysicsProgressStepCutover({
    physicsSource: readFileSync(options.physicsPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Physics progress step is already extracted; pass --force or use --dry-run to accept a no-op');
  }
  if (result.changed && !options.dryRun) {
    writeFileSync(options.physicsPath, result.physicsSource);
  }

  const report = {
    dryRun: options.dryRun,
    changed: result.changed,
    before: result.before.state,
    after: result.after.state,
    physicsLines: result.physicsSource.split('\n').length
  };
  console.log('Physics progress step cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runPhysicsProgressStepCutover(parseArgs());
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  DISTANCE_APPLICATION,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHOR,
  PROGRESS_CALL_BLOCK,
  SCORE_APPLICATION,
  analyzePhysicsProgressStepCutover,
  replaceExactlyOnce,
  transformPhysics
};
