function normalizePathname(pathname) {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function shouldUsePhaserRendererFromUrl(urlLike) {
  const url = typeof urlLike === 'string' ? new URL(urlLike) : new URL(urlLike.toString());
  const requestedRenderer = (url.searchParams.get('renderer') || '').trim().toLowerCase();
  const skipPhaser = (url.searchParams.get('phaser_preview_redirect') || '').trim().toLowerCase() === 'off';

  const normalizedPath = normalizePathname(url.pathname);
  const onPhaserRoute = normalizedPath === '/phaser' || normalizedPath.startsWith('/phaser/');
  if (onPhaserRoute) return true;
  if (skipPhaser) return false;
  if (requestedRenderer === 'canvas') return false;
  return requestedRenderer === '' || requestedRenderer === 'phaser';
}

function buildPhaserPreviewUrl(urlLike) {
  const current = typeof urlLike === 'string' ? new URL(urlLike) : new URL(urlLike.toString());
  const target = new URL('/phaser/', current.origin);

  for (const [key, value] of current.searchParams.entries()) {
    if (key === 'phaser_preview_redirect') continue;
    target.searchParams.set(key, value);
  }

  if (current.hash) {
    target.hash = current.hash;
  }

  return target;
}

export { shouldUsePhaserRendererFromUrl, buildPhaserPreviewUrl };
