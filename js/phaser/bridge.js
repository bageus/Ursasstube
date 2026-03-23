import { DOM } from '../state.js';
import { createPhaserRuntime } from './runtime.js';

const PHASER_HOST_ID = 'phaser-root';
const DPR_MAX = 2;

function getViewportMetrics() {
  const fallbackWidth = DOM.canvas?.clientWidth || window.innerWidth || 360;
  const fallbackHeight = DOM.canvas?.clientHeight || window.innerHeight || 640;
  const width = Math.max(1, Math.round(fallbackWidth));
  const height = Math.max(1, Math.round(fallbackHeight));
  const resolution = Math.min(window.devicePixelRatio || 1, DPR_MAX);

  return { width, height, resolution };
}

function ensureHost() {
  const parent = DOM.canvas?.parentElement;
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

function attachLifecycleListeners(onResize) {
  const onWindowResize = () => onResize();
  const onVisibilityChange = () => {
    if (!document.hidden) {
      onResize();
    }
  };

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('visibilitychange', onVisibilityChange);

  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.onEvent('viewportChanged', (event) => {
      if (event.isStateStable) {
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
    });
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
      runtime?.resize(metrics.width, metrics.height, metrics.resolution);
      runtime?.applySnapshot({
        ...lastSnapshot,
        viewport: { width: metrics.width, height: metrics.height },
        backend: 'phaser'
      });
    },
    render(snapshot) {
      lastSnapshot = snapshot;
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
      document.getElementById(PHASER_HOST_ID)?.remove();
    }
  };
}

export { createPhaserBridge, getViewportMetrics };
