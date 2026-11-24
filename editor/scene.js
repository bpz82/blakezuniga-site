// editor/scene.js: the editor's scene side. Loaded by index.html only with ?edit=1 (through the layout-editor-inner.js shim).
// Draws the selection outline over the page, handles drag / pinch / resize / rotate, keeps undo history, and talks to the
// chrome (layout-editor.html + editor/ui.js) over postMessage (editor/protocol.js). Reads and writes the same layout doc
// as the live site through layout/index.js (layout-runtime.js is its re-export shim).
import * as THREE from 'three';
import * as R from '../layout-runtime.js';
import { T } from './protocol.js';
import { LABELS, snapKey } from './schema.js';
import { createHistory } from './undo.js';
import { outlineOf, ITEM_IDS, camera, canvas, guitarObj, ampObj, panelObj, neonParts, titleObj, SCR_W, SCR_H } from './outlines.js';
import { area, bbox, centroid, pointInPolygon, distToPolygon, extreme } from './geometry.js';

if (new URLSearchParams(location.search).get('edit') === '1') startEditor();

function startEditor() {
  document.documentElement.classList.add('le-edit');
  document.body.dataset.edit = '1';
  const css = document.createElement('style');
  css.textContent = `
    body.le-edit, html.le-edit { overflow: hidden !important; }
    #le-overlay{position:fixed;inset:0;z-index:40;touch-action:none;cursor:default;background:transparent}
    #le-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
    #le-svg path{fill:rgba(240,200,120,.10);stroke:#f0c878;stroke-width:2;stroke-linejoin:round;vector-effect:non-scaling-stroke}
    #le-svg path.halo{fill:none;stroke:rgba(0,0,0,.55);stroke-width:4}
    #le-svg line{stroke:#f0c878;stroke-width:1.5}
    .le-h{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;background:#f0c878;border:2px solid #1a1208;border-radius:50%;touch-action:none;z-index:2}
    .le-h::after{content:"";position:absolute;inset:-9px}
    .le-h.rot{background:#1a1208;border-color:#f0c878}
    #le-tag{position:absolute;font:12px/1.2 "Zuniga Mission",sans-serif;letter-spacing:.06em;color:#1a1208;background:#f0c878;padding:3px 8px;white-space:nowrap;pointer-events:none;transform:translateY(-100%)}
    body[data-edit="1"] #zg-explore, body[data-edit="1"] #zg-root { pointer-events: none !important; }
  `;
  document.head.appendChild(css);

  const overlay = document.createElement('div'); overlay.id = 'le-overlay';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.id = 'le-svg';
  const haloP = document.createElementNS(NS, 'path'); haloP.setAttribute('class', 'halo');
  const mainP = document.createElementNS(NS, 'path');
  const rotLine = document.createElementNS(NS, 'line');
  svg.append(haloP, mainP, rotLine);
  const tag = document.createElement('div'); tag.id = 'le-tag';
  const handles = {};
  ['tl', 'tr', 'bl', 'br', 'rot'].forEach((k) => {
    const h = document.createElement('i'); h.className = 'le-h' + (k === 'rot' ? ' rot' : ''); h.dataset.h = k; h.hidden = true; handles[k] = h;
  });
  overlay.append(svg, tag, ...Object.values(handles));
  document.body.appendChild(overlay);
  tag.hidden = true;

  const ROTATABLE = { guitar: 'ry', amp: 'ry', panel: 'rz', title: 'rz' };
  let selected = null, dragging = null, snapOn = false;
  const history = createHistory(100);
  let lastStep = 0;
  let sessionStart = null;   // per-view first-seen item values, the fallback for Reset item
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitPt = new THREE.Vector3(), plane = new THREE.Plane(), camFwd = new THREE.Vector3();

  const guitar = guitarObj, amp = ampObj;
  const objOf = (id) => id === 'guitar' ? guitar() : id === 'amp' ? amp() : null;

  // ---- intro / readiness (unchanged behaviour) ----
  function freezeOrbit() { try { if (window.__amp9Spin) window.__amp9Spin.homeRadPerSec = 0; } catch (_) { } }
  function trySkipIntro() {
    if (document.body.dataset.reveal === 'done' && document.body.classList.contains('zg-reveal-done')) return true;
    try { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 4, clientY: 4, pointerId: 1, pointerType: 'mouse' })); } catch (_) { }
    return false;
  }
  function ensureTilesVisible() {
    try { if (document.body.dataset.reveal === 'done' || document.body.classList.contains('zg-reveal-done')) { const ring = document.querySelector('.zg-ring'); if (ring) ring.classList.add('zg-on'); } } catch (_) { }
  }
  function sceneReady() {
    ensureTilesVisible();
    return !!(window.__dbg && window.__dbg.ready && window.__dbg.G && window.__dbg.camera && document.body.dataset.reveal === 'done'
      && window.__photoTV && (window.__photoTV.state === 'on' || window.__photoTV.state === 'fading' || window.__photoTV.panel));
  }

  // ---- outlines (cached by matrices so an idle frame costs a few dozen number compares) ----
  const keyObjs = { guitar: guitarObj, amp: ampObj, title: titleObj, panel: panelObj, neon: () => { const n = neonParts(); return n.core || n.plate; } };
  const cache = {};
  function cacheKey(id) {
    const f = keyObjs[id]; if (!f) return null;
    const o = f(), cam = camera(); if (!o || !cam) return null;
    cam.updateMatrixWorld(); o.updateMatrixWorld(true);
    return cam.matrixWorld.elements.join(',') + '|' + cam.projectionMatrix.elements.join(',') + '|' + o.matrixWorld.elements.join(',') + '|' + innerWidth + 'x' + innerHeight;
  }
  function shape(id) {
    try {
      const k = cacheKey(id);
      if (k) { const c = cache[id]; if (c && c.k === k) return c.v; const v = outlineOf(id); cache[id] = { k, v }; return v; }
      return outlineOf(id);
    } catch (_) { return null; }
  }
  const polyArea = (s) => s ? area(s.poly) : 0;

  // ---- hit-testing: real shapes ----
  function hitsAt(x, y, tol) {
    const out = [];
    for (const id of ITEM_IDS) {
      const s = shape(id); if (!s) continue;
      if (pointInPolygon(x, y, s.poly) || (tol && distToPolygon(x, y, s.poly) <= tol)) out.push({ id, a: polyArea(s) });
    }
    out.sort((a, b) => a.a - b.a);
    return out;
  }
  // Selected chip keeps priority unless a clearly smaller other item is hit; otherwise the smallest shape wins.
  function pick(x, y, tol) {
    const hits = hitsAt(x, y, tol);
    const sel = selected && selected !== 'camera' ? selected : null;
    if (sel) {
      const other = hits.find((h) => h.id !== sel);
      const sa = polyArea(shape(sel));
      if (other && sa && other.a < sa * 0.85) return other.id;
      return sel;
    }
    return hits.length ? hits[0].id : null;
  }

  // ---- doc helpers ----
  function poseOf(obj) { return { x: obj.position.x, y: obj.position.y, z: obj.position.z, rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z, s: obj.scale.x }; }
  function readCamera() {
    const d = window.__dbg, cam = d.camera, h = window.__amp7Home || {};
    const Lest = (() => { try { const s = new THREE.Box3().setFromObject(d.G).getSize(new THREE.Vector3()); return Math.max(s.x, s.z, 1); } catch (_) { return 118.54696740515774; } })();
    const k = (h.cur != null ? h.cur : (h.target != null ? h.target : 1));
    const Rr = Lest * 0.95 * Math.max(1, 1.1 / cam.aspect) * k;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const target = cam.position.clone().addScaledVector(fwd, Rr);
    const dx = cam.position.x - target.x, dy = cam.position.y - target.y, dz = cam.position.z - target.z;
    const RR = Math.hypot(dx, dy, dz) || 1;
    return { k, yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.min(1, Math.max(-1, dy / RR))), ox: h.ox || 0, oz: h.oz || 0 };
  }
  const viewCenterOf = (b) => b ? { cx: ((b.x + b.w / 2) / innerWidth) - 0.5, cy: 0.5 - ((b.y + b.h / 2) / innerHeight) } : { cx: 0, cy: 0 };

  function ensureItem(id) {
    const L = R.active();
    if (L[id] && Object.keys(L[id]).length) return L[id];
    let seed = {};
    const s = ['panel', 'title'].includes(id) ? shape(id) : null;
    const b = s ? bbox(s.poly) : null;
    if (id === 'camera') seed = readCamera();
    else if (id === 'guitar' && guitar()) seed = poseOf(guitar());
    else if (id === 'amp' && amp()) seed = poseOf(amp());
    else if (id === 'panel') {
      const ph = innerWidth < 600 || innerWidth < innerHeight, c = viewCenterOf(b);
      let w, h;
      if (b) { w = b.w / innerWidth; h = b.h / innerHeight; } else { w = ph ? 0.96 : 0.5; h = w * (SCR_H / SCR_W) * (innerWidth / innerHeight); }
      seed = { cx: c.cx, cy: c.cy, w, h, depth: 600, rz: 0, ry: 0, rx: 0 };
    } else if (id === 'title') {
      const t = titleObj(), c = viewCenterOf(b);
      seed = { cx: c.cx, cy: c.cy, s: t ? t.scale.x : 1, depth: 420, rz: 0 };
    } else if (id === 'neon') {
      const n = neonParts(), obj = n.core || n.plate;
      seed = obj ? { lx: obj.position.x / SCR_W, ly: obj.position.y / SCR_H, s: (obj.userData && obj.userData.s0) ? (obj.scale.x / obj.userData.s0) : 1 } : { lx: 0.24, ly: 0.5, s: 1 };
    } else if (id === 'tiles' || id === 'explore') seed = { x: 0, y: 0, s: 1 };
    R.setItem(id, seed, true);
    return R.active()[id];
  }
  function noteSessionStart(id) {
    const v = R.activeViewport();
    sessionStart = sessionStart || {};
    const key = v + ':' + id;
    if (!(key in sessionStart)) { const it = R.active()[id]; sessionStart[key] = it ? JSON.parse(JSON.stringify(it)) : null; }
  }
  function currentValues(id) {
    const it = (R.active()[id]) || {};
    const out = Object.assign({}, it);
    if (id === 'camera' && it.k == null) Object.assign(out, readCamera());
    if ((id === 'guitar' || id === 'amp') && it.s == null) { const o = objOf(id); if (o) Object.assign(out, poseOf(o)); }
    return out;
  }
  function applyLive(id) {
    const o = objOf(id); if (!o) return;
    const p = R.active()[id]; if (!p) return;
    if (p.x != null) o.position.set(p.x, p.y, p.z);
    if (p.rx != null) o.rotation.set(p.rx, p.ry, p.rz);
    if (p.s != null) o.scale.setScalar(p.s);
  }
  function setKeys(id, props) {
    if (snapOn) { props = Object.assign({}, props); for (const k of Object.keys(props)) props[k] = snapKey(id, k, props[k]); }
    R.setItem(id, props, true);
    if (id === 'guitar' || id === 'amp') applyLive(id);
  }

  // ---- history ----
  const snapshot = () => JSON.stringify(R.getDoc());
  function step(force) {
    const now = performance.now();
    if (force || now - lastStep > 600) history.push(snapshot());
    lastStep = now;
  }
  function restore(json) {
    if (!json) return;
    R.setDoc(JSON.parse(json), true);
    ['guitar', 'amp'].forEach(applyLive);
    emit();
  }
  function undo() { restore(history.undo(snapshot())); }
  function redo() { restore(history.redo(snapshot())); }

  // ---- state out ----
  function emit(extra) {
    const state = {
      type: T.state, doc: R.getDoc(), viewport: R.activeViewport(), selected,
      values: selected ? currentValues(selected) : null, ready: !!sceneReady(), vw: innerWidth, vh: innerHeight,
      canUndo: history.canUndo, canRedo: history.canRedo, snap: snapOn
    };
    if (extra) Object.assign(state, extra);
    try { parent.postMessage(state, '*'); } catch (_) { }
    window.__layoutEditor = Object.assign(window.__layoutEditor || {}, { ready: !!sceneReady(), selected, doc: R.getDoc(), viewport: R.activeViewport(), tools: tools });
  }
  const tools = { outlineOf: (id) => shape(id), hitsAt, pick, undo, redo, select: (id) => select(id), values: currentValues };

  function select(id) {
    selected = id || null;
    if (selected && selected !== 'camera') { try { noteSessionStart(selected); ensureItem(selected); } catch (_) { } }
    draw(); emit();
  }

  // ---- drawing ----
  function draw() {
    const s = selected && selected !== 'camera' ? shape(selected) : null;
    if (!s) { mainP.removeAttribute('d'); haloP.removeAttribute('d'); rotLine.setAttribute('x1', 0); rotLine.setAttribute('x2', 0); rotLine.setAttribute('y1', 0); rotLine.setAttribute('y2', 0); tag.hidden = true; Object.values(handles).forEach((h) => { h.hidden = true; }); return; }
    const d = 'M' + s.poly.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
    mainP.setAttribute('d', d); haloP.setAttribute('d', d);
    const place = (el, p) => { el.hidden = false; el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px'; };
    place(handles.tl, extreme(s.poly, -1, -1)); place(handles.tr, extreme(s.poly, 1, -1));
    place(handles.bl, extreme(s.poly, -1, 1)); place(handles.br, extreme(s.poly, 1, 1));
    const top = extreme(s.poly, 0, -1);
    tag.hidden = false; tag.textContent = LABELS[selected] || selected; tag.style.left = top[0] + 'px'; tag.style.top = (top[1] - (ROTATABLE[selected] ? 40 : 8)) + 'px';
    if (ROTATABLE[selected]) {
      const c = centroid(s.poly); let vx = top[0] - c[0], vy = top[1] - c[1]; const L = Math.hypot(vx, vy) || 1; vx /= L; vy /= L;
      const rp = [top[0] + vx * 30, top[1] + vy * 30];
      place(handles.rot, rp);
      rotLine.setAttribute('x1', top[0]); rotLine.setAttribute('y1', top[1]); rotLine.setAttribute('x2', rp[0]); rotLine.setAttribute('y2', rp[1]);
    } else { handles.rot.hidden = true; rotLine.setAttribute('x2', 0); rotLine.setAttribute('y2', 0); rotLine.setAttribute('x1', 0); rotLine.setAttribute('y1', 0); }
  }

  // ---- gestures ----
  function eventToPlane(e, point) {
    const el = canvas(), cam = camera(); if (!el || !cam) return null;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    cam.getWorldDirection(camFwd);
    plane.setFromNormalAndCoplanarPoint(camFwd, point);
    return ray.ray.intersectPlane(plane, hitPt) ? hitPt.clone() : null;
  }
  const scaleOf = (id, it) => id === 'panel' ? (it.w != null ? it.w : 0.5) : (it.s != null ? it.s : 1);

  function clampItem(id) {
    if (!id || id === 'camera') return;
    const it = R.active()[id]; if (!it) return;
    if (it.s != null && it.s < 0.4 && id !== 'guitar' && id !== 'amp') R.setItem(id, { s: 0.4 }, true);
    if (id === 'panel') { const p = {}; if (it.w != null && it.w < 0.18) p.w = 0.18; if (it.h != null && it.h < 0.12) p.h = 0.12; if ('w' in p || 'h' in p) R.setItem(id, p, true); }
    const sh = shape(id); if (!sh) return;
    const n = R.nudgeIntoView(bbox(sh.poly), innerWidth, innerHeight, 12);
    if (!n.dx && !n.dy) return;
    const cur = R.active()[id] || it;
    if (id === 'tiles' || id === 'explore') R.setItem(id, { x: (cur.x || 0) + n.dx, y: (cur.y || 0) + n.dy }, true);
    else if (id === 'panel' || id === 'title') R.setItem(id, { cx: (cur.cx || 0) + n.dx / innerWidth, cy: (cur.cy || 0) - n.dy / innerHeight }, true);
    else if (id === 'neon') { const a = panelAxes(); if (a) { const d = solveAxes(a, n.dx, n.dy); R.setItem(id, { lx: (cur.lx || 0) + d[0], ly: (cur.ly || 0) + d[1] }, true); } }
    else if (id === 'guitar' || id === 'amp') {
      const o = objOf(id); if (!o) return;
      const b = bbox(sh.poly), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const p0 = eventToPlane({ clientX: cx, clientY: cy }, o.position), p1 = eventToPlane({ clientX: cx + n.dx, clientY: cy + n.dy }, o.position);
      if (p0 && p1) { o.position.add(p1.sub(p0)); R.setItem(id, poseOf(o), true); }
    }
  }
  const clampAll = () => ITEM_IDS.forEach(clampItem);

  // Panel screen axes: how a change of (lx, ly) in panel-width / panel-height units moves the sign on screen.
  function panelAxes() {
    const q = shape('panel'); if (!q || q.kind !== 'quad') return null;
    const [c0, c1, , c3] = q.poly;
    return { ax: c1[0] - c0[0], ay: c1[1] - c0[1], bx: c3[0] - c0[0], by: c3[1] - c0[1] };
  }
  function solveAxes(a, dx, dy) {   // dx,dy screen px  ->  [dlx, dly]
    const det = a.ax * a.by - a.ay * a.bx || 1e-6;
    return [(dx * a.by - dy * a.bx) / det, (a.ax * dy - a.ay * dx) / det];
  }

  function applyScale(id, startS, f, startW, startH) {
    f = Math.max(0.25, Math.min(3, f));
    if (id === 'panel') setKeys(id, { w: Math.max(0.18, Math.min(1.1, (startW || startS) * f)), h: Math.max(0.12, Math.min(1.0, (startH || startS * 0.7) * f)) });
    else if (id === 'guitar' || id === 'amp') setKeys(id, { s: Math.max(0.4, Math.min(3, startS * f)) });
    else setKeys(id, { s: Math.max(0.4, Math.min(3, startS * f)) });
    clampItem(id); emit();
  }

  const pointers = new Map();
  function onDown(e) {
    if (e.button && e.button !== 0) return;
    try { overlay.setPointerCapture(e.pointerId); } catch (_) { }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const sel = selected && selected !== 'camera' ? selected : null;
    if (pointers.size === 2) {
      const pts = [...pointers.values()], dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (sel) { ensureItem(sel); step(true); const it = R.active()[sel] || {}; dragging = { kind: 'pinch', dist: dist || 1, startS: scaleOf(sel, it), item: sel, startW: it.w, startH: it.h }; }
      return;
    }
    const handle = e.target && e.target.dataset && e.target.dataset.h;
    if (handle && sel) {
      ensureItem(sel); step(true);
      const it = R.active()[sel] || {}, sh = shape(sel), c = sh ? centroid(sh.poly) : [e.clientX, e.clientY];
      if (handle === 'rot') dragging = { kind: 'rotate', item: sel, c, a0: Math.atan2(e.clientY - c[1], e.clientX - c[0]), start: Object.assign({}, it) };
      else dragging = { kind: 'resize', item: sel, c, d0: Math.hypot(e.clientX - c[0], e.clientY - c[1]) || 40, startS: scaleOf(sel, it), startW: it.w, startH: it.h };
      e.preventDefault(); return;
    }
    const id = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 12 : 0);
    if (!id) { if (selected !== 'camera') select(null); dragging = null; return; }
    if (id !== selected) select(id);
    ensureItem(id); step(true);
    const o = objOf(id);
    dragging = { kind: 'move', item: id, x: e.clientX, y: e.clientY, start: Object.assign({}, R.active()[id] || {}), startPos: o ? o.position.clone() : null, startHit: o ? eventToPlane(e, o.position) : null, axes: id === 'neon' ? panelAxes() : null };
    e.preventDefault();
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragging) return;
    const id = dragging.item;
    if (dragging.kind === 'pinch' && pointers.size >= 2) {
      const pts = [...pointers.values()], dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      return applyScale(id, dragging.startS, dist / (dragging.dist || 1), dragging.startW, dragging.startH);
    }
    if (dragging.kind === 'resize') {
      const now = Math.hypot(e.clientX - dragging.c[0], e.clientY - dragging.c[1]) || dragging.d0;
      return applyScale(id, dragging.startS, now / dragging.d0, dragging.startW, dragging.startH);
    }
    if (dragging.kind === 'rotate') {
      const a = Math.atan2(e.clientY - dragging.c[1], e.clientX - dragging.c[0]);
      let da = a - dragging.a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const key = ROTATABLE[id], base = dragging.start[key] != null ? dragging.start[key] : 0;
      setKeys(id, { [key]: key === 'ry' ? base + da : base - da });
      clampItem(id); return emit();
    }
    if (dragging.kind !== 'move') return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y, st = dragging.start;
    if (id === 'guitar' || id === 'amp') {
      const o = objOf(id); if (!o || !dragging.startPos) return;
      const now = eventToPlane(e, dragging.startPos);
      if (now && dragging.startHit) o.position.copy(dragging.startPos).add(now.sub(dragging.startHit));
      else {
        const cam = camera(), right = new THREE.Vector3(), up = new THREE.Vector3();
        right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
        o.position.copy(dragging.startPos).addScaledVector(right, (dx / innerWidth) * 80).addScaledVector(up, (-dy / innerHeight) * 80);
      }
      setKeys(id, { x: o.position.x, y: o.position.y, z: o.position.z });
    } else if (id === 'panel' || id === 'title') setKeys(id, { cx: (st.cx || 0) + dx / innerWidth, cy: (st.cy || 0) - dy / innerHeight });
    else if (id === 'neon') {
      const a = dragging.axes || panelAxes();
      const d = a ? solveAxes(a, dx, dy) : [dx / innerWidth, -dy / innerHeight];
      setKeys(id, { lx: (st.lx || 0) + d[0], ly: (st.ly || 0) + d[1] });
    } else if (id === 'tiles' || id === 'explore') setKeys(id, { x: (st.x || 0) + dx, y: (st.y || 0) + dy });
    clampItem(id); emit();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    try { overlay.releasePointerCapture(e.pointerId); } catch (_) { }
    if (pointers.size === 0 || (dragging && dragging.kind === 'pinch')) dragging = null;
    emit();
  }
  overlay.addEventListener('pointerdown', onDown);
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  // Block Explore / panel / walk while editing (capture).
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('#zg-explore, #zg-home, #mode');
    if (t) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  try { if (window.__photoTV) window.__photoTV._leBlock = true; } catch (_) { }

  // ---- messages from the chrome ----
  function resetItem(id) {
    if (!id || id === 'camera') return;
    const v = R.activeViewport(), file = R.getFileDoc()[v] && R.getFileDoc()[v][id];
    const base = file && Object.keys(file).length ? JSON.parse(JSON.stringify(file)) : (sessionStart && sessionStart[v + ':' + id]) || null;
    step(true);
    const doc = R.getDoc();
    if (base) doc[v][id] = base; else delete doc[v][id];
    R.setDoc(doc, true);
    applyLive(id); if (base) ensureItem(id);
    clampItem(id); emit();
  }

  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === T.select) select(m.id || null);
    else if (m.type === T.set && m.id && m.props) {
      noteSessionStart(m.id); ensureItem(m.id); step(false);
      if (m.id === 'camera') { R.setItem('camera', Object.assign({}, readCamera(), R.active().camera, m.props), true); R.applyNow(); }
      else setKeys(m.id, m.props);
      clampItem(m.id); emit();
    } else if (m.type === T.begin) step(true);
    else if (m.type === T.undo) undo();
    else if (m.type === T.redo) redo();
    else if (m.type === T.resetItem) resetItem(m.id || selected);
    else if (m.type === T.snap) { snapOn = !!m.on; emit(); }
    else if (m.type === T.reset) {
      R.resetViewport(m.viewport || R.activeViewport());
      selected = null; emit({ reset: true, reload: true });
      location.reload();   // clean automatic placement is simplest after a reload of the iframe
    } else if (m.type === T.ping) emit();
  });
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault(); if (e.shiftKey) redo(); else undo();
  });

  let skipTimer = setInterval(() => { if (trySkipIntro()) { clearInterval(skipTimer); skipTimer = null; } }, 400);
  setTimeout(() => { if (skipTimer) { clearInterval(skipTimer); skipTimer = null; } }, 180000);

  (function loop() { freezeOrbit(); draw(); requestAnimationFrame(loop); })();

  const wait = () => {
    freezeOrbit();
    if (!sceneReady() || !window.__layoutRuntime) { setTimeout(wait, 300); emit(); return; }
    R.applyNow(); clampAll();
    emit({ boot: true });
    try { parent.postMessage({ type: T.ready, viewport: R.activeViewport(), vw: innerWidth, vh: innerHeight }, '*'); } catch (_) { }
    window.__layoutEditor = Object.assign(window.__layoutEditor || {}, { ready: true, selected, doc: R.getDoc(), viewport: R.activeViewport(), tools });
  };
  wait();
}
