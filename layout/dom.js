// layout/dom.js: page-level (DOM) placement: the Explore button offset, plus the edit-only clamp that keeps
// the apps row and Explore on screen. Contract: applyDom(L) takes one viewport's items.
import { isEdit, saveLocal } from './doc.js';

export const MIN_S = 0.4, MAX_S = 3, VIEW_MARGIN = 12, MIN_PX = 44;

function applyEl(el, p, origin) {
  if (!el) return;
  const s = p && p.s != null ? Math.max(MIN_S, Math.min(MAX_S, p.s)) : 1;
  if (!p || (p.x == null && p.y == null && s === 1)) {
    el.style.transform = '';
    el.style.transformOrigin = '';
    return;
  }
  el.style.transform = 'translate(' + (p.x || 0) + 'px,' + (p.y || 0) + 'px) scale(' + s + ')';
  el.style.transformOrigin = origin || 'center bottom';
}

function unionTiles() {
  const tiles = document.querySelectorAll('.zg-tile');
  if (!tiles.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  tiles.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); n++;
  });
  return n ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export function nudgeIntoView(r, vw, vh, m) {
  if (!r || r.w < 1 || r.h < 1) return { dx: 0, dy: 0 };
  m = m == null ? VIEW_MARGIN : m;
  vw = vw || innerWidth; vh = vh || innerHeight;
  let dx = 0, dy = 0;
  if (r.w <= vw - 2 * m) {
    if (r.x < m) dx = m - r.x;
    else if (r.x + r.w > vw - m) dx = (vw - m) - (r.x + r.w);
  } else dx = vw / 2 - (r.x + r.w / 2);
  if (r.h <= vh - 2 * m) {
    if (r.y < m) dy = m - r.y;
    else if (r.y + r.h > vh - m) dy = (vh - m) - (r.y + r.h);
  } else dy = vh / 2 - (r.y + r.h / 2);
  return { dx, dy };
}

function clampDomLayout(L) {
  if (!L) return false;
  let changed = false;
  const bumpS = (p) => {
    if (!p) return;
    if (p.s != null && p.s < MIN_S) { p.s = MIN_S; changed = true; }
    if (p.s != null && p.s > MAX_S) { p.s = MAX_S; changed = true; }
  };
  bumpS(L.tiles); bumpS(L.explore); bumpS(L.guitar); bumpS(L.amp); bumpS(L.title); bumpS(L.neon);
  if (L.panel) {
    if (L.panel.w != null && L.panel.w < 0.18) { L.panel.w = 0.18; changed = true; }
    if (L.panel.h != null && L.panel.h < 0.12) { L.panel.h = 0.12; changed = true; }
  }
  const fit = (key, rect) => {
    if (!L[key] || !rect) return;
    const n = nudgeIntoView(rect);
    if (!n.dx && !n.dy) return;
    L[key].x = (L[key].x || 0) + n.dx;
    L[key].y = (L[key].y || 0) + n.dy;
    changed = true;
  };
  fit('tiles', unionTiles());
  const ex = document.getElementById('zg-explore');
  if (ex && L.explore) {
    const r = ex.getBoundingClientRect();
    fit('explore', { x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return changed;
}

export function applyDom(L) {
  // Never transform #zg-root: it is the ancestor of the position:fixed apps row, and a transform on it
  // collapses the row's containing block (tiles vanish). Tile offsets live on window.__homeLayout.tiles
  // and are applied by harness.js render().
  const root = document.getElementById('zg-root');
  if (root) { root.style.transform = ''; root.style.transformOrigin = ''; }
  const ring = document.querySelector('.zg-ring');
  if (ring) { ring.style.transform = ''; ring.style.transformOrigin = ''; }
  const ex = () => document.getElementById('zg-explore');
  applyEl(ex(), L.explore, 'center bottom');
  try { document.dispatchEvent(new CustomEvent('zg:layout-tiles')); } catch (_) { }
  // The live page shows layout.json as written; clamp / write-back is editor-only.
  if (isEdit() && clampDomLayout(L)) {
    try { document.dispatchEvent(new CustomEvent('zg:layout-tiles')); } catch (_) { }
    applyEl(ex(), L.explore, 'center bottom');
    saveLocal();
  }
}
