function renderVolumetricSlicesPass(renderer, deps, frame, renderTube) {
  const { centerX, centerY, depthEntries, maxDepth } = frame;
  if (!renderer.fxGraphics || !Array.isArray(depthEntries) || depthEntries.length === 0) return;

  const sliceStep = Math.max(2, Math.floor(depthEntries.length / 6));
  for (let index = 0; index < depthEntries.length; index += sliceStep) {
    const depthEntry = depthEntries[index];
    const z = depthEntry.animatedDepth * deps.CONFIG.TUBE_Z_STEP;
    const scale = Math.max(0.05, 1 - z);
    if (scale < 0.32) continue;
    const bendInfluence = 1 - scale;
    const depthRatio = 1 - (((depthEntry.animatedDepth % maxDepth) + maxDepth) % maxDepth) / maxDepth;
    const width = Math.max(30, deps.CONFIG.TUBE_RADIUS * scale * 1.34);
    const height = width * deps.CONFIG.PLAYER_OFFSET * 0.84;
    const alpha = deps.amplifiedAlpha(
      deps.clamp((0.008 + depthRatio * 0.024) * (0.2 + depthEntry.spawnBlend * 0.45), 0, 0.038),
      0.16,
    );
    if (alpha <= 0.002) continue;

    const sliceColor = deps.blendColor(0x4ec4ff, 0xe2f5ff, depthRatio * 0.6);
    const x = centerX + (renderTube.centerOffsetX || 0) * bendInfluence;
    const y = centerY + (renderTube.centerOffsetY || 0) * bendInfluence;

    renderer.fxGraphics.lineStyle(1.2, sliceColor, Math.min(0.09, alpha * 1.5));
    renderer.fxGraphics.strokeEllipse(x, y, width * 0.9, height * 0.9);
  }
}

export { renderVolumetricSlicesPass };
