// t470u-panel-steady (Blake ask t470u, desktop Chrome: "on desktop the panel needs to stay kinda in one spot like how the amp does,
// right now it moves around up and down left and right too much"). The Precious Memories panel lock (photo-tv.js photo-panel-lock)
// must be world-posed like the amp (layout/index.js applyAmp -> applyPose from stored numbers): its world position / quaternion /
// scale are baked ONCE from the reference home camera (layout.json yaw / pitch on dbg.homeOrbit) into a stored pose and then applied
// camera-free. No live-camera fallback, no per-frame follow: a pointer orbit, showYaw / showPitch change or the amp-walk camera can
// never move the lock.
// (1) photo-tv/panel-pose.js (pure): applyPanelWorldPose(lock, pose) sets the lock from the pose only; steadyPanel(state, lock,
//     liveCam, refReady, bake) never reads the live camera, does nothing until the reference is ready, bakes once, then only applies.
// (2) photo-tv.js source: refCam() has no `return c` live fallback, place() never copies a live camera onto the lock, and the
//     render / onBeforeRender hooks go through steadyPanel with a stored pose.
// Exits nonzero on fail. Runs: Node (no browser). Runtime < 1 s.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix (1d248ab): checks/logs/t470u-panel-steady-before.log -> FAIL (exit 1)
//   after fix:            checks/logs/t470u-panel-steady-after.log  -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = false;
const report = (ok, msg) => { if (!ok) fail = true; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

// minimal vector / quaternion stubs (no THREE)
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; } });
const q4 = (x = 0, y = 0, z = 0, w = 1) => ({ x, y, z, w, set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; return this; },
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; this.w = o.w; return this; } });
const mkLock = () => ({ position: v3(), quaternion: q4(), scale: v3(1, 1, 1), visible: true, updateMatrixWorld() {} });
const snap = (l) => JSON.stringify([l.position.x, l.position.y, l.position.z, l.quaternion.x, l.quaternion.y, l.quaternion.z, l.quaternion.w, l.scale.x, l.scale.y, l.scale.z]);
// a camera that throws if anything reads its pose
const trapCam = (tag) => new Proxy({ isPerspectiveCamera: true }, { get(t, k) { if (k === 'position' || k === 'quaternion' || k === 'matrixWorld') throw new Error(`live camera ${tag} read: ${String(k)}`); return t[k]; } });

// (1) pure helper
const helperPath = path.join(root, 'photo-tv/panel-pose.js');
if (!fs.existsSync(helperPath)) report(false, 'photo-tv/panel-pose.js (applyPanelWorldPose / steadyPanel) missing');
else {
  const H = await import(pathToFileURL(helperPath).href);
  report(typeof H.applyPanelWorldPose === 'function' && typeof H.steadyPanel === 'function' && typeof H.bakePanelPose === 'function', 'panel-pose.js exports bakePanelPose, applyPanelWorldPose, steadyPanel');
  if (typeof H.applyPanelWorldPose === 'function' && typeof H.steadyPanel === 'function' && typeof H.bakePanelPose === 'function') {
    const pose = { p: [12, 34, -560], q: [0.1, 0.2, 0.05, Math.sqrt(1 - 0.01 - 0.04 - 0.0025)], s: [480, 330, 1] };
    const a = mkLock(); H.applyPanelWorldPose(a, pose);
    report(snap(a) === JSON.stringify([...pose.p, ...pose.q, ...pose.s]), 'applyPanelWorldPose: lock = stored pose exactly');

    // steadyPanel: before the reference is ready it must not pose from the live camera
    const st = {}; const lk = mkLock(); let bakes = 0;
    const bake = () => { bakes++; lk.position.set(1, 2, 3); lk.quaternion.set(0, 0.6, 0, 0.8); lk.scale.set(400, 300, 1); };
    let threw = null;
    try { H.steadyPanel(st, lk, trapCam('A'), false, bake); } catch (e) { threw = e.message; }
    report(!threw && bakes === 0 && !st.pose, `steadyPanel, reference not ready: no live-camera pose, no bake (${threw || 'bakes ' + bakes})`);
    report(lk.visible === false, 'steadyPanel, reference not ready: lock hidden until baked');
    try { H.steadyPanel(st, lk, trapCam('B'), true, bake); } catch (e) { threw = e.message; }
    report(!threw && bakes === 1 && !!st.pose && lk.visible === true, `steadyPanel, reference ready: baked once (${threw || 'bakes ' + bakes})`);
    const baked = snap(lk);
    // two different live cameras (pointer orbit, amp-walk) and a reference that drops out: the lock never moves, no rebake
    for (const [tag, ready] of [['pointer-orbit', true], ['amp-walk', true], ['ref-lost', false]]) {
      lk.position.set(99, 99, 99); lk.quaternion.set(0, 0, 0, 1); lk.scale.set(1, 1, 1);   // something nudged it
      try { H.steadyPanel(st, lk, trapCam(tag), ready, bake); } catch (e) { threw = e.message; }
      report(!threw && bakes === 1 && snap(lk) === baked, `steadyPanel after bake, ${tag} camera: lock = baked pose, no rebake (${threw || 'bakes ' + bakes})`);
    }
  }
}

// (2) photo-tv.js source
const src = fs.readFileSync(path.join(root, 'photo-tv/photo-tv.js'), 'utf8');
const rc = src.match(/const refCam = \([\s\S]*?\n    \};/);
report(!!rc, 'photo-tv.js: refCam() found');
if (rc) report(!/return c;/.test(rc[0]), 'refCam(): no `return c` live-camera fallback');
const pl = src.match(/const place = \([\s\S]*?\n    \};/);
report(!!pl, 'photo-tv.js: place() found');
if (pl) {
  const p = pl[0];
  report(/steadyPanel\(/.test(p), 'place(): goes through steadyPanel (stored world pose, camera-free apply)');
  // the lock may only be posed from the reference camera (refC), never from the live / hook camera (c0 / camera)
  report(!/lock\.(position|quaternion)\.copy\(\s*(c0|camera)\b/.test(p), 'place(): never copies the live camera onto the lock');
  const cDecl = p.match(/const c = ([^;]+);/);
  report(!cDecl || !/\bc0\b|\bcamera\b/.test(cDecl[1]) || /refCam\(\)/.test(cDecl[1]), `place(): pose camera is the reference camera (${cDecl ? cDecl[1] : 'n/a'})`);
  report(!/Pivot follows the camera/.test(p), 'place(): no per-frame "pivot follows the camera" path');
}
console.log(fail ? 'FAIL t470u-panel-steady' : 'PASS t470u-panel-steady');
process.exit(fail ? 1 : 0);
