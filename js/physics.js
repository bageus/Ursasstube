import { CONFIG, BONUS_TYPES } from './config.js';
import { player, gameState, spinTargets, obstacles, bonuses, coins, inputQueue, DOM, curves, getLaneCooldown, setLaneCooldown } from './state.js';
import { audioManager } from './audio.js';
import { spawnParticles } from './particles.js';
import { playerEffects, playerUpgrades, getShieldUpgradeSnapshot } from './store.js';
import { showBonusText } from './ui.js';
import { project, projectPlayer, updatePlayerAnimation } from './renderer.js';
import { endGame } from './game.js';

let laneCooldown = getLaneCooldown();


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
  spinTargets.length = 0;
}

/* ===== SPAWN FUNCTIONS ===== */

function getSpacing(type) {
  let spacing;
  if (type === "obstacle") spacing = CONFIG.OBSTACLE_SPACING;
  else if (type === "bonus") spacing = CONFIG.BONUS_SPACING;
  else if (type === "coin") spacing = CONFIG.COIN_SPACING;
  else spacing = [30, 60, 120];
  
  if (type === "obstacle") {
      let base;
      if (gameState.distance < 1000) base = spacing[0];
      else if (gameState.distance < 2000) base = spacing[1];
      else base = spacing[2];
  
      // Increase obstacle spawn frequency at each milestone: 1000/2000/3000/4000m
      let freqMultiplier = 1;
      if (gameState.distance >= 1000) freqMultiplier *= 0.9;
      if (gameState.distance >= 2000) freqMultiplier *= 0.85;
      if (gameState.distance >= 3000) freqMultiplier *= 0.82;
      if (gameState.distance >= 4000) freqMultiplier *= 0.8;
  
      return Math.max(10, base * freqMultiplier);
    }

  if (gameState.distance < 1000) return spacing[0];
  if (gameState.distance < 2000) return spacing[1];
  return spacing[2];
}

function isLaneOccupied(lane, checkZ, zRange = 0.3) {
  return obstacles.some(o => o.lane === lane && Math.abs(o.z - checkZ) < zRange) ||
         bonuses.some(b => b.lane === lane && Math.abs(b.z - checkZ) < zRange);
}

function _pickWeightedBonus(weightMap) {
  const entries = Object.entries(weightMap);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return entries[entries.length - 1][0];
}

function spawnBonus() {
  if (bonuses.length >= CONFIG.MAX_BONUSES) return;

 // Base weights
  const weights = {
    [BONUS_TYPES.SHIELD]: 8,
    [BONUS_TYPES.SPEED_DOWN]: 7,
    [BONUS_TYPES.SPEED_UP]: 7,
    [BONUS_TYPES.MAGNET]: 8,
    [BONUS_TYPES.X2]: 10,
    [BONUS_TYPES.SCORE_500]: 10,
    [BONUS_TYPES.INVERT]: 10,
    [BONUS_TYPES.SCORE_300]: 12,
    [BONUS_TYPES.RECHARGE]: 13,
    [BONUS_TYPES.SCORE_MINUS_500]: 15
  };

  // After successful spin-combo hit: boost recharge chance for the next bonus spawn only
  if (gameState.nextBonusRechargeBoost > 0) {
    weights[BONUS_TYPES.RECHARGE] += gameState.nextBonusRechargeBoost;
    gameState.nextBonusRechargeBoost = 0;
  }

  // At 2000m+: increase shield and invert appearance rate
  if (gameState.distance >= 2000) {
    weights[BONUS_TYPES.SHIELD] += 7;
    weights[BONUS_TYPES.INVERT] += 8;
  }
  const type = _pickWeightedBonus(weights);
  
  const spawnZ = 1.65;
  let lane = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const testLane = CONFIG.LANES[Math.floor(Math.random() * 3)];
    if (!isLaneOccupied(testLane, spawnZ)) { lane = testLane; break; }
  }

  if (lane !== null) {
    bonuses.push({ lane, z: spawnZ, size: 27, type, animFrame: 0 });
  }
}

function spawnObstacle() {
  if (obstacles.length >= CONFIG.MAX_OBSTACLES) return;

  const types = ["pit", "spikes", "bottles", "wall_brick", "wall_kactus", "tree", "rock1", "rock2", "fence", "bull"];
  const subtype = types[Math.floor(Math.random() * types.length)];
  const spawnZ = 1.65;

  let groupSize = 1;
  if (gameState.distance >= 1000) groupSize = Math.random() < 0.6 ? 2 : 1;
  if (gameState.distance >= 2000) groupSize = Math.random() < 0.7 ? 3 : 2;

  const availableLanes = [...CONFIG.LANES];

  for (let i = 0; i < groupSize && availableLanes.length > 0; i++) {
    let foundLane = null;

    for (let attempt = 0; attempt < 3 && availableLanes.length > 0; attempt++) {
      const idx = Math.floor(Math.random() * availableLanes.length);
      const testLane = availableLanes[idx];
      if (!isLaneOccupied(testLane, spawnZ + i * 0.15)) {
        foundLane = testLane;
        availableLanes.splice(idx, 1);
        break;
      }
    }

    if (foundLane === null && availableLanes.length > 0) {
      foundLane = availableLanes.pop();
    }

    if (foundLane !== null) {
      obstacles.push({ lane: foundLane, z: spawnZ + i * 0.15, size: 39, subtype, animFrame: 0 });
    }
  }
}

function spawnCoinPattern() {
  const patterns = [spawnCoinLine, spawnCoinSnake, spawnCoinDiagonal];
  patterns[Math.floor(Math.random() * patterns.length)]();
}

function addRadarHintForGoldLane(lane) {
  if (!gameState.radarActive || !isFinite(lane)) return;
  const existingHint = gameState.radarHints.find(h => h.lane === lane);
  if (existingHint) {
    existingHint.timer = 1.8;
    existingHint.maxTimer = 1.8;
    return;
  }
  gameState.radarHints.push({ lane, z: 1.55, timer: 1.8, maxTimer: 1.8 });
}

function spawnCoinLine() {
  const lane = CONFIG.LANES[Math.floor(Math.random() * 3)];
  const hasGold = Math.random() < 0.3;
  if (hasGold) addRadarHintForGoldLane(lane);
  for (let i = 0; i < 3; i++) {
    coins.push({ type: i === 0 && hasGold ? "gold" : "silver", lane, z: 1.55 - i * 0.1, animFrame: 0 });
  }
}

function spawnCoinSnake() {
  const startLane = CONFIG.LANES[Math.floor(Math.random() * 3)];
  const hasGold = Math.random() < 0.3;
  if (hasGold) addRadarHintForGoldLane(startLane);
  coins.push({ type: hasGold ? "gold" : "silver", lane: startLane, z: 1.55, animFrame: 0 });
  coins.push({ type: "silver", lane: Math.max(-1, Math.min(1, startLane + (Math.random() < 0.5 ? -1 : 1))), z: 1.45, animFrame: 0 });
  coins.push({ type: "silver", lane: startLane, z: 1.35, animFrame: 0 });
}

function spawnCoinDiagonal() {
  const hasGold = Math.random() < 0.3;
  if (hasGold) addRadarHintForGoldLane(-1);
  [-1, 0, 1].forEach((lane, i) => {
    coins.push({ type: i === 0 && hasGold ? "gold" : "silver", lane, z: 1.55 - i * 0.1, animFrame: 0 });
  });
}

function startSpinAlertCycle() {
  gameState.spinAlertTimer = 3.0;
  // For Perfect tier: ring should appear right after the "1" tick (no dead pause)
  gameState.spinAlertPendingDelay = gameState.spinAlertLevel >= 2 ? 2.05 : 3.0;
  gameState.perfectSpinWindow = false;
  gameState.perfectSpinWindowTimer = 0;
  gameState.spinAlertCountdown = gameState.spinAlertLevel >= 2 ? 3.0 : 0;
}

function queueCoinRingSpawn() {
  if (gameState.spinAlertLevel >= 1) {
    gameState.spinRingPendingCount += 1;
    if (gameState.spinAlertPendingDelay < 0) {
      startSpinAlertCycle();
    }
    return;
  }
  spawnCoinRing();
}

function resetSpinComboProgress() {
  gameState.spinComboCount = 0;
  gameState.spinComboRingActive = false;
}

function spawnCoinRing() {
  if (gameState.spinComboRingActive) {
    resetSpinComboProgress();
  }
  const hasGold = Math.random() < 0.35;
  const spawnZ = 1.35;

  // Bottom — 3 coins on lanes (remain silver)
  CONFIG.LANES.forEach((lane, i) => {
    coins.push({ type: i === 1 && hasGold ? "gold" : "silver", lane, z: spawnZ, animFrame: 0, isCircle: true });
  });

  // Top — 3 coins (spin only) — now gold
  [Math.PI - 0.3, Math.PI, Math.PI + 0.3].forEach((angle) => {
    coins.push({ type: "gold", z: spawnZ, angle, radiusFactor: 0.65, isCircle: true, spinOnly: true, animFrame: 0 });
  });

  // Left — 3 coins (spin only) — now gold
  [Math.PI * 0.5 - 0.3, Math.PI * 0.5, Math.PI * 0.5 + 0.3].forEach((angle) => {
    coins.push({ type: "gold", z: spawnZ, angle, radiusFactor: 0.65, isCircle: true, spinOnly: true, animFrame: 0 });
  });

  // Right — 3 coins (spin only) — now gold
  [Math.PI * 1.5 - 0.3, Math.PI * 1.5, Math.PI * 1.5 + 0.3].forEach((angle) => {
    coins.push({ type: "gold", z: spawnZ, angle, radiusFactor: 0.65, isCircle: true, spinOnly: true, animFrame: 0 });
  });

  // Radar hint for gold lane coins
  if (hasGold) addRadarHintForGoldLane(0);

  // Spawn 1 combo target at random angle
  const angle = Math.random() * Math.PI * 2;
  spinTargets.push({ angle, z: spawnZ, radiusFactor: 0.65, collected: false, animFrame: 0 });
  gameState.spinComboRingActive = true;
}

function spawnCoinCluster() {
  const lane = CONFIG.LANES[Math.floor(Math.random() * 3)];
  const hasGold = Math.random() < 0.3;
  if (hasGold) addRadarHintForGoldLane(lane);
  const count = Math.random() < 0.5 ? 2 : 3;
  for (let i = 0; i < count; i++) {
    coins.push({ type: i === 0 && hasGold ? "gold" : "silver", lane, z: 1.5 - i * 0.08, animFrame: 0 });
  }
}


/* ===== UPDATE FUNCTION ===== */

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
    console.error("❌ No objects spawned for 600m! Forced game end.");
    endGame("spawn_error");
    return;
  }

  // Move objects
  const ANIM_STEP = 1 / 10;
  const COIN_ANIM_STEP = 1 / 8;

  for (const o of obstacles) {
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
    } else {
      const dir = inputQueue.shift();
      const newLane = Math.max(-1, Math.min(1, player.lane + dir));
      if (newLane !== player.lane) {
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
  if (speedRatio > 0.3) {
    const shakeIntensity = (speedRatio - 0.3) * 4;
    gameState.centerOffsetX += (Math.random() - 0.5) * shakeIntensity;
    gameState.centerOffsetY += (Math.random() - 0.5) * shakeIntensity;
  }
  
  // Collision depth: 1-2 cells in front of the player line.
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
    if (o.z >= obstacleCollisionMin && o.z <= obstacleCollisionMax && o.lane === player.lane) {
      if (player.shieldCount > 0) {
        player.shieldCount--;
        player.shield = player.shieldCount > 0;
        obstacles.splice(i, 1);
      } else {
        endGame(o.subtype);
        return;
      }
    }
  }

  // Collisions: bonuses
  for (let i = bonuses.length - 1; i >= 0; i--) {
    const b = bonuses[i];
    if (b.z >= bonusCollisionMin && b.z <= bonusCollisionMax && b.lane === player.lane) {
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
        spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(255, 100, 50, 1)", 8, 5);
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


/* ===== BONUS & COINS ===== */

function applyBonus(bonus) {
  const eff = (key, def) => (playerEffects && playerEffects[key] !== undefined) ? playerEffects[key] : def;

  const bonusMap = {
    [BONUS_TYPES.SHIELD]: () => {
      const shieldSnapshot = getShieldUpgradeSnapshot(playerEffects, playerUpgrades);

      player.shieldCount = Math.min(player.shieldCount + 1, shieldSnapshot.maxShieldCount);
      player.shield = player.shieldCount > 0;
      showBonusText(`🛡 Shield! (${player.shieldCount})`);
      audioManager.playSFX("good_bonus");
      spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(100, 200, 255, 1)", 20, 8);
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
      spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(255, 100, 200, 1)", 15, 7);
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
      spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(255, 100, 100, 1)", 12, 6);
    },
    [BONUS_TYPES.SCORE_MINUS_500]: () => {
      const mult = eff('score_minus_500_multiplier', 1.0);
      const penalty = Math.floor(500 * mult);
      gameState.score = Math.max(0, gameState.score - penalty);
      showBonusText(`-${penalty} ❌`);
      audioManager.playSFX("bad_bonus");
      spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(255, 100, 100, 1)", 12, 6);
    },
    [BONUS_TYPES.RECHARGE]: () => {
      gameState.spinCooldown = 0;
      showBonusText("🔄 Spin Ready!");
      audioManager.playSFX("good_bonus");
      spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(0, 255, 200, 1)", 15, 7);
    },
  };

  const handler = bonusMap[bonus.type];
  if (handler) handler();
}

function collectCoin(coin) {
  if (coin.collected) return;
  coin.collected = true;

  let particleX = DOM.canvas.width / 2;
  let particleY = DOM.canvas.height / 2;

  if (coin.lane !== undefined) {
    const p = project(coin.lane, coin.z);
    if (p) { particleX = p.x; particleY = p.y; }
  }

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

export { resetGameSessionState, update, applyBonus, collectCoin };
