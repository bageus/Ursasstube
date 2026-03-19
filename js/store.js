/* ===== RIDES SYSTEM ===== */
import { BACKEND_URL } from './config.js';
import { request } from './request.js';
import { isAuthenticated, getAuthIdentifier, signMessage } from './api.js';
import { getAuthState } from './auth.js';
import { syncAllAudioUI } from './audio.js';
import { createIconAtlas, createImageIcon, clearNode } from './dom-render.js';
import { getDonationProducts, createDonationPayment, submitDonationTransaction, getDonationPayment } from './donation-service.js';
import { WC } from './walletconnect.js';

let {
  authMode = null,
  primaryId = null,
  userWallet = null,
  telegramUser = null,
  linkedTelegramId = null
} = getAuthState();

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
  freeRides: 3,
  paidRides: 0,
  totalRides: 3,
  resetInMs: 0,
  resetInFormatted: "Ready"
};

async function loadPlayerRides() {
  if (!isAuthenticated()) return;
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
  if (!isAuthenticated()) return true;
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

  if (!isAuthenticated()) {
     ridesInfo.classList.remove("visible");
    ridesInfo.setAttribute("aria-hidden", "true");
    return;
  }

  ridesInfo.classList.add("visible");
  ridesInfo.setAttribute("aria-hidden", "false");

  const total = playerRides.totalRides;
  const free = playerRides.freeRides;
  const paid = playerRides.paidRides;

  const ridesText = document.getElementById("ridesText");
  const ridesTimer = document.getElementById("ridesTimer");

  if (ridesText) {
    appendRidesLabel(ridesText, {
      iconPosition: '-84px -28px',
      text: `${total} ride${total === 1 ? '' : 's'}`
    });
    if (paid > 0) {
      ridesText.append(document.createTextNode(` (${free} free + ${paid} purchased)`));
    }
  }

  if (ridesTimer) {
    if (free < 3 && playerRides.resetInMs > 0) {
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
    if (total <= 0) {
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

const DONATION_POLL_INTERVAL_MS = 5000;
const DONATION_FINAL_STATUSES = new Set(['credited', 'failed', 'expired']);

let activeStoreTab = 'upgrade';
let donationCatalog = null;
let donationUiState = {
  isLoading: false,
  error: '',
  products: []
};
let donationPaymentState = {
  isOpen: false,
  isCreating: false,
  isSubmitting: false,
  isPolling: false,
  isInvokingWallet: false,
  error: '',
  walletError: '',
  selectedProductKey: '',
  payment: null,
  status: null,
  reward: null,
  txHash: ''
};
let donationPollingTimer = null;
let donationCountdownTimer = null;
let donationAbortController = null;
let toastTimerCounter = 0;

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
  if (!isAuthenticated()) return;
  const identifier = getAuthIdentifier();
  isStoreDataLoading = true;
  try {
    const url = `${BACKEND_URL}/api/store/upgrades/${identifier}`;
    const response = await request(url);
    const data = await response.json();

    if (response.ok) {
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

  if (activeStoreTab === 'donation' && isAuthenticated() && donationUiState.products.length === 0 && !donationUiState.isLoading) {
    loadDonationProducts();
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

function stopDonationPolling() {
  if (donationPollingTimer) {
    clearInterval(donationPollingTimer);
    donationPollingTimer = null;
  }
  donationPaymentState.isPolling = false;
}

function stopDonationCountdown() {
  if (donationCountdownTimer) {
    clearInterval(donationCountdownTimer);
    donationCountdownTimer = null;
  }
}

function cleanupDonationAsync() {
  stopDonationPolling();
  stopDonationCountdown();
  if (donationAbortController) {
    donationAbortController.abort();
    donationAbortController = null;
  }
}

function formatReward(reward = {}) {
  const gold = Number(reward.gold || 0);
  const silver = Number(reward.silver || 0);
  return `+${gold} gold · +${silver} silver`;
}

function getDonationStatusText(status, failureReason = '') {
  if (failureReason) return failureReason;
  switch (status) {
    case 'created':
      return 'Confirm the USDT transfer in your wallet';
    case 'pending':
      return 'Transaction is being verified';
    case 'credited':
      return 'Payment credited successfully';
    case 'failed':
      return 'Payment verification failed';
    case 'expired':
      return 'Payment expired';
    default:
      return 'Create a payment to continue';
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
    const unavailable = !product.canPurchase || (product.purchaseLimit === 'once' && product.alreadyPurchased);
    button.className = 'donation-card__buy';
    button.type = 'button';
    button.disabled = unavailable || donationPaymentState.isCreating;
    button.textContent = unavailable ? (product.alreadyPurchased ? 'Already purchased' : 'Unavailable') : 'Buy';
    button.addEventListener('click', () => handleDonationBuy(product));

    card.append(title, price, reward, limit, button);
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

async function invokeDonationWallet(txRequest) {
  const provider = getDonationWalletProvider();
  if (!provider) throw new Error('No connected EVM wallet available');
  return provider.request({
    method: 'eth_sendTransaction',
    params: [txRequest]
  });
}

function openDonationModal() {
  donationPaymentState.isOpen = true;
  const modal = document.getElementById('donationPaymentModal');
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  renderDonationPaymentModal();
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
  const txInput = document.getElementById('donationTxHashInput');
  if (txInput) txInput.value = '';
  const modal = document.getElementById('donationPaymentModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
}

function renderDonationPaymentModal() {
  const modal = document.getElementById('donationPaymentModal');
  if (!modal || modal.hidden) return;

  const payment = donationPaymentState.payment;
  const statusData = donationPaymentState.status;
  const currentStatus = statusData?.status || payment?.status || (donationPaymentState.isCreating ? 'created' : null);
  const failureReason = statusData?.failureReason || payment?.failureReason || '';
  const amountEl = document.getElementById('donationPaymentAmount');
  const networkEl = document.getElementById('donationPaymentNetwork');
  const walletEl = document.getElementById('donationPaymentWallet');
  const subtitleEl = document.getElementById('donationPaymentSubtitle');
  const statusEl = document.getElementById('donationPaymentStatus');
  const metaEl = document.getElementById('donationPaymentMeta');
  const rewardEl = document.getElementById('donationRewardBox');
  const submitBtn = document.getElementById('submitDonationTxBtn');
  const retryBtn = document.getElementById('retryDonationStatusBtn');
  const txInput = document.getElementById('donationTxHashInput');
  const copyTxBtn = document.getElementById('copyDonationTxHashBtn');

  if (amountEl) amountEl.textContent = payment ? `${payment.amount} ${payment.currency}` : '—';
  if (networkEl) networkEl.textContent = payment?.network || donationCatalog?.network || 'BSC';
  if (walletEl) walletEl.textContent = payment?.merchantWallet || donationCatalog?.token?.merchantWallet || '—';
  if (subtitleEl) subtitleEl.textContent = payment?.title || 'Create a payment to continue.';
  if (statusEl) statusEl.textContent = donationPaymentState.error || donationPaymentState.walletError || (donationPaymentState.isInvokingWallet ? 'Waiting for wallet confirmation' : getDonationStatusText(currentStatus, failureReason));
  const txHash = donationPaymentState.txHash || statusData?.txHash || payment?.txHash || '';
  if (metaEl) metaEl.textContent = payment?.paymentId ? `Payment ID: ${payment.paymentId}${txHash ? ` · txHash: ${txHash}` : ''}` : '';

  const allowManualFallback = Boolean(donationPaymentState.walletError);
  if (submitBtn) {
    submitBtn.disabled = !payment?.paymentId || donationPaymentState.isSubmitting || !allowManualFallback;
    submitBtn.hidden = !allowManualFallback;
  }
  if (retryBtn) {
    retryBtn.disabled = (!payment?.paymentId && !donationPaymentState.selectedProductKey) || donationPaymentState.isPolling || donationPaymentState.isCreating;
    retryBtn.textContent = hasDonationExpired(payment, statusData) ? 'Create new payment' : 'Retry status';
  }
  if (txInput) {
    txInput.disabled = !payment?.paymentId || donationPaymentState.isSubmitting || !allowManualFallback;
    txInput.hidden = !allowManualFallback;
    txInput.value = allowManualFallback ? donationPaymentState.txHash : txHash;
  }
  const txField = txInput?.closest('.payment-modal__field');
  if (txField) txField.hidden = !allowManualFallback;
  if (copyTxBtn) copyTxBtn.hidden = !allowManualFallback;
  const warningEl = modal.querySelector('.payment-modal__warning');
  if (warningEl) warningEl.textContent = allowManualFallback
    ? 'Wallet confirmation failed. You can retry in your wallet or manually paste the txHash after sending the backend-provided transaction.'
    : 'Your connected wallet should open automatically. Confirm the backend-prepared transaction exactly as shown.';

  const reward = statusData?.reward || donationPaymentState.reward;
  if (rewardEl) {
    rewardEl.hidden = !(currentStatus === 'credited' && reward);
    rewardEl.textContent = reward ? `Reward credited: ${formatReward(reward)}` : '';
  }

  syncDonationCountdown();
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
  donationPaymentState.status = { status: 'created' };
  donationPaymentState.reward = null;
  openDonationModal();
  renderDonationPaymentModal();

  try {
    const { response, data } = await createDonationPayment({ wallet, productKey: product.key }, { headers: { 'X-Wallet': wallet } });
    if (!response.ok || !data) {
      donationPaymentState.error = data?.error || 'Failed to create payment';
      return;
    }

    donationPaymentState.payment = data;
    donationPaymentState.status = { status: data.status || 'created', reward: null, expiresAt: data.expiresAt, failureReason: data.failureReason || '' };
    donationPaymentState.walletError = '';
    donationPaymentState.txHash = '';
    startDonationCountdown();
    showToast('Payment created', 'success');

    if (!data.txRequest) {
      donationPaymentState.walletError = 'Wallet request is unavailable. Use manual fallback only if support confirms this payment payload is valid.';
      return;
    }

    donationPaymentState.isInvokingWallet = true;
    renderDonationPaymentModal();
    try {
      const txHash = await invokeDonationWallet(data.txRequest);
      donationPaymentState.txHash = String(txHash || '');
      if (!donationPaymentState.txHash) throw new Error('Wallet did not return a transaction hash');
      await handleDonationSubmit({ txHash: donationPaymentState.txHash });
    } catch (walletError) {
      const message = String(walletError?.message || walletError || 'Wallet transaction failed');
      const rejected = /user rejected|user denied|rejected the request|cancelled/i.test(message);
      donationPaymentState.walletError = rejected
        ? 'Transaction was rejected in your wallet. Retry when you are ready.'
        : `Wallet transaction failed: ${message}`;
      donationPaymentState.status = { ...(donationPaymentState.status || {}), status: 'created' };
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

  try {
    const { response, data } = await getDonationPayment(paymentId);
    if (!response.ok || !data) {
      if (!silent) donationPaymentState.error = data?.error || 'Failed to refresh payment status';
      renderDonationPaymentModal();
      return;
    }

    donationPaymentState.error = '';
    donationPaymentState.status = data;
    donationPaymentState.txHash = data?.txHash || donationPaymentState.txHash;
    if (data.reward) donationPaymentState.reward = data.reward;

    if (DONATION_FINAL_STATUSES.has(data.status)) {
      stopDonationPolling();
      if (data.status === 'credited') {
        showToast('Donation reward credited', 'success');
        await loadPlayerUpgrades();
        updateStoreUI();
        await loadDonationProducts({ silent: true });
      }
    }
  } catch (error) {
    console.error('❌ Donation status error:', error);
    if (!silent) donationPaymentState.error = 'Failed to refresh payment status';
  } finally {
    renderDonationPaymentModal();
  }
}

function startDonationPolling() {
  stopDonationPolling();
  donationPaymentState.isPolling = true;
  donationPollingTimer = setInterval(() => {
    refreshDonationStatus({ silent: true });
  }, DONATION_POLL_INTERVAL_MS);
}

async function handleDonationSubmit({ txHash: providedTxHash = '' } = {}) {
  const wallet = getDonationIdentifier();
  const paymentId = donationPaymentState.payment?.paymentId;
  const txInput = document.getElementById('donationTxHashInput');
  const txHash = String(providedTxHash || txInput?.value || donationPaymentState.txHash || '').trim();

  if (!wallet || !paymentId) {
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
    const { response, data } = await submitDonationTransaction({ wallet, paymentId, txHash }, { headers: { 'X-Wallet': wallet } });
    if (!response.ok || !data) {
      donationPaymentState.error = data?.error || 'Failed to submit transaction';
      return;
    }

    donationPaymentState.status = data;
    donationPaymentState.txHash = data?.txHash || donationPaymentState.txHash;
    if (data.reward) donationPaymentState.reward = data.reward;

    if (data.status === 'pending' || data.status === 'submitted' || data.status === 'confirming') {
      startDonationPolling();
      showToast('Transaction submitted for verification', 'info');
    } else if (data.status === 'credited') {
      await refreshDonationStatus();
    }
  } catch (error) {
    console.error('❌ Donation submit error:', error);
    donationPaymentState.error = 'Failed to submit transaction';
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

  const submitBtn = document.getElementById('submitDonationTxBtn');
  if (submitBtn) submitBtn.addEventListener('click', handleDonationSubmit);

  const retryBtn = document.getElementById('retryDonationStatusBtn');
  if (retryBtn) retryBtn.addEventListener('click', async () => {
    if (hasDonationExpired(donationPaymentState.payment, donationPaymentState.status)) {
      const product = getSelectedDonationProduct();
      if (product) await handleDonationBuy(product);
      return;
    }
    await refreshDonationStatus();
  });

  const copyAmountBtn = document.getElementById('copyDonationAmountBtn');
  if (copyAmountBtn) copyAmountBtn.addEventListener('click', () => copyTextValue(donationPaymentState.payment?.amount, 'Amount copied'));

  const copyWalletBtn = document.getElementById('copyDonationWalletBtn');
  if (copyWalletBtn) copyWalletBtn.addEventListener('click', () => copyTextValue(donationPaymentState.payment?.merchantWallet || donationCatalog?.token?.merchantWallet, 'Wallet copied'));

  const copyTxBtn = document.getElementById('copyDonationTxHashBtn');
  if (copyTxBtn) copyTxBtn.addEventListener('click', () => copyTextValue(document.getElementById('donationTxHashInput')?.value, 'txHash copied'));
}

function resetStoreState() {
  cleanupDonationAsync();
  playerUpgrades = null;
  playerEffects = null;
  playerBalance = { gold: 0, silver: 0 };
  donationCatalog = null;
  donationUiState = { isLoading: false, error: '', products: [] };
  donationPaymentState = {
    isOpen: false,
    isCreating: false,
    isSubmitting: false,
    isPolling: false,
    isInvokingWallet: false,
    error: '',
    walletError: '',
    selectedProductKey: '',
    payment: null,
    status: null,
    reward: null,
    txHash: ''
  };
  playerRides = {
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
