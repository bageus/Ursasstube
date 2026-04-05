import { sanitizeTelegramHandle } from './security.js';
import { WC } from './walletconnect.js';
import { DOM } from './state.js';
import { renderAuthUiState } from './auth-ui.js';
import { showTelegramLinkOverlay } from './auth-link-telegram-overlay.js';
import { getTelegramUserData, isTelegramMiniApp } from './auth-telegram.js';
import { authenticateTelegram, authenticateWallet, linkWalletToTelegram, requestTelegramLinkCode } from './auth-service.js';
import { requestWalletSignature } from './auth-wallet-connector.js';
import { clearRuntimeConfig } from './store.js';
import { logger } from './logger.js';
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
  if (authState.isWalletAuthInProgress) return;

  authState.isWalletAuthInProgress = true;
  try {
    const timestamp = Date.now();
    const signedPayload = await requestWalletSignature({ flow: 'auth', timestamp });
    if (!signedPayload) {
      alert("❌ Wallet connection failed");
      return;
    }
    const { walletAddress, signature, provider } = signedPayload;

    const data = await authenticateWallet({
      wallet: walletAddress,
      signature,
      timestamp
    });

    if (data.success) {
      clearRuntimeConfig();
      applyAuthSession({
        nextAuthMode: 'wallet',
        nextPrimaryId: data.primaryId,
        nextUserWallet: String(data.wallet || walletAddress || data.primaryId || '').toLowerCase() || null,
        nextIsWalletConnected: true,
        nextLinkedTelegramId: data.telegramId,
        nextLinkedTelegramUsername: data.telegramUsername || null,
        nextLinkedWallet: null,
        nextWeb3: provider
      });
      logger.info("✅ Wallet auth OK:", authState.primaryId);

      updateAuthUI();
      await runPostAuthSync();

      if (DOM.storeBtn) DOM.storeBtn.classList.remove("menu-hidden");
    }
  } catch (error) {
    logger.error("❌ Wallet auth error:", error);
    if (error.code === 4001) alert("❌ Request rejected");
    else alert(`❌ Error: ${error.message}`);
  } finally {
    authState.isWalletAuthInProgress = false;
  }
}

function disconnectAuth() {
  WC.disconnect();
  clearAuthSessionState();
  DOM.walletBtn.textContent = "Connect Wallet";
  DOM.walletBtn.classList.remove("connected");
  DOM.walletInfo.classList.remove("visible");
  if (DOM.storeBtn) DOM.storeBtn.classList.add("menu-hidden");

  notifyAuthDisconnected();

  updateAuthUI();
  logger.info("🔌 Disconnected");
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
  if (isTelegramMiniApp()) {
    authState.telegramUser = getTelegramUserData();
    logger.info("📱 Telegram mode:", authState.telegramUser);

    try {
      const { ok, data } = await authenticateTelegram({
        telegramId: authState.telegramUser.id,
        firstName: authState.telegramUser.firstName,
        username: authState.telegramUser.username
      });

      if (ok && data.success) {
        clearRuntimeConfig();
        applyAuthSession({
          nextAuthMode: 'telegram',
          nextPrimaryId: data.primaryId,
          nextTelegramUser: authState.telegramUser,
          nextLinkedWallet: data.wallet,
          nextIsWalletConnected: true,
          nextUserWallet: data.primaryId
        });
        logger.info("✅ Telegram auth OK:", authState.primaryId);
        updateAuthUI();
        await runPostAuthSync();
      }
    } catch (e) {
      logger.error("❌ Telegram auth error:", e);
    }
  } else {
    clearAuthSessionState();
    logger.info("🌐 Browser mode — wallet auth");
    updateAuthUI();
  }
}

/* ===== LINK ACCOUNTS ===== */
async function linkTelegram() {
  if (authState.authMode !== "wallet" || !authState.primaryId) return;

  try {
    const { ok, data } = await requestTelegramLinkCode({ primaryId: authState.primaryId });

    if (!ok || !data.success) {
      alert(`❌ ${data.error || 'Failed to generate code'}`);
      return;
    }

    const code = String(data.code || '----');
    const botUsername = sanitizeTelegramHandle(data.botUsername, 'Ursasstube_bot');
    const botLink = `https://t.me/${encodeURIComponent(botUsername)}`;

    showTelegramLinkOverlay({ code, botUsername, botLink });

  } catch (e) {
    logger.error("❌ Link telegram error:", e);
    alert("❌ Network error. Try again.");
  }
}

async function linkWallet() {
  if (authState.authMode !== "telegram" || !authState.primaryId || authState.isWalletLinkInProgress) return;

  authState.isWalletLinkInProgress = true;
  try {
    const timestamp = Date.now();
    const signedPayload = await requestWalletSignature({
      flow: 'link',
      primaryId: authState.primaryId,
      timestamp,
    });
    if (!signedPayload) return;
    const { walletAddress, signature } = signedPayload;

    const data = await linkWalletToTelegram({
      primaryId: authState.primaryId,
      wallet: walletAddress,
      signature,
      timestamp
    });

    if (data.success) {
      applyAuthSession({
        nextAuthMode: 'telegram',
        nextPrimaryId: data.primaryId,
        nextTelegramUser: authState.telegramUser,
        nextLinkedWallet: data.wallet,
        nextIsWalletConnected: true,
        nextUserWallet: String(data.wallet || walletAddress || data.primaryId || '').toLowerCase() || null
      });
      if (data.merged) {
        alert(`✅ Accounts merged!\nMaster: score ${data.masterScore}\nSlave score ${data.slaveScoreWas} — reset`);
      } else {
        alert("✅ Wallet linked!");
      }

      updateAuthUI();
      await runPostAuthSync({ withLeaderboard: false, withRidesDisplay: false });
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (e) {
    logger.error("❌ Link wallet error:", e);
  } finally {
    authState.isWalletLinkInProgress = false;
  }
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
