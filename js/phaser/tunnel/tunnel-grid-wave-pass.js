function createGridWaveSampler(frame, deps) {
  const waveDistancePeriod = Math.max(1, deps.GRID_WAVE_DISTANCE_PERIOD_METERS || 100);
  const distanceMeters = Math.max(0, frame?.distanceMeters || 0);
  if (distanceMeters < waveDistancePeriod) {
    return () => 0;
  }

  const cycleDistance = distanceMeters - waveDistancePeriod;
  const distancePhase = (cycleDistance % waveDistancePeriod) / waveDistancePeriod;
  const waveFrontDepthRatio = distancePhase;
  const waveBandSoftness = Math.max(0.01, deps.GRID_WAVE_BAND_SOFTNESS || 0.08);
  const waveBandMin = waveFrontDepthRatio - waveBandSoftness;
  const waveBandMax = waveFrontDepthRatio + waveBandSoftness;

  return function getWaveBandAlpha(depthRatio) {
    if (depthRatio < waveBandMin || depthRatio > waveBandMax) {
      return 0;
    }
    const distanceToCenter = Math.abs(depthRatio - waveFrontDepthRatio);
    return deps.clamp(1 - distanceToCenter / waveBandSoftness, 0, 1);
  };
}

function renderGridWaveSegment(waveGraphics, deps, line, waveBandAlpha, endX, endY) {
  if (!waveGraphics || waveBandAlpha <= 0.001) {
    return;
  }

  const waveGlowAlpha = deps.clamp(
    waveBandAlpha * deps.GRID_WAVE_GLOW_ALPHA * (0.62 + line.gridBlend * 0.55),
    0,
    1,
  );
  if (waveGlowAlpha > 0.001) {
    waveGraphics.lineStyle(deps.GRID_WAVE_GLOW_LINE_WIDTH, deps.GRID_WAVE_GLOW_COLOR, waveGlowAlpha);
    waveGraphics.beginPath();
    waveGraphics.moveTo(line.x1, line.y1);
    waveGraphics.lineTo(endX, endY);
    waveGraphics.strokePath();
  }

  const waveCoreAlpha = deps.clamp(
    waveBandAlpha * deps.GRID_WAVE_CORE_ALPHA * (0.56 + line.gridBlend * 0.68),
    0,
    1,
  );
  if (waveCoreAlpha > 0.001) {
    waveGraphics.lineStyle(deps.GRID_WAVE_CORE_LINE_WIDTH, deps.GRID_WAVE_CORE_COLOR, waveCoreAlpha);
    waveGraphics.beginPath();
    waveGraphics.moveTo(line.x1, line.y1);
    waveGraphics.lineTo(endX, endY);
    waveGraphics.strokePath();
  }
}

export {
  createGridWaveSampler,
  renderGridWaveSegment,
};
