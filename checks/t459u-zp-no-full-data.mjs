// t459u-zp-no-full-data (Blake t459u, copyright): the full notebook (books.clean.json, 2637 items) is never in this repo.
// Only apps/zuniga-philosophy/data/sample.json (sample:true, <= 3 notes per book) is public. Checks:
//  - apps/zuniga-philosophy/.gitignore exists and git ignores books.clean.json / full.json / books.json there;
//  - no path named books.clean.json / full.json is tracked or addable (git ls-files --cached --others --exclude-standard);
//  - sample.json has sample:true, 38 books, <= 3 notes each, note_count == the notes actually present (113);
//  - a distinctive late Think and Grow Rich quote that is NOT in the sample appears in no tracked or addable file (backups *.pre-*
//    and *.bak-* are excluded; they are never added). The needle is stored base64 so this file does not contain it;
//  - no obvious secrets (API keys, tokens, passwords, private keys) in the new app files or the index.html hook.
// Runs: Node + git (no browser). Runtime ~1 s. Exits nonzero on fail.
// Evidence (new check: FAIL before the build because .gitignore / sample are absent, PASS after):
//   checks/logs/t459u-zp-no-full-data-before.log -> FAIL, checks/logs/t459u-zp-no-full-data-after.log -> PASS
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'apps/zuniga-philosophy');
let fails = 0;
const t = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };
const git = (...args) => { const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }); if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr); return r.stdout; };

const NEEDLE = Buffer.from('V2lzaGluZyB3aWxsIG5vdCBicmluZyBkcmVhbXMuIEJ1dCBkZXNpcmluZyBkcmVhbXMgd2l0aCBhIHN0YXRlIG9mIG1pbmQgdGhhdCBiZWM=', 'base64').toString('utf8');

// .gitignore
const gi = path.join(dir, '.gitignore');
t('apps/zuniga-philosophy/.gitignore exists', existsSync(gi));
for (const f of ['books.clean.json', 'full.json', 'books.json', 'data/books.clean.json', 'data/full.json']) {
  const r = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', 'apps/zuniga-philosophy/' + f]);
  t(`git ignores apps/zuniga-philosophy/${f}`, r.status === 0);
}
const sr = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', 'apps/zuniga-philosophy/data/sample.json']);
t('git does NOT ignore data/sample.json', sr.status === 1);

// tracked / addable paths
const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
t('no tracked or addable path is books.clean.json / full.json', !files.some((f) => /(^|\/)(books\.clean|full)\.json$/i.test(f)));
const zpFiles = files.filter((f) => f.startsWith('apps/zuniga-philosophy/'));
t('app files are present (module, page, sample)', ['zuniga-philosophy.js', 'index.html', 'data/sample.json'].every((f) => zpFiles.includes('apps/zuniga-philosophy/' + f)));

// sample shape
let sample = null;
try { sample = JSON.parse(readFileSync(path.join(dir, 'data/sample.json'), 'utf8')); } catch (e) { console.log('sample: ' + e.message); }
t('sample.json has sample:true', !!sample && sample.sample === true);
if (sample) {
  const books = Array.isArray(sample.books) ? sample.books : [];
  const notes = books.reduce((s, b) => s + (Array.isArray(b.notes) ? b.notes.length : 0), 0);
  t('sample.json: 38 books', books.length === 38);
  t('sample.json: at most 3 notes per book', books.every((b) => Array.isArray(b.notes) && b.notes.length <= 3));
  t(`sample.json: note_count (${sample.note_count}) == notes present (${notes}) and well under the full set (${sample.full_note_count})`, sample.note_count === notes && notes <= 0.1 * sample.full_note_count);
  t('sample.json: does not contain the late Think and Grow Rich needle', !JSON.stringify(sample).includes(NEEDLE));
}

// needle in any tracked / addable file (backups excluded: they are never added)
const scan = files.filter((f) => !/\.(pre-[\w-]+|bak-[\w-]+)$/.test(f) && !/\.(png|jpe?g|webp|gif|woff2?|ico|mp3|mp4|glb|ktx2)$/i.test(f));
let hits = [];
for (const f of scan) {
  const p = path.join(root, f);
  try { if (statSync(p).size > 50e6) continue; if (readFileSync(p, 'utf8').includes(NEEDLE)) hits.push(f); } catch { /* deleted in tree */ }
}
t(`late full-set quote is in no tracked/addable file (${scan.length} scanned)${hits.length ? ': ' + hits.join(', ') : ''}`, !hits.length);
const priv = '/workspace/website/zuniga-philosophy-notes/data/books.clean.json';
if (existsSync(priv)) t('needle is a real full-set quote (private file, read only to validate the needle)', readFileSync(priv, 'utf8').includes(NEEDLE));

// secrets in the new files
const SECRET = [
  /sk-[A-Za-z0-9_-]{20,}/, /AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/, /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(api[_-]?key|secret|token|passw(or)?d|bearer)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i, /Authorization['"]?\s*:\s*['"]/i,
];
const secretFiles = [...zpFiles.filter((f) => !/\.(pre-[\w-]+|bak-[\w-]+)$/.test(f)), 'index.html'];
const bad = [];
for (const f of secretFiles) { let s = ''; try { s = readFileSync(path.join(root, f), 'utf8'); } catch { continue; } for (const re of SECRET) if (re.test(s)) bad.push(`${f} ~ ${re}`); }
t(`no obvious secrets in ${secretFiles.length} app/hook files${bad.length ? ': ' + bad.join('; ') : ''}`, !bad.length);
console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
