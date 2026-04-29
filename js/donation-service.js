import { BACKEND_URL } from './config.js';
import {
  requestJsonResult,
  REQUEST_PROFILE_STORE_READ,
  REQUEST_PROFILE_STORE_WRITE
} from './request.js';
import { logger } from './logger.js';

function normalizeStarsPaymentPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return payload;

  const telegramInitData = String(
    payload.telegramInitData
    ?? payload.initData
    ?? ''
  ).trim();

  return {
    ...payload,
    ...(telegramInitData ? { telegramInitData } : {})
  };
}

function normalizeStarsPaymentResponseData(data) {
  if (!data || typeof data !== 'object') return data;

  const invoiceUrl = String(
    data.invoiceUrl
    ?? data.invoice_url
    ?? data.url
    ?? ''
  ).trim();
  const orderId = data.orderId ?? data.order_id ?? data.paymentId ?? data.payment_id ?? '';
  const paymentId = data.paymentId ?? data.payment_id ?? orderId;
  const amount = data.amount ?? data.starsAmount ?? data.stars_amount ?? data.starsPrice ?? data.stars_price ?? null;

  return {
    ...data,
    ...(invoiceUrl ? { invoiceUrl } : {}),
    ...(orderId ? { orderId } : {}),
    ...(paymentId ? { paymentId } : {}),
    ...(amount != null ? { amount } : {})
  };
}

function normalizePaymentStatusEnvelope(data) {
  if (!data || typeof data !== 'object') return data;
  const status = String(data.status ?? data.paymentStatus ?? '').trim().toLowerCase();
  const ok = typeof data.ok === 'boolean'
    ? data.ok
    : (typeof data.success === 'boolean' ? data.success : undefined);
  const payment = data.payment && typeof data.payment === 'object' ? data.payment : null;

  return {
    ...data,
    ...(status ? { status } : {}),
    ...(ok !== undefined ? { ok } : {}),
    ...(payment ? { payment: {
      id: payment.id ?? payment.paymentId ?? data.paymentId ?? data.orderId ?? null,
      amount: payment.amount ?? data.amount ?? null,
      currency: payment.currency ?? data.currency ?? null,
      method: payment.method ?? payment.paymentMethod ?? data.paymentMethod ?? data.paymentMode ?? null
    } } : {})
  };
}

function sanitizeDonationRequestHeaders(headers = {}) {
  const sanitizedEntries = Object.entries(headers).filter(([key]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    return normalizedKey !== 'x-telegram-init-data';
  });

  if (sanitizedEntries.length !== Object.keys(headers).length) {
    logger.warn('Ignoring x-telegram-init-data request header for donations API; Telegram init data must be sent in the JSON body to avoid CORS preflight failures.');
  }

  return Object.fromEntries(sanitizedEntries);
}

function createJsonOptions(method, payload, options = {}) {
  const { headers: customHeaders = {}, ...restOptions } = options;
  const headers = sanitizeDonationRequestHeaders(customHeaders);

  return {
    ...restOptions,
    method,
    body: JSON.stringify(payload),
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  };
}

async function getDonationProducts(wallet, options = {}) {
  const { paymentMode = '', ...requestOptions } = options;
  const query = new URLSearchParams();
  if (paymentMode) query.set('paymentMode', paymentMode);
  const queryString = query.toString();
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/store/donations/${encodeURIComponent(wallet)}${queryString ? `?${queryString}` : ''}`,
    { ...REQUEST_PROFILE_STORE_READ, ...requestOptions }
  );
  return { response: { ok, status }, data };
}

async function createDonationPayment(payload, options = {}) {
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/store/donations/create-payment`,
    createJsonOptions('POST', payload, { ...REQUEST_PROFILE_STORE_WRITE, ...options })
  );
  return { response: { ok, status }, data: normalizePaymentStatusEnvelope(data) };
}

async function createDonationStarsPayment(payload, options = {}) {
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/donations/stars/create`,
    createJsonOptions('POST', normalizeStarsPaymentPayload(payload), { ...REQUEST_PROFILE_STORE_WRITE, ...options })
  );
  return {
    response: { ok, status },
    data: normalizePaymentStatusEnvelope(normalizeStarsPaymentResponseData(data))
  };
}

async function confirmDonationStarsPayment(payload, options = {}) {
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/donations/stars/confirm`,
    createJsonOptions('POST', normalizeStarsPaymentPayload(payload), { ...REQUEST_PROFILE_STORE_WRITE, ...options })
  );
  return {
    response: { ok, status },
    data: normalizePaymentStatusEnvelope(normalizeStarsPaymentResponseData(data))
  };
}

async function submitDonationTransaction(payload, options = {}) {
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/store/donations/submit-transaction`,
    createJsonOptions('POST', payload, { ...REQUEST_PROFILE_STORE_WRITE, ...options })
  );
  return { response: { ok, status }, data: normalizePaymentStatusEnvelope(data) };
}

async function getDonationHistory(wallet, options = {}) {
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/store/donations/history/${encodeURIComponent(wallet)}`,
    { ...REQUEST_PROFILE_STORE_READ, ...options }
  );
  return { response: { ok, status }, data: normalizePaymentStatusEnvelope(data) };
}

async function getDonationPayment(paymentId, options = {}) {
  const { wallet, txHash, ...requestOptions } = options;
  const query = new URLSearchParams();
  if (wallet) query.set('wallet', wallet);
  if (txHash) query.set('txHash', txHash);
  const queryString = query.toString();
  const { ok, status, data } = await requestJsonResult(
    `${BACKEND_URL}/api/store/donations/payment/${encodeURIComponent(paymentId)}${queryString ? `?${queryString}` : ''}`,
    { ...REQUEST_PROFILE_STORE_READ, ...requestOptions }
  );
  return { response: { ok, status }, data };
}

export {
  getDonationProducts,
  createDonationPayment,
  createDonationStarsPayment,
  confirmDonationStarsPayment,
  submitDonationTransaction,
  getDonationHistory,
  getDonationPayment
};
