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
  const normalizedSpeed = deps.clamp((renderTube.speed || deps.CONFIG.SPEED_START || 1) / Math.max(0.0001, deps.CONFIG.SPEED_START || 1), 0.2, 3);
  const scrollOffset = (renderTube.scroll || 0) * 0.002 * normalizedSpeed;
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
  const gridRingOverlays = [];
  const gridRadialOverlays = [];
  const speedPulse = (renderer.scene.time.now || 0) * 0.00013;

  for (let depth = 0; depth < maxDepth; depth += quality.depthStep) {
    let animatedDepth = depth - ringPhase;
    if (animatedDepth < 0) {
      animatedDepth += maxDepth;
    }

    let spawnBlend = 0;
    for (const lampDepthStep of lampDepthSteps) {
      const lampDistance = Math.abs(animatedDepth - lampDepthStep);
      const lampBlendLinear = 1 - deps.clamp(lampDistance / lampPulseHalfWidth, 0, 1);
      const lampBlend = lampBlendLinear * lampBlendLinear * (3 - 2 * lampBlendLinear);
      if (lampBlend > spawnBlend) {
        spawnBlend = lampBlend;
      }
    }

    const depthWaveJitter = 0.5 + 0.5 * Math.sin(animatedDepth * 0.34 - scrollOffset * 0.46 + speedPulse * 0.92);
    spawnBlend = deps.clamp(spawnBlend * (0.84 + depthWaveJitter * 0.16), 0, 1);
    depthEntries.push({ animatedDepth, spawnBlend });
  }

  depthEntries.sort((a, b) => b.animatedDepth - a.animatedDepth);

  const trackSlatOverlays = [];
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
      const boundaryA =
        (i / segmentCount) * Math.PI * 2;
      const boundaryB =
        (((i + quality.segmentStep) % segmentCount) / segmentCount) *
          Math.PI *
          2;
      const segmentMidAngle = (boundaryA + boundaryB) * 0.5;
      const trackCoverage = deps.getTrackCoverage(segmentMidAngle, 0, 0);

      const x1 =
        centerX +
        Math.sin(boundaryA) * radius1 +
        (renderTube.centerOffsetX || 0) * bend1;
      const y1 =
        centerY +
        Math.cos(boundaryA) * radius1 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend1;
      const x2 =
        centerX +
        Math.sin(boundaryB) * radius1 +
        (renderTube.centerOffsetX || 0) * bend1;
      const y2 =
        centerY +
        Math.cos(boundaryB) * radius1 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend1;
      const x3 =
        centerX +
        Math.sin(boundaryB) * radius2 +
        (renderTube.centerOffsetX || 0) * bend2;
      const y3 =
        centerY +
        Math.cos(boundaryB) * radius2 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend2;
      const x4 =
        centerX +
        Math.sin(boundaryA) * radius2 +
        (renderTube.centerOffsetX || 0) * bend2;
      const y4 =
        centerY +
        Math.cos(boundaryA) * radius2 * deps.CONFIG.PLAYER_OFFSET +
        (renderTube.centerOffsetY || 0) * bend2;

      const tileFillAlpha = deps.clamp(quality.segmentAlpha * spawnBlend, 0.2, 1);
      const trackWallColor = deps.blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);
      renderer.baseGraphics.fillStyle(trackWallColor, tileFillAlpha);
      deps.drawQuadPath(renderer.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
      renderer.baseGraphics.fillPath();
      deps.drawTunnelDarkeningOverlay(renderer.fogGraphics, {
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        p3: { x: x3, y: y3 },
        p4: { x: x4, y: y4 },
      }, depthRatio, segmentMidAngle, 0, 0);

      const ambientGridBlend = deps.clamp(deps.GRID_AMBIENT_ALPHA_FLOOR + depthRatio * deps.GRID_AMBIENT_DEPTH_BOOST, 0, 0.2);
      const gridBlend = Math.max(spawnBlend, ambientGridBlend);
      gridRadialOverlays.push({
        x1,
        y1,
        x4,
        y4,
        depthRatio,
        gridBlend,
      });
      gridRingOverlays.push({
        x1,
        y1,
        x2,
        y2,
        depthRatio,
        gridBlend,
      });

      const floorFacingAngle = 0;
      if (trackCoverage > 0) {
        const normalizedTrackAngle = deps.normalizeAngleDiff(segmentMidAngle - floorFacingAngle);
        let nearestLaneCenter = deps.TRACK_LANE_CENTERS[0];
        let nearestLaneDistance = Number.POSITIVE_INFINITY;
        for (const laneCenter of deps.TRACK_LANE_CENTERS) {
          const laneAngle = laneCenter * deps.LANE_ANGLE_STEP;
          const laneDistance = Math.abs(deps.normalizeAngleDiff(normalizedTrackAngle - laneAngle));
          if (laneDistance < nearestLaneDistance) {
            nearestLaneDistance = laneDistance;
            nearestLaneCenter = laneCenter;
          }
        }
        const treadPhase = ((animatedDepth + scrollOffset * 0.7) % deps.TRACK_SLAT_PERIOD + deps.TRACK_SLAT_PERIOD) % deps.TRACK_SLAT_PERIOD;
        const riseProgress = deps.clamp(treadPhase / Math.max(deps.TRACK_SLAT_SOFTNESS, 0.0001), 0, 1);
        const fallProgress = deps.clamp((treadPhase - deps.TRACK_SLAT_LENGTH) / Math.max(deps.TRACK_SLAT_SOFTNESS, 0.0001), 0, 1);
        const riseEase = riseProgress * riseProgress * (3 - 2 * riseProgress);
        const fallEase = fallProgress * fallProgress * (3 - 2 * fallProgress);
        const slatVisibility = riseEase * (1 - fallEase);
        if (slatVisibility > 0.001) {
          trackSlatOverlays.push({
            x1,
            y1,
            x2,
            y2,
            x3,
            y3,
            x4,
            y4,
            depthRatio,
            trackCoverage,
            slatVisibility,
            spawnBlend,
          });
        }
      }

    }
  }

  for (const slat of trackSlatOverlays) {
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

  for (const line of gridRingOverlays) {
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

  for (const line of gridRadialOverlays) {
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

  renderer.drawMouthRing(centerX, centerY, renderTube);
}

export { drawTunnelPass };
