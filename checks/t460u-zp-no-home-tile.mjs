// t460u-zp-no-home-tile (Blake t460u, supersedes the spec's tile): Zuniga Philosophy has NO home-page button, tile, label or apps-row
// link. It is reachable only by direct URL (apps/zuniga-philosophy/index.html, optional index.html?zp=1).
//  - widget-ids.js: 'zuniga-philosophy' not in ACTIVE (nor RETIRED: the id is unused, so a later tile could still claim it);
//  - widgets.js: no zuniga-philosophy id/import/icon and the exported `widgets` list has no such id or title;
//  - widgets.js, widget-ids.js, harness.js, index.html: no "Zuniga Philosophy" label (any case), no href / iconSrc / src to
//    apps/zuniga-philosophy/; in index.html the only mention is the ?zp=1 query hook (a dynamic import, no element, no label);
//  - zp-hook.js adds nothing to the home chrome unless ?zp=1 (it only appends its own overlay when the query is present);
//  - the direct-URL page exists and mounts the module.
// Runs: Node (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the build because the direct-URL page is absent, PASS after):
//   checks/logs/t460u-zp-no-home-tile-before.log -> FAIL, checks/logs/t460u-zp-no-home-tile-after.log -> PASS
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const read = (f) => readFileSync(path.join(root, f), 'utf8');

const ids = await import(pathToFileURL(path.join(root, 'widget-ids.js')).href);
t("widget-ids.js: 'zuniga-philosophy' not in ACTIVE", !ids.ACTIVE.includes('zuniga-philosophy'));
t("widget-ids.js: 'zuniga-philosophy' not in RETIRED", !ids.RETIRED.includes('zuniga-philosophy'));
const w = await import(pathToFileURL(path.join(root, 'widgets.js')).href);
t('widgets.js: exported widgets have no Zuniga Philosophy id or title', w.widgets.every((x) => !/zuniga-philosophy/i.test(x.id) && !/philosophy/i.test(x.title || '') && !/zuniga-philosophy/.test(x.iconSrc || '')));
t('widgets.js: no zuniga-philosophy reference at all', !/zuniga-philosophy|Zuniga\s*Philosophy|mountZunigaPhilosophy/i.test(read('widgets.js')));

for (const f of ['widgets.js', 'widget-ids.js', 'harness.js', 'index.html']) {
  const s = read(f);
  t(`${f}: no "Zuniga Philosophy" label`, !/Zuniga\s*Philosophy/i.test(s));
  t(`${f}: no href / src / iconSrc to apps/zuniga-philosophy/`, !/(href|src|iconSrc)\s*[=:]\s*["'`][^"'`]*zuniga-philosophy/i.test(s) && !/location\.(href|assign)[^;]*zuniga-philosophy/.test(s));
}
const html = read('index.html');
const lines = html.split('\n').filter((l) => /zuniga-philosophy|zp-hook/i.test(l));
t(`index.html: only the ?zp=1 query hook mentions the app (${lines.length} line)`, lines.length <= 1 && lines.every((l) => /get\('zp'\)\s*===\s*'1'\)\s*import\('\.\/apps\/zuniga-philosophy\/zp-hook\.js'\)/.test(l) && !/<(a|button|img|li|div)\b/i.test(l.replace(/^<script type="module">|<\/script>$/g, ''))));

const hookPath = path.join(root, 'apps/zuniga-philosophy/zp-hook.js');
if (existsSync(hookPath)) {
  const hook = readFileSync(hookPath, 'utf8');
  t("zp-hook.js: opens only under ?zp=1", /get\('zp'\)\s*===\s*'1'/.test(hook) && /if \(typeof document !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams\(location\.search\)\.get\('zp'\) === '1'\)/.test(hook));
  t('zp-hook.js: does not touch the home apps row / harness', !/harness|register\(|zg-ring|zg-apps|widgets\.js/.test(hook));
}
const page = path.join(root, 'apps/zuniga-philosophy/index.html');
t('direct URL apps/zuniga-philosophy/index.html exists and mounts the module', existsSync(page) && /mountZunigaPhilosophy\(/.test(readFileSync(page, 'utf8')));
const sitemap = existsSync(path.join(root, 'sitemap.xml')) ? read('sitemap.xml') : '';
t('sitemap.xml does not list the app (preview, direct URL only)', !/zuniga-philosophy/i.test(sitemap));
console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
