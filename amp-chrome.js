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

const HINT_WALK = 'Walk on the amp · stick/WASD to move · drag to look';
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

  // amp7 (site1, Blake t164u): no home "Explore the Amp" button; the amp is entered from the neck-end pop-up only
  const explore = document.getElementById('zg-explore-amp');
  const home = makeButton('zg-home-amp', 'Home', 'Back to home');
  // home-v2: the per-object amp how-to popup is RETIRED (makeHint / #zg-amp-hint are never created or shown).
  // walk-help.js shows the one universal controls popup for every walk / explore mode.

  if (explore) explore.addEventListener('click', () => {
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
