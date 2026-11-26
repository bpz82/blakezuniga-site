// t468u-launch-no-zp (Blake ask t468u "Make sure the most recent website is live but don't include philosophy"):
// The launch/published tree must not contain Zuniga Philosophy: no apps/zuniga-philosophy/ directory or files,
// no zp-hook.js, and no ?zp=1 hook in index.html or the home/widget sources (widgets.js, widget-ids.js,
// harness.js, sitemap.xml, 404.html). Mentions inside checks/ do not count.
// Optional root: argv[2] or $CHECK_ROOT, else the repo root (parent of checks/).
// Exits nonzero on fail. Runs: Node (no browser). Runtime < 1 s.
// Evidence (new check: FAIL before the launch-without-ZP tree, PASS after):
//   before (preview head fe8aea0, has ZP): checks/logs/t468u-launch-no-zp-before.log -> FAIL (exit 1)
//   after  (launch candidate, no ZP):      checks/logs/t468u-launch-no-zp-after.log  -> PASS (exit 0)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const checksDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || process.env.CHECK_ROOT || path.join(checksDir, '..'));

let fails = 0;
const t = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

const zpDir = path.join(root, 'apps', 'zuniga-philosophy');
let zpFiles = [];
if (fs.existsSync(zpDir)) {
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else zpFiles.push(path.relative(root, p));
    }
  };
  walk(zpDir);
}
t('apps/zuniga-philosophy/ absent', !fs.existsSync(zpDir) && zpFiles.length === 0,
  zpFiles.length ? `${zpFiles.length} file(s): ${zpFiles.slice(0, 8).join(', ')}${zpFiles.length > 8 ? '…' : ''}` : '');

const hookFiles = [];
const walkHooks = (d, relBase = '') => {
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const ent of ents) {
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'checks') continue;
    const p = path.join(d, ent.name);
    const rel = relBase ? relBase + '/' + ent.name : ent.name;
    if (ent.isDirectory()) walkHooks(p, rel);
    else if (ent.name === 'zp-hook.js' || ent.name.endsWith('/zp-hook.js')) hookFiles.push(rel);
  }
};
walkHooks(root);
t('no zp-hook.js file', hookFiles.length === 0, hookFiles.join(', '));

const hookRe = /zp-hook\.js|\bzuniga-philosophy\b|\?zp=1|get\(\s*['"]zp['"]\s*\)/;
const scanList = [
  'index.html', 'widgets.js', 'widget-ids.js', 'harness.js', 'sitemap.xml', '404.html',
  'chrome.js', 'chrome.css', 'layout-runtime.js', 'layout/index.js',
];
for (const rel of scanList) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.log(`skip ${rel} (not present)`);
    continue;
  }
  const src = fs.readFileSync(p, 'utf8');
  const hit = src.match(hookRe);
  t(`${rel} has no ZP hook`, !hit, hit ? `matched ${hit[0]}` : '');
}

console.log(fails ? 'FAIL t468u-launch-no-zp' : 'PASS t468u-launch-no-zp');
process.exit(fails ? 1 : 0);
