# Prompt для backend: AI-режим + whitelist кошельков

Используй этот prompt для внесения изменений в `URSASS_Backend`:

---

Реализуй поддержку AI-режима для фронтенда URSASS Tube с **ограничением доступа только для whitelisted кошельков**.

## 1) Где хранить whitelist
Добавь явный блок с кошельками в отдельный конфиг-файл (или в `routes/game.js` рядом с runtime config), чтобы место вставки было очевидным.

Обязательно оставь такой комментарий:

```js
// AI_WHITELIST_START
// add allowed wallets here (lowercase)
const AI_MODE_WALLET_WHITELIST = [
  // '0x1234...abcd',
];
// AI_WHITELIST_END
```

Все сравнения кошельков должны быть в lowercase.

## 2) Что вернуть в API конфиг/апгрейды
Для whitelisted кошельков backend должен возвращать в ответе `activeEffects` флаг доступа к AI:
- `ai_mode_access: true`

Для остальных:
- `ai_mode_access: false` (или отсутствие флага)

Предпочтительно отдать этот флаг в:
- `GET /api/store/upgrades/:wallet`
- и/или `GET /api/game/config` (если есть auth-mode вариант)

## 3) Валидация входных AI-настроек
Поддержи прием AI-настроек в запросе старта заезда/сессии (если такой endpoint есть) с ограничениями:
- `enabled` (boolean)
- `distance` (integer >= 0)
- `spinCount` (integer >= 0)
- `combo` (boolean)
- `priority` in `gold | silver | bonus | score | different`

Если кошелек не в whitelist и `enabled=true`, backend должен игнорировать AI и/или возвращать 403 с понятной причиной.

## 4) Логирование и безопасность
- Логируй факт включения AI-режима и wallet.
- Не доверяй фронту: повторно проверяй whitelist на backend.
- Не ломай текущий flow авторизации/подписи.

## 5) Тесты
Добавь тесты:
- whitelisted wallet получает `ai_mode_access: true`;
- обычный wallet не получает доступ;
- попытка не-whitelisted включить AI отклоняется;
- валидация `distance`, `spinCount`, `priority`.

---

Ожидаемый результат: фронтенд может безопасно включать AI-режим только для разрешенных кошельков, а место вставки whitelist в коде помечено явным блоком `AI_WHITELIST_START/END`.
