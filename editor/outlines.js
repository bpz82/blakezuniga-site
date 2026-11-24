// editor/outlines.js: on-screen outlines of each editable item, in iframe CSS pixels. Runs inside the scene iframe.
//
//   outlineOf(id) -> { poly: [[x,y],...], kind } | null      kind: 'hull' | 'quad' | 'rect'
//
//   guitar, amp  convex hull of every visible mesh vertex, projected (the silhouette; not the world AABB)
//   title        same, over the ZUNIGA mesh + tagline (shadow excluded)
//   panel        the real projected screen quad (-SCR_W/2..SCR_W/2 x -SCR_H/2..SCR_H/2 on the `photo-panel` child, so the
//                camera-locked pivot's scale and the child's rz / ry / rx turn are all in matrixWorld)
//   neon         the glyph ink box of the sign's core layer (alpha scan of its canvas), projected as a quad
//   tiles        union of the .zg-tile DOM rects (rect)       explore  #zg-explore DOM rect
//
// Only the geometry accessors below know about the site's scene graph; the rest is plain projection.
import * as THREE from 'three';
import { convexHull, columnReduce, rectPoly } from './geometry.js';

export const SCR_W = 0.58, SCR_H = 0.40;

const dbg = () => window.__dbg;
export const camera = () => dbg() && dbg().camera;
export const canvas = () => dbg() && dbg().renderer && dbg().renderer.domElement;
export const guitarObj = () => dbg() && dbg().G;
export const ampObj = () => window.__ampHandle && window.__ampHandle.object3d;
export const panelObj = () => window.__photoTV && window.__photoTV.panel;

export function neonParts() {
  const p = panelObj(); if (!p) return {};
  let core = null, halo = null, plate = null;
  p.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (mat && mat.blending === THREE.AdditiveBlending && mat.map) {
      if (mat.color && mat.color.r > 1.8) core = o; else halo = o;
    } else if (mat && mat.color && mat.color.getHex && mat.color.getHex() === 0x050403) plate = o;
  });
  return { core: core || halo, halo, plate };
}

export function titleObj() {
  const d = dbg(); if (!d || !d.scene) return null;
  let tag = null, named = null, any = null;
  d.scene.traverse((o) => {
    if (o.name === 'zg-tagline') tag = o;
    if (o.isMesh && o.geometry && (o.geometry.type === 'TextGeometry' || o.geometry.type === 'ExtrudeGeometry')) {
      if (!named && ((o.userData && o.userData.text === 'ZUNIGA') || o.name === 'ZUNIGA')) named = o;
      if (!any && o.name !== 'zg-tagline' && o.name !== 'zg-tagline-shadow') any = o;
    }
  });
  return (tag && tag.parent && tag.parent.isMesh) ? tag.parent : (named || any);
}

// ---- projection ---------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

function viewRect() {
  const el = canvas();
  const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  return r;
}

// World point -> iframe px, or null if it is behind the camera.
export function projectWorld(v, cam, r) {
  _v.copy(v).applyMatrix4(cam.matrixWorldInverse);
  if (_v.z > -cam.near) return null;
  _v.applyMatrix4(cam.projectionMatrix);
  if (!Number.isFinite(_v.x) || !Number.isFinite(_v.y)) return null;
  return [r.left + (_v.x * 0.5 + 0.5) * r.width, r.top + (-_v.y * 0.5 + 0.5) * r.height];
}

function visibleChain(o, root) {
  for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n === root) break; }
  return true;
}

// Project every vertex of every visible mesh under `root` and take the convex hull.
export function meshHull(root, opts) {
  const cam = camera(); if (!root || !cam) return null;
  opts = opts || {};
  cam.updateMatrixWorld(); root.updateMatrixWorld(true);
  const r = viewRect();
  const view = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const xs = [], ys = [];
  let minX = Infinity, maxX = -Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.isSprite || (opts.skip && opts.skip(o))) return;
    if (!visibleChain(o, root)) return;
    const pos = o.geometry.attributes && o.geometry.attributes.position; if (!pos) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    // not part of the silhouette: invisible / colourless helpers, and soft blobs (shadows, halos, glows: transparent, no depth write)
    if (mat && (mat.visible === false || mat.colorWrite === false || mat.opacity < 0.05 || (mat.transparent && mat.depthWrite === false))) return;
    _m.multiplyMatrices(view, o.matrixWorld);
    const e = _m.elements, n = pos.count;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= cam.near * 0.5) continue;   // behind (or on) the camera plane
      const px = r.left + ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * r.width;
      const py = r.top + (-(e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5) * r.height;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      xs.push(px); ys.push(py);
      if (px < minX) minX = px; if (px > maxX) maxX = px;
    }
  });
  if (xs.length < 3) return null;
  const pts = xs.length > 3000 ? columnReduce(xs, ys, xs.length, minX, maxX) : xs.map((x, i) => [x, ys[i]]);
  return convexHull(pts);
}

// A local-space quad on `obj`, projected. Returns null if any corner is behind the camera.
function localQuad(obj, corners) {
  const cam = camera(); if (!obj || !cam) return null;
  cam.updateMatrixWorld(); obj.updateMatrixWorld(true);
  const r = viewRect(), out = [];
  for (const c of corners) {
    _v.set(c[0], c[1], c[2] || 0);
    obj.localToWorld(_v);
    const p = projectWorld(_v.clone(), cam, r);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

export function panelQuad() {
  const p = panelObj();
  return localQuad(p, [[-SCR_W / 2, -SCR_H / 2, 0.01], [SCR_W / 2, -SCR_H / 2, 0.01], [SCR_W / 2, SCR_H / 2, 0.01], [-SCR_W / 2, SCR_H / 2, 0.01]]);
}

const inkCache = new WeakMap();
function inkBoxOf(mesh) {
  const map = mesh.material && mesh.material.map, g = mesh.geometry;
  const pr = g && g.parameters;
  if (!map || !map.image || !pr || !pr.width) return null;
  if (inkCache.has(map)) return inkCache.get(map);
  let res = null;
  try {
    const c = map.image, ctx = c.getContext && c.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0 && y1 > y0) res = [(x0 / c.width - 0.5) * pr.width, (0.5 - y1 / c.height) * pr.height, (x1 / c.width - 0.5) * pr.width, (0.5 - y0 / c.height) * pr.height];
    }
  } catch (_) { res = null; }
  inkCache.set(map, res);
  return res;
}

export function neonQuad() {
  const n = neonParts(), m = n.core || n.plate;
  if (!m) return null;
  const b = inkBoxOf(m);
  if (b) return localQuad(m, [[b[0], b[1], 0.002], [b[2], b[1], 0.002], [b[2], b[3], 0.002], [b[0], b[3], 0.002]]);
  return meshHull(m);
}

function tilesRect() {
  const tiles = document.querySelectorAll('.zg-tile');
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  tiles.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); n++;
  });
  return n ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function exploreRect() {
  const n = document.getElementById('zg-explore');
  if (!n || n.hidden || getComputedStyle(n).visibility === 'hidden') return null;
  const r = n.getBoundingClientRect();
  return r.width < 2 ? null : { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function outlineOf(id) {
  let poly = null, kind = 'hull';
  if (id === 'guitar') poly = meshHull(guitarObj());
  else if (id === 'amp') poly = meshHull(ampObj());
  else if (id === 'title') poly = meshHull(titleObj(), { skip: (o) => o.name === 'zg-tagline-shadow' });
  else if (id === 'panel') { poly = panelQuad(); kind = 'quad'; }
  else if (id === 'neon') { poly = neonQuad(); kind = 'quad'; }
  else if (id === 'tiles' || id === 'explore') { const r = id === 'tiles' ? tilesRect() : exploreRect(); poly = r && rectPoly(r); kind = 'rect'; }
  if (!poly || poly.length < 3) return null;
  const W = innerWidth, H = innerHeight;
  let on = false;   // drop items fully outside the viewport
  for (const p of poly) if (p[0] > -40 && p[0] < W + 40 && p[1] > -40 && p[1] < H + 40) { on = true; break; }
  return on ? { poly, kind } : null;
}

export const ITEM_IDS = ['guitar', 'amp', 'panel', 'title', 'neon', 'tiles', 'explore'];
