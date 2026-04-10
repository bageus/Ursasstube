# Phaser visual uplift: варианты прокачки визуала для раннера (Web + Telegram Mini App)

Дата: 2026-04-10

## Контекст текущего рендера

В проекте уже есть сильная база:
- отдельный рендерер туннеля с многопроходной отрисовкой, depth-rays и управлением альфой/контрастом;
- отдельные passes для сущностей и эффектов подбора;
- runtime разделён на scene/controller/renderer.

Это значит, что лучший путь — не переписывать игру, а включить «production-level» VFX-слои поверх текущей архитектуры.

---

## Вариант A — **Performance First (Telegram-safe)**

Цель: максимум читаемости и «сочности» при минимальной цене кадра.

### 1) Труба
- Оставить текущую геометрию и draw-pass, но добавить:
  - **анимированную нормаль/шум-маску** в виде тайлового texture-overlay по глубине;
  - **rim-light** по сегментам (узкая полоска света на 20–35° от источника);
  - **lane pulse**: периодический импульс по дорожкам, завязанный на BPM музыки или скорость.
- Избегать тяжёлых постпроцессов на весь экран.

### 2) Эффекты
- Для coin/bonus/shield:
  - заменить часть circle/tween FX на **GPU-частицы Phaser ParticleEmitter** с pre-baked текстурами;
  - добавить **additive blending** только на короткой фазе вспышки (80–120ms), затем normal blending.
- Для столкновений:
  - 1 кадр chroma-flash (через полупрозрачный fullscreen rectangle),
  - 200ms radial shock-ring (sprite-based).

### 3) Персонаж
- Визуально «прибить» к миру:
  - fake contact shadow (ellipse sprite, alpha по depth);
  - velocity trail из 2–3 ghost-спрайтов с быстрым fade-out;
  - bank/lean по горизонтальному вводу (±6–10°).

### 4) Объекты
- Дать «материал» препятствиям:
  - ближний LOD: sprite + highlight rim + tiny shadow;
  - дальний LOD: только sprite и мягкая desaturation.
- Coins: вращение + короткий specular glint раз в N кадров.

### KPI
- 55–60 FPS на mid Android в Telegram WebView.
- +15–25% к субъективной «читаемости» препятствий в слепом тесте.

---

## Вариант B — **Balanced Next-Gen (рекомендуется)**

Цель: заметный «вау»-скачок без риска для WebView.

### 1) Труба (главный визуальный апгрейд)
- Внедрить **многоуровневую подсветку поверхности**:
  - базовый цветовой градиент;
  - procedural grime/noise на дальних сегментах;
  - движущиеся energy streaks по направлению движения.
- Добавить **volumetric slices** (псевдо-объём): 3–5 полупрозрачных колец между игроком и дальним краем.

### 2) Эффекты
- Ввести **VFX event bus** (spawnCoinBurst, spawnShieldHit, spawnNearMiss и т.д.),
  чтобы каждый эффект имел 2 профиля: quality=high и quality=low.
- Пост-эффекты с ограничением:
  - Bloom-lite (только selected glow layers),
  - vignette + subtle film grain (опционально).

### 3) Персонаж
- Перейти от «одного спрайта» к **2.5D stack**:
  - base body,
  - emissive eyes layer (additive),
  - optional outline layer.
- Добавить state-driven micro-anim:
  - idle breathing,
  - lane-swap squash&stretch,
  - hit recoil c easing-кривыми.

### 4) Объекты
- Ввести категории материалов:
  - metal / organic / hazard;
  - для каждой — свой hit FX, tint, reflection response.
- Бонусам добавить «ауру» (soft billboard glow),
  чтобы они читались на любом фоне туннеля.

### KPI
- 50–60 FPS на большинстве девайсов.
- +20–35% к удержанию первых 3 минут за счёт визуальной динамики.

---

## Вариант C — **Cinematic Max (флагман)**

Цель: выжать максимум Phaser для браузера, с деградацией по качеству.

### 1) Труба
- Кастомные WebGL pipelines:
  - distortion pass по краям,
  - depth fog color grading,
  - reactive glow от скорости.
- Screen-space light shafts + pseudo-reflections.

### 2) Эффекты
- Layered particles: sparks + smoke + shards + trails.
- Near miss / perfect dodge события с time-sliced flash.

### 3) Персонаж
- Полноценный sprite-sheet animation set + secondary motion.
- Impact decals (временные следы/царапины) на окружении.

### 4) Объекты
- Runtime palette swaps (биомы/темы).
- Event-driven lighting, когда объекты подсвечивают туннель при пролёте.

### KPI
- 45–60 FPS на desktop, 40–55 на свежих смартфонах.
- Требуется quality auto-scaler и пер-девайс fallback.

---

## Что выбрать для вашего проекта сейчас

С учётом Web + Telegram Mini App, оптимален **Вариант B (Balanced Next-Gen)**:
- даёт большой прирост визуала;
- не требует полного перехода на тяжёлые fullscreen-пайплайны;
- легко откатывается на A-профиль по производительности.

---

## Практический roadmap на 3 итерации

### Итерация 1 (1–2 дня): «читаемость + материал»
1. Усилить rim-light и контраст препятствий по depth.
2. Вынести quality-профили эффектов (low/high).
3. Добавить contact shadow + lean для персонажа.

### Итерация 2 (2–4 дня): «вау-слой»
1. Energy streaks и volumetric slices для туннеля.
2. Aura/outline для бонусов и опасностей.
3. Настроить speed-reactive intensity.

### Итерация 3 (2–3 дня): «polish + адаптивность»
1. Auto quality scaler по FPS budget.
2. Device tiering для Telegram WebView.
3. А/Б тест визуальных пресетов.

---

## Технические правила, чтобы Codex не «ломал» визуал при следующих итерациях

1. Любой новый эффект добавлять только через единый слой событий VFX (не хаотично в gameplay-логике).
2. У каждого эффекта обязателен low-quality путь.
3. Любой fullscreen постэффект — только с фичефлагом.
4. Все визуальные константы хранить в централизованном конфиге quality tiers.
5. Для Telegram держать budget:
   - draw calls и активные партиклы ограничены;
   - expensive blending включать кратковременно.

---

## Конкретные точки расширения в текущем коде

- Туннель и depth-эффекты:
  - `js/phaser/tunnel/TunnelRenderer.js`
  - `js/phaser/tunnel/tunnel-draw-pass.js`
  - `js/phaser/tunnel/tunnel-depth-rays.js`

- Эффекты и объекты:
  - `js/phaser/entities/entity-render-passes.js`
  - `js/phaser/entities/EntityRenderer.js`

- orchestration сцены:
  - `js/phaser/scenes/MainScene.js`

Это правильные места, чтобы наращивать качество поэтапно, не трогая ядро игровой логики.

---

## Нужны ли дополнительные ассеты?

Коротко: **да**. Чтобы реально выжать визуал из Phaser, понадобятся дополнительные 2D-ассеты (в основном PNG/WebP + несколько grayscale-масок).

Ниже — минимальный production-ready набор для Варианта B, с промптами для генерации.

### 1) Труба / окружение

1. **`tunnel_noise_tile_01.png`** (512x512, seamless)
   - Назначение: тонкий grime/noise-слой на дальних сегментах трубы.
   - Prompt:
     - `Seamless sci-fi surface noise texture, subtle dirt and brushed metal micro detail, monochrome grayscale, tileable, no symbols, no text, game texture, high contrast but soft transitions`

2. **`tunnel_rim_mask_01.png`** (1024x256, grayscale)
   - Назначение: маска для rim-light по сегментам.
   - Prompt:
     - `Horizontal grayscale mask for rim lighting, bright thin edge band fading to dark center, smooth falloff, clean anti-aliased, no background objects, game VFX mask`

3. **`energy_streak_strip_01.png`** (1024x128, alpha)
   - Назначение: движущиеся energy streaks вдоль глубины.
   - Prompt:
     - `Futuristic neon energy streak strip, cyan and blue glow lines on transparent background, directional motion feel, additive-friendly, clean edges, no text`

4. **`volumetric_ring_soft_01.png`** (512x512, alpha)
   - Назначение: полупрозрачные volumetric slices/кольца.
   - Prompt:
     - `Soft circular volumetric ring sprite, transparent background, inner and outer glow, cyan-white sci-fi style, smooth gradient, no hard artifacts`

### 2) Персонаж (2.5D stack)

5. **`bear_body_base_v2.png`** (1024x1024, alpha)
   - Назначение: базовый слой персонажа.
   - Prompt:
     - `Stylized cyber bear character front-facing for endless runner, clean silhouette, game-ready sprite, medium detail, cool color palette, transparent background, no text`

6. **`bear_eyes_emissive_v2.png`** (1024x1024, alpha)
   - Назначение: emissive слой глаз (additive blend).
   - Prompt:
     - `Glowing cyber eyes layer for bear character, emissive cyan light only, transparent background, isolated details, additive blending friendly`

7. **`bear_outline_soft_v2.png`** (1024x1024, alpha)
   - Назначение: мягкий контур/ореол для читаемости.
   - Prompt:
     - `Soft outline aura around character silhouette, subtle blue glow, transparent background, smooth edge falloff, no internal details`

8. **`shadow_contact_ellipse_01.png`** (256x128, alpha)
   - Назначение: contact shadow под персонажем.
   - Prompt:
     - `Soft elliptical contact shadow sprite, transparent background, dark gray center fading to transparent edges, no noise`

### 3) Объекты и бонусы

9. **`bonus_aura_soft_01.png`** (256x256, alpha)
   - Назначение: аура бонусов для читаемости.
   - Prompt:
     - `Circular soft glow aura sprite for collectible bonus, transparent background, cyan-gold gradient, smooth radial falloff, no symbols`

10. **`coin_glint_star_01.png`** (128x128, alpha)
    - Назначение: короткий specular glint для монет.
    - Prompt:
      - `Small sparkle star glint sprite, transparent background, white-cyan sharp core with soft bloom, clean game VFX element`

11. **`hazard_rim_highlight_01.png`** (512x512, alpha)
    - Назначение: rim-highlight для опасных объектов.
    - Prompt:
      - `Hazard edge highlight overlay, orange-red emissive rim, transparent background, stylized game VFX, no text`

### 4) VFX/экранные эффекты

12. **`shock_ring_impact_01.png`** (512x512, alpha)
    - Назначение: radial shock-ring при столкновении.
    - Prompt:
      - `Radial impact shock ring sprite, transparent background, bright edge with fading inner transparency, sci-fi style, high readability`

13. **`screen_flash_gradient_01.png`** (1920x1080, alpha)
    - Назначение: мягкий экранный flash без тяжёлого постпроцесса.
    - Prompt:
      - `Full-screen soft gradient flash overlay, white to transparent, cinematic bloom feel, no patterns, no text`

14. **`dust_particle_pack_01.png`** (atlas 1024x1024)
    - Назначение: партиклы пыли/мелкого мусора в движении.
    - Prompt:
      - `Set of small dust particles and tiny debris sprites for game atlas, grayscale and light cyan variants, transparent background, clean isolated elements`

---

## Технические требования к ассетам (важно для Web/Telegram)

- Формат:
  - runtime: `webp` (lossy/lossless по типу ресурса),
  - маски/служебные текстуры: `png`.
- Размеры держать степенью двойки, где это возможно (128/256/512/1024).
- Для glow-ассетов делать запас прозрачного поля (padding 8–16px), чтобы не резало bloom.
- Не хранить всё в оригинале 4K: сразу готовить mobile-friendly версии (`@1x`, `@0.5x`).
- Для Telegram Mini App целиться в общий бюджет новых визуальных ассетов ~4–8 MB (после сжатия).

---

## Быстрый порядок внедрения ассетов

1. Сначала добавить: `shadow_contact_ellipse_01`, `bonus_aura_soft_01`, `coin_glint_star_01`, `shock_ring_impact_01`.
2. Потом подключить трубу: `tunnel_noise_tile_01`, `energy_streak_strip_01`, `volumetric_ring_soft_01`.
3. После этого обновить персонажа (2.5D stack).
4. В конце — полировка (dust atlas, hazard highlights, screen flash).

Такой порядок даёт самый заметный прирост визуала при минимальном риске просадки FPS.
