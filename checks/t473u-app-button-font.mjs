// t473u-app-button-font (Blake t472u/t473u): home-page app tile label text must be clearly
// legible on phone and desktop, in Zuniga Mission, without overflowing, clipping, or wrapping
// mid-word. Tile size, layout and the rest of the look stay unchanged. Labels may wrap at
// spaces (e.g. "Collaborative Projects" on two lines).
// Runs: Node (no browser; CSS + layout-formula source checks + Zuniga Mission v3 text-width
// estimate). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the fix, PASS after):
//   before fix: checks/logs/t473u-app-button-font-before.log -> FAIL (exit 1)
//   after fix:  checks/logs/t473u-app-button-font-after.log  -> PASS (exit 0)
// Minimums (declared / computed from --zg-size, before any fitTileLabels shrink):
//   phone 393 px: >= 14 px (was ~9.24 px at 0.105 * 88)
//   desktop widths (size 106..129): >= 16 px (was ~11.66..14.19 px at 0.11 * size)
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'harness.css'), 'utf8');
const js = readFileSync(path.join(root, 'harness.js'), 'utf8');
const widgets = readFileSync(path.join(root, 'widgets.js'), 'utf8');

let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

// Zuniga Mission Regular v3 (upem 1000) advance widths, from
// assets/fonts/ZunigaMission-Regular-v3.woff2 / the v3 TTF. Labels are
// text-transform:uppercase, so only caps + space + hyphen are needed.
const UPEM = 1000;
const ADV = {
  A: 483, B: 505, C: 446, D: 507, E: 484, F: 471, G: 484, H: 495,
  I: 289, J: 450, K: 488, L: 410, M: 583, N: 464, O: 476, P: 467,
  Q: 515, R: 441, S: 479, T: 396, U: 450, V: 438, W: 573, X: 484,
  Y: 408, Z: 452, ' ': 179, '-': 337
};

const MIN_PHONE = 14;
const MIN_DESK = 16;
const TILE_BORDER = 1; // .zg-tile border: 1px, box-sizing: border-box
const LIVE_TITLES = ['Contact', 'Collaborative Projects', 'Vinyl Vault'];

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

// font-size from the first .zg-label rule in a CSS chunk that actually sets font-size
function labelFontSizeDecl(chunk) {
  const rules = stripComments(chunk).match(/\.zg-label\s*\{[^}]*\}/g) || [];
  for (const r of rules) {
    const m = r.match(/font-size\s*:\s*([^;]+);/);
    if (m) return m[1].trim();
  }
  return '';
}

function labelWidthPct(chunk) {
  const rules = stripComments(chunk).match(/\.zg-label\s*\{[^}]*\}/g) || [];
  for (const r of rules) {
    const m = r.match(/(?:^|[^\w-])width\s*:\s*([0-9.]+)%/);
    if (m) return parseFloat(m[1]);
  }
  return NaN;
}

function labelLetterSpacingEm(chunk) {
  const rules = stripComments(chunk).match(/\.zg-label\s*\{[^}]*\}/g) || [];
  for (const r of rules) {
    const m = r.match(/letter-spacing\s*:\s*([^;]+);/);
    if (m) {
      const v = m[1].trim();
      if (v === 'normal' || v === '0') return 0;
      const em = v.match(/^(-?[0-9.]+)em$/);
      if (em) return parseFloat(em[1]);
      const px = v.match(/^(-?[0-9.]+)px$/);
      if (px) return { px: parseFloat(px[1]) };
    }
  }
  return 0.02; // current default
}

// Evaluate a font-size declaration given --zg-size in px.
function evalFontSize(decl, sizePx) {
  if (!decl) return NaN;
  const d = decl.trim();
  const px = d.match(/^([0-9.]+)px$/);
  if (px) return parseFloat(px[1]);
  // calc(var(--zg-size) * N) or calc(N * var(--zg-size))
  const calc = d.match(/^calc\(\s*(?:var\(\s*--zg-size\s*\)\s*\*\s*([0-9.]+)|([0-9.]+)\s*\*\s*var\(\s*--zg-size\s*\))\s*\)$/);
  if (calc) return sizePx * parseFloat(calc[1] || calc[2]);
  // max(Xpx, calc(...)) or max(calc(...), Xpx)
  const mx = d.match(/^max\(\s*(.+)\s*\)$/);
  if (mx) {
    const parts = mx[1].split(',').map((p) => p.trim());
    const vals = parts.map((p) => evalFontSize(p, sizePx));
    if (vals.some((v) => !Number.isFinite(v))) return NaN;
    return Math.max(...vals);
  }
  return NaN;
}

const cssNoC = stripComments(css);
const phoneMq = cssNoC.match(/@media\s*\(\s*max-width\s*:\s*599px\s*\)\s*\{([\s\S]*?)\n\}/) ||
  cssNoC.match(/@media\s*\(\s*max-width\s*:\s*599px\s*\)\s*\{([\s\S]*)\}/);
const phoneChunk = phoneMq ? phoneMq[1] : '';
// Base label rule lives outside the phone media query: use CSS with the phone mq removed
const deskChunk = cssNoC.replace(/@media\s*\(\s*max-width\s*:\s*599px\s*\)\s*\{[\s\S]*?\n\}/, '');

const deskDecl = labelFontSizeDecl(deskChunk);
const phoneDecl = labelFontSizeDecl(phoneChunk) || deskDecl;
const deskPct = labelWidthPct(deskChunk);
const phonePct = Number.isFinite(labelWidthPct(phoneChunk)) ? labelWidthPct(phoneChunk) : deskPct;
const deskTrack = labelLetterSpacingEm(deskChunk);
const phoneTrack = (function () {
  const v = labelLetterSpacingEm(phoneChunk);
  // if the phone chunk has no letter-spacing, inherit desktop
  const phoneHas = /\.zg-label\s*\{[^}]*letter-spacing/.test(phoneChunk);
  return phoneHas ? v : deskTrack;
}());

t('.zg-label uses var(--zg-font-title)', /\.zg-label\s*\{[^}]*font-family\s*:\s*var\(\s*--zg-font-title\s*\)/.test(cssNoC));
t('--zg-font-title is Zuniga Mission', /--zg-font-title\s*:\s*['\"]Zuniga Mission['\"]/.test(cssNoC));

// Tile size formula must stay the same (do not enlarge tiles to make type fit).
t('phone tile size formula still vw * 0.225, clamp 56..100',
  /size\s*=\s*phone\s*\?\s*Math\.max\(\s*56\s*,\s*Math\.min\(\s*100\s*,\s*Math\.round\(\s*vw\s*\*\s*0\.225\s*\)\s*\)\s*\)/.test(js));
t('desktop tile size formula still vw * 0.168, clamp 106..129',
  /Math\.min\(\s*129\s*,\s*Math\.max\(\s*106\s*,\s*vw\s*\*\s*0\.168\s*\)\s*\)/.test(js));
t('phone breakpoint still vw < 600', /const phone = vw < 600/.test(js) && /const margin = vw < 600 \? 16 : 24/.test(js));

function tileSize(vw, nTiles, sc, sl = 0) {
  const phone = vw < 600;
  const margin = phone ? 16 : 24;
  let size = phone
    ? Math.max(56, Math.min(100, Math.round(vw * 0.225)))
    : Math.round(Math.min(129, Math.max(106, vw * 0.168)));
  const fit = Math.floor((vw - 2 * Math.max(margin, sl + margin) - (nTiles - 1) * 16) / (nTiles * (phone ? sc : 1)));
  if (size > fit) size = Math.max(phone ? 56 : 72, fit);
  return { size, phone };
}

function trackEm(track, fs) {
  if (typeof track === 'object' && track && 'px' in track) return track.px / fs;
  return Number(track) || 0;
}

function textWidth(text, fs, trackingEm) {
  let units = 0;
  for (const ch of text) {
    if (!(ch in ADV)) throw new Error('no advance for ' + JSON.stringify(ch));
    units += ADV[ch];
  }
  return units / UPEM * fs + Math.max(0, text.length - 1) * trackingEm * fs;
}

function labelBox(size, pct) {
  const content = size - 2 * TILE_BORDER;
  const p = Number.isFinite(pct) ? pct : 94;
  return content * (p / 100);
}

// Titles as displayed: uppercase. Overflow is decided by the longest unbreakable word
// (wrapping at spaces is allowed). Tracking may tighten to 0 (fitTileLabels shrinks
// tracking first) but font-size must stay at the declared size.
function fitsWidth(title, fs, tracking, box) {
  const words = title.toUpperCase().split(/\s+/);
  const em0 = trackEm(tracking, fs);
  for (const w of words) {
    const atDeclared = textWidth(w, fs, em0);
    const atZero = textWidth(w, fs, 0);
    if (atDeclared > box && atZero > box) return { ok: false, word: w, width: atZero, box };
    // if only declared tracking overflows, tightening to 0 is enough
    if (atZero > box) return { ok: false, word: w, width: atZero, box };
  }
  return { ok: true };
}

const cases = [
  { name: 'phone 393', vw: 393, sc: 1.16, min: MIN_PHONE, decl: phoneDecl, pct: phonePct, track: phoneTrack },
  { name: 'desktop 700', vw: 700, sc: 0.96, min: MIN_DESK, decl: deskDecl, pct: deskPct, track: deskTrack },
  { name: 'desktop 1280', vw: 1280, sc: 0.96, min: MIN_DESK, decl: deskDecl, pct: deskPct, track: deskTrack }
];

t('parsed desktop .zg-label font-size: ' + deskDecl, !!deskDecl);
t('parsed phone .zg-label font-size: ' + phoneDecl, !!phoneDecl);

for (const c of cases) {
  const { size, phone } = tileSize(c.vw, LIVE_TITLES.length, c.sc);
  const fs = evalFontSize(c.decl, size);
  const okFs = Number.isFinite(fs) && fs + 1e-9 >= c.min;
  t(`${c.name}: tile size ${size}px, label font-size ${Number.isFinite(fs) ? fs.toFixed(2) : 'NaN'}px >= ${c.min}px`, okFs);
  if (!Number.isFinite(fs)) continue;
  const box = labelBox(size, c.pct);
  for (const title of LIVE_TITLES) {
    const fit = fitsWidth(title, fs, c.track, box);
    t(`${c.name}: ${JSON.stringify(title)} fits in ${box.toFixed(1)}px at ${fs.toFixed(2)}px (longest word, wrap at spaces ok)`,
      fit.ok);
    if (!fit.ok) {
      console.log(`     -> ${fit.word} is ${fit.width.toFixed(1)}px in a ${fit.box.toFixed(1)}px box`);
    }
  }
}

// Live titles still the three public apps (no ZP tile).
for (const title of LIVE_TITLES) {
  const re = new RegExp("title:\\s*'" + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
  t('widgets.js still has ' + JSON.stringify(title), re.test(widgets));
}

console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
