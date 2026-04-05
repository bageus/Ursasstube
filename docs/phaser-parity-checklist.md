# Phaser parity checklist (Этапы 1–3)

Дата обновления: 2026-04-05  
Статус: рабочий чеклист для закрытия migration parity

## Этап 1 — Контракт рендера и единый runtime-адаптер

- [x] Runtime создаёт рендер через `createGameRenderer`.
- [x] Renderer backend в runtime зафиксирован на Phaser.
- [x] Lifecycle hooks используют нейтральный `syncViewport`.
- [x] Нет импортов `js/renderer.js` из gameplay-модулей (projection вынесен в `js/game/projection.js`).
- [x] Legacy `ctx`-path удалён из активного runtime-state; Canvas-specific state contract больше не участвует в игровом цикле.

## Этап 2 — Functional parity в Phaser

- [x] Игровой кадр рендерится через Phaser adapter в основном loop.
- [x] Loading overlay работает через DOM и не зависит от Canvas draw path.
- [x] Player lane transitions подтверждены на Phaser-only runtime (technical smoke + regression review).
- [x] Obstacles/coins/bonuses parity подтверждён (technical smoke session + event-flow telemetry).
- [x] Hit feedback / score feedback подтверждены на текущем Phaser runtime (без P0/P1 регрессий).
- [x] Game over + restart parity подтверждены без P0/P1 (automated smoke + runtime checks).

## Этап 3 — UI integration и event model

- [x] Resize flow переведён на event-protocol `ursas:viewport-sync-requested`.
- [x] Session start и game loop используют единый viewport-sync callback.
- [x] Visibility lifecycle унифицирован: runtime публикует `ursas:app-visibility-changed`, audio pause/resume синхронизирован через `subscribeAppVisibilityLifecycle` (event contract).
- [x] Event-name contract унифицирован через `js/runtime-events.js` (единый источник для lifecycle/perf/UI событий без дублирования строковых литералов).
- [x] Background visibility suspend: update-проход game loop останавливается при hidden и корректно возобновляется при visible.
- [x] UI screen transitions (`ursas:ui-screen-changed`) телеметрируются в perf-summary для smoke-проверки menu/store/rules/gameplay/game-over flow.
- [x] Runtime smoke-helper: `window.ursasPerf.getSmokeChecklistStatus()` агрегирует базовые сигналы gameplay/menu/game-over/pause-resume/store-rules.
- [x] Smoke-helper фиксирует `firstObservedAt` timestamps, чтобы ручной smoke-лог можно было привязать к факту прохождения шагов.
- [x] Runtime публикует `ursas:smoke-step-completed` при первом закрытии smoke-шагов (удобно для live-debug/smoke recording).
- [x] Runtime report-helper: `window.ursasPerf.getMIG08Snapshot()` возвращает готовый snapshot KPI/smoke для заполнения MIG-08 отчёта.
- [x] QA helper: `window.ursasPerf.simulateSmokeFlow()` позволяет локально проверить smoke-агрегацию/события до ручного end-to-end прогона.
- [x] Automated runtime smoke (`npm run check:mig08-smoke`) подтверждает базовый event-flow gameplay → game-over → menu + store + pause/resume и smokeChecklist 6/6 (включая viewport-sync smoke-сигнал); проверка включена в `npm run check`.
- [x] Automated smoke фиксирует viewport-sync событие (`viewportSyncObserved`) как обязательный сигнал lifecycle-resize протокола.
- [x] Нет дублирующих side-effects между DOM UI и Phaser runtime (UI handlers bind-once guard в bootstrap).
- [x] Pause/resume/menu/modals smoke подтверждён на lifecycle telemetry (включая viewport-sync signal в automated smoke).

## Протокол фиксации результата

Для каждого пункта, который переводится в `[x]`, фиксируем:

- SHA коммита.
- Короткий smoke-лог (что именно проверили).
- Если есть риски: owner + дедлайн.

### Последняя техническая валидация

- Дата: 2026-04-05
- Проверки: `npm run check`, `npm run build`
- Результат: guardrails зелёные, `check:no-legacy-canvas-runtime` подтверждает отсутствие активного Canvas runtime-path (повторная валидация на SHA `7bf1984`).

### Следующий шаг по этому чеклисту

- Чеклист Этапов 2/3 закрыт; дальнейшие задачи — только пост-релизный мониторинг продуктовых KPI.
