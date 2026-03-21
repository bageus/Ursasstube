import { CONFIG } from '../config.js';

const segmentColorCache = [];
let lastColorCacheRotation = Number.NaN;
let lastColorCacheSize = -1;

const segmentTrigCache = {
  rotationKey: Number.NaN,
  curveKey: Number.NaN,
  segmentCount: -1,
  boundarySin: [],
  boundaryCos: [],
  midAngles: []
};

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
}

function getSegmentColor(angle, index) {
  const hue = (angle * 180 / Math.PI + index * 8) % 360;
  const r = 140 + Math.sin(hue * Math.PI / 180) * 30;
  const g = 60 + Math.cos(hue * Math.PI / 180) * 20;
  const b = 70 + Math.sin(hue * Math.PI / 180 * 0.5) * 25;
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
}

function getSegmentColorRgb(angle, index) {
  const hue = (angle * 180 / Math.PI + index * 8) % 360;
  return {
    r: Math.floor(140 + Math.sin(hue * Math.PI / 180) * 30),
    g: Math.floor(60 + Math.cos(hue * Math.PI / 180) * 20),
    b: Math.floor(70 + Math.sin(hue * Math.PI / 180 * 0.5) * 25)
  };
}

function updateSegmentColorCache(tubeRotation, segmentCount = CONFIG.TUBE_SEGMENTS) {
  const rotKey = Math.floor(tubeRotation * 10);
  if (rotKey === lastColorCacheRotation && lastColorCacheSize === segmentCount && segmentColorCache.length === segmentCount) {
    return segmentColorCache;
  }

  lastColorCacheRotation = rotKey;
  lastColorCacheSize = segmentCount;
  segmentColorCache.length = segmentCount;
  for (let i = 0; i < segmentCount; i++) {
    const u = i / segmentCount;
    const baseAngle = u * Math.PI * 2 + tubeRotation;
    segmentColorCache[i] = getSegmentColor(baseAngle, i);
  }
  return segmentColorCache;
}

function updateSegmentTrigCache(tubeRotation, tubeCurveAngle, segmentCount = CONFIG.TUBE_SEGMENTS) {
  const rotationKey = Math.round(tubeRotation * 1000);
  const curveKey = Math.round(tubeCurveAngle * 1000);
  if (
    segmentTrigCache.rotationKey === rotationKey &&
    segmentTrigCache.curveKey === curveKey &&
    segmentTrigCache.segmentCount === segmentCount &&
    segmentTrigCache.boundarySin.length === segmentCount + 1
  ) {
    return segmentTrigCache;
  }

  segmentTrigCache.rotationKey = rotationKey;
  segmentTrigCache.curveKey = curveKey;
  segmentTrigCache.segmentCount = segmentCount;
  segmentTrigCache.boundarySin.length = segmentCount + 1;
  segmentTrigCache.boundaryCos.length = segmentCount + 1;
  segmentTrigCache.midAngles.length = segmentCount;

  for (let i = 0; i <= segmentCount; i++) {
    const u = (i % segmentCount) / segmentCount;
    const angle = u * Math.PI * 2 + tubeRotation + tubeCurveAngle;
    segmentTrigCache.boundarySin[i] = Math.sin(angle);
    segmentTrigCache.boundaryCos[i] = Math.cos(angle);
    if (i < segmentCount) {
      segmentTrigCache.midAngles[i] = (u + 0.5 / segmentCount) * Math.PI * 2 + tubeRotation;
    }
  }

  return segmentTrigCache;
}

function advanceTubeState(gameState) {
  const rotSpeed = Math.min(CONFIG.BASE_ROTATION_SPEED * gameState.speed * 18, CONFIG.MAX_ROTATION_SPEED);
  gameState.tubeRotation += rotSpeed * 0.01;
  gameState.tubeScroll += gameState.speed * 40;
}

function createTubeModelSnapshot(gameState, viewport, options = {}) {
  const quality = gameState.renderQuality === 'low' ? 'low' : 'high';
  const segmentCount = CONFIG.TUBE_SEGMENTS;
  const depthCount = CONFIG.TUBE_DEPTH_STEPS;
  const colors = updateSegmentColorCache(gameState.tubeRotation, segmentCount);
  const trig = updateSegmentTrigCache(gameState.tubeRotation, gameState.tubeCurveAngle, segmentCount);
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const centerOffsetX = gameState.centerOffsetX;
  const centerOffsetY = gameState.centerOffsetY;
  const offsetMag = Math.sqrt(centerOffsetX * centerOffsetX + centerOffsetY * centerOffsetY);
  const hasShadow = offsetMag > 1;
  const shadowCenterAngle = hasShadow ? Math.atan2(-centerOffsetX, -centerOffsetY) : 0;
  const shadowHalfWidth = Math.PI * 2.0;
  const glowDist = gameState.distance || 0;
  const glowIntensity = glowDist < 500 ? 0 : Math.min(1, (glowDist - 500) / 200);
  const hasGlow = glowIntensity > 0;
  const lowQuality = quality === 'low';
  const depthStep = lowQuality ? 2 : 1;
  const segmentStep = lowQuality ? 2 : 1;
  const quads = [];

  for (let d = depthCount - 1; d >= 0; d -= depthStep) {
    const z1 = d * CONFIG.TUBE_Z_STEP;
    const z2 = (d + 1) * CONFIG.TUBE_Z_STEP;
    const scale1 = 1 - z1;
    const scale2 = 1 - z2;
    if (scale2 <= 0) continue;

    const innerR = CONFIG.TUBE_RADIUS * 0.15;
    const r1 = Math.max(innerR, CONFIG.TUBE_RADIUS * scale1);
    const r2 = Math.max(innerR, CONFIG.TUBE_RADIUS * scale2);
    const bendInf1 = 1 - scale1;
    const bendInf2 = 1 - scale2;
    const depthFade = hasGlow ? Math.max(0, 1 - d / (depthCount * 0.7)) : 0;

    for (let i = 0; i < segmentCount; i += segmentStep) {
      const nextIndex = Math.min(i + segmentStep, segmentCount);
      const segMidBaseAngle = trig.midAngles[i] ?? trig.midAngles[segmentCount - 1] ?? 0;
      const sin1 = trig.boundarySin[i];
      const cos1 = trig.boundaryCos[i];
      const sin2 = trig.boundarySin[nextIndex];
      const cos2 = trig.boundaryCos[nextIndex];
      const x1 = centerX + sin1 * r1 + centerOffsetX * bendInf1;
      const y1 = centerY + cos1 * r1 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf1;
      const x2 = centerX + sin2 * r1 + centerOffsetX * bendInf1;
      const y2 = centerY + cos2 * r1 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf1;
      const x3 = centerX + sin2 * r2 + centerOffsetX * bendInf2;
      const y3 = centerY + cos2 * r2 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf2;
      const x4 = centerX + sin1 * r2 + centerOffsetX * bendInf2;
      const y4 = centerY + cos1 * r2 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf2;

      let shadowAlpha = 0;
      if (hasShadow) {
        const absAngDiff = Math.abs(normalizeAngleDiff(segMidBaseAngle - shadowCenterAngle));
        if (absAngDiff < shadowHalfWidth) {
          const shadowFactor = 1 - absAngDiff / shadowHalfWidth;
          const depthFactor = 1 + d / depthCount * 2;
          const intensity = Math.min(1, offsetMag / 80) * shadowFactor * shadowFactor * shadowFactor * depthFactor;
          shadowAlpha = Math.min(1, intensity * 0.92);
        }
      }

      let glowAlpha = 0;
      if (!lowQuality && hasGlow && depthFade > 0) {
        let shadowAtten = 1;
        if (hasShadow) {
          const absAngDiff = Math.abs(normalizeAngleDiff(segMidBaseAngle - shadowCenterAngle));
          if (absAngDiff < shadowHalfWidth) shadowAtten = absAngDiff / shadowHalfWidth;
        }
        glowAlpha = glowIntensity * depthFade * shadowAtten * 0.55;
      }

      quads.push({
        depthIndex: d,
        segmentIndex: i,
        points: [x1, y1, x2, y2, x3, y3, x4, y4],
        fillStyle: colors[i],
        fillRgb: getSegmentColorRgb(segMidBaseAngle, i),
        shadowAlpha,
        glowAlpha,
        lowQuality
      });
    }
  }

  return {
    viewport,
    quality,
    lowQuality,
    center: { x: centerX, y: centerY },
    centerOffsetX,
    centerOffsetY,
    quads,
    quadCount: quads.length,
    estimatedTubePasses: lowQuality ? quads.length : quads.length * 6,
    options
  };
}

export {
  advanceTubeState,
  createTubeModelSnapshot,
  normalizeAngleDiff,
  updateSegmentColorCache,
  updateSegmentTrigCache
};
