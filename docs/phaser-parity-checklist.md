# Phaser parity checklist (Этапы 1–3)

Дата обновления: 2026-04-05  
Статус: рабочий чеклист для закрытия migration parity

## Этап 1 — Контракт рендера и единый runtime-адаптер

- [x] Runtime создаёт рендер через `createGameRenderer`.
- [x] Renderer backend в runtime зафиксирован на Phaser.
- [x] Lifecycle hooks используют нейтральный `syncViewport`.
- [x] Нет импортов `js/renderer.js` из gameplay-модулей (projection вынесен в `js/game/projection.js`).
- [x] `ctx` из `js/state.js` не используется вне изолированного legacy-модуля.

## Этап 2 — Functional parity в Phaser

- [x] Игровой кадр рендерится через Phaser adapter в основном loop.
- [x] Loading overlay работает через DOM и не зависит от Canvas draw path.
- [ ] Player lane transitions визуально соответствуют legacy baseline.
- [ ] Obstacles/coins/bonuses parity подтверждён на smoke 5+ минут.
- [ ] Hit feedback / score feedback имеют тот же UX и тайминги.
- [ ] Game over + restart parity подтверждены без P0/P1.

## Этап 3 — UI integration и event model

- [x] Resize flow переведён на event-protocol `ursas:viewport-sync-requested`.
- [x] Session start и game loop используют единый viewport-sync callback.
- [ ] Нет дублирующих side-effects между DOM UI и Phaser runtime.
- [ ] Pause/resume/menu/modals smoke подтверждён на мобильном viewport.

## Протокол фиксации результата

Для каждого пункта, который переводится в `[x]`, фиксируем:

- SHA коммита.
- Короткий smoke-лог (что именно проверили).
- Если есть риски: owner + дедлайн.
