import { BACKEND_URL } from './config.js';
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
    this.tubeOverBudgetFrames = 0;
    this.tubeUnderBudgetFrames = 0;
    this.qualityLevels = ['low', 'normal', 'ultra'];
    this.tubeBudgetMs = {
      ultra: 5.2,
      normal: 4.4,
      low: 3.6
    };
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
    const currentQuality = this.qualityLevels.includes(gameState.renderQuality) ? gameState.renderQuality : 'normal';
    const tubeMs = Number(gameState.debugStats?.tubeMs || 0);
    const budget = this.tubeBudgetMs[currentQuality] || this.tubeBudgetMs.normal;
    const degradeThreshold = budget * 1.18;
    const upgradeThreshold = budget * 0.72;

    if (tubeMs > degradeThreshold) {
      this.tubeOverBudgetFrames += 1;
      this.tubeUnderBudgetFrames = 0;
    } else if (tubeMs < upgradeThreshold) {
      this.tubeUnderBudgetFrames += 1;
      this.tubeOverBudgetFrames = 0;
    } else {
      this.tubeOverBudgetFrames = Math.max(0, this.tubeOverBudgetFrames - 1);
      this.tubeUnderBudgetFrames = Math.max(0, this.tubeUnderBudgetFrames - 1);
    }

    if (this.qualityCooldown > 0) {
      this.qualityCooldown -= 1;
      return;
    }

    const qualityIndex = this.qualityLevels.indexOf(currentQuality);
    if (this.tubeOverBudgetFrames >= 8 && qualityIndex > 0) {
      gameState.renderQuality = this.qualityLevels[qualityIndex - 1];
      gameState.lowFpsStreak += 1;
      gameState.highFpsStreak = 0;
      this.tubeOverBudgetFrames = 0;
      this.tubeUnderBudgetFrames = 0;
      this.qualityCooldown = 45;
      return;
    }

    if (this.tubeUnderBudgetFrames >= 90 && qualityIndex < this.qualityLevels.length - 1) {
      gameState.renderQuality = this.qualityLevels[qualityIndex + 1];
      gameState.highFpsStreak += 1;
      gameState.lowFpsStreak = 0;
      this.tubeOverBudgetFrames = 0;
      this.tubeUnderBudgetFrames = 0;
      this.qualityCooldown = 90;
      return;
    }
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
