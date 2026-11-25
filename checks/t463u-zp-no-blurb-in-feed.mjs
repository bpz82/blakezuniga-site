// t463u-zp-no-blurb-in-feed (Blake t463u): the per-book "Blake · on this book" blurb never appears in the Feed, Search or Saved.
// It stays only on that book's page (the existing blurb section).
// Covers: allItems() (feed source) has no role === 'blurb'; a full feed pass renders no blurb text and no "on this book"; searchLibrary()
// returns no blurb notes, does not search blurb text, does not use blurb text for book chips (title/author only); rendered search results
// never contain "on this book"; Saved skips blurbs; book pages still render the blurb section.
// Runs: Node (no browser). Runtime < 1 s. Exits nonzero on fail.
// Evidence: FAIL on e30567f (blurbs in feed/search), PASS after: checks/logs/t463u-zp-no-blurb-in-feed-before.log / -after.log
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const done = () => { console.log(fails ? `FAIL (${fails})` : 'PASS'); process.exit(fails ? 1 : 0); };

const m = await import(pathToFileURL(path.join(dir, 'zuniga-philosophy.js')).href);
const sample = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8'));
const synth = { id: 'blurb-test', title: 'Zanzibar Almanac', author: 'Test Author', toc_page: 999, blurb: 'Quixotic blurbword lives only on the book page.', full_note_count: 3, notes: [
  { id: 'blurb-test-b', text: 'Quixotic blurbword lives only on the book page.', kind: 'note', role: 'blurb' },
  { id: 'blurb-test-n1', text: 'A plain quote about the river.', kind: 'quote' },
  { id: 'blurb-test-n2', text: 'My own thought about the river. -bz', kind: 'note' },
] };
// Another book whose ONLY mention of "gnomic" is in its blurb: must not become a book chip.
const synth2 = { id: 'blurb-chip', title: 'Plain Title', author: 'Plain Author', toc_page: 1000, blurb: 'A gnomic hidden marker.', full_note_count: 2, notes: [
  { id: 'blurb-chip-b', text: 'A gnomic hidden marker.', kind: 'note', role: 'blurb' },
  { id: 'blurb-chip-n1', text: 'Ordinary words only.', kind: 'quote' },
] };
const lib = m.normalizeLibrary({ sample: true, books: [...sample.books, synth, synth2] });
const blurbs = lib.books.flatMap((b) => b.notes.filter((n) => n.role === 'blurb').map((n) => ({ b, n })));
t(`library has blurb notes to test with (${blurbs.length} incl. synthetic)`, blurbs.length >= 38);

// ---- feed
const items = m.allItems(lib);
t('allItems() (feed source) has no role === "blurb"', items.length > 0 && items.every((x) => x.note.role !== 'blurb'));
t('allItems() count = all notes minus blurbs', items.length === lib.books.reduce((s, b) => s + b.notes.length, 0) - blurbs.length);
const feedHtml = m.renderFeed(m.renderFeedCards(items, new Set()));
t('full feed pass renders no "on this book"', !/on this book/i.test(feedHtml));
t('full feed pass renders no blurb text', blurbs.every(({ n }) => !feedHtml.includes(m.esc(n.text))) && !/blurbword/.test(feedHtml));
const feed = m.makeFeed(items);
t('shuffled feed never yields a blurb', feed.next(items.length * 2).every((x) => x.note.role !== 'blurb'));

// ---- search
const real = blurbs.find(({ b }) => b.id === 'meditations');
const realWord = real ? real.n.text.split(/\s+/).filter((w) => w.length > 6).pop() : '';
for (const q of ['blurbword', 'quixotic', 'gnomic', 'on this book', realWord].filter(Boolean)) {
  const r = m.searchLibrary(lib, q);
  const html = m.renderSearchResults(lib, q, new Set());
  t(`search "${q}": no blurb notes returned`, r.notes.every(({ note }) => note.role !== 'blurb'));
  // The empty state echoes the user's own query, so test the tag and blurb markup rather than the bare phrase.
  t(`search "${q}": results never show the "on this book" tag or a blurb`, !/Blake · on this book|zp-blurb/i.test(html) && (q === 'on this book' || !/on this book/i.test(html)));
}
t('search for a blurb-only word finds nothing (blurb text not searched)', m.searchLibrary(lib, 'blurbword').total === 0 && m.searchLibrary(lib, 'gnomic').total === 0);
t('blurb-only word gives no book chip (title/author only)', m.searchLibrary(lib, 'gnomic').books.length === 0 && m.searchLibrary(lib, 'blurbword').books.length === 0);
t('book chips still match title / author', m.searchLibrary(lib, 'zanzibar').books.some((b) => b.id === 'blurb-test') && m.searchLibrary(lib, 'aurelius').books.some((b) => b.id === 'meditations'));
t('ordinary note search still works ("river" finds the synthetic quote and note)', m.searchLibrary(lib, 'river').notes.filter(({ book }) => book.id === 'blurb-test').length === 2);

// ---- every rendered passage card in feed/search/saved is blurb-free
const allSaved = new Set(lib.books.flatMap((b) => b.notes.map((n) => n.id)));
const savedHtml = m.renderSaved(lib, allSaved);
t('Saved skips blurbs even when a blurb id is in the saved set', !/on this book/i.test(savedHtml) && !/blurbword/.test(savedHtml) && !/data-note-id="blurb-test-b"/.test(savedHtml));
t('renderItem never emits the "Blake · on this book" tag for a blurb note', blurbs.every(({ b, n }) => !/on this book/i.test(m.renderItem(b, n, { credit: true }))));

// ---- book page keeps its blurb section
const tb = lib.books.find((b) => b.id === 'blurb-test');
const page = m.renderBook(lib, tb, new Set());
t('book page still renders the blurb section with its text', /class="zp-blurb"/.test(page) && /Quixotic blurbword/.test(page) && /Blake · on this book/.test(page));
const med = lib.books.find((b) => b.id === 'meditations');
t('Meditations book page still has its blurb section', /class="zp-blurb"/.test(m.renderBook(lib, med, new Set())));
t('blurb is not repeated as a list card on the book page', (page.match(/Quixotic blurbword/g) || []).length === 1);
done();
