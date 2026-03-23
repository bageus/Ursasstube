import { CONFIG, isMobile } from './config.js';

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

/* ===== DOM CACHE ===== */
const DOM = {
  canvas: document.getElementById("game"),
  gameStart: document.getElementById("gameStart"),
  gameOver: document.getElementById("gameOver"),

  distanceVal: document.getElementById("distanceVal"),
  scoreVal: document.getElementById("scoreVal"),
  shieldVal: document.getElementById("shieldVal"),
  magnetVal: document.getElementById("magnetVal"),
  invertVal: document.getElementById("invertVal"),
  multiplierVal: document.getElementById("multiplierVal"),
  spinVal: document.getElementById("spinVal"),
  goldVal: document.getElementById("goldVal"),
  silverVal: document.getElementById("silverVal"),
  speedVal: document.getElementById("speedVal"),
  coinsCountVal: document.getElementById("coinsCountVal"),

  walletBtn: document.getElementById("walletBtn"),
  walletInfo: document.getElementById("walletInfo"),
  walletRank: document.getElementById("walletRank"),
  walletBest: document.getElementById("walletBest"),
  walletGold: document.getElementById("walletGold"),
  walletSilver: document.getElementById("walletSilver"),

  startBtn: document.getElementById("startBtn"),
  storeBtn: document.getElementById("storeBtn")
};

const ctx = DOM.canvas.getContext("2d", { alpha: false, antialias: false });


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
  
  renderQuality: isMobile ? 'medium' : 'high',
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
  state: "idle",
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
let bestScore = localStorage.getItem('bestScore') ? parseInt(localStorage.getItem('bestScore')) : 0;
let bestDistance = localStorage.getItem('bestDistance') ? parseInt(localStorage.getItem('bestDistance')) : 0;

function getBestScore() {
  return bestScore;
}

function getBestDistance() {
  return bestDistance;
}

function setBestScore(value) {
  bestScore = Number.isFinite(value) ? value : 0;
  localStorage.setItem('bestScore', String(bestScore));
}

function setBestDistance(value) {
  bestDistance = Number.isFinite(value) ? value : 0;
  localStorage.setItem('bestDistance', String(bestDistance));
}

function getLaneCooldown() {
  return laneCooldown;
}

function setLaneCooldown(value) {
  laneCooldown = Number.isFinite(value) ? value : 0;
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
  getBestScore,
  getBestDistance,
  setBestScore,
  setBestDistance
};
