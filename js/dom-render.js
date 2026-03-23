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

function appendChildren(node, children = []) {
  children.filter(Boolean).forEach((child) => node.appendChild(child));
  return node;
}

export function createElement(tagName, {
  className = '',
  textContent = null,
  id = '',
  attributes = null,
  style = null,
  dataset = null,
  children = []
} = {}) {
  const node = document.createElement(tagName);
  if (id) node.id = id;
  if (className) node.className = className;
  if (textContent !== null) node.textContent = textContent;
  if (style) Object.assign(node.style, style);
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        node.setAttribute(key, value);
      }
    });
  }
  if (dataset) {
    Object.entries(dataset).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        node.dataset[key] = value;
      }
    });
  }
  appendChildren(node, children);
  return node;
}


export function createCenteredOverlay({ id = '', children = [] } = {}) {
  const overlay = createElement('div', {
    id,
    style: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.85)',
      zIndex: '99999',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  });
  appendChildren(overlay, children);
  return overlay;
}
