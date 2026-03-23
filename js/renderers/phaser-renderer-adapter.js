import { createPhaserBridge, getViewportMetrics } from '../phaser/bridge.js';

function createPhaserRendererAdapter() {
  let bridge = null;
  let initialized = false;

  return {
    name: 'phaser',
    async init(snapshot) {
      bridge = await createPhaserBridge();
      initialized = await bridge.init(snapshot);
      return initialized;
    },
    resize(snapshot) {
      bridge?.resize(snapshot);
    },
    render(snapshot) {
      if (!initialized) {
        return;
      }
      bridge?.render(snapshot);
    },
    renderUi(_snapshot) {},
    destroy() {
      bridge?.destroy();
      bridge = null;
      initialized = false;
    },
    getViewportMetrics
  };
}

export { createPhaserRendererAdapter };
