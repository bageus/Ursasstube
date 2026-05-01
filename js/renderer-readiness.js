import { PHASER_SCENE_READY_EVENT } from './runtime-events.js';

let phaserSceneReady = false;
let rendererPrewarmed = false;
let firstGameplayFrameReady = false;
let globalListenerBound = false;

function markPhaserSceneReady() {
  phaserSceneReady = true;
}

function waitForPhaserSceneReady({ timeoutMs = 3000 } = {}) {
  if (phaserSceneReady) {
    return Promise.resolve({ ok: true, reason: 'already_ready' });
  }

  return new Promise((resolve) => {
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      window.removeEventListener(PHASER_SCENE_READY_EVENT, onReady);
      clearTimeout(timeoutId);
      resolve(result);
    };

    const onReady = () => {
      phaserSceneReady = true;
      finish({ ok: true, reason: 'event' });
    };

    const timeoutId = setTimeout(() => {
      finish({ ok: false, reason: 'timeout' });
    }, Math.max(0, Number(timeoutMs) || 3000));

    window.addEventListener(PHASER_SCENE_READY_EVENT, onReady, { once: true });
  });
}

function markRendererPrewarmed() {
  rendererPrewarmed = true;
}

function isRendererPrewarmed() {
  return rendererPrewarmed;
}

function markFirstGameplayFrameReady() {
  firstGameplayFrameReady = true;
}

function resetFirstGameplayFrameReady() {
  firstGameplayFrameReady = false;
}

function bindRendererReadinessEvents() {
  if (globalListenerBound || typeof window === 'undefined') return;
  window.addEventListener(PHASER_SCENE_READY_EVENT, markPhaserSceneReady);
  globalListenerBound = true;
}

export {
  waitForPhaserSceneReady,
  markRendererPrewarmed,
  isRendererPrewarmed,
  markFirstGameplayFrameReady,
  resetFirstGameplayFrameReady,
  bindRendererReadinessEvents
};
