const milestoneStorageKeys = { 3: 'ursas_seen_top_3', 10: 'ursas_seen_top_10', 100: 'ursas_seen_top_100', 1000: 'ursas_seen_top_1000' };

function getLocalStorageSafe() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage || null; } catch (_e) { return null; }
}

function shouldCelebrateMilestone({ score, bestScoreBeforeRun, playerPosition }) {
  if (score > bestScoreBeforeRun) return true;
  if (playerPosition === 1) return true;
  const storage = getLocalStorageSafe();
  for (const top of [3, 10, 100, 1000]) {
    if (playerPosition > 0 && playerPosition <= top) {
      const key = milestoneStorageKeys[top];
      if (storage?.getItem(key) !== '1') {
        storage?.setItem?.(key, '1');
        return true;
      }
    }
  }
  return false;
}

function spawnGameOverConfetti(layer) {
  if (!layer) return;
  layer.innerHTML = '';
  const colors = ['#22d3ee', '#a855f7', '#fbbf24', '#34d399', '#f472b6'];
  for (let i = 0; i < 28; i += 1) {
    const p = document.createElement('span');
    p.className = 'go-confetti';
    p.style.left = `${5 + Math.random() * 90}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 180)}px`);
    p.style.setProperty('--dy', `${Math.round(Math.random() * 140)}px`);
    p.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 720)}deg`);
    layer.appendChild(p);
  }
  setTimeout(() => { layer.innerHTML = ''; }, 1200);
}

export function maybeCelebrateMilestone({ dom, score, bestScoreBeforeRun, playerPosition }) {
  if (!shouldCelebrateMilestone({ score, bestScoreBeforeRun, playerPosition })) return;
  const layer = dom?.goConfettiLayer || document.getElementById('goConfettiLayer');
  spawnGameOverConfetti(layer);
}
