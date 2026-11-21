// realbody.js — the people and the animals, under the Realistic style.
//
// A body in this game is a handful of boxes, and each box face wears a small
// canvas of pixel art — sixteen texels across — painted from a palette: skin,
// hair, robe, sash, boot for a villager; hide, belly, muzzle, hoof for a cow.
// Under the Realistic style the ground is photographs lit by the sun, and a
// villager in sixteen-texel pixel art standing on it looked like a sticker.
//
// So each canvas is painted AGAIN here, at eight times the resolution (fewer
// at a lower detail), and every texel of it as a MATERIAL: the palette entry it
// was painted with says what it is — a robe is cloth, a skin is skin, a hide
// is fur (wool on a sheep, feathers on a bird), a boot is leather, a crown is
// metal — and each material brings its own surface: the weave of homespun,
// the grain of skin, hair falling in strands, fur lying down the body, the
// curl of a fleece, the brushed face of a gorget. The colour is the palette's,
// so a farmer is still the farmer and a brown cow is still brown; what changes
// is that the colour is now the colour OF something. Each repaint comes with a
// normal and roughness map, and lit.js lights it with the same sun as the
// blocks.
//
// The design survives the repaint: the pixel art is upscaled with its edges
// softened rather than blurred away, so the eyes, the sash, the patches on a
// cow are where they always were.
//
// Nothing here changes a body's shape, its colours on any other style, or the
// canvases it was built with — `pixelMap` keeps the original, and switching
// away from the style puts it back.

import * as THREE from 'three';
import { bodyMaterials, FLAT_NR, makeLit } from './lit.js';
import { fbm, hash3 } from './realtex.js';

// --- what a palette entry is made of ------------------------------------------

// by palette key, for a villager, the dead and the golem
const KEY_CLASS = {
  skin: 'skin', skinDark: 'skin', mouth: 'skin', muzzle: 'skin', nostril: 'skin',
  snout: 'skin', snoutLong: 'skin', comb: 'skin', face: 'fur',
  hair: 'hair', brow: 'hair', beard: 'hair', mane: 'hair',
  eye: 'eye', iris: 'eye', socket: 'eye', glint: 'eye',
  robe: 'cloth', robeDark: 'cloth', sash: 'cloth', apron: 'cloth', kirtle: 'cloth',
  band: 'cloth', shirt: 'cloth', shirtDark: 'cloth', stain: 'cloth', soot: 'cloth',
  legs: 'cloth', legsDark: 'cloth', dark: 'cloth', grime: 'cloth',
  boot: 'leather', pack: 'leather', packDark: 'leather',
  hat: 'straw', hatDark: 'straw',
  glasses: 'metal', plate: 'metal', plateDark: 'metal', verdigris: 'patina',
  crown: 'metal', crownDark: 'metal', gem: 'gem',
  hide: 'fur', hideDark: 'fur', belly: 'fur', patch: 'fur', stripe: 'fur',
  chest: 'fur', leg: 'fur', ear: 'fur', tailTip: 'fur',
  hoof: 'horn', horn: 'horn', beak: 'horn',
  bone: 'bone', boneDark: 'bone', boneDeep: 'bone', rot: 'rot',
  bow: 'wood', string: 'cloth',
};

// what a class is like under the light: roughness, metal, and how deep its
// surface detail runs
const CLASS = {
  cloth: { rough: 0.92, metal: 0, depth: 2.2 },
  skin: { rough: 0.52, metal: 0, depth: 0.8 },
  hair: { rough: 0.38, metal: 0, depth: 2.6 },
  eye: { rough: 0.1, metal: 0, depth: 0.2 },
  leather: { rough: 0.55, metal: 0, depth: 1.4 },
  straw: { rough: 0.8, metal: 0, depth: 2.4 },
  metal: { rough: 0.3, metal: 1, depth: 0.6 },
  patina: { rough: 0.75, metal: 0.3, depth: 1.2 },
  gem: { rough: 0.06, metal: 0, depth: 0.3 },
  fur: { rough: 0.82, metal: 0, depth: 2.2 },
  wool: { rough: 1.0, metal: 0, depth: 3.4 },
  feather: { rough: 0.7, metal: 0, depth: 1.8 },
  horn: { rough: 0.42, metal: 0, depth: 0.7 },
  bone: { rough: 0.72, metal: 0, depth: 1.6 },
  rot: { rough: 0.6, metal: 0, depth: 1.4 },
  wood: { rough: 0.6, metal: 0, depth: 1.4 },
  // what things are made of that bodies are not: a stone axe's head, a loaf,
  // the water in a bucket, the paint on a gun
  stone: { rough: 0.88, metal: 0, depth: 1.8 },
  food: { rough: 0.55, metal: 0, depth: 1.2 },
  liquid: { rough: 0.06, metal: 0, depth: 0.2 },
  paint: { rough: 0.5, metal: 0, depth: 0.5 },
  scale: { rough: 0.3, metal: 0.15, depth: 1.0 },
};

// a soldier's steel is on the palette as a sash and an apron, and a steel
// sash is not cloth: grey, unsaturated "cloth" on a garrison palette is plate
function classOf(key, rgb, ctx) {
  let c = KEY_CLASS[key] ?? 'cloth';
  if (ctx?.fleece && (key === 'hide' || key === 'hideDark' || key === 'belly')) c = 'wool';
  if (ctx?.bird && (c === 'fur')) c = 'feather';
  // a pig is skin with a few bristles on it, not a coat
  if (ctx?.bare && c === 'fur') c = 'skin';
  if ((key === 'sash' || key === 'apron' || key === 'hat' || key === 'hatDark')
      && ctx?.armoured) {
    const mx = Math.max(...rgb), mn = Math.min(...rgb);
    if (mx - mn < 30) c = 'metal';
  }
  return c;
}

// --- the repaint ------------------------------------------------------------------

const hexRgb = (s) => (typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)
  ? [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
  : null);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// the detail each material lays over its colour: a brightness factor and a
// height, at texel (x, y) of an H-square face
function detail(cls, x, y, H, seed) {
  const n2 = (fx, fy, s) => fbm(x, y, H, fx, 2, seed + s, 0.5, fy);
  switch (cls) {
    case 'cloth': {
      // a plain weave: warp and weft crossing, a thread every few texels,
      // over a soft unevenness in the cloth — and at a medium detail's size,
      // where a thread would be a texel and a half, the unevenness alone: a
      // weave drawn that coarse is bubble wrap
      const lump = n2(4, 4, 1) * 0.05 + n2(16, 16, 17) * 0.02;
      if (H < 96) return [0.98 + lump, lump * 2];
      const p = H / 64;
      const wx = Math.abs(Math.sin((x / p) * Math.PI)), wy = Math.abs(Math.sin((y / p) * Math.PI));
      const over = ((Math.floor(x / p) + Math.floor(y / p)) & 1) ? wx : wy;
      return [0.95 + over * 0.07 + lump, over * 0.4 + lump * 2];
    }
    case 'skin': {
      const m = n2(5, 5, 2) * 0.05 + n2(24, 24, 3) * 0.025;
      const pore = hash3(x, y, seed) < 0.01 ? -0.05 : 0;
      return [1 + m + pore, m * 3 + pore * 2];
    }
    case 'hair': case 'fur': {
      // strands, falling down the face of the part
      const hair = cls === 'hair';
      const fine = hair ? 1.4 : 1.2;
      const st = n2(Math.round(H / (2.6 * fine)), hair ? 2 : 4, 4);
      const st2 = n2(Math.round(H / (1.4 * fine)), hair ? 3 : 6, 5) * 0.5;
      const s = st + st2;
      // hair shines in strands; fur is softer, a nap more than a grain
      return hair ? [0.86 + s * 0.3, 0.5 + s] : [0.93 + s * 0.13 + n2(5, 5, 18) * 0.05, 0.5 + s * 0.7];
    }
    case 'wool': {
      const c = n2(10, 10, 6) + n2(22, 22, 7) * 0.5;
      const curl = Math.abs(Math.sin(c * 9));
      return [0.84 + curl * 0.22 + c * 0.1, curl + c];
    }
    case 'feather': {
      // overlapping rows of feathers, each lit at its tip
      const p = Math.max(3, H / 14);
      const row = Math.floor(y / p);
      const xo = x / p + (row & 1) * 0.5;
      const fx = xo - Math.floor(xo) - 0.5, fy = y / p - row;
      const arc = clamp01(1 - (fx * fx * 2.2 + (1 - fy) * (1 - fy)));
      return [0.86 + arc * 0.22 + n2(20, 3, 8) * 0.06, arc];
    }
    case 'leather': {
      const g = n2(20, 20, 9) * 0.06 + n2(6, 6, 10) * 0.04;
      return [1 + g, g * 4];
    }
    case 'straw': {
      const f = n2(2, Math.round(H / 3), 11);
      return [0.88 + f * 0.26, f];
    }
    case 'metal': {
      const b = n2(2, Math.round(H / 2.5), 12) * 0.05;
      return [1 + b, b];
    }
    case 'patina': {
      const b = n2(8, 8, 13) * 0.12;
      return [1 + b, b * 2];
    }
    case 'bone': {
      const b = n2(10, 10, 14) * 0.08;
      const pit = hash3(x, y, seed + 1) < 0.015 ? -0.1 : 0;
      return [1 + b + pit, b * 2 + pit * 2];
    }
    case 'rot': {
      const b = n2(6, 6, 15);
      return [0.92 + b * 0.18, b * 1.5];
    }
    case 'horn': case 'wood': {
      const b = n2(2, 12, 16) * 0.06;
      return [1 + b, b];
    }
    case 'stone': {
      // a knapped or ground face: fine grit, a few pits, a slow mottle
      const grit = (hash3(x, y, seed + 2) - 0.5) * 0.12;
      const mot = n2(6, 6, 19) * 0.1;
      const pit = hash3(x >> 1, y >> 1, seed + 3) < 0.02 ? -0.12 : 0;
      return [0.95 + grit + mot + pit, mot * 2 + grit + pit * 2];
    }
    case 'food': {
      // crust, skin, flesh: soft lumps and a fine tooth
      const l = n2(8, 8, 20) * 0.1 + n2(26, 26, 21) * 0.04;
      return [0.97 + l, l * 3];
    }
    case 'paint': {
      const b = n2(10, 10, 22) * 0.03;
      return [1 + b, b];
    }
    case 'scale': {
      // rows of small scales, each catching the light along its free edge
      const p = Math.max(2, H / 20);
      const row = Math.floor(y / p);
      const xo = x / p + (row & 1) * 0.5;
      const fx = xo - Math.floor(xo) - 0.5, fy = y / p - row;
      const arc = clamp01(1 - (fx * fx * 3 + (1 - fy) * (1 - fy)));
      return [0.9 + arc * 0.18, arc];
    }
    default: return [1, 0];
  }
}

// --- a face ------------------------------------------------------------------------
//
// The one canvas that is not upscaled but painted afresh. Sixteen texels made
// a face out of two white bars and a line, and eight times those, softened,
// is a mask. So a villager's face is drawn here in the SAME places the pixel
// art put its features — the hair where the hair was, the eyes on the same
// rows, the mouth where the mouth was — but as features: almond eyes with an
// iris, a pupil and a lid over them, brows of hair, a soft hairline, the
// shadow under the nose, lips, and the warmth in the cheeks. The palette is
// the villager's own, so every face on the planet is still the face it was.
function paintFace(p, H, seed) {
  const U = H / 16;
  const rgb = (s, d) => hexRgb(s) ?? d;
  const skin = rgb(p.skin, [200, 160, 120]), skinD = rgb(p.skinDark, [170, 130, 95]);
  const hair = rgb(p.hair, [70, 50, 35]), brow = rgb(p.brow ?? p.hair, hair);
  const white = rgb(p.eye, [240, 236, 226]), iris = rgb(p.iris, [60, 80, 110]);
  const lip = rgb(p.mouth, [140, 90, 80]);
  const band = p.band ? rgb(p.band, null) : null;
  const glasses = p.glasses ? rgb(p.glasses, [40, 40, 44]) : null;
  const col = new Float32Array(H * H * 3);
  const cls = new Array(H * H);
  const put = (k, c, t = 1) => {
    col[k * 3] += (c[0] - col[k * 3]) * t;
    col[k * 3 + 1] += (c[1] - col[k * 3 + 1]) * t;
    col[k * 3 + 2] += (c[2] - col[k * 3 + 2]) * t;
  };
  const eyes = [[4.5, 8.05], [11.5, 8.05]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const k = y * H + x;
      const gx = (x + 0.5) / U, gy = (y + 0.5) / U;
      // skin: darker toward the jaw and the temples, warm on the cheeks
      const edge = Math.min(gx, 16 - gx);
      let sh = 0.9 + 0.1 * smooth(0, 3.5, edge) - 0.08 * smooth(11.5, 16, gy);
      sh += fbm(x, y, H, 4, 2, seed + 1) * 0.03;
      col[k * 3] = skin[0] * sh; col[k * 3 + 1] = skin[1] * sh; col[k * 3 + 2] = skin[2] * sh;
      cls[k] = 'skin';
      for (const [cx] of eyes) {
        const d = Math.hypot((gx - cx) / 2.1, (gy - 10.6) / 1.6);
        if (d < 1) put(k, [skin[0] * 1.02, skin[1] * 0.86, skin[2] * 0.84], (1 - d) * 0.28);
      }
      // the shadow under the nose, and round its sides
      const nd = Math.hypot((gx - 8) / 1.9, (gy - 10.7) / 0.9);
      if (nd < 1) put(k, skinD, (1 - nd) * 0.7);
      // the mouth: an upper lip, a fuller lower one, and the line between
      const mx = (gx - 8) / 2.1;
      if (Math.abs(mx) < 1) {
        const w = 1 - mx * mx;
        const up = 13.35 - 0.34 * w, lo = 13.55 + 0.46 * w;
        if (gy > up && gy < lo) {
          const t = smooth(0, 0.15, Math.min(gy - up, lo - gy));
          const hi = gy > 13.7 && gy < 13.8 + 0.2 * w ? 1.12 : 1;
          put(k, [lip[0] * hi, lip[1] * hi, lip[2] * hi], t);
          cls[k] = 'skin';
        }
        if (Math.abs(gy - 13.5) < 0.09 * w + 0.03) put(k, [lip[0] * 0.45, lip[1] * 0.4, lip[2] * 0.4], 0.8);
      }
      // the eyes
      for (const [cx, cy] of eyes) {
        const dx = (gx - cx) / 1.55;
        if (Math.abs(dx) >= 1) continue;
        const lens = 0.72 * (1 - dx * dx);
        const dy = (gy - cy) / Math.max(lens, 0.01);
        // the lid's crease above, and the lash line along its top
        const crease = Math.abs(gy - (cy - lens - 0.35));
        if (crease < 0.25) put(k, skinD, (1 - crease / 0.25) * 0.4);
        if (Math.abs(dy) >= 1) {
          if (dy < 0 && dy > -1.28) put(k, [skinD[0] * 0.5, skinD[1] * 0.45, skinD[2] * 0.45], 0.55);
          continue;
        }
        cls[k] = 'eye';
        // the white, shaded into the corners and under the lid
        const ws = 0.78 + 0.22 * (1 - dx * dx) - (dy < -0.4 ? 0.12 : 0);
        put(k, [white[0] * ws, white[1] * ws, white[2] * ws]);
        // the iris and the pupil, looking a little toward the nose
        const ix = cx + (cx < 8 ? 0.08 : -0.08), iy = cy + 0.05;
        const ir = Math.hypot(gx - ix, gy - iy);
        if (ir < 0.62) {
          const rim = smooth(0.42, 0.62, ir);
          const streak = 0.9 + 0.2 * Math.abs(Math.sin(Math.atan2(gy - iy, gx - ix) * 9));
          const ic = [iris[0] * streak * (1 - rim * 0.45), iris[1] * streak * (1 - rim * 0.45),
            iris[2] * streak * (1 - rim * 0.45)];
          put(k, ic);
          if (ir < 0.26) put(k, [18, 14, 12]);
          const cl = Math.hypot(gx - (ix + 0.18), gy - (iy - 0.2));
          if (cl < 0.09) put(k, [250, 250, 250], 0.9);
        }
        // the upper lid's shadow over the top of the eye
        if (dy < -0.55) put(k, [skinD[0] * 0.55, skinD[1] * 0.5, skinD[2] * 0.5], (-0.55 - dy) * 1.6);
      }
      // brows: short hairs laid along an arc over each eye
      for (const [cx] of eyes) {
        const bx = (gx - cx) / 1.8;
        if (Math.abs(bx) > 1) continue;
        const by = 6.05 - 0.25 * (1 - bx * bx) + (cx < 8 ? -bx : bx) * 0.08;
        const th = (p.brow ? 0.55 : 0.34) * (1 - Math.abs(bx) * 0.5);
        const dd = Math.abs(gy - by);
        if (dd < th) {
          const hairN = 0.7 + 0.3 * Math.abs(Math.sin((gx * 6 + gy * 3) * 3.1));
          put(k, [brow[0] * hairN, brow[1] * hairN, brow[2] * hairN], smooth(th, th * 0.4, dd));
          cls[k] = 'hair';
        }
      }
      // the hairline: ragged, not ruled — and down the sides for long hair
      const n = fbm(x, 0, H, 10, 2, seed + 3) * 0.5;
      let inHair = gy < 3.0 + n;
      if (p.long) inHair = inHair || gy < 4 + n || gx < 2.8 + n * 0.6 || gx > 13.2 - n * 0.6;
      if (inHair) {
        const st = 0.82 + 0.3 * Math.abs(fbm(x, y, H, Math.round(H / 3), 2, seed + 4, 0.5, 3));
        put(k, [hair[0] * st, hair[1] * st, hair[2] * st]);
        cls[k] = 'hair';
      }
      if (band && gy >= 2 && gy < 4) { put(k, band); cls[k] = 'cloth'; }
      // spectacles: two rims round the eyes and a bridge between them
      if (glasses) {
        for (const [cx, cy] of eyes) {
          const rx = Math.abs(gx - cx) / 2.3, ry = Math.abs(gy - cy) / 1.55;
          const r = Math.max(rx, ry) + Math.min(rx, ry) * 0.15;
          if (Math.abs(r - 1) < 0.07) { put(k, glasses); cls[k] = 'metal'; }
        }
        if (gx > 6.3 && gx < 9.7 && Math.abs(gy - 7.3) < 0.14) { put(k, glasses); cls[k] = 'metal'; }
      }
    }
  }
  const out = new Uint8ClampedArray(H * H * 4);
  for (let k = 0; k < H * H; k++) {
    out[k * 4] = col[k * 3]; out[k * 4 + 1] = col[k * 3 + 1]; out[k * 4 + 2] = col[k * 3 + 2];
    out[k * 4 + 3] = 255;
  }
  return { col: out, cls };
}

// A skin is one atlas (see js/skins/layout.js), and on its head the colour
// test is not enough: what is not skin there is hair, not homespun. The head's
// own box is the top-left quarter of the top half; its front is the eight
// sixty-fourths square at (8, 8). On the face, the top quarter is the fringe,
// a near-white is the white of an eye, and the rest — an iris, a mouth, a
// beard somebody drew in two shades — stays skin, so the face keeps its own
// drawing rather than growing a pelt.
function onHead(c, x, y, S, r, g, b) {
  const u = S / 64;
  if (x >= 32 * u || y >= 16 * u || c === 'skin') return c;
  const front = x >= 8 * u && x < 16 * u && y >= 8 * u;
  if (!front || y < 10 * u) return 'hair';
  return Math.min(r, g, b) > 200 ? 'eye' : 'skin';
}

// For a canvas painted from no palette — a player's skin — skin is told from
// cloth by colour: warm, moderately saturated, neither very dark nor pale.
function guessClass(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, sat = mx > 0 ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = ((g - b) / (mx - mn)) * 60;
    else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60;
    else h = (4 + (r - g) / (mx - mn)) * 60;
    if (h < 0) h += 360;
  }
  if (h >= 5 && h <= 48 && sat >= 0.18 && sat <= 0.68 && v >= 0.3) return 'skin';
  return 'cloth';
}

// --- the surface detail, worked out once ---------------------------------------
//
// `detail` is noise, and noise is the expensive part. Evaluated texel by texel
// for every canvas, it made walking into a village a five-second stop while
// five hundred canvases were painted one after another — the game simply
// froze, and "it sometimes stops working" was the fair description of it. It
// depends only on the class, the size it is drawn against and the seed, so it
// is worked out once per class, size and one of four seeds, as a tile, and
// every canvas after the first reads it. Four seeds is variety enough that no
// two neighbours' coats weave alike; a canvas's own hash picks which.
const LUT_SEEDS = 4;
const luts = new Map();
function lut(cls, grain, variant) {
  const key = `${cls}:${grain}:${variant}`;
  let t = luts.get(key);
  if (t) return t;
  t = new Float32Array(grain * grain * 2);
  const seed = 7 + variant * 7919;
  for (let y = 0; y < grain; y++) {
    for (let x = 0; x < grain; x++) {
      const [f, h] = detail(cls, x, y, grain, seed);
      t[(y * grain + x) * 2] = f;
      t[(y * grain + x) * 2 + 1] = h;
    }
  }
  luts.set(key, t);
  return t;
}

// For a carried thing's icon: what a texel is made of, off its colour and the
// item it belongs to (itemCtx in realitem.js). Browns are the haft; the rest
// of a tool is its working end, in whatever the name says that is.
function itemClass(r, g, b, it) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, sat = mx > 0 ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = ((g - b) / (mx - mn)) * 60;
    else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60;
    else h = (4 + (r - g) / (mx - mn)) * 60;
    if (h < 0) h += 360;
  }
  const brown = h >= 12 && h <= 48 && sat >= 0.22 && v >= 0.1 && v <= 0.78;
  const grey = sat < 0.18;
  const warmMetal = h >= 20 && h <= 55 && sat >= 0.3 && v > 0.55;   // gold, brass, copper lit
  switch (it.kind) {
    case 'tool': {
      if (it.tier === 'wood') return 'wood';
      if (it.tier === 'stone' || it.tier === 'flint') return brown && !grey ? 'wood' : 'stone';
      if (it.tier === 'diamond') return h > 150 && h < 210 && sat > 0.2 ? 'gem' : brown ? 'wood' : 'metal';
      if (brown && !warmMetal) return 'wood';
      if (!grey && sat > 0.35 && !warmMetal && h > 60 && h < 160) return 'paint';
      return 'metal';
    }
    case 'bow':
      if (brown) return 'wood';
      if (v > 0.8 && grey) return 'feather';
      return grey ? 'stone' : 'cloth';
    case 'metal': return brown && !warmMetal && v < 0.45 ? 'wood' : 'metal';
    case 'ore': return grey || v < 0.35 ? 'stone' : 'metal';
    case 'bucket': return grey ? 'metal' : 'liquid';
    case 'gem': return 'gem';
    case 'mineral': return 'stone';
    case 'food': return 'food';
    case 'straw': return 'straw';
    case 'bone': return 'bone';
    case 'feather': return 'feather';
    case 'leather': return 'leather';
    case 'cloth': return brown ? 'wood' : 'cloth';
    case 'wood': return brown || v < 0.5 ? 'wood' : grey ? 'metal' : 'cloth';
    default:
      if (brown) return 'wood';
      if (grey) return v > 0.55 ? 'metal' : 'stone';
      return 'cloth';
  }
}

// Paint one body canvas as materials. `job` carries the canvas's pixels as
// they were when it was asked for, what it was painted from (userData.real —
// see partTexture in entities.js) and the size to paint it at.
// --- a carried thing ---------------------------------------------------------------
//
// An icon is not a coat. Eight times a coat's sixteen texels is a coat with
// its weave in it; eight times a pickaxe's thirty-two is a pickaxe made of
// Lego — the staircase down every curve of the head, the black outline drawn
// round it, the three bands of shading the pixel artist laid on it. So an item
// is repainted as a thing: the outline taken off and its texels given the
// colour of what they outline; the silhouette and the materials enlarged by
// EPX, three times over, which turns a staircase into the curve it stood for;
// the painted shading smoothed out of each material so the light can do that
// job; and a bevel raised off the silhouette, so the edges catch the sun.
function epx(key, n) {
  const out = new Int32Array(n * n * 4);
  const at = (x, y) => key[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  const m = n * 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      const o = (y * 2) * m + x * 2;
      out[o] = C === A && C !== D && A !== B ? A : P;
      out[o + 1] = A === B && A !== C && B !== D ? B : P;
      out[o + m] = D === C && D !== B && C !== A ? C : P;
      out[o + m + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  return out;
}

const CLS_LIST = Object.keys(CLASS);

function realizeItem(job) {
  const { px, S, res, ctx } = job;
  const U = res / S;
  const lum = (o) => px[o] * 0.3 + px[o + 1] * 0.59 + px[o + 2] * 0.11;
  const solid = (x, y) => x >= 0 && y >= 0 && x < S && y < S && px[(y * S + x) * 4 + 3] > 127;
  // the texels, their classes, and the outline off them
  const col = new Float32Array(S * S * 3);
  const cls = new Int32Array(S * S).fill(-1);
  for (let i = 0; i < S * S; i++) {
    col[i * 3] = px[i * 4]; col[i * 3 + 1] = px[i * 4 + 1]; col[i * 3 + 2] = px[i * 4 + 2];
    if (px[i * 4 + 3] > 127) {
      cls[i] = CLS_LIST.indexOf(itemClass(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], ctx.item));
    }
  }
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const filled = new Uint8Array(S * S);
  const newly = [];
  for (let pass = 0; pass < 2; pass++) {
    const fix = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (!solid(x, y)) continue;
        const i = y * S + x;
        let edge = false;
        for (const [dx, dy] of N4) if (!solid(x + dx, y + dy)) edge = true;
        if (!edge) continue;
        // an edge texel much darker than the solid ones inside it is ink
        let r = 0, g = 0, b = 0, n = 0, l = 0, c = -1;
        for (const [dx, dy] of [...N4, [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const xx = x + dx, yy = y + dy;
          if (!solid(xx, yy)) continue;
          const j = yy * S + xx, o = j * 4;
          if (lum(o) <= lum(i * 4) * 1.15) continue;
          r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; l += lum(o); n++;
          c = cls[j];
        }
        if (n && lum(i * 4) < (l / n) * 0.62) fix.push([i, r / n, g / n, b / n, c]);
      }
    }
    for (const [i, r, g, b, c] of fix) {
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      if (c >= 0) cls[i] = c;
    }
  }
  // round the outside, the colour of what is nearest inside: the filter
  // reaches into the holes as the thing shrinks into the distance, and a
  // hole's own colour was black
  for (let pass = 0; pass < 3; pass++) {
    const next = col.slice();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        if (cls[i] >= 0 || filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of N4) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
          const j = yy * S + xx;
          if (cls[j] < 0 && !filled[j]) continue;
          r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; n++;
        }
        if (!n) continue;
        next[i * 3] = r / n; next[i * 3 + 1] = g / n; next[i * 3 + 2] = b / n;
        newly.push(i);
      }
    }
    col.set(next);
    for (const i of newly) filled[i] = 1;
    newly.length = 0;
  }
  // the silhouette and the materials, enlarged EPX-fashion as one key
  let key = new Int32Array(S * S);
  for (let i = 0; i < S * S; i++) key[i] = cls[i] + 1;
  let n = S;
  while (n < res) { key = epx(key, n); n *= 2; }
  // the colour, enlarged soft, then smoothed within each material
  const big = new Float32Array(res * res * 3);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const fx = (x + 0.5) / U - 0.5, fy = (y + 0.5) / U - 0.5;
      const x0 = Math.max(0, Math.min(S - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(S - 1, Math.floor(fy)));
      const x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1);
      const tx = clamp01(fx - x0), ty = clamp01(fy - y0);
      const k = key[y * res + x];
      // only neighbours of the same material count, or the haft bleeds into
      // the head along the join
      let r = 0, g = 0, b = 0, w = 0;
      for (const [xx, yy, ww] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
        [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]]) {
        const j = yy * S + xx;
        if (cls[j] + 1 !== k || ww <= 0) continue;
        r += col[j * 3] * ww; g += col[j * 3 + 1] * ww; b += col[j * 3 + 2] * ww; w += ww;
      }
      if (!w) {
        const j = Math.min(S - 1, Math.round(fy)) * S + Math.min(S - 1, Math.round(fx));
        r = col[j * 3]; g = col[j * 3 + 1]; b = col[j * 3 + 2]; w = 1;
      }
      const o = (y * res + x) * 3;
      big[o] = r / w; big[o + 1] = g / w; big[o + 2] = b / w;
    }
  }
  // each material's mean colour: half of what a texel ends as, so the pixel
  // artist's bands and dots of shading go and the light does their work
  const mean = new Float32Array(CLS_LIST.length * 4);
  for (let i = 0; i < res * res; i++) {
    const k = key[i];
    if (!k) continue;
    mean[k * 4] += big[i * 3]; mean[k * 4 + 1] += big[i * 3 + 1];
    mean[k * 4 + 2] += big[i * 3 + 2]; mean[k * 4 + 3]++;
  }
  const blurR = Math.max(1, Math.round(U * 0.8));
  const smooth2 = new Float32Array(res * res * 3);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const k = key[y * res + x];
      let r = 0, g = 0, b = 0, w = 0;
      for (let dy = -blurR; dy <= blurR; dy += 2) {
        const yy = y + dy;
        if (yy < 0 || yy >= res) continue;
        for (let dx = -blurR; dx <= blurR; dx += 2) {
          const xx = x + dx;
          if (xx < 0 || xx >= res || key[yy * res + xx] !== k) continue;
          const o = (yy * res + xx) * 3;
          r += big[o]; g += big[o + 1]; b += big[o + 2]; w++;
        }
      }
      const o = (y * res + x) * 3;
      const mn = mean[k * 4 + 3];
      const t = k && mn ? 0.5 : 0;
      smooth2[o] = mix(r / w, mn ? mean[k * 4] / mn : 0, t);
      smooth2[o + 1] = mix(g / w, mn ? mean[k * 4 + 1] / mn : 0, t);
      smooth2[o + 2] = mix(b / w, mn ? mean[k * 4 + 2] / mn : 0, t);
    }
  }
  // how far each texel is from the silhouette: a bevel off every edge
  const dist = new Float32Array(res * res);
  const INF = 1e6;
  for (let i = 0; i < res * res; i++) dist[i] = key[i] > 0 ? INF : 0;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = y * res + x;
      if (!dist[i]) continue;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - res] + 1);
      if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - res - 1] + 1.414);
      if (x < res - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - res + 1] + 1.414);
    }
  }
  for (let y = res - 1; y >= 0; y--) {
    for (let x = res - 1; x >= 0; x--) {
      const i = y * res + x;
      if (!dist[i]) continue;
      if (x < res - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < res - 1) dist[i] = Math.min(dist[i], dist[i + res] + 1);
      if (x < res - 1 && y < res - 1) dist[i] = Math.min(dist[i], dist[i + res + 1] + 1.414);
      if (x > 0 && y < res - 1) dist[i] = Math.min(dist[i], dist[i + res - 1] + 1.414);
    }
  }
  const variant = job.hash % LUT_SEEDS;
  const bevel = Math.max(2, U * 1.2);
  const colOut = new Uint8ClampedArray(res * res * 4);
  const hgt = new Float32Array(res * res);
  const rough = new Float32Array(res * res);
  const metal = new Float32Array(res * res);
  const lutOf = {};
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = y * res + x;
      const k = key[i] - 1;
      const o = i * 4;
      if (k < 0) {
        // a hole: the colour of what is round it, for the filter's sake
        colOut[o] = big[i * 3]; colOut[o + 1] = big[i * 3 + 1]; colOut[o + 2] = big[i * 3 + 2];
        colOut[o + 3] = 0;
        rough[i] = 0.8;
        continue;
      }
      const name = CLS_LIST[k];
      const L = lutOf[name] ??= lut(name, res, variant);
      const li = i * 2;
      const f = L[li], hh = L[li + 1];
      colOut[o] = smooth2[i * 3] * f; colOut[o + 1] = smooth2[i * 3 + 1] * f;
      colOut[o + 2] = smooth2[i * 3 + 2] * f;
      colOut[o + 3] = 255;
      const C = CLASS[name];
      const bev = smooth(0, bevel, dist[i]);
      hgt[i] = bev * 2.2 + hh * C.depth * 0.5;
      rough[i] = C.rough;
      metal[i] = C.metal;
    }
  }
  return texturesOf(colOut, hgt, rough, metal, res);
}

// The two textures a repaint is: its colour (rows turned over, as a texture's
// run up) and its normal, roughness and metal, the normal out of the height.
function texturesOf(col, hgt, rough, metal, res) {
  const nr = new Uint8Array(res * res * 4);
  const H = (x, y) => hgt[Math.min(res - 1, Math.max(0, y)) * res + Math.min(res - 1, Math.max(0, x))];
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const hx = (H(x + 1, y) - H(x - 1, y)) * 0.5;
      const hy = (H(x, y + 1) - H(x, y - 1)) * 0.5;
      let nx = -hx, ny = hy;
      const l = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= l; ny /= l;
      const o = ((res - 1 - y) * res + x) * 4;
      nr[o] = (nx * 0.5 + 0.5) * 255;
      nr[o + 1] = (ny * 0.5 + 0.5) * 255;
      nr[o + 2] = rough[y * res + x] * 255;
      nr[o + 3] = metal[y * res + x] * 255;
    }
  }
  const up = new Uint8Array(res * res * 4);
  for (let y = 0; y < res; y++) {
    up.set(col.subarray(y * res * 4, (y + 1) * res * 4), (res - 1 - y) * res * 4);
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = srgb ? 4 : 1;
    t.needsUpdate = true;
    return t;
  };
  return { color: mk(up, true), nr: mk(nr, false), res };
}

function realize(job) {
  const { px, S, res, ctx } = job;
  if (ctx.item) return realizeItem(job);
  // the palette's colours, and the class each one is
  const pal = [];
  for (const [key, val] of Object.entries(ctx.pal ?? {})) {
    const rgb = hexRgb(val);
    if (rgb) pal.push({ key, rgb, cls: classOf(key, rgb, ctx) });
  }
  // which class each source texel is: the palette colour it matches, or the
  // nearest one where two were mixed
  const cls = new Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    let best = null, bd = 1e9;
    for (const e of pal) {
      const d = (e.rgb[0] - r) ** 2 + (e.rgb[1] - gg) ** 2 + (e.rgb[2] - b) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    cls[i] = best ? best.cls
      : ctx.item ? itemClass(r, gg, b, ctx.item)
        : ctx.heuristic ? guessClass(r, gg, b) : (ctx.fallback ?? 'cloth');
    if (ctx.atlas && !best) cls[i] = onHead(cls[i], i % S, (i / S) | 0, S, r, gg, b);
  }
  const U = res / S;
  // the size the surface detail is drawn against: a body canvas is one face,
  // and an atlas is a whole figure whose head is an eighth of it across — so
  // a thread of a skin's shirt is the width a villager's is
  const grain = ctx.atlas ? res / 4 : res;
  const variant = job.hash % LUT_SEEDS;
  const lutOf = {};
  const col = new Uint8ClampedArray(res * res * 4);
  const hgt = new Float32Array(res * res);
  const rough = new Float32Array(res * res);
  const metal = new Float32Array(res * res);
  const seed = (job.hash & 0xffff) + 7;
  // the faces painted afresh: a villager's head front is its whole canvas,
  // and a skin's is one square of the atlas (ctx.faces, in source texels) —
  // where there is room to draw one: at sixteen texels the pixel art IS the
  // best face there is, and the low details keep it
  const faces = [];
  if (job.tag === 'face' && ctx.pal?.skin && ctx.pal?.eye) {
    faces.push({ x: 0, y: 0, w: S, pal: ctx.pal });
  }
  for (const f of ctx.faces ?? []) faces.push(f);
  const regions = faces.filter((f) => f.w * U >= 32).map((f) => {
    const H = f.w * U;
    return { x0: f.x * U, y0: f.y * U, H, paint: paintFace(f.pal, H, seed) };
  });
  const regionAt = (x, y) => {
    for (const r of regions) {
      if (x >= r.x0 && x < r.x0 + r.H && y >= r.y0 && y < r.y0 + r.H) return r;
    }
    return null;
  };
  const at = (x, y) => {
    x = x < 0 ? 0 : x >= S ? S - 1 : x;
    y = y < 0 ? 0 : y >= S ? S - 1 : y;
    return (y * S + x) * 4;
  };
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      // the pixel art, upscaled with its edges softened rather than blurred:
      // a bilinear blend whose ramp is squeezed into the middle third of each
      // step, so a shape keeps its outline and loses only its staircase
      const fx = (x + 0.5) / U - 0.5, fy = (y + 0.5) / U - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(0.3, 0.7, fx - x0), ty = smooth(0.3, 0.7, fy - y0);
      const sx = Math.min(S - 1, Math.max(0, Math.round(fx))), sy = Math.min(S - 1, Math.max(0, Math.round(fy)));
      // a hole's colour is nobody's: a texel beside one blends with itself,
      // or the edge of every rectangle in a skin's atlas went dark
      const own = (sy * S + sx) * 4;
      const nb = (n) => (px[n + 3] === 0 && px[own + 3] !== 0 ? own : n);
      const a = nb(at(x0, y0)), b2 = nb(at(x0 + 1, y0)), c = nb(at(x0, y0 + 1)), d = nb(at(x0 + 1, y0 + 1));
      const reg = regions.length ? regionAt(x, y) : null;
      const ri = reg ? (y - reg.y0) * reg.H + (x - reg.x0) : 0;
      const k = reg ? reg.paint.cls[ri] : cls[sy * S + sx];
      const L = lutOf[k] ??= lut(k, grain, variant);
      const li = ((y % grain) * grain + (x % grain)) * 2;
      const f = L[li], hh = L[li + 1];
      const o = (y * res + x) * 4;
      if (reg) {
        const pc = reg.paint.col;
        col[o] = pc[ri * 4] * f; col[o + 1] = pc[ri * 4 + 1] * f; col[o + 2] = pc[ri * 4 + 2] * f;
      } else {
        for (let ch = 0; ch < 3; ch++) {
          const top = px[a + ch] + (px[b2 + ch] - px[a + ch]) * tx;
          const bot = px[c + ch] + (px[d + ch] - px[c + ch]) * tx;
          col[o + ch] = (top + (bot - top) * ty) * f;
        }
      }
      // coverage as the canvas had it, texel for texel: a skin's second
      // layer is a hat and a jacket over the body, and what it does not
      // cover has to stay a hole
      col[o + 3] = reg ? 255 : px[own + 3];
      const C = CLASS[k] ?? CLASS.cloth;
      hgt[y * res + x] = hh * C.depth;
      rough[y * res + x] = C.rough;
      metal[y * res + x] = C.metal;
    }
  }
  // the normals, from the height, clamped at the face's edges (a face does
  // not wrap onto itself)
  const nr = new Uint8Array(res * res * 4);
  const H = (x, y) => hgt[Math.min(res - 1, Math.max(0, y)) * res + Math.min(res - 1, Math.max(0, x))];
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const hx = (H(x + 1, y) - H(x - 1, y)) * 0.5;
      // rows run down the canvas and v runs up: the slope's sign flips
      const hy = (H(x, y + 1) - H(x, y - 1)) * 0.5;
      let nx = -hx, ny = hy;
      const l = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= l; ny /= l;
      const o = ((res - 1 - y) * res + x) * 4;   // DataTexture rows run up
      nr[o] = (nx * 0.5 + 0.5) * 255;
      nr[o + 1] = (ny * 0.5 + 0.5) * 255;
      nr[o + 2] = rough[y * res + x] * 255;
      nr[o + 3] = metal[y * res + x] * 255;
    }
  }
  // the colour as a data texture too, turned over the same way: no canvas
  // per repaint, which with five hundred of them was a canvas too many
  const up = new Uint8Array(res * res * 4);
  for (let y = 0; y < res; y++) {
    up.set(col.subarray(y * res * 4, (y + 1) * res * 4), (res - 1 - y) * res * 4);
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = srgb ? 4 : 1;
    t.needsUpdate = true;
    return t;
  };
  return { color: mk(up, true), nr: mk(nr, false), res };
}

// --- the queue ------------------------------------------------------------------
//
// A repaint is asked for the moment a body is dressed and painted when there
// is time for it: a few milliseconds of every frame (pumpRealBodies, called
// from the render loop), never a village's worth in one go. Until its turn
// comes a body wears its own pixel art, under the same light — a newcomer
// arrives in the style of every other style for a moment, then the cloth
// comes up on him. Identical canvases are one repaint, however many bodies
// wear them.

const cache = new Map();       // key -> { color, nr, res }
const pending = new Map();     // key -> the job, with the materials waiting on it
const queue = [];
let active = { on: false, mult: 8 };

// What a canvas asks for at this size: its key, and a job queued for it if
// it has not been painted. Remembered on the texture against its version and
// its image, so a skin that arrives late is asked about again and a
// villager's coat is hashed once.
function jobFor(tex, mult) {
  const img = tex.image;
  if (!img?.width || !img.getContext) return null;
  const S = img.width;
  // an HD skin is already four or sixteen times the pixels: its repaint is
  // held to the size a classic one gets, which is plenty for a figure
  const res = S * Math.max(1, Math.min(mult, Math.floor(512 / S)));
  const memo = tex.userData.realJob;
  if (memo && memo.version === tex.version && memo.img === img && memo.res === res
    && (cache.has(memo.key) || pending.has(memo.key))) {
    return memo.key;
  }
  let px;
  try {
    px = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S).data;
  } catch { return null; }
  const ctx = tex.userData.real?.ctx ?? {};
  const tag = tex.userData.real?.tag ?? null;
  // identical canvases painted from identical palettes are one repaint
  let h = 2166136261 >>> 0;
  for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i], 16777619) >>> 0;
  const key = `${h}:${res}:${ctx.kind ?? ''}:${ctx.fleece ? 1 : 0}:${ctx.bird ? 1 : 0}`
    + `:${ctx.atlas ? 1 : 0}:${ctx.faces?.length ?? 0}:${tag ?? ''}`
    + `:${JSON.stringify(ctx.pal ?? {}).length}:${ctx.fallback ?? ''}`
    + `:${ctx.item ? `${ctx.item.kind}/${ctx.item.tier}` : ''}`;
  tex.userData.realJob = { version: tex.version, img, res, key };
  if (!cache.has(key) && !pending.has(key)) {
    pending.set(key, { key, px: new Uint8ClampedArray(px), S, res, ctx, tag, hash: h, mult, mats: new Set() });
    queue.push(key);
  }
  return key;
}

function wear(m, out) {
  m.uniforms.map.value = out.color;
  if (m.uniforms.uBodyNR) m.uniforms.uBodyNR.value = out.nr;
}

// Dress one body material for the style in force: its repainted canvas under
// the Realistic style (its pixel art until the repaint is ready), its own
// pixel art otherwise. Called for every body material when the style changes,
// and by whoever makes a new one.
export function dressBody(m) {
  const px = m.userData?.pixelMap;
  if (!px || !m.uniforms?.map) return;
  const plain = () => {
    m.uniforms.map.value = px;
    if (m.uniforms.uBodyNR) m.uniforms.uBodyNR.value = FLAT_NR;
  };
  const key = active.on && px.userData?.real ? jobFor(px, active.mult) : null;
  m.userData.realKey = key;
  if (!key) return plain();
  const done = cache.get(key);
  if (done) return wear(m, done);
  plain();
  pending.get(key)?.mats.add(m);
}

// A few milliseconds of repainting: as many queued canvases as fit in
// `budget` (at least one). Returns how many were painted.
export function pumpRealBodies(budget = 3) {
  if (!queue.length) return 0;
  const t0 = performance.now();
  let n = 0;
  while (queue.length) {
    const key = queue.shift();
    const job = pending.get(key);
    pending.delete(key);
    if (!job || !active.on || job.mult !== active.mult) continue;
    const out = realize(job);
    cache.set(key, out);
    for (const m of job.mats) if (m.userData.realKey === key) wear(m, out);
    n++;
    if (performance.now() - t0 > budget) break;
  }
  return n;
}

// --- the plain parts ------------------------------------------------------------
//
// Not every part of a body is a painted canvas. A hat's crown, an ear, a snout,
// a tail, a guard's blade and its haft are plain boxes, one colour each,
// carried in their vertices (see solidMaterials in entities.js) — and under
// the Realistic style a box of flat colour among painted coats is a toy. So
// each wears the surface of what it is: the steel brushed, the haft grained,
// the ear furred, the crown of a straw hat woven — a grey detail texture its
// colour is multiplied by, with normals of its own. One material per MATERIAL,
// shared by every box in the world made of it; under any other style its
// texture is plain white and nothing changes.
const WHITE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
const solidMats = new Set();
const solidTex = new Map();      // `${cls}:${res}` -> { color, nr }

function classDetail(cls, mult) {
  const res = 16 * Math.max(1, mult);
  const key = `${cls}:${res}`;
  let d = solidTex.get(key);
  if (d) return d;
  const L = lut(cls, res, 0);
  const C = CLASS[cls] ?? CLASS.cloth;
  let sum = 0;
  for (let i = 0; i < res * res; i++) sum += L[i * 2];
  const mean = sum / (res * res) || 1;
  const col = new Uint8Array(res * res * 4);
  const nr = new Uint8Array(res * res * 4);
  const H = (x, y) => L[(((y + res) % res) * res + ((x + res) % res)) * 2 + 1] * C.depth;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = y * res + x;
      // brightness about the part's own colour: the mean kept a shade
      // under one so a highlight has somewhere to go
      const f = clamp01((L[i * 2] / mean) * 0.95);
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = f * 255;
      col[i * 4 + 3] = 255;
      const hx = (H(x + 1, y) - H(x - 1, y)) * 0.5, hy = (H(x, y + 1) - H(x, y - 1)) * 0.5;
      let nx = -hx, ny = hy;
      const l = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= l; ny /= l;
      nr[i * 4] = (nx * 0.5 + 0.5) * 255;
      nr[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      nr[i * 4 + 2] = C.rough * 255;
      nr[i * 4 + 3] = C.metal * 255;
    }
  }
  const mk = (data) => {
    const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  d = { color: mk(col), nr: mk(nr) };
  solidTex.set(key, d);
  return d;
}

function dressSolid(m) {
  if (!active.on) {
    m.uniforms.map.value = WHITE;
    m.uniforms.uBodyNR.value = FLAT_NR;
    return;
  }
  const d = classDetail(m.userData.solidClass, active.mult);
  m.uniforms.map.value = d.color;
  m.uniforms.uBodyNR.value = d.nr;
}

// The material for plain boxes of one class — 'metal', 'wood', 'fur',
// 'straw'... — coloured by their vertices (the default) or by `color`.
export function classMaterial(cls, { color = 0xffffff, vertexColors = true, faceShade = true } = {}) {
  const m = makeLit({ map: WHITE, color, vertexColors, body: true, faceShade });
  m.userData.solidClass = CLASS[cls] ? cls : 'cloth';
  solidMats.add(m);
  dressSolid(m);
  return m;
}

// --- on and off -----------------------------------------------------------------

// The style in force for bodies: on or off, and how many times each canvas's
// own resolution to paint it at. Changing either lets go of every repaint
// made for the old one — they were most of the style's memory on the card,
// and a player trying the three sizes in turn used to carry all three.
export function setRealBodies(on, mult = 8) {
  const was = active;
  active = { on: !!on, mult };
  const stale = !active.on || was.mult !== mult;
  if (stale) {
    queue.length = 0;
    pending.clear();
  }
  for (const m of bodyMaterials()) dressBody(m);
  for (const m of solidMats) dressSolid(m);
  if (stale) {
    for (const out of cache.values()) { out.color.dispose(); out.nr.dispose(); }
    cache.clear();
    for (const [key, d] of solidTex) {
      if (active.on && key.endsWith(`:${16 * Math.max(1, mult)}`)) continue;
      d.color.dispose(); d.nr.dispose(); solidTex.delete(key);
    }
    luts.clear();
  }
}

export const realBodiesOn = () => active.on;
export const realBodyMult = () => active.mult;
export const realBodyCache = () => cache.size;
export const realBodyQueue = () => queue.length;
