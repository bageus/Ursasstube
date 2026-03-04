/* ===== RIDES SYSTEM ===== */

let playerRides = {
  freeRides: 3,
  paidRides: 0,
  totalRides: 3,
  resetInMs: 0,
  resetInFormatted: "Ready"
};

async function loadPlayerRides() {
  if (!isAuthenticated()) return;
  const identifier = getAuthIdentifier();
  try {
    const response = await fetch(`${BACKEND_URL}/api/store/rides/${identifier}`);
    const data = await response.json();
    if (response.ok) {
      playerRides = data;
      console.log("🎟 Rides:", playerRides);
    }
  } catch (e) {
    console.error("❌ Error loading rides:", e);
  }
}

async function useRide() {
  if (!isAuthenticated()) return true;
  const identifier = getAuthIdentifier();
  try {
    const response = await fetch(`${BACKEND_URL}/api/store/use-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: identifier })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      playerRides = data.rides;
      updateRidesDisplay();
      console.log(`🎟 Ride used. Remaining: ${playerRides.totalRides}`);
      return true;
    } else {
      playerRides = data.rides || playerRides;
      updateRidesDisplay();
      return false;
    }
  } catch (e) {
    console.error("❌ Error consuming ride:", e);
    return true;
  }
}

function updateRidesDisplay() {
  const ridesInfo = document.getElementById("ridesInfo");
  if (!ridesInfo) return;

  if (!isAuthenticated()) {
    ridesInfo.style.display = "none";
    return;
  }

  ridesInfo.style.display = "flex";

  const total = playerRides.totalRides;
  const free = playerRides.freeRides;
  const paid = playerRides.paidRides;

  const ridesText = document.getElementById("ridesText");
  const ridesTimer = document.getElementById("ridesTimer");

  if (ridesText) {
    ridesText.textContent = `🎟 ${total} ride${total === 1 ? '' : 's'}`;
    if (paid > 0) {
      ridesText.textContent += ` (${free} free + ${paid} purchased)`;
    }
  }

  if (ridesTimer) {
    if (free < 3 && playerRides.resetInMs > 0) {
      ridesTimer.textContent = `⏰ Resets in ${playerRides.resetInFormatted}`;
      ridesTimer.style.display = "";
    } else {
      ridesTimer.style.display = "none";
    }
  }

  const startBtn = document.getElementById("startBtn");
  if (startBtn) {
    if (total <= 0) {
      startBtn.style.opacity = "0.4";
      startBtn.style.pointerEvents = "none";
      startBtn.textContent = `NO RIDES (${playerRides.resetInFormatted})`;
    } else {
      startBtn.style.opacity = "";
      startBtn.style.pointerEvents = "";
      startBtn.textContent = "START GAME";
    }
  }
}

/* ===== STORE SYSTEM ===== */

let playerUpgrades = null;
let playerEffects = null;
let playerBalance = { gold: 0, silver: 0 };

async function loadPlayerUpgrades() {
  if (!isAuthenticated()) return;
  const identifier = getAuthIdentifier();
  try {
    const url = `${BACKEND_URL}/api/store/upgrades/${identifier}`;
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      playerUpgrades = data.upgrades;
      playerEffects = data.activeEffects;
      playerBalance = data.balance;
      if (data.rides) playerRides = data.rides;

      console.log("✅ Upgrades loaded:", playerUpgrades);
      console.log("✅ Effects:", playerEffects);
      console.log("✅ Balance:", playerBalance);
      console.log("🎟 Rides:", playerRides);
    }
  } catch (e) {
    console.error("❌ Error loading upgrades:", e);
  }
}


function updateStoreUI() {
  const goldEl = document.getElementById("storeGoldVal");
  const silverEl = document.getElementById("storeSilverVal");
  if (goldEl) goldEl.textContent = playerBalance.gold;
  if (silverEl) silverEl.textContent = playerBalance.silver;

  if (!playerUpgrades) return;

  const idMap = {
    x2_duration: 'x2',
    score_plus_mult: 'scoreplus',
    score_minus_mult: 'scoreminus',
    invert_score: 'invert',
    speed_up_mult: 'speedup',
    speed_down_mult: 'speeddown',
    magnet_duration: 'magnet',
    spin_cooldown: 'spincooldown'
  };

  for (const key in idMap) {
    const prefix = idMap[key];
    const data = playerUpgrades[key];
    if (!data) continue;

    for (let i = 0; i < data.maxLevel; i++) {
      const el = document.getElementById(`store-${prefix}-${i}`);
      if (!el) continue;

      el.classList.remove("purchased", "locked", "available");
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.onclick = null;

      if (i < data.currentLevel) {
        el.classList.add("purchased");
        el.style.pointerEvents = "none";
      } else if (i === data.currentLevel) {
        el.classList.add("available");
        const tierIndex = i;
        const upgradeKey = key;
        el.onclick = function() { buyUpgrade(upgradeKey, tierIndex); };
      } else {
        el.classList.add("locked");
        el.style.opacity = "0.25";
        el.style.pointerEvents = "none";
      }
    }
  }

  // Shield (permanent)
  const shieldBtn = document.getElementById("store-shield");
  if (shieldBtn && playerUpgrades.shield) {
    shieldBtn.classList.remove("purchased");
    shieldBtn.style.opacity = "";
    shieldBtn.style.pointerEvents = "";
    shieldBtn.onclick = null;

    if (playerUpgrades.shield.currentLevel >= 1) {
      shieldBtn.classList.add("purchased");
      shieldBtn.innerHTML = "✅ Purchased permanently";
      shieldBtn.style.pointerEvents = "none";
    } else {
      shieldBtn.onclick = function() { buyUpgrade('shield', 0); };
      shieldBtn.innerHTML = '🛡 Buy — <img src="img/icon_gold.png" style="width: 14px; height: 14px; vertical-align: middle;"> 10';
    }
  }

  // Rides pack
  const ridesBtn = document.getElementById("store-rides_pack");
  if (ridesBtn) {
    ridesBtn.classList.remove("purchased");
    ridesBtn.style.opacity = "";
    ridesBtn.style.pointerEvents = "";

    const free = playerRides.freeRides || 0;
    const paid = playerRides.paidRides || 0;
    const total = playerRides.totalRides || 0;

    let ridesLabel = `🎟 Rides: ${total}`;
    if (paid > 0) ridesLabel += ` (${free} free + ${paid} purchased)`;
    if (free < 3 && playerRides.resetInMs > 0) {
      ridesLabel += ` | ⏰ ${playerRides.resetInFormatted}`;
    }

    ridesBtn.innerHTML = ridesLabel + ' | Buy +3 — <img src="img/icon_gold.png" style="width: 14px; height: 14px; vertical-align: middle;"> 10';
    ridesBtn.onclick = function() { buyUpgrade('rides_pack', 0); };
  }
}

async function buyUpgrade(key, tier) {
  if (!isAuthenticated()) {
    alert("🔗 Authentication required!");
    return;
  }

  const identifier = getAuthIdentifier();
  try {
    const timestamp = Date.now();
    const message = `Buy upgrade\nWallet: ${identifier.toLowerCase()}\nUpgrade: ${key}\nTier: ${tier}\nTimestamp: ${timestamp}`;

    const signature = await signMessage(message);
    if (!signature) {
      alert("❌ Failed to sign transaction");
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/store/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wallet": identifier },
      body: JSON.stringify({ wallet: identifier, upgradeKey: key, tier, signature, timestamp })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      if (data.rides) {
        playerRides = data.rides;
        updateRidesDisplay();
      }

      console.log("✅ Purchase success:", data.message);

      playerBalance = data.balance;
      playerEffects = data.activeEffects;

      await loadPlayerUpgrades();
      updateStoreUI();

      const goldEl = document.getElementById("walletGold");
      const silverEl = document.getElementById("walletSilver");
      if (goldEl) goldEl.textContent = playerBalance.gold;
      if (silverEl) silverEl.textContent = playerBalance.silver;
    } else {
      alert(`❌ ${data.error}`);
    }
  } catch (error) {
    console.error("❌ Purchase error:", error);
    alert("❌ Network error");
  }
}

