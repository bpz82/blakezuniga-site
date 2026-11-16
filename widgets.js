/*
 * Placeholder widgets. Each one follows the harness module contract:
 *   { id, title, icon, mount(el, api), unmount? }
 * They render only a heading and "Coming soon." until real modules replace them.
 */

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

export const widgets = [
  placeholder('about', 'About', 'i'),
  placeholder('music', 'Music', '♪'),
  placeholder('videos', 'Videos', '▶'),
  placeholder('shop', 'Shop', '◇'),
  placeholder('contact', 'Contact', '✉'),
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
