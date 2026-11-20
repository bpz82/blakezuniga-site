/*
 * Glaswerks Zingaro 1x12 combo — developed from the existing amp1 scaffold
 * and Fable's textures/geometry notes, checked against Blake's eight photos.
 *
 * Local units: inches. Front: +Z. Feet touch local Y=0.
 * mountAmp remains asynchronous, matching the existing host hook.
 *
 * Earlier pass (Fable): recessed Fender strap side handles (pocket cut into the
 * side boards, chrome bezel, bowed chrome strap with embossed FENDER / F,
 * washer-head screw toward the front) and aspect-aware camera fitting for
 * explore mode plus an exported helper the standalone page uses for home.
 *
 * amp8 (Blake t174u/t178u): the side strap is now the Fender tilt-back leg (legs option #1,
 * 'amp-legs' > 'amp-leg-left'/'amp-leg-right', photo texture assets/leg-amp8.webp, same
 * pocket/bezel), and the default pilot is LED option #2 (chrome bezel ring, faceted royal-blue
 * jewel, panel halo; userData.amp8Led = 'led-2').
 *
 * amp9 (Blake t188u) pass 9b: the tilt-back legs sit FLUSH on the outside of the side panels (no pocket / bezel /
 * pocket floor; LEGS_FLUSH), on a chrome pivot bolt + washer with the stop screw forward of the leg, and the amp
 * leans back AMP_TILT_DEG = 12 on them: everything except the floor shadow is in the group 'amp-cabinet'
 * (handle.cabinet), rotated about the rear-bottom line (rear rubber feet) with the front raised; the legs (16")
 * swing foot-forward to the floor (angle solved once in legDeployAngle). ampWalkBox() is in the cabinet frame.
 * handle.tilt = { deg, pivot: 'rear-bottom-edge' }, root.userData.amp9Tilt, handle.legReport() (test/debug).
 *
 * amp10 (Blake t196u) 10b: tilt 20 deg, 19" legs on a pivot high at the rear of each side (PIVOT_Y 14.8, LEG_PIVOT_Z),
 * swung BACK to ~9.6 deg from vertical with the feet on the floor ~4.6" behind the cabinet's rear bottom edge
 * (handle.legReport(), legs userData.amp10LegsBack). Pivot line stays the rear-bottom edge (see legDeployAngle()).
 *
 * amp5-badge pass: Blake's Zingaro logo cutout is overlaid on the front
 * control panel (child of the slanted frontPanel), and all nine front knobs
 * use the photographed chicken-head cap.
 *
 * amp6 pass (Blake, Nov 16 2026):
 *  - Brightness: modest emissive lift on the grille/leather/rear, a flat
 *    even lift on the tolex, and an amp-owned two-spot light rig
 *    (children of the amp root, no shadows, distance-limited off the guitar).
 *  - Real 3D chicken-head knobs: knurled skirt + bevelled head + raised
 *    white inlay, three InstancedMeshes.
 *  - Royal blue pilot light as one swappable part (makePilotLight/setPilot).
 *  - Driver hook (handle.useDriver) so amp-walk.js can replace the orbit,
 *    and ampWalkBox() describing the walkable cabinet shell.
 *
 * amp6 polish pass:
 *  - Knobs are deep glossy black bakelite (no photo map on the head; the
 *    photo is still loaded, M.knobCap is kept for reference/debug only).
 *  - Pilot: saturated royal blue, no tone-mapping blowout. Lower jewel
 *    emissive, a non-tone-mapped blue core seen through the faceted lens,
 *    and a soft blue ring halo that does not wash over the jewel.
 *  - Control panel / rear strip / badge / logo back to their amp5 look
 *    (no emissive lift); the panel uses a reduced dielectric specular so the
 *    key light does not wash the black face grey.
 *  - Tolex: much lower normal strength and env glints, rougher, so the
 *    walk-mode close-up reads as fine-grain vinyl, not cracked tiles.
 *
 * amp6 knob fix: the flat head top acted as a mirror for the amp's own key
 * light (a front camera sits right in its reflection), so whole faces read
 * silver. The head top is now crowned (a parabolic dome with its apex on the
 * pointer axis), the skirt top is crowned too, and M.knobBlack has a lower
 * specular / env reflection. The key light now leaves a small streak on
 * black bakelite. The raised white inlay follows the crown.
 */
import * as THREE from 'three';

export const AMP_ID = 'amp';

const W = 19.875, H = 19, D = 10;
const FOOT_H = 0.55, FOOT_R = 0.42;
const PANEL_H = 2.4, HANDLE_LIFT = 1.55;
const FRAME = 0.58;
const TOP = FOOT_H + H;
const TOP_FLAT_Z = 3.72;   // amp7: flat top ends here (same as ampWalkBox().topZMax)
const PANEL_DROP = Math.sqrt(PANEL_H * PANEL_H - 1.1 * 1.1);
const PANEL_TILT = -Math.atan2(1.1, PANEL_DROP);
const PANEL_W = W - FRAME * 2;
const PANEL_TOP = TOP - 0.48;
const PANEL_BOTTOM = PANEL_TOP - PANEL_DROP;

// Side strap handle (ref/07-side-a.jpg, ref/08-side-b.jpg): the strap sits
// about a quarter of the depth in from the REAR edge, runs from just above
// the floor to a pointed tip ~3.3" below the top, and lives in a routed
// pocket. The loose washer-head screw is mid-height, toward the front.
const HANDLE_Z = -2.5;
// amp8 (Blake t174u/t178u): the strap is now the tilt-back leg (legs option #1, assets/leg-amp8.webp).
// The photo leg is 0.121 wide:tall; the real one (07-side-a) is ~1.35" x 15" (the texture is stretched
// ~1.35x along the leg, like the photo's own foreshortening). Bottom on the tolex at STRAP_Y0, gothic tip
// down in the pocket's pointed end.
const STRAP_Y0 = 0.75, LEG_LEN = 15.0, LEG_HW = 0.675, LEG_TH = 0.08;
const LEG_TIP_T = 192 / 1024;   // texture rows 0..192 (from the top) are the pointed tip
const POCKET_HW = 0.75, POCKET_Y0 = 3.95, POCKET_Y1 = 13.5, POCKET_TIP = 16.25;
const POCKET_DEPTH = 0.45;
const WASHER_Y = 13.75, WASHER_Z = -0.4;

// amp9 (Blake t188u): "the amp tilt legs are inlaid in ... they need to be flush on the side, make it so the amp
// is tilted back too". Real Fender tilt-back legs (ref/07-side-a.jpg; fender.com Pure Vintage tilt-back legs):
// a chrome bar bolted to the OUTSIDE of each side panel on a pivot bolt (+ washer) near the upper rear, a stop
// screw forward of it. Deployed, the feet swing forward/down to the stop and the amp leans BACK on its rear
// bottom edge (here the rear rubber feet), front raised, the leg feet holding the front up.
// LEGS_FLUSH = false brings back the amp8 routed pocket / bezel / pocket floor / upright inlaid leg (kept, not drawn).
const LEGS_FLUSH = true;
// amp10 (Blake t196u) 10b: sharper tilt, 20 deg (was 12), see legDeployAngle() for why 20 + 19" legs.
// amp10 (Blake t196u) 10b2: tilt chosen from the centre of gravity. The amp rests on its rear foot line (TILT_Z) and the
// legs' feet are on the floor BEHIND it, so the legs only carry load if the CG is BEHIND that line (otherwise gravity
// tips the amp forward off the legs). CG = cabinet centre (z 0, y FOOT_H + H/2: chassis/transformers high-rear, speaker
// magnet low-front, roughly centred). Tilt = the smallest angle that puts the CG CG_MARGIN behind the contact line.
// Horizontal CG offset from the contact line after tilting theta: dz = a cos(theta) - h sin(theta) (a = -TILT_Z, h = CG_Y);
// balance when dz = 0 (tan = a/h); stable when dz = -CG_MARGIN.
const TILT_Z = -(D / 2 - 1.15 + FOOT_R);   // -4.27: rear rubber feet's rear-bottom line, y = 0
const CG_Y = FOOT_H + H / 2, CG_Z = 0, CG_MARGIN = 0.75;
const CG_A = CG_Z - TILT_Z, CG_R = Math.hypot(CG_A, CG_Y);
const BALANCE_RAD = Math.atan2(CG_A, CG_Y);
const TILT = Math.acos(-CG_MARGIN / CG_R) - Math.atan2(CG_Y, CG_A);
export const AMP_TILT_DEG = Math.round(THREE.MathUtils.radToDeg(TILT) * 100) / 100;
const CG_BEHIND = -(CG_A * Math.cos(TILT) - CG_Y * Math.sin(TILT));   // inches behind the rear contact line (= CG_MARGIN)
// 19" Fender leg (the longest real length). The pivot sits on the leg so that the closed leg does not hang below the
// cabinet bottom (LEG_PIVOT_T) and the deployed leg stands within ~15 deg of vertical.
const LEG_LEN_FLUSH = 19.0;
const PIVOT_Y = 14.9;                         // cabinet-local height of the pivot bolt
const LEG_PIVOT_T = 1 - (PIVOT_Y - (FOOT_H + 0.05)) / LEG_LEN_FLUSH;   // closed leg's lower end 0.05" above the cabinet bottom
const LEG_STANDOFF = 0.05;                    // a hair of air between the tolex and the leg's back face (0.03-0.15)
// pivot near the REAR of the side: leg back edge 1.7" in from the cabinet's back edge (z = -D/2).
const LEG_PIVOT_Z = -(D / 2) + 1.7 + LEG_HW;
const STOP_BELOW = 1.2;                       // the stop screw meets the leg's rear edge this far below the pivot
// Cabinet-local -> amp root (upright floor frame): rotate -TILT about x through (0, 0, TILT_Z), i.e. front up.
// p' = R (p - P) + P, so the translation is P - R P = (0, -TILT_Z sin, TILT_Z (1 - cos)).
const TILT_M = new THREE.Matrix4().compose(
  new THREE.Vector3(0, -TILT_Z * Math.sin(TILT), TILT_Z * (1 - Math.cos(TILT))),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -TILT),
  new THREE.Vector3(1, 1, 1));

// These are the actual circle centers in the supplied panel.jpg.
// The texture generator's older constants do not describe this asset.
const KNOB_U = [215, 400, 584, 768, 952, 1136, 1321, 1505, 1689]
  .map(x => x / 2048);
const KNOB_SETTINGS = [4, 4, 3, 3, 4.5, 3, 4.5, 3.5, 3];

// Photographed knob cap (knob-1-inlay-extended.png, 1024 px square): the
// skirt is ~0.8" across and the full chicken head ~1.15" tip to tail, so a
// 1.18" square maps the photo at real size. The photo's pointer tip is at
// the image BOTTOM; the 3D head points +Y, so its planar UVs are the photo
// turned by PI (u = 0.5 - x/S, v = 0.5 - y/S).
const KNOB_CAP_SIZE = 1.18;
// 3D knob stack, in knob-local inches (z out of the panel).
const PANEL_FACE_Z = 0.055;          // panel.jpg plane on frontPanel
const KNOB_Z = 0.058;                // knob origin, just proud of the panel
const KNOB_CAP_TOP = 0.29;           // rim of the crowned head top
const KNOB_INLAY_T = 0.014;          // raised inlay thickness
const KNOB_DOME = 0.042;             // crown height of the head top above its rim
const KNOB_DOME_C = [0, 0.05];       // crown apex (knob-local x, y), on the pointer axis
const KNOB_HEIGHT = (KNOB_Z - PANEL_FACE_Z) + KNOB_CAP_TOP + KNOB_DOME - 0.003 + KNOB_INLAY_T;

// Pilot light: royal blue (Blake). One swappable part, see makePilotLight.
// amp8 (Blake t174u/t178u): LED option #2 royal blue (led-2.png).
const PILOT_COLOR = '#2a4fe0';

// Zingaro script overlay: right of PRESENCE, left of the jewel lamp, above
// the red tape. Center from the old script's pixels in the 2048x256 panel.
const LOGO_X = 7.6, LOGO_Y = 0.27, LOGO_Z = 0.075, LOGO_W = 1.62;

const noop = () => {};
const clamp01 = t => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

// amp10 (Blake t196u) 10d: same device class test as the page (coarse pointer or small screen)
const AMP10_PHONE = (() => { try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || Math.min(screen.width, screen.height) < 600; } catch (_) { return false; } })();

function defaultBase() {
  return new URL('./assets/', import.meta.url).href;
}

function resources() {
  const owned = new Set();
  return {
    own(value) {
      if (value) owned.add(value);
      return value;
    },
    dispose() {
      for (const value of owned) {
        try { value.dispose?.(); } catch (_) {}
      }
      owned.clear();
    }
  };
}

// Dispose an object subtree that is NOT owned by the resource bag (the
// swappable pilot part): geometry, materials and their textures, lights.
function disposeObject(object) {
  if (!object) return;
  object.traverse(o => {
    try { o.geometry?.dispose?.(); } catch (_) {}
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of list) {
      try {
        for (const key of Object.keys(m)) {
          if (m[key] && m[key].isTexture) m[key].dispose();
        }
        m.dispose();
      } catch (_) {}
    }
    if (o.isLight) { try { o.dispose?.(); } catch (_) {} }
  });
}

async function loadTextures(base, aniso, bag) {
  const loader = new THREE.TextureLoader();
  const specs = {
    tolex: ['tolex.jpg', true, true],
    normal: ['tolex-normal.jpg', false, true],
    grille: ['grille.jpg', true, true],
    leather: ['leather.jpg', true, true],
    panel: ['panel.jpg', true, false],
    // amp10 (Blake t196u) 10d: phones get a 1024x115 webp of the rear strip (was 2048x230, 1.8 MB level-0); desktop unchanged
    rearStrip: [AMP10_PHONE ? 'phone/rear-strip-1024.webp' : 'rear-strip.jpg', true, false],
    rear: ['rear.jpg', true, false],
    speaker: ['speaker.jpg', true, false],
    chromeRough: ['chrome-rough.jpg', false, true],
    badge: ['badge-amp7.webp', true, false],
    zingaro: ['zingaro-logo4-cutout-amp7.webp', true, false],
    knobCap: ['knob-1-inlay-extended-amp7.webp', true, false],
    leg: ['leg-amp8.webp', true, false],  // amp8 (Blake t174u/t178u): tilt-back leg photo, 124x1024 webp+alpha
    handle5: ['handle-red5-amp9.webp', true, false]   // amp9 (Blake t188u): red handle #5 grain + stitching, 1024x256
  };

  const entries = await Promise.all(Object.entries(specs).map(
    async ([key, [file, color, repeat]]) => {
      const texture = await new Promise(resolve => {
        loader.load(
          new URL(file, base).href,
          t => {
            bag.own(t);
            t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.wrapS = t.wrapT = repeat
              ? THREE.RepeatWrapping
              : THREE.ClampToEdgeWrapping;
            t.anisotropy = aniso;
            resolve(t);
          },
          undefined,
          () => resolve(null)
        );
      });
      return [key, texture];
    }
  ));
  return Object.fromEntries(entries);
}

/* amp8 (Blake t174u): start the texture downloads early (during the ZUNIGA intro). Network + off-thread image decode
 * only: nothing is built or uploaded here. mountAmp() picks the result up when it is called with the same asset base.
 * Returns the promise (resolves to the texture map; failed files are null, like loadTextures). */
let PREFETCH = null;
function resolveBase(assetBase) {
  const documentBase = typeof document !== 'undefined' ? document.baseURI : import.meta.url;
  const requested = assetBase == null ? defaultBase() : String(assetBase);
  return new URL(requested.endsWith('/') ? requested : `${requested}/`, documentBase).href;
}
export function prefetchAmpTextures(assetBase) {
  const base = resolveBase(assetBase);
  if (PREFETCH && PREFETCH.base === base) return PREFETCH.promise;
  const loose = { own: v => v };   // ownership moves to the mount's bag in mountAmp
  const promise = loadTextures(base, 1, loose).then(async tx => {
    // decode now (off the main thread) so the later texture upload does not decode synchronously
    await Promise.all(Object.values(tx).map(t => (t && t.image && typeof t.image.decode === 'function')
      ? t.image.decode().catch(() => {}) : null));
    return tx;
  });
  PREFETCH = { base, promise, used: false };
  return promise;
}

// "It's dark": a modest self-lift that keeps the texture detail. The albedo
// map doubles as the emissive map at low intensity, so the cloth/leather
// reads in the guitar's low-key studio without looking flat. Not used on the
// control panel, badge or logo (they keep their amp5 look).
function lift(material, k) {
  if (material.map) {
    material.emissive.set(0xffffff);
    material.emissiveMap = material.map;
  } else {
    material.emissive.copy(material.color);
  }
  material.emissiveIntensity = k;
  return material;
}

function mats(tx, bag) {
  const standard = values => bag.own(new THREE.MeshStandardMaterial(values));
  const physical = values => bag.own(new THREE.MeshPhysicalMaterial(values));
  return {
    // Tolex UVs are in six-inch tiles; normal and color share the same UVs.
    // Slight albedo boost above 1 (linear) lifts the very dark vinyl; the
    // extra lift is a flat, even emissive (no emissiveMap) so the crack
    // network in the albedo is not amplified. Gentle normal strength, high
    // roughness and low env reflection: fine-grain vinyl up close.
    tolex: standard({
      color: tx.tolex ? new THREE.Color(1.25, 1.25, 1.25) : 0x171718,
      map: tx.tolex, normalMap: tx.normal,
      normalScale: new THREE.Vector2(0.085, 0.085),
      roughness: 0.88, metalness: 0, envMapIntensity: 0.75,
      emissive: 0x26262b, emissiveIntensity: 0.6
    }),
    grille: lift(standard({
      color: tx.grille ? 0xffffff : 0xbcb5a4,
      map: tx.grille, roughness: 0.94, metalness: 0
    }), 0.24),
    leather: lift(standard({
      color: tx.leather ? 0xffffff : 0x761b29,
      map: tx.leather, roughness: 0.59, metalness: 0, envMapIntensity: 1.1
    }), 0.14),
    // amp9 (Blake t188u): red handle #5 leather. Deep cherry map, soft sheen from a light, rough clearcoat;
    // a small self-lift (map as emissive) keeps it reading red, not brown, in the dark home scene.
    leather5: lift(physical({
      // (the white key-light specular + ACES washed the red toward pink (213,95,98 close top); tuned with
      // opus9/handle5-tune.mjs: albedo x0.6, halved dielectric specular, faint coat -> ~169,42,52 sRGB;
      // the red sheen gives the soft grazing glow of the strap's rolled edges)
      color: tx.handle5 ? 0x999999 : 0x8c1420,
      map: tx.handle5, roughness: 0.58, metalness: 0, envMapIntensity: 0.7,
      specularIntensity: 0.35, clearcoat: 0.08, clearcoatRoughness: 0.5,
      sheen: 0.5, sheenColor: 0x7a1018, sheenRoughness: 0.55
    }), 0.14),   // lift 0.14: site home top view 70 -> 81 red, still pure (G ~7); 0.2 started to wash out
    // Control panel: amp5 values (no lift, no env boost). Physical only to
    // halve the dielectric specular so the amp key light cannot wash the
    // glossy black face grey in close-ups.
    panel: physical({
      color: tx.panel ? 0xffffff : 0x101012,
      map: tx.panel, roughness: 0.42, metalness: 0.15,
      specularIntensity: 0.5
    }),
    rearStrip: standard({
      color: tx.rearStrip ? 0xffffff : 0x101012,
      map: tx.rearStrip, roughness: 0.43, metalness: 0.13
    }),
    rear: lift(standard({
      color: tx.rear ? 0xffffff : 0x181819,
      map: tx.rear, roughness: 0.82, metalness: 0
    }), 0.12),
    speaker: lift(standard({
      color: 0xffffff, map: tx.speaker,
      roughness: 0.68, metalness: 0.12
    }), 0.1),
    chrome: standard({
      color: 0xe4e5e9, metalness: 1, roughness: 0.17,
      roughnessMap: tx.chromeRough, envMapIntensity: 1.4
    }),
    satin: standard({
      color: 0x777a7d, metalness: 0.8, roughness: 0.43, envMapIntensity: 1.2
    }),
    // amp13 (Blake t214u): PRISM toggle metal (brushed nickel / chrome, see amp13/ref/prism-v13-switch.png)
    prismMetal: standard({
      color: 0xd6d8dc, metalness: 0.95, roughness: 0.26, envMapIntensity: 1.6
    }),
    blackGloss: standard({
      color: 0x0c0c0e, roughness: 0.25, metalness: 0.04, envMapIntensity: 1.0
    }),
    // Knob-1: deep glossy black bakelite. Near-black base, a tight lobe so
    // the crowned top shows a small streak (not a full-face mirror), and a
    // reduced dielectric specular / env so it never reads silver or metal.
    knobBlack: physical({
      color: 0x040405, roughness: 0.24, metalness: 0,
      envMapIntensity: 0.3, specularIntensity: 0.45
    }),
    rubber: standard({
      color: 0x101011, roughness: 0.94, metalness: 0
    }),
    interior: standard({
      color: 0x080809, roughness: 1, side: THREE.DoubleSide
    }),
    ivory: lift(standard({
      color: 0xe6dfca, roughness: 0.72
    }), 0.08),
    // Raised pointer inlay on the 3D knobs: near-white, satin.
    inlay: lift(standard({
      color: 0xf1eee6, roughness: 0.45, metalness: 0
    }), 0.12),
    // Rear strip LED (the front pilot is its own swappable part below).
    // Moderate emissive so tone mapping keeps it royal blue, not lavender.
    jewel: standard({
      color: 0x06103f, emissive: 0x1f3fff,
      emissiveIntensity: 0.95, roughness: 0.2, metalness: 0
    }),
    // amp10 (Blake t204u) 10l LOGO POP: the chrome Glaswerks script read pale-on-pale against the white grille. A small
    // emissive lift (same map) gives the letters a bright edge highlight; the shadow / halo materials below are the same
    // map in black (same program as the badge, so no new shader), drawn just behind it as a dark outline + a tiny cast shadow.
    badge: standard({
      color: 0xffffff, map: tx.badge,
      emissive: 0xffffff, emissiveMap: tx.badge, emissiveIntensity: 0.16,
      transparent: true, alphaTest: 0.18,
      roughness: 0.47, metalness: 0.45,
      depthWrite: true
    }),
    badgeShadow: standard({
      color: 0x000000, map: tx.badge, emissive: 0x000000, emissiveMap: tx.badge,
      transparent: true, opacity: 0.6, alphaTest: 0.18, roughness: 1, metalness: 0, depthWrite: false
    }),
    badgeHalo: standard({
      color: 0x000000, map: tx.badge, emissive: 0x000000, emissiveMap: tx.badge,
      transparent: true, opacity: 0.55, alphaTest: 0.18, roughness: 1, metalness: 0, depthWrite: false
    }),
    // Painted cream script on the control panel: not chrome.
    logo: standard({
      color: 0xffffff, map: tx.zingaro,
      transparent: true, alphaTest: 0.18,
      roughness: 0.5, metalness: 0,
      depthWrite: true
    }),
    // Photographed knob cap. No longer on the 3D heads (it washed them out
    // to silver); kept so the texture stays available for reference/debug.
    knobCap: standard({
      color: 0xffffff, map: tx.knobCap,
      roughness: 0.3, metalness: 0
    })
  };
}

function roundedShape(width, height, radius, centerY = 0) {
  const s = new THREE.Shape();
  const x = -width / 2, y = centerY - height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  s.closePath();
  return s;
}

// Pointed-top, round-bottom outline shared by the side-board pocket hole and
// the chrome bezel. Built from explicit points (no Shape.translate in r170).
function pocketOutline(path, cx, hw, y0, y1, tip) {
  const cy = y0 + hw;
  path.moveTo(cx + hw, cy);
  path.lineTo(cx + hw, y1);
  path.lineTo(cx, tip);
  path.lineTo(cx - hw, y1);
  path.lineTo(cx - hw, cy);
  for (let i = 1; i < 8; i++) {
    const a = Math.PI + i * Math.PI / 8;
    path.lineTo(cx + Math.cos(a) * hw, cy + Math.sin(a) * hw);
  }
  path.closePath();
  return path;
}

// Give each face a consistent physical grain scale instead of stretching
// one square texture across the entire cabinet.
function physicalUV(geometry, tile = 6) {
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else if (ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function cabinetGeometry() {
  // A side board, not a solid cabinet: the back port really opens into
  // the enclosure, and the grille genuinely sits behind the front rails.
  const s = new THREE.Shape();
  const f = D / 2 - 0.1, b = -D / 2 + 0.1;
  const low = FOOT_H + 0.1, high = TOP - 0.1;
  // Shape X is minus cabinet Z. Extrusion becomes cabinet X.
  s.moveTo(-f + 0.18, low);
  s.lineTo(-b - 0.18, low);
  s.quadraticCurveTo(-b, low, -b, low + 0.18);
  s.lineTo(-b, high - 0.2);
  s.quadraticCurveTo(-b, high, -b - 0.2, high);
  s.lineTo(-3.72, high);
  s.quadraticCurveTo(-3.91, high, -3.96, high - 0.15);
  s.lineTo(-f, PANEL_BOTTOM);
  s.lineTo(-f, low + 0.2);
  s.quadraticCurveTo(-f, low, -f + 0.18, low);
  s.closePath();

  // Routed handle pocket: a real through-hole in the board (the pocket
  // floor is a separate dark plate behind it). The bevel rounds the mouth.
  // amp9 (Blake t188u): no pocket when the legs sit flush on the outside (LEGS_FLUSH).
  if (!LEGS_FLUSH) s.holes.push(pocketOutline(new THREE.Path(),
    -HANDLE_Z, POCKET_HW, POCKET_Y0, POCKET_Y1, POCKET_TIP));

  const g = new THREE.ExtrudeGeometry(s, {
    depth: FRAME - 0.2,
    steps: 1, curveSegments: 4,
    bevelEnabled: true, bevelSegments: 2,
    bevelThickness: 0.1, bevelSize: 0.1
  });
  g.rotateY(Math.PI / 2);
  return physicalUV(g);
}

/*
 * amp8 (Blake t174u/t178u): Fender-style tilt-back leg (legs option #1), replacing the
 * earlier lens-section strap + canvas emboss. Local x runs across the leg (+x is the
 * viewer's right from outside on either side), y is cabinet height, +z is outward from
 * the tolex. A thin slab whose outline follows the photo's alpha (gothic pointed top,
 * rounded bottom corners); it lies flat on the tolex below the pocket, bows slightly
 * outward over the pocket and settles onto the pocket floor at the tip.
 * UVs: front face u = 0.5 + x / (2 * LEG_HW), v = 1 at the tip (texture top, flipY) so
 * the photo maps 1:1 to the outline and FENDER reads top-to-bottom on BOTH sides
 * (each side group is rotated so its +x is the viewer's right; nothing is mirrored).
 * The back face and the edge walls reuse the same UVs (never seen face-on).
 */
// amp9 (Blake t188u) 9g: squareFoot (flush leg): no geometric rounding of the bottom corners (the photo's alpha,
// alphaTest 0.5, still draws the rounded foot). With the rounded geometry the lowest real point was on the curve, so the
// bar's own bounding-box corner sat 0.43" below the floor after the tilt; square, that corner IS the floor contact.
function legHalfWidth(t, squareFoot = false) {   // t: 0 at the tip .. 1 at the bottom (texture rows / 1024)
  if (t < LEG_TIP_T) return LEG_HW * lerp(0.06, 1, Math.pow(t / LEG_TIP_T, 0.85));
  if (t > 0.975 && !squareFoot) return LEG_HW * (1 - 0.55 * ((t - 0.975) / 0.025) ** 2);
  return LEG_HW;
}
function legLiftZ(s, flush = false) {   // s: inches up from the leg bottom; z of the slab mid-plane
  if (flush) return LEG_STANDOFF + LEG_TH / 2;   // amp9 (Blake t188u): flat on the outside of the side panel
  const flat = 0.03 + LEG_TH / 2;    // on the tolex
  const floor = -POCKET_DEPTH + LEG_TH / 2 + 0.012;
  const s0 = 3.0, s1 = 11.2;
  if (s < s0) return flat;
  if (s > s1) return floor;
  const k = (s - s0) / (s1 - s0);
  return lerp(flat, floor, smooth(k)) + 0.2 * Math.sin(Math.PI * k);   // slight outward bow
}
// amp9 (Blake t188u): len / flush / y0 parameters. Flush = a flat bar LEG_STANDOFF off the tolex (no pocket bow);
// y0 = where the leg bottom sits (the flush leg is built with its pivot at y = 0, see the legs section).
function legGeometry(len = LEG_LEN, flush = false, y0 = STRAP_Y0) {
  const rows = 72, cols = 6;
  const pos = [], uv = [], idx = [];
  const ring = [];                   // [row][col] -> front vertex index; back = front + count
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const s = (1 - t) * len;
    const hw = legHalfWidth(t, flush), y = y0 + s, z = legLiftZ(s, flush);   // amp9 (Blake t188u) 9g: square foot when flush
    for (let j = 0; j <= cols; j++) {
      const f = j / cols * 2 - 1;
      const crown = 0.012 * (1 - f * f);          // a hair of crown across the bar
      pos.push(f * hw, y, z + LEG_TH / 2 + crown);
      uv.push(0.5 + f * hw / (2 * LEG_HW), 1 - t);
    }
  }
  const n = pos.length / 3;
  for (let k = 0; k < n; k++) {      // back face
    pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2] - LEG_TH);
    uv.push(uv[k * 2], uv[k * 2 + 1]);
  }
  const at = (i, j) => i * (cols + 1) + j;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = at(i, j), b = at(i + 1, j);
      idx.push(a, b, a + 1, a + 1, b, b + 1);                 // front (+z)
      idx.push(n + a, n + a + 1, n + b, n + a + 1, n + b + 1, n + b);   // back (-z)
    }
  }
  // Edge walls (own vertices so the front stays smooth-shaded).
  for (const j of [0, cols]) {
    const out = j === 0 ? -1 : 1;
    const base = pos.length / 3;
    for (let i = 0; i <= rows; i++) {
      const k = at(i, j);
      pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      pos.push(pos[(n + k) * 3], pos[(n + k) * 3 + 1], pos[(n + k) * 3 + 2]);
      uv.push(uv[k * 2], uv[k * 2 + 1], uv[k * 2], uv[k * 2 + 1]);
    }
    for (let i = 0; i < rows; i++) {
      const f0 = base + i * 2, f1 = f0 + 2;
      if (out > 0) idx.push(f0, f1, f0 + 1, f0 + 1, f1, f1 + 1);
      else idx.push(f0, f0 + 1, f1, f0 + 1, f1 + 1, f1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/*
 * amp9 (Blake t188u): deployed tilt-leg angle, solved once at build (no per-frame work).
 * Everything happens in the side plane (forward = cabinet +z, up = y). The cabinet tilt (rear-bottom line, front
 * up) and the leg swing (foot forward about its pivot bolt) are both rotations the same way in that plane, so the
 * leg's angle from WORLD vertical is alpha = TILT + phi (phi = swing in the cabinet frame). A point of the leg
 * outline d below the pivot (along the bar) and c across it sits at world height ybw + c*sin(alpha) - d*cos(alpha)
 * above the floor, ybw = the bolt's world height. The lowest point is the rear foot corner (c = -hw), so the foot
 * touches the floor when max over the outline rows of (hw*sin(alpha) + d*cos(alpha)) = ybw. That maximum falls
 * monotonically with alpha here (d >> hw), so a 60-step bisection on the same rows the geometry is built from
 * gives the exact contact angle.
 */
function legDeployAngle(len = LEG_LEN_FLUSH) {
  // amp10 (Blake t196u) 10b: the legs now swing BACK (foot behind the amp). alpha = angle from WORLD vertical,
  // foot rearward; the bar in the cabinet frame is swung back by TILT + alpha (phi = -(TILT + alpha)).
  // The lowest outline point is the foot's FORWARD corner (c = +hw): height = ybw - d cos(alpha) - hw sin(alpha), so
  // the contact condition max over rows (d cos a + hw sin a) = ybw is the same expression as in amp9.
  const sPivot = (1 - LEG_PIVOT_T) * len;
  const ybw = PIVOT_Y * Math.cos(TILT) + (LEG_PIVOT_Z - TILT_Z) * Math.sin(TILT);
  const rows = 72;
  const reach = (alpha) => {
    let m = -Infinity;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows, d = sPivot - (1 - t) * len;
      m = Math.max(m, legHalfWidth(t, true) * Math.sin(alpha) + d * Math.cos(alpha));
    }
    return m;
  };
  let lo = 0, hi = THREE.MathUtils.degToRad(80);
  if (reach(lo) < ybw) {
    // Too short to reach the floor even hanging plumb: hang it plumb (never pushed through the floor).
    return { phi: -TILT, alpha: 0, ybw, sPivot, short: true };
  }
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) > ybw) lo = mid; else hi = mid;
  }
  const alpha = (lo + hi) / 2;
  return { phi: -(TILT + alpha), alpha, ybw, sPivot, short: false };
}

// Procedural chicken head. Still used for the two rear-strip knobs.
// amp13 (Blake t214u): PRISM bot's toggle as one merged geometry at unit footprint radius (axis +z out of the panel, base at z = 0):
// round bezel ring (stepped, chamfered edge), hex nut, tapered bat lever leaning to +x, ball tip. ~400 triangles. The instance scale
// is the footprint radius (0.16 in the large strip toggles, 0.105 in the small ones). geometry.userData.parts lists the pieces.
function prismToggleGeometry() {
  const parts = [];
  const add = (name, g, rx, ry, rz, x, y, z) => {
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
    const ng = g.index ? g.toNonIndexed() : g;
    ng.userData.part = name;
    parts.push(ng);
  };
  const H = Math.PI / 2, lean = 0.5;
  add('bezel', new THREE.CylinderGeometry(1, 1, 0.3, 24), H, 0, 0, 0, 0, 0.15);                  // round ring
  add('bezel', new THREE.CylinderGeometry(0.88, 1, 0.12, 24), H, 0, 0, 0, 0, 0.36);               // chamfer step (knurled look)
  add('nut', new THREE.CylinderGeometry(0.6, 0.6, 0.34, 6), H, 0, 0, 0, 0, 0.59);                  // hex nut
  const L = 1.9;   // lever length along its own axis, from the pivot on top of the nut
  const lev = new THREE.CylinderGeometry(0.11, 0.2, L, 10);                                         // tapered: thin at the tip
  lev.translate(0, L / 2, 0); lev.rotateX(H);                                                       // axis along +z
  lev.rotateY(lean);                                                                                // lean toward +x
  lev.translate(0, 0, 0.74);
  parts.push(lev.toNonIndexed());
  const tip = new THREE.Vector3(0, 0, L).applyEuler(new THREE.Euler(0, lean, 0)).add(new THREE.Vector3(0, 0, 0.74));
  const ball = new THREE.SphereGeometry(0.26, 12, 8); ball.translate(tip.x, tip.y, tip.z);
  parts.push(ball.toNonIndexed());
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0; const ranges = [];
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    ranges.push([g.userData.part || (g === lev ? 'lever' : 'ball'), o, g.attributes.position.count]); o += g.attributes.position.count;
  }
  ranges[ranges.length - 2][0] = 'lever'; ranges[ranges.length - 1][0] = 'ball';
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData.parts = ranges;   // [name, first vertex, vertex count]
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

function chickenHeadGeometry() {
  // Zero points upward. A positive dial setting rotates clockwise.
  const s = new THREE.Shape();
  s.moveTo(-0.1, -0.25);
  s.quadraticCurveTo(-0.3, -0.21, -0.28, 0.02);
  s.quadraticCurveTo(-0.25, 0.22, -0.1, 0.26);
  s.lineTo(-0.055, 0.48);
  s.quadraticCurveTo(0, 0.55, 0.055, 0.48);
  s.lineTo(0.1, 0.26);
  s.quadraticCurveTo(0.3, 0.17, 0.28, -0.04);
  s.quadraticCurveTo(0.26, -0.25, 0.1, -0.25);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.28, steps: 1, curveSegments: 5,
    bevelEnabled: true, bevelSize: 0.035,
    bevelThickness: 0.035, bevelSegments: 2
  });
}

function inlayGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.028, 0.13);
  s.quadraticCurveTo(0, 0.07, 0.028, 0.13);
  s.lineTo(0.017, 0.45);
  s.lineTo(0, 0.49);
  s.lineTo(-0.017, 0.45);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 4);
  g.translate(0, 0, 0.319);
  return g;
}

// ---------- 3D front knobs (knob-1 look) ----------
// Knob-local frame: +Z out of the panel, pointer +Y at setting 6.

// Round black skirt, ~0.84" across at the base with a slight flare, a
// rounded shoulder and a fluted/knurled side wall. The top is crowned (not
// flat) so it cannot mirror the key light across its whole face. Lathe
// about Y, then turned so the axis is +Z.
function knobSkirtGeometry() {
  const profile = [
    [0.418, 0], [0.422, 0.018], [0.41, 0.05], [0.395, 0.09],
    [0.385, 0.112], [0.365, 0.13], [0.33, 0.142], [0.27, 0.16],
    [0.2, 0.172], [0.1, 0.18], [0, 0.182]
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(profile, 48);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.37) {
      const a = Math.atan2(z, x);
      const k = 1 + 0.018 * Math.cos(a * 24);
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

// Chicken-head outline traced from the photo (pointer up): long tapered
// pointer, broad rounded tail.
function knobHeadShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.555);
  s.quadraticCurveTo(0.02, 0.552, 0.024, 0.52);
  s.lineTo(0.042, 0.40);
  s.lineTo(0.09, 0.15);
  s.quadraticCurveTo(0.115, -0.05, 0.135, -0.24);
  s.lineTo(0.18, -0.40);
  s.quadraticCurveTo(0.205, -0.555, 0, -0.545);
  s.quadraticCurveTo(-0.205, -0.555, -0.18, -0.40);
  s.lineTo(-0.135, -0.24);
  s.quadraticCurveTo(-0.115, -0.05, -0.09, 0.15);
  s.lineTo(-0.042, 0.40);
  s.lineTo(-0.024, 0.52);
  s.quadraticCurveTo(-0.02, 0.552, 0, 0.555);
  s.closePath();
  return s;
}

// The head outline as a closed polygon (same 6 curve segments the extrude
// uses, so the crown rim meets the bevel exactly). No duplicate end point.
function knobHeadOutline() {
  const pts = knobHeadShape().extractPoints(6).shape.map(p => p.clone());
  while (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-7) pts.pop();
  return pts;
}

// Crown parameter of a head-top point: 0 at the apex KNOB_DOME_C, 1 on the
// outline (ray from the apex through the point, nearest outline crossing).
// The outline is star-shaped about the apex.
function knobDomeT(x, y, outline) {
  const cx = KNOB_DOME_C[0], cy = KNOB_DOME_C[1];
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy < 1e-14) return 0;
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-14) continue;
    const ax = a.x - cx, ay = a.y - cy;
    const s = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (s > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, s);
  }
  return Number.isFinite(best) ? clamp01(1 / best) : 1;
}

const knobDomeZ = t => KNOB_CAP_TOP + KNOB_DOME * (1 - t * t);

// Crowned head top: rings of the outline scaled about the apex, parabolic
// height. Smooth normals; returned non-indexed (for merging with the body).
function knobDomeGeometry(outline) {
  const cx = KNOB_DOME_C[0], cy = KNOB_DOME_C[1];
  const rings = 7, m = outline.length;
  const pos = [], uv = [], idx = [];
  const push = (x, y, t) => {
    pos.push(x, y, knobDomeZ(t));
    uv.push(0.5 - x / KNOB_CAP_SIZE, 0.5 - y / KNOB_CAP_SIZE);
  };
  push(cx, cy, 0);
  for (let k = 1; k <= rings; k++) {
    const t = k / rings;
    for (const p of outline) push(cx + (p.x - cx) * t, cy + (p.y - cy) * t, t);
  }
  const at = (k, i) => 1 + (k - 1) * m + (i % m);
  // Wind every triangle to face +z (outline orientation does not matter).
  const tri = (a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1];
    const cross = (pos[b * 3] - ax) * (pos[c * 3 + 1] - ay)
      - (pos[b * 3 + 1] - ay) * (pos[c * 3] - ax);
    if (cross >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (let i = 0; i < m; i++) tri(0, at(1, i), at(1, i + 1));
  for (let k = 1; k < rings; k++) {
    for (let i = 0; i < m; i++) {
      const a = at(k, i), b = at(k, i + 1), c = at(k + 1, i), d = at(k + 1, i + 1);
      tri(a, c, d);
      tri(a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const flat = g.toNonIndexed();
  deferDispose(g);   // amp10 (Blake t196u) 10h3
  return flat;
}

// Chicken-head body: the bevelled extrusion gives real side faces and a
// rounded shoulder; its flat top cap is replaced by the crowned top above,
// so the key light leaves a small streak instead of a full-face mirror.
// Planar UVs (photo frame) are kept; the head renders as gloss black bakelite.
function knobHeadGeometry(outline = knobHeadOutline()) {
  const ext = new THREE.ExtrudeGeometry(knobHeadShape(), {
    depth: 0.17, steps: 1, curveSegments: 6,
    bevelEnabled: true, bevelThickness: 0.05,
    bevelSize: 0.02, bevelSegments: 3
  });
  // Body spans z 0.02 .. KNOB_CAP_TOP (0.29); the crown rises KNOB_DOME above.
  ext.translate(0, 0, 0.07);
  const src = ext.index ? ext.toNonIndexed() : ext;
  const p = src.attributes.position;
  const n = src.attributes.normal;
  const pos = [], nor = [], uvs = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    let cap = true;
    for (let k = 0; k < 3; k++) {
      if (p.getZ(i + k) < KNOB_CAP_TOP - 1e-4 || n.getZ(i + k) < 0.999) cap = false;
    }
    if (cap) continue;   // flat top: replaced by the crown
    for (let k = 0; k < 3; k++) {
      const j = i + k, x = p.getX(j), y = p.getY(j);
      pos.push(x, y, p.getZ(j));
      nor.push(n.getX(j), n.getY(j), n.getZ(j));
      uvs.push(0.5 - x / KNOB_CAP_SIZE, 0.5 - y / KNOB_CAP_SIZE);
    }
  }
  if (src !== ext) deferDispose(src);   // amp10 (Blake t196u) 10h3
  deferDispose(ext);

  const dome = knobDomeGeometry(outline);
  const dp = dome.attributes.position, dn = dome.attributes.normal, du = dome.attributes.uv;
  for (let i = 0; i < dp.count; i++) {
    pos.push(dp.getX(i), dp.getY(i), dp.getZ(i));
    nor.push(dn.getX(i), dn.getY(i), dn.getZ(i));
    uvs.push(du.getX(i), du.getY(i));
  }
  deferDispose(dome);   // amp10 (Blake t196u) 10h3

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Raised white inlay: the extended line from near the hub to the tip, a
// thin strip with rounded ends that follows the crown (top KNOB_INLAY_T
// - 0.003 above the crown, bottom 0.003 below it).
function knobInlayGeometry(outline = knobHeadOutline()) {
  const y0 = 0.158, y1 = 0.508, hw = 0.0115, N = 32;
  const mid = (y0 + y1) / 2, half = (y1 - y0) / 2;
  const zAt = (x, y) => knobDomeZ(knobDomeT(x, y, outline));
  const TL = [], TR = [], BL = [], BR = [];
  for (let i = 0; i <= N; i++) {
    const y = mid - half * Math.cos(Math.PI * i / N);
    const d = Math.max(0, Math.min(y - y0, y1 - y));
    const w = d < hw ? Math.sqrt(Math.max(0, hw * hw - (hw - d) * (hw - d))) : hw;
    const zl = zAt(-w, y), zr = zAt(w, y);
    TL.push([-w, y, zl + KNOB_INLAY_T - 0.003]);
    TR.push([w, y, zr + KNOB_INLAY_T - 0.003]);
    BL.push([-w, y, zl - 0.003]);
    BR.push([w, y, zr - 0.003]);
  }
  const pos = [];
  const tri = (a, b, c, want) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { const t = b; b = c; c = t; }
    pos.push(...a, ...b, ...c);
  };
  const up = [0, 0, 1], left = [-1, 0, 0], right = [1, 0, 0];
  for (let i = 0; i < N; i++) {
    tri(TL[i], TR[i], TR[i + 1], up);
    tri(TL[i], TR[i + 1], TL[i + 1], up);
    tri(BL[i], TL[i], TL[i + 1], left);
    tri(BL[i], TL[i + 1], BL[i + 1], left);
    tri(TR[i], BR[i], BR[i + 1], right);
    tri(TR[i], BR[i + 1], TR[i + 1], right);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/* ======================================================================
 * PILOT LIGHT — one swappable part.
 *
 * Contract: a factory returns a THREE.Group named 'amp-pilot' whose origin
 * is the center of the chrome bezel on the slanted front panel, +Z out of
 * the panel, units in amp-local inches. handle.setPilot(factoryOrGroup)
 * swaps it in place and disposes the old part. A factory is called with
 * { scale, color, pointLight } (scale = the amp's world scale, for light
 * distances). Another LED/switch design only has to follow this contract.
 *
 * amp8 (Blake t174u/t178u) default = LED option #2 (led-2.png): a thin chrome
 * bezel ring standing proud of the panel, a low-poly faceted royal-blue jewel
 * (flat-shaded lathe dome: crown facets + table), a bright non-tone-mapped
 * blue core seen through the translucent jewel, a soft additive blue halo
 * lying on the panel around the bezel, and an optional tiny blue PointLight
 * (off by default on coarse-pointer phones). Order matters for the checks:
 * the jewel is the first emissive mesh in the group.
 * ====================================================================== */
export function makePilotLight(opts = {}) {
  opts = opts || {};
  const color = String(opts.color || PILOT_COLOR).toLowerCase();
  const scale = opts.scale > 0 ? opts.scale : 1;
  const radius = opts.radius ?? 0.14;            // jewel radius (inner bezel)
  const c = new THREE.Color(color);
  const PANEL = -0.055;                          // panel face, relative to the mount

  const group = new THREE.Group();
  group.name = 'amp-pilot';
  group.userData = { part: 'pilot', color, swappable: true, amp8Led: 'led-2' };

  // Chrome bezel: lathe ring, outer lip ~0.075" proud of the panel.
  const R = radius;
  // Profile runs outer foot -> lip -> inner wall so the lathe faces point out of the metal.
  const bezelGeo = new THREE.LatheGeometry([
    new THREE.Vector2(R * 1.55, 0), new THREE.Vector2(R * 1.53, 0.035),
    new THREE.Vector2(R * 1.47, 0.075), new THREE.Vector2(R * 1.25, 0.09),
    new THREE.Vector2(R * 1.06, 0.075), new THREE.Vector2(R * 1.0, 0.035)
  ], 28);
  bezelGeo.rotateX(Math.PI / 2);
  bezelGeo.translate(0, 0, PANEL);
  const bezel = new THREE.Mesh(bezelGeo, new THREE.MeshStandardMaterial({
    color: 0xe8e9ec, metalness: 1, roughness: 0.14, envMapIntensity: 1.5
  }));
  bezel.name = 'amp-pilot-bezel';
  group.add(bezel);

  // Faceted jewel: 8-sided flat-shaded dome (pavilion edge, two crown rows, table).
  const jewelGeo = new THREE.LatheGeometry([
    new THREE.Vector2(R * 1.01, 0), new THREE.Vector2(R * 0.97, 0.04),
    new THREE.Vector2(R * 0.78, 0.085), new THREE.Vector2(R * 0.45, 0.11),
    new THREE.Vector2(0.0001, 0.112)
  ], 8);
  jewelGeo.rotateX(Math.PI / 2);
  jewelGeo.rotateZ(Math.PI / 8);
  jewelGeo.translate(0, 0, PANEL + 0.012);
  const jewelMat = new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.2),
    emissive: c,
    emissiveIntensity: opts.intensity ?? 0.85,
    roughness: 0.12, metalness: 0, flatShading: true,
    envMapIntensity: 0.6,          // facet glints without washing the blue to periwinkle
    transparent: true, opacity: opts.jewelOpacity ?? 0.9
  });
  const jewel = new THREE.Mesh(jewelGeo, jewelMat);
  jewel.name = 'amp-pilot-jewel';
  jewel.renderOrder = 1;
  group.add(jewel);

  // Bright core inside the jewel: lighter royal blue, exempt from tone mapping.
  const coreMat = new THREE.MeshBasicMaterial({
    color: c.clone().lerp(new THREE.Color('#8fb0ff'), 0.25), toneMapped: false, fog: false
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.38, 10, 6), coreMat);
  core.name = 'amp-pilot-core';
  core.position.z = PANEL + 0.05;
  core.scale.z = 0.6;
  group.add(core);

  // Soft blue halo on the panel around the bezel (additive, behind the bezel).
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d');
  if (ctx) {
    canvas.width = canvas.height = 64;
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    const haloTex = new THREE.CanvasTexture(canvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    const haloMat = new THREE.MeshBasicMaterial({
      map: haloTex, color: c, transparent: true,
      opacity: opts.haloOpacity ?? 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false
    });
    const size = R * (opts.haloScale ?? 7);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(size, size), haloMat);
    halo.name = 'amp-pilot-halo';
    halo.position.z = PANEL + 0.004;
    halo.renderOrder = 2;
    group.add(halo);
  }

  // Tiny blue spill on the panel; decay 0 with a short cutoff.
  if (opts.pointLight !== false) {
    const light = new THREE.PointLight(c, opts.lightIntensity ?? 0.35, 2.5 * scale, 0);
    light.name = 'amp-pilot-light';
    light.position.z = 0.35;
    light.castShadow = false;
    group.add(light);
  }

  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  group.traverse(o => { o.userData.keepSeparate = true; });
  return group;
}

/*
 * Batch static pieces by material. This keeps the detailed hardware cheap:
 * one draw per material, plus the front knob InstancedMeshes.
 * No BufferGeometryUtils dependency is needed.
 */
// amp9 (Blake t188u) 9g: optional subKey(object) -> string splits a material's bucket (the tilted cabinet keeps its
// floor-level pieces in their own batch, see buildAmp). Same material object, so no new programs.
function batchStatic(root, bag, subKey = null) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || object.userData.keepSeparate) return;
    if (Array.isArray(object.material)) return;
    const key = subKey ? object.material.uuid + '|' + subKey(object) : object.material;   // amp9 (Blake t188u) 9g
    const entry = buckets.get(key) || { material: object.material, list: [] };
    entry.list.push(object);
    buckets.set(key, entry);
  });

  for (const { material, list: objects } of buckets.values()) {   // amp9 (Blake t188u) 9g: keyed entries
    if (objects.length < 2) continue;
    const positions = [], normals = [], uvs = [];
    let cast = false, receive = false;
    for (const object of objects) {
      const source = object.geometry;
      const g = source.index ? source.toNonIndexed() : source.clone();
      g.applyMatrix4(object.matrixWorld);
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      }
      cast ||= object.castShadow;
      receive ||= object.receiveShadow;
      object.removeFromParent();
      deferDispose(g);   // amp10 (Blake t196u) 10h3
    }
    const geometry = bag.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `amp-batch-${material.id}`;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
  }
}

// amp10 (Blake t196u) 10h: buildAmp is a generator (buildAmpGen) with a yield between its sections so the site's mount path
// can run it in ~8 ms slices (mountAmp opts.sliceAfter); buildAmp() drives it to the end in one go (standalone page, tests).
function buildAmp(tx, bag) {
  const g = buildAmpGen(tx, bag);
  for (;;) { const r = g.next(); if (r.done) { drainDispose(1e9); return r.value; } }   // amp10 (Blake t196u) 10h3
}
// amp10 (Blake t196u) 10h3 GATE B: temporary geometries are disposed in scheduler slices (drainDispose, a few per slice), not inside one build section.
const DEFER_DISPOSE = [];
function deferDispose(g) { if (g) DEFER_DISPOSE.push(g); }
function drainDispose(n) { while (n-- > 0 && DEFER_DISPOSE.length) { try { DEFER_DISPOSE.pop().dispose(); } catch (_) {} } }
function* buildAmpGen(tx, bag) {
  const M = mats(tx, bag);
  const root = new THREE.Group();
  root.name = AMP_ID;
  root.userData.id = AMP_ID;

  const geoCache = new Map();
  const cached = (key, make) => {
    if (!geoCache.has(key)) geoCache.set(key, bag.own(make()));
    return geoCache.get(key);
  };

  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    bag.own(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function box(parent, w, h, d, material, x = 0, y = 0, z = 0, grain = false) {
    const g = cached(`box:${w}:${h}:${d}:${grain}`, () => {
      const geometry = new THREE.BoxGeometry(w, h, d);
      return grain ? physicalUV(geometry) : geometry;
    });
    return mesh(parent, g, material, x, y, z);
  }

  function rounded(parent, w, h, d, r, material, x = 0, y = 0, z = 0, grain = false) {
    const key = `round:${w}:${h}:${d}:${r}:${grain}`;
    const g = cached(key, () => {
      const b = Math.min(0.07, d / 4);
      const geometry = new THREE.ExtrudeGeometry(
        roundedShape(w - b * 2, h - b * 2, r),
        {
          depth: d - b * 2, steps: 1,
          bevelEnabled: true, bevelSize: b,
          bevelThickness: b, bevelSegments: 2, curveSegments: 5
        }
      );
      geometry.translate(0, 0, -d / 2 + b);
      return grain ? physicalUV(geometry) : geometry;
    });
    return mesh(parent, g, material, x, y, z);
  }

  function plane(parent, w, h, material, x, y, z) {
    return mesh(parent,
      cached(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
      material, x, y, z
    );
  }

  // Cylinder axis is local Z, pointing out of a panel.
  function cylinder(parent, radius, depth, material, x, y, z, segments = 16) {
    const g = cached(`cyl:${radius}:${depth}:${segments}`, () => {
      const geometry = new THREE.CylinderGeometry(radius, radius, depth, segments);
      geometry.rotateX(Math.PI / 2);
      return geometry;
    });
    return mesh(parent, g, material, x, y, z);
  }

  function screw(parent, x, y, z, size = 0.12) {
    cylinder(parent, size * 1.5, 0.045, M.chrome, x, y, z);
    cylinder(parent, size, 0.055, M.satin, x, y, z + 0.028);
    box(parent, size * 1.25, 0.023, 0.008, M.rubber, x, y, z + 0.06);
    box(parent, 0.023, size * 1.25, 0.008, M.rubber, x, y, z + 0.061);
  }

  function jack(parent, x, y, z, radius = 0.2) {
    cylinder(parent, radius, 0.075, M.chrome, x, y, z);
    cylinder(parent, radius * 0.7, 0.082, M.rubber, x, y, z + 0.012);
    const ringGeo = cached(`jackRing:${radius}`, () =>
      new THREE.TorusGeometry(radius * 0.78, 0.025, 5, 16));
    mesh(parent, ringGeo, M.chrome, x, y, z + 0.058);
  }

  function toggle(parent, x, y, z, small = false) {
    const r = small ? 0.105 : 0.16;
    cylinder(parent, r, 0.07, M.chrome, x, y, z, 6);
    const lever = cylinder(parent, 0.047, small ? 0.2 : 0.29,
      M.chrome, x, y - 0.065, z + 0.16, 8);
    lever.rotation.x = -0.55;
  }

  function tube(parent, points, radius, material, segments = 32) {
    return mesh(parent, new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points), segments, radius, 6, false
    ), material);
  }

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- hollow, softened cabinet ----------
  const sideGeometry = bag.own(cabinetGeometry());
  mesh(root, sideGeometry, M.tolex, -W / 2 + 0.1);
  mesh(root, sideGeometry, M.tolex, W / 2 - FRAME + 0.1);

  // Rounded top and bottom boards connect the two profiled side boards.
  const top = rounded(root, W - 0.24, 8.75, 0.55, 0.2, M.tolex,
    0, TOP - 0.275, -0.525, true);
  top.rotation.x = -Math.PI / 2;
  box(root, W - 0.75, 0.58, D - 0.28, M.tolex,
    0, FOOT_H + 0.29, 0, true);

  // Front uprights, bottom bumper, and recessed grille.
  const grilleBottom = FOOT_H + 0.58;
  const grilleTop = PANEL_BOTTOM - 0.06;
  const grilleH = grilleTop - grilleBottom;
  const grilleW = W - FRAME * 2;

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  for (const sign of [-1, 1]) {
    rounded(root, FRAME, grilleH + 0.2, 0.52, 0.15, M.tolex,
      sign * (W / 2 - FRAME / 2), grilleBottom + grilleH / 2, 4.74, true);
  }
  rounded(root, W - 0.2, 0.43, 0.5, 0.15, M.tolex,
    0, FOOT_H + 0.23, 4.76, true);

  plane(root, grilleW, grilleH, M.interior,
    0, grilleBottom + grilleH / 2, 4.55);

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const grilleGeo = bag.own(new THREE.PlaneGeometry(grilleW, grilleH));
  const guv = grilleGeo.attributes.uv;
  for (let i = 0; i < guv.count; i++) {
    guv.setXY(i, guv.getX(i) * grilleW / 6.4, guv.getY(i) * grilleH / 6.4);
  }
  mesh(root, grilleGeo, M.grille, 0, grilleBottom + grilleH / 2, 4.63);

  // A separate inclined panel frame makes every control follow the chamfer.
  const frontPanel = new THREE.Group();
  frontPanel.name = 'amp-front-panel';
  frontPanel.position.set(0, (PANEL_TOP + PANEL_BOTTOM) / 2, 4.45);
  frontPanel.rotation.x = PANEL_TILT;
  root.add(frontPanel);

  rounded(frontPanel, PANEL_W + 0.18, PANEL_H + 0.16, 0.24,
    0.12, M.tolex, 0, 0, -0.08, true);
  plane(frontPanel, PANEL_W, PANEL_H, M.panel, 0, 0, PANEL_FACE_Z);
  box(frontPanel, PANEL_W - 0.08, 0.038, 0.035, M.ivory,
    0, -PANEL_H / 2 + 0.025, 0.08);

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- front knobs: real 3D chicken heads ----------
  // Three InstancedMeshes (skirts, heads, raised inlays), nine instances
  // each. Pointer geometry points +Y, so rotating by -(setting-6)*PI/6
  // gives clockwise-from-top with setting 6 straight up (same result as the
  // old photo plane, which needed an extra +PI because its tip faced down).
  // Heads and skirts: deep glossy black bakelite (knob-1), crowned tops.
  const dummy = new THREE.Object3D();
  const knobY = PANEL_H * (0.5 - 109 / 256);

  const knobOutline = knobHeadOutline();
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const skirtGeo = bag.own(knobSkirtGeometry());
  const headGeo = bag.own(knobHeadGeometry(knobOutline));
  const knobInlayGeo = bag.own(knobInlayGeometry(knobOutline));
  const headMaterial = M.knobBlack;

  const skirts = bag.own(new THREE.InstancedMesh(skirtGeo, M.knobBlack, 9));
  const heads = bag.own(new THREE.InstancedMesh(headGeo, headMaterial, 9));
  const inlays = bag.own(new THREE.InstancedMesh(knobInlayGeo, M.inlay, 9));
  skirts.name = 'amp-knob-skirts';
  heads.name = 'amp-knobs';
  inlays.name = 'amp-knob-inlays';
  heads.userData.knob3d = true;
  heads.userData.knobHeight = KNOB_HEIGHT;
  for (const m of [skirts, heads, inlays]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  for (let i = 0; i < 9; i++) {
    dummy.position.set((KNOB_U[i] - 0.5) * PANEL_W, knobY, KNOB_Z);
    dummy.rotation.set(0, 0, -(KNOB_SETTINGS[i] - 6) * Math.PI / 6);
    dummy.updateMatrix();
    skirts.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    inlays.setMatrixAt(i, dummy.matrix);
  }
  for (const m of [skirts, heads, inlays]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }
  frontPanel.add(skirts, heads, inlays);

  // Procedural head + inlay geometry for the two rear-strip knobs below.
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const bodyGeo = bag.own(chickenHeadGeometry());
  const inlayGeo = bag.own(inlayGeometry());

  jack(frontPanel, (76 / 2048 - 0.5) * PANEL_W, knobY, 0.13, 0.24);
  const lampX = (1976 / 2048 - 0.5) * PANEL_W;
  // amp8 (Blake t174u/t178u): the bezel is now part of the swappable pilot (LED #2); only a thin chrome
  // seat stays flush on the panel (hidden under the default bezel, a base for any other pilot design).
  cylinder(frontPanel, 0.17, 0.01, M.chrome, lampX, knobY, 0.06);
  const gemGeo = cached('gem', () => new THREE.SphereGeometry(0.13, 12, 8));

  // Pilot mount: the pilot part (makePilotLight) is added here by mountAmp
  // after scaling, so its light distance is right and the bag never owns it.
  const pilotMount = new THREE.Group();
  pilotMount.name = 'amp-pilot-mount';
  pilotMount.position.set(lampX, knobY, 0.11);
  frontPanel.add(pilotMount);
  root.userData._pilotMount = pilotMount;

  // Blake's Zingaro script, a transparent cutout, on the slanted front panel
  // (a child of frontPanel, not root) where the old baked script was painted
  // out of panel.jpg. It sits right of PRESENCE, left of the jewel lamp and
  // above the red BPZ / 07/25 tape.
  if (tx.zingaro && tx.zingaro.image) {
    const lw = LOGO_W;
    const lh = lw * tx.zingaro.image.height / tx.zingaro.image.width;
    const logo = plane(frontPanel, lw, lh, M.logo, LOGO_X, LOGO_Y, LOGO_Z);
    logo.name = 'amp-zingaro-logo';
    logo.castShadow = false;
  }

  // Glaswerks grille badge: unchanged.
  if (tx.badge) {
    const bw = 6.9;
    const bh = bw * tx.badge.image.height / tx.badge.image.width;
    // amp10 (Blake t204u) 10l LOGO POP: the badge stands a hair off the grille (4.69 -> 4.735, 0.045 in) with a dark
    // outline (halo, 4% larger) and a small offset shadow (down-right, like a raised plate lit from above) just behind it.
    const bx = -grilleW / 2 + bw / 2 + 0.55, by = grilleTop - bh / 2 - 0.48;
    const halo = plane(root, bw * 1.04, bh * 1.04, M.badgeHalo, bx, by, 4.700);
    halo.castShadow = false; halo.receiveShadow = false; halo.renderOrder = 1;
    const bShadow = plane(root, bw, bh, M.badgeShadow, bx + 0.04, by - 0.075, 4.712);
    bShadow.castShadow = false; bShadow.receiveShadow = false; bShadow.renderOrder = 2;
    const badge = plane(root, bw, bh, M.badge, bx, by, 4.735);
    badge.castShadow = false;
    badge.renderOrder = 3;
  }

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- low, broad leather handle ----------
  // amp8 (Blake t174u/t178u, item 4): the carry handle (strap + stitching + end posts/caps) is built into its own
  // group 'amp-handle' (NOT merged into the root batches) so the look can be swapped with handle.setHandle()
  // like the pilot. Inside the group the pieces are batched per material (3 draws: leather, stitch, chrome).
  // The walk collider is plain data on the group: userData.amp8HandleCollider (see HANDLE COLLIDER below).
  // The four mounting screws stay in 'amp-top-hardware' (cabinet fixings; the amp7 screw probe measures them).
  const handleGroup = new THREE.Group();
  handleGroup.name = 'amp-handle';
  // amp9 (Blake t188u): DEFAULT handle = red handle #5 (ref/handle-5.png): deep cherry/oxblood leather strap,
  // domed top, rounded ends, cream saddle stitching (texture assets/handle-red5-amp9.webp), and at each end two
  // polished stadium end plates (one in front of, one behind the strap) with a Phillips screw each, plus a short
  // chrome post the strap wraps. Same footprint/spot as the amp8 strap (05-top.jpg). Draws: strap 1 + chrome 1.
  handleGroup.userData.amp9Handle = 'red-5';
  const H5 = { hw: 0.53, thTop: 0.15, thBot: 0.08, endR: 0.42 };   // half width (z), dome / belly thickness, end radius
  const handlePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.1, TOP + 0.26, 0),
    new THREE.Vector3(-3.75, TOP + 0.43, 0),
    new THREE.Vector3(-2.45, TOP + 1.22, 0),
    new THREE.Vector3(0, TOP + HANDLE_LIFT, 0),
    new THREE.Vector3(2.45, TOP + 1.22, 0),
    new THREE.Vector3(3.75, TOP + 0.43, 0),
    new THREE.Vector3(4.1, TOP + 0.26, 0)
  ]);
  const handleLen = handlePath.getLength();
  // plan-view rounding of the strap ends (1 in the middle, 0 at the tip) and a slight thinning there
  const h5Width = t => {
    const e = Math.min(t, 1 - t) * handleLen;
    return e >= H5.endR ? 1 : Math.sqrt(Math.max(0, 1 - (1 - e / H5.endR) ** 2));
  };
  const h5Thick = wf => 0.55 + 0.45 * wf;
  const hp = [], huv = [], hi = [];
  const handleSegments = 64, sectionSegments = 16;
  const sp = new THREE.Vector3(), st = new THREE.Vector3();
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  for (let i = 0; i <= handleSegments; i++) {
    // amp9 (Blake t188u): rings bunched toward the ends so the rounded strap ends stay round
    const t = 0.5 * (i / handleSegments) + 0.25 * (1 - Math.cos(Math.PI * i / handleSegments));
    handlePath.getPointAt(t, sp);
    handlePath.getTangentAt(t, st);
    const ux = -st.y, uy = st.x;                       // in-plane "up" of the section
    const wf = h5Width(t), tf = h5Thick(wf);
    for (let j = 0; j <= sectionSegments; j++) {
      const a = Math.PI + j / sectionSegments * Math.PI * 2;   // seam under the belly
      const sa = Math.sin(a), ca = Math.cos(a);
      const z = Math.sign(sa) * Math.abs(sa) ** 0.55 * H5.hw * wf;       // squarish sides
      const u = ca >= 0 ? ca * H5.thTop * tf                              // domed top
        : -(Math.abs(ca) ** 0.6) * H5.thBot * tf;                          // flatter belly
      hp.push(sp.x + ux * u, sp.y + uy * u, z);
      huv.push(t, 0.5 - z / (2 * H5.hw));                // image top = back (-z), bottom = front (+z)
      if (i < handleSegments && j < sectionSegments) {
        const a0 = i * (sectionSegments + 1) + j;
        const b0 = a0 + sectionSegments + 1;
        hi.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
  }
  const handleGeo = bag.own(new THREE.BufferGeometry());
  handleGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  handleGeo.setAttribute('uv', new THREE.Float32BufferAttribute(huv, 2));
  handleGeo.setIndex(hi);
  handleGeo.computeVertexNormals();
  mesh(handleGroup, handleGeo, M.leather5).name = 'amp-handle-strap';

  const topHardware = new THREE.Group();
  topHardware.position.y = TOP + 0.035;
  topHardware.rotation.x = -Math.PI / 2;
  root.add(topHardware);
  // amp8 (Blake t174u/t178u): the end caps + posts belong to the handle look (same frame as topHardware:
  // local x = x, local y = -z, local z = up from TOP + 0.035).
  const handleCaps = new THREE.Group();
  handleCaps.position.copy(topHardware.position);
  handleCaps.rotation.copy(topHardware.rotation);
  handleGroup.add(handleCaps);
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  for (const x of [-3.75, 3.75]) {
    // amp9 (Blake t188u): two stadium end plates per end (|z| 0.47..1.21, around the amp7 screw at |z| 0.94),
    // an upright ear on each plate's inner end and the chrome post (along z) through the strap's end loop.
    for (const side of [-1, 1]) {
      rounded(handleCaps, 0.5, 0.74, 0.06, 0.22, M.chrome, x, side * 0.84, 0);
      box(handleCaps, 0.22, 0.12, 0.34, M.chrome, x, side * 0.6, 0.17);
    }
    cylinder(handleCaps, 0.075, 1.32, M.chrome, x, 0, 0.3, 12).rotation.x = Math.PI / 2;
  }

  // HANDLE COLLIDER (amp8, Blake t174u/t178u): analytic, amp-local inches. A box (centre, half) is the footprint
  // + height; the optional profile {x[], y[]} is the walkable top height along x (piecewise linear, ascending x),
  // here sampled once from the strap's top edge so the walker follows the arch. A new handle model only has to
  // supply this object (a flat box top is used when it has no profile).
  {
    const px = [], py = [], tp = new THREE.Vector3(), tt = new THREE.Vector3();
    for (let i = 0; i <= 32; i++) {
      handlePath.getPointAt(i / 32, tp);
      handlePath.getTangentAt(i / 32, tt);
      // amp9 (Blake t188u): top of the red-5 dome (p + up * thTop * end thinning)
      const th = H5.thTop * h5Thick(h5Width(i / 32));
      px.push(+(tp.x - tt.y * th).toFixed(4));
      py.push(+(tp.y + tt.x * th).toFixed(4));
    }
    const order = px.map((_, i) => i).sort((a, b) => px[a] - px[b]);
    const sx = order.map(i => px[i]), sy = order.map(i => py[i]);
    const halfX = Math.max(-sx[0], sx[sx.length - 1]);
    const yTop = Math.max(...sy), yBot = TOP;
    handleGroup.userData.amp8HandleCollider = {
      centre: [0, (yTop + yBot) / 2, 0],
      half: [halfX, (yTop - yBot) / 2, H5.hw],   // amp9 (Blake t188u): red-5 strap half width
      profile: { x: sx, y: sy }
    };
  }
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  batchStatic(handleGroup, bag);
  handleGroup.traverse(o => {
    if (o.isMesh && o.name.startsWith('amp-batch-')) {
      o.name = o.material === M.chrome ? 'amp-handle-caps' : 'amp-handle-part';   // amp9 (Blake t188u): stitching is in the texture now
    }
    o.userData.keepSeparate = true;
  });
  handleGroup.userData.amp8BuiltIn = true;
  const handleMount = new THREE.Group();
  handleMount.name = 'amp-handle-mount';
  root.add(handleMount);
  handleMount.add(handleGroup);
  root.userData._handleMount = handleMount;
  root.userData._defaultHandle = handleGroup;
  // amp7 (Grok, Blake t164u "the screws on top of the amp are off"), measured on 05-top.jpg (flat top = 8.72" deep,
  // ~42 px/in): each handle end has TWO screws, one in front of and one behind the strap, ~1.87" apart (outside the
  // 0.8" strap), heads ~0.48" across; the four corner glides are ~0.72" washer-head screws inset 1.08" from the sides,
  // 2.5" from the back and 1.3" behind the front edge of the flat top (not on the chamfer). topHardware local y = -world z.
  for (const x of [-3.75, 3.75]) {
    // amp8 (Blake t174u/t178u): cap plate + post moved to the swappable 'amp-handle' group above.
    for (const y of [-0.94, 0.94]) screw(topHardware, x, y, 0.06, 0.16);
  }
  for (const x of [-W / 2 + 1.08, W / 2 - 1.08]) {
    for (const y of [2.51, -(TOP_FLAT_Z - 1.3)]) {
      cylinder(topHardware, 0.36, 0.05, M.chrome, x, y, 0);
      screw(topHardware, x, y, 0.03, 0.2);
    }
  }
  topHardware.userData.amp7Screws = { handle: 4, glides: 4 };
  topHardware.name = 'amp-top-hardware';

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- recessed Fender strap side handles ----------
  // Pocket (hole in the side board) + dark floor + chrome bezel around the
  // mouth + bowed chrome strap with embossed FENDER / F + two mounting
  // screws, and a separate washer-head screw mid-height toward the front.
  // amp8 (Blake t174u/t178u): the strap is now the Fender tilt-back leg (legs option #1): one shared
  // geometry + one material for both legs, mapped with the photo (leg-amp8.webp, alpha-tested outline).
  // The photo already carries the chrome reflections, so the material is only part metal (a full metal
  // would multiply the photo by the dark env and turn it grey), with a small self-lift from the map.
  const legMaterial = tx.leg
    ? lift(bag.own(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: tx.leg, alphaTest: 0.5,
      metalness: 0.45, roughness: 0.28, envMapIntensity: 1.1
    })), 0.22)
    : M.chrome;
  // Domed screw heads over the two photographed screws (texture rows 243 and 967 of 1024).
  const legScrewGeo = cached('legScrew', () => {
    const g = new THREE.SphereGeometry(0.085, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    g.scale(1, 1, 0.55);
    return g;
  });
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const legs = new THREE.Group();
  legs.name = 'amp-legs';
  legs.userData.amp8Legs = 'legs-1';
  root.add(legs);

  // amp9 (Blake t188u): flush legs on the outside of the side panels, deployed (amp tilted back on them).
  // One shared flat geometry built with its pivot at the origin; each leg group sits on its pivot bolt and is
  // swung foot-forward by the solved angle. Chrome pivot bolt + washer over the leg's upper screw, the stop screw
  // on the tolex touching the leg's front edge. The cabinet tilt itself is applied at the end of buildAmp.
  if (LEGS_FLUSH) {
    const dep = legDeployAngle(LEG_LEN_FLUSH);
    const flushGeo = bag.own(legGeometry(LEG_LEN_FLUSH, true, -dep.sPivot));
    const front = LEG_STANDOFF + LEG_TH + 0.012;            // leg front face (+ crown) above the tolex
    const sinP = Math.sin(dep.phi), cosP = Math.cos(dep.phi);
    legs.userData.amp9LegsFlush = true;
    legs.userData.amp10Physics = 'cg-behind-rear-contact';   // amp10 (Blake t196u) 10b2
    legs.userData.amp10LegsBack = true;   // amp10 (Blake t196u) 10b: legs swing back behind the amp
    legs.userData.amp9Deploy = {
      legLen: LEG_LEN_FLUSH, pivotY: PIVOT_Y, pivotZ: LEG_PIVOT_Z, pivotToFoot: +dep.sPivot.toFixed(3),
      swingDeg: +THREE.MathUtils.radToDeg(dep.phi).toFixed(3),
      fromVerticalDeg: +THREE.MathUtils.radToDeg(dep.alpha).toFixed(3),
      boltWorldY: +dep.ybw.toFixed(3), short: dep.short, standoff: LEG_STANDOFF
    };
    if (dep.short) console.warn('[amp] tilt legs too short to reach the floor; hanging plumb');
    for (const side of [-1, 1]) {
      // Pivot frame on the side (not swung): local x across (viewer's right from outside), y up, +z out.
      // Cabinet forward (+z) is local -side * x.
      const mount = new THREE.Group();
      mount.position.set(side * (W / 2), PIVOT_Y, LEG_PIVOT_Z);   // amp10 (Blake t196u) 10b
      mount.rotation.y = side * Math.PI / 2;
      root.add(mount);

      const legGroup = new THREE.Group();
      legGroup.name = side < 0 ? 'amp-leg-left' : 'amp-leg-right';
      legGroup.position.copy(mount.position);
      legGroup.rotation.set(0, side * Math.PI / 2, -side * dep.phi);   // XYZ: swing in the side plane first
      legGroup.userData.amp9Side = side;
      legs.add(legGroup);
      const leg = mesh(legGroup, flushGeo, legMaterial);
      leg.name = `${legGroup.name}-bar`;
      leg.userData.keepSeparate = true;   // 1 draw per leg; geometry + material shared
      // Lower photographed screw rides on the bar (batched with the rest; the pose is static).
      mesh(legGroup, legScrewGeo, M.chrome, 0, (1 - 967 / 1024) * LEG_LEN_FLUSH - dep.sPivot, front + 0.005);

      // Pivot bolt: washer on the bar + hex-ish head + dome.
      cylinder(mount, 0.3, 0.035, M.chrome, 0, 0, front + 0.0175, 20);
      cylinder(mount, 0.17, 0.06, M.chrome, 0, 0, front + 0.035 + 0.03, 6);
      mesh(mount, legScrewGeo, M.chrome, 0, 0, front + 0.095);

      // Stop screw (the photo's loose washer-head screw), forward of the leg, its washer touching the front edge.
      const hw = LEG_HW, r = 0.19 * 1.5 + 0.002;
      // amp10 (Blake t196u) 10b: the legs swing back (sinP < 0), so the stop sits behind the leg's rear edge
      // (it blocks the leg from swinging further back); phi = -(TILT + alpha).
      const fwd = STOP_BELOW * sinP - (hw + r) * cosP;
      const up = -STOP_BELOW * cosP - (hw + r) * sinP;
      screw(mount, -side * fwd, up, 0.0225, 0.19);
    }
  } else {   // amp8 inlaid legs (kept for reference; not drawn while LEGS_FLUSH)
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const legGeo = bag.own(legGeometry());
  const bezelShape = pocketOutline(new THREE.Shape(), 0,
    POCKET_HW + 0.13, POCKET_Y0 - 0.13, POCKET_Y1, POCKET_TIP + 0.49);
  bezelShape.holes.push(pocketOutline(new THREE.Path(), 0,
    POCKET_HW, POCKET_Y0, POCKET_Y1, POCKET_TIP));
  const bezelGeo = bag.own(new THREE.ExtrudeGeometry(bezelShape, {
    depth: 0.035, steps: 1, bevelEnabled: false
  }));

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  for (const side of [-1, 1]) {
    // Local: x across the side (viewer's right from outside), y up, +z out.
    const sideGroup = new THREE.Group();
    sideGroup.position.set(side * (W / 2), 0, HANDLE_Z);
    sideGroup.rotation.y = side * Math.PI / 2;
    root.add(sideGroup);

    // Pocket floor sits behind the hole in the side board.
    box(sideGroup, 1.9, 13.4, 0.2, M.rubber,
      0, (POCKET_Y0 + POCKET_TIP) / 2, -POCKET_DEPTH - 0.1);
    mesh(sideGroup, bezelGeo, M.chrome, 0, 0, 0.004);

    // amp8 (Blake t174u/t178u): the leg. side -1 is the amp's left as seen from the front.
    const legGroup = new THREE.Group();
    legGroup.name = side < 0 ? 'amp-leg-left' : 'amp-leg-right';
    legGroup.position.copy(sideGroup.position);
    legGroup.rotation.copy(sideGroup.rotation);
    legs.add(legGroup);
    const leg = mesh(legGroup, legGeo, legMaterial);
    leg.name = `${legGroup.name}-bar`;
    leg.userData.keepSeparate = true;   // stays a named part (1 draw per leg; geometry + material shared)
    for (const t of [243 / 1024, 967 / 1024]) {
      const s = (1 - t) * LEG_LEN;
      mesh(sideGroup, legScrewGeo, M.chrome, 0, STRAP_Y0 + s, legLiftZ(s) + LEG_TH / 2 + 0.005);
    }

    // Loose washer-head screw: mid-height, forward of the strap.
    const washerGroup = new THREE.Group();
    washerGroup.position.set(side * (W / 2), WASHER_Y, WASHER_Z);
    washerGroup.rotation.y = side * Math.PI / 2;
    root.add(washerGroup);
    screw(washerGroup, 0, 0, 0.0225, 0.19);
  }
  }   // amp9 (Blake t188u): end of the !LEGS_FLUSH (amp8 inlaid legs) branch

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- bottom corner protectors and feet ----------
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const cap = new THREE.Group();
      cap.position.set(side * (W / 2 + 0.01), FOOT_H + 0.37, end * 4.53);
      cap.rotation.y = side * Math.PI / 2;
      root.add(cap);
      rounded(cap, 0.9, 0.65, 0.075, 0.2, M.chrome);
      screw(cap, 0, 0.09, 0.065, 0.12);
      // Return over the front/rear edge and underneath the cabinet.
      rounded(root, 0.57, 0.62, 0.075, 0.16, M.chrome,
        side * (W / 2 - 0.26), FOOT_H + 0.31, end * 4.985);
      box(root, 0.65, 0.055, 0.75, M.chrome,
        side * (W / 2 - 0.28), FOOT_H + 0.015, end * 4.55);

      const foot = cylinder(root, FOOT_R, FOOT_H, M.rubber,
        side * (W / 2 - 1.15), FOOT_H / 2, end * (D / 2 - 1.15), 14);
      foot.rotation.x = -Math.PI / 2;
    }
  }

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- rear: real opening, recessed strip and speaker ----------
  const rearGroup = new THREE.Group();
  rearGroup.rotation.y = Math.PI;
  rearGroup.position.z = -4.87;
  root.add(rearGroup);

  const rearBottom = FOOT_H + 0.22;
  const rearTop = TOP - 3.3;
  const portY = FOOT_H + 7.3;
  const portW = 10.3, portH = 7.5;

  // Shape/Path have no translate() in r170; offset the outline coordinates.
  const rearShape = roundedShape(
    W - 1.0, rearTop - rearBottom, 0.15, (rearTop + rearBottom) / 2
  );
  const portHole = new THREE.Path();
  portHole.absellipse(0, portY, portW / 2, portH / 2, 0, Math.PI * 2, true);
  rearShape.holes.push(portHole);
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const rearGeo = bag.own(new THREE.ExtrudeGeometry(rearShape, {
    depth: 0.26, steps: 1, curveSegments: 32, bevelEnabled: false
  }));

  // rear.jpg is a full-cabinet layout, including the name. Preserve its
  // coordinates on the back board; remove its printed speaker with the hole.
  const rp = rearGeo.attributes.position;
  const ru = rearGeo.attributes.uv;
  for (let i = 0; i < rp.count; i++) {
    ru.setXY(i, rp.getX(i) / W + 0.5, (rp.getY(i) - FOOT_H) / H);
  }
  mesh(rearGroup, rearGeo, M.rear);

  const rimShape = new THREE.Shape();
  rimShape.absellipse(0, portY, portW / 2 + 0.11, portH / 2 + 0.11,
    0, Math.PI * 2, false);
  const rimHole = new THREE.Path();
  rimHole.absellipse(0, portY, portW / 2, portH / 2,
    0, Math.PI * 2, true);
  rimShape.holes.push(rimHole);
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const rimGeo = physicalUV(new THREE.ExtrudeGeometry(rimShape, {
    depth: 0.29, steps: 1, curveSegments: 32,
    bevelEnabled: true, bevelThickness: 0.035,
    bevelSize: 0.035, bevelSegments: 1
  }));
  mesh(rearGroup, rimGeo, M.tolex, 0, 0, -0.01);

  // Dark interior behind the speaker; no solid cabinet can occlude the port.
  plane(rearGroup, W - 1.5, rearTop - FOOT_H, M.interior,
    0, (rearTop + FOOT_H) / 2, -5.8);

  // speaker.jpg already includes the basket and the correctly spelled label.
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const speakerGeo = bag.own(new THREE.CircleGeometry(5.55, 48));
  mesh(rearGroup, speakerGeo, M.speaker, 0, portY, -1.05);
  cylinder(rearGroup, 3.53, 0.42, M.satin, 0, portY, -0.94, 40);

  // Apply the central part of the existing speaker texture to the raised
  // magnet face, retaining the full basket image behind it.
  const magnetGeo = bag.own(new THREE.CircleGeometry(3.5, 40));
  const mu = magnetGeo.attributes.uv;
  for (let i = 0; i < mu.count; i++) {
    mu.setXY(i,
      0.5 + (mu.getX(i) - 0.5) * 0.67,
      0.5 + (mu.getY(i) - 0.5) * 0.67);
  }
  mesh(rearGroup, magnetGeo, M.speaker, 0, portY, -0.71);

  // Three restrained cable loops, entirely inside the rear opening.
  const cablePoints = [];
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  for (let i = 0; i <= 156; i++) {
    const t = i / 156;
    const a = t * Math.PI * 6 + 0.55;
    const radius = 3.5 - t * 0.9;
    cablePoints.push(new THREE.Vector3(
      Math.cos(a) * radius,
      portY - 0.25 + Math.sin(a) * radius * 0.78,
      -0.3 + t * 0.2
    ));
  }
  // amp13 (Blake t215u): "take away the coiled up cord in the back of the amp" - the cable loops and the tie are no longer built
  // (cablePoints above is kept, unused, in case the cord comes back).
  // tube(rearGroup, cablePoints, 0.085, M.rubber, 156);
  // const tie = box(rearGroup, 0.15, 0.56, 0.15, M.rubber, -2.5, portY + 1.55, -0.15);
  // tie.rotation.z = -0.45;
  rounded(rearGroup, 0.65, 1.15, 0.035, 0.03, M.satin,
    -5.35, portY - 2.15, 0.285);

  // Approximately fourteen perimeter screw heads, matching the back panel.
  for (const x of [-W / 2 + 0.78, W / 2 - 0.78]) {
    for (const y of [2, 5.6, 10.6, rearTop - 0.55]) {
      screw(rearGroup, x, FOOT_H + y, 0.29, 0.12);
    }
  }
  for (const x of [-7, -3.5, 0, 3.5, 7]) {
    screw(rearGroup, x, FOOT_H + 0.55, 0.29, 0.12);
  }
  screw(rearGroup, 0, rearTop - 0.3, 0.29, 0.1);

  // One-inch top lip, then the independent recessed black control strip.
  rounded(rearGroup, W - 0.45, 0.93, 0.45, 0.13, M.tolex,
    0, TOP - 0.47, 0.05, true);

  const strip = new THREE.Group();
  strip.position.set(0, TOP - 1 - 2.1 / 2, -0.28);
  rearGroup.add(strip);
  const stripW = W - 1.1;
  box(strip, stripW + 0.1, 2.25, 0.18, M.interior, 0, 0, -0.12);
  plane(strip, stripW, 2.1, M.rearStrip, 0, 0, 0.005);

  // Positions come from the supplied rear-strip.jpg, not the old generator.
  const sx = u => (u - 0.5) * stripW;
  const sy = v => (0.5 - v) * 2.1;
  rounded(strip, 0.82, 0.5, 0.17, 0.08, M.rubber,
    sx(0.115), sy(0.51), 0.12);
  cylinder(strip, 0.185, 0.15, M.blackGloss, sx(0.194), sy(0.51), 0.09);
  // amp13 (Blake t214u): toggle(strip, sx(0.245|0.293), ...) replaced by the PRISM metal toggles below
  for (const u of [0.436, 0.495, 0.633, 0.689, 0.852]) {
    jack(strip, sx(u), sy(0.51), 0.08, 0.18);
  }
  for (const u of [0.579, 0.746]) {
    const k = mesh(strip, bodyGeo, M.knobBlack, sx(u), sy(0.51), 0.06);
    k.scale.setScalar(0.76);
    k.rotation.z = -0.9;
    const mark = mesh(strip, inlayGeo, M.ivory, sx(u), sy(0.51), 0.06);
    mark.scale.setScalar(0.76);
    mark.rotation.z = -0.9;
  }
  // amp13 (Blake t214u): the four rear-strip toggles (On, On, and the two small Overdrive / Boost ones) are PRISM's metal toggle:
  // one InstancedMesh (one draw), shared geometry + metal material. The old toggle() lever meshes are no longer built here.
  const prismT = new THREE.InstancedMesh(bag.own(prismToggleGeometry()), M.prismMetal, 4);
  prismT.name = 'amp-toggle-prism';
  prismT.userData.parts = ['bezel', 'nut', 'lever', 'ball'];
  prismT.userData.keepSeparate = true;
  prismT.castShadow = false; prismT.receiveShadow = false;
  {
    const dm = new THREE.Object3D();
    [[sx(0.245), sy(0.51), 0.16], [sx(0.293), sy(0.51), 0.16], [sx(0.905), sy(0.275), 0.105], [sx(0.905), sy(0.715), 0.105]].forEach(([x, y, r], i) => {
      dm.position.set(x, y, 0.08); dm.scale.setScalar(r); dm.rotation.set(0, 0, 0); dm.updateMatrix();
      prismT.setMatrixAt(i, dm.matrix);
    });
    prismT.instanceMatrix.needsUpdate = true;
    prismT.computeBoundingSphere();
  }
  strip.add(prismT);
  // amp13 (Blake t214u): "The blue dot needs to go away" - the royal-blue rear-strip LED (amp-rear-led, M.jewel emissive sphere) is no longer built.
  // (The rear strip never had a halo plane or a point light; the FRONT pilot, amp-pilot, is unchanged.)
  // const led = mesh(strip, gemGeo, M.jewel, sx(0.73), sy(0.165), 0.055);
  for (const x of [-stripW / 2 + 0.12, stripW / 2 - 0.12]) {
    for (const y of [-0.9, 0.9]) screw(strip, x, y, 0.045, 0.065);
  }

  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  // ---------- existing scaffold's contact shadow ----------
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext('2d');
  if (!context) throw new Error('amp: canvas 2D unavailable');
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(0,0,0,0.48)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadowTexture = bag.own(new THREE.CanvasTexture(shadowCanvas));
  const shadowMaterial = bag.own(new THREE.MeshBasicMaterial({
    map: shadowTexture, transparent: true, depthWrite: false,
    opacity: 0.75, toneMapped: false
  }));
  const blob = plane(root, W * 1.25, D * 1.35, shadowMaterial, 0, 0.012, 0);
  blob.rotation.x = -Math.PI / 2;
  blob.castShadow = blob.receiveShadow = false;
  blob.userData.keepSeparate = true;

  // Invisible proxy is used directly for picking, so cloth alpha and small
  // hardware never create unreliable tap targets.
  const proxyMaterial = bag.own(new THREE.MeshBasicMaterial({ visible: false }));
  const proxy = mesh(root,
    new THREE.BoxGeometry(W + 0.6, H + HANDLE_LIFT + FOOT_H + 0.3, D + 0.6),
    proxyMaterial, 0, (H + HANDLE_LIFT + FOOT_H) / 2, 0);
  proxy.name = 'amp-proxy';
  proxy.userData.id = AMP_ID;
  proxy.userData.keepSeparate = true;
  proxy.castShadow = proxy.receiveShadow = false;

  root.userData._proxy = proxy;
  root.userData._lookAt = new THREE.Vector3(0, FOOT_H + H * 0.53, 0);

  // amp9 (Blake t188u): the whole cabinet (everything but the floor shadow) goes in 'amp-cabinet', tilted back
  // AMP_TILT_DEG about the rear-bottom line (TILT_M). Batched first, with root + cabinet at identity, so the
  // batches are in cabinet-local inches (the frame ampWalkBox() and amp-walk.js use); the legs inside it already
  // carry their solved swing. root stays the host's upright floor frame (feet / leg feet / rear edge at y = 0).
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  const cabinet = new THREE.Group();
  cabinet.name = 'amp-cabinet';
  for (const child of [...root.children]) if (child !== blob) cabinet.add(child);
  root.add(cabinet);
  // amp9 (Blake t188u) 9g: pieces reaching floor level (the feet, cabinet-local min y < FOOT_H + 0.05) batch apart
  // from the rest of their material. One merged box spanning the front feet (y = 0) and the rear overhang (z -5.2,
  // behind the tilt line) had an empty corner that the 12 deg tilt carried 0.6 below the floor (harness GROUND).
  // amp9 (Blake t188u) 9g2: also split pieces reaching behind the tilt line (min z < TILT_Z) from the rest: a
  // bucket whose pieces all start at/after TILT_Z only rises under the tilt, so its box can't dip below the floor
  // (left alone, batch 105 combined a 1.16" low front piece with the rear overhang: box corner -0.095).
  const lowBox = new THREE.Box3();
  const rearBuckets = new Map();   // amp10 (Blake t196u) 10b
  yield;   // amp10 (Blake t196u) 10h: slice point (buildAmpGen)
  batchStatic(cabinet, bag, (o) => {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    lowBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    // amp10 (Blake t196u) 10b: at 20 deg the 'rear' split was not enough (a merged chrome batch holding the leg screws far
    // behind the tilt line had its box corner 1.0" under the floor). Pieces behind the tilt line now go greedily into
    // the first bucket (per material) whose union box corner (min y, min z) still lands at/above the floor after the tilt.
    const low = lowBox.min.y < FOOT_H + 0.05 ? 'low' : '';
    if (!(lowBox.min.z < TILT_Z - 1e-3)) return low;
    const list = rearBuckets.get(o.material.uuid) || [];
    rearBuckets.set(o.material.uuid, list);
    let id = list.findIndex(bk => {
      const y = Math.min(bk.y, lowBox.min.y), z = Math.min(bk.z, lowBox.min.z);
      return y * Math.cos(TILT) + (z - TILT_Z) * Math.sin(TILT) >= -1e-3;
    });
    if (id < 0) { id = list.length; list.push({ y: Infinity, z: Infinity }); }
    list[id].y = Math.min(list[id].y, lowBox.min.y); list[id].z = Math.min(list[id].z, lowBox.min.z);
    return low + 'rear' + id;
  });
  TILT_M.decompose(cabinet.position, cabinet.quaternion, cabinet.scale);
  cabinet.updateMatrix();
  root.userData._lookAt.applyMatrix4(TILT_M);
  root.userData._cabinet = cabinet;
  root.userData.amp9Tilt = AMP_TILT_DEG;
  cabinet.userData.amp10Pivot = 'rear-bottom-edge';   // amp10 (Blake t196u) 10b: see the legDeployAngle note (front-edge pivot is rigidly impossible)
  root.updateMatrixWorld(true);
  return root;
}

/*
 * Amp-owned soft light rig ("It's dark"). Both lights are children of the
 * amp root (they move with it), never cast shadows, use decay 0 and a
 * cutoff distance (local inches x world scale) so they fade out before the
 * guitar. Key: warm-white from above-front, cone just wide enough for the
 * amp. Rim: weak cool light from behind-left, short reach.
 */
function addLightRig(root, scale, boost) {
  const key = new THREE.SpotLight(0xfff0dc, 1.5 * boost, 90 * scale, 0.32, 0.45, 0);
  key.name = 'amp-key-light';
  key.position.set(0, 46, 38);
  key.target.position.set(0, 9.5, 0.5);
  key.castShadow = false;
  key.userData.baseIntensity = 1.5;

  const rim = new THREE.SpotLight(0xc9d8ff, 1.1 * boost, 64 * scale, 0.3, 0.6, 0);
  rim.name = 'amp-rim-light';
  rim.position.set(-26, 36, -30);
  rim.target.position.set(0, 12, 0);
  rim.castShadow = false;
  rim.userData.baseIntensity = 1.1;

  key.target.name = 'amp-key-light-target';
  rim.target.name = 'amp-rim-light-target';
  root.add(key, key.target, rim, rim.target);
  root.updateMatrixWorld(true);
  return [key, rim];
}

/*
 * Walkable cabinet surface for amp-walk.js, in amp-LOCAL inches (front +Z,
 * feet at y=0). The tolex shell only: side boards span the full W, top and
 * bottom boards span FOOT_H..TOP, the profile spans the full depth D. The
 * bottom face (yMin) is never walkable: it sits on the feet. Extras describe
 * where the flat top ends at the slanted control-panel chamfer, the front
 * face below the panel, and the leather handle on top.
 */
export function ampWalkBox() {
  return {
    xMin: -W / 2, xMax: W / 2,
    yMin: FOOT_H, yMax: TOP,
    zMin: -D / 2, zMax: D / 2,
    edgeRadius: 0.2,
    // Flat top face ends here; forward of it the panel chamfer slopes down.
    topZMax: 3.72,
    // Front face (grille + rails) is vertical from yMin up to here.
    frontYMax: PANEL_BOTTOM,
    panelTopY: PANEL_TOP,
    handle: { halfX: 4.15, topY: TOP + HANDLE_LIFT, halfZ: 0.53 }   // amp9 (Blake t188u): red-5 strap is 1.06 in wide
  };
}

/*
 * Camera fitting. Projects the eight corners of the amp's bounding box
 * (world space) against the camera's actual horizontal AND vertical frustum,
 * so a narrow portrait phone is limited by width and a wide desktop by
 * height. Returns the distance from `look` along `dir` (unit vector from
 * the look point toward the camera) at which everything fits with `margin`.
 */
function ampCorners(matrix) {
  const out = [];
  for (const x of [-1, 1]) {
    for (const y of [0, 1]) {
      for (const z of [-1, 1]) {
        out.push(new THREE.Vector3(
          x * (W / 2 + 0.35),
          y * (H + FOOT_H + HANDLE_LIFT + 0.2),
          z * (D / 2 + 0.35)
        ).applyMatrix4(TILT_M).applyMatrix4(matrix));   // amp9 (Blake t188u): the box of the TILTED cabinet
      }
    }
  }
  return out;
}

function fitDistance(camera, look, dir, corners, margin = 0.08) {
  const up = Math.abs(dir.y) > 0.98
    ? new THREE.Vector3(0, 0, -1)
    : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const trueUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  const fov = THREE.MathUtils.degToRad(camera.fov || 42);
  const tanV = Math.tan(fov / 2) * (1 - margin) / (camera.zoom || 1);
  const tanH = tanV * (camera.aspect || 1);
  const rel = new THREE.Vector3();
  let d = 0;
  for (const c of corners) {
    rel.copy(c).sub(look);
    const depth = rel.dot(dir);
    d = Math.max(d,
      depth + Math.abs(rel.dot(right)) / tanH,
      depth + Math.abs(rel.dot(trueUp)) / tanV);
  }
  return d;
}

/*
 * Host helper for a home framing that fits any aspect. Uses the same
 * scale / position / rotation the host passes to mountAmp, so it also works
 * when the amp failed to build. `dir` is in the amp's local frame (+z is
 * the front); `lookY` is in local inches above the feet.
 */
export function fitAmpCamera(camera, opts = {}) {
  const scale = opts.scale ?? 1;
  const p = opts.position || {};
  const rotY = typeof opts.rotation === 'number'
    ? opts.rotation
    : (opts.rotation?.y ?? 0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
    q,
    new THREE.Vector3(scale, scale, scale)
  );
  const look = new THREE.Vector3(0, opts.lookY ?? (H + FOOT_H) * 0.5, 0)
    .applyMatrix4(m);
  const d = opts.dir || [0.44, 0.2, 0.88];
  const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize().applyQuaternion(q);
  const distance = fitDistance(camera, look, dir, ampCorners(m), opts.margin ?? 0.08);
  return { look, position: look.clone().addScaledVector(dir, distance), distance };
}

function attachExplore(handle, camera, renderer, opts) {
  if (!camera || !renderer?.domElement) return noop;

  const el = renderer.domElement;
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const dummyQuaternion = new THREE.Quaternion();
  const spherical = new THREE.Spherical(38, 1.15, 0.25);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const touches = new Map();
  const listeners = [];
  let dragging = false, lastX = 0, lastY = 0;
  let gestureTravel = 0, gestureStart = 0, pinchDistance = 0;
  let minimumRadius = 18, maximumRadius = 130;
  let previousTouchAction = '';
  let lastAspect = 0, lastFit = 0;

  // Optional explore driver (amp-walk.js). While driverActive, the built-in
  // orbit is idle and the driver owns the camera.
  let driver = null;
  let driverActive = false;

  const saved = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    fov: camera.fov, near: camera.near, far: camera.far,
    zoom: camera.zoom,
    mode: 'show', hadClass: false
  };

  function listen(node, type, callback, options) {
    node.addEventListener(type, callback, options);
    listeners.push(() => node.removeEventListener(type, callback, options));
  }

  function worldLook() {
    const root = handle.object3d;
    root.updateWorldMatrix(true, false);
    return target.copy(root.userData._lookAt).applyMatrix4(root.matrixWorld);
  }

  function rootScale() {
    handle.object3d.getWorldScale(worldScale);
    return Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
  }

  // Distance at which the whole amp fits from the current orbit direction,
  // using the live aspect (horizontal fov limits on portrait phones).
  function fitNow() {
    const root = handle.object3d;
    root.updateWorldMatrix(true, false);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, spherical.phi, spherical.theta);
    return fitDistance(camera, worldLook().clone(), dir, ampCorners(root.matrixWorld), 0.08);
  }

  function setLimits(fit) {
    const scale = rootScale();
    minimumRadius = Math.max(6 * scale, fit * 0.35);
    maximumRadius = Math.max(fit * 3, 80 * scale);
  }

  function emitMode(mode) {
    if (!document.body) return;
    document.body.dataset.mode = mode;
    document.dispatchEvent(new CustomEvent('zg:mode', { detail: mode }));
  }

  function applyCam() {
    if (!handle.exploring || !handle.object3d) return;
    // Refit when the host changes the aspect (rotation / resize), keeping
    // the user's relative zoom.
    if (camera.aspect !== lastAspect) {
      const fit = fitNow();
      if (lastFit > 0 && fit > 0) spherical.radius *= fit / lastFit;
      setLimits(fit);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, minimumRadius, maximumRadius);
      lastFit = fit;
      lastAspect = camera.aspect;
    }
    offset.setFromSpherical(spherical);
    camera.position.copy(worldLook()).add(offset);
    camera.lookAt(target);
    // Projection changes belong to explore/resize, not every animation frame.
  }

  // Built-in orbit start (the fallback when no driver is set).
  function startOrbit() {
    const root = handle.object3d;
    const scale = rootScale();
    camera.fov = 42;
    camera.zoom = 1;

    // Orbit start: a little above, slightly off the front-left.
    spherical.phi = 1.15;
    root.getWorldQuaternion(dummyQuaternion);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(dummyQuaternion);
    spherical.theta = Math.atan2(front.x, front.z) + 0.3;

    const fit = fitNow();
    setLimits(fit);
    spherical.radius = fit;
    lastFit = fit;
    lastAspect = camera.aspect;

    camera.near = Math.max(0.02, scale * 0.08);
    camera.far = Math.max(saved.far, maximumRadius * 5);
    camera.updateProjectionMatrix();
  }

  function pinchLength() {
    const values = [...touches.values()];
    return values.length >= 2
      ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)
      : 0;
  }

  function down(e) {
    if (driverActive) return;
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    if (!touches.size) {
      gestureTravel = 0;
      gestureStart = performance.now();
    }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastX = e.clientX;
    lastY = e.clientY;
    dragging = touches.size === 1;
    pinchDistance = pinchLength();
    if (handle.exploring) {
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }

  function move(e) {
    if (driverActive) return;
    if (!touches.has(e.pointerId)) return;
    const old = touches.get(e.pointerId);
    const dx = e.clientX - old.x, dy = e.clientY - old.y;
    gestureTravel += Math.abs(dx) + Math.abs(dy);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!handle.exploring) return;

    if (touches.size >= 2) {
      const distance = pinchLength();
      if (distance > 0 && pinchDistance > 0) {
        spherical.radius = THREE.MathUtils.clamp(
          spherical.radius * pinchDistance / distance, minimumRadius, maximumRadius);
      }
      pinchDistance = distance;
      dragging = false;
    } else if (dragging) {
      spherical.theta -= (e.clientX - lastX) * 0.006;
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi - (e.clientY - lastY) * 0.005, 0.18, 1.68);
    }
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  function up(e) {
    touches.delete(e.pointerId);
    pinchDistance = 0;
    dragging = false;
    if (touches.size === 1) {
      const remaining = touches.values().next().value;
      lastX = remaining.x;
      lastY = remaining.y;
      dragging = true;
    }
    try {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  function wheel(e) {
    if (driverActive) return;
    if (!handle.exploring) return;
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
    spherical.radius = THREE.MathUtils.clamp(
      spherical.radius * Math.exp(THREE.MathUtils.clamp(delta * 0.001, -0.5, 0.5)),
      minimumRadius, maximumRadius);
    e.preventDefault();
  }

  function click(e) {
    if (handle.exploring || !handle.object3d || opts.clickToExplore === false) return;
    if (gestureTravel > 7 || (gestureStart && performance.now() - gestureStart > 700)) return;
    const bounds = el.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pointer.set(
      (e.clientX - bounds.left) / bounds.width * 2 - 1,
      -(e.clientY - bounds.top) / bounds.height * 2 + 1);
    handle.object3d.updateWorldMatrix(true, true);
    ray.setFromCamera(pointer, camera);
    if (ray.intersectObject(handle.object3d.userData._proxy, false).length) {
      handle.explore();
    }
  }

  function keydown(e) {
    if (e.key === 'Escape' && handle.exploring) handle.exit();
  }

  function cancelGesture() {
    touches.clear();
    dragging = false;
    pinchDistance = 0;
  }

  // Contract A: driver = { enter(opts), exit(), tick(dt, camera), dispose?() }.
  // null restores the built-in orbit.
  handle.driver = null;
  handle.useDriver = next => {
    if (handle.exploring && driverActive) handle.exit();
    driver = next && typeof next.enter === 'function' ? next : null;
    handle.driver = driver;
    return handle;
  };

  handle.explore = exploreOpts => {
    if (!handle.object3d || handle.exploring) return;
    saved.position.copy(camera.position);
    saved.quaternion.copy(camera.quaternion);
    saved.fov = camera.fov;
    saved.near = camera.near;
    saved.far = camera.far;
    saved.zoom = camera.zoom;
    saved.mode = document.body?.dataset.mode || 'show';
    saved.hadClass = document.body?.classList.contains('zg-amp') || false;
    previousTouchAction = el.style.touchAction;
    el.style.touchAction = 'none';
    cancelGesture();

    try {
      window.__dbg?.cam?.(
        camera.position.x, camera.position.y, camera.position.z,
        worldLook().x, target.y, target.z, 42);
    } catch (_) {}

    if (driver) {
      handle.exploring = true;
      document.body?.classList.add('zg-amp');
      emitMode('amp');
      driverActive = false;
      try {
        driver.enter(exploreOpts && typeof exploreOpts === 'object' && !exploreOpts.type
          ? exploreOpts : {});
        driverActive = true;
        return;
      } catch (error) {
        console.warn('[amp] explore driver failed to enter; using orbit', error);
      }
      startOrbit();
      applyCam();
      return;
    }

    startOrbit();
    handle.exploring = true;
    document.body?.classList.add('zg-amp');
    emitMode('amp');
    applyCam();
  };

  handle.exit = () => {
    if (!handle.exploring) return;
    if (driverActive) {
      driverActive = false;
      try { driver?.exit?.(); } catch (error) {
        console.warn('[amp] explore driver failed to exit', error);
      }
    }
    handle.exploring = false;
    cancelGesture();
    el.style.touchAction = previousTouchAction;
    if (!saved.hadClass) document.body?.classList.remove('zg-amp');

    // Let the guitar host resume its own camera loop.
    try { window.__dbg?.show?.(); } catch (_) {}

    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.fov = saved.fov;
    camera.near = saved.near;
    camera.far = saved.far;
    camera.zoom = saved.zoom;
    camera.updateProjectionMatrix();
    emitMode(saved.mode);
  };

  handle._exploreTick = (dt, cam) => {
    if (driverActive) {
      try {
        driver.tick(dt, cam || camera);
      } catch (error) {
        // Driver failure falls back to the orbit; the guitar is untouched.
        console.warn('[amp] explore driver tick failed; using orbit', error);
        driverActive = false;
        try { driver?.exit?.(); } catch (_) {}
        try { startOrbit(); } catch (_) {}
      }
      return;
    }
    applyCam();
  };

  try {
    listen(el, 'pointerdown', down);
    listen(window, 'pointermove', move, { passive: false });
    listen(window, 'pointerup', up);
    listen(window, 'pointercancel', up);
    listen(window, 'blur', cancelGesture);
    listen(el, 'wheel', wheel, { passive: false });
    listen(el, 'click', click);
    listen(window, 'keydown', keydown);
  } catch (error) {
    for (const remove of listeners) remove();
    throw error;
  }

  return () => {
    cancelGesture();
    for (const remove of listeners.splice(0)) remove();
    handle._exploreTick = noop;
    if (driver) {
      try { driver.dispose?.(); } catch (error) {
        console.warn('[amp] explore driver dispose failed', error);
      }
    }
    driver = null;
    driverActive = false;
    handle.driver = null;
  };
}

export async function mountAmp(scene, camera, renderer, opts = {}) {
  opts = opts || {};
  const handle = {
    id: AMP_ID,
    object3d: null,
    exploring: false,
    explore: noop,
    exit: noop,
    dispose: noop,
    driver: null,
    useDriver: noop,
    pilot: null,
    setPilot: noop,
    handlePart: null,   // amp8 (Blake t174u/t178u): the carry-handle visual group ('amp-handle')
    setHandle: noop,
    cabinet: null,      // amp9 (Blake t188u): 'amp-cabinet', the tilted frame ampWalkBox() is in
    tilt: { deg: AMP_TILT_DEG, pivot: 'rear-bottom-edge' },
    legReport: () => null,
    lights: [],
    setLightBoost: noop,
    onError: typeof opts.onError === 'function'
      ? opts.onError
      : error => console.warn('[amp]', error)
  };

  const report = error => {
    try { handle.onError(error); } catch (_) {}
  };
  const forced = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('ampFail') === '1';

  if (opts.forceFail || forced) {
    report(new Error('amp forced failure'));
    return handle;
  }

  const bag = resources();
  let root = null;
  let detach = noop;
  let disposed = false;

  function cleanup() {
    if (disposed) return;
    disposed = true;
    try { handle.exit(); } catch (_) {}
    try { detach(); } catch (_) {}
    if (handle.pilot) {
      try { handle.pilot.removeFromParent(); disposeObject(handle.pilot); } catch (_) {}
    }
    // amp8: a host-supplied handle is ours to dispose; the built-in one is owned by the bag.
    if (handle.handlePart && !handle.handlePart.userData.amp8BuiltIn) {
      try { handle.handlePart.removeFromParent(); disposeObject(handle.handlePart); } catch (_) {}
    }
    for (const light of handle.lights || []) {
      try {
        light.removeFromParent();
        light.target?.removeFromParent();
        light.dispose?.();
      } catch (_) {}
    }
    root?.removeFromParent();
    bag.dispose();
    handle.object3d = null;
    handle.exploring = false;
    handle.pilot = null;
    handle.handlePart = null;
    handle.cabinet = null;   // amp9 (Blake t188u)
    handle.legReport = () => null;
    handle.lights = [];
    handle.driver = null;
    handle.explore = handle.exit = handle.dispose = noop;
    handle.useDriver = handle.setPilot = handle.setHandle = handle.setLightBoost = noop;
    handle._exploreTick = noop;
    root = null;
  }

  function worldScaleOf(object) {
    const s = new THREE.Vector3();
    object.getWorldScale(s);
    return Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) || 1;
  }

  // amp9 (Blake t188u): debug/test report for the flush tilt legs, measured from the live world matrices
  // (allocates; never called per frame). Inches in the amp root frame (upright, floor y = 0):
  //   legs[i].gapMin/gapMax = leg bar distance from the side panel plane (cabinet-local |x| - W/2),
  //   legs[i].footY = lowest point of the bar above the floor, footZ = its z (rear contact line at rearZ),
  //   pitchDeg = cabinet front-axis pitch vs the world horizon (+ = front up), lowestY = lowest visible vertex.
  function legReport() {
    if (!root || !handle.cabinet) return null;
    const cab = handle.cabinet;
    root.updateMatrixWorld(true);
    const invRoot = root.matrixWorld.clone().invert();
    const invCab = cab.matrixWorld.clone().invert();
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    const r4 = x => +x.toFixed(4);
    const rootRot = new THREE.Matrix4().extractRotation(invRoot);   // amp10 (Blake t196u) 10b
    // rear bottom edge of the cabinet body (back panel bottom, cabinet-local y = FOOT_H, z = -D/2), root frame
    const rearEdgeZ = new THREE.Vector3(0, FOOT_H, -D / 2).applyMatrix4(cab.matrixWorld).applyMatrix4(invRoot).z;
    const rearEdgeY = new THREE.Vector3(0, FOOT_H, -D / 2).applyMatrix4(cab.matrixWorld).applyMatrix4(invRoot).y;
    const legs = [];
    for (const name of ['amp-leg-left', 'amp-leg-right']) {
      const g = root.getObjectByName(name), bar = g && g.getObjectByName(`${name}-bar`);
      if (!bar) { legs.push({ name, missing: true }); continue; }
      const side = g.userData.amp9Side || (name.endsWith('left') ? -1 : 1);
      const pos = bar.geometry.attributes.position;
      let gapMin = Infinity, gapMax = -Infinity, footY = Infinity, footZ = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(bar.matrixWorld);
        c.copy(v).applyMatrix4(invCab);
        const gap = side * c.x - W / 2;
        gapMin = Math.min(gapMin, gap); gapMax = Math.max(gapMax, gap);
        v.applyMatrix4(invRoot);
        if (v.y < footY) { footY = v.y; footZ = v.z; }
      }
      // amp10 (Blake t196u) 10b: leg length, angle from world vertical (+ = foot behind), foot z vs the rear bottom edge
      // (negative = behind it), pivot (root frame). Bar local y axis = along the leg, foot = -y.
      const be = bar.matrixWorld.elements;
      const ax = new THREE.Vector3(be[4], be[5], be[6]).applyMatrix4(rootRot).normalize();   // along the leg, tip -> foot is -ax
      const angFromVertDeg = THREE.MathUtils.radToDeg(Math.atan2(ax.z, ax.y));   // foot = -ax: foot behind when ax.z > 0 ... see sign below
      const piv = v.setFromMatrixPosition(g.matrixWorld).applyMatrix4(invRoot);
      legs.push({ name, side, lengthIn: LEG_LEN_FLUSH, angleFromVerticalDeg: r4(angFromVertDeg),
        gapMin: r4(gapMin), gapMax: r4(gapMax), footY: r4(footY), footZ: r4(footZ),
        footForwardOfRear: r4(footZ - TILT_Z), footBehindRearEdgeIn: r4(rearEdgeZ - footZ),
        pivot: { x: r4(piv.x), y: r4(piv.y), z: r4(piv.z) } });
    }
    const e = cab.matrixWorld.elements;
    const pitchDeg = THREE.MathUtils.radToDeg(Math.atan2(e[9], Math.hypot(e[8], e[10])));
    const re = root.matrixWorld.elements;
    const rootPitchDeg = THREE.MathUtils.radToDeg(Math.atan2(re[9], Math.hypot(re[8], re[10])));
    let lowestY = Infinity, lowestName = '';
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.name === 'amp-proxy' || !o.visible || !o.geometry?.attributes?.position) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(invRoot);
        if (v.y < lowestY) { lowestY = v.y; lowestName = o.name; }
      }
    });
    const legsGroup = root.getObjectByName('amp-legs');
    return { tiltDeg: AMP_TILT_DEG, pivot: 'rear-bottom-edge', rearZ: r4(TILT_Z), rearEdgeZ: r4(rearEdgeZ), rearEdgeY: r4(rearEdgeY),
      pitchDeg: r4(pitchDeg), rootPitchDeg: r4(rootPitchDeg), legs, lowestY: r4(lowestY), lowestName,
      flush: !!legsGroup?.userData.amp9LegsFlush,
      // amp10 (Blake t196u) 10b2: CG stability numbers (CG = cabinet centre, see TILT)
      physics: { model: legsGroup?.userData.amp10Physics, cgY: CG_Y, cgZ: CG_Z, balanceDeg: r4(THREE.MathUtils.radToDeg(BALANCE_RAD)),
        tiltDeg: AMP_TILT_DEG, cgBehindRearContactIn: r4(CG_BEHIND), marginDeg: r4(AMP_TILT_DEG - THREE.MathUtils.radToDeg(BALANCE_RAD)),
        legClosedLowY: r4(PIVOT_Y - (1 - LEG_PIVOT_T) * LEG_LEN_FLUSH), cabinetBottomY: FOOT_H },
      deploy: legsGroup?.userData.amp9Deploy || null };
  }

  // Swap the pilot part in place (see the PILOT LIGHT section).
  function setPilot(factoryOrGroup) {
    const mount = root?.userData._pilotMount;
    if (!mount) return null;
    let next = null;
    try {
      next = typeof factoryOrGroup === 'function'
        ? factoryOrGroup({
          scale: worldScaleOf(root),
          color: PILOT_COLOR,
          pointLight: opts.pilotLight ?? !(typeof matchMedia === 'function'
            && matchMedia('(pointer: coarse)').matches)
        })
        : factoryOrGroup;
    } catch (error) {
      console.warn('[amp] pilot factory failed', error);
      return handle.pilot;
    }
    if (!next || !next.isObject3D) {
      console.warn('[amp] setPilot needs a THREE.Object3D or a factory returning one');
      return handle.pilot;
    }
    const old = handle.pilot;
    if (old && old !== next) {
      old.removeFromParent();
      disposeObject(old);
    }
    next.traverse(o => { o.userData.keepSeparate = true; });
    mount.add(next);
    handle.pilot = next;
    return next;
  }

  // amp8 (Blake t174u/t178u): swap the carry-handle visual, like setPilot. Accepts a THREE.Object3D, a factory
  // ({ scale, top, collider } => Object3D) or null/'default' for the built-in strap. The part is added in
  // amp-local inches (mount at the amp origin, y up, front +z, top of the cabinet at y = top). The walk collider
  // is read from part.userData.amp8HandleCollider = { centre:[x,y,z], half:[hx,hy,hz], profile?:{x:[],y:[]} };
  // without it the new handle is not walkable (a warning is logged). Returns the mounted part.
  function setHandle(partOrFactory) {
    const mount = root?.userData._handleMount;
    if (!mount) return null;
    const builtIn = root.userData._defaultHandle;
    let next = null;
    if (partOrFactory == null || partOrFactory === 'default') {
      next = builtIn;
    } else {
      try {
        next = typeof partOrFactory === 'function'
          ? partOrFactory({ scale: worldScaleOf(root), top: TOP, collider: builtIn?.userData.amp8HandleCollider })
          : partOrFactory;
      } catch (error) {
        console.warn('[amp] handle factory failed', error);
        return handle.handlePart;
      }
    }
    if (!next || !next.isObject3D) {
      console.warn('[amp] setHandle needs a THREE.Object3D or a factory returning one');
      return handle.handlePart;
    }
    if (!next.userData.amp8HandleCollider) console.warn('[amp] setHandle: part has no userData.amp8HandleCollider (handle not walkable)');
    const old = handle.handlePart;
    if (old && old !== next) {
      old.removeFromParent();
      if (!old.userData.amp8BuiltIn) disposeObject(old);
    }
    next.traverse(o => { o.userData.keepSeparate = true; });
    if (!next.name) next.name = 'amp-handle';
    mount.add(next);
    handle.handlePart = next;
    return next;
  }

  try {
    const documentBase = typeof document !== 'undefined'
      ? document.baseURI
      : import.meta.url;
    const requestedBase = opts.assetBase == null ? defaultBase() : String(opts.assetBase);
    const base = new URL(
      requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`,
      documentBase
    ).href;

    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    const aniso = Math.max(1, Math.min(4, maxAniso));
    // amp8 (Blake t174u): reuse the intro-time prefetch when there is one for this base (once; a second mount loads fresh)
    let tx;
    if (PREFETCH && PREFETCH.base === base && !PREFETCH.used) {
      PREFETCH.used = true;
      tx = await PREFETCH.promise;
      for (const t of Object.values(tx)) if (t) { bag.own(t); t.anisotropy = aniso; }
    } else {
      tx = await loadTextures(base, aniso, bag);
    }
    // amp10 (Blake t196u) 10h: with opts.sliceAfter (an async () => next frame) the build runs in <= ~8 ms slices
    if (typeof opts.sliceAfter === 'function') {
      const g = buildAmpGen(tx, bag), base = typeof opts.sliceMs === 'number' && Number.isFinite(opts.sliceMs) ? opts.sliceMs : 8;
      for (;;) {
        // amp10 (Blake t196u) 10h3: opts.sliceMs may be a function (the host scales the slice with its frame time: ~12% of a slow frame, 8 ms at 60 fps)
        const budget = typeof opts.sliceMs === 'function' ? opts.sliceMs() : base;
        const t0 = performance.now(); let r;
        do { r = g.next(); } while (!r.done && performance.now() - t0 < budget);
        if (r.done) { root = r.value; break; }
        drainDispose(3);
        await opts.sliceAfter();
      }
      drainDispose(1e9);
    } else root = buildAmp(tx, bag);

    // Public contract defaults to 1; the host may explicitly request ×3.
    const scale = opts.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error('amp: scale must be a positive finite number');
    }
    root.scale.setScalar(scale);
    const p = opts.position || {};
    root.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    if (typeof opts.rotation === 'number') {
      root.rotation.y = opts.rotation;
    } else if (opts.rotation) {
      const r = opts.rotation;
      root.rotation.set(r.x ?? 0, r.y ?? 0, r.z ?? 0, r.order || 'XYZ');
    }
    root.updateMatrixWorld(true);

    handle.object3d = root;
    // amp9 (Blake t188u): tilted-back cabinet frame (walk + fly targets use it) and the leg/tilt test report.
    handle.cabinet = root.userData._cabinet || root;
    handle.tilt = { deg: AMP_TILT_DEG, pivot: 'rear-bottom-edge' };
    handle.legReport = legReport;

    // Amp-owned light rig, scaled by opts.lightBoost (default 1).
    const boost = Number.isFinite(opts.lightBoost) && opts.lightBoost >= 0
      ? opts.lightBoost : 1;
    handle.lights = addLightRig(root, scale, boost);
    handle.setLightBoost = k => {
      const v = Number.isFinite(k) && k >= 0 ? k : 1;
      for (const light of handle.lights) {
        light.intensity = (light.userData.baseIntensity ?? 1) * v;
      }
    };

    // amp8: carry handle (swappable part; built-in strap already mounted by buildAmp).
    handle.setHandle = setHandle;
    handle.handlePart = root.userData._defaultHandle || null;

    // Royal blue pilot (swappable part).
    handle.setPilot = setPilot;
    try {
      setPilot(makePilotLight);
    } catch (error) {
      console.warn('[amp] pilot light failed', error);
    }

    detach = attachExplore(handle, camera, renderer, opts);
    // amp7: host hook run right before the amp joins the scene (site1-amp7 swaps its light slots / hides it until compiled)
    if (typeof opts.beforeAdd === 'function') { try { opts.beforeAdd(root); } catch (error) { console.warn('[amp] beforeAdd failed', error); } }
    scene?.add(root);
    handle.dispose = cleanup;
    return handle;
  } catch (error) {
    cleanup();
    report(error);
    return handle;
  }
}

export function ampTick(handle, dt, camera) {
  if (handle?.exploring && handle.object3d) {
    try {
      handle._exploreTick?.(dt, camera);
    } catch (error) {
      if (!handle._tickWarned) {
        handle._tickWarned = true;
        console.warn('[amp] tick failed', error);
      }
    }
  }
}

export const AMP_DIM = {
  W, H, D, FOOT_H, PANEL_H, HANDLE_LIFT,
  TOP, KNOB_HEIGHT, PILOT_COLOR
};
