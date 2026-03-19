import { gameState, player, inputQueue, coins, DOM, getLaneCooldown } from './state.js';
import { CONFIG } from './config.js';
import { audioManager } from './audio.js';
import { spawnParticles } from './particles.js';
import { collectCoin } from './physics.js';
import { showBonusText } from './ui.js';

/* ===== INPUT HANDLERS ===== */
function isInteractiveElement(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'LABEL' || tag === 'A' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (el.closest('button, a, input, label, .toggle-row, .game-audio-nav, .store-nav-btn, .go-audio-nav, .go-btn, .btn-new, .wallet-btn-corner, .link-btn, #audioTogglesGlobal')) return true;
  return false;
}

let touchStartX = 0;
let lastTap = 0;
let inputHandlersInitialized = false;

function initInputHandlers() {
  if (inputHandlersInitialized) return;

  document.addEventListener('touchstart', (e) => {
    if (isInteractiveElement(e.target)) return;
    touchStartX = e.touches[0].clientX;
    if (gameState.running) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!gameState.running) return;
    if (isInteractiveElement(e.target)) return;
    e.preventDefault();
    const diff = e.touches[0].clientX - touchStartX;
    if (Math.abs(diff) > 50) {
      let dir = diff < 0 ? -1 : 1;
      if (player.invertActive) dir = -dir;
      inputQueue.push(dir);
      touchStartX = e.touches[0].clientX;
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (isInteractiveElement(e.target)) return;
    if (gameState.running) e.preventDefault();
    const now = Date.now();
    if (now - lastTap < 300 && !gameState.spinActive && !player.isLaneTransition) {
      triggerSpin();
    }
    lastTap = now;
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (!gameState.running) return;
    if (e.code === 'ArrowLeft') {
      inputQueue.push(player.invertActive ? 1 : -1);
    } else if (e.code === 'ArrowRight') {
      inputQueue.push(player.invertActive ? -1 : 1);
    } else if (e.code === 'Space') {
      if (!gameState.spinActive && !player.isLaneTransition && gameState.spinCooldown <= 0) {
        triggerSpin();
      }
    }
  });

  inputHandlersInitialized = true;
}

function triggerSpin() {
  if (gameState.spinCooldown > 0 || gameState.spinActive || player.isLaneTransition || getLaneCooldown() > 0) return;

  // Perfect spin window — auto-collect coins near active ring
  if (gameState.perfectSpinWindow) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (c.collected) continue;
      if (c.isCircle && c.z >= CONFIG.PLAYER_Z - 0.4 && c.z <= CONFIG.PLAYER_Z + 0.4) {
        collectCoin(c);
        coins.splice(i, 1);
      }
    }
    gameState.perfectSpinWindow = false;
    gameState.perfectSpinWindowTimer = 0;
    showBonusText('✨ Perfect Spin!');
  }

  gameState.spinActive = true;
  gameState.spinProgress = 0;

  const reductionFrames = (gameState.spinCooldownReduction || 0) * 60;
  gameState.spinCooldown = Math.max(600, CONFIG.SPIN_COOLDOWN_TIME - reductionFrames);

  player.isSpin = true;
  audioManager.playSFX('spin');
  spawnParticles(DOM.canvas.width / 2, DOM.canvas.height / 2, 'rgba(200, 100, 255, 1)', 25, 10);
}

export { isInteractiveElement, initInputHandlers, triggerSpin };
