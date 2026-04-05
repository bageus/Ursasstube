import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
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
const GRID_ALPHA_MULTIPLIER = 0.2;
const GRID_DIM_ALPHA_RATIO = 0.24;
const GRID_AMBIENT_ALPHA_FLOOR = 0.05;
const GRID_AMBIENT_DEPTH_BOOST = 0.03;
const GRID_COLOR_NEAR = 0xc7e6ff;
const GRID_COLOR_FAR = 0x6ea8dd;
const GRID_RADIAL_LINE_WIDTH = 1.05;
const GRID_RING_LINE_WIDTH = 0.85;
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
const DEPTH_LIGHT_RAY_MIN_RESPAWN_MS = 120;
const DEPTH_LIGHT_RAY_MAX_RESPAWN_MS = 900;
const DEPTH_LIGHT_RAY_MIN_TRAVEL_MS = 530;
const DEPTH_LIGHT_RAY_MAX_TRAVEL_MS = 925;
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
const TURN_ARROW_COLOR = 0xff7cf6;
const TURN_ARROW_ALPHA_MAX = 0.72;
const TURN_ARROW_DEPTH_MIN = 0.18;
const TURN_ARROW_DEPTH_MAX = 0.9;
const TURN_ARROW_DEPTH_GAP = 6;
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

function drawTurnChevron(graphics, quad, direction, alphaScale) {
  const clampedScale = clamp(alphaScale, 0, 1);
  if (clampedScale <= 0.001) return;
  const nearDepth = direction > 0 ? 0.22 : 0.3;
  const tipDepth = direction > 0 ? 0.56 : 0.48;
  const nearLeft = lerpPoint(quad.p1, quad.p4, nearDepth);
  const nearRight = lerpPoint(quad.p2, quad.p3, nearDepth);
  const tipLeft = lerpPoint(quad.p1, quad.p4, tipDepth);
  const tipRight = lerpPoint(quad.p2, quad.p3, tipDepth);
  const nearCenter = lerpPoint(nearLeft, nearRight, 0.5);
  const tipCenter = lerpPoint(tipLeft, tipRight, 0.5);
  const widthVecX = nearRight.x - nearLeft.x;
  const widthVecY = nearRight.y - nearLeft.y;
  const widthLen = Math.hypot(widthVecX, widthVecY) || 1;
  const perpX = widthVecX / widthLen;
  const perpY = widthVecY / widthLen;
  const wing = clamp(widthLen * 0.24, 5, 18);
  const wingLeft = { x: nearCenter.x - perpX * wing, y: nearCenter.y - perpY * wing };
  const wingRight = { x: nearCenter.x + perpX * wing, y: nearCenter.y + perpY * wing };

  const alpha = amplifiedAlpha(TURN_ARROW_ALPHA_MAX * clampedScale, 0.92);
  graphics.lineStyle(4.8, TURN_ARROW_COLOR, alpha);
  graphics.beginPath();
  graphics.moveTo(wingLeft.x, wingLeft.y);
  graphics.lineTo(tipCenter.x, tipCenter.y);
  graphics.lineTo(wingRight.x, wingRight.y);
  graphics.strokePath();

  graphics.lineStyle(2.2, 0xffffff, clamp(alpha * 0.72, 0, 0.85));
  graphics.beginPath();
  graphics.moveTo(wingLeft.x, wingLeft.y);
  graphics.lineTo(tipCenter.x, tipCenter.y);
  graphics.lineTo(wingRight.x, wingRight.y);
  graphics.strokePath();
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

  randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  ensureDepthLightRayTextures() {
    DEPTH_LIGHT_RAY_TEXTURE_KEYS.forEach((textureKey, index) => {
      if (this.scene.textures.exists(textureKey)) {
        return;
      }
      const width = index === 0 ? 48 : 64;
      const height = 320;
      const tintCore = index === 0 ? 0xb8e8ff : 0xd7bcff;
      const tintInner = index === 0 ? 0xf2fdff : 0xf5ebff;
      const gfx = this.scene.make.graphics({ x: 0, y: 0, add: false });

      const drawLayer = (ratio, alpha, color) => {
        const layerWidth = width * ratio;
        const left = (width - layerWidth) * 0.5;
        gfx.fillStyle(color, alpha);
        gfx.fillTriangle(
          width * 0.5,
          0,
          left,
          height * 0.22,
          left + layerWidth,
          height * 0.22,
        );
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

  scheduleDepthLightRay(ray, nowMs, immediate = false) {
    ray.active = false;
    ray.spawnAt = nowMs + (immediate
      ? this.randomRange(120, 900)
      : this.randomRange(DEPTH_LIGHT_RAY_MIN_RESPAWN_MS, DEPTH_LIGHT_RAY_MAX_RESPAWN_MS));
  }

  activateDepthLightRay(ray, nowMs, tube) {
    ray.active = true;
    ray.startTime = nowMs;
    ray.travelMs = this.randomRange(DEPTH_LIGHT_RAY_MIN_TRAVEL_MS, DEPTH_LIGHT_RAY_MAX_TRAVEL_MS);
    const flowPhase = getTubeDepthFlowPhase(tube);
    const flowOffsetRatio = getTubeDepthFlowOffsetRatio(tube);
    ray.flowPhaseAtSpawn = flowPhase;
    const slot = Number.isFinite(ray.poolIndex) ? ray.poolIndex : 0;
    const spawnWorldZ = this.getDepthLightRaySpawnZ();
    const spawnDepthRatio = getDepthRatioFromWorldZ(spawnWorldZ);
    const slotDepthOffset = ((slot % DEPTH_LIGHT_RAY_POOL_SIZE) / Math.max(1, DEPTH_LIGHT_RAY_POOL_SIZE - 1) - 0.5) * 0.08;
    ray.startDepthRatio = clamp(spawnDepthRatio + flowOffsetRatio + slotDepthOffset, 0.34, 0.97);
    ray.endDepthRatio = clamp(ray.startDepthRatio - this.randomRange(0.38, 0.56), 0.04, 0.42);
    const baseOffset = DEPTH_LIGHT_RAY_SURFACE_OFFSETS[slot % DEPTH_LIGHT_RAY_SURFACE_OFFSETS.length];
    ray.pathOffset = baseOffset + this.randomRange(-DEPTH_LIGHT_RAY_ANGLE_JITTER, DEPTH_LIGHT_RAY_ANGLE_JITTER);
    ray.angle = ((tube?.rotation || 0) + (tube?.curveAngle || 0)) + ray.pathOffset;
    ray.rotation = getDepthRayScreenRotation(ray.angle);
    ray.stretch = this.randomRange(0.72, 1.16);
    ray.textureIndex = Math.floor(this.randomRange(0, DEPTH_LIGHT_RAY_TEXTURE_KEYS.length));
    ray.opacity = 0;
    ray.depthRatio = ray.startDepthRatio;
  }

  ensureDepthLightRayPool(nowMs) {
    while (this.depthLightRays.length < DEPTH_LIGHT_RAY_POOL_SIZE) {
      const ray = { poolIndex: this.depthLightRays.length };
      this.scheduleDepthLightRay(ray, nowMs, true);
      this.depthLightRays.push(ray);
    }
  }

  getDepthLightRaySpawnZ() {
    const snapshot = this.snapshot;
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

    if (candidates.length === 0) {
      return 1.55;
    }
    return Math.max(...candidates);
  }

  updateDepthLightRays(nowMs, tube) {
    this.ensureDepthLightRayPool(nowMs);
    let activeCount = 0;

    for (const ray of this.depthLightRays) {
      if (!ray.active) continue;

      const progress = clamp((nowMs - ray.startTime) / Math.max(ray.travelMs, 1), 0, 1);
      const flowPhase = getTubeDepthFlowPhase(tube);
      const flowDelta = getWrappedUnitDiff(flowPhase, ray.flowPhaseAtSpawn || 0);
      const flowShiftRatio = getDepthFlowOffsetRatioFromPhaseDelta(flowDelta);
      ray.depthRatio = clamp(lerp(ray.startDepthRatio, ray.endDepthRatio, progress) + flowShiftRatio, 0.06, 0.995);
      ray.angle = ((tube?.rotation || 0) + (tube?.curveAngle || 0)) + (ray.pathOffset || 0);
      ray.rotation = getDepthRayScreenRotation(ray.angle);
      const fadeIn = clamp(progress / 0.18, 0, 1);
      const fadeOut = clamp((1 - progress) / 0.33, 0, 1);
      ray.opacity = Math.min(fadeIn * fadeIn, fadeOut);

      if (progress >= 1) {
        this.scheduleDepthLightRay(ray, nowMs, false);
      } else {
        activeCount += 1;
      }
    }

    for (const ray of this.depthLightRays) {
      if (activeCount >= DEPTH_LIGHT_RAY_MAX_ACTIVE) {
        break;
      }
      if (ray.active || ray.spawnAt > nowMs) {
        continue;
      }
      this.activateDepthLightRay(ray, nowMs, tube);
      activeCount += 1;
    }

    return this.depthLightRays;
  }

  renderDepthLightRays(activeDepthLightRays, centerX, centerY, maxRadius, tube) {
    let spriteIndex = 0;
    for (const ray of activeDepthLightRays) {
      if (!ray.active) continue;
      const sprite = this.depthLightRaySprites[spriteIndex];
      if (!sprite) break;
      const depthOffset = 1 - ray.depthRatio;
      const worldZ = getWorldZFromDepthRatio(ray.depthRatio);
      const bend = clamp(worldZ, 0, 1.6);
      const radius = Math.max(maxRadius * (0.08 + depthOffset * 0.88), maxRadius * 0.12);
      const x = centerX + Math.sin(ray.angle) * radius + (tube?.centerOffsetX || 0) * bend;
      const y = centerY + Math.cos(ray.angle) * radius * CONFIG.PLAYER_OFFSET + (tube?.centerOffsetY || 0) * bend;
      const alpha = amplifiedAlpha(clamp(ray.opacity * (0.08 + depthOffset * 0.34), 0, DEPTH_LIGHT_RAY_ALPHA_MAX), 0.5);
      const scaleY = 0.13 + depthOffset * 0.9 * ray.stretch;
      const scaleX = 0.1 + depthOffset * 0.08;
      const textureKey = DEPTH_LIGHT_RAY_TEXTURE_KEYS[ray.textureIndex % DEPTH_LIGHT_RAY_TEXTURE_KEYS.length];

      sprite.setTexture(textureKey);
      sprite.setPosition(x, y);
      sprite.setRotation(ray.rotation || getDepthRayScreenRotation(ray.angle));
      sprite.setScale(scaleX, scaleY);
      sprite.setAlpha(alpha);
      sprite.setVisible(alpha > 0.002);
      spriteIndex += 1;
    }

    for (; spriteIndex < this.depthLightRaySprites.length; spriteIndex += 1) {
      this.depthLightRaySprites[spriteIndex].setVisible(false);
    }
  }

  hideDepthLightRaySprites() {
    this.depthLightRaySprites.forEach((sprite) => {
      sprite.setVisible(false);
    });
  }

  ensureDepthLightRaySprites() {
    this.ensureDepthLightRayTextures();
    while (this.depthLightRaySprites.length < DEPTH_LIGHT_RAY_MAX_ACTIVE) {
      const sprite = this.scene.add
        .image(0, 0, DEPTH_LIGHT_RAY_TEXTURE_KEYS[0])
        .setVisible(false)
        .setDepth(4.5)
        .setBlendMode('ADD');
      this.depthLightRaySprites.push(sprite);
    }
  }

  getSmoothedTube(tube) {
    if (!tube) return null;
    if (!this.smoothedTube) {
      this.smoothedTube = { ...tube };
      return this.smoothedTube;
    }

    const smoothing = 0.24;
    const scrollSmoothing = 0.16;
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
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;

    this.baseGraphics.clear();
    this.lightGraphics.clear();
    this.fogGraphics?.clear();
    this.fxGraphics?.clear();
    this.flashGraphics?.clear();
    this.hideDepthLightRaySprites();

    if (!viewport || !tube) {
      return;
    }
    const renderTube = this.getSmoothedTube(tube);
    if (!renderTube) return;

    const width = viewport.width || this.scene.scale.width;
    const height = viewport.height || this.scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const qualityName = renderTube.quality || 'high';
    const quality = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.high;
    const segmentCount = CONFIG.TUBE_SEGMENTS;
    const maxDepth = CONFIG.TUBE_DEPTH_STEPS;
    const normalizedSpeed = clamp((renderTube.speed || CONFIG.SPEED_START || 1) / Math.max(0.0001, CONFIG.SPEED_START || 1), 0.2, 3);
    const scrollOffset = (renderTube.scroll || 0) * TUNNEL_SCROLL_VISUAL_MULTIPLIER * normalizedSpeed;
    const ringShift = Math.floor(scrollOffset);
    const ringPhase = scrollOffset - ringShift;
    const lampDepthSteps = Array.isArray(snapshot?.lamps)
      ? snapshot.lamps
        .map((lamp) => (Number.isFinite(lamp?.z) ? lamp.z / CONFIG.TUBE_Z_STEP : NaN))
        .filter((lampDepthStep) => Number.isFinite(lampDepthStep))
      : [];
    const lampPulseHalfWidth = Math.max(quality.depthStep * 1.5, 0.9);
    const depthEntries = [];
    const gridPulseAlpha = getGridPulseAlpha(this.scene.time.now || 0);
    const gridRingOverlays = [];
    const gridRadialOverlays = [];
    const speedStreakOverlays = [];
    const speedPulse = (this.scene.time.now || 0) * 0.0013;
    const arrowPulse = 0.65 + 0.35 * Math.sin((this.scene.time.now || 0) * 0.0042);
    const turnArrowOverlays = [];
    const curveShiftX = renderTube.centerOffsetX || 0;
    const curveStrength = clamp(
      Math.max(
        Math.abs(renderTube.curveAngle || 0) / Math.max(CONFIG.MAX_CURVE_ANGLE || 0.45, 0.0001),
        Math.abs(curveShiftX) / Math.max(CONFIG.TUBE_RADIUS * CONFIG.CURVE_OFFSET_X, 0.0001),
      ),
      0,
      1,
    );
    const hasTurnGuidance = curveStrength > 0.06;
    const turnDirection = (renderTube.curveAngle || 0) < 0 ? 1 : -1;

    for (let depth = 0; depth < maxDepth; depth += quality.depthStep) {
      let animatedDepth = depth - ringPhase;
      if (animatedDepth < 0) {
        animatedDepth += maxDepth;
      }

      let spawnBlend = 0;
      for (const lampDepthStep of lampDepthSteps) {
        const lampDistance = Math.abs(animatedDepth - lampDepthStep);
        const lampBlend = 1 - clamp(lampDistance / lampPulseHalfWidth, 0, 1);
        if (lampBlend > spawnBlend) {
          spawnBlend = lampBlend;
        }
      }

      depthEntries.push({ animatedDepth, spawnBlend });
    }

    depthEntries.sort((a, b) => b.animatedDepth - a.animatedDepth);

    const trackSlatOverlays = [];
    for (const depthEntry of depthEntries) {
      const { animatedDepth, spawnBlend } = depthEntry;
      const extendedDepth1 = Math.max(0, animatedDepth - MOUTH_EXTENSION_DEPTH);
      const extendedDepth2 = Math.max(0, animatedDepth + quality.depthStep - MOUTH_EXTENSION_DEPTH);
      const z1 = extendedDepth1 * CONFIG.TUBE_Z_STEP;
      const z2 = extendedDepth2 * CONFIG.TUBE_Z_STEP;
      const scale1 = 1 - z1;
      const scale2 = 1 - z2;
      if (scale2 <= 0) continue;

      const innerRadius = CONFIG.TUBE_RADIUS * INNER_RADIUS_RATIO;
      const radius1 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale1);
      const radius2 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale2);
      const bend1 = 1 - scale1;
      const bend2 = 1 - scale2;
      const wrappedDepth = ((animatedDepth % maxDepth) + maxDepth) % maxDepth;
      const depthRatio = 1 - wrappedDepth / maxDepth;
      const wallColor = blendColor(0x080a14, 0x294266, depthRatio * 0.7);
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
        const normalizedSegmentAngle = normalizeAngleDiff(segmentMidAngle);
        const trackCoverage = getTrackCoverage(segmentMidAngle, renderTube.rotation, renderTube.curveAngle);

        const x1 =
          centerX +
          Math.sin(boundaryA) * radius1 +
          (renderTube.centerOffsetX || 0) * bend1;
        const y1 =
          centerY +
          Math.cos(boundaryA) * radius1 * CONFIG.PLAYER_OFFSET +
          (renderTube.centerOffsetY || 0) * bend1;
        const x2 =
          centerX +
          Math.sin(boundaryB) * radius1 +
          (renderTube.centerOffsetX || 0) * bend1;
        const y2 =
          centerY +
          Math.cos(boundaryB) * radius1 * CONFIG.PLAYER_OFFSET +
          (renderTube.centerOffsetY || 0) * bend1;
        const x3 =
          centerX +
          Math.sin(boundaryB) * radius2 +
          (renderTube.centerOffsetX || 0) * bend2;
        const y3 =
          centerY +
          Math.cos(boundaryB) * radius2 * CONFIG.PLAYER_OFFSET +
          (renderTube.centerOffsetY || 0) * bend2;
        const x4 =
          centerX +
          Math.sin(boundaryA) * radius2 +
          (renderTube.centerOffsetX || 0) * bend2;
        const y4 =
          centerY +
          Math.cos(boundaryA) * radius2 * CONFIG.PLAYER_OFFSET +
          (renderTube.centerOffsetY || 0) * bend2;

        const tileFillAlpha = clamp(quality.segmentAlpha * spawnBlend, 0.2, 1);
        const trackWallColor = blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);
        this.baseGraphics.fillStyle(trackWallColor, tileFillAlpha);
        drawQuadPath(this.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
        this.baseGraphics.fillPath();
        drawTunnelDarkeningOverlay(this.fogGraphics, {
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          p3: { x: x3, y: y3 },
          p4: { x: x4, y: y4 },
        }, depthRatio, segmentMidAngle, renderTube.rotation, renderTube.curveAngle);
        drawSegmentGlintOverlay(this.fxGraphics, {
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          p3: { x: x3, y: y3 },
          p4: { x: x4, y: y4 },
        }, segmentMidAngle, renderTube.rotation, depthRatio, spawnBlend);

        const ambientGridBlend = clamp(GRID_AMBIENT_ALPHA_FLOOR + depthRatio * GRID_AMBIENT_DEPTH_BOOST, 0, 0.2);
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

        if (trackCoverage > 0) {
          const treadPhase = ((animatedDepth + scrollOffset * TRACK_SLAT_SCROLL_FACTOR) % TRACK_SLAT_PERIOD + TRACK_SLAT_PERIOD) % TRACK_SLAT_PERIOD;
          const riseProgress = clamp(treadPhase / Math.max(TRACK_SLAT_SOFTNESS, 0.0001), 0, 1);
          const fallProgress = clamp((treadPhase - TRACK_SLAT_LENGTH) / Math.max(TRACK_SLAT_SOFTNESS, 0.0001), 0, 1);
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

        const wallCoverage = 1 - clamp(trackCoverage, 0, 1);
        if (wallCoverage > 0.25) {
          const depthPhase = animatedDepth * 0.33 - scrollOffset * WALL_WAVE_SCROLL_FACTOR + speedPulse * 0.45;
          const stripePulse = 0.5 + 0.5 * Math.sin(depthPhase);
          const stripeGate = Math.pow(stripePulse, 7.5);
          const segmentNoise = hashNoise(i * 13.77 + Math.floor(animatedDepth) * 0.91);
          const depthWithinRange = depthRatio >= SPEED_STREAK_MIN_DEPTH_RATIO && depthRatio <= SPEED_STREAK_MAX_DEPTH_RATIO;
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
              colorIndex: (i + Math.floor(animatedDepth)) % SPEED_STREAK_COLORS.length,
              streakAlpha: stripeGate,
            });
          }
        }

        if (hasTurnGuidance) {
          const depthInRange = depthRatio >= TURN_ARROW_DEPTH_MIN && depthRatio <= TURN_ARROW_DEPTH_MAX;
          const sideVisibility = Math.sin(normalizedSegmentAngle);
          const sideVisible = turnDirection > 0 ? sideVisibility > 0.12 : sideVisibility < -0.12;
          if (depthInRange && sideVisible && wallCoverage > 0.22) {
            const depthBand = Math.floor(animatedDepth);
            const isChevronLane = ((depthBand + 2) % TURN_ARROW_DEPTH_GAP) === 0;
            if (isChevronLane) {
              turnArrowOverlays.push({
                quad: {
                  p1: { x: x1, y: y1 },
                  p2: { x: x2, y: y2 },
                  p3: { x: x3, y: y3 },
                  p4: { x: x4, y: y4 },
                },
                depthRatio,
                wallCoverage,
              });
            }
          }
        }

      }
    }

    for (const slat of trackSlatOverlays) {
      const slatColor = blendColor(0x66a3ff, 0xffffff, slat.depthRatio * 0.5);
      const slatAlpha = amplifiedAlpha(clamp(
        (0.14 + slat.depthRatio * 0.2) *
          slat.trackCoverage *
          slat.slatVisibility *
          slat.spawnBlend *
          TRACK_SLAT_ALPHA_MULTIPLIER,
        0,
        0.38,
      ));
      this.lightGraphics.fillStyle(slatColor, slatAlpha);
      drawQuadPath(
        this.lightGraphics,
        slat.x1,
        slat.y1,
        slat.x2,
        slat.y2,
        slat.x3,
        slat.y3,
        slat.x4,
        slat.y4,
      );
      this.lightGraphics.fillPath();
    }

    for (const line of gridRingOverlays) {
      const ringColor = blendColor(GRID_COLOR_FAR, GRID_COLOR_NEAR, line.depthRatio * 0.8);
      const ringAlpha = amplifiedAlpha(
        clamp((0.02 + line.depthRatio * 0.07) * line.gridBlend * GRID_ALPHA_MULTIPLIER * gridPulseAlpha, 0, 0.2),
        0.25,
      );
      if (ringAlpha <= 0.002) continue;
      this.lightGraphics.lineStyle(GRID_RING_LINE_WIDTH, ringColor, ringAlpha);
      this.lightGraphics.beginPath();
      this.lightGraphics.moveTo(line.x1, line.y1);
      this.lightGraphics.lineTo(line.x2, line.y2);
      this.lightGraphics.strokePath();
    }

    for (const line of gridRadialOverlays) {
      const radialColor = blendColor(GRID_COLOR_FAR, GRID_COLOR_NEAR, line.depthRatio * 0.7);
      const radialAlpha = amplifiedAlpha(
        clamp((0.03 + line.depthRatio * 0.09) * line.gridBlend * GRID_ALPHA_MULTIPLIER * gridPulseAlpha, 0, 0.22),
        0.28,
      );
      if (radialAlpha <= 0.002) continue;
      this.lightGraphics.lineStyle(GRID_RADIAL_LINE_WIDTH, radialColor, radialAlpha);
      this.lightGraphics.beginPath();
      this.lightGraphics.moveTo(line.x1, line.y1);
      this.lightGraphics.lineTo(line.x4, line.y4);
      this.lightGraphics.strokePath();
    }

    for (const streak of speedStreakOverlays) {
      const widthPulse = 0.4 + 0.6 * Math.sin((streak.depthRatio + speedPulse) * 10.2);
      const bandStart = clamp(0.5 - SPEED_STREAK_WIDTH_RATIO * widthPulse * 0.5, 0.05, 0.49);
      const bandEnd = clamp(0.5 + SPEED_STREAK_WIDTH_RATIO * widthPulse * 0.5, 0.51, 0.95);
      const streakColor = SPEED_STREAK_COLORS[streak.colorIndex];
      const streakAlpha = amplifiedAlpha(clamp(
        (SPEED_STREAK_BASE_ALPHA + streak.depthRatio * 0.035) *
          streak.spawnBlend *
          streak.wallCoverage *
          streak.streakAlpha,
        0,
        SPEED_STREAK_MAX_ALPHA,
      ), 0.22);
      if (streakAlpha <= 0.002) continue;
      this.fxGraphics.fillStyle(streakColor, streakAlpha);
      fillQuad(this.fxGraphics, getQuadBand(streak.quad, bandStart, bandEnd));
    }

    for (const arrow of turnArrowOverlays) {
      const depthFade = clamp((arrow.depthRatio - TURN_ARROW_DEPTH_MIN) / Math.max(TURN_ARROW_DEPTH_MAX - TURN_ARROW_DEPTH_MIN, 0.0001), 0, 1);
      const arrowAlpha = clamp(
        (0.34 + depthFade * 0.66) * arrow.wallCoverage * curveStrength * arrowPulse,
        0,
        1,
      );
      drawTurnChevron(this.fxGraphics, arrow.quad, turnDirection, arrowAlpha);
    }

    this.drawMouthRing(centerX, centerY, renderTube);
  }

  drawOverlay() {
    this.hideDepthLightRaySprites();
  }
}

export { TunnelRenderer };
