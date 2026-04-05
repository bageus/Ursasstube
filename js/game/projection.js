import { CONFIG } from '../config.js';
import { gameState, player, DOM } from '../state.js';
import { getViewportMetrics } from '../phaser/bridge.js';

const Animations = {
  idle_back: { atlas: 'character_back_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  idle_left: { atlas: 'character_left_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  idle_right: { atlas: 'character_right_idle', spriteWidth: 128, spriteHeight: 128, frames: 12, colsPerRow: 6 },
  swipe_left: { atlas: 'character_left_swipe', spriteWidth: 128, spriteHeight: 128, frames: 3, colsPerRow: 3 },
  swipe_right: { atlas: 'character_right_swipe', spriteWidth: 128, spriteHeight: 128, frames: 3, colsPerRow: 3 },
  spin: { atlas: 'character_spin', spriteWidth: 128, spriteHeight: 128, frames: 14, colsPerRow: 7 }
};

function getProjectionViewport() {
  const metrics = getViewportMetrics();
  const canvasWidth = DOM.canvas?.width;
  const canvasHeight = DOM.canvas?.height;

  return {
    width: Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : metrics.width,
    height: Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : metrics.height
  };
}

function project(lane, z, includeSpinRotation = false) {
  if (!Number.isFinite(z)) z = CONFIG.PLAYER_Z;
  if (!Number.isFinite(lane)) lane = 0;

  z = Math.max(0, Math.min(z, 2));
  lane = Math.max(-1, Math.min(lane, 1));

  const { width, height } = getProjectionViewport();
  const scale = Math.max(0.05, 1 - z);
  const tubeRadius = CONFIG.TUBE_RADIUS * scale;
  let angle = lane * 0.55;

  if (includeSpinRotation && gameState.spinActive) {
    const spinProgress = gameState.spinProgress / CONFIG.SPIN_DURATION;
    angle += spinProgress * Math.PI * 2;
  }

  const x = width / 2 + Math.sin(angle) * tubeRadius;
  const y = height / 2 + Math.cos(angle) * tubeRadius * CONFIG.PLAYER_OFFSET;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: width / 2, y: height / 2, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function projectPlayer(z) {
  if (!Number.isFinite(z)) z = CONFIG.PLAYER_Z;

  const { width, height } = getProjectionViewport();
  const scale = Math.max(0.05, 1 - z);
  const radius = CONFIG.TUBE_RADIUS * scale;

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
  const x = width / 2 + Math.sin(angle) * radius;
  const y = height / 2 + Math.cos(angle) * radius * CONFIG.PLAYER_OFFSET;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: width / 2, y: height / 2, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
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

export { project, projectPlayer, updatePlayerAnimation, getCurrentAnimation, Animations };
