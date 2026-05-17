import { buildBackendUrl } from './config.js';
import { request } from './request.js';
import { gameState } from './state.js';
import { logger } from './logger.js';
import { PERF_SAMPLE_EVENT } from './core/runtime.js';
import { isMobileLightRuntime, isTelegramRuntime } from './config.js';
import { CONFIG } from './config.js';

/**
 * LOW_PERF_MODE – detected once at module load time.
 * True on mobile devices or machines with ≤4 hardware threads.
 * Used to reduce particle/ray counts and enable rendering shortcuts.
 */
const LOW_PERF_MODE = (typeof navigator !== 'undefined') && (
  (navigator.hardwareConcurrency ?? Infinity) <= 4 ||
  /Mobi|Android|iPhone/i.test(navigator.userAgent || '') ||
  (typeof window !== 'undefined' && window.innerWidth < 600)
);

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
    this.lastQualityChangeAt = 0;
    this.thirtyFpsCapStreak = 0;
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
      this.detectPossibleFpsCap();
      this.publishPerfSample();
    }

    this.frameCount++;
  }

  detectPossibleFpsCap() {
    const frameMs = Number(gameState?.debugStats?.frameMs) || 0;
    const looksLikeThirtyCap = this.fps >= 28 && this.fps <= 32 && frameMs > 0 && frameMs < 22;
    this.thirtyFpsCapStreak = looksLikeThirtyCap ? this.thirtyFpsCapStreak + 1 : 0;
    if (this.thirtyFpsCapStreak === 5) {
      logger.warn('⚠️ FPS appears capped around 30 by environment/VSync (WebView power mode, background throttling, or display limit).');
    }
  }

  updateAdaptiveQuality() {
    if (!gameState || !gameState.running) return;
    const isMobileLike = isTelegramRuntime || isMobileLightRuntime;
    const now = performance.now();
    const cooldownMs = 6000;

    if (!isMobileLike) {
      gameState.renderQuality = 'high';
      gameState.heavyRenderEnabled = true;
      gameState.lowFpsStreak = 0;
      gameState.highFpsStreak = 0;
      return;
    }

    if (!['low', 'medium', 'high'].includes(gameState.renderQuality)) {
      gameState.renderQuality = isTelegramRuntime ? 'medium' : 'high';
    }
    if (isTelegramRuntime && gameState.renderQuality === 'high') {
      gameState.renderQuality = 'medium';
    }

    if (this.avgFps < 45) {
      gameState.lowFpsStreak = (gameState.lowFpsStreak || 0) + 1;
      gameState.highFpsStreak = 0;
    } else if (this.avgFps > 55) {
      gameState.highFpsStreak = (gameState.highFpsStreak || 0) + 1;
      gameState.lowFpsStreak = 0;
    } else {
      gameState.lowFpsStreak = 0;
      gameState.highFpsStreak = 0;
    }

    if (now - this.lastQualityChangeAt < cooldownMs) return;
    let nextQuality = gameState.renderQuality;

    if (gameState.lowFpsStreak >= 3) {
      nextQuality = gameState.renderQuality === 'high' ? 'medium' : 'low';
    } else if (gameState.highFpsStreak >= 8 && gameState.renderQuality !== 'high') {
      nextQuality = gameState.renderQuality === 'low' ? 'medium' : 'high';
    }

    if (nextQuality !== gameState.renderQuality) {
      gameState.renderQuality = nextQuality;
      gameState.heavyRenderEnabled = nextQuality !== 'low';
      this.lastQualityChangeAt = now;
      logger.info(`[perf] Adaptive quality -> ${nextQuality} (avgFps=${this.avgFps})`);
    } else {
      gameState.heavyRenderEnabled = gameState.renderQuality !== 'low';
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
      await request(buildBackendUrl('/health'), { method: 'GET', cache: 'no-store' });
      this.currentPing = Math.round(performance.now() - start);
      this.updatePingUI();
    } catch (e) {
      logger.warn("⚠️ Ping measurement failed:", e);
      this.currentPing = 0;
    }
  }

  updatePingUI() {
    const display = document.getElementById('pingDisplay');
    const val = document.getElementById('pingVal');
    if (!display || !val) return;
    display.style.display = 'block';
    val.textContent = this.currentPing;
    val.classList.remove('slow', 'critical');
    if (this.currentPing > 200) val.classList.add('critical');
    else if (this.currentPing > 100) val.classList.add('slow');
  }

  publishPerfSample() {
    const stats = gameState?.debugStats || {};
    const debugFpsEnabled = (() => {
      try {
        return window.localStorage?.getItem('DEBUG_FPS') === '1';
      } catch {
        return false;
      }
    })();
    if (debugFpsEnabled) {
      const frameMs = Number(stats.frameMs || 0);
      const possible30Cap = this.fps >= 28 && this.fps <= 32 && frameMs > 0 && frameMs < 22;
      logger.info(
        `[DEBUG_FPS] fps=${this.fps} avgFps=${this.avgFps} resolution=${window.devicePixelRatio || 1} renderQuality=${gameState?.renderQuality || 'unknown'} tubeSegments=${CONFIG.TUBE_SEGMENTS} tubeDepthSteps=${CONFIG.TUBE_DEPTH_STEPS} drawMs=${Number(stats.drawMs || 0).toFixed(1)} updateMs=${Number(stats.updateMs || 0).toFixed(1)} frameMs=${frameMs.toFixed(1)}${possible30Cap ? ' possible 30 cap' : ''}`
      );
    }
    window.dispatchEvent(new CustomEvent(PERF_SAMPLE_EVENT, {
      detail: {
        timestamp: Date.now(),
        fps: this.fps,
        avgFps: this.avgFps,
        pingMs: this.currentPing,
        running: Boolean(gameState?.running),
        debugStats: gameState?.debugStats || null
      }
    }));
  }
}

const perfMonitor = new PerformanceMonitor();



export { perfMonitor, LOW_PERF_MODE };
