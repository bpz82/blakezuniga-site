// Home layout runtime: applies layout.json (and, in ?edit=1, a localStorage working copy)
// so a saved layout can be committed as layout.json with no other code changes.
// Empty desktop/phone objects leave the automatic placement (current site look) alone.

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

function applyDom(el, p, origin) {
  if (!el) return;
  if (!p || (p.x == null && p.y == null && (p.s == null || p.s === 1))) {
    el.style.transform = '';
    el.style.transformOrigin = '';
    return;
  }
  const x = p.x || 0, y = p.y || 0, s = p.s != null ? p.s : 1;
  el.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  el.style.transformOrigin = origin || 'center bottom';
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
  applyDom(document.getElementById('zg-root'), L.tiles, 'center bottom');
  applyDom(document.getElementById('zg-explore'), L.explore, 'center bottom');
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
