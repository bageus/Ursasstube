import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameLoopController } from '../js/game/loop.js';

function createHarness() {
  const originalRAF = globalThis.requestAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = (cb) => {
    callbacks.push(cb);
    return callbacks.length;
  };

  const calls = {
    render: 0,
    update: 0,
    ui: 0,
    loading: 0
  };

  const gameState = {
    debugStats: { drawMs: 0, updateMs: 0, uiMs: 0, frameMs: 0 },
    visibilitySuspended: false,
    running: true,
    lastTime: 0
  };

  const controller = createGameLoopController({
    gameState,
    assetManager: { isReady: () => true },
    perfMonitor: { updateFPS: () => {} },
    syncViewport: () => {},
    renderLoadingFrame: () => { calls.loading += 1; },
    renderFrame: () => { calls.render += 1; },
    updateFrame: () => { calls.update += 1; },
    renderUiFrame: () => { calls.ui += 1; },
    onUpdateError: () => {},
    logger: { error: () => {} }
  });

  function tick(ts = 16.67) {
    const cb = callbacks.shift();
    assert.ok(cb, 'expected queued animation frame callback');
    cb(ts);
  }

  function cleanup() {
    globalThis.requestAnimationFrame = originalRAF;
  }

  return { controller, calls, tick, cleanup, callbacks };
}

test('loop does not duplicate RAF scheduling when startMainLoop is called repeatedly', () => {
  const h = createHarness();
  h.controller.startMainLoop();
  h.controller.startMainLoop();
  assert.equal(h.callbacks.length, 1, 'only one RAF callback should be queued');
  h.cleanup();
});

test('stopMainLoop prevents further RAF scheduling after current frame', () => {
  const h = createHarness();
  h.controller.startMainLoop();
  h.tick(16.67);
  assert.equal(h.calls.render, 1);
  assert.equal(h.callbacks.length, 1, 'next frame should be queued while active');

  h.controller.stopMainLoop();
  h.tick(33.34);

  assert.equal(h.calls.render, 1, 'render should not run after stop');
  assert.equal(h.callbacks.length, 0, 'no further frames should be scheduled after stop');
  h.cleanup();
});
