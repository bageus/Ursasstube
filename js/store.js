import { logger } from './logger.js';
import { isAuthenticated, getAuthIdentifier } from './api.js';
import { isTelegramAuthMode, getPrimaryAuthIdentifier, getTelegramAuthIdentifier } from './auth.js';
import { getDonationProducts, createDonationPayment, createDonationStarsPayment, confirmDonationStarsPayment, submitDonationTransaction, getDonationHistory, getDonationPayment } from './donation-service.js';
import { createRuntimeConfigController } from './store/runtime-config.js';
import { createRidesService, resetPlayerRides, setPlayerRides } from './store/rides-service.js';
import { createUpgradesService, resetUpgradeState, setPlayerStoreState } from './store/upgrades-service.js';
import { createDonationUiController, createEmptyDonationUiState, createEmptyDonationPaymentState } from './store/donation-ui.js';
import {
  getDonationStarsPrice,
  isTelegramStarsPayment,
  getDonationDisplayPrice as buildDonationDisplayPrice,
  getDonationHistoryDisplayPrice as buildDonationHistoryDisplayPrice,
  normalizeDonationHistoryEntries,
  getDonationHistoryMethodLabel,
  getDonationProductDisplayMeta,
  buildTelegramDonationStarsPayload,
  getTelegramInvoiceUrl,
  getTelegramStarsOrderId,
  isDonationSuccessStatus,
  buildTelegramStarsConfirmPayload,
  openTelegramInvoice,
  formatCountdown,
  getDonationPendingEntry,
  setDonationPendingEntry,
  clearDonationPendingEntry,
  getDonationPendingTimestamp,
  mergeDonationHistoryWithPending,
  hasDonationExpired,
  extractDonationTxRequest,
  invokeDonationWallet
} from './store/donation-helpers.js';
import { createStoreBootstrap } from './store/bootstrap.js';
import { createStoreUiController } from './store/store-ui.js';

const runtimeConfigController = createRuntimeConfigController({
  setPlayerState({
    playerUpgrades: nextPlayerUpgrades,
    playerEffects: nextPlayerEffects,
    playerBalance: nextPlayerBalance,
    playerRides: nextPlayerRides
  }) {
    setPlayerStoreState({
      nextPlayerUpgrades,
      nextPlayerEffects,
      nextPlayerBalance
    });
    setPlayerRides(nextPlayerRides);
  }
});

const {
  getRuntimeGameConfig,
  isUnauthRuntimeMode,
  isStoreAvailable,
  canPersistProgress,
  isEligibleForLeaderboardFlow,
  hasRideLimit,
  applyRuntimeConfig,
  loadUnauthGameConfig,
  clearRuntimeConfig
} = runtimeConfigController;

const { loadPlayerRides, useRide, updateRidesDisplay } = createRidesService({
  isUnauthRuntimeMode,
  hasRideLimit
});

/* ===== STORE SYSTEM ===== */

let isStoreDataLoading = false;
const pendingStorePurchases = new Set();

const DONATION_FINAL_STATUSES = new Set(['credited', 'paid', 'failed', 'expired']);
const DONATION_PENDING_STATUS = 'pending';
const DONATION_REFRESH_COOLDOWN_MS = 60 * 1000;
const DONATION_PENDING_TIMEOUT_MS = 30 * 60 * 1000;

let donationCatalog = null;
let donationUiState = createEmptyDonationUiState();
let donationPaymentState = createEmptyDonationPaymentState();
let donationCountdownTimer = null;
let donationAbortController = null;
let toastTimerCounter = 0;
let donationRefreshCooldownTimers = {};

const donationUiController = createDonationUiController({
  getUiState: () => donationUiState,
  getPaymentState: () => donationPaymentState,
  getDonationDisplayPrice,
  getDonationHistoryDisplayPrice,
  getDonationHistoryMethodLabel,
  getClientSideDonationStatus,
  getDonationRefreshCooldownRemaining,
  handleDonationBuy,
  hasPreparedTelegramInvoice,
  refreshDonationHistoryEntry,
  syncDonationCountdown
});

const {
  renderDonationProducts,
  renderDonationHistory,
  renderDonationPaymentModal
} = donationUiController;

const upgradesService = createUpgradesService({
  pendingStorePurchases,
  setStoreDataLoading(nextValue) {
    isStoreDataLoading = nextValue;
  },
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
});

const applyStoreDefaultLockState = () => upgradesService.applyStoreDefaultLockState({ buyUpgrade });
const loadPlayerUpgrades = () => upgradesService.loadPlayerUpgrades();
const updateStoreUI = () => upgradesService.updateStoreUI({ buyUpgrade });

function getDonationIdentifier() {
  return String(getAuthIdentifier() || '').trim();
}

function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

function getTelegramInitData() {
  const webApp = getTelegramWebApp();
  return String(webApp?.initData || '').trim();
}

function isTelegramMiniAppDonationEnv() {
  const webApp = getTelegramWebApp();
  return Boolean(webApp?.initDataUnsafe?.user);
}

function canUseTelegramStarsFlow() {
  const webApp = getTelegramWebApp();
  return Boolean((isTelegramAuthMode() || isTelegramMiniAppDonationEnv()) && typeof webApp?.openInvoice === 'function');
}

function getDonationDisplayPrice(product = null, { preferTelegramStars = canUseTelegramStarsFlow() } = {}) {
  return buildDonationDisplayPrice(product, {
    preferTelegramStars,
    tokenSymbol: donationCatalog?.token?.symbol || 'USDT'
  });
}

function getDonationHistoryDisplayPrice(entry = null) {
  return buildDonationHistoryDisplayPrice(entry, {
    tokenSymbol: donationCatalog?.token?.symbol || 'USDT'
  });
}

function hasPreparedTelegramInvoice(product = null) {
  return Boolean(
    product?.key &&
    donationPaymentState.invoiceUrl &&
    donationPaymentState.selectedProductKey === product.key &&
    isTelegramStarsPayment(donationPaymentState.payment)
  );
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
    logger.error('❌ Copy failed:', error);
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

function getDonationRefreshCooldownRemaining(paymentId) {
  const nextAllowedAt = donationUiState.refreshCooldowns[paymentId] || 0;
  return Math.max(0, nextAllowedAt - Date.now());
}

function getClientSideDonationStatus(entry = null) {
  const normalizedStatus = String(entry?.status || '').toLowerCase();
  if (DONATION_FINAL_STATUSES.has(normalizedStatus)) return normalizedStatus;

  const pendingEntry = entry?.paymentId ? getDonationPendingEntry(entry.paymentId) : null;
  const pendingTimestamp = getDonationPendingTimestamp(entry, pendingEntry);
  if (
    !isTelegramStarsPayment({ ...pendingEntry, ...entry })
    && pendingTimestamp > 0
    && (Date.now() - pendingTimestamp) >= DONATION_PENDING_TIMEOUT_MS
  ) {
    return 'failed';
  }

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
  donationPaymentState.invoiceUrl = '';
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

    donationUiState.history = normalizeDonationHistoryEntries(mergeDonationHistoryWithPending(entries, { getClientSideDonationStatus, finalStatuses: DONATION_FINAL_STATUSES }), { tokenSymbol: donationCatalog?.token?.symbol || 'USDT' });
  } catch (error) {
    logger.error('❌ Donation history error:', error);
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
  donationUiState.history = normalizeDonationHistoryEntries(mergeDonationHistoryWithPending(merged, { getClientSideDonationStatus, finalStatuses: DONATION_FINAL_STATUSES }), { tokenSymbol: donationCatalog?.token?.symbol || 'USDT' });
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

    if (isDonationSuccessStatus(getClientSideDonationStatus(data))) {
      showToast('Donation reward credited', 'success');
      await loadPlayerUpgrades();
      updateStoreUI();
      await loadDonationHistory({ silent: true });
    }

    return data;
  } catch (error) {
    logger.error('❌ Donation payment refresh error:', error);
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
  const useTelegramStars = canUseTelegramStarsFlow();

  donationUiState.isLoading = !silent;
  donationUiState.error = '';
  renderDonationProducts();

  try {
    let { response, data } = await getDonationProducts(wallet, {
      paymentMode: useTelegramStars ? 'telegram-stars' : '',
      headers: { 'X-Wallet': wallet }
    });

    if (useTelegramStars && (!response.ok || !data)) {
      ({ response, data } = await getDonationProducts(wallet, {
        headers: { 'X-Wallet': wallet }
      }));
    }

    if (!response.ok || !data) {
      donationUiState.error = data?.error || 'Failed to load donation offers';
      return;
    }

    donationCatalog = data;
    donationUiState.products = Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    logger.error('❌ Donation catalog error:', error);
    donationUiState.error = 'Failed to load donation offers';
  } finally {
    donationUiState.isLoading = false;
    renderDonationProducts();
    renderDonationPaymentModal();
  }
}

function buildDonationRequestPayload(basePayload = {}) {
  const primaryId = getPrimaryAuthIdentifier();
  const identifier = getDonationIdentifier();
  if (!identifier) return null;

  return {
    wallet: isTelegramAuthMode()
      ? String(primaryId || identifier).trim()
      : String(identifier).trim().toLowerCase(),
    ...basePayload
  };
}


async function finalizeTelegramDonationAfterInvoice(paymentData, { invoiceStatus = '', errorMessage = '' } = {}) {
  const paymentId = paymentData?.paymentId || paymentData?.orderId || '';
  const submittedAt = new Date().toISOString();
  const normalizedInvoiceStatus = String(invoiceStatus || '').toLowerCase();

  if (normalizedInvoiceStatus !== 'paid') {
    if (normalizedInvoiceStatus === 'cancelled' || normalizedInvoiceStatus === 'failed' || normalizedInvoiceStatus === 'expired') {
      donationPaymentState.invoiceUrl = '';
    }
    donationPaymentState.walletError = '';
    donationPaymentState.status = {
      ...(donationPaymentState.status || {}),
      ...paymentData,
      paymentId,
      orderId: paymentData?.orderId || paymentId,
      status: null,
      reward: null
    };
    donationPaymentState.error = errorMessage || 'Telegram Stars payment was not completed.';
    renderDonationPaymentModal();
    return;
  }
  
  if (paymentId) {
    setDonationPendingEntry(paymentId, {
      wallet: buildDonationRequestPayload()?.wallet || getDonationIdentifier() || '',
      paymentMethod: paymentData?.paymentMethod || paymentData?.paymentMode || 'telegram-stars',
      status: DONATION_PENDING_STATUS,
      submittedAt,
      createdAt: paymentData?.createdAt || submittedAt,
      amount: paymentData?.amount,
      currency: paymentData?.currency,
      title: paymentData?.title,
      productKey: paymentData?.productKey || donationPaymentState.selectedProductKey || ''
    });

    ensureDonationPendingHistoryEntry({
      ...paymentData,
      paymentId,
      orderId: paymentData?.orderId || paymentId,
      paymentMethod: paymentData?.paymentMethod || paymentData?.paymentMode || 'telegram-stars'
    }, {
      status: DONATION_PENDING_STATUS,
      submittedAt
    });
  }

  donationPaymentState.status = {
    ...(donationPaymentState.status || {}),
    ...paymentData,
    paymentId,
    orderId: paymentData?.orderId || paymentId,
    status: DONATION_PENDING_STATUS,
    reward: null
  };

  const checkingMessage = 'Payment received. Checking payment status with the server…';

  donationPaymentState.walletError = '';
  donationPaymentState.error = errorMessage || checkingMessage;
  renderDonationPaymentModal();
  renderDonationHistory();

  const confirmPayload = buildTelegramStarsConfirmPayload({
    ...(donationPaymentState.payment || {}),
    ...paymentData
  }, getTelegramInitData());

  if (paymentId) {
    upsertDonationHistoryEntry({
      ...(donationPaymentState.payment || {}),
      ...paymentData,
      paymentId,
      orderId: paymentData?.orderId || paymentId,
      paymentMethod: paymentData?.paymentMethod || paymentData?.paymentMode || 'telegram-stars',
      status: DONATION_PENDING_STATUS,
      reward: null
    });

    if (confirmPayload) {
      try {
        const { response, data } = await confirmDonationStarsPayment(confirmPayload);
        if (response.ok && data) {
          upsertDonationHistoryEntry({
            ...(donationPaymentState.payment || {}),
            ...data,
            paymentId,
            orderId: getTelegramStarsOrderId(data) || paymentData?.orderId || paymentId,
            paymentMethod: data.paymentMethod || data.paymentMode || paymentData?.paymentMethod || paymentData?.paymentMode || 'telegram-stars'
          });

          if (donationPaymentState.payment?.paymentId === paymentId) {
            donationPaymentState.status = {
              ...(donationPaymentState.status || {}),
              ...data,
              paymentId,
              orderId: getTelegramStarsOrderId(data) || paymentData?.orderId || paymentId
            };
            if (data.reward) donationPaymentState.reward = data.reward;
          }
        }
      } catch (error) {
        logger.warn('⚠️ Telegram Stars confirm request failed, falling back to history refresh:', error);
      }
    }

    const refreshed = await refreshDonationHistoryEntry(paymentId, { silent: true });
    const finalStatus = String(refreshed?.status || '').toLowerCase();

    if (isDonationSuccessStatus(finalStatus)) {
      donationPaymentState.invoiceUrl = '';
      donationPaymentState.error = '';
      showToast('Telegram Stars payment paid', 'success');
      await loadPlayerUpgrades();
      updateStoreUI();
      await loadDonationHistory({ silent: true });
    } else if (finalStatus === 'failed' || finalStatus === 'expired') {
      donationPaymentState.invoiceUrl = '';
      donationPaymentState.error = errorMessage || refreshed?.failureReason || 'Telegram Stars payment failed.';
      showToast('Telegram Stars payment failed', 'error');
    } else {
      donationPaymentState.error = errorMessage || 'Checking payment status. Refresh history in a moment if needed.';
      showToast('Checking Telegram Stars payment status', 'info');
      await loadDonationHistory({ silent: true });
    }
  } else {
    donationPaymentState.error = errorMessage || 'Checking payment status. Open purchase history to verify the result.';
    await loadDonationHistory({ silent: true });
  }

  renderDonationPaymentModal();
}

async function handleTelegramDonationBuy(product) {
  if (hasPreparedTelegramInvoice(product)) {
    showToast('Opening Telegram Stars invoice…', 'info');

    let reopenedInvoiceStatus = '';
    try {
      reopenedInvoiceStatus = await openTelegramInvoice(getTelegramWebApp(), donationPaymentState.invoiceUrl);
    } catch (error) {
      const message = String(error?.message || error || 'Unknown Telegram invoice error');
      donationPaymentState.error = `Failed to open Telegram Stars invoice: ${message}`;
      showToast(donationPaymentState.error, 'error');
      return;
    }

    await finalizeTelegramDonationAfterInvoice(donationPaymentState.payment, {
      invoiceStatus: String(reopenedInvoiceStatus || '').toLowerCase(),
      errorMessage: String(reopenedInvoiceStatus || '').toLowerCase() === 'failed'
        ? 'Telegram Stars payment failed. Please try again.'
        : String(reopenedInvoiceStatus || '').toLowerCase() === 'cancelled'
          ? 'Telegram invoice closed before confirmation.'
          : ''
    });
    return;
  }

  const requestPayload = buildTelegramDonationStarsPayload(product, getTelegramInitData());
  if (!requestPayload) {
    donationPaymentState.error = 'Telegram Stars payment is unavailable because Telegram user data is missing.';
    showToast(donationPaymentState.error, 'error');
    return;
  }

  const { response, data } = await createDonationStarsPayment(requestPayload);
  if (!response.ok || !data) {
    donationPaymentState.error = data?.error || 'Failed to create Telegram Stars invoice.';
    showToast(donationPaymentState.error, 'error');
    return;
  }

  const paymentId = getTelegramStarsOrderId(data);
  const productDisplayMeta = getDonationProductDisplayMeta(product, { preferTelegramStars: true });
  donationPaymentState.payment = {
    ...data,
    paymentId,
    orderId: getTelegramStarsOrderId(data) || paymentId,
    productKey: data.productKey || product.key,
    paymentMethod: data.paymentMethod || data.paymentMode || productDisplayMeta.paymentMethod,
    title: data.title || productDisplayMeta.title,
    amount: data.amount ?? getDonationStarsPrice(data) ?? productDisplayMeta.amount,
    currency: data.currency || productDisplayMeta.currency
  };
  donationPaymentState.invoiceUrl = getTelegramInvoiceUrl(data);
  donationPaymentState.status = {
    status: DONATION_PENDING_STATUS,
    reward: null,
    orderId: getTelegramStarsOrderId(data) || paymentId,
    paymentId,
    failureReason: ''
  };
  donationPaymentState.reward = null;
  donationPaymentState.txHash = '';
  donationPaymentState.walletError = '';
  renderDonationPaymentModal();

  if (!donationPaymentState.invoiceUrl) {
    donationPaymentState.error = 'Telegram Stars invoice URL was not returned by the server.';
    showToast(donationPaymentState.error, 'error');
    return;
  }
  
  donationPaymentState.error = '';
  showToast('Opening Telegram Stars invoice…', 'info');
  let invoiceStatus = '';
  try {
    invoiceStatus = await openTelegramInvoice(getTelegramWebApp(), donationPaymentState.invoiceUrl);
  } catch (error) {
    const message = String(error?.message || error || 'Unknown Telegram invoice error');
    donationPaymentState.error = `Failed to open Telegram Stars invoice: ${message}`;
    showToast(donationPaymentState.error, 'error');
    renderDonationProducts();
    renderDonationPaymentModal();
    return;
  }

  await finalizeTelegramDonationAfterInvoice(donationPaymentState.payment, {
    invoiceStatus: String(invoiceStatus || '').toLowerCase(),
    errorMessage: String(invoiceStatus || '').toLowerCase() === 'failed'
      ? 'Telegram Stars payment failed. Please try again.'
      : String(invoiceStatus || '').toLowerCase() === 'cancelled'
        ? 'Telegram invoice closed before confirmation.'
        : ''
  });
  renderDonationProducts();
  renderDonationPaymentModal();
}

async function handleDonationBuy(product) {
  if (!product || donationPaymentState.isCreating) return;

  const identifier = getDonationIdentifier();
  const useTelegramStars = canUseTelegramStarsFlow();

  if (!identifier) {
    showToast(useTelegramStars ? 'Telegram session not found' : 'Connect wallet first', 'error');
    return;
  }

  donationPaymentState.isCreating = true;
  donationPaymentState.error = '';
  donationPaymentState.selectedProductKey = product.key;
  donationPaymentState.payment = null;
  donationPaymentState.status = null;
  donationPaymentState.reward = null;
  renderDonationProducts();
  renderDonationPaymentModal();

  try {
    if (useTelegramStars) {
      await handleTelegramDonationBuy(product);
      return;
    }

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

    donationPaymentState.payment = {
      ...data,
      paymentMethod: data?.paymentMethod || data?.paymentMode || 'wallet'
    };
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
    logger.error('❌ Donation payment error:', error);
    donationPaymentState.error = useTelegramStars
      ? 'Failed to start Telegram Stars payment'
      : 'Failed to create payment';
  } finally {
    donationPaymentState.isCreating = false;
    renderDonationProducts();
    renderDonationPaymentModal();
  }
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
    logger.error('❌ Donation submit error:', error);
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

const storeUiController = createStoreUiController({
  isAuthenticated,
  loadDonationProducts: () => {
    if (donationUiState.products.length === 0 && !donationUiState.isLoading) {
      loadDonationProducts();
    }
  },
  loadDonationHistory: () => {
    if (donationUiState.history.length === 0 && !donationUiState.historyLoading) {
      loadDonationHistory();
    }
  },
  closeDonationModal,
  renderDonationProducts,
  renderDonationHistory,
  updateRidesDisplay,
  applyStoreDefaultLockState
});

const {
  setActiveStoreTab,
  bindDonationUi,
  resetStoreUiState,
  showRules,
  hideRules,
  updateRulesAudioButtons
} = storeUiController;

function resetStoreState() {
  cleanupDonationAsync();
  resetUpgradeState();
  donationCatalog = null;
  Object.values(donationRefreshCooldownTimers).forEach((timerId) => clearTimeout(timerId));
  donationRefreshCooldownTimers = {};
  donationUiState = createEmptyDonationUiState();
  donationPaymentState = createEmptyDonationPaymentState();
  clearRuntimeConfig();
  resetPlayerRides();
  isStoreDataLoading = false;

  const goldEl = document.getElementById("storeGoldVal");
  const silverEl = document.getElementById("storeSilverVal");
  if (goldEl) goldEl.textContent = "0";
  if (silverEl) silverEl.textContent = "0";

  resetStoreUiState();
}

async function buyUpgrade(key, tier) {
  return upgradesService.buyUpgrade(key, tier, {
    isStoreDataLoading() {
      return isStoreDataLoading;
    }
  });
}



const { initStoreBootstrap } = createStoreBootstrap({
  applyStoreDefaultLockState,
  bindDonationUi,
  setActiveStoreTab,
  renderDonationProducts,
  cleanupDonationAsync
});

export {
  initStoreBootstrap,
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
