export function stabilizeMenuLoad() {
  const settleMenu = () => {
    document.body.classList.remove('loading-ui');
    document.body.classList.add('ui-stable');
  };

  const waitFonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  const criticalImages = ['img/glow.png', 'img/bear.png', 'img/eyes.png'];
  const waitImages = Promise.all(criticalImages.map((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  })));

  Promise.all([waitFonts, waitImages]).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(settleMenu));
  });

  window.addEventListener('load', () => {
    setTimeout(() => {
      if (document.body.classList.contains('loading-ui')) settleMenu();
    }, 1200);
  }, { once: true });
}
