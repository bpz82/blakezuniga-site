// layout/title.js: billboards the ZUNIGA title mesh at a saved screen position (cx, cy, s, rz at a depth in front of
// the camera). Contract: place(mesh, cam, T) runs from the layout frame hook right before each render, so it wins
// over the per-tick word placement in index.html (zgWordTick) and keeps working while the camera orbits.
let titleMesh = null;
const fw = { x: 0, y: 0, z: 0 }, up = { x: 0, y: 0, z: 0 }, rt = { x: 0, y: 0, z: 0 };

export function find(scene) {
  if (titleMesh && titleMesh.parent) return titleMesh;
  titleMesh = null;
  if (!scene) return null;
  let tag = null, named = null, any = null;
  scene.traverse((o) => {
    if (o.name === 'zg-tagline') tag = o;
    if (o.isMesh && o.geometry && (o.geometry.type === 'TextGeometry' || o.geometry.type === 'ExtrudeGeometry')) {
      if (!named && (o.userData && o.userData.text === 'ZUNIGA' || o.name === 'ZUNIGA')) named = o;
      if (!any && o.name !== 'zg-tagline' && o.name !== 'zg-tagline-shadow') any = o;
    }
  });
  titleMesh = (tag && tag.parent && tag.parent.isMesh) ? tag.parent : (named || any);
  return titleMesh;
}

function qApply(q, x, y, z, out) {   // rotate a unit axis by a quaternion without importing THREE
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}

// Always on top (home + Explore; amp mode stays plain depth-tested): ZUNIGA + its "Folk Blues" child (one shared material) are the
// last draws of the transparent pass (renderOrder 1000 / 1001), over the amp, guitar, panel and the intro veil, at every orbit angle.
// Round 2 (Blake t418u "weird geometric things"): that used to be depthTest OFF, which let the extrusion's sides / back draw over its
// front faces. Now depthTest + depthWrite stay ON (clean letters, as 0ed7f1d) and ZUNIGA clears the depth buffer right before it
// draws (onBeforeRender), so Folk Blues (1001) is depth-tested against the letters only. Explore: index.html places the word.
const TOP = 1000, BASE_RO = 11;   // 11 = index.html's own renderOrder for the word and its tagline
const modeOf = () => document.body.dataset.mode || 'show';
function clearDepthFirst(renderer) {
  try {
    const st = renderer && renderer.state, d = st && st.buffers && st.buffers.depth;
    if (d && d.setMask) d.setMask(true);   // gl.clear honours the depth mask: the previous draw may have left it off
    renderer.clearDepth();
  } catch (_) { }
}
function setTop(mesh, on) {
  const m = mesh.material, tag = mesh.getObjectByName('zg-tagline');
  if (on) {
    if (m && (m.depthTest !== true || m.depthWrite !== true || m.transparent !== true)) {
      m.depthTest = true; m.depthWrite = true; m.transparent = true; m.needsUpdate = true;
    }
    if (mesh.renderOrder !== TOP) mesh.renderOrder = TOP;   // after every other mesh (the amp has transparent parts at ~50)
    if (tag && tag.renderOrder !== TOP + 1) tag.renderOrder = TOP + 1;   // after the clear, depth-tested against ZUNIGA only
    if (mesh.onBeforeRender !== clearDepthFirst) mesh.onBeforeRender = clearDepthFirst;
  } else {
    // back to index.html's own state: depth-tested, opaque once the fade is done
    const tr = !!(m && m.opacity < 1);
    if (m && (m.depthTest !== true || m.depthWrite !== true || m.transparent !== tr)) {
      m.depthTest = true; m.depthWrite = true; m.transparent = tr; m.needsUpdate = true;
    }
    if (mesh.renderOrder === TOP) mesh.renderOrder = BASE_RO;
    if (tag && tag.renderOrder === TOP + 1) tag.renderOrder = BASE_RO;
    if (Object.prototype.hasOwnProperty.call(mesh, 'onBeforeRender') && mesh.onBeforeRender === clearDepthFirst) delete mesh.onBeforeRender;
  }
}

// Round 2 OG intro (Blake t418u, as 0ed7f1d): 'in' / 'hold' = POP pose (screen centre, 1 / 0.78 larger, scale 0.84 -> 1), then
// 'down' eases (easeInOut, 1.5 s, by elapsed time, so a late frame never stutters it) into the saved layout pose. Folk Blues is a
// child and travels with it. index.html still owns the fade / veil / phases. Reduced motion, ?edit=1, a tap skip: saved pose.
const IN_MS = 700, FLY_MS = 1500, POP_NEAR = 0.78, POP_MAX_W = 0.9;
const I = { inAt: 0, downAt: 0, over: false };
const easeOut = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
const easeInOut = (u) => { u = Math.min(1, Math.max(0, u)); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const reducedMotion = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
const editMode = () => { try { return new URLSearchParams(location.search).get('edit') === '1'; } catch (_) { return false; } };
try {
  document.addEventListener('zg:reveal', (e) => {
    const p = e && e.detail && e.detail.phase, t = performance.now();
    if (p === 'in' && !I.inAt) I.inAt = t;
    if ((p === 'down' || p === 'widgets') && !I.downAt) I.downAt = t;
    if (p === 'done' && e.detail.skipped) I.over = true;   // a tap skips the intro: straight to the rest pose (as the OG did)
  });
} catch (_) { }
const popBox = { ok: false, w: 0, cy: 0 };
function measurePop(mesh) {   // local width of the word and the centre (y) of ZUNIGA + Folk Blues, so the pop is centred as a group
  if (popBox.ok) return popBox;
  try {
    const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    let y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y; const w = g.boundingBox.max.x - g.boundingBox.min.x;
    const tag = mesh.getObjectByName('zg-tagline');
    if (tag && tag.geometry) { if (!tag.geometry.boundingBox) tag.geometry.computeBoundingBox(); const b = tag.geometry.boundingBox; y0 = Math.min(y0, b.min.y * tag.scale.y + tag.position.y); y1 = Math.max(y1, b.max.y * tag.scale.y + tag.position.y); }
    popBox.w = w; popBox.cy = (y0 + y1) / 2; popBox.ok = w > 0;
  } catch (_) { }
  return popBox;
}
// k: 0 = POP pose, 1 = saved pose. Returns null once the intro is over (saved pose).
function introK(now) {
  if (I.over) return null;
  const done = document.body.classList.contains('zg-reveal-done'), ph = document.body.dataset.reveal || '';
  if (reducedMotion() || editMode()) { I.over = true; return null; }
  if (I.downAt) { const u = (now - I.downAt) / FLY_MS; if (u >= 1) { I.over = true; return null; } return easeInOut(u); }
  if (ph === 'down') { I.downAt = now; return 0; }   // module hooked late: start the fly from here
  if (done) { I.over = true; return null; }          // reveal finished without a 'down' (word failed / skipped): saved pose
  return 0;                                           // pending / wait / in / hold: the pop pose
}

function billboard(mesh, cam, D, cx, cy, s, rz) {
  const th = Math.tan(cam.fov * Math.PI / 360);
  const Hv = 2 * D * th, Wv = Hv * cam.aspect;
  const q = cam.quaternion;
  qApply(q, 0, 0, -1, fw); qApply(q, 0, 1, 0, up); qApply(q, 1, 0, 0, rt);
  const p = cam.position;
  mesh.position.set(p.x + fw.x * D + up.x * Hv * cy + rt.x * Wv * cx,
                    p.y + fw.y * D + up.y * Hv * cy + rt.y * Wv * cx,
                    p.z + fw.z * D + up.z * Hv * cy + rt.z * Wv * cx);
  mesh.quaternion.copy(cam.quaternion);
  if (rz) mesh.rotateZ(rz);
  if (s != null) mesh.scale.setScalar(s);
  mesh.updateMatrixWorld(true);
}

export function place(mesh, cam, T) {
  if (!mesh || !cam || !T || T.cx == null) return;
  const mode = modeOf();
  // Explore: the floating word from index.html places it (pre-layout behaviour), drawn on top so the guitar never cuts into it
  if (mode === 'walk') { setTop(mesh, true); return; }
  setTop(mesh, mode === 'show');
  const D = T.depth || 420;
  if (I.s0 == null) I.s0 = mesh.scale.x;   // only used when the layout has no saved scale
  // Blake t452u: the saved scale is tuned for home fov 38; at amp / walk fov (72+) scale it so the on-screen size matches the home pose
  const fk = Math.tan(cam.fov * Math.PI / 360) / Math.tan(38 * Math.PI / 360);
  const cx = T.cx || 0, cy = T.cy || 0, s = (T.s != null ? T.s : I.s0) * fk, rz = T.rz || 0;
  const now = performance.now();
  const k = mode === 'show' ? introK(now) : null;
  if (k === null) { billboard(mesh, cam, D, cx, cy, T.s != null ? T.s * fk : null, rz); return; }
  // POP pose: screen centre (the ZUNIGA + Folk Blues group centred), POP_NEAR closer = 1 / 0.78 larger, capped to 90 % of the width
  const th = Math.tan(cam.fov * Math.PI / 360), Hv = 2 * D * th, Wv = Hv * cam.aspect, pb = measurePop(mesh);
  let ks = 1 / POP_NEAR;
  if (pb.ok && s > 0) ks = Math.min(ks, Math.max(1, POP_MAX_W * Wv / (pb.w * s)));
  const inU = I.inAt ? (now - I.inAt) / IN_MS : 0;
  const popS = s * ks * (k === 0 && !I.downAt ? 0.84 + 0.16 * easeOut(inU) : 1);
  const popCy = pb.ok ? -pb.cy * s * ks / Hv : 0;
  billboard(mesh, cam, D, cx * k, popCy + (cy - popCy) * k, popS + (s - popS) * k, rz * k);
}
