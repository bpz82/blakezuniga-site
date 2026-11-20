/* Lazy-mounts the amp into a site1 page after the guitar's first frame.
 * If anything throws, the guitar keeps running.
 * amp6: after mounting, the walk driver (amp-walk.js) replaces the orbit when
 * it loads; if it fails to import or create, the built-in orbit stays.
 */
import * as THREE from 'three';
import * as AMP from './amp.js';
import { mountAmp, ampTick } from './amp.js';

function placeDefault() {
  // Bass side of the guitar (home camera looks from +X / +Z). Inches ×3 world units.
  return { position: { x: -72, y: 0, z: 8 }, rotation: { x: 0, y: 0.55, z: 0 }, scale: 3 };
}

/* Wire the walk driver onto a mounted handle. Returns the driver or null (orbit kept). */
export async function attachAmpWalk(handle, camera, renderer) {
  if (!handle || !handle.object3d) return null;
  if (typeof handle.useDriver !== 'function') {
    console.warn('[amp] handle.useDriver missing; keeping the orbit');
    return null;
  }
  let mod;
  try {
    mod = await import('./amp-walk.js');
  } catch (e) {
    console.warn('[amp] walk failed to load, keeping the orbit:', e);
    return null;
  }
  try {
    const box = typeof AMP.ampWalkBox === 'function' ? AMP.ampWalkBox() : undefined;
    const driver = mod.createAmpWalk({ handle, camera, renderer, THREE, box });
    handle.useDriver(driver);
    return driver;
  } catch (e) {
    console.warn('[amp] walk failed to start, keeping the orbit:', e);
    try { handle.useDriver(null); } catch (_) {}
    return null;
  }
}

export async function bootAmp(opts = {}) {
  const dbg = window.__dbg;
  if (!dbg || !dbg.scene || !dbg.camera || !dbg.renderer) {
    console.warn('[amp] no scene to mount into');
    return null;
  }
  let fails = 0;
  window.__ampTick = function (dt, camera) {
    try {
      const h = window.__amp && window.__amp.handle;
      if (h) ampTick(h, dt, camera);
    } catch (e) {
      if (++fails === 3) {
        console.warn('[amp] tick stopped:', e);
        window.__ampTick = null;
      }
    }
  };
  const place = opts.place || placeDefault();
  const handle = await mountAmp(dbg.scene, dbg.camera, dbg.renderer, {
    scale: place.scale,
    position: place.position,
    rotation: place.rotation,
    assetBase: opts.assetBase,
    forceFail: opts.forceFail,
    beforeAdd: opts.beforeAdd,   // amp7
    sliceAfter: opts.sliceAfter, sliceMs: opts.sliceMs,   // amp10 (Blake t196u) 10h: sliced build
    lightBoost: opts.lightBoost, // amp8: the host may start the amp's lights dark and fade them in with the model
    onError: opts.onError || ((e) => console.warn('[amp]', e)),
  });
  // amp8 (Blake t174u): opts.deferWalk = the host shows the model first and calls attachAmpWalk() itself later
  // (walk is only needed at the neck end). window.__amp.ready stays false; the host sets it when the amp is shown.
  if (opts.deferWalk) {
    window.__ampHandle = handle;
    window.__amp = { handle, ready: false };
    return handle;
  }
  // Walk before "ready", so the first Explore Amp already flies in and walks.
  try {
    await attachAmpWalk(handle, dbg.camera, dbg.renderer);
  } catch (e) {
    console.warn('[amp] walk unavailable, orbit kept:', e);
  }
  window.__ampHandle = handle;
  window.__amp = { handle, ready: true };
  return handle;
}
