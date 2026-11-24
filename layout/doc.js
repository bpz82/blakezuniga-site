// layout/doc.js: the layout document (desktop + phone), viewport selection, localStorage working copy.
// Contract: pure state. No DOM placement and no scene access here. The entry point registers onChange()
// so it can re-apply everything whenever the doc changes.
export const STORAGE = 'bz-home-layout';

export const emptyDoc = () => ({ version: 1, desktop: {}, phone: {} });
export const viewportOf = (w, h) => (w < 600 || w < h) ? 'phone' : 'desktop';
export const isEdit = () => new URLSearchParams(location.search).get('edit') === '1';
export const hasKeys = (obj) => !!obj && typeof obj === 'object' && Object.keys(obj).length > 0;

let doc = emptyDoc();
let fileDoc = emptyDoc();
let changed = () => { };

export function onChange(fn) { changed = fn; }
export function getDoc() { return doc; }
export function getFileDoc() { return fileDoc; }
export function activeViewport() { return viewportOf(innerWidth, innerHeight); }
export function active() { return doc[activeViewport()] || {}; }

export function publish() {
  window.__homeLayoutDoc = doc;
  window.__homeLayout = active();
  window.__homeLayoutViewport = activeViewport();
}

function normalize(d) {
  const o = Object.assign(emptyDoc(), d && typeof d === 'object' ? d : {});
  if (!o.desktop) o.desktop = {};
  if (!o.phone) o.phone = {};
  return o;
}

export function setDoc(next, persist) {
  doc = normalize(next);
  doc.version = 1;
  publish();
  changed();
  if (persist) saveLocal();
}

export function setItem(id, props, persist) {
  const v = activeViewport();
  if (!doc[v]) doc[v] = {};
  const cur = doc[v][id] && typeof doc[v][id] === 'object' ? doc[v][id] : {};
  doc[v][id] = Object.assign({}, cur, props);
  publish();
  changed();
  if (persist !== false) saveLocal();
}

export function resetViewport(v) {
  doc[v || activeViewport()] = {};
  publish();
  changed();
  saveLocal();
}

export function saveLocal() {
  try { localStorage.setItem(STORAGE, JSON.stringify(doc)); } catch (_) { }
}

export function toJSON() { return JSON.stringify(doc, null, 2); }

function loadStored() {
  try {
    const j = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (j && typeof j === 'object' && j.version) return j;
  } catch (_) { }
  return null;
}

// Live page: layout.json only. ?edit=1: the localStorage working copy wins (read only here, never cleared).
export async function load(fileUrl) {
  try {
    const r = await fetch(fileUrl + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) fileDoc = normalize(await r.json());
  } catch (_) { }
  const stored = isEdit() ? loadStored() : null;
  doc = normalize(stored || fileDoc);
  publish();
}
