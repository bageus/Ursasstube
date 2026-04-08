# Ursasstube — план вывода приложения в прод (RU)

**Дата:** 7 апреля 2026  
**Статус:** к запуску близко, но нужен обязательный security-gate перед релизом.

---

## 1) Входные данные и текущая готовность

План собран на основе:
- вашего roadmap (P0–P3) по улучшениям производительности, архитектуры, тестов и продукта;
- результатов моей технической проверки проекта:
  - `npm run check` — успешно;
  - `npm ls --all --omit=dev` — без дублей runtime-зависимостей;
  - `npm audit --omit=dev` — не завершился из-за `403 Forbidden` к advisories endpoint.

### Короткий вывод

- **Кодовая база в текущем состоянии стабильна** по синтаксису, внутренним guardrails, smoke- и unit-проверкам.
- **Главный блокер перед продом — подтверждённая security-проверка зависимостей** (нужен успешный аудит в CI/окружении с доступом к npm advisories).

---

## 2) Цель прод-вывода

Перевести Ursasstube из состояния «технически устойчивый прототип» в **production-ready и масштабируемую игровую платформу** с фокусом на:

1. производительность рендера (особенно mobile),
2. поддерживаемость архитектуры,
3. консистентность геймплея на разных FPS,
4. надёжность релизов (тесты + CI-gates),
5. продуктовую аналитику и управляемую эволюцию.

---

## 3) Приоритизированная дорожная карта

## 🔴 P0 — критично (блоки с немедленным эффектом)

### P0. Rendering & Tube Quality

  - условно отключаем тяжёлые VFX.


---

### P0.2 Рефакторинг pipeline туннеля

**Проблема:**
- `TunnelRenderer` перегружен ответственностями (математика + рендер + конфиг).
- Избыточные аллокации в hot-path.

**Что делаем:**
- Разделяем pipeline на этапы:
  - `buildDepthFrame()`
  - `renderBaseLayer()`
  - `renderGridLayer()`
  - `renderTrackLayer()`
  - `renderFxLayer()`
- Выносим конфиг в `tunnel.config.ts` (или `.js`, если миграция TS не начата).
- Экстрагируем math-utils.
- Убираем лишние per-frame allocations.

**KPI / критерии готовности:**
- уменьшение времени кадра в туннеле минимум на 15–25% на mobile baseline;
- упрощение профилирования (видно, какой слой сколько стоит);
- снижение связности и упрощение дебага.

**Декомпозиция (пошагово):**
- [x] Шаг 1: выделить фазы pipeline в `tunnel-draw-pass`:
  - `buildDepthFrame()`
  - `renderBaseLayer()`
  - `renderTrackLayer()`
  - `renderGridLayer()`
  - `renderFxLayer()`
- [x] Шаг 2: вынести render-константы в `tunnel.config.js` (без изменения поведения).
- [x] Шаг 3: вынести math/color-utils в отдельный модуль и убрать дубли.
- [x] Шаг 4: сократить per-frame allocations (pool/reuse для overlay-структур).
- [x] Шаг 5: добавить perf-замеры (до/после) и зафиксировать baseline в docs.

**Статус на 7 апреля 2026:**
- План валиден и приоритеты выставлены корректно (P0 → P1 → P2 → P3).
- Начат постепенный рефакторинг pipeline туннеля: выполнен Шаг 1.
- Продолжен рефакторинг без изменения поведения: выполнен Шаг 2 (render-константы вынесены в отдельный модуль).
- Выделен модуль math/color-utils и подключён в `TunnelRenderer` (выполнен Шаг 3).
- Снижены per-frame allocations: переиспользуются буферы depth/overlay-структур в `tunnel-draw-pass` (выполнен Шаг 4).
- Зафиксирован synthetic perf baseline (до/после) в `docs/tunnel-pipeline-perf-baseline-2026-04-07.md` (выполнен Шаг 5).

---

### P0.3 FPS-independent smoothing (delta time)

**Проблема:**
- Сглаживание зависит от FPS; на 30/60/120 поведение отличается.

**Что делаем:**
- Переход на delta-based формулу:

```js
value += (target - value) * (1 - Math.exp(-k * delta))
```

**KPI / критерии готовности:**
- идентичное «ощущение» управления на разных FPS;
- снижение жалоб на «плавающую» отзывчивость на webview/mobile.

**Декомпозиция (пошагово):**
- [x] Шаг 1: вынести delta-based smoothing factor в reusable math-utils (`1 - exp(-k * delta)`).
- [x] Шаг 2: перевести tunnel runtime smoothing (`rotation/scroll/wave/curve/offset/speed`) на delta-based коэффициенты.
- [x] Шаг 3: добавить unit-тесты инвариантности на 30/60/120 FPS.

**Статус на 8 апреля 2026:**
- P0.3 внедрён в runtime для tunnel smoothing: вместо fixed `lerp`-коэффициентов применяются delta-based коэффициенты с эквивалентом прежнего feel на 60 FPS.
- Добавлены unit-тесты на соответствие baseline-коэффициентам (60 FPS) и на FPS-инвариантность агрегации.

---

## 🟠 P1 — высокий приоритет

### P1.1 Расширение стратегии тестирования

**Добавляем:**
- E2E smoke: `Menu → Start → Game → Game Over → Store`;
- unit: экономика, store, сессии/auth;
- lifecycle-тесты Phaser: init/destroy/resize.

**KPI:**
- регрессии после рефакторинга ловятся до merge;
- обязательный test-gate в CI для релизной ветки.

**Декомпозиция (пошагово):**
- [x] Шаг 1: добавить unit-тесты на auth/store API-контракты (успех + non-ok + invalid-json).
- [x] Шаг 2: добавить unit-тесты на экономику/баланс и апгрейды.
- [x] Шаг 3: добавить Phaser lifecycle-тесты (`init/destroy/resize`).
- [x] Шаг 4: оформить E2E smoke-сценарий `Menu → Start → Game → Game Over → Store` как обязательный gate.

**Статус на 7 апреля 2026 (обновление P1.1):**
- Добавлен новый unit-набор `scripts/auth-service.test.mjs` (контракты `authenticate*`, `requestTelegramLinkCode`, `linkWalletToTelegram`).
- Unit-набор подключён в `npm run test:request` и теперь исполняется в общем check-gate.
- Добавлен unit-набор `scripts/donation-service.test.mjs` (store API contracts, stars response normalization, header-sanitization) как часть Шага 2.
- Выделен модуль `js/store/upgrades-math.js` и добавлены unit-тесты `scripts/upgrades-math.test.mjs` (уровни апгрейдов, spin-alert tiers, shield-capacity normalization) — Шаг 2 продолжен.
- Добавлен `scripts/runtime-lifecycle.test.mjs` (visibility subscription + ping lifecycle cleanup), начат Шаг 3 по lifecycle-покрытию.
- Оформлен обязательный smoke gate: `test:e2e-smoke` включён в `npm run check`; `run-mig08-smoke` теперь валидирует completion/checklist и sample-count.
- Добавлен `scripts/phaser-runtime-controller.test.mjs` и выделен `js/phaser/runtime-controller.js` для явного lifecycle-покрытия (`getScene/applySnapshot/resize/destroy`).

**Примечание по объёму изменений в этом разделе:**
- Изменения в `docs/plan-prod-release-2026-04-07-ru.md` сами по себе не меняют runtime-поведение приложения (это план/статус, а не исполняемый код).
- Риск регрессии связан не с размером документа, а только с кодовыми PR; для них обязательны `npm run test:request` и `npm run test:e2e-smoke`.
- Следующий шаг по P1.1: держать smoke + request suite обязательным merge-gate для релизной ветки и фиксировать результаты в этом плане.

---

### P1.2 Продуктовая аналитика

**События:**
- `game_start`, `game_end` (+ причина), `run_duration`,
- `upgrade_purchase`, `currency_spent`, `session_length`.

**Метрики:**
- retention D1/D7,
- conversion,
- avg run time,
- upgrade usage.

**KPI:**
- решения по балансу и UX принимаются на данных, а не на гипотезах.

**Декомпозиция (пошагово):**
- [x] Шаг 1: добавить базовый analytics-tracker и события `game_start`, `game_end`, `session_length`.
- [x] Шаг 2: добавить события экономики (`upgrade_purchase`, `currency_spent`) в store-flow.
- [x] Шаг 3: подготовить экспорт/доставку событий в backend/warehouse.
- [x] Шаг 4: собрать базовые продуктовые метрики (D1/D7, conversion, avg run time) в отчёт.

**Статус на 7 апреля 2026 (обновление P1.2):**
- Добавлен `js/analytics.js` с безопасным payload-sanitize и единым `trackAnalyticsEvent`.
- `game/session` начал отправлять `game_start`, `game_end`, `session_length`.
- Добавлен unit-набор `scripts/analytics.test.mjs`.
- `store/upgrades-service` начал отправлять `upgrade_purchase` + `currency_spent` после успешной покупки.
- Добавлен unit-набор `scripts/store-analytics.test.mjs` на расчёт spend-delta и отправку событий экономики.
- Добавлен `js/analytics-delivery.js`: батчинг событий (`ANALYTICS_TRACK_EVENT`) и отправка в backend endpoint `/api/analytics/events`.
- Инициализация доставки подключена в runtime-bootstrap (`game-runtime`), добавлен unit-набор `scripts/analytics-delivery.test.mjs`.
- Добавлен `js/analytics-metrics.js` и CLI-скрипт `scripts/build-product-metrics-report.mjs` для расчёта D1/D7, conversion и avg run time.
- Добавлен пример входных данных `docs/analytics-events-sample-2026-04-07.json` и сгенерирован отчёт `docs/product-metrics-report-2026-04-07.md`.

---

### P1.3 Усиление API-слоя

**Проблема:**
- `request()` недостаточно строг для прод-нагрузки.

**Что делаем:**
- вводим `requestJson<T>()` wrapper;
- безопасный JSON parse;
- жёсткие лимиты retry/timeout;
- валидация URL protocol.

**KPI:**
- снижение runtime-crash на сетевых ошибках;
- предсказуемое поведение клиентского API.

**Декомпозиция (пошагово):**
- [x] Шаг 1: добавить `requestJson()` с обязательной проверкой `response.ok`, безопасным JSON parse и единым `RequestError`-контрактом.
- [x] Шаг 2: добавить protocol-guard для URL (`http/https`) на уровне `request()`.
- [x] Шаг 3: покрыть новый контракт unit-тестами (`requestJson`, protocol validation, error-коды).
- [x] Шаг 4: поэтапно мигрировать сервисы с ручного `response.ok + response.json()` на `requestJson()`.
- [x] Шаг 5: унифицировать retry/timeout-профили по классам endpoint’ов (auth/store/config).

**Статус на 7 апреля 2026 (обновление P1):**
- Реализован `requestJson()` и protocol-guard в сетевом слое.
- Добавлены unit-тесты на HTTP-error/invalid-json/unsupported-protocol сценарии.
- Начата миграция call-site: `store/runtime-config` переведён на `requestJson()` с явным timeout/retry-профилем.
- Продолжена миграция call-site: `store/rides-service` и `store/upgrades-service` (этап загрузки данных) переведены на `requestJson()`.
- Введены и применены унифицированные request-профили для `auth/store/config`, включая auth-сервис.
- Продолжен Step 4 миграции: `donation-service` переведён на `requestJsonResult()` с профилями `store-read/store-write`.
- Продолжен Step 4 миграции: leaderboard read-path в `api.js` переведён на `requestJsonResult()` с профилем `leaderboard-read`.
- Продолжен Step 4 миграции: store write-path (`use-ride`, `store/buy`) переведён на `requestJsonResult()` + `store-write` профиль.
- Step 4 закрыт: ручные `response.ok + response.json()` удалены из прикладных сервисов; JSON-контракт централизован в `requestJson()/requestJsonResult()`.

---

## 🟡 P2 — средний приоритет

### P2.1 DX и README

- Перестраиваем README:
  - Product overview,
  - Gameplay loop,
  - Tech stack,
  - Architecture,
  - How to run,
  - Debug guide.
- Глубокую техдокументацию переносим/держим в `/docs`.

**Декомпозиция (пошагово):**
- [x] Шаг 1: обновить README под продуктовую структуру (overview/gameplay/stack/architecture/how-to-run).
- [x] Шаг 2: вынести краткий debug-чеклист в отдельный `docs/debug-guide.md`.
- [x] Шаг 3: добавить cross-links на ключевые инженерные документы по архитектуре и state ownership.

### P2.2 Parity локального и CI окружений

- Добавляем `engines.node >= 22`.
- Добавляем `.nvmrc`.

**Декомпозиция (пошагово):**
- [x] Шаг 1: зафиксировать `engines.node` в `package.json`.
- [x] Шаг 2: добавить `.nvmrc` и синхронизировать локальную версию с CI baseline.
- [x] Шаг 3: дополнить CI-пайплайн явной проверкой Node major-version (22+).

### P2.3 Рефакторинг UI-стилей

- Убираем inline-стили из JS в CSS-классы.
- Вводим design tokens (`--color-bg`, `--color-primary`, `--spacing-md`).

**Декомпозиция (пошагово):**
- [x] Шаг 1: ввести базовый набор design tokens в `:root` с backward-compatible alias.
- [x] Шаг 2: вынести статические inline-стили из UI helper-модулей в CSS-классы.
- [x] Шаг 3: убрать оставшиеся дубли цветов/spacing и перейти на tokens-first naming.

**Статус на 7 апреля 2026 (обновление P2):**
- README перестроен по product/DX-структуре и разделён с техдокументацией.
- Добавлен `docs/debug-guide.md` для быстрого triage и локального debug + cross-links на архитектурные документы.
- Настроена parity-база по Node: добавлены `engines.node >= 22`, `.nvmrc` и явная проверка Node major-version (22+) в CI.
- Вынесены статические inline-стили из UI helper-модулей (`auth-ui`, `notifier`) в CSS-классы.
- Продолжена tokens-first миграция: новые style-правила используют spacing/token-классы вместо inline-значений.
- **P2 закрыт** (P2.1–P2.3 выполнены).

---

## 🔵 P3 — стратегический слой

### Развести roadmap на 2 потока

**Track A (Gameplay/UX):**
- читаемость трубы,
- feel управления,
- ясность апгрейдов,
- баланс сложности.

**Track B (Platform/Tech):**
- рендер-пайплайн,
- тесты,
- CI/CD,
- API reliability.

**Декомпозиция (пошагово):**
- [x] Шаг 1: зафиксировать split Track A / Track B в плане релиза.
- [x] Шаг 2: привязать P0/P1 задачи к Track B (tech foundation).
- [x] Шаг 3: сформировать backlog Track A с измеримыми UX/KPI-целями на следующий цикл.
- [x] Шаг 4: определить cadence (например, 1 gameplay-итерация + 1 platform-итерация в каждом спринте).

**Статус на 8 апреля 2026 (обновление P3):**
- Стратегический split Track A/Track B закреплён в плане как постоянная модель планирования.
- Текущая волна P0/P1/P2 в основном закрывает Platform/Tech foundation.
- Сформирован отдельный backlog Track A с измеримыми UX/KPI-целями: `docs/p3-track-a-backlog-2026-04-08-ru.md`.
- Зафиксирован cadence: в каждом спринте 1 Track A-итерация + 1 Track B-итерация, с обязательным post-release review.
- Начата практическая реализация Epic A1: в Phaser entity-render pass добавлен адаптивный readability-tuning для obstacle (contrast/alpha/size boost по мере приближения к игроку), плюс dynamic tint-blend для near-player контраста; добавлены unit-тесты на bounded-поведение helper-функций.
- Начат Epic A2: добавлены first-run onboarding hints в gameplay-start (touch/keyboard profile-aware copy) с одноразовым показом через localStorage-флаг и telemetry-событиями `onboarding_hint_shown` / `onboarding_hint_completed` (+ `input_profile`).
- **P3 baseline оформлен** (дальше — исполнение backlog и еженедельная переоценка приоритетов по метрикам).

**Результат:** баланс продуктового развития и технической устойчивости.

---

## 4) Release gates (обязательные критерии допуска в прод)

Ниже — минимальный gate, без которого релиз не выполняется:

1. **Quality gate:** `npm run check` — green.
2. **Test gate:** unit + E2E smoke — green.
3. **Security gate:** успешный `npm audit --omit=dev --audit-level=moderate` в CI с доступом к npm advisories.
4. **Perf gate (mobile):** подтверждённый FPS/frametime на целевых девайсах.
5. **Observability gate:** события аналитики не теряются, корректно отправляются.
6. **Rollback gate:** подготовлен rollback-план и проверен hotfix-процесс.

**Статус gate-подготовки на 8 апреля 2026:**
- [x] Security gate включён как отдельный CI-шаг `npm run check:security` (выполняет `npm audit --omit=dev --audit-level=moderate` в sanitized npm env).
- [ ] Подтвердить успешный прогон security gate в CI-окружении с доступом к npm advisories (локально в текущем окружении audit endpoint недоступен).

---

## 5) План внедрения по спринтам (предложение)

### Спринт 1 (P0)
- Пресеты качества + mobile render path.
- Delta smoothing fix.
- Начало декомпозиции TunnelRenderer.

### Спринт 2 (P0/P1)
- Завершение декомпозиции туннеля.
- Включение E2E smoke в CI.
- Введение `requestJson()`.

### Спринт 3 (P1/P2)
- Аналитические события и базовые дашборды.
- README/DX улучшения.
- Node/CI parity (`engines`, `.nvmrc`).

### Спринт 4 (P2/P3)
- UI style refactor.
- Разделение roadmap на product/tech tracks.
- Оптимизация backlog по данным аналитики.

---

## 6) Финальный вывод

Ursasstube можно выводить в прод **после прохождения обязательного security-gate и mobile perf-gate**.

Текущая техническая база уже сильная; предложенный план фокусируется на ключевых рисках (mobile render, архитектура туннеля, FPS-консистентность, тесты и аналитика), чтобы перейти к устойчивому и масштабируемому релизному циклу.
