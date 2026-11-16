/**
 * Widget harness: floating app-tiles on a ring over the 3D scene.
 * The ring stays still at rest. A horizontal swipe on a tile or the ring
 * track spins it; momentum eases out and one tile snaps to the front.
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
 *
 * data-state: idle (at rest) | dragging | coasting (inertia/snap) | paused
 * (panel open or tab hidden) | reduced | hidden (walk mode).
 */
import { ACTIVE, RETIRED } from './widget-ids.js';
import { widgets, brokenWidget } from './widgets.js';

const TAU = Math.PI * 2;
const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const MAX_TITLE = 32;
const ATTR_MS = 250; // data-angle update interval
const LOAD_POLL_MS = 250;
const LOAD_MAX_MS = 60000;
const TAP_PX = 10; // movement below this is a tap, not a swipe
const VEL_WINDOW_MS = 80;
const FRICTION = 5; // s^-1; used to project where a flick would stop
const MAX_VEL = 14; // rad/s cap
const TRACK_PAD = 28; // extra stroke width beyond the tile size, in px

const entries = new Map(); // id -> entry
const order = []; // entries that have a tile, in registration order
const pressed = new Set(); // pointer ids currently down on a tile or the track
const hovered = new Set(); // tiles hovered by a mouse

let root = null;
let ring = null;
let trackSvg = null;
let track = null; // ellipse: swipeable ring path, stroke only (center stays clear)
let angle = Math.PI / 2; // first tile starts at the front
let raf = 0;
let lastAttr = 0;
let reduced = false;
let walking = false; // scene is in walk mode: ring hidden, loop stopped
let current = null; // open panel session
let seq = 0;
let drag = null; // active swipe: { id, x, y, angle, moved, maxDist, samples }
let coast = null; // snap animation: { from, delta, t0, dur }

// cached viewport geometry (updated on resize only)
let vw = 1280;
let vh = 800;
let size = 129;
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
  bindRingPointer(el, () => openPanel(entry, el), pressed);
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
/* tap + swipe (pointer events; iOS does not deliver click here)       */
/* ------------------------------------------------------------------ */

function dxToAngle(dx) {
  // A horizontal swipe of Rx (center to the side of the ring) is a quarter turn.
  const r = Math.max(Rx, 80);
  return -(dx / r) * (Math.PI / 2);
}

function wrapAngle(a) {
  return ((a % TAU) + TAU) % TAU;
}

function shortest(from, to) {
  let d = wrapAngle(to) - wrapAngle(from);
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function snapTarget(a, vel) {
  const n = Math.max(order.length, 1);
  const step = TAU / n;
  const projected = a + (vel || 0) / FRICTION;
  let best = Math.PI / 2;
  let bestAbs = Infinity;
  for (let i = 0; i < n; i++) {
    const s = wrapAngle(Math.PI / 2 - i * step);
    const ad = Math.abs(shortest(projected, s));
    if (ad < bestAbs) {
      bestAbs = ad;
      best = s;
    }
  }
  return { snap: best, delta: shortest(a, best) };
}

function velocityOf(samples) {
  if (!samples || samples.length < 2) return 0;
  const a = samples[0];
  const b = samples[samples.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt < 0.008) return 0;
  let v = (b.angle - a.angle) / dt;
  if (v > MAX_VEL) v = MAX_VEL;
  if (v < -MAX_VEL) v = -MAX_VEL;
  return v;
}

function cancelCoast() {
  coast = null;
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

function settleNow() {
  if (coast) {
    angle = wrapAngle(coast.from + coast.delta);
    coast = null;
  }
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  render();
  writeAngle();
}

function startSnap(now, vel) {
  const useVel = reduced ? 0 : vel || 0;
  const { snap, delta } = snapTarget(angle, useVel);
  if (reduced || Math.abs(delta) < 0.001) {
    angle = snap;
    coast = null;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    render();
    writeAngle();
    sync();
    return;
  }
  const dur = Math.min(700, Math.max(280, Math.abs(delta) * 420 + Math.abs(useVel) * 40));
  coast = { from: angle, delta: delta, t0: now, dur: dur };
  if (!raf) raf = requestAnimationFrame(frame);
  sync();
}

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

function bindRingPointer(el, fn, pressSet) {
  let lastTap = -1e9;

  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.button > 0) return;
    if (current || walking) return;
    if (drag && drag.id !== e.pointerId) return;
    cancelCoast();
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      angle: angle,
      moved: false,
      maxDist: 0,
      samples: [{ t: performance.now(), angle: angle }],
    };
    if (pressSet) pressSet.add(e.pointerId);
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
    const dy = e.clientY - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist > s.maxDist) s.maxDist = dist;
    // WEBSITE (integration, Nov 15): no 600 ms limit. On a busy main thread (the WebGL frame) the pointerup handler
    // ran 1.7 s after pointerdown in the phone test, so the tap was dropped. The movement check alone defines a tap.
    if (!s.moved && dist >= TAP_PX) s.moved = true;
    if (!s.moved) return;
    angle = s.angle + dxToAngle(dx);
    const now = performance.now();
    s.samples.push({ t: now, angle: angle });
    while (s.samples.length > 1 && now - s.samples[0].t > VEL_WINDOW_MS) s.samples.shift();
    render();
    if (now - lastAttr >= ATTR_MS) writeAngle();
    if (ring && !ring.classList.contains('zg-dragging')) ring.classList.add('zg-dragging');
    sync();
  });

  const finish = (e, allow) => {
    e.stopPropagation();
    if (pressSet && pressSet.delete(e.pointerId)) {
      /* press state updates in sync() */
    }
    const s = drag;
    if (!s || s.id !== e.pointerId) return;
    drag = null;
    if (ring) ring.classList.remove('zg-dragging');
    const now = performance.now();
    const isTap = allow && !s.moved && s.maxDist < TAP_PX;
    if (isTap) {
      sync();
      if (fn) {
        lastTap = now;
        fn();
      }
      return;
    }
    if (s.moved) {
      startSnap(now, reduced ? 0 : velocityOf(s.samples));
      return;
    }
    sync();
  };
  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));
  el.addEventListener('lostpointercapture', (e) => {
    if (pressSet && pressSet.delete(e.pointerId)) sync();
  });

  if (!fn) return;

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
/* ring layout + inertia                                               */
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
    st.opacity = (0.85 + 0.15 * d).toFixed(3);
    const z = Math.round(d * 20);
    if (z !== e.z) {
      e.z = z;
      st.zIndex = String(z);
    }
  }
}

function writeAngle() {
  lastAttr = performance.now();
  if (root) root.setAttribute('data-angle', wrapAngle(angle).toFixed(3));
}

function frame(t) {
  if (!coast) {
    raf = 0;
    return;
  }
  raf = requestAnimationFrame(frame);
  const u = Math.min(1, (t - coast.t0) / coast.dur);
  const e = 1 - Math.pow(1 - u, 3); // ease-out cubic
  angle = coast.from + coast.delta * e;
  render();
  if (t - lastAttr >= ATTR_MS || u >= 1) writeAngle();
  if (u >= 1) {
    angle = wrapAngle(coast.from + coast.delta);
    coast = null;
    raf = 0;
    writeAngle();
    sync();
  }
}

function motionState() {
  if (walking) return 'hidden';
  if (current || document.hidden) return 'paused';
  if (reduced && !drag) return 'reduced';
  if (drag && drag.moved) return 'dragging';
  if (coast) return 'coasting';
  return 'idle';
}

function sync() {
  if (!root) return;
  if (walking) {
    // Hidden overrides everything: no loop, no angle updates.
    if (root.dataset.state !== 'hidden') root.dataset.state = 'hidden';
    if (drag) drag = null;
    if (ring) ring.classList.remove('zg-dragging');
    settleNow();
    return;
  }
  const state = motionState();
  if (root.dataset.state !== state) root.dataset.state = state;
  if (document.hidden && coast) settleNow();
  if (!drag && !coast && !raf) writeAngle();
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
    drag = null;
    if (ring) ring.classList.remove('zg-dragging');
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
  size = Math.round(Math.min(129, Math.max(106, vw * 0.168))); // mirrors CSS clamp (~1.4x the Nov 16 sizes)
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
  if (trackSvg && track) {
    trackSvg.setAttribute('width', String(vw));
    trackSvg.setAttribute('height', String(vh));
    trackSvg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    track.setAttribute('cx', cx.toFixed(1));
    track.setAttribute('cy', cy.toFixed(1));
    track.setAttribute('rx', Math.max(Rx, 1).toFixed(1));
    track.setAttribute('ry', Math.max(Ry, 1).toFixed(1));
    track.setAttribute('stroke-width', String(Math.round(size + TRACK_PAD)));
  }
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
  ring.setAttribute('aria-label', 'Site sections');
  root.appendChild(ring);

  trackSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trackSvg.setAttribute('class', 'zg-track');
  trackSvg.setAttribute('aria-hidden', 'true');
  track = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  trackSvg.appendChild(track);
  ring.appendChild(trackSvg);
  bindRingPointer(track, null, pressed);

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
  try {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { try { layout(); } catch (err) { console.warn('[zg] layout after fonts failed', err); } });
    }
  } catch (err) {
    console.warn('[zg] fonts.ready hook failed', err);
  }

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
