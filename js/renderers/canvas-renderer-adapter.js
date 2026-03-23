import {
  resizeCanvas,
  drawTube,
  drawTubeDepth,
  drawTubeCenter,
  drawTubeBezel,
  drawSpeedLines,
  drawNeonLines,
  drawObjects,
  drawCoins,
  drawPlayer,
  drawRadarHints,
  drawSpinAlert,
  drawBonusText,
  getCanvasSize
} from '../renderer.js';
import { drawParticles } from '../particles.js';

function createCanvasRendererAdapter() {
  return {
    name: 'canvas',
    async init() {
      resizeCanvas();
      return true;
    },
    resize() {
      resizeCanvas();
    },
    render(_snapshot) {
      drawTube();
      drawTubeDepth();
      drawTubeCenter();
      drawTubeBezel();
      drawSpeedLines();
      drawNeonLines();
      drawObjects();
      drawCoins();
      drawPlayer();
      drawParticles();
      drawRadarHints();
      drawSpinAlert();
    },
    renderUi(_snapshot) {
      drawBonusText();
    },
    destroy() {}
  };
}

export { createCanvasRendererAdapter, getCanvasSize };
