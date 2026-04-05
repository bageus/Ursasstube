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
};

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
  nextWeb3 = null
} = {}) {
  authState.authMode = nextAuthMode;
  authState.primaryId = nextPrimaryId;
  authState.telegramUser = nextTelegramUser;
  authState.userWallet = nextUserWallet;
  authState.isWalletConnected = Boolean(nextIsWalletConnected);
  authState.linkedTelegramId = nextLinkedTelegramId;
  authState.linkedTelegramUsername = nextLinkedTelegramUsername;
  authState.linkedWallet = nextLinkedWallet;
  authState.web3 = nextWeb3;
}

function clearAuthSessionState() {
  applyAuthSession();
}

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
};
