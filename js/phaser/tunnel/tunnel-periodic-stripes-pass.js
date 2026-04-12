function buildPeriodicStripeOverlaysPass(renderer, deps, renderTube, frame, curve) {
  const frameBuffers = renderer.__tunnelFrameBuffers;
  if (!frameBuffers) return [];
  const periodicStripeOverlays = frameBuffers.periodicStripeOverlays;
  periodicStripeOverlays.length = 0;
  const { centerX, centerY, quality, maxDepth, scrollOffset, depthEntries } = frame;
  if (!Array.isArray(depthEntries) || depthEntries.length === 0) {
    return periodicStripeOverlays;
  }

  const segmentCount = deps.CONFIG.TUBE_SEGMENTS;
  const segmentStep = Math.max(quality.segmentStep, 1);
  const depthStride = Math.max(1, Math.floor(quality.depthStep * 2));
  const stripeTime = (renderer.scene?.time?.now || 0) * 0.0009;

  for (let depthIndex = 0; depthIndex < depthEntries.length; depthIndex += depthStride) {
    const depthEntry = depthEntries[depthIndex];
    const animatedDepth = depthEntry.animatedDepth;
    const spawnBlend = depthEntry.spawnBlend;
    const extendedDepth1 = Math.max(0, animatedDepth - deps.MOUTH_EXTENSION_DEPTH);
    const extendedDepth2 = Math.max(0, animatedDepth + depthStride - deps.MOUTH_EXTENSION_DEPTH);
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
    const curveAngle = Number(renderTube.curveAngle) || 0;
    const centerOffsetX = Number(renderTube.centerOffsetX) || 0;
    const centerOffsetY = Number(renderTube.centerOffsetY) || 0;
    const curveDepth1 = Math.pow(bend1, 1.45);
    const curveDepth2 = Math.pow(bend2, 1.45);
    const curveOffsetX1 = Math.sin(curveAngle) * deps.CONFIG.TUBE_RADIUS * curve.depthShiftX * curveDepth1 + centerOffsetX * curveDepth1 * curve.centerBiasX;
    const curveOffsetY1 = Math.cos(curveAngle) * deps.CONFIG.TUBE_RADIUS * deps.CONFIG.PLAYER_OFFSET * curve.depthShiftY * curveDepth1 + centerOffsetY * curveDepth1 * curve.centerBiasY;
    const curveOffsetX2 = Math.sin(curveAngle) * deps.CONFIG.TUBE_RADIUS * curve.depthShiftX * curveDepth2 + centerOffsetX * curveDepth2 * curve.centerBiasX;
    const curveOffsetY2 = Math.cos(curveAngle) * deps.CONFIG.TUBE_RADIUS * deps.CONFIG.PLAYER_OFFSET * curve.depthShiftY * curveDepth2 + centerOffsetY * curveDepth2 * curve.centerBiasY;

    const wrappedDepth = ((animatedDepth % maxDepth) + maxDepth) % maxDepth;
    const depthRatio = 1 - wrappedDepth / maxDepth;
    for (let i = 0; i < segmentCount; i += segmentStep) {
      const boundaryA =
        (i / segmentCount) * Math.PI * 2 + renderTube.rotation + renderTube.curveAngle;
      const segmentMidAngle = boundaryA + (Math.PI * 2 / segmentCount) * 0.5 * segmentStep;
      const trackCoverage = deps.getTrackCoverage(segmentMidAngle, renderTube.rotation, renderTube.curveAngle);
      const wallCoverage = 1 - deps.clamp(trackCoverage, 0, 1);
      if (wallCoverage <= 0.14) continue;

      const angleRailBase = Math.cos(
        (segmentMidAngle + renderTube.rotation * 0.26 + animatedDepth * 0.016 + stripeTime) *
          deps.PERIODIC_STRIPE_ANGLE_REPEAT,
      );
      const angleRail = deps.clamp(
        (Math.abs(angleRailBase) - (1 - deps.PERIODIC_STRIPE_ANGLE_WIDTH)) /
          Math.max(deps.PERIODIC_STRIPE_ANGLE_WIDTH, 0.0001),
        0,
        1,
      );
      if (angleRail <= 0.001) continue;

      const phaseSeed = Math.floor(animatedDepth) * 0.37 + i * 0.93;
      const pulseOffset = deps.hashNoise(phaseSeed) * deps.PERIODIC_STRIPE_PERIOD;
      const periodicPhase =
        ((animatedDepth + scrollOffset * 1.65 + pulseOffset + stripeTime * 0.8) % deps.PERIODIC_STRIPE_PERIOD +
          deps.PERIODIC_STRIPE_PERIOD) %
        deps.PERIODIC_STRIPE_PERIOD;
      const riseProgress = deps.clamp(periodicPhase / Math.max(deps.PERIODIC_STRIPE_SOFTNESS, 0.0001), 0, 1);
      const fallProgress = deps.clamp(
        (periodicPhase - deps.PERIODIC_STRIPE_LENGTH) / Math.max(deps.PERIODIC_STRIPE_SOFTNESS, 0.0001),
        0,
        1,
      );
      const riseEase = riseProgress * riseProgress * (3 - 2 * riseProgress);
      const fallEase = fallProgress * fallProgress * (3 - 2 * fallProgress);
      const stripeVisibility = riseEase * (1 - fallEase);
      if (stripeVisibility <= 0.001) continue;

      const sparseNoise = deps.hashNoise(i * 0.611 + 8.3);
      if (sparseNoise < deps.PERIODIC_STRIPE_RAY_SPARSE_NOISE_THRESHOLD) continue;

      const chunkNoise = deps.hashNoise(
        Math.floor((animatedDepth + pulseOffset) / Math.max(0.0001, deps.PERIODIC_STRIPE_LENGTH * 1.6)) * 1.21 +
          i * 0.47,
      );
      const chunkBlend = deps.clamp((chunkNoise - 0.35) / 0.65, 0, 1);
      if (chunkBlend <= 0.01) continue;

      const x1 = centerX + Math.sin(boundaryA) * radius1 + curveOffsetX1 + centerOffsetX * bend1;
      const y1 = centerY + Math.cos(boundaryA) * radius1 * deps.CONFIG.PLAYER_OFFSET + curveOffsetY1 + centerOffsetY * bend1;
      const x4 = centerX + Math.sin(boundaryA) * radius2 + curveOffsetX2 + centerOffsetX * bend2;
      const y4 = centerY + Math.cos(boundaryA) * radius2 * deps.CONFIG.PLAYER_OFFSET + curveOffsetY2 + centerOffsetY * bend2;

      periodicStripeOverlays.push({
        x1,
        y1,
        x4,
        y4,
        depthRatio,
        spawnBlend,
        wallCoverage,
        angleRail,
        stripeVisibility,
        chunkBlend,
        colorIndex: Math.abs(i + Math.floor(animatedDepth)) % deps.PERIODIC_STRIPE_COLORS.length,
      });
    }
  }
  return periodicStripeOverlays;
}

function renderPeriodicStripeLayerPass(renderer, deps, periodicStripeOverlays, speedPulse) {
  if (!renderer.stripeGraphics) return;
  for (const stripe of periodicStripeOverlays) {
    const pulse = 0.7 + 0.3 * Math.sin((stripe.depthRatio + speedPulse * 0.2) * 13.2);
    const stripeColor = deps.PERIODIC_STRIPE_COLORS[stripe.colorIndex];
    const stripeAlpha = deps.amplifiedAlpha(deps.clamp(
      (deps.PERIODIC_STRIPE_BASE_ALPHA + stripe.depthRatio * 0.08) *
        stripe.spawnBlend *
        stripe.wallCoverage *
        stripe.angleRail *
        stripe.stripeVisibility *
        stripe.chunkBlend,
      0,
      deps.PERIODIC_STRIPE_MAX_ALPHA,
    ), 1);
    if (stripeAlpha <= 0.003) continue;
    const glowAlpha = Math.min(0.66, stripeAlpha * (0.74 + pulse * 0.28));
    renderer.stripeGraphics.lineStyle(deps.PERIODIC_STRIPE_RAY_GLOW_LINE_WIDTH, stripeColor, glowAlpha);
    renderer.stripeGraphics.beginPath();
    renderer.stripeGraphics.moveTo(stripe.x1, stripe.y1);
    renderer.stripeGraphics.lineTo(stripe.x4, stripe.y4);
    renderer.stripeGraphics.strokePath();

    renderer.stripeGraphics.lineStyle(
      deps.PERIODIC_STRIPE_RAY_LINE_WIDTH,
      stripeColor,
      Math.min(1, stripeAlpha * (0.98 + pulse * 0.22)),
    );
    renderer.stripeGraphics.beginPath();
    renderer.stripeGraphics.moveTo(stripe.x1, stripe.y1);
    renderer.stripeGraphics.lineTo(stripe.x4, stripe.y4);
    renderer.stripeGraphics.strokePath();
  }
}

export { buildPeriodicStripeOverlaysPass, renderPeriodicStripeLayerPass };
