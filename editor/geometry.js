// editor/geometry.js: pure 2D helpers for outlines and hit-testing. No THREE, no DOM. Polygons are arrays of [x, y].

export function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }

// Andrew monotone chain. Returns the hull in order (screen coords, y down), no repeated first point.
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lo = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

// Cheap pre-reduction for very large vertex clouds: keep, per 1-px column, the lowest and highest point.
// The hull of the kept points is within about one pixel of the hull of all points.
export function columnReduce(xs, ys, n, minX, maxX) {
  const w = Math.max(1, Math.ceil(maxX - minX) + 1);
  const lo = new Float32Array(w).fill(Infinity), hi = new Float32Array(w).fill(-Infinity);
  const loX = new Float32Array(w), hiX = new Float32Array(w);
  for (let i = 0; i < n; i++) {
    const c = Math.min(w - 1, Math.max(0, (xs[i] - minX) | 0));
    if (ys[i] < lo[c]) { lo[c] = ys[i]; loX[c] = xs[i]; }
    if (ys[i] > hi[c]) { hi[c] = ys[i]; hiX[c] = xs[i]; }
  }
  const out = [];
  for (let c = 0; c < w; c++) if (lo[c] !== Infinity) { out.push([loX[c], lo[c]]); if (hi[c] !== lo[c]) out.push([hiX[c], hi[c]]); }
  return out;
}

export function area(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function centroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-6) { const b = bbox(poly); return [b.x + b.w / 2, b.y + b.h / 2]; }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function distToPolygon(x, y, poly) {
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  }
  return best;
}

// The polygon vertex furthest toward a direction (used to seat resize handles on the shape).
export function extreme(poly, dx, dy) {
  let best = poly[0], s = -Infinity;
  for (const p of poly) { const v = p[0] * dx + p[1] * dy; if (v > s) { s = v; best = p; } }
  return best;
}

export function rectPoly(r) { return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]; }

// Max distance from each point of A to the polygon B boundary/interior (0 if inside). Used by the self-check.
export function maxDeviation(A, B) {
  let m = 0;
  for (const p of A) { if (!pointInPolygon(p[0], p[1], B)) m = Math.max(m, distToPolygon(p[0], p[1], B)); }
  return m;
}
