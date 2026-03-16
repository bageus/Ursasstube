/* ===== RIDES SYSTEM ===== */

const ICON_TICKET = '<span class="icon-atlas" style="width:28px;height:28px;background-size:140px auto;background-position:-84px -28px"></span>';
const ICON_CLOCK = '<span class="icon-atlas" style="width:28px;height:28px;background-size:140px auto;background-position:-56px -28px"></span>';
const ICON_RADAR = '<span class="icon-atlas" style="width:28px;height:28px;background-size:140px auto;background-position:-112px 0px"></span>';

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
     ridesInfo.classList.remove("visible");
    ridesInfo.setAttribute("aria-hidden", "true");
    return;
  }

  ridesInfo.classList.add("visible");
  ridesInfo.setAttribute("aria-hidden", "false");

  const total = playerRides.totalRides;
  const free = playerRides.freeRides;
  const paid = playerRides.paidRides;

  const ridesText = document.getElementById("ridesText");
  const ridesTimer = document.getElementById("ridesTimer");

  if (ridesText) {
    ridesText.innerHTML = `${ICON_TICKET} ${total} ride${total === 1 ? '' : 's'}`;
    if (paid > 0) {
      ridesText.innerHTML += ` (${free} free + ${paid} purchased)`;
    }
  }

  if (ridesTimer) {
    if (free < 3 && playerRides.resetInMs > 0) {
      ridesTimer.innerHTML = `${ICON_CLOCK} Resets in ${playerRides.resetInFormatted}`;
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
let isStoreDataLoading = false;

function isAlreadyPurchasedError(errorText = "") {
  const normalized = String(errorText).toLowerCase();
  return normalized.includes('already purchased') ||
    normalized.includes('already bought') ||
    normalized.includes('already owned');
}

function parseNumericLevel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function getTierElements(prefix) {
  return Array.from(document.querySelectorAll(`[id^="store-${prefix}-"]`))
    .filter((el) => /^\d+$/.test(el.id.split('-').pop()))
    .sort((a, b) => Number(a.id.split('-').pop()) - Number(b.id.split('-').pop()));
}

function getLevelFromUpgradeState(state = null) {
  if (!state || typeof state !== 'object') return 0;

  const directCandidates = [
    state.currentLevel,
    state.level,
    state.purchasedLevel,
    state.ownedLevel
  ];

  let bestLevel = directCandidates.reduce((best, candidate) => {
    return Math.max(best, parseNumericLevel(candidate));
  }, 0);

  const arrayCandidates = [
    state.purchasedTiers,
    state.ownedTiers,
    state.unlockedTiers
  ];

  for (const tiers of arrayCandidates) {
    if (!Array.isArray(tiers) || tiers.length === 0) continue;

    const numericTiers = tiers
      .map((tier) => parseNumericLevel(tier))
      .filter((tier) => Number.isFinite(tier));

    if (numericTiers.length === 0) continue;

    const highestTier = Math.max(...numericTiers);
    bestLevel = Math.max(bestLevel, highestTier + 1);
  }

  return bestLevel;
}

function getLevelFromEffects(upgradeKey) {
  if (!playerEffects) return 0;

  if (upgradeKey === 'shield') {
    const shieldCount = parseNumericLevel(playerEffects.start_shield_count);
    if (shieldCount > 0) return shieldCount;
    const shieldLevel = parseNumericLevel(playerEffects.shield_level);
    if (shieldLevel > 0) return shieldLevel;
    return playerEffects.start_with_shield ? 1 : 0;
  }

  if (upgradeKey === 'spin_alert') {
    const directLevel = parseNumericLevel(playerEffects.spin_alert_level);
    if (directLevel > 0) return directLevel;

    const spinAlertMode = String(playerEffects.spin_alert_mode || '').toLowerCase();
    if (spinAlertMode === 'perfect' || spinAlertMode === 'pro') return 2;
    if (spinAlertMode === 'alert' || spinAlertMode === 'basic') return 1;

    if (playerEffects.spin_alert_perfect || playerEffects.spin_alert_is_perfect) return 2;
    if (playerEffects.spin_alert_active || playerEffects.spin_alert) return 1;
  }

  return 0;
}

function getEffectiveUpgradeLevel(upgradeKey, upgradeState = null) {
  const state = upgradeState || (playerUpgrades && playerUpgrades[upgradeKey]) || null;
  const levelFromUpgrade = getLevelFromUpgradeState(state);
  const levelFromEffect = getLevelFromEffects(upgradeKey);

  return Math.max(levelFromUpgrade, levelFromEffect);
}


const STORE_UPGRADE_ID_MAP = {
  x2_duration: 'x2',
  score_plus_300_mult: 'scoreplus300',
  score_plus_500_mult: 'scoreplus500',
  score_minus_300_mult: 'scoreminus300',
  score_minus_500_mult: 'scoreminus500',
  invert_score: 'invert',
  speed_up_mult: 'speedup',
  speed_down_mult: 'speeddown',
  magnet_duration: 'magnet',
  spin_cooldown: 'spincooldown',
  shield: 'shield',
  spin_alert: 'spinalert'
};

function applyStoreDefaultLockState() {
  for (const [upgradeKey, prefix] of Object.entries(STORE_UPGRADE_ID_MAP)) {
    const tiers = getTierElements(prefix);

    tiers.forEach((el, i) => {
      el.classList.remove("purchased", "locked", "available");
      el.style.opacity = "";
      el.onclick = null;
      el.removeAttribute("onclick");

      if (i === 0) {
        el.classList.add("available");
        el.style.pointerEvents = "";
        const tierIndex = i;
        el.onclick = function() { buyUpgrade(upgradeKey, tierIndex); };
      } else {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
    });
  }
}

async function loadPlayerUpgrades() {
  if (!isAuthenticated()) return;
  const identifier = getAuthIdentifier();
  isStoreDataLoading = true;
  try {
    const url = `${BACKEND_URL}/api/store/upgrades/${identifier}`;
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      playerUpgrades = data.upgrades;
      playerEffects = data.activeEffects;
      playerBalance = data.balance;
      if (data.rides) playerRides = data.rides;

           // Some gold upgrades can be reflected first in active effects and only
      // later synchronized into upgrades.currentLevel. Normalize these levels
      // so UI state and clickability match what backend enforces.
      if (playerUpgrades) {
        for (const key of ['shield', 'spin_alert']) {
          if (!playerUpgrades[key]) continue;
          const rawLevel = getLevelFromUpgradeState(playerUpgrades[key]);
          const effectiveLevel = getEffectiveUpgradeLevel(key, playerUpgrades[key]);
          playerUpgrades[key].currentLevel = effectiveLevel;

          if (effectiveLevel !== rawLevel) {
            console.warn(`⚠️ ${key} level normalized from ${rawLevel} to ${effectiveLevel}`, {
              upgrade: playerUpgrades[key],
              activeEffects: playerEffects
            });
          }
        }
      }

      console.log("✅ Upgrades loaded:", playerUpgrades);
      console.log("✅ Effects:", playerEffects);
      console.log("✅ Balance:", playerBalance);
      console.log("🎟 Rides:", playerRides);
    }
  } catch (e) {
    console.error("❌ Error loading upgrades:", e);
  } finally {
    isStoreDataLoading = false;
  }
}


function updateStoreUI() {
  const goldEl = document.getElementById("storeGoldVal");
  const silverEl = document.getElementById("storeSilverVal");
  if (goldEl) goldEl.textContent = playerBalance.gold;
  if (silverEl) silverEl.textContent = playerBalance.silver;

  if (!playerUpgrades) return;

  const shieldDescription = document.getElementById("store-shield-description");
  if (shieldDescription && playerUpgrades.shield) {
    const shieldDescriptionText = playerUpgrades.shield.currentLevel >= 1
      ? "accumulate shield bonus"
      : "start every rides with shield bonus";
    shieldDescription.innerHTML = `<span class="icon-atlas" style="width:28px;height:28px;background-size:140px auto;background-position:-84px 0px"></span> Shield — ${shieldDescriptionText}`;
  }

  for (const key in STORE_UPGRADE_ID_MAP) {
    const prefix = STORE_UPGRADE_ID_MAP[key];
    const data = playerUpgrades[key];
    if (!data) continue;

    const tierElements = getTierElements(prefix);

    const currentLevel = getEffectiveUpgradeLevel(key, data);
    const maxLevel = tierElements.length || Number(data.maxLevel || 0);

    for (let i = 0; i < maxLevel; i++) {
      const el = tierElements[i] || document.getElementById(`store-${prefix}-${i}`);
      if (!el) {
        continue;
      }

      el.classList.remove("purchased", "locked", "available");
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.onclick = null;
      el.removeAttribute("onclick");

      if (i < currentLevel) {
        el.classList.add("purchased");
        el.style.pointerEvents = "none";
      } else if (i === currentLevel) {
        el.classList.add("available");
        const tierIndex = i;
        const upgradeKey = key;
        el.onclick = function() { buyUpgrade(upgradeKey, tierIndex); };
      } else {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
    }
  }

  // Radar (single purchase, tier 0 only)
  const radarBtn = document.getElementById("store-radar");
  if (radarBtn && playerUpgrades.radar) {
    radarBtn.classList.remove("purchased");
    radarBtn.style.opacity = "";
    radarBtn.style.pointerEvents = "";
    radarBtn.onclick = null;

    if (playerUpgrades.radar.currentLevel >= 1) {
      radarBtn.classList.add("purchased");
      radarBtn.innerHTML = '✅ Purchased permanently';
      radarBtn.style.pointerEvents = "none";
    } else {
      radarBtn.onclick = function() { buyUpgrade('radar', 0); };
      radarBtn.innerHTML = `${ICON_RADAR} Buy — <img src="img/icon_gold.png" style="width: 14px; height: 14px; vertical-align: middle;"> 1`;
    }
  }

  // Rides pack
  const ridesBtn = document.getElementById("store-rides_pack");
  if (ridesBtn) {
    ridesBtn.classList.remove("purchased");
    ridesBtn.style.opacity = "";
    ridesBtn.style.pointerEvents = "";

    ridesBtn.innerHTML = '+3 rides — <img src="img/icon_gold.png" style="width: 14px; height: 14px; vertical-align: middle;"> 70';
    ridesBtn.onclick = function() { buyUpgrade('rides_pack', 0); };
  }
}

async function buyUpgrade(key, tier) {
  if (isStoreDataLoading) {
    alert("⏳ Store is loading, try again in a moment");
    return;
  }

  if (!isAuthenticated()) {
    alert("🔗 Authentication required!");
    return;
  }

  const upgradeState = playerUpgrades && playerUpgrades[key];
  if (upgradeState) {
    const expectedTier = getEffectiveUpgradeLevel(key, upgradeState);
    if (tier < expectedTier) {
      alert("❌ Already purchased (permanent)");
      return;
    }
    if (tier > expectedTier) {
      alert("⚠️ Buy previous level first");
      return;
    }
  }

  const identifier = getAuthIdentifier();
  try {
    const timestamp = Date.now();
    let requestData;

    if (authMode === "telegram") {
      requestData = {
        wallet: primaryId,
        upgradeKey: key,
        tier,
        timestamp,
        authMode: "telegram",
        telegramId: telegramUser.id
      };
    } else {
      const message = `Buy upgrade\nWallet: ${identifier.toLowerCase()}\nUpgrade: ${key}\nTier: ${tier}\nTimestamp: ${timestamp}`;
      const signature = await signMessage(message);
      if (!signature) {
        alert("❌ Failed to sign transaction");
        return;
      }
      requestData = {
        wallet: identifier,
        upgradeKey: key,
        tier,
        signature,
        timestamp
      };
    }

    const response = await fetch(`${BACKEND_URL}/api/store/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Wallet": primaryId || identifier },
      body: JSON.stringify(requestData)
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
      const serverError = data && data.error ? data.error : "Purchase failed";
      const isConflict = isAlreadyPurchasedError(serverError);

      if (isConflict) {
        console.warn("⚠️ Purchase conflict: UI state is stale, syncing store data", {
          upgradeKey: key,
          tier,
          error: serverError,
          upgradeState,
          activeEffects: playerEffects
        });
        await loadPlayerUpgrades();

        // Some backend versions return effect flags but don't update upgrades.currentLevel
        // immediately. Keep UI consistent with conflict response to avoid a dead button state.
        if (playerUpgrades && playerUpgrades[key]) {
          const syncedLevel = getEffectiveUpgradeLevel(key, playerUpgrades[key]);
          if (tier >= syncedLevel) {
            playerUpgrades[key].currentLevel = tier + 1;
          }
        }

        updateStoreUI();
      }

      alert(`❌ ${serverError}`);
    }
  } catch (error) {
    console.error("❌ Purchase error:", error);
    alert("❌ Network error");
  }
}


/* ===== RULES OVERLAY ===== */

function showRules() {
  const screen = document.getElementById("rulesScreen");
  if (screen) {
    screen.classList.add("visible");
    updateRulesAudioButtons();
  }
  const globalToggles = document.getElementById("audioTogglesGlobal");
  if (globalToggles) globalToggles.style.display = "none";
  const walletCorner = document.getElementById("walletCorner");
  if (walletCorner) walletCorner.style.display = "none";
}

function hideRules() {
  const screen = document.getElementById("rulesScreen");
  if (screen) screen.classList.remove("visible");
  const globalToggles = document.getElementById("audioTogglesGlobal");
  if (globalToggles) globalToggles.style.display = "flex";
  const walletCorner = document.getElementById("walletCorner");
  if (walletCorner) walletCorner.style.display = "flex";
}

function updateRulesAudioButtons() {
  if (typeof syncAllAudioUI === 'function') syncAllAudioUI();
}

document.addEventListener("DOMContentLoaded", applyStoreDefaultLockState);
