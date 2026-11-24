// layout/index.js: home layout module entry. Loads layout.json (and, with ?edit=1, the editor's localStorage working
// copy), then each rendered frame: camera hold-then-orbit, guitar/amp poses, title billboard.
//
// Module map
//   doc.js     layout document, viewport, localStorage working copy
//   dom.js     Explore button / apps row offsets (+ edit-only clamp)
//   camera.js  hold at layout.json camera, then the normal home orbit ~17 s after everything loaded
//   pose.js    guitar + amp poses; guitar eases flat for Explore
//   title.js   ZUNIGA title billboard
// The photo panel and its neon sign are placed by photo-tv/photo-tv.js (it reads window.__homeLayout.panel / .neon).
// The editor imports this module through layout-runtime.js (a re-export shim), same API as before.
import * as Doc from './doc.js';
import * as Dom from './dom.js';
import * as Cam from './camera.js';
import * as Pose from './pose.js';
import * as Title from './title.js';

export { emptyDoc, viewportOf, isEdit, getDoc, getFileDoc, activeViewport, active, setDoc, setItem, resetViewport, saveLocal, toJSON } from './doc.js';
export { MIN_S, MAX_S, VIEW_MARGIN, MIN_PX, nudgeIntoView } from './dom.js';

let hooked = false;

function applyAmp(L) {
  const amp = window.__ampHandle && window.__ampHandle.object3d;
  if (L.amp) Pose.applyPose(amp, L.amp);
}

export function applyNow() {
  Doc.publish();
  const d = window.__dbg;
  if (!d || !d.G) return;
  const L = Doc.active();
  Pose.frame(d, L, performance.now());
  Cam.tick(L, d);
  applyAmp(L);
  Dom.applyDom(L);
}

// Runs from scene.onBeforeRender, i.e. right before every render of the main scene (after the per-tick placement).
function onFrame(cam) {
  const d = window.__dbg;
  if (!d) return;
  const L = Doc.active();
  window.__homeLayout = L;
  Cam.tick(L, d);
  Pose.frame(d, L, performance.now());
  applyAmp(L);
  if (L.title && L.title.cx != null) Title.place(Title.find(d.scene), cam || d.camera, L.title);
}

function hookFrame() {
  if (hooked) return;
  const d = window.__dbg;
  if (!d || !d.scene) return;
  hooked = true;
  const prev = d.scene.onBeforeRender;
  d.scene.onBeforeRender = function (renderer, scene, camera) {
    try { onFrame(camera); } catch (_) { }
    if (typeof prev === 'function') return prev.apply(this, arguments);
  };
}

function start() {
  const go = () => {
    const d = window.__dbg;
    if (!(d && d.camera && d.G && d.ready)) { setTimeout(go, 200); return; }
    Pose.capture(d);   // the guitar's built pose + walker spot, before any saved pose is applied
    hookFrame();
    applyNow();
    window.__layoutRuntime = { ready: true, orbit: Cam.state, walk: () => ({ k: Pose.easeK(), hold: !!window.__homeWalkHold }) };
  };
  go();
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { Doc.publish(); applyNow(); }, 200); });
}

Doc.onChange(applyNow);
(async function boot() {
  await Doc.load(new URL('../layout.json', import.meta.url).href);
  start();
})();
