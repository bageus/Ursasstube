/* ===== INPUT HANDLERS ===== */

let touchStartX = 0;

document.addEventListener("touchstart", e => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener("touchmove", e => {
  if (!gameState.running) return;
  const diff = e.touches[0].clientX - touchStartX;
  if (Math.abs(diff) > 50) {
    inputQueue.push(diff < 0 ? -1 : 1);
    touchStartX = e.touches[0].clientX;
  }
}, { passive: true });

let lastTap = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTap < 300 && !gameState.spinActive && !player.isLaneTransition) {
    triggerSpin();
  }
  lastTap = now;
}, { passive: true });

document.addEventListener("keydown", e => {
  if (!gameState.running) return;
  if (e.code === "ArrowLeft") {
    inputQueue.push(player.invertActive ? 1 : -1);
  } else if (e.code === "ArrowRight") {
    inputQueue.push(player.invertActive ? -1 : 1);
  } else if (e.code === "Space") {
    if (!gameState.spinActive && !player.isLaneTransition && gameState.spinCooldown <= 0) {
      triggerSpin();
    }
  }
});

function triggerSpin() {
  if (gameState.spinCooldown > 0 || gameState.spinActive || player.isLaneTransition || laneCooldown > 0) return;

  gameState.spinActive = true;
  gameState.spinProgress = 0;

  const reductionFrames = (gameState.spinCooldownReduction || 0) * 60;
  gameState.spinCooldown = Math.max(600, CONFIG.SPIN_COOLDOWN_TIME - reductionFrames);

  player.isSpin = true;
  audioManager.playSFX("spin");
  spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, "rgba(200, 100, 255, 1)", 25, 10);
}
