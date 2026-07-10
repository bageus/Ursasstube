import { MAIN_SCENE_KEY, createMainSceneClass } from './scenes/MainScene.js';
import { createRuntimeController } from './runtime-controller.js';
import { LOW_PERF_MODE } from '../perf.js';
import * as runtimeDetection from '../runtime-detection.js';

const runtimeIsTelegram = runtimeDetection['is' + 'TelegramRuntime'];

async function loadPhaserModule() {
  const localModule = await import('phaser');
  return localModule.default || localModule;
}

function getRendererType(Phaser) {
  // Telegram iOS WebView may keep JavaScript running while a WebGL canvas stops presenting frames.
  // The game uses Phaser Graphics/Sprites only, so Canvas is the safer Telegram renderer.
  return runtimeIsTelegram() ? Phaser.CANVAS : Phaser.AUTO;
}

async function createPhaserRuntime({ parent, snapshot, width, height, resolution }) {
  const Phaser = await loadPhaserModule();
  const MainScene = createMainSceneClass(Phaser);
  const useTelegramCanvasRenderer = getRendererType(Phaser) === Phaser.CANVAS;

  const game = new Phaser.Game({
    type: getRendererType(Phaser),
    parent,
    width,
    height,
    transparent: !useTelegramCanvasRenderer,
    backgroundColor: '#000000',
    render: {
      antialias: !LOW_PERF_MODE && !useTelegramCanvasRenderer,
      pixelArt: false,
      transparent: !useTelegramCanvasRenderer,
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
    fps: {
      target: 60,
      min: 30,
      forceSetTimeOut: false,
      smoothStep: true
    },
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