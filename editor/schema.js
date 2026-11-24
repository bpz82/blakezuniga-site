// editor/schema.js: which keys of layout.json each item exposes as fields in the chrome (number + slider), with ranges.
// Keys are exactly the layout.json keys (desktop.<item>.<key>); do not rename them. `snap` is the step used when Snap is on.
// min/max may be a number or 'rel' (range = current value +/- `span`, for world-space positions with no fixed range).
export const LABELS = { guitar: 'Guitar', amp: 'Amp', panel: 'Panel', title: 'Title', neon: 'Sign', tiles: 'Tiles', explore: 'Explore', camera: 'Camera' };
export const ORDER = ['guitar', 'amp', 'panel', 'title', 'neon', 'tiles', 'explore', 'camera'];

const POSE3D = [
  { key: 's', label: 'Size', min: 0.4, max: 3, step: 0.01, snap: 0.05 },   // layout/dom.js clamps 0.4..3 in the editor
  { key: 'x', label: 'Left / right', min: 'rel', span: 120, step: 0.1, snap: 1 },
  { key: 'y', label: 'Up / down', min: 'rel', span: 120, step: 0.1, snap: 1 },
  { key: 'z', label: 'Forward / back', min: 'rel', span: 120, step: 0.1, snap: 1 },
  { key: 'ry', label: 'Turn', min: -3.1416, max: 3.1416, step: 0.01, snap: Math.PI / 36, angle: true },
  { key: 'rx', label: 'Pitch', min: -3.1416, max: 3.1416, step: 0.01, snap: Math.PI / 36, angle: true },
  { key: 'rz', label: 'Roll', min: -3.1416, max: 3.1416, step: 0.01, snap: Math.PI / 36, angle: true }
];

export const FIELDS = {
  guitar: POSE3D,
  amp: POSE3D,
  panel: [
    { key: 'w', label: 'Width', min: 0.18, max: 1.1, step: 0.01, snap: 0.02 },
    { key: 'h', label: 'Height', min: 0.12, max: 1.0, step: 0.01, snap: 0.02 },
    { key: 'cx', label: 'Left / right', min: -0.6, max: 0.6, step: 0.001, snap: 0.01 },
    { key: 'cy', label: 'Up / down', min: -0.6, max: 0.6, step: 0.001, snap: 0.01 },
    { key: 'rz', label: 'Tilt', min: -1.2, max: 1.2, step: 0.005, snap: Math.PI / 72, angle: true },
    { key: 'ry', label: 'Turn', min: -1.3, max: 1.3, step: 0.005, snap: Math.PI / 72, angle: true },
    { key: 'rx', label: 'Pitch', min: -1.3, max: 1.3, step: 0.005, snap: Math.PI / 72, angle: true }
  ],
  title: [
    { key: 's', label: 'Size', min: 0.4, max: 3, step: 0.01, snap: 0.05 },
    { key: 'cx', label: 'Left / right', min: -0.6, max: 0.6, step: 0.001, snap: 0.01 },
    { key: 'cy', label: 'Up / down', min: -0.6, max: 0.6, step: 0.001, snap: 0.01 },
    { key: 'rz', label: 'Rotate', min: -1.2, max: 1.2, step: 0.005, snap: Math.PI / 72, angle: true }
  ],
  neon: [
    { key: 's', label: 'Size', min: 0.4, max: 3, step: 0.01, snap: 0.05 },
    { key: 'lx', label: 'Left / right', min: -1, max: 1, step: 0.001, snap: 0.01 },
    { key: 'ly', label: 'Up / down', min: -1, max: 1, step: 0.001, snap: 0.01 }
  ],
  tiles: [
    { key: 's', label: 'Size', min: 0.4, max: 3, step: 0.01, snap: 0.05 },
    { key: 'x', label: 'Left / right', min: -600, max: 600, step: 1, snap: 8 },
    { key: 'y', label: 'Up / down', min: -600, max: 600, step: 1, snap: 8 }
  ],
  explore: [
    { key: 's', label: 'Size', min: 0.4, max: 3, step: 0.01, snap: 0.05 },
    { key: 'x', label: 'Left / right', min: -600, max: 600, step: 1, snap: 8 },
    { key: 'y', label: 'Up / down', min: -600, max: 600, step: 1, snap: 8 }
  ],
  camera: [
    { key: 'k', label: 'Zoom', min: 0.6, max: 2.5, step: 0.01, snap: 0.05 },
    { key: 'pitch', label: 'Height', min: 0.05, max: 1.2, step: 0.005, snap: 0.05 },
    { key: 'yaw', label: 'Turn', min: -3.1416, max: 3.1416, step: 0.005, snap: Math.PI / 36, angle: true }
  ]
};

export function snapKey(id, key, v) {
  const f = (FIELDS[id] || []).find((q) => q.key === key);
  return f && f.snap && Number.isFinite(v) ? Math.round(v / f.snap) * f.snap : v;
}
