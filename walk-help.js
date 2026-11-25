// Universal quick-directions popup (home-v2, Blake 23 Nov 2026). ONE popup for every explore / walk mode (guitar walk and amp walk),
// replacing the per-object how-to hints (#hint in index.html, #zg-amp-hint in amp-chrome.js; both stay hidden / unused).
// Own failure domain: init and every handler are wrapped, so a bug here can never break walking, the scene or the apps.
// It only reads body[data-mode]; it never touches scene state. Styles: chrome.css (#zg-walk-help, #zg-walk-help-btn).
// Shows on EVERY entry to Explore (nothing is remembered: Blake lost the directions to a permanent localStorage dismissal, Nov 2026),
// then fades after AUTO_MS or on the first walk / look / jump input, so it never sits on the Explore title.
// Dismiss: x button, or Escape while the mouse is free (Esc while the mouse is captured only frees it). A small "?" (next to Home) reopens it.

const OLD_KEY = 'zg-walk-help-dismissed'; // retired: only removed, never read or written
const AUTO_MS = 6000; // auto-fade delay
const GRACE_MS = 400; // ignore input this soon after opening (the tap that entered Explore / fly-in tail)
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);

function init() {
  // Phone card ONLY when the primary pointer is coarse. 'ontouchstart' alone (touch-capable desktops, forced in tests) is NOT phone.
  const mq = window.matchMedia ? matchMedia('(pointer: coarse)') : null;
  const isTouch = () => (mq ? mq.matches : 'ontouchstart' in window);
  try { localStorage.removeItem(OLD_KEY); } catch (_) { /* storage blocked: fine */ }

  const card = document.createElement('div');
  card.id = 'zg-walk-help';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Walking controls');
  const title = document.createElement('div');
  title.className = 'zg-wh-title';
  title.textContent = 'Walking controls';
  const list = document.createElement('ul');
  function fillRows() {
    list.textContent = '';
    const rows = isTouch()
      ? [['Left stick', 'walk'], ['Drag', 'look around'], ['◆', 'jump']]
      : [['W A S D', 'walk (Shift faster)'], ['Click + move mouse', 'look'], ['Space', 'jump'], ['Esc', 'free mouse']];
    card.dataset.kind = isTouch() ? 'touch' : 'desk'; // CSS: desktop card sits bottom-center, phone card keeps its top offset
    for (const [k, v] of rows) {
      const li = document.createElement('li');
      const kk = document.createElement('b');
      kk.textContent = k;
      li.append(kk, document.createTextNode(' ' + v));
      list.appendChild(li);
    }
  }
  fillRows();
  if (mq) {
    try { mq.addEventListener('change', fillRows); } catch (_) { try { mq.addListener(fillRows); } catch (__) { /* ignore */ } }
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
  let entered = ''; // mode we already auto-opened for; reset when Explore is left, so each entry shows the card once
  let flyTimer = 0;
  let autoTimer = 0;
  let openedAt = 0;
  function render() {
    const m = document.body.dataset.mode;
    const walkish = m === 'walk' || m === 'amp';
    card.classList.toggle('show', walkish && open);
    btn.classList.toggle('show', walkish && !open);
  }
  function setOpen(v, auto) {
    open = v;
    clearTimeout(autoTimer);
    autoTimer = 0;
    card.classList.toggle('zg-wh-slow', !!(auto && !v)); // gentle fade for the automatic hide only
    if (v) { openedAt = performance.now(); autoTimer = setTimeout(() => setOpen(false, true), AUTO_MS); }
    render();
  }
  // first walk / look / jump input hides the card (capture phase: the walker's own handlers may stop propagation)
  function firstMove(e) {
    try {
      if (!open || performance.now() - openedAt < GRACE_MS) return;
      const t = e.target;
      if (t && t.closest && t.closest('#zg-walk-help, #zg-walk-help-btn')) return;
      if (e.type === 'keydown' && !MOVE_KEYS.has(e.key)) return;
      setOpen(false, true);
    } catch (_) { /* ignore */ }
  }
  for (const t of ['keydown', 'touchstart', 'pointerdown', 'mousedown']) document.addEventListener(t, firstMove, true);
  function onMode() {
    try {
      const m = document.body.dataset.mode;
      if (m === 'walk' || m === 'amp') {
        const h = window.__amp && window.__amp.handle;
        // amp: only when the amp is walkable (driver present); the orbit-only amp has nothing to explain
        if (m === 'amp' && !(h && h.driver) && !(window.__ampHandle && window.__ampHandle.driver)) { setOpen(false); return; }
        if (entered !== m) {
          // wait for the intro fly-in to finish so the first WASD press isn't swallowed
          const fl = window.__dbg && typeof window.__dbg.fly === 'function' ? window.__dbg.fly() : null;
          if (fl && fl.active) {
            if (!flyTimer) flyTimer = setTimeout(() => { flyTimer = 0; onMode(); }, 250);
            return;
          }
          entered = m;
          setOpen(true);
          return;
        }
      } else {
        entered = '';
        if (open) { setOpen(false); return; }
      }
      render();
    } catch (e) {
      console.warn('[walk-help] mode update failed', e);
    }
  }
  close.addEventListener('click', () => setOpen(false));
  btn.addEventListener('click', () => setOpen(true));
  // Pointer lock: the first Esc only frees the mouse (browser default). Chrome may drop the lock BEFORE our keydown runs,
  // so also treat Esc within 300 ms of a lock change as that same press (same idea as amp-walk.js). Mouse already free: Esc closes.
  let lockChangedAt = -1e9;
  document.addEventListener('pointerlockchange', () => { lockChangedAt = performance.now(); });
  document.addEventListener('keydown', (e) => {
    try {
      if (e.key !== 'Escape' || !open) return;
      if (document.pointerLockElement || performance.now() - lockChangedAt < 300) return;
      setOpen(false);
    } catch (err) {
      console.warn('[walk-help] Escape handler failed', err);
    }
  }, true);
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
