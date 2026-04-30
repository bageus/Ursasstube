# Глубокий аудит Ursasstube (frontend) — 30.04.2026

## Что проверено
- Структура модулей `js/`, `scripts/`, `css/`.
- Наличие неиспользуемого кода через текущие проектные гейты (`check:static-analysis`, `check:syntax`).
- Потенциальные дубли и точки рефакторинга в UI/CSS и runtime-слоях.

## Быстрые выводы
1. **Критичных блокеров по синтаксису/guardrails нет** — проект проходит внутренние проверки.
2. **Главный технический долг во фронтенде — стили UI**: много семейств кнопок с почти одинаковой механикой (`.btn-new`, `.go-btn`, `.store-nav-btn`, `.payment-secondary-btn`, `.pm-share-btn`, `.wallet-btn-corner`).
3. **Дублирование логики анимаций и состояний** (`:hover`, `:active`, `muted/disabled/connected`) реализовано на уровне конкретных классов, а не дизайн-токенов/утилит.
4. **Архитектурно код разделён неплохо** (game/store/phaser/auth), но присутствует риск «drift» между legacy-слоем (`js/*.js`) и подсистемами (`js/game/*`, `js/phaser/*`).

---

## Найденные зоны дублей/неэффективности

### 1) CSS: кнопки и интерактивные элементы
**Симптом:** повторяемые паттерны стеклянного фона, бордера, hover/active трансформаций.

**Где видно:**
- `wallet-btn-corner`
- `link-btn`
- `btn-new`
- `go-btn`
- `store-nav-btn`
- `store-back-btn`
- `payment-secondary-btn`
- `pm-share-btn`

**Риск:**
- сложно поддерживать консистентность;
- правка состояний/доступности требует каскадных изменений;
- рост CSS и вероятность конфликтов по специфичности.

**Рефакторинг:**
- Ввести слой **component tokens** + базовые utility-классы:
  - `.ui-btn`, `.ui-btn--primary`, `.ui-btn--secondary`, `.ui-btn--ghost`, `.ui-btn--danger`
  - `.ui-btn--icon`, `.ui-btn--lg`, `.ui-btn--sm`
  - состояния: `[data-state="connected"]`, `[aria-disabled="true"]`, `.is-muted`
- Для текущих классов оставить обратную совместимость через composition (поэтапная миграция).

### 2) Разрозненные точки ответственности в runtime/UI
**Симптом:** большой набор файлов в корне `js/` плюс доменные директории `js/game`, `js/store`, `js/phaser`.

**Риск:**
- часть логики живёт в историческом слое,
- тяжело быстро ответить «где источник истины» для конкретной фичи.

**Рефакторинг:**
- Зафиксировать правило: **новый код только в доменные папки**.
- Ввести `js/core/` (event bus, lifecycle hooks, runtime contracts).
- В legacy-файлах оставить thin adapters + deprecation-комментарии.

### 3) Потенциальный «мертвый код» и устаревшие API
Текущие гейты показывают baseline на неиспользуемый export/implicit global writes, но этого мало для фактической чистки.

**Рефакторинг/оптимизация анализа:**
- Добавить отчетность по импорту/экспорту (например, `knip` или кастомный graph-check script).
- В CI: падать только при **новом** мертвом коде (baseline strategy уже частично используется — продолжить).

### 4) Нагрузочные места для mobile perf
Проект уже имеет mobile perf gate, но стили и эффекты всё ещё активно используют blur/glow/box-shadow.

**Оптимизация:**
- ввести `@media (prefers-reduced-motion: reduce)` и low-power theme;
- централизовать тяжелые эффекты через токены `--fx-glow-*`, чтобы быстро деградировать на слабых девайсах.

---

## Pipeline №1: глубокая техпроверка (дубли, dead code, эффективность)

### Этап A — статический слой (каждый PR)
1. `npm run check:syntax`
2. `npm run check:static-analysis`
3. `npm run check:no-window-assign`
4. `npm run check:asset-paths`
5. Новый шаг: `npm run check:unused-code` (добавить)

**Цель:** не пускать новый техдолг.

### Этап B — quality gates (каждый PR)
1. `npm run test:request`
2. `npm run check:mobile-perf-gate`
3. `npm run check:observability-gate`
4. `npm run check:release-gates`
5. `npm run check:rollback-gate`

**Цель:** не ломать прод-качество и наблюдаемость.

### Этап C — еженедельный аудит (scheduled)
1. Отчет по дублированию CSS-селекторов и button variants.
2. Отчет по orphan assets (`public/assets`, `public/img`).
3. Отчет по runtime footprint (largest modules, hot paths, event listeners).

### Этап D — ежемесячный burn-down
1. Список deprecated-файлов в `js/` root.
2. План удаления/слияния модулей.
3. Прогресс против baseline (unused exports, implicit writes, oversized files).

---

## Отдельная задача: backend-ревью (репозиторий URSASS_Backend)
Для комплексной проверки нужно зеркально применить этот же pipeline к backend-репозиторию:
- архитектурные дубли сервисов,
- неиспользуемые endpoints/DTO,
- индексы и N+1,
- caching policy,
- observability/rollback gates.

(В этом коммите выполнен аудит только текущего frontend-репозитория.)
