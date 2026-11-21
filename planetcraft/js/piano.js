// piano.js — the instrument the soundtrack is played on, made from nothing.
//
// The music used to be a stack of five sine waves struck like a mallet. That
// is a pleasant enough sound for one note and the wrong one for a tune: it
// has no attack to speak of and no body, so a melody played on it reads as a
// row of beeps however well the notes are chosen. A tune wants a PIANO — the
// instrument every quiet game soundtrack is written for — and this game has
// no audio files and is not getting any. So the piano is synthesised, once,
// at start-up, the way a physicist would describe one:
//
//   * a string's partials are not whole multiples of its pitch. Stiffness
//     stretches each one a little sharp (`B`, the inharmonicity), more in the
//     treble than the bass, and that stretch is most of what makes a struck
//     string sound like a string and not an organ pipe;
//   * the hammer strikes an eighth of the way along the string, so the
//     partials with a node there are hardly excited (`STRIKE`), and it is
//     felt, so its spectrum rolls off above a corner that rises with pitch;
//   * every note is TWO strings a cent or so apart. They beat against each
//     other, which is the slow swell inside a held piano note;
//   * each partial dies in two stages — a quick fall while the string is
//     still pushing the soundboard hard, and a long quiet tail after it —
//     and the higher the partial the faster both go. So a note is bright for
//     the instant it is struck and mellows to a pure tone as it rings;
//   * a soundboard radiates almost nothing below 200 Hz, so a bass note is
//     heard mostly through its second and third partials, which is why the
//     low end of a piano sounds like a piano and not like a sub-woofer;
//   * and there is a knock — a few milliseconds of filtered noise, the felt
//     arriving — without which the whole thing fades in out of nowhere.
//
// Twenty notes a minor third apart are rendered, and a note in between is
// the nearest of them played a semitone or so fast or slow. Everything here
// is a pure function of the key number, so the piano is the same piano on
// every machine and in every test, and it runs as happily in a worker (see
// pianoworker.js) or in node as it does on the page.

export const PIANO_SR = 24000;   // the notes' own rate: nothing soft reaches 12k
export const PIANO_LOW = 34;     // Bb1
export const PIANO_STEP = 3;     // a sample every minor third
export const PIANO_HIGH = 91;    // G6 — PIANO_LOW + 19 steps

const STRIKE = 0.118;            // where the hammer lands, as a share of the string
const AFTER = 0.3;               // how much of each partial is in the long tail

/** The keys a sample is rendered for, lowest first. */
export function pianoKeys() {
  const keys = [];
  for (let m = PIANO_LOW; m <= PIANO_HIGH; m += PIANO_STEP) keys.push(m);
  return keys;
}

/** The rendered key nearest to MIDI note `m`. */
export function pianoKeyFor(m) {
  const k = PIANO_LOW + Math.round((m - PIANO_LOW) / PIANO_STEP) * PIANO_STEP;
  return Math.max(PIANO_LOW, Math.min(PIANO_HIGH, k));
}

/** Seconds a sample lasts: a bass string rings for longer than a treble one. */
export function pianoLength(m) {
  return Math.min(6.5, Math.max(2.2, 6.5 * 2 ** (-(m - 36) / 36)));
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One piano note, MIDI key `m`, as mono samples at `sr` — normalised so that
 * every key comes out about as loud as its neighbours (the bass a touch
 * louder, as ears want it), with the tail faded to silence.
 */
export function renderPianoNote(m, sr = PIANO_SR) {
  const f0 = 440 * 2 ** ((m - 69) / 12);
  const n = Math.round(pianoLength(m) * sr);
  const acc = new Float64Array(n);
  const R = rng(0x9E3779B1 ^ Math.imul(m + 1, 2654435761));

  const B = 0.00032 * 2 ** ((m - 60) / 13);
  const fmax = Math.min(sr * 0.42, 8500);
  // the felt: the hammer's spectrum rolls off above this corner
  const fc = 1400 + 1000 * Math.min(1, f0 / 500);
  // how long the fundamental's two stages last, by register (1/e, seconds)
  const reg = (261.63 / f0) ** 0.62;
  const tauA = 0.32 * reg + 0.05;
  const tauB = 2.4 * reg + 0.3;
  // the brilliance of the strike itself, gone in a twentieth of a second
  const dC = Math.exp(-1 / (0.05 * sr));

  for (let k = 1; k <= 64; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > fmax) break;
    let a = Math.abs(Math.sin(Math.PI * k * STRIKE)) / k;
    a /= Math.sqrt(1 + (fk / fc) ** 4);
    if (fk < 220) a *= (fk / 220) ** 1.25;       // the soundboard's low end
    if (a < 2e-4) continue;
    const slow = 1 / (1 + (fk / 1500) ** 1.3);   // high partials die first
    const dA = Math.exp(-1 / (tauA * slow * sr));
    const dB = Math.exp(-1 / (tauB * slow * sr));
    const bright = fk > 900 ? 0.5 * Math.sqrt(fk / 900) : 0;
    const cents = (0.3 + 0.9 * R()) * (R() < 0.5 ? -1 : 1);
    for (let s = 0; s < 2; s++) {
      const share = s ? 0.46 : 0.54;
      const f = fk * 2 ** ((s ? -cents : cents) / 2400);
      const w = 2 * Math.PI * f / sr;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const ph = R() * 2 * Math.PI;
      let c = Math.cos(ph);
      let sn = Math.sin(ph);
      let eA = a * share * (1 - AFTER);
      let eB = a * share * AFTER;
      let eC = a * share * bright;
      for (let i = 0; i < n; i++) {
        acc[i] += sn * (eA + eB + eC);
        const c2 = c * cw - sn * sw;
        sn = sn * cw + c * sw;
        c = c2;
        eA *= dA; eB *= dB; eC *= dC;
        if ((i & 255) === 0 && eA + eB < 1e-6) break;
      }
    }
  }

  // The felt arriving: a few milliseconds of noise, darker for a low key.
  const knock = Math.round(0.045 * sr);
  const kl = 1 - Math.exp(-2 * Math.PI * Math.min(4200, 900 + 2.2 * f0) / sr);
  let l1 = 0;
  let l2 = 0;
  for (let i = 0; i < knock && i < n; i++) {
    const w = R() * 2 - 1;
    l1 += kl * (w - l1);
    l2 += kl * (l1 - l2);
    acc[i] += l2 * 0.09 * Math.exp(-i / (0.006 * sr));
  }

  // Hammer contact: a few milliseconds of rise rather than a step, longer
  // for the heavier bass hammers.
  const att = Math.max(2, Math.round(sr * (0.0022 + 0.0035 * Math.min(1, 110 / f0))));
  for (let i = 0; i < att && i < n; i++) {
    acc[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / att);
  }

  // Level: the first third of a second, where the ear judges loudness.
  const win = Math.min(n, Math.round(0.3 * sr));
  let e = 0;
  for (let i = 0; i < win; i++) e += acc[i] * acc[i];
  const rms = Math.sqrt(e / Math.max(1, win)) || 1;
  let g = (0.12 * 2 ** (-(m - 60) / 72)) / rms;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(acc[i]));
  if (peak * g > 0.95) g = 0.95 / peak;

  const out = new Float32Array(n);
  const fade = Math.round(0.35 * sr);
  for (let i = 0; i < n; i++) {
    let v = acc[i] * g;
    const left = n - 1 - i;
    if (left < fade) v *= 0.5 - 0.5 * Math.cos(Math.PI * left / fade);
    out[i] = v;
  }
  return out;
}
