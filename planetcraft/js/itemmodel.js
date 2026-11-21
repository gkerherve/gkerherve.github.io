// itemmodel.js — the icon in your fist, with a thickness.
//
// Everything a player holds that is not a block used to be ONE QUAD: the item's
// atlas tile on a plane, scaled up until it filled a third of the screen. Two
// things are wrong with that and they are different problems.
//
// The first is that a quad has no thickness. Held square to the eye it is a
// sticker on the glass; swung, it turns edge on and vanishes for a frame. A
// sword is an object and the one thing the eye asks of an object is which way
// round it is.
//
// The second is resolution, and it is fixed elsewhere — the tool art is drawn
// at the atlas's full 32 now (see the masks in textures.js). This file is the
// first half: it takes the icon and extrudes it, exactly the way Minecraft
// renders an item. Two faces front and back, and a RIM quad wherever a solid
// texel meets a transparent one, so the silhouette is the icon's own outline
// carried through the thickness.
//
// Why this rather than a hand-built rig per weapon, in the manner of
// gunmodels.js: there are forty tools in this game before the hand weapons —
// five shapes across four tiers and four metals — and every one of them
// already has a picture that says exactly what it looks like. A model built
// from that picture cannot disagree with the hotbar, cannot be forgotten when
// a new tier is added, and costs one array lookup per item instead of one
// afternoon.
//
// The rim is shaded like every other face in this game: the two flats full
// bright, the sides down, the top and bottom in between — which is what makes
// a flat picture read as a solid, and it is the same trick the block mesher
// has always used.

import * as THREE from 'three';
import { ATLAS, tileUV } from './textures.js';

// How thick, as a fraction of the icon's width. A sixteenth is Minecraft's
// number and it is the right one: thick enough to catch the light down one
// side, thin enough that a sword still reads as a blade rather than a plank.
export const ITEM_DEPTH = 1 / 16;

// The face shades. Front and back are the picture and must not be tinted or
// the item stops matching its own hotbar slot; the rim is what does the work.
const FACE_FRONT = 1.0;
const FACE_SIDE = 0.66;      // left and right — the strongest cue
const FACE_CAP = 0.84;       // top and bottom

// The alpha above which a texel counts as part of the item. Half: the atlas is
// drawn with hard edges and nothing in it is deliberately half-transparent.
const SOLID = 0.5;

// One mask per (canvas, tile). Reading a 32x32 block of pixels is cheap and
// building the model is rare, but a restyle rebuilds every held item at once
// and the canvas is the same one — so the key carries it and a repaint of the
// atlas in place invalidates nothing it should not.
const _masks = new WeakMap();

// `true` where the tile has something in it. Row 0 is the TOP of the art,
// which is the way the masks in textures.js are written and the way the atlas
// stores them.
function maskOf(image, tile) {
  let byTile = _masks.get(image);
  if (!byTile) _masks.set(image, (byTile = new Map()));
  const hit = byTile.get(tile);
  if (hit) return hit;
  const TS = ATLAS.TS;
  const out = new Uint8Array(TS * TS);
  const ctx = image.getContext?.('2d', { willReadFrequently: true });
  if (ctx) {
    const ox = (tile % ATLAS.COLS) * TS;
    const oy = ((tile / ATLAS.COLS) | 0) * TS;
    const d = ctx.getImageData(ox, oy, TS, TS).data;
    for (let i = 0; i < TS * TS; i++) out[i] = d[i * 4 + 3] > SOLID * 255 ? 1 : 0;
  }
  byTile.set(tile, out);
  return out;
}

// Does this tile have enough in it to be worth extruding? A tile that is
// entirely solid is a block's face and belongs in a cube, and an empty one is
// a tile the atlas has not got — both fall back to the flat quad.
export function canExtrude(image, tile) {
  const m = maskOf(image, tile);
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i];
  return n > 0 && n < m.length;
}

// WHERE THE HAND GOES, read off the picture rather than assumed.
//
// A held tool used to be gripped at one fixed corner of its tile — 28% across
// and 22% up — which is exactly right for a tool drawn corner to corner and
// exactly wrong for one drawn upright. The spear, the club and the hammer are
// all drawn standing up with the haft down the middle, so the fixed corner put
// the pivot in the empty space BESIDE them and they swung about a point they
// did not contain.
//
// The butt of a haft is the bottom of the picture, whatever the picture is. So
// the grip is the middle of the lowest few rows that have anything in them,
// lifted a little into the item so the hand is on the haft and not off the end
// of it. Returned in tile coordinates: x across from the left, y UP from the
// bottom, both 0..1.
export function gripOf(image, tile) {
  const TS = ATLAS.TS;
  const mask = maskOf(image, tile);
  let lowest = -1;
  for (let y = TS - 1; y >= 0 && lowest < 0; y--) {
    for (let x = 0; x < TS; x++) if (mask[y * TS + x]) { lowest = y; break; }
  }
  if (lowest < 0) return { x: 0.28, y: 0.22 };
  // the bottom three rows of the item: enough to find the middle of a haft,
  // few enough that a wide blade further up cannot drag it sideways
  let sum = 0, n = 0;
  for (let y = lowest; y > lowest - 3 && y >= 0; y--) {
    for (let x = 0; x < TS; x++) if (mask[y * TS + x]) { sum += x + 0.5; n++; }
  }
  return {
    x: n ? sum / n / TS : 0.28,
    y: Math.max(0, (TS - 1 - lowest) / TS) + 0.06,
  };
}

// WHICH WAY THE ICON ALREADY POINTS, in radians anticlockwise from the right.
//
// The hand's pose was measured on the tools, which are all drawn corner to
// corner — a quarter turn. The spear, the club and the hammer are drawn
// standing straight up, a half turn, and the same roll applied to them laid
// them flat across the screen pointing backwards. A pose that says "rest the
// point forty-five degrees off vertical" has to know where the point started.
//
// Measured from the grip to the farthest thing in the picture, which for a
// haft-and-head item is the head, and for a sword is the tip.
export function leanOf(image, tile) {
  const TS = ATLAS.TS;
  const mask = maskOf(image, tile);
  const g = gripOf(image, tile);
  const gx = g.x * TS, gy = g.y * TS;         // grip, in texels from bottom left
  // The MIDDLE of the item as seen from the hand, not its farthest corner. The
  // farthest corner is a hammer's outer edge, which points off to one side of
  // a head that is otherwise square on its haft — and a hammer corrected to
  // its own corner ends up lying across the screen, which is the fault this
  // was written to fix.
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      if (!mask[y * TS + x]) continue;
      sx += x + 0.5 - gx;
      sy += (TS - 0.5 - y) - gy;
      n++;
    }
  }
  // ...and SNAPPED to the two stances this game's icons are actually drawn in:
  // corner to corner, or standing straight up. Nothing here is hand-drawn at
  // 63 degrees, so a measurement that answers 63 is measuring the shape of a
  // head rather than the stance of a tool — and letting it through would nudge
  // every sword and pickaxe off a pose that was set with a protractor. The
  // measurement decides WHICH of the two; it does not get to invent a third.
  const a = n ? Math.atan2(sy, sx) : Math.PI / 4;
  return a > Math.PI * 0.375 ? Math.PI / 2 : Math.PI / 4;
}

// Build the model. `size` is the icon's width in blocks; the geometry is
// centred on the origin with +x right, +y up and the thickness on z, which is
// the frame the flat quad had, so everything that posed the quad still works.
//
// Returns { geo, shade } — shade is a Float32Array of per-vertex brightness on
// the `color` attribute, so ONE material draws all three kinds of face.
export function buildItemGeometry(image, tile, size = 0.44,
  depth = size * ITEM_DEPTH) {
  const TS = ATLAS.TS;
  const mask = maskOf(image, tile);
  const solid = (x, y) => (x < 0 || y < 0 || x >= TS || y >= TS
    ? 0 : mask[y * TS + x]);

  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];

  const cell = size / TS;
  const x0 = -size / 2, y0 = size / 2;          // the tile's top left corner
  const hz = depth / 2;
  // texel (x, y) -> its corners in the model's frame. y counts DOWN the art.
  const px = (x) => x0 + x * cell;
  const py = (y) => y0 - y * cell;

  // one quad: four corners, one uv for all of them, one shade
  function quad(a, b, c, d, u, v, shade) {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) {
      uv.push(u, v);
      col.push(shade, shade, shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // The two flats, as single quads with the whole tile on them. The holes are
  // cut by alphaTest rather than by geometry: a quad is two triangles and a
  // per-texel front face would be two thousand.
  // tileUV's v runs UP the tile — v = 0 is the bottom of the picture and 1 the
  // top — while the mask's row 0 is the top. Getting that backwards draws the
  // two flats upside down and leaves the rim, which is placed texel by texel,
  // the right way up: one sword inside the outline of another.
  const [u0, v0] = tileUV(tile, 0, 0);      // bottom left of the tile
  const [u1, v1] = tileUV(tile, 1, 1);      // top right
  {
    const l = px(0), r = px(TS), t = py(0), b = py(TS);
    const base = pos.length / 3;
    // front (+z), wound anticlockwise seen from +z
    pos.push(l, b, hz, r, b, hz, r, t, hz, l, t, hz);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let i = 0; i < 4; i++) col.push(FACE_FRONT, FACE_FRONT, FACE_FRONT);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    const back = pos.length / 3;
    pos.push(r, b, -hz, l, b, -hz, l, t, -hz, r, t, -hz);
    uv.push(u1, v0, u0, v0, u0, v1, u1, v1);
    for (let i = 0; i < 4; i++) col.push(FACE_FRONT, FACE_FRONT, FACE_FRONT);
    idx.push(back, back + 1, back + 2, back, back + 2, back + 3);
  }

  // The rim. A quad wherever a solid texel has a transparent neighbour, taking
  // its colour from the texel it belongs to — so the edge of a blade is the
  // colour of the edge of the blade and not an average of the whole icon.
  //
  // Not merged into runs. A tool's outline is a hundred texels and a hundred
  // quads is nothing, and per-texel colour is most of what makes the rim read
  // as a bevel rather than as a painted stripe.
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      if (!solid(x, y)) continue;
      // the texel's own centre, in tile-local 0..1, v measured from the BOTTOM
      const [tu, tv] = tileUV(tile, (x + 0.5) / TS, 1 - (y + 0.5) / TS);
      const l = px(x), r = px(x + 1), t = py(y), b = py(y + 1);
      if (!solid(x - 1, y)) {
        quad([l, b, -hz], [l, b, hz], [l, t, hz], [l, t, -hz],
          tu, tv, FACE_SIDE);
      }
      if (!solid(x + 1, y)) {
        quad([r, b, hz], [r, b, -hz], [r, t, -hz], [r, t, hz],
          tu, tv, FACE_SIDE);
      }
      if (!solid(x, y - 1)) {
        quad([l, t, hz], [r, t, hz], [r, t, -hz], [l, t, -hz],
          tu, tv, FACE_CAP);
      }
      if (!solid(x, y + 1)) {
        quad([l, b, -hz], [r, b, -hz], [r, b, hz], [l, b, hz],
          tu, tv, FACE_CAP);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  return geo;
}
