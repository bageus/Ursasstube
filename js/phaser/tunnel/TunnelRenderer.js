import { CONFIG } from '../../config.js';
import {
  ensureDepthLightRaySprites as ensureDepthLightRaySpritesPass,
  hideDepthLightRaySprites as hideDepthLightRaySpritesPass,
  renderDepthLightRays as renderDepthLightRaysPass,
  updateDepthLightRays as updateDepthLightRaysPass,
} from './tunnel-depth-rays.js';
import { drawTunnelPass } from './tunnel-draw-pass.js';

const INNER_RADIUS_RATIO = 0.15;
const BASE_URL = import.meta.env.BASE_URL || './';
const MOUTH_EXTENSION_DEPTH = 2.4;
const LANE_ANGLE_STEP = 0.55;
const TRACK_LANE_CENTERS = Object.freeze([-1, 0, 1]);
const TRACK_BAND_HALF_WIDTH = 0.24;
const TRACK_EDGE_SOFTNESS = 0.12;
const TRACK_SLAT_PERIOD = 2.9;
const TRACK_SLAT_LENGTH = 0.82;
const TRACK_SLAT_SOFTNESS = 0.22;
const LAMP_BRIGHTNESS_MULTIPLIER = 100;
const TRACK_SLAT_ALPHA_MULTIPLIER = 0.16;
const GRID_ALPHA_MULTIPLIER = 0.55;
const GRID_DIM_ALPHA_RATIO = 0.24;
const GRID_AMBIENT_ALPHA_FLOOR = 0.05;
const GRID_AMBIENT_DEPTH_BOOST = 0.03;
const GRID_COLOR_NEAR = 0xc7e6ff;
const GRID_COLOR_FAR = 0x6ea8dd;
const GRID_RADIAL_LINE_WIDTH = 1.05;
const GRID_RING_LINE_WIDTH = 0.85;
const GRID_RADIAL_GLOW_LINE_WIDTH = 2.4;
const GRID_RING_GLOW_LINE_WIDTH = 2;
const GRID_GLOW_ALPHA_MULTIPLIER = 0.42;
const GRID_MIN_VISIBILITY_ALPHA = 0.01;
const SPEED_STREAK_COLORS = Object.freeze([0xff5ff5, 0xffffff, 0x51fff2]);
const SPEED_STREAK_MIN_DEPTH_RATIO = 0.12;
const SPEED_STREAK_MAX_DEPTH_RATIO = 0.92;
const SPEED_STREAK_BASE_ALPHA = 0.018;
const SPEED_STREAK_MAX_ALPHA = 0.11;
const SPEED_STREAK_WIDTH_RATIO = 0.22;
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
const GRID_FLICKER_MIN_RATIO = 0.12;
const GRID_FLICKER_MAX_RATIO = 2.2;
const GRID_FLICKER_SPEED = 0.09;
const GRID_FLICKER_SPEED_ALT = 0.17;
const GRID_FLICKER_STEP_MS = 32;
const SPAWNED_RING_ALPHA_MULTIPLIER = 0.14;
const MOUTH_RING_ALPHA_MULTIPLIER = 0.4;
const WAVE_BASE_ALPHA_CAP = 0.26;
const WAVE_ALPHA_MULTIPLIER = 0.5;
const WAVE_CORE_BAND_ALPHA_FACTOR = 0.72;
const WAVE_MID_BAND_ALPHA_FACTOR = 0.42;
const WAVE_EDGE_BAND_ALPHA_FACTOR = 0.24;
const WAVE_OUTER_GLOW_ALPHA_FACTOR = 0.1;
const TUNNEL_SCROLL_VISUAL_MULTIPLIER = 0.01;
const TRACK_SLAT_SCROLL_FACTOR = 0.18;
const WALL_WAVE_SCROLL_FACTOR = 0.52;
const TUNNEL_DARKEN_BASE_ALPHA = 0.05;
const TUNNEL_DARKEN_DEPTH_ALPHA = 0.22;
const TUNNEL_DARKEN_SIDE_ALPHA = 0.16;
const TUNNEL_DARKEN_ALPHA_CAP = 0.42;
const QUALITY_PRESETS = Object.freeze({
  low: {
    depthStep: 3,
    segmentStep: 2,
    segmentAlpha: 0.9,
  },
  medium: {
    depthStep: 2,
    segmentStep: 1,
    segmentAlpha: 0.92,
  },
  high: {
    depthStep: 1,
    segmentStep: 1,
    segmentAlpha: 0.95,
  },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  return a + normalizeAngleDiff(b - a) * t;
}

function rgbToInt(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function blendColor(colorA, colorB, ratio) {
  const t = clamp(ratio, 0, 1);
  const r = Math.round(lerp((colorA >> 16) & 0xff, (colorB >> 16) & 0xff, t));
  const g = Math.round(lerp((colorA >> 8) & 0xff, (colorB >> 8) & 0xff, t));
  const b = Math.round(lerp(colorA & 0xff, colorB & 0xff, t));
  return rgbToInt(r, g, b);
}

function drawQuadPath(graphics, x1, y1, x2, y2, x3, y3, x4, y4) {
  graphics.beginPath();
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
  graphics.lineTo(x3, y3);
  graphics.lineTo(x4, y4);
  graphics.closePath();
}

function fillQuad(graphics, quad) {
  drawQuadPath(
    graphics,
    quad.p1.x,
    quad.p1.y,
    quad.p2.x,
    quad.p2.y,
    quad.p3.x,
    quad.p3.y,
    quad.p4.x,
    quad.p4.y,
  );
  graphics.fillPath();
}

function getQuadBand(quad, startRatio, endRatio) {
  const clampedStart = clamp(startRatio, 0, 1);
  const clampedEnd = clamp(endRatio, clampedStart, 1);
  return {
    p1: lerpPoint(quad.p1, quad.p4, clampedStart),
    p2: lerpPoint(quad.p2, quad.p3, clampedStart),
    p3: lerpPoint(quad.p2, quad.p3, clampedEnd),
    p4: lerpPoint(quad.p1, quad.p4, clampedEnd),
  };
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
  const flickerWavePrimary = Math.sin(timeMs * GRID_FLICKER_SPEED);
  const flickerWaveSecondary = Math.sin(timeMs * GRID_FLICKER_SPEED_ALT + 1.7);
  const flickerTick = Math.floor(timeMs / GRID_FLICKER_STEP_MS);
  const flickerJitterA = hashNoise(flickerTick * 1.37 + 3.11);
  const flickerJitterB = hashNoise(flickerTick * 2.91 + 9.73);
  const flickerJitter = (flickerJitterA * 0.68 + flickerJitterB * 0.32) * 2 - 1;
  const flickerPop = hashNoise(flickerTick * 5.27 + 0.61) > 0.76 ? 1 : 0;
  const flickerMix = clamp(
    0.5 +
      0.38 * flickerWavePrimary +
      0.26 * flickerWaveSecondary +
      0.28 * flickerJitter +
      0.58 * flickerPop,
    0,
    1,
  );
  const flickerMultiplier = lerp(GRID_FLICKER_MIN_RATIO, GRID_FLICKER_MAX_RATIO, flickerMix);

  if (cycleTime < GRID_FADE_OUT_MS) {
    return lerp(1, GRID_DIM_ALPHA_RATIO, cycleTime / GRID_FADE_OUT_MS) * flickerMultiplier;
  }
  if (cycleTime < GRID_FADE_OUT_MS + GRID_DIM_HOLD_MS) {
    return GRID_DIM_ALPHA_RATIO * flickerMultiplier;
  }
  const fadeInProgress = (cycleTime - GRID_FADE_OUT_MS - GRID_DIM_HOLD_MS) / GRID_FADE_IN_MS;
  return lerp(GRID_DIM_ALPHA_RATIO, 1, clamp(fadeInProgress, 0, 1)) * flickerMultiplier;
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

function hashNoise(seed) {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function lerpPoint(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
}

function getDepthRayScreenRotation(angle) {
  const dirX = Math.sin(angle);
  const dirY = Math.cos(angle) * CONFIG.PLAYER_OFFSET;
  const travelAngle = Math.atan2(dirY, dirX);
  return travelAngle + Math.PI * 0.5;
}

function getTubeDepthFlowPhase(tube) {
  const scrollOffset = (tube?.scroll || 0) * TUNNEL_SCROLL_VISUAL_MULTIPLIER;
  return scrollOffset - Math.floor(scrollOffset);
}

function getTubeDepthFlowOffsetRatio(tube) {
  const scrollOffset = (tube?.scroll || 0) * TUNNEL_SCROLL_VISUAL_MULTIPLIER;
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
    this.fogGraphics?.destroy();
    this.fxGraphics?.destroy();
    this.flashGraphics?.destroy();
    this.baseGraphics = null;
    this.lightGraphics = null;
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

    const smoothing = 0.24;
    const scrollSmoothing = 1;
    this.smoothedTube.rotation = lerpAngle(this.smoothedTube.rotation || 0, tube.rotation || 0, smoothing);
    this.smoothedTube.scroll = lerp(this.smoothedTube.scroll || 0, tube.scroll || 0, scrollSmoothing);
    this.smoothedTube.waveMod = lerp(this.smoothedTube.waveMod || 0, tube.waveMod || 0, smoothing);
    this.smoothedTube.curveAngle = lerpAngle(this.smoothedTube.curveAngle || 0, tube.curveAngle || 0, smoothing);
    this.smoothedTube.curveStrength = lerp(this.smoothedTube.curveStrength || 0, tube.curveStrength || 0, smoothing);
    this.smoothedTube.curveDirection = tube.curveDirection || this.smoothedTube.curveDirection || 1;
    this.smoothedTube.centerOffsetX = lerp(this.smoothedTube.centerOffsetX || 0, tube.centerOffsetX || 0, smoothing);
    this.smoothedTube.centerOffsetY = lerp(this.smoothedTube.centerOffsetY || 0, tube.centerOffsetY || 0, smoothing);
    this.smoothedTube.speed = lerp(this.smoothedTube.speed || 0, tube.speed || 0, smoothing);
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
      SPEED_STREAK_COLORS,
      SPEED_STREAK_MIN_DEPTH_RATIO,
      SPEED_STREAK_MAX_DEPTH_RATIO,
      SPEED_STREAK_BASE_ALPHA,
      SPEED_STREAK_MAX_ALPHA,
      SPEED_STREAK_WIDTH_RATIO,
      TUNNEL_SCROLL_VISUAL_MULTIPLIER,
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
      TRACK_LANE_CENTERS,
      LANE_ANGLE_STEP,
    });
  }

  drawOverlay() {
    this.hideDepthLightRaySprites();
  }
}

export { TunnelRenderer };
