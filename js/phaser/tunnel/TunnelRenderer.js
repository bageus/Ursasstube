import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
const BOOST_THRESHOLD = CONFIG.SPEED_START * 1.35;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
}

function rgbToInt(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function getSegmentColor(angle, index, colorBoost) {
  const hue = (angle * 180 / Math.PI + index * 8) % 360;
  const r = clamp(Math.round(140 + Math.sin(hue * Math.PI / 180) * 30 + colorBoost * 32), 0, 255);
  const g = clamp(Math.round(60 + Math.cos(hue * Math.PI / 180) * 20 + colorBoost * 12), 0, 255);
  const b = clamp(Math.round(70 + Math.sin(hue * Math.PI / 360) * 25 + colorBoost * 42), 0, 255);
  return rgbToInt(r, g, b);
}

class TunnelRenderer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = null;
    this.overlayGraphics = null;
    this.debugText = null;
    this.snapshot = null;
  }

  create() {
    this.graphics = this.scene.add.graphics();
    this.overlayGraphics = this.scene.add.graphics();
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
    if (!this.graphics || !this.overlayGraphics) {
      return;
    }

    this.drawTunnel();
    this.drawOverlay();
  }

  resize() {
    this.applySnapshot(this.snapshot);
  }

  destroy() {
    this.graphics?.destroy();
    this.overlayGraphics?.destroy();
    this.debugText?.destroy();
    this.graphics = null;
    this.overlayGraphics = null;
    this.debugText = null;
  }

  drawTunnel() {
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;
    const fx = snapshot?.fx;
    const player = snapshot?.player;

    this.graphics.clear();

    if (!viewport || !tube) {
      return;
    }

    const width = viewport.width || this.scene.scale.width;
    const height = viewport.height || this.scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const quality = tube.quality || 'high';
    const depthStep = quality === 'low' ? 2 : 1;
    const segmentStep = quality === 'low' ? 2 : 1;
    const segmentCount = CONFIG.TUBE_SEGMENTS;
    const maxDepth = CONFIG.TUBE_DEPTH_STEPS;
    const boostRatio = clamp((tube.speed - CONFIG.SPEED_START) / Math.max(0.0001, CONFIG.SPEED_MAX - CONFIG.SPEED_START), 0, 1.6);
    const effectTint = player?.shield ? 0.16 : 0;
    const magnetTint = player?.magnetActive ? 0.12 : 0;
    const scoreTint = (fx?.x2Timer || 0) > 0 ? 0.08 : 0;
    const colorBoost = boostRatio * 0.3 + effectTint + magnetTint + scoreTint;
    const shadowAngle = Math.atan2(-(tube.centerOffsetX || 0), -(tube.centerOffsetY || 0));
    const shadowMagnitude = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);

    for (let depth = maxDepth - 1; depth >= 0; depth -= depthStep) {
      const z1 = depth * CONFIG.TUBE_Z_STEP;
      const z2 = (depth + 1) * CONFIG.TUBE_Z_STEP;
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
      const glowAlpha = clamp((boostRatio + Math.abs(tube.waveMod || 0) * 0.6) * (1 - depth / (maxDepth * 0.72)), 0, 0.32);

      for (let i = 0; i < segmentCount; i += segmentStep) {
        const boundaryA = (i / segmentCount) * Math.PI * 2 + tube.rotation + tube.curveAngle;
        const boundaryB = (((i + segmentStep) % segmentCount) / segmentCount) * Math.PI * 2 + tube.rotation + tube.curveAngle;
        const segmentMid = ((i + segmentStep * 0.5) / segmentCount) * Math.PI * 2 + tube.rotation;

        const x1 = centerX + Math.sin(boundaryA) * radius1 + (tube.centerOffsetX || 0) * bend1;
        const y1 = centerY + Math.cos(boundaryA) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
        const x2 = centerX + Math.sin(boundaryB) * radius1 + (tube.centerOffsetX || 0) * bend1;
        const y2 = centerY + Math.cos(boundaryB) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
        const x3 = centerX + Math.sin(boundaryB) * radius2 + (tube.centerOffsetX || 0) * bend2;
        const y3 = centerY + Math.cos(boundaryB) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;
        const x4 = centerX + Math.sin(boundaryA) * radius2 + (tube.centerOffsetX || 0) * bend2;
        const y4 = centerY + Math.cos(boundaryA) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;

        const shadowDiff = Math.abs(normalizeAngleDiff(segmentMid - shadowAngle));
        const shadowFactor = shadowMagnitude > 0 ? clamp(1 - shadowDiff / (Math.PI * 2), 0, 1) : 0;
        const shadowAlpha = clamp((shadowMagnitude / 120) * shadowFactor * (1 + depth / maxDepth), 0, 0.38);
        const fillColor = getSegmentColor(segmentMid, i, colorBoost);

        this.graphics.fillStyle(fillColor, 1);
        this.graphics.beginPath();
        this.graphics.moveTo(x1, y1);
        this.graphics.lineTo(x2, y2);
        this.graphics.lineTo(x3, y3);
        this.graphics.lineTo(x4, y4);
        this.graphics.closePath();
        this.graphics.fillPath();

        if (quality !== 'low') {
          this.graphics.lineStyle(1, 0xf8d3e4, clamp(0.16 * (1 - depth / maxDepth), 0.04, 0.16));
          this.graphics.strokePoints([
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            { x: x3, y: y3 },
            { x: x4, y: y4 }
          ], true);
        }

        if (shadowAlpha > 0.02) {
          this.graphics.fillStyle(0x000000, shadowAlpha);
          this.graphics.beginPath();
          this.graphics.moveTo(x1, y1);
          this.graphics.lineTo(x2, y2);
          this.graphics.lineTo(x3, y3);
          this.graphics.lineTo(x4, y4);
          this.graphics.closePath();
          this.graphics.fillPath();
        }

        if (glowAlpha > 0.02 && quality !== 'low') {
          this.graphics.lineStyle(1.1, 0x74f9ff, glowAlpha);
          this.graphics.strokePoints([
            { x: x1, y: y1 },
            { x: x2, y: y2 },
            { x: x3, y: y3 },
            { x: x4, y: y4 }
          ], true);
        }
      }
    }

    const innerGlowRadius = CONFIG.TUBE_RADIUS * (0.12 + clamp(boostRatio * 0.06, 0, 0.08));
    this.graphics.fillStyle(player?.shield ? 0x8cf6ff : 0x1c1230, player?.shield ? 0.72 : 0.88);
    this.graphics.fillCircle(centerX + (tube.centerOffsetX || 0), centerY + (tube.centerOffsetY || 0), innerGlowRadius);
    this.graphics.lineStyle(quality === 'low' ? 0 : 2, player?.magnetActive ? 0x7dffb3 : 0x6b4a7d, quality === 'low' ? 0 : 0.45);
    if (quality !== 'low') {
      this.graphics.strokeCircle(centerX + (tube.centerOffsetX || 0), centerY + (tube.centerOffsetY || 0), CONFIG.TUBE_RADIUS * 0.16);
    }
  }

  drawOverlay() {
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;

    this.overlayGraphics.clear();
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
    const forwardRatio = clamp((tube.speed - CONFIG.SPEED_START) / Math.max(0.0001, BOOST_THRESHOLD - CONFIG.SPEED_START), 0, 1.3);
    const lineCount = Math.round(10 + forwardRatio * 18);

    if (forwardRatio > 0.05) {
      this.overlayGraphics.lineStyle(1 + forwardRatio * 1.8, 0xfff0cc, 0.18 + forwardRatio * 0.24);
      for (let i = 0; i < lineCount; i += 1) {
        const angle = (Math.PI * 2 * i) / lineCount + tube.rotation * 0.45 + tube.scroll * 0.005;
        const startRadius = CONFIG.TUBE_RADIUS * (0.11 + (i % 5) * 0.05);
        const length = 46 + forwardRatio * 120;
        const endRadius = startRadius + length;
        this.overlayGraphics.beginPath();
        this.overlayGraphics.moveTo(
          effectiveCenterX + Math.cos(angle) * startRadius,
          effectiveCenterY + Math.sin(angle) * startRadius * CONFIG.PLAYER_OFFSET
        );
        this.overlayGraphics.lineTo(
          effectiveCenterX + Math.cos(angle) * endRadius,
          effectiveCenterY + Math.sin(angle) * endRadius * CONFIG.PLAYER_OFFSET
        );
        this.overlayGraphics.strokePath();
      }
    }

    this.overlayGraphics.lineStyle(2, 0xff7bf1, 0.75);
    this.overlayGraphics.strokeCircle(effectiveCenterX, effectiveCenterY, 5);
    this.overlayGraphics.lineStyle(1, 0x7dd3fc, 0.55);
    this.overlayGraphics.strokeEllipse(centerX, centerY, CONFIG.TUBE_RADIUS * 2, CONFIG.TUBE_RADIUS * 2 * CONFIG.PLAYER_OFFSET);

    this.debugText?.setText([
      'Phaser Tunnel Debug',
      `rotation: ${tube.rotation.toFixed(3)}`,
      `scroll: ${tube.scroll.toFixed(2)}`,
      `curve: ${tube.curveAngle.toFixed(3)} / ${tube.curveStrength.toFixed(3)}`,
      `center: ${Math.round(tube.centerOffsetX || 0)}, ${Math.round(tube.centerOffsetY || 0)}`,
      `speed: ${tube.speed.toFixed(4)} (${tube.quality})`
    ]);
  }
}

export { TunnelRenderer };
