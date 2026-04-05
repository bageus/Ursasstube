function renderCollectAnimationsPass(renderer, deps) {
  const effects = renderer.snapshot?.fx?.collectAnimations;
  if (!Array.isArray(effects) || effects.length === 0) return;
  if (renderer.collectEffectSeenIds.size > 2000) {
    renderer.collectEffectSeenIds.clear();
  }

  effects.forEach((effect) => {
    const effectId = String(effect.id || '');
    if (!effectId || renderer.collectEffectSeenIds.has(effectId)) return;
    renderer.collectEffectSeenIds.add(effectId);

    const kind = effect.kind === 'shield_hit'
      ? 'shield_hit'
      : (effect.kind === 'bonus' ? 'bonus' : (effect.kind === 'particle_burst' ? 'particle_burst' : 'coin'));
    const bonusType = String(effect.bonusType || '');
    const coinType = String(effect.coinType || '');
    if (kind === 'shield_hit') {
      const shieldPulse = renderer.scene.add.circle(Number(effect.x) || 0, Number(effect.y) || 0, 62, 0x66e6ff, 0.16);
      shieldPulse.setStrokeStyle(4, 0x9ff8ff, 0.95);
      shieldPulse.setDepth(23);
      renderer.collectEffectSprites.add(shieldPulse);

      renderer.scene.tweens.add({
        targets: shieldPulse,
        scale: 1.42,
        alpha: 0,
        ease: 'Cubic.easeOut',
        duration: 240,
        onComplete: () => {
          renderer.collectEffectSprites.delete(shieldPulse);
          shieldPulse.destroy();
        }
      });

      const shieldRipple = renderer.scene.add.circle(Number(effect.x) || 0, Number(effect.y) || 0, 46, 0x33ccff, 0.12);
      shieldRipple.setStrokeStyle(2, 0xdfffff, 0.8);
      shieldRipple.setDepth(22);
      renderer.collectEffectSprites.add(shieldRipple);
      renderer.scene.tweens.add({
        targets: shieldRipple,
        scale: 1.26,
        alpha: 0,
        ease: 'Sine.easeOut',
        duration: 200,
        onComplete: () => {
          renderer.collectEffectSprites.delete(shieldRipple);
          shieldRipple.destroy();
        }
      });
      return;
    }

    if (kind === 'particle_burst') {
      const baseX = Number(effect.x) || 0;
      const baseY = Number(effect.y) || 0;
      const particleCount = deps.clamp(Math.floor(Number(effect.count) || 8), 3, 24);
      const burstSpeed = deps.clamp(Number(effect.speed) || 5, 2, 22);
      const color = deps.parseRgbaColor(effect.color, 0xffd54a);

      for (let index = 0; index < particleCount; index += 1) {
        const dot = renderer.scene.add.circle(baseX, baseY, 3 + Math.random() * 2.2, color.hex, color.alpha);
        dot.setDepth(20);
        renderer.collectEffectSprites.add(dot);
        const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.25;
        const distance = burstSpeed * (0.9 + Math.random() * 1.35);

        renderer.scene.tweens.add({
          targets: dot,
          x: baseX + Math.cos(angle) * distance,
          y: baseY + Math.sin(angle) * distance + 3,
          alpha: 0,
          scale: 0.3,
          ease: 'Cubic.easeOut',
          duration: 180 + Math.floor(Math.random() * 100),
          onComplete: () => {
            renderer.collectEffectSprites.delete(dot);
            dot.destroy();
          }
        });
      }
      return;
    }

    const textureKey = kind === 'bonus'
      ? (deps.BONUS_TEXTURES[bonusType] || 'bonus_shield')
      : (coinType === 'silver' ? 'coins_silver' : 'coins_gold');
    const sprite = renderer.scene.add.sprite(Number(effect.x) || 0, Number(effect.y) || 0, textureKey, 0);
    sprite.setDepth(22);
    sprite.setAlpha(0.98);
    sprite.setScale(kind === 'bonus' ? 0.9 : (coinType === 'silver' ? 0.72 : 0.8));
    renderer.collectEffectSprites.add(sprite);

    if (kind === 'coin') {
      const isSilver = coinType === 'silver';
      const lift = (isSilver ? 10 : 14) + Math.floor(Math.random() * 12);
      const burstDistance = isSilver ? 14 : 20;
      for (let index = 0; index < 6; index += 1) {
        const burstSprite = renderer.scene.add.sprite(sprite.x, sprite.y, textureKey, (index + 1) % 4);
        burstSprite.setDepth(21);
        burstSprite.setAlpha(isSilver ? 0.72 : 0.9);
        burstSprite.setScale(isSilver ? 0.2 : 0.3);
        renderer.collectEffectSprites.add(burstSprite);

        const angle = deps.COIN_COLLECT_BURST_ANGLE_STEP * index + Math.random() * 0.1;
        renderer.scene.tweens.add({
          targets: burstSprite,
          x: burstSprite.x + Math.cos(angle) * burstDistance,
          y: burstSprite.y + Math.sin(angle) * burstDistance - 4,
          alpha: 0,
          scale: isSilver ? 0.04 : 0.08,
          ease: 'Quad.easeOut',
          duration: isSilver ? 180 : 220,
          onComplete: () => {
            renderer.collectEffectSprites.delete(burstSprite);
            burstSprite.destroy();
          }
        });
      }

      renderer.scene.tweens.add({
        targets: sprite,
        y: sprite.y - lift,
        scale: isSilver ? 0.3 : 0.4,
        alpha: 0,
        ease: 'Cubic.easeOut',
        duration: isSilver ? 220 : 280,
        onComplete: () => {
          renderer.collectEffectSprites.delete(sprite);
          sprite.destroy();
        }
      });
      return;
    }

    renderer.scene.tweens.add({
      targets: sprite,
      scale: 1.28,
      duration: 120,
      ease: 'Back.easeOut',
      yoyo: true,
      onComplete: () => {
        renderer.scene.tweens.add({
          targets: sprite,
          y: sprite.y - 20,
          alpha: 0,
          scale: 0.5,
          duration: 170,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            renderer.collectEffectSprites.delete(sprite);
            sprite.destroy();
          }
        });
      }
    });
  });
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
