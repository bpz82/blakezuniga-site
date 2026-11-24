// layout/camera.js: home camera = hold at layout.json (k, yaw, pitch, ox, oz), then hand over to the site's normal
// circular home orbit about 17 s after everything has loaded.
//
// Contract with index.html (the scene owner):
//   window.__amp7SetHome(k, instant, ox, oz)   home pull-back + orbit-centre offset (kept every frame, no orbit)
//   window.__amp9Spin.homeRadPerSec            the site's own home spin (0.032 rad/s, eased in over easeS)
//   __dbg.orbit(yaw, pitch)                    sets the home yaw/pitch and parks the spin (showT = -1e9)
//   __dbg.showT / __dbg.releaseOrbit()         read the spin timer / start the spin ramp now
//
// Hold ends (never comes back) on: the 17 s timer, the user dragging the orbit, or leaving the home view
// (Explore / amp). After that the site's own live behaviour applies unchanged. ?edit=1 holds forever.
import { isEdit, hasKeys } from './doc.js';

export const ORBIT_DELAY_MS = 17000;
export const FALLBACK_PHOTOS_MS = 150000;   // never wait for photos longer than this after the reveal

const S = { phase: 'hold', loadedAt: null, releasedAt: null, reason: null, spin0: null, revealAt: null, held: 0 };

const mode = () => document.body.dataset.mode || 'show';

// Everything on the home screen is up: reveal done, guitar built, amp faded in, panel on with its first photo.
export function everythingLoaded(d) {
  if (!document.body.classList.contains('zg-reveal-done')) return false;
  const t = performance.now();
  if (S.revealAt == null) S.revealAt = t;
  if (!(d && d.ready && d.G)) return false;
  const amp = window.__amp8 && window.__amp8.fadedT && window.__ampHandle;
  const tv = window.__photoTV;
  const panel = tv && tv.state === 'on' && tv.shownIds && tv.shownIds.length > 0;
  return !!(amp && (panel || t - S.revealAt > FALLBACK_PHOTOS_MS));
}

function release(d, reason) {
  S.phase = 'released'; S.reason = reason; S.releasedAt = performance.now();
  try {
    const sp = window.__amp9Spin;
    if (sp && S.spin0 != null) sp.homeRadPerSec = S.spin0;
    if (reason === 'timer' && typeof d.releaseOrbit === 'function') d.releaseOrbit();   // ramp the spin in now
  } catch (_) { }
}

export function tick(L, d) {
  const c = L && L.camera;
  const sp = window.__amp9Spin;
  if (isEdit() && sp) sp.homeRadPerSec = 0;   // the editor never orbits
  if (!d || !c || !hasKeys(c)) return;
  if (sp && S.spin0 == null) S.spin0 = sp.homeRadPerSec > 0 ? sp.homeRadPerSec : 0.032;
  if (S.loadedAt == null && everythingLoaded(d)) S.loadedAt = performance.now();
  if (window.__amp7SetHome) window.__amp7SetHome(c.k != null ? c.k : 1, true, c.ox || 0, c.oz || 0);
  if (S.phase !== 'hold') return;
  const edit = isEdit();
  if (!edit) {
    if (mode() !== 'show') return release(d, 'mode');
    if (S.held && d.showT > -1e8) return release(d, 'user');   // someone dragged the orbit
    if (S.loadedAt != null && performance.now() - S.loadedAt >= ORBIT_DELAY_MS) return release(d, 'timer');
  }
  if (sp) sp.homeRadPerSec = 0;
  if (c.yaw != null || c.pitch != null) { d.orbit(c.yaw || 0, c.pitch != null ? c.pitch : 0.55); S.held++; }
}

export function state() {
  const now = performance.now();
  return {
    phase: S.phase, reason: S.reason,
    loadedMs: S.loadedAt == null ? null : Math.round(S.loadedAt),
    releasedMs: S.releasedAt == null ? null : Math.round(S.releasedAt),
    secSinceLoad: S.loadedAt == null ? null : +((now - S.loadedAt) / 1000).toFixed(2),
    delayMs: ORBIT_DELAY_MS,
  };
}
