import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IMPORT_ORDER,
  LEADERBOARD_IMPORT,
  analyzeCssStagedSections,
  extractSection,
  normalizeCss,
} from './check-css-staged-sections.mjs';

const BACKGROUND = `/* ===== BACKGROUND ===== */
.stars { opacity: .6; }`;

const HERO = `/* ===== HERO / BEAR ===== */
.bear-wrapper { position: absolute; }`;

const TITLE = `/* ===== TITLE / BUTTONS ===== */
.new-title { font-size: 50px; }`;

const HOOK = `/* ===== START HOOK ===== */
.start-hook { display: flex; }

@media (max-width: 360px) {
  .start-hook { display: none; }
}

.start-hook-sub { display: block; }`;

const LEADERBOARD = `/* ===== LEADERBOARD ===== */
.lb { width: 100%; }`;

const GAMEPLAY = `/* ===== GAME START ===== */
#gameStart { display: flex; }

/* ===== GAME CONTAINER ===== */
#gameContainer { display: none; }

/* ===== GAME HUD ===== */
#uiTopLeft { position: absolute; }

/* ===== IN-GAME AUDIO ===== */
.game-audio-nav { display: flex; }`;

const GAME_OVER = `/* ===== GAME OVER ===== */
#gameOver { display: none; }`;

function styleSource() {
  return `${BACKGROUND}

${HERO}

${TITLE}

${HOOK}

${LEADERBOARD}

${GAMEPLAY}

${GAME_OVER}
`;
}

function mainSource(order = IMPORT_ORDER) {
  return `${order.join('\n')}\n`;
}

function stagedSources() {
  return {
    backgroundSource: `${BACKGROUND}\n`,
    heroSource: `${HERO}\n`,
    startScreenSource: `${LEADERBOARD_IMPORT}\n\n${TITLE}\n\n${HOOK}\n`,
    leaderboardSource: `${LEADERBOARD}\n`,
    gameplaySource: `${GAMEPLAY}\n`,
  };
}

test('normalizeCss ignores comments and formatting only', () => {
  assert.equal(
    normalizeCss('/* note */\n.a {\n  color: red;\n}\n'),
    '.a { color: red; }',
  );
});

test('extractSection reads a marker-bounded section', () => {
  assert.equal(
    extractSection(styleSource(), '/* ===== BACKGROUND ===== */', '/* ===== HERO / BEAR ===== */'),
    BACKGROUND,
  );
});

test('analyzeCssStagedSections accepts matching staged duplicates', () => {
  const result = analyzeCssStagedSections({
    styleSource: styleSource(),
    mainSource: mainSource(),
    ...stagedSources(),
  });

  assert.equal(result.stagedDuplicateCount, 5);
  assert.equal(result.extractedCount, 0);
  assert.equal(result.sections.startScreen.state, 'staged-duplicate');
  assert.equal(result.sections.gameplay.state, 'staged-duplicate');
});

test('analyzeCssStagedSections accepts sections after duplicate removal', () => {
  const result = analyzeCssStagedSections({
    styleSource: GAME_OVER,
    mainSource: mainSource(),
    ...stagedSources(),
  });

  assert.equal(result.stagedDuplicateCount, 0);
  assert.equal(result.extractedCount, 5);
});

test('analyzeCssStagedSections rejects incomplete start-screen parity', () => {
  const sources = stagedSources();
  sources.startScreenSource = `${LEADERBOARD_IMPORT}\n\n${TITLE}\n\n/* ===== START HOOK ===== */\n.start-hook { display: flex; }\n`;

  assert.throws(() => analyzeCssStagedSections({
    styleSource: styleSource(),
    mainSource: mainSource(),
    ...sources,
  }), /must match TITLE \/ BUTTONS and START HOOK/);
});

test('analyzeCssStagedSections rejects a partial start-screen extraction', () => {
  const partialStyle = `${HOOK}\n\n${LEADERBOARD}\n\n${GAMEPLAY}\n\n${GAME_OVER}\n`;

  assert.throws(() => analyzeCssStagedSections({
    styleSource: partialStyle,
    mainSource: mainSource(),
    ...stagedSources(),
  }), /partial start-screen extraction/);
});

test('analyzeCssStagedSections requires CSS import order', () => {
  const wrongOrder = [...IMPORT_ORDER];
  [wrongOrder[3], wrongOrder[4]] = [wrongOrder[4], wrongOrder[3]];

  assert.throws(() => analyzeCssStagedSections({
    styleSource: styleSource(),
    mainSource: mainSource(wrongOrder),
    ...stagedSources(),
  }), /imports must remain ordered/);
});

test('analyzeCssStagedSections requires leaderboard import first', () => {
  const sources = stagedSources();
  sources.startScreenSource = `${TITLE}\n\n${HOOK}\n`;

  assert.throws(() => analyzeCssStagedSections({
    styleSource: styleSource(),
    mainSource: mainSource(),
    ...sources,
  }), /must import css\/leaderboard\.css first/);
});
