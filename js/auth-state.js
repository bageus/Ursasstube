const authState = {
  web3: null,
  userWallet: null,
  isWalletConnected: false,
  authMode: null,
  primaryId: null,
  telegramUser: null,
  linkedTelegramId: null,
  linkedTelegramUsername: null,
  linkedWallet: null,
  isWalletAuthInProgress: false,
  isWalletLinkInProgress: false,
  sessionToken: null,
  authExpired: false,
};

const AUTH_SESSION_STORAGE_KEY = 'ursas.auth.session.v1';

function getAuthStorage() {
  try {
    return window?.localStorage || null;
  } catch (_error) {
    return null;
  }
}

function persistAuthSession() {
  const storage = getAuthStorage();
  if (!storage) return;
  try {
    storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
      authMode: authState.authMode || null,
      primaryId: authState.primaryId || null,
      telegramUser: authState.telegramUser || null,
      userWallet: authState.userWallet || null,
      isWalletConnected: Boolean(authState.isWalletConnected),
      linkedTelegramId: authState.linkedTelegramId || null,
      linkedTelegramUsername: authState.linkedTelegramUsername || null,
      linkedWallet: authState.linkedWallet || null,
      sessionToken: authState.sessionToken || null
    }));
  } catch (_error) {}
}

function restoreAuthSession() {
  const storage = getAuthStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    applyAuthSession({
      nextAuthMode: parsed?.authMode || null,
      nextPrimaryId: parsed?.primaryId || null,
      nextTelegramUser: parsed?.telegramUser || null,
      nextUserWallet: parsed?.userWallet || null,
      nextIsWalletConnected: Boolean(parsed?.isWalletConnected),
      nextLinkedTelegramId: parsed?.linkedTelegramId || null,
      nextLinkedTelegramUsername: parsed?.linkedTelegramUsername || null,
      nextLinkedWallet: parsed?.linkedWallet || null,
      nextSessionToken: parsed?.sessionToken || null
    }, { persist: false });
  } catch (_error) {}
}

function isTelegramAuthMode() {
  return authState.authMode === 'telegram';
}

function isWalletAuthMode() {
  return authState.authMode === 'wallet';
}

function hasWalletAuthSession() {
  return Boolean(authState.isWalletConnected && authState.primaryId);
}

function hasAuthenticatedSession() {
  return Boolean((authState.isWalletConnected && authState.userWallet) || (isTelegramAuthMode() && authState.primaryId));
}

function getPrimaryAuthIdentifier() {
  return authState.primaryId || authState.userWallet || null;
}

function getSigningWalletAddress() {
  return String(authState.linkedWallet || authState.userWallet || '').trim().toLowerCase() || null;
}

function getTelegramAuthIdentifier() {
  return authState.telegramUser?.id || authState.linkedTelegramId || null;
}

function getAuthStateSnapshot() {
  return {
    authMode: authState.authMode,
    primaryId: authState.primaryId,
    telegramUser: authState.telegramUser,
    userWallet: authState.userWallet,
    isWalletConnected: authState.isWalletConnected,
    linkedTelegramId: authState.linkedTelegramId,
    linkedTelegramUsername: authState.linkedTelegramUsername,
    linkedWallet: authState.linkedWallet,
    sessionToken: authState.sessionToken,
    authExpired: authState.authExpired,
    hasAuthenticatedSession: hasAuthenticatedSession(),
    hasWalletAuthSession: hasWalletAuthSession()
  };
}

function applyAuthSession({
  nextAuthMode = null,
  nextPrimaryId = null,
  nextTelegramUser = authState.telegramUser,
  nextUserWallet = null,
  nextIsWalletConnected = false,
  nextLinkedTelegramId = null,
  nextLinkedTelegramUsername = null,
  nextLinkedWallet = null,
  nextWeb3 = null,
  nextSessionToken = null,
  nextAuthExpired = false
} = {}, options = {}) {
  const { persist = true } = options;
  authState.authMode = nextAuthMode;
  authState.primaryId = nextPrimaryId;
  authState.telegramUser = nextTelegramUser;
  authState.userWallet = nextUserWallet;
  authState.isWalletConnected = Boolean(nextIsWalletConnected);
  authState.linkedTelegramId = nextLinkedTelegramId;
  authState.linkedTelegramUsername = nextLinkedTelegramUsername;
  authState.linkedWallet = nextLinkedWallet;
  authState.web3 = nextWeb3;
  authState.sessionToken = nextSessionToken;
  authState.authExpired = Boolean(nextAuthExpired);
  if (persist) persistAuthSession();
}

function clearAuthSessionState() {
  applyAuthSession();
}

function markAuthExpired() {
  applyAuthSession({
    nextAuthMode: null,
    nextPrimaryId: null,
    nextTelegramUser: null,
    nextUserWallet: null,
    nextIsWalletConnected: false,
    nextLinkedTelegramId: null,
    nextLinkedTelegramUsername: null,
    nextLinkedWallet: null,
    nextWeb3: null,
    nextSessionToken: null,
    nextAuthExpired: true
  });
}

restoreAuthSession();

export {
  authState,
  isTelegramAuthMode,
  isWalletAuthMode,
  hasWalletAuthSession,
  hasAuthenticatedSession,
  getPrimaryAuthIdentifier,
  getSigningWalletAddress,
  getTelegramAuthIdentifier,
  getAuthStateSnapshot,
  applyAuthSession,
  clearAuthSessionState,
  markAuthExpired,
};
