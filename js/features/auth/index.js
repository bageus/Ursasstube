export {
  initAuth,
  isTelegramAuthMode,
  isTelegramMiniApp,
  connectWalletAuth,
  disconnectAuth,
  hasWalletAuthSession,
  isWalletAuthMode,
  setAuthCallbacks,
  getAuthStateSnapshot,
  hideWalletButtonInTelegram
} from '../../auth.js';

export {
  hasAuthenticatedSession,
  getPrimaryAuthIdentifier,
  getSigningWalletAddress,
  getTelegramAuthIdentifier,
  linkTelegram,
  linkWallet
} from '../../auth.js';

export * from '../../auth-service.js';
