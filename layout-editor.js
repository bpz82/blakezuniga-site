(function () {
  const VIEWS = { desktop: [1280, 800], phone: [393, 852] };
  const ITEMS = [
    ['guitar', 'Guitar'], ['amp', 'Amp'], ['panel', 'Panel'], ['title', 'Title'],
    ['neon', 'Sign'], ['tiles', 'Tiles'], ['explore', 'Explore'], ['camera', 'Camera']
  ];
  const iframe = document.getElementById('stage');
  const clip = document.getElementById('stage-clip');
  const chips = document.getElementById('chips');
  const sliders = document.getElementById('sliders');
  const status = document.getElementById('status');
  const btnDesk = document.getElementById('btn-desk');
  const btnPhone = document.getElementById('btn-phone');

  let view = 'desktop';
  let selected = null;
  let state = { ready: false, values: null, doc: { version: 1, desktop: {}, phone: {} } };
  let loadGen = 0;

  ITEMS.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.id = id; b.textContent = label;
    b.addEventListener('click', () => send({ type: 'le:select', id }));
    chips.appendChild(b);
  });

  function send(msg) {
    try { iframe.contentWindow && iframe.contentWindow.postMessage(msg, '*'); } catch (_) { }
  }

  function setView(next, force) {
    if (next !== 'desktop' && next !== 'phone') return;
    if (!force && next === view) return;
    view = next;
    btnDesk.classList.toggle('on', view === 'desktop');
    btnPhone.classList.toggle('on', view === 'phone');
    btnDesk.setAttribute('aria-pressed', view === 'desktop' ? 'true' : 'false');
    btnPhone.setAttribute('aria-pressed', view === 'phone' ? 'true' : 'false');
    const [w, h] = VIEWS[view];
    iframe.width = w; iframe.height = h;
    iframe.style.width = w + 'px';
    iframe.style.height = h + 'px';
    sizeFrame();
    const already = (() => { try { return !!(iframe.contentWindow && iframe.contentWindow.__layoutEditor); } catch (_) { return false; } })();
    if (force || !already) {
      loadGen++;
      state.ready = false;
      status.textContent = 'Loading ' + (view === 'phone' ? 'phone' : 'desktop') + ' view…';
      status.className = '';
      iframe.src = 'index.html?edit=1&view=' + view;
      selected = null;
      renderChips();
      sliders.hidden = true;
    } else {
      status.textContent = (view === 'phone' ? 'Phone' : 'Desktop') + ' view — drag to place.';
      status.className = 'ok';
      send({ type: 'le:ping' });
    }
  }

  function sizeFrame() {
    const [w, h] = VIEWS[view];
    const wrap = document.getElementById('stage-wrap');
    const pad = 16;
    const maxW = Math.max(80, wrap.clientWidth - pad);
    const maxH = Math.max(80, wrap.clientHeight - pad);
    const s = Math.min(1, maxW / w, maxH / h);
    clip.style.width = Math.round(w * s) + 'px';
    clip.style.height = Math.round(h * s) + 'px';
    iframe.style.transform = 'scale(' + s + ')';
  }

  function renderChips() {
    chips.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.id === selected));
  }

  function sliderRow(id, label, min, max, step, value) {
    const row = document.createElement('div');
    row.className = 'sl';
    const lab = document.createElement('label'); lab.textContent = label; lab.setAttribute('for', 'sl-' + id);
    const inp = document.createElement('input');
    inp.type = 'range'; inp.id = 'sl-' + id; inp.min = min; inp.max = max; inp.step = step;
    inp.value = value != null && isFinite(value) ? value : (min + max) / 2;
    const val = document.createElement('span'); val.className = 'val';
    const fmt = () => {
      const n = +inp.value;
      val.textContent = (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(2));
    };
    fmt();
    inp.addEventListener('input', () => { fmt(); onSlider(id, +inp.value); });
    row.appendChild(lab); row.appendChild(inp); row.appendChild(val);
    return row;
  }

  function onSlider(id, value) {
    if (!selected) return;
    const props = {};
    if (selected === 'camera') {
      if (id === 'k') props.k = value;
      if (id === 'pitch') props.pitch = value;
      if (id === 'yaw') props.yaw = value;
    } else if (selected === 'panel' && (id === 'w' || id === 'h' || id === 'rz' || id === 'ry' || id === 'rx')) {
      props[id] = value;
    } else if (id === 's') props.s = value;
    else if (id === 'ry' || id === 'rz' || id === 'rx') props[id] = value;
    send({ type: 'le:set', id: selected, props });
  }

  function renderSliders() {
    sliders.innerHTML = '';
    if (!selected) { sliders.hidden = true; return; }
    sliders.hidden = false;
    const v = state.values || {};
    if (selected === 'camera') {
      sliders.appendChild(sliderRow('k', 'Zoom', 1, 2.5, 0.01, v.k != null ? v.k : 1));
      sliders.appendChild(sliderRow('pitch', 'Height', 0.05, 1.2, 0.01, v.pitch != null ? v.pitch : 0.55));
      sliders.appendChild(sliderRow('yaw', 'Turn', -1.2, 1.2, 0.01, v.yaw != null ? v.yaw : 0));
      return;
    }
    if (selected === 'panel') {
      sliders.appendChild(sliderRow('w', 'Width', 0.15, 1.1, 0.01, v.w != null ? v.w : 0.5));
      sliders.appendChild(sliderRow('h', 'Height', 0.1, 1.0, 0.01, v.h != null ? v.h : 0.35));
      sliders.appendChild(sliderRow('rz', 'Tilt', -1, 1, 0.01, v.rz || 0));
      sliders.appendChild(sliderRow('ry', 'Turn', -1.2, 1.2, 0.01, v.ry || 0));
      return;
    }
    if (selected === 'guitar' || selected === 'amp') {
      sliders.appendChild(sliderRow('s', 'Size', 0.3, 4, 0.01, v.s != null ? v.s : 1));
      sliders.appendChild(sliderRow('ry', 'Rotate', -3.14, 3.14, 0.01, v.ry || 0));
      sliders.appendChild(sliderRow('rx', 'Tilt', -1.2, 1.2, 0.01, v.rx || 0));
      return;
    }
    sliders.appendChild(sliderRow('s', 'Size', 0.3, 3, 0.01, v.s != null ? v.s : 1));
    if (selected === 'title' || selected === 'neon') {
      sliders.appendChild(sliderRow('rz', 'Rotate', -1, 1, 0.01, v.rz || 0));
    }
  }

  let sliderLock = false;
  function refreshSlidersFromState() {
    if (sliderLock || !selected || sliders.hidden) return;
    const v = state.values || {};
    sliders.querySelectorAll('input[type=range]').forEach((inp) => {
      if (document.activeElement === inp) return;
      const key = inp.id.replace(/^sl-/, '');
      if (v[key] != null && isFinite(v[key])) {
        inp.value = v[key];
        const val = inp.parentNode.querySelector('.val');
        const n = +inp.value;
        if (val) val.textContent = (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(2));
      }
    });
  }

  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type !== 'le:state' && m.type !== 'le:ready') return;
    if (m.type === 'le:ready' || m.boot) {
      state.ready = true;
      status.textContent = 'Ready — drag things into place.';
      status.className = 'ok';
    }
    if (m.doc) state.doc = m.doc;
    if (m.values !== undefined) state.values = m.values;
    if (m.selected !== undefined && m.selected !== selected) {
      selected = m.selected;
      renderChips();
      renderSliders();
    } else if (m.values) {
      refreshSlidersFromState();
    }
    if (m.ready && !state.ready) {
      state.ready = true;
      status.textContent = 'Ready — drag things into place.';
      status.className = 'ok';
    }
  });

  function currentJSON() { return JSON.stringify(state.doc || { version: 1, desktop: {}, phone: {} }, null, 2); }

  document.getElementById('btn-copy').addEventListener('click', async () => {
    const text = currentJSON();
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'JSON copied. Send it back to apply it on the site.';
      status.className = 'ok';
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); status.textContent = 'JSON copied. Send it back to apply it on the site.'; status.className = 'ok'; }
      catch (e2) { status.textContent = 'Copy failed — use Download instead.'; status.className = ''; }
      ta.remove();
    }
  });

  document.getElementById('btn-dl').addEventListener('click', () => {
    const blob = new Blob([currentJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'layout.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status.textContent = 'Downloaded layout.json. Send that file back to apply it on the site.';
    status.className = 'ok';
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Reset the ' + view + ' layout to the automatic placement? This only clears this view, and only on this phone or computer.')) return;
    status.textContent = 'Resetting…';
    status.className = '';
    send({ type: 'le:reset', viewport: view });
    // The iframe reloads itself; if the message is missed, force it after a moment.
    setTimeout(() => {
      if (iframe.contentWindow && iframe.contentWindow.location) {
        try { if (!iframe.contentWindow.__layoutEditor) setView(view, true); } catch (_) { }
      }
    }, 800);
  });

  btnDesk.addEventListener('click', () => setView('desktop'));
  btnPhone.addEventListener('click', () => setView('phone'));
  addEventListener('resize', sizeFrame);
  addEventListener('orientationchange', () => setTimeout(sizeFrame, 200));

  setView('desktop', true);
})();
