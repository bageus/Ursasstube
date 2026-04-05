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
| FPS p50 | TBD | TBD | TBD | ⏳ |
| FPS p95 | TBD | TBD | TBD | ⏳ |
| Frame time p50 (ms) | TBD | TBD | TBD | ⏳ |
| Frame time p95 (ms) | TBD | TBD | TBD | ⏳ |
| Ping p50 (ms) | TBD | TBD | TBD | ⏳ |
| JS errors / 1k sessions | TBD | TBD | TBD | ⏳ |
| Crash-free sessions | TBD | TBD | TBD | ⏳ |
| Visibility transitions (hidden/visible) | TBD | TBD | TBD | ⏳ |
| Screen transitions parity (menu/store/rules/gameplay/game-over) | TBD | TBD | TBD | ⏳ |

## 4) Automated smoke snapshot (synthetic baseline)

- Command: `npm run check:mig08-smoke`
- Run date: 2026-04-05
- sampleCount: `120`
- KPI (synthetic): fps p50/p95 = `60/62`, frameMs p50/p95 = `16.67/17.24`, ping p50/p95 = `73/76`
- smokeChecklist: `5/5` (gameplay, game-over, menu return, pause/resume, store/rules)

> Важно: это synthetic baseline для проверки runtime event-flow и работоспособности агрегатора. Он не заменяет manual gameplay/mobile smoke из раздела ниже.

## 5) Smoke log

- [x] Технические guardrails: `npm run check` (включая `check:no-legacy-canvas-runtime`) + `npm run build` (повторно подтверждено на SHA `7bf1984`, 2026-04-05)
- [x] Автоматизированный runtime smoke: `npm run check:mig08-smoke` (snapshot: sampleCount=120, smokeChecklist=5/5)
- [ ] Старт игры
- [ ] 3–5 минут геймплея
- [ ] Сбор монет/бонусов
- [ ] Столкновение/game over
- [ ] Рестарт
- [ ] Пауза/возврат в меню
- [ ] Mobile viewport (resize/rotation)

## 6) Инциденты и корректировки

| Дата | Симптом | Severity | Root cause | Fix | Owner | Статус |
|---|---|---|---|---|---|---|
| TBD | — | — | — | — | — | — |

## 7) Решение о закрытии MIG-08

- **Решение:** в работе (technical guardrails + automated smoke закрыты, ожидается manual gameplay smoke).
- **Ближайшее действие:** выполнить manual smoke-сессию (desktop + mobile viewport) и заполнить KPI snapshot фактическими значениями из `window.ursasPerf.getSummary()`.
- **Критерии закрытия:**
  - KPI стабильны в пределах ожидаемого диапазона;
  - нет P0/P1 регрессий в gameplay/UI loop;
  - Canvas runtime-path отсутствует и guardrails зелёные.
- **Ответственный:** TBD
