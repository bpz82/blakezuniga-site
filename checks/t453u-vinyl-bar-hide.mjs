// t453u-vinyl-bar-hide (Blake ask t453u): the Vinyl Vault search bar (.vv-bar) must be fully opaque (#120c0e, same colour as the old
// rgba(18,12,14,.88) so the look is unchanged, but nothing above the search field is see-through) and must hide on scroll down /
// show on scroll up via the pure nextBarHidden(hidden, delta, top), wired to a passive scroll listener on the scroller (.zg-body host),
// never hiding while the search input has focus. Exits nonzero on fail.
// Runs: Node (no browser; unit test of the pure function + source checks). Runtime < 1 s.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix: checks/logs/t453u-vinyl-bar-hide-before.log  -> FAIL (exit 1)
//   after fix:  checks/logs/t453u-vinyl-bar-hide-after.log   -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/vinyl-vault/vinyl-vault.js');
const src = readFileSync(file, 'utf8');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

// source checks
const barRule = (src.match(/\.vv-bar\{[^}]*\}/) || [''])[0];
t('.vv-bar background is opaque #120c0e', /background:#120c0e/i.test(barRule) && !/rgba\(18,\s*12,\s*14/.test(barRule));
t('.vv-bar--hidden class: translateY(-100%) + transition', /\.vv-bar--hidden\{[^}]*translateY\(-100%\)/.test(src) && /\.vv-bar[^{]*\{[^}]*transition:/.test(src));
t('toggles vv-bar--hidden', /classList\.toggle\(\s*'vv-bar--hidden'/.test(src));
t('passive scroll listener', /addEventListener\(\s*'scroll'[\s\S]{0,200}passive:\s*true/.test(src));
t('scroll listener calls nextBarHidden', /nextBarHidden\(/.test(src.replace(/export function nextBarHidden/, '')));
t('focus guard (activeElement)', /activeElement/.test(src));

// unit test
let fn = null;
try { fn = (await import(pathToFileURL(file).href)).nextBarHidden; } catch (e) { console.log('import error: ' + e.message); }
t('nextBarHidden exported', typeof fn === 'function');
if (typeof fn === 'function') {
  t('scroll down hides', fn(false, 40, 300) === true);
  t('scroll up shows', fn(true, -40, 300) === false);
  t('jitter down ignored (shown stays shown)', fn(false, 3, 300) === false);
  t('jitter up ignored (hidden stays hidden)', fn(true, -3, 300) === true);
  t('near top always shows', fn(true, 40, 0) === false && fn(true, 10, 4) === false);
  t('large down at top still shows', fn(false, 80, 2) === false);
}
console.log(fails ? 'FAIL t453u-vinyl-bar-hide' : 'PASS t453u-vinyl-bar-hide');
process.exit(fails ? 1 : 0);
