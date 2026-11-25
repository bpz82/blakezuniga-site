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

// Always on top: once the intro reveal is done the letters (ZUNIGA + the "Folk Blues" child, they share one material) are drawn
// after, and without a depth test against, the amp / guitar / panel, so nothing can hide them at any orbit angle. The billboard
// placement is NOT moved. Stays transparent (opacity 1) so it lands in the transparent pass, which draws after all opaque
// meshes and is sorted by renderOrder (title 1000 > everything else); depthWrite off so it punches no hole in later draws.
// The tagline shadow stays depth-tested (it is a soft drop shadow, drawn under the letters at renderOrder 10).
// Before the reveal is done the intro veil/fade (renderOrder 10, depthTest false) is left exactly as index.html built it.
// Polish (Blake t405u):
//  - "Folk Blues needs to pop up with ZUNIGA": the on-top treatment now also covers the intro (in / hold / down) in the home view.
//    Before, during the intro the letters were depth-tested against the amp / guitar that sit (invisible) behind the black veil,
//    so the lower line (Folk Blues) was cut out until zg-reveal-done. The veil is renderOrder 10 without a depth test; the
//    letters at 1000 draw over it exactly as before, the fade (material opacity) is untouched.
//  - "In Explore the title gets small": Explore (mode 'walk') no longer uses the home billboard at all. The billboard keeps a
//    fixed world scale at 420 units in front of the camera, so with the wide Explore lens (fov up to 95) it became a small speck
//    in the black far away. In Explore the site's own floating word (index.html zgWordTick: frozen in the world over the guitar,
//    as before the layout module) places it again, big over the guitar, and it stays on top so the strings / body never cut into
//    Folk Blues. Amp mode keeps the 6cf3945 billboard, depth-tested. Home placement and layout.json are unchanged.
const TOP = 1000, BASE_RO = 11;   // 11 = index.html's own renderOrder for the word and its tagline
const modeOf = () => document.body.dataset.mode || 'show';
function setTop(mesh, on) {
  const m = mesh.material, tag = mesh.getObjectByName('zg-tagline');
  if (on) {
    if (m && (m.depthTest !== false || m.depthWrite !== false || m.transparent !== true)) {
      m.depthTest = false; m.depthWrite = false; m.transparent = true; m.needsUpdate = true;
    }
    if (mesh.renderOrder < TOP) mesh.renderOrder = TOP;   // above every other mesh (the amp has transparent parts at ~50)
    if (tag && tag.renderOrder < TOP) tag.renderOrder = TOP;
  } else {
    // back to index.html's own state: depth-tested, opaque once the fade is done
    const tr = !!(m && m.opacity < 1);
    if (m && (m.depthTest !== true || m.depthWrite !== true || m.transparent !== tr)) {
      m.depthTest = true; m.depthWrite = true; m.transparent = tr; m.needsUpdate = true;
    }
    if (mesh.renderOrder === TOP) mesh.renderOrder = BASE_RO;
    if (tag && tag.renderOrder === TOP) tag.renderOrder = BASE_RO;
  }
}

export function place(mesh, cam, T) {
  if (!mesh || !cam || !T || T.cx == null) return;
  const mode = modeOf();
  // Explore: the floating word from index.html places it (pre-layout behaviour), drawn on top so the guitar never cuts into it
  if (mode === 'walk') { setTop(mesh, true); return; }
  setTop(mesh, mode === 'show');
  const D = T.depth || 420;
  const th = Math.tan(cam.fov * Math.PI / 360);
  const Hv = 2 * D * th, Wv = Hv * cam.aspect;
  const q = cam.quaternion;
  qApply(q, 0, 0, -1, fw); qApply(q, 0, 1, 0, up); qApply(q, 1, 0, 0, rt);
  const cx = T.cx || 0, cy = T.cy || 0, p = cam.position;
  mesh.position.set(p.x + fw.x * D + up.x * Hv * cy + rt.x * Wv * cx,
                    p.y + fw.y * D + up.y * Hv * cy + rt.y * Wv * cx,
                    p.z + fw.z * D + up.z * Hv * cy + rt.z * Wv * cx);
  mesh.quaternion.copy(cam.quaternion);
  if (T.rz) mesh.rotateZ(T.rz);
  if (T.s != null) mesh.scale.setScalar(T.s);
  mesh.updateMatrixWorld(true);
}
