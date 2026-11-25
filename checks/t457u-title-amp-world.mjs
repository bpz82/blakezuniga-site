// t457u-title-amp-world (Blake ask t457u "Zuniga folk blues needs to stay in the air over by the guitar even when I switch to the
// amp"): in amp mode the ZUNIGA title must float in WORLD space by the guitar like Explore (walk), not be billboarded to the amp
// camera. (1) layout/title.js place() in body mode 'amp' must not move / rotate / scale the mesh (zgWordTick places it) and must
// keep it on top like walk. (2) index.html's zgWordTick must hand the word tick mode 'walk' while body[data-mode] is 'amp' (the
// page's own `mode` stays 'show' there, which made the word re-fit to the amp camera frustum), and leave show / walk unchanged.
// Exits nonzero on fail. Runs: Node (no browser). Runtime < 1 s.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix (98e4c8c): checks/logs/t457u-title-amp-world-before.log -> FAIL (exit 1)
//   after fix:            checks/logs/t457u-title-amp-world-after.log  -> PASS (exit 0)
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

// (1) place() in amp mode leaves the world pose alone
const T = { cx: 0.1, cy: 0.2, s: 3.7, rz: 0.05, depth: 420 };
for (const fov of [38, 72, 95]) {
  body.dataset.mode = 'amp';
  const calls = [];
  const mat = { depthTest: true, depthWrite: true, transparent: false, opacity: 1 };
  const mesh = { scale: { x: 1, setScalar() { calls.push('scale'); } }, position: { set() { calls.push('position'); } },
    quaternion: { copy() { calls.push('quaternion'); } }, material: mat, renderOrder: 11, rotateZ() { calls.push('rotateZ'); },
    updateMatrixWorld() {}, getObjectByName: () => null };
  const cam = { fov, aspect: 1.5, position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  place(mesh, cam, T);
  report(calls.length === 0, `place() mode amp fov ${fov}: mesh untouched (calls: ${calls.join(',') || 'none'})`);
  report(mesh.renderOrder === 1000, `place() mode amp fov ${fov}: drawn on top like walk (renderOrder ${mesh.renderOrder})`);
}

// (2) index.html zgWordTick: amp -> walk for the word tick
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/zgWordTick = function zgWordTick\(dt, camera, mode\) \{[\s\S]*?\n\}/);
if (!m) report(false, 'index.html: zgWordTick wrapper not found');
else {
  const seen = [];
  const zgW = { tick: (dt, cam, md) => seen.push(md) };
  const fn = new Function('zgW', 'document', 'let zgWordTick; ' + m[0] + '; return zgWordTick;')(zgW, globalThis.document);
  for (const [bodyMode, pageMode, want] of [['amp', 'show', 'walk'], ['amp', 'walk', 'walk'], ['show', 'show', 'show'], ['walk', 'walk', 'walk']]) {
    body.dataset.mode = bodyMode; seen.length = 0; fn(0.016, {}, pageMode);
    report(seen[0] === want, `zgWordTick body ${bodyMode} page ${pageMode}: word tick mode ${seen[0]} (want ${want})`);
  }
}
console.log(fail ? 'FAIL t457u-title-amp-world' : 'PASS t457u-title-amp-world');
process.exit(fail ? 1 : 0);
