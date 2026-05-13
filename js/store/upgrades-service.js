import { logger } from '../logger.js';
import { BACKEND_URL, CONFIG } from '../config.js';
import { requestJson, requestJsonResult, REQUEST_PROFILE_STORE_READ, REQUEST_PROFILE_STORE_WRITE } from '../request.js';
import { isAuthenticated, getAuthIdentifier, signMessage } from '../api.js';
import { renderStoreCurrencyButton } from './rides-service.js';
import { notifyError, notifySuccess, notifyWarn } from '../notifier.js';
import { updateAiAccessFromBackendPayload } from '../ai-mode.js';
import { trackUpgradePurchaseAnalytics } from './store-analytics.js';
import { buildStoreBuyFailureDiagnostic, isTelegramSessionExpiredError } from './store-buy-diagnostics.js';
import { postOnboardingEvent } from '../features/onboarding/onboarding-service.js';
import { refreshOnboardingState, getOnboardingStateSnapshot, completeStoreInOnboardingFromPurchase } from '../features/onboarding/index.js';
import { applyRadarGiftStoreUi } from './radar-gift-ui.js';
import {
  parseNumericLevel,
  parseSpinAlertLevel,
  getLevelFromUpgradeState,
  normalizeShieldCapacityLevel
} from './upgrades-math.js';
function buildStoreAuthHeaders({
  primaryId = '',
  wallet = '',
  includeWallet = false
} = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const normalizedPrimaryId = String(primaryId || '').trim();
  const normalizedWallet = String(wallet || '').trim();
  if (normalizedPrimaryId) headers['X-Primary-Id'] = normalizedPrimaryId;
  if (includeWallet && normalizedWallet) headers['X-Wallet'] = normalizedWallet;
  try {
    const telegramInitData = String(window.Telegram?.WebApp?.initData || '').trim();
    if (telegramInitData) headers['X-Telegram-Init-Data'] = telegramInitData;
  } catch (_error) {}
  return headers;
}
function parseBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}
let playerUpgrades = null;
let playerEffects = null;
let playerBalance = { gold: 0, silver: 0 };
function updateStoreBalanceElements(balance = playerBalance) {
  const nextGold = Number(balance?.gold || 0), nextSilver = Number(balance?.silver || 0);
  [['storeGoldVal', nextGold], ['storeSilverVal', nextSilver], ['walletGold', nextGold], ['walletSilver', nextSilver]].forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
}
function resolveNextBalance(nextBalance, fallbackBalance = playerBalance) {
  const hasGold = Number.isFinite(Number(nextBalance?.gold));
  const hasSilver = Number.isFinite(Number(nextBalance?.silver));
  if (!hasGold && !hasSilver) return { ...(fallbackBalance || { gold: 0, silver: 0 }) };
  return {
    gold: hasGold ? Number(nextBalance?.gold) : Number(fallbackBalance?.gold || 0),
    silver: hasSilver ? Number(nextBalance?.silver) : Number(fallbackBalance?.silver || 0)
  };
}
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
  const radarGoldActive = parseBooleanFlag(effects?.radar_active)
    || parseBooleanFlag(effects?.start_with_radar_gold)
    || Number(upgrades?.radar_gold?.currentLevel || 0) >= 1
    || Number(upgrades?.radar?.currentLevel || 0) >= 1;
  const radarObstaclesActive = parseBooleanFlag(effects?.start_with_radar_obstacles)
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
function setStoreBuyButtonsPendingState(productKey, isPending) {
  const normalizedKey = String(productKey || '').trim();
  if (!normalizedKey) return;
  const buttonCandidates = [];
  if (normalizedKey === 'rides_pack') {
    const ridesButton = document.getElementById('store-ride-pack-3');
    if (ridesButton) buttonCandidates.push(ridesButton);
  }
  const prefix = STORE_UPGRADE_ID_MAP[normalizedKey];
  if (prefix) buttonCandidates.push(...getTierElements(prefix));
  const isDisabled = Boolean(isPending);
  buttonCandidates.forEach((buttonEl) => {
    if (!buttonEl) return;
    if (isDisabled) {
      buttonEl.dataset.pendingDisabled = buttonEl.style.pointerEvents || '';
      buttonEl.style.pointerEvents = 'none';
      buttonEl.classList.add('loading', 'pending');
      buttonEl.setAttribute('aria-disabled', 'true');
      if ('disabled' in buttonEl) buttonEl.disabled = true;
    } else {
      const previousPointerEvents = buttonEl.dataset.pendingDisabled;
      if (typeof previousPointerEvents === 'string') {
        buttonEl.style.pointerEvents = previousPointerEvents;
        delete buttonEl.dataset.pendingDisabled;
      } else {
        buttonEl.style.pointerEvents = '';
      }
      buttonEl.classList.remove('loading', 'pending');
      buttonEl.removeAttribute('aria-disabled');
      if ('disabled' in buttonEl) buttonEl.disabled = false;
    }
  });
}
function hasPurchaseEffectChanged({ productKey, tier, beforeSnapshot, afterSnapshot }) {
  if (!beforeSnapshot || !afterSnapshot) return false;
  const beforeLevel = Number(beforeSnapshot.upgradeLevel || 0);
  const afterLevel = Number(afterSnapshot.upgradeLevel || 0);
  if (afterLevel > beforeLevel) return true;
  const beforeRides = Number(beforeSnapshot.ridesTotal || 0);
  const afterRides = Number(afterSnapshot.ridesTotal || 0);
  if (afterRides > beforeRides) return true;
  const beforeGold = Number(beforeSnapshot.balance?.gold || 0);
  const afterGold = Number(afterSnapshot.balance?.gold || 0);
  const beforeSilver = Number(beforeSnapshot.balance?.silver || 0);
  const afterSilver = Number(afterSnapshot.balance?.silver || 0);
  if (afterGold < beforeGold || afterSilver < beforeSilver) return true;
  if (productKey === 'rides_pack') return afterRides > beforeRides;
  return tier >= beforeLevel && afterLevel >= tier + 1;
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
    parseNumericLevel(effects?.shield_capacity_level),
    parseNumericLevel(effects?.shieldCapacityLevel),
    normalizeShieldCapacityLevel(effects?.shield_capacity),
    normalizeShieldCapacityLevel(effects?.shieldCapacity),
    shieldCapacityUpgradeLevel
  );
  const hasStartShield = parseBooleanFlag(effects?.start_with_shield) || parseBooleanFlag(effects?.startWithShield) || startShieldCount > 0 || startShieldLevel >= 1;
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

const completingOnboardingKeys = new Set();
async function completeStoreInOnboardingAfterRidesPackPurchase() {
  const snapshot = getOnboardingStateSnapshot();
  const status = String(snapshot?.onboarding?.store_in || '').toLowerCase();
  const activeKey = String(snapshot?.activeOnboarding?.key || '');
  if (['complete', 'completed', 'skip', 'skipped'].includes(status) || (activeKey && activeKey !== 'store_in') || completingOnboardingKeys.has('store_in')) return;
  completingOnboardingKeys.add('store_in');
  try {
    const sent = await postOnboardingEvent({ key: 'store_in', action: 'complete', screen: 'store', target: 'ride_pack_plus3' });
    if (sent) await completeStoreInOnboardingFromPurchase();
  } finally { completingOnboardingKeys.delete('store_in'); }
}

export function resetUpgradeState() {
  playerUpgrades = null;
  playerEffects = null;
  playerBalance = { gold: 0, silver: 0 };
  updateAiAccessFromBackendPayload(null);
}

export function setPlayerStoreState({ nextPlayerUpgrades = null, nextPlayerEffects = null, nextPlayerBalance = { gold: 0, silver: 0 } }) {
  playerUpgrades = nextPlayerUpgrades;
  playerEffects = nextPlayerEffects;
  playerBalance = nextPlayerBalance;
}

export function createUpgradesService({
  pendingStorePurchases,
  setStoreDataLoading,
  isStoreDataLoading,
  loadDonationProducts,
  loadDonationHistory,
  renderDonationProducts,
  renderDonationHistory,
  renderDonationPaymentModal,
  setPlayerRides,
  updateRidesDisplay,
  getPrimaryAuthIdentifier,
  getTelegramAuthIdentifier,
  getAuthStateSnapshot,
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

    const isTelegramMode = isTelegramAuthMode();
    const primaryId = getPrimaryAuthIdentifier();
    const identifier = isTelegramMode ? String(primaryId || '').trim() : String(getAuthIdentifier() || '').trim();
    const walletAddress = isTelegramMode
      ? String(getAuthStateSnapshot()?.linkedWallet || '').trim().toLowerCase()
      : String(getAuthIdentifier() || '').trim().toLowerCase();
    const authHeaders = buildStoreAuthHeaders({
      primaryId,
      wallet: walletAddress,
      includeWallet: Boolean(walletAddress)
    });

    setStoreDataLoading(true);
    try {
      const data = await requestJson(`${BACKEND_URL}/api/store/upgrades/${identifier}`, {
        ...REQUEST_PROFILE_STORE_READ,
        headers: authHeaders
      });

      clearRuntimeConfig();
      playerUpgrades = data.upgrades;
      playerEffects = data.activeEffects;
      const responseBalance = resolveNextBalance(data?.balance, playerBalance);
      playerBalance = responseBalance;
      updateStoreBalanceElements(playerBalance);
      console.info('[telegram-balance-debug]', { identifier, primaryId, responseBalance });
      updateAiAccessFromBackendPayload(data);
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
    updateStoreBalanceElements(playerBalance);

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

    const ridesBtn = document.getElementById('store-ride-pack-3');
    if (ridesBtn) {
      ridesBtn.classList.remove('purchased');
      ridesBtn.style.opacity = '';
      ridesBtn.style.pointerEvents = '';
      renderStoreCurrencyButton(ridesBtn, { label: '+3 rides', amount: '70' });
      ridesBtn.onclick = function () { buyUpgrade('rides_pack', 0); };
    }

    applyRadarGiftStoreUi(getOnboardingStateSnapshot(), { buyUpgrade, isStoreDataLoading, loadPlayerUpgrades, updateStoreUI, refreshOnboardingState });

    renderDonationProducts();
    renderDonationHistory();
    renderDonationPaymentModal();
  }

  async function buyUpgrade(key, tier, { isStoreDataLoading }) {
    if (isStoreDataLoading()) {
      notifyWarn('⏳ Store is loading, try again in a moment');
      return;
    }

    const purchaseKey = String(key);
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
    const beforePurchaseSnapshot = {
      upgradeLevel: getEffectiveUpgradeLevel(key, upgradeState),
      ridesTotal: Number((typeof getPlayerRides === 'function' ? getPlayerRides() : null)?.total || 0),
      balance: { ...(playerBalance || {}) }
    };

    pendingStorePurchases.add(purchaseKey);
    setStoreBuyButtonsPendingState(key, true);
    try {
      const primaryId = getPrimaryAuthIdentifier();
      const timestamp = Date.now();
      let requestData;
      let walletForSignature = '';

      if (isTelegramAuthMode()) {
        const telegramId = getTelegramAuthIdentifier();
        const telegramInitData = String(window.Telegram?.WebApp?.initData || '').trim();
        const authState = getAuthStateSnapshot();
        const linkedWallet = String(authState?.linkedWallet || '').trim().toLowerCase();
        if (!telegramId || !telegramInitData) {
          notifyError('❌ Telegram session is missing, reopen the app and try again');
          return;
        }

        requestData = { primaryId: String(primaryId || identifier || '').trim(), upgradeKey: key === 'shield_capacity' ? 'shield_capacity' : key, tier, timestamp, authMode: 'telegram', telegramId, telegramInitData, ...(linkedWallet ? { wallet: linkedWallet } : {}) };
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
        retries: 0,
        method: 'POST',
        headers: buildStoreAuthHeaders({
          primaryId,
          wallet: walletForSignature || String(identifier || '').trim().toLowerCase(),
          includeWallet: !isTelegramAuthMode()
        }),
        body: JSON.stringify(requestData)
      };

      let data;
      let ok = false;
      let status = 0;
      try {
        const responseData = await requestJsonResult(`${BACKEND_URL}/api/store/buy`, requestOptions);
        data = responseData.data;
        ok = responseData.ok;
        status = Number(responseData.status || 0);
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
        playerBalance = resolveNextBalance(data?.balance, playerBalance);
        playerEffects = data.activeEffects;
        trackUpgradePurchaseAnalytics({
          upgradeKey: key,
          tier,
          levelBefore: expectedTier,
          previousBalance,
          nextBalance: playerBalance
        });

        await loadPlayerUpgrades();
        updateStoreUI({ buyUpgrade: (upgradeKey, upgradeTier) => buyUpgrade(upgradeKey, upgradeTier, { isStoreDataLoading }) });

        updateStoreBalanceElements(playerBalance);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ursas:onboarding-store-buy', {
            detail: { upgradeKey: key, tier, timestamp: Date.now() }
          }));
        }
        if (key === 'rides_pack') await completeStoreInOnboardingAfterRidesPackPurchase();
      } else {
        console.warn('[store-buy-failed]', buildStoreBuyFailureDiagnostic({ status, data, authMode: isTelegramAuthMode() ? 'telegram' : 'wallet', primaryId: String(primaryId || identifier || '').trim(), telegramId: getTelegramAuthIdentifier(), hasTelegramInitData: Boolean(String(window.Telegram?.WebApp?.initData || '').trim()), hasWallet: Boolean(String(getAuthStateSnapshot()?.linkedWallet || '').trim()) }));
        const serverError = data && data.error ? data.error : 'Purchase failed';
        const isConflict = isAlreadyPurchasedError(serverError);
        const isAmbiguousServerFailure = status === 500;

        if (isConflict || isAmbiguousServerFailure) {
          logger.warn('⚠️ Purchase result is ambiguous, syncing store data', {
            upgradeKey: key,
            tier,
            status,
            serverError,
            upgradeState,
            activeEffects: playerEffects
          });
          await loadPlayerUpgrades();
          updateStoreUI({ buyUpgrade: (upgradeKey, upgradeTier) => buyUpgrade(upgradeKey, upgradeTier, { isStoreDataLoading }) });

          const afterSyncSnapshot = {
            upgradeLevel: getEffectiveUpgradeLevel(key, playerUpgrades && playerUpgrades[key]),
            ridesTotal: Number((typeof getPlayerRides === 'function' ? getPlayerRides() : null)?.total || 0),
            balance: { ...(playerBalance || {}) }
          };
          if (hasPurchaseEffectChanged({
            productKey: key,
            tier,
            beforeSnapshot: beforePurchaseSnapshot,
            afterSnapshot: afterSyncSnapshot
          })) {
            notifySuccess('✅ Purchase confirmed after sync');
            return;
          }
        }

        if (isTelegramSessionExpiredError(serverError)) {
          notifyError('Telegram session expired. Reopen the app and try again.');
          return;
        }

        notifyError(`❌ ${serverError}`);
      }
    } catch (error) {
      logger.error('❌ Purchase error:', error);
      notifyError('❌ Network error');
    } finally {
      pendingStorePurchases.delete(purchaseKey);
      setStoreBuyButtonsPendingState(key, false);
    }
  }

  if (typeof window !== 'undefined' && !window.__ursasRadarGiftUiHooksBound) {
    window.__ursasRadarGiftUiHooksBound = true;
    const reapplyGiftUi = () => applyRadarGiftStoreUi(getOnboardingStateSnapshot(), { buyUpgrade: (upgradeKey, upgradeTier) => buyUpgrade(upgradeKey, upgradeTier, { isStoreDataLoading }), isStoreDataLoading, loadPlayerUpgrades, updateStoreUI, refreshOnboardingState });
    window.addEventListener('ursas:onboarding-state-updated', reapplyGiftUi);
    window.addEventListener('ursas:onboarding-spotlight-skipped', reapplyGiftUi);
  }

  return {
    applyStoreDefaultLockState,
    loadPlayerUpgrades,
    updateStoreUI,
    buyUpgrade: (key, tier, options) => buyUpgrade(key, tier, options)
  };
}
