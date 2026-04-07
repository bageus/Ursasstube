# Debug guide (quick)

## 1) Быстрый triage

1. Воспроизведите баг локально (`npm run dev`).
2. Зафиксируйте сценарий (шаги + ожидаемое/фактическое).
3. Прогоните базовые проверки:

```bash
npm run check
npm run build
```

## 2) Gameplay / runtime

- Проверяйте модули в `js/game/` и `js/phaser/`.
- Для lifecycle-проблем (init/destroy/resize) сначала запускайте unit-сеты из `test:request`.
- Если баг проявляется только после нескольких запусков ранa, проверьте cleanup и подписки lifecycle.

## 3) Store / economy

- Точки входа: `js/store/`.
- Проверяйте, что после покупки/использования ride состояние и UI синхронизированы.
- Для регрессий экономики прогоняйте тесты math/analytics/store контрактов.

## 4) Network/API

- Сетевой контракт централизован в `js/request.js`.
- Если есть падения на JSON/HTTP, проверяйте использование `requestJson` / `requestJsonResult`.
- Для нестабильности запросов проверяйте профиль timeout/retries соответствующего endpoint.

## 5) Analytics

- Эмиссия событий: `js/analytics.js` и доменные сервисы.
- Доставка/батчинг: `js/analytics-delivery.js`.
- Отчётность: `js/analytics-metrics.js` + `scripts/build-product-metrics-report.mjs`.

## 6) Перед отправкой PR

Минимум:

```bash
npm run test:request
npm run test:e2e-smoke
npm run check
```

Если меняется поведение прод-плана/процесса — обновите `docs/plan-prod-release-2026-04-07-ru.md`.
