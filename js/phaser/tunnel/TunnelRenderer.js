import { CONFIG } from '../../config.js';
import {
  ensureDepthLightRaySprites as ensureDepthLightRaySpritesPass,
  hideDepthLightRaySprites as hideDepthLightRaySpritesPass,
  renderDepthLightRays as renderDepthLightRaysPass,
  updateDepthLightRays as updateDepthLightRaysPass,
} from './tunnel-depth-rays.js';
import {
  GRID_ALPHA_MULTIPLIER,
  GRID_AMBIENT_ALPHA_FLOOR,
  GRID_AMBIENT_DEPTH_BOOST,
  GRID_COLOR_FAR,
  GRID_COLOR_NEAR,
  GRID_GLOW_ALPHA_MULTIPLIER,
  GRID_MIN_VISIBILITY_ALPHA,
  GRID_WAVE_BAND_SOFTNESS,
  GRID_WAVE_CORE_ALPHA,
  GRID_WAVE_CORE_COLOR,
  GRID_WAVE_CORE_LINE_WIDTH,
  GRID_WAVE_DISTANCE_PERIOD_METERS,
  GRID_WAVE_GLOW_ALPHA,
  GRID_WAVE_GLOW_COLOR,
  GRID_WAVE_GLOW_LINE_WIDTH,
  GRID_RADIAL_GLOW_LINE_WIDTH,
  GRID_RADIAL_LINE_WIDTH,
  GRID_RING_GLOW_LINE_WIDTH,
  GRID_RING_LINE_WIDTH,
  INNER_RADIUS_RATIO,
  LANE_ANGLE_STEP,
  MOUTH_EXTENSION_DEPTH,
  PERIODIC_STRIPE_ANGLE_REPEAT,
  PERIODIC_STRIPE_ANGLE_WIDTH,
  PERIODIC_STRIPE_BASE_ALPHA,
  PERIODIC_STRIPE_COLORS,
  PERIODIC_STRIPE_LENGTH,
  PERIODIC_STRIPE_MAX_ALPHA,
  PERIODIC_STRIPE_PERIOD,
  PERIODIC_STRIPE_RAY_GLOW_LINE_WIDTH,
  PERIODIC_STRIPE_RAY_LINE_WIDTH,
  PERIODIC_STRIPE_RAY_SPARSE_NOISE_THRESHOLD,
  PERIODIC_STRIPE_SOFTNESS,
  QUALITY_PRESETS,
  SPEED_STREAK_BASE_ALPHA,
  SPEED_STREAK_COLORS,
  SPEED_STREAK_MAX_ALPHA,
  SPEED_STREAK_MAX_DEPTH_RATIO,
  SPEED_STREAK_MIN_DEPTH_RATIO,
  SPEED_STREAK_WIDTH_RATIO,
  TRACK_LANE_CENTERS,
  TRACK_SLAT_ALPHA_MULTIPLIER,
  TRACK_SLAT_LENGTH,
  TRACK_SLAT_PERIOD,
  TRACK_SLAT_SOFTNESS,
} from './tunnel-config.js';
import {
  blendColor,
  clamp,
  drawQuadPath,
  fillQuad,
  getDeltaSmoothingFactor,
  getQuadBand,
  hashNoise,
  lerp,
  lerpAngle,
  normalizeAngleDiff,
} from './tunnel-math-utils.js';
import { drawTunnelPass } from './tunnel-draw-pass.js';

const BASE_URL = import.meta.env.BASE_URL || './';
const TRACK_BAND_HALF_WIDTH = 0.24;
const TRACK_EDGE_SOFTNESS = 0.12;
const LAMP_BRIGHTNESS_MULTIPLIER = 100;
const GRID_DIM_ALPHA_RATIO = 0.24;
const DEPTH_LIGHT_RAY_TEXTURE_KEYS = Object.freeze([
  'depth_light_streak_custom_1',
  'depth_light_streak_custom_2',
]);
const DEPTH_LIGHT_RAY_POOL_SIZE = 8;
const DEPTH_LIGHT_RAY_MAX_ACTIVE = 8;
const DEPTH_LIGHT_RAY_MIN_RESPAWN_MS = 45;
const DEPTH_LIGHT_RAY_MAX_RESPAWN_MS = 220;
const DEPTH_LIGHT_RAY_MIN_TRAVEL_MS = 760;
const DEPTH_LIGHT_RAY_MAX_TRAVEL_MS = 1280;
const DEPTH_LIGHT_RAY_ALPHA_MAX = 0.32;
const DEPTH_LIGHT_RAY_ANGLE_JITTER = 0.18;
const DEPTH_LIGHT_RAY_SURFACE_OFFSETS = Object.freeze([
  -2.32,
  -1.9,
  -1.42,
  -0.98,
  -0.58,
  0.58,
  0.98,
  1.42,
  1.9,
  2.32,
]);
const GRID_PULSE_CYCLE_MS = 8000;
const GRID_FADE_OUT_MS = 3000;
const GRID_DIM_HOLD_MS = 2000;
const GRID_FADE_IN_MS = 3000;
const SPAWNED_RING_ALPHA_MULTIPLIER = 0.14;
const MOUTH_RING_ALPHA_MULTIPLIER = 0.4;
const WAVE_BASE_ALPHA_CAP = 0.26;
const WAVE_ALPHA_MULTIPLIER = 0.5;
const WAVE_CORE_BAND_ALPHA_FACTOR = 0.72;
const WAVE_MID_BAND_ALPHA_FACTOR = 0.42;
const WAVE_EDGE_BAND_ALPHA_FACTOR = 0.24;
const WAVE_OUTER_GLOW_ALPHA_FACTOR = 0.1;
const TUNNEL_SCROLL_VISUAL_MULTIPLIER = 0.016;
const TRACK_SLAT_SCROLL_FACTOR = 0.18;
const WALL_WAVE_SCROLL_FACTOR = 0.52;
const TUNNEL_DARKEN_BASE_ALPHA = 0.05;
const TUNNEL_DARKEN_DEPTH_ALPHA = 0.22;
const TUNNEL_DARKEN_SIDE_ALPHA = 0.16;
const TUNNEL_DARKEN_ALPHA_CAP = 0.42;
const DEFAULT_DELTA_SECONDS = 1 / 60;

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function drawSoftWaveOverlay(graphics, overlay, depthMix = 0.3, alphaScale = 1) {
  const overlayColor = blendColor(0x6ba6eb, 0xdff3ff, overlay.depthRatio * depthMix);
  const baseAlpha = amplifiedAlpha(clamp(
    (0.14 + overlay.depthRatio * 0.16) *
      overlay.spawnBlend *
      SPAWNED_RING_ALPHA_MULTIPLIER *
      WAVE_ALPHA_MULTIPLIER *
      alphaScale,
    0,
    WAVE_BASE_ALPHA_CAP,
  ));
  if (baseAlpha <= 0.003) {
    return;
  }

  const quad = {
    p1: { x: overlay.x1, y: overlay.y1 },
    p2: { x: overlay.x2, y: overlay.y2 },
    p3: { x: overlay.x3, y: overlay.y3 },
    p4: { x: overlay.x4, y: overlay.y4 },
  };

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_CORE_BAND_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0.26, 0.74));

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_MID_BAND_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0.14, 0.86));

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_EDGE_BAND_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0.05, 0.95));

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_OUTER_GLOW_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0, 1));
}

function drawTunnelDarkeningOverlay(graphics, quad, depthRatio, segmentMidAngle, tubeRotation, curveAngle) {
  const farDepthRatio = 1 - clamp(depthRatio, 0, 1);
  const lightFacingAngle = tubeRotation + curveAngle;
  const sideDistance = Math.abs(normalizeAngleDiff(segmentMidAngle - lightFacingAngle));
  const sideDarkness = Math.pow(clamp(sideDistance / Math.PI, 0, 1), 1.3);
  const darkeningAlpha = clamp(
    TUNNEL_DARKEN_BASE_ALPHA +
      farDepthRatio * TUNNEL_DARKEN_DEPTH_ALPHA +
      sideDarkness * TUNNEL_DARKEN_SIDE_ALPHA,
    0,
    TUNNEL_DARKEN_ALPHA_CAP,
  );
  if (darkeningAlpha <= 0.002) {
    return;
  }

  graphics.fillStyle(0x000000, darkeningAlpha);
  fillQuad(graphics, quad);
}

function getGridPulseAlpha(timeMs) {
  const cycleTime = ((timeMs % GRID_PULSE_CYCLE_MS) + GRID_PULSE_CYCLE_MS) % GRID_PULSE_CYCLE_MS;
  if (cycleTime < GRID_FADE_OUT_MS) {
    return lerp(1, GRID_DIM_ALPHA_RATIO, cycleTime / GRID_FADE_OUT_MS);
  }
  if (cycleTime < GRID_FADE_OUT_MS + GRID_DIM_HOLD_MS) {
    return GRID_DIM_ALPHA_RATIO;
  }
  const fadeInProgress = (cycleTime - GRID_FADE_OUT_MS - GRID_DIM_HOLD_MS) / GRID_FADE_IN_MS;
  return lerp(GRID_DIM_ALPHA_RATIO, 1, clamp(fadeInProgress, 0, 1));
}

function drawSegmentGlintOverlay(graphics, quad, segmentMidAngle, tubeRotation, depthRatio, spawnBlend) {
  const glintCenter = tubeRotation + 0.18;
  const glintHalfWidth = 0.34;
  const glintDistance = Math.abs(normalizeAngleDiff(segmentMidAngle - glintCenter));
  if (glintDistance > glintHalfWidth) return;

  const angleFactor = 1 - glintDistance / glintHalfWidth;
  const depthFactor = clamp(0.3 + depthRatio * 0.85, 0, 1);
  const shimmer = 0.75 + 0.25 * Math.sin(tubeRotation * 5 + depthRatio * 18);
  const alpha = amplifiedAlpha(
    clamp(angleFactor * angleFactor * depthFactor * spawnBlend * 0.085 * shimmer, 0, 0.32),
    0.34,
  );
  if (alpha <= 0.002) return;

  const color = blendColor(0xa8d7ff, 0xffffff, 0.55 + depthRatio * 0.35);
  graphics.fillStyle(color, alpha);
  fillQuad(graphics, getQuadBand(quad, 0.08, 0.48));
}

function getDepthRayScreenRotation(angle) {
  const dirX = Math.sin(angle);
  const dirY = Math.cos(angle) * CONFIG.PLAYER_OFFSET;
  const travelAngle = Math.atan2(dirY, dirX);
  return travelAngle + Math.PI * 0.5;
}

function getTubeDepthFlowPhase(tube) {
  const speedBase = Math.max(0.0001, CONFIG.SPEED_START || 1);
  const normalizedSpeed = clamp((tube?.speed || CONFIG.SPEED_START || 1) / speedBase, 0.2, 3);
  const scrollOffset = (tube?.scroll || 0) * TUNNEL_SCROLL_VISUAL_MULTIPLIER * normalizedSpeed;
  return scrollOffset - Math.floor(scrollOffset);
}

function getTubeDepthFlowOffsetRatio(tube) {
  const speedBase = Math.max(0.0001, CONFIG.SPEED_START || 1);
  const normalizedSpeed = clamp((tube?.speed || CONFIG.SPEED_START || 1) / speedBase, 0.2, 3);
  const scrollOffset = (tube?.scroll || 0) * TUNNEL_SCROLL_VISUAL_MULTIPLIER * normalizedSpeed;
  const flowPhase = scrollOffset - Math.floor(scrollOffset);
  const depthSteps = Math.max(1, CONFIG.TUBE_DEPTH_STEPS || 1);
  return flowPhase / depthSteps;
}

function getDepthFlowOffsetRatioFromPhaseDelta(flowDelta) {
  const depthSteps = Math.max(1, CONFIG.TUBE_DEPTH_STEPS || 1);
  return flowDelta / depthSteps;
}

function getDepthRatioFromWorldZ(z) {
  const maxWorldDepth = Math.max(0.0001, (CONFIG.TUBE_DEPTH_STEPS || 1) * (CONFIG.TUBE_Z_STEP || 0.072));
  return clamp(1 - z / maxWorldDepth, 0, 1);
}

function getWorldZFromDepthRatio(depthRatio) {
  const maxWorldDepth = Math.max(0.0001, (CONFIG.TUBE_DEPTH_STEPS || 1) * (CONFIG.TUBE_Z_STEP || 0.072));
  return clamp((1 - clamp(depthRatio, 0, 1)) * maxWorldDepth, 0, maxWorldDepth);
}

function getWrappedUnitDiff(current, previous) {
  let diff = current - previous;
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  return diff;
}

function amplifiedAlpha(alpha, cap = 1) {
  return clamp(alpha * LAMP_BRIGHTNESS_MULTIPLIER, 0, cap);
}

function getTrackCoverage(angle, tubeRotation, curveAngle) {
  const floorFacingAngle = tubeRotation + curveAngle;
  const normalizedAngle = normalizeAngleDiff(angle - floorFacingAngle);
  let maxCoverage = 0;

  for (const laneCenter of TRACK_LANE_CENTERS) {
    const laneAngle = laneCenter * LANE_ANGLE_STEP;
    const laneDistance = Math.abs(normalizeAngleDiff(normalizedAngle - laneAngle));
    if (laneDistance > TRACK_BAND_HALF_WIDTH + TRACK_EDGE_SOFTNESS) {
      continue;
    }

    const laneCoverage = 1 - clamp(
      (laneDistance - TRACK_BAND_HALF_WIDTH) / Math.max(TRACK_EDGE_SOFTNESS, 0.0001),
      0,
      1,
    );
    if (laneCoverage > maxCoverage) {
      maxCoverage = laneCoverage;
    }
  }

  return maxCoverage;
}

class TunnelRenderer {
  static preload(scene) {
    // Процедурные текстуры лучей создаются в create().
  }

  constructor(scene) {
    this.scene = scene;
    this.baseGraphics = null;
    this.lightGraphics = null;
    this.stripeGraphics = null;
    this.gridWaveGraphics = null;
    this.fogGraphics = null;
    this.fxGraphics = null;
    this.flashGraphics = null;
    this.snapshot = null;
    this.smoothedTube = null;
    this.depthLightRays = [];
    this.depthLightRaySprites = [];
  }

  create() {
    this.baseGraphics = this.scene.add.graphics().setDepth(1);
    this.lightGraphics = this.scene.add.graphics().setDepth(2);
    this.stripeGraphics = this.scene.add.graphics().setDepth(2.5);
    this.gridWaveGraphics = this.scene.add.graphics().setDepth(2.7);
    this.fogGraphics = this.scene.add.graphics().setDepth(3);
    this.fxGraphics = this.scene.add.graphics().setDepth(4);
    this.flashGraphics = this.scene.add.graphics().setDepth(5);
    this.depthLightRays = [];
    this.depthLightRaySprites = [];

    this.applySnapshot(this.snapshot);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    if (!this.baseGraphics || !this.lightGraphics) {
      return;
    }

    this.drawTunnel();
    this.drawOverlay();
  }

  resize() {
    this.smoothedTube = null;
    this.applySnapshot(this.snapshot);
  }

  destroy() {
    this.baseGraphics?.destroy();
    this.lightGraphics?.destroy();
    this.stripeGraphics?.destroy();
    this.gridWaveGraphics?.destroy();
    this.fogGraphics?.destroy();
    this.fxGraphics?.destroy();
    this.flashGraphics?.destroy();
    this.baseGraphics = null;
    this.lightGraphics = null;
    this.stripeGraphics = null;
    this.gridWaveGraphics = null;
    this.fogGraphics = null;
    this.fxGraphics = null;
    this.flashGraphics = null;
    this.smoothedTube = null;
    this.depthLightRays = [];
    this.depthLightRaySprites.forEach((sprite) => sprite?.destroy());
    this.depthLightRaySprites = [];
  }

  updateDepthLightRays(nowMs, tube) {
    return updateDepthLightRaysPass(this, nowMs, tube, {
      CONFIG,
      DEPTH_LIGHT_RAY_POOL_SIZE,
      DEPTH_LIGHT_RAY_MAX_ACTIVE,
      DEPTH_LIGHT_RAY_MIN_RESPAWN_MS,
      DEPTH_LIGHT_RAY_MAX_RESPAWN_MS,
      DEPTH_LIGHT_RAY_MIN_TRAVEL_MS,
      DEPTH_LIGHT_RAY_MAX_TRAVEL_MS,
      DEPTH_LIGHT_RAY_ALPHA_MAX,
      DEPTH_LIGHT_RAY_ANGLE_JITTER,
      DEPTH_LIGHT_RAY_TEXTURE_KEYS,
      DEPTH_LIGHT_RAY_SURFACE_OFFSETS,
      clamp,
      lerp,
      amplifiedAlpha,
      getDepthRayScreenRotation,
      getTubeDepthFlowPhase,
      getTubeDepthFlowOffsetRatio,
      getDepthFlowOffsetRatioFromPhaseDelta,
      getDepthRatioFromWorldZ,
      getWorldZFromDepthRatio,
      getWrappedUnitDiff,
    });
  }

  renderDepthLightRays(activeDepthLightRays, centerX, centerY, maxRadius, tube) {
    renderDepthLightRaysPass(this, activeDepthLightRays, centerX, centerY, maxRadius, tube, {
      CONFIG,
      DEPTH_LIGHT_RAY_ALPHA_MAX,
      DEPTH_LIGHT_RAY_TEXTURE_KEYS,
      clamp,
      amplifiedAlpha,
      getDepthRayScreenRotation,
      getWorldZFromDepthRatio,
    });
  }

  hideDepthLightRaySprites() {
    hideDepthLightRaySpritesPass(this);
  }

  ensureDepthLightRaySprites() {
    ensureDepthLightRaySpritesPass(this, {
      DEPTH_LIGHT_RAY_MAX_ACTIVE,
      DEPTH_LIGHT_RAY_TEXTURE_KEYS,
      DEPTH_LIGHT_RAY_MIN_RESPAWN_MS,
      DEPTH_LIGHT_RAY_MAX_RESPAWN_MS,
      DEPTH_LIGHT_RAY_MIN_TRAVEL_MS,
      DEPTH_LIGHT_RAY_MAX_TRAVEL_MS,
    });
  }

  getSmoothedTube(tube) {
    if (!tube) return null;
    if (!this.smoothedTube) {
      this.smoothedTube = { ...tube };
      return this.smoothedTube;
    }

    const deltaSeconds = Math.max(0, Number(this.scene?.game?.loop?.delta) || DEFAULT_DELTA_SECONDS) / 1000;
    const smoothing = getDeltaSmoothingFactor(16.44, deltaSeconds);
    const scrollSmoothing = getDeltaSmoothingFactor(10.47, deltaSeconds);
    this.smoothedTube.rotation = lerpAngle(this.smoothedTube.rotation || 0, tube.rotation || 0, smoothing);
    this.smoothedTube.scroll = lerp(this.smoothedTube.scroll || 0, tube.scroll || 0, scrollSmoothing);
    this.smoothedTube.waveMod = lerp(this.smoothedTube.waveMod || 0, tube.waveMod || 0, smoothing);
    this.smoothedTube.curveAngle = lerpAngle(this.smoothedTube.curveAngle || 0, tube.curveAngle || 0, smoothing);
    this.smoothedTube.curveStrength = lerp(this.smoothedTube.curveStrength || 0, tube.curveStrength || 0, smoothing);
    this.smoothedTube.curveDirection = tube.curveDirection || this.smoothedTube.curveDirection || 1;
    this.smoothedTube.centerOffsetX = lerp(this.smoothedTube.centerOffsetX || 0, tube.centerOffsetX || 0, smoothing);
    this.smoothedTube.centerOffsetY = lerp(this.smoothedTube.centerOffsetY || 0, tube.centerOffsetY || 0, smoothing);
    this.smoothedTube.speed = lerp(this.smoothedTube.speed || 0, tube.speed || 0, smoothing);
    this.smoothedTube.distanceMeters = lerp(this.smoothedTube.distanceMeters || 0, tube.distanceMeters || 0, scrollSmoothing);
    this.smoothedTube.quality = tube.quality || this.smoothedTube.quality || 'high';
    return this.smoothedTube;
  }

  drawMouthRing(centerX, centerY, tube) {
    const rimColor = 0xaedcff;
    const outerRadius = CONFIG.TUBE_RADIUS * 1.2;
    const innerRadius = CONFIG.TUBE_RADIUS * 1.24;
    const centerShift = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);
    const shiftBoost = clamp(centerShift / 120, 0, 0.22);

    this.lightGraphics.lineStyle(8, blendColor(0x1e2635, rimColor, 0.6), MOUTH_RING_ALPHA_MULTIPLIER);
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      outerRadius * 2,
      outerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(6, blendColor(rimColor, 0xffffff, 0.35), amplifiedAlpha((0.72 + shiftBoost) * MOUTH_RING_ALPHA_MULTIPLIER, 1));
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      innerRadius * 2,
      innerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(3, blendColor(rimColor, 0xffffff, 0.65), amplifiedAlpha((0.42 + shiftBoost) * MOUTH_RING_ALPHA_MULTIPLIER, 1));
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      innerRadius * 1.96,
      innerRadius * 1.96 * CONFIG.PLAYER_OFFSET,
    );
  }

  drawTunnel() {
    drawTunnelPass(this, {
      CONFIG,
      QUALITY_PRESETS,
      INNER_RADIUS_RATIO,
      MOUTH_EXTENSION_DEPTH,
      PERIODIC_STRIPE_COLORS,
      PERIODIC_STRIPE_ANGLE_REPEAT,
      PERIODIC_STRIPE_ANGLE_WIDTH,
      PERIODIC_STRIPE_PERIOD,
      PERIODIC_STRIPE_LENGTH,
      PERIODIC_STRIPE_SOFTNESS,
      PERIODIC_STRIPE_BASE_ALPHA,
      PERIODIC_STRIPE_MAX_ALPHA,
      PERIODIC_STRIPE_RAY_LINE_WIDTH,
      PERIODIC_STRIPE_RAY_GLOW_LINE_WIDTH,
      PERIODIC_STRIPE_RAY_SPARSE_NOISE_THRESHOLD,
      TRACK_SLAT_PERIOD,
      TRACK_SLAT_LENGTH,
      TRACK_SLAT_SOFTNESS,
      TRACK_SLAT_ALPHA_MULTIPLIER,
      GRID_ALPHA_MULTIPLIER,
      GRID_AMBIENT_ALPHA_FLOOR,
      GRID_AMBIENT_DEPTH_BOOST,
      GRID_COLOR_NEAR,
      GRID_COLOR_FAR,
      GRID_RADIAL_LINE_WIDTH,
      GRID_RING_LINE_WIDTH,
      GRID_RADIAL_GLOW_LINE_WIDTH,
      GRID_RING_GLOW_LINE_WIDTH,
      GRID_GLOW_ALPHA_MULTIPLIER,
      GRID_MIN_VISIBILITY_ALPHA,
      GRID_WAVE_DISTANCE_PERIOD_METERS,
      GRID_WAVE_BAND_SOFTNESS,
      GRID_WAVE_CORE_COLOR,
      GRID_WAVE_GLOW_COLOR,
      GRID_WAVE_CORE_ALPHA,
      GRID_WAVE_GLOW_ALPHA,
      GRID_WAVE_CORE_LINE_WIDTH,
      GRID_WAVE_GLOW_LINE_WIDTH,
      SPEED_STREAK_COLORS,
      SPEED_STREAK_MIN_DEPTH_RATIO,
      SPEED_STREAK_MAX_DEPTH_RATIO,
      SPEED_STREAK_BASE_ALPHA,
      SPEED_STREAK_MAX_ALPHA,
      SPEED_STREAK_WIDTH_RATIO,
      clamp,
      blendColor,
      drawQuadPath,
      drawTunnelDarkeningOverlay,
      drawSegmentGlintOverlay,
      hashNoise,
      amplifiedAlpha,
      fillQuad,
      getQuadBand,
      getGridPulseAlpha,
      getTrackCoverage,
      normalizeAngleDiff,
    });
  }

  drawOverlay() {
    this.hideDepthLightRaySprites();
  }
}

export { TunnelRenderer };
