# Аудит миграции Canvas → Phaser (2026-04-05)

## Итог

Миграция **выполнена полностью для активного runtime-пути**:

- в активных runtime-файлах не найдено legacy Canvas-паттернов;
- guardrail `check:no-legacy-canvas-runtime` проходит;
- общий пайплайн `npm run check` проходит полностью (включая synthetic MIG-08 smoke 6/6).

## Что проверено

### 1) Автоматические проверки

Запущен полный набор проверок:

```bash
npm run check
```

Результат:

- syntax checks — OK;
- static analysis — OK;
- no-window-assign guardrail — OK;
- public asset paths — OK;
- no-legacy-canvas-runtime — OK;
- MIG-08 smoke snapshot — OK (`smokeChecklist: 6/6`).

### 2) Поиск Canvas-следов в активном коде

Дополнительно выполнен поиск по репозиторию:

```bash
rg -n "canvas|Canvas|getContext\(" js index.html scripts/check-no-legacy-canvas-runtime.mjs
```

Итог:

- в `js/` и `index.html` Canvas-следов не найдено;
- совпадения есть только в guardrail-скрипте `scripts/check-no-legacy-canvas-runtime.mjs` (это ожидаемо и корректно).

## Неиспользуемый / проблемный / дублирующийся код

### Найдено

1. **Дубли в документации миграции**
   - в `docs/phaser-full-migration-plan.md` были продублированы четыре пункта этапа 6.
   - дубли удалены в рамках этого аудита.

2. **Технический долг (не блокирует миграцию)**
   - static-analysis отмечает baseline oversized modules (например `js/auth.js`, `js/physics.js`, `js/phaser/entities/EntityRenderer.js`, `js/phaser/tunnel/TunnelRenderer.js`).
   - это не регрессия и не признак незавершённой Canvas→Phaser миграции, но зона для дальнейшей декомпозиции.

## Вывод

- Активный игровой runtime — Phaser-only.
- Критичных следов Canvas-runtime не осталось.
- Обнаруженный дублирующийся контент в документации устранён.
