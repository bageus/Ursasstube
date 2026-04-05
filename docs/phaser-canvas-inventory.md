# Canvas → Phaser inventory (Этап 0)

Дата обновления: 2026-04-05  
Статус: baseline-инвентаризация зафиксирована

## 1) Canvas touchpoints (текущее состояние)

| Подсистема | Canvas touchpoint | Phaser эквивалент / целевой путь | Владелец | Статус |
|---|---|---|---|---|
| Runtime renderer entry | `js/renderer.js` (legacy draw/projection API, `resizeCanvas`) | `js/renderers/phaser-renderer-adapter.js` + `js/phaser/bridge.js` | rendering | In progress (legacy API ещё используется в physics helpers) |
| Renderer selection | `js/renderers/index.js` (раньше multi-backend, теперь Phaser only) | Phaser-only adapter contract | rendering | Done |
| Runtime loop integration | `js/game.js` (`createGameRenderer`, `renderFrame` через adapter) | Phaser snapshot render pipeline | runtime | Done |
| Viewport sync | `js/game/loop.js`, `js/game/session.js` через `syncViewport` | event-протокол `ursas:viewport-sync-requested` + bridge resize | runtime/ui | Done |
| Projection helpers for gameplay | `js/physics.js` импортирует `project/projectPlayer/updatePlayerAnimation` из `js/renderer.js` | перенести projection math в renderer-agnostic модуль (`js/game/projection.js`) | gameplay/rendering | Planned |
| Legacy particle draw path | `js/particles.js` использует `ctx` из `js/state.js` | Phaser particles/FX manager | effects | Planned |
| DOM canvas references | `js/state.js`, `js/physics.js`, `js/input.js` используют `DOM.canvas.*` для координат/центра | viewport metrics from Phaser bridge | gameplay/ui | Planned |

## 2) Публичные переключатели/флаги рендера

| Источник | Состояние |
|---|---|
| `?renderer=...` query-переключатель | Удалён из публичного рантайма |
| `localStorage.rendererBackend` | Удалён из публичного рантайма |
| Runtime backend selection | Зафиксирован на Phaser (`js/renderers/index.js`) |

## 3) Owner map на ближайшие MIG-задачи

- **rendering:** финальный вынос projection/legacy draw API из `js/renderer.js`.
- **gameplay:** декуплинг `physics` от Canvas-координат и перенос на viewport metrics.
- **effects:** миграция `particles.js` с 2D context на Phaser FX.
- **ui/runtime:** smoke-регрессия событий pause/resume/modal после удаления Canvas touchpoints.

## 4) Regression-сценарии (критичные)

1. Старт сессии и первые 30 секунд геймплея.
2. Сбор монет/бонусов (speed/shield/magnet/invert/recharge).
3. Столкновение с препятствием → hit feedback → game over.
4. Рестарт после game over.
5. Пауза/возврат в меню и повторный старт.
6. Изменение viewport (mobile rotation / resize).

## 5) Что блокирует Этап 5 (удаление legacy Canvas)

- `js/physics.js` зависит от функций из `js/renderer.js`.
- `js/particles.js` всё ещё рисует через `CanvasRenderingContext2D`.
- В `js/state.js` сохраняется обязательный canvas-context (`ctx`) для legacy-ветки.
