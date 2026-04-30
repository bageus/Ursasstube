import { logger } from '../logger.js';
import { isAuthenticated, getAuthIdentifier } from '../api.js';
import { isTelegramAuthMode, getPrimaryAuthIdentifier } from '../auth.js';
import { getDonationProducts, getDonationHistory, getDonationPayment } from '../donation-service.js';
import { createDonationUiController, createEmptyDonationUiState, createEmptyDonationPaymentState } from './donation-ui.js';
import {
  isTelegramStarsPayment,
  getDonationDisplayPrice as buildDonationDisplayPrice,
  getDonationHistoryDisplayPrice as buildDonationHistoryDisplayPrice,
  normalizeDonationHistoryEntries,
  getDonationHistoryMethodLabel,
  formatCountdown,
  getDonationPendingEntry,
  setDonationPendingEntry,
  clearDonationPendingEntry,
  getDonationPendingTimestamp,
  mergeDonationHistoryWithPending
} from './donation-helpers.js';
import { createDonationFlowActions } from './donation-flow.js';
import { trackAnalyticsEvent } from '../analytics.js';
import { capturePostHogEvent } from '../integrations/posthog/index.js';

const DONATION_FINAL_STATUSES = new Set(['credited', 'paid', 'failed', 'expired']);
const DONATION_PENDING_STATUS = 'pending';
const DONATION_REFRESH_COOLDOWN_MS = 60 * 1000;
const DONATION_PENDING_TIMEOUT_MS = 30 * 60 * 1000;

function trackDonationAnalyticsEvent(name, payload = {}) {
  trackAnalyticsEvent(name, payload);
  capturePostHogEvent(name, payload);
}

export function createDonationController({
  loadPlayerUpgrades,
  updateStoreUI
}) {
  let donationCatalog = null;
  let donationUiState = createEmptyDonationUiState();
  let donationPaymentState = createEmptyDonationPaymentState();
  let donationCountdownTimer = null;
  let donationAbortController = null;
  let toastTimerCounter = 0;
  let donationRefreshCooldownTimers = {};
  const donationSuccessTrackedIds = new Set();

  async function handleDonationBuy(...args) {
    return donationFlowActions.handleDonationBuy(...args);
  }

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

  let donationFlowActions = {
    async handleDonationBuy() {}
  };

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
      product?.key
      && donationPaymentState.invoiceUrl
      && donationPaymentState.selectedProductKey === product.key
      && isTelegramStarsPayment(donationPaymentState.payment)
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
    donationUiState.history = normalizeDonationHistoryEntries(
      mergeDonationHistoryWithPending(merged, {
        getClientSideDonationStatus,
        finalStatuses: DONATION_FINAL_STATUSES
      }),
      { tokenSymbol: donationCatalog?.token?.symbol || 'USDT' }
    );
    renderDonationHistory();
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

      donationUiState.history = normalizeDonationHistoryEntries(
        mergeDonationHistoryWithPending(entries, {
          getClientSideDonationStatus,
          finalStatuses: DONATION_FINAL_STATUSES
        }),
        { tokenSymbol: donationCatalog?.token?.symbol || 'USDT' }
      );
    } catch (error) {
      logger.error('❌ Donation history error:', error);
      donationUiState.historyError = 'Failed to load purchase history';
    } finally {
      donationUiState.historyLoading = false;
      renderDonationHistory();
    }
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
        const paymentId = String(data?.paymentId || data?.orderId || '').trim();
        if (paymentId && !donationSuccessTrackedIds.has(paymentId)) {
          donationSuccessTrackedIds.add(paymentId);
          trackDonationAnalyticsEvent('donation_success', {
            amount_usd: Number(data?.amount || donationPaymentState?.payment?.amount || 0),
            currency: String(data?.currency || donationPaymentState?.payment?.currency || (isTelegramStarsPayment(data) ? 'STARS' : 'USDT')).toUpperCase(),
            source: 'history_refresh',
            payment_method: isTelegramStarsPayment(data) ? 'telegram_stars' : 'wallet'
          });
        }

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

  donationFlowActions = createDonationFlowActions({
    getDonationIdentifier,
    getTelegramWebApp,
    getTelegramInitData,
    canUseTelegramStarsFlow,
    hasPreparedTelegramInvoice,
    getDonationDisplayPrice,
    buildDonationRequestPayload,
    startDonationCountdown,
    showToast,
    ensureDonationPendingHistoryEntry,
    refreshDonationHistoryEntry,
    loadDonationHistory,
    loadPlayerUpgrades,
    updateStoreUI,
    renderDonationProducts,
    renderDonationHistory,
    renderDonationPaymentModal,
    upsertDonationHistoryEntry,
    donationPaymentState
  });

  function resetDonationState() {
    cleanupDonationAsync();
    donationCatalog = null;
    Object.values(donationRefreshCooldownTimers).forEach((timerId) => clearTimeout(timerId));
    donationRefreshCooldownTimers = {};
    donationUiState = createEmptyDonationUiState();
    donationPaymentState = createEmptyDonationPaymentState();
  }

  return {
    closeDonationModal,
    loadDonationProducts,
    loadDonationHistory,
    renderDonationProducts,
    renderDonationHistory,
    renderDonationPaymentModal,
    cleanupDonationAsync,
    resetDonationState,
    getUiState: () => donationUiState
  };
}

function formatCooldownMs(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
}
