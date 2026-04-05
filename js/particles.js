import { gameState } from './state.js';

function spawnParticles(x, y, color, count = 8, speed = 5) {
  if (!Array.isArray(gameState.collectAnimations)) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  gameState.collectAnimations.push({
    id: `particle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: 'particle_burst',
    x,
    y,
    color,
    count: Math.max(1, Math.min(24, Number(count) || 8)),
    speed: Math.max(1, Math.min(18, Number(speed) || 5))
  });
}

function clearParticles() {
  // Phaser collect-FX are snapshot-driven and short-lived.
  // Keeping this helper to preserve current session reset flow.
}

export { spawnParticles, clearParticles };
