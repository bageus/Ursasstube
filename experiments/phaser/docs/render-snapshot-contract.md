# Render Snapshot Contract

## Purpose

`render snapshot` фиксирует границу между игровой логикой и визуальным слоем. Логика обновляет состояние в `js/state.js` и `js/physics.js`, а любой renderer (`canvas` сейчас, `phaser` позже) получает уже нормализованный снимок кадра без повторного вычисления gameplay-правил.

Текущая кодовая точка для сборки снапшота: `createRenderSnapshot(viewport)` в `js/render-snapshot.js`.

## Snapshot Shape

```js
{
  schemaVersion: 1,
  backend: 'canvas' | 'phaser',
  viewport: {
    width,
    height,
    dpr,
    centerX,
    centerY,
  },
  tube: {
    rotation,
    scroll,
    waveMod,
    curveAngle,
    curveStrength,
    curveDirection,
    centerOffsetX,
    centerOffsetY,
    speed,
    quality,
  },
  player: {
    lane,
    targetLane,
    lanePrev,
    laneAnimFrame,
    isLaneTransition,
    state,
    frameIndex,
    shield,
    shieldCount,
    magnetActive,
    magnetTimer,
    invertActive,
    invertTimer,
    spinActive,
    spinProgress,
  },
  obstacles: [{ lane, z, type, variant, passed }],
  bonuses: [{ lane, z, type, active }],
  coins: [{ lane, z, type, collected }],
  spinTargets: [{ lane, z, kind }],
  fx: {
    bonusText,
    bonusTextTimer,
    x2Timer,
    spinCooldown,
    spinAlertLevel,
    spinAlertTimer,
    spinAlertCountdown,
    spinAlertPendingDelay,
    spinRingPendingCount,
    perfectSpinWindow,
    perfectSpinWindowTimer,
    spinComboCount,
    spinComboRingActive,
    radarActive,
    radarHints,
  },
  runtime: {
    distance,
    score,
    baseMultiplier,
    invertScoreMultiplier,
    silverCoins,
    goldCoins,
    config: {
      lanes,
      playerZ,
      tubeRadius,
      playerOffset,
    }
  }
}
```

## Source-of-Truth Rules

Phaser не должен повторно вычислять значения ниже; он только интерпретирует их визуально:

- `tube.rotation`, `tube.scroll`, `tube.curveAngle`, `tube.curveStrength`, `tube.centerOffsetX`, `tube.centerOffsetY`.
- `player.lane`, `player.targetLane`, `player.laneAnimFrame`, `player.isLaneTransition`, `player.state`, `player.spinProgress`.
- Все `z`/`lane` значения у `obstacles`, `bonuses`, `coins`, `spinTargets`.
- Таймеры и флаги эффектов в `fx` и `runtime`.

Допустимые renderer-side вычисления:

- world/screen projection;
- подбор анимационного кадра или shader uniform на основе snapshot;
- quality/fallback поведение без изменения gameplay state.

## Renderer Feature Flag

Флаг выбора renderer хранится в `js/config.js` как:

- `RENDER_BACKENDS` — список допустимых значений;
- `DEFAULT_RENDER_BACKEND` — итоговое значение из `?renderer=phaser`, `localStorage.rendererBackend` или fallback на `canvas`.

Пока этот флаг только зафиксирован как контракт Stage 0; Stage 1 подключит его к renderer abstraction.

## Tunnel Visual Parity Checklist

Первая Phaser-итерация трубы обязана сохранить:

1. Непрерывное вращение трубы относительно `tube.rotation`.
2. Forward-motion/depth scrolling из `tube.scroll` и скорости.
3. Реакцию на кривизну и смещение центра (`curveAngle`, `curveStrength`, `centerOffsetX/Y`).
4. Центральное свечение и читаемый tube core.
5. Кромочный highlight / bezel light.
6. Цветовую модуляцию сегментов без потери контраста.
7. Speed lines / neon overlay при текущем темпе движения.
8. Читаемость special states: spin alert, shield/magnet/invert feedback, bonus text.

## Stage 0 Outcome

После этого этапа граница `update -> snapshot -> renderer` описана явно. Следующий шаг — перевести текущий canvas draw path на adapter, который будет принимать именно этот snapshot.
