# Canvas → Phaser inventory (Этап 0)

Дата обновления: 2026-04-05  
Статус: baseline-инвентаризация зафиксирована; Canvas runtime removal (Этап 5) подтверждён

## 1) Canvas touchpoints (текущее состояние)

| Подсистема | Canvas touchpoint | Phaser эквивалент / целевой путь | Владелец | Статус |
|---|---|---|---|---|
| Runtime renderer entry | legacy `js/renderer.js` удалён из runtime | `js/renderers/phaser-renderer-adapter.js` + `js/phaser/bridge.js` | rendering | Done |
| Renderer selection | `js/renderers/index.js` (раньше multi-backend, теперь Phaser only) | Phaser-only adapter contract | rendering | Done |
| Runtime loop integration | `js/game.js` (`createGameRenderer`, `renderFrame` через adapter) | Phaser snapshot render pipeline | runtime | Done |
| Viewport sync | `js/game/loop.js`, `js/game/session.js` через `syncViewport` | event-протокол `ursas:viewport-sync-requested` + bridge resize | runtime/ui | Done |
| Runtime event contract | `js/runtime-events.js` (единый набор event-name констант) | shared source for lifecycle/perf/ui event protocol | runtime/ui | Done |
| Projection helpers for gameplay | `js/game/projection.js` (renderer-agnostic projection math) | используется в `js/physics.js` без прямой gameplay-зависимости от Canvas renderer module | gameplay/rendering | Done |
| Legacy particle draw path | legacy particle-pool удалён; `spawnParticles` публикует `particle_burst` напрямую в Phaser collect-FX pipeline | Phaser particles/FX manager | effects | Done (transitional event-driven FX) |
| DOM canvas references | legacy `DOM.canvas` path удалён из runtime-state; gameplay использует viewport helper | viewport metrics from Phaser bridge | gameplay/ui | Done |

## 2) Публичные переключатели/флаги рендера

| Источник | Состояние |
|---|---|
| `?renderer=...` query-переключатель | Удалён из публичного рантайма |
| `localStorage.rendererBackend` | Удалён из публичного рантайма |
| Runtime backend selection | Зафиксирован на Phaser (`js/renderers/index.js`) |

## 3) Owner map на ближайшие MIG-задачи

- **rendering:** контроль отсутствия регрессий Canvas-path через `check:no-legacy-canvas-runtime`.
- **gameplay:** parity-smoke по lane transitions / hit/score feedback на Phaser.
- **effects:** follow-up для нативного Phaser FX manager (emitters/pooling), если потребуется по perf.
- **ui/runtime:** mobile smoke-регрессия pause/resume/menu/modals + фиксация результата в MIG-05.

## 4) Regression-сценарии (критичные)

1. Старт сессии и первые 30 секунд геймплея.
2. Сбор монет/бонусов (speed/shield/magnet/invert/recharge).
3. Столкновение с препятствием → hit feedback → game over.
4. Рестарт после game over.
5. Пауза/возврат в меню и повторный старт.
6. Изменение viewport (mobile rotation / resize).

## 5) Что остаётся после закрытия Этапа 5

- Активный Canvas runtime-path удалён; дальнейшие задачи относятся к parity/stabilization (Этапы 3/6).
- Частицы работают через Phaser collect-FX bursts как переходное решение; отдельный нативный Phaser FX manager (emitters/pooling) остаётся follow-up задачей по perf-наблюдениям.
- Для защиты от регрессий используется guardrail `npm run check:no-legacy-canvas-runtime` (последний прогон: 2026-04-05, статус green).
