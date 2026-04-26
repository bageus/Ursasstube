import { WC } from './walletconnect.js';
import { DOM } from './state.js';
import { renderAuthUiState } from './auth-ui.js';
import { getTelegramInitData, getTelegramUserData, isTelegramMiniApp, waitForTelegramMiniApp } from './auth-telegram.js';
import { authenticateTelegram } from './auth-service.js';
import { clearRuntimeConfig } from './store.js';
import { logger } from './logger.js';
import { linkTelegramFlow, linkWalletFlow } from './auth-linking.js';
import { disconnectAuthFlow, initAuthFlow } from './auth-lifecycle.js';
import { connectWalletAuthFlow } from './auth-authentication.js';
import {
  authState,
  isTelegramAuthMode as isTelegramAuthModeState,
  isWalletAuthMode as isWalletAuthModeState,
  hasWalletAuthSession as hasWalletAuthSessionState,
  hasAuthenticatedSession as hasAuthenticatedSessionState,
  getPrimaryAuthIdentifier as getPrimaryAuthIdentifierState,
  getSigningWalletAddress as getSigningWalletAddressState,
  getTelegramAuthIdentifier as getTelegramAuthIdentifierState,
  getAuthStateSnapshot as getAuthStateSnapshotState,
  applyAuthSession as applyAuthSessionState,
  clearAuthSessionState as clearAuthSessionStateState
} from './auth-state.js';
import { notifyAuthDisconnected, runPostAuthSync, setAuthCallbacks as setAuthCallbacksRegistry } from './auth-callbacks.js';
const setAuthCallbacks = setAuthCallbacksRegistry;
const isTelegramAuthMode = () => isTelegramAuthModeState();
const isWalletAuthMode = () => isWalletAuthModeState();
const hasWalletAuthSession = () => hasWalletAuthSessionState();
const hasAuthenticatedSession = () => hasAuthenticatedSessionState();
const getPrimaryAuthIdentifier = () => getPrimaryAuthIdentifierState();
const getSigningWalletAddress = () => getSigningWalletAddressState();
const getTelegramAuthIdentifier = () => getTelegramAuthIdentifierState();
const getAuthStateSnapshot = () => getAuthStateSnapshotState();

async function connectWalletAuth() {
  await connectWalletAuthFlow({ applyAuthSession: applyAuthSessionState, updateAuthUI, runPostAuthSync, DOM });
}

function disconnectAuth() {
  disconnectAuthFlow({ WC, clearAuthSessionState: clearAuthSessionStateState, DOM, notifyAuthDisconnected, updateAuthUI, logger });
}

function updateAuthUI() {
  renderAuthUiState({
    dom: DOM,
    session: {
      isTelegramAuthMode: isTelegramAuthMode(),
      isWalletAuthMode: isWalletAuthMode(),
      primaryId: authState.primaryId,
      telegramUser: authState.telegramUser,
      linkedWallet: authState.linkedWallet,
      linkedTelegramId: authState.linkedTelegramId,
      linkedTelegramUsername: authState.linkedTelegramUsername
    },
    onConnectWallet: connectWalletAuth,
    onDisconnectAuth: disconnectAuth,
    onLinkWallet: linkWallet,
    onLinkTelegram: linkTelegram
  });
}

async function initAuth() {
  await initAuthFlow({
    isTelegramMiniApp,
    waitForTelegramMiniApp,
    getTelegramUserData,
    getTelegramInitData,
    authenticateTelegram,
    clearRuntimeConfig,
    applyAuthSession: applyAuthSessionState,
    logger,
    updateAuthUI,
    runPostAuthSync,
    clearAuthSessionState: clearAuthSessionStateState,
    authState,
  });
}

/* ===== LINK ACCOUNTS ===== */
async function linkTelegram() {
  await linkTelegramFlow();
}

async function linkWallet() {
  await linkWalletFlow({ applyAuthSession: applyAuthSessionState, updateAuthUI, runPostAuthSync });
}

export {
  isTelegramAuthMode,
  isWalletAuthMode,
  hasWalletAuthSession,
  hasAuthenticatedSession,
  getAuthStateSnapshot,
  getPrimaryAuthIdentifier,
  getSigningWalletAddress,
  getTelegramAuthIdentifier,
  setAuthCallbacks,
  isTelegramMiniApp,
  connectWalletAuth,
  disconnectAuth,
  initAuth,
  linkTelegram,
  linkWallet
};
