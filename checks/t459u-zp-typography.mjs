// t459u-zp-typography (Blake t459u, hard rule 25 Nov 2026): every quote / note body (highlight text, blurb, aside, attribution) is
// 'Times New Roman', Times, serif; all other UI (title, nav, buttons, search, book titles, authors, counts, session metadata, empty
// states) is 'Zuniga Mission'. No Mulish / Charter / Iowan / Georgia; no Founders Notes / Readwise / Sage names.
// Method: (1) source CSS checks; (2) a computed-style pass without a browser: the module's own render functions produce the HTML of
// every view, a small CSS cascade (selector match + specificity + order + inheritance, UA form controls do NOT inherit fonts, the UA
// default for text is Times) resolves font-family for every text node. Text inside a body element (whose text equals a note text /
// blurb / aside / attribution) must resolve to the Times stack; every other text node must resolve to Zuniga Mission.
// Runs: Node (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the build because the module is absent, PASS after):
//   checks/logs/t459u-zp-typography-before.log -> FAIL, checks/logs/t459u-zp-typography-after.log -> PASS
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const done = () => { console.log(fails ? `FAIL (${fails})` : 'PASS'); process.exit(fails ? 1 : 0); };
const TIMES = "'Times New Roman', Times, serif";
const isTimes = (f) => /^'Times New Roman',\s*Times,\s*serif$/.test(f || '');
const isZM = (f) => /^'Zuniga Mission'/.test(f || '');

const modPath = path.join(dir, 'zuniga-philosophy.js');
let m = null;
try { m = await import(pathToFileURL(modPath).href); } catch (e) { console.log('import error: ' + e.message); }
t('module imports', !!m && typeof m.CSS === 'string');
if (!m) done();

// ---- (1) source checks
const css = m.CSS;
const src = readFileSync(modPath, 'utf8');
const page = readFileSync(path.join(dir, 'index.html'), 'utf8');
t('BODY_FONT is exactly ' + TIMES, m.BODY_FONT === TIMES);
t("UI_FONT starts with 'Zuniga Mission' and has no serif fallback", isZM(m.UI_FONT) && !/serif\b(?![-\w])/.test(m.UI_FONT.replace(/sans-serif/g, '')) && !/Times/.test(m.UI_FONT));
t('no Mulish / Charter / Iowan / Georgia / Founders fonts in module or page', !/Mulish|Charter|Iowan|Georgia|Founders/i.test(css + page));
t('no Founders Notes / Readwise / Sage names in module or page', !/Founders Notes|Readwise|\bSage\b/i.test(src + page));
t('module @font-face points at assets/fonts/ZunigaMission-Regular-v3.woff2 (exists)', /ZunigaMission-Regular-v3\.woff2/.test(css) && existsSync(path.join(root, 'assets/fonts/ZunigaMission-Regular-v3.woff2')));
t("standalone page @font-face uses ../../assets/fonts/ZunigaMission-Regular-v3.woff2", /url\('\.\.\/\.\.\/assets\/fonts\/ZunigaMission-Regular-v3\.woff2'\)/.test(page));
for (const cls of ['zp-text', 'zp-blurb-text', 'zp-aside-text', 'zp-attr']) {
  const rule = (css.match(new RegExp('\\.' + cls + '\\{[^}]*\\}')) || [''])[0];
  t(`.${cls} rule sets font-family Times New Roman stack`, rule.includes('font-family:' + TIMES));
}
for (const cls of ['zp-title', 'zp-q', 'zp-cap-title', 'zp-cap-author', 'zp-book-title', 'zp-book-author', 'zp-credit-title', 'zp-session', 'zp-empty', 'zp-tag']) {
  const rule = (css.match(new RegExp('\\.' + cls + '(?:,[^{]*)?\\{[^}]*\\}')) || [''])[0];
  t(`.${cls} rule sets font-family Zuniga Mission`, rule.includes("font-family:'Zuniga Mission'"));
}
t('placeholder uses Zuniga Mission', /::placeholder[^{]*\{[^}]*font-family:'Zuniga Mission'/.test(css));

// ---- (2) computed style without a browser
function parseCSS(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0, order = 0;
  const walk = (s) => {
    let j = 0;
    while (j < s.length) {
      const open = s.indexOf('{', j);
      if (open < 0) break;
      const sel = s.slice(j, open).trim();
      let depth = 1, k = open + 1;
      while (k < s.length && depth) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; k++; }
      const body = s.slice(open + 1, k - 1);
      if (sel.startsWith('@media')) walk(body);
      else if (!sel.startsWith('@')) {
        const decl = {};
        for (const d of body.split(';')) { const c = d.indexOf(':'); if (c > 0) decl[d.slice(0, c).trim()] = d.slice(c + 1).trim(); }
        let fam = decl['font-family'];
        if (!fam && decl.font) { const mm = /(?:^|\s)[\d.]+(?:px|em|rem|%)(?:\/\S+)?\s+(.+)$/.exec(decl.font); if (mm) fam = mm[1].trim(); }
        if (fam) for (const one of sel.split(',')) rules.push({ sel: one.trim(), fam, order: order++ });
      }
      j = k;
    }
  };
  walk(text);
  void i;
  return rules;
}
function compound(c) {
  const out = { tag: null, classes: [], attrs: [], pseudo: false };
  if (/:/.test(c)) out.pseudo = true;
  const tag = /^[a-z][a-z0-9]*/i.exec(c); if (tag) out.tag = tag[0].toLowerCase();
  for (const mm of c.matchAll(/\.([\w-]+)/g)) out.classes.push(mm[1]);
  for (const mm of c.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) out.attrs.push([mm[1], mm[2]]);
  return out;
}
const matchC = (n, c) => (!c.tag || n.tag === c.tag) && c.classes.every((x) => n.classes.includes(x)) &&
  c.attrs.every(([a, v]) => a in n.attrs && (v === undefined || n.attrs[a] === v));
function matches(n, sel) {
  const parts = sel.replace(/\s*>\s*/g, ' ').split(/\s+/).map(compound);
  if (parts.some((p) => p.pseudo)) return false;
  if (!matchC(n, parts[parts.length - 1])) return false;
  let a = n.parent;
  for (let i = parts.length - 2; i >= 0; i--) { while (a && !matchC(a, parts[i])) a = a.parent; if (!a) return false; a = a.parent; }
  return true;
}
const spec = (sel) => { const ps = sel.split(/\s+/).map(compound); return ps.reduce((s, p) => s + (p.classes.length + p.attrs.length) * 100 + (p.tag ? 1 : 0), 0); };
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
function parseHTML(html) {
  const top = { tag: '#root', classes: [], attrs: {}, children: [], parent: null };
  let cur = top;
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let mm;
  while ((mm = re.exec(html))) {
    if (mm[5] !== undefined) { cur.children.push({ text: mm[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), parent: cur }); continue; }
    const tag = mm[2].toLowerCase();
    if (mm[1]) { if (cur.tag !== tag) throw new Error(`bad nesting </${tag}> in <${cur.tag}>`); cur = cur.parent; continue; }
    const attrs = {};
    for (const a of mm[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : a[2];
    const n = { tag, attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean), children: [], parent: cur };
    cur.children.push(n);
    if (!VOID.has(tag) && !mm[4]) cur = n;
  }
  if (cur !== top) throw new Error('unclosed <' + cur.tag + '>');
  return top;
}
const CONTROLS = new Set(['button', 'input', 'select', 'textarea']);
function computeFonts(tree, rules) {
  const visit = (n, inherited) => {
    if (n.text !== undefined) { n.font = inherited; return; }
    let best = null;
    for (const r of rules) if (matches(n, r.sel)) { const s = spec(r.sel); if (!best || s > best.s || (s === best.s && r.order > best.order)) best = { s, order: r.order, fam: r.fam }; }
    let f = best ? best.fam : (CONTROLS.has(n.tag) ? 'UA-control-font' : inherited);
    if (f === 'inherit') f = inherited;
    n.font = f;
    n.children.forEach((c) => visit(c, f));
  };
  visit(tree, "'Times New Roman'(UA default)");
}
const textOf = (n) => (n.text !== undefined ? n.text : n.children.map(textOf).join(''));

const rules = parseCSS(css);
t('cascade: CSS parsed into font rules', rules.length > 20);

// Synthetic book that exercises every body kind (aside, attribution, starred, Blake note, session metadata) + real sample data.
const sample = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8'));
const synth = { id: 'type-test', title: 'Type Test Book', author: 'Test Author', toc_page: 999, blurb: 'Blurb body words.', full_note_count: 9, notes: [
  { id: 'type-test-blurb', text: 'Blurb body words.', kind: 'note', role: 'blurb' },
  { id: 'type-test-n0001', text: 'A quoted line about the river.', kind: 'quote', attribution: 'Lao Tzu', aside: 'this one stays with me', session: { date: '5/8/2022', place: 'Austin' } },
  { id: 'type-test-n0002', text: 'Starred line, bold but same family.', kind: 'quote', starred: true },
  { id: 'type-test-n0003', text: 'My own thought about the river. -bz', kind: 'note' },
] };
const lib = m.normalizeLibrary({ sample: true, books: [...sample.books, synth] });
const tb = lib.books.find((b) => b.id === 'type-test');
const saved = new Set(['type-test-n0001']);
const bodyStrings = new Set();
for (const b of lib.books) { if (b.blurb) bodyStrings.add(b.blurb.trim()); for (const n of b.notes) { bodyStrings.add(n.text.trim()); if (n.aside) bodyStrings.add(n.aside.trim()); if (n.attribution) bodyStrings.add('— ' + n.attribution.trim()); } }

const views = {
  'search (empty)': m.renderSearch(lib, { query: '' }, saved),
  'search results "river"': m.renderSearch(lib, { query: 'river' }, saved),
  'search results "life"': m.renderSearch(lib, { query: 'life' }, saved),
  'feed': m.renderFeed(m.renderFeedCards(m.allItems(lib).slice(0, 40), saved)),
  'books grid A-Z': m.renderBooks(lib, { sort: 'title', layout: 'grid', bq: '' }),
  'books list by author': m.renderBooks(lib, { sort: 'author', layout: 'list', bq: 'zzz' }),
  'book page (synthetic: aside, attribution, starred, Blake note, session)': m.renderBook(lib, tb, saved),
  'book page Meditations': m.renderBook(lib, lib.books[0], saved),
  'saved': m.renderSaved(lib, saved),
  'saved (empty)': m.renderSaved(lib, new Set()),
};
for (const [name, inner] of Object.entries(views)) {
  const html = `<div class="zp">${m.renderHeader({ view: 'search' }, lib, true)}<main class="zp-main">${inner}</main></div>`;
  let tree;
  try { tree = parseHTML(html); } catch (e) { t(`${name}: HTML well-formed (${e.message})`, false); continue; }
  computeFonts(tree, rules);
  let bodyTimes = 0, bodyBad = [], uiZM = 0, uiBad = [];
  const walk = (n, inBody) => {
    if (n.text !== undefined) {
      if (!n.text.trim()) return;
      if (inBody) { if (isTimes(n.font)) bodyTimes++; else bodyBad.push(`"${n.text.slice(0, 40)}" -> ${n.font}`); }
      else if (isZM(n.font)) uiZM++; else uiBad.push(`"${n.text.slice(0, 40)}" <${n.parent.tag} ${n.parent.classes.join('.')}> -> ${n.font}`);
      return;
    }
    const body = inBody || (n.tag !== '#root' && n.tag !== 'li' && n.tag !== 'section' && bodyStrings.has(textOf(n).trim()));
    n.children.forEach((c) => walk(c, body));
  };
  walk(tree, false);
  const controls = [];
  const walkC = (n) => { if (n.tag && CONTROLS.has(n.tag) && !isZM(n.font)) controls.push(`<${n.tag} ${n.classes.join('.')}> -> ${n.font}`); (n.children || []).forEach(walkC); };
  walkC(tree);
  t(`${name}: ${bodyTimes} quote/note body text nodes all Times New Roman${bodyBad.length ? ' — ' + bodyBad.slice(0, 3).join('; ') : ''}`, !bodyBad.length);
  t(`${name}: ${uiZM} UI text nodes all Zuniga Mission${uiBad.length ? ' — ' + uiBad.slice(0, 3).join('; ') : ''}`, !uiBad.length && uiZM > 0);
  t(`${name}: buttons / inputs use Zuniga Mission${controls.length ? ' — ' + controls.slice(0, 3).join('; ') : ''}`, !controls.length);
  if (/synthetic/.test(name)) {
    t(`${name}: aside, attribution, starred, Blake note and blurb bodies all found as Times`, bodyTimes >= 6);
  }
  if (/search results|feed|book page|saved$/.test(name)) t(`${name}: has quote/note bodies`, bodyTimes > 0);
}
done();
