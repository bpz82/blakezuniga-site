// t469u-zp-feed-thumb (Blake t469u, 26 Nov 2026): "in zuniga philosophy add a small photo of the book in the top left corner of each quote in the Feed."
// MEASUREMENT CHANGE (t471u, 26 Nov 2026, Blake: "Change it to the right bottom side of the quote and have the words break around it."):
//   placement changed from TOP-LEFT (float:left, before the quote) to BOTTOM-RIGHT with the quote words wrapping around it.
//   Size, file, alt, lazy, typography, star, and Feed-only assertions are unchanged; only the placement assertions changed.
// Every Feed card (renderFeedCards, the cards inside renderFeed) carries a small book thumbnail (class zp-feed-thumb, 36-48px wide, 2:3).
// Bottom-right wrap (CSS, no JS): .zp-feed-body (grid) > .zp-feed-flow (grid item, stretched) holds a zero-width spacer .zp-feed-push
// (float:right, height calc(100% - thumb height)) and the thumb (float:right; clear:right) BEFORE the quote text (.zp-text).
// The spacer pushes the thumb down to the bottom of the quote; the words wrap to its left. Credit, attribution and aside come after the flow.
// Books with a jacket file get an <img> whose src maps to an existing non-empty file under apps/zuniga-philosophy/covers/ (alt = title by author).
// Books without one (JJ Cale, Extras: coverFallback:true) get the same-size designed typographic cover (title / rule / author) and NO <img>.
// The save star (.zp-fav) stays absolute top/right; quote text stays .zp-text in BODY_FONT.
// Thumbs are Feed-only: renderItem (with or without credit), Search results, Saved and book-page notes do not gain them; Books grid / book page covers
// (.zp-cover) are untouched. Runs: Node (no browser, DOM order + CSS text). Runtime < 1 s. Exits nonzero on fail.
// Evidence: FAIL on 23aacbf (top-left float:left, no spacer): checks/logs/t469u-zp-feed-thumb-before.log ; PASS after: checks/logs/t469u-zp-feed-thumb-after.log
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const done = () => { console.log(fails ? `FAIL (${fails})` : 'PASS'); process.exit(fails ? 1 : 0); };

const m = await import(pathToFileURL(path.join(dir, 'zuniga-philosophy.js')).href);
const sample = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8'));
const meta = JSON.parse(readFileSync(path.join(dir, 'data/books-meta.json'), 'utf8'));
const lib = m.mergeMeta(m.normalizeLibrary(sample), meta);
const items = m.allItems(lib);
t('library loads (34 books, items present)', lib.books.length === 34 && items.length >= 50);

const saved = new Set();
const cardsHtml = m.renderFeedCards(items, saved);
const feedHtml = m.renderFeed(cardsHtml);
const listHtml = (/<ol class="zp-list zp-feed-list">([\s\S]*)<\/ol>/.exec(feedHtml) || [])[1] || '';
const cards = listHtml.split(/(?=<li class="zp-item )/).filter((s) => s.startsWith('<li '));
t(`feed has one card per item (${cards.length}/${items.length})`, cards.length === items.length && cards.length >= 50);

const noThumb = [], badOrder = [], noFav = [], badText = [], badImg = [], badAlt = [], noTypo = [], fallbackImg = [], badWrap = [];
let withImg = 0, typoOnly = 0;
const FALLBACK = new Set(meta.books.filter((r) => r.coverFallback === true).map((r) => r.id));
t('JJ Cale and Extras are coverFallback in meta (unchanged)', FALLBACK.has('jj-cale-guitar-player-magazine-interview') && FALLBACK.has('extras') && FALLBACK.size === 2);
cards.forEach((c, i) => {
  const { book, note } = items[i];
  const ti = c.search(/class="zp-feed-thumb[\s"]/);
  const xi = c.indexOf('class="zp-text"');
  if (ti < 0) { noThumb.push(note.id); return; }
  if (!(xi > ti)) badOrder.push(note.id);
  // bottom-right wrap: body > flow > [spacer, thumb, tag, quote]; the flow closes right after the quote paragraph
  const bi = c.indexOf('class="zp-feed-body"'), fi = c.indexOf('class="zp-feed-flow"'), pi = c.indexOf('class="zp-feed-push"');
  const flowEnd = c.indexOf('</p></div></div>');
  const after = (s) => { const k = c.indexOf(s); return k < 0 || k > flowEnd; };
  if (!(bi >= 0 && fi > bi && pi > fi && pi < ti && xi > ti && xi < flowEnd && after('class="zp-attr"') && after('class="zp-aside"') && after('class="zp-credit"'))) badWrap.push(note.id);
  // thumb element: from its opening tag to the .zp-text paragraph
  const thumb = c.slice(ti, xi > ti ? xi : undefined);
  if (!c.includes('data-act="fav"') || !/class="zp-fav"/.test(c)) noFav.push(note.id);
  if (!new RegExp('class="zp-text">').test(c)) badText.push(note.id);
  if (!/zp-thumb-title/.test(thumb) || !/zp-thumb-rule/.test(thumb) || !/zp-thumb-author/.test(thumb)) noTypo.push(book.id);
  const img = /<img [^>]*src="([^"]+)"[^>]*alt="([^"]*)"/.exec(thumb) || /<img [^>]*alt="([^"]*)"[^>]*src="([^"]+)"/.exec(thumb);
  if (FALLBACK.has(book.id) || !book.cover) {
    typoOnly++;
    if (/<img /.test(thumb)) fallbackImg.push(book.id);
  } else {
    withImg++;
    if (!img) { badImg.push(book.id + ' (no img)'); return; }
    const src = /<img [^>]*src="([^"]+)"/.exec(thumb)[1];
    const alt = /<img [^>]*alt="([^"]*)"/.exec(thumb)[1];
    let ok = false;
    try {
      const u = new URL(src);
      const p = u.protocol === 'file:' ? fileURLToPath(u) : '';
      ok = !!p && p === path.join(dir, book.cover) && /\/apps\/zuniga-philosophy\/covers\/[^/]+$/.test(p) && existsSync(p) && statSync(p).size > 500;
    } catch { /* bad url */ }
    if (!ok) badImg.push(book.id + ' ' + src);
    if (alt !== m.esc(book.title + (book.author ? ' by ' + book.author : ''))) badAlt.push(book.id);
  }
});
t('every Feed card has a .zp-feed-thumb' + (noThumb.length ? ` — missing on ${noThumb.length}, e.g. ${noThumb[0]}` : ''), !noThumb.length);
t('thumb comes before the quote text (.zp-text) in DOM order', !noThumb.length && !badOrder.length);
t('bottom-right wrap markup: every card is .zp-feed-body > .zp-feed-flow > [spacer, thumb, quote]; attribution, aside and credit come after the flow' + (badWrap.length ? ' — ' + badWrap[0] : ''), cards.length > 0 && !badWrap.length);
t('cards with a jacket file: <img> src maps to an existing non-empty file under covers/' + (badImg.length ? ' — ' + badImg.slice(0, 3).join('; ') : ''), withImg > 20 && !badImg.length);
t('jacket <img> alt = "title by author"', withImg > 20 && !badAlt.length);
t('jacket <img> is lazy loaded', /<img [^>]*loading="lazy"/.test(cardsHtml));
t('JJ Cale and Extras cards: designed typographic thumb, no <img>, no fake jacket', typoOnly > 0 && !fallbackImg.length && cards.some((c, i) => items[i].book.id === 'extras' && /class="zp-feed-thumb/.test(c)) && cards.some((c, i) => items[i].book.id === 'jj-cale-guitar-player-magazine-interview' && /class="zp-feed-thumb/.test(c)));
t('every thumb carries the typographic cover (title, rule, author) under the jacket' + (noTypo.length ? ' — ' + noTypo[0] : ''), cards.length > 0 && !noTypo.length && !noThumb.length);
t('save star .zp-fav is still on every card', !noFav.length && cards.length === items.length);
t('quote text is still in .zp-text on every card', !badText.length && cards.length === items.length);
t('feed still has no Buy buttons', !/zp-buy/.test(feedHtml));

// ---------- Feed-only
const it = items.find((x) => x.book.cover) || items[0];
const THUMB = /zp-feed-thumb/;
t('renderItem without opts: no thumb', !THUMB.test(m.renderItem(it.book, it.note)));
t('renderItem with credit:true (Search/Saved) does not grow a thumb', !THUMB.test(m.renderItem(it.book, it.note, { credit: true, saved })));
const q = it.note.text.split(/\s+/).slice(0, 2).join(' ');
t('Search results: no thumbs', m.searchLibrary(lib, q).notes.length > 0 && !THUMB.test(m.renderSearchResults(lib, q, saved)));
const sv = new Set(items.slice(0, 5).map((x) => x.note.id));
const savedHtml = m.renderSaved(lib, sv);
t('Saved: has saved cards but no thumbs', /zp-item/.test(savedHtml) && !THUMB.test(savedHtml));
const bk = lib.books.find((b) => b.cover);
const page = m.renderBook(lib, bk, saved);
t('book page: notes have no thumbs, large header jacket still there', !THUMB.test(page) && /<img class="zp-cover-img"/.test(page) && /class="zp-cover"/.test(page));
t('Books grid: covers unchanged (zp-cover, no thumbs)', !THUMB.test(m.renderBooksGrid(lib, 'toc', 'grid', '')) && /<img class="zp-cover-img"/.test(m.renderBooksGrid(lib, 'toc', 'grid', '')));

// ---------- CSS: placement, size, star, fonts, no global cover restyle
const css = m.CSS;
const rule = (sel) => { const r = new RegExp('(?:^|\\n|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css); return r ? r[1] : ''; };
const thumbCss = rule('.zp-feed-thumb');
const w = /(?:^|;)\s*width:\s*(\d+)px/.exec(thumbCss);
t('.zp-feed-thumb: 36-48px wide, 2:3 aspect', !!w && +w[1] >= 36 && +w[1] <= 48 && /aspect-ratio:\s*2\s*\/\s*3/.test(thumbCss));
t('.zp-feed-thumb: floats RIGHT and clears right (bottom-right), no float:left, slightly rounded, overflow hidden', /float:\s*right/.test(thumbCss) && /clear:\s*right/.test(thumbCss) && !/float:\s*left/.test(thumbCss) && /border-radius:/.test(thumbCss) && /overflow:\s*hidden/.test(thumbCss));
const thumbH = w ? +w[1] * 1.5 : NaN;
const pushCss = rule('.zp-feed-push');
t('.zp-feed-push spacer: zero-width float:right, height calc(100% - thumb height) so the thumb drops to the bottom', /float:\s*right/.test(pushCss) && /(?:^|;)\s*width:\s*0(?:px)?\s*(?:;|$)/.test(pushCss) && new RegExp('height:\\s*calc\\(100%\\s*-\\s*' + thumbH + 'px\\)').test(pushCss));
const bodyCss = rule('.zp-feed-body');
const flowCss = rule('.zp-feed-flow');
t('.zp-feed-body is a grid and .zp-feed-flow is its stretched item, so the spacer percentage height resolves (CSS only)', /display:\s*grid/.test(bodyCss) && /min-width:\s*0/.test(flowCss));
t('.zp-feed-thumb is not absolutely positioned (it floats in the quote flow)', !/position:\s*absolute/.test(thumbCss));
const itemCss = rule('.zp-item');
const pr = /padding:\s*\d+px\s+(\d+)px\s+\d+px\s+\d+px/.exec(itemCss);
t('star clearance: card right padding >= 46px (star spans 10-46px from the right), so the thumb cannot sit under .zp-fav', !!pr && +pr[1] >= 46);
t('jacket img in thumb is object-fit:cover', /\.zp-feed-thumb-img\s*\{[^}]*object-fit:\s*cover/.test(css));
const fav = rule('.zp-fav');
t('.zp-fav stays absolute top/right', /position:\s*absolute/.test(fav) && /top:\s*10px/.test(fav) && /right:\s*10px/.test(fav));
t('.zp-text stays BODY_FONT (Times New Roman)', new RegExp('\\.zp-text\\{[^}]*font-family:' + m.BODY_FONT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(css));
t('.zp-cover hover scale is still Books-grid only (.zp-card:hover .zp-cover)', /\.zp-card:hover \.zp-cover\{transform:scale\(1\.04\)\}/.test(css) && !/\.zp-feed-thumb[^{]*:hover/.test(css));
t('thumb typographic text is UI font (Zuniga Mission), never Times', /\.zp-thumb-title[^{]*\{[^}]*font-family:\s*'Zuniga Mission'/.test(css) && !/\.zp-thumb-[a-z]*\{[^}]*Times/.test(css));
t('no third-party URLs / affiliate tags in thumb markup', !/https?:\/\/(?!www\.amazon\.com)/.test(cardsHtml.replace(/src="file:[^"]*"/g, '')) && !/tag=|ref=/.test(cardsHtml));
done();
