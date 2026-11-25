/**
 * Apps harness (home-v2: what were called widgets are now "apps"; ids in widget-ids.js are app ids, permanent):
 * app tiles laid out in ONE straight row over the 3D scene. Each app is an individual module and its own failure domain.
 * amp11 (Blake t206u) 11a: the ring / ellipse carousel (orbit, depth scaling, intro loops, 6 s step, swipe
 * inertia) is gone. The tiles sit in a clean horizontal row, centered at the bottom of the home view just above Explore; the only motion
 * is a gentle linear slide-in (CSS, on the row) and, when more tiles exist than fit across, a linear drag-scroll
 * along the row. Each tile has a CSS-only periodic glimmer (harness.css .zg-tile::after, animation zg-glimmer).
 *
 * MODULE CONTRACT
 * ---------------
 * register({ id, title, icon, iconSrc, mount(el, api), unmount() }) -> boolean
 *
 *   id       string, /^[a-z][a-z0-9-]{1,31}$/, must be listed in widget-ids.js ACTIVE
 *            (retired ids and duplicates are rejected). Ids are permanent.
 *   title    string, 1..32 chars, shown as the tile label and the panel title.
 *   icon     optional string of 1..3 characters (glyph/emoji), shown as text.
 *   iconSrc  optional same-origin relative path to an image (e.g. assets/logo.png).
 *            Only a relative path with a png/webp/jpg/jpeg/gif/svg extension is
 *            accepted (no scheme, no //, no .., no backslash). If the image fails
 *            to load, the tile falls back to the text icon.
 *   mount    required function(el, api). `el` is the widget's own container element
 *            (inside a shadow root). `api` is { close() } and nothing else.
 *            May return a Promise; a throw or a rejection shows only this widget's
 *            error message and never affects the scene, the row or other widgets.
 *   unmount  optional function(), called when the panel closes.
 *
 * register() returns true if the widget was accepted. Otherwise it logs a
 * console.warn, adds nothing and returns false.
 * Nothing is placed on window; register is exported for future modules.
 *
 * MODE
 * ----
 * The row is the HOME layer. It follows the scene's mode (body.dataset.mode and the
 * document-level 'zg:mode' event, detail 'show' | 'walk' | 'amp'): hidden while
 * walking or on the amp, visible in 'show'. If the scene does not announce a mode,
 * the row is always shown. amp11: mode changes are read once per task (microtask), so the
 * transient 'show' that Explore Amp announces for an instant (walk -> show -> amp, same task)
 * never un-hides the row.
 *
 * data-state: idle (at rest) | intro (slide-in) | dragging | paused (panel open or tab hidden) |
 * reduced | hidden (walk / amp mode).
 * The .zg-ring container class (the row's container, name kept) carries zg-on (shown), zg-away (walking), zg-ret.
 */
import { ACTIVE, RETIRED } from './widget-ids.js';
import { widgets, brokenWidget } from './widgets.js';

const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const MAX_TITLE = 32;
const LOAD_POLL_MS = 250;
const LOAD_MAX_MS = 60000;
const TAP_PX = 10; // movement below this is a tap, not a swipe
const INTRO_MS = 900; // slide-in window reported as data-state="intro"
const REVEAL_FALLBACK_MS = 8000;
const REVEAL_PENDING_MAX_MS = 180000; // intro-polish: cap on waiting for a live word (phase 'wait') before assuming it hung
const GAP = 16; // px between tiles in the row

const entries = new Map(); // id -> entry
const order = []; // entries that have a tile, in registration order
const hovered = new Set(); // tiles hovered by a mouse

let root = null;
let ring = null; // the row container (class kept: zg-ring)
let reduced = false;
let walking = false; // scene is in walk / amp mode: row hidden
let current = null; // open panel session
let seq = 0;
let drag = null; // active scroll drag: { id, x, scroll, moved }
let revealPhase = ''; // in | hold | down | done, from zg:reveal
let ringShown = false;
let introTimer = 0;
let introOn = false;
let modeQueued = false;

// cached geometry (updated on layout only)
let vw = 1280;
let vh = 800;
let size = 129;
let lastSc = 1;
let sizeH = 129; // tile height (phone: slimmer than the width)
let rowX = 24; // left edge of the first tile
let rowY = 647; // top of the row
let scroll = 0; // px the row is scrolled left (only when the tiles overflow)
let maxScroll = 0;


function reject(msg) {
  console.warn('[zg] register rejected: ' + msg);
  return null;
}

function snapshot(def) {
  if (!def || typeof def !== 'object') return reject('definition must be an object');
  const { id, title, icon, mount, unmount } = def;
  if (typeof id !== 'string' || !ID_RE.test(id)) return reject('bad id');
  if (RETIRED.includes(id)) return reject('id "' + id + '" is retired');
  if (!ACTIVE.includes(id)) return reject('id "' + id + '" is not in the permanent id list');
  if (entries.has(id)) return reject('duplicate id "' + id + '"');
  if (typeof title !== 'string' || !title.trim()) return reject('missing title for "' + id + '"');
  if (title.length > MAX_TITLE) return reject('title too long for "' + id + '"');
  if (icon !== undefined && icon !== null) {
    if (typeof icon !== 'string') return reject('icon must be a string for "' + id + '"');
    const n = Array.from(icon).length;
    if (n < 1 || n > 3) return reject('icon must be 1-3 characters for "' + id + '"');
  }
  let iconSrc = '';
  if (def.iconSrc !== undefined && def.iconSrc !== null && def.iconSrc !== '') {
    if (!validIconSrc(def.iconSrc)) {
      return reject('iconSrc must be a same-origin relative path for "' + id + '"');
    }
    iconSrc = def.iconSrc;
  }
  if (typeof mount !== 'function') return reject('mount must be a function for "' + id + '"');
  if (unmount !== undefined && unmount !== null && typeof unmount !== 'function') {
    return reject('unmount must be a function for "' + id + '"');
  }
  let href = '';
  if (def.href !== undefined && def.href !== null && def.href !== '') {
    if (!validHref(def.href)) return reject('href must be an https URL for "' + id + '"');
    href = def.href;
  }
  // amp12 (Blake t208u): optional panel:'wide' (large panel, used by Photos); anything else = the normal panel
  // intro-polish: optional href (https only) makes the tile a new-tab link and skips the in-page panel
  return { id, title, icon: icon || '', iconSrc, href, mount, unmount: unmount || null, wide: def.panel === 'wide' };
}

const ICON_SRC_RE = /^(\.\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(png|webp|jpe?g|gif|svg)$/i;
function validIconSrc(src) {
  return typeof src === 'string' && src.length <= 200 && !src.includes('..') && ICON_SRC_RE.test(src);
}
function validHref(h) {
  if (typeof h !== 'string' || h.length > 200) return false;
  try {
    const u = new URL(h);
    return u.protocol === 'https:' && u.username === '' && u.password === '';
  } catch (_) {
    return false;
  }
}

export function register(def) {
  let def2;
  try {
    def2 = snapshot(def);
  } catch (err) {
    console.warn('[zg] register rejected: unreadable definition', err);
    return false;
  }
  if (!def2) return false;
  const entry = { def: def2, el: null, built: false };
  entries.set(def2.id, entry);
  if (ring) {
    try {
      addTile(entry);
    } catch (err) {
      console.error('[zg] adding the tile for app "' + def2.id + '" failed', err);
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* tiles                                                               */
/* ------------------------------------------------------------------ */

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function buildTile(entry) {
  const { id, title, icon, iconSrc, href } = entry.def;
  const b = href ? document.createElement('a') : document.createElement('button');
  if (href) {
    b.href = href;
    b.target = '_blank';
    b.rel = 'noopener noreferrer';
  } else {
    b.type = 'button';
  }
  b.className = 'zg-tile';
  b.dataset.id = id;
  b.setAttribute('aria-label', title);
  const fallback = icon || Array.from(title)[0].toUpperCase();
  const ic = span('zg-icon', iconSrc ? '' : fallback);
  ic.setAttribute('aria-hidden', 'true');
  if (iconSrc) {
    const img = document.createElement('img');
    img.className = 'zg-icon-img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('error', () => {
      try { img.remove(); } catch (_) { /* ignore */ }
      if (!ic.textContent) ic.textContent = fallback;
    });
    img.src = iconSrc;
    ic.appendChild(img);
  }
  b.append(ic, span('zg-label', title));
  return b;
}

function buildErrorTile(entry) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'zg-tile zg-tile--error';
  b.dataset.id = entry.def.id;
  b.setAttribute('aria-label', 'App failed to load');
  const ic = span('zg-icon', '!');
  ic.setAttribute('aria-hidden', 'true');
  b.append(ic, span('zg-label', 'Error'));
  return b;
}

function addTile(entry) {
  if (entry.built) return;
  entry.built = true;
  try {
    entry.el = buildTile(entry);
  } catch (err) {
    console.error('[zg] building tile for "' + entry.def.id + '" failed', err);
    try {
      entry.el = buildErrorTile(entry);
      entry.tileBroken = true;
    } catch (err2) {
      console.error('[zg] building error tile failed', err2);
      return;
    }
  }
  const el = entry.el;
  bindRowPointer(el, () => {
    if (entry.def.href) {
      // Synchronous window.open inside the tap/click gesture so iOS Safari does not block the tab.
      try { window.open(entry.def.href, '_blank', 'noopener,noreferrer'); } catch (_) { /* ignore */ }
      return;
    }
    openPanel(entry, el);
  });   // amp11 (Blake t206u) 11a
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') {
      hovered.add(el);
      sync();
    }
  });
  el.addEventListener('pointerleave', () => {
    if (hovered.delete(el)) sync();
  });
  el.style.setProperty('--zg-i', String(order.length));   // amp11 (Blake t206u) 11a: stagger index for the glimmer delay
  ring.appendChild(el);
  order.push(entry);
  render();
}

function markTileError(entry) {
  const el = entry.el;
  if (!el) return;
  el.classList.add('zg-tile--error');
  if (!el.querySelector('.zg-badge')) {
    const badge = span('zg-badge', '!');
    badge.setAttribute('aria-hidden', 'true');
    el.appendChild(badge);
  }
}

/* ------------------------------------------------------------------ */
/* tap + linear scroll (pointer events; iOS does not deliver click here) */
/* ------------------------------------------------------------------ */

function onTap(el, fn, pressSet) {
  let start = null;
  let lastTap = -1e9;
  const stop = (e) => e.stopPropagation();

  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.button > 0) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    if (pressSet) {
      pressSet.add(e.pointerId);
      sync();
    }
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {
      /* capture is best-effort */
    }
  });

  el.addEventListener('pointermove', stop);

  const finish = (e, allow) => {
    e.stopPropagation();
    if (pressSet && pressSet.delete(e.pointerId)) sync();
    const s = start;
    if (!s || s.id !== e.pointerId) return;
    start = null;
    if (
      allow &&
      Math.hypot(e.clientX - s.x, e.clientY - s.y) < TAP_PX
      // WEBSITE (integration, Nov 15): no 600 ms limit. The movement check alone defines a tap.
    ) {
      lastTap = performance.now();
      fn();
    }
  };
  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));
  el.addEventListener('lostpointercapture', (e) => {
    if (pressSet && pressSet.delete(e.pointerId)) sync();
  });

  // Keyboard activation (Enter/Space) arrives as click with detail 0.
  // Pointer-originated clicks (detail > 0) are already handled by the tap path.
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.detail !== 0) return;
    if (performance.now() - lastTap < 800) return;
    fn();
  });
}

// amp11 (Blake t206u) 11a: a tile press is a tap unless it moves >= TAP_PX; a move scrolls the row linearly, and only
// when the tiles overflow the row (maxScroll > 0). No inertia, no snapping, no angle.
function bindRowPointer(el, fn) {
  let lastTap = -1e9;

  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.button > 0) return;
    if (current || walking) return;
    if (drag && drag.id !== e.pointerId) return;
    drag = { id: e.pointerId, x: e.clientX, scroll: scroll, moved: false, maxDist: 0, y: e.clientY };
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {
      /* capture is best-effort */
    }
    sync();
  });

  el.addEventListener('pointermove', (e) => {
    e.stopPropagation();
    const s = drag;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dist = Math.hypot(dx, e.clientY - s.y);
    if (dist > s.maxDist) s.maxDist = dist;
    if (!s.moved && dist >= TAP_PX && maxScroll > 0) s.moved = true;
    if (!s.moved) return;
    scroll = Math.max(0, Math.min(maxScroll, s.scroll - dx));
    render();
    if (ring && !ring.classList.contains('zg-dragging')) ring.classList.add('zg-dragging');
    sync();
  });

  const finish = (e, allow) => {
    e.stopPropagation();
    const s = drag;
    if (!s || s.id !== e.pointerId) return;
    drag = null;
    if (ring) ring.classList.remove('zg-dragging');
    const isTap = allow && !s.moved && s.maxDist < TAP_PX;
    sync();
    if (isTap && fn) {
      lastTap = performance.now();
      fn();
    }
  };
  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));

  // Keyboard activation (Enter/Space) arrives as click with detail 0.
  // Pointer-originated clicks (detail > 0) are already handled by the tap path.
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.tagName === 'A') {
      // Pointer tap already called window.open; prevent a second tab. Keyboard uses the real <a> default.
      if (performance.now() - lastTap < 800) e.preventDefault();
      return;
    }
    if (e.detail !== 0) return;
    if (performance.now() - lastTap < 800) return;
    fn();
  });

  // keyboard focus on a tile scrolled out of view: scroll the row so it is visible (and undo the browser's own scroll)
  el.addEventListener('focus', () => {
    if (ring) { ring.scrollLeft = 0; ring.scrollTop = 0; }
    const i = order.findIndex((q) => q.el === el);
    if (i < 0 || maxScroll <= 0) return;
    const tw = vw < 600 ? size * tileScale() : size;
    const x = i * (tw + GAP) - scroll;
    const room = vw - rowX * 2;
    if (x < 0) scroll = Math.max(0, i * (tw + GAP));
    else if (x + tw > room) scroll = Math.min(maxScroll, i * (tw + GAP) + tw - room);
    render();
  });
}

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

const SHADOW_CSS =
  ':host{display:block}' +
  '.zg-content{box-sizing:border-box;padding:18px 22px 26px;color:#f1e9e6;' +
  'font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  'h1,h2,h3{margin:0 0 .5em;font-weight:600;letter-spacing:.02em}' +
  'p{margin:0 0 1em;color:rgba(241,233,230,.78)}' +
  'a{color:#ff8a7a}';

function updateInert() {
  if (ring) ring.inert = !!current || walking;
}

function openPanel(entry, returnFocus) {
  if (current || !root || walking) return;
  const def = entry.def;
  const uid = ++seq;
  hovered.clear();

  const scrim = document.createElement('div');
  scrim.className = 'zg-scrim';
  onTap(scrim, () => closePanel(session));

  const panel = document.createElement('div');
  panel.className = def.wide ? 'zg-panel zg-panel--wide' : 'zg-panel';   // amp12 (Blake t208u)
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'zg-title-' + uid);
  panel.tabIndex = -1;
  // Keep the scene (and iOS touch-blocking handlers) away from the panel,
  // so content can scroll and keys do not move the guitar.
  for (const t of [
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'touchstart', 'touchmove', 'touchend', 'wheel', 'keydown', 'keyup',
  ]) {
    panel.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }

  const head = document.createElement('div');
  head.className = 'zg-head';
  const h = document.createElement('h2');
  h.className = 'zg-title';
  h.id = 'zg-title-' + uid;
  h.textContent = def.title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'zg-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  onTap(closeBtn, () => closePanel(session));
  head.append(h, closeBtn);

  const host = document.createElement('div');
  host.className = 'zg-body';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  const content = document.createElement('div');
  content.className = 'zg-content';
  shadow.append(style, content);

  panel.append(head, host);

  const session = {
    entry, scrim, panel, host, content, returnFocus,
    closed: false, failed: false, errEl: null, keyHandler: null, focusHandler: null,
  };
  current = session;

  session.keyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePanel(session);
    }
  };
  session.focusHandler = (e) => {
    if (!panel.contains(e.target)) panel.focus({ preventScroll: true });
  };
  document.addEventListener('keydown', session.keyHandler, true);
  document.addEventListener('focusin', session.focusHandler);

  root.append(scrim, panel);
  updateInert();
  panel.focus({ preventScroll: true });
  sync();

  if (entry.tileBroken) {
    failSession(session, new Error('tile could not be built'));
    return;
  }

  const api = Object.freeze({ close: () => closePanel(session) });
  try {
    const m = def.mount; // detach so `this` is not the harness entry
    const result = m(content, api);
    if (result && typeof result.then === 'function') {
      result.then(undefined, (err) => failSession(session, err));
    }
  } catch (err) {
    failSession(session, err);
  }
}

function failSession(session, err) {
  const id = session.entry.def.id;
  console.error('[zg] app "' + id + '" failed', err);
  session.failed = true;
  markTileError(session.entry);
  if (session.closed || session.errEl) return;
  try {
    const e = document.createElement('div');
    e.className = 'zg-error';
    e.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = 'This app failed to load.';
    const code = document.createElement('code');
    code.textContent = id;
    e.append(p, code);
    session.host.replaceWith(e);
    session.errEl = e;
  } catch (err2) {
    console.error('[zg] could not show error message', err2);
  }
}

function closePanel(session) {
  if (!session || session.closed) return;
  session.closed = true;
  if (current === session) current = null;
  const un = session.entry.def.unmount;
  if (un && !session.failed) {
    try {
      un();
    } catch (err) {
      console.error('[zg] widget "' + session.entry.def.id + '" unmount failed', err);
    }
  }
  document.removeEventListener('keydown', session.keyHandler, true);
  document.removeEventListener('focusin', session.focusHandler);
  session.panel.remove();
  session.scrim.remove();
  updateInert();
  sync();
  const f = session.returnFocus;
  if (!walking && f && f.isConnected) {
    try {
      f.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* row layout                                                          */
/* ------------------------------------------------------------------ */

// amp11 (Blake t206u) 11a: one straight row, tile i at x = rowX + i * (size + GAP) - scroll, every tile at the same top y.
function tileScale() {
  const off = (window.__homeLayout && window.__homeLayout.tiles) || {};
  let sc = off.s != null ? +off.s : 1;
  if (!(sc >= 0.4)) sc = off.s != null ? 0.4 : 1;
  if (sc > 3) sc = 3;
  return sc;
}

function render() {
  const n = order.length;
  if (!n) return;
  // layout editor: optional pixel offset / scale from window.__homeLayout.tiles (never transform #zg-root —
  // that made this position:fixed row collapse). Missing or empty values keep the automatic row.
  const off = (window.__homeLayout && window.__homeLayout.tiles) || {};
  const ox = +off.x || 0, oy = +off.y || 0;
  const sc = tileScale();
  // phone (vw < 600): the gap is measured AFTER the scale (visual pitch = size * s + GAP) so the tiles never touch; the
  // scale is about the tile's centre-bottom, so the left edge is shifted by half the growth. Desktop keeps the old math.
  const ph = vw < 600;
  if (ph && sc !== lastSc) { lastSc = sc; layout(); return; }   // tiles.s arrived/changed after layout(): re-centre + re-fit once
  const vwid = ph ? size * sc : size, dx = ph ? -(size - vwid) / 2 : 0;
  // phone: tiles.x may push the row past an edge; keep the whole row inside the viewport (4 px) when it fits, else leave it (it scrolls)
  let cx = 0;
  if (ph) {
    const l0 = rowX - scroll + ox + dx, span = n * vwid + (n - 1) * GAP;
    if (span <= vw - 8) cx = l0 < 4 ? 4 - l0 : (l0 + span > vw - 4 ? vw - 4 - (l0 + span) : 0);
  }
  for (let i = 0; i < n; i++) {
    const e = order[i];
    const tf = 'translate3d(' + (rowX + i * (vwid + GAP) - scroll + ox + dx + cx).toFixed(1) + 'px,' + (rowY + oy).toFixed(1) + 'px,0)' + (sc !== 1 ? ' scale(' + sc.toFixed(3) + ')' : '');
    if (tf !== e.tf) { e.tf = tf; e.el.style.transform = tf; e.el.style.transformOrigin = 'center bottom'; }
  }
}

function motionState() {
  if (walking) return 'hidden';
  if (current || document.hidden) return 'paused';
  if (drag && drag.moved) return 'dragging';
  if (introOn) return reduced ? 'reduced' : 'intro';
  return reduced ? 'reduced' : 'idle';
}

function sync() {
  if (!root) return;
  const state = motionState();
  if (root.dataset.state !== state) root.dataset.state = state;
  if (walking && drag) {
    drag = null;
    if (ring) ring.classList.remove('zg-dragging');
  }
}

function startIntro() {
  // the slide-in itself is a CSS transform transition on the row container; this only reports it as data-state="intro"
  if (introTimer) clearTimeout(introTimer);
  introOn = !reduced;
  introTimer = introOn ? setTimeout(() => { introTimer = 0; introOn = false; sync(); }, INTRO_MS) : 0;
  sync();
}

function maybeShowRing() {
  if (ringShown || !ring) return;
  if (revealPhase === 'down' || revealPhase === 'widgets' || revealPhase === 'done') {
    ring.classList.add('zg-on');
    ringShown = true;
    startIntro();
  }
}

function onReveal(e) {
  const d = (e && e.detail) || {};
  const phase = d.phase || '';
  if (phase) revealPhase = phase === 'widgets' ? 'down' : phase;
  maybeShowRing();
}

/* ------------------------------------------------------------------ */
/* scene mode (show = home, walk, amp)                                 */
/* ------------------------------------------------------------------ */

function cleanMode(v) {
  return v === 'show' || v === 'walk' || v === 'amp' ? v : null;
}

function currentSceneMode() {
  const m = cleanMode(document.body && document.body.dataset ? document.body.dataset.mode : null);
  // amp11 (Blake t206u) 11b: Explore Amp = page 'show' then (a frame later on a rendering device) 'amp'. While the amp is exploring
  // and we are already away, a 'show' is the transient one: keep the row away, no zg-ret / fade-in.
  if (m === 'show' && walking) {
    const h = window.__ampHandle;
    if (h && h.exploring) return 'amp';
  }
  return m;
}

function applyMode(m) {
  if (!root || !ring) return;
  if (m) root.dataset.mode = m;
  else root.removeAttribute('data-mode');
  const w = m === 'walk' || m === 'amp';
  if (w === walking) return;
  walking = w;
  if (w) {
    if (current) closePanel(current); // unmount runs as usual
    hovered.clear();
    drag = null;
    ring.classList.remove('zg-dragging');
    const ae = document.activeElement;
    if (ae && ring.contains(ae)) {
      try {
        ae.blur();
      } catch (_) {
        /* ignore */
      }
    }
    ring.classList.remove('zg-ret');
    ring.classList.add('zg-away');
  } else {
    ring.classList.add('zg-ret');
    ring.classList.remove('zg-away');
  }
  updateInert();
  sync();
}

// amp11 (Blake t206u) 11a: Explore Amp announces walk -> show -> amp inside ONE task (the page leaves walk with setMode('show'),
// then the amp emits 'amp'). Reading the mode once per task (microtask, after the whole dispatch stack) means the transient
// 'show' never reaches applyMode, so the row is never un-hidden (zg-away stays, no zg-ret fade-in) between the press and the amp.
function onSceneMode() {
  if (modeQueued) return;
  modeQueued = true;
  queueMicrotask(() => {
    modeQueued = false;
    applyMode(currentSceneMode());
  });
}

function layout() {
  vw = window.innerWidth || 1;
  vh = window.innerHeight || 1;
  // safe-area insets come from the row container's own padding (harness.css: env(safe-area-inset-*))
  let sl = 0;
  let sb = 0;
  try {
    const cs = getComputedStyle(ring);
    sl = parseFloat(cs.paddingLeft) || 0;
    sb = parseFloat(cs.paddingBottom) || 0;
  } catch (_) {
    /* no insets */
  }
  const margin = vw < 600 ? 16 : 24;
  const phone = vw < 600;
  const sc = tileScale();
  // phone: slim tiles. width = 23.5% of vw (92 px at 390), height = 74% of the width (68 px), so after tiles.s (1.16 on Blake's
  // phone layout) they are ~107 x 79 px, not 123 x 123. Never below 56 px wide, and the scaled row must fit the margins.
  size = phone ? Math.max(56, Math.min(100, Math.round(vw * 0.235))) : Math.round(Math.min(129, Math.max(106, vw * 0.168))); // desktop mirrors CSS clamp
  // Vinyl Vault (Blake, 23 Nov 2026): with 4+ tiles the row can overflow a narrow screen (4 x 106 + 3 x 16 > 393). Shrink the tiles
  // only as much as needed so the row fits between the margins (and stays centered), never below 72. 3 tiles: unchanged (106 at 393).
  const nTiles = Math.max(1, order.length);
  const fit = Math.floor((vw - 2 * Math.max(margin, sl + margin) - (nTiles - 1) * GAP) / (nTiles * (phone ? sc : 1)));
  if (size > fit) size = Math.max(phone ? 56 : 72, fit);
  sizeH = phone ? Math.round(size * 0.74) : size;
  root.style.setProperty('--zg-size', size + 'px');
  root.style.setProperty('--zg-h', sizeH + 'px');
  // home-v2 (Blake, 23 Nov 2026): the apps row is CENTERED horizontally and always sits ABOVE the centered "Explore the Guitar"
  // button (button top is ~64 px + safe-area above the bottom edge): bottom pad 110 on a portrait phone, 88 elsewhere (a 20+ px gap).
  // When the row is wider than the viewport it starts at the left margin and scrolls (maxScroll below).
  // phone portrait: pad 136 (was 110) lifts the slim row clear of Explore even with Blake's tiles.y = +42 / explore.y = -15.
  const pad = vh > vw ? (phone ? 136 : 110) : 88;
  const rowMin = Math.max(margin, sl + margin);
  const vwid = phone ? size * sc : size;   // visual tile width (phone: after tiles.s)
  const total0 = order.length * vwid + Math.max(0, order.length - 1) * GAP;
  rowX = Math.max(rowMin, (vw - total0) / 2);
  rowY = Math.max(0, vh - (sb + pad) - sizeH);
  const total = total0;
  maxScroll = Math.max(0, total - (vw - rowX * 2));
  if (scroll > maxScroll) scroll = maxScroll;
  render();
  fitTileLabels();
}

function fitTileLabels() {
  // Keep each label fully visible (no ellipsis). Shrink tracking, then type size, until the text fits.
  try {
    for (const e of order) {
      const label = e.el && e.el.querySelector('.zg-label');
      if (!label) continue;
      label.style.fontSize = '';
      label.style.letterSpacing = '';
      let fs = parseFloat(getComputedStyle(label).fontSize) || 10;
      let ls = parseFloat(getComputedStyle(label).letterSpacing);
      if (!isFinite(ls)) ls = fs * 0.03;
      for (let i = 0; i < 24 && label.scrollWidth > label.clientWidth; i++) {
        if (ls > fs * 0.01) {
          ls = Math.max(fs * 0.01, ls - fs * 0.005);
          label.style.letterSpacing = ls + 'px';
        } else {
          fs = Math.max(7, fs - 0.5);
          label.style.fontSize = fs + 'px';
        }
      }
    }
  } catch (err) {
    console.warn('[zg] fitTileLabels failed', err);
  }
}


/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

function boot() {
  root = document.getElementById('zg-root');
  if (!root) {
    console.warn('[zg] #zg-root not found; harness disabled');
    return;
  }
  ring = document.createElement('div');
  ring.className = 'zg-ring';
  ring.setAttribute('role', 'group');
  ring.setAttribute('aria-label', 'Apps');
  ring.dataset.layout = 'row';   // amp11 (Blake t206u) 11a
  root.appendChild(ring);

  // Each app is its own failure domain: one app's tile failing to build never stops the others.
  for (const e of entries.values()) {
    try {
      addTile(e); // registered before boot
    } catch (err) {
      console.error('[zg] adding the tile for app "' + (e && e.def && e.def.id) + '" failed', err);
    }
  }

  for (const w of widgets) {
    try {
      register(w);
    } catch (err) {
      console.error('[zg] registering an app failed', err);
    }
  }
  try {
    if (new URLSearchParams(location.search).get('selftest') === '1') register(brokenWidget);
  } catch (err) {
    console.error('[zg] selftest registration failed', err);
  }

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = mq.matches;
  const onMq = () => {
    reduced = mq.matches;
    sync();
    render();
  };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);

  window.addEventListener('resize', layout);
  document.addEventListener('zg:layout-tiles', () => { try { render(); } catch (err) { console.warn('[zg] layout-tiles render failed', err); } });
  window.addEventListener('orientationchange', layout);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('zg:mode', onSceneMode);

  document.addEventListener('zg:reveal', onReveal);
  if (document.body && document.body.dataset.reveal === 'done') {
    revealPhase = 'done';
    maybeShowRing();
  }

  applyMode(currentSceneMode()); // no mode announced -> row always shown
  layout();
  sync();
  try {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { try { layout(); } catch (err) { console.warn('[zg] layout after fonts failed', err); } });
    }
  } catch (err) {
    console.warn('[zg] fonts.ready hook failed', err);
  }

  // Show the ring after the scene is loaded AND the ZUNIGA reveal has reached the widgets phase.
  const t0 = Date.now();
  let timer = 0;
  const check = () => {
    const el = document.getElementById('load');
    const loaded = !el || el.classList.contains('done') || Date.now() - t0 > LOAD_MAX_MS;
    if (!loaded) return false;
    if (timer) clearInterval(timer);
    maybeShowRing();
    // If the word never announces a reveal (font failed), show the ring and arm the stepper.
    const tFallback = Date.now();
    const fallback = () => {
      if (revealPhase === 'done' || revealPhase === 'down') return;
      // intro-polish: a live word still waiting for BOOT.ready (phase 'wait', no zg:reveal yet) is not a failed word.
      // Keep waiting (hard cap) so the tiles never come up before the real 'down'; a failed word emits 'done' itself.
      if (!revealPhase && window.__zgWordPending && Date.now() - tFallback < REVEAL_PENDING_MAX_MS) {
        setTimeout(fallback, 1000);
        return;
      }
      if (!revealPhase) {
        revealPhase = 'done';
        maybeShowRing();
        try {
          document.body.classList.add('zg-reveal-done');
        } catch (_) {
          /* ignore */
        }
      }
    };
    setTimeout(fallback, REVEAL_FALLBACK_MS);
    return true;
  };
  if (!check()) timer = setInterval(check, LOAD_POLL_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
