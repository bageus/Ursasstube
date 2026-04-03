# PiPlan: безопасная поэтапная миграция Canvas → Phaser

> Цель: убрать смешение логики между legacy canvas-рендером и Phaser без регрессий в геймплее.

## Статус выполнения
- [x] Шаг 0: зафиксирован текущий контракт gameplay ↔ renderer и документированы границы ответственности.
- [x] Шаг 1 (PR-1): вынесены projection/animation функции в `js/projection.js`, `physics.js` переключен на новый модуль.
- [x] Шаг 2: удаление runtime side effects из legacy renderer-пути.
- [x] Шаг 3: фиксация snapshot contract + dev-валидация.
- [x] Шаг 4: удаление неиспользуемого canvas pipeline.
- [x] Шаг 5 (PR-5): удаление временного feature flag после окна наблюдения.

## Принципы (не нарушать)
- **Gameplay source of truth**: `state.js` + `physics.js`.
- **Renderer только рисует**: получает snapshot и не меняет игровое состояние.
- **Маленькие PR**: 1–2 логических изменения за шаг.
- **Каждый шаг обратим**: простой rollback одним коммитом.

---

## Шаг 0. Базовая фиксация текущего контракта

### Что фиксируем
1. Активный backend = Phaser через `renderers/index.js`.
2. Главный цикл в `game.js` работает через snapshot (`render` / `renderUi`).
3. `render-snapshot.js` — каноническая форма данных между gameplay и renderer.

### DoD
- Документировано в комментариях/README (кто владеет логикой, кто владеет визуалом).
- Нет неявных допущений в коде о наличии canvas на экране.

### Риски
- Почти отсутствуют (документационный шаг).

### Выполнено
- Зафиксировано, что активный runtime backend — Phaser через `js/renderers/index.js`.
- Подтверждено, что игровой цикл в `js/game.js` работает через snapshot (`render` / `renderUi`).
- Контракт snapshot выделен как канонический в `js/render-snapshot.js` и дополнительно документирован в `README.md`.

---

## Шаг 1. Декуплинг physics от legacy renderer

### Проблема
Сейчас `physics.js` импортирует `project / projectPlayer / updatePlayerAnimation` из `renderer.js`, где живут canvas-части и side effects.

### Что делаем
1. Создать `js/projection.js`.
2. Перенести в него:
   - `project`
   - `projectPlayer`
   - `updatePlayerAnimation`
   - связанные минимальные helper’ы (если нужны для этих функций).
3. Обновить импорт в `physics.js` с `./renderer.js` на `./projection.js`.
4. Убедиться, что новый модуль не содержит DOM/canvas side effects.

### DoD
- `physics.js` не импортирует `renderer.js`.
- Поведение lane switch / spin / collision не меняется.

### Проверки
- Smoke: старт игры, 3–5 минут ран.
- Регрессия: бонусы, монеты, game over, рестарт.

---

## Шаг 2. Удаление runtime side effects legacy canvas

### Проблема
`renderer.js` содержит глобальные эффекты (например, resize-listener), которые не должны подключаться через gameplay-путь.

### Что делаем
1. Проверить все импорты `renderer.js`.
2. Вынести полезные чистые функции в отдельные модули (`projection.js`, `animation-utils.js` при необходимости).
3. Удалить/изолировать side effects (`window.addEventListener(...)`) из runtime-пути.

### DoD
- `renderer.js` не влияет на игру, если не используется напрямую.
- Нет ошибок в консоли, связанных с `ctx`/canvas resize.

### Проверки
- Повторный smoke на desktop + mobile viewport.

### Выполнено
- Удален глобальный side effect `window.addEventListener('resize', resizeCanvas)` при импорте `js/renderer.js`.
- Добавлены явные lifecycle-функции `attachLegacyRendererRuntime()` / `detachLegacyRendererRuntime()` для контролируемого подключения legacy runtime только при прямом использовании canvas-рендера.

---

## Шаг 3. Жёсткая граница snapshot contract

### Что делаем
1. Зафиксировать схему snapshot (JSDoc + комментарии):
   - Какие поля приходят из gameplay.
   - Что renderer **может** вычислять (только визуальные трансформации).
2. Добавить легкую валидацию snapshot в dev-режиме (assert на ключевые поля).
3. Запретить дублирующий расчет gameplay-параметров внутри Phaser runtime.

### DoD
- Любое расхождение snapshot быстро ловится в dev.
- Renderer не мутирует gameplay state.

### Проверки
- Dev run без warning/assert ошибок на всех основных сценариях.

### Выполнено
- Добавлен модуль `js/render-snapshot-contract.js` с канонической версией схемы snapshot и dev-валидатором обязательных полей контракта.
- `js/render-snapshot.js` переведен на `SNAPSHOT_SCHEMA_VERSION` и дополнен явными правилами владения snapshot (gameplay как source of truth, renderer — только read-only визуализация).
- В `js/renderers/phaser-renderer-adapter.js` добавлены dev-assert проверки snapshot в фазах `init`/`resize`/`render`, чтобы быстро ловить расхождения контракта во время разработки.

---

## Шаг 4. Поэтапное удаление canvas draw pipeline

### Что делаем
1. После стабилизации шагов 1–3 удалить неиспользуемые canvas draw-части из `renderer.js`:
   - tube renderer,
   - canvas draw helpers,
   - старые draw loops.
2. Удалить `offscreenCanvas/ctx` из `state.js`, если они больше не используются.
3. Почистить мертвые импорты и ассеты.

### DoD
- В проекте нет обязательных зависимостей от canvas-render кода.
- Сборка и runtime работают только с Phaser backend.

### Проверки
- `npm run check`
- `npm run build`
- Ручной сценарий полного цикла игры.

### Выполнено
- Удален legacy canvas draw pipeline (`js/renderer.js`) как неиспользуемый runtime-код.
- Удален `offscreenCanvas/ctx` из `js/state.js` и связанная canvas draw-ветка частиц из `js/particles.js` (оставлены только `spawn/update`).
- Обновлена документация в `README.md`: рендеринг в рантайме идет только через Phaser backend.

---

## Шаг 5. Страховка и выпуск

### Что делаем
1. На 1 релиз оставить временный feature flag (например `PHASER_RENDER_STRICT=true`) для быстрого rollback.
2. Собрать короткий post-release чеклист:
   - ошибки в консоли,
   - fps на слабых устройствах,
   - критические игровые сценарии.
3. Удалить флаг после стабильного окна наблюдения.

### DoD
- Есть контролируемый откат.
- Нет критических регрессий после выката.

### Выполнено
- Удален временный флаг релизной страховки `phaserStrict` из `js/config.js` после стабильного окна наблюдения.
- `js/renderers/phaser-renderer-adapter.js` возвращен к безусловным dev-assert проверкам snapshot-контракта (в dev-режиме).
- В `README.md` оставлен короткий post-release чеклист (консоль, fps на слабых устройствах, критические игровые сценарии) после удаления временного флага.

---

## Порядок PR (рекомендуемый)
1. **PR-1:** `projection.js` + переключение импортов в `physics.js`.
2. **PR-2:** удаление side effects из legacy renderer пути.
3. **PR-3:** фиксация snapshot contract + dev-валидация.
4. **PR-4:** удаление неиспользуемого canvas pipeline.
5. **PR-5:** ✅ cleanup + удаление временного feature flag.

---

## Критерии “без поломки”
- Геймплейная логика идентична до/после миграции.
- Все визуальные изменения ограничены только Phaser-слоем.
- Любой шаг можно откатить 1 коммитом.
