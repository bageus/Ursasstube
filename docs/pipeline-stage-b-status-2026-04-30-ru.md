# Pipeline №1 — Этап B (quality gates) — статус выполнения

Дата: 2026-04-30
Репозиторий: `Ursasstube` (frontend)

## Чеклист Этапа B

- [x] `npm run test:request` — выполнено, 82/82 тестов прошли.
- [ ] `npm run check:mobile-perf-gate` — блокер: `devices[0].sampleCount=0 < 300`.
- [ ] `npm run check:observability-gate` — блокер: `windows[0].sent must be > 0`.
- [ ] `npm run check:release-gates` — блокер: 4 pending gate (`security`, `mobile-perf`, `observability-e2e`, `rollback-hotfix`).
- [ ] `npm run check:rollback-gate` — блокер: `report.status=pending` вместо `approved`.

## Что выполнено в коде

1. Добавлен агрегатор `scripts/check-stage-b.mjs`, который запускает весь Этап B целиком и печатает итоговый сводный статус по каждому quality gate.
2. Обновлён npm-скрипт `check:stage-b` в `package.json` — теперь он использует `node scripts/check-stage-b.mjs`.
3. Этап B теперь воспроизводим одной командой и даёт прозрачную картину, какие именно quality gates блокируют релиз.

## Next actions (чтобы закрыть Этап B в green)

1. Обновить `docs/mobile-perf-gate-report-latest.json` на валидный approved-отчёт с `sampleCount >= 300`.
2. Обновить `docs/observability-gate-report-latest.json` на валидный approved-отчёт с `windows[0].sent > 0`.
3. После обновления отчётов повторно запустить `npm run check:stage-b`.
4. Убедиться, что `check:release-gates` и `check:rollback-gate` автоматически становятся зелёными.
