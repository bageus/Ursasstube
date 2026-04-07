const PLAYER_SCARF_SEGMENTS = 8;
const PLAYER_SCARF_SEGMENT_LENGTH = 10;
const PLAYER_SCARF_GRAVITY = 24;
const PLAYER_SCARF_DRAG = 0.985;
const PLAYER_SCARF_FOLLOW_STRENGTH = 0.38;

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function initPlayerScarf(renderer) {
  renderer.playerScarfPoints = [];
  renderer.playerScarfAnchor = { x: 0, y: 0 };

  for (let index = 0; index < PLAYER_SCARF_SEGMENTS; index += 1) {
    const px = -index * PLAYER_SCARF_SEGMENT_LENGTH;
    const py = -index * 1.2;
    renderer.playerScarfPoints.push({
      pos: { x: px, y: py },
      prev: { x: px - 1, y: py },
    });
  }
}

function renderPlayerScarf(renderer, player, projection, frameMs60Fps) {
  if (!renderer.playerScarfGraphics || renderer.playerScarfPoints.length === 0) return;

  const now = (renderer.scene.time?.now || 0) * 0.001;
  const sway = Math.sin(now * 1.35) * 2.2;
  const breath = Math.sin(now * 2.1) * 1.2;
  const frameDtMs = Number(renderer.scene.game?.loop?.delta) || frameMs60Fps;
  const dt = Math.min(frameDtMs / 1000, 0.033);

  renderer.playerScarfAnchor.x = projection.x - 16 + Math.sin(now * 1.2) * 0.8;
  renderer.playerScarfAnchor.y = projection.y - 25 + Math.cos(now * 2.1) * 0.8;

  simulatePlayerScarf(renderer, dt, now, sway, breath, player);
  drawPlayerScarf(renderer);
}

function simulatePlayerScarf(renderer, dt, timeSeconds, sway, breath, player) {
  const speedBoost = player?.speedBoost ? 6 : 0;
  const wind = 8 + Math.sin(timeSeconds * 0.9) * 3 + Math.sin(timeSeconds * 2.6) * 2 + speedBoost;

  renderer.playerScarfPoints[0].pos.x = renderer.playerScarfAnchor.x;
  renderer.playerScarfPoints[0].pos.y = renderer.playerScarfAnchor.y;
  renderer.playerScarfPoints[0].prev.x = renderer.playerScarfAnchor.x;
  renderer.playerScarfPoints[0].prev.y = renderer.playerScarfAnchor.y;

  for (let index = 1; index < renderer.playerScarfPoints.length; index += 1) {
    const point = renderer.playerScarfPoints[index];
    const velX = (point.pos.x - point.prev.x) * PLAYER_SCARF_DRAG;
    const velY = (point.pos.y - point.prev.y) * PLAYER_SCARF_DRAG;
    point.prev.x = point.pos.x;
    point.prev.y = point.pos.y;

    const flutter = Math.sin(timeSeconds * 9 + index * 0.7) * (1.5 + index * 0.15);
    const swayTransfer = sway * (0.1 + index * 0.025);
    const breathTransfer = Math.sin(timeSeconds * 4 + index) * 0.2 + breath * 0.03;

    point.pos.x += velX - wind * dt - swayTransfer + flutter * dt * 7;
    point.pos.y += velY + PLAYER_SCARF_GRAVITY * dt + breathTransfer;
    point.pos.x = lerp(
      point.pos.x,
      renderer.playerScarfAnchor.x - index * PLAYER_SCARF_SEGMENT_LENGTH,
      PLAYER_SCARF_FOLLOW_STRENGTH * dt * 60
    );
  }

  for (let pass = 0; pass < 4; pass += 1) {
    renderer.playerScarfPoints[0].pos.x = renderer.playerScarfAnchor.x;
    renderer.playerScarfPoints[0].pos.y = renderer.playerScarfAnchor.y;

    for (let index = 1; index < renderer.playerScarfPoints.length; index += 1) {
      const a = renderer.playerScarfPoints[index - 1].pos;
      const b = renderer.playerScarfPoints[index].pos;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.0001);
      const diff = (dist - PLAYER_SCARF_SEGMENT_LENGTH) / dist;

      if (index === 1) {
        b.x -= dx * diff;
        b.y -= dy * diff;
        continue;
      }

      b.x -= dx * diff * 0.5;
      b.y -= dy * diff * 0.5;
      a.x += dx * diff * 0.5;
      a.y += dy * diff * 0.5;
    }
  }
}

function drawPlayerScarf(renderer) {
  const graphics = renderer.playerScarfGraphics;
  graphics.clear();

  graphics.fillStyle(0xb81414, 1);
  graphics.fillEllipse(renderer.playerScarfAnchor.x + 2, renderer.playerScarfAnchor.y + 1, 24, 14);
  graphics.fillStyle(0xe12626, 1);
  graphics.fillEllipse(renderer.playerScarfAnchor.x - 1, renderer.playerScarfAnchor.y - 2, 20, 10);

  for (let index = 0; index < renderer.playerScarfPoints.length - 1; index += 1) {
    const current = renderer.playerScarfPoints[index].pos;
    const next = renderer.playerScarfPoints[index + 1].pos;
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const len = Math.max(Math.hypot(dx, dy), 0.0001);
    const nx = -dy / len;
    const ny = dx / len;

    const widthA = lerp(10, 5, index / (renderer.playerScarfPoints.length - 1));
    const widthB = lerp(10, 5, (index + 1) / (renderer.playerScarfPoints.length - 1));

    const ax1 = current.x + nx * widthA * 0.5;
    const ay1 = current.y + ny * widthA * 0.5;
    const ax2 = current.x - nx * widthA * 0.5;
    const ay2 = current.y - ny * widthA * 0.5;
    const bx1 = next.x + nx * widthB * 0.5;
    const by1 = next.y + ny * widthB * 0.5;
    const bx2 = next.x - nx * widthB * 0.5;
    const by2 = next.y - ny * widthB * 0.5;

    graphics.fillStyle(0xc81616, 1);
    graphics.beginPath();
    graphics.moveTo(ax1, ay1);
    graphics.lineTo(bx1, by1);
    graphics.lineTo(bx2, by2);
    graphics.lineTo(ax2, ay2);
    graphics.closePath();
    graphics.fillPath();

    const hx1 = lerp(ax1, ax2, 0.22);
    const hy1 = lerp(ay1, ay2, 0.22);
    const hx2 = lerp(bx1, bx2, 0.22);
    const hy2 = lerp(by1, by2, 0.22);
    const hx3 = lerp(bx1, bx2, 0.42);
    const hy3 = lerp(by1, by2, 0.42);
    const hx4 = lerp(ax1, ax2, 0.42);
    const hy4 = lerp(ay1, ay2, 0.42);

    graphics.fillStyle(0xff3b30, 0.35);
    graphics.beginPath();
    graphics.moveTo(hx1, hy1);
    graphics.lineTo(hx2, hy2);
    graphics.lineTo(hx3, hy3);
    graphics.lineTo(hx4, hy4);
    graphics.closePath();
    graphics.fillPath();
  }

  const tip = renderer.playerScarfPoints[renderer.playerScarfPoints.length - 1].pos;
  const prev = renderer.playerScarfPoints[renderer.playerScarfPoints.length - 2].pos;
  const tipDx = tip.x - prev.x;
  const tipDy = tip.y - prev.y;
  const tipLen = Math.max(Math.hypot(tipDx, tipDy), 0.0001);
  const tipNx = -tipDy / tipLen;
  const tipNy = tipDx / tipLen;

  graphics.fillStyle(0xc81616, 1);
  graphics.beginPath();
  graphics.moveTo(tip.x + tipNx * 2, tip.y + tipNy * 2);
  graphics.lineTo(tip.x - tipNx * 4 - tipDx * 0.35, tip.y - tipNy * 4 - tipDy * 0.35);
  graphics.lineTo(tip.x - tipNx * 2, tip.y - tipNy * 2);
  graphics.closePath();
  graphics.fillPath();
}

export { initPlayerScarf, renderPlayerScarf };
