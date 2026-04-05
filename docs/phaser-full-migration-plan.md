# Полная миграция рендера: Canvas → Phaser

Дата: 2026-04-04  
Статус: рабочий план (migration runbook)

## Текущий прогресс (обновлено: 2026-04-05)

- [x] **Этап 5 (частично):** удалён неиспользуемый legacy Canvas runtime-модуль `js/renderer.js` и связанный `ctx`-proxy из `state`, чтобы убрать мёртвый Canvas draw-path из кодовой базы.
- [x] **Этап 5 (частично):** из DOM-разметки удалён legacy `<canvas id="game">`; Phaser остаётся единственным runtime-owner визуального слоя.
- [x] **Этап 1/5 (частично):** runtime-термины и контракты переименованы с `canvas*` на `viewport*` (`getViewportSize/getViewportDimensions`) для консистентного Phaser-only API.
- [x] **Этап 5 (частично):** удалён transitional no-op `invalidateCachedBackgroundGradient` из loop/session, который обслуживал только legacy Canvas-cache.
- [x] **Этап 5 (частично):** добавлен guardrail `check:no-legacy-canvas-runtime`, который блокирует возврат Canvas-терминов/точек входа в активные Phaser runtime-файлы.
- [x] **Этап 4 (частично):** убраны публичные runtime-переключатели `?renderer=...` и `localStorage.rendererBackend`; по умолчанию используется Phaser.
- [x] **Этап 4 (частично):** выбор backend зафиксирован на Phaser в runtime-адаптере (без fallback-переключения из клиентского рантайма).
- [x] **Этап 2/4 (частично):** основной игровой `renderFrame` переведён на безусловный вызов Phaser-адаптера, Canvas draw-пайплайн исключён из runtime-loop.
- [x] **Этап 3 (частично):** lifecycle-resize события переведены на event-протокол `ursas:viewport-sync-requested` вместо прямых вызовов Canvas resize.
- [x] **Этап 3 (частично):** `game loop` и `session start` используют единый viewport-sync callback вместо прямой зависимости от `renderer.resizeCanvas`.
- [x] **Этап 3 (частично):** bootstrap UI-событий сделан idempotent (`bind-once`), чтобы исключить дублирующие side-effects между DOM UI и Phaser runtime.
- [x] **Этап 3 (частично):** visibility lifecycle переведён на runtime event `ursas:app-visibility-changed`; audio pause/resume синхронизирован через `subscribeAppVisibilityLifecycle` contract.
- [x] **Этап 3 (частично):** game loop учитывает visibility-suspend (`gameState.visibilitySuspended`) — update-проход приостанавливается в background и возобновляется на visible.
- [x] **Этап 1/3 (частично):** контракты loop/session переименованы с `resizeCanvas` на нейтральный `syncViewport`, чтобы исключить Canvas-специфичность API.
- [x] **Этап 2/3 (частично):** loading-screen вынесен из Canvas draw-path в DOM overlay, совместимый с Phaser-only runtime.
- [x] **Этап 6 (частично):** loading overlay обновляется через стабильные DOM-ноды (без `innerHTML` на каждый кадр), чтобы снизить churn/layout overhead.
- [x] **Этап 6 (частично):** добавлен runtime perf-event `ursas:perf-sample` (fps/avgFps/ping/debugStats) для мониторинга стабилизации после Canvas→Phaser миграции.
- [x] **Этап 6 (частично):** добавлен runtime-агрегатор `ursas:perf-summary` + `window.ursasPerf` (rolling p50/p95/min/max), чтобы фиксировать метрики стабилизации без ручного подсчёта.
- [x] **Этап 6 (частично):** perf-агрегатор расширен visibility-метриками (`hiddenCount/visibleCount/lastChangedAt`) для контроля pause/resume стабильности на мобильных сценариях.
- [x] **Этап 3/6 (частично):** UI screen transitions публикуются как runtime event `ursas:ui-screen-changed`; perf-summary считает переходы menu/store/rules/gameplay/game-over для smoke-диагностики.
- [x] **Этап 6 (частично):** в perf-агрегатор добавлен `smokeChecklist` (и helper `window.ursasPerf.getSmokeChecklistStatus`) для быстрой валидации прохождения core-сценариев стабилизации.
- [x] **Этап 6 (частично):** добавлен отчётный шаблон `docs/phaser-stabilization-report.md` (MIG-08) для фиксации KPI/smoke/инцидентов в окне пост-релизного наблюдения.
- [x] **Этап 2/5 (частично):** из `game loop` удалены Canvas-specific clear/gradient passes; loop работает как renderer-agnostic update/render orchestrator.
- [x] **Этап 0:** формализована инвентаризация Canvas touchpoints + owner map в `docs/phaser-canvas-inventory.md` (MIG-01 baseline).
- [x] **Этапы 1–3 (формализация):** собран рабочий parity-checklist и DoD-гейт в `docs/phaser-parity-checklist.md` (MIG-02..MIG-05 tracking).
- [x] **Этап 1 (частично):** gameplay больше не импортирует `js/renderer.js`; projection/animation helpers вынесены в `js/game/projection.js`.
- [x] **Этап 1/2 (частично):** `physics` и `input` убрали прямую привязку к `DOM.canvas.width/height`, используя единый viewport center helper.
- [x] **Этап 2/5 (частично):** canvas-проход `drawParticles()` исключён из основного `renderFrame`; loop больше не вызывает Canvas 2D draw-путь.
- [x] **Этап 2 (частично):** `spawnParticles` прокинут в Phaser-side collect FX (`particle_burst`) как переходный эффект вместо Canvas draw.
- [x] **Этап 5 (частично):** удалён legacy particle-pool как промежуточный Canvas-артефакт; остался event-driven FX pipeline.
- [x] **Этап 5 (частично):** обновлена инвентаризация `docs/phaser-canvas-inventory.md` — устаревшие Canvas touchpoints переведены в статус Done, блокеры Этапа 5 закрыты как runtime-path removed.
- [x] **Этап 6 (частично):** пройдены технические guardrail-проверки стабилизации (`npm run check`, `npm run build`, включая `check:no-legacy-canvas-runtime`) после удаления legacy runtime-path.
- [ ] **Этап 6:** ожидает пост-релизной стабилизации и фиксации итоговых метрик.

## 1) Цель миграции

Полностью перевести игровой рендер и связанные визуальные/loop-потоки с legacy Canvas-слоя на Phaser так, чтобы:

- Phaser стал **единственным production-рендерером по умолчанию**;
- legacy Canvas-код был либо удалён, либо оставлен только как временно изолированный fallback с чётким сроком удаления;
- игровые метрики, стабильность FPS и UX остались не хуже текущего уровня;
- миграция проходила безопасно: маленькими этапами с проверками и откатом.

---

## 2) Определение «миграция завершена» (Definition of Done)

Миграция считается завершённой только при выполнении всех пунктов:

1. В production не используется Canvas-пайплайн для штатного рендера.
2. Весь критичный визуальный путь (игрок, препятствия, эффекты, UI-оверлеи игры, game over flow) работает через Phaser-сцены/системы.
3. Нет runtime-переключателей, которые могут незаметно вернуть пользователей на старый Canvas (кроме строго технического аварийного флага, если он временно разрешён).
4. Legacy Canvas-модули удалены или помечены `@deprecated` с датой удаления и владельцем.
5. Пройдены smoke/e2e/regression-проверки и зафиксированы baseline-метрики.
6. Обновлена документация и runbook для команды релиза.

---

## 3) Текущие риски, которые закрывает план

- Дублирование логики между двумя рендерами (дрейф поведения).
- Сложность отладки багов из-за гибридного пути Canvas + Phaser.
- Риск «тихого» отката на Canvas через query-параметры/флаги.
- Рост стоимости изменений в gameplay из-за двойной поддержки.

---

## 4) План миграции по этапам

### Этап 0 — Freeze и инвентаризация (1 день)

**Что делаем**
- Объявляем feature freeze на изменения визуального слоя вне миграции.
- Фиксируем список Canvas-зависимостей (модули, точки входа, флаги, query params).
- Назначаем владельцев по подсистемам: rendering, input, UI-overlay, audio hooks, perf.

**Выход этапа**
- Таблица соответствия: `Canvas subsystem -> Phaser subsystem`.
- Список «критичных» пользовательских сценариев для regression.

### Этап 1 — Контракт рендера и единый runtime-адаптер (1–2 дня)

**Что делаем**
- Закрепляем единый renderer-contract (если требуется — расширяем минимальными методами).
- Все вызовы игрового runtime идут только через контрактный слой, а не напрямую в Canvas/Phaser реализацию.
- Закрываем «прямые» обращения из gameplay-модулей к Canvas API.

**Критерий готовности**
- Нет новых runtime-вызовов, обходящих adapter/contract.

### Этап 2 — Функциональный parity на Phaser (2–4 дня)

**Что делаем**
- Доводим до parity отображение игрока, препятствий, монет, бонусов и фоновых эффектов.
- Синхронизируем тайминги анимаций/коллизий, чтобы gameplay-ощущение не изменилось.
- Переносим/проверяем game over, hit feedback, score feedback.

**Критерий готовности**
- Ключевые сценарии играются полностью на Phaser без регрессий уровня P0/P1.

### Этап 3 — UI интеграция и событийная модель (1–3 дня)

**Что делаем**
- Приводим взаимодействие Phaser ↔ DOM UI к единому событийному протоколу.
- Убираем дублирующие подписки/побочные эффекты между legacy и новым путём.
- Проверяем паузы, ресюмы, смену экранов, модалки, магазин/донат (если задействовано в игровом цикле).

**Критерий готовности**
- Нет рассинхронизации между состоянием игры и UI-слоем.

### Этап 4 — Переключение production default на Phaser (1 день)

**Что делаем**
- Включаем Phaser как единственный путь по умолчанию.
- Оставляем только ограниченный kill-switch на короткий период (если требуется политикой релиза).
- Добавляем явный telemetry event на активацию fallback (для мониторинга).

**Критерий готовности**
- Production-трафик идёт в Phaser; fallback почти не используется или отключён.

### Этап 5 — Удаление legacy Canvas (1–2 дня)

**Что делаем**
- Удаляем Canvas-модули, неиспользуемые ассеты и dead code.
- Чистим feature flags/query params, которые больше не нужны.
- Обновляем импорты, документацию, диаграммы архитектуры.

**Критерий готовности**
- В репозитории нет активного Canvas runtime-пути для игры.

### Этап 6 — Пост-миграционная стабилизация (2–5 дней наблюдения)

**Что делаем**
- Мониторим ошибки, FPS, время загрузки, crash rate.
- Подкручиваем perf-настройки Phaser (texture lifecycle, pooling, scene transitions).
- Фиксируем итоговый отчёт миграции.

**Критерий готовности**
- Метрики стабильны, инцидентов нет, план закрыт.

---

## 5) Обязательные проверки на каждом этапе

Минимальный набор:

1. `npm run check`
2. `npm run build`
3. Smoke в браузере:
   - старт игры;
   - 3–5 минут геймплея;
   - сбор монет/бонусов;
   - столкновение/game over;
   - рестарт;
   - пауза/возврат в меню.

Рекомендуется дополнительно:

- сравнение FPS/CPU между baseline и текущим этапом;
- проверка на мобильном viewport;
- проверка загрузки ассетов и отсутствия 404.

---

## 6) План релиза и отката

### Релиз

- Canary/частичный rollout (если доступен).
- Мониторинг в первые 24 часа: JS errors, crash-free sessions, FPS p50/p95.

### Откат

- Если есть критическая деградация: активировать аварийный fallback (только если ещё не удалён), затем hotfix.
- После удаления Canvas — откат только через git revert релизного диапазона.

---

## 7) Что делать прямо сейчас (практический short-list)

1. Зафиксировать «источник правды» для рендера: только adapter/contract.
2. Удалить/ограничить публичные переключатели, позволяющие уйти в Canvas.
3. Составить и закрыть parity-чеклист по gameplay-элементам.
4. После подтверждения стабильности — удалить legacy Canvas-код отдельным PR.

---

## 8) Шаблон тасков для трекера

- `[MIG-01]` Inventory Canvas touchpoints и owner map.
- `[MIG-02]` Закрыть direct-calls мимо renderer contract.
- `[MIG-03]` Phaser parity: player/obstacles/coins/bonuses.
- `[MIG-04]` Phaser parity: feedback/game-over/restart loop.
- `[MIG-05]` UI sync + event contract hardening.
- `[MIG-06]` Production switch + telemetry for fallback.
- `[MIG-07]` Legacy Canvas removal + docs cleanup.
- `[MIG-08]` Post-release perf stabilization report.
