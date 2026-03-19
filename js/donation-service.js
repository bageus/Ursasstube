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
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: JSON.stringify(payload),
    ...options
  };
}

async function getDonationProducts(wallet, options = {}) {
  const response = await request(`${BACKEND_URL}/api/store/donations/${encodeURIComponent(wallet)}`, options);
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

async function submitDonationTransaction(payload, options = {}) {
  const response = await request(
    `${BACKEND_URL}/api/store/donations/submit-transaction`,
    createJsonOptions('POST', payload, options)
  );
  const data = await readJsonResponse(response);
  return { response, data };
}

async function getDonationPayment(paymentId, options = {}) {
  const response = await request(
    `${BACKEND_URL}/api/store/donations/payment/${encodeURIComponent(paymentId)}`,
    options
  );
  const data = await readJsonResponse(response);
  return { response, data };
}

export {
  getDonationProducts,
  createDonationPayment,
  submitDonationTransaction,
  getDonationPayment
};
