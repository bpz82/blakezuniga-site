/**
 * Zuniga Philosophy (Blake t459u + t460u, 25 Nov 2026). Blake's notebook of notes and quotes, by book.
 * PREVIEW ONLY. Not on the home apps row (t460u): reachable only by direct URL
 *   apps/zuniga-philosophy/index.html      (standalone page)
 *   index.html?zp=1                          (tiny isolated hook, apps/zuniga-philosophy/zp-hook.js)
 *
 * CONTRACT
 * --------
 *   import { mountZunigaPhilosophy } from './apps/zuniga-philosophy/zuniga-philosophy.js';
 *   const h = mountZunigaPhilosophy(el, { booksUrl?, fullUrl?, onBack?, hash?, scroller? });   // -> { unmount() }
 *
 *   booksUrl  the sample notebook (default: ./data/sample.json next to this module)
 *   fullUrl   optional. A later paid, server-gated endpoint (e.g. /api/zuniga-philosophy/books) that returns the full set in the
 *             same shape. Tried first when given; on any failure the sample is used. Never a static public file.
 *   onBack    optional. Shows a "Close" button that calls it.
 *   hash      optional (default false). true = deep links #zp/{bookId}[/{noteId}] and #zp/{feed|books|saved|search}.
 *   scroller  optional element that scrolls the app (default: window).
 *
 * This app is its own failure domain. mountZunigaPhilosophy never throws: a bad fetch shows a short message in `el` and logs
 * console.warn('[zuniga-philosophy] ...'). unmount() aborts fetches, removes listeners and the injected <style>, empties `el`.
 * No secrets, no third-party requests, no analytics. Saved passages are local only (localStorage, namespaced).
 *
 * TYPOGRAPHY (hard rule, Blake 25 Nov 2026): every quote / note body, blurb, aside and attribution is set in BODY_FONT
 * ('Times New Roman', Times, serif). Everything else (title, nav, buttons, search, book titles, authors, counts, session
 * metadata, empty states, errors) is UI_FONT (Zuniga Mission v3). Font families are only ever set with `font-family:`.
 */

export const BODY_FONT = "'Times New Roman', Times, serif";
export const UI_FONT = "'Zuniga Mission', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const SAVED_KEY = 'zuniga-philosophy:saved';
const FONT_URL = new URL('../../assets/fonts/ZunigaMission-Regular-v3.woff2', import.meta.url).href;
export const DEFAULT_BOOKS_URL = new URL('./data/sample.json', import.meta.url).href;
const VIEWS = ['search', 'feed', 'books', 'saved'];
const FEED_BATCH = 12;
const FEED_MAX_CARDS = 240;
const SEARCH_MAX = 150;
const LOG = '[zuniga-philosophy]';

export const CSS = `
@font-face{font-family:'Zuniga Mission';src:url("${FONT_URL}") format('woff2');font-weight:400;font-style:normal;font-display:swap}
.zp{--zp-accent:#ff6b5a;--zp-ink:#f1e9e6;--zp-ink-hi:#f4ecea;--zp-dim:rgba(241,233,230,.62);--zp-line:rgba(255,255,255,.14);
  box-sizing:border-box;min-height:100%;color:var(--zp-ink);background:rgba(18,12,14,.97);font-family:${UI_FONT};font-size:15px;line-height:1.4;
  letter-spacing:.02em;-webkit-font-smoothing:antialiased}
.zp *{box-sizing:border-box}
.zp button,.zp input,.zp select{font-family:inherit;font-size:inherit;letter-spacing:inherit;color:inherit}
.zp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.zp-head{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:14px 18px 12px;
  background:rgba(18,12,14,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--zp-line)}
.zp-brand{display:flex;align-items:baseline;gap:12px;flex:1 1 auto;min-width:0}
.zp-title{margin:0;font-family:${UI_FONT};font-weight:400;font-size:22px;letter-spacing:.08em;text-transform:uppercase;color:var(--zp-ink-hi);white-space:nowrap}
.zp-sample{font-family:${UI_FONT};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--zp-dim)}
.zp-nav{display:flex;gap:6px;flex-wrap:wrap}
.zp-nav button,.zp-btn{min-height:40px;padding:6px 16px;margin:0;background:rgba(255,255,255,.06);border:1px solid var(--zp-line);border-radius:999px;
  font-family:${UI_FONT};font-size:13px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.zp-nav button:hover,.zp-btn:hover{background:rgba(255,255,255,.13)}
.zp-nav button[aria-current="page"]{background:rgba(255,107,90,.88);border-color:transparent;color:#fff4f0}
.zp-nav button:focus-visible,.zp-btn:focus-visible,.zp-card:focus-visible,.zp-credit:focus-visible,.zp-fav:focus-visible{outline:2px solid var(--zp-accent);outline-offset:2px}
.zp-close{margin-left:auto}
.zp-main{max-width:1180px;margin:0 auto;padding:18px 18px 64px}
.zp-msg{margin:28px 0;font-family:${UI_FONT};color:var(--zp-dim);text-align:center}
.zp-empty{margin:28px 0;font-family:${UI_FONT};color:var(--zp-dim);text-align:center;letter-spacing:.04em}
.zp-q,.zp-bq{display:block;width:100%;margin:0;padding:16px 22px;min-height:58px;color:var(--zp-ink-hi);background:#120c0e;
  border:1px solid rgba(255,255,255,.24);border-radius:999px;font-family:${UI_FONT};font-size:20px;letter-spacing:.04em;outline:none;
  -webkit-appearance:none;appearance:none}
.zp-bq{min-height:46px;padding:10px 18px;font-size:16px;flex:1 1 240px;width:auto}
.zp-q::placeholder,.zp-bq::placeholder{color:rgba(241,233,230,.45);font-family:${UI_FONT}}
.zp-q:focus,.zp-bq:focus{border-color:var(--zp-accent)}
.zp-hint{margin:14px 4px 0;font-family:${UI_FONT};font-size:13px;color:var(--zp-dim);letter-spacing:.05em}
.zp-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px}
.zp-chip{min-height:34px;padding:4px 14px;margin:0;background:rgba(255,255,255,.05);border:1px solid var(--zp-line);border-radius:999px;
  font-family:${UI_FONT};font-size:13px;letter-spacing:.06em;cursor:pointer}
.zp-chip:hover{border-color:var(--zp-accent)}
.zp-sub{margin:26px 4px 10px;font-family:${UI_FONT};font-size:12px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:var(--zp-dim)}
.zp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.zp-item{position:relative;margin:0;padding:16px 52px 14px 20px;background:rgba(255,255,255,.035);border-left:2px solid rgba(255,107,90,.55);
  border-radius:0 12px 12px 0}
.zp-item--note{background:rgba(255,107,90,.075);border-left:2px solid rgba(255,214,200,.55);border-radius:12px}
.zp-item--flash{animation:zp-flash 1.8s ease}
@keyframes zp-flash{0%,30%{box-shadow:0 0 0 2px var(--zp-accent)}100%{box-shadow:0 0 0 0 transparent}}
.zp-tag{display:inline-block;margin:0 0 6px;font-family:${UI_FONT};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--zp-accent)}
.zp-starmark{font-family:${UI_FONT};color:var(--zp-accent);margin-right:6px}
.zp-text{margin:0;font-family:${BODY_FONT};font-size:19px;line-height:1.5;letter-spacing:0;color:var(--zp-ink-hi);white-space:pre-line;overflow-wrap:break-word}
.zp-item--star .zp-text{font-weight:700}
.zp-attr{margin:8px 0 0;font-family:${BODY_FONT};font-size:16px;font-style:italic;letter-spacing:0;color:var(--zp-dim)}
.zp-aside{margin:10px 0 0;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.04)}
.zp-aside .zp-tag{margin:0 8px 0 0}
.zp-aside-text{font-family:${BODY_FONT};font-size:16px;font-style:italic;letter-spacing:0;color:var(--zp-ink)}
.zp-mark{font-family:inherit;background:rgba(255,107,90,.32);color:inherit;border-radius:2px;padding:0 1px}
.zp-credit{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;margin:12px 0 0;padding:0;background:none;border:0;text-align:left;cursor:pointer;
  font-family:${UI_FONT}}
.zp-credit-title{font-family:${UI_FONT};font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--zp-ink-hi)}
.zp-credit-author{font-family:${UI_FONT};font-size:13px;letter-spacing:.04em;color:var(--zp-dim)}
.zp-credit:hover .zp-credit-title{color:var(--zp-accent)}
.zp-fav{position:absolute;top:10px;right:10px;width:36px;height:36px;margin:0;padding:0;border-radius:50%;background:none;border:1px solid transparent;
  font-family:${UI_FONT};font-size:18px;line-height:1;color:var(--zp-dim);cursor:pointer}
.zp-fav:hover{border-color:var(--zp-line)}
.zp-fav[aria-pressed="true"]{color:var(--zp-accent)}
.zp-session{margin:26px 4px 2px;font-family:${UI_FONT};font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--zp-dim)}
.zp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px}
.zp-sort{display:flex;gap:6px;flex-wrap:wrap}
.zp-btn[aria-pressed="true"]{border-color:var(--zp-accent);color:var(--zp-ink-hi);background:rgba(255,107,90,.18)}
.zp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:28px 18px}
@media (min-width:700px){.zp-grid{grid-template-columns:repeat(auto-fill,minmax(176px,1fr))}}
.zp-letter{grid-column:1/-1;margin:8px 0 -10px;font-family:${UI_FONT};font-size:20px;letter-spacing:.1em;color:var(--zp-accent);
  border-bottom:1px solid var(--zp-line);padding-bottom:4px}
.zp-card{display:block;width:100%;margin:0;padding:0;background:none;border:0;text-align:left;cursor:pointer;font-family:${UI_FONT};
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.zp-card[hidden]{display:none}
.zp-cover{position:relative;display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:2/3;width:100%;padding:16px 14px;overflow:hidden;
  isolation:isolate;border-radius:4px 8px 8px 4px;border:1px solid rgba(255,255,255,.1);
  background:linear-gradient(160deg,hsl(var(--zp-h,8) 28% 18%),hsl(var(--zp-h,8) 24% 9%) 70%,rgba(18,12,14,1));
  box-shadow:inset 6px 0 10px rgba(0,0,0,.35),0 8px 22px rgba(0,0,0,.5);transition:transform .2s ease}
.zp-cover::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:var(--zp-grain,none);background-size:96px 96px;opacity:.22}
.zp-card:hover .zp-cover{transform:scale(1.04)}
.zp-cover-title{font-family:${UI_FONT};font-size:17px;line-height:1.15;letter-spacing:.07em;text-transform:uppercase;color:var(--zp-ink-hi);
  overflow-wrap:break-word;hyphens:auto}
.zp-cover-rule{display:block;width:34px;height:2px;margin:12px 0;background:var(--zp-accent)}
.zp-cover-author{font-family:${UI_FONT};font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--zp-dim)}
.zp-cover-mark{font-family:${UI_FONT};font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(241,233,230,.38)}
.zp-cap{display:block;margin-top:9px}
.zp-cap-title,.zp-cap-author,.zp-cap-count{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:${UI_FONT}}
.zp-cap-title{font-size:14px;letter-spacing:.05em;color:var(--zp-ink-hi)}
.zp-cap-author{font-size:12px;letter-spacing:.04em;color:var(--zp-dim)}
.zp-cap-count{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(241,233,230,.42);margin-top:2px}
.zp-grid--list{grid-template-columns:1fr;gap:0}
.zp-grid--list .zp-letter{margin:18px 0 6px}
.zp-grid--list .zp-card{display:flex;align-items:center;gap:14px;padding:10px 4px;border-bottom:1px solid var(--zp-line)}
.zp-grid--list .zp-card[hidden]{display:none}
.zp-grid--list .zp-cover{width:44px;flex:0 0 44px;padding:4px}
.zp-grid--list .zp-cover>*{display:none}
.zp-grid--list .zp-cap{flex:1 1 auto;min-width:0;margin:0;display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.2fr) auto;gap:12px;align-items:baseline}
.zp-grid--list .zp-card:hover .zp-cover{transform:none}
.zp-book{max-width:760px;margin:0 auto}
.zp-book-head{display:flex;gap:22px;align-items:flex-end;margin:16px 0 26px}
.zp-book-head .zp-cover{width:150px;flex:0 0 150px}
.zp-book-title{margin:0;font-family:${UI_FONT};font-weight:400;font-size:28px;line-height:1.15;letter-spacing:.06em;text-transform:uppercase;color:var(--zp-ink-hi)}
.zp-book-author{margin:6px 0 0;font-family:${UI_FONT};font-size:16px;letter-spacing:.05em;color:var(--zp-dim)}
.zp-meta{margin:10px 0 0;font-family:${UI_FONT};font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:rgba(241,233,230,.5)}
@media (max-width:520px){.zp-book-head{flex-direction:column;align-items:flex-start}.zp-book-head .zp-cover{width:120px;flex-basis:auto}.zp-title{font-size:18px}}
.zp-blurb{margin:0 0 22px;padding:18px 20px;border-radius:12px;background:rgba(255,107,90,.08);border:1px solid rgba(255,107,90,.25)}
.zp-blurb-text{margin:0;font-family:${BODY_FONT};font-size:19px;line-height:1.55;letter-spacing:0;font-style:italic;color:var(--zp-ink-hi)}
.zp-more-note{margin:26px 0 0;font-family:${UI_FONT};font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--zp-dim);text-align:center}
.zp-pager{display:flex;justify-content:space-between;gap:10px;margin:30px 0 0}
.zp-pager .zp-btn{max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zp-back{margin:0 0 4px}
.zp-feed-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 16px}
.zp-feed-more{display:flex;justify-content:center;margin:22px 0 0}
`;

/* ---------- pure helpers (exported for Node checks) ---------- */

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const str = (v) => (typeof v === 'string' ? v : '');

/** Clean the JSON (sample or a later full set) into { books, sample, noteCount, fullNoteCount }. Malformed rows are skipped. */
export function normalizeLibrary(json) {
  const raw = json && Array.isArray(json.books) ? json.books : Array.isArray(json) ? json : [];
  const books = [];
  const seen = new Set();
  raw.forEach((b, i) => {
    if (!b || typeof b !== 'object') return;
    const id = str(b.id).trim();
    const title = str(b.title).trim();
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    const notes = (Array.isArray(b.notes) ? b.notes : [])
      .filter((n) => n && typeof n === 'object' && str(n.id) && str(n.text).trim())
      .map((n) => ({
        id: n.id,
        text: n.text,
        kind: n.kind === 'note' ? 'note' : 'quote',
        role: n.role === 'blurb' ? 'blurb' : undefined,
        starred: n.starred === true,
        aside: str(n.aside),
        attribution: str(n.attribution),
        session: n.session && typeof n.session === 'object' ? n.session : null,
      }));
    const full = Number.isFinite(b.full_note_count) && b.full_note_count >= notes.length ? b.full_note_count : notes.length;
    books.push({
      id, title, author: str(b.author).trim(), blurb: str(b.blurb),
      toc_page: Number.isFinite(b.toc_page) ? b.toc_page : 1e6 + i, order: i,
      notes, fullCount: full,
    });
  });
  books.sort((a, b) => a.toc_page - b.toc_page || a.order - b.order);
  const noteCount = books.reduce((s, b) => s + b.notes.length, 0);
  const fullNoteCount = books.reduce((s, b) => s + b.fullCount, 0);
  return { books, sample: !!(json && json.sample === true), noteCount, fullNoteCount };
}

/**
 * Load the notebook. fullUrl (a later server gate) is tried first when given; otherwise / on failure, booksUrl (the sample).
 * Never throws. Returns { books, sample, ... } or { books: [], error } (and { aborted: true } if the signal aborted).
 */
export async function loadLibrary(opts = {}) {
  const f = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  const tries = [];
  if (opts.fullUrl) tries.push(opts.fullUrl);
  tries.push(opts.booksUrl || DEFAULT_BOOKS_URL);
  let lastErr = 'no fetch';
  for (const url of tries) {
    if (opts.signal && opts.signal.aborted) return { books: [], aborted: true };
    try {
      if (!f) throw new Error('fetch unavailable');
      const r = await f(url, { signal: opts.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : '?'));
      const lib = normalizeLibrary(await r.json());
      if (!lib.books.length) throw new Error('no books in ' + url);
      return lib;
    } catch (err) {
      if (opts.signal && opts.signal.aborted) return { books: [], aborted: true };
      lastErr = (err && err.message) || String(err);
      console.warn(LOG, 'could not load', url, lastErr);
    }
  }
  return { books: [], sample: true, error: lastErr };
}

export function countLabel(n) {
  return `${n} ${n === 1 ? 'note' : 'notes'}`;
}

const ARTICLE = /^(the|a|an)\s+/i;
const titleKey = (b) => b.title.replace(ARTICLE, '').replace(/^[^\p{L}\p{N}]+/u, '');
const authorKey = (b) => {
  const parts = b.author.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};
const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** mode: 'toc' (notebook order, toc_page), 'title' (A-Z, leading The/A/An ignored), 'author' (surname, no author last). */
export function sortBooks(books, mode = 'toc') {
  const list = books.slice();
  if (mode === 'title') list.sort((a, b) => cmp(titleKey(a), titleKey(b)) || a.toc_page - b.toc_page);
  else if (mode === 'author') {
    list.sort((a, b) => {
      const ka = authorKey(a), kb = authorKey(b);
      if (!ka !== !kb) return ka ? -1 : 1;
      return cmp(ka, kb) || cmp(a.author, b.author) || cmp(titleKey(a), titleKey(b));
    });
  } else list.sort((a, b) => a.toc_page - b.toc_page || a.order - b.order);
  return list;
}

export function letterFor(book, mode) {
  if (mode === 'title') return (titleKey(book)[0] || '#').toUpperCase();
  if (mode === 'author') { const k = authorKey(book); return k ? k[0].toUpperCase() : 'No author'; }
  return '';
}

// Case-insensitive folding that keeps string length (so match offsets map back for highlighting).
export function fold(s) {
  const out = String(s || '').replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"').toLowerCase();
  return out.length === String(s || '').length ? out : String(s || '').toLowerCase();
}
export function terms(q) {
  return fold(q).split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
}

export function bookMatches(book, ts) {
  if (!ts.length) return true;
  const hay = fold(book.title + '\n' + book.author);
  return ts.every((t) => hay.includes(t));
}

/**
 * Keyword search over note text, aside, attribution, book title, author and blurb. Every term must appear somewhere in the
 * note or its book's title/author; at least one term must be in the note itself. Returns { books, notes: [{book, note}], total }.
 */
export function searchLibrary(lib, q, max = SEARCH_MAX) {
  const ts = terms(q);
  if (!ts.length || !lib || !lib.books) return { books: [], notes: [], total: 0 };
  const books = lib.books.filter((b) => ts.every((t) => fold(b.title + '\n' + b.author + '\n' + b.blurb).includes(t)));
  const notes = [];
  let total = 0;
  for (const book of lib.books) {
    const bh = fold(book.title + '\n' + book.author);
    for (const note of book.notes) {
      const nh = fold(note.text + '\n' + note.aside + '\n' + note.attribution);
      let inNote = false, ok = true;
      for (const t of ts) {
        if (nh.includes(t)) inNote = true;
        else if (!bh.includes(t)) { ok = false; break; }
      }
      if (ok && inNote) { total++; if (notes.length < max) notes.push({ book, note }); }
    }
  }
  return { books, notes, total };
}

/** Escape text and wrap each search term in <mark class="zp-mark">. */
export function highlight(text, ts) {
  const s = String(text || '');
  if (!ts || !ts.length) return esc(s);
  const f = fold(s);
  const marks = [];
  for (const t of ts) {
    let i = f.indexOf(t);
    while (i !== -1) { marks.push([i, i + t.length]); i = f.indexOf(t, i + t.length); }
  }
  if (!marks.length) return esc(s);
  marks.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  for (const [a, b] of marks) {
    if (b <= at) continue;
    const start = Math.max(a, at);
    out += esc(s.slice(at, start)) + '<mark class="zp-mark">' + esc(s.slice(start, b)) + '</mark>';
    at = b;
  }
  return out + esc(s.slice(at));
}

/** Fisher-Yates. */
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Endless feed: every item once per pass (shuffled), then a new pass; a new pass never starts with the item that ended the last. */
export function makeFeed(items, rng = Math.random) {
  let order = shuffle(items, rng), pos = 0, last = null;
  return {
    next(n) {
      const out = [];
      if (!items.length) return out;
      while (out.length < n) {
        if (pos >= order.length) {
          order = shuffle(items, rng); pos = 0;
          if (order.length > 1 && order[0] === last) { const j = 1 + Math.floor(rng() * (order.length - 1)); [order[0], order[j]] = [order[j], order[0]]; }
        }
        last = order[pos++];
        out.push(last);
      }
      return out;
    },
  };
}

export function allItems(lib) {
  const out = [];
  for (const book of (lib && lib.books) || []) for (const note of book.notes) out.push({ book, note });
  return out;
}

function hue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return [8, 18, 28, 345, 200, 215, 160, 35, 280, 0][h % 10];
}

export function sessionLabel(s) {
  if (!s) return '';
  return [s.label, s.date, s.time, s.place].filter((x) => typeof x === 'string' && x.trim()).join(' · ');
}

/* ---------- render (pure: data -> HTML string) ---------- */

export function renderCover(book) {
  return `<span class="zp-cover" style="--zp-h:${hue(book.id)}" aria-hidden="true"><span class="zp-cover-title">${esc(book.title)}</span>` +
    `<span><span class="zp-cover-rule"></span><span class="zp-cover-author">${esc(book.author || 'Notebook')}</span></span>` +
    `<span class="zp-cover-mark">Zuniga Philosophy</span></span>`;
}

/** One passage. opts: { credit: show book credit, ts: highlight terms, saved: Set of saved ids } */
export function renderItem(book, note, opts = {}) {
  const ts = opts.ts || null;
  const isNote = note.kind === 'note';
  const saved = opts.saved && opts.saved.has(note.id);
  const cls = 'zp-item ' + (isNote ? 'zp-item--note' : 'zp-item--quote') + (note.starred ? ' zp-item--star' : '');
  let h = `<li class="${cls}" data-note-id="${esc(note.id)}">`;
  if (isNote || note.starred) {
    h += `<span class="zp-tag">${note.starred ? '<span class="zp-starmark" aria-label="Starred">★</span>' : ''}${isNote ? (note.role === 'blurb' ? 'Blake · on this book' : 'Blake') : 'Starred'}</span>`;
  }
  h += `<p class="zp-text">${highlight(note.text, ts)}</p>`;
  if (note.attribution) h += `<p class="zp-attr">— ${highlight(note.attribution, ts)}</p>`;
  if (note.aside) h += `<p class="zp-aside"><span class="zp-tag">Blake</span><span class="zp-aside-text">${highlight(note.aside, ts)}</span></p>`;
  if (opts.credit) {
    h += `<button type="button" class="zp-credit" data-act="open" data-book="${esc(book.id)}" data-note="${esc(note.id)}">` +
      `<span class="zp-credit-title">${esc(book.title)}</span>${book.author ? `<span class="zp-credit-author">${esc(book.author)}</span>` : ''}</button>`;
  }
  h += `<button type="button" class="zp-fav" data-act="fav" data-fav="${esc(note.id)}" aria-pressed="${saved ? 'true' : 'false'}" ` +
    `aria-label="${saved ? 'Remove from saved' : 'Save'}" title="${saved ? 'Saved' : 'Save'}">${saved ? '★' : '☆'}</button>`;
  return h + '</li>';
}

export function renderHeader(state, lib, hasBack) {
  const v = state.view === 'book' ? 'books' : state.view;
  const nav = [['search', 'Search'], ['feed', 'Feed'], ['books', 'Books'], ['saved', 'Saved']]
    .map(([id, label]) => `<button type="button" data-act="view" data-view="${id}"${v === id ? ' aria-current="page"' : ''}>${label}</button>`).join('');
  return `<header class="zp-head"><div class="zp-brand"><h1 class="zp-title">Zuniga Philosophy</h1>` +
    `${lib && lib.sample ? '<span class="zp-sample" title="A short sample of each book">Sample preview</span>' : ''}</div>` +
    `<nav class="zp-nav" aria-label="Zuniga Philosophy">${nav}</nav>` +
    `${hasBack ? '<button type="button" class="zp-btn zp-close" data-act="close">Close</button>' : ''}</header>`;
}

const SUGGEST = ['love', 'mind', 'purpose', 'discipline', 'courage', 'money', 'music', 'success'];

export function renderSearchResults(lib, q, saved) {
  const ts = terms(q);
  if (!ts.length) {
    return `<p class="zp-hint">${lib.fullNoteCount} notes across ${lib.books.length} books${lib.sample ? ` · ${lib.noteCount} in this sample preview` : ''}.</p>` +
      `<div class="zp-chips">${SUGGEST.map((s) => `<button type="button" class="zp-chip" data-act="suggest" data-q="${s}">${s}</button>`).join('')}</div>`;
  }
  const r = searchLibrary(lib, q);
  let h = '';
  if (r.books.length) {
    h += `<h2 class="zp-sub">Books</h2><div class="zp-chips">` +
      r.books.map((b) => `<button type="button" class="zp-chip" data-act="open" data-book="${esc(b.id)}">${esc(b.title)}${b.author ? ' · ' + esc(b.author) : ''}</button>`).join('') + '</div>';
  }
  if (r.notes.length) {
    h += `<h2 class="zp-sub">${r.total > r.notes.length ? `First ${r.notes.length} of ${r.total} passages` : countLabel(r.total).replace('note', 'passage')}</h2>` +
      `<ol class="zp-list">${r.notes.map(({ book, note }) => renderItem(book, note, { credit: true, ts, saved })).join('')}</ol>`;
  }
  if (!r.books.length && !r.notes.length) h += `<p class="zp-empty">Nothing found for “${esc(q.trim())}”.</p>`;
  return h;
}

export function renderSearch(lib, state, saved) {
  return `<section class="zp-search"><label class="zp-sr" for="zp-q">Search notes</label>` +
    `<input id="zp-q" class="zp-q" type="search" placeholder="Search notes" autocomplete="off" spellcheck="false" value="${esc(state.query)}">` +
    `<div class="zp-results" aria-live="polite">${renderSearchResults(lib, state.query, saved)}</div></section>`;
}

export function renderBooksGrid(lib, mode, layout, bq) {
  const ts = terms(bq || '');
  const list = sortBooks(lib.books, mode);
  let h = '', lastLetter = null, shown = 0;
  for (const b of list) {
    const hit = bookMatches(b, ts);
    if (hit) shown++;
    const L = letterFor(b, mode);
    if (L && L !== lastLetter && hit) { h += `<h3 class="zp-letter">${esc(L)}</h3>`; lastLetter = L; }
    h += `<button type="button" class="zp-card" data-act="open" data-book="${esc(b.id)}"${hit ? '' : ' hidden'} aria-label="${esc(b.title)}${b.author ? ' by ' + esc(b.author) : ''}">` +
      renderCover(b) +
      `<span class="zp-cap"><span class="zp-cap-title">${esc(b.title)}</span><span class="zp-cap-author">${esc(b.author || '—')}</span>` +
      `<span class="zp-cap-count">${countLabel(b.fullCount)}</span></span></button>`;
  }
  if (!shown) h += `<p class="zp-empty" style="grid-column:1/-1">No books match “${esc(bq.trim())}”.</p>`;
  return h;
}

export function renderBooks(lib, state) {
  const sortBtn = (m, label) => `<button type="button" class="zp-btn" data-act="sort" data-sort="${m}" aria-pressed="${state.sort === m}">${label}</button>`;
  return `<section class="zp-books"><div class="zp-bar"><label class="zp-sr" for="zp-bq">Search books</label>` +
    `<input id="zp-bq" class="zp-bq" type="search" placeholder="Search books or authors" autocomplete="off" value="${esc(state.bq)}">` +
    `<div class="zp-sort" role="group" aria-label="Sort">${sortBtn('toc', 'Notebook order')}${sortBtn('title', 'A–Z')}${sortBtn('author', 'By author')}` +
    `<button type="button" class="zp-btn" data-act="layout" aria-pressed="${state.layout === 'list'}">${state.layout === 'list' ? 'Grid' : 'List'}</button></div></div>` +
    `<div class="zp-grid${state.layout === 'list' ? ' zp-grid--list' : ''}">${renderBooksGrid(lib, state.sort, state.layout, state.bq)}</div></section>`;
}

export function renderBook(lib, book, saved) {
  if (!book) return `<p class="zp-empty">That book is not in the notebook.</p><p class="zp-msg"><button type="button" class="zp-btn" data-act="view" data-view="books">All books</button></p>`;
  const blurbNote = book.notes.find((n) => n.role === 'blurb');
  const notes = book.notes.filter((n) => n.role !== 'blurb');
  let h = `<article class="zp-book"><button type="button" class="zp-btn zp-back" data-act="view" data-view="books">← Books</button>` +
    `<header class="zp-book-head">${renderCover(book)}<div><h2 class="zp-book-title">${esc(book.title)}</h2>` +
    `${book.author ? `<p class="zp-book-author">${esc(book.author)}</p>` : ''}` +
    `<p class="zp-meta">${countLabel(book.fullCount)} · notebook page ${esc(book.toc_page < 1e6 ? book.toc_page : '—')}` +
    `${lib.sample && book.fullCount > book.notes.length ? ` · sample preview: ${book.notes.length} shown` : ''}</p></div></header>`;
  const blurb = blurbNote ? blurbNote.text : book.blurb;
  if (blurb && blurb.trim()) {
    h += `<section class="zp-blurb"${blurbNote ? ` data-note-id="${esc(blurbNote.id)}"` : ''}><span class="zp-tag">Blake · on this book</span>` +
      `<p class="zp-blurb-text">${esc(blurb)}</p></section>`;
  }
  h += '<ol class="zp-list zp-notes">';
  let lastSession = null;
  for (const n of notes) {
    const s = sessionLabel(n.session);
    if (s && s !== lastSession) h += `<li class="zp-session">${esc(s)}</li>`;
    if (s) lastSession = s;
    h += renderItem(book, n, { saved });
  }
  h += '</ol>';
  if (!notes.length) h += `<p class="zp-empty">No notes for this book yet.</p>`;
  if (lib.sample && book.fullCount > book.notes.length) h += `<p class="zp-more-note">Sample preview · ${book.notes.length} of ${countLabel(book.fullCount)}</p>`;
  const i = lib.books.indexOf(book);
  const prev = lib.books[i - 1], next = lib.books[i + 1];
  h += `<nav class="zp-pager" aria-label="Notebook">` +
    (prev ? `<button type="button" class="zp-btn" data-act="open" data-book="${esc(prev.id)}">← ${esc(prev.title)}</button>` : '<span></span>') +
    (next ? `<button type="button" class="zp-btn" data-act="open" data-book="${esc(next.id)}">${esc(next.title)} →</button>` : '<span></span>') +
    '</nav></article>';
  return h;
}

export function renderFeedCards(entries, saved) {
  return entries.map(({ book, note }) => renderItem(book, note, { credit: true, saved })).join('');
}

export function renderFeed(cardsHtml) {
  return `<section class="zp-feed"><div class="zp-feed-bar"><h2 class="zp-sub" style="margin:0">Feed</h2>` +
    `<button type="button" class="zp-btn" data-act="shuffle">Shuffle again</button></div>` +
    `<ol class="zp-list zp-feed-list">${cardsHtml}</ol>` +
    `<div class="zp-feed-more"><button type="button" class="zp-btn zp-more" data-act="more">More</button></div></section>`;
}

export function renderSaved(lib, saved) {
  const items = [];
  for (const b of lib.books) for (const n of b.notes) if (saved.has(n.id)) items.push({ book: b, note: n });
  if (!items.length) return `<p class="zp-empty">Nothing saved yet. Tap ☆ on any passage to keep it here (on this device only).</p>`;
  return `<h2 class="zp-sub">${countLabel(items.length).replace('note', 'saved passage')}</h2><ol class="zp-list">${renderFeedCards(items, saved)}</ol>`;
}

/** '#zp/feed' -> {view:'feed'}; '#zp/meditations/meditations-n0001' -> {view:'book', bookId, noteId}. Anything else -> null. */
export function parseRoute(hash) {
  const m = /^#zp(?:\/([^/?#]*))?(?:\/([^/?#]*))?/.exec(String(hash || ''));
  if (!m) return null;
  const a = m[1] ? safeDecode(m[1]) : '', b = m[2] ? safeDecode(m[2]) : '';
  if (!a) return { view: 'search' };
  if (VIEWS.includes(a)) return { view: a };
  return { view: 'book', bookId: a, noteId: b || null };
}
export function routeHash(r) {
  if (r.view === 'book') return '#zp/' + encodeURIComponent(r.bookId) + (r.noteId ? '/' + encodeURIComponent(r.noteId) : '');
  return '#zp/' + r.view;
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function grainUrl() {
  try {
    if (typeof document === 'undefined' || !document.createElement) return '';
    const c = document.createElement('canvas');
    if (!c || !c.getContext) return '';
    c.width = c.height = 96;
    const g = c.getContext('2d');
    if (!g) return '';
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random();
      const on = v > 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 255 : 0;
      img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 70);
    }
    g.putImageData(img, 0, 0);
    return `url("${c.toDataURL('image/png')}")`;
  } catch { return ''; }
}

function readSaved() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVED_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 5000) : []);
  } catch { return new Set(); }
}
function writeSaved(set) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SAVED_KEY, JSON.stringify([...set])); } catch { /* private mode: keep in memory */ }
}

/* ---------- mount ---------- */

export function mountZunigaPhilosophy(el, opts = {}) {
  const noop = { unmount() {} };
  if (!el || typeof el !== 'object') { console.warn(LOG, 'mount: no element'); return noop; }
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const offs = [];
  let dead = false;
  let styleEl = null;
  let io = null;
  const useHash = opts.hash === true && typeof window !== 'undefined' && typeof location !== 'undefined';
  const hasBack = typeof opts.onBack === 'function';
  const state = { view: 'search', bookId: null, noteId: null, query: '', bq: '', sort: 'toc', layout: 'grid' };
  const saved = readSaved();
  let lib = null;
  let feed = null, feedCount = 0;

  const on = (t, ev, fn, o) => {
    if (!t || typeof t.addEventListener !== 'function') return;
    t.addEventListener(ev, fn, o);
    offs.push(() => { try { t.removeEventListener(ev, fn, o); } catch { /* gone */ } });
  };
  const q = (sel) => { try { return typeof el.querySelector === 'function' ? el.querySelector(sel) : null; } catch { return null; } };
  const scrollTop = () => {
    try {
      const s = opts.scroller;
      if (s && typeof s.scrollTo === 'function') s.scrollTo(0, 0);
      else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    } catch { /* ignore */ }
  };

  function frame(inner) {
    el.innerHTML = `<div class="zp">${renderHeader(state, lib, hasBack)}<main class="zp-main">${inner}</main></div>`;
    try {
      const root = q('.zp');
      const g = grainUrl.cached ?? (grainUrl.cached = grainUrl());
      if (root && g && root.style) root.style.setProperty('--zp-grain', g);
    } catch { /* cosmetic */ }
  }

  function render() {
    if (dead) return;
    if (!lib) { frame('<p class="zp-msg">Opening the notebook…</p>'); return; }
    if (lib.error) { frame('<p class="zp-msg">The notebook could not be opened right now. Please try again later.</p>'); return; }
    if (io) { try { io.disconnect(); } catch { /* ignore */ } io = null; }
    if (state.view === 'feed') {
      if (!feed) { feed = makeFeed(allItems(lib)); feedCount = 0; }
      const first = feed.next(FEED_BATCH); feedCount = first.length;
      frame(renderFeed(renderFeedCards(first, saved)));
      watchFeed();
    } else if (state.view === 'books') frame(renderBooks(lib, state));
    else if (state.view === 'book') frame(renderBook(lib, lib.books.find((b) => b.id === state.bookId), saved));
    else if (state.view === 'saved') frame(renderSaved(lib, saved));
    else frame(renderSearch(lib, state, saved));
  }

  function moreFeed() {
    if (!feed || dead) return;
    const list = q('.zp-feed-list');
    if (!list) return;
    const next = feed.next(FEED_BATCH);
    feedCount += next.length;
    list.insertAdjacentHTML('beforeend', renderFeedCards(next, saved));
    // Windowed: keep at most FEED_MAX_CARDS in the DOM; drop from the top and keep the reading position.
    const cards = list.children;
    if (cards.length > FEED_MAX_CARDS) {
      const drop = cards.length - FEED_MAX_CARDS;
      const h = cards[drop].offsetTop - cards[0].offsetTop;
      for (let i = 0; i < drop; i++) list.removeChild(list.firstElementChild);
      try { const s = opts.scroller || window; s.scrollBy(0, -h); } catch { /* ignore */ }
    }
  }

  function watchFeed() {
    const btn = q('.zp-more');
    if (!btn || typeof IntersectionObserver !== 'function') return;
    io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) moreFeed(); },
      { root: opts.scroller || null, rootMargin: '600px 0px' });
    io.observe(btn);
  }

  function applyRoute(r) {
    if (!r) return;
    state.view = r.view;
    state.bookId = r.bookId || null;
    state.noteId = r.noteId || null;
    if (r.view === 'feed') feed = null; // new shuffle every time the feed is opened
    render();
    if (r.view === 'book' && r.noteId) {
      const sel = `[data-note-id="${String(r.noteId).replace(/["\\]/g, '\\$&')}"]`;
      const target = q(sel);
      if (target && typeof target.scrollIntoView === 'function') {
        try { target.scrollIntoView({ block: 'center' }); target.classList.add('zp-item--flash'); } catch { /* ignore */ }
      } else scrollTop();
    } else scrollTop();
    if (r.view === 'search') { const inp = q('.zp-q'); if (inp && !state.query && typeof inp.focus === 'function') { try { inp.focus({ preventScroll: true }); } catch { /* ignore */ } } }
  }

  function go(r) {
    if (useHash) {
      const h = routeHash(r);
      if (location.hash !== h) { location.hash = h; return; } // hashchange -> applyRoute
    }
    applyRoute(r);
  }

  function onClick(e) {
    const t = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-act]') : null;
    if (!t) return;
    const d = t.dataset;
    if (d.act !== 'close' && (!lib || lib.error)) return;
    switch (d.act) {
      case 'view': go({ view: d.view }); break;
      case 'open': go({ view: 'book', bookId: d.book, noteId: d.note || null }); break;
      case 'sort': state.sort = d.sort; render(); break;
      case 'layout': state.layout = state.layout === 'list' ? 'grid' : 'list'; render(); break;
      case 'shuffle': feed = null; render(); scrollTop(); break;
      case 'more': moreFeed(); break;
      case 'suggest': {
        state.query = d.q || '';
        const inp = q('.zp-q');
        if (inp) inp.value = state.query;
        const box = q('.zp-results');
        if (box) box.innerHTML = renderSearchResults(lib, state.query, saved); else render();
        break;
      }
      case 'fav': {
        const id = d.fav;
        if (saved.has(id)) saved.delete(id); else saved.add(id);
        writeSaved(saved);
        const isOn = saved.has(id);
        t.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        t.setAttribute('aria-label', isOn ? 'Remove from saved' : 'Save');
        t.title = isOn ? 'Saved' : 'Save';
        t.textContent = isOn ? '★' : '☆';
        break;
      }
      case 'close': if (hasBack) { try { opts.onBack(); } catch (err) { console.warn(LOG, 'onBack failed', err); } } break;
      default: break;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t || !lib || !t.classList) return;
    if (t.classList.contains('zp-q')) {
      state.query = t.value;
      const box = q('.zp-results');
      if (box) box.innerHTML = renderSearchResults(lib, state.query, saved);
    } else if (t.classList.contains('zp-bq')) {
      state.bq = t.value;
      const grid = q('.zp-grid');
      if (grid) grid.innerHTML = renderBooksGrid(lib, state.sort, state.layout, state.bq);
    }
  }

  try {
    if (typeof document !== 'undefined' && document.head && typeof document.createElement === 'function') {
      styleEl = document.createElement('style');
      styleEl.setAttribute && styleEl.setAttribute('data-zp', '');
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }
    on(el, 'click', onClick);
    on(el, 'input', onInput);
    if (useHash) on(window, 'hashchange', () => { const r = parseRoute(location.hash); if (r) applyRoute(r); });
    render();
  } catch (err) {
    console.warn(LOG, 'mount failed', err);
    try { el.innerHTML = '<p class="zp-msg">Zuniga Philosophy could not start.</p>'; } catch { /* ignore */ }
  }

  const ready = loadLibrary({ booksUrl: opts.booksUrl, fullUrl: opts.fullUrl, fetch: opts.fetch, signal: ctl ? ctl.signal : undefined })
    .then((res) => {
      if (dead || res.aborted) return;
      lib = res;
      if (res.error) { render(); return; }
      const r = useHash ? parseRoute(location.hash) : null;
      if (r) applyRoute(r); else render();
    })
    .catch((err) => { console.warn(LOG, 'load failed', err); if (!dead) { lib = { books: [], error: String(err) }; render(); } });

  return {
    ready,
    unmount() {
      if (dead) return;
      dead = true;
      try { if (ctl) ctl.abort(); } catch { /* ignore */ }
      if (io) { try { io.disconnect(); } catch { /* ignore */ } io = null; }
      offs.splice(0).forEach((f) => f());
      try { if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); } catch { /* ignore */ }
      try { el.innerHTML = ''; } catch { /* ignore */ }
    },
  };
}
