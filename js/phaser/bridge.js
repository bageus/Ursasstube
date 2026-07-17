import { isTelegramRuntime } from '../runtime-detection.js';
import { DOM } from '../state.js';
import { createPhaserRuntime } from './runtime.js';

const PHASER_HOST_ID = 'phaser-root';

function readLocalStorageFlag(key) {
  try {
    return window.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function getViewportMetrics() {
  const fallbackWidth = DOM.gameViewport?.clientWidth || window.innerWidth || 360;
  const fallbackHeight = DOM.gameViewport?.clientHeight || window.innerHeight || 640;
  const width = Math.max(1, Math.round(fallbackWidth));
  const height = Math.max(1, Math.round(fallbackHeight));
  const dprMax = isTelegramRuntime() ? 1 : 2;
  const resolution = Math.min(window.devicePixelRatio || 1, dprMax);

  return { width, height, resolution };
}

function wakeRuntimeLoop(runtime) {
  const loop = runtime?.game?.loop;
  if (!loop || typeof loop.wake !== 'function') return;
  loop.wake();
}

function shouldSleepRendererOnHiddenDocument() {
  // Telegram WebView can report document.hidden while the mini app is still active.
  // Sleeping the Phaser loop there freezes the canvas while the game simulation keeps running.
  return !isTelegramRuntime();
}

function ensureHost() {
  const parent =
    DOM.gameViewport ||
    DOM.gameContent ||
    DOM.gameWrapper ||
    DOM.gameContainer ||
    document.getElementById('gameContent') ||
    document.getElementById('gameWrapper') ||
    document.getElementById('gameContainer');
  if (!parent) {
    throw new Error('Phaser host parent is unavailable');
  }

  let host = document.getElementById(PHASER_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = PHASER_HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1'
    });
    parent.appendChild(host);
  }

  return host;
}

function attachLifecycleListeners(onResize, getRuntime) {
  const onWindowResize = () => onResize();
  const onVisibilityChange = () => {
    const rt = getRuntime();
    if (document.hidden && shouldSleepRendererOnHiddenDocument()) {
      rt?.game?.loop?.sleep();
    } else {
      wakeRuntimeLoop(rt);
      onResize();
    }
  };

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('visibilitychange', onVisibilityChange);

  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.onEvent('viewportChanged', (event) => {
      if (event.isStateStable) {
        wakeRuntimeLoop(getRuntime());
        onResize();
      }
    });
  }

  return () => {
    window.removeEventListener('resize', onWindowResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

async function createPhaserBridge() {
  let runtime = null;
  let lastSnapshot = null;
  let teardownListeners = null;
  let fpsDebugOverlay = null;
  let lastFpsDebugAt = 0;

  function ensureFpsOverlay() {
    if (!readLocalStorageFlag('DEBUG_FPS')) {
      fpsDebugOverlay?.remove();
      fpsDebugOverlay = null;
      return null;
    }
    if (fpsDebugOverlay) return fpsDebugOverlay;

    fpsDebugOverlay = document.createElement('div');
    fpsDebugOverlay.setAttribute('aria-hidden', 'true');
    Object.assign(fpsDebugOverlay.style, {
      position: 'absolute',
      top: '8px',
      left: '8px',
      zIndex: '5',
      pointerEvents: 'none',
      padding: '6px 8px',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.7)',
      color: '#7CFFB0',
      font: '12px/1.35 monospace',
      whiteSpace: 'pre'
    });
    document.getElementById(PHASER_HOST_ID)?.appendChild(fpsDebugOverlay);
    return fpsDebugOverlay;
  }

  function maybeLogPerf(snapshot) {
    const now = Date.now();
    if (now - lastFpsDebugAt < 2000) return;
    const gameplayDebug = readLocalStorageFlag('DEBUG_GAMEPLAY');
    const fpsDebug = readLocalStorageFlag('DEBUG_FPS');
    if (!gameplayDebug && !fpsDebug) return;
    lastFpsDebugAt = now;

    const metrics = getViewportMetrics();
    const stats = snapshot?.debugStats || {};
    const payload = {
      fps: Math.round(runtime?.game?.loop?.actualFps || 0),
      dpr: Number(window.devicePixelRatio || 1),
      resolution: metrics.resolution,
      tubeSegments: snapshot?.config?.tubeSegments,
      tubeDepthSteps: snapshot?.config?.tubeDepthSteps,
      drawMs: Number(stats.drawMs || 0),
      updateMs: Number(stats.updateMs || 0)
    };

    if (fpsDebug) {
      const overlay = ensureFpsOverlay();
      if (overlay) {
        overlay.textContent = Object.entries(payload)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
      }
    }

    if (gameplayDebug) {
      console.info('[perf-debug]', payload);
    }
  }

  async function mount(snapshot) {
    const host = ensureHost();
    host.replaceChildren();

    const metrics = getViewportMetrics();
    runtime = await createPhaserRuntime({
      parent: host,
      snapshot,
      ...metrics
    });

    teardownListeners = attachLifecycleListeners(() => {
      const nextMetrics = getViewportMetrics();
      runtime?.resize(nextMetrics.width, nextMetrics.height, nextMetrics.resolution);
      if (lastSnapshot) {
        runtime?.applySnapshot({
          ...lastSnapshot,
          viewport: { width: nextMetrics.width, height: nextMetrics.height },
          backend: 'phaser'
        });
      }
    }, () => runtime);
  }

  return {
    async init(snapshot) {
      lastSnapshot = snapshot || null;
      await mount({
        ...snapshot,
        backend: 'phaser'
      });
      return true;
    },
    resize(snapshot) {
      if (snapshot) {
        lastSnapshot = snapshot;
      }
      const metrics = getViewportMetrics();
      wakeRuntimeLoop(runtime);
      runtime?.resize(metrics.width, metrics.height, metrics.resolution);
      runtime?.applySnapshot({
        ...lastSnapshot,
        viewport: { width: metrics.width, height: metrics.height },
        backend: 'phaser'
      });
    },
    render(snapshot) {
      lastSnapshot = snapshot;
      maybeLogPerf(snapshot);
      if (isTelegramRuntime()) wakeRuntimeLoop(runtime);
      runtime?.applySnapshot({
        ...snapshot,
        backend: 'phaser'
      });
    },
    destroy() {
      teardownListeners?.();
      teardownListeners = null;
      runtime?.destroy();
      runtime = null;
      fpsDebugOverlay?.remove();
      fpsDebugOverlay = null;
      document.getElementById(PHASER_HOST_ID)?.remove();
    }
  };
}

export { createPhaserBridge, getViewportMetrics };
