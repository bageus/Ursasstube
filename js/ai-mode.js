import { CONFIG } from './config.js';
import { gameState, player, obstacles, bonuses, coins, spinTargets, inputQueue } from './state.js';
import { logger } from './logger.js';

const SETTINGS_STORAGE_KEY = 'ursas_ai_mode_settings_v1';

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  distance: 0,
  spinCount: 0,
  combo: false,
  priority: 'gold'
});

const aiState = {
  accessEnabled: false,
  settings: { ...DEFAULT_SETTINGS },
  runtime: {
    running: false,
    spinsUsed: 0,
    nextSpinDistance: 0,
    collectPriority: 'gold',
    nextCollectDecisionAt: 0
  },
  controlsBound: false
};

function readStoredSettings() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    return {
      enabled: Boolean(parsed.enabled),
      distance: Math.max(0, Number(parsed.distance) || 0),
      spinCount: Math.max(0, Number(parsed.spinCount) || 0),
      combo: Boolean(parsed.combo),
      priority: ['gold', 'silver', 'bonus', 'score', 'different'].includes(parsed.priority) ? parsed.priority : 'gold'
    };
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(aiState.settings));
}

function getEl(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function onlyDigits(raw = '') {
  return String(raw || '').replace(/\D+/g, '');
}

function enqueueAiLaneInput(dir) {
  const timestampMs = Date.now();
  inputQueue.push(dir);
  gameState.inputTimestampQueue.push(timestampMs);
  gameState.lastInputAtMs = timestampMs;
}

function triggerAiSpin() {
  if (gameState.spinCooldown > 0 || gameState.spinActive || player.isLaneTransition) return false;
  gameState.lastInputAtMs = Date.now();
  gameState.spinActive = true;
  gameState.spinProgress = 0;
  const reductionFrames = (gameState.spinCooldownReduction || 0) * 60;
  gameState.spinCooldown = Math.max(600, CONFIG.SPIN_COOLDOWN_TIME - reductionFrames);
  player.isSpin = true;
  return true;
}

function bindRulesControls() {
  if (aiState.controlsBound || typeof document === 'undefined') return;

  const enabledEl = getEl('aiModeEnabled');
  const distanceEl = getEl('aiDistanceInput');
  const spinEl = getEl('aiSpinInput');
  const comboEl = getEl('aiSpinComboEnabled');
  const blockEl = getEl('aiModeSettingsBlock');
  const radios = Array.from(document.querySelectorAll('input[name="aiPriority"]'));

  if (!enabledEl || !distanceEl || !spinEl || !comboEl || !blockEl || radios.length === 0) return;

  const applyDisabled = () => {
    blockEl.classList.toggle('rules-ai-disabled', !enabledEl.checked);
  };

  enabledEl.addEventListener('change', () => {
    aiState.settings.enabled = Boolean(enabledEl.checked);
    applyDisabled();
    persistSettings();
  });

  distanceEl.addEventListener('input', () => {
    distanceEl.value = onlyDigits(distanceEl.value);
    aiState.settings.distance = Math.max(0, Number(distanceEl.value) || 0);
    persistSettings();
  });

  spinEl.addEventListener('input', () => {
    spinEl.value = onlyDigits(spinEl.value);
    aiState.settings.spinCount = Math.max(0, Number(spinEl.value) || 0);
    persistSettings();
  });

  comboEl.addEventListener('change', () => {
    aiState.settings.combo = Boolean(comboEl.checked);
    persistSettings();
  });

  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        aiState.settings.priority = radio.value;
        persistSettings();
      }
    });
  });

  aiState.controlsBound = true;
}

function syncRulesControls() {
  const section = getEl('rulesAiSection');
  if (section) {
    section.hidden = !aiState.accessEnabled;
  }
  if (!aiState.accessEnabled) return;

  bindRulesControls();
  const enabledEl = getEl('aiModeEnabled');
  const distanceEl = getEl('aiDistanceInput');
  const spinEl = getEl('aiSpinInput');
  const comboEl = getEl('aiSpinComboEnabled');
  const blockEl = getEl('aiModeSettingsBlock');
  const activeRadio = typeof document !== 'undefined'
    ? document.querySelector(`input[name="aiPriority"][value="${aiState.settings.priority}"]`)
    : null;

  if (enabledEl) enabledEl.checked = Boolean(aiState.settings.enabled);
  if (distanceEl) distanceEl.value = String(Math.max(0, Number(aiState.settings.distance) || 0));
  if (spinEl) spinEl.value = String(Math.max(0, Number(aiState.settings.spinCount) || 0));
  if (comboEl) comboEl.checked = Boolean(aiState.settings.combo);
  if (activeRadio) activeRadio.checked = true;
  if (blockEl) blockEl.classList.toggle('rules-ai-disabled', !aiState.settings.enabled);
}

function resolveAccessFromEffects(effects = null) {
  if (!effects || typeof effects !== 'object') return false;
  return Boolean(
    effects.ai_mode_access
    || effects.aiModeAccess
    || effects.ai_mode_enabled
    || effects.aiModeEnabled
    || effects.ai_whitelisted
    || effects.aiWhitelisted
  );
}

function updateAiAccessFromBackendPayload(payload = null) {
  const effects = payload?.activeEffects || null;
  aiState.accessEnabled = resolveAccessFromEffects(effects);
  syncRulesControls();
}

function initAiMode() {
  aiState.settings = readStoredSettings();
  syncRulesControls();
}

function scheduleNextSpinDistance(currentDistance) {
  const step = 120 + Math.random() * 260;
  aiState.runtime.nextSpinDistance = currentDistance + step;
}

function beginAiRun() {
  aiState.runtime.running = aiState.accessEnabled && aiState.settings.enabled;
  aiState.runtime.spinsUsed = 0;
  aiState.runtime.collectPriority = aiState.settings.priority;
  aiState.runtime.nextCollectDecisionAt = 0;
  scheduleNextSpinDistance(gameState.distance || 0);

  if (aiState.runtime.running) {
    logger.info('🤖 AI mode active for this run', { settings: aiState.settings });
  }
}

function finishAiRun() {
  aiState.runtime.running = false;
}

function getPriorityLane(priority = 'gold') {
  const visibleMinZ = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 1.3;
  const visibleMaxZ = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 5.6;
  const scoreBonusTypes = new Set(['score_300', 'score_500']);

  const source = (() => {
    if (priority === 'gold') return coins.filter((c) => c.type === 'gold' || c.type === 'gold_spin');
    if (priority === 'silver') return coins.filter((c) => c.type === 'silver');
    if (priority === 'bonus') return bonuses;
    if (priority === 'score') return bonuses.filter((b) => scoreBonusTypes.has(b.type));
    return [...coins, ...bonuses];
  })();

  const candidates = source
    .filter((entry) => typeof entry.lane === 'number' && entry.z >= visibleMinZ && entry.z <= visibleMaxZ)
    .sort((a, b) => a.z - b.z);

  if (candidates.length === 0) return null;
  if (priority === 'different') {
    return candidates[Math.floor(Math.random() * candidates.length)]?.lane ?? null;
  }
  return candidates[0]?.lane ?? null;
}

function hasObstacleInLane(lane, zMin, zMax) {
  return obstacles.some((o) => (
    (Number(o.spawnDelayRemaining) || 0) <= 0
    && o.lane === lane
    && o.z >= zMin
    && o.z <= zMax
  ));
}

function getCollectionChance(priority = 'gold') {
  const table = {
    gold: 0.52,
    silver: 0.38,
    bonus: 0.48,
    score: 0.42,
    different: 0.4
  };
  return table[priority] ?? 0.42;
}

function chooseSafeLane() {
  const lookaheadMin = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 0.6;
  const lookaheadMax = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 6.8;
  const byLane = new Map([[-1, 0], [0, 0], [1, 0]]);

  obstacles.forEach((o) => {
    if ((Number(o.spawnDelayRemaining) || 0) > 0) return;
    if (typeof o.lane !== 'number') return;
    if (o.z < lookaheadMin || o.z > lookaheadMax) return;
    const proximityWeight = 1 / Math.max(0.08, o.z - CONFIG.PLAYER_Z);
    byLane.set(o.lane, (byLane.get(o.lane) || 0) + proximityWeight);
  });

  return [-1, 0, 1]
    .map((lane) => ({ lane, risk: byLane.get(lane) || 0 }))
    .sort((a, b) => a.risk - b.risk)[0]?.lane ?? player.lane;
}

function shouldSpinNow(spinAlertLevel = 0) {
  if (aiState.runtime.spinsUsed >= aiState.settings.spinCount) return false;
  if (gameState.spinCooldown > 0 || gameState.spinActive || player.isLaneTransition || inputQueue.length > 1) return false;

  const nextTarget = spinTargets
    .filter((t) => !t.collected)
    .sort((a, b) => a.z - b.z)[0];

  if (aiState.settings.combo && nextTarget) {
    const strictWindow = spinAlertLevel >= 2
      ? CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 3.8
      : CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 2.6;
    return nextTarget.z <= strictWindow;
  }

  if ((gameState.distance || 0) >= aiState.runtime.nextSpinDistance) {
    return spinAlertLevel >= 1 ? Math.random() > 0.2 : Math.random() > 0.45;
  }

  return false;
}

function updateAiControl() {
  if (!aiState.runtime.running || !gameState.running) return;

  const radarActive = Boolean(gameState.radarActive);
  const radarObstaclesActive = Boolean(gameState.radarObstaclesActive);
  const spinAlertLevel = Math.max(0, Number(gameState.spinAlertLevel) || 0);
  const distanceTarget = Math.max(0, Number(aiState.settings.distance) || 0);
  const distanceGuardActive = distanceTarget > 0 && gameState.distance < distanceTarget;
  const obstacleVisionEnabled = distanceGuardActive && radarObstaclesActive;
  const collectVisionEnabled = distanceGuardActive && radarActive;

  if (shouldSpinNow(spinAlertLevel)) {
    if (triggerAiSpin()) {
      aiState.runtime.spinsUsed += 1;
      scheduleNextSpinDistance(gameState.distance || 0);
    }
  }

  const emergencyMin = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 0.1;
  const emergencyMax = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 5.4;
  const proactiveMin = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 0.8;
  const proactiveMax = CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 7.8;
  const imminentCollision = hasObstacleInLane(player.lane, emergencyMin, emergencyMax);
  const proactiveCollision = hasObstacleInLane(player.lane, proactiveMin, proactiveMax);

  if (imminentCollision || proactiveCollision) {
    const safeLane = chooseSafeLane();
    if (safeLane !== player.lane) {
      inputQueue.length = 0;
      gameState.inputTimestampQueue.length = 0;
      enqueueAiLaneInput(safeLane > player.lane ? 1 : -1);
    }
    return;
  }

  const nowMs = Date.now();
  if (!collectVisionEnabled || player.isLaneTransition || inputQueue.length > 0) return;
  if (nowMs < aiState.runtime.nextCollectDecisionAt) return;
  const preferredLane = getPriorityLane(aiState.runtime.collectPriority);
  const collectionRollPassed = Math.random() < getCollectionChance(aiState.runtime.collectPriority);
  if (typeof preferredLane === 'number' && preferredLane !== player.lane && collectionRollPassed) {
    const laneUnsafeForCollect = hasObstacleInLane(
      preferredLane,
      CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 0.7,
      CONFIG.PLAYER_Z + CONFIG.TUBE_Z_STEP * 6.6
    );
    if (laneUnsafeForCollect) return;
    const desiredDirection = preferredLane > player.lane ? 1 : -1;
    enqueueAiLaneInput(desiredDirection);
    aiState.runtime.nextCollectDecisionAt = nowMs + 170 + Math.floor(Math.random() * 210);
  } else if (!obstacleVisionEnabled && Math.random() < 0.004) {
    enqueueAiLaneInput(Math.random() > 0.5 ? 1 : -1);
    aiState.runtime.nextCollectDecisionAt = nowMs + 150 + Math.floor(Math.random() * 160);
  }
}

export {
  initAiMode,
  syncRulesControls,
  updateAiAccessFromBackendPayload,
  beginAiRun,
  finishAiRun,
  updateAiControl
};
