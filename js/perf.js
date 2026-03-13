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

    const fps = this.avgFps || this.fps;

    if (fps < 40) {
      gameState.lowFpsStreak++;
      gameState.highFpsStreak = 0;
    } else if (fps > 56) {
      gameState.highFpsStreak++;
      gameState.lowFpsStreak = 0;
    } else {
      gameState.lowFpsStreak = 0;
      gameState.highFpsStreak = 0;
    }

    if (this.qualityCooldown > 0) {
      this.qualityCooldown--;
      return;
    }

    if (gameState.renderQuality === 'high' && gameState.lowFpsStreak >= 3) {
      gameState.renderQuality = 'low';
      gameState.lowFpsStreak = 0;
      this.qualityCooldown = 5;
      console.log('⚡ Adaptive quality: LOW');
    } else if (gameState.renderQuality === 'low' && gameState.highFpsStreak >= 4) {
      gameState.renderQuality = 'high';
      gameState.highFpsStreak = 0;
      this.qualityCooldown = 6;
      console.log('✨ Adaptive quality: HIGH');
    }
  }

  updateFpsUI() {
    const el = document.getElementById('fpsVal');
    el.textContent = this.fps;
    el.classList.remove('slow', 'critical');
    if (this.fps < 30) el.classList.add('critical');
    else if (this.fps < 45) el.classList.add('slow');
  }

  async measurePing() {
    try {
      const start = performance.now();
      await fetch(`${BACKEND_URL}/health`, { method: 'GET', cache: 'no-store' });
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

