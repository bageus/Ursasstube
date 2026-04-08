function createRuntimeController({ game, sceneKey }) {
  return {
    game,
    getScene() {
      return game.scene.getScene(sceneKey);
    },
    applySnapshot(nextSnapshot) {
      const scene = this.getScene();
      scene?.applySnapshot(nextSnapshot);
    },
    resize(nextWidth, nextHeight, nextResolution) {
      game.scale.resize(nextWidth, nextHeight);
      game.renderer?.resize?.(nextWidth, nextHeight);
      if (typeof nextResolution === 'number' && Number.isFinite(nextResolution)) {
        game.renderer.resolution = nextResolution;
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
