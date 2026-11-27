// t495u-bz-seo-ai (Blake t495u, "Yeah do all that", 6:09 PM ET Nov 27 2026, + 6:10 PM correction): under-the-hood SEO / AI-search
// fixes with NOTHING new for visitors. Blake confirmed he is a FORMER member of The Curl Tapes (no end date known; none invented).
// Runs: Node, no browser, no deps. Runtime < 1 s. Exit 0 = PASS, 1 = FAIL, 2 = ENV (git cannot read the baseline).
// Protects:
//   A. the hidden 1px .seo-copy block and its CSS rule are gone; the <noscript> no-JS fallback stays, byte-identical to the
//      baseline (same h1 + bio), and the bio exists nowhere else in the markup (no second hidden copy).
//   B. JSON-LD parses; @ids stable; Person #blake description carries the official-site / Blake Z / Zuniga Music / former member
//      of The Curl Tapes / Zuniga Volume One facts; the band relation is a former-member relation (OrganizationRole roleName
//      "former member", or alumniOf plus "former member" wording), never an unqualified member / memberOf; no endDate invented;
//      sameAs = only verified URLs, Curl Tapes about page in apex slash form, no www.thecurltapes.com / instagram / bandcamp /
//      music.apple.com/profile; target phrases still in the Person / WebSite graph; tiny Collection #vinyl-vault keeps
//      creator #blake, gains url, no inlined albums; index.html points at collection.jsonld with ONE rel=alternate link only.
//   C. /llms.txt exists at the site root, plain text (no HTML), says former member of The Curl Tapes, names blakezuniga.com, the
//      key pages and @ids, and the six phrases (Blake Zuniga, Blake Z Music, Zuniga, Zuniga Music, Blake Zuniga guitar,
//      folk blues) without stuffing; no secrets.
//   D. no visitor-visible or load-time change: same <script>/<link> tags as baseline except that one alternate link (not
//      preloaded, not a script); index.html identical to baseline outside JSON-LD once the approved removals/addition are
//      undone; CSS/JS/records/collection/sitemap files byte-identical; no hidden-text CSS anywhere in index.html, and no CSS
//      file gains any; index.html gzip-6 / gzip-9 deltas reported and must each be < 1024 B.
// MEASUREMENT METHOD: baseline = git object 58d2532 (live main when t495u started), read with `git show 58d2532:<path>`.
// Evidence (new check: FAIL before, PASS after), logs under /workspace/website/seo-ai-fix-20261127-notes/logs/bz/:
//   before (untouched 58d2532 worktree, first draft of this file): t495u-before.log -> FAIL (exit 1, 19 failing)
//   before (58d2532 extract, final version of this file):          t495u-before-final.log -> FAIL (exit 1)
//   after  (t495u implementation):                                 t495u-after.log  -> PASS (exit 0)
//   Draft fix disclosed: the first draft's "no second copy" test also scanned <head>, so the unchanged <title> / meta
//   descriptions ("formerly of The Curl Tapes") failed it on the fixed tree too; it now scans <body> only (the hidden
//   .seo-copy div lived there). Copies of these logs: checks/logs/t495u-bz-seo-ai-*.log.
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const BASE = '58d2532b1ecccf4f22da5d6b5051f9b61b0b5c6e';
const SITE = 'https://blakezuniga.com/';
const ID = { website: SITE + '#website', blake: SITE + '#blake', zuniga: SITE + '#zuniga', profile: SITE + '#profilepage', vault: SITE + '#vinyl-vault', band: 'https://thecurltapes.com/#band' };
const ABOUT = 'https://thecurltapes.com/aboutpage/blakezuniga/';
const SAMEAS_OK = new Set([
  'https://www.youtube.com/@blakezmusic', 'https://link.me/bpz82', 'https://bzmp.carrd.co/', ABOUT,
  'https://open.spotify.com/show/3E3xb4zOz9kBCKBmEE7L7v',
  'https://podcasts.apple.com/us/podcast/blake-zs-music-philosophy/id1796681949',
  'https://www.pandora.com/podcast/blake-zs-music-philosophy/PC:1001099386',
]);
const SAMEAS_KEEP = ['https://www.youtube.com/@blakezmusic', 'https://link.me/bpz82', 'https://bzmp.carrd.co/', ABOUT];
const BIO = 'Blake Z, also known as Blake Zuniga, is a blues folk guitarist and songwriter. This is the official website for Blake Z music and Zuniga Music. Blake Z was formerly of The Curl Tapes and is now working on Zuniga Volume One.';
const H1 = 'Blake Z (Blake Zuniga) — Music';
const ALT_LINK = '<link rel="alternate" type="application/ld+json" href="apps/vinyl-vault/collection.jsonld">';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = (p) => existsSync(path.join(root, p));
const rdB = (p) => (has(p) ? readFileSync(path.join(root, p)) : null);
const rd = (p) => { const b = rdB(p); return b ? b.toString('utf8') : null; };
function base(p) {
  try { return execFileSync('git', ['-C', root, 'show', `${BASE}:${p}`], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); }
  catch (_) { return null; }
}
const baseHtmlB = base('index.html');
if (!baseHtmlB) { console.log(`ENV cannot read baseline ${BASE} with git`); process.exit(2); }
const baseHtml = baseHtmlB.toString('utf8');
const html = rd('index.html') || '';
let fails = 0;
const t = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const info = (s) => console.log(`     ${s}`);
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;
const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

// ---------------- A. no hidden copy; noscript fallback kept ----------------
t('A. no .seo-copy CSS rule or element left in index.html', !/seo-copy/.test(html), `${count(html, /seo-copy/)} mention(s)`);
const nsOf = (h) => [...h.matchAll(/<noscript\b([^>]*)>([\s\S]*?)<\/noscript>/g)];
const ns = nsOf(html), ns0 = nsOf(baseHtml);
t('A. exactly one <noscript> block', ns.length === 1, `${ns.length}`);
const nsBody = ns[0] ? ns[0][2] : '';
t('A. <noscript> has no attributes (not styled or hidden)', !!ns[0] && ns[0][1].trim() === '');
t('A. <noscript> is byte-identical to the baseline fallback (same facts)', ns0.length === 1 && nsBody === ns0[0][2]);
t('A. <noscript> holds one h1 and the existing bio', count(nsBody, /<h1\b/) === 1 && nsBody.includes(`<h1>${H1}</h1>`) && nsBody.includes(`<p>${BIO}</p>`));
// <body> markup with every script / style / noscript removed = the DOM text a JS visitor's page holds, shown or hidden
// (the <head> <title> / meta descriptions are search snippets, not page copy, and are unchanged from the baseline)
const strip = (h) => h.slice(Math.max(0, h.indexOf('<body'))).replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<noscript\b[\s\S]*?<\/noscript>/g, '');
const rest = strip(html);
const bioBits = ['official website for Blake Z music', 'formerly of The Curl Tapes', 'also known as Blake Zuniga', H1];
const dup = bioBits.filter((b) => rest.includes(b));
t('A. bio / h1 appear nowhere outside <noscript> (no second hidden copy)', dup.length === 0 && count(rest, /<h1\b/) === 0, dup.join(' | '));

// ---------------- B. JSON-LD ----------------
const blocks = [...html.matchAll(LD_RE)].map((m) => m[1]);
let graph = null;
try { graph = blocks.length === 1 ? JSON.parse(blocks[0])['@graph'] : null; } catch (e) { info('JSON-LD parse error: ' + e.message); }
t('B. index.html has one JSON-LD block and it parses', Array.isArray(graph), `${blocks.length} block(s)`);
graph = graph || [];
const node = (id) => graph.find((n) => n && n['@id'] === id);
const P = node(ID.blake) || {}, W = node(ID.website) || {};
t('B. @ids stable: #website, #blake, #zuniga, #profilepage, #vinyl-vault', [ID.website, ID.blake, ID.zuniga, ID.profile, ID.vault].every((i) => node(i)));
t('B. node types unchanged (WebSite, Person, MusicGroup, ProfilePage, Collection)', W['@type'] === 'WebSite' && P['@type'] === 'Person' &&
  (node(ID.zuniga) || {})['@type'] === 'MusicGroup' && (node(ID.profile) || {})['@type'] === 'ProfilePage' && (node(ID.vault) || {})['@type'] === 'Collection');
const d = String(P.description || '');
info('Person description: ' + d);
const facts = [
  ['Blake Z', /\bBlake Z\b/], ['Blake Zuniga', /Blake Zuniga/], ['blues folk guitarist and songwriter', /blues folk guitarist and songwriter/i],
  ['official website for Blake Z music and Zuniga Music', /official website for Blake Z music and Zuniga Music/i],
  ['former member of The Curl Tapes', /former member of The Curl Tapes/], ['Zuniga Volume One', /Zuniga Volume One/],
];
const miss = facts.filter(([, re]) => !re.test(d)).map(([n]) => n);
t('B. Person #blake description carries the official-site / Blake Z / Zuniga Music / former member / Zuniga Volume One facts', !miss.length, miss.length ? 'missing: ' + miss.join(', ') : '');
t('B. description never calls him a current member ("member of The Curl Tapes" only after "former")', !/(?<!former )member of The Curl Tapes/i.test(d));

// band relation: walk Person, collect every place #band is reached and through what
const refsToBand = [];
const walk = (v, via, inRole) => {
  if (Array.isArray(v)) { v.forEach((x) => walk(x, via, inRole)); return; }
  if (!v || typeof v !== 'object') return;
  if (v['@id'] === ID.band) refsToBand.push({ via, inRole });
  const role = v['@type'] === 'OrganizationRole' || v['@type'] === 'Role' ? v : null;
  for (const [k, x] of Object.entries(v)) if (!k.startsWith('@')) walk(x, k, role || inRole);
};
for (const [k, x] of Object.entries(P)) if (!k.startsWith('@')) walk(x, k, null);
const viaRole = refsToBand.filter((r) => r.inRole && /^former member$/i.test(String(r.inRole.roleName || '')) && (r.via === 'alumniOf' || r.via === 'memberOf'));
const viaAlumni = refsToBand.filter((r) => !r.inRole && r.via === 'alumniOf');
const bare = refsToBand.filter((r) => !r.inRole && (r.via === 'memberOf' || r.via === 'member'));
info(`Person -> #band references: ${JSON.stringify(refsToBand.map((r) => (r.inRole ? `${r.inRole['@type']}(${r.inRole.roleName})/` : '') + r.via))}`);
t('B. band relation is former-member (OrganizationRole roleName "former member", or alumniOf + "former member" wording)',
  viaRole.length > 0 || (viaAlumni.length > 0 && /former member/.test(d)));
t('B. no unqualified current member / memberOf of #band from Person', bare.length === 0);
const memberOfBlake = graph.some((n) => JSON.stringify(n.member || null).includes(ID.blake));
t('B. no node lists #blake as a current member', !memberOfBlake);
t('B. no endDate / startDate invented in the Person graph', !/"(endDate|startDate)"/.test(JSON.stringify(P)));

const sameAs = Array.isArray(P.sameAs) ? P.sameAs : [];
info('Person sameAs: ' + JSON.stringify(sameAs));
t('B. Person sameAs keeps youtube, link.me, carrd and the apex slash Curl Tapes about URL', SAMEAS_KEEP.every((u) => sameAs.includes(u)));
t('B. Person sameAs holds only verified URLs (no duplicates)', sameAs.every((u) => SAMEAS_OK.has(u)) && new Set(sameAs).size === sameAs.length,
  sameAs.filter((u) => !SAMEAS_OK.has(u)).join(', '));
const ldAll = blocks.join('\n');
t('B. JSON-LD has no www.thecurltapes.com, instagram, bandcamp or music.apple.com/profile', !/www\.thecurltapes\.com|instagram|bandcamp|music\.apple\.com\/profile/i.test(ldAll));
const pw = JSON.stringify([P, W]);
const phr = [/Blake Zuniga/, /Blake Z Music/, /Zuniga/, /Zuniga Music/, /guitar/i, /blues folk|folk blues/i];
t('B. target phrases still in the Person / WebSite graph (Blake Zuniga, Blake Z Music, Zuniga, Zuniga Music, guitar, blues folk)', phr.every((re) => re.test(pw)));
const V = node(ID.vault) || {};
t('B. tiny Collection #vinyl-vault: creator #blake, url set, no inlined albums, < 600 B', !!V.creator && V.creator['@id'] === ID.blake &&
  V.url === SITE && !('hasPart' in V) && JSON.stringify(V).length < 600, `${JSON.stringify(V).length} B`);
const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
const alt = links.filter((l) => /\brel=["']alternate["']/.test(l) && /application\/ld\+json/.test(l));
const altHref = alt.length === 1 ? (alt[0].match(/\bhref=["']([^"']+)/) || [])[1] : null;
t('B. index.html has exactly one rel=alternate application/ld+json link to collection.jsonld',
  alt.length === 1 && (altHref === 'apps/vinyl-vault/collection.jsonld' || altHref === SITE + 'apps/vinyl-vault/collection.jsonld'), alt.join(' '));
t('B. collection.jsonld is referenced by index.html only through that link (no preload, script, fetch)',
  count(html, /collection\.jsonld/) === 1 && !links.some((l) => /preload/.test(l) && /jsonld|ld\+json/.test(l)));
let coll = null;
try { coll = JSON.parse(rd('apps/vinyl-vault/collection.jsonld')); } catch (_) {}
t('B. linked collection.jsonld exists, parses and is #vinyl-vault', !!coll && coll['@id'] === ID.vault);

// ---------------- C. llms.txt ----------------
const llms = rd('llms.txt');
t('C. /llms.txt exists at the site root', llms != null);
const L = llms || '';
t('C. llms.txt is plain text (no HTML wrapper or tags)', !!L && !/^\s*</.test(L) && !/<\/?(html|head|body|script|div|p|span|a|meta|style)\b/i.test(L));
t('C. llms.txt states he is a former member of The Curl Tapes', /former member of The Curl Tapes/.test(L));
t('C. llms.txt never calls him a current member', !/(?<!former )member of The Curl Tapes/i.test(L) && !/\bcurrent(ly)? (a )?member\b/i.test(L));
t('C. llms.txt names blakezuniga.com', /https:\/\/blakezuniga\.com\//.test(L));
const pages = [SITE, SITE + 'sitemap.xml', SITE + 'apps/vinyl-vault/collection.jsonld', ABOUT, ID.blake, ID.band, ID.zuniga, SITE + 'llms.txt'];
const missP = pages.filter((u) => !L.includes(u));
t('C. llms.txt lists the key pages and entity @ids', !missP.length, missP.join(', '));
const six = [['Blake Zuniga', /Blake Zuniga/g], ['Blake Z Music', /Blake Z Music/g], ['Zuniga', /\bZuniga\b/g], ['Zuniga Music', /Zuniga Music/g],
  ['Blake Zuniga guitar', /Blake Zuniga guitar/g], ['folk blues', /folk blues/gi]];
const sixCounts = six.map(([n, re]) => [n, count(L, re)]);
info('llms.txt phrase counts: ' + sixCounts.map(([n, c]) => `${n}=${c}`).join(', ') + `; ${Buffer.byteLength(L)} B`);
t('C. llms.txt uses all six phrases', sixCounts.every(([, c]) => c > 0));
// anti-stuffing: modest repeats, no bare keyword-list lines, small file
const listLine = L.split('\n').find((ln) => six.filter(([, re]) => new RegExp(re.source, 'i').test(ln)).length >= 3 && !/[.:;)]\s*$|[a-z]{3,} (is|are|was|has|for|of|the|and) /i.test(ln.replace(/Blake Z(uniga)?|Zuniga|Music/g, '')));
t('C. llms.txt reads naturally (each multi-word phrase <= 6 times, no bare keyword-list line, < 4 KB)',
  sixCounts.filter(([n]) => n !== 'Zuniga').every(([, c]) => c <= 6) && !listLine && Buffer.byteLength(L) < 4096, listLine || '');
t('C. llms.txt has no secrets (key / token / password patterns)', !/(api[_-]?key|secret|token|password|passwd|bearer\s|sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,})/i.test(L));

// ---------------- D. no visitor-visible or load-time change ----------------
const tags = (h) => [...h.matchAll(/<script\b[^>]*\bsrc=[^>]*>|<link\b[^>]*>/g)].map((m) => m[0]);
const tagsA = tags(html), tagsB = tags(baseHtml);
const added = tagsA.filter((x) => !tagsB.includes(x)), removed = tagsB.filter((x) => !tagsA.includes(x));
info(`script-src + link tags: before ${tagsB.length} -> after ${tagsA.length}; added ${JSON.stringify(added)}; removed ${JSON.stringify(removed)}`);
t('D. first-paint script/link tags unchanged except the one alternate jsonld link (same order)',
  !removed.length && added.length === 1 && added[0] === ALT_LINK && JSON.stringify(tagsA.filter((x) => x !== ALT_LINK)) === JSON.stringify(tagsB));
t('D. inline <script> / <style> block counts unchanged', count(html, /<script\b/) === count(baseHtml, /<script\b/) && count(html, /<style\b/) === count(baseHtml, /<style\b/));
// undo the approved t495u edits, drop JSON-LD, and the page must be the baseline byte for byte
const SEO_CSS = '  .seo-copy{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;border:0}\n';
const SEO_DIV = /<div class="seo-copy">[\s\S]*?<\/div>\n/;
const noLd = (h) => h.replace(LD_RE, '');
const normA = noLd(html).replace(ALT_LINK + '\n', '');
const normB = noLd(baseHtml).replace(SEO_CSS, '').replace(SEO_DIV, '');
t('D. index.html identical to baseline outside JSON-LD except: -.seo-copy CSS line, -.seo-copy div, +alternate link', normA === normB);
const HIDE = [/clip\s*:\s*rect\(/gi, /clip-path\s*:\s*inset\(\s*50%\s*\)/gi, /width\s*:\s*1px\s*;\s*height\s*:\s*1px/gi, /sr-only|visually-hidden|seo-copy/gi, /text-indent\s*:\s*-\d{3,}/gi];
const hideCount = (s) => HIDE.reduce((a, re) => a + count(s, re), 0);
t('D. no hidden-text CSS in index.html (1px box, clip, sr-only, text-indent)', hideCount(html) === 0, `before ${hideCount(baseHtml)} -> after ${hideCount(html)}`);
const cssFiles = [];
const walkDir = (dd) => { for (const e of readdirSync(path.join(root, dd), { withFileTypes: true })) {
  if (e.name === '.git' || e.name === 'node_modules') continue;
  const p = dd ? dd + '/' + e.name : e.name;
  if (e.isDirectory()) walkDir(p); else if (/\.css$/.test(p)) cssFiles.push(p);
} };
walkDir('');
const cssGrew = cssFiles.filter((p) => { const b = base(p); return hideCount(rd(p)) > (b ? hideCount(b.toString('utf8')) : 0); });
t('D. no CSS file gains hidden-text rules', cssGrew.length === 0, cssGrew.join(', '));
for (const p of ['apps/vinyl-vault/records.json', 'apps/vinyl-vault/collection.jsonld', 'apps/vinyl-vault/vinyl-vault.js', 'sitemap.xml', 'robots.txt',
  'harness.css', 'harness.js', 'widgets.js', 'chrome.css', 'chrome.js', 'amp-chrome.css', 'amp-chrome.js', 'amp-transit.css', 'layout.json', '404.html', 'CNAME']) {
  const b = base(p), c = rdB(p);
  t(`D. ${p} byte-identical to baseline`, !!b && !!c && Buffer.compare(b, c) === 0);
}
const gz = (s, level) => gzipSync(Buffer.from(s), { level }).length;
const rawB = Buffer.byteLength(baseHtml), rawA = Buffer.byteLength(html);
const g6B = gz(baseHtml, 6), g6A = gz(html, 6), g9B = gz(baseHtml, 9), g9A = gz(html, 9);
info(`index.html raw ${rawB} -> ${rawA} (delta ${rawA - rawB} B); gzip-6 ${g6B} -> ${g6A} (delta ${g6A - g6B} B); gzip-9 ${g9B} -> ${g9A} (delta ${g9A - g9B} B)`);
t('D. index.html gzip-6 and gzip-9 deltas each < 1024 B', g6A - g6B < 1024 && g9A - g9B < 1024);

console.log(fails ? `FAIL t495u-bz-seo-ai (${fails} failing)` : 'PASS t495u-bz-seo-ai');
process.exit(fails ? 1 : 0);
