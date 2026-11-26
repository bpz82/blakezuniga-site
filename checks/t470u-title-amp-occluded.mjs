// t470u-title-amp-occluded (Blake ask t470u, desktop Chrome amp view: "this needs to disappear in any spots the amp would block
// regular vision" - the ZUNIGA / Folk Blues title drew on top of the amp's top surface). In body mode 'amp', layout/title.js place()
// must leave the world pose alone (t457u: the word stays in the air by the guitar) but must NOT use the on-top path: depthTest and
// depthWrite stay on, renderOrder is not the on-top 1000 (back to BASE_RO 11), and no depth-clearing onBeforeRender hook, so the amp
// occludes the title. Walk / Explore keeps the on-top path (renderOrder 1000 + clear hook) unchanged.
// Exits nonzero on fail. Runs: Node (no browser). Runtime < 1 s.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix (1d248ab): checks/logs/t470u-title-amp-occluded-before.log -> FAIL (exit 1)
//   after fix:            checks/logs/t470u-title-amp-occluded-after.log  -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = { dataset: { mode: 'show' }, classList: { contains: (c) => c === 'zg-reveal-done' } };
globalThis.document = { body, addEventListener() {} };
globalThis.window = {};
globalThis.location = { search: '' };
const { place } = await import(pathToFileURL(path.join(root, 'layout/title.js')).href);

let fail = false;
const report = (ok, msg) => { if (!ok) fail = true; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const T = { cx: 0.1, cy: 0.2, s: 3.7, rz: 0.05, depth: 420 };
const mk = (calls) => {
  const mat = { depthTest: true, depthWrite: true, transparent: false, opacity: 1 };
  const tag = { renderOrder: 11 };
  return { scale: { x: 1, setScalar() { calls.push('scale'); } }, position: { set() { calls.push('position'); } },
    quaternion: { copy() { calls.push('quaternion'); } }, material: mat, renderOrder: 11, rotateZ() { calls.push('rotateZ'); },
    updateMatrixWorld() {}, getObjectByName: (n) => (n === 'zg-tagline' ? tag : null), tag };
};
const cam = { fov: 72, aspect: 1.5, position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };

// (1) walk first (on-top path, as today), capture the clear hook
body.dataset.mode = 'walk';
const wc = [], wm = mk(wc); place(wm, cam, T);
const clearHook = Object.prototype.hasOwnProperty.call(wm, 'onBeforeRender') ? wm.onBeforeRender : null;
report(wm.renderOrder === 1000, `walk: on top (renderOrder ${wm.renderOrder}, want 1000)`);
report(typeof clearHook === 'function', 'walk: depth-clear onBeforeRender hook set (Explore unchanged)');
report(wc.length === 0, `walk: mesh pose untouched (calls: ${wc.join(',') || 'none'})`);

// (2) amp, fresh mesh and a mesh coming from walk (leftover on-top state must be cleared)
for (const [label, prep] of [['fresh', null], ['after walk', 'walk'], ['after show', 'show']]) {
  const calls = [], m = mk(calls);
  if (prep) { body.dataset.mode = prep; place(m, cam, T); }
  calls.length = 0;
  body.dataset.mode = 'amp';
  place(m, cam, T);
  report(calls.length === 0, `amp (${label}): mesh pose untouched (calls: ${calls.join(',') || 'none'})`);
  report(m.material.depthTest === true && m.material.depthWrite === true, `amp (${label}): depthTest ${m.material.depthTest} depthWrite ${m.material.depthWrite}`);
  report(m.renderOrder !== 1000 && m.renderOrder === 11, `amp (${label}): renderOrder ${m.renderOrder} (want BASE_RO 11, not on-top 1000)`);
  report(m.tag.renderOrder !== 1001, `amp (${label}): Folk Blues renderOrder ${m.tag.renderOrder} (not on-top 1001)`);
  const hook = Object.prototype.hasOwnProperty.call(m, 'onBeforeRender') ? m.onBeforeRender : undefined;
  report(hook === undefined || (clearHook && hook !== clearHook), `amp (${label}): no depth-clearing onBeforeRender`);
}

// (3) source: place() must not route amp through setTop(mesh, true)
const src = fs.readFileSync(path.join(root, 'layout/title.js'), 'utf8');
const pm = src.match(/export function place\([\s\S]*?\n\}/);
if (!pm) report(false, 'title.js: place() not found');
else {
  const lines = pm[0].split('\n');
  const bad = lines.filter((l) => /'amp'/.test(l) && /setTop\(\s*mesh\s*,\s*true\s*\)/.test(l));
  report(bad.length === 0, `title.js place(): no setTop(mesh, true) on an amp line (${bad.length} found)`);
  const ampClear = lines.filter((l) => /'amp'/.test(l) && /clearDepth/.test(l));
  report(ampClear.length === 0, 'title.js place(): no clearDepth for amp');
}
console.log(fail ? 'FAIL t470u-title-amp-occluded' : 'PASS t470u-title-amp-occluded');
process.exit(fail ? 1 : 0);
