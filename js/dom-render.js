export function createIconAtlas({
  width,
  height,
  backgroundSize,
  backgroundPosition,
  className = "icon-atlas",
  marginRight = null
}) {
  const icon = document.createElement("span");
  icon.className = className;
  icon.style.width = `${width}px`;
  icon.style.height = `${height}px`;
  icon.style.backgroundSize = backgroundSize;
  icon.style.backgroundPosition = backgroundPosition;
  if (marginRight !== null) {
    icon.style.marginRight = `${marginRight}px`;
  }
  return icon;
}

export function createImageIcon({
  src,
  width = null,
  height = null,
  verticalAlign = null,
  alt = ""
}) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  if (width !== null) img.style.width = `${width}px`;
  if (height !== null) img.style.height = `${height}px`;
  if (verticalAlign) img.style.verticalAlign = verticalAlign;
  return img;
}

export function clearNode(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function createCenteredOverlay({ id = '', innerHTML = '' } = {}) {
  const overlay = document.createElement('div');
  if (id) overlay.id = id;
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = innerHTML;
  return overlay;
}
