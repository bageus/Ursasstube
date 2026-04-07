import { logger } from '../logger.js';
import { BACKEND_URL } from '../config.js';
import { requestJson } from '../request.js';
import { isAuthenticated } from '../api.js';

const MAX_UNAUTH_UPGRADE_LEVELS = Object.freeze({
  x2_duration: 3,
  score_plus_300_mult: 3,
  score_plus_500_mult: 3,
  score_minus_300_mult: 3,
  score_minus_500_mult: 3,
  invert_score: 3,
  speed_up_mult: 3,
  speed_down_mult: 3,
  magnet_duration: 3,
  spin_cooldown: 3,
  shield: 1,
  shield_capacity: 2,
  spin_alert: 2,
  radar: 1
});

function buildUnauthMaxUpgrades() {
  return Object.fromEntries(
    Object.entries(MAX_UNAUTH_UPGRADE_LEVELS).map(([key, level]) => [key, {
      currentLevel: level,
      level,
      maxLevel: level
    }])
  );
}

function buildUnauthMaxEffects(effects = {}) {
  return {
    ...effects,
    start_with_shield: true,
    startWithShield: true,
    shield_level: 1,
    shieldLevel: 1,
    start_shield_count: 3,
    startShieldCount: 3,
    shield_start_count: 3,
    shield_capacity_level: 2,
    shield_capacity: 2,
    radar_active: true,
    radarActive: true,
    spin_alert_level: 2,
    spin_alert_mode: 'perfect',
    spin_alert_perfect: true,
    spin_alert_is_perfect: true,
    perfect_spin_alert: true
  };
}

function normalizeRides(rides = {}) {
  const freeRides = rides.freeRides == null ? null : Number(rides.freeRides || 0);
  const paidRides = rides.paidRides == null ? null : Number(rides.paidRides || 0);
  const totalRides = rides.totalRides == null
    ? ((freeRides == null && paidRides == null) ? null : Math.max(0, (freeRides || 0) + (paidRides || 0)))
    : Number(rides.totalRides || 0);

  return {
    limited: Boolean(rides.limited),
    freeRides,
    paidRides,
    totalRides,
    resetInMs: rides.resetInMs == null ? null : Number(rides.resetInMs || 0),
    resetInFormatted: rides.resetInFormatted ?? null
  };
}

export function createRuntimeConfigController({ setPlayerState }) {
  let runtimeGameConfig = null;

  function getRuntimeGameConfig() {
    return runtimeGameConfig;
  }

  function isUnauthRuntimeMode() {
    return Boolean(runtimeGameConfig && runtimeGameConfig.mode === 'unauth' && !isAuthenticated());
  }

  function isStoreAvailable() {
    if (isUnauthRuntimeMode()) {
      return Boolean(runtimeGameConfig?.storeEnabled);
    }
    return isAuthenticated();
  }

  function canPersistProgress() {
    if (isUnauthRuntimeMode()) {
      return Boolean(runtimeGameConfig?.saveProgress);
    }
    return isAuthenticated();
  }

  function isEligibleForLeaderboardFlow() {
    if (isUnauthRuntimeMode()) {
      return Boolean(runtimeGameConfig?.eligibleForLeaderboard);
    }
    return isAuthenticated();
  }

  function hasRideLimit() {
    if (isUnauthRuntimeMode()) {
      return Boolean(runtimeGameConfig?.rides?.limited);
    }
    return isAuthenticated();
  }

  function applyRuntimeConfig(config = null) {
    runtimeGameConfig = config && typeof config === 'object' ? config : null;

    if (!runtimeGameConfig) return;

    const isUnauthMode = runtimeGameConfig.mode === 'unauth';
    const playerUpgrades = isUnauthMode ? buildUnauthMaxUpgrades() : null;
    const playerEffects = isUnauthMode
      ? buildUnauthMaxEffects(runtimeGameConfig.activeEffects || {})
      : (runtimeGameConfig.activeEffects || null);
    const playerBalance = runtimeGameConfig.balance || { gold: 0, silver: 0 };
    const playerRides = normalizeRides(runtimeGameConfig.rides || {});

    if (isUnauthMode) {
      runtimeGameConfig = {
        ...runtimeGameConfig,
        activeEffects: playerEffects,
        upgrades: playerUpgrades
      };
    }

    setPlayerState({
      playerUpgrades,
      playerEffects,
      playerBalance,
      playerRides
    });
  }

  async function loadUnauthGameConfig() {
    if (isAuthenticated()) return runtimeGameConfig;

    const endpoints = [
      `${BACKEND_URL}/api/v1/game/config?mode=unauth`,
      `${BACKEND_URL}/api/game/config?mode=unauth`
    ];

    let lastError = null;

    for (const url of endpoints) {
      try {
        const data = await requestJson(url, {
          retries: 0,
          timeoutMs: 5000
        });
        applyRuntimeConfig(data);
        logger.info('✅ Unauth runtime config loaded:', data);
        return runtimeGameConfig;
      } catch (error) {
        lastError = error;
      }
    }

    const fallbackConfig = {
      mode: 'unauth',
      storeEnabled: false,
      saveProgress: false,
      eligibleForLeaderboard: false,
      rides: { limited: false, freeRides: null, paidRides: null, totalRides: null, resetInMs: null, resetInFormatted: null },
      balance: { gold: 0, silver: 0 },
      activeEffects: {},
      upgrades: null
    };

    applyRuntimeConfig(fallbackConfig);
    logger.warn('⚠️ Falling back to local unauth runtime config because backend config is unavailable:', lastError);
    return runtimeGameConfig;
  }

  function clearRuntimeConfig() {
    runtimeGameConfig = null;
  }

  return {
    getRuntimeGameConfig,
    isUnauthRuntimeMode,
    isStoreAvailable,
    canPersistProgress,
    isEligibleForLeaderboardFlow,
    hasRideLimit,
    normalizeRides,
    applyRuntimeConfig,
    loadUnauthGameConfig,
    clearRuntimeConfig
  };
}
