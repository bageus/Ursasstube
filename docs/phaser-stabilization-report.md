# Phaser post-migration stabilization report (MIG-08)

Дата: 2026-04-05  
Статус: draft (заполняется после release smoke)

## 1) Окно наблюдения

- **Начало:** 2026-04-05 (pre-release validation)
- **Окончание:** TBD
- **Окружение:** local pre-release / CI-equivalent checks
- **Версия релиза (SHA):** 2192122 (pre-release technical validation)

## 2) Источники метрик

- Runtime event stream: `ursas:perf-sample`
- Runtime aggregate event: `ursas:perf-summary` (включая visibility + screen transition stats)
- Smoke milestone event: `ursas:smoke-step-completed` (публикуется при первом прохождении каждого smoke-шагa)
- Dev helper: `window.ursasPerf.getSummary()`
- Report helper: `window.ursasPerf.getMIG08Snapshot()` (готовый snapshot для заполнения KPI/smoke секций)
- Smoke helper: `window.ursasPerf.getSmokeChecklistStatus()` (включая `firstObservedAt` timestamps по ключевым smoke-сигналам)
- QA helper: `window.ursasPerf.simulateSmokeFlow()` (локальная проверка smoke-агрегации и milestone events без ручного прогона)
- Guardrails: `npm run check` + `npm run check:no-legacy-canvas-runtime`

## 3) KPI snapshot

| Метрика | Baseline (до миграции) | Текущий Phaser | Δ | Статус |
|---|---:|---:|---:|---|
| FPS p50 | TBD | TBD | TBD | ⏳ |
| FPS p95 | TBD | TBD | TBD | ⏳ |
| Frame time p50 (ms) | TBD | TBD | TBD | ⏳ |
| Frame time p95 (ms) | TBD | TBD | TBD | ⏳ |
| Ping p50 (ms) | TBD | TBD | TBD | ⏳ |
| JS errors / 1k sessions | TBD | TBD | TBD | ⏳ |
| Crash-free sessions | TBD | TBD | TBD | ⏳ |
| Visibility transitions (hidden/visible) | TBD | TBD | TBD | ⏳ |
| Screen transitions parity (menu/store/rules/gameplay/game-over) | TBD | TBD | TBD | ⏳ |

## 4) Smoke log

- [x] Технические guardrails: `npm run check` (включая `check:no-legacy-canvas-runtime`) + `npm run build`
- [ ] Старт игры
- [ ] 3–5 минут геймплея
- [ ] Сбор монет/бонусов
- [ ] Столкновение/game over
- [ ] Рестарт
- [ ] Пауза/возврат в меню
- [ ] Mobile viewport (resize/rotation)

## 5) Инциденты и корректировки

| Дата | Симптом | Severity | Root cause | Fix | Owner | Статус |
|---|---|---|---|---|---|---|
| TBD | — | — | — | — | — | — |

## 6) Решение о закрытии MIG-08

- **Решение:** TBD
- **Ближайшее действие:** выполнить manual smoke-сессию (desktop + mobile viewport) и заполнить KPI snapshot фактическими значениями из `window.ursasPerf.getSummary()`.
- **Критерии закрытия:**
  - KPI стабильны в пределах ожидаемого диапазона;
  - нет P0/P1 регрессий в gameplay/UI loop;
  - Canvas runtime-path отсутствует и guardrails зелёные.
- **Ответственный:** TBD
