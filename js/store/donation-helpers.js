import { logger } from '../logger.js';
import { getInjectedEthereumProvider } from '../ethereum-provider.js';
import { WC } from '../walletconnect.js';
import { notifyError } from '../notifier.js';

const DONATION_PENDING_STORAGE_KEY = 'ursassDonationPendingPayments';
const BASE_CHAIN_ID_HEX = '0x2105';
const WRONG_NETWORK_TOAST_KEY = 'wrong-network-base';

export function getDonationStarsPrice(product = null) {
  return product?.starsPrice
    ?? product?.stars_amount
    ?? product?.starsAmount
    ?? product?.telegram_stars_price
    ?? product?.telegramStarsPrice
    ?? product?.telegram_stars_amount
    ?? product?.telegramStarsAmount
    ?? product?.star_price
    ?? product?.starPrice
    ?? product?.star_amount
    ?? product?.starAmount
    ?? product?.prices?.starsAmount
    ?? product?.prices?.stars
    ?? product?.prices?.telegramStars
    ?? product?.pricing?.starsAmount
    ?? product?.pricing?.stars
    ?? product?.pricing?.telegramStars
    ?? null;
}

function getDonationMoneyPrice(product = null) {
  return product?.price
    ?? product?.amount
    ?? product?.prices?.amount
    ?? product?.pricing?.amount
    ?? null;
}

function getDonationPaymentMethod(entry = null) {
  const candidates = [
    entry?.paymentMethod,
    entry?.paymentMode,
    entry?.method,
    entry?.provider,
    entry?.channel,
    entry?.platform,
    entry?.source,
    entry?.payment?.paymentMethod,
    entry?.payment?.paymentMode,
    entry?.payment?.method
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes('star')) return 'telegram-stars';
    if (normalized.includes('telegram')) return 'telegram';
    if (normalized.includes('wallet')) return 'wallet';
    if (normalized.includes('crypto')) return 'crypto';
    return normalized;
  }

  return '';
}

export function isTelegramStarsPayment(entry = null) {
  const paymentMethod = getDonationPaymentMethod(entry);
  if (paymentMethod === 'telegram-stars') return true;

  const amount = entry?.amount ?? entry?.payment?.amount ?? null;
  const currency = String(entry?.currency ?? entry?.payment?.currency ?? '').trim().toUpperCase();
  const starsPrice = getDonationStarsPrice(entry);

  if (currency === 'STARS' || currency === 'XTR') return true;
  if (starsPrice != null && starsPrice !== '' && amount == null) return true;
  return false;
}

export function getDonationDisplayPrice(product = null, {
  preferTelegramStars = false,
  tokenSymbol = 'USDT'
} = {}) {
  const starsPrice = getDonationStarsPrice(product);

  if (preferTelegramStars && starsPrice != null && starsPrice !== '') {
    return {
      amount: starsPrice,
      currency: product?.starsCurrency || product?.telegramStarsCurrency || 'STARS'
    };
  }

  return {
    amount: getDonationMoneyPrice(product),
    currency: product?.currency || tokenSymbol || 'USDT'
  };
}

export function getDonationHistoryDisplayPrice(entry = null, { tokenSymbol = 'USDT' } = {}) {
  const payment = entry?.payment && typeof entry.payment === 'object' ? entry.payment : null;
  const amount = entry?.amount ?? payment?.amount ?? getDonationMoneyPrice(entry);
  const currency = entry?.currency ?? payment?.currency ?? tokenSymbol ?? 'USDT';

  if (isTelegramStarsPayment(entry)) {
    return {
      amount: amount ?? getDonationStarsPrice(entry),
      currency: String(currency || '').trim() || entry?.starsCurrency || entry?.telegramStarsCurrency || 'STARS'
    };
  }

  return {
    amount,
    currency: String(currency || '').trim() || 'USDT'
  };
}

function normalizeDonationHistoryEntry(entry = null, { tokenSymbol = 'USDT' } = {}) {
  if (!entry || typeof entry !== 'object') return null;

  const payment = entry.payment && typeof entry.payment === 'object' ? entry.payment : null;
  const productSnapshot = entry.productSnapshot && typeof entry.productSnapshot === 'object' ? entry.productSnapshot : null;
  const normalizedPaymentMethod = getDonationPaymentMethod(entry)
    || getDonationPaymentMethod(payment)
    || getDonationPaymentMethod(productSnapshot)
    || '';
  const isStars = isTelegramStarsPayment({
    ...productSnapshot,
    ...payment,
    ...entry,
    paymentMethod: normalizedPaymentMethod
  });

  const starsAmount = entry?.amount
    ?? payment?.amount
    ?? getDonationStarsPrice(entry)
    ?? getDonationStarsPrice(payment)
    ?? getDonationStarsPrice(productSnapshot)
    ?? null;
  const moneyAmount = entry?.amount
    ?? payment?.amount
    ?? getDonationMoneyPrice(entry)
    ?? getDonationMoneyPrice(payment)
    ?? getDonationMoneyPrice(productSnapshot)
    ?? null;

  return {
    ...entry,
    payment: payment || undefined,
    productSnapshot: productSnapshot || undefined,
    paymentMethod: normalizedPaymentMethod || entry?.paymentMethod || payment?.paymentMethod || '',
    title: entry?.title
      || payment?.title
      || productSnapshot?.title
      || entry?.productTitle
      || entry?.productKey
      || payment?.productKey
      || productSnapshot?.key
      || '',
    amount: isStars ? starsAmount : moneyAmount,
    currency: isStars
      ? (
          String(
            entry?.starsCurrency
            ?? entry?.telegramStarsCurrency
            ?? payment?.starsCurrency
            ?? payment?.telegramStarsCurrency
            ?? productSnapshot?.starsCurrency
            ?? productSnapshot?.telegramStarsCurrency
            ?? entry?.currency
            ?? payment?.currency
            ?? 'STARS'
          ).trim() || 'STARS'
        )
      : (
          String(
            entry?.currency
            ?? payment?.currency
            ?? productSnapshot?.currency
            ?? tokenSymbol
            ?? 'USDT'
          ).trim() || 'USDT'
        )
  };
}

export function getDonationHistoryMethodLabel(entry = null) {
  const paymentMethod = getDonationPaymentMethod(entry);
  if (isTelegramStarsPayment(entry)) return 'Telegram Stars';
  if (paymentMethod === 'wallet') return 'Wallet';
  if (paymentMethod === 'crypto') return 'Crypto';
  if (paymentMethod === 'telegram') return 'Telegram';
  return paymentMethod ? paymentMethod.replace(/[-_]+/g, ' ') : 'Wallet';
}

export function getDonationProductDisplayMeta(product = null, {
  preferTelegramStars = false,
  tokenSymbol = 'USDT'
} = {}) {
  const displayPrice = getDonationDisplayPrice(product, { preferTelegramStars, tokenSymbol });
  return {
    title: product?.title || product?.key || 'Donation purchase',
    amount: displayPrice.amount ?? null,
    currency: displayPrice.currency || (preferTelegramStars ? 'STARS' : 'USDT'),
    paymentMethod: preferTelegramStars ? 'telegram-stars' : 'wallet'
  };
}

export function buildTelegramDonationStarsPayload(product, telegramInitData = '') {
  const initData = String(telegramInitData || '').trim();
  if (!product?.key || !initData) return null;

  return {
    productKey: product.key,
    telegramInitData: initData
  };
}

export function getTelegramInvoiceUrl(payment = null) {
  return String(
    payment?.invoiceUrl
    ?? payment?.invoice_url
    ?? payment?.url
    ?? ''
  ).trim();
}

export function getTelegramStarsOrderId(payment = null) {
  return String(
    payment?.orderId
    ?? payment?.order_id
    ?? payment?.paymentId
    ?? payment?.payment_id
    ?? ''
  ).trim();
}

export function isDonationSuccessStatus(status = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  return (
    normalizedStatus === 'credited'
    || normalizedStatus === 'paid'
    || normalizedStatus === 'completed'
    || normalizedStatus === 'complete'
    || normalizedStatus === 'succeeded'
    || normalizedStatus === 'success'
    || normalizedStatus === 'confirmed'
  );
}

export function buildTelegramStarsConfirmPayload(payment = null, telegramInitData = '') {
  const resolvedInitData = String(
    payment?.telegramInitData
    ?? telegramInitData
    ?? ''
  ).trim();
  const orderId = getTelegramStarsOrderId(payment);
  const totalAmount = payment?.amount ?? getDonationStarsPrice(payment) ?? null;

  if (!orderId || !resolvedInitData || totalAmount == null || totalAmount === '') return null;

  return {
    orderId,
    totalAmount,
    currency: 'XTR',
    telegramInitData: resolvedInitData
  };
}

export function openTelegramInvoice(webApp, invoiceUrl) {
  if (!webApp || typeof webApp.openInvoice !== 'function') {
    return Promise.reject(new Error('Telegram Stars is unavailable in this client. Please update Telegram or use the wallet flow.'));
  }

  return new Promise((resolve, reject) => {
    try {
      webApp.openInvoice(invoiceUrl, (status) => resolve(String(status || '').toLowerCase()));
    } catch (error) {
      reject(error);
    }
  });
}

export function formatCountdown(expiresAt) {
  if (!expiresAt) return '—';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return '—';
  if (diffMs <= 0) return 'Expired';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function normalizeDonationHistoryEntries(entries = [], { tokenSymbol = 'USDT' } = {}) {
  return [...entries]
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => normalizeDonationHistoryEntry(entry, { tokenSymbol }))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function readDonationPendingStore() {
  try {
    const raw = window.localStorage?.getItem(DONATION_PENDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logger.warn('⚠️ Failed to read donation pending store:', error);
    return {};
  }
}

function writeDonationPendingStore(store) {
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(DONATION_PENDING_STORAGE_KEY, JSON.stringify(store || {}));
  } catch (error) {
    logger.warn('⚠️ Failed to write donation pending store:', error);
  }
}

export function getDonationPendingEntry(paymentId) {
  if (!paymentId) return null;
  const store = readDonationPendingStore();
  const entry = store[paymentId];
  return entry && typeof entry === 'object' ? entry : null;
}

export function setDonationPendingEntry(paymentId, entry) {
  if (!paymentId) return;
  const store = readDonationPendingStore();
  store[paymentId] = {
    paymentId,
    ...(store[paymentId] || {}),
    ...(entry || {})
  };
  writeDonationPendingStore(store);
}

export function clearDonationPendingEntry(paymentId) {
  if (!paymentId) return;
  const store = readDonationPendingStore();
  if (!(paymentId in store)) return;
  delete store[paymentId];
  writeDonationPendingStore(store);
}

export function getDonationPendingTimestamp(entry = null, pendingEntry = null) {
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

export function mergeDonationHistoryWithPending(entries = [], {
  getClientSideDonationStatus,
  finalStatuses
} = {}) {
  const pendingStore = readDonationPendingStore();
  const mergedEntries = Array.isArray(entries) ? [...entries] : [];
  const finalPaymentIds = new Set(
    mergedEntries
      .filter((entry) => finalStatuses?.has(String(entry?.status || '').toLowerCase()) && entry?.paymentId)
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
      createdAt: pendingEntry?.createdAt || null,
      txHash: pendingEntry?.txHash || null,
      amount: pendingEntry?.amount,
      currency: pendingEntry?.currency,
      title: pendingEntry?.title,
      productKey: pendingEntry?.productKey,
      paymentMethod: pendingEntry?.paymentMethod,
      failureReason: status === 'failed'
        ? 'Merchant did not confirm the transaction within 30 minutes'
        : '',
      isLocalPendingStatus: status === 'pending'
    };

    if (historyIndex >= 0) {
      mergedEntries[historyIndex] = { ...mergedEntries[historyIndex], ...overlay };
    } else {
      mergedEntries.unshift(overlay);
    }
  });

  return mergedEntries;
}

export function hasDonationExpired(payment = null, status = null) {
  const expiresAt = payment?.expiresAt || status?.expiresAt;
  if (!expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs <= Date.now();
}

function getDonationWalletProvider() {
  const injectedProvider = getInjectedEthereumProvider();
  if (injectedProvider?.request) return injectedProvider;
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

export function extractDonationTxRequest(paymentData = null) {
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
  const requestedChainId = txRequest?.chainId || BASE_CHAIN_ID_HEX;
  if (!provider?.request || !requestedChainId) return;

  let currentChainId = null;
  try {
    currentChainId = await provider.request({ method: 'eth_chainId' });
  } catch (error) {
    logger.warn('⚠️ Failed to read active wallet chain:', error);
    return;
  }

  if (String(currentChainId).toLowerCase() === String(requestedChainId).toLowerCase()) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: requestedChainId }]
    });
  } catch (error) {
    notifyError('❌ Wrong network: switch wallet to Base to continue.', {
      sticky: true,
      toastKey: WRONG_NETWORK_TOAST_KEY
    });
    throw new Error(`Switch wallet network to ${requestedChainId} and retry. ${error?.message || error}`);
  }
}

export async function invokeDonationWallet(txRequest) {
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
