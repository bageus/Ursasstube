# Ursass Tube — Patch Plan: перегрев на стартовом экране (Telegram Mini App)

**Дата:** 30 апреля 2026  
**Контекст:** предрелизный критический perf-issue на мобильных устройствах

## Проблема

На стартовом экране до нажатия `Start Game` запускался тяжёлый runtime/рендер-path, что приводило к повышенной CPU/GPU нагрузке и нагреву устройства.

## Подтверждённые причины

1. Инициализация Phaser renderer происходила на bootstrap (до старта ранa).
2. Main loop запускался слишком рано.
3. Стартовое меню было UI-оверлеем, но игровой runtime уже существовал.

## Цель патча

- Поднимать Phaser только после нажатия `Start Game`.
- Держать меню лёгким (без фонового тяжёлого рендера).
- После выхода в меню — опускать нагрузку обратно.
- Сохранить игровой feel: target FPS **не снижать**.

## Технический план (по файлам)

### 1) `js/game.js`

- Ввести ленивый lifecycle renderer:
  - `ensureRendererReady()`
  - `destroyRenderer()`
  - сериализация через `rendererInitPromise`.
- Убрать eager renderer init из `initGame()`.
- Передать lifecycle-функции в session controller.

### 2) `js/game/session.js`

- В `startGame` перед `actualStartGame` вызывать `ensureRendererReady()`.
- После инициализации делать `syncViewport()` и только потом запуск run.
- На `goToMainMenu()` вызывать `destroyRenderer()` для полного teardown.
- Запуск loop только при первом gameplay (`gameplayLoopStarted`).

### 3) `js/game/bootstrap.js`

- Убрать автоматический вызов `startMainLoop()` на bootstrap.
- Оставить deferred-подход: loop стартует в gameplay-пути.

## Риски и контроль

- **Риск:** первый старт ранa может занять немного больше времени.
  - **Митигировать:** использовать transition/preload слой и fallback на ошибку init.
- **Риск:** race-condition при повторных нажатиях `Start`.
  - **Митигировать:** единый `rendererInitPromise`.

## Acceptance criteria

1. На меню до `Start Game` Phaser runtime не выполняет тяжёлую отрисовку.
2. После `Start Game` runtime и сцена поднимаются в рамках transition/preload.
3. После `Game Over -> Menu` нагрузка снова падает.
4. FPS gameplay остаётся 60-target.

<<<<<<< codex/investigate-and-fix-overheating-on-start-screen-aema9w
## Preload black-screen mitigation (новый блок)

### Варианты решения

1. **Warm-up кадр до снятия preloading overlay**  
   После `ensureRendererReady()` принудительно отрисовать первый snapshot и дождаться минимум 1–2 RAF перед скрытием transition.

2. **Fail-safe таймаут готовности рендера**  
   Если warm-up подтверждение задерживается, не блокировать старт бесконечно: снимать preload по timeout (например 700–900ms), чтобы избежать зависаний.

3. **Scene-level ready event из Phaser**  
   Эмитить explicit событие из Phaser-сцены после первого стабильного `applySnapshot`/draw и стартовать геймплей только после него.

4. **Placeholder-first strategy**  
   Показать лёгкий placeholder (градиент/статичное изображение туннеля) до первого реального кадра Phaser, затем кроссфейд.

### План следующей итерации

- [x] Пункт 1: warm-up кадр перед снятием preload.
- [x] Пункт 2: fail-safe timeout готовности.
- [ ] Пункт 3: scene-level ready event (при необходимости).
- [ ] Пункт 4: placeholder-first strategy (опционально).

=======
>>>>>>> dev2
## Smoke-checklist

1. Open app -> 60s idle on menu (без заметного нагрева).
2. Start Game -> корректный preload -> старт ранa.
3. Game Over -> Menu -> повторный idle (нагрузка ниже gameplay).
4. Повторить цикл 3–5 раз (без деградации/утечек).

## Статус

План оформлен в репозитории как отдельный документ для трекинга и ревью.
