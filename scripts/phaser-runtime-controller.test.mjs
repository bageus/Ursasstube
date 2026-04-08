import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeController } from '../js/phaser/runtime-controller.js';

test('runtime controller supports getScene/applySnapshot/resize/destroy lifecycle', () => {
  const applied = [];
  const scene = {
    controller: {
      snapshot: { difficulty: 'normal' }
    },
    applySnapshot(snapshot) {
      applied.push(snapshot);
    }
  };

  const calls = {
    scaleResize: [],
    rendererResize: [],
    destroy: []
  };

  const game = {
    scene: {
      getScene(key) {
        assert.equal(key, 'main');
        return scene;
      }
    },
    scale: {
      resize(width, height) {
        calls.scaleResize.push([width, height]);
      }
    },
    renderer: {
      resolution: 1,
      resize(width, height) {
        calls.rendererResize.push([width, height]);
      }
    },
    destroy(removeCanvas) {
      calls.destroy.push(removeCanvas);
    }
  };

  const controller = createRuntimeController({ game, sceneKey: 'main' });
  assert.equal(controller.getScene(), scene);

  controller.applySnapshot({ test: true });
  controller.resize(720, 1280, 2);
  controller.destroy();

  assert.deepEqual(applied[0], { test: true });
  assert.deepEqual(applied[1], {
    difficulty: 'normal',
    viewport: { width: 720, height: 1280 }
  });
  assert.deepEqual(calls.scaleResize, [[720, 1280]]);
  assert.deepEqual(calls.rendererResize, [[720, 1280]]);
  assert.equal(game.renderer.resolution, 2);
  assert.deepEqual(calls.destroy, [true]);
});
