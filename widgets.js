/*
 * Site apps (home-v2: formerly "widgets"; ids are app ids, permanent). Each app is an individual module and its own
 * failure domain (a throw in one never touches the others or the scene). Each follows the harness module contract:
 *   { id, title, icon, iconSrc?, mount(el, api), unmount? }
 * Retired placeholders stay in this file (no deleting) but are not in the
 * exported `widgets` list, so they do not appear on the home ring.
 */

const CONTACT_ENDPOINT = 'https://thecurltapes.netlify.app/api/bz-contact';
const MAILTO_FALLBACK = 'blake@blakezuniga.com';

const CONTACT_CSS =
  '.bz-form{display:flex;flex-direction:column;gap:12px;max-width:100%}' +
  '.bz-form label{display:flex;flex-direction:column;gap:6px;' +
  'font-family:"Zuniga Mission",system-ui,-apple-system,sans-serif;' +
  'font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:rgba(241,233,230,.88)}' +
  '.bz-form input,.bz-form textarea{box-sizing:border-box;width:100%;margin:0;' +
  'padding:12px 12px;color:#f4ecea;background:rgba(255,255,255,.06);' +
  'border:1px solid rgba(255,255,255,.18);border-radius:12px;' +
  'font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
  'outline:none;-webkit-appearance:none}' +
  '.bz-form textarea{min-height:8em;resize:vertical}' +
  '.bz-form input:focus,.bz-form textarea:focus{border-color:#ff6b5a}' +
  '.bz-hp{position:absolute;left:-9999px;height:0;width:0;overflow:hidden}' +
  '.bz-send{align-self:flex-start;margin-top:4px;padding:12px 22px;min-height:44px;' +
  'color:#fff4f0;background:rgba(255,107,90,.85);border:1px solid rgba(255,255,255,.22);' +
  'border-radius:999px;font-family:"Zuniga Mission",system-ui,sans-serif;' +
  'font-size:16px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;' +
  'touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
  '.bz-send:disabled{opacity:.6;cursor:default}' +
  '.bz-status{margin:0;min-height:1.4em;font:15px/1.5 system-ui,-apple-system,sans-serif}' +
  '.bz-status[data-kind="ok"]{color:#b8f0c8}' +
  '.bz-status[data-kind="err"]{color:#ffb4a8}' +
  '.bz-status a{color:#ff8a7a}';

function placeholder(id, title, icon) {
  return {
    id,
    title,
    icon,
    mount(el) {
      const h = document.createElement('h3');
      h.textContent = title;
      const p = document.createElement('p');
      p.textContent = 'Coming soon.';
      el.append(h, p);
    },
  };
}

// Retired from the home ring (Blake t107u). Code left in place; ids moved to RETIRED.
export const retiredPlaceholders = [
  placeholder('about', 'About', 'i'),
  placeholder('music', 'Music', '♪'),
  placeholder('videos', 'Videos', '▶'),
  placeholder('shop', 'Shop', '◇'),
];

function field(name, label, opts) {
  const wrap = document.createElement('label');
  const t = document.createElement('span');
  t.textContent = label;
  const input = document.createElement(opts.multiline ? 'textarea' : 'input');
  if (!opts.multiline) input.type = opts.type || 'text';
  input.name = name;
  input.autocomplete = opts.autocomplete || 'on';
  if (opts.required) input.required = true;
  if (opts.maxlength) input.maxLength = opts.maxlength;
  if (opts.inputmode) input.inputMode = opts.inputmode;
  wrap.append(t, input);
  return { wrap, input };
}

function contactWidget() {
  let cleanup = [];
  return {
    id: 'contact',
    title: 'Contact',
    icon: '✉',
    mount(el) {
      cleanup = [];
      const shadow = el.getRootNode();
      const style = document.createElement('style');
      style.textContent = CONTACT_CSS;
      shadow.append(style);

      const panel = shadow.host && shadow.host.closest ? shadow.host.closest('.zg-panel') : null;
      if (panel && window.visualViewport) {
        panel.classList.add('zg-panel--form');
        const fit = () => {
          const h = window.visualViewport.height;
          panel.style.maxHeight = h + 'px';
          panel.style.height = Math.min(Math.max(h - 16, 200), 640) + 'px';
        };
        fit();
        window.visualViewport.addEventListener('resize', fit);
        window.visualViewport.addEventListener('scroll', fit);
        cleanup.push(() => {
          window.visualViewport.removeEventListener('resize', fit);
          window.visualViewport.removeEventListener('scroll', fit);
          panel.classList.remove('zg-panel--form');
          panel.style.maxHeight = '';
          panel.style.height = '';
        });
      }

      const form = document.createElement('form');
      form.className = 'bz-form';
      form.noValidate = true;

      const nameF = field('name', 'Name', { required: true, maxlength: 200, autocomplete: 'name' });
      const emailF = field('email', 'Email', { type: 'email', required: true, maxlength: 254, autocomplete: 'email' });
      const phoneF = field('phone', 'Phone (optional)', { type: 'tel', maxlength: 40, autocomplete: 'tel', inputmode: 'tel' });
      const msgF = field('message', 'Message', { required: true, maxlength: 5000, multiline: true });

      const hp = document.createElement('input');
      hp.type = 'text';
      hp.name = 'website';
      hp.tabIndex = -1;
      hp.autocomplete = 'off';
      hp.setAttribute('aria-hidden', 'true');
      const hpWrap = document.createElement('div');
      hpWrap.className = 'bz-hp';
      hpWrap.append(hp);

      const send = document.createElement('button');
      send.type = 'submit';
      send.className = 'bz-send';
      send.textContent = 'Send';

      const status = document.createElement('p');
      status.className = 'bz-status';
      status.setAttribute('role', 'status');

      form.append(nameF.wrap, emailF.wrap, phoneF.wrap, msgF.wrap, hpWrap, send, status);
      el.append(form);

      const setStatus = (kind, text, link) => {
        status.dataset.kind = kind || '';
        status.textContent = '';
        status.append(document.createTextNode(text));
        if (link) {
          status.append(document.createTextNode(' '));
          status.append(link);
        }
      };

      const mailtoLink = (name, email, phone, message) => {
        const a = document.createElement('a');
        const body = 'Name: ' + name + '\nEmail: ' + email + (phone ? '\nPhone: ' + phone : '') + '\n\n' + message;
        a.href = 'mailto:' + MAILTO_FALLBACK +
          '?subject=' + encodeURIComponent('Message from ' + name) +
          '&body=' + encodeURIComponent(body);
        a.textContent = 'Email blake@blakezuniga.com instead';
        return a;
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameF.input.value.trim();
        const email = emailF.input.value.trim();
        const phone = phoneF.input.value.trim();
        const message = msgF.input.value.trim();
        const website = hp.value;
        if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length >= 255) {
          setStatus('err', 'Please leave your name, a valid email, and a message.');
          return;
        }
        send.disabled = true;
        setStatus('', 'Sending…');
        try {
          const res = await fetch(CONTACT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, message, website }),
          });
          let json = null;
          try { json = await res.json(); } catch (_) { json = null; }
          if (res.ok && json && json.ok) {
            setStatus('ok', 'Thanks, your message was sent.');
            form.reset();
          } else {
            setStatus('err', 'Sorry, the message could not be sent.', mailtoLink(name, email, phone, message));
          }
        } catch (_) {
          setStatus('err', 'Sorry, the message could not be sent.', mailtoLink(name, email, phone, message));
        } finally {
          send.disabled = false;
        }
      });
    },
    unmount() {
      cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
      cleanup = [];
    },
  };
}

function collaborativeProjectsWidget() {
  return {
    id: 'collaborative-projects',
    title: 'Collaborative Projects',
    icon: '◎',
    iconSrc: 'assets/curl-tapes-faces.png',
    href: 'https://thecurltapes.com',
    // The tile is a real <a target=_blank rel=noopener>. mount is unused (the harness never opens a panel).
    mount() { /* no in-page popup */ },
  };
}

// amp12 (Blake t208u): Photos widget. The photo UI lives in photos.js, imported lazily on first open (no photo request and no
// photos.js fetch before the tile is tapped). Contract: mountPhotos(el, { manifestUrl }) -> { unmount() }. Handled failures
// (module or manifest cannot load) are shown inside the panel and logged with console.warn, never thrown.
function photosWidget() {
  let handle = null;
  let gone = false;
  return {
    id: 'photos',
    title: 'Photos',
    icon: '▣',
    iconSrc: 'assets/photos-icon.svg',
    panel: 'wide',
    async mount(el, api) {
      gone = false;
      handle = null;
      try {
        const mod = await import('./photos.js');
        if (gone) return;
        handle = mod.mountPhotos(el, { manifestUrl: new URL('photos/photos.json', import.meta.url).href, onBack: () => api.close() });
      } catch (err) {
        console.warn('[photos] could not load the photos module', err);
        if (gone) return;
        const p = document.createElement('p');
        p.setAttribute('role', 'status');
        p.textContent = 'Photos are not available right now. Please try again later.';
        el.append(p);
      }
    },
    unmount() {
      gone = true;
      if (handle && typeof handle.unmount === 'function') {
        try { handle.unmount(); } catch (err) { console.warn('[photos] unmount failed', err); }
      }
      handle = null;
    },
  };
}

export const widgets = [
  contactWidget(),
  collaborativeProjectsWidget(),
  photosWidget(),   // amp12 (Blake t208u)
];

// TEST-ONLY: deliberately broken widget, registered only with ?selftest=1.
export const brokenWidget = {
  id: 'selftest-broken',
  title: 'Broken (test)',
  icon: '!',
  mount() {
    throw new Error('selftest: deliberate failure');
  },
};
