import { CONFIG, BONUS_TYPES } from './config.js';
import { player, gameState, spinTargets, obstacles, bonuses, coins, inputQueue, curves, getLaneCooldown, setLaneCooldown } from './state.js';
import { audioManager } from './audio.js';
import { spawnParticles } from './particles.js';
import { getGameplayUpgradeSnapshot, getShieldUpgradeSnapshot } from './store/upgrades-service.js';
import { showBonusText } from './ui.js';
import { project, projectPlayer, updatePlayerAnimation, getViewportCenter } from './game/projection.js';
import { endGame } from './game.js';
import { logger } from './logger.js';
import { createPhysicsSpawning } from './physics-spawning.js';
let laneCooldown = getLaneCooldown();
const COLLISION_REACTION_WINDOW_MS = 450, CAMERA_SHAKE_SMOOTHING = 12;
function resetGameSessionState() {
  player.shield = false;
  player.shieldCount = 0;
  player.magnetActive = false;
  player.magnetTimer = 0;
  player.invertActive = false;
  player.invertTimer = 0;
  player.isSpin = false;
  gameState.spinActive = false;
  gameState.spinProgress = 0;
  gameState.spinCooldown = 0;
  gameState.baseMultiplier = 1;
  gameState.x2Timer = 0;
  gameState.bonusText = "";
  gameState.bonusTextTimer = 0;
  player.frameIndex = 0;
  player.frameTimer = 0;
  player.state = "idle";
  gameState.radarHints = [];
  gameState.spinAlertTimer = 0;
  gameState.spinAlertCountdown = 0;
  gameState.spinAlertPendingDelay = -1;
  gameState.spinRingPendingCount = 0;
  gameState.perfectSpinWindow = false;
  gameState.perfectSpinWindowTimer = 0;
  gameState.lastSpinAlertRingDist = -999;
  gameState.spinComboCount = 0;
  gameState.spinComboRingActive = false;
  gameState.nextBonusRechargeBoost = 0;
  gameState.lastInputAtMs = 0;
  gameState.obstacleCollisionCount = 0;
  gameState.collisionWithoutReactionCount = 0;
  gameState.inputLatencySumMs = 0; gameState.inputLatencySampleCount = 0; gameState.inputTimestampQueue.length = 0;
  gameState.debugStats.tubeQuads = 0;
  gameState.debugStats.visibleObstacles = 0;
  gameState.debugStats.visibleBonuses = 0;
  gameState.debugStats.visibleCoins = 0;
  gameState.debugStats.visibleSpinTargets = 0;
  gameState.debugStats.estimatedTubePasses = 0;
  gameState.debugStats.tubeMs = 0;
  gameState.debugStats.drawMs = 0;
  gameState.debugStats.updateMs = 0;
  gameState.debugStats.uiMs = 0;
  gameState.debugStats.frameMs = 0;
  gameState.cameraShakeX = 0; gameState.cameraShakeY = 0;
  spinTargets.length = 0;
}
const {
  getSpacing,
  spawnBonus,
  spawnObstacle,
  spawnCoinPattern,
  queueCoinRingSpawn,
  resetSpinComboProgress,
  spawnCoinRing,
  spawnCoinCluster,
  startSpinAlertCycle,
} = createPhysicsSpawning({
  CONFIG,
  BONUS_TYPES,
  gameState,
  obstacles,
  bonuses,
  coins,
  spinTargets,
});
function update(delta) {
  if (!isFinite(gameState.speed) || gameState.speed < 0) { endGame("Speed error"); return; }
  if (!isFinite(gameState.distance) || gameState.distance < 0) { endGame("Distance error"); return; }
  gameState.deltaTime = delta;
  const speedLevel = Math.floor(gameState.distance / CONFIG.SPEED_INCREMENT_INTERVAL);
  const speedIncrementMultiplier = gameState.distance >= CONFIG.SPEED_INCREMENT_BOOST_DISTANCE
    ? CONFIG.SPEED_INCREMENT_BOOST_MULTIPLIER
    : 1;
  gameState.speed = Math.min(
    CONFIG.SPEED_START + speedLevel * CONFIG.SPEED_INCREMENT * speedIncrementMultiplier,
    CONFIG.SPEED_MAX
  );
  gameState.tubeVisualSpeed += (gameState.speed - gameState.tubeVisualSpeed) * Math.min(1, delta * 12);
  const normalizedVisualSpeed = gameState.tubeVisualSpeed / Math.max(CONFIG.SPEED_START, Number.EPSILON);
  gameState.tubeScroll += delta * (140 + normalizedVisualSpeed * 260);
  gameState.tubeRotation = 0;

  const METERS_PER_SECOND_MULT = 300;
  const metersDelta = gameState.speed * METERS_PER_SECOND_MULT * delta;
  gameState.distance += metersDelta;
  const basePointsPerMeter = 1;
  const speedFactor = gameState.speed / CONFIG.SPEED_START;
  let pointsPerMeter = basePointsPerMeter * speedFactor;
  if (player.invertActive && gameState.invertScoreMultiplier > 1) {
    pointsPerMeter *= gameState.invertScoreMultiplier;
  }

  gameState.score += metersDelta * pointsPerMeter;

  // Coin spawning
  const coinSpacing = getSpacing("coin");
  if (gameState.distance - gameState.lastCoinSpawnDistance > coinSpacing) {
    spawnCoinPattern();
    gameState.lastCoinSpawnDistance = gameState.distance;
  }

  // Coin ring every 100m
  if (Math.floor(gameState.distance / 100) > Math.floor((gameState.distance - metersDelta) / 100)) {
    queueCoinRingSpawn();
  }

  // Rare coin clusters
  if (Math.random() < 0.02 && coins.filter(c => c.type === "silver").length < 4) {
    spawnCoinCluster();
  }

  // Obstacle spawning
  const obstacleSpacing = getSpacing("obstacle");
  if (gameState.distance - gameState.lastObstacleDistance > obstacleSpacing) {
    spawnObstacle();
    gameState.lastObstacleDistance = gameState.distance;
    gameState.lastObstacleSpawnDistance = gameState.distance;
  }

  // Bonus spawning
  const bonusSpacing = getSpacing("bonus");
  if (gameState.distance - gameState.lastBonusDistance > bonusSpacing) {
    spawnBonus();
    gameState.lastBonusDistance = gameState.distance;
  }

  // Emergency check — no objects spawned for 600m
  if (gameState.distance - gameState.lastObstacleSpawnDistance > 600) {
    logger.error("❌ No objects spawned for 600m! Forced game end.");
    endGame("spawn_error");
    return;
  }

  // Move objects
  const ANIM_STEP = 1 / 10;
  const COIN_ANIM_STEP = 1 / 8;

  for (const o of obstacles) {
    if ((Number(o.spawnDelayRemaining) || 0) > 0) {
      o.spawnDelayRemaining = Math.max(0, Number(o.spawnDelayRemaining) - delta);
      continue;
    }

    o.z -= gameState.speed * 0.45;
    o.animAcc = (o.animAcc || 0) + delta;
    if (o.animAcc >= ANIM_STEP) { o.animAcc -= ANIM_STEP; o.animFrame = (o.animFrame || 0) + 1; }
  }

  for (const b of bonuses) {
    b.z -= gameState.speed * 0.45;
    b.animAcc = (b.animAcc || 0) + delta;
    if (b.animAcc >= ANIM_STEP) { b.animAcc -= ANIM_STEP; b.animFrame = (b.animFrame || 0) + 1; }
  }

  for (const c of coins) {
    c.z -= gameState.speed * 0.8;
    c.animAcc = (c.animAcc || 0) + delta;
    if (c.animAcc >= COIN_ANIM_STEP) { c.animAcc -= COIN_ANIM_STEP; c.animFrame = (c.animFrame || 0) + 1; }
  }

  for (const t of spinTargets) {
    t.z -= gameState.speed * 0.8;
  }

  // Remove off-screen objects
  for (let i = obstacles.length - 1; i >= 0; i--) { if (obstacles[i].z <= -0.1) obstacles.splice(i, 1); }
  for (let i = bonuses.length - 1; i >= 0; i--) { if (bonuses[i].z <= -0.1) bonuses.splice(i, 1); }
  for (let i = coins.length - 1; i >= 0; i--) { if (coins[i].z <= -0.1) coins.splice(i, 1); }
  for (let i = spinTargets.length - 1; i >= 0; i--) {
    if (spinTargets[i].z <= -0.1) {
      if (!spinTargets[i].collected) {
        resetSpinComboProgress();
      }
      spinTargets.splice(i, 1);
    }
  }

  // Radar hints — decrement timer
  for (let i = gameState.radarHints.length - 1; i >= 0; i--) {
    gameState.radarHints[i].timer -= delta;
    if (gameState.radarHints[i].timer <= 0) gameState.radarHints.splice(i, 1);
  }

  // Spin alert timers
  if (gameState.spinAlertTimer > 0) {
    gameState.spinAlertTimer -= delta;
    if (gameState.spinAlertTimer < 0) gameState.spinAlertTimer = 0;
  }
  if (gameState.spinAlertCountdown > 0) {
    gameState.spinAlertCountdown -= delta;
    if (gameState.spinAlertCountdown < 0) {
      gameState.spinAlertCountdown = 0;
    }
  }

  if (gameState.spinAlertPendingDelay >= 0) {
    gameState.spinAlertPendingDelay -= delta;
    if (gameState.spinAlertPendingDelay <= 0) {
      gameState.spinAlertPendingDelay = -1;

      if (gameState.spinRingPendingCount > 0) {
        spawnCoinRing();
        gameState.spinRingPendingCount -= 1;
      }

      if (gameState.spinAlertLevel >= 2) {
        gameState.perfectSpinWindow = true;
        gameState.perfectSpinWindowTimer = 0.5;
      }

      if (gameState.spinRingPendingCount > 0 && gameState.spinAlertLevel >= 1) {
        startSpinAlertCycle();
      }
    }
  }
  if (gameState.perfectSpinWindow) {
    gameState.perfectSpinWindowTimer -= delta;
    if (gameState.perfectSpinWindowTimer <= 0) {
      gameState.perfectSpinWindow = false;
      gameState.perfectSpinWindowTimer = 0;
    }
  }

  // Process input
  if (laneCooldown <= 0 && inputQueue.length > 0 && !player.isLaneTransition) {
    if (gameState.spinActive) {
      inputQueue.shift();
      gameState.inputTimestampQueue.shift();
    } else {
      const dir = inputQueue.shift();
      const inputQueuedAtMs = gameState.inputTimestampQueue.shift() || 0;
      const newLane = Math.max(-1, Math.min(1, player.lane + dir));
      if (newLane !== player.lane) {
        gameState.inputLatencySumMs += Math.max(0, Date.now() - Number(inputQueuedAtMs));
        gameState.inputLatencySampleCount += 1;
        player.lanePrev = player.lane;
        player.targetLane = newLane;
        player.laneAnimFrame = 0;
        player.isLaneTransition = true;
        player.state = "transition";
        player.frameIndex = 0;
        player.frameTimer = 0;
        laneCooldown = CONFIG.LANE_COOLDOWN_FRAMES;
      }
    }
  }

  if (laneCooldown > 0) laneCooldown--;
  setLaneCooldown(laneCooldown);

  // Lane transition animation
  if (player.isLaneTransition) {
    player.laneAnimFrame++;
    if (player.laneAnimFrame >= CONFIG.LANE_TRANSITION_FRAMES) {
      player.lane = player.targetLane;
      player.isLaneTransition = false;
      player.state = "idle";
      player.frameIndex = 0;
      player.frameTimer = 0;
      inputQueue.length = 0;
      gameState.inputTimestampQueue.length = 0;
    }
  }

  // Spin
  if (gameState.spinActive) {
    gameState.spinProgress += delta;
    player.state = "spin";
    if (gameState.spinProgress >= CONFIG.SPIN_DURATION) {
      gameState.spinActive = false;
      gameState.spinProgress = 0;
      player.isSpin = false;
      player.state = "idle";
      player.frameIndex = 0;
      player.frameTimer = 0;
    }
  }

  if (gameState.spinCooldown > 0) gameState.spinCooldown--;

  // Bonus timers
  if (player.magnetActive) {
    player.magnetTimer -= delta;
    if (player.magnetTimer <= 0) player.magnetActive = false;
  }

  if (player.invertActive) {
    player.invertTimer -= delta;
    if (player.invertTimer <= 0) player.invertActive = false;
  }

  if (gameState.baseMultiplier > 1) {
    gameState.x2Timer -= delta;
    if (gameState.x2Timer <= 0) gameState.baseMultiplier = 1;
  }

  // Player position
  const p = projectPlayer(CONFIG.PLAYER_Z);
  player.x = p.x - CONFIG.FRAME_SIZE / 2;
  player.y = p.y - CONFIG.FRAME_SIZE / 2;

  gameState.centerOffsetX = Math.cos(gameState.curveDirection) * gameState.tubeCurveStrength * CONFIG.TUBE_RADIUS * CONFIG.CURVE_OFFSET_X;
  gameState.centerOffsetY = Math.sin(gameState.curveDirection) * gameState.tubeCurveStrength * CONFIG.TUBE_RADIUS * CONFIG.CURVE_OFFSET_Y;

  // Camera shake from speed
  const speedRatio = (gameState.speed - CONFIG.SPEED_START) / (CONFIG.SPEED_MAX - CONFIG.SPEED_START);
  const shakeLerp = Math.min(1, delta * CAMERA_SHAKE_SMOOTHING);
  const shakeIntensity = speedRatio > 0.3 ? (speedRatio - 0.3) * 4 : 0;
  const shakeTargetX = (Math.random() - 0.5) * shakeIntensity;
  const shakeTargetY = (Math.random() - 0.5) * shakeIntensity;
  gameState.cameraShakeX += (shakeTargetX - gameState.cameraShakeX) * shakeLerp;
  gameState.cameraShakeY += (shakeTargetY - gameState.cameraShakeY) * shakeLerp;
  gameState.centerOffsetX += gameState.cameraShakeX;
  gameState.centerOffsetY += gameState.cameraShakeY;
  const collisionDepthMin = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP;
  const collisionDepthMax = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 2;
  const obstacleCollisionMin = collisionDepthMin - CONFIG.TUBE_Z_STEP * 0.2;
  const obstacleCollisionMax = collisionDepthMax + CONFIG.TUBE_Z_STEP * 0.2;
  const bonusCollisionMin = collisionDepthMin - CONFIG.TUBE_Z_STEP * 0.35;
  const bonusCollisionMax = collisionDepthMax + CONFIG.TUBE_Z_STEP * 0.35;
  const coinSpinCollisionMin = collisionDepthMin - CONFIG.TUBE_Z_STEP * 0.6;
  const coinSpinCollisionMax = collisionDepthMax + CONFIG.TUBE_Z_STEP * 0.6;
  const coinLaneCollisionMin = collisionDepthMin - CONFIG.TUBE_Z_STEP * 0.45;
  const coinLaneCollisionMax = collisionDepthMax + CONFIG.TUBE_Z_STEP * 0.45;

  // Collisions: obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if ((Number(o.spawnDelayRemaining) || 0) > 0) continue;
    if (o.z >= obstacleCollisionMin && o.z <= obstacleCollisionMax && o.lane === player.lane) {
      gameState.obstacleCollisionCount += 1;
      if (player.shieldCount > 0) {
        const shieldHitPoint = project(player.lane, CONFIG.PLAYER_Z);
        queueCollectAnimation({
          kind: 'shield_hit',
          x: shieldHitPoint?.x ?? getViewportCenter().x,
          y: shieldHitPoint?.y ?? getViewportCenter().y
        });
        audioManager.playSFX("energetic_shield");
        player.shieldCount--;
        player.shield = player.shieldCount > 0;
        obstacles.splice(i, 1);
      } else {
        if (Math.max(0, Date.now() - (Number(gameState.lastInputAtMs) || 0)) > COLLISION_REACTION_WINDOW_MS) gameState.collisionWithoutReactionCount += 1;
        endGame(o.subtype);
        return;
      }
    }
  }

  // Collisions: bonuses
  for (let i = bonuses.length - 1; i >= 0; i--) {
    const b = bonuses[i];
    if (b.z >= bonusCollisionMin && b.z <= bonusCollisionMax && b.lane === player.lane) {
      const bonusCollectPoint = typeof b.lane === "number" ? project(b.lane, b.z) : null;
      queueCollectAnimation({
        kind: 'bonus',
        x: bonusCollectPoint?.x ?? getViewportCenter().x,
        y: bonusCollectPoint?.y ?? getViewportCenter().y,
        bonusType: b.type
      });
      applyBonus(b);
      bonuses.splice(i, 1);
    }
  }

  // Collisions: coins
  const magnetActive = player.magnetActive;
  const playerPos = magnetActive ? projectPlayer(CONFIG.PLAYER_Z) : null;
  const magnetRangeSq = 150 * 150;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.collected) continue;
    if (c.z < -0.5) { coins.splice(i, 1); continue; }

    let shouldCollect = false;

    // Magnet
     if (magnetActive && playerPos && c.z > 0.05 && c.z < 1.5) {
      const cp = typeof c.lane === "number" ? project(c.lane, c.z) : null;
     if (cp) {
        const dx = cp.x - playerPos.x;
        const dy = cp.y - playerPos.y;
        if ((dx * dx + dy * dy) < magnetRangeSq) shouldCollect = true;
      }
    }

    // spinOnly coins — ONLY by spinning
    if (!shouldCollect && c.spinOnly && player.isSpin && c.z >= coinSpinCollisionMin && c.z <= coinSpinCollisionMax) {
      shouldCollect = true;
    }

    // isCircle coins (not spinOnly) — can also collect by spinning
    if (!shouldCollect && !c.spinOnly && player.isSpin && (c.isCircleInner || c.isCircle) && c.z >= coinSpinCollisionMin && c.z <= coinSpinCollisionMax) {
      shouldCollect = true;
    }

    // Normal lane coins
    if (!shouldCollect && !c.spinOnly && typeof c.lane === "number" && c.z >= coinLaneCollisionMin && c.z <= coinLaneCollisionMax && c.lane === player.lane) {
      shouldCollect = true;
    }

    if (shouldCollect) {
      collectCoin(c);
      coins.splice(i, 1);
    }
  }

  // Collisions: spin targets
  if (player.isSpin) {
    for (let i = spinTargets.length - 1; i >= 0; i--) {
      const t = spinTargets[i];
      if (t.collected) continue;
      if (t.z >= coinSpinCollisionMin && t.z <= coinSpinCollisionMax) {
        t.collected = true;
        gameState.spinComboRingActive = false;
        gameState.spinComboCount++;
        const comboLevel = Math.max(0, gameState.spinComboCount - 1);
        if (comboLevel > 0) {
          const comboTable = [0, 500, 1500, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
          const comboScore = comboTable[Math.min(comboLevel, comboTable.length - 1)];
          if (comboScore > 0) {
            gameState.score += comboScore * gameState.baseMultiplier;
            showBonusText(`🎯 Combo Lv.${comboLevel}! +${comboScore}`);
          }
        }
        gameState.nextBonusRechargeBoost = 28;
        audioManager.playSFX("coin");
        { const { x, y } = getViewportCenter(); spawnParticles(x, y, "rgba(255, 100, 50, 1)", 8, 5); }
        spinTargets.splice(i, 1);
      }
    }
  }

  // Character animation
  updatePlayerAnimation(delta);

  // Tube curves
  gameState.tubeWaveMod += 0.002;

  gameState.curveTimer += delta * 1000;
  const t = Math.min(1, gameState.curveTimer / gameState.curveTransitionDuration);
  const interp = (1 - Math.cos(Math.PI * t)) / 2;

  gameState.curveDirection = curves.current.direction * (1 - interp) + curves.next.direction * interp;
  gameState.tubeCurveStrength = curves.current.strength * (1 - interp) + curves.next.strength * interp;
  gameState.tubeCurveAngle = Math.cos(gameState.curveDirection) * gameState.tubeCurveStrength * CONFIG.MAX_CURVE_ANGLE;

  if (gameState.curveTimer >= gameState.curveTransitionDuration) {
    curves.current.direction = curves.next.direction;
    curves.current.strength = curves.next.strength;
    curves.next.direction = Math.random() * Math.PI * 2;
    curves.next.strength = 0.5 + Math.random() * 0.5;
    gameState.curveTransitionDuration = CONFIG.MIN_CURVE_TIME + Math.random() * (CONFIG.MAX_CURVE_TIME - CONFIG.MIN_CURVE_TIME);
    gameState.curveTimer = 0;
  }
}

function queueCollectAnimation({ kind = 'coin', x = 0, y = 0, coinType = null, bonusType = null } = {}) {
  gameState.collectAnimations.push({
    id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    x,
    y,
    coinType,
    bonusType
  });
}
/* ===== BONUS & COINS ===== */
function applyBonus(bonus) {
  const { effects: playerEffects, upgrades: playerUpgrades } = getGameplayUpgradeSnapshot();
  const eff = (key, def) => (playerEffects && playerEffects[key] !== undefined) ? playerEffects[key] : def;

  const bonusMap = {
    [BONUS_TYPES.SHIELD]: () => {
      const shieldSnapshot = getShieldUpgradeSnapshot(playerEffects, playerUpgrades);

      player.shieldCount = Math.min(player.shieldCount + 1, shieldSnapshot.maxShieldCount);
      player.shield = player.shieldCount > 0;
      showBonusText(`🛡 Shield! (${player.shieldCount})`);
      audioManager.playSFX("good_bonus");
      { const { x, y } = getViewportCenter(); spawnParticles(x, y, "rgba(100, 200, 255, 1)", 20, 8); }
    },
    [BONUS_TYPES.SPEED_DOWN]: () => {
      const mult = eff('speed_down_multiplier', 1.0);
      gameState.speed = Math.max(gameState.speed - 0.01 * mult, CONFIG.SPEED_MIN);
      showBonusText(`🐌 Slow! (x${mult})`);
      audioManager.playSFX("good_bonus");
    },
    [BONUS_TYPES.SPEED_UP]: () => {
      const mult = eff('speed_up_multiplier', 1.0);
      gameState.speed = Math.min(gameState.speed + 0.01 * mult, CONFIG.SPEED_MAX);
      showBonusText(`⚡ Speed! (x${mult})`);
      audioManager.playSFX("good_bonus");
    },
    [BONUS_TYPES.MAGNET]: () => {
      player.magnetActive = true;
      const bonus = eff('magnet_duration_bonus', 0);
      player.magnetTimer = 7 + bonus;
      showBonusText(`🧲 Magnet! ${7 + bonus}s`);
      audioManager.playSFX("good_bonus");
      { const { x, y } = getViewportCenter(); spawnParticles(x, y, "rgba(255, 100, 200, 1)", 15, 7); }
    },
    [BONUS_TYPES.INVERT]: () => {
      player.invertActive = true;
      player.invertTimer = 7;
      gameState.invertScoreMultiplier = eff('invert_score_multiplier', 1.0);
      showBonusText(`🔄 Inverted! (x${gameState.invertScoreMultiplier})`);
      audioManager.playSFX("bad_bonus");
    },
    [BONUS_TYPES.X2]: () => {
      gameState.baseMultiplier = 2;
      const bonus = eff('x2_duration_bonus', 0);
      gameState.x2Timer = 7 + bonus;
      showBonusText(`✖2 Score! ${7 + bonus}s`);
      audioManager.playSFX("good_bonus");
    },
    [BONUS_TYPES.SCORE_300]: () => {
      const mult = eff('score_plus_300_multiplier', 1.0);
      const points = Math.floor(300 * mult * gameState.baseMultiplier);
      gameState.score += points;
      showBonusText(`+${points}`);
      audioManager.playSFX("good_bonus");
    },
    [BONUS_TYPES.SCORE_500]: () => {
      const mult = eff('score_plus_500_multiplier', 1.0);
      const points = Math.floor(500 * mult * gameState.baseMultiplier);
      gameState.score += points;
      showBonusText(`+${points}`);
      audioManager.playSFX("good_bonus");
    },
    [BONUS_TYPES.SCORE_MINUS_300]: () => {
      const mult = eff('score_minus_300_multiplier', 1.0);
      const penalty = Math.floor(300 * mult);
      gameState.score = Math.max(0, gameState.score - penalty);
      showBonusText(`-${penalty} ❌`);
      audioManager.playSFX("bad_bonus");
      { const { x, y } = getViewportCenter(); spawnParticles(x, y, "rgba(255, 100, 100, 1)", 12, 6); }
    },
    [BONUS_TYPES.SCORE_MINUS_500]: () => {
      const mult = eff('score_minus_500_multiplier', 1.0);
      const penalty = Math.floor(500 * mult);
      gameState.score = Math.max(0, gameState.score - penalty);
      showBonusText(`-${penalty} ❌`);
      audioManager.playSFX("bad_bonus");
      { const { x, y } = getViewportCenter(); spawnParticles(x, y, "rgba(255, 100, 100, 1)", 12, 6); }
    },
    [BONUS_TYPES.RECHARGE]: () => {
      gameState.spinCooldown = 0;
      showBonusText("🔄 Spin Ready!");
      audioManager.playSFX("good_bonus");
      { const { x, y } = getViewportCenter(); spawnParticles(x, y, "rgba(0, 255, 200, 1)", 15, 7); }
    },
  };

  const handler = bonusMap[bonus.type];
  if (handler) handler();
}

function collectCoin(coin) {
  if (coin.collected) return;
  coin.collected = true;
  let { x: particleX, y: particleY } = getViewportCenter();
  if (coin.lane !== undefined) {
    const p = project(coin.lane, coin.z);
    if (p) { particleX = p.x; particleY = p.y; }
  }
  queueCollectAnimation({
    kind: 'coin',
    x: particleX,
    y: particleY,
    coinType: coin.type === 'silver' ? 'silver' : 'gold'
  });
  if (coin.type === "silver") {
    gameState.score += 10 * gameState.baseMultiplier;
    gameState.silverCoins++;
    audioManager.playSFX("coin");
    spawnParticles(particleX, particleY, "rgba(200, 200, 200, 1)", 8, 4);
  } else if (coin.type === "gold" || coin.type === "gold_spin") {
    gameState.score += 100 * gameState.baseMultiplier;
    gameState.goldCoins++;
    audioManager.playSFX("coin");
    spawnParticles(particleX, particleY, "rgba(255, 215, 0, 1)", 12, 6);
  }
}
export { resetGameSessionState, update, collectCoin };
