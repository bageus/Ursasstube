import { BACKEND_DISABLED, BACKEND_URL, isMobile } from './config.js';
import { request } from './request.js';
import { gameState } from './state.js';

/* ===== PERFORMANCE MONITOR ===== */
class PerformanceMonitor {
  constructor() {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.avgFps = 60;
    this.fpsHistory = [];
    this.lastPingTime = 0;
    this.currentPing = 0;
    this.qualityCooldown = 0;
  }

  updateFPS() {
    const now = performance.now();
    const dt = now - this.lastTime;

    if (dt >= 1000) {
      this.fps = Math.round(this.frameCount * 1000 / dt);
      this.fpsHistory.push(this.fps);
      if (this.fpsHistory.length > 10) this.fpsHistory.shift();
      this.avgFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
      this.frameCount = 0;
      this.lastTime = now;
      this.updateFpsUI();
      this.updateAdaptiveQuality();
    }

    this.frameCount++;
  }

  updateAdaptiveQuality() {
    if (!gameState || !gameState.running) return;

    // Keep visual quality stable while still honoring Stage 4 quality presets.
    gameState.renderQuality = isMobile ? 'medium' : 'high';
    gameState.lowFpsStreak = 0;
    gameState.highFpsStreak = 0;
    this.qualityCooldown = 0;
  }

  updateFpsUI() {
    const el = document.getElementById('fpsVal');
    const renderStatsEl = document.getElementById('renderStatsVal');
    el.textContent = this.fps;
    el.classList.remove('slow', 'critical');
    if (this.fps < 30) el.classList.add('critical');
    else if (this.fps < 45) el.classList.add('slow');
    if (renderStatsEl && gameState?.debugStats) {
      const {
        tubeQuads,
        visibleObstacles,
        visibleBonuses,
        visibleCoins,
        visibleSpinTargets,
        estimatedTubePasses,
        tubeMs,
        drawMs,
        updateMs,
        uiMs,
        frameMs
      } = gameState.debugStats;
      const renderCounts = `${tubeQuads}q ${estimatedTubePasses}p · O${visibleObstacles} B${visibleBonuses} C${visibleCoins} T${visibleSpinTargets}`;
      const frameBreakdown = `Frame ${frameMs.toFixed(1)}ms · tube ${tubeMs.toFixed(1)} · draw ${drawMs.toFixed(1)} · upd ${updateMs.toFixed(1)} · ui ${uiMs.toFixed(1)}`;
      renderStatsEl.textContent = `${renderCounts} | ${frameBreakdown}`;
    }
  }

  async measurePing() {
    if (BACKEND_DISABLED) {
      this.currentPing = 0;
      this.updatePingUI();
      return;
    }

    try {
      const start = performance.now();
      await request(`${BACKEND_URL}/health`, { method: 'GET', cache: 'no-store' });
      this.currentPing = Math.round(performance.now() - start);
      this.updatePingUI();
    } catch (e) {
      console.warn("⚠️ Ping measurement failed:", e);
      this.currentPing = 0;
    }
  }

  updatePingUI() {
    const display = document.getElementById('pingDisplay');
    const val = document.getElementById('pingVal');
    display.style.display = 'block';
    val.textContent = this.currentPing;
    val.classList.remove('slow', 'critical');
    if (this.currentPing > 200) val.classList.add('critical');
    else if (this.currentPing > 100) val.classList.add('slow');
  }
}

const perfMonitor = new PerformanceMonitor();



export { PerformanceMonitor, perfMonitor };
