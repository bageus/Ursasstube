# Ursasstube

Мини-игра с бесконечным раннером в тоннеле, апгрейдами, store-циклом и web-runtime на Vite + ESM.

## Product overview

Ursasstube — это arcade loop с короткими сессиями:
- старт ранa,
- уклонение от препятствий и сбор ресурсов,
- завершение сессии,
- покупка улучшений в store,
- повторный запуск с прогрессом.

Фокус прод-итераций: стабильность runtime, воспроизводимые релизные gate, продуктовая аналитика и улучшение UX/баланса.

## Gameplay loop

Базовый игровой цикл:
1. `Menu` → запуск игры.
2. `Game` → ран, obstacle/bonus interactions, счёт/дистанция/монеты.
3. `Game Over` → итог сессии.
4. `Store` → использование валют, покупка апгрейдов/райдов.
5. Возврат в игру с обновлённым состоянием.

Smoke-сценарий для gate: `Menu → Start → Game → Game Over → Store`.

## Tech stack

- **Runtime:** Vanilla JS (ES modules).
- **Bundler/dev-server:** Vite.
- **Rendering/gameplay:** Canvas + Phaser runtime-модули.
- **State/storage:** клиентское состояние + browser persistence.
- **Validation:** custom guardrails + smoke + unit suites (`npm run check`).

## Architecture

Ключевые зоны кода:
- `js/game-runtime.js` — bootstrap приложения и runtime wiring.
- `js/game/` — gameplay/session flow.
- `js/store/` — store, upgrades, rides, donations и связанные сервисы.
- `js/request.js` — сетевой слой (request profiles, safe JSON contracts).
- `js/analytics*.js` — события, доставка, метрики.
- `js/phaser/` — Phaser runtime lifecycle-контроллер и интеграция.

Подробная документация:
- `docs/refactor-architecture.md`
- `docs/state-ownership.md`
- `docs/plan-prod-release-2026-04-07-ru.md`

## How to run

Требования:
- Node.js **22+** (см. `.nvmrc`).

Установка и запуск:

```bash
npm install
npm run dev
```

Сборка и локальный preview:

```bash
npm run build
npm run preview
```

## Production domain checklist

Текущая production-схема доменов:
- `ursasstube.fun` — лендинг/основной сайт,
- `play.ursasstube.fun` — фронтенд игры,
- `api.ursasstube.fun` — backend API.

При переключении frontend-домена (например, на `ursasstube.fun`) код приложения почти не требует изменений, но нужна операционная настройка:

1. Настроить DNS-записи и HTTPS-сертификат на хостинге frontend.
2. Добавить новый origin в CORS allowlist backend.
3. Проверить домены/redirect URI в внешних интеграциях (Telegram Mini App, OAuth-провайдеры, wallet deep links).
4. Обновить публичные ссылки в документации и мониторинге (если где-то остался старый host).
5. Прогнать smoke-check после выката (`npm run check`, затем ручной `Menu → Start → Game Over → Store`).

Технически frontend собран с относительным `base` (`vite.config.js`), поэтому assets остаются переносимыми между доменами без ребилда под конкретный host.

## Quality gates

Основной gate перед merge/release:

```bash
npm run check
```

`npm run check` включает:
- syntax check,
- static-analysis guardrails,
- регрессионные runtime-проверки,
- e2e smoke (`test:e2e-smoke`),
- unit/integration suite (`test:request`).

## Debug guide

Короткий практический debug-чеклист вынесен в `docs/debug-guide.md`:
- быстрый triage,
- где смотреть при проблемах gameplay/store/network/analytics,
- какие команды запускать локально перед фиксом.

## Repository merge flow (Phaser)

Для merge-потока экспериментальной Phaser-ветки см. `docs/phaser-repo-merge.md`.

## Changelog: Leaderboard insights support

Добавлена поддержка нового leaderboard insights API для экрана **Game Over**:

- Клиент leaderboard теперь использует `GET /api/leaderboard/top?wallet=<wallet>&v=2` при наличии wallet и остается совместимым с V1-ответами.
- Реализован fallback: если insights не пришли в `top`, выполняется запрос `GET /api/leaderboard/insights?wallet=<wallet>`.
- Добавлены типы и runtime-валидация `playerInsights` с безопасной обработкой `nullable` полей.
- Обновлена логика заголовков/сравнения/CTA в Game Over и soft-fail UX для ошибок insights.
- Добавлены события аналитики:
  - `game_over_insights_shown`
  - `game_over_target_cta_click`
  - `game_over_insights_unavailable`

### JSON примеры, использованные для UI-тестирования

**V1 (без insights):**

```json
{
  "leaderboard": [
    { "wallet": "0x1111", "score": 920 },
    { "wallet": "0x2222", "score": 870 }
  ],
  "playerPosition": 153
}
```

**V2 (полные insights):**

```json
{
  "leaderboard": [
    { "wallet": "0x1111", "score": 920 },
    { "wallet": "0x2222", "score": 870 }
  ],
  "playerPosition": 42,
  "playerInsights": {
    "isFirstRun": false,
    "isPersonalBest": true,
    "rank": 42,
    "comparisonMode": "first_run_score",
    "percentileFirstRunScore": 91,
    "recommendedTarget": { "type": "score", "label": "TOP 10", "delta": 120 },
    "nextTargets": [
      { "type": "score", "label": "TOP 5", "delta": 220 },
      { "type": "distance", "label": "500m", "delta": 30 }
    ]
  }
}
```

**V2 (partial/null insights):**

```json
{
  "leaderboard": [
    { "wallet": "0x1111", "score": 920 }
  ],
  "playerPosition": 88,
  "playerInsights": {
    "comparisonMode": "none",
    "percentileFirstRunCoins": null,
    "recommendedTarget": null,
    "nextTargets": [
      { "label": "Coins", "delta": "5" }
    ]
  }
}
```

## Player Menu & Referral UX

### Added in PR-3 (Frontend)

#### Player Avatar Button
- A circular avatar button (`#playerAvatarBtn`) is shown in `#walletCorner` when the player is authenticated (Telegram or Wallet).
- Clicking it opens the **Player Menu Overlay**.

#### Player Menu Overlay (`#playerMenuOverlay`)
A full-screen overlay (`z-index: 150`) providing:
- **Rank & Best Score** – loaded from `GET /api/account/me/profile`.
- **Referral Link** – read-only input with one-click copy button.
- **Share Button** (`#pmShareBtn`):
  - `CONNECT X` if X not connected.
  - `SHARE +N 🪙` if X connected and `canShareToday`.
  - `SHARE RESULT` if X connected but already shared today.
- **Share Streak** – row of 🔥 icons (hidden if streak = 0).
- **Connect Telegram** – transfers "Link Telegram" flow from `#walletInfo` to this panel.
- **Connect / Disconnect X** – X OAuth flow with hover/long-press disconnect.
- **Connect Wallet** – shown only for Telegram-auth users without a linked wallet.

#### Share Flow (`js/share/shareFlow.js`)
1. `POST /api/share/start` → open Twitter/X intent URL.
2. After ≥30 s: auto-call `POST /api/share/confirm`.
3. On 425 `too_early` → retry after `secondsLeft + 1` s.
4. On success → toast "+N 🪙 gold earned for sharing!".

#### Referral Capture (`js/referral/referralCapture.js`)
- On page load: reads `?ref=XXXXXXXX` (8-char uppercase alphanum), stores in `localStorage`, removes from URL.
- After auth: calls `POST /api/referral/track { ref }` and clears `localStorage`.

#### X OAuth Callback
- Detects `?x=connected&username=...` / `?x=error&reason=...` on page load.
- Shows toast and removes query params.

#### Game Over Share Button
- Hidden for unauthenticated users.
- Shows "CONNECT X", "SHARE +N 🪙", or "SHARE RESULT" depending on profile state.

### Smoke tests
See [`docs/player-menu-smoke.md`](docs/player-menu-smoke.md) for full manual smoke scenarios.

## PostHog analytics (EU)

Подключена клиентская интеграция PostHog, которая слушает внутренние события `trackAnalyticsEvent(...)` и отправляет их в PostHog.

Для включения задайте глобальные переменные в `index.html` (или через ваш runtime-inject):

```html
<script>
  window.__URSASS_POSTHOG_KEY__ = 'phc_xxx';
  window.__URSASS_POSTHOG_HOST__ = 'https://eu.i.posthog.com';
  window.__URSASS_POSTHOG_ENABLED__ = true; // переключатель для hotfix/perf-debug
</script>
```

Если `window.__URSASS_POSTHOG_KEY__` не задан, интеграция автоматически выключена.
Для быстрого perf-диагноза можно полностью отключить PostHog флагом `window.__URSASS_POSTHOG_ENABLED__ = false` или `VITE_POSTHOG_ENABLED=false`.
