import { BACKEND_URL } from './config.js';
import { request } from './request.js';

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

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

function sanitizeDonationRequestHeaders(headers = {}) {
  const sanitizedEntries = Object.entries(headers).filter(([key]) => {
    const normalizedKey = String(key || '').trim().toLowerCase();
    return normalizedKey !== 'x-telegram-init-data';
  });

  if (sanitizedEntries.length !== Object.keys(headers).length) {
    console.warn('Ignoring x-telegram-init-data request header for donations API; Telegram init data must be sent in the JSON body to avoid CORS preflight failures.');
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
  const response = await request(
    `${BACKEND_URL}/api/store/donations/${encodeURIComponent(wallet)}${queryString ? `?${queryString}` : ''}`,
    requestOptions
  );
  const data = await readJsonResponse(response);
  return { response, data };
}

async function createDonationPayment(payload, options = {}) {
  const response = await request(
    `${BACKEND_URL}/api/store/donations/create-payment`,
    createJsonOptions('POST', payload, options)
  );
  const data = await readJsonResponse(response);
  return { response, data };
}

async function createDonationStarsPayment(payload, options = {}) {
  const response = await request(
    `${BACKEND_URL}/api/donations/stars/create`,
    createJsonOptions('POST', normalizeStarsPaymentPayload(payload), options)
  );
  const data = normalizeStarsPaymentResponseData(await readJsonResponse(response));
  return { response, data };
}

async function confirmDonationStarsPayment(payload, options = {}) {
  const response = await request(
    `${BACKEND_URL}/api/donations/stars/confirm`,
    createJsonOptions('POST', normalizeStarsPaymentPayload(payload), options)
  );
  const data = normalizeStarsPaymentResponseData(await readJsonResponse(response));
  return { response, data };
}

async function submitDonationTransaction(payload, options = {}) {
  const response = await request(
    `${BACKEND_URL}/api/store/donations/submit-transaction`,
    createJsonOptions('POST', payload, options)
  );
  const data = await readJsonResponse(response);
  return { response, data };
}

async function getDonationHistory(wallet, options = {}) {
  const response = await request(`${BACKEND_URL}/api/store/donations/history/${encodeURIComponent(wallet)}`, options);
  const data = await readJsonResponse(response);
  return { response, data };
}

async function getDonationPayment(paymentId, options = {}) {
  const { wallet, txHash, ...requestOptions } = options;
  const query = new URLSearchParams();
  if (wallet) query.set('wallet', wallet);
  if (txHash) query.set('txHash', txHash);
  const queryString = query.toString();
  const response = await request(
    `${BACKEND_URL}/api/store/donations/payment/${encodeURIComponent(paymentId)}${queryString ? `?${queryString}` : ''}`,
    requestOptions
  );
  const data = await readJsonResponse(response);
  return { response, data };
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
