// t463u-zp-light-theme (Blake t463u): Zuniga Philosophy is a warm light theme (cream paper, near-black ink), not the old dark page.
// Covers: default CSS tokens (.zp background / ink / dim / line / accent), every formerly dark surface (header, search field, typographic
// cover, overlay in zp-hook.js, standalone index.html background + theme-color) is light; the old dark colours (#120c0e, #f1e9e6 and
// their rgba forms) are gone from the module, page and hook; fonts unchanged (Times New Roman stack for bodies, Zuniga Mission UI).
// Runs: Node (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence: FAIL on e30567f (dark), PASS after: checks/logs/t463u-zp-light-theme-before.log / -after.log
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const done = () => { console.log(fails ? `FAIL (${fails})` : 'PASS'); process.exit(fails ? 1 : 0); };

const m = await import(pathToFileURL(path.join(dir, 'zuniga-philosophy.js')).href);
const css = m.CSS;
const page = readFileSync(path.join(dir, 'index.html'), 'utf8');
const hook = readFileSync(path.join(dir, 'zp-hook.js'), 'utf8');
const src = readFileSync(path.join(dir, 'zuniga-philosophy.js'), 'utf8');

// ---- colour helpers
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function rgbOf(v) {
  v = String(v || '').trim();
  let mm = /^#([0-9a-f]{6})$/i.exec(v);
  if (mm) return [0, 2, 4].map((i) => parseInt(mm[1].slice(i, i + 2), 16));
  mm = /^#([0-9a-f]{3})$/i.exec(v);
  if (mm) return [...mm[1]].map((c) => parseInt(c + c, 16));
  mm = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(v);
  if (mm) return [+mm[1], +mm[2], +mm[3]];
  return null;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const zpRule = (css.match(/\.zp\{[^}]*\}/) || [''])[0];
const decl = (rule, prop) => { const mm = new RegExp('(?:^|[;{])\\s*' + prop.replace(/[-]/g, '\\-') + ':([^;}]*)').exec(rule); return mm ? mm[1].trim() : ''; };
const resolve = (v) => { const mm = /^var\((--[\w-]+)\)$/.exec(v); return mm ? decl(zpRule, mm[1]) : v; };

// ---- default tokens
const bg = rgbOf(resolve(decl(zpRule, 'background')));
const ink = rgbOf(resolve(decl(zpRule, 'color')));
const accent = rgbOf(decl(zpRule, '--zp-accent'));
t('.zp page background resolves to a colour', !!bg);
t('page background is light (relative luminance > 0.80)', !!bg && lum(bg) > 0.8);
t('page background is warm (cream: red >= green >= blue, not pure white)', !!bg && bg[0] >= bg[1] && bg[1] >= bg[2] && bg[2] < 255 && bg[0] > 200);
t('body ink is dark (luminance < 0.06)', !!ink && lum(ink) < 0.06);
t('ink / background contrast >= 10:1', !!bg && !!ink && ratio(bg, ink) >= 10);
t('accent reads on cream (contrast >= 4.5:1 for small tags)', !!bg && !!accent && ratio(bg, accent) >= 4.5);
const dim = decl(zpRule, '--zp-dim'), line = decl(zpRule, '--zp-line');
t('dim text and hairlines are dark-on-light (not white/cream alpha)', /rgba\((\d+),/.test(dim) && +/rgba\((\d+),/.exec(dim)[1] < 120 && /rgba\((\d+),/.test(line) && +/rgba\((\d+),/.exec(line)[1] < 120);

// ---- the old dark colours are gone from defaults
const OLD = /#120c0e|#f1e9e6|#f4ecea|rgba\(\s*18\s*,\s*12\s*,\s*14|rgba\(\s*241\s*,\s*233\s*,\s*230/i;
t('module CSS has no old dark page / ink colours (#120c0e, #f1e9e6, rgba forms)', !OLD.test(css));
t('module source has no old dark colours', !OLD.test(src));
t('standalone index.html has no old dark colours', !OLD.test(page));
t('zp-hook.js overlay has no old dark colour', !OLD.test(hook));

// ---- every formerly dark surface
const bodyBg = rgbOf((/html,body\{[^}]*background:\s*([^;}]+)/.exec(page) || [])[1]);
const bodyInk = rgbOf((/html,body\{[^}]*[;{]\s*color:\s*([^;}]+)/.exec(page) || [])[1]);
t('standalone page html/body background is light', !!bodyBg && lum(bodyBg) > 0.8);
t('standalone page ink is dark', !!bodyInk && lum(bodyInk) < 0.06);
const theme = rgbOf((/<meta name="theme-color" content="([^"]+)"/.exec(page) || [])[1]);
t('theme-color meta is light (matches the page)', !!theme && lum(theme) > 0.8);
const ov = rgbOf((/cssText\s*=\s*'[^']*background:\s*([^;']+)/.exec(hook) || [])[1]);
t('?zp=1 overlay background is light', !!ov && lum(ov) > 0.8);
const head = (css.match(/\.zp-head\{[^}]*\}/) || [''])[0];
const headBg = rgbOf(decl(head, 'background'));
t('sticky header background is light', !!headBg && lum(headBg) > 0.8);
const qRule = (css.match(/\.zp-q,\.zp-bq\{[^}]*\}/) || [''])[0];
const qBg = rgbOf(resolve(decl(qRule, 'background')));
t('search field background is light', !!qBg && lum(qBg) > 0.8);
const cov = (css.match(/\.zp-cover\{[^}]*\}/) || [''])[0];
const hsls = [...cov.matchAll(/hsl\(var\([^)]*\)\s+\d+%\s+(\d+)%\)/g)].map((x) => +x[1]);
t('typographic cover fallback gradient is light (every HSL lightness >= 60%)', hsls.length >= 2 && hsls.every((l) => l >= 60));
t('typographic cover has no dark rgba(0,0,0) heavy shadow (soft ink shadow)', !/rgba\(0,0,0,\.[3-9]/.test(cov));
const gradRgba = cov.match(/rgba\(\s*18\s*,\s*12\s*,\s*14/);
t('typographic cover has no near-black stop', !gradRgba);

// ---- typography unchanged
t("BODY_FONT is still 'Times New Roman', Times, serif", m.BODY_FONT === "'Times New Roman', Times, serif");
t('UI_FONT is still Zuniga Mission', /^'Zuniga Mission'/.test(m.UI_FONT));
for (const cls of ['zp-text', 'zp-blurb-text', 'zp-aside-text', 'zp-attr']) {
  const rule = (css.match(new RegExp('\\.' + cls + '\\{[^}]*\\}')) || [''])[0];
  t(`.${cls} stays Times New Roman`, rule.includes("font-family:'Times New Roman', Times, serif"));
}
t('no Founders Notes fonts or names added', !/Founders|Mulish|Charter|Iowan|Georgia/i.test(css + page));
done();
