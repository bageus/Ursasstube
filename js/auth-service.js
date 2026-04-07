import { requestJsonResult, REQUEST_PROFILE_AUTH_WRITE } from './request.js';
import { BACKEND_URL } from './config.js';

async function authenticateWallet({ wallet, signature, timestamp }) {
  const { data } = await requestJsonResult(`${BACKEND_URL}/api/account/auth/wallet`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature, timestamp })
  });
  return data;
}

async function authenticateTelegram({ telegramId, firstName, username, telegramInitData = '' }) {
  return requestJsonResult(`${BACKEND_URL}/api/account/auth/telegram`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId, firstName, username, telegramInitData })
  });
}

async function requestTelegramLinkCode({ primaryId }) {
  return requestJsonResult(`${BACKEND_URL}/api/account/link/request-code`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryId })
  });
}

async function linkWalletToTelegram({ primaryId, wallet, signature, timestamp }) {
  const { data } = await requestJsonResult(`${BACKEND_URL}/api/account/link/wallet`, {
    ...REQUEST_PROFILE_AUTH_WRITE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ primaryId, wallet, signature, timestamp })
  });

  return data;
}

export {
  authenticateWallet,
  authenticateTelegram,
  requestTelegramLinkCode,
  linkWalletToTelegram,
};
