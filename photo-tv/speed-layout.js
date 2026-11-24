// photo-tv SPEED LAYOUT (Blake 7:52-7:59 AM, hand-set by Grok): fixed home view — guitar lying flat, neck straight away from the camera
// (bridge nearest), centred; amp right; hero TV left; title top centre. Stops the slow home orbit and overrides the auto placement.
// Constants per form factor; applied once the TV is on and again after a resize. Fails soft (console.warn) like the rest of photo-tv.
const PHONE = { k: 2.0, oz: -65, pitch: 0.62, amp: [44, 0, -40], ampRy: -0.85, tv: [-22, 0, -150], tvRy: 0.7, tvS: 118, tDist: 420, tUp: 0.43 };   // Blake 8:27: TV + amp yawed in toward the guitar
const DESK  = { k: 1.85, oz: 15, pitch: 0.5, amp: [68, 0, -65], ampRy: -0.8, tv: [-72, 0, -70], tvRy: 0.8, tvS: 75, tDist: 230, tUp: 0.33 };
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
