import { CONFIG } from './config.js';
import { gameState, player, obstacles, bonuses, coins, spinTargets } from './state.js';
import { SNAPSHOT_SCHEMA_VERSION } from './render-snapshot-contract.js';

const LAMP_SPACING_METERS = 10;
const LAMP_VISIBLE_COUNT = 2;
const LAMP_Z_SPACING = (LAMP_SPACING_METERS * CONFIG.SPEED_START * 16) / (300 * CONFIG.SPEED_START);
const LAMP_NEAR_Z = 0.2;
const LAMP_TOP_ANGLE = Math.PI;

/**
 * @typedef {'canvas'|'phaser'} RenderBackend
 */

/**
 * @typedef {Object} RenderViewportSnapshot
 * @property {number} width
 * @property {number} height
 * @property {number} dpr
 * @property {number} centerX
 * @property {number} centerY
 */

/**
 * @typedef {Object} RenderTubeSnapshot
 * @property {number} rotation
 * @property {number} scroll
 * @property {number} waveMod
 * @property {number} curveAngle
 * @property {number} curveStrength
 * @property {number} curveDirection
 * @property {number} centerOffsetX
 * @property {number} centerOffsetY
 * @property {number} speed
 * @property {'high'|'medium'|'low'} quality
 */

/**
 * @typedef {Object} RenderPlayerSnapshot
 * @property {number} lane
 * @property {number} targetLane
 * @property {number} lanePrev
 * @property {number} laneAnimFrame
 * @property {boolean} isLaneTransition
 * @property {string} state
 * @property {number} frameIndex
 * @property {boolean} shield
 * @property {number} shieldCount
 * @property {boolean} magnetActive
 * @property {number} magnetTimer
 * @property {boolean} invertActive
 * @property {number} invertTimer
 * @property {boolean} spinActive
 * @property {number} spinProgress
 */

/**
 * @typedef {Object} RenderFxSnapshot
 * @property {string} bonusText
 * @property {number} bonusTextTimer
 * @property {number} x2Timer
 * @property {number} spinCooldown
 * @property {number} spinAlertLevel
 * @property {number} spinAlertTimer
 * @property {number} spinAlertCountdown
 * @property {number} spinAlertPendingDelay
 * @property {number} spinRingPendingCount
 * @property {boolean} perfectSpinWindow
 * @property {number} perfectSpinWindowTimer
 * @property {number} spinComboCount
 * @property {boolean} spinComboRingActive
 * @property {boolean} radarActive
 * @property {Array<unknown>} radarHints
 */

/**
 * Canonical render payload passed from gameplay logic to any renderer backend.
 * Snapshot ownership rules:
 * - gameplay (`state.js` + `physics.js`) computes all gameplay-significant values;
 * - renderers consume this payload as read-only data;
 * - renderer-side calculations are limited to pure visual transforms only.
 *
 * @param {{width:number, height:number, dpr?:number}} viewport
 */
export function createRenderSnapshot(viewport) {
  const width = Number.isFinite(viewport?.width) ? viewport.width : 0;
  const height = Number.isFinite(viewport?.height) ? viewport.height : 0;
  const dpr = Number.isFinite(viewport?.dpr) ? viewport.dpr : Math.min(window.devicePixelRatio || 1, 3);

  const lamps = [];
  const distance = gameState.distance || 0;
  const metersPhase = ((distance % LAMP_SPACING_METERS) + LAMP_SPACING_METERS) % LAMP_SPACING_METERS;
  const metersToNextLamp = LAMP_SPACING_METERS - metersPhase;

  for (let lampOrder = 0; lampOrder < LAMP_VISIBLE_COUNT; lampOrder += 1) {
    const lampDistanceMeters = metersToNextLamp + lampOrder * LAMP_SPACING_METERS;
    const lampDepthUnits = lampDistanceMeters / LAMP_SPACING_METERS;
    const lampZ = LAMP_NEAR_Z + lampDepthUnits * LAMP_Z_SPACING;
    if (lampZ >= 2) continue;
    const lampIndex = Math.floor((distance + lampDistanceMeters) / LAMP_SPACING_METERS);
    lamps.push({
      z: lampZ,
      angle: LAMP_TOP_ANGLE,
      radiusFactor: 1,
      index: lampIndex,
    });
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    backend: /** @type {RenderBackend} */ ('phaser'),
    viewport: {
      width,
      height,
      dpr,
      centerX: width / 2,
      centerY: height / 2
    },
    tube: {
      rotation: gameState.tubeRotation,
      scroll: gameState.tubeScroll,
      waveMod: gameState.tubeWaveMod,
      curveAngle: gameState.tubeCurveAngle,
      curveStrength: gameState.tubeCurveStrength,
      curveDirection: gameState.curveDirection,
      centerOffsetX: gameState.centerOffsetX,
      centerOffsetY: gameState.centerOffsetY,
      speed: gameState.speed,
      quality: gameState.renderQuality
    },
    player: {
      lane: player.lane,
      targetLane: player.targetLane,
      lanePrev: player.lanePrev,
      laneAnimFrame: player.laneAnimFrame,
      isLaneTransition: player.isLaneTransition,
      state: player.state,
      frameIndex: player.frameIndex,
      shield: player.shield,
      shieldCount: player.shieldCount,
      magnetActive: player.magnetActive,
      magnetTimer: player.magnetTimer,
      invertActive: player.invertActive,
      invertTimer: player.invertTimer,
      spinActive: gameState.spinActive,
      spinProgress: gameState.spinProgress
    },
    obstacles: obstacles.map((item) => ({
      lane: item.lane,
      z: item.z,
      type: item.type ?? null,
      subtype: item.subtype ?? null,
      variant: item.variant ?? null,
      animFrame: item.animFrame ?? 0,
      size: item.size ?? null,
      passed: Boolean(item.passed)
    })),
    bonuses: bonuses.map((item) => ({
      lane: item.lane,
      z: item.z,
      type: item.type,
      animFrame: item.animFrame ?? 0,
      size: item.size ?? null,
      active: Boolean(item.active ?? true)
    })),
    coins: coins.map((item) => ({
      lane: item.lane,
      z: item.z,
      angle: item.angle ?? null,
      radiusFactor: item.radiusFactor ?? null,
      spinOnly: Boolean(item.spinOnly),
      animFrame: item.animFrame ?? 0,
      type: item.type ?? 'silver',
      collected: Boolean(item.collected)
    })),
    spinTargets: spinTargets.map((item) => ({
      lane: item.lane,
      z: item.z,
      angle: item.angle ?? null,
      radiusFactor: item.radiusFactor ?? null,
      collected: Boolean(item.collected),
      kind: item.kind ?? 'spin'
    })),
    lamps,
    fx: {
      bonusText: gameState.bonusText,
      bonusTextTimer: gameState.bonusTextTimer,
      x2Timer: gameState.x2Timer,
      spinCooldown: gameState.spinCooldown,
      spinAlertLevel: gameState.spinAlertLevel,
      spinAlertTimer: gameState.spinAlertTimer,
      spinAlertCountdown: gameState.spinAlertCountdown,
      spinAlertPendingDelay: gameState.spinAlertPendingDelay,
      spinRingPendingCount: gameState.spinRingPendingCount,
      perfectSpinWindow: gameState.perfectSpinWindow,
      perfectSpinWindowTimer: gameState.perfectSpinWindowTimer,
      spinComboCount: gameState.spinComboCount,
      spinComboRingActive: gameState.spinComboRingActive,
      radarActive: gameState.radarActive,
      radarHints: gameState.radarHints,
      collectAnimations: (gameState.collectAnimations || []).map((effect) => ({
        id: effect.id,
        kind: effect.kind,
        x: effect.x,
        y: effect.y,
        timer: effect.timer
      }))
    },
    runtime: {
      distance: gameState.distance,
      score: gameState.score,
      baseMultiplier: gameState.baseMultiplier,
      invertScoreMultiplier: gameState.invertScoreMultiplier,
      silverCoins: gameState.silverCoins,
      goldCoins: gameState.goldCoins,
      config: {
        lanes: CONFIG.LANES.slice(),
        playerZ: CONFIG.PLAYER_Z,
        tubeRadius: CONFIG.TUBE_RADIUS,
        playerOffset: CONFIG.PLAYER_OFFSET
      }
    }
  };
}
