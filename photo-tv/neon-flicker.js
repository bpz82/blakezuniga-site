/* neon-flicker.js (round 2, Blake t418u "precious memories still needs the neon flicker on and off, time it so that happens after
   the tv has been loaded in and going for like 13 seconds"). Pure: no imports, no DOM, no clock of its own.
   neonLevel(e, reduced) -> glow level 0..1 for the neon layer over the gold-leaf lettering, where e = ms since the flicker start
   (the panel's running timestamp + NEON_DELAY_MS). e < 0: 0 (the sign is the steady painted gold-leaf plaque).
   Pattern = the old photo-tv neon (removed by the sign #4 job): the classic ignition (irregular flickers, ~1.6 s), then on, now
   with a short on/off flicker in every 10 s slot (a quick dip, or a longer drop-out that stutters back), at a fixed
   pseudo-random spot in the slot, so it reads as neon without strobing. Reduced motion: no flicker, a soft 1.5 s fade-in to
   steady. */
export const NEON_DELAY_MS = 13000;
const IGNITE = [[0, 0], [120, 0.9], [190, 0.12], [380, 0.7], [470, 0.04], [700, 1], [790, 0.35], [900, 0.85], [1050, 0.18], [1250, 1], [1400, 0.78], [1550, 1]];
const IGNITE_END = 1650, SLOT = 10000;
const DIP = [[0, 0.15], [60, 0.9], [110, 0], [260, 0.75], [320, 0.1], [420, 1]];                    // quick on/off flutter, 0.42 s
const DROP = [[0, 0], [380, 0.6], [430, 0.05], [560, 0.85], [610, 0.2], [700, 1]];                     // drops out, stutters back, 0.7 s
const at = (seq, e) => { let v = seq[0][1]; for (let i = 0; i < seq.length; i++) if (e >= seq[i][0]) v = seq[i][1]; return v; };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function neonLevel(e, reduced) {
  if (!(e >= 0)) return 0;
  if (reduced) { const u = Math.min(1, e / 1500); return u * u * (3 - 2 * u); }
  if (e < IGNITE_END) return at(IGNITE, e);
  const r = e - IGNITE_END, k = Math.floor(r / SLOT), off = r - k * SLOT;
  const t0 = 2500 + hash(k) * 6000, seq = hash(k + 0.5) < 0.6 ? DIP : DROP, end = seq[seq.length - 1][0];
  let v = off >= t0 && off < t0 + end ? at(seq, off - t0) : 1;
  return Math.min(1, v * (1 + 0.012 * Math.sin(e * 0.011)));   // faint hum, never above 1
}
