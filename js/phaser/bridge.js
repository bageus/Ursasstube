import { DEFAULT_RENDER_BACKEND, RENDER_BACKENDS } from '../config.js';
import { createRenderSnapshot } from '../render-snapshot.js';
import { createPhaserRuntime } from './runtime.js';

export function createPhaserBridge({ canvas, host, readCanvasSize }) {
  const activeRendererBackend = DEFAULT_RENDER_BACKEND;
  const phaserRuntime = host ? createPhaserRuntime({ parent: host }) : null;

  function getViewportMetrics() {
    const { width: rawWidth, height: rawHeight } = readCanvasSize();
    const fallbackW = canvas?.clientWidth || host?.clientWidth || window.innerWidth || 360;
    const fallbackH = canvas?.clientHeight || host?.clientHeight || window.innerHeight || 640;
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : fallbackW;
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : fallbackH;

    return {
      width,
      height,
      dpr: Math.min(window.devicePixelRatio || 1, 3)
    };
  }

  function getCanvasDimensions() {
    const { width, height } = getViewportMetrics();
    return { width, height };
  }

  function syncSurface() {
    const isPhaser = activeRendererBackend === RENDER_BACKENDS.PHASER && host;
    canvas.style.display = isPhaser ? 'none' : 'block';
    if (host) {
      host.classList.toggle('active', Boolean(isPhaser));
      host.setAttribute('aria-hidden', isPhaser ? 'false' : 'true');
    }
  }

  async function bootstrap() {
    syncSurface();
    if (activeRendererBackend !== RENDER_BACKENDS.PHASER || !phaserRuntime || !host) return false;

    try {
      await phaserRuntime.init(getViewportMetrics());
      syncSurface();
      return true;
    } catch (error) {
      console.error('❌ Phaser runtime bootstrap failed:', error);
      canvas.style.display = 'block';
      if (host) {
        host.classList.remove('active');
        host.setAttribute('aria-hidden', 'true');
      }
      return false;
    }
  }

  function handleResize() {
    if (phaserRuntime?.mounted) {
      phaserRuntime.resize(getViewportMetrics());
    }
  }

  function renderFrame() {
    if (activeRendererBackend !== RENDER_BACKENDS.PHASER || !phaserRuntime?.mounted) return false;
    const snapshot = createRenderSnapshot(getViewportMetrics(), RENDER_BACKENDS.PHASER);
    phaserRuntime.render(snapshot);
    return true;
  }

  function destroy() {
    phaserRuntime?.destroy();
  }

  return {
    backend: activeRendererBackend,
    getCanvasDimensions,
    bootstrap,
    handleResize,
    renderFrame,
    destroy,
    syncSurface
  };
}
