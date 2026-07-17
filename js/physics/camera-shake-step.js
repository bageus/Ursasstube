function calculateCameraShakeStep({
  gameState,
  adaptiveProfile,
  config,
  delta,
  cameraShakeSmoothing,
  randomX = 0.5,
  randomY = 0.5
}) {
  const adaptiveTier = adaptiveProfile.tier;
  const suppressShake = adaptiveTier !== 'standard' && gameState.distance < 2000;

  let cameraShakeX = gameState.cameraShakeX;
  let cameraShakeY = gameState.cameraShakeY;

  if (suppressShake) {
    cameraShakeX = 0;
    cameraShakeY = 0;
  } else {
    const speedRatio = (gameState.speed - config.SPEED_START) / (config.SPEED_MAX - config.SPEED_START);
    const shakeLerp = Math.min(1, delta * cameraShakeSmoothing);
    const shakeIntensity = speedRatio > 0.3 ? (speedRatio - 0.3) * 4 : 0;
    const shakeTargetX = (randomX - 0.5) * shakeIntensity;
    const shakeTargetY = (randomY - 0.5) * shakeIntensity;
    cameraShakeX += (shakeTargetX - cameraShakeX) * shakeLerp;
    cameraShakeY += (shakeTargetY - cameraShakeY) * shakeLerp;
  }

  return {
    cameraShakeX,
    cameraShakeY,
    renderCenterOffsetX: gameState.centerOffsetX + cameraShakeX,
    renderCenterOffsetY: gameState.centerOffsetY + cameraShakeY
  };
}

export {
  calculateCameraShakeStep
};
