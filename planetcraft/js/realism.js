// realism.js — the Realistic style's photographs, and the light they are seen in.
//
// Two jobs, both only while the Realistic style is chosen.
//
// THE PHOTOGRAPHS. Every common block wears a scanned material — colour,
// normal and roughness — baked into textures/real/ by
// tools/bake_real_textures.py (where each one comes from is in the CREDITS
// file beside them). This file loads them, lays the things no photograph has
// on top (ore in the rock, turf over the soil, the bark round a log's end —
// see realtex.js), and packs the lot into two texture ARRAYS at 256 texels a
// block: colour, and normal + roughness. An array rather than the atlas for
// one reason that matters a great deal at this resolution — each layer gets
// its own mipmaps and its own wrapping, so a hillside seen from across a
// valley is filtered down properly instead of shimmering, and the filter
// never reaches over the edge of one tile into the next.
//
// It also writes a 32-texel copy of each photograph into the ordinary atlas
// (textures.js paints it in), so the block in your hand, the slot in your
// hotbar and the log falling off a tree are the same photograph as the ground.
//
// Nothing waits on any of this. Until the photographs are up the style draws
// its old pixel art under the new light, and if a file is missing that tile
// simply stays pixel art — `uRealReady` and each tile's props decide.
//
// THE LIGHT. The sun (or, once it is down, the moon) as a key light whose
// colour and strength follow its height in the sky, and the sky and the
// ground as the fill — see updateRealLight. lit.js does the arithmetic.

import * as THREE from 'three';
import { TILE, ATLAS, setRealTiles, tilePaintings, generatedTile } from './textures.js';
import {
  REAL_N as FULL_N, fromPhoto, logTop, birchBark, ice, ore, ORE, metalBlock, leaves,
  tuft, grassSide, pathSide, furrows, layersOf, shrinkLayer, meanLinear, RINGS,
  door, chest, craftTop, craftSide, bookshelf, furnaceFront, furnaceTop,
  lanternGlass, flame, bell, glassPane, ladder,
} from './realtex.js';
import { realShared } from './lit.js';
import {
  poppy, buttercup, cornflower, mushroom, sapling, wheat, carrot, potato, pepper,
  salad, pumpkin, watermelon, bamboo, torchIcon, lava, diamondBlock, coinDie,
  stainedGlass,
} from './realplants.js';

const DIR = 'textures/real/';

// Texels a block for the build in progress: 256 at full detail, down to 16 at
// the lowest (REAL_DETAIL in textures.js), and every material below is made at
// whatever this is when the build reaches it — the photographs are shrunk to
// it on the way in and the painted materials are painted at it.
let N_ = FULL_N;

// Tile name -> how it is made.
//   photo   a baked photograph by file name
//   K       how many blocks it covers per side. 2 means the photograph is
//           cut in four and the mesher deals the quarters out by cell, so the
//           ground repeats every two metres instead of every one
//   make    built from other materials: `from` names them (a photograph, or
//           '@TILE' for another built material)
//   tint    a tile that shares another's layers in a colour of its own
//   macroTone  how much of the slow world-scale tone variation it takes
const NATURE = 1, BUILT = 0.45;
const MATS = {
  GRASS_TOP: { photo: 'grass', K: 2, tone: NATURE },
  DIRT: { photo: 'dirt', K: 2, tone: NATURE },
  GRASS_SIDE: { from: ['dirt', 'grass'], K: 2, tone: NATURE,
    make: (d, g) => grassSide(d, g, 7, 2) },
  PATH: { photo: 'path', K: 2, tone: NATURE },
  PATH_SIDE: { from: ['dirt', 'path'], K: 2, tone: NATURE,
    make: (d, p) => pathSide(d, p, 8, 2) },
  TILLED: { from: ['tilled'], K: 1, tone: NATURE, make: (t) => furrows(t, 9) },
  CLAY: { photo: 'clay', K: 2, tone: NATURE },
  SNOW: { photo: 'snow', K: 2, tone: 0.3 },
  SAND: { photo: 'sand', K: 2, tone: NATURE },
  SAND_ORANGE: { photo: 'red_sand', K: 2, tone: NATURE },
  GRAVEL: { photo: 'gravel', K: 2, tone: NATURE },
  STONE: { photo: 'stone', K: 2, tone: NATURE },
  COBBLE: { photo: 'ashlar', K: 2, tone: BUILT },
  COBBLESTONE: { photo: 'cobbles', K: 2, tone: BUILT },
  COBBLESTONE_MOSSY: { photo: 'cobbles_moss', K: 2, tone: BUILT },
  COBBLESTONE_DARK: { photo: 'cobbles_dark', K: 2, tone: BUILT },
  BRICK: { photo: 'brick', K: 2, tone: BUILT },
  THATCH: { photo: 'thatch', K: 2, tone: BUILT },
  ICE: { K: 1, make: () => ice(N_, 10), tone: 0.3 },
  // the timbers
  LOG_SIDE: { photo: 'bark_oak', K: 1, tone: BUILT },
  LOG_SIDE_BIRCH: { K: 1, make: () => birchBark(N_, 21), tone: BUILT },
  LOG_SIDE_SPRUCE: { photo: 'bark_spruce', K: 2, tone: BUILT },
  LOG_SIDE_ACACIA: { photo: 'bark_acacia', K: 1, tone: BUILT },
  LOG_SIDE_DARK: { photo: 'bark_dark', K: 1, tone: BUILT },
  LOG_TOP: { from: ['bark_oak'], K: 1, make: (b) => logTop(N_, 31, RINGS.oak, b) },
  LOG_TOP_BIRCH: { from: ['@LOG_SIDE_BIRCH'], K: 1,
    make: (b) => logTop(N_, 32, RINGS.birch, b) },
  LOG_TOP_SPRUCE: { from: ['bark_spruce'], K: 1,
    make: (b) => logTop(N_, 33, RINGS.spruce, b) },
  LOG_TOP_ACACIA: { from: ['bark_acacia'], K: 1,
    make: (b) => logTop(N_, 34, RINGS.acacia, b) },
  LOG_TOP_DARK: { from: ['bark_dark'], K: 1, make: (b) => logTop(N_, 35, RINGS.dark, b) },
  PLANK: { photo: 'planks_oak', K: 2, tone: BUILT },
  PLANK_BIRCH: { photo: 'planks_birch', K: 1, tone: BUILT },
  PLANK_SPRUCE: { photo: 'planks_spruce', K: 2, tone: BUILT },
  PLANK_ACACIA: { photo: 'planks_acacia', K: 2, tone: BUILT },
  PLANK_DARK: { photo: 'planks_dark', K: 2, tone: BUILT },
  // foliage
  LEAF: { K: 1, make: () => leaves(N_, 18), foliage: 1, tone: NATURE },
  LEAF_FAR: { K: 1, make: () => leaves(N_, 18, true), foliage: 1, tone: NATURE },
  TUFT: { from: ['grass'], K: 1, make: (g) => tuft(N_, 19, g), foliage: 1, tone: NATURE },
};
// the ores, each in the stone photograph
for (const [name, spec] of Object.entries(ORE)) {
  MATS[name] = { from: ['stone'], K: 2, tone: NATURE, metalMask: spec.metal > 0,
    make: (rock) => ore(rock, 300 + name.length * 7, spec, N_) };
}
// the storage blocks
const METALS = {
  BLOCK_IRON: ['a9aeb4', 0.34], BLOCK_SILVER: ['d9dde2', 0.26],
  BLOCK_GOLD: ['e3be55', 0.24], BLOCK_BRASS: ['d1bf6c', 0.3],
  BLOCK_COPPER: ['c9794e', 0.32], BLOCK_BRONZE: ['a97a3d', 0.36],
  BLOCK_ZINC: ['9aaab9', 0.34], BLOCK_TIN: ['c9c5b5', 0.3],
};
for (const [name, [c, r]] of Object.entries(METALS)) {
  MATS[name] = { K: 1, metal: 1, make: () => metalBlock(N_, 400 + name.length, c, r) };
}
// The made things: doors in each timber, the chest, the workbench, the
// bookcase, the furnace, the lantern and its flame, the bell, glass and the
// ladder — built out of the photographs above (see the fixtures in
// realtex.js), so a door is its own species' boards and a furnace is the
// ashlar the walls are laid in.
const DOOR_WOOD = [['OAK', 'planks_oak'], ['BIRCH', 'planks_birch'],
  ['SPRUCE', 'planks_spruce'], ['ACACIA', 'planks_acacia'], ['DARK', 'planks_dark']];
DOOR_WOOD.forEach(([t, p], i) => {
  MATS[`DOOR_${t}_BOT`] = { from: [p], K: 1, metalMask: true, tone: BUILT,
    make: (pl) => door(N_, 60 + i * 2, pl, 'bot') };
  MATS[`DOOR_${t}_TOP`] = { from: [p], K: 1, metalMask: true, tone: BUILT,
    make: (pl) => door(N_, 61 + i * 2, pl, 'top') };
});
MATS.DOOR_IRON_BOT = { from: ['planks_oak'], K: 1, metalMask: true,
  make: (pl) => door(N_, 80, pl, 'bot', { metal: '9aa1a9' }) };
MATS.DOOR_IRON_TOP = { from: ['planks_oak'], K: 1, metalMask: true,
  make: (pl) => door(N_, 81, pl, 'top', { metal: '9aa1a9' }) };
MATS.DOOR_GLASS_BOT = { from: ['planks_oak'], K: 1, metalMask: true, tone: BUILT,
  make: (pl) => door(N_, 82, pl, 'bot') };
MATS.DOOR_GLASS_TOP = { from: ['planks_oak'], K: 1, tone: BUILT,
  make: (pl) => door(N_, 83, pl, 'top', { glass: true }) };
MATS.CHEST = { from: ['planks_oak'], K: 1, metalMask: true, tone: BUILT,
  make: (pl) => chest(N_, 90, pl) };
MATS.CRAFT_TOP = { from: ['planks_oak'], K: 1, tone: BUILT, make: (pl) => craftTop(N_, 91, pl) };
MATS.CRAFT_SIDE = { from: ['planks_oak'], K: 1, tone: BUILT, make: (pl) => craftSide(N_, 92, pl) };
MATS.BOOKSHELF = { from: ['planks_oak'], K: 1, tone: BUILT, make: (pl) => bookshelf(N_, 93, pl) };
MATS.FURNACE_SIDE = { photo: 'ashlar', K: 2, tone: BUILT };
MATS.FURNACE_FRONT = { from: ['ashlar'], K: 1, metalMask: true, tone: BUILT,
  make: (st) => furnaceFront(N_, 94, st) };
MATS.FURNACE_TOP = { from: ['ashlar'], K: 1, metalMask: true, tone: BUILT,
  make: (st) => furnaceTop(N_, 95, st) };
MATS.LANTERN = { K: 1, metalMask: true, glow: 0.8, make: () => lanternGlass(N_, 96) };
MATS.LANTERN_CAP = { K: 1, metal: 1, make: () => metalBlock(N_, 97, '2c2d31', 0.45) };
MATS.FLAME = { K: 1, glow: 1.0, make: () => flame(N_, 98) };
MATS.BELL = { K: 1, metalMask: true, make: () => bell(N_, 99) };
MATS.GLASS = { K: 1, make: () => glassPane(N_, 100) };
MATS.LADDER = { from: ['planks_oak'], K: 1, make: (pl) => ladder(N_, 101, pl) };

// The plants: every flower, crop and sprout the world grows, painted as the
// plant at full size (see realplants.js), each a cut-out the wind moves.
const PLANT = { K: 1, foliage: 1, tone: 0.5 };
MATS.FLOWER_RED = { ...PLANT, make: () => poppy(N_) };
MATS.FLOWER_YELLOW = { ...PLANT, make: () => buttercup(N_) };
MATS.FLOWER_BLUE = { ...PLANT, make: () => cornflower(N_) };
MATS.MUSHROOM = { ...PLANT, foliage: 0, make: () => mushroom(N_) };
MATS.SAPLING = { ...PLANT, make: () => sapling(N_) };
MATS.WHEAT_YOUNG = { ...PLANT, make: () => wheat(N_, false) };
MATS.WHEAT = { ...PLANT, make: () => wheat(N_, true) };
MATS.CARROT_YOUNG = { ...PLANT, make: () => carrot(N_, false) };
MATS.CARROT_TOP = { ...PLANT, make: () => carrot(N_, true) };
MATS.POTATO_YOUNG = { ...PLANT, make: () => potato(N_, false) };
MATS.POTATO_TOP = { ...PLANT, make: () => potato(N_, true) };
MATS.PEPPER_YOUNG = { ...PLANT, make: () => pepper(N_, false) };
MATS.PEPPER_TOP = { ...PLANT, make: () => pepper(N_, true) };
MATS.SALAD_YOUNG = { ...PLANT, make: () => salad(N_, false) };
MATS.SALAD_TOP = { ...PLANT, make: () => salad(N_, true) };
MATS.PUMPKIN_YOUNG = { ...PLANT, make: () => pumpkin(N_, false) };
MATS.PUMPKIN_TOP = { ...PLANT, make: () => pumpkin(N_, true) };
MATS.WATERMELON_YOUNG = { ...PLANT, make: () => watermelon(N_, false) };
MATS.WATERMELON_TOP = { ...PLANT, make: () => watermelon(N_, true) };
MATS.BAMBOO = { ...PLANT, make: () => bamboo(N_) };
// the torch as it is carried (in the world it is a stick and a flame, both
// already built): only its burning head glows — `glowMask` reads the texels
MATS.TORCH = { K: 1, glow: 1.0, glowMask: true, make: () => torchIcon(N_) };
MATS.LAVA = { K: 1, glow: 1.0, make: () => lava(N_) };
MATS.BLOCK_DIAMOND = { K: 1, make: () => diamondBlock(N_) };
MATS.MINT_DIE = { K: 1, metalMask: true, make: () => coinDie(N_) };
// stained glass, in the colours a church's bands are laid in
const STAINED = { WHITE: 'dfe6ea', RED: 'b02a22', ORANGE: 'd06a1a', YELLOW: 'd9b52a',
  GREEN: '2e7d3c', BLUE: '2a4fae', PURPLE: '6b2c96', BLACK: '2a2a31' };
Object.entries(STAINED).forEach(([t, c], i) => {
  MATS[`GLASS_${t}`] = { K: 1, make: () => stainedGlass(N_, c, 220 + i) };
});

// cement and wool: one photograph each, worn in every colour the style
// already paints those blocks in
const CEMENTS = ['WHITE', 'RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE',
  'BLACK', 'GREY_LIGHT', 'GREY', 'GREY_DARK'];
for (const t of CEMENTS) MATS[`CEMENT_${t}`] = { photo: 'plaster', K: 2, tint: true, tone: BUILT };
const WOOLS = ['WHITE', 'RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE',
  'BLACK', 'BROWN', 'GREY'];
for (const t of WOOLS) MATS[`WOOL_${t}`] = { photo: 'wool', K: 1, tint: true, tone: BUILT };

// Tiles that stay pixel art but still need to behave: what glows, what is a
// plant, what shines.
const FOLIAGE = ['FLOWER_RED', 'FLOWER_YELLOW', 'FLOWER_BLUE', 'MUSHROOM', 'SAPLING',
  'WHEAT', 'WHEAT_YOUNG', 'CARROT_YOUNG', 'CARROT_TOP', 'POTATO_YOUNG', 'POTATO_TOP',
  'PEPPER_YOUNG', 'PEPPER_TOP', 'SALAD_YOUNG', 'SALAD_TOP', 'PUMPKIN_YOUNG',
  'PUMPKIN_TOP', 'WATERMELON_YOUNG', 'WATERMELON_TOP'];
const GLOW = { FLAME: 1.0, LANTERN: 0.8 };
const GLOSSY = { GLASS: 0.06, LANTERN: 0.2, BELL: 0.3, DOOR_GLASS_BOT: 0.1, DOOR_GLASS_TOP: 0.1,
  DOOR_IRON_BOT: 0.35, DOOR_IRON_TOP: 0.35, LANTERN_CAP: 0.4 };
for (const k of Object.keys(TILE)) if (k.startsWith('GLASS_')) GLOSSY[k] = 0.06;

// Which tiles the mesher must deal out by cell, and in how many quarters.
// Known before a single photograph has loaded, so the chunks are meshed once.
export function macroTiles() {
  const m = new Map();
  for (const [name, spec] of Object.entries(MATS)) {
    if (spec.K > 1 && TILE[name] != null) m.set(TILE[name], spec.K);
  }
  return m;
}

// --- loading ---------------------------------------------------------------------

async function loadPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const blob = await res.blob();
  // no colour management: half of what is loaded here is a normal map, and a
  // normal passed through a display profile points somewhere else
  const bmp = await createImageBitmap(blob,
    { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height).data;
  bmp.close?.();
  const w = cv.width, h = cv.height;
  // a canvas keeps its pixels until it is collected, which on WebKit is
  // later than anybody would like: give them back now
  cv.width = cv.height = 0;
  return { w, h, data };
}

// A photograph as bytes — colour and normal/roughness — at the build's size.
// Kept as bytes until a tile wants it: the Mat a tile is painted on is floats,
// eight times the memory, and made only when needed (see loadReal).
async function loadPhotoPixels(name, N) {
  const [col, nr] = await Promise.all([
    loadPixels(`${DIR}${name}.jpg`), loadPixels(`${DIR}${name}_nr.jpg`),
  ]);
  // baked at FULL_N a block; a lower build takes every f-th texel's worth
  const f = Math.max(1, Math.round(FULL_N / N));
  if (f === 1) return { col: col.data, nr: nr.data, w: col.w };
  return { col: shrinkPixels(col.data, col.w, f, true),
    nr: shrinkPixels(nr.data, nr.w, f, false), w: col.w / f };
}

// Hand the page back to the browser every few milliseconds of building, so a
// frame gets drawn in between. The build used to hold the page for three
// seconds in one piece — a frozen game, the moment a world opened or the
// style was chosen, which a player can only describe as it stopping.
//
// A message to itself rather than a timer or a frame: a timer is clamped to
// four milliseconds and more, and waiting for a whole frame stretched a
// one-second build over ten while the world was loading. A message comes
// straight back — after whatever the browser has waiting, which is the
// frame when one is due.
const _yield = (() => {
  if (typeof MessageChannel !== 'function') return () => new Promise((r) => setTimeout(r, 0));
  const ch = new MessageChannel();
  const waiting = [];
  ch.port1.onmessage = () => waiting.shift()?.();
  return () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
})();
function makeYielder(ms = 12) {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < ms) return;
    await _yield();
    last = performance.now();
  };
}

// Box-filter RGBA bytes down by a whole factor: colour averaged in linear
// light (averaging sRGB darkens every fine mark), anything else as it is.
const SRGB_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB_LIN[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function shrinkPixels(data, w, f, srgb) {
  const n = w / f;
  const out = new Uint8ClampedArray(n * n * 4);
  const inv = 1 / (f * f);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < f; j++) {
        let o = ((y * f + j) * w + x * f) * 4;
        for (let i = 0; i < f; i++, o += 4) {
          if (srgb) { r += SRGB_LIN[data[o]]; g += SRGB_LIN[data[o + 1]]; b += SRGB_LIN[data[o + 2]]; }
          else { r += data[o]; g += data[o + 1]; b += data[o + 2]; }
          a += data[o + 3];
        }
      }
      const d = (y * n + x) * 4;
      if (srgb) {
        const enc = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
        out[d] = enc(r * inv); out[d + 1] = enc(g * inv); out[d + 2] = enc(b * inv);
      } else {
        out[d] = r * inv; out[d + 1] = g * inv; out[d + 2] = b * inv;
      }
      out[d + 3] = a * inv;
    }
  }
  return out;
}

// --- the state --------------------------------------------------------------------

const state = {
  loading: null,        // the promise of the build in hand
  N: 0,                 // the resolution that build is for
  build: 0,             // which build is the latest; an older one finishing late is dropped
  ready: false,
  albedo: null, mat: null, props: null,
  layers: 0, ms: 0, missing: [], times: {},
};

// For a check: the full-resolution layers a tile wears, straight out of the
// arrays — colour and normal/roughness, rows bottom first as uploaded.
export function realLayers(tile) {
  if (!state.ready || !state.cpu) return null;
  const base = propsData[(0 * COUNT + tile) * 4], K = propsData[(0 * COUNT + tile) * 4 + 1];
  if (base < 0) return null;
  const N = state.N, n = N * N * 4;
  const out = [];
  for (let q = 0; q < K * K; q++) {
    const o = (base + q) * n;
    out.push({ rgba: state.albedo.image.data.subarray(o, o + n),
      mat: state.mat.image.data.subarray(o, o + n) });
  }
  return { N, K, layers: out };
}

export const realStatus = () => ({
  ready: state.ready, N: state.N, layers: state.layers, ms: state.ms,
  missing: state.missing.slice(),
  painted: state.painted ?? 0,
  times: { ...state.times },
  slow: (state.slow ?? []).slice(),
  // what the two arrays take on the card, mipmaps and all
  mb: Math.round((state.N * state.N * 4 * state.layers * 2 * 4) / 3 / 1048576),
  loading: !!state.loading && !state.ready,
});

// The props texture: three rows of one texel per tile.
//   row 0  first layer (or -1: this tile is still pixel art), K, metal,
//          1 if the colour's alpha carries metal
//   row 1  foliage, glow, roughness for a pixel-art tile, world tone amount
//   row 2  the tint the layers are worn in
const COUNT = ATLAS.COUNT;
const propsData = new Float32Array(COUNT * 3 * 4);
// A build writes the props it is making into a copy of its own and hands them
// over in the same moment as the arrays they index: written straight into the
// live ones, a rebuild that laid its layers in a different order (a painting
// in the middle of them) had every tile after it wearing the wrong layer of
// the OLD arrays for as long as the build took.
function prop(tile, row, v, into = propsData) { into.set(v, (row * COUNT + tile) * 4); }
function resetProps(into = propsData) {
  for (let t = 0; t < COUNT; t++) {
    prop(t, 0, [-1, 1, 0, 0], into);
    prop(t, 1, [0, 0, 0.82, 0], into);
    prop(t, 2, [1, 1, 1, 1], into);
  }
  for (const n of FOLIAGE) if (TILE[n] != null) prop(TILE[n], 1, [1, 0, 0.7, 0.6], into);
  for (const [n, g] of Object.entries(GLOW)) {
    if (TILE[n] != null) prop(TILE[n], 1, [0, g, 0.5, 0], into);
  }
  for (const [n, r] of Object.entries(GLOSSY)) {
    if (TILE[n] == null) continue;
    const i = ((1 * COUNT) + TILE[n]) * 4;
    into[i + 2] = r;
  }
}
resetProps();

// How a tile is worn, off its props — for the block maker, which shows a
// layer as the world shows it: a metal-in-alpha tile opaque, a tinted one in
// its tint.
export function realTileInfo(tile) {
  const at = (row, i) => propsData[(row * COUNT + tile) * 4 + i];
  return {
    layer: at(0, 0), K: at(0, 1),
    metalMask: at(0, 3) > 0.5 && at(0, 3) < 1.5, glowMask: at(0, 3) > 1.5,
    tint: [at(2, 0), at(2, 1), at(2, 2)],
    rough: at(1, 2),
  };
}
const propsTex = new THREE.DataTexture(propsData, COUNT, 3, THREE.RGBAFormat, THREE.FloatType);
propsTex.magFilter = propsTex.minFilter = THREE.NearestFilter;
propsTex.generateMipmaps = false;
propsTex.needsUpdate = true;
realShared.uRealProps.value = propsTex;
realShared.uRealGrid.value.set(ATLAS.COLS, ATLAS.ROWS);
realShared.uRealInset.value = 0.5 / ATLAS.TS;

// A 1x1x1 array until the photographs are up, so the samplers are never
// unbound (an unbound sampler2DArray is an error on some drivers).
function emptyArray(srgb) {
  const t = new THREE.DataArrayTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, 1);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
realShared.uRealAlb.value = emptyArray(true);
realShared.uRealMat.value = emptyArray(false);

// --- paintings ---------------------------------------------------------------------
//
// What somebody painted on this style in the block maker (blocks.html; the
// records are kept by textures.js). A painting is laid OVER the layers of the
// tile it was painted on, in the build, so the ground, the hotbar and the
// block in your hand all wear it, and wear it lit: the texels nobody painted
// stay the photograph, relief and all, and a two-block photograph keeps its
// two-block repeat under the paint — each of its quarters takes the painting
// in the same place on the block.
//
// The game fetches the records at start-up while the photographs load;
// `waitForPaintings` is the fetch, so the first build has them rather than
// being thrown away for a second one. Never more than a few seconds of it:
// a painting is a nicety, and the ground is not.
let paintWait = null;
export function waitForPaintings(p) {
  paintWait = Promise.race([Promise.resolve(p).catch(() => {}),
    new Promise((r) => setTimeout(r, 4000))]);
}

// A saved record as texels: what was painted and a mask of where, at the size
// it was painted. The first kind (32 texels, from the old board) was painted
// everywhere, a transparent texel included.
export async function decodePainting(o) {
  if (o.version === 2) {
    const [p, m] = await Promise.all([loadPixels(o.paint), loadPixels(o.mask)]);
    if (p.w !== p.h || m.w !== p.w || m.h !== p.h) throw new Error('painting and mask differ');
    const n = p.w, mask = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) mask[k] = m.data[k * 4] > 127 ? 1 : 0;
    return { tile: o.tile, n, rgba: new Uint8ClampedArray(p.data), mask };
  }
  const n = ATLAS.TS, rgba = new Uint8ClampedArray(n * n * 4);
  let i = 0;
  for (const [idx, cnt] of o.runs ?? []) {
    const c = o.palette?.[idx];
    for (let k = 0; k < cnt && i < n * n; k++, i++) {
      if (!c) continue;
      rgba.set([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16), 255], i * 4);
    }
  }
  return { tile: o.tile, n, rgba, mask: new Uint8Array(n * n).fill(1) };
}

// ...at the build's own size: shrunk the way the photographs are (colour
// averaged in linear light over the texels that were painted, and the mask
// becoming how much of each texel was), or grown texel for texel, which keeps
// a painting's edges as hard as they were drawn.
function fitPainting(p, N) {
  const { n } = p;
  const rgba = new Uint8ClampedArray(N * N * 4);
  const cover = new Float32Array(N * N);
  if (n <= N) {
    const f = N / n;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const s = ((y / f) | 0) * n + ((x / f) | 0), d = y * N + x;
        if (!p.mask[s]) continue;
        cover[d] = 1;
        rgba.set(p.rgba.subarray(s * 4, s * 4 + 4), d * 4);
      }
    }
    return { rgba, cover };
  }
  const f = n / N;
  const enc = (v) => Math.round((v <= 0.0031308 ? v * 12.92
    : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const s = (y * f + j) * n + x * f + i;
          if (!p.mask[s]) continue;
          const o = s * 4, al = p.rgba[o + 3] / 255;
          r += SRGB_LIN[p.rgba[o]] * al; g += SRGB_LIN[p.rgba[o + 1]] * al;
          b += SRGB_LIN[p.rgba[o + 2]] * al; a += al; c++;
        }
      }
      const d = y * N + x;
      cover[d] = c / (f * f);
      if (!c) continue;
      const inv = a > 1e-4 ? 1 / a : 0;
      rgba[d * 4] = enc(r * inv); rgba[d * 4 + 1] = enc(g * inv); rgba[d * 4 + 2] = enc(b * inv);
      rgba[d * 4 + 3] = Math.round((a / c) * 255);
    }
  }
  return { rgba, cover };
}

// Lay a fitted painting over one layer ({ rgba, mat }, rows top first), in
// place. `tint` first bakes a shared photograph's colour into the ground, since
// a painted tile stops sharing it. On a tile whose alpha is metal, paint is
// paint and not metal, and it cannot make a hole. The painted texels take a
// gentle relief of their own out of their light and dark — only between
// painted texels, so a mark does not stand up off the stone like a sticker —
// and keep the material's roughness under them.
function paintOver(layer, fit, N, { tint = null, metalMask = false } = {}) {
  const { rgba, mat } = layer;
  const { cover } = fit, prgb = fit.rgba;
  const lum = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) {
    const o = k * 4;
    lum[k] = (0.3 * prgb[o] + 0.59 * prgb[o + 1] + 0.11 * prgb[o + 2]) / 255;
  }
  const enc = (v) => Math.round((v <= 0.0031308 ? v * 12.92
    : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  const DEPTH = 1.6;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x, o = k * 4;
      if (tint) {
        rgba[o] = enc(Math.min(1, SRGB_LIN[rgba[o]] * tint[0]));
        rgba[o + 1] = enc(Math.min(1, SRGB_LIN[rgba[o + 1]] * tint[1]));
        rgba[o + 2] = enc(Math.min(1, SRGB_LIN[rgba[o + 2]] * tint[2]));
      }
      const c = cover[k];
      if (c <= 0) continue;
      const pa = prgb[o + 3];
      if (metalMask && pa < 128) continue;
      rgba[o] = mix(rgba[o], prgb[o], c);
      rgba[o + 1] = mix(rgba[o + 1], prgb[o + 1], c);
      rgba[o + 2] = mix(rgba[o + 2], prgb[o + 2], c);
      rgba[o + 3] = mix(rgba[o + 3], metalMask ? 255 : pa, c);
      // a sobel over the painted texels only, wrapped as the tile wraps
      const h = (dx, dy) => {
        const j = (((y + dy + N) % N) * N + ((x + dx + N) % N));
        return cover[j] > 0 ? lum[j] : lum[k];
      };
      const hx = (h(1, -1) + 2 * h(1, 0) + h(1, 1) - h(-1, -1) - 2 * h(-1, 0) - h(-1, 1)) / 8;
      const hy = (h(-1, 1) + 2 * h(0, 1) + h(1, 1) - h(-1, -1) - 2 * h(0, -1) - h(1, -1)) / 8;
      let nx = -hx * DEPTH, ny = hy * DEPTH;
      const nl = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= nl; ny /= nl;
      mat[o] = mix(mat[o], (nx * 0.5 + 0.5) * 255, c);
      mat[o + 1] = mix(mat[o + 1], (ny * 0.5 + 0.5) * 255, c);
    }
  }
}

// The ground for a painting on a tile with no photograph: the style's own
// pixel art, grown texel for texel to the build's size, flat, at the
// roughness the style gives that tile.
function pixelLayer(px, N, rough) {
  const n = ATLAS.TS, f = N / n;
  const rgba = new Uint8ClampedArray(N * N * 4), mat = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const s = (Math.floor(y / f) * n + Math.floor(x / f)) * 4, d = (y * N + x) * 4;
      rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = px[s + 3];
      mat[d] = 128; mat[d + 1] = 128; mat[d + 2] = Math.round(rough * 255); mat[d + 3] = 128;
    }
  }
  return { rgba, mat };
}

const hasHoles = (rgba) => {
  for (let o = 3; o < rgba.length; o += 4) if (rgba[o] < 250) return true;
  return false;
};

// --- building --------------------------------------------------------------------

// Start loading, if it has not started. `atlasTile(name)` gives the style's
// own 32-texel pixels for a tile (to take cement's colours from);
// `onReady()` is called once everything is on the GPU. `paint: false` leaves
// the block maker's paintings off — the block maker lays them on itself, over
// the bare photograph, which is what it has to compare a board against.
export function loadReal({
  renderer, atlasTile, onReady, N = FULL_N, rebuild = false, paint = true,
}) {
  if (state.loading && state.N === N && !rebuild) {
    if (state.ready) onReady?.();
    else state.loading.then(() => onReady?.());
    return state.loading;
  }
  // a new resolution (or the card lost what it had): build again, and let
  // whatever the last build was finish into nothing
  const buildId = ++state.build;
  state.N = N;
  state.missing = [];
  state.times = {};
  state.slow = [];
  const t0 = performance.now();
  state.loading = (async () => {
    const pause = makeYielder(24);
    // Every photograph named anywhere in the table, fetched at once and kept
    // as bytes; how many tiles want each, so its Mat can be let go as soon
    // as the last of them is built. The build used to hold every photograph
    // as floats and every tile's layers and both finished arrays all at the
    // same moment — over a gigabyte, for a few seconds, which is exactly
    // when a Mac short of memory ends a page.
    const photoUses = new Map(), madeUses = new Map();
    const use = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);
    for (const spec of Object.values(MATS)) {
      if (spec.photo) use(photoUses, spec.photo);
      for (const f of spec.from ?? []) {
        if (f.startsWith('@')) use(madeUses, f.slice(1));
        else use(photoUses, f);
      }
    }
    const pixels = new Map();
    await Promise.all([...photoUses.keys()].map(async (n) => {
      try { pixels.set(n, await loadPhotoPixels(n, N)); }
      catch (e) { state.missing.push(n); }
    }));
    if (buildId !== state.build) return;
    // the paintings, each brought to this build's size (see paintOver)
    const fits = new Map();
    if (paint) {
      if (paintWait) await paintWait;
      await Promise.all(tilePaintings('real').map(async (o) => {
        try {
          const p = await decodePainting(o);
          if (p.tile >= 0 && p.tile < COUNT) fits.set(p.tile, fitPainting(p, N));
        } catch (e) { state.missing.push(`painting ${o.tileName ?? o.tile}`); }
      }));
      if (buildId !== state.build) return;
    }
    state.painted = fits.size;
    // what the style's own art is for a tile, before any of this: what a
    // tinted tile takes its colour from, and what a painting on a tile with
    // no photograph is laid over
    const ownArt = (tile) => generatedTile(tile, 'real') ?? atlasTile?.(tile) ?? null;
    const next = new Float32Array(propsData.length);
    resetProps(next);
    N_ = N;
    const t1 = performance.now();
    state.times.load = Math.round(t1 - t0);

    const photoMats = new Map();
    const photo = (n) => {
      if (photoMats.has(n)) return photoMats.get(n);
      const px = pixels.get(n);
      const m = px ? fromPhoto(px.col, px.nr, px.w) : null;
      photoMats.set(n, m);
      return m;
    };
    const usedPhoto = (n) => {
      const c = (photoUses.get(n) ?? 1) - 1;
      photoUses.set(n, c);
      if (c <= 0) { photoMats.delete(n); pixels.delete(n); }
    };
    // build every material: a photograph as it is, or made from others
    const built = new Map();
    const build = (name) => {
      if (built.has(name)) return built.get(name);
      const spec = MATS[name];
      let m = null;
      if (spec.photo) m = photo(spec.photo);
      else if (spec.make) {
        const deps = (spec.from ?? []).map((f) => (f.startsWith('@')
          ? build(f.slice(1)) : photo(f)));
        if (deps.every(Boolean)) m = spec.make(...deps);
      }
      built.set(name, m);
      return m;
    };

    // one set of layers per distinct material, however many tiles wear it:
    // a photograph's by its name, a made material's by its tile
    const layerOf = new Map();       // key -> { base, K, layers }
    const all = [];
    const tints = new Map();
    const processed = new Set();
    const done = new Set();          // painted tiles laid in
    for (const [name, spec] of Object.entries(MATS)) {
      const tile = TILE[name];
      const tm = performance.now();
      if (tile != null) {
        const fit = fits.get(tile);
        // a painted tile gets layers of its own, whatever it shares
        const lk = fit ? `t:${name}` : spec.photo ? `p:${spec.photo}` : `m:${name}`;
        let entry = layerOf.get(lk);
        let m = null;
        if (!entry) {
          m = build(name);
          if (m) {
            const layers = layersOf(m, spec.K);
            entry = { base: all.length, K: spec.K, layers };
            layerOf.set(lk, entry);
          }
        }
        if (entry) {
          // a tinted tile wears the shared canvas in the colour the style
          // already gives that block: the ratio of the two means
          let tint = [1, 1, 1];
          if (spec.tint) {
            const px = ownArt(tile);
            if (px) {
              const want = meanLinear(px);
              const have = meanLinear(entry.layers[0].rgba);
              tint = want.map((w, i) => w / Math.max(have[i], 1e-3));
            }
          }
          if (fit && m) {
            // the tint goes into the ground under the paint, and the tile
            // wears its layers as they are
            for (const l of entry.layers) {
              paintOver(l, fit, N, { tint: spec.tint ? tint : null, metalMask: !!spec.metalMask });
            }
            tint = [1, 1, 1];
            done.add(tile);
          }
          if (m) {
            const cut = fit ? !spec.metalMask && entry.layers.some((l) => hasHoles(l.rgba))
              : m.a.some((a) => a < 0.99) && !m.mt;
            for (const l of entry.layers) all.push({ l, cut });
          }
          tints.set(tile, tint);
          const metal = spec.metal ?? 0;
          prop(tile, 0, [entry.base, spec.K, metal,
            spec.metalMask ? 1 : spec.glowMask ? 2 : 0], next);
          prop(tile, 1, [spec.foliage ?? 0, spec.glow ?? 0, 0.8, spec.tone ?? 0], next);
          prop(tile, 2, [tint[0], tint[1], tint[2], 1], next);
        }
      }
      // let go of whatever nothing still to come is made from
      processed.add(name);
      if (spec.photo) usedPhoto(spec.photo);
      for (const f of spec.from ?? []) {
        if (!f.startsWith('@')) { usedPhoto(f); continue; }
        const d = f.slice(1);
        const c = (madeUses.get(d) ?? 1) - 1;
        madeUses.set(d, c);
        if (c <= 0 && processed.has(d)) built.delete(d);
      }
      if (!((madeUses.get(name) ?? 0) > 0)) built.delete(name);
      const took = performance.now() - tm;
      if (took > 60) state.slow.push(`${name} ${Math.round(took)}ms`);
      await pause();
      if (buildId !== state.build) return;
    }
    pixels.clear(); photoMats.clear(); built.clear();

    // Paintings on tiles with no photograph — or whose photograph is
    // missing: laid over the style's own pixel art, grown to this size, and
    // from then on that tile is drawn from the arrays like any other.
    const plain = new Map();         // tile -> entry
    for (const [tile, fit] of fits) {
      if (done.has(tile)) continue;
      const px = ownArt(tile);
      if (!px) continue;
      const i1 = (1 * COUNT + tile) * 4;
      const l = pixelLayer(px, N, next[i1 + 2]);
      paintOver(l, fit, N);
      const entry = { base: all.length, K: 1, layers: [l] };
      all.push({ l, cut: hasHoles(l.rgba) });
      plain.set(tile, entry);
      prop(tile, 0, [entry.base, 1, 0, 0], next);
      prop(tile, 2, [1, 1, 1, 1], next);
      await pause();
      if (buildId !== state.build) return;
    }

    // the 32-texel copies for the atlas: the first quarter of each, which is
    // the one a block standing on its own shows
    const icons = new Map();
    for (const [name, spec] of Object.entries(MATS)) {
      const tile = TILE[name];
      if (tile == null) continue;
      const painted = done.has(tile);
      const entry = layerOf.get(painted ? `t:${name}`
        : spec.photo ? `p:${spec.photo}` : `m:${name}`);
      if (!entry) continue;
      icons.set(tile, shrinkLayer(entry.layers[0].rgba, N, ATLAS.TS, !!spec.metalMask,
        spec.tint && !painted ? tints.get(tile) : null));
    }
    for (const [tile, entry] of plain) {
      icons.set(tile, shrinkLayer(entry.layers[0].rgba, N, ATLAS.TS, false, null));
    }

    const t2 = performance.now();
    state.times.build = Math.round(t2 - t1);
    // the two arrays
    const D = all.length;
    const alb = new Uint8Array(N * N * 4 * D);
    const mat = new Uint8Array(N * N * 4 * D);
    for (let i = 0; i < D; i++) {
      const { l, cut } = all[i];
      const o = i * N * N * 4;
      // turned over: a canvas's first row is its top, a texture's is its
      // bottom, and the tile's v runs up
      for (let y = 0; y < N; y++) {
        const src = (N - 1 - y) * N * 4, dst = o + y * N * 4;
        alb.set(l.rgba.subarray(src, src + N * 4), dst);
        mat.set(l.mat.subarray(src, src + N * 4), dst);
      }
      // A cut-out's holes take the colour of what is round them, or the
      // mips average black into every leaf edge seen from a distance.
      if (cut) bleed(alb, o, N);
      all[i] = null;
      await pause();
      if (buildId !== state.build) return;
    }
    all.length = 0;
    layerOf.clear();
    const t3 = performance.now();
    state.times.pack = Math.round(t3 - t2);
    const mk = (data, srgb) => {
      const t = new THREE.DataArrayTexture(data, N, N, D);
      t.format = THREE.RGBAFormat;
      t.type = THREE.UnsignedByteType;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      // CLAMP, not repeat, and it is not a detail. A quarter of a two-block
      // photograph does not wrap onto itself — its left edge carries on from
      // the quarter to its LEFT, not from its own right — so a filter that
      // wraps blends the wrong texels into every block edge, and a hillside
      // seen against a low sun comes up ruled in a fine bright grid. Clamped,
      // the edge texel meets the neighbouring quarter's edge texel, which in
      // the photograph was the texel next to it.
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
      t.needsUpdate = true;
      return t;
    };
    const oldA = realShared.uRealAlb.value, oldM = realShared.uRealMat.value;
    state.albedo = mk(alb, true);
    state.mat = mk(mat, false);
    realShared.uRealAlb.value = state.albedo;
    realShared.uRealMat.value = state.mat;
    oldA?.dispose(); oldM?.dispose();
    // the props this build made, in the same moment as the layers they index
    propsData.set(next);
    propsTex.needsUpdate = true;
    // Hand the GPU the arrays now, not in the middle of the next frame — and
    // then let go of this side's copies, which at 256 texels a block were
    // ninety megabytes held for nothing. The card keeps its own; if it ever
    // loses them, the whole build runs again (see the context handlers in
    // main.js). A check that wants to read the layers back sets
    // __realKeepCPU before the style is chosen.
    let onCard = false;
    try {
      renderer?.initTexture?.(state.albedo); renderer?.initTexture?.(state.mat);
      onCard = !!renderer?.initTexture;
    } catch { /* drawn on first use instead, from the copies kept below */ }
    state.cpu = !onCard || globalThis.__realKeepCPU === true;
    if (!state.cpu) { state.albedo.image.data = null; state.mat.image.data = null; }
    state.times.upload = Math.round(performance.now() - t3);

    setRealTiles(icons);

    state.layers = D;
    state.ms = Math.round(performance.now() - t0);
    state.ready = true;
    realShared.uRealReady.value = 1;
    realShared.uRealN.value = N;
  })();
  state.loading.then(() => onReady?.());
  return state.loading;
}

// Spread each opaque texel's colour into the transparent ones round it, a
// few rings deep, leaving the alpha alone.
function bleed(buf, o, N) {
  const idx = (x, y) => o + ((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4;
  for (let pass = 0; pass < 6; pass++) {
    const src = buf.slice(o, o + N * N * 4);
    const has = (x, y) => src[((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4 + 3] >= 128
      || src[((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4 + 3] === 1;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = (y * N + x) * 4;
        if (src[k + 3] >= 128 || src[k + 3] === 1) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!has(x + dx, y + dy)) continue;
          const j = ((((y + dy) % N + N) % N) * N + (((x + dx) % N + N) % N)) * 4;
          r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
        }
        if (!n) continue;
        const d = idx(x, y);
        buf[d] = r / n; buf[d + 1] = g / n; buf[d + 2] = b / n;
        // alpha 1 (not 0) marks "filled by the bleed" for the next pass,
        // and is still far under any cut-out threshold
        buf[d + 3] = 1;
      }
    }
  }
}

// --- the light -------------------------------------------------------------------

const _c = new THREE.Color();
const SUN_HIGH = new THREE.Color(1.0, 0.96, 0.9);
const SUN_LOW = new THREE.Color(1.0, 0.52, 0.24);
const SKY_DAY = new THREE.Color(0.27, 0.34, 0.46);
const SKY_DUSK = new THREE.Color(0.30, 0.26, 0.36);
const SKY_NIGHT = new THREE.Color(0.030, 0.040, 0.075);
const GROUND_DAY = new THREE.Color(0.16, 0.14, 0.11);
const MOON = new THREE.Color(0.55, 0.64, 0.86);

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Once a frame, from updateSky (so window.tick drives it too).
//
//   sun, moon   unit directions        up      the local up the light is measured against
//   gloom       how much of the day a storm deck is eating (0..1)
//   flash       lightning, 0..1+        moonLit how much of the moon's face is lit
//   orbit       true in the overview, where there is no ground to stand on
//   upMode      1 when "up" is the way out from the planet's centre, per
//               fragment — the round planet, seen whole or from the side
export function updateRealLight({
  sun, moon, up, gloom = 0, flash = 0, moonLit = 1, orbit = false, upMode = 0,
}) {
  const U = realShared;
  const e = sun.dot(up);
  const me = moon.dot(up);
  const day = smoothstep(-0.02, 0.22, e);
  // The key light is the sun while it is up and the moon once it is down,
  // crossing over in the dusk, where both are too weak to throw much of a
  // shadow anyway.
  const useSun = e > -0.03 || me < 0.02;
  U.uKeyDir.value.copy(useSun ? sun : moon);
  if (useSun) {
    // white at height, gold then red as it sinks through more air
    const warm = 1 - smoothstep(0.02, 0.45, e);
    _c.copy(SUN_HIGH).lerp(SUN_LOW, warm * warm);
    U.uKeyColor.value.copy(_c).multiplyScalar(0.85 * day * (1 - gloom * 0.85));
  } else {
    const up2 = smoothstep(0.0, 0.2, me);
    U.uKeyColor.value.copy(MOON).multiplyScalar(0.16 * moonLit * up2 * (1 - gloom * 0.8));
  }
  // the fill: a blue sky over a brown earth by day, a violet one in the
  // dusk, and very little at all at night
  const dusk = smoothstep(-0.18, 0.05, e) * (1 - smoothstep(0.05, 0.3, e));
  _c.copy(SKY_NIGHT).lerp(SKY_DAY, smoothstep(-0.15, 0.25, e));
  _c.lerp(SKY_DUSK, dusk * 0.5);
  const storm = 1 - gloom * 0.55;
  U.uSkyAmb.value.copy(_c).multiplyScalar(storm);
  U.uGroundAmb.value.copy(GROUND_DAY).multiplyScalar(
    0.12 + 0.88 * smoothstep(-0.1, 0.3, e)).multiplyScalar(storm * 0.8);
  // lightning lights everything from above for a moment
  if (flash > 0) {
    U.uSkyAmb.value.r += flash * 0.8; U.uSkyAmb.value.g += flash * 0.85;
    U.uSkyAmb.value.b += flash;
  }
  // the eye opens up in the dark a little, as it does
  U.uExposure.value = 1.0 + 1.4 * (1 - smoothstep(-0.2, 0.15, e));
  if (orbit) {
    // From orbit you look AT the planet: the lit side lit, and a night side
    // you can still read the land on.
    U.uKeyDir.value.copy(sun);
    U.uKeyColor.value.copy(SUN_HIGH).multiplyScalar(1.1);
    U.uSkyAmb.value.setRGB(0.22, 0.25, 0.3);
    U.uGroundAmb.value.setRGB(0.14, 0.14, 0.15);
    U.uExposure.value = 1;
  }
  U.uRealUp.value.copy(up);
  U.uRealUpMode.value = upMode;
}
