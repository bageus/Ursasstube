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

const STORE = `/* ===== STORE ===== */
#storeScreen { display: none; }`;

const DARK_SCREEN = `/* ===== DARK SCREEN ===== */
#darkScreen { display: none; }`;

const RULES = `/* ===== FOOTER RULES LINK ===== */
.footer-rules-link { display: inline-flex; }

/* ===== RULES OVERLAY ===== */
#rulesScreen { display: none; }`;

const GAME_OVER_AUDIO = `/* ===== GAME OVER AUDIO NAV ===== */
.go-audio-nav { display: flex; }`;

const ANIMATIONS = `/* ===== ANIMATIONS ===== */
@keyframes fadeIn { to { opacity: 1; } }`;

const RESPONSIVE = `/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  #gameStart { padding-top: 72px; }
}`;

const ICON_ATLAS = `/* ===== ICON ATLAS SPRITES ===== */
.icon-atlas { display: inline-block; }`;

function styleSource() {
  return `${BACKGROUND}

${HERO}

${TITLE}

${HOOK}

${LEADERBOARD}

${GAMEPLAY}

${GAME_OVER}

${STORE}

${DARK_SCREEN}

${RULES}

${GAME_OVER_AUDIO}

${ANIMATIONS}

${RESPONSIVE}

${ICON_ATLAS}
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
    gameOverSource: `${GAME_OVER}\n\n${GAME_OVER_AUDIO}\n`,
    storeSource: `${STORE}\n`,
    rulesSource: `${RULES}\n`,
    responsiveSource: `${RESPONSIVE}\n`,
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

  assert.equal(result.stagedDuplicateCount, 10);
  assert.equal(result.extractedCount, 0);
  assert.equal(result.sections.startScreen.state, 'staged-duplicate');
  assert.equal(result.sections.gameplay.state, 'staged-duplicate');
  assert.equal(result.sections['game-over-screen'].state, 'staged-duplicate');
  assert.equal(result.sections['game-over-audio'].state, 'staged-duplicate');
  assert.equal(result.sections.store.state, 'staged-duplicate');
  assert.equal(result.sections.rules.state, 'staged-duplicate');
  assert.equal(result.sections.responsive.state, 'staged-duplicate');
});

test('analyzeCssStagedSections accepts sections after duplicate removal', () => {
  const result = analyzeCssStagedSections({
    styleSource: `${DARK_SCREEN}\n\n${ANIMATIONS}\n\n${ICON_ATLAS}\n`,
    mainSource: mainSource(),
    ...stagedSources(),
  });

  assert.equal(result.stagedDuplicateCount, 0);
  assert.equal(result.extractedCount, 10);
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
  const partialStyle = `${HOOK}\n\n${LEADERBOARD}\n\n${GAMEPLAY}\n\n${GAME_OVER}\n\n${STORE}\n\n${DARK_SCREEN}\n\n${RULES}\n\n${GAME_OVER_AUDIO}\n\n${ANIMATIONS}\n\n${RESPONSIVE}\n\n${ICON_ATLAS}\n`;

  assert.throws(() => analyzeCssStagedSections({
    styleSource: partialStyle,
    mainSource: mainSource(),
    ...stagedSources(),
  }), /partial start-screen extraction/);
});

test('analyzeCssStagedSections rejects partial game-over ownership', () => {
  const partialStyle = styleSource().replace(`${GAME_OVER_AUDIO}\n\n`, '');

  assert.throws(() => analyzeCssStagedSections({
    styleSource: partialStyle,
    mainSource: mainSource(),
    ...stagedSources(),
  }), /partial game-over extraction/);
});

test('analyzeCssStagedSections rejects rules drift', () => {
  const sources = stagedSources();
  sources.rulesSource = `${RULES.replace('inline-flex', 'block')}\n`;

  assert.throws(() => analyzeCssStagedSections({
    styleSource: styleSource(),
    mainSource: mainSource(),
    ...sources,
  }), /css\/rules\.css must match rules/);
});

test('analyzeCssStagedSections rejects responsive drift', () => {
  const sources = stagedSources();
  sources.responsiveSource = `${RESPONSIVE.replace('72px', '64px')}\n`;

  assert.throws(() => analyzeCssStagedSections({
    styleSource: styleSource(),
    mainSource: mainSource(),
    ...sources,
  }), /css\/responsive\.css must match responsive/);
});

test('analyzeCssStagedSections requires CSS import order', () => {
  const wrongOrder = [...IMPORT_ORDER];
  [wrongOrder[7], wrongOrder[8]] = [wrongOrder[8], wrongOrder[7]];

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
