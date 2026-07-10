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

function getNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function createRenderDiagnostics() {
  const now = getNowMs();
  const lastRenderAt = Number(gameState.lastGameplayRenderAtMs) || 0;
  const lastSimulationAt = Number(gameState.lastSimulationUpdateAtMs) || 0;
  const renderBehindMs = lastRenderAt > 0 && lastSimulationAt > 0
    ? Math.max(0, lastSimulationAt - lastRenderAt)
    : 0;

  return {
    lastGameplayRenderAtMs: lastRenderAt,
    lastSimulationUpdateAtMs: lastSimulationAt,
    lastRenderAgeMs: lastRenderAt > 0 ? Math.max(0, now - lastRenderAt) : null,
    lastSimulationAgeMs: lastSimulationAt > 0 ? Math.max(0, now - lastSimulationAt) : null,
    renderBehindSimulationMs: renderBehindMs,
  };
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

  const renderDiagnostics = createRenderDiagnostics();
  const snapshot = {
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
      centerOffsetX: Number.isFinite(gameState.renderCenterOffsetX) ? gameState.renderCenterOffsetX : gameState.centerOffsetX,
      centerOffsetY: Number.isFinite(gameState.renderCenterOffsetY) ? gameState.renderCenterOffsetY : gameState.centerOffsetY,
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
    },
    runtime: {
      screen: gameState.screen || 'unknown',
      preparingGameplay: Boolean(gameState.preparingGameplay),
      simulationRunning: Boolean(gameState.simulationRunning || gameState.running),
      firstFrameMode: Boolean(gameState.firstFrameMode),
      heavyRenderEnabled: Boolean(gameState.heavyRenderEnabled),
      renderQuality: gameState.renderQuality || 'unknown',
      renderDiagnostics
    }
  };

  if (typeof window !== 'undefined') {
    window.__URSASS_RENDER_SNAPSHOT__ = () => ({
      runtime: { ...snapshot.runtime },
      debugStats: gameState.debugStats ? { ...gameState.debugStats } : null,
      timestamp: Date.now(),
    });
  }

  return snapshot;
}

export { createRenderSnapshot };
