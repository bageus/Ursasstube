import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_STYLE_PATH = 'css/style.css';
const DEFAULT_MAIN_PATH = 'js/main.js';
const LEADERBOARD_IMPORT = "@import './leaderboard.css';";

const IMPORT_ORDER = [
  "import '../css/base.css';",
  "import '../css/background.css';",
  "import '../css/hero.css';",
  "import '../css/start-screen.css';",
  "import '../css/gameplay.css';",
  "import '../css/game-over.css';",
  "import '../css/store.css';",
  "import '../css/rules.css';",
  "import '../css/style.css';",
];

const SECTION_SPECS = [
  {
    name: 'background',
    sourceName: 'background',
    path: 'css/background.css',
    startMarker: '/* ===== BACKGROUND ===== */',
    nextMarker: '/* ===== HERO / BEAR ===== */',
  },
  {
    name: 'hero',
    sourceName: 'hero',
    path: 'css/hero.css',
    startMarker: '/* ===== HERO / BEAR ===== */',
    nextMarker: '/* ===== TITLE / BUTTONS ===== */',
  },
  {
    name: 'leaderboard',
    sourceName: 'leaderboard',
    path: 'css/leaderboard.css',
    startMarker: '/* ===== LEADERBOARD ===== */',
    nextMarker: '/* ===== GAME START ===== */',
  },
  {
    name: 'gameplay',
    sourceName: 'gameplay',
    path: 'css/gameplay.css',
    startMarker: '/* ===== GAME START ===== */',
    nextMarker: '/* ===== GAME OVER ===== */',
  },
  {
    name: 'game-over-screen',
    sourceName: 'game-over',
    path: 'css/game-over.css',
    startMarker: '/* ===== GAME OVER ===== */',
    nextMarker: '/* ===== STORE ===== */',
    featureMode: 'bounded',
    featureNextMarker: '/* ===== GAME OVER AUDIO NAV ===== */',
    ownershipGroup: 'game-over',
  },
  {
    name: 'game-over-audio',
    sourceName: 'game-over',
    path: 'css/game-over.css',
    startMarker: '/* ===== GAME OVER AUDIO NAV ===== */',
    nextMarker: '/* ===== ANIMATIONS ===== */',
    featureMode: 'to-end',
    ownershipGroup: 'game-over',
  },
  {
    name: 'store',
    sourceName: 'store',
    path: 'css/store.css',
    startMarker: '/* ===== STORE ===== */',
    nextMarker: '/* ===== DARK SCREEN ===== */',
  },
  {
    name: 'rules',
    sourceName: 'rules',
    path: 'css/rules.css',
    startMarker: '/* ===== FOOTER RULES LINK ===== */',
    nextMarker: '/* ===== GAME OVER AUDIO NAV ===== */',
  },
];

const START_SCREEN_SECTIONS = [
  {
    startMarker: '/* ===== TITLE / BUTTONS ===== */',
    nextMarker: '/* ===== START HOOK ===== */',
  },
  {
    startMarker: '/* ===== START HOOK ===== */',
    nextMarker: '/* ===== LEADERBOARD ===== */',
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  const readArg = (name, fallback) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;

  return {
    stylePath: readArg('style', DEFAULT_STYLE_PATH),
    mainPath: readArg('main', DEFAULT_MAIN_PATH),
    backgroundPath: readArg('background', 'css/background.css'),
    heroPath: readArg('hero', 'css/hero.css'),
    startScreenPath: readArg('start-screen', 'css/start-screen.css'),
    leaderboardPath: readArg('leaderboard', 'css/leaderboard.css'),
    gameplayPath: readArg('gameplay', 'css/gameplay.css'),
    gameOverPath: readArg('game-over', 'css/game-over.css'),
    storePath: readArg('store', 'css/store.css'),
    rulesPath: readArg('rules', 'css/rules.css'),
  };
}

function normalizeCss(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(styleSource, startMarker, nextMarker) {
  const source = String(styleSource || '').replace(/\r\n/g, '\n');
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) return null;

  const nextIndex = source.indexOf(nextMarker, startIndex + startMarker.length);
  if (nextIndex < 0) {
    throw new Error(`css/style.css contains ${startMarker} but no following ${nextMarker}`);
  }

  return source.slice(startIndex, nextIndex).trimEnd();
}

function extractFeatureSection(featureSource, spec) {
  const source = String(featureSource || '').replace(/\r\n/g, '\n').trimEnd();
  if (!spec.featureMode) return source;

  const startIndex = source.indexOf(spec.startMarker);
  if (startIndex < 0) {
    throw new Error(`${spec.path} must contain ${spec.startMarker}`);
  }

  if (spec.featureMode === 'to-end') {
    return source.slice(startIndex).trimEnd();
  }

  const nextMarker = spec.featureNextMarker || spec.nextMarker;
  const nextIndex = source.indexOf(nextMarker, startIndex + spec.startMarker.length);
  if (nextIndex < 0) {
    throw new Error(`${spec.path} must contain ${nextMarker}`);
  }

  return source.slice(startIndex, nextIndex).trimEnd();
}

function assertImportOrder(mainSource) {
  const source = String(mainSource || '');
  let previousIndex = -1;

  for (const statement of IMPORT_ORDER) {
    const index = source.indexOf(statement);
    if (index < 0) {
      throw new Error(`js/main.js must include ${statement}`);
    }
    if (index <= previousIndex) {
      throw new Error('js/main.js CSS imports must remain ordered: base, background, hero, start-screen, gameplay, game-over, store, rules, style');
    }
    previousIndex = index;
  }
}

function stripLeaderboardImport(startScreenSource) {
  const source = String(startScreenSource || '').replace(/\r\n/g, '\n');
  if (!source.startsWith(LEADERBOARD_IMPORT)) {
    throw new Error('css/start-screen.css must import css/leaderboard.css first');
  }

  return source.slice(LEADERBOARD_IMPORT.length).replace(/^\s+/, '');
}

function analyzeSingleSection(spec, featureSource, styleSource) {
  const styleSection = extractSection(styleSource, spec.startMarker, spec.nextMarker);
  const featureSection = extractFeatureSection(featureSource, spec);
  const featureLines = featureSection.split('\n').length;

  if (styleSection === null) {
    return {
      state: 'extracted',
      featureLines,
      hasStyleDuplicate: false,
    };
  }

  if (normalizeCss(featureSection) !== normalizeCss(styleSection)) {
    throw new Error(`${spec.path} must match ${spec.name} in css/style.css before duplicate removal`);
  }

  return {
    state: 'staged-duplicate',
    featureLines,
    hasStyleDuplicate: true,
  };
}

function assertOwnershipGroups(sections) {
  const groupedNames = new Map();
  for (const spec of SECTION_SPECS) {
    if (!spec.ownershipGroup) continue;
    const names = groupedNames.get(spec.ownershipGroup) || [];
    names.push(spec.name);
    groupedNames.set(spec.ownershipGroup, names);
  }

  for (const [group, names] of groupedNames) {
    const states = new Set(names.map((name) => sections[name].state));
    if (states.size > 1) {
      throw new Error(`css/style.css has a partial ${group} extraction; ${names.join(' and ')} must move together`);
    }
  }
}

function analyzeStartScreen({ startScreenSource, styleSource }) {
  const sections = START_SCREEN_SECTIONS.map(({ startMarker, nextMarker }) => (
    extractSection(styleSource, startMarker, nextMarker)
  ));
  const presentCount = sections.filter(Boolean).length;

  if (presentCount > 0 && presentCount < sections.length) {
    throw new Error('css/style.css has a partial start-screen extraction; TITLE / BUTTONS and START HOOK must move together');
  }

  const featureSource = stripLeaderboardImport(startScreenSource);
  const featureLines = String(startScreenSource || '').replace(/\r\n/g, '\n').trimEnd().split('\n').length;

  if (presentCount === 0) {
    return {
      state: 'extracted',
      featureLines,
      hasStyleDuplicate: false,
    };
  }

  const stagedSource = sections.join('\n\n');
  if (normalizeCss(featureSource) !== normalizeCss(stagedSource)) {
    throw new Error('css/start-screen.css must match TITLE / BUTTONS and START HOOK in css/style.css before duplicate removal');
  }

  return {
    state: 'staged-duplicate',
    featureLines,
    hasStyleDuplicate: true,
  };
}

function analyzeCssStagedSections({
  styleSource,
  mainSource,
  backgroundSource,
  heroSource,
  startScreenSource,
  leaderboardSource,
  gameplaySource,
  gameOverSource,
  storeSource,
  rulesSource,
}) {
  assertImportOrder(mainSource);

  const sourceByName = {
    background: backgroundSource,
    hero: heroSource,
    leaderboard: leaderboardSource,
    gameplay: gameplaySource,
    'game-over': gameOverSource,
    store: storeSource,
    rules: rulesSource,
  };

  const sections = {};
  for (const spec of SECTION_SPECS) {
    sections[spec.name] = analyzeSingleSection(spec, sourceByName[spec.sourceName], styleSource);
  }
  assertOwnershipGroups(sections);
  sections.startScreen = analyzeStartScreen({ startScreenSource, styleSource });

  return {
    imports: IMPORT_ORDER.map((statement) => statement.match(/css\/([^']+)/)?.[1] || statement),
    sections,
    stagedDuplicateCount: Object.values(sections).filter((section) => section.hasStyleDuplicate).length,
    extractedCount: Object.values(sections).filter((section) => !section.hasStyleDuplicate).length,
  };
}

function runCssStagedSectionsCheck(options = parseArgs()) {
  const result = analyzeCssStagedSections({
    styleSource: readFileSync(options.stylePath, 'utf8'),
    mainSource: readFileSync(options.mainPath, 'utf8'),
    backgroundSource: readFileSync(options.backgroundPath, 'utf8'),
    heroSource: readFileSync(options.heroPath, 'utf8'),
    startScreenSource: readFileSync(options.startScreenPath, 'utf8'),
    leaderboardSource: readFileSync(options.leaderboardPath, 'utf8'),
    gameplaySource: readFileSync(options.gameplayPath, 'utf8'),
    gameOverSource: readFileSync(options.gameOverPath, 'utf8'),
    storeSource: readFileSync(options.storePath, 'utf8'),
    rulesSource: readFileSync(options.rulesPath, 'utf8'),
  });

  console.log('CSS staged sections check');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function main(argv = process.argv.slice(2)) {
  return runCssStagedSectionsCheck(parseArgs(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

export {
  IMPORT_ORDER,
  LEADERBOARD_IMPORT,
  SECTION_SPECS,
  START_SCREEN_SECTIONS,
  analyzeCssStagedSections,
  analyzeSingleSection,
  analyzeStartScreen,
  assertImportOrder,
  assertOwnershipGroups,
  extractFeatureSection,
  extractSection,
  normalizeCss,
  stripLeaderboardImport,
};
