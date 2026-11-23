// Universal quick-directions popup (home-v2, Blake 23 Nov 2026). ONE popup for every explore / walk mode (guitar walk and amp walk),
// replacing the per-object how-to hints (#hint in index.html, #zg-amp-hint in amp-chrome.js; both stay hidden / unused).
// Own failure domain: init and every handler are wrapped, so a bug here can never break walking, the scene or the apps.
// It only reads body[data-mode]; it never touches scene state. Styles: chrome.css (#zg-walk-help, #zg-walk-help-btn).
// Dismiss: x button, tap on it, or Escape. A small "?" (next to Home) reopens it. Dismissal is remembered (localStorage, best effort).

const KEY = 'zg-walk-help-dismissed';

function init() {
  const touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  let dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === '1'; } catch (_) { /* storage blocked: shown each time */ }

  const card = document.createElement('div');
  card.id = 'zg-walk-help';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Walking controls');
  const title = document.createElement('div');
  title.className = 'zg-wh-title';
  title.textContent = 'Walking controls';
  const list = document.createElement('ul');
  const rows = touch
    ? [['Left stick', 'walk'], ['Drag', 'look around'], ['◆', 'jump']]
    : [['W A S D', 'walk (Shift = faster)'], ['Click + drag', 'look around'], ['Space', 'jump']];
  for (const [k, v] of rows) {
    const li = document.createElement('li');
    const kk = document.createElement('b');
    kk.textContent = k;
    li.append(kk, document.createTextNode(' ' + v));
    list.appendChild(li);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'zg-wh-close';
  close.setAttribute('aria-label', 'Close walking controls');
  close.textContent = '×';
  card.append(close, title, list);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'zg-walk-help-btn';
  btn.setAttribute('aria-label', 'Show walking controls');
  btn.textContent = '?';

  // keep presses on the popup away from the walker's look-drag handlers
  for (const t of ['pointerdown', 'touchstart', 'mousedown']) {
    card.addEventListener(t, (e) => e.stopPropagation());
    btn.addEventListener(t, (e) => e.stopPropagation());
  }
  document.body.append(card, btn);

  let open = false;
  function render() {
    const m = document.body.dataset.mode;
    const walkish = m === 'walk' || m === 'amp';
    card.classList.toggle('show', walkish && open);
    btn.classList.toggle('show', walkish && !open);
  }
  function setOpen(v) {
    open = v;
    render();
  }
  function onMode() {
    try {
      const m = document.body.dataset.mode;
      if (m === 'walk' || m === 'amp') {
        const h = window.__amp && window.__amp.handle;
        // amp: only when the amp is walkable (driver present); the orbit-only amp has nothing to explain
        if (m === 'amp' && !(h && h.driver) && !(window.__ampHandle && window.__ampHandle.driver)) { open = false; render(); return; }
        if (!open && !dismissed) open = true;
      } else {
        open = false;
      }
      render();
    } catch (e) {
      console.warn('[walk-help] mode update failed', e);
    }
  }
  close.addEventListener('click', () => {
    dismissed = true;
    try { localStorage.setItem(KEY, '1'); } catch (_) { /* ignore */ }
    setOpen(false);
  });
  btn.addEventListener('click', () => setOpen(true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      dismissed = true;
      try { localStorage.setItem(KEY, '1'); } catch (_) { /* ignore */ }
      setOpen(false);
    }
  });
  new MutationObserver(onMode).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  document.addEventListener('zg:mode', onMode);
  onMode();
}

function start() {
  try {
    init();
  } catch (e) {
    console.warn('[walk-help] disabled:', e && e.message ? e.message : e);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
