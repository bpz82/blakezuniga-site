/**
 * Widget harness: floating app-tiles orbiting over the 3D scene.
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
 *            error message and never affects the scene, the ring or other widgets.
 *   unmount  optional function(), called when the panel closes.
 *
 * register() returns true if the widget was accepted. Otherwise it logs a
 * console.warn, adds nothing and returns false.
 * Nothing is placed on window; register is exported for future modules.
 *
 * MODE
 * ----
 * The ring is the HOME layer. It follows the scene's mode (body.dataset.mode and the
 * document-level 'zg:mode' event, detail 'show' | 'walk'): hidden and idle while
 * walking, visible in 'show'. If the scene does not announce a mode, the ring is
 * always shown.
 */
import { ACTIVE, RETIRED } from './widget-ids.js';
import { widgets, brokenWidget } from './widgets.js';

const TAU = Math.PI * 2;
const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const MAX_TITLE = 32;
const REV_MS = 40000; // one revolution per 40 s
const ATTR_MS = 250; // data-angle update interval
const LOAD_POLL_MS = 250;
const LOAD_MAX_MS = 60000;

const entries = new Map(); // id -> entry
const order = []; // entries that have a tile, in registration order
const pressed = new Set(); // pointer ids currently down on a tile
const hovered = new Set(); // tiles hovered by a mouse

let root = null;
let ring = null;
let angle = Math.PI / 2; // first tile starts at the front
let lastT = null;
let raf = 0;
let lastAttr = 0;
let reduced = false;
let walking = false; // scene is in walk mode: ring hidden, loop stopped
let current = null; // open panel session
let seq = 0;

// cached viewport geometry (updated on resize only)
let vw = 1280;
let vh = 800;
let size = 92;
let cx = 640;
let cy = 368;
let Rx = 420;
let Ry = 112;

/* ------------------------------------------------------------------ */
/* registration                                                        */
/* ------------------------------------------------------------------ */

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
  return { id, title, icon: icon || '', iconSrc, mount, unmount: unmount || null };
}

const ICON_SRC_RE = /^(\.\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(png|webp|jpe?g|gif|svg)$/i;
function validIconSrc(src) {
  return typeof src === 'string' && src.length <= 200 && !src.includes('..') && ICON_SRC_RE.test(src);
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
  if (ring) addTile(entry);
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
  const { id, title, icon, iconSrc } = entry.def;
  const b = document.createElement('button');
  b.type = 'button';
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
  b.setAttribute('aria-label', 'Widget failed to load');
  const ic = span('zg-icon', '!');
  ic.setAttribute('aria-hidden', 'true');
  b.append(ic, span('zg-label', 'Error'));
  return b;
}

function addTile(entry) {
  if (entry.built) return;
  entry.built = true;
  entry.z = -1;
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
  onTap(el, () => openPanel(entry, el), pressed);
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') {
      hovered.add(el);
      sync();
    }
  });
  el.addEventListener('pointerleave', () => {
    if (hovered.delete(el)) sync();
  });
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
/* tap handling (pointer events; iOS does not deliver click here)      */
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
      Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10
      // WEBSITE (integration, Nov 15): no 600 ms limit. On a busy main thread (the WebGL frame) the pointerup handler
      // ran 1.7 s after pointerdown in the phone test, so the tap was dropped. The movement check alone defines a tap.
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
  panel.className = 'zg-panel';
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
  console.error('[zg] widget "' + id + '" failed', err);
  session.failed = true;
  markTileError(session.entry);
  if (session.closed || session.errEl) return;
  try {
    const e = document.createElement('div');
    e.className = 'zg-error';
    e.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = 'This widget failed to load.';
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
/* orbit loop                                                          */
/* ------------------------------------------------------------------ */

function render() {
  const n = order.length;
  if (!n) return;
  const step = TAU / n;
  for (let i = 0; i < n; i++) {
    const e = order[i];
    const a = angle + i * step;
    const s = Math.sin(a);
    const d = (s + 1) / 2; // 0 = back, 1 = front
    const x = cx + Rx * Math.cos(a);
    const y = cy + Ry * s;
    const sc = 0.72 + 0.28 * d;
    const st = e.el.style;
    st.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
    st.opacity = (0.45 + 0.55 * d).toFixed(3);
    const z = Math.round(d * 20);
    if (z !== e.z) {
      e.z = z;
      st.zIndex = String(z);
    }
  }
}

function writeAngle() {
  lastAttr = performance.now();
  root.setAttribute('data-angle', (((angle % TAU) + TAU) % TAU).toFixed(3));
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  if (lastT !== null) {
    angle = (angle + (Math.min(t - lastT, 100) * TAU) / REV_MS) % TAU;
  }
  lastT = t;
  render();
  if (t - lastAttr >= ATTR_MS) writeAngle();
}

function sync() {
  if (!root) return;
  if (walking) {
    // Hidden overrides everything: no loop, no angle updates.
    if (root.dataset.state !== 'hidden') root.dataset.state = 'hidden';
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      writeAngle(); // final value, once
    }
    return;
  }
  const paused = pressed.size > 0 || hovered.size > 0 || !!current || document.hidden;
  const run = !reduced && !paused;
  const state = reduced ? 'reduced' : paused ? 'paused' : 'running';
  if (root.dataset.state !== state) root.dataset.state = state;
  if (run && !raf) {
    lastT = null; // no jump after a pause
    raf = requestAnimationFrame(frame);
  } else if (!run && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
    writeAngle();
  } else if (!run) {
    writeAngle();
  }
}

/* ------------------------------------------------------------------ */
/* scene mode (show = home, walk)                                      */
/* ------------------------------------------------------------------ */

function cleanMode(v) {
  return v === 'show' || v === 'walk' ? v : null;
}

function currentSceneMode() {
  return cleanMode(document.body && document.body.dataset ? document.body.dataset.mode : null);
}

function applyMode(m) {
  if (!root || !ring) return;
  if (m) root.dataset.mode = m;
  else root.removeAttribute('data-mode');
  const w = m === 'walk';
  if (w === walking) return;
  walking = w;
  if (w) {
    if (current) closePanel(current); // unmount runs as usual
    hovered.clear();
    pressed.clear();
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

function onSceneMode(e) {
  // Prefer the event detail; fall back to the body attribute.
  applyMode(cleanMode(e && e.detail) || currentSceneMode());
}

function layout() {
  vw = window.innerWidth || 1;
  vh = window.innerHeight || 1;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  size = Math.round(Math.min(92, Math.max(76, vw * 0.12))); // mirrors CSS clamp
  root.style.setProperty('--zg-size', size + 'px');
  Rx = Math.max(0, Math.min(vw * 0.38, 420, vw / 2 - size / 2 - 6));
  Ry = Math.min(vh * 0.14, 120);
  cx = vw / 2;
  cy = vh * 0.46;
  if (touch) {
    const top = 96;
    const bottom = 190;
    Ry = Math.max(0, Math.min(Ry, (vh - top - bottom - size) / 2));
    const lo = top + size / 2 + Ry;
    const hi = vh - bottom - size / 2 - Ry;
    cy = hi >= lo ? Math.min(hi, Math.max(lo, cy)) : (top + vh - bottom) / 2;
  }
  render();
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
  ring.setAttribute('aria-label', 'Site sections');
  root.appendChild(ring);

  for (const e of entries.values()) addTile(e); // registered before boot

  for (const w of widgets) {
    try {
      register(w);
    } catch (err) {
      console.error('[zg] registering a widget failed', err);
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
  window.addEventListener('orientationchange', layout);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('zg:mode', onSceneMode);

  applyMode(currentSceneMode()); // no mode announced -> ring always shown
  layout();
  if (!walking) writeAngle();
  sync();

  // Show the ring only after the scene has finished loading.
  const t0 = Date.now();
  let timer = 0;
  const check = () => {
    const el = document.getElementById('load');
    if (!el || el.classList.contains('done') || Date.now() - t0 > LOAD_MAX_MS) {
      if (timer) clearInterval(timer);
      ring.classList.add('zg-on');
      return true;
    }
    return false;
  };
  if (!check()) timer = setInterval(check, LOAD_POLL_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
