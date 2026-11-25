/**
 * Vinyl Vault (Blake, 23 Nov 2026). A search bar + a grid of every record in records.json; tap a cover for a small popup with
 * Spotify / Apple Music / YouTube / Copy ("Artist — Album"). The grid is A–Z with a sticky letter header; "Discover & Listen" spins
 * a random record plus one verified track from records.json. A service without a working https album link is not shown; the popup
 * says so (all three missing: only on vinyl; otherwise "Not on X" per missing service) and offers Copy (never a search page).
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
.vv-desc{margin:0;padding:4px 14px 2px;font:400 14px/1.3 "Zuniga Mission",system-ui,-apple-system,sans-serif;letter-spacing:.03em;
  color:rgba(241,233,230,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vv-msg{margin:0;padding:22px;color:rgba(241,233,230,.85)}
.vv-bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;padding:12px 14px;background:rgba(18,12,14,.88);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.vv-search{display:block;flex:1 1 220px;min-width:0;margin:0;padding:12px 16px;min-height:46px;color:#f4ecea;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.2);border-radius:999px;font:16px/1.3 "Zuniga Mission",system-ui,sans-serif;letter-spacing:.04em;
  outline:none;-webkit-appearance:none;appearance:none}
.vv-search::placeholder{color:rgba(241,233,230,.5)}
.vv-search:focus{border-color:#ff6b5a}
.vv-disc{flex:0 0 auto;min-height:46px;padding:8px 18px;color:#fff4f0;background:rgba(255,107,90,.85);border:0;border-radius:999px;
  font:14px/1.1 "Zuniga Mission",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.vv-disc:hover{background:#ff6b5a}
.vv-disc:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media (max-width:599px){.vv-disc{flex:1 1 100%}}
.vv-sec[hidden]{display:none}
.vv-L{position:sticky;top:var(--vv-bar,70px);z-index:4;margin:0;padding:6px 14px;font:400 22px/1.1 "Zuniga Mission",system-ui,sans-serif;
  letter-spacing:.08em;color:#ff6b5a;background:rgba(18,12,14,.88);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,.1)}
.vv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px;padding:12px 14px 14px}
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
.vv-wide{grid-column:1/-1}
.vv-only{grid-column:1/-1;margin:0;padding:2px 2px 0;font:14px/1.35 system-ui,-apple-system,sans-serif;color:rgba(241,233,230,.85);text-align:center}
.vv-track{margin:8px 2px 0;font:15px/1.3 system-ui,-apple-system,sans-serif;color:#ff9b8f}
.vv-spin{width:100%;margin-top:8px}
.vv-fb{display:block;width:100%;margin-top:10px;padding:10px 12px;color:#f4ecea;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.25);border-radius:10px;font:14px/1.3 system-ui,sans-serif}
.vv-fb[hidden],.vv-y[hidden],.vv-track[hidden],.vv-spin[hidden],.vv-btn[hidden]{display:none}
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

// A working link is a non-empty https URL that is not a search page. null, "" and search URLs all count as missing ('').
// Search URLs are never accepted as album links. Discover uses a verified track link when present, else the album link; if both are missing it keeps "Not on X".

function workingUrl(v) {
  if (typeof v !== 'string' || v.length > 1000) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || /\/search(\/|$)/i.test(u.pathname) || /search/i.test(u.search)) return '';
    return u.href;
  } catch (_) {
    return '';
  }
}

// Sort rule: A–Z by artist, then album. For the sort key and the letter bucket only a leading English article "The " is ignored
// (case-insensitive, trailing space required). "A " / "An " are NOT stripped (AC/DC, America stay under A).
// A key that does not start with a letter goes under "#". Tie-break: album (case-insensitive), then original order (stable).
function sortKey(artist) {
  return artist.replace(/^the /i, '').trim();
}
function bucket(artist) {
  const c = sortKey(artist).normalize('NFD').charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}
function sortRecords(list) {
  const cmp = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  return list
    .map((r, i) => ({ r, i }))
    .sort((x, y) => cmp(sortKey(x.r.artist), sortKey(y.r.artist)) || cmp(x.r.album, y.r.album) || x.i - y.i)
    .map((x) => x.r);
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
      const spotify = workingUrl(r.spotify), apple = workingUrl(r.apple), youtube = workingUrl(r.youtube);
      const tracks = Array.isArray(r.tracks) ? r.tracks.map((t) => str(t, 200)).filter(Boolean) : [];
      // optional verified per-track links: { "<track name>": { apple, spotify, youtube } }; invalid entries are dropped, never fatal
      const trackLinks = {};
      if (r.trackLinks && typeof r.trackLinks === 'object' && !Array.isArray(r.trackLinks)) {
        for (const name of Object.keys(r.trackLinks)) {
          try {
            const e = r.trackLinks[name];
            if (!tracks.includes(name) || !e || typeof e !== 'object') continue;
            const o2 = {};
            for (const k of ['apple', 'spotify', 'youtube']) { const u = workingUrl(e[k]); if (u) o2[k] = u; }
            if (Object.keys(o2).length) trackLinks[name] = o2;
          } catch (_) { /* omit */ }
        }
      }
      const year = Number.isInteger(r.year) && r.year >= 1900 && r.year <= 2100 ? r.year : 0;
      const copyText = str(r.copyText, 400) || artist + ' — ' + album;
      list.push({
        id: String(r.id == null ? list.length : r.id).slice(0, 40),
        artist, album, year, cover: coverUrl.href, spotify, apple, youtube, tracks, trackLinks, copyText,
        hay: (artist + ' ' + album + ' ' + (year || '')).toLowerCase(),
      });
    } catch (_) {
      skipped++;
    }
  }
  if (!list.length) throw new Error('no usable records');
  return { list: sortRecords(list), skipped };
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
    const disc = el('button', 'vv-disc', 'Discover & Listen');
    disc.type = 'button';
    const bar = el('div', 'vv-bar');
    bar.append(search, disc);

    // A–Z sections, each with a sticky letter header (the header under the search bar is always the current letter)
    const secs = [];
    let curSec = null;
    for (const r of list) {
      const L = bucket(r.artist);
      if (!curSec || curSec.letter !== L) {
        const sec = el('section', 'vv-sec');
        sec.dataset.letter = L;
        const h = el('h2', 'vv-L', L);
        const grid = el('div', 'vv-grid');
        sec.append(h, grid);
        curSec = { letter: L, sec, grid, cells: [] };
        secs.push(curSec);
      }
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
      b.addEventListener('click', () => show(r, '', false, b));
      curSec.grid.append(b);
      curSec.cells.push(b);
    }
    const listEl = el('div', 'vv-list');
    listEl.append(...secs.map((x) => x.sec));
    const empty = el('p', 'vv-msg', 'No records match.');
    empty.setAttribute('role', 'status');
    empty.hidden = true;

    const desc = el('p', 'vv-desc', 'Into vinyl? This is Blake’s ever-growing collection. Tap a record to listen.');
    root.replaceChildren(desc, bar, listEl, empty);
    root.dataset.count = String(list.length);

    // letter headers stick just under the search bar, whatever height the bar wraps to
    const setBar = () => { try { root.style.setProperty('--vv-bar', bar.offsetHeight + 'px'); } catch (_) { /* ignore */ } };
    setBar();
    window.addEventListener('resize', setBar);
    cleanups.push(() => window.removeEventListener('resize', setBar));

    const filter = () => {
      const q = search.value.trim().toLowerCase();
      const terms = q ? q.split(/\s+/) : [];
      let shown = 0;
      let i = 0;
      for (const s of secs) {
        let any = false;
        for (const c of s.cells) {
          const ok = terms.every((t) => list[i].hay.includes(t));
          c.hidden = !ok;
          if (ok) { shown++; any = true; }
          i++;
        }
        s.sec.hidden = !any;
      }
      empty.hidden = shown > 0;
      root.dataset.shown = String(shown);
    };
    search.addEventListener('input', filter);
    root.dataset.shown = String(list.length);

    // ---- popup (built on first use; serves both a record tap and Discover & Listen) ----
    const SERVICES = [['Spotify', 'spotify'], ['Apple Music', 'apple'], ['YouTube', 'youtube']];
    let pop = null, popImg, popTitle, popYear, popTrack, btns, copyBtn, spinBtn, fb, copyTimer = 0, lastCell = null, cur = null;
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
      popTrack = el('p', 'vv-track');
      copyBtn = el('button', 'vv-btn vv-copy', 'Copy');
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', doCopy);
      spinBtn = el('button', 'vv-btn vv-spin', 'Pull Another Record');
      spinBtn.type = 'button';
      spinBtn.addEventListener('click', () => spin(spinBtn));
      fb = el('input', 'vv-fb');
      fb.type = 'text';
      fb.readOnly = true;
      fb.hidden = true;
      fb.setAttribute('aria-label', 'Selected text, press copy on your keyboard');
      btns = el('div', 'vv-btns');
      card.append(popImg, x, popTitle, popYear, popTrack, btns, spinBtn, fb);
      pop.append(card);
      // tap/click on the backdrop (outside the card) closes
      pop.addEventListener('click', (e) => { if (e.target === pop) closePop(); });
      root.append(pop);
    };
    function show(r, track, discover, opener) {
      if (!pop) buildPop();
      const wasOpen = !pop.hidden;
      cur = r;
      if (opener && !wasOpen) lastCell = opener === spinBtn ? lastCell : opener;
      popImg.src = r.cover;
      popImg.alt = r.artist + ' — ' + r.album + ' cover';
      popTitle.textContent = r.artist + ' — ' + r.album;
      popYear.textContent = r.year ? String(r.year) : '';
      popYear.hidden = !r.year;
      popTrack.textContent = track;
      popTrack.hidden = !track;
      // only services with a working link get a button. All three missing: the vinyl-only line. Some missing: one "Not on X" line each.
      // Copy always shows when anything is missing.
      const items = [];
      const notes = [];
      const tl = (discover && track && r.trackLinks[track]) || {};
      for (const [label, key] of SERVICES) {
        let href = tl[key] || r[key];
        if (!href) { notes.push(el('p', 'vv-only', 'Not on ' + label + ' \u2014 try searching it by name.')); continue; }
        const a = el('a', 'vv-btn', label);
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        items.push(a);
      }
      const missing = notes.length > 0;
      if (missing) {
        if (items.length === 1) items[0].classList.add('vv-wide');
        if (!items.length) items.push(el('p', 'vv-only', "This one's only on vinyl \u2014 try searching it by name."));
        else items.push(...notes);
      }
      copyBtn.classList.toggle('vv-wide', missing);
      items.push(copyBtn);
      btns.replaceChildren(...items);
      spinBtn.hidden = !discover;
      copyBtn.textContent = 'Copy';
      fb.hidden = true;
      pop.dataset.id = r.id;
      pop.dataset.mode = discover ? 'discover' : 'record';
      pop.hidden = false;
      if (!wasOpen) {
        try { (discover ? spinBtn : pop.querySelector('.vv-x')).focus({ preventScroll: true }); } catch (_) { /* ignore */ }
      }
    }
    // Discover & Listen: random record from the loaded catalog + one track from its verified `tracks` list (never invented)
    function spin(opener) {
      const withTracks = list.filter((r) => r.tracks.length);
      let pool = withTracks.length && Math.random() < 0.9 ? withTracks : list;
      if (pool.length > 1 && cur) pool = pool.filter((r) => r !== cur);
      const r = pool[Math.floor(Math.random() * pool.length)];
      let track = '';
      if (r.tracks.length) track = r.tracks[Math.floor(Math.random() * r.tracks.length)];
      else console.info('[vinyl-vault] discover-no-tracklist ' + r.id + ' | ' + r.artist + ' | ' + r.album);
      show(r, track, true, opener);
    }
    disc.addEventListener('click', () => spin(disc));
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
