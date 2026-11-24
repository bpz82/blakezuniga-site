// photo-tv SPEED LAYOUT (Blake 7:52-7:59 AM, hand-set by Grok): fixed home view — guitar lying flat, neck straight away from the camera
// (bridge nearest), centred; amp right; hero TV left; title top centre. Stops the slow home orbit and overrides the auto placement.
// Constants per form factor; applied once the TV is on and again after a resize. Fails soft (console.warn) like the rest of photo-tv.
const PHONE = { k: 1.75, oz: -30, pitch: 0.62, amp: [35, 0, -145], ampRy: -0.9, tv: [-40, 0, -175], tvRy: 0.55, tvS: 74, gTilt: 0.22, gLift: 4, tDist: 420, tUp: 0.43 };   // Blake 8:49/8:54: row up + bigger, guitar tilted up, TV yawed a bit back out, amp closer
const DESK  = { k: 1.85, oz: 15, pitch: 0.5, gTilt: 0.12, gLift: 2, amp: [64, 0, -52], ampRy: -0.8, tv: [-64, 0, -65], tvRy: 0.8, tvS: 74, tDist: 230, tUp: 0.40 };
let C = null, title = null, hooked = false, gB = null;
const tilt = (on) => { const G = window.__dbg && window.__dbg.G; if (!G) return; if (!gB) gB = { rx: G.rotation.x, y: G.position.y }; G.rotation.x = gB.rx + (on ? C.gTilt || 0 : 0); G.position.y = gB.y + (on ? C.gLift || 0 : 0); };   // Blake 8:54: headstock end raised
function apply() {
  try {
    const d = window.__dbg, a = window.__ampHandle && window.__ampHandle.object3d, t = window.__photoTV && window.__photoTV.object3d;
    if (!d || !d.camera || !t || document.body.dataset.mode !== 'show') return;
    C = innerWidth < 600 || innerWidth < innerHeight ? PHONE : DESK;
    window.__amp7SetHome(C.k, false, 0, C.oz); d.orbit(0, C.pitch);
    if (a) { a.position.set(...C.amp); a.rotation.y = C.ampRy; }
    tilt(true);
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
  document.addEventListener('zg:mode', (e) => { if (e.detail === 'show') setTimeout(apply, 300); else if (gB && C) tilt(false); });
}
