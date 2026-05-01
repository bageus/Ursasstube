# QA Report Template — Start-screen overheating mitigation (Telegram Mini App)

**Build hash / tag:**  
**Environment (prod/stage):**  
**Date (UTC):**  
**Tester:**  

---

## 1) Device matrix

| # | Device | OS | Telegram version | SoC / RAM | Result |
|---|--------|----|------------------|-----------|--------|
| 1 | iPhone 12/13+ | iOS | | | |
| 2 | Android mid-tier | Android 12+ | | | |
| 3 | Android low-tier | Android (4GB RAM) | | | |

---

## 2) Test protocol (required)

1. Cold open Mini App → stay on **Start Menu** for 60s.
2. Press **Start Game** → wait transition/preload → play 15–30s.
3. Trigger **Game Over** → stay on screen 60s.
4. Return to **Menu** → stay 60s.
5. Repeat steps 2–4 **three times**.

---

## 3) Observations per device

### Device: __________________

- Start Menu 60s (thermal): cool / warm / hot
- Start Menu smoothness: OK / minor jank / major jank
- Start transition visual handoff: clean / occasional black frame / frequent black frame
- Game Over 60s (thermal): cool / warm / hot
- Menu-after-GO 60s (thermal): cool / warm / hot
- 3-loop stability: pass / fail
- Crashes / WebView restarts: none / present
- Notes:

---

## 4) Pass/fail gates

Mark each gate:

- [ ] No sustained heating on Start Menu idle windows
- [ ] No sustained heating on Game Over / post-GO Menu windows
- [ ] Start transition has no visible black-screen regressions
- [ ] 3 repeated loops complete without degradation or restart
- [ ] Gameplay responsiveness remains acceptable (subjective 60 FPS feel)

---

## 5) Final decision

- **Release status:** APPROVED / BLOCKED
- **Blocking issues (if any):**
- **Recommended follow-ups:**

---

## 6) Attachments

- Screenshots/video:
- Console logs:
- Perf traces (if available):
