# Phaser Visual Uplift Spec — Variant B (Balanced Next-Gen)

Дата: 2026-04-11  
Статус: approved for implementation  
Целевая платформа: Web + Telegram Mini App  
Рендер-стек: Phaser

---

## 1. Цель документа

Этот документ фиксирует техническое направление для визуального апгрейда раннера на Phaser с упором на:
- заметный рост визуального качества;
- сохранение производительности в Telegram WebView;
- поэтапное внедрение без переписывания ядра игры;
- дисциплину добавления VFX через единый контракт.

Выбранный путь реализации: **Variant B — Balanced Next-Gen**.

---

## 2. Цели

### Основные цели
- Сделать картинку заметно более «production-level» без тяжёлых fullscreen-проходов по умолчанию.
- Повысить читаемость препятствий, бонусов и движения персонажа.
- Добавить выраженный визуальный слой туннелю как главному элементу сцены.
- Поддержать деградацию качества под слабые устройства и Telegram Mini App.

### Ожидаемый эффект
- 50–60 FPS на большинстве девайсов.
- Улучшение субъективной читаемости препятствий и бонусов.
- Более сильное ощущение скорости, глубины и импакта.
- Рост удержания первых минут за счёт визуальной динамики.

---

## 3. Не-цели

В рамках текущей итерации не делаем:
- полный rewrite рендера;
- тяжёлые fullscreen shader pipelines по умолчанию;
- cinematic-first подход в ущерб FPS;
- хаотичное внедрение эффектов напрямую в gameplay-код;
- сложную биомную систему, palette swap и крупные runtime lighting-сценарии.

---

## 4. Стратегия внедрения

Основной профиль:
- **Primary target:** Variant B

Fallback-профиль:
- **Fallback target:** Variant A

Не включать по умолчанию:
- фичи уровня Variant C без отдельного feature flag.

Подход:
- не трогать ядро логики игры;
- усиливать текущую архитектуру поверх существующих render passes;
- все VFX добавлять через единый визуальный event flow;
- все тяжёлые визуальные элементы делать quality-aware.

---

## 5. Технические точки расширения

### Туннель и depth-эффекты
- `js/phaser/tunnel/TunnelRenderer.js`
- `js/phaser/tunnel/tunnel-draw-pass.js`
- `js/phaser/tunnel/tunnel-depth-rays.js`

### Эффекты и объекты
- `js/phaser/entities/entity-render-passes.js`
- `js/phaser/entities/EntityRenderer.js`

### Оркестрация сцены
- `js/phaser/scenes/MainScene.js`

---

## 6. Основные визуальные направления

### 6.1. Туннель
Главный визуальный апгрейд должен идти через туннель.

Добавить:
- базовый цветовой градиент поверхности;
- procedural grime/noise на дальних сегментах;
- движущиеся energy streaks по направлению движения;
- volumetric slices: 3–5 полупрозрачных колец между игроком и дальним краем;
- speed-reactive intensity для усиления ощущения скорости.

Не использовать по умолчанию:
- тяжёлый fullscreen bloom;
- сильный fullscreen distortion;
- перманентные дорогие shader-постпроцессы на весь экран.

### 6.2. Эффекты
Ввести единый VFX event bus, чтобы каждый эффект вызывался через стандартизированное событие.

Добавить:
- quality-aware эффекты подбора монет/бонусов;
- короткие additive-вспышки только на микрофазе эффекта;
- shock ring при столкновениях;
- screen flash как sprite/overlay, а не как тяжёлый постпроцесс;
- ограниченный glow только на selected layers.

### 6.3. Персонаж
Переход от одиночного спрайта к 2.5D stack:
- `base body`;
- `emissive eyes layer`;
- `optional outline layer`.

Добавить:
- contact shadow;
- lean/bank по горизонтальному вводу;
- lane-swap squash & stretch;
- hit recoil;
- при достаточном бюджете — короткий velocity trail.

### 6.4. Объекты
Ввести категории материалов:
- metal;
- organic;
- hazard.

Для каждой категории поддержать:
- свой tint/response;
- свой hit FX;
- свою читаемость на фоне туннеля.

Бонусы должны получить мягкую aura-подсветку для стабильной читаемости на любом фоне.

---

## 7. Readability-first приоритет

Сначала усиливаем не «атмосферу», а читаемость.

### Readability layer
- obstacle rim-light / highlight;
- bonus aura;
- coin glint;
- contact shadow;
- player lean / bank;
- short hit shock ring.

### Atmosphere layer
- tunnel noise;
- energy streaks;
- volumetric rings;
- dust particles;
- screen flash polish;
- optional subtle grain.

Правило приоритета:
1. читаемость;
2. импакт;
3. атмосфера;
4. декоративная полировка.

---

## 8. Фазы внедрения

## Фаза 1 — Readability First
Цель: быстро поднять ощущение качества и понятность геймплея.

Внедрить:
1. `shadow_contact_ellipse_01`
2. `bonus_aura_soft_01`
3. `coin_glint_star_01`
4. rim/highlight для препятствий
5. player lean/bank
6. `shock_ring_impact_01`

Ожидаемый результат:
- персонаж лучше привязан к миру;
- бонусы и угрозы читаются быстрее;
- столкновения ощущаются сильнее.

## Фаза 2 — Tunnel Identity Layer
Цель: создать уникальный визуальный язык окружения.

Внедрить:
1. `tunnel_noise_tile_01`
2. `energy_streak_strip_01`
3. `volumetric_ring_soft_01`
4. speed-reactive intensity

Ожидаемый результат:
- появляется ощущение глубины;
- туннель начинает работать как ключевая часть атмосферы;
- возрастает чувство скорости.

## Фаза 3 — Character Premium Feel
Цель: сделать персонажа визуально более дорогим.

Внедрить:
1. `bear_body_base_v2`
2. `bear_eyes_emissive_v2`
3. `bear_outline_soft_v2`
4. state-driven micro-anim
5. optional ghost trail

Ожидаемый результат:
- персонаж лучше отделяется от окружения;
- появляется премиальность и более сильный силуэт.

---

## 9. Quality tiers

В системе должны быть три режима качества:

### `low`
Цель:
- Telegram-safe;
- mid Android;
- приоритет FPS и читаемости.

Разрешено:
- минимальные aura FX;
- ограниченные частицы;
- 1–2 volumetric rings максимум;
- короткие additive вспышки;
- отключаемый trail.

### `medium`
Цель:
- основной дефолтный режим.

Разрешено:
- все основные эффекты Variant B;
- 3–4 volumetric rings;
- energy streaks;
- ограниченный glow;
- умеренное количество частиц.

### `high`
Цель:
- desktop / strong mobile.

Разрешено:
- полный набор Variant B;
- 4–5 volumetric rings;
- больше частиц;
- стабильный trail при достаточном FPS;
- дополнительные polish-эффекты по флагу.

---

## 10. Что должно управляться через quality config

В централизованном конфиге quality tiers хранить:
- max particles;
- max concurrent VFX instances;
- volumetric ring count;
- ring opacity;
- energy streak opacity;
- tunnel overlay animation speed;
- glow enable/disable;
- trail enabled/disabled;
- trail ghost count;
- additive flash duration;
- screen flash enabled/disabled;
- obstacle highlight strength;
- aura resolution tier.

---

## 11. VFX event bus contract

Все VFX вызываются только через единый шинообразный слой событий.

### Базовые события
- `coin_collected`
- `bonus_picked`
- `shield_hit`
- `player_hit`
- `near_miss`
- `lane_switch`
- `speed_boost_start`
- `speed_boost_end`

### Для каждого события передавать
- `position`
- `depth`
- `intensity`
- `qualityTier`
- `sourceType`
- `worldVelocity`
- `timestamp`

### Для каждого эффекта обязателен preset
- `lowPreset`
- `mediumPreset`
- `highPreset`

Запрещено:
- спавнить VFX напрямую из gameplay-логики вразнобой;
- хранить параметры эффекта локально в нескольких местах;
- делать hardcoded quality branching внутри каждого gameplay-action.

---

## 12. Правила реализации

1. Любой новый эффект добавлять только через `VfxEventBus`.
2. У каждого эффекта обязан быть low-quality путь.
3. Любой fullscreen-постэффект — только через feature flag.
4. Все визуальные константы должны жить в централизованном quality config.
5. Renderer не должен знать о gameplay-смысле, только о визуальных событиях и параметрах рендера.
6. Любой expensive blending должен быть краткоживущим.
7. Новые эффекты не должны ломать Telegram WebView budget.

---

## 13. Запрещённые по умолчанию решения

Не включать без отдельного флага и проверки:
- fullscreen blur;
- heavy bloom на весь экран;
- перманентный shader-noise поверх viewport;
- несколько крупных additive particle systems одновременно;
- плотный alpha-overdraw в центре экрана;
- сложные distortion-pass поверх всей сцены.

---

## 14. Рекомендуемая структура модулей

Рекомендуется ввести/поддерживать следующие модули:
- `visual-quality-config.js`
- `vfx-event-bus.js`
- `vfx-presets.js`
- `asset-manifest-vfx.js`

Назначение:
- `visual-quality-config.js` — все tier-настройки;
- `vfx-event-bus.js` — единая точка спавна визуальных событий;
- `vfx-presets.js` — пресеты эффектов по quality tier;
- `asset-manifest-vfx.js` — описание подключаемых VFX-ассетов.

---

## 15. Asset manifest — первая волна

### Приоритет 1 — быстрый прирост качества
1. `shadow_contact_ellipse_01.png`
2. `bonus_aura_soft_01.png`
3. `coin_glint_star_01.png`
4. `shock_ring_impact_01.png`

### Приоритет 2 — туннель
5. `tunnel_noise_tile_01.png`
6. `energy_streak_strip_01.png`
7. `volumetric_ring_soft_01.png`

### Приоритет 3 — персонаж
8. `bear_body_base_v2.png`
9. `bear_eyes_emissive_v2.png`
10. `bear_outline_soft_v2.png`

### Приоритет 4 — полировка
11. `hazard_rim_highlight_01.png`
12. `screen_flash_gradient_01.png`
13. `dust_particle_pack_01.png`

---

## 16. Технические требования к ассетам

- runtime ресурсы: `webp`
- маски и служебные текстуры: `png`
- размеры по возможности степенью двойки: `128 / 256 / 512 / 1024`
- glow-ассеты должны иметь прозрачный padding 8–16px
- избегать избыточных 4K-ресурсов
- готовить mobile-friendly версии (`@1x`, `@0.5x`)
- целевой бюджет новых визуальных ассетов для Telegram Mini App: примерно `4–8 MB` после сжатия

---

## 17. Порядок подключения ассетов

### Шаг 1
Подключить:
- `shadow_contact_ellipse_01`
- `bonus_aura_soft_01`
- `coin_glint_star_01`
- `shock_ring_impact_01`

### Шаг 2
Подключить:
- `tunnel_noise_tile_01`
- `energy_streak_strip_01`
- `volumetric_ring_soft_01`

### Шаг 3
Обновить персонажа через 2.5D stack.

### Шаг 4
Добавить полировку:
- dust atlas
- hazard highlights
- screen flash gradient

---

## 18. Acceptance criteria

Реализация считается успешной, если:
- игра визуально ощутимо улучшилась без rewrite core runtime;
- на целевых устройствах удерживается рабочий FPS;
- бонусы, препятствия и персонаж стали лучше читаться;
- эффекты не размазаны по gameplay-коду;
- все новые VFX проходят через единый контракт;
- существует quality fallback для Telegram-safe режима.

---

## 19. KPI и метрики проверки

### Технические
- average FPS
- p1 FPS
- количество frame spikes > 25ms
- peak active particles
- peak draw calls
- texture memory delta

### Игровые / продуктовые
- читаемость препятствий в первых сессиях
- читаемость бонусов
- частота near miss
- структура причин смерти до/после uplift
- drop-off в первые 3 минуты
- средняя длина сессии

---

## 20. Следующий шаг

Следующий этап после утверждения этого документа:
1. подготовить visual asset production sheet;
2. сформировать prompts и пакет генерации ассетов первой волны;
3. реализовать Phase 1 — Readability First;
4. затем переходить к tunnel identity layer.

---

## 21. Краткое решение

Для проекта на Web + Telegram Mini App выбран **Variant B** как основной production-путь, с обязательным fallback на `low`-режим и дисциплиной внедрения через quality tiers + VFX event bus.

Этот путь даёт сильный прирост качества без риска разрушить текущую архитектуру и производительность.

