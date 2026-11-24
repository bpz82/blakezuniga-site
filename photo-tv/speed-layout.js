// photo-tv SPEED LAYOUT (Blake 7:52-7:59 AM, hand-set by Grok): fixed home view — guitar lying flat, neck straight away from the camera
// (bridge nearest), centred; amp right; hero TV left; title top centre. Stops the slow home orbit and overrides the auto placement.
// Constants per form factor; applied once the TV is on and again after a resize. Fails soft (console.warn) like the rest of photo-tv.
const PHONE = { k: 2.1, oz: -60, pitch: 0.62, amp: [52, 0, -25], ampRy: -0.35, tv: [-32, 0, -190], tvRy: 0.3, tvS: 112, tDist: 420, tUp: 0.43 };
const DESK  = { k: 2.0, oz: 0,   pitch: 0.5,  amp: [100, 0, -50], ampRy: -0.3, tv: [-90, 0, -95], tvRy: 0.45, tvS: 80, tDist: 230, tUp: 0.33 };
let C = null, title = null, hooked = false;
function apply() {
  try {
    const d = window.__dbg, a = window.__ampHandle && window.__ampHandle.object3d, t = window.__photoTV && window.__photoTV.object3d;
    if (!d || !d.camera || !t || document.body.dataset.mode !== 'show') return;
    C = innerWidth < 600 || innerWidth < innerHeight ? PHONE : DESK;
    window.__amp7SetHome(C.k, false, 0, C.oz); d.orbit(0, C.pitch);
    if (a) { a.position.set(...C.amp); a.rotation.y = C.ampRy; }
    t.position.set(...C.tv); t.rotation.y = C.tvRy; t.scale.setScalar(C.tvS);
    if (!title) d.scene.traverse((o) => { if (!title && o.isMesh && o.geometry && o.geometry.type === 'TextGeometry' && o.name === '') title = o; });
    if (!hooked && title) {
      hooked = true; const r = d.renderer, orig = r.render.bind(r), V = d.camera.position.constructor, f = new V(), u = new V();
      r.render = (s, c) => {
        if (C && c === d.camera && document.body.dataset.mode === 'show') {
          f.set(0, 0, -1).applyQuaternion(c.quaternion); u.set(0, 1, 0).applyQuaternion(c.quaternion);
          title.position.copy(c.position).addScaledVector(f, C.tDist).addScaledVector(u, C.tDist * Math.tan(c.fov * Math.PI / 360) * C.tUp * 2);
          title.quaternion.copy(c.quaternion); title.updateMatrixWorld(true);
        }
        return orig(s, c);
      };
    }
    window.__speedLayout = { applied: Date.now(), C };
  } catch (e) { console.warn('[photo-tv] speed layout', e); }
}
export function startSpeedLayout() {
  const wait = () => { if (window.__photoTV && window.__photoTV.state === 'on') apply(); else setTimeout(wait, 300); };
  wait();
  let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(apply, 600); });
  document.addEventListener('zg:mode', (e) => { if (e.detail === 'show') setTimeout(apply, 300); });
}
