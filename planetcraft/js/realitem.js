// realitem.js — the things people carry, under the Realistic style.
//
// A pickaxe in your fist, a sword at your belt, a loaf dropped on the grass:
// each is its hotbar icon — thirty-two texels of pixel art out of the atlas —
// made into a thing. Under every other style it is drawn that way, flat and
// unlit. Under the Realistic style it is two different things:
//
//   * a BLOCK you carry or drop, and a plant or a torch, wears the same
//     photograph the block in the ground wears, in the same light — the
//     terrain's own material, which reads the tile off the atlas UV exactly
//     as a chunk does (terrainMaterial);
//   * everything else is REPAINTED the way a villager's coat is (see
//     realbody.js): the icon at eight times its size, every texel a material
//     — the head of an iron pick is iron, its haft is wood, a diamond is a
//     gem, a loaf is baked crust, a feather is feathers — each with its own
//     surface and lit by the sun (itemMaterial). What each texel is made of
//     is read off its colour and off the item's name: an iron pick's grey is
//     metal, a stone pick's grey is stone.
//
// Materials are shared: one per item, however many of it are in the world,
// marked `shared` so whoever drops one does not dispose it under the others.

import * as THREE from 'three';
import { makeLit } from './lit.js';
import { dressBody, realBodyMult } from './realbody.js';
import { TILE, ATLAS, tileUV } from './textures.js';

const NAME = {};
for (const [k, v] of Object.entries(TILE)) if (NAME[v] == null) NAME[v] = k;

const METALS = ['IRON', 'GOLD', 'SILVER', 'COPPER', 'BRONZE', 'BRASS', 'TIN', 'ZINC'];

// What an item's texels are made of, as far as its name can say: `kind` is
// what sort of thing it is, `tier` what its working end is made of.
export function itemCtx(tile) {
  const n = NAME[tile] ?? '';
  const tierOf = () => {
    for (const t of METALS) if (n.endsWith(`_${t}`)) return t.toLowerCase();
    if (n.endsWith('_DIAMOND')) return 'diamond';
    if (n.endsWith('_STONE')) return 'stone';
    if (n.endsWith('_WOOD')) return 'wood';
    if (n.startsWith('FLINT')) return 'flint';
    return null;
  };
  let kind = 'misc', tier = tierOf();
  if (/^(PICK|AXE|SHOVEL|SWORD|HOE|SPEAR|HAMMER|CLUB|FLINT_)/.test(n)) {
    kind = 'tool';
    // the plain spear and hammer are iron-headed; the club is all wood
    if (!tier) tier = n === 'CLUB' ? 'wood' : 'iron';
  } else if (/^(GUN|BULLET|ROCKET)/.test(n)) { kind = 'tool'; tier = 'iron'; }
  else if (n === 'BOW' || n === 'ARROW') { kind = 'bow'; tier = 'flint'; }
  else if (n === 'SHEARS' || n === 'BRASS_GEAR' || n === 'COIN' || n === 'MINT') kind = 'metal';
  else if (/_INGOT$/.test(n)) kind = 'metal';
  else if (/^RAW_/.test(n)) kind = 'ore';
  else if (/^BUCKET/.test(n)) kind = 'bucket';
  else if (n === 'DIAMOND_GEM' || n === 'OBSIDIAN') kind = 'gem';
  else if (n === 'COAL_LUMP' || n === 'FLINT' || n === 'SEA_SALT' || /^DYE_/.test(n)) kind = 'mineral';
  else if (/^(BREAD|APPLE|GOLDEN_APPLE|MEAT|CARROT$|POTATO|PEPPER$|SALAD$|PUMPKIN$|WATERMELON$|CAKE|TEA_BRICK|SAFFRON|HONEYCOMB|SEEDS)/.test(n)) kind = 'food';
  else if (n === 'WHEAT') kind = 'straw';
  else if (n === 'BONE' || n === 'BONE_MEAL') kind = 'bone';
  else if (n === 'FEATHER') kind = 'feather';
  else if (n === 'LEATHER') kind = 'leather';
  else if (n === 'PAPER' || n === 'BOOK' || /^BED_/.test(n)) kind = 'cloth';
  else if (n === 'STICK' || n === 'POST' || /_ITEM$/.test(n)) kind = 'wood';
  return { item: { kind, tier, name: n } };
}

// --- the icon, as a texture of its own ----------------------------------------------

// The tile's pixels out of the atlas, into a canvas of their own. Kept per
// tile and brought up to date when the atlas is repainted (a new style), so
// the repaint underneath follows the style's own drawing of the thing.
const icons = new Map();
export function iconTexture(atlas, tile) {
  const img = atlas.image;
  const TS = ATLAS.TS;
  let e = icons.get(tile);
  if (e && e.version === atlas.version && e.img === img) return e.tex;
  const cv = e?.tex.image ?? document.createElement('canvas');
  cv.width = cv.height = TS;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, TS, TS);
  const col = tile % ATLAS.COLS, row = (tile / ATLAS.COLS) | 0;
  g.drawImage(img, col * TS, row * TS, TS, TS, 0, 0, TS, TS);
  let tex = e?.tex;
  if (!tex) {
    tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.real = { ctx: itemCtx(tile) };
  }
  tex.needsUpdate = true;
  icons.set(tile, { tex, version: atlas.version, img });
  return tex;
}

// One lit material per item: the icon under every style but this one, its
// repaint under this one (dressBody swaps them as the style changes).
const itemMats = new Map();
export function itemMaterial(atlas, tile, { vertexColors = false } = {}) {
  const tex = iconTexture(atlas, tile);
  const key = `${tile}:${vertexColors ? 1 : 0}`;
  let m = itemMats.get(key);
  if (!m) {
    m = makeLit({ map: tex, body: true, cutout: true, side: THREE.DoubleSide, vertexColors });
    m.userData.pixelMap = tex;
    m.userData.shared = true;
    itemMats.set(key, m);
  }
  dressBody(m);
  return m;
}

// The atlas in the Realistic style's own light: a block you carry wears the
// photograph the block in the ground does, and a flower the painted flower.
const terrain = new Map();
export function terrainMaterial(atlas, cut = false) {
  const key = `${atlas.uuid}:${cut ? 1 : 0}`;
  let m = terrain.get(key);
  if (!m) {
    m = makeLit({ map: atlas, terrain: true, cutout: cut,
      side: cut ? THREE.DoubleSide : THREE.FrontSide });
    m.userData.shared = true;
    terrain.set(key, m);
  }
  return m;
}

// A copy of `geo` whose UVs run 0..1 across the tile, where the original's
// pointed into the atlas at it — what a texture of the tile's own wants.
export function toTileUV(geo, tile) {
  const [u0, v0] = tileUV(tile, 0, 0);
  const [u1, v1] = tileUV(tile, 1, 1);
  const g = geo.clone();
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - u0) / (u1 - u0), (uv.getY(i) - v0) / (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

// --- a carried thing with a smooth edge ------------------------------------------------
//
// The thing in your fist is its icon extruded: two flats and a wall round
// the outline. Built off the pixel mask, that wall steps round every texel of
// the icon — which under the other styles IS the look — and under this one
// it stood out from the repaint's smooth outline as a row of teeth down the
// haft. So the outline here is the icon's silhouette enlarged EPX-fashion
// (the same smoothing the repaint gives the picture) and
// traced by marching squares: a wall of short straight pieces that follows
// the curve of a pickaxe's head, each taking its colour from just inside it.
// Enlarged to the repaint's own size, or the one line peeks past the other
// in a zip down every diagonal.
function epxMask(key, n) {
  const out = new Uint8Array(n * n * 4);
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : key[y * n + x]);
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

const FRONT = 1.0, SIDE = 0.72;
export function smoothItemGeometry(atlas, tile, size, depth) {
  const tex = iconTexture(atlas, tile);
  const cv = tex.image;
  const TS = cv.width;
  const px = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, TS, TS).data;
  let key = new Uint8Array(TS * TS);
  for (let i = 0; i < TS * TS; i++) key[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  // to the size the repaint is, so its outline and the wall's are one line
  let n = TS;
  const want = TS * Math.max(2, Math.min(8, realBodyMult()));
  while (n < want) { key = epxMask(key, n); n *= 2; }
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : key[y * n + x]);

  const pos = [], uv = [], col = [], idx = [];
  const x0 = -size / 2, y0 = size / 2, hz = depth / 2;
  const X = (sx) => x0 + (sx / n) * size;
  const Y = (sy) => y0 - (sy / n) * size;
  const push = (a, b, c, d, uvs, shade) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
    for (const q of uvs) uv.push(q[0], q[1]);
    for (let i = 0; i < 4; i++) col.push(shade, shade, shade);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // the two flats, the whole tile each; the repaint's alpha cuts them
  push([X(0), Y(n), hz], [X(n), Y(n), hz], [X(n), Y(0), hz], [X(0), Y(0), hz],
    [[0, 0], [1, 0], [1, 1], [0, 1]], FRONT);
  push([X(n), Y(n), -hz], [X(0), Y(n), -hz], [X(0), Y(0), -hz], [X(n), Y(0), -hz],
    [[1, 0], [0, 0], [0, 1], [1, 1]], FRONT);
  // the wall: marching squares over the samples at the texel centres
  for (let y = -1; y < n; y++) {
    for (let x = -1; x < n; x++) {
      const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1);
      const k = a | (b << 1) | (c << 2) | (d << 3);
      if (k === 0 || k === 15) continue;
      // the cell's edge midpoints, in sample space (sample centres at +0.5)
      const T = [x + 1, y + 0.5], R = [x + 1.5, y + 1], B = [x + 1, y + 1.5], L = [x + 0.5, y + 1];
      const segs = {
        1: [[L, T]], 2: [[T, R]], 3: [[L, R]], 4: [[R, B]], 5: [[L, T], [R, B]],
        6: [[T, B]], 7: [[L, B]], 8: [[B, L]], 9: [[B, T]], 10: [[T, R], [B, L]],
        11: [[B, R]], 12: [[R, L]], 13: [[R, T]], 14: [[T, L]],
      }[k];
      for (const [p, q] of segs) {
        // which way is out: toward the empty side of the piece
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        let nx = -(q[1] - p[1]), ny = q[0] - p[0];
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const inside = at(Math.floor(mx - 0.5 - nx * 0.7), Math.floor(my - 0.5 - ny * 0.7));
        let P = p, Q = q;
        if (!inside) { nx = -nx; ny = -ny; P = q; Q = p; }
        // its colour from just inside it
        const u = (mx - nx * 0.9) / n, v = 1 - (my - ny * 0.9) / n;
        push([X(P[0]), Y(P[1]), -hz], [X(Q[0]), Y(Q[1]), -hz], [X(Q[0]), Y(Q[1]), hz],
          [X(P[0]), Y(P[1]), hz], [[u, v], [u, v], [u, v], [u, v]], SIDE);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Dispose a held or dropped thing's materials — all but the shared ones.
export function disposeMats(mats) {
  for (const m of [mats].flat()) if (m && !m.userData?.shared) m.dispose();
}
