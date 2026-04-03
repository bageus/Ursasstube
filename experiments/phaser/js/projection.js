import { CONFIG } from './config.js';
import { gameState, player } from './state.js';

const Animations = {
  idle_back: { atlas: 'character_back_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  idle_left: { atlas: 'character_left_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  idle_right: { atlas: 'character_right_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  swipe_left: { atlas: 'character_left_swipe', spriteWidth: 128, spriteHeight: 128, frames: 3, colsPerRow: 3 },
  swipe_right: { atlas: 'character_right_swipe', spriteWidth: 128, spriteHeight: 128, frames: 3, colsPerRow: 3 },
  spin: { atlas: 'character_spin', spriteWidth: 128, spriteHeight: 128, frames: 14, colsPerRow: 7 }
};

function project(lane, z, canvasSize, includeSpinRotation = false) {
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

  const centerX = canvasSize?.width / 2;
  const centerY = canvasSize?.height / 2;
  const fallbackX = isFinite(centerX) ? centerX : 0;
  const fallbackY = isFinite(centerY) ? centerY : 0;

  const x = fallbackX + Math.sin(angle) * tubeRadius;
  const y = fallbackY + Math.cos(angle) * tubeRadius * CONFIG.PLAYER_OFFSET;

  if (!isFinite(x) || !isFinite(y)) {
    return { x: fallbackX, y: fallbackY, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function projectPlayer(z, canvasSize) {
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
  const centerX = canvasSize?.width / 2;
  const centerY = canvasSize?.height / 2;
  const fallbackX = isFinite(centerX) ? centerX : 0;
  const fallbackY = isFinite(centerY) ? centerY : 0;

  const x = fallbackX + Math.sin(angle) * r;
  const y = fallbackY + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET;

  if (!isFinite(x) || !isFinite(y)) {
    return { x: fallbackX, y: fallbackY, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function getSpinFrameIndex(spinProgress, totalFrames) {
  const safeTotalFrames = Math.max(1, Number(totalFrames) || 1);
  const progress = Math.max(0, Math.min(1, Number(spinProgress) || 0));
  return Math.min(safeTotalFrames - 1, Math.floor(progress * safeTotalFrames));
}

function getCurrentAnimation() {
  if (gameState.spinActive) return null;
  if (player.state === 'transition') {
    return player.targetLane < player.lane ? Animations.swipe_left : Animations.swipe_right;
  }
  switch (player.lane) {
    case -1: return Animations.idle_left;
    case 1: return Animations.idle_right;
    default: return Animations.idle_back;
  }
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

export {
  Animations,
  getCurrentAnimation,
  getSpinFrameIndex,
  project,
  projectPlayer,
  updatePlayerAnimation
};
