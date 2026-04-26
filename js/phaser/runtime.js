import { MAIN_SCENE_KEY, createMainSceneClass } from './scenes/MainScene.js';
import { createRuntimeController } from './runtime-controller.js';

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
