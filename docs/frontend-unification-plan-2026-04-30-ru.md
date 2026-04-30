# План №2: приведение фронтенда к единой понятной структуре и единым стилям

## Цель
Сделать UI предсказуемым и консистентным: одинаковые кнопки, тексты, состояния, отступы и поведение на всех экранах (start/game-over/store/player menu/auth).

## Целевая структура

### 1) CSS-архитектура (слои)
- `css/tokens.css` — цвета, размеры, радиусы, тени, motion-токены.
- `css/base.css` — reset, typography base, helpers.
- `css/components/buttons.css` — единый button-system.
- `css/components/inputs.css` — формы/переключатели.
- `css/layout/*.css` — screen layout blocks.
- `css/screens/*.css` — точечные экранные исключения.

> На первом этапе можно не дробить физически файлы, а хотя бы ввести секции и naming policy в текущем `css/style.css`.

### 2) Button Design System
- База: `.ui-btn`
- Варианты: `.ui-btn--primary`, `--secondary`, `--ghost`, `--danger`
- Размеры: `--sm`, `--md`, `--lg`, `--icon`
- Состояния: `:hover`, `:active`, `:focus-visible`, `[disabled]`, `.is-loading`, `.is-muted`

Миграция:
- `wallet-btn-corner` -> `ui-btn ui-btn--secondary ui-btn--sm`
- `btn-new` -> `ui-btn ui-btn--primary ui-btn--lg`
- `go-btn-share`/`go-btn-menu` -> `ui-btn ui-btn--secondary`
- `store-nav-btn` -> `ui-btn ui-btn--icon`

### 3) Типографика
- Ввести scale: `--font-xs/sm/md/lg/xl`.
- Вынести повторяемые text-styles:
  - `.ui-title`, `.ui-subtitle`, `.ui-caption`, `.ui-mono-meta`.
- Убрать точечные «магические» размеры, где это возможно.

### 4) Единая структура JS по доменам
- `js/core/` — общая инфраструктура (events, lifecycle, request wrappers).
- `js/features/auth/`
- `js/features/game/`
- `js/features/store/`
- `js/features/player-menu/`
- `js/integrations/` (telegram/metamask/walletconnect/posthog)

## Пошаговый rollout (без большого взрыва)

### Этап 1 (1 спринт)
1. ✅ Зафиксировать naming convention (BEM/utility hybrid).
2. ✅ Добавить `ui-btn` и мигрировать 2 экрана: старт + game over.
3. ✅ Добавить линт-правило/скрипт: запрет новых button-классов без `ui-btn`.

### Этап 2 (1–2 спринта)
1. ✅ Миграция store/player-menu/auth кнопок.
2. ✅ Унификация typography scale.
3. ✅ Удаление дублирующих/осиротевших CSS-блоков после миграции выполнено.

### Этап 3 (1 спринт)
1. 🔄 Частично: добавлены feature/core/integration entry-points, начат перенос точек входа (main/game/store/posthog + runtime imports).
2. 🔄 Частично: добавлены thin-adapters (re-export) для обратной совместимости и идёт перевод модулей на adapter-импорты.
3. ⏳ Финальная чистка dead selectors и orphan utils.

## KPI успеха
- Количество уникальных button-классов: снизить минимум на 40%.
- Количество повторяющихся hover/active блоков: снизить минимум на 60%.
- Время на добавление нового экрана: -25% (оценочно по velocity).
- Mobile perf gate: без деградации p95 кадра/интеракций.

## Definition of Done
- ✅ Все новые кнопки используют только `ui-btn`-систему (проверяется скриптом `check-ui-buttons`).
- Нет прямого копирования старых button-стилей в новых фичах.
- Документация по UI-конвенциям добавлена в `docs/`.
