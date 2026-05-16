import { gameState } from './state.js';

function createAudio(path, { loop = false } = {}) {
  const audio = document.createElement('audio');
  audio.src = path;
  audio.loop = loop;
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  return audio;
}

function isAudioDebugEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.DEBUG_AUDIO === true) return true;
  try {
    return window.localStorage?.getItem('DEBUG_AUDIO') === '1';
  } catch (_error) {
    return false;
  }
}

/* ===== AUDIO MANAGER ===== */
const audioManager = {
  sfx: {},
  sfxPools: {},
  sfxPoolCursor: {},
  music: {},
  currentMusic: null,
  currentMusicName: null,
  suspendedMusic: null,
  audioLocked: false,
  pendingMusicName: null,
  currentScreen: 'menu',
  userGestureCaptured: false,
  retryUnlockHandlerAttached: false,

  init() {
    this.sfx.bad_bonus = createAudio('assets/sfx/bad_bonus.wav');
    this.sfx.coin = createAudio('assets/sfx/coin.wav');
    this.sfx.good_bonus = createAudio('assets/sfx/good_bonus.wav');
    this.sfx.gamestart = createAudio('assets/sfx/game_start.wav');
    this.sfx.gameover = createAudio('assets/sfx/game-over.mp3');
    this.sfx.spin = createAudio('assets/sfx/crush__lose_gm.wav');
    this.sfx.energetic_shield = createAudio('assets/sfx/energetiс_shield.ogg');
    this.sfx.gameover_screen = createAudio('assets/sfx/gameover_screen.wav', { loop: true });

    this.sfxPools.coin = Array.from({ length: 4 }, () => createAudio('assets/sfx/coin.wav'));
    this.sfxPools.good_bonus = Array.from({ length: 2 }, () => createAudio('assets/sfx/good_bonus.wav'));
    this.sfxPools.bad_bonus = Array.from({ length: 2 }, () => createAudio('assets/sfx/bad_bonus.wav'));

    this.music.menu = createAudio('assets/sound/BlackUrsa.ogg', { loop: true });
    this.music.game1 = createAudio('assets/sound/pixel-overdrive-1.ogg');
    this.music.game2 = createAudio('assets/sound/pixel-overdrive-2.ogg');
    this.music.game3 = createAudio('assets/sound/pixel-overdrive-3.ogg');

    ['game1', 'game2', 'game3'].forEach((key) => {
      this.music[key].addEventListener('ended', () => {
        if (gameState.running && audioSettings.musicEnabled) this.playRandomGameMusic();
      });
    });

    this.applyVolumes();
  },

  debug(action, name, media = null) {
    if (!isAudioDebugEnabled()) return;
    const m = media || this.music[name] || null;
    console.info('[audio-debug]', {
      action,
      name,
      readyState: m?.readyState,
      networkState: m?.networkState,
      duration: m?.duration,
      currentSrc: m?.currentSrc,
      error: m?.error?.message || m?.error?.code || null,
      audioLocked: this.audioLocked,
      currentScreen: this.currentScreen,
      currentMusicName: this.currentMusicName,
      pendingMusicName: this.pendingMusicName,
      userGestureCaptured: this.userGestureCaptured,
      musicEnabled: audioSettings.musicEnabled,
      sfxEnabled: audioSettings.sfxEnabled
    });
  },
  getAllowedMusicForScreen(screen = this.currentScreen) {
    if (screen === 'menu') return ['menu'];
    if (screen === 'gameplay') return ['game1', 'game2', 'game3'];
    return [];
  },
  setScreen(screen) {
    this.currentScreen = screen;
    if (screen !== 'gameplay' && this.currentMusicName && this.getAllowedMusicForScreen(screen).indexOf(this.currentMusicName) === -1) {
      this.stopMusic();
    }
    this.ensureMusicForCurrentScreen();
  },

  attachRetryUnlockOnNextGesture() {
    if (this.retryUnlockHandlerAttached) return;
    const onGesture = () => {
      this.retryUnlockHandlerAttached = false;
      this.unlockAudio().catch(() => {});
    };
    ['pointerdown', 'touchend', 'click'].forEach((eventName) => {
      document.addEventListener(eventName, onGesture, { once: true, passive: true });
    });
    this.retryUnlockHandlerAttached = true;
  },

  markUserGesture() {
    this.userGestureCaptured = true;
    if (this.audioLocked && this.pendingMusicName) {
      const pending = this.pendingMusicName;
      this.pendingMusicName = null;
      this.audioLocked = false;
      if (pending?.screen === this.currentScreen) this.playMusic(pending.name);
    }
  },
  prepareMenuAudio() {
    this.setScreen('menu');
    this.preloadMenuMusic();
    if (!this.isMobileAudioRuntime() && audioSettings.musicEnabled) this.playMusic('menu');
  },
  isMobileAudioRuntime() {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const narrowViewport = typeof window !== 'undefined' && Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
    return mobileUa || narrowViewport || Boolean(window?.Telegram?.WebApp);
  },
  preloadMenuMusic() { try { this.music.menu?.load(); } catch (_e) {} },
  preloadGameMusic() { ['game1', 'game2', 'game3'].forEach((n) => { try { this.music[n]?.load(); } catch (_e) {} }); },
  preloadSfx() {
    [...Object.values(this.sfx), ...Object.values(this.sfxPools).flat()].forEach((s) => { try { s.load(); } catch (_e) {} });
  },

  preloadMusic({ timeoutMs = 4000 } = {}) {
    const HAVE_FUTURE_DATA = 3;
    const entries = Object.entries(this.music);
    const waiters = entries.map(([name, track]) => new Promise((resolve) => {
      this.debug('preload:start', name, track);
      const done = () => {
        track.removeEventListener('canplaythrough', onReady);
        track.removeEventListener('canplay', onReady);
        resolve();
      };
      const onReady = () => {
        this.debug('preload:ready', name, track);
        done();
      };
      if (track.readyState >= HAVE_FUTURE_DATA) return resolve();
      track.addEventListener('canplaythrough', onReady, { once: true });
      track.addEventListener('canplay', onReady, { once: true });
      try { track.load(); } catch (_error) {}
    }));
    return Promise.race([
      Promise.all(waiters),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(timeoutMs) || 0)))
    ]);
  },

  async unlockAudio() {
    this.markUserGesture();
    const tracks = [
      ...Object.entries(this.sfx),
      ...Object.entries(this.sfxPools).flatMap(([name, pool]) => pool.map((track, index) => [`${name}#${index + 1}`, track]))
    ];
    for (const [name, track] of tracks) {
      const prevVolume = track.volume;
      try {
        const prevMuted = track.muted;
        track.volume = 0;
        track.muted = true;
        await track.play();
        track.pause();
        track.currentTime = 0;
        track.muted = prevMuted;
        this.debug('unlock:ok', name, track);
      } catch (_error) {
        this.debug('unlock:fail', name, track);
      } finally {
        track.volume = prevVolume;
      }
    }
    const allowed = this.getAllowedMusicForScreen();
    const first = allowed[0];
    if (first && this.music[first]) {
      try {
        const track = this.music[first];
        track.volume = 0;
        track.muted = true;
        await track.play();
        track.pause();
        track.currentTime = 0;
        track.muted = false;
      } catch (_error) {}
    }
    this.ensureMusicForCurrentScreen();
  },

  ensureGameMusicReady({ timeoutMs = 800 } = {}) {
    const tracks = [this.music.game1, this.music.game2, this.music.game3].filter(Boolean);
    const HAVE_FUTURE_DATA = 3;
    const waiters = tracks.map((track) => new Promise((resolve) => {
      if (track.readyState >= HAVE_FUTURE_DATA) return resolve();
      const onReady = () => {
        track.removeEventListener('canplaythrough', onReady);
        track.removeEventListener('canplay', onReady);
        resolve();
      };
      track.addEventListener('canplaythrough', onReady, { once: true });
      track.addEventListener('canplay', onReady, { once: true });
      try { track.load(); } catch (_error) {}
    }));
    return Promise.race([
      Promise.all(waiters),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(timeoutMs) || 0)))
    ]);
  },

  applyVolumes() {
    const sfxVol = audioSettings.sfxEnabled ? 1 : 0;
    const musicVol = audioSettings.musicEnabled ? 1 : 0;
    Object.values(this.sfx).forEach((s) => { s.volume = sfxVol; });
    Object.values(this.sfxPools).forEach((pool) => pool.forEach((s) => { s.volume = sfxVol; }));
    Object.values(this.music).forEach((m) => { m.volume = musicVol; });
  },

  playSFX(name) {
    if (!audioSettings.sfxEnabled) return;
    const pool = this.sfxPools[name];
    const s = pool && pool.length
      ? pool[(this.sfxPoolCursor[name] = (((this.sfxPoolCursor[name] ?? -1) + 1) % pool.length))]
      : this.sfx[name];
    if (!s) return;
    s.volume = audioSettings.sfxEnabled ? 1 : 0;
    s.currentTime = 0;
    const playPromise = s.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        this.audioLocked = true;
        this.attachRetryUnlockOnNextGesture();
        this.debug('sfx:play:locked', name, s);
      });
    }
  },

  stopSFX(name) {
    const s = this.sfx[name];
    if (!s) return;
    s.pause();
    s.currentTime = 0;
  },

  playMusic(name) {
    this.stopMusic();
    const m = this.music[name];
    if (!m) return;
    m.volume = audioSettings.musicEnabled ? 1 : 0;
    m.currentTime = 0;
    this.currentMusic = m;
    this.currentMusicName = name;
    this.suspendedMusic = null;
    if (!audioSettings.musicEnabled) return;
    const playPromise = m.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        this.audioLocked = true;
        this.pendingMusicName = { name, screen: this.currentScreen };
        this.debug('play:locked', name, m);
      });
    }
  },

  stopMusic() {
    Object.values(this.music).forEach((track) => {
      track.pause();
      track.currentTime = 0;
    });
    this.currentMusic = null;
    this.currentMusicName = null;
    this.suspendedMusic = null;
  },

  suspendMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.suspendedMusic = { name: this.currentMusicName, screen: this.currentScreen, currentTime: this.currentMusic.currentTime || 0 };
    }
  },

  resumeMusic() {
    const nameToResume = this.suspendedMusic?.screen === this.currentScreen ? this.suspendedMusic?.name : this.currentMusicName;
    if (!nameToResume || !audioSettings.musicEnabled) return;
    if (this.getAllowedMusicForScreen().indexOf(nameToResume) === -1) return;
    const music = this.music[nameToResume];
    if (!music) return;
    this.currentMusic = music;
    this.currentMusicName = nameToResume;
    const resumeAt = this.suspendedMusic?.name === nameToResume ? this.suspendedMusic.currentTime : 0;
    this.suspendedMusic = null;
    music.volume = 1;
    if (Number.isFinite(resumeAt) && resumeAt > 0) music.currentTime = resumeAt;
    music.play().catch(() => {});
  },

  playRandomGameMusic() {
    if (this.currentScreen !== 'gameplay') return;
    const tracks = ['game1', 'game2', 'game3'];
    let pick;
    do { pick = tracks[Math.floor(Math.random() * tracks.length)]; }
    while (pick === this.currentMusicName && tracks.length > 1);
    this.playMusic(pick);
  },

  stopAll() {
    this.stopMusic();
    Object.values(this.sfx).forEach((s) => { s.pause(); s.currentTime = 0; });
    Object.values(this.sfxPools).forEach((pool) => pool.forEach((s) => { s.pause(); s.currentTime = 0; }));
  },
  ensureMusicForCurrentScreen() {
    if (!audioSettings.musicEnabled) return;
    const allowed = this.getAllowedMusicForScreen();
    if (!allowed.length) return;
    if (this.currentMusicName && allowed.indexOf(this.currentMusicName) !== -1 && this.currentMusic && !this.currentMusic.paused) return;
    if (this.currentScreen === 'menu') this.playMusic('menu');
    else if (this.currentScreen === 'gameplay') this.playRandomGameMusic();
  }
};

const audioSettings = { sfxEnabled: true, musicEnabled: true };

const AUDIO_TOGGLE_BUTTONS = Object.freeze([
  { id: 'storeSfxBtn', setting: 'sfxEnabled', onClass: 'icon-sfx-on', offClass: 'icon-sfx-off', onLabel: 'SFX on', offLabel: 'SFX muted', toggle: toggleSfxMute },
  { id: 'storeMusicBtn', setting: 'musicEnabled', onClass: 'icon-music-on', offClass: 'icon-music-off', onLabel: 'Music on', offLabel: 'Music muted', toggle: toggleMusicMute },
  { id: 'gameSfxBtn', setting: 'sfxEnabled', onClass: 'icon-sfx-on', offClass: 'icon-sfx-off', onLabel: 'SFX on', offLabel: 'SFX muted', toggle: toggleSfxMute },
  { id: 'gameMusicBtn', setting: 'musicEnabled', onClass: 'icon-music-on', offClass: 'icon-music-off', onLabel: 'Music on', offLabel: 'Music muted', toggle: toggleMusicMute },
  { id: 'startSfxBtn', setting: 'sfxEnabled', onClass: 'icon-sfx-on', offClass: 'icon-sfx-off', onLabel: 'SFX on', offLabel: 'SFX muted', toggle: toggleSfxMute },
  { id: 'startMusicBtn', setting: 'musicEnabled', onClass: 'icon-music-on', offClass: 'icon-music-off', onLabel: 'Music on', offLabel: 'Music muted', toggle: toggleMusicMute },
  { id: 'goSfxBtn', setting: 'sfxEnabled', onClass: 'icon-sfx-on', offClass: 'icon-sfx-off', onLabel: 'SFX on', offLabel: 'SFX muted', toggle: toggleSfxMute },
  { id: 'goMusicBtn', setting: 'musicEnabled', onClass: 'icon-music-on', offClass: 'icon-music-off', onLabel: 'Music on', offLabel: 'Music muted', toggle: toggleMusicMute },
  { id: 'rulesSfxBtn', setting: 'sfxEnabled', onClass: 'icon-sfx-on', offClass: 'icon-sfx-off', onLabel: 'SFX on', offLabel: 'SFX muted', toggle: toggleSfxMute },
  { id: 'rulesMusicBtn', setting: 'musicEnabled', onClass: 'icon-music-on', offClass: 'icon-music-off', onLabel: 'Music on', offLabel: 'Music muted', toggle: toggleMusicMute }
]);

/* ===== AUDIO TOGGLE SYSTEM ===== */
function setSfxEnabled(enabled) {
  audioSettings.sfxEnabled = enabled;
  const vol = enabled ? 1 : 0;
  Object.values(audioManager.sfx).forEach((s) => { s.volume = vol; });
  Object.values(audioManager.sfxPools).forEach((pool) => pool.forEach((s) => { s.volume = vol; }));
  if (!enabled) {
    Object.values(audioManager.sfx).forEach((s) => {
      s.pause();
      s.currentTime = 0;
    });
    Object.values(audioManager.sfxPools).forEach((pool) => pool.forEach((s) => {
      s.pause();
      s.currentTime = 0;
    }));
  }
  localStorage.setItem('sfxEnabled', String(enabled));
  syncAllAudioUI();
}

function setMusicEnabled(enabled) {
  audioSettings.musicEnabled = enabled;
  const vol = enabled ? 1 : 0;
  Object.values(audioManager.music).forEach((m) => { m.volume = vol; });
  if (!enabled) {
    audioManager.suspendMusic();
  } else {
    audioManager.resumeMusic();
  }
  localStorage.setItem('musicEnabled', String(enabled));
  syncAllAudioUI();
}

function toggleSfxMute() { setSfxEnabled(!audioSettings.sfxEnabled); }
function toggleMusicMute() { setMusicEnabled(!audioSettings.musicEnabled); }

function syncAllAudioUI() {
  AUDIO_TOGGLE_BUTTONS.forEach(({ id, setting, onClass, offClass, onLabel, offLabel }) => {
    const button = document.getElementById(id);
    if (!button) return;

    const isEnabled = audioSettings[setting];
    const iconClass = isEnabled ? onClass : offClass;
    const label = isEnabled ? onLabel : offLabel;
    button.innerHTML = `<span class="icon-atlas audio-toggle-icon ${iconClass}" aria-hidden="true"></span>`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.classList.toggle('muted', !isEnabled);
  });
}

function initAudioToggles() {
  // Add explicit touchend listeners for all audio toggle buttons (mobile/Telegram fix)
  AUDIO_TOGGLE_BUTTONS.forEach(({ id, toggle }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }, { passive: false });
    }
  });

  syncAllAudioUI();
}

function restoreAudioSettings() {
  const sfxSaved = localStorage.getItem('sfxEnabled');
  const musicSaved = localStorage.getItem('musicEnabled');
  if (sfxSaved !== null) audioSettings.sfxEnabled = (sfxSaved === 'true');
  if (musicSaved !== null) audioSettings.musicEnabled = (musicSaved === 'true');
  audioManager.applyVolumes();
  syncAllAudioUI();
}

export {
  audioManager,
  toggleSfxMute,
  toggleMusicMute,
  syncAllAudioUI,
  initAudioToggles,
  restoreAudioSettings
};
