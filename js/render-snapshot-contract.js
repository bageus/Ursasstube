function validateRenderSnapshot(snapshot) {
  const issues = [];
  if (!snapshot || typeof snapshot !== 'object') {
    issues.push('snapshot must be an object');
  }

  const viewport = snapshot?.viewport;
  if (!viewport || typeof viewport !== 'object') {
    issues.push('viewport is required');
  } else {
    if (!Number.isFinite(viewport.width) || viewport.width <= 0) issues.push('viewport.width must be > 0');
    if (!Number.isFinite(viewport.height) || viewport.height <= 0) issues.push('viewport.height must be > 0');
  }

  if (!snapshot?.tube || typeof snapshot.tube !== 'object') {
    issues.push('tube is required');
  }

  if (!snapshot?.player || typeof snapshot.player !== 'object') {
    issues.push('player is required');
  }

  return { ok: issues.length === 0, issues };
}

export { validateRenderSnapshot };
