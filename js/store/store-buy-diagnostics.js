export function buildStoreBuyFailureDiagnostic({
  status,
  data,
  authMode,
  primaryId,
  telegramId,
  hasTelegramInitData,
  hasWallet
}) {
  return {
    status,
    data,
    requestData: {
      authMode,
      primaryId,
      telegramId,
      hasTelegramInitData,
      hasWallet
    }
  };
}

export function isTelegramSessionExpiredError(message = '') {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('missing telegram identity') || normalized.includes('verification failed');
}
