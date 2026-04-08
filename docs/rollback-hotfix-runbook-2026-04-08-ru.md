# Rollback / Hotfix runbook (RU)

**Дата:** 8 апреля 2026  
**Цель:** обеспечить воспроизводимый rollback/hotfix процесс перед прод-релизом.

---

## 1) Trigger conditions

Запускаем rollback/hotfix процесс, если:
- критическая деградация FPS/frametime на целевых устройствах;
- потеря аналитики/доставка событий ниже целевого SLO;
- критическая функциональная регрессия после релизного выката;
- security-инцидент в runtime-зависимостях.

---

## 2) Rollback процедура

1. Зафиксировать incident-id и freeze новых деплоев.
2. Определить последний стабильный release tag.
3. Выполнить rollback-команду/процедуру деплоя на стабильный тег.
4. Выполнить smoke-проверку:
   - `Menu → Start → Game → Game Over → Store`,
   - проверка доступности API/auth/store,
   - проверка доставки analytics heartbeat/event batch.
5. Зафиксировать итог rollback в incident timeline.

---

## 3) Hotfix процедура

1. Создать ветку `hotfix/<incident-id>-<short-name>` от стабильного релизного тега.
2. Внести минимальный патч (без нерелевантных изменений).
3. Прогнать обязательные проверки:
   - `npm run check`,
   - `npm run test:request`,
   - `npm run check:security` (в CI-среде с npm advisories).
4. Создать PR с привязкой к incident-id и рискам.
5. Выполнить canary rollout и убедиться в отсутствии регрессии.
6. Выполнить полный rollout и закрыть incident.

---

## 4) Drill checklist (обязательно перед релизом)

- [ ] `releaseTagPinned` — стабильный release tag зафиксирован.
- [ ] `rollbackCommandValidated` — rollback-процедура проверена на стенде.
- [ ] `dbBackwardCompatibilityVerified` — backward compatibility подтверждена.
- [ ] `hotfixBranchFlowValidated` — hotfix flow проверен end-to-end.
- [ ] `onCallNotified` — on-call команда уведомлена о процедуре.
- [ ] `incidentTemplateReady` — шаблон инцидента и постмортема готов.

После drill заполнить `docs/rollback-gate-report-latest.json` и переключить `status` в `approved`.
