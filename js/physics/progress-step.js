const METERS_PER_SECOND_MULT = 300;

function calculateProgressStep({
  distance,
  delta,
  speedStart,
  speedIncrementInterval,
  speedIncrementBoostDistance,
  speedIncrementBoostMultiplier,
  speedIncrement,
  speedMax,
  invertActive = false,
  invertScoreMultiplier = 1
}) {
  const speedLevel = Math.floor(distance / speedIncrementInterval);
  const speedIncrementMultiplier = distance >= speedIncrementBoostDistance
    ? speedIncrementBoostMultiplier
    : 1;
  const speed = Math.min(
    speedStart + speedLevel * speedIncrement * speedIncrementMultiplier,
    speedMax
  );
  const metersDelta = speed * METERS_PER_SECOND_MULT * delta;
  const speedFactor = speed / speedStart;
  let pointsPerMeter = speedFactor;
  if (invertActive && invertScoreMultiplier > 1) {
    pointsPerMeter *= invertScoreMultiplier;
  }

  return {
    speedLevel,
    speedIncrementMultiplier,
    speed,
    metersDelta,
    pointsPerMeter,
    scoreDelta: metersDelta * pointsPerMeter
  };
}

export {
  calculateProgressStep
};
