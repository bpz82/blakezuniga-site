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
const TOP = 1000;
function onTop(mesh) {
  if (!document.body.classList.contains('zg-reveal-done')) return;
  const m = mesh.material;
  if (m && (m.depthTest !== false || m.depthWrite !== false || m.transparent !== true)) {
    m.depthTest = false; m.depthWrite = false; m.transparent = true; m.needsUpdate = true;
  }
  if (mesh.renderOrder < TOP) mesh.renderOrder = TOP;   // above every other mesh (the amp has transparent parts at ~50)
  const tag = mesh.getObjectByName('zg-tagline');
  if (tag && tag.renderOrder < TOP) tag.renderOrder = TOP;
}

export function place(mesh, cam, T) {
  if (!mesh || !cam || !T || T.cx == null) return;
  onTop(mesh);
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
