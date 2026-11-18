/*
 * amp-walk.js — walk ON the Glaswerks Zingaro cabinet, like the guitar walk.
 *
 * Driver for handle.useDriver() (contract A): { enter(opts), exit(), tick(dt, camera), dispose() }.
 *
 * The walkable surface is the tolex shell from ampWalkBox() (amp-local inches,
 * front +Z, feet at y=0), modelled as a ROUNDED box: an inner box shrunk by the
 * edge radius R, plus R outward along the normal. The walker is a point on that
 * surface. After each small move it is re-projected onto the rounded box, so
 * walking past an edge rolls smoothly over the radius onto the next face, and
 * the walking direction is carried across by the same rotation that turns the
 * normal (no snap, no flip). The bottom is never walkable: side faces stop at
 * the bottom edge.
 *
 * "Keep the view right" — amp8 (Blake t174u/t178u, item 3 follow-up): the camera is UPRIGHT on every face
 * (camera up = world up, roll 0; the room stays level, you climb the walls like a ladder). Look = yaw around
 * world up + pitch clamped to ±80°, damped like the guitar (LOOK_DAMP). Walking is screen-relative: W/stick-up
 * = the camera forward projected onto the face, blended toward "up the face" when that projection is short
 * (looking straight at / away from the wall); A/D = the camera right projected onto the face (fallback: the
 * face direction perpendicular to W, on the camera-right side). On the flat top this is exactly the old walk.
 * Over an edge the camera look is carried by the same rotation as the normal and then re-levelled (roll dropped),
 * so the walk keeps going the same way; the visible change is spread over ~0.25 s by decaying yaw/pitch offsets.
 * Climbing onto the top facing the wall would leave you staring at your feet, so the pitch then eases back
 * toward what it was on the wall. (The old ant view, camera up = face normal, is in amp-walk.js.pre-amp8b.)
 * state().up still reports the smoothed face normal; state().roll is the camera roll vs the world horizon.
 *
 * amp8 (Blake t174u/t178u, item 4): the carry handle is walkable. Its collider is analytic data read from
 * handle.handlePart.userData.amp8HandleCollider ({ centre, half, profile? }, amp-local inches; see amp.js
 * setHandle): a box footprint whose walkable top follows the optional piecewise-linear profile along x.
 * On the top face the walker stands S.lift above the tolex: walking into the footprint steps up onto the
 * handle top (eased, ~0.15 s), on it the foot follows the arch exactly, walking/hopping off it falls back
 * under gravity. The eye stays EYE above whatever the walker stands on (state().eyeDist is measured from
 * the foot). No mesh raycasts; no per-frame allocation.
 *
 * Debug / test API: handle.walk = { state, place, drive, look, flyMs }.
 * Failure isolation: every entry point is wrapped; a throw warns '[amp] walk:'
 * and falls back to exiting the amp. Never console.error.
 */

const DEFAULT_BOX = {
  xMin: -19.875 / 2, xMax: 19.875 / 2,
  yMin: 0.55, yMax: 0.55 + 19,
  zMin: -5, zMax: 5,
  edgeRadius: 0.25
};

// Guitar walk feel, scaled to the amp (local inches; world = inches x3).
const EYE = 0.7;                                    // eye above the tolex (2.1 world units)
const WALK_FOV = 72;
// amp9 (Blake t188u): look + move mechanics identical to the guitar walker. Numbers copied from
// site1-amp9/index.html: SPEED/SPRINT/ACCEL/DECEL line 1742, LOOK_DAMP line 1743, SENS_TOUCH/SENS_MOUSE line 1827,
// pitch clamp ±1.35 line 1837, TOUCH line 1658. Guitar SPEED 7.6 world u/s; world = inches x3 on both.
export const GUITAR_WALK = Object.freeze({ SPEED: 7.6, SPRINT: 1.6, ACCEL: 8, DECEL: 11, LOOK_DAMP: 22,
  SENS_TOUCH: 0.0048, SENS_MOUSE: 0.0026, PITCH_MAX: 1.35 });
const SPEED = GUITAR_WALK.SPEED / 3, SPRINT = GUITAR_WALK.SPRINT, ACCEL = GUITAR_WALK.ACCEL, DECEL = GUITAR_WALK.DECEL;   // in/s
const LOOK_DAMP = GUITAR_WALK.LOOK_DAMP, UP_DAMP = 12;   // 1/s; UP_DAMP settles the edge roll in ~0.25 s
const SENS_TOUCH = GUITAR_WALK.SENS_TOUCH, SENS_MOUSE = GUITAR_WALK.SENS_MOUSE;   // amp9: one mouse sens (locked or drag), like the guitar
const PITCH_MAX = GUITAR_WALK.PITCH_MAX;            // amp9: was 80° (1.396); the guitar clamps at ±1.35
// amp9 (Blake t188u): same touch test as the guitar (site1-amp9/index.html line 1658)
const isTouch = () => { try { return !!((window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window); } catch (_) { return false; } };
const DEAD = 0.12;
const JUMP_V = 3.4, GRAV = 16;                      // small hop (~0.36 in)
const FLY_MS = 1400;
const START = { face: 'top', u: 0.5, v: 0.85, heading: 0, pitch: -0.06 };
const STEP_RATE = 20;                               // amp8: 1/s, eased step up onto the handle (~0.15 s)
const ON_EPS = 0.02;                                // amp8: in, "standing on the handle" tolerance
// amp8 (Blake t174u/t178u, item 3 follow-up): upright camera on the walls.
const FB_TAU = 0.5;        // projected forward/right shorter than this blends toward the fallback direction
const UP_RATE = 5;   // amp10 (Blake t196u) 10m: rad/s, fastest the walker's up (S.upS: used for the eye position AND reported by state().up) turns. Time based (10l capped 0.25 rad per STEP, i.e. per frame, and only the report); 0.25 rad at 20 fps, 0.083 at 60 fps
const LOOK_ZERO = 0.25, LOOK_FULL = 0.6;   // amp10 (Blake t204u) 10l: |sin pitch| where a wall look starts / finishes overriding the travel memory
const RESTORE_RATE = 5;    // 1/s, pitch ease back after climbing onto the top
const RESTORE_MAX = 0.35;  // rad, the eased-back pitch is clamped to ±this
const OFF_RATE = 9;        // rad/s, fastest the edge-carry display offsets unwind (0.15 rad per 1/60 s)
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Face frames (local). heading 0 = f0; positive heading turns left (CCW about n).
const FACES = {
  top:   { n: [0, 1, 0],  f0: [0, 0, -1] },        // heading 0 = toward the back
  front: { n: [0, 0, 1],  f0: [0, 1, 0] },         // heading 0 = up the face
  back:  { n: [0, 0, -1], f0: [0, 1, 0] },
  left:  { n: [-1, 0, 0], f0: [0, 1, 0] },
  right: { n: [1, 0, 0],  f0: [0, 1, 0] }
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = t => clamp(t, 0, 1);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function faceOf(n) {
  const ax = Math.abs(n.x), az = Math.abs(n.z), ay = n.y;
  if (ay >= ax && ay >= az) return 'top';
  if (ax >= az) return n.x > 0 ? 'right' : 'left';
  return n.z > 0 ? 'front' : 'back';
}

export function createAmpWalk({ handle, camera, renderer, THREE, box } = {}) {
  if (!handle || !camera || !THREE) throw new Error('amp-walk: handle, camera and THREE are required');
  const V3 = THREE.Vector3, Q = THREE.Quaternion;

  // ---------- walk box ----------
  const B = { ...DEFAULT_BOX };
  if (box) for (const k of Object.keys(DEFAULT_BOX)) if (Number.isFinite(+box[k])) B[k] = +box[k];
  if (!(B.xMax > B.xMin && B.yMax > B.yMin && B.zMax > B.zMin)) Object.assign(B, DEFAULT_BOX);
  const half = Math.min(B.xMax - B.xMin, B.yMax - B.yMin, B.zMax - B.zMin) / 2;
  const R = Math.min(Math.max(+B.edgeRadius || 0, 0.15), half * 0.5);
  const inMin = new V3(B.xMin + R, B.yMin + R, B.zMin + R);
  const inMax = new V3(B.xMax - R, B.yMax - R, B.zMax - R);
  const SPAN = { x: B.xMax - B.xMin, y: B.yMax - B.yMin, z: B.zMax - B.zMin };

  const el = (renderer && renderer.domElement) || null;
  const reduced = () => {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  };

  // ---------- state ----------
  const S = {
    p: new V3(), n: new V3(0, 1, 0), fwd: new V3(0, 0, -1),
    upS: new V3(0, 1, 0), lastF: new V3(0, 0, -1),
    yawT: 0, yawS: 0, pitchT: START.pitch, pitchS: START.pitch,
    vf: 0, vs: 0, hop: 0, hopV: 0,
    lift: 0, liftV: 0, onHandle: false, handleTop: -Infinity,  // amp8: standing height above the tolex (top face)
    // amp8 (Blake t174u/t178u, item 3 follow-up): upright camera. cyaw = yaw around world up (0 = local -z,
    // + = turn left), pitchS/T = pitch from the horizon; off* = decaying display offsets after an edge carry.
    // rt = walk right on the face; U/e0/eL = world up and the yaw basis, in amp-local axes.
    cyaw: 0, offYaw: 0, offPitch: 0, rt: new V3(1, 0, 0),
    U: new V3(0, 1, 0), e0: new V3(0, 0, -1), eL: new V3(-1, 0, 0),
    wasSide: false, prePitch: 0, restoreOn: false, restoreTo: 0, lastFlat: 'top',   // amp8 Grok fix
    fwdK: 1,   // amp10 (Blake t204u) 10l: 0..1 scale of the W speed (fades to 0 while W reverses up/down a wall)
    gMem: 0   // amp9 (Blake t188u): up/down-the-face travel memory for the W fallback (see walkDirs)
  };
  let active = false, flying = false, flyStart = 0, flyT = 0, failed = 0;
  const fly = { pos: new V3(), quat: new Q(), fov: 42, near: 0.05 };
  const savedUp = new V3(0, 1, 0);
  const K = {};
  const IN = { joyId: null, jx: 0, jy: 0, looks: new Map(), jumpHold: false, jumps: 0 };   // amp7: jumpHold = on-screen jump button (Blake t164u)
  const SIM = { on: false, f: 0, s: 0, t: 0 };

  // temps (no per-frame allocation)
  const tC = new V3(), tD = new V3(), tF = new V3(), tR = new V3(), tU = new V3();
  const tV = new V3(), tCU = new V3(), tBk = new V3(), tE = new V3(), tScale = new V3();
  const tQ = new Q(), tRQ = new Q(), tQL = new Q(), tM = new THREE.Matrix4();
  const toPos = new V3(), toQuat = new Q();
  const wL = new V3(), wR = new V3(), wH = new V3(), wP = new V3(), wG = new V3(), wC = new V3();   // amp8
  const cL = new V3(), cR = new V3(), cH = new V3(), cA = new V3(), tIQ = new Q();                // amp8

  // amp9 (Blake t188u): the amp now leans back on its tilt legs. The walk box (ampWalkBox) is in the TILTED
  // cabinet frame (handle.cabinet = 'amp-cabinet'), so every amp-local <-> world conversion goes through it.
  // World up in that frame (S.U) then carries the tilt, so the side-face view stays level to the world.
  const frame = () => handle.cabinet || handle.object3d;
  function rootScale() {
    const root = handle.object3d;
    if (!root) return 3;
    root.getWorldScale(tScale);
    return Math.max(Math.abs(tScale.x), Math.abs(tScale.y), Math.abs(tScale.z)) || 1;
  }
  const walkNear = () => 0.02 * rootScale();
  function walkFov() {
    const aspect = camera.aspect || 1;
    return Math.min(95, Math.max(WALK_FOV,
      2 * Math.atan(Math.tan(35 * Math.PI / 180) / aspect) * 180 / Math.PI));
  }
  function setLens(fov, near) {
    if (Math.abs(camera.fov - fov) > 1e-4 || Math.abs(camera.near - near) > 1e-6) {
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  }

  // ---------- amp8 (Blake t174u/t178u): handle collider ----------
  // Cached copy of the part's collider data (rebuilt only when the data object changes, e.g. after setHandle).
  const HC = { src: null, ok: false, cx: 0, cz: 0, hx: 0, hz: 0, yTop: 0, px: null, py: null };
  function handleCollider() {
    const part = handle.handlePart;
    const c = (part && part.parent && part.userData && part.userData.amp8HandleCollider) || null;
    if (c === HC.src) return HC.ok ? HC : null;
    HC.src = c; HC.ok = false; HC.px = HC.py = null;
    if (!c || !Array.isArray(c.centre) || !Array.isArray(c.half)) return null;
    const [cx, cy, cz] = c.centre.map(Number), [hx, hy, hz] = c.half.map(Number);
    if (![cx, cy, cz, hx, hy, hz].every(Number.isFinite) || hx <= 0 || hz <= 0) return null;
    Object.assign(HC, { cx, cz, hx, hz, yTop: cy + hy });
    const pr = c.profile;
    if (pr && Array.isArray(pr.x) && Array.isArray(pr.y) && pr.x.length >= 2 && pr.x.length === pr.y.length) {
      HC.px = Float64Array.from(pr.x, Number); HC.py = Float64Array.from(pr.y, Number);
    }
    HC.ok = true;
    return HC;
  }
  // Walkable handle top (amp-local y) at local x/z, or -Infinity outside the footprint.
  function handleTopAt(x, z) {
    const c = handleCollider();
    if (!c || Math.abs(x - c.cx) > c.hx || Math.abs(z - c.cz) > c.hz) return -Infinity;
    const px = c.px, py = c.py;
    if (!px) return c.yTop;
    const lx = x - c.cx;
    if (lx <= px[0]) return py[0];
    const n = px.length;
    if (lx >= px[n - 1]) return py[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (px[m] <= lx) lo = m; else hi = m; }
    const t = (lx - px[lo]) / ((px[hi] - px[lo]) || 1);
    return py[lo] + (py[hi] - py[lo]) * t;
  }
  // Step up / follow / fall. Only on the flat top (normal ~ +y); lift is along +y = the normal there.
  function liftStep(dt) {
    const top = S.n.y > 0.98 ? handleTopAt(S.p.x, S.p.z) : -Infinity;
    S.handleTop = top;
    const tgt = Number.isFinite(top) ? Math.max(0, top - S.p.y) : 0;
    if (tgt > 0 && S.onHandle) {                     // on the handle: follow the arch exactly
      S.lift = tgt; S.liftV = 0;
    } else if (tgt > S.lift) {                       // walked into it: eased step up onto the top
      S.lift += (tgt - S.lift) * damp(STEP_RATE, dt);
      if (tgt - S.lift < ON_EPS) S.lift = tgt;
      S.liftV = 0;
    } else if (S.lift > tgt) {                       // off it (or above it): fall under gravity
      S.liftV -= GRAV * dt;
      S.lift += S.liftV * dt;
      if (S.lift <= tgt) { S.lift = tgt; S.liftV = 0; }
    }
    S.onHandle = tgt > 0 && S.lift >= tgt - 1e-6;
  }

  // ---------- surface math ----------
  function orthoFwd() {
    S.fwd.addScaledVector(S.n, -S.fwd.dot(S.n));
    if (S.fwd.lengthSq() < 1e-8) {
      S.fwd.fromArray(FACES[faceOf(S.n)].f0);
      S.fwd.addScaledVector(S.n, -S.fwd.dot(S.n));
      if (S.fwd.lengthSq() < 1e-8) S.fwd.set(1, 0, 0).addScaledVector(S.n, -S.n.x);
    }
    S.fwd.normalize();
  }

  // Re-project the walker onto the rounded box; carry the heading over edges.
  function project() {
    if (S.p.y < inMin.y) S.p.y = inMin.y;            // side faces end at the bottom edge
    tC.copy(S.p).clamp(inMin, inMax);
    tD.subVectors(S.p, tC);
    const len = tD.length();
    if (len < 1e-6) tD.copy(S.n); else tD.multiplyScalar(1 / len);
    tQ.setFromUnitVectors(S.n, tD);
    const carried = S.n.dot(tD) < 1 - 1e-12;
    if (carried) carryCam(tQ);                       // amp8: the camera look rides over the edge too
    S.fwd.applyQuaternion(tQ);
    S.n.copy(tD);
    S.p.copy(tC).addScaledVector(S.n, R);
    orthoFwd();
    if (carried) {   // amp9 (Blake t188u): the carried walk direction is real travel: remember up/down the new face
      tU.copy(S.U).addScaledVector(S.n, -S.U.dot(S.n));
      const gl = tU.length();
      if (gl > 1e-3) { const fv = S.fwd.dot(tU) / gl; if (fv > 0.3) S.gMem = 1; else if (fv < -0.3) S.gMem = -1; }
    }
    // amp8 Grok fix (Opus out, Blake t176u): climbing over the top edge while looking out at the room left the camera
    // facing away from the amp on the top, so W walked straight back over the edge (harness "drives back up" flaked).
    // On arriving on the flat top from a wall, turn the look to the carried walk direction (into the amp); the
    // display offsets spread the turn over ~0.35 s so no frame jumps.
    const flat = Math.max(Math.abs(S.n.x), Math.abs(S.n.y), Math.abs(S.n.z)) >= 0.999;
    if (flat) {
      const now = S.n.y > 0.999 ? 'top' : 'side';
      if (now === 'top' && S.lastFlat === 'side') alignCamToFwd();
      S.lastFlat = now;
    }
  }
  function alignCamToFwd() {
    updUp();
    const dispYaw = S.cyaw + S.offYaw, dispPitch = S.pitchS + S.offPitch;
    cA.copy(S.fwd).addScaledVector(S.U, -S.fwd.dot(S.U));
    if (cA.lengthSq() < 1e-6) return;
    cA.normalize();
    const yaw = Math.atan2(cA.dot(S.eL), cA.dot(S.e0));
    S.cyaw = yaw; S.pitchS = S.pitchT = START.pitch;
    S.offYaw = wrapPi(dispYaw - yaw); S.offPitch = dispPitch - START.pitch;
    S.yawT = S.yawS = 0; S.restoreOn = false;
  }

  function uvToPoint(face, u, v, out) {
    const lx = (a, b, t) => a + (b - a) * t;
    switch (face) {
      case 'front': return out.set(lx(B.xMin, B.xMax, u), lx(B.yMin, B.yMax, v), B.zMax);
      case 'back':  return out.set(lx(B.xMax, B.xMin, u), lx(B.yMin, B.yMax, v), B.zMin);
      case 'right': return out.set(B.xMax, lx(B.yMin, B.yMax, v), lx(B.zMax, B.zMin, u));
      case 'left':  return out.set(B.xMin, lx(B.yMin, B.yMax, v), lx(B.zMin, B.zMax, u));
      default:      return out.set(lx(B.xMin, B.xMax, u), B.yMax, lx(B.zMin, B.zMax, v));
    }
  }
  function pointToUV(face, p) {
    switch (face) {
      case 'front': return [(p.x - B.xMin) / SPAN.x, (p.y - B.yMin) / SPAN.y];
      case 'back':  return [(B.xMax - p.x) / SPAN.x, (p.y - B.yMin) / SPAN.y];
      case 'right': return [(B.zMax - p.z) / SPAN.z, (p.y - B.yMin) / SPAN.y];
      case 'left':  return [(p.z - B.zMin) / SPAN.z, (p.y - B.yMin) / SPAN.y];
      default:      return [(p.x - B.xMin) / SPAN.x, (p.z - B.zMin) / SPAN.z];
    }
  }

  function setHeading(face, h) {
    const f = FACES[face] || FACES.top;
    tF.fromArray(f.f0);
    tR.crossVectors(S.n, tF);                         // left of f0
    S.fwd.copy(tF).multiplyScalar(Math.cos(h)).addScaledVector(tR, Math.sin(h));
    orthoFwd();
  }

  // ---------- amp8 (Blake t174u/t178u, item 3 follow-up): upright camera + screen-relative walk ----------
  // World up in amp-local axes (S.U) and the yaw basis (e0 = yaw 0 = local -z flattened, eL = its left).
  // Also leaves the root's world quaternion in tRQ.
  function updUp() {
    const root = frame();   // amp9 (Blake t188u): tilted cabinet frame
    if (!root) return;
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(tRQ);
    S.U.set(0, 1, 0).applyQuaternion(tIQ.copy(tRQ).invert()).normalize();
    S.e0.set(0, 0, -1).addScaledVector(S.U, S.U.z);
    if (S.e0.lengthSq() < 1e-8) S.e0.set(1, 0, 0).addScaledVector(S.U, -S.U.x);
    S.e0.normalize();
    S.eL.crossVectors(S.U, S.e0);
  }
  // Upright camera axes for a yaw/pitch (amp-local): look L, right R, horizontal heading H.
  function camDirs(yaw, pitch, L, Rt, H) {
    H.copy(S.e0).multiplyScalar(Math.cos(yaw)).addScaledVector(S.eL, Math.sin(yaw));
    L.copy(H).multiplyScalar(Math.cos(pitch)).addScaledVector(S.U, Math.sin(pitch));
    Rt.crossVectors(H, S.U);
  }
  // Walk frame on the face from the (logical) camera: S.fwd = W/stick-up, S.rt = D/stick-right.
  function walkDirs() {
    camDirs(S.cyaw, S.pitchS, wL, wR, wH);
    // amp8 Grok fix (Opus out of usage, Blake t176u): on the rounded edge between two faces keep the walk direction
    // that project() carried over the edge instead of re-deriving it from the camera. Re-deriving it there could
    // flip it (camera looking up while walking off the front edge) and the walker hovered at the edge forever.
    const onEdge = Math.max(Math.abs(S.n.x), Math.abs(S.n.y), Math.abs(S.n.z)) < 0.999 && Math.abs(S.vf) >= Math.abs(S.vs);   // forward-dominant moves only
    if (onEdge) orthoFwd();
    else {
    wP.copy(wL).addScaledVector(S.n, -wL.dot(S.n));          // camera forward on the face
    // amp10 (Blake t196u) 10h: on a WALL of the tilted cabinet a level look has a tilt-sized projection on the face
    // (back face: ~sin 27 deg DOWN the wall) that read as "looking down", so W walked down the back wall. On walls
    // only the camera PITCH counts (sin(pitch) x up-the-face): level = neutral (-> up), look up = up, look down = down.
    const wallF = Math.abs(S.n.dot(S.U)) < 0.5;
    if (wallF) {
      // amp10 (Blake t196u) 10k: "up the face" on a left/right wall is the cabinet's own y axis (the wall's v axis), not world up
      // projected: world down on a leaning side wall slides toward the REAR edge and wrapped onto the back face; along v the walker
      // reaches the side's bottom edge and stops there. Front/back walls keep the world-up projection.
      const sideW = Math.abs(S.n.x) > 0.9;
      if (sideW) wG.set(0, 1, 0); else wG.copy(S.U).addScaledVector(S.n, -S.U.dot(S.n));
      const gl = wG.length();
      if (gl > 1e-6) wG.multiplyScalar(1 / gl);
      // amp10 (Blake t204u) 10l SMOOTH WALK: the 10h/10k rule snapped. It zeroed a short look signal, then used the sign of the
      // pitch once |sin pitch| passed 0.5, so dragging the look down through ~30 deg flipped W from "up the wall" to "down the
      // wall" in ONE frame at full speed (a visible jolt of the whole view), and the same again when the travel memory flipped.
      // Now the up/down drive c is continuous: the travel memory (base) holds for a shallow look; a clear look up/down blends
      // to +-1 across |sin pitch| 0.25..0.6 (smoothstep); passing through 0 the walk speed fades to zero (fwdK = |c|) before it
      // reverses, so velocity is continuous. The memory only updates once the look is clear (c is already at that sign).
      const sp = Math.sin(S.pitchS), asp = Math.abs(sp), ls = sp >= 0 ? 1 : -1;
      if (asp >= LOOK_FULL) S.gMem = ls;
      const base = S.gMem < 0 ? -1 : S.gMem > 0 ? 1 : (S.pitchS < -0.35 ? -1 : 1);
      let tt = clamp((asp - LOOK_ZERO) / (LOOK_FULL - LOOK_ZERO), 0, 1); tt = tt * tt * (3 - 2 * tt);
      const c = base + (ls - base) * tt;
      S.fwdK = Math.abs(c);
      S.fwd.copy(wG).multiplyScalar(c < 0 ? -1 : 1);
    } else {
      // amp10 (Blake t196u) 10h: on the TILTED top "down the face" is just the downhill (toward the back), not a look
      // signal: no blend there (W = the camera forward projected on the face, as on the untilted amp8 top).
      S.fwdK = 1;
      if (wP.lengthSq() > 1e-10) S.fwd.copy(wP).normalize(); else orthoFwd();
    }
    }
    wC.crossVectors(S.fwd, S.n);                              // perpendicular to W on the face...
    if (wC.dot(wR) < 0) wC.negate();                          // ...on the camera-right side
    wP.copy(wR).addScaledVector(S.n, -wR.dot(S.n));          // camera right on the face
    const mr = wP.length();
    wP.addScaledVector(wC, Math.max(0, FB_TAU - mr));
    if (wP.lengthSq() > 1e-10) S.rt.copy(wP).normalize(); else S.rt.copy(wC).normalize();
  }
  // Set the camera yaw/pitch from a look direction L (amp-local, unit). hintH breaks the tie at the pole.
  function setCamFromDir(L, hintH) {
    cA.copy(L).addScaledVector(S.U, -L.dot(S.U));
    if (cA.lengthSq() < 1e-8) cA.copy(hintH).addScaledVector(S.U, -hintH.dot(S.U));
    if (cA.lengthSq() < 1e-8) cA.copy(S.e0);
    cA.normalize();
    S.cyaw = Math.atan2(cA.dot(S.eL), cA.dot(S.e0));
    S.pitchS = S.pitchT = clamp(Math.atan2(L.dot(S.U), L.dot(cA)), -PITCH_MAX, PITCH_MAX);
    S.offYaw = S.offPitch = 0;
    S.yawT = S.yawS = 0;
    S.restoreOn = false;
  }
  // Old face-relative look (heading h on the face, pitch p off the face): the camera looks the same way the
  // old ant camera did, with the roll dropped. On the top this is the same as before.
  function setLookAnt(face, h, p) {
    updUp();
    setHeading(face, h);                                      // S.fwd = the heading direction on the face
    cL.copy(S.fwd).multiplyScalar(Math.cos(p)).addScaledVector(S.n, Math.sin(p));
    cH.copy(S.n).negate();                                    // pole tie-break: face the wall
    setCamFromDir(cL, cH);
    // amp10 (Blake t196u) 10k: an explicit face-relative look/place says which way is up/down the wall: it sets the travel
    // memory (a look "up the back wall" at a shallow pitch used to lose against the memory of the walk down it)
    if (face !== 'top') { const c = Math.cos(h); if (c > 0.3) S.gMem = 1; else if (c < -0.3) S.gMem = -1; }
    walkDirs();
  }
  // Edge carry: rotate the camera look by q (normal old -> new), re-level it, keep the view continuous with
  // display offsets that decay in walkStep. The heading is the carried look's horizontal part (so a look carried
  // over the vertical turns round, and W keeps going the same way); right at the vertical (|horizontal| < 0.2)
  // it comes from the carried camera right instead, and the small overshoot is clamped to ±80°.
  function carryCam(q) {
    camDirs(S.cyaw, S.pitchS, cL, cR, cH);
    const dispYaw = S.cyaw + S.offYaw, dispPitch = S.pitchS + S.offPitch;
    cL.applyQuaternion(q); cR.applyQuaternion(q);
    cA.copy(cL).addScaledVector(S.U, -cL.dot(S.U));
    if (cA.lengthSq() > 0.04) cA.normalize();
    else {
      cA.crossVectors(S.U, cR);
      if (cA.lengthSq() > 1e-6) cA.normalize(); else cA.copy(cH);
    }
    const pitch = clamp(Math.atan2(cL.dot(S.U), cL.dot(cA)), -PITCH_MAX, PITCH_MAX);
    const yaw = Math.atan2(cA.dot(S.eL), cA.dot(S.e0));
    S.pitchT = clamp(S.pitchT + (pitch - S.pitchS), -PITCH_MAX, PITCH_MAX);
    S.pitchS = pitch;
    S.cyaw = yaw;
    S.offYaw = wrapPi(dispYaw - yaw);
    S.offPitch = dispPitch - pitch;
  }
  // Climbing onto the top: remember the pitch on the wall; if the carry left an extreme pitch, ease it back.
  function sideTrack() {
    const ny = S.n.y;
    if (Math.abs(ny) < 0.02) { S.wasSide = true; S.prePitch = S.pitchT; }
    else if (ny > 0.9999 && S.wasSide) {
      S.wasSide = false;
      if (Math.abs(S.pitchT) > 0.6 && Math.abs(S.pitchT - S.prePitch) > 0.5) {
        S.restoreOn = true;
        S.restoreTo = clamp(S.prePitch, -RESTORE_MAX, RESTORE_MAX);
      }
    }
  }

  function placeState(face, u, v, heading, antPitch) {
    face = FACES[face] ? face : 'top';
    u = clamp01(Number.isFinite(+u) ? +u : 0.5);
    v = clamp01(Number.isFinite(+v) ? +v : 0.5);
    uvToPoint(face, u, v, tV);
    tC.copy(tV).clamp(inMin, inMax);
    S.n.fromArray(FACES[face].n);
    S.p.copy(tC).addScaledVector(S.n, R);
    setHeading(face, Number.isFinite(+heading) ? +heading : 0);
    S.upS.copy(S.n);
    S.lastF.copy(S.fwd);
    S.yawT = S.yawS = 0;
    S.vf = S.vs = 0;
    S.hop = S.hopV = 0;
    S.lift = S.liftV = 0; S.onHandle = false; S.handleTop = -Infinity;   // amp8
    S.gMem = 0;   // amp9 (Blake t188u): a fresh placement has no up/down travel yet
    // amp8 (Blake t174u/t178u, item 3 follow-up): upright camera looking where the old face-relative view did.
    S.wasSide = Math.abs(S.n.y) < 0.02; S.prePitch = 0;
    S.lastFlat = S.n.y > 0.999 ? 'top' : 'side';   // amp8 Grok fix
    setLookAnt(face, Number.isFinite(+heading) ? +heading : 0,
      clamp(Number.isFinite(+antPitch) ? +antPitch : START.pitch, -PITCH_MAX, PITCH_MAX));
    if (S.wasSide) S.prePitch = S.pitchT;
    S.lastF.copy(S.fwd);
  }

  // Camera pose for the current walker state (world).
  function walkerPose(outPos, outQuat) {
    const root = frame();   // amp9 (Blake t188u): tilted cabinet frame (fly-in/out targets follow it too)
    updUp();                                         // amp8: also root.updateWorldMatrix + tRQ
    // amp10 (Blake t196u) 10m: the eye hovers along S.upS (the SAME smoothed up that state().up reports), not along the raw face normal S.n, so the real eye position
    // swings round an edge instead of jumping 90 deg in one frame (S.upS follows S.n at a time-based rate, see the end of the step function below)
    tE.copy(S.p).addScaledVector(S.upS, EYE + S.hop + S.lift).applyMatrix4(root.matrixWorld);   // amp8: + handle lift
    // amp10 (Blake t196u) 10b: never put the eye under the floor. The tilted back face's outward normal points down,
    // so the eye hovering over its lower edge could dip below the amp root's floor plane (root y = 0).
    const floorY = (handle.object3d ? handle.object3d.matrixWorld.elements[13] : 0) + 0.15 * rootScale();
    if (tE.y < floorY) tE.y = floorY;
    outPos.copy(tE);

    // amp8 (Blake t174u/t178u, item 3 follow-up): upright camera (roll 0) from the displayed yaw/pitch
    // (logical look + the decaying edge-carry offsets).
    camDirs(S.cyaw + S.offYaw, S.pitchS + S.offPitch, tV, tR, tF);   // view dir, right, heading
    tR.normalize();
    tCU.crossVectors(tR, tV).normalize();            // camera up
    tBk.copy(tV).negate();
    tM.makeBasis(tR, tCU, tBk);
    tQL.setFromRotationMatrix(tM);
    outQuat.copy(tRQ).multiply(tQL);
  }

  function applyCamera() {
    if (!handle.object3d) return;
    walkerPose(camera.position, camera.quaternion);
    camera.up.set(0, 1, 0);                          // amp8: upright camera on every face
    setLens(walkFov(), walkNear());
  }

  // ---------- input ----------
  function gatherInput() {
    let f = 0, s = 0;
    if (K.KeyW || K.ArrowUp) f += 1;
    if (K.KeyS || K.ArrowDown) f -= 1;
    if (K.KeyD || K.ArrowRight) s += 1;
    if (K.KeyA || K.ArrowLeft) s -= 1;
    const kn = Math.hypot(f, s); if (kn > 1) { f /= kn; s /= kn; }
    f -= IN.jy; s += IN.jx;
    if (SIM.on) { f += SIM.f; s += SIM.s; }
    const n = Math.hypot(f, s); if (n > 1) { f /= n; s /= n; }
    return [f, s];
  }

  function walkStep(dt) {
    const [f, s] = gatherInput();
    if (SIM.on) SIM.t += dt;
    const sp = SPEED * ((K.ShiftLeft || K.ShiftRight) ? SPRINT : 1);
    const tf = f * sp, ts = s * sp;
    const moving = tf * tf + ts * ts > 1e-6;
    const k = damp(moving ? ACCEL : DECEL, dt);
    S.vf += (tf - S.vf) * k;
    S.vs += (ts - S.vs) * k;
    if (!moving && S.vf * S.vf + S.vs * S.vs < 1e-4) S.vf = S.vs = 0;

    updUp();                                          // amp8: world up / yaw basis for this step
    walkDirs();                                       // amp8: W / D from the camera on this face
    const v = Math.hypot(S.vf, S.vs);
    if (v > 0) {
      const steps = Math.min(24, Math.max(1, Math.ceil(v * dt / (R * 0.3))));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        S.p.addScaledVector(S.fwd, S.vf * h * S.fwdK).addScaledVector(S.rt, S.vs * h);   // amp10 (Blake t204u) 10l: fwdK   // amp8: screen-relative
        project();                                    // carries the camera over edges
        walkDirs();
        sideTrack();
      }
    }

    // small hop along the normal
    if ((K.Space || IN.jumpHold) && S.hop <= 0 && S.hopV <= 0) { S.hopV = JUMP_V; IN.jumps++; }   // amp7: + jump button
    if (S.hop > 0 || S.hopV > 0) {
      S.hop += S.hopV * dt - 0.5 * GRAV * dt * dt;
      S.hopV -= GRAV * dt;
      if (S.hop <= 0) { S.hop = 0; S.hopV = 0; }
    }
    liftStep(dt);   // amp8: handle step up / follow / fall

    // amp8: after climbing onto the top, ease an extreme carried pitch back toward the pitch on the wall
    if (S.restoreOn) {
      S.pitchT += (S.restoreTo - S.pitchT) * damp(RESTORE_RATE, dt);
      if (Math.abs(S.restoreTo - S.pitchT) < 0.01) S.restoreOn = false;
    }
    // look smoothing (amp8: yaw around world up, clamped pitch)
    const ky = damp(LOOK_DAMP, dt);
    const dy = (S.yawT - S.yawS) * ky;
    S.yawS += dy;
    S.cyaw = wrapPi(S.cyaw + dy);
    if (Math.abs(S.yawT - S.yawS) < 1e-6) S.yawT = S.yawS = 0;
    S.pitchS += (S.pitchT - S.pitchS) * ky;
    // amp8: edge-carry display offsets settle in ~0.25 s, at most OFF_RATE rad/s (a look carried over the
    // vertical turns round 180°: spread over ~0.35 s so no frame jumps)
    const ko = damp(UP_DAMP, dt), cap = OFF_RATE * dt;
    // amp9 (Blake t188u): cap the COMBINED unwind (yaw and pitch together), not each axis: on the tilted cabinet a
    // climb from the leaning-over back face onto the top turns the view round in yaw AND pitch at once, and two
    // per-axis caps let the view move up to cap * sqrt(2) in one frame.
    { const uy = S.offYaw * ko, up = S.offPitch * ko, m = Math.hypot(uy, up), k = m > cap ? cap / m : 1;
      S.offYaw -= uy * k; S.offPitch -= up * k; }
    if (Math.abs(S.offYaw) < 1e-5) S.offYaw = 0;
    if (Math.abs(S.offPitch) < 1e-5) S.offPitch = 0;
    walkDirs();

    // up follows the surface normal (~0.25 s), so edge rolls never snap
    // amp10 (Blake t204u) 10l: also slew-limited: on a slow frame (30 fps phone, dt 0.033-0.1) the plain lerp turned up by up to 60 deg in ONE frame.
    // amp10 (Blake t196u) 10m: the limit is now UP_RATE rad per SECOND (time based), and this S.upS is the real up: walkerPose() places the eye along it,
    // so what state().up reports is what the walker uses (no report-only smoothing). The camera orientation is always upright (world up).
    tD.copy(S.upS);
    S.upS.lerp(S.n, damp(UP_DAMP, dt));
    if (S.upS.lengthSq() < 1e-6) S.upS.copy(S.n);
    S.upS.normalize();
    { const a = Math.acos(clamp(tD.dot(S.upS), -1, 1)), cap = UP_RATE * dt; if (a > cap && a > 1e-6) { tU.copy(S.upS); S.upS.copy(tD).lerp(tU, cap / a).normalize(); } }   // (tU = the plain-lerp target; lerping S.upS toward itself froze it)
  }

  function lookBy(dx, dy, sens) {
    S.yawT -= dx * sens;
    S.pitchT = clamp(S.pitchT - dy * sens, -PITCH_MAX, PITCH_MAX);
    if (dy) S.restoreOn = false;                      // amp8: the user's own pitch wins
  }

  // ---------- flight ----------
  function stepFlight() {
    const dur = reduced() ? 10 : Math.max(10, +api.flyMs || FLY_MS);
    flyT = clamp01((performance.now() - flyStart) / dur);
    const e = easeInOutCubic(flyT);
    walkerPose(toPos, toQuat);
    const dist = fly.pos.distanceTo(toPos);
    const lift = Math.min((B.yMax - B.yMin) * rootScale() * 0.9, dist * 0.45) * Math.sin(Math.PI * e);
    tU.set(0, 1, 0).applyQuaternion(tRQ);
    camera.position.lerpVectors(fly.pos, toPos, e).addScaledVector(tU, lift);
    camera.quaternion.slerpQuaternions(fly.quat, toQuat, e);
    const near = Math.max(walkNear(), fly.near + (walkNear() - fly.near) * e);
    setLens(fly.fov + (walkFov() - fly.fov) * e, near);
    if (flyT >= 1) land();
  }

  function land() {
    flying = false;
    flyT = 1;
    document.body?.classList.add('zg-amp-walk');
    applyCamera();
  }

  // ---------- DOM: joystick + listeners ----------
  function ensureJoy() {
    let j = document.getElementById('amp-joy');
    if (!j) {
      j = document.createElement('div');
      j.id = 'amp-joy';
      j.setAttribute('aria-hidden', 'true');
      const k = document.createElement('i');
      k.id = 'amp-joy-knob';
      j.appendChild(k);
      document.body.appendChild(j);
    }
    return j;
  }
  let joyEl = null;
  try { joyEl = ensureJoy(); } catch (_) { joyEl = null; }
  const knobEl = () => joyEl && (joyEl.querySelector('#amp-joy-knob') || joyEl.firstElementChild);

  function joyUpdate(e) {
    const r = joyEl.getBoundingClientRect(), rad = r.width / 2;
    if (!rad) return;
    let dx = e.clientX - (r.left + rad), dy = e.clientY - (r.top + rad);
    const m = Math.hypot(dx, dy), maxR = Math.max(1, rad - 8);
    if (m > maxR) { dx *= maxR / m; dy *= maxR / m; }
    const kn = knobEl(); if (kn) kn.style.transform = `translate(${dx}px,${dy}px)`;
    const nx = dx / maxR, ny = dy / maxR, n = Math.hypot(nx, ny);
    if (n < DEAD) { IN.jx = IN.jy = 0; return; }
    const k = Math.pow((Math.min(n, 1) - DEAD) / (1 - DEAD), 1.75) / n;   // guitar's response curve
    IN.jx = nx * k; IN.jy = ny * k;
  }
  function joyRelease() {
    IN.joyId = null; IN.jx = IN.jy = 0;
    const kn = knobEl(); if (kn) kn.style.transform = '';
    joyEl?.classList.remove('on');
  }
  function releaseAll() {
    joyRelease();
    IN.looks.clear();
    IN.jumpHold = false;   // amp7
    for (const k in K) K[k] = 0;
  }

  const offs = [];
  function on(node, type, fn, opt) {
    if (!node) return;
    const g = (e) => { try { fn(e); } catch (err) { fail(err); } };
    node.addEventListener(type, g, opt);
    offs.push(() => node.removeEventListener(type, g, opt));
  }
  function detach() {
    for (const off of offs.splice(0)) { try { off(); } catch (_) {} }
  }
  const locked = () => el && document.pointerLockElement === el;
  const TOUCH = isTouch();   // amp9 (Blake t188u)
  const LOCK = { was: false, lostT: -1e9 };   // amp9 (Blake t188u): Esc-releases-only bookkeeping
  // amp9 (Blake t188u): leaving the amp (exit / Home / failure) hands the mouse back; the guitar re-locks on its next click
  function unlock() { try { if (locked() && document.exitPointerLock) document.exitPointerLock(); } catch (_) {} }

  function attach() {
    detach();
    LOCK.was = !!locked(); LOCK.lostT = -1e9;   // amp9 (Blake t188u)
    if (joyEl && !joyEl.isConnected) { try { joyEl = ensureJoy(); } catch (_) {} }
    on(joyEl, 'pointerdown', (e) => {
      if (!active) return;
      e.preventDefault(); e.stopPropagation();
      if (IN.joyId !== null && IN.joyId !== e.pointerId) return;
      IN.joyId = e.pointerId;
      try { joyEl.setPointerCapture(e.pointerId); } catch (_) {}
      joyEl.classList.add('on');
      joyUpdate(e);
    });
    on(joyEl, 'pointermove', (e) => {
      if (e.pointerId === IN.joyId) { e.preventDefault(); joyUpdate(e); }
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      on(joyEl, ev, (e) => { if (e.pointerId === IN.joyId) joyRelease(); });
    }

    on(el, 'pointerdown', (e) => {
      if (!active) return;
      if (e.cancelable) e.preventDefault();             // amp9 (Blake t188u): like the guitar (any button, any pointer)
      IN.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.pointerType });
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      // amp9 (Blake t188u): click the view to capture the mouse, exactly like the guitar walk (index.html line 1831);
      // then plain mouse movement looks around with no button held. Esc releases (browser default).
      if (!TOUCH && e.pointerType === 'mouse' && !locked() && el.requestPointerLock) {
        try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
      }
    });
    on(window, 'pointermove', (e) => {
      if (!active) return;
      if (locked() && e.pointerType === 'mouse') {
        const dx = e.movementX || 0, dy = e.movementY || 0;
        if (!flying && Math.abs(dx) < 200 && Math.abs(dy) < 200) lookBy(dx, dy, SENS_MOUSE);   // amp9: guitar sens
        return;
      }
      const l = IN.looks.get(e.pointerId);
      if (!l) return;
      if (e.cancelable) e.preventDefault();
      const dx = e.clientX - l.x, dy = e.clientY - l.y;
      l.x = e.clientX; l.y = e.clientY;
      if (flying) return;                               // input ignored while flying
      if (Math.abs(dx) > 160 || Math.abs(dy) > 160) return;
      if (IN.looks.keys().next().value !== e.pointerId) return;   // first finger only
      lookBy(dx, dy, e.pointerType === 'mouse' ? SENS_MOUSE : SENS_TOUCH);   // amp9 (Blake t188u): guitar's lookBy(dx, dy, touch)
    }, { passive: false });
    for (const ev of ['pointerup', 'pointercancel']) {
      on(window, ev, (e) => {
        IN.looks.delete(e.pointerId);
        try { if (el && el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch (_) {}
      });
    }
    on(window, 'keydown', (e) => {
      if (!active) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      K[e.code] = 1;
      if (/^(Space|Arrow)/.test(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e) => { K[e.code] = 0; });
    // amp9 (Blake t188u): Esc while the mouse is captured only releases it, like the guitar walk. amp.js exits the
    // whole amp on Escape (window keydown, bubble); this capture-phase listener runs first and swallows that Esc.
    // Chrome may drop the lock before the keydown arrives, so an Esc within 300 ms of losing the lock counts too.
    // With the mouse free, Esc still leaves the amp as before.
    on(document, 'pointerlockchange', () => { const l = !!locked(); if (LOCK.was && !l) LOCK.lostT = performance.now(); LOCK.was = l; });
    on(window, 'keydown', (e) => {
      if (!active || e.key !== 'Escape') return;
      if (locked() || performance.now() - LOCK.lostT < 300) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); unlock(); }
    }, true);
    on(window, 'blur', releaseAll);
    on(window, 'pagehide', releaseAll);
    on(document, 'visibilitychange', () => { if (document.hidden) releaseAll(); });
  }

  // ---------- failure isolation ----------
  function fail(e) {
    if (failed++ < 3) console.warn('[amp] walk:', e);
    const wasActive = active;
    active = false;
    flying = false;
    SIM.on = false;
    try { detach(); releaseAll(); } catch (_) {}
    unlock();   // amp9 (Blake t188u)
    try { document.body?.classList.remove('zg-amp-walk'); } catch (_) {}
    try { camera.up.copy(savedUp); } catch (_) {}
    if (wasActive) {
      setTimeout(() => { try { if (handle.exploring) handle.exit(); } catch (_) {} }, 0);
    }
  }

  // ---------- driver ----------
  function enter(opts) {
    try {
      opts = opts || {};
      if (!handle.object3d) throw new Error('no amp to walk on');
      releaseAll();
      savedUp.copy(camera.up);

      const from = opts.from;
      if (from && Array.isArray(from.position) && from.position.length === 3) {
        fly.pos.fromArray(from.position);
        if (Array.isArray(from.quaternion) && from.quaternion.length === 4) {
          fly.quat.fromArray(from.quaternion).normalize();
        } else {
          fly.quat.copy(camera.quaternion);
        }
        fly.fov = Number.isFinite(+from.fov) && +from.fov > 1 ? +from.fov : camera.fov;
      } else {
        fly.pos.copy(camera.position);
        fly.quat.copy(camera.quaternion);
        fly.fov = camera.fov;
      }
      fly.near = camera.near;

      placeState(START.face, START.u, START.v, START.heading, START.pitch);   // amp8: top, so pitch = START.pitch

      camera.far = Math.max(camera.far || 0, 2000);
      camera.position.copy(fly.pos);
      camera.quaternion.copy(fly.quat);
      camera.fov = fly.fov;
      camera.updateProjectionMatrix();

      document.body?.classList.remove('zg-amp-walk');
      try {
        const a = document.activeElement;
        if (a && a !== document.body && typeof a.blur === 'function') a.blur();
      } catch (_) {}

      active = true;
      flying = true;
      flyT = 0;
      flyStart = performance.now();
      attach();
      if (reduced()) stepFlight();
    } catch (e) {
      fail(e);
    }
  }

  function exit() {
    const was = active;
    active = false;
    flying = false;
    SIM.on = false;
    try { detach(); } catch (_) {}
    try { releaseAll(); } catch (_) {}
    unlock();   // amp9 (Blake t188u)
    try { document.body?.classList.remove('zg-amp-walk'); } catch (_) {}
    if (was) { try { camera.up.copy(savedUp); } catch (_) {} }
  }

  function tick(dt) {
    if (!active || !handle.object3d) return;
    try {
      dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 1 / 60;
      if (flying) { stepFlight(); return; }
      walkStep(dt);
      applyCamera();
    } catch (e) {
      fail(e);
    }
  }

  function dispose() {
    exit();
    try { joyEl?.remove(); } catch (_) {}
    joyEl = null;
  }

  // ---------- debug / test API ----------
  const api = {
    flyMs: FLY_MS,
    // amp7: the page's jump button (#jump) holds/releases a hop while on the amp (same as holding Space)
    jump(down) { IN.jumpHold = !!down && active && !flying; return IN.jumpHold; },
    box: { ...B, edgeRadius: R },
    eye: EYE,
    state() {
      const face = faceOf(S.n);
      const [u, v] = pointToUV(face, S.p);
      const out = {
        face, u: clamp01(u), v: clamp01(v),
        onAmp: active && !flying, flying, flyT,
        up: [0, 1, 0], normal: [0, 1, 0], eyeDist: 0,
        heading: 0, speed: Math.hypot(S.vf, S.vs), pitch: S.pitchS,
        hop: S.hop, jumps: IN.jumps, jumpHold: IN.jumpHold,   // amp7
        // amp9 (Blake t188u): look mechanics, compared with the guitar's __dbg.input() by the look probe
        lookMode: TOUCH ? 'drag' : 'pointerlock', lookSens: TOUCH ? SENS_TOUCH : SENS_MOUSE,
        pointerLocked: !!locked(), pitchMax: PITCH_MAX,
        // amp8 (Blake t174u/t178u): handle walking. lift = foot height above the tolex (in), handleTop = the
        // collider's walkable top under the walker (amp-local y, null when not over it).
        onHandle: S.onHandle && active && !flying, lift: S.lift,
        handleTop: Number.isFinite(S.handleTop) ? S.handleTop : null,
        gMem: S.gMem   // amp9 (Blake t188u): W-fallback travel memory (+1 up / -1 down / 0 unknown)
      };
      const root = handle.object3d ? frame() : null;   // amp9 (Blake t188u): local = tilted cabinet frame
      if (!root) { out.onAmp = false; return out; }
      root.updateWorldMatrix(true, false);
      const rq = new Q(); root.getWorldQuaternion(rq);
      const nW = S.n.clone().applyQuaternion(rq).normalize();
      const uW = S.upS.clone().applyQuaternion(rq).normalize();
      const pW = S.p.clone().applyMatrix4(root.matrixWorld);
      out.up = uW.toArray();
      out.normal = nW.toArray();
      // amp8: eyeDist is measured from the foot (tolex + handle lift), so it stays EYE (+hop) on the handle too.
      out.eyeAboveTolex = camera.position.clone().sub(pW).dot(nW);
      out.eyeDist = out.eyeAboveTolex - S.lift * rootScale();
      const f0 = new V3().fromArray(FACES[face].f0);
      const left = new V3().crossVectors(S.n, f0);
      out.heading = Math.atan2(S.fwd.dot(left), S.fwd.dot(f0));
      // amp8 (Blake t174u/t178u): amp-local frames for the walk-direction tests (inches; debug only, allocates).
      // posLocal = walker foot point on the tolex, normalLocal = face normal, upLocal = smoothed camera up,
      // fwdLocal/rightLocal = walking frame on the face, cam*Local = the rendered camera's axes.
      const r3 = (v) => v.toArray().map(x => +x.toFixed(5));
      out.posLocal = r3(S.p);
      out.footLocal = r3(S.p.clone().addScaledVector(S.n, S.lift));   // amp8: what the walker stands on
      out.normalLocal = r3(S.n);
      out.upLocal = r3(S.upS);
      out.fwdLocal = r3(S.fwd);
      out.rightLocal = r3(S.rt);   // amp8 (item 3 follow-up): the walk right (D / stick-right) on the face
      const cwq = camera.getWorldQuaternion(new Q());
      const cq = rq.clone().invert().multiply(cwq);
      out.camFwdLocal = r3(new V3(0, 0, -1).applyQuaternion(cq));
      out.camRightLocal = r3(new V3(1, 0, 0).applyQuaternion(cq));
      out.camUpLocal = r3(new V3(0, 1, 0).applyQuaternion(cq));
      // amp8 (Blake t174u/t178u, item 3 follow-up): roll = rendered camera roll vs the world horizon (rad,
      // + = right side up); worldUpLocal = world up in amp-local axes; yaw/pitch = upright look (logical);
      // camLag = how far the rendered view still trails the logical look after an edge carry (rad).
      const rW = new V3(1, 0, 0).applyQuaternion(cwq), cuW = new V3(0, 1, 0).applyQuaternion(cwq);
      out.roll = Math.atan2(rW.y, cuW.y);
      out.worldUpLocal = r3(S.U);
      out.yaw = S.cyaw;
      out.camLag = Math.hypot(S.offYaw * Math.cos(S.pitchS), S.offPitch);
      return out;
    },
    // amp8 (Blake t174u/t178u): deterministic test move. Holds one direction ('forward'|'back'|'left'|'right',
    // or 'W'|'S'|'A'|'D') for `ms` of simulated time in 1/60 s steps (synchronous, frame-rate independent), and
    // reports the displacement against the camera axes at the start, all amp-local, projected on the start face.
    debugMove(dirName, ms, stepMs) {   // amp10 (Blake t204u) 10l: optional stepMs = the simulated frame time (default 1/60 s), to test slow frames
      const DIRS = { forward: [1, 0], w: [1, 0], back: [-1, 0], s: [-1, 0], right: [0, 1], d: [0, 1], left: [0, -1], a: [0, -1] };
      const d = DIRS[String(dirName || '').toLowerCase()];
      if (!d || !active || flying || !handle.object3d) return null;
      const a = api.state();
      const sOn = SIM.on, sF = SIM.f, sS = SIM.s;
      try {
        SIM.on = true; SIM.f = d[0]; SIM.s = d[1];
        let left = clamp(+ms || 300, 0, 10000) / 1000;
        const stepS = Number.isFinite(+stepMs) && +stepMs > 0 ? clamp(+stepMs / 1000, 1 / 240, 0.1) : 1 / 60;
        while (left > 1e-6) { const h = Math.min(stepS, left); walkStep(h); left -= h; }
        applyCamera();
      } catch (e) { fail(e); } finally { SIM.on = sOn; SIM.f = sF; SIM.s = sS; }
      const z = api.state();
      const n = a.normalLocal, dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const onFace = (v) => { const k = dot3(v, n), w = v.map((x, i) => x - n[i] * k), l = Math.hypot(...w) || 1; return w.map(x => x / l); };
      const disp = z.posLocal.map((x, i) => x - a.posLocal[i]);
      // amp8 (Blake t174u/t178u, item 3 follow-up): the screen-relative target from the RENDERED camera at the
      // start: forward = camera forward on the face, blended toward up-the-face when short; right = camera
      // right on the face, blended toward the perpendicular of forward (camera-right side) when short.
      const rej = (v) => { const k = dot3(v, n); return v.map((x, i) => x - n[i] * k); };
      const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
      const pfw = Math.abs(dot3(n, a.worldUpLocal)) < 0.5 ? rej(a.worldUpLocal).map(x => x * Math.sin(a.pitch)) : null, pf = pfw && Math.hypot(...pfw) < FB_TAU ? [0, 0, 0] : (pfw || rej(a.camFwdLocal)), mf  /* amp10 (Blake t196u) 10h: same wall rule as walkDirs */ = Math.hypot(...pf), g0 = rej(a.worldUpLocal), gl0 = Math.hypot(...g0), gm = a.gMem, g = (gm < 0 || (gm === 0 && a.pitch < -0.35)) ? g0.map(x => -x) : g0;   // amp8 Grok fix: same fallback as walkDirs (amp9 (Blake t188u): travel memory gMem)
      const gt = (() => { const cu = a.worldUpLocal, k = dot3(a.camFwdLocal, cu), hz = a.camFwdLocal.map((x, i) => x - cu[i] * k); return nrm(rej(hz)); })(), gg = Math.abs(dot3(n, a.worldUpLocal)) < 0.5 ? g : [0, 0, 0],   /* amp10 (Blake t196u) 10h: top = camera heading blend */
        sf = nrm(pf.map((x, i) => x + gg[i] * Math.max(0, FB_TAU - mf)));
      let c = [sf[1] * n[2] - sf[2] * n[1], sf[2] * n[0] - sf[0] * n[2], sf[0] * n[1] - sf[1] * n[0]];
      if (dot3(c, a.camRightLocal) < 0) c = c.map(x => -x);
      const pr = rej(a.camRightLocal), mr = Math.hypot(...pr);
      const sr = nrm(pr.map((x, i) => x + c[i] * Math.max(0, FB_TAU - mr)));
      const want = d[0] ? sf.map(x => x * d[0]) : sr.map(x => x * d[1]);
      const wantCam = d[0] ? a.camFwdLocal.map(x => x * d[0]) : a.camRightLocal.map(x => x * d[1]);
      // amp8: handle fields (lift change = step up / follow / fall; foot = tolex point + lift)
      const footDisp = z.footLocal.map((x, i) => x - a.footLocal[i]);
      return { dir: dirName, face0: a.face, face1: z.face, moved: Math.hypot(...disp), disp,
        dot: dot3(onFace(disp), onFace(want)), dotCam: dot3(onFace(disp), onFace(wantCam)),
        onHandle0: a.onHandle, onHandle1: z.onHandle,
        lift0: a.lift, lift1: z.lift, footDisp, start: a, end: z };
    },
    place(face, u, v, headingRad) {
      try {
        if (!handle.object3d) return api.state();
        if (face === 'handle') {
          // amp8 (Blake t174u/t178u): stand ON the handle. u = along x (0 = left end, 1 = right end),
          // v = across z (0 = back edge, 1 = front edge); heading as on the top face.
          const c = handleCollider();
          if (!c) return api.state();
          const x = c.cx + (clamp01(Number.isFinite(+u) ? +u : 0.5) * 2 - 1) * c.hx * 0.98;
          const z = c.cz + (clamp01(Number.isFinite(+v) ? +v : 0.5) * 2 - 1) * c.hz * 0.9;
          placeState('top', (x - B.xMin) / SPAN.x, (z - B.zMin) / SPAN.z, headingRad, clamp(S.pitchT, -RESTORE_MAX, RESTORE_MAX));   // amp10 (Blake t204u) 10l: see the top case below
          liftStep(0);
          S.lift = Number.isFinite(S.handleTop) ? Math.max(0, S.handleTop - S.p.y) : 0;
          S.onHandle = S.lift > 0;
        } else {
          // amp8 (Blake t174u/t178u): top keeps the current pitch; on a wall the view looks along the heading
          // (like the old face-relative view at START.pitch), upright.
          const f = FACES[face] ? face : 'top';
          // amp10 (Blake t204u) 10l: a place on the TOP keeps the pitch, but only within +-RESTORE_MAX: after climbing a wall the pitch can be +-1.35
          // (looking straight up/down), and on the 27 deg tilted top a near-vertical look has a horizontal part that points the wrong way
          // (the top normal leans toward the back), so the requested heading came out reversed and the walker ended on the BACK face.
          placeState(f, u, v, headingRad, f === 'top' ? clamp(S.pitchT, -RESTORE_MAX, RESTORE_MAX) : START.pitch);
        }
        if (active) {
          if (flying) land();
          else applyCamera();
        }
      } catch (e) { fail(e); }
      return api.state();
    },
    // Face-relative look (as before): yaw = heading on the face (top: 0 = toward the back; walls: 0 = up the
    // face, + = turn left), pitch = off the face (+ = away from it). amp8 (Blake t174u/t178u): the camera now
    // looks that way UPRIGHT (roll dropped, pitch clamped ±80° from the horizon). Omitted args keep the current.
    look(yawRad, pitchRad) {
      try {
        if (!handle.object3d) return api.state();
        const face = faceOf(S.n);
        let h = +yawRad, p = +pitchRad;
        if (!Number.isFinite(h)) {
          const f0 = tF.fromArray(FACES[face].f0), left = tR.crossVectors(S.n, f0);
          h = Math.atan2(S.fwd.dot(left), S.fwd.dot(f0));
        }
        if (!Number.isFinite(p)) {
          updUp(); camDirs(S.cyaw, S.pitchS, cL, cR, cH);
          p = Math.asin(clamp(cL.dot(S.n), -1, 1));
        }
        setLookAnt(face, h, clamp(p, -PITCH_MAX, PITCH_MAX));
        if (active && !flying) applyCamera();
      } catch (e) { fail(e); }
      return api.state();
    },
    // amp8 (Blake t174u/t178u): world-level look. yaw around world up (0 = amp-local -z, + = left),
    // pitch from the horizon (clamped ±80°).
    lookUpright(yawRad, pitchRad) {
      try {
        if (!handle.object3d) return api.state();
        updUp();
        if (Number.isFinite(+yawRad)) S.cyaw = wrapPi(+yawRad);
        if (Number.isFinite(+pitchRad)) S.pitchS = S.pitchT = clamp(+pitchRad, -PITCH_MAX, PITCH_MAX);
        S.offYaw = S.offPitch = 0; S.yawT = S.yawS = 0; S.restoreOn = false;
        walkDirs();
        if (active && !flying) applyCamera();
      } catch (e) { fail(e); }
      return api.state();
    },
    drive(forward, strafe, seconds) {
      const secs = Math.max(0, Math.min(30, +seconds || 0));
      return new Promise((resolve) => {
        const go = () => {
          SIM.f = clamp(+forward || 0, -1, 1);
          SIM.s = clamp(+strafe || 0, -1, 1);
          SIM.t = 0;
          SIM.on = true;
          setTimeout(() => {
            try {
              // If frames were throttled, top up the simulated time so the
              // walker covers what the stick asked for.
              if (active && !flying && handle.object3d) {
                let left = Math.min(secs - SIM.t, 10);
                while (left > 1e-4) {
                  const h = Math.min(1 / 60, left);
                  walkStep(h);
                  left -= h;
                }
                applyCamera();
              }
            } catch (e) { fail(e); }
            SIM.on = false;
            SIM.f = SIM.s = 0;
            resolve(api.state());
          }, secs * 1000);
        };
        const t0 = performance.now();
        const wait = () => {
          if (flying && active && performance.now() - t0 < 5000) setTimeout(wait, 30);
          else go();
        };
        wait();
      });
    }
  };
  handle.walk = api;

  return { enter, exit, tick, dispose, walk: api };
}
