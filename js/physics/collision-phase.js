const OBSTACLE_COLLISION_PHASE_WINDOW = Object.freeze({
  fence: { start: 28, end: 45 },
  bottles: { start: 28, end: 45 },
  rock1: { start: 35, end: 65 },
  rock2: { start: 35, end: 65 },
  bull: { start: 35, end: 65 },
  pit: { start: 35, end: 36 },
  spikes: { start: 35, end: 50 }
});

function isObstacleInCollisionPhase(subtype, z, zMin, zMax) {
  const window = OBSTACLE_COLLISION_PHASE_WINDOW[subtype];
  if (!window || !Number.isFinite(z) || !Number.isFinite(zMin) || !Number.isFinite(zMax) || zMax <= zMin) {
    return true;
  }
  const phasePercent = ((z - zMin) / (zMax - zMin)) * 100;
  return phasePercent >= window.start && phasePercent <= window.end;
}

export {
  OBSTACLE_COLLISION_PHASE_WINDOW,
  isObstacleInCollisionPhase
};
