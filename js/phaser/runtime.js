import { MAIN_SCENE_KEY, createMainSceneClass } from './scenes/MainScene.js';
import { createRuntimeController } from './runtime-controller.js';

// The CDN ESM build of Phaser. Mapped via importmap in index.html so that
// bare specifier 'phaser' resolves to this URL in the browser.
// Note: ESM modules do not populate window.Phaser — typeof window.Phaser
// will be 'undefined' even when Phaser is loaded correctly via ESM.
const PHASER_CDN_URL = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.esm.js';

async function importModule(specifier) {
  return import(/* @vite-ignore */ specifier);
}

async function loadPhaserModule() {
  try {
    // With the importmap in index.html, 'phaser' resolves to PHASER_CDN_URL in the browser.
    // In a local dev/build environment where phaser is installed as a package, it resolves locally.
    const localModule = await importModule('phaser');
    return localModule.default || localModule;
  } catch (localError) {
    // Fallback: load CDN URL directly if the 'phaser' specifier still cannot be resolved.
    console.warn('⚠️ Local Phaser package is unavailable, falling back to CDN runtime.', localError);
    const cdnModule = await importModule(PHASER_CDN_URL);
    return cdnModule.default || cdnModule;
  }
}

async function createPhaserRuntime({ parent, snapshot, width, height, resolution }) {
  const Phaser = await loadPhaserModule();
  const MainScene = createMainSceneClass(Phaser);

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
    scene: [MainScene],
    callbacks: {
      postBoot(game) {
        const scene = game.scene.getScene(MAIN_SCENE_KEY);
        scene?.applySnapshot(snapshot);
      }
    }
  });

  return createRuntimeController({
    game,
    sceneKey: MAIN_SCENE_KEY
  });
}

export { createPhaserRuntime };
