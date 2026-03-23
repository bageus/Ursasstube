import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
const BOOST_THRESHOLD = CONFIG.SPEED_START * 1.35;
const LIGHT_INTERVAL_METERS = 30;
const LIGHT_REACH_METERS = 9;
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
  const r = clamp(Math.round(110 + Math.sin(hue * Math.PI / 180) * 16 + colorBoost * 26), 0, 255);
  const g = clamp(Math.round(36 + Math.cos(hue * Math.PI / 180) * 10 + colorBoost * 12), 0, 255);
  const b = clamp(Math.round(84 + Math.sin(hue * Math.PI / 360) * 34 + colorBoost * 48), 0, 255);
  return rgbToInt(r, g, b);
}

function getLaneBandFactor(angle) {
  const wrapped = Math.cos(angle * 10);
  return wrapped > 0 ? Math.pow(wrapped, 2) : 0;
}

function getLampProximity(distance) {
  const wrapped = ((distance % LIGHT_INTERVAL_METERS) + LIGHT_INTERVAL_METERS) % LIGHT_INTERVAL_METERS;
  const nearest = Math.min(wrapped, LIGHT_INTERVAL_METERS - wrapped);
  return clamp(1 - nearest / LIGHT_REACH_METERS, 0, 1);
}

function boostPulseFromSpeed(speed) {
  return clamp((speed - BOOST_THRESHOLD) / Math.max(0.0001, CONFIG.SPEED_MAX - BOOST_THRESHOLD), 0, 1);
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

  drawStructuralRing(centerX, centerY, tintColor, qualityName, boostRatio, player, fx) {
    const panelCount = qualityName === 'low' ? 10 : 16;
    const outerRadius = CONFIG.TUBE_RADIUS * 1.135;
    const midRadius = CONFIG.TUBE_RADIUS * 1.04;
    const innerRadius = CONFIG.TUBE_RADIUS * 0.935;
    const ringGlow = clamp(0.16 + boostRatio * 0.14 + this.boostPulse * 0.18, 0.14, 0.48);
    const frameColor = blendColor(0x211629, tintColor, player?.shield ? 0.4 : 0.24);

    this.baseGraphics.lineStyle(qualityName === 'low' ? 2 : 5, 0x05040b, 0.96);
    this.baseGraphics.strokeEllipse(centerX, centerY, outerRadius * 2.08, outerRadius * 2.08 * CONFIG.PLAYER_OFFSET);
    this.baseGraphics.lineStyle(qualityName === 'low' ? 2 : 4, frameColor, 0.92);
    this.baseGraphics.strokeEllipse(centerX, centerY, outerRadius * 2, outerRadius * 2 * CONFIG.PLAYER_OFFSET);
    this.baseGraphics.lineStyle(qualityName === 'low' ? 1 : 3, blendColor(frameColor, 0xb9c6ff, 0.32), 0.72);
    this.baseGraphics.strokeEllipse(centerX, centerY, midRadius * 2, midRadius * 2 * CONFIG.PLAYER_OFFSET);
    this.baseGraphics.lineStyle(qualityName === 'low' ? 1 : 2, blendColor(0x26192f, 0xffffff, 0.24), 0.52);
    this.baseGraphics.strokeEllipse(centerX, centerY, innerRadius * 2, innerRadius * 2 * CONFIG.PLAYER_OFFSET);

    for (let i = 0; i < panelCount; i += 1) {
      const angle = (Math.PI * 2 * i) / panelCount + this.snapshot.tube.rotation * 0.12;
      const panelArc = (Math.PI * 2 / panelCount) * 0.42;
      const a1 = angle - panelArc * 0.5;
      const a2 = angle + panelArc * 0.5;
      const p1x = centerX + Math.cos(a1) * outerRadius;
      const p1y = centerY + Math.sin(a1) * outerRadius * CONFIG.PLAYER_OFFSET;
      const p2x = centerX + Math.cos(a2) * outerRadius;
      const p2y = centerY + Math.sin(a2) * outerRadius * CONFIG.PLAYER_OFFSET;
      const p3x = centerX + Math.cos(a2) * innerRadius;
      const p3y = centerY + Math.sin(a2) * innerRadius * CONFIG.PLAYER_OFFSET;
      const p4x = centerX + Math.cos(a1) * innerRadius;
      const p4y = centerY + Math.sin(a1) * innerRadius * CONFIG.PLAYER_OFFSET;
      const panelColor = i % 2 === 0 ? blendColor(0x5cf2ff, tintColor, 0.5) : blendColor(0x5c68ff, tintColor, 0.24);
      const panelAlpha = i % 4 === 0 ? ringGlow : ringGlow * 0.46;

      this.baseGraphics.fillStyle(blendColor(0x16101e, panelColor, 0.18), 0.92);
      this.baseGraphics.beginPath();
      this.baseGraphics.moveTo(p1x, p1y);
      this.baseGraphics.lineTo(p2x, p2y);
      this.baseGraphics.lineTo(p3x, p3y);
      this.baseGraphics.lineTo(p4x, p4y);
      this.baseGraphics.closePath();
      this.baseGraphics.fillPath();

      this.lightGraphics.lineStyle(qualityName === 'high' ? 5 : 3, panelColor, panelAlpha);
      this.lightGraphics.beginPath();
      this.lightGraphics.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius * CONFIG.PLAYER_OFFSET);
      this.lightGraphics.lineTo(centerX + Math.cos(angle) * midRadius, centerY + Math.sin(angle) * midRadius * CONFIG.PLAYER_OFFSET);
      this.lightGraphics.strokePath();
    }

    const rimColor = blendColor(0x8fd5ff, tintColor, 0.4 + ((fx?.x2Timer || 0) > 0 ? 0.08 : 0));
    this.lightGraphics.lineStyle(qualityName === 'low' ? 2 : 6, rimColor, 0.24 + this.boostPulse * 0.2);
    this.lightGraphics.strokeEllipse(centerX, centerY, innerRadius * 2.01, innerRadius * 2.01 * CONFIG.PLAYER_OFFSET);
    this.lightGraphics.lineStyle(qualityName === 'low' ? 1 : 3, blendColor(rimColor, 0xffffff, 0.38), 0.16 + this.boostPulse * 0.12);
    this.lightGraphics.strokeEllipse(centerX, centerY, innerRadius * 1.96, innerRadius * 1.96 * CONFIG.PLAYER_OFFSET);
  }

  drawInteriorSpokes(centerX, centerY, tintColor, qualityName, boostRatio) {
    const spokeCount = qualityName === 'low' ? 14 : qualityName === 'medium' ? 22 : 30;
    const maxRadius = CONFIG.TUBE_RADIUS * 0.92;
    const spokeAlpha = clamp(0.12 + boostRatio * 0.16 + this.flashLevel * 0.12, 0.1, 0.34);
    const spokeColor = blendColor(0x7d1e44, tintColor, 0.12);

    this.fogGraphics.lineStyle(qualityName === 'high' ? 2 : 1, spokeColor, spokeAlpha);
    for (let i = 0; i < spokeCount; i += 1) {
      const angle = (Math.PI * 2 * i) / spokeCount - this.snapshot.tube.rotation * 0.24;
      const startRadius = CONFIG.TUBE_RADIUS * 0.12;
      const endRadius = maxRadius * (0.68 + (i % 5) * 0.05);
      this.fogGraphics.beginPath();
      this.fogGraphics.moveTo(centerX + Math.cos(angle) * startRadius, centerY + Math.sin(angle) * startRadius * CONFIG.PLAYER_OFFSET);
      this.fogGraphics.lineTo(centerX + Math.cos(angle) * endRadius, centerY + Math.sin(angle) * endRadius * CONFIG.PLAYER_OFFSET);
      this.fogGraphics.strokePath();
    }
  }

  drawLampGlow(centerX, centerY, tube, tintColor, qualityName) {
    const distance = this.snapshot?.runtime?.distance || 0;
    const lampCycle = getLampProximity(distance);
    if (lampCycle <= 0.001) return;

    const lampCount = qualityName === 'low' ? 3 : 5;
    const lampSpread = Math.PI * 0.28;
    const baseAngle = -Math.PI / 2 + tube.rotation * 0.08;
    const lampColor = blendColor(0x8ce6ff, tintColor, 0.36);
    const radius = CONFIG.TUBE_RADIUS * 0.94;

    for (let i = 0; i < lampCount; i += 1) {
      const t = lampCount === 1 ? 0.5 : i / (lampCount - 1);
      const angle = baseAngle - lampSpread * 0.5 + lampSpread * t;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * CONFIG.PLAYER_OFFSET;
      const width = qualityName === 'high' ? 42 : 32;
      const height = qualityName === 'high' ? 10 : 8;
      const alpha = clamp(0.18 + lampCycle * (0.34 - Math.abs(t - 0.5) * 0.16), 0.16, 0.44);

      this.lightGraphics.fillStyle(blendColor(0xc8f6ff, lampColor, 0.3), alpha);
      this.lightGraphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, 4);
      this.lightGraphics.fillStyle(blendColor(lampColor, 0xffffff, 0.48), alpha * 0.46);
      this.lightGraphics.fillEllipse(x, y + height * 0.9, width * 1.5, height * 2.8);
    }
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
    const colorBoost = boostRatio * 0.3 + effectTint + magnetTint + scoreTint;
    const shadowAngle = Math.atan2(-(tube.centerOffsetX || 0), -(tube.centerOffsetY || 0));
    const shadowMagnitude = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);
    const effectiveCenterX = centerX + (tube.centerOffsetX || 0);
    const effectiveCenterY = centerY + (tube.centerOffsetY || 0);
    const depthFogStrength = clamp(0.16 + boostRatio * 0.18 + this.boostPulse * 0.08, 0.1, 0.42);
    const tintColor = player?.shield
      ? 0x5cecff
      : player?.magnetActive
        ? 0x71ffba
        : (fx?.x2Timer || 0) > 0
          ? 0xff76e3
          : 0x48c9ff;
    const distance = snapshot?.runtime?.distance || 0;

    for (let depth = maxDepth - 1; depth >= 0; depth -= quality.depthStep) {
      const z1 = depth * CONFIG.TUBE_Z_STEP;
      const z2 = (depth + quality.depthStep) * CONFIG.TUBE_Z_STEP;
      const scale1 = 1 - z1;
      const scale2 = 1 - z2;
      if (scale2 <= 0) continue;

      const innerRadius = CONFIG.TUBE_RADIUS * INNER_RADIUS_RATIO;
      const radius1 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale1);
      const radius2 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale2);
      const bend1 = 1 - scale1;
      const bend2 = 1 - scale2;
      const depthRatio = 1 - depth / maxDepth;
      const depthMeters = distance + depth * 1.35;
      const lampFactor = getLampProximity(depthMeters);
      const localBrightness = clamp(0.22 + lampFactor * 0.5 + boostRatio * 0.14, 0.16, 0.9);
      const fogAlpha = clamp(depthFogStrength * depthRatio * (0.8 + lampFactor * 0.55), 0.04, depthFogStrength + 0.08);
      const conveyorPhase = tube.scroll * 0.009 + depth * 0.18;

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
        const shadowFactor = shadowMagnitude > 0 ? clamp(1 - shadowDiff / (Math.PI * 1.16), 0, 1) : 0;
        const shadowAlpha = clamp((shadowMagnitude / 110) * shadowFactor * (0.7 + depthRatio), 0, 0.42);
        const laneBand = getLaneBandFactor(segmentMid - tube.rotation * 0.22);
        const beltMotion = 0.5 + 0.5 * Math.sin(conveyorPhase + i * 0.82);
        const seamPulse = 0.5 + 0.5 * Math.sin(tube.scroll * 0.013 - depth * 0.42 + i * 0.35);
        const edgeHighlight = Math.max(0, Math.cos(segmentMid - Math.PI * 0.5));

        let fillColor = getSegmentColor(segmentMid, i, colorBoost);
        fillColor = blendColor(fillColor, 0x090610, 0.22 + (1 - localBrightness) * 0.22);
        fillColor = blendColor(fillColor, 0xa32048, laneBand * 0.16);
        fillColor = blendColor(fillColor, 0x78dbff, lampFactor * 0.2 + edgeHighlight * 0.08);
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

        const topInset = clamp(0.12 + beltMotion * 0.18, 0.12, 0.34);
        const bottomInset = clamp(0.5 + beltMotion * 0.1, 0.46, 0.68);
        const topLx = lerp(x1, x4, topInset);
        const topLy = lerp(y1, y4, topInset);
        const topRx = lerp(x2, x3, topInset);
        const topRy = lerp(y2, y3, topInset);
        const bottomLx = lerp(x1, x4, bottomInset);
        const bottomLy = lerp(y1, y4, bottomInset);
        const bottomRx = lerp(x2, x3, bottomInset);
        const bottomRy = lerp(y2, y3, bottomInset);
        const panelCoreColor = blendColor(fillColor, 0xffffff, 0.06 + lampFactor * 0.1 + beltMotion * 0.06);

        this.baseGraphics.fillStyle(panelCoreColor, 0.92);
        this.baseGraphics.beginPath();
        this.baseGraphics.moveTo(topLx, topLy);
        this.baseGraphics.lineTo(topRx, topRy);
        this.baseGraphics.lineTo(bottomRx, bottomRy);
        this.baseGraphics.lineTo(bottomLx, bottomLy);
        this.baseGraphics.closePath();
        this.baseGraphics.fillPath();

        if (qualityName !== 'low') {
          this.baseGraphics.lineStyle(1, blendColor(0xfdd2f1, tintColor, 0.16), clamp(0.08 + lampFactor * 0.14 + seamPulse * 0.06, 0.06, quality.rimAlpha));
          this.baseGraphics.strokePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }, { x: x4, y: y4 }], true);
        }

        const seamColor = blendColor(0xb7ecff, tintColor, 0.4);
        const seamAlpha = clamp(0.04 + lampFactor * 0.14 + seamPulse * 0.1, 0.04, 0.26);
        this.lightGraphics.lineStyle(1, seamColor, seamAlpha);
        this.lightGraphics.beginPath();
        this.lightGraphics.moveTo(x1, y1);
        this.lightGraphics.lineTo(x4, y4);
        this.lightGraphics.strokePath();

        if ((i / quality.segmentStep + depth) % 2 === 0) {
          this.lightGraphics.lineStyle(1, blendColor(0xfff0ff, tintColor, 0.28), seamAlpha * 0.7);
          this.lightGraphics.beginPath();
          this.lightGraphics.moveTo(topLx, topLy);
          this.lightGraphics.lineTo(topRx, topRy);
          this.lightGraphics.strokePath();
        }

        const runnerAlpha = clamp(0.02 + beltMotion * 0.1 + boostRatio * 0.08, 0.02, 0.22);
        this.lightGraphics.lineStyle(qualityName === 'high' ? 2 : 1, blendColor(0x6ef1ff, tintColor, 0.36), runnerAlpha);
        this.lightGraphics.beginPath();
        this.lightGraphics.moveTo(lerp(topLx, bottomLx, 0.16), lerp(topLy, bottomLy, 0.16));
        this.lightGraphics.lineTo(lerp(topRx, bottomRx, 0.16), lerp(topRy, bottomRy, 0.16));
        this.lightGraphics.strokePath();

        if (lampFactor > 0.015 && edgeHighlight > 0.15) {
          const edgeGlowAlpha = clamp(lampFactor * edgeHighlight * 0.28 * (depthRatio + 0.2), 0.01, 0.22);
          this.lightGraphics.lineStyle(qualityName === 'high' ? 3 : 2, blendColor(0xa9ecff, tintColor, 0.48), edgeGlowAlpha);
          this.lightGraphics.beginPath();
          this.lightGraphics.moveTo(lerp(x1, x2, 0.22), lerp(y1, y2, 0.22));
          this.lightGraphics.lineTo(lerp(x1, x2, 0.78), lerp(y1, y2, 0.78));
          this.lightGraphics.strokePath();
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

        if (qualityName === 'high') {
          this.fogGraphics.fillStyle(blendColor(0x0f0717, tintColor, 0.14 + lampFactor * 0.08), fogAlpha * 0.42);
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
      this.fogGraphics.lineStyle(qualityName === 'low' ? 1 : 2, blendColor(0x150c22, tintColor, 0.14 + t * 0.12), 0.04 + t * 0.05);
      this.fogGraphics.strokeEllipse(effectiveCenterX, effectiveCenterY, radius * 2, radius * 2 * CONFIG.PLAYER_OFFSET);
    }

    this.drawInteriorSpokes(effectiveCenterX, effectiveCenterY, tintColor, qualityName, boostRatio);
    this.drawStructuralRing(effectiveCenterX, effectiveCenterY, tintColor, qualityName, boostRatio, player, fx);
    this.drawLampGlow(effectiveCenterX, effectiveCenterY, tube, tintColor, qualityName);

    const centerGlowRadius = CONFIG.TUBE_RADIUS * (0.12 + clamp(boostRatio * 0.05 + this.boostPulse * 0.04, 0, 0.1));
    this.lightGraphics.fillStyle(player?.shield ? 0x7ef5ff : 0x09070f, player?.shield ? 0.78 : 0.94);
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
    const lineCount = Math.round(quality.lineCount + forwardRatio * quality.lineCount * 0.9);
    const tintColor = player?.shield
      ? 0x76efff
      : player?.magnetActive
        ? 0x78ffbd
        : (fx?.x2Timer || 0) > 0
          ? 0xff89ea
          : 0xfff0cc;

    if (forwardRatio > 0.04) {
      for (let i = 0; i < lineCount; i += 1) {
        const angle = (Math.PI * 2 * i) / lineCount + tube.rotation * 0.42 + tube.scroll * 0.009;
        const startRadius = CONFIG.TUBE_RADIUS * (0.14 + (i % 4) * 0.055);
        const length = 64 + forwardRatio * (qualityName === 'high' ? 186 : 116) + this.boostPulse * 32;
        const headLead = (tube.scroll * 0.014 + i * 3.7) % length;
        const endRadius = startRadius + headLead;
        const tailRadius = Math.max(startRadius, endRadius - length * (0.28 + forwardRatio * 0.22));
        const alpha = 0.08 + forwardRatio * 0.22;

        this.fxGraphics.lineStyle(1 + forwardRatio * (qualityName === 'high' ? 2.4 : 1.6), tintColor, alpha);
        this.fxGraphics.beginPath();
        this.fxGraphics.moveTo(
          effectiveCenterX + Math.cos(angle) * tailRadius,
          effectiveCenterY + Math.sin(angle) * tailRadius * CONFIG.PLAYER_OFFSET
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

    const lampNow = getLampProximity(snapshot?.runtime?.distance || 0);
    this.debugText?.setText([
      'Phaser Tunnel Debug',
      `rotation: ${tube.rotation.toFixed(3)}`,
      `scroll: ${tube.scroll.toFixed(2)}`,
      `curve: ${tube.curveAngle.toFixed(3)} / ${tube.curveStrength.toFixed(3)}`,
      `center: ${Math.round(tube.centerOffsetX || 0)}, ${Math.round(tube.centerOffsetY || 0)}`,
      `speed: ${tube.speed.toFixed(4)} (${tube.quality})`,
      `lamp: ${lampNow.toFixed(2)} dist ${Math.round(snapshot?.runtime?.distance || 0)}m`,
      `fx: pulse ${this.boostPulse.toFixed(2)} flash ${this.flashLevel.toFixed(2)} ripple ${this.rippleLevel.toFixed(2)}`
    ]);
  }
}

export { TunnelRenderer };
