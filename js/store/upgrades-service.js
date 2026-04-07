import { logger } from '../logger.js';
import { BACKEND_URL, CONFIG } from '../config.js';
import { requestJson, requestJsonResult, REQUEST_PROFILE_STORE_READ, REQUEST_PROFILE_STORE_WRITE } from '../request.js';
import { isAuthenticated, getAuthIdentifier, signMessage } from '../api.js';
import { renderStoreCurrencyButton } from './rides-service.js';
import { notifyError, notifyWarn } from '../notifier.js';
import { trackUpgradePurchaseAnalytics } from './store-analytics.js';
import {
  parseNumericLevel,
  parseSpinAlertLevel,
  getLevelFromUpgradeState,
  normalizeShieldCapacityLevel
} from './upgrades-math.js';

let playerUpgrades = null;
let playerEffects = null;
let playerBalance = { gold: 0, silver: 0 };

function getPlayerUpgrades() {
  return playerUpgrades;
}

function getPlayerEffects() {
  return playerEffects;
}

export function getGameplayUpgradeSnapshot() {
  const effects = playerEffects;
  const upgrades = playerUpgrades;
  const shieldSnapshot = getShieldUpgradeSnapshot(effects, upgrades);
  const effectReduction = Number(effects?.spin_cooldown_reduction || 0);
  const upgradeLevel = Math.max(0, Number(upgrades?.spin_cooldown?.currentLevel || 0));
  const configuredReduction = CONFIG.SPIN_COOLDOWN_UPGRADE_SECONDS?.[upgradeLevel - 1] || 0;

  const radarGoldActive = Boolean(effects?.radar_active)
    || Boolean(effects?.start_with_radar_gold)
    || Number(upgrades?.radar_gold?.currentLevel || 0) >= 1
    || Number(upgrades?.radar?.currentLevel || 0) >= 1;

  const radarObstaclesActive = Boolean(effects?.start_with_radar_obstacles)
    || Number(upgrades?.radar_obstacles?.currentLevel || 0) >= 1;

  return {
    effects,
    upgrades,
    shieldSnapshot,
    spinCooldownReductionSeconds: Math.max(effectReduction, configuredReduction),
    radarActive: radarGoldActive,
    radarGoldActive,
    radarObstaclesActive,
    spinAlertLevel: Math.max(
      getLevelFromEffects('spin_alert'),
      Number(upgrades?.spin_alert?.currentLevel || 0)
    )
  };
}

const STORE_UPGRADE_ID_MAP = {
  x2_duration: 'x2',
  score_plus_300_mult: 'scoreplus300',
  score_plus_500_mult: 'scoreplus500',
  score_minus_300_mult: 'scoreminus300',
  score_minus_500_mult: 'scoreminus500',
  invert_score: 'invert',
  speed_up_mult: 'speedup',
  speed_down_mult: 'speeddown',
  magnet_duration: 'magnet',
  spin_cooldown: 'spincooldown',
  shield: 'shield',
  shield_capacity: 'shieldcapacity',
  spin_alert: 'spinalert',
  radar_obstacles: 'radarobstacles',
  radar_gold: 'radargold'
};

function getTierElements(prefix) {
  return Array.from(document.querySelectorAll(`[id^="store-${prefix}-"]`))
    .filter((el) => /^\d+$/.test(el.id.split('-').pop()))
    .sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()));
}

export function getShieldUpgradeSnapshot(effects = playerEffects, upgrades = playerUpgrades) {
  const shieldUpgradeLevel = parseNumericLevel(upgrades?.shield?.currentLevel || upgrades?.shield?.level);
  const shieldCapacityUpgradeLevel = parseNumericLevel(upgrades?.shield_capacity?.currentLevel || upgrades?.shield_capacity?.level);
  const startShieldCount = Math.max(
    parseNumericLevel(effects?.start_shield_count),
    parseNumericLevel(effects?.startShieldCount),
    parseNumericLevel(effects?.shield_start_count)
  );
  const startShieldLevel = Math.max(
    parseNumericLevel(effects?.shield_level),
    parseNumericLevel(effects?.shieldLevel),
    shieldUpgradeLevel
  );
  const shieldCapacityLevel = Math.max(
    normalizeShieldCapacityLevel(effects?.shield_capacity_level),
    normalizeShieldCapacityLevel(effects?.shield_capacity),
    shieldCapacityUpgradeLevel
  );

  const hasStartShield = Boolean(effects?.start_with_shield) || Boolean(effects?.startWithShield) || startShieldCount > 0 || startShieldLevel >= 1;
  const resolvedMaxShieldCount = Math.max(1, Math.min(1 + shieldCapacityLevel, 3));

  return {
    hasStartShield,
    startShieldLevel: Math.min(startShieldLevel, 1),
    shieldCapacityLevel,
    maxShieldCount: resolvedMaxShieldCount,
    startShieldCount: hasStartShield ? Math.max(1, Math.min(startShieldCount || 1, resolvedMaxShieldCount)) : 0
  };
}

function getLevelFromEffects(upgradeKey) {
  if (!playerEffects) return 0;

  if (upgradeKey === 'shield') {
    return getShieldUpgradeSnapshot(playerEffects, playerUpgrades).startShieldLevel;
  }

  if (upgradeKey === 'shield_capacity') {
    return getShieldUpgradeSnapshot(playerEffects, playerUpgrades).shieldCapacityLevel;
  }

  if (upgradeKey === 'spin_alert') {
    const directLevel = parseSpinAlertLevel(playerEffects.spin_alert_level);
    if (directLevel > 0) return directLevel;

    const modeLevel = parseSpinAlertLevel(playerEffects.spin_alert_mode);
    if (modeLevel > 0) return modeLevel;

    if (playerEffects.spin_alert_perfect || playerEffects.spin_alert_is_perfect || playerEffects.perfect_spin_alert) return 2;
    if (playerEffects.spin_alert_active || playerEffects.spin_alert) return 1;
  }

  return 0;
}

function getEffectiveUpgradeLevel(upgradeKey, upgradeState = null) {
  const state = upgradeState || (playerUpgrades && playerUpgrades[upgradeKey]) || null;
  const levelFromUpgrade = getLevelFromUpgradeState(state, upgradeKey);
  const levelFromEffect = getLevelFromEffects(upgradeKey);
  return Math.max(levelFromUpgrade, levelFromEffect);
}

function isAlreadyPurchasedError(errorText = '') {
  const normalized = String(errorText).toLowerCase();
  return normalized.includes('already purchased')
    || normalized.includes('already bought')
    || normalized.includes('already owned');
}

export function resetUpgradeState() {
  playerUpgrades = null;
  playerEffects = null;
  playerBalance = { gold: 0, silver: 0 };
}

export function setPlayerStoreState({ nextPlayerUpgrades = null, nextPlayerEffects = null, nextPlayerBalance = { gold: 0, silver: 0 } }) {
  playerUpgrades = nextPlayerUpgrades;
  playerEffects = nextPlayerEffects;
  playerBalance = nextPlayerBalance;
}

export function createUpgradesService({
  pendingStorePurchases,
  setStoreDataLoading,
  loadDonationProducts,
  loadDonationHistory,
  renderDonationProducts,
  renderDonationHistory,
  renderDonationPaymentModal,
  setPlayerRides,
  updateRidesDisplay,
  getPrimaryAuthIdentifier,
  getTelegramAuthIdentifier,
  isTelegramAuthMode,
  isStoreAvailable,
  getRuntimeGameConfig,
  clearRuntimeConfig,
  isUnauthRuntimeMode
}) {
  function applyStoreDefaultLockState({ buyUpgrade }) {
    for (const [upgradeKey, prefix] of Object.entries(STORE_UPGRADE_ID_MAP)) {
      const tiers = getTierElements(prefix);
      tiers.forEach((el, i) => {
        el.classList.remove('purchased', 'locked', 'available');
        el.style.opacity = '';
        el.onclick = null;
        el.removeAttribute('onclick');

        if (i === 0) {
          el.classList.add('available');
          el.style.pointerEvents = '';
          const tierIndex = i;
          el.onclick = function () { buyUpgrade(upgradeKey, tierIndex); };
        } else {
          el.classList.add('locked');
          el.style.pointerEvents = 'none';
        }
      });
    }
  }

  async function loadPlayerUpgrades() {
    if (!isAuthenticated()) {
      if (isUnauthRuntimeMode()) return getRuntimeGameConfig();
      return;
    }

    const identifier = getAuthIdentifier();
    setStoreDataLoading(true);
    try {
      const data = await requestJson(`${BACKEND_URL}/api/store/upgrades/${identifier}`, REQUEST_PROFILE_STORE_READ);

      clearRuntimeConfig();
      playerUpgrades = data.upgrades;
      playerEffects = data.activeEffects;
      playerBalance = data.balance;
      if (data.rides) setPlayerRides(data.rides);

      if (playerUpgrades) {
        for (const key of ['shield', 'shield_capacity', 'spin_alert', 'radar_obstacles', 'radar_gold']) {
          if (!playerUpgrades[key]) continue;
          const rawLevel = getLevelFromUpgradeState(playerUpgrades[key], key);
          const effectiveLevel = getEffectiveUpgradeLevel(key, playerUpgrades[key]);
          playerUpgrades[key].currentLevel = effectiveLevel;

          if (effectiveLevel !== rawLevel) {
            logger.warn(`⚠️ ${key} level normalized from ${rawLevel} to ${effectiveLevel}`, {
              upgrade: playerUpgrades[key],
              activeEffects: playerEffects
            });
          }
        }
      }

      logger.info('✅ Upgrades loaded:', playerUpgrades);
      logger.info('✅ Effects:', playerEffects);
      logger.info('✅ Balance:', playerBalance);

      loadDonationProducts({ silent: true });
      loadDonationHistory({ silent: true });
    } catch (error) {
      logger.error('❌ Error loading upgrades:', error);
    } finally {
      setStoreDataLoading(false);
    }
  }

  function updateStoreUI({ buyUpgrade }) {
    const goldEl = document.getElementById('storeGoldVal');
    const silverEl = document.getElementById('storeSilverVal');
    if (goldEl) goldEl.textContent = playerBalance.gold;
    if (silverEl) silverEl.textContent = playerBalance.silver;

    if (!playerUpgrades) return;

    for (const key in STORE_UPGRADE_ID_MAP) {
      const prefix = STORE_UPGRADE_ID_MAP[key];
      const data = playerUpgrades[key] || null;
      const tierElements = getTierElements(prefix);
      if (tierElements.length === 0) continue;

      const currentLevel = getEffectiveUpgradeLevel(key, data);
      const maxLevel = tierElements.length || Number(data?.maxLevel || 0);

      for (let i = 0; i < maxLevel; i++) {
        const el = tierElements[i] || document.getElementById(`store-${prefix}-${i}`);
        if (!el) continue;

        el.classList.remove('purchased', 'locked', 'available');
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.onclick = null;
        el.removeAttribute('onclick');

        if (i < currentLevel) {
          el.classList.add('purchased');
          el.style.pointerEvents = 'none';
        } else if (i === currentLevel) {
          el.classList.add('available');
          const tierIndex = i;
          const upgradeKey = key;
          el.onclick = function () { buyUpgrade(upgradeKey, tierIndex); };
        } else {
          el.classList.add('locked');
          el.style.pointerEvents = 'none';
        }
      }
    }


    const ridesBtn = document.getElementById('store-rides_pack');
    if (ridesBtn) {
      ridesBtn.classList.remove('purchased');
      ridesBtn.style.opacity = '';
      ridesBtn.style.pointerEvents = '';
      renderStoreCurrencyButton(ridesBtn, { label: '+3 rides', amount: '70' });
      ridesBtn.onclick = function () { buyUpgrade('rides_pack', 0); };
    }

    renderDonationProducts();
    renderDonationHistory();
    renderDonationPaymentModal();
  }

  async function buyUpgrade(key, tier, { isStoreDataLoading }) {
    if (isStoreDataLoading()) {
      notifyWarn('⏳ Store is loading, try again in a moment');
      return;
    }

    const purchaseKey = `${String(key)}:${Number(tier)}`;
    if (pendingStorePurchases.has(purchaseKey)) {
      logger.warn('⚠️ Duplicate store purchase prevented', { upgradeKey: key, tier });
      return;
    }

    if (!isAuthenticated()) {
      notifyWarn('🔗 Authentication required!');
      return;
    }

    if (!isStoreAvailable()) {
      notifyWarn('🛒 Store is unavailable in browser mode');
      return;
    }

    const upgradeState = playerUpgrades && playerUpgrades[key];
    const expectedTier = getEffectiveUpgradeLevel(key, upgradeState);
    if (tier < expectedTier) {
      notifyWarn('❌ Already purchased (permanent)');
      return;
    }
    if (tier > expectedTier) {
      notifyWarn('⚠️ Buy previous level first');
      return;
    }

    const identifier = getAuthIdentifier();
    pendingStorePurchases.add(purchaseKey);
    try {
      const primaryId = getPrimaryAuthIdentifier();
      const timestamp = Date.now();
      let requestData;
      let walletForSignature = '';

      if (isTelegramAuthMode()) {
        const telegramId = getTelegramAuthIdentifier();
        if (!telegramId) {
          notifyError('❌ Telegram account not detected');
          return;
        }

        requestData = {
          wallet: primaryId,
          upgradeKey: key === 'shield_capacity' ? 'shield_capacity' : key,
          tier,
          timestamp,
          authMode: 'telegram',
          telegramId
        };
      } else {
        walletForSignature = String(identifier || '').toLowerCase();
        const message = `Buy upgrade\nWallet: ${walletForSignature}\nUpgrade: ${key === 'shield_capacity' ? 'shield_capacity' : key}\nTier: ${tier}\nTimestamp: ${timestamp}`;
        const signature = await signMessage(message);
        if (!signature) {
          notifyError('❌ Failed to sign transaction');
          return;
        }
        requestData = {
          wallet: walletForSignature,
          upgradeKey: key === 'shield_capacity' ? 'shield_capacity' : key,
          tier,
          signature,
          timestamp
        };
      }

      const requestOptions = {
        ...REQUEST_PROFILE_STORE_WRITE,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Wallet': requestData.wallet || primaryId || identifier },
        body: JSON.stringify(requestData)
      };

      let data;
      let ok = false;
      try {
        const responseData = await requestJsonResult(`${BACKEND_URL}/api/store/buy`, requestOptions);
        data = responseData.data;
        ok = responseData.ok;
      } catch (error) {
        if (error?.code === 'REQUEST_INVALID_JSON') {
          data = { success: false, error: 'Invalid server response' };
          ok = false;
        } else {
          throw error;
        }
      }

      if (ok && data.success) {
        const previousBalance = { ...(playerBalance || {}) };

        if (data.rides) {
          setPlayerRides(data.rides);
          updateRidesDisplay();
        }

        logger.info('✅ Purchase success:', data.message);
        playerBalance = data.balance;
        playerEffects = data.activeEffects;
        trackUpgradePurchaseAnalytics({
          upgradeKey: key,
          tier,
          previousBalance,
          nextBalance: playerBalance
        });

        await loadPlayerUpgrades();
        updateStoreUI({ buyUpgrade: (upgradeKey, upgradeTier) => buyUpgrade(upgradeKey, upgradeTier, { isStoreDataLoading }) });

        const goldEl = document.getElementById('walletGold');
        const silverEl = document.getElementById('walletSilver');
        if (goldEl) goldEl.textContent = playerBalance.gold;
        if (silverEl) silverEl.textContent = playerBalance.silver;
      } else {
        const serverError = data && data.error ? data.error : 'Purchase failed';
        const isConflict = isAlreadyPurchasedError(serverError);

        if (isConflict) {
          logger.warn('⚠️ Purchase conflict: UI state is stale, syncing store data', {
            upgradeKey: key,
            tier,
            error: serverError,
            upgradeState,
            activeEffects: playerEffects
          });
          await loadPlayerUpgrades();

          if (playerUpgrades && playerUpgrades[key]) {
            const syncedLevel = getEffectiveUpgradeLevel(key, playerUpgrades[key]);
            if (tier >= syncedLevel) {
              playerUpgrades[key].currentLevel = tier + 1;
            }
          }
          updateStoreUI({ buyUpgrade: (upgradeKey, upgradeTier) => buyUpgrade(upgradeKey, upgradeTier, { isStoreDataLoading }) });
        }

        notifyError(`❌ ${serverError}`);
      }
    } catch (error) {
      logger.error('❌ Purchase error:', error);
      notifyError('❌ Network error');
    } finally {
      pendingStorePurchases.delete(purchaseKey);
    }
  }

  return {
    applyStoreDefaultLockState,
    loadPlayerUpgrades,
    updateStoreUI,
    buyUpgrade: (key, tier, options) => buyUpgrade(key, tier, options)
  };
}
