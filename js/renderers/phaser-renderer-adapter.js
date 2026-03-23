function createPhaserRendererAdapter() {
  let initialized = false;

  return {
    name: 'phaser',
    async init() {
      initialized = false;
      return false;
    },
    resize(_snapshot) {},
    render(_snapshot) {
      if (!initialized) {
        return;
      }
    },
    renderUi(_snapshot) {},
    destroy() {
      initialized = false;
    }
  };
}

export { createPhaserRendererAdapter };
