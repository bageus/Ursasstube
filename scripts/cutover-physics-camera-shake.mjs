import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DOMAIN_IMPORT,
  LEGACY_BLOCK,
  analyzePhysicsCameraShakeStaging
} from './check-physics-camera-shake-staging.mjs';

const DEFAULT_PHYSICS_PATH = 'js/physics.js';
const DEFAULT_DOMAIN_PATH = 'js/physics/camera-shake-step.js';
const IMPORT_ANCHORS = [
  "import { calculateCenterOffsetStep } from './physics/center-offset-step.js';",
  "import { calculateProgressStep } from './physics/progress-step.js';"
];
const DOMAIN_IMPORT_STATEMENT = "import { calculateCameraShakeStep } from './physics/camera-shake-step.js';";
const CAMERA_SHAKE_CALL_BLOCK = `  const cameraShakeStep = calculateCameraShakeStep({ gameState, adaptiveProfile, config: CONFIG, delta, cameraShakeSmoothing: CAMERA_SHAKE_SMOOTHING, randomX: Math.random(), randomY: Math.random() });
  gameState.cameraShakeX = cameraShakeStep.cameraShakeX;
  gameState.cameraShakeY = cameraShakeStep.cameraShakeY;
  gameState.renderCenterOffsetX = cameraShakeStep.renderCenterOffsetX;
  gameState.renderCenterOffsetY = cameraShakeStep.renderCenterOffsetY;`;

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
  if (source.indexOf(target, firstIndex + target.length) >= 0) throw new Error(`${label} appears more than once`);
  return source.replace(target, replacement);
}

function findImportAnchor(source) {
  return IMPORT_ANCHORS.find((anchor) => source.includes(anchor)) || null;
}

function transformPhysics(physicsSource) {
  let source = String(physicsSource || '').replace(/\r\n/g, '\n');
  const hasLegacyBlock = source.includes(LEGACY_BLOCK);

  if (!hasLegacyBlock) {
    if (!source.includes(DOMAIN_IMPORT)) {
      throw new Error(`${DEFAULT_PHYSICS_PATH} has no legacy camera-shake block and no domain import`);
    }
    return { changed: false, source };
  }

  if (source.includes(DOMAIN_IMPORT)) throw new Error(`${DEFAULT_PHYSICS_PATH} has a partial camera-shake extraction`);
  const importAnchor = findImportAnchor(source);
  if (!importAnchor) throw new Error(`Physics camera-shake import anchor not found: ${IMPORT_ANCHORS.join(' or ')}`);

  source = replaceExactlyOnce(
    source,
    importAnchor,
    `${importAnchor}\n${DOMAIN_IMPORT_STATEMENT}`,
    'Physics camera-shake import anchor'
  );
  source = replaceExactlyOnce(source, LEGACY_BLOCK, CAMERA_SHAKE_CALL_BLOCK, 'Legacy camera-shake block');

  return { changed: true, source: `${source.trimEnd()}\n` };
}

function analyzePhysicsCameraShakeCutover({ physicsSource, domainSource }) {
  const before = analyzePhysicsCameraShakeStaging({ physicsSource, domainSource });
  const transformed = transformPhysics(physicsSource);

  if (before.state === 'extracted' && !transformed.changed) {
    return { changed: false, physicsSource: transformed.source, before, after: before };
  }

  const after = analyzePhysicsCameraShakeStaging({
    physicsSource: transformed.source,
    domainSource
  });
  if (after.state !== 'extracted') throw new Error('Physics camera-shake cutover did not reach extracted state');

  return {
    changed: transformed.changed,
    physicsSource: transformed.source,
    before,
    after
  };
}

function runPhysicsCameraShakeCutover(options = parseArgs()) {
  for (const path of [options.physicsPath, options.domainPath]) {
    if (!existsSync(path)) throw new Error(`${path} does not exist`);
  }

  const result = analyzePhysicsCameraShakeCutover({
    physicsSource: readFileSync(options.physicsPath, 'utf8'),
    domainSource: readFileSync(options.domainPath, 'utf8')
  });

  if (!result.changed && !options.force && !options.dryRun) {
    throw new Error('Physics camera shake is already extracted; pass --force or use --dry-run to accept a no-op');
  }
  if (result.changed && !options.dryRun) writeFileSync(options.physicsPath, result.physicsSource);

  const report = {
    dryRun: options.dryRun,
    changed: result.changed,
    before: result.before.state,
    after: result.after.state,
    physicsLines: result.physicsSource.split('\n').length
  };
  console.log('Physics camera shake cutover');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runPhysicsCameraShakeCutover(parseArgs()); }
  catch (error) { console.error(error?.message || error); process.exit(1); }
}

export {
  CAMERA_SHAKE_CALL_BLOCK,
  DOMAIN_IMPORT_STATEMENT,
  IMPORT_ANCHORS,
  analyzePhysicsCameraShakeCutover,
  findImportAnchor,
  replaceExactlyOnce,
  transformPhysics
};
