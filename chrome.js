// Site chrome: creates the two buttons and wires clicks. Visibility is pure CSS
// (body[data-mode]), so there is no state here to get out of sync.

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

function init() {
  const explore = makeButton('zg-explore', 'Explore the Guitar');
  const home = makeButton('zg-home', 'Home', 'Back to home');

  let warned = false;
  const modeBtn = () => {
    const m = document.getElementById('mode');
    if (!m && !warned) {
      warned = true;
      console.warn('[chrome] #mode button not found; Explore/Home buttons disabled');
    }
    return m;
  };

  if (!modeBtn()) {
    explore.hidden = true;
    home.hidden = true;
    return;
  }

  // WEBSITE (integration): with no load screen the button is on screen before the scene has wired #mode; a press that
  // early waits for the guitar (body.zg-ready) and then enters walk, instead of being lost.
  let queued = false;
  explore.addEventListener('click', () => {
    if (document.body.dataset.mode === 'walk') return;
    const go = () => { const m = modeBtn(); if (m && document.body.dataset.mode !== 'walk') m.click(); };
    if (document.body.classList.contains('zg-ready')) { go(); return; }
    if (queued) return; queued = true;
    const ob = new MutationObserver(() => { if (document.body.classList.contains('zg-ready')) { ob.disconnect(); queued = false; go(); } });
    ob.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });

  home.addEventListener('click', () => {
    if (document.body.dataset.mode === 'walk') {
      const m = modeBtn();
      if (m) m.click();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
