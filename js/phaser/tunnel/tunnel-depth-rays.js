function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function ensureDepthLightRayTextures(renderer, deps) {
  deps.DEPTH_LIGHT_RAY_TEXTURE_KEYS.forEach((textureKey, index) => {
    if (renderer.scene.textures.exists(textureKey)) {
      return;
    }
    const width = index === 0 ? 48 : 64;
    const height = 320;
    const tintCore = index === 0 ? 0xb8e8ff : 0xd7bcff;
    const tintInner = index === 0 ? 0xf2fdff : 0xf5ebff;
    const gfx = renderer.scene.make.graphics({ x: 0, y: 0, add: false });

    const drawLayer = (ratio, alpha, color) => {
      const layerWidth = width * ratio;
      const left = (width - layerWidth) * 0.5;
      gfx.fillStyle(color, alpha);
      gfx.fillTriangle(width * 0.5, 0, left, height * 0.22, left + layerWidth, height * 0.22);
      gfx.fillRoundedRect(left, height * 0.2, layerWidth, height * 0.76, layerWidth * 0.48);
    };

    drawLayer(0.95, 0.08, tintCore);
    drawLayer(0.72, 0.14, tintCore);
    drawLayer(0.48, 0.32, tintCore);
    drawLayer(0.24, 0.7, tintInner);
    drawLayer(0.12, 0.9, 0xffffff);

    gfx.generateTexture(textureKey, width, height);
    gfx.destroy();
  });
}

function scheduleDepthLightRay(ray, nowMs, deps, immediate = false) {
  ray.active = false;
  ray.spawnAt = nowMs + (immediate
    ? randomRange(0, Math.max(80, deps.DEPTH_LIGHT_RAY_MIN_RESPAWN_MS))
    : randomRange(deps.DEPTH_LIGHT_RAY_MIN_RESPAWN_MS, deps.DEPTH_LIGHT_RAY_MAX_RESPAWN_MS));
}

function getDepthLightRaySpawnZ(renderer) {
  const snapshot = renderer.snapshot;
  const candidates = [];
  const collectZ = (items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      if (Number.isFinite(item?.z) && item.z > 0) {
        candidates.push(item.z);
      }
    });
  };

  collectZ(snapshot?.obstacles);
  collectZ(snapshot?.bonuses);
  collectZ(snapshot?.coins);
  collectZ(snapshot?.spinTargets);

  if (candidates.length === 0) return 1.55;
  return Math.max(...candidates);
}

function activateDepthLightRay(ray, nowMs, tube, renderer, deps) {
  ray.active = true;
  ray.startTime = nowMs;
  ray.travelMs = randomRange(deps.DEPTH_LIGHT_RAY_MIN_TRAVEL_MS, deps.DEPTH_LIGHT_RAY_MAX_TRAVEL_MS);
  const flowPhase = deps.getTubeDepthFlowPhase(tube);
  const flowOffsetRatio = deps.getTubeDepthFlowOffsetRatio(tube);
  ray.flowPhaseAtSpawn = flowPhase;
  const slot = Number.isFinite(ray.poolIndex) ? ray.poolIndex : 0;
  const spawnWorldZ = getDepthLightRaySpawnZ(renderer);
  const spawnDepthRatio = deps.getDepthRatioFromWorldZ(spawnWorldZ);
  const slotDepthOffset = ((slot % deps.DEPTH_LIGHT_RAY_POOL_SIZE) / Math.max(1, deps.DEPTH_LIGHT_RAY_POOL_SIZE - 1) - 0.5) * 0.08;
  ray.startDepthRatio = deps.clamp(spawnDepthRatio + flowOffsetRatio + slotDepthOffset, 0.34, 0.97);
  ray.endDepthRatio = deps.clamp(ray.startDepthRatio - randomRange(0.38, 0.56), 0.04, 0.42);
  const baseOffset = deps.DEPTH_LIGHT_RAY_SURFACE_OFFSETS[slot % deps.DEPTH_LIGHT_RAY_SURFACE_OFFSETS.length];
  ray.pathOffset = baseOffset + randomRange(-deps.DEPTH_LIGHT_RAY_ANGLE_JITTER, deps.DEPTH_LIGHT_RAY_ANGLE_JITTER);
  ray.angle = ((tube?.rotation || 0) + (tube?.curveAngle || 0)) + ray.pathOffset;
  ray.rotation = deps.getDepthRayScreenRotation(ray.angle);
  ray.stretch = randomRange(0.72, 1.16);
  ray.textureIndex = Math.floor(randomRange(0, deps.DEPTH_LIGHT_RAY_TEXTURE_KEYS.length));
  ray.opacity = 0;
  ray.depthRatio = ray.startDepthRatio;
}

function ensureDepthLightRayPool(renderer, nowMs, deps) {
  while (renderer.depthLightRays.length < deps.DEPTH_LIGHT_RAY_POOL_SIZE) {
    const ray = { poolIndex: renderer.depthLightRays.length };
    scheduleDepthLightRay(ray, nowMs, deps, true);
    renderer.depthLightRays.push(ray);
  }
}

function updateDepthLightRays(renderer, nowMs, tube, deps) {
  ensureDepthLightRayPool(renderer, nowMs, deps);
  let activeCount = 0;

  for (const ray of renderer.depthLightRays) {
    if (!ray.active) continue;

    const progress = deps.clamp((nowMs - ray.startTime) / Math.max(ray.travelMs, 1), 0, 1);
    const flowPhase = deps.getTubeDepthFlowPhase(tube);
    const flowDelta = deps.getWrappedUnitDiff(flowPhase, ray.flowPhaseAtSpawn || 0);
    const flowShiftRatio = deps.getDepthFlowOffsetRatioFromPhaseDelta(flowDelta);
    ray.depthRatio = deps.clamp(deps.lerp(ray.startDepthRatio, ray.endDepthRatio, progress) + flowShiftRatio, 0.06, 0.995);
    ray.angle = ((tube?.rotation || 0) + (tube?.curveAngle || 0)) + (ray.pathOffset || 0);
    ray.rotation = deps.getDepthRayScreenRotation(ray.angle);
    const fadeIn = deps.clamp(progress / 0.18, 0, 1);
    const fadeOut = deps.clamp((1 - progress) / 0.33, 0, 1);
    ray.opacity = Math.min(fadeIn * fadeIn, fadeOut);

    if (progress >= 1) {
      scheduleDepthLightRay(ray, nowMs, deps, false);
    } else {
      activeCount += 1;
    }
  }

  for (const ray of renderer.depthLightRays) {
    if (activeCount >= deps.DEPTH_LIGHT_RAY_MAX_ACTIVE) break;
    if (ray.active || ray.spawnAt > nowMs) continue;
    activateDepthLightRay(ray, nowMs, tube, renderer, deps);
    activeCount += 1;
  }

  return renderer.depthLightRays;
}

function renderDepthLightRays(renderer, activeDepthLightRays, centerX, centerY, maxRadius, tube, deps) {
  let spriteIndex = 0;
  for (const ray of activeDepthLightRays) {
    if (!ray.active) continue;
    const sprite = renderer.depthLightRaySprites[spriteIndex];
    if (!sprite) break;
    const depthOffset = 1 - ray.depthRatio;
    const worldZ = deps.getWorldZFromDepthRatio(ray.depthRatio);
    const bend = deps.clamp(worldZ, 0, 1.6);
    const radius = Math.max(maxRadius * (0.08 + depthOffset * 0.88), maxRadius * 0.12);
    const x = centerX + Math.sin(ray.angle) * radius + (tube?.centerOffsetX || 0) * bend;
    const y = centerY + Math.cos(ray.angle) * radius * deps.CONFIG.PLAYER_OFFSET + (tube?.centerOffsetY || 0) * bend;
    const alpha = deps.amplifiedAlpha(deps.clamp(ray.opacity * (0.08 + depthOffset * 0.34), 0, deps.DEPTH_LIGHT_RAY_ALPHA_MAX), 0.5);
    const scaleY = 0.13 + depthOffset * 0.9 * ray.stretch;
    const scaleX = 0.1 + depthOffset * 0.08;
    const textureKey = deps.DEPTH_LIGHT_RAY_TEXTURE_KEYS[ray.textureIndex % deps.DEPTH_LIGHT_RAY_TEXTURE_KEYS.length];

    sprite.setTexture(textureKey);
    sprite.setPosition(x, y);
    sprite.setRotation(ray.rotation || deps.getDepthRayScreenRotation(ray.angle));
    sprite.setScale(scaleX, scaleY);
    sprite.setAlpha(alpha);
    sprite.setVisible(alpha > 0.002);
    spriteIndex += 1;
  }

  for (; spriteIndex < renderer.depthLightRaySprites.length; spriteIndex += 1) {
    renderer.depthLightRaySprites[spriteIndex].setVisible(false);
  }
}

function hideDepthLightRaySprites(renderer) {
  renderer.depthLightRaySprites.forEach((sprite) => {
    sprite.setVisible(false);
  });
}

function ensureDepthLightRaySprites(renderer, deps) {
  ensureDepthLightRayTextures(renderer, deps);
  while (renderer.depthLightRaySprites.length < deps.DEPTH_LIGHT_RAY_MAX_ACTIVE) {
    const sprite = renderer.scene.add
      .image(0, 0, deps.DEPTH_LIGHT_RAY_TEXTURE_KEYS[0])
      .setVisible(false)
      .setDepth(4.5)
      .setBlendMode('ADD');
    renderer.depthLightRaySprites.push(sprite);
  }
}

export {
  ensureDepthLightRaySprites,
  hideDepthLightRaySprites,
  renderDepthLightRays,
  updateDepthLightRays,
};
