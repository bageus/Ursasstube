import { audioManager } from './audio.js';

const APP_ICON_PATH = '/img/app-icon.svg';
const FAVICON_PATH = '/favicon.svg';
const MANIFEST_PATH = '/site.webmanifest';
const WEB_MENU_STYLES_PATH = '/css/web-menu-layout.css';

function isTelegramRuntime() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__URSASS_IS_TELEGRAM_RUNTIME__
    || window.Telegram?.WebApp
    || document?.documentElement?.classList?.contains('telegram-runtime')
    || document?.body?.classList?.contains('telegram-runtime')
    || /Telegram/i.test(navigator?.userAgent || '')
  );
}

function ensureLink(rel, href, attrs = {}) {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head?.append(link);
  }
  link.href = href;
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) link.setAttribute(key, String(value));
  });
  return link;
}

function ensureStylesheet(href) {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector(`link[data-ursass-stylesheet="${href}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.ursassStylesheet = href;
    document.head?.append(link);
  }
  link.href = href;
  return link;
}

function ensureMeta(name, content) {
  if (typeof document === 'undefined') return null;
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head?.append(meta);
  }
  meta.content = content;
  return meta;
}

function configureMediaSessionMetadata() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'URSASS TUBE',
      artist: 'URSASS TUBE',
      album: 'Telegram mini app',
      artwork: [
        { src: APP_ICON_PATH, sizes: 'any', type: 'image/svg+xml' },
      ],
    });
    navigator.mediaSession.playbackState = 'none';
  } catch (_error) {}
}

function clearTelegramMediaSessionPlayback() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = 'none';
  } catch (_error) {}
}

function stopTelegramSfxPlayback(originalStopSFX) {
  Object.keys(audioManager.sfx || {}).forEach((name) => {
    try {
      originalStopSFX(name);
    } catch (_error) {}
  });
  Object.values(audioManager.sfxPools || {}).forEach((pool) => {
    pool.forEach((track) => {
      try {
        track.pause();
        track.currentTime = 0;
      } catch (_error) {}
    });
  });
}

function installTelegramMediaPolicy() {
  if (!isTelegramRuntime()) return;
  if (audioManager.__telegramMediaPolicyInstalled) return;
  audioManager.__telegramMediaPolicyInstalled = true;

  const originalPrepareMenuAudio = audioManager.prepareMenuAudio.bind(audioManager);
  const originalPreloadMenuMusic = audioManager.preloadMenuMusic.bind(audioManager);
  const originalStopMusic = audioManager.stopMusic.bind(audioManager);
  const originalStopSFX = audioManager.stopSFX.bind(audioManager);

  audioManager.getAllowedMusicForScreen = () => [];
  audioManager.playMusic = () => {
    originalStopMusic();
    clearTelegramMediaSessionPlayback();
  };
  audioManager.ensureMusicForCurrentScreen = () => {
    originalStopMusic();
    clearTelegramMediaSessionPlayback();
  };
  audioManager.preloadSfx = () => {
    stopTelegramSfxPlayback(originalStopSFX);
    clearTelegramMediaSessionPlayback();
  };
  audioManager.playSFX = () => {
    stopTelegramSfxPlayback(originalStopSFX);
    clearTelegramMediaSessionPlayback();
  };
  audioManager.stopSFX = (name) => {
    originalStopSFX(name);
    clearTelegramMediaSessionPlayback();
  };
  audioManager.unlockAudio = async () => {
    audioManager.markUserGesture();
    stopTelegramSfxPlayback(originalStopSFX);
    originalStopMusic();
    clearTelegramMediaSessionPlayback();
  };
  audioManager.prepareMenuAudio = () => {
    audioManager.setScreen('menu');
    originalPreloadMenuMusic();
    originalStopMusic();
    stopTelegramSfxPlayback(originalStopSFX);
    clearTelegramMediaSessionPlayback();
  };

  originalPrepareMenuAudio.cancelledByTelegramMediaPolicy = true;
  originalStopMusic();
  stopTelegramSfxPlayback(originalStopSFX);
  clearTelegramMediaSessionPlayback();
}

function configureAppMetadata() {
  ensureLink('icon', FAVICON_PATH, { type: 'image/svg+xml' });
  ensureLink('mask-icon', APP_ICON_PATH, { color: '#050611' });
  ensureLink('apple-touch-icon', APP_ICON_PATH);
  ensureLink('manifest', MANIFEST_PATH);
  ensureStylesheet(WEB_MENU_STYLES_PATH);
  ensureMeta('theme-color', '#050611');
  ensureMeta('apple-mobile-web-app-title', 'URSASS TUBE');
  ensureMeta('application-name', 'URSASS TUBE');
  configureMediaSessionMetadata();
  installTelegramMediaPolicy();
}

export { configureAppMetadata, installTelegramMediaPolicy };
