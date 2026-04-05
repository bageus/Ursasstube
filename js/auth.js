import { sanitizeTelegramHandle } from './security.js';
import { WC } from './walletconnect.js';
import { request } from './request.js';
import { BACKEND_URL } from './config.js';
import { DOM } from './state.js';
import { clearNode } from './dom-render.js';
import { bindWalletInfoActions, renderWalletStats, renderWalletInfoHeader } from './auth-ui.js';
import { showTelegramLinkOverlay } from './auth-link-telegram-overlay.js';
import { clearRuntimeConfig } from './store.js';
import { logger } from './logger.js';

let web3 = null;
let userWallet = null;
let isWalletConnected = false;
let authMode = null;
let primaryId = null;
let telegramUser = null;
let linkedTelegramId = null;
let linkedTelegramUsername = null;
let linkedWallet = null;
let isWalletAuthInProgress = false;
let isWalletLinkInProgress = false;

const authCallbacks = {
  onWalletUiUpdate: async () => {},
  onLoadPlayerUpgrades: async () => {},
  onLoadLeaderboard: async () => {},
  onUpdateRidesDisplay: () => {},
  onAuthDisconnected: () => {}
};

function setAuthCallbacks(callbacks = {}) {
  if (typeof callbacks.onWalletUiUpdate === 'function') authCallbacks.onWalletUiUpdate = callbacks.onWalletUiUpdate;
  if (typeof callbacks.onLoadPlayerUpgrades === 'function') authCallbacks.onLoadPlayerUpgrades = callbacks.onLoadPlayerUpgrades;
  if (typeof callbacks.onLoadLeaderboard === 'function') authCallbacks.onLoadLeaderboard = callbacks.onLoadLeaderboard;
  if (typeof callbacks.onUpdateRidesDisplay === 'function') authCallbacks.onUpdateRidesDisplay = callbacks.onUpdateRidesDisplay;
  if (typeof callbacks.onAuthDisconnected === 'function') authCallbacks.onAuthDisconnected = callbacks.onAuthDisconnected;
}

async function runPostAuthSync({ withLeaderboard = true, withRidesDisplay = true } = {}) {
  await authCallbacks.onWalletUiUpdate();
  await authCallbacks.onLoadPlayerUpgrades();
  if (withLeaderboard) {
    await authCallbacks.onLoadLeaderboard();
  }
  if (withRidesDisplay) {
    authCallbacks.onUpdateRidesDisplay();
  }
}

function isTelegramAuthMode() {
  return authMode === 'telegram';
}

function isWalletAuthMode() {
  return authMode === 'wallet';
}

function hasWalletAuthSession() {
  return Boolean(isWalletConnected && primaryId);
}

function hasAuthenticatedSession() {
  return Boolean((isWalletConnected && userWallet) || (isTelegramAuthMode() && primaryId));
}

function getPrimaryAuthIdentifier() {
  return primaryId || userWallet || null;
}

function getSigningWalletAddress() {
  return String(linkedWallet || userWallet || '').trim().toLowerCase() || null;
}

function getTelegramAuthIdentifier() {
  return telegramUser?.id || linkedTelegramId || null;
}


function getAuthStateSnapshot() {
  return {
    authMode,
    primaryId,
    telegramUser,
    userWallet,
    isWalletConnected,
    linkedTelegramId,
    linkedTelegramUsername,
    linkedWallet,
    hasAuthenticatedSession: hasAuthenticatedSession(),
    hasWalletAuthSession: hasWalletAuthSession()
  };
}

function applyAuthSession({
  nextAuthMode = null,
  nextPrimaryId = null,
  nextTelegramUser = telegramUser,
  nextUserWallet = null,
  nextIsWalletConnected = false,
  nextLinkedTelegramId = null,
  nextLinkedTelegramUsername = null,
  nextLinkedWallet = null,
  nextWeb3 = null
} = {}) {
  authMode = nextAuthMode;
  primaryId = nextPrimaryId;
  telegramUser = nextTelegramUser;
  userWallet = nextUserWallet;
  isWalletConnected = Boolean(nextIsWalletConnected);
  linkedTelegramId = nextLinkedTelegramId;
  linkedTelegramUsername = nextLinkedTelegramUsername;
  linkedWallet = nextLinkedWallet;
  web3 = nextWeb3;
}

function clearAuthSessionState() {
  applyAuthSession();
}

function isTelegramMiniApp() {
  return !!(window.Telegram && window.Telegram.WebApp &&
    window.Telegram.WebApp.initDataUnsafe &&
    window.Telegram.WebApp.initDataUnsafe.user);
}

function getTelegramUserData() {
  if (!isTelegramMiniApp()) return null;
  const user = window.Telegram.WebApp.initDataUnsafe.user;
  return {
    id: String(user.id),
    firstName: user.first_name || '',
    username: user.username || '',
    displayName: user.first_name || user.username || `TG#${user.id}`
  };
}

async function connectWalletAuth() {
  if (isWalletAuthInProgress) return;

  isWalletAuthInProgress = true;
  try {
    let walletAddress, signature;
    const timestamp = Date.now();

    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        alert("❌ Wallet connection failed");
        return;
      }
      walletAddress = accounts[0];
      const message = `Auth wallet\nWallet: ${walletAddress.toLowerCase()}\nTimestamp: ${timestamp}`;
      signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress]
      });
    } else {
      const connected = await WC.connect();
      if (!connected) return;
      walletAddress = WC.accounts[0];
      const message = `Auth wallet\nWallet: ${walletAddress.toLowerCase()}\nTimestamp: ${timestamp}`;
      signature = await WC.signMessage(message);
      if (!signature) return;
    }

    const response = await request(`${BACKEND_URL}/api/account/auth/wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress, signature, timestamp })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      clearRuntimeConfig();
      applyAuthSession({
        nextAuthMode: 'wallet',
        nextPrimaryId: data.primaryId,
        nextUserWallet: String(data.wallet || walletAddress || data.primaryId || '').toLowerCase() || null,
        nextIsWalletConnected: true,
        nextLinkedTelegramId: data.telegramId,
        nextLinkedTelegramUsername: data.telegramUsername || null,
        nextLinkedWallet: null,
        nextWeb3: window.ethereum || null
      });
      logger.info("✅ Wallet auth OK:", primaryId);

      updateAuthUI();
      await runPostAuthSync();

      if (DOM.storeBtn) DOM.storeBtn.classList.remove("menu-hidden");
    }
  } catch (error) {
    logger.error("❌ Wallet auth error:", error);
    if (error.code === 4001) alert("❌ Request rejected");
    else alert(`❌ Error: ${error.message}`);
  } finally {
    isWalletAuthInProgress = false;
  }
}

function disconnectAuth() {
  WC.disconnect();
  clearAuthSessionState();
  DOM.walletBtn.textContent = "Connect Wallet";
  DOM.walletBtn.classList.remove("connected");
  DOM.walletInfo.classList.remove("visible");
  if (DOM.storeBtn) DOM.storeBtn.classList.add("menu-hidden");

  authCallbacks.onAuthDisconnected();

  updateAuthUI();
  logger.info("🔌 Disconnected");
}

function updateAuthUI() {
  const btn = DOM.walletBtn;
  const info = DOM.walletInfo;

  if (isTelegramAuthMode()) {
    btn.textContent = telegramUser ? telegramUser.displayName : `TG#${primaryId}`;
    btn.classList.add("connected");
    btn.onclick = null;
    btn.style.cursor = 'default';
    info.classList.add("visible");

    clearNode(info);
    if (linkedWallet) {
      const walletShort = `${linkedWallet.slice(0, 6)}...${linkedWallet.slice(-4)}`;
      renderWalletInfoHeader(info, { compactLabel: walletShort });
    } else {
      renderWalletInfoHeader(info, { actionLabel: 'Link Wallet', actionName: 'link-wallet' });
    }
    renderWalletStats(info);
    bindWalletInfoActions(info, { onLinkWallet: linkWallet, onLinkTelegram: linkTelegram });
    if (DOM.storeBtn) DOM.storeBtn.classList.remove("menu-hidden");

  } else if (authMode === "wallet") {
    const addr = primaryId;
    btn.textContent = addr.startsWith("0x") ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
    btn.classList.add("connected");
    btn.onclick = disconnectAuth;
    btn.style.cursor = '';
    info.classList.add("visible");

    clearNode(info);
    if (linkedTelegramId) {
      const tgDisplay = linkedTelegramUsername ? `@${linkedTelegramUsername}` : `TG#${linkedTelegramId}`;
      renderWalletInfoHeader(info, { compactLabel: tgDisplay });
    } else {
      renderWalletInfoHeader(info, { actionLabel: 'Link Telegram', actionName: 'link-telegram' });
    }
    renderWalletStats(info);
    bindWalletInfoActions(info, { onLinkWallet: linkWallet, onLinkTelegram: linkTelegram });
    if (DOM.storeBtn) DOM.storeBtn.classList.remove("menu-hidden");

  } else {
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    btn.onclick = connectWalletAuth;
    btn.style.cursor = '';
    info.classList.remove("visible");
    clearNode(info);
    if (DOM.storeBtn) DOM.storeBtn.classList.add("menu-hidden");
  }
}

async function initAuth() {
  if (isTelegramMiniApp()) {
    telegramUser = getTelegramUserData();
    logger.info("📱 Telegram mode:", telegramUser);

    try {
      const response = await request(`${BACKEND_URL}/api/account/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: telegramUser.id,
          firstName: telegramUser.firstName,
          username: telegramUser.username
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        clearRuntimeConfig();
        applyAuthSession({
          nextAuthMode: 'telegram',
          nextPrimaryId: data.primaryId,
          nextTelegramUser: telegramUser,
          nextLinkedWallet: data.wallet,
          nextIsWalletConnected: true,
          nextUserWallet: data.primaryId
        });
        logger.info("✅ Telegram auth OK:", primaryId);
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
  if (authMode !== "wallet" || !primaryId) return;

  try {
    const response = await request(`${BACKEND_URL}/api/account/link/request-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
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
  if (authMode !== "telegram" || !primaryId || isWalletLinkInProgress) return;

  isWalletLinkInProgress = true;
  try {
    let walletAddress, signature;
    const timestamp = Date.now();

    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) return;
      walletAddress = accounts[0];
      const message = `Link wallet\nWallet: ${walletAddress.toLowerCase()}\nPrimaryId: ${primaryId}\nTimestamp: ${timestamp}`;
      signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress]
      });
    } else {
      const connected = await WC.connect();
      if (!connected) return;
      walletAddress = WC.accounts[0];
      const message = `Link wallet\nWallet: ${walletAddress.toLowerCase()}\nPrimaryId: ${primaryId}\nTimestamp: ${timestamp}`;
      signature = await WC.signMessage(message);
      if (!signature) return;
    }

    const response = await request(`${BACKEND_URL}/api/account/link/wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId, wallet: walletAddress, signature, timestamp })
    });

    const data = await response.json();

    if (data.success) {
      applyAuthSession({
        nextAuthMode: 'telegram',
        nextPrimaryId: data.primaryId,
        nextTelegramUser: telegramUser,
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
    isWalletLinkInProgress = false;
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
