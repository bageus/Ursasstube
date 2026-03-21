import { CONFIG } from '../../config.js';

const tubeStyleCache = {
  bevelLight: [],
  bevelDark: [],
  grout: [],
  innerShadow: [],
  rimLight: []
};

function updateTubeStyleCache() {
  const maxDepth = CONFIG.TUBE_DEPTH_STEPS;
  tubeStyleCache.bevelLight.length = maxDepth;
  tubeStyleCache.bevelDark.length = maxDepth;
  tubeStyleCache.grout.length = maxDepth;
  tubeStyleCache.innerShadow.length = maxDepth;
  tubeStyleCache.rimLight.length = maxDepth;

  for (let d = 0; d < maxDepth; d++) {
    const bevelDepthFade = Math.max(0.26, 1 - d / CONFIG.TUBE_DEPTH_STEPS);
    tubeStyleCache.bevelLight[d] = `rgba(255, 225, 235, ${(0.24 * bevelDepthFade).toFixed(3)})`;
    tubeStyleCache.bevelDark[d] = `rgba(10, 0, 14, ${(0.32 * bevelDepthFade).toFixed(3)})`;
    tubeStyleCache.grout[d] = `rgba(6, 0, 8, ${(0.26 * bevelDepthFade).toFixed(3)})`;
    tubeStyleCache.innerShadow[d] = `rgba(0, 0, 0, ${(0.15 * bevelDepthFade).toFixed(3)})`;
    tubeStyleCache.rimLight[d] = `rgba(255, 180, 210, ${(0.12 * bevelDepthFade).toFixed(3)})`;
  }
}

updateTubeStyleCache();

class CanvasTubeBackend {
  constructor(ctx) {
    this.ctx = ctx;
  }

  resize() {}

  draw(model) {
    const { ctx } = this;
    for (const quad of model.quads) {
      const [x1, y1, x2, y2, x3, y3, x4, y4] = quad.points;
      ctx.fillStyle = quad.fillStyle;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();

      if (!model.lowQuality) {
        const bevelLightStyle = tubeStyleCache.bevelLight[quad.depthIndex];
        const bevelDarkStyle = tubeStyleCache.bevelDark[quad.depthIndex];
        const groutStyle = tubeStyleCache.grout[quad.depthIndex];
        const innerShadowStyle = tubeStyleCache.innerShadow[quad.depthIndex];
        const rimLightStyle = tubeStyleCache.rimLight[quad.depthIndex];

        ctx.strokeStyle = bevelLightStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x4, y4);
        ctx.stroke();

        ctx.strokeStyle = bevelDarkStyle;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.moveTo(x4, y4);
        ctx.lineTo(x3, y3);
        ctx.stroke();

        ctx.strokeStyle = groutStyle;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.stroke();

        const inset = 0.24;
        const ix1 = x1 + (x3 - x1) * inset;
        const iy1 = y1 + (y3 - y1) * inset;
        const ix2 = x2 + (x4 - x2) * inset;
        const iy2 = y2 + (y4 - y2) * inset;
        const ix3 = x3 + (x1 - x3) * inset;
        const iy3 = y3 + (y1 - y3) * inset;
        const ix4 = x4 + (x2 - x4) * inset;
        const iy4 = y4 + (y2 - y4) * inset;
        ctx.fillStyle = innerShadowStyle;
        ctx.beginPath();
        ctx.moveTo(ix1, iy1);
        ctx.lineTo(ix2, iy2);
        ctx.lineTo(ix3, iy3);
        ctx.lineTo(ix4, iy4);
        ctx.closePath();
        ctx.fill();

        const rimInset = 0.08;
        const rx1 = x1 + (x3 - x1) * rimInset;
        const ry1 = y1 + (y3 - y1) * rimInset;
        const rx2 = x2 + (x4 - x2) * rimInset;
        const ry2 = y2 + (y4 - y2) * rimInset;
        const rx3 = x3 + (x1 - x3) * rimInset;
        const ry3 = y3 + (y1 - y3) * rimInset;
        const rx4 = x4 + (x2 - x4) * rimInset;
        const ry4 = y4 + (y2 - y4) * rimInset;
        ctx.strokeStyle = rimLightStyle;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.lineTo(rx3, ry3);
        ctx.lineTo(rx4, ry4);
        ctx.closePath();
        ctx.stroke();
      }

      if (quad.shadowAlpha > 0) {
        ctx.fillStyle = `rgba(0,0,0,${quad.shadowAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.fill();
      }

      if (!model.lowQuality && quad.glowAlpha > 0.01) {
        ctx.strokeStyle = `rgba(80,255,220,${quad.glowAlpha.toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }
}

export { CanvasTubeBackend };
