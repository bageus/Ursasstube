function normalizePathname(pathname) {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function shouldRedirectToPhaserPreviewFromUrl(urlLike) {
  const url = typeof urlLike === 'string' ? new URL(urlLike) : new URL(urlLike.toString());
  const requestedRenderer = (url.searchParams.get('renderer') || '').trim().toLowerCase();
  const skipRedirect = (url.searchParams.get('phaser_preview_redirect') || '').trim().toLowerCase() === 'off';

  const normalizedPath = normalizePathname(url.pathname);
  const onMainEntrypoint = normalizedPath === '/' || normalizedPath === '/index.html';
  const alreadyOnPhaserRoute = normalizedPath === '/phaser' || normalizedPath.startsWith('/phaser/');

  return requestedRenderer === 'phaser' && !skipRedirect && onMainEntrypoint && !alreadyOnPhaserRoute;
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

export { shouldRedirectToPhaserPreviewFromUrl, buildPhaserPreviewUrl };
