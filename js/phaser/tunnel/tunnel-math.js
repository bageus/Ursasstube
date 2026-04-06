function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
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

function lerpPoint(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
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

function hashNoise(seed) {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export {
  blendColor,
  clamp,
  drawQuadPath,
  fillQuad,
  getQuadBand,
  hashNoise,
  lerp,
  lerpAngle,
  normalizeAngleDiff,
};
