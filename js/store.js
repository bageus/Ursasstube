/* ===== RIDES SYSTEM ===== */
import { BACKEND_URL } from './config.js';
import { request } from './request.js';
import { isAuthenticated, getAuthIdentifier, signMessage } from './api.js';
import { getAuthState } from './auth.js';
import { syncAllAudioUI } from './audio.js';
import { createIconAtlas, createImageIcon, clearNode } from './dom-render.js';
import { getDonationProducts, createDonationPayment, submitDonationTransaction, getDonationHistory, getDonationPayment } from './donation-service.js';
import { WC } from './walletconnect.js';

let authMode = null;
let primaryId = null;
let userWallet = null;
let telegramUser = null;
let linkedTelegramId = null;

function syncAuthGlobals() {
  ({
    authMode = null,
    primaryId = null,
    userWallet = null,
    telegramUser = null,
    linkedTelegramId = null
  } = getAuthState());
}

function appendRidesLabel(target, { iconPosition, text }) {
  if (!target) return;
  clearNode(target);
  target.append(
    createIconAtlas({
      width: 28,
      height: 28,
      backgroundSize: '140px auto',
      backgroundPosition: iconPosition
    }),
    document.createTextNode(` ${text}`)
  );
}

function renderStoreCurrencyButton(target, { prefixIconPosition = null, label, amount }) {
  if (!target) return;
  clearNode(target);
  if (prefixIconPosition) {
    target.append(
      createIconAtlas({
        width: 28,
        height: 28,
        backgroundSize: '140px auto',
        backgroundPosition: prefixIconPosition
      }),
      document.createTextNode(' ')
    );
  }
  target.append(document.createTextNode(`${label} — `));
  target.append(
    createImageIcon({
      src: 'img/icon_gold.png',
      width: 14,
      height: 14,
      verticalAlign: 'middle'
    }),
    document.createTextNode(` ${amount}`)
  );
}

let playerRides = {
  limited: true,
  freeRides: 3,
  paidRides: 0,
  totalRides: 3,
  resetInMs: 0,
  resetInFormatted: "Ready"
};

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

function applyRuntimeConfig(config = null) {
  runtimeGameConfig = config && typeof config === 'object' ? config : null;

  if (!runtimeGameConfig) return;

  playerUpgrades = null;
  playerEffects = runtimeGameConfig.activeEffects || null;
  playerBalance = runtimeGameConfig.balance || { gold: 0, silver: 0 };
  playerRides = normalizeRides(runtimeGameConfig.rides || {});
}

async function loadUnauthGameConfig() {
  if (isAuthenticated()) return runtimeGameConfig;

  const endpoints = [
    `${BACKEND_URL}/api/game/config?mode=unauth`,
    `${BACKEND_URL}/api/v1/game/config?mode=unauth`
  ];

  let lastError = null;

  for (const url of endpoints) {
    try {
      const response = await request(url);
      if (!response.ok) {
        lastError = new Error(`Failed with status ${response.status}`);
        continue;
      }

      const data = await response.json();
      applyRuntimeConfig(data);
      console.log('✅ Unauth runtime config loaded:', data);
      return runtimeGameConfig;
    } catch (error) {
      lastError = error;
    }
  }

  console.error('❌ Error loading unauth runtime config:', lastError);
  return null;
}

function clearRuntimeConfig() {
  runtimeGameConfig = null;
}

async function loadPlayerRides() {
  if (!isAuthenticated()) {
    if (isUnauthRuntimeMode()) return playerRides;
    return;
  }
  const identifier = getAuthIdentifier();
  try {
    const response = await request(`${BACKEND_URL}/api/store/rides/${identifier}`);
    const data = await response.json();
    if (response.ok) {
      playerRides = data;
      console.log("🎟 Rides:", playerRides);
    }
  } catch (e) {
    console.error("❌ Error loading rides:", e);
  }
}

async function useRide() {
  if (!isAuthenticated()) {
    if (!isUnauthRuntimeMode()) return true;
    if (!hasRideLimit()) return true;

    const totalRides = Number(playerRides.totalRides || 0);
    if (totalRides <= 0) {
      updateRidesDisplay();
      return false;
    }

    playerRides = {
      ...playerRides,
      totalRides: Math.max(0, totalRides - 1)
    };
    updateRidesDisplay();
    return true;
  }
  const identifier = getAuthIdentifier();
  try {
    const response = await request(`${BACKEND_URL}/api/store/use-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: identifier })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      playerRides = data.rides;
      updateRidesDisplay();
      console.log(`🎟 Ride used. Remaining: ${playerRides.totalRides}`);
      return true;
    } else {
      playerRides = data.rides || playerRides;
      updateRidesDisplay();
      return false;
    }
  } catch (e) {
    console.error("❌ Error consuming ride:", e);
    return true;
  }
}

function updateRidesDisplay() {
  const ridesInfo = document.getElementById("ridesInfo");
  if (!ridesInfo) return;

  if (!isAuthenticated() && !isUnauthRuntimeMode()) {
    ridesInfo.classList.remove("visible");
    ridesInfo.setAttribute("aria-hidden", "true");
    return;
  }

  ridesInfo.classList.add("visible");
  ridesInfo.setAttribute("aria-hidden", "false");

  const total = playerRides.totalRides;
  const free = playerRides.freeRides;
  const paid = playerRides.paidRides;
  const limited = hasRideLimit();

  const ridesText = document.getElementById("ridesText");
  const ridesTimer = document.getElementById("ridesTimer");

  if (ridesText) {
    appendRidesLabel(ridesText, {
      iconPosition: '-84px -28px',
      text: limited ? `${total ?? '∞'} ride${total === 1 ? '' : 's'}` : 'Unlimited rides'
    });
    if (limited && paid > 0) {
      ridesText.append(document.createTextNode(` (${free} free + ${paid} purchased)`));
    }
  }

  if (ridesTimer) {
    if (limited && free < 3 && playerRides.resetInMs > 0) {
      appendRidesLabel(ridesTimer, {
        iconPosition: '-56px -28px',
        text: `Resets in ${playerRides.resetInFormatted}`
      });
      ridesTimer.style.display = "";
    } else {
      ridesTimer.style.display = "none";
    }
  }

  const startBtn = document.getElementById("startBtn");
  if (startBtn) {
    if (limited && (total || 0) <= 0) {
      startBtn.style.opacity = "0.4";
      startBtn.style.pointerEvents = "none";
      startBtn.textContent = `NO RIDES (${playerRides.resetInFormatted})`;
    } else {
      startBtn.style.opacity = "";
      startBtn.style.pointerEvents = "";
      startBtn.textContent = "START GAME";
    }
  }
}

/* ===== STORE SYSTEM ===== */

let playerUpgrades = null;
let playerEffects = null;
let playerBalance = { gold: 0, silver: 0 };
let isStoreDataLoading = false;
const pendingStorePurchases = new Set();

const DONATION_FINAL_STATUSES = new Set(['credited', 'failed', 'expired']);
const DONATION_PENDING_STATUS = 'pending';
const DONATION_REFRESH_COOLDOWN_MS = 60 * 1000;
const DONATION_PENDING_TIMEOUT_MS = 30 * 60 * 1000;
const DONATION_PENDING_STORAGE_KEY = 'ursassDonationPendingPayments';

let activeStoreTab = 'upgrade';
let donationCatalog = null;
let donationUiState = {
  isLoading: false,
  error: '',
  products: [],
  history: [],
  historyLoading: false,
  historyError: '',
  refreshingPaymentId: '',
  refreshCooldowns: {}
};
let donationPaymentState = {
  isOpen: false,
  isCreating: false,
  isSubmitting: false,
  isInvokingWallet: false,
  error: '',
  walletError: '',
  selectedProductKey: '',
  payment: null,
  status: null,
  reward: null,
  txHash: ''
};
let donationCountdownTimer = null;
let donationAbortController = null;
let toastTimerCounter = 0;
let donationRefreshCooldownTimers = {};

function isAlreadyPurchasedError(errorText = "") {
  const normalized = String(errorText).toLowerCase();
  return normalized.includes('already purchased') ||
    normalized.includes('already bought') ||
    normalized.includes('already owned');
}

function parseNumericLevel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseSpinAlertLevel(value) {
  const numeric = parseNumericLevel(value);
  if (numeric > 0) return Math.min(numeric, 2);

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 0;

  if (['perfect', 'pro', 'perfect_alert', 'perfectalert', 'tier2', 'level2'].includes(normalized)) {
    return 2;
  }

  if (['alert', 'basic', 'tier1', 'level1', 'enabled', 'active'].includes(normalized)) {
    return 1;
  }

  if (normalized === 'true') return 1;

  return 0;
}

function getTierElements(prefix) {
  return Array.from(document.querySelectorAll(`[id^="store-${prefix}-"]`))
    .filter((el) => /^\d+$/.test(el.id.split('-').pop()))
    .sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()));
}

function getLevelFromUpgradeState(state = null, upgradeKey = '') {
  if (!state || typeof state !== 'object') return 0;

  const parseLevel = upgradeKey === 'spin_alert' ? parseSpinAlertLevel : parseNumericLevel;

  const directCandidates = [
    state.currentLevel,
    state.level,
    state.purchasedLevel,
    state.ownedLevel
  ];

  let bestLevel = directCandidates.reduce((best, candidate) => {
    return Math.max(best, parseLevel(candidate));
  }, 0);

  const arrayCandidates = [
    state.purchasedTiers,
    state.ownedTiers,
    state.unlockedTiers
  ];

  for (const tiers of arrayCandidates) {
    if (!Array.isArray(tiers) || tiers.length === 0) continue;

    const numericTiers = tiers
      .map((tier) => parseLevel(tier))
      .filter((tier) => Number.isFinite(tier));

    if (numericTiers.length === 0) continue;

    const highestTier = Math.max(...numericTiers);

    if (upgradeKey === 'spin_alert') {
      bestLevel = Math.max(bestLevel, highestTier);
    } else {
      bestLevel = Math.max(bestLevel, highestTier + 1);
    }
  }

  return bestLevel;
}

function getLevelFromEffects(upgradeKey) {
  if (!playerEffects) return 0;

  if (upgradeKey === 'shield') {
    const startShieldCount = parseNumericLevel(playerEffects.start_shield_count);
    const shieldLevel = parseNumericLevel(playerEffects.shield_level);
    const maxShieldCount = Math.max(
      parseNumericLevel(playerEffects.max_shield_count),
      parseNumericLevel(playerEffects.shield_max_count),
      parseNumericLevel(playerEffects.max_shields)
    );

    const hasStartShield = Boolean(playerEffects.start_with_shield) || startShieldCount > 0 || shieldLevel >= 1;

    if (maxShieldCount >= 3) return 3;
    if (maxShieldCount >= 2) return 2;
    if (shieldLevel > 0) return Math.min(shieldLevel, 3);

    // Legacy backend payloads may encode only start_shield_count without explicit level flags.
    if (startShieldCount >= 3) return 3;
    if (startShieldCount >= 2) return 2;

    return hasStartShield ? 1 : 0;
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
  spin_alert: 'spinalert'
};

function applyStoreDefaultLockState() {
  for (const [upgradeKey, prefix] of Object.entries(STORE_UPGRADE_ID_MAP)) {
    const tiers = getTierElements(prefix);

    tiers.forEach((el, i) => {
      el.classList.remove("purchased", "locked", "available");
      el.style.opacity = "";
      el.onclick = null;
      el.removeAttribute("onclick");

      const isShieldStackTierOne = upgradeKey === 'shield' && i === 1;
      if (i === 0 || isShieldStackTierOne) {
        el.classList.add("available");
        el.style.pointerEvents = "";
        const tierIndex = i;
        el.onclick = function() { buyUpgrade(upgradeKey, tierIndex); };
      } else {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
    });
  }
}

async function loadPlayerUpgrades() {
  if (!isAuthenticated()) {
    if (isUnauthRuntimeMode()) return runtimeGameConfig;
    return;
  }
  const identifier = getAuthIdentifier();
  isStoreDataLoading = true;
  try {
    const url = `${BACKEND_URL}/api/store/upgrades/${identifier}`;
    const response = await request(url);
    const data = await response.json();

    if (response.ok) {
      clearRuntimeConfig();
      playerUpgrades = data.upgrades;
      playerEffects = data.activeEffects;
      playerBalance = data.balance;
      if (data.rides) playerRides = data.rides;

           // Some gold upgrades can be reflected first in active effects and only
      // later synchronized into upgrades.currentLevel. Normalize these levels
      // so UI state and clickability match what backend enforces.
      if (playerUpgrades) {
        for (const key of ['shield', 'spin_alert']) {
          if (!playerUpgrades[key]) continue;
          const rawLevel = getLevelFromUpgradeState(playerUpgrades[key]);
          const effectiveLevel = getEffectiveUpgradeLevel(key, playerUpgrades[key]);
          playerUpgrades[key].currentLevel = effectiveLevel;

          if (effectiveLevel !== rawLevel) {
            console.warn(`⚠️ ${key} level normalized from ${rawLevel} to ${effectiveLevel}`, {
              upgrade: playerUpgrades[key],
              activeEffects: playerEffects
            });
          }
        }
      }

      console.log("✅ Upgrades loaded:", playerUpgrades);
      console.log("✅ Effects:", playerEffects);
      console.log("✅ Balance:", playerBalance);
      console.log("🎟 Rides:", playerRides);

      loadDonationProducts({ silent: true });
      loadDonationHistory({ silent: true });
    }
  } catch (e) {
    console.error("❌ Error loading upgrades:", e);
  } finally {
    isStoreDataLoading = false;
  }
}


function updateStoreUI() {
  const goldEl = document.getElementById("storeGoldVal");
  const silverEl = document.getElementById("storeSilverVal");
  if (goldEl) goldEl.textContent = playerBalance.gold;
  if (silverEl) silverEl.textContent = playerBalance.silver;

  if (!playerUpgrades) return;


  for (const key in STORE_UPGRADE_ID_MAP) {
    const prefix = STORE_UPGRADE_ID_MAP[key];
    const data = playerUpgrades[key];
    if (!data) continue;

    const tierElements = getTierElements(prefix);

    const currentLevel = getEffectiveUpgradeLevel(key, data);
    const maxLevel = tierElements.length || Number(data.maxLevel || 0);

    for (let i = 0; i < maxLevel; i++) {
      const el = tierElements[i] || document.getElementById(`store-${prefix}-${i}`);
      if (!el) {
        continue;
      }

      el.classList.remove("purchased", "locked", "available");
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.onclick = null;
      el.removeAttribute("onclick");

      const allowShieldStackTierOne = key === 'shield' && currentLevel === 0 && i === 1;
      if (i < currentLevel) {
        el.classList.add("purchased");
        el.style.pointerEvents = "none";
      } else if (i === currentLevel || allowShieldStackTierOne) {
        el.classList.add("available");
        const tierIndex = i;
        const upgradeKey = key;
        el.onclick = function() { buyUpgrade(upgradeKey, tierIndex); };
      } else {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
    }
  }

  // Radar (single purchase, tier 0 only)
  const radarBtn = document.getElementById("store-radar");
  if (radarBtn && playerUpgrades.radar) {
    radarBtn.classList.remove("purchased");
    radarBtn.style.opacity = "";
    radarBtn.style.pointerEvents = "";
    radarBtn.onclick = null;

    if (playerUpgrades.radar.currentLevel >= 1) {
      radarBtn.classList.add("purchased");
      radarBtn.textContent = '✅ Purchased permanently';
      radarBtn.style.pointerEvents = "none";
    } else {
      radarBtn.onclick = function() { buyUpgrade('radar', 0); };
      renderStoreCurrencyButton(radarBtn, {
        prefixIconPosition: '-112px 0px',
        label: 'Buy',
        amount: '1,000'
      });
    }
  }

  // Rides pack
  const ridesBtn = document.getElementById("store-rides_pack");
  if (ridesBtn) {
    ridesBtn.classList.remove("purchased");
    ridesBtn.style.opacity = "";
    ridesBtn.style.pointerEvents = "";

    renderStoreCurrencyButton(ridesBtn, {
      label: '+3 rides',
      amount: '70'
    });
    ridesBtn.onclick = function() { buyUpgrade('rides_pack', 0); };
  }

  renderDonationProducts();
  renderDonationHistory();
  renderDonationPaymentModal();
}

function getDonationIdentifier() {
  return String(getAuthIdentifier() || '').trim();
}

function setActiveStoreTab(tab) {
  activeStoreTab = tab === 'donation' ? 'donation' : 'upgrade';

  document.querySelectorAll('[data-store-tab]').forEach((button) => {
    const isActive = button.dataset.storeTab === activeStoreTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('[data-store-panel]').forEach((panel) => {
    const isActive = panel.dataset.storePanel === activeStoreTab;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  });

  if (activeStoreTab === 'donation' && isAuthenticated()) {
    if (donationUiState.products.length === 0 && !donationUiState.isLoading) loadDonationProducts();
    if (donationUiState.history.length === 0 && !donationUiState.historyLoading) loadDonationHistory();
  }
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack || !message) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  const myTimerId = ++toastTimerCounter;
  window.setTimeout(() => {
    if (myTimerId <= toastTimerCounter && toast.parentNode) {
      toast.classList.add('toast--leaving');
      window.setTimeout(() => toast.remove(), 180);
    }
  }, 2600);
}

async function copyTextValue(value, successMessage) {
  if (!value) {
    showToast('Nothing to copy yet', 'error');
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(value));
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = String(value);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    showToast(successMessage, 'success');
  } catch (error) {
    console.error('❌ Copy failed:', error);
    showToast('Copy failed', 'error');
  }
}

function stopDonationCountdown() {
  if (donationCountdownTimer) {
    clearInterval(donationCountdownTimer);
    donationCountdownTimer = null;
  }
}

function cleanupDonationAsync() {
  stopDonationCountdown();
  if (donationAbortController) {
    donationAbortController.abort();
    donationAbortController = null;
  }
}

function scheduleDonationRefreshCooldownRender(paymentId) {
  if (!paymentId) return;
  if (donationRefreshCooldownTimers[paymentId]) {
    clearTimeout(donationRefreshCooldownTimers[paymentId]);
  }

  donationRefreshCooldownTimers[paymentId] = window.setTimeout(() => {
    delete donationRefreshCooldownTimers[paymentId];
    renderDonationHistory();
    renderDonationPaymentModal();
  }, DONATION_REFRESH_COOLDOWN_MS + 50);
}

function formatReward(reward = {}) {
  const gold = Number(reward.gold || 0);
  const silver = Number(reward.silver || 0);
  return `+${gold} gold · +${silver} silver`;
}

function getDonationStatusText(status, failureReason = '') {
  if (failureReason) return failureReason;
  switch (status) {
    case 'submitted':
      return 'Transaction submitted for verification';
    case 'pending':
      return 'Transaction is being verified';
    case 'credited':
      return 'Payment credited successfully';
    case 'failed':
      return 'Payment verification failed';
    case 'expired':
      return 'Payment expired';
    default:
      return 'Waiting for transaction submission';
  }
}

function formatCountdown(expiresAt) {
  if (!expiresAt) return '—';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return '—';
  if (diffMs <= 0) return 'Expired';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function syncDonationCountdown() {
  const timerEl = document.getElementById('donationPaymentTimer');
  const expiresAt = donationPaymentState.payment?.expiresAt || donationPaymentState.status?.expiresAt || null;
  if (!timerEl) return;

  if (!expiresAt) {
    timerEl.hidden = true;
    timerEl.textContent = '';
    return;
  }

  timerEl.hidden = false;
  timerEl.textContent = `Expires in ${formatCountdown(expiresAt)}`;
}

function startDonationCountdown() {
  stopDonationCountdown();
  syncDonationCountdown();
  donationCountdownTimer = setInterval(syncDonationCountdown, 1000);
}

function renderDonationFeedback() {
  const feedbackEl = document.getElementById('donationFeedback');
  const loadingEl = document.getElementById('donationLoading');
  const emptyEl = document.getElementById('donationEmpty');
  if (feedbackEl) {
    feedbackEl.hidden = !donationUiState.error;
    feedbackEl.textContent = donationUiState.error || '';
  }
  if (loadingEl) loadingEl.hidden = !donationUiState.isLoading;
  if (emptyEl) emptyEl.hidden = donationUiState.isLoading || donationUiState.error || donationUiState.products.length > 0;
}

function renderDonationProducts() {
  const listEl = document.getElementById('donationList');
  renderDonationFeedback();
  if (!listEl) return;
  clearNode(listEl);

  donationUiState.products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'donation-card';

    const title = document.createElement('h3');
    title.className = 'donation-card__title';
    title.textContent = product.title || product.key;

    const price = document.createElement('div');
    price.className = 'donation-card__price';
    price.textContent = `${product.price} ${product.currency || donationCatalog?.token?.symbol || 'USDT'}`;

    const reward = document.createElement('div');
    reward.className = 'donation-card__reward';
    reward.textContent = formatReward(product.grant);

    const limit = document.createElement('div');
    limit.className = 'donation-card__limit';
    limit.textContent = product.purchaseLimit === 'once' ? 'Only once' : 'Unlimited';

    const button = document.createElement('button');
    const isSinglePurchaseOffer = product.purchaseLimit === 'once';
    const isPurchasedSingleOffer = isSinglePurchaseOffer && product.alreadyPurchased;
    const isExplicitlyUnavailable = isSinglePurchaseOffer
      ? (!product.canPurchase && isPurchasedSingleOffer)
      : false;
    const unavailable = isPurchasedSingleOffer || isExplicitlyUnavailable;
    button.className = 'donation-card__buy';
    button.type = 'button';
    button.disabled = unavailable || donationPaymentState.isCreating;
    button.textContent = unavailable ? (product.alreadyPurchased ? 'Already purchased' : 'Unavailable') : 'Buy';
    button.addEventListener('click', () => handleDonationBuy(product));

    card.append(title, price, reward, limit, button);
    listEl.appendChild(card);
  });
}

function normalizeDonationHistoryEntries(entries = []) {
  return [...entries]
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}


function readDonationPendingStore() {
  try {
    const raw = window.localStorage?.getItem(DONATION_PENDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('⚠️ Failed to read donation pending store:', error);
    return {};
  }
}

function writeDonationPendingStore(store) {
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(DONATION_PENDING_STORAGE_KEY, JSON.stringify(store || {}));
  } catch (error) {
    console.warn('⚠️ Failed to write donation pending store:', error);
  }
}

function getDonationPendingEntry(paymentId) {
  if (!paymentId) return null;
  const store = readDonationPendingStore();
  const entry = store[paymentId];
  return entry && typeof entry === 'object' ? entry : null;
}

function setDonationPendingEntry(paymentId, entry) {
  if (!paymentId) return;
  const store = readDonationPendingStore();
  store[paymentId] = {
    paymentId,
    ...(store[paymentId] || {}),
    ...(entry || {})
  };
  writeDonationPendingStore(store);
}

function clearDonationPendingEntry(paymentId) {
  if (!paymentId) return;
  const store = readDonationPendingStore();
  if (!(paymentId in store)) return;
  delete store[paymentId];
  writeDonationPendingStore(store);
}

function isDonationPendingTimedOut(entry = null) {
  const submittedAt = new Date(entry?.submittedAt || 0).getTime();
  return Number.isFinite(submittedAt) && submittedAt > 0 && (Date.now() - submittedAt) >= DONATION_PENDING_TIMEOUT_MS;
}

function getDonationRefreshCooldownRemaining(paymentId) {
  const nextAllowedAt = donationUiState.refreshCooldowns[paymentId] || 0;
  return Math.max(0, nextAllowedAt - Date.now());
}

function formatCooldownMs(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
}

function getDonationPendingTimestamp(entry = null, pendingEntry = null) {
  const candidates = [
    pendingEntry?.submittedAt,
    entry?.submittedAt,
    entry?.updatedAt,
    entry?.createdAt
  ];

  for (const candidate of candidates) {
    const timestamp = new Date(candidate || 0).getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  return 0;
}

function getClientSideDonationStatus(entry = null) {
  const normalizedStatus = String(entry?.status || '').toLowerCase();
  if (DONATION_FINAL_STATUSES.has(normalizedStatus)) return normalizedStatus;

  const pendingEntry = entry?.paymentId ? getDonationPendingEntry(entry.paymentId) : null;
  const pendingTimestamp = getDonationPendingTimestamp(entry, pendingEntry);
  if (pendingTimestamp > 0 && (Date.now() - pendingTimestamp) >= DONATION_PENDING_TIMEOUT_MS) return 'failed';

  if (entry?.paymentId && (pendingEntry || normalizedStatus)) return DONATION_PENDING_STATUS;
  return null;
}

function ensureDonationPendingHistoryEntry(payment = null, overrides = {}) {
  const paymentId = payment?.paymentId;
  if (!paymentId) return;

  const pendingEntry = getDonationPendingEntry(paymentId);
  const txHash = String(overrides.txHash || pendingEntry?.txHash || payment?.txHash || donationPaymentState.txHash || '').trim();
  const status = getClientSideDonationStatus({ ...payment, paymentId, status: DONATION_PENDING_STATUS, txHash }) || DONATION_PENDING_STATUS;

  if (status !== DONATION_PENDING_STATUS && status !== 'failed') return;

  upsertDonationHistoryEntry({
    ...payment,
    ...overrides,
    paymentId,
    txHash,
    status,
    createdAt: payment?.createdAt || overrides.createdAt || new Date().toISOString(),
    submittedAt: overrides.submittedAt || pendingEntry?.submittedAt || payment?.submittedAt || null,
    isLocalPendingStatus: true,
    failureReason: status === 'failed'
      ? 'Merchant did not confirm the transaction within 30 minutes'
      : ''
  });
}

function mergeDonationHistoryWithPending(entries = []) {
  const pendingStore = readDonationPendingStore();
  const mergedEntries = Array.isArray(entries) ? [...entries] : [];
  const finalPaymentIds = new Set(
    mergedEntries
      .filter((entry) => DONATION_FINAL_STATUSES.has(String(entry?.status || '').toLowerCase()) && entry?.paymentId)
      .map((entry) => entry.paymentId)
  );

  finalPaymentIds.forEach((paymentId) => {
    if (pendingStore[paymentId]) {
      delete pendingStore[paymentId];
    }
  });

  if (finalPaymentIds.size > 0) {
    writeDonationPendingStore(pendingStore);
  }

  Object.entries(pendingStore).forEach(([paymentId, pendingEntry]) => {
    const status = getClientSideDonationStatus({ paymentId, status: pendingEntry?.status });
    const historyIndex = mergedEntries.findIndex((entry) => entry?.paymentId === paymentId);
    const overlay = {
      paymentId,
      status,
      submittedAt: pendingEntry?.submittedAt || null,
      txHash: pendingEntry?.txHash || null,
      failureReason: status === 'failed'
        ? 'Merchant did not confirm the transaction within 30 minutes'
        : '',
      isLocalPendingStatus: status === DONATION_PENDING_STATUS
    };

    if (historyIndex >= 0) {
      mergedEntries[historyIndex] = { ...mergedEntries[historyIndex], ...overlay };
    } else {
      mergedEntries.unshift(overlay);
    }
  });

  return mergedEntries;
}

function formatDonationHistoryDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function renderDonationHistory() {
  const listEl = document.getElementById('donationHistoryList');
  const loadingEl = document.getElementById('donationHistoryLoading');
  const emptyEl = document.getElementById('donationHistoryEmpty');
  const feedbackEl = document.getElementById('donationHistoryFeedback');

  if (loadingEl) loadingEl.hidden = !donationUiState.historyLoading;
  if (feedbackEl) {
    feedbackEl.hidden = !donationUiState.historyError;
    feedbackEl.textContent = donationUiState.historyError || '';
  }
  if (emptyEl) emptyEl.hidden = donationUiState.historyLoading || Boolean(donationUiState.historyError) || donationUiState.history.length > 0;
  if (!listEl) return;

  clearNode(listEl);

  donationUiState.history.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'donation-history-card';

    const top = document.createElement('div');
    top.className = 'donation-history-card__top';

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'donation-history-card__title';
    title.textContent = entry.title || entry.productTitle || entry.productKey || entry.paymentId || 'Donation purchase';
    const datetime = document.createElement('div');
    datetime.className = 'donation-history-card__datetime';
    datetime.textContent = formatDonationHistoryDate(entry.createdAt);
    titleWrap.append(title, datetime);

    const resolvedStatus = getClientSideDonationStatus(entry) || 'unknown';
    const status = document.createElement('div');
    status.className = 'donation-history-card__status';
    status.dataset.status = donationUiState.refreshingPaymentId === entry.paymentId ? 'refreshing' : resolvedStatus;
    status.textContent = resolvedStatus;

    top.append(titleWrap, status);

    const bottom = document.createElement('div');
    bottom.className = 'donation-history-card__bottom';

    const amount = document.createElement('div');
    amount.className = 'donation-history-card__amount';
    amount.textContent = `${entry.amount ?? '—'} ${entry.currency || donationCatalog?.token?.symbol || 'USDT'}`;
    bottom.appendChild(amount);

    if (entry.paymentId && resolvedStatus === DONATION_PENDING_STATUS) {
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'payment-secondary-btn donation-history-card__refresh';
      const cooldownRemaining = getDonationRefreshCooldownRemaining(entry.paymentId);
      refreshBtn.disabled = donationUiState.refreshingPaymentId === entry.paymentId || cooldownRemaining > 0;
      refreshBtn.textContent = donationUiState.refreshingPaymentId === entry.paymentId
        ? 'Refreshing…'
        : cooldownRemaining > 0
          ? `Refresh in ${formatCooldownMs(cooldownRemaining)}`
          : 'Refresh';
      refreshBtn.addEventListener('click', () => refreshDonationHistoryEntry(entry.paymentId));
      bottom.appendChild(refreshBtn);
    }

    card.append(top, bottom);
    listEl.appendChild(card);
  });
}

function hasDonationExpired(payment = null, status = null) {
  const expiresAt = payment?.expiresAt || status?.expiresAt;
  if (!expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs <= Date.now();
}

function getDonationWalletProvider() {
  if (window.ethereum?.request) return window.ethereum;
  if (WC?.provider?.request) return WC.provider;
  return null;
}

function normalizeHexQuantity(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return null;
    if (/^0x[0-9a-f]+$/i.test(normalized)) return normalized.toLowerCase();
    if (/^\d+$/.test(normalized)) return `0x${BigInt(normalized).toString(16)}`;
    return normalized;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    return `0x${BigInt(Math.trunc(value)).toString(16)}`;
  }
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  return null;
}

function normalizeDonationTxRequest(rawTxRequest, payment = null) {
  const source = rawTxRequest && typeof rawTxRequest === 'object' ? rawTxRequest : {};
  const tx = {
    from: source.from || payment?.payerWallet || payment?.wallet || undefined,
    to: source.to || source.recipient || payment?.merchantWallet || payment?.recipient || undefined,
    data: source.data || source.input || undefined,
    value: normalizeHexQuantity(source.value),
    gas: normalizeHexQuantity(source.gas || source.gasLimit),
    gasPrice: normalizeHexQuantity(source.gasPrice),
    maxFeePerGas: normalizeHexQuantity(source.maxFeePerGas),
    maxPriorityFeePerGas: normalizeHexQuantity(source.maxPriorityFeePerGas),
    nonce: normalizeHexQuantity(source.nonce)
  };

  if (source.chainId != null || payment?.chainId != null) {
    tx.chainId = normalizeHexQuantity(source.chainId ?? payment?.chainId);
  }

  return Object.fromEntries(Object.entries(tx).filter(([, value]) => value != null && value !== ''));
}

function extractDonationTxRequest(paymentData = null) {
  if (!paymentData || typeof paymentData !== 'object') return null;

  const directCandidates = [
    paymentData.txRequest,
    paymentData.transactionRequest,
    paymentData.transaction,
    paymentData.tx,
    paymentData.walletRequest,
    paymentData.sendTransaction,
    paymentData.payload,
    paymentData.payment?.txRequest,
    paymentData.payment?.transactionRequest,
    paymentData.payment?.transaction,
    paymentData.payment?.tx
  ];

  const directTx = directCandidates.find((candidate) => candidate && typeof candidate === 'object');
  if (directTx) return normalizeDonationTxRequest(directTx, paymentData);

  const hasInlineTxFields = ['to', 'recipient', 'data', 'input', 'value'].some((key) => paymentData[key] != null);
  if (hasInlineTxFields) return normalizeDonationTxRequest(paymentData, paymentData);

  return null;
}

async function ensureDonationWalletChain(provider, txRequest) {
  const requestedChainId = txRequest?.chainId;
  if (!provider?.request || !requestedChainId) return;

  let currentChainId = null;
  try {
    currentChainId = await provider.request({ method: 'eth_chainId' });
  } catch (error) {
    console.warn('⚠️ Failed to read active wallet chain:', error);
    return;
  }

  if (String(currentChainId).toLowerCase() === String(requestedChainId).toLowerCase()) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: requestedChainId }]
    });
  } catch (error) {
    throw new Error(`Switch wallet network to ${requestedChainId} and retry. ${error?.message || error}`);
  }
}

async function invokeDonationWallet(txRequest) {
  const provider = getDonationWalletProvider();
  if (!provider) throw new Error('No connected EVM wallet available');

  const normalizedTxRequest = normalizeDonationTxRequest(txRequest);
  if (!normalizedTxRequest?.to) throw new Error('Backend did not provide a valid wallet transaction request');

  await ensureDonationWalletChain(provider, normalizedTxRequest);

  return provider.request({
    method: 'eth_sendTransaction',
    params: [normalizedTxRequest]
  });
}

function openDonationModal() {
  donationPaymentState.isOpen = false;
}

function closeDonationModal() {
  donationPaymentState.isOpen = false;
  cleanupDonationAsync();
  donationPaymentState.isCreating = false;
  donationPaymentState.isSubmitting = false;
  donationPaymentState.error = '';
  donationPaymentState.walletError = '';
  donationPaymentState.payment = null;
  donationPaymentState.status = null;
  donationPaymentState.reward = null;
  donationPaymentState.selectedProductKey = '';
  donationPaymentState.txHash = '';
}

function renderDonationPaymentModal() {
  syncDonationCountdown();
}

async function loadDonationHistory({ silent = false } = {}) {
  if (!isAuthenticated()) return;
  const wallet = getDonationIdentifier();
  if (!wallet) return;

  donationUiState.historyLoading = !silent;
  donationUiState.historyError = '';
  renderDonationHistory();

  try {
    const { response, data } = await getDonationHistory(wallet, { headers: { 'X-Wallet': wallet } });
    if (!response.ok || !data) {
      donationUiState.historyError = data?.error || 'Failed to load purchase history';
      return;
    }

    const entries = Array.isArray(data)
      ? data
      : Array.isArray(data.history)
        ? data.history
        : Array.isArray(data.payments)
          ? data.payments
          : [];

    donationUiState.history = normalizeDonationHistoryEntries(mergeDonationHistoryWithPending(entries));
  } catch (error) {
    console.error('❌ Donation history error:', error);
    donationUiState.historyError = 'Failed to load purchase history';
  } finally {
    donationUiState.historyLoading = false;
    renderDonationHistory();
  }
}

function upsertDonationHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return;
  const paymentId = entry.paymentId;
  const current = Array.isArray(donationUiState.history) ? donationUiState.history : [];
  const merged = paymentId
    ? current.map((item) => item.paymentId === paymentId ? { ...item, ...entry } : item)
    : [...current];
  if (paymentId && !merged.some((item) => item.paymentId === paymentId)) {
    merged.unshift(entry);
  }
  donationUiState.history = normalizeDonationHistoryEntries(mergeDonationHistoryWithPending(merged));
  renderDonationHistory();
}

async function refreshDonationHistoryEntry(paymentId, { silent = false } = {}) {
  if (!paymentId) return null;
  const cooldownRemaining = getDonationRefreshCooldownRemaining(paymentId);
  if (cooldownRemaining > 0) {
    if (!silent) showToast(`Refresh is available in ${formatCooldownMs(cooldownRemaining)}`, 'info');
    renderDonationHistory();
    renderDonationPaymentModal();
    return null;
  }
  donationUiState.refreshingPaymentId = paymentId;
  donationUiState.refreshCooldowns[paymentId] = Date.now() + DONATION_REFRESH_COOLDOWN_MS;
  scheduleDonationRefreshCooldownRender(paymentId);
  if (!silent) donationUiState.historyError = '';
  renderDonationHistory();

  try {
    const pendingEntry = getDonationPendingEntry(paymentId);
    const wallet = getDonationIdentifier();
    const { response, data } = await getDonationPayment(paymentId, {
      wallet,
      txHash: pendingEntry?.txHash || '',
      headers: wallet ? { 'X-Wallet': wallet } : undefined
    });
    if (!response.ok || !data) {
      if (!silent) donationUiState.historyError = data?.error || 'Failed to refresh payment';
      return null;
    }

    if (DONATION_FINAL_STATUSES.has(String(data.status || '').toLowerCase())) {
      clearDonationPendingEntry(paymentId);
    } else if (getDonationPendingEntry(paymentId)) {
      setDonationPendingEntry(paymentId, { status: data.status || DONATION_PENDING_STATUS });
    }

    upsertDonationHistoryEntry(data);

    if (donationPaymentState.payment?.paymentId === paymentId) {
      const normalizedServerStatus = String(data.status || '').toLowerCase();
      const shouldKeepPending = !DONATION_FINAL_STATUSES.has(normalizedServerStatus);
      const existingPending = getDonationPendingEntry(paymentId);

      if (shouldKeepPending && existingPending) {
        setDonationPendingEntry(paymentId, {
          paymentId,
          status: normalizedServerStatus || DONATION_PENDING_STATUS,
          submittedAt: existingPending.submittedAt,
          txHash: data?.txHash || existingPending.txHash || donationPaymentState.txHash || ''
        });
        donationPaymentState.status = { ...data, status: DONATION_PENDING_STATUS };
      } else {
        donationPaymentState.status = data;
      }
      donationPaymentState.txHash = data?.txHash || donationPaymentState.txHash;
      if (data.reward) donationPaymentState.reward = data.reward;
      renderDonationPaymentModal();
    }

    if (getClientSideDonationStatus(data) === 'credited') {
      showToast('Donation reward credited', 'success');
      await loadPlayerUpgrades();
      updateStoreUI();
      await loadDonationHistory({ silent: true });
    }

    return data;
  } catch (error) {
    console.error('❌ Donation payment refresh error:', error);
    if (!silent) donationUiState.historyError = 'Failed to refresh payment';
    return null;
  } finally {
    donationUiState.refreshingPaymentId = '';
    renderDonationHistory();
  }
}

async function loadDonationProducts({ silent = false } = {}) {
  if (!isAuthenticated()) return;
  const wallet = getDonationIdentifier();
  if (!wallet) return;

  donationUiState.isLoading = !silent;
  donationUiState.error = '';
  renderDonationProducts();

  try {
    const { response, data } = await getDonationProducts(wallet, { headers: { 'X-Wallet': wallet } });
    if (!response.ok || !data) {
      donationUiState.error = data?.error || 'Failed to load donation offers';
      return;
    }

    donationCatalog = data;
    donationUiState.products = Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    console.error('❌ Donation catalog error:', error);
    donationUiState.error = 'Failed to load donation offers';
  } finally {
    donationUiState.isLoading = false;
    renderDonationProducts();
    renderDonationPaymentModal();
  }
}

function buildDonationRequestPayload(basePayload = {}) {
  syncAuthGlobals();
  const identifier = getDonationIdentifier();
  if (!identifier) return null;

  return {
    wallet: authMode === 'telegram'
      ? String(primaryId || identifier).trim()
      : String(identifier).trim().toLowerCase(),
    ...basePayload
  };
}


async function handleDonationBuy(product) {
  if (!product || donationPaymentState.isCreating) return;
  const wallet = getDonationIdentifier();
  if (!wallet) {
    showToast('Connect wallet first', 'error');
    return;
  }

  donationPaymentState.isCreating = true;
  donationPaymentState.error = '';
  donationPaymentState.selectedProductKey = product.key;
  donationPaymentState.payment = null;
  donationPaymentState.status = null;
  donationPaymentState.reward = null;
  renderDonationPaymentModal();

  try {
    const requestPayload = buildDonationRequestPayload({ productKey: product.key });
    if (!requestPayload) {
      donationPaymentState.error = 'Failed to prepare donation payment request';
      return;
    }

    const { response, data } = await createDonationPayment(requestPayload, { headers: { 'X-Wallet': requestPayload.wallet } });
    if (!response.ok || !data) {
      donationPaymentState.error = data?.error || 'Failed to create payment';
      return;
    }

    donationPaymentState.payment = data;
    donationPaymentState.status = { status: data.status || null, reward: null, expiresAt: data.expiresAt, failureReason: data.failureReason || '' };
    donationPaymentState.walletError = '';
    donationPaymentState.txHash = '';
    startDonationCountdown();
    showToast('Confirm the transaction in your wallet', 'info');

    const txRequest = extractDonationTxRequest(data);
    if (!txRequest) {
      donationPaymentState.walletError = 'Backend did not return a wallet-ready transaction. Refresh the history entry after completing payment externally.';
      return;
    }

    donationPaymentState.isInvokingWallet = true;
    renderDonationPaymentModal();
    try {
      const txHash = await invokeDonationWallet(txRequest);
      donationPaymentState.txHash = String(txHash || '');
      if (!donationPaymentState.txHash) throw new Error('Wallet did not return a transaction hash');

      const submittedAt = new Date().toISOString();
      setDonationPendingEntry(data.paymentId, {
        wallet: buildDonationRequestPayload()?.wallet || getDonationIdentifier() || '',
        status: DONATION_PENDING_STATUS,
        submittedAt,
        txHash: donationPaymentState.txHash,
        createdAt: data.createdAt || submittedAt,
        amount: data.amount,
        currency: data.currency,
        title: data.title,
        productKey: data.productKey
      });
      ensureDonationPendingHistoryEntry(data, {
        status: DONATION_PENDING_STATUS,
        submittedAt,
        txHash: donationPaymentState.txHash
      });

      await handleDonationSubmit({ txHash: donationPaymentState.txHash, submittedAt });
    } catch (walletError) {
      const message = String(walletError?.message || walletError || 'Wallet transaction failed');
      const rejected = /user rejected|user denied|rejected the request|cancelled/i.test(message);
      donationPaymentState.walletError = rejected
        ? 'Transaction was rejected in your wallet. Retry when you are ready.'
        : `Wallet transaction failed: ${message}`;
      await loadDonationHistory({ silent: true });
      donationPaymentState.status = { ...(donationPaymentState.status || {}), status: null };
    } finally {
      donationPaymentState.isInvokingWallet = false;
    }
  } catch (error) {
    console.error('❌ Donation payment error:', error);
    donationPaymentState.error = 'Failed to create payment';
  } finally {
    donationPaymentState.isCreating = false;
    renderDonationPaymentModal();
  }
}

function getSelectedDonationProduct() {
  return donationUiState.products.find((product) => product.key === donationPaymentState.selectedProductKey) || null;
}

async function refreshDonationStatus({ silent = false } = {}) {
  const paymentId = donationPaymentState.payment?.paymentId;
  if (!paymentId) return;

  const data = await refreshDonationHistoryEntry(paymentId, { silent });
  if (!data) return;

  donationPaymentState.error = '';
  renderDonationPaymentModal();
}

async function handleDonationSubmit({ txHash: providedTxHash = '', submittedAt: providedSubmittedAt = '' } = {}) {
  const paymentId = donationPaymentState.payment?.paymentId;
  const txHash = String(providedTxHash || donationPaymentState.txHash || '').trim();

  if (!paymentId) {
    showToast('Payment is not ready yet', 'error');
    return;
  }
  if (!txHash) {
    showToast('Paste txHash first', 'error');
    return;
  }

  if (hasDonationExpired(donationPaymentState.payment, donationPaymentState.status)) {
    donationPaymentState.error = 'Payment expired. Create a new payment and try again.';
    renderDonationPaymentModal();
    return;
  }

  donationPaymentState.isSubmitting = true;
  donationPaymentState.error = '';
  donationPaymentState.walletError = '';
  donationPaymentState.txHash = txHash;
  renderDonationPaymentModal();

  try {
    const requestPayload = buildDonationRequestPayload({ paymentId, txHash });
    if (!requestPayload) {
      donationPaymentState.error = 'Failed to prepare transaction submission';
      return;
    }

    const { response, data } = await submitDonationTransaction(requestPayload, { headers: { 'X-Wallet': requestPayload.wallet } });
    if (!response.ok || !data) {
      donationPaymentState.error = data?.error || 'Failed to submit transaction';
      return;
    }

    const normalizedServerStatus = String(data.status || '').toLowerCase();
    const shouldKeepPending = !DONATION_FINAL_STATUSES.has(normalizedServerStatus);

    if (shouldKeepPending) {
      const submittedAt = providedSubmittedAt || new Date().toISOString();
      setDonationPendingEntry(paymentId, {
        wallet: requestPayload.wallet,
        status: normalizedServerStatus || DONATION_PENDING_STATUS,
        submittedAt,
        txHash,
        createdAt: donationPaymentState.payment?.createdAt || submittedAt,
        amount: donationPaymentState.payment?.amount,
        currency: donationPaymentState.payment?.currency,
        title: donationPaymentState.payment?.title,
        productKey: donationPaymentState.payment?.productKey
      });
      donationPaymentState.status = { ...data, status: DONATION_PENDING_STATUS };
    } else {
      clearDonationPendingEntry(paymentId);
      donationPaymentState.status = data;
    }
    donationPaymentState.txHash = data?.txHash || donationPaymentState.txHash;
    if (data.reward) donationPaymentState.reward = data.reward;

    upsertDonationHistoryEntry({ ...(donationPaymentState.payment || {}), ...data, paymentId, status: shouldKeepPending ? DONATION_PENDING_STATUS : data.status });
    await loadDonationHistory({ silent: true });

    if (shouldKeepPending) {
      showToast('Transaction submitted. Status is pending until backend confirms it.', 'info');
    } else if (normalizedServerStatus === 'credited') {
      await refreshDonationStatus();
    }
  } catch (error) {
    console.error('❌ Donation submit error:', error);
    const submittedAt = providedSubmittedAt || new Date().toISOString();
    setDonationPendingEntry(paymentId, {
      wallet: buildDonationRequestPayload()?.wallet || getDonationIdentifier() || '',
      status: DONATION_PENDING_STATUS,
      submittedAt,
      txHash,
      createdAt: donationPaymentState.payment?.createdAt || submittedAt,
      amount: donationPaymentState.payment?.amount,
      currency: donationPaymentState.payment?.currency,
      title: donationPaymentState.payment?.title,
      productKey: donationPaymentState.payment?.productKey
    });
    ensureDonationPendingHistoryEntry(donationPaymentState.payment, {
      status: DONATION_PENDING_STATUS,
      submittedAt,
      txHash
    });
    donationPaymentState.status = { ...(donationPaymentState.status || {}), status: DONATION_PENDING_STATUS };
    donationPaymentState.error = 'Failed to submit transaction. Payment stays pending until backend confirmation is available.';
  } finally {
    donationPaymentState.isSubmitting = false;
    renderDonationPaymentModal();
  }
}

function bindDonationUi() {
  document.querySelectorAll('[data-store-tab]').forEach((button) => {
    button.addEventListener('click', () => setActiveStoreTab(button.dataset.storeTab));
  });

  document.querySelectorAll('[data-donation-close]').forEach((button) => {
    button.addEventListener('click', closeDonationModal);
  });
}

function resetStoreState() {
  cleanupDonationAsync();
  playerUpgrades = null;
  playerEffects = null;
  playerBalance = { gold: 0, silver: 0 };
  donationCatalog = null;
  Object.values(donationRefreshCooldownTimers).forEach((timerId) => clearTimeout(timerId));
  donationRefreshCooldownTimers = {};
  donationUiState = { isLoading: false, error: '', products: [], history: [], historyLoading: false, historyError: '', refreshingPaymentId: '', refreshCooldowns: {} };
  donationPaymentState = {
    isOpen: false,
    isCreating: false,
    isSubmitting: false,
    isInvokingWallet: false,
    error: '',
    walletError: '',
    selectedProductKey: '',
    payment: null,
    status: null,
    reward: null,
    txHash: ''
  };
  clearRuntimeConfig();
  playerRides = {
    limited: true,
    freeRides: 3,
    paidRides: 0,
    totalRides: 3,
    resetInMs: 0,
    resetInFormatted: "Ready"
  };
  isStoreDataLoading = false;

  const goldEl = document.getElementById("storeGoldVal");
  const silverEl = document.getElementById("storeSilverVal");
  if (goldEl) goldEl.textContent = "0";
  if (silverEl) silverEl.textContent = "0";

  applyStoreDefaultLockState();
  setActiveStoreTab('upgrade');
  renderDonationProducts();
  renderDonationHistory();
  closeDonationModal();
  updateRidesDisplay();
}

async function buyUpgrade(key, tier) {
  syncAuthGlobals();
  if (isStoreDataLoading) {
    alert("⏳ Store is loading, try again in a moment");
    return;
  }

  const purchaseKey = `${String(key)}:${Number(tier)}`;
  if (pendingStorePurchases.has(purchaseKey)) {
    console.warn("⚠️ Duplicate store purchase prevented", { upgradeKey: key, tier });
    return;
  }

  if (!isAuthenticated()) {
    alert("🔗 Authentication required!");
    return;
  }

  if (!isStoreAvailable()) {
    alert("🛒 Store is unavailable in browser mode");
    return;
  }

  const upgradeState = playerUpgrades && playerUpgrades[key];
  if (upgradeState) {
    const expectedTier = getEffectiveUpgradeLevel(key, upgradeState);
    if (tier < expectedTier) {
      alert("❌ Already purchased (permanent)");
      return;
    }
    const isShieldStackFirstTier = key === 'shield' && expectedTier === 0 && tier === 1;
    if (tier > expectedTier && !isShieldStackFirstTier) {
      alert("⚠️ Buy previous level first");
      return;
    }
  }

  const identifier = getAuthIdentifier();
  pendingStorePurchases.add(purchaseKey);
  try {
    const timestamp = Date.now();
    let requestData;
    let walletForSignature = "";

    if (authMode === "telegram") {
      const telegramId = telegramUser?.id || linkedTelegramId || null;
      if (!telegramId) {
        alert("❌ Telegram account not detected");
        return;
      }

      requestData = {
        wallet: primaryId,
        upgradeKey: key,
        tier,
        timestamp,
        authMode: "telegram",
        telegramId
      };
    } else {
      walletForSignature = String(identifier || "").toLowerCase();
      const message = `Buy upgrade\nWallet: ${walletForSignature}\nUpgrade: ${key}\nTier: ${tier}\nTimestamp: ${timestamp}`;
      const signature = await signMessage(message);
      if (!signature) {
        alert("❌ Failed to sign transaction");
        return;
      }
      requestData = {
        wallet: walletForSignature,
        upgradeKey: key,
        tier,
        signature,
        timestamp
      };
    }

    const response = await request(`${BACKEND_URL}/api/store/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wallet": requestData.wallet || primaryId || identifier },
      body: JSON.stringify(requestData)
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      data = { success: false, error: await response.text() };
    }

    if (response.ok && data.success) {
      if (data.rides) {
        playerRides = data.rides;
        updateRidesDisplay();
      }

      console.log("✅ Purchase success:", data.message);

      playerBalance = data.balance;
      playerEffects = data.activeEffects;

      await loadPlayerUpgrades();
      updateStoreUI();

      const goldEl = document.getElementById("walletGold");
      const silverEl = document.getElementById("walletSilver");
      if (goldEl) goldEl.textContent = playerBalance.gold;
      if (silverEl) silverEl.textContent = playerBalance.silver;
    } else {
      const serverError = data && data.error ? data.error : "Purchase failed";
      const isConflict = isAlreadyPurchasedError(serverError);

      if (isConflict) {
        console.warn("⚠️ Purchase conflict: UI state is stale, syncing store data", {
          upgradeKey: key,
          tier,
          error: serverError,
          upgradeState,
          activeEffects: playerEffects
        });
        await loadPlayerUpgrades();

        // Some backend versions return effect flags but don't update upgrades.currentLevel
        // immediately. Keep UI consistent with conflict response to avoid a dead button state.
        if (playerUpgrades && playerUpgrades[key]) {
          const syncedLevel = getEffectiveUpgradeLevel(key, playerUpgrades[key]);
          if (tier >= syncedLevel) {
            playerUpgrades[key].currentLevel = tier + 1;
          }
        }
        updateStoreUI();
      }

      alert(`❌ ${serverError}`);
    }
  } catch (error) {
    console.error("❌ Purchase error:", error);
    alert("❌ Network error");
  } finally {
    pendingStorePurchases.delete(purchaseKey);
  }
}


/* ===== RULES OVERLAY ===== */

function showRules() {
  const screen = document.getElementById("rulesScreen");
  if (screen) {
    screen.classList.add("visible");
    updateRulesAudioButtons();
  }
  const globalToggles = document.getElementById("audioTogglesGlobal");
  if (globalToggles) globalToggles.style.display = "none";
  const walletCorner = document.getElementById("walletCorner");
  if (walletCorner) walletCorner.style.display = "none";
}

function hideRules() {
  const screen = document.getElementById("rulesScreen");
  if (screen) screen.classList.remove("visible");
  const globalToggles = document.getElementById("audioTogglesGlobal");
  if (globalToggles) globalToggles.style.display = "flex";
  const walletCorner = document.getElementById("walletCorner");
  if (walletCorner) walletCorner.style.display = "flex";
}

function updateRulesAudioButtons() {
  syncAllAudioUI();
}

let storeBootstrapInitialized = false;

function initStoreBootstrap() {
  if (storeBootstrapInitialized) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyStoreDefaultLockState();
      bindDonationUi();
      setActiveStoreTab('upgrade');
      renderDonationProducts();
    }, { once: true });
  } else {
    applyStoreDefaultLockState();
    bindDonationUi();
    setActiveStoreTab('upgrade');
    renderDonationProducts();
  }
  window.addEventListener('beforeunload', cleanupDonationAsync);
  storeBootstrapInitialized = true;
}

export {
  initStoreBootstrap,
  playerRides,
  playerUpgrades,
  playerEffects,
  playerBalance,
  getRuntimeGameConfig,
  loadUnauthGameConfig,
  applyRuntimeConfig,
  clearRuntimeConfig,
  isUnauthRuntimeMode,
  isStoreAvailable,
  canPersistProgress,
  isEligibleForLeaderboardFlow,
  hasRideLimit,
  loadPlayerRides,
  useRide,
  updateRidesDisplay,
  applyStoreDefaultLockState,
  loadPlayerUpgrades,
  updateStoreUI,
  resetStoreState,
  buyUpgrade,
  showRules,
  hideRules,
  updateRulesAudioButtons,
  setActiveStoreTab,
  closeDonationModal,
  loadDonationProducts
};
