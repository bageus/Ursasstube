function renderCollectAnimationsPass(renderer, deps) {
  void renderer;
  void deps;
}

function renderObjectsPass(renderer, deps) {
  const snapshot = renderer.snapshot;
  const viewport = snapshot?.viewport;
  const tube = snapshot?.tube;
  if (!viewport || !tube) return;

  const objectEntries = [];
  (snapshot.obstacles || []).forEach((item) => {
    if (item.passed || item.z <= -0.2 || item.z >= 1.6) return;
    objectEntries.push({ kind: 'obstacle', z: item.z, item });
  });
  (snapshot.bonuses || []).forEach((item) => {
    if (item.active === false || item.z <= -0.2 || item.z >= 1.6) return;
    objectEntries.push({ kind: 'bonus', z: item.z, item });
  });
  (snapshot.coins || []).forEach((item) => {
    if (item.collected || item.z <= -0.2 || item.z >= 1.8) return;
    objectEntries.push({ kind: 'coin', z: item.z, item });
  });
  objectEntries.sort((a, b) => b.z - a.z);

  const obstacleCount = objectEntries.filter((entry) => entry.kind === 'obstacle').length;
  const bonusCount = objectEntries.filter((entry) => entry.kind === 'bonus').length;
  const coinCount = objectEntries.filter((entry) => entry.kind === 'coin').length;
  renderer.ensurePoolSize(renderer.obstacleSprites, obstacleCount, () => renderer.scene.add.sprite(0, 0, 'obstacles_1', 0));
  renderer.ensurePoolSize(renderer.bonusSprites, bonusCount, () => renderer.scene.add.sprite(0, 0, 'bonus_shield', 0));
  renderer.ensurePoolSize(renderer.coinSprites, coinCount, () => renderer.scene.add.sprite(0, 0, 'coins_silver', 0));

  let obstacleIndex = 0;
  let bonusIndex = 0;
  let coinIndex = 0;

  for (const entry of objectEntries) {
    const { item } = entry;
    const projection = typeof item.angle === 'number'
      ? deps.projectPolar(item.angle, item.z, viewport, tube, item.radiusFactor || 0.65)
      : deps.projectLane(item.lane, item.z, viewport, tube);
    const minVisibleScale = entry.kind === 'obstacle' ? 0.05 : 0.12;
    if (!projection || projection.scale < minVisibleScale) continue;

    if (entry.kind === 'obstacle') {
      const sprite = renderer.obstacleSprites[obstacleIndex++];
      const textureKey = deps.OBSTACLE_TEXTURES[item.subtype] || 'obstacles_1';
      const frameMap = { fence: 0, rock1: 1, rock2: 2, bull: 3, wall_brick: 0, wall_kactus: 1, tree: 2, pit: 0, spikes: 1, bottles: 2 };
      const obstacleGrowthStartZ = 1.0;
      const obstacleNearZ = deps.CONFIG.PLAYER_Z;
      const approachRange = Math.max(0.001, obstacleGrowthStartZ - obstacleNearZ);
      const hasPassedPlayer = item.z < obstacleNearZ;
      const isApproachingPlayer = item.z <= obstacleGrowthStartZ && item.z >= obstacleNearZ;
      const approachTLinear = deps.clamp((obstacleGrowthStartZ - item.z) / approachRange, 0, 1);
      const radarPreviewActive = (Number(item.spawnDelayRemaining) || 0) > 0;
      const radarPulse = radarPreviewActive ? (0.7 + 0.3 * Math.sin(renderer.scene.time.now * 0.012)) : 1;
      const growth = hasPassedPlayer
        ? 2.5
        : 1 + (isApproachingPlayer ? 1.5 * approachTLinear : 0);
      const size = Math.max(36, deps.FRAME_SIZE * projection.scale) * growth * (radarPreviewActive ? 1.12 : 1);
      sprite.setTexture(textureKey, frameMap[item.subtype] || 0);
      sprite.setPosition(projection.x, projection.y);
      sprite.setDisplaySize(size, size);
      sprite.setAlpha(radarPreviewActive ? 0.84 + 0.16 * radarPulse : 1);
      if (radarPreviewActive) sprite.setTint(0x8cf7ff);
      else sprite.clearTint();
      sprite.setVisible(true);
      renderer.objectLayer.add(sprite);
    } else if (entry.kind === 'bonus') {
      const sprite = renderer.bonusSprites[bonusIndex++];
      const textureKey = deps.BONUS_TEXTURES[item.type] || 'bonus_shield';
      const baseSize = Math.max(18, deps.FRAME_SIZE * projection.scale * 0.94);
      const size = textureKey === 'bonus_chkey' ? baseSize * 1.25 : baseSize;
      sprite.setTexture(textureKey, deps.getBonusFrame(item));
      sprite.setPosition(projection.x, projection.y);
      sprite.setDisplaySize(size, size);
      sprite.setAlpha(0.95);
      sprite.setVisible(true);
      renderer.objectLayer.add(sprite);
    } else {
      const sprite = renderer.coinSprites[coinIndex++];
      const textureKey = item.type === 'gold' || item.type === 'gold_spin' ? 'coins_gold' : 'coins_silver';
      const size = Math.max(18, deps.FRAME_SIZE * projection.scale * (textureKey === 'coins_gold' ? 1 : 0.95));
      sprite.setTexture(textureKey, (item.animFrame || 0) % 4);
      sprite.setPosition(projection.x, projection.y);
      sprite.setDisplaySize(size, size);
      sprite.setAlpha(item.spinOnly ? 0.78 : 1);
      sprite.setVisible(true);
      renderer.objectLayer.add(sprite);
    }
  }

  for (let index = obstacleIndex; index < renderer.obstacleSprites.length; index += 1) {
    renderer.obstacleSprites[index].setVisible(false);
  }
  for (let index = bonusIndex; index < renderer.bonusSprites.length; index += 1) {
    renderer.bonusSprites[index].setVisible(false);
  }
  for (let index = coinIndex; index < renderer.coinSprites.length; index += 1) {
    renderer.coinSprites[index].setVisible(false);
  }
}

export {
  renderCollectAnimationsPass,
  renderObjectsPass,
};
