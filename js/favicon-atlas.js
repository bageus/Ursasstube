const ICON_ATLAS_PATH = '/assets/icon_atlas.webp';
const FAVICON_SOURCE = {
  x: 0,
  y: 192,
  width: 64,
  height: 64,
};

function getOrCreateIconLink() {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head?.append(link);
  }
  return link;
}

function setAtlasImageFallback() {
  const link = getOrCreateIconLink();
  link.type = 'image/webp';
  link.href = ICON_ATLAS_PATH;
}

function installAtlasFavicon() {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;

  setAtlasImageFallback();

  const atlas = new Image();
  atlas.decoding = 'async';
  atlas.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = FAVICON_SOURCE.width;
      canvas.height = FAVICON_SOURCE.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(
        atlas,
        FAVICON_SOURCE.x,
        FAVICON_SOURCE.y,
        FAVICON_SOURCE.width,
        FAVICON_SOURCE.height,
        0,
        0,
        FAVICON_SOURCE.width,
        FAVICON_SOURCE.height,
      );
      const link = getOrCreateIconLink();
      link.type = 'image/png';
      link.href = canvas.toDataURL('image/png');
    } catch (_error) {
      setAtlasImageFallback();
    }
  };
  atlas.onerror = () => setAtlasImageFallback();
  atlas.src = ICON_ATLAS_PATH;
}

export { installAtlasFavicon };
