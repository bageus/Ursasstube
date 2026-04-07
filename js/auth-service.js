import { request } from './request.js';
import { BACKEND_URL } from './config.js';

async function authenticateWallet({ wallet, signature, timestamp }) {
  const response = await request(`${BACKEND_URL}/api/account/auth/wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature, timestamp })
  });
  return response.json();
}

async function authenticateTelegram({ telegramId, firstName, username, telegramInitData = '' }) {
  const response = await request(`${BACKEND_URL}/api/account/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, firstName, username, telegramInitData })
  });
  return { ok: response.ok, data: await response.json() };
}

async function requestTelegramLinkCode({ primaryId }) {
  const response = await request(`${BACKEND_URL}/api/account/link/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryId })
  });

  return { ok: response.ok, data: await response.json() };
}

async function linkWalletToTelegram({ primaryId, wallet, signature, timestamp }) {
  const response = await request(`${BACKEND_URL}/api/account/link/wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryId, wallet, signature, timestamp })
  });

  return response.json();
}

export {
  authenticateWallet,
  authenticateTelegram,
  requestTelegramLinkCode,
  linkWalletToTelegram,
};
