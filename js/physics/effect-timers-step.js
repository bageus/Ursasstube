function calculateEffectTimersStep({ player, gameState, delta }) {
  let spinCooldown = gameState.spinCooldown;
  let baseMultiplier = gameState.baseMultiplier;
  let x2Timer = gameState.x2Timer;
  let magnetActive = player.magnetActive;
  let magnetTimer = player.magnetTimer;
  let invertActive = player.invertActive;
  let invertTimer = player.invertTimer;

  if (spinCooldown > 0) spinCooldown--;

  if (magnetActive) {
    magnetTimer -= delta;
    if (magnetTimer <= 0) magnetActive = false;
  }

  if (invertActive) {
    invertTimer -= delta;
    if (invertTimer <= 0) invertActive = false;
  }

  if (baseMultiplier > 1) {
    x2Timer -= delta;
    if (x2Timer <= 0) baseMultiplier = 1;
  }

  return {
    player: {
      magnetActive,
      magnetTimer,
      invertActive,
      invertTimer
    },
    gameState: {
      spinCooldown,
      baseMultiplier,
      x2Timer
    }
  };
}

export {
  calculateEffectTimersStep
};
