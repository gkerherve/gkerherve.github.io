// music.js — what the soundtrack plays, and the pianist who plays it.
//
// The old soundtrack made its melody up one beat at a time: a random walk
// along a pentatonic scale over a chord that also wandered. Every note was in
// key and none of them meant anything — there was no tune to remember, no
// phrase that asked a question and another that answered it, nothing that
// came back. The player's word for it was "no meaning whatsoever", and that
// is exactly right: meaning in music is REPETITION WITH A DESTINATION. A
// motif you have heard once and hear again, a phrase that ends up in the air
// and a second one that brings it home.
//
// So the music is now written down. Ten short pieces, composed for this game
// in the manner of the quiet piano music that belongs to walking about a
// world made of blocks: slow, in a major key by day and a minor or modal one
// by night, a left hand of broken chords and a right hand that sings over it.
// Each piece has a form — an opening bar or two, a theme, the theme again
// ending somewhere else, a middle that goes higher and further, the theme
// once more, a close — and every phrase ends on a cadence the ear expects.
//
// What keeps a written piece from wearing thin is the PERFORMANCE, and that
// is the part that is generated: which key it is in today, how fast, how the
// left hand breaks its chords, whether a repeat is played an octave up, with
// a celesta over it or with a passing note filled in, and the rubato — the
// piece breathing at every phrase end and slowing into its last chord.
//
// ---------------------------------------------------------------------------
// How a piece is written
//
// A melody is scale degrees in the piece's own mode, bar by bar:
//
//     "3'h 2'q 1'q | 2'h. 5q"
//
//   1..7      the degree; 1 is the tonic in the octave from B3 to A#4
//   ' ,       an octave up, an octave down (repeatable)
//   b #       flatten or sharpen the degree (#7 is the leading note in minor)
//   w h q e s whole, half, quarter, eighth, sixteenth; a dot adds half again
//   r         a rest;   -   holds the note before it on (a tie)
//   |         a bar line — every bar is checked to add up (see checkPiece)
//
// Chords are roman numerals of the same mode, one bar each unless a bar holds
// more (they then share it, or say how many beats each takes with `:n`):
//
//     "I9 | V/7 | vi7 | IV:2 V:2"
//
//   I..VII    the degree; UPPER case is a major chord, lower case minor,
//             whatever the mode would have made of it (so iv in a major key
//             is the borrowed minor iv, and V in a minor one has its #7)
//   o +       diminished, augmented;   b #   a chromatic root (bVII)
//   7 M7      a minor or a major seventh;  9  an added ninth;  M9 79  both
//   6         an added sixth;   s2 s4   the third replaced by a second/fourth
//   /3        the bass on degree 3 of the KEY (an inversion, or a pedal: IV/1)

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const PITCH = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };

// How the left hand breaks a chord, one entry an eighth note: an index into
// the chord's voicing (0 is the bass), a list of them struck together, or
// null for nothing new. A new chord always opens on its bass.
export const PATTERNS = {
  // four in a bar
  rise: [0, 1, 2, 3, 4, 3, 2, 1],        // up the chord and back down
  flow: [0, 1, 2, 3, 1, 2, 3, 4],        // up, and up again from the fifth
  lull: [0, null, 1, null, 2, null, 3, null],   // the same, at half the pace
  bloom: [0, null, [1, 2, 3], null, null, null, null, null],   // one chord, left to ring
  // three in a bar
  waltz: [0, 1, 2, 3, 2, 1],
  lilt: [0, 2, 3, 4, 3, 2],
  waltzq: [0, null, [2, 3], null, [2, 3], null],
};

// ---------------------------------------------------------------------------
// The pieces. Each has a MOOD (day, night, or any), the keys it may be
// played in (the first is its own and is chosen half the time), a metre and
// a tempo, the left hand's pattern and the one a repeat may switch to, how
// much of the pad sits under it (0 to 1, a section may say otherwise), its
// sections, and the order they are played in. I is the opening, O the close.

export const PIECES = [
  {
    id: 'first-light', title: 'First Light', mood: 'day',
    mode: 'major', keys: ['D', 'C', 'Eb'], meter: 4, bpm: 72,
    acc: 'rise', acc2: 'flow', pad: 0,
    sections: {
      I: { chords: 'I9 | IVM7', acc: 'lull' },
      A: {
        chords: 'I9 | V/7 | vi7 | IVM7 | I9 | V/7 | IV:2 V:2 | I9',
        mel: "3'h 2'q 1'q | 2'h. 5q | 6h 1'q 2'q | 3'w | 3'h 2'q 1'q | 2'h. 5q | 6q 1'q 2'q 7q | 1'w",
      },
      B: {
        chords: 'IVM7 | I/3 | ii7 | V | IVM7 | I/3 | ii7 | Vs4:2 V:2', pad: 0.45,
        mel: "5'h 3'q 2'q | 3'h. 1'q | 2'h 5'q 4'q | 3'q 2'h. | 5'h 3'q 2'q | 3'h 5'h | 6'q 5'q 4'q 2'q | 1'h 7h",
      },
      O: { chords: 'IVM7 | I9', mel: "3'h 2'h | 1'w" },
    },
    form: ['I', 'A', 'A', 'B', 'A', 'O'],
  },
  {
    id: 'meadow-waltz', title: 'Meadow Waltz', mood: 'day',
    mode: 'major', keys: ['F', 'G', 'E'], meter: 3, bpm: 80,
    acc: 'waltz', acc2: 'waltzq', pad: 0,
    sections: {
      I: { chords: 'I | IV/1' },
      A: {
        chords: 'I | iii | IV | I | ii7 | V7 | V | V',
        mel: "3h 4q | 5h. | 6h 5q | 3h. | 4h 3q | 2h 1q | 2h. | rh.",
      },
      A2: {
        chords: 'I | iii | IV | vi | iii | IV9 | I/5:2 V:1 | I',
        mel: "3h 4q | 5h. | 6h 5q | 1'h. | 7h 6q | 5h 4q | 3h 2q | 1h.",
      },
      B: {
        chords: 'vi | IVM7 | I | V | vi | IVM7 | ii7 | Vs4:2 V:1',
        mel: "1'h 2'q | 3'h. | 2'h 1'q | 7h. | 1'h 2'q | 3'h 4'q | 4'h 3'q | 1'h 7q",
      },
      O: { chords: 'IV9 | I9 | I9', mel: "6h 5q | 3h. | 1h." },
    },
    form: ['I', 'A', 'A2', 'B', 'A', 'A2', 'O'],
  },
  {
    id: 'lanterns', title: 'Lanterns', mood: 'night',
    mode: 'minor', keys: ['E', 'D', 'F'], meter: 4, bpm: 63,
    acc: 'lull', acc2: 'rise', pad: 0.8,
    sections: {
      I: { chords: 'i9 | VIM7' },
      A: {
        chords: 'i9 | VIM7 | III9 | VII | i9 | VIM7 | iv7 | VII',
        mel: "5h. 4q | 3w | rq 2q 3q 5q | 4w | 5h. 7q | 1'h 7h | 3h 1h | 2w",
      },
      A2: {
        chords: 'i9 | VIM7 | III9 | VII | i9 | VIM7 | iv7 | i9',
        mel: "5h. 4q | 3w | rq 2q 3q 5q | 4w | 5h. 7q | 1'h 7h | 3h 2h | 1w",
      },
      B: {
        chords: 'VIM7 | VII | III9 | i9 | VIM7 | VII | iv7 | Vs4:2 V:2', acc: 'rise',
        mel: "7h 1'h | 2'h. 1'q | 7h 5h | 5w | 7h 1'h | 2'h 4'h | 3'h 1'h | 1'h #7h",
      },
      O: { chords: 'VIM7 | i9', mel: '3h 2h | 1w' },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
  {
    id: 'hearth', title: 'Hearth', mood: 'any',
    mode: 'major', keys: ['G', 'F', 'A'], meter: 4, bpm: 76,
    acc: 'rise', acc2: 'lull', pad: 0,
    sections: {
      I: { chords: 'I | IV/1' },
      A: {
        chords: 'I | IV/1 | I | IV/1 | vi7 | IVM7 | ii7 | V',
        mel: "3q. 5e 1'h | 6h 5h | 3q. 5e 1'q 2'q | 3'h 1'h | 7h 1'h | 6h 5q 3q | 2h 3h | 2w",
      },
      A2: {
        chords: 'I | IV/1 | I | IV/1 | vi7 | IVM7 | V | I',
        mel: "3q. 5e 1'h | 6h 5h | 3q. 5e 1'q 2'q | 3'h 1'h | 7h 1'h | 6h 5q 3q | 2h 7,h | 1w",
      },
      B: {
        chords: 'vi | iii | IV | I | vi | iii | IV | V', pad: 0.4,
        mel: "1'w | 7h 5h | 6h. 5q | 3w | 1'h 3'h | 2'h 7h | 1'h 6h | 2'h 7h",
      },
      O: { chords: 'IV/1 | I', mel: '6h 5q 3q | 1w' },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
  {
    id: 'stone-and-sky', title: 'Stone and Sky', mood: 'day',
    mode: 'major', keys: ['C', 'D', 'Bb'], meter: 4, bpm: 66,
    acc: 'rise', acc2: 'flow', pad: 0,
    sections: {
      I: { chords: 'I9 | II/1' },
      A: {
        chords: 'I9 | II/1 | I9 | II/1 | vi7 | V | IVM7 | IVM7',
        mel: "5h 1'q 2'q | 3'h. 2'q | 5h 1'q 2'q | #4'h 3'h | 3'h. 1'q | 2'h 7h | 1'h. 6q | 5w",
      },
      B: {
        chords: 'IVM7 | I9/3 | vi7 | V | IVM7 | I9/3 | II | II', pad: 0.5,
        mel: "3'h 5'h | 5'h. 3'q | 6'h 5'h | 5'h 2'h | 3'h 5'h | 1''h 7'h | 6'h #4'h | 2'w",
      },
      O: { chords: 'IVM7 | I9', mel: "3'h 2'h | 1'w" },
    },
    form: ['I', 'A', 'A', 'B', 'A', 'O'],
  },
  {
    id: 'riverbank', title: 'Riverbank', mood: 'day',
    mode: 'major', keys: ['D', 'Eb', 'C'], meter: 3, bpm: 88,
    acc: 'waltz', acc2: 'lilt', pad: 0,
    sections: {
      I: { chords: 'I | V/7' },
      A: {
        chords: 'I | V/7 | vi | I/5 | IV | I/3 | ii7 | V',
        mel: "3'h. | 2'h 1'q | 1'h 7q | 1'h. | 6h 7q | 1'h 3'q | 2'h 1'q | 2'h.",
      },
      A2: {
        chords: 'I | V/7 | vi | I/5 | IV | I/3 | ii7:2 V:1 | I',
        mel: "3'h. | 2'h 1'q | 1'h 7q | 1'h. | 6h 7q | 1'h 3'q | 2'h 7q | 1'h.",
      },
      B: {
        chords: 'IV | V | iii | vi | ii7 | V/7 | I | Vs4:2 V:1',
        mel: "4'h 3'q | 2'h. | 3'h 5'q | 6'h. | 4'h 3'q | 2'h 7q | 1'h 3'q | 2'h 7q",
      },
      O: { chords: 'IV | I | I', mel: "6'h 5'q | 3'h. | 1'h." },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
  {
    id: 'deep-water', title: 'Deep Water', mood: 'night',
    mode: 'dorian', keys: ['D', 'C', 'E'], meter: 4, bpm: 60,
    acc: 'lull', acc2: 'bloom', pad: 0.9,
    sections: {
      I: { chords: 'i9 | IV/1' },
      A: {
        chords: 'i9 | IV/1 | i9 | IV/1 | VII | III | IV | v7',
        mel: "1'h 7q 5q | 6h. 5q | 1'h 7q 5q | 6h 1'h | 2'h. 3'q | 3'h 1'h | 6h 7h | 5w",
      },
      A2: {
        chords: 'i9 | IV/1 | i9 | IV/1 | VII | III | IV | i9',
        mel: "1'h 7q 5q | 6h. 5q | 1'h 7q 5q | 6h 1'h | 2'h. 3'q | 3'h 1'h | 7h 6h | 1'w",
      },
      B: {
        chords: 'III | VII | IV | i9 | III | VII | ii7 | v7', acc: 'rise',
        mel: "5'h 3'h | 2'h. 5q | 6h 1'h | 1'w | 5'h 3'h | 2'h. 3'q | 4'h 2'h | 1'h 7h",
      },
      O: { chords: 'IV/1 | i9', mel: "6h 5h | 1'w" },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
  {
    id: 'snowfall', title: 'Snowfall', mood: 'any',
    mode: 'major', keys: ['A', 'Bb', 'G'], meter: 3, bpm: 72,
    acc: 'waltzq', acc2: 'waltz', pad: 0.3, bell: true,
    sections: {
      I: { chords: 'I9 | IVM7' },
      A: {
        chords: 'I9 | IVM7 | vi7 | Vs4:2 V:1 | I9 | IVM7 | ii7 | Vs4:2 V:1',
        mel: "5h 3'q | 3'h 2'q | 1'h 6q | 5h. | 5h 3'q | 4'h 3'q | 2'h 1'q | 1'h 7q",
      },
      A2: {
        chords: 'I9 | IVM7 | vi7 | Vs4:2 V:1 | I9 | IVM7 | Vs4:2 V:1 | I9',
        mel: "5h 3'q | 3'h 2'q | 1'h 6q | 5h. | 5h 3'q | 4'h 3'q | 2'h 7q | 1'h.",
      },
      B: {
        chords: 'vi7 | IVM7 | I9 | V/7 | vi7 | IVM7 | ii7 | V',
        mel: "6h 5q | 3h. | 2h 3q | 5h. | 6h 1'q | 3'h 2'q | 1'h 6q | 7h.",
      },
      O: { chords: 'IVM7 | I9 | I9', mel: "3'h 2'q | 1'h. | rh." },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
  {
    id: 'old-roads', title: 'Old Roads', mood: 'day',
    mode: 'mixolydian', keys: ['G', 'A', 'F'], meter: 4, bpm: 80,
    acc: 'rise', acc2: 'flow', pad: 0,
    sections: {
      I: { chords: 'I | VII/1' },
      A: {
        chords: 'I | VII | vi | I | I | v7 | IV | VII',
        mel: "5q 5q 6q 5q | 4h 2h | 3h 2h | 1w | 5q 5q 6q 1'q | 7h 5h | 6h 4q 3q | 2w",
      },
      A2: {
        chords: 'I | VII | vi | I | I | v7 | IV:2 VII:2 | I',
        mel: "5q 5q 6q 5q | 4h 2h | 3h 2h | 1w | 5q 5q 6q 1'q | 7h 5h | 6q 4q 4q 2q | 1w",
      },
      B: {
        chords: 'IV | I/3 | VII | IV | IV | I/3 | ii7 | Vs4:2 v7:2', pad: 0.4,
        mel: "1'h 6h | 5h 3'h | 2'h. 1'q | 6w | 1'h 6h | 5h 3'h | 2'h 1'h | 1'h 7h",
      },
      O: { chords: 'VII/1 | I', mel: '4h 2h | 1w' },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
  {
    id: 'still-night', title: 'Still Night', mood: 'night',
    mode: 'minor', keys: ['D', 'Eb', 'E'], meter: 4, bpm: 56,
    acc: 'bloom', acc2: 'lull', pad: 1,
    sections: {
      I: { chords: 'i9 | VIM7' },
      A: {
        chords: 'i9 | VIM7 | III | VII | iv9 | VIM7 | iv7 | Vs4:2 V:2',
        mel: "5w | 3h 1h | 2h 3h | 4h 2h | 1'w | 1'h 7h | 6h 5h | 4h 2h",
      },
      A2: {
        chords: 'i9 | VIM7 | III | VII | iv9 | VIM7 | iv7 | i9',
        mel: "5w | 3h 1h | 2h 3h | 4h 2h | 1'w | 1'h 7h | 6h 4h | 3w",
      },
      B: {
        chords: 'VIM7 | VII | III9 | i9 | VIM7 | VII | iv9 | Vs4:2 V:2', acc: 'lull',
        mel: "1'h 3'h | 2'w | 7h 5h | 5w | 1'h 3'h | 4'h 2'h | 1'h 6h | 4h 2h",
      },
      O: { chords: 'VIM7 | i9', mel: "1'h 7h | 1'w" },
    },
    form: ['I', 'A', 'A2', 'B', 'A2', 'O'],
  },
];

// ---------------------------------------------------------------------------
// Reading what is written

const NOTE = /^(r|-|[b#]?[1-7])([',]*)([whqes])(\.?)$/;

/** A melody string as notes { at, len, deg, acc, oct } in beats. */
export function parseMelody(src, meter) {
  const notes = [];
  const problems = [];
  const bars = String(src ?? '').split('|');
  bars.forEach((bar, bi) => {
    const start = bi * meter;
    let t = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const m = NOTE.exec(tok);
      if (!m) { problems.push(`bar ${bi + 1}: cannot read "${tok}"`); continue; }
      const len = DUR[m[3]] * (m[4] ? 1.5 : 1);
      if (m[1] === '-') {
        const last = notes[notes.length - 1];
        if (last) last.len += len; else problems.push(`bar ${bi + 1}: a tie with nothing to hold`);
      } else if (m[1] !== 'r') {
        const acc = m[1][0] === 'b' ? -1 : m[1][0] === '#' ? 1 : 0;
        const oct = (m[2].match(/'/g)?.length ?? 0) - (m[2].match(/,/g)?.length ?? 0);
        notes.push({ at: start + t, len, deg: +m[1].slice(-1), acc, oct });
      }
      t += len;
    }
    if (Math.abs(t - meter) > 1e-6) problems.push(`bar ${bi + 1} holds ${t} beats, not ${meter}`);
  });
  return { notes, bars: bars.length, problems };
}

const CHORD = /^([b#]?)(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)(o|\+)?((?:M9|M7|79|s2|s4|7|9|6)*)(?:\/([b#]?)([1-7]))?(?::(\d+(?:\.\d+)?))?$/;
const NUMERAL = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
const accOf = (a) => (a === 'b' ? -1 : a === '#' ? 1 : 0);

/** A chord string as chords { at, len, root, third, fifth, seventh, ninth, sixth, bass }. */
export function parseChords(src, meter, scale) {
  const chords = [];
  const problems = [];
  const bars = String(src ?? '').split('|');
  bars.forEach((bar, bi) => {
    const toks = bar.trim().split(/\s+/).filter(Boolean);
    const parsed = [];
    for (const tok of toks) {
      const m = CHORD.exec(tok);
      if (!m) { problems.push(`bar ${bi + 1}: cannot read chord "${tok}"`); continue; }
      const upper = m[2] === m[2].toUpperCase();
      const deg = NUMERAL[m[2].toLowerCase()];
      const root = scale[deg - 1] + accOf(m[1]);
      let third = upper ? 4 : 3;
      let fifth = 7;
      if (m[3] === 'o') { third = 3; fifth = 6; } else if (m[3] === '+') { third = 4; fifth = 8; }
      let seventh = null;
      let ninth = null;
      let sixth = null;
      for (const x of m[4].match(/M9|M7|79|s2|s4|7|9|6/g) ?? []) {
        if (x === 'M7') seventh = 11;
        else if (x === '7') seventh = m[3] === 'o' ? 9 : 10;
        else if (x === 'M9') { seventh = 11; ninth = 14; }
        else if (x === '79') { seventh = 10; ninth = 14; }
        else if (x === '9') ninth = 14;
        else if (x === '6') sixth = 9;
        else if (x === 's2') third = 2;
        else if (x === 's4') third = 5;
      }
      const bass = m[6] ? scale[+m[6] - 1] + accOf(m[5]) : root;
      parsed.push({ name: tok, root, third, fifth, seventh, ninth, sixth, bass,
        beats: m[7] != null ? +m[7] : null });
    }
    const fixed = parsed.reduce((s, c) => s + (c.beats ?? 0), 0);
    const loose = parsed.filter((c) => c.beats == null).length;
    const share = loose ? (meter - fixed) / loose : 0;
    let t = 0;
    for (const c of parsed) {
      const len = c.beats ?? share;
      chords.push({ ...c, at: bi * meter + t, len });
      t += len;
    }
    if (parsed.length && Math.abs(t - meter) > 1e-6) {
      problems.push(`chord bar ${bi + 1} holds ${t} beats, not ${meter}`);
    }
  });
  return { chords, bars: bars.length, problems };
}

/** The pitch classes a chord sounds, relative to the key's tonic. */
export function chordTones(c) {
  const t = [c.root, c.root + c.third, c.root + c.fifth];
  for (const x of [c.seventh, c.ninth, c.sixth]) if (x != null) t.push(c.root + x);
  return t.map((p) => ((p % 12) + 12) % 12);
}

/**
 * Everything wrong with a piece that a machine can see: bars that do not add
 * up, a melody and a chord line of different lengths, chords it cannot
 * read — plus, as `notes`, every strong-beat melody note that is not in its
 * chord, for a human to decide whether it is an appoggiatura or a mistake.
 */
export function checkPiece(p) {
  const problems = [];
  const notes = [];
  const scale = MODES[p.mode];
  if (!scale) problems.push(`${p.id}: no mode "${p.mode}"`);
  if (!p.keys?.every((k) => PITCH[k] != null)) problems.push(`${p.id}: a key it cannot read`);
  if (!PATTERNS[p.acc]) problems.push(`${p.id}: no pattern "${p.acc}"`);
  for (const name of p.form) {
    if (!p.sections[name]) problems.push(`${p.id}: form names a section "${name}" it does not have`);
  }
  for (const [name, s] of Object.entries(p.sections)) {
    const ch = parseChords(s.chords, p.meter, scale ?? MODES.major);
    for (const x of ch.problems) problems.push(`${p.id} ${name}: ${x}`);
    if (s.acc && !PATTERNS[s.acc]) problems.push(`${p.id} ${name}: no pattern "${s.acc}"`);
    if (!s.mel) continue;
    const mel = parseMelody(s.mel, p.meter);
    for (const x of mel.problems) problems.push(`${p.id} ${name}: ${x}`);
    if (mel.bars !== ch.bars) {
      problems.push(`${p.id} ${name}: ${mel.bars} bars of melody over ${ch.bars} of chords`);
    }
    for (const n of mel.notes) {
      const beat = n.at % p.meter;
      const strong = beat === 0 || (p.meter === 4 && beat === 2);
      if (!strong) continue;
      const c = ch.chords.find((x) => n.at >= x.at - 1e-9 && n.at < x.at + x.len - 1e-9);
      if (!c) continue;
      const pc = (((scale[n.deg - 1] + n.acc) % 12) + 12) % 12;
      if (!chordTones(c).includes(pc)) {
        notes.push(`${p.id} ${name} bar ${Math.floor(n.at / p.meter) + 1}: degree ${n.deg} over ${c.name}`);
      }
    }
  }
  return { problems, notes };
}

// ---------------------------------------------------------------------------
// Playing it

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

// The left hand's chord: the bass, and four notes over it spread across an
// octave and a half — root, fifth, then the colour (the seventh or the ninth
// if the chord has one) and the third an octave up, which is the open,
// ringing shape this kind of music is played in. `top` is the highest note
// the hand may reach, so it never climbs into the tune.
function voicing(c, tonicBass, top) {
  let bass = tonicBass + (((c.bass % 12) + 12) % 12);
  if (bass > 49) bass -= 12;
  let root = tonicBass + (((c.root % 12) + 12) % 12);
  while (root > bass) root -= 12;
  const t = c.third;
  const f = c.fifth;
  let shape;
  if (c.seventh != null && c.ninth != null) shape = [f, c.seventh, c.ninth, t + 12];
  else if (c.seventh != null) shape = [f, c.seventh, t + 12, f + 12];
  else if (c.ninth != null) shape = [f, c.ninth, t + 12, f + 12];
  else if (c.sixth != null) shape = [f, c.sixth, t + 12, f + 12];
  else shape = [f, 12, t + 12, f + 12];
  let up = shape.map((iv) => root + iv);
  up = up.map((n) => (n < bass + 3 ? n + 12 : n));
  up = [...new Set(up)].sort((a, b) => a - b);
  while (up.length > 3 && up[up.length - 1] > top) up.pop();
  while (up.length && up[up.length - 1] > top + 4) up.pop();
  return [bass, ...up];
}

const pick = (R, a) => a[Math.floor(R() * a.length)];

/**
 * One performance of a piece: every note and every pad change, in seconds
 * from its first downbeat. { events: [{ t, kind: 'p' | 'b', midi, vel, off }],
 * pads: [{ t, notes, level }], length, key, bpm, id, title }.
 * `seed` makes it repeatable; `key` forces a key.
 */
export function perform(piece, { seed = (Math.random() * 2 ** 32) >>> 0, key = null } = {}) {
  const R = rng(seed);
  const scale = MODES[piece.mode];
  const keyName = key ?? (R() < 0.5 ? piece.keys[0] : pick(R, piece.keys));
  const pc = PITCH[keyName] ?? 0;
  const tonic = 59 + ((((pc - 59) % 12) + 12) % 12);
  const tonicBass = 36 + ((((pc - 36) % 12) + 12) % 12);
  const meter = piece.meter;
  const bpm = piece.bpm * (0.96 + R() * 0.07);

  // --- the form, laid out bar by bar ---------------------------------------
  const secs = [];
  const seen = {};
  let beat = 0;
  for (const name of piece.form) {
    const S = piece.sections[name];
    const time = (seen[name] = (seen[name] ?? 0) + 1);
    const ch = parseChords(S.chords, meter, scale);
    const mel = S.mel ? parseMelody(S.mel, meter).notes : [];
    let vary = null;
    let acc = S.acc ?? piece.acc;
    if (time > 1 && mel.length) {
      // a repeat is never played the way it was the first time
      const top = Math.max(...mel.map((n) => tonic + scale[n.deg - 1] + n.acc + 12 * n.oct));
      const options = ['bell', 'orn', 'soft'];
      if (top + 12 <= 91) options.push('up', 'up');
      vary = pick(R, options);
      if (piece.acc2 && !S.acc && R() < 0.5) acc = piece.acc2;
    }
    secs.push({ name, at: beat, bars: ch.bars, chords: ch.chords, mel, acc, vary,
      pad: S.pad ?? piece.pad ?? 0 });
    beat += ch.bars * meter;
  }
  const total = beat;

  // --- the tempo, breathing ------------------------------------------------
  // one entry an eighth note: when it starts, in seconds
  const E = Math.round(total * 2);
  const T = new Float64Array(E + 1);
  const phase = R() * Math.PI * 2;
  let si = 0;
  for (let k = 0; k < E; k++) {
    const b = k / 2;
    while (si + 1 < secs.length && b >= secs[si + 1].at) si++;
    const S = secs[si];
    const inBar = b % meter;
    const barInSec = Math.floor((b - S.at) / meter);
    let f = 1 + 0.018 * Math.sin((2 * Math.PI * b) / (meter * 6) + phase);
    const lastBeat = inBar >= meter - 1;
    if (lastBeat && barInSec % 4 === 3) f *= 0.94;              // a phrase ends
    if (lastBeat && barInSec === S.bars - 1) f *= 0.9;          // ...and a section
    const fromEnd = total - b;
    if (fromEnd <= meter * 2) f *= 1 - 0.32 * (1 - fromEnd / (meter * 2)) ** 2;   // the close
    let d = 30 / (bpm * f);
    // a breath before a new section: the pianist's hands leave the keys
    if (si + 1 < secs.length && Math.abs(b + 0.5 - secs[si + 1].at) < 1e-9) d += 0.12 + R() * 0.12;
    T[k + 1] = T[k] + d;
  }
  const at = (b) => {
    const x = Math.max(0, Math.min(E, b * 2));
    const k = Math.min(E - 1, Math.floor(x));
    return T[k] + (x - k) * (T[k + 1] - T[k]);
  };
  const jitter = (s) => (R() + R() + R() - 1.5) * s;

  // pedal changes: every chord boundary where the harmony actually moves
  const pedals = [];
  let prevKey = null;
  for (const S of secs) {
    for (const c of S.chords) {
      const k = `${c.root}.${c.third}.${c.fifth}.${c.seventh}.${c.ninth}.${c.sixth}.${c.bass}`;
      if (k !== prevKey) pedals.push(S.at + c.at);
      prevKey = k;
    }
  }
  pedals.push(total);
  const pedalAfter = (b) => pedals.find((p) => p >= b - 1e-9) ?? total;

  const events = [];
  const pads = [];
  let padOn = 0;

  for (let s = 0; s < secs.length; s++) {
    const S = secs[s];
    const last = s === secs.length - 1;
    const soft = S.vary === 'soft' ? 0.84 : 1;
    const melShift = S.vary === 'up' ? 12 : 0;
    const melMidi = (n) => tonic + scale[n.deg - 1] + n.acc + 12 * n.oct + melShift;

    // --- the melody, and what a repeat does to it ---------------------------
    let mel = S.mel.map((n) => ({ ...n }));
    if (S.vary === 'orn') {
      // a passing note through every third the tune moves by, where there is
      // room for one: the kind of thing a pianist adds the second time round
      const out = [];
      for (let i = 0; i < mel.length; i++) {
        const a = mel[i];
        const b = mel[i + 1];
        out.push(a);
        if (!b || a.len < 1 || Math.abs(a.at + a.len - b.at) > 1e-9 || R() < 0.4) continue;
        const da = a.deg + 7 * a.oct;
        const db = b.deg + 7 * b.oct;
        if (Math.abs(da - db) !== 2 || a.acc || b.acc) continue;
        const mid = (da + db) / 2;
        const oct = Math.floor((mid - 1) / 7);
        a.len -= 0.5;
        out.push({ at: a.at + a.len, len: 0.5, deg: mid - 7 * oct, acc: 0, oct, passing: true });
      }
      mel = out;
    }
    const mids = mel.map(melMidi);
    const lo = Math.min(...mids, 200);
    const hi = Math.max(...mids, 0);
    mel.forEach((n, i) => {
      const m = mids[i];
      const b0 = S.at + n.at;
      const b1 = b0 + n.len;
      const height = hi > lo ? (m - lo) / (hi - lo) : 0.5;
      let vel = 0.56 + 0.12 * height + (n.at % meter === 0 ? 0.04 : 0) + jitter(0.03);
      if (n.passing) vel -= 0.1;
      if (i === mel.length - 1) vel -= 0.05;
      vel *= soft;
      const t = at(b0) + jitter(0.012);
      const off = Math.max(at(b1), Math.min(at(pedalAfter(b1)), at(b1 + 2)));
      events.push({ t, kind: 'p', midi: m, vel, off: last && i === mel.length - 1 ? off + 4 : off });
      const bell = S.vary === 'bell' || (piece.bell && n.len >= 1);
      if (bell) {
        const up = m + 12 <= 98 ? 12 : 0;
        events.push({ t: t + 0.004, kind: 'b', midi: m + up, vel: (S.vary === 'bell' ? 0.5 : 0.32) * soft });
      }
    });

    // --- the left hand -------------------------------------------------------
    const pat = PATTERNS[S.acc] ?? PATTERNS[meter === 3 ? 'waltz' : 'rise'];
    const perBar = pat.length;
    const slot = meter / perBar;       // beats per pattern step
    S.chords.forEach((c, ci) => {
      const cb0 = S.at + c.at;
      const cb1 = cb0 + c.len;
      // the highest the hand may go: under whatever the tune is doing over it
      const over = mel.filter((n) => S.at + n.at < cb1 && S.at + n.at + n.len > cb0);
      const top = over.length
        ? Math.max(55, Math.min(67, Math.min(...over.map(melMidi)) - 2)) : 67;
      const V = voicing(c, tonicBass, top);
      const release = at(cb1) + 0.05;
      const finalChord = last && ci === S.chords.length - 1;
      if (finalChord) {
        // the last chord is spread from the bottom up and left to ring
        V.forEach((n, j) => events.push({ t: at(cb0) + j * 0.075, kind: 'p', midi: n,
          vel: (j ? 0.34 : 0.46) * soft, off: at(cb1) + 6 }));
        return;
      }
      const steps = Math.round(c.len / slot);
      for (let j = 0; j < steps; j++) {
        const b = cb0 + j * slot;
        const idx = Math.round((b % meter) / slot) % perBar;
        let v = pat[idx];
        if (j === 0) v = 0;             // a new chord opens on its bass
        if (v == null) continue;
        const list = Array.isArray(v) ? v : [v];
        for (const vi of list) {
          const n = V[Math.min(vi, V.length - 1)];
          const onBeat = Math.abs((b % 1)) < 1e-9;
          let vel = vi === 0 ? 0.46 : 0.3 + (onBeat ? 0.04 : 0) - 0.015 * vi;
          vel = (vel + jitter(0.025)) * soft;
          events.push({ t: at(b) + jitter(0.006), kind: 'p', midi: n, vel, off: release });
        }
      }
    });

    // --- the pad ---------------------------------------------------------------
    if (S.pad > 0 || padOn > 0) {
      for (const c of S.chords) {
        const lvl = S.pad;
        if (lvl <= 0 && padOn <= 0) break;
        // the chord's root between Bb2 and A3, the fifth, the third an
        // octave up, the colour, and the root again an octave down
        let r = tonicBass + 12 + (((c.root % 12) + 12) % 12);
        while (r > 57) r -= 12;
        while (r < 46) r += 12;
        const colour = c.seventh ?? c.ninth ?? c.sixth ?? 12;
        pads.push({ t: at(S.at + c.at), notes: [r, r + c.fifth, r + 12 + c.third, r + colour, r - 12], level: lvl });
        padOn = lvl;
      }
    }
  }
  if (padOn > 0) pads.push({ t: at(total), notes: null, level: 0 });

  events.sort((a, b) => a.t - b.t);
  const lastOff = events.reduce((m, e) => Math.max(m, e.off ?? e.t + 3), 0);
  return {
    id: piece.id, title: piece.title, key: keyName, bpm: Math.round(bpm),
    events, pads, length: lastOff + 1.5, sections: secs.map((s) => [s.name, s.vary]),
  };
}
