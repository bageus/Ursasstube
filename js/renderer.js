
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
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;

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
    const rect = DOM.canvas.parentElement.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
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

  if (w === 0 || h === 0) return;

  DOM.canvas.width = Math.round(w * dpr);
  DOM.canvas.height = Math.round(h * dpr);
  DOM.canvas.style.width = w + 'px';
  DOM.canvas.style.height = h + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
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

  const x = DOM.canvas.width / 2 + Math.sin(angle) * tubeRadius;
  const y = DOM.canvas.height / 2 + Math.cos(angle) * tubeRadius * CONFIG.PLAYER_OFFSET;

  if (!isFinite(x) || !isFinite(y)) {
    return { x: DOM.canvas.width / 2, y: DOM.canvas.height / 2, scale: 1, angle: 0 };
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
  const x = DOM.canvas.width / 2 + Math.sin(angle) * r;
  const y = DOM.canvas.height / 2 + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET;

  if (!isFinite(x) || !isFinite(y)) {
    return { x: DOM.canvas.width / 2, y: DOM.canvas.height / 2, scale: 1, angle: 0 };
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

function getSegmentColor(angle, index) {
  const hue = (angle * 180 / Math.PI + index * 8) % 360;
  const r = 140 + Math.sin(hue * Math.PI / 180) * 30;
  const g = 60 + Math.cos(hue * Math.PI / 180) * 20;
  const b = 70 + Math.sin(hue * Math.PI / 180 * 0.5) * 25;
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
}

class TubeRenderer {
  draw() {
    const rotSpeed = Math.min(CONFIG.BASE_ROTATION_SPEED * gameState.speed * 18, CONFIG.MAX_ROTATION_SPEED);
    gameState.tubeRotation += rotSpeed * 0.01;
    gameState.tubeScroll += gameState.speed * 40;

    const centerOffsetX = gameState.centerOffsetX;
    const centerOffsetY = gameState.centerOffsetY;

    for (let d = CONFIG.TUBE_DEPTH_STEPS - 1; d >= 0; d--) {
      const z1 = d * CONFIG.TUBE_Z_STEP;
      const z2 = (d + 1) * CONFIG.TUBE_Z_STEP;
      const scale1 = 1 - z1;
      const scale2 = 1 - z2;

      if (scale2 <= 0) continue;

      const innerR = CONFIG.TUBE_RADIUS * 0.15;
      const r1 = Math.max(innerR, CONFIG.TUBE_RADIUS * scale1);
      const r2 = Math.max(innerR, CONFIG.TUBE_RADIUS * scale2);

      for (let i = 0; i < CONFIG.TUBE_SEGMENTS; i++) {
        const u = i / CONFIG.TUBE_SEGMENTS;
        const uNext = (i + 1) / CONFIG.TUBE_SEGMENTS;

        const baseAngle1 = u * Math.PI * 2 + gameState.tubeRotation;
        const baseAngle2 = uNext * Math.PI * 2 + gameState.tubeRotation;

        const angle1 = baseAngle1 + gameState.tubeCurveAngle;
        const angle2 = baseAngle2 + gameState.tubeCurveAngle;

        const bendInf1 = 1 - scale1;
        const bendInf2 = 1 - scale2;

        const x1 = DOM.canvas.width / 2 + Math.sin(angle1) * r1 + centerOffsetX * bendInf1;
        const y1 = DOM.canvas.height / 2 + Math.cos(angle1) * r1 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf1;
        const x2 = DOM.canvas.width / 2 + Math.sin(angle2) * r1 + centerOffsetX * bendInf1;
        const y2 = DOM.canvas.height / 2 + Math.cos(angle2) * r1 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf1;
        const x3 = DOM.canvas.width / 2 + Math.sin(angle2) * r2 + centerOffsetX * bendInf2;
        const y3 = DOM.canvas.height / 2 + Math.cos(angle2) * r2 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf2;
        const x4 = DOM.canvas.width / 2 + Math.sin(angle1) * r2 + centerOffsetX * bendInf2;
        const y4 = DOM.canvas.height / 2 + Math.cos(angle1) * r2 * CONFIG.PLAYER_OFFSET + centerOffsetY * bendInf2;

        ctx.fillStyle = getSegmentColor(baseAngle1, i);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

const tubeRenderer = new TubeRenderer();

function drawTube() { tubeRenderer.draw(); }

function drawTubeDepth() {
  const cx = DOM.canvas.width / 2 + gameState.centerOffsetX;
  const cy = DOM.canvas.height / 2 + gameState.centerOffsetY;
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
  const cx = DOM.canvas.width / 2 + gameState.centerOffsetX;
  const cy = DOM.canvas.height / 2 + gameState.centerOffsetY;
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

  ctx.strokeStyle = "rgba(100,60,80,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, CONFIG.TUBE_RADIUS * 0.15, 0, Math.PI * 2);
  ctx.stroke();
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
  if (!Array.isArray(coins) || coins.length === 0) return;

  const centerOffsetX = gameState.centerOffsetX;
  const centerOffsetY = gameState.centerOffsetY;
  const SPRITE_W = CONFIG.FRAME_SIZE;
  const SPRITE_H = CONFIG.FRAME_SIZE;
  const FRAMES = 4;

  for (const c of coins) {
    if (c.collected) continue;

    let p = null;

    if (typeof c.angle === "number") {
      const scale = Math.max(0.05, 1 - c.z);
      const r = CONFIG.TUBE_RADIUS * scale * (c.radiusFactor || 0.65);
      const angle = c.angle + gameState.tubeRotation;
      p = { x: DOM.canvas.width / 2 + Math.sin(angle) * r, y: DOM.canvas.height / 2 + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET, scale };
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
  }
}

function drawObjects() {
  const renderList = [];
  const centerOffsetX = gameState.centerOffsetX;
  const centerOffsetY = gameState.centerOffsetY;

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
    [BONUS_TYPES.RECHARGE]: (frame) => ({ atlas: 'bonus_recharge', spriteWidth: 64, spriteHeight: 64, manualSX: 0, row: 0 }),
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
      const info = obstacleTypeMap[o.subtype];
      if (!info) continue;
      const atlasImage = assetManager.getAsset(info.atlas);
      if (!atlasImage) continue;
      const sz = Math.max(40, CONFIG.FRAME_SIZE * p.scale);
      ctx.drawImage(atlasImage, info.col * CONFIG.FRAME_SIZE, info.row * CONFIG.FRAME_SIZE, CONFIG.FRAME_SIZE, CONFIG.FRAME_SIZE, Math.round(p.x - sz / 2 + offsetX), Math.round(p.y - sz / 2 + offsetY), sz, sz);
    } else {
      const frameFn = bonusFrameMap[o.type];
      if (!frameFn) continue;
      const frameInfo = frameFn(o.animFrame || 0);
      const bonusAtlas = assetManager.getAsset(frameInfo.atlas);
      if (!bonusAtlas) continue;
      const baseSz = Math.max(15, CONFIG.FRAME_SIZE * p.scale * 0.9);
      const sz = frameInfo.spriteWidth === 128 ? baseSz * 1.2 : baseSz;
      const sx = frameInfo.manualSX !== undefined ? frameInfo.manualSX : frameInfo.col * frameInfo.spriteWidth;
      ctx.drawImage(bonusAtlas, sx, frameInfo.row * frameInfo.spriteHeight, frameInfo.spriteWidth, frameInfo.spriteHeight, Math.round(p.x - sz / 2 + offsetX), Math.round(p.y - sz / 2 + offsetY), sz, sz);
    }
  }
}

function drawSpeedLines() {
  const speedRatio = (gameState.speed - CONFIG.SPEED_START) / (CONFIG.SPEED_MAX - CONFIG.SPEED_START);
  if (speedRatio < 0.05) return;

  const cx = DOM.canvas.width / 2;
  const cy = DOM.canvas.height / 2;
  const lineCount = Math.floor(12 + speedRatio * 30);
  const alpha = 0.3 + speedRatio * 0.6;

  ctx.save();
  for (let i = 0; i < lineCount; i++) {
    const angle = (Math.PI * 2 * i) / lineCount + gameState.tubeRotation * 0.5 + Math.random() * 0.1;
    const startR = CONFIG.TUBE_RADIUS * (0.08 + Math.random() * 0.25);
    const lineLength = (60 + speedRatio * 180) * (0.7 + Math.random() * 0.3);
    const endR = startR + lineLength;

    const x1 = cx + Math.cos(angle) * startR;
    const y1 = cy + Math.sin(angle) * startR * CONFIG.PLAYER_OFFSET;
    const x2 = cx + Math.cos(angle) * endR;
    const y2 = cy + Math.sin(angle) * endR * CONFIG.PLAYER_OFFSET;

    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
    grad.addColorStop(0.3, `rgba(255, 220, 180, ${alpha * 0.5})`);
    grad.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 1 + speedRatio * 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpeedVignette() {
  const speedRatio = (gameState.speed - CONFIG.SPEED_START) / (CONFIG.SPEED_MAX - CONFIG.SPEED_START);
  if (speedRatio < 0.1) return;

  const cx = DOM.canvas.width / 2;
  const cy = DOM.canvas.height / 2;
  const maxR = Math.max(DOM.canvas.width, DOM.canvas.height);
  const alpha = speedRatio * 0.4;

  const grad = ctx.createRadialGradient(cx, cy, CONFIG.TUBE_RADIUS * 0.6, cx, cy, maxR);
  grad.addColorStop(0, "rgba(0, 0, 0, 0)");
  grad.addColorStop(0.4, `rgba(10, 0, 20, ${alpha * 0.3})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, DOM.canvas.width, DOM.canvas.height);

  if (speedRatio > 0.4) {
    const glowAlpha = (speedRatio - 0.4) * 0.15;
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, CONFIG.TUBE_RADIUS * 0.3);
    glowGrad.addColorStop(0, `rgba(255, 200, 150, ${glowAlpha})`);
    glowGrad.addColorStop(1, "rgba(255, 200, 150, 0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, DOM.canvas.width, DOM.canvas.height);
  }
}

function drawBonusText() {
  gameState.bonusTextTimer--;
  if (gameState.bonusTextTimer <= 0) return;

  const alpha = Math.min(1, gameState.bonusTextTimer / 20);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(DOM.canvas.width / 2 - 220, DOM.canvas.height * 0.28 - 30, 440, 60);
  ctx.fillStyle = "#ffe066";
  ctx.font = "bold 26px Orbitron, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(gameState.bonusText, DOM.canvas.width / 2, DOM.canvas.height * 0.28);
  ctx.restore();
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
