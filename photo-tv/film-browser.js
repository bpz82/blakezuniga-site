// photo-tv/film-browser.js — full-screen "projected film" photo browser opened from the TV.
// Contract: export function openFilmBrowser({ photos, startIndex, base, originRect, onClose }) -> { close() }
// Self-contained: injects its own CSS, no imports, everything guarded so a failure never touches the page.

const CSS_ID = 'ptv-browser-css';
const EASE = 'cubic-bezier(0.22,0.61,0.36,1)';
let grainUrl = null;

function css() {
  return `
#ptv-browser{position:fixed;inset:0;z-index:100000;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;
  font-family:'Zuniga Mission',system-ui,sans-serif;color:#f3ece4;outline:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
#ptv-browser .ptv-bg{position:absolute;inset:0;background:#050403;opacity:0;transition:opacity .65s ${EASE}}
#ptv-browser.ptv-in .ptv-bg{opacity:.97}
#ptv-browser .ptv-stage{position:absolute;inset:0;transform-origin:0 0;will-change:transform,opacity;opacity:0}
#ptv-browser .ptv-glow{position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(ellipse at 50% 50%,rgba(190,225,255,.55),rgba(120,170,220,.22) 55%,rgba(0,0,0,0) 80%);transition:opacity .5s ${EASE}}
#ptv-browser.ptv-glowing .ptv-glow{opacity:1}
#ptv-browser .ptv-slot{position:absolute;left:var(--ptv-px);right:var(--ptv-px);top:var(--ptv-pt);bottom:var(--ptv-pb);
  display:grid;will-change:transform}
#ptv-browser .ptv-slip{display:grid;grid-area:1/1;width:100%;height:100%;will-change:transform,opacity}
#ptv-browser .ptv-slip>img{grid-area:1/1;width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;-webkit-user-drag:none}
#ptv-browser .ptv-thumb{filter:blur(7px);transform:scale(1.03);opacity:.85}
#ptv-browser .ptv-photo{opacity:0;transition:opacity .25s ease}
#ptv-browser .ptv-photo.ptv-loaded{opacity:1}
#ptv-browser.ptv-ready .ptv-thumb.ptv-gone{display:none}
#ptv-browser .ptv-err{position:absolute;left:0;right:0;top:50%;text-align:center;font-size:15px;letter-spacing:.04em;color:#ffb3a8;display:none;pointer-events:none}
#ptv-browser .ptv-err.ptv-on{display:block}
/* ---- film overlay ---- */
#ptv-browser .ptv-film{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#ptv-browser .ptv-film>*{position:absolute;pointer-events:none}
#ptv-browser .ptv-grain{inset:-96px;background-repeat:repeat;opacity:.16;animation:ptv-grain .5s steps(6) infinite;will-change:transform}
@keyframes ptv-grain{0%{transform:translate(0,0)}17%{transform:translate(-37px,23px)}33%{transform:translate(51px,-61px)}50%{transform:translate(-80px,-14px)}67%{transform:translate(29px,72px)}83%{transform:translate(-55px,40px)}100%{transform:translate(0,0)}}
#ptv-browser .ptv-leak{inset:-20%;mix-blend-mode:screen;opacity:.5;will-change:transform,opacity}
#ptv-browser .ptv-leak1{background:radial-gradient(circle at 12% 18%,rgba(255,120,40,.55),rgba(255,70,30,.18) 28%,rgba(0,0,0,0) 52%);animation:ptv-leak1 11s ease-in-out infinite alternate}
#ptv-browser .ptv-leak2{background:radial-gradient(circle at 90% 84%,rgba(255,150,60,.5),rgba(220,60,40,.16) 26%,rgba(0,0,0,0) 50%);animation:ptv-leak2 15s ease-in-out infinite alternate}
@keyframes ptv-leak1{0%{transform:translate(-4%,2%) scale(1);opacity:.25}45%{opacity:.6}100%{transform:translate(9%,6%) scale(1.25);opacity:.35}}
@keyframes ptv-leak2{0%{transform:translate(5%,-3%) scale(1.15);opacity:.4}55%{opacity:.18}100%{transform:translate(-8%,-7%) scale(1);opacity:.55}}
#ptv-browser .ptv-vig{inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 58%,rgba(0,0,0,.5) 100%)}
#ptv-browser .ptv-flick{inset:0;background:#000;opacity:0;animation:ptv-flick 2.3s steps(1) infinite}
@keyframes ptv-flick{0%{opacity:0}6%{opacity:.07}9%{opacity:.01}31%{opacity:.04}34%{opacity:0}58%{opacity:.08}61%{opacity:.02}83%{opacity:.05}86%{opacity:0}100%{opacity:0}}
#ptv-browser .ptv-dust{width:3px;height:3px;border-radius:50%;background:rgba(255,248,235,.8);opacity:0;animation:ptv-dust 7s steps(1) infinite}
@keyframes ptv-dust{0%{opacity:0}2%{opacity:.8}3.5%{opacity:0}46%{opacity:0}47%{opacity:.6;transform:translate(3px,6px)}48.5%{opacity:0}100%{opacity:0}}
#ptv-browser .ptv-scratch{top:0;bottom:0;width:1px;background:linear-gradient(to bottom,rgba(255,250,240,0),rgba(255,250,240,.55) 20%,rgba(255,250,240,.35) 70%,rgba(255,250,240,0));opacity:0;animation:ptv-scratch 9s steps(1) infinite}
@keyframes ptv-scratch{0%{opacity:0}4%{opacity:.7;transform:translateX(0)}5%{opacity:.5;transform:translateX(2px)}6%{opacity:0}62%{opacity:0}63%{opacity:.6;transform:translateX(-3px)}64.5%{opacity:0}100%{opacity:0}}
#ptv-browser .ptv-border{inset:0;box-shadow:inset 0 0 0 var(--ptv-b) #0b0907}
#ptv-browser .ptv-sprock{top:0;bottom:0;width:var(--ptv-b);
  background:repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,0) 9px,rgba(236,226,206,.82) 9px,rgba(236,226,206,.82) 21px,rgba(0,0,0,0) 21px,rgba(0,0,0,0) 30px);
  background-size:calc(var(--ptv-b)*.42) 30px;background-repeat:repeat-y;background-position:center 0;animation:ptv-sprock 3.4s linear infinite;will-change:background-position}
#ptv-browser .ptv-sprock.l{left:0}#ptv-browser .ptv-sprock.r{right:0}
@keyframes ptv-sprock{from{background-position:center 0}to{background-position:center 30px}}
#ptv-browser .ptv-edge{left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 28px);text-align:center;font-size:10px;letter-spacing:.3em;color:rgba(255,160,90,.7);opacity:.75}
#ptv-browser .ptv-flash{inset:0;background:#fff3df;opacity:0;pointer-events:none}
#ptv-browser .ptv-weave{position:absolute;inset:0;animation:ptv-weave 2.9s steps(1) infinite;will-change:transform}
@keyframes ptv-weave{0%{transform:translate(0,0)}9%{transform:translate(.6px,-.9px)}21%{transform:translate(-.5px,.4px)}34%{transform:translate(.9px,.7px)}47%{transform:translate(-.8px,-.5px)}53%{transform:translate(.2px,1.1px)}68%{transform:translate(-1.2px,.2px)}79%{transform:translate(.5px,-1.3px)}91%{transform:translate(-.3px,.6px)}100%{transform:translate(0,0)}}
/* ---- chrome ---- */
#ptv-browser button{position:absolute;z-index:5;width:44px;height:44px;border:1px solid rgba(255,255,255,.18);border-radius:50%;padding:0;
  background:rgba(14,12,11,.7);color:#f3ece4;cursor:pointer;display:flex;align-items:center;justify-content:center;font:inherit;
  opacity:0;transition:opacity .5s ${EASE} .25s,background .2s,border-color .2s,transform .2s}
#ptv-browser.ptv-open button,#ptv-browser.ptv-in button{opacity:1}
#ptv-browser button:hover,#ptv-browser button:focus-visible{background:rgba(255,107,90,.22);border-color:#ff6b5a;outline:none}
#ptv-browser button:active{transform:scale(.94)}
#ptv-browser button svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#ptv-browser .ptv-close{top:calc(env(safe-area-inset-top,0px) + 12px);right:calc(env(safe-area-inset-right,0px) + 12px)}
#ptv-browser .ptv-prev,#ptv-browser .ptv-next{top:50%;margin-top:-22px}
#ptv-browser .ptv-prev{left:calc(env(safe-area-inset-left,0px) + 8px)}
#ptv-browser .ptv-next{right:calc(env(safe-area-inset-right,0px) + 8px)}
#ptv-browser .ptv-count{position:absolute;z-index:5;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 22px);text-align:center;font-size:17px;letter-spacing:.08em;
  pointer-events:none;opacity:0;transition:opacity .5s ${EASE} .25s;text-shadow:0 1px 6px #000}
#ptv-browser .ptv-cap{position:absolute;z-index:5;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);text-align:center;font-size:13px;letter-spacing:.03em;
  color:rgba(243,236,228,.75);pointer-events:none;opacity:0;transition:opacity .5s ${EASE} .25s;text-shadow:0 1px 6px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ptv-browser.ptv-open .ptv-count,#ptv-browser.ptv-in .ptv-count,#ptv-browser.ptv-open .ptv-cap,#ptv-browser.ptv-in .ptv-cap{opacity:1}
#ptv-browser{--ptv-b:18px;--ptv-px:calc(var(--ptv-b) + 6px + env(safe-area-inset-left,0px));
  --ptv-pt:calc(env(safe-area-inset-top,0px) + 66px);--ptv-pb:calc(env(safe-area-inset-bottom,0px) + 44px)}
@media (min-width:700px){#ptv-browser{--ptv-b:28px;--ptv-px:96px;--ptv-pt:72px;--ptv-pb:56px}}
@media (prefers-reduced-motion:reduce){
  #ptv-browser .ptv-bg{transition:opacity .15s linear}
  #ptv-browser .ptv-grain,#ptv-browser .ptv-leak,#ptv-browser .ptv-weave,#ptv-browser .ptv-flick,#ptv-browser .ptv-sprock,#ptv-browser .ptv-dust,#ptv-browser .ptv-scratch{animation:none}
}`;
}

function makeGrain() {
  if (grainUrl) return grainUrl;
  try {
    const n = 96, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const d = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = Math.random() * 255 | 0;
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
      d.data[i * 4 + 3] = 70 + (Math.random() * 150 | 0);
    }
    g.putImageData(d, 0, 0);
    grainUrl = c.toDataURL('image/png');
  } catch (e) { grainUrl = ''; }
  return grainUrl;
}

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

const ICON = {
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

export function openFilmBrowser(opts) {
  const noop = { close() {} };
  try {
    return open(opts || {});
  } catch (e) {
    console.warn('[photo-tv] film browser failed', e);
    try { document.getElementById('ptv-browser')?.remove(); document.body.style.overflow = ''; } catch (_) {}
    try { opts && opts.onClose && opts.onClose(); } catch (_) {}
    return noop;
  }
}

function setBrowserOpen(v) {
  try { if (window.__photoTV) window.__photoTV.browserOpen = v; } catch (_) {}
}

function open({ photos, startIndex = 0, base, originRect, onClose }) {
  if (!Array.isArray(photos) || !photos.length) throw new Error('no photos');
  const existing = document.getElementById('ptv-browser');
  if (existing) existing.remove();

  if (!document.getElementById(CSS_ID)) {
    const st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = css();
    document.head.appendChild(st);
  }
  const siteRoot = new URL('../', base || document.baseURI);
  const N = photos.length;
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const prevFocus = document.activeElement;
  const prevOverflow = document.body.style.overflow;
  const prevHtmlOverflow = document.documentElement.style.overflow;

  let idx = ((startIndex % N) + N) % N;
  let closed = false, token = 0;

  // ---- DOM ----
  const root = el('div');
  root.id = 'ptv-browser';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Photos');
  root.tabIndex = -1;
  el('div', 'ptv-bg', root);
  const stage = el('div', 'ptv-stage', root);
  const weave = el('div', 'ptv-weave', stage);
  const slot = el('div', 'ptv-slot', weave);
  const slip = el('div', 'ptv-slip', slot);
  const thumb = el('img', 'ptv-thumb', slip);
  const img = el('img', 'ptv-photo', slip);
  thumb.alt = ''; thumb.decoding = 'async';
  img.decoding = 'async';
  const err = el('div', 'ptv-err', slot);
  err.textContent = "This photo couldn't load";

  const film = el('div', 'ptv-film', stage);
  const grain = el('div', 'ptv-grain', film);
  const g = makeGrain();
  if (g) { grain.style.backgroundImage = `url(${g})`; grain.style.backgroundSize = '96px 96px'; }
  el('div', 'ptv-leak ptv-leak1', film);
  el('div', 'ptv-leak ptv-leak2', film);
  el('div', 'ptv-vig', film);
  el('div', 'ptv-flick', film);
  el('div', 'ptv-border', film);
  el('div', 'ptv-sprock l', film);
  el('div', 'ptv-sprock r', film);
  const edge = el('div', 'ptv-edge', film);
  for (let i = 0; i < 7; i++) {
    const d = el('div', 'ptv-dust', film);
    d.style.left = (8 + Math.random() * 84).toFixed(1) + '%';
    d.style.top = (8 + Math.random() * 80).toFixed(1) + '%';
    d.style.animationDelay = (-Math.random() * 7).toFixed(2) + 's';
    d.style.animationDuration = (5 + Math.random() * 6).toFixed(1) + 's';
    const s = 2 + Math.random() * 3;
    d.style.width = d.style.height = s.toFixed(1) + 'px';
  }
  for (let i = 0; i < 2; i++) {
    const s = el('div', 'ptv-scratch', film);
    s.style.left = (15 + Math.random() * 70).toFixed(1) + '%';
    s.style.animationDelay = (-Math.random() * 9).toFixed(2) + 's';
    s.style.animationDuration = (8 + i * 4).toFixed(0) + 's';
  }
  const flash = el('div', 'ptv-flash', film);
  el('div', 'ptv-glow', stage);

  const count = el('div', 'ptv-count', root);
  const cap = el('div', 'ptv-cap', root);
  const bPrev = el('button', 'ptv-prev', root);
  const bNext = el('button', 'ptv-next', root);
  const bClose = el('button', 'ptv-close', root);
  [[bPrev, 'prev', 'Previous photo'], [bNext, 'next', 'Next photo'], [bClose, 'close', 'Close']].forEach(([b, k, l]) => {
    b.type = 'button'; b.setAttribute('aria-label', l); b.innerHTML = ICON[k];
  });

  // ---- photo loading ----
  const fullUrl = (p) => { try { return new URL(p.full || p.src || '', siteRoot).href; } catch (_) { return ''; } };
  const tvUrl = (p) => { try { return p.tv ? new URL(p.tv, siteRoot).href : ''; } catch (_) { return ''; } };
  const cache = new Map(); // idx -> {state:'loading'|'ok'|'bad'}
  function preload(i) {
    i = ((i % N) + N) % N;
    const c = cache.get(i);
    if (c) return c;
    const rec = { state: 'loading', cbs: [] };
    cache.set(i, rec);
    try {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { rec.state = 'ok'; rec.cbs.splice(0).forEach(f => f()); };
      im.onerror = () => { rec.state = 'bad'; rec.cbs.splice(0).forEach(f => f()); };
      im.src = fullUrl(photos[i]);
      rec.im = im;
    } catch (_) { rec.state = 'bad'; }
    // keep the cache small: forget entries far from here
    if (cache.size > 6) {
      for (const k of [...cache.keys()]) {
        const dist = Math.min((k - idx + N) % N, (idx - k + N) % N);
        if (dist > 2) cache.delete(k);
      }
    }
    return rec;
  }

  function show(i, dir) {
    idx = ((i % N) + N) % N;
    const p = photos[idx] || {};
    const my = ++token;
    root.dataset.index = String(idx);
    root.dataset.id = p.id != null ? String(p.id) : '';
    count.textContent = `${idx + 1} / ${N}`;
    const capText = p.caption || p.alt || '';
    cap.textContent = capText && capText !== p.id && !/^[\w.-]+$/.test(capText) ? capText : '';
    edge.textContent = `▷ ${String(idx + 1).padStart(3, '0')}   ▷ ${String(idx + 1).padStart(3, '0')}A`;
    err.classList.remove('ptv-on');
    // placeholder
    img.classList.remove('ptv-loaded');
    thumb.classList.remove('ptv-gone');
    const t = tvUrl(p);
    if (t) thumb.src = t; else thumb.removeAttribute('src');
    img.alt = p.alt || '';
    img.removeAttribute('src');
    if (dir) advanceFx(dir);
    const rec = preload(idx);
    const apply = () => {
      if (my !== token || closed) return;
      if (rec.state === 'ok') {
        img.src = rec.im.src;
        const done = () => { if (my !== token) return; img.classList.add('ptv-loaded'); setTimeout(() => { if (my === token) thumb.classList.add('ptv-gone'); }, 280); };
        if (img.decode) img.decode().then(done, done); else done();
      } else {
        thumb.classList.add('ptv-gone');
        err.classList.add('ptv-on');
      }
    };
    if (rec.state === 'loading') rec.cbs.push(apply); else apply();
    // neighbours only
    setTimeout(() => { if (my === token && !closed) { preload(idx + 1); preload(idx - 1); } }, 60);
  }

  function advanceFx(dir) {
    if (reduce || !slip.animate) return;
    try {
      slip.animate([
        { transform: `translateY(${dir > 0 ? 22 : -22}px)`, opacity: 0.35 },
        { transform: 'translateY(0)', opacity: 1 }
      ], { duration: 160, easing: 'cubic-bezier(0.2,0.8,0.3,1)' });
      flash.animate([{ opacity: 0.42 }, { opacity: 0 }], { duration: 170, easing: 'ease-out' });
    } catch (_) {}
  }

  function go(d) { if (!closed) show(idx + d, d); }

  // ---- open / close transitions ----
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  function originTransform() {
    const r = originRect;
    if (!r || !(r.w > 0) || !(r.h > 0)) return null;
    const s = Math.min(r.w / vw(), r.h / vh());
    return `translate(${r.x + (r.w - vw() * s) / 2}px,${r.y + (r.h - vh() * s) / 2}px) scale(${s})`;
  }

  let openTimer = 0, closeTimer = 0;
  const tOpen = performance.now();   // the pointer/click sequence that opened us must not act on our own root
  const settling = () => performance.now() - tOpen < 350;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  setBrowserOpen(true);
  show(idx, 0);

  const ot = (!reduce && stage.animate) ? originTransform() : null;
  // force layout so the bg transition starts from 0
  void root.offsetWidth;
  root.classList.add('ptv-in');
  if (reduce || !stage.animate) {
    stage.style.opacity = '1';
    if (stage.animate) stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    openTimer = setTimeout(() => { if (!closed) root.classList.add('ptv-open'); }, 150 + 150);
  } else {
    const from = ot ? { transform: ot, opacity: 0.2 } : { transform: 'scale(1.06)', opacity: 0 };
    const to = { transform: 'none', opacity: 1 };
    root.classList.add('ptv-glowing');
    stage.style.opacity = '1';
    const a = stage.animate([from, { ...to, offset: 1 }], { duration: 650, easing: EASE });
    setTimeout(() => root.classList.remove('ptv-glowing'), 120);
    const fin = () => { clearTimeout(openTimer); if (!closed) root.classList.add('ptv-open'); };
    try { a.onfinish = fin; a.finished && a.finished.then(fin, () => {}); } catch (_) {}
    openTimer = setTimeout(fin, 650 + 60);
    stage.style.opacity = '1';
  }
  root.classList.add('ptv-ready');
  try { bClose.focus({ preventScroll: true }); } catch (_) {}

  function close() {
    if (closed) return;
    closed = true;
    token++;
    clearTimeout(openTimer);
    root.classList.remove('ptv-open', 'ptv-in');
    const ct = (!reduce && stage.animate) ? originTransform() : null;
    let ms = 150;
    try {
      if (reduce || !stage.animate) {
        if (stage.animate) closeAnim = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
        if (!stage.animate) stage.style.opacity = '0';
      } else {
        ms = 600;
        const to = ct ? { transform: ct, opacity: 0 } : { transform: 'scale(1.04)', opacity: 0 };
        closeAnim = stage.animate([{ transform: 'none', opacity: 1 }, to], { duration: ms, easing: EASE, fill: 'forwards' });
      }
    } catch (_) { ms = 0; }
    closeTimer = setTimeout(finish, ms + 150);
    try { if (closeAnim) { closeAnim.onfinish = finish; } } catch (_) {}
  }
  let closeAnim = null, finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(closeTimer);
    try { root.remove(); } catch (_) {}
    document.body.style.overflow = prevOverflow;
    document.documentElement.style.overflow = prevHtmlOverflow;
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keydown', onKey, true);
    setBrowserOpen(false);
    try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (_) {}
    try { onClose && onClose(); } catch (e) { console.warn('[photo-tv] onClose threw', e); }
  }

  // ---- input ----
  // B5b: window + capture (runs before the page's own document-level handlers), 'Escape'/'Esc'/code/keyCode, and the
  // page's Esc handling (walk-help, panels) is kept from running while this dialog is open.
  function onKey(e) {
    if (closed) return;
    try {
      const k = e.key, isEsc = k === 'Escape' || k === 'Esc' || e.code === 'Escape' || e.keyCode === 27;
      const swallow = () => { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); };
      if (isEsc) { swallow(); close(); }
      else if (k === 'ArrowLeft') { swallow(); go(-1); }
      else if (k === 'ArrowRight') { swallow(); go(1); }
      else if (k === 'Tab') {
        const f = [bClose, bPrev, bNext];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        const n = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
        f[n].focus({ preventScroll: true });
      }
    } catch (_) {}
  }
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('keydown', onKey, true);

  // Buttons act on pointerup (touch/pen/mouse) and on click (keyboard / assistive tech); deduped.
  [[bClose, () => close()], [bPrev, () => go(-1)], [bNext, () => go(1)]].forEach(([b, fn]) => {
    let last = 0;
    const act = (e) => {
      e.stopPropagation();
      if (settling() && e.isTrusted && e.detail !== 0) return;   // pointer click of the opening gesture (keyboard clicks have detail 0)
      const t = Date.now();
      if (t - last < 500) return;
      last = t;
      try { fn(); } catch (err) { console.warn('[photo-tv] button failed', err); }
    };
    b.style.touchAction = 'manipulation';
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') act(e); else e.stopPropagation(); });
    b.addEventListener('click', act);
  });

  let sx = 0, sy = 0, dx = 0, tracking = false, pid = -1, moved = false, ptype = '';
  root.addEventListener('pointerdown', (e) => {
    if (closed || settling() || (e.target.closest && e.target.closest('button'))) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tracking = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; moved = false; ptype = e.pointerType;
    try { root.setPointerCapture(pid); } catch (_) {}
  });
  root.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== pid) return;
    dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    if (Math.abs(dx) > Math.abs(dy)) slot.style.transform = `translateX(${(dx * 0.3).toFixed(1)}px)`;
  });
  const endPtr = (e, cancel) => {
    if (!tracking || e.pointerId !== pid) return;
    tracking = false;
    try { root.releasePointerCapture(pid); } catch (_) {}
    const wasSwipe = Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(e.clientY - sy);
    if (slot.style.transform) {
      try { slot.animate && slot.animate([{ transform: slot.style.transform }, { transform: 'none' }], { duration: 180, easing: EASE }); } catch (_) {}
      slot.style.transform = '';
    }
    if (cancel) return;
    if (wasSwipe) go(dx < 0 ? 1 : -1);
    else if (!moved && ptype !== 'mouse') {
      const x = e.clientX / vw();
      if (x < 1 / 3) go(-1); else if (x > 2 / 3) go(1);
    }
  };
  root.addEventListener('pointerup', (e) => endPtr(e, false));
  root.addEventListener('pointercancel', (e) => endPtr(e, true));
  root.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

  return { close };
}
