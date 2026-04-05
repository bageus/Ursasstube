import { createCenteredOverlay, createElement } from './dom-render.js';

function showTelegramLinkOverlay({ code, botUsername, botLink }) {
  const codeEl = createElement('div', {
    textContent: code,
    style: {
      background: '#0f3460',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '8px',
      fontSize: '24px',
      fontWeight: 'bold',
      letterSpacing: '2px',
      marginBottom: '12px',
      cursor: 'pointer',
      userSelect: 'all'
    }
  });

  const hintEl = createElement('div', {
    textContent: '👆 Tap to copy',
    style: { fontSize: '12px', color: '#666', marginBottom: '20px' }
  });

  const closeBtn = createElement('button', {
    textContent: 'Close',
    attributes: {
      type: 'button',
      id: 'linkTelegramCloseBtn'
    },
    style: {
      background: '#666',
      border: 'none',
      color: '#fff',
      padding: '8px 24px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      marginTop: '8px'
    }
  });

  const panel = createElement('div', {
    style: {
      background: '#1a1a2e',
      borderRadius: '16px',
      padding: '32px',
      maxWidth: '360px',
      width: '90%',
      textAlign: 'center',
      border: '1px solid rgba(255,255,255,0.1)',
      color: '#fff',
      fontFamily: 'sans-serif'
    },
    children: [
      createElement('div', {
        textContent: '🔗 Link Telegram',
        style: { fontSize: '24px', marginBottom: '12px' }
      }),
      createElement('div', {
        textContent: 'Your verification code:',
        style: { fontSize: '14px', color: '#aaa', marginBottom: '20px' }
      }),
      codeEl,
      hintEl,
      createElement('div', {
        style: { fontSize: '14px', color: '#ccc', marginBottom: '20px', lineHeight: '1.6' },
        children: [
          document.createTextNode('1. Copy the code above'),
          createElement('br'),
          document.createTextNode('2. Send it to '),
          createElement('a', {
            textContent: `@${botUsername}`,
            attributes: { href: botLink, target: '_blank', rel: 'noopener noreferrer' },
            style: { color: '#4fc3f7', textDecoration: 'none', fontWeight: 'bold' }
          }),
          createElement('br'),
          document.createTextNode('3. Done! ✅')
        ]
      }),
      createElement('div', {
        textContent: '⏰ Code expires in 10 minutes',
        style: { fontSize: '12px', color: '#666', marginBottom: '20px' }
      }),
      createElement('a', {
        textContent: `📱 Open @${botUsername}`,
        attributes: { href: botLink, target: '_blank', rel: 'noopener noreferrer' },
        style: {
          display: 'inline-block',
          background: '#0088cc',
          color: '#fff',
          padding: '12px 32px',
          borderRadius: '8px',
          fontSize: '16px',
          textDecoration: 'none',
          fontWeight: 'bold',
          marginBottom: '12px'
        }
      }),
      createElement('br'),
      closeBtn
    ]
  });

  const overlay = createCenteredOverlay({
    id: 'linkTelegramOverlay',
    children: [panel]
  });

  document.body.appendChild(overlay);

  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

  codeEl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      codeEl.style.background = '#1a5c2a';
      hintEl.textContent = '✅ Copied!';
      setTimeout(() => {
        codeEl.style.background = '#0f3460';
        hintEl.textContent = '👆 Tap to copy';
      }, 2000);
    } catch (_error) {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      hintEl.textContent = '✅ Copied!';
      setTimeout(() => {
        hintEl.textContent = '👆 Tap to copy';
      }, 2000);
    }
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
}

export { showTelegramLinkOverlay };
