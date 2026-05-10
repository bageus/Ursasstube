# URSASS TUBE — Onboarding Frontend Implementation Plan

## Goal

Implement a fully guided onboarding UX with:

- spotlight overlays;
- onboarding hooks;
- persistent onboarding continuation;
- Store onboarding;
- Radar gift onboarding;
- support for reload/reopen scenarios.

---

## 1) New Frontend Module

Create:

```txt
js/features/onboarding/
```

Files:

```txt
index.js
onboarding-service.js
onboarding-state.js
spotlight.js
hooks.js
gift-indicator.js
```

Connect module in:

```txt
js/game/bootstrap.js
```

---

## 2) Spotlight Overlay System

Create reusable onboarding overlay.

Features:

- darkens entire screen;
- highlights only required element;
- blocks other clicks;
- supports **Skip** button;
- supports dynamic targets;
- mobile safe-area compatible;
- Telegram compatible.

API example:

```js
showSpotlight({
  target: '#storeBtn',
  text: 'Upgrade your runs',
  showSkip: true,
  onSkip,
  onTargetClick
})
```

---

## 3) Existing Systems To Reuse

Reuse:

- current start hook;
- current Game Over layout;
- current Store;
- current share button logic;
- current ride pack item;
- current radar items.

---

## 4) Systems To Replace

Old onboarding logic:

```txt
js/game/onboarding-hints.js
```

Must remain **ONLY** for:

- gameplay control hints;
- in-run gameplay teaching.

Do **NOT** use it as onboarding source of truth.

---

## 5) Main Auth Onboarding Flow

### Step 1 — Authenticated Menu

After wallet connect **OR** Telegram auth.

Target:

```txt
#startBtn
```

Hook text:

```txt
Take the lead
```

### Step 2 — After First Authenticated Run

On Game Over.

Hook must appear **near**:

```txt
PLAY AGAIN
```

Text:

```txt
Run again. Get +100 silver
```

**NOT** via fullscreen overlay.

### Step 3 — After Second Authenticated Run

Show onboarding reward in rewards breakdown:

```txt
+100 silver bonus
```

Game Over hook near:

```txt
PLAY AGAIN
```

Text:

```txt
One more run. Get +100 gold
```

### Step 4 — After Third Authenticated Run

Show onboarding reward:

```txt
+100 gold bonus
```

Game Over hook near:

```txt
PLAY AGAIN
```

Text:

```txt
Connect X for more rewards
```

Do **NOT** show:

```txt
Share your result. Get +20 gold
```

---

## 6) Store Intro Flow

After:

- X connect;
- share confirm;
- **OR** reload after 3 authenticated runs.

Frontend must continue onboarding from:

```txt
Store intro
```

### Main Menu Spotlight

Target:

```txt
#storeBtn
```

Text:

```txt
Upgrade your runs
```

Must use fullscreen spotlight overlay with **Skip**.

---

## 7) Store Ride Pack Highlight

Inside Store:

- darken everything;
- highlight **ONLY** existing 3 rides pack;
- **NO** text;
- **MUST** show **Skip** button.

Add id:

```html
<div id="store-ride-pack-3">
```

---

## 8) After Ride Pack Purchase

### If player still inside Store

Highlight:

```txt
Back button
```

### After returning to main menu

Highlight:

```txt
#startBtn
```

Text:

```txt
You’re ready. Start again.
```

Then:

```txt
onboarding completed
```

### Reload Edge Case

If player reloads after buying rides:

- onboarding must already be completed;
- do **NOT** restart onboarding.

---

## 9) Radar Gift Flow

### Unlock after 6 authenticated runs

Main menu spotlight:

Target:

```txt
#storeBtn
```

Text:

```txt
Claim your free Radar
```

Uses fullscreen spotlight with **Skip**.

---

## 10) Gift Icon

If player presses **Skip**:

- keep gift permanently available;
- show glowing gift icon under coins.

Gift icon click:

- open Store;
- continue radar onboarding.

---

## 11) Manual Store Entry

If player manually enters Store:

- automatically continue radar onboarding.

---

## 12) Radar Obstacles Gift

Store spotlight target:

```txt
#store-radarobstacles-0
```

Replace price label:

```txt
FREE 24H
```

Do **NOT** show:

```txt
2000 gold
```

Click action:

```txt
POST /api/onboarding/claim
{
  reward: "radar_obstacles_24h"
}
```

---

## 13) Radar Gold Gift

After 15 authenticated runs.

Target:

```txt
#store-radargold-0
```

Replace label:

```txt
FREE 24H
```

Claim via:

```txt
POST /api/onboarding/claim
{
  reward: "radar_gold_24h"
}
```

---

## 14) Active Radar UI

On main menu under coins display:

```txt
Radar icon
24h
```

Rules:

- show only active boosts;
- hours only;
- round up;
- less than 1 hour = 1h.

---

## 15) Persistent Continuation Rules

Frontend **MUST** restore onboarding state from backend.

Examples:

### Player reloads after 3rd run

Continue from:

```txt
Store intro
```

### Player skipped Store spotlight

Gift/store onboarding must still continue later.

### Player reloads after radar unlock

Gift remains available.

---

## 16) Guest Flow Rules

Guest Game Over onboarding already exists on backend.

Frontend must **NOT**:

- replace it;
- duplicate it;
- add another onboarding layer there.

Guest player becomes onboarding player **ONLY** after:

- wallet connection;
- Telegram auth.

---

## 17) Skip Rules

Every fullscreen onboarding spotlight must include:

```txt
Skip
```

Skip must:

- hide current spotlight;
- **NOT** delete onboarding progress;
- **NOT** delete radar gifts.

---

## 18) Analytics Events

Track:

```txt
onboarding_step_shown
onboarding_step_clicked
onboarding_step_skipped
onboarding_completed
store_intro_shown
radar_gift_prompt_shown
radar_gift_claimed
```

---

## 19) Implementation Stages (Rollout Plan)

### Stage 0 — Discovery & Contracts

- validate backend onboarding state contract and expected payloads;
- confirm all source UI selectors exist and are stable (`#startBtn`, `#storeBtn`, Store radar ids);
- map current frontend entry points (auth, game over, store open, reload);
- align analytics naming and payload schema.

**Deliverables:**

- selector/state contract checklist;
- event schema draft;
- risk list for reload/reopen continuity.

### Stage 1 — Onboarding Core Module

Implement base module skeleton:

```txt
js/features/onboarding/
  index.js
  onboarding-service.js
  onboarding-state.js
```

- onboarding state machine (step resolver);
- backend state fetch + restore;
- local volatile runtime cache for UI synchronization;
- integration in `js/game/bootstrap.js`.

**Exit criteria:** app restores onboarding step after reload and exposes a single onboarding source of truth.

### Stage 2 — Spotlight Engine

Implement:

```txt
js/features/onboarding/spotlight.js
```

- fullscreen dim layer;
- target cutout/highlight;
- click blocking outside target;
- safe-area + Telegram viewport support;
- Skip handling callback.

**Exit criteria:** spotlight works for dynamic targets and can be reused in menu/store contexts.

### Stage 3 — Hook Layer (Non-fullscreen prompts)

Implement:

```txt
js/features/onboarding/hooks.js
```

- near-button contextual hooks for `#startBtn` and `PLAY AGAIN`;
- no fullscreen overlay for run-step prompts;
- sequencing for steps 1–4 with correct reward texts.

**Exit criteria:** authenticated run flow prompts render in correct order without duplicate guest hints.

### Stage 4 — Store Intro & Ride Pack Flow

- trigger `#storeBtn` spotlight after Store intro entry condition;
- implement in-store highlight for `#store-ride-pack-3` with Skip and no text;
- on ride purchase: highlight Store back button;
- after return to menu: spotlight `#startBtn` with “You’re ready. Start again.”;
- mark onboarding completed.

**Exit criteria:** Store intro chain completes once and does not restart after reload post-purchase.

### Stage 5 — Radar Gift Flow (6/15 runs)

Implement:

```txt
js/features/onboarding/gift-indicator.js
```

- radar unlock prompt spotlight (`Claim your free Radar`);
- persistent glowing gift icon under coins after Skip;
- continue flow on manual Store entry;
- `FREE 24H` label override for targeted gift items;
- claim actions via `/api/onboarding/claim` for both rewards.

**Exit criteria:** both radar gifts can be claimed through onboarding path with persistent continuation.

### Stage 6 — Active Radar UI & Time Formatting

- show active radar icons under coins;
- render remaining time in hours only;
- round up; clamp sub-hour values to `1h`.

**Exit criteria:** only active boosts are shown with correct hour formatting.

### Stage 7 — Analytics, QA Matrix, and Release

- add required analytics events:
  - `onboarding_step_shown`
  - `onboarding_step_clicked`
  - `onboarding_step_skipped`
  - `onboarding_completed`
  - `store_intro_shown`
  - `radar_gift_prompt_shown`
  - `radar_gift_claimed`
- prepare QA matrix for:
  - authenticated path (steps 1–4);
  - reload at every step;
  - skip at every fullscreen spotlight;
  - manual Store entry;
  - Telegram + web parity;
  - guest flow non-regression.

**Exit criteria:** QA matrix passed, analytics validated, feature ready for rollout.

### Recommended Delivery Sequence (PR split)

1. PR A — onboarding core + state restoration.
2. PR B — spotlight engine + shared API.
3. PR C — auth run hooks (steps 1–4).
4. PR D — Store intro + ride pack onboarding completion.
5. PR E — Radar gift onboarding + gift indicator + claim calls.
6. PR F — Active radar UI + analytics + final QA fixes.

---

## 20) Execution Plan — 4 Iterations

Implement the onboarding scope in **4 delivery iterations**.

**Progress status:**
- ✅ Iteration 1 — completed
- ✅ Iteration 2 — completed
- 🔄 Iteration 3 — in progress
- ⏳ Iteration 4 — pending

### Iteration 1 — Foundation (state + contracts + spotlight base)

Scope:

- backend onboarding contract alignment;
- selectors and entry-point audit;
- onboarding core state restore (`onboarding-service.js`, `onboarding-state.js`);
- bootstrap integration;
- reusable spotlight engine MVP (`spotlight.js`) with Skip and click-blocking.

Output:

- onboarding state survives reload;
- spotlight can target `#startBtn` / `#storeBtn`.

### Iteration 2 — Main Auth Flow + Store Intro

Scope:

- run-step hooks (steps 1–4) near `PLAY AGAIN` and `#startBtn`;
- reward copy mapping (`+100 silver bonus`, `+100 gold bonus`);
- Store intro spotlight for `#storeBtn`;
- in-store highlight for `#store-ride-pack-3`;
- completion path after ride purchase/back-to-menu.

Output:

- authenticated onboarding path through Store intro is fully traversable;
- reload after ride purchase does not restart onboarding.

### Iteration 3 — Radar Gifts + Gift Indicator

Scope:

- unlock flow after 6/15 authenticated runs;
- gift icon persistence under coins after Skip;
- manual Store entry continuation;
- `FREE 24H` label override for radar gifts;
- claim calls:
  - `reward: "radar_obstacles_24h"`
  - `reward: "radar_gold_24h"`.

Output:

- both radar gifts are claimable through onboarding flow and survive reload/reopen.

### Iteration 4 — Hardening, Analytics, QA, Release

Scope:

- active radar UI under coins (hours-only, rounded up, min `1h`);
- analytics instrumentation and validation;
- regression and edge-case QA matrix;
- Telegram/Web parity verification;
- rollout checklist and production release.

Output:

- onboarding feature is production-ready with validated analytics and persistence behavior.

### Suggested PR mapping to 4 iterations

1. **PR-1:** foundation + spotlight base.
2. **PR-2:** auth flow + Store intro/ride pack.
3. **PR-3:** radar gifts + gift indicator + claim integration.
4. **PR-4:** radar UI + analytics + QA fixes + release prep.
