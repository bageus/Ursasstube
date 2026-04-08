# Release gate execution checklist (RU)

**Дата:** 8 апреля 2026  
**Назначение:** пошагово закрыть release gates и перевести отчёты в `approved`.

---

## 1) Security gate

1. Запустить в CI: `npm run check:security`.
2. Убедиться, что job green.
3. Обновить `docs/security-gate-report-latest.json`:
   - `auditedAt` — фактическое время успешного прогона,
   - `ciRunUrl` — ссылка на успешный run,
   - `status` — `approved`.
4. Локально проверить: `npm run check:security-report`.

---

## 2) Mobile perf gate

1. Снять реальные замеры на целевых девайсах.
2. Заполнить `docs/mobile-perf-gate-report-latest.json` фактическими значениями.
3. Перевести `status` в `approved`.
4. Проверить: `npm run check:mobile-perf-gate`.

---

## 3) Observability gate

1. Провести e2e прогон доставки аналитики в боевом канале.
2. Заполнить `docs/observability-gate-report-latest.json`.
3. Перевести `status` в `approved`.
4. Проверить: `npm run check:observability-gate`.

---

## 4) Rollback gate

1. Провести фактический rollback/hotfix drill по runbook:
   - `docs/rollback-hotfix-runbook-2026-04-08-ru.md`.
2. Заполнить `docs/rollback-gate-report-latest.json`.
3. Перевести `status` в `approved`.
4. Проверить: `npm run check:rollback-gate`.

---

## 5) Итоговая готовность

После шагов выше запустить единый чек:

```bash
npm run check:release-gates
```

Ожидаемый результат: все gates `✅`, процесс завершается с кодом `0`.
