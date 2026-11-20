// Amp chrome: "Explore the Amp" + Home + walk hint. Visibility is CSS (body[data-mode]).
// The walk joystick (#amp-joy) is created by amp-walk.js; its look lives in amp-chrome.css.
function makeButton(id, text, ariaLabel) {
  let b = document.getElementById(id);
  if (!b) {
    b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.textContent = text;
    if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
    document.body.appendChild(b);
  }
  return b;
}

function getHandle() {
  return (window.__amp && window.__amp.handle) || window.__ampHandle || null;
}

// amp9 (Blake t188u): the amp walk now captures the mouse on click like the guitar walk; same wording style as the
// guitar's tip (site1-amp9/index.html HINT_WALK): click to look on desktop, drag to look on touch.
const HINT_WALK_TOUCH = (() => { try { return !!((window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window); } catch (_) { return false; } })();
const HINT_WALK = HINT_WALK_TOUCH
  ? 'Walk on the amp · left stick to walk · drag to look'
  : 'Walk on the amp · WASD to walk · click to look (Esc frees the mouse)';
const HINT_ORBIT = 'Drag to orbit · pinch or scroll to zoom';

function makeHint() {
  let h = document.getElementById('zg-amp-hint');
  if (!h) {
    h = document.createElement('div');
    h.id = 'zg-amp-hint';
    h.setAttribute('role', 'status');
    h.setAttribute('aria-live', 'polite');
    document.body.appendChild(h);
  }
  return h;
}

function init() {
  try {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse || 'ontouchstart' in window) document.body.classList.add('touch');
  } catch (_) {}

  const explore = makeButton('zg-explore-amp', 'Explore the Amp');
  const home = makeButton('zg-home-amp', 'Home', 'Back to home');
  const hint = makeHint();
  let hintTimer = 0;

  function showHint() {
    const h = getHandle();
    hint.textContent = h && h.driver ? HINT_WALK : HINT_ORBIT;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 6000);
  }
  function hideHint() {
    clearTimeout(hintTimer);
    hint.classList.remove('show');
  }

  document.addEventListener('zg:mode', (e) => {
    if (e.detail === 'amp') showHint();
    else hideHint();
  });

  explore.addEventListener('click', () => {
    const h = getHandle();
    if (!h) return;
    // No args: fly in from wherever the camera is now.
    if (typeof h.explore === 'function') h.explore();
  });
  home.addEventListener('click', () => {
    const h = getHandle();
    if (h && typeof h.exit === 'function') h.exit();
    else if (document.body.dataset.mode === 'amp') document.body.dataset.mode = 'show';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
