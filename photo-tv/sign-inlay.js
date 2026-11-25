/* sign-inlay.js (round 3, Blake t440u / t443u)
   Pure placement for the Precious Memories plaque. Contract:
   - no DOM, no THREE, no I/O, no secrets
   - never throws: bad input falls back to a conservative pose inside the outer frame
   - inlaySign({ x, y, s, rz, scrW, scrH, scrR, signW, signH }) ->
       { x, y, s, zBoard, zLetter, zGlow, side, rail }
   Seats the plaque in the wood/brass rail of the photo-panel frame (top if y >= 0, bottom
   otherwise): the outward edge sits just inside the frame's outer edge, the body covers the
   wood rail and may overlap the glass slightly, like a nameplate set into the border — not
   a card left in the glass or sticking out past the outer edge. On a rounded frame the
   plaque stays on the straight section of the rail (shifted inward in x, or shrunk only if
   it is wider than that straight section) so a corner clamp cannot push it back into the
   glass. Depth is almost in the frame plane (inlaid); lettering and glow sit slightly proud.
   Frame offsets match buildPanelFrame() in photo-tv.js (lip 0.004, wood 0.008–0.020, outer 0.023). */

export const FRAME = { lip: 0.004, woodIn: 0.008, woodOut: 0.020, outer: 0.023 };
export const OUTER_MARGIN = 0.002;
export const INLAY_Z = { board: 0.0015, letter: 0.0025, glow: 0.0035 };
export const SCR = { w: 0.58, h: 0.40, r: 0.105 };
export const SIGN_PLANE = { w: 0.76, h: 0.76 * 192 / 1024 };

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

export function inlaySign(input) {
  const o = input || {};
  const scrW = num(o.scrW, SCR.w), scrH = num(o.scrH, SCR.h), scrR = num(o.scrR, SCR.r);
  const signW = num(o.signW, SIGN_PLANE.w), signH = num(o.signH, SIGN_PLANE.h);
  let x = num(o.x, 0), y = num(o.y, scrH / 2), s = num(o.s, 1), rz = num(o.rz, 0);
  if (s <= 0) s = 1e-3;
  const side = y >= 0 ? 'top' : 'bottom';
  const ca = Math.abs(Math.cos(rz)), sa = Math.abs(Math.sin(rz));
  const ext = (k) => [(signW * k / 2) * ca + (signH * k / 2) * sa, (signW * k / 2) * sa + (signH * k / 2) * ca];
  const outerHw = scrW / 2 + FRAME.outer - OUTER_MARGIN;
  const outerHh = scrH / 2 + FRAME.outer - OUTER_MARGIN;
  const outerR = Math.max(0.001, scrR + FRAME.outer - OUTER_MARGIN);
  // The straight section of the rail (outside the rounded-corner band).
  const straight = Math.max(0.001, outerHw - outerR);
  let [ex, ey] = ext(s);
  let fit = Math.min(1, outerHw / Math.max(ex, 1e-9), outerHh / Math.max(ey, 1e-9), straight / Math.max(ex, 1e-9));
  if (fit < 1) { s *= fit * 0.999; [ex, ey] = ext(s); }
  y = side === 'top' ? (outerHh - ey) : (-outerHh + ey);
  x = Math.max(-straight + ex, Math.min(straight - ex, x));
  return {
    x, y, s, rz, side,
    zBoard: INLAY_Z.board, zLetter: INLAY_Z.letter, zGlow: INLAY_Z.glow,
    rail: { inner: scrH / 2 + FRAME.woodIn, outer: scrH / 2 + FRAME.outer }
  };
}
