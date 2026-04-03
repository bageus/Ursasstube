import { createPhaserRendererAdapter } from '../experiments/phaser/js/renderers/phaser-renderer-adapter.js';
import { createRenderSnapshot } from '../experiments/phaser/js/render-snapshot.js';
import { gameState, obstacles, bonuses, coins, spinTargets } from '../experiments/phaser/js/state.js';

function upsertDemoEntities(elapsedSec) {
  obstacles.length = 0;
  bonuses.length = 0;
  coins.length = 0;
  spinTargets.length = 0;

  obstacles.push({ lane: -1, z: 0.45 + (Math.sin(elapsedSec * 0.8) + 1) * 0.15, type: 'wall' });
  obstacles.push({ lane: 1, z: 0.8 + (Math.cos(elapsedSec * 0.6) + 1) * 0.2, type: 'wall' });

  bonuses.push({ lane: 0, z: 0.55 + (Math.sin(elapsedSec * 1.1) + 1) * 0.18, type: 'shield', active: true });

  coins.push({ lane: -1, z: 0.4 + (Math.sin(elapsedSec * 1.7) + 1) * 0.25, type: 'silver', collected: false });
  coins.push({ lane: 0, z: 0.5 + (Math.cos(elapsedSec * 1.3) + 1) * 0.2, type: 'gold', collected: false });
  coins.push({ lane: 1, z: 0.65 + (Math.sin(elapsedSec * 0.9) + 1) * 0.2, type: 'silver', collected: false });

  spinTargets.push({ lane: 0, z: 0.9 + (Math.sin(elapsedSec * 0.5) + 1) * 0.18, kind: 'spin', collected: false });
}

function readViewport(viewportHost) {
  const width = Math.max(1, Math.round(viewportHost.clientWidth || window.innerWidth || 360));
  const height = Math.max(1, Math.round(viewportHost.clientHeight || window.innerHeight || 640));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return { width, height, dpr };
}

async function startPhaserPreview(viewportHost = document.getElementById('gameViewport')) {
  if (!viewportHost) {
    throw new Error('Missing #gameViewport host for Phaser preview.');
  }

  const adapter = createPhaserRendererAdapter();

  const initialSnapshot = createRenderSnapshot(readViewport(viewportHost));
  await adapter.init(initialSnapshot);

  const start = performance.now();

  function tick() {
    const elapsedSec = (performance.now() - start) / 1000;

    gameState.distance += gameState.speed * 20;
    gameState.tubeRotation += 0.008;
    gameState.tubeScroll += 0.01;
    gameState.tubeWaveMod = 0.15 + Math.sin(elapsedSec) * 0.05;
    gameState.tubeCurveAngle = Math.sin(elapsedSec * 0.5) * 0.2;
    gameState.tubeCurveStrength = 0.3 + Math.sin(elapsedSec * 0.7) * 0.1;

    upsertDemoEntities(elapsedSec);

    const snapshot = createRenderSnapshot(readViewport(viewportHost));
    adapter.render(snapshot);

    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => {
    adapter.resize(createRenderSnapshot(readViewport(viewportHost)));
  });

  requestAnimationFrame(tick);
}

if (document.getElementById('gameViewport')) {
  startPhaserPreview().catch((error) => {
    console.error('Phaser preview failed to start:', error);
  });
}

export { startPhaserPreview };
