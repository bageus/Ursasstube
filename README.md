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
