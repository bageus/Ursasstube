import { logger } from '../logger.js';
import {
  createDonationPayment,
  createDonationStarsPayment,
  confirmDonationStarsPayment,
  submitDonationTransaction
} from '../donation-service.js';
import {
  getDonationStarsPrice,
  getDonationProductDisplayMeta,
  buildTelegramDonationStarsPayload,
  getTelegramInvoiceUrl,
  getTelegramStarsOrderId,
  isDonationSuccessStatus,
  buildTelegramStarsConfirmPayload,
  openTelegramInvoice,
  setDonationPendingEntry,
  clearDonationPendingEntry,
  hasDonationExpired,
  extractDonationTxRequest,
  invokeDonationWallet
} from './donation-helpers.js';
import { trackAnalyticsEvent } from '../analytics.js';

const DONATION_FINAL_STATUSES = new Set(['credited', 'paid', 'failed', 'expired']);
const DONATION_PENDING_STATUS = 'pending';

function normalizeDonationResultMeta(payload = null) {
  if (!payload || typeof payload !== 'object') return { ok: undefined, status: '' };
  const ok = typeof payload.ok === 'boolean'
    ? payload.ok
    : (typeof payload.success === 'boolean' ? payload.success : undefined);
  const status = String(payload.status ?? payload.paymentStatus ?? '').toLowerCase();
  return { ok, status };
}

function isConfirmedSuccessResult(payload = null) {
  const { ok, status } = normalizeDonationResultMeta(payload);
  return ok === true && (status === 'paid' || status === 'credited');
}

export function createDonationFlowActions({
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
  donationPaymentState,
  getPendingStatusLabel = () => DONATION_PENDING_STATUS
}) {
  const pendingStatus = getPendingStatusLabel();

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
      trackAnalyticsEvent('donation_failed', {
        amount_usd: Number(paymentData?.amount || donationPaymentState?.payment?.amount || 0),
        currency: 'STARS',
        source: 'game_modal',
        payment_method: 'telegram_stars',
        reason: normalizedInvoiceStatus || 'invoice_not_paid'
      });
      renderDonationPaymentModal();
      return;
    }

    if (paymentId) {
      setDonationPendingEntry(paymentId, {
        wallet: buildDonationRequestPayload()?.wallet || getDonationIdentifier() || '',
        paymentMethod: paymentData?.paymentMethod || paymentData?.paymentMode || 'telegram-stars',
        status: pendingStatus,
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
        status: pendingStatus,
        submittedAt
      });
    }

    donationPaymentState.status = {
      ...(donationPaymentState.status || {}),
      ...paymentData,
      paymentId,
      orderId: paymentData?.orderId || paymentId,
      status: pendingStatus,
      reward: null
    };

    donationPaymentState.walletError = '';
    donationPaymentState.error = errorMessage || 'Payment received. Checking payment status with the server…';
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
        status: pendingStatus,
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

      // Analytics donation_success must only be emitted after paid/credited status.
      if (isConfirmedSuccessResult(refreshed) || isDonationSuccessStatus(finalStatus)) {
        trackAnalyticsEvent('donation_success', {
          amount_usd: Number(refreshed?.amount || paymentData?.amount || donationPaymentState?.payment?.amount || 0),
          currency: 'STARS',
          source: 'game_modal',
          payment_method: 'telegram_stars'
        });
        donationPaymentState.invoiceUrl = '';
        donationPaymentState.error = '';
        showToast('Telegram Stars payment paid', 'success');
        await loadPlayerUpgrades();
        updateStoreUI();
        await loadDonationHistory({ silent: true });
      } else if (finalStatus === 'failed' || finalStatus === 'expired') {
        trackAnalyticsEvent('donation_failed', {
          amount_usd: Number(refreshed?.amount || paymentData?.amount || donationPaymentState?.payment?.amount || 0),
          currency: 'STARS',
          source: 'game_modal',
          payment_method: 'telegram_stars',
          reason: finalStatus
        });
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
    const displayPrice = getDonationDisplayPrice(product, { preferTelegramStars: true });
    const productDisplayMeta = getDonationProductDisplayMeta(product, { preferTelegramStars: true });
    donationPaymentState.payment = {
      ...data,
      paymentId,
      orderId: getTelegramStarsOrderId(data) || paymentId,
      productKey: data.productKey || product.key,
      paymentMethod: data.paymentMethod || data.paymentMode || productDisplayMeta.paymentMethod,
      title: data.title || productDisplayMeta.title,
      amount: data.amount ?? getDonationStarsPrice(data) ?? displayPrice.amount,
      currency: data.currency || displayPrice.currency
    };
    donationPaymentState.invoiceUrl = getTelegramInvoiceUrl(data);
    donationPaymentState.status = {
      status: pendingStatus,
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
          status: normalizedServerStatus || pendingStatus,
          submittedAt,
          txHash,
          createdAt: donationPaymentState.payment?.createdAt || submittedAt,
          amount: donationPaymentState.payment?.amount,
          currency: donationPaymentState.payment?.currency,
          title: donationPaymentState.payment?.title,
          productKey: donationPaymentState.payment?.productKey
        });
        donationPaymentState.status = { ...data, status: pendingStatus };
      } else {
        clearDonationPendingEntry(paymentId);
        donationPaymentState.status = data;
      }
      donationPaymentState.txHash = data?.txHash || donationPaymentState.txHash;
      if (data.reward) donationPaymentState.reward = data.reward;

      upsertDonationHistoryEntry({ ...(donationPaymentState.payment || {}), ...data, paymentId, status: shouldKeepPending ? pendingStatus : data.status });
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
        status: pendingStatus,
        submittedAt,
        txHash,
        createdAt: donationPaymentState.payment?.createdAt || submittedAt,
        amount: donationPaymentState.payment?.amount,
        currency: donationPaymentState.payment?.currency,
        title: donationPaymentState.payment?.title,
        productKey: donationPaymentState.payment?.productKey
      });
      ensureDonationPendingHistoryEntry(donationPaymentState.payment, {
        status: pendingStatus,
        submittedAt,
        txHash
      });
      donationPaymentState.status = { ...(donationPaymentState.status || {}), status: pendingStatus };
      donationPaymentState.error = 'Failed to submit transaction. Payment stays pending until backend confirmation is available.';
    } finally {
      donationPaymentState.isSubmitting = false;
      renderDonationPaymentModal();
    }
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
      trackAnalyticsEvent('donation_started', {
        amount_usd: Number(product?.priceUsd || product?.amountUsd || product?.amount || 0),
        currency: String(product?.currency || (useTelegramStars ? 'STARS' : 'USDT')),
        source: 'game_modal',
        payment_method: useTelegramStars ? 'telegram_stars' : 'wallet'
      });
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
          status: pendingStatus,
          submittedAt,
          txHash: donationPaymentState.txHash,
          createdAt: data.createdAt || submittedAt,
          amount: data.amount,
          currency: data.currency,
          title: data.title,
          productKey: data.productKey
        });
        ensureDonationPendingHistoryEntry(data, {
          status: pendingStatus,
          submittedAt,
          txHash: donationPaymentState.txHash
        });

        await handleDonationSubmit({ txHash: donationPaymentState.txHash, submittedAt });
        const finalStatus = String(donationPaymentState?.status?.status || '').toLowerCase();
        // Analytics donation_success must only be emitted after paid/credited status.
        if (isConfirmedSuccessResult(donationPaymentState?.status) || isDonationSuccessStatus(finalStatus)) {
          trackAnalyticsEvent('donation_success', {
            amount_usd: Number(donationPaymentState?.payment?.amount || product?.priceUsd || 0),
            currency: 'USDT',
            source: 'game_modal',
            payment_method: 'wallet'
          });
        }
      } catch (walletError) {
        const message = String(walletError?.message || walletError || 'Wallet transaction failed');
        const rejected = /user rejected|user denied|rejected the request|cancelled/i.test(message);
        donationPaymentState.walletError = rejected
          ? 'Transaction was rejected in your wallet. Retry when you are ready.'
          : `Wallet transaction failed: ${message}`;
        trackAnalyticsEvent('donation_failed', {
          amount_usd: Number(donationPaymentState?.payment?.amount || product?.priceUsd || 0),
          currency: String(donationPaymentState?.payment?.currency || product?.currency || 'USDT'),
          source: 'game_modal',
          payment_method: 'wallet',
          reason: rejected ? 'payment_cancelled' : 'wallet_tx_failed'
        });
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
      trackAnalyticsEvent('donation_failed', {
        amount_usd: Number(product?.priceUsd || product?.amountUsd || product?.amount || 0),
        currency: String(product?.currency || (useTelegramStars ? 'STARS' : 'USDT')),
        source: 'game_modal',
        payment_method: useTelegramStars ? 'telegram_stars' : 'wallet',
        reason: 'payment_create_failed'
      });
    } finally {
      donationPaymentState.isCreating = false;
      renderDonationProducts();
      renderDonationPaymentModal();
    }
  }

  return {
    handleDonationBuy
  };
}
