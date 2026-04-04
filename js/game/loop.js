function createGameLoopController({
  DOM,
  ctx,
  gameState,
  assetManager,
  perfMonitor,
  syncViewport,
  getCanvasDimensions,
  renderLoadingFrame,
  renderFrame,
  updateFrame,
  renderUiFrame,
  onUpdateError,
  shouldRenderCanvasLayer,
  logger
}) {
  let cachedBackgroundGradient = null;

  function invalidateCachedBackgroundGradient() {
    cachedBackgroundGradient = null;
  }

  function runAfterLayoutStabilizes(callback) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        callback();
      });
    });
  }

  function scheduleResizeStabilization(delays = [100, 300, 600, 1000, 2000, 3000]) {
    delays.forEach((delay) => {
      setTimeout(() => {
        syncViewport();
      }, delay);
    });
  }

  function startMainLoop() {
    requestAnimationFrame(gameLoop);
  }

  function gameLoop(time) {
    const frameStart = performance.now();
    const debugStats = gameState.debugStats;
    debugStats.drawMs = 0;
    debugStats.updateMs = 0;
    debugStats.uiMs = 0;
    debugStats.frameMs = 0;

    const { width: canvasW, height: canvasH } = getCanvasDimensions();
    const renderCanvasLayer = typeof shouldRenderCanvasLayer === 'function' ? shouldRenderCanvasLayer() : true;

    if (renderCanvasLayer && (DOM.canvas.width === 0 || DOM.canvas.height === 0)) {
      syncViewport();
      invalidateCachedBackgroundGradient();
    }

    if (!assetManager.isReady()) {
      if (renderCanvasLayer) {
        renderLoadingFrame({ canvasW, canvasH });
      }
      requestAnimationFrame(gameLoop);
      return;
    }

    let delta = 0;
    if (gameState.lastTime === 0) {
      gameState.lastTime = time;
      delta = 1 / 60;
    } else {
      delta = (time - gameState.lastTime) / 1000;
      delta = Math.min(delta, 0.016);
      delta = Math.max(delta, 0.001);
    }
    gameState.lastTime = time;

    perfMonitor.updateFPS();

    if (renderCanvasLayer) {
      ctx.clearRect(0, 0, canvasW, canvasH);

      if (!cachedBackgroundGradient) {
        cachedBackgroundGradient = ctx.createLinearGradient(0, 0, canvasW, canvasH);
        cachedBackgroundGradient.addColorStop(0, "#0a0a15");
        cachedBackgroundGradient.addColorStop(1, "#15080f");
      }
      ctx.fillStyle = cachedBackgroundGradient;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    try {
      const drawStart = performance.now();
      renderFrame();
      debugStats.drawMs = performance.now() - drawStart;
    } catch (error) {
      logger.error("❌ Draw error:", error);
    }

    if (gameState.running) {
      try {
        const updateStart = performance.now();
        updateFrame(delta);
        debugStats.updateMs = performance.now() - updateStart;
      } catch (error) {
        logger.error("❌ Update error:", error);
        onUpdateError(error);
        debugStats.frameMs = performance.now() - frameStart;
        requestAnimationFrame(gameLoop);
        return;
      }
    }

    try {
      const uiStart = performance.now();
      renderUiFrame();
      debugStats.uiMs = performance.now() - uiStart;
    } catch (error) {
      logger.error("❌ UI error:", error);
    }

    debugStats.frameMs = performance.now() - frameStart;
    requestAnimationFrame(gameLoop);
  }

  return {
    gameLoop,
    invalidateCachedBackgroundGradient,
    runAfterLayoutStabilizes,
    scheduleResizeStabilization,
    startMainLoop
  };
}

export { createGameLoopController };
