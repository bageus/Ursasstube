import { CONFIG, BONUS_TYPES, isMobile } from './config.js';
import { DOM, ctx, gameState, player, obstacles, bonuses, coins, spinTargets } from './state.js';
import { assetManager } from './assets.js';

/* ===== ANIMATIONS ===== */
const Animations = {
  idle_back: { atlas: 'character_back_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  idle_left: { atlas: 'character_left_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  idle_right: { atlas: 'character_right_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  swipe_left: { atlas: 'character_left_swipe', spriteWidth: 128, spriteHeight: 128, frames: 3, colsPerRow: 3 },
  swipe_right: { atlas: 'character_right_swipe', spriteWidth: 128, spriteHeight: 128, frames: 3, colsPerRow: 3 },
  spin: { atlas: 'character_spin', spriteWidth: 128, spriteHeight: 128, frames: 14, colsPerRow: 7 }
};

/* ===== CANVAS RESIZE ===== */
let canvasW = 0, canvasH = 0;
let _resizeRetryCount = 0;

const _segmentTrigCache = {
  rotationKey: Number.NaN,
  curveKey: Number.NaN,
  boundarySin: [],
  boundaryCos: [],
  midAngles: []
};

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  let w = 0, h = 0;

  // 1. Telegram viewport (most reliable in TG Mini App)
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    if (tg.viewportStableHeight > 0) {
      w = tg.viewportWidth || window.innerWidth || 360;
      h = tg.viewportStableHeight;
    }
  }

  // 2. Parent element getBoundingClientRect (works when gameContainer is visible)
  if (w === 0 || h === 0) {
    const parent = DOM.canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
    }
  }

  // 3. visualViewport API (modern browsers)
  if ((w === 0 || h === 0) && window.visualViewport) {
    w = window.visualViewport.width;
    h = window.visualViewport.height;
  }

  // 4. window.innerWidth/innerHeight (final fallback)
  if (w === 0 || h === 0) {
    w = window.innerWidth || document.documentElement.clientWidth || 360;
    h = window.innerHeight || document.documentElement.clientHeight || 640;
  }

  // If still 0, schedule retry via requestAnimationFrame
  if (w === 0 || h === 0) {
    if (_resizeRetryCount < 10) {
      _resizeRetryCount++;
      requestAnimationFrame(resizeCanvas);
    }
    return;
  }
  _resizeRetryCount = 0;

  const cssW = Math.max(1, Math.round(w));
  const cssH = Math.max(1, Math.round(h));

  canvasW = cssW;
  canvasH = cssH;

  DOM.canvas.width = Math.round(cssW * dpr);
  DOM.canvas.height = Math.round(cssH * dpr);
  DOM.canvas.style.width = cssW + 'px';
  DOM.canvas.style.height = cssH + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;
  if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;
  if ('msImageSmoothingEnabled' in ctx) ctx.msImageSmoothingEnabled = false;

  if (typeof _cachedBgGrad !== 'undefined') _cachedBgGrad = null;
}

window.addEventListener('resize', resizeCanvas);

/* ===== PROJECTION ===== */

function project(lane, z, includeSpinRotation = false) {
  if (!isFinite(z)) z = CONFIG.PLAYER_Z;
  if (!isFinite(lane)) lane = 0;

  z = Math.max(0, Math.min(z, 2));
  lane = Math.max(-1, Math.min(lane, 1));

  const scale = Math.max(0.05, 1 - z);
  const tubeRadius = CONFIG.TUBE_RADIUS * scale;
  let angle = lane * 0.55;

  if (includeSpinRotation && gameState.spinActive) {
    const spinProgress = gameState.spinProgress / CONFIG.SPIN_DURATION;
    angle += spinProgress * Math.PI * 2;
  }

  const x = canvasW / 2 + Math.sin(angle) * tubeRadius;
  const y = canvasH / 2 + Math.cos(angle) * tubeRadius * CONFIG.PLAYER_OFFSET;

  if (!isFinite(x) || !isFinite(y)) {
    return { x: canvasW / 2, y: canvasH / 2, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function projectPlayer(z) {
  if (!isFinite(z)) z = CONFIG.PLAYER_Z;

  const scale = Math.max(0.05, 1 - z);
  const r = CONFIG.TUBE_RADIUS * scale;

  let angleLane = player.lane;
  if (player.isLaneTransition) {
    const t = player.laneAnimFrame / CONFIG.LANE_TRANSITION_FRAMES;
    angleLane = player.lanePrev + (player.targetLane - player.lanePrev) * t;
  }

  let spinRotation = 0;
  if (gameState.spinActive) {
    spinRotation = (gameState.spinProgress / CONFIG.SPIN_DURATION) * Math.PI * 2;
  }

  const angle = angleLane * 0.55 + spinRotation;
  const x = canvasW / 2 + Math.sin(angle) * r;
  const y = canvasH / 2 + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET;

  if (!isFinite(x) || !isFinite(y)) {
    return { x: canvasW / 2, y: canvasH / 2, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function getSpinFrameIndex(spinProgress, totalFrames) {
  const exactFrame = spinProgress * totalFrames;
  return Math.max(0, Math.round(exactFrame) % totalFrames);
}

function updatePlayerAnimation(delta) {
  if (gameState.spinActive) return;
  player.frameTimer += delta;
  const anim = getCurrentAnimation();
  if (!anim) return;
  if (player.frameTimer >= 0.3) {
    player.frameTimer -= 0.3;
    player.frameIndex += 1;
  }
}

function getCurrentAnimation() {
  if (gameState.spinActive) return null;
  if (player.state === "transition") {
    return player.targetLane < player.lane ? Animations.swipe_left : Animations.swipe_right;
  }
  switch (player.lane) {
    case -1: return Animations.idle_left;
    case 1: return Animations.idle_right;
    default: return Animations.idle_back;
  }
}

/* ===== DRAWING ===== */

// Segment color lookup table — updated once per frame instead of per polygon
const _segmentColorCache = [];
let _lastColorCacheRotation = -999;

// Normalize angle difference to [-π, π]
function _normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
}

function updateSegmentColorCache() {
  const rotKey = Math.floor(gameState.tubeRotation * 10);
  if (rotKey === _lastColorCacheRotation && _segmentColorCache.length === CONFIG.TUBE_SEGMENTS) return;
  _lastColorCacheRotation = rotKey;
  _segmentColorCache.length = CONFIG.TUBE_SEGMENTS;
  for (let i = 0; i < CONFIG.TUBE_SEGMENTS; i++) {
    const u = i / CONFIG.TUBE_SEGMENTS;
    const baseAngle = u * Math.PI * 2 + gameState.tubeRotation;
    _segmentColorCache[i] = getSegmentColor(baseAngle, i);
  }
}

function getSegmentColor(angle, index) {
  const hue = (angle * 180 / Math.PI + index * 8) % 360;
  const r = 140 + Math.sin(hue * Math.PI / 180) * 30;
  const g = 60 + Math.cos(hue * Math.PI / 180) * 20;
  const b = 70 + Math.sin(hue * Math.PI / 180 * 0.5) * 25;
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
}

function updateSegmentTrigCache() {
  const rotationKey = Math.round(gameState.tubeRotation * 1000);
  const curveKey = Math.round(gameState.tubeCurveAngle * 1000);
  if (
    _segmentTrigCache.rotationKey === rotationKey &&
    _segmentTrigCache.curveKey === curveKey &&
    _segmentTrigCache.boundarySin.length === CONFIG.TUBE_SEGMENTS + 1
  ) return;

  _segmentTrigCache.rotationKey = rotationKey;
  _segmentTrigCache.curveKey = curveKey;
  _segmentTrigCache.boundarySin.length = CONFIG.TUBE_SEGMENTS + 1;
  _segmentTrigCache.boundaryCos.length = CONFIG.TUBE_SEGMENTS + 1;
  _segmentTrigCache.midAngles.length = CONFIG.TUBE_SEGMENTS;

  for (let i = 0; i <= CONFIG.TUBE_SEGMENTS; i++) {
    const u = (i % CONFIG.TUBE_SEGMENTS) / CONFIG.TUBE_SEGMENTS;
    const angle = u * Math.PI * 2 + gameState.tubeRotation + gameState.tubeCurveAngle;
    _segmentTrigCache.boundarySin[i] = Math.sin(angle);
    _segmentTrigCache.boundaryCos[i] = Math.cos(angle);
    if (i < CONFIG.TUBE_SEGMENTS) {
      _segmentTrigCache.midAngles[i] = (u + 0.5 / CONFIG.TUBE_SEGMENTS) * Math.PI * 2 + gameState.tubeRotation;
    }
  }
}

const _tubeStyleCache = {
  bevelLight: [],
  bevelDark: [],
  grout: [],
  innerShadow: [],
  rimLight: []
};

function updateTubeStyleCache() {
  const maxDepth = CONFIG.TUBE_DEPTH_STEPS;
  _tubeStyleCache.bevelLight.length = maxDepth;
  _tubeStyleCache.bevelDark.length = maxDepth;
  _tubeStyleCache.grout.length = maxDepth;
  _tubeStyleCache.innerShadow.length = maxDepth;
  _tubeStyleCache.rimLight.length = maxDepth;

  for (let d = 0; d < maxDepth; d++) {
    const bevelDepthFade = Math.max(0.26, 1 - d / CONFIG.TUBE_DEPTH_STEPS);
    _tubeStyleCache.bevelLight[d] = `rgba(255, 225, 235, ${(0.24 * bevelDepthFade).toFixed(3)})`;
    _tubeStyleCache.bevelDark[d] = `rgba(10, 0, 14, ${(0.32 * bevelDepthFade).toFixed(3)})`;
    _tubeStyleCache.grout[d] = `rgba(6, 0, 8, ${(0.26 * bevelDepthFade).toFixed(3)})`;
    _tubeStyleCache.innerShadow[d] = `rgba(0, 0, 0, ${(0.15 * bevelDepthFade).toFixed(3)})`;
    _tubeStyleCache.rimLight[d] = `rgba(255, 180, 210, ${(0.12 * bevelDepthFade).toFixed(3)})`;
  }
}

updateTubeStyleCache();

const TUBE_RENDER_MODE = Object.freeze({
  SMOOTH: 'smooth',
  SEGMENTED: 'segmented'
});

function getTubeRenderMode() {
  return gameState.tubeRenderMode === TUBE_RENDER_MODE.SEGMENTED ? TUBE_RENDER_MODE.SEGMENTED : TUBE_RENDER_MODE.SMOOTH;
}

function getTubeRingGeometry(depthIndex) {
  const z = depthIndex * CONFIG.TUBE_Z_STEP;
  const scale = 1 - z;
  if (scale <= 0) return null;

  const innerR = CONFIG.TUBE_RADIUS * 0.15;
  const radius = Math.max(innerR, CONFIG.TUBE_RADIUS * scale);
  const bendInf = 1 - scale;

  return {
    z,
    scale,
    radius,
    bendInf,
    cx: canvasW / 2 + gameState.centerOffsetX * bendInf,
    cy: canvasH / 2 + gameState.centerOffsetY * bendInf,
    ry: radius * CONFIG.PLAYER_OFFSET
  };
}

function buildTubeRingPath(ring) {
  const path = new Path2D();
  path.ellipse(ring.cx, ring.cy, ring.radius, ring.ry, 0, 0, Math.PI * 2);
  return path;
}

function drawSegmentedTube(params) {
  const { centerOffsetX, centerOffsetY, offsetMag, hasShadow, shadowCenterAngle, shadowHalfWidth, glowIntensity, hasGlow, lowQuality } = params;
  const depthStep = lowQuality ? 2 : 1;
  const segmentStep = lowQuality ? 2 : 1;
  let tubeQuadCount = 0;

  for (let d = CONFIG.TUBE_DEPTH_STEPS - 1; d >= 0; d -= depthStep) {
    const z1 = d * CONFIG.TUBE_Z_STEP;
    const z2 = (d + 1) * CONFIG.TUBE_Z_STEP;
    const scale1 = 1 - z1;
    const scale2 = 1 - z2;

    if (scale2 <= 0) continue;

    const innerR = CONFIG.TUBE_RADIUS * 0.15;
    const r1 = Math.max(innerR, CONFIG.TUBE_RADIUS * scale1);
    const r2 = Math.max(innerR, CONFIG.TUBE_RADIUS * scale2);
    const depthFade = hasGlow ? Math.max(0, 1 - d / (CONFIG.TUBE_DEPTH_STEPS * 0.7)) : 0;

    for (let i = 0; i < CONFIG.TUBE_SEGMENTS; i += segmentStep) {
      const nextIndex = Math.min(i + segmentStep, CONFIG.TUBE_SEGMENTS);
      const segMidBaseAngle = _segmentTrigCache.midAngles[i];
      const bendInf1 = 1 - scale1;
      const bendInf2 = 1 - scale2;
      const sin1 = _segmentTrigCache.boundarySin[i];
      const cos1 = _segmentTrigCache.boundaryCos[i];
      const sin2 = _segmentTrigCache.boundarySin[nextIndex];
      const cos2 = _segmentTrigCache.boundaryCos[nextIndex];

      const x1 = canvasW / 2 + sin1 * r1 + centerOffsetX * bendInf1;
      const y1 = canvasH / 2 + cos1 * r1 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf1;
      const x2 = canvasW / 2 + sin2 * r1 + centerOffsetX * bendInf1;
      const y2 = canvasH / 2 + cos2 * r1 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf1;
      const x3 = canvasW / 2 + sin2 * r2 + centerOffsetX * bendInf2;
      const y3 = canvasH / 2 + cos2 * r2 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf2;
      const x4 = canvasW / 2 + sin1 * r2 + centerOffsetX * bendInf2;
      const y4 = canvasH / 2 + cos1 * r2 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf2;
      tubeQuadCount++;

      ctx.fillStyle = _segmentColorCache[i];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();

      if (!lowQuality) {
        const bevelLightStyle = _tubeStyleCache.bevelLight[d];
        const bevelDarkStyle = _tubeStyleCache.bevelDark[d];
        const groutStyle = _tubeStyleCache.grout[d];
        const innerShadowStyle = _tubeStyleCache.innerShadow[d];
        const rimLightStyle = _tubeStyleCache.rimLight[d];

        ctx.strokeStyle = bevelLightStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x4, y4);
        ctx.stroke();

        ctx.strokeStyle = bevelDarkStyle;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.moveTo(x4, y4);
        ctx.lineTo(x3, y3);
        ctx.stroke();

        ctx.strokeStyle = groutStyle;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.stroke();

        const inset = 0.24;
        const ix1 = x1 + (x3 - x1) * inset;
        const iy1 = y1 + (y3 - y1) * inset;
        const ix2 = x2 + (x4 - x2) * inset;
        const iy2 = y2 + (y4 - y2) * inset;
        const ix3 = x3 + (x1 - x3) * inset;
        const iy3 = y3 + (y1 - y3) * inset;
        const ix4 = x4 + (x2 - x4) * inset;
        const iy4 = y4 + (y2 - y4) * inset;
        ctx.fillStyle = innerShadowStyle;
        ctx.beginPath();
        ctx.moveTo(ix1, iy1);
        ctx.lineTo(ix2, iy2);
        ctx.lineTo(ix3, iy3);
        ctx.lineTo(ix4, iy4);
        ctx.closePath();
        ctx.fill();

        const rimInset = 0.08;
        const rx1 = x1 + (x3 - x1) * rimInset;
        const ry1 = y1 + (y3 - y1) * rimInset;
        const rx2 = x2 + (x4 - x2) * rimInset;
        const ry2 = y2 + (y4 - y2) * rimInset;
        const rx3 = x3 + (x1 - x3) * rimInset;
        const ry3 = y3 + (y1 - y3) * rimInset;
        const rx4 = x4 + (x2 - x4) * rimInset;
        const ry4 = y4 + (y2 - y4) * rimInset;
        ctx.strokeStyle = rimLightStyle;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.lineTo(rx3, ry3);
        ctx.lineTo(rx4, ry4);
        ctx.closePath();
        ctx.stroke();
      }

      if (hasShadow) {
        const absAngDiff = Math.abs(_normalizeAngleDiff(segMidBaseAngle - shadowCenterAngle));
        if (absAngDiff < shadowHalfWidth) {
          const shadowFactor = 1 - absAngDiff / shadowHalfWidth;
          const depthFactor = 1 + d / CONFIG.TUBE_DEPTH_STEPS * 2;
          const intensity = Math.min(1, offsetMag / 80) * shadowFactor * shadowFactor * shadowFactor * depthFactor;
          const shadowAlpha = Math.min(1, intensity * 0.92);
          ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.lineTo(x4, y4);
          ctx.closePath();
          ctx.fill();
        }
      }

      if (!lowQuality && hasGlow && depthFade > 0) {
        let shadowAtten = 1;
        if (hasShadow) {
          const absAngDiff = Math.abs(_normalizeAngleDiff(segMidBaseAngle - shadowCenterAngle));
          if (absAngDiff < shadowHalfWidth) shadowAtten = absAngDiff / shadowHalfWidth;
        }
        const glowAlpha = glowIntensity * depthFade * shadowAtten * 0.55;
        if (glowAlpha > 0.01) {
          ctx.strokeStyle = `rgba(80,255,220,${glowAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.lineTo(x4, y4);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }

  return {
    tubeQuads: tubeQuadCount,
    estimatedTubePasses: lowQuality ? tubeQuadCount : tubeQuadCount * 6
  };
}

function drawSmoothTube(params) {
  const { offsetMag, hasShadow, shadowCenterAngle, shadowHalfWidth, glowIntensity, hasGlow, lowQuality } = params;
  const depthStep = lowQuality ? 2 : 1;
  const nearestRing = getTubeRingGeometry(0);
  if (!nearestRing) return { tubeQuads: 0, estimatedTubePasses: 0 };

  let ringPasses = 0;
  for (let d = CONFIG.TUBE_DEPTH_STEPS - 1; d >= 0; d -= depthStep) {
    const outerRing = getTubeRingGeometry(d);
    const innerRing = getTubeRingGeometry(d + depthStep);
    if (!outerRing || !innerRing) continue;

    const ringPath = buildTubeRingPath(outerRing);
    const innerPath = buildTubeRingPath(innerRing);
    const depthT = d / Math.max(1, CONFIG.TUBE_DEPTH_STEPS - 1);
    const rotationPhase = gameState.tubeRotation + depthT * 1.7;
    const highlightX = outerRing.cx + Math.sin(rotationPhase) * outerRing.radius * 0.28;
    const highlightY = outerRing.cy - Math.cos(rotationPhase) * outerRing.ry * 0.22;
    const radial = ctx.createRadialGradient(
      highlightX,
      highlightY,
      Math.max(outerRing.radius * 0.06, 6),
      outerRing.cx,
      outerRing.cy,
      outerRing.radius
    );
    const baseHue = 312 + Math.sin(rotationPhase + depthT * 3.1) * 18;
    const nearBoost = 1 - depthT;
    radial.addColorStop(0, `hsla(${baseHue.toFixed(1)}, 80%, ${Math.max(44, 64 - depthT * 18).toFixed(1)}%, ${(0.28 + nearBoost * 0.08).toFixed(3)})`);
    radial.addColorStop(0.35, `hsla(${(baseHue + 12).toFixed(1)}, 74%, ${Math.max(28, 44 - depthT * 10).toFixed(1)}%, ${(0.7 - depthT * 0.16).toFixed(3)})`);
    radial.addColorStop(1, `hsla(${(baseHue + 28).toFixed(1)}, 72%, ${Math.max(16, 22 - depthT * 6).toFixed(1)}%, ${(0.98 - depthT * 0.15).toFixed(3)})`);

    ctx.save();
    ctx.fillStyle = radial;
    ctx.fill(ringPath);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(innerPath);
    ctx.restore();
    ringPasses++;

    if (!lowQuality) {
      ctx.save();
      ctx.globalAlpha = 0.08 + nearBoost * 0.05;
      ctx.drawImage(
        tubeTextureCanvas,
        0,
        (gameState.tubeScroll * 0.35 + d * 11) % tubeTextureCanvas.height,
        tubeTextureCanvas.width,
        Math.max(1, Math.floor(tubeTextureCanvas.height * 0.35)),
        outerRing.cx - outerRing.radius,
        outerRing.cy - outerRing.ry,
        outerRing.radius * 2,
        outerRing.ry * 2
      );
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill(innerPath);
      ctx.restore();
      ringPasses++;
    }

    const shadowDepthAlpha = hasShadow ? Math.min(0.36, (offsetMag / 120) * (0.3 + depthT * 0.9)) : 0;
    if (shadowDepthAlpha > 0.01) {
      const shadowX = outerRing.cx + Math.sin(shadowCenterAngle) * outerRing.radius * 0.38;
      const shadowY = outerRing.cy + Math.cos(shadowCenterAngle) * outerRing.ry * 0.38;
      const shadow = ctx.createRadialGradient(shadowX, shadowY, 1, outerRing.cx, outerRing.cy, outerRing.radius * 1.1);
      shadow.addColorStop(0, `rgba(0,0,0,${shadowDepthAlpha.toFixed(3)})`);
      shadow.addColorStop(Math.min(0.72, shadowHalfWidth / (Math.PI * 2)), `rgba(0,0,0,${(shadowDepthAlpha * 0.48).toFixed(3)})`);
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.fillStyle = shadow;
      ctx.fill(ringPath);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill(innerPath);
      ctx.restore();
      ringPasses++;
    }

    if (hasGlow) {
      const glowAlpha = glowIntensity * Math.max(0, 1 - d / (CONFIG.TUBE_DEPTH_STEPS * 0.72)) * (lowQuality ? 0.18 : 0.28);
      if (glowAlpha > 0.01) {
        ctx.save();
        ctx.strokeStyle = `rgba(80,255,220,${glowAlpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, outerRing.radius - innerRing.radius);
        ctx.beginPath();
        ctx.ellipse(
          (outerRing.cx + innerRing.cx) / 2,
          (outerRing.cy + innerRing.cy) / 2,
          (outerRing.radius + innerRing.radius) / 2,
          (outerRing.ry + innerRing.ry) / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
        ringPasses++;
      }
    }
  }

  if (!lowQuality) {
    const mouthGlow = ctx.createRadialGradient(
      nearestRing.cx,
      nearestRing.cy,
      nearestRing.radius * 0.42,
      nearestRing.cx,
      nearestRing.cy,
      nearestRing.radius * 1.05
    );
    mouthGlow.addColorStop(0, 'rgba(255,170,210,0)');
    mouthGlow.addColorStop(0.68, 'rgba(255,170,210,0.03)');
    mouthGlow.addColorStop(1, 'rgba(255,210,230,0.14)');
    ctx.save();
    ctx.strokeStyle = mouthGlow;
    ctx.lineWidth = Math.max(8, CONFIG.TUBE_RADIUS * 0.08);
    ctx.beginPath();
    ctx.ellipse(nearestRing.cx, nearestRing.cy, nearestRing.radius, nearestRing.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ringPasses++;
  }

  return {
    tubeQuads: Math.ceil(CONFIG.TUBE_DEPTH_STEPS / depthStep),
    estimatedTubePasses: ringPasses
  };
}

class TubeRenderer {
  draw() {
    const start = performance.now();
    const rotSpeed = Math.min(CONFIG.BASE_ROTATION_SPEED * gameState.speed * 18, CONFIG.MAX_ROTATION_SPEED);
    gameState.tubeRotation += rotSpeed * 0.01;
    gameState.tubeScroll += gameState.speed * 40;

    const centerOffsetX = gameState.centerOffsetX;
    const centerOffsetY = gameState.centerOffsetY;
    updateSegmentColorCache();
    updateSegmentTrigCache();

    const offsetMag = Math.sqrt(centerOffsetX * centerOffsetX + centerOffsetY * centerOffsetY);
    const hasShadow = offsetMag > 1;
    const shadowCenterAngle = hasShadow ? Math.atan2(-centerOffsetX, -centerOffsetY) : 0;
    const shadowHalfWidth = Math.PI * 2.0;
    const glowDist = gameState.distance || 0;
    const glowIntensity = glowDist < 500 ? 0 : Math.min(1, (glowDist - 500) / 200);
    const hasGlow = glowIntensity > 0;
    const lowQuality = gameState.renderQuality === 'low';
    const sharedParams = { centerOffsetX, centerOffsetY, offsetMag, hasShadow, shadowCenterAngle, shadowHalfWidth, glowIntensity, hasGlow, lowQuality };

    const tubeStats = getTubeRenderMode() === TUBE_RENDER_MODE.SEGMENTED
      ? drawSegmentedTube(sharedParams)
      : drawSmoothTube(sharedParams);

    gameState.debugStats.tubeQuads = tubeStats.tubeQuads;
    gameState.debugStats.estimatedTubePasses = tubeStats.estimatedTubePasses;
    gameState.debugStats.tubeMs = performance.now() - start;
  }
}

const tubeRenderer = new TubeRenderer();

function drawTube() {
  if (typeof window !== 'undefined' && typeof window.__URSAS_TUBE_RENDER_MODE === 'string') {
    gameState.tubeRenderMode = window.__URSAS_TUBE_RENDER_MODE === 'segmented' ? 'segmented' : 'smooth';
  }
  tubeRenderer.draw();
}

function drawTubeDepth() {
  if (gameState.renderQuality === "low") return;
  const cx = canvasW / 2 + gameState.centerOffsetX;
  const cy = canvasH / 2 + gameState.centerOffsetY;
  if (!isFinite(cx) || !isFinite(cy)) return;

  const grad = ctx.createRadialGradient(cx, cy, CONFIG.TUBE_RADIUS * 0.1, cx, cy, CONFIG.TUBE_RADIUS);
  grad.addColorStop(0, "rgba(0,0,0,0.85)");
  grad.addColorStop(0.15, "rgba(0,0,0,0.7)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.3)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, CONFIG.TUBE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

function drawTubeCenter() {
  const cx = canvasW / 2 + gameState.centerOffsetX;
  const cy = canvasH / 2 + gameState.centerOffsetY;
  if (!isFinite(cx) || !isFinite(cy)) return;

  const outerR = CONFIG.TUBE_RADIUS * 0.18;

  const grad1 = ctx.createRadialGradient(cx, cy, CONFIG.TUBE_RADIUS * 0.08, cx, cy, outerR);
  grad1.addColorStop(0, "rgba(20,20,40,0.9)");
  grad1.addColorStop(0.5, "rgba(40,20,50,0.7)");
  grad1.addColorStop(1, "rgba(30,10,30,0.4)");
  ctx.fillStyle = grad1;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  const grad2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, CONFIG.TUBE_RADIUS * 0.08);
  grad2.addColorStop(0, "rgba(10,5,15,1)");
  grad2.addColorStop(1, "rgba(20,10,25,0.8)");
  ctx.fillStyle = grad2;
  ctx.beginPath();
  ctx.arc(cx, cy, CONFIG.TUBE_RADIUS * 0.08, 0, Math.PI * 2);
  ctx.fill();

  if (gameState.renderQuality !== "low") {
    ctx.strokeStyle = "rgba(100,60,80,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CONFIG.TUBE_RADIUS * 0.15, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPlayer() {
  const p = projectPlayer(CONFIG.PLAYER_Z);

  let frameX = 0, frameY = 0;
  let spriteWidth = 128, spriteHeight = 128;
  let playerAtlas = null;

  if (gameState.spinActive && gameState.spinProgress >= 0) {
    const anim = Animations.spin;
    playerAtlas = assetManager.getAsset(anim.atlas);
    if (!playerAtlas) return;
    spriteWidth = anim.spriteWidth;
    spriteHeight = anim.spriteHeight;
    const spinProgress = gameState.spinProgress / CONFIG.SPIN_DURATION;
    const currentFrame = getSpinFrameIndex(spinProgress, anim.frames);
    frameX = currentFrame % anim.colsPerRow;
    frameY = Math.floor(currentFrame / anim.colsPerRow);
  } else {
    const anim = getCurrentAnimation();
    if (!anim) return;
    playerAtlas = assetManager.getAsset(anim.atlas);
    if (!playerAtlas) return;
    spriteWidth = anim.spriteWidth;
    spriteHeight = anim.spriteHeight;
    const currentFrame = Math.round(player.frameIndex) % anim.frames;
    frameX = currentFrame % anim.colsPerRow;
    frameY = Math.floor(currentFrame / anim.colsPerRow);
  }

  const displaySize = spriteWidth * 1.2;
  const screenX = p.x - displaySize / 2;
  const screenY = p.y - displaySize / 2;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + displaySize * 0.3, displaySize * 0.6, displaySize * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.drawImage(playerAtlas, frameX * spriteWidth, frameY * spriteHeight, spriteWidth, spriteHeight, screenX, screenY, displaySize, displaySize);
}

function drawCoins() {
  const centerOffsetX = gameState.centerOffsetX;
  const centerOffsetY = gameState.centerOffsetY;
  const SPRITE_W = CONFIG.FRAME_SIZE;
  const SPRITE_H = CONFIG.FRAME_SIZE;
  const FRAMES = 4;
  let visibleCoins = 0;
  let visibleSpinTargets = 0;

  if (Array.isArray(coins)) {
    for (const c of coins) {
      if (c.collected) continue;

      let p = null;

      if (typeof c.angle === "number") {
        const scale = Math.max(0.05, 1 - c.z);
        const r = CONFIG.TUBE_RADIUS * scale * (c.radiusFactor || 0.65);
        const angle = c.angle + gameState.tubeRotation;
        p = { x: canvasW / 2 + Math.sin(angle) * r, y: canvasH / 2 + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET, scale };
        if (p.scale < 0.15) continue;
      } else if (typeof c.lane === "number") {
        p = project(c.lane, c.z, false);
        if (!p || p.scale <= 0.01 || p.scale < 0.15) continue;
      } else {
        continue;
      }

      const bendInf = 1 - p.scale;
      const offsetX = centerOffsetX * bendInf;
      const offsetY = centerOffsetY * bendInf;

      const isGold = c.type === "gold" || c.type === "gold_spin";
      const atlas = assetManager.getAsset(isGold ? "coins_gold" : "coins_silver");
      if (!atlas) continue;

      const frame = (c.animFrame || 0) % FRAMES;
      const sx = frame * SPRITE_W;
      const sz = Math.max(18, SPRITE_W * p.scale * (isGold ? 1.0 : 0.95));
      const dx = Math.round(p.x - sz / 2 + offsetX);
      const dy = Math.round(p.y - sz / 2 + offsetY);

      if (c.spinOnly) {
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.drawImage(atlas, sx, 0, SPRITE_W, SPRITE_H, dx, dy, sz, sz);
        ctx.restore();
      } else {
        ctx.drawImage(atlas, sx, 0, SPRITE_W, SPRITE_H, dx, dy, sz, sz);
      }
      visibleCoins++;
    }
  }

  // Draw spin combo targets (crosshair/bullseye)
  if (Array.isArray(spinTargets)) {
    const pulse = (Math.sin(Date.now() * 0.008) + 1) / 2;
    for (const t of spinTargets) {
      if (t.collected) continue;
      const scale = Math.max(0.05, 1 - t.z);
      if (scale < 0.15) continue;
      const r = CONFIG.TUBE_RADIUS * scale * (t.radiusFactor || 0.65);
      const angle = t.angle + gameState.tubeRotation;
      const tx = canvasW / 2 + Math.sin(angle) * r;
      const ty = canvasH / 2 + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET;
      const sz = Math.max(12, 28 * scale);

      ctx.save();
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.strokeStyle = `rgba(255, 100, 50, ${0.8 + pulse * 0.2})`;
      ctx.lineWidth = 2 * scale;
      // Outer circle
      ctx.beginPath();
      ctx.arc(tx, ty, sz, 0, Math.PI * 2);
      ctx.stroke();
      // Inner circle
      ctx.beginPath();
      ctx.arc(tx, ty, sz * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      // Cross
      ctx.beginPath();
      ctx.moveTo(tx - sz * 1.2, ty);
      ctx.lineTo(tx + sz * 1.2, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx, ty - sz * 1.2);
      ctx.lineTo(tx, ty + sz * 1.2);
      ctx.stroke();
      ctx.restore();
      visibleSpinTargets++;
    }
  }

  gameState.debugStats.visibleCoins = visibleCoins;
  gameState.debugStats.visibleSpinTargets = visibleSpinTargets;
}

function drawObjects() {
  const renderList = [];
  const centerOffsetX = gameState.centerOffsetX;
  const centerOffsetY = gameState.centerOffsetY;
  let visibleObstacles = 0;
  let visibleBonuses = 0;

  obstacles.forEach(o => { if (o.z > -0.2 && o.z < 1.6) renderList.push({ type: "obstacle", z: o.z, obj: o }); });
  bonuses.forEach(b => { if (b.z > -0.2 && b.z < 1.6) renderList.push({ type: "bonus", z: b.z, obj: b }); });
  renderList.sort((a, b) => b.z - a.z);

  const bonusFrameMap = {
    [BONUS_TYPES.SHIELD]: (frame) => ({ atlas: 'bonus_shield', spriteWidth: 64, spriteHeight: 64, col: frame % 4, row: 0 }),
    [BONUS_TYPES.SPEED_DOWN]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_speed', spriteWidth: 64, spriteHeight: 64, manualSX: slow === 0 ? 0 : 64, row: 0 };
    },
    [BONUS_TYPES.SPEED_UP]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_speed', spriteWidth: 64, spriteHeight: 64, manualSX: slow === 0 ? 128 : 192, row: 0 };
    },
    [BONUS_TYPES.MAGNET]: (frame) => ({ atlas: 'bonus_magnet', spriteWidth: 64, spriteHeight: 64, col: Math.floor(frame / 2) % 6, row: 0 }),
    [BONUS_TYPES.INVERT]: (frame) => ({ atlas: 'bonus_chkey', spriteWidth: 128, spriteHeight: 64, col: Math.floor(frame / 4) % 2, row: 0 }),
    [BONUS_TYPES.SCORE_300]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_score_plus', spriteWidth: slow === 0 ? 128 : 64, spriteHeight: 64, manualSX: slow === 0 ? 0 : 128, row: 0 };
    },
    [BONUS_TYPES.SCORE_500]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_score_plus', spriteWidth: slow === 0 ? 128 : 64, spriteHeight: 64, manualSX: slow === 0 ? 192 : 320, row: 0 };
    },
    [BONUS_TYPES.X2]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_score_plus', spriteWidth: slow === 0 ? 128 : 64, spriteHeight: 64, manualSX: slow === 0 ? 384 : 512, row: 0 };
    },
    [BONUS_TYPES.SCORE_MINUS_300]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_score_minus', spriteWidth: slow === 0 ? 128 : 64, spriteHeight: 64, manualSX: slow === 0 ? 0 : 128, row: 0 };
    },
    [BONUS_TYPES.SCORE_MINUS_500]: (frame) => {
      const slow = Math.floor(frame / 4) % 2;
      return { atlas: 'bonus_score_minus', spriteWidth: slow === 0 ? 128 : 64, spriteHeight: 64, manualSX: slow === 0 ? 192 : 320, row: 0 };
    },
    [BONUS_TYPES.RECHARGE]: (frame) => ({
      atlas: 'bonus_recharge',
      spriteWidth: 64,
      spriteHeight: 64,
      col: Math.floor(frame / 3) % 5,
      row: 0
    }),
  };

  const obstacleTypeMap = {
    fence: { atlas: 'obstacles_1', col: 0, row: 0 },
    rock1: { atlas: 'obstacles_1', col: 1, row: 0 },
    rock2: { atlas: 'obstacles_1', col: 2, row: 0 },
    bull:  { atlas: 'obstacles_1', col: 3, row: 0 },
    wall_brick: { atlas: 'obstacles_2', col: 0, row: 0 },
    wall_kactus: { atlas: 'obstacles_2', col: 1, row: 0 },
    tree:  { atlas: 'obstacles_2', col: 2, row: 0 },
    pit:   { atlas: 'obstacles_3', col: 0, row: 0 },
    spikes: { atlas: 'obstacles_3', col: 1, row: 0 },
    bottles: { atlas: 'obstacles_3', col: 2, row: 0 }
  };

  for (const item of renderList) {
    const o = item.obj;
    const p = project(o.lane, o.z);
    if (!p || p.scale <= 0.01) continue;

    const bendInf = 1 - p.scale;
    const offsetX = centerOffsetX * bendInf;
    const offsetY = centerOffsetY * bendInf;

    if (item.type === "obstacle") {
      visibleObstacles++;
      const info = obstacleTypeMap[o.subtype];
      if (!info) continue;
      const atlasImage = assetManager.getAsset(info.atlas);
      if (!atlasImage) continue;
      
       // Obstacles should not grow right after spawn.
      // Keep x1.0 size in far zone, then smoothly grow in the near-approach zone.
      const obstacleGrowthStartZ = 1.0;
      const obstacleNearZ = CONFIG.PLAYER_Z;
      const approachRange = Math.max(0.001, obstacleGrowthStartZ - obstacleNearZ);
      const approachTLinear = Math.max(0, Math.min(1, (obstacleGrowthStartZ - o.z) / approachRange));
      const approachTSmooth = approachTLinear * approachTLinear * (3 - 2 * approachTLinear); // smoothstep
      const growthMul = 1 + 1.5 * approachTSmooth; // 1.0 -> 2.5

      const baseSize = Math.max(36, CONFIG.FRAME_SIZE * p.scale);
      const sz = baseSize * growthMul;

      ctx.drawImage(atlasImage, info.col * CONFIG.FRAME_SIZE, info.row * CONFIG.FRAME_SIZE, CONFIG.FRAME_SIZE, CONFIG.FRAME_SIZE, Math.round(p.x - sz / 2 + offsetX), Math.round(p.y - sz / 2 + offsetY), sz, sz);
    } else {
      visibleBonuses++;
      const frameFn = bonusFrameMap[o.type];
      if (!frameFn) continue;
      const frameInfo = frameFn(o.animFrame || 0);
      const bonusAtlas = assetManager.getAsset(frameInfo.atlas);
      const baseSz = Math.max(15, CONFIG.FRAME_SIZE * p.scale * 0.9);
      const sz = frameInfo.spriteWidth === 128 ? baseSz * 1.2 : baseSz;
      const bx = Math.round(p.x - sz / 2 + offsetX);
      const by = Math.round(p.y - sz / 2 + offsetY);
      if (bonusAtlas) {
        const sx = frameInfo.manualSX !== undefined ? frameInfo.manualSX : frameInfo.col * frameInfo.spriteWidth;
        ctx.drawImage(bonusAtlas, sx, frameInfo.row * frameInfo.spriteHeight, frameInfo.spriteWidth, frameInfo.spriteHeight, bx, by, sz, sz);
      } else if (o.type === BONUS_TYPES.RECHARGE) {
        // Fallback: programmatic battery icon
        ctx.save();
        const bw = sz * 0.55;
        const bh = sz * 0.85;
        const bcx = p.x + offsetX;
        const bcy = p.y + offsetY;
        ctx.strokeStyle = "#00dd88";
        ctx.fillStyle = "#00dd88";
        ctx.lineWidth = 2;
        // Battery body
        ctx.strokeRect(bcx - bw / 2, bcy - bh * 0.45, bw, bh * 0.9);
        // Battery fill
        ctx.fillRect(bcx - bw / 2 + 2, bcy - bh * 0.45 + 2, bw - 4, (bh * 0.9 - 4) * 0.7);
        // Battery cap
        ctx.fillRect(bcx - bw * 0.2, bcy - bh * 0.45 - bh * 0.1, bw * 0.4, bh * 0.1);
        ctx.restore();
      }
    }
  }

  gameState.debugStats.visibleObstacles = visibleObstacles;
  gameState.debugStats.visibleBonuses = visibleBonuses;
}

// Depth-based speed line particles (persist between frames)
const _depthSpeedLines = [];
let _depthSpeedLinesInit = false;

function _initDepthSpeedLines() {
  _depthSpeedLinesInit = true;
  const count = isMobile ? 6 : 13;
  for (let i = 0; i < count; i++) {
    _depthSpeedLines.push({
      angle: Math.random() * Math.PI * 2,
      z: Math.random(),
      len: 0.06 + Math.random() * 0.1
    });
  }
}

function drawSpeedLines() {
  const speedRatio = (gameState.speed - CONFIG.SPEED_START) / (CONFIG.SPEED_MAX - CONFIG.SPEED_START);
  if (speedRatio < 0.05 || !gameState.running) return;
  
  // Only use real speed-based intensity to avoid forced center streaks after 500m.
  const effectiveRatio = speedRatio;
  
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  const maxLineCount = isMobile ? 18 : 42;
  const lineCount = Math.min(maxLineCount, Math.floor(12 + effectiveRatio * 30));
  const alpha = 0.3 + effectiveRatio * 0.6;

  // Batch all speed lines into a single stroke call (no per-line gradient)
  ctx.save();
  ctx.strokeStyle = `rgba(255, 235, 200, ${alpha})`;
  ctx.lineWidth = 1 + effectiveRatio * 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < lineCount; i++) {
    // Deterministic angle based on index + rotation offset (no Math.random)
    const angle = (Math.PI * 2 * i) / lineCount + gameState.tubeRotation * 0.5;
    const startR = CONFIG.TUBE_RADIUS * (0.08 + (i % 5) * 0.05);
    const lineLength = (60 + effectiveRatio * 180) * (0.7 + (i % 3) * 0.15);
    const endR = startR + lineLength;

    const x1 = cx + Math.cos(angle) * startR;
    const y1 = cy + Math.sin(angle) * startR * CONFIG.PLAYER_OFFSET;
    const x2 = cx + Math.cos(angle) * endR;
    const y2 = cy + Math.sin(angle) * endR * CONFIG.PLAYER_OFFSET;

    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.restore();

  // Depth-based speed particles — travel from far toward camera (currently disabled)
  if (false && gameState.running) {
    if (!_depthSpeedLinesInit) _initDepthSpeedLines();
    const depthAlpha = Math.min(0.7, (gameState.distance - 500) / 1000) * (0.3 + effectiveRatio * 0.5);
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255, 255, 255, ${depthAlpha})`;
    ctx.lineWidth = 1;
    for (const sl of _depthSpeedLines) {
      // Move toward camera each frame
      sl.z -= gameState.speed * 1.4;
      if (sl.z <= 0.05) {
        sl.z = 0.9 + Math.random() * 0.5;
        sl.angle = Math.random() * Math.PI * 2;
        sl.len = 0.06 + Math.random() * 0.1;
      }

      const z1 = sl.z;
      const z2 = Math.max(0.05, sl.z - sl.len);
      const sc1 = Math.max(0.05, 1 - z1);
      const sc2 = Math.max(0.05, 1 - z2);
      const r1 = CONFIG.TUBE_RADIUS * sc1 * 0.72;
      const r2 = CONFIG.TUBE_RADIUS * sc2 * 0.72;

      const angle = sl.angle + gameState.tubeRotation * 0.3;
      const bendInf1 = 1 - sc1;
      const bendInf2 = 1 - sc2;
      const x1 = canvasW / 2 + Math.sin(angle) * r1 + gameState.centerOffsetX * bendInf1;
      const y1 = canvasH / 2 + Math.cos(angle) * r1 * CONFIG.PLAYER_OFFSET + gameState.centerOffsetY * bendInf1;
      const x2 = canvasW / 2 + Math.sin(angle) * r2 + gameState.centerOffsetX * bendInf2;
      const y2 = canvasH / 2 + Math.cos(angle) * r2 * CONFIG.PLAYER_OFFSET + gameState.centerOffsetY * bendInf2;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// Neon flying lines — pooled particles
const _neonLines = [];
let _neonLinesInit = false;
const _NEON_COLORS = [
  [0, 255, 255],   // cyan
  [255, 0, 255],   // magenta
  [0, 128, 255],   // electric blue
  [255, 20, 147],  // hot pink
];

function _initNeonLines() {
  _neonLinesInit = true;
  const count = isMobile ? 8 : 14;
  for (let i = 0; i < count; i++) {
    _neonLines.push({
      angle: Math.random() * Math.PI * 2,
      z: Math.random(),
      len: 0.08 + Math.random() * 0.14,
      colorIdx: Math.floor(Math.random() * _NEON_COLORS.length)
    });
  }
}

function drawNeonLines() {
  if (!gameState.running) return;
  // speedMultiplier: ratio of current speed to start speed (1.0 = start speed)
  const speedMultiplier = gameState.speed / CONFIG.SPEED_START;
  if (speedMultiplier <= 1.05) return;

  if (!_neonLinesInit) _initNeonLines();

  const intensity = Math.min(1, (speedMultiplier - 1.05) / 0.3);
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  ctx.save();
  ctx.lineCap = "round";

  for (const nl of _neonLines) {
    nl.z -= gameState.speed * 1.8;
    if (nl.z <= 0.04) {
      nl.z = 0.85 + Math.random() * 0.6;
      nl.angle = Math.random() * Math.PI * 2;
      nl.len = 0.08 + Math.random() * 0.14;
      nl.colorIdx = Math.floor(Math.random() * _NEON_COLORS.length);
    }

    const z1 = nl.z;
    const z2 = Math.max(0.04, nl.z - nl.len);
    const sc1 = Math.max(0.04, 1 - z1);
    const sc2 = Math.max(0.04, 1 - z2);
    const r1 = CONFIG.TUBE_RADIUS * sc1 * 0.68;
    const r2 = CONFIG.TUBE_RADIUS * sc2 * 0.68;

    const angle = nl.angle + gameState.tubeRotation * 0.4;
    // Each point follows depth curve offset proportional to its depth (1 - scale)
    const bendInf1 = 1 - sc1;
    const bendInf2 = 1 - sc2;
    const baseCx = canvasW / 2;
    const baseCy = canvasH / 2;
    // CONFIG.PLAYER_OFFSET scales Y to give the tube an elliptical appearance (same as all tube rendering)
    const x1 = baseCx + Math.sin(angle) * r1 + gameState.centerOffsetX * bendInf1;
    const y1 = baseCy + Math.cos(angle) * r1 * CONFIG.PLAYER_OFFSET + gameState.centerOffsetY * bendInf1;
    const x2 = baseCx + Math.sin(angle) * r2 + gameState.centerOffsetX * bendInf2;
    const y2 = baseCy + Math.cos(angle) * r2 * CONFIG.PLAYER_OFFSET + gameState.centerOffsetY * bendInf2;

    // Fade out near player (small z → sc close to 1)
    const fadeAlpha = Math.min(1, (z1 - 0.04) / 0.3) * intensity;
    if (fadeAlpha <= 0.01) continue;

    const [r, g, b] = _NEON_COLORS[nl.colorIdx];

    // Glow pass (wider, lower alpha)
    ctx.strokeStyle = `rgba(${r},${g},${b},${(fadeAlpha * 0.25).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Core pass (narrow, high alpha)
    ctx.strokeStyle = `rgba(${r},${g},${b},${(fadeAlpha * 0.85).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBonusText() {
  gameState.bonusTextTimer--;
  if (gameState.bonusTextTimer <= 0) return;

  const alpha = Math.min(1, gameState.bonusTextTimer / 20);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(canvasW / 2 - 220, canvasH * 0.28 - 30, 440, 60);
  ctx.fillStyle = "#ffe066";
  ctx.font = "bold 26px Orbitron, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(gameState.bonusText, canvasW / 2, canvasH * 0.28);
  ctx.restore();
}

function drawRadarHints() {
  if (!gameState.radarActive || !gameState.radarHints || gameState.radarHints.length === 0) return;

  const lanePositions = {
    [-1]: canvasW * 0.25,
    [0]: canvasW * 0.5,
    [1]: canvasW * 0.75
  };
  const laneLabels = {
    [-1]: "LEFT",
    [0]: "CENTER",
    [1]: "RIGHT"
  };
  const topY = canvasH * 0.22;
  const bottomY = canvasH - 36;

  ctx.save();
  for (const hint of gameState.radarHints) {
    const maxTimer = Math.max(0.1, hint.maxTimer || 1.8);
    const pulse = (Math.sin(Date.now() * 0.02) + 1) / 2;
    const alpha = (0.35 + pulse * 0.65) * Math.max(0, hint.timer / maxTimer);
    const lx = lanePositions[hint.lane] || canvasW / 2;

    ctx.globalAlpha = alpha;

    const glowGrad = ctx.createLinearGradient(lx, topY, lx, bottomY);
    glowGrad.addColorStop(0, 'rgba(255, 225, 90, 0)');
    glowGrad.addColorStop(0.25, 'rgba(255, 225, 90, 0.25)');
    glowGrad.addColorStop(0.6, 'rgba(255, 190, 0, 0.55)');
    glowGrad.addColorStop(1, 'rgba(255, 225, 90, 0.08)');

    ctx.strokeStyle = glowGrad;
    ctx.lineWidth = 7 + pulse * 3;
    ctx.beginPath();
    ctx.moveTo(lx, topY);
    ctx.lineTo(lx, bottomY);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 235, 120, ${Math.min(1, alpha + 0.15)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, topY);
    ctx.lineTo(lx, bottomY);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 210, 60, ${Math.min(1, alpha + 0.2)})`;
    ctx.font = "bold 17px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`🟡 NEXT GOLD: ${laneLabels[hint.lane] || "CENTER"}`, lx, topY - 8);
  }
  ctx.restore();
}

function drawSpinAlert() {
  if (gameState.spinAlertTimer <= 0) return;

  ctx.save();
  const alpha = Math.min(1, gameState.spinAlertTimer / 0.5);

  if (gameState.spinAlertLevel >= 2 && gameState.spinAlertCountdown > 0) {
    const countNum = Math.ceil(gameState.spinAlertCountdown);
    const pulse = (Math.sin(Date.now() * 0.015) + 1) / 2;
    ctx.globalAlpha = 0.85 + pulse * 0.15;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(canvasW / 2 - 130, canvasH * 0.18 - 30, 260, 60);
    ctx.fillStyle = countNum <= 1 ? "#ff4444" : "#ffcc00";
    ctx.font = "bold 32px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`🔔 ${countNum}...`, canvasW / 2, canvasH * 0.18);
  } else if (gameState.perfectSpinWindow) {
    const pulse = (Math.sin(Date.now() * 0.025) + 1) / 2;
    ctx.globalAlpha = 0.9 + pulse * 0.1;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(canvasW / 2 - 150, canvasH * 0.18 - 35, 300, 70);
    ctx.fillStyle = "#00ffaa";
    ctx.font = "bold 34px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✨ PRESS SPIN!", canvasW / 2, canvasH * 0.18);
  } else if (gameState.spinAlertLevel >= 1) {
    ctx.globalAlpha = Math.min(1, gameState.spinAlertTimer);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(canvasW / 2 - 160, canvasH * 0.18 - 28, 320, 56);
    ctx.fillStyle = "#ffcc00";
    ctx.font = "bold 24px Orbitron, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔔 SPIN RING!", canvasW / 2, canvasH * 0.18);
  }
  ctx.restore();
}

/* ===== TUBE BEZEL ===== */

// Measured inner hole radius (pixels from image center) in the 2048-wide source images
const _BEZEL_INNER_RX_SRC = 393;
const _BEZEL_INNER_RY_SRC = 393;
const _BEZEL_IMG_W = 2048;
const _BEZEL_IMG_H = 1365;

// Offscreen canvas for tinted light layer
let _bezelLightCanvas = null;
let _bezelLightDrawW = 0;
let _bezelLightDrawH = 0;
let _bezelLastR = -1, _bezelLastG = -1, _bezelLastB = -1;

function _bezelGetColor(t) {
  // Palette: blue → purple → ocean/teal → magenta → neon cyan → blue
  const palette = [
    [30, 60, 255],   // blue
    [140, 30, 255],  // purple
    [0, 180, 200],   // ocean/teal
    [200, 0, 180],   // magenta
    [0, 255, 220]    // neon cyan
  ];
  const n = palette.length;
  const pos = (t % 1) * n;
  const i = Math.floor(pos) % n;
  const j = (i + 1) % n;
  const f = pos - Math.floor(pos);
  // Smooth-step interpolation
  const s = f * f * (3 - 2 * f);
  return [
    Math.round(palette[i][0] * (1 - s) + palette[j][0] * s),
    Math.round(palette[i][1] * (1 - s) + palette[j][1] * s),
    Math.round(palette[i][2] * (1 - s) + palette[j][2] * s)
  ];
}

/* ===== TUBE TEXTURE ===== */

const tubeTextureCanvas = document.createElement("canvas");
const tubeTexCtx = tubeTextureCanvas.getContext("2d");
tubeTextureCanvas.width = CONFIG.TEX_SIZE;
tubeTextureCanvas.height = CONFIG.TEX_SIZE;

function generateTubeTexture() {
  for (let y = 0; y < CONFIG.TEX_SIZE; y += CONFIG.TEX_PIXEL_SIZE) {
    for (let x = 0; x < CONFIG.TEX_SIZE; x += CONFIG.TEX_PIXEL_SIZE) {
      const r = 140 + Math.random() * 20;
      const g = 60 + Math.random() * 20;
      const b = 70 + Math.random() * 15;
      tubeTexCtx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      tubeTexCtx.fillRect(x, y, CONFIG.TEX_PIXEL_SIZE, CONFIG.TEX_PIXEL_SIZE);

      if (Math.random() < 0.06) {
        tubeTexCtx.fillStyle = "rgb(180,40,60)";
        tubeTexCtx.fillRect(x, y, CONFIG.TEX_PIXEL_SIZE, CONFIG.TEX_PIXEL_SIZE);
      }
    }
  }
}

generateTubeTexture();

export {
  resizeCanvas,
  project,
  projectPlayer,
  updatePlayerAnimation,
  drawTube,
  drawTubeDepth,
  drawTubeCenter,
  drawPlayer,
  drawCoins,
  drawObjects,
  drawSpeedLines,
  drawNeonLines,
  drawBonusText,
  drawRadarHints,
  drawSpinAlert,
  canvasW,
  canvasH
};
