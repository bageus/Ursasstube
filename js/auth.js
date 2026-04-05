import { WC } from './walletconnect.js';
import { DOM } from './state.js';
import { renderAuthUiState } from './auth-ui.js';
import { getTelegramUserData, isTelegramMiniApp } from './auth-telegram.js';
import { authenticateTelegram } from './auth-service.js';
import { clearRuntimeConfig } from './store.js';
import { logger } from './logger.js';
import { linkTelegramFlow, linkWalletFlow } from './auth-linking.js';
import { disconnectAuthFlow, initAuthFlow } from './auth-lifecycle.js';
import { connectWalletAuthFlow } from './auth-authentication.js';
import {
  authState,
  isTelegramAuthMode as isTelegramAuthModeFromState,
  isWalletAuthMode as isWalletAuthModeFromState,
  hasWalletAuthSession as hasWalletAuthSessionFromState,
  hasAuthenticatedSession as hasAuthenticatedSessionFromState,
  getPrimaryAuthIdentifier as getPrimaryAuthIdentifierFromState,
  getSigningWalletAddress as getSigningWalletAddressFromState,
  getTelegramAuthIdentifier as getTelegramAuthIdentifierFromState,
  getAuthStateSnapshot as getAuthStateSnapshotFromState,
  applyAuthSession as applyAuthSessionFromState,
  clearAuthSessionState as clearAuthSessionStateFromState
} from './auth-state.js';
import { notifyAuthDisconnected, runPostAuthSync, setAuthCallbacks as setAuthCallbacksRegistry } from './auth-callbacks.js';

function setAuthCallbacks(callbacks = {}) {
  setAuthCallbacksRegistry(callbacks);
}

function isTelegramAuthMode() {
  return isTelegramAuthModeFromState();
}

function isWalletAuthMode() {
  return isWalletAuthModeFromState();
}

function hasWalletAuthSession() {
  return hasWalletAuthSessionFromState();
}

function hasAuthenticatedSession() {
  return hasAuthenticatedSessionFromState();
}

function getPrimaryAuthIdentifier() {
  return getPrimaryAuthIdentifierFromState();
}

function getSigningWalletAddress() {
  return getSigningWalletAddressFromState();
}

function getTelegramAuthIdentifier() {
  return getTelegramAuthIdentifierFromState();
}

function getAuthStateSnapshot() {
  return getAuthStateSnapshotFromState();
}

function applyAuthSession(payload = {}) {
  applyAuthSessionFromState(payload);
}

function clearAuthSessionState() {
  clearAuthSessionStateFromState();
}

async function connectWalletAuth() {
  await connectWalletAuthFlow({ applyAuthSession, updateAuthUI, runPostAuthSync, DOM });
}

function disconnectAuth() {
  disconnectAuthFlow({ WC, clearAuthSessionState, DOM, notifyAuthDisconnected, updateAuthUI, logger });
}

function updateAuthUI() {
  renderAuthUiState({
    dom: DOM,
    session: {
      isTelegramAuthMode: isTelegramAuthMode(),
      isWalletAuthMode: authState.authMode === 'wallet',
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
    getTelegramUserData,
    authenticateTelegram,
    clearRuntimeConfig,
    applyAuthSession,
    logger,
    updateAuthUI,
    runPostAuthSync,
    clearAuthSessionState,
    authState,
  });
}

/* ===== LINK ACCOUNTS ===== */
async function linkTelegram() {
  await linkTelegramFlow();
}

async function linkWallet() {
  await linkWalletFlow({ applyAuthSession, updateAuthUI, runPostAuthSync });
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
  initAuth
};
