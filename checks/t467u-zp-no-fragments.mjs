// t467u-zp-no-fragments (Blake t467u, 25 Nov 2026): Feed cards must be whole entries, not split fragments.
// Blake's phone screenshot showed "Ride to Texas (Right outside of Amarillo)" (a session location) as a
// quote card and "Gary on getting back into the blues -" (a context heading with a dangling dash) as its own card.
// Core assertions run on every non-blurb note in apps/zuniga-philosophy/data/sample.json (the Feed cards):
//   no bare parenthetical, no location/page/loc/time-only marker, no leftover bullet character, no dangling dash.
// FAIL on fe8aea0 sample (Amarillo location card + Gary dangling dash). PASS after the cleanup.
// Log: checks/logs/t467u-zp-no-fragments-before.log / -after.log
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// optional argv[2]: alternate sample.json path (used to run against the fe8aea0 sample for the fail-before log)
const samplePath = process.argv[2] || path.join(root, 'apps/zuniga-philosophy/data/sample.json');
let fails = 0;
const t = (name, ok, extra) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && extra ? ' :: ' + extra : ''}`); };

const REMOVED = ['the-dream-of-solomelo', 'scientific-advertising', 'born-of-this-land-chung-ju-yung', 'ogilvy-unpublished'];
const sample = JSON.parse(readFileSync(samplePath, 'utf8'));
const books = sample.books || [];
const feed = [];
for (const b of books) for (const n of b.notes || []) if (n.role !== 'blurb') feed.push({ book: b.id, id: n.id, text: String(n.text || '') });

const rules = [
  ['bare parenthetical', (s) => /^(?:\([\s\S]*\)|\[[\s\S]*\])$/.test(s)],
  ['location / page / loc / time-only marker', (s) =>
    /^Ride to\b/i.test(s) || /Right outside of/i.test(s)
    || /^(?:loc(?:ation)?\.?|page|pg\.?|p\.)\s*\d+\s*[-–—]?$/i.test(s)
    || /^\d{1,2}\s*(?::\s*|\s+)\d{2}\b(?:\s*(?:am|pm))?(?:\s+[A-Za-z][\w' ]{0,30})?\s*[-–—]?$/i.test(s)
    || /^\d{1,2}\s*:\s*\d{2}\s*[-–—]\s*[A-Za-z][\w' ]{0,30}\s*[-–—]?$/.test(s)],
  ['leading bullet character', (s) => /^[•‣◦▪●·⁃]/.test(s) || /^[-–—*]\s/.test(s)],
  ['dangling dash', (s) => /[-–—]$/.test(s)],
];
for (const [label, test] of rules) {
  const bad = feed.filter((n) => test(n.text.trim()));
  t(`no non-blurb sample note is a ${label}`, bad.length === 0,
    bad.map((n) => `${n.book}/${n.id} ${JSON.stringify(n.text.slice(0, 70))}`).join(' ; '));
}

const ids = books.map((b) => b.id);
t('sample is flagged sample:true', sample.sample === true);
t('34 books, book_count 34', books.length === 34 && sample.book_count === 34);
t('the four removed ids are still absent', REMOVED.every((id) => !ids.includes(id)));
t('<= 3 notes per book; blurb (if any) plus up to 2 body notes, else up to 3 body notes',
  books.every((b) => {
    const ns = b.notes || [];
    const hasBlurb = ns.some((n) => n.role === 'blurb');
    const body = ns.filter((n) => n.role !== 'blurb').length;
    return ns.length <= 3 && body <= (hasBlurb ? 2 : 3) && (b.sample_note_count === ns.length);
  }));
const total = books.reduce((a, b) => a + (b.notes || []).length, 0);
t(`note_count (${sample.note_count}) equals notes present (${total})`, sample.note_count === total);
t('note_count stays in the expected range (95..102)', total >= 95 && total <= 102);
t('every book that has a blurb field still has its blurb note first',
  books.every((b) => !b.blurb || (b.notes && b.notes[0] && b.notes[0].role === 'blurb')));
t('every book still has at least one body note except possibly none-for-empty books',
  books.every((b) => (b.notes || []).some((n) => n.role !== 'blurb')));

const tmh = books.find((b) => b.id === 'take-me-home');
const tmhFirst = tmh && (tmh.notes || []).find((n) => n.role !== 'blurb');
t('Take Me Home first Feed note is a real quote, not the Amarillo location',
  !!tmhFirst && tmhFirst.text.length > 40 && !/Amarillo/i.test(tmhFirst.text) && /insecure about their place in the world/.test(tmhFirst.text) && /\(His parents\)/.test(tmhFirst.text),
  tmhFirst && tmhFirst.text);
const gm = books.find((b) => b.id === 'gary-moore-the-official-biography');
t('Gary Moore sample has no bare "Gary on getting back into the blues -" fragment',
  !!gm && !(gm.notes || []).some((n) => /^Gary on getting back into the blues\s*[-–—]?\s*$/.test(n.text.trim())));
t('short legitimate quotes are still allowed (rule set does not match "Stay Mindful" / "Take Them!")',
  rules.every(([, test]) => !test('Stay Mindful') && !test('Take Them!')));

console.log(fails ? `FAIL (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
