import { CONFIG } from './config.js';

// @ts-check

/**
 * @typedef {Object} GameState
 * @property {boolean} running
 * @property {number} distance
 * @property {number} score
 * @property {number} speed
 * @property {number} baseMultiplier
 * @property {number} silverCoins
 * @property {number} goldCoins
 * @property {number} lastTime
 * @property {number} deltaTime
 * @property {number} lastCoinSpawnDistance
 * @property {number} lastObstacleSpawnDistance
 * @property {number} lastObstacleDistance
 * @property {number} lastBonusDistance
 * @property {number} lastCoinDistance
 * @property {number} tubeRotation
 * @property {number} tubeScroll
 * @property {number} tubeWaveMod
 * @property {number} curveTimer
 * @property {number} curveDirection
 * @property {number} tubeCurveAngle
 * @property {number} tubeCurveStrength
 * @property {number} curveTransitionDuration
 * @property {boolean} spinActive
 * @property {number} spinProgress
 * @property {number} spinCooldown
 * @property {string} bonusText
 * @property {number} bonusTextTimer
 * @property {number} x2Timer
 * @property {number} uiUpdateFrame
 * @property {number} renderFrame
 * @property {number} centerOffsetX
 * @property {number} centerOffsetY
 * @property {number} spinCooldownReduction
 * @property {number} invertScoreMultiplier
 * @property {boolean} radarActive
 * @property {Array<unknown>} radarHints
 * @property {number} spinAlertLevel
 * @property {number} spinAlertTimer
 * @property {number} spinAlertCountdown
 * @property {number} spinAlertPendingDelay
 * @property {number} spinRingPendingCount
 * @property {boolean} perfectSpinWindow
 * @property {number} perfectSpinWindowTimer
 * @property {number} lastSpinAlertRingDist
 * @property {number} spinComboCount
 * @property {boolean} spinComboRingActive
 * @property {'high'|'medium'|'low'} renderQuality
 * @property {number} lowFpsStreak
 * @property {number} highFpsStreak
 * @property {{tubeQuads:number, visibleObstacles:number, visibleBonuses:number, visibleCoins:number, visibleSpinTargets:number, estimatedTubePasses:number, tubeMs:number, drawMs:number, updateMs:number, uiMs:number, frameMs:number}} debugStats
 */

/**
 * @typedef {Object} PlayerState
 * @property {number} x
 * @property {number} y
 * @property {number} lane
 * @property {number} targetLane
 * @property {number} laneAnimFrame
 * @property {number} lanePrev
 * @property {boolean} isLaneTransition
 * @property {'idle'|'left'|'right'|'spin'} state
 * @property {number} frameIndex
 * @property {number} frameTimer
 * @property {boolean} shield
 * @property {number} shieldCount
 * @property {boolean} magnetActive
 * @property {number} magnetTimer
 * @property {boolean} invertActive
 * @property {number} invertTimer
 * @property {boolean} isSpin
 */

const DOM_IDS = {
  canvas: 'game',
  gameStart: 'gameStart',
  gameOver: 'gameOver',
  gameContainer: 'gameContainer',
  storeScreen: 'storeScreen',
  rulesScreen: 'rulesScreen',
  darkScreen: 'darkScreen',
  audioTogglesGlobal: 'audioTogglesGlobal',
  walletCorner: 'walletCorner',
  ridesInfo: 'ridesInfo',
  ridesText: 'ridesText',
  ridesTimer: 'ridesTimer',
  menuEyes: 'menuEyes',
  startTransitionEyes: 'startTransitionEyes',
  crashFlyer: 'crashFlyer',
  distanceVal: 'distanceVal',
  scoreVal: 'scoreVal',
  shieldVal: 'shieldVal',
  magnetVal: 'magnetVal',
  invertVal: 'invertVal',
  multiplierVal: 'multiplierVal',
  spinVal: 'spinVal',
  goldVal: 'goldVal',
  silverVal: 'silverVal',
  speedVal: 'speedVal',
  coinsCountVal: 'coinsCountVal',
  walletBtn: 'walletBtn',
  walletInfo: 'walletInfo',
  walletRank: 'walletRank',
  walletBest: 'walletBest',
  walletGold: 'walletGold',
  walletSilver: 'walletSilver',
  startBtn: 'startBtn',
  storeBtn: 'storeBtn',
  rulesLink: 'rulesLink',
  restartBtn: 'restartBtn',
  menuBtn: 'menuBtn',
  storeBackBtn: 'storeBackBtn',
  rulesBackBtn: 'rulesBackBtn',
  goReason: 'goReason',
  goDistance: 'goDistance',
  goScore: 'goScore',
  goGold: 'goGold',
  goSilver: 'goSilver',
  goTime: 'goTime',
  startLeaderboardList: 'startLeaderboardList',
  gameOverLeaderboardNotice: 'gameOverLeaderboardNotice',
  gameOverLeaderboardList: 'gameOverLeaderboardList'
};

const domCache = new Map();

function getDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function resolveDomNode(key) {
  if (domCache.has(key)) {
    return domCache.get(key) ?? null;
  }

  const doc = getDocument();
  const id = DOM_IDS[key];
  const node = doc && id ? doc.getElementById(id) : null;
  domCache.set(key, node ?? null);
  return node ?? null;
}

function setDomNode(key, value) {
  domCache.set(key, value ?? null);
  return true;
}

const DOM = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (!(prop in DOM_IDS)) return undefined;
    return resolveDomNode(prop);
  },
  set(_target, prop, value) {
    if (typeof prop !== 'string') return false;
    return setDomNode(prop, value);
  },
  ownKeys() {
    return Reflect.ownKeys(DOM_IDS);
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop !== 'string' || !(prop in DOM_IDS)) return undefined;
    return {
      configurable: true,
      enumerable: true,
      value: resolveDomNode(prop),
      writable: true
    };
  }
});

let canvasContext = null;

function getCanvasContext() {
  if (canvasContext) return canvasContext;
  const canvas = DOM.canvas;
  canvasContext = canvas?.getContext('2d', { alpha: false, antialias: false }) ?? null;
  return canvasContext;
}

const ctx = new Proxy({}, {
  get(_target, prop) {
    const context = getCanvasContext();
    const value = context?.[prop];
    return typeof value === 'function' ? value.bind(context) : value;
  },
  set(_target, prop, value) {
    const context = getCanvasContext();
    if (!context) return false;
    context[prop] = value;
    return true;
  },
  has(_target, prop) {
    const context = getCanvasContext();
    return !!context && prop in context;
  }
});

/* ===== GAME STATE ===== */
/** @type {GameState} */
const gameState = {
  running: false,
  distance: 0,
  score: 0,
  speed: CONFIG.SPEED_START,
  baseMultiplier: 1,
  silverCoins: 0,
  goldCoins: 0,

  lastTime: 0,
  deltaTime: 0,

  lastCoinSpawnDistance: 0,
  lastObstacleSpawnDistance: 0,
  lastObstacleDistance: 0,
  lastBonusDistance: 0,
  lastCoinDistance: 0,

  tubeRotation: 0,
  tubeScroll: 0,
  tubeWaveMod: 0,

  curveTimer: 0,
  curveDirection: 0,
  tubeCurveAngle: 0,
  tubeCurveStrength: 0,
  curveTransitionDuration: 0,

  spinActive: false,
  spinProgress: 0,
  spinCooldown: 0,

  bonusText: "",
  bonusTextTimer: 0,

  x2Timer: 0,
  uiUpdateFrame: 0,
  renderFrame: 0,

  centerOffsetX: 0,
  centerOffsetY: 0,
  spinCooldownReduction: 0,
  invertScoreMultiplier: 1.0,

  radarActive: false,
  radarHints: [],

  spinAlertLevel: 0,
  spinAlertTimer: 0,
  spinAlertCountdown: 0,
  spinAlertPendingDelay: -1,
  spinRingPendingCount: 0,
  perfectSpinWindow: false,
  perfectSpinWindowTimer: 0,
  lastSpinAlertRingDist: -999,

  spinComboCount: 0,
  spinComboRingActive: false,

  renderQuality: 'high',
  lowFpsStreak: 0,
  highFpsStreak: 0,
  debugStats: {
    tubeQuads: 0,
    visibleObstacles: 0,
    visibleBonuses: 0,
    visibleCoins: 0,
    visibleSpinTargets: 0,
    estimatedTubePasses: 0,
    tubeMs: 0,
    drawMs: 0,
    updateMs: 0,
    uiMs: 0,
    frameMs: 0
  }
};

/** @type {PlayerState} */
const player = {
  x: 0, y: 0,
  lane: 0, targetLane: 0,
  laneAnimFrame: 0, lanePrev: 0,
  isLaneTransition: false,
  state: 'idle',
  frameIndex: 0, frameTimer: 0,
  shield: false,
  shieldCount: 0,
  magnetActive: false, magnetTimer: 0,
  invertActive: false, invertTimer: 0,
  isSpin: false
};

const curves = {
  current: { direction: 0, strength: 0 },
  next: { direction: 0, strength: 0.5 }
};

const obstacles = [];
const bonuses = [];
const coins = [];
const spinTargets = [];
const inputQueue = [];

let laneCooldown = 0;
let bestScore = null;
let bestDistance = null;

function readStoredNumber(key) {
  if (typeof localStorage === 'undefined') return 0;
  const rawValue = localStorage.getItem(key);
  if (!rawValue) return 0;
  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function ensureBestValuesLoaded() {
  if (bestScore === null) {
    bestScore = readStoredNumber('bestScore');
  }
  if (bestDistance === null) {
    bestDistance = readStoredNumber('bestDistance');
  }
}

function getBestScore() {
  ensureBestValuesLoaded();
  return bestScore ?? 0;
}

function getBestDistance() {
  ensureBestValuesLoaded();
  return bestDistance ?? 0;
}

function setBestScore(value) {
  bestScore = Number.isFinite(value) ? value : 0;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('bestScore', String(bestScore));
  }
}

function setBestDistance(value) {
  bestDistance = Number.isFinite(value) ? value : 0;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('bestDistance', String(bestDistance));
  }
}

function getLaneCooldown() {
  return laneCooldown;
}

function setLaneCooldown(value) {
  laneCooldown = Number.isFinite(value) ? value : 0;
}

function initializeGameplayRun({
  now = 0,
  speed = CONFIG.SPEED_START,
  nextCurveDirection = 0,
  nextCurveStrength = 0.5
} = {}) {
  gameState.running = true;
  gameState.distance = 0;
  gameState.score = 0;
  gameState.speed = speed;
  gameState.baseMultiplier = 1;
  gameState.silverCoins = 0;
  gameState.goldCoins = 0;
  gameState.curveTimer = 0;
  gameState.lastTime = Number.isFinite(now) ? now : 0;
  gameState.lastObstacleDistance = 0;
  gameState.lastBonusDistance = 0;
  gameState.lastCoinSpawnDistance = 0;
  gameState.lastObstacleSpawnDistance = 0;

  curves.current.direction = 0;
  curves.current.strength = 0;
  curves.next.direction = nextCurveDirection;
  curves.next.strength = nextCurveStrength;

  player.lane = 0;
  player.targetLane = 0;
  player.shield = false;
  player.shieldCount = 0;
}

function applyGameplayUpgradeState({
  shieldCount = 0,
  spinCooldownReduction = 0,
  invertScoreMultiplier = 1,
  radarActive = false,
  spinAlertLevel = 0
} = {}) {
  player.shieldCount = Math.max(0, Number(shieldCount) || 0);
  player.shield = player.shieldCount > 0;
  gameState.spinCooldownReduction = Number(spinCooldownReduction) || 0;
  gameState.invertScoreMultiplier = Number(invertScoreMultiplier) || 1;
  gameState.radarActive = Boolean(radarActive);
  gameState.spinAlertLevel = Math.max(0, Number(spinAlertLevel) || 0);
}

function clearGameplayCollections() {
  obstacles.length = 0;
  bonuses.length = 0;
  coins.length = 0;
  spinTargets.length = 0;
  inputQueue.length = 0;
}

export {
  DOM,
  ctx,
  gameState,
  player,
  curves,
  obstacles,
  bonuses,
  coins,
  spinTargets,
  inputQueue,
  getLaneCooldown,
  setLaneCooldown,
  initializeGameplayRun,
  applyGameplayUpgradeState,
  clearGameplayCollections,
  getBestScore,
  getBestDistance,
  setBestScore,
  setBestDistance
};
