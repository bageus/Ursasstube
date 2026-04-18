function createPhysicsSpawning({
  CONFIG,
  BONUS_TYPES,
  gameState,
  obstacles,
  bonuses,
  coins,
  spinTargets,
}) {
  function getSpacing(type) {
    let spacing;
    if (type === 'obstacle') spacing = CONFIG.OBSTACLE_SPACING;
    else if (type === 'bonus') spacing = CONFIG.BONUS_SPACING;
    else if (type === 'coin') spacing = CONFIG.COIN_SPACING;
    else spacing = [30, 60, 120];

    if (type === 'obstacle') {
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
    return obstacles.some((o) => o.lane === lane && Math.abs(o.z - checkZ) < zRange)
      || bonuses.some((b) => b.lane === lane && Math.abs(b.z - checkZ) < zRange);
  }

  function pickWeightedBonus(weightMap) {
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
    const type = pickWeightedBonus(weights);

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

    const types = ['pit', 'spikes', 'bottles', 'wall_brick', 'wall_kactus', 'tree', 'rock1', 'rock2', 'fence', 'bull'];
    const subtype = types[Math.floor(Math.random() * types.length)];
    const obstacleRadarEnabled = Boolean(gameState.radarObstaclesActive);
    const spawnDelaySeconds = obstacleRadarEnabled ? (2 + Math.random()) : 0;
    // Projection clamps far-depth scale for z >= ~0.95, so spawn radar-preview obstacles
    // just inside that threshold to keep them visibly inside the tube.
    const radarVisibleSpawnZ = 0.9;
    // Without radar obstacles upgrade, keep spawn close enough so obstacles
    // immediately enter active motion instead of looking like a deep "preview".
    const regularSpawnZ = 1.12;
    const spawnZ = obstacleRadarEnabled ? radarVisibleSpawnZ : regularSpawnZ;

    let groupSize = 1;
    if (gameState.distance >= 1000) groupSize = Math.random() < 0.6 ? 2 : 1;
    if (gameState.distance >= 2000) groupSize = Math.random() < 0.7 ? 3 : 2;

    const availableLanes = [...CONFIG.LANES];

    for (let i = 0; i < groupSize && availableLanes.length > 0; i++) {
      let foundLane = null;

      for (let attempt = 0; attempt < 3 && availableLanes.length > 0; attempt++) {
        const idx = Math.floor(Math.random() * availableLanes.length);
        const testLane = availableLanes[idx];
        const obstacleZ = obstacleRadarEnabled
          ? spawnZ - i * 0.08
          : spawnZ + i * 0.06;
        if (!isLaneOccupied(testLane, obstacleZ)) {
          foundLane = testLane;
          availableLanes.splice(idx, 1);
          break;
        }
      }

      if (foundLane === null && availableLanes.length > 0) {
        foundLane = availableLanes.pop();
      }

      if (foundLane !== null) {
        const obstacleZ = obstacleRadarEnabled
          ? spawnZ - i * 0.08
          : spawnZ + i * 0.06;
        obstacles.push({
          lane: foundLane,
          z: obstacleZ,
          size: 39,
          subtype,
          animFrame: 0,
          spawnDelayRemaining: spawnDelaySeconds
        });
      }
    }
  }

  function addRadarHintForGoldLane(lane) {
    if (!gameState.radarActive || !isFinite(lane)) return;
    const existingHint = gameState.radarHints.find((h) => h.lane === lane);
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
      coins.push({ type: i === 0 && hasGold ? 'gold' : 'silver', lane, z: 1.55 - i * 0.1, animFrame: 0 });
    }
  }

  function spawnCoinSnake() {
    const startLane = CONFIG.LANES[Math.floor(Math.random() * 3)];
    const hasGold = Math.random() < 0.3;
    if (hasGold) addRadarHintForGoldLane(startLane);
    coins.push({ type: hasGold ? 'gold' : 'silver', lane: startLane, z: 1.55, animFrame: 0 });
    coins.push({ type: 'silver', lane: Math.max(-1, Math.min(1, startLane + (Math.random() < 0.5 ? -1 : 1))), z: 1.45, animFrame: 0 });
    coins.push({ type: 'silver', lane: startLane, z: 1.35, animFrame: 0 });
  }

  function spawnCoinDiagonal() {
    const hasGold = Math.random() < 0.3;
    if (hasGold) addRadarHintForGoldLane(-1);
    [-1, 0, 1].forEach((lane, i) => {
      coins.push({ type: i === 0 && hasGold ? 'gold' : 'silver', lane, z: 1.55 - i * 0.1, animFrame: 0 });
    });
  }

  function spawnCoinPattern() {
    const patterns = [spawnCoinLine, spawnCoinSnake, spawnCoinDiagonal];
    patterns[Math.floor(Math.random() * patterns.length)]();
  }

  function startSpinAlertCycle() {
    gameState.spinAlertTimer = 3.0;
    // For Perfect tier: ring should appear right after the "1" tick (no dead pause)
    gameState.spinAlertPendingDelay = gameState.spinAlertLevel >= 2 ? 2.05 : 3.0;
    gameState.perfectSpinWindow = false;
    gameState.perfectSpinWindowTimer = 0;
    gameState.spinAlertCountdown = gameState.spinAlertLevel >= 2 ? 3.0 : 0;
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
      coins.push({ type: i === 1 && hasGold ? 'gold' : 'silver', lane, z: spawnZ, animFrame: 0, isCircle: true });
    });

    // Top — 3 coins (spin only) — now gold
    [Math.PI - 0.3, Math.PI, Math.PI + 0.3].forEach((angle) => {
      coins.push({ type: 'gold', z: spawnZ, angle, radiusFactor: 0.65, isCircle: true, spinOnly: true, animFrame: 0 });
    });

    // Left — 3 coins (spin only) — now gold
    [Math.PI * 0.5 - 0.3, Math.PI * 0.5, Math.PI * 0.5 + 0.3].forEach((angle) => {
      coins.push({ type: 'gold', z: spawnZ, angle, radiusFactor: 0.65, isCircle: true, spinOnly: true, animFrame: 0 });
    });

    // Right — 3 coins (spin only) — now gold
    [Math.PI * 1.5 - 0.3, Math.PI * 1.5, Math.PI * 1.5 + 0.3].forEach((angle) => {
      coins.push({ type: 'gold', z: spawnZ, angle, radiusFactor: 0.65, isCircle: true, spinOnly: true, animFrame: 0 });
    });

    // Radar hint for gold lane coins
    if (hasGold) addRadarHintForGoldLane(0);

    // Spawn 1 combo target at random angle
    const angle = Math.random() * Math.PI * 2;
    spinTargets.push({ angle, z: spawnZ, radiusFactor: 0.65, collected: false, animFrame: 0 });
    gameState.spinComboRingActive = true;
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

  function spawnCoinCluster() {
    const lane = CONFIG.LANES[Math.floor(Math.random() * 3)];
    const hasGold = Math.random() < 0.3;
    if (hasGold) addRadarHintForGoldLane(lane);
    const count = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      coins.push({ type: i === 0 && hasGold ? 'gold' : 'silver', lane, z: 1.5 - i * 0.08, animFrame: 0 });
    }
  }

  return {
    getSpacing,
    spawnBonus,
    spawnObstacle,
    spawnCoinPattern,
    queueCoinRingSpawn,
    resetSpinComboProgress,
    spawnCoinRing,
    spawnCoinCluster,
    startSpinAlertCycle,
  };
}

export { createPhysicsSpawning };
