// t457u-sign-centered (Blake ask t457u "Center the word precious memories on the panel"): photo-tv/sign-inlay.js inlaySign()
// must put the Precious Memories plaque at the horizontal centre of the photo panel (x === 0) for every layout.json neon pose
// and any lx, while keeping the rail logic: side (top if y >= 0 else bottom) and the seated y are unchanged vs 98e4c8c.
// Lettering: the canvas text is drawn textAlign 'center' at tx = w / 2 (source check on photo-tv/photo-tv.js).
// Exits nonzero on fail. Runs: Node (no browser). Runtime < 1 s.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix (98e4c8c): checks/logs/t457u-sign-centered-before.log -> FAIL (exit 1)
//   after fix:            checks/logs/t457u-sign-centered-after.log  -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inlaySign } = await import(pathToFileURL(path.join(root, 'photo-tv/sign-inlay.js')).href);

// same inputs photo-tv.js passes (SCR_W/H/R, SIGN.w, PHS = SIGN.w * 192 / 1024, NS = SCR_W * 0.46 / SIGN.w)
const SCR_W = 0.58, SCR_H = 0.40, SCR_R = 0.105, SW = 0.76, PHS = SW * 192 / 1024, NS = (SCR_W * 0.46) / SW;
const call = (lx, ly, sk, rz) => inlaySign({ x: lx * SCR_W, y: ly * SCR_H, s: NS * sk, rz, scrW: SCR_W, scrH: SCR_H, scrR: SCR_R, signW: SW, signH: PHS });

// rail y / side as seated by 98e4c8c (y depends only on side, s and rz; independent of x)
function railY(ly, sk, rz) {
  let s = NS * sk; const ca = Math.abs(Math.cos(rz)), sa = Math.abs(Math.sin(rz));
  const ext = (k) => [(SW * k / 2) * ca + (PHS * k / 2) * sa, (SW * k / 2) * sa + (PHS * k / 2) * ca];
  const hw = SCR_W / 2 + 0.023 - 0.002, hh = SCR_H / 2 + 0.023 - 0.002, R = Math.max(0.001, SCR_R + 0.023 - 0.002);
  const st = Math.max(0.001, hw - R);
  let [ex, ey] = ext(s);
  const fit = Math.min(1, hw / ex, hh / ey, st / ex);
  if (fit < 1) { s *= fit * 0.999; [ex, ey] = ext(s); }
  const side = ly * SCR_H >= 0 ? 'top' : 'bottom';
  return { side, y: side === 'top' ? hh - ey : -hh + ey };
}

const poses = [];
(function walk(o) { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (k === 'neon' && v && v.lx != null) poses.push(v); else walk(v); } })(JSON.parse(fs.readFileSync(path.join(root, 'layout.json'), 'utf8')));
if (poses.length < 2) { console.log(`FAIL expected >= 2 layout.json neon poses, found ${poses.length}`); process.exit(1); }
const cases = poses.map((p, i) => [`layout.json neon #${i}`, p.lx, p.ly, p.s != null ? p.s : 1, p.rz || 0]);
for (const lx of [-0.5, -0.236, -0.1, 0, 0.022, 0.24, 0.285, 0.5]) for (const ly of [0.5, 0.384, -0.415, -0.5]) cases.push([`lx ${lx} ly ${ly}`, lx, ly, 1, 0]);

let fail = false;
for (const [name, lx, ly, sk, rz] of cases) {
  const r = call(lx, ly, sk, rz), want = railY(ly, sk, rz);
  const ok = Math.abs(r.x) < 1e-6 && r.side === want.side && Math.abs(r.y - want.y) < 1e-9;
  if (!ok) fail = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: x=${r.x.toFixed(6)} side=${r.side} (want ${want.side}) y=${r.y.toFixed(6)} (want ${want.y.toFixed(6)})`);
}
const src = fs.readFileSync(path.join(root, 'photo-tv/photo-tv.js'), 'utf8');
const nC = (src.match(/textAlign = 'center'/g) || []).length, nT = (src.match(/const tx = w \/ 2,/g) || []).length;
const txOk = nC >= 2 && nT >= 2;
if (!txOk) fail = true;
console.log(`${txOk ? 'ok  ' : 'FAIL'} lettering centred in the plaque: textAlign center x${nC}, tx = w / 2 x${nT}`);
console.log(fail ? 'FAIL t457u-sign-centered' : 'PASS t457u-sign-centered');
process.exit(fail ? 1 : 0);
