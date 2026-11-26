/* photo-tv boot (round 3, Blake t440u / t443u): tiny, imports nothing at top level.
   Contract — failure isolation:
   - Own failure domain: any error -> state 'failed' + console.warn; the page and the amp are untouched.
   - Does not wait for the amp to fade, or even to succeed. The panel and the amp load as isolated modules.
   - Starts once the home scene exists and (the home orbit is ready OR the intro reveal is done), so the
     panel pose can lock to the real home camera. Prefetches the module earlier (once the scene exists)
     so the import is warm.
   - ?tv=0 disables the TV/panel. */
const S = window.__photoTV = { state: 'waiting', bootT: Math.round(performance.now()) };
(function () {
  try {
    if (new URLSearchParams(location.search).get('tv') === '0') { S.state = 'disabled'; return; }
    const sceneOk = () => !!(window.__dbg && window.__dbg.scene && window.__dbg.camera && window.__dbg.renderer);
    const revealDone = () => !!(document.body && (document.body.classList.contains('zg-reveal-done') || document.body.dataset.reveal === 'done'));
    // Mount/fade only after the intro reveal, so the ZUNIGA pop and fly-down are unchanged. The module is
    // prefetched as soon as the scene exists (below), so compile can start immediately at reveal-done.
    // Still independent of the amp: a slow or failed amp must not hold the panel.
    const readyToMount = () => sceneOk() && revealDone();
    let prefetched = false;
    const prefetch = () => {
      if (prefetched) return;
      prefetched = true;
      import('./photo-tv.js').catch(() => { prefetched = false; });   // isolated: a failed prefetch does not fail the page; start() retries
    };
    let tries = 0, started = false;
    const poll = () => {
      try {
        if (sceneOk() && !prefetched) {
          if (window.requestIdleCallback) requestIdleCallback(prefetch, { timeout: 1500 }); else prefetch();
        }
        if (readyToMount() || ++tries > 4800) {   // 4800 * 250 ms = 20 min cap
          if (!readyToMount()) { S.state = 'failed'; return; }
          if (started) return;
          started = true;
          const go = () => start();
          if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 800 }); else setTimeout(go, 0);
          return;
        }
      } catch (e) { fail(e); return; }
      setTimeout(poll, 250);
    };
    const fail = (e) => { S.state = 'failed'; try { console.warn('[photo-tv] failed:', e); } catch (_) { } };
    const start = async () => {
      try {
        S.state = 'loading';
        const m = await import('./photo-tv.js');
        S.importT = Math.round(performance.now());
        // ampMissing is informational only (placement); a missing or failed amp must not block the panel.
        const ampMissing = !(window.__amp8 && (window.__amp8.fadedT || window.__amp8.modelShownT));
        await m.mountPhotoTV({ manifestUrl: new URL('./photos.json', import.meta.url).href, base: new URL('./', import.meta.url).href, ampMissing });
        if (S.mode !== 'panel') import('./speed-layout.js').then((L) => L.startSpeedLayout()).catch((e) => console.warn('[photo-tv] speed layout', e));   // Blake 7:59 speed layout (TV mode only; Blake 9:50 panel mode keeps the live guitar / amp / orbit)
      } catch (e) { fail(e); }
    };
    setTimeout(poll, 250);
  } catch (e) { S.state = 'failed'; console.warn('[photo-tv] boot failed:', e); }
})();
