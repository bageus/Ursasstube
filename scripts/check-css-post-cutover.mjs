import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { analyzeCssStagedSections, SECTION_SPECS } from './check-css-staged-sections.mjs';

const PATHS = {
  stylePath: 'css/style.css',
  mainPath: 'js/main.js',
  backgroundPath: 'css/background.css',
  heroPath: 'css/hero.css',
  startScreenPath: 'css/start-screen.css',
  leaderboardPath: 'css/leaderboard.css',
  gameplayPath: 'css/gameplay.css',
  gameOverPath: 'css/game-over.css',
  storePath: 'css/store.css',
  rulesPath: 'css/rules.css',
  responsivePath: 'css/responsive.css',
};

const EXPECTED_EXTRACTED_COUNT = SECTION_SPECS.length + 1;

function assertCssPostCutover(result) {
  if (result.stagedDuplicateCount !== 0) {
    const duplicates = Object.entries(result.sections)
      .filter(([, section]) => section.hasStyleDuplicate)
      .map(([name]) => name);
    throw new Error(`css/style.css must not contain staged duplicates after Phase 2 cutover: ${duplicates.join(', ')}`);
  }

  if (result.extractedCount !== EXPECTED_EXTRACTED_COUNT) {
    throw new Error(`Expected ${EXPECTED_EXTRACTED_COUNT} extracted CSS ownership sections, got ${result.extractedCount}`);
  }

  return {
    state: 'extracted',
    extractedCount: result.extractedCount,
    stagedDuplicateCount: result.stagedDuplicateCount,
  };
}

function runCssPostCutoverCheck(paths = PATHS) {
  const result = analyzeCssStagedSections({
    styleSource: readFileSync(paths.stylePath, 'utf8'),
    mainSource: readFileSync(paths.mainPath, 'utf8'),
    backgroundSource: readFileSync(paths.backgroundPath, 'utf8'),
    heroSource: readFileSync(paths.heroPath, 'utf8'),
    startScreenSource: readFileSync(paths.startScreenPath, 'utf8'),
    leaderboardSource: readFileSync(paths.leaderboardPath, 'utf8'),
    gameplaySource: readFileSync(paths.gameplayPath, 'utf8'),
    gameOverSource: readFileSync(paths.gameOverPath, 'utf8'),
    storeSource: readFileSync(paths.storePath, 'utf8'),
    rulesSource: readFileSync(paths.rulesPath, 'utf8'),
    responsiveSource: readFileSync(paths.responsivePath, 'utf8'),
  });

  const report = assertCssPostCutover(result);
  console.log('CSS post-cutover check');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCssPostCutoverCheck();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  EXPECTED_EXTRACTED_COUNT,
  PATHS,
  assertCssPostCutover,
  runCssPostCutoverCheck,
};
