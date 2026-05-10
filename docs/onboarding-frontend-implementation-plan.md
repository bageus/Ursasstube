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
