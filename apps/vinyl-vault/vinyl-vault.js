/**
 * Vinyl Vault (Blake, 23 Nov 2026). A search bar + a grid of every record in records.json; tap a cover for a small popup with
 * Spotify / Apple Music / YouTube / Copy ("Artist — Album").
 *
 * CONTRACT
 * --------
 *   import { mountVinylVault } from './apps/vinyl-vault/vinyl-vault.js';
 *   const h = mountVinylVault(el, { recordsUrl, onBack? });   // -> { unmount() }
 *
 * This app is its own failure domain. widgets.js imports it lazily on first open; nothing here loads before that.
 * mountVinylVault never throws: if records.json cannot be fetched / parsed it shows a short message in `el`,
 * logs console.warn('[vinyl-vault] ...') and returns a working { unmount }. Malformed rows are skipped (never crash).
 * Cover paths are validated (relative, no "..", no scheme) and resolved against records.json's folder; links must be http(s).
 * unmount() aborts the fetch, removes listeners and empties `el`. Self-contained: CSS is injected here, no secrets, no other requests.
 * (onBack is accepted for contract parity with photos.js; the app adds no history entries, so it is not needed.)
 */

const CSS = `
:host{display:block}
.vv{box-sizing:border-box;color:#f1e9e6;font:15px/1.35 "Zuniga Mission",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.vv *{box-sizing:border-box}
.vv-msg{margin:0;padding:22px;color:rgba(241,233,230,.85)}
.vv-bar{position:sticky;top:0;z-index:5;padding:12px 14px;background:rgba(18,12,14,.88);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.vv-search{display:block;width:100%;margin:0;padding:12px 16px;min-height:46px;color:#f4ecea;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.2);border-radius:999px;font:16px/1.3 "Zuniga Mission",system-ui,sans-serif;letter-spacing:.04em;
  outline:none;-webkit-appearance:none;appearance:none}
.vv-search::placeholder{color:rgba(241,233,230,.5)}
.vv-search:focus{border-color:#ff6b5a}
.vv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px;padding:8px 14px 22px}
@media (min-width:600px){.vv-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:22px 16px}}
@media (min-width:1000px){.vv-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
.vv-cell{display:block;width:100%;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.vv-cell[hidden]{display:none}
.vv-cell img{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;background:#0c0809;border-radius:6px;
  box-shadow:0 6px 16px rgba(0,0,0,.5);transition:transform .2s ease}
.vv-cell:hover img{transform:translateY(-2px)}
.vv-cell:focus-visible{outline:2px solid #ff6b5a;outline-offset:3px;border-radius:6px}
.vv-a,.vv-b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vv-a{margin-top:8px;font-size:14px;letter-spacing:.05em;text-transform:uppercase}
.vv-b{margin-top:1px;font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(241,233,230,.68)}
.vv-pop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:rgba(6,4,5,.82);overscroll-behavior:contain}
.vv-pop[hidden]{display:none}
.vv-card{position:relative;width:min(100%,340px);max-height:100%;overflow:auto;padding:14px 14px 16px;background:rgba(28,20,22,.96);
  border:1px solid rgba(255,255,255,.18);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.7);animation:vv-pop .18s ease both}
.vv-card img{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;border-radius:8px;background:#0c0809}
.vv-x{position:absolute;top:8px;right:8px;width:40px;height:40px;margin:0;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.3);
  background:rgba(18,12,14,.8);color:#fff;font:300 26px/1 system-ui,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.vv-x:hover{background:rgba(255,107,90,.85)}
.vv-t{margin:12px 2px 0;font-size:17px;line-height:1.25;letter-spacing:.04em;text-transform:uppercase;color:#f4ecea}
.vv-y{margin:2px 2px 0;font:13px/1.3 system-ui,sans-serif;color:rgba(241,233,230,.6)}
.vv-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.vv-btn{display:flex;align-items:center;justify-content:center;min-height:44px;margin:0;padding:8px 10px;color:#f4ecea;text-decoration:none;
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);border-radius:999px;font:14px/1.1 "Zuniga Mission",system-ui,sans-serif;
  letter-spacing:.06em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.vv-btn:hover{background:rgba(255,255,255,.14)}
.vv-copy{background:rgba(255,107,90,.85);color:#fff4f0}
.vv-copy:hover{background:rgba(255,107,90,1)}
.vv-btn:focus-visible,.vv-x:focus-visible{outline:2px solid #ff6b5a;outline-offset:2px}
.vv-fb{display:block;width:100%;margin-top:10px;padding:10px 12px;color:#f4ecea;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.25);border-radius:10px;font:14px/1.3 system-ui,sans-serif}
.vv-fb[hidden]{display:none}
@keyframes vv-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.vv-cell img{transition:none}.vv-cell:hover img{transform:none}.vv-card{animation:none}}
`;

// safe relative image path: segments start with a letter/digit, so no "..", no ".", no scheme, no leading slash
const COVER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.(jpe?g|png|webp)$/i;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function str(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : '';
}

function httpUrl(v) {
  if (typeof v !== 'string' || v.length > 1000) return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch (_) {
    return '';
  }
}

// returns { list, skipped }; throws Error('...') when the file is not an array
function parseRecords(data, baseUrl) {
  if (!Array.isArray(data)) throw new Error('records.json is not a list');
  const list = [];
  let skipped = 0;
  for (const r of data) {
    try {
      if (!r || typeof r !== 'object') throw new Error('row');
      const artist = str(r.artist, 200);
      const album = str(r.album, 300);
      const cover = typeof r.cover === 'string' ? r.cover : '';
      if (!artist || !album || cover.length > 300 || !COVER_RE.test(cover)) throw new Error('row');
      const coverUrl = new URL(cover, baseUrl);
      if (coverUrl.origin !== baseUrl.origin || !coverUrl.pathname.startsWith(baseUrl.pathname)) throw new Error('row');
      const spotify = httpUrl(r.spotify), apple = httpUrl(r.apple), youtube = httpUrl(r.youtube);
      if (!spotify || !apple || !youtube) throw new Error('row');
      const year = Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2100 ? r.year : 0;
      const copyText = str(r.copyText, 400) || artist + ' — ' + album;
      list.push({
        id: String(r.id == null ? list.length : r.id).slice(0, 40),
        artist, album, year, cover: coverUrl.href, spotify, apple, youtube, copyText,
        hay: (artist + ' ' + album + ' ' + (year || '')).toLowerCase(),
      });
    } catch (_) {
      skipped++;
    }
  }
  if (!list.length) throw new Error('no usable records');
  return { list, skipped };
}

export function mountVinylVault(host, opts) {
  const o = opts || {};
  let dead = false;
  const cleanups = [];
  let ctl = null;
  let prevPad = '';
  let root = null;
  let style = null;
  try {
    ctl = typeof AbortController === 'function' ? new AbortController() : null;
    prevPad = host.style.padding;
    host.style.padding = '0';
    style = el('style');
    style.textContent = CSS;
    root = el('div', 'vv');
    host.append(style, root);
    const say = (text) => {
      const p = el('p', 'vv-msg', text);
      p.setAttribute('role', 'status');
      root.replaceChildren(p);
    };
    say('Loading records…');

    (async () => {
      let parsed;
      let base;
      try {
        const rurl = new URL(o.recordsUrl, location.href);
        base = new URL('./', rurl);
        const res = await fetch(rurl.href, { signal: ctl ? ctl.signal : undefined, credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        parsed = parseRecords(await res.json(), base);
      } catch (err) {
        if (dead) return;
        console.warn('[vinyl-vault] could not load the records', err && err.message ? err.message : err);
        say('The record collection could not be loaded right now. Please try again later.');
        return;
      }
      if (dead) return;
      if (parsed.skipped) console.warn('[vinyl-vault] skipped ' + parsed.skipped + ' malformed record(s)');
      try {
        build(parsed.list);
      } catch (err) {
        console.warn('[vinyl-vault] could not show the records', err);
        say('The record collection could not be shown right now. Please try again later.');
      }
    })();
  } catch (err) {
    console.warn('[vinyl-vault] could not start', err);
  }

  function build(list) {
    const search = el('input', 'vv-search');
    search.type = 'search';
    search.placeholder = 'Search artist, album or year';
    search.setAttribute('aria-label', 'Search records by artist, album or year');
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.enterKeyHint = 'search';
    const bar = el('div', 'vv-bar');
    bar.append(search);

    const grid = el('div', 'vv-grid');
    const cells = list.map((r) => {
      const b = el('button', 'vv-cell');
      b.type = 'button';
      b.dataset.id = r.id;
      b.setAttribute('aria-label', r.artist + ' — ' + r.album);
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.width = 300;
      img.height = 300;
      img.src = r.cover;
      b.append(img, el('span', 'vv-a', r.artist), el('span', 'vv-b', r.album));
      b.addEventListener('click', () => openPop(r, b));
      grid.append(b);
      return b;
    });
    const empty = el('p', 'vv-msg', 'No records match.');
    empty.setAttribute('role', 'status');
    empty.hidden = true;

    root.replaceChildren(bar, grid, empty);
    root.dataset.count = String(list.length);

    const filter = () => {
      const q = search.value.trim().toLowerCase();
      const terms = q ? q.split(/\s+/) : [];
      let shown = 0;
      list.forEach((r, i) => {
        const ok = terms.every((t) => r.hay.includes(t));
        cells[i].hidden = !ok;
        if (ok) shown++;
      });
      empty.hidden = shown > 0;
      root.dataset.shown = String(shown);
    };
    search.addEventListener('input', filter);
    root.dataset.shown = String(list.length);

    // ---- popup (built on first use) ----
    let pop = null, popImg, popTitle, popYear, aS, aA, aY, copyBtn, fb, copyTimer = 0, lastCell = null, cur = null;
    const buildPop = () => {
      pop = el('div', 'vv-pop');
      pop.hidden = true;
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-modal', 'true');
      pop.setAttribute('aria-label', 'Record details');
      const card = el('div', 'vv-card');
      const x = el('button', 'vv-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Close');
      x.addEventListener('click', closePop);
      popImg = document.createElement('img');
      popImg.decoding = 'async';
      popImg.alt = '';
      popTitle = el('h3', 'vv-t');
      popTitle.style.fontWeight = '400';
      popYear = el('p', 'vv-y');
      const link = (label) => {
        const a = el('a', 'vv-btn', label);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
      };
      aS = link('Spotify');
      aA = link('Apple Music');
      aY = link('YouTube');
      copyBtn = el('button', 'vv-btn vv-copy', 'Copy');
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', doCopy);
      fb = el('input', 'vv-fb');
      fb.type = 'text';
      fb.readOnly = true;
      fb.hidden = true;
      fb.setAttribute('aria-label', 'Selected text, press copy on your keyboard');
      const btns = el('div', 'vv-btns');
      btns.append(aS, aA, aY, copyBtn);
      card.append(popImg, x, popTitle, popYear, btns, fb);
      pop.append(card);
      // tap/click on the backdrop (outside the card) closes
      pop.addEventListener('click', (e) => { if (e.target === pop) closePop(); });
      root.append(pop);
    };
    function openPop(r, cell) {
      if (!pop) buildPop();
      cur = r;
      lastCell = cell;
      popImg.src = r.cover;
      popImg.alt = r.artist + ' — ' + r.album + ' cover';
      popTitle.textContent = r.artist + ' — ' + r.album;
      popYear.textContent = r.year ? String(r.year) : '';
      popYear.hidden = !r.year;
      aS.href = r.spotify;
      aA.href = r.apple;
      aY.href = r.youtube;
      copyBtn.textContent = 'Copy';
      fb.hidden = true;
      pop.dataset.id = r.id;
      pop.hidden = false;
      try { pop.querySelector('.vv-x').focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
    function closePop() {
      if (!pop || pop.hidden) return;
      pop.hidden = true;
      cur = null;
      clearTimeout(copyTimer);
      try { if (lastCell) lastCell.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
    function showCopied() {
      copyBtn.textContent = 'Copied';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy'; }, 1800);
    }
    async function doCopy() {
      if (!cur) return;
      const text = cur.copyText;
      try {
        await navigator.clipboard.writeText(text);
        fb.hidden = true;
        showCopied();
        return;
      } catch (_) { /* fall through to the selectable fallback */ }
      // fallback: show the text selected so the user can copy it (and try the legacy copy command once)
      fb.value = text;
      fb.hidden = false;
      try { fb.focus({ preventScroll: true }); fb.select(); fb.setSelectionRange(0, text.length); } catch (_) { /* ignore */ }
      let done = false;
      try { done = !!document.execCommand('copy'); } catch (_) { done = false; }
      if (done) showCopied();
    }

    // window-capture runs before the harness' document-capture Escape handler: Escape closes the popup first, a second Escape the panel
    const keyFn = (e) => {
      if (e.key === 'Escape' && pop && !pop.hidden) { e.preventDefault(); e.stopPropagation(); closePop(); }
    };
    window.addEventListener('keydown', keyFn, true);
    cleanups.push(() => window.removeEventListener('keydown', keyFn, true));
    cleanups.push(() => clearTimeout(copyTimer));
  }

  return {
    unmount() {
      if (dead) return;
      dead = true;
      try { if (ctl) ctl.abort(); } catch (_) { /* ignore */ }
      for (const fn of cleanups) { try { fn(); } catch (_) { /* ignore */ } }
      cleanups.length = 0;
      try { if (root) root.remove(); if (style) style.remove(); } catch (_) { /* ignore */ }
      try { host.style.padding = prevPad; } catch (_) { /* ignore */ }
    },
  };
}
