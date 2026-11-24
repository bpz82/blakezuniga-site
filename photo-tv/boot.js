/* photo-tv boot (t307u/t308u): tiny, imports nothing at top level. Waits (setTimeout poll, no rAF) until the amp has faded in,
   then lazily imports ./photo-tv.js. Nothing is requested before window.__amp8.fadedT. Own failure domain: any error ->
   state 'failed' + console.warn, the page is untouched. ?tv=0 disables the TV. */
const S = window.__photoTV = { state: 'waiting', bootT: Math.round(performance.now()) };
(function () {
  try {
    if (new URLSearchParams(location.search).get('tv') === '0') { S.state = 'disabled'; return; }
    const ampOk = () => !!(window.__amp8 && window.__amp8.fadedT);
    const ampDead = () => !!(window.__amp && window.__amp.ready && !window.__amp7Shown && document.body && document.body.dataset.reveal === 'done');
    let tries = 0;
    const poll = () => {
      try {
        if (ampOk() || ampDead() || ++tries > 4800) {   // 4800 * 250 ms = 20 min cap
          if (!ampOk() && !ampDead()) { S.state = 'failed'; return; }
          const go = () => start(!ampOk());
          if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 200);
          return;
        }
      } catch (e) { fail(e); return; }
      setTimeout(poll, 250);
    };
    const fail = (e) => { S.state = 'failed'; try { console.warn('[photo-tv] failed:', e); } catch (_) { } };
    const start = async (ampMissing) => {
      try {
        S.state = 'loading';
        const m = await import('./photo-tv.js');
        S.importT = Math.round(performance.now());
        await m.mountPhotoTV({ manifestUrl: new URL('./photos.json', import.meta.url).href, base: new URL('./', import.meta.url).href, ampMissing });
        import('./speed-layout.js').then((L) => L.startSpeedLayout()).catch((e) => console.warn('[photo-tv] speed layout', e));   // Blake 7:59 speed layout
      } catch (e) { fail(e); }
    };
    setTimeout(poll, 250);
  } catch (e) { S.state = 'failed'; console.warn('[photo-tv] boot failed:', e); }
})();
