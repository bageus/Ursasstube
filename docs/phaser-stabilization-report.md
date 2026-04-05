# Phaser post-migration stabilization report (MIG-08)

Дата: 2026-04-05  
Статус: draft (заполняется после release smoke)

## 1) Окно наблюдения

- **Начало:** 2026-04-05 (pre-release validation)
- **Окончание:** TBD
- **Окружение:** local pre-release / CI-equivalent checks
- **Версия релиза (SHA):** TBD (будет зафиксирован после merge/release)

## 2) Источники метрик

- Runtime event stream: `ursas:perf-sample`
- Runtime aggregate event: `ursas:perf-summary` (включая visibility + screen transition stats)
- Dev helper: `window.ursasPerf.getSummary()`
- Smoke helper: `window.ursasPerf.getSmokeChecklistStatus()`
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
- **Критерии закрытия:**
  - KPI стабильны в пределах ожидаемого диапазона;
  - нет P0/P1 регрессий в gameplay/UI loop;
  - Canvas runtime-path отсутствует и guardrails зелёные.
- **Ответственный:** TBD
