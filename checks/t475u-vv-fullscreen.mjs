// t475u-vv-fullscreen (Blake t475u): Vinyl Vault fills the whole viewport (no border, no rounded inset, no gap showing the 3D background)
// on desktop and phone, and its title + description are much bigger. Contact / Collab keep the inset panel and 22px / 14px type.
// Fix: new .zg-panel--full class (harness.css), panel:'full' on the vinyl-vault widget (widgets.js), wired in harness.js like 'wide'.
// Type is scoped to .zg-panel--full .zg-title / .zg-sub (shared .zg-title / .zg-sub stay 22px / 14px).
// Runs: Node (no browser, source/CSS checks). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix (89738e5): checks/logs/t475u-vv-fullscreen-before.log -> FAIL (exit 1)
//   after fix:            checks/logs/t475u-vv-fullscreen-after.log  -> PASS (exit 0)
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(root, p), 'utf8');
const css = rd('harness.css').replace(/\/\*[\s\S]*?\*\//g, '');
const harness = rd('harness.js');
const widgets = rd('widgets.js');
const vv = rd('apps/vinyl-vault/vinyl-vault.js');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

// Parse CSS into [{cond, sel, body}] (one level of @media nesting).
function rules(src) {
  const out = [];
  const re = /(@media[^{]+)\{|([^{}@]+)\{([^}]*)\}|\}/g;
  let m, cond = '';
  while ((m = re.exec(src))) {
    if (m[1]) cond = m[1].trim();
    else if (m[2] !== undefined) out.push({ cond, sel: m[2].trim(), body: m[3] });
    else cond = '';
  }
  return out;
}
const all = rules(css);
function applies(cond, w) {
  if (!cond) return true;
  if (/prefers-reduced-motion|hover|print/.test(cond)) return false;
  const mn = cond.match(/min-width:\s*(\d+)px/), mx = cond.match(/max-width:\s*(\d+)px/);
  return (!mn || w >= +mn[1]) && (!mx || w <= +mx[1]);
}
// Last declared value for prop among rules whose selector list contains `sel` exactly, at viewport width w.
function val(sel, prop, w) {
  let v = null;
  for (const r of all) {
    if (!applies(r.cond, w)) continue;
    if (!r.sel.split(',').map((s) => s.trim()).includes(sel)) continue;
    for (const d of r.body.split(';')) {
      const i = d.indexOf(':');
      if (i > 0 && d.slice(0, i).trim() === prop) v = d.slice(i + 1).trim();
    }
  }
  return v;
}
const px = (v, w) => {
  if (!v) return NaN;
  let m = v.match(/^(\d+(?:\.\d+)?)px$/); if (m) return +m[1];
  m = v.match(/^clamp\(\s*(\d+(?:\.\d+)?)px\s*,\s*(\d+(?:\.\d+)?)vw\s*,\s*(\d+(?:\.\d+)?)px\s*\)$/);
  if (m) return Math.min(Math.max(+m[1], +m[2] * w / 100), +m[3]);
  return NaN;
};
const fullTail = css.includes('.zg-panel--full') ? css.slice(css.indexOf('.zg-panel--full')) : '';

// --- Vinyl Vault is wired to a fullscreen panel class
const vvDef = (widgets.match(/id:\s*'vinyl-vault'[\s\S]{0,300}/) || [''])[0];
t("vinyl-vault widget declares panel: 'full'", /panel:\s*'full'/.test(vvDef));
t('harness.js maps def.panel full -> zg-panel--full', /def\.panel\s*===\s*'full'/.test(harness) && /zg-panel--full/.test(harness));
t('Photos still uses wide (not changed)', /id:\s*'photos'[\s\S]{0,300}panel:\s*'wide'/.test(widgets));
t("only Vinyl Vault uses panel 'full' (Contact / Collab keep the inset panel)", (widgets.match(/panel:\s*'full'/g) || []).length === 1);

// --- fullscreen geometry at phone 390, the 700 boundary and desktop 1280
for (const w of [390, 700, 1280]) {
  const S = '.zg-panel--full';
  const wd = val(S, 'width', w), ht = val(S, 'height', w);
  t(`[${w}] full width is 100%/100vw`, /^(100%|100vw)$/.test(wd || ''));
  t(`[${w}] full height is 100%/100vh/100dvh`, /^(100%|100vh|100dvh)$/.test(ht || ''));
  t(`[${w}] margin 0`, val(S, 'margin', w) === '0');
  t(`[${w}] border none/0`, /^(none|0)$/.test(val(S, 'border', w) || ''));
  t(`[${w}] border-radius 0`, val(S, 'border-radius', w) === '0');
  t(`[${w}] no max-width/max-height cap`, ['max-width', 'max-height'].every((p) => !val(S, p, w) || val(S, p, w) === 'none'));
  t(`[${w}] no min() size cap`, !/min\(/.test((wd || '') + (ht || '')));
}
t('inset 0 on the base panel (no gap)', val('.zg-panel', 'inset', 390) === '0');
const bg = val('.zg-panel--full', 'background', 390) || val('.zg-panel--full', 'background-color', 390) || '';
t('full panel background is opaque (no 3D background showing through)', /^#[0-9a-f]{3,8}$/i.test(bg));
t('safe-area padding on the full panel header', /env\(safe-area-inset-top/.test(fullTail));

// --- type sizes (scoped to the full panel)
const T = '.zg-panel--full .zg-title', B = '.zg-panel--full .zg-sub';
t('[390] title >= 32px', px(val(T, 'font-size', 390), 390) >= 32);
t('[1280] title >= 40px', px(val(T, 'font-size', 1280), 1280) >= 40);
t('[390] description >= 18px', px(val(B, 'font-size', 390), 390) >= 18);
t('[1280] description >= 20px', px(val(B, 'font-size', 1280), 1280) >= 20);
t('title family Zuniga Mission (var(--zg-font-title)), not overridden', val('.zg-title', 'font-family', 390) === 'var(--zg-font-title)' && !val(T, 'font-family', 390));
t('description family Zuniga Mission (var(--zg-font-title)), not overridden', val('.zg-sub', 'font-family', 390) === 'var(--zg-font-title)' && !val(B, 'font-family', 390));
t('title stays uppercase', val('.zg-title', 'text-transform', 390) === 'uppercase' && !val(T, 'text-transform', 390));
t('description wraps in full', val('.zg-sub', 'white-space', 390) === 'normal' && !val(B, 'white-space', 390));

// --- Contact / Collab unchanged
for (const w of [390, 1280]) {
  t(`[${w}] default panel width min(92vw, 560px)`, val('.zg-panel', 'width', w) === 'min(92vw, 560px)');
  t(`[${w}] default panel height min(78dvh, 640px)`, val('.zg-panel', 'height', w) === 'min(78dvh, 640px)');
  t(`[${w}] default panel radius 22px`, val('.zg-panel', 'border-radius', w) === '22px');
  t(`[${w}] default panel border 1px`, /^1px solid/.test(val('.zg-panel', 'border', w) || ''));
  t(`[${w}] shared .zg-title 22px`, val('.zg-title', 'font-size', w) === '22px');
  t(`[${w}] shared .zg-sub 14px`, val('.zg-sub', 'font-size', w) === '14px');
}
t('.zg-panel--wide untouched (Photos)', val('.zg-panel--wide', 'width', 390) === 'min(97vw, 1100px)' && val('.zg-panel--wide', 'width', 1280) === 'min(94vw, 1100px)');

// --- features still present
t('search bar (.vv-bar)', /\.vv-bar\{/.test(vv) && /el\('div',\s*'vv-bar'\)/.test(vv));
t('Sort A-Z button (.vv-sort)', /\.vv-sort\{/.test(vv) && /'Sort A-Z'/.test(vv));
t('close button (.zg-close) in harness', /className\s*=\s*'zg-close'/.test(harness) && /\.zg-close\s*\{/.test(css));
t('record grid (.vv-grid)', /\.vv-grid\{/.test(vv) && /el\('div',\s*'vv-grid'\)/.test(vv));
t('cover grain (grain.png used in CSS)', /grain\.png/.test(vv) && /GRAIN_URL/.test(vv.replace(/const GRAIN_URL[^\n]*/, '')));

console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
