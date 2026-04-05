import { CONFIG } from './config.js';
import { gameState, player } from './state.js';
import { getViewportCenter } from './viewport.js';

const Animations = {
  idle_back: { frames: 12 },
  idle_left: { frames: 12 },
  idle_right: { frames: 12 },
  swipe_left: { frames: 3 },
  swipe_right: { frames: 3 },
  spin: { frames: 14 }
};

function project(lane, z, includeSpinRotation = false) {
  if (!Number.isFinite(z)) z = CONFIG.PLAYER_Z;
  if (!Number.isFinite(lane)) lane = 0;

  z = Math.max(0, Math.min(z, 2));
  lane = Math.max(-1, Math.min(lane, 1));

  const scale = Math.max(0.05, 1 - z);
  const tubeRadius = CONFIG.TUBE_RADIUS * scale;
  let angle = lane * 0.55;

  if (includeSpinRotation && gameState.spinActive) {
    const spinProgress = gameState.spinProgress / CONFIG.SPIN_DURATION;
    angle += spinProgress * Math.PI * 2;
  }

  const { x: centerX, y: centerY } = getViewportCenter();
  const x = centerX + Math.sin(angle) * tubeRadius;
  const y = centerY + Math.cos(angle) * tubeRadius * CONFIG.PLAYER_OFFSET;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: centerX, y: centerY, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function projectPlayer(z) {
  if (!Number.isFinite(z)) z = CONFIG.PLAYER_Z;

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
  const { x: centerX, y: centerY } = getViewportCenter();
  const x = centerX + Math.sin(angle) * r;
  const y = centerY + Math.cos(angle) * r * CONFIG.PLAYER_OFFSET;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: centerX, y: centerY, scale: 1, angle: 0 };
  }

  return { x, y, scale, angle };
}

function updatePlayerAnimation(delta) {
  if (gameState.spinActive) return;
  player.frameTimer += delta;
  const anim = getCurrentAnimation();
  if (!anim) return;
  if (player.frameTimer >= 0.3) {
    player.frameTimer -= 0.3;
    player.frameIndex = (player.frameIndex + 1) % anim.frames;
  }
}

function getCurrentAnimation() {
  if (gameState.spinActive) return Animations.spin;
  if (player.state === 'transition') {
    return player.targetLane < player.lane ? Animations.swipe_left : Animations.swipe_right;
  }
  switch (player.lane) {
    case -1: return Animations.idle_left;
    case 1: return Animations.idle_right;
    default: return Animations.idle_back;
  }
}

export { project, projectPlayer, updatePlayerAnimation };
