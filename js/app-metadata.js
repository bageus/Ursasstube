import { audioManager } from './audio.js';

const APP_ICON_PATH = '/img/app-icon.svg';
const MANIFEST_PATH = '/site.webmanifest';

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

function installTelegramMediaPolicy() {
  if (!isTelegramRuntime()) return;
  if (audioManager.__telegramMediaPolicyInstalled) return;
  audioManager.__telegramMediaPolicyInstalled = true;

  const originalPrepareMenuAudio = audioManager.prepareMenuAudio.bind(audioManager);
  const originalPreloadMenuMusic = audioManager.preloadMenuMusic.bind(audioManager);
  const originalStopMusic = audioManager.stopMusic.bind(audioManager);

  audioManager.getAllowedMusicForScreen = () => [];
  audioManager.playMusic = () => {
    originalStopMusic();
    clearTelegramMediaSessionPlayback();
  };
  audioManager.ensureMusicForCurrentScreen = () => {
    originalStopMusic();
    clearTelegramMediaSessionPlayback();
  };
  audioManager.prepareMenuAudio = () => {
    audioManager.setScreen('menu');
    originalPreloadMenuMusic();
    originalStopMusic();
    clearTelegramMediaSessionPlayback();
  };

  originalPrepareMenuAudio.cancelledByTelegramMediaPolicy = true;
  originalStopMusic();
  clearTelegramMediaSessionPlayback();
}

function configureAppMetadata() {
  ensureLink('icon', APP_ICON_PATH, { type: 'image/svg+xml' });
  ensureLink('mask-icon', APP_ICON_PATH, { color: '#050611' });
  ensureLink('apple-touch-icon', APP_ICON_PATH);
  ensureLink('manifest', MANIFEST_PATH);
  ensureMeta('theme-color', '#050611');
  ensureMeta('apple-mobile-web-app-title', 'URSASS TUBE');
  ensureMeta('application-name', 'URSASS TUBE');
  configureMediaSessionMetadata();
  installTelegramMediaPolicy();
}

export { configureAppMetadata, installTelegramMediaPolicy };
