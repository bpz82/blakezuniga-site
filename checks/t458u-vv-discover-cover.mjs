// t458u-vv-discover-cover (Blake t458u): the Vinyl Vault 'Discover & Listen' card (.vv-pop/.vv-card) must not have its cover cut off by
// the panel header (.zg-head). .vv-pop is position:fixed but .zg-panel is transformed (zg-pop), so inset:0 spans the header too.
// Fix: the pop's top offset is the header's bottom (CSS var --vv-top, from pure popTopInset(headRect, panelRect)), applied on open and on resize.
// Runs: Node (no browser; source checks + unit test of the pure helper). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix: checks/logs/t458u-vv-discover-cover-before.log -> FAIL (exit 1)
//   after fix:  checks/logs/t458u-vv-discover-cover-after.log  -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/vinyl-vault/vinyl-vault.js');
const src = readFileSync(file, 'utf8');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

const popRule = (src.match(/\.vv-pop\{[^}]*\}/) || [''])[0];
t('.vv-pop top offset uses --vv-top var', /top:\s*var\(--vv-top/.test(popRule));
t('.vv-pop still position:fixed', /position:fixed/.test(popRule));
t('popTopInset used in source', /popTopInset\(/.test(src.replace(/export function popTopInset/, '')));
t('--vv-top is set via style.setProperty', /setProperty\(\s*'--vv-top'/.test(src));
const showBody = (src.match(/function show\([\s\S]*?\n    }\n/) || [''])[0];
t('offset applied when the pop opens (show)', /placePop\(/.test(showBody));
t('offset re-applied on resize', /addEventListener\(\s*'resize'\s*,\s*placePop/.test(src));

let fn = null;
try { fn = (await import(pathToFileURL(file).href)).popTopInset; } catch (e) { console.log('import error: ' + e.message); }
t('popTopInset exported', typeof fn === 'function');
if (typeof fn === 'function') {
  t('header bottom 70, panel top 20 -> 50', fn({ bottom: 70 }, { top: 20 }) === 50);
  t('header bottom == panel top -> 0', fn({ bottom: 20 }, { top: 20 }) === 0);
  t('negative clamps to 0', fn({ bottom: 10 }, { top: 20 }) === 0);
  t('no header -> 0', fn(null, { top: 20 }) === 0);
  t('NaN -> 0', fn({ bottom: NaN }, { top: 0 }) === 0);
}
console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
