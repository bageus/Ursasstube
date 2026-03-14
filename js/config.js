/* ===== CONFIG ===== */
const BACKEND_URL = "https://ursassbackend-production.up.railway.app";
console.log(`🔗 Backend URL: ${BACKEND_URL}`);

// WalletConnect v2 Project ID — get yours at https://cloud.walletconnect.com
const WC_PROJECT_ID = '94ac301bc9061f95f28385fb3a3d8f2c';

const CONFIG = {
  LANES: [-1, 0, 1],
  TUBE_RADIUS: 278,
  PLAYER_OFFSET: 0.78,
  PLAYER_Z: 0.25,
  FRAME_SIZE: 64,

  SPEED_MIN: 0.01,
  SPEED_MAX: 0.2,
  SPEED_START: 0.025,
  SPEED_INCREMENT: 0.0004,
  SPEED_INCREMENT_INTERVAL: 100,
  SPEED_INCREMENT_BOOST_DISTANCE: 2000,
  SPEED_INCREMENT_BOOST_MULTIPLIER: 2,
  SPEED_BONUS_AMOUNT: 0.004,

  TUBE_SEGMENTS: 48,
  TUBE_DEPTH_STEPS: 84,
  TUBE_Z_STEP: 0.042,
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
  CONFIG.TUBE_SEGMENTS = 24;
  CONFIG.TUBE_DEPTH_STEPS = 48;
}

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
