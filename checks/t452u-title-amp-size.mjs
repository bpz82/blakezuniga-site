// RETIRED (t457u MEASUREMENT CHANGE, Nov 25 2026): Blake t457u "Zuniga folk blues needs to stay in the air over by the guitar even
// when I switch to the amp". In amp mode place() no longer billboards the title to the camera (it returns early like walk; the
// word floats in world space via index.html zgWordTick), so a screen-size ratio in amp mode no longer measures anything. Kept
// for the record, not gating; replaced by checks/t457u-title-amp-world.mjs. The fov factor stays in show mode (fov 38 -> 1).
// t452u-title-amp-size (Blake ask t452u): the ZUNIGA title's saved layout scale is tuned for home fov 38. At amp/walk fov 72+
// place() must scale it by tan(fov/2)/tan(19deg) so its ON-SCREEN size matches the home pose at any fov. Exits nonzero on fail.
// Runs: Node (no browser). Runtime < 1 s.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix: checks/logs/t452u-title-amp-size-before.log  -> FAIL (exit 1)
//   after fix:  checks/logs/t452u-title-amp-size-after.log   -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = { dataset: { mode: 'show' }, classList: { contains: (c) => c === 'zg-reveal-done' } };
globalThis.document = { body, addEventListener() {} };
globalThis.window = {};
globalThis.location = { search: '' };
const { place } = await import(pathToFileURL(path.join(root, 'layout/title.js')).href);

const T = { cx: 0.1, cy: 0.2, s: 3.7, rz: 0, depth: 420 };
function size(fov, mode) {
  body.dataset.mode = mode;
  const mesh = { scale: { x: 1, setScalar(v) { this.x = v; } }, position: { set() {} }, quaternion: { copy() {} },
    material: null, renderOrder: 0, rotateZ() {}, updateMatrixWorld() {}, getObjectByName: () => null };
  const cam = { fov, aspect: 1.5, position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  place(mesh, cam, T);
  // on-screen height fraction = world scale / visible height at depth D
  return mesh.scale.x / (2 * T.depth * Math.tan(fov * Math.PI / 360));
}
const home = size(38, 'show');
let fail = false;
for (const [fov, mode] of [[38, 'show'], [72, 'amp'], [95, 'amp'], [72, 'show'], [95, 'show']]) {
  const r = size(fov, mode) / home;
  const ok = Math.abs(r - 1) <= 0.01;
  if (!ok) fail = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} fov ${fov} mode ${mode}: on-screen size ratio vs home = ${r.toFixed(4)}`);
}
console.log(fail ? 'FAIL t452u-title-amp-size' : 'PASS t452u-title-amp-size');
process.exit(fail ? 1 : 0);
