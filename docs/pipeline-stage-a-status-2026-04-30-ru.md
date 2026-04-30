# Pipeline №1 — Этап A (статический слой) — статус выполнения

Дата: 2026-04-30
Репозиторий: `Ursasstube` (frontend)

## Чеклист Этапа A

- [x] `npm run check:syntax` — выполнено.
- [x] `npm run check:static-analysis` — выполнено.
- [x] `npm run check:no-window-assign` — выполнено.
- [x] `npm run check:asset-paths` — выполнено.
- [x] `npm run check:unused-code` — выполнено (добавлен отдельный скрипт и включён в общий `check`).

## Что именно внедрено

1. Добавлена команда `check:unused-code` в `package.json`.
2. Обновлена агрегированная команда `check` — теперь в неё входит шаг `check:unused-code`.
3. Добавлен файл `scripts/check-unused-code.mjs`:
   - сканирует `js/` и `scripts/`;
   - строит карту imports/exports;
   - падает на новых неиспользуемых экспортов (вне baseline);
   - печатает baseline-долг отдельно для плановой вычистки.

## Результат

Этап A внедрён и формально исполняется в стандартном quality pipeline проекта.
