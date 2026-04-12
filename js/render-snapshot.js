import { CONFIG } from './config.js';
import { gameState, player, obstacles, bonuses, coins, spinTargets } from './state.js';

function cloneEntry(entry) {
  return entry && typeof entry === 'object' ? { ...entry } : entry;
}

function collectLampEntries(items, predicate = () => true) {
  return items
    .filter((item) => item && Number.isFinite(item.z) && predicate(item))
    .map((item) => ({ z: item.z }));
}

function createRenderSnapshot({ width, height, backend = 'phaser' }) {
  const viewportWidth = Math.max(1, Math.round(width || 1));
  const viewportHeight = Math.max(1, Math.round(height || 1));

  const lampEntries = [
    ...collectLampEntries(obstacles, (item) => !item.passed),
    ...collectLampEntries(bonuses, (item) => item.active !== false),
    ...collectLampEntries(coins, (item) => !item.collected),
    ...collectLampEntries(spinTargets, (item) => !item.collected),
  ];

  const collectAnimations = Array.isArray(gameState.collectAnimations)
    ? gameState.collectAnimations.map(cloneEntry)
    : [];
  if (Array.isArray(gameState.collectAnimations)) {
    gameState.collectAnimations.length = 0;
  }

  return {
    backend,
    viewport: {
      width: viewportWidth,
      height: viewportHeight,
      centerX: viewportWidth * 0.5,
      centerY: viewportHeight * 0.5
    },
    tube: {
      rotation: gameState.tubeRotation,
      scroll: gameState.tubeScroll,
      distanceMeters: gameState.distance,
      waveMod: gameState.tubeWaveMod,
      curveAngle: gameState.tubeCurveAngle,
      curveStrength: gameState.tubeCurveStrength,
      centerOffsetX: gameState.centerOffsetX,
      centerOffsetY: gameState.centerOffsetY,
      speed: gameState.speed,
      depthSteps: CONFIG.TUBE_DEPTH_STEPS,
      segments: CONFIG.TUBE_SEGMENTS
    },
    player: {
      lane: player.lane,
      targetLane: player.targetLane,
      lanePrev: player.lanePrev,
      laneAnimFrame: player.laneAnimFrame,
      isLaneTransition: player.isLaneTransition,
      spinActive: gameState.spinActive,
      spinProgress: gameState.spinProgress,
      frameIndex: player.frameIndex,
      shield: player.shield
    },
    obstacles: obstacles.map(cloneEntry),
    bonuses: bonuses.map(cloneEntry),
    coins: coins.map(cloneEntry),
    spinTargets: spinTargets.map(cloneEntry),
    lamps: lampEntries,
    fx: {
      bonusText: gameState.bonusText,
      bonusTextTimer: gameState.bonusTextTimer,
      radarActive: gameState.radarActive,
      radarHints: Array.isArray(gameState.radarHints) ? gameState.radarHints.map(cloneEntry) : [],
      spinAlertLevel: gameState.spinAlertLevel,
      spinAlertTimer: gameState.spinAlertTimer,
      spinAlertCountdown: gameState.spinAlertCountdown,
      perfectSpinWindow: gameState.perfectSpinWindow,
      collectAnimations
    }
  };
}

export { createRenderSnapshot };
