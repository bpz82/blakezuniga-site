/* Precious Memories photo manager for the layout editor.
   Isolated module: the only editor hook is #btn-mode-layout, #btn-mode-photos, and #photo-manager.
   Nothing is written to the repo from the browser. Export a zip and send it back to be applied. */
(function () {
  const MANIFEST = 'photo-tv/photos.json';
  const SEO_PHRASES = [
    'Blake Z music',
    'Blake Zuniga',
    'Blake music',
    'Blake z folk',
    'Blake z guitar'
  ];
  const ALT_MAX = 125;
  const PHRASE_MAX = 2;

  const layoutBtn = document.getElementById('btn-mode-layout');
  const photosBtn = document.getElementById('btn-mode-photos');
  const root = document.getElementById('photo-manager');
  if (!layoutBtn || !photosBtn || !root) return;

  const state = {
    loaded: false,
    loading: false,
    error: '',
    photos: [],
    originalOrder: [],
    removals: new Set(),
    adds: [],
    addSeq: 0,
    viewer: null
  };

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach((d) => { n.dataset[d] = v[d]; });
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      });
    }
    (kids || []).forEach((c) => { if (c) n.appendChild(c); });
    return n;
  }

  function filenameOf(photo) {
    const p = photo.full || photo.tv || '';
    const slash = p.lastIndexOf('/');
    return slash >= 0 ? p.slice(slash + 1) : p || (photo.id + '.webp');
  }

  function slugFromName(name) {
    let s = String(name || '').toLowerCase();
    s = s.replace(/\.[a-z0-9]+$/i, '');
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return s || 'photo';
  }

  function describeFromName(name) {
    let s = String(name || '').replace(/\.[a-z0-9]+$/i, '');
    s = s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return 'Photo';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function uniqueId(base) {
    const used = new Set(state.photos.map((p) => p.id).concat(state.adds.map((a) => a.id)));
    let id = base, n = 2;
    while (used.has(id)) { id = base + '-' + n; n += 1; }
    return id;
  }

  function phraseHits(alt) {
    const lower = String(alt || '').toLowerCase();
    return SEO_PHRASES.filter((p) => lower.indexOf(p.toLowerCase()) !== -1);
  }

  function stripPhrases(alt) {
    let s = String(alt || '');
    SEO_PHRASES.forEach((p) => {
      const re = new RegExp(',?\\s*' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      s = s.replace(re, '');
    });
    return s.replace(/[,\s]+$/g, '').replace(/^[,\s]+/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  function withPhrases(desc, phrases) {
    const clean = (desc || 'Photo').trim() || 'Photo';
    const unique = [];
    phrases.forEach((p) => {
      if (SEO_PHRASES.indexOf(p) < 0) return;
      if (unique.indexOf(p) < 0) unique.push(p);
    });
    const picked = unique.slice(0, PHRASE_MAX);
    let out = picked.length ? clean + ', ' + picked.join(', ') : clean;
    if (out.length <= ALT_MAX) return out;
    const room = ALT_MAX - (picked.length ? 2 + picked.join(', ').length : 0);
    if (room < 8) {
      out = (clean.slice(0, Math.max(8, ALT_MAX - 2)) + (picked[0] ? ', ' + picked[0] : '')).slice(0, ALT_MAX);
      return out;
    }
    return (clean.slice(0, room).replace(/[,\s]+$/g, '') + ', ' + picked.join(', ')).slice(0, ALT_MAX);
  }

  function suggestPhrases() {
    const counts = {};
    SEO_PHRASES.forEach((p) => { counts[p] = 0; });
    state.photos.forEach((p) => phraseHits(p.alt).forEach((h) => { counts[h] += 1; }));
    state.adds.forEach((a) => phraseHits(a.alt).forEach((h) => { counts[h] += 1; }));
    const ranked = SEO_PHRASES.slice().sort((a, b) => counts[a] - counts[b] || SEO_PHRASES.indexOf(a) - SEO_PHRASES.indexOf(b));
    return ranked.slice(0, PHRASE_MAX);
  }

  function suggestAlt(filename) {
    return withPhrases(describeFromName(filename), suggestPhrases());
  }

  function setMode(mode) {
    const photos = mode === 'photos';
    document.body.classList.toggle('photos-mode', photos);
    layoutBtn.classList.toggle('on', !photos);
    photosBtn.classList.toggle('on', photos);
    layoutBtn.setAttribute('aria-pressed', photos ? 'false' : 'true');
    photosBtn.setAttribute('aria-pressed', photos ? 'true' : 'false');
    if (photos) {
      root.hidden = false;
      if (!state.loaded && !state.loading) loadManifest();
      else render();
    } else {
      root.hidden = true;
      closeViewer();
    }
  }

  const order = []; // existing photos, in display order: {kind:'photo', id}

  function photoById(id) { return state.photos.find((p) => p.id === id); }

  async function loadManifest() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const res = await fetch(MANIFEST, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load photo list (' + res.status + ')');
      const data = await res.json();
      const photos = (data && data.photos) || [];
      if (!Array.isArray(photos) || photos.length === 0) throw new Error('Photo list was empty');
      state.photos = photos.slice();
      state.originalOrder = photos.map((p) => p.id);
      order.length = 0;
      photos.forEach((p) => order.push({ kind: 'photo', id: p.id }));
      state.loaded = true;
    } catch (err) {
      state.error = (err && err.message) ? err.message : 'Could not load photos';
    } finally {
      state.loading = false;
      render();
    }
  }

  function render() {
    const prevScroll = (document.getElementById('pm-scroll') || {}).scrollTop || 0;
    root.innerHTML = '';
    const toolbar = el('div', { class: 'pm-toolbar' });
    const file = el('input', {
      class: 'pm-file',
      type: 'file',
      accept: 'image/*',
      id: 'pm-file',
      multiple: true,
      'aria-label': 'Add photos from your library'
    });
    file.addEventListener('change', onFiles);
    toolbar.appendChild(file);
    toolbar.appendChild(el('button', { type: 'button', class: 'btn primary', id: 'pm-add', text: 'Add photos', onclick: () => file.click() }));
    toolbar.appendChild(el('button', { type: 'button', class: 'btn', id: 'pm-export', text: 'Export changes', onclick: onExport }));
    const count = el('span', { class: 'pm-count', id: 'pm-count' });
    count.innerHTML = countHtml();
    toolbar.appendChild(count);
    root.appendChild(toolbar);

    const scroll = el('div', { class: 'pm-scroll', id: 'pm-scroll' });
    if (state.loading) {
      scroll.appendChild(el('p', { class: 'pm-empty', text: 'Loading photos…' }));
    } else if (state.error) {
      scroll.appendChild(el('p', { class: 'pm-error', text: state.error }));
      scroll.appendChild(el('button', { type: 'button', class: 'btn', text: 'Try again', onclick: loadManifest }));
    } else if (state.loaded) {
      if (state.adds.length) {
        const wrap = el('section', { class: 'pm-adds', 'aria-label': 'New photos' });
        wrap.appendChild(el('h2', { class: 'pm-section-title', text: 'New photos (' + state.adds.length + ')' }));
        const list = el('div', { class: 'pm-adds-list' });
        state.adds.forEach((a) => list.appendChild(renderAddRow(a)));
        wrap.appendChild(list);
        scroll.appendChild(wrap);
      }
      const live = state.photos.length;
      scroll.appendChild(el('h2', { class: 'pm-section-title', text: 'Current photos (' + live + ')' }));
      const grid = el('div', { class: 'pm-grid', id: 'pm-grid' });
      order.forEach((item, index) => {
        if (item.kind === 'add') return; // new photos already have a preview row; still show in grid too
        if (item.kind === 'photo') {
          const p = photoById(item.id);
          if (p) grid.appendChild(renderCard(p, index));
        }
      });
      // also show adds in the grid at their order position? They're in a section above.
      // Include add placeholders in grid if they were reordered into it.
      // Simpler: grid is current photos only; adds are in the top section with move into order via up/down on add rows? 
      // Reorder among current photos with up/down; new photos append in export order after their insert position.
      // I'll put add cards into the grid as well at their order index, and keep the edit form in the top section only.
      scroll.appendChild(grid);
    } else {
      scroll.appendChild(el('p', { class: 'pm-empty', text: 'Open Photos to load the Precious Memories set.' }));
    }
    root.appendChild(scroll);

    if (state.viewer) renderViewer();
    else {
      const existing = document.getElementById('pm-viewer');
      if (existing) existing.remove();
    }

    root.dataset.ready = state.loaded ? '1' : '0';
    root.dataset.count = String(state.photos.length);
    root.dataset.adds = String(state.adds.length);
    root.dataset.removals = String(state.removals.size);
    window.__photoManager = {
      ready: state.loaded,
      count: state.photos.length,
      adds: state.adds.length,
      removals: state.removals.size,
      exportPackage: buildPackage
    };
    const sc = document.getElementById('pm-scroll');
    if (sc) sc.scrollTop = prevScroll;
  }

  function countHtml() {
    if (state.loading) return 'Loading…';
    if (!state.loaded) return '';
    const parts = ['<strong>' + state.photos.length + '</strong> photos'];
    if (state.adds.length) parts.push('<strong>' + state.adds.length + '</strong> to add');
    if (state.removals.size) parts.push('<strong>' + state.removals.size + '</strong> marked to remove');
    return parts.join(' · ');
  }

  function renderCard(photo, index) {
    const marked = state.removals.has(photo.id);
    const card = el('article', { class: 'pm-card' + (marked ? ' marked' : ''), dataset: { id: photo.id } });
    const btn = el('button', { type: 'button', class: 'pm-thumb', 'aria-label': 'View ' + (photo.alt || photo.id), onclick: () => openViewer(photo.id) });
    const img = el('img', { alt: photo.alt || '', loading: 'lazy', decoding: 'async', src: photo.tv || photo.full });
    btn.appendChild(img);
    card.appendChild(btn);
    if (marked) card.appendChild(el('span', { class: 'pm-badge', text: 'Remove' }));
    const body = el('div', { class: 'pm-card-body' });
    body.appendChild(el('p', { class: 'pm-alt', text: photo.alt || photo.id }));
    const actions = el('div', { class: 'pm-actions' });
    if (marked) {
      actions.appendChild(el('button', { type: 'button', class: 'btn undo', text: 'Undo', onclick: () => { state.removals.delete(photo.id); render(); } }));
    } else {
      actions.appendChild(el('button', { type: 'button', class: 'btn warn', text: 'Remove', onclick: () => { state.removals.add(photo.id); render(); } }));
    }
    actions.appendChild(el('button', { type: 'button', class: 'pm-icon-btn', text: 'Up', 'aria-label': 'Move up', onclick: () => moveItem(index, -1) }));
    actions.appendChild(el('button', { type: 'button', class: 'pm-icon-btn', text: 'Down', 'aria-label': 'Move down', onclick: () => moveItem(index, 1) }));
    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function renderAddRow(add) {
    const row = el('article', { class: 'pm-add-row', dataset: { local: String(add.localId) } });
    const thumb = el('button', { type: 'button', class: 'pm-thumb', 'aria-label': 'Preview ' + add.name, onclick: () => openAddViewer(add.localId) });
    thumb.appendChild(el('img', { alt: add.alt || add.name, src: add.url }));
    row.appendChild(thumb);
    const meta = el('div', { class: 'pm-add-meta' });
    meta.appendChild(el('label', { for: 'pm-alt-' + add.localId, text: 'Alt text (SEO, max 125 characters, at most two phrases)' }));
    const ta = el('textarea', { id: 'pm-alt-' + add.localId, maxlength: String(ALT_MAX + 20) });
    ta.value = add.alt;
    ta.addEventListener('input', () => { add.alt = ta.value; refreshChar(add, meta); syncPhraseButtons(add, meta); });
    meta.appendChild(ta);
    const char = el('div', { class: 'pm-char' });
    char.dataset.role = 'char';
    meta.appendChild(char);
    const phrases = el('div', { class: 'pm-phrases', 'aria-label': 'SEO phrases, pick up to two' });
    SEO_PHRASES.forEach((p) => {
      const b = el('button', { type: 'button', text: p, 'aria-pressed': 'false' });
      b.dataset.phrase = p;
      b.addEventListener('click', () => togglePhrase(add, p, ta, meta));
      phrases.appendChild(b);
    });
    meta.appendChild(phrases);
    const actions = el('div', { class: 'pm-actions' });
    actions.appendChild(el('button', { type: 'button', class: 'btn', text: 'Suggest alt', onclick: () => {
      add.alt = suggestAlt(add.name);
      ta.value = add.alt;
      refreshChar(add, meta);
      syncPhraseButtons(add, meta);
    } }));
    actions.appendChild(el('button', { type: 'button', class: 'btn warn', text: 'Drop this photo', onclick: () => removeAdd(add.localId) }));
    meta.appendChild(actions);
    row.appendChild(meta);
    refreshChar(add, meta);
    syncPhraseButtons(add, meta);
    return row;
  }

  function refreshChar(add, meta) {
    const node = meta.querySelector('[data-role=char]');
    if (!node) return;
    const n = (add.alt || '').length;
    const hits = phraseHits(add.alt);
    let msg = n + ' / ' + ALT_MAX + ' characters';
    if (hits.length) msg += ' · ' + hits.length + ' phrase' + (hits.length === 1 ? '' : 's');
    node.textContent = msg + (n > ALT_MAX ? ' — over the limit' : hits.length > PHRASE_MAX ? ' — use at most two phrases' : '');
    node.classList.toggle('over', n > ALT_MAX || hits.length > PHRASE_MAX);
  }

  function syncPhraseButtons(add, meta) {
    const hits = phraseHits(add.alt);
    meta.querySelectorAll('.pm-phrases button').forEach((b) => {
      const on = hits.indexOf(b.dataset.phrase) !== -1;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function togglePhrase(add, phrase, ta, meta) {
    const hits = phraseHits(add.alt);
    const desc = stripPhrases(add.alt) || describeFromName(add.name);
    let next;
    if (hits.indexOf(phrase) !== -1) next = hits.filter((h) => h !== phrase);
    else if (hits.length >= PHRASE_MAX) next = hits.slice(0, PHRASE_MAX - 1).concat([phrase]);
    else next = hits.concat([phrase]);
    add.alt = withPhrases(desc, next);
    ta.value = add.alt;
    refreshChar(add, meta);
    syncPhraseButtons(add, meta);
  }

  function removeAdd(localId) {
    const i = state.adds.findIndex((a) => a.localId === localId);
    if (i < 0) return;
    const a = state.adds[i];
    if (a.url) URL.revokeObjectURL(a.url);
    state.adds.splice(i, 1);
    if (state.viewer && state.viewer.localId === localId) state.viewer = null;
    render();
  }

  function moveItem(index, dir) {
    const next = index + dir;
    if (next < 0 || next >= order.length) return;
    const tmp = order[index];
    order[index] = order[next];
    order[next] = tmp;
    render();
  }

  function onFiles(ev) {
    const files = ev.target.files ? Array.from(ev.target.files) : [];
    ev.target.value = '';
    files.forEach((file) => {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        if (file && /\.(jpe?g|png|webp|gif|heic|heif|avif|tif|tiff)$/i.test(file.name || '')) {
          /* iPhone sometimes omits type for HEIC; still accept */
        } else {
          return;
        }
      }
      const localId = ++state.addSeq;
      const id = uniqueId(slugFromName(file.name));
      const add = {
        localId,
        id,
        name: file.name || ('photo-' + localId + '.jpg'),
        file,
        alt: suggestAlt(file.name || 'photo'),
        url: URL.createObjectURL(file)
      };
      state.adds.push(add);
    });
    if (files.length) render();
  }

  function openViewer(id) {
    const photo = photoById(id);
    if (!photo) return;
    state.viewer = { kind: 'photo', id };
    renderViewer();
  }

  function openAddViewer(localId) {
    const add = state.adds.find((a) => a.localId === localId);
    if (!add) return;
    state.viewer = { kind: 'add', localId };
    renderViewer();
  }

  function closeViewer() {
    if (!state.viewer) return;
    state.viewer = null;
    const n = document.getElementById('pm-viewer');
    if (n) n.remove();
  }

  function renderViewer() {
    let node = document.getElementById('pm-viewer');
    if (node) node.remove();
    const v = state.viewer;
    if (!v) return;
    let src = '', alt = '', marked = false, title = '';
    if (v.kind === 'photo') {
      const p = photoById(v.id);
      if (!p) { state.viewer = null; return; }
      src = p.full || p.tv;
      alt = p.alt || p.id;
      marked = state.removals.has(p.id);
      title = p.id;
    } else {
      const a = state.adds.find((x) => x.localId === v.localId);
      if (!a) { state.viewer = null; return; }
      src = a.url;
      alt = a.alt || a.name;
      title = a.name;
    }
    node = el('div', { class: 'pm-overlay', id: 'pm-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': alt });
    node.addEventListener('click', (e) => { if (e.target === node) closeViewer(); });
    const fig = el('figure');
    fig.appendChild(el('img', { src: src, alt: alt }));
    fig.appendChild(el('figcaption', { text: alt }));
    node.appendChild(fig);
    const bar = el('div', { class: 'pm-overlay-bar' });
    bar.appendChild(el('button', { type: 'button', class: 'btn', text: 'Close', onclick: closeViewer }));
    if (v.kind === 'photo') {
      if (marked) {
        bar.appendChild(el('button', { type: 'button', class: 'btn', text: 'Undo remove', onclick: () => { state.removals.delete(v.id); render(); } }));
      } else {
        bar.appendChild(el('button', { type: 'button', class: 'btn warn', text: 'Mark to remove', onclick: () => { state.removals.add(v.id); render(); } }));
      }
    }
    node.appendChild(bar);
    document.body.appendChild(node);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.viewer) {
      e.preventDefault();
      closeViewer();
    }
  });

  function hasChanges() {
    if (state.adds.length || state.removals.size) return true;
    const orig = state.originalOrder.slice();
    const now = order.filter((i) => i.kind === 'photo').map((i) => i.id);
    if (now.length !== orig.length) return true;
    for (let i = 0; i < now.length; i++) if (now[i] !== orig[i]) return true;
    return false;
  }

  async function buildPackage() {
    const removals = [];
    state.originalOrder.forEach((id) => {
      if (!state.removals.has(id)) return;
      const p = photoById(id);
      if (!p) return;
      removals.push({
        id: p.id,
        filename: filenameOf(p),
        tv: p.tv || '',
        full: p.full || ''
      });
    });
    const finalOrder = [];
    order.forEach((item) => {
      if (item.kind === 'photo' && !state.removals.has(item.id)) finalOrder.push(item.id);
    });
    state.adds.forEach((a) => finalOrder.push(a.id));
    const adds = [];
    const files = [];
    for (const a of state.adds) {
      const raw = new Uint8Array(await a.file.arrayBuffer());
      const ext = extOf(a.name, a.file.type);
      const fileName = 'adds/' + a.id + ext;
      adds.push({
        id: a.id,
        file: fileName,
        originalName: a.name,
        alt: String(a.alt || '').slice(0, ALT_MAX + 20),
        insertAfter: previousId(a)
      });
      files.push({ name: fileName, data: raw });
    }
    const changes = {
      version: 1,
      kind: 'precious-memories-photo-changes',
      exportedAt: new Date().toISOString(),
      sourceCount: state.photos.length,
      adds: adds,
      removals: removals,
      order: finalOrder
    };
    const json = new TextEncoder().encode(JSON.stringify(changes, null, 2));
    files.unshift({ name: 'changes.json', data: json });
    const zip = buildZip(files);
    return { zip, changes, filename: 'precious-memories-changes.zip' };
  }

  function previousId(add) {
    const idx = state.adds.findIndex((a) => a.localId === add.localId);
    if (idx > 0) return state.adds[idx - 1].id;
    for (let i = order.length - 1; i >= 0; i--) {
      if (order[i].kind === 'photo' && !state.removals.has(order[i].id)) return order[i].id;
    }
    return null;
  }

  function extOf(name, type) {
    const m = /\.(jpe?g|png|webp|gif|heic|heif|avif|tif|tiff)$/i.exec(name || '');
    if (m) return m[0].toLowerCase() === '.jpeg' ? '.jpg' : m[0].toLowerCase();
    if (type === 'image/jpeg') return '.jpg';
    if (type === 'image/png') return '.png';
    if (type === 'image/webp') return '.webp';
    if (type === 'image/gif') return '.gif';
    if (type === 'image/heic' || type === 'image/heif') return '.heic';
    return '.img';
  }

  async function onExport() {
    const status = document.getElementById('pm-count');
    if (!state.loaded) return;
    if (!hasChanges()) {
      if (status) status.textContent = 'No changes to export yet.';
      return;
    }
    const bad = state.adds.filter((a) => !String(a.alt || '').trim() || String(a.alt).length > ALT_MAX || phraseHits(a.alt).length > PHRASE_MAX);
    if (bad.length) {
      if (status) {
        status.innerHTML = 'Fix alt text on new photos first (required, max 125 characters, at most two SEO phrases).';
        status.classList.add('over');
      }
      return;
    }
    try {
      if (status) status.textContent = 'Building export…';
      const pack = await buildPackage();
      const blob = new Blob([pack.zip], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pack.filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      if (status) {
        const nR = pack.changes.removals.length;
        const nA = pack.changes.adds.length;
        status.innerHTML = 'Downloaded <strong>' + pack.filename + '</strong> — send it back to be applied. Removals need your yes on the exact list first' + (nR ? ' (' + nR + ' marked)' : '') + (nA ? '; ' + nA + ' to add' : '') + '.';
      }
    } catch (err) {
      if (status) status.textContent = 'Export failed: ' + ((err && err.message) || 'unknown error');
    }
  }

  /* Minimal ZIP (STORE). No external library, so this page stays self-contained. */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(n) {
    const b = new Uint8Array(2);
    b[0] = n & 0xFF; b[1] = (n >>> 8) & 0xFF;
    return b;
  }
  function u32(n) {
    const b = new Uint8Array(4);
    b[0] = n & 0xFF; b[1] = (n >>> 8) & 0xFF; b[2] = (n >>> 16) & 0xFF; b[3] = (n >>> 24) & 0xFF;
    return b;
  }
  function concat(parts) {
    let len = 0;
    for (let i = 0; i < parts.length; i++) len += parts[i].length;
    const out = new Uint8Array(len);
    let o = 0;
    for (let i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  function dosDateTime(d) {
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { dosTime, dosDate };
  }

  function buildZip(files) {
    const now = new Date();
    const { dosTime, dosDate } = dosDateTime(now);
    const locals = [];
    const centrals = [];
    let offset = 0;
    const enc = new TextEncoder();
    for (let i = 0; i < files.length; i++) {
      const name = enc.encode(files[i].name);
      const data = files[i].data;
      const crc = crc32(data);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0),
        name, data
      ]);
      const central = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset),
        name
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const localAll = concat(locals);
    const centralAll = concat(centrals);
    const end = concat([
      u32(0x06054b50), u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(centralAll.length), u32(localAll.length),
      u16(0)
    ]);
    return concat([localAll, centralAll, end]);
  }

  layoutBtn.addEventListener('click', () => setMode('layout'));
  photosBtn.addEventListener('click', () => setMode('photos'));
})();
