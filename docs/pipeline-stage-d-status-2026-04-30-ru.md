# Pipeline №1 — Этап D (ежемесячный burn-down) — статус выполнения

Дата: 2026-04-30
Репозиторий: `Ursasstube` (frontend)

## Чеклист Этапа D

- [x] Сформирован список deprecated-кандидатов в `js/` root.
- [x] Зафиксирован machine-readable отчёт burn-down baseline/progress.
- [x] Добавлен reproducible запуск одной командой `npm run report:stage-d-burndown`.

## Что внедрено

1. Добавлен скрипт `scripts/build-stage-d-report.mjs`.
2. Добавлена npm-команда `report:stage-d-burndown`.
3. Скрипт генерирует:
   - `docs/stage-d-burndown-latest.json`
   - `docs/stage-d-burndown-YYYY-MM-DD.json`

## Результат текущего прогона

- Deprecated candidates в `js/` root: **46**.
- Baseline (зафиксирован):
  - `unusedExports`: 1
  - `implicitGlobalWrites`: 3
  - `oversizedModules`: 0
- Прогресс текущего цикла: deltas = 0 (снимок инициализации Этапа D).

## Next actions

1. Назначить владельцев на каждый deprecated candidate и план миграции по доменам (`features/*`, `core/*`).
2. В следующем цикле уменьшить baseline `implicitGlobalWrites` с 3 до 2.
3. Добавить fail-threshold в CI: при росте baseline-метрик относительно предыдущего месячного снимка.
