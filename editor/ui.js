// editor/ui.js: the editor chrome (toolbar, chips, selected-object panel, Copy / Download). Owns the iframe, nothing else.
// It never touches the scene or localStorage: everything goes through postMessage (editor/protocol.js) and the
// scene side (editor/scene.js) answers with le:state { doc, selected, values, ... }. Copy / Download serialise that doc.
import { T, isEditorMsg } from './protocol.js';
import { FIELDS, LABELS, ORDER } from './schema.js';

const VIEWS = { desktop: [1280, 800], phone: [393, 852] };
const $ = (id) => document.getElementById(id);
const iframe = $('stage'), clip = $('stage-clip'), chips = $('chips'), fields = $('fields'), inspector = $('inspector'), status = $('status');
const jsonView = $('json-view');
const btnDesk = $('btn-desk'), btnPhone = $('btn-phone'), btnUndo = $('btn-undo'), btnRedo = $('btn-redo'), btnSnap = $('btn-snap');

const mqCompact = matchMedia('(max-width: 700px), (max-height: 500px)');
let view = 'desktop', selected = null, snapOn = false;
let state = { ready: false, values: null, doc: { version: 1, desktop: {}, phone: {} } };

const send = (msg) => { try { iframe.contentWindow && iframe.contentWindow.postMessage(msg, '*'); } catch (_) { } };
const say = (t, ok) => { status.textContent = t; status.className = 'layout-only' + (ok ? ' ok' : ''); };

ORDER.forEach((id) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = id; b.textContent = LABELS[id];
  b.addEventListener('click', () => send({ type: T.select, id }));
  chips.appendChild(b);
});

function sizeFrame() {
  const [w, h] = VIEWS[view], wrap = $('stage-wrap');
  const s = Math.min(1, Math.max(80, wrap.clientWidth - 16) / w, Math.max(80, wrap.clientHeight - 16) / h);
  clip.style.width = Math.round(w * s) + 'px'; clip.style.height = Math.round(h * s) + 'px';
  iframe.style.transform = 'scale(' + s + ')';
}

function setView(next, force) {
  if (next !== 'desktop' && next !== 'phone') return;
  if (!force && next === view) return;
  view = next;
  btnDesk.classList.toggle('on', view === 'desktop'); btnPhone.classList.toggle('on', view === 'phone');
  btnDesk.setAttribute('aria-pressed', String(view === 'desktop')); btnPhone.setAttribute('aria-pressed', String(view === 'phone'));
  const [w, h] = VIEWS[view];
  iframe.width = w; iframe.height = h; iframe.style.width = w + 'px'; iframe.style.height = h + 'px';
  sizeFrame();
  const already = (() => { try { return !!(iframe.contentWindow && iframe.contentWindow.__layoutEditor); } catch (_) { return false; } })();
  if (force || !already) {
    state.ready = false;
    say('Loading ' + view + ' view…');
    iframe.src = 'index.html?edit=1&view=' + view;
    selected = null; renderChips(); renderFields();
  } else {
    say((view === 'phone' ? 'Phone' : 'Desktop') + ' view. Drag to place.', true);
    send({ type: T.ping });
  }
}

const renderChips = () => chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.id === selected));

// ---- selected-object panel: slider + number per field ----
const D = 180 / Math.PI;
const toDisp = (f, v) => f.angle ? v * D : v;
const fromDisp = (f, v) => f.angle ? v / D : v;
const dec = (f) => f.angle ? 1 : (f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : f.step >= 0.01 ? 2 : 3);

function ranges(f, v) {
  let min = f.min, max = f.max;
  if (min === 'rel') { min = v - f.span; max = v + f.span; }
  min = Math.min(min, v); max = Math.max(max, v);   // never clip the current value
  return [toDisp(f, min), toDisp(f, max)];
}

function pushValue(f, rad, begin) {
  if (!selected || !Number.isFinite(rad)) return;
  if (begin) send({ type: T.begin });
  send({ type: T.set, id: selected, props: { [f.key]: rad } });
}

function renderFields() {
  fields.innerHTML = '';
  if (!selected) { inspector.hidden = true; return; }
  inspector.hidden = false;
  $('ins-title').textContent = LABELS[selected];
  $('btn-reset-item').hidden = selected === 'camera';
  const v = state.values || {};
  (FIELDS[selected] || []).forEach((f) => {
    const raw = v[f.key] != null && isFinite(v[f.key]) ? v[f.key] : (f.key === 's' ? 1 : 0);
    const [lo, hi] = ranges(f, raw);
    const row = document.createElement('div'); row.className = 'fld'; row.dataset.key = f.key;
    const lab = document.createElement('label'); lab.textContent = f.label + (f.angle ? ' (°)' : ''); lab.htmlFor = 'fn-' + f.key;
    const rng = document.createElement('input'); rng.type = 'range'; rng.min = lo; rng.max = hi; rng.step = f.angle ? 0.1 : f.step; rng.value = toDisp(f, raw); rng.setAttribute('aria-label', f.label);
    const num = document.createElement('input'); num.type = 'number'; num.id = 'fn-' + f.key; num.step = f.angle ? 0.1 : f.step; num.value = toDisp(f, raw).toFixed(dec(f)); num.inputMode = 'decimal';
    rng.addEventListener('pointerdown', () => send({ type: T.begin }));
    rng.addEventListener('input', () => { num.value = (+rng.value).toFixed(dec(f)); pushValue(f, fromDisp(f, +rng.value), false); });
    num.addEventListener('change', () => {
      const n = parseFloat(num.value); if (!Number.isFinite(n)) return;
      if (n < +rng.min) rng.min = n; if (n > +rng.max) rng.max = n;
      rng.value = n; pushValue(f, fromDisp(f, n), true);
    });
    row.append(lab, rng, num); fields.appendChild(row);
  });
}

function refreshFields() {
  const v = state.values; if (!v || !selected) return;
  (FIELDS[selected] || []).forEach((f) => {
    const row = fields.querySelector('[data-key="' + f.key + '"]'); if (!row || v[f.key] == null || !isFinite(v[f.key])) return;
    const rng = row.querySelector('input[type=range]'), num = row.querySelector('input[type=number]');
    if (document.activeElement === rng || document.activeElement === num) return;
    const d = toDisp(f, v[f.key]);
    if (f.min === 'rel' || d < +rng.min || d > +rng.max) { const [lo, hi] = ranges(f, v[f.key]); rng.min = lo; rng.max = hi; }
    rng.value = d; num.value = d.toFixed(dec(f));
  });
}

window.addEventListener('message', (e) => {
  const m = e.data; if (!isEditorMsg(m) || (m.type !== T.state && m.type !== T.ready)) return;
  if (e.source !== iframe.contentWindow) return;
  if (m.type === T.ready || m.boot) { state.ready = true; say('Ready. Drag things into place.', true); }
  if (m.doc) state.doc = m.doc;
  if (m.values !== undefined) state.values = m.values;
  if (m.canUndo !== undefined) { btnUndo.disabled = !m.canUndo; btnRedo.disabled = !m.canRedo; }
  if (m.snap !== undefined) { snapOn = m.snap; btnSnap.setAttribute('aria-pressed', String(snapOn)); btnSnap.textContent = 'Snap: ' + (snapOn ? 'on' : 'off'); }
  if (m.selected !== undefined && m.selected !== selected) { selected = m.selected; renderChips(); renderFields(); }
  else if (m.values) refreshFields();
  if (m.ready && !state.ready) { state.ready = true; say('Ready. Drag things into place.', true); }
  if (sheetPane === 'json' && document.activeElement !== jsonView) jsonView.value = currentJSON();
  window.__editorChrome = Object.assign(window.__editorChrome || {}, { view, selected, ready: state.ready, doc: state.doc, values: state.values, snap: snapOn });
});

// ---- toolbar ----
const currentJSON = () => JSON.stringify(state.doc || { version: 1, desktop: {}, phone: {} }, null, 2);

// Copy JSON must work on iOS Safari, where the user gesture is gone after any await. So everything that needs the gesture runs
// synchronously inside the click: the async Clipboard API is started (not awaited) and a selected-textarea execCommand('copy') runs
// right away. If neither works, the JSON pane's visible textarea is selected so the user can long-press > Copy, and Download still works.
function legacyCopy(text) {
  const vis = jsonView.offsetParent !== null;
  const ta = vis ? jsonView : document.createElement('textarea');
  if (!vis) { ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px'; document.body.appendChild(ta); }
  ta.value = text;
  try { ta.focus({ preventScroll: true }); } catch (_) { }
  ta.select(); try { ta.setSelectionRange(0, text.length); } catch (_) { }
  let ok = false; try { ok = !!document.execCommand('copy'); } catch (_) { }
  if (!vis) ta.remove();
  return ok;
}
$('btn-copy').addEventListener('click', () => {
  const text = currentJSON();
  window.__editorChrome = Object.assign(window.__editorChrome || {}, { lastCopied: text });
  jsonView.value = text;
  const okMsg = 'JSON copied. Send it back to apply it on the site.';
  let p = null; try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : null; } catch (_) { p = null; }
  const manual = () => {
    if (mqCompact.matches) { openSheet('json'); jsonView.focus({ preventScroll: true }); jsonView.select(); try { jsonView.setSelectionRange(0, text.length); } catch (_) { } say('Could not copy silently. The JSON is selected: long-press it and tap Copy, or use Download.'); }
    else say('Copy failed. Use Download instead.');
  };
  if (legacyCopy(text)) { say(okMsg, true); if (p) p.then(null, () => { }); }
  else if (p) p.then(() => say(okMsg, true), manual);
  else manual();
});
$('btn-dl').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([currentJSON()], { type: 'application/json' })); a.download = 'layout.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  say('Downloaded layout.json. Send that file back to apply it on the site.', true);
});
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Reset the ' + view + ' layout to the automatic placement? This only clears this view, and only on this phone or computer.')) return;
  say('Resetting…');
  send({ type: T.reset, viewport: view });
  setTimeout(() => { try { if (!iframe.contentWindow.__layoutEditor) setView(view, true); } catch (_) { } }, 800);
});
$('btn-reset-item').addEventListener('click', () => { if (selected) send({ type: T.resetItem, id: selected }); });
btnUndo.addEventListener('click', () => send({ type: T.undo }));
btnRedo.addEventListener('click', () => send({ type: T.redo }));
btnSnap.addEventListener('click', () => send({ type: T.snap, on: !snapOn }));
btnDesk.addEventListener('click', () => setView('desktop'));
btnPhone.addEventListener('click', () => setView('phone'));
addEventListener('resize', sizeFrame);
// the selected-object panel appears / disappears and changes the room left for the stage: re-fit the scaled iframe
try { new ResizeObserver(sizeFrame).observe($('stage-wrap')); } catch (_) { }
addEventListener('orientationchange', () => setTimeout(sizeFrame, 200));
addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
  e.preventDefault(); send({ type: e.shiftKey ? T.redo : T.undo });
});
// the Photos tab changes the stage's size; re-fit when it flips back
$('btn-mode-layout').addEventListener('click', () => setTimeout(sizeFrame, 50));

// ---- phone chrome: tabs (Layout / Photos / JSON) + collapsible bottom sheet ----
// Compact mode (narrow or short screens) moves the controls into #sheet. Desktop keeps the toolbar header + inspector below the stage.
const sheet = $('sheet'), sheetBody = $('sheet-body'), tabbar = $('tabbar'), btnJson = $('btn-json'), paneLayout = $('pane-layout'), paneJson = $('pane-json');
const btnLayoutTab = $('btn-mode-layout'), btnPhotosTab = $('btn-mode-photos');
let sheetPane = null;   // null = collapsed, 'layout' | 'json'
let modePhotos = false;

function openSheet(pane) {
  sheetPane = pane || null;
  sheetBody.hidden = !sheetPane; paneLayout.hidden = sheetPane !== 'layout'; paneJson.hidden = sheetPane !== 'json';
  btnLayoutTab.setAttribute('aria-expanded', String(sheetPane === 'layout')); btnJson.setAttribute('aria-expanded', String(sheetPane === 'json'));
  btnJson.setAttribute('aria-pressed', String(sheetPane === 'json')); btnJson.classList.toggle('on', sheetPane === 'json');
  if (sheetPane === 'json') jsonView.value = currentJSON();
}
function placeChrome() {
  const compact = mqCompact.matches, bar = $('bar'), tools = $('tools'), chipsEl = $('chips'), modeSeg = $('mode-seg'), viewSeg = $('view-seg'), top = $('bar-top');
  document.body.classList.toggle('compact', compact);
  if (compact) {
    tabbar.insertBefore(modeSeg, btnJson);
    paneLayout.append(tools, viewSeg, chipsEl, inspector);
    $('json-actions').prepend($('btn-copy'), $('btn-dl'));
    if (!paneLayout.dataset.init) { paneLayout.dataset.init = '1'; openSheet(null); }
  } else {
    top.insertBefore(modeSeg, top.children[1] || null); top.insertBefore(viewSeg, $('bar-top').querySelector('.hint'));
    bar.append(tools, chipsEl, status);
    tools.insertBefore($('btn-copy'), $('btn-reset')); tools.insertBefore($('btn-dl'), $('btn-reset'));
    document.body.insertBefore(inspector, $('photo-manager'));
    openSheet(null);
  }
  setTimeout(sizeFrame, 30);
}
mqCompact.addEventListener ? mqCompact.addEventListener('change', placeChrome) : mqCompact.addListener(placeChrome);
// capture: read the mode before photo-manager.js flips it
btnLayoutTab.addEventListener('click', () => {
  if (!mqCompact.matches) return;
  const wasPhotos = document.body.classList.contains('photos-mode') || modePhotos;
  modePhotos = false;
  openSheet(wasPhotos || sheetPane === 'layout' ? null : 'layout');
}, true);
btnPhotosTab.addEventListener('click', () => { modePhotos = true; if (mqCompact.matches) openSheet(null); }, true);
btnJson.addEventListener('click', () => {
  if (document.body.classList.contains('photos-mode')) { btnLayoutTab.click(); modePhotos = false; openSheet('json'); return; }
  openSheet(sheetPane === 'json' ? null : 'json');
});
$('btn-json-select').addEventListener('click', () => { jsonView.value = currentJSON(); jsonView.focus({ preventScroll: true }); jsonView.select(); try { jsonView.setSelectionRange(0, jsonView.value.length); } catch (_) { } });
// picking a chip or touching the stage in the scene should keep the sheet usable but never block the stage
placeChrome();

setView(mqCompact.matches ? 'phone' : 'desktop', true);
