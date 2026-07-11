function calculateCenterOffsetStep({ gameState, adaptiveProfile, config, delta }) {
  const normalizedMultiplier = Math.max(0, Number(adaptiveProfile.centerOffsetMultiplier) || 0);
  const rawTargetCenterOffsetX = Math.cos(gameState.curveDirection) * gameState.tubeCurveStrength * config.TUBE_RADIUS * config.CURVE_OFFSET_X;
  const rawTargetCenterOffsetY = Math.sin(gameState.curveDirection) * gameState.tubeCurveStrength * config.TUBE_RADIUS * config.CURVE_OFFSET_Y;
  const targetCenterOffsetX = rawTargetCenterOffsetX * normalizedMultiplier;
  const targetCenterOffsetY = rawTargetCenterOffsetY * normalizedMultiplier;
  const noDownwardTurnsDistanceLimit = adaptiveProfile.noDownwardTurns && adaptiveProfile.tier !== 'standard' ? 2000 : 1500;
  const constrainedCenterOffsetY = gameState.distance < noDownwardTurnsDistanceLimit
    ? Math.min(targetCenterOffsetY, 0)
    : targetCenterOffsetY;
  const centerOffsetLerp = Math.min(1, delta * Math.max(1, adaptiveProfile.centerOffsetSmoothing || 1));

  return {
    targetCenterOffsetX,
    targetCenterOffsetY,
    constrainedCenterOffsetY,
    centerOffsetLerp,
    centerOffsetX: gameState.centerOffsetX + (targetCenterOffsetX - gameState.centerOffsetX) * centerOffsetLerp,
    centerOffsetY: gameState.centerOffsetY + (constrainedCenterOffsetY - gameState.centerOffsetY) * centerOffsetLerp
  };
}

export {
  calculateCenterOffsetStep
};
