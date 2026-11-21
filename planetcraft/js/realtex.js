// realtex.js — what the Realistic style's photographs cannot give it.
//
// The Realistic style draws its blocks with photographs: scanned materials,
// colour and normal and roughness, baked by tools/bake_real_textures.py into
// textures/real/ and loaded by realism.js. A photograph is the whole answer
// for a hillside, a wall of brick or a floor of boards. It is not the answer
// for a few things this game needs and nobody photographs:
//
//   * the END of a log, square, with its bark round the edge — sampled off
//     the species' own bark photograph, so the rim and the side agree;
//   * a canopy with HOLES in it, and a tuft of grass standing up out of a
//     field — cut-outs, which a scanned surface never is;
//   * birch, which none of the libraries has, and ice;
//   * ore: crystals of coal or copper set INTO the stone photograph, cell for
//     cell the same rock the stone block wears;
//   * the joins BETWEEN photographs — the turf hanging over the edge of a
//     grass block's soil, the lip of a path, the furrows of a field.
//
// All of it is painted on a `Mat`: colour, height, roughness and coverage per
// texel, plus — for a Mat that started life as a photograph — the photo's own
// normal, which the painted height is added to rather than replacing.
//
// Nothing here draws a random number from Math.random: every mark is hashed
// off a seed, so the same seed paints the same blocks on every machine.

export const REAL_N = 256;      // texels a block, in every layer

// --- hashing and noise -------------------------------------------------------
//
// All of it PERIODIC. A tile has to wrap, and a noise field wraps for free if
// its lattice does: every lattice coordinate is taken modulo the period before
// it is hashed. Frequencies are therefore whole numbers of cycles per texture.

export function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
    ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// a small seeded stream for the placement of marks (strokes, leaves, knots)
export function stream(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GX = new Float32Array(16), GY = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  GX[i] = Math.cos((i * Math.PI) / 8);
  GY[i] = Math.sin((i * Math.PI) / 8);
}

// Gradient noise on a lattice that repeats every px by py cells, about -1..1.
export function perlin(x, y, px, py, s) {
  const xf = Math.floor(x), yf = Math.floor(y);
  const fx = x - xf, fy = y - yf;
  let x0 = xf % px; if (x0 < 0) x0 += px;
  let y0 = yf % py; if (y0 < 0) y0 += py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1;
  let i = (hash3(x0, y0, s) * 16) | 0;
  const a = GX[i] * fx + GY[i] * fy;
  i = (hash3(x1, y0, s) * 16) | 0;
  const b = GX[i] * (fx - 1) + GY[i] * fy;
  i = (hash3(x0, y1, s) * 16) | 0;
  const c = GX[i] * fx + GY[i] * (fy - 1);
  i = (hash3(x1, y1, s) * 16) | 0;
  const d = GX[i] * (fx - 1) + GY[i] * (fy - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return (ab + (cd - ab) * v) * 1.41;
}

// Fractal noise over a texture S texels square, `f` whole cycles across it at
// the first octave, `fy` cycles down it (a fibre wants few along and many
// across).
export function fbm(x, y, S, f, oct, s, gain = 0.5, fy = f) {
  let sum = 0, amp = 1, norm = 0, a = f, b = fy;
  for (let i = 0; i < oct; i++) {
    sum += perlin((x * a) / S, (y * b) / S, a, b, s + i * 101) * amp;
    norm += amp;
    amp *= gain;
    a *= 2; b *= 2;
  }
  return sum / norm;
}

// --- colour helpers ------------------------------------------------------------

const hexc = (s) => [
  parseInt(s.slice(0, 2), 16) / 255,
  parseInt(s.slice(2, 4), 16) / 255,
  parseInt(s.slice(4, 6), 16) / 255,
];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

// --- the canvas a material is painted on ----------------------------------------
//
// Colour is sRGB 0..1 (the space the photographs are in, and the one a colour
// picked by eye is in); height, roughness and coverage are 0..1. `nb` is the
// normal a photograph came with, x and y in tangent space with v UP, or null
// for a material painted from nothing. Everything wraps.

export class Mat {
  constructor(S) {
    this.S = S;
    this.c = new Float32Array(S * S * 3);
    this.h = new Float32Array(S * S);
    this.r = new Float32Array(S * S).fill(0.85);
    this.a = new Float32Array(S * S).fill(1);
    this.nb = null;
    this.mt = null;         // metal per texel, when only some of it is metal
    this.depth = 3;         // how many texels deep the painted height runs
    this.cavity = 0.35;     // how much painted crevices darken the colour
  }
  i(x, y) {
    const S = this.S;
    let xi = Math.floor(x) % S; if (xi < 0) xi += S;
    let yi = Math.floor(y) % S; if (yi < 0) yi += S;
    return yi * S + xi;
  }
  set(k, col) {
    const j = k * 3;
    this.c[j] = col[0]; this.c[j + 1] = col[1]; this.c[j + 2] = col[2];
  }
  get(k) { const j = k * 3; return [this.c[j], this.c[j + 1], this.c[j + 2]]; }
  blend(k, col, t) {
    const j = k * 3;
    this.c[j] += (col[0] - this.c[j]) * t;
    this.c[j + 1] += (col[1] - this.c[j + 1]) * t;
    this.c[j + 2] += (col[2] - this.c[j + 2]) * t;
  }
  mul(k, m) {
    const j = k * 3;
    this.c[j] *= m; this.c[j + 1] *= m; this.c[j + 2] *= m;
  }
  // a copy, so an overlay can be painted on a photograph without touching
  // the photograph other blocks are drawn from
  clone() {
    const m = new Mat(this.S);
    m.c.set(this.c); m.h.set(this.h); m.r.set(this.r); m.a.set(this.a);
    if (this.nb) m.nb = new Float32Array(this.nb);
    m.depth = this.depth; m.cavity = this.cavity;
    return m;
  }
}

// A Mat from a baked photograph: `col` and `nr` are RGBA bytes, S by S, rows
// top first — the colour, and normal.xy + roughness packed the way the bake
// packs them.
export function fromPhoto(col, nr, S) {
  const m = new Mat(S);
  m.nb = new Float32Array(S * S * 2);
  for (let k = 0; k < S * S; k++) {
    const o = k * 4;
    m.c[k * 3] = col[o] / 255;
    m.c[k * 3 + 1] = col[o + 1] / 255;
    m.c[k * 3 + 2] = col[o + 2] / 255;
    m.nb[k * 2] = nr[o] / 127.5 - 1;
    m.nb[k * 2 + 1] = nr[o + 1] / 127.5 - 1;
    m.r[k] = nr[o + 2] / 255;
    m.h[k] = 0;
  }
  m.depth = 4;
  m.cavity = 0;          // the photograph's own occlusion is baked in already
  return m;
}

// A tapering capsule from (x0, y0) to (x1, y1), radius r0 to r1, with an
// antialiased rim. `paint(k, t, cover)` is called for every texel it touches,
// with t the position along it.
function capsule(m, x0, y0, x1, y1, r0, r1, paint, clip = false) {
  const S = m.S;
  const minx = Math.floor(Math.min(x0 - r0, x1 - r1)) - 1;
  const maxx = Math.ceil(Math.max(x0 + r0, x1 + r1)) + 1;
  const miny = Math.floor(Math.min(y0 - r0, y1 - r1)) - 1;
  const maxy = Math.ceil(Math.max(y0 + r0, y1 + r1)) + 1;
  const dx = x1 - x0, dy = y1 - y0;
  const L2 = dx * dx + dy * dy || 1e-6;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const qx = x + 0.5 - x0, qy = y + 0.5 - y0;
      let t = (qx * dx + qy * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - dx * t, ey = qy - dy * t;
      const d = Math.sqrt(ex * ex + ey * ey);
      const r = r0 + (r1 - r0) * t;
      const cover = clamp01(r + 0.5 - d);
      if (cover <= 0) continue;
      // a sprite's strokes stop at its edge: wrapped, the foot of every
      // blade came back in at the top of the tile as a row of dashes
      if (clip && (x < 0 || x >= S || y < 0 || y >= S)) continue;
      let xi = x % S; if (xi < 0) xi += S;
      let yi = y % S; if (yi < 0) yi += S;
      paint(yi * S + xi, t, cover);
    }
  }
}

// A rotated ellipse — or, with `point` > 0, a lens pointed at both ends like a
// leaf. `paint(k, u, v, cover)` gets the texel in the ellipse's own frame.
function ellipse(m, cx, cy, rx, ry, ang, point, paint) {
  const S = m.S;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const R = Math.max(rx, ry) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const qx = x + 0.5 - cx, qy = y + 0.5 - cy;
      const u = (qx * ca + qy * sa) / rx;
      const v = (-qx * sa + qy * ca) / ry;
      const w = point > 0 ? 1 - Math.pow(Math.abs(u), 2) * point : 1;
      const d = u * u + (w > 0.05 ? (v * v) / (w * w) : 99);
      const edge = (1 - Math.sqrt(d)) * Math.min(rx, ry);
      const cover = clamp01(edge + 0.5);
      if (cover <= 0) continue;
      let xi = x % S; if (xi < 0) xi += S;
      let yi = y % S; if (yi < 0) yi += S;
      paint(yi * S + xi, u, v, cover);
    }
  }
}

// a wrapped box blur of a scalar field
function blur(src, S, r) {
  const tmp = new Float32Array(S * S), out = new Float32Array(S * S);
  const n = 2 * r + 1;
  for (let y = 0; y < S; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[y * S + ((k + S) % S)];
    for (let x = 0; x < S; x++) {
      tmp[y * S + x] = acc / n;
      acc += src[y * S + ((x + r + 1) % S)] - src[y * S + ((x - r + S) % S)];
    }
  }
  for (let x = 0; x < S; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[((k + S) % S) * S + x];
    for (let y = 0; y < S; y++) {
      out[y * S + x] = acc / n;
      acc += tmp[((y + r + 1) % S) * S + x] - tmp[((y - r + S) % S) * S + x];
    }
  }
  return out;
}

// --- timber ---------------------------------------------------------------------

export const RINGS = {
  oak: { early: 'b88d5c', late: '8a6238', heart: '9c6f43', crack: '3b2819', rays: 0.05 },
  birch: { early: 'e3d3ae', late: 'c9b28a', heart: 'd6c29a', crack: '6a5a40', rays: 0 },
  spruce: { early: 'c79d6c', late: '8f6840', heart: 'b28654', crack: '3a2616', rays: 0 },
  acacia: { early: 'c8703f', late: '9a4a22', heart: 'a8552a', crack: '4a2412', rays: 0.03 },
  dark: { early: '6e4b2e', late: '4a2f1b', heart: '553621', crack: '1e140c', rays: 0.04 },
};

// The CUT END of a log. Rings round a pith set a little off centre, each year
// a band of pale earlywood closing on a thin dark line of latewood, the whole
// field wobbling the way no trunk grows round; the heartwood a shade deeper
// than the sapwood outside it; rays running out from the heart in the oaks; a
// check or two splitting out from the pith; faint saw marks across the lot —
// and the bark all round the square edge, cut from `barkMat`, the species' own
// bark, so the rim and the trunk's side are one skin.
export function logTop(S, seed, sp, barkMat) {
  const m = new Mat(S);
  m.depth = 3;
  m.cavity = 0.45;
  const sc = S / 128;
  const Rn = stream(seed + 33);
  const early = hexc(sp.early), late = hexc(sp.late), heartC = hexc(sp.heart);
  const crackC = hexc(sp.crack);
  const pcx = S / 2 + (Rn() - 0.5) * S * 0.12;
  const pcy = S / 2 + (Rn() - 0.5) * S * 0.12;
  const ringW = S / (26 + Rn() * 10);
  const rim = S * 0.06;
  const cracks = [];
  const nc = 1 + ((Rn() * 2.5) | 0);
  for (let i = 0; i < nc; i++) cracks.push(Rn() * Math.PI * 2);
  const heartR = S * (0.22 + Rn() * 0.08);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const dx = x + 0.5 - pcx, dy = y + 0.5 - pcy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      // the wobble is a function of direction (a year grows faster on one
      // side than the other) plus a little that is not
      const wob = perlin(Math.cos(ang) * 2 + 3, Math.sin(ang) * 2 + 3, 64, 64,
        seed + 34) * ringW * 1.4
        + perlin(dx / (18 * sc) + 11, dy / (18 * sc) + 7, 64, 64, seed + 35) * 2 * sc;
      const ph = (r + wob) / ringW;
      const f = ph - Math.floor(ph);
      const lateT = smooth(0.66, 0.97, f) * 0.8;
      const n = fbm(x, y, S, 24, 2, seed + 36);
      const base = [mix(early[0], heartC[0], 1 - smooth(heartR - 4 * sc, heartR + 4 * sc, r)),
        mix(early[1], heartC[1], 1 - smooth(heartR - 4 * sc, heartR + 4 * sc, r)),
        mix(early[2], heartC[2], 1 - smooth(heartR - 4 * sc, heartR + 4 * sc, r))];
      let c = [mix(base[0], late[0], lateT), mix(base[1], late[1], lateT),
        mix(base[2], late[2], lateT)];
      // the rays: fine lines out from the pith, a shade paler
      const ray = sp.rays > 0
        ? Math.pow(Math.abs(Math.sin(ang * 90 + perlin(r / (30 * sc), 0.5, 64, 64, seed + 39) * 2)), 40)
          * sp.rays * 4 : 0;
      const saw = 1 + Math.sin(((x * 0.93 + y * 0.31) / S) * Math.PI * 2 * 22) * 0.018;
      const s = saw * (1 + n * 0.05) * (1 + ray);
      c = [c[0] * s, c[1] * s, c[2] * s];
      // the checks
      let crack = 0;
      for (const ca of cracks) {
        const da = Math.abs(Math.atan2(Math.sin(ang - ca), Math.cos(ang - ca)));
        const width = (0.012 + 0.02 * (1 - r / (S * 0.6))) ;
        if (r > S * 0.03 && r < S * 0.4) crack = Math.max(crack, 1 - smooth(0, width, da));
      }
      c = [mix(c[0], crackC[0], crack * 0.9), mix(c[1], crackC[1], crack * 0.9),
        mix(c[2], crackC[2], crack * 0.9)];
      // the bark round the square edge, off the trunk's own photograph
      const edge = Math.min(x + 0.5, y + 0.5, S - x - 0.5, S - y - 0.5)
        + fbm(x, y, S, 12, 2, seed + 37) * 3 * sc;
      const inBark = 1 - smooth(rim - 1.5 * sc, rim + 1.5 * sc, edge);
      const cambium = smooth(rim - sc, rim + sc, edge) * (1 - smooth(rim + sc, rim + 4 * sc, edge));
      if (inBark > 0 && barkMat) {
        const bk = barkMat.i((x * barkMat.S) / S, (y * barkMat.S) / S);
        const bc = barkMat.get(bk);
        c = [mix(c[0], bc[0], inBark), mix(c[1], bc[1], inBark), mix(c[2], bc[2], inBark)];
      }
      c = [c[0] * (1 - cambium * 0.35), c[1] * (1 - cambium * 0.35),
        c[2] * (1 - cambium * 0.35)];
      m.set(k, c);
      m.h[k] = (1 - lateT) * 0.05 + lateT * 0.1 + n * 0.06 - crack * 0.7
        + inBark * 0.35 - cambium * 0.15;
      m.r[k] = mix(0.7, 0.9, inBark) + crack * 0.1;
    }
  }
  return m;
}

// BIRCH, which no library has photographed for us: papery white bark, faintly
// banded where it peels, marked across the grain by the dark dashes of the
// lenticels and here and there the black scar of a lost branch.
export function birchBark(S, seed) {
  const m = new Mat(S);
  m.depth = 3;
  m.cavity = 0.3;
  const sc = S / 128;
  const base = hexc('d8d2c5'), ridge = hexc('ece7dd'), dash = hexc('2f2927');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const n1 = fbm(x, y, S, 4, 3, seed + 25);
      const band = fbm(x, y, S, 2, 3, seed + 26, 0.5, 12);
      const t = clamp01(0.55 + n1 * 0.8 + band * 0.4);
      const s = 1 + fbm(x, y, S, 32, 2, seed + 27, 0.5, 8) * 0.05;
      m.set(k, [mix(base[0], ridge[0], t) * s, mix(base[1], ridge[1], t) * s,
        mix(base[2], ridge[2], t) * s]);
      m.h[k] = 0.6 + band * 0.25 + n1 * 0.1;
      m.r[k] = 0.62;
    }
  }
  const R = stream(seed + 31);
  const nDash = Math.round((S * S) / (300 * sc * sc));
  for (let i = 0; i < nDash; i++) {
    const cx = R() * S, cy = R() * S;
    const len = (3 + R() * 9) * sc, th = (0.5 + R() * 0.7) * sc;
    capsule(m, cx - len / 2, cy, cx + len / 2, cy + (R() - 0.5) * 1.2 * sc, th,
      th * 0.8, (k, t, cover) => {
        m.blend(k, dash, cover * 0.85);
        m.h[k] = mix(m.h[k], 0.25, cover);
        m.r[k] = mix(m.r[k], 0.85, cover);
      });
  }
  for (let i = 0; i < 2; i++) {
    const cx = R() * S, cy = R() * S;
    ellipse(m, cx, cy, (5 + R() * 5) * sc, (2.5 + R() * 2) * sc, (R() - 0.5) * 0.4, 0.6,
      (k, u, v, cover) => {
        m.blend(k, [0.12, 0.1, 0.09], cover * 0.9);
        m.h[k] = mix(m.h[k], 0.2, cover);
      });
  }
  return m;
}

// --- ice ------------------------------------------------------------------------------

// Clear blue with darker depths in it, white cracks that stop short of the
// edges, a few trapped bubbles; glossy.
export function ice(S, seed) {
  const m = new Mat(S);
  m.depth = 2;
  m.cavity = 0.1;
  const sc = S / 128;
  const deep = hexc('6d9cc2'), pale = hexc('a9cde6'), crackC = hexc('eaf5fc');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const n = fbm(x, y, S, 3, 4, seed + 24);
      const t = clamp01(0.55 + n * 1.2);
      m.set(k, [mix(deep[0], pale[0], t), mix(deep[1], pale[1], t),
        mix(deep[2], pale[2], t)]);
      m.h[k] = 0.6 + n * 0.1;
      m.r[k] = 0.06;
    }
  }
  const R = stream(seed + 5);
  for (let i = 0; i < 5; i++) {
    let x = R() * S, y = R() * S, a = R() * Math.PI * 2;
    const steps = 4 + ((R() * 6) | 0);
    for (let s = 0; s < steps; s++) {
      a += (R() - 0.5) * 0.7;
      const len = (4 + R() * 8) * sc;
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      capsule(m, x, y, nx, ny, 0.55 * sc, 0.35 * sc, (k, t, cover) => {
        m.blend(k, crackC, cover * 0.7);
        m.h[k] -= 0.3 * cover;
        m.r[k] = mix(m.r[k], 0.4, cover);
      });
      x = nx; y = ny;
    }
  }
  for (let i = 0; i < 30; i++) {
    const cx = R() * S, cy = R() * S, r = (0.6 + R() * 1.4) * sc;
    ellipse(m, cx, cy, r, r, 0, 0, (k, u, v, cover) => {
      const rim = clamp01((u * u + v * v - 0.35) * 2);
      m.blend(k, rim > 0.5 ? hexc('5f8db0') : hexc('f4fbff'), cover * 0.7);
    });
  }
  return m;
}

// --- ores ---------------------------------------------------------------------------

export const ORE = {
  COAL: { c: ['1a1a1d', '2a2a2e', '101012'], rough: 0.3, metal: 0, size: 1.0, n: 6 },
  IRON: { c: ['a0694a', 'b87c55', '8a5638', 'c7905e'], rough: 0.7, metal: 0, size: 0.8, n: 6 },
  SILVER: { c: ['d8dce2', 'c4c9d0', 'eef0f3'], rough: 0.25, metal: 1, size: 0.6, n: 6 },
  GOLD: { c: ['e2b33c', 'f2cc5a', 'c99a2a'], rough: 0.22, metal: 1, size: 0.6, n: 5 },
  DIAMOND: { c: ['6fe6e2', '3cc2c0', 'b8fbf7'], rough: 0.04, metal: 0, size: 0.7, n: 4 },
  COPPER: { c: ['c27a45', 'a6603a', '5e9e84', 'd8905a'], rough: 0.4, metal: 0.8, size: 0.8, n: 6 },
  ZINC: { c: ['7a8fa5', '5f7389', '9fb1c4'], rough: 0.3, metal: 0.9, size: 0.7, n: 6 },
  TIN: { c: ['c9c3a4', 'b3ad8f', 'ded9bf'], rough: 0.3, metal: 0.8, size: 0.6, n: 6 },
};

// Ore laid into a COPY of the stone photograph: a few clusters a block, each a
// knot of crystals with dark rims where they meet the rock. The rock under
// them is the same rock the stone block wears, texel for texel, so a seam sits
// in a cliff the way a real one does rather than as a tile with a frame on it.
export function ore(rock, seed, spec, N = REAL_N) {
  const m = rock.clone();
  const S = m.S;
  const sc = N / 128;
  m.depth = 4;
  m.cavity = 0.4;
  const pal = spec.c.map(hexc);
  const R = stream(seed + 71);
  const blocks = (S / N) ** 2;
  const clusters = Math.round(spec.n * blocks);
  if (spec.metal > 0) m.mt = new Float32Array(S * S);
  for (let i = 0; i < clusters; i++) {
    const cx = R() * S, cy = R() * S;
    const pieces = 4 + ((R() * 6) | 0);
    for (let p = 0; p < pieces; p++) {
      const px = cx + (R() - 0.5) * 22 * spec.size * sc;
      const py = cy + (R() - 0.5) * 22 * spec.size * sc;
      const rx = (2 + R() * 4.5) * spec.size * sc, ry = rx * (0.5 + R() * 0.5);
      const c = pal[(R() * pal.length) | 0];
      const facet = R() * Math.PI * 2;
      ellipse(m, px, py, rx, ry, R() * Math.PI, 0.4, (k, u, v, cover) => {
        const rim = smooth(0.55, 1.0, Math.sqrt(u * u + v * v));
        const f = 0.8 + 0.35 * Math.cos(Math.atan2(v, u) - facet);
        const cc = [c[0] * f * (1 - rim * 0.55), c[1] * f * (1 - rim * 0.55),
          c[2] * f * (1 - rim * 0.55)];
        m.blend(k, cc, cover);
        m.h[k] = Math.max(m.h[k], (0.3 + (1 - rim) * 0.7) * cover);
        m.r[k] = mix(m.r[k], spec.rough + rim * 0.3, cover);
        if (m.mt) m.mt[k] = Math.max(m.mt[k], spec.metal * cover * (1 - rim * 0.5));
      });
    }
  }
  return m;
}

// --- worked metal -----------------------------------------------------------------

// A cast block of metal: a bevelled rim, a face worked by a file in one
// direction, scratches across it, and the edges polished by hands.
export function metalBlock(S, seed, base, rough = 0.32) {
  const m = new Mat(S);
  m.depth = 4;
  m.cavity = 0.4;
  m.metal = 1;
  const sc = S / 128;
  const c = hexc(base);
  const rim = S * 0.07;
  const R = stream(seed + 81);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const brush = fbm(x, y, S, 2, 3, seed + 82, 0.5, 64) * 0.08;
      const n = fbm(x, y, S, 6, 3, seed + 83) * 0.06;
      const e = Math.min(x + 0.5, y + 0.5, S - x - 0.5, S - y - 0.5);
      const inFace = smooth(rim - sc, rim + sc, e);
      const bev = 1 - smooth(0, rim, e);
      const s = 1 + brush + n - bev * 0.12 + (1 - inFace) * 0.06;
      m.set(k, [c[0] * s, c[1] * s, c[2] * s]);
      m.h[k] = inFace * 0.8 + (1 - inFace) * (e / rim) * 0.8 + brush * 0.3;
      m.r[k] = rough + brush * 0.8 + n;
    }
  }
  for (let i = 0; i < 16; i++) {
    const x0 = R() * S, y0 = R() * S, a = R() * Math.PI, len = (6 + R() * 30) * sc;
    capsule(m, x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 0.35 * sc,
      0.25 * sc, (k, t, cover) => {
        m.mul(k, 1 + cover * 0.12);
        m.r[k] = mix(m.r[k], 0.55, cover * 0.6);
      });
  }
  return m;
}

// --- foliage ------------------------------------------------------------------------

// THE CANOPY. Hundreds of small leaves, each a pointed oval at its own angle
// with a paler midrib, laid back to front so the ones in front are lit and the
// ones behind sit in the crown's own shade — and whatever no leaf covers is a
// hole, because light comes through a tree. `far` fills the holes, for the
// distant shell, where a hole would be a hole through the planet.
export function leaves(S, seed, far = false) {
  const m = new Mat(S);
  m.depth = 5;
  m.cavity = 0.3;
  const sc = S / 128;
  const R = stream(seed + 101);
  for (let i = 0; i < S * S; i++) {
    m.a[i] = 0; m.h[i] = 0; m.r[i] = 0.7;
    m.set(i, [0.1, 0.16, 0.07]);
  }
  const greens = ['3f6b2c', '4b7833', '375f27', '568638', '2f5222', '608f3d',
    '466f2f', '52803a'].map(hexc);
  const n = Math.round((S * S) / (40 * sc * sc));
  for (let i = 0; i < n; i++) {
    const depth = i / n;
    const cx = R() * S, cy = R() * S;
    const len = (3.2 + R() * 3.6) * sc, wid = len * (0.4 + R() * 0.16);
    const ang = R() * Math.PI * 2;
    const c = greens[(R() * greens.length) | 0];
    const lum = 0.52 + depth * 0.62 + (R() - 0.5) * 0.14;
    const yellow = R() < 0.05 ? 0.35 : 0;
    const salt = (R() * 1e6) | 0;
    ellipse(m, cx, cy, len, wid, ang, 0.85, (k, u, v, cover) => {
      const av = Math.abs(v);
      // a leaf is not a flat shape: a pale midrib, the side veins running
      // out and forward from it, the margin a shade darker, the two halves
      // turned slightly differently to the light, and a fine grain over all
      const rib = 1 - smooth(0.0, 0.11, av);
      const vein = Math.pow(Math.abs(Math.sin((u * 5.2 - av * 2.4) * Math.PI)), 14)
        * (1 - smooth(0.55, 0.95, av)) * (1 - rib);
      const margin = smooth(0.62, 1.0, Math.sqrt(u * u + v * v));
      const grain = 1 + (hash3(k, salt, seed) - 0.5) * 0.09;
      const half = v > 0 ? 1.05 : 0.95;
      const sh = lum * (0.9 + u * 0.12) * half * grain
        * (1 + rib * 0.2 + vein * 0.1) * (1 - margin * 0.2);
      m.blend(k, [mix(c[0], 0.6, yellow) * sh, mix(c[1], 0.55, yellow) * sh,
        mix(c[2], 0.2, yellow) * sh], cover);
      m.a[k] = Math.max(m.a[k], cover);
      m.h[k] = Math.max(m.h[k], (0.3 + depth * 0.7) * (0.82 + 0.18 * (1 - v * v))
        - vein * 0.02);
      m.r[k] = 0.5 - rib * 0.1;
    });
  }
  const cov = blur(m.a, S, Math.round(3 * sc));
  for (let i = 0; i < S * S; i++) m.mul(i, 0.9 + 0.3 * (1 - cov[i]));
  if (far) {
    for (let i = 0; i < S * S; i++) {
      if (m.a[i] < 0.5) m.set(i, [0.1, 0.17, 0.08]);
      m.a[i] = 1;
    }
  }
  return m;
}

// A tuft of grass as a cross-plane sprite: blades rising from the foot of the
// tile, each tapering to a point and bending a little, darker at the root.
// Coloured off the lawn photograph's own greens when it is given one, so the
// tuft and the turf it stands in are the same grass.
export function tuft(S, seed, lawn = null) {
  const m = new Mat(S);
  m.depth = 1;
  m.cavity = 0;
  for (let i = 0; i < S * S; i++) { m.a[i] = 0; m.set(i, [0.2, 0.3, 0.12]); m.r[i] = 0.6; }
  const R = stream(seed + 111);
  let greens = ['4d7a30', '5a8736', '66913f', '46702b', '73994a', '3f6428'].map(hexc);
  if (lawn) {
    // the lawn's greens, taken from its brighter half so a blade reads lit
    greens = [];
    for (let i = 0; i < 12; i++) {
      const k = lawn.i(R() * lawn.S, R() * lawn.S);
      const c = lawn.get(k);
      const l = c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1;
      const s = 0.42 / Math.max(0.05, l);
      greens.push([c[0] * s, c[1] * s, c[2] * s]);
    }
  }
  const blades = 44;
  for (let i = 0; i < blades; i++) {
    const x0 = S * (0.08 + R() * 0.84);
    const h = S * (0.45 + R() * 0.52);
    const lean = (R() - 0.5) * S * 0.45;
    const c = greens[(R() * greens.length) | 0];
    const w = S * (0.010 + R() * 0.010);
    const segs = 6;
    let px = x0, py = S - 0.5;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const nx = x0 + lean * t * t, ny = S - 0.5 - h * t;
      const r0 = w * (1 - (s - 1) / segs), r1 = w * (1 - t) + 0.25;
      capsule(m, px, py, nx, ny, r0, r1, (k, tt, cover) => {
        const along = (s - 1 + tt) / segs;
        const sh = 0.6 + along * 0.55;
        m.blend(k, [c[0] * sh, c[1] * sh, c[2] * sh], cover);
        m.a[k] = Math.max(m.a[k], cover);
      }, true);
      px = nx; py = ny;
    }
  }
  return m;
}

// --- fixtures: the made things, out of the photographs --------------------------
//
// A door, a chest, a workbench, a shelf of books, a furnace, a lantern: the
// things a village is furnished with, and no library photographs a door that
// fits a one-metre block with its handle where this game puts it. So they are
// built here the way a joiner would — boards, frames, panels, iron — out of
// the SAME photographs the rest of the world wears: a door is cut from its
// species' planks, a furnace from the ashlar the walls are laid in.

// Copy a piece of a photograph into a rectangle of `dst`: colour, normal and
// roughness, from (ox, oy) in the source, turned a quarter turn
// anticlockwise when `rot` is set — boards that ran across now run up.
function fillFrom(dst, src, x0, y0, w, h, o = {}) {
  const { rot = false, ox = 0, oy = 0, tone = 1, hBase = null } = o;
  const Ss = src.S;
  if (!dst.nb) dst.nb = new Float32Array(dst.S * dst.S * 2);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const k = dst.i(x, y);
      const sx = rot ? Ss - 1 - (y + oy) : x + ox;
      const sy = rot ? x + ox : y + oy;
      const j = src.i(sx, sy);
      dst.c[k * 3] = src.c[j * 3] * tone;
      dst.c[k * 3 + 1] = src.c[j * 3 + 1] * tone;
      dst.c[k * 3 + 2] = src.c[j * 3 + 2] * tone;
      dst.r[k] = src.r[j];
      const nx = src.nb ? src.nb[j * 2] : 0, ny = src.nb ? src.nb[j * 2 + 1] : 0;
      dst.nb[k * 2] = rot ? -ny : nx;
      dst.nb[k * 2 + 1] = rot ? nx : ny;
      if (hBase !== null) dst.h[k] = hBase;
    }
  }
}

// a painted rectangle of height, with its edges bevelled over `bev` texels
function raise(m, x0, y0, w, h, lo, hi, bev) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const e = Math.min(x - x0 + 0.5, x0 + w - x - 0.5, y - y0 + 0.5, y0 + h - y - 0.5);
      m.h[m.i(x, y)] = lo + (hi - lo) * smooth(0, bev, e);
    }
  }
}

// iron: a flat dark strap or plate, with a little wear on its high points
function iron(m, x0, y0, w, h, seed, c = '2e2f33', rough = 0.45, hgt = 1) {
  const col = hexc(c);
  if (!m.mt) m.mt = new Float32Array(m.S * m.S);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const k = m.i(x, y);
      const n = fbm(x, y, m.S, 24, 2, seed) * 0.12;
      const e = Math.min(x - x0 + 0.5, x0 + w - x - 0.5, y - y0 + 0.5, y0 + h - y - 0.5);
      const wear = 1 - smooth(0, 2.5, e);
      m.set(k, [col[0] * (1 + n + wear * 0.5), col[1] * (1 + n + wear * 0.5),
        col[2] * (1 + n + wear * 0.5)]);
      m.h[k] = hgt * (0.7 + 0.3 * smooth(0, 2, e));
      m.r[k] = rough - wear * 0.15;
      m.mt[k] = 1;
    }
  }
}

function bolt(m, cx, cy, r, c = '5a5b60') {
  const col = hexc(c);
  if (!m.mt) m.mt = new Float32Array(m.S * m.S);
  ellipse(m, cx, cy, r, r, 0, 0, (k, u, v, cover) => {
    const lit = 1 + (-u - v) * 0.25;
    m.blend(k, [col[0] * lit, col[1] * lit, col[2] * lit], cover);
    m.h[k] = Math.max(m.h[k], 1.1 * Math.sqrt(clamp01(1 - u * u - v * v)) * cover + 0.6);
    m.r[k] = 0.35;
    m.mt[k] = Math.max(m.mt[k], cover);
  });
}

// One half of a panelled door, 2 blocks tall: stiles and rails of the
// species' own boards, raised panels between them, iron hinges on the left
// stile and the handle on the right one at the height a hand finds it.
// `half` 'bot' | 'top'; `glass` puts a window in the top half; `metal`
// makes it the iron door, the same frame in plate.
export function door(S, seed, plank, half, o = {}) {
  const m = new Mat(S);
  m.depth = 7;
  m.cavity = 0.55;
  const st = Math.round(S * 0.12);          // stile width
  const railT = Math.round(S * 0.14), railB = Math.round(S * 0.16);
  if (o.metal) {
    const steel = metalBlock(S, seed + 3, o.metal, 0.38);
    m.c.set(steel.c); m.r.set(steel.r);
    m.nb = new Float32Array(S * S * 2);
    m.mt = new Float32Array(S * S).fill(1);
  } else {
    // everything first as upright boards, then the rails laid across them
    fillFrom(m, plank, 0, 0, S, S, { rot: true, ox: seed * 37, oy: seed * 11 });
  }
  for (let i = 0; i < S * S; i++) m.h[i] = 0.8;
  const top = half === 'top';
  // rails: across the grain. The top half has its rail at the top, the
  // bottom half at the bottom; where the two halves meet each carries half
  // of the lock rail.
  const rails = top ? [[0, railT], [S - railB * 0.6, railB * 0.6]]
    : [[0, railB * 0.6], [S - railB, railB]];
  if (!o.metal) {
    for (const [y0, h] of rails) {
      fillFrom(m, plank, st, Math.round(y0), S - 2 * st, Math.round(h),
        { ox: seed * 53, oy: seed * 29 + y0, tone: 0.97 });
    }
  }
  // the openings between the rails: raised panels, or glass
  const inner = top ? [railT, S - railB * 0.6] : [railB * 0.6, S - railB];
  const panels = top && !o.glass
    ? [[inner[0], (inner[1] - inner[0]) * 0.62], [inner[0] + (inner[1] - inner[0]) * 0.66, (inner[1] - inner[0]) * 0.34]]
    : [[inner[0], inner[1] - inner[0]]];
  const pad = Math.round(S * 0.02);
  for (const [py, ph] of panels) {
    const x0 = st + pad, w = S - 2 * st - 2 * pad;
    const y0 = Math.round(py + pad), h = Math.round(ph - 2 * pad);
    if (top && o.glass) {
      // the window: glass you see through, a glazing bar up the middle and
      // the odd streak of light across it
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const k = m.i(x, y);
          m.a[k] = 0; m.h[k] = 0.3; m.r[k] = 0.05;
        }
      }
      const mx = Math.round(S / 2 - S * 0.025);
      fillFrom(m, plank, mx, y0, Math.round(S * 0.05), h, { rot: true, ox: seed * 7, hBase: 0.75 });
      for (const [sx, sy, len] of [[0.28, 0.3, 0.18], [0.62, 0.62, 0.12]]) {
        capsule(m, x0 + w * sx, y0 + h * sy, x0 + w * (sx + len), y0 + h * (sy - len),
          S * 0.006, S * 0.006, (k, t, cover) => {
            m.a[k] = Math.max(m.a[k], cover);
            m.blend(k, [0.82, 0.88, 0.9], cover);
          });
      }
      continue;
    }
    // a raised panel: sunk at the frame, rising over a bevel to a flat field
    raise(m, x0, y0, w, h, 0.25, 0.7, S * 0.06);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) m.mul(m.i(x, y), 0.96);
    }
  }
  // hinges on the left stile, one per half, toward its outer end
  const hy = top ? Math.round(S * 0.18) : Math.round(S * 0.74);
  iron(m, 0, hy, Math.round(S * 0.2), Math.round(S * 0.05), seed + 5);
  bolt(m, S * 0.05, hy + S * 0.025, S * 0.012);
  bolt(m, S * 0.15, hy + S * 0.025, S * 0.012);
  // the handle, on the bottom half's right stile, near its top
  if (!top) {
    const hx = S - st + Math.round(st * 0.25);
    iron(m, hx, Math.round(S * 0.08), Math.round(st * 0.5), Math.round(S * 0.2), seed + 6,
      o.metal ? '8d8a7e' : '6f5a2e', 0.3, 1.1);
    iron(m, hx - Math.round(S * 0.12), Math.round(S * 0.13), Math.round(S * 0.14),
      Math.round(S * 0.035), seed + 7, o.metal ? '9a978a' : '8a7038', 0.28, 1.3);
  }
  if (o.metal) {
    // rivets down both stiles
    for (let y = 0.1; y < 1; y += 0.16) {
      bolt(m, st * 0.5, S * y, S * 0.012, '8a8f96');
      bolt(m, S - st * 0.5, S * y, S * 0.012, '8a8f96');
    }
  }
  // A half with a window in it needs its alpha for the glass, and a tile
  // carries metal in its alpha OR holes, never both: its hinge is dark iron
  // by colour alone.
  if (o.glass && top) m.mt = null;
  return m;
}

// A chest: boards, bound with iron at its corners and round its lid, and a
// brass lock plate on its front. One tile for all six faces, as it has
// always been; the lid's seam runs round the box a third of the way down.
export function chest(S, seed, plank) {
  const m = new Mat(S);
  m.depth = 6;
  m.cavity = 0.5;
  fillFrom(m, plank, 0, 0, S, S, { ox: seed * 13, oy: seed * 7, hBase: 0.75 });
  const band = Math.round(S * 0.07);
  iron(m, 0, 0, band, S, seed + 1);
  iron(m, S - band, 0, band, S, seed + 2);
  iron(m, 0, 0, S, Math.round(band * 0.8), seed + 3);
  iron(m, 0, S - Math.round(band * 0.8), S, Math.round(band * 0.8), seed + 4);
  // the lid's seam, and the lid overhanging it
  const seam = Math.round(S * 0.36);
  for (let x = band; x < S - band; x++) {
    for (let y = seam - 3; y < seam + 5; y++) {
      const k = m.i(x, y);
      if (y < seam) m.h[k] = 0.85;
      else if (y < seam + 2) { m.mul(k, 0.35); m.h[k] = 0.2; }
      else m.mul(k, 0.8);
    }
  }
  for (const y of [S * 0.1, S * 0.9]) {
    bolt(m, band * 0.5, y, S * 0.012, '6a6b70');
    bolt(m, S - band * 0.5, y, S * 0.012, '6a6b70');
  }
  // the lock
  const lx = Math.round(S / 2 - S * 0.07), ly = seam - Math.round(S * 0.05);
  iron(m, lx, ly, Math.round(S * 0.14), Math.round(S * 0.17), seed + 8, 'a88a3c', 0.3, 1.2);
  ellipse(m, S / 2, ly + S * 0.07, S * 0.012, S * 0.02, 0, 0, (k, u, v, cover) => {
    m.blend(k, [0.03, 0.02, 0.01], cover); m.h[k] = 0.4;
  });
  return m;
}

// The workbench's top: thick boards in a frame, worn pale where the work
// is done and scored by the saw and the knife.
export function craftTop(S, seed, plank) {
  const m = new Mat(S);
  m.depth = 5;
  m.cavity = 0.5;
  fillFrom(m, plank, 0, 0, S, S, { ox: seed * 17, oy: seed * 23, hBase: 0.8 });
  const fr = Math.round(S * 0.08);
  fillFrom(m, plank, 0, 0, S, fr, { ox: 40, oy: 90, tone: 0.8, hBase: 1 });
  fillFrom(m, plank, 0, S - fr, S, fr, { ox: 70, oy: 30, tone: 0.8, hBase: 1 });
  fillFrom(m, plank, 0, 0, fr, S, { rot: true, ox: 20, tone: 0.8, hBase: 1 });
  fillFrom(m, plank, S - fr, 0, fr, S, { rot: true, ox: 90, tone: 0.8, hBase: 1 });
  const R = stream(seed + 9);
  for (let i = 0; i < 16; i++) {
    const x0 = fr + R() * (S - 2 * fr), y0 = fr + R() * (S - 2 * fr);
    const a = R() * Math.PI, len = S * (0.04 + R() * 0.18);
    capsule(m, x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, S * 0.0018, S * 0.0012,
      (k, t, cover) => { m.mul(k, 1 - cover * 0.14); m.h[k] -= 0.06 * cover; });
  }
  // a ring where a pot stood, and the pale wear in the middle
  ellipse(m, S * 0.66, S * 0.34, S * 0.08, S * 0.08, 0, 0, (k, u, v, cover) => {
    const r = Math.sqrt(u * u + v * v);
    m.mul(k, 1 - 0.18 * (1 - smooth(0.0, 0.12, Math.abs(r - 0.85))) * cover);
  });
  for (let y = fr; y < S - fr; y++) {
    for (let x = fr; x < S - fr; x++) {
      const d = Math.hypot(x - S / 2, y - S / 2) / (S * 0.4);
      m.mul(m.i(x, y), 1 + 0.08 * (1 - smooth(0.3, 1, d)));
    }
  }
  return m;
}

// The workbench's side: an apron of boards under the top, a leg at each
// corner, and the dark of the space under it with a shelf low down.
export function craftSide(S, seed, plank) {
  const m = new Mat(S);
  m.depth = 7;
  m.cavity = 0.6;
  fillFrom(m, plank, 0, 0, S, S, { ox: seed * 19, oy: seed * 5, hBase: 0.2, tone: 0.28 });
  const apron = Math.round(S * 0.3), leg = Math.round(S * 0.14), shelf = Math.round(S * 0.12);
  fillFrom(m, plank, 0, 0, S, apron, { ox: 60, oy: seed * 3, hBase: 0.85 });
  fillFrom(m, plank, 0, 0, leg, S, { rot: true, ox: 10, hBase: 0.95, tone: 0.92 });
  fillFrom(m, plank, S - leg, 0, leg, S, { rot: true, ox: 120, hBase: 0.95, tone: 0.92 });
  fillFrom(m, plank, leg, S - shelf - Math.round(S * 0.06), S - 2 * leg, shelf,
    { ox: 33, oy: 77, hBase: 0.6, tone: 0.75 });
  // the apron's lower edge throws a shadow into the dark under it
  for (let x = leg; x < S - leg; x++) {
    for (let y = apron; y < apron + S * 0.05; y++) m.mul(m.i(x, y), 0.6);
  }
  return m;
}

// A bookcase: a frame of boards, two shelves, and the books on them —
// leather spines of every colour a library holds, gilt bands at head and
// foot, some tall and some short, and the dark of the case behind them.
export function bookshelf(S, seed, plank) {
  const m = new Mat(S);
  m.depth = 7;
  m.cavity = 0.55;
  fillFrom(m, plank, 0, 0, S, S, { ox: seed * 5, oy: seed * 9, hBase: 0.1, tone: 0.18 });
  const bd = Math.round(S * 0.07), mid = Math.round(S * 0.06), side = Math.round(S * 0.05);
  const rows = [[bd, Math.round(S / 2 - mid / 2) - bd], [Math.round(S / 2 + mid / 2), S - bd - Math.round(S / 2 + mid / 2)]];
  const R = stream(seed + 3);
  const leathers = ['6b1f1a', '2e4a2a', '23324f', '5a3b22', '1f1f24', '7a5a2a', '4a2238',
    '8a6a3a', '3a4a5a', '5e2d1e'].map(hexc);
  const gilt = hexc('c8a24a');
  for (const [ry, rh] of rows) {
    let x = side;
    while (x < S - side - 4) {
      const w = Math.min(S - side - x, Math.round(S * (0.03 + R() * 0.05)));
      const hh = Math.round(rh * (0.72 + R() * 0.26));
      const c = leathers[(R() * leathers.length) | 0];
      const tone = 0.8 + R() * 0.35;
      for (let y = ry + rh - hh; y < ry + rh; y++) {
        for (let xx = x; xx < x + w - 1; xx++) {
          const k = m.i(xx, y);
          // a spine is round: lit down its middle
          const u = (xx - x + 0.5) / (w - 1) * 2 - 1;
          const round = 1 - u * u * 0.45;
          const n = 1 + fbm(xx, y, S, 32, 2, seed + 11) * 0.08;
          const yy = y - (ry + rh - hh);
          const band = (yy > hh * 0.07 && yy < hh * 0.1) || (yy > hh * 0.88 && yy < hh * 0.91);
          const col = band ? gilt : c;
          m.set(k, [col[0] * tone * round * n, col[1] * tone * round * n, col[2] * tone * round * n]);
          m.h[k] = 0.55 + 0.35 * round;
          m.r[k] = band ? 0.35 : 0.6;
        }
      }
      x += w + (R() < 0.15 ? Math.round(S * 0.012) : 0);
    }
  }
  // the case: top, bottom, middle shelf and sides, over the books' ends
  fillFrom(m, plank, 0, 0, S, bd, { ox: 11, oy: 44, hBase: 1 });
  fillFrom(m, plank, 0, S - bd, S, bd, { ox: 77, oy: 13, hBase: 1 });
  fillFrom(m, plank, 0, Math.round(S / 2 - mid / 2), S, mid, { ox: 31, oy: 91, hBase: 1 });
  fillFrom(m, plank, 0, 0, side, S, { rot: true, ox: 5, hBase: 1 });
  fillFrom(m, plank, S - side, 0, side, S, { rot: true, ox: 55, hBase: 1 });
  return m;
}

// The furnace: dressed stone, and in its face an arched mouth with an iron
// frame round it and the embers of the last fire in the bottom.
export function furnaceFront(S, seed, stoneMat) {
  const m = new Mat(S);
  m.depth = 7;
  m.cavity = 0.6;
  fillFrom(m, stoneMat, 0, 0, S, S, { hBase: 0.8 });
  const x0 = S * 0.28, x1 = S * 0.72, y0 = S * 0.38, y1 = S * 0.86;
  const cx = (x0 + x1) / 2, r = (x1 - x0) / 2;
  const inside = (x, y, grow) => {
    if (x < x0 - grow || x > x1 + grow || y > y1 + grow) return false;
    if (y >= y0 + r) return true;
    return Math.hypot(x - cx, y - (y0 + r)) <= r + grow;
  };
  if (!m.mt) m.mt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = m.i(x, y);
      if (inside(x + 0.5, y + 0.5, 0)) {
        // soot, and the embers along the floor of it
        const f = clamp01((y - (y1 - S * 0.12)) / (S * 0.12));
        const e = smooth(0.1, 0.9, fbm(x, y, S, 16, 3, seed + 21) * 0.5 + 0.5) * f;
        m.set(k, [0.04 + e * 0.95, 0.03 + e * 0.38, 0.02 + e * 0.06]);
        m.h[k] = 0.05 + e * 0.1;
        m.r[k] = 0.9;
      } else if (inside(x + 0.5, y + 0.5, S * 0.035)) {
        m.set(k, [0.14, 0.14, 0.15]);
        m.h[k] = 1.0;
        m.r[k] = 0.45;
        m.mt[k] = 1;
      }
    }
  }
  return m;
}

// ...and its top: the same stone, with an iron grate over the flue.
export function furnaceTop(S, seed, stoneMat) {
  const m = new Mat(S);
  m.depth = 7;
  m.cavity = 0.6;
  fillFrom(m, stoneMat, 0, 0, S, S, { ox: 50, oy: 30, hBase: 0.8 });
  const g0 = Math.round(S * 0.3), g1 = Math.round(S * 0.7);
  for (let y = g0; y < g1; y++) {
    for (let x = g0; x < g1; x++) {
      const k = m.i(x, y);
      m.set(k, [0.03, 0.025, 0.02]); m.h[k] = 0.1; m.r[k] = 0.95;
    }
  }
  const bars = 6;
  for (let b = 0; b <= bars; b++) {
    const x = Math.round(g0 + (g1 - g0) * (b / bars) - S * 0.012);
    iron(m, x, g0, Math.round(S * 0.024), g1 - g0, seed + b, '303134', 0.5, 0.9);
  }
  iron(m, g0 - 4, g0 - 4, g1 - g0 + 8, 6, seed + 20, '303134', 0.5, 0.95);
  iron(m, g0 - 4, g1 - 2, g1 - g0 + 8, 6, seed + 21, '303134', 0.5, 0.95);
  return m;
}

// The lantern's body: warm glass lit from inside, in an iron cage.
export function lanternGlass(S, seed) {
  const m = new Mat(S);
  m.depth = 5;
  m.cavity = 0.4;
  m.mt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const d = Math.hypot((x - S / 2) / (S / 2), (y - S * 0.55) / (S / 2));
      const glow = 1 - smooth(0.1, 1.2, d);
      const n = 1 + fbm(x, y, S, 8, 2, seed) * 0.08;
      m.set(k, [(0.95 + glow * 0.05) * n, (0.55 + glow * 0.3) * n, (0.18 + glow * 0.25) * n]);
      m.h[k] = 0.5;
      m.r[k] = 0.12;
    }
  }
  const fr = Math.round(S * 0.1);
  iron(m, 0, 0, fr, S, seed + 1, '26272b', 0.45);
  iron(m, S - fr, 0, fr, S, seed + 2, '26272b', 0.45);
  iron(m, 0, 0, S, fr, seed + 3, '26272b', 0.45);
  iron(m, 0, S - fr, S, fr, seed + 4, '26272b', 0.45);
  for (const f of [0.36, 0.64]) {
    iron(m, Math.round(S * f - S * 0.025), 0, Math.round(S * 0.05), S, seed + 5, '26272b', 0.45);
  }
  return m;
}

// A flame: white-yellow at its heart, orange and then red toward its edges
// and its tip, moving in the noise.
export function flame(S, seed) {
  const m = new Mat(S);
  m.depth = 1;
  m.cavity = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const n = fbm(x, y, S, 6, 3, seed) * 0.5 + 0.5;
      const t = clamp01(0.35 + (y / S) * 0.8 - n * 0.35);
      m.set(k, [1.0, mix(0.35, 0.95, t), mix(0.05, 0.6, t * t)]);
      m.r[k] = 0.9;
    }
  }
  return m;
}

// The bell's bronze: cast, banded, dark in its hollows and bright on its lips.
export function bell(S, seed) {
  const m = metalBlock(S, seed, 'a8823e', 0.3);
  for (let y = 0; y < S; y++) {
    const band = Math.pow(Math.abs(Math.sin((y / S) * Math.PI * 5)), 18);
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      m.mul(k, 1 + band * 0.3);
      m.h[k] += band * 0.4;
    }
  }
  m.mt = new Float32Array(S * S).fill(1);
  return m;
}

// Clear glass: a pale edge where the pane is thickest to look through, and
// otherwise nothing but a streak or two of light.
export function glassPane(S, seed) {
  const m = new Mat(S);
  m.depth = 2;
  m.cavity = 0;
  const edge = hexc('b9c9c4');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const e = Math.min(x + 0.5, y + 0.5, S - x - 0.5, S - y - 0.5);
      const on = e < S * 0.022;
      m.a[k] = on ? 1 : 0;
      m.set(k, [edge[0] * (0.9 + e * 0.02), edge[1] * (0.9 + e * 0.02), edge[2] * (0.9 + e * 0.02)]);
      m.h[k] = on ? 0.6 : 0.3;
      m.r[k] = 0.05;
    }
  }
  for (const [sx, sy, len] of [[0.2, 0.34, 0.2], [0.6, 0.72, 0.13], [0.66, 0.3, 0.07]]) {
    capsule(m, S * sx, S * sy, S * (sx + len), S * (sy - len), S * 0.005, S * 0.005,
      (k, t, cover) => {
        m.a[k] = Math.max(m.a[k], cover * 0.9);
        m.blend(k, [0.9, 0.95, 0.96], cover);
      });
  }
  return m;
}

// A ladder: two rails and four rungs of the oak boards, and air between.
export function ladder(S, seed, plank) {
  const m = new Mat(S);
  m.depth = 6;
  m.cavity = 0.3;
  for (let i = 0; i < S * S; i++) m.a[i] = 0;
  const rw = Math.round(S * 0.12);
  const rails = [Math.round(S * 0.1), S - Math.round(S * 0.1) - rw];
  for (const x0 of rails) {
    fillFrom(m, plank, x0, 0, rw, S, { rot: true, ox: x0 * 3, hBase: 0.8 });
    for (let y = 0; y < S; y++) for (let x = x0; x < x0 + rw; x++) m.a[m.i(x, y)] = 1;
  }
  const rh = Math.round(S * 0.08);
  for (let r = 0; r < 4; r++) {
    const y0 = Math.round(S * (0.125 + r * 0.25) - rh / 2);
    fillFrom(m, plank, rails[0] + rw, y0, rails[1] - rails[0] - rw, rh, { ox: r * 41, oy: y0, hBase: 0.7 });
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = rails[0] + rw; x < rails[1]; x++) {
        const k = m.i(x, y);
        m.a[k] = 1;
        const u = (y - y0 + 0.5) / rh * 2 - 1;
        m.h[k] = 0.5 + 0.35 * (1 - u * u);
      }
    }
  }
  return m;
}

// --- the joins between photographs -----------------------------------------------

// The side of a grass block: its own soil — the DIRT photograph, so the soil
// is continuous with the dirt block beneath it quarter for quarter — and the
// lawn hanging over the top edge: a band of the lawn photograph's own turf,
// its lower edge ragged, a dark root mat under it and loose blades reaching
// down past it. `bands` is how many block-heights the soil photograph covers:
// either of them may be the one a grass block wears, so each gets a fringe.
export function grassSide(soil, lawn, seed, bands) {
  const m = soil.clone();
  const S = m.S, N = S / bands;
  const sc = N / 128;
  m.depth = 4;
  m.cavity = 0.4;
  const R = stream(seed + 121);
  for (let band = 0; band < bands; band++) {
    const y0 = band * N;
    for (let x = 0; x < S; x++) {
      const depth = N * (0.1 + 0.07 * (fbm(x, 0, S, 7, 3, seed + 122) + 1) / 2);
      for (let y = 0; y < depth + 8 * sc; y++) {
        const k = m.i(x, y0 + y);
        // the root mat: the soil gone dark and fibrous under the turf
        const t = smooth(depth - 2 * sc, depth + 8 * sc, y);
        m.blend(k, [0.13, 0.1, 0.07], (1 - t) * 0.6);
        if (y < depth) {
          // the turf itself, seen edge on: the lawn's own texels, shaded
          // darker toward the soil the way a clump shades its own base
          const lk = lawn.i(x * lawn.S / S, (y0 + y) * 2.2 * lawn.S / S);
          const lc = lawn.get(lk);
          const sh = 0.6 + 0.5 * (1 - y / depth);
          const edgeT = 1 - smooth(depth * 0.7, depth, y);
          m.blend(k, [lc[0] * sh, lc[1] * sh, lc[2] * sh], edgeT);
          m.h[k] = mix(m.h[k], 0.8, edgeT);
          m.r[k] = mix(m.r[k], 0.6, edgeT);
        }
      }
    }
    // blades reaching down past the mat
    const blades = Math.round(S * 1.4);
    for (let i = 0; i < blades; i++) {
      const x0 = R() * S;
      const len = N * (0.05 + R() * 0.17);
      const a = Math.PI / 2 + (R() - 0.5) * 0.8;
      const lk = lawn.i(R() * lawn.S, R() * lawn.S);
      const c = lawn.get(lk);
      const w = (0.7 + R() * 0.6) * sc;
      capsule(m, x0, y0 + 0.5, x0 + Math.cos(a) * len, y0 + 0.5 + Math.sin(a) * len,
        w, w * 0.25, (k, t, cover) => {
          const sh = 1.05 - t * 0.35;
          m.blend(k, [c[0] * sh, c[1] * sh, c[2] * sh], cover);
          m.h[k] = mix(m.h[k], 0.9, cover);
          m.r[k] = mix(m.r[k], 0.6, cover);
        });
    }
  }
  return m;
}

// A path's side: the same soil, capped by a lip of the path photograph.
export function pathSide(soil, top, seed, bands) {
  const m = soil.clone();
  const S = m.S, N = S / bands;
  m.depth = 3;
  m.cavity = 0.3;
  for (let band = 0; band < bands; band++) {
    for (let x = 0; x < S; x++) {
      const d = N * (0.06 + 0.05 * (fbm(x, band, S, 8, 2, seed + 131) + 1) / 2);
      for (let y = 0; y < d + 3; y++) {
        const k = m.i(x, band * N + y);
        const t = 1 - smooth(d - 1.5, d + 1.5, y);
        const tc = top.get(top.i(x * top.S / S, (band * N + y) * top.S / S));
        m.blend(k, tc, t);
        m.h[k] = mix(m.h[k], 0.6, t);
        m.r[k] = mix(m.r[k], top.r[top.i(x * top.S / S, y)], t);
      }
      // a thin shadow under the lip
      for (let y = Math.floor(d); y < d + 3; y++) m.mul(m.i(x, band * N + y), 0.85);
    }
  }
  return m;
}

// Farmland: the soil photograph turned into four ridges a block, the furrows
// darker and wetter than the crowns.
export function furrows(soil, seed) {
  const m = soil.clone();
  const S = m.S;
  m.depth = 10;
  m.cavity = 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const warp = fbm(x, y, S, 4, 2, seed + 46) * 2.5;
      const ridge = 0.5 + 0.5 * Math.cos(((y + warp) / S) * 4 * Math.PI * 2);
      m.mul(k, 0.72 + ridge * 0.35);
      m.h[k] = ridge * 0.8;
      m.r[k] = mix(0.55, m.r[k], ridge);
    }
  }
  return m;
}

// --- finishing: normals, cavities, and the quarters ------------------------------

// Encode one Mat (or one K-th of it on a side) into the two byte layers the
// arrays carry: sRGB colour + coverage, and normal.xy + roughness + height.
// Rows are written top first, the way a canvas is; realism.js turns them
// over. The painted height is turned into slopes and ADDED to the
// photograph's own normal, so a crystal set in rock keeps the rock's grain
// round it.
export function encode(m, x0, y0, n) {
  const S = m.S;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < S * S; i++) {
    const h = m.h[i];
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  // A photograph with nothing painted on it has no height of its own to add:
  // its normal is the photograph's, and it is the common case, so it takes
  // the fast road through here.
  const flatPaint = hi - lo <= 1e-6;
  const span = flatPaint ? 1 : hi - lo;
  const cav = m._cav ??= (() => {
    if (flatPaint) return null;
    const hn = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) hn[i] = (m.h[i] - lo) / span;
    return { hn, avg: blur(hn, S, Math.max(2, Math.round(S / 40))) };
  })();
  const hn = cav ? cav.hn : null;
  const rgba = new Uint8Array(n * n * 4);
  const mat = new Uint8Array(n * n * 4);
  const d = m.depth;
  for (let y = 0; y < n; y++) {
    let gy = (y0 + y) % S; if (gy < 0) gy += S;
    const ym = ((gy - 1 + S) % S) * S, y0r = gy * S, yp = ((gy + 1) % S) * S;
    for (let x = 0; x < n; x++) {
      let gx = (x0 + x) % S; if (gx < 0) gx += S;
      const xm = (gx - 1 + S) % S, xp = (gx + 1) % S;
      const k = y0r + gx;
      let sx = 0, sy = 0, ao = 1;
      if (hn) {
        // a sobel over the wrapped height field
        const hx = (hn[ym + xp] + 2 * hn[y0r + xp] + hn[yp + xp]
          - hn[ym + xm] - 2 * hn[y0r + xm] - hn[yp + xm]) / 8;
        const hy = (hn[yp + xm] + 2 * hn[yp + gx] + hn[yp + xp]
          - hn[ym + xm] - 2 * hn[ym + gx] - hn[ym + xp]) / 8;
        // tangent space with v UP: canvas y runs down, so its slope flips
        sx = -hx * d; sy = hy * d;
        const c = Math.max(0, cav.avg[k] - hn[k]);
        ao = 1 - Math.min(0.6, c * m.cavity * 3.2);
      }
      let nx = sx, ny = sy;
      if (m.nb) {
        const bx = m.nb[k * 2], by = m.nb[k * 2 + 1];
        const bz = Math.sqrt(Math.max(0.02, 1 - bx * bx - by * by));
        nx = bx / bz + sx; ny = by / bz + sy;
      }
      const nl = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= nl; ny /= nl;
      const o = (y * n + x) * 4;
      const j = k * 3;
      rgba[o] = Math.round(clamp01(m.c[j] * ao) * 255);
      rgba[o + 1] = Math.round(clamp01(m.c[j + 1] * ao) * 255);
      rgba[o + 2] = Math.round(clamp01(m.c[j + 2] * ao) * 255);
      // a material with metal in SOME texels (an ore in its rock) carries it
      // in the colour's alpha, 255 for none down to 128 for all: it is never
      // a cut-out, so the alpha is free, and the props say to read it so
      rgba[o + 3] = m.mt ? 255 - Math.round(clamp01(m.mt[k]) * 127)
        : Math.round(clamp01(m.a[k]) * 255);
      mat[o] = Math.round((nx * 0.5 + 0.5) * 255);
      mat[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      mat[o + 2] = Math.round(clamp01(m.r[k]) * 255);
      // the fourth channel is free — nothing reads the height back — so a
      // material that glows in SOME texels (a torch's head, not its stick)
      // carries how much there, and the props say to read it
      mat[o + 3] = m.gl ? Math.round(clamp01(m.gl[k]) * 255)
        : hn ? Math.round(clamp01(hn[k]) * 255) : 128;
    }
  }
  return { rgba, mat };
}

// A material cut into the layers the arrays carry: K by K of them for a
// material painted K blocks square, in the order the mesher's variant counts
// them — qa + K * qb, qa along the tile's width and qb up its height. Row qb
// = 0 is the BOTTOM of the canvas, because the texture's v runs up and a
// canvas's y runs down.
export function layersOf(m, K) {
  const N = m.S / K;
  const out = [];
  for (let qb = 0; qb < K; qb++) {
    for (let qa = 0; qa < K; qa++) {
      out.push(encode(m, qa * N, (K - 1 - qb) * N, N));
    }
  }
  return out;
}

// The 32-texel version of a layer, for the atlas: each texel the average of
// the ones it stands for, taken in LINEAR light the way a camera would see it
// from far enough away — averaging sRGB darkens every fine mark.
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = toLin(i / 255);

export function shrinkLayer(rgba, n, to, opaque = false, tint = null) {
  const k = n / to;
  const out = new Uint8ClampedArray(to * to * 4);
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const o = ((y * k + j) * n + (x * k + i)) * 4;
          const al = opaque ? 1 : rgba[o + 3] / 255;
          r += LIN[rgba[o]] * al; g += LIN[rgba[o + 1]] * al; b += LIN[rgba[o + 2]] * al;
          a += al; w++;
        }
      }
      const o = (y * to + x) * 4;
      const inv = a > 1e-4 ? 1 / a : 0;
      const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
      out[o] = Math.round(toSrgb(Math.min(1, r * inv * tr)) * 255);
      out[o + 1] = Math.round(toSrgb(Math.min(1, g * inv * tg)) * 255);
      out[o + 2] = Math.round(toSrgb(Math.min(1, b * inv * tb)) * 255);
      out[o + 3] = Math.round((a / w) * 255);
    }
  }
  return out;
}

// the mean colour of an RGBA byte buffer, in linear light
export function meanLinear(rgba) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let o = 0; o < rgba.length; o += 4) {
    if (rgba[o + 3] < 128) continue;
    r += LIN[rgba[o]]; g += LIN[rgba[o + 1]]; b += LIN[rgba[o + 2]]; n++;
  }
  return n ? [r / n, g / n, b / n] : [0.5, 0.5, 0.5];
}

// The painter's own tools, for the painters in other files (realplants.js).
export { hexc, clamp01, smooth, mix, capsule, ellipse, blur };
