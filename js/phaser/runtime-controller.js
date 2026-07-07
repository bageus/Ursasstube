function createRuntimeController({ game, sceneKey }) {
  let currentWidth = Number(game.scale?.width || game.scale?.gameSize?.width || 0) || null;
  let currentHeight = Number(game.scale?.height || game.scale?.gameSize?.height || 0) || null;
  let currentResolution = Number(game.renderer?.resolution || 0) || null;

  function getScene() {
    return game.scene.getScene(sceneKey);
  }

  function hasViewportChanged(nextWidth, nextHeight, nextResolution) {
    const width = Math.max(1, Math.round(Number(nextWidth) || 0));
    const height = Math.max(1, Math.round(Number(nextHeight) || 0));
    const resolution = Number.isFinite(Number(nextResolution)) ? Number(nextResolution) : currentResolution;

    return width !== currentWidth || height !== currentHeight || resolution !== currentResolution;
  }

  function rememberViewport(nextWidth, nextHeight, nextResolution) {
    currentWidth = Math.max(1, Math.round(Number(nextWidth) || 0));
    currentHeight = Math.max(1, Math.round(Number(nextHeight) || 0));
    if (Number.isFinite(Number(nextResolution))) currentResolution = Number(nextResolution);
  }

  return {
    game,
    getScene,
    applySnapshot(nextSnapshot) {
      const scene = this.getScene();
      scene?.applySnapshot(nextSnapshot);
    },
    resize(nextWidth, nextHeight, nextResolution) {
      if (hasViewportChanged(nextWidth, nextHeight, nextResolution)) {
        game.scale.resize(nextWidth, nextHeight);
        game.renderer?.resize?.(nextWidth, nextHeight);
        if (typeof nextResolution === 'number' && Number.isFinite(nextResolution)) {
          game.renderer.resolution = nextResolution;
        }
        rememberViewport(nextWidth, nextHeight, nextResolution);
      }
      this.applySnapshot({
        ...this.getScene()?.controller?.snapshot,
        viewport: { width: nextWidth, height: nextHeight }
      });
    },
    destroy() {
      game.destroy(true);
    }
  };
}

export { createRuntimeController };
