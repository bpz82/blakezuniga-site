// t463u-zp-covers-amazon (Blake t463u): jacket images and a "Buy on Amazon" button, wired from data/books-meta.json (metadata only).
// DATA: every one of the sample book ids has a non-empty cover file under apps/zuniga-philosophy/covers/ (jpg/jpeg/webp/png) or is
// listed in books-meta.json with coverFallback:true; every book has an amazon.com link (/dp/ or /s?k=); no affiliate / tracking params;
// no secrets; books-meta.json holds no quote text (no long string fields, no notes/text keys).
// WIRING (module behaviour): meta merges by id; the Books grid and book page render <img> with alt = title + author when cover is set and
// keep the typographic cover under it; the book page shows a target=_blank rel=noopener "Buy on Amazon" link only for a safe amazon.com
// URL; affiliate URLs are dropped; missing meta leaves the app working with no buy button; <img> error handler reveals the typographic cover.
// Runs: Node (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence: FAIL on e30567f (no covers dir / no meta / no Buy button), PASS after: checks/logs/t463u-zp-covers-amazon-before.log / -after.log
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const done = () => { console.log(fails ? `FAIL (${fails})` : 'PASS'); process.exit(fails ? 1 : 0); };

const sample = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8'));
const ids = sample.books.map((b) => b.id);
t('sample has 34 book ids (t464u/t466u)', ids.length === 34);

// ---------- DATA
const metaPath = path.join(dir, 'data/books-meta.json');
const coversDir = path.join(dir, 'covers');
t('data/books-meta.json exists', existsSync(metaPath));
t('covers/ directory exists', existsSync(coversDir) && statSync(coversDir).isDirectory());
let meta = null;
try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { /* reported below */ }
t('books-meta.json parses as { books: [...] }', !!meta && Array.isArray(meta.books));
const rows = new Map(((meta && meta.books) || []).map((r) => [r && r.id, r]));
t('books-meta.json has a row for every sample book id (and no unknown ids)', ids.every((id) => rows.has(id)) && [...rows.keys()].every((id) => ids.includes(id)));
const IMG = /\.(?:jpe?g|webp|png)$/i;
const files = existsSync(coversDir) ? readdirSync(coversDir) : [];
const missingCover = [], badCover = [], fallback = [];
for (const id of ids) {
  const r = rows.get(id) || {};
  if (r.coverFallback === true) { fallback.push(id); continue; }
  const c = typeof r.cover === 'string' ? r.cover : '';
  const ok = /^covers\/[\w.-]+$/.test(c) && IMG.test(c) && !c.includes('..') && existsSync(path.join(dir, c)) && statSync(path.join(dir, c)).size > 500;
  if (!ok) (c ? badCover : missingCover).push(id + (c ? ' (' + c + ')' : ''));
}
t(`every book has a non-empty cover file or coverFallback:true (${ids.length - fallback.length - missingCover.length - badCover.length} files, ${fallback.length} fallback)` +
  (missingCover.length || badCover.length ? ' — missing/bad: ' + [...missingCover, ...badCover].slice(0, 6).join(', ') : ''), !missingCover.length && !badCover.length);
t('cover images are small (each <= 400 KB)', files.every((f) => statSync(path.join(coversDir, f)).size <= 400 * 1024));
t('covers/ holds only images', files.every((f) => IMG.test(f)));
const AMZ = /^https:\/\/(?:www\.)?amazon\.com\/(?:dp\/[A-Z0-9]{10}\/?|s\?k=[^&#\s]+)$/i;
const badAmz = ids.filter((id) => { const a = (rows.get(id) || {}).amazon; return typeof a !== 'string' || !AMZ.test(a); });
t('every book has an amazon.com /dp/<ASIN> or /s?k=<query> link' + (badAmz.length ? ' — bad: ' + badAmz.slice(0, 6).join(', ') : ''), !badAmz.length);
const metaText = existsSync(metaPath) ? readFileSync(metaPath, 'utf8') : '';
t('no affiliate / tracking params (tag=, ref=, linkCode, creative, camp, th=, psc=)', !!metaText && !/[?&;](?:tag|ref|ref_|linkCode|linkId|creative|creativeASIN|camp|th|psc|smid|qid|sr)=|\/ref=/i.test(metaText));
t('no secrets (keys, tokens, passwords, emails)', !!metaText && !/api[_-]?key|secret|token|password|bearer|sk-[A-Za-z0-9]{10}|AKIA[0-9A-Z]{8}|[\w.+-]+@[\w-]+\.[\w.]+/i.test(metaText));
const longStr = [];
const scan = (v, k = '') => { if (typeof v === 'string') { if (v.length > 200) longStr.push(k); } else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) scan(vv, kk); };
scan(meta);
t('books-meta.json has no long strings (no quote text)', !!meta && !longStr.length);
t('books-meta.json has no notes / text / quote / blurb keys', !!metaText && !/"(?:notes|text|quotes?|blurb|aside|attribution)"\s*:/.test(metaText));
t('books-meta.json is small (<= 80 KB)', !!metaText && metaText.length <= 80 * 1024);

// ---------- WIRING
const modPath = path.join(dir, 'zuniga-philosophy.js');
const m = await import(pathToFileURL(modPath).href);
const has = (n) => typeof m[n] === 'function';
t('module exports mergeMeta / safeAmazon / safeCover', has('mergeMeta') && has('safeAmazon') && has('safeCover'));
if (!has('mergeMeta') || !has('safeAmazon') || !has('safeCover')) {
  t('Buy on Amazon wiring present in module source', /Buy on Amazon/.test(readFileSync(modPath, 'utf8')));
  done();
}
t('safeAmazon accepts /dp/ and /s?k= links', m.safeAmazon('https://www.amazon.com/dp/0140449337') !== '' && m.safeAmazon('https://www.amazon.com/s?k=meditations+marcus+aurelius') !== '');
t('safeAmazon rejects affiliate / foreign / javascript links',
  ['https://www.amazon.com/dp/0140449337?tag=blake-20', 'https://www.amazon.com/dp/0140449337/ref=sr_1_1', 'https://www.amazon.com/dp/0140449337?linkCode=ll1', 'https://evil.example/amazon.com/dp/1', 'https://amazon.com.evil.example/dp/1', 'javascript:alert(1)', '', 'http://www.amazon.co.uk/dp/1'].every((u) => m.safeAmazon(u) === ''));
t('safeCover accepts covers/<id>.jpg|webp|png and rejects traversal / absolute / other types',
  m.safeCover('covers/meditations.jpg') && m.safeCover('covers/a.webp') && !m.safeCover('../x.jpg') && !m.safeCover('covers/../x.jpg') && !m.safeCover('https://x/y.jpg') && !m.safeCover('/covers/a.jpg') && !m.safeCover('covers/a.svg') && !m.safeCover('covers/a.jpg?x=1'));

const mk = (extra = {}) => ({ sample: true, books: [{ id: 'bk1', title: 'Meditations', author: 'Marcus Aurelius', toc_page: 1, full_note_count: 2, notes: [{ id: 'bk1-n1', text: 'A line.', kind: 'quote' }], ...extra },
  { id: 'bk2', title: 'No Meta Book', author: 'Nobody', toc_page: 2, full_note_count: 1, notes: [{ id: 'bk2-n1', text: 'Another line.', kind: 'quote' }] }] });
const goodMeta = { books: [{ id: 'bk1', cover: 'covers/bk1.jpg', amazon: 'https://www.amazon.com/dp/0140449337', isbn: 'x', source: 'y', amazonKind: 'dp', notes: 'ignored' }, { id: 'ghost', cover: 'covers/ghost.jpg' }] };
const lib = m.mergeMeta(m.normalizeLibrary(mk()), goodMeta);
const [b1, b2] = lib.books;
t('meta merges by id (cover + amazon); unknown fields and ids ignored', b1.cover === 'covers/bk1.jpg' && b1.amazon === 'https://www.amazon.com/dp/0140449337' && !b2.cover && !b2.amazon);

const grid = m.renderBooksGrid(lib, 'toc', 'grid', '');
t('Books grid: cover <img> with alt = "title by author" for a book with a cover', /<img class="zp-cover-img" src="[^"]*\/covers\/bk1\.jpg" alt="Meditations by Marcus Aurelius"/.test(grid));
t('Books grid: typographic cover stays under the image, and is the only cover for a book without one', /zp-cover-title">Meditations</.test(grid) && /zp-cover-title">No Meta Book</.test(grid) && (grid.match(/<img /g) || []).length === 1);
t('cover src resolves next to the module (apps/zuniga-philosophy/covers/...)', new RegExp('src="file://[^"]*/apps/zuniga-philosophy/covers/bk1\\.jpg"').test(grid));
t('coversBase can be overridden', /src="https:\/\/cdn\.example\/zp\/covers\/bk1\.jpg"/.test(m.renderCover(b1, 'https://cdn.example/zp/')));
const pg = m.renderBook(lib, b1, new Set());
t('book page: jacket image shown', /<img class="zp-cover-img"[^>]*alt="Meditations by Marcus Aurelius"/.test(pg));
t('book page: "Buy on Amazon" link, target=_blank, rel=noopener, correct href', /<a class="zp-buy" href="https:\/\/www\.amazon\.com\/dp\/0140449337" target="_blank" rel="noopener">Buy on Amazon<\/a>/.test(pg));
t('book page: no tag= / ref= / linkCode in any link', !/<a [^>]*(?:[?&;]tag=|[?&;\/]ref=|linkCode)/.test(pg));
const pg2 = m.renderBook(lib, b2, new Set());
t('book page without an amazon link: no Buy button, no <img>', !/Buy on Amazon|zp-buy/.test(pg2) && !/<img /.test(pg2));
const bad = m.mergeMeta(m.normalizeLibrary(mk()), { books: [{ id: 'bk1', cover: '../../etc/x.jpg', amazon: 'https://www.amazon.com/dp/0140449337?tag=evil-20' }] });
t('unsafe meta (affiliate tag, traversal) is dropped: no img, no Buy button', !/<img |zp-buy/.test(m.renderBook(bad, bad.books[0], new Set())));
const feedHtml = m.renderFeed(m.renderFeedCards(m.allItems(lib), new Set()));
t('feed cards do not render Buy buttons (t469u: Feed cards may now carry small jacket thumbs)', !/zp-buy/.test(feedHtml));

// loadLibrary: merges ./data/books-meta.json (or opts.metaUrl); a missing meta still loads the library
const seen = [];
const fetchOk = async (u) => { seen.push(u); return { ok: true, status: 200, json: async () => (/meta/.test(u) ? goodMeta : mk()) }; };
const L1 = await m.loadLibrary({ booksUrl: 'sample.json', fetch: fetchOk });
t('loadLibrary fetches books-meta.json by default (next to the module) and merges it', seen.some((u) => /\/data\/books-meta\.json$/.test(u)) && L1.books[0].amazon === 'https://www.amazon.com/dp/0140449337');
seen.length = 0;
const L2 = await m.loadLibrary({ booksUrl: 'sample.json', metaUrl: 'https://cdn.example/meta.json', fetch: fetchOk });
t('opts.metaUrl overrides the meta location', seen.includes('https://cdn.example/meta.json') && L2.books[0].cover === 'covers/bk1.jpg');
const warn = console.warn; console.warn = () => {};
const L3 = await m.loadLibrary({ booksUrl: 'sample.json', fetch: async (u) => (/meta/.test(u) ? { ok: false, status: 404 } : { ok: true, json: async () => mk() }) });
const L4 = await m.loadLibrary({ booksUrl: 'sample.json', fetch: async (u) => { if (/meta/.test(u)) throw new TypeError('network'); return { ok: true, json: async () => mk() }; } });
console.warn = warn;
t('missing / failing books-meta.json: library still loads, typographic covers, no buy button', L3.books.length === 2 && !L3.error && !L3.books[0].cover && !L3.books[0].amazon && L4.books.length === 2 && !L4.error);

// image error -> typographic cover: the mount registers a capturing error listener that drops a broken jacket
const listeners = [];
const el = { innerHTML: '', addEventListener: (ev, fn, cap) => listeners.push({ ev, fn, cap }), removeEventListener() {}, querySelector: () => null };
const h = m.mountZunigaPhilosophy(el, { fetch: fetchOk, booksUrl: 'sample.json' });
await h.ready;
const errL = listeners.find((l) => l.ev === 'error' && l.cap === true);
t('mount listens (capture) for <img> error events', !!errL);
let removed = false; const attrs = {};
const cov = { setAttribute: (k, v) => { attrs[k] = v; } };
const img = { tagName: 'IMG', classList: { contains: (c) => c === 'zp-cover-img' }, parentNode: cov, remove() { removed = true; } };
if (errL) errL.fn({ target: img });
t('a failed jacket is removed so the typographic cover shows', removed && attrs['aria-hidden'] === 'true');
h.unmount();
done();
