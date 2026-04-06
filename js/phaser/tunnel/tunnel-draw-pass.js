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
  const scrollOffset = (renderTube.scroll || 0) * 0.0035 * normalizedSpeed;
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
  const gridEnergyOverlays = [];
  const interTileFlameOverlays = [];
  const speedStreakOverlays = [];
  const waveOverlays = [];
  const speedPulse = (renderer.scene.time.now || 0) * 0.00013;
  const gridPulseTime = (renderer.scene.time.now || 0) * 0.00065;

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
        (i / segmentCount) * Math.PI * 2 + renderTube.rotation + renderTube.curveAngle;
      const boundaryB =
        (((i + quality.segmentStep) % segmentCount) / segmentCount) *
          Math.PI *
          2 +
        renderTube.rotation +
        renderTube.curveAngle;
      const segmentMidAngle = (boundaryA + boundaryB) * 0.5;
      const trackCoverage = deps.getTrackCoverage(segmentMidAngle, renderTube.rotation, renderTube.curveAngle);

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
      }, depthRatio, segmentMidAngle, renderTube.rotation, renderTube.curveAngle);
      deps.drawSegmentGlintOverlay(renderer.fxGraphics, {
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        p3: { x: x3, y: y3 },
        p4: { x: x4, y: y4 },
      }, segmentMidAngle, renderTube.rotation, depthRatio, spawnBlend);

      const ambientGridBlend = deps.clamp(deps.GRID_AMBIENT_ALPHA_FLOOR + depthRatio * deps.GRID_AMBIENT_DEPTH_BOOST, 0, 0.2);
      const gridBlend = Math.max(spawnBlend, ambientGridBlend);
      const waveFlow = 0.5 + 0.5 * Math.sin(
        segmentMidAngle * 1.35 -
        animatedDepth * 0.29 -
        scrollOffset * 0.74 +
        speedPulse * 1.25,
      );
      const waveGate = Math.pow(waveFlow, 2.8);
      if (waveGate > 0.04 && spawnBlend > 0.03) {
        waveOverlays.push({
          x1,
          y1,
          x2,
          y2,
          x3,
          y3,
          x4,
          y4,
          depthRatio,
          spawnBlend: deps.clamp(spawnBlend * (0.6 + waveGate * 0.55), 0, 1),
          alphaScale: deps.clamp(0.65 + waveGate * 0.7, 0.2, 1.25),
        });
      }
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
      const energyDepthWithinRange =
        depthRatio >= deps.GRID_ENERGY_MIN_DEPTH_RATIO && depthRatio <= deps.GRID_ENERGY_MAX_DEPTH_RATIO;
      if (energyDepthWithinRange && gridBlend > 0.02) {
        const flowSeed = i * 0.67 + animatedDepth * deps.GRID_ENERGY_SWEEP_DENSITY;
        const flowPulse = 0.5 + 0.5 * Math.sin(flowSeed - gridPulseTime * deps.GRID_ENERGY_SWEEP_SPEED * 7.2);
        const flowGate = Math.pow(flowPulse, 6.4);
        if (flowGate > 0.05) {
          gridEnergyOverlays.push({
            quad: {
              p1: { x: x1, y: y1 },
              p2: { x: x2, y: y2 },
              p3: { x: x3, y: y3 },
              p4: { x: x4, y: y4 },
            },
            depthRatio,
            spawnBlend,
            gridBlend,
            flowGate,
            colorMix: (Math.sin(flowSeed * 1.7) + 1) * 0.5,
          });
        }
        const flameFlicker = 0.5 + 0.5 * Math.sin(flowSeed * 2.1 + gridPulseTime * 5.1);
        const flameNoise = deps.hashNoise(flowSeed * 17.1 + Math.floor(animatedDepth * 3.3));
        if (flameNoise > 0.58 && flameFlicker > 0.22) {
          interTileFlameOverlays.push({
            quad: {
              p1: { x: x1, y: y1 },
              p2: { x: x2, y: y2 },
              p3: { x: x3, y: y3 },
              p4: { x: x4, y: y4 },
            },
            depthRatio,
            gridBlend,
            spawnBlend,
            flicker: flameFlicker,
            flameShift: (flowSeed * 0.11 + gridPulseTime * 0.09) % 1,
          });
        }
      }

      const floorFacingAngle = renderTube.rotation + renderTube.curveAngle;
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

      const wallCoverage = 1 - deps.clamp(trackCoverage, 0, 1);
      if (wallCoverage > 0.25) {
        const depthPhase = animatedDepth * 0.33 - scrollOffset * 1.7 + speedPulse;
        const stripePulse = 0.5 + 0.5 * Math.sin(depthPhase);
        const stripeGate = Math.pow(stripePulse, 7.5);
        const segmentNoise = deps.hashNoise(i * 13.77 + Math.floor(animatedDepth) * 0.91);
        const depthWithinRange = depthRatio >= deps.SPEED_STREAK_MIN_DEPTH_RATIO && depthRatio <= deps.SPEED_STREAK_MAX_DEPTH_RATIO;
        if (depthWithinRange && stripeGate > 0.08 && segmentNoise > 0.48) {
          speedStreakOverlays.push({
            quad: {
              p1: { x: x1, y: y1 },
              p2: { x: x2, y: y2 },
              p3: { x: x3, y: y3 },
              p4: { x: x4, y: y4 },
            },
            depthRatio,
            spawnBlend,
            wallCoverage,
            colorIndex: (i + Math.floor(animatedDepth)) % deps.SPEED_STREAK_COLORS.length,
            streakAlpha: stripeGate,
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

  for (const wave of waveOverlays) {
    deps.drawSoftWaveOverlay(renderer.fxGraphics, wave, 0.42, wave.alphaScale);
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

  for (const energy of gridEnergyOverlays) {
    const sweepCenter =
      ((energy.depthRatio * deps.GRID_ENERGY_SWEEP_DENSITY + gridPulseTime * deps.GRID_ENERGY_SWEEP_SPEED) % 1 + 1) % 1;
    const halfWidth = deps.clamp(deps.GRID_ENERGY_WIDTH_RATIO * (0.75 + 0.25 * energy.flowGate), 0.04, 0.42);
    const bandStart = deps.clamp(sweepCenter - halfWidth, 0.02, 0.96);
    const bandEnd = deps.clamp(sweepCenter + halfWidth, 0.04, 0.98);
    if (bandEnd - bandStart < 0.01) continue;
    const energyColor = deps.blendColor(deps.GRID_ENERGY_COLOR_A, deps.GRID_ENERGY_COLOR_B, energy.colorMix);
    const energyAlpha = deps.amplifiedAlpha(
      deps.clamp(
        (deps.GRID_ENERGY_BASE_ALPHA + energy.depthRatio * 0.048) *
          energy.spawnBlend *
          energy.gridBlend *
          energy.flowGate,
        0,
        deps.GRID_ENERGY_MAX_ALPHA,
      ),
      0.45,
    );
    if (energyAlpha <= 0.002) continue;
    renderer.fxGraphics.fillStyle(energyColor, energyAlpha);
    deps.fillQuad(renderer.fxGraphics, deps.getQuadBand(energy.quad, bandStart, bandEnd));
  }

  for (const flame of interTileFlameOverlays) {
    const flameBandWidth = deps.clamp(0.018 + flame.flicker * 0.05, 0.014, 0.11);
    const bandStart = deps.clamp(flame.flameShift - flameBandWidth * 0.5, 0.01, 0.95);
    const bandEnd = deps.clamp(flame.flameShift + flameBandWidth * 0.5, 0.05, 0.99);
    if (bandEnd - bandStart < 0.01) continue;
    const flameColor = deps.blendColor(0x39c8ff, 0x94efff, flame.flicker * 0.75);
    const flameAlpha = deps.amplifiedAlpha(
      deps.clamp(
        (0.022 + flame.depthRatio * 0.05) *
          flame.gridBlend *
          flame.spawnBlend *
          flame.flicker,
        0,
        0.21,
      ),
      0.42,
    );
    if (flameAlpha <= 0.002) continue;
    renderer.fxGraphics.fillStyle(flameColor, flameAlpha);
    deps.fillQuad(renderer.fxGraphics, deps.getQuadBand(flame.quad, bandStart, bandEnd));
  }

  for (const streak of speedStreakOverlays) {
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
