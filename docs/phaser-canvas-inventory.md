# Canvas → Phaser inventory (Этап 0)

Дата обновления: 2026-04-05  
Статус: baseline-инвентаризация зафиксирована

## 1) Canvas touchpoints (текущее состояние)

| Подсистема | Canvas touchpoint | Phaser эквивалент / целевой путь | Владелец | Статус |
|---|---|---|---|---|
| Runtime renderer entry | legacy `js/renderer.js` удалён | `js/renderers/phaser-renderer-adapter.js` + `js/phaser/bridge.js` | rendering | Done |
| Renderer selection | `js/renderers/index.js` (раньше multi-backend, теперь Phaser only) | Phaser-only adapter contract | rendering | Done |
| Runtime loop integration | `js/game.js` (`createGameRenderer`, `renderFrame` через adapter) | Phaser snapshot render pipeline | runtime | Done |
| Viewport sync | `js/game/loop.js`, `js/game/session.js` через `syncViewport` | event-протокол `ursas:viewport-sync-requested` + bridge resize | runtime/ui | Done |
| Projection helpers for gameplay | `js/game/projection.js` (renderer-agnostic projection math) | используется в gameplay/runtime и опирается на Phaser viewport metrics | gameplay/rendering | Done |
| Legacy particle draw path | legacy particle-pool удалён; `spawnParticles` публикует `particle_burst` напрямую в Phaser collect-FX pipeline | Phaser particles/FX manager | effects | In progress |
| DOM canvas references | прямые ссылки на `DOM.canvas.*` удалены из runtime | viewport metrics from Phaser bridge | gameplay/ui | Done |

## 2) Публичные переключатели/флаги рендера

| Источник | Состояние |
|---|---|
| `?renderer=...` query-переключатель | Удалён из публичного рантайма |
| `localStorage.rendererBackend` | Удалён из публичного рантайма |
| Runtime backend selection | Зафиксирован на Phaser (`js/renderers/index.js`) |

## 3) Owner map на ближайшие MIG-задачи

- **rendering:** cleanup остаточных Canvas-asset/css ссылок (если не используются).
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

- `js/physics.js` и `js/input.js` переведены с `DOM.canvas.*` на viewport center helper.
- Частицы работают через Phaser collect-FX bursts как переходное решение; отдельный нативный Phaser FX manager (emitters/pooling) остаётся follow-up задачей.
- Нужна финальная post-release валидация smoke/perf после удаления legacy Canvas renderer module.
