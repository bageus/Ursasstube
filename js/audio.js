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

/* ===== AUDIO MANAGER ===== */
const audioManager = {
  sfx: {},
  music: {},
  currentMusic: null,
  currentMusicName: null,
  suspendedMusicName: null,

  init() {
    this.sfx.bad_bonus = createAudio('assets/sfx/bad_bonus.wav');
    this.sfx.coin = createAudio('assets/sfx/coin.wav');
    this.sfx.good_bonus = createAudio('assets/sfx/good_bonus.wav');
    this.sfx.gamestart = createAudio('assets/sfx/game_start.wav');
    this.sfx.gameover = createAudio('assets/sfx/game-over.mp3');
    this.sfx.spin = createAudio('assets/sfx/crush__lose_gm.wav');
    this.sfx.gameover_screen = createAudio('assets/sfx/gameover_screen.wav', { loop: true });

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

  applyVolumes() {
    const sfxVol = audioSettings.sfxEnabled ? 1 : 0;
    const musicVol = audioSettings.musicEnabled ? 1 : 0;
    Object.values(this.sfx).forEach((s) => { s.volume = sfxVol; });
    Object.values(this.music).forEach((m) => { m.volume = musicVol; });
  },

  playSFX(name) {
    if (!audioSettings.sfxEnabled) return;
    const s = this.sfx[name];
    if (!s) return;
    s.volume = audioSettings.sfxEnabled ? 1 : 0;
    s.currentTime = 0;
    s.play().catch(() => {});
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
    this.suspendedMusicName = null;
    if (!audioSettings.musicEnabled) return;
    m.play().catch(() => {});
  },

  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }
    this.currentMusic = null;
    this.currentMusicName = null;
    this.suspendedMusicName = null;
  },

  suspendMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.suspendedMusicName = this.currentMusicName;
    }
  },

  resumeMusic() {
    const nameToResume = this.suspendedMusicName || this.currentMusicName;
    if (!nameToResume || !audioSettings.musicEnabled) return;
    const music = this.music[nameToResume];
    if (!music) return;
    this.currentMusic = music;
    this.currentMusicName = nameToResume;
    this.suspendedMusicName = null;
    music.volume = 1;
    music.currentTime = 0;
    music.play().catch(() => {});
  },

  playRandomGameMusic() {
    const tracks = ['game1', 'game2', 'game3'];
    let pick;
    do { pick = tracks[Math.floor(Math.random() * tracks.length)]; }
    while (pick === this.currentMusicName && tracks.length > 1);
    this.playMusic(pick);
  },

  stopAll() {
    this.stopMusic();
    Object.values(this.sfx).forEach((s) => { s.pause(); s.currentTime = 0; });
  }
};

const audioSettings = { sfxEnabled: true, musicEnabled: true };

const AUDIO_TOGGLE_BUTTONS = Object.freeze([
  { id: 'storeSfxBtn', setting: 'sfxEnabled', enabledIcon: '🔊', disabledIcon: '🔇', toggle: toggleSfxMute },
  { id: 'storeMusicBtn', setting: 'musicEnabled', enabledIcon: '🎵', disabledIcon: '🔇', toggle: toggleMusicMute },
  { id: 'gameSfxBtn', setting: 'sfxEnabled', enabledIcon: '🔊', disabledIcon: '🔇', toggle: toggleSfxMute },
  { id: 'gameMusicBtn', setting: 'musicEnabled', enabledIcon: '🎵', disabledIcon: '🔇', toggle: toggleMusicMute },
  { id: 'startSfxBtn', setting: 'sfxEnabled', enabledIcon: '🔊', disabledIcon: '🔇', toggle: toggleSfxMute },
  { id: 'startMusicBtn', setting: 'musicEnabled', enabledIcon: '🎵', disabledIcon: '🔇', toggle: toggleMusicMute },
  { id: 'goSfxBtn', setting: 'sfxEnabled', enabledIcon: '🔊', disabledIcon: '🔇', toggle: toggleSfxMute },
  { id: 'goMusicBtn', setting: 'musicEnabled', enabledIcon: '🎵', disabledIcon: '🔇', toggle: toggleMusicMute },
  { id: 'rulesSfxBtn', setting: 'sfxEnabled', enabledIcon: '🔊', disabledIcon: '🔇', toggle: toggleSfxMute },
  { id: 'rulesMusicBtn', setting: 'musicEnabled', enabledIcon: '🎵', disabledIcon: '🔇', toggle: toggleMusicMute }
]);

/* ===== AUDIO TOGGLE SYSTEM ===== */
function setSfxEnabled(enabled) {
  audioSettings.sfxEnabled = enabled;
  const vol = enabled ? 1 : 0;
  Object.values(audioManager.sfx).forEach((s) => { s.volume = vol; });
  if (!enabled) {
    Object.values(audioManager.sfx).forEach((s) => {
      s.pause();
      s.currentTime = 0;
    });
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
  const sfxCb = document.getElementById('sfxToggle');
  const musicCb = document.getElementById('musicToggle');
  const sfxRow = document.getElementById('sfxToggleRow');
  const musicRow = document.getElementById('musicToggleRow');

  if (sfxCb) sfxCb.checked = audioSettings.sfxEnabled;
  if (musicCb) musicCb.checked = audioSettings.musicEnabled;
  if (sfxRow) sfxRow.classList.toggle('active', audioSettings.sfxEnabled);
  if (musicRow) musicRow.classList.toggle('active', audioSettings.musicEnabled);

  AUDIO_TOGGLE_BUTTONS.forEach(({ id, setting, enabledIcon, disabledIcon }) => {
    const button = document.getElementById(id);
    if (!button) return;

    const isEnabled = audioSettings[setting];
    button.textContent = isEnabled ? enabledIcon : disabledIcon;
    button.classList.toggle('muted', !isEnabled);
  });
}

function initAudioToggles() {
  const sfxCb = document.getElementById('sfxToggle');
  const musicCb = document.getElementById('musicToggle');
  if (sfxCb) sfxCb.addEventListener('change', () => { setSfxEnabled(sfxCb.checked); });
  if (musicCb) musicCb.addEventListener('change', () => { setMusicEnabled(musicCb.checked); });

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
