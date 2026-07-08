function createGameLoopController({
  gameState,
  assetManager,
  perfMonitor,
  syncViewport,
  renderLoadingFrame,
  renderFrame,
  updateFrame,
  renderUiFrame,
  onUpdateError,
  logger
}) {
  let loopActive = false;

  function runAfterLayoutStabilizes(callback) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        callback();
      });
    });
  }

  function scheduleResizeStabilization(delays = [100, 300, 600, 1000]) {
    delays.forEach((delay) => {
      setTimeout(() => {
        if (delay >= 1000 && (gameState.running || gameState.simulationRunning)) return;
        syncViewport();
      }, delay);
    });
  }

  function startMainLoop() {
    if (loopActive) return;
    loopActive = true;
    requestAnimationFrame(gameLoop);
  }

  function stopMainLoop() {
    loopActive = false;
  }

  function updateRenderTimingStats(now = performance.now()) {
    const debugStats = gameState.debugStats;
    const lastRenderAt = Number(gameState.lastGameplayRenderAtMs) || 0;
    const lastSimulationAt = Number(gameState.lastSimulationUpdateAtMs) || 0;
    debugStats.lastRenderAgeMs = lastRenderAt > 0 ? Math.max(0, now - lastRenderAt) : 0;
    debugStats.lastSimulationAgeMs = lastSimulationAt > 0 ? Math.max(0, now - lastSimulationAt) : 0;
    debugStats.renderBehindMs = lastRenderAt > 0 && lastSimulationAt > 0
      ? Math.max(0, lastSimulationAt - lastRenderAt)
      : 0;
  }

  function gameLoop(time) {
    if (!loopActive) return;
    const frameStart = performance.now();
    const debugStats = gameState.debugStats;
    debugStats.drawMs = 0;
    debugStats.updateMs = 0;
    debugStats.uiMs = 0;
    debugStats.frameMs = 0;

    if (!assetManager.isReady()) {
      renderLoadingFrame();
      if (loopActive) requestAnimationFrame(gameLoop);
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

    if (gameState.visibilitySuspended) {
      if (loopActive) requestAnimationFrame(gameLoop);
      return;
    }

    const shouldUpdateSimulation = Boolean(gameState.simulationRunning || gameState.running);
    const heavyRenderEnabled = gameState.heavyRenderEnabled !== false;
    const shouldRenderLiveGameplay = Boolean(heavyRenderEnabled && shouldUpdateSimulation);
    const shouldRenderPreparingFrame = Boolean(gameState.preparingGameplay && !gameState.firstGameplayFrameReady);

    if (shouldRenderLiveGameplay || shouldRenderPreparingFrame) {
      try {
        const drawStart = performance.now();
        renderFrame();
        gameState.lastGameplayRenderAtMs = performance.now();
        debugStats.drawMs = gameState.lastGameplayRenderAtMs - drawStart;
      } catch (error) {
        logger.error("❌ Draw error:", error);
      }
    }

    if (shouldUpdateSimulation) {
      try {
        const updateStart = performance.now();
        updateFrame(delta);
        gameState.lastSimulationUpdateAtMs = performance.now();
        debugStats.updateMs = gameState.lastSimulationUpdateAtMs - updateStart;
      } catch (error) {
        logger.error("❌ Update error:", error);
        onUpdateError(error);
        debugStats.frameMs = performance.now() - frameStart;
        updateRenderTimingStats();
        if (loopActive) requestAnimationFrame(gameLoop);
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
    updateRenderTimingStats();
    if (loopActive) requestAnimationFrame(gameLoop);
  }

  return {
    gameLoop,
    runAfterLayoutStabilizes,
    scheduleResizeStabilization,
    startMainLoop,
    stopMainLoop
  };
}

export { createGameLoopController };
