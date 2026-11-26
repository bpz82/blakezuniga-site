// t465u-zp-feed-first (Blake t465u): Feed is the first tab and the default view the app opens on.
// Tab order is Feed, Search, Books, Saved. parseRoute('#zp') / empty view and mount() without a hash
// open Feed (not Search). #zp/search still opens Search.
// FAIL on 67d6527 (order starts with Search; default view is search).
// PASS after: checks/logs/t465u-zp-feed-first-before.log / -after.log
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

const src = readFileSync(path.join(dir, 'zuniga-philosophy.js'), 'utf8');
const m = await import(pathToFileURL(path.join(dir, 'zuniga-philosophy.js')).href);

t("VIEWS starts with feed, then search, books, saved",
  Array.isArray(m.VIEWS) && m.VIEWS.join(',') === 'feed,search,books,saved'
  || /const VIEWS = \['feed', 'search', 'books', 'saved'\]/.test(src));

const header = m.renderHeader({ view: 'feed' }, { books: [], sample: true }, false);
const order = [...header.matchAll(/data-view="(feed|search|books|saved)"[^>]*>([^<]+)/g)].map((x) => x[1]);
t('header tab order is Feed, Search, Books, Saved', order.join(',') === 'feed,search,books,saved');
t('on the default Feed view, the Feed tab is aria-current="page"',
  /data-view="feed"[^>]*aria-current="page"/.test(header) || /aria-current="page"[^>]*data-view="feed"/.test(header) ||
  /data-view="feed" aria-current="page">Feed</.test(header));

t("parseRoute('#zp') and parseRoute('#zp/') open Feed",
  m.parseRoute('#zp')?.view === 'feed' && m.parseRoute('#zp/')?.view === 'feed');
t("parseRoute('#zp/search') still opens Search", m.parseRoute('#zp/search')?.view === 'search');
t("parseRoute('#zp/feed') opens Feed", m.parseRoute('#zp/feed')?.view === 'feed');
t("parseRoute('#zp/books') opens Books", m.parseRoute('#zp/books')?.view === 'books');

const json = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8'));
const okFetch = (body) => async (url) => {
  const isMeta = /meta/.test(String(url));
  if (isMeta) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => body };
};
const el = { innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector: () => null };
const warn = console.warn; console.warn = () => {};
const h = m.mountZunigaPhilosophy(el, { booksUrl: 'sample.json', fetch: okFetch(json), hash: false });
await h.ready;
console.warn = warn;
t('mount without a hash opens Feed (feed landmark/cards, no search field as the main view)',
  /zp-feed/.test(el.innerHTML) && />Feed</.test(el.innerHTML) && !/class="zp-q"/.test(el.innerHTML));
t('Search remains a nav tab after Feed',
  /data-view="feed"[\s\S]*data-view="search"[\s\S]*data-view="books"[\s\S]*data-view="saved"/.test(el.innerHTML));
h.unmount();

console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
