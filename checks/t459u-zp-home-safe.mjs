// t459u-zp-home-safe (Blake t459u): the Zuniga Philosophy work cannot break the home page.
//  - index.html is well-formed enough to parse (doctype, one html/head/body, balanced <script>/<style>, every inline module script
//    passes `node --check`);
//  - widgets.js still imports in Node and exports the existing tiles (contact, collaborative-projects, vinyl-vault), and
//    neither widgets.js, harness.js, widget-ids.js nor any index.html static import pulls in apps/zuniga-philosophy (so a missing or
//    broken ZP module cannot fail the home widget list);
//  - the optional ?zp=1 hook is the only reference in index.html: a query-guarded dynamic import with .catch -> console.warn;
//    simulated: no ?zp=1 -> nothing imported; ?zp=1 + import rejects -> no throw, a warning;
//  - zp-hook.js openZpOverlay never throws: no document, a rejected module import, or a mount that throws -> null + warn, overlay removed.
// Runs: Node (no browser). Runtime ~1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the build because the hook / zp-hook.js are absent, PASS after):
//   checks/logs/t459u-zp-home-safe-before.log -> FAIL, checks/logs/t459u-zp-home-safe-after.log -> PASS
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const count = (re) => (html.match(re) || []).length;

// index.html parses
t('index.html: <!doctype html> first', /^\s*<!doctype html>/i.test(html));
t('index.html: exactly one <html>, <head>, </head>, <body>, </body>, </html>', ['<html\\b', '<head\\b', '</head>', '<body\\b', '</body>', '</html>'].every((s) => count(new RegExp(s, 'gi')) === 1));
t('index.html: <script> tags balanced', count(/<script\b/gi) === count(/<\/script>/gi));
t('index.html: <style> tags balanced', count(/<style\b/gi) === count(/<\/style>/gi));
t('index.html: head before body', html.search(/<\/head>/i) < html.search(/<body\b/i));
const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'zp-home-'));
let syntaxBad = [];
inline.forEach((code, i) => {
  const f = path.join(tmp, `inline-${i}.mjs`);
  writeFileSync(f, code);
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) syntaxBad.push(`#${i}: ${(r.stderr || '').split('\n').find((l) => /Error/.test(l)) || r.stderr}`);
});
rmSync(tmp, { recursive: true, force: true });
t(`index.html: all ${inline.length} inline module scripts pass node --check${syntaxBad.length ? ' — ' + syntaxBad.join('; ') : ''}`, inline.length > 3 && !syntaxBad.length);

// widgets.js
let w = null;
try { w = await import(pathToFileURL(path.join(root, 'widgets.js')).href); } catch (e) { console.log('widgets.js import error: ' + e.message); }
const ids = w && Array.isArray(w.widgets) ? w.widgets.map((x) => x.id) : [];
t(`widgets.js imports and exports the existing tiles (${ids.join(', ')})`, ['contact', 'collaborative-projects', 'vinyl-vault'].every((id) => ids.includes(id)));
const staticZp = /^\s*import\s[^;]*['"][^'"]*zuniga-philosophy[^'"]*['"]/m;
for (const f of ['widgets.js', 'harness.js', 'widget-ids.js']) {
  const s = readFileSync(path.join(root, f), 'utf8');
  t(`${f}: no static import of apps/zuniga-philosophy`, !staticZp.test(s));
}
t('index.html: no <script src> / static import of apps/zuniga-philosophy', !/<script[^>]+src="[^"]*zuniga-philosophy/i.test(html) && !inline.some((c) => staticZp.test(c)));

// the ?zp=1 hook
const refs = inline.filter((c) => /zuniga-philosophy/.test(c));
t('index.html: exactly one inline script mentions zuniga-philosophy (the ?zp=1 hook)', refs.length === 1);
const hook = refs[0] || '';
t("hook is guarded by get('zp') === '1' and is a dynamic import with .catch", /get\('zp'\)\s*===\s*'1'/.test(hook) && /import\('\.\/apps\/zuniga-philosophy\/zp-hook\.js'\)\.catch\(/.test(hook));
const runHook = (search, imp) => {
  const warns = [];
  const fn = new Function('location', '__imp', 'console', hook.replace(/\bimport\(/g, '__imp('));
  let threw = false;
  try { fn({ search }, imp, { warn: (...a) => warns.push(a.join(' ')), log() {} }); } catch { threw = true; }
  return { threw, warns };
};
if (hook) {
  let called = 0;
  const a = runHook('', () => { called++; return Promise.resolve({}); });
  t('hook: no ?zp=1 -> nothing imported', !a.threw && called === 0);
  const b = runHook('?zp=1', () => Promise.reject(new Error('module missing')));
  await new Promise((r) => setTimeout(r, 10));
  t('hook: ?zp=1 + import fails -> no throw, console.warn', !b.threw && b.warns.length === 1);
}

// zp-hook.js
const hookPath = path.join(root, 'apps/zuniga-philosophy/zp-hook.js');
t('apps/zuniga-philosophy/zp-hook.js exists', existsSync(hookPath));
if (existsSync(hookPath)) {
  const warn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.join(' '));
  let h = null;
  try { h = await import(pathToFileURL(hookPath).href); } catch (e) { console.log('zp-hook import error: ' + e.message); }
  t('zp-hook.js imports in Node without side effects and exports openZpOverlay', !!h && typeof h.openZpOverlay === 'function');
  if (h) {
    const mkDoc = () => { const kids = []; return { kids, body: { appendChild: (n) => { kids.push(n); n.remove = () => kids.splice(kids.indexOf(n), 1); } }, createElement: () => ({ style: {}, setAttribute() {} }) }; };
    let threw = false, r1, r2, r3;
    const d2 = mkDoc(), d3 = mkDoc();
    try {
      r1 = await h.openZpOverlay(null);
      r2 = await h.openZpOverlay(d2, () => Promise.reject(new Error('404')));
      r3 = await h.openZpOverlay(d3, async () => ({ mountZunigaPhilosophy() { throw new Error('boom'); } }));
    } catch { threw = true; }
    t('openZpOverlay: no document -> null, no throw', !threw && r1 === null);
    t('openZpOverlay: module import fails -> null, overlay removed, warned', r2 === null && d2.kids.length === 0 && warns.some((x) => /zuniga-philosophy/.test(x)));
    t('openZpOverlay: mount throws -> null, overlay removed', r3 === null && d3.kids.length === 0);
  }
  console.warn = warn;
}
console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
