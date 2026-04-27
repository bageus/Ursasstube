import { MAIN_SCENE_KEY, createMainSceneClass } from './scenes/MainScene.js';
import { createRuntimeController } from './runtime-controller.js';
import { LOW_PERF_MODE } from '../perf.js';

async function loadPhaserModule() {
  const localModule = await import('phaser');
  return localModule.default || localModule;
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
      antialias: !LOW_PERF_MODE,
      pixelArt: false,
      transparent: true,
      roundPixels: LOW_PERF_MODE
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
