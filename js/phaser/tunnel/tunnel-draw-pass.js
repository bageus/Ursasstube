function acquirePooledEntry(pool, index) {
  if (index >= pool.length) {
    pool.push({});
  }
  return pool[index];
}

function ensureAngleCache(cache, segmentCount) {
  if (cache.segmentCount === segmentCount && cache.sin.length === segmentCount) {
    return;
  }

  cache.segmentCount = segmentCount;
  cache.sin.length = segmentCount;
  cache.cos.length = segmentCount;
  const angleStep = (Math.PI * 2) / segmentCount;
  for (let i = 0; i < segmentCount; i++) {
    const angle = i * angleStep;
    cache.sin[i] = Math.sin(angle);
    cache.cos[i] = Math.cos(angle);
  }
}

function drawTunnelPass(renderer, deps) {
  const snapshot = renderer.snapshot;
  const viewport = snapshot?.viewport;
  const tube = snapshot?.tube;

  renderer.baseGraphics.clear();
  renderer.lightGraphics.clear();
  renderer.fogGraphics?.clear();
  renderer.fxGraphics?.clear();
  renderer.flashGraphics?.clear();
  renderer.hideDepthLightRaySprites();

  if (!viewport || !tube) return;
  const renderTube = renderer.getSmoothedTube(tube);
  if (!renderTube) return;

  const width = viewport.width || renderer.scene.scale.width;
  const height = viewport.height || renderer.scene.scale.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const qualityName = renderTube.quality || 'high';
  const quality = deps.QUALITY_PRESETS[qualityName] || deps.QUALITY_PRESETS.high;
  const segmentCount = deps.CONFIG.TUBE_SEGMENTS;
  const maxDepth = deps.CONFIG.TUBE_DEPTH_STEPS;
  const frameCache = renderer.__drawPassFrameCache || (renderer.__drawPassFrameCache = {
    trackSlatOverlays: [],
    gridRingOverlays: [],
    gridRadialOverlays: [],
    speedStreakOverlays: [],
    angleCache: {
      segmentCount: 0,
      sin: [],
      cos: [],
    },
  });
  ensureAngleCache(frameCache.angleCache, segmentCount);
  const { sin: angleSinCache, cos: angleCosCache } = frameCache.angleCache;
  const normalizedSpeed = deps.clamp((renderTube.speed || deps.CONFIG.SPEED_START || 1) / Math.max(0.0001, deps.CONFIG.SPEED_START || 1), 0.2, 3);
  const scrollOffset = (renderTube.scroll || 0) * 0.035 * normalizedSpeed;
  const ringShift = Math.floor(scrollOffset);
  const ringPhase = scrollOffset - ringShift;
  const lampDepthSteps = Array.isArray(snapshot?.lamps)
    ? snapshot.lamps
      .map((lamp) => (Number.isFinite(lamp?.z) ? lamp.z / deps.CONFIG.TUBE_Z_STEP : NaN))
      .filter((lampDepthStep) => Number.isFinite(lampDepthStep))
    : [];
  const lampPulseHalfWidth = Math.max(quality.depthStep * 1.5, 0.9);
  const depthEntries = [];
  const gridPulseAlpha = deps.getGridPulseAlpha(renderer.scene.time.now || 0);
  const gridRingOverlays = frameCache.gridRingOverlays;
  const gridRadialOverlays = frameCache.gridRadialOverlays;
  const speedStreakOverlays = frameCache.speedStreakOverlays;
  const trackSlatOverlays = frameCache.trackSlatOverlays;
  let gridRingOverlayCount = 0;
  let gridRadialOverlayCount = 0;
  let speedStreakOverlayCount = 0;
  let trackSlatOverlayCount = 0;
  const speedPulse = (renderer.scene.time.now || 0) * 0.0013;
  const drawQuad = {
    p1: { x: 0, y: 0 },
    p2: { x: 0, y: 0 },
    p3: { x: 0, y: 0 },
    p4: { x: 0, y: 0 },
  };

  for (let depth = 0; depth < maxDepth; depth += quality.depthStep) {
    let animatedDepth = depth - ringPhase;
    if (animatedDepth < 0) {
      animatedDepth += maxDepth;
    }

    let spawnBlend = 0;
    for (const lampDepthStep of lampDepthSteps) {
      const lampDistance = Math.abs(animatedDepth - lampDepthStep);
      const lampBlend = 1 - deps.clamp(lampDistance / lampPulseHalfWidth, 0, 1);
      if (lampBlend > spawnBlend) {
        spawnBlend = lampBlend;
      }
    }

    depthEntries.push({ animatedDepth, spawnBlend });
  }

  depthEntries.sort((a, b) => b.animatedDepth - a.animatedDepth);

  const angleOffset = renderTube.rotation + renderTube.curveAngle;
  const offsetSin = Math.sin(angleOffset);
  const offsetCos = Math.cos(angleOffset);
  for (const depthEntry of depthEntries) {
    const { animatedDepth, spawnBlend } = depthEntry;
    const extendedDepth1 = Math.max(0, animatedDepth - deps.MOUTH_EXTENSION_DEPTH);
    const extendedDepth2 = Math.max(0, animatedDepth + quality.depthStep - deps.MOUTH_EXTENSION_DEPTH);
    const z1 = extendedDepth1 * deps.CONFIG.TUBE_Z_STEP;
    const z2 = extendedDepth2 * deps.CONFIG.TUBE_Z_STEP;
    const scale1 = 1 - z1;
    const scale2 = 1 - z2;
    if (scale2 <= 0) continue;

    const innerRadius = deps.CONFIG.TUBE_RADIUS * deps.INNER_RADIUS_RATIO;
    const radius1 = Math.max(innerRadius, deps.CONFIG.TUBE_RADIUS * scale1);
    const radius2 = Math.max(innerRadius, deps.CONFIG.TUBE_RADIUS * scale2);
    const bend1 = 1 - scale1;
    const bend2 = 1 - scale2;
    const wrappedDepth = ((animatedDepth % maxDepth) + maxDepth) % maxDepth;
    const depthRatio = 1 - wrappedDepth / maxDepth;
    const wallColor = deps.blendColor(0x080a14, 0x294266, depthRatio * 0.7);
    for (let i = 0; i < segmentCount; i += quality.segmentStep) {
      const nextIndex = (i + quality.segmentStep) % segmentCount;
      const sinA = angleSinCache[i] * offsetCos + angleCosCache[i] * offsetSin;
      const cosA = angleCosCache[i] * offsetCos - angleSinCache[i] * offsetSin;
      const sinB = angleSinCache[nextIndex] * offsetCos + angleCosCache[nextIndex] * offsetSin;
      const cosB = angleCosCache[nextIndex] * offsetCos - angleSinCache[nextIndex] * offsetSin;
      const boundaryA = (i / segmentCount) * Math.PI * 2 + angleOffset;
      const boundaryB = (nextIndex / segmentCount) * Math.PI * 2 + angleOffset;
      const segmentMidAngle = (boundaryA + boundaryB) * 0.5;
      const trackCoverage = deps.getTrackCoverage(segmentMidAngle, renderTube.rotation, renderTube.curveAngle);

      const x1 =
        centerX +
        sinA * radius1 +
        (renderTube.centerOffsetX || 0) * bend1;
      const y1 =
        centerY +
        cosA * radius1 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend1;
      const x2 =
        centerX +
        sinB * radius1 +
        (renderTube.centerOffsetX || 0) * bend1;
      const y2 =
        centerY +
        cosB * radius1 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend1;
      const x3 =
        centerX +
        sinB * radius2 +
        (renderTube.centerOffsetX || 0) * bend2;
      const y3 =
        centerY +
        cosB * radius2 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend2;
      const x4 =
        centerX +
        sinA * radius2 +
        (renderTube.centerOffsetX || 0) * bend2;
      const y4 =
        centerY +
        cosA * radius2 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend2;

      const tileFillAlpha = deps.clamp(quality.segmentAlpha * spawnBlend, 0.2, 1);
      const trackWallColor = deps.blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);
      renderer.baseGraphics.fillStyle(trackWallColor, tileFillAlpha);
      deps.drawQuadPath(renderer.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
      renderer.baseGraphics.fillPath();
      drawQuad.p1.x = x1;
      drawQuad.p1.y = y1;
      drawQuad.p2.x = x2;
      drawQuad.p2.y = y2;
      drawQuad.p3.x = x3;
      drawQuad.p3.y = y3;
      drawQuad.p4.x = x4;
      drawQuad.p4.y = y4;
      deps.drawTunnelDarkeningOverlay(
        renderer.fogGraphics,
        drawQuad,
        depthRatio,
        segmentMidAngle,
        renderTube.rotation,
        renderTube.curveAngle,
      );
      deps.drawSegmentGlintOverlay(
        renderer.fxGraphics,
        drawQuad,
        segmentMidAngle,
        renderTube.rotation,
        depthRatio,
        spawnBlend,
      );

      const ambientGridBlend = deps.clamp(deps.GRID_AMBIENT_ALPHA_FLOOR + depthRatio * deps.GRID_AMBIENT_DEPTH_BOOST, 0, 0.2);
      const gridBlend = Math.max(spawnBlend, ambientGridBlend);
      const radialLine = acquirePooledEntry(gridRadialOverlays, gridRadialOverlayCount++);
      radialLine.x1 = x1;
      radialLine.y1 = y1;
      radialLine.x4 = x4;
      radialLine.y4 = y4;
      radialLine.depthRatio = depthRatio;
      radialLine.gridBlend = gridBlend;
      const ringLine = acquirePooledEntry(gridRingOverlays, gridRingOverlayCount++);
      ringLine.x1 = x1;
      ringLine.y1 = y1;
      ringLine.x2 = x2;
      ringLine.y2 = y2;
      ringLine.depthRatio = depthRatio;
      ringLine.gridBlend = gridBlend;

      if (trackCoverage > 0) {
        const treadPhase = ((animatedDepth + scrollOffset * 0.7) % deps.TRACK_SLAT_PERIOD + deps.TRACK_SLAT_PERIOD) % deps.TRACK_SLAT_PERIOD;
        const riseProgress = deps.clamp(treadPhase / Math.max(deps.TRACK_SLAT_SOFTNESS, 0.0001), 0, 1);
        const fallProgress = deps.clamp((treadPhase - deps.TRACK_SLAT_LENGTH) / Math.max(deps.TRACK_SLAT_SOFTNESS, 0.0001), 0, 1);
        const riseEase = riseProgress * riseProgress * (3 - 2 * riseProgress);
        const fallEase = fallProgress * fallProgress * (3 - 2 * fallProgress);
        const slatVisibility = riseEase * (1 - fallEase);
        if (slatVisibility > 0.001) {
          const slat = acquirePooledEntry(trackSlatOverlays, trackSlatOverlayCount++);
          slat.x1 = x1;
          slat.y1 = y1;
          slat.x2 = x2;
          slat.y2 = y2;
          slat.x3 = x3;
          slat.y3 = y3;
          slat.x4 = x4;
          slat.y4 = y4;
          slat.depthRatio = depthRatio;
          slat.trackCoverage = trackCoverage;
          slat.slatVisibility = slatVisibility;
          slat.spawnBlend = spawnBlend;
        }
      }

      const wallCoverage = 1 - deps.clamp(trackCoverage, 0, 1);
      if (wallCoverage > 0.25) {
        const depthPhase = animatedDepth * 0.33 - scrollOffset * 1.7 + speedPulse;
        const stripePulse = 0.5 + 0.5 * Math.sin(depthPhase);
        const stripeGate = Math.pow(stripePulse, 7.5);
        const segmentNoise = deps.hashNoise(i * 13.77 + Math.floor(animatedDepth) * 0.91);
        const depthWithinRange = depthRatio >= deps.SPEED_STREAK_MIN_DEPTH_RATIO && depthRatio <= deps.SPEED_STREAK_MAX_DEPTH_RATIO;
        if (depthWithinRange && stripeGate > 0.08 && segmentNoise > 0.48) {
          const streak = acquirePooledEntry(speedStreakOverlays, speedStreakOverlayCount++);
          streak.quad = streak.quad || { p1: {}, p2: {}, p3: {}, p4: {} };
          streak.quad.p1.x = x1;
          streak.quad.p1.y = y1;
          streak.quad.p2.x = x2;
          streak.quad.p2.y = y2;
          streak.quad.p3.x = x3;
          streak.quad.p3.y = y3;
          streak.quad.p4.x = x4;
          streak.quad.p4.y = y4;
          streak.depthRatio = depthRatio;
          streak.spawnBlend = spawnBlend;
          streak.wallCoverage = wallCoverage;
          streak.colorIndex = (i + Math.floor(animatedDepth)) % deps.SPEED_STREAK_COLORS.length;
          streak.streakAlpha = stripeGate;
        }
      }
    }
  }

  for (let i = 0; i < trackSlatOverlayCount; i++) {
    const slat = trackSlatOverlays[i];
    const slatColor = deps.blendColor(0x66a3ff, 0xffffff, slat.depthRatio * 0.5);
    const slatAlpha = deps.amplifiedAlpha(deps.clamp(
      (0.14 + slat.depthRatio * 0.2) *
        slat.trackCoverage *
        slat.slatVisibility *
        slat.spawnBlend *
        deps.TRACK_SLAT_ALPHA_MULTIPLIER,
      0,
      0.38,
    ));
    renderer.lightGraphics.fillStyle(slatColor, slatAlpha);
    deps.drawQuadPath(
      renderer.lightGraphics,
      slat.x1,
      slat.y1,
      slat.x2,
      slat.y2,
      slat.x3,
      slat.y3,
      slat.x4,
      slat.y4,
    );
    renderer.lightGraphics.fillPath();
  }

  for (let i = 0; i < gridRingOverlayCount; i++) {
    const line = gridRingOverlays[i];
    const ringColor = deps.blendColor(deps.GRID_COLOR_FAR, deps.GRID_COLOR_NEAR, line.depthRatio * 0.8);
    const ringAlpha = deps.amplifiedAlpha(
      deps.clamp((0.02 + line.depthRatio * 0.07) * line.gridBlend * deps.GRID_ALPHA_MULTIPLIER * gridPulseAlpha, 0, 0.2),
      0.25,
    );
    if (ringAlpha <= 0.002) continue;
    renderer.lightGraphics.lineStyle(deps.GRID_RING_LINE_WIDTH, ringColor, ringAlpha);
    renderer.lightGraphics.beginPath();
    renderer.lightGraphics.moveTo(line.x1, line.y1);
    renderer.lightGraphics.lineTo(line.x2, line.y2);
    renderer.lightGraphics.strokePath();
  }

  for (let i = 0; i < gridRadialOverlayCount; i++) {
    const line = gridRadialOverlays[i];
    const radialColor = deps.blendColor(deps.GRID_COLOR_FAR, deps.GRID_COLOR_NEAR, line.depthRatio * 0.7);
    const radialAlpha = deps.amplifiedAlpha(
      deps.clamp((0.03 + line.depthRatio * 0.09) * line.gridBlend * deps.GRID_ALPHA_MULTIPLIER * gridPulseAlpha, 0, 0.22),
      0.28,
    );
    if (radialAlpha <= 0.002) continue;
    renderer.lightGraphics.lineStyle(deps.GRID_RADIAL_LINE_WIDTH, radialColor, radialAlpha);
    renderer.lightGraphics.beginPath();
    renderer.lightGraphics.moveTo(line.x1, line.y1);
    renderer.lightGraphics.lineTo(line.x4, line.y4);
    renderer.lightGraphics.strokePath();
  }

  for (let i = 0; i < speedStreakOverlayCount; i++) {
    const streak = speedStreakOverlays[i];
    const widthPulse = 0.4 + 0.6 * Math.sin((streak.depthRatio + speedPulse) * 10.2);
    const bandStart = deps.clamp(0.5 - deps.SPEED_STREAK_WIDTH_RATIO * widthPulse * 0.5, 0.05, 0.49);
    const bandEnd = deps.clamp(0.5 + deps.SPEED_STREAK_WIDTH_RATIO * widthPulse * 0.5, 0.51, 0.95);
    const streakColor = deps.SPEED_STREAK_COLORS[streak.colorIndex];
    const streakAlpha = deps.amplifiedAlpha(deps.clamp(
      (deps.SPEED_STREAK_BASE_ALPHA + streak.depthRatio * 0.035) *
        streak.spawnBlend *
        streak.wallCoverage *
        streak.streakAlpha,
      0,
      deps.SPEED_STREAK_MAX_ALPHA,
    ), 0.22);
    if (streakAlpha <= 0.002) continue;
    renderer.fxGraphics.fillStyle(streakColor, streakAlpha);
    deps.fillQuad(renderer.fxGraphics, deps.getQuadBand(streak.quad, bandStart, bandEnd));
  }

  renderer.drawMouthRing(centerX, centerY, renderTube);
}

export { drawTunnelPass };
