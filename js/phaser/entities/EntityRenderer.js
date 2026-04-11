import { BONUS_TYPES, CONFIG } from '../../config.js';
import { gameState } from '../../state.js';
import { renderCollectAnimationsPass, renderObjectsPass } from './entity-render-passes.js';
import { ensureVisualUpgradeTextures, VISUAL_UPGRADE_TEXTURES } from './entity-visual-assets.js';
const LANE_ANGLE_STEP = 0.55;
const BASE_URL = import.meta.env.BASE_URL || './';
const BONUS_TEXT_DELAY_FRAMES = 60;
const BONUS_TEXT_FADE_FRAMES = 30;
const FRAME_MS_60FPS = 1000 / 60;
const COIN_COLLECT_BURST_ANGLE_STEP = Math.PI / 3;
const PLAYER_TEXTURES = {
  idle_back: 'character_back_idle',
  idle_left: 'character_left_idle',
  idle_right: 'character_right_idle',
  swipe_left: 'character_left_swipe',
  swipe_right: 'character_right_swipe',
  spin: 'character_spin',
};
const PLAYER_FRAME_COUNTS = {
  [PLAYER_TEXTURES.idle_back]: 12,
  [PLAYER_TEXTURES.idle_left]: 12,
  [PLAYER_TEXTURES.idle_right]: 12,
  [PLAYER_TEXTURES.swipe_left]: 3,
  [PLAYER_TEXTURES.swipe_right]: 3,
  [PLAYER_TEXTURES.spin]: 14,
};
const BONUS_TEXTURES = {
  [BONUS_TYPES.SHIELD]: 'bonus_shield',
  [BONUS_TYPES.SPEED_DOWN]: 'bonus_speed',
  [BONUS_TYPES.SPEED_UP]: 'bonus_speed',
  [BONUS_TYPES.MAGNET]: 'bonus_magnet',
  [BONUS_TYPES.INVERT]: 'bonus_invert',
  [BONUS_TYPES.SCORE_300]: 'bonus_score_plus',
  [BONUS_TYPES.SCORE_500]: 'bonus_score_plus',
  [BONUS_TYPES.X2]: 'bonus_score_plus',
  [BONUS_TYPES.SCORE_MINUS_300]: 'bonus_score_minus',
  [BONUS_TYPES.SCORE_MINUS_500]: 'bonus_score_minus',
  [BONUS_TYPES.RECHARGE]: 'bonus_recharge',
};
const OBSTACLE_TEXTURES = {
  fence: 'obstacles_1',
  rock1: 'obstacles_1',
  rock2: 'obstacles_1',
  bull: 'obstacles_1',
  wall_brick: 'obstacles_2',
  wall_kactus: 'obstacles_2',
  tree: 'obstacles_2',
  pit: 'obstacles_3',
  spikes: 'obstacles_3',
  bottles: 'obstacles_3',
};
const FRAME_SIZE = 64;
const PLAYER_FRAME_SIZE = 128;
const WIDE_BONUS_TEXTURES = new Set(['bonus_score_plus', 'bonus_score_minus']);
const BONUS_FRAME_DEFS = {
  bonus_score_plus: [
    { name: 'score_300_0', x: 0, y: 0, width: 128, height: 64 },
    { name: 'score_300_1', x: 128, y: 0, width: 64, height: 64 },
    { name: 'score_500_0', x: 192, y: 0, width: 128, height: 64 },
    { name: 'score_500_1', x: 320, y: 0, width: 64, height: 64 },
    { name: 'x2_0', x: 384, y: 0, width: 128, height: 64 },
    { name: 'x2_1', x: 512, y: 0, width: 64, height: 64 },
  ],
  bonus_score_minus: [
    { name: 'score_minus_300_0', x: 0, y: 0, width: 128, height: 64 },
    { name: 'score_minus_300_1', x: 128, y: 0, width: 64, height: 64 },
    { name: 'score_minus_500_0', x: 192, y: 0, width: 128, height: 64 },
    { name: 'score_minus_500_1', x: 320, y: 0, width: 64, height: 64 },
  ],
};
function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function parseRgbaColor(rawColor, fallbackHex = 0xffd54a) {
  if (typeof rawColor !== 'string') {
    return { hex: fallbackHex, alpha: 0.9 };
  }
  const match = rawColor.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return { hex: fallbackHex, alpha: 0.9 };
  }
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  const r = clamp(Math.round(Number.isFinite(parts[0]) ? parts[0] : 255), 0, 255);
  const g = clamp(Math.round(Number.isFinite(parts[1]) ? parts[1] : 213), 0, 255);
  const b = clamp(Math.round(Number.isFinite(parts[2]) ? parts[2] : 74), 0, 255);
  const a = Number.isFinite(parts[3]) ? clamp(parts[3], 0.08, 1) : 0.9;
  const hex = (r << 16) | (g << 8) | b;
  return { hex, alpha: a };
}
function getPlayerTextureKey(player, runtime) {
  if (player?.spinActive) {
    return PLAYER_TEXTURES.spin;
  }
  if (player?.isLaneTransition) {
    return player.targetLane < player.lanePrev
      ? PLAYER_TEXTURES.swipe_left
      : PLAYER_TEXTURES.swipe_right;
  }
  if (player?.lane <= -1) return PLAYER_TEXTURES.idle_left;
  if (player?.lane >= 1) return PLAYER_TEXTURES.idle_right;
  return PLAYER_TEXTURES.idle_back;
}
function projectLane(lane, z, viewport, tube, includeSpinRotation = false, player = null) {
  const safeZ = clamp(Number.isFinite(z) ? z : CONFIG.PLAYER_Z, 0, 2);
  const safeLane = clamp(Number.isFinite(lane) ? lane : 0, -1, 1);
  const scale = Math.max(0.05, 1 - safeZ);
  const bendInfluence = 1 - scale;
  const radius = CONFIG.TUBE_RADIUS * scale;
  let angle = safeLane * LANE_ANGLE_STEP;
  if (includeSpinRotation && player?.spinActive) {
    const spinProgress = (player.spinProgress || 0) / Math.max(CONFIG.SPIN_DURATION, Number.EPSILON);
    angle += spinProgress * Math.PI * 2;
  }
  return {
    x:
      viewport.centerX +
      Math.sin(angle) * radius +
      (tube.centerOffsetX || 0) * bendInfluence,
    y:
      viewport.centerY +
      Math.cos(angle) * radius * CONFIG.PLAYER_OFFSET +
      (tube.centerOffsetY || 0) * bendInfluence,
    scale,
    angle,
  };
}
function getPlayerFrameCount(scene, textureKey) {
  const configuredCount = PLAYER_FRAME_COUNTS[textureKey];
  if (Number.isFinite(configuredCount) && configuredCount > 0) return configuredCount;
  const texture = scene?.textures?.get(textureKey);
  if (!texture) return 1;
  const numericFrames = texture.getFrameNames().filter((name) => /^\d+$/.test(name));
  if (numericFrames.length > 0) return numericFrames.length;
  const fallback = Number(texture.frameTotal) - 1;
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}
function getSpinFrameIndex(spinProgress, totalFrames) {
  const safeTotalFrames = Math.max(1, Number(totalFrames) || 1);
  const progress = clamp(Number(spinProgress) || 0, 0, 1);
  return Math.min(safeTotalFrames - 1, Math.floor(progress * safeTotalFrames));
}
function projectPolar(angle, z, viewport, tube, radiusFactor = 0.65) {
  const safeZ = clamp(Number.isFinite(z) ? z : 1, 0, 2);
  const scale = Math.max(0.05, 1 - safeZ);
  const bendInfluence = 1 - scale;
  const radius = CONFIG.TUBE_RADIUS * scale * radiusFactor;
  const orbitAngle = (angle || 0) + (tube.rotation || 0);
  return {
    x:
      viewport.centerX +
      Math.sin(orbitAngle) * radius +
      (tube.centerOffsetX || 0) * bendInfluence,
    y:
      viewport.centerY +
      Math.cos(orbitAngle) * radius * CONFIG.PLAYER_OFFSET +
      (tube.centerOffsetY || 0) * bendInfluence,
    scale,
    angle: orbitAngle,
  };
}
function getBonusFrame(item) {
  const frame = item.animFrame || 0;
  const toggle = Math.floor(frame / 4) % 2;
  switch (item.type) {
    case BONUS_TYPES.SHIELD:
      return frame % 4;
    case BONUS_TYPES.SPEED_DOWN:
      return toggle;
    case BONUS_TYPES.SPEED_UP:
      return 2 + toggle;
    case BONUS_TYPES.MAGNET:
      return Math.floor(frame / 2) % 6;
    case BONUS_TYPES.INVERT:
      return toggle;
    case BONUS_TYPES.SCORE_300:
      return `score_300_${toggle}`;
    case BONUS_TYPES.SCORE_500:
      return `score_500_${toggle}`;
    case BONUS_TYPES.X2:
      return `x2_${toggle}`;
    case BONUS_TYPES.SCORE_MINUS_300:
      return `score_minus_300_${toggle}`;
    case BONUS_TYPES.SCORE_MINUS_500:
      return `score_minus_500_${toggle}`;
    case BONUS_TYPES.RECHARGE:
      return Math.floor(frame / 3) % 5;
    default:
      return 0;
  }
}
function registerCustomBonusFrames(scene) {
  Object.entries(BONUS_FRAME_DEFS).forEach(([textureKey, frames]) => {
    const texture = scene.textures.get(textureKey);
    if (!texture) return;
    frames.forEach((frameDef) => {
      if (!texture.has(frameDef.name)) {
        texture.add(frameDef.name, 0, frameDef.x, frameDef.y, frameDef.width, frameDef.height);
      }
    });
  });
}
class EntityRenderer {
  static preload(scene) {
    Object.values(PLAYER_TEXTURES).forEach((key) => {
      scene.load.spritesheet(key, assetUrl(`assets/${key}.png`), {
        frameWidth: PLAYER_FRAME_SIZE,
        frameHeight: PLAYER_FRAME_SIZE,
      });
    });
    ['coins_gold', 'coins_silver', ...Object.values(BONUS_TEXTURES), ...Object.values(OBSTACLE_TEXTURES)].forEach((key) => {
      if (WIDE_BONUS_TEXTURES.has(key)) {
        scene.load.image(key, assetUrl(`assets/${key}.png`));
        return;
      }
      scene.load.spritesheet(key, assetUrl(`assets/${key}.png`), {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
    Object.entries(VISUAL_UPGRADE_TEXTURES).forEach(([key, path]) => {
      scene.load.image(key, assetUrl(path));
    });
  }
  constructor(scene) {
    this.scene = scene;
    this.snapshot = null;
    this.root = null;
    this.objectLayer = null;
    this.playerLayer = null;
    this.targetLayer = null;
    this.coinSprites = [];
    this.bonusSprites = [];
    this.bonusAuraSprites = [];
    this.coinGlintSprites = [];
    this.obstacleSprites = [];
    this.spinTargetGraphics = [];
    this.radarLineGraphics = null;
    this.radarHintTexts = [];
    this.spinAlertBackdrop = null;
    this.spinAlertText = null;
    this.bonusTextLabel = null;
    this.playerSprite = null;
    this.playerShadow = null;
    this.collectEffectSeenIds = new Set();
    this.collectEffectSprites = new Set();
  }
  create() {
    ensureVisualUpgradeTextures(this.scene);
    registerCustomBonusFrames(this.scene);
    this.root = this.scene.add.container(0, 0).setDepth(12);
    this.objectLayer = this.scene.add.container(0, 0).setDepth(12);
    this.playerLayer = this.scene.add.container(0, 0).setDepth(13);
    this.targetLayer = this.scene.add.container(0, 0).setDepth(14);
    this.root.add([this.objectLayer, this.playerLayer, this.targetLayer]);
    this.playerShadow = this.scene.textures.exists('shadow_contact_ellipse_01')
      ? this.scene.add.image(0, 0, 'shadow_contact_ellipse_01').setAlpha(0.26)
      : this.scene.add.ellipse(0, 0, 82, 28, 0x000000, 0.26);
    this.playerSprite = this.scene.add.sprite(0, 0, PLAYER_TEXTURES.idle_back, 0);
    this.playerLayer.add([this.playerShadow, this.playerSprite]);
    this.radarLineGraphics = this.scene.add.graphics().setDepth(18);
    this.spinAlertBackdrop = this.scene.add.rectangle(0, 0, 0, 0, 0x000000, 0.74)
      .setDepth(19)
      .setVisible(false);
    this.spinAlertText = this.scene.add.text(0, 0, '', {
      fontFamily: 'Orbitron, Arial, sans-serif',
      fontSize: '32px',
      fontStyle: '700',
      color: '#ffcc00',
      align: 'center'
    })
      .setOrigin(0.5, 0.5)
      .setDepth(20)
      .setVisible(false);
    this.bonusTextLabel = this.scene.add.text(0, 0, '', {
      fontFamily: 'Orbitron, Arial, sans-serif',
      fontSize: '32px',
      fontStyle: '700',
      color: '#ffd54f',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center'
    })
      .setOrigin(0.5, 0.5)
      .setDepth(21)
      .setVisible(false);
  }
  destroyPool(pool) { pool.forEach((entry) => entry.destroy()); pool.length = 0; }
  destroy() {
    this.destroyPool(this.coinSprites);
    this.destroyPool(this.bonusSprites);
    this.destroyPool(this.bonusAuraSprites);
    this.destroyPool(this.coinGlintSprites);
    this.destroyPool(this.obstacleSprites);
    this.destroyPool(this.spinTargetGraphics);
    this.destroyPool(this.radarHintTexts);
    this.radarLineGraphics?.destroy();
    this.spinAlertBackdrop?.destroy();
    this.spinAlertText?.destroy();
    this.bonusTextLabel?.destroy();
    this.playerSprite?.destroy();
    this.playerShadow?.destroy();
    this.collectEffectSprites.forEach((sprite) => sprite.destroy());
    this.collectEffectSprites.clear();
    this.collectEffectSeenIds.clear();
    this.root?.destroy();
    this.root = null;
  }
  ensurePoolSize(pool, count, factory) {
    while (pool.length < count) {
      pool.push(factory());
    }
    for (let index = 0; index < pool.length; index += 1) {
      pool[index].setVisible(index < count);
    }
  }
  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    if (!this.root || !snapshot?.viewport || !snapshot?.tube) return;
    this.renderObjects();
    this.renderPlayer();
    this.renderSpinTargets();
    this.renderRadarHints();
    this.renderSpinAlert();
    this.renderBonusText();
    this.renderCollectAnimations();
  }
  renderCollectAnimations() {
    renderCollectAnimationsPass(this, {
      BONUS_TEXTURES,
      COIN_COLLECT_BURST_ANGLE_STEP,
      clamp,
      parseRgbaColor,
    });
  }
  renderPlayer() {
    const viewport = this.snapshot?.viewport;
    const tube = this.snapshot?.tube;
    const player = this.snapshot?.player;
    if (!viewport || !tube || !player || !this.playerSprite || !this.playerShadow) return;
    const laneValue = player.isLaneTransition
      ? (player.lanePrev || 0) + ((player.targetLane || 0) - (player.lanePrev || 0)) * clamp(player.laneAnimFrame / Math.max(1, CONFIG.LANE_TRANSITION_FRAMES), 0, 1)
      : player.lane;
    const projection = projectLane(laneValue, CONFIG.PLAYER_Z, viewport, tube, true, player);
    const textureKey = getPlayerTextureKey(player);
    const frameCount = getPlayerFrameCount(this.scene, textureKey);
    const frameIndex = textureKey === PLAYER_TEXTURES.spin
      ? getSpinFrameIndex(
        (player.spinProgress || 0) / Math.max(CONFIG.SPIN_DURATION, Number.EPSILON),
        frameCount
      )
      : Math.round(player.frameIndex || 0) % Math.max(1, frameCount);
    this.playerSprite.setTexture(textureKey, frameIndex);
    this.playerSprite.setPosition(projection.x, projection.y);
    this.playerSprite.setDisplaySize(154, 154);
    this.playerSprite.setAlpha(1);
    this.playerShadow
      .setPosition(projection.x, projection.y + 44)
      .setDisplaySize(100, 30)
      .setAlpha(0.22 + (player.shield ? 0.06 : 0));
  }
  renderObjects() {
    renderObjectsPass(this, {
      BONUS_TEXTURES,
      OBSTACLE_TEXTURES,
      VISUAL_UPGRADE_TEXTURES,
      FRAME_SIZE,
      CONFIG,
      clamp,
      projectLane,
      projectPolar,
      getBonusFrame,
    });
  }
  renderSpinTargets() {
    const targets = (this.snapshot?.spinTargets || []).filter((item) => !item.collected && item.z > -0.2 && item.z < 1.6);
    const viewport = this.snapshot?.viewport;
    const tube = this.snapshot?.tube;
    if (!viewport || !tube) return;
    this.ensurePoolSize(this.spinTargetGraphics, targets.length, () => this.scene.add.graphics());
    targets.forEach((target, index) => {
      const graphics = this.spinTargetGraphics[index];
      const projection = projectPolar(target.angle || 0, target.z, viewport, tube, target.radiusFactor || 0.65);
      const size = Math.max(14, 28 * projection.scale);
      graphics.clear();
      graphics.lineStyle(Math.max(1, projection.scale * 2), 0xff6a38, 0.9);
      graphics.strokeCircle(projection.x, projection.y, size);
      graphics.strokeCircle(projection.x, projection.y, size * 0.45);
      graphics.beginPath();
      graphics.moveTo(projection.x - size * 1.15, projection.y);
      graphics.lineTo(projection.x + size * 1.15, projection.y);
      graphics.moveTo(projection.x, projection.y - size * 1.15);
      graphics.lineTo(projection.x, projection.y + size * 1.15);
      graphics.strokePath();
      graphics.setVisible(true);
      this.targetLayer.add(graphics);
    });
    for (let index = targets.length; index < this.spinTargetGraphics.length; index += 1) {
      this.spinTargetGraphics[index].clear();
      this.spinTargetGraphics[index].setVisible(false);
    }
  }
  renderRadarHints() {
    const viewport = this.snapshot?.viewport;
    const fx = this.snapshot?.fx;
    if (!viewport || !fx) return;
    const hints = fx.radarActive && Array.isArray(fx.radarHints)
      ? fx.radarHints.filter((hint) => Number.isFinite(hint?.lane))
      : [];
    if (this.radarLineGraphics) {
      this.radarLineGraphics.clear();
    }
    const lanePositions = {
      [-1]: viewport.width * 0.25,
      [0]: viewport.width * 0.5,
      [1]: viewport.width * 0.75
    };
    const laneLabels = {
      [-1]: 'LEFT',
      [0]: 'CENTER',
      [1]: 'RIGHT'
    };
    const topY = viewport.height * 0.22;
    const bottomY = viewport.height - 36;
    const now = this.scene.time?.now || Date.now();
    this.ensurePoolSize(this.radarHintTexts, hints.length, () =>
      this.scene.add.text(0, 0, '', {
        fontFamily: 'Orbitron, Arial, sans-serif',
        fontSize: '17px',
        fontStyle: '700',
        color: '#ffd95f',
        align: 'center'
      }).setOrigin(0.5, 1).setDepth(20)
    );
    hints.forEach((hint, index) => {
      const lx = lanePositions[hint.lane] ?? (viewport.width / 2);
      const maxTimer = Math.max(0.1, Number(hint.maxTimer) || 1.8);
      const timer = Math.max(0, Number(hint.timer) || 0);
      const pulse = (Math.sin(now * 0.02) + 1) / 2;
      const alpha = (0.35 + pulse * 0.65) * (timer / maxTimer);
      if (this.radarLineGraphics) {
        this.radarLineGraphics.lineStyle(7 + pulse * 3, 0xffcc33, Math.min(1, alpha * 0.45));
        this.radarLineGraphics.beginPath();
        this.radarLineGraphics.moveTo(lx, topY);
        this.radarLineGraphics.lineTo(lx, bottomY);
        this.radarLineGraphics.strokePath();
        this.radarLineGraphics.lineStyle(2, 0xffef9a, Math.min(1, alpha + 0.15));
        this.radarLineGraphics.beginPath();
        this.radarLineGraphics.moveTo(lx, topY);
        this.radarLineGraphics.lineTo(lx, bottomY);
        this.radarLineGraphics.strokePath();
      }
      const label = this.radarHintTexts[index];
      label
        .setText(`🟡 NEXT GOLD: ${laneLabels[hint.lane] || 'CENTER'}`)
        .setPosition(lx, topY - 8)
        .setAlpha(Math.min(1, alpha + 0.2))
        .setVisible(true);
    });
  }
  renderBonusText() {
    const viewport = this.snapshot?.viewport;
    const fx = this.snapshot?.fx;
    if (!viewport || !fx || !this.bonusTextLabel) return;
    const timer = Number(fx.bonusTextTimer) || 0;
    const text = String(fx.bonusText || '').trim();
    if (timer <= 0 || !text) {
      this.bonusTextLabel.setVisible(false);
      return;
    }
    const alpha = timer <= BONUS_TEXT_FADE_FRAMES
      ? Math.min(1, timer / BONUS_TEXT_FADE_FRAMES)
      : 1;
    this.bonusTextLabel
      .setPosition(viewport.width * 0.5, viewport.height * 0.28)
      .setText(text)
      .setAlpha(alpha)
      .setVisible(true);
    const frameDelta = Math.max(0.25, (Number(this.scene.game?.loop?.delta) || FRAME_MS_60FPS) / FRAME_MS_60FPS);
    gameState.bonusTextTimer = Math.max(0, gameState.bonusTextTimer - frameDelta);
  }
  renderSpinAlert() {
    const viewport = this.snapshot?.viewport;
    const fx = this.snapshot?.fx;
    if (!viewport || !fx || !this.spinAlertBackdrop || !this.spinAlertText) return;
    const timer = Number(fx.spinAlertTimer) || 0;
    if (timer <= 0) {
      this.spinAlertBackdrop.setVisible(false);
      this.spinAlertText.setVisible(false);
      return;
    }
    const now = this.scene.time?.now || Date.now();
    const centerX = viewport.width * 0.5;
    const centerY = viewport.height * 0.18;
    let text = '';
    let color = '#ffcc00';
    let fontSize = 24;
    let width = 320;
    let height = 56;
    let alpha = Math.min(1, timer);
    if ((Number(fx.spinAlertLevel) || 0) >= 2 && (Number(fx.spinAlertCountdown) || 0) > 0) {
      const countNum = Math.ceil(Number(fx.spinAlertCountdown) || 0);
      const pulse = (Math.sin(now * 0.015) + 1) / 2;
      text = `🔔 ${countNum}...`;
      color = countNum <= 1 ? '#ff4444' : '#ffcc00';
      fontSize = 32;
      width = 260;
      height = 60;
      alpha = 0.85 + pulse * 0.15;
    } else if (fx.perfectSpinWindow) {
      const pulse = (Math.sin(now * 0.025) + 1) / 2;
      text = '✨ PRESS SPIN!';
      color = '#00ffaa';
      fontSize = 34;
      width = 300;
      height = 70;
      alpha = 0.9 + pulse * 0.1;
    } else if ((Number(fx.spinAlertLevel) || 0) >= 1) {
      text = '🔔 SPIN RING!';
      color = '#ffcc00';
      fontSize = 24;
      width = 320;
      height = 56;
      alpha = Math.min(1, timer);
    }
    if (!text) {
      this.spinAlertBackdrop.setVisible(false);
      this.spinAlertText.setVisible(false);
      return;
    }
    this.spinAlertBackdrop
      .setPosition(centerX, centerY)
      .setSize(width, height)
      .setAlpha(alpha)
      .setVisible(true);
    this.spinAlertText
      .setPosition(centerX, centerY)
      .setText(text)
      .setColor(color)
      .setFontSize(fontSize)
      .setAlpha(alpha)
      .setVisible(true);
  }
}
export { EntityRenderer };
