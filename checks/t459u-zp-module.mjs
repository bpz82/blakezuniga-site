// t459u-zp-module (Blake t459u): the Zuniga Philosophy app exists as an isolated module + standalone page and works on the sample.
// Covers: standalone page apps/zuniga-philosophy/index.html imports the module; mountZunigaPhilosophy is exported and mounts on a
// minimal fake element; renders all 34 books (Meditations, Eric Ries, Brothers Karamazov); counts use full_note_count; search finds a
// known string; sort orders (TOC / A-Z / author); feed shows each item once per pass; a bad fetch never throws and shows a message;
// fullUrl failure falls back to the sample; unmount aborts the fetch and empties el.
// Runs: Node (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the build because the module/page are absent, PASS after):
//   checks/logs/t459u-zp-module-before.log -> FAIL, checks/logs/t459u-zp-module-after.log -> PASS
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const done = () => { console.log(fails ? `FAIL (${fails})` : 'PASS'); process.exit(fails ? 1 : 0); };

const pagePath = path.join(dir, 'index.html');
const modPath = path.join(dir, 'zuniga-philosophy.js');
const samplePath = path.join(dir, 'data/sample.json');
t('standalone page apps/zuniga-philosophy/index.html exists', existsSync(pagePath));
t('module apps/zuniga-philosophy/zuniga-philosophy.js exists', existsSync(modPath));
t('sample data apps/zuniga-philosophy/data/sample.json exists', existsSync(samplePath));
if (existsSync(pagePath)) {
  const page = readFileSync(pagePath, 'utf8');
  t('page imports ./zuniga-philosophy.js and calls mountZunigaPhilosophy', /import\(\s*'\.\/zuniga-philosophy\.js'\s*\)/.test(page) && /mountZunigaPhilosophy\(/.test(page));
  t('page is noindex (preview only)', /<meta name="robots" content="noindex/.test(page));
}
let m = null;
try { m = await import(pathToFileURL(modPath).href); } catch (e) { console.log('import error: ' + e.message); }
t('module imports and exports mountZunigaPhilosophy', !!m && typeof m.mountZunigaPhilosophy === 'function');
if (!m || !existsSync(samplePath)) done();

const json = JSON.parse(readFileSync(samplePath, 'utf8'));
const okFetch = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const fakeEl = () => ({ innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector: () => null });
const warn = console.warn; console.warn = () => {};

// load + normalize
const lib = m.normalizeLibrary(json);
t('34 books (t464u/t466u: Solomelo, Scientific Advertising, Born of This Land, and Ogilvy Unpublished removed from the app)', lib.books.length === 34);
t('sample flag carried', lib.sample === true);
t('books in TOC order by default (Meditations first, Extras last)', lib.books[0].id === 'meditations' && lib.books[lib.books.length - 1].title === 'Extras');
const med = lib.books.find((b) => b.title === 'Meditations');
t('counts use full_note_count (Meditations: 87 notes, 3 in sample)', med && med.fullCount === 87 && med.notes.length === 3);
t('cleaned spellings present: Eric Ries, Brothers Karamazov', lib.books.some((b) => b.author === 'Eric Ries') && lib.books.some((b) => b.title === 'Brothers Karamazov'));

// mount + render
const el = fakeEl();
const h = m.mountZunigaPhilosophy(el, { booksUrl: 'sample.json', fetch: okFetch(json) });
t('mount returns { unmount }', h && typeof h.unmount === 'function');
await h.ready;
t('after load: title "Zuniga Philosophy" and nav render (Feed is the default view, t465u)', /Zuniga Philosophy/.test(el.innerHTML) && />Feed</.test(el.innerHTML) && />Search</.test(el.innerHTML) && />Books</.test(el.innerHTML));
t('quiet "Sample preview" note shown (not an error)', /Sample preview/.test(el.innerHTML) && !/could not/.test(el.innerHTML));
h.unmount();
t('unmount empties el', el.innerHTML === '');

const books = m.renderBooks(lib, { sort: 'toc', layout: 'grid', bq: '' });
t('Books grid renders 34 cards incl. Meditations and Extras', (books.match(/class="zp-card"/g) || []).length === 34 && /Meditations/.test(books) && /Extras/.test(books));
t('Books grid shows "87 notes" for Meditations', /Meditations<\/span><span class="zp-cap-author">Marcus Aurelius<\/span><span class="zp-cap-count">87 notes/.test(books));
const filtered = m.renderBooksGrid(lib, 'toc', 'grid', 'hill');
t('Books search "hill" leaves only the two Napoleon Hill books visible', (filtered.match(/class="zp-card" data-act="open" data-book="[^"]+"(?! hidden) aria-label/g) || []).length === 2);
const az = m.sortBooks(lib.books, 'title').map((b) => b.title);
t('A-Z sort: "38 Letters..." first, "The Wealthy Gardener" sorted under W', az[0].startsWith('38 Letters') && az.indexOf('The Wealthy Gardener') > az.indexOf('Tough'));
const au = m.sortBooks(lib.books, 'author');
t('author sort: Aristotle first, books with no author last', au[0].author === 'Aristotle' && au[au.length - 1].author === '');
const page = m.renderBook(lib, med, new Set());
t('book page: title, author, blurb with Blake label, notes, sample note', /zp-book-title">Meditations</.test(page) && /Marcus Aurelius/.test(page) && /zp-blurb-text/.test(page) && /Blake · on this book/.test(page) && (page.match(/class="zp-item /g) || []).length === 2 && /Sample preview · 3 of 87 notes/.test(page));
t('book page: session metadata shown', /class="zp-session">Meditations 2022</.test(page));

// search
const r = m.searchLibrary(lib, 'REVERENT life');
t('search is case-insensitive, multi-word, finds the Meditations passage', r.notes.length >= 1 && r.notes[0].book.id === 'meditations');
t('search over title/author finds the book', m.searchLibrary(lib, 'aurelius').books.some((b) => b.id === 'meditations'));
t('search result links to the book + note', /data-act="open" data-book="meditations" data-note="meditations-n0001"/.test(m.renderSearchResults(lib, 'reverent', new Set())));
t('search highlights the match', /<mark class="zp-mark">reverent<\/mark>/.test(m.renderSearchResults(lib, 'reverent', new Set())));
t('empty result state', /Nothing found/.test(m.renderSearchResults(lib, 'zzqxj', new Set())));

// feed
const items = m.allItems(lib);
let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const feed = m.makeFeed(items, rng);
const pass1 = feed.next(items.length);
// t463u (Blake's product change): blurbs ("on this book") are no longer feed items, so the feed is the remaining sample notes minus the blurb notes (t466u: 101 notes in the 34-book sample).
const blurbN = lib.books.reduce((n, b) => n + b.notes.filter((x) => x.role === 'blurb').length, 0);
t('feed: one pass shows every item exactly once (all notes except blurbs, t463u)', new Set(pass1).size === items.length && pass1.length === items.length && items.every((x) => x.note.role !== 'blurb'));
const pass2 = feed.next(items.length);
t('feed: second pass is a new order and does not repeat the boundary item', pass2[0] !== pass1[pass1.length - 1] && pass2.some((x, i) => x !== pass1[i]));

// routes
t('deep link #zp/meditations/meditations-n0001', JSON.stringify(m.parseRoute('#zp/meditations/meditations-n0001')) === JSON.stringify({ view: 'book', bookId: 'meditations', noteId: 'meditations-n0001' }));
t('deep link #zp/feed', m.parseRoute('#zp/feed').view === 'feed' && m.parseRoute('#other') === null);

// failure paths: never throw
let threw = false;
const el2 = fakeEl();
let h2 = null;
try {
  h2 = m.mountZunigaPhilosophy(el2, { booksUrl: 'x', fetch: async () => ({ ok: false, status: 404 }) });
  await h2.ready;
} catch { threw = true; }
t('bad fetch (404): no throw, short message shown', !threw && /could not be opened/.test(el2.innerHTML));
threw = false;
try { const h3 = m.mountZunigaPhilosophy(fakeEl(), { fetch: async () => { throw new TypeError('network'); } }); await h3.ready; h3.unmount(); } catch { threw = true; }
t('network error: no throw', !threw);
threw = false;
try { m.mountZunigaPhilosophy(null).unmount(); } catch { threw = true; }
t('null element: no throw', !threw);
const fb = await m.loadLibrary({ fullUrl: '/api/zuniga-philosophy/books', booksUrl: 'sample', fetch: async (u) => (u === 'sample' ? { ok: true, json: async () => json } : { ok: false, status: 402 }) });
t('fullUrl failure falls back to the sample', fb.books.length === 34 && fb.sample === true);
const full = await m.loadLibrary({ fullUrl: '/api/full', booksUrl: 'sample', fetch: async (u) => ({ ok: true, json: async () => (u === '/api/full' ? { books: json.books } : json) }) });
t('fullUrl success is used (sample:false)', full.sample === false && full.books.length === 34);

// unmount aborts the fetch
let sig = null;
const el4 = fakeEl();
const h4 = m.mountZunigaPhilosophy(el4, { fetch: (u, o) => { sig = o.signal; return new Promise(() => {}); } });
h4.unmount();
t('unmount aborts the pending fetch and empties el', sig && sig.aborted === true && el4.innerHTML === '');
console.warn = warn;
done();
