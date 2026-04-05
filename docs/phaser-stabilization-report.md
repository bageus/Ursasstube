# Phaser post-migration stabilization report (MIG-08)

Дата: 2026-04-05  
Статус: draft (заполняется после release smoke)

## 1) Окно наблюдения

- **Начало:** 2026-04-05 (pre-release validation)
- **Окончание:** TBD
- **Окружение:** local pre-release / CI-equivalent checks
- **Версия релиза (SHA):** 7bf1984 (pre-release technical validation)

## 2) Источники метрик

- Runtime event stream: `ursas:perf-sample`
- Runtime aggregate event: `ursas:perf-summary` (включая visibility + screen transition stats)
- Smoke milestone event: `ursas:smoke-step-completed` (публикуется при первом прохождении каждого smoke-шагa)
- Dev helper: `window.ursasPerf.getSummary()`
- Report helper: `window.ursasPerf.getMIG08Snapshot()` (готовый snapshot для заполнения KPI/smoke секций)
- Smoke helper: `window.ursasPerf.getSmokeChecklistStatus()` (включая `firstObservedAt` timestamps по ключевым smoke-сигналам)
- QA helper: `window.ursasPerf.simulateSmokeFlow()` (локальная проверка smoke-агрегации и milestone events без ручного прогона)
- Guardrails: `npm run check` + `npm run check:no-legacy-canvas-runtime`
- Automated MIG-08 smoke harness: `npm run check:mig08-smoke` (synthetic perf samples + `window.ursasPerf.simulateSmokeFlow()`)

## 3) KPI snapshot

| Метрика | Baseline (до миграции) | Текущий Phaser | Δ | Статус |
|---|---:|---:|---:|---|
| FPS p50 | TBD | 60 | n/a (synthetic baseline) | ⚠️ synthetic |
| FPS p95 | TBD | 62 | n/a (synthetic baseline) | ⚠️ synthetic |
| Frame time p50 (ms) | TBD | 16.67 | n/a (synthetic baseline) | ⚠️ synthetic |
| Frame time p95 (ms) | TBD | 17.24 | n/a (synthetic baseline) | ⚠️ synthetic |
| Ping p50 (ms) | TBD | 73 | n/a (synthetic baseline) | ⚠️ synthetic |
| JS errors / 1k sessions | TBD | 0 (local harness) | n/a | ⚠️ synthetic |
| Crash-free sessions | TBD | 100% (local harness run) | n/a | ⚠️ synthetic |
| Visibility transitions (hidden/visible) | TBD | 1 / 1 | n/a | ✅ harness |
| Screen transitions parity (menu/store/rules/gameplay/game-over) | TBD | menu=1/store=1/rules=0/gameplay=1/game-over=1 | n/a | ✅ harness |

## 4) Smoke log

- [x] Технические guardrails: `npm run check` (включая `check:no-legacy-canvas-runtime`) + `npm run build` (повторно подтверждено на SHA `7bf1984`, 2026-04-05)
- [x] Автоматизированный runtime smoke: `npm run check:mig08-smoke` (snapshot: sampleCount=120, smokeChecklist=5/5)
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

- **Решение:** в работе (technical guardrails + automated smoke закрыты, ожидается manual gameplay smoke).
- **Ближайшее действие:** выполнить manual smoke-сессию (desktop + mobile viewport) и заполнить KPI snapshot фактическими значениями из `window.ursasPerf.getSummary()`.
- **Критерии закрытия:**
  - KPI стабильны в пределах ожидаемого диапазона;
  - нет P0/P1 регрессий в gameplay/UI loop;
  - Canvas runtime-path отсутствует и guardrails зелёные.
- **Ответственный:** TBD
