// t466u-zp-book-count (Blake t464u + t466u): four books are out of the app (The Dream of Solomeo,
// Scientific Advertising, Born of This Land, Ogilvy Unpublished). The source notebook
// (books.clean.json / the .odt) is not in this repo and must not be added. Remaining sample has 34 books.
// Far and Away and the Gary Moore biography have jacket files from their Amazon product pages.
// 38 Letters from Rockefeller to His Son has a verified amazon.com/dp/ link and a cover.
// JJ Cale interview and Extras stay typographic (coverFallback) with an Amazon search link.
// FAIL on 67d6527 (38 books, the four ids still present, no Far/Away or Gary jackets, 38 Letters is a search URL).
// PASS after: checks/logs/t466u-zp-book-count-before.log / -after.log
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

const REMOVED = [
  'the-dream-of-solomelo',
  'scientific-advertising',
  'born-of-this-land-chung-ju-yung',
  'ogilvy-unpublished',
];
const sample = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8'));
const ids = (sample.books || []).map((b) => b.id);
t('sample has 34 books', ids.length === 34 && sample.book_count === 34);
t('the four removed ids are absent from sample.json', REMOVED.every((id) => !ids.includes(id)));
t('Meditations remains first and Extras remains last', ids[0] === 'meditations' && ids[ids.length - 1] === 'extras');
t('no cover files remain for the four removed books',
  REMOVED.every((id) => !existsSync(path.join(dir, 'covers', id + '.jpg')) && !existsSync(path.join(dir, 'covers', id + '.webp'))));

const meta = JSON.parse(readFileSync(path.join(dir, 'data/books-meta.json'), 'utf8'));
const rows = new Map((meta.books || []).map((r) => [r.id, r]));
t('books-meta.json has 34 rows, none of the removed ids, and matches sample ids',
  meta.books.length === 34 && REMOVED.every((id) => !rows.has(id)) && ids.every((id) => rows.has(id)));

const AMZ_DP = /^https:\/\/(?:www\.)?amazon\.com\/dp\/[A-Z0-9]{10}\/?$/i;
const AMZ_SEARCH = /^https:\/\/(?:www\.)?amazon\.com\/s\?k=[^&#\s]+$/i;
for (const bid of ['far-and-away', 'gary-moore-the-official-biography']) {
  const r = rows.get(bid) || {};
  const cover = path.join(dir, r.cover || '');
  t(`${bid} has a non-empty cover file (not coverFallback) and a /dp/ Amazon link`,
    r.coverFallback !== true && typeof r.cover === 'string' && existsSync(cover) && statSync(cover).size > 500
    && AMZ_DP.test(r.amazon || ''));
}
const letters = rows.get('38-letters-from-rockefeller-to-his-son') || {};
const lettersCover = path.join(dir, letters.cover || '');
t('38 Letters has a verified /dp/ Amazon link (not a search URL) and a cover file',
  AMZ_DP.test(letters.amazon || '') && !/s\?k=/.test(letters.amazon || '')
  && typeof letters.cover === 'string' && existsSync(lettersCover) && statSync(lettersCover).size > 500);

for (const bid of ['jj-cale-guitar-player-magazine-interview', 'extras']) {
  const r = rows.get(bid) || {};
  t(`${bid} stays typographic (coverFallback) with an Amazon search link`,
    r.coverFallback === true && AMZ_SEARCH.test(r.amazon || ''));
}

t('no affiliate / tracking params in books-meta amazon URLs',
  (meta.books || []).every((r) => !/[?&;](?:tag|ref|linkCode)=|\/ref=/.test(r.amazon || '')));

// The full notebook must stay out of this public repo
t('books.clean.json is not in the app or repo worktree path used by the check',
  !existsSync(path.join(dir, 'data/books.clean.json')) && !existsSync(path.join(root, 'books.clean.json')));

console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
