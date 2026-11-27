// t479u-vv-seo (Blake t479u / t482u): Vinyl Vault SEO with ZERO visitor-visible change and ZERO load-time change.
// Every cover gets a descriptive alt (artist, album, year + ONE of six collection-phrase families, rotated by id % 6),
// all 113 covers are in the image sitemap (loc + title + caption), a generated schema.org Collection of MusicAlbum lives in
// apps/vinyl-vault/collection.jsonld (not linked from any page), and index.html gains at most one tiny Collection node linked to #blake.
// Runs: Node (no browser, source / static checks). Runtime < 2 s. Exits nonzero on fail (2 = ENV, e.g. git missing).
// MEASUREMENT METHOD (disclosed):
//   - Baseline = git object ba754ae (live main when t479u started), read with `git show ba754ae:<path>`.
//   - Alts: imports coverAlt() from apps/vinyl-vault/vinyl-vault.js (the same pure function the grid and popup call) and
//     classifies each alt by an independent table of exact family tails kept in THIS file (not imported from the helper).
//   - "No visual change": harness.css, widgets.js, harness.js, chrome.css/js, amp-chrome.css/js, amp-transit.css are byte-identical
//     to baseline; index.html is identical once <script type="application/ld+json"> blocks are removed; vinyl-vault.js is identical
//     to baseline once full-line // comments, the marked t479u helper block and the img/popImg .alt assignment lines are removed.
//   - Sizes: index.html raw bytes and gzip bytes (zlib gzipSync level 6 and level 9) vs baseline. FAIL if gzip delta >= 2048.
//   - First-paint requests: static count of URL references (script src, link href, img src, static/dynamic import specifiers,
//     fetch('...') / new URL('...') literals) in index.html plus every local module it loads through <script src> and static
//     imports (dynamic import() targets are counted but not followed; the vault is only dynamically imported). Before == after.
// Evidence (new check: FAIL before the change, PASS after):
//   before (ba754ae tree + this check only): checks/logs/t479u-vv-seo-before.log -> FAIL (exit 1)
//     produced with the final version of this file run inside `git archive ba754ae` (extracted outside the repo, GIT_DIR set to
//     this repo so the baseline reads still work). An earlier draft was also run on the untouched worktree: FAIL (exit 1).
//   after  (t479u implementation):          checks/logs/t479u-vv-seo-after.log  -> PASS (exit 0)
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const BASE = 'ba754aea4f2ba7b85faf1e527056f2d8336a3121';
const SITE = 'https://blakezuniga.com/';
const VAULT = SITE + 'apps/vinyl-vault/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(root, p), 'utf8');
const rdOpt = (p) => (existsSync(path.join(root, p)) ? rd(p) : null);
let fails = 0;
const t = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const info = (s) => console.log(`     ${s}`);
const baseCache = new Map();
function base(p) {
  if (baseCache.has(p)) return baseCache.get(p);
  let v;
  try { v = execFileSync('git', ['-C', root, 'show', `${BASE}:${p}`], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); }
  catch (_) { v = null; }
  baseCache.set(p, v);
  return v;
}
if (!base('index.html')) { console.log(`ENV cannot read baseline ${BASE} with git`); process.exit(2); }

// ---------- the six families: exact tails (independent of the helper) ----------
const TAILS = [
  ["part of Blake Zuniga's collection", "from Blake Zuniga's record collection"],
  ["in Blake Z Music's record collection", 'from the Blake Z Music vinyl collection'],
  ["from Zuniga's vinyl collection", "in Zuniga's record collection"],
  ['from the Zuniga Music vinyl vault', 'in the Zuniga Music record collection'],
  ["part of guitarist Blake Zuniga's collection", 'from the vinyl collection behind the Blake Zuniga guitar sound'],
  ['from the folk blues vinyl vault of Blake Zuniga', 'in the folk blues record collection of Blake Zuniga'],
];
const PHRASE = [/Blake Zuniga/, /Blake Z Music/, /Zuniga/, /Zuniga Music/, /Blake Zuniga guitar|guitarist Blake Zuniga/, /folk blues/];
// markers that only their own family may use (anti-stacking)
const EXCLUSIVE = [[1, /Blake Z Music/i], [3, /Zuniga Music/i], [4, /guitar/i], [5, /folk blues|blues folk/i]];
const famOfId = (id) => { const n = parseInt(id, 10); return Number.isFinite(n) ? n % 6 : -1; };
const head = (r) => `${r.artist} – ${r.album} (${r.year})`;
// returns family index of the alt (or -1), requiring: fixed head, exactly one known tail, no foreign exclusive marker in the tail
function classify(r, text, prefix) {
  const start = prefix + ', ';
  if (!text.startsWith(start)) return -1;
  const tail = text.slice(start.length);
  const hits = [];
  TAILS.forEach((ts, f) => { if (ts.includes(tail)) hits.push(f); });
  if (hits.length !== 1) return -1;
  const f = hits[0];
  if (!PHRASE[f].test(tail)) return -1;
  for (const [g, re] of EXCLUSIVE) if (g !== f && re.test(tail)) return -1;
  return f;
}

const records = JSON.parse(rd('apps/vinyl-vault/records.json'));
t('records.json has 113 records', Array.isArray(records) && records.length === 113, `${records.length}`);

// ---------- a/b/c: alts ----------
const vvPath = 'apps/vinyl-vault/vinyl-vault.js';
const vv = rd(vvPath);
let coverAlt = null;
try {
  const mod = await import(pathToFileURL(path.join(root, vvPath)).href);
  coverAlt = typeof mod.coverAlt === 'function' ? mod.coverAlt : null;
} catch (e) { info('import vinyl-vault.js failed: ' + e.message); }
t('a. vinyl-vault.js exports pure coverAlt(record)', !!coverAlt);
const counts = [0, 0, 0, 0, 0, 0];
let altOk = 0, altBad = [];
const alts = new Map();
for (const r of records) {
  // runtime shape (parseRecords): id is a String, year an integer
  let alt = '';
  try { alt = coverAlt ? coverAlt({ id: String(r.id), artist: r.artist.trim(), album: r.album.trim(), year: r.year }) : ''; } catch (_) { alt = ''; }
  alts.set(r.id, alt);
  const has = !!alt && alt.includes(r.artist) && alt.includes(r.album) && alt.includes(String(r.year));
  const f = alt ? classify(r, alt, head(r) + ' vinyl record cover') : -1;
  if (has && f >= 0 && f === famOfId(r.id)) { altOk++; counts[f]++; } else altBad.push(r.id);
}
t('a. all 113 records get a non-empty alt', records.every((r) => alts.get(r.id)), `${[...alts.values()].filter(Boolean).length}/113`);
t('b. every alt has artist, album, year and exactly one family (= id % 6)', altOk === 113, altBad.length ? 'bad ids: ' + altBad.slice(0, 10).join(',') : '113/113');
info('family counts [Blake Zuniga, Blake Z Music, Zuniga, Zuniga Music, Blake Zuniga guitar, folk blues] = ' + JSON.stringify(counts));
t('c. six families equal (max - min <= 1)', Math.max(...counts) - Math.min(...counts) <= 1 && counts.reduce((a, b) => a + b, 0) === 113);
const alt002 = alts.get('002');
if (alt002) info('example 002: ' + alt002);

// wiring: grid + popup use the helper, no empty alts left
t('a. grid img.alt = coverAlt(r)', /\n\s*img\.alt = coverAlt\(r\);/.test(vv));
t('a. show() sets popImg.alt = coverAlt(r)', (() => {
  const i = vv.indexOf('function show(');
  const j = i >= 0 ? vv.indexOf('\n    }\n', i) : -1;
  return i >= 0 && j > i && /popImg\.alt = coverAlt\(r\);/.test(vv.slice(i, j));
})());
t("a. no empty alt assignments left (.alt = '')", !/\.alt\s*=\s*(''|""|``)/.test(vv));
t('a. no other alt wording left', (vv.match(/\.alt\s*=/g) || []).length === 2, `${(vv.match(/\.alt\s*=/g) || []).length} assignments`);

// ---------- d: image sitemap ----------
const sm = rd('sitemap.xml');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
t('d. sitemap.xml: no bare & (well-formed entities)', !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(sm));
t('d. sitemap.xml declares the image namespace', sm.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
const urls = [...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const home = urls.find((u) => (u.match(/<loc>([^<]*)<\/loc>/) || [])[1] === SITE) || '';
t('d. homepage <url> present', !!home);
const imgs = new Map();
for (const m of home.matchAll(/<image:image>([\s\S]*?)<\/image:image>/g)) {
  const g = (tag) => { const x = m[1].match(new RegExp(`<image:${tag}>([^<]*)</image:${tag}>`)); return x ? unesc(x[1]) : ''; };
  imgs.set(g('loc'), { title: g('title'), caption: g('caption') });
}
t('d. OG image entry still present', imgs.has(SITE + 'assets/og/blake-zuniga-og.jpg'));
let smOk = 0; const smBad = [];
for (const r of records) {
  const e = imgs.get(VAULT + r.cover);
  const f = famOfId(r.id);
  const good = e && existsSync(path.join(root, 'apps/vinyl-vault', r.cover)) &&
    classify(r, e.title, head(r) + ' vinyl') === f && classify(r, e.caption, head(r) + ' vinyl record cover') === f;
  if (good) smOk++; else smBad.push(r.id);
}
t('d. all 113 covers in the image sitemap with loc, title, caption (artist, album, year, family)', smOk === 113, smBad.length ? `${smOk}/113, bad: ${smBad.slice(0, 10).join(',')}` : '113/113');
t('d. sitemap image count = 113 covers + OG', imgs.size === 114, `${imgs.size}`);

// ---------- e: JSON-LD ----------
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const BLAKE = SITE + '#blake', COLL = SITE + '#vinyl-vault';
const jl = rdOpt('apps/vinyl-vault/collection.jsonld');
let coll = null;
try { coll = jl ? JSON.parse(jl) : null; } catch (e) { info('collection.jsonld parse error: ' + e.message); }
t('e. apps/vinyl-vault/collection.jsonld exists and parses', !!coll);
if (coll) {
  t('e. collection.jsonld: schema.org Collection #vinyl-vault, creator #blake', coll['@context'] === 'https://schema.org' && coll['@type'] === 'Collection' &&
    coll['@id'] === COLL && coll.creator && coll.creator['@id'] === BLAKE);
  const parts = Array.isArray(coll.hasPart) ? coll.hasPart : [];
  let ok = 0;
  for (const r of records) {
    const a = parts.find((p) => p && p.image === VAULT + r.cover);
    if (a && a['@type'] === 'MusicAlbum' && a.name === r.album && a.byArtist && a.byArtist.name === r.artist &&
      a.datePublished === String(r.year) && a.isPartOf && a.isPartOf['@id'] === COLL) ok++;
  }
  t('e. 113 MusicAlbum entries with name, byArtist, datePublished, image, isPartOf #vinyl-vault', ok === 113 && parts.length === 113 && coll.collectionSize === 113, `${ok}/${parts.length}`);
}
const html = rd('index.html'), baseHtml = base('index.html').toString('utf8');
const graphOf = (h) => { try { return ldBlocks(h).flatMap((b) => JSON.parse(b)['@graph'] || []); } catch (_) { return null; } };
const g1 = graphOf(html), g0 = graphOf(baseHtml);
t('e. index.html JSON-LD parses', !!g1);
if (g1 && g0) {
  const others = g1.filter((n) => n['@id'] !== COLL);
  t('e. existing graph (WebSite, Person #blake, MusicGroup, ProfilePage) unchanged', JSON.stringify(others) === JSON.stringify(g0));
  const n = g1.find((x) => x['@id'] === COLL);
  t('e. index.html has one tiny Collection node linked to #blake (no inlined albums)', !!n && n['@type'] === 'Collection' &&
    n.creator && n.creator['@id'] === BLAKE && n.collectionSize === records.length && !('hasPart' in n) && JSON.stringify(n).length < 600,
  n ? `${JSON.stringify(n).length} bytes` : 'missing');
}

// ---------- f: no visual / load-path change ----------
for (const p of ['harness.css', 'harness.js', 'widgets.js', 'chrome.css', 'chrome.js', 'amp-chrome.css', 'amp-chrome.js', 'amp-transit.css', 'widget-ids.js', 'layout-runtime.js']) {
  const b = base(p), c = existsSync(path.join(root, p)) ? readFileSync(path.join(root, p)) : null;
  t(`f. ${p} byte-identical to baseline`, !!b && !!c && Buffer.compare(b, c) === 0);
}
const noLd = (h) => h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
t('f. index.html identical to baseline outside the JSON-LD block', noLd(html) === noLd(baseHtml));
const normVV = (s) => s.replace(/\n[ \t]*\/\/ t479u-seo-begin[\s\S]*?\/\/ t479u-seo-end[^\n]*/g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l) && !/^\s*(img|popImg)\.alt = .*;\s*$/.test(l)).join('\n');
const baseVV = base(vvPath).toString('utf8');
t('f. vinyl-vault.js identical to baseline except comments, alt assignments and the helper block', normVV(vv) === normVV(baseVV));
const helper = (vv.match(/\/\/ t479u-seo-begin([\s\S]*?)\/\/ t479u-seo-end/) || [])[1] || '';
t('f. helper block is pure (no fetch / import / URL / src / DOM / style)', !!helper && !/fetch|import|URL|\.src|document|window|createElement|style|innerHTML|preload/.test(helper));
const net = (s) => ['fetch(', 'import(', 'new URL(', '.src =', 'preload', 'createElement(\'img\')'].map((k) => s.split(k).length - 1).join(',');
t('f. vinyl-vault.js network primitives unchanged (fetch, import(), new URL, .src, preload, img)', net(vv) === net(baseVV), `${net(baseVV)} -> ${net(vv)}`);
for (const p of ['index.html', 'widgets.js', 'harness.js', 'apps/vinyl-vault/vinyl-vault.js', '404.html']) {
  const s = rdOpt(p) || '';
  t(`f. ${p} does not reference collection.jsonld or the build script`, !/collection\.jsonld|build-seo/.test(s));
}

// ---------- g: sizes + first-paint requests ----------
const rawB = Buffer.byteLength(baseHtml), rawA = Buffer.byteLength(html);
const gz = (s, level) => gzipSync(Buffer.from(s), { level }).length;
const d6 = gz(html, 6) - gz(baseHtml, 6), d9 = gz(html, 9) - gz(baseHtml, 9);
info(`index.html raw ${rawB} -> ${rawA} (delta ${rawA - rawB} B); gzip-6 ${gz(baseHtml, 6)} -> ${gz(html, 6)} (delta ${d6} B); gzip-9 ${gz(baseHtml, 9)} -> ${gz(html, 9)} (delta ${d9} B)`);
t('g. index.html gzip delta < 2048 B', d6 < 2048 && d9 < 2048);
const recB = base('apps/vinyl-vault/records.json'), recA = readFileSync(path.join(root, 'apps/vinyl-vault/records.json'));
info(`records.json ${recB.length} -> ${recA.length} (delta ${recA.length - recB.length} B)`);
t('g. records.json unchanged (delta 0, identical bytes)', Buffer.compare(recB, recA) === 0);

function firstPaintRefs(readF) {
  const refs = [];
  const seen = new Set();
  const scan = (src, file) => {
    const add = (kind, u) => refs.push(`${file}:${kind}:${u}`);
    const local = [];
    if (file.endsWith('.html')) {
      for (const m of src.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)/g)) { add('script', m[1]); local.push(m[1]); }
      for (const m of src.matchAll(/<link\b[^>]*\bhref=["']([^"']+)/g)) add('link', m[1]);
      for (const m of src.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)/g)) add('img', m[1]);
    }
    for (const m of src.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) { add('import', m[1]); local.push(m[1]); }
    for (const m of src.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) { add('import', m[1]); local.push(m[1]); }
    for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)/g)) add('dynimport', m[1]);
    for (const m of src.matchAll(/\bfetch\s*\(\s*['"`]([^'"`]+)/g)) add('fetch', m[1]);
    for (const m of src.matchAll(/new URL\(\s*['"`]([^'"`]+)/g)) add('url', m[1]);
    for (const u of local) {
      if (/^[a-z]+:|^\/\//i.test(u) || !/^\.{0,2}\/|^[\w-]+(\/[\w.-]+)*\.m?js$/.test(u)) continue; // bare / remote: not followed
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(file), u));
      if (seen.has(p)) continue;
      seen.add(p);
      const s = readF(p);
      if (s != null) scan(s, p);
    }
  };
  scan(readF('index.html'), 'index.html');
  return { refs, files: [...seen] };
}
const fpA = firstPaintRefs((p) => rdOpt(p));
const fpB = firstPaintRefs((p) => { const b = base(p); return b ? b.toString('utf8') : null; });
info(`first-paint URL references: before ${fpB.refs.length} (${fpB.files.length} local modules) -> after ${fpA.refs.length} (${fpA.files.length} local modules)`);
t('g. first-paint request references unchanged (same count, same set)', fpA.refs.length === fpB.refs.length && fpA.refs.join('\n') === fpB.refs.join('\n'));
t('g. vinyl-vault.js not in the first-paint module set', !fpA.files.includes('apps/vinyl-vault/vinyl-vault.js'));

// ---------- h: robots ----------
t('h. robots.txt keeps Sitemap: https://blakezuniga.com/sitemap.xml', /^Sitemap: https:\/\/blakezuniga\.com\/sitemap\.xml\s*$/m.test(rd('robots.txt')));

// ---------- i: no ZP / editor / photo manager ----------
const allFiles = [];
const walk = (d) => {
  for (const e of readdirSync(path.join(root, d), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = d ? d + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p); else allFiles.push(p);
  }
};
walk('');
const banned = allFiles.filter((p) => !p.startsWith('checks/') && /(^|\/)(zuniga-philosophy\/|zp-hook\.js|layout-editor|editor\/)|photo-?manager/i.test(p));
t('i. no Zuniga Philosophy / layout editor / photo manager files', banned.length === 0, banned.slice(0, 6).join(', '));
t('i. no ?zp=1 / ?edit=1 hook in index.html', !/[?&]zp=1|[?&]edit=1/.test(html));

console.log(fails ? `FAIL t479u-vv-seo (${fails} failing)` : 'PASS t479u-vv-seo');
process.exit(fails ? 1 : 0);
