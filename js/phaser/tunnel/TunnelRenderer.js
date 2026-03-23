import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
const BOOST_THRESHOLD = CONFIG.SPEED_START * 1.35;
const QUALITY_PRESETS = Object.freeze({
  low: {
    depthStep: 3,
    segmentStep: 2,
    fogLayers: 2,
    stripModulo: 5,
    lineCount: 10,
    glowAlpha: 0.12,
    rimAlpha: 0.2,
    pulseAlpha: 0.12,
    haloAlpha: 0.2,
    flashDecay: 0.84,
    rippleDecay: 0.88
  },
  medium: {
    depthStep: 2,
    segmentStep: 1,
    fogLayers: 3,
    stripModulo: 4,
    lineCount: 16,
    glowAlpha: 0.2,
    rimAlpha: 0.3,
    pulseAlpha: 0.2,
    haloAlpha: 0.28,
    flashDecay: 0.88,
    rippleDecay: 0.9
  },
  high: {
    depthStep: 1,
    segmentStep: 1,
    fogLayers: 5,
    stripModulo: 3,
    lineCount: 24,
    glowAlpha: 0.32,
    rimAlpha: 0.4,
    pulseAlpha: 0.28,
    haloAlpha: 0.38,
    flashDecay: 0.9,
    rippleDecay: 0.92
  }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
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

function getSegmentColor(angle, index, colorBoost) {
  const hue = (angle * 180 / Math.PI + index * 8) % 360;
  const r = clamp(Math.round(138 + Math.sin(hue * Math.PI / 180) * 28 + colorBoost * 40), 0, 255);
  const g = clamp(Math.round(48 + Math.cos(hue * Math.PI / 180) * 18 + colorBoost * 18), 0, 255);
  const b = clamp(Math.round(92 + Math.sin(hue * Math.PI / 360) * 40 + colorBoost * 56), 0, 255);
  return rgbToInt(r, g, b);
}

class TunnelRenderer {
  constructor(scene) {
    this.scene = scene;
    this.baseGraphics = null;
    this.lightGraphics = null;
    this.fogGraphics = null;
    this.fxGraphics = null;
    this.flashGraphics = null;
    this.debugText = null;
    this.snapshot = null;
    this.prevSpeed = CONFIG.SPEED_START;
    this.prevCurveStrength = 0;
    this.prevOffsetMagnitude = 0;
    this.boostPulse = 0;
    this.flashLevel = 0;
    this.rippleLevel = 0;
  }

  create() {
    this.baseGraphics = this.scene.add.graphics().setDepth(1);
    this.lightGraphics = this.scene.add.graphics().setDepth(2);
    this.fogGraphics = this.scene.add.graphics().setDepth(3);
    this.fxGraphics = this.scene.add.graphics().setDepth(4);
    this.flashGraphics = this.scene.add.graphics().setDepth(5);
    this.debugText = this.scene.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#f8fafc',
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      padding: { left: 8, right: 8, top: 6, bottom: 6 }
    }).setDepth(20);

    this.applySnapshot(this.snapshot);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    if (!this.baseGraphics || !this.lightGraphics || !this.fogGraphics || !this.fxGraphics || !this.flashGraphics) {
      return;
    }

    this.updateFxState();
    this.drawTunnel();
    this.drawOverlay();
  }

  resize() {
    this.applySnapshot(this.snapshot);
  }

  destroy() {
    this.baseGraphics?.destroy();
    this.lightGraphics?.destroy();
    this.fogGraphics?.destroy();
    this.fxGraphics?.destroy();
    this.flashGraphics?.destroy();
    this.debugText?.destroy();
    this.baseGraphics = null;
    this.lightGraphics = null;
    this.fogGraphics = null;
    this.fxGraphics = null;
    this.flashGraphics = null;
    this.debugText = null;
  }

  updateFxState() {
    const snapshot = this.snapshot;
    const tube = snapshot?.tube;
    const fx = snapshot?.fx;
    const quality = QUALITY_PRESETS[tube?.quality || 'high'] || QUALITY_PRESETS.high;
    if (!tube) {
      this.boostPulse *= quality.flashDecay;
      this.flashLevel *= quality.flashDecay;
      this.rippleLevel *= quality.rippleDecay;
      return;
    }

    const offsetMagnitude = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);
    const speedDelta = Math.max(0, tube.speed - this.prevSpeed);
    const curveDelta = Math.abs((tube.curveStrength || 0) - this.prevCurveStrength);
    const offsetDelta = Math.abs(offsetMagnitude - this.prevOffsetMagnitude);
    const spinImpulse = fx?.spinComboRingActive ? 0.18 : 0;
    const alertImpulse = fx?.perfectSpinWindow ? 0.1 : 0;

    this.boostPulse = Math.max(
      boostPulseFromSpeed(tube.speed),
      this.boostPulse * quality.flashDecay + speedDelta * 8 + spinImpulse
    );
    this.flashLevel = clamp(this.flashLevel * quality.flashDecay + curveDelta * 3.8 + alertImpulse, 0, 1.1);
    this.rippleLevel = clamp(this.rippleLevel * quality.rippleDecay + offsetDelta / 18 + curveDelta * 1.2, 0, 1.15);

    this.prevSpeed = tube.speed;
    this.prevCurveStrength = tube.curveStrength || 0;
    this.prevOffsetMagnitude = offsetMagnitude;
  }

  drawTunnel() {
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;
    const fx = snapshot?.fx;
    const player = snapshot?.player;

    this.baseGraphics.clear();
    this.lightGraphics.clear();
    this.fogGraphics.clear();
    this.flashGraphics.clear();

    if (!viewport || !tube) {
      return;
    }

    const width = viewport.width || this.scene.scale.width;
    const height = viewport.height || this.scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const qualityName = tube.quality || 'high';
    const quality = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.high;
    const segmentCount = CONFIG.TUBE_SEGMENTS;
    const maxDepth = CONFIG.TUBE_DEPTH_STEPS;
    const boostRatio = clamp((tube.speed - CONFIG.SPEED_START) / Math.max(0.0001, CONFIG.SPEED_MAX - CONFIG.SPEED_START), 0, 1.6);
    const effectTint = player?.shield ? 0.18 : 0;
    const magnetTint = player?.magnetActive ? 0.14 : 0;
    const scoreTint = (fx?.x2Timer || 0) > 0 ? 0.11 : 0;
    const colorBoost = boostRatio * 0.34 + effectTint + magnetTint + scoreTint;
    const shadowAngle = Math.atan2(-(tube.centerOffsetX || 0), -(tube.centerOffsetY || 0));
    const shadowMagnitude = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);
    const effectiveCenterX = centerX + (tube.centerOffsetX || 0);
    const effectiveCenterY = centerY + (tube.centerOffsetY || 0);
    const depthFogStrength = clamp(0.18 + boostRatio * 0.18 + this.boostPulse * 0.08, 0.12, 0.45);
    const tintColor = player?.shield
      ? 0x5cecff
      : player?.magnetActive
        ? 0x71ffba
        : (fx?.x2Timer || 0) > 0
          ? 0xff76e3
          : 0x48c9ff;

    for (let depth = maxDepth - 1; depth >= 0; depth -= quality.depthStep) {
      const z1 = depth * CONFIG.TUBE_Z_STEP;
      const z2 = (depth + quality.depthStep) * CONFIG.TUBE_Z_STEP;
      const scale1 = 1 - z1;
      const scale2 = 1 - z2;
      if (scale2 <= 0) {
        continue;
      }

      const innerRadius = CONFIG.TUBE_RADIUS * INNER_RADIUS_RATIO;
      const radius1 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale1);
      const radius2 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale2);
      const bend1 = 1 - scale1;
      const bend2 = 1 - scale2;
      const glowAlpha = clamp((boostRatio + Math.abs(tube.waveMod || 0) * 0.8 + this.boostPulse * 0.4) * (1 - depth / (maxDepth * 0.76)), 0, quality.glowAlpha);
      const fogAlpha = clamp(depthFogStrength * (1 - depth / maxDepth), 0.05, depthFogStrength);

      for (let i = 0; i < segmentCount; i += quality.segmentStep) {
        const boundaryA = (i / segmentCount) * Math.PI * 2 + tube.rotation + tube.curveAngle;
        const boundaryB = (((i + quality.segmentStep) % segmentCount) / segmentCount) * Math.PI * 2 + tube.rotation + tube.curveAngle;
        const segmentMid = ((i + quality.segmentStep * 0.5) / segmentCount) * Math.PI * 2 + tube.rotation;

        const x1 = centerX + Math.sin(boundaryA) * radius1 + (tube.centerOffsetX || 0) * bend1;
        const y1 = centerY + Math.cos(boundaryA) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
        const x2 = centerX + Math.sin(boundaryB) * radius1 + (tube.centerOffsetX || 0) * bend1;
        const y2 = centerY + Math.cos(boundaryB) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
        const x3 = centerX + Math.sin(boundaryB) * radius2 + (tube.centerOffsetX || 0) * bend2;
        const y3 = centerY + Math.cos(boundaryB) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;
        const x4 = centerX + Math.sin(boundaryA) * radius2 + (tube.centerOffsetX || 0) * bend2;
        const y4 = centerY + Math.cos(boundaryA) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;

        const shadowDiff = Math.abs(normalizeAngleDiff(segmentMid - shadowAngle));
        const shadowFactor = shadowMagnitude > 0 ? clamp(1 - shadowDiff / (Math.PI * 1.2), 0, 1) : 0;
        const shadowAlpha = clamp((shadowMagnitude / 110) * shadowFactor * (1 + depth / maxDepth), 0, 0.45);
        let fillColor = getSegmentColor(segmentMid, i, colorBoost);
        if (player?.shield) fillColor = blendColor(fillColor, 0x86f4ff, 0.22);
        if (player?.magnetActive) fillColor = blendColor(fillColor, 0x7dffb3, 0.16);
        if ((fx?.x2Timer || 0) > 0) fillColor = blendColor(fillColor, 0xff78f0, 0.18);

        this.baseGraphics.fillStyle(fillColor, 1);
        this.baseGraphics.beginPath();
        this.baseGraphics.moveTo(x1, y1);
        this.baseGraphics.lineTo(x2, y2);
        this.baseGraphics.lineTo(x3, y3);
        this.baseGraphics.lineTo(x4, y4);
        this.baseGraphics.closePath();
        this.baseGraphics.fillPath();

        if (qualityName !== 'low') {
          this.baseGraphics.lineStyle(1, blendColor(0xf8d3e4, tintColor, 0.18), clamp(0.16 * (1 - depth / maxDepth), 0.05, quality.rimAlpha));
          this.baseGraphics.strokePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }, { x: x4, y: y4 }], true);
        }

        if (shadowAlpha > 0.02) {
          this.baseGraphics.fillStyle(0x000000, shadowAlpha);
          this.baseGraphics.beginPath();
          this.baseGraphics.moveTo(x1, y1);
          this.baseGraphics.lineTo(x2, y2);
          this.baseGraphics.lineTo(x3, y3);
          this.baseGraphics.lineTo(x4, y4);
          this.baseGraphics.closePath();
          this.baseGraphics.fillPath();
        }

        const stripGate = (i + Math.floor(depth * 0.7)) % quality.stripModulo === 0;
        if (stripGate && glowAlpha > 0.02) {
          this.lightGraphics.lineStyle(qualityName === 'high' ? 3 : 2, tintColor, glowAlpha);
          this.lightGraphics.beginPath();
          this.lightGraphics.moveTo(lerp(x1, x4, 0.18), lerp(y1, y4, 0.18));
          this.lightGraphics.lineTo(lerp(x2, x3, 0.18), lerp(y2, y3, 0.18));
          this.lightGraphics.strokePath();

          this.lightGraphics.fillStyle(blendColor(tintColor, 0xffffff, 0.35), glowAlpha * 0.4);
          this.lightGraphics.fillCircle(lerp(x1, x2, 0.5), lerp(y1, y2, 0.5), qualityName === 'high' ? 2.4 : 1.6);
        }

        if (qualityName !== 'low' && glowAlpha > 0.015) {
          this.lightGraphics.lineStyle(1.1, blendColor(0x74f9ff, tintColor, 0.35), glowAlpha * 0.9);
          this.lightGraphics.strokePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }, { x: x4, y: y4 }], true);
        }

        if (qualityName === 'high') {
          this.fogGraphics.fillStyle(blendColor(0x120816, tintColor, 0.15), fogAlpha * 0.4);
          this.fogGraphics.beginPath();
          this.fogGraphics.moveTo(x1, y1);
          this.fogGraphics.lineTo(x2, y2);
          this.fogGraphics.lineTo(x3, y3);
          this.fogGraphics.lineTo(x4, y4);
          this.fogGraphics.closePath();
          this.fogGraphics.fillPath();
        }
      }
    }

    for (let i = 0; i < quality.fogLayers; i += 1) {
      const t = i / Math.max(1, quality.fogLayers - 1);
      const radius = CONFIG.TUBE_RADIUS * lerp(0.24, 0.9, t);
      this.fogGraphics.lineStyle(qualityName === 'low' ? 1 : 2, blendColor(0x1b0d27, tintColor, 0.12 + t * 0.1), 0.05 + t * 0.06);
      this.fogGraphics.strokeEllipse(effectiveCenterX, effectiveCenterY, radius * 2, radius * 2 * CONFIG.PLAYER_OFFSET);
    }

    const centerGlowRadius = CONFIG.TUBE_RADIUS * (0.12 + clamp(boostRatio * 0.05 + this.boostPulse * 0.04, 0, 0.1));
    this.lightGraphics.fillStyle(player?.shield ? 0x7ef5ff : 0x1c1230, player?.shield ? 0.78 : 0.92);
    this.lightGraphics.fillCircle(effectiveCenterX, effectiveCenterY, centerGlowRadius);
    this.lightGraphics.lineStyle(qualityName === 'low' ? 1 : 2, blendColor(0x6b4a7d, tintColor, 0.5), qualityName === 'low' ? 0.34 : 0.52);
    this.lightGraphics.strokeCircle(effectiveCenterX, effectiveCenterY, CONFIG.TUBE_RADIUS * 0.16);

    const haloRadius = CONFIG.TUBE_RADIUS * (1.01 + this.boostPulse * 0.04);
    this.flashGraphics.lineStyle(qualityName === 'low' ? 2 : 4, tintColor, quality.haloAlpha + this.boostPulse * quality.pulseAlpha);
    this.flashGraphics.strokeEllipse(effectiveCenterX, effectiveCenterY, haloRadius * 2, haloRadius * 2 * CONFIG.PLAYER_OFFSET);

    if (this.flashLevel > 0.03) {
      this.flashGraphics.fillStyle(blendColor(0xff5aa9, tintColor, 0.2), clamp(this.flashLevel * 0.18, 0.03, 0.2));
      this.flashGraphics.fillEllipse(effectiveCenterX, effectiveCenterY, CONFIG.TUBE_RADIUS * 2.2, CONFIG.TUBE_RADIUS * 2.2 * CONFIG.PLAYER_OFFSET);
    }

    if (this.rippleLevel > 0.04) {
      const rippleRadius = CONFIG.TUBE_RADIUS * (0.36 + this.rippleLevel * 0.75);
      this.flashGraphics.lineStyle(qualityName === 'low' ? 1 : 2, blendColor(0xffffff, tintColor, 0.45), clamp(this.rippleLevel * 0.26, 0.04, 0.3));
      this.flashGraphics.strokeEllipse(effectiveCenterX, effectiveCenterY, rippleRadius * 2, rippleRadius * 2 * CONFIG.PLAYER_OFFSET);
    }
  }

  drawOverlay() {
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;
    const player = snapshot?.player;
    const fx = snapshot?.fx;

    this.fxGraphics.clear();
    if (!viewport || !tube) {
      this.debugText?.setText('Awaiting snapshot');
      return;
    }

    const width = viewport.width || this.scene.scale.width;
    const height = viewport.height || this.scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const effectiveCenterX = centerX + (tube.centerOffsetX || 0);
    const effectiveCenterY = centerY + (tube.centerOffsetY || 0);
    const qualityName = tube.quality || 'high';
    const quality = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.high;
    const forwardRatio = clamp((tube.speed - CONFIG.SPEED_START) / Math.max(0.0001, BOOST_THRESHOLD - CONFIG.SPEED_START), 0, 1.3);
    const lineCount = Math.round(quality.lineCount + forwardRatio * quality.lineCount * 0.8);
    const tintColor = player?.shield
      ? 0x76efff
      : player?.magnetActive
        ? 0x78ffbd
        : (fx?.x2Timer || 0) > 0
          ? 0xff89ea
          : 0xfff0cc;

    if (forwardRatio > 0.04) {
      this.fxGraphics.lineStyle(1 + forwardRatio * (qualityName === 'high' ? 2.4 : 1.6), tintColor, 0.15 + forwardRatio * 0.28);
      for (let i = 0; i < lineCount; i += 1) {
        const angle = (Math.PI * 2 * i) / lineCount + tube.rotation * 0.45 + tube.scroll * 0.005;
        const startRadius = CONFIG.TUBE_RADIUS * (0.11 + (i % 5) * 0.05);
        const length = 48 + forwardRatio * (qualityName === 'high' ? 148 : 92) + this.boostPulse * 28;
        const endRadius = startRadius + length;
        this.fxGraphics.beginPath();
        this.fxGraphics.moveTo(
          effectiveCenterX + Math.cos(angle) * startRadius,
          effectiveCenterY + Math.sin(angle) * startRadius * CONFIG.PLAYER_OFFSET
        );
        this.fxGraphics.lineTo(
          effectiveCenterX + Math.cos(angle) * endRadius,
          effectiveCenterY + Math.sin(angle) * endRadius * CONFIG.PLAYER_OFFSET
        );
        this.fxGraphics.strokePath();
      }
    }

    this.fxGraphics.lineStyle(qualityName === 'low' ? 1 : 2, blendColor(0xff7bf1, tintColor, 0.45), 0.78);
    this.fxGraphics.strokeCircle(effectiveCenterX, effectiveCenterY, 5);
    this.fxGraphics.lineStyle(1, blendColor(0x7dd3fc, tintColor, 0.28), 0.45);
    this.fxGraphics.strokeEllipse(centerX, centerY, CONFIG.TUBE_RADIUS * 2, CONFIG.TUBE_RADIUS * 2 * CONFIG.PLAYER_OFFSET);

    this.debugText?.setText([
      'Phaser Tunnel Debug',
      `rotation: ${tube.rotation.toFixed(3)}`,
      `scroll: ${tube.scroll.toFixed(2)}`,
      `curve: ${tube.curveAngle.toFixed(3)} / ${tube.curveStrength.toFixed(3)}`,
      `center: ${Math.round(tube.centerOffsetX || 0)}, ${Math.round(tube.centerOffsetY || 0)}`,
      `speed: ${tube.speed.toFixed(4)} (${tube.quality})`,
      `fx: pulse ${this.boostPulse.toFixed(2)} flash ${this.flashLevel.toFixed(2)} ripple ${this.rippleLevel.toFixed(2)}`
    ]);
  }
}

function boostPulseFromSpeed(speed) {
  return clamp((speed - BOOST_THRESHOLD) / Math.max(0.0001, CONFIG.SPEED_MAX - BOOST_THRESHOLD), 0, 1);
}

export { TunnelRenderer };
