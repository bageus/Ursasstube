function calculateCenterOffsetStep({
  curveDirection,
  tubeCurveStrength,
  tubeRadius,
  curveOffsetX,
  curveOffsetY,
  centerOffsetMultiplier,
  noDownwardTurns = false,
  tier = 'standard',
  distance,
  centerOffsetSmoothing,
  delta,
  centerOffsetX,
  centerOffsetY
}) {
  const normalizedMultiplier = Math.max(0, Number(centerOffsetMultiplier) || 0);
  const rawTargetCenterOffsetX = Math.cos(curveDirection) * tubeCurveStrength * tubeRadius * curveOffsetX;
  const rawTargetCenterOffsetY = Math.sin(curveDirection) * tubeCurveStrength * tubeRadius * curveOffsetY;
  const targetCenterOffsetX = rawTargetCenterOffsetX * normalizedMultiplier;
  const targetCenterOffsetY = rawTargetCenterOffsetY * normalizedMultiplier;
  const noDownwardTurnsDistanceLimit = noDownwardTurns && tier !== 'standard' ? 2000 : 1500;
  const constrainedCenterOffsetY = distance < noDownwardTurnsDistanceLimit
    ? Math.min(targetCenterOffsetY, 0)
    : targetCenterOffsetY;
  const centerOffsetLerp = Math.min(1, delta * Math.max(1, centerOffsetSmoothing || 1));

  return {
    targetCenterOffsetX,
    targetCenterOffsetY,
    constrainedCenterOffsetY,
    centerOffsetLerp,
    centerOffsetX: centerOffsetX + (targetCenterOffsetX - centerOffsetX) * centerOffsetLerp,
    centerOffsetY: centerOffsetY + (constrainedCenterOffsetY - centerOffsetY) * centerOffsetLerp
  };
}

export {
  calculateCenterOffsetStep
};
