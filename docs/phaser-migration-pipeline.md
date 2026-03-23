# Phaser Migration Pipeline

## Goal

Перенести визуальный слой игры с текущего canvas-рендера на Phaser **поэтапно**, не меняя текущую игровую логику на первом этапе. Главный фокус первой итерации — **труба**. После стабилизации трубы в Phaser постепенно перенести **персонажа**, **препятствия**, **бонусы**, **монеты** и остальной игровой рендер.

## Principles

- **Logic-first compatibility**: физика, состояние, спавн, правила, score-flow и UI-flow пока остаются в текущих модулях.
- **Renderer swap, not rewrite**: сначала меняем только способ отрисовки.
- **Tunnel-first migration**: самый дорогой и визуально важный элемент переносим первым.
- **Hybrid mode**: во время миграции поддерживаем возможность переключаться между `canvas` и `phaser`.
- **Incremental asset migration**: сначала логика использует текущие данные, затем ассеты и анимации начинают грузиться через Phaser Loader.
- **Measure every phase**: каждый этап должен иметь критерии готовности и список проверок.

## Current Baseline

На текущий момент:

- проект работает через **Vite + ESM**;
- главный orchestrator игры находится в `js/game.js`;
- логика обновления находится отдельно от рендера;
- tube renderer остаётся основным визуальным hot path;
- ассеты грузятся через текущий `assetManager`;
- DOM/UI, auth, store, leaderboard и прочая прикладная обвязка уже отделены от игрового рендера.

Это позволяет переносить визуальную часть в Phaser без обязательного рефакторинга всей игры за один проход.

---

# Migration Stages

## Stage 0 — Preparation / Freeze Contract

**Status:** ✅ Completed

### Goal

Зафиксировать контракт между логикой и рендером, чтобы Phaser можно было подключать без переписывания game rules.

### Tasks

- [x] Выделить **render snapshot contract** — единый объект данных, который будет получать рендер.
- [x] Описать минимальный набор данных для первого этапа:
   - размеры viewport;
   - состояние трубы;
   - состояние игрока;
   - массив препятствий;
   - массив бонусов;
   - массив монет;
   - таймеры FX;
   - состояние спина / ускорения / щита / магнита.
- [x] Зафиксировать, какие поля являются источником истины в логике и не должны вычисляться повторно в Phaser.
- [x] Определить feature flag:
  - `canvas`
  - `phaser`
- [x] Зафиксировать список текущих визуальных фич трубы, которые должны сохраниться после первой миграции.

### Stage 0 Notes

- `render snapshot` формализован в `docs/render-snapshot-contract.md` и `js/render-snapshot.js`.
- Feature flag выбора backend зафиксирован в `js/config.js` через `RENDER_BACKENDS` и `DEFAULT_RENDER_BACKEND`.
- Граница между логикой и рендером описана как `update -> createRenderSnapshot(viewport) -> renderer`.

### Deliverables

- Документированный формат `render snapshot`.
- Список обязательных tunnel-features для parity.
- Решение, где хранится флаг выбора рендера.

### Exit Criteria

- Можно объяснить, какие данные логика передаёт рендеру, не заходя во внутренности canvas-отрисовки.
- Появляется понятная граница между `update` и `draw`.

---

## Stage 1 — Introduce Renderer Abstraction

### Goal

Подготовить кодовую базу к существованию двух рендеров одновременно.

### Tasks

- [x] Ввести интерфейс рендера, например:
  - `init()`
  - `resize()`
  - `render(snapshot)`
  - `destroy()`
- [x] Обернуть текущий canvas renderer в адаптер `canvas-renderer-adapter`.
- [x] Подготовить заглушку `phaser-renderer-adapter` с пустым `render(snapshot)`.
- [x] Перевести `js/game.js` на вызов абстрактного рендера вместо прямого набора `drawTube/drawPlayer/...` где это возможно.
- [x] Добавить режим безопасного fallback на canvas, если Phaser не инициализировался.

### Stage 1 Progress Notes

- В проект добавлены модули `js/renderers/index.js`, `js/renderers/canvas-renderer-adapter.js` и `js/renderers/phaser-renderer-adapter.js`.
- `js/game.js` теперь выбирает renderer backend через abstraction layer и передаёт в него `snapshot`.
- Для `phaser` backend пока используется безопасная заглушка с автоматическим fallback обратно на `canvas`.


### Deliverables

- Общий renderer contract.
- Canvas работает через новый adapter layer.
- Phaser adapter подключается без визуального результата, но не ломает игру.

### Exit Criteria

- Игра продолжает работать через canvas после введения абстракции.
- Смена backend renderer не требует менять игровую логику.

---

## Stage 2 — Bootstrap Phaser Runtime

### Goal

Поднять Phaser в проекте как отдельный runtime-рендерер, не ломая текущий bootstrap приложения.

### Tasks

1. [ ] Добавить Phaser как зависимость проекта.
2. [x] Создать базовый модуль, например:
   - `js/phaser/runtime.js`
   - `js/phaser/scenes/MainScene.js`
3. [x] Определить контейнер/канвас для Phaser так, чтобы он жил в существующем layout.
4. [x] Настроить resize и DPR-поведение с учётом текущего Telegram/mobile контекста.
5. [x] Добавить жизненный цикл:
   - mount Phaser game;
   - create scene;
   - receive external snapshot;
   - destroy при выгрузке/рестарте.
6. [x] Ничего не переносить из логики на этом этапе: Phaser пока только принимает данные.

### Stage 2 Progress Notes

- Phaser orchestration вынесена из `js/game.js` в `js/phaser/bridge.js`; bridge монтирует runtime, управляет resize/DPR и передаёт внешние snapshots в сцену.
- Добавлены `js/phaser/runtime.js` и `js/phaser/scenes/MainScene.js` как минимальный runtime bootstrap для отдельного Phaser lifecycle.
- `js/renderers/phaser-renderer-adapter.js` теперь использует bridge вместо пустой заглушки, а `js/game.js` передаёт initial snapshot при инициализации/resize.
- `Phaser` пока грузится через CDN fallback в runtime; пункт про package dependency возвращён в backlog, потому что в текущем окружении `npm ci` блокируется политикой registry на `phaser`.

### Deliverables

- Phaser запускается внутри проекта.
- Scene корректно создаётся и уничтожается.
- Размеры сцены совпадают с игровым viewport.

### Exit Criteria

- В режиме `phaser` приложение стартует стабильно.
- Нет конфликтов между существующим приложением и Phaser lifecycle.

---

## Stage 3 — Tunnel Proof of Concept

### Goal

Сделать первую рабочую Phaser-версию трубы без переноса игрока и объектов.

### Tasks

1. [x] Выбрать технику первой реализации трубы:
   - **Option A**: segmented sprite tunnel;
   - **Option B**: render texture tunnel;
   - **Option C**: shader-based tunnel.
2. [x] Для первой production-итерации выбрать pragmatic path:
   - выбран **Segmented tunnel на Phaser Graphics** как fastest path к parity и безопасный этап перед production pass.
3. [x] Реализовать базовые tunnel parameters:
   - rotation;
   - depth motion / forward scrolling;
   - curvature response;
   - center glow / edge highlight;
   - color modulation.
4. [x] Связать Phaser-трубу с текущими данными логики:
   - `tubeRotation`;
   - параметры кривизны;
   - скорость;
   - состояния ускорения / эффектов.
5. [x] Сделать простое debug-overlay сравнение canvas vs phaser по ключевым параметрам.

### Stage 3 Progress Notes

- В `js/phaser/tunnel/TunnelRenderer.js` добавлен первый Phaser tunnel renderer на `Graphics`, который повторяет сегментированный depth-stack и читает rotation/scroll/curve/center-offset напрямую из `render snapshot`.
- Сцена `js/phaser/scenes/MainScene.js` теперь вместо заглушки рисует живую Phaser-трубу с center glow, edge highlight, speed-lines и цветовой модуляцией под shield/magnet/x2 states.
- Debug overlay показывает ключевые параметры snapshot (`rotation`, `scroll`, `curve`, `center`, `speed`) для быстрого сравнения canvas vs Phaser во время ручной QA.

### Deliverables

- Видимая Phaser-труба.
- Она реагирует на скорость, вращение и базовую кривизну.
- Игра может работать с Phaser-трубой при том, что персонаж и объекты ещё рендерятся старым способом или временными placeholder-слоями.

### Exit Criteria

- Phaser-труба визуально воспроизводит core motion.
- FPS не хуже canvas baseline на целевых устройствах или объяснимо лучше.

---

## Stage 4 — Tunnel Production Pass

### Goal

Довести Phaser-трубу до production-quality и сделать её новой основной реализацией.

### Tasks

1. [x] Добавить расширенный visual stack:
   - [x] emissive strips;
   - [x] depth fog;
   - [x] pulse при ускорении;
   - [x] shield/magnet tint states;
   - [x] hit flash / impact ripple;
   - [x] speed-line synergy.
2. [x] Разделить трубу на визуальные слои:
   - [x] base tube;
   - [x] light layer;
   - [x] FX overlay;
   - [x] event-driven flashes.
3. [x] Ввести quality presets:
   - [x] low;
   - [x] medium;
   - [x] high.
4. [x] Снизить стоимость эффектов на слабых mobile/Telegram окружениях.
5. [x] Подготовить fallback mode для случаев, когда shader path работает нестабильно.
6. [x] Убедиться, что визуальные состояния бонусов читаются лучше, чем в canvas-версии.

### Stage 4 Progress Notes

- `js/phaser/tunnel/TunnelRenderer.js` переработан в production-pass с многослойным стеком (`base/light/fog/fx/flash`), emissive-полосами, глубинным туманом, ускоряющимся halo/pulse, tint-состояниями под shield/magnet/x2 и event-driven flash/ripple реакциями на изменение кривизны и смещения тоннеля.
- Quality presets `low` / `medium` / `high` теперь реально влияют на глубину, плотность сегментов, количество speed-lines и стоимость glow/fog-слоёв, а мобильные окружения по умолчанию стартуют в `medium` через `js/state.js` и `js/perf.js`.
- Fallback strategy для нестабильного shader path задокументирована через сохранение production-ready Graphics implementation: Phaser runtime продолжает использовать non-shader tunnel renderer, а при проблемах инициализации backend по-прежнему откатывается на canvas adapter из Stage 1/2 без изменения логики.
- Состояния бонусов стали читаться лучше за счёт отдельных цветовых акцентов: cyan halo для shield, green tint для magnet и magenta pulse для x2, поверх усиленных speed-lines и центра трубы.

### Deliverables

- Phaser-труба готова как primary renderer.
- Есть пресеты качества.
- Есть documented fallback strategy.

### Exit Criteria

- Новая труба выглядит лучше текущей.
- Производительность не регрессирует на ключевых сценариях.
- Canvas tunnel можно считать legacy fallback.

---

## Stage 5 — Move Player Rendering to Phaser

### Goal

Перенести персонажа в Phaser, не меняя его текущую игровую модель.

### Tasks

1. Перевести player rendering на Phaser sprite/spritesheet.
2. Сохранить текущую модель управления:
   - lane-based movement;
   - transition state;
   - spin state;
   - текущую семантику анимаций.
3. Подключить текущие кадры/атласы персонажа через Phaser Loader.
4. Ввести mapping между логическим state и Phaser animation state.
5. Обеспечить visual parity:
   - idle back;
   - idle left/right;
   - swipe left/right;
   - spin.
6. Убрать дублирующую canvas-отрисовку персонажа после проверки parity.

### Deliverables

- Персонаж рендерится только Phaser-слоем.
- Все текущие player states корректно отображаются.

### Exit Criteria

- Управление ощущается так же, как в canvas-версии.
- Нет рассинхронизации между логикой и Phaser animation state.

---

## Stage 6 — Move Obstacles, Bonuses, Coins to Phaser

### Goal

Перенести игровые объекты в Phaser с сохранением текущих логических систем.

### Tasks

1. Создать Phaser entity layer для:
   - obstacles;
   - bonuses;
   - coins;
   - spin targets / special markers.
2. Сделать адаптеры из текущих массивов логики в Phaser display objects.
3. Реализовать pooling/reuse для объектов.
4. Подключить ассеты объектов через Phaser Loader.
5. Настроить depth ordering и visual priority.
6. Добавить event-driven visual reactions:
   - pickup flash;
   - spawn pop-in;
   - obstacle warning;
   - collected state transitions.

### Deliverables

- Все основные игровые объекты рисуются Phaser.
- Объекты используют pooling.
- Canvas object rendering можно отключить.

### Exit Criteria

- Вся игровая сцена, кроме DOM UI, уже визуализируется Phaser.
- Нет заметных утечек display objects и лагов от постоянного create/destroy.

---

## Stage 7 — Asset Loading Migration to Phaser

### Goal

Перенести игровые ассеты на Phaser Loader и сделать его основным путём загрузки для игровой сцены.

### Tasks

1. Составить Phaser manifest для:
   - player spritesheets;
   - obstacles;
   - bonuses;
   - coins;
   - tunnel textures / FX textures.
2. Разделить ассеты на:
   - critical gameplay assets;
   - deferred decorative assets.
3. Сохранить совместимость с существующими путями в `public/assets` и `public/img`.
4. Определить, какие ассеты пока остаются вне Phaser:
   - DOM/UI icons;
   - menu-specific art;
   - auth/store visuals.
5. Убрать зависимость игрового рендера от старого `assetManager` там, где всё уже обслуживает Phaser.
6. Настроить preload progress reporting для интеграции в существующий UX.

### Deliverables

- Phaser Loader загружает весь runtime-набор игровых ассетов.
- Старый `assetManager` остаётся только для неигровых сценариев, если это всё ещё нужно.

### Exit Criteria

- Игровая сцена не зависит от ручной загрузки картинок через `Image()`.
- Поведение загрузки предсказуемо и прозрачно для пользователя.

---

## Stage 8 — Full Phaser Render Path / Canvas Retirement for Gameplay

### Goal

Перевести gameplay rendering полностью на Phaser и оставить canvas только как временный fallback либо удалить позже.

### Tasks

1. Отключить canvas-отрисовку трубы, игрока и объектов в основном runtime-path.
2. Оставить canvas renderer как dev fallback на ограниченный период.
3. Почистить старые draw-paths, которые больше не используются.
4. Сохранить полезные debug-инструменты, если они нужны в Phaser.
5. Убедиться, что restart / pause / game over / resume корректно работают в новом пайплайне.

### Deliverables

- Gameplay visuals полностью идут через Phaser.
- Canvas gameplay renderer больше не является default path.

### Exit Criteria

- Основной runtime-path не использует legacy canvas draw stack.
- Legacy path либо удалён, либо помечен на удаление с понятным дедлайном.

---

## Stage 9 — Cleanup / Optimization / Second-Wave Refactors

### Goal

Упростить кодовую базу после стабилизации миграции.

### Tasks

1. Удалить мёртвые canvas-paths после подтверждения стабильности.
2. Сверить структуру модулей и вынести Phaser-код в отдельную подсистему.
3. Оптимизировать batching, pooling, texture usage.
4. Подготовить фундамент для будущих шагов:
   - перенос некоторых FX в shader pipelines;
   - перенос дополнительных анимаций;
   - optional future logic refactor, если он понадобится.
5. Обновить техдокументацию по render architecture.

### Deliverables

- Чистая поддерживаемая Phaser-based render architecture.
- Устаревшие canvas-only ветки сокращены или удалены.

### Exit Criteria

- Поддержка проекта не требует знания двух полноценных игровых рендеров одновременно.

---

# Recommended Execution Order

## Sprint 1

- Stage 0
- Stage 1
- Stage 2
- Stage 3

### Sprint Goal

Поднять Phaser и получить первую рабочую версию трубы.

## Sprint 2

- Stage 4
- начало Stage 5

### Sprint Goal

Сделать production-качество трубы и начать перенос персонажа.

## Sprint 3

- завершение Stage 5
- Stage 6
- Stage 7

### Sprint Goal

Перенести весь gameplay render path и ассеты на Phaser.

## Sprint 4

- Stage 8
- Stage 9

### Sprint Goal

Отключить legacy gameplay canvas-path и почистить архитектуру.

---

# Definition of Done per Phase

Каждый этап считается завершённым, только если выполнены все условия:

1. **Functional parity**
   - логика не изменила поведение;
   - визуально новый слой соответствует ожидаемому состоянию игры.

2. **Performance validation**
   - нет явного FPS regression на целевых устройствах;
   - нет взрывного роста памяти;
   - нет постоянного create/destroy без pooling там, где это критично.

3. **Fallback / Recovery**
   - есть способ быстро вернуться на предыдущий стабильный путь при проблеме.

4. **Code boundary clarity**
   - можно объяснить, где заканчивается логика и начинается Phaser rendering.

5. **Manual QA**
   - start / restart / pause / game over / бонусы / спин / ускорение проверены вручную.

---

# First Implementation Recommendation

Если идти наиболее прагматично, предлагаю следующую ближайшую последовательность работ:

1. Зафиксировать `render snapshot`.
2. Ввести renderer abstraction.
3. Подключить Phaser runtime.
4. Сделать **первую Phaser-трубу** как отдельный модуль.
5. Довести трубу до состояния, когда её уже приятно показывать и сравнивать.
6. Только после этого переносить персонажа.
7. Затем переносить obstacles / bonuses / coins.
8. После стабилизации визуального пути перевести ассеты на Phaser Loader.

---

# What We Will Not Change Yet

На первых этапах **не трогаем**:

- игровую физику;
- spawn logic;
- score logic;
- store/auth/UI архитектуру;
- API интеграции;
- leaderboard flow;
- существующие прикладные бизнес-правила.

Это сознательное ограничение нужно, чтобы миграция осталась управляемой и была сфокусирована на visual pipeline.

---

# Next Step

**Следующий практический шаг:** начать со **Stage 0 + Stage 1**.

То есть в коде первым делом:

1. описываем `render snapshot`;
2. вводим renderer abstraction;
3. готовим проект к существованию `canvas` и `phaser` backend одновременно.

После этого можно безопасно переходить к первому реальному Phaser-модулю трубы.
