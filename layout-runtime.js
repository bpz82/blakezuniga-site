// Home layout runtime: applies layout.json (and, in ?edit=1, a localStorage working copy)
// so a saved layout can be committed as layout.json with no other code changes.
// Empty desktop/phone objects leave the automatic placement (current site look) alone.

export { MIN_S, MAX_S, VIEW_MARGIN, MIN_PX };
const STORAGE = 'bz-home-layout';
const SCR_W = 0.58, SCR_H = 0.40;

export const emptyDoc = () => ({ version: 1, desktop: {}, phone: {} });
export const viewportOf = (w, h) => (w < 600 || w < h) ? 'phone' : 'desktop';
export const isEdit = () => new URLSearchParams(location.search).get('edit') === '1';

let doc = emptyDoc();
let fileDoc = emptyDoc();
let hooked = false;
let titleMesh = null;
const _fw = { x: 0, y: 0, z: 0 }, _up = { x: 0, y: 0, z: 0 }, _rt = { x: 0, y: 0, z: 0 };

export function getDoc() { return doc; }
export function getFileDoc() { return fileDoc; }
export function activeViewport() { return viewportOf(innerWidth, innerHeight); }
export function active() { return doc[activeViewport()] || {}; }

export function setDoc(next, persist) {
  doc = next && typeof next === 'object' ? next : emptyDoc();
  if (!doc.desktop) doc.desktop = {};
  if (!doc.phone) doc.phone = {};
  doc.version = 1;
  publish();
  applyNow();
  if (persist) saveLocal();
}

export function setItem(id, props, persist) {
  const v = activeViewport();
  if (!doc[v]) doc[v] = {};
  const cur = doc[v][id] && typeof doc[v][id] === 'object' ? doc[v][id] : {};
  doc[v][id] = Object.assign({}, cur, props);
  publish();
  applyNow();
  if (persist !== false) saveLocal();
}

export function resetViewport(v) {
  doc[v || activeViewport()] = {};
  publish();
  applyNow();
  saveLocal();
}

export function saveLocal() {
  try { localStorage.setItem(STORAGE, JSON.stringify(doc)); } catch (_) { }
}

export function toJSON() { return JSON.stringify(doc, null, 2); }

function publish() {
  window.__homeLayoutDoc = doc;
  window.__homeLayout = active();
  window.__homeLayoutViewport = activeViewport();
}

function hasKeys(obj) { return !!obj && typeof obj === 'object' && Object.keys(obj).length > 0; }

function applyPose(obj, p) {
  if (!obj || !p) return;
  if (p.x != null && p.y != null && p.z != null) obj.position.set(p.x, p.y, p.z);
  if (p.rx != null && p.ry != null && p.rz != null) obj.rotation.set(p.rx, p.ry, p.rz);
  if (p.s != null) obj.scale.setScalar(p.s);
}

const MIN_S = 0.4, MAX_S = 3, VIEW_MARGIN = 12, MIN_PX = 44;

function tilesTarget() { return document.querySelector('.zg-ring') || document.getElementById('zg-root'); }

function applyDom(el, p, origin) {
  if (!el) return;
  const s = p && p.s != null ? Math.max(MIN_S, Math.min(MAX_S, p.s)) : 1;
  if (!p || (p.x == null && p.y == null && s === 1)) {
    el.style.transform = '';
    el.style.transformOrigin = '';
    return;
  }
  const x = p.x || 0, y = p.y || 0;
  el.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
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

function applyTilesAndExplore(L) {
  // Never transform #zg-root: it is the ancestor of the position:fixed apps row,
  // and a transform on it makes the row's containing block collapse (tiles vanish).
  // Offsets live on window.__homeLayout.tiles and are applied in harness.js render().
  const root = document.getElementById('zg-root');
  if (root) { root.style.transform = ''; root.style.transformOrigin = ''; }
  const ring = document.querySelector('.zg-ring');
  if (ring) { ring.style.transform = ''; ring.style.transformOrigin = ''; }
  applyDom(document.getElementById('zg-explore'), L.explore, 'center bottom');
  try { document.dispatchEvent(new CustomEvent('zg:layout-tiles')); } catch (_) { }
  if (clampDomLayout(L)) {
    try { document.dispatchEvent(new CustomEvent('zg:layout-tiles')); } catch (_) { }
    applyDom(document.getElementById('zg-explore'), L.explore, 'center bottom');
    if (isEdit()) saveLocal();   // write back clamped tiles offsets so an existing saved layout stays on screen; no reset needed
  }
}

function findTitle() {
  if (titleMesh && titleMesh.parent) return titleMesh;
  titleMesh = null;
  const d = window.__dbg;
  if (!d || !d.scene) return null;
  d.scene.traverse((o) => {
    if (!titleMesh && o.isMesh && o.geometry && o.geometry.type === 'TextGeometry' && o.name === '') titleMesh = o;
  });
  return titleMesh;
}

function qApply(q, x, y, z, out) {   // apply a camera quaternion to a unit axis, no THREE import
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}

function placeBillboard(mesh, cam, T) {
  if (!mesh || !cam || !T || T.cx == null) return;
  const D = T.depth || 420;
  const th = Math.tan(cam.fov * Math.PI / 360);
  const Hv = 2 * D * th, Wv = Hv * cam.aspect;
  const q = cam.quaternion;
  qApply(q, 0, 0, -1, _fw); qApply(q, 0, 1, 0, _up); qApply(q, 1, 0, 0, _rt);
  const cx = T.cx || 0, cy = T.cy || 0;
  const p = cam.position;
  mesh.position.set(p.x + _fw.x * D + _up.x * Hv * cy + _rt.x * Wv * cx,
                    p.y + _fw.y * D + _up.y * Hv * cy + _rt.y * Wv * cx,
                    p.z + _fw.z * D + _up.z * Hv * cy + _rt.z * Wv * cx);
  mesh.quaternion.copy(cam.quaternion);
  if (T.rz) mesh.rotateZ(T.rz);
  if (T.s != null) mesh.scale.setScalar(T.s);
  mesh.updateMatrixWorld(true);
}

function applyCamera(L) {
  const d = window.__dbg, c = L && L.camera;
  if (!d) return;
  if (isEdit() || (c && hasKeys(c))) {
    try { if (window.__amp9Spin) window.__amp9Spin.homeRadPerSec = 0; } catch (_) { }
  }
  if (!c || !hasKeys(c) || !window.__amp7SetHome) return;
  const k = c.k != null ? c.k : 1;
  window.__amp7SetHome(k, true, c.ox || 0, c.oz || 0);
  if (typeof d.orbit === 'function' && (c.yaw != null || c.pitch != null)) {
    d.orbit(c.yaw || 0, c.pitch != null ? c.pitch : 0.55);
  }
}

export function applyNow() {
  publish();
  const d = window.__dbg;
  if (!d || !d.G) return;
  const L = active();
  applyCamera(L);
  if (L.guitar) applyPose(d.G, L.guitar);
  if (L.amp) applyPose(window.__ampHandle && window.__ampHandle.object3d, L.amp);
  applyTilesAndExplore(L);
}

function applyFrame(cam) {
  const L = active();
  window.__homeLayout = L;
  const d = window.__dbg;
  if (!d) return;
  if (L.guitar) applyPose(d.G, L.guitar);
  if (L.amp) applyPose(window.__ampHandle && window.__ampHandle.object3d, L.amp);
  if (L.title && L.title.cx != null) placeBillboard(findTitle(), cam || d.camera, L.title);
}

function hookRender() {
  if (hooked) return;
  const d = window.__dbg;
  if (!d || !d.renderer || !d.renderer.render) return;
  hooked = true;
  const r = d.renderer, orig = r.render.bind(r);
  r.render = (s, c) => {
    try { applyFrame(c); } catch (_) { }
    return orig(s, c);
  };
}

async function loadFile() {
  try {
    const r = await fetch(new URL('./layout.json', import.meta.url).href + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      fileDoc = Object.assign(emptyDoc(), j);
      if (!fileDoc.desktop) fileDoc.desktop = {};
      if (!fileDoc.phone) fileDoc.phone = {};
    }
  } catch (_) { }
}

function loadStored() {
  try {
    const j = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (j && typeof j === 'object' && j.version) return j;
  } catch (_) { }
  return null;
}

function start() {
  const go = () => {
    if (!(window.__dbg && window.__dbg.camera && window.__dbg.G && window.__dbg.ready)) {
      setTimeout(go, 200);
      return;
    }
    hookRender();
    applyNow();
    window.__layoutRuntime = { ready: true };
  };
  go();
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { publish(); applyNow(); }, 200); });
}

(async function boot() {
  await loadFile();
  const stored = isEdit() ? loadStored() : null;
  doc = stored ? Object.assign(emptyDoc(), stored) : Object.assign(emptyDoc(), fileDoc);
  if (!doc.desktop) doc.desktop = {};
  if (!doc.phone) doc.phone = {};
  publish();
  start();
})();
