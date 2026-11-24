// photo-tv SPEED LAYOUT (Blake 7:52-7:59 AM, hand-set by Grok): fixed home view — guitar lying flat, neck straight away from the camera
// (bridge nearest), centred; amp right; hero TV left; title top centre. Stops the slow home orbit and overrides the auto placement.
// Constants per form factor; applied once the TV is on and again after a resize. Fails soft (console.warn) like the rest of photo-tv.
const PHONE = { k: 1.75, oz: -30, pitch: 0.62, amp: [34, 0, -92], ampS: 2.45, ampRy: -0.9, tv: [-40, 0, -95], tvRy: 0.55, tvS: 60, gTilt: 0.22, gLift: 4, tDist: 420, tUp: 0.43 };   // Blake 9:09: TV + amp down beside the guitar neck (a bit smaller so they fit the width; amp fully on screen)
const SHORT = Object.assign({}, PHONE, { k: 2.15, oz: -5 });   // Blake 9:04: short phones (height < 760): camera back, row clear of the title and tiles
const DESK  = { k: 1.85, oz: 15, pitch: 0.5, gTilt: 0.12, gLift: 2, amp: [64, 0, -52], ampRy: -0.8, tv: [-64, 0, -65], tvRy: 0.8, tvS: 74, tDist: 230, tUp: 0.40, tSc: 0.83 };   // tSc: Blake 9:04, title size of 6368f15 (the scene's own fit shrank it once the headstock rose)
let C = null, title = null, hooked = false, gB = null;
let tw = 0;
const tilt = (on) => {   // Blake 8:54: headstock end raised on the home view; Blake 9:09: eases back to flat for Explore and returns on home
  const G = window.__dbg && window.__dbg.G; if (!G || !C) return; if (!gB) gB = { rx: G.rotation.x, y: G.position.y };
  const r0 = G.rotation.x, y0 = G.position.y, r1 = gB.rx + (on ? C.gTilt || 0 : 0), y1 = gB.y + (on ? C.gLift || 0 : 0), t0 = performance.now(), id = ++tw;
  const step = () => { if (id !== tw) return; const k = Math.min(1, (performance.now() - t0) / 700), e = k * k * (3 - 2 * k);
    G.rotation.x = r0 + (r1 - r0) * e; G.position.y = y0 + (y1 - y0) * e; if (k < 1) requestAnimationFrame(step); };
  step();
};
function apply() {
  try {
    const d = window.__dbg, a = window.__ampHandle && window.__ampHandle.object3d, t = window.__photoTV && window.__photoTV.object3d;
    if (!d || !d.camera || !t || document.body.dataset.mode !== 'show') return;
    C = innerWidth < 600 || innerWidth < innerHeight ? (innerHeight < 760 ? SHORT : PHONE) : DESK;
    window.__amp7SetHome(C.k, false, 0, C.oz); d.orbit(0, C.pitch);
    if (a) { a.position.set(...C.amp); a.rotation.y = C.ampRy; a.scale.setScalar(C.ampS || 3); }
    tilt(true);
    t.position.set(...C.tv); t.rotation.y = C.tvRy; t.scale.setScalar(C.tvS);
    if (!title) d.scene.traverse((o) => { if (!title && o.isMesh && o.geometry && o.geometry.type === 'TextGeometry' && o.name === '') title = o; });
    if (!hooked && title) {
      hooked = true; const r = d.renderer, orig = r.render.bind(r), V = d.camera.position.constructor, f = new V(), u = new V();
      r.render = (s, c) => {
        if (C && c === d.camera && document.body.dataset.mode === 'show') {
          f.set(0, 0, -1).applyQuaternion(c.quaternion); u.set(0, 1, 0).applyQuaternion(c.quaternion);
          title.position.copy(c.position).addScaledVector(f, C.tDist).addScaledVector(u, C.tDist * Math.tan(c.fov * Math.PI / 360) * C.tUp * 2);
          title.quaternion.copy(c.quaternion); if (C.tSc) title.scale.setScalar(C.tSc); title.updateMatrixWorld(true);
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
