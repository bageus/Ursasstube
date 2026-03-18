import { ctx } from './state.js';

/* ===== PARTICLE SYSTEM ===== */
class Particle {
  constructor(x, y, vx, vy, color, life = 30) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life; this.age = 0;
    this.size = 5; this.active = true;
  }

  update() {
    if (!this.active) return false;
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2;
    this.age++;
    if (this.age >= this.life) { this.active = false; return false; }
    return true;
  }

  draw(context) {
    if (!this.active) return;
    const alpha = 1 - (this.age / this.life);
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = this.color;
    context.beginPath();
    context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  reset(x, y, vx, vy, color, life) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color; this.life = life;
    this.age = 0; this.size = 5; this.active = true;
  }
}

class ParticlePool {
  constructor(maxParticles = 300) {
    this.maxParticles = maxParticles;
    this.particles = [];
    this.activeIndex = 0;
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push(new Particle(0, 0, 0, 0, "white", 30));
    }
  }

  spawn(x, y, color, count = 8, speed = 5) {
    if (!isFinite(x) || !isFinite(y)) return;
    for (let i = 0; i < count; i++) {
      const idx = (this.activeIndex + i) % this.maxParticles;
      const angle = (Math.PI * 2 * i) / count;
      this.particles[idx].reset(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, 30);
    }
    this.activeIndex = (this.activeIndex + count) % this.maxParticles;
  }

  update() {
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].active) this.particles[i].update();
    }
  }

  draw(context) {
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i].active) this.particles[i].draw(context);
    }
  }

  clear() {
    for (let i = 0; i < this.particles.length; i++) this.particles[i].active = false;
    this.activeIndex = 0;
  }
}

const particlePool = new ParticlePool(300);

function spawnParticles(x, y, color, count = 8, speed = 5) { particlePool.spawn(x, y, color, count, speed); }
function updateParticles() { particlePool.update(); }
function drawParticles() { particlePool.draw(ctx); }


Object.assign(window, { particlePool, spawnParticles, updateParticles, drawParticles });

export { particlePool, spawnParticles, updateParticles, drawParticles };
