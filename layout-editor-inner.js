// Layout editor scene side. Only runs with ?edit=1. Talks to layout-editor.html via postMessage.
import * as THREE from 'three';
import * as R from './layout-runtime.js';

if (new URLSearchParams(location.search).get('edit') !== '1') {
  // still load the runtime (this file is imported only from index when always present;
  // runtime is a separate tag). Nothing to do.
} else startEditor();

function startEditor() {
  document.documentElement.classList.add('le-edit');
  document.body.dataset.edit = '1';
  const css = document.createElement('style');
  css.textContent = `
    body.le-edit, html.le-edit { overflow: hidden !important; }
    #le-overlay{position:fixed;inset:0;z-index:40;touch-action:none;cursor:default;background:transparent}
    #le-box{position:absolute;border:1.5px solid #f0c878;box-shadow:0 0 0 1px rgba(0,0,0,.45);pointer-events:none;border-radius:2px}
    #le-box .h{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;background:#f0c878;border:2px solid #1a1208;border-radius:50%;pointer-events:auto;touch-action:none}
    #le-box .h.tl{left:0;top:0} #le-box .h.tr{left:100%;top:0} #le-box .h.bl{left:0;top:100%} #le-box .h.br{left:100%;top:100%}
    #le-tag{position:absolute;left:0;top:-22px;font:12px/1.2 "Zuniga Mission",sans-serif;letter-spacing:.06em;color:#1a1208;background:#f0c878;padding:3px 8px;white-space:nowrap;pointer-events:none}
    body[data-edit="1"] #zg-explore, body[data-edit="1"] #zg-root { pointer-events: none !important; }
  `;
  document.head.appendChild(css);

  const overlay = document.createElement('div');
  overlay.id = 'le-overlay';
  const box = document.createElement('div');
  box.id = 'le-box';
  box.hidden = true;
  box.innerHTML = '<div class="le-tag" id="le-tag"></div><i class="h tl" data-h="tl"></i><i class="h tr" data-h="tr"></i><i class="h bl" data-h="bl"></i><i class="h br" data-h="br"></i>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const tag = box.querySelector('#le-tag');

  const LABELS = { guitar: 'Guitar', amp: 'Amp', panel: 'Panel', title: 'Title', neon: 'Sign', tiles: 'Tiles', explore: 'Explore', camera: 'Camera' };
  const ITEMS = ['explore', 'tiles', 'neon', 'title', 'amp', 'guitar', 'panel'];   // hit-test front to back
  const SCR_W = 0.58, SCR_H = 0.40;

  let selected = null;
  let dragging = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const hitPt = new THREE.Vector3();
  const plane = new THREE.Plane();
  const camFwd = new THREE.Vector3();

  function camera() { return window.__dbg && window.__dbg.camera; }
  function canvas() { return window.__dbg && window.__dbg.renderer && window.__dbg.renderer.domElement; }

  function freezeOrbit() {
    try { if (window.__amp9Spin) window.__amp9Spin.homeRadPerSec = 0; } catch (_) { }
  }

  function trySkipIntro() {
    if (document.body.dataset.reveal === 'done' && document.body.classList.contains('zg-reveal-done')) return true;
    try { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 4, clientY: 4, pointerId: 1, pointerType: 'mouse' })); } catch (_) { }
    return false;
  }

  function ensureTilesVisible() {
    try {
      if (document.body.dataset.reveal === 'done' || document.body.classList.contains('zg-reveal-done')) {
        const ring = document.querySelector('.zg-ring');
        if (ring) ring.classList.add('zg-on');
      }
    } catch (_) { }
  }

  function sceneReady() {
    ensureTilesVisible();
    return !!(window.__dbg && window.__dbg.ready && window.__dbg.G && window.__dbg.camera
      && document.body.dataset.reveal === 'done'
      && window.__photoTV && (window.__photoTV.state === 'on' || window.__photoTV.state === 'fading' || window.__photoTV.panel));
  }

  function guitar() { return window.__dbg && window.__dbg.G; }
  function amp() { return window.__ampHandle && window.__ampHandle.object3d; }
  function panel() { return window.__photoTV && window.__photoTV.panel; }
  function neonMesh() {
    const p = panel(); if (!p) return null;
    let m = null;
    p.traverse((o) => { if (!m && o.isMesh && o === (window.__photoTV && window.__photoTV.object3d)) { /* skip */ } });
    // neon core is the mesh with map and additive blending near the sign; prefer known handle
    const tv = window.__photoTV;
    if (tv && tv.neonRect) {
      // find the visible text mesh: last neon part with a texture that isn't the dark plate
    }
    let core = null, halo = null, plate = null;
    if (p) p.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material;
      if (mat && mat.blending === THREE.AdditiveBlending && mat.map) {
        if (mat.color && mat.color.r > 1.8) core = o;
        else halo = o;
      } else if (mat && mat.color && mat.color.getHex && mat.color.getHex() === 0x050403) plate = o;
    });
    return { core: core || halo, halo, plate, group: [plate, halo, core].filter(Boolean) };
  }
  function title() {
    let t = null;
    const d = window.__dbg; if (!d || !d.scene) return null;
    d.scene.traverse((o) => { if (!t && o.isMesh && o.geometry && o.geometry.type === 'TextGeometry' && o.name === '') t = o; });
    return t;
  }
  function tilesEl() { return document.getElementById('zg-root'); }
  function exploreEl() { return document.getElementById('zg-explore'); }

  function projectCorners(obj, localCorners, cam, el) {
    const r = el.getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    cam.updateMatrixWorld(); obj.updateMatrixWorld(true);
    const v = tmp;
    for (const c of localCorners) {
      v.set(c[0], c[1], c[2] || 0);
      obj.localToWorld(v);
      v.project(cam);
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
      const px = r.left + (v.x * 0.5 + 0.5) * r.width;
      const py = r.top + (-v.y * 0.5 + 0.5) * r.height;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); n++;
    }
    if (!n || x1 < -40 || y1 < -40 || x0 > innerWidth + 40 || y0 > innerHeight + 40) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function aabbCorners(obj) {
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return null;
    const min = b.min, max = b.max;
    return [
      [min.x, min.y, min.z], [max.x, min.y, min.z], [min.x, max.y, min.z], [max.x, max.y, min.z],
      [min.x, min.y, max.z], [max.x, min.y, max.z], [min.x, max.y, max.z], [max.x, max.y, max.z]
    ];
  }

  function worldCornersRect(worldCorners, cam, el) {
    const r = el.getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    cam.updateMatrixWorld();
    const v = tmp;
    for (const c of worldCorners) {
      v.set(c[0], c[1], c[2]).project(cam);
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
      const px = r.left + (v.x * 0.5 + 0.5) * r.width;
      const py = r.top + (-v.y * 0.5 + 0.5) * r.height;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); n++;
    }
    if (!n) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function itemRect(id) {
    const cam = camera(), el = canvas();
    if (!cam || !el) return null;
    if (id === 'tiles') {
      const tiles = document.querySelectorAll('.zg-tile');
      if (!tiles.length) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
      tiles.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); n++;
      });
      if (!n) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    if (id === 'explore') {
      const n = exploreEl(); if (!n || n.hidden || getComputedStyle(n).visibility === 'hidden') return null;
      const r = n.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    if (id === 'panel') {
      const p = panel(); if (!p) return null;
      return projectCorners(p, [[-SCR_W / 2, -SCR_H / 2, 0], [SCR_W / 2, -SCR_H / 2, 0], [SCR_W / 2, SCR_H / 2, 0], [-SCR_W / 2, SCR_H / 2, 0]], cam, el);
    }
    if (id === 'neon') {
      const n = neonMesh(); if (!n.core && !n.plate) return null;
      const obj = n.core || n.plate;
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return null;
      return worldCornersRect([
        [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z], [b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z],
        [b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z]
      ], cam, el);
    }
    if (id === 'title') {
      const t = title(); if (!t) return null;
      const b = new THREE.Box3().setFromObject(t);
      if (b.isEmpty()) return null;
      return worldCornersRect([
        [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z], [b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z],
        [b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z]
      ], cam, el);
    }
    if (id === 'guitar' || id === 'amp') {
      const obj = id === 'guitar' ? guitar() : amp();
      if (!obj) return null;
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return null;
      return worldCornersRect([
        [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z], [b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z],
        [b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z]
      ], cam, el);
    }
    return null;
  }

  function hitTest(x, y) {
    for (const id of ITEMS) {
      const r = itemRect(id);
      if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id;
    }
    return null;
  }

  function poseOf(obj) {
    return { x: obj.position.x, y: obj.position.y, z: obj.position.z, rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z, s: obj.scale.x };
  }

  function readCamera() {
    const d = window.__dbg, cam = d.camera, h = window.__amp7Home || {};
    const Lest = (() => { try { const s = new THREE.Box3().setFromObject(d.G).getSize(new THREE.Vector3()); return Math.max(s.x, s.z, 1); } catch (_) { return 118.54696740515774; } })();
    const k = (h.cur != null ? h.cur : (h.target != null ? h.target : 1));
    const R = Lest * 0.95 * Math.max(1, 1.1 / cam.aspect) * k;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const target = cam.position.clone().addScaledVector(fwd, R);
    const dx = cam.position.x - target.x, dy = cam.position.y - target.y, dz = cam.position.z - target.z;
    const RR = Math.hypot(dx, dy, dz) || 1;
    return { k, yaw: Math.atan2(dx, dz), pitch: Math.asin(Math.min(1, Math.max(-1, dy / RR))), ox: h.ox || 0, oz: h.oz || 0 };
  }

  function viewCenterOf(rect) {
    if (!rect) return { cx: 0, cy: 0 };
    const cx = ((rect.x + rect.w / 2) / innerWidth) - 0.5;
    const cy = 0.5 - ((rect.y + rect.h / 2) / innerHeight);
    return { cx, cy };
  }

  function ensureItem(id) {
    const L = R.active();
    if (L[id] && Object.keys(L[id]).length) return L[id];
    let seed = {};
    if (id === 'camera') seed = readCamera();
    else if (id === 'guitar' && guitar()) seed = poseOf(guitar());
    else if (id === 'amp' && amp()) seed = poseOf(amp());
    else if (id === 'panel') {
      const ph = innerWidth < 600 || innerWidth < innerHeight;
      const r = itemRect('panel');
      const c = viewCenterOf(r);
      let w, h;
      if (r) { w = r.w / innerWidth; h = r.h / innerHeight; }
      else { w = ph ? 0.96 : 0.5; h = w * (SCR_H / SCR_W) * (innerWidth / innerHeight); }
      seed = { cx: c.cx, cy: c.cy, w, h, depth: 600, rz: 0 };
    } else if (id === 'title') {
      const t = title(), r = itemRect('title');
      const c = viewCenterOf(r);
      seed = { cx: c.cx, cy: c.cy, s: t ? t.scale.x : 1, depth: 420, rz: 0 };
    } else if (id === 'neon') {
      const n = neonMesh();
      const obj = (n && (n.core || n.plate));
      if (obj) {
        seed = { lx: obj.position.x / SCR_W, ly: obj.position.y / SCR_H, s: (obj.userData && obj.userData.s0) ? (obj.scale.x / obj.userData.s0) : 1 };
      } else seed = { lx: 0.24, ly: 0.5, s: 1 };
    } else if (id === 'tiles' || id === 'explore') {
      seed = { x: 0, y: 0, s: 1 };
    }
    R.setItem(id, seed, true);
    return R.active()[id];
  }

  function currentValues(id) {
    const it = (R.active()[id]) || {};
    const out = Object.assign({}, it);
    if (id === 'camera' && (it.k == null)) Object.assign(out, readCamera());
    if ((id === 'guitar' || id === 'amp') && it.s == null) {
      const obj = id === 'guitar' ? guitar() : amp();
      if (obj) Object.assign(out, poseOf(obj));
    }
    return out;
  }

  function emit(extra) {
    const state = {
      type: 'le:state',
      doc: R.getDoc(),
      viewport: R.activeViewport(),
      selected,
      values: selected ? currentValues(selected) : null,
      ready: !!sceneReady(),
      vw: innerWidth,
      vh: innerHeight
    };
    if (extra) Object.assign(state, extra);
    try { parent.postMessage(state, '*'); } catch (_) { }
    window.__layoutEditor = { ready: !!sceneReady(), selected, doc: R.getDoc(), viewport: R.activeViewport() };
  }

  function select(id) {
    selected = id || null;
    updateBox();
    emit();
  }

  function updateBox() {
    if (!selected || selected === 'camera') { box.hidden = true; return; }
    const r = itemRect(selected);
    if (!r || r.w < 2 || r.h < 2) { box.hidden = true; return; }
    box.hidden = false;
    box.style.left = r.x + 'px';
    box.style.top = r.y + 'px';
    box.style.width = r.w + 'px';
    box.style.height = r.h + 'px';
    tag.textContent = LABELS[selected] || selected;
  }

  function eventToPlane(e, point) {
    const el = canvas(), cam = camera();
    if (!el || !cam) return null;
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    cam.getWorldDirection(camFwd);
    plane.setFromNormalAndCoplanarPoint(camFwd, point);
    if (!ray.ray.intersectPlane(plane, hitPt)) return null;
    return hitPt.clone();
  }

  const pointers = new Map();

  function onDown(e) {
    if (e.button && e.button !== 0) return;
    try { overlay.setPointerCapture(e.pointerId); } catch (_) { }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (selected && selected !== 'camera') {
        ensureItem(selected);
        const it = R.active()[selected] || {};
        dragging = { kind: 'pinch', dist: dist || 1, startS: scaleOf(selected, it), item: selected, startW: it.w, startH: it.h };
      }
      return;
    }
    const handle = e.target && e.target.dataset && e.target.dataset.h;
    if (handle && selected && selected !== 'camera') {
      ensureItem(selected);
      const it = R.active()[selected] || {};
      const r = itemRect(selected);
      dragging = { kind: 'resize', handle, item: selected, x: e.clientX, y: e.clientY, startS: scaleOf(selected, it), startW: it.w, startH: it.h, rw: r && r.w, rh: r && r.h };
      e.preventDefault();
      return;
    }
    const id = hitTest(e.clientX, e.clientY);
    if (id) select(id);
    else if (selected !== 'camera') select(null);
    if (!selected || selected === 'camera') { dragging = null; return; }
    ensureItem(selected);
    const it = Object.assign({}, R.active()[selected] || {});
    const obj = selected === 'guitar' ? guitar() : selected === 'amp' ? amp() : null;
    dragging = {
      kind: 'move', item: selected, x: e.clientX, y: e.clientY,
      start: it,
      startPos: obj ? obj.position.clone() : null,
      startHit: obj ? eventToPlane(e, obj.position) : null
    };
    e.preventDefault();
  }

  function scaleOf(id, it) {
    if (id === 'panel') return it.w != null ? it.w : 0.5;
    if (it.s != null) return it.s;
    return 1;
  }


  function clampItem(id) {
    if (!id || id === 'camera') return;
    const it = R.active()[id];
    if (!it) return;
    if (it.s != null && it.s < 0.4) R.setItem(id, { s: 0.4 }, true);
    if (id === 'panel') {
      const p = {};
      if (it.w != null && it.w < 0.18) p.w = 0.18;
      if (it.h != null && it.h < 0.12) p.h = 0.12;
      if (p.w != null || p.h != null) R.setItem(id, p, true);
    }
    const r = itemRect(id);
    if (!r) return;
    const n = R.nudgeIntoView(r, innerWidth, innerHeight, 12);
    if (!n.dx && !n.dy) return;
    if (id === 'tiles' || id === 'explore') {
      const cur = R.active()[id] || it;
      R.setItem(id, { x: (cur.x || 0) + n.dx, y: (cur.y || 0) + n.dy }, true);
    } else if (id === 'panel' || id === 'title') {
      const cur = R.active()[id] || it;
      R.setItem(id, { cx: (cur.cx || 0) + n.dx / innerWidth, cy: (cur.cy || 0) - n.dy / innerHeight }, true);
    } else if (id === 'neon') {
      const cur = R.active()[id] || it;
      const pr = itemRect('panel');
      if (pr && pr.w > 1 && pr.h > 1) R.setItem(id, { lx: (cur.lx || 0) + n.dx / pr.w, ly: (cur.ly || 0) - n.dy / pr.h }, true);
    } else if (id === 'guitar' || id === 'amp') {
      const obj = id === 'guitar' ? guitar() : amp();
      if (!obj) return;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const a = eventToPlane({ clientX: cx, clientY: cy }, obj.position);
      const b = eventToPlane({ clientX: cx + n.dx, clientY: cy + n.dy }, obj.position);
      if (a && b) { obj.position.add(b.sub(a)); R.setItem(id, poseOf(obj), true); }
    }
  }

  function clampAll() {
    ['guitar', 'amp', 'panel', 'title', 'neon', 'tiles', 'explore'].forEach(clampItem);
  }

  function applyScale(id, start, factor, startW, startH) {
    const f = Math.max(0.25, Math.min(3, factor));
    if (id === 'panel') {
      const w = Math.max(0.18, Math.min(1.1, (startW || start) * f));
      const h = Math.max(0.12, Math.min(1.0, (startH || start * 0.7) * f));
      R.setItem(id, { w, h }, true);
    } else if (id === 'guitar' || id === 'amp' || id === 'title' || id === 'neon' || id === 'tiles' || id === 'explore') {
      R.setItem(id, { s: Math.max(0.4, Math.min(3, start * f)) }, true);
    }
    clampItem(id);
    emit();
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragging) return;
    if (dragging.kind === 'pinch' && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      applyScale(dragging.item, dragging.startS, dist / (dragging.dist || 1), dragging.startW, dragging.startH);
      return;
    }
    if (dragging.kind === 'resize') {
      const r = itemRect(dragging.item);
      const cx = r ? r.x + r.w / 2 : dragging.x, cy = r ? r.y + r.h / 2 : dragging.y;
      const startDist = Math.hypot((dragging.rw || 80) / 2, (dragging.rh || 80) / 2) || 40;
      const nowDist = Math.hypot(e.clientX - cx, e.clientY - cy) || startDist;
      applyScale(dragging.item, dragging.startS, nowDist / startDist, dragging.startW, dragging.startH);
      return;
    }
    if (dragging.kind !== 'move') return;
    const id = dragging.item;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    if (id === 'guitar' || id === 'amp') {
      const obj = id === 'guitar' ? guitar() : amp();
      if (!obj || !dragging.startPos) return;
      const now = eventToPlane(e, dragging.startPos);
      if (!now || !dragging.startHit) {
        // fallback: slide in camera right/up
        const cam = camera();
        const k = 0.12 * (window.__dbg.G ? 1 : 1);
        const right = new THREE.Vector3(), up = new THREE.Vector3();
        right.setFromMatrixColumn(cam.matrixWorld, 0);
        up.setFromMatrixColumn(cam.matrixWorld, 1);
        const worldDx = (dx / innerWidth) * 80, worldDy = (-dy / innerHeight) * 80;
        obj.position.copy(dragging.startPos).addScaledVector(right, worldDx).addScaledVector(up, worldDy);
      } else {
        obj.position.copy(dragging.startPos).add(now.sub(dragging.startHit));
      }
      R.setItem(id, poseOf(obj), true);
      clampItem(id);
      emit();
      return;
    }
    if (id === 'panel' || id === 'title') {
      const st = dragging.start;
      R.setItem(id, { cx: (st.cx || 0) + dx / innerWidth, cy: (st.cy || 0) - dy / innerHeight }, true);
      clampItem(id);
      emit();
      return;
    }
    if (id === 'neon') {
      const st = dragging.start;
      // pointer delta in panel-local units: panel width is ~ st mapped via current rect
      const r = itemRect('panel');
      if (r && r.w > 1 && r.h > 1) {
        R.setItem(id, { lx: (st.lx || 0) + dx / r.w, ly: (st.ly || 0) - dy / r.h }, true);
      } else {
        R.setItem(id, { lx: (st.lx || 0) + dx / innerWidth, ly: (st.ly || 0) - dy / innerHeight }, true);
      }
      clampItem(id);
      emit();
      return;
    }
    if (id === 'tiles' || id === 'explore') {
      const st = dragging.start;
      R.setItem(id, { x: (st.x || 0) + dx, y: (st.y || 0) + dy }, true);
      clampItem(id);
      emit();
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    try { overlay.releasePointerCapture(e.pointerId); } catch (_) { }
    if (pointers.size === 0) dragging = null;
    else if (dragging && dragging.kind === 'pinch') dragging = null;
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
  const blockOpen = () => { try { if (window.__photoTV) window.__photoTV._leBlock = true; } catch (_) { } };
  blockOpen();

  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'le:select') select(m.id || null);
    if (m.type === 'le:set' && m.id && m.props) {
      ensureItem(m.id);
      if (m.id === 'camera') {
        const cur = Object.assign({}, readCamera(), R.active().camera, m.props);
        R.setItem('camera', cur, true);
        R.applyNow();
      } else {
        R.setItem(m.id, m.props, true);
        if (m.id === 'guitar' && guitar()) applyLivePose(guitar(), R.active().guitar);
        if (m.id === 'amp' && amp()) applyLivePose(amp(), R.active().amp);
      }
      clampItem(m.id);
      emit();
    }
    if (m.type === 'le:reset') {
      R.resetViewport(m.viewport || R.activeViewport());
      selected = null;
      emit({ reset: true, reload: true });
      // Clean auto placement is simplest after a reload of the iframe.
      location.reload();
    }
    if (m.type === 'le:ping') emit();
  });

  function applyLivePose(obj, p) {
    if (!obj || !p) return;
    if (p.x != null) obj.position.set(p.x, p.y, p.z);
    if (p.rx != null) obj.rotation.set(p.rx, p.ry, p.rz);
    if (p.s != null) obj.scale.setScalar(p.s);
  }

  let skipTimer = setInterval(() => { if (trySkipIntro()) { clearInterval(skipTimer); skipTimer = null; } }, 400);
  setTimeout(() => { if (skipTimer) { clearInterval(skipTimer); skipTimer = null; } }, 180000);

  function loop() {
    freezeOrbit();
    updateBox();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const wait = () => {
    freezeOrbit();
    if (!sceneReady() || !window.__layoutRuntime) { setTimeout(wait, 300); emit(); return; }
    freezeOrbit();
    R.applyNow();
    clampAll();
    emit({ type: 'le:state', boot: true });
    try { parent.postMessage({ type: 'le:ready', viewport: R.activeViewport(), vw: innerWidth, vh: innerHeight }, '*'); } catch (_) { }
    window.__layoutEditor = { ready: true, selected, doc: R.getDoc(), viewport: R.activeViewport() };
  };
  wait();
}
