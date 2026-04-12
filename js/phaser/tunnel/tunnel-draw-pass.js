import {
  buildPeriodicStripeOverlaysPass,
  renderPeriodicStripeLayerPass,
} from './tunnel-periodic-stripes-pass.js';

function getTunnelFrameBuffers(renderer) {
  if (renderer.__tunnelFrameBuffers) {
    return renderer.__tunnelFrameBuffers;
  }
  renderer.__tunnelFrameBuffers = {
    depthEntries: [],
    lampDepthSteps: [],
    trackSlatOverlays: [],
    periodicStripeOverlays: [],
    gridRingOverlays: [],
    gridRadialOverlays: [],
    speedStreakOverlays: [],
  };
  return renderer.__tunnelFrameBuffers;
}

const CURVE_DEPTH_SHIFT_X = 0.92;
const CURVE_DEPTH_SHIFT_Y = 0.22;
const CURVE_CENTER_BIAS_X = 0.86;
const CURVE_CENTER_BIAS_Y = 0.62;

function buildDepthFrame(renderer, deps, snapshot, renderTube, viewport) {
  const frameBuffers = getTunnelFrameBuffers(renderer);
  const depthEntries = frameBuffers.depthEntries;
  const lampDepthSteps = frameBuffers.lampDepthSteps;
  depthEntries.length = 0;
  lampDepthSteps.length = 0;

  const width = viewport.width || renderer.scene.scale.width;
  const height = viewport.height || renderer.scene.scale.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const qualityName = renderTube.quality || 'high';
  const quality = deps.QUALITY_PRESETS[qualityName] || deps.QUALITY_PRESETS.high;
  const segmentCount = deps.CONFIG.TUBE_SEGMENTS;
  const maxDepth = deps.CONFIG.TUBE_DEPTH_STEPS;
  const normalizedSpeed = deps.clamp((renderTube.speed || deps.CONFIG.SPEED_START || 1) / Math.max(0.0001, deps.CONFIG.SPEED_START || 1), 0.2, 3);
  const scrollOffset = (renderTube.scroll || 0) * 0.035 * normalizedSpeed;
  const ringShift = Math.floor(scrollOffset);
  const ringPhase = scrollOffset - ringShift;
  const lampPulseHalfWidth = Math.max(quality.depthStep * 1.5, 0.9);
  const nowMs = renderer.scene.time.now || 0;
  const gridPulseAlpha = deps.getGridPulseAlpha(nowMs);
  const speedPulse = nowMs * 0.0013;
  if (Array.isArray(snapshot?.lamps)) {
    for (const lamp of snapshot.lamps) {
      const lampDepthStep = Number.isFinite(lamp?.z) ? lamp.z / deps.CONFIG.TUBE_Z_STEP : NaN;
      if (Number.isFinite(lampDepthStep)) {
        lampDepthSteps.push(lampDepthStep);
      }
    }
  }

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
  return {
    centerX,
    centerY,
    quality,
    segmentCount,
    maxDepth,
    scrollOffset,
    depthEntries,
    gridPulseAlpha,
    speedPulse,
  };
}

function renderBaseLayer(renderer, deps, renderTube, frame) {
  const {
    centerX,
    centerY,
    quality,
    segmentCount,
    maxDepth,
    scrollOffset,
    depthEntries,
    speedPulse,
  } = frame;

  const frameBuffers = getTunnelFrameBuffers(renderer);
  const trackSlatOverlays = frameBuffers.trackSlatOverlays;
  const gridRingOverlays = frameBuffers.gridRingOverlays;
  const gridRadialOverlays = frameBuffers.gridRadialOverlays;
  const speedStreakOverlays = frameBuffers.speedStreakOverlays;
  trackSlatOverlays.length = 0;
  gridRingOverlays.length = 0;
  gridRadialOverlays.length = 0;
  speedStreakOverlays.length = 0;
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
    const curveAngle = Number(renderTube.curveAngle) || 0;
    const curveStrength = deps.clamp(Math.abs(curveAngle) / (Math.PI * 0.5), 0, 1);
    const centerOffsetX = Number(renderTube.centerOffsetX) || 0;
    const centerOffsetY = Number(renderTube.centerOffsetY) || 0;
    const centerDeviation = deps.clamp(
      Math.hypot(centerOffsetX, centerOffsetY) / Math.max(1, deps.CONFIG.TUBE_RADIUS * 0.9),
      0,
      1,
    );
    const curveDepth1 = Math.pow(bend1, 1.45);
    const curveDepth2 = Math.pow(bend2, 1.45);
    const curveOffsetX1 = Math.sin(curveAngle) * deps.CONFIG.TUBE_RADIUS * CURVE_DEPTH_SHIFT_X * curveDepth1 + centerOffsetX * curveDepth1 * CURVE_CENTER_BIAS_X;
    const curveOffsetY1 = Math.cos(curveAngle) * deps.CONFIG.TUBE_RADIUS * deps.CONFIG.PLAYER_OFFSET * CURVE_DEPTH_SHIFT_Y * curveDepth1 + centerOffsetY * curveDepth1 * CURVE_CENTER_BIAS_Y;
    const curveOffsetX2 = Math.sin(curveAngle) * deps.CONFIG.TUBE_RADIUS * CURVE_DEPTH_SHIFT_X * curveDepth2 + centerOffsetX * curveDepth2 * CURVE_CENTER_BIAS_X;
    const curveOffsetY2 = Math.cos(curveAngle) * deps.CONFIG.TUBE_RADIUS * deps.CONFIG.PLAYER_OFFSET * CURVE_DEPTH_SHIFT_Y * curveDepth2 + centerOffsetY * curveDepth2 * CURVE_CENTER_BIAS_Y;
    const turnOcclusionStrength = Math.max(curveStrength, centerDeviation);
    const curveOcclusion = deps.clamp(1 - turnOcclusionStrength * ((curveDepth1 + curveDepth2) * 0.5) * 0.95, 0.06, 1);
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
        curveOffsetX1 +
        centerOffsetX * bend1;
      const y1 =
        centerY +
        Math.cos(boundaryA) * radius1 * deps.CONFIG.PLAYER_OFFSET +
        curveOffsetY1 +
        centerOffsetY * bend1;
      const x2 =
        centerX +
        Math.sin(boundaryB) * radius1 +
        curveOffsetX1 +
        centerOffsetX * bend1;
      const y2 =
        centerY +
        Math.cos(boundaryB) * radius1 * deps.CONFIG.PLAYER_OFFSET +
        curveOffsetY1 +
        centerOffsetY * bend1;
      const x3 =
        centerX +
        Math.sin(boundaryB) * radius2 +
        curveOffsetX2 +
        centerOffsetX * bend2;
      const y3 =
        centerY +
        Math.cos(boundaryB) * radius2 * deps.CONFIG.PLAYER_OFFSET +
        curveOffsetY2 +
        centerOffsetY * bend2;
      const x4 =
        centerX +
        Math.sin(boundaryA) * radius2 +
        curveOffsetX2 +
        centerOffsetX * bend2;
      const y4 =
        centerY +
        Math.cos(boundaryA) * radius2 * deps.CONFIG.PLAYER_OFFSET +
        curveOffsetY2 +
        centerOffsetY * bend2;

      const tileVisibility = deps.clamp(quality.segmentAlpha * spawnBlend * curveOcclusion, 0.08, 1);
      const trackWallBackdropColor = deps.blendColor(wallColor, 0x18304d, 0.46 + trackCoverage * 0.2);
      renderer.baseGraphics.fillStyle(trackWallBackdropColor, 1);
      deps.drawQuadPath(renderer.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
      renderer.baseGraphics.fillPath();

      const trackWallTintedColor = deps.blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);
      const trackWallColor = deps.blendColor(trackWallTintedColor, 0x060b16, 1 - tileVisibility);
      const trackWallOverlayAlpha = deps.clamp(0.22 + tileVisibility * 0.5, 0.22, 0.72);
      renderer.baseGraphics.fillStyle(trackWallColor, trackWallOverlayAlpha);
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

      const floorFacingAngle = renderTube.rotation + renderTube.curveAngle;
      if (trackCoverage > 0) {
        const normalizedTrackAngle = deps.normalizeAngleDiff(segmentMidAngle - floorFacingAngle);
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
        const stripeGateCurve = Math.pow(stripePulse, 5.2);
        const stripeGate = deps.clamp((stripeGateCurve - 0.06) / 0.66, 0, 1);
        const segmentNoise = deps.hashNoise(i * 13.77 + Math.floor(animatedDepth) * 0.91);
        const noiseBlend = deps.clamp((segmentNoise - 0.42) / 0.2, 0, 1);
        const depthWithinRange = depthRatio >= deps.SPEED_STREAK_MIN_DEPTH_RATIO && depthRatio <= deps.SPEED_STREAK_MAX_DEPTH_RATIO;
        if (depthWithinRange && stripeGate > 0.015 && noiseBlend > 0.01) {
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
            streakAlpha: stripeGate * noiseBlend,
          });
        }
      }
    }
  }
  return {
    trackSlatOverlays,
    gridRingOverlays,
    gridRadialOverlays,
    speedStreakOverlays,
  };
}

function renderTrackLayer(renderer, deps, trackSlatOverlays) {
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
}

function renderGridLayer(renderer, deps, gridRingOverlays, gridRadialOverlays, gridPulseAlpha) {
  for (const line of gridRingOverlays) {
    const ringColor = deps.blendColor(deps.GRID_COLOR_FAR, deps.GRID_COLOR_NEAR, line.depthRatio * 0.8);
    const ringGlowColor = deps.blendColor(deps.GRID_COLOR_FAR, deps.GRID_COLOR_NEAR, 0.35 + line.depthRatio * 0.55);
    const ringVisibilityFloor = deps.GRID_MIN_VISIBILITY_ALPHA * (0.6 + line.depthRatio * 0.4);
    const ringGlowAlpha = deps.amplifiedAlpha(
      deps.clamp(
        ringVisibilityFloor * 0.6 +
          (0.01 + line.depthRatio * 0.03) *
            line.gridBlend *
            deps.GRID_ALPHA_MULTIPLIER *
            deps.GRID_GLOW_ALPHA_MULTIPLIER *
            gridPulseAlpha,
        0,
        0.08,
      ),
      0.12,
    );
    if (ringGlowAlpha > 0.001) {
      renderer.fxGraphics.lineStyle(deps.GRID_RING_GLOW_LINE_WIDTH, ringGlowColor, ringGlowAlpha);
      renderer.fxGraphics.beginPath();
      renderer.fxGraphics.moveTo(line.x1, line.y1);
      renderer.fxGraphics.lineTo(line.x2, line.y2);
      renderer.fxGraphics.strokePath();
    }
    const ringAlpha = deps.amplifiedAlpha(
      deps.clamp(
        ringVisibilityFloor +
          (0.035 + line.depthRatio * 0.085) * line.gridBlend * deps.GRID_ALPHA_MULTIPLIER * gridPulseAlpha,
        0,
        0.24,
      ),
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
    const radialGlowColor = deps.blendColor(deps.GRID_COLOR_FAR, deps.GRID_COLOR_NEAR, 0.28 + line.depthRatio * 0.52);
    const radialVisibilityFloor = deps.GRID_MIN_VISIBILITY_ALPHA * (0.68 + line.depthRatio * 0.32);
    const radialGlowAlpha = deps.amplifiedAlpha(
      deps.clamp(
        radialVisibilityFloor * 0.64 +
          (0.012 + line.depthRatio * 0.036) *
            line.gridBlend *
            deps.GRID_ALPHA_MULTIPLIER *
            deps.GRID_GLOW_ALPHA_MULTIPLIER *
            gridPulseAlpha,
        0,
        0.1,
      ),
      0.16,
    );
    if (radialGlowAlpha > 0.001) {
      renderer.fxGraphics.lineStyle(deps.GRID_RADIAL_GLOW_LINE_WIDTH, radialGlowColor, radialGlowAlpha);
      renderer.fxGraphics.beginPath();
      renderer.fxGraphics.moveTo(line.x1, line.y1);
      renderer.fxGraphics.lineTo(line.x4, line.y4);
      renderer.fxGraphics.strokePath();
    }
    const radialAlpha = deps.amplifiedAlpha(
      deps.clamp(
        radialVisibilityFloor +
          (0.046 + line.depthRatio * 0.1) * line.gridBlend * deps.GRID_ALPHA_MULTIPLIER * gridPulseAlpha,
        0,
        0.28,
      ),
      0.33,
    );
    if (radialAlpha <= 0.002) continue;
    renderer.lightGraphics.lineStyle(deps.GRID_RADIAL_LINE_WIDTH, radialColor, radialAlpha);
    renderer.lightGraphics.beginPath();
    renderer.lightGraphics.moveTo(line.x1, line.y1);
    renderer.lightGraphics.lineTo(line.x4, line.y4);
    renderer.lightGraphics.strokePath();
  }
}

function renderFxLayer(renderer, deps, speedStreakOverlays, speedPulse) {
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
}

function renderVolumetricSlices(renderer, deps, frame, renderTube) {
  const { centerX, centerY, depthEntries, maxDepth } = frame;
  if (!renderer.fxGraphics || !Array.isArray(depthEntries) || depthEntries.length === 0) return;

  const sliceStep = Math.max(2, Math.floor(depthEntries.length / 6));
  for (let index = 0; index < depthEntries.length; index += sliceStep) {
    const depthEntry = depthEntries[index];
    const z = depthEntry.animatedDepth * deps.CONFIG.TUBE_Z_STEP;
    const scale = Math.max(0.05, 1 - z);
    if (scale < 0.32) continue;
    const bendInfluence = 1 - scale;
    const depthRatio = 1 - (((depthEntry.animatedDepth % maxDepth) + maxDepth) % maxDepth) / maxDepth;
    const width = Math.max(30, deps.CONFIG.TUBE_RADIUS * scale * 1.34);
    const height = width * deps.CONFIG.PLAYER_OFFSET * 0.84;
    const alpha = deps.amplifiedAlpha(
      deps.clamp((0.008 + depthRatio * 0.024) * (0.2 + depthEntry.spawnBlend * 0.45), 0, 0.038),
      0.16,
    );
    if (alpha <= 0.002) continue;

    const sliceColor = deps.blendColor(0x4ec4ff, 0xe2f5ff, depthRatio * 0.6);
    const x = centerX + (renderTube.centerOffsetX || 0) * bendInfluence;
    const y = centerY + (renderTube.centerOffsetY || 0) * bendInfluence;

    renderer.fxGraphics.lineStyle(1.2, sliceColor, Math.min(0.09, alpha * 1.5));
    renderer.fxGraphics.strokeEllipse(x, y, width * 0.9, height * 0.9);
  }
}

function drawTunnelPass(renderer, deps) {
  const snapshot = renderer.snapshot;
  const viewport = snapshot?.viewport;
  const tube = snapshot?.tube;

  renderer.baseGraphics.clear();
  renderer.lightGraphics.clear();
  renderer.stripeGraphics?.clear();
  renderer.fogGraphics?.clear();
  renderer.fxGraphics?.clear();
  renderer.flashGraphics?.clear();
  renderer.hideDepthLightRaySprites();

  if (!viewport || !tube) return;
  const renderTube = renderer.getSmoothedTube(tube);
  if (!renderTube) return;

  const frame = buildDepthFrame(renderer, deps, snapshot, renderTube, viewport);
  const overlays = renderBaseLayer(renderer, deps, renderTube, frame);
  const periodicStripeOverlays = buildPeriodicStripeOverlaysPass(
    renderer,
    deps,
    renderTube,
    frame,
    {
      depthShiftX: CURVE_DEPTH_SHIFT_X,
      depthShiftY: CURVE_DEPTH_SHIFT_Y,
      centerBiasX: CURVE_CENTER_BIAS_X,
      centerBiasY: CURVE_CENTER_BIAS_Y,
    },
  );
  renderTrackLayer(renderer, deps, overlays.trackSlatOverlays);
  renderGridLayer(
    renderer,
    deps,
    overlays.gridRingOverlays,
    overlays.gridRadialOverlays,
    frame.gridPulseAlpha,
  );
  renderPeriodicStripeLayerPass(renderer, deps, periodicStripeOverlays, frame.speedPulse);
  renderVolumetricSlices(renderer, deps, frame, renderTube);
  renderFxLayer(renderer, deps, overlays.speedStreakOverlays, frame.speedPulse);

  renderer.drawMouthRing(frame.centerX, frame.centerY, renderTube);
}

export { drawTunnelPass };
