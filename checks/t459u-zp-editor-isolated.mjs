// t459u-zp-editor-isolated (Blake t459u, "editor stays off main"): the Zuniga Philosophy app does not import or depend on the layout
// editor, and this work adds no always-on editor hook.
//  - no file under apps/zuniga-philosophy/ (backups excluded) references layout-editor*, editor/, layout-runtime, layout/ or layout.json;
//  - index.html keeps the ?edit=1 hook byte-for-byte as at 16b02c3, exactly once, and every editor reference in index.html is that
//    query-guarded dynamic import (no new always-on editor load);
//  - the ?zp=1 hook does not read the 'edit' param or import the editor;
//  - main / origin/main do not contain apps/zuniga-philosophy or the layout editor (nothing was pushed to main).
// Runs: Node + git (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the build because the ZP module files are absent, PASS after):
//   checks/logs/t459u-zp-editor-isolated-before.log -> FAIL, checks/logs/t459u-zp-editor-isolated-after.log -> PASS
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

const EDIT_HOOK = `<script type="module">if (new URLSearchParams(location.search).get('edit') === '1') import('./layout-editor-inner.js');</script>`;
const EDITOR_REF = /layout-editor|(?:^|[^\w-])editor\/|layout-runtime|(?:\.\/|\.\.\/)+layout\/|layout\.json/;

const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const zp = walk(dir).filter((p) => /\.(m?js|html|css)$/.test(p) && !/\.(pre|bak)-/.test(p));
t('ZP module files exist (zuniga-philosophy.js, index.html, zp-hook.js)', ['zuniga-philosophy.js', 'index.html', 'zp-hook.js'].every((f) => zp.includes(path.join(dir, f))));
const refs = zp.filter((p) => EDITOR_REF.test(readFileSync(p, 'utf8')));
t(`no ZP file references the layout editor / layout runtime${refs.length ? ': ' + refs.map((p) => path.relative(root, p)).join(', ') : ''}`, !refs.length);

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
t('index.html: ?edit=1 hook unchanged (byte-for-byte as at 16b02c3) and present once', html.split(EDIT_HOOK).length === 2);
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const editorScripts = scripts.filter((m) => /layout-editor|editor\//.test(m[1] + m[2]));
t(`index.html: the only editor reference is the ?edit=1 hook (found ${editorScripts.length})`, editorScripts.length === 1 && editorScripts[0][0] === EDIT_HOOK);
const zpHook = scripts.filter((m) => /zuniga-philosophy/.test(m[1] + m[2]));
t("?zp=1 hook does not read 'edit' or import the editor", zpHook.length === 1 && !/get\('edit'\)|layout-editor|editor\//.test(zpHook[0][0]));

for (const ref of ['main', 'origin/main']) {
  const r = spawnSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', ref], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.log(`skip  ${ref} not available here`); continue; }
  const names = r.stdout.split('\n');
  t(`${ref} has no apps/zuniga-philosophy (not pushed to main)`, !names.some((n) => n.startsWith('apps/zuniga-philosophy/')));
  t(`${ref} has no layout editor files (editor stays off main)`, !names.some((n) => /^layout-editor|^editor\//.test(n)));
}
console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
