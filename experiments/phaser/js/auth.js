import { escapeHtml, sanitizeTelegramHandle } from './security.js';
import { WC } from './walletconnect.js';
import { request } from './request.js';
import { BACKEND_DISABLED, BACKEND_URL } from './config.js';
import { DOM } from './state.js';
import { createIconAtlas, createImageIcon, clearNode } from './dom-render.js';
import { clearRuntimeConfig } from './store.js';
import { ethers } from 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js';

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


const OFFLINE_WALLET_STORAGE_KEY = 'ursassOfflineWalletAddress';

function getStoredOfflineWalletAddress() {
  try {
    return localStorage.getItem(OFFLINE_WALLET_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function setStoredOfflineWalletAddress(address) {
  try {
    if (address) localStorage.setItem(OFFLINE_WALLET_STORAGE_KEY, address);
    else localStorage.removeItem(OFFLINE_WALLET_STORAGE_KEY);
  } catch {
    // ignore storage failures in restricted environments
  }
}

function generateMockWalletAddress() {
  const bytes = new Uint8Array(20);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function resolveOfflineWalletAddress(address = null) {
  const normalized = String(address || getStoredOfflineWalletAddress() || generateMockWalletAddress()).trim().toLowerCase();
  setStoredOfflineWalletAddress(normalized);
  return normalized;
}

async function connectOfflineWalletSession() {
  let walletAddress = null;

  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (Array.isArray(accounts) && accounts.length > 0) {
      walletAddress = accounts[0];
      web3 = new ethers.providers.Web3Provider(window.ethereum);
    }
  } else {
    const connected = await WC.connect();
    if (connected && Array.isArray(WC.accounts) && WC.accounts.length > 0) {
      walletAddress = WC.accounts[0];
    }
  }

  const resolvedWallet = resolveOfflineWalletAddress(walletAddress);
  clearRuntimeConfig();
  authMode = 'wallet';
  primaryId = resolvedWallet;
  userWallet = resolvedWallet;
  linkedTelegramId = null;
  linkedTelegramUsername = null;
  linkedWallet = null;
  isWalletConnected = true;
  console.log('🧪 Offline wallet session started:', resolvedWallet);
  updateAuthUI();
  await runPostAuthSync();

  if (!walletAddress) {
    alert('🧪 Backend disabled: started local wallet session with a mock wallet address.');
  }
}

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

function getAuthState() {
  return {
    web3,
    userWallet,
    isWalletConnected,
    authMode,
    primaryId,
    telegramUser,
    linkedTelegramId,
    linkedTelegramUsername,
    linkedWallet
  };
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

function getLeaderboardIdentity() {
  return {
    userWallet,
    primaryId
  };
}

function getLeaderboardWalletAddress() {
  return userWallet || '';
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
  if (BACKEND_DISABLED) {
    await connectOfflineWalletSession();
    return;
  }

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
      authMode = "wallet";
      primaryId = data.primaryId;
      userWallet = String(data.wallet || walletAddress || data.primaryId || "").toLowerCase() || null;
      isWalletConnected = true;
      linkedTelegramId = data.telegramId;
      linkedTelegramUsername = data.telegramUsername || null;
      if (window.ethereum) {
        web3 = new ethers.providers.Web3Provider(window.ethereum);
      }
      console.log("✅ Wallet auth OK:", primaryId);

      updateAuthUI();
      await runPostAuthSync();

      if (DOM.storeBtn) DOM.storeBtn.classList.remove("menu-hidden");
    }
  } catch (error) {
    console.error("❌ Wallet auth error:", error);
    if (error.code === 4001) alert("❌ Request rejected");
    else alert(`❌ Error: ${error.message}`);
  } finally {
    isWalletAuthInProgress = false;
  }
}

function disconnectAuth() {
  setStoredOfflineWalletAddress(null);
  WC.disconnect();
  authMode = null;
  primaryId = null;
  isWalletConnected = false;
  userWallet = null;
  linkedTelegramId = null;
  linkedTelegramUsername = null;
  linkedWallet = null;
  web3 = null;
  DOM.walletBtn.textContent = "Connect Wallet";
  DOM.walletBtn.classList.remove("connected");
  DOM.walletInfo.classList.remove("visible");
  if (DOM.storeBtn) DOM.storeBtn.classList.add("menu-hidden");

  authCallbacks.onAuthDisconnected();

  updateAuthUI();
  console.log("🔌 Disconnected");
}

// Backward compatibility aliases
function connectWallet() { return connectWalletAuth(); }
function disconnectWallet() { return disconnectAuth(); }

function bindWalletInfoActions(infoRoot) {
  if (!infoRoot) return;

  const linkWalletBtn = infoRoot.querySelector('[data-action="link-wallet"]');
  if (linkWalletBtn) linkWalletBtn.addEventListener('click', linkWallet);

  const linkTelegramBtn = infoRoot.querySelector('[data-action="link-telegram"]');
  if (linkTelegramBtn) linkTelegramBtn.addEventListener('click', linkTelegram);
}

function createWalletInfoRow({ iconNode, valueId, valueClass, defaultValue }) {
  const row = document.createElement('div');
  row.className = 'wallet-info-row';
  row.append(iconNode, document.createTextNode(' '));

  const value = document.createElement('span');
  value.className = valueClass;
  value.id = valueId;
  value.textContent = defaultValue;
  row.append(value);
  return row;
}

function renderWalletStats(infoRoot) {
  infoRoot.append(
    createWalletInfoRow({
      iconNode: createIconAtlas({
        width: 16,
        height: 16,
        backgroundSize: '80px auto',
        backgroundPosition: '-16px 0px'
      }),
      valueId: 'walletRank',
      valueClass: 'val',
      defaultValue: '—'
    }),
    createWalletInfoRow({
      iconNode: createIconAtlas({
        width: 16,
        height: 16,
        backgroundSize: '80px auto',
        backgroundPosition: '-64px -16px'
      }),
      valueId: 'walletBest',
      valueClass: 'val',
      defaultValue: '0'
    }),
    createWalletInfoRow({
      iconNode: createImageIcon({ src: 'img/icon_gold.png' }),
      valueId: 'walletGold',
      valueClass: 'val-gold',
      defaultValue: '0'
    }),
    createWalletInfoRow({
      iconNode: createImageIcon({ src: 'img/icon_silver.png' }),
      valueId: 'walletSilver',
      valueClass: 'val-silver',
      defaultValue: '0'
    })
  );
}

function renderWalletInfoHeader(infoRoot, { compactLabel = null, actionLabel = null, actionName = null }) {
  if (compactLabel) {
    const row = document.createElement('div');
    row.className = 'wallet-info-row';
    row.style.fontSize = '10px';
    row.style.opacity = '0.6';
    row.textContent = compactLabel;
    infoRoot.append(row);
    return;
  }

  if (actionLabel && actionName) {
    const row = document.createElement('div');
    row.className = 'wallet-info-row';
    const btn = document.createElement('button');
    btn.className = 'link-btn';
    btn.dataset.action = actionName;
    btn.textContent = actionLabel;
    row.append(btn);
    infoRoot.append(row);
  }
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
    bindWalletInfoActions(info);
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
    bindWalletInfoActions(info);
    if (DOM.storeBtn) DOM.storeBtn.classList.remove("menu-hidden");

  } else {
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    btn.onclick = connectWalletAuth;
    btn.style.cursor = '';
    info.classList.remove("visible");
    info.innerHTML = "";
    if (DOM.storeBtn) DOM.storeBtn.classList.add("menu-hidden");
  }
}

async function initAuth() {
  if (BACKEND_DISABLED) {
    if (isTelegramMiniApp()) {
      telegramUser = getTelegramUserData();
      clearRuntimeConfig();
      authMode = 'telegram';
      primaryId = telegramUser?.id || 'telegram-offline';
      linkedWallet = getStoredOfflineWalletAddress();
      isWalletConnected = true;
      userWallet = linkedWallet || primaryId;
      console.log('🧪 Offline Telegram auth:', primaryId);
      updateAuthUI();
      await runPostAuthSync();
      return;
    }

    authMode = null;
    console.log('🧪 Offline browser mode — wallet auth available without backend');
    updateAuthUI();
    return;
  }

  if (isTelegramMiniApp()) {
    telegramUser = getTelegramUserData();
    console.log("📱 Telegram mode:", telegramUser);

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
        authMode = "telegram";
        primaryId = data.primaryId;
        linkedWallet = data.wallet;
        isWalletConnected = true;
        userWallet = data.primaryId;
        console.log("✅ Telegram auth OK:", primaryId);
        updateAuthUI();
        await runPostAuthSync();
      }
    } catch (e) {
      console.error("❌ Telegram auth error:", e);
    }
  } else {
    authMode = null;
    console.log("🌐 Browser mode — wallet auth");
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
    const safeCode = escapeHtml(code);
    const botLink = `https://t.me/${encodeURIComponent(botUsername)}`;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'linkTelegramOverlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
    `;

    overlay.innerHTML = `
      <div style="
        background: #1a1a2e; border-radius: 16px; padding: 32px;
        max-width: 360px; width: 90%; text-align: center;
        border: 1px solid rgba(255,255,255,0.1); color: #fff;
        font-family: sans-serif;
      ">
        <div style="font-size: 24px; margin-bottom: 12px;">🔗 Link Telegram</div>
        <div style="font-size: 14px; color: #aaa; margin-bottom: 20px;">
          Your verification code:
        </div>
        <div id="linkCode" style="
          font-size: 36px; font-weight: bold; letter-spacing: 6px;
          background: #0f3460; padding: 16px; border-radius: 12px;
          cursor: pointer; user-select: all; margin-bottom: 8px;
          transition: background 0.2s;
        ">${safeCode}</div>
        <div id="linkCodeHint" style="font-size: 12px; color: #888; margin-bottom: 20px;">
          👆 Tap to copy
        </div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 20px; line-height: 1.6;">
          1. Copy the code above<br>
          2. Send it to <a href="${botLink}" target="_blank" style="
            color: #4fc3f7; text-decoration: none; font-weight: bold;
          ">@${escapeHtml(botUsername)}</a><br>
          3. Done! ✅
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 20px;">
          ⏰ Code expires in 10 minutes
        </div>
        <a href="${botLink}" target="_blank" style="
          display: inline-block; background: #0088cc; color: #fff;
          padding: 12px 32px; border-radius: 8px; font-size: 16px;
          text-decoration: none; font-weight: bold; margin-bottom: 12px;
        ">📱 Open @${escapeHtml(botUsername)}</a>
        <br>
        <button id="linkTelegramCloseBtn" style="
          background: none; border: 1px solid #555; color: #aaa;
          padding: 8px 24px; border-radius: 8px; cursor: pointer;
          font-size: 14px; margin-top: 8px;
        ">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('linkTelegramCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.remove();
      });
    }

    // Copy on click
    const codeEl = document.getElementById('linkCode');
    const hintEl = document.getElementById('linkCodeHint');

    codeEl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        codeEl.style.background = '#1a5c2a';
        hintEl.textContent = '✅ Copied!';
        setTimeout(() => {
          codeEl.style.background = '#0f3460';
          hintEl.textContent = '👆 Tap to copy';
        }, 2000);
      } catch (e) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        hintEl.textContent = '✅ Copied!';
        setTimeout(() => { hintEl.textContent = '👆 Tap to copy'; }, 2000);
      }
    });

    // Close on overlay click (not inner box)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

  } catch (e) {
    console.error("❌ Link telegram error:", e);
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
      linkedWallet = data.wallet;
      primaryId = data.primaryId;
      userWallet = String(data.wallet || walletAddress || data.primaryId || "").toLowerCase() || null;
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
    console.error("❌ Link wallet error:", e);
  } finally {
    isWalletLinkInProgress = false;
  }
}

export {
  isTelegramAuthMode,
  isWalletAuthMode,
  hasWalletAuthSession,
  hasAuthenticatedSession,
  getPrimaryAuthIdentifier,
  getSigningWalletAddress,
  getTelegramAuthIdentifier,
  getLeaderboardIdentity,
  getLeaderboardWalletAddress,
  setAuthCallbacks,
  isTelegramMiniApp,
  getTelegramUserData,
  connectWalletAuth,
  disconnectAuth,
  connectWallet,
  disconnectWallet,
  updateAuthUI,
  initAuth,
  linkTelegram,
  linkWallet
};
