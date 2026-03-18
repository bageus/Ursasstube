import { CONFIG } from './config.js';
import { isAuthenticated, saveResultToLeaderboard, loadAndDisplayLeaderboard } from './api.js';
import { audioManager, toggleSfxMute, toggleMusicMute, syncAllAudioUI, restoreAudioSettings, initAudioToggles } from './audio.js';
import { DOM, gameState, curves, player, obstacles, bonuses, coins, spinTargets, ctx, inputQueue } from './state.js';
import { resetGameSessionState, update } from './physics.js';
import { resizeCanvas, drawTube, drawTubeDepth, drawTubeCenter, drawSpeedLines, drawNeonLines, drawObjects, drawCoins, drawPlayer, drawTubeBezel, drawRadarHints, drawSpinAlert, drawBonusText } from './renderer.js';
import { particlePool, spawnParticles, updateParticles, drawParticles } from './particles.js';
import { assetManager } from './assets.js';
import { showBonusText, showStore, hideStore, updateUI } from './ui.js';
import { loadPlayerRides, playerRides, useRide, updateRidesDisplay, playerEffects, playerUpgrades, showRules, hideRules, buyUpgrade } from './store.js';
import { perfMonitor } from './perf.js';
import { initAuth, isTelegramMiniApp, connectWalletAuth, disconnectAuth, getAuthState } from './auth.js';

/* ===== GAME FUNCTIONS ===== */

let { bestScore = 0, bestDistance = 0 } = window;
// Cached background gradient — recreated only on resize
let _cachedBgGrad = null;

const CRASH_FLYER_SRC = "img/bear_pixel_transparent.webp";
const CRASH_FLYER_FALLBACK_SRC = "img/bear.png";
const CRASH_FLY_DEFAULT_DURATION_MS = 6000;
const START_TRANSITION_STATIC_EYES_SRC = "img/startgame/eyes_1.webp";
const MENU_EYES_STATIC_SRC = "img/eyes.png";

let { isWalletConnected: authIsWalletConnected = false, authMode: authCurrentMode = null } = getAuthState();

function syncAuthGlobals() {
  ({ isWalletConnected: authIsWalletConnected = false, authMode: authCurrentMode = null } = getAuthState());
}

function getCanvasDimensions() {
  const fallbackW = DOM.canvas?.clientWidth || window.innerWidth || 360;
  const fallbackH = DOM.canvas?.clientHeight || window.innerHeight || 640;
  const width = Number.isFinite(window.canvasW) && window.canvasW > 0 ? window.canvasW : fallbackW;
  const height = Number.isFinite(window.canvasH) && window.canvasH > 0 ? window.canvasH : fallbackH;
  return { width, height };
}

function bindUiEventHandlers() {
  const actionHandlers = {
    "toggle-sfx": toggleSfxMute,
    "toggle-music": toggleMusicMute,
    "show-store": showStore,
    "start-game": startGame
  };

  document.querySelectorAll("[data-action]").forEach((el) => {
    const handler = actionHandlers[el.dataset.action];
    if (handler) el.addEventListener("click", handler);
  });

  const rulesLink = document.getElementById("rulesLink");
  if (rulesLink) rulesLink.addEventListener("click", showRules);

  const restartBtn = document.getElementById("restartBtn");
  if (restartBtn) restartBtn.addEventListener("click", restartFromGameOver);

  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) menuBtn.addEventListener("click", goToMainMenu);

  const storeBackBtn = document.getElementById("storeBackBtn");
  if (storeBackBtn) storeBackBtn.addEventListener("click", hideStore);

  const rulesBackBtn = document.getElementById("rulesBackBtn");
  if (rulesBackBtn) rulesBackBtn.addEventListener("click", hideRules);

  document.querySelectorAll("[data-upgrade-key][data-upgrade-tier]").forEach((el) => {
    el.addEventListener("click", () => {
      buyUpgrade(el.dataset.upgradeKey, Number(el.dataset.upgradeTier));
    });
  });
}

function stopMenuLaunchAnimation() {
  document.body.classList.remove("start-launching");
  DOM.gameStart.classList.remove("start-launching");

  const menuEyes = document.getElementById("menuEyes");
  if (menuEyes) {
    menuEyes.src = MENU_EYES_STATIC_SRC;
  }
}

function playMenuLaunchAnimation() {
  stopMenuLaunchAnimation();

  document.body.classList.add("start-launching");
  DOM.gameStart.classList.add("start-launching");
}

function stopStartTransitionAnimation() {
  const darkScreen = document.getElementById("darkScreen");
  if (!darkScreen) return;

  darkScreen.classList.remove("start-transition-active");

  const eyes = document.getElementById("startTransitionEyes");
  if (eyes) {
    eyes.src = START_TRANSITION_STATIC_EYES_SRC;
  }
}

function playStartTransitionAnimation() {
  stopStartTransitionAnimation();

  const darkScreen = document.getElementById("darkScreen");
  const eyes = document.getElementById("startTransitionEyes");
  if (!darkScreen || !eyes) return;

  darkScreen.classList.add("start-transition-active");
  eyes.src = START_TRANSITION_STATIC_EYES_SRC;
}

function stopGameOverCrashAnimation() {
  stopStartTransitionAnimation();

  const darkScreen = document.getElementById("darkScreen");
  if (!darkScreen) return;
  darkScreen.classList.remove("gameover-transition");

  const flyer = document.getElementById("crashFlyer");
  if (flyer) {
    flyer.classList.remove("active");
    flyer.style.animation = "none";
  }
}

function playGameOverCrashAnimation(durationMs = CRASH_FLY_DEFAULT_DURATION_MS) {
  const darkScreen = document.getElementById("darkScreen");
  if (!darkScreen) return;

  darkScreen.classList.add("gameover-transition");

  let flyer = document.getElementById("crashFlyer");
  if (!flyer) {
    flyer = document.createElement("img");
    flyer.id = "crashFlyer";
    flyer.className = "crash-flyer";
    flyer.width = 128;
    flyer.height = 128;
    flyer.alt = "";
    flyer.decoding = "async";
    flyer.onerror = () => {
      if (!flyer.dataset.fallbackApplied) {
        flyer.dataset.fallbackApplied = "1";
        flyer.src = CRASH_FLYER_FALLBACK_SRC;
      }
    };
    darkScreen.appendChild(flyer);
  }

  flyer.dataset.fallbackApplied = "";
  flyer.src = CRASH_FLYER_SRC;
  flyer.classList.remove("active");
  flyer.style.animation = "none";
  void flyer.offsetWidth;
  const safeDuration = Math.max(1200, durationMs | 0);
  darkScreen.style.setProperty("--crash-fly-duration", `${safeDuration}ms`);

  flyer.style.animation = "";
  flyer.classList.add("active");
}

function areAllAssetsReady() {
  if (!assetManager.isReady()) return false;

  const criticalAssets = [
    'coins_gold', 'coins_silver',
    'obstacles_1', 'obstacles_2', 'obstacles_3',
    'bonus_shield', 'bonus_speed', 'bonus_magnet', 'bonus_chkey',
    'bonus_score_plus', 'bonus_score_minus', 'bonus_recharge',
    'character_back_idle', 'character_left_idle', 'character_right_idle',
    'character_left_swipe', 'character_right_swipe', 'character_spin'
  ];

  for (const name of criticalAssets) {
    if (!assetManager.getAsset(name)) return false;
  }
  return true;
}

async function startGame() {
  if (!areAllAssetsReady()) {
    showBonusText("⏳ Loading sprites...");
    setTimeout(startGame, 500);
    return;
  }

  // Check rides BEFORE dark screen (only if connected)
  if (isAuthenticated()) {
    await loadPlayerRides();

    if (playerRides.totalRides <= 0) {
      audioManager.stopSFX("gameover_screen");
      DOM.gameOver.classList.remove("visible");
      document.getElementById("gameContainer").classList.remove("active");

      DOM.gameStart.classList.remove("hidden");
      document.getElementById("audioTogglesGlobal").style.display = "flex";
      document.getElementById("walletCorner").style.display = "flex";
      document.getElementById("darkScreen").style.display = "none";

      updateRidesDisplay();
      alert(`🎟 No rides!\n⏰ Resets in ${playerRides.resetInFormatted}\n\n💰 Buy a ride pack in the Store!`);
      return;
    }

    const canPlay = await useRide();
    if (!canPlay) {
      audioManager.stopSFX("gameover_screen");
      DOM.gameOver.classList.remove("visible");
      document.getElementById("gameContainer").classList.remove("active");

      DOM.gameStart.classList.remove("hidden");
      document.getElementById("audioTogglesGlobal").style.display = "flex";
      document.getElementById("walletCorner").style.display = "flex";
      document.getElementById("darkScreen").style.display = "none";

      updateRidesDisplay();
      alert(`🎟 No rides!\n⏰ ${playerRides.resetInFormatted}\n\n💰 Buy a pack in the Store!`);
      return;
    }
  }

  // Ride consumed — launch the game
  console.log("▶️ Starting game...");
  audioManager.stopAll();

  DOM.gameOver.classList.remove("visible");
  DOM.gameStart.classList.remove("hidden");
  document.getElementById("gameContainer").classList.remove("active");
  document.getElementById("audioTogglesGlobal").style.display = "flex";
  document.getElementById("walletCorner").style.display = "flex";
  playMenuLaunchAnimation();
  
  audioManager.playSFX("gamestart");

  const onEnd = () => {
    audioManager.sfx.gamestart.removeEventListener("ended", onEnd);
    stopMenuLaunchAnimation();
    actualStartGame();
  };
  audioManager.sfx.gamestart.addEventListener("ended", onEnd);

  setTimeout(() => {
    if (!gameState.running) {
      audioManager.sfx.gamestart.removeEventListener("ended", onEnd);
      stopMenuLaunchAnimation();
      actualStartGame();
    }
  }, 5000);
}

function actualStartGame() {
  if (gameState.running) return;
  
  stopMenuLaunchAnimation();

  document.getElementById("gameContainer").classList.add("active");
  document.getElementById("walletCorner").style.display = "none";
  document.getElementById("audioTogglesGlobal").style.display = "none";

  // Двойной requestAnimationFrame — гарантирует что layout пересчитался
  // после display: none → display: flex
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resizeCanvas();

      resetGameSessionState();

      DOM.gameOver.classList.remove("visible");
      DOM.gameStart.classList.add("hidden");
      document.getElementById("storeScreen").classList.remove("visible");

      gameState.running = true;
      gameState.distance = 0;
      gameState.score = 0;
      gameState.speed = CONFIG.SPEED_START;
      gameState.baseMultiplier = 1;
      gameState.silverCoins = 0;
      gameState.goldCoins = 0;
      gameState.curveTimer = 0;
      gameState.lastTime = performance.now();

      gameState.lastObstacleDistance = 0;
      gameState.lastBonusDistance = 0;
      gameState.lastCoinSpawnDistance = 0;
      gameState.lastObstacleSpawnDistance = 0;

      curves.current.direction = 0;
      curves.current.strength = 0;
      curves.next.direction = Math.random() * Math.PI * 2;
      curves.next.strength = 0.5 + Math.random() * 0.5;

      player.lane = 0;
      player.targetLane = 0;
      player.shield = false;
      player.shieldCount = 0;

      obstacles.length = 0;
      bonuses.length = 0;
      coins.length = 0;
      spinTargets.length = 0;
      particlePool.clear();

      // Apply player upgrades
      if (playerEffects) {
        const maxShieldByEffect = Math.max(
          Number(playerEffects.max_shield_count || 0),
          Number(playerEffects.shield_max_count || 0),
          Number(playerEffects.max_shields || 0)
        );
        const shieldLevel = Number(playerEffects.shield_level || playerUpgrades?.shield?.currentLevel || 0);
        const maxShieldByLevel = shieldLevel >= 3 ? 3 : (shieldLevel >= 2 ? 2 : 1);
        const maxShieldCount = Math.max(1, maxShieldByEffect || maxShieldByLevel);

        const startShieldCountRaw = Number(playerEffects.start_shield_count || 0);
        const hasStartShield = Boolean(playerEffects.start_with_shield) || shieldLevel >= 1 || startShieldCountRaw > 0;

        if (hasStartShield) {
          player.shieldCount = Math.max(1, Math.min(startShieldCountRaw || 1, maxShieldCount));
          player.shield = player.shieldCount > 0;
          console.log(`🛡 Start with ${player.shieldCount} shield(s), max ${maxShieldCount}`);
        }
        gameState.spinCooldownReduction = playerEffects.spin_cooldown_reduction || 0;
        gameState.invertScoreMultiplier = 1.0;
        const radarByEffect = Boolean(playerEffects.radar_active);
        const radarByUpgrade = Number(playerUpgrades?.radar?.currentLevel || 0) >= 1;
        gameState.radarActive = radarByEffect || radarByUpgrade;

        const rawSpinAlertEffect = String(playerEffects.spin_alert_level || '').trim().toLowerCase();
        let spinAlertByEffect = Number(playerEffects.spin_alert_level || 0);
        if (!Number.isFinite(spinAlertByEffect) || spinAlertByEffect <= 0) {
          if (['perfect', 'pro', 'perfect_alert', 'perfectalert', 'tier2', 'level2'].includes(rawSpinAlertEffect)) {
            spinAlertByEffect = 2;
          } else if (['alert', 'basic', 'tier1', 'level1', 'enabled', 'active', 'true'].includes(rawSpinAlertEffect)) {
            spinAlertByEffect = 1;
          } else {
            spinAlertByEffect = 0;
          }
        }
        const spinAlertByUpgrade = Number(playerUpgrades?.spin_alert?.currentLevel || 0);
        gameState.spinAlertLevel = Math.max(spinAlertByEffect, spinAlertByUpgrade);

        console.log("✅ Upgrades applied:", {
          shieldCount: player.shieldCount,
          spinCooldownReduction: gameState.spinCooldownReduction,
          x2_duration_bonus: playerEffects.x2_duration_bonus || 0,
          magnet_duration_bonus: playerEffects.magnet_duration_bonus || 0,
          score_plus_300_multiplier: playerEffects.score_plus_300_multiplier || 1.0,
          score_plus_500_multiplier: playerEffects.score_plus_500_multiplier || 1.0,
          score_minus_300_multiplier: playerEffects.score_minus_300_multiplier || 1.0,
          score_minus_500_multiplier: playerEffects.score_minus_500_multiplier || 1.0,
          invert_score_multiplier: playerEffects.invert_score_multiplier || 1.0,
          speed_up_multiplier: playerEffects.speed_up_multiplier || 1.0,
          speed_down_multiplier: playerEffects.speed_down_multiplier || 1.0,
          radarActive: gameState.radarActive,
          spinAlertLevel: gameState.spinAlertLevel
        });
      } else {
        gameState.spinCooldownReduction = 0;
        gameState.invertScoreMultiplier = 1.0;
        gameState.radarActive = false;
        gameState.spinAlertLevel = 0;
        console.log("⚪ No upgrades (wallet not connected or data not loaded)");
      }

      audioManager.playRandomGameMusic();

      // Подстраховочные resize на случай если layout ещё не стабилизировался
      // (Telegram WebView, медленные устройства, iOS Safari)
      [100, 300, 600, 1000, 2000, 3000].forEach(delay => {
        setTimeout(() => { resizeCanvas(); }, delay);
      });

      console.log("✅ Game started!");
    });
  });
}

function restartFromGameOver() {
  audioManager.stopSFX("gameover_screen");
  startGame();
}

function endGame(reason = "Unknown") {
  const { width: canvasW, height: canvasH } = getCanvasDimensions();
  resetGameSessionState();
  gameState.running = false;
  audioManager.stopMusic();

  spawnParticles(canvasW / 2, canvasH / 2, "rgba(255, 0, 0, 1)", 30, 12);

  if ("vibrate" in navigator) {
    navigator.vibrate([100, 50, 100, 50, 200]);
  }

  const reasonMap = {
    pit: "Pit",
    spikes: "Spikes",
    bottles: "Bottles",
    wall_brick: "Brick wall",
    wall_kactus: "Cactus wall",
    tree: "Tree",
    rock1: "Rock",
    rock2: "Rock",
    fence: "Fence",
    bull: "Bull",
    spawn_error: "Generation error",
  };
  const prettyReason = reasonMap[reason] || reason;

  if (gameState.score > bestScore) {
    bestScore = gameState.score;
    localStorage.setItem("bestScore", bestScore);
  }
  if (gameState.distance > bestDistance) {
    bestDistance = gameState.distance;
    localStorage.setItem("bestDistance", bestDistance);
  }

  saveResultToLeaderboard();

  const duration = ((gameState.distance / gameState.speed / 50) / 60).toFixed(1);
  const darkScreen = document.getElementById("darkScreen");
  darkScreen.style.display = "block";
  const sfxDurationMs = Math.round((audioManager.sfx.gameover && Number.isFinite(audioManager.sfx.gameover.duration) ? audioManager.sfx.gameover.duration : 0) * 1000);
  const crashAnimDurationMs = sfxDurationMs > 0 ? sfxDurationMs : CRASH_FLY_DEFAULT_DURATION_MS;
  playGameOverCrashAnimation(crashAnimDurationMs);

  const showResult = () => {
    stopGameOverCrashAnimation();
    darkScreen.style.display = "none";

    document.getElementById("goReason").textContent = prettyReason;
    document.getElementById("goDistance").textContent = Math.floor(gameState.distance) + " m";
    document.getElementById("goScore").textContent = Math.floor(gameState.score);
    document.getElementById("goGold").textContent = gameState.goldCoins;
    document.getElementById("goSilver").textContent = gameState.silverCoins;
    document.getElementById("goTime").textContent = duration + "s";

    loadAndDisplayLeaderboard();

    document.getElementById("gameContainer").classList.remove("active");
    document.getElementById("audioTogglesGlobal").style.display = "none";
    document.getElementById("walletCorner").style.display = "none";

    DOM.gameOver.classList.add("visible");
    syncAllAudioUI();
    audioManager.playSFX("gameover_screen");
  };

  audioManager.playSFX("gameover");

  const onEnd = () => {
    audioManager.sfx.gameover.removeEventListener("ended", onEnd);
    showResult();
  };
  audioManager.sfx.gameover.addEventListener("ended", onEnd);
  
  const resultFallbackMs = Math.max(CRASH_FLY_DEFAULT_DURATION_MS, crashAnimDurationMs);
  setTimeout(() => {
    audioManager.sfx.gameover.removeEventListener("ended", onEnd);
    if (!DOM.gameOver.classList.contains("visible")) showResult();
  }, resultFallbackMs);
}

function goToMainMenu() {
  console.log("🏠 Return to main menu");
  audioManager.stopAll();
  stopMenuLaunchAnimation();
  
  DOM.gameOver.classList.remove("visible");
  DOM.gameStart.classList.remove("hidden");
  document.getElementById("storeScreen").classList.remove("visible");
  document.getElementById("gameContainer").classList.remove("active");
  document.getElementById("audioTogglesGlobal").style.display = "flex";
  document.getElementById("walletCorner").style.display = "flex";

  gameState.running = false;

  obstacles.length = 0;
  bonuses.length = 0;
  coins.length = 0;
  spinTargets.length = 0;
  particlePool.clear();
  inputQueue.length = 0;

  player.lane = 0;
  player.targetLane = 0;
  player.shield = false;
  player.shieldCount = 0;
  player.magnetActive = false;
  player.invertActive = false;
  player.isSpin = false;
  gameState.spinActive = false;
  gameState.spinProgress = 0;
  gameState.spinCooldown = 0;

  resetGameSessionState();
  audioManager.playMusic("menu");

  if (authIsWalletConnected) {
    loadPlayerRides().then(() => updateRidesDisplay());
  }

  console.log("✅ State reset");
}

/* ===== GAME LOOP ===== */

async function gameLoop(time) {
  const { width: canvasW, height: canvasH } = getCanvasDimensions();
   // Если canvas всё ещё 0×0, попробовать resize
  if (DOM.canvas.width === 0 || DOM.canvas.height === 0) {
    resizeCanvas();
  }
  if (!assetManager.isReady()) {
    const progress = assetManager.getProgress();
    ctx.clearRect(0, 0, canvasW, canvasH);

    const bgGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    bgGrad.addColorStop(0, "#0a0a15");
    bgGrad.addColorStop(1, "#15080f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = "#c084fc";
    ctx.font = "bold 28px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Ursas Tube", canvasW / 2, canvasH * 0.38);

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Orbitron, Arial";
    ctx.textBaseline = "middle";
    ctx.fillText("⏳ Loading...", canvasW / 2, canvasH * 0.5);

    const barWidth = canvasW * 0.35;
    const barHeight = 25;
    const barX = canvasW / 2 - barWidth / 2;
    const barY = canvasH * 0.55;

    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 3;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "#c084fc";
    ctx.fillRect(barX + 3, barY + 3, (barWidth - 6) * (progress / 100), barHeight - 6);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.floor(progress)}%`, canvasW / 2, barY + barHeight / 2);

    requestAnimationFrame(gameLoop);
    return;
  }

  let delta = 0;
  if (gameState.lastTime === 0) {
    gameState.lastTime = time;
    delta = 1 / 60;
  } else {
    delta = (time - gameState.lastTime) / 1000;
    delta = Math.min(delta, 0.016);
    delta = Math.max(delta, 0.001);
  }
  gameState.lastTime = time;

  perfMonitor.updateFPS();

  ctx.clearRect(0, 0, canvasW, canvasH);

  if (!_cachedBgGrad) {
    _cachedBgGrad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    _cachedBgGrad.addColorStop(0, "#0a0a15");
    _cachedBgGrad.addColorStop(1, "#15080f");
  }
  ctx.fillStyle = _cachedBgGrad;
  ctx.fillRect(0, 0, canvasW, canvasH);

  try {
    drawTube();
    drawTubeDepth();
    drawTubeCenter();
    drawSpeedLines();
    drawNeonLines();
    drawObjects();
    drawCoins();
    drawPlayer();
    drawParticles();
    // Disabled per UX request: remove late-run vignette/edge bands in the tube view.
    drawTubeBezel();
    drawRadarHints();
    drawSpinAlert();
  } catch (e) {
    console.error("❌ Draw error:", e);
  }

  if (gameState.running) {
    try {
      update(delta);
      updateParticles();
    } catch (e) {
      console.error("❌ Update error:", e);
      endGame("Error: " + e.message);
      requestAnimationFrame(gameLoop);
      return;
    }
  }

  try {
    drawBonusText();
    updateUI();
  } catch (e) {
    console.error("❌ UI error:", e);
  }

  requestAnimationFrame(gameLoop);

}

/* ===== INITIALIZATION ===== */

async function initGame() {
  console.log("🎮 Initializing game...");

  bindUiEventHandlers();

  // Telegram Mini App
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.setHeaderColor('#05030b');
    tg.setBackgroundColor('#05030b');
    tg.ready();
    tg.isClosingConfirmationEnabled = true;
    tg.onEvent('viewportChanged', (event) => {
      // Only resize on stable state to avoid excessive reflows during transitions
      if (event.isStateStable) {
        resizeCanvas();
      }
    });
    console.log("✅ Telegram Mini App ready");
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resizeCanvas();
    }
  });

  // Load assets
  try {
    await assetManager.loadAll();
    if (!assetManager.isReady()) throw new Error("AssetManager not ready");
    console.log("✅ All assets loaded!");
    
    // Load bezel assets in background so metal/light tube rings become visible
    // without blocking game startup.
    assetManager.loadDeferred()
      .then(() => console.log("✅ Deferred bezel assets loaded"))
      .catch((e) => console.warn("⚠️ Deferred bezel assets failed:", e));
  } catch (error) {
    console.error("❌ Asset loading error:", error);
    alert("❌ Failed to load game. Please reload the page.");
    return;
  }

  // Audio
  console.log("🔊 Initializing audio...");
  audioManager.init();
  console.log("✅ Audio ready");

  // Settings
  console.log("⚙️ Restoring settings...");
  restoreAudioSettings();
  initAudioToggles();

  // Auth
  console.log("🔐 Authenticating...");
  await initAuth();
  syncAuthGlobals();

  // Wallet button — in browser connects wallet, in Telegram already authorized
  if (!isTelegramMiniApp()) {
    DOM.walletBtn.onclick = connectWalletAuth;
  }

  // Leaderboard
  console.log("📊 Loading leaderboard...");
  try {
    await loadAndDisplayLeaderboard();
    console.log("✅ Leaderboard loaded");
  } catch (error) {
    console.warn("⚠️ Leaderboard loading error:", error);
  }

  // Store
  syncAuthGlobals();
  if (!authIsWalletConnected && DOM.storeBtn) {
    DOM.storeBtn.classList.add("menu-hidden");
  }

  // Rides
  syncAuthGlobals();
  if (authIsWalletConnected) {
    updateRidesDisplay();
  }

  // Menu music
  audioManager.playMusic("menu");

  // Canvas
  resizeCanvas();

  // Game loop
  console.log("▶️ Starting main loop...");
  requestAnimationFrame(gameLoop);

  // MetaMask events (browser only)
  if (window.ethereum) {
    console.log("🔗 Subscribing to MetaMask events...");
    window.ethereum.on('accountsChanged', (accounts) => {
      console.log("🔄 Account changed");
      syncAuthGlobals();
      if (accounts.length === 0) {
        disconnectAuth();
      } else if (authCurrentMode === "wallet") {
        disconnectAuth();
        connectWalletAuth();
      }
    });
    window.ethereum.on('chainChanged', () => {
      console.log("⛓️ Network changed — reloading");
      location.reload();
    });
  }

  // Ping (for connected players)
  setInterval(() => {
    syncAuthGlobals();
    if (authIsWalletConnected && gameState.running) perfMonitor.measurePing();
  }, 5000);

  setTimeout(() => {
    syncAuthGlobals();
    if (authIsWalletConnected) perfMonitor.measurePing();
  }, 2000);

  console.log("✅ Game fully initialized!");
}

function onDomReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

onDomReady(() => {
  console.log("📄 DOM loaded");
  resizeCanvas();
  initGame();
});

window.addEventListener('resize', () => {
  resizeCanvas();
});

Object.assign(window, { endGame });
