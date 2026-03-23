/* ===== CONFIG ===== */
const BACKEND_URL = "https://ursassbackend-production.up.railway.app";
const urlParams = new URLSearchParams(window.location.search);
const backendMode = (urlParams.get('backend') || localStorage.getItem('backendMode') || 'live').trim().toLowerCase();
const BACKEND_DISABLED = backendMode === 'off' || backendMode === 'offline' || backendMode === 'mock';
console.log(`🔗 Backend URL: ${BACKEND_URL}`);
console.log(`🧪 Backend mode: ${BACKEND_DISABLED ? 'offline' : 'live'}`);

// WalletConnect v2 Project ID — get yours at https://cloud.walletconnect.com
const WC_PROJECT_ID = '94ac301bc9061f95f28385fb3a3d8f2c';

const CONFIG = {
  LANES: [-1, 0, 1],
  TUBE_RADIUS: 278,
  PLAYER_OFFSET: 0.78,
  PLAYER_Z: 0.3,
  FRAME_SIZE: 64,

  SPEED_MIN: 0.01,
  SPEED_MAX: 0.25,
  SPEED_START: 0.025,
  SPEED_INCREMENT: 0.0004,
  SPEED_INCREMENT_INTERVAL: 100,
  SPEED_INCREMENT_BOOST_DISTANCE: 2000,
  SPEED_INCREMENT_BOOST_MULTIPLIER: 2,
  SPEED_BONUS_AMOUNT: 0.004,

  TUBE_SEGMENTS: 20,
  TUBE_DEPTH_STEPS: 84,
  TUBE_Z_STEP: 0.086,
  BASE_ROTATION_SPEED: 1.2,
  MAX_ROTATION_SPEED: 3,

  COIN_SPAWN_INTERVAL: 1400,
  COIN_SPACING: [15, 30, 60],
  OBSTACLE_SPACING: [20, 40, 80],
  BONUS_SPACING: [70, 150, 300],
  MAX_OBSTACLES: 8,
  MAX_BONUSES: 4,
  MAX_COINS: 15,

  ANIM_SPEED: 0.15,
  LANE_COOLDOWN_FRAMES: 8,
  LANE_TRANSITION_FRAMES: 6,
  SPIN_COOLDOWN_TIME: 1800,
  SPIN_DURATION: 0.6,
  SPIN_COOLDOWN_UPGRADE_SECONDS: [6, 12, 20],

  MIN_CURVE_TIME: 5000,
  MAX_CURVE_TIME: 15000,
  MAX_CURVE_ANGLE: 0.45,
  CURVE_OFFSET_X: 0.35,
  CURVE_OFFSET_Y: 0.25,

  TEX_SIZE: 256,
  TEX_PIXEL_SIZE: 8
};

// Mobile detection — reduce tube polygon count for performance
const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || (window.innerWidth < 600);
if (isMobile) {
  CONFIG.TUBE_SEGMENTS = 13;
  CONFIG.TUBE_DEPTH_STEPS = 48;
}

const RENDER_BACKENDS = Object.freeze({
  CANVAS: 'canvas',
  PHASER: 'phaser'
});

const DEFAULT_RENDER_BACKEND = (() => {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('renderer') || localStorage.getItem('rendererBackend') || RENDER_BACKENDS.CANVAS;
  return requested === RENDER_BACKENDS.PHASER ? RENDER_BACKENDS.PHASER : RENDER_BACKENDS.CANVAS;
})();

const BONUS_TYPES = {
  SHIELD: "shield",
  X2: "x2",
  SPEED_DOWN: "speed_down",
  SPEED_UP: "speed_up",
  MAGNET: "magnet",
  INVERT: "invert",
  RECHARGE: "recharge",
  SCORE_300: "score_300",
  SCORE_500: "score_500",
  SCORE_MINUS_300: "score_minus_300",
  SCORE_MINUS_500: "score_minus_500"
};

export { BACKEND_URL, BACKEND_DISABLED, WC_PROJECT_ID, CONFIG, BONUS_TYPES, DEFAULT_RENDER_BACKEND, RENDER_BACKENDS, isMobile };
