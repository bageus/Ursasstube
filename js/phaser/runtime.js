import { createMainScene } from './scenes/MainScene.js';

const PHASER_CDN_URL = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js';

let phaserLoaderPromise = null;

function loadPhaserScript() {
  if (window.Phaser) return Promise.resolve(window.Phaser);
  if (phaserLoaderPromise) return phaserLoaderPromise;

  phaserLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-phaser-runtime="cdn"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Phaser), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Phaser runtime script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PHASER_CDN_URL;
    script.async = true;
    script.defer = true;
    script.dataset.phaserRuntime = 'cdn';
    script.onload = () => {
      if (window.Phaser) resolve(window.Phaser);
      else reject(new Error('Phaser runtime loaded without window.Phaser'));
    };
    script.onerror = () => reject(new Error('Failed to load Phaser runtime script'));
    document.head.appendChild(script);
  });

  return phaserLoaderPromise;
}

export function createPhaserRuntime({ parent }) {
  let PhaserRef = null;
  let game = null;
  let mounted = false;
  let lastSnapshot = null;

  async function init(initialViewport = { width: 0, height: 0, dpr: 1 }) {
    if (mounted) {
      resize(initialViewport);
      return true;
    }

    PhaserRef = await loadPhaserScript();
    const MainScene = createMainScene(PhaserRef);
    game = new PhaserRef.Game({
      type: PhaserRef.AUTO,
      parent,
      transparent: false,
      backgroundColor: '#0a0a15',
      width: Math.max(1, Math.round(initialViewport.width || parent.clientWidth || 1)),
      height: Math.max(1, Math.round(initialViewport.height || parent.clientHeight || 1)),
      resolution: Math.max(1, Math.min(initialViewport.dpr || window.devicePixelRatio || 1, 3)),
      scale: {
        mode: PhaserRef.Scale.NONE,
        autoCenter: PhaserRef.Scale.NO_CENTER,
        width: Math.max(1, Math.round(initialViewport.width || parent.clientWidth || 1)),
        height: Math.max(1, Math.round(initialViewport.height || parent.clientHeight || 1))
      },
      scene: [MainScene],
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false,
        powerPreference: 'high-performance'
      }
    });

    mounted = true;
    if (lastSnapshot) render(lastSnapshot);
    return true;
  }

  function resize(viewport = { width: 0, height: 0, dpr: 1 }) {
    if (!mounted || !game) return;
    const width = Math.max(1, Math.round(viewport.width || parent.clientWidth || 1));
    const height = Math.max(1, Math.round(viewport.height || parent.clientHeight || 1));
    const dpr = Math.max(1, Math.min(viewport.dpr || window.devicePixelRatio || 1, 3));
    game.scale.resize(width, height);
    game.renderer.resolution = dpr;
    if (typeof game.renderer.resize === 'function') game.renderer.resize(width, height);
    if (game.canvas) {
      game.canvas.style.width = `${width}px`;
      game.canvas.style.height = `${height}px`;
    }
  }

  function render(snapshot) {
    lastSnapshot = snapshot;
    if (!mounted || !game) return;
    const scene = game.scene.getScene('MainScene');
    if (scene && typeof scene.setExternalSnapshot === 'function') {
      scene.setExternalSnapshot(snapshot);
    }
  }

  function destroy() {
    if (game) {
      game.destroy(true);
    }
    game = null;
    mounted = false;
  }

  return {
    init,
    resize,
    render,
    destroy,
    get mounted() {
      return mounted;
    }
  };
}
