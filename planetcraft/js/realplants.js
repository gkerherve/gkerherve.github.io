// realplants.js — the Realistic style's plants, crops and hot things.
//
// A flower, a crop in a field, a mushroom under a tree: nothing a scanned
// surface is. They stand in the world as crossed quads with holes in them, so
// each is PAINTED here, at the style's own texels a block, the way realtex.js
// paints leaves and grass: every stem a round thing with a light side and a
// shade side, every leaf a lens with a rib and veins and a margin, every petal
// thin at the edge and dark at the throat, drawn from the foot of the tile up.
// Each keeps the design the pixel art gave it — the red flower is still red and
// four-petalled, the pepper still hangs red among its leaves — but as the
// plant, and not a drawing of it.
//
// Also here, for want of a better home: the torch as you carry it (the stick
// and a burning head — the only texels in it that glow), lava, a block of cut
// diamond, the coin die in the mint, and stained glass.
//
// Like the rest of the style, nothing here draws from Math.random: every mark
// is hashed off a seed, so the same field grows on every machine.

import {
  Mat, hash3, stream, fbm, hexc, clamp01, smooth, mix, blur,
} from './realtex.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// --- the brushes -------------------------------------------------------------------

// An empty sprite: nothing there yet. The colour under the holes is a mid
// green, so whatever the filter drags in from them is leaf and not black.
function sprite(S, depth = 2.4) {
  const m = new Mat(S);
  for (let i = 0; i < S * S; i++) {
    m.a[i] = 0; m.h[i] = 0; m.r[i] = 0.62;
    m.c[i * 3] = 0.24; m.c[i * 3 + 1] = 0.33; m.c[i * 3 + 2] = 0.14;
  }
  m.depth = depth;
  m.cavity = 0.18;
  return m;
}

// One straight piece of a stroke, p0 to p1, radius r0 to r1. `paint` gets the
// texel, how far along (0..1), where across (-1 on one side, 1 on the other)
// and how much of the texel is covered. A sprite's strokes stop at the tile's
// edge; a tiling texture's (`wrap`) carry on round it.
function seg(m, x0, y0, x1, y1, r0, r1, paint, wrap = false) {
  const S = m.S;
  const R = Math.max(r0, r1) + 1.5;
  const minx = Math.floor(Math.min(x0, x1) - R), maxx = Math.ceil(Math.max(x0, x1) + R);
  const miny = Math.floor(Math.min(y0, y1) - R), maxy = Math.ceil(Math.max(y0, y1) + R);
  const dx = x1 - x0, dy = y1 - y0;
  const L2 = dx * dx + dy * dy || 1e-6, L = Math.sqrt(L2);
  const nx = -dy / L, ny = dx / L;
  for (let y = miny; y <= maxy; y++) {
    if (!wrap && (y < 0 || y >= S)) continue;
    for (let x = minx; x <= maxx; x++) {
      if (!wrap && (x < 0 || x >= S)) continue;
      const qx = x + 0.5 - x0, qy = y + 0.5 - y0;
      let t = (qx * dx + qy * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = qx - dx * t, ey = qy - dy * t;
      const d = Math.sqrt(ex * ex + ey * ey);
      const r = r0 + (r1 - r0) * t;
      const cover = clamp01(r + 0.5 - d);
      if (cover <= 0) continue;
      const side = clamp((qx * nx + qy * ny) / Math.max(r, 0.6), -1, 1);
      const xi = wrap ? ((x % S) + S) % S : x, yi = wrap ? ((y % S) + S) % S : y;
      paint(yi * S + xi, t, side, cover);
    }
  }
}

// A stroke through several points — a stem that bends — with the radius
// tapering from r0 at the first point to r1 at the last. `paint` gets the
// same four things, `t` measured along the whole of it.
function stroke(m, pts, r0, r1, paint, wrap = false) {
  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l); total += l;
  }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const t0 = acc / total, t1 = (acc + lens[i - 1]) / total;
    seg(m, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1],
      mix(r0, r1, t0), mix(r0, r1, t1),
      (k, t, s, c) => paint(k, mix(t0, t1, t), s, c), wrap);
    acc += lens[i - 1];
  }
}

// A curve from (x0, y0) rising `h`, leaning `lean` sideways by its top, in
// n points — the path of a stem.
function arc(x0, y0, h, lean, n = 8, wobble = 0, R = null) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = wobble && R ? (R() - 0.5) * wobble * Math.sin(t * Math.PI) : 0;
    pts.push([x0 + lean * t * t + w, y0 - h * t]);
  }
  return pts;
}

// A lens — a leaf, a petal, a grain — centred on (cx, cy), `len` from its
// middle to its tip, `wid` across, turned to `ang`. `point` pinches the ends
// (0 is an ellipse, 1 a pointed leaf). `paint` gets u along (-1 at the base,
// 1 at the tip) and v across (-1..1).
function lens(m, cx, cy, len, wid, ang, point, paint, wrap = false) {
  const S = m.S;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const R = Math.max(len, wid) + 1.5;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    if (!wrap && (y < 0 || y >= S)) continue;
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (!wrap && (x < 0 || x >= S)) continue;
      const qx = x + 0.5 - cx, qy = y + 0.5 - cy;
      const u = (qx * ca + qy * sa) / len;
      const v = (-qx * sa + qy * ca) / wid;
      const w = point > 0 ? 1 - Math.pow(Math.abs(u), 2) * point : 1;
      if (w <= 0.02) continue;
      const d = u * u + (v * v) / (w * w);
      if (d >= 1.4) continue;
      const edge = (1 - Math.sqrt(d)) * Math.min(len, wid * w);
      const cover = clamp01(edge + 0.5);
      if (cover <= 0) continue;
      const xi = wrap ? ((x % S) + S) % S : x, yi = wrap ? ((y % S) + S) % S : y;
      paint(yi * S + xi, u, clamp(v / w, -1, 1), cover);
    }
  }
}

// Lay a colour at k with coverage c, lifting the height to at least `h`
// where this mark is on top — the last mark painted is the one in front.
function lay(m, k, col, c, h, rough) {
  m.blend(k, col, c);
  m.a[k] = Math.max(m.a[k], c);
  if (c > 0.5) {
    m.h[k] = h;
    if (rough != null) m.r[k] = rough;
  }
}

const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scale3 = (c, s) => [c[0] * s, c[1] * s, c[2] * s];

// A round stem: lit down one side and shaded down the other, the colour
// running from `foot` to `tip` along it, a fine grain of fibre.
function paintStem(m, pts, r0, r1, foot, tip, o = {}) {
  const seed = o.seed ?? 1, z = o.z ?? 0.4;
  stroke(m, pts, r0, r1, (k, t, s, c) => {
    const round = Math.sqrt(Math.max(0, 1 - s * s));
    const fibre = 1 + (hash3(k, 7, seed) - 0.5) * 0.08;
    const lit = (0.78 + 0.3 * round - 0.12 * s) * fibre;
    lay(m, k, scale3(lerp3(foot, tip, t), lit), c, z + round * 0.25, o.rough ?? 0.6);
  });
}

// A leaf: a pale midrib, veins running out and forward from it, the margin a
// shade darker, the two halves turned a little differently to the light, the
// tip catching more of it than the base. `serr` notches the margin.
function paintLeaf(m, cx, cy, len, wid, ang, col, o = {}) {
  const seed = o.seed ?? 3;
  const z = o.z ?? 0.6;
  const veins = o.veins ?? 5;
  const serr = o.serr ?? 0;
  const lum = o.lum ?? 1;
  const rough = o.rough ?? 0.55;
  const pale = o.pale ?? 0.12;
  lens(m, cx, cy, len, wid, ang, o.point ?? 0.8, (k, u, v, c) => {
    const av = Math.abs(v);
    // a notched edge: the margin pulled in at regular steps along it
    if (serr > 0) {
      const tooth = Math.abs(Math.sin((u + 1) * serr * Math.PI));
      if (av > 0.82 + 0.18 * tooth) return;
    }
    const rib = 1 - smooth(0.0, 0.1, av);
    const vein = Math.pow(Math.abs(Math.sin((u * veins - av * 2.2) * Math.PI)), 12)
      * (1 - smooth(0.5, 0.95, av)) * (1 - rib);
    const margin = smooth(0.6, 1.0, Math.sqrt(u * u * 0.6 + av * av));
    const grain = 1 + (hash3(k, 11, seed) - 0.5) * 0.07;
    const half = v > 0 ? 1.04 : 0.93;
    const toward = 0.9 + (u + 1) * 0.06;
    const sh = lum * half * grain * toward * (1 - margin * 0.18);
    let cc = scale3(col, sh);
    cc = lerp3(cc, scale3(col, 1.35), rib * pale + vein * pale * 0.6);
    lay(m, k, cc, c, z + (1 - av * av) * 0.18 - vein * 0.02 - rib * 0.03, rough);
  });
}

// A petal: from the flower's heart outward, dark at the throat, veined
// toward the rim, the rim itself thin and a little paler where light comes
// through it.
function paintPetal(m, cx, cy, len, wid, ang, col, o = {}) {
  const seed = o.seed ?? 5;
  const throat = o.throat ?? null;
  const z = o.z ?? 0.9;
  const rough = o.rough ?? 0.45;
  const crinkle = o.crinkle ?? 0;
  // the petal's centre, out from the heart along its own axis
  const px = cx + Math.cos(ang) * len, py = cy + Math.sin(ang) * len;
  lens(m, px, py, len, wid, ang, o.point ?? 0.25, (k, u, v, c) => {
    const r = (u + 1) / 2;                     // 0 at the heart, 1 at the rim
    const vein = Math.pow(Math.abs(Math.sin(v * (o.veins ?? 7) * Math.PI * 0.5)), 6);
    const wav = crinkle ? Math.sin((r * 9 + v * 5 + hash3(seed, 1, 2) * 9)) * crinkle : 0;
    let cc = scale3(col, (0.86 + 0.18 * r - vein * 0.08 * r) * (1 + wav * 0.12));
    if (throat) cc = lerp3(throat, cc, smooth(o.throatAt ?? 0.18, (o.throatAt ?? 0.18) + 0.2, r));
    // the rim, thin enough to glow a little with the light behind it
    cc = lerp3(cc, scale3(col, 1.2), smooth(0.85, 1.0, Math.hypot(u, v)) * 0.35);
    lay(m, k, cc, c, z + r * 0.15 + wav * 0.05 + (1 - v * v) * 0.05, rough);
  });
}

// A blade of grass, from the foot up: tapering to a point, bending, darker
// at the root.
function paintBlade(m, x0, y0, h, lean, w, col, o = {}) {
  const seed = o.seed ?? 9;
  const pts = arc(x0, y0, h, lean, 7);
  stroke(m, pts, w, 0.3, (k, t, s, c) => {
    const round = Math.sqrt(Math.max(0, 1 - s * s));
    const g = 1 + (hash3(k, 13, seed) - 0.5) * 0.06;
    const sh = (0.58 + t * 0.5) * (0.9 + round * 0.14 - s * 0.05) * g;
    lay(m, k, scale3(col, sh), c, 0.3 + t * 0.2 + round * 0.1, o.rough ?? 0.55);
  });
}

// A little grass at the foot of a plant, so it stands in the turf rather
// than on it.
function turfAt(m, R, n, colours, S, o = {}) {
  for (let i = 0; i < n; i++) {
    const x0 = S * (0.1 + R() * 0.8);
    const h = S * ((o.lo ?? 0.12) + R() * (o.span ?? 0.22));
    paintBlade(m, x0, S - 0.5, h, (R() - 0.5) * S * 0.18, S * (0.008 + R() * 0.006),
      colours[(R() * colours.length) | 0], { seed: i + 3 });
  }
}

const GRASS = ['4d7a30', '5a8736', '66913f', '46702b', '6f9a45', '3f6428'].map(hexc);
const STEM = hexc('4f6d2c'), STEM_TIP = hexc('6f8f3f');

// --- flowers -------------------------------------------------------------------------

// THE RED FLOWER: a field poppy. Four broad petals, crinkled like tissue,
// each with a black blotch at its base; a grey-green seed head in the middle
// ringed with dark stamens; a thin bristly stem that nods, and a bud on a
// second one.
export function poppy(S, seed = 201) {
  const m = sprite(S);
  const R = stream(seed);
  turfAt(m, R, 9, GRASS, S);
  // a few lobed leaves in the grass
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.9 + (R() - 0.5) * 0.3;
    paintLeaf(m, S * 0.5 + Math.cos(a) * S * 0.12, S * 0.9 + Math.sin(a) * S * 0.08,
      S * 0.1, S * 0.03, a, hexc('587c33'), { serr: 5, seed: i, z: 0.5 });
  }
  // the bud first, so the flower stands in front of it
  const bud = arc(S * 0.54, S - 0.5, S * 0.52, S * 0.14, 9);
  paintStem(m, bud, S * 0.012, S * 0.008, STEM, STEM_TIP, { seed: 4 });
  const [bx, by] = bud[bud.length - 1];
  lens(m, bx + S * 0.006, by + S * 0.03, S * 0.035, S * 0.022, Math.PI / 2 + 0.3, 0.3,
    (k, u, v, c) => {
      const hair = 1 + (hash3(k, 17, 5) - 0.5) * 0.25;
      lay(m, k, scale3(hexc('5f7d3a'), (0.8 + 0.25 * (1 - v * v)) * hair), c, 0.8, 0.7);
    });
  // the flower on its long nodding stem
  const main = arc(S * 0.48, S - 0.5, S * 0.7, -S * 0.08, 10);
  paintStem(m, main, S * 0.014, S * 0.009, STEM, STEM_TIP, { seed: 3 });
  const [cx, cy] = main[main.length - 1];
  const fy = cy - S * 0.02;
  const red = hexc('d1231a'), deep = hexc('9c140f'), blot = hexc('1c0a08');
  const angs = [-2.35, -0.8, 0.8, 2.35].map((a) => a + (R() - 0.5) * 0.2);
  // the two back petals, then the two in front, overlapping
  for (const [i, a] of [[0, angs[0]], [1, angs[1]], [2, angs[2]], [3, angs[3]]]) {
    const front = i === 1 || i === 2;
    paintPetal(m, S * 0.5 + (cx - S * 0.5) * 0.6, fy, S * 0.1, S * 0.11, a,
      front ? red : deep, { throat: blot, throatAt: 0.16, crinkle: 0.5, seed: i,
        z: front ? 1.0 : 0.85, rough: 0.55, veins: 9 });
  }
  // the seed head and the ring of stamens round it
  const hx = S * 0.5 + (cx - S * 0.5) * 0.6;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    seg(m, hx, fy, hx + Math.cos(a) * S * 0.04, fy + Math.sin(a) * S * 0.035,
      S * 0.004, S * 0.003, (k, t, s, c) => lay(m, k, scale3(hexc('20140f'), 0.8 + t * 0.4),
        c * (0.6 + t * 0.4), 1.1, 0.6));
  }
  lens(m, hx, fy, S * 0.024, S * 0.02, 0, 0, (k, u, v, c) => {
    const ray = Math.pow(Math.abs(Math.sin(Math.atan2(v, u) * 5)), 8);
    lay(m, k, scale3(hexc('7c8a5a'), 0.8 + 0.3 * (1 - u * u - v * v) - ray * 0.2), c, 1.25, 0.5);
  });
  return m;
}

// THE YELLOW FLOWER: a buttercup. Five round petals with a lacquer shine on
// them — the one flower that is glossy — a green eye of stamens, and a
// branching stem carrying a second bloom.
export function buttercup(S, seed = 202) {
  const m = sprite(S);
  const R = stream(seed);
  turfAt(m, R, 10, GRASS, S);
  // three-lobed leaves low down
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.7;
    const bx = S * (0.5 + (i - 1.5) * 0.08), by = S * 0.88;
    for (const d of [-0.5, 0, 0.5]) {
      paintLeaf(m, bx + Math.cos(a + d) * S * 0.045, by + Math.sin(a + d) * S * 0.04,
        S * 0.05, S * 0.035, a + d, hexc('4f7a2c'), { point: 0.3, serr: 3, seed: i, z: 0.45 });
    }
  }
  const gold = hexc('f4c20d'), gold2 = hexc('e0a800');
  const bloom = (x, y, r, turn, z) => {
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * TAU;
      paintPetal(m, x, y, r * 0.55, r * 0.5, a, i % 2 ? gold : gold2,
        { throat: hexc('c69a08'), throatAt: 0.1, seed: i + z * 10, z, rough: 0.18, point: 0.1, veins: 5 });
    }
    lens(m, x, y, r * 0.3, r * 0.3, 0, 0, (k, u, v, c) => {
      const dot = hash3(k, 23, seed) < 0.3 ? 0.75 : 1;
      lay(m, k, scale3(hexc('9a9a2a'), (0.8 + 0.3 * (1 - u * u - v * v)) * dot), c, z + 0.3, 0.5);
    });
  };
  const main = arc(S * 0.5, S - 0.5, S * 0.66, S * 0.05, 10);
  paintStem(m, main, S * 0.011, S * 0.008, STEM, STEM_TIP, { seed: 2 });
  const side = arc(main[5][0], main[5][1], S * 0.24, S * 0.16, 6);
  paintStem(m, side, S * 0.008, S * 0.006, STEM, STEM_TIP, { seed: 3 });
  const [sx, sy] = side[side.length - 1];
  bloom(sx, sy - S * 0.02, S * 0.1, 0.4, 0.8);
  const [cx, cy] = main[main.length - 1];
  bloom(cx, cy - S * 0.03, S * 0.14, -0.2, 1.0);
  return m;
}

// THE BLUE FLOWER: a cornflower. A head of ragged, trumpet-mouthed florets
// round a knot of dark purple ones, sitting in a green cup of scales edged
// in brown, on a wiry grey-green stem with narrow leaves.
export function cornflower(S, seed = 203) {
  const m = sprite(S);
  const R = stream(seed);
  turfAt(m, R, 9, GRASS, S);
  const stemC = hexc('5d7550'), stemT = hexc('7a8f68');
  const main = arc(S * 0.5, S - 0.5, S * 0.64, -S * 0.06, 10);
  paintStem(m, main, S * 0.011, S * 0.008, stemC, stemT, { seed: 2, rough: 0.7 });
  for (let i = 0; i < 4; i++) {
    const p = main[2 + i * 2];
    const a = -Math.PI / 2 + (i % 2 ? 0.7 : -0.7);
    paintLeaf(m, p[0] + Math.cos(a) * S * 0.06, p[1] + Math.sin(a) * S * 0.05,
      S * 0.07, S * 0.012, a, hexc('667d57'), { point: 0.95, seed: i, z: 0.5, rough: 0.7 });
  }
  const [cx, cy0] = main[main.length - 1];
  const cy = cy0 - S * 0.02;
  // the cup of bracts
  lens(m, cx, cy + S * 0.035, S * 0.035, S * 0.04, Math.PI / 2, 0.2, (k, u, v, c) => {
    const scale = Math.abs(Math.sin((u * 3 + Math.abs(v) * 2) * Math.PI));
    const edge = scale > 0.85 ? 0.5 : 1;
    lay(m, k, scale3(hexc('6f8a4a'), (0.8 + 0.2 * (1 - v * v)) * edge), c, 0.9, 0.65);
  });
  // the outer florets: funnels opening outward, each mouth cut in teeth
  const blue = hexc('3f63d6'), blue2 = hexc('5578e6'), dark = hexc('2a2f86');
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI + (i / 10) * Math.PI + (R() - 0.5) * 0.15;
    const L = S * (0.055 + R() * 0.012);
    const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.8;
    seg(m, cx, cy, ex, ey, S * 0.008, S * 0.02, (k, t, s, c) => {
      const teeth = t > 0.8 && Math.abs(Math.sin(s * 5)) > 0.8 ? 0 : 1;
      if (!teeth) return;
      const col = lerp3(dark, i % 2 ? blue : blue2, smooth(0.1, 0.5, t));
      lay(m, k, scale3(col, 0.85 + t * 0.25 - Math.abs(s) * 0.1), c, 1 + t * 0.2, 0.6);
    });
  }
  // the knot of inner florets
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, r = R() * S * 0.02;
    lens(m, cx + Math.cos(a) * r, cy - S * 0.01 + Math.sin(a) * r * 0.6, S * 0.008,
      S * 0.006, a, 0, (k, u, v, c) => lay(m, k, scale3(hexc('3a2470'), 0.8 + 0.3 * (1 - u * u)), c, 1.35, 0.6));
  }
  return m;
}

// --- a mushroom -----------------------------------------------------------------------

// THE MUSHROOM: a panther cap. A domed brown cap flecked with the white warts
// of its veil, a band of pale gills in the shadow under the rim, a white stem
// with a ring on it and a bulb at the foot, standing in a little moss.
export function mushroom(S, seed = 204) {
  const m = sprite(S, 3);
  const R = stream(seed);
  const cx = S * 0.5;
  // moss and litter at the foot
  for (let i = 0; i < 40; i++) {
    const x = S * (0.28 + R() * 0.44), y = S * (0.93 + R() * 0.07);
    lens(m, x, y, S * 0.02, S * 0.01, R() * TAU, 0.5, (k, u, v, c) =>
      lay(m, k, scale3(hexc(R() < 0.5 ? '5a6b2e' : '6b5a36'), 0.6 + 0.3 * (1 - v * v)), c, 0.2, 0.8));
  }
  // the stem: fibrous, cream, a bulb at the foot and a hanging ring
  const top = S * 0.44, foot = S * 0.93;
  for (let y = Math.floor(top); y < foot; y++) {
    const t = (y - top) / (foot - top);
    const w = S * (0.07 + 0.012 * t + 0.05 * smooth(0.82, 1, t));
    for (let x = Math.floor(cx - w - 1); x <= cx + w + 1; x++) {
      if (x < 0 || x >= S) continue;
      const s = (x + 0.5 - cx) / w;
      const c = clamp01((1 - Math.abs(s)) * w + 0.5);
      if (c <= 0) continue;
      const k = y * S + x;
      const fib = 1 + (fbm(x, y, S, 40, 2, seed + 3, 0.5, 3) * 0.08);
      const round = Math.sqrt(Math.max(0, 1 - s * s));
      const col = scale3(hexc('ece4d2'), (0.72 + 0.3 * round - 0.1 * s) * fib * (1 - t * 0.12));
      lay(m, k, col, c, 0.5 + round * 0.3, 0.75);
    }
  }
  // the ring: a skirt hanging round the stem a third of the way down
  const ry = S * 0.56;
  for (let y = Math.floor(ry); y < ry + S * 0.035; y++) {
    const t = (y - ry) / (S * 0.035);
    const w = S * (0.085 + 0.02 * t);
    for (let x = Math.floor(cx - w); x <= cx + w; x++) {
      const s = (x + 0.5 - cx) / w;
      if (Math.abs(s) > 1) continue;
      const k = y * S + x;
      lay(m, k, scale3(hexc('f3eee2'), 0.75 + 0.3 * Math.sqrt(1 - s * s) - t * 0.15), 1, 0.9, 0.8);
    }
  }
  // the cap: a dome, darker at the crown, the rim just curled under
  const capW = S * 0.38, capTop = S * 0.14, capBot = S * 0.44;
  const brown = hexc('7a4a2c'), rim = hexc('a8744a'), crown = hexc('5a3420');
  for (let y = Math.floor(capTop); y <= capBot + 2; y++) {
    for (let x = Math.floor(cx - capW - 1); x <= cx + capW + 1; x++) {
      if (x < 0 || x >= S || y < 0 || y >= S) continue;
      const u = (x + 0.5 - cx) / capW, v = (capBot - (y + 0.5)) / (capBot - capTop);
      // the dome's outline: v <= sqrt(1 - u^2), flattened a little at the top
      const lim = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.2)), 0.55);
      const edge = (lim - v) * (capBot - capTop);
      const c = clamp01(edge + 0.5) * clamp01((1.02 - Math.abs(u)) * capW);
      if (c <= 0 || v < -0.04) continue;
      const k = y * S + x;
      const rv = v / Math.max(lim, 0.05);
      const streak = fbm(x, y, S, 36, 2, seed + 7, 0.5, 5) * 0.08;
      let col = lerp3(rim, brown, smooth(0.0, 0.35, rv));
      col = lerp3(col, crown, smooth(0.55, 1.0, rv) * 0.8);
      const light = 0.8 + 0.35 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.6 + rv * 0.4) - u * 0.1;
      col = scale3(col, light * (1 + streak));
      lay(m, k, col, c, 0.8 + Math.sqrt(Math.max(0, 1 - u * u)) * 0.6 * lim, 0.5);
    }
  }
  // the gills in the shadow under the rim
  for (let y = Math.floor(capBot - S * 0.01); y < capBot + S * 0.03; y++) {
    const t = (y - capBot + S * 0.01) / (S * 0.04);
    const w = capW * (0.98 - t * 0.35);
    for (let x = Math.floor(cx - w); x <= cx + w; x++) {
      const s = (x + 0.5 - cx) / w;
      if (Math.abs(s) > 1 || y < 0 || y >= S) continue;
      const k = y * S + x;
      if (m.a[k] > 0.5 && m.h[k] > 0.85) continue;
      const gill = 0.75 + 0.25 * Math.abs(Math.sin(s * 40));
      lay(m, k, scale3(hexc('d9ccb4'), 0.55 * gill * (1 - t * 0.3)), 1, 0.7, 0.8);
    }
  }
  // the warts of the veil, white flecks thicker toward the crown
  for (let i = 0; i < 26; i++) {
    const u = (R() * 2 - 1) * 0.85;
    const lim = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.2)), 0.55);
    const v = 0.2 + R() * (lim - 0.25);
    if (v < 0.1) continue;
    const x = cx + u * capW, y = capBot - v * (capBot - capTop);
    lens(m, x, y, S * (0.008 + R() * 0.008), S * (0.006 + R() * 0.005), R() * TAU, 0,
      (k, uu, vv, c) => lay(m, k, scale3(hexc('efe9dc'), 0.85 + 0.2 * (1 - uu * uu)), c, 1.6, 0.85));
  }
  return m;
}

// --- a sapling ---------------------------------------------------------------------

// A young oak: a thin grey-brown stem with the bark just starting, two side
// shoots, and clusters of lobed leaves, the newest a lighter green.
export function sapling(S, seed = 205) {
  const m = sprite(S);
  const R = stream(seed);
  turfAt(m, R, 7, GRASS, S, { lo: 0.06, span: 0.12 });
  const bark = hexc('5b4a38'), barkT = hexc('7a6a52');
  const main = arc(S * 0.5, S - 0.5, S * 0.82, S * 0.04, 12, S * 0.02, R);
  paintStem(m, main, S * 0.02, S * 0.008, bark, barkT, { seed: 3, rough: 0.8 });
  const shoots = [
    [main[5], -0.9, S * 0.24], [main[7], 0.8, S * 0.2], [main[9], -0.5, S * 0.14],
  ];
  for (const [p, a, L] of shoots) {
    const e = [p[0] + Math.sin(a) * L, p[1] - Math.cos(a) * L * 0.7];
    paintStem(m, [p, [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2 + S * 0.01], e],
      S * 0.008, S * 0.004, bark, barkT, { seed: 5, rough: 0.8 });
  }
  const greens = ['4b7a2e', '568a34', '3f6b27', '64963d', '76a64a'].map(hexc);
  const tips = [main[main.length - 1], ...shoots.map(([p, a, L]) =>
    [p[0] + Math.sin(a) * L, p[1] - Math.cos(a) * L * 0.7])];
  for (const [tx, ty] of tips) {
    for (let i = 0; i < 9; i++) {
      const a = R() * TAU;
      const L = S * (0.045 + R() * 0.03);
      const c = greens[(R() * greens.length) | 0];
      paintLeaf(m, tx + Math.cos(a) * L * 0.9, ty + Math.sin(a) * L * 0.8, L, L * 0.45, a, c,
        { serr: 3.5, point: 0.55, seed: i, z: 0.6 + R() * 0.3, veins: 4 });
    }
  }
  return m;
}

// --- the fields ----------------------------------------------------------------------

// WHEAT. Young, a stand of green shoots with their leaves peeling off them;
// ripe, golden stalks each carrying an ear of plump grains in two rows with
// long awns standing off it, the leaves gone to straw.
export function wheat(S, ripe, seed = 206) {
  const m = sprite(S);
  const R = stream(seed + (ripe ? 1 : 0));
  if (!ripe) {
    const greens = ['5f8e36', '6d9c3f', '7aa84a', '557f30'].map(hexc);
    for (let i = 0; i < 26; i++) {
      const x0 = S * (0.06 + R() * 0.88);
      const h = S * (0.35 + R() * 0.3);
      const c = greens[(R() * greens.length) | 0];
      paintBlade(m, x0, S - 0.5, h, (R() - 0.5) * S * 0.3, S * (0.009 + R() * 0.006), c, { seed: i });
      if (R() < 0.6) {
        // a leaf peeling off partway up
        const t = 0.3 + R() * 0.3;
        const sx = x0, sy = S - h * t;
        const dir = R() < 0.5 ? -1 : 1;
        stroke(m, arc(sx, sy, h * 0.35, dir * S * 0.12, 5), S * 0.008, 0.3,
          (k, tt, s, cc) => lay(m, k, scale3(c, 0.7 + tt * 0.35), cc, 0.45 + tt * 0.1, 0.55));
      }
    }
    return m;
  }
  const straw = hexc('c9a24e'), strawT = hexc('e1c071'), dry = hexc('b8964f');
  for (let i = 0; i < 11; i++) {
    const x0 = S * (0.08 + (i / 10) * 0.84 + (R() - 0.5) * 0.05);
    const h = S * (0.72 + R() * 0.2);
    const lean = (R() - 0.5) * S * 0.12;
    const pts = arc(x0, S - 0.5, h, lean, 10);
    paintStem(m, pts, S * 0.007, S * 0.005, dry, strawT, { seed: i, rough: 0.55 });
    if (R() < 0.7) {
      const t = 0.25 + R() * 0.25, p = pts[Math.round(t * 10)];
      const dir = R() < 0.5 ? -1 : 1;
      stroke(m, arc(p[0], p[1], S * 0.12, dir * S * 0.1, 5), S * 0.007, 0.3,
        (k, tt, s, c) => lay(m, k, scale3(dry, 0.75 + tt * 0.3), c, 0.4, 0.6));
    }
    // the ear: grains in two rows up the top of the stalk
    const [ex, ey] = pts[pts.length - 1];
    const [bx, by] = pts[pts.length - 3];
    const ang = Math.atan2(ey - by, ex - bx);
    const earL = S * 0.16;
    for (let g = 0; g < 9; g++) {
      const t = g / 8;
      const px = ex - Math.cos(ang) * earL * (1 - t) * 0.9, py = ey - Math.sin(ang) * earL * (1 - t) * 0.9 + S * 0.04;
      for (const side of [-1, 1]) {
        const ga = ang + side * 0.5;
        const gx = px + Math.cos(ga) * S * 0.008, gy = py + Math.sin(ga) * S * 0.008;
        lens(m, gx, gy, S * 0.017, S * 0.009, ga, 0.35, (k, u, v, c) => {
          const col = lerp3(straw, strawT, (u + 1) * 0.4);
          lay(m, k, scale3(col, 0.75 + 0.35 * (1 - v * v)), c, 0.8 + t * 0.2, 0.5);
        });
        // an awn off the tip of each grain
        const ax = gx + Math.cos(ga - side * 0.35) * S * 0.07;
        const ay = gy + Math.sin(ga - side * 0.35) * S * 0.07;
        seg(m, gx, gy, ax, ay, S * 0.0022, S * 0.0012, (k, tt, s, c) =>
          lay(m, k, scale3(strawT, 0.95 - tt * 0.1), c * 0.9, 0.85, 0.5));
      }
    }
  }
  return m;
}

// Fern-fine leaves, the way a carrot's are: a stalk with leaflets cut into
// leaflets along it.
function feather(m, x0, y0, h, lean, col, seed, R) {
  const pts = arc(x0, y0, h, lean, 8);
  paintStem(m, pts, m.S * 0.006, m.S * 0.003, scale3(col, 0.8), col, { seed });
  for (let i = 2; i < pts.length; i++) {
    const [px, py] = pts[i];
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * (0.9 + R() * 0.3);
      const L = m.S * (0.035 - i * 0.002);
      for (let j = 0; j < 3; j++) {
        const t = (j + 1) / 3;
        const lx = px + Math.cos(a) * L * t, ly = py + Math.sin(a) * L * t;
        lens(m, lx, ly, m.S * 0.012, m.S * 0.004, a + side * 0.5, 0.9, (k, u, v, c) =>
          lay(m, k, scale3(col, 0.75 + 0.35 * (1 - v * v) + (u + 1) * 0.05), c, 0.5, 0.55));
      }
    }
  }
}

export function carrot(S, ripe, seed = 207) {
  const m = sprite(S);
  const R = stream(seed + (ripe ? 1 : 0));
  const green = hexc('4f8a33'), green2 = hexc('5f9a3c');
  const plants = ripe ? [0.2, 0.5, 0.8] : [0.18, 0.5, 0.82];
  for (const px of plants) {
    const x = S * (px + (R() - 0.5) * 0.04);
    if (ripe) {
      // the shoulder of the root, orange, standing proud of the soil
      lens(m, x, S * 0.96, S * 0.045, S * 0.05, -Math.PI / 2, 0.2, (k, u, v, c) => {
        const ring = 0.9 + 0.1 * Math.sin(u * 14);
        lay(m, k, scale3(hexc('e0782a'), (0.7 + 0.35 * (1 - v * v)) * ring), c, 0.7, 0.45);
      });
    }
    const n = ripe ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const h = S * (ripe ? 0.4 + R() * 0.25 : 0.18 + R() * 0.12);
      feather(m, x + (R() - 0.5) * S * 0.02, S * (ripe ? 0.93 : 0.99), h,
        (i - n / 2) * S * (ripe ? 0.06 : 0.04), R() < 0.5 ? green : green2, i, R);
    }
  }
  return m;
}

// Leaflets in pairs along a stalk — a potato's compound leaf.
function compound(m, pts, col, R, o = {}) {
  const S = m.S;
  paintStem(m, pts, S * 0.009, S * 0.005, scale3(col, 0.8), col, { seed: o.seed ?? 1 });
  for (let i = 2; i < pts.length; i += 2) {
    const [px, py] = pts[i];
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * (1.1 + R() * 0.3);
      const L = S * (o.leaf ?? 0.05);
      paintLeaf(m, px + Math.cos(a) * L, py + Math.sin(a) * L * 0.8, L, L * 0.55, a, col,
        { point: 0.5, seed: i, z: 0.55 + i * 0.02, veins: 4, rough: o.rough ?? 0.55 });
    }
  }
  const [tx, ty] = pts[pts.length - 1];
  paintLeaf(m, tx, ty - S * 0.03, S * (o.leaf ?? 0.05), S * (o.leaf ?? 0.05) * 0.55, -Math.PI / 2,
    col, { point: 0.5, seed: 99, z: 0.8, veins: 4, rough: o.rough ?? 0.55 });
}

export function potato(S, ripe, seed = 208) {
  const m = sprite(S);
  const R = stream(seed + (ripe ? 1 : 0));
  const green = hexc('4a7a2e'), green2 = hexc('5a8a38');
  const n = ripe ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const x0 = S * (0.12 + (i / (n - 1)) * 0.76);
    const h = S * (ripe ? 0.55 + R() * 0.3 : 0.3 + R() * 0.15);
    compound(m, arc(x0, S - 0.5, h, (R() - 0.5) * S * 0.2, 8), R() < 0.5 ? green : green2, R,
      { seed: i, leaf: ripe ? 0.05 : 0.04 });
  }
  if (ripe) {
    // the flowers: small white stars with yellow beaks, in twos and threes
    for (let i = 0; i < 6; i++) {
      const x = S * (0.15 + R() * 0.7), y = S * (0.1 + R() * 0.16);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU + R() * 0.3;
        paintPetal(m, x, y, S * 0.016, S * 0.013, a, hexc('eae6f0'),
          { seed: p, z: 1.2, rough: 0.5, point: 0.4, throat: hexc('c8b8d8'), throatAt: 0.2 });
      }
      lens(m, x, y, S * 0.008, S * 0.008, 0, 0, (k, u, v, c) =>
        lay(m, k, scale3(hexc('e8c21e'), 0.85 + 0.25 * (1 - u * u - v * v)), c, 1.4, 0.4));
    }
  }
  return m;
}

// PEPPERS: a bushy plant of glossy dark leaves, and when it is ripe, red pods
// hanging off it — each a curved, lacquered fruit with a green cap.
export function pepper(S, ripe, seed = 209) {
  const m = sprite(S);
  const R = stream(seed + (ripe ? 1 : 0));
  const green = hexc('35682a'), green2 = hexc('427835');
  const stems = ripe ? 3 : 2;
  const tips = [];
  for (let i = 0; i < stems; i++) {
    const x0 = S * (0.3 + i * (0.4 / Math.max(1, stems - 1)));
    const h = S * (ripe ? 0.82 : 0.5);
    const pts = arc(x0, S - 0.5, h, (R() - 0.5) * S * 0.12, 10);
    paintStem(m, pts, S * 0.013, S * 0.007, hexc('3e5e2a'), hexc('557a36'), { seed: i });
    for (let j = 3; j < pts.length; j++) {
      const [px, py] = pts[j];
      for (const side of [-1, 1]) {
        if (R() < 0.3) continue;
        const a = -Math.PI / 2 + side * (0.8 + R() * 0.6);
        const L = S * (0.05 + R() * 0.02);
        paintLeaf(m, px + Math.cos(a) * L, py + Math.sin(a) * L * 0.8, L, L * 0.42, a,
          R() < 0.5 ? green : green2, { point: 0.75, seed: j, z: 0.6, rough: 0.3, veins: 5 });
        if (side > 0) tips.push([px + Math.cos(a) * L * 0.5, py]);
      }
    }
  }
  if (ripe) {
    const red = hexc('c8261c'), red2 = hexc('a81812');
    for (let i = 0; i < 5; i++) {
      const [px, py] = tips[(i * 3 + 1) % tips.length];
      const x = px + (R() - 0.5) * S * 0.04, y = py + S * 0.02;
      // the cap and its stalk
      seg(m, x, y - S * 0.02, x, y + S * 0.01, S * 0.005, S * 0.006, (k, t, s, c) =>
        lay(m, k, scale3(hexc('4a7a2c'), 0.8 + 0.2 * (1 - s * s)), c, 1.1, 0.4));
      const L = S * (0.07 + R() * 0.03), bend = (R() - 0.5) * 0.5;
      const pts = [];
      for (let t = 0; t <= 1.001; t += 0.125) {
        pts.push([x + Math.sin(t * 1.5) * bend * L, y + S * 0.01 + t * L]);
      }
      stroke(m, pts, S * 0.022, S * 0.006, (k, t, s, c) => {
        const round = Math.sqrt(Math.max(0, 1 - s * s));
        // a lacquered skin: dark where it turns away, a hard highlight
        const hi = Math.pow(Math.max(0, 1 - Math.abs(s + 0.45) * 3), 3) * 0.5;
        const col = lerp3(red2, red, round);
        lay(m, k, scale3(col, 0.6 + 0.45 * round + hi), c, 1.0 + round * 0.4, 0.18);
      });
    }
  }
  return m;
}

// LETTUCE: young, a few rosettes of soft leaves; ripe, full heads — pale and
// packed at the heart, the outer leaves open and ruffled at their edges.
export function salad(S, ripe, seed = 210) {
  const m = sprite(S, 2.8);
  const R = stream(seed + (ripe ? 1 : 0));
  const heads = ripe ? [[0.27, 0.34], [0.73, 0.34]] : [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2]];
  for (const [hx, size] of heads) {
    const x = S * hx, y = S * (1 - size * 0.45);
    const n = ripe ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const outer = 1 - i / n;
      const a = -Math.PI / 2 + (R() - 0.5) * (0.6 + outer * 2.4);
      const L = S * size * (0.3 + outer * 0.25);
      const col = lerp3(hexc('b6d66a'), hexc('5f9a38'), outer * 0.9);
      const cx = x + Math.cos(a) * L * 0.6, cy = y + Math.sin(a) * L * 0.4 + outer * S * size * 0.15;
      lens(m, cx, cy, L, L * 0.75, a, 0.25, (k, u, v, c) => {
        // a ruffled edge: the margin waves in and out along its length
        const rr = Math.hypot(u, v);
        const ruffle = Math.sin(Math.atan2(v, u) * 13 + i) * 0.06;
        if (rr > 0.94 + ruffle) return;
        const vein = Math.pow(Math.abs(Math.sin((u * 4 - Math.abs(v) * 2) * Math.PI)), 10) * 0.12;
        const bub = fbm(k % S, (k / S) | 0, S, 24, 2, seed + i, 0.5) * 0.12;
        const cc = scale3(col, (0.78 + 0.3 * (1 - rr) + bub) * (1 + vein));
        lay(m, k, cc, c, 0.4 + (1 - outer) * 0.8 + (1 - rr) * 0.2 + bub * 0.4, 0.5);
      });
    }
  }
  return m;
}

// A big lobed leaf on a vine — a pumpkin's or a melon's — with pale veins
// fanning from the stalk.
function vineLeaf(m, x, y, L, ang, col, lobes, deep, seed, z = 0.6) {
  lens(m, x, y, L, L * 0.95, ang, 0.1, (k, u, v, c) => {
    const th = Math.atan2(v, u), rr = Math.hypot(u, v);
    const lobe = 1 - deep * Math.pow(Math.abs(Math.cos(th * lobes * 0.5)), 3);
    if (rr > lobe) return;
    const vein = Math.pow(Math.abs(Math.cos(th * lobes * 0.5)), 30) * (1 - rr);
    const rough = 1 + (hash3(k, 29, seed) - 0.5) * 0.12;
    const cc = lerp3(scale3(col, (0.8 + 0.25 * (1 - rr)) * rough), scale3(col, 1.45), vein * 0.6);
    lay(m, k, cc, c, z + (1 - rr) * 0.25 - vein * 0.05, 0.65);
  });
}

function vine(m, R, col, deep, lobes, seed) {
  const S = m.S;
  // the runner along the ground, and its tendrils
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push([S * (0.02 + i * 0.096), S * (0.95 - Math.sin(i * 0.9) * 0.02)]);
  paintStem(m, pts, S * 0.012, S * 0.012, hexc('4b6e2e'), hexc('5c8238'), { seed });
  for (let i = 0; i < 4; i++) {
    const [px, py] = pts[2 + i * 2];
    const coil = [];
    for (let t = 0; t <= 1; t += 0.05) {
      coil.push([px + Math.cos(t * 12) * S * 0.015 * (1 - t) + t * S * 0.03,
        py - t * S * 0.1 + Math.sin(t * 12) * S * 0.01]);
    }
    stroke(m, coil, S * 0.003, S * 0.002, (k, t, s, c) =>
      lay(m, k, scale3(hexc('6f9442'), 0.8 + t * 0.3), c, 0.7, 0.6));
  }
  return pts;
}

export function pumpkin(S, ripe, seed = 211) {
  const m = sprite(S);
  const R = stream(seed + (ripe ? 1 : 0));
  const green = hexc('3f7430');
  const pts = vine(m, R, green, 0.3, 5, seed);
  const leaves = ripe ? [1, 3, 8, 9] : [1, 3, 5, 7, 9];
  for (const i of leaves) {
    const [px, py] = pts[i];
    const L = S * (ripe ? 0.12 : 0.1) * (0.8 + R() * 0.4);
    const stalk = arc(px, py, S * 0.12, (R() - 0.5) * S * 0.08, 4);
    paintStem(m, stalk, S * 0.006, S * 0.005, hexc('4b6e2e'), hexc('5c8238'), { seed: i });
    const [lx, ly] = stalk[stalk.length - 1];
    vineLeaf(m, lx, ly - L * 0.5, L, -Math.PI / 2 + (R() - 0.5) * 0.6, green, 5, 0.3, i);
  }
  if (ripe) {
    // the fruit: a squat ribbed ball, orange, a woody stalk on top
    const cx = S * 0.52, cy = S * 0.74, rx = S * 0.25, ry = S * 0.19;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (x < 0 || x >= S || y < 0 || y >= S) continue;
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        const d = Math.hypot(u, v);
        const c = clamp01((1 - d) * Math.min(rx, ry) + 0.5);
        if (c <= 0) continue;
        const k = y * S + x;
        const round = Math.sqrt(Math.max(0, 1 - d * d));
        // the ribs: grooves running pole to pole, closing toward the poles
        const lon = Math.asin(clamp(u / Math.max(0.05, Math.sqrt(Math.max(0.0025, 1 - v * v))), -1, 1));
        const rib = Math.pow(Math.abs(Math.cos(lon * 4.5)), 0.6);
        const col = scale3(lerp3(hexc('c85a12'), hexc('ec8a2a'), rib), (0.62 + 0.45 * round) * (0.88 + rib * 0.12) - v * 0.06);
        lay(m, k, col, c, 1 + round * 0.8 + rib * 0.1, 0.45);
      }
    }
    seg(m, cx, cy - ry + S * 0.02, cx + S * 0.03, cy - ry - S * 0.06, S * 0.018, S * 0.012,
      (k, t, s, c) => lay(m, k, scale3(hexc('7a7240'), 0.7 + 0.35 * (1 - s * s)), c, 2.0, 0.8));
  }
  return m;
}

export function watermelon(S, ripe, seed = 212) {
  const m = sprite(S);
  const R = stream(seed + (ripe ? 1 : 0));
  const green = hexc('4d7a3a');
  const pts = vine(m, R, green, 0.6, 5, seed);
  const leaves = ripe ? [1, 2, 8, 9] : [1, 3, 5, 7, 9];
  for (const i of leaves) {
    const [px, py] = pts[i];
    const L = S * 0.1 * (0.8 + R() * 0.4);
    const stalk = arc(px, py, S * 0.1, (R() - 0.5) * S * 0.08, 4);
    paintStem(m, stalk, S * 0.005, S * 0.004, hexc('4b6e2e'), hexc('5c8238'), { seed: i });
    const [lx, ly] = stalk[stalk.length - 1];
    vineLeaf(m, lx, ly - L * 0.5, L, -Math.PI / 2 + (R() - 0.5) * 0.6, green, 5, 0.62, i);
  }
  if (ripe) {
    // the fruit: an oval lying on its side, dark green with pale wavering
    // stripes, a waxy bloom on it
    const cx = S * 0.5, cy = S * 0.77, rx = S * 0.3, ry = S * 0.16;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (x < 0 || x >= S || y < 0 || y >= S) continue;
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        const d = Math.hypot(u, v);
        const c = clamp01((1 - d) * ry + 0.5);
        if (c <= 0) continue;
        const k = y * S + x;
        const round = Math.sqrt(Math.max(0, 1 - d * d));
        const w = fbm(x, y, S, 10, 2, seed + 3, 0.5, 30) * 0.25;
        const stripe = smooth(0.45, 0.6, Math.abs(Math.sin((v * 3.2 + w) * Math.PI)));
        const col = lerp3(hexc('1d4a1f'), hexc('6d9a4a'), stripe * 0.75);
        lay(m, k, scale3(col, 0.6 + 0.5 * round), c, 1 + round * 0.7, 0.4);
      }
    }
  }
  return m;
}

// BAMBOO: culms, jointed, standing in a column that runs out of the top of
// the tile and in at the bottom — a stalk is a stack of these — with a thin
// branch and a spray of narrow leaves off a node or two.
export function bamboo(S, seed = 213) {
  const m = sprite(S, 2.2);
  const R = stream(seed);
  const culms = [[0.28, 0.07, 0.35], [0.52, 0.09, 0.0], [0.76, 0.06, 0.6]];
  for (const [fx, fw, phase] of culms) {
    const x = S * fx, w = S * fw * 0.5;
    const node = S * 0.5;
    for (let y = 0; y < S; y++) {
      const ny = ((y / node + phase) % 1 + 1) % 1;       // where between nodes
      const ring = Math.exp(-Math.pow((ny < 0.5 ? ny : 1 - ny) * 22, 2));
      for (let xi = Math.floor(x - w - 1); xi <= x + w + 1; xi++) {
        const s = (xi + 0.5 - x) / w;
        const c = clamp01((1 - Math.abs(s)) * w + 0.5);
        if (c <= 0) continue;
        const k = y * S + xi;
        const round = Math.sqrt(Math.max(0, 1 - s * s));
        const streak = fbm(xi, y, S, 30, 2, seed + fx * 100, 0.5, 2) * 0.1;
        let col = lerp3(hexc('7fa43a'), hexc('a8c85a'), round * 0.6 + streak);
        col = lerp3(col, hexc('c9c070'), ring * 0.55);
        col = scale3(col, (0.65 + 0.45 * round - s * 0.1) * (1 - ring * 0.12));
        lay(m, k, col, c, 0.5 + round * 0.5 + ring * 0.25, 0.32);
      }
    }
  }
  // a branch and its leaves off two of the nodes
  for (const [fx, , phase] of [culms[0], culms[2]]) {
    const x = S * fx, y = S * (0.5 - phase * 0.5) + S * 0.02;
    const dir = fx < 0.5 ? -1 : 1;
    const bx = x + dir * S * 0.12, by = y - S * 0.1;
    seg(m, x, y, bx, by, S * 0.006, S * 0.004, (k, t, s, c) =>
      lay(m, k, scale3(hexc('8aa84a'), 0.8 + 0.2 * (1 - s * s)), c, 0.9, 0.4));
    for (let i = 0; i < 4; i++) {
      const a = (dir > 0 ? -0.5 : Math.PI + 0.5) + (i - 1.5) * 0.45;
      paintLeaf(m, bx + Math.cos(a) * S * 0.07, by + Math.sin(a) * S * 0.07 + S * 0.03,
        S * 0.08, S * 0.016, a + dir * 0.4, hexc('6d9a3a'), { point: 0.95, seed: i, z: 1.0, rough: 0.45 });
    }
  }
  return m;
}

// --- the hot things ----------------------------------------------------------------

// THE TORCH, as you carry it: a stick of dark wood, the top wrapped in
// pitch-soaked rag, burning. Only the burning part glows — the props say to
// read `gl` — so a torch in your hand lights its own head and not its handle.
export function torchIcon(S, seed = 214) {
  const m = sprite(S, 2.6);
  m.gl = new Float32Array(S * S);
  const cx = S * 0.5;
  // the stick
  seg(m, cx, S * 0.97, cx, S * 0.36, S * 0.045, S * 0.05, (k, t, s, c) => {
    const round = Math.sqrt(Math.max(0, 1 - s * s));
    const grain = 1 + fbm(k % S, (k / S) | 0, S, 6, 2, seed, 0.5, 60) * 0.18;
    const char = smooth(0.55, 1.0, t);
    const col = lerp3(hexc('6a4a2c'), hexc('24170e'), char);
    lay(m, k, scale3(col, (0.65 + 0.4 * round - s * 0.1) * grain), c, 0.5 + round * 0.3, 0.7);
  });
  // the rag wrapped round the top
  for (let i = 0; i < 5; i++) {
    const y = S * (0.36 - i * 0.026);
    seg(m, cx - S * 0.075, y, cx + S * 0.075, y - S * 0.02, S * 0.02, S * 0.02, (k, t, s, c) => {
      const col = scale3(hexc('3a2c20'), 0.55 + 0.35 * (1 - s * s));
      lay(m, k, col, c, 1.0 + (1 - s * s) * 0.2, 0.85);
    });
  }
  // the flame: a teardrop licking upward off the rag, orange at its skin,
  // yellow through the middle and near white at its heart — and only that
  // heart glowing in full, or the whole flame burns out white
  const fx = cx, fy = S * 0.2;
  for (let y = 0; y < S * 0.36; y++) {
    for (let x = Math.floor(cx - S * 0.2); x < cx + S * 0.2; x++) {
      const u = (x + 0.5 - fx) / (S * 0.11);
      const v = (y + 0.5 - fy) / (S * 0.16);
      const flick = fbm(x, y, S, 5, 2, seed + 5, 0.5) * 0.12;
      // round below, drawn to a point above
      const w = v > 0 ? 1 : Math.max(0.02, 1 + v * 0.9);
      const d = Math.hypot(u / w + flick, v > 0 ? v * 1.15 : v * 0.6);
      const c = clamp01((1 - d) * 7);
      if (c <= 0) continue;
      const k = y * S + x;
      const heat = clamp01(1 - d);
      // the colours a little under what the flame looks, because the glow
      // adds its own light on top — painted at full strength it tone-maps
      // out to a salmon pink
      const col = lerp3(hexc('8a2a06'), lerp3(hexc('c8640e'), hexc('e8b050'),
        smooth(0.45, 0.9, heat)), smooth(0.0, 0.45, heat));
      lay(m, k, col, c, 1.2, 0.9);
      m.gl[k] = Math.max(m.gl[k], c * (0.2 + heat * 0.35));
    }
  }
  return m;
}

// LAVA: a skin of crust cooling dark on the melt, torn into rafts that ride
// on it — the tears glowing yellow-white where the melt is thinnest, the
// crust itself grey-black, rough, and dull red where it is still thin — and
// between the rafts, open channels of orange melt, swirled. Glows
// everywhere, some of it much more than the rest; tiles both ways.
export function lava(S, seed = 215) {
  const m = new Mat(S);
  m.depth = 3.4;
  m.cavity = 0.25;
  const R = stream(seed);
  const cells = [];
  for (let i = 0; i < 16; i++) cells.push([R() * S, R() * S, 0.6 + R() * 0.8]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const wx = x + fbm(x, y, S, 4, 3, seed + 1, 0.5) * S * 0.06;
      const wy = y + fbm(x, y, S, 4, 3, seed + 2, 0.5) * S * 0.06;
      let d1 = 1e9, d2 = 1e9;
      for (const [cx, cy, sc] of cells) {
        let dx = Math.abs(wx + 0.5 - cx), dy = Math.abs(wy + 0.5 - cy);
        if (dx > S / 2) dx = S - dx;
        if (dy > S / 2) dy = S - dy;
        const d = (dx * dx + dy * dy) / sc;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      const gap = Math.sqrt(d2) - Math.sqrt(d1);
      // a raft's edge: the tear runs where two rafts meet, wider in places
      const tearW = 1.5 + (fbm(x, y, S, 5, 2, seed + 3, 0.5) + 0.5) * 7;
      const tear = 1 - smooth(0, tearW, gap);
      // how thick the crust is: thin toward its torn edges, and in open
      // channels where a raft never formed
      const open = smooth(0.15, 0.45, fbm(x, y, S, 3, 3, seed + 4, 0.55));
      const skin = clamp01(smooth(0.5, 6 + tearW, gap) - open * 0.9);
      const swirl = fbm(x, y, S, 6, 3, seed + 5, 0.6);
      const melt = lerp3(hexc('e2470a'), hexc('ff9a1e'), smooth(-0.3, 0.5, swirl));
      const hot = lerp3(melt, hexc('fff0b0'), tear * 0.8);
      const bump = fbm(x, y, S, 28, 3, seed + 6, 0.55);
      const crust = lerp3(hexc('3a1a10'), hexc('1c1614'), smooth(0.2, 0.8, skin));
      const rock = lerp3(crust, hexc('4a403c'), smooth(0.1, 0.4, bump) * skin * 0.5);
      const col = lerp3(hot, rock, smooth(0.05, 0.6, skin));
      m.set(k, col);
      m.h[k] = skin * (0.8 + bump * 0.3);
      m.r[k] = mix(0.3, 0.95, skin);
    }
  }
  return m;
}

// A block of cut diamond: a grid of brilliant-cut stones set in steel, each
// stone's facets catching the light at their own angle.
export function diamondBlock(S, seed = 216) {
  const m = new Mat(S);
  m.depth = 3;
  m.cavity = 0.3;
  const n = 3, cell = S / n, rim = S * 0.022;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const u = (x + 0.5 - (cx + 0.5) * cell) / (cell / 2 - rim);
      const v = (y + 0.5 - (cy + 0.5) * cell) / (cell / 2 - rim);
      const inside = Math.max(Math.abs(u), Math.abs(v));
      if (inside > 1) {
        // the steel setting
        const b = 0.55 + fbm(x, y, S, 3, 2, seed, 0.5, 40) * 0.1;
        m.set(k, [0.5 * b, 0.52 * b, 0.55 * b]);
        m.h[k] = 0.6;
        m.r[k] = 0.35;
        continue;
      }
      // facets: the square's table in the middle, eight bevels round it
      const ang = Math.atan2(v, u);
      const facet = inside < 0.45 ? 8 : Math.floor(((ang + Math.PI) / TAU) * 8 + 0.5) % 8;
      const f = hash3(facet, cx * 7 + cy, seed);
      const sparkle = hash3(x >> 2, y >> 2, seed + facet) < 0.03 ? 0.5 : 0;
      const base = lerp3(hexc('bfe8f0'), hexc('6fd0e6'), f);
      m.set(k, scale3(base, 0.7 + f * 0.45 + sparkle));
      m.h[k] = inside < 0.45 ? 1 : 1 - (inside - 0.45) * 0.9;
      m.r[k] = 0.05;
    }
  }
  return m;
}

// The mint's striking bed: a gold blank lying in a ring of worn steel.
export function coinDie(S, seed = 217) {
  const m = new Mat(S);
  m.depth = 3;
  m.mt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const u = (x + 0.5) / S - 0.5, v = (y + 0.5) / S - 0.5;
      const d = Math.hypot(u, v);
      const noise = fbm(x, y, S, 8, 2, seed, 0.5) * 0.06;
      if (d < 0.27) {
        const bevel = smooth(0.23, 0.27, d);
        m.set(k, scale3(hexc('d8b150'), 0.9 - bevel * 0.25 + noise));
        m.h[k] = 1 - bevel * 0.6;
        m.r[k] = 0.3;
        m.mt[k] = 1;
      } else if (d < 0.44) {
        const worn = 0.6 + fbm(x, y, S, 20, 2, seed + 1, 0.5) * 0.1;
        m.set(k, [0.62 * worn, 0.63 * worn, 0.66 * worn]);
        m.h[k] = 0.55;
        m.r[k] = 0.35;
        m.mt[k] = 1;
      } else {
        const g = 0.35 + noise;
        m.set(k, [g, g * 0.98, g * 0.95]);
        m.h[k] = 0.3;
        m.r[k] = 0.6;
        m.mt[k] = 0.8;
      }
    }
  }
  return m;
}

// STAINED GLASS: cathedral glass in one colour, its thickness never quite
// even — the colour deepening and paling in slow waves, a few seed bubbles
// caught in it — held in a strip of lead round the edge.
export function stainedGlass(S, colour, seed = 218) {
  const m = new Mat(S);
  m.depth = 1.6;
  const base = hexc(colour);
  const R = stream(seed);
  const bubbles = [];
  for (let i = 0; i < 14; i++) bubbles.push([R() * S, R() * S, S * (0.004 + R() * 0.008)]);
  const lead = S * 0.045;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const e = Math.min(x + 0.5, y + 0.5, S - x - 0.5, S - y - 0.5);
      if (e < lead) {
        const t = e / lead;
        const g = 0.2 + 0.12 * Math.sin(t * Math.PI);
        m.set(k, [g, g, g * 1.05]);
        m.a[k] = 1;
        m.h[k] = 0.4 + Math.sin(t * Math.PI) * 0.6;
        m.r[k] = 0.55;
        continue;
      }
      const wave = fbm(x, y, S, 3, 3, seed, 0.55) * 0.22 + fbm(x, y, S, 11, 2, seed + 1, 0.5) * 0.06;
      let bub = 0;
      for (const [bx, by, br] of bubbles) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
        if (d < br) bub = Math.max(bub, 1 - d / br);
      }
      m.set(k, scale3(base, 0.85 + wave + bub * 0.35));
      m.a[k] = clamp01(0.62 + wave * 0.6 - bub * 0.25);
      m.h[k] = 0.2 + wave * 0.5 + bub * 0.2;
      m.r[k] = 0.06;
    }
  }
  return m;
}
