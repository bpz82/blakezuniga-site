/**
 * Photos module (amp12 (Blake t208u) 12a; amp13 (Blake t214u): feed removed, grid opens straight away, shuffled each open, lightbox).
 * Grid ("waffle") of the photos listed in photos/photos.json, reshuffled (Fisher-Yates) every time it is mounted; tap a thumb -> lightbox
 * with the full image (close button, Escape, backdrop tap, prev/next buttons, arrow keys, swipe). Order exposed as root.dataset.order and window.__photosOrder.
 *
 * CONTRACT
 * --------
 *   import { mountPhotos } from './photos.js';
 *   const h = mountPhotos(el, { manifestUrl, baseUrl?, onBack? });   // -> { unmount() }
 *
 *   el           the container to render into (the widget panel's content element; may be inside a shadow root).
 *   manifestUrl  absolute or page-relative URL of photos.json  { version:1, count, photos:[{ id, set, w, h, full, thumb, orig }] }.
 *   baseUrl      optional; the photo paths in the manifest (photos/full/x.webp ...) are resolved against it.
 *                Default: the parent directory of the manifest's directory (site1-amp12/photos/photos.json -> site1-amp12/).
 *
 * mountPhotos never throws for load problems: if the manifest cannot be fetched / parsed it shows a short friendly message
 * in `el`, logs console.warn('[photos] ...') and returns a working { unmount }. It requests nothing until it is called
 * (the widget imports this module lazily on the first tap), then only the manifest, and the images the viewer scrolls to
 * (loading="lazy", decoding="async"). unmount() aborts the fetch, removes listeners and empties `el`.
 * Back button: one history entry is pushed on mount; popstate closes the panel (api.close via opts.onBack) and unmount
 * removes the entry again if it is still ours.
 */

const CSS = `
:host{display:block}
.ph{box-sizing:border-box;color:#f1e9e6;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.ph *{box-sizing:border-box}
.ph-msg{margin:0;padding:22px;color:rgba(241,233,230,.85)}
.ph-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px}
@media (min-width:700px){.ph-grid{grid-template-columns:repeat(5,1fr)}}
@media (min-width:1000px){.ph-grid{grid-template-columns:repeat(6,1fr)}}
.ph-cell{display:block;width:100%;aspect-ratio:1/1;margin:0;padding:0;border:0;background:#0c0809;overflow:hidden;cursor:pointer;
  touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ph-cell img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .2s ease}
.ph-cell:hover img{transform:scale(1.04)}
.ph-cell:focus-visible,.ph-lb button:focus-visible{outline:2px solid #ff6b5a;outline-offset:-3px}
/* amp13 (Blake t214u): lightbox. position:fixed inside the (filtered) panel = it covers the panel, dark backdrop, image contain-fit */
.ph-lb{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(6,4,5,.96);touch-action:pan-y}
.ph-lb[hidden]{display:none}
.ph-lb img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
.ph-lb button{position:absolute;z-index:2;margin:0;padding:0;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.3);
  background:rgba(30,22,24,.8);color:#fff;font:400 26px/1 system-ui,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ph-lb button:hover{background:rgba(255,107,90,.85)}
.ph-lb-x{top:10px;right:10px}
.ph-lb-p{left:8px;top:50%;margin-top:-24px}
.ph-lb-n{right:8px;top:50%;margin-top:-24px}
.ph-lb-c{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:13px;color:rgba(241,233,230,.7);pointer-events:none}
@media (prefers-reduced-motion:reduce){.ph-cell img{transition:none}.ph-cell:hover img{transform:none}}
`;

const SET_NAMES = { bw: 'Black & White', color: 'Color' };
const PATH_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(webp|jpe?g|png|avif)$/i;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// returns a cleaned list or throws Error with a short reason
function parseManifest(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.photos)) throw new Error('bad manifest');
  const out = [];
  for (const p of m.photos) {
    if (!p || typeof p !== 'object') continue;
    const w = Number(p.w), h = Number(p.h);
    if (!(w > 0) || !(h > 0) || typeof p.full !== 'string' || typeof p.thumb !== 'string') continue;
    if (!PATH_RE.test(p.full) || !PATH_RE.test(p.thumb) || p.full.includes('..') || p.thumb.includes('..')) continue;
    out.push({ id: String(p.id || out.length), set: p.set === 'bw' || p.set === 'color' ? p.set : '', w, h, full: p.full, thumb: p.thumb });
  }
  if (!out.length) throw new Error('no photos in manifest');
  return out;
}

export function mountPhotos(host, opts) {
  const o = opts || {};
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let dead = false;
  let pushed = false;
  let onPop = null;
  const prevPad = host.style.padding;
  host.style.padding = '0';

  const style = el('style');
  style.textContent = CSS;
  const root = el('div', 'ph');
  host.append(style, root);

  const say = (text) => {
    root.replaceChildren(el('p', 'ph-msg', text));
    root.firstChild.setAttribute('role', 'status');
  };
  say('Loading photos…');

  // Back button closes the panel: opts.onBack (the widget passes api.close). Optional so the module stays self-contained.
  // amp13 (Blake t214u): with the lightbox open, Back closes the lightbox first (it pushes its own history entry).
  let lbOpen = false;
  let lbPushed = false;
  let ignorePop = 0;
  let closeLb = () => {};
  let keyFn = null;
  try {
    if (typeof o.onBack === 'function' && window.history && history.pushState) {
      history.pushState({ zgPhotos: 1 }, '');
      pushed = true;
      onPop = () => {
        if (ignorePop > 0) { ignorePop--; return; }
        if (lbOpen) { lbPushed = false; closeLb(true); return; }
        pushed = false; window.removeEventListener('popstate', onPop); onPop = null; try { o.onBack(); } catch (_) { /* ignore */ }
      };
      window.addEventListener('popstate', onPop);
    }
  } catch (err) {
    console.warn('[photos] history not available', err);
  }

  (async () => {
    let list;
    let base;
    try {
      const murl = new URL(o.manifestUrl, location.href);
      base = o.baseUrl ? new URL(o.baseUrl, location.href) : new URL('../', murl);
      const res = await fetch(murl.href, { signal: ctl ? ctl.signal : undefined, credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      list = parseManifest(await res.json());
    } catch (err) {
      if (dead) return;
      console.warn('[photos] could not load the photo list', err && err.message ? err.message : err);
      say('The photos could not be loaded right now. Please try again later.');
      return;
    }
    if (dead) return;
    try {
      build(list, base);
    } catch (err) {
      console.warn('[photos] could not show the photos', err);
      say('The photos could not be shown right now. Please try again later.');
    }
  })();

  function build(manifest, base) {
    const N = manifest.length;
    const url = (p) => new URL(p, base).href;
    // amp13 (Blake t214u): new random order every open (Fisher-Yates, Math.random)
    const list = manifest.slice();
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    const ids = list.map((p) => p.id);
    root.dataset.order = ids.join(',');
    try { window.__photosOrder = ids.slice(); } catch (_) { /* ignore */ }

    const grid = el('div', 'ph-grid');
    grid.dataset.view = 'grid';
    const cells = [];
    list.forEach((p, i) => {
      const b = el('button', 'ph-cell');
      b.type = 'button';
      b.dataset.index = String(i);
      b.dataset.id = p.id;
      b.setAttribute('aria-label', 'Open photo ' + (i + 1) + ' of ' + N);
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.width = 400;
      img.height = 400;
      img.src = url(p.thumb);
      b.append(img);
      b.addEventListener('click', () => openLb(i));
      grid.append(b);
      cells.push(b);
    });

    // ---- lightbox (built on first use; the full image is requested only when it opens) ----
    let lb = null, lbImg = null, lbCount = null, lbBtnX = null, cur = -1, lastCell = null;
    const pre = (k) => { if (k >= 0 && k < N) { const im = new Image(); im.decoding = 'async'; im.src = url(list[k].full); } };
    const showLb = (k) => {
      cur = (k + N) % N;
      const p = list[cur];
      lbImg.alt = (SET_NAMES[p.set] || 'Photo') + ', photo ' + (cur + 1) + ' of ' + N;
      lbImg.dataset.id = p.id;
      lb.dataset.id = p.id;
      lbImg.src = url(p.full);
      lbCount.textContent = (cur + 1) + ' / ' + N;
      pre(cur + 1);
    };
    const buildLb = () => {
      lb = el('div', 'ph-lb');
      lb.hidden = true;
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Photo viewer');
      lbImg = document.createElement('img');
      lbImg.decoding = 'async';
      lbImg.draggable = false;
      lbImg.addEventListener('error', () => console.warn('[photos] a photo could not be loaded'));
      lbCount = el('div', 'ph-lb-c');
      const mk = (cls, label, txt, fn) => {
        const b = el('button', cls, txt); b.type = 'button'; b.setAttribute('aria-label', label);
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b;
      };
      lbBtnX = mk('ph-lb-x', 'Close photo', '×', () => closeLb(false));
      lb.append(lbImg, lbCount, lbBtnX, mk('ph-lb-p', 'Previous photo', '‹', () => showLb(cur - 1)), mk('ph-lb-n', 'Next photo', '›', () => showLb(cur + 1)));
      // tap/click outside the image (and outside the buttons) closes
      lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(false); });
      // horizontal swipe = next / previous (two numbers, no per-move allocation)
      let sx = 0, sy = 0, tracking = false;
      lb.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (e.touches.length === 1 && t) { sx = t.clientX; sy = t.clientY; tracking = true; } else tracking = false; }, { passive: true });
      lb.addEventListener('touchend', (e) => {
        if (!tracking) return; tracking = false;
        const t = e.changedTouches[0]; if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) showLb(cur + (dx < 0 ? 1 : -1));
      }, { passive: true });
      root.append(lb);
    };
    function openLb(k) {
      if (!lb) buildLb();
      lastCell = cells[k] || null;
      showLb(k);
      lb.hidden = false;
      lbOpen = true;
      try {
        if (pushed && window.history && history.pushState) { history.pushState({ zgPhotos: 1, zgLb: 1 }, ''); lbPushed = true; }
      } catch (_) { /* ignore */ }
      try { lbBtnX.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
    closeLb = (fromPop) => {
      if (!lbOpen) return;
      lbOpen = false;
      if (lb) lb.hidden = true;
      if (!fromPop && lbPushed) {
        lbPushed = false;
        try { ignorePop++; history.back(); } catch (_) { ignorePop = 0; }
      }
      try { if (lastCell) lastCell.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    };
    // window-capture runs before the harness' document-capture Escape handler: Escape closes the lightbox first, a second Escape the panel
    keyFn = (e) => {
      if (!lbOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLb(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); showLb(cur + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); showLb(cur - 1); }
    };
    window.addEventListener('keydown', keyFn, true);

    root.replaceChildren(grid);
    root.dataset.view = 'grid';
    root.__count = N;
  }

  return {
    unmount() {
      if (dead) return;
      dead = true;
      try { if (ctl) ctl.abort(); } catch (_) { /* ignore */ }
      if (onPop) { window.removeEventListener('popstate', onPop); onPop = null; }
      if (keyFn) { window.removeEventListener('keydown', keyFn, true); keyFn = null; }
      try {
        if (pushed && history.state && history.state.zgPhotos) history.go(lbPushed ? -2 : -1);
      } catch (_) { /* ignore */ }
      pushed = false;
      try { root.remove(); style.remove(); } catch (_) { /* ignore */ }
      host.style.padding = prevPad;
    },
  };
}
