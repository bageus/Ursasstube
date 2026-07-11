import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import {
  analyzeAndRemoveSections,
  extractBoundedSection,
  normalizeCss,
} from './remove-css-staged-duplicates.mjs';

const WALLET = '/* ===== WALLET CORNER ===== */\n#wallet { position: fixed; }';
const BASE = '/* ===== TOKENS / BASE ===== */\n:root { --bg: #000; }';
const BACKGROUND = '/* ===== BACKGROUND ===== */\n.stars { display: block; }';
const HERO = '/* ===== HERO / BEAR ===== */\n.bear { display: block; }';
const TITLE = '/* ===== TITLE / BUTTONS ===== */\n.title { display: block; }';
const START_HOOK = '/* ===== START HOOK ===== */\n.start-hook { display: block; }';
const LEADERBOARD = '/* ===== LEADERBOARD ===== */\n.lb { display: block; }';
const GAMEPLAY = '/* ===== GAME START ===== */\n#gameStart { display: flex; }\n\n/* ===== GAME CONTAINER ===== */\n#gameContainer { display: none; }';
const GAME_OVER = '/* ===== GAME OVER ===== */\n#gameOver { display: none; }';
const STORE = '/* ===== STORE ===== */\n#storeScreen { display: none; }';
const DARK_SCREEN = '/* ===== DARK SCREEN ===== */\n#darkScreen { display: none; }';
const GAME_OVER_AUDIO = '/* ===== GAME OVER AUDIO NAV ===== */\n.go-audio-nav { display: flex; }';
const ANIMATIONS = '/* ===== ANIMATIONS ===== */\n@keyframes fadeIn { to { opacity: 1; } }';

const SPECS = [
  { name: 'base', stagedPath: 'css/base.css', startMarker: '/* ===== TOKENS / BASE ===== */', nextMarker: '/* ===== WALLET CORNER ===== */', stagedMode: 'whole' },
  { name: 'background', stagedPath: 'css/background.css', startMarker: '/* ===== BACKGROUND ===== */', nextMarker: '/* ===== HERO / BEAR ===== */', stagedMode: 'whole' },
  { name: 'hero', stagedPath: 'css/hero.css', startMarker: '/* ===== HERO / BEAR ===== */', nextMarker: '/* ===== TITLE / BUTTONS ===== */', stagedMode: 'whole' },
  { name: 'title-buttons', stagedPath: 'css/start-screen.css', startMarker: '/* ===== TITLE / BUTTONS ===== */', nextMarker: '/* ===== START HOOK ===== */', stagedMode: 'bounded' },
  { name: 'start-hook', stagedPath: 'css/start-screen.css', startMarker: '/* ===== START HOOK ===== */', nextMarker: '/* ===== LEADERBOARD ===== */', stagedMode: 'to-end' },
  { name: 'leaderboard', stagedPath: 'css/leaderboard.css', startMarker: '/* ===== LEADERBOARD ===== */', nextMarker: '/* ===== GAME START ===== */', stagedMode: 'whole' },
  { name: 'gameplay', stagedPath: 'css/gameplay.css', startMarker: '/* ===== GAME START ===== */', nextMarker: '/* ===== GAME OVER ===== */', stagedMode: 'whole' },
  { name: 'game-over-screen', stagedPath: 'css/game-over.css', startMarker: '/* ===== GAME OVER ===== */', nextMarker: '/* ===== STORE ===== */', stagedMode: 'bounded', stagedNextMarker: '/* ===== GAME OVER AUDIO NAV ===== */', ownershipGroup: 'game-over' },
  { name: 'game-over-audio', stagedPath: 'css/game-over.css', startMarker: '/* ===== GAME OVER AUDIO NAV ===== */', nextMarker: '/* ===== ANIMATIONS ===== */', stagedMode: 'to-end', ownershipGroup: 'game-over' },
  { name: 'store', stagedPath: 'css/store.css', startMarker: '/* ===== STORE ===== */', nextMarker: '/* ===== DARK SCREEN ===== */', stagedMode: 'whole' },
];

function styleSource() {
  return `${BASE}\n\n${WALLET}\n\n${BACKGROUND}\n\n${HERO}\n\n${TITLE}\n\n${START_HOOK}\n\n${LEADERBOARD}\n\n${GAMEPLAY}\n\n${GAME_OVER}\n\n${STORE}\n\n${DARK_SCREEN}\n\n${GAME_OVER_AUDIO}\n\n${ANIMATIONS}\n`;
}

function stagedSources(overrides = {}) {
  return new Map([
    ['css/base.css', `${BASE}\n`],
    ['css/background.css', `${BACKGROUND}\n`],
    ['css/hero.css', `${HERO}\n`],
    ['css/start-screen.css', `@import './leaderboard.css';\n\n${TITLE}\n\n${START_HOOK}\n`],
    ['css/leaderboard.css', `${LEADERBOARD}\n`],
    ['css/gameplay.css', `${GAMEPLAY}\n`],
    ['css/game-over.css', `${GAME_OVER}\n\n${GAME_OVER_AUDIO}\n`],
    ['css/store.css', `${STORE}\n`],
    ...Object.entries(overrides),
  ]);
}

test('normalizeCss ignores comments and whitespace but preserves declarations', () => {
  assert.equal(normalizeCss('/* note */\n.a { color: red; }'), '.a { color: red; }');
  assert.notEqual(normalizeCss('.a { color: red; }'), normalizeCss('.a { color: blue; }'));
});

test('extractBoundedSection returns marker-bounded source and indexes', () => {
  const result = extractBoundedSection(styleSource(), '/* ===== HERO / BEAR ===== */', '/* ===== TITLE / BUTTONS ===== */');
  assert.equal(result.source, HERO);
  assert.ok(result.startIndex > 0);
  assert.ok(result.nextIndex > result.startIndex);
});

test('analyzeAndRemoveSections removes all staged duplicates atomically', () => {
  const result = analyzeAndRemoveSections({
    styleSource: styleSource(),
    stagedSources: stagedSources(),
    specs: SPECS,
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.removed.map((item) => item.name), [
    'base',
    'background',
    'hero',
    'title-buttons',
    'start-hook',
    'leaderboard',
    'gameplay',
    'game-over-screen',
    'game-over-audio',
    'store',
  ]);
  assert.match(result.styleSource, /^\/\* ===== WALLET CORNER ===== \*\//);
  assert.match(result.styleSource, /\/\* ===== DARK SCREEN ===== \*\//);
  assert.match(result.styleSource, /\/\* ===== ANIMATIONS ===== \*\//);
  assert.doesNotMatch(result.styleSource, /TOKENS \/ BASE|BACKGROUND|HERO \/ BEAR|TITLE \/ BUTTONS|START HOOK|LEADERBOARD|GAME START|GAME CONTAINER|GAME OVER|STORE/);
});

test('analyzeAndRemoveSections rejects a staged mismatch before returning output', () => {
  assert.throws(() => analyzeAndRemoveSections({
    styleSource: styleSource(),
    stagedSources: stagedSources({ 'css/hero.css': `${HERO.replace('block', 'none')}\n` }),
    specs: SPECS,
  }), /hero section.*does not match/);
});

test('analyzeAndRemoveSections rejects partial game-over ownership', () => {
  const partialStyle = styleSource().replace(`${GAME_OVER_AUDIO}\n\n`, '');

  assert.throws(() => analyzeAndRemoveSections({
    styleSource: partialStyle,
    stagedSources: stagedSources(),
    specs: SPECS,
  }), /partial game-over extraction/);
});

test('analyzeAndRemoveSections accepts already extracted sections', () => {
  const result = analyzeAndRemoveSections({
    styleSource: `${WALLET}\n\n${DARK_SCREEN}\n\n${ANIMATIONS}\n`,
    stagedSources: stagedSources(),
    specs: SPECS,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.alreadyExtracted, SPECS.map((spec) => spec.name));
});

test('analyzeAndRemoveSections supports a partially extracted migration', () => {
  const source = `${WALLET}\n\n${BACKGROUND}\n\n${HERO}\n\n${TITLE}\n\n${START_HOOK}\n\n${LEADERBOARD}\n\n${GAMEPLAY}\n\n${GAME_OVER}\n\n${STORE}\n\n${DARK_SCREEN}\n\n${GAME_OVER_AUDIO}\n\n${ANIMATIONS}\n`;
  const result = analyzeAndRemoveSections({ styleSource: source, stagedSources: stagedSources(), specs: SPECS });

  assert.deepEqual(result.alreadyExtracted, ['base']);
  assert.equal(result.removed.length, 9);
  assert.match(result.styleSource, /^\/\* ===== WALLET CORNER ===== \*\//);
});

test('CLI dry-run leaves style.css unchanged and reports removals', () => {
  const root = mkdtempSync(join(tmpdir(), 'css-duplicate-removal-'));
  mkdirSync(join(root, 'css'));

  writeFileSync(join(root, 'css/style.css'), styleSource());
  writeFileSync(join(root, 'css/base.css'), `${BASE}\n`);
  writeFileSync(join(root, 'css/background.css'), `${BACKGROUND}\n`);
  writeFileSync(join(root, 'css/hero.css'), `${HERO}\n`);
  writeFileSync(join(root, 'css/start-screen.css'), `@import './leaderboard.css';\n\n${TITLE}\n\n${START_HOOK}\n`);
  writeFileSync(join(root, 'css/leaderboard.css'), `${LEADERBOARD}\n`);
  writeFileSync(join(root, 'css/gameplay.css'), `${GAMEPLAY}\n`);
  writeFileSync(join(root, 'css/game-over.css'), `${GAME_OVER}\n\n${GAME_OVER_AUDIO}\n`);
  writeFileSync(join(root, 'css/store.css'), `${STORE}\n`);

  const scriptPath = new URL('./remove-css-staged-duplicates.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [scriptPath, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"changed": true/);
  assert.equal(readFileSync(join(root, 'css/style.css'), 'utf8'), styleSource());
});

test('CLI writes the extracted style when not in dry-run mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'css-duplicate-removal-write-'));
  mkdirSync(join(root, 'css'));

  writeFileSync(join(root, 'css/style.css'), styleSource());
  writeFileSync(join(root, 'css/base.css'), `${BASE}\n`);
  writeFileSync(join(root, 'css/background.css'), `${BACKGROUND}\n`);
  writeFileSync(join(root, 'css/hero.css'), `${HERO}\n`);
  writeFileSync(join(root, 'css/start-screen.css'), `@import './leaderboard.css';\n\n${TITLE}\n\n${START_HOOK}\n`);
  writeFileSync(join(root, 'css/leaderboard.css'), `${LEADERBOARD}\n`);
  writeFileSync(join(root, 'css/gameplay.css'), `${GAMEPLAY}\n`);
  writeFileSync(join(root, 'css/game-over.css'), `${GAME_OVER}\n\n${GAME_OVER_AUDIO}\n`);
  writeFileSync(join(root, 'css/store.css'), `${STORE}\n`);

  const scriptPath = new URL('./remove-css-staged-duplicates.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const nextStyle = readFileSync(join(root, 'css/style.css'), 'utf8');
  assert.match(nextStyle, /^\/\* ===== WALLET CORNER ===== \*\//);
  assert.match(nextStyle, /\/\* ===== DARK SCREEN ===== \*\//);
  assert.match(nextStyle, /\/\* ===== ANIMATIONS ===== \*\//);
});
