
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

    const response = await fetch(`${BACKEND_URL}/api/account/auth/wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress, signature, timestamp })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      authMode = "wallet";
      primaryId = data.primaryId;
      userWallet = data.primaryId;
      isWalletConnected = true;
      linkedTelegramId = data.telegramId;
      linkedTelegramUsername = data.telegramUsername || null;
      if (window.ethereum) {
        web3 = new ethers.providers.Web3Provider(window.ethereum);
      }

      console.log("✅ Wallet auth OK:", primaryId);

      updateAuthUI();
      await updateWalletUI();
      await loadPlayerUpgrades();
      await loadAndDisplayLeaderboard();
      updateRidesDisplay();

      if (DOM.storeBtn) DOM.storeBtn.style.display = "";
    }
  } catch (error) {
    console.error("❌ Wallet auth error:", error);
    if (error.code === 4001) alert("❌ Request rejected");
    else alert(`❌ Error: ${error.message}`);
  }
}

function disconnectAuth() {
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
  if (DOM.storeBtn) DOM.storeBtn.style.display = "none";

  updateAuthUI();
  console.log("🔌 Disconnected");
}

// Backward compatibility aliases
function connectWallet() { return connectWalletAuth(); }
function disconnectWallet() { return disconnectAuth(); }

function createWalletStatRow(iconMarkup, valueId, valueClass, initialValue) {
  const row = document.createElement("div");
  row.className = "wallet-info-row";

  const iconWrap = document.createElement("span");
  iconWrap.innerHTML = iconMarkup;
  row.appendChild(iconWrap.firstElementChild);

  row.append(" ");

  const value = document.createElement("span");
  value.className = valueClass;
  value.id = valueId;
  value.textContent = initialValue;
  row.appendChild(value);

  return row;
}

function renderWalletInfo(infoEl, { mode, linkedWalletValue, linkedTelegramIdValue, linkedTelegramUsernameValue }) {
  infoEl.textContent = "";

  const linkRow = document.createElement("div");
  linkRow.className = "wallet-info-row";

  if (mode === "telegram" && linkedWalletValue) {
    linkRow.style.fontSize = "10px";
    linkRow.style.opacity = "0.6";
    linkRow.textContent = `${linkedWalletValue.slice(0, 6)}...${linkedWalletValue.slice(-4)}`;
  } else if (mode === "telegram") {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.textContent = " Link Wallet";
    btn.addEventListener("click", linkWallet);
    linkRow.appendChild(btn);
  } else if (mode === "wallet" && linkedTelegramIdValue) {
    const tgDisplay = linkedTelegramUsernameValue ? `@${linkedTelegramUsernameValue}` : `TG#${linkedTelegramIdValue}`;
    linkRow.style.fontSize = "10px";
    linkRow.style.opacity = "0.6";
    linkRow.textContent = tgDisplay;
  } else if (mode === "wallet") {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.textContent = " Link Telegram";
    btn.addEventListener("click", linkTelegram);
    linkRow.appendChild(btn);
  }

  infoEl.appendChild(linkRow);
  infoEl.appendChild(createWalletStatRow('<span class="icon-atlas" style="width:16px;height:16px;background-size:80px auto;background-position:-16px 0px"></span>', 'walletRank', 'val', '—'));
  infoEl.appendChild(createWalletStatRow('<span class="icon-atlas" style="width:16px;height:16px;background-size:80px auto;background-position:-64px -16px"></span>', 'walletBest', 'val', '0'));
  infoEl.appendChild(createWalletStatRow('<img src="img/icon_gold.png">', 'walletGold', 'val-gold', '0'));
  infoEl.appendChild(createWalletStatRow('<img src="img/icon_silver.png">', 'walletSilver', 'val-silver', '0'));
}

function updateAuthUI() {
  const btn = DOM.walletBtn;
  const info = DOM.walletInfo;

  if (authMode === "telegram") {
    btn.textContent = telegramUser ? telegramUser.displayName : `TG#${primaryId}`;
    btn.classList.add("connected");
    btn.onclick = null;
    btn.style.cursor = 'default';
    info.classList.add("visible");

    renderWalletInfo(info, { mode: "telegram", linkedWalletValue: linkedWallet });
    if (DOM.storeBtn) DOM.storeBtn.style.display = "";

  } else if (authMode === "wallet") {
    const addr = primaryId;
    btn.textContent = addr.startsWith("0x") ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
    btn.classList.add("connected");
    btn.onclick = disconnectAuth;
    btn.style.cursor = '';
    info.classList.add("visible");

    renderWalletInfo(info, {
      mode: "wallet",
      linkedTelegramIdValue: linkedTelegramId,
      linkedTelegramUsernameValue: linkedTelegramUsername
    });
    if (DOM.storeBtn) DOM.storeBtn.style.display = "";

  } else {
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    btn.onclick = connectWalletAuth;
    btn.style.cursor = '';
    info.classList.remove("visible");
    info.innerHTML = "";
    if (DOM.storeBtn) DOM.storeBtn.style.display = "none";
  }
}

async function initAuth() {
  if (isTelegramMiniApp()) {
    telegramUser = getTelegramUserData();
    console.log("📱 Telegram mode:", telegramUser);

    try {
      const response = await fetch(`${BACKEND_URL}/api/account/auth/telegram`, {
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
        authMode = "telegram";
        primaryId = data.primaryId;
        linkedWallet = data.wallet;
        isWalletConnected = true;
        userWallet = data.primaryId;

        console.log("✅ Telegram auth OK:", primaryId);
        updateAuthUI();
        await updateWalletUI();
        await loadPlayerUpgrades();
        await loadAndDisplayLeaderboard();
        updateRidesDisplay();
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
    const response = await fetch(`${BACKEND_URL}/api/account/link/request-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert(`❌ ${data.error || 'Failed to generate code'}`);
      return;
    }

    const code = String(data.code);
    const botUsernameRaw = String(data.botUsername || 'Ursasstube_bot');
    const botUsername = botUsernameRaw.replace(/[^a-zA-Z0-9_]/g, '');
    const botLink = `https://t.me/${botUsername}`;

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
        ">${code}</div>
        <div id="linkCodeHint" style="font-size: 12px; color: #888; margin-bottom: 20px;">
          👆 Tap to copy
        </div>
        <div style="font-size: 14px; color: #ccc; margin-bottom: 20px; line-height: 1.6;">
          1. Copy the code above<br>
           2. Send it to <a href="${botLink}" target="_blank" rel="noopener noreferrer" style="
            color: #4fc3f7; text-decoration: none; font-weight: bold;
          ">@${botUsername}</a><br>
          3. Done! ✅
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 20px;">
          ⏰ Code expires in 10 minutes
        </div>
        <a href="${botLink}" target="_blank" rel="noopener noreferrer" style="
          display: inline-block; background: #0088cc; color: #fff;
          padding: 12px 32px; border-radius: 8px; font-size: 16px;
          text-decoration: none; font-weight: bold; margin-bottom: 12px;
        ">📱 Open @${botUsername}</a>
        <br>
        <button onclick="document.getElementById('linkTelegramOverlay').remove()" style="
          background: none; border: 1px solid #555; color: #aaa;
          padding: 8px 24px; border-radius: 8px; cursor: pointer;
          font-size: 14px; margin-top: 8px;
        ">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);

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
  if (authMode !== "telegram" || !primaryId) return;

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

    const response = await fetch(`${BACKEND_URL}/api/account/link/wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId, wallet: walletAddress, signature, timestamp })
    });

    const data = await response.json();

    if (data.success) {
      linkedWallet = data.wallet;
      primaryId = data.primaryId;
      userWallet = data.primaryId;

      if (data.merged) {
        alert(`✅ Accounts merged!\nMaster: score ${data.masterScore}\nSlave score ${data.slaveScoreWas} — reset`);
      } else {
        alert("✅ Wallet linked!");
      }

      updateAuthUI();
      await updateWalletUI();
      await loadPlayerUpgrades();
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (e) {
    console.error("❌ Link wallet error:", e);
  }
}
