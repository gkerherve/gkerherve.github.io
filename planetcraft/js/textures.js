// textures.js — procedural 16x16 pixel-art texture atlas
//
// All block textures are generated at runtime on a canvas, so the game needs
// no image assets — with one exception, asked for: the Realistic style wears
// photographs (textures/real/, see realism.js), and paints its 32-texel copies
// of them in here. Nearest filtering + a half-texel UV inset keep the pixels
// crisp and stop atlas bleeding.
//
// The atlas grew from 4x4 to 4x16 to hold item icons (ingots, gems, tools) and
// then to 4x20 for plants, ladders and the held items. It stays FOUR columns
// wide on purpose: callers that slice icons out of `atlas.image` compute a
// tile's column as `tile % 4` and its row as `(tile / 4) | 0`, so adding rows
// — never columns — keeps every existing index and every such caller correct.
// Raising ROWS again later is equally safe.
//
// --- how the art is made ---------------------------------------------------
//
// Three decisions carry the whole look, and they are worth knowing before
// editing anything below.
//
// 1. PALETTES, NOT JITTER. Every material owns a hand-picked ramp of five
//    tones, dark to light, in PAL. Nothing picks a colour by adding random
//    noise to a base RGB: at 16x16 the eye reads *value* long before it reads
//    hue, so a controlled 5-step ramp reads as a material and a cloud of
//    jitter around one colour reads as television static. Every ramp shares a
//    cool shadow / warm highlight bias so the whole atlas looks like one world.
//
// 2. ORDERED DITHER, NOT NOISE. `tone()` picks a ramp entry from a continuous
//    0..1 value and dithers the boundary with a 4x4 Bayer matrix. Gradients
//    therefore break up into the woven pattern pixel artists use by hand, and
//    because 4 divides 16 the matrix itself tiles.
//
// 3. WRITES WRAP. `Pix.set` takes coordinates modulo the tile, so a crack, a
//    cobble stone or an ore crystal that runs off one edge reappears on the
//    other. Seamless tiling is then a property of the painter rather than
//    something to check for afterwards, and features are free to straddle the
//    border — which is what stops a repeated tile showing an obvious motif.
//
// --- art styles ------------------------------------------------------------
//
// The atlas is painted in one of several STYLES (see the catalogue below), the
// way the sibling KherveTools pick a theme. The style is a module-level
// setting, not an argument, because every caller that builds its own atlas
// (player.js, avatar.html) has to agree with the world's — see
// `setTextureStyle`, `buildAtlas` and `restyleAtlas`.
//
// Every BLOCK is authored per style now, in four stages: the grass and the
// wood, then the ground and the building materials, then the furnace, the
// four ores, glass, the chest, the torch, snow, ice and lava, then WATER —
// held back on purpose until the water RENDER (waves, fresnel, sun-glint;
// owned by cubemesher.js/main.js) existed to build on, so the tile could be
// painted as the flat colour field that render wants rather than faked with
// its own ripples and shine. What is left on the classic painter is the
// crops, the plants, the ladder and the forty item icons — none of which is
// a cube face.
//
// The rule the stages were built on is that a BLOCK is the unit, never a tile.
// A block may not wear a styled face next to a classic one: half-styled looks
// more broken than unstyled, and it is the one thing that has actually been
// reported from a screenshot. So PATH and TILLED are painted from the style's
// own earth because their sides are DIRT, the crafting table from its own
// boards because its underside is PLANK, the furnace from its own walling
// because its underside is COBBLE, and the ores from its own rock because they
// sit in a wall of STONE.

import * as THREE from 'three';
import { paintClassicBlocks } from './classicart.js';

export const TILE = {
  // --- blocks (0..15: the original atlas, indices frozen) -----------------
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAF: 8,
  COAL: 9,
  IRON: 10,
  SILVER: 11,
  DIAMOND: 12,
  PLANK: 13,
  COBBLE: 14,
  TUFT: 15,

  // --- new blocks ---------------------------------------------------------
  GLASS: 16,
  BRICK: 17,
  THATCH: 18,
  TILLED: 19,
  PATH: 20,
  FURNACE_FRONT: 21,
  FURNACE_SIDE: 22,
  FURNACE_TOP: 23,
  CRAFT_TOP: 24,
  CRAFT_SIDE: 25,
  GRAVEL: 26,
  SNOW: 27,
  CLAY: 28,
  ICE: 29,
  CHEST: 30,
  TORCH: 31,

  // --- materials ----------------------------------------------------------
  COAL_LUMP: 32,
  RAW_IRON: 33,
  RAW_SILVER: 34,
  IRON_INGOT: 35,
  SILVER_INGOT: 36,
  DIAMOND_GEM: 37,
  STICK: 38,
  FLINT: 39,
  SEEDS: 40,
  WHEAT: 41,
  BREAD: 42,
  APPLE: 43,

  // --- tools, four tiers each ---------------------------------------------
  PICK_WOOD: 44,
  PICK_STONE: 45,
  PICK_IRON: 46,
  PICK_DIAMOND: 47,
  AXE_WOOD: 48,
  AXE_STONE: 49,
  AXE_IRON: 50,
  AXE_DIAMOND: 51,
  SHOVEL_WOOD: 52,
  SHOVEL_STONE: 53,
  SHOVEL_IRON: 54,
  SHOVEL_DIAMOND: 55,
  SWORD_WOOD: 56,
  SWORD_STONE: 57,
  SWORD_IRON: 58,
  SWORD_DIAMOND: 59,
  HOE_WOOD: 60,
  HOE_STONE: 61,
  HOE_IRON: 62,
  HOE_DIAMOND: 63,

  // --- cross-plane plants -------------------------------------------------
  // Drawn on transparent backgrounds: these are never cube faces, they are
  // the two crossed quads the mesher builds for BLOCK.FLOWER_* and friends.
  FLOWER_RED: 64,
  FLOWER_YELLOW: 65,
  FLOWER_BLUE: 66,
  MUSHROOM: 67,
  SAPLING: 68,
  WHEAT_YOUNG: 69,   // TILE.WHEAT (41) is the ripe stage

  // --- held items ---------------------------------------------------------
  GUN: 70,
  BULLET: 71,
  MEAT_RAW: 72,
  MEAT_COOKED: 73,
  FEATHER: 74,
  LEATHER: 75,
  BONE: 76,

  // --- other partial blocks -----------------------------------------------
  LADDER: 77,        // rails + rungs on transparent, one alpha-tested panel

  // Molten rock, and the one tile here that nothing draws yet. `cubemesher.js`
  // still sends BLOCK.LAVA to TILE.WATER and `main.js` multiplies that pass by
  // 0xff6a1e — but a blue tile times an orange light is a dark olive, so lava
  // currently reads as sludge, and no repaint of the WATER tile can fix that
  // without wrecking the sea. So lava gets a tile of its own, painted hot in
  // all sixteen styles. Switching it on is one line in cubemesher.js:
  //   case BLOCK.LAVA: return TILE.LAVA;
  // and, once that lands, `main.js` can drop the 0xff6a1e tint to white.
  LAVA: 78,
  // The side of a trodden path: dirt, capped by the path's own colour where
  // the surface spills over the lip of the block. Same relationship GRASS_SIDE
  // has with GRASS_TOP, and for the same reason — a path whose sides are plain
  // dirt is a khaki lid sitting on a brown box.
  PATH_SIDE: 79,
  // row 20: the heavy weapons and their ammunition
  GUN_BAZOOKA: 80,
  GUN_LAUNCHER: 81,
  ROCKET: 82,
  // rows 20-22: the medieval and prehistoric racks
  BOW: 83,
  ARROW: 84,
  SPEAR: 85,
  HAMMER: 86,
  CLUB: 87,
  FLINT_SPEAR: 88,
  FLINT_KNIFE: 89,
  HAMMER_WOOD: 90,
  HAMMER_DIAMOND: 91,
  // row 23: every gun finally looks like itself in the hotbar too
  GUN_RIFLE: 92,
  GUN_SHOTGUN: 93,

  // --- rows 24-33: gold, brass, tinted glass and the other four timbers ----
  // Everything from here down is painted in one block at the END of
  // paintAtlas, off streams of its own — see the note there. Two tiles of row
  // 23 were spare, so the new run starts at 94 rather than on a row boundary.
  GOLD: 94,
  RAW_GOLD: 95,
  GOLD_INGOT: 96,
  BRASS_INGOT: 97,
  // the storage blocks: one tile each, worn on all six faces
  BLOCK_IRON: 98,
  BLOCK_GOLD: 99,
  BLOCK_DIAMOND: 100,
  BLOCK_BRASS: 101,
  // Tinted glass, in cubesphere's GLASS_TINTS order. A pane wears the tile of
  // the block it was cut from, so these eight cover sixteen block ids.
  GLASS_WHITE: 102,
  GLASS_RED: 103,
  GLASS_ORANGE: 104,
  GLASS_YELLOW: 105,
  GLASS_GREEN: 106,
  GLASS_BLUE: 107,
  GLASS_PURPLE: 108,
  GLASS_BLACK: 109,
  // The four timbers after oak. Oak keeps LOG_SIDE/LOG_TOP/PLANK above, so
  // nothing that already says "wood" changes.
  LOG_SIDE_BIRCH: 110,
  LOG_TOP_BIRCH: 111,
  PLANK_BIRCH: 112,
  LOG_SIDE_SPRUCE: 113,
  LOG_TOP_SPRUCE: 114,
  PLANK_SPRUCE: 115,
  LOG_SIDE_ACACIA: 116,
  LOG_TOP_ACACIA: 117,
  PLANK_ACACIA: 118,
  LOG_SIDE_DARK: 119,
  LOG_TOP_DARK: 120,
  PLANK_DARK: 121,
  // Dye. The three that already existed borrowed their flower's tile through
  // items.js's `T()` fallback, so declaring these gives all eight a real icon.
  DYE_WHITE: 122,
  DYE_RED: 123,
  DYE_ORANGE: 124,
  DYE_YELLOW: 125,
  DYE_GREEN: 126,
  DYE_BLUE: 127,
  DYE_PURPLE: 128,
  DYE_BLACK: 129,
  // brass tools: the same five silhouettes as every other tier
  PICK_BRASS: 130,
  AXE_BRASS: 131,
  SHOVEL_BRASS: 132,
  SWORD_BRASS: 133,
  HOE_BRASS: 134,
  // --- row 34: the two lights stop being the same orange blob --------------
  // A lantern and a torch both wore TILE.TORCH on all six faces of a full
  // cube, so the only two light sources in the game were pixel-identical from
  // across a street. They are box-union OBJECTS in the mesher now (see
  // cubemesher's LANTERN_BOXES / TORCH_BOXES) and these are the three
  // surfaces those objects are built out of.
  LANTERN: 135,      // the caged glass body, and the lantern's item icon
  LANTERN_CAP: 136,  // its foot, its shoulder and its hanging bail: dark iron
  FLAME: 137,        // the torch's burning head — solid fire, no silhouette
  // The canopy WITHOUT its holes, for the distant shell alone. A sample there
  // spans many columns, so the leaf tile's cutouts land as holes several
  // blocks wide punched through to space, and every forest on the globe came
  // up speckled black from orbit. Same paint, same finish, emitted before the
  // holes go in — see flatLeaf.
  LEAF_FAR: 138,

  // --- rows 34-44: copper, zinc, tin, bronze and the post ------------------
  // Painted at the very END of paintAtlas with everything else that arrived
  // after the atlas was full — see the note there. Row 34's spare slot is 139,
  // so the run starts there rather than on a row boundary.
  COPPER: 139,
  ZINC: 140,
  TIN: 141,
  RAW_COPPER: 142,
  RAW_ZINC: 143,
  RAW_TIN: 144,
  COPPER_INGOT: 145,
  ZINC_INGOT: 146,
  TIN_INGOT: 147,
  BRONZE_INGOT: 148,
  // the storage blocks the first four did not cover, silver included: it was
  // the one metal you could mine by the stackful and not press into a block
  BLOCK_COPPER: 149,
  BLOCK_ZINC: 150,
  BLOCK_TIN: 151,
  BLOCK_BRONZE: 152,
  BLOCK_SILVER: 153,
  // The racks. Five tools, a spear and a war hammer per metal — the same
  // seven shapes iron wears, so a metal is a material and not a new kind of
  // tool. Brass had its five before the spear and the hammer existed.
  PICK_COPPER: 154,
  AXE_COPPER: 155,
  SHOVEL_COPPER: 156,
  SWORD_COPPER: 157,
  HOE_COPPER: 158,
  SPEAR_COPPER: 159,
  HAMMER_COPPER: 160,
  PICK_BRONZE: 161,
  AXE_BRONZE: 162,
  SHOVEL_BRONZE: 163,
  SWORD_BRONZE: 164,
  HOE_BRONZE: 165,
  SPEAR_BRONZE: 166,
  HAMMER_BRONZE: 167,
  PICK_GOLD: 168,
  AXE_GOLD: 169,
  SHOVEL_GOLD: 170,
  SWORD_GOLD: 171,
  HOE_GOLD: 172,
  SPEAR_GOLD: 173,
  HAMMER_GOLD: 174,
  SPEAR_BRASS: 175,
  HAMMER_BRASS: 176,
  // gold beaten round an apple, and the slim timber a street lamp stands on
  GOLDEN_APPLE: 177,
  POST: 178,

  // --- rows 44-47: cement, and the books ------------------------------------
  // Cement in the glass's eight colours, in the glass's order. Same order, so
  // the red wall and the red window in it are painted from one colour.
  CEMENT_WHITE: 179,
  CEMENT_RED: 180,
  CEMENT_ORANGE: 181,
  CEMENT_YELLOW: 182,
  CEMENT_GREEN: 183,
  CEMENT_BLUE: 184,
  CEMENT_PURPLE: 185,
  CEMENT_BLACK: 186,
  PAPER: 187,
  BOOK: 188,
  // The shelf's SIDE only. Its top and bottom are the planks it is framed in,
  // exactly as a crafting table's underside is a plank — a bookshelf seen from
  // above is a board, not a row of spines.
  BOOKSHELF: 189,

  // --- rows 47-51: the doors, and the bell ----------------------------------
  // Two tiles per leaf, and they are not two halves of one picture cropped:
  // emitBox crops a tile to its box, and a box two cells tall would crop to
  // v = 0..2 and read straight off the end of the tile into the row below it.
  // So each half is painted whole and worn whole. Bottom first, in
  // cubesphere's DOOR_TYPES order.
  DOOR_OAK_BOT: 190,
  DOOR_OAK_TOP: 191,
  DOOR_BIRCH_BOT: 192,
  DOOR_BIRCH_TOP: 193,
  DOOR_SPRUCE_BOT: 194,
  DOOR_SPRUCE_TOP: 195,
  DOOR_ACACIA_BOT: 196,
  DOOR_ACACIA_TOP: 197,
  DOOR_DARK_BOT: 198,
  DOOR_DARK_TOP: 199,
  DOOR_IRON_BOT: 200,
  DOOR_IRON_TOP: 201,
  DOOR_GLASS_BOT: 202,
  DOOR_GLASS_TOP: 203,
  // the bell's bronze, smooth and banded — the storage block's cast face has
  // rivets on it, and a bell with rivets is a bucket
  BELL: 204,

  // --- rows 51-55: the kitchen garden, and the buckets ----------------------
  // Four crops after wheat, two stages apiece — the young plant and the ripe
  // one — in cubesphere's CROP_TYPES order, then the vegetable each one is
  // pulled up as. The plant tile and the item tile are deliberately NOT the
  // same picture: wheat gets away with one because a sheaf and a stalk of it
  // look alike, but a carrot in a slot is an orange root and a carrot in a
  // field is a tuft of green with a shoulder of orange showing at the soil.
  CARROT_YOUNG: 205,
  CARROT_TOP: 206,
  POTATO_YOUNG: 207,
  POTATO_TOP: 208,
  PEPPER_YOUNG: 209,
  PEPPER_TOP: 210,
  SALAD_YOUNG: 211,
  SALAD_TOP: 212,
  CARROT: 213,
  POTATO: 214,
  PEPPER: 215,
  SALAD: 216,
  POTATO_BAKED: 217,
  // The buckets: one empty pail and the three things you can carry in it.
  // They share a body and differ only in what is in the top of it, which is
  // also the only thing you need to tell apart at 32 texels in a hotbar.
  BUCKET: 218,
  BUCKET_WATER: 219,
  BUCKET_LAVA: 220,
  BUCKET_MILK: 221,
  // The desert. Orange sand: the same ripples and the same grain as the beach
  // sand above, painted off a hot base instead of a pale one, so a dune field
  // reads as the same MATERIAL under a different sun rather than as a
  // different substance. One tile, because sand has no top and no side — it
  // is the same stuff whichever face you are looking at.
  SAND_ORANGE: 222,

  // --- rows 55-57: what each world sends out ---------------------------------
  // One export per culture. These are the only reason to carry anything home
  // from another planet, so each is drawn to be told apart in a hotbar slot at
  // a glance rather than to be admired. Each leans on a different SHAPE — a
  // pot, a wheel, a cone, a brick, threads, a shard, a honeycomb — because at
  // sixteen texels colour alone will not separate seven small objects.
  PITCH: 223,        // Cinder — tar boiled out of the coal seams
  BRASS_GEAR: 224,   // Ferrum — a cast wheel: only a foundry makes one
  SEA_SALT: 225,     // Thalassa — evaporated off the shallows
  TEA_BRICK: 226,    // Rime — pressed leaf, which is how it travelled
  SAFFRON: 227,      // Tempest — the threads, worth their weight
  OBSIDIAN: 228,     // Vulcan — volcanic glass, knapped to an edge
  HONEYCOMB: 229,    // Terran — the one thing home makes that the others want

  // --- rows 58-62: wool, beds, and what a shop is paid in --------------------
  // Wool in the dyes' eight colours and then the two only a sheep makes. The
  // order is cubesphere's WOOL_COLOURS, which starts with the glass tints, so
  // a red fleece and a red window are the same red.
  WOOL_WHITE: 230,
  WOOL_RED: 231,
  WOOL_ORANGE: 232,
  WOOL_YELLOW: 233,
  WOOL_GREEN: 234,
  WOOL_BLUE: 235,
  WOOL_PURPLE: 236,
  WOOL_BLACK: 237,
  WOOL_BROWN: 238,
  WOOL_GREY: 239,
  // The bed icons, in the same ten colours and the same order. Only ever seen
  // in a bag or on the bench — the bed in the world is boxes of real wool.
  BED_WHITE: 240,
  BED_RED: 241,
  BED_ORANGE: 242,
  BED_YELLOW: 243,
  BED_GREEN: 244,
  BED_BLUE: 245,
  BED_PURPLE: 246,
  BED_BLACK: 247,
  BED_BROWN: 248,
  BED_GREY: 249,
  // Money, and the one tool that takes a fleece off a live sheep.
  COIN: 250,
  SHEARS: 251,

  // --- BADGES ---------------------------------------------------------------
  // The plaque over each bay of a shop's stockroom. One emblem per category,
  // and they are TILES rather than blocks because the block enum has exactly
  // one id left in it — see the note at BLOCK.LECTERN. A painting's canvas can
  // wear any tile in this atlas (see ART in cubemesher.js), so a badge is a
  // small picture in a frame and costs the world nothing.
  BADGE_BUILDING: 252,
  BADGE_TOOLS: 253,
  BADGE_WEAPONS: 254,
  BADGE_ARMOUR: 255,
  BADGE_FOOD: 256,
  BADGE_MATERIALS: 257,

  // --- PICTURES -------------------------------------------------------------
  // What hangs in a frame. Eight of them, drawn at the full 32-texel grid
  // because a painting is looked AT rather than glanced at, and the player
  // chooses which one a given frame wears.
  ART_LAND: 258,
  ART_SEA: 259,
  ART_PEAK: 260,
  ART_FACE: 261,
  ART_STILL: 262,
  ART_NIGHT: 263,
  ART_FIELD: 264,
  ART_BEAST: 265,

  // --- rows 67-69: the second half of the kitchen garden ---------------------
  // Pumpkin and watermelon, two stages apiece on exactly the terms the first
  // four crops are on, plus the fruit itself for a hotbar slot. The plant tile
  // and the item tile are different pictures for the same reason a carrot's
  // are: what you are holding is the gourd, not the vine that was over it.
  PUMPKIN_YOUNG: 266,
  PUMPKIN_TOP: 267,
  PUMPKIN: 268,
  WATERMELON_YOUNG: 269,
  WATERMELON_TOP: 270,
  WATERMELON: 271,
  // The cane, and a cut length of it. Same split, same reason.
  BAMBOO: 272,
  BAMBOO_CANE: 273,
  // ...and the two things a kitchen makes out of all of it.
  CAKE: 274,
  POTATO_STEW: 275,

  // --- the mint --------------------------------------------------------------
  // The press a village strikes its coin at. Two tiles and not one: the press
  // itself, which is the item icon and what the distant shell borrows, and the
  // DIE — the striking bed with a blank lying in it, which is the one face of
  // the machine that is not iron and the only one anybody looks at.
  MINT: 276,
  MINT_DIE: 277,
  // --- grey cement -----------------------------------------------------------
  // The city asked for buildings in gradients of grey and the cement family
  // had every colour except one you would actually pour. Three greys between
  // the white and the black, same matte finish, same fixed specks.
  CEMENT_GREY_LIGHT: 278,
  CEMENT_GREY: 279,
  CEMENT_GREY_DARK: 280,

  // --- true cobblestone -------------------------------------------------------
  // Rounded stones in dark joints — the light-grey rounds the player pointed
  // at. TILE.COBBLE (14) is squared masonry and is called cobble brick now;
  // these three are the field stone itself: plain, mossy, and soot-dark.
  COBBLESTONE: 281,
  COBBLESTONE_MOSSY: 282,
  COBBLESTONE_DARK: 283,

  // --- rows 72-73: the track and the network --------------------------------
  // Six icons that did not exist. Every one of these items borrowed another
  // block's tile — wire was drawn as a SOLID IRON BLOCK, and so was a rail;
  // the switch and the dynamo were both a block of bronze, so they were the
  // same picture as each other. A tab of items you cannot tell apart is a tab
  // nobody uses, which is most of why the power fittings went unfound.
  //
  // Each leans on a different SHAPE, for the same reason the trade goods do:
  // a coil, a lever on a plate, a drum in a frame, a lit globe, a length of
  // track seen from above, and a cart on wheels.
  WIRE_ITEM: 284,
  SWITCH_ITEM: 285,
  DYNAMO_ITEM: 286,
  POWER_LAMP_ITEM: 287,
  RAIL_ITEM: 288,
  WAGON_ITEM: 289,
  // A FENCE AND A GATE, as pictures of themselves. Both asked the atlas for a
  // tile that was never drawn — `T('FENCE', 'PLANK')` in items.js falls back
  // on the second name when the first does not exist — so the fence in your
  // hotbar was a plain plank, and so was the gate, and the two were the same
  // square of wood. A fence is posts and rails and looks like nothing else in
  // the game; it should not have to be read off the label.
  FENCE_ITEM: 290,
  GATE_ITEM: 291,

  // --- rows 74-75: the shapes, derived ------------------------------------
  //
  // A SLAB IS NOT A BLOCK AND A STAIR IS NOT A BLOCK, and until now both wore
  // the full block's face: a plank, a plank slab and plank stairs were three
  // identical squares of timber with three different words under them, which
  // is the single most confusing thing in the palette. You cannot tell what
  // you are holding.
  //
  // These are not painted. They are CUT from the material's own tile after
  // the atlas is built — see shapeTiles — so a slab is exactly the block's
  // texture with the top half taken off, and a stair is the same with a step
  // out of it. That is what those blocks look like in the world, and it means
  // every style, every finish and every hand-painted override comes through
  // to them for nothing.
  PLANK_SLAB: 292,
  COBBLE_SLAB: 293,
  BRICK_SLAB: 294,
  THATCH_SLAB: 295,
  PLANK_STAIRS: 296,
  COBBLE_STAIRS: 297,
  BRICK_STAIRS: 298,
  THATCH_STAIRS: 299,
  // ...and bank two of the stairs, cut the same way from each material's own
  // face. See STAIR2_MATS in items.js for what these are stairs OF.
  PATH_STAIRS: 300,
  STONE_STAIRS: 301,
  DIRT_STAIRS: 302,
  SAND_STAIRS: 303,
  SAND_ORANGE_STAIRS: 304,
  GRAVEL_STAIRS: 305,
  CLAY_STAIRS: 306,
  SNOW_STAIRS: 307,
  LOG_STAIRS: 308,
  GLASS_STAIRS: 309,
  BONE_MEAL: 310,
};

// TS is the atlas grid: 32 texels a tile, so a 1-texel border costs 3.1% of a
// face instead of the 6.25% it cost at 16 and reads as a line rather than a
// bar. CT is the grid the CLASSIC art was drawn on; those painters are run at
// 16 and blitted up 2x, which keeps that style pixel-identical to before
// instead of quietly re-rasterising forty tiles at a resolution nobody drew
// them for.
const TS = 32;
const CT = 16;
const COLS = 4;
const ROWS = 78;   // 52 the kitchen garden, 56 buckets, 58 trade, 63 wool and coin, 67 badges and pictures, 70 gourds, bamboo and the kitchen, 71 grey cement, 73 rail, the power fittings, the fence and the gate, 78 the slabs and stairs cut from them, two banks of them

// exported so icon-drawing UIs do not have to hardcode the grid
export const ATLAS = { TS, COLS, ROWS, COUNT: COLS * ROWS };

// ---------------------------------------------------------------------------
// style catalogue
// ---------------------------------------------------------------------------
// TWO LOOKS. There were fourteen — flat ones, outlined ones, posters, reliefs —
// and the player kept two: CLASSIC, the pixel art this game grew up in, and
// REALISTIC, photographs under the sun. How much of the realistic one a
// machine can afford is no longer a style of its own ("Low", "Very Low") but a
// setting of it, REAL_DETAIL below, from full down to lowest.
//
// `blurb` is one line of menu copy, so it says what the player will see rather
// than how it is drawn. `shade` and `jitter` are read by cubemesher.js when the
// style is selected: the brightness each face of a block is drawn at, and how
// much a block's brightness may wobble from its neighbour's. `look` is the
// paint data the styled painters read (see the realistic entry); null means
// the classic painters.
export const STYLES = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Pixel art: every block drawn at sixteen texels, in clusters of '
      + 'colour lit from the top left, like the block games it grew up with.',
    // The two horizontal faces have always differed here — 0.80 against 0.65 —
    // but at a ratio of 0.81 the corner of a block is a hint rather than an
    // edge, and on a cliff face of one material it is the only thing drawing
    // the blocks apart at all. 0.60 takes the ratio to 0.75, which is the
    // proportion the idiom this style is named after has always used: enough
    // that a front reads as a front and a flank as a flank without either
    // going dark.
    shade: { top: 1.00, sideU: 0.80, sideV: 0.60, bottom: 0.48 },
    jitter: 0.10,          // the only style that wants per-block wobble: it has
    look: null,            // texture for the wobble to hide inside
  },

  // --- and the other end of the scale --------------------------------------
  //
  // Classic is a handful of large marks in a few tones, because that is what
  // survives being seen from across a valley. This one goes the other way —
  // photographs, and under them pixel art with as many tones as the ramp
  // will hold and marks down to a single texel. What makes that pixel art
  // (the style's fallback until the photographs arrive) read as real rather
  // than as noise:
  //   * low contrast between neighbours — the tones sit close together (gap
  //     0.72 against the usual 1.0+) so nothing pops out as a drawn mark
  //   * many small marks in several near tones, laid over each other, rather
  //     than few big ones in two
  //   * lit and shadowed edges on the clumps, so the surface has relief in it
  //     instead of stains on it
  //   * desaturation. Real earth and stone are far greyer than a palette
  //     picker suggests, and saturated ground is the first thing that gives a
  //     texture away as hand-drawn.
  {
    id: 'real',
    name: 'Realistic',
    blurb: 'Photographs of real stone, soil, bark, brick and timber, each with '
      + 'its own relief and shine, lit by the sun as it crosses the sky.',
    // PHOTOGRAPHS, under real light — the one style in the set that is. The
    // pixel art below is still painted, and it is what the style wears until
    // the photographs have loaded and on any block that has none; everything
    // else wears textures/real/ (see realism.js), and lit.js lights it.
    pbr: true,
    // No baked face shading: the sun does it now, through each face's real
    // direction and the photograph's own normals, and a baked shade on top
    // would light every block twice.
    shade: { top: 1.00, sideU: 1.00, sideV: 1.00, bottom: 1.00 },
    // ...nor a per-block wobble: the photographs vary on their own, and the
    // world-scale tone in lit.js breaks the repeat without making a patchwork
    jitter: 0,
    // the contact shadow a block throws on its neighbour stays, a touch
    // softer — real light already darkens a corner the sun cannot reach
    occlusion: 0.5,
    // a two-block photograph is dealt out in quarters by the mesher, and a
    // quarter turned on its own would break the join to the next one
    rotates: false,
    look: {
      grass: '55813d',
      // three near greens as small clumps with soft lit and shadowed edges:
      // the relief is what stops a fine grain reading as television static,
      // and SOFT is the operative word — the first cut used a bright lit edge
      // and every clump read as a little drawn box
      lumps: {
        colors: ['4e7837', '5c8942', '608c45'], n: 26, w: 4, h: 3, vary: 3,
        lit: '65924a', dark: '43682f',
      },
      // ...and then the grain itself, kept to the middle tones and laid as
      // short 2-texel dashes rather than lone dots. 170 single texels was
      // the confetti the whole clump system exists to avoid — fewer, wider,
      // closer-toned marks read as turf at every distance instead of static
      // up close.
      flecks: {
        colors: ['4f7a38', '5f8c44', '577f3e', '5b8641'],
        n: 85, w: 2, h: 1,
      },
      soil: '6b5138',
      // the same softness rule as the grass: a clod with a bright rim is a
      // brick lying ON the dirt, and twenty of them are rubble
      soilLumps: {
        colors: ['5f4732', '77593d', '654c35'], n: 18, w: 4, h: 3, vary: 3,
        lit: '7e5f41', dark: '523c29',
      },
      pebbles: { colors: ['8a7256', '55402c', '7a6247'], n: 14, w: 2, h: 2 },
      // a deeper green for the overhang, and two texels of shadow under the
      // tongues: turf sits ON soil, and the dark earth under an overhang is
      // what real light does there — without it the fringe is painted on
      fringe: '426a2e',
      shadow: { color: '463327', rows: 2 },
      // no line: an outline is the most stylised thing a block can wear
      line: null,
      // --- the realistic finish ------------------------------------------
      // What the reference packs (Misa's Realistic, John Smith Legacy) do at
      // low resolution, distilled to four moves: a baked shadow at every
      // tile's own edges so each block reads as an object with volume; tone
      // at TWO scales, a broad soft mottle under the fine grain, so nothing
      // reads as uniform confetti; a few per cent of sky light down every
      // side face; and one signature mark per material — striations and
      // mineral glints in the rock, knots and nails in the wood, recessed
      // mortar round the bricks. Every finish pass draws from its OWN
      // stream (rrand in paintAtlas), so switching them on did not re-roll
      // a single mark the painters above already place.
      //
      // Two soft rings of edge shading, the outer stronger, corners a touch
      // deeper again. Multiplicative and applied last — baked AO, not an
      // outline.
      ao: { edge: 0.87, corner: 0.91 },
      // the broad mottle: big faint blobs under the grain, then a smaller,
      // slightly stronger pass over them — two octaves of tone
      mottle: [
        { n: 6, w: 6, h: 5, vary: 4, lo: 0.955, hi: 1.045 },
        { n: 9, w: 3, h: 2, vary: 2, lo: 0.94, hi: 1.06 },
      ],
      // the sky-light gradient a side face carries, top row to bottom row
      grad: { top: 1.045, bottom: 0.955 },
      // faint diagonal striations and a couple of glossy mineral texels:
      // the two marks that say igneous rather than painted grey
      stoneDetail: {
        striae: { n: 6, len: 6, lit: 1.045, dark: 0.94 },
        sparkle: { n: 2, k: 1.26 },
      },
      // each gravel stone gets a soft lit top and shadowed underside derived
      // from its OWN tone — pebbles, not floor tiles
      gravelRelief: { lit: 1.12, dark: 0.86 },
      // ...and the same two moves that made the brick, applied to the rock:
      // every cleavage facet and every fitted cobble stone lit at the top and
      // shaded at the foot from its own tone, with the cobble's mortar
      // dropped darker and cooler so the stones sit IN a bed
      stoneRelief: { lit: 1.05, dark: 0.93 },
      cobbleRelief: { lit: 1.09, dark: 0.85 },
      cobbleMortar: '3c3f45',
      // a lit crest along the top of each sand ripple, a shadow in its lee
      sandRipple: { lit: 1.06, dark: 0.93 },
      // mortar clearly RECESSED: darker and cooler than every brick face,
      // where the shared painter's default mortar sits lighter than the wall
      brickMortar: '3f3a36',
      // ...and a few per cent of warm/cool wobble per brick, so no two
      // bricks came from quite the same firing
      brickTint: 0.05,
      // one specular texel inside each ore crystal's lit corner
      oreGlint: 1.35,
      // blue-tinted shadow dapples on the snowfield — cold light, not grey
      snowDapple: { n: 7, w: 5, h: 3, vary: 3, r: 0.92, g: 0.96, b: 1.0 },
      // short jagged cracks with a bright refraction line alongside — short
      // on purpose: a texel line SPANNING a tile turns a wall into a lattice
      iceCracks: { n: 2, len: 8, glint: 1.25 },
      // Five tones, and the tightest steps in the set. `gap` is what decides
      // whether a facet reads as a facet or as a stain, and realism wants the
      // stain: real stone has no edges you could draw.
      // Rock is a NEUTRAL grey here, not the blue-grey MATBASE carries: the
      // shared base leans about twelve more blue than red, which over a whole
      // cliff reads as cold slate. See baseOf.
      base: { stone: '757577' },
      mat: { sat: 0.88, val: 1.00, gap: 0.72, warm: 0.006, tones: 5 },
      // no embossed plates on the rock — see mat(). The grass keeps its lit
      // clumps; the stone gets grit instead, which is what rock actually has.
      relief: false,
      // ...except the brickwork, which is unreadable without its courses.
      // This is not the embossed plate the other styles wear: the edge is
      // derived from each brick's OWN tone (see flatBrick), a soft step of a
      // few value points, so the mortar lines read without any brick wearing
      // a frame.
      brickRelief: { lit: 1.12, dark: 0.87 },
      grit: [
        // a broad soft blotch pass UNDER the fine grain: it is what gives the
        // rock tonal depth without adding any mark you could point at
        { n: 26, w: 2, h: 2, mid: true },
        { n: 90, w: 1, h: 1, mid: true },
        { n: 24, w: 2, h: 1, mid: true },
        { n: 8, w: 1, h: 1 },
      ],
      wood: {
        bark: '6b5133',
        // narrow bars, so the grain is fine rather than planked; the darkest
        // bar sits a touch deeper than it used to, so the grooves between
        // fibres read as depth rather than as another stripe
        bars: { w: 3, colors: ['44331f', '6b5133', '806241', '5b452c'] },
        // and ridges down the grain — narrow, tall, and only a shade or two
        // from the bark, because bark relief is texture, not plates screwed
        // to the trunk
        lumps: {
          colors: ['5f4a2f', '755738'], n: 6, w: 2, h: 12, vary: 5,
          lit: '82653f', dark: '4a3822',
        },
        chips: { colors: ['82653f', '453320'], n: 8, w: 1, h: 2 },
        // deep grain grooves the FULL height of the trunk, hand-placed off
        // any even period so a wall of logs carries no repeating motif, a
        // step darker than the darkest bar: the grooves between fibres are
        // the deepest thing on a trunk
        grooves: { at: [4, 11, 21, 28], w: 1, color: '382917' },
        // and the occasional knot — a dark eye with a lit brow
        knots: { n: 2, color: '2f2212', dark: '4a3822', lit: '8a6c45' },
        // narrow rings in four close tones and NO lit/dark edge: a ring with
        // a highlight on it is a terrace, and end grain seen from a metre
        // away is a set of stains, not a staircase. The half-step the first
        // cut used vanished entirely in the game's light, so the rings sit a
        // full step apart now — findable when you look, still well short of
        // the alternation that makes a dartboard.
        rings: {
          w: 3, colors: ['7a6340', '634e30', '75603b', '5c482c'], off: [-2, 2],
        },
        rim: { w: 3, color: '5a4630' },
        pith: { size: 5, color: '514126' },
        // Two near tones, not four: a board is one piece of wood, and four
        // colours across four courses reads as brickwork however fine the
        // grain on top of it is.
        //
        // The seam is close to the boards for the same reason. Floorboards do
        // have butt joints — the painter is right to draw them — but a joint
        // three shades darker than the wood is the line that turns a floor
        // into a brick wall.
        // ...though the two tones sit a shade further apart than they did,
        // and the seam a shade deeper: at the old spread the whole floor
        // averaged into one sheet at a metre, and a board has to be countable
        // before its grain matters.
        boards: { h: 8, colors: ['816546', '664d30'], seam: '55422b' },
        // ...and the marks on them run ALONG the board — long and one texel
        // tall, which is what wood grain is. Square lumps put bricks back.
        boardLumps: {
          colors: ['866a47', '5f4a30'], n: 7, w: 13, h: 1, vary: 6,
        },
        // plus a few short chips and knots, along-grain like the streaks:
        // small damage is what makes each board its own piece of wood
        boardChips: { colors: ['8f7350', '52402a'], n: 6, w: 3, h: 1 },
        // each board a few per cent its own tone — no two boards came off
        // the same tree — and a nail either side of every butt joint
        boardTone: { lo: 0.95, hi: 1.06 },
        nails: { color: '32261a', lit: '9a7d55' },
        // ...and each board rounded over: lit at its top edge, shaded at its
        // bottom, so a wall reads as lapped timber rather than brown stripes
        boardRelief: { lit: 1.08, dark: 0.88 },
      },
      // The canopy, by the same softness rule as everything else here. The
      // shared recipe (big clumps, near-black gaps, double grit) read as
      // camouflage print next to this style's ground — the gaps are the
      // giveaway, four value steps darker than anything real shade produces.
      // So: a deep base, many small clumps a shade or two apart with SOFT lit
      // and dark edges, shadow gaps in dark GREEN rather than black, and the
      // finest flecks in the set, because foliage is the finest-grained
      // surface there is.
      leaf: {
        base: '3f6030',
        // clumps no smaller than 4x3: a 3x2 lump is all edge and no interior,
        // and twenty of those read as a scatter of little drawn rings.
        // An ARRAY is several layers (same convention as the water's flecks):
        // the second, sparser pass sits over the first, because depth in a
        // canopy is clumps in front of clumps, and one layer cannot say that.
        lumps: [{
          colors: ['365427', '486d36', '4f7439'], n: 16, w: 4, h: 3, vary: 3,
          lit: '547742', dark: '2f4b23',
        }, {
          colors: ['3c5c2c', '4a7038'], n: 9, w: 4, h: 3, vary: 2,
          lit: '567a43', dark: '2c4621',
        }],
        // the holes a shade darker than the first cut: against two clump
        // layers they were reading as more clump, not as the space between
        holes: { colors: ['233a1a', '2b4019'], n: 6, w: 4, h: 3, vary: 3 },
        flecks: {
          colors: ['375528', '4c7139', '446535', '527a3d'],
          n: 160, w: 1, h: 1,
        },
        // light from above over the whole tile, stronger than the side-face
        // gradient: a canopy shades itself, and the packs this style learns
        // from all carry it
        grad: { top: 1.07, bottom: 0.91 },
      },
      // Water is streaks, not stipple. Three layers of horizontal runs in
      // near tones — long faint ones underneath, short brighter ones on top,
      // a few glints last — over two bands so close to the base they read as
      // depth rather than as drawn stripes. The first cut used confetti
      // flecks and hard bands, and it looked like a swimming pool liner.
      water: {
        base: '2f6f96',
        bands: [[7, 5, '34779e'], [20, 7, '2a638a']],
        flecks: [
          { colors: ['3a80a6', '28618a'], n: 20, w: 11, h: 1 },
          { colors: ['428aae', '245c84'], n: 16, w: 6, h: 1 },
          { colors: ['57a2c4'], n: 7, w: 3, h: 1 },
        ],
      },
      // The cross-quad plants, drawn fresh at the full 32 texels. Everything
      // else in the game wears this style's fine grain, and the classic
      // sprites — outlined discs and chunky blades — were the last pixel art
      // left standing in it. The presence of this key is also the switch: a
      // style without `plant` keeps the classic sprites (see classicTiles).
      plant: {
        // the turf's own greens, one thin tapering blade at a time
        tuft: {
          colors: ['456d31', '55813d', '5e8b43', '6d9a4e', '3d612f'],
          n: 15, hMin: 12, hMax: 24,
        },
        stem: '4a7434',
        // petals in three tones plus the flower's heart — lit up-left like
        // every other mark in the style, and never outlined
        petal: {
          red: { base: 'b04338', lit: 'c96253', dark: '832f27', heart: 'd9b04a' },
          yellow: { base: 'd0a83e', lit: 'e2c25f', dark: 'a07f2a', heart: '87681f' },
          blue: { base: '5b6fbe', lit: '7d90d4', dark: '43549b', heart: 'd9c766' },
        },
        mushroom: {
          cap: '9d4f36', capLit: 'b96f4f', capDark: '703525',
          fleck: 'd9cfbd', gills: '8d8170',
          stem: 'cbc0a9', stemLit: 'ded4c0', stemDark: 'a3987f',
        },
        // the canopy's own greens on the crown, the log's own bark below
        sapling: {
          trunk: '6b5133', trunkLit: '82653f',
          leaves: ['3f6030', '486d36', '4f7439', '547742'],
        },
        // ripe gold off the style's straw, young green off its turf
        wheat: {
          gold: ['b98f42', 'c9a251', 'a87f38'],
          green: ['5d8a42', '55813d', '4b7535'],
        },
      },
    },
  },
];

// HOW MUCH OF THE REALISTIC STYLE A MACHINE CAN AFFORD. It used to be three
// styles — Realistic, Realistic Low, Realistic Very Low — that differed only
// in resolution, and the player asked for the obvious thing instead: one
// Realistic style and a dial that goes as low as the machine needs, because
// the fan says when it is too much. Five steps, each a quarter of the one
// above in texels, and each giving up something more than texels, because
// the graphics card's work is mostly LIGHT, not texture:
//
//   n       texels a block of photograph (realism.js builds the arrays at n)
//   bodies  the people and animals repainted at this many times their own
//           resolution (realbody.js)
//   taps    lookups in the soft shadow's filter, of the twelve it has (lit.js)
//   fast    the photograph's relief and sheen and the world-scale tone left
//           off: the surface lit flat by the same sun (LIT_FAST in lit.js)
//
// `medium` is what Realistic Low was and `low` what Very Low was, so a world
// saved in either still opens looking as it did (RETIRED, below).
export const REAL_DETAIL = [
  { n: 256, name: 'full', bodies: 8, taps: 12, fast: false },
  { n: 128, name: 'high', bodies: 4, taps: 8, fast: false },
  { n: 64, name: 'medium', bodies: 2, taps: 6, fast: false },
  { n: 32, name: 'low', bodies: 1, taps: 4, fast: false },
  { n: 16, name: 'lowest', bodies: 1, taps: 1, fast: true },
];
export const realDetail = (n) => REAL_DETAIL.find((d) => d.n === n) ?? REAL_DETAIL[0];

// Styles that are no more, and what a world saved in one opens in instead.
// A string is a style; an object is a style and the detail it stood for.
export const RETIRED_STYLES = {
  pure: 'classic', outline: 'classic', vivid: 'classic', bevel: 'classic',
  poster: 'classic', layered: 'classic', deep: 'classic',
  'classic-calm': 'classic', 'classic-relief': 'classic', 'classic-emboss': 'classic',
  'real-low': { style: 'real', detail: 64 },
  'real-vlow': { style: 'real', detail: 32 },
};

// The look the game opens in. Classic is what this game IS — the pixel art
// every block, tool and creature was first drawn in — and it is the look a
// player should be handed rather than one they have to go and find. The
// other is one key off (Y) and one click in the style card; a world saved or
// shared in a style of its own still opens in it, because the look belongs
// to the world by then and not to this line.
// Realistic, the player's choice of what the game opens in. Classic is a
// press of Y away, and a world or a host that says otherwise still wins.
let styleId = 'real';

// Set the style used by the NEXT buildAtlas()/restyleAtlas(). A retired
// style's id opens its successor (RETIRED_STYLES); an id nobody has ever
// heard of returns false and leaves the current style alone, so a stale id
// in a saved world cannot leave the game with no textures.
export function setTextureStyle(id) {
  const r = RETIRED_STYLES[id];
  if (r) id = typeof r === 'string' ? r : r.style;
  if (!STYLES.some((s) => s.id === id)) return false;
  styleId = id;
  return true;
}

export function currentStyle() {
  return STYLES.find((s) => s.id === styleId);
}

// pixel rect of a tile inside atlas.image (canvas coords, y down)
export function tilePixels(tile) {
  return { x: (tile % COLS) * TS, y: ((tile / COLS) | 0) * TS, w: TS, h: TS };
}

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
// Five tones per material, darkest first: shadow, dark, base, light, accent.
// They are authored as hex because that is how they were picked — by eye,
// against each other — and hex is the only notation where that stays legible.

const hex = (s) => [
  parseInt(s.slice(0, 2), 16),
  parseInt(s.slice(2, 4), 16),
  parseInt(s.slice(4, 6), 16),
];
const ramp = (...cs) => cs.map(hex);

const PAL = {
  // ground
  // DARKER, AND MUCH CLOSER TOGETHER.
  //
  // Two separate faults, and the second was the loud one. The ramp ran from
  // 2b511e to 71b04c: the green channel travelled 81 to 176 across five stops,
  // so `tone` — which picks a discrete stop and dithers between neighbours,
  // never blending — laid a field down as confetti. Every stop was legible as
  // its own colour, which is why no two greens ever looked like the same grass
  // catching the light differently. It is the fault the path ramp below already
  // names: tones that sit close read as one material with a grain in it, tones
  // spaced wide read as speckle.
  //
  // And it was too bright with it. 71b04c is a lime, and grass under a real sky
  // is a duller, greyer, more olive thing — the saturation here is cut to about
  // a third of what it was (green leads red by ~22 rather than ~95), which is
  // what stops a whole planet of it reading as a snooker table.
  //
  // Green now travels 82 to 125 rather than 81 to 176: less than half the
  // spread, so the stops blend into one another instead of arguing.
  grass: ramp('3d5236', '465c3e', '4f6746', '58724e', '627d57'),
  // The canopy takes the same medicine as the grass above it, and for the same
  // two reasons: the old ramp ran its green from 61 to 153, so `tone` laid a
  // leaf block down as confetti rather than as foliage, and it was saturated
  // enough to sit on top of the turf instead of belonging to it. These are the
  // grass tones a few steps deeper — a leaf IS the same plant matter in shade,
  // and a tree whose canopy shares a family with the field it stands in is the
  // whole difference between a wood and a stand of green umbrellas.
  leaf: ramp('32452c', '3b4f34', '44593c', '4d6344', '576e4d'),
  soil: ramp('4a3527', '5e4433', '74563f', '8b6b4f', 'a2826a'),
  soilWet: ramp('42301f', '55402b', '684f38', '7c6045', '917254'),
  soilDry: ramp('5c4530', '735a3e', '8a6f4e', 'a0855f', 'b69b75'),
  // The trodden path: BROWN. It was olive for a long time, on the argument
  // that a path painted in earth colours is invisible against the earth it is
  // cut through — which is true of a path cut through a field and false of the
  // thing actually being matched, where a worn track is dark warm earth with
  // the dust walked out of it. Olive at these values does not read as trodden
  // ground at all; it reads as dry grass, and a village square paved in it
  // came out the colour of a lawn in August.
  //
  // What survives from that argument is the SPACING. Five widely spaced tones
  // is a heap of confetti; these sit close together on purpose, which is what
  // lets the surface read as one material with a grain in it rather than as
  // speckle, and it is the half of the old note that was right.
  // Warm, golden, and BLENDED. Three things had to be true at once and the
  // first two cuts of this each got one of them.
  //
  // The floor has to stay well off black. At luma 61 the darkest texels read
  // as holes punched in the ground rather than as shade, which is what made
  // the first brown look like mud rather than earth.
  //
  // The ramp has to run warm. Near-neutral browns — 42 points of red over
  // blue at the bottom — go grey at a distance and the whole surface reads as
  // dirt in shadow whatever its brightness.
  //
  // And the tones have to sit CLOSE. This is the one the second cut missed:
  // 83 points of luma between the darkest and lightest is a spread you read as
  // light-and-dark speckle rather than as a colour, and a path wants to be one
  // material with a grain in it. 57 is tight enough that the eye takes the
  // whole surface as a single warm brown and the grain as its texture, which
  // is the whole difference between a track and a heap of confetti — the point
  // the very first note on this ramp made, and then spaced too widely to keep.
  pathTop: ramp('785936', '8a683f', '9b7648', 'ac8451', 'bc915a'),
  sand: ramp('a08b56', 'bba46c', 'd2bd85', 'e3d29e', 'f0e4bd'),
  // Desert sand. The beach ramp pushed hot and a shade darker: the tones are
  // spaced the same, so it takes the same grain and the same stray grains and
  // comes out as sand that has been baked rather than as orange paint.
  sandOrange: ramp('9a5520', 'b56c28', 'cd8636', 'df9f4c', 'edb970'),
  gravel: ramp('3f434b', '5a5f66', '757a80', '8d9299', 'a7acb2'),

  // rock
  // NEUTRAL GREY, not blue-grey. The old ramp carried about twelve more blue
  // than red at every stop, which on a cliff face the size of a hillside reads
  // as slate — a cold, faintly lilac rock. Stone wants to be the colour that
  // lets everything else in the palette be a colour: the greens beside it look
  // greener and the browns browner when the rock itself is not competing.
  // R, G and B within two of each other all the way up.
  stone: ramp('4b4b4d', '5e5e60', '757577', '8d8d8f', 'a8a8aa'),
  mortar: ramp('2f3238', '3b3e45', '474b53', '575c65', '6a6f79'),
  clay: ramp('6d7484', '808897', '949cab', 'a8b0bd', 'bec5d0'),
  brick: ramp('56271f', '6f3327', '8c4434', 'a5563f', 'bd6e52'),
  brickMortar: ramp('8f887c', 'a29a8d', 'b3aa9d', 'c2bab0', 'd0c9c0'),
  snow: ramp('b3bfd0', 'c9d3e1', 'dee6f0', 'eef3f9', 'ffffff'),
  ice: ramp('4a86b0', '6aa3c8', '8cbfdc', 'aed7ec', 'd2eefb'),

  // wood
  bark: ramp('3a2a1a', '4c3823', '5f4a2e', '745c3a', '8a7049'),
  plank: ramp('6a4a2b', '87603a', '9f7548', 'b78d5c', 'cfa876'),
  straw: ramp('8a6a2a', 'a5833a', 'c09c4c', 'd6b566', 'e8cd8c'),

  // liquid + light
  water: ramp('17427a', '1f5a9e', '2b76c2', '4494d9', '6cb3e8'),
  flame: ramp('8a2c0a', 'c85210', 'e8871c', 'f6bd3c', 'fff0a8'),

  // minerals: the ore body colour, laid into a stone matrix
  coal: ramp('141419', '1e1e26', '2b2b34', '3b3b46', '55555f'),
  ironOre: ramp('6b4a2e', '8a6440', 'a87d55', 'c2996f', 'd8b78e'),
  silverOre: ramp('7e8794', '9aa3b0', 'b8c0cb', 'd5dbe4', 'f2f5f9'),
  gemOre: ramp('16666b', '1f8d90', '2fb2b0', '5ed2ce', '9aece7'),
  flint: ramp('2c2e36', '3d404a', '51555f', '676c77', '868b96'),

  goldOre: ramp('7a5a11', 'a37a18', 'c99e26', 'e0bd4c', 'f2da85'),
  // The three ores added for the alloys. Iron ore is already a tan brown and
  // silver a pale cool grey, so these are pitched to be COUNTABLE beside them
  // in one wall: copper a hot orange, zinc a dark blue-grey well under
  // silver's value, tin a pale straw grey well over zinc's. Value and hue
  // both — a set that varies only in hue cannot be told apart by lamplight.
  copperOre: ramp('6e3312', '96471b', 'c0662c', 'd98a52', 'f0b183'),
  zincOre: ramp('30485a', '486a80', '6b90ad', '92b4cc', 'bcd8e8'),
  tinOre: ramp('6f6a52', '918b6e', 'b8b092', 'd0caae', 'e6e2cd'),

  // worked metal
  iron: ramp('5b6069', '7c828c', '9aa1ab', 'bcc2cb', 'e2e7ee'),
  silver: ramp('6f7887', '909aa8', 'b3bcc8', 'd6dde6', 'f5f8fb'),
  gold: ramp('6d4c15', '8f6620', 'b3852e', 'd0a548', 'e8c877'),
  // Brass is gold and iron alloyed and it has to look like neither. Gold is
  // an ORANGE yellow; brass is a lemon one, a step paler and with the orange
  // taken out — which is the only difference two warm metals side by side in
  // a hotbar can be told apart by.
  brass: ramp('6f5f1b', '958128', 'bda94e', 'd5c47c', 'ece0b4'),
  // The worked metals that go with them. Four warm metals now share a hotbar,
  // so they are separated by where they sit on the orange-to-lemon line AND by
  // value: copper is the reddest, bronze a darker olive gold thirty steps
  // under gold's, gold the orange yellow it always was, brass the lemon one.
  // Zinc and tin are both grey, and so are iron and silver, so four pale
  // metals would have shared one hotbar and one wall. They are pulled apart on
  // HUE and VALUE both: zinc down into a dark steel blue, tin up into a warm
  // putty, leaving iron neutral in the middle and silver the palest and
  // coolest of the four.
  copper: ramp('5e2a12', '84401c', 'ad5a2b', 'c9804d', 'e2a97c'),
  bronze: ramp('452709', '673c12', '8a5c22', 'ab7d3e', 'c9a26c'),
  zinc: ramp('39505f', '4f6c80', '6f8ea6', '95b0c4', 'c0d4e2'),
  tin: ramp('6b6754', '8d886e', 'b3ae94', 'ccc8b2', 'e2dfd0'),

  // organics
  bread: ramp('7b4d21', '9a662e', 'b8823f', 'd0a05c', 'e4bd83'),
  apple: ramp('6d1418', '9a1f23', 'c02f2c', 'd85a4a', 'f09a86'),
  meatRaw: ramp('7d2f3c', 'a84954', 'c86a72', 'e0929a', 'f2bcbf'),
  meatDone: ramp('47250f', '693819', '8b5027', 'a86c3c', 'c4915c'),
  bone: ramp('9a927f', 'b8b09c', 'd2ccb9', 'e6e1d2', 'f7f4ea'),
  hide: ramp('4c3116', '6a4620', '875c2e', 'a2743f', 'bd9059'),
  feather: ramp('9aa0aa', 'bcc2ca', 'd8dce2', 'ecf0f4', 'ffffff'),
  petalR: ramp('8c1c2a', 'b8263a', 'd8394a', 'ea5f66', 'f7908f'),
  petalY: ramp('9a6c0e', 'c08c14', 'e0ac22', 'f0c848', 'fbe288'),
  petalB: ramp('263a8e', '3450b4', '4a6ad2', '6f8ce4', '9db2f2'),
  pollen: ramp('a07a10', 'c89c1c', 'e8bf34', 'f6d968', 'fdeea6'),
  capRed: ramp('7a1a16', '9e2620', 'be352c', 'd45746', 'e88a76'),
  stem: ramp('2f5a22', '3f7429', '4f8c30', '64a63e', '80c052'),
};

// ---------------------------------------------------------------------------
// item icon masks
// ---------------------------------------------------------------------------
// Icons are hand-placed masks: '.' is transparent and every letter is a
// palette slot. Shared letters across the tool shapes:
//   D outline   H shadow   M base   L light   S specular
//   w handle shadow   x handle light
// The dark outline is not decoration — at 32px in the hotbar it is the only
// thing that separates a grey tool from a grey slot, so every tool carries one.
//
// A MASK SAYS ITS OWN GRID — see `sprite` and `spriteAt`, which take the size
// from the array's own length. Most of the classic art is 16 and blitted up 2x
// by emit(), because it was drawn in 16ths and rewriting it in 32nds would be
// a redraw rather than a resize.
//
// The TOOLS are the exception and they are drawn at the atlas's full 32. A
// held tool is not a hotbar icon: player.js draws it across a third of the
// screen, where sixteen texels blown up that far is not pixel art, it is a
// mosaic — which is exactly what it looked like. Everything else follows from
// that one number: a blade can have a lit edge AND a shadowed one, a haft can
// be four texels of two tones instead of two of one, and a pickaxe can have
// prongs you can see. One template a shape, so every tier and every metal in
// the game gets the sharper art from the same seven arrays.

// the two prongs hanging off the ends are the whole reason this reads as a
// pickaxe and not as a hammer — a straight bar is not a silhouette
const S_PICK = [
  '................................',
  '................................',
  '................................',
  '..........DDDDDDDDDDDD..........',
  '........DDDSSSSSSSSSSDDD........',
  '......DDSSSLLLLLLLLLLLSSDD......',
  '.....DDSSLLLLMMMMMMLLLLLLDD.....',
  '....DSSLLLMMMMMMMMMMMMLLLLSD....',
  '...DSSLLMMMHHHHHHHHHMMMMLLLLD...',
  '..DSSLLMMHHHDDDxxwwDHHMMMLLLLD..',
  '.DSSLLMMHHDD.DxxxwwDDDHMMMLLLLD.',
  'DDSLLMMHHD..DDxxwwDD..DHMMMLLLDD',
  'DSLLMMHDD...DxxwwwD....DDMMMLLLD',
  'DSLMMHHD...DxxxwwD......DMMMMLLD',
  'DLMMMHD...DDxxwwD........DMMLLMD',
  'DLMMHDD...DxxwwwD........DDSLMMD',
  'DLLMHD...DxxwwwD..........DSLMHD',
  'DDLMHD..DDxxwwD...........DSLMDD',
  '.DLMMD..DxxwwDD...........DSMHD.',
  '..DLMD.DxxwwwD............DSMD..',
  '..DDDDDDxxwwD.............DDDD..',
  '......DxxwwDD...................',
  '.....DxxwwwD....................',
  '....DxxxwwD.....................',
  '....DxxwwDD.....................',
  '...DxxwwwD......................',
  '..DxxxwwD.......................',
  '.DDxxwwDD.......................',
  '.DxxwwwD........................',
  '.DxxwwD.........................',
  '.DxwwDD.........................',
  '.DDDDD..........................',
];

const S_AXE = [
  '................................',
  '.....D..........................',
  '...DDDDD........................',
  '...DLLMHDDDDD...................',
  '...DLLMHSSSSSDDDDDD.............',
  '..DLLLMHSSSSSSSSSSDDDD..........',
  '.DLLLLMHLLLLLLLLSSSSSSD.........',
  '.DLLLLMHLLLLLLLLLLLLLLLD........',
  '.DLLLLMHLLLLLLLLLLLLLLLD........',
  '.DMMLLMHMMMMMMMMMMMMMMMD........',
  '.DMMLLMHMMMMMMMMMMMMMMMD........',
  '.DMMLLMHMMMMMMMMHHHHHHDD........',
  '..DHLLMHHHHHHHHHHHHHHDD.........',
  '..DDLLMHHHHHHHHxwwwDD...........',
  '...DLLMHHHDDDxxwwwD.............',
  '...DDLMDDD.DxxxwwD..............',
  '....DDD...DDxxwwDD..............',
  '.........DDxxwwwD...............',
  '.........DxxwwwD................',
  '........DxxxwwD.................',
  '.......DxxxwwDD.................',
  '......DDxxwwDD..................',
  '......DxxwwwD...................',
  '.....DxxxwwD....................',
  '....DxxxwwDD....................',
  '...DDxxwwDD.....................',
  '...DxxwwwD......................',
  '..DxxwwwD.......................',
  '.DxxxwwDD.......................',
  '.DxxwwDD........................',
  '.DxwwwD.........................',
  '..DDDD..........................',
];

const S_SHOVEL = [
  '................................',
  '.........................DDD....',
  '........................DSSLDD..',
  '.......................DSSLLLD..',
  '......................DSSLLLMMD.',
  '.....................DSSLLLMMHD.',
  '....................DSSLLLMMHHD.',
  '...................DSSLLLMMHHDD.',
  '..................DSSLLLMMHHDD..',
  '.................DSSLLLMMHHDD...',
  '................DSSLLLMMHHDD....',
  '...............DSSLLLMMHHDD.....',
  '...............DSLLLMMHHDD......',
  '...............DLLLMMHHDD.......',
  '..............DxxLMMHHDD........',
  '.............DxxxwMHHDD.........',
  '............DDxxwwwDDD..........',
  '...........DDxxwwwD.............',
  '..........DDxxwwwD..............',
  '.........DDxxwwwD...............',
  '........DDxxwwwD................',
  '.......DDxxwwwD.................',
  '......DDxxwwwD..................',
  '.....DDxxwwwDD..................',
  '....DDxxwwwDD...................',
  '...DDxxwwwDD....................',
  '..DDxxwwwDD.....................',
  '..DxxxwwDD......................',
  '.DxxxwwDD.......................',
  '.DxxwwDD........................',
  '.DxwwDD.........................',
  '.DDDDD..........................',
];

// The classic sword, the way everyone draws it: a chunky diagonal blade
// running corner to corner, two tones of metal alternating down its length
// so the flats shimmer, a stepped edge, and a WIDE dark crossguard sitting
// square across the base — the guard is half of what makes the silhouette
// read as a sword and not a knife. Grip and pommel below.
// The sword the way Minecraft draws it: the blade a clean diagonal with a
// bright upper edge and a shadowed lower one, the guard two square nubs at
// NINETY DEGREES to the blade — perpendicular, not a horizontal bar — and
// the grip carrying the same diagonal down to a pommel.
const S_SWORD = [
  '.............................DD.',
  '...........................DDMD.',
  '.........................DDSMDD.',
  '......................DDDSLLMD..',
  '.....................DSSSLLMMD..',
  '....................DSSLLLMMD...',
  '...................DSSLLLMMMD...',
  '..................DSSLLLMMMD....',
  '.................DSSLLLMMMMD....',
  '................DSSLLLMMMMD.....',
  '...............DSSLLLMMMMD......',
  '..............DSSLLLMMMMD.......',
  '.............DSSLLLMMMMDD.......',
  '............DSSLLLMMMMDD........',
  '...........DSSLLLMMMMDD.........',
  '....DDDD..DSSLLLMMMMDD..........',
  '....DHMMDDSSLLLMMMMDD...........',
  '....DHHMMSSLLLMMMMDD............',
  '....DDHHMMLLLMMMMDD.............',
  '.....DDHHMMLMMMMDD..............',
  '......DSHHMMMMMDD...............',
  '......DxxxHMMMDD................',
  '.....DxxxwHHMMD.................',
  '....DxxxwwMHHMMD................',
  '...DxxxwwDDDHHMMD...............',
  '.DDxxxwwDD.DDHHMD...............',
  'DDLMMwwDD...DDHHD...............',
  'DLMMMHDD.....DDDD...............',
  'LMMMHDD.........................',
  'MMMHHD..........................',
  'MMHHD...........................',
  'DDDD............................',
];

// the blade hangs off one side only: that asymmetry is what separates a hoe
// from a pickaxe at a glance
const S_HOE = [
  '................................',
  '................................',
  '.....DDDDDDDDDDDDDDDDD..........',
  '....DSSLMSSSSSSSSSSSSSDD........',
  '...DLLLLMMLLLLLLLLLLLLLD........',
  '...DMMLLMMMMMMMMMMMMMMMD........',
  '...DMMLLMMMMMMMMMMMMMMMD........',
  '....DHLLMMHHHHHHHHHHHHDD........',
  '.....DLLMMDDDDDDDxxwwDD.........',
  '.....DLLMMD....DxxwwwD..........',
  '.....DLLMMD...DxxwwwD...........',
  '.....DLLMMD..DDxxwwDD...........',
  '.....DLLMMD..DxxwwwD............',
  '.....DLLMMD.DxxwwwD.............',
  '.....DLLMMDDxxxwwD..............',
  '.....DLLMMDDxxwwDD..............',
  '.....DLLMMDxxwwwD...............',
  '......DDDDxxxwwD................',
  '........DDxxwwDD................',
  '........DxxwwwD.................',
  '.......DxxwwwD..................',
  '......DxxxwwD...................',
  '.....DDxxwwDD...................',
  '.....DxxwwwD....................',
  '....DxxxwwD.....................',
  '...DDxxwwDD.....................',
  '...DxxwwwD......................',
  '..DxxwwwD.......................',
  '.DxxxwwD........................',
  '.DxxwwDD........................',
  '.DxwwwD.........................',
  '..DDDD..........................',
];

// materials: a trapezoid ingot, a faceted gem, a knobbly raw nugget
const S_INGOT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....DDDDDDDD....',
  '...DSSLLLLLMD...',
  '..DSSLLLLLLLMD..',
  '..DMMMMMMMMMMD..',
  '..DMHHHHHHHHHD..',
  '..DHHHHHHHHHHD..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
  '................',
  '................',
];

const S_GEM = [
  '................',
  '................',
  '......DDDD......',
  '....DDSLLSDD....',
  '..DDSLLLLLLSDD..',
  '..DSLLMMMMLLSD..',
  '..DHLMMMMMMLHD..',
  '...DHMMMMMMHD...',
  '....DHMMMMHD....',
  '.....DHMMHD.....',
  '......DHHD......',
  '.......DD.......',
  '................',
  '................',
  '................',
  '................',
];

const S_LUMP = [
  '................',
  '................',
  '................',
  '.....DDDD.......',
  '...DDSLLMDD.....',
  '..DSLLLMMMD.....',
  '..DSLLMMMMMD....',
  '.DDLMMMMMMMHD...',
  '.DMMMMMMMMHHD...',
  '.DHMMMMMMHHHD...',
  '..DHMMMMHHHD....',
  '..DHHMMHHHD.....',
  '...DDHHHDD......',
  '.....DDD........',
  '................',
  '................',
];

const S_STICK = [
  '................',
  '...........DD...',
  '..........DxwD..',
  '..........DxwD..',
  '.........DxwD...',
  '.........DxwD...',
  '........DxwD....',
  '........DxwD....',
  '.......DxwD.....',
  '.......DxwD.....',
  '......DxwD......',
  '......DxwD......',
  '.....DxwD.......',
  '.....DxwD.......',
  '.....DDD........',
  '................',
];

// --- plant masks ------------------------------------------------------------
// Plants are cross-planes, so the silhouette IS the texture: anything left as
// '.' is a genuine hole you see the world through, and the shape has to read
// edge-on from any angle. Hence tall stems, wide blooms, no thin filigree.

const S_FLOWER = [
  '................',
  '......DDDD......',
  '.....DPpPPD.....',
  '....DPPCCPPD....',
  '....DpCCCCPD....',
  '....DPPCCPPD....',
  '.....DPPpPD.....',
  '......DsSD......',
  '.......sS.......',
  '.......sS.......',
  '..DGGGGsS.......',
  '...DGGGsS.......',
  '.......sSGGGD...',
  '.......sSGGGGD..',
  '.......sS.......',
  '.......sS.......',
];

const S_MUSHROOM = [
  '................',
  '................',
  '.....DDDDDD.....',
  '...DDCCWWCCDD...',
  '..DCWWCCCCWWCD..',
  '..DCCCCCCCCCCD..',
  '..DCCWWCCCCCCD..',
  '...DDDDDDDDDD...',
  '.....DSWWSD.....',
  '.....DSWWSD.....',
  '.....DSWWSD.....',
  '.....DSWWSD.....',
  '.....DSWWSD.....',
  '......DDDD......',
  '................',
  '................',
];

const S_SAPLING = [
  '................',
  '......DDD.......',
  '....DDLLLDD.....',
  '...DLLGLLGLD....',
  '..DLGGGLLGGLD...',
  '..DLGGGGGGGGD...',
  '..DGGGdGGGGD....',
  '...DGGdGGGD.....',
  '....DGdGDD......',
  '.....DdD........',
  '.....DdD........',
  '.....DdD........',
  '.....DdD........',
  '.....DdD........',
  '......D.........',
  '................',
];

// --- held item masks --------------------------------------------------------

const S_GUN = [
  '................',
  '................',
  '...DDDDDDDDDD...',
  '..DSLLLLLLLLMD..',
  '..DMMMMMMMMMHD..',
  '..DHHHDDDDDDDD..',
  '..DMMMD.........',
  '.DxxwMD.........',
  '.DxxwD..........',
  '.DxxwD..........',
  '..DxxwD.........',
  '..DxxwD.........',
  '..DxxwD.........',
  '...DxwD.........',
  '...DDD..........',
  '................',
];

const S_BULLET = [
  '................',
  '.......DD.......',
  '......DSLD......',
  '.....DSLLbD.....',
  '.....DSLLbD.....',
  '.....DDDDDD.....',
  '.....DSBBbD.....',
  '.....DSBBbD.....',
  '.....DSBBbD.....',
  '.....DSBBbD.....',
  '.....DSBBbD.....',
  '.....DSBBbD.....',
  '.....DbbbbD.....',
  '.....DBBBBD.....',
  '.....DDDDDD.....',
  '................',
];

// The heavy weapons. A bazooka is one long tube with a flared muzzle; the
// launcher is a boxy magazine showing three loaded mouths; both keep the
// wooden grip every other gun wears so they read as the same family.
const S_BAZOOKA = [
  '................',
  '............DD..',
  '..DDDDDDDDDDSLD.',
  '.DSLLLLLLLLDSLD.',
  '.DMMMMMMMMMDSLD.',
  '.DHHHHHHHHHDSLD.',
  '..DDDDDDDDDDDD..',
  '.....DxxwD......',
  '.....DxxwD......',
  '......DxwD......',
  '......DxwD......',
  '.......DD.......',
  '................',
  '................',
  '................',
  '................',
];

const S_LAUNCHER = [
  '................',
  '.DDDDDDDDDDDDD..',
  '.DLLLLLLLLLLLMD.',
  '.DLDDMDDMDDMLMD.',
  '.DLDDMDDMDDMLMD.',
  '.DMMMMMMMMMMMMD.',
  '.DHHHHHHHHHHHHD.',
  '.DDDDDDDDDDDDD..',
  '....DxxwD.......',
  '....DxxwD.......',
  '.....DxwD.......',
  '.....DDD........',
  '................',
  '................',
  '................',
  '................',
];

// nose cone, steel body, tail fins — unmistakably not a bullet
const S_ROCKET = [
  '................',
  '.......DD.......',
  '......DRrD......',
  '.....DRRrrD.....',
  '.....DSLLbD.....',
  '.....DSLLbD.....',
  '.....DSLLbD.....',
  '.....DSLLbD.....',
  '.....DSLLbD.....',
  '.....DSLLbD.....',
  '....DRDDDDrD....',
  '...DRRD..DrrD...',
  '...DDDD..DDDD...',
  '................',
  '................',
  '................',
];

// The rifle and the shotgun in profile: a long thin barrel against a boxy
// receiver and a sloped wooden stock, versus two fat tubes over a pump. The
// pistol keeps the original compact S_GUN — that one always was a pistol.
const S_RIFLE = [
  '................',
  '................',
  '..DDDDDDDDDD....',
  '.DSLLLLLLLMMDD..',
  '.DDDDDDDMMMMxwD.',
  '.......DMMDxxwD.',
  '.......DMDDxwD..',
  '......DMMD.DD...',
  '......DDD.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const S_SHOTGUN = [
  '................',
  '................',
  '..DDDDDDDDDDD...',
  '.DSSSSSSSSSMMD..',
  '.DLLLLLLLLLMMD..',
  '.DDDDxxwDDMMxwD.',
  '.....DxwD.DxxwD.',
  '......DD...DDD..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// The medieval and prehistoric racks. All drawn upright — a weapon in a slot
// reads by silhouette, and a vertical shaft is the clearest one there is.

// an arc of stick strung taut on the right
const S_BOW = [
  '................',
  '......DDD.......',
  '.....DSxLDw.....',
  '....DSx..Dw.....',
  '...DSx....w.....',
  '...DSx....w.....',
  '...DSx....w.....',
  '...DSx....w.....',
  '...DSx....w.....',
  '...DSx....w.....',
  '....DSx..Dw.....',
  '.....DSxLDw.....',
  '......DDD.......',
  '................',
  '................',
  '................',
];

// flint tip, shaft, fletching — the anatomy lesson in one column
const S_ARROW = [
  '................',
  '.......D........',
  '......DFD.......',
  '......DFfD......',
  '.......DfD......',
  '.......SxD......',
  '.......Sx.......',
  '.......Sx.......',
  '.......Sx.......',
  '.......Sx.......',
  '.......Sx.......',
  '.....E.Sx.E.....',
  '.....EESxEE.....',
  '.....E.DD.E.....',
  '................',
  '................',
];

// a leaf-shaped steel head on a long haft
const S_SPEAR = [
  '..............DDD...............',
  '..............DMD...............',
  '..............DMD...............',
  '.............DLMMD..............',
  '............DLLMMMD.............',
  '...........DSLLMMMHD............',
  '...........DSLLMMMHD............',
  '...........DSLLMMMHD............',
  '...........DSLLMMMHD............',
  '...........DSLLMMMHD............',
  '............DLLMMHD.............',
  '............DLLMMHD.............',
  '............DSLMMHD.............',
  '............DxLMMwD.............',
  '............DxLMMwD.............',
  '............DxLMMwD.............',
  '............DxLMMwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DxxwwwD.............',
  '............DDxwwDD.............',
  '.............DxwwD..............',
];

// most of an ingot on a haft: the head is the whole silhouette
const S_HAMMER = [
  '................................',
  '................................',
  '..DDDDDDDDDDDDDDDDDDDDDDDDDDD...',
  '.DDSSSSSSSSSSSSSSSSSSSSSSSSSDD..',
  '.DLLLLLLLLLLLLLLLLLLLLLLLLLLLD..',
  'DLLLLLLLLLLLLLLLLLLLLLLLLLLLLLD.',
  'DLLLLLLLLLLLLLLLLLLLLLLLLLLLLLD.',
  'DMMMMMMMMMMMMMMMMMMMMMMMMMMMMMD.',
  'DMMMMMMMMMMMMMMMMMMMMMMMMMMMMMD.',
  '.DHHHHHHHHHHHHHHHHHHHHHHHHHHHD..',
  '.DDHHHHHHHHHHHHHHHHHHHHHHHHHDD..',
  '..DDDDDDDDDDDDxwwDDDDDDDDDDDD...',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
  '.............DxwwD..............',
];

// a branch with a business end: fat, tapering, all wood
const S_CLUB = [
  '................',
  '.....DDDD.......',
  '....DxxLwD......',
  '...DxxLLxwD.....',
  '...DxxLLxwD.....',
  '...DxxLxxwD.....',
  '....DxxxwD......',
  '.....DxxwD......',
  '.....DxxwD......',
  '......DxwD......',
  '......DxwD......',
  '......DxwD......',
  '......DxwD......',
  '.......DD.......',
  '................',
  '................',
];

// the spear's grandfather: a knapped edge lashed to the same haft
const S_FLINT_SPEAR = [
  '.......D........',
  '......DFD.......',
  '.....DFfFD......',
  '.....DFfD.......',
  '......DfFD......',
  '......DfD.......',
  '.......ww.......',
  '.......xw.......',
  '.......xw.......',
  '.......xw.......',
  '.......xw.......',
  '.......xw.......',
  '.......xw.......',
  '.......xw.......',
  '.......DD.......',
  '................',
];

// a knapped blade you can hold: edge one side, grip the other
const S_FLINT_KNIFE = [
  '................',
  '......DD........',
  '.....DFfD.......',
  '.....DFfD.......',
  '....DFfD........',
  '....DFfD........',
  '...DFfD.........',
  '...DFfD.........',
  '....DwD.........',
  '....DxwD........',
  '....DxwD........',
  '.....DxwD.......',
  '.....DDD........',
  '................',
  '................',
  '................',
];

// --- the track and the network ----------------------------------------------
// These carry three ramps and not one: D outline, HMLS for steel, w/x for
// timber, qrty for copper, and g/G for the light in a lamp. Nothing else in
// the item set needs copper AND a glow in one picture, which is why the
// letters are declared here rather than shared with the tools.

// Two posts and two rails: a fence, drawn as the thing rather than as the
// timber it is cut from. The posts are laid over the rails so they read as
// standing in front of them.
const S_FENCE = [
  '................................',
  '................................',
  '................................',
  '................................',
  '......DDDDD..........DDDDD......',
  '......DLLLD..........DLLLD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '..DDDDDLMHDDDDDDDDDDDDLMHDDDDD..',
  '..DLLLDLMHDLLLLLLLLLLDLMHDLLLD..',
  '..DLMMDLMHDMMMMMMMMMMDLMHDMMHD..',
  '..DLHHDLMHDHHHHHHHHHHDLMHDHHHD..',
  '..DDDDDLMHDDDDDDDDDDDDLMHDDDDD..',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '..DDDDDLMHDDDDDDDDDDDDLMHDDDDD..',
  '..DLLLDLMHDLLLLLLLLLLDLMHDLLLD..',
  '..DLMMDLMHDMMMMMMMMMMDLMHDMMHD..',
  '..DLHHDLMHDHHHHHHHHHHDLMHDHHHD..',
  '..DDDDDLMHDDDDDDDDDDDDLMHDDDDD..',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLMHD..........DLMHD......',
  '......DLHHD..........DLHHD......',
  '......DDDDD..........DDDDD......',
  '................................',
  '................................',
];

const S_GATE = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...DDDDD................DDDDD...',
  '...DLLLD................DLLLD...',
  '...DLMHD................DLMHD...',
  '...DDDDDDDDDDDDDDDDDDDDDDDDDD...',
  '...DLLLLLLLLLLLLLLLLLLLLLLLLD...',
  '...DLHHHHHHHHHHHHHHHHHHHHHHHD...',
  '...DDDDDDDDDDDDDDDDDDDDDDDDDD...',
  '...DLMHD.......LMM......DLMHD...',
  '...DLMHD......LMM.......DLMHD...',
  '...DLMHD.....LMM........DLMHD...',
  '...DLMHD....LMM.........DLMHD...',
  '...DLMHD...LMM..........DLMHD...',
  '...DLMHD..LMM...........DLMHD...',
  '...DLMHD.LMM............DLMHD...',
  '...DLMHD.MM.............DLMHD...',
  '...DDDDDDDDDDDDDDDDDDDDDDDDDD...',
  '...DLLLLLLLLLLLLLLLLLLLLLLLLD...',
  '...DLHHHHHHHHHHHHHHHHHHHHHHHD...',
  '...DDDDDDDDDDDDDDDDDDDDDDDDDD...',
  '...DLMHD................DLMHD...',
  '...DLHHD................DLHHD...',
  '...DDDDD................DDDDD...',
  '................................',
  '................................',
  '................................',
  '................................',
];

const S_WIRE = [
  '................................',
  '................................',
  '................................',
  '............DDDDDDDDD...........',
  '..........DDyyyyyytyyDD.........',
  '........DDyyttttttttttyDD.......',
  '.......DDyttttrrrrrtttttDD......',
  '......DDytttrrrrrrrrrrtttDD.....',
  '......DyttrrrqqqqqqqrrrtttD.....',
  '.....DyttrrqqDDDDDDDqrrrttrD....',
  '.....DttrrqqDD.....DDrrrrrrD....',
  '......DrrqqD.........DrttrrrD...',
  '......DDqqD..........DDttrrqD...',
  '.....DDDDD............DttrrrD...',
  '....DttrrD............DtttrrD...',
  '....DttrrDD...........DyttrrD...',
  '....DttrrqD...........DyttrqD...',
  '....DttrrrD...........DyttrqD...',
  '....DttrrrDD.........DDytrrqD...',
  '....DtttrrrD.........DyttrrqD...',
  '.....DttttttDD.....DDyttrrqD....',
  '.....DtytrqtyDDDDDDDyytrrqqD....',
  '.....DytrrrtttyyyyyytttrrqD.....',
  '....DDttrqrrtttttttttrrrqDD.....',
  '....DytrqqrrrrrttttrrrqqDD......',
  '...DytrrDDqqrrrrrrrrqqqDD.......',
  '..DDttrqDDDDqqqqqqqqqDD.........',
  '..DytttttyDDDDDDDDDDD...........',
  '..DDrrrrtttyD...................',
  '...DDqqrrrtttD..................',
  '.....DDDqrrrtD..................',
  '.......DDDqrD...................',
];

const S_SWITCH = [
  '................................',
  '................................',
  '................................',
  '................................',
  '......................yyt.......',
  '.....................yyttr......',
  '.....................ttrrr......',
  '....................Dtrrqq......',
  '....................DtqqqD......',
  '...................DytrqD.......',
  '...................DttrqD.......',
  '..................DytrqD........',
  '..................DttrqD........',
  '.................DytrqD.........',
  '.................DttrqD.........',
  '................DytrqD..........',
  '...............DDttrqD..........',
  '...............DytrqD...........',
  '..............DDtrrDD...........',
  '..............DytrqD............',
  '....SSSSSSSSSSStrrSSSSSSSSSS....',
  '....LLLLLLLLLLytrqLLLLLLLLLH....',
  '....LLLLLLLLLLLrrLLLLLLLLLMH....',
  '....LLLLLLLLLLLLLLLLLLLLLMMH....',
  '....LLMMMMMMMMMMMMMMMMMMMMMH....',
  '....LHHHHHHHHHHHHHHHHHHHHHMH....',
  '....HHHHHHHHHHHHHHHHHHHHHHHH....',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

const S_DYNAMO = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...............DD...............',
  '....SSSSSDDDDDDrqDDDDDDSSSSS....',
  '...DLyyyyyyyyyyrqyyyyyyyyyyHD...',
  '..DDyyyyyyyyyyyrqyyyyyyyyyyyDD..',
  '..DttttttttttttrqttttttttttttD..',
  '.DtttttttttttttrqtttttttttttttD.',
  '.DtttttttttttttrqtttttttttttttD.',
  '.DtttttttttttttrqtttttttttttttD.',
  '.DrrrrrrrrrrrrrrqrrrrrrrrrrrrrD.',
  '.DrrrrrrrrrrrrrrqrrrrrrrrrrrrrD.',
  '.DrrrrrrrrrrrrrrqrrrrrrrrrrrrrD.',
  '..DqqqqqqqqqqqqrqqqqqqqqqqqqqD..',
  '..DDqqqqqqqqqqqrqqqqqqqqqqqqDD..',
  '...DLqqqqqqqqqqrqqqqqqqqqqqHD...',
  '....LLMMHDDDDDDrqDDDDDDLLMMH....',
  '....LLMMH......DD......LLMMH....',
  '....LHHMH..............LHHMH....',
  '...SHHHHHSSSSSSSSSSSSSSHHHHHS...',
  '...LLLLLLLLLLLLLLLLLLLLLLLLLH...',
  '...LLLLLLLLLLLLLLLLLLLLLLLLMH...',
  '...LLMMMMMMMMMMMMMMMMMMMMMMMH...',
  '...LHHHHHHHHHHHHHHHHHHHHHHHMH...',
  '...HHHHHHHHHHHHHHHHHHHHHHHHHH...',
  '................................',
  '................................',
  '................................',
];

const S_POWER_LAMP = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '.............GGGGGG.............',
  '...........GGGGGGGGGG...........',
  '..........GGGGGGGGGGGG..........',
  '.........GGGGGGGGGGGGGG.........',
  '........GGGGGGGGGGGGGGGg........',
  '........GGGGGGGrqGGGGggg........',
  '........GGGGGGGrqGGggggg........',
  '.......GGGGGGGGrqqggggggg.......',
  '.......GGGGGGGrqrqggggggg.......',
  '.......GGGGGGGrqrqggggggg.......',
  '........GGGGGgrqrqgggggg........',
  '........GGGgggqggrgggggg........',
  '........Gggggggggggggggg........',
  '.........gggggggggggggg.........',
  '.........LggggggggggggH.........',
  '.........LLggggggggggH..........',
  '..........LLLggggggLMH..........',
  '..........LLMMMMMMMMHH..........',
  '..........LLHHHHHHHHH...........',
  '...........HHHHHHHHHH...........',
  '.............LLLLLH.............',
  '.............LLLLMH.............',
  '.............LLMMMH.............',
  '.............LHHHMH.............',
  '.............HHHHHH.............',
  '................................',
  '................................',
];

const S_RAIL = [
  '.......DSLMHD......DSLMHD.......',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '..DDxxxxSLMHxxxxxxxxSLMHxxxxDD..',
  '..DxxxxxSLMHxxxxxxxxSLMHxxxxxD..',
  '..DwwwwwSLMHwwwwwwwwSLMHwwwwwD..',
  '..DDwwwwSLMHwwwwwwwwSLMHwwwwDD..',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '.......DSLMHD......DSLMHD.......',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '..DDxxxxSLMHxxxxxxxxSLMHxxxxDD..',
  '..DxxxxxSLMHxxxxxxxxSLMHxxxxxD..',
  '..DwwwwwSLMHwwwwwwwwSLMHwwwwwD..',
  '..DDwwwwSLMHwwwwwwwwSLMHwwwwDD..',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '.......DSLMHD......DSLMHD.......',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '..DDxxxxSLMHxxxxxxxxSLMHxxxxDD..',
  '..DxxxxxSLMHxxxxxxxxSLMHxxxxxD..',
  '..DwwwwwSLMHwwwwwwwwSLMHwwwwwD..',
  '..DDwwwwSLMHwwwwwwwwSLMHwwwwDD..',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '.......DSLMHD......DSLMHD.......',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '..DDxxxxSLMHxxxxxxxxSLMHxxxxDD..',
  '..DxxxxxSLMHxxxxxxxxSLMHxxxxxD..',
  '..DwwwwwSLMHwwwwwwwwSLMHwwwwwD..',
  '..DDwwwwSLMHwwwwwwwwSLMHwwwwDD..',
  '...DDDDDSLMHDDDDDDDDSLMHDDDDD...',
  '.......DSLMHD......DSLMHD.......',
  '.......DSLMHD......DSLMHD.......',
  '.......DSLMHD......DSLMHD.......',
  '........DLMD........DLMD........',
];

const S_WAGON = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '..DDDDDDDDDDDDDDDDDDDDDDDDDDDD..',
  '.DLLLLLLLLLLLLLLLLLLLLLLLLLLLLD.',
  '.DMMMMMMMMMMMMMMMMMMMMMMMMMMMMD.',
  '.DHHHHHHHHHHHHHHHHHHHHHHHHHHHHD.',
  '..DxxxwwwwwwwwwwwwwwwwwwwwwwwD..',
  '....xxwwwwwwwwwwwwwwwwwwwwww....',
  '....xxwwwwwwwwwwwwwwwwwwwwww....',
  '....xxxwwwwwwwwwwwwwwwwwwwww....',
  '....xxxwwwwwwwwwwwwwwwwwwwww....',
  '....xxxwwwwwwwwwwwwwwwwwwwww....',
  '....xxxwwwwwwwwwwwwwwwwwwwww....',
  '.....xxwwwwwwwwwwwwwwwwwwww.....',
  '.....xwwwwwwwwwwwwwwwwwwwww.....',
  '.....wwwSSSSwwwwwwwwSSSSwww.....',
  '.......SSSSLL......SSSSLL.......',
  '......SSSLLLLM....SSSLLLLM......',
  '......SLLHHLMM....SLLHHLMM......',
  '.....LLLHHHHMMH..LLLHHHHMMH.....',
  '......LLMHHMMH....LLMHHMMH......',
  '......LMMMMHHH....LMMMMHHH......',
  '.......MMHHHH......MMHHHH.......',
  '........HHHH........HHHH........',
  '................................',
  '................................',
  '................................',
];

// a haunch: fat end top right, bone sticking out bottom left, so the two
// halves read apart even at 32px
const S_MEAT = [
  '................',
  '.........DDD....',
  '........DSMMD...',
  '.......DSMMMMD..',
  '......DSMMMMMMD.',
  '.....DSMMMMMMMD.',
  '....DSMMMMMMMMD.',
  '....DSMMMMMMMD..',
  '...DMMMMMMMMD...',
  '..DMMMMMMMMD....',
  '..DHMMMMMMD.....',
  '.DLLDMMMMDD.....',
  'DLSLDMMMDD......',
  'DLLLDDDDD.......',
  'DLLLD...........',
  '.DDD............',
];

const S_FEATHER = [
  '.............DD.',
  '...........DDSLD',
  '..........DSLLD.',
  '.........DSLwLD.',
  '........DSLwLD..',
  '.......DSLwLD...',
  '......DSLwLD....',
  '.....DSLwLD.....',
  '....DSLwLD......',
  '...DSLwLD.......',
  '...DSwLD........',
  '...DwD..........',
  '..DwD...........',
  '..DD............',
  '................',
  '................',
];

// a stretched hide, legs and all — a plain rectangle reads as a rug, and the
// four stubs are what say "skin" at icon size
const S_LEATHER = [
  '................',
  '..DDD......DDD..',
  '.DHMD......DMHD.',
  '.DMLDDDDDDDDLMD.',
  '.DMLLLLLLLLLLMD.',
  '..DLLLLLLLLLLD..',
  '..DLLLHHLLLLLD..',
  '.DMLLLHHLLLLLMD.',
  '.DMLLLLLLLLLLMD.',
  '..DLLLLLLLLLLD..',
  '..DMLLLLLLLLMD..',
  '.DMLDDDDDDDDLMD.',
  '.DMLD......DLMD.',
  '.DHMD......DMHD.',
  '..DDD......DDD..',
  '................',
];

// a little heap of ground bone, pale on pale
const S_BONE_MEAL = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......L..S......',
  '....S.H.L..L....',
  '...LHHSHHLHS....',
  '..SHLHHHSHHHL...',
  '..HHSHLHHHLHHS..',
  '.DHHHHSHHHHSHHD.',
  '.DDDDDDDDDDDDD..',
  '................',
  '................',
  '................',
  '................',
];

const S_BONE = [
  '................',
  '................',
  '................',
  '..DD........DD..',
  '.DSLD......DSLD.',
  '.DLLDDDDDDDDLLD.',
  '.DLSLLLLLLLLSLD.',
  '.DLHLLLLLLLLHLD.',
  '.DHHDDDDDDDDHHD.',
  '.DHHD......DHHD.',
  '..DD........DD..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// tool palettes: one per tier. Value AND hue both move between tiers — wood is
// dark and warm, stone mid and neutral, iron light and neutral, diamond light
// and cyan — so the four are told apart by silhouette colour alone at 32px.
const HEADS = {
  // the wooden head sits a couple of steps LIGHTER than the handle: wood on
  // wood is the one tier where head and grip would otherwise merge
  WOOD: {
    D: hex('20160c'), H: hex('6a4a2b'), M: hex('8f6738'),
    L: hex('ad8250'), S: hex('c6a06e'),
  },
  STONE: {
    D: hex('1b1d22'), H: hex('41454d'), M: hex('636872'),
    L: hex('848a94'), S: hex('a3a9b3'),
  },
  IRON: {
    D: hex('232629'), H: hex('6f757f'), M: hex('9aa1ab'),
    L: hex('c3c9d2'), S: hex('eef2f7'),
  },
  DIAMOND: {
    D: hex('0c3236'), H: hex('16777d'), M: hex('26a8a7'),
    L: hex('5fd2cd'), S: hex('a8f0ea'),
  },
};
const HANDLE = { x: hex('79582f'), w: hex('4c3720') };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// painting primitives
// ---------------------------------------------------------------------------

// 4x4 Bayer. 4 divides 16, so the matrix tiles with the atlas and a dithered
// gradient never shows a seam.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// pick a ramp entry for a continuous value, dithering the boundary between the
// two nearest tones instead of blending them into a new colour
function tone(r, t, x, y) {
  const n = r.length - 1;
  const f = (t < 0 ? 0 : t > 1 ? 1 : t) * n;
  let i = Math.floor(f);
  if (f - i > bayer(x, y)) i++;
  return r[i < 0 ? 0 : i > n ? n : i];
}

// shortest signed distance on the 16-wide torus — the basis of every wrapped
// blob, stone cell and crystal below
function sdist(a, b, n = TS) {
  let d = a - b;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

// A 16x16 scratch tile. Coordinates wrap, which is what makes every painter
// seamless without any edge special-casing.
class Pix {
  // `n` is the grid this tile is painted on: TS for art authored at the atlas
  // resolution, CT for the classic painters, which emit() then blits up.
  constructor(n = TS) { this.n = n; this.d = new Float32Array(n * n * 4); }
  i(x, y) {
    const n = this.n;
    const xi = ((Math.floor(x) % n) + n) % n;
    const yi = ((Math.floor(y) % n) + n) % n;
    return (yi * n + xi) * 4;
  }
  set(x, y, c, a = 1) {
    const i = this.i(x, y);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
    this.d[i + 3] = a;
  }
  get(x, y) {
    const i = this.i(x, y);
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  fill(c, a = 1) {
    for (let y = 0; y < this.n; y++) {
      for (let x = 0; x < this.n; x++) this.set(x, y, c, a);
    }
  }
  each(fn) {
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) fn(x, y);
  }
  // multiply an existing texel — used for local shading passes
  shade(x, y, k) {
    const i = this.i(x, y);
    this.d[i] *= k; this.d[i + 1] *= k; this.d[i + 2] *= k;
  }
  alpha(x, y, a) { this.d[this.i(x, y) + 3] = a; }
}

function disc(p, cx, cy, r, c) {
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy <= r * r) p.set(cx + dx, cy + dy, c);
    }
  }
}

// tileable value noise on a period-p lattice: because the lattice indices wrap,
// so does the field, at no cost and with no mirroring artefacts
function noiseFn(rand, p, n = TS) {
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (a, b) => g[(((b % p) + p) % p) * p + (((a % p) + p) % p)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / n) * p, fy = (y / n) * p;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

// two octaves; still exactly periodic, so still seamless
function fbm(rand, p, n = TS) {
  const a = noiseFn(rand, p, n), b = noiseFn(rand, p * 2, n);
  return (x, y) => a(x, y) * 0.66 + b(x, y) * 0.34;
}

// Build a fresh atlas in the active style. Deterministic in (style, seed), so
// player.js and avatar.html can build their own and get the same pixels.
export function buildAtlas(seed = 42) {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TS;
  canvas.height = ROWS * TS;
  paintAtlas(canvas, seed);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Repaint an existing atlas in place. The tile grid and every UV are identical
// between styles, so a restyle is a texture upload and nothing else — no
// re-meshing, no new material, and anything already holding the texture object
// (materials, the HUD, held items) keeps working.
export function restyleAtlas(texture, seed = 42) {
  paintAtlas(texture.image, seed);
  texture.needsUpdate = true;
  return texture;
}

function paintAtlas(canvas, seed) {
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(seed);
  // one ImageData for the whole atlas: 20k fillRect calls used to dominate the
  // build time, and a single upload is both faster and easier to reason about
  const out = ctx.createImageData(COLS * TS, ROWS * TS);

  // Write a painted tile into the atlas, scaling it up if it was painted on a
  // smaller grid. The factor is always an integer and the copy is nearest, so
  // a 16-texel classic tile lands as 2x2 blocks — pixel-identical to what it
  // looked like when the atlas itself was 16.
  function emit(tile, p) {
    const k = TS / p.n;
    const ox = (tile % COLS) * TS, oy = ((tile / COLS) | 0) * TS;
    const W = COLS * TS;
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        const s = (((y / k) | 0) * p.n + ((x / k) | 0)) * 4;
        const d = ((oy + y) * W + ox + x) * 4;
        out.data[d] = p.d[s];
        out.data[d + 1] = p.d[s + 1];
        out.data[d + 2] = p.d[s + 2];
        out.data[d + 3] = p.d[s + 3] * 255;
      }
    }
  }

  // paint a tile: `fn` gets a fresh wrapped scratch buffer on the `n` grid
  function paint(tile, fn, n = TS) {
    const p = new Pix(n);
    fn(p);
    emit(tile, p);
    return p;
  }

  const ri = (n) => (rand() * n) | 0;                 // integer in [0, n)
  const rf = (a, b) => a + rand() * (b - a);

  // --- the grass family, one painter per style ----------------------------
  // These three tiles (and only these three) are authored per style. Nothing
  // below is procedural texture: every mark is a solid rectangle placed on a
  // grid. The rule the whole set is built on is BIG CELLS, FEW COLOURS, BIG
  // VALUE GAPS — a patch is 4x4 texels or larger, so eight or fewer fit across
  // a face, and each colour sits far enough from its neighbour to be counted
  // rather than averaged. Small marks close in value are what "blur" means.

  // The flat art gets its OWN random stream. The classic tiles draw from the
  // atlas stream and their art depends on the draw order, so if these painters
  // pulled from it, picking a style would silently redraw all forty other
  // tiles.
  const frand = mulberry32(seed ^ 0x9e3779b9);
  const fri = (n) => (frand() * n) | 0;
  const pick = (a) => hex(a[fri(a.length)]);

  // ...and the realistic FINISH gets a third stream of its own, for the same
  // reason again one level down: the finish passes (mottle, striations, board
  // tones, snow dapples...) run interleaved between the flat painters, and if
  // they pulled from `frand` every mark already approved on a later tile
  // would re-roll the moment a finish pass was added or tuned. On their own
  // stream the base art is byte-stable and the finish is genuinely a layer.
  const rrand = mulberry32(seed ^ 0x51ab3d97);
  const rri = (n) => (rrand() * n) | 0;
  const rrf = (a, b) => a + rrand() * (b - a);

  // a wrapped solid rectangle. Writes go through Pix.set, so a rect that runs
  // off one edge comes back on the other and joins up with the copy in the
  // neighbouring tile, which is what stops a pattern boxing every block.
  function rect(p, x0, y0, w, h, c) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) p.set(x0 + x, y0 + y, c);
    }
  }

  // The border. Three flavours: a fixed `color`, a `tint` (a multiply of
  // whatever is underneath, so the line is a dark version of the block's own
  // colour and survives per-face shading unchanged), or a `bevel`.
  //
  // The bevel is the interesting one. A stroke of one value reads as a cut-out
  // sticker; the SAME one-texel stroke with the lit end of a black ramp on the
  // top and left edges and the darkest end on the bottom and right reads as a
  // raised tile. It is three-dimensional without being one texel thicker,
  // which matters because thickness is the thing that keeps getting rejected.
  //
  // One texel is the floor at TS=32 — there is no thinner line — so the only
  // way to lose visual weight is to spend less VALUE on it, which is exactly
  // what putting two of the four edges on a mid grey does.
  function border(p, line) {
    if (!line) return;
    if (line.bevel) {
      const b = line.bevel;
      const L = hex(b.lit), M = hex(b.mid), D = hex(b.dark);
      for (let i = 0; i < TS; i++) {
        p.set(i, 0, L); p.set(0, i, L);              // toward the light
        p.set(i, TS - 1, D); p.set(TS - 1, i, D);    // away from it
      }
      // the two corners where a lit edge meets a dark one take the mid tone,
      // or the ramp jumps and the bevel reads as a broken frame
      p.set(TS - 1, 0, M); p.set(0, TS - 1, M);
      if (b.second) {                 // dark edges only — never all four
        for (let i = 1; i < TS - 1; i++) { p.set(i, TS - 2, M); p.set(TS - 2, i, M); }
      }
      return;
    }
    const c = line.color ? hex(line.color) : null;
    for (let d = 0; d < line.width; d++) {
      for (let i = 0; i < TS; i++) {
        for (const [x, y] of [[i, d], [i, TS - 1 - d], [d, i], [TS - 1 - d, i]]) {
          if (c) p.set(x, y, c); else p.shade(x, y, line.tint);
        }
      }
    }
  }

  // A mosaic of square cells, each a flat colour off a short list. `merges`
  // then repaints a few 2x2 groups as one cell, so the face carries a couple
  // of genuinely large shapes as well as the grid — without them the eye reads
  // an even grid as a texture rather than as a patchwork.
  function cellGrid(p, spec) {
    const { size, colors, merges = 0 } = spec;
    for (let y = 0; y < TS; y += size) {
      for (let x = 0; x < TS; x += size) rect(p, x, y, size, size, pick(colors));
    }
    for (let i = 0; i < merges; i++) {
      const x = fri(TS / size) * size, y = fri(TS / size) * size;
      rect(p, x, y, size * 2, size * 2, pick(colors));
    }
  }

  function checkerGrid(p, spec) {
    const { size, colors } = spec;
    for (let y = 0; y < TS; y += size) {
      for (let x = 0; x < TS; x += size) {
        const i = ((x / size) + (y / size) * (TS / size)) % colors.length;
        rect(p, x, y, size, size, hex(colors[i | 0]));
      }
    }
  }

  // A raised lump: a solid rectangle with a lit line along its top and left
  // edge and a dark one along its bottom and right. This is the whole of
  // "3D shapes in the face" — a flat blob is flat, the same blob with two
  // edges lit and two shaded is a clod sitting ON the surface. Costs no extra
  // marks and no extra tones beyond the two ramp ends.
  function lumpMarks(p, spec, y0 = 0, y1 = TS) {
    const { colors, n, w = 6, h = 5, vary = 3, lit, dark } = spec;
    for (let i = 0; i < n; i++) {
      const ww = w + fri(vary), hh = h + fri(vary);
      const x = fri(TS), y = y0 + fri(Math.max(1, y1 - y0 - hh));
      rect(p, x, y, ww, hh, pick(colors));
      if (!lit) continue;
      const L = hex(lit), D = hex(dark);
      for (let k = 0; k < ww; k++) { p.set(x + k, y, L); p.set(x + k, y + hh - 1, D); }
      for (let k = 0; k < hh; k++) { p.set(x, y + k, L); p.set(x + ww - 1, y + k, D); }
      p.set(x + ww - 1, y, L);       // keep the corners on their own edge's
      p.set(x, y + hh - 1, D);       // tone, so the ramp reads round the lump
    }
  }

  // Solid little rectangles — the speckles and pebbles the references carry.
  // They are 2-4 texels a side, which at TS=32 is the smallest mark allowed;
  // anything finer averages into the base colour at a distance.
  function specks(p, spec, y0 = 0, y1 = TS) {
    const { colors, n, w = 3, h = 2 } = spec;
    for (let i = 0; i < n; i++) {
      rect(p, fri(TS), y0 + fri(Math.max(1, y1 - y0 - h)), w, h, pick(colors));
    }
  }

  // --- the realistic finish passes -----------------------------------------
  // Generic, data-driven, and MULTIPLICATIVE: each works on whatever the
  // family painter drew, so one helper serves turf, rock, timber and sand
  // alike. All of them are dead code for a style that does not set the
  // matching look key, and the ones that roll dice roll them on `rrand`.

  // Baked ambient occlusion: two soft rings just inside the tile's border,
  // the outer stronger, and a touch more where two edges meet. Applied LAST,
  // so it shades marks and borders alike — a vignette, not an outline.
  // `k` scales the whole effect toward nothing: a chest is a distinct
  // object and wears the full ring, but a meadow is ONE surface and a
  // full-strength ring on every grass block turns it into graph paper —
  // the terrain tiles ask for half.
  function aoPass(p, A, k = 1) {
    const soft = (v) => 1 - (1 - v) * k;
    const e = soft(A.edge ?? 0.87);
    const rings = [e, 1 - (1 - e) * 0.45];
    const corner = soft(A.corner ?? 0.91);
    p.each((x, y) => {
      const dx = Math.min(x, TS - 1 - x), dy = Math.min(y, TS - 1 - y);
      const d = Math.min(dx, dy);
      if (d < rings.length) p.shade(x, y, rings[d]);
      if (dx < 2 && dy < 2) p.shade(x, y, corner);
    });
  }

  // The sky-light gradient a side face carries: a few per cent lighter along
  // the top row than the bottom, one multiply per row.
  function gradPass(p, G) {
    for (let y = 0; y < TS; y++) {
      const k = G.top + (G.bottom - G.top) * (y / (TS - 1));
      for (let x = 0; x < TS; x++) p.shade(x, y, k);
    }
  }

  // The broad tonal mottle under the fine grain: a handful of big wrapped
  // blobs, each a few per cent lighter or darker than whatever it lies on.
  // Overlaps multiply, so the field comes out genuinely irregular rather
  // than as countable rectangles.
  function mottlePass(p, S) {
    for (let i = 0; i < S.n; i++) {
      const w = S.w + rri(S.vary ?? 3), h = S.h + rri(S.vary ?? 3);
      const x = rri(TS), y = rri(TS), k = rrf(S.lo, S.hi);
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) p.shade(x + xx, y + yy, k);
      }
    }
  }

  // a wrapped rectangle multiplied per CHANNEL — how a shadow goes cold
  // (snow) without any pass owning a colour of its own
  function tintRect(p, x0, y0, w, h, kr, kg, kb) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = p.i(x0 + x, y0 + y);
        p.d[i] *= kr; p.d[i + 1] *= kg; p.d[i + 2] *= kb;
      }
    }
  }

  // Faint diagonal striations and a few glossy mineral texels, over any tile
  // built on the stone material. The striae are shading, not paint, so they
  // follow whatever facet they cross; the sparkles are the one or two texels
  // per face where a mica flake catches the sun.
  function stoneFinish(p, L, M) {
    const S = L.stoneDetail;
    if (!S) return;
    for (let i = 0; i < S.striae.n; i++) {
      const x0 = rri(TS), y0 = rri(TS), len = S.striae.len + rri(5);
      const k = i % 2 ? S.striae.lit : S.striae.dark;
      for (let j = 0; j < len; j++) p.shade(x0 + j, y0 + j, k);
    }
    for (let i = 0; i < S.sparkle.n; i++) {
      p.set(rri(TS), rri(TS), lighten(M.ramp[M.ramp.length - 1], S.sparkle.k));
    }
  }

  // Blocky tuft silhouettes standing on a top face: a bar with one offshoot,
  // never a stalk — a 1-texel stalk is exactly the mark that disappears.
  function tuftMarks(p, spec) {
    const { color, n } = spec;
    const c = hex(color);
    for (let i = 0; i < n; i++) {
      const x = fri(TS), y = fri(TS), h = 9 + fri(5);
      rect(p, x, y, 4, h, c);
      rect(p, x + 4, y + 3 + fri(3), 4, h - 6, c);
    }
  }

  // Hand-authored tongue depths, exactly TS long so they wrap by construction,
  // and written in pairs so the teeth stay chunky. `big` is the vector-poster
  // fringe: four-texel teeth hanging a third of the way down the face.
  const FRINGE = [
    8, 8, 12, 12, 10, 10, 8, 8, 6, 6, 10, 10, 14, 14, 12, 12,
    8, 8, 6, 6, 8, 8, 12, 12, 14, 14, 10, 10, 8, 8, 6, 6,
  ];
  const FRINGE_BIG = [
    8, 8, 8, 8, 20, 20, 20, 20, 11, 11, 11, 11, 22, 22, 22, 22,
    9, 9, 9, 9, 18, 18, 18, 18, 8, 8, 8, 8, 16, 16, 16, 16,
  ];

  // the top face
  function flatGrassTop(p, L) {
    p.fill(hex(L.grass));
    if (L.cells) cellGrid(p, L.cells);
    if (L.checker) checkerGrid(p, L.checker);
    if (L.patches) {
      for (const [x, y, w, h, c] of L.patches) rect(p, x, y, w, h, hex(c));
    }
    if (L.lumps) lumpMarks(p, L.lumps);
    if (L.flecks) specks(p, L.flecks);
    if (L.tufts) tuftMarks(p, L.tufts);
    border(p, L.line);
  }

  // the earth, shared by DIRT and the lower part of GRASS_SIDE. Several styles
  // want real design down here — banded topsoil over subsoil, chunky browns,
  // pebbles — so this is not just a fill.
  function soilBody(p, L) {
    p.fill(hex(L.soil));
    if (L.soilCells) cellGrid(p, L.soilCells);
    if (L.soilPatches) {
      for (const [x, y, w, h, c] of L.soilPatches) rect(p, x, y, w, h, hex(c));
    }
    if (L.subsoil) {
      rect(p, 0, L.subsoil.from, TS, TS - L.subsoil.from, hex(L.subsoil.color));
    }
    if (L.soilLumps) lumpMarks(p, L.soilLumps);
  }

  function flatDirt(p, L) {
    soilBody(p, L);
    if (L.pebbles) specks(p, L.pebbles, 2, TS - 2);
    border(p, L.line);
  }

  function flatGrassSide(p, L) {
    soilBody(p, L);
    const table = L.fringeTable === 'big' ? FRINGE_BIG : FRINGE;
    const g = hex(L.fringe || L.grass);
    // pebbles stay clear of the turf: they belong in the soil, and one caught
    // half under the fringe reads as a mistake rather than a stone
    if (L.pebbles) specks(p, L.pebbles, Math.max(...table) + 2, TS - 2);
    for (let x = 0; x < TS; x++) {
      for (let y = 0; y < table[x]; y++) p.set(x, y, g);
    }
    // a shadow band following the tongues: the dark line under turf that makes
    // the grass sit ON the soil instead of being painted onto it
    if (L.shadow) {
      const sc = hex(L.shadow.color);
      for (let x = 0; x < TS; x++) {
        for (let k = 0; k < L.shadow.rows; k++) p.set(x, table[x] + k, sc);
      }
    }
    border(p, L.line);          // last, so the turf overhangs the line
  }

  // --- the wood family, one painter per style -----------------------------
  // LOG_SIDE, LOG_TOP and PLANK, on exactly the terms the grass is drawn on:
  // solid rectangles on a grid, marks four texels or bigger, wide value gaps,
  // and at most one texel of line. No noise, no dither, no per-texel anything.
  //
  // Two orientation facts pick the shapes, and both are load-bearing:
  //
  //  * LOG_SIDE is the upright side of a trunk, so its grain has to run
  //    VERTICALLY. Every bark mark therefore either spans the full height or
  //    is a wrapped rectangle. A full-height bar makes the tile's top edge and
  //    bottom edge identical by construction, so a trunk of any height has no
  //    joint in it at all — which matters more now that nothing rotates.
  //  * PLANK has a fixed up (it is never rotated, and a plank block wears
  //    LOG_TOP on its top face, never PLANK), so horizontal board seams are
  //    correct. The board rows are constant in x, so the left/right seam costs
  //    nothing to get right.

  // Full-height vertical bars: the bark grain, and the backbone of every log
  // side here. `merges` widens a few of them so the face is not a barcode.
  function barkBars(p, spec) {
    const { w, colors, merges = 0 } = spec;
    for (let x = 0; x < TS; x += w) rect(p, x, 0, w, TS, pick(colors));
    for (let i = 0; i < merges; i++) {
      rect(p, fri(TS / w) * w, 0, w * 2, TS, pick(colors));
    }
  }

  // The same idea cut into cells that are TALLER than they are wide, so the
  // patchwork styles keep their grid without the grain turning sideways.
  function barkCells(p, spec) {
    const { w, h, colors } = spec;
    for (let x = 0; x < TS; x += w) {
      for (let y = 0; y < TS; y += h) rect(p, x, y, w, h, pick(colors));
    }
  }

  // Splits down the bark. Full height, so seamless up a trunk, and at HAND
  // PLACED columns rather than random ones. That is the fix for the one thing
  // the 3x3 sheet caught on the plain styles: three grooves dropped at random
  // are a signature, and a signature repeated every 32 texels across a wall is
  // the motif the eye locks onto. Spaced every eight, the pattern's period is
  // 8 rather than 32 and the tile boundary stops existing.
  function grooveMarks(p, spec) {
    const c = hex(spec.color);
    for (const x of spec.at) rect(p, x, 0, spec.w, TS, c);
  }

  // The cut end. Growth rings as concentric SQUARES: a rasterised circle at 32
  // texels is a staircase of one-texel steps, which is exactly the fine detail
  // that mushes at a distance, whereas a square ring is a solid band of
  // constant thickness the whole way round. `off` moves the pith off centre —
  // real end grain is never a bullseye, and nothing rotates any more, so the
  // tile is allowed a definite up and left. `lit`/`dark` put a step on the
  // inner and outer texel of each ring so the rings read as terraces cut into
  // the wood rather than as a target painted on it.
  function ringMarks(p, spec) {
    const { w, colors, lit, dark, off = [0, 0] } = spec;
    const cs = colors.map(hex);
    const cx = (TS - 1) / 2 + off[0], cy = (TS - 1) / 2 + off[1];
    const L = lit ? hex(lit) : null, D = dark ? hex(dark) : null;
    p.each((x, y) => {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)) - 0.5;
      const k = Math.max(0, Math.floor(d / w));
      p.set(x, y, cs[k % cs.length]);
      if (!L) return;
      const f = d - k * w;
      if (f < 1) p.set(x, y, L); else if (f >= w - 1) p.set(x, y, D);
    });
  }

  function flatLogSide(p, L) {
    const W = L.wood;
    p.fill(hex(W.bark));
    if (W.bars) barkBars(p, W.bars);
    if (W.cells) barkCells(p, W.cells);
    if (W.blocks) for (const [x, y, w, h, c] of W.blocks) rect(p, x, y, w, h, hex(c));
    if (W.lumps) lumpMarks(p, W.lumps);
    if (W.chips) specks(p, W.chips);
    if (W.grooves) grooveMarks(p, W.grooves);
    // The knots: a dark eye in a mid ring with a lit brow above, the one
    // mark bark carries that is not a fibre. Placed off the finish stream
    // and kept clear of the top and bottom rows, so a stacked trunk never
    // shows half a knot at a joint.
    if (W.knots) {
      const K = W.knots;
      const eye = hex(K.color), ring = hex(K.dark), brow = hex(K.lit);
      for (let i = 0; i < K.n; i++) {
        const x = rri(TS), y = 4 + rri(TS - 10);
        rect(p, x - 1, y - 1, 4, 3, ring);
        rect(p, x, y, 2, 1, eye);
        rect(p, x - 1, y - 2, 3, 1, brow);
      }
    }
    border(p, L.line);
  }

  function flatLogTop(p, L) {
    const W = L.wood;
    ringMarks(p, W.rings);
    if (W.pith) {
      const s = W.pith.size, o = W.rings.off || [0, 0];
      rect(p, (TS - s) / 2 + o[0], (TS - s) / 2 + o[1], s, s, hex(W.pith.color));
    }
    // A uniform band of bark round the cut end. It is also what makes the tile
    // tile: every edge texel is then the same colour, so two logs standing
    // side by side join without a line down the middle.
    if (W.rim) {
      const c = hex(W.rim.color);
      for (let i = 0; i < W.rim.w; i++) {
        for (let k = 0; k < TS; k++) {
          p.set(k, i, c); p.set(k, TS - 1 - i, c);
          p.set(i, k, c); p.set(TS - 1 - i, k, c);
        }
      }
    }
    border(p, L.line);
  }

  // Where each board's end joint falls, along a 32-texel tile. Fixed rather
  // than random: the flat styles are drawn, not generated, and four joints
  // that move every time the atlas is rebuilt would be the one thing on a
  // flat tile that flickers.
  const JOINTS = [11, 23, 5, 18];

  // The boards without the border, so the crafting table can be built out of
  // exactly the same wood as the PLANK on its own underside.
  function plankBody(p, L) {
    const W = L.wood, B = W.boards;
    const cs = B.colors.map(hex);
    const h = B.h, seam = B.seam ? hex(B.seam) : null;
    for (let b = 0; b < TS / h; b++) {
      rect(p, 0, b * h, TS, h, cs[b % cs.length]);
      if (B.cells) {
        let k = b * (TS / B.cells.w);
        for (let x = 0; x < TS; x += B.cells.w) {
          rect(p, x, b * h, B.cells.w, h, B.cells.order
            ? hex(B.cells.colors[k++ % B.cells.colors.length])
            : pick(B.cells.colors));
        }
      }
      // knots and grain stay INSIDE their own board — one straddling a seam
      // reads as a mistake rather than as a knot — and the seam goes down
      // last so nothing can cover it
      if (W.boardLumps) lumpMarks(p, W.boardLumps, b * h + 1, (b + 1) * h);
      if (W.boardChips) specks(p, W.boardChips, b * h + 1, (b + 1) * h);
      // Each board its own piece of timber: a few per cent of tone either
      // way over the whole board, grain and all. Off the finish stream, so
      // the marks the lump painter just placed stay exactly where they are.
      if (W.boardTone) {
        const k = rrf(W.boardTone.lo, W.boardTone.hi);
        for (let y = b * h; y < (b + 1) * h; y++) {
          for (let x = 0; x < TS; x++) p.shade(x, y, k);
        }
      }
      // The roundover: each board lit along its top edge and shaded along
      // its bottom — the same move that sat the stones in their bed, and
      // what makes a wall of boards read as lapped timber instead of brown
      // stripes. After the tone, so every board's edge follows its own wood.
      if (W.boardRelief) {
        for (let x = 0; x < TS; x++) {
          p.shade(x, b * h + 1, W.boardRelief.lit);
          p.shade(x, (b + 1) * h - 1, W.boardRelief.dark);
        }
      }
      // The butt joint: where one board ends and the next begins, at a
      // different place on every row. It is the mark that says these are
      // separate boards laid end to end rather than one striped sheet, and
      // no style had it. Drawn in the seam's own colour, so a style that
      // wants no seam gets no joint either and keeps its flat boards.
      if (seam) {
        const jx = JOINTS[b % JOINTS.length];
        rect(p, jx, b * h + 1, 1, h - 1, seam);
        rect(p, 0, b * h, TS, 1, seam);
        // ...and the nails that hold a butt joint down, one either side of
        // it at mid-board: a dark head with a lit texel above, which is how
        // one texel of iron catches the light. The mark that says BUILT.
        if (W.nails) {
          const nc = hex(W.nails.color);
          const nl = W.nails.lit ? hex(W.nails.lit) : null;
          const ny = b * h + (h >> 1);
          for (const nx of [jx - 3, jx + 3]) {
            p.set(nx, ny, nc);
            if (nl) p.set(nx, ny - 1, nl);
          }
        }
      }
    }
  }

  function flatPlank(p, L) {
    plankBody(p, L);
    border(p, L.line);
  }

  // --- the tiles that share a block with DIRT or with PLANK ----------------
  // A block may not wear one styled face and one classic one. PATH and TILLED
  // sit on top of a block whose four sides are DIRT; CRAFT_TOP and CRAFT_SIDE
  // sit on a block whose underside is PLANK. So all four are painted from the
  // style's OWN earth and board colours rather than from a palette of their
  // own — the material has to be recognisably the same on every face.
  //
  // Neither tile ever rotates, so both have a definite up: the furrows run
  // across the field and the scored grid on the lid has a top-left corner.

  const luma = (c) => c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11;

  // Lighten and darken IN FAMILY. A multiply keeps the hue and the saturation
  // wherever there is headroom, which a shift toward white throws away; only
  // when a channel would clip is the remainder spent toward white. `k` is a
  // ratio, so the gap between tones is the same PROPORTION in every style — a
  // pale palette gets a wide absolute gap and a dark one does not go black.
  function lighten(c, k) {
    const m = Math.max(c[0], c[1], c[2]) || 1;
    if (m * k <= 255) return c.map((v) => Math.round(v * k));
    const s = 255 / m, f = (1 - 255 / (m * k)) * 0.8;
    return c.map((v) => Math.round(v * s + (255 - v * s) * f));
  }
  const darken = (c, k) => c.map((v) => Math.round(v * k));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Three earth tones off the style's own soil. The ratios are a floor, not a
  // rule: a RATIO on a dark palette buys a small ABSOLUTE gap, and the shrink
  // test caught exactly that — `deep` and `layered` averaged into flat brown
  // because their soil starts near luma 60 and 1.48x of that is 30 steps. So
  // the gap is widened until it is worth at least ~50 and ~42 steps of value,
  // which is what makes the marks countable rather than merely present.
  function earthTones(L) {
    const b = hex(L.soil), y = Math.max(1, luma(b));
    return {
      base: b,
      pale: lighten(b, clamp((y + 50) / y, 1.48, 2.6)),
      dark: darken(b, clamp((y - 42) / y, 0.40, 0.56)),
    };
  }

  // and three board tones off the style's own planking. The seam colour is
  // used for the scored lines where a style declares one, because that is
  // already the darkest thing in its wood and the score has to read as a cut.
  function boardTones(L) {
    const B = L.wood.boards;
    const cs = B.colors.concat(B.cells ? B.cells.colors : []).map(hex)
      .sort((a, b) => luma(a) - luma(b));
    const lo = cs[0], hi = cs[cs.length - 1];
    const yl = Math.max(1, luma(lo)), yh = Math.max(1, luma(hi));
    return {
      dark: B.seam ? hex(B.seam) : darken(lo, clamp((yl - 40) / yl, 0.35, 0.60)),
      light: lighten(hi, clamp((yh + 45) / yh, 1.30, 2.2)),
    };
  }

  // Trodden earth. Hand-placed, and several of the marks run off an edge so
  // they join their copy in the next tile: a courtyard is one tile repeated,
  // and a shape that stops at the border is exactly what turns that repeat
  // into a visible grid.
  const PATH_WORN = [
    [-3, 2, 12, 9], [15, 1, 11, 7], [3, 17, 13, 9],
    [24, 13, 10, 10], [9, 26, 9, 6],
  ];
  const PATH_STONES = [[6, 21, 6, 5], [20, 5, 5, 5], [27, 23, 6, 4]];

  // A cut rather than a painted line: multiplying whatever is underneath means
  // the score is always a dark version of the board it crosses, so it reads on
  // the pale styles and on the dark ones alike. A fixed dark cannot — the
  // styles whose planking is a patchwork of four browns swallow it wherever it
  // crosses their darkest cell. Same trick as the `outline` border.
  function scoreRect(p, x0, y0, w, h, k) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.shade(x0 + x, y0 + y, k);
  }

  // The path is the one ground tile whose colour does NOT come from the
  // style. Every style derived it from its own soil, and every style
  // therefore drew a road the same colour as the ground it was cut through.
  // It is the same khaki everywhere now — the flat language is about how the
  // marks are made, not about owning every hue in the game — laid down as
  // solid patches rather than grain, which is what the styles are for.
  function flatPath(p, L) {
    p.fill(PAL.pathTop[2]);
    for (const [x, y, w, h] of PATH_WORN) rect(p, x, y, w, h, PAL.pathTop[3]);
    for (const [x, y, w, h] of PATH_STONES) rect(p, x, y, w, h, PAL.pathTop[1]);
    border(p, L.line);
  }

  // The same cut edge in the flat styles: the style's soil with the pale band
  // flatPath uses along the top, so the top face and the lip of the side are
  // painted from one colour and cannot disagree.
  function flatPathSide(p, L) {
    soilBody(p, L);
    const rows = L.fringeTable === 'big' ? 8 : 6;
    for (let x = 0; x < TS; x++) {
      for (let y = 0; y < rows; y++) p.set(x, y, PAL.pathTop[2]);
    }
    // the same shadow line the turf gets, where a style asks for one: it is
    // what makes the surface sit ON the block rather than be painted onto it
    if (L.shadow) {
      const sc = hex(L.shadow.color);
      for (let x = 0; x < TS; x++) {
        for (let k = 0; k < L.shadow.rows; k++) p.set(x, rows + k, sc);
      }
    }
    border(p, L.line);
  }

  // Ploughed soil: crest, flank, furrow bottom on an 8-row period, so four
  // furrows a tile and the field runs unbroken across a whole meadow. The
  // bands are constant in x, so the left/right wrap costs nothing, and 8
  // divides 32 so the top/bottom wrap is exact.
  function flatTilled(p, L) {
    const E = earthTones(L);
    soilBody(p, L);
    for (let y = 0; y < TS; y += 8) {
      rect(p, 0, y, TS, 3, E.pale);        // the crest, catching the light
      rect(p, 0, y + 6, TS, 2, E.dark);    // the bottom of the furrow
    }                                      // rows 3-5 keep the style's own soil
    border(p, L.line);
  }

  // The lid: the style's planking with a 3x3 scored into it and the middle
  // cell worn pale, which is where the work happens. One texel of score, and
  // the three cells are ten texels across, so the grid is countable.
  function flatCraftTop(p, L) {
    const T = boardTones(L);
    plankBody(p, L);
    for (const k of [10, 21]) {
      scoreRect(p, k, 0, 1, TS, 0.42);
      scoreRect(p, 0, k, TS, 1, 0.42);
    }
    rect(p, 13, 13, 7, 7, T.light);
    border(p, L.line);
  }

  // The side: the same planking with a recessed tool board on it — a one-texel
  // frame, a saw and a chisel, each a solid bar with a hard shadow along one
  // edge. The frame is inset, so the tile still meets its neighbours in plain
  // board.
  function flatCraftSide(p, L) {
    const T = boardTones(L);
    plankBody(p, L);
    scoreRect(p, 4, 7, 24, 1, 0.42); scoreRect(p, 4, 26, 24, 1, 0.42);
    scoreRect(p, 4, 7, 1, 20, 0.42); scoreRect(p, 27, 7, 1, 20, 0.42);
    rect(p, 8, 12, 15, 3, T.light); scoreRect(p, 8, 15, 15, 1, 0.42);
    rect(p, 17, 18, 4, 7, T.light); scoreRect(p, 21, 18, 1, 7, 0.42);
    border(p, L.line);
  }

  // --- the ground and the building materials -------------------------------
  // Sixteen hand-authored palettes a material would be sixteen chances to
  // write down the same grey twice, which is the mistake the first grass pass
  // made with brown. So each material has ONE canonical colour and each style
  // declares FOUR numbers that say what it does to any colour — and the
  // marks are per MATERIAL, because a brick course is a brick course in every
  // style. What the style changes is the palette, how many steps the shapes
  // are cut into, whether they are embossed, and the line round them.
  //
  //   sat  saturation scale        val  value scale
  //   gap  how far the tones sit apart      warm  push toward orange / blue
  //   tones how many steps the shapes are quantised into (3 for the plain
  //         styles, 5 for the patchworks — the same spread the grass has)

  // `snow` and `glass` are authored a step BELOW the white they look like on
  // purpose. `lighten` has nowhere to go above about 240, so a ramp built from
  // a near-white base comes out with its top two tones six steps apart and the
  // marks vanish in the shrink test. Starting lower buys the light end back;
  // the tile still reads white because it is the brightest thing on screen.
  const MATBASE = {
    stone: '6c7078', mortar: '474b53', sand: 'd2bd85', gravel: '757a80',
    sandOrange: 'cd8636',
    clay: '949cab', brick: '8c4434', brickMortar: 'b3aa9d', straw: 'c09c4c',
    leaf: '366d28', coal: '2b2b34', ironOre: 'a87d55', silverOre: 'b8c0cb',
    gemOre: '2fb2b0', snow: 'cdd7e4', ice: '8cbfdc', glass: 'aecfdd',
    iron: '9aa1ab', gold: 'b3852e', flame: 'e8871c', ember: 'c85210',
    water: '2b76c2',
    // the metals that arrived after the first four ores
    goldOre: 'c99e26', brass: 'bda94e', diamond: '2fb2b0',
    // ...and the three the alloys needed, plus the worked metal each becomes.
    // `silver` is here for its storage block only — the ORE has had a base of
    // its own since the first stage.
    copperOre: 'c0662c', zincOre: '6b90ad', tinOre: 'b8b092',
    copper: 'ad5a2b', bronze: '8a5c22', zinc: '6f8ea6', tin: 'b3ae94',
    silver: 'b8c4d6',
  };

  // saturation about the material's own luma, then a hue push, then value.
  // Working about the luma is what keeps `deep`'s desaturation from turning
  // every rock into the same grey — it holds the value and drops the colour.
  function restyle(base, M) {
    const c0 = hex(base), g = luma(c0);
    const s = M.sat ?? 1, w = (M.warm ?? 0) * 255;
    const c = [
      clamp(g + (c0[0] - g) * s + w, 0, 255),
      clamp(g + (c0[1] - g) * s, 0, 255),
      clamp(g + (c0[2] - g) * s - w, 0, 255),
    ].map(Math.round);
    return lighten(c, M.val ?? 1);
  }

  // n tones about the restyled base. The step is an ABSOLUTE number of value
  // steps scaled by `gap`, not a ratio — a ratio is what the shrink test
  // caught on the dark styles in stage one.
  function matRamp(base, M, n) {
    const c = restyle(base, M), y = Math.max(1, luma(c)), g = M.gap ?? 1;
    const up = clamp((y + 54 * g) / y, 1.28, 2.8);
    const dn = clamp((y - 48 * g) / y, 0.32, 0.68);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      out.push(t < 0.5 ? darken(c, dn + (1 - dn) * t * 2)
        : lighten(c, 1 + (up - 1) * (t - 0.5) * 2));
    }
    return out;
  }

  // A raised plate: the shape, plus a lit edge along its top and left and a
  // dark one along its bottom and right. Only the two styles whose grass is
  // already embossed ask for it, and it costs no extra marks.
  function plateEdge(p, x, y, w, h, R) {
    for (let k = 0; k < w; k++) { p.set(x + k, y, R.lit); p.set(x + k, y + h - 1, R.dark); }
    for (let k = 0; k < h; k++) { p.set(x, y + k, R.lit); p.set(x + w - 1, y + k, R.dark); }
    p.set(x + w - 1, y, R.lit); p.set(x, y + h - 1, R.dark);
  }

  // Everything a material painter needs from the style, in one call. `gapK`
  // widens the ramp for a material whose marks are smaller than the rest: the
  // shrink test found gravel — sixteen stones of 7x7, the smallest shape in
  // the set — averaging to flat on the gentler styles, and the answer to a
  // mark that is nearly too small is more value, not more marks.
  // ONE MATERIAL, RETINTED FOR ONE STYLE.
  //
  // MATBASE is the colour every style's ramp for a material is derived from,
  // and a style varies it only through `L.mat` — tones, gap, saturation. That
  // is right for how MUCH a style stylises a material and wrong for what
  // colour the material is: rock in this game leaned blue (6c7078 has twelve
  // more blue than red) on every style at once, and there was no way to say
  // "this one's stone is a neutral grey" without saying it for all twelve.
  //
  // So a look may name its own base for a material. Everything downstream —
  // the ramp, the facets, the grit, the mortar — is derived from it exactly as
  // before, so this changes the colour and nothing about the idiom.
  const baseOf = (L, name) => L?.base?.[name] ?? MATBASE[name];

  function mat(L, base, n, gapK) {
    const M = gapK ? { ...L.mat, gap: (L.mat.gap ?? 1) * gapK } : L.mat;
    const ramp = matRamp(base, M, n || M.tones);
    return {
      ramp,
      mid: ramp[(ramp.length - 1) >> 1],
      // Embossing is inferred from the grass having lit clumps, which is the
      // right guess for the styles that were written that way and the wrong
      // one for a style that wants relief in its turf and none in its rock:
      // `relief: false` on the look says so. A lit edge round every facet is
      // the single most stylised thing a material tile can wear.
      relief: L.relief !== false && L.lumps && L.lumps.lit
        ? { lit: lighten(ramp[ramp.length - 1], 1.4), dark: darken(ramp[0], 0.5) }
        : null,
      M,
    };
  }

  // solid rectangles off the ramp; `t` is a position 0..1 along it
  function shapes(p, ramp, list, R) {
    for (const [x, y, w, h, t] of list) {
      rect(p, x, y, w, h, ramp[Math.round(t * (ramp.length - 1))]);
      if (R) plateEdge(p, x, y, w, h, R);
    }
  }

  // Rock: nine big cleavage facets that PARTITION the tile, in three courses
  // whose splits are staggered so the face does not read as a grid, plus two
  // accent chips at the ends of the ramp. Nothing smaller than 6 texels a
  // side, because a cliff is this tile in a plain grid and the marks have to
  // survive being seen from across a valley.
  const STONE_FACETS = [
    [0, 0, 13, 11, 0.85], [13, 0, 11, 11, 0.15], [24, 0, 8, 11, 0.5],
    [0, 11, 9, 10, 0.15], [9, 11, 11, 10, 0.85], [20, 11, 12, 10, 0.15],
    [0, 21, 11, 11, 0.5], [11, 21, 11, 11, 0.15], [22, 21, 10, 11, 0.85],
    [5, 14, 8, 7, 1.0], [24, 3, 7, 6, 0.0],
  ];

  // Cobbles: nine stones on three staggered courses with a one-texel joint
  // between them, the joints laid so the wrap gives one more joint and not two.
  const COBBLE_STONES = [
    [1, 1, 10, 9, 0.9], [12, 1, 9, 9, 0.35], [23, 1, 9, 9, 0.65],
    [7, 11, 10, 10, 0.35], [18, 11, 9, 10, 0.9], [28, 11, 10, 10, 0.5],
    [1, 22, 12, 10, 0.65], [14, 22, 10, 10, 0.5], [25, 22, 7, 10, 0.9],
  ];

  // Three ripple bands, each cut into two segments that between them span the
  // whole width. The 3x3 sheet caught the first version: segments that only
  // covered part of a row left a notch at every tile boundary, and a notch
  // repeating every 32 texels across a beach is a grid.
  const SAND_RIPPLES = [
    [0, 5, 19, 4, 0.95], [19, 5, 13, 4, 0.5],
    [0, 15, 12, 4, 0.5], [12, 15, 20, 4, 0.05],
    [0, 25, 22, 4, 0.95], [22, 25, 10, 4, 0.35],
  ];

  // Clay: two broad strata and the base between them. Full-width bands, so
  // the left/right wrap is free and a clay bank reads as bedding planes.
  const CLAY_STRATA = [[0, 0, TS, 11, 0.9], [0, 19, TS, 9, 0.1]];

  // Canopy: four big clumps of leaf and three near-black gaps between them.
  // Real cutouts would show the inside of a hollow shell — see the note at the
  // end of INTEGRATION-art.md — so the gaps are painted, not punched.
  const LEAF_CLUMPS = [
    [-4, -3, 14, 13, 0.95], [13, 2, 13, 12, 0.7], [3, 15, 12, 13, 0.9],
    [19, 17, 14, 14, 0.65], [10, 10, 8, 7, 0.0], [26, 6, 8, 9, 0.05],
    [0, 27, 9, 7, 0.0],
  ];

  // Thatch: four bundles of eight rows, each a run of solid straw blocks five
  // texels wide and up, with a binding cord along the top of the bundle. Each
  // row of runs sums to exactly TS, so a roof has no vertical joint.
  const THATCH_RUNS = [
    [[0, 11, 1.0], [11, 7, 0.25], [18, 8, 0.75], [26, 6, 0.5]],
    [[0, 7, 0.5], [7, 10, 1.0], [17, 6, 0.25], [23, 9, 0.75]],
    [[0, 9, 0.75], [9, 7, 0.25], [16, 11, 1.0], [27, 5, 0.5]],
    [[0, 6, 0.25], [6, 9, 1.0], [15, 8, 0.5], [23, 9, 0.75]],
  ];

  // per-stone and per-brick tones, hand-shuffled so neither reads as a ramp
  const GRAVEL_T = [
    0.9, 0.3, 0.65, 0.15, 0.5, 0.9, 0.25, 0.7,
    0.75, 0.2, 0.95, 0.45, 0.35, 0.6, 0.1, 0.8,
  ];
  const BRICK_T = [0.85, 0.35, 0.6, 0.15, 0.45, 0.9, 0.25, 0.7];

  // The rock and the walling, without the border: the ores are cut into the
  // first and the furnace is built out of the second, and in both cases the
  // material has to be the SAME material the neighbouring block is made of.
  // The grain a style can ask for on every material tile: rock is not made of
  // flat facets, it is made of flat facets with grit all over them, and one
  // shared layer is what keeps the stone, the cobble, the sand and the clay
  // looking like they came off the same planet.
  //
  // Drawn from the tile's OWN ramp rather than from a colour list, so it
  // follows whatever the material is — grit on sand is sand-coloured without
  // anybody writing that down.
  function grit(p, L, M) {
    if (!L.grit) return;
    for (const G of [].concat(L.grit)) {
      for (let i = 0; i < G.n; i++) {
        // `mid` keeps the grit inside the middle of the ramp. Drawn from the
        // extremes it is salt and pepper — the one thing every real surface
        // has none of.
        const c = G.mid
          ? M.ramp[1 + fri(Math.max(1, M.ramp.length - 2))]
          : M.ramp[fri(M.ramp.length)];
        rect(p, fri(TS), fri(TS), G.w ?? 1, G.h ?? 1, c);
      }
    }
  }

  // Soft per-shape relief for the styles that turned the big emboss off:
  // every facet or stone lit along its top and shaded at its foot from its
  // OWN tone — cleavage planes and fitted stones rather than painted
  // patches. Same trick brickRelief and gravelRelief already play.
  function shapeRelief(p, ramp, list, R) {
    for (const [x, y, w, h, t] of list) {
      const c0 = ramp[Math.round(t * (ramp.length - 1))];
      plateEdge(p, x, y, w, h, {
        lit: lighten(c0, R.lit), dark: darken(c0, R.dark),
      });
    }
  }

  function stoneBody(p, L) {
    const M = mat(L, baseOf(L, 'stone'));
    p.fill(M.mid);
    shapes(p, M.ramp, STONE_FACETS, M.relief);
    if (!M.relief && L.stoneRelief) {
      shapeRelief(p, M.ramp, STONE_FACETS, L.stoneRelief);
    }
    grit(p, L, M);
    stoneFinish(p, L, M);
  }

  function cobbleBody(p, L, dx = 0, dy = 0) {
    const M = mat(L, baseOf(L, 'stone'));
    // the joints matter as much as the stones: a style can drop the mortar
    // darker and cooler than the material engine's neutral, which is what
    // makes the stones sit IN a bed instead of floating on a lighter one
    p.fill(L.cobbleMortar ? hex(L.cobbleMortar)
      : matRamp(MATBASE.mortar, L.mat, 1)[0]);
    const stones = dx || dy
      ? COBBLE_STONES.map(([x, y, w, h, t]) => [x + dx, y + dy, w, h, t])
      : COBBLE_STONES;
    shapes(p, M.ramp, stones, M.relief);
    if (!M.relief && L.cobbleRelief) {
      shapeRelief(p, M.ramp, stones, L.cobbleRelief);
    }
    grit(p, L, M);
    stoneFinish(p, L, M);
  }

  function flatStone(p, L) {
    stoneBody(p, L);
    border(p, L.line);
  }

  function flatCobble(p, L) {
    cobbleBody(p, L);
    border(p, L.line);
  }

  // Gravel: the same rock cut smaller and packed. Sixteen stones of 7x7 on a
  // period-8 running bond — 8 divides 32, so the field is continuous and the
  // joints are one texel everywhere including across the wrap.
  function flatGravel(p, L) {
    const M = mat(L, MATBASE.gravel, 0, 1.35);
    p.fill(matRamp(MATBASE.mortar, M.M, 1)[0]);
    for (let r = 0, i = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++, i++) {
        const x = c * 8 + (r & 1) * 4 + 1, y = r * 8 + 1;
        const c0 = M.ramp[Math.round(GRAVEL_T[i] * (M.ramp.length - 1))];
        rect(p, x, y, 7, 7, c0);
        if (M.relief) plateEdge(p, x, y, 7, 7, M.relief);
        // a style with no emboss may still want its pebbles to be pebbles:
        // a soft lit top and shadowed underside derived from each stone's
        // OWN tone, same trick as brickRelief, so no stone wears a frame
        else if (L.gravelRelief) {
          plateEdge(p, x, y, 7, 7, {
            lit: lighten(c0, L.gravelRelief.lit),
            dark: darken(c0, L.gravelRelief.dark),
          });
        }
      }
    }
    grit(p, L, M);
    border(p, L.line);
  }

  function flatSand(p, L, base = MATBASE.sand) {
    const M = mat(L, base);
    p.fill(M.mid);
    shapes(p, M.ramp, SAND_RIPPLES, null);
    // soft ripples rather than painted bands: a lit crest along the top row
    // of each ripple and a shadow in its lee — shading, so it works on
    // whichever ramp tone the band was cut from
    if (L.sandRipple) {
      for (const [x, y, w] of SAND_RIPPLES) {
        for (let k = 0; k < w; k++) {
          p.shade(x + k, y, L.sandRipple.lit);
          p.shade(x + k, y + 3, L.sandRipple.dark);
        }
      }
    }
    grit(p, L, M);
    border(p, L.line);
  }

  function flatClay(p, L) {
    const M = mat(L, MATBASE.clay);
    p.fill(M.mid);
    shapes(p, M.ramp, CLAY_STRATA, null);
    grit(p, L, M);
    border(p, L.line);
  }

  // Bricks: courses 8 rows tall, bricks 16 wide, a half-brick stagger and one
  // texel of mortar. 8 and 16 both divide 32, so the bond runs on across a
  // whole wall instead of restarting at every block.
  function flatBrick(p, L) {
    const M = mat(L, MATBASE.brick);
    // a look may declare its own mortar. The shared default restyles a pale
    // stone-dust grey, which reads as brick laid in whitewash; real mortar
    // sits in shadow between the faces, so `real` recesses it — darker and
    // cooler than every brick in the wall.
    p.fill(L.brickMortar ? hex(L.brickMortar)
      : matRamp(MATBASE.brickMortar, L.mat, 1)[0]);
    for (let c = 0, i = 0; c < 4; c++) {
      for (let b = 0; b < 2; b++, i++) {
        const x = (c & 1) * 8 + b * 16 + 1, y = c * 8 + 1;
        let body = M.ramp[Math.round(BRICK_T[i] * (M.ramp.length - 1))];
        // a few per cent of warm/cool wobble per brick — clay never fires
        // twice to the same colour. On the finish stream, so the wall's
        // tone layout itself never moves.
        if (L.brickTint) {
          const t = rrf(-L.brickTint, L.brickTint);
          body = [
            clamp(Math.round(body[0] * (1 + t)), 0, 255),
            body[1],
            clamp(Math.round(body[2] * (1 - t)), 0, 255),
          ];
        }
        rect(p, x, y, 15, 7, body);
        if (M.relief) plateEdge(p, x, y, 15, 7, M.relief);
        // A style that turned the emboss off may still ask the brickwork —
        // and only the brickwork — for its courses back: `brickRelief` is a
        // soft edge derived from each brick's OWN tone rather than from the
        // ends of the ramp, so the step stays a fraction of the brick it
        // sits on instead of the chunky frame the embossed styles wear.
        else if (L.brickRelief) {
          plateEdge(p, x, y, 15, 7, {
            lit: lighten(body, L.brickRelief.lit),
            dark: darken(body, L.brickRelief.dark),
          });
        }
      }
    }
    border(p, L.line);
  }

  // THATCH, in the flat styles.
  //
  // It was four courses of wide rectangles with a ruled dark line along the
  // top of each, which is a stack of cardboard. Straw needs two things and it
  // had neither.
  //
  // The first is that a course ENDS RAGGED. A bundle of cut stalks does not
  // finish on a straight line, and the serrated shadow under each course is
  // most of what says "layered" rather than "painted in bands".
  //
  // The second is the stalks themselves: a fine vertical grain, broken, only
  // on some columns. Not every column — a comb of lines is a corduroy, and
  // the flat styles are flat on purpose. A third of them, in two tones off
  // the material's own ramp, is enough for the eye to call it fibre.
  //
  // Both are drawn from a HASH of the texel's position, never from a random
  // stream. The note on the canopy below applies here as well: a painter that
  // draws a number re-rolls every tile after it in the atlas, so the same
  // style would come out different depending on what was painted before it.
  const strawHash = (a, b) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  function flatThatch(p, L) {
    const M = mat(L, MATBASE.straw);
    const top = M.ramp.length - 1;
    const bind = darken(M.ramp[0], 0.62);
    for (let b = 0; b < 4; b++) {
      const y0 = b * 8;
      // THE COURSE IS A BUNDLE OF STALKS, so it is drawn one COLUMN at a time
      // and not as rectangles. Every column takes its own tone off the ramp,
      // which is what gives straw its grain; the run table only decides which
      // part of the ramp this stretch sits in, so a course still reads as one
      // bundle rather than as static.
      for (const [x0, w, t] of THATCH_RUNS[b]) {
        const base = Math.round(t * top);
        for (let k = 0; k < w; k++) {
          const x = x0 + k;
          const r = strawHash(x, b);
          const lift = r < 0.30 ? -1 : r < 0.62 ? 0 : r < 0.88 ? 1 : 2;
          const c = M.ramp[Math.max(0, Math.min(top, base + lift))];
          rect(p, x, y0 + 1, 1, 7, c);
          // a stalk is not one flat line either: a short darker length in the
          // middle of some of them is the shadow between two of them
          if (strawHash(x, b + 91) < 0.42) {
            const from = y0 + 2 + Math.floor(strawHash(x, b + 57) * 3);
            const len = 2 + Math.floor(strawHash(x, b + 131) * 3);
            const dk = M.ramp[Math.max(0, Math.min(top, base + lift - 1))];
            for (let y = from; y < from + len && y < y0 + 8; y++) p.set(x, y, dk);
          }
        }
      }
      // ...and the cut ends of the course ABOVE, overhanging this one: one
      // texel of shadow the whole way and a second on about half the columns,
      // which is what stops the courses reading as ruled bands.
      for (let x = 0; x < TS; x++) {
        const r = strawHash(x, b + 313);
        // A FEW STALKS STAND PROUD of the course below and break the line
        // altogether. Without them the shadow is a rule drawn across the
        // tile, and a ruled line is the single thing that made this read as
        // stacked card rather than as layered straw.
        if (r > 0.86) continue;
        p.set(x, y0, bind);
        if (r < 0.38) p.set(x, y0 + 1, bind);
      }
    }
    border(p, L.line);
  }

  // Punch the canopy's painted gaps through into real holes. `BLOCK.LEAF` is
  // in TRANSPARENT now, so a leaf keeps its faces against the next leaf back
  // and what shows through a hole is more foliage rather than the inside of a
  // hollow shell — which is the one thing that stopped this being done.
  //
  // The darkest texels go, and exactly `frac` of them — a COUNT and not a
  // threshold. Every style paints its canopy off its own ramp, so an absolute
  // colour would take a third of `deep` and none of `meadow`; and a threshold
  // on luma is no better, because the flat styles paint the whole tile in two
  // or three tones and "everything at or below the cut" is then most of the
  // block. Sorting and taking a fixed count is the only rule that gives the
  // same density of canopy in all sixteen.
  //
  // Ties inside one flat tone break on a 2x2-cell hash, so the holes that
  // rule picks come out as small CLUMPS rather than as a pepper of single
  // texels — a canopy dithered one texel at a time reads as static, and
  // shimmers when you walk past it. The hash is of the coordinates, never of
  // a random stream: a painter that drew a number here would re-roll every
  // tile below it in the atlas.
  //
  // The outer ring of the tile is never punched. Two things live there and
  // both are darker than the middle — the outline a style draws round its
  // blocks, and the baked-AO vignette — so left in the running they win the
  // sort outright and the holes come out as a gap at every block boundary.
  // That reads as a grid, which is the one thing a canopy must not be. One
  // texel of leaf all round is 3% of the face and invisible.
// How much of a canopy tile is punched out to sky. A leaf block is not a
// hedge: light comes through a tree, and at 0.22 a canopy read as a solid
// green mass with a few pinholes in it — the thing a leaf block is trying not
// to be. 0.30 lets the sky through in the gaps between the clumps without
// taking the clumps themselves apart, which is what makes a tree read as
// foliage rather than as a shape cut out of green paper.
//
// The holes are chosen darkest-first with a clump term, so raising this eats
// the shadow between the sprigs before it touches anything lit — the canopy
// gets airier, not moth-eaten.
  function leafHoles(p, frac = 0.30) {
    const n = p.n, N = n * n;
    const clump = (x, y) => {
      let k = Math.imul(x >> 1, 73856093) ^ Math.imul(y >> 1, 19349663);
      k = Math.imul(k ^ (k >>> 13), 2246822519);
      return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
    };
    const score = new Float32Array(N);
    p.each((x, y) => {
      const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      score[y * n + x] = edge ? 1e9 : luma(p.get(x, y)) + clump(x, y) * 0.5;
    });
    const order = Array.from({ length: N }, (_, i) => i)
      .sort((a, b) => score[a] - score[b]);
    for (let i = Math.round(N * frac); i-- > 0;) {
      p.alpha(order[i] % n, (order[i] / n) | 0, 0);
    }
  }

  function flatLeaf(p, L) {
    // A style may author its own canopy the way it authors its grass — the
    // clump-and-gap recipe below is a stylisation, and the one style that
    // wants none of that (`real`) was wearing it anyway: saturated rectangles
    // with near-black holes, sitting in a forest of fine-grained bark. Same
    // marks as the turf: base, soft-lit clumps, flat shadow gaps, flecks.
    if (L.leaf) {
      p.fill(hex(L.leaf.base));
      // an ARRAY is several layers, the water-fleck convention — a single
      // spec goes through [].concat unchanged, so nothing else moves
      if (L.leaf.lumps) for (const s of [].concat(L.leaf.lumps)) lumpMarks(p, s);
      if (L.leaf.holes) lumpMarks(p, L.leaf.holes);
      if (L.leaf.flecks) specks(p, L.leaf.flecks);
      // sky light over the whole canopy: the clumps near the top of the tile
      // a shade brighter, the ones at the bottom in their own shade —
      // stronger than the side-face gradient, because foliage shades itself
      if (L.leaf.grad) gradPass(p, L.leaf.grad);
      border(p, L.line);
      return;
    }
    const M = mat(L, MATBASE.leaf);
    p.fill(M.mid);
    shapes(p, M.ramp, LEAF_CLUMPS, M.relief);
    // foliage is the finest-grained surface there is, so the styles that ask
    // for grit get a double helping here — it is what breaks the clump
    // rectangles up into something you would call leaves
    if (L.grit) {
      grit(p, L, M);
      grit(p, L, M);
    }
    border(p, L.line);
  }

  // --- fire, ore, glass and the rest of the built blocks -------------------
  //
  // Stage three. Two rules from the earlier stages carry over unchanged — the
  // marks are per MATERIAL and the palette is per STYLE, and nothing here
  // draws a random number except the planking under the chest — and two are
  // new, both of them about a block staying READABLE rather than about taste:
  //
  //  * FIRE IS FIRE IN EVERY STYLE. `hotRamp` floors the style's saturation
  //    and value at 1 and never darkens. Lava and the torch are drawn UNLIT —
  //    main.js gives lava `toneMapped: false` and no vertex colours, so the
  //    mesher's face shading never touches it — which means the tile itself is
  //    the only place a glow can come from. A style that greys out an ember
  //    turns a light source into a brown rock.
  //  * AN ORE'S HUE IS ITS NAME. `oreMat` floors saturation at 0.85 and moves
  //    the whole ramp away from the stone it sits in, because the four ores
  //    differ from each other and from the matrix by colour alone. Before the
  //    push, gemOre and stone were 31 steps apart in value, and a style that
  //    desaturates would have made diamond ore indistinguishable from rock.

  // Ember, flame, and the white-hot middle. Three tones, all of them hot, ~40
  // steps of value apart. The style still speaks through whatever saturation
  // and warmth it asks for ABOVE the floor: `vivid` gets a fiercer fire than
  // `soft`, which gets a paler, whiter one.
  function hotRamp(L) {
    const M = {
      ...L.mat,
      sat: Math.max(L.mat.sat ?? 1, 1.0),
      val: Math.max(L.mat.val ?? 1, 1.0),
      warm: Math.max(L.mat.warm ?? 0, 0),
    };
    const flame = restyle(MATBASE.flame, M);
    return [restyle(MATBASE.ember, M), flame, lighten(flame, 1.7)];
  }

  // The value cap is the same lesson `snow` and `glass` teach below, arriving
  // through the ore: `soft` runs val 1.32, and 1.32 times iron's own push put
  // the crystal and the style's pale stone BOTH against the ceiling, where
  // `lighten` clips and the two came out zero steps apart. Capped, iron sits
  // clear of the rock in every style.
  function oreMat(L, base, push) {
    // and no ore may be lifted INTO the ceiling either. Silver starts at luma
    // 191; `soft` runs val 1.32, and 1.32 times silver's own push landed the
    // crystal at 258, where `lighten` clips — body and lit facet came out one
    // step apart and the crystal went flat white. The cap is per ore, off its
    // own base, so a dark ore is not restricted by a pale one's problem.
    const cap = Math.max(1, 210 / luma(hex(base)));
    return matRamp(base, {
      ...L.mat,
      sat: Math.max(L.mat.sat ?? 1, 1.0),
      val: clamp((L.mat.val ?? 1) * push, 0.35, cap),
      gap: (L.mat.gap ?? 1) * 1.15,
    }, 3);
  }

  // Pale materials may not be lifted as far as a style would like: a base that
  // is already near white has nowhere to go, and `lighten` quietly collapses
  // the top of its ramp instead of raising it. `soft` had a glass frame four
  // steps from its own glint and a snow drift one step from its own field.
  const pale = (M) => ({ ...M, val: Math.min(M.val ?? 1, 1.05) });

  // Seven crystal sites, and each ore picks its own set out of them — five for
  // coal, five for iron, four for silver, three for diamond, so rarity reads
  // off the tile as well as off the colour. The first cut gave every ore a
  // PREFIX of one list and the four blocks came out as the same stamp in four
  // colours; picking different sites is what makes them different rocks.
  // Three of the seven run off an edge and come back on the other, which stops
  // a seam of ore boxing every block.
  const ORE_VEINS = [
    [-2, 4, 9, 7], [20, 2, 8, 8], [7, 21, 9, 7], [25, 18, 8, 7],
    [13, 11, 6, 5], [3, 28, 8, 6], [17, 25, 7, 6],
  ];

  // The style's own stone with a mineral cut into it — the matrix has to be
  // `stoneBody`'s, because an ore block sits in a wall of plain rock. Every
  // crystal is a solid rectangle with a lit texel along its top and left and a
  // dark one along its bottom and right, off the ore's OWN three tones, so it
  // costs no extra colour. Unlike the grass relief this is not per style: a
  // crystal without a facet is a coloured blob in any of them.
  function flatOre(p, L, base, push, sites) {
    stoneBody(p, L);
    const R = oreMat(L, base, push);
    const edge = { lit: R[2], dark: R[0] };
    for (const i of sites) {
      const [x, y, w, h] = ORE_VEINS[i];
      rect(p, x, y, w, h, R[1]);
      plateEdge(p, x, y, w, h, edge);
      // one specular texel just inside the lit corner: the difference
      // between a coloured patch and a crystal with a polished face
      if (L.oreGlint) p.set(x + 1, y + 1, lighten(R[2], L.oreGlint));
    }
    border(p, L.line);
  }

  // A furnace is BUILT of the block under it: its bottom face is COBBLE, so
  // its walls are `cobbleBody`'s stones and mortar and nothing else. This is
  // the block the whole stage started from — it wore two styled faces and two
  // classic ones, and a half-styled block looks more broken than an unstyled
  // one. The walling is offset by a few texels so a furnace set into a cobble
  // wall still reads as a separate object; an offset is a translation on the
  // torus, so it costs the tiling nothing.
  function flatFurnaceSide(p, L) {
    cobbleBody(p, L, 3, 5);
    border(p, L.line);
  }

  // The lid: a square opening with a grate over it. Four bars, three texels
  // each, so they are countable from across the room.
  function flatFurnaceTop(p, L) {
    const M = mat(L, baseOf(L, 'stone'));
    const dark = darken(matRamp(MATBASE.mortar, L.mat, 1)[0], 0.45);
    cobbleBody(p, L);
    rect(p, 8, 8, 16, 16, M.ramp[M.ramp.length - 1]);     // the rim
    rect(p, 9, 9, 14, 14, dark);                          // down the flue
    // the bars take the stone's MID tone, not its darkest: against a flue at
    // 0.45 of the mortar the darkest tone is thirty steps away and the grate
    // mushed into the hole
    for (const x of [10, 15, 20]) rect(p, x, 9, 3, 14, M.mid);
    border(p, L.line);
  }

  // The mouth: a stone frame, a sooty hood and three nested blocks of fire,
  // hottest at the hearth. No gradient in it — the heat is three hard steps.
  function flatFurnaceFront(p, L) {
    const M = mat(L, baseOf(L, 'stone'));
    const H = hotRamp(L);
    const soot = darken(matRamp(MATBASE.mortar, L.mat, 1)[0], 0.40);
    cobbleBody(p, L);
    rect(p, 6, 9, 20, 19, M.ramp[M.ramp.length - 1]);     // lintel and jambs
    rect(p, 7, 10, 18, 6, soot);                          // the hood
    rect(p, 7, 16, 18, 11, H[0]);
    rect(p, 9, 19, 14, 8, H[1]);
    rect(p, 12, 22, 8, 5, H[2]);
    border(p, L.line);
  }

  // Glass is alpha-tested (main.js, `alphaTest: 0.5`), so a texel is either
  // there or it is not — a faint wash over the pane would simply vanish and an
  // opaque one would stop being glass. So the pane is a genuine HOLE and every
  // painted texel is fully opaque: a two-texel came round the tile, a one-texel
  // shadow on the inside of its lit edges, and two hard reflections. That is
  // the whole of it — there is no gradient to lean on in these styles, and a
  // corner glint is what says "glass" in every flat idiom there has ever been.
  //
  // It had a cross of muntins as well and they came out on the 3x3 sheet: four
  // panes a block is four times the line of one, and a glass wall read as a
  // cage rather than as a window. The frame is two texels rather than the
  // house one because two panes meeting have to read as a mullion; nothing
  // else here is allowed the second texel.
  function flatGlass(p, L) {
    const M = mat({ ...L, mat: pale(L.mat) }, MATBASE.glass);
    const bar = M.ramp[1], shadow = M.ramp[0];
    const glint = lighten(M.ramp[M.ramp.length - 1], 1.35);
    p.fill(bar, 0);                                       // clear the pane
    // the shadow goes down first and the frame over it, so the corners where
    // the two shadow runs cross never double up
    rect(p, 0, 2, TS, 1, shadow); rect(p, 2, 0, 1, TS, shadow);
    rect(p, 0, 0, TS, 2, bar); rect(p, 0, TS - 2, TS, 2, bar);
    rect(p, 0, 0, 2, TS, bar); rect(p, TS - 2, 0, 2, TS, bar);
    rect(p, 6, 6, 11, 2, glint); rect(p, 6, 6, 2, 11, glint);
    rect(p, 20, 22, 7, 2, glint);
    border(p, L.line);
  }

  // The chest wears this one tile on all six faces, so it is a whole object
  // rather than a surface: the style's own boards, an iron strap frame inset
  // from the edge so two chests side by side read as two boxes, the lid seam
  // across the middle, and a lock plate straddling it.
  function flatChest(p, L) {
    const T = boardTones(L);
    const G = matRamp(MATBASE.gold, L.mat, 3);
    plankBody(p, L);
    rect(p, 2, 2, 28, 3, T.dark); rect(p, 2, 27, 28, 3, T.dark);
    rect(p, 2, 2, 3, 28, T.dark); rect(p, 27, 2, 3, 28, T.dark);
    rect(p, 0, 12, TS, 2, T.dark);                        // the lid seam
    rect(p, 0, 14, TS, 1, T.light);                       // and its lit lip
    rect(p, 12, 10, 8, 10, G[1]);
    plateEdge(p, 12, 10, 8, 10, { lit: G[2], dark: G[0] });
    rect(p, 15, 13, 2, 4, darken(G[0], 0.35));            // keyhole
    border(p, L.line);
  }

  // Torch and lantern share this tile, and the mesher hangs it on all six
  // faces of a see-through block, so the silhouette is the whole design. It is
  // never bordered — a line round a torch is a box round a flame. The stick is
  // the style's own bark split down the middle, lit on the left; the flame is
  // three nested blocks off `hotRamp` with nothing dark inside it.
  function flatTorch(p, L) {
    const H = hotRamp(L);
    const bark = hex(L.wood.bark);
    p.fill(bark, 0);
    rect(p, 13, 15, 3, 17, lighten(bark, 1.25));
    rect(p, 16, 15, 3, 17, darken(bark, 0.55));
    // The silhouette steps 6 - 10 - 6 so it tapers at both ends. The first cut
    // was three concentric rectangles, which reads as a lollipop, not a flame:
    // the white-hot middle has to be BIG and sit HIGH, with the ember only a
    // rim round it and the cooler tone pooled at the foot.
    rect(p, 13, 1, 6, 4, H[0]);
    rect(p, 11, 4, 10, 10, H[0]);
    rect(p, 13, 14, 6, 3, H[0]);
    rect(p, 13, 5, 6, 7, H[2]);
    rect(p, 12, 12, 8, 4, H[1]);
  }

  // Molten rock, and the one tile in the atlas drawn UNLIT: no face shading,
  // no day/night, no jitter. So it carries no dark tone at all — the three
  // colours are ember, flame and white-hot, and the marks are the same big
  // overlapping wrapped clumps the canopy is made of.
  //
  // The 3x3 sheet threw out two earlier cuts of this tile, and both failed the
  // same way. Bright channels drawn as full-width and full-height bands tile
  // into a perfect grid; crust plates laid in three bands, with the channels
  // as the negative space, tile into the same grid with the colours swapped.
  // A lava lake is one tile repeated over an acre — anything that partitions
  // the tile, however cleverly it jogs, ends up as grout. Clumps that overlap
  // and run off the edges have no partition in them to find.
  const LAVA_POOLS = [
    [-5, -2, 15, 13, 1.0], [14, 3, 14, 12, 0.0], [2, 16, 13, 13, 1.0],
    [18, 18, 14, 13, 0.0], [9, 9, 8, 7, 0.0], [27, 7, 8, 9, 1.0],
    [0, 28, 10, 6, 0.0],
  ];

  function flatLava(p, L) {
    const H = hotRamp(L);
    p.fill(H[1]);
    shapes(p, H, LAVA_POOLS, null);
  }

  // Snow and ice are the two WHITE materials, and the material ramp cannot
  // paint them. It buys its marks with value — 48 steps down to the dark tone,
  // more once a style widens the gap — and 48 steps under a near-white base is
  // a mid grey. Every styled snow tile came out as white with grey slabs lying
  // on it, and ice as pale blue with near-black notches: paving, not weather,
  // and on `deep`'s side faces (multiplied by 0.32) the notches went black.
  //
  // So these two are mixed toward WHITE instead of stepped down in value. The
  // style still says what colour they start from — its saturation and its warm
  // push both apply — and its gap still stretches the band a little, but every
  // tone is the material's own colour some fraction of the way to 255,255,255.
  // That is the only move that gets there: `lighten` is a multiply, so it
  // preserves the hue and stalls at whatever the brightest channel allows —
  // a bluish snow clips at about luma 238 and never gets any whiter, which is
  // exactly how the first fix still came out grey-white rather than white.
  //
  // The marks read as WEAKLY as this on purpose: real snow is nearly flat and
  // what little shape it has is light on light. This is the one material where
  // the shrink test's answer — more value — is the wrong answer, because a
  // drift you can see from across a valley is not a drift.
  //
  // `lo`/`hi` are how far toward white the two ends of the band sit, 0..1.
  function whiteRamp(base, L, n, lo, hi) {
    const c = restyle(base, { ...L.mat, val: 1 });
    const g = clamp(L.mat.gap ?? 1, 0.9, 1.25);
    const mid = (lo + hi) / 2;
    const a = clamp(mid - (mid - lo) * g, 0, 1);
    const b = clamp(mid + (hi - mid) * g, 0, 1);
    const white = (t) => c.map((v) => Math.round(v + (255 - v) * t));
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      out.push(white(a + (b - a) * t));
    }
    return out;
  }

  // Snow: the flattest material in the set, so it gets the fewest and largest
  // marks. It is drawn the other way up from everything else — a bright field
  // with hard shadow pockets cut into it — because white has no light end to
  // spend: `lighten` clips, and a drift painted a shade brighter than the
  // field is the first thing the shrink test kills.
  // Three hollows, each an L: a plain rectangle reads as a grey brick lying on
  // the snow, and three of them read as brickwork. They are authored as pairs,
  // upper rectangle first, so the bounce band under the upper one is overdrawn
  // exactly where the lower one takes over.
  const SNOW_HOLLOWS = [
    [-4, 4, 15, 7], [2, 11, 9, 6],
    [20, 1, 13, 6], [26, 7, 8, 6],
    [8, 20, 15, 7], [8, 27, 7, 4],
  ];

  function flatSnow(p, L) {
    const ramp = whiteRamp(MATBASE.snow, L, 3, 0.42, 0.98);
    // the bounce is the middle of the band: a step up out of the hollow and
    // still a step below the field, which is all the relief snow has
    p.fill(ramp[2]);
    for (const [x, y, w, h] of SNOW_HOLLOWS) {
      rect(p, x, y, w, h, ramp[0]);
      rect(p, x, y + h, w, 2, ramp[1]);                   // light bouncing back
    }
    // shadow dapples tinted COLD: snow shadow is lit by the sky, so it goes
    // blue, not grey — a per-channel multiply, red losing the most. The one
    // mark on this tile allowed to be a colour rather than a value.
    if (L.snowDapple) {
      const D = L.snowDapple;
      for (let i = 0; i < D.n; i++) {
        const w = D.w + rri(D.vary ?? 3), h = D.h + rri(D.vary ?? 3);
        tintRect(p, rri(TS), rri(TS), w, h, D.r, D.g, D.b);
      }
    }
    border(p, L.line);
  }

  // Ice cleaves FLAT, so it is six big facets on three staggered courses —
  // never a diagonal, because a rasterised diagonal at 32 texels is a
  // staircase of one-texel steps, i.e. exactly the detail that mushes.
  //
  // It carries no fracture LINES, and that is the second thing the 3x3 sheet
  // caught here. A one-texel bright line spanning the tile repeats every 32
  // texels whatever it crosses, and two of them turned a wall of ice into a
  // bright lattice — first when they lay on the facet boundaries and again
  // when they cut through the middles. The facets and one hard glint are the
  // whole design; the cleavage is the boundary BETWEEN facets, which is where
  // it is in the rock as well.
  const ICE_FACETS = [
    [0, 0, 14, 13, 0.55], [14, 0, 18, 13, 1.0],
    [0, 13, 21, 10, 0.0], [21, 13, 11, 10, 0.65],
    [0, 23, 10, 9, 1.0], [10, 23, 22, 9, 0.15],
  ];

  function flatIce(p, L) {
    // ice sits a little below snow and keeps more of its blue, so the two are
    // still different materials at a glance — but it is a PALE blue now, the
    // colour of a frozen lake seen from above rather than of deep water
    const M = { ramp: whiteRamp(MATBASE.ice, L, 3, 0.20, 0.76) };
    const spec = lighten(M.ramp[2], 1.3);
    shapes(p, M.ramp, ICE_FACETS, null);
    // both glints sit on DARK facets. The first cut put the second one on the
    // lightest facet, where it was seven steps from the ice under it and did
    // nothing at all — a highlight has to have something to be a highlight on.
    rect(p, 3, 16, 9, 2, spec); rect(p, 3, 16, 2, 7, spec);
    rect(p, 22, 25, 7, 2, spec);
    // Short jagged cracks, each with a bright refraction line down its lit
    // side — the mark that says BRITTLE. Short and broken on purpose: the
    // note above is right that a texel line spanning the tile turns a wall
    // into a lattice, so a crack is eight texels stepping sideways every
    // other row and no crack reaches an edge's copy of itself.
    if (L.iceCracks) {
      const C = L.iceCracks;
      const dk = darken(M.ramp[0], 0.82), lt = lighten(M.ramp[2], C.glint);
      for (let i = 0; i < C.n; i++) {
        let x = rri(TS);
        const y0 = 2 + rri(TS - C.len - 4), sx = rri(2) ? 1 : -1;
        for (let j = 0; j < C.len; j++) {
          p.set(x, y0 + j, dk);
          p.set(x + sx, y0 + j, lt);
          if (j % 2) x += sx;
        }
      }
    }
    border(p, L.line);
    // the same translucency the classic tile carries. It is above alphaTest,
    // so ice is opaque in the solid pass today; it costs nothing and it is
    // there if ice ever moves to the water pass.
    p.each((x, y) => p.alpha(x, y, 0.88));
  }

  // The sea, at last. `main.js`/`cubemesher.js` own the water RENDER now —
  // waves, a fresnel falloff, a sun-glint highlight — so this tile no longer
  // has to fake transparency, ripples or shine with its own pixels. It is
  // sampled fully opaque (the material applies the transparency), so it is
  // painted exactly like a ground tile in the flat styles: one to three flat
  // tones, big regions, hard edges, no gradient, no dithering. Let the shader
  // do the animation.
  //
  // Three styles (`classic-calm/relief/emboss`) use the SAME stone facets as
  // `flatStone`, just off `MATBASE.water` instead of `MATBASE.stone` — water
  // gets the family's own idiom (clumps you can count / lit-and-shadowed
  // plates / hard-stamped plates) exactly as the rock does. Everything else
  // paints its own hand-placed blue, following the same `look.grass` idiom
  // (a fill plus `cells`/`checker`/`patches`/`bands`) that the other flat
  // tiles already use, so a mosaic sea is the same patchwork as a mosaic
  // lawn and a layered sea bands the same way its topsoil does.
  function flatWater(p, L) {
    const W = L.water;
    if (W.facets) {
      const M = mat(L, MATBASE.water);
      p.fill(M.mid);
      shapes(p, M.ramp, STONE_FACETS, M.relief);
      border(p, L.line);
      return;
    }
    p.fill(hex(W.base));
    if (W.cells) cellGrid(p, W.cells);
    if (W.checker) checkerGrid(p, W.checker);
    if (W.patches) {
      for (const [x, y, w, h, c] of W.patches) rect(p, x, y, w, h, hex(c));
    }
    if (W.bands) {
      for (const [y0, h, c] of W.bands) rect(p, 0, y0, TS, h, hex(c));
    }
    // over the bands, so the grain breaks their edges up rather than lying
    // under them in stripes — the same order the grass uses. An ARRAY is
    // several layers: real water is long faint streaks under short brighter
    // ones, and one speck size cannot say that.
    if (W.flecks) for (const f of [].concat(W.flecks)) specks(p, f);
    border(p, L.line);
  }

  // --- the cross-quad plants, for a style that authors them ----------------
  // The tuft, the flowers, the mushroom, the sapling and the wheat are cross
  // quads: two crossed panels, alpha-tested, so the silhouette IS the art and
  // an unpainted texel is a genuine hole (Pix starts at alpha 0, so a painter
  // that never fills gets its transparency for free). Only a style declaring
  // a `plant` object gets these painters — every other style keeps the
  // classic sprites, and the matching emit-drop lives in classicTiles().

  // Pix wraps writes on purpose, and for a plant that is exactly wrong: a
  // blade leaning past the tile's edge must be cropped, not come back on the
  // far side and hang in the air. Hence the clipped setter.
  function pset(p, x, y, c) {
    if (x >= 0 && y >= 0 && x < TS && y < TS) p.set(x, y, c);
  }

  // One blade of grass: a thin stalk rising from the soil line, leaning
  // harder toward its tip (t^2, so the base stays planted), dark at the root
  // where blades shade each other and its own green at the tip. Two texels
  // wide over the lower half and one above — that taper is the whole
  // difference between a blade and a stripe.
  function bladeMark(p, x0, lean, h, c) {
    const root = darken(c, 0.62), mid = darken(c, 0.84);
    for (let i = 0; i < h; i++) {
      const t = i / (h - 1);
      const y = TS - 1 - i;
      const x = x0 + Math.round(lean * t * t);
      pset(p, x, y, t < 0.30 ? root : t < 0.62 ? mid : c);
      if (t < 0.45) pset(p, x + 1, y, root);
    }
  }

  function flatTuft(p, L) {
    const T = L.plant.tuft;
    const cs = T.colors.map(hex);
    for (let i = 0; i < T.n; i++) {
      const h = T.hMin + fri(T.hMax - T.hMin);
      bladeMark(p, 2 + fri(TS - 4), frand() * 9 - 4.5, h, cs[fri(cs.length)]);
    }
  }

  // A flower: a little of the turf at its foot, one slender stem with a leaf
  // to either side, and a small bloom lit from the upper left like every
  // other mark in the style. `key` picks the petal tones; the shape is
  // shared, because a bloom eight texels across is a colour before it is a
  // species.
  function flatFlower(p, L, key) {
    const P = L.plant, F = P.petal[key];
    const cs = P.tuft.colors.map(hex);
    for (let i = 0; i < 5; i++) {
      bladeMark(p, 4 + fri(TS - 8), frand() * 6 - 3, 7 + fri(6), cs[fri(cs.length)]);
    }
    const stem = hex(P.stem), sd = darken(stem, 0.72);
    const lean = fri(2) ? 1 : -1;              // which way the head nods
    for (let y = 10; y < TS; y++) {
      pset(p, 15 + (y < 14 ? lean : 0), y, y > 24 ? sd : stem);
    }
    // the leaves, opposite each other, darker toward their tips
    for (const [dx, dy] of [[-1, 0], [-2, 1], [-3, 1], [-4, 2]]) {
      pset(p, 15 + dx, 19 + dy, dy > 1 ? sd : stem);
    }
    for (const [dx, dy] of [[2, 0], [3, 1], [4, 1], [5, 2]]) {
      pset(p, 15 + dx, 22 + dy, dy > 1 ? sd : stem);
    }
    // the bloom: three petal tones over a diamond-ish disc, a few strays
    // past the rim so it is not a button, and a two-texel heart
    const bx = 15 + lean, by = 7;
    const base = hex(F.base), lit = hex(F.lit), dk = hex(F.dark);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.abs(dx) + Math.abs(dy) * 1.15;
        if (d > 3.9) continue;
        const l = -dx - dy;
        pset(p, bx + dx, by + dy, l > 1 ? lit : l < -2 ? dk : base);
      }
    }
    pset(p, bx - 4, by, base); pset(p, bx + 4, by - 1, dk);
    pset(p, bx + 1, by + 4, dk); pset(p, bx - 1, by - 4, lit);
    const heart = hex(F.heart);
    pset(p, bx, by, heart); pset(p, bx + 1, by, heart);
    pset(p, bx, by + 1, darken(heart, 0.8));
    pset(p, bx + 1, by + 1, darken(heart, 0.8));
  }

  // The mushroom: a shaded stem flaring at the foot, a domed cap lit up-left
  // with its darkest tone round the rim, gills in the cap's shadow, and a
  // few pale flecks placed OFF centre — a ring of them is a cartoon.
  function flatMushroom(p, L) {
    const M = L.plant.mushroom;
    const st = hex(M.stem), stL = hex(M.stemLit), stD = hex(M.stemDark);
    for (let y = 14; y < 30; y++) {
      const fl = y > 27 ? 1 : 0;               // the flare at the foot
      for (let x = 13 - fl; x <= 18 + fl; x++) {
        pset(p, x, y, x <= 14 - fl ? stL : x >= 17 + fl ? stD : st);
      }
    }
    const cap = hex(M.cap), capL = hex(M.capLit), capD = hex(M.capDark);
    const HW = [3, 6, 8, 9, 10, 11, 11, 11, 11, 10];   // half-width per row
    for (let r = 0; r < HW.length; r++) {
      const y = 5 + r, hw = HW[r];
      for (let x = 16 - hw; x < 16 + hw; x++) {
        const edge = x === 16 - hw || x === 15 + hw || r === HW.length - 1;
        const l = -(x - 15) * 0.9 - (y - 9);
        pset(p, x, y, edge && r > 2 ? capD : l > 4 ? capL : l < -5 ? capD : cap);
      }
    }
    const g = hex(M.gills);
    for (let x = 8; x < 24; x++) pset(p, x, 15, g);
    const f = hex(M.fleck);
    for (const [x, y] of [[10, 8], [18, 6], [13, 11], [21, 10]]) {
      pset(p, x, y, f); pset(p, x + 1, y, f);
    }
  }

  // The sapling: a two-texel trunk with the light on its left, and a crown
  // of overlapping leaf blobs in the canopy's own greens — paler blobs high,
  // darker ones low, which is all the shading a metre-tall tree needs.
  function flatSapling(p, L) {
    const S = L.plant.sapling;
    const greens = S.leaves.map(hex);
    const t = hex(S.trunk), tl = hex(S.trunkLit);
    for (let y = 12; y < 30; y++) { pset(p, 15, y, tl); pset(p, 16, y, t); }
    pset(p, 14, 29, darken(t, 0.8)); pset(p, 17, 29, darken(t, 0.8)); // roots
    // two rolls a coordinate, summed: a triangular spread that keeps the
    // crown gathered round the trunk — uniform blobs drew a leaning band
    for (let i = 0; i < 14; i++) {
      const cx = Math.round(15.5 + (frand() + frand() - 1) * 8);
      const cy = Math.round(8 + (frand() + frand() - 1) * 5.5);
      const c = greens[cy < 8 ? 2 + fri(greens.length - 2) : fri(2)];
      const r = 2.0 + frand() * 1.8;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) + Math.abs(dy) * 1.2 <= r) pset(p, cx + dx, cy + dy, c);
        }
      }
    }
  }

  // Wheat: six thin stalks with a little lean, dark toward the soil. Ripe
  // wheat carries a paired-grain head and an awn above it; young wheat is
  // shorter, greener, and flicks small leaves off the stalk instead.
  function flatWheatReal(p, L, ripe) {
    const W = L.plant.wheat;
    const cs = (ripe ? W.gold : W.green).map(hex);
    for (let i = 0; i < 6; i++) {
      const sx = 2 + i * 5 + fri(2);
      const top = ripe ? 3 + fri(3) : 13 + fri(4);
      const c = cs[fri(cs.length)];
      const dark = darken(c, 0.72);
      const lean = frand() * 2.4 - 1.2;
      for (let y = top; y < TS; y++) {
        const t = (y - top) / (TS - top);
        pset(p, sx + Math.round(lean * (1 - t) * (1 - t)), y, t > 0.55 ? dark : c);
      }
      if (ripe) {
        const hx = sx + Math.round(lean), lit = lighten(c, 1.18);
        for (let k = 0; k < 8; k++) {
          pset(p, hx + (k % 2 ? 1 : -1), top + k, lit);
          pset(p, hx, top + k, c);
        }
        pset(p, hx, top - 1, lit);
        pset(p, hx + (lean > 0 ? 1 : -1), top - 2, lit);   // the awn
      } else {
        for (let k = 0; k < 2; k++) {
          const y = top + 4 + k * 6, d = k % 2 ? 1 : -1;
          pset(p, sx + d, y, c); pset(p, sx + d * 2, y + 1, dark);
        }
      }
    }
  }

  // --- everything that is not grass ---------------------------------------
  // All of it is the classic art, drawn on the 16-texel grid it was authored
  // for and blitted up by emit(). TS is shadowed here for exactly that reason:
  // every painter below counts in 16ths of a tile — 4-row brick courses, an
  // 8-wide plank, a torch at x=7 — and rewriting forty tiles in 32nds would be
  // a redraw, not a resize.
  function classicTiles() {
    const TS = CT;
    const paint = (tile, fn) => {
      const p = new Pix(TS);
      fn(p);
      emit(tile, p);
      return p;
    };

    // For a tile the style paints itself. The classic painter still RUNS and
    // still pulls from the shared stream — the classic tiles draw from one RNG
    // and the draw ORDER is part of the art, so dropping a call outright would
    // silently redraw every tile after it. Only the emit is thrown away, which
    // is why adding the wood changed nothing but the wood.
    const paintUnlessStyled = (tile, fn) => {
      const p = new Pix(TS);
      fn(p);
      if (!LOOK) emit(tile, p);
      return p;
    };

    // The same discipline for the cross-quad plants, on a narrower key:
    // every styled style EXCEPT one that authors a `plant` object still
    // wants the classic sprites on its flowers and crops, so `LOOK` alone
    // would be the wrong gate here. The painter still runs and still pulls
    // from the shared stream; only the emit is conditional.
    const paintUnlessPlant = (tile, fn) => {
      const p = new Pix(TS);
      fn(p);
      if (!LOOK || !LOOK.plant) emit(tile, p);
      return p;
    };

    // --- reusable material passes -------------------------------------------

    // A small irregular clump. This is deliberately NOT a disc: at radii of 1-1.5
    // a disc rasterises to a perfect plus sign, and a tiled surface covered in
    // identical plus signs is exactly the repeating motif the eye locks onto.
    // A short random walk gives clods that differ from each other instead.
    function speck(p, x, y, n, c) {
      let cx = x, cy = y;
      p.set(cx, cy, c);
      for (let i = 1; i < n; i++) {
        if (rand() < 0.5) cx += ri(3) - 1; else cy += ri(3) - 1;
        p.set(cx, cy, c);
      }
    }

    // the grit that stops a dithered field looking mechanical; `max` is a pixel
    // count, not a radius
    function scatter(p, n, max, c) {
      for (let i = 0; i < n; i++) speck(p, ri(TS), ri(TS), 1 + ri(max), c);
    }

    // a meandering fracture with a lit lip on its upper side. One pixel of
    // relief is the difference between grey mush and rock.
    function crack(p, R, len, lipChance = 0.55) {
      let x = rand() * TS, y = rand() * TS, a = rand() * Math.PI * 2;
      for (let i = 0; i < len; i++) {
        a += (rand() - 0.5) * 1.0;
        x += Math.cos(a); y += Math.sin(a);
        if (rand() < lipChance) p.set(x, y - 1, R[4]);
        p.set(x, y, R[0]);
      }
    }

    // Broad cleavage plates: low-frequency noise quantised through the ramp, so
    // stone reads as a few large facets rather than per-pixel confetti.
    function plates(p, R, lo = 0.12, hi = 0.78) {
      const n = fbm(rand, 2, TS), m = noiseFn(rand, 4, TS);
      p.each((x, y) => {
        const v = n(x, y) * 0.72 + m(x, y) * 0.28;
        p.set(x, y, tone(R, lo + v * hi, x, y));
      });
    }

    // STONE, drawn as the block everyone pictures when you say the word: a
    // field of mid-grey with slightly lighter and slightly darker texels
    // mottled through it, and nothing else.
    //
    // It used to be plates, three cracks, pits and catch-lights — a good rock
    // face on its own and the wrong tile for what it is mostly used as, which
    // is a MOUNTAIN. A cliff is this tile in a plain grid a hundred times
    // over, and every mark that reads as a feature at arm's length reads as a
    // repeat at fifty blocks: the cracks lined up into seams that were not
    // there and the catch-lights into a dotted lattice. Take the features out
    // and the repeat has nothing to line up.
    //
    // Three tones, hit EXACTLY. `tone` dithers between ramp stops, which is
    // what gives every other tile here its grain — and grain is the one thing
    // this tile must not have, so the thresholds land on 0.25, 0.5 and 0.75,
    // which are stops 1, 2 and 3 of a five-stop ramp and dither with nothing.
    // The noise is fine (eight cells across sixteen texels) so the mottle
    // comes out in ones and twos rather than in patches.
    // ITS OWN RAMP, and this is the whole of the change the player asked for.
    //
    // PAL.stone is the shared rock ramp — cobbles, gravel, ore beds and the
    // cliff facets all draw from it — and its stops are nineteen to
    // twenty-four levels apart, which is exactly what those want: a cobble is
    // ROUNDS of light grey in dark mortar and it needs that gap to read. Stone
    // is the other thing entirely: one grey, blended, with the mottle barely
    // separating from it. Painted off the shared ramp it came out as the
    // cobble's contrast without the cobble's shapes — patchy, and the player
    // said so.
    //
    // So the tile gets five greys of its own, eight levels apart instead of
    // twenty: close enough that a wall of it reads as one material at arm's
    // length, far enough that the texels do not vanish into a flat fill.
    // Centred where the old middle stop was, so a cliff is the same weight of
    // grey as before — only smoother.
    const STONE_TONES = ramp('6b6b6d', '737375', '7b7b7d', '838385', '8b8b8d');

    function paintStone(p) {
      const n = noiseFn(rand, 12, TS);
      p.each((x, y) => {
        const v = n(x, y);
        // The middle tone HOLDS THE TILE and the other two mottle it. An
        // even third each came out as static; the block in the reference is
        // plainly one grey with a lighter and a darker one scattered through
        // it, which is these thresholds rather than a split down the middle.
        const t = v < 0.34 ? 0.25 : v > 0.66 ? 0.75 : 0.5;
        p.set(x, y, tone(STONE_TONES, t, x, y));
      });
      // ...and a few texels a step further out either way — the grit. Still
      // only eight levels past the mottle, so they read as grain in the stone
      // rather than as chips knocked out of it.
      scatter(p, 4, 1, STONE_TONES[0]);
      scatter(p, 3, 1, STONE_TONES[4]);
    }

    // Rounded stones set in mortar: a Worley diagram on the torus. Each cell is
    // one cobble, F2-F1 gives the joint, and shading from the cell centre makes
    // the stones bulge instead of reading as flat coloured patches.
    function paintCobbles(p, R, mortarRamp, count, joint, spread) {
      const seeds = [];
      for (let i = 0; i < count; i++) {
        seeds.push([rand() * TS, rand() * TS, rf(0.28, 0.86)]);
      }
      p.each((x, y) => {
        let b1 = 1e9, b2 = 1e9, bi = 0, bdx = 0, bdy = 0;
        for (let i = 0; i < seeds.length; i++) {
          const dx = sdist(x + 0.5, seeds[i][0], TS), dy = sdist(y + 0.5, seeds[i][1], TS);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < b1) { b2 = b1; b1 = d; bi = i; bdx = dx; bdy = dy; }
          else if (d < b2) b2 = d;
        }
        if (b2 - b1 < joint) {
          p.set(x, y, tone(mortarRamp, 0.15 + (b2 - b1) / joint * 0.4, x, y));
          return;
        }
        // lit from the upper left, darkening toward the stone's rim
        const lit = seeds[bi][2] + (-bdx - bdy) * 0.055 - b1 * 0.035;
        p.set(x, y, tone(R, lit * spread + (1 - spread) * 0.5, x, y));
      });
    }

    function paintSoil(p, R) {
      const n = fbm(rand, 3, TS);
      p.each((x, y) => p.set(x, y, tone(R, 0.16 + n(x, y) * 0.72, x, y)));
      scatter(p, 8, 4, R[0]);               // clods
      scatter(p, 7, 2, R[4]);               // grit catching the light
      scatter(p, 5, 3, R[1]);
    }

    function classicGrassTop(p) {
      const n = fbm(rand, 3, TS);
      p.each((x, y) => p.set(x, y, tone(PAL.grass, 0.2 + n(x, y) * 0.66, x, y)));
      for (let i = 0; i < 30; i++) {
        const x = ri(TS), y = ri(TS), h = 1 + ri(3);
        const c = rand() < 0.62 ? PAL.grass[4] : PAL.grass[3];
        for (let k = 0; k < h; k++) p.set(x, y + k, c);
      }
      for (let i = 0; i < 12; i++) {
        const x = ri(TS), y = ri(TS), h = 1 + ri(2);
        for (let k = 0; k < h; k++) p.set(x, y + k, PAL.grass[0]);
      }
    }

    function classicDirt(p) { paintSoil(p, PAL.soil); }

    // Classic grass side: soil body with a ragged rim and a few blades hanging
    // over it. Only the top edge is special, so the tile still repeats sideways.
    function classicGrassSide(p) {
      paintSoil(p, PAL.soil);
      const rim = [];
      let d = 3;
      for (let x = 0; x < TS; x++) {
        d += ri(3) - 1;
        rim.push(Math.max(2, Math.min(5, d)));
      }
      for (let x = 0; x < TS; x++) {
        for (let y = 0; y < rim[x]; y++) {
          p.set(x, y, tone(PAL.grass, 0.86 - y * 0.14, x, y));
        }
        if (rand() < 0.4) p.set(x, rim[x], PAL.grass[1]);      // overhang
        if (rand() < 0.18) p.set(x, rim[x] + 1, PAL.grass[0]);
      }
    }

    // The grass is the one family whose classic painters are SKIPPED outright
    // rather than run and thrown away. That is a wart: it means the shared
    // random stream diverges here, so every classic tile below draws different
    // numbers in a styled atlas than it does in `classic`. It is harmless —
    // those tiles are not emitted in a styled atlas anyway — but it is why a
    // "is this tile still classic art?" check has to compare two STYLES rather
    // than compare a style against `classic`.
    if (!LOOK) {
      paint(TILE.GRASS_TOP, classicGrassTop);
      paint(TILE.DIRT, classicDirt);
    }

    // --- ground -------------------------------------------------------------

    paintUnlessStyled(TILE.STONE, (p) => paintStone(p));

    // Sand: a smooth field through the dither gives the fine grain, and single
    // stray grains on top. Isolated pixels are safe where clumps are not — the
    // eye only finds a motif in shapes, and one pixel has none.
    paintUnlessStyled(TILE.SAND, (p) => {
      const n = fbm(rand, 4, TS);
      p.each((x, y) => p.set(x, y, tone(PAL.sand, 0.26 + n(x, y) * 0.66, x, y)));
      for (let i = 0; i < 26; i++) p.set(ri(TS), ri(TS), PAL.sand[1]);
      for (let i = 0; i < 14; i++) p.set(ri(TS), ri(TS), PAL.sand[4]);
      scatter(p, 5, 3, PAL.sand[0]);        // the odd wet pebble
    });

    // Desert sand: the same painter, the same grain, the hot ramp. The stray
    // dark grains at the end are the coarse grit that blows to the surface of
    // a dune rather than the wet pebbles a beach carries.
    paintUnlessStyled(TILE.SAND_ORANGE, (p) => {
      const n = fbm(rand, 4, TS);
      p.each((x, y) =>
        p.set(x, y, tone(PAL.sandOrange, 0.26 + n(x, y) * 0.66, x, y)));
      for (let i = 0; i < 26; i++) p.set(ri(TS), ri(TS), PAL.sandOrange[1]);
      for (let i = 0; i < 14; i++) p.set(ri(TS), ri(TS), PAL.sandOrange[4]);
      scatter(p, 5, 3, PAL.sandOrange[0]);
    });

    // Leaves are a real cutout now. The gaps between the clumps were always
    // painted near-black because the mesher culled leaf-against-leaf and a
    // hole would have shown the inside of a hollow crown; `BLOCK.LEAF` is in
    // TRANSPARENT, so those same gaps are punched through instead — see
    // leafHoles, and INTEGRATION-art.md, which asked for exactly this pair.
    // Painted once and emitted twice, as the styled canopy is: whole to
    // LEAF_FAR for the distant shell, then holed to LEAF for the chunks.
    const classicLeaf = paintUnlessStyled(TILE.LEAF_FAR, (p) => {
      const n = fbm(rand, 4, TS);
      p.each((x, y) => {
        // steep contrast: the clumps have to separate, not fade into each other
        p.set(x, y, tone(PAL.leaf, (n(x, y) - 0.42) * 2.6 + 0.5, x, y));
      });
      // little sprigs catching the light on top of each clump, each a two or
      // three pixel spray so no two read the same
      for (let i = 0; i < 12; i++) {
        const x = ri(TS), y = ri(TS);
        p.set(x, y, PAL.leaf[4]);
        p.set(x + (rand() < 0.5 ? 1 : -1), y, PAL.leaf[3]);
        if (rand() < 0.5) p.set(x, y + 1, PAL.leaf[3]);
      }
      scatter(p, 10, 5, PAL.leaf[0]);       // gaps between the clumps
    });
    leafHoles(classicLeaf);
    if (!LOOK) emit(TILE.LEAF, classicLeaf);

    if (!LOOK) paint(TILE.GRASS_SIDE, classicGrassSide);

    // Water: two long swells whose wavelengths divide 16, so crests line up
    // across neighbouring tiles instead of stopping at the border. Now
    // `paintUnlessStyled`, like every other classic-only tile: the painter
    // still RUNS and still pulls from the shared stream, so nothing after it
    // draws a different number in a styled atlas, but the pixels are only
    // EMITTED for `classic` — a style with its own `look` paints TILE.WATER
    // itself, below.
    paintUnlessStyled(TILE.WATER, (p) => {
      const k = (Math.PI * 2) / TS;
      const ph = rand() * 6.28;
      p.each((x, y) => {
        const w = Math.sin(k * x * 2 + Math.sin(k * y) * 1.3 + ph) * 0.5
          + Math.sin(k * (x * 3 - y * 2) + ph * 2) * 0.28;
        p.set(x, y, tone(PAL.water, 0.44 + w * 0.42, x, y));
      });
      for (let i = 0; i < 6; i++) p.set(ri(TS), ri(TS), PAL.water[4]);
    });

    // --- wood ---------------------------------------------------------------

    // Bark: value varies with x so the grain runs along the trunk, and the deep
    // cracks return to their starting column at y=16 so stacked logs line up.
    // --- wood -------------------------------------------------------------
    //
    // All three wood tiles are painted in 2x2 BLOCKS, for the reason the path
    // is: the art being matched is sixteen texels across and this atlas is
    // thirty-two, so per-texel work carries twice the detail of the thing it
    // is imitating and comes out as static. Two texels is one plank pixel.
    const blk = (p, cx, cy, c) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) p.set(cx + x, cy + y, c);
    };

    // Wood is painted from FLAT ramp colours, never through tone().
    //
    // tone() dithers between two stops with a Bayer matrix, which is right
    // when the value it is given varies across the tile — it buys extra
    // shades out of a five-stop ramp. Give it one constant value over a whole
    // board and the matrix itself becomes the pattern: a perfect 4x4 checker,
    // doubled to 8x8 by the block painting, which is why the first pass at
    // this came out as brickwork. Minecraft's wood is two or three flat tones
    // and nothing else, and that is what this does.

    // Bark: vertical STRANDS. One colour per column, held the whole way
    // down, with the occasional short step. The old painter gave every texel
    // its own value off two noise fields, which is why a trunk read as
    // gravel — bark is long fibres and the length is the whole of what says
    // so.
    paintUnlessStyled(TILE.LOG_SIDE, (p) => {
      const strand = [];
      for (let cx = 0; cx < TS; cx += 2) strand.push(1 + ri(3));   // 1..3
      // two neighbours on the same tone read as one wide strand, which is
      // what stops the trunk looking like a barcode
      for (let i = 1; i < strand.length; i++) {
        if (rand() < 0.4) strand[i] = strand[i - 1];
      }
      for (let cx = 0; cx < TS; cx += 2) {
        const i = strand[cx >> 1];
        for (let cy = 0; cy < TS; cy += 2) {
          const step = rand() < 0.16 ? (rand() < 0.5 ? -1 : 1) : 0;
          blk(p, cx, cy, PAL.bark[Math.max(0, Math.min(4, i + step))]);
        }
      }
      // two splits the full height of the trunk, and the lit fibre beside
      // one of them. bark[1] rather than bark[0]: the darkest stop in the
      // ramp against the mid one is a black stripe, and a log is fibre with
      // a crack in it.
      for (let i = 0; i < 2; i++) {
        const cx = ri(TS / 2) * 2;
        for (let cy = 0; cy < TS; cy += 2) {
          blk(p, cx, cy, PAL.bark[1]);
          if (rand() < 0.5) blk(p, (cx + 2) % TS, cy, PAL.bark[4]);
        }
      }
    });

    // Cut end: a bark rim and growth rings round an off-centre pith. The
    // rings are quantised to whole ring widths so they step like rings on a
    // sawn log rather than fading like a gradient.
    paintUnlessStyled(TILE.LOG_TOP, (p) => {
      const cx = TS / 2 + (ri(3) - 1) * 2, cy = TS / 2 + (ri(3) - 1) * 2;
      for (let by = 0; by < TS; by += 2) {
        for (let bx = 0; bx < TS; bx += 2) {
          const edge = Math.max(Math.abs(bx + 1 - TS / 2), Math.abs(by + 1 - TS / 2));
          if (edge > TS / 2 - 3) {                       // bark rim
            blk(p, bx, by, PAL.bark[rand() < 0.3 ? 2 : 1]);
            continue;
          }
          // two plank pixels a ring: at one they alternate so fast that the
          // end reads as a flat disc from more than a block away
          const d = Math.hypot(bx + 1 - cx, by + 1 - cy) / 4;
          blk(p, bx, by, PAL.plank[Math.floor(d) % 2 ? 1 : 3]);
        }
      }
      blk(p, cx - 1, cy - 1, PAL.bark[1]);                // the pith
    });

    // Planks: four boards, a dark seam between them, and one BUTT JOINT per
    // board at a different place along it. The joint is the mark that says
    // these are separate boards laid end to end rather than one striped
    // sheet, and it is the thing our planks never had.
    function paintPlanks(p, R) {
      const H = 8;                            // 4 plank px a board
      const order = [3, 2, 4, 2];             // ramp index per board
      for (let b = 0; b < TS / H; b++) {
        const i = order[b % order.length];
        for (let cy = b * H; cy < (b + 1) * H; cy += 2) {
          for (let cx = 0; cx < TS; cx += 2) blk(p, cx, cy, R[i]);
        }
        // the grain: short streaks one texel tall and one stop darker. Two
        // texels of a much darker tone is a brick, and a wall of them is
        // brickwork.
        for (let k = 0; k < 1 + ri(2); k++) {
          const y = b * H + 2 + ri(3) * 2;
          const x0 = ri(TS / 2) * 2, len = (2 + ri(5)) * 2;
          for (let x = x0; x < x0 + len; x++) p.set(x % TS, y, R[i - 1]);
        }
        // the butt joint, then the seam last so nothing covers it
        const jx = (1 + ri(TS / 2 - 2)) * 2;
        for (let cy = b * H + 2; cy < (b + 1) * H; cy += 2) blk(p, jx, cy, R[0]);
        for (let cx = 0; cx < TS; cx += 2) blk(p, cx, b * H, R[0]);
      }
    }
    paintUnlessStyled(TILE.PLANK, (p) => paintPlanks(p, PAL.plank));

    // --- ores ---------------------------------------------------------------
    // Stone matrix first, then faceted crystals: a light facet up-left, the body
    // in the middle, a shadow down-right and a single specular pixel. That is
    // what makes a mineral read as sitting in the rock rather than painted on.
    function paintOre(p, gem, count, size, spec = true) {
      paintStone(p);
      for (let i = 0; i < count; i++) {
        const cx = ri(TS), cy = ri(TS), r = size + rand() * 0.9;
        const R = Math.ceil(r) + 1;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            if (Math.abs(dx) + Math.abs(dy) * 1.1 > r) continue;
            const f = (dx + dy) / (r * 2.2);           // -0.5 lit .. +0.5 shadow
            p.set(cx + dx, cy + dy, tone(gem, 0.62 - f * 1.15, cx + dx, cy + dy));
          }
        }
        if (spec) p.set(cx - 1, cy - 1, gem[4]);
        p.set(cx + 1, cy + 1, gem[0]);
      }
    }
    paintUnlessStyled(TILE.COAL, (p) => paintOre(p, PAL.coal, 4, 2.2, false));
    paintUnlessStyled(TILE.IRON, (p) => paintOre(p, PAL.ironOre, 4, 2.0));
    paintUnlessStyled(TILE.SILVER, (p) => paintOre(p, PAL.silverOre, 4, 1.9));
    paintUnlessStyled(TILE.DIAMOND, (p) => paintOre(p, PAL.gemOre, 3, 2.1));

    paintUnlessStyled(TILE.COBBLE, (p) => paintCobbles(p, PAL.stone, PAL.mortar, 7, 0.95, 0.9));

    // Grass tuft: alpha cutout, so the silhouette is everything. Blades curve,
    // taper from two pixels to one, and shade dark at the base.
    paintUnlessPlant(TILE.TUFT, (p) => {
      const blades = [1, 4, 7, 10, 13];
      for (const bx of blades) {
        const h = 8 + ri(6), lean = rf(-2.4, 2.4);
        for (let i = 0; i < h; i++) {
          const t = i / (h - 1);
          const y = TS - 1 - i;
          const x = bx + Math.round(lean * t * t);
          p.set(x, y, tone(PAL.grass, 0.25 + t * 0.7, x, y));
          if (t < 0.6) p.set(x + 1, y, tone(PAL.grass, 0.1 + t * 0.5, x + 1, y));
        }
      }
    });

    // --- built blocks -------------------------------------------------------

    // Glass: a pale frame, an inner bevel and one corner glint. Everything else
    // is genuinely clear, which is why it needs alpha rather than a light tint.
    const GLINT = hex('f4fcff');
    paintUnlessStyled(TILE.GLASS, (p) => {
      p.each((x, y) => {
        const edge = x === 0 || y === 0 || x === TS - 1 || y === TS - 1;
        if (edge) { p.set(x, y, hex('d6ecf4'), 0.85); return; }
        const inner = x === 1 || y === 1 || x === TS - 2 || y === TS - 2;
        if (inner) { p.set(x, y, GLINT, 0.3); return; }
        // one diagonal streak, doubled faintly, so the pane reads as glazed
        if (x - y === 4 && x > 5 && x < 12) { p.set(x, y, GLINT, 0.5); return; }
        if (x - y === 6 && x > 7 && x < 12) { p.set(x, y, GLINT, 0.28); return; }
      });
      for (let y = 2; y < 6; y++) p.set(2, y, hex('ffffff'), 0.55);
      for (let x = 2; x < 6; x++) p.set(x, 2, hex('ffffff'), 0.55);
    });

    // Bricks: courses 4 tall, bricks 8 wide with a half-brick stagger — both
    // divide 16, so the bond continues across tiles. 1px mortar, per-brick tone,
    // and a lit top-left / shaded bottom-right edge inside each brick.
    paintUnlessStyled(TILE.BRICK, (p) => {
      const wear = noiseFn(rand, 4, TS);
      p.each((x, y) => {
        const course = (y / 4) | 0, shift = (course % 2) * 4;
        const bx = (x + shift) % 8, by = y % 4;
        if (by === 0 || bx === 0) {
          p.set(x, y, tone(PAL.brickMortar, 0.3 + wear(x, y) * 0.6, x, y));
          return;
        }
        const id = course * 4 + (((x + shift) / 8) | 0);
        let t = 0.34 + ((id * 37) % 5) * 0.08 + wear(x, y) * 0.16;
        if (by === 1 || bx === 1) t += 0.22;              // lit lip
        else if (by === 3 || bx === 7) t -= 0.2;          // cast shadow
        p.set(x, y, tone(PAL.brick, t, x, y));
      });
      for (let i = 0; i < 5; i++) {                      // chipped corners
        const x = ri(TS), y = ((ri(4)) * 4) + 1 + ri(2);
        p.set(x, y, tone(PAL.brickMortar, 0.5, x, y));
      }
    });

    // Thatch: short straw strands laid in bundles, with a darker binding line
    // every eight rows. Strand tone comes from a hash, not a diagonal formula —
    // the old `(x*7+y*3)%5` drew a visible moire across whole roofs.
    paintUnlessStyled(TILE.THATCH, (p) => {
      for (let y = 0; y < TS; y++) {
        const bound = y % 8 === 0;
        let x = ri(4);
        while (x < TS + 6) {
          const len = 3 + ri(4);
          const t = bound ? rf(0.0, 0.22) : rf(0.28, 1.0);
          for (let i = 0; i < len; i++) {
            p.set(x + i, y, tone(PAL.straw, t, x + i, y));
          }
          x += len;
        }
      }
      for (let i = 0; i < 4; i++) {                       // stray ends
        const x = ri(TS), y = ri(TS);
        p.set(x, y, PAL.straw[4]);
        p.set(x + 1, y, PAL.straw[4]);
      }
      for (let x = 0; x < TS; x += 5 + ri(3)) {           // binding cord
        p.set(x, 0, PAL.bark[1]); p.set(x, 8, PAL.bark[1]);
      }
    });

    // Tilled soil: damp earth with ploughed furrows — a lit crest and a dark
    // trough on an 8-texel period, which wraps.
    paintUnlessStyled(TILE.TILLED, (p) => {
      paintSoil(p, PAL.soilWet);
      p.each((x, y) => {
        const prof = Math.cos(((y % 8) / 8) * Math.PI * 2);   // +1 crest, -1 trough
        p.shade(x, y, 1 + prof * 0.2);
      });
      scatter(p, 6, 3, PAL.soilWet[0]);
    });

    // The path surface, top face and the lip of the side alike.
    //
    // Painted in 2x2 BLOCKS. The block being copied is sixteen texels across
    // and this atlas is thirty-two, so per-texel work here has twice the
    // detail of the thing it is imitating — and twice the detail of a flat
    // colour field is precisely what reads as noise. A coarse field picks the
    // patches, one small random step per block gives the grain, and the tones
    // are close enough together that the whole face still reads as one
    // material. No pressed stones: the pale grey flecks were the single
    // busiest thing on the tile and they are not on the original.
    function pathGrain(p, x0, y0, w, h) {
      const n = fbm(rand, 3, TS);
      for (let cy = y0; cy < y0 + h; cy += 2) {
        for (let cx = x0; cx < x0 + w; cx += 2) {
          const c = tone(PAL.pathTop, 0.20 + n(cx, cy) * 0.52 + rand() * 0.18,
            cx, cy);
          for (let y = 0; y < 2; y++) {
            for (let x = 0; x < 2; x++) p.set(cx + x, cy + y, c);
          }
        }
      }
    }

    // The cut edge, seen from the side: ordinary soil with the surface
    // spilling over the lip. The boundary steps in whole 2-texel units, the
    // same size as the grain, and wanders as a walk so neighbouring columns
    // agree — but it does not hang in tongues the way turf does. Grass grows
    // over an edge; earth is worn down to it.
    function classicPathSide(p) {
      paintSoil(p, PAL.soil);
      let d = 3;
      for (let cx = 0; cx < TS; cx += 2) {
        d += ri(3) - 1;
        d = Math.max(2, Math.min(4, d));
        pathGrain(p, cx, 0, 2, d * 2);
      }
    }
    paintUnlessStyled(TILE.PATH_SIDE, classicPathSide);

    // Path: trodden earth. No border — the old rim outlined every tile and
    // turned a courtyard into graph paper.
    paintUnlessStyled(TILE.PATH, (p) => pathGrain(p, 0, 0, TS, TS));

    // Furnace: the same cobble language as the block, so it reads as built from
    // it, with a hooded mouth and embers on the front.
    paintUnlessStyled(TILE.FURNACE_SIDE,
      (p) => paintCobbles(p, PAL.stone, PAL.mortar, 8, 0.9, 0.85));
    paintUnlessStyled(TILE.FURNACE_TOP, (p) => {
      paintCobbles(p, PAL.stone, PAL.mortar, 8, 0.9, 0.85);
      p.each((x, y) => {
        if (x < 4 || x > 11 || y < 4 || y > 11) return;
        const rimv = x === 4 || x === 11 || y === 4 || y === 11;
        if (rimv) { p.set(x, y, PAL.mortar[4]); return; }
        p.set(x, y, (x - 5) % 3 === 0 ? PAL.stone[1] : PAL.coal[1]);
      });
    });
    paintUnlessStyled(TILE.FURNACE_FRONT, (p) => {
      paintCobbles(p, PAL.stone, PAL.mortar, 8, 0.9, 0.85);
      p.each((x, y) => {
        if (x < 3 || x > 12 || y < 5 || y > 13) return;
        if (x === 3 || x === 12 || y === 5) { p.set(x, y, PAL.mortar[4]); return; }
        if (y < 8) { p.set(x, y, PAL.coal[0]); return; }         // hood
        // embers: hottest at the hearth, fading up into soot
        const t = (y - 8) / 5.5;
        const flick = ((x * 7 + y * 13) % 5) * 0.06;
        p.set(x, y, tone(PAL.flame, t * 1.05 - 0.15 + flick, x, y));
      });
      for (let x = 5; x < 11; x++) p.set(x, 13, PAL.flame[4]);   // hearth glow
    });

    // Crafting table: planks with a scored 3x3 on the lid and a tool board on
    // the side, both drawn as recessed lines rather than painted-on grids.
    paintUnlessStyled(TILE.CRAFT_TOP, (p) => {
      paintPlanks(p, PAL.plank);
      p.each((x, y) => {
        if (x % 5 === 0 || y % 5 === 0) p.shade(x, y, 0.6);
        else if (x % 5 === 1 || y % 5 === 1) p.shade(x, y, 1.16);
      });
      for (let i = 0; i < 6; i++) p.set(ri(TS), ri(TS), PAL.plank[4]);  // sawdust
    });
    paintUnlessStyled(TILE.CRAFT_SIDE, (p) => {
      paintPlanks(p, PAL.plank);
      for (let y = 5; y <= 12; y++) {
        for (let x = 3; x <= 12; x++) {
          if (y === 5 || y === 12 || x === 3 || x === 12) p.shade(x, y, 0.58);
        }
      }
      for (let i = 0; i < 6; i++) p.set(5 + i, 7, PAL.iron[3]);   // a saw
      for (let i = 0; i < 6; i++) p.set(5 + i, 8, PAL.iron[0]);
      for (let y = 8; y < 11; y++) p.set(9, y, PAL.iron[1]);      // and a chisel
      p.set(9, 10, PAL.iron[4]);
    });

    // Gravel: many small stones packed with dark gaps, and a couple of earthy
    // ones so it does not read as a second cobblestone.
    paintUnlessStyled(TILE.GRAVEL, (p) => {
      paintCobbles(p, PAL.gravel, PAL.mortar, 16, 0.75, 1.05);
      for (let i = 0; i < 5; i++) {
        const x = ri(TS), y = ri(TS);
        speck(p, x, y, 3 + ri(4), tone(PAL.soil, 0.5, x, y));
      }
      scatter(p, 7, 2, PAL.gravel[4]);
    });

    // Snow: high key and low contrast on purpose — the interest is in a few
    // sparkles and a shallow blue dip, not in value range.
    paintUnlessStyled(TILE.SNOW, (p) => {
      const n = fbm(rand, 3, TS);
      p.each((x, y) => p.set(x, y, tone(PAL.snow, 0.4 + n(x, y) * 0.62, x, y)));
      scatter(p, 5, 4, PAL.snow[1]);
      for (let i = 0; i < 7; i++) p.set(ri(TS), ri(TS), PAL.snow[4]);
    });

    // Clay: smooth and slightly striated, the flattest material in the atlas.
    paintUnlessStyled(TILE.CLAY, (p) => {
      const n = fbm(rand, 2, TS);
      p.each((x, y) => {
        const band = Math.sin((y / TS) * Math.PI * 4) * 0.08;
        p.set(x, y, tone(PAL.clay, 0.3 + n(x, y) * 0.48 + band, x, y));
      });
      scatter(p, 5, 3, PAL.clay[1]);
    });

    // Ice: translucent, with straight fractures because ice cleaves flat, and a
    // specular streak so it looks hard rather than merely blue.
    paintUnlessStyled(TILE.ICE, (p) => {
      const n = fbm(rand, 2, TS);
      p.each((x, y) => {
        p.set(x, y, tone(PAL.ice, 0.35 + n(x, y) * 0.5, x, y), 0.84);
      });
      for (let i = 0; i < 3; i++) {
        const x0 = ri(TS), y0 = ri(TS), dx = ri(3) - 1 || 1, dy = ri(3) - 1 || 1;
        for (let k = 0; k < 10 + ri(8); k++) {
          p.set(x0 + dx * k, y0 + dy * k, PAL.ice[4], 0.92);
          p.set(x0 + dx * k, y0 + dy * k + 1, PAL.ice[0], 0.9);
        }
      }
    });

    // Chest front: planks, iron bands top and bottom, lid seam and a lock plate.
    paintUnlessStyled(TILE.CHEST, (p) => {
      paintPlanks(p, PAL.plank);
      p.each((x, y) => {
        if (y === 0 || y === TS - 1) p.set(x, y, PAL.bark[0]);
        if (x === 0 || x === TS - 1) p.set(x, y, PAL.bark[1]);
        if (y === 5) p.set(x, y, PAL.bark[0]);            // lid seam
        if (y === 6) p.set(x, y, PAL.bark[3]);
      });
      for (let y = 4; y <= 9; y++) {
        for (let x = 6; x <= 9; x++) {
          p.set(x, y, tone(PAL.gold, 0.72 - (y - 4) * 0.11, x, y));
        }
      }
      p.set(6, 4, PAL.gold[0]); p.set(9, 9, PAL.gold[0]);
      p.set(7, 7, PAL.coal[0]); p.set(8, 7, PAL.coal[0]);  // keyhole
      p.set(7, 8, PAL.coal[0]);
    });

    // Torch: a dark stick with one lit edge and a three-tone flame.
    paintUnlessStyled(TILE.TORCH, (p) => {
      for (let y = 7; y < TS; y++) {
        p.set(7, y, PAL.bark[3]);
        p.set(8, y, PAL.bark[1]);
      }
      p.set(7, 7, PAL.bark[4]);
      const flame = [
        [7, 2], [8, 2], [6, 3], [7, 3], [8, 3], [9, 3],
        [6, 4], [7, 4], [8, 4], [9, 4], [6, 5], [7, 5], [8, 5], [9, 5],
        [7, 6], [8, 6],
      ];
      for (const [x, y] of flame) {
        p.set(x, y, tone(PAL.flame, 0.35 + (y - 2) * 0.13, x, y));
      }
      p.set(7, 3, PAL.flame[4]); p.set(8, 4, PAL.flame[4]);
      p.set(7, 4, PAL.flame[3]);
    });

    // --- item icons ---------------------------------------------------------

    // Split in two so the plant sprites below can route through
    // paintUnlessPlant: spriteRows is the mask-to-texel copy, sprite the
    // unconditional emit everything else uses. No sprite draws a random
    // number, so the split cannot move a mark anywhere.
    function spriteRows(p, rows, palette) {
      const n = rows.length;
      for (let y = 0; y < n; y++) {
        const line = rows[y] || '';
        for (let x = 0; x < n; x++) {
          const c = palette[line[x]];
          if (c) p.set(x, y, c);
        }
      }
    }
    // A MASK SAYS ITS OWN GRID. This used to paint everything on the shadowed
    // classic 16 and let emit() blit it up, which is right for the classic art
    // and wrong for the tools — see the note over the masks. A 16-row array
    // still lands on a 16 grid and blits up exactly as it always did, so
    // nothing that was not redrawn changes by a texel.
    function sprite(tile, rows, palette) {
      const p = new Pix(rows.length);
      spriteRows(p, rows, palette);
      emit(tile, p);
      return p;
    }

    // held items use the WHOLE ramp: the body sits on the middle tone so the
    // facets above and below it have somewhere to go. Anchoring the body low
    // (as an ore vein does, where the stone supplies the contrast) turns every
    // nugget into one dark blob against a dark hotbar slot.
    const oreItem = (r) => ({
      D: r[0].map((v) => v * 0.4), H: r[0], M: r[2], L: r[3], S: r[4],
    });
    sprite(TILE.COAL_LUMP, S_LUMP, {
      D: hex('070708'), H: hex('1a1a20'), M: hex('2e2e38'),
      L: hex('4d4d5a'), S: hex('70707e'),
    });
    sprite(TILE.RAW_IRON, S_LUMP, oreItem(PAL.ironOre));
    sprite(TILE.RAW_SILVER, S_LUMP, oreItem(PAL.silverOre));
    sprite(TILE.FLINT, S_LUMP, oreItem(PAL.flint));
    sprite(TILE.IRON_INGOT, S_INGOT, {
      D: hex('23262b'), H: PAL.iron[0], M: PAL.iron[2],
      L: PAL.iron[3], S: PAL.iron[4],
    });
    sprite(TILE.SILVER_INGOT, S_INGOT, {
      D: hex('2b2f36'), H: PAL.silver[0], M: PAL.silver[2],
      L: PAL.silver[3], S: PAL.silver[4],
    });
    sprite(TILE.DIAMOND_GEM, S_GEM, {
      D: hex('0b3034'), H: PAL.gemOre[0], M: PAL.gemOre[2],
      L: PAL.gemOre[3], S: PAL.gemOre[4],
    });
    sprite(TILE.STICK, S_STICK, { D: hex('26190d'), ...HANDLE });

    // Tools: one template per shape, one palette per tier.
    const SHAPES = [
      ['PICK', S_PICK], ['AXE', S_AXE], ['SHOVEL', S_SHOVEL],
      ['SWORD', S_SWORD], ['HOE', S_HOE],
    ];
    for (const [shape, rows] of SHAPES) {
      for (const tier of ['WOOD', 'STONE', 'IRON', 'DIAMOND']) {
        sprite(TILE[`${shape}_${tier}`], rows, { ...HEADS[tier], ...HANDLE });
      }
    }

    // --- food and crops -----------------------------------------------------

    // Seeds: teardrops, squashed in y so they read as grains not dots.
    paint(TILE.SEEDS, (p) => {
      const spots = [[5, 5], [10, 6], [4, 11], [11, 11], [8, 8], [7, 3]];
      for (const [cx, cy] of spots) {
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.hypot(dx, dy * 1.5);
            if (d > 2.1) continue;
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= TS || y >= TS) continue;
            p.set(x, y, tone(PAL.straw, 0.9 - d * 0.32, x, y));
          }
        }
        if (cx > 0 && cy > 0) p.set(cx - 1, cy - 1, PAL.straw[4]);
      }
    });

    // Ripe wheat: three stalks, fat alternating grain heads, drooping tips.
    // Young wheat: the same stalks, green, shorter, no ears.
    function paintWheat(p, R, ripe) {
      const stalks = ripe ? [3, 8, 13] : [4, 8, 12];
      for (let i = 0; i < stalks.length; i++) {
        const sx = stalks[i];
        const top = ripe ? 1 + (i % 2) * 2 : 6 + (i % 2);
        for (let y = top; y < TS; y++) {
          p.set(sx, y, tone(R, 0.5 - (y / TS) * 0.3, sx, y));
          p.set(sx + 1, y, tone(R, 0.28 - (y / TS) * 0.18, sx + 1, y));
        }
        if (ripe) {
          for (let y = top; y < top + 7; y++) {
            const s = (y - top) % 2;
            p.set(sx - 1 + s * 3, y, tone(R, 0.95 - (y - top) * 0.05, sx, y));
            p.set(sx - 1 + s * 3, y + 1, tone(R, 0.72, sx, y));
          }
          p.set(sx, top - 1, R[4]);
        } else {
          for (let k = 0; k < 3; k++) {                   // young leaves
            const y = top + 2 + k * 3;
            p.set(sx - 1 - (k & 1), y, tone(R, 0.8, sx, y));
            p.set(sx + 2 + (k & 1), y + 1, tone(R, 0.66, sx, y));
          }
        }
      }
    }
    paintUnlessPlant(TILE.WHEAT, (p) => paintWheat(p, PAL.straw, true));
    paintUnlessPlant(TILE.WHEAT_YOUNG, (p) => paintWheat(p, PAL.stem, false));

    // Bread: a domed loaf, dark crust, three slashes across the top.
    paint(TILE.BREAD, (p) => {
      p.each((x, y) => {
        const dx = (x - 7.5) / 6.4, dy = (y - 8.5) / 4.4;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        let t = 0.86 - d * 0.5 - (y - 5) * 0.045;
        if (d > 0.68) t -= 0.32;                                  // crust
        if ((x + y * 2) % 7 === 0 && d < 0.5 && y < 9) t += 0.28; // slash
        p.set(x, y, tone(PAL.bread, t, x, y));
      });
      for (let x = 4; x < 12; x++) p.set(x, 13, PAL.bread[0]);    // base shadow
    });

    // Apple: a round body lit from the upper left, a stalk and one leaf.
    paint(TILE.APPLE, (p) => {
      p.each((x, y) => {
        const dx = (x - 7.5) / 5.6, dy = (y - 9.4) / 5.4;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        const lit = (-(x - 6) - (y - 8)) * 0.055;
        p.set(x, y, tone(PAL.apple, 0.55 + lit - d * 0.22, x, y));
      });
      for (let y = 2; y < 6; y++) p.set(8, y, PAL.bark[2]);
      p.set(8, 2, PAL.bark[3]);
      for (const [x, y] of [[9, 3], [10, 3], [10, 4], [11, 4], [9, 4]]) {
        p.set(x, y, tone(PAL.stem, 0.7, x, y));
      }
      for (const [x, y] of [[5, 7], [6, 7], [5, 8]]) p.set(x, y, PAL.apple[4]);
    });

    // --- plants -------------------------------------------------------------
    // One flower template in three colours: crossed quads read as a shape, not
    // a species, so the petal colour is the only thing that has to differ.
    for (const [name, R] of [
      ['RED', PAL.petalR], ['YELLOW', PAL.petalY], ['BLUE', PAL.petalB],
    ]) {
      paintUnlessPlant(TILE[`FLOWER_${name}`], (p) => spriteRows(p, S_FLOWER, {
        D: R[0].map((v) => v * 0.5),
        P: R[2], p: R[3], C: PAL.pollen[3],
        S: PAL.stem[3], s: PAL.stem[1], G: PAL.stem[2],
      }));
    }
    paintUnlessPlant(TILE.MUSHROOM, (p) => spriteRows(p, S_MUSHROOM, {
      D: hex('3d0f0c'), C: PAL.capRed[2], W: hex('f0ece2'),
      S: hex('cfc7b6'),
    }));
    paintUnlessPlant(TILE.SAPLING, (p) => spriteRows(p, S_SAPLING, {
      D: hex('12300e'), G: PAL.leaf[2], L: PAL.leaf[3],
      d: PAL.bark[2],
    }));

    // Ladder: rails shaded round, rungs with a shadow under each one.
    paint(TILE.LADDER, (p) => {
      for (const rx of [2, 12]) {
        for (let y = 0; y < TS; y++) {
          p.set(rx, y, tone(PAL.plank, 0.78, rx, y));
          p.set(rx + 1, y, tone(PAL.plank, 0.3, rx + 1, y));
        }
      }
      for (let y = 1; y < TS; y += 5) {
        for (let x = 4; x < 12; x++) {
          p.set(x, y, tone(PAL.plank, 0.66, x, y));
          p.set(x, y + 1, tone(PAL.plank, 0.22, x, y + 1));
        }
      }
    });

    // --- held items ---------------------------------------------------------
    sprite(TILE.GUN, S_GUN, {
      D: hex('16181c'), H: hex('3c4048'), M: hex('5c626c'),
      L: hex('868d98'), S: hex('b3bac4'), x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.BULLET, S_BULLET, {
      D: hex('2a1f0a'), S: PAL.gold[4], L: hex('d08a52'),
      B: PAL.gold[2], b: PAL.gold[1],
    });
    // the heavy weapons wear the same steel and the same wooden grip as the
    // rest of the family — sprites draw no random numbers, so adding them
    // here re-rolls nothing
    sprite(TILE.GUN_BAZOOKA, S_BAZOOKA, {
      D: hex('16181c'), H: hex('3c4048'), M: hex('5c626c'),
      L: hex('868d98'), S: hex('b3bac4'), x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.GUN_LAUNCHER, S_LAUNCHER, {
      D: hex('16181c'), H: hex('3c4048'), M: hex('5c626c'),
      L: hex('868d98'), x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.ROCKET, S_ROCKET, {
      D: hex('16181c'), S: hex('b3bac4'), L: hex('868d98'), b: hex('5c626c'),
      R: hex('c23b2c'), r: hex('8a2418'),
    });
    // the medieval and prehistoric racks: steel takes the gun family's
    // greys, wood the shared handle tones, flint its own knapped slate
    const STEEL = { D: hex('16181c'), H: hex('3c4048'), M: hex('5c626c'),
      L: hex('868d98'), S: hex('b3bac4') };
    const FLINT = { F: hex('5a5f66'), f: hex('3a3e44') };
    sprite(TILE.BOW, S_BOW, {
      D: hex('2a1f0a'), S: hex('8a6a3a'), x: HANDLE.x, L: hex('a5854e'),
      w: hex('d9d2bd'),
    });
    sprite(TILE.ARROW, S_ARROW, {
      D: hex('16181c'), ...FLINT, S: hex('8a6a3a'), x: HANDLE.w,
      E: hex('d9d2bd'),
    });
    sprite(TILE.SPEAR, S_SPEAR, {
      ...STEEL, x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.HAMMER, S_HAMMER, {
      ...STEEL, x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.CLUB, S_CLUB, {
      D: hex('2a1f0a'), x: HANDLE.x, w: HANDLE.w, L: hex('a5854e'),
    });
    sprite(TILE.FLINT_SPEAR, S_FLINT_SPEAR, {
      D: hex('16181c'), ...FLINT, x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.FLINT_KNIFE, S_FLINT_KNIFE, {
      D: hex('16181c'), ...FLINT, x: HANDLE.x, w: HANDLE.w,
    });

    // --- the track and the network ------------------------------------------
    // One palette for all six, because they ARE one set: the same steel, the
    // same sleepers, the same copper, and one lamp to put on the end of it.
    // Painted here rather than in a style, so every look in the game gets
    // them — a style that has never heard of a dynamo would otherwise leave
    // the tile blank.
    const POWER = {
      D: hex('1c1f24'),
      H: PAL.iron[0], M: PAL.iron[2], L: PAL.iron[3], S: PAL.iron[4],
      x: HANDLE.x, w: HANDLE.w,
      q: PAL.copper[0], r: PAL.copper[1], t: PAL.copper[2], y: PAL.copper[4],
      g: hex('a87618'), G: hex('ffe89a'),
    };
    sprite(TILE.WIRE_ITEM, S_WIRE, POWER);
    sprite(TILE.SWITCH_ITEM, S_SWITCH, POWER);
    sprite(TILE.DYNAMO_ITEM, S_DYNAMO, POWER);
    sprite(TILE.POWER_LAMP_ITEM, S_POWER_LAMP, POWER);
    sprite(TILE.RAIL_ITEM, S_RAIL, POWER);
    sprite(TILE.WAGON_ITEM, S_WAGON, POWER);
    // ...and the two that are made of wood rather than iron, in the plank's
    // own tones so a fence in the hand matches the fence in the ground.
    const TIMBER = {
      D: tone(PAL.plank, 0.12, 0, 0), H: tone(PAL.plank, 0.3, 1, 1),
      M: tone(PAL.plank, 0.55, 2, 2), L: tone(PAL.plank, 0.82, 3, 3),
      S: tone(PAL.plank, 0.95, 4, 4),
      x: HANDLE.x, w: HANDLE.w,
    };
    sprite(TILE.FENCE_ITEM, S_FENCE, TIMBER);
    sprite(TILE.GATE_ITEM, S_GATE, TIMBER);
    // the hammer family: one silhouette, three heads — wood, then the steel
    // one above, then diamond
    sprite(TILE.HAMMER_WOOD, S_HAMMER, {
      D: hex('2a1f0a'), H: hex('5d431f'), M: hex('79582f'),
      L: hex('96703c'), S: hex('b08a4d'), x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.HAMMER_DIAMOND, S_HAMMER, {
      D: hex('0e2a2a'), H: hex('2e7d7d'), M: hex('45a8a5'),
      L: hex('6fd0cc'), S: hex('b4f0ea'), x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.GUN_RIFLE, S_RIFLE, {
      ...STEEL, x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.GUN_SHOTGUN, S_SHOTGUN, {
      ...STEEL, x: HANDLE.x, w: HANDLE.w,
    });
    sprite(TILE.MEAT_RAW, S_MEAT, {
      D: hex('3a1219'), H: PAL.meatRaw[0], M: PAL.meatRaw[2],
      S: PAL.meatRaw[4], L: PAL.bone[3], B: PAL.bone[1],
    });
    sprite(TILE.MEAT_COOKED, S_MEAT, {
      D: hex('2a1206'), H: PAL.meatDone[0], M: PAL.meatDone[2],
      S: PAL.meatDone[4], L: PAL.bone[3], B: PAL.bone[1],
    });
    sprite(TILE.FEATHER, S_FEATHER, {
      D: hex('5c6068'), S: PAL.feather[4], L: PAL.feather[2],
      w: PAL.feather[0],
    });
    sprite(TILE.LEATHER, S_LEATHER, {
      D: hex('2a1a08'), H: PAL.hide[0], M: PAL.hide[1], L: PAL.hide[3],
    });
    sprite(TILE.BONE, S_BONE, {
      D: hex('5e5748'), H: PAL.bone[0], L: PAL.bone[2], S: PAL.bone[4],
    });
    sprite(TILE.BONE_MEAL, S_BONE_MEAL, {
      D: hex('5e5748'), H: PAL.bone[0], L: PAL.bone[2], S: PAL.bone[4],
    });

    // Lava, in the classic idiom. It is LAST in this function on purpose: the
    // classic tiles all draw from one random stream and the draw ORDER is part
    // of the art, so a new painter anywhere else would have silently redrawn
    // every tile below it. At the end it can move nothing.
    //
    // Tile 78 was blank before this, and a blank tile is a hole under
    // alphaTest, so the classic style needs its own lava even though nothing
    // renders TILE.LAVA yet — see the note on the tile itself.
    paintUnlessStyled(TILE.LAVA, (p) => {
      const n = fbm(rand, 3, TS);
      p.each((x, y) => p.set(x, y, tone(PAL.flame, 0.34 + n(x, y) * 0.8, x, y)));
      for (let i = 0; i < 5; i++) speck(p, ri(TS), ri(TS), 4 + ri(5), PAL.flame[1]);
      for (let i = 0; i < 8; i++) p.set(ri(TS), ri(TS), PAL.flame[4]);
    });

    // --- the trodden path, at the resolution it should always have had -----
    //
    // `pathGrain` above paints in 2x2 cells, under a comment reasoning that
    // the atlas is 32 texels and the art being matched is 16, so a 1x1 cell
    // would carry twice the detail of the original. That reasoning is right
    // and the code under it is not, because THIS FUNCTION SHADOWS TS TO CT.
    // Every painter in here counts in 16ths, so a 2x2 cell is not half a
    // 32-texel face, it is an eighth of a 16-texel one: the path came out at
    // 8x8 over a block, which is half the resolution of the thing it copies
    // and reads, correctly, as the wrong texture rather than a coarse one.
    //
    // So: one flat tone per texel, sixteen across a face, picked straight off
    // the ramp with no dither. `tone` weaves the boundary between two ramp
    // entries with a Bayer matrix, which is right for a gradient and wrong for
    // ground — it turns the seam into a third texture. Hard steps between five
    // browns is what trodden earth is, and neighbours that happen to agree run
    // together into the longer rectangles the original is full of.
    //
    // The field is kept at a sixth of its old weight. Ground does drift
    // lighter and darker across a yard and losing that entirely gives an even
    // hiss; this biases which end of the ramp a region draws from without ever
    // deciding it.
    //
    // Last in the function on the same argument the lava above is: this draws
    // four times the randoms the 2x2 version did, and anywhere else that would
    // silently redraw every classic tile below it. The 2x2 painter still runs
    // where it always did and still pulls exactly what it always pulled — only
    // its pixels are thrown away — so the stream is untouched.
    function trodden(p, x0, y0, w, h) {
      const n = fbm(rand, 3, TS);
      const R = PAL.pathTop, last = R.length - 1;
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const t = n(x, y) * 0.16 + rand() * 0.84;
          const i = (t * R.length) | 0;
          p.set(x, y, R[i < 0 ? 0 : i > last ? last : i]);
        }
      }
    }
    paintUnlessStyled(TILE.PATH, (p) => trodden(p, 0, 0, TS, TS));
    // ...and the cut edge, so the lip that spills over it is the same earth.
    // Same wandering boundary the original had: it steps in whole texels and
    // wanders as a walk, so neighbouring columns agree.
    paintUnlessStyled(TILE.PATH_SIDE, (p) => {
      paintSoil(p, PAL.soil);
      let d = 5;
      for (let x = 0; x < TS; x++) {
        d += ri(3) - 1;
        d = Math.max(3, Math.min(7, d));
        trodden(p, x, 0, 1, d);
      }
    });
  }

  // the grass and wood families at the atlas resolution, when the style has a
  // look of its own; classicTiles() paints them otherwise
  const LOOK = currentStyle().look;
  // drawn under real light, with photographs over the top: see realism.js
  const PBR = !!currentStyle().pbr;
  if (LOOK) {
    // The realistic finish, run AFTER the family painter: the broad mottle
    // that gives a surface tone at two scales, the sky-light gradient on the
    // side-ish tiles (`side`), and the baked-AO vignette that makes every
    // block read as an object with edges. All three are gated on look keys
    // only `real` sets, and the one that rolls dice rolls them on `rrand` —
    // for every other style `finish` IS `paint`, byte for byte.
    const finish = (tile, fn, o = {}) => paint(tile, (p) => {
      fn(p);
      if (LOOK.mottle && !o.flat) {
        for (const s of [].concat(LOOK.mottle)) mottlePass(p, s);
      }
      // A style drawn under real light (`pbr`) has the light do this: a
      // baked sky gradient and a baked edge shadow on top of the real ones
      // would light every block twice.
      if (LOOK.grad && o.side && !PBR) gradPass(p, LOOK.grad);
      if (LOOK.ao && !PBR) aoPass(p, LOOK.ao, o.ao ?? 1);
    });
    // `ao` in the options is the vignette's strength: 1 for a built block,
    // which is a thing with edges, roughly half for the terrain, which is a
    // SURFACE — the 3x3 sheet turns a full ring on grass into graph paper
    finish(TILE.GRASS_TOP, (p) => flatGrassTop(p, LOOK), { ao: 0.5 });
    finish(TILE.DIRT, (p) => flatDirt(p, LOOK), { ao: 0.5 });
    finish(TILE.GRASS_SIDE, (p) => flatGrassSide(p, LOOK), { side: true, ao: 0.6 });
    // the wood comes AFTER the grass on purpose: the flat painters share one
    // random stream, so appending to it cannot disturb art already approved
    finish(TILE.LOG_SIDE, (p) => flatLogSide(p, LOOK), { side: true });
    finish(TILE.LOG_TOP, (p) => flatLogTop(p, LOOK));
    finish(TILE.PLANK, (p) => flatPlank(p, LOOK), { side: true });
    // and after the wood, for the same reason again: the tiles that share a
    // block with the earth or with the boards, so no block wears a styled
    // side under a classic top
    finish(TILE.PATH, (p) => flatPath(p, LOOK), { ao: 0.5 });
    finish(TILE.PATH_SIDE, (p) => flatPathSide(p, LOOK), { side: true, ao: 0.6 });
    finish(TILE.TILLED, (p) => flatTilled(p, LOOK), { ao: 0.5 });
    finish(TILE.CRAFT_TOP, (p) => flatCraftTop(p, LOOK));
    finish(TILE.CRAFT_SIDE, (p) => flatCraftSide(p, LOOK), { side: true });
    // stage two: the common ground and the building materials. None of these
    // painters draws a random number, so they could sit anywhere in the
    // stream; they go last so the diff stays trivially readable.
    finish(TILE.STONE, (p) => flatStone(p, LOOK), { ao: 0.7 });
    finish(TILE.COBBLE, (p) => flatCobble(p, LOOK));
    finish(TILE.SAND, (p) => flatSand(p, LOOK), { ao: 0.5 });
    // the desert, off the same painter and the same ripples — see MATBASE
    finish(TILE.SAND_ORANGE, (p) => flatSand(p, LOOK, MATBASE.sandOrange),
      { ao: 0.5 });
    finish(TILE.GRAVEL, (p) => flatGravel(p, LOOK), { ao: 0.6 });
    finish(TILE.CLAY, (p) => flatClay(p, LOOK), { ao: 0.6 });
    finish(TILE.BRICK, (p) => flatBrick(p, LOOK), { side: true });
    finish(TILE.THATCH, (p) => flatThatch(p, LOOK), { side: true });
    // The canopy is painted ONCE and emitted twice: whole to LEAF_FAR for the
    // distant shell, then with the holes punched to LEAF for the chunks.
    // Painting it a second time instead would pull `grit` off the flat stream
    // again and move every mark on every tile below it.
    const leafPix = finish(TILE.LEAF_FAR, (p) => flatLeaf(p, LOOK), { ao: 0.6 });
    leafHoles(leafPix);
    emit(TILE.LEAF, leafPix);
    // stage three: the furnace first, because it was the one block wearing a
    // styled face next to a classic one, then everything else still on the old
    // art. Only flatChest touches the shared random stream (through
    // plankBody), and it is at the end of it, so none of this can move a mark
    // on a tile that was already approved.
    finish(TILE.FURNACE_SIDE, (p) => flatFurnaceSide(p, LOOK), { side: true });
    finish(TILE.FURNACE_TOP, (p) => flatFurnaceTop(p, LOOK));
    finish(TILE.FURNACE_FRONT, (p) => flatFurnaceFront(p, LOOK), { side: true });
    finish(TILE.COAL, (p) => flatOre(p, LOOK, MATBASE.coal, 0.72, [0, 1, 2, 3, 4]), { ao: 0.7 });
    finish(TILE.IRON, (p) => flatOre(p, LOOK, MATBASE.ironOre, 1.35, [1, 2, 3, 5, 6]), { ao: 0.7 });
    finish(TILE.SILVER, (p) => flatOre(p, LOOK, MATBASE.silverOre, 1.06, [0, 1, 4, 6]), { ao: 0.7 });
    finish(TILE.DIAMOND, (p) => flatOre(p, LOOK, MATBASE.gemOre, 1.28, [0, 3, 6]), { ao: 0.7 });
    // glass and the torch are alpha cutouts and water and lava belong to the
    // shader and to hotRamp — none of them wears the finish
    paint(TILE.GLASS, (p) => flatGlass(p, LOOK));
    paint(TILE.TORCH, (p) => flatTorch(p, LOOK));
    paint(TILE.LAVA, (p) => flatLava(p, LOOK));
    // snow and ice paint their own weather (dapples, cracks) and skip the
    // neutral mottle, which on snow reads as dirt
    finish(TILE.SNOW, (p) => flatSnow(p, LOOK), { flat: true, ao: 0.5 });
    finish(TILE.ICE, (p) => flatIce(p, LOOK), { flat: true, ao: 0.7 });
    finish(TILE.CHEST, (p) => flatChest(p, LOOK), { side: true });
    // WATER last of all: `mosaic`'s sea draws from the flat stream (through
    // cellGrid), and putting it after everything else that does means it
    // cannot move a mark on a tile already approved. `classicTiles()` still
    // runs its own water painter below for the draw-order reason explained
    // there, but `paintUnlessStyled` means it only emits when LOOK is null.
    paint(TILE.WATER, (p) => flatWater(p, LOOK));
    // The plants, very last of all: they draw from the flat stream too, and
    // a painter appended after everything else cannot re-roll art already
    // approved above. Only a look that authors `plant` replaces the classic
    // sprites on the cross quads — the matching emit-drop for the classic
    // painters is paintUnlessPlant in classicTiles().
    if (LOOK.plant) {
      paint(TILE.TUFT, (p) => flatTuft(p, LOOK));
      paint(TILE.FLOWER_RED, (p) => flatFlower(p, LOOK, 'red'));
      paint(TILE.FLOWER_YELLOW, (p) => flatFlower(p, LOOK, 'yellow'));
      paint(TILE.FLOWER_BLUE, (p) => flatFlower(p, LOOK, 'blue'));
      paint(TILE.MUSHROOM, (p) => flatMushroom(p, LOOK));
      paint(TILE.SAPLING, (p) => flatSapling(p, LOOK));
      paint(TILE.WHEAT, (p) => flatWheatReal(p, LOOK, true));
      paint(TILE.WHEAT_YOUNG, (p) => flatWheatReal(p, LOOK, false));
    }
  }

  classicTiles();

  // --- the tiles added after the atlas was full ------------------------------
  //
  // Gold, brass, the four storage blocks, eight tinted glasses, the four
  // timbers after oak, the dyes and the brass rack. All of it is painted
  // HERE, at the very end, for the reason the lava tile gives above: the
  // classic art draws from one shared random stream and the draw ORDER is
  // part of the art, so a painter inserted anywhere higher would silently
  // redraw every tile below it. At the end it can move nothing.
  //
  // Classic paints these in the realistic look too, and then draws every one
  // that is a block face again in its own idiom at the very end (see
  // classicart.js, below) — the realistic versions are what is left under
  // the few that are not, and what the realistic style itself wears.
  const NEWL = LOOK ?? STYLES.find((s) => s.id === 'real')?.look;
  if (NEWL) newTiles(NEWL);

  function newTiles(L) {
    // the realistic finish, on the same terms the styled path applies it
    const fin = (tile, fn, o = {}) => paint(tile, (p) => {
      fn(p);
      if (L.mottle && !o.flat) for (const s of [].concat(L.mottle)) mottlePass(p, s);
      if (L.grad && o.side && !PBR) gradPass(p, L.grad);
      if (L.ao && !PBR) aoPass(p, L.ao, o.ao ?? 1);
    });

    // --- gold in the rock ---------------------------------------------------
    // Four vein sites, none of them the set any other ore uses, so gold is a
    // different rock and not iron in a yellow coat. It sits between silver
    // and iron in the world's ore table and it sits between them here too.
    fin(TILE.GOLD, (p) => flatOre(p, L, MATBASE.goldOre, 1.12, [2, 3, 4, 5]),
      { ao: 0.7 });

    // --- the storage blocks -------------------------------------------------
    // Nine ingots CAST into one, not nine ingots stacked: a flat face of
    // metal with a bevelled rim, four sunk rivets and one hard highlight.
    // The rivets are the whole design — a large flat colour field with
    // nothing on it reads as a missing texture, and at 32 texels there is no
    // room for anything finer than a 4x4 mark.
    function metalBlock(p, base, push = 1) {
      const R = matRamp(base, {
        ...L.mat,
        sat: Math.max(L.mat.sat ?? 1, 1.0),
        val: (L.mat.val ?? 1) * push,
        gap: (L.mat.gap ?? 1) * 1.15,
      }, 5);
      p.fill(R[2]);
      plateEdge(p, 0, 0, TS, TS, { lit: R[4], dark: R[0] });   // the cast rim
      plateEdge(p, 1, 1, TS - 2, TS - 2, { lit: R[3], dark: R[1] });
      for (const [x, y] of [[5, 5], [23, 5], [5, 23], [23, 23]]) {
        rect(p, x, y, 4, 4, R[1]);
        // sunk, so the lit and dark edges are the other way round
        plateEdge(p, x, y, 4, 4, { lit: R[0], dark: R[3] });
      }
      // The polish: two diagonal strokes across the face. A horizontal bar
      // reads as a dash somebody painted on the block; a diagonal reads as
      // light sliding off metal, which is the one thing this tile has to say
      // that the storage blocks' colour cannot say on its own.
      for (let i = 0; i < 10; i++) {
        p.set(9 + i, 21 - i, R[4]); p.set(10 + i, 21 - i, R[4]);
      }
      for (let i = 0; i < 5; i++) p.set(21 + i, 25 - i, R[3]);
      border(p, L.line);
    }
    fin(TILE.BLOCK_IRON, (p) => metalBlock(p, MATBASE.iron));
    fin(TILE.BLOCK_GOLD, (p) => metalBlock(p, MATBASE.gold, 1.14));
    fin(TILE.BLOCK_BRASS, (p) => metalBlock(p, MATBASE.brass, 1.06));

    // The gem block is not cast, it is CUT: nine stones set flush in a grid,
    // each with its own lit corner and its own table. Rivets on diamond would
    // say "metal", and the one thing this block has to say is "not metal".
    fin(TILE.BLOCK_DIAMOND, (p) => {
      const R = matRamp(MATBASE.diamond, {
        ...L.mat,
        sat: Math.max(L.mat.sat ?? 1, 1.0),
        val: clamp((L.mat.val ?? 1) * 1.12, 0.35, 1.35),
        gap: (L.mat.gap ?? 1) * 1.2,
      }, 5);
      p.fill(R[0]);
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          const x = 1 + gx * 10, y = 1 + gy * 10;
          rect(p, x, y, 9, 9, R[2]);
          plateEdge(p, x, y, 9, 9, { lit: R[4], dark: R[1] });
          rect(p, x + 3, y + 3, 4, 4, R[3]);                   // the table
          p.set(x + 2, y + 2, R[4]);
        }
      }
      // the setting the nine are held in: every edge texel one colour, which
      // is also what makes two of these blocks join without a line
      plateEdge(p, 0, 0, TS, TS, { lit: R[3], dark: R[0] });
      border(p, L.line);
    });

    // --- tinted glass -------------------------------------------------------
    // Real stained glass: a translucent wash that COLOURS what is behind it,
    // which is the whole of what "tinted" means.
    //
    // It used to be a lattice of opaque texels with daylight punched between
    // them, because the solid pass is alpha-TESTED (`alphaTest: 0.5`) and
    // under a hard cut there is no such thing as a half-opaque texel — it is
    // either fully there or it is a hole. Black tinted glass therefore came
    // out as a dark GRILLE with the grass showing through the gaps, which is
    // exactly what was reported from a screenshot. The tints have a pass of
    // their own now — cubemesher's `glass` geometry, drawn with main.js's
    // alpha-blended `glassMaterial` — so the wash is simply drawable and
    // there is nothing left to fake.
    //
    // The alpha IS the strength of the tint: at 0.52 a red pane turns the
    // hillside behind it red without hiding it, and a black one darkens
    // without becoming a wall. The leading and the two reflections stay
    // near-opaque — a window needs a mullion where two of them meet, and a
    // flat 52% wash on its own would give the hotbar icon no shape at all.
    function tintGlass(p, base) {
      const M = matRamp(base,
        pale({ ...L.mat, sat: Math.max(L.mat.sat ?? 1, 1.1) }), 3);
      const glass = M[1], came = M[0], glint = lighten(M[2], 1.45);
      // rect() writes through Pix.set at full alpha; here every mark carries
      // its own, so it needs the four-argument form
      const wash = (x, y, w, h, c, a) => {
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) p.set(x + i, y + j, c, a);
        }
      };
      p.fill(glass, 0.52);
      wash(0, 2, TS, 1, came, 0.66); wash(2, 0, 1, TS, came, 0.66);
      wash(0, 0, TS, 2, came, 0.92); wash(0, TS - 2, TS, 2, came, 0.92);
      wash(0, 0, 2, TS, came, 0.92); wash(TS - 2, 0, 2, TS, came, 0.92);
      // the same two reflections clear glass wears, so a tinted pane and a
      // clear one are one window in two colours
      wash(6, 6, 11, 2, glint, 0.6); wash(6, 6, 2, 11, glint, 0.6);
      wash(20, 22, 7, 2, glint, 0.5);
      border(p, L.line);
    }

    // --- dye ----------------------------------------------------------------
    // A heap of ground pigment, drawn rather than masked: the only thing that
    // tells eight of these apart in a hotbar is colour, so the silhouette had
    // better be identical to the texel.
    function dyeIcon(p, base) {
      const R = matRamp(base,
        { ...L.mat, sat: Math.max(L.mat.sat ?? 1, 1.15) }, 5);
      const cx = 16;
      for (let y = 10; y <= 26; y++) {
        const t = (y - 10) / 16;
        const w = Math.round(3 + t * 11);
        for (let x = cx - w; x <= cx + w; x++) {
          const e = Math.abs(x - cx) / (w + 1);
          p.set(x, y, R[t < 0.22 ? 4 : e > 0.74 ? 1 : e > 0.44 ? 2 : 3]);
        }
      }
      for (let x = cx - 14; x <= cx + 14; x++) p.set(x, 26, R[0]);
      // three grains that have rolled clear of the heap: the mark that says
      // powder rather than a painted lump
      for (const [x, y] of [[6, 22], [26, 24], [24, 13]]) {
        p.set(x, y, R[3]); p.set(x + 1, y, R[2]);
      }
    }

    // One colour per tint, shared by the glass and by the dye that stains it,
    // so a purple pane and the purple dye it was made with cannot drift
    // apart. The order mirrors cubesphere's GLASS_TINTS, which is what makes
    // "tint index" mean the same thing in the world, the atlas and the bags.
    const TINTS = [
      ['WHITE', 'dfe6ec'], ['RED', 'c0392e'], ['ORANGE', 'd4802a'],
      ['YELLOW', 'd6c033'], ['GREEN', '4d9a35'], ['BLUE', '3a6bc4'],
      ['PURPLE', '8c46b8'], ['BLACK', '3a3d45'],
    ];
    for (const [key, base] of TINTS) {
      // glass is an alpha cutout and never wears the finish, exactly as the
      // clear pane above does not
      paint(TILE[`GLASS_${key}`], (p) => tintGlass(p, base));
      paint(TILE[`DYE_${key}`], (p) => dyeIcon(p, base));
    }

    // --- the four timbers after oak -----------------------------------------
    //
    // A species is a RECOLOUR, not a redraw. Every mark the style's own
    // timber carries — the grooves it hand-places down the bark, the growth
    // rings, the butt joints, the nails — stays exactly where it is, and only
    // the colour moves: each texel keeps its value RELATIVE to the style's
    // own bark or boards and takes the species' hue. Twelve styles' worth of
    // drawn wood therefore arrives on birch and spruce for nothing, and a
    // style nobody will ever author a fifth timber for still gets five woods
    // that look like they came out of the same forest.
    const HEXRE = /^[0-9a-fA-F]{6}$/;
    const hexOf = (c) => c
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
      .join('');
    // `srcY` is the reference this group of colours is measured against — the
    // style's bark for a trunk, its first board for sawn timber. Measuring
    // each colour against its own value instead would level every species out
    // at oak's brightness, which is the one thing birch must not do.
    const tintTo = (c, srcY, dst) =>
      hexOf(hex(dst).map((v) => v * (luma(hex(c)) / srcY)));
    const recolour = (v, srcY, dst) => {
      if (typeof v === 'string') {
        return HEXRE.test(v) ? tintTo(v, srcY, dst) : v;
      }
      if (Array.isArray(v)) return v.map((x) => recolour(x, srcY, dst));
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = recolour(v[k], srcY, dst);
        return o;
      }
      return v;                        // numbers: widths, offsets, counts
    };
    // Which half of the wood spec each key belongs to. `nails` is in neither:
    // a nail is iron whatever it is driven into.
    const BARK_KEYS = ['bark', 'bars', 'cells', 'blocks', 'lumps', 'chips',
      'grooves', 'knots', 'rim'];
    const TIMBER_KEYS = ['rings', 'pith', 'boards', 'boardLumps', 'boardChips'];

    const speciesLook = (sp) => {
      const W = L.wood;
      const barkY = Math.max(1, luma(hex(W.bark)));
      const woodY = Math.max(1, luma(hex(W.boards.colors[0])));
      const w = { ...W };
      for (const k of BARK_KEYS) {
        if (W[k] !== undefined) w[k] = recolour(W[k], barkY, sp.bark);
      }
      for (const k of TIMBER_KEYS) {
        if (W[k] !== undefined) w[k] = recolour(W[k], woodY, sp.wood);
      }
      return { ...L, wood: w };
    };

    // Bark first, sawn timber second. The four are picked to be countable
    // from across a room: one nearly white, one cold and dark, one orange,
    // one near black — value and hue both, because a set that varies only in
    // hue is a set nobody can tell apart at dusk.
    const WOODS = [
      { key: 'BIRCH', bark: 'e0dac9', wood: 'd9c691' },
      { key: 'SPRUCE', bark: '473222', wood: '86603a' },
      { key: 'ACACIA', bark: '6d5634', wood: 'b3672c' },
      { key: 'DARK', bark: '2c1f14', wood: '5b3d1f' },
    ];
    for (const sp of WOODS) {
      const SL = speciesLook(sp);
      fin(TILE[`LOG_SIDE_${sp.key}`], (p) => flatLogSide(p, SL), { side: true });
      fin(TILE[`LOG_TOP_${sp.key}`], (p) => flatLogTop(p, SL));
      fin(TILE[`PLANK_${sp.key}`], (p) => flatPlank(p, SL), { side: true });
    }

    // --- the item icons -----------------------------------------------------
    // The masks are authored on the 16-texel classic grid, so these are
    // painted there and blitted up by emit() — the same path every other
    // ingot in the hotbar takes. No sprite draws a random number.
    const spriteAt = (tile, rows, palette) => paint(tile, (p) => {
      const n = rows.length;
      for (let y = 0; y < n; y++) {
        const line = rows[y] || '';
        for (let x = 0; x < n; x++) {
          const c = palette[line[x]];
          if (c) p.set(x, y, c);
        }
      }
    }, rows.length);

    spriteAt(TILE.RAW_GOLD, S_LUMP, {
      D: PAL.goldOre[0].map((v) => v * 0.4), H: PAL.goldOre[0],
      M: PAL.goldOre[2], L: PAL.goldOre[3], S: PAL.goldOre[4],
    });
    spriteAt(TILE.GOLD_INGOT, S_INGOT, {
      D: hex('2e2007'), H: PAL.gold[0], M: PAL.gold[2],
      L: PAL.gold[3], S: PAL.gold[4],
    });
    spriteAt(TILE.BRASS_INGOT, S_INGOT, {
      D: hex('2b2408'), H: PAL.brass[0], M: PAL.brass[2],
      L: PAL.brass[3], S: PAL.brass[4],
    });
    // The brass rack, on the same five silhouettes every other tier wears. It
    // is the one tool set whose head is warm rather than grey, which is what
    // separates it from stone and iron at a glance in the hotbar.
    const BRASS_HEAD = {
      D: hex('241d06'), H: PAL.brass[0], M: PAL.brass[2],
      L: PAL.brass[3], S: PAL.brass[4],
    };
    for (const [tile, rows] of [
      [TILE.PICK_BRASS, S_PICK], [TILE.AXE_BRASS, S_AXE],
      [TILE.SHOVEL_BRASS, S_SHOVEL], [TILE.SWORD_BRASS, S_SWORD],
      [TILE.HOE_BRASS, S_HOE],
    ]) spriteAt(tile, rows, { ...BRASS_HEAD, ...HANDLE });

    // --- the lantern and the torch's head -----------------------------------
    //
    // Both lights used to be a full cube wearing TILE.TORCH on all six faces,
    // so a lantern and a torch were the SAME orange blob — reported from a
    // screenshot as "the torch is the same as the lantern". They are box
    // unions now (cubemesher's LANTERN_BOXES and TORCH_BOXES) and these are
    // the surfaces those unions are built out of, so telling them apart is a
    // matter of shape as well as of paint.
    //
    // Drawn UNLIT in spirit, like lava and the torch flame above it: `hotRamp`
    // floors the style's saturation and value, so a style that greys things
    // down cannot turn a light source into a brown rock.

    // The cage: dark iron round a glowing core, with two bars standing over
    // the glass. Painted edge to edge and worn WHOLE (emitBox's `whole`), not
    // cropped to the box the way a material tile is — a lantern is an object,
    // and the middle third of its texture is not a lantern.
    fin(TILE.LANTERN, (p) => {
      const H = hotRamp(L);
      const I = matRamp(MATBASE.iron, { ...L.mat, val: (L.mat.val ?? 1) * 0.7 }, 3);
      // the glass, brightest at the wick and cooling toward the frame
      p.fill(H[0]);
      rect(p, 4, 5, 24, 22, H[1]);
      rect(p, 9, 10, 14, 13, H[2]);
      rect(p, 12, 13, 8, 7, lighten(H[2], 1.25));       // the flame itself
      // the ironwork: a frame all round, a heavier band top and bottom, and
      // the two cage bars that are the whole reason this reads as a lantern
      rect(p, 0, 0, TS, 4, I[0]); rect(p, 0, TS - 4, TS, 4, I[0]);
      rect(p, 0, 0, 3, TS, I[0]); rect(p, TS - 3, 0, 3, TS, I[0]);
      rect(p, 0, 3, TS, 1, I[2]);                       // lit lip under the cap
      rect(p, 10, 4, 2, 24, I[1]); rect(p, 20, 4, 2, 24, I[1]);
      rect(p, 10, 4, 1, 24, I[2]); rect(p, 20, 4, 1, 24, I[2]);
      border(p, L.line);
    }, { flat: true });

    // The foot, the shoulder and the hanging bail: one plate of dark iron,
    // lit along its top edge. Small boxes, so it carries a rivet and nothing
    // finer — at four texels on screen anything else is noise.
    fin(TILE.LANTERN_CAP, (p) => {
      const I = matRamp(MATBASE.iron, { ...L.mat, val: (L.mat.val ?? 1) * 0.7 }, 5);
      p.fill(I[1]);
      plateEdge(p, 0, 0, TS, TS, { lit: I[3], dark: I[0] });
      rect(p, 12, 12, 8, 8, I[2]);
      plateEdge(p, 12, 12, 8, 8, { lit: I[4], dark: I[0] });
      border(p, L.line);
    }, { flat: true });

    // The torch's head: solid fire, no silhouette. The old torch tile was a
    // cutout because it had to be a whole torch on one square — stick and
    // flame both — and the mesher then hung that square on all six faces of a
    // cube. The stick is real geometry now, so this is only the burning bit.
    // `paint` and not `fin`, and no border: both would put a dark edge round
    // it, and this is the one tile in the atlas that must not have one.
    paint(TILE.FLAME, (p) => {
      const H = hotRamp(L);
      // ember at the rim and nowhere else: a wide dark edge on a box this
      // small is a border round a fire, and it made the head read as a tiny
      // lantern rather than as a flame
      p.fill(H[1]);
      rect(p, 0, 0, TS, 2, H[0]); rect(p, 0, TS - 2, TS, 2, H[0]);
      rect(p, 0, 0, 2, TS, H[0]); rect(p, TS - 2, 0, 2, TS, H[0]);
      rect(p, 5, 4, 22, 22, H[2]);
      rect(p, 10, 8, 12, 14, lighten(H[2], 1.35));
    });

    // --- copper, zinc, tin and bronze ---------------------------------------
    //
    // Last of all, and for the reason the whole of newTiles exists: `fin`'s
    // mottle and AO passes pull from a shared stream, so a painter inserted
    // ABOVE this point would re-roll the finish on every tile below it — the
    // gold ore, the storage blocks, the tinted glass, four timbers. At the
    // bottom it can move nothing.

    // Three ores in three vein layouts nobody else uses, so copper is not
    // iron in an orange coat and zinc is not silver in a blue one.
    fin(TILE.COPPER,
      (p) => flatOre(p, L, MATBASE.copperOre, 1.10, [0, 2, 5, 6]), { ao: 0.7 });
    fin(TILE.ZINC,
      (p) => flatOre(p, L, MATBASE.zincOre, 1.16, [1, 3, 4]), { ao: 0.7 });
    fin(TILE.TIN,
      (p) => flatOre(p, L, MATBASE.tinOre, 1.04, [0, 4, 5]), { ao: 0.7 });

    // The rest of the storage blocks, cast exactly as the first four are.
    fin(TILE.BLOCK_COPPER, (p) => metalBlock(p, MATBASE.copper, 1.08));
    fin(TILE.BLOCK_BRONZE, (p) => metalBlock(p, MATBASE.bronze, 1.12));
    fin(TILE.BLOCK_ZINC, (p) => metalBlock(p, MATBASE.zinc, 1.02));
    fin(TILE.BLOCK_TIN, (p) => metalBlock(p, MATBASE.tin));
    fin(TILE.BLOCK_SILVER, (p) => metalBlock(p, MATBASE.silver));

    // The chunks out of the rock and the ingots out of the furnace, on the
    // two masks every other material in the hotbar already wears.
    const oreLump = (tile, R) => spriteAt(tile, S_LUMP, {
      D: R[0].map((v) => v * 0.4), H: R[0], M: R[2], L: R[3], S: R[4],
    });
    oreLump(TILE.RAW_COPPER, PAL.copperOre);
    oreLump(TILE.RAW_ZINC, PAL.zincOre);
    oreLump(TILE.RAW_TIN, PAL.tinOre);

    // `dark` is the outline, not a ramp entry: at 32px in a hotbar the outline
    // is the only thing between a metal bar and an empty slot, so it sits
    // below the ramp's own floor rather than on it.
    const ingotOf = (tile, R, dark) => spriteAt(tile, S_INGOT, {
      D: hex(dark), H: R[0], M: R[2], L: R[3], S: R[4],
    });
    ingotOf(TILE.COPPER_INGOT, PAL.copper, '2b1408');
    ingotOf(TILE.BRONZE_INGOT, PAL.bronze, '241606');
    ingotOf(TILE.ZINC_INGOT, PAL.zinc, '17202a');
    ingotOf(TILE.TIN_INGOT, PAL.tin, '22221d');

    // The racks: seven shapes per metal, the same seven iron wears. Brass had
    // its five painted before the spear and the hammer existed, so it only
    // needs the two — and its five must not be repainted, or the metal that
    // has been in players' hotbars for a release would change colour.
    const RACK_SHAPES = [
      ['PICK', S_PICK], ['AXE', S_AXE], ['SHOVEL', S_SHOVEL],
      ['SWORD', S_SWORD], ['HOE', S_HOE], ['SPEAR', S_SPEAR],
      ['HAMMER', S_HAMMER],
    ];
    const rack = (key, R, dark, only) => {
      const head = { D: hex(dark), H: R[0], M: R[2], L: R[3], S: R[4] };
      for (const [shape, rows] of RACK_SHAPES) {
        if (only && !only.includes(shape)) continue;
        spriteAt(TILE[`${shape}_${key}`], rows, { ...head, ...HANDLE });
      }
    };
    rack('COPPER', PAL.copper, '2b1408');
    rack('BRONZE', PAL.bronze, '241606');
    rack('GOLD', PAL.gold, '2e2007');
    rack('BRASS', PAL.brass, '241d06', ['SPEAR', 'HAMMER']);

    // The golden apple: the classic apple's own silhouette, struck in gold.
    // Same shape to the texel on purpose — what makes this one read as the
    // rare version of a thing you already know is that it is the SAME thing,
    // in a metal, with a shine on it.
    paint(TILE.GOLDEN_APPLE, (p) => {
      p.each((x, y) => {
        const dx = (x - 7.5) / 5.6, dy = (y - 9.4) / 5.4;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        const lit = (-(x - 6) - (y - 8)) * 0.055;
        p.set(x, y, tone(PAL.gold, 0.55 + lit - d * 0.22, x, y));
      });
      for (let y = 2; y < 6; y++) p.set(8, y, PAL.bark[2]);
      p.set(8, 2, PAL.bark[3]);
      for (const [x, y] of [[9, 3], [10, 3], [10, 4], [11, 4], [9, 4]]) {
        p.set(x, y, tone(PAL.leaf, 0.7, x, y));
      }
      // the highlight is a hard two-texel glint rather than the apple's soft
      // one: soft is fruit, hard is polished metal
      for (const [x, y] of [[5, 7], [6, 7], [5, 8], [6, 6]]) {
        p.set(x, y, PAL.gold[4]);
      }
    }, CT);

    // The post: a sawn timber on end, narrow enough that the icon says
    // "thinner than a block" before the block itself has been placed.
    paint(TILE.POST, (p) => {
      const B = PAL.bark, W = PAL.plank;
      for (let y = 2; y < 15; y++) {
        p.set(5, y, B[0]); p.set(6, y, B[3]); p.set(7, y, B[2]);
        p.set(8, y, B[2]); p.set(9, y, B[1]); p.set(10, y, B[0]);
      }
      // the cut ends: pale end grain at the top, a dark foot at the bottom,
      // both a texel wider than the shaft so the post reads as squared timber
      for (let x = 4; x <= 11; x++) {
        p.set(x, 1, W[3]); p.set(x, 2, W[1]); p.set(x, 15, B[0]);
      }
      p.set(4, 1, W[1]); p.set(11, 1, W[0]);
    }, CT);

    // --- cement -------------------------------------------------------------
    //
    // The one material in the atlas with no texture in it. Every other block
    // here is marks on a palette — stones, boards, courses, veins — and cement
    // is the opposite of all of them: a solid field of saturated colour, matte,
    // with nothing that reads as grain. That is the whole reason to build with
    // it, and it is why it wears no mottle, no gradient and no relief.
    //
    // What keeps a flat field from reading as a missing texture is a scatter of
    // 3x3 patches a hair either side of the base — seven percent of value, far
    // less than any ramp step, so it is a matte finish rather than a pattern.
    // The positions are FIXED, not rolled: this painter draws no random number
    // and so cannot move a mark on any tile painted before it.
    const CEMENT_SPECKS = [
      [2, 5], [12, 2], [24, 7], [7, 14], [19, 17], [29, 21], [4, 25], [15, 27],
      [26, 29], [9, 9],
    ];
    const cementFace = (p, base) => {
      const c = restyle(base, {
        ...L.mat, sat: Math.max(L.mat.sat ?? 1, 1.25), gap: 1,
      });
      const lo = darken(c, 0.93), hi = lighten(c, 1.07);
      p.fill(c);
      CEMENT_SPECKS.forEach(([x, y], i) => rect(p, x, y, 3, 3, i & 1 ? lo : hi));
      border(p, L.line);
    };
    // the same eight bases the glass and the dye already share, so a red wall
    // and the red window in it are one colour decided once
    for (const [key, base] of TINTS) {
      paint(TILE[`CEMENT_${key}`], (p) => cementFace(p, base));
    }
    // ...and the three greys the city towers are poured in, between the
    // family's own white and black
    for (const [key, base] of [['CEMENT_GREY_LIGHT', 'b7bac0'],
      ['CEMENT_GREY', '898d94'], ['CEMENT_GREY_DARK', '5b5e66']]) {
      paint(TILE[key], (p) => cementFace(p, base));
    }

    // --- wool, and the bed it makes ------------------------------------------
    //
    // Ten fleeces: the eight the dyes make, then brown and grey, which no dye
    // makes and only a sheep does. The eight share the glass and cement bases
    // exactly, so a red bed and a red window are one colour decided once; the
    // two naturals are the muddy, desaturated browns and greys real fleece
    // actually comes in, and they are deliberately duller than anything a
    // bottle produces.
    const WOOL_BASES = [...TINTS, ['BROWN', '8a6a4a'], ['GREY', '8e9099']];

    // A fleece is CURL, not grain: overlapping soft lumps with no direction to
    // them. Twenty-one fixed clusters — fixed, so this painter draws no random
    // number and cannot move a mark on any tile painted before it — each a
    // 4x4 block with a 2x2 highlight up and left of it, which is the smallest
    // thing that reads as a tuft with a lit side rather than as a speck.
    const CURLS = [
      [1, 2], [8, 0], [15, 3], [22, 1], [28, 5], [4, 8], [11, 7], [18, 9],
      [25, 11], [30, 14], [0, 13], [7, 15], [14, 16], [21, 18], [27, 21],
      [3, 22], [10, 23], [17, 25], [24, 27], [30, 28], [6, 29],
    ];
    const woolFace = (p, base) => {
      // Wool is a dyed fibre, not a mineral: it takes the style's material
      // treatment like everything else, but a full-saturation cement red on a
      // fleece reads as plastic. Pull the saturation back and lift the value.
      const c = restyle(base, { ...L.mat, sat: (L.mat.sat ?? 1) * 0.86,
        val: (L.mat.val ?? 1) * 1.04, gap: 1 });
      const lo = darken(c, 0.88), mid = lighten(c, 1.05), hi = lighten(c, 1.14);
      p.fill(c);
      CURLS.forEach(([x, y], i) => {
        rect(p, x, y, 4, 4, i % 3 ? lo : mid);
        rect(p, x, y, 2, 2, hi);
      });
      border(p, L.line);
    };
    for (const [key, base] of WOOL_BASES) {
      paint(TILE[`WOOL_${key}`], (p) => woolFace(p, base));
    }

    // The bed icon: a cot seen from the side, drawn on the item grid. The
    // pillow is at the LEFT, which is the end the block calls its head, so the
    // icon and the thing you place agree about which way round a bed is.
    const bedIcon = (p, base) => {
      const c = hex(base);
      const dk = darken(c, 0.78), lt = lighten(c, 1.16);
      const W = PAL.plank, B = PAL.bark;
      // the frame: a headboard, a low footboard, and two feet
      rect(p, 1, 4, 2, 9, W[2]);
      rect(p, 1, 4, 2, 2, W[3]);
      rect(p, 13, 8, 2, 5, W[1]);
      rect(p, 2, 13, 2, 2, B[1]);
      rect(p, 12, 13, 2, 2, B[1]);
      // the mattress, and a fold of blanket along the top of it
      rect(p, 3, 9, 10, 4, c);
      rect(p, 3, 9, 10, 1, lt);
      rect(p, 3, 12, 10, 1, dk);
      // the pillow, always undyed linen: it is what tells the eye "bed" at
      // hotbar size, and a pillow the same colour as the blanket loses it
      rect(p, 3, 6, 4, 3, hex('efeadd'));
      rect(p, 3, 6, 4, 1, hex('ffffff'));
      rect(p, 3, 8, 4, 1, hex('c9c3b3'));
    };
    for (const [key, base] of WOOL_BASES) {
      paint(TILE[`BED_${key}`], (p) => bedIcon(p, base), CT);
    }

    // --- what a shop is paid in ------------------------------------------------
    //
    // THE COIN. It is the one number the whole game is scored on, so it is
    // worth the texels.
    //
    // A struck coin reads by its RIM and its RELIEF, not by being yellow, and
    // almost nothing in here is colour. It is four rings — a milled edge, a
    // raised rim, the step DOWN off that rim, and the field inside it — with a
    // device struck proud of the field. Every one of them is the same one
    // trick: the light tone on the side facing up-left, the dark tone on the
    // side facing away, and the eye assembles a solid out of the two crescents.
    // That is also why it survives being eight pixels across in a hotbar slot,
    // where none of the detail is legible and the crescents still are.
    //
    // The step is the band that is lit BACKWARDS, and it is the whole reason
    // the rim reads as standing up: the inside wall of a recess faces away
    // from the light exactly where the outside of the rim faces toward it.
    // Shade it the same way round as the rim and the coin goes back to being a
    // flat yellow spot with a line round it.
    //
    // Drawn on the FULL 32-texel grid, not the 16 the other item icons use.
    // A disc is the one shape that cannot be faked at 16: a rim, a step and a
    // device is three rings, and three rings inside a radius of seven is one
    // ring — which is what the old coin was.
    paint(TILE.COIN, (p) => {
      const G = PAL.gold;
      // one step past each end of the ramp: the shadow a rim throws on its own
      // underside, and the point of white a polished edge catches
      const DP = darken(G[0], 0.74), SP = lighten(G[4], 1.18);
      const C = 15.5, R = 14.6;
      const LX = -0.707, LY = -0.707;      // up and left, as every icon here
      const MILL = R - 2.1, RIM = R - 4.4, STEP = R - 5.8;
      p.each((x, y) => {
        const dx = x - C, dy = y - C;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > R) return;
        const lit = (dx * LX + dy * LY) / (d || 1);   // +1 at the light, -1 away
        let c;
        if (d > MILL) {
          // THE MILLING: forty-four ticks round the edge, which at this radius
          // is one bright texel and one dark one alternating. It is the detail
          // that says a coin was struck between dies rather than poured into a
          // mould, and it is the first thing that survives being shrunk.
          const a = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
          const tick = ((a * 44) | 0) & 1;
          c = lit > 0.15 ? (tick ? SP : G[3])
            : lit > -0.45 ? (tick ? G[3] : G[1])
              : (tick ? G[1] : DP);
        } else if (d > RIM) {
          c = lit > 0.4 ? G[4] : lit > -0.1 ? G[3] : lit > -0.65 ? G[1] : G[0];
        } else if (d > STEP) {
          c = lit > 0.2 ? G[0] : lit > -0.3 ? G[1] : G[3];
        } else {
          // the field: barely graded, because it is the ground the device
          // stands on and a busy field is a device nobody can see
          c = lit > 0.1 ? G[2] : G[1];
        }
        p.set(x, y, c);
      });

      // THE DEVICE: a sun, because that is what this world's money would put
      // on its money — and because a boss with spokes is the one emblem that
      // is still an emblem when it is four texels wide.
      //
      // The spokes TAPER. A spoke of constant width is a cog; one that narrows
      // as it goes out is a ray of light, and the difference is two texels at
      // the tip. They also have to be thin enough at the root that eight of
      // them do not meet each other: the circumference at the boss is twenty
      // texels, so anything over a texel either side of the centreline is not
      // a sun, it is a ring.
      const BOSS = 3.5, OUT = 8.2;
      const inSun = (dx, dy) => {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= BOSS) return 2;
        if (d > OUT) return 0;
        const a = Math.atan2(dy, dx);
        const arc = Math.abs(a - Math.round(a / (Math.PI / 4)) * (Math.PI / 4)) * d;
        return arc <= 1.15 - 0.8 * ((d - BOSS) / (OUT - BOSS)) ? 1 : 0;
      };
      // Struck PROUD of the field: the whole emblem laid down once in shadow a
      // texel down and right, then again on top in the light tone. That offset
      // pair is the cheapest relief there is and the only one that still reads
      // when the coin is eight pixels wide — shading a one-texel spoke edge by
      // edge goes to mush at that size, which is what the first attempt did.
      const stamp = [];
      p.each((x, y) => {
        const k = inSun(x - C, y - C);
        if (k) stamp.push([x, y, k]);
      });
      for (const [x, y] of stamp) {
        const dx = x + 1 - C, dy = y + 1 - C;
        if (dx * dx + dy * dy < STEP * STEP) p.set(x + 1, y + 1, G[0]);
      }
      for (const [x, y, k] of stamp) {
        const dx = x - C, dy = y - C;
        const q = Math.sqrt(dx * dx + dy * dy);
        const l = (dx * LX + dy * LY) / (q || 1);
        // The emblem is struck in the TOP of the ramp against a field that
        // sits two tones under it, and the shadow it throws is the bottom of
        // the ramp. Three tones, two of them at the ends: that spread is what
        // survives the shrink, and a device shaded across the same two mid
        // tones the field is drawn in is a device you can only see at 6x.
        // The boss keeps a dark underside so the middle of the coin is a dome
        // and not a counter.
        p.set(x, y, k === 2 && q > BOSS - 1.5 && l < -0.45 ? G[2] : G[4]);
      }
    });

    // --- and what strikes it ---------------------------------------------------
    //
    // THE MINT. A screw press: a stone bed, two uprights, a head, a screw with
    // a weighted fly bar on top of it, and a punch on the end of the screw
    // that comes down on the blank. Two tiles — the machine, and the die.

    // The striking bed, seen from above: an iron collar with a blank lying in
    // it waiting for the punch. It is the one face of the press that is not
    // plain metal, and the only part of the machine anybody ever looks at, so
    // the gold has to be dead centre — the mesher crops this tile to the box
    // that wears it, and that box is the middle two-fifths of the cell.
    paint(TILE.MINT_DIE, (p) => {
      const I = PAL.iron, G = PAL.gold;
      const C = 15.5, LX = -0.707, LY = -0.707;
      p.each((x, y) => {
        const dx = x - C, dy = y - C;
        const d = Math.sqrt(dx * dx + dy * dy);
        const lit = (dx * LX + dy * LY) / (d || 1);
        // the collar, and the rim of the socket the blank sits down in — lit
        // backwards, because the inside of a hole faces away from the light
        p.set(x, y, d > 11.5 ? I[1]
          : d > 8.6 ? (lit > 0 ? I[0] : I[3]) : I[2]);
        if (d > 7.4) return;
        p.set(x, y, d > 6.2 ? (lit > 0.1 ? G[4] : G[1])
          : lit > -0.3 ? G[3] : G[2]);
      });
    });

    // ...and the press itself, as a side elevation: the item icon, and what a
    // hotbar slot has to say "machine" with. The silhouette is doing the work
    // — a heavy top on two legs with something small and gold underneath it —
    // because at this size nothing else can.
    paint(TILE.MINT, (p) => {
      const I = PAL.iron, G = PAL.gold, S = PAL.stone;
      // the fly bar and its two weights: what a screw press is turned by, and
      // the only part of it that overhangs, which is what stops the icon
      // reading as a doorway
      rect(p, 2, 3, 28, 3, I[2]);
      rect(p, 2, 3, 28, 1, I[3]);
      rect(p, 0, 1, 5, 7, I[1]);
      rect(p, 27, 1, 5, 7, I[1]);
      rect(p, 0, 1, 5, 1, I[3]);
      rect(p, 27, 1, 5, 1, I[3]);
      // the head, and the two uprights carrying it
      rect(p, 5, 7, 22, 4, I[2]);
      rect(p, 5, 7, 22, 1, I[4]);
      rect(p, 5, 10, 22, 1, I[0]);
      rect(p, 4, 11, 3, 15, I[1]);
      rect(p, 25, 11, 3, 15, I[1]);
      rect(p, 4, 11, 1, 15, I[3]);
      rect(p, 27, 11, 1, 15, I[0]);
      // the screw, threaded, and the punch on the end of it
      rect(p, 14, 11, 4, 6, I[2]);
      for (let y = 12; y < 17; y += 2) rect(p, 14, y, 4, 1, I[0]);
      rect(p, 12, 17, 8, 3, I[3]);
      rect(p, 12, 19, 8, 1, I[0]);
      // the blank on the bed, which is the whole reason for the machine
      disc(p, 15.5, 22, 3.2, G[2]);
      disc(p, 15.5, 22, 2.0, G[4]);
      // the iron bed, and the stone it is bolted to
      rect(p, 9, 24, 14, 2, I[2]);
      rect(p, 9, 24, 14, 1, I[4]);
      rect(p, 3, 26, 26, 5, S[2]);
      rect(p, 3, 26, 26, 1, S[3]);
      rect(p, 3, 30, 26, 1, S[0]);
    });

    // Shears: two blades crossed on a sprung bow, which is what a pair of
    // sheep shears actually is — one piece of steel, not two handles on a
    // pivot. The bow at the right is the whole silhouette.
    paint(TILE.SHEARS, (p) => {
      const I = PAL.iron;
      // the two blades, running down-left, with a lit edge along the top
      for (let i = 0; i < 9; i++) {
        p.set(2 + i, 4 + ((i * 0.35) | 0), I[1]);
        p.set(2 + i, 5 + ((i * 0.35) | 0), I[3]);
        p.set(2 + i, 10 - ((i * 0.35) | 0), I[1]);
        p.set(2 + i, 9 - ((i * 0.35) | 0), I[3]);
      }
      // the bow: a squared U joining the two backs
      for (let y = 6; y <= 9; y++) p.set(13, y, I[2]);
      p.set(12, 5, I[2]); p.set(12, 10, I[2]);
      p.set(11, 5, I[3]); p.set(11, 10, I[1]);
      // the rivet-bright point where the blades cross
      p.set(3, 7, I[4]); p.set(2, 7, I[4]);
    }, CT);

    // --- the badges over a stockroom's bays ---------------------------------
    //
    // Wool told you which bay was which by colour, which is a legend you have
    // to learn and then remember in a dark cellar. A badge tells you by
    // PICTURE: a brick for building, a pick for tools, a blade for weapons, a
    // helm for armour, a loaf for food, an ingot for materials.
    //
    // All six share a plaque — a dark ground with a light bevel down two sides
    // — so the row reads as one set of signs rather than as six stray icons,
    // and the emblem sits in the middle of it at half scale.
    const badge = (tile, draw) => paint(tile, (p) => {
      const G = hex('2b2620'), L = hex('4a4139'), D = hex('17130f');
      p.each((x, y) => p.set(x, y, G));
      for (let i = 0; i < 16; i++) {
        p.set(i, 0, L); p.set(0, i, L);
        p.set(i, 15, D); p.set(15, i, D);
      }
      draw(p);
    }, CT);

    // a brick, laid: two courses with the joint offset, which is the one mark
    // that says masonry at this size
    badge(TILE.BADGE_BUILDING, (p) => {
      const B = PAL.brick, M = PAL.mortar;
      for (let y = 4; y <= 11; y++) for (let x = 3; x <= 12; x++) p.set(x, y, B[2]);
      for (let x = 3; x <= 12; x++) p.set(x, 7, M[2]);
      for (let y = 4; y <= 6; y++) { p.set(7, y, M[2]); p.set(8, y, M[2]); }
      for (let y = 8; y <= 11; y++) { p.set(4, y, M[2]); p.set(11, y, M[2]); }
      for (let x = 3; x <= 12; x++) p.set(x, 4, B[3]);
    });

    // a pick: a haft up the middle and a head curving across the top
    badge(TILE.BADGE_TOOLS, (p) => {
      const I = PAL.iron, W = PAL.plank;
      for (let y = 6; y <= 13; y++) { p.set(8, y, W[2]); p.set(9, y, W[1]); }
      for (const [x, y] of [[3, 6], [4, 5], [5, 4], [6, 4], [7, 4], [8, 4],
        [9, 4], [10, 4], [11, 4], [12, 5], [13, 6]]) p.set(x, y, I[3]);
      for (const [x, y] of [[3, 7], [4, 6], [5, 5], [11, 5], [12, 6], [13, 7]]) {
        p.set(x, y, I[1]);
      }
    });

    // a blade, point up, with a crossguard and a bound grip
    badge(TILE.BADGE_WEAPONS, (p) => {
      const I = PAL.iron, W = PAL.bark, G = PAL.gold;
      for (let y = 3; y <= 9; y++) { p.set(7, y, I[3]); p.set(8, y, I[1]); }
      p.set(7, 2, I[4]); p.set(8, 2, I[3]);
      for (let x = 4; x <= 11; x++) p.set(x, 10, G[2]);
      for (let y = 11; y <= 13; y++) { p.set(7, y, W[1]); p.set(8, y, W[2]); }
      p.set(7, 14, G[2]); p.set(8, 14, G[2]);
    });

    // a helm: a domed cap with a brim and a dark slit for the eyes
    badge(TILE.BADGE_ARMOUR, (p) => {
      const I = PAL.iron, D = hex('12100d');
      for (let y = 4; y <= 11; y++) {
        const w = y < 6 ? 3 : y < 10 ? 5 : 4;
        for (let x = 8 - w; x <= 7 + w; x++) p.set(x, y, I[2]);
      }
      for (let x = 2; x <= 13; x++) { p.set(x, 11, I[3]); p.set(x, 12, I[1]); }
      for (let x = 5; x <= 10; x++) p.set(x, 8, D);
      for (let y = 4; y <= 9; y++) p.set(5, y, I[4]);
    });

    // a loaf, scored across the top the way a baker scores one
    badge(TILE.BADGE_FOOD, (p) => {
      const C = ramp('6b4423', '8a5a2e', 'a8743d', 'c79350', 'e0b273');
      for (let y = 5; y <= 12; y++) {
        const w = y < 7 ? 4 : 6;
        for (let x = 8 - w; x <= 7 + w; x++) p.set(x, y, C[y < 8 ? 3 : 2]);
      }
      for (let x = 2; x <= 13; x++) p.set(x, 5, C[4]);
      for (const x of [5, 8, 11]) { p.set(x, 4, C[1]); p.set(x - 1, 5, C[1]); }
    });

    // an ingot: a trapezium of metal with a lit top face
    badge(TILE.BADGE_MATERIALS, (p) => {
      const I = PAL.copper ?? PAL.iron;
      for (let y = 6; y <= 11; y++) {
        const w = 4 + (y - 6);
        for (let x = 8 - w; x <= 7 + w; x++) p.set(x, y, I[y < 8 ? 3 : 2]);
      }
      for (let x = 4; x <= 11; x++) p.set(x, 6, I[4]);
      for (let x = 2; x <= 13; x++) p.set(x, 11, I[1]);
    });

    // --- what hangs in a frame ------------------------------------------------
    //
    // Eight pictures, painted at the full 32 grid. Every one is built the same
    // way: a ground, a horizon, and two or three shapes on it. They are meant
    // to read from across a room at the size of one block, so nothing here is
    // finer than a couple of texels, and each one commits to ONE silhouette —
    // a sail, a peak, a face — rather than to a scene.
    const picture = (tile, fn) => paint(tile, (p) => {
      fn(p);
      // every canvas gets the same dark edge, so a frame's picture stops at
      // the frame instead of bleeding into the wood
      const E = hex('1a1712');
      for (let i = 0; i < TS; i++) {
        p.set(i, 0, E); p.set(i, TS - 1, E);
        p.set(0, i, E); p.set(TS - 1, i, E);
      }
    });
    const band = (p, y0, y1, c) => {
      for (let y = y0; y <= y1; y++) for (let x = 0; x < TS; x++) p.set(x, y, c);
    };

    // HILLS. Two green ridges under a high sky, a sun over them.
    picture(TILE.ART_LAND, (p) => {
      const S = ramp('6ea8d8', '8cc0e6', 'a9d4f0'), G = PAL.grass;
      band(p, 0, 31, S[2]);
      band(p, 0, 10, S[1]);
      disc(p, 23, 8, 3.4, hex('f2e08a'));
      for (let x = 0; x < TS; x++) {
        const h = 20 - Math.round(4 * Math.sin(x * 0.22));
        for (let y = h; y < TS; y++) p.set(x, y, G[y === h ? 4 : 2]);
      }
      for (let x = 0; x < TS; x++) {
        const h = 25 - Math.round(3 * Math.sin(x * 0.31 + 2));
        for (let y = h; y < TS; y++) p.set(x, y, G[y === h ? 3 : 1]);
      }
    });

    // THE SEA. A sail on a flat horizon, and the light broken on the water.
    picture(TILE.ART_SEA, (p) => {
      const S = ramp('7fb2d8', 'a8cde8'), W = ramp('16406b', '1e5588', '2a6ea8');
      band(p, 0, 15, S[1]); band(p, 0, 6, S[0]);
      band(p, 16, 31, W[1]);
      for (let y = 18; y < TS; y += 3) {
        for (let x = (y * 5) % 7; x < TS; x += 6) {
          p.set(x, y, W[2]); p.set(x + 1, y, W[2]);
        }
      }
      // the hull and two sails
      for (let x = 11; x <= 20; x++) p.set(x, 16, hex('3a2a1c'));
      for (let x = 12; x <= 19; x++) p.set(x, 15, hex('4d3722'));
      for (let y = 6; y <= 14; y++) {
        for (let x = 16; x <= 15 + (y - 4) / 2; x++) p.set(x, y, hex('efe7d6'));
        for (let x = 15 - (y - 5) / 3; x <= 14; x++) p.set(x, y, hex('d8cfbc'));
      }
      for (let y = 5; y <= 16; y++) p.set(15, y, hex('3a2a1c'));
    });

    // THE PEAK. One mountain, snow on it, a hard shadow down one flank.
    picture(TILE.ART_PEAK, (p) => {
      const S = ramp('4a6d92', '6b8db0'), R = PAL.stone, W = ramp('dfe8f2', 'ffffff');
      band(p, 0, 31, S[1]); band(p, 0, 9, S[0]);
      for (let x = 0; x < TS; x++) {
        const d = Math.abs(x - 15);
        const h = 6 + d * 1.25;
        for (let y = Math.round(h); y < TS; y++) {
          const snow = y < h + 6;
          p.set(x, y, snow ? W[x > 15 ? 0 : 1] : R[x > 15 ? 1 : 3]);
        }
      }
      band(p, 28, 31, PAL.leaf[1]);
    });

    // A FACE. A portrait on a dark ground — the one picture in the set that
    // is looking back at you, which is why a hall wants one.
    picture(TILE.ART_FACE, (p) => {
      const B = hex('2a2119'), SK = ramp('8a5e40', 'b07f57', 'd0a077'),
        H = hex('3a2313'), C = hex('6d2230');
      band(p, 0, 31, B);
      for (let y = 20; y < TS; y++) {
        for (let x = 7; x <= 24; x++) p.set(x, y, C);
      }
      for (let y = 7; y <= 21; y++) {
        const w = y < 9 ? 5 : y > 19 ? 4 : 7;
        for (let x = 16 - w; x <= 15 + w; x++) p.set(x, y, SK[x < 16 ? 2 : 1]);
      }
      for (let y = 5; y <= 10; y++) {
        for (let x = 8; x <= 23; x++) if (y < 8 || x < 11 || x > 20) p.set(x, y, H);
      }
      p.set(12, 13, B); p.set(13, 13, B); p.set(18, 13, B); p.set(19, 13, B);
      for (let x = 13; x <= 18; x++) p.set(x, 18, hex('6b3b30'));
    });

    // STILL LIFE. A jug and an apple on a board, which is the oldest subject
    // in painting and the easiest one to read at sixteen texels.
    picture(TILE.ART_STILL, (p) => {
      const B = hex('3b3227'), T = PAL.plank, J = ramp('4a5a68', '6b7d8c'),
        A = ramp('7a1a1c', 'a82a26');
      band(p, 0, 31, B);
      band(p, 23, 26, T[3]); band(p, 27, 31, T[1]);
      for (let y = 10; y <= 22; y++) {
        const w = y < 13 ? 3 : y < 16 ? 4 : 6;
        for (let x = 11 - w; x <= 10 + w; x++) p.set(x, y, J[x < 11 ? 1 : 0]);
      }
      for (let y = 12; y <= 17; y++) { p.set(17, y, J[0]); p.set(18, y, J[1]); }
      disc(p, 23, 19, 4, A[1]);
      disc(p, 22, 18, 1.4, A[1].map((v) => Math.min(255, v * 1.35)));
      p.set(23, 14, hex('3d5a22')); p.set(23, 13, hex('3d5a22'));
    });

    // NIGHT. A moon and stars over a black ridge — the one dark picture, so a
    // wall of them is not a wall of daylight.
    picture(TILE.ART_NIGHT, (p) => {
      const N = ramp('0d1024', '141a3a', '1e2650');
      band(p, 0, 31, N[1]); band(p, 0, 8, N[0]);
      disc(p, 22, 8, 4, hex('e8e6cf'));
      disc(p, 20, 7, 3.4, N[0]);
      for (const [x, y] of [[4, 4], [9, 8], [6, 13], [13, 5], [27, 15],
        [17, 10], [29, 5], [11, 18], [3, 20]]) p.set(x, y, hex('cfd4ee'));
      for (let x = 0; x < TS; x++) {
        const h = 22 - Math.round(3 * Math.sin(x * 0.19 + 1));
        for (let y = h; y < TS; y++) p.set(x, y, N[y === h ? 2 : 0]);
      }
    });

    // THE FIELD. Furrows of ripe wheat running to a low horizon — a picture
    // of the thing the village actually lives on.
    picture(TILE.ART_FIELD, (p) => {
      const S = ramp('86b6d6', 'b4d4ea'), W = ramp('8a6a20', 'b08c2c', 'd4b348',
        'ecd77a');
      band(p, 0, 10, S[1]); band(p, 0, 4, S[0]);
      band(p, 11, 31, W[1]);
      for (let y = 12; y < TS; y++) {
        const step = 1 + ((y - 12) >> 2);
        for (let x = ((y * 3) % (step + 2)); x < TS; x += step + 2) {
          p.set(x, y, W[2]);
          if (y > 20) p.set(x, y - 1, W[3]);
        }
      }
      for (let x = 0; x < TS; x++) p.set(x, 11, W[3]);
    });

    // THE BEAST. A wolf's head in silhouette against a pale ground, which is
    // what the people who keep the flocks would put on a wall.
    picture(TILE.ART_BEAST, (p) => {
      const G = ramp('c9c2ae', 'ded8c6'), D = hex('2b2a2c'), E = hex('c9a227');
      band(p, 0, 31, G[1]); band(p, 0, 9, G[0]);
      // muzzle, skull and two ears, as one blocky silhouette
      for (let y = 12; y <= 26; y++) {
        const w = y < 15 ? 6 : y < 21 ? 9 : 7 - ((y - 21) >> 1);
        for (let x = 16 - w; x <= 15 + w; x++) p.set(x, y, D);
      }
      for (let y = 5; y <= 12; y++) {
        const w = (y - 4) >> 1;
        for (let x = 9 - w; x <= 9 + w; x++) p.set(x, y, D);
        for (let x = 22 - w; x <= 22 + w; x++) p.set(x, y, D);
      }
      p.set(12, 17, E); p.set(13, 17, E); p.set(18, 17, E); p.set(19, 17, E);
      for (let x = 14; x <= 17; x++) p.set(x, 26, G[0]);
    });

    // --- paper, and a book --------------------------------------------------
    // Both are hotbar icons, so both are drawn on the 16-texel grid the rest
    // of the item art is authored on and blitted up by emit().
    paint(TILE.PAPER, (p) => {
      const D = hex('6f6959'), M = hex('cec7b4'), W = hex('f0ecdf'),
        S = hex('fdfbf4');
      // three sheets, each sitting up and left of the one under it
      for (let i = 0; i < 3; i++) {
        const x = 4 - i, y = 9 - i * 2;
        rect(p, x, y, 9, 5, i === 2 ? W : M);
        for (let k = -1; k <= 9; k++) { p.set(x + k, y - 1, D); p.set(x + k, y + 5, D); }
        for (let k = -1; k <= 5; k++) { p.set(x - 1, y + k, D); p.set(x + 9, y + k, D); }
      }
      for (let k = 0; k < 8; k++) p.set(2 + k, 5, S);
    }, CT);

    // A closed book seen side on: a coloured cover, a darker spine down its
    // left and the cream block of page edges at its right. Those page edges
    // are what stops the icon reading as a coloured card.
    paint(TILE.BOOK, (p) => {
      const C = hex('8f2a22'), Cd = hex('5a150e'), Cl = hex('b8483a');
      const P = hex('efe8d2'), Pd = hex('bfb69b'), D = hex('221008');
      rect(p, 3, 2, 10, 12, C);
      rect(p, 3, 2, 3, 12, Cd);
      rect(p, 4, 3, 1, 10, Cl);
      rect(p, 10, 3, 3, 10, P);
      for (let y = 4; y < 13; y += 2) rect(p, 10, y, 3, 1, Pd);
      rect(p, 7, 6, 2, 2, hex('e8c860'));                     // the clasp
      for (let x = 2; x <= 13; x++) { p.set(x, 1, D); p.set(x, 14, D); }
      for (let y = 1; y <= 14; y++) { p.set(2, y, D); p.set(13, y, D); }
    }, CT);

    // The shelf. It has to read as BOOKS from the far side of a room, so the
    // spines are the whole design: the style's own boards for the frame, two
    // recesses cut into them, and eight bars of colour standing in each. Bars
    // three texels wide and ten or eleven tall are the smallest mark that
    // still counts as a book at room distance — anything finer averages to a
    // brown smear, which is what the shrink test catches every time.
    //
    // The plank's finish is applied by hand rather than by `fin` because it
    // has to land on the BOARDS and not on the books: mottle over a row of
    // spines is noise on the only marks the tile exists to show.
    const SPINES = ['8f2a22', '2b4d8f', 'b58a1f', '2f6b32', '6b3a8f', 'a8a094'];
    fin(TILE.BOOKSHELF, (p) => {
      flatPlank(p, L);
      if (L.mottle) for (const s of [].concat(L.mottle)) mottlePass(p, s);
      if (L.grad) gradPass(p, L.grad);
      const back = darken(matRamp(MATBASE.mortar, L.mat, 1)[0], 0.5);
      for (const [y0, y1, phase] of [[4, 15, 0], [17, 28, 3]]) {
        rect(p, 0, y0, TS, y1 - y0, back);
        for (let i = 0; i < 8; i++) {
          const x = 1 + i * 4;
          const c = hex(SPINES[(i + phase) % SPINES.length]);
          // every third book is a little short, so the row has a top edge
          // that is not a ruled line
          const h = (i % 3 === 1) ? y1 - y0 - 3 : y1 - y0 - 1;
          rect(p, x, y1 - h, 3, h, c);
          const lit = lighten(c, 1.4);
          for (let k = 0; k < h; k++) p.set(x, y1 - h + k, lit);
        }
      }
      border(p, L.line);
    }, { flat: true });

    // --- the doors ----------------------------------------------------------
    //
    // A leaf in two halves. Both are worn WHOLE (emitBox's `whole`), because a
    // door is an object and not a slice of a material: the crop that gives a
    // slab the bottom half of its stone would give the upper half of a door
    // the tile's own upper half, which is a door with two handles on it.
    //
    // The panel is the whole design. A flat board with a knob reads as a board
    // with a knob; a board with a SUNK rectangle in it — lit along its bottom
    // and right, dark along its top and left, which is the inverse of every
    // raised plate in this file — reads as joinery from across a room.
    const doorPanel = (p, R, x, y, w, h) => {
      rect(p, x, y, w, h, R.mid);
      plateEdge(p, x, y, w, h, { lit: R.dark, dark: R.lit });   // sunk
      plateEdge(p, x + 1, y + 1, w - 2, h - 2, { lit: R.lit, dark: R.dark });
    };
    // the stiles: a door's own frame, and what stops two leaves in a row
    // reading as one long fence
    const doorFrame = (p, R) => {
      for (let i = 0; i < TS; i++) {
        p.set(0, i, R.dark); p.set(1, i, R.lit);
        p.set(TS - 1, i, R.dark); p.set(TS - 2, i, R.dark);
      }
    };
    const woodTones = (SL) => {
      const b = hex(SL.wood.boards.colors[0]);
      return { mid: b, lit: lighten(b, 1.3), dark: darken(b, 0.6) };
    };
    // The furniture is IRON on every leaf, including the iron one. A handle
    // drawn out of the door's own timber is invisible on the dark species —
    // which is exactly what the first pass of these tiles did — and a handle
    // is the one mark that says "this opens" rather than "this is a panel".
    const doorIron = matRamp(MATBASE.iron,
      { ...L.mat, sat: Math.max(L.mat.sat ?? 1, 1), gap: (L.mat.gap ?? 1) * 1.3 },
      5);
    // bottom half: one tall panel and the handle, which sits at the TOP of
    // this tile because the top of the lower cell is the middle of the door
    const doorBot = (p, R, draw) => {
      draw(p);
      doorFrame(p, R);
      doorPanel(p, R, 5, 6, 18, 22);
      rect(p, 25, 5, 5, 9, doorIron[1]);                   // the backplate
      plateEdge(p, 25, 5, 5, 9, { lit: doorIron[3], dark: doorIron[0] });
      rect(p, 23, 8, 7, 3, doorIron[2]);                   // the lever
      rect(p, 23, 8, 7, 1, doorIron[4]);
      rect(p, 23, 10, 7, 1, doorIron[0]);
      border(p, L.line);
    };
    const doorTop = (p, R, draw, window) => {
      draw(p);
      doorFrame(p, R);
      if (window) {
        // Glazing, painted OPAQUE. This leaf rides in the solid, alpha-tested
        // pass with every other door, and under a hard cut there is no such
        // thing as a half-there texel — a real wash would simply vanish. So
        // the pane is glass-COLOURED with the two reflections clear glass
        // wears, which is what the eye reads as glass anyway.
        const G = matRamp(MATBASE.glass,
          { ...L.mat, sat: Math.max(L.mat.sat ?? 1, 1) }, 5);
        rect(p, 5, 5, 22, 23, G[2]);
        plateEdge(p, 5, 5, 22, 23, { lit: R.dark, dark: R.lit });
        rect(p, 8, 8, 11, 2, G[4]); rect(p, 8, 8, 2, 11, G[4]);
        rect(p, 19, 21, 6, 2, G[3]);
        rect(p, 15, 5, 2, 23, R.mid);                      // the glazing bar
      } else {
        doorPanel(p, R, 5, 4, 18, 14);
        doorPanel(p, R, 5, 20, 18, 8);
      }
      border(p, L.line);
    };

    // Oak is the style's own timber; the other four are the same recolour the
    // planks get, off the same species table, so a birch door and a birch
    // plank cannot drift apart. Iron and glass are the two that are not wood
    // at all — iron all the way through, glass a timber frame round a pane.
    const DOOR_WOODS = [null, ...WOODS];
    DOOR_WOODS.forEach((sp, i) => {
      const SL = sp ? speciesLook(sp) : L;
      const R = woodTones(SL);
      const key = ['OAK', ...WOODS.map((w) => w.key)][i];
      fin(TILE[`DOOR_${key}_BOT`],
        (p) => doorBot(p, R, (q) => flatPlank(q, SL)), { flat: true });
      fin(TILE[`DOOR_${key}_TOP`],
        (p) => doorTop(p, R, (q) => flatPlank(q, SL)), { flat: true });
    });
    {
      const M = matRamp(MATBASE.iron, {
        ...L.mat, sat: Math.max(L.mat.sat ?? 1, 1), gap: (L.mat.gap ?? 1) * 1.1,
      }, 5);
      const R = { mid: M[2], lit: M[4], dark: M[0] };
      const plate = (q) => { q.fill(M[2]); };
      fin(TILE.DOOR_IRON_BOT, (p) => doorBot(p, R, plate), { flat: true });
      fin(TILE.DOOR_IRON_TOP, (p) => doorTop(p, R, plate), { flat: true });
    }
    {
      const SL = L, R = woodTones(SL);
      fin(TILE.DOOR_GLASS_BOT,
        (p) => doorBot(p, R, (q) => flatPlank(q, SL)), { flat: true });
      fin(TILE.DOOR_GLASS_TOP,
        (p) => doorTop(p, R, (q) => flatPlank(q, SL), true), { flat: true });
    }

    // --- the bell -----------------------------------------------------------
    // Smooth bronze with a heavy band round the lip. The storage block's cast
    // face carries rivets and a bell with rivets on it is a bucket, so this is
    // the one bronze surface in the atlas with nothing bolted to it: a wide
    // vertical gradient, one hard highlight down its left, and the band.
    fin(TILE.BELL, (p) => {
      const R = matRamp(MATBASE.bronze, {
        ...L.mat,
        sat: Math.max(L.mat.sat ?? 1, 1.1),
        gap: (L.mat.gap ?? 1) * 1.2,
      }, 5);
      p.fill(R[2]);
      rect(p, 0, 0, TS, 3, R[1]);
      rect(p, 0, TS - 5, TS, 5, R[1]);                     // the lip band
      rect(p, 0, TS - 5, TS, 1, R[4]);
      rect(p, 0, TS - 1, TS, 1, R[0]);
      rect(p, 5, 3, 3, TS - 8, R[4]);                      // the highlight
      rect(p, 8, 3, 2, TS - 8, R[3]);
      rect(p, TS - 6, 3, 3, TS - 8, R[1]);                 // the far shoulder
      rect(p, TS - 3, 0, 3, TS, R[0]);
      border(p, L.line);
    }, { flat: true });

    // --- the kitchen garden ---------------------------------------------------
    //
    // Four crops, and the whole job of these eight tiles is that a field of one
    // is not a field of another from ten blocks away. Colour alone will not do
    // it — three of the four are green until you are standing on them — so each
    // one gets a different SHAPE, and the shape is the plant's own habit:
    //
    //   carrot   a low fan of feathery fronds, orange shoulder at the soil
    //   potato   broad flat leaves in pairs up a stiff stem, and a flower
    //   pepper   a taller bush with fruit HANGING off it, which is the only
    //            one of the four whose crop you can see before you pull it
    //   salad    no stem at all: a rosette of wide leaves lying open
    //
    // Every mark below is placed, never rolled. These painters draw no random
    // number, so they cannot move a texel on any tile painted before them —
    // which is the rule the whole of newTiles is written to (see cementFace).
    //
    // Young is the same plant, smaller, greener and with the crop absent. That
    // is what makes "is this ready" readable at a glance rather than a matter
    // of counting pixels: on three of the four, ripeness is a colour that is
    // not green appearing where there was none.
    const GREEN = { leaf: '4f7a35', lit: '6d9c4b', dark: '355624', stem: '43682d' };
    const cropGreens = () => {
      const g = L.plant?.tuft?.colors;
      // borrow the style's own turf greens when it has authored some, so a
      // crop in `deep` is not a `real` crop dropped into a darker world
      return g && g.length >= 4
        ? { leaf: g[1], lit: g[3], dark: g[4] ?? g[0], stem: g[0] }
        : GREEN;
    };

    // A frond: one texel wide, leaning further out the higher it goes, so it
    // curls away from the crown rather than sticking out at an angle.
    const frond = (p, x0, y0, len, dir, c) => {
      const tip = lighten(c, 1.18);
      for (let i = 0; i < len; i++) {
        const t = i / (len - 1 || 1);
        pset(p, x0 + Math.round(dir * t * t * (len - 1)), y0 - i,
          i > len - 3 ? tip : c);
      }
    };

    // A broad leaf: a stubby blade three or four texels DEEP, which is what
    // separates a potato's haulm from a carrot's fronds at ten blocks away.
    const broadLeaf = (p, x0, y0, len, dir, c) => {
      const dark = darken(c, 0.68), vein = lighten(c, 1.2);
      for (let i = 0; i < len; i++) {
        const t = i / (len - 1 || 1);
        const x = x0 + dir * i;
        const h = Math.max(1, Math.round((1 - t * t) * 4));
        for (let k = 0; k < h; k++) {
          pset(p, x, y0 + k - (h >> 1), k === h - 1 && h > 1 ? dark : c);
        }
        if (h > 2) pset(p, x, y0 - (h >> 1) + 1, vein);
      }
    };

    // Carrot: three CROWNS of fine fronds springing from one point at the
    // soil, a fan and not a stem — carrot tops have no trunk, and that fan is
    // the whole silhouette. Ripe adds the shoulder of the root pushing up out
    // of the bed, which is exactly how you know one is ready in a real garden.
    const cropCarrot = (p, ripe) => {
      const G = cropGreens(), leaf = hex(G.leaf), lit = hex(G.lit),
        root = hex('d2701f');
      const soil = TS - (ripe ? 4 : 1);
      for (const cx of [6, 16, 26]) {
        const n = ripe ? 7 : 5, len = ripe ? 12 : 7;
        for (let i = 0; i < n; i++) {
          const dir = (i - (n - 1) / 2) / ((n - 1) / 2);       // -1..1
          frond(p, cx, soil, len - Math.round(Math.abs(dir) * 3),
            dir * 2.2, i & 1 ? leaf : lit);
        }
        if (!ripe) continue;
        // the shoulder: a blunt orange crown two texels proud of the soil,
        // narrowing as it goes back down into it
        for (let k = 0; k < 4; k++) {
          const w = 2 - (k >> 1);
          for (let d = -w; d <= w; d++) {
            pset(p, cx + d, soil + k, d < 0 ? lighten(root, 1.2) : root);
          }
        }
      }
    };

    // Potato: two stout haulms of BROAD paired leaves — the widest foliage of
    // the four and the only one drawn in slabs rather than lines. Ripe carries
    // the white flower: a potato in flower is the field sign that the tubers
    // under it have set, and it is the only white in the garden.
    const cropPotato = (p, ripe) => {
      const G = cropGreens(), leaf = hex(G.leaf), lit = hex(G.lit),
        stem = hex(G.stem), flower = hex('efece2'), heart = hex('d8c25a');
      const top = ripe ? 6 : 17;
      for (const cx of [9, 23]) {
        for (let y = top; y < TS; y++) {
          pset(p, cx, y, stem);
          pset(p, cx + 1, y, darken(stem, 0.75));
        }
        const pairs = ripe ? 3 : 2;
        for (let k = 0; k < pairs; k++) {
          const y = top + 5 + k * 8;
          broadLeaf(p, cx - 2, y, 7, -1, k & 1 ? leaf : lit);
          broadLeaf(p, cx + 3, y + 3, 7, 1, k & 1 ? lit : leaf);
        }
        if (!ripe) continue;
        for (const [dx, dy] of [[0, -3], [-2, -2], [2, -2], [-2, 0], [2, 0],
          [0, 1]]) {
          pset(p, cx + dx, top + dy, flower);
        }
        pset(p, cx, top - 1, heart);
      }
    };

    // Pepper: the tall, bare one. A woody stem all the way to the top of the
    // cell with only a few leaves on it — and, when ripe, fruit HANGING off
    // it. It is the only crop of the four whose harvest you can see before
    // you touch it, so a ripe bed of peppers is red from across the field.
    const cropPepper = (p, ripe) => {
      const G = cropGreens(), leaf = hex(G.leaf), lit = hex(G.lit),
        stem = hex(G.stem), fruit = hex('c1362c'), fruitLit = hex('e2604a');
      const top = ripe ? 2 : 13;
      for (const cx of [9, 23]) {
        for (let y = top; y < TS; y++) {
          pset(p, cx, y, y > 20 ? darken(stem, 0.7) : stem);
          if (y > 20) pset(p, cx + 1, y, darken(stem, 0.55));
        }
        // the leaves start well DOWN the stem, leaving a bare leader at the
        // top: that gap is what tells a pepper from a potato before either of
        // them is carrying anything
        for (let k = 0; k < (ripe ? 3 : 2); k++) {
          const y = top + 8 + k * 7;
          broadLeaf(p, cx - 2, y, 5, -1, k & 1 ? darken(leaf, 0.82) : leaf);
          broadLeaf(p, cx + 2, y + 4, 5, 1, k & 1 ? leaf : darken(lit, 0.85));
        }
        if (!ripe) continue;
        for (const [ox, oy] of [[-3, 11], [3, 18]]) {
          const fx = cx + ox, fy = top + oy;
          pset(p, fx, fy - 2, hex(G.dark));                    // the stalk
          pset(p, fx - 1, fy - 1, hex(G.dark));
          pset(p, fx + 1, fy - 1, hex(G.dark));
          for (let y = 0; y < 7; y++) {                        // the fruit
            const w = y < 5 ? 2 : 1;
            for (let d = -w; d <= w; d++) {
              pset(p, fx + d, fy + y, d < 0 ? fruitLit : fruit);
            }
          }
        }
      }
    };

    // Salad: a rosette lying open on the ground. No stem, nothing upright, and
    // a scalloped dome instead of a silhouette — it is the one plant in the
    // set that does not stand up, and that is what makes a bed of it
    // unmistakable at a distance even though it is the same green as the rest.
    const cropSalad = (p, ripe) => {
      const G = cropGreens(), leaf = hex(G.leaf), lit = hex(G.lit),
        dark = hex(G.dark), heart = lighten(hex(G.lit), 1.3);
      for (const cx of [8, 23]) {
        const rx = ripe ? 8 : 5, ry = ripe ? 12 : 6, cy = TS - 1;
        for (let y = cy - ry; y <= cy; y++) {
          for (let x = cx - rx; x <= cx + rx; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            const d = dx * dx + dy * dy;
            if (d > 1) continue;
            // Ruffles: hard-edged vertical bands three texels wide with a dark
            // trough between them. Without the trough the dome is one green
            // lump; with it the thing reads as a head of overlapping leaves,
            // which is the only feature this crop has.
            const band = ((x - cx + 24) % 5);
            pset(p, x, y, d > 0.78 ? dark
              : band === 0 ? darken(leaf, 0.7) : band < 3 ? lit : leaf);
          }
        }
        if (!ripe) continue;
        for (const [dx, dy] of [[0, -6], [-1, -5], [1, -5], [0, -4]]) {
          pset(p, cx + dx, cy + dy, heart);                    // the open heart
        }
      }
    };

    // Pumpkin: a trailing VINE, which is the one habit none of the first four
    // has. A low creeping stem with big lobed leaves standing off it, and
    // — ripe — the gourd itself sitting ON the soil, ribbed and orange, with
    // the fat stalk still on it. It is the only crop in the garden whose
    // harvest is bigger than the plant, and drawing it that way is most of
    // what tells a pumpkin bed from a potato bed at ten blocks.
    const cropPumpkin = (p, ripe) => {
      const G = cropGreens(), leaf = hex(G.leaf), lit = hex(G.lit),
        stem = hex(G.stem), skin = hex('d2751a'), skinLit = hex('ee9a34'),
        skinDark = hex('9c4d0c');
      const soil = TS - 1;
      // the runner: a stem lying along the ground, not standing up
      for (let x = 2; x < TS - 2; x++) {
        pset(p, x, soil - 1 - ((x >> 3) & 1), stem);
      }
      for (const [cx, up] of [[6, 9], [16, 12], [26, 8]]) {
        const h = ripe ? up : Math.round(up * 0.6);
        for (let y = soil - h; y < soil; y++) pset(p, cx, y, stem);
        // one lobed leaf per runner, drawn as a scalloped fan so the edge is
        // notched rather than round — a pumpkin leaf is all notches
        const rx = ripe ? 6 : 4, ry = ripe ? 5 : 3, cy = soil - h;
        for (let y = cy - ry; y <= cy + 1; y++) {
          for (let x = cx - rx; x <= cx + rx; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            if (dx * dx + dy * dy > 1) continue;
            const notch = ((x - cx + 30) % 4) === 0 && y < cy - ry * 0.45;
            if (notch) continue;
            pset(p, x, y, y < cy - ry * 0.5 ? lit : leaf);
          }
        }
      }
      if (!ripe) return;
      // the gourd: wide, squat and ribbed, sitting in the middle of the cell
      const gx = 16, gy = soil - 6, rx = 9, ry = 6;
      for (let y = gy - ry; y <= gy + ry; y++) {
        for (let x = gx - rx; x <= gx + rx; x++) {
          const dx = (x - gx) / rx, dy = (y - gy) / ry;
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          const rib = ((x - gx + 24) % 6) === 0;
          pset(p, x, y, d > 0.74 || rib ? skinDark
            : x < gx - 2 ? skinLit : skin);
        }
      }
      for (let y = gy - ry - 3; y < gy - ry; y++) {   // the stalk
        pset(p, gx, y, stem); pset(p, gx + 1, y, darken(stem, 0.7));
      }
    };

    // Watermelon: the same vine kept LOW and the fruit kept dark. Where the
    // pumpkin stands its leaves up off the runner, this one lies flat — so the
    // two gourds are told apart by height before either colour registers, and
    // a ripe melon is the only near-black green in the garden.
    const cropWatermelon = (p, ripe) => {
      const G = cropGreens(), leaf = hex(G.leaf), lit = hex(G.lit),
        stem = hex(G.stem), rind = hex('20501f'), rindLit = hex('3d7a30'),
        stripe = hex('8fbf5a');
      const soil = TS - 1;
      for (let x = 1; x < TS - 1; x++) pset(p, x, soil, stem);
      // Leaves at the ENDS of the runner only, and small. On a ripe plant the
      // fruit is the picture and anything green in the middle of the tile
      // competes with it — an earlier draft put four bright leaves across the
      // whole cell and the melon underneath them read as a mossy boulder.
      for (const [cx, dir] of ripe ? [[3, -1], [29, 1]]
        : [[6, -1], [16, 1], [25, -1]]) {
        const rx = 3, ry = ripe ? 3 : 2, cy = soil - 2 - ry;
        for (let y = cy - ry; y <= cy + ry; y++) {
          for (let x = cx - rx; x <= cx + rx; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            if (dx * dx + dy * dy > 1) continue;
            pset(p, x, y, ((x - cx) * dir) > 0 ? lit : leaf);
          }
        }
      }
      if (!ripe) return;
      // The melon: a long low oval, DARK, with narrow pale stripes bent over
      // it. Narrow is the whole trick — a watermelon's stripes are thin lines
      // on a near-black green, and at wide bands the thing turns pale and
      // stops being a watermelon at all.
      const mx = 16, my = soil - 6, rx = 13, ry = 6;
      for (let y = my - ry; y <= my + ry; y++) {
        for (let x = mx - rx; x <= mx + rx; x++) {
          const dx = (x - mx) / rx, dy = (y - my) / ry;
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          // curved by offsetting the band with the row, so the stripes follow
          // the belly of the fruit instead of standing straight up it
          const band = ((x - mx + Math.round(dy * dy * 4) + 40) % 6) === 0;
          pset(p, x, y, d > 0.86 ? darken(rind, 0.55)
            : band ? stripe : y < my - ry + 2 ? rindLit : rind);
        }
      }
      // one hard highlight along the shoulder: a melon is glossy, and without
      // it the oval is flat however well it is striped
      for (let x = mx - 5; x < mx + 1; x++) pset(p, x, my - ry + 1, lit);
    };

    const CROP_ART = [
      ['CARROT', cropCarrot], ['POTATO', cropPotato],
      ['PEPPER', cropPepper], ['SALAD', cropSalad],
      ['PUMPKIN', cropPumpkin], ['WATERMELON', cropWatermelon],
    ];
    for (const [key, art] of CROP_ART) {
      paint(TILE[`${key}_YOUNG`], (p) => art(p, false));
      paint(TILE[`${key}_TOP`], (p) => art(p, true));
    }

    // --- the vegetables themselves --------------------------------------------
    // Hotbar icons, on the 16-texel grid the rest of the item art is drawn on.
    // A plant tile will not do for these: what you are holding is the root, the
    // tuber, the fruit and the head, not the leaves that were over them.

    // Carrot: a tapered root, point down, with a tuft of green out of the top.
    paint(TILE.CARROT, (p) => {
      const O = [hex('a7500f'), hex('c26314'), hex('d9761f'), hex('ea8c33'),
        hex('f7a75a')];
      for (let y = 3; y < 15; y++) {
        const w = Math.max(0, 3 - ((y - 3) / 4) | 0);
        for (let d = -w; d <= w; d++) {
          p.set(8 + d, y, d < 0 ? O[3] : d === w ? O[0] : O[2]);
        }
        if (y % 3 === 1) p.set(8, y, O[1]);                   // the ribs
      }
      p.set(9, 4, O[4]); p.set(9, 5, O[4]);
      for (const [x, y] of [[7, 2], [8, 1], [9, 2], [6, 1], [10, 1], [8, 0]]) {
        p.set(x, y, tone(PAL.leaf, 0.75, x, y));
      }
    }, CT);

    // Potato: a lumpy oval with eyes in it. The eyes are the whole design —
    // a plain brown oval is a stone, and a stone with three dark pits in it
    // is a potato.
    paint(TILE.POTATO, (p) => {
      const B = [hex('7a5a34'), hex('9a743f'), hex('b58c4f'), hex('cba566')];
      p.each((x, y) => {
        const dx = (x - 7.5) / 6.2, dy = (y - 8.2) / 4.8;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        const lit = (-(x - 6) - (y - 7)) * 0.05;
        p.set(x, y, d > 0.72 ? B[0] : lit > 0.1 ? B[3] : lit > -0.05 ? B[2] : B[1]);
      });
      for (const [x, y] of [[5, 6], [10, 7], [7, 11]]) {
        p.set(x, y, hex('4d3720'));
        p.set(x + 1, y, hex('5f462a'));
      }
    }, CT);

    // Pepper: a fruit hanging from its stalk, wide at the shoulder and
    // lobed at the bottom, with one hard highlight — peppers are glossy and
    // that shine is most of what says "pepper" rather than "red thing".
    paint(TILE.PEPPER, (p) => {
      const R = [hex('8d221c'), hex('b23127'), hex('c94436'), hex('e0644f')];
      p.each((x, y) => {
        const dx = (x - 7.5) / 4.6, dy = (y - 9) / 5.2;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        const lobe = (x % 5 === 2 && y > 10) ? -1 : 0;        // the lobes
        p.set(x, y, d > 0.74 || lobe ? R[0] : x < 7 ? R[3] : x > 9 ? R[1] : R[2]);
      });
      for (const [x, y] of [[5, 7], [5, 8], [6, 6]]) p.set(x, y, hex('f09a86'));
      for (let y = 1; y < 4; y++) p.set(8, y, tone(PAL.leaf, 0.5, 8, y));
      for (const [x, y] of [[6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [7, 5], [9, 5]]) {
        p.set(x, y, tone(PAL.leaf, 0.72, x, y));
      }
    }, CT);

    // Salad: a head of leaves seen from the side — pale ribs at the bottom
    // where it was cut, going darker and looser toward the crown.
    paint(TILE.SALAD, (p) => {
      const G = [hex('3c6427'), hex('4f7c33'), hex('639343'), hex('8fb861'),
        hex('cddba6')];
      p.each((x, y) => {
        const dx = (x - 7.5) / 6.4, dy = (y - 9) / 6;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        const ruffle = ((x * 3 + y * 2) % 7) < 2 ? 1 : 0;
        p.set(x, y, y > 12 ? G[4] : d > 0.7 ? G[0] : ruffle ? G[3] : G[y < 7 ? 2 : 1]);
      });
      for (let x = 5; x < 11; x++) p.set(x, 14, G[4]);        // the cut stem
      for (const [x, y] of [[7, 5], [8, 8], [6, 10], [10, 9]]) p.set(x, y, G[0]);
    }, CT);

    // A baked potato: the same tuber split open, crisped outside and floury
    // in the middle. Split, because a cooked potato that is only a browner
    // raw one is a colour change nobody can see in a hotbar.
    paint(TILE.POTATO_BAKED, (p) => {
      const B = [hex('5c3d1d'), hex('7d5628'), hex('a0723a')],
        F = [hex('e8dcb4'), hex('f6efd2')];
      p.each((x, y) => {
        const dx = (x - 7.5) / 6.4, dy = (y - 8.2) / 5;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        p.set(x, y, d > 0.7 ? B[0] : y < 7 ? B[2] : B[1]);
      });
      for (let y = 6; y < 11; y++) {                          // the split
        const w = 4 - Math.abs(y - 8);
        for (let d = -w; d <= w; d++) p.set(8 + d, y, d === -w ? F[0] : F[1]);
      }
    }, CT);

    // Pumpkin: the gourd on its own, ribbed and stalked. Ribs, because a plain
    // orange ball is a plain orange ball — the vertical grooves are the entire
    // difference between a pumpkin and a pepper at sixteen texels.
    paint(TILE.PUMPKIN, (p) => {
      const O = [hex('8a4409'), hex('b45c11'), hex('d2751a'), hex('ee9a34')];
      p.each((x, y) => {
        const dx = (x - 7.5) / 6.6, dy = (y - 9) / 5.4;
        const d = dx * dx + dy * dy;
        if (d > 1) return;
        const rib = ((x + 1) % 4) === 0;
        p.set(x, y, d > 0.72 ? O[0] : rib ? O[1] : x < 6 ? O[3] : O[2]);
      });
      for (const [x, y] of [[7, 2], [8, 2], [7, 1], [8, 1]]) {
        p.set(x, y, tone(PAL.leaf, 0.55, x, y));           // the stalk
      }
      for (const [x, y] of [[6, 3], [9, 3]]) {
        p.set(x, y, tone(PAL.leaf, 0.75, x, y));
      }
    }, CT);

    // Watermelon: a WEDGE, not the whole fruit. A striped green ball at
    // sixteen texels is a striped green ball; a wedge shows rind, pith, flesh
    // and pips in one silhouette and there is nothing else it could be.
    paint(TILE.WATERMELON, (p) => {
      const rind = hex('1f4a1c'), rindLit = hex('3a7530'), pith = hex('e6f0cf'),
        flesh = hex('cf3a44'), fleshLit = hex('e8606a'), pip = hex('2b1a12');
      p.each((x, y) => {
        // a half-disc standing on its flat: the rind is the curved edge
        const dx = (x - 7.5) / 7, dy = (y - 3) / 11;
        const d = dx * dx + dy * dy;
        if (d > 1 || y < 3) return;
        p.set(x, y, d > 0.86 ? rind : d > 0.72 ? rindLit : d > 0.63 ? pith
          : y < 8 ? fleshLit : flesh);
      });
      for (let x = 2; x < 14; x++) p.set(x, 3, pith);       // the cut face
      for (const [x, y] of [[6, 7], [9, 8], [7, 11], [10, 11], [5, 10]]) {
        p.set(x, y, pip);
      }
    }, CT);

    // --- bamboo -----------------------------------------------------------------
    // The cane, as the world draws it. This tile is STACKED — a stalk is a
    // column of these blocks — so the canes have to run edge to edge top and
    // bottom or every joint in a grove is a gap you can see daylight through.
    // The nodes are what makes it bamboo: a plain green stripe is a stem, and a
    // stripe with a dark collar every eight texels is a cane.
    paint(TILE.BAMBOO, (p) => {
      const G = cropGreens();
      const cane = hex('7ba33c'), caneLit = hex('9cc255'),
        caneDark = hex('4d6f22'), node = hex('3c5a1a'), leaf = hex(G.leaf),
        leafLit = hex(G.lit);
      // three canes at different thicknesses, so a grove has depth in it
      for (const [cx, w, tint] of [[8, 2, cane], [18, 3, caneLit], [25, 1, cane]]) {
        for (let y = 0; y < TS; y++) {
          const at = ((y + cx) % 11) < 1;                   // the node collar
          for (let d = 0; d <= w; d++) {
            p.set(cx + d, y, at ? node
              : d === w ? caneDark : d === 0 ? lighten(tint, 1.15) : tint);
          }
        }
      }
      // a few blades springing off the nodes, drawn with the same frond the
      // carrot uses so the whole garden shares one hand
      for (const [x, y, dir] of [[10, 12, 1], [8, 24, -1], [21, 6, 1],
        [18, 20, -1], [27, 16, 1]]) {
        for (let k = 0; k < 6; k++) {
          const t = k / 5;
          pset(p, x + Math.round(dir * k * 1.4), y - Math.round(t * t * 5),
            k > 3 ? leafLit : leaf);
        }
      }
    });

    // A cut length of it, for the bag: one cane, nodes showing, cut clean at
    // both ends. Vertical rather than diagonal — the item is a stick of stuff
    // and the recipe it feeds lays it out in a column.
    paint(TILE.BAMBOO_CANE, (p) => {
      const C = [hex('4d6f22'), hex('7ba33c'), hex('9cc255'), hex('c0dd88')];
      for (let y = 1; y < 15; y++) {
        const node = y === 5 || y === 10;
        for (let d = 0; d < 4; d++) {
          p.set(6 + d, y, node ? C[0] : d === 3 ? C[0] : d === 0 ? C[3] : C[1]);
        }
      }
      for (let d = 0; d < 4; d++) { p.set(6 + d, 1, C[2]); p.set(6 + d, 14, C[2]); }
      for (const [x, y] of [[10, 6], [11, 5], [12, 5], [4, 11], [3, 10]]) {
        p.set(x, y, tone(PAL.leaf, 0.8, x, y));             // two blades
      }
    }, CT);

    // --- what a kitchen makes ---------------------------------------------------

    // A cake: a round tin seen from the side, with a course of icing over it
    // and one cherry on top. The icing is the message — a plain brown drum is
    // a barrel, and a brown drum with a white lid is a cake.
    paint(TILE.CAKE, (p) => {
      const S = [hex('9a6a35'), hex('b5813f'), hex('caa05a')],
        I = [hex('f3ece0'), hex('ffffff')], cherry = hex('c02a2a');
      for (let y = 6; y < 14; y++) {
        for (let x = 3; x < 13; x++) {
          p.set(x, y, x < 5 ? S[2] : x > 10 ? S[0] : S[1]);
          // the crumb: airholes, scattered rather than ruled. A diagonal
          // stripe here read as grain and turned the sponge into a plank.
          if ((x * 5 + y * 3) % 11 < 2) p.set(x, y, S[0]);
        }
      }
      for (let y = 3; y < 6; y++) {                         // the icing
        for (let x = 3; x < 13; x++) p.set(x, y, y === 3 ? I[1] : I[0]);
      }
      // drips down the side, which is what stops the icing reading as a lid
      for (const x of [4, 7, 11]) p.set(x, 6, I[0]);
      p.set(8, 1, cherry); p.set(7, 2, cherry); p.set(8, 2, cherry);
      p.set(9, 2, lighten(cherry, 1.3));
    }, CT);

    // Potato stew: an earthenware crock with the dinner showing over the rim.
    // A crock and not a bowl, because there is no bowl item in this game and
    // an icon should not promise one — what the recipe hands you is the stew.
    paint(TILE.POTATO_STEW, (p) => {
      const C = [hex('5c3a24'), hex('7b5232'), hex('9a6b45')],
        broth = hex('b0762c'), tater = hex('e0cf94'), root = hex('d2701f'),
        meat = hex('7d3b2a');
      for (let y = 6; y < 15; y++) {                        // the crock
        const w = y > 12 ? 3 : 5;
        for (let d = -w; d <= w; d++) {
          p.set(8 + d, y, d < -w + 2 ? C[2] : d > w - 2 ? C[0] : C[1]);
        }
      }
      for (let d = -6; d <= 6; d++) p.set(8 + d, 5, C[2]);  // the rim
      for (let d = -5; d <= 5; d++) p.set(8 + d, 6, broth);
      for (const [x, y, c] of [[5, 6, tater], [6, 5, tater], [9, 5, root],
        [10, 6, meat], [11, 6, tater], [4, 6, root]]) {
        p.set(x, y, c);
      }
      for (const [x, y] of [[6, 3], [10, 2], [8, 1]]) {     // steam
        p.set(x, y, hex('e8e4dc'), 0.75);
      }
    }, CT);

    // --- the buckets ----------------------------------------------------------
    // One pail, four fills. The body is drawn once and what sits in the top of
    // it is the only thing that changes, because at 16 texels the shape of a
    // bucket is the shape of a bucket and the contents are the whole message.
    const pail = (p, fill) => {
      const M = [hex('4a4f57'), hex('6b727c'), hex('8d949f'), hex('b0b7c1'),
        hex('d5dae2')];
      // the rim, then the tapering body: narrower at the foot, which is the
      // one line that stops a bucket reading as a mug
      for (let x = 2; x < 14; x++) { p.set(x, 4, M[4]); p.set(x, 5, M[2]); }
      for (let y = 6; y < 14; y++) {
        const inset = (y - 6) >> 2;
        for (let x = 2 + inset; x < 14 - inset; x++) {
          p.set(x, y, x < 5 ? M[3] : x > 11 ? M[0] : M[1]);
        }
      }
      for (let x = 4; x < 12; x++) p.set(x, 14, M[0]);        // the foot
      for (let y = 6; y < 12; y++) p.set(3 + ((y - 6) >> 2), y, M[4]);  // highlight
      // the handle, arcing over the rim
      for (const [x, y] of [[2, 3], [3, 2], [5, 1], [8, 1], [11, 1], [13, 2], [14, 3]]) {
        p.set(x, y, M[3]);
      }
      if (!fill) return;
      for (let x = 3; x < 13; x++) {
        p.set(x, 5, fill[1]);
        p.set(x, 6, x < 6 ? fill[2] : fill[0]);
      }
      p.set(5, 5, fill[2]); p.set(6, 5, fill[2]);
    };
    paint(TILE.BUCKET, (p) => pail(p, null), CT);
    paint(TILE.BUCKET_WATER,
      (p) => pail(p, [hex('1f5c9e'), hex('2f79c4'), hex('6fb0e8')]), CT);
    paint(TILE.BUCKET_LAVA,
      (p) => pail(p, [hex('9c2f06'), hex('e2611a'), hex('ffc247')]), CT);
    paint(TILE.BUCKET_MILK,
      (p) => pail(p, [hex('ddd8cb'), hex('f3f0e8'), hex('ffffff')]), CT);

    // --- the trade goods ---------------------------------------------------
    //
    // One per world, and their whole job is to be recognised in a slot. Each
    // takes a different silhouette on purpose: at sixteen texels a pot and a
    // brick and a shard read apart instantly, where seven objects separated
    // only by colour do not.

    // Cinder: pitch in a squat sealed pot. The tar is the message, so the pot
    // is pale and what is in it is the darkest thing in the atlas.
    paint(TILE.PITCH, (p) => {
      const clay = [hex('6d5a45'), hex('8a7358'), hex('a68a6b')];
      for (let y = 6; y < 15; y++) {
        const w = (y < 8 || y > 12) ? 4 : 5;
        for (let x = 8 - w; x < 8 + w; x++) {
          p.set(x, y, x < 5 ? clay[2] : x > 10 ? clay[0] : clay[1]);
        }
      }
      for (let x = 4; x < 12; x++) p.set(x, 5, clay[0]);        // the rim
      for (let x = 5; x < 11; x++) p.set(x, 4, hex('15120e'));  // the tar
      for (let x = 6; x < 10; x++) p.set(x, 3, hex('221d16'));
      p.set(7, 2, hex('2e2820'));
    }, CT);

    // Ferrum: a cast gear. Nothing else in the game is a toothed wheel, and a
    // wheel is the shortest way to say a machine made this.
    paint(TILE.BRASS_GEAR, (p) => {
      const M = [hex('7d6a24'), hex('a8912f'), hex('cbb04a'), hex('e6d180')];
      p.each((x, y) => {
        const dx = x - 7.5, dy = y - 7.5;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 2.2 || r > 7.2) return;               // the bore, and the air
        const tooth = Math.cos(Math.atan2(dy, dx) * 8) > 0.25 ? 7.2 : 5.7;
        if (r > tooth) return;
        p.set(x, y, r > tooth - 1 ? M[0]
          : r < 3.4 ? M[1] : (dx + dy < 0 ? M[3] : M[2]));
      });
    }, CT);

    // Thalassa: a cone of sea salt on a board. White on dark timber, which
    // nothing else in the set is.
    paint(TILE.SEA_SALT, (p) => {
      for (let x = 2; x < 14; x++) {
        p.set(x, 13, hex('5b4630'));
        p.set(x, 14, hex('3f3021'));
      }
      for (let y = 4; y < 13; y++) {
        const half = Math.round((y - 3) * 0.6);
        for (let x = 8 - half; x <= 7 + half; x++) {
          p.set(x, y, x <= 8 - half + 1 ? hex('ffffff')
            : x >= 7 + half - 1 ? hex('c4ccd4') : hex('edf1f5'));
        }
      }
      for (const [x, y] of [[4, 12], [11, 12], [3, 13], [12, 13]])
        p.set(x, y, hex('dfe5ea'));                    // spilled grains
    }, CT);

    // Rime: a pressed brick of tea with a stamp on it. A brick is exactly how
    // the stuff travelled, and the stamp is what stops it reading as earth.
    paint(TILE.TEA_BRICK, (p) => {
      for (let y = 4; y < 13; y++)
        for (let x = 2; x < 14; x++)
          p.set(x, y, y < 6 ? hex('4e3a22') : y > 10 ? hex('2c2013') : hex('3d2d1a'));
      for (let x = 2; x < 14; x++) {
        p.set(x, 3, hex('60492c'));
        p.set(x, 13, hex('1e160c'));
      }
      const st = hex('8a6f3f');
      for (const [x, y] of [[6, 6], [7, 6], [8, 6], [9, 6], [5, 7], [10, 7],
        [5, 8], [10, 8], [5, 9], [10, 9], [6, 10], [7, 10], [8, 10], [9, 10],
        [7, 7], [8, 8], [7, 8], [8, 9]]) p.set(x, y, st);
    }, CT);

    // Tempest: saffron, as a loose bundle of threads — the one thing in the
    // set that is not a solid body.
    paint(TILE.SAFFRON, (p) => {
      const th = [hex('c4491a'), hex('e0691f'), hex('f2913a'), hex('ffb861')];
      const strands = [
        [4, 3, 5, 6, 5, 9, 6, 12], [7, 2, 7, 5, 8, 8, 7, 12],
        [10, 3, 10, 6, 9, 9, 10, 12], [12, 5, 11, 8, 12, 11, 11, 13],
        [3, 6, 4, 9, 3, 12, 4, 13],
      ];
      strands.forEach((sd, i) => {
        const c = th[i % th.length];
        for (let k = 0; k + 3 < sd.length; k += 2) {
          const x0 = sd[k], y0 = sd[k + 1], x1 = sd[k + 2], y1 = sd[k + 3];
          const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
          for (let j = 0; j <= n; j++) {
            p.set(Math.round(x0 + (x1 - x0) * j / n),
              Math.round(y0 + (y1 - y0) * j / n), c);
          }
        }
      });
    }, CT);

    // Vulcan: a knapped shard of volcanic glass, near-black with one bright
    // conchoidal facet — which is what obsidian actually does in the light.
    paint(TILE.OBSIDIAN, (p) => {
      const edge = [[7, 1], [6, 2], [8, 2], [5, 3], [9, 3], [4, 4], [10, 4],
        [4, 5], [10, 5], [3, 6], [11, 6], [3, 7], [11, 7], [4, 8], [11, 8],
        [4, 9], [10, 9], [5, 10], [10, 10], [5, 11], [9, 11], [6, 12], [8, 12],
        [7, 13]];
      for (let y = 1; y <= 13; y++) {
        const xs = edge.filter((e) => e[1] === y).map((e) => e[0]);
        if (!xs.length) continue;
        for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
          p.set(x, y, hex('1b1722'));
      }
      for (const [x, y] of [[6, 4], [7, 4], [6, 5], [7, 5], [8, 5], [6, 6],
        [7, 6], [7, 7]]) p.set(x, y, hex('35304a'));
      for (const [x, y] of [[6, 4], [6, 5], [7, 4]]) p.set(x, y, hex('6a6494'));
      for (const [x, y] of [[9, 8], [9, 9], [8, 10]]) p.set(x, y, hex('0b0910'));
    }, CT);

    // Terran: a comb of honey. A hexagon grid is a motif nothing else in the
    // atlas uses, so it is legible at a glance and unmistakably home's.
    paint(TILE.HONEYCOMB, (p) => {
      for (let y = 3; y < 14; y++)
        for (let x = 2; x < 14; x++) p.set(x, y, hex('c98f2e'));
      const cell = hex('f2c451'), wall = hex('8a5f1c');
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const ox = 3 + col * 4 + (row & 1 ? 2 : 0);
          const oy = 4 + row * 3;
          for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1],
            [3, 1], [1, 2], [2, 2]]) {
            const x = ox + dx, y = oy + dy;
            if (x < 3 || x > 12 || y < 4 || y > 12) continue;
            p.set(x, y, cell);
          }
        }
      }
      for (let x = 2; x < 14; x++) { p.set(x, 3, wall); p.set(x, 13, wall); }
      for (let y = 3; y < 14; y++) { p.set(2, y, wall); p.set(13, y, wall); }
    }, CT);

    // --- true cobblestone ---------------------------------------------------
    //
    // The light-grey ROUNDS the player pointed at — field stones with real
    // curvature packed in dark joints — as against TILE.COBBLE, which is
    // squared masonry and answers to "cobble brick" now. Three varieties,
    // because a pavement all of one stone reads as wallpaper: plain, mossy,
    // and soot-dark.
    //
    // Dead last, off a stream of its very own: these painters roll dice, and
    // rolled anywhere higher they would re-roll the finish on every tile
    // below them. Here they can move nothing.
    const cobRand = mulberry32(seed ^ 0x0c0bb7e5);
    const CB_LIGHT = ramp('7e7f83', '8f9094', 'a1a2a6', 'b3b4b8', 'c6c7cb');
    const CB_JOINT = ramp('313135', '3b3b3f', '454549', '4f4f53', '59595d');
    const CB_DARK = ramp('404046', '4c4c54', '5a5a62', '686870', '76767e');
    const CB_JOINT_DK = ramp('17171b', '202024', '292930', '32323a', '3b3b42');
    const CB_MOSS = ramp('374f24', '44612d', '527436', '618840', '719b4b');

    // A Worley diagram on the torus, like the brick-yard's paintCobbles but
    // at nine stones a face so each round is a fist-sized thing you can
    // count, with the bulge pushed harder: lit at the crown, rolling off
    // toward the rim, so the stones read as ROUND and not as flat patches.
    function roundStones(p, R, J) {
      const seeds = [];
      for (let i = 0; i < 9; i++) {
        seeds.push([cobRand() * TS, cobRand() * TS, 0.38 + cobRand() * 0.42]);
      }
      const jw = 1.7;                      // joint width, in texels
      p.each((x, y) => {
        let b1 = 1e9, b2 = 1e9, bi = 0, bdx = 0, bdy = 0;
        for (let i = 0; i < seeds.length; i++) {
          const dx = sdist(x + 0.5, seeds[i][0], TS);
          const dy = sdist(y + 0.5, seeds[i][1], TS);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < b1) { b2 = b1; b1 = d; bi = i; bdx = dx; bdy = dy; }
          else if (d < b2) b2 = d;
        }
        const gap = b2 - b1;
        if (gap < jw) { p.set(x, y, tone(J, 0.18 + gap / jw * 0.5, x, y)); return; }
        // crown light up-left, curvature off b1, and a lift where the stone
        // stands proudest of its neighbours
        const lit = seeds[bi][2] + (-bdx - bdy) * 0.042 - b1 * 0.052
          + Math.min(gap - jw, 6) * 0.035;
        p.set(x, y, tone(R, lit, x, y));
      });
    }

    // Moss grows where water sits: out of the joints and over the shaded
    // shoulder of a stone, in patches, never as a green wash.
    function mossOver(p) {
      const tufts = [];
      for (let i = 0; i < 17; i++) {
        tufts.push([cobRand() * TS, cobRand() * TS, 1.5 + cobRand() * 2.4]);
      }
      p.each((x, y) => {
        for (const [mx, my, mr] of tufts) {
          const dx = sdist(x + 0.5, mx, TS), dy = sdist(y + 0.5, my, TS);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < mr) {
            p.set(x, y, tone(CB_MOSS, 0.78 - (d / mr) * 0.58, x, y));
            return;
          }
        }
      });
    }

    fin(TILE.COBBLESTONE, (p) => roundStones(p, CB_LIGHT, CB_JOINT));
    fin(TILE.COBBLESTONE_MOSSY, (p) => {
      roundStones(p, CB_LIGHT, CB_JOINT);
      mossOver(p);
    });
    fin(TILE.COBBLESTONE_DARK, (p) => roundStones(p, CB_DARK, CB_JOINT_DK));
  }

  // Hand-painted tiles, last of all and straight over the top of whatever the
  // style generated. They are the only pixels here nobody wrote a rule for:
  // everything above is a procedure with knobs, and this is a person deciding
  // that THIS texel is that colour. See setTileOverrides.
  // CLASSIC'S BLOCKS, drawn again (classicart.js): every block face in one
  // sixteen-texel idiom — clusters instead of dither, light from the top
  // left, one set of ramps — over whatever the old classic painters and
  // newTiles left there. Last of the painting and from streams of its own,
  // so no item icon moves; before the overrides and the shapes, so a tile
  // painted by hand still wins and a slab is cut from the new block.
  if (!LOOK && currentStyle().id === 'classic') {
    paintClassicBlocks(seed, (name, t) => { if (TILE[name] != null) emit(TILE[name], t); });
  }

  // What the generator made, before a photograph or a hand went near it: the
  // ground a painting on a tile with no photograph is laid over (realism.js),
  // and what the block maker compares a board against to see what was painted.
  generated.set(currentStyle().id, out.data.slice());

  // The Realistic style's photographs, shrunk to the atlas's 32 texels, over
  // the pixel art it paints first — so the slot in the hotbar, the block in
  // your hand and a log falling off a tree are the same photograph as the
  // ground. Before the overrides, so a tile painted by hand still wins.
  if (PBR) {
    const W = COLS * TS;
    for (const [tile, px] of realTiles) {
      const ox = (tile % COLS) * TS, oy = ((tile / COLS) | 0) * TS;
      for (let y = 0; y < TS; y++) {
        out.data.set(px.subarray(y * TS * 4, (y + 1) * TS * 4), ((oy + y) * W + ox) * 4);
      }
    }
  }

  applyOverrides(out);

  // ...and the shapes cut from what all of that produced. Last, so a slab
  // carries the style, the finish AND any hand-painted override of the block
  // it is cut from — which is the whole reason it is a cut and not a
  // painting.
  shapeTiles(out);

  ctx.putImageData(out, 0, 0);
}

// --- the shapes, cut from the blocks they are made of --------------------------
//
// A slab is the bottom half of its block and nothing above it. A stair is the
// bottom half plus the top half of one side. Both are drawn on TRANSPARENT so
// the silhouette is the icon — a plank slab in the hotbar is visibly half the
// height of a plank, which is the entire point.
//
// Copied out of the finished atlas rather than painted, so there is no second
// definition of what oak looks like to drift away from the first.
// `null` in the slab column is a material with stairs and no slab — bank two.
const SHAPE_CUTS = [
  ['PLANK', 'PLANK_SLAB', 'PLANK_STAIRS'],
  ['COBBLE', 'COBBLE_SLAB', 'COBBLE_STAIRS'],
  ['BRICK', 'BRICK_SLAB', 'BRICK_STAIRS'],
  ['THATCH', 'THATCH_SLAB', 'THATCH_STAIRS'],
  ['PATH', null, 'PATH_STAIRS'],
  ['STONE', null, 'STONE_STAIRS'],
  ['DIRT', null, 'DIRT_STAIRS'],
  ['SAND', null, 'SAND_STAIRS'],
  ['SAND_ORANGE', null, 'SAND_ORANGE_STAIRS'],
  ['GRAVEL', null, 'GRAVEL_STAIRS'],
  ['CLAY', null, 'CLAY_STAIRS'],
  ['SNOW', null, 'SNOW_STAIRS'],
  ['LOG_SIDE', null, 'LOG_STAIRS'],
  ['GLASS', null, 'GLASS_STAIRS'],
];

function shapeTiles(out) {
  const W = COLS * TS;
  const at = (tile) => ({ x: (tile % COLS) * TS, y: ((tile / COLS) | 0) * TS });
  const half = TS >> 1;
  for (const [src, slab, stair] of SHAPE_CUTS) {
    const s0 = TILE[src], sl = slab ? TILE[slab] : null, st = TILE[stair];
    if (s0 == null || st == null) continue;
    const a = at(s0), b = sl != null ? at(sl) : null, c = at(st);
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        const si = ((a.y + y) * W + a.x + x) * 4;
        // the slab: the bottom half of the block, sitting on the floor of the
        // tile, and nothing at all above it
        const inSlab = y >= half;
        // the stair: the same bottom half, and the top half of the +x side,
        // which is the profile you see standing beside one
        const inStair = y >= half || x >= half;
        for (const [dst, keep] of [[b, inSlab], [c, inStair]]) {
          if (!dst) continue;
          const di = ((dst.y + y) * W + dst.x + x) * 4;
          if (!keep) { out.data[di + 3] = 0; continue; }
          out.data[di] = out.data[si];
          out.data[di + 1] = out.data[si + 1];
          out.data[di + 2] = out.data[si + 2];
          out.data[di + 3] = out.data[si + 3];
        }
      }
    }
    // A dark line along every cut edge, or a half block reads as a block
    // photographed badly. One texel, at the top of the slab and round the
    // step of the stair.
    const edge = (dst, x, y) => {
      const i = ((dst.y + y) * W + dst.x + x) * 4;
      if (!out.data[i + 3]) return;
      out.data[i] = Math.round(out.data[i] * 0.45);
      out.data[i + 1] = Math.round(out.data[i + 1] * 0.45);
      out.data[i + 2] = Math.round(out.data[i + 2] * 0.45);
    };
    if (b) for (let x = 0; x < TS; x++) edge(b, x, half);
    for (let x = 0; x < half; x++) edge(c, x, half);
    for (let y = half; y < TS; y++) edge(c, half, y);
  }
}

// --- hand-painted tiles ------------------------------------------------------
//
// The block maker (blocks.html) paints a tile texel by texel and saves it to
// blocks/. Those files are not a style — they sit ON one, keyed by style and
// tile, so painting the stone of `real` leaves the stone of `classic` alone and a
// tile you never touched still comes from the generator and still improves
// when the generator does.
//
// Stored as a palette plus run-length pairs: a 32x32 tile is 1024 texels, most
// of them repeats of their neighbour, and a run list stays readable in a diff.
//
// A painting on the REALISTIC style is a second kind (version 2): a tile the
// size of a photograph's block (256 texels), kept as two PNGs — what was
// painted, and a mask of WHERE — because it is laid over the photograph
// rather than instead of it. A mark painted on stone stays a mark on stone;
// the texels nobody touched stay the photograph, relief and all, and a
// two-block photograph keeps its two-block repeat under the paint. It cannot
// go into the atlas here, because it needs the photograph under it and that
// arrives later: realism.js lays it in, and hands the atlas the result.
const overrides = new Map();      // `${styleId}/${tile}` -> Uint8ClampedArray
const paintings = new Map();      // `${styleId}/${tile}` -> the saved record, either kind
const generated = new Map();      // style -> the atlas as the generator left it

// The Realistic style's photographs at the atlas's own 32 texels, handed over
// by realism.js once they have loaded — see the end of paintAtlas. Tile ->
// RGBA bytes, TS by TS, rows top first like everything else in the atlas.
const realTiles = new Map();
export function setRealTiles(map) {
  realTiles.clear();
  for (const [tile, px] of map) realTiles.set(tile, px);
}

export function setTileOverrides(list = []) {
  overrides.clear();
  paintings.clear();
  for (const o of list) {
    if (!o || !o.style || o.tile == null) continue;
    // the realistic kind: laid over its photograph by realism.js
    if (o.version === 2 && o.paint && o.mask && o.n) {
      paintings.set(`${o.style}/${o.tile}`, o);
      continue;
    }
    if (!o.palette || !o.runs) continue;
    paintings.set(`${o.style}/${o.tile}`, o);
    const px = new Uint8ClampedArray(TS * TS * 4);
    let i = 0;
    for (const [idx, n] of o.runs) {
      const c = o.palette[idx];
      // a null palette entry is transparent, which glass and ladders need
      const [r, g, b, a] = c === null ? [0, 0, 0, 0]
        : [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16),
          parseInt(c.slice(5, 7), 16), 255];
      for (let k = 0; k < n && i < TS * TS; k++, i++) {
        px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = a;
      }
    }
    overrides.set(`${o.style}/${o.tile}`, px);
  }
  return overrides.size;
}

export const tileOverrideCount = () => overrides.size;

// Every painting saved against one style, either kind, as the records came
// off disk — what realism.js lays over the photographs.
export function tilePaintings(style) {
  const out = [];
  for (const [k, o] of paintings) if (k.startsWith(`${style}/`)) out.push(o);
  return out;
}

// One tile as the generator painted it in a style — no photograph, no
// painting — or null if that style's atlas has not been built on this page.
export function generatedTile(tile, style = currentStyle().id) {
  const all = generated.get(style);
  if (!all) return null;
  const W = COLS * TS, ox = (tile % COLS) * TS, oy = ((tile / COLS) | 0) * TS;
  const px = new Uint8ClampedArray(TS * TS * 4);
  for (let y = 0; y < TS; y++) {
    px.set(all.subarray(((oy + y) * W + ox) * 4, ((oy + y) * W + ox + TS) * 4), y * TS * 4);
  }
  return px;
}

function applyOverrides(out) {
  if (!overrides.size) return;
  const id = currentStyle().id, W = COLS * TS;
  for (let tile = 0; tile < COLS * ROWS; tile++) {
    const px = overrides.get(`${id}/${tile}`);
    if (!px) continue;
    const ox = (tile % COLS) * TS, oy = ((tile / COLS) | 0) * TS;
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        const s = (y * TS + x) * 4, d = ((oy + y) * W + ox + x) * 4;
        out.data[d] = px[s];
        out.data[d + 1] = px[s + 1];
        out.data[d + 2] = px[s + 2];
        out.data[d + 3] = px[s + 3];
      }
    }
  }
}

/** The current atlas pixels for one tile, which is what the maker edits. */
export function tilePixelsOf(texture, tile) {
  const cv = texture.image;
  const g = cv.getContext('2d');
  const ox = (tile % COLS) * TS, oy = ((tile / COLS) | 0) * TS;
  return g.getImageData(ox, oy, TS, TS);
}

const EPS = 0.5 / TS; // half-texel inset (in tile space) against atlas bleeding

// (tile, u, v in 0..1) -> atlas UV. v = 1 is the top of the drawn tile.
export function tileUV(tile, u, v) {
  const col = tile % COLS, row = (tile / COLS) | 0;
  const tu = EPS + u * (1 - 2 * EPS);
  const tv = EPS + v * (1 - 2 * EPS);
  return [(col + tu) / COLS, (ROWS - 1 - row + tv) / ROWS];
}
