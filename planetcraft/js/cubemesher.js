// cubemesher.js — cube-sphere (or flat-plane) cells -> Three.js geometry.
//
// A cell's eight corners are the dirFromCell anchors at (u+du, v+dv) placed
// at radius R0 + h + dh, so every block sits flush with the world: on a
// sphere that is anchor * radius and the top face is perpendicular to the
// local up; on the drafting table's plane (CS.FLAT) the anchor is the
// horizontal offset and the radius is plain height, so every block is a true
// unit cube. pushPos() and bufVert() below are the only places that difference
// lives in this file. Only faces whose neighbour is air or water are emitted.
//
// Three shapes come out of this, all built from the same corner directions:
// whole cubes; stairs and slabs, which are unions of sub-boxes cut from the
// cell in fractions of it; and cross-planes (tufts, plants, ladders), which
// have no volume at all and share the alpha-tested `tufts` geometry.

import * as THREE from 'three';
import {
  S, H, R0, R, BLOCK, TRANSPARENT, PLANTS, dirFromCell, neighborColumn,
  isStair, stairMaterial, stairFacing, isSlab, slabMaterial, slabHalf,
} from './cubesphere.js';
// (H and R0 are live bindings, so they track the current world size)
import * as CS from './cubesphere.js';
import { TILE, tileUV } from './textures.js';

// Ladders are still landing in cubesphere.js and the export name is not
// settled, so they are resolved through the namespace rather than imported by
// name — a missing named import kills the whole module, a missing namespace
// property just means "this world has no ladders yet".
const LADDER0 = CS.BLOCK.LADDER_BASE ?? CS.BLOCK.LADDER ?? -1;
const isLadder = CS.isLadder
  ?? ((b) => LADDER0 >= 0 && b >= LADDER0 && b <= LADDER0 + 3);
const ladderFacing = CS.ladderFacing ?? ((b) => (b - LADDER0) & 3);

// The kitchen garden. Eight block ids over four crops, and the look of each
// one is a pair of tiles named for it in the atlas — so this table is built by
// walking cubesphere's CROP_TYPES rather than being a switch that could go out
// of step with the id arithmetic. Read through the namespace for the same
// reason ladders are: a world module without crops in it still loads.
//
// The numbers after the tile are what plantLook's are: how wide the cross quad
// is, how tall, and how much wind the plant takes. A salad is a rosette on the
// ground and barely moves; a pepper bush is the tallest of the four and rolls
// nearly as much as wheat.
const CROP_SHAPE = {
  //         wide  tall  sway
  salad: [0.9, 0.5, 0.25],      // a rosette lying open on the ground
  pepper: [0.8, 1.0, 0.8],      // the tallest, and the one that rolls most
  potato: [0.85, 0.85, 0.55],
  pumpkin: [1.0, 0.6, 0.3],     // a vine: as wide as its cell and barely tall
  watermelon: [1.0, 0.6, 0.2],  // as low as the pumpkin, and it hardly moves
};
const CROP_DEFAULT = [0.75, 0.8, 0.6];
const CROP_LOOK = new Map();
(CS.CROP_TYPES ?? []).forEach((crop, i) => {
  const U = crop.toUpperCase();
  const [w, h, sway] = CROP_SHAPE[crop] ?? CROP_DEFAULT;
  const young = CS.cropId?.(i, 0), ripe = CS.cropId?.(i, 1);
  if (young == null) return;
  // plantLook's order is [tile, TALL, WIDE, sway] — the height first, because
  // that is the argument `cross` takes first. This table is written the way a
  // person describes a plant, wide then tall, so the two are swapped here
  // rather than in five entries above. They used to be swapped nowhere, which
  // is why the salad — "a rosette on the ground" — was the tallest and
  // narrowest thing in the garden and the pepper was a mat.
  CROP_LOOK.set(young, [TILE[`${U}_YOUNG`], h * 0.6, w * 0.7, sway]);
  CROP_LOOK.set(ripe, [TILE[`${U}_TOP`], h, w, sway]);
});

export const CHUNK = 32; // columns per chunk edge; chunks span the full height

// Anchor cache entry -> world position, pushed straight into a vertex array.
// The flat branch is cubesphere's posAt() against a packed Float64 cache:
// the anchor's x/z ARE the world x/z and the radius is the height.
function pushPos(arr, dirs, k, rad) {
  if (CS.FLAT) arr.push(dirs[k], rad, dirs[k + 2]);
  else arr.push(dirs[k] * rad, dirs[k + 1] * rad, dirs[k + 2] * rad);
}

// Below this many chunks the whole planet is built once and never evicted.
// Above it, chunks stream within view and distant ground is drawn by the
// sampled shell instead.
//
// This was 700, which took in radius 156 (384 chunks) and radius 200 (600) —
// so those two sizes meshed the ENTIRE GLOBE before settling, including the
// half of it behind you and the half under your feet. That was affordable
// when the ground was gentle and empty. It is not affordable now: mountains
// give every column more exposed face, and a city gives it towers, so a
// radius-156 world went to three million triangles and twelve to twenty-five
// SECONDS of meshing, taken in 90-200 ms bites because a chunk is atomic and
// cannot be split across frames. That is the hitching, and on the city world
// it is bad enough to read as a hang.
//
// 150 keeps the smallest worlds whole — radius 78 is 96 chunks and still
// builds in one go — and hands everything larger to the streamer, which is
// the same path radius 400 and 800 have always used.
const FULL_WORLD_CHUNKS = 150;
const SHELL_SAMPLES = 128;   // target samples along one face edge for the LOD
// `glass` is the tinted glass and the tinted panes, and it is a pass of its
// own for the same reason water is: it is alpha-BLENDED, and the solid pass is
// alpha-tested, where a texel is either fully there or a hole. A tint drawn
// under a hard cut can only ever be a pattern with daylight punched through
// it, which is what made black stained glass read as a dark grille.
const KINDS = ['solid', 'glass', 'water', 'lava', 'tufts'];
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Each corner is [du, dv, dh, texU, texV]. Winding gives outward normals with
// indices [0,1,2, 2,1,3]; the in-plane bases are right-handed against the face
// normal (u x v = outward for the top face, and so on round the cell).
//
// `axis`/`dir` name the cell axis the face is normal to (0 u, 1 v, 2 h) and
// which end of it, and `tex` says which two axes feed the texture's u and v.
// Both only matter for partial blocks, where a face may sit inside the cell
// and the tile has to be cropped to the piece that is actually there.
// How much darker each face is than the top. When the texture is a single
// flat colour this is the ONLY thing conveying three dimensions, so a style
// that wants pronounced shape widens the spread; a soft one narrows it. The
// two side pairs must differ from each other or a cube corner reads as one
// continuous surface — that difference is what makes the edge visible.
export const FACE_SHADING = {
  default: { top: 1.00, sideU: 0.80, sideV: 0.65, bottom: 0.50 },
};

export function setFaceShading({ top, sideU, sideV, bottom }) {
  for (const d of FACE_DEFS) {
    if (d.kind === 'top') d.shade = top;
    else if (d.kind === 'bottom') d.shade = bottom;
    else d.shade = d.axis === 0 ? sideU : sideV;
  }
}

const FACE_DEFS = [
  { off: [0, 0, 1], shade: 1.00, kind: 'top', axis: 2, dir: 1, tex: [0, 1],
    corners: [
      [0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
  { off: [0, 0, -1], shade: 0.50, kind: 'bottom', axis: 2, dir: -1, tex: [0, 1],
    corners: [
      [1, 0, 0, 1, 0], [0, 0, 0, 0, 0], [1, 1, 0, 1, 1], [0, 1, 0, 0, 1]] },
  { off: [1, 0, 0], shade: 0.80, kind: 'side', axis: 0, dir: 1, tex: [1, 2],
    corners: [
      [1, 0, 0, 0, 0], [1, 1, 0, 1, 0], [1, 0, 1, 0, 1], [1, 1, 1, 1, 1]] },
  { off: [-1, 0, 0], shade: 0.80, kind: 'side', axis: 0, dir: -1, tex: [1, 2],
    corners: [
      [0, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 0, 1]] },
  { off: [0, 1, 0], shade: 0.65, kind: 'side', axis: 1, dir: 1, tex: [0, 2],
    corners: [
      [0, 1, 0, 0, 0], [0, 1, 1, 0, 1], [1, 1, 0, 1, 0], [1, 1, 1, 1, 1]] },
  { off: [0, -1, 0], shade: 0.65, kind: 'side', axis: 1, dir: -1, tex: [0, 2],
    corners: [
      [0, 0, 1, 0, 1], [0, 0, 0, 0, 0], [1, 0, 1, 1, 1], [1, 0, 0, 1, 0]] },
];

// --- the shadow a block throws on what it stands against ---------------------
//
// Face shading above says which WAY a face points. It cannot say what is
// standing next to it, so until now a path ran under a wall, a house or a
// tree without a mark on it: every top face in the world was the same
// brightness, and the ground read as a printed carpet with objects resting
// on top of the picture rather than on the ground.
//
// This is the voxel answer, and it is the cheap one: no lights, no shadow
// map, no second pass. Each of a face's four corners looks at the three
// cells that crowd it — the two along the face's own plane and the diagonal
// between them, all one step OUT from the face — and darkens by how many of
// them are filled. The GPU interpolates between the four, so a wall meeting
// a floor gets a soft gradient a cell wide, an inside corner gets a pool,
// and an overhang gets a band under it.
//
// It is baked into the same vertex colours the face shading already uses,
// which is why it costs one multiply at mesh time and nothing at all per
// frame. The price is paid when a chunk is BUILT — twelve extra cell reads
// per face — and it is paid again whenever a block is placed or broken,
// because the chunk remeshes. All twelve reads land inside the one-column
// border `cellAt` already keeps, so nothing new has to be sampled.
//
// `strength` is how dark a fully-boxed-in corner goes, and it belongs to the
// style for the reason `shade` does: on a flat one-colour tile the shadow is
// doing all the drawing and wants to be firm, while on a busy classic tile
// it competes with the speckle and wants to be gentle. A style that says
// nothing gets the default.
export const FACE_OCCLUSION = { default: 0.62 };
const AO_LUT = new Float32Array(4);
export function setFaceOcclusion(strength = FACE_OCCLUSION.default) {
  const k = Math.max(0, Math.min(1, strength));
  // three steps, so a corner with one neighbour is barely touched and only a
  // corner boxed in on all three sides goes the full depth
  for (let i = 0; i < 4; i++) AO_LUT[i] = 1 - k * ((3 - i) / 3);
}
setFaceOcclusion();

// What throws that shadow. NOT `opaqueCube`: that test asks whether the face
// BEHIND this one still has to be drawn, and it answers no for leaves, for a
// stair and for a slab — every one of which is solid enough to darken what it
// sits against. A tree that does not shade the ground under it is the whole
// bug in miniature. What genuinely casts nothing is what you can see or walk
// through: air, water, glass, a plant, a torch, a lantern, a fence, a ladder.
function occludes(b) {
  if (b === BLOCK.AIR || b === BLOCK.WATER) return false;
  if (PLANTS.has(b) || isLadder(b)) return false;
  if (b === BLOCK.GLASS || isTinted(b)) return false;
  if (CS.isWall?.(b)) return false;   // a post and its arms, mostly air
  return b !== BLOCK.FENCE && b !== BLOCK.TORCH && b !== BLOCK.LANTERN;
}

// The three occluders for every corner of every face, worked out once from
// the corner table above rather than with axis arithmetic per vertex. Each
// entry is an offset from the face's OWN cell, so it already carries the step
// out through the face.
for (const def of FACE_DEFS) {
  const [A, B] = [0, 1, 2].filter((a) => a !== def.axis);
  def.aoOff = def.corners.map((c) => {
    const step = (which) => (c[which] ? 1 : -1);
    const at = (useA, useB) => {
      const o = [def.off[0], def.off[1], def.off[2]];
      if (useA) o[A] += step(A);
      if (useB) o[B] += step(B);
      return o;
    };
    return [at(1, 0), at(0, 1), at(1, 1)];
  });
}

// --- the Realistic style's two-block photographs ------------------------------
//
// A photograph of two metres of hillside is cut into four quarters, and which
// quarter a block wears is dealt out HERE, from the block's own cell: along
// each of the face's two texture axes, the cell's coordinate modulo K picks
// the column (or row) of quarters. Neighbours then take neighbouring quarters,
// so the four join up seamlessly and the ground repeats every K blocks
// instead of every one. The quarter goes to the shader as a whole number
// added to the atlas u — invisible to anything sampling the atlas with repeat
// wrapping, and read back off by lit.js. Every face in FACE_DEFS runs its
// texture the same way as the cell axis under it (checked below), which is
// what lets the plain modulo be the whole rule.
let macroK = new Map();
export function setMacroTiles(map) { macroK = map ?? new Map(); }
for (const def of FACE_DEFS) {
  const [ta, tb] = def.tex;
  const fwd = def.corners.every((c) => c[3] === c[ta])
    && def.corners.every((c) => c[4] === c[tb]);
  if (!fwd) throw new Error('a face runs its texture against its cell axis');
}
function macroOf(tile, def, u, v, h) {
  const K = macroK.get(tile);
  if (!K) return 0;
  const [ta, tb] = def.tex;
  const a = ta === 0 ? u : ta === 1 ? v : h;
  const b = tb === 0 ? u : tb === 1 ? v : h;
  return (((a % K) + K) % K) + K * (((b % K) + K) % K);
}

// Which atlas tiles a block wears, for the HUD's "what am I looking at" line.
// Exported rather than duplicated so the readout cannot drift from what the
// mesher actually draws.
export function tilesForBlock(block) {
  return {
    top: tileFor(block, 'top'),
    side: tileFor(block, 'side'),
    bottom: tileFor(block, 'bottom'),
  };
}

// tinted glass, in cubesphere's GLASS_TINTS order
const TINT_TILES = [
  TILE.GLASS_WHITE, TILE.GLASS_RED, TILE.GLASS_ORANGE, TILE.GLASS_YELLOW,
  TILE.GLASS_GREEN, TILE.GLASS_BLUE, TILE.GLASS_PURPLE, TILE.GLASS_BLACK,
];
// cement, in the same GLASS_TINTS order the glass above uses
const CEMENT_TILES = [
  TILE.CEMENT_WHITE, TILE.CEMENT_RED, TILE.CEMENT_ORANGE, TILE.CEMENT_YELLOW,
  TILE.CEMENT_GREEN, TILE.CEMENT_BLUE, TILE.CEMENT_PURPLE, TILE.CEMENT_BLACK,
];
const CEMENT_GREY_TILES = [
  TILE.CEMENT_GREY_LIGHT, TILE.CEMENT_GREY, TILE.CEMENT_GREY_DARK,
];
// wool, in cubesphere's WOOL_COLOURS order: the eight glass tints, then the
// two only a sheep makes
const WOOL_TILES = [
  TILE.WOOL_WHITE, TILE.WOOL_RED, TILE.WOOL_ORANGE, TILE.WOOL_YELLOW,
  TILE.WOOL_GREEN, TILE.WOOL_BLUE, TILE.WOOL_PURPLE, TILE.WOOL_BLACK,
  TILE.WOOL_BROWN, TILE.WOOL_GREY,
];
// [side, top, plank] per species AFTER oak, so index 0 here is species 1
const WOOD_TILES = [
  [TILE.LOG_SIDE_BIRCH, TILE.LOG_TOP_BIRCH, TILE.PLANK_BIRCH],
  [TILE.LOG_SIDE_SPRUCE, TILE.LOG_TOP_SPRUCE, TILE.PLANK_SPRUCE],
  [TILE.LOG_SIDE_ACACIA, TILE.LOG_TOP_ACACIA, TILE.PLANK_ACACIA],
  [TILE.LOG_SIDE_DARK, TILE.LOG_TOP_DARK, TILE.PLANK_DARK],
];

// Materials that are not blocks. A lantern is an OBJECT, not a cube of one
// substance: its cage, its ironwork and a torch's flame are three surfaces and
// none of them is anything the player can hold, so none of them can have a
// block id. Negative ids can never come out of the world, so carrying them
// through emitBox and tileFor costs nothing and cannot collide with anything.
const MAT_LANTERN = -1;    // the caged, glowing body
const MAT_IRON_CAP = -2;   // its foot, its shoulder and its hanging bail
const MAT_FLAME = -3;      // a torch's burning head
const MAT_BELL = -4;       // smooth cast bronze, banded at the lip
const MAT_MINT = -5;       // the mint's striking bed, with a blank in it
// A door's two halves. There is no block id for "the top half of a birch
// door", and there should not be — the leaf is ONE cell in the world. So the
// halves are materials, numbered from -10 down as type * 2 + half, and
// DOOR_TILES below is the only table that knows the order.
const MAT_DOOR0 = -10;
// --- what hangs in a frame -------------------------------------------------
//
// A painting's canvas can wear any tile in the atlas, and the block enum has
// one id left in it, so the PICTURE is not a block: it is an index into this
// table, resolved per cell. Fourteen of them — six badges for a stockroom's
// bays and eight pictures a player can choose between — and the materials run
// from MAT_ART0 downward exactly the way a door's two halves do.
//
// The first six are BADGES and are not offered in the picker: a brick is a
// sign over a bay, not a work of art, and a hall hung with six signs is a
// warehouse.
export const ART = [
  { key: 'building', name: 'building', tile: TILE.BADGE_BUILDING, badge: true },
  { key: 'tools', name: 'tools', tile: TILE.BADGE_TOOLS, badge: true },
  { key: 'weapons', name: 'weapons', tile: TILE.BADGE_WEAPONS, badge: true },
  { key: 'armour', name: 'armour', tile: TILE.BADGE_ARMOUR, badge: true },
  { key: 'food', name: 'food', tile: TILE.BADGE_FOOD, badge: true },
  { key: 'materials', name: 'materials', tile: TILE.BADGE_MATERIALS, badge: true },
  { key: 'land', name: 'the hills', tile: TILE.ART_LAND },
  { key: 'sea', name: 'the sea', tile: TILE.ART_SEA },
  { key: 'peak', name: 'the peak', tile: TILE.ART_PEAK },
  { key: 'face', name: 'a portrait', tile: TILE.ART_FACE },
  { key: 'still', name: 'a jug and an apple', tile: TILE.ART_STILL },
  { key: 'night', name: 'the night', tile: TILE.ART_NIGHT },
  { key: 'field', name: 'the field', tile: TILE.ART_FIELD },
  { key: 'beast', name: 'the wolf', tile: TILE.ART_BEAST },
];
// which entries the player may hang: everything that is not a bay sign
export const ART_PICTURES = ART.map((a, i) => (a.badge ? -1 : i))
  .filter((i) => i >= 0);
export const ART_BADGE = {};
ART.forEach((a, i) => { if (a.badge) ART_BADGE[a.key] = i; });
const MAT_ART0 = -100;
const ART_TILES = ART.map((a) => a.tile);

const DOOR_TILES = [
  TILE.DOOR_OAK_BOT, TILE.DOOR_OAK_TOP,
  TILE.DOOR_BIRCH_BOT, TILE.DOOR_BIRCH_TOP,
  TILE.DOOR_SPRUCE_BOT, TILE.DOOR_SPRUCE_TOP,
  TILE.DOOR_ACACIA_BOT, TILE.DOOR_ACACIA_TOP,
  TILE.DOOR_DARK_BOT, TILE.DOOR_DARK_TOP,
  TILE.DOOR_IRON_BOT, TILE.DOOR_IRON_TOP,
  TILE.DOOR_GLASS_BOT, TILE.DOOR_GLASS_TOP,
];

// `far` is the distant shell asking. A shell sample spans many columns, so a
// tile's alpha cutouts land as holes several blocks across punched through to
// space — which is exactly what a forest looked like from orbit once the
// leaves gained real holes. Up close a hole shows the next leaf back; out
// there there is no next leaf, only the sky behind the planet.
function tileFor(block, kind, far = false) {
  if (far && block === BLOCK.LEAF) return TILE.LEAF_FAR;
  if (block < 0) {
    // art first: the door range starts at -10 and runs down, so a picture at
    // -100 would otherwise be read as the eighty-ninth half of a door
    if (block <= MAT_ART0) return ART_TILES[MAT_ART0 - block] ?? TILE.PLANK;
    if (block <= MAT_DOOR0) return DOOR_TILES[MAT_DOOR0 - block];
    return block === MAT_LANTERN ? TILE.LANTERN
      : block === MAT_FLAME ? TILE.FLAME
        : block === MAT_BELL ? TILE.BELL
          : block === MAT_MINT ? TILE.MINT_DIE : TILE.LANTERN_CAP;
  }
  // A stair or slab is cut out of a full block, so it wears that block's
  // texture. Plants and ladders never reach the cube path — but they do reach
  // the distant shell, which has no cross-planes, so from orbit (where they
  // are far under a pixel) they borrow the ground and the wood they belong to
  // rather than punching alpha-tested holes in the terrain.
  if (isStair(block)) block = stairMaterial(block);
  else if (isSlab(block)) block = slabMaterial(block);
  else if (PLANTS.has(block)) block = BLOCK.GRASS;
  else if (isLadder(block)) block = BLOCK.PLANK;
  // a pane is glass, only thinner: it wears the tile of the block it was cut
  // from, which is also how the eight tints cover sixteen block ids
  else if (CS.isPane?.(block)) block = CS.paneGlass(block);
  // furniture only reaches here through the distant shell, where it is far
  // under a pixel — borrow the material it is mostly made of
  else if (block === BLOCK.TABLE || CS.isChair?.(block)) block = BLOCK.PLANK;
  // ...and a bed, from orbit, is the blanket on it
  else if (CS.isBed?.(block)) block = CS.woolId(CS.bedColour(block));
  else if (block === BLOCK.LAMP || block === BLOCK.STREET_LAMP) {
    block = BLOCK.TORCH;
  } else if (block === BLOCK.CAMPFIRE) block = BLOCK.LOG;
  // ...and a press, from orbit, is the iron it is mostly made of. NOT its own
  // item icon: that has a transparent ground, and the shell draws a column as
  // a solid box, so a mint would come out as a press-shaped hole in the roof.
  else if (block === BLOCK.MINT) block = BLOCK.BLOCK_IRON;
  // ...and the power fittings, which are iron with a little bronze in them
  else if (CS.isPowerBlock?.(block) || CS.isRail?.(block)
    || CS.isRailTurn?.(block)) {
    block = BLOCK.BLOCK_IRON;
  }
  // a masonry wall from a distance is a run of its own material
  else if (CS.isWall?.(block)) block = CS.wallMat(block);
  // a post is a log, planed thin: it has no tile of its own in the world, only
  // an item icon, so from orbit it is simply timber
  else if (block === BLOCK.POST) block = BLOCK.LOG;
  // Doors and the bell reach here only through the distant shell, where a leaf
  // is far under a pixel — borrow the material each is made of, which for a
  // timber door is that species' own planks.
  else if (CS.isDoorBlock?.(block)) {
    const t = CS.doorType(block);
    block = t === 5 ? BLOCK.BLOCK_IRON : t === 6 ? BLOCK.GLASS : CS.plankId(t);
  } else if (block === BLOCK.BELL) block = BLOCK.BLOCK_BRONZE;
  // The kitchen garden only reaches here through the distant shell, where a
  // whole crop is far under a pixel. Its own plant tile is the closest thing
  // it has to a face — which is exactly what wheat gets in the switch below.
  const crop = CROP_LOOK.get(block);
  if (crop) return crop[0];

  switch (block) {
    case BLOCK.GRASS:
      return kind === 'top' ? TILE.GRASS_TOP
        : kind === 'bottom' ? TILE.DIRT : TILE.GRASS_SIDE;
    case BLOCK.LOG:
      return kind === 'side' ? TILE.LOG_SIDE : TILE.LOG_TOP;
    case BLOCK.DIRT: return TILE.DIRT;
    case BLOCK.STONE: return TILE.STONE;
    case BLOCK.SAND: return TILE.SAND;
    case BLOCK.SAND_ORANGE: return TILE.SAND_ORANGE;
    case BLOCK.WATER: return TILE.WATER;
    case BLOCK.LEAF: return TILE.LEAF;
    case BLOCK.COAL: return TILE.COAL;
    case BLOCK.IRON: return TILE.IRON;
    case BLOCK.SILVER: return TILE.SILVER;
    case BLOCK.DIAMOND: return TILE.DIAMOND;
    case BLOCK.PLANK: return TILE.PLANK;
    case BLOCK.COBBLE: return TILE.COBBLE;
    case BLOCK.COBBLESTONE: return TILE.COBBLESTONE;
    case BLOCK.COBBLESTONE_MOSSY: return TILE.COBBLESTONE_MOSSY;
    case BLOCK.COBBLESTONE_DARK: return TILE.COBBLESTONE_DARK;
    case BLOCK.GLASS: return TILE.GLASS;
    case BLOCK.BRICK: return TILE.BRICK;
    case BLOCK.THATCH: return TILE.THATCH;
    // Same three-way split as grass: the walked surface on top, the dirt it
    // was cut into underneath, and a side that is the one capped by the other
    case BLOCK.PATH:
      return kind === 'top' ? TILE.PATH
        : kind === 'bottom' ? TILE.DIRT : TILE.PATH_SIDE;
    case BLOCK.FARMLAND:
    case BLOCK.TILLED: return kind === 'top' ? TILE.TILLED : TILE.DIRT;
    case BLOCK.WHEAT: return TILE.WHEAT;
    case BLOCK.FENCE: return TILE.LOG_SIDE;
    case BLOCK.GATE: case BLOCK.GATE_O: return TILE.LOG_SIDE;
    // only the distant shell asks: up close a lantern is LANTERN_BOXES
    case BLOCK.LANTERN:
      return kind === 'side' ? TILE.LANTERN : TILE.LANTERN_CAP;
    case BLOCK.CHEST: return TILE.CHEST;
    case BLOCK.STRIPPED_LOG:
      return kind === 'side' ? TILE.PLANK : TILE.LOG_TOP;
    case BLOCK.GRAVEL: return TILE.GRAVEL;
    case BLOCK.CLAY: return TILE.CLAY;
    case BLOCK.CRAFTING_TABLE:
      return kind === 'top' ? TILE.CRAFT_TOP
        : kind === 'bottom' ? TILE.PLANK : TILE.CRAFT_SIDE;
    case BLOCK.FURNACE:
      // the lit face points at whoever placed it; one face is enough to read
      return kind === 'top' ? TILE.FURNACE_TOP
        : kind === 'bottom' ? TILE.COBBLE : TILE.FURNACE_SIDE;
    case BLOCK.TORCH: return TILE.TORCH;
    case BLOCK.SNOW: return TILE.SNOW;
    case BLOCK.ICE: return TILE.ICE;
    // no lava tile in the atlas yet; water reads as a fluid and main.js tints
    // the lava pass orange, which is far better than the default grey stone
    // Lava borrowed the water tile and was tinted orange by its material. A
    // blue tile times an orange light is dark olive, which is why it read as
    // sludge; it has its own hot tile now, so the tint comes off too.
    case BLOCK.LAVA: return TILE.LAVA;
    case BLOCK.GOLD: return TILE.GOLD;
    case BLOCK.BLOCK_IRON: return TILE.BLOCK_IRON;
    case BLOCK.BLOCK_GOLD: return TILE.BLOCK_GOLD;
    case BLOCK.BLOCK_DIAMOND: return TILE.BLOCK_DIAMOND;
    case BLOCK.BLOCK_BRASS: return TILE.BLOCK_BRASS;
    case BLOCK.COPPER: return TILE.COPPER;
    case BLOCK.ZINC: return TILE.ZINC;
    case BLOCK.TIN: return TILE.TIN;
    case BLOCK.BLOCK_COPPER: return TILE.BLOCK_COPPER;
    case BLOCK.BLOCK_ZINC: return TILE.BLOCK_ZINC;
    case BLOCK.BLOCK_TIN: return TILE.BLOCK_TIN;
    case BLOCK.BLOCK_BRONZE: return TILE.BLOCK_BRONZE;
    case BLOCK.BLOCK_SILVER: return TILE.BLOCK_SILVER;
    // A shelf seen from above is the board it is framed in, not a row of
    // spines — the same split a crafting table's underside makes.
    case BLOCK.BOOKSHELF:
      return kind === 'side' ? TILE.BOOKSHELF : TILE.PLANK;
    default:
      // The families that are a base plus an index rather than a name: eight
      // tinted glasses and, after them, the four timbers past oak. A switch
      // case each would be twenty lines that can only ever go out of step
      // with the id arithmetic they are copying.
      if (CS.isTintedGlass?.(block)) return TINT_TILES[CS.glassTint(block)];
      if (CS.isCement?.(block)) return CEMENT_TILES[CS.cementTint(block)];
      if (CS.isCementGrey?.(block)) {
        return CEMENT_GREY_TILES[block - BLOCK.CEMENT_GREY_BASE];
      }
      if (CS.isWool?.(block)) return WOOL_TILES[CS.woolColour(block)];
      if (CS.isLog?.(block)) {
        const w = WOOD_TILES[CS.logSpecies(block) - 1];
        return kind === 'side' ? w[0] : w[1];
      }
      if (CS.isPlank?.(block)) return WOOD_TILES[CS.plankSpecies(block) - 1][2];
      return TILE.STONE;
  }
}

// --- partial blocks ---------------------------------------------------------
//
// Stairs and slabs are unions of axis-aligned sub-boxes *in cell space*: a box
// is [u0, u1, v0, v1, h0, h1] as fractions of the cell, and its corners are
// still dirFromCell(f, u + uf, v + vf) * (R0 + h + hf). That is exactly the
// construction FACE_DEFS uses for a whole cell, so a half block sits flush on
// the curve instead of poking through it, and the winding comes along for the
// ride: remapping 0 -> lo and 1 -> hi with lo < hi cannot flip an orientation.
//
// A stair is the bottom slab plus a half-depth step on the side it faces
// (facing 0..3 = +u, -u, +v, -v). The step's underside is skipped outright —
// it is exactly the slab's top face, and drawing both would be two coplanar
// quads with the same normal, the one arrangement that really does z-fight.

const BOX_LOWER = [0, 1, 0, 1, 0, 0.5];
const BOX_UPPER = [0, 1, 0, 1, 0.5, 1];
const STAIR_STEP = [
  [0.5, 1, 0, 1, 0.5, 1],   // facing 0: +u
  [0, 0.5, 0, 1, 0.5, 1],   // facing 1: -u
  [0, 1, 0.5, 1, 0.5, 1],   // facing 2: +v
  [0, 1, 0, 0.5, 0.5, 1],   // facing 3: -v
];
const SKIP_BOTTOM = 1 << 1;   // FACE_DEFS[1] is the bottom face

// Faces are culled against this and only this: a full opaque cube next door
// draws its own face over the shared boundary (stairs and slabs are in
// TRANSPARENT, so it is never culled against us), which makes ours invisible.
// Anything partial — another stair, a slab, glass, a plant — leaves both
// faces standing. They point in opposite directions, so backface culling
// picks one and there is no z-fighting; the cost is a little overdraw.
// --- output buffers ---------------------------------------------------------
//
// A chunk emits tens of thousands of vertices, and pushing every number onto a
// plain JS array and then copying the lot into a Float32Array costs about five
// times what writing straight into a preallocated typed array does — 14 ms
// against 2.8 at fifty thousand vertices, measured in the browser. Once the
// READS were fixed this was most of what a chunk build had left.
//
// The buffers are module-level scratch, grown and never shrunk. Meshing is
// synchronous and one chunk at a time, so one set is enough; each pass has its
// own because a chunk fills up to five of them.
function growF(a, n) { const b = new Float32Array(n); b.set(a); return b; }
function growU(a, n) { const b = new Uint32Array(n); b.set(a); return b; }

function makeBuf(sway = false) {
  return {
    pos: new Float32Array(0), col: new Float32Array(0), uv: new Float32Array(0),
    sway: sway ? new Float32Array(0) : null,
    idx: new Uint32Array(0),
    n: 0,      // vertices written
    ni: 0,     // indices written
  };
}

// Room for one more quad. Called once per face rather than once per vertex,
// and the growth is geometric, so a chunk pays for at most a handful of
// reallocations in its whole life and later chunks pay for none.
function bufRoom(b) {
  if (b.n + 4 > b.pos.length / 3) {
    const want = Math.max(8192, (b.n + 4) * 2);
    b.pos = growF(b.pos, want * 3);
    b.col = growF(b.col, want * 3);
    b.uv = growF(b.uv, want * 2);
    if (b.sway) b.sway = growF(b.sway, want);
  }
  if (b.ni + 6 > b.idx.length) b.idx = growU(b.idx, Math.max(12288, (b.ni + 6) * 2));
}

// One vertex, positioned from a cached corner direction at radius `rad`.
// The FLAT branch is the same one pushPos makes: on the drafting table the
// anchor's x/z ARE the world x/z and the radius is plain height.
function bufVert(b, dirs, k, rad, r, g, bl, au, av) {
  const o = b.n * 3, o2 = b.n * 2;
  if (CS.FLAT) {
    b.pos[o] = dirs[k]; b.pos[o + 1] = rad; b.pos[o + 2] = dirs[k + 2];
  } else {
    b.pos[o] = dirs[k] * rad; b.pos[o + 1] = dirs[k + 1] * rad;
    b.pos[o + 2] = dirs[k + 2] * rad;
  }
  b.col[o] = r; b.col[o + 1] = g; b.col[o + 2] = bl;
  b.uv[o2] = au; b.uv[o2 + 1] = av;
  b.n++;
}

// ...and one whose position is already a world point: the cross planes work
// that way, since a plant is inset from its cell's corners.
function bufVertAt(b, p, r, g, bl, au, av, sway) {
  const o = b.n * 3, o2 = b.n * 2;
  b.pos[o] = p[0]; b.pos[o + 1] = p[1]; b.pos[o + 2] = p[2];
  b.col[o] = r; b.col[o + 1] = g; b.col[o + 2] = bl;
  b.uv[o2] = au; b.uv[o2 + 1] = av;
  if (b.sway) b.sway[b.n] = sway;
  b.n++;
}

// the six indices over the four vertices just written, in the winding every
// face in this file uses
function bufQuad(b, base) {
  const i = b.ni;
  b.idx[i] = base; b.idx[i + 1] = base + 1; b.idx[i + 2] = base + 2;
  b.idx[i + 3] = base + 2; b.idx[i + 4] = base + 1; b.idx[i + 5] = base + 3;
  b.ni = i + 6;
}

// The same quad split the OTHER way, along corners 0-3 instead of 1-2.
//
// A quad is two triangles and the seam between them has to go somewhere. With
// the seam fixed, a face whose four corners carry different contact shadows
// gets a visible crease across it: one dark corner bleeds along whichever
// triangle happens to own it, and a run of blocks all creased the same way
// reads as corduroy. The fix is to lay the seam between the two BRIGHTER
// corners, so the darkness stays penned into one triangle instead of being
// dragged across both — which means picking the diagonal per face, at mesh
// time, off the four values just computed.
//
// Both windings are counter-clockwise seen from outside, like bufQuad's.
function bufQuadFlip(b, base) {
  const i = b.ni;
  b.idx[i] = base; b.idx[i + 1] = base + 1; b.idx[i + 2] = base + 3;
  b.idx[i + 3] = base; b.idx[i + 4] = base + 3; b.idx[i + 5] = base + 2;
  b.ni = i + 6;
}

// The scratch is reused by the next chunk, so what goes to the GPU is a copy —
// one bulk memcpy per attribute, against the several hundred thousand
// element-wise pushes this replaced.
function bufGeo(b) {
  if (!b.n) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, b.n * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(b.uv.slice(0, b.n * 2), 2));
  if (b.sway) {
    g.setAttribute('sway', new THREE.BufferAttribute(b.sway.slice(0, b.n), 1));
  }
  // Sixteen-bit indices where they fit, which is nearly always: a chunk under
  // 65536 vertices halves its index buffer, and WebGL1 needs an extension for
  // the wide ones. setIndex used to pick this for us off a plain array.
  g.setIndex(new THREE.BufferAttribute(b.n <= 65536
    ? new Uint16Array(b.idx.subarray(0, b.ni))
    : b.idx.slice(0, b.ni), 1));
  return g;
}

const opaqueCube = (b) => b !== BLOCK.AIR && b !== BLOCK.WATER
  && !TRANSPARENT.has(b) && !isLadder(b);

const _bd = new Float64Array(12);   // the box footprint's four directions
const _bdir = [0, 0, 0];
const _lo = [0, 0, 0], _hi = [0, 0, 0];

// `whole` says the box wears its ENTIRE tile rather than the crop of it the
// box covers. Cropping is right for a shape cut out of a material — a slab
// side shows the bottom half of the stone it was cut from — and wrong for a
// shape that is an object in its own right: a lantern's cage squeezed into
// the middle third of its own texture is not a lantern.
//
// `mirror` is a CELL AXIS (0 = u, 1 = v) the box's texture is read backwards
// along, or -1 for the ordinary way round. The geometry is untouched: it is
// for a shape that is the reflection of another one and whose tile is not
// symmetric — a door leaf hung on the other jamb, whose handle has to move to
// the other edge with it. Reflecting a box across the middle of its own cell
// leaves an axis-aligned box exactly where it was, so the mirror is entirely a
// matter of which end of the tile each corner reads from.
function emitBox(out, planet, f, u, v, h, box, mat, shade,
                 dirs, span, du0, dv0, skip, whole = false, mirror = -1) {
  const [bu0, bu1, bv0, bv1, bh0, bh1] = box;
  _lo[0] = bu0; _lo[1] = bv0; _lo[2] = bh0;
  _hi[0] = bu1; _hi[1] = bv1; _hi[2] = bh1;

  // the four footprint directions, in corner order (du * 2 + dv). Whole-cell
  // corners come from the chunk's shared cache; a stair's two mid-cell ones
  // are worth a dirFromCell each, and stairs are rare.
  let n = 0;
  for (let i = 0; i < 2; i++) {
    const uf = i ? bu1 : bu0;
    for (let j = 0; j < 2; j++) {
      const vf = j ? bv1 : bv0;
      if ((uf === 0 || uf === 1) && (vf === 0 || vf === 1)) {
        const k = ((du0 + uf) * span + (dv0 + vf)) * 3;
        _bd[n] = dirs[k]; _bd[n + 1] = dirs[k + 1]; _bd[n + 2] = dirs[k + 2];
      } else {
        dirFromCell(f, u + uf, v + vf, _bdir);
        _bd[n] = _bdir[0]; _bd[n + 1] = _bdir[1]; _bd[n + 2] = _bdir[2];
      }
      n += 3;
    }
  }

  for (let fi = 0; fi < 6; fi++) {
    if (skip & (1 << fi)) continue;
    const def = FACE_DEFS[fi];
    const a = def.axis;
    // a face away from the cell boundary is interior to the shape (the riser
    // of a stair, the top of a slab) and always shows
    const atEdge = def.dir > 0 ? _hi[a] === 1 : _lo[a] === 0;
    if (atEdge) {
      const nb = planet.get(f, u + def.off[0], v + def.off[1], h + def.off[2]);
      if (opaqueCube(nb)) continue;
    }
    const tile = tileFor(mat, def.kind);
    const mq = macroOf(tile, def, u, v, h);
    const [ta, tb] = def.tex;
    let tu0 = whole ? 0 : _lo[ta], tu1 = whole ? 1 : _hi[ta];
    let tv0 = whole ? 0 : _lo[tb], tv1 = whole ? 1 : _hi[tb];
    // read the tile backwards along the mirrored axis, if this face is mapped
    // along it at all — a face whose two texture axes miss it is unchanged by
    // the reflection and must be left exactly as it was
    if (mirror === ta) { const t = tu0; tu0 = tu1; tu1 = t; }
    else if (mirror === tb) { const t = tv0; tv0 = tv1; tv1 = t; }
    bufRoom(out);
    const base = out.n;
    const s = def.shade * shade;
    for (const [cdu, cdv, cdh, tu, tv] of def.corners) {
      const k = (cdu * 2 + cdv) * 3;
      const rad = R0 + h + (cdh ? bh1 : bh0);
      // crop the tile to the box, so a slab side shows the tile's bottom half
      const [au, av] = tileUV(tile,
        tu0 + tu * (tu1 - tu0), tv0 + tv * (tv1 - tv0));
      bufVert(out, _bd, k, rad, s, s, s, au + mq, av);
    }
    bufQuad(out, base);
  }
}

function emitShape(out, planet, f, u, v, h, block, shade,
                   dirs, span, du0, dv0) {
  if (isSlab(block)) {
    emitBox(out, planet, f, u, v, h, slabHalf(block) ? BOX_UPPER : BOX_LOWER,
      slabMaterial(block), shade, dirs, span, du0, dv0, 0);
    return;
  }
  const mat = stairMaterial(block);
  emitBox(out, planet, f, u, v, h, BOX_LOWER, mat, shade,
    dirs, span, du0, dv0, 0);
  emitBox(out, planet, f, u, v, h, STAIR_STEP[stairFacing(block)], mat, shade,
    dirs, span, du0, dv0, SKIP_BOTTOM);
}

// --- furniture ---------------------------------------------------------------
//
// Each piece is a list of [box, material-block] through the same emitBox a
// stair goes through, so it sits flush on the curve and wears real block
// textures — a table is planks on stripped-log legs, not a new tile. A box is
// [u0, u1, v0, v1, h0, h1] in cell fractions.

const FURN_TABLE = [
  [[0, 1, 0, 1, 0.8, 0.95], BLOCK.PLANK],                       // the top
  [[0.06, 0.2, 0.06, 0.2, 0, 0.8], BLOCK.STRIPPED_LOG],         // four legs
  [[0.8, 0.94, 0.06, 0.2, 0, 0.8], BLOCK.STRIPPED_LOG],
  [[0.06, 0.2, 0.8, 0.94, 0, 0.8], BLOCK.STRIPPED_LOG],
  [[0.8, 0.94, 0.8, 0.94, 0, 0.8], BLOCK.STRIPPED_LOG],
];

// The backrest per facing (+u, -u, +v, -v: the side the back stands on),
// then the seat and legs shared by all four.
const CHAIR_BACK = [
  [0.76, 0.9, 0.1, 0.9, 0.5, 1],
  [0.1, 0.24, 0.1, 0.9, 0.5, 1],
  [0.1, 0.9, 0.76, 0.9, 0.5, 1],
  [0.1, 0.9, 0.1, 0.24, 0.5, 1],
];
const CHAIR_COMMON = [
  [[0.1, 0.9, 0.1, 0.9, 0.36, 0.5], BLOCK.PLANK],               // the seat
  [[0.1, 0.24, 0.1, 0.24, 0, 0.36], BLOCK.STRIPPED_LOG],        // four legs
  [[0.76, 0.9, 0.1, 0.24, 0, 0.36], BLOCK.STRIPPED_LOG],
  [[0.1, 0.24, 0.76, 0.9, 0, 0.36], BLOCK.STRIPPED_LOG],
  [[0.76, 0.9, 0.76, 0.9, 0, 0.36], BLOCK.STRIPPED_LOG],
];

// A BENCH: a public seat — two plank boards on cobble feet with a low back,
// longer and lower than the chair it is otherwise built like. The boards run
// ALONG the wall the back stands on, so a bench against a wall reads as one
// piece of street furniture and two side by side read as a row. Facing is
// the side the back stands on, chair's order.
const BENCH_BACK = [
  [0.78, 0.92, 0.02, 0.98, 0.42, 0.82],
  [0.08, 0.22, 0.02, 0.98, 0.42, 0.82],
  [0.02, 0.98, 0.78, 0.92, 0.42, 0.82],
  [0.02, 0.98, 0.08, 0.22, 0.42, 0.82],
];
// seat + feet for the u-facing pair (boards run along v)...
const BENCH_U = [
  [[0.14, 0.86, 0.02, 0.98, 0.3, 0.42], BLOCK.PLANK],
  [[0.2, 0.8, 0.06, 0.18, 0, 0.3], BLOCK.COBBLE],
  [[0.2, 0.8, 0.82, 0.94, 0, 0.3], BLOCK.COBBLE],
];
// ...and the v-facing pair (boards run along u)
const BENCH_V = [
  [[0.02, 0.98, 0.14, 0.86, 0.3, 0.42], BLOCK.PLANK],
  [[0.06, 0.18, 0.2, 0.8, 0, 0.3], BLOCK.COBBLE],
  [[0.82, 0.94, 0.2, 0.8, 0, 0.3], BLOCK.COBBLE],
];

// --- power ------------------------------------------------------------------
//
// Four machines, and every one of them is a box union like the bench and the
// press: nothing here costs a tile the atlas does not already have.
//
// WIRE is a CABLE and it is drawn as the SHAPE ITS NEIGHBOURS MAKE: a length
// of it comes out straight, a bend comes out as an elbow, a junction as a tee
// or a cross. The first version drew a plus in every cell, so a straight run
// was a row of crosses with the arms sticking out into nothing.
//
// The four arms are built independently — one per direction that has
// something to connect to — over a hub in the middle, which is what makes
// every case fall out of one rule instead of four shapes in a table:
//
//   two opposite arms   a straight
//   two adjacent arms   an elbow
//   three arms          a tee
//   four arms           a cross
//   none                just the hub, which is a cable end
//
// COLOUR IS THE STATE. Grey iron when the cable is dead, yellow when there is
// current in it — the only feedback a long run gives you, since the lamp is
// usually round a corner from the switch.
const WIRE_HUB = [0.38, 0.62, 0.38, 0.62, 0, 0.06];
const WIRE_ARMS = [
  [0.62, 1.00, 0.42, 0.58, 0, 0.06],   // +u
  [0.00, 0.38, 0.42, 0.58, 0, 0.06],   // -u
  [0.42, 0.58, 0.62, 1.00, 0, 0.06],   // +v
  [0.42, 0.58, 0.00, 0.38, 0, 0.06],   // -v
];
// A cable connects to another cable, and to anything a circuit ends at: the
// machine that drives it, the lever that breaks it, the lamp on the end. It
// does NOT reach for a door — a door is opened by the wire beside it, and an
// arm poking at every door in a corridor would be a cable that looks wired to
// things it only passes.
function wireJoins(b) {
  return CS.isWire?.(b) || CS.isSwitch?.(b) || CS.isPowerLamp?.(b)
    || b === BLOCK.DYNAMO;
}
function wireBoxes(block, planet, f, u, v, h) {
  const mat = CS.wireLive?.(block)
    ? (CS.woolId ? CS.woolId(3) : BLOCK.BLOCK_BRONZE)   // 3 is yellow
    : BLOCK.BLOCK_IRON;
  const out = [[WIRE_HUB, mat]];
  if (!planet) {
    // no world to ask (the item icon, and the distant shell): draw the cross,
    // which is the shape that reads as "wire" with nothing around it
    for (const arm of WIRE_ARMS) out.push([arm, mat]);
    return out;
  }
  const near = [
    planet.get(f, u + 1, v, h), planet.get(f, u - 1, v, h),
    planet.get(f, u, v + 1, h), planet.get(f, u, v - 1, h),
  ];
  let arms = 0;
  for (let i = 0; i < 4; i++) {
    if (!wireJoins(near[i])) continue;
    out.push([WIRE_ARMS[i], mat]);
    arms++;
  }
  // A cable with nothing on either side is still a cable: draw it as a short
  // straight rather than as a dot, or a single length of wire in a doorway
  // looks like something somebody dropped.
  if (!arms) { out.push([WIRE_ARMS[0], mat]); out.push([WIRE_ARMS[1], mat]); }
  return out;
}

// A SWITCH: a stone plate with a bronze lever on it. The lever LEANS — back
// when it is open, forward when it is closed — which is the whole point of
// drawing a lever rather than a button: you can see across a room whether the
// power is on.
const SWITCH_OFF = [
  [[0.30, 0.70, 0.30, 0.70, 0, 0.10], BLOCK.COBBLE],
  [[0.44, 0.56, 0.22, 0.40, 0.10, 0.42], BLOCK.BLOCK_BRONZE],
];
const SWITCH_ON = [
  [[0.30, 0.70, 0.30, 0.70, 0, 0.10], BLOCK.COBBLE],
  [[0.44, 0.56, 0.60, 0.78, 0.10, 0.42], BLOCK.BLOCK_BRONZE],
];

// A DYNAMO: an iron frame with a bronze drum lying in it and a cobble bed
// under the lot. It is the one power block that fills most of its cell,
// because it is the one that is a machine rather than a fitting.
const DYNAMO_BOXES = [
  [[0.06, 0.94, 0.06, 0.94, 0, 0.16], BLOCK.COBBLE],
  [[0.10, 0.26, 0.10, 0.90, 0.16, 0.78], BLOCK.BLOCK_IRON],
  [[0.74, 0.90, 0.10, 0.90, 0.16, 0.78], BLOCK.BLOCK_IRON],
  [[0.26, 0.74, 0.20, 0.80, 0.30, 0.70], BLOCK.BLOCK_BRONZE],   // the drum
  [[0.26, 0.74, 0.44, 0.56, 0.70, 0.86], BLOCK.BLOCK_IRON],     // the yoke
];

// A POWERED LAMP: the same stalk as the ordinary lamp with a glass head, dark
// until the wire under it is live. The lit one wears the flame the torch and
// the hearth wear, so a switched-on lamp looks like every other light in this
// world rather than like a new kind of thing.
const POWER_LAMP_OFF = [
  [[0.30, 0.70, 0.30, 0.70, 0, 0.08], BLOCK.BLOCK_IRON],
  [[0.45, 0.55, 0.45, 0.55, 0.08, 0.46], BLOCK.BLOCK_IRON],
  [[0.24, 0.76, 0.24, 0.76, 0.46, 0.90], BLOCK.GLASS],
];
const POWER_LAMP_ON = [
  [[0.30, 0.70, 0.30, 0.70, 0, 0.08], BLOCK.BLOCK_IRON],
  [[0.45, 0.55, 0.45, 0.55, 0.08, 0.46], BLOCK.BLOCK_IRON],
  [[0.24, 0.76, 0.24, 0.76, 0.46, 0.90], MAT_FLAME, true],
];

// A RAIL: two irons on wooden sleepers, laid along one axis. Thin enough to
// walk over and wide enough to see where the line goes from a hilltop, which
// is most of what a railway is for.
// WIDER, because the first gauge was a pair of threads. A rail is one of the
// few things in this world you look at end-on down its whole length, and at a
// tenth of a cell each the two irons vanished at ten blocks and the line read
// as a scratch on the floor. The heads are half again as wide and set most of
// a cell apart, and the sleepers run the FULL width of the cell so the track
// reads as a permanent way rather than as two wires — which is also what the
// eye uses to see where a line goes over a hill.
// A run along u carries its irons along u and its sleepers ACROSS it; the v
// run is the same thing turned a quarter.
const RAIL_U = [
  [[0, 1, 0.10, 0.28, 0, 0.11], BLOCK.BLOCK_IRON],
  [[0, 1, 0.72, 0.90, 0, 0.11], BLOCK.BLOCK_IRON],
  [[0.04, 0.34, 0, 1, 0, 0.05], BLOCK.LOG],
  [[0.66, 0.96, 0, 1, 0, 0.05], BLOCK.LOG],
];
const RAIL_V = [
  [[0.10, 0.28, 0, 1, 0, 0.11], BLOCK.BLOCK_IRON],
  [[0.72, 0.90, 0, 1, 0, 0.11], BLOCK.BLOCK_IRON],
  [[0, 1, 0.04, 0.34, 0, 0.05], BLOCK.LOG],
  [[0, 1, 0.66, 0.96, 0, 0.05], BLOCK.LOG],
];

// A BEND. Drawn once for the (+u, +v) pair of arms — half a run of each
// straight, an outer elbow of two stepped irons, an inner elbow of one — and
// the other three orientations are the same boxes mirrored. The inside of the
// curve is the corner the two arms share, so the outer irons (the ones far
// from it) get the longer sweep, which is what makes the piece read as a
// curve and not as two dead ends meeting.
const RAIL_TURN_PP = [
  // the two half-arms, irons only as far as the elbow needs
  [[0.40, 1, 0.10, 0.28, 0, 0.11], BLOCK.BLOCK_IRON],   // +u arm, outer
  [[0.58, 1, 0.72, 0.90, 0, 0.11], BLOCK.BLOCK_IRON],   // +u arm, inner
  [[0.10, 0.28, 0.40, 1, 0, 0.11], BLOCK.BLOCK_IRON],   // +v arm, outer
  [[0.72, 0.90, 0.58, 1, 0, 0.11], BLOCK.BLOCK_IRON],   // +v arm, inner
  // the outer elbow, stepped through the diagonal
  [[0.24, 0.46, 0.10, 0.30, 0, 0.11], BLOCK.BLOCK_IRON],
  [[0.12, 0.32, 0.18, 0.38, 0, 0.11], BLOCK.BLOCK_IRON],
  [[0.10, 0.30, 0.24, 0.46, 0, 0.11], BLOCK.BLOCK_IRON],
  // the inner elbow, one short step
  [[0.58, 0.82, 0.58, 0.82, 0, 0.11], BLOCK.BLOCK_IRON],
  // sleepers: one under each arm and a pad under the elbow
  [[0.62, 0.92, 0.02, 0.98, 0, 0.05], BLOCK.LOG],
  [[0.02, 0.98, 0.62, 0.92, 0, 0.05], BLOCK.LOG],
  [[0.06, 0.52, 0.06, 0.52, 0, 0.05], BLOCK.LOG],
];
const mirrorBox = ([box, mat], su, sv) => {
  const [u0, u1, v0, v1, h0, h1] = box;
  return [[su < 0 ? 1 - u1 : u0, su < 0 ? 1 - u0 : u1,
    sv < 0 ? 1 - v1 : v0, sv < 0 ? 1 - v0 : v1, h0, h1], mat];
};
const RAIL_TURNS = [0, 1, 2, 3].map((k) =>
  RAIL_TURN_PP.map((b) => mirrorBox(b, k & 1 ? -1 : 1, k & 2 ? -1 : 1)));

// A HYDRANT: a squat post with a domed cap and two hose arms, iron head on a
// red cement body. The arms are what read at street distance — a red post is
// a bollard; a red post with shoulders is a hydrant.
const HYDRANT_BOXES = [
  [[0.30, 0.70, 0.30, 0.70, 0, 0.08], MAT_IRON_CAP, true],      // the base
  [[0.36, 0.64, 0.36, 0.64, 0.08, 0.52], BLOCK.CEMENT_BASE + 1],// the barrel
  [[0.20, 0.80, 0.42, 0.58, 0.26, 0.42], BLOCK.CEMENT_BASE + 1],// hose arms
  [[0.40, 0.60, 0.40, 0.60, 0.52, 0.62], MAT_IRON_CAP, true],   // the shoulder
  [[0.45, 0.55, 0.45, 0.55, 0.62, 0.70], MAT_IRON_CAP, true],   // the bonnet
];

// A SHISHA. What says "water pipe" at the distance a café is seen from is the
// outline — a fat bulb low down, a thin stem, a small bowl on top — and the
// one warm speck of coal on the bowl, which is the only part that says it is
// lit. The hose comes off the stem and hangs down one side to the floor, so
// the thing reads as a pipe somebody is smoking rather than as an ornament.
// Brass for the bulb and the stem, because that is what an Egyptian pipe is
// made of and because a glass bulb would want the lantern's material; clay
// for the bowl; the hose is dark bark, the one dark flexible-looking tile
// this atlas has.
const SHISHA_BOXES = [
  [[0.32, 0.68, 0.32, 0.68, 0, 0.06], BLOCK.BLOCK_IRON],           // the foot
  [[0.28, 0.72, 0.28, 0.72, 0.06, 0.34], BLOCK.BLOCK_BRONZE],      // the bulb
  [[0.44, 0.56, 0.44, 0.56, 0.34, 0.74], BLOCK.BLOCK_BRONZE],      // the stem
  [[0.36, 0.64, 0.36, 0.64, 0.74, 0.80], BLOCK.BLOCK_BRONZE],      // the tray
  [[0.40, 0.60, 0.40, 0.60, 0.80, 0.92], BLOCK.CLAY],              // the bowl
  [[0.44, 0.56, 0.44, 0.56, 0.92, 0.98], MAT_FLAME, true],         // the coal
  [[0.56, 0.92, 0.46, 0.54, 0.44, 0.52], BLOCK.LOG],               // the hose, out
  [[0.84, 0.92, 0.46, 0.54, 0.06, 0.52], BLOCK.LOG],               // ...and down
];

// A TOILET: a bowl, the seat on it, and the cistern standing against the
// wall behind. Porcelain is white wool — the palest flat tile there is —
// with a plank seat, which is what a wooden seat on a china bowl is. The
// facing is the side the cistern stands on, chair's order, and each entry
// is the same fixture turned a quarter: written out box by box rather than
// rotated in code, for the reason the beds give.
const _T_WHITE = () => CS.woolId(0);
function toiletBoxes(facing) {
  const white = _T_WHITE();
  // the axis the fixture runs along, and whether the back is the high side
  const alongU = facing < 2;
  const hi = facing === 0 || facing === 2;
  // spans along the fixture's own axis (back..front) mapped onto the cell
  const span = (lo, hi2, w0, w1, z0, z1) => {
    const a0 = hi ? 1 - hi2 : lo, a1 = hi ? 1 - lo : hi2;
    return alongU ? [a0, a1, w0, w1, z0, z1] : [w0, w1, a0, a1, z0, z1];
  };
  // `lo..hi2` measured from the BACK wall of the cell (0) to the front (1)
  return [
    [span(0.30, 0.86, 0.26, 0.74, 0, 0.12), white],          // the foot
    [span(0.26, 0.90, 0.20, 0.80, 0.12, 0.42), white],       // the bowl
    [span(0.24, 0.92, 0.18, 0.82, 0.42, 0.50), BLOCK.PLANK], // the seat
    [span(0.04, 0.30, 0.12, 0.88, 0.42, 0.96), white],       // the cistern
    [span(0.02, 0.32, 0.10, 0.90, 0.96, 1.00), BLOCK.PLANK], // its lid
  ];
}
const TOILET_BOXES = [0, 1, 2, 3].map(toiletBoxes);

// A SIGN: a post, and a board on top of it turned to face whoever is meant
// to read it. The facing is the side the board faces, so the board is thin
// along that axis and the lettering — a canvas main.js hangs on the cell, see
// js/signs.js — sits a hair proud of that face. Pale timber for the board so
// dark lettering reads on it, the debarked post under it.
function signBoxes(facing) {
  const post = [[0.44, 0.56, 0.44, 0.56, 0, 0.54], BLOCK.STRIPPED_LOG];
  const board = facing < 2
    ? [[0.46, 0.54, 0.08, 0.92, 0.52, 0.98], BLOCK.PLANK]
    : [[0.08, 0.92, 0.46, 0.54, 0.52, 0.98], BLOCK.PLANK];
  return [post, board];
}
const SIGN_BOXES = [0, 1, 2, 3].map(signBoxes);

// A BIN: an iron drum, a little narrower than its cell, with a plank lid
// sitting proud of the rim. Iron for the drum because a wooden barrel is a
// cask and casks are what a pub keeps ale in; the lid is what says it opens.
const BIN_BOXES = [
  [[0.16, 0.84, 0.16, 0.84, 0, 0.06], BLOCK.BLOCK_IRON],          // the foot
  [[0.13, 0.87, 0.13, 0.87, 0.06, 0.86], BLOCK.BLOCK_IRON],       // the drum
  [[0.10, 0.90, 0.10, 0.90, 0.86, 0.92], BLOCK.BLOCK_IRON],       // the rim
  [[0.14, 0.86, 0.14, 0.86, 0.92, 1.00], BLOCK.STRIPPED_LOG],     // the lid
  [[0.40, 0.60, 0.44, 0.56, 1.00, 1.06], BLOCK.STRIPPED_LOG],     // its handle
];

// THE GLASSES. A glass is a fifth of a cell across, so nothing about the
// detail survives the distance a room is read from — what survives is the
// SHAPE and the one warm band of colour in the middle of it. Both are built
// the same way: a clear vessel with the drink as an opaque slab inside the
// run of it, so the eye gets glass, drink, glass stacked up, and neither the
// tea nor the ale is a see-through smear you cannot pick out against the
// counter. Wool for the liquid and not tinted glass: tinted glass draws in a
// blended pass of its own, a furniture union draws in the solid one, and a
// drink is opaque anyway.
const _T_TEA = () => CS.woolId(2);      // orange: black tea in a clear glass
const _T_ALE = () => CS.woolId(3);      // yellow: a glass of ale
// A TEA GLASS: the tulip. A saucer, a short stem, and a bowl that pinches at
// the waist and opens again at the lip — that pinch is the whole silhouette,
// and without it this is a thimble.
const TEA_GLASS_BOXES = [
  [[0.28, 0.72, 0.28, 0.72, 0, 0.03], _T_WHITE()],        // the saucer
  [[0.42, 0.58, 0.42, 0.58, 0.03, 0.09], BLOCK.GLASS],    // the stem
  [[0.34, 0.66, 0.34, 0.66, 0.09, 0.15], BLOCK.GLASS],    // the bowl's foot
  [[0.32, 0.68, 0.32, 0.68, 0.15, 0.30], _T_TEA()],       // the tea in it
  [[0.34, 0.66, 0.34, 0.66, 0.30, 0.38], BLOCK.GLASS],    // ...and the lip
];
// A TANKARD: straight sides, a white head on the ale and a handle off one
// side. The handle is three boxes and not one because a bar with a row of
// featureless glass cylinders on it is a row of candles.
const TANKARD_BOXES = [
  [[0.32, 0.68, 0.30, 0.66, 0, 0.04], BLOCK.GLASS],       // the base
  [[0.32, 0.68, 0.30, 0.66, 0.04, 0.34], _T_ALE()],       // the ale
  [[0.32, 0.68, 0.30, 0.66, 0.34, 0.42], _T_WHITE()],     // its head
  [[0.30, 0.70, 0.28, 0.68, 0.42, 0.46], BLOCK.GLASS],    // the rim
  [[0.40, 0.60, 0.66, 0.74, 0.12, 0.17], BLOCK.GLASS],    // the handle, out
  [[0.40, 0.60, 0.70, 0.74, 0.17, 0.30], BLOCK.GLASS],    // ...up
  [[0.40, 0.60, 0.66, 0.74, 0.30, 0.35], BLOCK.GLASS],    // ...and back in
];

// A TORCH: a stick with a burning head on it, and nothing else. It used to be
// a full cube wearing the torch tile on all six faces — the same cube, wearing
// the same tile, that BLOCK.LANTERN wore, which is why the two lights in this
// game were pixel-identical from across a street. The stick takes the middle
// of the bark tile the way a fence post does; the head wears the whole flame.
// The flame is two boxes and not one because a single one is a bright BRICK
// sitting on a stick — it needs to narrow toward the top or the eye reads a
// sign rather than a fire.
const TORCH_BOXES = [
  [[0.45, 0.55, 0.45, 0.55, 0, 0.56], BLOCK.LOG],
  [[0.35, 0.65, 0.35, 0.65, 0.54, 0.70], MAT_FLAME, true],
  [[0.42, 0.58, 0.42, 0.58, 0.70, 0.80], MAT_FLAME, true],
];

// A TORCH ON A WALL LEANS OFF IT. The torch has one id and no facing, so
// which wall it is on is read off the cell rather than stored: a block under
// the torch and it stands on that; nothing under it and masonry beside it,
// and it hangs off the masonry at a slant — foot against the wall, head out
// over the street — the way a bracket torch does. An axis-aligned box cannot
// tilt, so the slant is five short lengths of stick, each stepped a little
// further out and up than the last; at the size a torch is drawn that reads
// as one lean and not as a staircase. Read off the blocks, it is the same
// torch on every machine, and it re-reads itself the moment the wall goes.
const TORCH_NB = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const WALL_TORCH = new Map();     // the four leans, built once each
function wallTorchBoxes(du, dv) {
  const key = du * 3 + dv;
  let boxes = WALL_TORCH.get(key);
  if (boxes) return boxes;
  // a box `a0..a1` out from the wall's face, `h0..h1` up, `half` wide across
  const out = (a0, a1, h0, h1, half) => {
    const lo = 0.5 - half, hi = 0.5 + half;
    if (du) {
      return [du < 0 ? a0 : 1 - a1, du < 0 ? a1 : 1 - a0, lo, hi, h0, h1];
    }
    return [lo, hi, dv < 0 ? a0 : 1 - a1, dv < 0 ? a1 : 1 - a0, h0, h1];
  };
  boxes = [];
  for (let k = 0; k < 5; k++) {
    const a0 = 0.02 + k * 0.085;
    const h0 = 0.24 + k * 0.08;
    boxes.push([out(a0, a0 + 0.12, h0, h0 + 0.14, 0.05), BLOCK.LOG]);
  }
  const c = 0.02 + 4 * 0.085 + 0.06;      // over the last length of stick
  boxes.push([out(c - 0.15, c + 0.15, 0.62, 0.78, 0.15), MAT_FLAME, true]);
  boxes.push([out(c - 0.08, c + 0.08, 0.78, 0.88, 0.08), MAT_FLAME, true]);
  WALL_TORCH.set(key, boxes);
  return boxes;
}

function torchBoxes(planet, f, u, v, h) {
  const below = planet.get(f, u, v, h - 1);
  if (opaqueCube(below) || isSlab(below) || isStair(below)) return TORCH_BOXES;
  for (const [du, dv] of TORCH_NB) {
    if (opaqueCube(planet.get(f, u + du, v + dv, h))) {
      return wallTorchBoxes(du, dv);
    }
  }
  return TORCH_BOXES;
}

// A LANTERN: an iron foot, a caged glass body, a shoulder that overhangs it,
// and a bail to hang it by. The shoulder being WIDER than the body is what
// makes the silhouette read as a lantern rather than as a lump on a post, and
// the bail is what says it is a thing you carry. Every piece wears its whole
// tile — see emitBox's `whole`.
const LANTERN_BOXES = [
  [[0.30, 0.70, 0.30, 0.70, 0.02, 0.12], MAT_IRON_CAP, true],   // the foot
  [[0.28, 0.72, 0.28, 0.72, 0.12, 0.56], MAT_LANTERN, true],    // caged glass
  [[0.23, 0.77, 0.23, 0.77, 0.56, 0.66], MAT_IRON_CAP, true],   // the shoulder
  [[0.36, 0.64, 0.36, 0.64, 0.66, 0.73], MAT_IRON_CAP, true],   // the neck
  [[0.45, 0.55, 0.46, 0.54, 0.73, 0.90], MAT_IRON_CAP, true],   // the bail
];

// An indoor lamp: base, stem, and a shade lit from inside. The shade used to
// wear the torch tile cropped to its own box, which is how a lamp came out
// looking like a torch too; it wears the flame whole now, so what glows is a
// shade and not a fire.
const FURN_LAMP = [
  [[0.28, 0.72, 0.28, 0.72, 0, 0.09], BLOCK.STRIPPED_LOG],
  [[0.44, 0.56, 0.44, 0.56, 0.09, 0.52], BLOCK.STRIPPED_LOG],
  [[0.2, 0.8, 0.2, 0.8, 0.52, 0.95], MAT_FLAME, true],
];

// A street lamp head: the top of a post, so its own post fills the lower half
// and the lit head sits above it. Stood on a fence or log column it reads as
// one lamp post.
const FURN_STREET_LAMP = [
  [[0.42, 0.58, 0.42, 0.58, 0, 0.55], BLOCK.LOG],
  [[0.26, 0.74, 0.26, 0.74, 0.55, 0.92], MAT_LANTERN, true],
  [[0.2, 0.8, 0.2, 0.8, 0.92, 1], BLOCK.LOG],                   // the little cap
];

// A campfire: crossed logs over a coal bed, low enough to step over.
const FURN_CAMPFIRE = [
  [[0.22, 0.78, 0.22, 0.78, 0, 0.1], BLOCK.COAL],               // ember bed
  [[0.04, 0.96, 0.3, 0.5, 0, 0.17], BLOCK.LOG],                 // one log
  [[0.3, 0.5, 0.04, 0.96, 0.09, 0.26], BLOCK.LOG],              // crossed log
];

// A fence is a POST with RAILS, not a block: a thin centre post the height
// of the cell, and two rails running out to any side whose neighbour is
// another fence or something solid to attach to. The holes between the
// rails are the whole point — a fence you can see through is what separates
// a fence from a wall, which is exactly the complaint that built this.
const FENCE_POST = [0.4, 0.6, 0.4, 0.6, 0, 1];
// per facing +u,-u,+v,-v: the two rails, upper and lower
const FENCE_RAILS = [
  [[0.6, 1, 0.44, 0.56, 0.72, 0.87], [0.6, 1, 0.44, 0.56, 0.32, 0.47]],
  [[0, 0.4, 0.44, 0.56, 0.72, 0.87], [0, 0.4, 0.44, 0.56, 0.32, 0.47]],
  [[0.44, 0.56, 0.6, 1, 0.72, 0.87], [0.44, 0.56, 0.6, 1, 0.32, 0.47]],
  [[0.44, 0.56, 0, 0.4, 0.72, 0.87], [0.44, 0.56, 0, 0.4, 0.32, 0.47]],
];
const FENCE_NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A POST is the fence's centre post and nothing else — no rails, and it never
// reaches for a neighbour. That is the whole design: stack it and you have a
// mast, and a street lamp on top of a mast reads as a lamp post instead of as
// a light sitting on a column of full blocks. The box is FENCE_POST's, so a
// post and a fence in the same row line up to the texel, and emitBox crops the
// tile the same way, so it wears the middle of the log's bark.
const POST_BOX = FENCE_POST;

// --- doors --------------------------------------------------------------------
//
// A door is TWO cells tall and ONE block id. The alternative — a base id and a
// top id, the way Minecraft does it — costs the generator a second setBlock it
// can get wrong, and costs this mesher a rule about what to draw when only half
// of a door survives a landslide. One id that draws a leaf from h to h + 2 has
// neither problem: the cell above a doorway is the air you walk through, and
// nothing is stored there.
//
// The leaf is a slab an eighth of a cell thick lying against one side of the
// cell. Closed, that side is the one `facing` names — the wall's own plane, so
// a door sits IN the wall and not across the gap. Open, it swings a quarter
// turn onto the neighbouring side, which is what puts it flat against the jamb.
//
// It is emitted as two boxes, lower and upper, each wearing its own tile
// WHOLE. One box cannot do it: emitBox crops a tile to its box, and a box from
// 0 to 2 crops to v = 0..2, which reads off the end of the tile and into the
// atlas row below it.
const DOOR_THICK = 0.12;
const DOOR_CLOSED = [
  [1 - DOOR_THICK, 1, 0, 1],          // facing 0: against the +u wall
  [0, DOOR_THICK, 0, 1],              // facing 1: -u
  [0, 1, 1 - DOOR_THICK, 1],          // facing 2: +v
  [0, 1, 0, DOOR_THICK],              // facing 3: -v
];
const DOOR_OPEN = [
  [0, 1, 0, DOOR_THICK],              // swung off +u onto the -v jamb
  [0, 1, 1 - DOOR_THICK, 1],
  [0, DOOR_THICK, 0, 1],
  [1 - DOOR_THICK, 1, 0, 1],
];

// THE OTHER JAMB. A double door is a mirrored PAIR — see DOOR2_BASE in
// cubesphere.js — and a leaf hung on the far jamb is this leaf reflected across
// the middle of its own opening, nothing more. Shut it lies in the same plane,
// because a leaf in a wall is a leaf in a wall and the two of them meet down
// the middle of the doorway with no gap and no overlap. Only the swing changes:
// it folds back onto the OTHER neighbouring side, which is what makes a pair
// part in the middle instead of stacking up against one jamb.
const DOOR_OPEN_M = [
  [0, 1, 1 - DOOR_THICK, 1],          // swung off +u onto the +v jamb
  [0, 1, 0, DOOR_THICK],
  [1 - DOOR_THICK, 1, 0, 1],
  [0, DOOR_THICK, 0, 1],
];
// WHICH EDGE THE HANDLE IS ON. The tile draws the lever near its high edge,
// and a face reads its tile low-to-high along whichever cell axis the leaf
// spans — so a leaf whose HINGE is at that high end wears its handle on the
// one edge that never moves, which is a door drawn back to front.
//
// It is not the hinge bit that decides it, which is why half the doors on this
// planet had it wrong and nobody could say which half. Two things do:
//
//   SHUT, the leaf spans jamb to jamb, and hinge 0 hangs on the low jamb for
//   facings 0 and 2 and on the high one for 1 and 3 — which is cubesphere's
//   own `doorHingeFor` table said the other way round. So the hinge is at the
//   high end when the facing is odd, and the other hinge swaps that over.
//
//   OPEN, the leaf has folded back flat along the WALL, and the hinge is at
//   the wall's own end of it — high for facings 0 and 2, low for 1 and 3,
//   whichever jamb it left. Both leaves of a pair mirror together there.
//
// Mirror the tile exactly when the hinge is at the high end of the axis the
// leaf spans, and the handle is on the edge that swings in all sixteen cases.
const DOOR_JAMB_AXIS = [1, 1, 0, 0];   // shut: the axis the doorway spans

function emitDoor(out, planet, f, u, v, h, block, shade, dirs, span, du0, dv0) {
  const type = CS.doorType(block), facing = CS.doorFacing(block);
  const flip = CS.doorHinge?.(block) === 1;
  const open = CS.doorOpen(block);
  const [u0, u1, v0, v1] =
    (open ? (flip ? DOOR_OPEN_M : DOOR_OPEN) : DOOR_CLOSED)[facing];
  // the axis this leaf spans — jamb to jamb shut, the wall's own axis open —
  // and whether the hinge sits at the high end of it. See the table above.
  const axis = open ? 1 - DOOR_JAMB_AXIS[facing] : DOOR_JAMB_AXIS[facing];
  const hingeHigh = open ? (facing & 1) === 0 : ((facing & 1) === 0) === flip;
  const mirror = hingeHigh ? axis : -1;
  for (let half = 0; half < 2; half++) {
    // the upper half drops its underside: it is exactly the lower half's top
    // face, and two coplanar quads is the one arrangement that really does
    // z-fight — the same reason a stair's step skips its own bottom
    emitBox(out, planet, f, u, v, h, [u0, u1, v0, v1, half, half + 1],
      MAT_DOOR0 - (type * 2 + half), shade, dirs, span, du0, dv0,
      half ? SKIP_BOTTOM : 0, true, mirror);
  }
}

// --- the bell -----------------------------------------------------------------
// Two posts, a headstock across them, and the bell itself: a crown, a shoulder,
// a waist and a flared lip, each box wider than the one above it. The flare is
// the whole silhouette — a bell drawn as one box is a bucket — and it costs
// four boxes because a box union is the only shape language this mesher has.
const BELL_BOXES = [
  [[0.06, 0.2, 0.42, 0.58, 0, 1], BLOCK.LOG],
  [[0.8, 0.94, 0.42, 0.58, 0, 1], BLOCK.LOG],
  [[0.06, 0.94, 0.42, 0.58, 0.86, 1], BLOCK.LOG],            // the headstock
  [[0.46, 0.54, 0.46, 0.54, 0.82, 0.9], MAT_BELL, true],     // the crown
  [[0.34, 0.66, 0.34, 0.66, 0.58, 0.84], MAT_BELL, true],    // the shoulder
  [[0.26, 0.74, 0.26, 0.74, 0.36, 0.6], MAT_BELL, true],     // the body
  [[0.2, 0.8, 0.2, 0.8, 0.24, 0.38], MAT_BELL, true],        // the waist
  [[0.16, 0.84, 0.16, 0.84, 0.14, 0.26], MAT_BELL, true],    // the flared lip
];

// --- masonry walls -------------------------------------------------------------
// A fence in stone: a fat post the height of the cell less a cap of air, and a
// SOLID arm — not two rails — out to each neighbour it can join, because
// daylight through a wall is what separates a fence from a wall, in exactly
// the opposite direction the fence's comment argues. The material is the
// block's own: a brick wall is bricks, a cobblestone wall is the rounds.
const WALL_POST = [0.28, 0.72, 0.28, 0.72, 0, 0.94];
const WALL_ARMS = [
  [0.72, 1, 0.34, 0.66, 0, 0.80],
  [0, 0.28, 0.34, 0.66, 0, 0.80],
  [0.34, 0.66, 0.72, 1, 0, 0.80],
  [0.34, 0.66, 0, 0.28, 0, 0.80],
];

function emitWall(out, planet, f, u, v, h, block, shade, dirs, span, du0, dv0) {
  const mat = CS.wallMat(block);
  emitBox(out, planet, f, u, v, h, WALL_POST, mat, shade,
    dirs, span, du0, dv0, 0);
  for (let i = 0; i < 4; i++) {
    const nb = planet.get(f, u + FENCE_NB[i][0], v + FENCE_NB[i][1], h);
    const attach = CS.isWall?.(nb) || nb === BLOCK.FENCE || CS.isGate?.(nb)
      || (nb !== BLOCK.AIR && nb !== BLOCK.WATER && !TRANSPARENT.has(nb)
        && !isLadder(nb));
    if (!attach) continue;
    emitBox(out, planet, f, u, v, h, WALL_ARMS[i], mat, shade,
      dirs, span, du0, dv0, 0);
  }
}

function emitFence(out, planet, f, u, v, h, shade, dirs, span, du0, dv0) {
  emitBox(out, planet, f, u, v, h, FENCE_POST, BLOCK.LOG, shade,
    dirs, span, du0, dv0, 0);
  for (let i = 0; i < 4; i++) {
    const nb = planet.get(f, u + FENCE_NB[i][0], v + FENCE_NB[i][1], h);
    // rails reach for another fence, a gate's frame, a masonry wall, or
    // anything solid enough to be nailed to; they do not reach into open air
    const attach = nb === BLOCK.FENCE || CS.isGate?.(nb) || CS.isWall?.(nb)
      || (nb !== BLOCK.AIR && nb !== BLOCK.WATER && !TRANSPARENT.has(nb)
        && !isLadder(nb));
    if (!attach) continue;
    for (const rail of FENCE_RAILS[i]) {
      emitBox(out, planet, f, u, v, h, rail, BLOCK.LOG, shade,
        dirs, span, du0, dv0, 0);
    }
  }
}

// A gate spans its cell between two proper posts — thicker than the fence's
// centre post, the way a hung gate needs a frame. Which way it spans is read
// from the neighbours: the axis with fence, gate or wall on both sides. The
// closed leaf is two bars and a mid stile across the opening; open, the two
// half-leaves stand swung back flat against the posts.
const GATE_POSTS = [
  [[0, 0.15, 0.35, 0.65, 0, 1.05], [0.85, 1, 0.35, 0.65, 0, 1.05]],
  [[0.35, 0.65, 0, 0.15, 0, 1.05], [0.35, 0.65, 0.85, 1, 0, 1.05]],
];
const GATE_LEAF_CLOSED = [
  [[0.15, 0.85, 0.42, 0.58, 0.35, 0.5], [0.15, 0.85, 0.42, 0.58, 0.75, 0.9],
    [0.42, 0.58, 0.44, 0.56, 0.5, 0.75]],
  [[0.42, 0.58, 0.15, 0.85, 0.35, 0.5], [0.42, 0.58, 0.15, 0.85, 0.75, 0.9],
    [0.44, 0.56, 0.42, 0.58, 0.5, 0.75]],
];
const GATE_LEAF_OPEN = [
  [[0.15, 0.3, 0.58, 1, 0.35, 0.9], [0.7, 0.85, 0.58, 1, 0.35, 0.9]],
  [[0.58, 1, 0.15, 0.3, 0.35, 0.9], [0.58, 1, 0.7, 0.85, 0.35, 0.9]],
];

function emitGate(out, planet, f, u, v, h, block, shade, dirs, span, du0, dv0) {
  // pick the axis whose neighbours the gate hangs between; a fence neighbour
  // on either side of an axis wins it, walls count when no fence says so
  const att = FENCE_NB.map(([nu, nv]) => {
    const nb = planet.get(f, u + nu, v + nv, h);
    return nb === BLOCK.FENCE || CS.isGate?.(nb) ? 2
      : (nb !== BLOCK.AIR && nb !== BLOCK.WATER && !TRANSPARENT.has(nb)
        && !isLadder(nb)) ? 1 : 0;
  });
  const axis = (att[0] + att[1]) >= (att[2] + att[3]) ? 0 : 1;
  const boxes = [...GATE_POSTS[axis],
    ...(block === BLOCK.GATE ? GATE_LEAF_CLOSED : GATE_LEAF_OPEN)[axis]];
  for (const box of boxes) {
    emitBox(out, planet, f, u, v, h, box, BLOCK.LOG, shade,
      dirs, span, du0, dv0, 0);
  }
}

// A PANE is a sheet through the middle of its cell rather than a cube, which
// is the whole of what makes a one-block gap in a wall read as a window and
// not as a glass brick. Like a fence it reaches for its neighbours: another
// pane, any glass, or anything solid enough to be glazed into.
//
// It is emitted as at most two boxes — one per axis — and NOT as the post and
// arms a fence is built from, for a texture reason that is easy to miss.
// emitBox crops the tile to the box, so a 0.44..0.56 post shows the middle
// eighth of the glass tile, and the middle of the glass tile is the pane: it
// is genuinely empty. A post-and-arms window would have an invisible stripe
// down the centre of every cell. One box per axis has no such seam, and the
// crop then reproduces the whole tile across the cell exactly.
const PANE_MID0 = 0.44;
const PANE_MID1 = 0.56;

function emitPane(out, planet, f, u, v, h, block, shade, dirs, span, du0, dv0) {
  const glass = CS.paneGlass(block);
  const att = FENCE_NB.map(([nu, nv]) => {
    const nb = planet.get(f, u + nu, v + nv, h);
    // isGlass covers the tints and the panes as well as the clear block
    return CS.isGlass?.(nb)
      || (nb !== BLOCK.AIR && nb !== BLOCK.WATER && !TRANSPARENT.has(nb)
        && !isLadder(nb));
  });
  const boxes = [];
  if (att[0] || att[1]) {
    boxes.push([att[1] ? 0 : PANE_MID0, att[0] ? 1 : PANE_MID1,
      PANE_MID0, PANE_MID1, 0, 1]);
  }
  if (att[2] || att[3]) {
    boxes.push([PANE_MID0, PANE_MID1,
      att[3] ? 0 : PANE_MID0, att[2] ? 1 : PANE_MID1, 0, 1]);
  }
  // Nothing to reach for: a lone pane is a full sheet, not the stub a fence
  // would leave. A stub is the invisible case above, and a window you cannot
  // see is indistinguishable from one that failed to place.
  if (!boxes.length) boxes.push([0, 1, PANE_MID0, PANE_MID1, 0, 1]);
  for (const box of boxes) {
    emitBox(out, planet, f, u, v, h, box, glass, shade,
      dirs, span, du0, dv0, 0);
  }
}

// A BED, in one cell. The frame is planks with two stripped-log feet, the
// mattress is a slab of the fleece it was made from, and the pillow is white
// wool whatever colour the blanket is — a pillow that matches the blanket is
// the one thing that stops the shape reading as a bed at all.
//
// `facing` names the side the PILLOW is on, in stairs' order (+u, -u, +v, -v),
// so each entry here is the same cot turned a quarter turn. Written out rather
// than rotated in code because a box is six numbers and a rotation that gets
// one of them backwards is a bed with its head through the wall.
const BED_FRAME = [0, 1, 0, 1, 0.06, 0.30];
const BED_FOOT = 0.06;
// A BED IS TWO CELLS, and this draws whichever of them it is given. The head
// carries the board and the pillow and a quarter of the blanket; the foot is
// mattress the whole way across. Both carry the frame, and each carries the
// two legs at ITS OWN outer end — so the finished pair has four legs at the
// four corners of a two-cell bed rather than eight down the middle of one.
//
// The seam is deliberately invisible: the frame and the blanket run to 0 and 1
// on the side they meet, so the two cells butt with no gap and no lip.
function bedBoxes(block) {
  const wool = CS.woolId(CS.bedColour(block));
  const pillow = CS.woolId(0);          // white, always
  const face = CS.bedFacing(block);
  const head = CS.isBedHead(block);
  const along = face < 2;               // bed runs along u, or along v
  const high = face === 0 || face === 2;
  // WHICH END OF THIS CELL IS THE OUTER ONE. On the head cell the pillow end
  // is the outer end; on the foot cell it is the other one. `hi` is true when
  // that outer end is the high side of the cell.
  const hi = head ? high : !high;
  // The pillow takes the outer third of the head cell; on the foot cell there
  // is no pillow and the blanket has the lot.
  const p0 = hi ? 0.66 : 0.02, p1 = hi ? 0.98 : 0.34;
  const b0 = head ? (hi ? 0 : 0.34) : 0;
  const b1 = head ? (hi ? 0.66 : 1) : 1;
  const span = (lo, hi2, w0, w1, z0, z1) => along
    ? [lo, hi2, w0, w1, z0, z1] : [w0, w1, lo, hi2, z0, z1];
  const blanket = span(b0, b1, 0.06, 0.94, 0.30, 0.52);
  const cushion = span(p0, p1, 0.12, 0.88, 0.30, 0.58);
  // The frame runs the full length of the cell and butts flush with the other
  // half at the seam, so it reads as one bed and not two stools.
  const frame = span(0, 1, 0, 1, 0.06, 0.30);
  const out = [[frame, BLOCK.PLANK]];
  // The board, standing behind the pillow — only on the head. Without it a bed
  // is a coloured slab on the floor: the upright is the entire reason the
  // shape reads as a bed from across a room, and it says which end you lie at.
  if (head) {
    const board = span(hi ? 0.92 : 0, hi ? 1 : 0.08, 0, 1, 0.06, 0.78);
    out.push([board, BLOCK.PLANK]);
  }
  // Two legs, at this cell's OUTER corners. The seam end has none: they would
  // stand in the middle of the finished bed.
  const l0 = hi ? 0.84 : 0.02, l1 = hi ? 0.98 : 0.16;
  out.push([span(l0, l1, 0.02, 0.16, 0, BED_FOOT), BLOCK.STRIPPED_LOG]);
  out.push([span(l0, l1, 0.84, 0.98, 0, BED_FOOT), BLOCK.STRIPPED_LOG]);
  out.push([blanket, wool]);
  if (head) out.push([cushion, pillow]);
  return out;
}

// A carpet: the whole cell across, a finger thick, in whatever wool it was
// woven from. Nothing else in the game is this thin, and that is the point —
// a rug that reads as a step is a rug nobody lays.
const CARPET_BOX = [0.02, 0.98, 0.02, 0.98, 0, 0.045];

// A painting: a panel flat against one wall with a frame standing a little
// proud of it. The wall it hangs on is the facing, so the cell in FRONT of it
// is the one you stand in to look at it.
//
// [near, far] along the axis it hangs on — pressed to the wall, not floating.
const PAINT_ENDS = [
  // +u wall (the picture faces -u)
  { u0: 0.84, u1: 0.97, v0: 0.12, v1: 0.88 },
  { u0: 0.03, u1: 0.16, v0: 0.12, v1: 0.88 },
  { u0: 0.12, u1: 0.88, v0: 0.84, v1: 0.97 },
  { u0: 0.12, u1: 0.88, v0: 0.03, v1: 0.16 },
];

function paintingBoxes(block, art) {
  const facing = CS.paintingFacing(block);
  const e = PAINT_ENDS[facing];
  // Which way the room is from the wall this hangs on. The canvas has to
  // stand PROUD of the frame along that axis: put it inside and the frame's
  // own front face covers it, which is a picture that renders as a coloured
  // splinter down one edge of a wooden box.
  const acrossU = e.u1 - e.u0 > e.v1 - e.v0;   // wide in u, thin in v
  const OUT = 0.05, DEEP = 0.07, INSET = 0.10;
  let cu0 = e.u0, cu1 = e.u1, cv0 = e.v0, cv1 = e.v1;
  if (!acrossU) {
    // thin in u: the wall is a u wall, so the room is along u
    if (facing === 0) { cu1 = e.u0 + DEEP; cu0 = e.u0 - OUT; }
    else { cu0 = e.u1 - DEEP; cu1 = e.u1 + OUT; }
    cv0 = e.v0 + INSET; cv1 = e.v1 - INSET;
  } else {
    if (facing === 2) { cv1 = e.v0 + DEEP; cv0 = e.v0 - OUT; }
    else { cv0 = e.v1 - DEEP; cv1 = e.v1 + OUT; }
    cu0 = e.u0 + INSET; cu1 = e.u1 - INSET;
  }
  // ...and the canvas wears whichever picture this cell was hung with. `art`
  // is an index into ART; anything out of range falls back to the first
  // picture rather than to a hole.
  const k = (art >= 0 && art < ART.length) ? art : ART_PICTURES[0];
  return [
    [[e.u0, e.u1, e.v0, e.v1, 0.10, 0.94], BLOCK.STRIPPED_LOG],
    // `whole`, or the canvas wears the CROP of the picture its box happens to
    // cover — which is fine for a flat colour and useless for a drawing: the
    // frames came out showing a magnified corner of the loaf.
    [[cu0, cu1, cv0, cv1, 0.20, 0.84], MAT_ART0 - k, true],
  ];
}

// A READING DESK. A post on a foot, a board sloped up off it, and a book lying
// open on the board. Three boxes and a stack of thin ones — the slope is what
// makes it a lectern rather than a stool, and it is faked the way everything
// in here is faked: steps, small enough that the eye reads a ramp.
const FURN_LECTERN = (() => {
  const out = [
    [[0.18, 0.82, 0.18, 0.82, 0, 0.10], BLOCK.PLANK],        // the foot
    [[0.36, 0.64, 0.36, 0.64, 0.10, 0.68], BLOCK.STRIPPED_LOG],  // the post
  ];
  // the sloped top, in four steps rising toward +v
  for (let i = 0; i < 4; i++) {
    const v0 = 0.10 + i * 0.20;
    out.push([[0.10, 0.90, v0, v0 + 0.22, 0.68 + i * 0.05, 0.75 + i * 0.05],
      BLOCK.PLANK]);
  }
  // ...and the book on it, a shade proud of the board
  for (let i = 0; i < 4; i++) {
    const v0 = 0.16 + i * 0.18;
    out.push([[0.20, 0.80, v0, v0 + 0.19, 0.75 + i * 0.05, 0.79 + i * 0.05],
      BLOCK.BOOKSHELF]);
  }
  return out;
})();

// THE MINT: a screw press, which is the machine every village strikes its coin
// at. The silhouette is the whole design — a heavy head carried on four posts
// over a stone bed, with a weighted bar across the top — and it is the same
// trick the bell and the lantern are built on: what tells you what a thing is,
// at the distance you actually see it from, is its outline.
//
// Which is the trap the first press fell into. It was drawn to look right from
// the three-quarter view its author photographed it from, and a player standing
// beside one in a shop is not at three-quarters: he is a cell and a half away
// looking DOWN, and from there every piece of it was grey iron on grey stone
// under a head the width of the cell. Somebody asked what the object was.
//
// So the rules this list is drawn to, all of them about the angles a player is
// actually at:
//
//   NOTHING BELOW A FIFTH OF A CELL. The old screw was 0.12 across and the
//   posts 0.14, which at this block size is a smudge. Fewer, fatter boxes.
//
//   THE HEAD IS TWO BEAMS, not a lid. A plate the width of the cell is a
//   grey slab from above and hides everything under it; two beams with the
//   screw up the gap between them is a frame you can see into from over the
//   top, which is the one view that used to give nothing at all.
//
//   THE GOLD HAS TO BE ABOVE THE BED, not sunk in it. The die is the only
//   warm colour on the machine and the only part that says what it is FOR;
//   at 0.14 of a cell high behind a bed lip it was a speck, and a speck is
//   what the player saw. It stands proud now and it is over half the cell.
//
//   THE SCREW IS BRONZE, and it is the ONE part that is. Iron on iron reads
//   as one object however it is cut, so the moving column wants a metal of
//   its own — but two warm pieces in the same opening read as a fire in a
//   grate, which is why the punch under it went back to iron.
//
// The bar OVERHANGS the cell — it runs the full width and the weights hang off
// both ends — because a press is turned by swinging it, and a fly bar that
// stops at the frame is a handle nobody could get a hand to. It runs ACROSS
// the head's two beams rather than along them, so from above the whole thing
// is a cross of iron with gold showing through it.
const MINT_BOXES = [
  [[0.03, 0.97, 0.10, 0.90, 0, 0.20], BLOCK.COBBLE],            // the stone bed
  // The die. `whole`, or the crop hands this box the middle of its tile —
  // which is the blank and nothing else, so the bed came out as a slab of gold
  // with the collar cropped off both sides. See emitBox's `whole`: it is the
  // same reason a lantern's cage and a picture's canvas want it.
  [[0.20, 0.80, 0.20, 0.80, 0.20, 0.34], MAT_MINT, true],
  // FOUR posts and not two slabs. Two slabs the depth of the cell close the
  // frame off along the other axis, so a press seen from the side was a solid
  // grey box with a bar on top — you have to be able to see THROUGH a machine
  // from every side or it is a crate.
  [[0.06, 0.26, 0.12, 0.34, 0.20, 0.70], BLOCK.BLOCK_IRON],
  [[0.06, 0.26, 0.66, 0.88, 0.20, 0.70], BLOCK.BLOCK_IRON],
  [[0.74, 0.94, 0.12, 0.34, 0.20, 0.70], BLOCK.BLOCK_IRON],
  [[0.74, 0.94, 0.66, 0.88, 0.20, 0.70], BLOCK.BLOCK_IRON],
  [[0.02, 0.98, 0.10, 0.32, 0.70, 0.82], BLOCK.BLOCK_IRON],     // the head, and
  [[0.02, 0.98, 0.68, 0.90, 0.70, 0.82], BLOCK.BLOCK_IRON],     // its other beam
  [[0.40, 0.60, 0.40, 0.60, 0.50, 0.86], BLOCK.BLOCK_BRONZE],   // the screw
  [[0.28, 0.72, 0.28, 0.72, 0.38, 0.50], BLOCK.BLOCK_IRON],     // the punch
  [[0.42, 0.58, 0, 1, 0.86, 0.98], BLOCK.BLOCK_IRON],           // the fly bar
  [[0.30, 0.70, 0, 0.16, 0.80, 1], BLOCK.BLOCK_IRON],           // its weights
  [[0.30, 0.70, 0.84, 1, 0.80, 1], BLOCK.BLOCK_IRON],
];

// `planet` and the cell are passed because ONE piece of furniture varies by
// where it is: a painting wears the picture that cell was hung with, and the
// world is the only thing that knows which. planet.artAt is set by main.js —
// see the pictures section there — and is absent on a world that has none, in
// which case every frame shows the first picture.
function furnitureBoxes(block, planet, f, u, v, h) {
  if (block === BLOCK.TABLE) return FURN_TABLE;
  if (block === BLOCK.LECTERN) return FURN_LECTERN;
  if (block === BLOCK.MINT) return MINT_BOXES;
  if (CS.isCarpet?.(block)) {
    return [[CARPET_BOX, CS.woolId(CS.carpetTint(block))]];
  }
  if (CS.isPainting?.(block)) {
    return paintingBoxes(block, planet?.artAt?.(f, u, v, h) ?? -1);
  }
  if (CS.isBed?.(block)) return bedBoxes(block);
  if (CS.isChair?.(block)) {
    return [[CHAIR_BACK[CS.chairFacing(block)], BLOCK.PLANK], ...CHAIR_COMMON];
  }
  if (CS.isBench?.(block)) {
    const fc = CS.benchFacing(block);
    return [[BENCH_BACK[fc], BLOCK.PLANK], ...(fc < 2 ? BENCH_U : BENCH_V)];
  }
  if (block === BLOCK.HYDRANT) return HYDRANT_BOXES;
  if (block === BLOCK.SHISHA) return SHISHA_BOXES;
  if (block === BLOCK.TEA_GLASS) return TEA_GLASS_BOXES;
  if (block === BLOCK.TANKARD) return TANKARD_BOXES;
  if (CS.isToilet?.(block)) return TOILET_BOXES[CS.toiletFacing(block)];
  if (CS.isSign?.(block)) return SIGN_BOXES[CS.signFacing(block)];
  if (block === BLOCK.BIN) return BIN_BOXES;
  if (CS.isWire?.(block)) return wireBoxes(block, planet, f, u, v, h);
  if (CS.isRail?.(block)) return CS.railAxis(block) ? RAIL_V : RAIL_U;
  if (CS.isRailTurn?.(block)) return RAIL_TURNS[block - BLOCK.RAIL_TURN_BASE];
  if (CS.isSwitch?.(block)) {
    return CS.switchOn(block) ? SWITCH_ON : SWITCH_OFF;
  }
  if (block === BLOCK.DYNAMO) return DYNAMO_BOXES;
  if (CS.isPowerLamp?.(block)) {
    return CS.powerLampOn(block) ? POWER_LAMP_ON : POWER_LAMP_OFF;
  }
  if (block === BLOCK.LAMP) return FURN_LAMP;
  if (block === BLOCK.STREET_LAMP) return FURN_STREET_LAMP;
  if (block === BLOCK.CAMPFIRE) return FURN_CAMPFIRE;
  // Not furniture as far as cubesphere is concerned — they are placeable
  // lights with ids of their own — but they are built exactly the same way,
  // and they stopped being cubes for exactly the same reason a table did.
  if (block === BLOCK.TORCH) return torchBoxes(planet, f, u, v, h);
  if (block === BLOCK.LANTERN) return LANTERN_BOXES;
  if (block === BLOCK.BELL) return BELL_BOXES;
  return null;
}

function emitFurniture(out, planet, f, u, v, h, block, shade,
                       dirs, span, du0, dv0) {
  for (const [box, mat, whole] of furnitureBoxes(block, planet, f, u, v, h)) {
    emitBox(out, planet, f, u, v, h, box, mat, shade, dirs, span, du0, dv0, 0,
      whole);
  }
}

// Tiles with no inherent up or grain, so turning one a quarter turn is
// invisible except that the repeat stops being obvious. This is a WHITELIST
// on purpose: rotating a tile that does have an orientation — the grass side
// with its fringe, planks, bricks, a furnace front, a ladder — would be a
// glaring bug, and an allow-list fails safe when a tile is added later.
// Grass tops only. Rotation exists to kill the obvious repeat across a
// hillside, which is a problem the ground has and nothing else really does;
// everywhere else it just makes a designed material look inconsistent. It is
// a whitelist so adding a tile later cannot silently start turning it.
// --- blocks that are not quite a whole cell tall ------------------------------
//
// A trodden path is a block with the top scuffed off it: fifteen sixteenths,
// which is what puts a lip on every block of grass beside it and is most of
// why a path reads as a path rather than as brown ground. It is worth doing
// as a height and not as a slab because everything else about it — where you
// stand, what you aim at, what the height field says — is still a whole cell,
// and only the drawn top moves.
//
// Two rules follow, and the second one is the one that costs something:
//
//   * its own top face, and the top edge of its own sides, drop to SHORT_TOP;
//   * a NEIGHBOUR's side face against it can no longer be culled, because the
//     sliver above the path is exactly the bit you are meant to see. Faces
//     above and below it stay culled — it covers those completely — and a
//     path against a path culls as normal, so a wide road has no interior
//     faces at all.
const SHORT = new Set([BLOCK.PATH]);
const SHORT_TOP = 15 / 16;
const topOf = (block) => (SHORT.has(block) ? SHORT_TOP : 1);
const seesPastShort = (nb, block, kind) =>
  kind === 'side' && nb !== block && SHORT.has(nb);

const ROTATABLE = new Set([TILE.GRASS_TOP]);

// How many quarter turns this cell's tile gets. Hashed from the cell so it is
// stable: a block must not spin when its chunk is rebuilt.
let rotateTiles = true;
export function setTileRotation(on) { rotateTiles = on; }

function tileTurn(f, u, v, h, salt) {
  if (!rotateTiles) return 0;
  let n = (f * 6151 + u * 2654435761 + v * 40503 + h * 97 + salt * 31337) | 0;
  n = Math.imul(n ^ (n >>> 12), 2246822519);
  return (n >>> 17) & 3;
}

// Rotate a corner's texture coordinate by `turn` quarter turns about the
// tile's centre. Applied to the CORNER coords before the atlas lookup, so it
// costs nothing at runtime and nothing in the atlas.
function turnUV(turn, tu, tv, out) {
  switch (turn & 3) {
    case 1: out[0] = tv; out[1] = 1 - tu; break;
    case 2: out[0] = 1 - tu; out[1] = 1 - tv; break;
    case 3: out[0] = 1 - tv; out[1] = tu; break;
    default: out[0] = tu; out[1] = tv;
  }
  return out;
}
const _tuv = [0, 0];
const _ao = [1, 1, 1, 1];      // one face's four corner shadows

// --- climate: the grass at the equator ---------------------------------------
//
// It is hotter down there, so the grass is drier, so it is yellower. The whole
// effect is a MULTIPLY on the vertex colour that the faces already carry — no
// second tile, no second material, no extra draw call, and it costs one
// multiply per corner on grass and nothing at all on anything else.
//
// Latitude here is what it is everywhere else in this codebase: |y| of the
// column's own unit direction, the same number cubesphere.js puts its polar
// caps on. So the tint is strongest along |y| = 0 and has faded to nothing by
// `reach`, which puts the dry band roughly inside 25 degrees — a tropic, not
// a gradient smeared over the whole globe.
//
// Deliberately SLIGHT. Grass that goes properly yellow at the equator reads as
// a texture bug rather than as weather; what this is after is the sense, when
// you walk north, that the ground has cooled.
export const GRASS_CLIMATE = {
  reach: 0.42,        // |dir.y| at which the tint is gone entirely
  r: 1.14, g: 1.03, b: 0.66,   // the multiply at the equator itself
};

// 1 at the equator, 0 at `reach` and beyond. Squared, so the middle of the
// band is dry and its edge blends into ordinary green rather than ending on a
// line you can see from the air.
function warmth(y) {
  const lat = y < 0 ? -y : y;
  if (lat >= GRASS_CLIMATE.reach) return 0;
  const k = 1 - lat / GRASS_CLIMATE.reach;
  return k * k;
}

// The per-channel multiply for a column at this latitude, written into `out`.
// Only grass asks: rock, sand and snow are the colours they are wherever they
// lie, and a warm tint on a beach is just a beach that has gone wrong.
const _tint = [1, 1, 1];
function grassTint(y, out = _tint) {
  const k = warmth(y);
  out[0] = 1 + (GRASS_CLIMATE.r - 1) * k;
  out[1] = 1 + (GRASS_CLIMATE.g - 1) * k;
  out[2] = 1 + (GRASS_CLIMATE.b - 1) * k;
  return out;
}

// Which BLOCKS the climate tint applies to. Just the one, and the test exists
// so the cube mesher and the distant shell cannot drift apart about it. The
// grass TUFTS take the same tint, but they are not blocks — the tuft branch
// of the sweep calls grassTint for itself, because a green blade on yellowed
// turf is
// the one combination that would make the whole band read as a mistake.
const isGrassy = (b) => b === BLOCK.GRASS;

// Per-block brightness wobble. It breaks up the repeat of a detailed tile,
// but on a single flat colour it does the opposite: a wall becomes a
// patchwork of slightly different greens, which reads as mush rather than as
// one surface. Flat styles therefore turn it off.
let jitterAmount = 0.10;
export function setJitterAmount(a) { jitterAmount = a; }

function jitter(f, u, v, h) {
  if (jitterAmount <= 0) return 1;
  let n = (f * 8191 + u * 374761393 + v * 668265263 + h * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (1 - jitterAmount / 2)
    + jitterAmount * (((n ^ (n >>> 16)) >>> 0) / 4294967296);
}

// --- the chunk snapshot -----------------------------------------------------
//
// THE reason a big planet stutters, and the one worth reading before touching
// anything below it.
//
// The mesher used to ask the planet for a cell the way the game does: through
// planet.get, which re-derives the terrain from noise on every call. One
// 32x32 chunk did that 197,000 times — seven reads per cell (itself and its
// six neighbours), times four separate passes over the same ground, times a
// fifth pass for the tufts. On a radius-800 world that is 220 ms of frozen
// game for ONE chunk, and 1.9 s for the worst of them. The 5 ms streaming
// budget could not help: drain() checks the clock BETWEEN chunks, and a chunk
// is atomic.
//
// So the chunk is read ONCE into a flat array, and everything meshes off that
// array. This is exactly what Minecraft does — copy the section and its
// border into a local buffer, then mesh from the buffer and never from the
// world — and it is most of why Minecraft can stream a chunk without a hitch.
//
// Only the band that can show a face is copied: from a little under the
// lowest solid top anywhere around the column, up to one cell over its top.
// Above that band every cell is air, by columnTop's own definition, so the
// answer is free. Below it the read falls back to planet.get, which is
// correct and merely slower — and it is a cell buried in unbroken rock, so it
// essentially never happens.

const TSPAN = CHUNK + 2;             // the chunk, plus a one-column border
const TCELLS = TSPAN * TSPAN;
const _tops = new Int16Array(TCELLS);
const _solids = new Int16Array(TCELLS);
const _floor = new Int32Array(TCELLS);
const _bandLo = new Int32Array(TCELLS);
const _bandHi = new Int32Array(TCELLS);
const _bandOff = new Int32Array(TCELLS);
let _cells = new Uint16Array(0);
// Whose snapshot is currently in those arrays. Meshing is synchronous and one
// chunk at a time, so a single module-level scratch is safe and saves four
// typed-array allocations per chunk.
let _snap = null, _snapF = 0, _snapU = 0, _snapV = 0;

function snapshot(planet, f, u0, v0) {
  _snap = planet; _snapF = f; _snapU = u0; _snapV = v0;
  for (let du = -1; du <= CHUNK; du++) {
    for (let dv = -1; dv <= CHUNK; dv++) {
      const c = (du + 1) * TSPAN + (dv + 1);
      _tops[c] = planet.columnTop(f, u0 + du, v0 + dv);
      _solids[c] = planet.columnSolidTop(f, u0 + du, v0 + dv);
      _floor[c] = _solids[c];
    }
  }
  // How far down the band has to reach. The cell loop starts a column at the
  // LOWEST solid top among it and its four neighbours — that is what exposes
  // the wall of a cliff — so a column must hold whatever its neighbours might
  // ask it for. One "take the lowest of the five" spreads that one step; two
  // passes spread it to the border columns, which are read across by the
  // chunk cells inside them. 1156 comparisons a pass, against one planet.get
  // saved per cell: not a close trade.
  for (let pass = 0; pass < 2; pass++) {
    for (let du = -1; du <= CHUNK; du++) {
      for (let dv = -1; dv <= CHUNK; dv++) {
        const c = (du + 1) * TSPAN + (dv + 1);
        let m = _floor[c];
        for (const [ddu, ddv] of NB4) {
          const nu = du + ddu, nv = dv + ddv;
          if (nu < -1 || nu > CHUNK || nv < -1 || nv > CHUNK) continue;
          const n = (nu + 1) * TSPAN + (nv + 1);
          if (_floor[n] < m) m = _floor[n];
        }
        _bandLo[c] = m;      // staged, so a pass reads only the pass before it
      }
    }
    _floor.set(_bandLo);
  }

  let need = 0;
  for (let c = 0; c < TCELLS; c++) {
    const top = _tops[c];
    const lo = Math.max(0, _floor[c] - 2);
    // top + 1, because the top face is culled against the cell above it
    const hi = top < 0 ? lo - 1 : Math.min(H - 1, top + 1);
    _bandLo[c] = lo; _bandHi[c] = hi; _bandOff[c] = need;
    if (hi >= lo) need += hi - lo + 1;
  }
  // grown, never shrunk: a mountain chunk sizes it once and the flat ones
  // after it reuse the same buffer
  if (_cells.length < need) _cells = new Uint16Array(need + (need >> 1) + 1024);
  for (let du = -1; du <= CHUNK; du++) {
    for (let dv = -1; dv <= CHUNK; dv++) {
      const c = (du + 1) * TSPAN + (dv + 1);
      const lo = _bandLo[c], hi = _bandHi[c];
      if (hi < lo) continue;
      planet.fillColumn(f, u0 + du, v0 + dv, lo, hi, _cells, _bandOff[c]);
    }
  }
}

// A cell of the snapshot, addressed the way the cell loop thinks: chunk-
// relative column, absolute layer. du and dv run -1..CHUNK — the loop only
// ever steps one column outside the chunk it is meshing.
function cellAt(du, dv, h) {
  const c = (du + 1) * TSPAN + (dv + 1);
  if (h > _bandHi[c]) return BLOCK.AIR;          // nothing above a column's top
  const lo = _bandLo[c];
  if (h >= lo) return _cells[_bandOff[c] + h - lo];
  return _snap.get(_snapF, _snapU + du, _snapV + dv, h);   // buried; rare
}

// --- how deep the water is ---------------------------------------------------
//
// The Realistic style draws water as a surface you see INTO: clear over the
// shallows, dark and opaque over the deep, foam where it meets the shore. The
// shader cannot know how deep the water under a fragment is, but the mesher
// can, so under that style a water surface's vertex colour carries it — green
// is the depth of the water at that corner, averaged over the four columns
// that share the corner, so it shelves smoothly to nothing at the shore
// instead of stepping block by block. Every other style keeps its shade there.
let waterDepthOn = false;
export function setWaterDepth(on) { waterDepthOn = !!on; }
export const WATER_DEEP = 8;           // the depth green = 1 stands for
function waterDepthAt(du, dv, h) {
  if (cellAt(du, dv, h) !== BLOCK.WATER) return 0;
  let d = 1;
  while (d < WATER_DEEP && cellAt(du, dv, h - d) === BLOCK.WATER) d++;
  return d;
}

// --- who draws what ---------------------------------------------------------

const P_SOLID = 0, P_GLASS = 1, P_WATER = 2, P_LAVA = 3;
// The four cube passes and the cross planes, made once and rewound per chunk.
const PASS_BUFS = [makeBuf(), makeBuf(), makeBuf(), makeBuf()];
const TUFT_BUF = makeBuf(true);

// Which pass owns a block, or -1 for "no cube here" — air, and the cross
// planes, which the tuft buffers pick up in the same sweep.
//
// Lava is named before the solid test rather than after it. The old solid
// test excluded air, water, plants, ladders and tints but not lava, so every
// exposed lava face was meshed TWICE — once in the solid pass and once in
// the lava one
// — which is a doubled cost and two coplanar surfaces fighting over the same
// depth. Nobody saw it because the only lava most worlds have is the core
// band, which is buried; dig to it, or make a volcanic world, and it showed.
function passOf(b) {
  if (b === BLOCK.AIR) return -1;
  if (b === BLOCK.WATER) return P_WATER;
  if (b === BLOCK.LAVA) return P_LAVA;
  if (PLANTS.has(b) || isLadder(b)) return -1;
  return isTinted(b) ? P_GLASS : P_SOLID;
}

// Is a face against neighbour `n` worth drawing, for the pass `p`?
//
//   solid   air, water and anything see-through
//   glass   the same, but NOT other tinted glass: a wall of it is meant to
//           read as one sheet of colour, and leaving the interior faces
//           standing blends every pane behind the first one again
//   water   water is not in TRANSPARENT, so water culls water — otherwise a
//           slab dropped in a pond punches a hole in the surface
//   lava    the same terms as water, so a lava lake is one surface too
function facesOut(p, n) {
  if (n === BLOCK.AIR) return true;
  if (p === P_SOLID) {
    return n === BLOCK.WATER || TRANSPARENT.has(n) || isLadder(n);
  }
  if (p === P_GLASS) {
    return n === BLOCK.WATER
      || ((TRANSPARENT.has(n) || isLadder(n)) && !CS.isTintedGlass?.(n));
  }
  return TRANSPARENT.has(n) || isLadder(n);
}

// Tinted glass and tinted panes: the alpha-BLENDED pass. Clear glass and
// clear panes stay in the solid pass — they have nothing to tint with, so an
// alpha cutout renders them perfectly well and keeps them out of the sorted
// queue.
const isTinted = (b) => !!(CS.isTintedGlass?.(b)
  || (CS.isPane?.(b) && CS.paneTint?.(b) >= 0));

// --- cross planes -----------------------------------------------------------
//
// Grass tufts, flowers, saplings, wheat and ladders are all the same trick:
// alpha-tested quads with no volume, so the texture's holes are the shape.
// They share one geometry (`tufts`) because they share one material — the
// only double-sided, alpha-tested one in the scene.

// A ladder panel's two ends, as cell fractions [uA, vA, uB, vB], for facing
// 0..3 = +u, -u, +v, -v — the side of the cell the ladder hangs on, the same
// convention stairs use. The panel sits a sliver clear of that wall so the two
// never land on the same plane, and A -> B is ordered so the quad's front
// looks away from the wall, at the player climbing it. (The tuft material is
// double sided, so this only matters if it ever stops being.)
const LADDER_INSET = 0.06;
const LADDER_ENDS = [
  [1 - LADDER_INSET, 1, 1 - LADDER_INSET, 0],   // +u wall, normal -u
  [LADDER_INSET, 0, LADDER_INSET, 1],           // -u wall, normal +u
  [0, 1 - LADDER_INSET, 1, 1 - LADDER_INSET],   // +v wall, normal -v
  [1, LADDER_INSET, 0, LADDER_INSET],           // -v wall, normal +v
];

// [tile, height in cells, width in cells] for each cross-plane block.
//
// Width matters more than it looks. A cross quad drawn corner to corner spans
// the cell DIAGONAL — 1.41 blocks — and our plant tiles are drawn edge to edge
// with no transparent margin, so left alone every plant renders half again as
// wide as its own block. Minecraft gets away with the full diagonal because
// its plant textures carry that margin inside the tile; ours do not, so the
// margin lives here instead. A mushroom at 1.41 read as furniture.
// The fourth number is how much of the wind this species takes (see wind.js):
// it scales the per-vertex `sway` attribute, so wheat rolls in waves, a
// flower nods on its stem, and a mushroom — which has no stem to speak of —
// barely moves at all.
function plantLook(b) {
  switch (b) {
    case BLOCK.FLOWER_RED: return [TILE.FLOWER_RED, 0.8, 0.8, 0.75];
    case BLOCK.FLOWER_YELLOW: return [TILE.FLOWER_YELLOW, 0.8, 0.8, 0.75];
    case BLOCK.FLOWER_BLUE: return [TILE.FLOWER_BLUE, 0.8, 0.8, 0.75];
    case BLOCK.MUSHROOM: return [TILE.MUSHROOM, 0.55, 0.62, 0.12];
    case BLOCK.SAPLING: return [TILE.SAPLING, 0.9, 0.9, 0.45];
    case BLOCK.WHEAT_YOUNG: return [TILE.WHEAT_YOUNG, 0.6, 0.95, 0.7];
    case BLOCK.WHEAT: return [TILE.WHEAT, 0.95, 0.95, 1.0];
    // A cane fills its cell top to bottom — a stalk is a COLUMN of these, and
    // anything less than 1.0 tall leaves a gap of daylight at every joint.
    // Narrow, because bamboo is narrow, and it barely sways: a cane is stiff.
    case BLOCK.BAMBOO: return [TILE.BAMBOO, 1.0, 0.7, 0.25];
    default: return CROP_LOOK.get(b) ?? null;   // the kitchen garden, see above
  }
}

// Half-extent along each cell axis that makes a corner-to-corner cross quad
// come out `w` blocks wide: the quad's width is 2 * half * sqrt(2).
const halfFor = (w) => w / (2 * Math.SQRT2);

// Decorative grass tufts: two crossed quads standing on exposed grass, which
// breaks up the flat top faces the way Minecraft's tall grass does. Alpha
// tested, so the blades read as blades rather than billboards. Plants and
// ladders ride along in the same buffers.
// ONE sweep of the chunk, five sets of buffers out of it.
//
// This used to be five sweeps — solid, tinted glass, water, lava, tufts —
// each of which rebuilt the corner directions, rebuilt the column tops, and
// walked every cell again to reject the four blocks in five that were not
// its business. Four fifths of that work produced nothing at all: an ordinary
// hillside chunk has no tinted glass in it, no water and no lava, and it paid
// three full passes to discover that three times.
//
// A block belongs to exactly one pass (see passOf), so the sweep can decide
// where a cell's faces go as it reads it, and the geometry comes out
// identical. The cost is one walk instead of five, over a snapshot instead of
// over the noise generator.
function buildAll(planet, f, u0, v0) {
  const uEnd = Math.min(u0 + CHUNK, S), vEnd = Math.min(v0 + CHUNK, S);

  // corner directions are shared between neighbouring cells — computed once
  // for the whole chunk, and now shared by the cubes and the cross planes too
  const span = CHUNK + 1;
  const dirs = new Float64Array(span * span * 3);
  const _d3 = [0, 0, 0];
  for (let du = 0; du < span; du++) {
    for (let dv = 0; dv < span; dv++) {
      dirFromCell(f, u0 + du, v0 + dv, _d3);
      const i = (du * span + dv) * 3;
      dirs[i] = _d3[0]; dirs[i + 1] = _d3[1]; dirs[i + 2] = _d3[2];
    }
  }

  snapshot(planet, f, u0, v0);

  // one set of buffers per cube pass, indexed by P_SOLID..P_LAVA, plus the
  // cross planes. Made once for the module and rewound here — see makeBuf.
  for (const b of PASS_BUFS) { b.n = 0; b.ni = 0; }
  const outs = PASS_BUFS;
  const tuft = TUFT_BUF;
  tuft.n = 0; tuft.ni = 0;

  // --- the cross planes -----------------------------------------------------
  // Tufts, flowers, crops, cane and ladders: one geometry, because they share
  // the one double-sided alpha-tested material, and the only pass carrying a
  // `sway` attribute for the wind.
  const cornerAt = (du, dv, rad, o) => {
    const i = (du * span + dv) * 3;
    if (CS.FLAT) { o[0] = dirs[i]; o[1] = rad; o[2] = dirs[i + 2]; return; }
    o[0] = dirs[i] * rad; o[1] = dirs[i + 1] * rad; o[2] = dirs[i + 2] * rad;
  };

  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
  const pointAt = (cu, cv, rad, o) => {
    dirFromCell(f, cu, cv, _bdir);
    CS.posAt(_bdir, rad, o);
  };

  // The climate multiply for whatever is being emitted right now — see
  // grassTint. Only the TUFTS ever set it away from white: a flower, a crop
  // or a ladder has no business inheriting the colour of the turf.
  let qr = 1, qg = 1, qb = 1;

  // one quad from a (lo, lo), b (hi, lo), c (lo, hi), d (hi, hi).
  // `swayAmp` feeds the wind shader: the root row stays planted at 0 and the
  // tip row carries the species' full amplitude — see wind.js.
  const quad = (tile, swayAmp = 0) => {
    bufRoom(tuft);
    const base = tuft.n;
    for (const [p, tu, tv] of [[a, 0, 0], [b, 1, 0], [c, 0, 1], [d, 1, 1]]) {
      const [au, av] = tileUV(tile, tu, tv);
      bufVertAt(tuft, p, qr, qg, qb, au, av, tv * swayAmp);
    }
    bufQuad(tuft, base);
  };

  // The two crossed diagonals of a cell, rLo to rHi. `half` is the extent
  // either side of the cell centre; 0.5 is the cell's own corners, less pulls
  // the plant in so it does not overhang its block. The full-corner case keeps
  // the cheap cached-corner path, since tufts are by far the most common.
  const cross = (du, dv, rLo, rHi, tile, half = 0.5, swayAmp = 0) => {
    if (half === 0.5) {
      cornerAt(du, dv, rLo, a); cornerAt(du + 1, dv + 1, rLo, b);
      cornerAt(du, dv, rHi, c); cornerAt(du + 1, dv + 1, rHi, d);
      quad(tile, swayAmp);
      cornerAt(du + 1, dv, rLo, a); cornerAt(du, dv + 1, rLo, b);
      cornerAt(du + 1, dv, rHi, c); cornerAt(du, dv + 1, rHi, d);
      quad(tile, swayAmp);
      return;
    }
    const cu = u0 + du + 0.5, cv = v0 + dv + 0.5;
    pointAt(cu - half, cv - half, rLo, a); pointAt(cu + half, cv + half, rLo, b);
    pointAt(cu - half, cv - half, rHi, c); pointAt(cu + half, cv + half, rHi, d);
    quad(tile, swayAmp);
    pointAt(cu + half, cv - half, rLo, a); pointAt(cu - half, cv + half, rLo, b);
    pointAt(cu + half, cv - half, rHi, c); pointAt(cu - half, cv + half, rHi, d);
    quad(tile, swayAmp);
  };

  // a ladder: a single flat panel across the cell, pressed to its wall
  const panel = (u, v, rLo, rHi, facing) => {
    const [uA, vA, uB, vB] = LADDER_ENDS[facing & 3];
    pointAt(u + uA, v + vA, rLo, a); pointAt(u + uB, v + vB, rLo, b);
    pointAt(u + uA, v + vA, rHi, c); pointAt(u + uB, v + vB, rHi, d);
    quad(TILE.LADDER);
  };

  const plants = planet.preset.plants;

  // --- the sweep ------------------------------------------------------------
  for (let u = u0; u < uEnd; u++) {
    for (let v = v0; v < vEnd; v++) {
      const du = u - u0, dv = v - v0;
      const tc = (du + 1) * TSPAN + (dv + 1);
      const hEnd = _tops[tc];
      if (hEnd < 0) continue;

      // Bound the h loop to the band that can actually show a face. The floor
      // comes from the SOLID top (contiguous rock from the core), not the
      // column top: a column can be solid, then air, then leaves, and the
      // ground face under that canopy is exposed even though the column
      // reaches far higher. A cell is buried only if all four lateral
      // neighbours are solid there and its own cell above is solid too.
      const lowestNbr = Math.min(
        _solids[tc - TSPAN], _solids[tc + TSPAN],
        _solids[tc - 1], _solids[tc + 1]);
      const hStart = Math.max(0, Math.min(lowestNbr, _solids[tc] - 1));

      // Tufts are drawn, not stored: no block stands here, the mesher just
      // puts a cross-plane on a fraction of the grass. That is why a world
      // with no plants in it still came up shaggy — scatterPlants was being
      // skipped and this was not. `plants` is the same density that governs
      // flowers, so a preset that says nothing grows now means it.
      if (plants && hEnd + 1 < H && cellAt(du, dv, hEnd) === BLOCK.GRASS
          && cellAt(du, dv, hEnd + 1) === BLOCK.AIR) {
        // Deterministic scatter. Half the grass carrying a tuft read as a
        // shag carpet — the ground vanished under it. A twelfth leaves the
        // block faces visible and the tufts read as scattered clumps. They
        // are also kept inside their own block: at the full cell diagonal a
        // tuft overhangs its neighbours, which is the other half of why the
        // ground disappeared.
        let n = (f * 8191 + u * 92837111 + v * 689287499) | 0;
        n = Math.imul(n ^ (n >>> 15), 2246822519);
        const roll = (n >>> 8) & 255;
        // PRAIRIE. Open level grassland carries far more grass, and longer
        // grass, than a hillside does — which is what makes a plain read as
        // a plain rather than as the same scatter everywhere. "Level" is
        // measured from the four neighbouring column tops, and the test only
        // runs for cells that already passed the wider roll, so the ordinary
        // eight-per-hundred scatter costs exactly what it always did.
        let prairie = false;
        if (roll <= 90) {
          const t0 = _tops[tc - TSPAN], t1 = _tops[tc + TSPAN];
          const t2 = _tops[tc - 1], t3 = _tops[tc + 1];
          prairie = Math.abs(t0 - hEnd) <= 1 && Math.abs(t1 - hEnd) <= 1
            && Math.abs(t2 - hEnd) <= 1 && Math.abs(t3 - hEnd) <= 1;
        }
        if (prairie || roll <= 20) {
          // a hand's breadth on the slopes, knee-high out on the flat
          const height = prairie
            ? 0.78 + (((n >>> 3) & 7) / 7) * 0.42
            : 0.4 + (((n >>> 3) & 7) / 7) * 0.28;
          const rLo = R0 + hEnd + 1;
          const t = grassTint(dirs[(du * span + dv) * 3 + 1]);
          qr = t[0]; qg = t[1]; qb = t[2];
          cross(du, dv, rLo, rLo + height, TILE.TUFT, halfFor(1), 1);
          qr = qg = qb = 1;
        }
      }

      for (let h = hStart; h <= hEnd; h++) {
        const block = cellAt(du, dv, h);
        if (block === BLOCK.AIR) continue;

        // the cross planes first: they have no cube faces to cull and they
        // are the one thing in the sweep that is not a box
        const look = plantLook(block);
        if (look) {
          cross(du, dv, R0 + h, R0 + h + look[1], look[0],
            halfFor(look[2]), look[3]);
          continue;
        }
        if (isLadder(block)) {
          panel(u, v, R0 + h, R0 + h + 1, ladderFacing(block));
          continue;
        }

        const p = passOf(block);
        if (p < 0) continue;
        const out = outs[p];
        // Water opts out of the wobble: the per-block jitter exists to break
        // up a tiled texture's repeat, but water is meant to read as one
        // continuous body. Stacked with the wave/fresnel shading, static
        // per-cell noise turned the sea into a broken-glass checker pattern.
        const shadeJitter = p === P_WATER ? 1 : jitter(f, u, v, h);
        // ...and out of the contact shadow, for the same reason and one more:
        // the sea is the largest single surface in the world, so a rim of
        // shade wherever it meets the shore is the most visible edge case
        // there is, and a fluid does not collect dirt in a corner anyway.
        const aoOn = p !== P_WATER;

        // partial blocks are their own little box unions
        if (isStair(block) || isSlab(block)) {
          emitShape(out, planet, f, u, v, h, block, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (CS.isDoorBlock?.(block)) {
          emitDoor(out, planet, f, u, v, h, block, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (CS.isFurniture?.(block) || block === BLOCK.TORCH
            || block === BLOCK.LANTERN || block === BLOCK.BELL) {
          emitFurniture(out, planet, f, u, v, h, block, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (block === BLOCK.FENCE) {
          emitFence(out, planet, f, u, v, h, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (CS.isWall?.(block)) {
          emitWall(out, planet, f, u, v, h, block, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (CS.isGate?.(block)) {
          emitGate(out, planet, f, u, v, h, block, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (CS.isPane?.(block)) {
          emitPane(out, planet, f, u, v, h, block, shadeJitter,
            dirs, span, du, dv);
          continue;
        }
        if (block === BLOCK.POST) {
          emitBox(out, planet, f, u, v, h, POST_BOX, BLOCK.LOG, shadeJitter,
            dirs, span, du, dv, 0);
          continue;
        }

        const top = topOf(block);
        // The equator's dry grass. One lookup per cell, not per corner, and
        // only on grass — see grassTint above.
        let tr = 1, tg = 1, tb = 1;
        if (isGrassy(block)) {
          const t = grassTint(dirs[(du * span + dv) * 3 + 1]);
          tr = t[0]; tg = t[1]; tb = t[2];
        }
        for (const def of FACE_DEFS) {
          const [ou, ov, oh] = def.off;
          const nb = cellAt(du + ou, dv + ov, h + oh);
          if (!facesOut(p, nb) && !seesPastShort(nb, block, def.kind)) continue;

          const tile = tileFor(block, def.kind);
          // one turn for the whole face, or its four corners would disagree
          // and the tile would be sheared rather than rotated
          const turn = ROTATABLE.has(tile)
            ? tileTurn(f, u, v, h, def.axis * 2 + (def.dir > 0 ? 1 : 0)) : 0;
          const mq = macroOf(tile, def, u, v, h);
          bufRoom(out);
          const base = out.n;
          const s = def.shade * shadeJitter;
          for (let ci = 0; ci < 4; ci++) {
            const [cdu, cdv, dh, tu, tv] = def.corners[ci];
            const di = ((du + cdu) * span + (dv + cdv)) * 3;
            const rad = R0 + h + (dh ? top : 0);
            turnUV(turn, tu, tv, _tuv);
            const [au, av] = tileUV(tile, _tuv[0], _tuv[1]);
            // How boxed in this corner is. Two filled sides bury it whatever
            // the diagonal does — you cannot see round a corner that is
            // already closed on both sides — which is the one case the plain
            // count gets wrong, and the case that draws every inside corner
            // in the world.
            let ao = 1;
            if (aoOn) {
              const o = def.aoOff[ci];
              const s1 = occludes(cellAt(du + o[0][0], dv + o[0][1], h + o[0][2]));
              const s2 = occludes(cellAt(du + o[1][0], dv + o[1][1], h + o[1][2]));
              ao = AO_LUT[s1 && s2 ? 0
                : 3 - (s1 + s2
                  + occludes(cellAt(du + o[2][0], dv + o[2][1], h + o[2][2])))];
            }
            _ao[ci] = ao;
            const sa = s * ao;
            let gg = sa * tg;
            if (waterDepthOn && p === P_WATER) {
              if (def.kind === 'top') {
                let dsum = 0;
                for (let i = 0; i < 2; i++) {
                  for (let j = 0; j < 2; j++) {
                    dsum += waterDepthAt(du + cdu - 1 + i, dv + cdv - 1 + j, h);
                  }
                }
                gg = dsum / (4 * WATER_DEEP);
              } else gg = 1 / WATER_DEEP;
            }
            bufVert(out, dirs, di, rad, sa * tr, gg, sa * tb, au + mq, av);
          }
          // seam between the brighter pair — see bufQuadFlip
          if (_ao[0] + _ao[3] > _ao[1] + _ao[2]) bufQuadFlip(out, base);
          else bufQuad(out, base);
        }
      }
    }
  }

  // Water's material reads real normals for the wave heave and the fresnel
  // shine. computeVertexNormals is otherwise unused in this whole file —
  // every other pass is an unlit MeshBasicMaterial with baked vertex-colour
  // shading, so a geometric normal would just sit there unread.
  const water = bufGeo(outs[P_WATER]);
  if (water) water.computeVertexNormals();

  return {
    solid: bufGeo(outs[P_SOLID]),
    glass: bufGeo(outs[P_GLASS]),
    water,
    lava: bufGeo(outs[P_LAVA]),
    tufts: bufGeo(tuft),
  };
}

export function buildChunkGeometries(planet, f, u0, v0) {
  // Trees are generated on demand now, and a crown spills two columns into
  // the neighbouring chunk, so bake this chunk's region and the ring around
  // it before reading any column. Idempotent, so the cost is a Set lookup
  // once the ground has been visited.
  planet.ensureFeatures?.(f, u0 - 2, v0 - 2, u0 + CHUNK + 1, v0 + CHUNK + 1);
  return buildAll(planet, f, u0, v0);
}

export function chunkList() {
  const out = [];
  for (let f = 0; f < 6; f++) {
    for (let u = 0; u < S; u += CHUNK) {
      for (let v = 0; v < S; v += CHUNK) out.push([f, u, v]);
    }
  }
  return out;
}

// --- distant detail --------------------------------------------------------
//
// The visible hemisphere of a radius-800 planet is ~4700 chunks and 1.7 GB of
// geometry — it cannot be drawn as chunks at all. So from orbit the ground is
// one merged surface per cube face, sampled every `step` columns: 25 MB and
// six draw calls. At the minimum orbit distance a sample is well under a
// pixel across, so the loss is invisible. Top faces plus a skirt down to any
// lower neighbour, which is the same face-culling rule the chunk mesher uses,
// so there are no gaps.

const _sdir = [0, 0, 0];

class Shell {
  constructor(planet, material, samples = SHELL_SAMPLES) {
    this.planet = planet;
    this.material = material;
    this.group = new THREE.Group();
    this.step = Math.max(1, Math.round(S / samples));
    this.n = Math.ceil(S / this.step);
    const m = this.n + 2;                 // one ring of samples off each edge
    this.tops = new Int16Array(m * m);
    // Uint16, like the world's own columns: a block id is no longer a byte,
    // and a shell that truncated one would draw a bamboo grove as grass.
    this.blocks = new Uint16Array(m * m);
    this.corners = new Float64Array((this.n + 1) * (this.n + 1) * 3);
    this.f = 0; this.phase = 0; this.row = -1;
    this.done = false;
    this.triangles = 0;
    this.reset();
  }

  reset() { this.pos = []; this.col = []; this.uv = []; this.idx = []; }

  // one row of work per step, so a huge shell spreads over frames
  work(deadline) {
    while (!this.done) {
      if (this.phase === 0) this.sampleRow(); else this.emitRow();
      if (performance.now() >= deadline) return;
    }
  }

  sampleRow() {
    const p = this.planet, n = this.n, m = n + 2, s = this.step, half = s >> 1;
    const i = this.row;
    // the outer ring sits one column off the face; columnTop reprojects it
    // onto the neighbouring face for us, which is what seals the cube edges
    const su = i < 0 ? -1 : i >= n ? S : Math.min(i * s + half, S - 1);
    for (let j = -1; j <= n; j++) {
      const sv = j < 0 ? -1 : j >= n ? S : Math.min(j * s + half, S - 1);
      const t = p.columnTop(this.f, su, sv);
      const q = (i + 1) * m + (j + 1);
      this.tops[q] = t;
      this.blocks[q] = t >= 0 ? p.get(this.f, su, sv, t) : 0;
    }
    if (i >= 0) {
      const cu = Math.min(i * s, S), n1 = n + 1;
      for (let j = 0; j <= n; j++) {
        dirFromCell(this.f, cu, Math.min(j * s, S), _sdir);
        const o = (i * n1 + j) * 3;
        this.corners[o] = _sdir[0];
        this.corners[o + 1] = _sdir[1];
        this.corners[o + 2] = _sdir[2];
      }
    }
    this.row++;
    if (this.row > n) { this.phase = 1; this.row = 0; }
  }

  emitRow() {
    const n = this.n, m = n + 2, s = this.step, f = this.f;
    const i = this.row;
    for (let j = 0; j < n; j++) {
      const q = (i + 1) * m + (j + 1);
      const ta = this.tops[q];
      if (ta < 0) continue;
      const b = this.blocks[q];
      const sh = jitter(f, i * s, j * s, ta);
      const hi = R0 + ta + 1;
      // The equator's dry grass, on the distant shell as well as up close.
      // Without it the yellow band ends at the fog and the far hills are a
      // different climate from the ground under your feet.
      const t = isGrassy(b) ? grassTint(this.corners[(i * (this.n + 1) + j) * 3 + 1])
        : null;
      this.quad(i, j, hi, hi, FACE_DEFS[0], tileFor(b, 'top', true), sh, t);
      for (let k = 2; k < 6; k++) {          // 0 is the top, 1 the unseen base
        const def = FACE_DEFS[k];
        const tb = this.tops[(i + 1 + def.off[0]) * m + (j + 1 + def.off[1])];
        if (tb >= ta) continue;
        this.quad(i, j, R0 + (tb < -1 ? -1 : tb) + 1, hi, def,
          tileFor(b, 'side', true), sh, t);
      }
    }
    this.row++;
    if (this.row >= n) this.finishFace();
  }

  quad(i, j, lo, hi, def, tile, shadeJitter, tint = null) {
    const n1 = this.n + 1, c = this.corners;
    const base = this.pos.length / 3;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    for (const [du, dv, dh, tu, tv] of def.corners) {
      const o = ((i + du) * n1 + (j + dv)) * 3;
      const r = dh ? hi : lo;
      pushPos(this.pos, c, o, r);
      const s = def.shade * shadeJitter;
      this.col.push(s * tr, s * tg, s * tb);
      const [au, av] = tileUV(tile, tu, tv);
      this.uv.push(au, av);
    }
    this.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }

  finishFace() {
    if (this.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setIndex(this.idx);
      this.group.add(new THREE.Mesh(g, this.material));
      this.triangles += this.idx.length / 3;
    }
    this.reset();
    this.f++;
    this.row = -1;
    this.phase = 0;
    if (this.f > 5) this.done = true;
  }

  dispose() {
    while (this.group.children.length) {
      const m = this.group.children[0];
      this.group.remove(m);
      m.geometry.dispose();
    }
  }
}

// --- view-dependent streaming ----------------------------------------------
//
// Meshing the whole planet at load costs 19 s and 3.5 GB at radius 800, so
// chunks are built only where they can be seen, a few milliseconds per frame,
// nearest first. Three things decide what exists and what is drawn:
//
//   load    within viewDist of the player — beyond the fog there is nothing
//           to see, and on a globe the horizon is only sqrt(2*R*eye) away
//   horizon a chunk on the far side of the planet is inside the frustum but
//           behind the globe; Three.js cannot know that, so we test it
//   frustum the usual bounding-sphere test, done once per chunk rather than
//           once per mesh
//
// Small planets skip all of the loading logic: everything is wanted, nothing
// is ever evicted, and only the culling applies.

const _sphere = new THREE.Sphere();
const _focus = new THREE.Vector3();

export class WorldView {
  constructor(planet, group, materials, opts = {}) {
    this.planet = planet;
    // Tinted glass draws in a blended pass of its own. Defaulting it to the
    // solid material means a caller that has never heard of that pass
    // (avatar.html, blocks.html) still draws glass alpha-tested, exactly as
    // it used to, instead of losing it.
    this.mats = { glass: materials.solid, ...materials };
    // how far a chunk may be and still be handed to the shadow passes — set
    // by main.js from the sun's own shadow box. See cull().
    this.shadowReach = opts.shadowReach ?? 96;
    this.root = group;
    this.chunkGroup = new THREE.Group();
    this.shellGroup = new THREE.Group();
    group.add(this.chunkGroup, this.shellGroup);

    this.nc = Math.ceil(S / CHUNK);
    this.count = 6 * this.nc * this.nc;
    this.full = this.count <= (opts.fullChunkBudget ?? FULL_WORLD_CHUNKS);
    this.baseViewDist = opts.viewDistance
      ?? (3.4 * Math.sqrt(2 * R * 1.55) + 2 * CHUNK);
    this.viewMult = opts.viewMult ?? 1;
    this.viewDist = this.baseViewDist * this.viewMult;
    this.keepDist = this.viewDist * 1.4;

    this.live = new Map();      // chunk key -> { meshes: [] }
    this.queue = [];            // keys waiting to be built, farthest first
    this.chunkMs = 2;           // running cost of a build; see drain()
    this.dirty = new Set();
    this.triangles = 0;
    this.visible = 0;
    this.mode = 'orbit';

    this.dirs = new Float32Array(this.count * 3);
    this.spheres = new Float32Array(this.count * 4);
    this.initChunks();

    this.shell = this.full ? null : new Shell(planet, materials.solid,
      opts.shellSamples ?? SHELL_SAMPLES);
    if (this.shell) this.shellGroup.add(this.shell.group);

    this.lastDir = new THREE.Vector3(0, 0, 0);
    this.needRefresh = true;
    this.frustum = new THREE.Frustum();
    this.pv = new THREE.Matrix4();
  }

  key(f, i, j) { return (f * this.nc + i) * this.nc + j; }

  // How far the streamer reaches, as a multiple of what this world's size
  // asks for. Live: the next refresh re-plans against the new distance, so
  // the setting can be dragged about while standing in the world and watched.
  // `needRefresh` is the whole of what makes it take effect — refresh()
  // otherwise skips the scan until the player has moved half a chunk.
  setViewDistance(mult = 1) {
    if (mult === this.viewMult) return;
    this.viewMult = mult;
    this.viewDist = this.baseViewDist * mult;
    this.keepDist = this.viewDist * 1.4;
    this.needRefresh = true;
  }

  // centre direction and bounding sphere of every chunk, once. posAt makes
  // the centres and corners come out right in both embeddings, so the flat
  // world's bounding spheres are exact boxes-in-spheres over the plane.
  initChunks() {
    const d = [0, 0, 0], p = [0, 0, 0];
    const rMid = R0 + H / 2;
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < this.nc; i++) {
        for (let j = 0; j < this.nc; j++) {
          const k = this.key(f, i, j);
          const u0 = i * CHUNK, v0 = j * CHUNK;
          const u1 = Math.min(u0 + CHUNK, S), v1 = Math.min(v0 + CHUNK, S);
          dirFromCell(f, (u0 + u1) / 2, (v0 + v1) / 2, d);
          this.dirs[k * 3] = d[0];
          this.dirs[k * 3 + 1] = d[1];
          this.dirs[k * 3 + 2] = d[2];
          CS.posAt(d, rMid, p);
          const cx = p[0], cy = p[1], cz = p[2];
          let rad = 0;
          for (const [cu, cv] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) {
            dirFromCell(f, cu, cv, d);
            for (const rr of [R0, R0 + H]) {
              CS.posAt(d, rr, p);
              const l = Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz);
              if (l > rad) rad = l;
            }
          }
          this.spheres[k * 4] = cx;
          this.spheres[k * 4 + 1] = cy;
          this.spheres[k * 4 + 2] = cz;
          this.spheres[k * 4 + 3] = rad * 1.02;
        }
      }
    }
  }

  // Call once per frame. `focus` is the point the detail should follow —
  // the player in play mode, the camera in orbit.
  update(camera, mode = 'orbit', focus = null, budgetMs = 5) {
    const t0 = performance.now();
    this.mode = mode;
    _focus.copy(focus ?? camera.position);
    // The sphere plans by direction, the plane by position: normalizing a
    // position on the plane would collapse every point towards "straight
    // up" and the streamer would only ever load the middle of the world.
    if (!CS.FLAT) {
      if (_focus.lengthSq() < 1e-9) _focus.set(0, 1, 0);
      _focus.normalize();
    }

    // edits jump the queue and ignore the budget: there are never more than
    // five, and a mined block that reappears next frame feels broken
    if (this.dirty.size) {
      for (const k of this.dirty) this.buildChunk(k);
      this.dirty.clear();
    }

    const showShell = !!this.shell && mode !== 'play';
    this.shellGroup.visible = showShell;
    this.chunkGroup.visible = !showShell;

    this.refresh(_focus);
    const deadline = t0 + budgetMs;
    if (showShell) {
      this.shell.work(deadline);
      // once the shell is up, keep loading chunks under the orbit camera so
      // clicking down into play mode lands on ground that already exists
      if (this.shell.done) this.drain(deadline);
    } else {
      this.drain(deadline);
    }
    this.cull(camera);
  }

  // spend `ms` up front so the first frame is not an empty sky
  warmup(camera, focus, ms = 400) {
    this.needRefresh = true;
    this.update(camera, this.mode, focus, ms);
  }

  refresh(dir) {
    if (CS.FLAT) { this.refreshFlat(dir); return; }
    // The scan below touches every chunk on the planet — 9600 of them at
    // radius 800 — so only re-plan once the focus has moved half a chunk.
    const moved = 1 - dir.dot(this.lastDir);
    if (!this.needRefresh && moved < 0.5 * ((CHUNK * 0.5) / R) ** 2) return;
    this.needRefresh = false;
    this.lastDir.copy(dir);

    const cosLoad = this.full ? -2
      : Math.cos(Math.min(Math.PI, this.viewDist / R));
    const cosKeep = this.full ? -2
      : Math.cos(Math.min(Math.PI, this.keepDist / R));
    const d = this.dirs;
    const dot = (k) =>
      dir.x * d[k * 3] + dir.y * d[k * 3 + 1] + dir.z * d[k * 3 + 2];

    const q = this.queue;
    q.length = 0;
    for (let k = 0; k < this.count; k++) {
      const s = dot(k), has = this.live.has(k);
      if (s >= cosLoad) { if (!has) q.push(k); }
      else if (has && s < cosKeep) this.dropChunk(k);
    }
    q.sort((a, b) => dot(a) - dot(b));   // pop() then yields the nearest
  }

  // The plane's planner: horizontal distance instead of angular distance,
  // and only face 2's third of the key space — the other five faces are
  // empty by construction and there is no reason to queue their nothing.
  refreshFlat(pos) {
    const step2 = (CHUNK * 0.5) ** 2;
    if (!this.needRefresh
      && this.lastDir.distanceToSquared(pos) < step2) return;
    this.needRefresh = false;
    this.lastDir.copy(pos);

    const sph = this.spheres;
    const per = this.nc * this.nc;
    const d2 = (k) => {
      const dx = sph[k * 4] - pos.x, dz = sph[k * 4 + 2] - pos.z;
      return dx * dx + dz * dz;
    };
    const load2 = this.viewDist ** 2, keep2 = this.keepDist ** 2;
    const q = this.queue;
    q.length = 0;
    for (let k = per * 2; k < per * 3; k++) {
      const s = d2(k), has = this.live.has(k);
      if (this.full || s <= load2) { if (!has) q.push(k); }
      else if (has && s > keep2) this.dropChunk(k);
    }
    q.sort((a, b) => d2(b) - d2(a));   // pop() then yields the nearest
  }

  // Build what fits in the frame, nearest first.
  //
  // The deadline used to be checked only AFTER a chunk was built, which meant
  // a 2 ms chunk finishing with 3 ms of budget left would happily start a
  // 40 ms one and hand the frame back long past its slot. So the cost of the
  // last few chunks is remembered and the next one only starts if there is
  // room for it.
  //
  // One chunk is always built when there is one waiting, whatever the
  // estimate says. Anything else can stall the world for ever: the estimate
  // is only ever lowered by building something, so a budget it has already
  // outgrown would never be tested again and the ground would stop arriving.
  // A single overrun is a hiccup; a planet that will not finish loading is
  // not a game.
  drain(deadline) {
    let built = 0;
    while (this.queue.length) {
      const k = this.queue.pop();
      if (this.live.has(k)) continue;
      const t = performance.now();
      if (built && t + this.chunkMs > deadline) { this.queue.push(k); break; }
      this.buildChunk(k);
      // an exponential mean over roughly the last eight, so one village chunk
      // does not make the streamer timid for the rest of the session
      this.chunkMs += (performance.now() - t - this.chunkMs) * 0.25;
      built++;
      if (performance.now() >= deadline) break;
    }
    return built;
  }

  buildChunk(k) {
    const per = this.nc * this.nc;
    const f = (k / per) | 0, rem = k - f * per;
    const i = (rem / this.nc) | 0, j = rem - i * this.nc;
    const parts = buildChunkGeometries(this.planet, f, i * CHUNK, j * CHUNK);
    let e = this.live.get(k);
    if (e) this.clearMeshes(e);
    else { e = { meshes: [] }; this.live.set(k, e); }
    for (const kind of KINDS) {
      const geo = parts[kind];
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.mats[kind]);
      mesh.userData.pass = kind;    // see setPassMaterial
      mesh.frustumCulled = false;   // culled per chunk in cull(), not per mesh
      // The sun's shadow. Solid ground both throws one and takes one; water
      // and the cross-plane tufts only take one — a sea that casts a shadow
      // on the sea bed is a lid, and a blade of grass casting one is four
      // texels of noise for a shadow pass that has a whole village to draw.
      // `casts` remembers which meshes are ALLOWED to cast; cull() then turns
      // the flag on and off by distance every frame. Without the record it
      // could not tell a chunk it had switched off from water, which must
      // never cast whatever happens.
      mesh.userData.casts = kind === 'solid';
      mesh.castShadow = kind === 'solid';
      mesh.receiveShadow = true;
      // ...and it casts through a depth material that has been through the
      // same flattening the visible one has. Without it the chunk casts from
      // the round planet while everything receives on the flat one, and every
      // shadow sits a few blocks off the thing that threw it.
      if (this.mats.depth) mesh.customDepthMaterial = this.mats.depth;
      this.chunkGroup.add(mesh);
      e.meshes.push(mesh);
      this.triangles += geo.index.count / 3;
    }
  }

  // A pass's material, changed for every chunk already built and every one
  // to come: how the Realistic style puts lava and stained glass in its own
  // light, and takes them out of it again.
  setPassMaterial(kind, mat) {
    if (!mat || this.mats[kind] === mat) return;
    this.mats[kind] = mat;
    for (const e of this.live.values()) {
      for (const m of e.meshes) if (m.userData.pass === kind) m.material = mat;
    }
  }

  clearMeshes(e) {
    for (const m of e.meshes) {
      this.chunkGroup.remove(m);
      this.triangles -= m.geometry.index.count / 3;
      m.geometry.dispose();
    }
    e.meshes.length = 0;
  }

  dropChunk(k) {
    const e = this.live.get(k);
    if (!e) return;
    this.clearMeshes(e);
    this.live.delete(k);
  }

  // A block changed: rebuild its chunk and any neighbour whose visible faces
  // it touches. The neighbour may live on another cube face.
  markEdit(f, u, v) {
    const touch = (ff, uu, vv) => {
      const k = this.key(ff, (uu / CHUNK) | 0, (vv / CHUNK) | 0);
      if (this.live.has(k)) this.dirty.add(k);
    };
    touch(f, u, v);
    for (const [du, dv] of NB4) {
      const n = neighborColumn(f, u, v, du, dv);
      touch(n[0], n[1], n[2]);
    }
  }

  // Every resident chunk is stale. Face shading and the per-block wobble are
  // baked into vertex colours, so changing them cannot be fixed by repainting
  // the atlas — the geometry itself has to be rebuilt.
  rebuildAll() {
    for (const k of this.live.keys()) this.dirty.add(k);
  }

  cull(camera) {
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const c = camera.position;
    const d = c.length() || 1;
    const cx = c.x / d, cy = c.y / d, cz = c.z / d;
    // A point P is behind the globe's horizon when P.C < Rocc^2. Take Rocc as
    // the shell floor and P at the shell ceiling, so nothing visible is lost.
    // A plane has no far side to hide behind, so there the frustum is the
    // whole of the test.
    const minDot = (R0 * R0) / (d * (R0 + H));
    // ...and how far round is still worth shadowing: the sun's box plus a
    // chunk's own width, as an angle on the sphere.
    const cosShadow = CS.FLAT ? -2
      : Math.cos(Math.min(Math.PI, (this.shadowReach + CHUNK) / R));
    const dirs = this.dirs, sph = this.spheres;
    let vis = 0;
    for (const [k, e] of this.live) {
      if (!e.meshes.length) continue;
      let on = CS.FLAT || cx * dirs[k * 3] + cy * dirs[k * 3 + 1]
        + cz * dirs[k * 3 + 2] >= minDot;
      if (on) {
        _sphere.center.set(sph[k * 4], sph[k * 4 + 1], sph[k * 4 + 2]);
        _sphere.radius = sph[k * 4 + 3];
        on = this.frustum.intersectsSphere(_sphere);
      }
      // ...and whether it is close enough to be worth putting through the
      // shadow passes at all.
      //
      // This is the expensive line in the whole renderer and it was missing.
      // Chunk meshes carry `frustumCulled = false` — they are culled per
      // CHUNK, right here, not per mesh — which is correct for drawing and
      // ruinous for shadows: three culls the shadow pass per mesh, so with
      // culling off, EVERY chunk on the map was redrawn into every shadow
      // map, however far away it was. On a big world that is a couple of
      // hundred extra draws a pass, and a point light costs six passes.
      //
      // The sun's shadow camera is a box `shadowReach` blocks around the
      // player and a lamp's reaches a dozen; a chunk outside that cannot cast
      // into either, so it is simply not asked to.
      // Measured as an ANGLE, not a distance to the bounding sphere. A chunk
      // spans the whole height of the shell — 684 blocks at radius 800 — so
      // its bounding sphere has a radius of about 344 and every chunk on the
      // horizon passes a distance test. What actually matters is how far
      // round the planet it is, which is the same dot product the horizon
      // test above already has in hand.
      const near = CS.FLAT
        || cx * dirs[k * 3] + cy * dirs[k * 3 + 1]
          + cz * dirs[k * 3 + 2] >= cosShadow;
      for (const m of e.meshes) {
        m.visible = on;
        if (m.userData.casts) m.castShadow = on && near;
      }
      if (on) vis++;
    }
    this.visible = vis;
  }

  stats() {
    return {
      streaming: !this.full,
      chunks: this.live.size,
      visible: this.visible,
      pending: this.queue.length,
      triangles: Math.round(this.triangles + (this.shell?.triangles ?? 0)),
      shellDone: this.shell ? this.shell.done : true,
      megabytes: +(this.planet.memoryBytes?.() / 1048576 || 0).toFixed(1),
    };
  }

  dispose() {
    for (const e of this.live.values()) this.clearMeshes(e);
    this.live.clear();
    this.queue.length = 0;
    this.dirty.clear();
    if (this.shell) this.shell.dispose();
    this.root.remove(this.chunkGroup, this.shellGroup);
  }
}
