// layout/pose.js: places the guitar and amp at their saved poses, and eases the guitar flat for Explore.
//
// The walker (Explore the Guitar) is calibrated to the guitar's built pose: scale 3, level, at the origin, with the
// footprint / ground tests done in world space. Blake's saved pose (moved, tilted, turned) breaks those, so:
//   home view          -> saved pose (layout.json), every frame
//   walk / amp view    -> the guitar eases to its built pose and stays there (the walker's own flip owns it)
//   back home          -> eases back to the saved pose
// While easing in, the walker is carried on the guitar (same guitar-local spot) and the walk physics are paused via
// window.__homeWalkHold, which index.html reads in the same place it pauses while the guitar flips over.
//
// Contract: frame(dbg, L, now) once per rendered frame.
import { isEdit } from './doc.js';

export const EASE_MS = 1400;   // matches the amp6 fly-down (1.5 s)

let base = null;                       // the guitar's built pose, captured once before any layout pose is applied
let k = 0, last = 0;                   // 0 = saved pose, 1 = built (walk) pose
let walkLocal = null;                  // the walker's spot in guitar-local space

export function capture(d) {
  if (base || !d || !d.G) return;
  const G = d.G;
  base = { pos: G.position.clone(), quat: G.quaternion.clone(), s: G.scale.x };
  if (d.P) { G.updateMatrixWorld(true); walkLocal = G.worldToLocal(d.P.pos.clone()); }
}

export function applyPose(obj, p) {
  if (!obj || !p) return;
  if (p.x != null && p.y != null && p.z != null) obj.position.set(p.x, p.y, p.z);
  if (p.rx != null && p.ry != null && p.rz != null) obj.rotation.set(p.rx, p.ry, p.rz);
  if (p.s != null) obj.scale.setScalar(p.s);
}

export function builtPose() { return base; }
export function easeK() { return k; }

const walkish = () => { const m = document.body.dataset.mode; return m === 'walk' || m === 'amp'; };

export function frame(d, L, now) {
  if (!d || !d.G) return;
  capture(d);
  const G = d.G;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  const want = !isEdit() && walkish() ? 1 : 0;
  const prev = k;
  if (want > k) k = Math.min(1, k + dt * 1000 / EASE_MS); else if (want < k) k = Math.max(0, k - dt * 1000 / EASE_MS);
  window.__homeWalkHold = want === 1 && k < 1;   // walker physics paused while the guitar settles flat

  if (k === 0) { applyPose(G, L.guitar); return; }
  if (k === 1) {
    if (prev < 1 && base) { G.position.copy(base.pos); G.quaternion.copy(base.quat); G.scale.setScalar(base.s); G.updateMatrixWorld(true); }
    if (d.P) { G.updateMatrixWorld(true); walkLocal = G.worldToLocal(d.P.pos.clone()); }   // remember where the walker stands
    return;
  }
  // easing: saved pose <-> built pose (smoothstep)
  const e = k * k * (3 - 2 * k);
  const g = L.guitar || {};
  const THREE_Q = G.quaternion.constructor, V = G.position.constructor;
  const from = { pos: new V(g.x != null ? g.x : base.pos.x, g.y != null ? g.y : base.pos.y, g.z != null ? g.z : base.pos.z), s: g.s != null ? g.s : base.s };
  const fq = new THREE_Q().setFromEuler(new G.rotation.constructor(g.rx || 0, g.ry || 0, g.rz || 0));
  G.position.lerpVectors(from.pos, base.pos, e);
  G.quaternion.slerpQuaternions(fq, base.quat, e);
  G.scale.setScalar(from.s + (base.s - from.s) * e);
  G.updateMatrixWorld(true);
  if (want === 1 && d.P && walkLocal) { d.P.pos.copy(walkLocal); G.localToWorld(d.P.pos); }
}
