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

export function place(mesh, cam, T) {
  if (!mesh || !cam || !T || T.cx == null) return;
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
