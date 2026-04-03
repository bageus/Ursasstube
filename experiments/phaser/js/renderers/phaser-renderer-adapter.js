import { createPhaserBridge, getViewportMetrics } from '../phaser/bridge.js';
import { validateRenderSnapshot } from '../render-snapshot-contract.js';

const DEV_MODE = Boolean(import.meta?.env?.DEV);

function assertSnapshotContract(snapshot, phase) {
  if (!DEV_MODE || !snapshot) {
    return;
  }

  const validation = validateRenderSnapshot(snapshot);
  if (validation.ok) {
    return;
  }

  const issues = validation.issues.join(', ');
  throw new Error(`[RenderSnapshot:${phase}] Contract mismatch: ${issues}`);
}

function createPhaserRendererAdapter() {
  let bridge = null;
  let initialized = false;

  return {
    name: 'phaser',
    async init(snapshot) {
      assertSnapshotContract(snapshot, 'init');
      bridge = await createPhaserBridge();
      initialized = await bridge.init(snapshot);
      return initialized;
    },
    resize(snapshot) {
      assertSnapshotContract(snapshot, 'resize');
      bridge?.resize(snapshot);
    },
    render(snapshot) {
      if (!initialized) {
        return;
      }
      assertSnapshotContract(snapshot, 'render');
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
