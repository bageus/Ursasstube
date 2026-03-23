import { MainScene } from './scenes/MainScene.js';

const PHASER_CDN_URL = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.esm.js';

async function importModule(specifier) {
  return import(/* @vite-ignore */ specifier);
}

async function loadPhaserModule() {
  try {
    const localModule = await importModule('phaser');
    return localModule.default || localModule;
  } catch (localError) {
    console.warn('⚠️ Local Phaser package is unavailable, falling back to CDN runtime.', localError);
    const cdnModule = await importModule(PHASER_CDN_URL);
    return cdnModule.default || cdnModule;
  }
}

async function createPhaserRuntime({ parent, snapshot, width, height, resolution }) {
  const Phaser = await loadPhaserModule();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    transparent: true,
    backgroundColor: '#000000',
    render: {
      antialias: true,
      pixelArt: false,
      transparent: true,
      roundPixels: false
    },
    scale: {
      mode: Phaser.Scale.NONE,
      width,
      height,
      autoCenter: Phaser.Scale.NO_CENTER,
      zoom: 1
    },
    resolution,
    scene: [MainScene]
  });

  return {
    game,
    getScene() {
      return game.scene.getScene('MainScene');
    },
    applySnapshot(nextSnapshot) {
      const scene = this.getScene();
      scene?.applySnapshot(nextSnapshot);
    },
    resize(nextWidth, nextHeight, nextResolution) {
      game.scale.resize(nextWidth, nextHeight);
      game.renderer?.resize?.(nextWidth, nextHeight);
      if (typeof nextResolution === 'number' && Number.isFinite(nextResolution)) {
        game.renderer.resolution = nextResolution;
      }
      this.applySnapshot({
        ...snapshot,
        viewport: { width: nextWidth, height: nextHeight }
      });
    },
    destroy() {
      game.destroy(true);
    }
  };
}

export { createPhaserRuntime };
