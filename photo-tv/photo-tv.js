/* photo-tv (t307u/t308u, remodel B2 t312u): procedural late-1950s Philco-Predicta-style swivel TV (cream enamel pill head on
   brass pivot arms, brass trumpet neck, boomerang pedestal with speaker grille + knobs + a "Precious Memories" neon sign,
   splayed brass legs) with six glowing vacuum tubes on top, placed in the background beside the amp.
   It loads in like the amp: built hidden on layer 1, materials compiled + textures uploaded off-screen, then a 700 ms smoothstep
   fade (colour / env / opacity scaling, never a new light), then a CRT power-on, then the neon ignites and it cycles the photos
   (one small tv thumbnail at a time). Clicking it opens the film browser (./film-browser.js, lazy). Not explorable.
   Own failure domain: mountPhotoTV never throws into the page (boot.js catches), it only reads the page's globals
   (window.__dbg, window.__ampHandle, window.__amp8). No THREE lights are created. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const now = () => Math.round(performance.now());
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const sstep = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const NEON_TEXT = 'Precious Memories';
const NEON_FONT = 'Zuniga Mission';

/* ---------- small generated textures (<= 256 px; grille <= 128) ---------- */
function canvasTex(w, h, draw, srgb = true, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}
function grilleTexture() {   // brown woven speaker cloth
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#3a2812'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) { g.fillStyle = (x + y) % 8 ? '#805e32' : '#97723e'; g.fillRect(x, y, 3, 3); }
  });
}
function glowTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false, false);
}
/* the neon sign, drawn once: a crisp bright-cored text layer + a soft halo layer (halo blurred once, here, via shadowBlur) */
const NEON_CW = 1024, NEON_CH = 192, NEON_TEXT_W = 900;
function neonTextures(fontFamily) {
  const family = '"' + fontFamily + '", "Zuniga Mission", fantasy, sans-serif';
  const setup = (g) => {
    let px = 130; g.font = px + 'px ' + family;
    const w = g.measureText(NEON_TEXT).width || 1; px = Math.min(150, Math.floor(px * NEON_TEXT_W / w));
    g.font = px + 'px ' + family; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    return px;
  };
  const core = canvasTex(NEON_CW, NEON_CH, (g, w, h) => {
    const px = setup(g); g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffa23c'; g.fillText(NEON_TEXT, w / 2, h / 2 + px * 0.04);
    g.lineWidth = Math.max(2.5, px * 0.032); g.strokeStyle = '#ffe2b8'; g.strokeText(NEON_TEXT, w / 2, h / 2 + px * 0.04);
  }, true, false);
  const halo = canvasTex(NEON_CW, NEON_CH, (g, w, h) => {
    const px = setup(g); g.clearRect(0, 0, w, h);
    g.fillStyle = '#ff7a12'; g.strokeStyle = '#ff8a1e'; g.lineWidth = px * 0.06;
    for (const [b, a] of [[34, 0.9], [20, 0.9], [9, 0.8]]) { g.shadowColor = '#ff8a1e'; g.shadowBlur = b; g.globalAlpha = a; g.fillText(NEON_TEXT, w / 2, h / 2 + px * 0.04); g.strokeText(NEON_TEXT, w / 2, h / 2 + px * 0.04); }
  }, true, false);
  // tight ink box of the glyphs (alpha scan of the core layer, canvas px) so neonRect() measures just the lit letters
  let ink = { x0: 60, y0: 40, x1: NEON_CW - 60, y1: NEON_CH - 40 };
  try {
    const c = core.image, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 > x0 && y1 > y0) ink = { x0: Math.max(0, x0 - 4), y0: Math.max(0, y0 - 4), x1: Math.min(c.width, x1 + 4), y1: Math.min(c.height, y1 + 4) };
  } catch (_) { }
  return { core, halo, ink };
}
async function ensureFont() {   // Zuniga Mission v3 is already declared + loaded by harness.css; make sure, with a fallback FontFace
  const spec = '64px "' + NEON_FONT + '"';
  const ok = () => { try { return document.fonts.check(spec, NEON_TEXT); } catch (_) { return false; } };
  const lim = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  try { await lim(document.fonts.load(spec, NEON_TEXT), 3000); } catch (_) { }
  if (ok()) return true;
  try {
    const url = new URL('../assets/fonts/ZunigaMission-Regular-v3.woff2', import.meta.url).href;
    const ff = new FontFace(NEON_FONT, 'url(' + url + ')'); await lim(ff.load(), 4000); document.fonts.add(ff);
    await lim(document.fonts.load(spec, NEON_TEXT), 1500);
  } catch (e) { console.warn('[photo-tv] neon font fallback failed', e); }
  return ok();
}

/* ---------- the screen shader (rounded-rect curved glass, 1.45:1) ---------- */
const SCR_W = 0.58, SCR_H = 0.40, SCR_R = 0.105;
const SCREEN_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SCREEN_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tA; uniform sampler2D tB;
uniform float uMix, uT, uSwitch, uRoll, uAspA, uAspB, uFade, uHasA;
uniform float uScr;  // polish: the screen's real width / height in the world (the panel's w/h can be any shape)
uniform vec4 uPow;   // x: open width, y: open height, z: picture brightness, w: line glow
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// polish (Blake t405u "photos must not be distorted"): CONTAIN against the real screen aspect (uScr). The whole photo is shown at
// its true aspect; a wider photo gets bars top and bottom, a taller one bars left and right. Never stretched to the panel.
vec2 fitUv(vec2 uv, float asp){
  float r = asp / uScr;
  if (r >= 1.0) uv.y = (uv.y - 0.5) * r + 0.5;
  else uv.x = (uv.x - 0.5) / r + 0.5;
  return uv;
}
vec3 samp(sampler2D t, vec2 uv, float asp, float fr){
  vec2 u = fitUv(uv, asp);
  vec2 ins = step(vec2(0.0), u) * step(u, vec2(1.0));
  float m = ins.x * ins.y;
  vec3 c = vec3(texture2D(t, u + vec2(fr, 0.0)).r, texture2D(t, u).g, texture2D(t, u - vec2(fr, 0.0)).b);
  return c * m;
}
void main(){
  vec2 hs = vec2(${SCR_W.toFixed(4)}, ${SCR_H.toFixed(4)}) * 0.5;
  vec2 dd = abs(vUv - 0.5) * hs * 2.0 - (hs - vec2(${SCR_R.toFixed(4)}));
  if (length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - ${SCR_R.toFixed(4)} > 0.0) discard;
  vec2 p = vUv;
  vec2 q = p; q.y = fract(q.y + uRoll);
  float fr = 0.0012 + 0.004 * uSwitch;
  vec3 pic;
  if (uMix >= 0.999) pic = samp(tB, q, uAspB, fr);
  else if (uMix <= 0.001) pic = samp(tA, q, uAspA, fr) * uHasA;
  else pic = mix(samp(tA, q, uAspA, fr) * uHasA, samp(tB, q, uAspB, fr), uMix);
  float n = hash(floor(p * vec2(220.0, 170.0)) + floor(uT * 60.0) * 7.13);
  pic = mix(pic, vec3(n * 0.9), uSwitch * 0.75);
  pic *= vec3(1.05, 1.0, 0.88);                                     // warm phosphor
  pic += (hash(floor(p * vec2(900.0, 620.0)) + fract(uT * 23.0) * 91.7) - 0.5) * 0.11;   // Blake 9:50: analog TV grain (always on)
  vec2 c = (p - 0.5) * 2.0;
  float scan = 0.84 + 0.16 * sin(p.y * 520.0);                       // scanlines
  float vig = clamp(1.0 - dot(c * vec2(0.8, 0.95), c * vec2(0.8, 0.95)) * 0.34, 0.0, 1.0);
  float fl = 0.975 + 0.025 * sin(uT * 47.0) * sin(uT * 3.1);
  float hy = fract(uT * 0.06); float hum = 0.06 * exp(-pow((p.y - hy) * 7.0, 2.0));
  pic = (pic * scan + hum) * vig * fl;
  pic += vec3(0.05, 0.04, 0.03) * smoothstep(0.55, 1.0, p.x * 0.5 + p.y * 0.5) * 0.35;   // glass sheen, top right
  float px = abs(c.x), py = abs(c.y);
  float inside = (1.0 - smoothstep(uPow.x - 0.02, uPow.x + 0.005, px)) * (1.0 - smoothstep(uPow.y - 0.02, uPow.y + 0.005, py));
  float line = (1.0 - smoothstep(0.0, uPow.y + 0.02, py)) * (1.0 - smoothstep(uPow.x - 0.08, uPow.x + 0.01, px)) * uPow.w;
  vec3 col = vec3(0.012, 0.014, 0.012) + pic * inside * uPow.z + vec3(1.0, 0.93, 0.8) * line * 1.25;
  gl_FragColor = vec4(col * uFade, 1.0);
}`;

/* ---------- model ---------- */
// local units: pedestal width ~1.06, facing +z, y = 0 at the floor (feet). Total height (tubes incl.) ~1.13.
const STAND = true;    // P3 (Blake 7:54, grounded hero TV): pedestal + legs restored, the TV stands on the floor plane (the 6:10 floating variant stays behind this switch)
const BOXY = true;   // Blake 8:38: boxy cabinet whose front face mirrors the amp's face (no pedestal / legs / pill head)
const CAB = { w: 1.0, h: 0.86, d: 0.46, fz: 0.10, scrW: 0.84, neonY: 0.125 };
const TV_B = 0;    // lowest local y of the floating TV (the bottom of the neon plate); TV_H = the tube tops
const TV_H = 1.13, TV_BOX = { x: 0.54, z0: -0.34, z1: 0.14 };
const PY = 0.10;          // pedestal group offset (its local y = 0 is the lowest edge of the boomerang)
const HEAD_Y = 0.74;      // head centre
const NECK_Y = 0.46;
const SIGN = { w: 0.76, y: 0.252 };   // neon plane width / centre height in pedestal-local coords

function rrPath(p, hw, hh, r) {
  p.moveTo(-hw + r, -hh); p.lineTo(hw - r, -hh); p.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  p.lineTo(hw, hh - r); p.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  p.lineTo(-hw + r, hh); p.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(-hw, -hh + r); p.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
  return p;
}
const rrShape = (hw, hh, r) => rrPath(new THREE.Shape(), hw, hh, r);
const spl = (pts, n) => new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(n);
function legGeo(top, foot) {
  const a = new THREE.Vector3(...top), b = new THREE.Vector3(...foot), d = a.clone().sub(b), len = d.length();
  const g = new THREE.CylinderGeometry(0.015, 0.0055, len, 8, 1);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  const s = new THREE.SphereGeometry(0.014, 8, 6); s.translate(b.x, b.y, b.z);
  return mergeGeometries([g, s]);
}

function panelGlowTexture() {   // Blake 9:50: soft glow around the photo panel (the plane is 1.3 x 1.42 of the screen; the screen covers the middle)
  return canvasTex(512, 512, (g, w, h) => {
    const iw = w / 1.3, ih = h / 1.42, x = (w - iw) / 2, y = (h - ih) / 2, r = iw * 0.18;
    g.clearRect(0, 0, w, h); g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = 46; g.fillStyle = '#fff';
    for (let k = 0; k < 2; k++) { g.beginPath(); g.roundRect(x, y, iw, ih, r); g.fill(); }
    g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.roundRect(x - 2, y - 2, iw + 4, ih + 4, iw * SCR_R / SCR_W); g.fill();   // glow only outside the frame
  }, true, false);
}
function buildTV(tex) {
  const root = new THREE.Group(); root.name = 'photo-tv';
  const fade = [];     // { m, c0, env0, op0, kind }
  const meshes = [];   // raycast targets
  const reg = (m, kind) => { fade.push({ m, c0: m.color ? m.color.clone() : null, env0: m.envMapIntensity, op0: m.opacity, em0: m.emissiveIntensity, kind }); return m; };
  // glossy ivory: bright base + a small emissive lift (no lights; the scene's own lighting reads it olive/dim otherwise)
  const cream = reg(new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: new THREE.Color(0xfff0cc), emissiveIntensity: 0.1, roughness: 0.3, metalness: 0.0, envMapIntensity: 1.5 }), 'o');
  const brass = reg(new THREE.MeshStandardMaterial({ color: 0xe6bc5c, roughness: 0.24, metalness: 1, envMapIntensity: 1.35 }), 'o');
  const chrome = reg(new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.18, metalness: 1, envMapIntensity: 1.35 }), 'o');
  const panelM = reg(new THREE.MeshStandardMaterial({ color: 0x17110c, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.5 }), 'o');
  const grilleM = reg(new THREE.MeshStandardMaterial({ map: tex.grille, color: 0xffffff, roughness: 0.92, metalness: 0, envMapIntensity: 0.35 }), 'o');
  grilleM.map.repeat.set(16, 16);
  const knobM = reg(new THREE.MeshStandardMaterial({ color: 0xcfa85a, roughness: 0.3, metalness: 1, envMapIntensity: 1.0 }), 'o');
  const glassM = reg(new THREE.MeshStandardMaterial({ color: 0xdbe9f0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 }), 't');
  const filM = new THREE.MeshStandardMaterial({ color: 0x331205, emissive: new THREE.Color(0xff7a2a), emissiveIntensity: 0, roughness: 0.6, metalness: 0, toneMapped: true });
  const plateM = reg(new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.5, metalness: 0.8, envMapIntensity: 0.5 }), 'o');
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); meshes.push(m); return m; };
  const ext = (shape, o) => new THREE.ExtrudeGeometry(shape, Object.assign({ steps: 1, curveSegments: 6, bevelEnabled: true }, o));

  /* ----- pedestal (boomerang capsule, ends curve down) ----- */
  const ped = new THREE.Group(); ped.position.y = PY; root.add(ped);
  const PFZ = 0.135;
  if (STAND && !BOXY) {   // photo-tv (Blake 6:10 approved: suspend the TV, no stand): pedestal / grille / knobs / legs / neck / arms are not built (code kept, switch STAND)
  const top = spl([[-0.5, 0.14], [-0.47, 0.23], [-0.38, 0.30], [-0.2, 0.335], [0, 0.34], [0.2, 0.335], [0.38, 0.30], [0.47, 0.23], [0.5, 0.14]], 36);
  const bot = spl([[0.485, 0.075], [0.42, 0.025], [0.31, 0.0], [0.2, 0.02], [0, 0.075], [-0.2, 0.02], [-0.31, 0.0], [-0.42, 0.025], [-0.485, 0.075]], 36);
  const pg = ext(new THREE.Shape(top.concat(bot)), { depth: 0.18, bevelThickness: 0.045, bevelSize: 0.03, bevelSegments: 4 });
  pg.translate(0, 0, -0.09);
  add(pg, cream, 0, 0, 0, ped);
  // dark inset front panel + brass trim line
  const pT = spl([[-0.46, 0.17], [-0.44, 0.24], [-0.37, 0.295], [-0.2, 0.315], [0, 0.32], [0.2, 0.315], [0.37, 0.295], [0.44, 0.24], [0.46, 0.17]], 20);
  const pB = spl([[0.45, 0.10], [0.40, 0.055], [0.3, 0.04], [0.2, 0.06], [0, 0.10], [-0.2, 0.06], [-0.3, 0.04], [-0.4, 0.055], [-0.45, 0.10]], 20);
  const pp = pT.concat(pB);
  add(new THREE.ShapeGeometry(new THREE.Shape(pp)), panelM, 0, 0, PFZ + 0.002, ped);
  const trimC = new THREE.CatmullRomCurve3(pp.filter((_, i) => i % 2 === 0).map(p => new THREE.Vector3(p.x, p.y, 0)), true);
  add(new THREE.TubeGeometry(trimC, 110, 0.0035, 4, true), brass, 0, 0, PFZ + 0.004, ped);
  // speaker grille (lower middle) + chrome frame
  const gShape = rrShape(0.25, 0.042, 0.02);
  add(new THREE.ShapeGeometry(gShape), grilleM, 0, 0.145, PFZ + 0.004, ped);
  { const pts = gShape.getPoints(8).map(p => new THREE.Vector3(p.x, p.y, 0)); add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.004, 4, true), chrome, 0, 0.145, PFZ + 0.006, ped); }
  // two chrome knobs with tick marks + small round buttons
  const kg = new THREE.CylinderGeometry(0.03, 0.033, 0.03, 18); kg.rotateX(Math.PI / 2);
  const kr = new THREE.CylinderGeometry(0.038, 0.038, 0.006, 18); kr.rotateX(Math.PI / 2);
  const bt = new THREE.CylinderGeometry(0.014, 0.015, 0.014, 12); bt.rotateX(Math.PI / 2);
  const tickG = []; for (let i = 0; i < 5; i++) { const a = (-0.95 + i * 0.475), t = new THREE.BoxGeometry(0.004, 0.011, 0.003); t.translate(0, 0.056, 0); t.rotateZ(-a); tickG.push(t); }
  const ticks = mergeGeometries(tickG);
  for (const sx of [-1, 1]) {
    const kx = sx * 0.385, ky = 0.19;
    add(kr, brass, kx, ky, PFZ + 0.005, ped);
    const k = add(kg, knobM, kx, ky, PFZ + 0.02, ped);
    add(ticks, brass, kx, ky, PFZ + 0.006, ped);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.004), panelM); mark.position.set(0, 0.016, 0.0165); mark.rotation.z = sx * 0.5; k.add(mark);
    add(bt, chrome, kx, 0.10, PFZ + 0.008, ped);
  }
  }   // end STAND
  // photo-tv (Blake 6:10 approved): the neon hangs under the head on a slim dark plate (two short brass hangers), no stand
  const ph = SIGN.w * NEON_CH / NEON_CW;
  if (!STAND && !BOXY) { const PLH = ph / 2 + 0.028, PLW = SIGN.w / 2 + 0.03, pl = ext(rrShape(PLW, PLH, 0.045), { depth: 0.03, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    pl.translate(0, 0, 0.09); add(pl, plateM, 0, SIGN.y, 0, ped);
    const tb = new THREE.TorusGeometry(1, 0.0035, 4, 40); tb.scale(PLW - 0.004, PLH - 0.004, 1); tb.translate(0, 0, 0.1245); add(tb, brass, 0, SIGN.y, 0, ped);
    const hg = []; for (const sx of [-1, 1]) { const c = new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8); c.translate(sx * PLW * 0.62, SIGN.y + PLH + 0.012, 0.02); hg.push(c); }
    add(mergeGeometries(hg), brass, 0, 0, 0, ped); }
  // neon sign planes (under the screen, centred): halo (additive) under a bright-cored text layer
  const haloM = new THREE.MeshBasicMaterial({ map: tex.neonHalo, color: new THREE.Color().setRGB(1.7, 1.05, 0.46), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
  const coreM = new THREE.MeshBasicMaterial({ map: tex.neonCore, color: new THREE.Color().setRGB(2.1, 1.85, 1.5), transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const haloMesh = add(new THREE.PlaneGeometry(SIGN.w, ph), haloM, 0, SIGN.y, STAND ? PFZ + 0.007 : 0.1265, ped); haloMesh.renderOrder = 6;
  const coreMesh = add(new THREE.PlaneGeometry(SIGN.w, ph), coreM, 0, SIGN.y, STAND ? PFZ + 0.0085 : 0.1278, ped); coreMesh.renderOrder = 7;

  /* ----- legs: 4 tapered brass, splayed, ball feet ----- */
  const legs = [];
  if (STAND && !BOXY) for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(legGeo([sx * 0.30, 0.118, sz * 0.06], [sx * 0.44, 0.014, sz * 0.13]));
  if (STAND && !BOXY) add(mergeGeometries(legs), brass, 0, 0, 0);

  /* ----- neck: brass trumpet foot ----- */
  const neckPts = [[0.09, 0], [0.086, 0.006], [0.07, 0.014], [0.046, 0.032], [0.033, 0.056], [0.031, 0.09]].map(p => new THREE.Vector2(p[0], p[1]));
  if (STAND && !BOXY) add(new THREE.LatheGeometry(neckPts, 20), brass, 0, NECK_Y, 0);

  /* ----- head: cream pill hood + tapered rear bell + bezel ring + pivots + arms ----- */
  const head = new THREE.Group(); head.position.set(0, HEAD_Y, 0); root.add(head);
  const HF = 0.11;   // front cap z
  const HS = BOXY ? CAB.scrW / SCR_W : 1;
  if (BOXY) {   // cabinet: rounded cream box, front face at CAB.fz; screen (scaled head) in the upper face, neon strip below it
    const bw = CAB.w / 2 - 0.025, bh = CAB.h / 2 - 0.025, bd = CAB.d - 0.05;
    const bg = ext(rrShape(bw, bh, 0.05), { depth: bd, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3 }); bg.translate(0, CAB.h / 2, CAB.fz - bd - 0.025); add(bg, cream, 0, 0, 0);
    const sy = CAB.h - 0.07 - 0.205 * HS;
    head.position.set(0, sy, CAB.fz - HF * HS + 0.002); head.scale.setScalar(HS);
    add(new THREE.ShapeGeometry(rrShape(0.29 * HS, 0.198 * HS, 0.1 * HS)), panelM, 0, sy, CAB.fz + 0.001);   // dark well behind the glass corners
    const nh = SIGN.w * NEON_CH / NEON_CW + 0.03, ns = rrShape(CAB.w / 2 - 0.06, nh / 2, 0.03);
    add(new THREE.ShapeGeometry(ns), panelM, 0, CAB.neonY, CAB.fz + 0.002);
    { const pts = ns.getPoints(8).map(p => new THREE.Vector3(p.x, p.y, 0)); add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.0035, 4, true), brass, 0, CAB.neonY, CAB.fz + 0.004); }
  }
  if (!BOXY) add(ext(rrShape(0.33, 0.20, 0.12), { depth: 0.06, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 4 }), cream, 0, 0, 0, head);
  if (!BOXY) { const bg = ext(rrShape(0.22, 0.12, 0.09), { depth: 0.1, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 4 }); bg.translate(0, -0.01, -0.24); add(bg, cream, 0, 0, 0, head); }
  { const rs = rrShape(0.31, 0.205, 0.12); rs.holes.push(rrPath(new THREE.Path(), 0.283, 0.193, 0.1)); add(ext(rs, { depth: 0.012, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 }), brass, 0, 0, HF, head); }
  // curved glass: plane bulged toward the viewer, rounded corners cut in the shader
  const sg = new THREE.PlaneGeometry(SCR_W, SCR_H, 18, 12);
  { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const nx = p.getX(i) / (SCR_W / 2), ny = p.getY(i) / (SCR_H / 2); p.setZ(i, 0.022 * (1 - 0.5 * nx * nx - 0.5 * ny * ny) * (1 - 0.08 * nx * nx * ny * ny)); } sg.computeVertexNormals(); }
  const screenU = {
    tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uT: { value: 0 }, uSwitch: { value: 0 }, uRoll: { value: 0 },
    uAspA: { value: 1.5 }, uAspB: { value: 1.5 }, uScr: { value: SCR_W / SCR_H }, uFade: { value: 0 }, uHasA: { value: 0 }, uPow: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const screenM = new THREE.ShaderMaterial({ uniforms: screenU, vertexShader: SCREEN_VS, fragmentShader: SCREEN_FS, toneMapped: false });
  const screen = add(sg, screenM, 0, 0, HF + 0.004, head);
  // vent slots (top-left)
  { const v = []; for (let i = 0; i < 5; i++) { const b = new THREE.BoxGeometry(0.007, 0.004, 0.034); b.translate(-0.30 + i * 0.016, 0.2405, 0.03); v.push(b); } add(mergeGeometries(v), plateM, 0, 0, 0, head); }
  // pivot knobs + brass arms curving down to the neck
  const pvG = new THREE.CylinderGeometry(0.03, 0.03, 0.045, 18); pvG.rotateZ(Math.PI / 2);
  const capG = new THREE.CylinderGeometry(0.02, 0.02, 0.012, 14); capG.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    if (STAND && !BOXY) { add(pvG, chrome, sx * 0.385, 0.03, 0.02, head); add(capG, brass, sx * 0.41, 0.03, 0.02, head); }   // P: floating TV has no pivots (slimmer head: screen fills more of the box)
    const c = new THREE.CatmullRomCurve3([[0.40, 0.03], [0.425, -0.08], [0.385, -0.195], [0.29, -0.245], [0.17, -0.268], [0.07, -0.275]].map(p => new THREE.Vector3(sx * p[0], p[1], 0.02)));
    if (STAND && !BOXY) add(new THREE.TubeGeometry(c, 24, 0.0075, 6, false), brass, 0, 0, 0, head);
  }

  /* ----- tubes (job B6, pick T2): a chrome rail on the head with 2 tall EL34 (ends, bakelite base) + 4 short 12AX7 on ivory
     sockets. Glass = LatheGeometry (16 segs, shared per type, vertex-colour amber tint low / cool high), inside: grey box plates,
     mica spacers, silver getter cap, emissive heater (filM, flickered/warmed by the tick) + one additive halo sprite per tube. ----- */
  const glowM = new THREE.SpriteMaterial({ map: tex.glow, color: 0xff8a3a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
  const ivory = reg(new THREE.MeshStandardMaterial({ color: 0xf2e6c6, roughness: 0.35, metalness: 0, envMapIntensity: 1.2 }), 'o');
  const bakeM = reg(new THREE.MeshStandardMaterial({ color: 0x6a2f16, roughness: 0.3, metalness: 0.15, envMapIntensity: 1.3 }), 'o');
  const anodeM = reg(new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.9, emissive: new THREE.Color(0x2a2b2e), emissiveIntensity: 0.5 }), 'o');
  const micaM = reg(new THREE.MeshStandardMaterial({ color: 0xe9e0c9, roughness: 0.55, metalness: 0, envMapIntensity: 0.6 }), 'o');
  const getterM = reg(new THREE.MeshStandardMaterial({ color: 0xa4a8ae, roughness: 0.12, metalness: 1, envMapIntensity: 1.7 }), 'o');
  glassM.renderOrder = 4;
  // b6b: clear glass (body alpha ~.12) with a cheap fresnel: alpha and a pale emissive rise toward the silhouette (patched into the same material, no extra pass)
  glassM.opacity = 0.12; glassM.emissive = new THREE.Color(0xffeedd); glassM.emissiveIntensity = 0.85; glassM.envMapIntensity = 2.2;
  glassM.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * (0.55 + 3.4 * pow(1.0 - abs(normalize( vNormal ).z), 2.0)) );'); };
  glassM.customProgramCacheKey = () => 'ptv-glass-fresnel';
  for (const e of fade) if (e.m === glassM) e.op0 = 0.12;
  const stripeG = (r, h) => {
    const mkS = (x, w, y0, y1, a) => { const g = new THREE.PlaneGeometry(w, y1 - y0, 1, 4), p = g.attributes.position, c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + (y1 - y0) / 2) / (y1 - y0), k = a * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6; c[i * 3] = k; c[i * 3 + 1] = k * 0.97; c[i * 3 + 2] = k * 0.92; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.rotateY(-Math.asin(x / r)); g.translate(x, (y0 + y1) / 2, Math.sqrt(1 - (x / r) ** 2) * r * 0.97); return g; };
    return mergeGeometries([mkS(-r * 0.56, r * 0.1, h * 0.12, h * 0.8, 1), mkS(r * 0.66, r * 0.05, h * 0.2, h * 0.7, 0.45)]);
  };
  // crisp vertical specular stripes (additive, vertex-colour taper) just inside the glass front
  const stripeM = reg(new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 't');
  stripeM.renderOrder = 5;
  const sprites = [], topY = BOXY ? CAB.h + 0.004 : HEAD_Y + 0.24, BASE_Y = topY + 0.002;
  const cyl = (r0, r1, h, y, seg = 14) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1); g.translate(0, y, 0); return g; };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  // glass profile -> lathe with vertex colours; tall=true is the EL34 bottle (straight body, shoulder, narrower dome)
  const glassGeo = (r, h, tall) => {
    const P = tall
      ? [[1, 0], [1, .5], [.995, .66], [.96, .76], [.9, .84], [.78, .9], [.58, .945], [.34, .968], [.18, .975], [.1, .98], [.075, .99], [.085, .995], [.05, 1]]
      : [[1, 0], [1, .52], [.985, .68], [.93, .79], [.82, .87], [.62, .93], [.38, .965], [.2, .975], [.1, .98], [.075, .99], [.085, .995], [.05, 1]];
    const pts = new THREE.SplineCurve(P.map(p => new THREE.Vector2(p[0] * r, p[1] * h))).getPoints(15);
    pts[pts.length - 1].x = 0.0001;
    const g = new THREE.LatheGeometry(pts, 16), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / h)), k = Math.min(1, t / 0.45);   // 0 = low (amber), 1 = upper (cool)
      col[i * 3] = 1 - 0.1 * k; col[i * 3 + 1] = 0.76 + 0.2 * k; col[i * 3 + 2] = 0.5 + 0.5 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  glassM.vertexColors = true;
  const mk = (r, h, tall) => {
    const w = r * 0.34, ay = h * 0.55, ah = h * 0.4;
    return {
      glass: glassGeo(r, h, tall),
      anode: mergeGeometries([box(w, ah, r * 0.95, -r * 0.22, ay, 0), box(w, ah, r * 0.95, r * 0.22, ay, 0)]),
      mica: mergeGeometries([box(r * 1.6, h * 0.014, r * 0.9, 0, h * 0.77, 0), box(r * 1.6, h * 0.014, r * 0.9, 0, h * 0.33, 0), box(r * 0.16, h * 0.4, r * 0.1, 0, ay, -r * 0.5)]),
      getter: (() => { const d = new THREE.SphereGeometry(r * 0.72, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); d.scale(1, 0.6, 1); d.translate(0, h * 0.88, 0); return mergeGeometries([cyl(r * 0.72, r * 0.72, h * 0.07, h * 0.845, 12).toNonIndexed(), d.toNonIndexed()]); })(),
      edges: mergeGeometries([box(r * 0.05, ah, r * 0.05, -r * 0.22 - w / 2, ay, r * 0.47), box(r * 0.05, ah, r * 0.05, r * 0.22 + w / 2, ay, r * 0.47), box(r * 0.05, ah, r * 0.05, -r * 0.22 + w / 2, ay, r * 0.47), box(r * 0.05, ah, r * 0.05, r * 0.22 - w / 2, ay, r * 0.47)]),
      stripe: stripeG(r, h),
      // heater: two bright posts + a cross bar (a tiny "m" like the real filament)
      fil: mergeGeometries([box(r * 0.07, h * 0.12, r * 0.07, -r * 0.13, h * 0.24, 0), box(r * 0.07, h * 0.12, r * 0.07, r * 0.13, h * 0.24, 0), box(r * 0.34, h * 0.025, r * 0.07, 0, h * 0.30, 0), box(r * 0.07, h * 0.12, r * 0.07, 0, h * 0.24, 0)]),
    };
  };
  const GT = mk(0.036, 0.108, true), GS = mk(0.0235, 0.065, false);
  const ringG = (r) => cyl(r * 1.2, r * 1.2, 0.0045, 0.0138);
  const bodyG = (r) => cyl(r * 1.22, r * 1.3, 0.012, 0.006);
  const tubeAt = (x, r, h, tall, G) => {
    const grp = new THREE.Group(); grp.position.set(x, BASE_Y, 0.02); root.add(grp);
    add(bodyG(r), ivory, 0, 0, 0, grp); add(ringG(r), chrome, 0, 0, 0, grp);
    let y0 = 0.016;
    if (tall) { add(cyl(r * 1.12, r * 1.12, 0.02, 0.01 + y0, 14), bakeM, 0, 0, 0, grp); y0 += 0.02; }
    add(G.glass, glassM, 0, y0, 0, grp);
    add(G.anode, anodeM, 0, y0, 0, grp); add(G.mica, micaM, 0, y0, 0, grp); add(G.getter, getterM, 0, y0, 0, grp);
    add(G.fil, filM, 0, y0, 0, grp);
    add(G.edges, getterM, 0, y0, 0, grp);
    add(G.stripe, stripeM, 0, y0, 0, grp).renderOrder = 5;
    const sp = new THREE.Sprite(glowM); sp.position.set(0, y0 + h * 0.26, r * 0.25); sp.scale.setScalar(r * 4.2); sp.renderOrder = 5; grp.add(sp); sprites.push(sp);
    return grp;
  };
  // rail: rounded chrome bar + small bolts
  { const rg = ext(rrShape(0.27, 0.009, 0.008), { depth: 0.05, bevelThickness: 0.008, bevelSize: 0.004, bevelSegments: 2, curveSegments: 3 }); rg.translate(0, 0, -0.025);
    add(rg, chrome, 0, topY - 0.006, 0.02);
    const bg = []; for (const x of [-0.215, -0.128, -0.043, 0.043, 0.128, 0.215]) { const s = new THREE.SphereGeometry(0.0042, 6, 4); s.translate(x, topY - 0.006, 0.02 + 0.034); bg.push(s); }
    add(mergeGeometries(bg), chrome, 0, 0, 0);
  }
  tubeAt(-0.215, 0.036, 0.108, true, GT);
  tubeAt(-0.128, 0.0235, 0.065, false, GS);
  tubeAt(-0.043, 0.0235, 0.065, false, GS);
  tubeAt(0.043, 0.0235, 0.065, false, GS);
  tubeAt(0.128, 0.0235, 0.065, false, GS);
  tubeAt(0.215, 0.036, 0.108, true, GT);
  if (BOXY) { ped.position.y = 0; haloMesh.position.set(0, CAB.neonY, CAB.fz + 0.006); coreMesh.position.set(0, CAB.neonY, CAB.fz + 0.0075); }
  glowM.opacity = 0;
  return { root, fade, meshes, screen, screenU, filM, glowM, sprites, haloM, coreM, neonMesh: coreMesh, ped };
}

/* ---------- placement (photo-tv B5b, Blake t320u/t325u): a floor spot LEFT of both the amp and the guitar, the tv turned in toward
   them (three-quarter view), as big as fits: the whole tv (world Box3, tubes to feet) on screen and clear (>= 6 css px) of the amp,
   the guitar, the ZUNIGA / Folk Blues meshes and the apps row, now and for the next ~30 s of the slow home orbit (the tv is static in
   the world; the camera drifts 0.032 rad/s). A small search sliced over frames (each slice < ~3 ms CPU). ---------- */
const PTV_GAP = 10;   // the check needs >= 6 css px; the extra leaves room for the camera drifting during the load-in
const tickFrame = () => new Promise(r => requestAnimationFrame(() => r()));
function worldBoxRect(box, cam, mw, OX, OY, CW, CH, out) {   // screen aabb of a Box3's 8 corners (null if any corner is behind the camera)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const v = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    v.set(x, y, z).applyMatrix4(mw); if (v.z > -cam.near * 1.5) return null;
    v.applyMatrix4(cam.projectionMatrix);
    const px = OX + (v.x * 0.5 + 0.5) * CW, py = OY + (-v.y * 0.5 + 0.5) * CH;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1; return out;
}
function ampRoot(o) {   // the cabinet only (not the soft floor shadow plane) when the amp names it, else the whole object
  let tgt = o; try { o.traverse(c => { if (c.name === 'amp-cabinet' && tgt === o) tgt = c; }); } catch (_) { }
  return tgt;
}
function ampFloorY(o) { try { return new THREE.Box3().setFromObject(o).min.y; } catch (_) { return 0; } }
// world-space corners of every visible mesh's own bounding box under `obj` (a tighter hull than the Box3 of the rotated boxes)
function hullPoints(obj) {
  const out = [], v = new THREE.Vector3(); obj.updateMatrixWorld(true);
  obj.traverse(m => {
    if (!m.isMesh || !m.geometry || !m.visible || (m.material && m.material.visible === false)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox; if (!b) return;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v.set(x, y, z).applyMatrix4(m.matrixWorld); out.push(v.x, v.y, v.z); }
  });
  return out;
}
function ptsRect(pts, cam, mw, OX, OY, CW, CH, out) {   // screen aabb of flat xyz points (null if any is behind the camera or none)
  if (!pts || !pts.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const v = new THREE.Vector3();
  for (let i = 0; i < pts.length; i += 3) {
    v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(mw); if (v.z > -cam.near * 1.5) return null;
    v.applyMatrix4(cam.projectionMatrix);
    const px = OX + (v.x * 0.5 + 0.5) * CW, py = OY + (-v.y * 0.5 + 0.5) * CH;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1; return out;
}
async function computePlacement(scene, camera, ampMissing, S) {
  const dbg = window.__dbg, V = THREE.Vector3;
  const el = dbg.renderer.domElement, cr = el.getBoundingClientRect();
  const CW = cr.width || innerWidth, CH = cr.height || innerHeight, OX = cr.left || 0, OY = cr.top || 0;
  let cpu = 0, tS = performance.now();
  const slice = async () => { const t = performance.now(); if (t - tS > 3) { cpu += t - tS; await tickFrame(); tS = performance.now(); } };
  let bc = new V(0, 0, 0), L = 100, floorY = 0, gBox = null;
  try {
    dbg.G.updateMatrixWorld(true);
    gBox = new THREE.Box3().setFromObject(dbg.G); gBox.getCenter(bc); const s = gBox.getSize(new V()); L = Math.max(s.x, s.z, 1); floorY = gBox.min.y;
  } catch (_) { }
  const gws = [];
  try {
    const fp = dbg.GT && dbg.GT.footprint; const pts = fp ? [].concat(...fp) : [];
    const st = Math.max(1, Math.ceil(pts.length / 70));
    for (let i = 0; i < pts.length; i += st) { const w = dbg.G.localToWorld(new V(pts[i][0], 0.4, pts[i][1])); gws.push(w.x, w.z); }
  } catch (_) { }
  try { const fl = scene.children.find(c => c.isMesh && c.geometry && c.geometry.type === 'CircleGeometry'); if (fl) floorY = fl.position.y; } catch (_) { }
  let H = L * 0.42, aBox = null, aPts = null, gPts = null;
  try { gPts = hullPoints(dbg.G); } catch (_) { }
  try {
    const o = !ampMissing && window.__ampHandle && window.__ampHandle.object3d;
    if (o) { o.updateMatrixWorld(true); const rt = ampRoot(o), b = new THREE.Box3().setFromObject(rt), sz = b.getSize(new V());
      if (isFinite(sz.y) && sz.y > 1) { H = sz.y; aBox = b; floorY = Math.min(b.min.y, ampFloorY(o)); aPts = hullPoints(rt); } }
  } catch (_) { }
  // camera orbit: centre = the camera ray at the guitar's height; later poses are the same camera turned about it
  const pos0 = camera.position.clone(), dir = camera.getWorldDirection(new V());
  let tx = pos0.x + dir.x * 100, tz = pos0.z + dir.z * 100;
  if (Math.abs(dir.y) > 1e-3) { const t = (bc.y - pos0.y) / dir.y; if (t > 0) { tx = pos0.x + dir.x * t; tz = pos0.z + dir.z * t; } }
  const ty = Math.abs(dir.y) > 1e-3 && (bc.y - pos0.y) / dir.y > 0 ? bc.y : pos0.y + dir.y * 100;
  const homeOk = document.body.dataset.mode === 'show' || document.body.dataset.mode === 'amp';
  // now (+ the ~1.5 s it takes to fade in / power on) up to ~36 s later (1.15 rad)
  let OFFS = homeOk ? [0.03, 0.12, 0.3, 0.55, 0.8, 1.1] : [0];
  { const np = +new URLSearchParams(location.search).get('tvPoses'); if (np >= 1) OFFS = OFFS.slice(0, np); }   // debug: first N poses only
  const cam2 = camera.clone(), tmp = new V();
  const tiles = []; try { for (const e of document.querySelectorAll('.zg-tile, #zg-explore')) { const r = e.getBoundingClientRect(); if (r.width > 0) tiles.push([r.left, r.top, r.right, r.bottom]); } } catch (_) { }
  let tw = L * 0.16 * 4.6, th = L * 0.16 * 1.05, td = L * 0.16 * 0.3;   // ZUNIGA title rest box (zuniga3d restOf model)
  try { const tm = scene.children.find(c => c.isMesh && c.geometry && c.geometry.type === 'TextGeometry'); if (tm) { tm.geometry.computeBoundingBox(); const b = tm.geometry.boundingBox; tw = b.max.x - b.min.x; th = b.max.y - b.min.y; td = b.max.z - b.min.z; } } catch (_) { }
  const c8 = new Float64Array(24);
  const rectOf8 = (mw, out) => {   // screen aabb of the 8 world points in c8
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < 24; k += 3) { tmp.set(c8[k], c8[k + 1], c8[k + 2]).applyMatrix4(mw); if (tmp.z > -cam2.near * 1.5) return null; tmp.applyMatrix4(cam2.projectionMatrix); const px = OX + (tmp.x * 0.5 + 0.5) * CW, py = OY + (-tmp.y * 0.5 + 0.5) * CH; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1; return out;
  };
  const samples = [], realTitle = [];   // M4: the real title rect(s) at the start camera are a HARD obstacle at every orbit pose (the title is a camera-facing billboard, its screen rect barely moves)
  for (const d of OFFS) {
    const ox = pos0.x - tx, oz = pos0.z - tz, c = Math.cos(d), s = Math.sin(d);
    cam2.position.set(tx + ox * c + oz * s, pos0.y, tz - ox * s + oz * c); cam2.lookAt(tx, ty, tz); cam2.updateMatrixWorld(true);
    const mw = cam2.matrixWorldInverse.clone(), o = { hard: d <= 0.13, mwi: mw, cam: cam2.position.clone(), obs: tiles.slice(), amp: null, gu: null };
    if (aPts) { const r = ptsRect(aPts, cam2, mw, OX, OY, CW, CH, [0, 0, 0, 0]); if (r) o.amp = r; }
    if (gPts) { const r = ptsRect(gPts, cam2, mw, OX, OY, CW, CH, [0, 0, 0, 0]); if (r) o.gu = r; }
    { // title model rect (it rests 0.2 D beyond the guitar, 0.17 D above, facing the camera)
      const p1 = o.cam; let dx = bc.x - p1.x, dz = bc.z - p1.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      const D = Math.max(L * 0.5, Math.hypot(p1.x - bc.x, p1.y - bc.y, p1.z - bc.z)), sc = Math.min(1.2, Math.max(0.55, D / (L * 2.3)));
      const tcx = bc.x + dx * D * 0.2, tcy = bc.y + D * 0.17, tcz = bc.z + dz * D * 0.2, a = Math.atan2(p1.x - tcx, p1.z - tcz);
      const hx = tw * sc / 2 * 1.02, hy = th * sc / 2 + L * 0.012 + hx * 0.02, hz = td * sc / 2, ca = Math.cos(a), sa = Math.sin(a); let i = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { c8[i++] = tcx + ca * sx * hx + sa * sz * hz; c8[i++] = tcy + sy * hy; c8[i++] = tcz - sa * sx * hx + ca * sz * hz; }
      const r = rectOf8(mw, [0, 0, 0, 0]); if (r) o.mt = r;   // M4: model rect only used when the real title meshes are not found
    }
    if (d < 0.1) { // the real title meshes (ZUNIGA, Folk Blues) as on screen now (current camera only)
      try {
        for (const tm of scene.children) {
          if (!(tm.isMesh && tm.geometry && tm.geometry.type === 'TextGeometry' && tm.visible)) continue;
          tm.geometry.computeBoundingBox(); tm.updateWorldMatrix(true, false);
          const b = tm.geometry.boundingBox; let i = 0;
          for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { tmp.set(x, y, z).applyMatrix4(tm.matrixWorld); c8[i++] = tmp.x; c8[i++] = tmp.y; c8[i++] = tmp.z; }
          const r = rectOf8(mw, [0, 0, 0, 0]); if (r) { o.obs.push(r); realTitle.push(r); }
        }
      } catch (_) { }
    }
    samples.push(o);
  }
  for (const sm of samples) { sm.title = realTitle.length ? realTitle : null; if (sm.title) for (const r of sm.title) { if (!sm.obs.includes(r)) sm.obs.push(r); } else if (sm.mt) sm.obs.push(sm.mt); }
  await slice();
  // targets for the screen's on-screen size (t325u): >= 35 % of the width on phones, >= 22 % (and >= 160 px tall) on desktop; 8 % headroom
  const portrait = CW < CH * 0.9, tgtW = (portrait ? 0.35 : 0.22) * CW * 1.08, tgtH = portrait ? 0 : 160 * 1.08;
  // candidates: a floor grid in the start camera's frame (u right, w away), the tv turned in 22 / 28 / 34 deg
  const s0 = samples[0];
  let fx = bc.x - s0.cam.x, fz = bc.z - s0.cam.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const rx = -fz, rz = fx;
  const q = new Float64Array(24), qb = new Float64Array(12), qk = new Float64Array(12), SC4 = [[-SCR_W / 2, -SCR_H / 2], [SCR_W / 2, -SCR_H / 2], [SCR_W / 2, SCR_H / 2], [-SCR_W / 2, SCR_H / 2]];
  const FS = [3.0, 2.7, 2.4, 2.15, 1.9, 1.7, 1.5, 1.3, 1.15, 1.0, 0.85, 0.7];   // tv height as a multiple of the amp's height
  const M = 3;
  const SG = [[-0.40, 0.30], [0.40, 0.30], [0.40, 0.40], [-0.40, 0.40]];   // the neon sign's quad on the pedestal front (local x, y)
  const evalCand = (x, z, yaw, sc, yb) => {   // yb = world y of the TV's lowest point (the neon plate); the TV floats   // -> { v: hard violations (0 = ok), soft: box overlap share, m: size margin (1 = target) }
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let wx0 = 1e9, wx1 = -1e9, wz0 = 1e9, wz1 = -1e9;
    for (const lx of [-0.55, 0.55]) for (const lz of [-0.35, 0.15]) { const X = x + (lx * cy + lz * sy) * sc, Z = z + (-lx * sy + lz * cy) * sc; wx0 = Math.min(wx0, X); wx1 = Math.max(wx1, X); wz0 = Math.min(wz0, Z); wz1 = Math.max(wz1, Z); }
    let i = 0; for (const X of [wx0, wx1]) for (const Y of [yb, yb + (TV_H - TV_B) * sc]) for (const Z of [wz0, wz1]) { q[i++] = X; q[i++] = Y; q[i++] = Z; }
    for (let k = 0; k < 4; k++) { const lx = SC4[k][0], ly = SC4[k][1]; qb[k * 3] = x + (lx * cy + 0.13 * sy) * sc; qb[k * 3 + 1] = yb + (HEAD_Y + ly - TV_B) * sc; qb[k * 3 + 2] = z + (-lx * sy + 0.13 * cy) * sc; }
    for (let k = 0; k < 4; k++) { const lx = SG[k][0], ly = SG[k][1]; qk[k * 3] = x + (lx * cy + 0.135 * sy) * sc; qk[k * 3 + 1] = yb + (PY + ly - TV_B) * sc; qk[k * 3 + 2] = z + (-lx * sy + 0.135 * cy) * sc; }
    let v = 0, soft = 0, m = 9, late = 0, nh = 0;
    for (const sm of samples) {
      let pv = 0, ps = 0; const hard = sm.hard; if (hard) nh++;
      const mw = sm.mwi;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, bad = false;
      for (let k = 0; k < 24; k += 3) { tmp.set(q[k], q[k + 1], q[k + 2]).applyMatrix4(mw); if (tmp.z > -cam2.near * 1.5) { bad = true; break; } tmp.applyMatrix4(cam2.projectionMatrix); const px = OX + (tmp.x * 0.5 + 0.5) * CW, py = OY + (-tmp.y * 0.5 + 0.5) * CH; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      if (bad) { if (hard) v += 5; else late += 5; continue; }
      const area = Math.max(1, (x1 - x0) * (y1 - y0));
      const inW = Math.max(0, Math.min(x1, OX + CW - M) - Math.max(x0, OX + M)) * Math.max(0, Math.min(y1, OY + CH - M) - Math.max(y0, OY + M));
      pv += (area - inW) / area * 2;
      // the whole box vs the obstacles (soft: a tv partly behind the amp / guitar is natural; the picture + sign must stay clear)
      let ov = 0;
      const chk = (o, gap) => { if (!o) return 0; const ox = Math.min(x1, o[2] + gap) - Math.max(x0, o[0] - gap), oy = Math.min(y1, o[3] + gap) - Math.max(y0, o[1] - gap); return ox > 0 && oy > 0 ? ox * oy : 0; };
      ov += chk(sm.amp, PTV_GAP) + chk(sm.gu, PTV_GAP); for (const o of sm.obs) ov += chk(o, PTV_GAP);
      ps += ov / area;
      if (sm.title) { let tov = 0; for (const o of sm.title) tov += chk(o, PTV_GAP); pv += tov / area * 6 + (tov > 0 ? 0.05 : 0); }   // M4: hard clear of the title
      const cx = (x0 + x1) / 2;   // left of the amp's and the guitar's projected centres
      // M4: a TV wholly ABOVE the guitar's top edge (phones: the band over the title) may sit up to 0.22 vw right of the guitar's centre (still left of the amp)
      // P (Blake 7:52): a TV wholly above the guitar, the amp AND the title may sit anywhere across the top (floating in the empty upper space)
      let above = true; for (const o of [sm.amp, sm.gu]) if (o && y1 >= o[1]) above = false; if (sm.title) for (const o of sm.title) if (y1 >= o[1] - PTV_GAP) above = false;
      if (!above) for (const o of [sm.amp, sm.gu]) if (o) { const oc = (o[0] + o[2]) / 2 + (o === sm.gu && y1 < o[1] ? 0.22 * CW : 0); if (cx > oc) pv += 0.3 + (cx - oc) / CW; }
      // the picture + the sign (key rect): hard clear
      let kx0 = 1e9, kx1 = -1e9, ky0 = 1e9, ky1 = -1e9, sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
      for (let k = 0; k < 12; k += 3) {
        tmp.set(qb[k], qb[k + 1], qb[k + 2]).applyMatrix4(mw).applyMatrix4(cam2.projectionMatrix); let px = OX + (tmp.x * 0.5 + 0.5) * CW, py = OY + (-tmp.y * 0.5 + 0.5) * CH;
        sx0 = Math.min(sx0, px); sx1 = Math.max(sx1, px); sy0 = Math.min(sy0, py); sy1 = Math.max(sy1, py);
        kx0 = Math.min(kx0, px); kx1 = Math.max(kx1, px); ky0 = Math.min(ky0, py); ky1 = Math.max(ky1, py);
        tmp.set(qk[k], qk[k + 1], qk[k + 2]).applyMatrix4(mw).applyMatrix4(cam2.projectionMatrix); px = OX + (tmp.x * 0.5 + 0.5) * CW; py = OY + (-tmp.y * 0.5 + 0.5) * CH;
        kx0 = Math.min(kx0, px); kx1 = Math.max(kx1, px); ky0 = Math.min(ky0, py); ky1 = Math.max(ky1, py);
      }
      const kr = [kx0, ky0, kx1, ky1], karea = Math.max(1, (kx1 - kx0) * (ky1 - ky0));
      let kov = 0;
      const kchk = (o, gap) => { if (!o) return 0; const ox = Math.min(kx1, o[2] + gap) - Math.max(kx0, o[0] - gap), oy = Math.min(ky1, o[3] + gap) - Math.max(ky0, o[1] - gap); return ox > 0 && oy > 0 ? ox * oy : 0; };
      kov = kchk(sm.amp, PTV_GAP) + kchk(sm.gu, PTV_GAP); for (const o of sm.obs) kov += kchk(o, PTV_GAP);
      pv += kov / karea * 3;
      const mm = Math.min((sx1 - sx0) / tgtW, tgtH ? (sy1 - sy0) / tgtH : 9);
      if (mm < m && hard) m = mm;
      if (hard) { v += pv; soft += ps; } else late += pv + ps * 0.4;
    }
    return { v, soft: soft / Math.max(1, nh), m, late: late / Math.max(1, samples.length - nh) };
  };
  let best = null, n = 0;
  // photo-tv (Blake 6:10 approved): the TV floats; its lowest point is hb x the amp's height above the floor (0 = floor level)
  const NU = 17, NW = 8, HBS = [0];   // P3: on the floor   // M4: + 3.6, 4.6 (above the title on phones)
  for (const thd of [24, 34]) for (let iu = 0; iu < NU; iu++) for (let iw = 0; iw < NW; iw++) {
    const u = -3.9 + iu * 0.24, w = -0.5 + iw * 0.5;   // in units of L (the guitar's size) from the guitar's centre; w > 0 = farther from the camera
    const x = bc.x + (rx * u + fx * w) * L, z = bc.z + (rz * u + fz * w) * L;
    // facing the start camera, then turned thd degrees toward the guitar centre
    const yc = Math.atan2(s0.cam.x - x, s0.cam.z - z);
    let yt = Math.atan2(bc.x - x, bc.z - z) - yc; yt = Math.atan2(Math.sin(yt), Math.cos(yt));
    const yaw = yc + Math.sign(yt || 1) * thd * Math.PI / 180;
    for (const hb of HBS) {
      if (hb < 0.8) {   // low: keep off the guitar's floor footprint and out of the amp's box
        let near = false;
        for (let i = 0; i < gws.length; i += 2) if (Math.hypot(gws[i] - x, gws[i + 1] - z) < L * 0.1) { near = true; break; }
        if (near) continue;
      }
      for (const f of FS) {
        const sc = f * H / TV_H, wd = 0.55 * sc;
        if (hb < 0.8 && aBox && x > aBox.min.x - wd && x < aBox.max.x + wd && z > aBox.min.z - wd && z < aBox.max.z + wd) continue;   // not inside the amp
        n++;
        const yb = floorY + hb * H, e = evalCand(x, z, yaw, sc, yb);
        // picture + sign clear everywhere: reach the size target first (m capped a little above 1), then the least box overlap; otherwise the least violation
        const score = e.v > 0.0005 ? 100 + e.v * 50 + Math.min(e.late, 4) * 0.15 - Math.min(e.m, 2) : -Math.min(e.m, 1.6) + e.soft * 1.5 + Math.min(e.late, 4) * 0.15 + hb * 0.02;
        if (!best || score < best.score) best = { score, x, z, yb, yaw, sc, f, th: thd, hb, v: e.v, m: e.m, soft: e.soft, late: e.late };
        if (e.v <= 0.0005 && e.soft < 0.002) break;   // larger scales first: the first fully clear one is the biggest at this spot
      }
    }
    await slice();
  }
  cpu += performance.now() - tS;
  if (!best) best = { score: 1e9, x: bc.x - L * 1.1, z: bc.z - L * 0.4, yb: floorY + 0.5 * H, yaw: 0, sc: 0.8 * H / TV_H, f: 0.8, th: 0, v: 9, m: 0 };
  S.placeCpuMs = +cpu.toFixed(1);
  return { T: new V(best.x, (best.yb === undefined ? floorY : best.yb) - TV_B * best.sc, best.z), yaw: best.yaw, sc: best.sc, info: { f: +best.f.toFixed(2), hb: best.hb, th: best.th, v: +best.v.toFixed(4), m: +best.m.toFixed(2), soft: +(best.soft || 0).toFixed(3), late: +(best.late || 0).toFixed(3), n, amp: !!aBox, hard: best.v > 0.0005 } };
}

/* ---------- mount ---------- */
export async function mountPhotoTV(opts) {
  const S = window.__photoTV;
  const dbg = window.__dbg;
  if (!dbg || !dbg.scene || !dbg.renderer || !dbg.camera) throw new Error('scene not available');
  const { scene, camera, renderer } = dbg;
  const qs = new URLSearchParams(location.search);
  let cycleMs = 6000; { const q = +qs.get('tvCycle'); if (q >= 300 && isFinite(q)) cycleMs = q; }
  S.cycleMs = cycleMs; S.browserOpen = false; S.shownIds = []; S.photoId = null; S.count = 0;
  S.neon = { text: NEON_TEXT, state: 'off', onT: null, font: NEON_FONT };

  const base = opts.base;                      // .../photo-tv/
  const siteRoot = new URL('../', base).href;
  const man = await (await fetch(opts.manifestUrl)).json();
  const photos = (man && man.photos || []).filter(p => p && p.tv && p.id);
  if (!photos.length) throw new Error('no photos in the manifest');
  S.count = photos.length;

  // build hidden
  const fontOk = await ensureFont();
  S.neon.font = fontOk ? NEON_FONT : 'fallback';
  const nt = neonTextures(NEON_FONT);
  const tex = { grille: grilleTexture(), glow: glowTexture(), neonCore: nt.core, neonHalo: nt.halo };
  const ink = nt.ink;
  const tv = buildTV(tex);
  // Blake 9:50: the home scene shows a large photo PANEL in the dark background (behind the guitar and amp) instead of the TV
  // model. The TV code stays (?panel=0 brings it back). The panel is the same CRT screen material (photos, scanlines, grain),
  // camera-locked far behind the scene, drawn right after the floor and before the guitar / amp / title.
  const PANEL = qs.get('panel') !== '0';
  S.mode = PANEL ? 'panel' : 'tv';
  let panel = null, panelGlowM = null;
  if (PANEL) {
    tv.root.traverse(o => { if ((o.isMesh || o.isSprite) && o !== tv.screen) o.visible = false; });
    tv.meshes.length = 0; tv.meshes.push(tv.screen);
    const lock = new THREE.Group(); lock.name = 'photo-panel-lock';
    panel = new THREE.Group(); panel.name = 'photo-panel'; lock.add(panel);
    tv.screen.parent.remove(tv.screen); panel.add(tv.screen); tv.screen.position.set(0, 0, 0); tv.screen.scale.set(1, 1, 1);
    tv.screen.material.depthTest = false; tv.screen.material.depthWrite = false; tv.screen.renderOrder = -1;
    panelGlowM = new THREE.MeshBasicMaterial({ map: panelGlowTexture(), color: new THREE.Color(1.0, 0.72, 0.42), blending: THREE.AdditiveBlending, transparent: false, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W * 1.3, SCR_H * 1.42), panelGlowM); glow.renderOrder = -1.5; glow.position.z = -0.01; panel.add(glow);
    const fw = new THREE.Vector3(), up = new THREE.Vector3(), rt = new THREE.Vector3();
    const offE = new THREE.Euler(), offQ = new THREE.Quaternion();
    // Polish (Blake t405u "the panel should join the spinning background"): the panel is posed ONCE per frame against a fixed
    // REFERENCE home camera (layout.json camera yaw / pitch on the live orbit centre and radius), not the live camera. So at the
    // saved pose (the 17 s hold, and the editor) it sits exactly where layout.json says (same cx, cy, w, h, depth, rz, ry mapping),
    // and once the orbit runs it stays put in the world and turns with the guitar, amp and floor like the background.
    const refC = new THREE.PerspectiveCamera(38, 1, 2, 2000);
    let placedOnce = false;
    const refCam = (c) => {
      const O = dbg.homeOrbit;
      if (!O || !O.ok || !(O.R > 0)) return c;   // no home frame yet: fall back to the live camera (first frames only)
      const Lc = (window.__homeLayout || {}).camera || {};
      const y = Lc.yaw != null ? +Lc.yaw : 0.6, p = Lc.pitch != null ? +Lc.pitch : 0.55;   // 0.6 / 0.55 = index.html BOOT_HOME
      refC.fov = 38; refC.aspect = c.aspect; refC.near = 2; refC.far = 2000;   // 38 = the home (show) camera fov in index.html
      refC.position.set(O.cx + Math.sin(y) * Math.cos(p) * O.R, O.cy + Math.sin(p) * O.R, O.cz + Math.cos(y) * Math.cos(p) * O.R);
      refC.lookAt(O.cx, O.cy, O.cz);
      refC.updateMatrixWorld(true);
      return refC;
    };
    const place = (r, s, c0) => {   // upper-middle of the reference view on desktop, a wide band behind the scene on phones
      if (!c0 || !c0.isPerspectiveCamera) return;
      if (c0 !== camera && placedOnce) return;   // other cameras (none today) never move the world-fixed panel
      placedOnce = true;
      const c = refCam(c0);
      const L = window.__homeLayout || {}, P = L.panel || {}, N = L.neon;
      const D = P.depth || 600, th = Math.tan(c.fov * Math.PI / 360), Hv = 2 * D * th, Wv = Hv * c.aspect, ph = innerWidth < 600 || innerWidth < innerHeight;
      let w = P.w != null ? Wv * P.w : Wv * (ph ? 0.96 : 0.5), h = P.h != null ? Hv * P.h : w * SCR_H / SCR_W;
      if (P.w == null || P.h == null) { const hm = Hv * (ph ? 0.4 : 0.56); if (h > hm) { h = hm; w = h * SCR_W / SCR_H; } }
      fw.set(0, 0, -1).applyQuaternion(c.quaternion); up.set(0, 1, 0).applyQuaternion(c.quaternion); rt.set(1, 0, 0).applyQuaternion(c.quaternion);
      const cy = P.cy != null ? P.cy : (ph ? -0.01 : 0.0), cx = P.cx != null ? P.cx : 0;
      // Pivot follows the camera; tilt/turn live on the child so a later camera-quat copy cannot overwrite them.
      lock.position.copy(c.position).addScaledVector(fw, D).addScaledVector(up, Hv * cy).addScaledVector(rt, Wv * cx);
      if (N && N.lx != null) {
        for (const [m, ro, z] of neonParts) {
          m.position.set(N.lx * SCR_W, N.ly * SCR_H, z); m.scale.setScalar(m.userData.s0 * (N.s != null ? N.s : 1));
          if (N.rz) m.rotation.z = N.rz; else m.rotation.z = 0;
          m.renderOrder = ph ? 50 + ro : ro; m.material.transparent = ph; m.material.needsUpdate = true;
        }
      } else {   // Blake 10:18: on phones the sign sits in the right corner of the top border, a bit smaller, drawn over the amp (never covered); desktop unchanged
        for (const [m, ro, z] of neonParts) {
          m.position.set(ph ? SCR_W * 0.285 : SCR_W * 0.24, SCR_H / 2, z); m.scale.setScalar(m.userData.s0 * (ph ? 0.82 : 1)); m.rotation.z = 0;
          m.renderOrder = ph ? 50 + ro : ro; m.material.transparent = ph; m.material.needsUpdate = true;
        }
      }
      lock.quaternion.copy(c.quaternion);
      if (P.w != null && P.h != null) lock.scale.set(w / SCR_W, h / SCR_H, 1); else lock.scale.setScalar(w / SCR_W);
      // Blake 11:20: Turn (ry) and Tilt (rx/rz) are the child's local rotation, applied after the camera lock.
      const ry = +P.ry || 0, rx = +P.rx || 0, rz = +P.rz || 0;
      offE.set(rx, ry, rz, 'YXZ');
      offQ.setFromEuler(offE);
      panel.position.set(0, 0, 0);
      panel.scale.set(1, 1, 1);
      panel.quaternion.copy(offQ);
      lock.updateMatrixWorld(true);
      // the real in-plane aspect of the glass for the contain fit: the screen's world x / y axis lengths. Not just w / h: the
      // Turn (ry) sits under the non-uniform w/h scale, which shortens the turned width (desktop: 1.363 instead of 1.432).
      { const e = tv.screen.matrixWorld.elements, ax = Math.hypot(e[0], e[1], e[2]), ay = Math.hypot(e[4], e[5], e[6]);
        if (ax > 0 && ay > 0) tv.screenU.uScr.value = (SCR_W * ax) / (SCR_H * ay); }
    };
    glow.onBeforeRender = place; tv.screen.onBeforeRender = place;
    if (!renderer.__panelPlaceHooked) {
      renderer.__panelPlaceHooked = true;
      const origRender = renderer.render.bind(renderer);
      renderer.render = (s, c) => { try { place(renderer, s, c); } catch (_) {} return origRender(s, c); };
    }
    // Blake 9:53: the Precious Memories neon straddles the panel's bottom border (half over the frame edge), same glowing look
    let neonPh = null; const neonParts = [];   // [mesh, desktop renderOrder, z]
    let haloMesh = null; tv.root.traverse(o => { if (o.isMesh && o.material === tv.haloM) haloMesh = o; });
    const NS = (SCR_W * 0.46) / SIGN.w;
    { const bk = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W * 0.42, SCR_H * 0.11), new THREE.MeshBasicMaterial({ color: 0x050403, depthTest: false, depthWrite: false, toneMapped: false })); bk.position.set(SCR_W * 0.24, SCR_H / 2, 0.01); bk.renderOrder = -0.5; panel.add(bk); bk.userData.s0 = 1; neonParts.push([bk, -0.5, 0.01]); }   // dark strip behind the neon so it reads over a bright photo
    for (const [m, ro] of [[haloMesh, -0.4], [tv.neonMesh, -0.3]]) {
      if (!m) continue; m.parent.remove(m); panel.add(m); m.visible = true; m.position.set(SCR_W * 0.24, SCR_H / 2, 0.02); m.scale.setScalar(NS); m.renderOrder = ro;
      m.material.depthTest = false; m.material.depthWrite = false; m.material.transparent = false; m.material.blending = THREE.AdditiveBlending; m.material.needsUpdate = true; m.userData.s0 = NS; neonParts.push([m, ro, 0.02]);
    }
    scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.material && o.material.emissiveMap) o.renderOrder = -2; });   // the floor glow first, the panel over it
    lock.traverse(o => { o.layers.set(1); });
    scene.add(lock);
    S.panel = panel;
    S.lock = lock;
    S.place = place;
    const vis = () => { panel.visible = document.body.dataset.mode === 'show' || !document.body.dataset.mode; };
    vis(); document.addEventListener('zg:mode', vis);
  }
  const tP = performance.now();
  const pl = PANEL ? { T: new THREE.Vector3(0, -9999, 0), yaw: 0, sc: 1, info: { panel: true } } : await computePlacement(scene, camera, !!opts.ampMissing, S);
  S.placeMs = S.placeCpuMs; S.placeWallMs = +(performance.now() - tP).toFixed(1); S.placement = pl.info;
  tv.root.position.copy(pl.T); tv.root.rotation.y = pl.yaw; tv.root.scale.setScalar(pl.sc);
  tv.root.traverse(o => { o.layers.set(1); });
  tv.root.updateMatrixWorld(true);
  scene.add(tv.root);
  S.object3d = tv.root; S.builtT = now(); S.state = 'warming';
  const U = tv.screenU;
  const setFade = (k) => {
    for (const e of tv.fade) {
      if (e.kind === 't') e.m.opacity = e.op0 * k;
      else { if (e.c0) e.m.color.copy(e.c0).multiplyScalar(k); if (e.env0 !== undefined) e.m.envMapIntensity = e.env0 * k; if (e.em0) e.m.emissiveIntensity = e.em0 * k; }
    }
    U.uFade.value = k * (panelGlowM ? 0.72 : 1); fadeK = k; if (panelGlowM) panelGlowM.opacity = 0.42 * k;
  };
  let fadeK = 0; setFade(0);

  // photo texture loading: one small thumbnail at a time
  let dead = false;
  const order = photos.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let pos = 0;
  const isActive = () => !document.hidden && !S.browserOpen && !document.querySelector('.zg-panel');
  const untilActive = () => new Promise((res) => { const chk = () => { if (dead) return res(); if (isActive()) res(); else setTimeout(chk, 300); }; chk(); });
  async function loadTex(idx) {
    const p = photos[idx], url = new URL(p.tv, siteRoot).href;
    let img = null, flipped = false;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('http ' + r.status);
      const bl = await r.blob();
      img = await createImageBitmap(bl, { imageOrientation: 'flipY' }); flipped = true;
    } catch (_) {
      img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    }
    const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.flipY = !flipped; t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    try { renderer.initTexture(t); } catch (_) { }
    return { tex: t, asp: (img.width || 4) / (img.height || 3), idx, img };
  }
  async function loadNext() {   // next in the shuffled order, skipping failures
    for (let tries = 0; tries < 6 && !dead; tries++) {
      await untilActive();
      const i = pos % order.length; pos++;
      try { return await loadTex(order[i]); } catch (e) { console.warn('[photo-tv] thumbnail failed', photos[order[i]].id, e); }
    }
    return null;
  }
  const freeTex = (e) => { if (!e) return; try { e.tex.dispose(); if (e.img && e.img.close) e.img.close(); } catch (_) { } };
  let cur = null;   // { tex, asp, idx } on the screen

  // compile + upload off-screen, then show
  const first = loadNext();   // first photo loads while the materials compile
  try {
    if (panel) { panel.traverse(o => { o.layers.set(0); }); await Promise.race([renderer.compileAsync(panel, camera, scene), new Promise(r => setTimeout(r, 30000))]); panel.traverse(o => { o.layers.set(1); }); }
    await Promise.race([renderer.compileAsync(tv.root, camera, scene), new Promise(r => setTimeout(r, 30000))]);
    for (const t of [tex.grille, tex.glow, tex.neonCore, tex.neonHalo]) renderer.initTexture(t);
  } catch (e) { console.warn('[photo-tv] precompile skipped', e); }
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  const R = reduced();
  S.state = 'fading';
  tv.root.traverse(o => { o.layers.set(0); }); if (panel) panel.traverse(o => { o.layers.set(0); });
  await new Promise((res) => {
    const t0 = performance.now(), dur = R ? 1 : 700;
    const step = () => { const u = Math.min(1, (performance.now() - t0) / dur); setFade(sstep(u)); if (u < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
  setFade(1); S.shownT = now();

  /* neon: classic ignition (irregular flickers ~1.6 s), then steady with a very rare subtle dip */
  const NEON_SEQ = [[0, 0], [120, 0.9], [190, 0.12], [380, 0.7], [470, 0.04], [700, 1], [790, 0.35], [900, 0.85], [1050, 0.18], [1250, 1], [1400, 0.78], [1550, 1]];
  const NEON_END = 1650, DIP = [[0, 0.5], [70, 0.92], [110, 0.35], [170, 1]];
  const nm = { t0: performance.now() + (R ? 0 : 250), nextDip: 0, dipT: 0 };
  const seqAt = (seq, e) => { let v = seq[0][1]; for (let i = 0; i < seq.length; i++) if (e >= seq[i][0]) v = seq[i][1]; return v; };
  const neonTick = (t) => {
    const st = S.neon.state; if (st === 'off' && t < nm.t0) return;
    let L = 1;
    if (st === 'off') S.neon.state = 'igniting';
    const e = t - nm.t0;
    if (S.neon.state === 'igniting') {
      if (R) { L = sstep(e / 300); if (e >= 300) { S.neon.state = 'on'; S.neon.onT = now(); nm.nextDip = t + 25000; } }
      else if (e >= NEON_END) { L = 1; S.neon.state = 'on'; S.neon.onT = now(); nm.nextDip = t + 20000 + Math.random() * 20000; }
      else L = seqAt(NEON_SEQ, e);
    } else if (!R) {
      if (nm.dipT) { const de = t - nm.dipT; if (de >= 220) { nm.dipT = 0; nm.nextDip = t + 20000 + Math.random() * 20000; } else L = seqAt(DIP, de); }
      else if (t >= nm.nextDip) nm.dipT = t;
      L *= 1 + 0.012 * Math.sin(t * 0.011);
    }
    tv.coreM.opacity = Math.min(1, L); tv.haloM.opacity = Math.min(1, L) * 0.95;
  };

  // frame loop (cheap: a handful of uniforms; no allocations)
  const sw = { on: false, t0: 0, next: null, swapped: false };
  const pw = { on: false, t0: 0, dur: R ? 150 : 900 };
  let warmT0 = 0, tuneOn = false;
  const SW_MS = R ? 1 : 250;
  const P4 = U.uPow.value;
  const tick = () => {
    if (dead) return;
    requestAnimationFrame(tick);
    const t = performance.now();
    U.uT.value = (t % 100000) / 1000;
    neonTick(t);
    if (pw.on) {
      const u = Math.min(1, (t - pw.t0) / pw.dur);
      if (u < 0.15) { P4.set(lerp(0.01, 0.03, u / 0.15), 0.012, 0, 1.0); }
      else if (u < 0.4) { P4.set(lerp(0.03, 1.02, sstep((u - 0.15) / 0.25)), 0.012, 0, 1.0); }
      else if (u < 0.85) { const v = sstep((u - 0.4) / 0.45); P4.set(1.02, lerp(0.012, 1.02, v), 1.9, 1.0 - v); }
      else { P4.set(1.02, 1.02, lerp(1.9, 1.0, sstep((u - 0.85) / 0.15)), 0); }
      if (u >= 1) { pw.on = false; P4.set(1.02, 1.02, 1.0, 0); S.state = 'on'; S.poweredOnT = now(); schedule(); }
    }
    if (sw.on) {
      const u = (t - sw.t0) / SW_MS;
      if (u >= 1) {
        if (!sw.swapped) { sw.swapped = true; setCurrentMeta(sw.next); }   // slow frame (> half the switch): the 0.5 < u < 1 step never ran
        sw.on = false; U.uSwitch.value = 0; U.uRoll.value = 0;
        freeTex(cur); cur = sw.next; sw.next = null;
        U.tA.value = cur.tex; U.uAspA.value = cur.asp; U.uHasA.value = 1; U.uMix.value = 0; U.tB.value = null;
        schedule();
      } else {
        U.uSwitch.value = Math.sin(Math.PI * u) * 0.9; U.uRoll.value = (1 - u) * (1 - u) * 0.22; U.uMix.value = sstep((u - 0.3) / 0.4);
        if (!sw.swapped && u > 0.5) { sw.swapped = true; setCurrentMeta(sw.next); }
      }
    }
    if (tuneOn) {
      const warm = sstep((t - warmT0) / (R ? 200 : 1500));
      const fl = 1 + 0.05 * Math.sin(t * 0.0021) + 0.035 * Math.sin(t * 0.0067 + 1.3) + 0.02 * Math.sin(t * 0.017);
      tv.filM.emissiveIntensity = 6 * warm * fl * fadeK;
      tv.glowM.opacity = 0.42 * warm * fl * fadeK;
    }
  };
  requestAnimationFrame(tick);

  const setCurrentMeta = (e) => { S.photoId = photos[e.idx].id; S.shownIds.push(S.photoId); curIdx = e.idx; };
  let curIdx = 0, timer = 0;
  // cycling: while a photo is on screen, preload the next one, then switch after cycleMs
  function schedule() {
    clearTimeout(timer);
    if (dead || sw.on || pw.on) return;
    const myCur = cur;
    const nextP = loadNext();
    const t0 = performance.now();
    (async () => {
      const nx = await nextP;
      if (dead || cur !== myCur || !nx) { if (nx && cur !== myCur) freeTex(nx); return; }
      const wait = Math.max(0, cycleMs - (performance.now() - t0));
      await new Promise(r => { timer = setTimeout(r, wait); });
      await untilActive();
      if (dead || cur !== myCur) { freeTex(nx); return; }
      sw.next = nx; sw.swapped = false; sw.t0 = performance.now(); U.tB.value = nx.tex; U.uAspB.value = nx.asp; U.uMix.value = 0; sw.on = true;
    })().catch((e) => console.warn('[photo-tv] cycle error', e));
  }
  // resume after visibility / the browser closing is handled inside untilActive (it polls every 300 ms, no loading while inactive)

  // CRT power-on with the first photo
  S.state = 'powering';
  const f0 = await Promise.race([first, new Promise(r => setTimeout(() => r(null), 15000))]);
  if (f0) { cur = f0; U.tA.value = f0.tex; U.uAspA.value = f0.asp; U.uHasA.value = 1; U.tB.value = f0.tex; U.uAspB.value = f0.asp; setCurrentMeta(f0); }
  warmT0 = performance.now(); tuneOn = true;
  pw.t0 = performance.now(); pw.on = true;
  if (!f0) { S.state = 'on'; S.poweredOnT = now(); }

  /* ---------- interaction: click / tap opens the film browser (no walk / orbit / pointer lock for the TV) ---------- */
  const el = renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hit = (cx, cy) => {
    // Prefer the projected screen rect: a yawed panel under a non-uniform lock scale can miss a 3D raycast.
    try {
      const sr = screenRect();
      if (sr && cx >= sr.x && cy >= sr.y && cx <= sr.x + sr.w && cy <= sr.y + sr.h) return true;
    } catch (_) { }
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    try { ray.layers.enableAll(); } catch (_) { }
    return ray.intersectObjects(tv.meshes, false).length > 0;
  };
  const modeOk = () => { const m = document.body.dataset.mode; return m === 'show' || m === 'amp'; };
  let down = null, handle = null, lastMove = 0, hovering = false, cursorWas = '';
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; };   // t = event time, not handler time: a busy frame between down and up must not turn a tap into a long press
  const onUp = (e) => {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 8 || e.timeStamp - d.t >= 500) return;
    if (document.body.dataset.edit === '1' || S._leBlock) return;
    if (!modeOk() || S.browserOpen || document.querySelector('.zg-panel') || S.state !== 'on') return;
    try { if (hit(e.clientX, e.clientY)) open(); } catch (err) { console.warn('[photo-tv] click failed', err); }
  };
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const t = performance.now(); if (t - lastMove < 100) return; lastMove = t;
    let h = false;
    if (modeOk() && !S.browserOpen && !e.buttons && S.state === 'on') { try { h = hit(e.clientX, e.clientY); } catch (_) { } }
    if (h !== hovering) { hovering = h; if (h) { cursorWas = el.style.cursor; el.style.cursor = 'pointer'; } else el.style.cursor = cursorWas; }
  };
  el.addEventListener('pointerdown', onDown, { passive: true });
  el.addEventListener('pointerup', onUp, { passive: true });
  el.addEventListener('pointercancel', () => { down = null; }, { passive: true });
  el.addEventListener('pointermove', onMove, { passive: true });

  const rectOf = (obj, w, h, dz, box) => {   // CSS-px rect of a w x h rectangle (or the box [x0,y0,x1,y1]) in obj's local XY plane
    try {
      const r = el.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      camera.updateMatrixWorld(); tv.root.updateMatrixWorld(true); const v = new THREE.Vector3(), a = new THREE.Vector3();
      const B = box || [-w / 2, -h / 2, w / 2, h / 2];
      for (const [x, y] of [[B[0], B[1]], [B[2], B[1]], [B[2], B[3]], [B[0], B[3]]]) {
        v.set(x, y, dz || 0); obj.localToWorld(v);
        a.copy(v).applyMatrix4(camera.matrixWorldInverse); if (a.z > -camera.near) return null;
        v.project(camera);
        const px = r.left + (v.x * 0.5 + 0.5) * r.width, py = r.top + (-v.y * 0.5 + 0.5) * r.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      if (x1 < 0 || y1 < 0 || x0 > innerWidth || y0 > innerHeight) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } catch (_) { return null; }
  };
  const screenRect = () => rectOf(tv.screen, SCR_W, SCR_H, 0.01);
  const PHN = SIGN.w * NEON_CH / NEON_CW;   // neon plane height; the rect is the glyph ink box (canvas px -> plane units)
  const inkBox = [(ink.x0 / NEON_CW - 0.5) * SIGN.w, (0.5 - ink.y1 / NEON_CH) * PHN, (ink.x1 / NEON_CW - 0.5) * SIGN.w, (0.5 - ink.y0 / NEON_CH) * PHN];
  const neonRect = () => rectOf(tv.neonMesh, 0, 0, 0.002, inkBox);
  // prefetch the film browser module once the TV is on and the page is idle (the click then opens instantly; a cold import
  // took ~5 s on a starved main thread). Import only: it has no top-level side effects.
  let fbP = null;
  const getFB = () => fbP || (fbP = import('./film-browser.js'));
  const prefetch = () => { if (dead || fbP) return; const go = () => { try { getFB().catch(() => { fbP = null; }); } catch (_) { } }; if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500); };
  let opening = false;
  async function open(index) {
    if (S.browserOpen || opening || dead) return;   // single in-flight guard
    opening = true; S.browserOpen = true;
    try {
      const mod = await getFB();
      const startIndex = Number.isInteger(index) ? Math.max(0, Math.min(photos.length - 1, index)) : curIdx;
      const rect = screenRect() || { x: innerWidth / 2 - 60, y: innerHeight / 2 - 45, w: 120, h: 90 };
      handle = mod.openFilmBrowser({ photos, startIndex, base, originRect: rect, onClose: () => { S.browserOpen = false; handle = null; schedule(); } });
    } catch (e) { console.warn('[photo-tv] film browser unavailable', e); S.browserOpen = false; handle = null; fbP = null; }
    opening = false;
  }
  function close() { try { if (handle && handle.close) handle.close(); } catch (e) { console.warn('[photo-tv] close failed', e); } }
  // B5b contract: tvRect() = CSS-px rect of the projected world Box3 of the tv's meshes (not the additive glow sprites); obstacles() = what
  // the placement sees now (amp cabinet / guitar world boxes, title meshes, apps row), CSS px {x,y,w,h}
  const toRect = (b) => {
    try {
      const r = el.getBoundingClientRect(); camera.updateMatrixWorld();
      const o = worldBoxRect(b, camera, camera.matrixWorldInverse, r.left, r.top, r.width, r.height, [0, 0, 0, 0]);
      if (!o || o[2] < 0 || o[3] < 0 || o[0] > innerWidth || o[1] > innerHeight) return null;
      return { x: o[0], y: o[1], w: o[2] - o[0], h: o[3] - o[1] };
    } catch (_) { return null; }
  };
  const toRectP = (pts) => {
    try {
      const r = el.getBoundingClientRect(); camera.updateMatrixWorld();
      const o = ptsRect(pts, camera, camera.matrixWorldInverse, r.left, r.top, r.width, r.height, [0, 0, 0, 0]);
      if (!o || o[2] < 0 || o[3] < 0 || o[0] > innerWidth || o[1] > innerHeight) return null;
      return { x: o[0], y: o[1], w: o[2] - o[0], h: o[3] - o[1] };
    } catch (_) { return null; }
  };
  const tvRect = () => {
    try { tv.root.updateMatrixWorld(true); const b = new THREE.Box3(); for (const m of tv.meshes) b.expandByObject(m); return b.isEmpty() ? null : toRect(b); } catch (_) { return null; }
  };
  const obstacles = () => {
    const out = { amp: null, guitar: null, title: [], tiles: [] };
    try { const o = !opts.ampMissing && window.__ampHandle && window.__ampHandle.object3d; if (o) out.amp = toRectP(hullPoints(ampRoot(o))); } catch (_) { }
    try { out.guitar = toRectP(hullPoints(dbg.G)); } catch (_) { }
    try { for (const tm of scene.children) if (tm.isMesh && tm.geometry && tm.geometry.type === 'TextGeometry' && tm.visible) { tm.updateWorldMatrix(true, false); const b = new THREE.Box3().setFromObject(tm); const r = toRect(b); if (r) out.title.push(r); } } catch (_) { }
    try { for (const e of document.querySelectorAll('.zg-tile, #zg-explore')) { const r = e.getBoundingClientRect(); if (r.width > 0) out.tiles.push({ x: r.left, y: r.top, w: r.width, h: r.height }); } } catch (_) { }
    return out;
  };
  S.screenRect = screenRect; S.neonRect = neonRect; S.tvRect = tvRect; S.obstacles = obstacles; S.open = open; S.close = close;
  prefetch();
  if (S.state === 'powering' && !f0) S.state = 'on';
}
