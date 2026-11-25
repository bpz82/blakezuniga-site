/**
 * Zuniga Philosophy ?zp=1 hook (Blake t459u/t460u). Loaded by index.html ONLY when the URL has ?zp=1 (a dynamic import, like ?edit=1).
 * Opens the app as a full-screen overlay over the home page. There is no home-page tile, button or link (t460u).
 * Own failure domain: every step is guarded; a failure logs console.warn and leaves the home page untouched. Never throws.
 */
export async function openZpOverlay(doc = typeof document !== 'undefined' ? document : null, load = () => import('./zuniga-philosophy.js')) {
  let wrap = null;
  try {
    if (!doc || !doc.body) return null;
    wrap = doc.createElement('div');
    wrap.setAttribute('data-zp-overlay', '');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Notebook (preview)');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#120c0e';
    // Keys typed in the app (search) must not reach the home page's own key handlers (walk / amp controls).
    for (const ev of ['keydown', 'keyup', 'keypress']) wrap.addEventListener && wrap.addEventListener(ev, (e) => e.stopPropagation());
    doc.body.appendChild(wrap);
    const mod = await load();
    let handle = null;
    const close = () => {
      try { if (handle) handle.unmount(); } catch (err) { console.warn('[zuniga-philosophy] unmount failed', err); }
      try { wrap.remove(); } catch { /* gone */ }
    };
    handle = mod.mountZunigaPhilosophy(wrap, {
      booksUrl: new URL('./data/sample.json', import.meta.url).href,
      onBack: close,
      scroller: wrap,
      hash: false,
    });
    return { close };
  } catch (err) {
    console.warn('[zuniga-philosophy] ?zp=1 hook failed; home page unaffected', err);
    try { if (wrap) wrap.remove(); } catch { /* ignore */ }
    return null;
  }
}

if (typeof document !== 'undefined' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('zp') === '1') {
  openZpOverlay().catch((err) => console.warn('[zuniga-philosophy] ?zp=1 hook failed', err));
}
