import { BACKEND_URL } from './config.js';
import { request } from './request.js';

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function createJsonOptions(method, payload, options = {}) {
  const { headers: customHeaders = {}, ...restOptions } = options;

  return {
    ...restOptions,
    method,
    body: JSON.stringify(payload),
    headers: {
      ...customHeaders,
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
    createJsonOptions('POST', payload, options)
  );
  const data = await readJsonResponse(response);
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
  submitDonationTransaction,
  getDonationHistory,
  getDonationPayment
};
