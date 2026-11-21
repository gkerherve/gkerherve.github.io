// classicart.js — the Classic style's blocks, drawn again.
//
// Classic was two styles wearing one name. Most of its blocks were the first
// pixel art this game ever had — sixteen texels, a five-step ramp, and an
// ORDERED DITHER between the steps, which at a metre reads as a woven
// chequerboard, the television static the rest of the art tried so hard to
// avoid — and the rest were borrowed: the brick, the cobble and the planks
// from the Realistic style's finer pixel art, the sea from a flat style, and
// every block added since (four timbers, four ores, nine metal blocks, the
// wool, the cement, the cobblestones) in the realistic look at twice the
// resolution. Side by side, a birch plank and an oak one did not look like
// the same game.
//
// So every block face is drawn again here, in ONE idiom, the one the voxel
// games this is a cousin of have always used:
//
//   * SIXTEEN texels a side, blitted up to the atlas's thirty-two: big enough
//     to read a stone from across a street, small enough to be pixel art.
//   * CLUSTERS, NOT DITHER. Tone is laid in irregular clumps — a noise field
//     cut into a ramp by RANK, so each tone covers exactly the share of the
//     face it was given — never in a regular pattern. Single texels are
//     placed on purpose: a glint, a grain of sand, a crack.
//   * LIGHT FROM THE TOP LEFT. Anything with a shape — a cobble stone, a
//     brick, a board, a pebble, an ore crystal, a rivet — is lit along its
//     top and left edge and shadowed along its bottom and right, the same
//     way every time, so a wall reads as relief and not as a drawing of one.
//   * ONE SET OF RAMPS. Every material is four to six hand-picked tones, dark
//     to light, a little cool in the shadow and a little warm in the light,
//     so the whole atlas looks like one world.
//   * EVERYTHING WRAPS. Writes are taken modulo the tile, so a crack or a
//     stone that runs off one edge carries on at the other: seamless tiling
//     is a property of the painter, not something checked afterwards.
//
// The item icons, the plants, the doors and the pictures keep their own art —
// they were always the good half of Classic, and none of them is a face of a
// block. The glass keeps its own too: a pane is a frame, and the frame was
// right.
//
// Each tile draws from its OWN random stream (the seed and the tile's name),
// so redrawing one never moves a mark on another, and the art is the same on
// every machine.

export const CN = 16;

// --- the ramps --------------------------------------------------------------
// dark to light. Hex, so they can be read and argued with.

const RAMP = {
  grass: ['3b6624', '477a2c', '528b33', '5e9c3b', '6fb04a'],
  grassSide: ['3f6a26', '4a7d2d', '568e35', '63a03e'],
  dirt: ['4f3520', '5f4128', '6f4d30', '7d5937', '8c6641'],
  stone: ['5f6062', '6e6f71', '7c7d7f', '898a8c', '98999b'],
  sand: ['bfa96d', 'cab678', 'd3c184', 'dccb90', 'e5d69e'],
  sandOrange: ['a35f2c', 'b36b33', 'c2783b', 'cf8545', 'db9352'],
  gravel: ['4d4b4a', '646260', '7a7672', '8f8a85', 'a39e98'],
  gravelWarm: ['6a5b4c', '7e6d5b', '937f6a'],
  clay: ['7f8795', '8b93a1', '979fac', 'a3aab6', 'afb6c1'],
  snow: ['cdd8e0', 'dbe4eb', 'e6edf2', 'f0f5f8', 'fbfdfe'],
  ice: ['6f9bd0', '7eaad9', '8db7e1', '9fc6ea', 'c2def5'],
  water: ['214f8f', '285b9d', '2f66a9', '3972b5', '4a82c2'],
  lava: ['7a1a08', 'b0340b', 'd6560f', 'ee8418', 'f9b634', 'fde68a'],
  path: ['7a5d37', '87683e', '937346', 'a07f4f', 'ab8a59'],
  tilled: ['38251a', '432d1e', '4f3523', '5b3e28', '67482f'],
  thatch: ['7a6526', '927a2f', 'aa8f38', 'c1a443', 'd6b852', 'e6ca66'],
  leaf: ['1e3d12', '2b5419', '36651f', '417626', '4f8a2f', '64a03c'],
  mortar: ['3e3c3a', '4c4a47'],
  cobble: ['5c5c5d', '6d6d6e', '7e7e7f', '909091', 'a6a6a7'],
  cobbleRound: ['66625c', '7a756e', '8d8880', 'a09a91', 'b5afa5'],
  cobbleDark: ['2e2f33', '3a3b40', '46474d', '53545a', '62636a'],
  roundMortar: ['58534b', '6a645a'],
  moss: ['2f5a1f', '3d6e27', '4d8330', '5f963a'],
  brick: ['7a3223', '8c3b29', '9c4530', 'ab5037', 'b85c40'],
  brickMortar: ['8f877c', 'a39b8f', 'b2ab9f'],
  // timber: bark, end grain, boards
  oakBark: ['3a2a16', '4a361d', '5a4224', '6a4f2c', '7a5c35'],
  oakRings: ['7d5c33', '8f6b3c', 'a07b46', 'b08a52'],
  oakPlank: ['6b4d2a', '7c5a32', '8c683b', '9c7645', 'ab844f'],
  birchBark: ['4a4640', 'c9c4b8', 'd8d4c9', 'e5e2d9', 'f1efe9'],
  birchRings: ['c2ad7a', 'cfbb89', 'dbc998', 'e5d5a7'],
  birchPlank: ['a8935f', 'b8a36c', 'c6b27a', 'd3c088', 'dfcd97'],
  spruceBark: ['251a0f', '2f2214', '3a2a19', '45331f', '503c25'],
  spruceRings: ['5e4527', '6d512e', '7b5d36', '8a6a3f'],
  sprucePlank: ['4d3721', '5a4127', '684b2d', '755634', '82613b'],
  acaciaBark: ['4d4943', '5b5750', '69645c', '777269', '858077'],
  acaciaRings: ['a4502a', 'b55d31', 'c56b3a', 'd47a45'],
  acaciaPlank: ['8f4726', 'a0532d', 'b05f35', 'bf6c3e', 'cd7a48'],
  darkBark: ['211710', '2a1d13', '342417', '3e2c1c', '483421'],
  darkRings: ['46321d', '523b22', '5e4428', '6a4d2e'],
  darkPlank: ['352514', '3f2d19', '4a351e', '553e24', '60472b'],
  // what glints in the rock
  coal: ['141414', '232323', '343434'],
  iron: ['8a5a45', 'b37d62', 'd3a487', 'e8c4aa'],
  silver: ['9ea4aa', 'c0c6cb', 'dde2e6', 'f7f9fa'],
  diamond: ['1a8c96', '2fb7bf', '63dbe0', 'b4f5f5'],
  gold: ['9a6f10', 'c99a1b', 'e8c12e', 'fbe473'],
  copper: ['7e3a1f', 'b0592f', 'd47c4b', 'e8a174'],
  patina: ['4f8a70', '6fae92'],
  zinc: ['59697a', '7d91a4', 'a2b6c7', 'cbdae5'],
  tin: ['7f7f78', 'a4a49c', 'c6c6bd', 'e2e2da'],
  // the metal blocks, cast
  mIron: ['8b9095', 'a2a7ac', 'b8bdc1', 'cdd1d4', 'e3e6e8'],
  mGold: ['a8780f', 'c9941c', 'e0ae2b', 'f1c93d', 'fde372'],
  mDiamond: ['1f8f98', '31acb3', '4cc6cb', '7edde0', 'bff4f4'],
  mBrass: ['8f7230', 'a98a3d', 'c1a24c', 'd5b75f', 'e7cd7a'],
  mCopper: ['8a4428', 'a4552f', 'bb673a', 'cf7c4b', 'e39766'],
  mZinc: ['5d6c78', '738390', '8b9aa6', 'a4b2bc', 'c2cdd4'],
  mTin: ['85857d', '9d9d95', 'b3b3ab', 'c8c8c1', 'dedeD8'],
  mBronze: ['744a22', '8c5a29', 'a36b33', 'b87d40', 'cc9253'],
  mSilver: ['979ca1', 'b0b5b9', 'c7cbce', 'dcdfe1', 'f1f2f3'],
};

// --- the paint box ----------------------------------------------------------

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

function nameSeed(seed, name) {
  let h = (seed ^ 0x5bd1e995) >>> 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x9e3779b1) >>> 0;
  return h;
}

const hex = (s) => [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
const ramp = (key) => RAMP[key].map((s) => hex(s.toLowerCase()));
const scale = (c, k) => c.map((v) => Math.max(0, Math.min(255, v * k)));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// One tile being painted: RGB in 0..255 and alpha in 0..1, the layout
// textures.js's emit() blits into the atlas. Every write wraps.
class Tile {
  constructor() { this.n = CN; this.d = new Float32Array(CN * CN * 4); }
  i(x, y) {
    const xi = ((Math.round(x) % CN) + CN) % CN;
    const yi = ((Math.round(y) % CN) + CN) % CN;
    return (yi * CN + xi) * 4;
  }
  set(x, y, c, a = 1) {
    const i = this.i(x, y);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) { const i = this.i(x, y); return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  shade(x, y, k) {
    const i = this.i(x, y);
    for (let j = 0; j < 3; j++) this.d[i + j] = Math.max(0, Math.min(255, this.d[i + j] * k));
  }
  fill(c) { for (let y = 0; y < CN; y++) for (let x = 0; x < CN; x++) this.set(x, y, c); }
}

// A tileable value-noise field on a `cells` x `cells` lattice across the
// tile, smoothstepped between lattice points. Because the lattice indices
// wrap, so does the field.
function noise(R, cells) {
  const g = Array.from({ length: cells * cells }, () => R());
  const at = (i, j) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  const k = CN / cells;
  return (x, y) => {
    const fx = x / k, fy = y / k;
    const i = Math.floor(fx), j = Math.floor(fy);
    let u = fx - i, v = fy - j;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}

// A field from weighted octaves: [[cells, weight], ...] plus white noise.
function field(R, octaves, white = 0) {
  const fs = octaves.map(([c, w]) => [noise(R, c), w]);
  const out = new Float32Array(CN * CN);
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) {
      let v = white * R();
      for (const [f, w] of fs) v += w * f(x, y);
      out[y * CN + x] = v;
    }
  }
  return out;
}

// Cut a field into ramp steps BY RANK: step k covers exactly shares[k] of
// the face, whatever the field's own distribution — which is what makes the
// proportions of a material a decision rather than an accident.
function levels(f, shares) {
  const order = [...f.keys()].sort((a, b) => f[a] - f[b]);
  const out = new Uint8Array(f.length);
  const total = shares.reduce((a, b) => a + b, 0);
  let k = 0;
  let acc = shares[0] / total;
  order.forEach((idx, r) => {
    while (k < shares.length - 1 && r / f.length >= acc) { k++; acc += shares[k] / total; }
    out[idx] = k;
  });
  return out;
}

function paintLevels(t, lv, pal) {
  for (let y = 0; y < CN; y++) for (let x = 0; x < CN; x++) t.set(x, y, pal[lv[y * CN + x]]);
}

// A handful of lone texels in one colour: grains, glints, pits.
function specks(t, R, n, c, where = null) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    if (where && !where(x, y)) continue;
    t.set(x, y, c);
  }
}

// A short crack: a walk that mostly keeps its heading.
function crack(t, R, len, c) {
  let x = Math.floor(R() * CN), y = Math.floor(R() * CN);
  let dx = R() < 0.5 ? 1 : -1, dy = R() < 0.5 ? 1 : 0;
  for (let i = 0; i < len; i++) {
    t.set(x, y, c);
    if (R() < 0.35) { if (dy === 0) dy = R() < 0.5 ? 1 : -1; else dy = 0; }
    x += dx; y += dy;
  }
}

// Stones: nearest of a set of jittered seeds (wrapped), the edges between
// them mortar, each stone lit at its top-left and shaded at its bottom-right.
function stones(R, grid, jitter, round = 0.5) {
  const seeds = [];
  const step = CN / grid;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      seeds.push([(i + 0.5 + (R() - 0.5) * jitter) * step, (j + 0.5 + (R() - 0.5) * jitter) * step,
        0.8 + R() * 0.5]);
    }
  }
  const lab = new Int16Array(CN * CN);
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) {
      let best = 1e9, bi = 0;
      seeds.forEach(([sx, sy, w], si) => {
        let dx = Math.abs(x + 0.5 - sx), dy = Math.abs(y + 0.5 - sy);
        dx = Math.min(dx, CN - dx); dy = Math.min(dy, CN - dy);
        // between round (euclidean) and blocky (chebyshev) stones
        const d = (round * Math.hypot(dx, dy) + (1 - round) * Math.max(dx, dy)) / w;
        if (d < best) { best = d; bi = si; }
      });
      lab[y * CN + x] = bi;
    }
  }
  return { lab, count: seeds.length, at: (x, y) => lab[(((y % CN) + CN) % CN) * CN + (((x % CN) + CN) % CN)] };
}

// Lay stones into a tile: mortar where the label changes to the right or
// below, a tone per stone, and the stone's own light and shadow.
function layStones(t, R, S, pal, mortar, { speck = 3 } = {}) {
  const tone = Array.from({ length: S.count }, () => 1 + Math.floor(R() * (pal.length - 2)));
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) {
      const l = S.at(x, y);
      const edge = S.at(x + 1, y) !== l || S.at(x, y + 1) !== l;
      if (edge) { t.set(x, y, mortar[(x * 7 + y * 3) % mortar.length]); continue; }
      const top = S.at(x, y - 1) !== l || S.at(x - 1, y) !== l;
      const low = S.at(x, y + 2) !== l || S.at(x + 2, y) !== l;
      let k = tone[l];
      if (top) k = Math.min(pal.length - 1, k + 1);
      else if (low) k = Math.max(0, k - 1);
      t.set(x, y, pal[k]);
    }
  }
  for (let i = 0; i < speck; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    const l = S.at(x, y);
    if (S.at(x + 1, y) === l && S.at(x, y + 1) === l) t.set(x, y, pal[Math.max(0, tone[l] - 1)]);
  }
}

// --- the painters -----------------------------------------------------------

function stone(t, R, pal = ramp('stone')) {
  const f = field(R, [[2, 0.45], [4, 0.35], [8, 0.1]], 0.25);
  paintLevels(t, levels(f, [0.07, 0.2, 0.4, 0.23, 0.1]), pal);
  for (let i = 0; i < 3; i++) crack(t, R, 3 + Math.floor(R() * 3), pal[0]);
  specks(t, R, 4, pal[4]);
}

function dirt(t, R) {
  const pal = ramp('dirt');
  const f = field(R, [[4, 0.4], [8, 0.2]], 0.5);
  paintLevels(t, levels(f, [0.08, 0.27, 0.4, 0.2, 0.05]), pal);
  specks(t, R, 7, pal[0]);
  specks(t, R, 5, pal[4]);
}

function grassTop(t, R) {
  const pal = ramp('grass');
  const f = field(R, [[4, 0.35], [8, 0.15]], 0.55);
  paintLevels(t, levels(f, [0.08, 0.22, 0.38, 0.24, 0.08]), pal);
  // blades: a lit tip with its own shadow under it
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    t.set(x, y, pal[4]);
    t.set(x, y + 1, pal[1]);
  }
}

// The turf's edge as a height per column: a periodic wobble, so the tile
// joins its neighbour at the same height.
function turfEdge(R, base, amp) {
  const a = R() * Math.PI * 2, b = R() * Math.PI * 2;
  return Array.from({ length: CN }, (_, x) => Math.max(1, Math.round(base
    + amp * (0.6 * Math.sin((2 * Math.PI * x) / CN * 2 + a) + 0.4 * Math.sin((2 * Math.PI * x) / CN * 5 + b))
    + (R() < 0.25 ? 1 : 0))));
}

function grassSide(t, R) {
  dirt(t, R);
  const g = ramp('grassSide');
  const d = ramp('dirt');
  const edge = turfEdge(R, 3, 1.1);
  for (let x = 0; x < CN; x++) {
    for (let y = 0; y < edge[x]; y++) {
      const k = y === 0 ? 3 : R() < 0.3 ? 1 : 2;
      t.set(x, y, g[k]);
    }
    // the overhang's shadow on the soil, and a drip here and there
    t.set(x, edge[x], d[0]);
    if (R() < 0.18) { t.set(x, edge[x], g[0]); t.set(x, edge[x] + 1, d[0]); }
  }
}

function sand(t, R, key = 'sand') {
  const pal = ramp(key);
  const f = field(R, [[4, 0.3], [8, 0.2]], 0.55);
  paintLevels(t, levels(f, [0.06, 0.24, 0.42, 0.22, 0.06]), pal);
  specks(t, R, 6, pal[0]);
}

function gravel(t, R) {
  const pal = ramp('gravel');
  const warm = ramp('gravelWarm');
  t.fill(pal[0]);
  const f = field(R, [[8, 0.5]], 0.5);
  paintLevels(t, levels(f, [0.5, 0.5]), [pal[0], pal[1]]);
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    const w = 1 + Math.floor(R() * 3), h = 1 + Math.floor(R() * 2);
    const base = R() < 0.3 ? warm[1 + Math.floor(R() * 2)] : pal[2 + Math.floor(R() * 2)];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) t.set(x + dx, y + dy, base);
    t.set(x, y, scale(base, 1.18));
    t.set(x + w, y + h - 1, pal[0]);
    t.set(x + w - 1, y + h, pal[0]);
  }
}

function clay(t, R) {
  const pal = ramp('clay');
  const f = field(R, [[4, 0.4], [8, 0.15]], 0.45);
  paintLevels(t, levels(f, [0.08, 0.26, 0.4, 0.2, 0.06]), pal);
  // faint bedding, the way clay was laid down
  for (let y = 2; y < CN; y += 5) for (let x = 0; x < CN; x++) if (R() < 0.7) t.shade(x, y, 0.96);
}

function snow(t, R) {
  const pal = ramp('snow');
  const f = field(R, [[4, 0.45], [8, 0.2]], 0.35);
  paintLevels(t, levels(f, [0.05, 0.17, 0.33, 0.3, 0.15]), pal);
}

function ice(t, R) {
  const pal = ramp('ice');
  const f = field(R, [[2, 0.4], [4, 0.3]], 0.3);
  paintLevels(t, levels(f, [0.1, 0.25, 0.35, 0.22, 0.08]), pal);
  // long bright streaks on the diagonal: light caught inside the ice
  for (let s = 0; s < 3; s++) {
    const x0 = Math.floor(R() * CN), y0 = Math.floor(R() * CN);
    const len = 3 + Math.floor(R() * 4);
    for (let i = 0; i < len; i++) t.set(x0 + i, y0 - i, pal[4]);
  }
  crack(t, R, 4, pal[0]);
}

function water(t, R) {
  const pal = ramp('water');
  t.fill(pal[2]);
  const f = field(R, [[4, 0.6]], 0.4);
  paintLevels(t, levels(f, [0.12, 0.5, 0.38]), [pal[1], pal[2], pal[3]]);
  // a few long, low ripples: the shader moves the water, this only says
  // which way it is lying
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    const len = 3 + Math.floor(R() * 5);
    for (let k = 0; k < len; k++) t.set(x + k, y, k === 0 || k === len - 1 ? pal[3] : pal[4]);
  }
}

function lava(t, R) {
  const pal = ramp('lava');
  const f = field(R, [[4, 0.55], [8, 0.3]], 0.15);
  paintLevels(t, levels(f, [0.12, 0.2, 0.25, 0.22, 0.14, 0.07]), pal);
}

function pathTop(t, R) {
  const pal = ramp('path');
  const f = field(R, [[4, 0.35], [8, 0.15]], 0.5);
  paintLevels(t, levels(f, [0.1, 0.28, 0.36, 0.2, 0.06]), pal);
  const grit = ramp('gravel');
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    t.set(x, y, grit[3]);
    t.set(x + 1, y, grit[2]);
    t.set(x + 1, y + 1, pal[0]);
  }
}

function pathSide(t, R) {
  dirt(t, R);
  const pal = ramp('path');
  const edge = turfEdge(R, 2, 0.6);
  for (let x = 0; x < CN; x++) {
    for (let y = 0; y < edge[x]; y++) t.set(x, y, pal[y === 0 ? 3 : 2]);
    t.set(x, edge[x], ramp('dirt')[0]);
  }
}

function tilled(t, R) {
  const pal = ramp('tilled');
  const f = field(R, [[8, 0.3]], 0.7);
  paintLevels(t, levels(f, [0.15, 0.35, 0.35, 0.15]), pal.slice(1));
  // furrows: a shadowed trough under a lit ridge, four to the block
  for (let y = 0; y < CN; y++) {
    const r = y % 4;
    for (let x = 0; x < CN; x++) {
      if (r === 3) t.set(x, y, pal[0]);
      else if (r === 0 && R() < 0.8) t.set(x, y, pal[4]);
    }
  }
}

function thatch(t, R) {
  const pal = ramp('thatch');
  t.fill(pal[2]);
  // straws: short runs down each column, a tone each, leaning a little
  for (let x = 0; x < CN; x++) {
    let y = Math.floor(R() * CN);
    let filled = 0;
    while (filled < CN) {
      const len = 2 + Math.floor(R() * 5);
      const k = 1 + Math.floor(R() * 4);
      for (let i = 0; i < len; i++) t.set(x + Math.floor((y + i) / 8), y + i, pal[k]);
      t.set(x + Math.floor((y + len) / 8), y + len, pal[0]);
      y += len + 1;
      filled += len + 1;
    }
  }
  // the lit tips
  specks(t, R, 10, pal[5]);
  // a binding every half block, where the bundles are tied
  for (let x = 0; x < CN; x++) {
    t.set(x, 7, pal[1]);
    if (x % 3 !== 1) t.set(x, 8, pal[0]);
  }
}

function leaves(t, R, far = false) {
  const pal = ramp('leaf');
  const f = field(R, [[4, far ? 0.6 : 0.35], [8, 0.2]], far ? 0.2 : 0.45);
  const lv = levels(f, far ? [0.08, 0.14, 0.3, 0.28, 0.14, 0.06] : [0.16, 0.14, 0.24, 0.22, 0.16, 0.08]);
  paintLevels(t, lv, pal);
  // lit leaves: a bright texel on the upper left of a clump
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) {
      const k = lv[y * CN + x];
      if (k >= 4 && lv[((y + CN - 1) % CN) * CN + x] <= 1 && R() < 0.6) t.set(x, y, pal[5]);
    }
  }
}

// --- timber -----------------------------------------------------------------

function bark(t, R, key) {
  const pal = ramp(key);
  // strips a column or two wide, each its own tone
  const strip = [];
  for (let x = 0; x < CN;) {
    const w = 1 + Math.floor(R() * 2);
    const k = 1 + Math.floor(R() * (pal.length - 2));
    for (let i = 0; i < w && x < CN; i++, x++) strip[x] = k;
  }
  const f = field(R, [[8, 0.5]], 0.5);
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) {
      const v = f[y * CN + x];
      let k = strip[x] + (v > 0.72 ? 1 : v < 0.28 ? -1 : 0);
      k = Math.max(1, Math.min(pal.length - 1, k));
      t.set(x, y, pal[k]);
    }
  }
  // grooves: dark runs down the trunk with a lit lip beside them
  for (let g = 0; g < 4; g++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    const len = 4 + Math.floor(R() * 8);
    for (let i = 0; i < len; i++) {
      t.set(x, y + i, pal[0]);
      if (R() < 0.7) t.set(x + 1, y + i, pal[pal.length - 1]);
    }
  }
}

function birchBark(t, R) {
  const pal = ramp('birchBark');
  const f = field(R, [[4, 0.4], [8, 0.2]], 0.4);
  paintLevels(t, levels(f, [0.25, 0.4, 0.25, 0.1]), pal.slice(1));
  // the black lenticels, across the trunk, and the odd dark scar
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    const len = 1 + Math.floor(R() * 4);
    for (let k = 0; k < len; k++) t.set(x + k, y, pal[0]);
  }
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    t.set(x, y, pal[0]); t.set(x + 1, y, pal[0]); t.set(x, y + 1, pal[0]);
    t.set(x + 1, y + 1, pal[1]);
  }
}

// The end of a log: rings round the pith, the bark as a rim.
function endGrain(t, R, ringsKey, barkKey) {
  const pal = ramp(ringsKey);
  const bark = ramp(barkKey);
  const c = 7.5 + (R() - 0.5), c2 = 7.5 + (R() - 0.5);
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) {
      const dx = Math.abs(x - c), dy = Math.abs(y - c2);
      const d = Math.max(dx, dy) * 0.7 + Math.hypot(dx, dy) * 0.3;
      if (x === 0 || y === 0 || x === CN - 1 || y === CN - 1) {
        t.set(x, y, bark[1 + ((x * 3 + y * 5) % 3)]);
        continue;
      }
      const ring = Math.floor(d / 1.6 + 0.15 * R());
      t.set(x, y, pal[ring % 2 ? 1 : 2 + (ring % 4 === 0 ? 1 : 0)]);
      if (d < 1.2) t.set(x, y, pal[0]);
    }
  }
  // a check, split out from the pith
  let x = Math.round(c), y = Math.round(c2);
  const dx = R() < 0.5 ? 1 : -1;
  for (let i = 0; i < 4; i++) { t.set(x, y, pal[0]); x += dx; if (R() < 0.4) y += 1; }
}

function planks(t, R, key) {
  const pal = ramp(key);
  // four boards of four texels, each its own tone, a butt joint in each
  for (let b = 0; b < 4; b++) {
    const y0 = b * 4;
    const base = 1 + Math.floor(R() * 2);
    const joint = (b % 2 ? 4 : 12) + Math.floor((R() - 0.5) * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < CN; x++) {
        let k = base;
        if (y === 0) k = base + 1;                 // the lit top of the board
        if (y === 3) k = 0;                        // the gap under it
        t.set(x, y0 + y, pal[k]);
      }
    }
    // grain: long thin darker runs along the board
    for (let g = 0; g < 3; g++) {
      const gy = y0 + 1 + Math.floor(R() * 2);
      const gx = Math.floor(R() * CN);
      const len = 3 + Math.floor(R() * 6);
      for (let i = 0; i < len; i++) t.set(gx + i, gy, pal[Math.max(0, base - 1)]);
    }
    // the joint: a dark line, lit on its right, and a nail either side
    for (let y = 0; y < 3; y++) {
      t.set(joint, y0 + y, pal[0]);
      t.set(joint + 1, y0 + y, pal[base + 1]);
    }
    t.set(joint - 2, y0 + 1, pal[0]);
    t.set(joint + 3, y0 + 1, pal[0]);
  }
}

// --- masonry ----------------------------------------------------------------

function cobble(t, R) {
  const S = stones(R, 3, 0.9, 0.35);
  layStones(t, R, S, ramp('cobble'), ramp('mortar'), { speck: 5 });
}

function cobblestone(t, R, kind = 'plain') {
  const S = stones(R, 3, 0.8, 0.85);
  const pal = ramp(kind === 'dark' ? 'cobbleDark' : 'cobbleRound');
  const mortar = kind === 'dark' ? ramp('mortar') : ramp('roundMortar');
  layStones(t, R, S, pal, mortar, { speck: 4 });
  if (kind === 'mossy') {
    const moss = ramp('moss');
    const f = field(R, [[4, 0.6]], 0.4);
    for (let y = 0; y < CN; y++) {
      for (let x = 0; x < CN; x++) {
        const l = S.at(x, y);
        const inMortar = S.at(x + 1, y) !== l || S.at(x, y + 1) !== l;
        const v = f[y * CN + x] + (inMortar ? 0.18 : 0) + (y > 9 ? 0.08 : 0);
        if (v > 0.62) t.set(x, y, moss[Math.min(3, Math.floor((v - 0.62) * 12))]);
      }
    }
  }
}

function brick(t, R) {
  const pal = ramp('brick');
  const mortar = ramp('brickMortar');
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    const off = row % 2 ? 4 : 0;
    for (let b = 0; b < 2; b++) {
      const x0 = off + b * 8;
      const base = 1 + Math.floor(R() * 3);
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 7; x++) {
          let k = base;
          if (y === 0) k = Math.min(4, base + 1);
          if (y === 2) k = Math.max(0, base - 1);
          t.set(x0 + x, y0 + y, pal[k]);
        }
      }
      // a chip or two in each brick
      if (R() < 0.6) t.set(x0 + 1 + Math.floor(R() * 5), y0 + 1, pal[Math.max(0, base - 1)]);
      // the mortar: the bed under, and the joint at the end
      for (let x = 0; x < 8; x++) t.set(x0 + x, y0 + 3, mortar[x % 3 === 0 ? 0 : 1]);
      for (let y = 0; y < 4; y++) t.set(x0 + 7, y0 + y, mortar[y === 0 ? 2 : 1]);
    }
  }
}

// --- what is in the rock ----------------------------------------------------

function ore(t, R, key, { blobs = 4, size = 5, patina = false } = {}) {
  stone(t, R);
  const pal = ramp(key);
  const green = patina ? ramp('patina') : null;
  for (let b = 0; b < blobs; b++) {
    let x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    const cells = [];
    for (let i = 0; i < size; i++) {
      cells.push([x, y]);
      const d = Math.floor(R() * 4);
      x += [1, -1, 0, 0][d]; y += [0, 0, 1, -1][d];
    }
    const key2 = (p) => `${((p[0] % CN) + CN) % CN},${((p[1] % CN) + CN) % CN}`;
    const set = new Set(cells.map(key2));
    for (const [cx, cy] of cells) {
      const up = set.has(key2([cx, cy - 1])), left = set.has(key2([cx - 1, cy]));
      const down = set.has(key2([cx, cy + 1])), right = set.has(key2([cx + 1, cy]));
      let k = 1;
      if (!up || !left) k = 2;
      if (!down && !right) k = 0;
      t.set(cx, cy, pal[k]);
      // a dark rim below and right of the crystal, where it sits in the rock
      if (!down) t.set(cx, cy + 1, scale(t.get(cx, cy + 1), 0.82));
      if (!right) t.set(cx + 1, cy, scale(t.get(cx + 1, cy), 0.86));
    }
    // one glint
    const [gx, gy] = cells[0];
    t.set(gx, gy, pal[pal.length - 1]);
    if (green && R() < 0.8) {
      const [px, py] = cells[cells.length - 1];
      t.set(px, py, green[Math.floor(R() * 2)]);
    }
  }
}

// --- cast metal ---------------------------------------------------------------

function metalBlock(t, R, key, { facets = false } = {}) {
  const pal = ramp(key);
  t.fill(pal[2]);
  const f = field(R, [[4, 0.5]], 0.5);
  for (let y = 0; y < CN; y++) {
    for (let x = 0; x < CN; x++) if (f[y * CN + x] > 0.72) t.set(x, y, pal[3]);
  }
  if (facets) {
    // cut, not cast: four by four stones, each lit at the top left
    for (let y = 0; y < CN; y++) {
      for (let x = 0; x < CN; x++) {
        const u = x % 4, v = y % 4;
        let k = 2;
        if (u === 0 || v === 0) k = 4;
        else if (u === 3 || v === 3) k = 1;
        else if (u === 1 && v === 1) k = 4;
        t.set(x, y, pal[k]);
      }
    }
  } else {
    // a sheen across the face, and the four rivets
    for (let i = -2; i < CN; i += 7) {
      for (let k = 0; k < CN; k++) t.set(k, i + k, pal[3]);
    }
    for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
      t.set(x, y, pal[0]);
      t.set(x - 1, y - 1, pal[4]);
    }
  }
  // the rim: lit along the top and left, shadowed along the bottom and right
  for (let i = 0; i < CN; i++) {
    t.set(i, 0, pal[4]); t.set(0, i, pal[4]);
    t.set(i, CN - 1, pal[0]); t.set(CN - 1, i, pal[0]);
  }
  t.set(CN - 1, 0, pal[2]); t.set(0, CN - 1, pal[2]);
}

// --- dyed stuff ---------------------------------------------------------------

function wool(t, R, c) {
  const base = hex(c);
  const pal = [scale(base, 0.8), scale(base, 0.9), base, scale(base, 1.07), scale(base, 1.14)];
  const f = field(R, [[8, 0.45]], 0.55);
  paintLevels(t, levels(f, [0.1, 0.25, 0.35, 0.2, 0.1]), pal);
  // the curl of the fibres: short lit arcs over their own shadow
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(R() * CN), y = Math.floor(R() * CN);
    t.set(x, y, pal[4]); t.set(x + 1, y, pal[3]);
    t.set(x + 1, y + 1, pal[0]); t.set(x + 2, y + 1, pal[1]);
  }
}

function cement(t, R, c) {
  const base = hex(c);
  const pal = [scale(base, 0.95), base, scale(base, 1.04)];
  const f = field(R, [[8, 0.2]], 0.8);
  paintLevels(t, levels(f, [0.2, 0.6, 0.2]), pal);
}

// --- things made of them -------------------------------------------------------

function furnaceSide(t, R) {
  cobble(t, R);
  const pal = ramp('cobble');
  for (let x = 0; x < CN; x++) { t.set(x, 0, pal[4]); t.set(x, 1, pal[2]); }
}

function furnaceTop(t, R) {
  const pal = ramp('stone');
  const f = field(R, [[4, 0.4]], 0.6);
  paintLevels(t, levels(f, [0.15, 0.55, 0.3]), [pal[2], pal[3], pal[4]]);
  for (let i = 0; i < CN; i++) {
    t.set(i, 0, pal[4]); t.set(0, i, pal[4]);
    t.set(i, CN - 1, pal[0]); t.set(CN - 1, i, pal[0]);
  }
  for (let i = 2; i < CN - 2; i++) { t.set(i, 2, pal[1]); t.set(2, i, pal[1]); t.set(i, CN - 3, pal[4]); t.set(CN - 3, i, pal[4]); }
}

function furnaceFront(t, R) {
  furnaceSide(t, R);
  const pal = ramp('cobble');
  const lava = ramp('lava');
  // the mouth: a dark opening under an iron lintel, a few coals still warm
  for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) t.set(x, y, hex('141312'));
  for (let x = 3; x < 13; x++) { t.set(x, 7, pal[1]); t.set(x, 14, pal[4]); }
  for (let y = 7; y < 15; y++) { t.set(3, y, pal[1]); t.set(12, y, pal[4]); }
  for (let x = 4; x < 12; x += 2) t.set(x, 9, hex('2a2826'));
  for (const [x, y, k] of [[5, 13, 1], [6, 13, 2], [8, 13, 1], [9, 12, 3], [10, 13, 2]]) t.set(x, y, lava[k]);
  // the flue above
  for (let x = 6; x < 10; x++) t.set(x, 4, pal[0]);
}

function craftTop(t, R) {
  planks(t, R, 'oakPlank');
  const pal = ramp('oakPlank');
  for (let i = 0; i < CN; i++) {
    t.set(i, 0, pal[0]); t.set(0, i, pal[0]); t.set(i, CN - 1, pal[0]); t.set(CN - 1, i, pal[0]);
    for (const g of [5, 10]) { t.set(i, g, pal[0]); t.set(g, i, pal[0]); }
  }
}

function craftSide(t, R) {
  planks(t, R, 'oakPlank');
  const pal = ramp('oakPlank');
  for (let x = 0; x < CN; x++) { t.set(x, 0, pal[4]); t.set(x, 1, pal[3]); t.set(x, 2, pal[0]); }
  // a saw hung on one side, a hammer on the other
  const steel = [hex('8d9297'), hex('b6bbbf'), hex('dfe2e4')];
  const wood = ramp('darkPlank');
  for (let i = 0; i < 6; i++) { t.set(2 + i, 5 + Math.floor(i / 3), steel[1]); t.set(2 + i, 6 + Math.floor(i / 3), steel[0]); }
  t.set(2, 5, steel[2]);
  for (const [x, y] of [[8, 6], [9, 6], [8, 7], [9, 7]]) t.set(x, y, wood[2]);
  for (let y = 5; y < 13; y++) t.set(12, y, wood[1]);
  for (let x = 10; x < 15; x++) { t.set(x, 5, steel[0]); t.set(x, 4, steel[2]); }
}

function chest(t, R) {
  planks(t, R, 'oakPlank');
  const pal = ramp('oakPlank');
  const iron = [hex('3a3a3a'), hex('8d9297'), hex('c9cdd0')];
  for (let i = 0; i < CN; i++) {
    t.set(i, 0, pal[0]); t.set(0, i, pal[0]); t.set(i, CN - 1, pal[0]); t.set(CN - 1, i, pal[0]);
    t.set(i, 5, pal[0]); t.set(i, 6, pal[4]);
  }
  // the latch
  for (let y = 4; y < 9; y++) for (let x = 7; x < 9; x++) t.set(x, y, iron[1]);
  t.set(7, 4, iron[2]); t.set(8, 8, iron[0]); t.set(7, 7, iron[0]);
}

// --- the list -----------------------------------------------------------------

const WOODS = [
  ['', 'oak'], ['_BIRCH', 'birch'], ['_SPRUCE', 'spruce'], ['_ACACIA', 'acacia'], ['_DARK', 'dark'],
];
const WOOL = {
  WOOL_WHITE: 'e8ebeb', WOOL_RED: 'a02722', WOOL_ORANGE: 'e87015', WOOL_YELLOW: 'f2c32a',
  WOOL_GREEN: '557a21', WOOL_BLUE: '34419c', WOOL_PURPLE: '7a31a8', WOOL_BLACK: '222226',
  WOOL_BROWN: '6f4629', WOOL_GREY: '8c8c86',
};
const CEMENT = {
  CEMENT_WHITE: 'cfd4d5', CEMENT_RED: '8f2522', CEMENT_ORANGE: 'd9661a', CEMENT_YELLOW: 'e7ac22',
  CEMENT_GREEN: '5b7a23', CEMENT_BLUE: '2f3b8e', CEMENT_PURPLE: '66279a', CEMENT_BLACK: '17181c',
  CEMENT_GREY_LIGHT: 'a6a8a9', CEMENT_GREY: '76787a', CEMENT_GREY_DARK: '4a4c4f',
};

/**
 * Every Classic block face, as [tile name, painter]. The atlas calls each
 * painter on a fresh 16-texel tile with that tile's own random stream.
 */
export function classicBlocks() {
  const list = [
    ['GRASS_TOP', grassTop], ['GRASS_SIDE', grassSide], ['DIRT', dirt], ['STONE', (t, R) => stone(t, R)],
    ['SAND', (t, R) => sand(t, R)], ['SAND_ORANGE', (t, R) => sand(t, R, 'sandOrange')],
    ['GRAVEL', gravel], ['CLAY', clay], ['SNOW', snow], ['ICE', ice], ['WATER', water], ['LAVA', lava],
    ['PATH', pathTop], ['PATH_SIDE', pathSide], ['TILLED', tilled], ['THATCH', thatch],
    ['LEAF', (t, R) => leaves(t, R)], ['LEAF_FAR', (t, R) => leaves(t, R, true)],
    ['COBBLE', cobble], ['COBBLESTONE', (t, R) => cobblestone(t, R)],
    ['COBBLESTONE_MOSSY', (t, R) => cobblestone(t, R, 'mossy')],
    ['COBBLESTONE_DARK', (t, R) => cobblestone(t, R, 'dark')],
    ['BRICK', brick],
    ['COAL', (t, R) => ore(t, R, 'coal', { blobs: 4, size: 5 })],
    ['IRON', (t, R) => ore(t, R, 'iron', { blobs: 4, size: 4 })],
    ['SILVER', (t, R) => ore(t, R, 'silver', { blobs: 4, size: 4 })],
    ['DIAMOND', (t, R) => ore(t, R, 'diamond', { blobs: 3, size: 4 })],
    ['GOLD', (t, R) => ore(t, R, 'gold', { blobs: 4, size: 4 })],
    ['COPPER', (t, R) => ore(t, R, 'copper', { blobs: 4, size: 4, patina: true })],
    ['ZINC', (t, R) => ore(t, R, 'zinc', { blobs: 4, size: 4 })],
    ['TIN', (t, R) => ore(t, R, 'tin', { blobs: 4, size: 4 })],
    ['BLOCK_IRON', (t, R) => metalBlock(t, R, 'mIron')],
    ['BLOCK_GOLD', (t, R) => metalBlock(t, R, 'mGold')],
    ['BLOCK_DIAMOND', (t, R) => metalBlock(t, R, 'mDiamond', { facets: true })],
    ['BLOCK_BRASS', (t, R) => metalBlock(t, R, 'mBrass')],
    ['BLOCK_COPPER', (t, R) => metalBlock(t, R, 'mCopper')],
    ['BLOCK_ZINC', (t, R) => metalBlock(t, R, 'mZinc')],
    ['BLOCK_TIN', (t, R) => metalBlock(t, R, 'mTin')],
    ['BLOCK_BRONZE', (t, R) => metalBlock(t, R, 'mBronze')],
    ['BLOCK_SILVER', (t, R) => metalBlock(t, R, 'mSilver')],
    ['FURNACE_FRONT', furnaceFront], ['FURNACE_SIDE', furnaceSide], ['FURNACE_TOP', furnaceTop],
    ['CRAFT_TOP', craftTop], ['CRAFT_SIDE', craftSide], ['CHEST', chest],
  ];
  for (const [suffix, w] of WOODS) {
    list.push([`LOG_SIDE${suffix}`, w === 'birch' ? birchBark : (t, R) => bark(t, R, `${w}Bark`)]);
    list.push([`LOG_TOP${suffix}`, (t, R) => endGrain(t, R, `${w}Rings`, `${w}Bark`)]);
    list.push([suffix ? `PLANK${suffix}` : 'PLANK', (t, R) => planks(t, R, `${w}Plank`)]);
  }
  for (const [name, c] of Object.entries(WOOL)) list.push([name, (t, R) => wool(t, R, c)]);
  for (const [name, c] of Object.entries(CEMENT)) list.push([name, (t, R) => cement(t, R, c)]);
  return list;
}

/** Paint every Classic block face: `put(tileName, tile)` receives each. */
export function paintClassicBlocks(seed, put) {
  for (const [name, fn] of classicBlocks()) {
    const t = new Tile();
    fn(t, rng(nameSeed(seed, name)));
    put(name, t);
  }
}
