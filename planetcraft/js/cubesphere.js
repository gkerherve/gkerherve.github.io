// cubesphere.js — the planet as six surface-aligned grids.
//
// An axis-aligned voxel grid cannot hold a sphere without staircasing: a
// perfectly smooth voxel sphere still has a 32 degree average surface slope,
// peaking at 54.7 degrees (arctan sqrt 2, the cube body diagonal), and that
// angle does not shrink with radius. See tests.html.
//
// So the blocks follow the sphere instead. The planet is a "quadrilateralized
// spherical cube": six faces, each an S x S grid of columns, each column H
// cells tall. A cell is addressed (f, u, v, h) and occupies the region
// between two angular steps and two radii, so its top face is always
// perpendicular to the local up. The ground is therefore genuinely flat under
// your feet everywhere, exactly like a normal Minecraft world.
//
// Cells are very slightly trapezoidal (the tangent warp below keeps the
// angular size uniform, so the width varies by only a few percent).
//
// Nothing is stored per cell. A flat array over the shell is 1.4 GB at radius
// 800 and takes minutes to fill, so the world is held as a height field plus
// a sparse override — see "storage" below.

// sealWater: how far from the water a cave is flooded, in columns, and how
// far below the water line
const SEAL_REACH = 3;
const SEAL_DEPTH = 14;

export const BLOCK = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAF: 7,
  COAL: 8,
  IRON: 9,
  SILVER: 10,
  DIAMOND: 11,
  PLANK: 12,
  COBBLE: 13,
  // building materials village.js and items.js were already written against;
  // both resolve blocks by name, so adding them here is all that is needed
  GLASS: 14,
  BRICK: 15,
  THATCH: 16,
  PATH: 17,
  FARMLAND: 18,
  WHEAT: 19,
  FENCE: 20,
  LANTERN: 21,
  CHEST: 22,
  STRIPPED_LOG: 23,
  TILLED: 24,
  GRAVEL: 25,
  CLAY: 26,

  // --- plants (cross-plane, not cubes) -----------------------------------
  FLOWER_RED: 27,
  FLOWER_YELLOW: 28,
  FLOWER_BLUE: 29,
  MUSHROOM: 30,
  SAPLING: 31,
  WHEAT_YOUNG: 32,   // WHEAT (19) is the ripe stage

  // --- ladders ------------------------------------------------------------
  // A ladder hangs on a wall, so it needs a facing like a stair does. Four
  // ids, 33..36, in the same order stairs use: +u, -u, +v, -v.
  //   LADDER_BASE + facing
  // LADDER is the +u one, so code that does not care about orientation can
  // still say BLOCK.LADDER.
  LADDER_BASE: 33,   // 33..36
  LADDER: 33,

  // --- crafting stations and odds and ends --------------------------------
  // items.js already had items for all of these; without the block ids they
  // resolved to null and simply could not be placed.
  CRAFTING_TABLE: 37,
  FURNACE: 38,
  TORCH: 39,

  // --- stairs and slabs ---------------------------------------------------
  // A cell is one byte, so orientation lives in the id. Stairs occupy 16 ids:
  //   STAIR_BASE + material * 4 + facing,  facing 0..3 = +u, -u, +v, -v
  // Slabs occupy 8:
  //   SLAB_BASE + material * 2 + half,     half 0 = bottom, 1 = top
  // Materials for both, in order: PLANK, COBBLE, BRICK, THATCH.
  STAIR_BASE: 40,    // 40..55
  SLAB_BASE: 56,     // 56..63

  // 64+ is clear: stairs and slabs occupy everything up to 63
  SNOW: 64,
  ICE: 65,

  // Lava. A FLUID, not ground: it fills its cell but does not hold you up, so
  // surfaceRadius reports the bed under a lava lake exactly as it does under
  // water, and you sink in. Nothing here burns you — HAZARD below is the hook
  // combat.js is expected to read.
  LAVA: 66,

  // --- furniture ----------------------------------------------------------
  // Box-union shapes like stairs (see cubemesher.js FURNITURE): they wear
  // existing materials and only partly fill their cell. A chair has a back,
  // so it needs a facing — four ids, stairs' order: +u, -u, +v, -v. The
  // facing is the side the backrest stands on.
  TABLE: 67,
  CHAIR_BASE: 68,    // 68..71
  CHAIR: 68,
  // Lights. LAMP is the indoor one — a shaded lamp standing on its base;
  // STREET_LAMP is a head for a post, the top block of a village lamp post.
  // Neither propagates light (nothing does); blockanim.js gives both a glow
  // that brightens as the day dims.
  LAMP: 72,
  STREET_LAMP: 73,
  // A campfire: crossed logs over an ember bed, low enough to step over.
  // The flames are not blocks — blockanim.js keeps a fire of sprites going
  // above it, the same machinery a lit furnace uses.
  CAMPFIRE: 74,
  // A fence gate, in its two states. Closed it is fence: same look of post
  // and bars, same head-high collision. Open it is a gap you walk through —
  // the leaves stand swung back against the posts and nothing blocks the
  // cell. useBlock flips one id to the other.
  GATE: 75,
  GATE_O: 76,

  // --- metals -------------------------------------------------------------
  // Gold in the rock. It sits between silver and iron in ORE_BASE below, so
  // it is rarer than iron and shallower than silver; there is nothing to do
  // with a gold ingot but alloy it into brass, which is the point of it.
  GOLD: 77,
  // Storage blocks: nine ingots or gems pressed into one cell, and the same
  // nine back out of the bench when you uncraft it. They are the only reason
  // a deep mine ever runs out of bag space rather than out of ore.
  BLOCK_IRON: 78,
  BLOCK_GOLD: 79,
  BLOCK_DIAMOND: 80,
  BLOCK_BRASS: 81,

  // --- glass ---------------------------------------------------------------
  // Tinted glass, one id per colour: TINT_BASE + colour, in GLASS_TINTS
  // order. Same block as GLASS in every other respect.
  TINT_BASE: 82,     // 82..89
  // Panes. A pane is a SHEET through the middle of its cell rather than a
  // cube, so a one-block gap in a wall reads as a window instead of as a
  // glass brick. Clear first, then the same eight tints in the same order, so
  // going between a pane and the block it is cut from is arithmetic.
  PANE: 90,
  PANE_BASE: 91,     // 91..98

  // --- wood species ---------------------------------------------------------
  // LOG (6) and PLANK (12) are species 0, the oak this world was built on.
  // These are the other four, in WOOD_SPECIES order. Trees still grow oak
  // everywhere — a species in the generator would be a change to the world's
  // identity, and the point here is being able to BUILD in five timbers.
  LOG_BASE: 99,      // 99..102
  PLANK_BASE: 103,   // 103..106

  // --- copper, zinc and tin -------------------------------------------------
  // The three ores the real alloys are made of: brass is copper and zinc,
  // bronze is copper and tin. Brass used to be gold beaten into iron, which
  // was a stand-in invented when no copper existed; gold is gold again.
  //
  // Copper is the shallowest metal in the table and the only one a WOODEN pick
  // will lift, so a world now hands you a metal before it hands you a stone
  // tool. Tin is the rarest of the three, which is what makes bronze — the
  // best of the non-iron alloys — worth the depth.
  COPPER: 107,
  ZINC: 108,
  TIN: 109,
  // The rest of the storage blocks, on the terms the first four set: nine
  // ingots in one cell, nine back out of the bench. Silver joins them because
  // it was the one metal you could mine by the stackful and not press.
  BLOCK_COPPER: 110,
  BLOCK_ZINC: 111,
  BLOCK_TIN: 112,
  BLOCK_BRONZE: 113,
  BLOCK_SILVER: 114,

  // --- a post to stand a lamp on --------------------------------------------
  // The fence's centre post without its rails: a slim mast that stacks. A
  // village lamp used to stand on a column of FULL blocks, which is a lamp on
  // top of a wall — the thickness is the whole point of this block.
  POST: 115,

  // --- cement ---------------------------------------------------------------
  // A flat, matte, strongly coloured cube: CEMENT_BASE + colour, in the same
  // GLASS_TINTS order the glass uses. Reusing that order is the point — a red
  // wall and the red window in it are the same red, and "tint index" already
  // means one thing in the world, the atlas and the bags.
  //
  // It is an ordinary OPAQUE cube. It is not in TRANSPARENT and it does not go
  // near the blended glass pass: the whole appeal of the material is that it
  // is a solid block of colour with no grain in it at all.
  CEMENT_BASE: 116,  // 116..123

  // --- books ----------------------------------------------------------------
  // A full block of planks with two shelves of books in it. Village libraries
  // are built out of these.
  BOOKSHELF: 124,

  // A cast bell on a headstock between two posts, for the top of a village
  // tower. Bronze, because that is what a bell is cast in and there is now
  // bronze to cast it from. It sits here, before the doors, so that DOOR_BASE
  // lands on an EVEN id — see below.
  BELL: 125,

  // --- doors ------------------------------------------------------------------
  // A doorway in a generated house was a HOLE. There has always been a door you
  // can make yourself — blockentity.js's Door, a plank declared a door at
  // runtime — but a block ENTITY cannot help a village: village.js runs while
  // the world is being generated, long before any of them exist. These are
  // ordinary block ids, so the generator can simply place one.
  //
  //   DOOR_BASE + type * 8 + facing * 2 + open
  //
  // facing is 0..3 in stairs' order (+u, -u, +v, -v) and names the side of the
  // cell the closed leaf lies against, so a door hangs IN a wall rather than
  // across the middle of the gap.
  //
  // The base is EVEN on purpose. `open` is the units bit of the offset, so with
  // an even base it is also the units bit of the id itself, and swinging a door
  // is `id ^ 1` — one XOR, no table, and it cannot get out of step with the
  // encoding above.
  DOOR_BASE: 126,   // 126..181

  // --- the kitchen garden ----------------------------------------------------
  // Wheat was the only thing that grew. These are the other four, and they
  // work exactly as it does — two stages apiece, a young plant and a ripe one,
  // both cross-plane:
  //
  //   CROP_BASE + kind * 2 + stage,   stage 0 = young, 1 = ripe
  //
  // `kind` indexes CROP_TYPES below, and that array is the only place the
  // order is written down: the block ids, the atlas tiles and the item ids all
  // come off it, so a carrot cannot come to mean a potato in one file and not
  // in another. Nothing in world GENERATION places any of them — a crop only
  // ever exists because somebody planted it — so the planet stays the same
  // pure function of (radius, seed, preset) it has always been.
  CROP_BASE: 182,   // 182..189

  // --- desert sand ------------------------------------------------------------
  // Orange sand, and the whole of what a desert is made of. It is a SECOND
  // sand rather than a tint on the first because a desert has to be a place
  // you can tell you are standing in from the block under your boot, and
  // because sand you dig out of a dune and carry home should still be desert
  // sand when you put it back down in a wall.
  //
  // It behaves as sand in every other respect: a shovel lifts it, it holds
  // you up, and it is the top of its own soil profile — five blocks of it
  // before the rock, where ordinary ground gets four of dirt.
  SAND_ORANGE: 190,

  // --- wool -------------------------------------------------------------------
  // Fleece, in ten colours: the eight the dyes already make, then brown and
  // grey, which no dye makes and only a sheep does. That split is the whole
  // design. A sheep is born white, brown, grey or black — the four colours a
  // real flock comes in — and the wool you shear off it is that colour. The
  // other six exist only because somebody put a dye to a fleece.
  //
  // So the naturals are the ones you find and the dyed ones are the ones you
  // make, and a brown bed says "I kept brown sheep" in a way a blue one
  // cannot.
  WOOL_BASE: 191,   // 191..200

  // --- beds --------------------------------------------------------------------
  // One cell, because block ids are a byte and a two-cell bed in ten colours
  // and four facings would eat every id left in the world. What it costs is
  // that a bed is a cot rather than a double; what it buys is that the whole
  // palette exists and beds can be built anywhere.
  //
  //   BED_BASE + colour * 4 + facing
  //
  // facing is stairs' order (+u, -u, +v, -v) and names the side the PILLOW is
  // on, so a bed placed against a wall puts its head to the wall.
  BED_BASE: 201,    // 201..240
  // The chief's hall, and the two things in it that are not a wall or a
  // chair. Both are FURNITURE — thin boxes through the mesher's furniture
  // path, wearing real block textures — so neither costs a tile.
  //
  //   CARPET_BASE + colour, in the glass-tint order
  //
  // Eight colours and not the wool's ten. 255 is the override sentinel, so the
  // ids run out at 254, and a book stand is worth more to this game than a
  // brown rug and a grey one.
  CARPET_BASE: 241,   // 241..248
  //   PAINTING_BASE + facing (the wall it hangs on: +u, -u, +v, -v)
  PAINTING_BASE: 249, // 249..252
  // A reading desk: a post with a sloped top and a book open on it. One id,
  // no facing — it is square in plan and you walk round it.
  LECTERN: 253,

  // --- bamboo -------------------------------------------------------------
  // A jointed cane that stacks: one id, and a grove is a column of them. It
  // takes 254 because 254 was the last id the byte had, and a plant that only
  // ever needs one is the right thing to spend the last one on.
  BAMBOO: 254,

  // --- past the byte ----------------------------------------------------------
  // 255 used to be the override sentinel and the ceiling of this whole enum: a
  // cell was one byte, which is why a bed is a cot and why the carpets got
  // eight colours and the wool ten. The cell is a Uint16 now (see "storage"
  // below), so the sentinel moved to 0xffff and the ids carry on.
  //
  // Nothing under 254 moved. That is the whole point: a saved world's edit
  // diff is block ids, so renumbering one of them would quietly rebuild
  // somebody's house out of a different material. New families go on the end.
  //
  // 255 is deliberately skipped rather than used. It was a sentinel for the
  // life of this file and anything that still treats it as one — a byte array
  // somewhere off in a tool, a test, a save from last week — fails loudly on
  // a block that never exists instead of quietly on one that does.
  //
  // The kitchen garden, part two: pumpkin and watermelon, two stages apiece on
  // exactly wheat's terms. They could not follow the first four — 190 was
  // already desert sand — so cropId reads a table of bases rather than adding
  // to one, and CROP_TYPES stays the only place the order is written down.
  CROP2_BASE: 256,   // 256..259

  // --- doors hung the other way round -----------------------------------------
  // A DOUBLE door is a mirrored pair: the left leaf on the left jamb, the right
  // leaf on the right, so they part in the middle and swing away from each
  // other. Hung the same way round they are not a pair — they are one door cut
  // in half, which is what every two-cell opening on this planet used to be.
  //
  // Which jamb a leaf hangs on cannot be said with the ids above. `facing` is
  // spoken for: all four of its values name a wall, and none of them is spare
  // to mean a hinge. So the hinge side is a bit of its own — and a bit of its
  // own has to be a second range, because the first one ends at 181 and 182 has
  // been a carrot since long before anybody wanted a pair of doors. CROP2_BASE
  // is here for exactly this reason, and nothing under 254 moves.
  //
  //   DOOR2_BASE + type * 8 + facing * 2 + open
  //
  // The same sum, so every reader below takes the offset off whichever base the
  // id falls in and carries on. EVEN, so swinging one is still `id ^ 1`.
  DOOR2_BASE: 260,   // 260..315

  // --- the mint ---------------------------------------------------------------
  // A screw press on a stone bed: the machine a village strikes its coin at.
  // Every settlement has one, because coin is the meter the whole game is
  // scored on and a village with no way of making any is a village that can
  // only ever spend. It goes in the SHOP, which is where a village's money
  // already is — see `shop` in village.js.
  //
  // It is FURNITURE as far as the mesher is concerned: a box union like the
  // bell, not a cube. A press that was a cube would be a crate.
  MINT: 316,

  // --- the other half of the bed ----------------------------------------------
  // A bed is TWO cells. It was one for as long as ids were a byte — the note
  // at BED_BASE still says so, and said so truthfully — but the cell is a
  // Uint16 now and the argument expired with the byte. What it cost was
  // visible from the doorway: a villager lying down is about a cell and a half
  // long, so a sleeper in a one-cell cot had two thirds of himself hanging off
  // the end over the floorboards. A bed you cannot fit in is a bed nobody
  // believes.
  //
  //   BED_FOOT_BASE + colour * 4 + facing
  //
  // The SAME colour and the SAME facing as its head, so the pair is one bed
  // said twice rather than two blocks that have to agree. facing still names
  // the side the PILLOW is on, and the foot cell is the neighbour one step
  // AGAINST it — see bedFootCell below, which is the only place that step is
  // written down.
  //
  // BED_BASE does not move and keeps meaning exactly what it meant: the head,
  // with the pillow and the board. So every saved world's edit diff still
  // reads back as the beds somebody laid, and an old one-cell bed in a save is
  // a head with no foot — which draws, and which you can still sleep in.
  BED_FOOT_BASE: 317,   // 317..356

  // --- street furniture -------------------------------------------------------
  // What the city asked for: things to sit on and things that just stand
  // there being a street. FURNITURE like the table and the mint — box unions
  // wearing textures the atlas already has — so neither costs a tile.
  //
  // A BENCH is a seat for the outdoors: plank boards on cobble feet with a
  // low back. Facing is stairs' order and names the side the BACK stands on,
  // exactly as a chair's does, so the same placement code hangs both.
  BENCH_BASE: 357,   // 357..360
  // A HYDRANT: a squat riveted post with two hose arms, iron head on a red
  // body. One id — it is square in plan and you walk round it.
  HYDRANT: 361,

  // --- grey cement ------------------------------------------------------------
  // Light, mid and dark, between the family's own white and black: the greys
  // a building is actually poured in. A separate small range because the
  // first family is locked to the eight glass tints and everything about
  // that order is load-bearing.
  CEMENT_GREY_BASE: 362,   // 362..364

  // --- power ------------------------------------------------------------------
  //
  // Four blocks and one idea: a DYNAMO makes power, WIRE carries it, a SWITCH
  // lets it through or does not, and anything on the end of the run does
  // something when it arrives. It is the first machinery in this world that is
  // not a person — and it is built entirely out of things the game already
  // has, which is why it costs four ids and no new save field:
  //
  //   * every one of them is an ordinary block. Placing one is an edit, so it
  //     ships on the wire and comes back out of the save exactly like a plank
  //   * the NETWORK is derived. Nothing stores which wires are live: js/power.js
  //     walks out from the sources every time something changes, the way the
  //     bell re-derives its village from the edit that is the bell. See the
  //     rule at the foot of CLAUDE.md — if two machines can work it out from
  //     what is already stored, it must not be stored
  //   * a SWITCH's position is the one thing somebody decided, so that IS
  //     stored: it is which of the two ids the cell holds
  WIRE: 365,
  // 366 open (dead), 367 closed (live). A lever reads its own state.
  SWITCH_BASE: 366,
  DYNAMO: 368,
  // 369 dark, 370 lit. A lamp with no power in it is a lamp, not a hole.
  POWER_LAMP_BASE: 369,

  // --- rails ------------------------------------------------------------------
  // Two ids, one per axis: 371 runs along u, 372 runs along v. Which one you
  // lay is decided at placement out of the way the player is facing, exactly
  // as a stair's facing is — see placeBlock in main.js — because you cannot
  // hold "the north-south rail" in your hand any more than you can hold a
  // north-facing stair.
  RAIL_BASE: 371,

  // Live wire. It is a SECOND ID rather than a flag because the mesher is the
  // thing that has to know — it draws the cable yellow when there is current
  // in it and grey when there is not — and the mesher sees blocks and the
  // world, never main.js's power register. Appended here rather than paired
  // with WIRE at 365 for the reason every id in this file is where it is: the
  // numbers are what saved worlds and the wire hold, and they do not move.
  WIRE_LIVE: 373,

  // --- true cobblestone -------------------------------------------------------
  // Rounded field stones set in dark joints — the block the player pointed at
  // and the thing a mined rock actually breaks into. What the game called
  // "cobblestone" until now is squared masonry and is named cobble brick from
  // here on; it keeps id 13 and every wall built of it. Three varieties,
  // because a paving that is all one stone reads as a texture rather than a
  // road: the plain grey, a mossy one, and a soot-dark one.
  COBBLESTONE: 374,
  COBBLESTONE_MOSSY: 375,
  COBBLESTONE_DARK: 376,

  // --- rail bends -------------------------------------------------------------
  // Four quarter-turns, so a line can go round a corner instead of only
  // crossing itself. Each id names its two ARMS — which way along u and which
  // way along v the irons leave the cell: bit 0 set means the u arm leaves
  // through -u, bit 1 the same for v. One rail item lays all of them: the
  // placement looks at the neighbours and bends to meet them — see placeBlock
  // in main.js — and a wagon entering along either arm leaves along the other.
  RAIL_TURN_BASE: 377,

  // --- masonry walls ----------------------------------------------------------
  // A fence in stone: thinner than a block, a post that reaches an arm out to
  // any neighbour it can join — another wall, a fence, a gate, or something
  // solid — and animal-proof on the same FENCE_EXTRA terms a fence is. Six
  // ids, one per material, in WALL_MATS order: brick, cobble brick, stone,
  // and the three cobblestones.
  WALL_BASE: 381,
  // Bank two of the stairs — see the helpers by STAIR_MATERIALS. Ten more
  // materials, four facings each: 400..439.
  STAIR2_BASE: 400,

  // --- the café and the smallest room ----------------------------------------
  // A SHISHA: a water pipe — a brass bulb, a stem, a clay bowl with the coal
  // on it, and the hose coiled down one side. One id, square in plan, and it
  // stands on a café table or on the floor beside a cushion. FURNITURE like
  // the lectern: a box union wearing tiles the atlas already has.
  SHISHA: 440,
  // A TOILET: a porcelain bowl with its cistern against the wall behind it,
  // so it wants a facing — stairs' order, and like a chair's it names the
  // side the BACK (the cistern) stands on. The sitter faces the other way.
  TOILET_BASE: 441,   // 441..444

  // --- what the bartender puts in front of you --------------------------------
  // GLASSES, and there are two of them because a village with a mosque does
  // not pour ale. A TEA GLASS is the tulip on its saucer an eastern café is
  // drunk out of; a TANKARD is a glass of ale with the head still on it. Both
  // stand on a counter or a table, both are furniture — a box union wearing
  // tiles the atlas already has, like the water pipe beside them — and the
  // vessel is clear glass with the drink an opaque band inside it, because a
  // liquid you can see through is a liquid nobody can see.
  TEA_GLASS: 445,
  TANKARD: 446,

  // --- a sign -------------------------------------------------------------------
  // A small board on a post you can WRITE ON — the one Minecraft has, because
  // a world you can leave a note in is a world somebody else can find their
  // way round. Four ids: the facing is the side the board FACES, which is the
  // side you read it from, stairs' order (+u, -u, +v, -v). The words are not
  // in the block: they are kept per cell by main.js (see js/signs.js), the
  // way a painting's picture is.
  SIGN_BASE: 447,     // 447..450
  // A BIN. An iron drum with a lid: whatever you use it holding is gone,
  // which is the one thing a bag full of cobble has never had a way to be.
  // One id, square in plan, furniture like the rest.
  BIN: 451,
};

// How many ids the world can hold. The cell is 16 bits, so this is a budget
// rather than a wall — it exists so the flat lookup tables below (HARD,
// subFor) are sized once, off one number, instead of each guessing.
export const BLOCK_IDS = 512;

// The crops after wheat, in id order. Wheat is not in this list: it has its
// own two ids from before the family existed, and moving it would change every
// saved world that has a field in it.
//
// The list is the ONLY place the order is written down — the block ids, the
// atlas tiles and the item ids are all read off it — but the ids themselves
// are no longer one sum. The first four are contiguous from CROP_BASE; the two
// after them start again at CROP2_BASE because 190 was already desert sand by
// the time anybody wanted a pumpkin. So the bases are a table, and every
// helper below reads that table instead of doing arithmetic on one number.
export const CROP_TYPES = [
  'carrot', 'potato', 'pepper', 'salad', 'pumpkin', 'watermelon',
];
const CROP_RUNS = [[BLOCK.CROP_BASE, 4], [BLOCK.CROP2_BASE, 2]];
const CROP_BASES = [];
for (const [base, n] of CROP_RUNS) {
  for (let i = 0; i < n && CROP_BASES.length < CROP_TYPES.length; i++) {
    CROP_BASES.push(base + i * 2);
  }
}
// block id -> kind, for the two lookups that go the other way. A map rather
// than a scan because isCropId is asked once per cell by the mesher.
const CROP_OF = new Map();
CROP_BASES.forEach((base, kind) => {
  CROP_OF.set(base, [kind, 0]);
  CROP_OF.set(base + 1, [kind, 1]);
});
export const cropId = (kind, stage) =>
  CROP_BASES[kind] == null ? null : CROP_BASES[kind] + (stage ? 1 : 0);
export const isCropId = (b) => CROP_OF.has(b);
export const cropKind = (b) => CROP_OF.get(b)?.[0] ?? -1;
export const cropStage = (b) => CROP_OF.get(b)?.[1] ?? 0;

// stair/slab helpers — the single source of truth for the id encoding
//
// TWO BANKS. The first four materials live where they always did, 40..55,
// wedged under SNOW at 64 — sixteen ids that cannot grow without moving
// every saved world's snow. So the rest of the materials live in a second
// bank up at STAIR2_BASE, with the same encoding, and the helpers below are
// the only things that know there are two: the mesher, the raycast and the
// physics all ask THEM, so a stone stair is meshed, walked and mined by the
// code that has always meshed the wooden one.
export const STAIR_MATERIALS = [
  BLOCK.PLANK, BLOCK.COBBLE, BLOCK.BRICK, BLOCK.THATCH,
  // bank two, in an order that is now a save-format promise
  BLOCK.PATH, BLOCK.STONE, BLOCK.DIRT, BLOCK.SAND, BLOCK.SAND_ORANGE,
  BLOCK.GRAVEL, BLOCK.CLAY, BLOCK.SNOW, BLOCK.LOG, BLOCK.GLASS,
];
const STAIR2_AT = 4;               // where bank two begins in the list above
export const stairId = (mat, facing) => (mat < STAIR2_AT
  ? BLOCK.STAIR_BASE + mat * 4 + facing
  : BLOCK.STAIR2_BASE + (mat - STAIR2_AT) * 4 + facing);
export const slabId = (mat, half) => BLOCK.SLAB_BASE + mat * 2 + half;
export const isStair = (b) => (b >= BLOCK.STAIR_BASE && b < BLOCK.STAIR_BASE + 16)
  || (b >= BLOCK.STAIR2_BASE
    && b < BLOCK.STAIR2_BASE + (STAIR_MATERIALS.length - STAIR2_AT) * 4);
export const isSlab = (b) => b >= BLOCK.SLAB_BASE && b < BLOCK.SLAB_BASE + 8;
export const stairMaterial = (b) => (b >= BLOCK.STAIR2_BASE
  ? STAIR_MATERIALS[STAIR2_AT + (((b - BLOCK.STAIR2_BASE) / 4) | 0)]
  : STAIR_MATERIALS[((b - BLOCK.STAIR_BASE) / 4) | 0]);
export const stairFacing = (b) => (b >= BLOCK.STAIR2_BASE
  ? (b - BLOCK.STAIR2_BASE) % 4
  : (b - BLOCK.STAIR_BASE) % 4);
export const slabMaterial = (b) => STAIR_MATERIALS[((b - BLOCK.SLAB_BASE) / 2) | 0];
export const slabHalf = (b) => (b - BLOCK.SLAB_BASE) % 2;

// ladders: same facing order as stairs (0..3 = +u, -u, +v, -v)
export const ladderId = (facing) => BLOCK.LADDER_BASE + facing;
export const isLadder = (b) => b >= BLOCK.LADDER_BASE && b < BLOCK.LADDER_BASE + 4;
export const ladderFacing = (b) => b - BLOCK.LADDER_BASE;

// chairs: the one piece of furniture with an orientation
export const chairId = (facing) => BLOCK.CHAIR_BASE + (facing & 3);
export const isChair = (b) => b >= BLOCK.CHAIR_BASE && b < BLOCK.CHAIR_BASE + 4;
export const chairFacing = (b) => b - BLOCK.CHAIR_BASE;
export const benchId = (facing) => BLOCK.BENCH_BASE + (facing & 3);
export const isBench = (b) => b >= BLOCK.BENCH_BASE && b < BLOCK.BENCH_BASE + 4;
export const benchFacing = (b) => b - BLOCK.BENCH_BASE;
// ...and the toilet, on the chair's terms: the facing is where the cistern
// stands, which is the wall it backs onto
export const toiletId = (facing) => BLOCK.TOILET_BASE + (facing & 3);
export const isToilet = (b) => b >= BLOCK.TOILET_BASE && b < BLOCK.TOILET_BASE + 4;
export const toiletFacing = (b) => b - BLOCK.TOILET_BASE;
// ...and the sign, whose facing is the side you READ it from
export const signId = (facing) => BLOCK.SIGN_BASE + (facing & 3);
export const isSign = (b) => b >= BLOCK.SIGN_BASE && b < BLOCK.SIGN_BASE + 4;
export const signFacing = (b) => (b - BLOCK.SIGN_BASE) & 3;

// --- power ------------------------------------------------------------------
//
// Two ids apiece for the things that have a state you can see, one each for
// the things that do not. `on` is always the odd id, so every one of these is
// a bit test rather than a table.
// A cable, dead or live. `wireId(true)` is the one with current in it — see
// power.js, which is the only thing that decides which a cell holds.
export const wireId = (live) => (live ? BLOCK.WIRE_LIVE : BLOCK.WIRE);
export const isWire = (b) => b === BLOCK.WIRE || b === BLOCK.WIRE_LIVE;
export const wireLive = (b) => b === BLOCK.WIRE_LIVE;
export const switchId = (on) => BLOCK.SWITCH_BASE + (on ? 1 : 0);
export const isSwitch = (b) => b === BLOCK.SWITCH_BASE
  || b === BLOCK.SWITCH_BASE + 1;
export const switchOn = (b) => b === BLOCK.SWITCH_BASE + 1;
export const powerLampId = (on) => BLOCK.POWER_LAMP_BASE + (on ? 1 : 0);
export const isPowerLamp = (b) => b === BLOCK.POWER_LAMP_BASE
  || b === BLOCK.POWER_LAMP_BASE + 1;
export const powerLampOn = (b) => b === BLOCK.POWER_LAMP_BASE + 1;
// A RAIL. `axis` is 0 for a run along u and 1 for a run along v; a wagon
// reads it to know which way the track goes under it — see js/wagon.js.
export const railId = (axis) => BLOCK.RAIL_BASE + (axis ? 1 : 0);
export const isRail = (b) => b === BLOCK.RAIL_BASE || b === BLOCK.RAIL_BASE + 1;
export const railAxis = (b) => b - BLOCK.RAIL_BASE;
// ...and the bends. `railTurnArms` answers the two directions the irons leave
// the cell in, as signs along u and v — everything that walks a line (the
// wagon, the placement's neighbour test) reads the bend through this and
// never touches the id arithmetic.
export const railTurnId = (uNeg, vNeg) =>
  BLOCK.RAIL_TURN_BASE + (uNeg ? 1 : 0) + (vNeg ? 2 : 0);
export const isRailTurn = (b) =>
  b >= BLOCK.RAIL_TURN_BASE && b < BLOCK.RAIL_TURN_BASE + 4;
export const railTurnArms = (b) => {
  const k = b - BLOCK.RAIL_TURN_BASE;
  return [(k & 1) ? -1 : 1, (k & 2) ? -1 : 1];
};
export const isRailAny = (b) => isRail(b) || isRailTurn(b);

// A MASONRY WALL. One id per material; the shape is the mesher's business —
// it reads the neighbours and reaches an arm at whatever a wall can join.
export const WALL_MATS = ['BRICK', 'COBBLE', 'STONE',
  'COBBLESTONE', 'COBBLESTONE_MOSSY', 'COBBLESTONE_DARK'];
export const wallId = (i) => BLOCK.WALL_BASE + i;
export const isWall = (b) =>
  b >= BLOCK.WALL_BASE && b < BLOCK.WALL_BASE + WALL_MATS.length;
export const wallMat = (b) => BLOCK[WALL_MATS[b - BLOCK.WALL_BASE]];

// Anything the network cares about, which is what main.js keeps its register
// of — see the power section there.
export const isPowerBlock = (b) => isWire(b) || isSwitch(b)
  || b === BLOCK.DYNAMO || isPowerLamp(b);

// every furniture id, for the passes that treat them alike
export const isFurniture = (b) => b === BLOCK.TABLE || isChair(b)
  || b === BLOCK.LAMP || b === BLOCK.STREET_LAMP || b === BLOCK.CAMPFIRE
  || isBedBlock(b) || isCarpetBlock(b) || isPaintingBlock(b)
  || b === BLOCK.LECTERN || b === BLOCK.MINT
  || (b >= BLOCK.BENCH_BASE && b < BLOCK.BENCH_BASE + 4)
  || b === BLOCK.HYDRANT
  || b === BLOCK.SHISHA || isToilet(b) || isSign(b) || b === BLOCK.BIN
  || b === BLOCK.TEA_GLASS || b === BLOCK.TANKARD
  // ...and the power blocks, which are all box unions: a cable on the floor,
  // a lever on its plate, a machine with a drum on top, a lamp on a stalk.
  || isWire(b) || isSwitch(b) || b === BLOCK.DYNAMO || isPowerLamp(b)
  // ...and a rail, which is two irons on a sleeper and no more a cube than a
  // cable is
  || isRail(b) || isRailTurn(b);
function isCarpetBlock(b) {
  return b >= BLOCK.CARPET_BASE && b < BLOCK.CARPET_BASE + 8;
}
function isPaintingBlock(b) {
  return b >= BLOCK.PAINTING_BASE && b < BLOCK.PAINTING_BASE + 4;
}
// Declared before isBed exists further down the file, and only ever CALLED at
// runtime — a function declaration hoists, a const arrow does not.
function isBedBlock(b) {
  return (b >= BLOCK.BED_BASE && b < BLOCK.BED_BASE + 40)
    || (b >= BLOCK.BED_FOOT_BASE && b < BLOCK.BED_FOOT_BASE + 40);
}

// --- glass ------------------------------------------------------------------
// Eight tints, and a pane of each. The order is the source of truth for the
// block ids, the item ids and the atlas tiles alike, so a colour cannot end
// up meaning two different things in two files.
export const GLASS_TINTS = [
  'white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black',
];
const TINTS = GLASS_TINTS.length;

export const tintedGlassId = (i) => BLOCK.TINT_BASE + (i % TINTS);
export const isTintedGlass = (b) =>
  b >= BLOCK.TINT_BASE && b < BLOCK.TINT_BASE + TINTS;
export const glassTint = (b) => b - BLOCK.TINT_BASE;

// A pane's tint, with -1 for clear — the same convention `paneId` takes back.
export const paneId = (tint = -1) =>
  (tint < 0 ? BLOCK.PANE : BLOCK.PANE_BASE + (tint % TINTS));
export const isPane = (b) => b === BLOCK.PANE
  || (b >= BLOCK.PANE_BASE && b < BLOCK.PANE_BASE + TINTS);
export const paneTint = (b) => (b === BLOCK.PANE ? -1 : b - BLOCK.PANE_BASE);
// The full block a pane is cut from. The mesher asks for this rather than
// carrying a second tile table: a pane is glass, only thinner.
export const paneGlass = (b) =>
  (b === BLOCK.PANE ? BLOCK.GLASS : tintedGlassId(paneTint(b)));

export const isGlass = (b) =>
  b === BLOCK.GLASS || isTintedGlass(b) || isPane(b);

// --- cement -------------------------------------------------------------------
// The same eight colours as the glass, in the same order, so a tint index means
// one thing everywhere. Unlike the glass it is a plain opaque cube: nothing
// below adds it to TRANSPARENT, and cubemesher must not send it to the glass
// pass — a wall of cement that you can see through is not cement.
export const cementId = (i) => BLOCK.CEMENT_BASE + (i % TINTS);
export const cementGreyId = (i) => BLOCK.CEMENT_GREY_BASE + (((i % 3) + 3) % 3);
export const isCementGrey = (b) =>
  b >= BLOCK.CEMENT_GREY_BASE && b < BLOCK.CEMENT_GREY_BASE + 3;
export const isCement = (b) =>
  b >= BLOCK.CEMENT_BASE && b < BLOCK.CEMENT_BASE + TINTS;
export const cementTint = (b) => b - BLOCK.CEMENT_BASE;

// --- wool and beds ------------------------------------------------------------
// The dye tints first, in the dyes' own order, so `tint index` keeps meaning
// one thing; then the two a bottle of dye cannot produce.
export const WOOL_COLOURS = [...GLASS_TINTS, 'brown', 'grey'];
const WOOLS = WOOL_COLOURS.length;

// The four a sheep is actually born in, as indices into WOOL_COLOURS. White is
// far and away the commonest fleece in a real flock and the weights say so.
export const FLEECE_COLOURS = [0, 8, 9, 7];      // white, brown, grey, black
export const FLEECE_WEIGHTS = [0.62, 0.16, 0.13, 0.09];

export const woolId = (i) => BLOCK.WOOL_BASE + (((i % WOOLS) + WOOLS) % WOOLS);
export const isWool = (b) =>
  b >= BLOCK.WOOL_BASE && b < BLOCK.WOOL_BASE + WOOLS;
export const woolColour = (b) => b - BLOCK.WOOL_BASE;

export const bedId = (colour = 0, facing = 0) =>
  BLOCK.BED_BASE + (((colour % WOOLS) + WOOLS) % WOOLS) * 4 + (facing & 3);
// A carpet: a rug one finger thick, in the wool colours. Walkable — see
// PASSABLE below — because a rug you cannot stand on is a step.
export const carpetId = (tint) => BLOCK.CARPET_BASE + (((tint % 8) + 8) % 8);
export const isCarpet = (b) => isCarpetBlock(b);
export const carpetTint = (b) => b - BLOCK.CARPET_BASE;

// A painting: a framed panel flat against a wall, facing out of it.
export const paintingId = (facing) => BLOCK.PAINTING_BASE + (facing & 3);
export const isPainting = (b) => isPaintingBlock(b);
export const paintingFacing = (b) => (b - BLOCK.PAINTING_BASE) & 3;

// A bed is two cells: the HEAD carries the pillow and the board, the FOOT is
// the rest of the mattress. `isBed` means "part of a bed" and is what every
// wall, mesh and footing test wants; `isBedHead` is what the things that count
// beds want, because a bed you can sleep in is one bed and not two.
export const bedFootId = (colour = 0, facing = 0) =>
  BLOCK.BED_FOOT_BASE + (((colour % WOOLS) + WOOLS) % WOOLS) * 4 + (facing & 3);
export const isBedHead = (b) =>
  b >= BLOCK.BED_BASE && b < BLOCK.BED_BASE + WOOLS * 4;
export const isBedFoot = (b) =>
  b >= BLOCK.BED_FOOT_BASE && b < BLOCK.BED_FOOT_BASE + WOOLS * 4;
export const isBed = (b) => isBedHead(b) || isBedFoot(b);
const bedBase = (b) => (isBedFoot(b) ? BLOCK.BED_FOOT_BASE : BLOCK.BED_BASE);
export const bedColour = (b) => ((b - bedBase(b)) / 4) | 0;
export const bedFacing = (b) => (b - bedBase(b)) & 3;

// WHICH WAY THE BED LIES, as a cell step. `facing` names the side the pillow
// is on, in stairs' order (+u, -u, +v, -v), so this is the step from the foot
// TOWARD the head — and the foot cell of a head at (u,v) is (u,v) minus it.
// One table, so nothing else has to get the sign right a second time.
export const BED_STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const bedFootCell = (u, v, facing) => {
  const [du, dv] = BED_STEP[facing & 3];
  return [u - du, v - dv];
};
export const bedHeadCell = (u, v, facing) => {
  const [du, dv] = BED_STEP[facing & 3];
  return [u + du, v + dv];
};

// --- wood species -----------------------------------------------------------
// Species 0 is the oak the world already grows, and its ids are the original
// LOG and PLANK — so every line of code that says BLOCK.LOG still means what
// it always meant, and nothing that generates terrain has to change.
export const WOOD_SPECIES = ['oak', 'birch', 'spruce', 'acacia', 'dark'];
const SPECIES = WOOD_SPECIES.length;

export const logId = (s = 0) => (s ? BLOCK.LOG_BASE + (s - 1) : BLOCK.LOG);
export const plankId = (s = 0) => (s ? BLOCK.PLANK_BASE + (s - 1) : BLOCK.PLANK);
export const isLog = (b) => b === BLOCK.LOG
  || (b >= BLOCK.LOG_BASE && b < BLOCK.LOG_BASE + SPECIES - 1);
export const isPlank = (b) => b === BLOCK.PLANK
  || (b >= BLOCK.PLANK_BASE && b < BLOCK.PLANK_BASE + SPECIES - 1);
export const logSpecies = (b) => (b === BLOCK.LOG ? 0 : b - BLOCK.LOG_BASE + 1);
export const plankSpecies = (b) =>
  (b === BLOCK.PLANK ? 0 : b - BLOCK.PLANK_BASE + 1);

// --- doors --------------------------------------------------------------------
// Seven leaves: the five timbers the bench can saw, plus iron and glass. Below
// WOOD_SPECIES because it is built from it — one list of timbers, so a door
// cannot come to mean a species the planks do not have.
//
// The names are deliberately `*DoorBlock` and not `*Door`: blockentity.js
// already owns `isDoor` and `toggleDoor` for the runtime kind a player makes
// out of a plank, and two things of the same name in two modules is how a wire
// gets crossed.
export const DOOR_TYPES = [...WOOD_SPECIES, 'iron', 'glass'];
const DOORS = DOOR_TYPES.length;

// `hinge` 0 is the leaf this game has always hung and must keep hanging: every
// call that predates the pair leaves it out and gets back the id it always got.
export const doorBlockId = (type = 0, facing = 0, open = false, hinge = 0) =>
  (hinge ? BLOCK.DOOR2_BASE : BLOCK.DOOR_BASE)
  + (type % DOORS) * 8 + (facing & 3) * 2 + (open ? 1 : 0);
export const isDoorBlock = (b) =>
  (b >= BLOCK.DOOR_BASE && b < BLOCK.DOOR_BASE + DOORS * 8)
  || (b >= BLOCK.DOOR2_BASE && b < BLOCK.DOOR2_BASE + DOORS * 8);
// the offset inside whichever range the leaf came out of — the two ranges carry
// the same sum, so everything below is the arithmetic it always was
const doorOff = (b) =>
  b - (b >= BLOCK.DOOR2_BASE ? BLOCK.DOOR2_BASE : BLOCK.DOOR_BASE);
export const doorType = (b) => (doorOff(b) / 8) | 0;
export const doorFacing = (b) => (doorOff(b) >> 1) & 3;
export const doorOpen = (b) => (doorOff(b) & 1) === 1;
export const doorHinge = (b) => (b >= BLOCK.DOOR2_BASE ? 1 : 0);

// WHICH BIT A BUILDER WANTS. A hinge bit does not name an end of the opening on
// its own: hinge 0 hangs on the LOW end of the axis the wall runs along for
// facings 0 and 2, and on the high end for 1 and 3, because the swing is one
// rotation for all four and the face frame turns under it. Nobody laying a
// doorway should have to know that, so they ask for the end they want — `low`
// true for the leaf nearer the start of the wall — and get the bit back. This
// is the one place that table is written down; cubemesher draws to it.
export const doorHingeFor = (facing, low) =>
  low ? (facing & 1) : (facing & 1) ^ 1;
// Swinging a door is one bit, so main.js's useBlock can do exactly what it
// already does for a gate: setBlock(f, u, v, h, toggleDoorBlock(block)).
export const toggleDoorBlock = (b) => (isDoorBlock(b) ? b ^ 1 : b);

export const isGate = (b) => b === BLOCK.GATE || b === BLOCK.GATE_O;
// Fences and closed gates stand head-high to a jump: the cell holds you out
// well past a block and a half above its floor, which is what keeps a penned
// pig penned. Minecraft's rule, sized to THIS game's jump: the arc tops out
// 1.51 blocks up and the body stands a hair above the ground it rests on, so
// the apex of a jump reaches +1.59 — anything under 0.6 is a fence that
// sometimes works, which is worse than no fence.
export const FENCE_EXTRA = 0.7;
// A shut door is two cells of leaf, so it holds you out on exactly the terms a
// fence does: without this you could stand on a closed door and be inside the
// doorway, which is the same hole FENCE_EXTRA was written to close.
export const fencelike = (b) => b === BLOCK.FENCE || b === BLOCK.GATE
  || (isDoorBlock(b) && !doorOpen(b))
  // a masonry wall pens an animal on exactly a fence's terms
  || isWall(b);

// Blocks made of cross-planes rather than a cube: no faces of their own to
// cull against, and they never fill their cell.
export const PLANTS = new Set([
  BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW, BLOCK.FLOWER_BLUE,
  BLOCK.MUSHROOM, BLOCK.SAPLING, BLOCK.WHEAT, BLOCK.WHEAT_YOUNG,
]);
// ...and the kitchen garden, on the same terms wheat is on. Added here rather
// than written into the literal because the ids come off a table (see cropId),
// and it has to happen BEFORE TRANSPARENT spreads this set below or a carrot
// would cull the face of the block behind it.
for (const b of CROP_OF.keys()) PLANTS.add(b);
// ...and the cane, for the same reason and in the same window. A grove is a
// stack of these and you walk through it, exactly as you walk through wheat.
PLANTS.add(BLOCK.BAMBOO);

// See-through blocks: faces are NOT culled against these, or you would look
// through a wall standing behind a pane. Water is handled separately because
// it is its own render pass. Stairs and slabs are included because they only
// partly fill their cell — culling against them leaves holes.
export const TRANSPARENT = new Set([
  BLOCK.GLASS, BLOCK.FENCE, BLOCK.LANTERN, BLOCK.TORCH, BLOCK.ICE, ...PLANTS,
]);
// Leaves, so a canopy has real holes in it. The leaf tile is an alpha cutout
// now, and a cutout on a crown that culls leaf-against-leaf shows the INSIDE
// of a hollow shell — you would look through the front of a tree and out the
// far side of it. Off this set every leaf keeps its own faces, so what shows
// through a hole is the next leaf back, which is what makes a crown read as
// foliage with depth rather than as a green box.
TRANSPARENT.add(BLOCK.LEAF);
for (let i = 0; i < 16; i++) TRANSPARENT.add(BLOCK.STAIR_BASE + i);
for (let i = 0; i < 40; i++) TRANSPARENT.add(BLOCK.STAIR2_BASE + i);
for (let i = 0; i < 8; i++) TRANSPARENT.add(BLOCK.SLAB_BASE + i);
// a ladder is a thin plate on a wall: the wall face behind it must still draw
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.LADDER_BASE + i);
// furniture only partly fills its cell, exactly like a stair
TRANSPARENT.add(BLOCK.TABLE).add(BLOCK.LAMP).add(BLOCK.STREET_LAMP)
  .add(BLOCK.CAMPFIRE).add(BLOCK.GATE).add(BLOCK.GATE_O);
// ...and a rug on the floor and a picture on the wall are the thinnest
// furniture there is: cull the boards under one and the hall has a hole in it.
for (let i = 0; i < 8; i++) TRANSPARENT.add(BLOCK.CARPET_BASE + i);
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.PAINTING_BASE + i);
// ...and the reading desk, which is a post and a sloped board
TRANSPARENT.add(BLOCK.LECTERN);
// ...and the mint, which is a stone bed with an open iron frame over it. Cull
// a wall against one and you look through the back of the shop.
TRANSPARENT.add(BLOCK.MINT);
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.BENCH_BASE + i);
TRANSPARENT.add(BLOCK.HYDRANT);
// a water pipe is a stem in the middle of its cell, and a toilet a bowl in
// the middle of its: the wall behind either draws itself
TRANSPARENT.add(BLOCK.SHISHA);
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.TOILET_BASE + i);
// ...and a sign is a board on a stick: the ground under it and whatever is
// behind it both draw themselves
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.SIGN_BASE + i);
TRANSPARENT.add(BLOCK.BIN);       // a drum, narrower than its cell
// ...and a glass is a thimble in the middle of its cell: the counter it
// stands on and the wall behind it both draw themselves
TRANSPARENT.add(BLOCK.TEA_GLASS).add(BLOCK.TANKARD);
// the power blocks: a flat cable, a lever, a machine with a drum, a lamp
TRANSPARENT.add(BLOCK.WIRE).add(BLOCK.WIRE_LIVE).add(BLOCK.DYNAMO);
TRANSPARENT.add(BLOCK.SWITCH_BASE).add(BLOCK.SWITCH_BASE + 1);
TRANSPARENT.add(BLOCK.POWER_LAMP_BASE).add(BLOCK.POWER_LAMP_BASE + 1);
TRANSPARENT.add(BLOCK.RAIL_BASE).add(BLOCK.RAIL_BASE + 1);
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.RAIL_TURN_BASE + i);
// a masonry wall is a post and its arms; the block behind it draws itself
for (let i = 0; i < WALL_MATS.length; i++) TRANSPARENT.add(BLOCK.WALL_BASE + i);
for (let i = 0; i < 4; i++) TRANSPARENT.add(BLOCK.CHAIR_BASE + i);
// Every glass: the tints see through exactly as clear glass does, and a pane
// is a sheet with most of its cell empty round it. Culling a wall face
// against either is the bug this set exists to stop.
for (let i = 0; i < TINTS; i++) {
  TRANSPARENT.add(BLOCK.TINT_BASE + i).add(BLOCK.PANE_BASE + i);
}
TRANSPARENT.add(BLOCK.PANE);
// A post is a tenth of a cell wide. Culling a wall face against one would
// leave a hole you could see the sky through from inside a house.
TRANSPARENT.add(BLOCK.POST);
// Doors and the bell are box unions like a stair: a leaf is an eighth of a
// cell thick and the bell hangs in the middle of one. Both leave the wall
// behind them to draw its own faces.
// Both ranges: a leaf hung on the other jamb is the same eighth of a cell.
for (let i = 0; i < DOOR_TYPES.length * 8; i++) {
  TRANSPARENT.add(BLOCK.DOOR_BASE + i).add(BLOCK.DOOR2_BASE + i);
}
TRANSPARENT.add(BLOCK.BELL);
// A BED, which is the one piece of furniture that always stands against a
// wall — and the only one that was left out of this set. It fills its cell
// from 0.06 to 0.78 and nothing at all in the two corners, so a wall culled
// against it lost its inside face and you looked THROUGH the wall of your own
// bedroom at the sky. Every other partial block in this file is here for that
// reason; the bed was the one that got missed, and moving the beds upstairs
// against the far wall is what made it impossible to miss.
// Both halves, for the same reason: the foot cell is the same partial box
// with the board and the pillow left off it.
for (let i = 0; i < WOOLS * 4; i++) {
  TRANSPARENT.add(BLOCK.BED_BASE + i).add(BLOCK.BED_FOOT_BASE + i);
}

// Blocks that do not stop movement: you walk through flowers, and you walk
// into the cell you are climbing. Everything here is also non-supporting —
// surfaceRadius, columnSolidTop and solidAtWorld step past it to the real
// ground, so you never float on a flower or perch on a ladder's top rung.
export const PASSABLE = new Set([...PLANTS]);
// A rug is floor and a picture is wall dressing: neither holds anybody up or
// keeps anybody out, and a carpet that did would be a step in every doorway.
for (let i = 0; i < 8; i++) PASSABLE.add(BLOCK.CARPET_BASE + i);
for (let i = 0; i < 4; i++) PASSABLE.add(BLOCK.PAINTING_BASE + i);
// ...and a sign, which you walk up to and past: a notice that blocked the
// path it was pointing down would be a fence with writing on it
for (let i = 0; i < 4; i++) PASSABLE.add(BLOCK.SIGN_BASE + i);
for (let i = 0; i < 4; i++) PASSABLE.add(BLOCK.LADDER_BASE + i);
PASSABLE.add(BLOCK.GATE_O);   // an open gate is a doorway, not a wall
// ...and so are a cable on the floor and a lever on a wall: a run of wire you
// had to jump over would be a run of wire nobody would ever lay indoors.
PASSABLE.add(BLOCK.WIRE).add(BLOCK.WIRE_LIVE);
PASSABLE.add(BLOCK.SWITCH_BASE).add(BLOCK.SWITCH_BASE + 1);
// ...and a rail: track you had to climb onto would be track no wagon could
// ever be pushed along
PASSABLE.add(BLOCK.RAIL_BASE).add(BLOCK.RAIL_BASE + 1);
for (let i = 0; i < 4; i++) PASSABLE.add(BLOCK.RAIL_TURN_BASE + i);
// ...and an open door is the same: the leaf is flat against the jamb and the
// gap is the whole point of having opened it. Only the odd (open) ids.
for (let i = 1; i < DOOR_TYPES.length * 8; i += 2) {
  PASSABLE.add(BLOCK.DOOR_BASE + i).add(BLOCK.DOOR2_BASE + i);
}

// Fluids fill their cell but are not ground: they are excluded from HARD and
// from solidAtWorld, so surfaceRadius answers with the bed under a lake. Lava
// is one of these — walking on a lava lake would be worse than falling in.
export const FLUIDS = new Set([BLOCK.WATER, BLOCK.LAVA]);

// Blocks that hurt whatever is standing in them. Exposed only; nothing in
// this file applies damage.
export const HAZARD = new Set([BLOCK.LAVA]);

// Fast "does this block hold you up" table. A flat lookup beats a Set in the
// meshing and physics loops. It is BLOCK_IDS wide, not 64 and no longer 256:
// SNOW (64) and ICE (65) already read as undefined off the end of a 64-wide
// table once, which quietly made them non-supporting wherever a column carried
// an override, and a block past 255 would do the same thing again.
const HARD = new Uint8Array(BLOCK_IDS).fill(1);
HARD[BLOCK.AIR] = 0;
for (const b of FLUIDS) HARD[b] = 0;
for (const b of PASSABLE) HARD[b] = 0;

// face bases, chosen so that u x v = n (right handed, +h points outward)
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const QUARTER = Math.PI / 4;
const DIRT_DEPTH = 4;
// How thick the drafting table is, in cells: grass, three of soil, rock.
// Exported because main.js has to know that the bottom course — and only the
// bottom course — is the one mining refuses.
export const FLAT_DEPTH = 5;
const CORE = 18;            // solid cells below the lowest terrain
const FREQ = 2.5;           // noise features across the planet
const SLOPE_TUNING = 0.075; // terrain amplitude as a fraction of R

// --- presets ----------------------------------------------------------------
//
// A preset is everything about a world that is not its size: the shape of the
// terrain, what it is made of, what fills its low ground, which ores it is
// worth digging, and what colour its sky and its disc are. Only one planet can
// exist at a time (S, H, R, R0, AMP and SEA are module state), so travelling
// means unloading this world and building the destination from its own seed
// and preset — see INTEGRATION-solar.md.
//
// 'terran' is the default and is bit-for-bit the world this file has always
// generated: identity shape, one material per band, the original ore table.
//
// The pieces a preset may set:
//   relief      AMP multiplier — how tall the terrain is
//   seaLevel    sea radius as a multiple of AMP either side of R, or null for
//               a world with no standing fluid at all
//   rockLevel   the same, for the line above which bare rock shows
//   fluid       what fills below sea level (WATER, LAVA)
//   iceCap      the top fluid cell of a column freezes to ICE — and that cell
//               is HARD, so you walk on the sea
//   detail      >0 samples a second, finer noise field, which the shape
//               function receives as `d`. Costs one extra fbm/column.
//   detailFreq  how much finer, as a multiple of FREQ (default 4.3). Slope
//               scales with this: the same amplitude on a four-times-finer
//               field is four times the gradient, which is why Ferrum's
//               ridges are cliffs and a coastline cannot be built the same way
//   island      >0 turns on a single-island mask, `isl` in [0, 1]
//   patch       >0 is the fraction of the surface that should be ordinary
//               ground: soil, grass, trees. See "temperate patches" below
//   shape(n,d,isl,t)  the whole terrain profile, in units of AMP: takes the
//               base fbm in [-1, 1] and returns [-1, 1] (clamped, so the shell
//               always covers it). `t` is the patch weight, 0 to 1
//   mats        beach/low/high are lists — a hash of the column picks one, so
//               a world can be mottled without a second noise field
//   soil        the same three lists, used where the patch mask says this
//               column is ordinary ground; null for a world of one biome
//   shore       height above the fluid, in blocks, that still counts as beach
//   ores        weights against the terran densities, 0 to drop an ore
//   trees/plants  density multipliers; rivers/villages  flags for main.js
//   empty       nothing is placed ON the finished terrain either: no herds,
//               no zombie spawner, no launch monument. See PRESETS.flat
//   sky/color   colours, for main.js's fog and solar.js's disc
//
// Every preset but terran is a *dominant* biome, not a monoculture: 60-75%
// of the surface is the thing the world is named for and the rest is ground
// you can live off. The dominant material still decides the disc colour and
// the sky, so the planet reads the same from orbit as it always did.

const ORE_BASE = [
  // rarest first: the first match wins, so a diamond cell is never taken back
  // by one of the commoner ores tested after it
  { block: BLOCK.DIAMOND, minDepth: 13, p: 0.0009, salt: 0x1d1a5 },
  { block: BLOCK.SILVER, minDepth: 9, p: 0.0016, salt: 0x2b7f3 },
  // Gold gets a salt of its own, so it does not move a single cell of any ore
  // already in the table: the lattice gate is a hash of (cell, salt) and the
  // two draws are independent. Being tested before iron costs iron the
  // overlap, which is p_gold * p_iron — seven cells in a million.
  { block: BLOCK.GOLD, minDepth: 8, p: 0.0021, salt: 0x6a17d },
  { block: BLOCK.IRON, minDepth: 5, p: 0.0034, salt: 0x3c5d9 },
  { block: BLOCK.COAL, minDepth: 4, p: 0.0072, salt: 0x4e197 },
  // Tin, zinc and copper go at the END of the table rather than in rarity
  // order with the rest of it, and that is deliberate. The first match wins,
  // so an ore tested BEFORE an existing one takes cells off it; tested after,
  // it can only ever claim rock that was already plain stone — so every seam
  // of coal, iron, gold, silver and diamond in every world already built is
  // exactly where it was. The price is the overlap, about one and a half
  // percent of these three's cells, which is cheap for not moving a mine.
  //
  // Each has a salt of its own, so the lattice draws are independent: adding
  // one of these does not shift a single cell of any other.
  { block: BLOCK.TIN, minDepth: 7, p: 0.0026, salt: 0x7c3e1 },
  { block: BLOCK.ZINC, minDepth: 6, p: 0.0030, salt: 0x5b2a9 },
  // ...and copper shallower and commoner than anything else here. It is the
  // metal you are meant to meet FIRST — a wooden pick lifts it (see items.js)
  // and its minDepth is under the soil layer on every preset, so on a world
  // with thin topsoil it turns up in the first hole you dig.
  { block: BLOCK.COPPER, minDepth: 3, p: 0.0080, salt: 0x2f8d3 },
];

// Build a preset's ore table from the base one. The salts are fixed per ore,
// so a richer iron world is the same veins in the same places, more of them.
function oreTable(weights, depths) {
  const out = [];
  for (const o of ORE_BASE) {
    const w = weights && weights[o.block] !== undefined ? weights[o.block] : 1;
    if (w <= 0) continue;
    const minDepth = depths && depths[o.block] !== undefined
      ? depths[o.block] : o.minDepth;
    const p = Math.min(0.35, o.p * w);
    out.push({ block: o.block, minDepth, p, salt: o.salt,
      t: Math.floor(p * 4294967296) });
  }
  return out;
}

const ID = (n) => n;                       // terran: the terrain as authored
// Sharp crests and deep clefts. The 0.7 is its own mean (|fbm| is small, so
// 1 - 2|d| sits well above zero): subtracting it keeps a ridged preset
// centred in the shell instead of riding the top of it.
const ridge = (x) => 0.3 - 2 * Math.abs(x);
const clamp1 = (x) => (x > 1 ? 1 : x < -1 ? -1 : x);

function preset(p) {
  p.oreList = oreTable(p.ores, p.oreDepths);
  p.mats.subDepth = p.mats.subDepth === undefined
    ? DIRT_DEPTH : p.mats.subDepth;
  if (p.soil && p.soil.subDepth === undefined) p.soil.subDepth = DIRT_DEPTH;
  if (p.soil === undefined) p.soil = null;
  if (p.patch === undefined) p.patch = 0;
  if (p.shore === undefined) p.shore = 0.7;
  if (p.detailFreq === undefined) p.detailFreq = 4.3;
  return p;
}

export const PRESETS = {
  terran: preset({
    id: 'terran', name: 'Terran', short: 'green', class: 'garden world',
    desc: 'Grass, forests, lakes and villages. Home.',
    color: 0x5f9e4a, ring: 0x8fd07a,
    sky: { day: 0x7fc3ec, sunset: 0xff8c4a, night: 0x05070f },
    // Sea level sat at -0.45 for years, which measured wet only 0.7% of the
    // surface: a garden world whose "lakes" were puddles you had to go
    // looking for. Two changes make them lakes. The level itself sits just
    // under the mean (-0.05), which floods about an eighth of the surface.
    // And the SHAPE deepens whatever falls below that sill — the rolling
    // field is nearly flat near its mean, so flooded ground was one block
    // deep everywhere; multiplying the dip turns shelves into basins, with
    // shallow shorelines sloping to centres several blocks down. Ground at
    // or above the sill is untouched, so every existing hill, mountain and
    // village site is exactly where it was.
    // (-0.05 measured a fifth of the surface wet, which played as a bit
    // much; -0.16 lands at about an eighth — lakes you meet on every walk,
    // on a world that is still clearly land.)
    relief: 1, seaLevel: -0.16, rockLevel: 0.45, snowLevel: 3.4,
    fluid: BLOCK.WATER, iceCap: false, detail: 0, island: 0,
    // A garden world has WEATHER: a handful of rain cells drifting over the
    // surface, each under its own knot of dark cloud, with dry sky between.
    // Gentler than the Tempest's in every number, and no `everywhere` — the
    // showers are somewhere, and you can walk out of one.
    weather: { rain: 0.8, thunder: 2, overcast: 0.8 },
    shape: (n) => clamp1(n < -0.16 ? -0.16 + (n + 0.16) * 3.2 : n),
    mats: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE, subDepth: DIRT_DEPTH,
    },
    ores: null, oreDepths: null,
    // proper ranges: a third of the surface rises out of the rolling ground
    mountains: {
      height: 5.0, freq: 0.5, gate: 0.58, rough: 1.6, terrace: 4, cliff: 0.95,
    },
    canyons: { depth: 4.5, freq: 1.0, gate: 0.965, mask: 0.46, soft: 0.08 },
    // snow and sea ice from about 55 degrees out
    poles: { from: 0.80, soft: 0.12 },
    trees: 1, plants: 1, rivers: true, villages: true,
    // Deserts. Terran alone: every other preset here is already a dominant
    // biome with temperate pockets in it, and a dune field inside a pocket of
    // grass on a rust world is two exceptions stacked on each other. The
    // DESERT_* constants further down say what one actually is.
    deserts: true,
  }),

  iron: preset({
    id: 'iron', name: 'Ferrum', short: 'iron', class: 'iron world',
    desc: 'A rusted world of jagged ridges, with green valleys and lakes '
      + 'caught between them.',
    color: 0xa8552e, ring: 0xd08a5a,
    sky: { day: 0xc4794e, sunset: 0xe8a35c, night: 0x160a06 },
    // The sea level is very low, so water collects only in the deepest
    // basins: lakes between the ridges rather than an ocean. The ridges
    // still dominate, so it reads as the rust world from orbit.
    // The sea level came UP a long way: at -0.78 the measured surface was
    // 0.3% wet, which is a world with no water on it at all, and the lakes
    // in the description above were a promise the generator never kept.
    //
    // -0.44 filled them and cost the world half its villages: this is a ridged
    // planet and the flat ground the survey wants is the low ground the water
    // took. -0.58 is the compromise that was measured rather than guessed —
    // lakes in the deepest basins, and the settlements still standing.
    relief: 1.35, seaLevel: -0.58, rockLevel: 0.75, snowLevel: 3.6,
    fluid: BLOCK.WATER, iceCap: false, detail: 1, island: 0,
    // ...and a bigger share of it is ordinary ground. A third of the surface
    // green was measured at 19% grass against 60% bare rock and ore, which is
    // a quarry with pockets rather than a world with valleys in it.
    patch: 0.44,
    // ridged fine detail over a normal base is what makes it read as broken
    // rock rather than as hills painted a different colour — and then the
    // same basin-deepening home uses, so what floods is a lake with a shelving
    // shore rather than a film of water one block deep over a flat.
    shape: (n, d) => {
      const v = clamp1(0.62 * n + 0.62 * ridge(d));
      return v < -0.58 ? clamp1(-0.58 + (v + 0.58) * 2.8) : v;
    },
    mats: {
      // two thirds ore at the surface: this is what "iron everywhere" has to
      // mean when the atlas has one grey stone tile and one rusty ore one
      beach: [BLOCK.IRON], low: [BLOCK.IRON, BLOCK.IRON, BLOCK.STONE],
      high: [BLOCK.STONE, BLOCK.IRON],
      sub: BLOCK.STONE, deep: BLOCK.STONE, subDepth: 0,
    },
    // the valleys: ordinary ground, so there is wood and somewhere to farm
    soil: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE,
    },
    ores: { [BLOCK.IRON]: 26, [BLOCK.COAL]: 0.5, [BLOCK.SILVER]: 0.6,
      [BLOCK.DIAMOND]: 0.3 },
    oreDepths: { [BLOCK.IRON]: 1 },
    mountains: {
      height: 4.6, freq: 0.6, gate: 0.60, rough: 2.0, terrace: 4, cliff: 1.0,
    },
    canyons: { depth: 4.8, freq: 1.1, gate: 0.960, mask: 0.44, soft: 0.08 },
    poles: { from: 0.84, soft: 0.10 },
    // Rivers, which it never had: its subsoil is stone rather than gravel, so
    // the carver's marker material is free here and running water costs the
    // rust nothing. Trees and undergrowth up with the valleys that hold them.
    trees: 0.95, plants: 1, rivers: true, villages: true,
  }),

  coal: preset({
    id: 'coal', name: 'Cinder', short: 'coal', class: 'ash world',
    desc: 'Sooty terraces and ash flats, with coal seams from the surface '
      + 'down and green pockets on the lower steps.',
    color: 0x2e2e33, ring: 0x5a5a62,
    sky: { day: 0x6d6a63, sunset: 0x9a6a42, night: 0x07070a },
    // -0.72 measured 0.0% of the surface wet: an ash world with not one
    // puddle on it. This world is TERRACED, so the height field is quantised
    // and a sill only catches water where it lands between two steps — -0.40
    // still measured under 1%. The terracing makes the sill jumpy — -0.34
    // measured 2% wet and -0.28 measured 20%, because the difference is
    // whether the sill falls above or below a step — so -0.30 is the value
    // that was MEASURED to put standing water on the bottom step across seeds
    // rather than the one that reads best in a comment.
    relief: 0.85, seaLevel: -0.30, rockLevel: 0.75, snowLevel: 3.6,
    fluid: BLOCK.WATER, iceCap: false, detail: 0, island: 0,
    // 16% grass against 64% coal and gravel was a slag heap with a lawn on
    // it. The green pockets on the lower steps are the thing the description
    // promises and they are worth having enough of to live on.
    patch: 0.42,
    // terraced: the flats are the point, so quantise the height and keep a
    // little of the original to stop the steps being perfectly level — then
    // deepen whatever falls under the sill, so the bottom step holds a lake
    // rather than a sheet.
    shape: (n) => {
      const v = clamp1(0.74 * (Math.round(n * 3) / 3) + 0.26 * n);
      return v < -0.30 ? clamp1(-0.30 + (v + 0.30) * 2.6) : v;
    },
    mats: {
      // coal is the darkest tile in the atlas and gravel the sootiest grey,
      // so the flats read black-and-ash rather than as grey rock
      beach: [BLOCK.GRAVEL], low: [BLOCK.COAL, BLOCK.GRAVEL, BLOCK.COAL],
      high: [BLOCK.GRAVEL, BLOCK.COAL],
      sub: BLOCK.GRAVEL, deep: BLOCK.STONE, subDepth: 2,
    },
    soil: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE,
    },
    ores: { [BLOCK.COAL]: 14, [BLOCK.IRON]: 0.5, [BLOCK.SILVER]: 0.4,
      [BLOCK.DIAMOND]: 0.6 },
    oreDepths: { [BLOCK.COAL]: 1 },
    mountains: {
      height: 3.8, freq: 0.55, gate: 0.62, rough: 1.5, terrace: 5, cliff: 0.8,
    },
    canyons: { depth: 4.0, freq: 0.95, gate: 0.965, mask: 0.48, soft: 0.08 },
    poles: { from: 0.84, soft: 0.10 },
    // Still no rivers here: gravel is the river carver's marker material and
    // this world's subsoil IS gravel, so a river would be indistinguishable
    // from the ash it cut through.
    trees: 0.95, plants: 1, rivers: false, villages: true,
  }),

  ocean: preset({
    id: 'ocean', name: 'Thalassa', short: 'ocean', class: 'ocean world',
    desc: 'A world of warm shallow sea, scattered with islands from sandbars '
      + 'to whole green countries.',
    color: 0x2c6fb0, ring: 0x6fb7e8,
    sky: { day: 0x86cbe8, sunset: 0xff9a63, night: 0x040910 },
    // More relief than terran: the amplitude is what sets how deep the sea
    // can be, and at relief 1 on a small world the whole ocean was one or two
    // blocks deep — too shallow to float a boat across without grounding.
    relief: 1.7, seaLevel: -0.45, rockLevel: 0.45,
    // No island mask any more. The single bell is what made this one disc in
    // an empty sea; an archipelago has to come from the terrain itself.
    fluid: BLOCK.WATER, iceCap: false, detail: 1, detailFreq: 2.6, island: 0,
    // Half land, half sea. The base field is simply centred on sea level
    // instead of sunk below it, so its own crests break the surface all over
    // the globe. The finer field roughens the coast into bays, inlets and
    // sandbars — with one octave the shorelines come out as smooth ovals.
    shape: (n, d) => clamp1(-0.52 + 1.02 * n + 0.34 * d),
    mats: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE, subDepth: DIRT_DEPTH,
    },
    ores: null, oreDepths: null,
    // islands with a spine, rather than sandbars all the way down
    mountains: {
      height: 4.4, freq: 0.7, gate: 0.60, rough: 1.7, terrace: 4, cliff: 0.95,
    },
    poles: { from: 0.78, soft: 0.12 },
    trees: 1, plants: 1, rivers: false, villages: true,
  }),

  volcanic: preset({
    id: 'volcanic', name: 'Vulcan', short: 'lava', class: 'volcanic world',
    desc: 'Black rock, ash and lava in every basin. Do not fall in.',
    color: 0x6b2a18, ring: 0xff7a2a,
    sky: { day: 0x7d4433, sunset: 0xff6a2a, night: 0x120503 },
    glow: 0xff5a1e,           // fire light, for whoever lights the scene
    relief: 1.25, seaLevel: -0.30, rockLevel: 0.55,
    fluid: BLOCK.LAVA, iceCap: false, detail: 1, island: 0,
    // Up from 0.24. The lava stays exactly where it was — it is what this
    // world IS, and a Vulcan you can stroll across is not one — but the ridges
    // between the basins carry more weathered ground, so there is somewhere to
    // stand, farm and build between the fires.
    patch: 0.36,
    // deep basins for the lava to pool in, broken ground between them
    shape: (n, d) => clamp1(1.02 * n + 0.34 * ridge(d)),
    mats: {
      // No GRAVEL anywhere here: it is the river carver's marker material and
      // this preset has rivers (of lava). Coal blocks stand in for obsidian —
      // there is no black rock tile, and coal is the only near-black one.
      beach: [BLOCK.COAL, BLOCK.COBBLE], low: [BLOCK.COAL, BLOCK.STONE, BLOCK.COBBLE],
      high: [BLOCK.COBBLE, BLOCK.STONE],
      sub: BLOCK.COBBLE, deep: BLOCK.STONE, subDepth: 2,
    },
    // ash weathers into soil: green ground on the high ridges, well clear of
    // the lava in the basins
    soil: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE,
    },
    ores: { [BLOCK.IRON]: 3, [BLOCK.COAL]: 2, [BLOCK.DIAMOND]: 2.5,
      [BLOCK.SILVER]: 2 },
    oreDepths: null,
    // the cones the lava came out of
    mountains: {
      height: 5.2, freq: 0.75, gate: 0.60, rough: 1.4, terrace: 6, cliff: 0.55,
    },
    canyons: { depth: 4.8, freq: 1.05, gate: 0.960, mask: 0.44, soft: 0.08 },
    trees: 0.8, plants: 0.9, rivers: true, villages: true,
  }),

  // --- the two Wenax variants ----------------------------------------------
  //
  // Both are the ocean world with the shape offset raised, which is the one
  // number that decides how much of the base field breaks the surface: -0.52
  // is Wenax at 44% land, -0.40 is 64% and -0.36 is 70%. Everything else —
  // relief, detail, the two-octave coastline, the materials — is Thalassa's,
  // so they read as the same kind of world with the sea pushed back.
  //
  // The fields below `villages` are read by main.js, not by this file: a
  // preset is where a world's character lives, and "it rains here" or "the
  // dead are bigger here" belong beside its terrain rather than in a switch
  // statement somewhere else.

  storm: preset({
    id: 'storm', name: 'Tempest', short: 'storm', class: 'storm world',
    desc: 'Wenax with the sea pushed back, under a storm that never lifts. '
      + 'Rain, thunder, and the dead run here.',
    color: 0x46626f, ring: 0x8fb0bd,
    // No blue hour and no proper night: the cloud deck is what you see, lit
    // from above, so "day" is a wet grey and dusk barely changes it.
    sky: { day: 0x54626b, sunset: 0x6b5f5a, night: 0x080c11 },
    relief: 1.7, seaLevel: -0.45, rockLevel: 0.45, snowLevel: 3.4,
    fluid: BLOCK.WATER, iceCap: false, detail: 1, detailFreq: 2.6, island: 0,
    shape: (n, d) => clamp1(-0.40 + 1.02 * n + 0.34 * d),
    mats: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE, subDepth: DIRT_DEPTH,
    },
    ores: null, oreDepths: null,
    mountains: {
      height: 4.4, freq: 0.6, gate: 0.58, rough: 1.6, terrace: 4, cliff: 0.95,
    },
    canyons: { depth: 4.5, freq: 1.0, gate: 0.965, mask: 0.48, soft: 0.08 },
    poles: { from: 0.82, soft: 0.12 },
    trees: 1.2, plants: 1.3, rivers: false, villages: true,
    // weather.js: rain rate, lightning strikes a minute, cloud cover.
    // `everywhere` is GONE — a planet set to rain constantly was the one
    // thing the player asked the weather to stop doing. Tempest is still the
    // storm world: twice the rain cells of a garden world and each twice the
    // size, so most walks are wet — but the rain is somewhere, the edge of a
    // storm is a place you can stand, and there are breaks in it.
    weather: { rain: 1, thunder: 5, overcast: 0.92, cells: 9, cellArc: 0.52 },
    // entities.js ZOMBIE_TUNING overrides. burnLevel above 1 is what makes
    // them a day problem too — under that cloud there is no sunrise to burn
    // them off, and a horde that only came out at night would be a normal
    // world with worse weather.
    zombies: {
      max: 14, interval: 3.2, minArc: 26, maxArc: 60, minSeparation: 9,
      nightLevel: 2, burnLevel: 2, chaseArc: 110,
      scale: 1.55, speed: 4.4, health: 26, damage: 5,
    },
    // village.js stocks every house chest with a pistol and ammunition, and
    // main.js will not let you draw a weapon you have not found
    gunHouses: true,
  }),

  city: preset({
    id: 'city', name: 'Metropolis', short: 'city', class: 'city world',
    desc: 'Wenax paved over. One city from pole to pole: towers you can '
      + 'climb to the roof of, crowds, guards, dogs, and a tube under it all.',
    color: 0x6a6f78, ring: 0xc8d2e0,
    sky: { day: 0x8fb4cf, sunset: 0xffa268, night: 0x0a0f1a },
    // The one number that is not Wenax's. Relief is the height of the
    // terrain, not its shape, and at Thalassa's 1.7 the streets step up two
    // and three blocks every few cells — a road you cannot walk down and a
    // bus stuck against a kerb. Graded to 0.95 the coastline, the islands and
    // the land fraction are all unchanged (they are measured in units of the
    // relief) and the avenues run.
    relief: 0.95, seaLevel: -0.45, rockLevel: 0.45,
    // detail 0: the high-frequency bumps the other worlds wear read as
    // potholes on a paved planet, and the player asked for the streets flat.
    // The big shapes stay — a city on hills still terraces.
    fluid: BLOCK.WATER, iceCap: false, detail: 0, detailFreq: 2.6, island: 0,
    shape: (n, d) => clamp1(-0.36 + 1.02 * n + 0.34 * d),
    // The ground IS the road surface. Paving a planet cell by cell would be
    // hundreds of thousands of overrides; making the low band the roadway
    // costs nothing at all and city.js then only has to place what stands on
    // it. BLACK CEMENT now, not coal — the player asked for black concrete
    // streets, and a road you could mine coal out of was always a joke told
    // at the texture's expense. The white paint goes on top of this.
    mats: {
      beach: [BLOCK.SAND], low: [BLOCK.CEMENT_BASE + 7],
      high: [BLOCK.STONE, BLOCK.GRAVEL],
      sub: BLOCK.GRAVEL, deep: BLOCK.STONE, subDepth: 2,
    },
    // parks: the fifth of the surface that is still ground, so there are
    // trees somewhere and the whole planet is not one grey tone
    soil: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE,
    },
    patch: 0.2,
    ores: { [BLOCK.COAL]: 1.6, [BLOCK.IRON]: 1.4 },
    oreDepths: null,
    // a couple of hills for the streets to climb, no alps: a plot that
    // steep is refused by city.js and left as parkland anyway
    mountains: {
      height: 1.4, freq: 0.8, gate: 0.68, rough: 1.0, terrace: 4, cliff: 0.35,
    },
    poles: { from: 0.84, soft: 0.10 },
    trees: 0.35, plants: 0.5, rivers: false, villages: false,
    // city.js builds the grid, the towers and the tube
    city: true,
  }),

  ice: preset({
    id: 'ice', name: 'Rime', short: 'ice', class: 'ice world',
    desc: 'Snowfields over a frozen sea, with sheltered green valleys where '
      + 'the thaw reaches.',
    color: 0xcfe2f2, ring: 0xffffff,
    sky: { day: 0xbcd8ee, sunset: 0xe8b7c8, night: 0x060a14 },
    relief: 0.9, seaLevel: -0.1, rockLevel: 0.8,
    fluid: BLOCK.WATER, iceCap: true, detail: 0, island: 0,
    // 8% grass under 83% snow and ice: the "sheltered green valleys where the
    // thaw reaches" were a line in the description and about one valley on the
    // planet. At 0.38 the thaw reaches enough of it to be a place people live
    // rather than a place they died.
    patch: 0.38,
    shape: (n) => clamp1(0.86 * n),
    mats: {
      beach: [BLOCK.ICE, BLOCK.SNOW], low: [BLOCK.SNOW],
      high: [BLOCK.SNOW, BLOCK.ICE],
      sub: BLOCK.SNOW, deep: BLOCK.STONE, subDepth: 3,
    },
    soil: {
      beach: [BLOCK.SAND], low: [BLOCK.GRASS], high: [BLOCK.STONE],
      sub: BLOCK.DIRT, deep: BLOCK.STONE,
    },
    ores: { [BLOCK.COAL]: 0.6, [BLOCK.IRON]: 0.8, [BLOCK.SILVER]: 1.2,
      [BLOCK.DIAMOND]: 1.4 },
    oreDepths: null,
    mountains: {
      height: 4.8, freq: 0.5, gate: 0.58, rough: 1.7, terrace: 4, cliff: 0.95,
    },
    canyons: { depth: 4.5, freq: 1.0, gate: 0.965, mask: 0.48, soft: 0.08 },
    trees: 0.8, plants: 0.9, rivers: true, villages: true,
  }),

  // The drafting table. Every other preset is a landscape; this one is the
  // absence of a landscape, and that is the feature — you cannot judge a
  // house you are designing when it is half-buried in a hillside, and you
  // cannot lay out a village street on a slope that was not your decision.
  //
  // Flat means flat, and that now includes the geometry: `plane: true` makes
  // this world a PLANE, not a sphere with a constant profile. A constant
  // profile on a globe still curves — a hundred-block floor was secretly an
  // arc, rows of blocks converged towards the face corners, and no two
  // distant walls were truly parallel, which on a drafting table is the
  // whole drawing quietly lying to you. With the plane embedding every cell
  // is a unit cube on a square grid, gravity is straight down, and a
  // straight line stays straight for as long as the world does.
  //
  // `shape` returning 0 still puts the one surface at exactly R. The rest is
  // removal —
  //
  //   mountains/canyons null   PEAK and TRENCH both fall out at 0, so the
  //                            shell has no room reserved for relief
  //   poles/snowLevel null     no caps, no snow line, so the plain is one
  //                            material from pole to pole
  //   seaLevel null            dry: SEA drops below the shell and every
  //                            "is this underwater" test answers no for free
  //   trees/plants 0           nothing grows in your way
  //   rivers/villages false    nothing is built for you
  //
  // relief stays 1 rather than 0: AMP has a floor of 5 regardless, and it is
  // what sizes the shell, not the terrain, now that shape is constant.
  //
  // And the table is a TABLE — FLAT_DEPTH cells thick and no more. A planet
  // needs a core to stop you digging to the middle of it; a drafting table
  // needs a floor. So there is no molten band, no diamond seam and no ore
  // anywhere in it: one course of grass to build on, three of soil to dig
  // out, and one of rock that will not break, which is the bottom of the
  // world and looks like it.
  flat: preset({
    id: 'flat', name: 'Flat', short: 'flat', class: 'drafting table',
    desc: 'A featureless grass plain. Nothing generated and nothing in the '
      + 'way — the world you design on.',
    color: 0x76b45a, ring: 0xa8d894,
    sky: { day: 0x7fc3ec, sunset: 0xff8c4a, night: 0x05070f },
    relief: 1, seaLevel: null, rockLevel: 0.45, snowLevel: null,
    fluid: BLOCK.WATER, iceCap: false, detail: 0, island: 0,
    shape: () => 0,
    mats: {
      beach: [BLOCK.GRASS], low: [BLOCK.GRASS], high: [BLOCK.GRASS],
      sub: BLOCK.DIRT, deep: BLOCK.STONE, subDepth: DIRT_DEPTH,
    },
    ores: null, oreDepths: null,
    mountains: null, canyons: null, poles: null,
    trees: 0, plants: 0, rivers: false, villages: false,
    // `empty` is stronger than the flags above it, and it is the difference
    // between a wilderness and a drafting table. villages/trees/plants stop
    // things being GENERATED into the terrain; this also stops the things
    // that are merely put on top of it once it exists — the herds, the
    // zombie spawner, and the launch monument at the pole. Nothing lives
    // here and nothing is built for you, so the only thing in the world is
    // the thing you are designing.
    empty: true,
    plane: true,
  }),
};

// Menu order: home first, then by how hostile they are, then the one that is
// not a place at all.
export const PRESET_IDS = ['terran', 'ocean', 'city', 'ice', 'coal', 'iron',
  'volcanic', 'storm', 'flat'];
export const getPreset = (id) => PRESETS[id] || PRESETS.terran;

export let S = 0;      // cells along one face edge
export let H = 0;      // altitude layers
export let R = 0;      // mean planet radius, in blocks
export let R0 = 0;     // radius of altitude layer 0
export let AMP = 0;
// How far the mountains reach ABOVE the rolling terrain, in blocks. Kept
// separate from AMP on purpose: seaLevel, rockLevel and the patch mask are
// all expressed in units of AMP, so folding the peaks into it would move the
// sea, the tree line and the temperate patches on every world at once. A
// range is something that sits on top of the landscape, and this is that.
export let PEAK = 0;
// How far the canyons cut BELOW the rolling terrain, in blocks. The mirror of
// PEAK, and separate from AMP for the same reason.
export let TRENCH = 0;
export let SEA = 0;
// True when the current world is a PLANE, not a sphere. The drafting table
// used to be a globe whose terrain profile happened to be constant, which is
// flat the way the sea is flat — every "straight" row of blocks still bent
// round the curve, and a long floor was secretly an arc. In flat mode the
// lattice is embedded differently: only face 2 exists, a cell sits at
// (u - S/2, R0 + h, v - S/2), up is +Y everywhere, and "radius" means plain
// height. Everything below branches on this instead of keeping two engines.
export let FLAT = false;
export let PRESET = PRESETS.terran;    // the world the next Planet will be
export let PRESET_ID = 'terran';
let ROCK_LINE = 0;

// Size and kind of the next world. setWorldSize is this with 'terran', which
// is exactly what it always did.
// Cells along one face edge at this radius — and, on the drafting table,
// where there is only one face, the side of the whole plane in blocks. One
// cell should be about one block wide at the surface: a face spans a quarter
// turn, so S = (pi/2) * R, rounded up to a multiple of 16 so chunks divide
// evenly. Exported because the menu has to say how big a world you are
// choosing, and a plane has no radius to quote at you.
export const cellsPerFace = (radius) =>
  Math.ceil((Math.PI / 2) * radius / 16) * 16;

export function setWorldPreset(radius, presetId = 'terran') {
  const P = getPreset(presetId);
  PRESET = P;
  PRESET_ID = P.id;
  // the geometry itself is part of the preset: the drafting table is a plane
  FLAT = !!P.plane;
  R = radius;
  AMP = Math.max(5, R * SLOPE_TUNING * P.relief);
  // ...but never more than a fraction of the planet itself. AMP has a floor of
  // 5 blocks so that a tiny world is not glassy, and multiplying that floor by
  // a mountain height meant for a real planet gives a marble with a 25-block
  // range on it: the radius-40 test world came out more mountain than world,
  // and the walk across it was a scramble.
  PEAK = Math.min(AMP * (P.mountains ? P.mountains.height : 0), R * 0.4);
  ROCK_LINE = R + AMP * P.rockLevel;
  S = cellsPerFace(R);
  // The core cannot be deeper than the planet: R0 = R - AMP - core, so a
  // fixed 18 goes NEGATIVE below radius ~23 and layer zero would sit through
  // the centre. Cap it by radius, which leaves every world above ~45 exactly
  // as it was.
  const core = Math.min(CORE, Math.max(3, Math.floor(R * 0.4)));
  // Sky headroom above the terrain. The tallest peak sits around core+AMP
  // layers up, so the old "+6" left only about 6 blocks of build room above
  // a mountain — a modest tower hit the cap and placing silently did
  // nothing. SKY is flat rather than scaled by AMP so a tiny world gets the
  // same generous headroom as a huge one, not a fraction of it.
  const SKY = 46;
  // Canyons cut DOWN, so unlike a mountain they need room under the terrain
  // rather than over it: the shell drops by the deepest cut and grows by the
  // same amount, or a gorge floor would land on layer zero and be clipped
  // flat. Kept as its own number for exactly the reason PEAK is — everything
  // else in AMP units is measured from the mean surface, and a trench is not.
  TRENCH = Math.min(AMP * (P.canyons ? P.canyons.depth : 0), R * 0.25);
  if (FLAT) {
    // A table, not a planet: the slab is FLAT_DEPTH cells and the rest of the
    // shell is sky to build in. Layer zero is the rock floor, so R0 sits
    // FLAT_DEPTH - 1 below the surface and `top` comes out at FLAT_DEPTH - 1
    // for every column, which is what makes the profile below exact rather
    // than something the height field has to be trusted to round the same way
    // twice.
    R0 = Math.max(1, Math.round(R) - (FLAT_DEPTH - 1));
    H = FLAT_DEPTH + SKY;
  } else {
    H = Math.ceil(core + 2 * AMP + PEAK + TRENCH + SKY);
    R0 = Math.max(1, Math.round(R - AMP - TRENCH - core));
  }
  // A dry world puts its sea one cell below the shell, so seaTop comes out
  // negative and every "is this under water" test answers no for free.
  SEA = P.seaLevel === null ? R0 - 1 : R + AMP * P.seaLevel;
}

export function setWorldSize(radius) {
  setWorldPreset(radius, 'terran');
}

export const cellIndex = (f, u, v, h) => (((f * S + u) * S + v) * H + h);

// Continuous cell coords run over [0, S] inclusive (corners are shared), so
// flooring an exact face edge or cube corner yields S — one past the last
// cell. Every conversion to an integer index goes through this.
export const cellIdx = (c) => (c >= S ? S - 1 : c < 0 ? 0 : Math.floor(c));

// --- geometry -------------------------------------------------------------
//
// Two embeddings share one cell lattice. On a sphere a cell's anchor is a
// unit DIRECTION and a world position is direction * radius. On the plane
// (FLAT) the anchor is (cu - S/2, 1, cv - S/2) — the y is a placeholder —
// and a world position is (anchor.x, radius, anchor.z), so the horizontal
// part never scales with height and every cell is a true unit cube. posAt()
// is the one place that composition rule lives; everything that used to
// multiply a direction by a radius goes through it.

// Continuous grid coords (cu, cv in [0, S]) -> the cell's anchor: a unit
// direction on a sphere, the planar offset in flat mode (see above).
// The tan() warp makes the angular step uniform, so cells stay near-square.
export function dirFromCell(f, cu, cv, out = [0, 0, 0]) {
  if (FLAT) {
    // v runs along -Z, exactly as it does on cube face 2 (FACES[2].v) — the
    // chart must keep the sphere's handedness or every triangle the mesher
    // winds comes out facing the wrong way and the ground is a backface.
    out[0] = cu - S / 2; out[1] = 1; out[2] = S / 2 - cv;
    return out;
  }
  const F = FACES[f];
  const a = Math.tan((cu / S * 2 - 1) * QUARTER);
  const b = Math.tan((cv / S * 2 - 1) * QUARTER);
  const x = F.n[0] + a * F.u[0] + b * F.v[0];
  const y = F.n[1] + a * F.u[1] + b * F.v[1];
  const z = F.n[2] + a * F.u[2] + b * F.v[2];
  const inv = 1 / Math.hypot(x, y, z);
  out[0] = x * inv; out[1] = y * inv; out[2] = z * inv;
  return out;
}

// Anchor (or, flat, any world point — the mapping ignores height) ->
// (face, cu, cv). Inverse of dirFromCell.
//
// FLAT CONTRACT: never feed this a NORMALIZED world position in flat mode —
// normalizing throws the horizontal offsets away. Call sites that used to
// normalize first branch on FLAT and pass the raw point instead.
export function cellFromDir(x, y, z, out = [0, 0, 0]) {
  if (FLAT) {
    out[0] = 2; out[1] = x + S / 2; out[2] = S / 2 - z;
    return out;
  }
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f;
  if (ax >= ay && ax >= az) f = x >= 0 ? 0 : 1;
  else if (ay >= az) f = y >= 0 ? 2 : 3;
  else f = z >= 0 ? 4 : 5;
  const F = FACES[f];
  const nd = x * F.n[0] + y * F.n[1] + z * F.n[2];
  const a = (x * F.u[0] + y * F.u[1] + z * F.u[2]) / nd;
  const b = (x * F.v[0] + y * F.v[1] + z * F.v[2]) / nd;
  out[0] = f;
  out[1] = (Math.atan(a) / QUARTER + 1) * 0.5 * S;
  out[2] = (Math.atan(b) / QUARTER + 1) * 0.5 * S;
  return out;
}

// Compose a world position from a dirFromCell anchor and a radius. This is
// THE seam between the two embeddings: sphere scales all three components,
// the plane keeps the footprint fixed and spends the radius on height alone.
export function posAt(d, rad, out = [0, 0, 0]) {
  if (FLAT) { out[0] = d[0]; out[1] = rad; out[2] = d[2]; return out; }
  out[0] = d[0] * rad; out[1] = d[1] * rad; out[2] = d[2] * rad;
  return out;
}

// "How high is this point", in the same units layers are counted in: the
// distance from the centre on a sphere, plain y on the plane.
export function radiusOfWorld(x, y, z) {
  return FLAT ? y : Math.hypot(x, y, z);
}

// Local up at a world point, written into `out` (any [x,y,z]-indexable).
export function upAtWorld(x, y, z, out = [0, 0, 0]) {
  if (FLAT) { out[0] = 0; out[1] = 1; out[2] = 0; return out; }
  const inv = 1 / (Math.hypot(x, y, z) || 1);
  out[0] = x * inv; out[1] = y * inv; out[2] = z * inv;
  return out;
}

// World point -> [f, u, v, h], or null if outside the shell.
export function cellAtWorld(x, y, z) {
  if (FLAT) {
    const h = Math.floor(y - R0);
    if (h < 0 || h >= H) return null;
    const u = Math.floor(x + S / 2), v = Math.floor(S / 2 - z);
    if (u < 0 || v < 0 || u >= S || v >= S) return null;
    return [2, u, v, h];
  }
  const r = Math.hypot(x, y, z);
  const h = Math.floor(r - R0);
  if (h < 0 || h >= H) return null;
  const inv = 1 / (r || 1);
  const c = cellFromDir(x * inv, y * inv, z * inv);
  const u = cellIdx(c[1]), v = cellIdx(c[2]);
  if (u < 0 || v < 0 || u >= S || v >= S) return null;
  return [c[0], u, v, h];
}

// Column neighbour, following the seam onto the adjacent face when needed.
// A plane has no seams to follow: past the edge there is nothing, so the
// neighbour is clamped to the rim rather than wrapped to a face that would
// generate ground out of nowhere.
export function neighborColumn(f, u, v, du, dv) {
  const nu = u + du, nv = v + dv;
  if (nu >= 0 && nv >= 0 && nu < S && nv < S) return [f, nu, nv];
  if (FLAT) return [f, cellIdx(nu), cellIdx(nv)];
  const d = dirFromCell(f, nu + 0.5, nv + 0.5);
  const c = cellFromDir(d[0], d[1], d[2]);
  return [c[0], cellIdx(c[1]), cellIdx(c[2])];
}

// Centre of a cell in world space.
export function cellCenterWorld(f, u, v, h, out = [0, 0, 0]) {
  dirFromCell(f, u + 0.5, v + 0.5, out);
  return posAt(out, R0 + h + 0.5, out);
}

// --- terrain --------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

class Noise3D {
  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  lattice(x, y, z) {
    const p = this.perm;
    return p[(p[(p[x & 255] + y) & 255] + z) & 255] / 255;
  }

  noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const tx = smooth(x - xi), ty = smooth(y - yi), tz = smooth(z - zi);
    const l = (dx, dy, dz) => this.lattice(xi + dx, yi + dy, zi + dz);
    const lerp = (a, b, t) => a + (b - a) * t;
    const c00 = lerp(l(0, 0, 0), l(1, 0, 0), tx);
    const c10 = lerp(l(0, 1, 0), l(1, 1, 0), tx);
    const c01 = lerp(l(0, 0, 1), l(1, 0, 1), tx);
    const c11 = lerp(l(0, 1, 1), l(1, 1, 1), tx);
    return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
  }

  fbm(x, y, z, octaves = 4) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

// --- the generations of terrain -------------------------------------------------------
//
// The planet is a pure function of its name — radius, seed, preset, designs —
// and changing the generator changes every world already made from one: a
// village sunk into a hillside that has moved, a player's house hanging over
// a ravine that was not there. So the generator is VERSIONED and the version
// is part of the name (see `terrain` in main.js's save and in server.py's
// session). A world made before the second generation keeps the first,
// forever; a world made after it gets the second.
//
//   1  rolling value-noise hills, terraced mountains, gorges, and caves as
//      thin tubes that never came near the surface.
//   2  the same planet made to look like ground: the hills bent by a slow
//      warp so they run in ridges and valleys instead of sitting in lumps;
//      bands of cliff where the ground steps up in escarpments, their faces
//      bare rock; outcrops of rock along the high ground; narrow ravines cut
//      deep into the country; caves that swell into caverns and narrow to
//      crawls, and open in the faces of the cliffs.
//   3  the planet the player asked for after walking the second: ground
//      like the block game's. Mountains with crags instead of contour
//      terraces; the ground chosen by SLOPE, not height — grass meadows high
//      up, bare stone on the steep faces, snow lying on the upper slopes and
//      never a band of earth under it; benches that wander; cliffs
//      standing straight out of the sea where the coast is high, with deep
//      water at their feet; escarpments rarer and ragged; an underground
//      twice as deep, with tunnels, great caverns and their pillars; and
//      ENTRANCES — a cut that runs up into a hillside, deepening as the hill
//      rises, and goes on into the hill as a tunnel.
//   4  the third's ground exactly, and villages laid out round the chief:
//      his hall at the head of the green, its arch facing the fountain (see
//      greenHall in village.js). A generation is everything a world's name
//      makes, and the hall moved every village after it on the planet.
//   5  COUNTRY. The fourth walked as one kind of ground from pole to pole:
//      the same gentle swell everywhere, woods on a fifth of it, and a view
//      that was grass to the haze. The fifth gives the land KINDS — plains
//      that lie flat, rolling ground, and hill country of round-topped
//      hills and flat-topped tables standing clear of it — and a CLIMATE
//      (warmth and wet, two slow fields over the latitude) that decides
//      where the deep woods are, where the open meadows, which tree grows,
//      and how thick the flowers stand. Trees come in sizes, with a great
//      one now and then; the woods have undergrowth, boulders and fallen
//      trunks; shores are sand, gravel and clay; and a cliff shows the coal
//      and iron in it. See the `gen5` branches below.
export const TERRAIN_LATEST = 5;
let TERRAIN_GEN = 1;
export function setTerrainGen(v) {
  TERRAIN_GEN = v >= 5 ? 5 : v >= 4 ? 4 : v >= 3 ? 3 : v >= 2 ? 2 : 1;
}
export const terrainGen = () => TERRAIN_GEN;

// Gradient noise, for the second generation. Value noise — Noise3D above —
// interpolates random HEIGHTS between its lattice points, and what comes out
// is lumps: the round blobs the first generation's hills were made of.
// Gradient noise interpolates random SLOPES, which gives ridges, saddles and
// valleys that run on. Same interface, same 0..1 range, near enough.
const GRAD = new Int8Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1,
  1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 1, 1, 0, 0, -1, 1,
  -1, 1, 0, 0, -1, -1]);
class GradNoise3D {
  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const p = this.perm;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = p[xi] + yi, AA = p[A] + zi, AB = p[A + 1] + zi;
    const B = p[xi + 1] + yi, BA = p[B] + zi, BB = p[B + 1] + zi;
    const g = (h, a, b, c) => {
      const i = (h & 15) * 3;
      return GRAD[i] * a + GRAD[i + 1] * b + GRAD[i + 2] * c;
    };
    const l = (t, a, b) => a + (b - a) * t;
    const r = l(w,
      l(v, l(u, g(p[AA], x, y, z), g(p[BA], x - 1, y, z)),
        l(u, g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z))),
      l(v, l(u, g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1)),
        l(u, g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1))));
    return r * 0.5 + 0.5;
  }

  fbm(x, y, z, octaves = 4) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
const sstep = (a, b, x) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

// Where the island of an island world is. Exported because a spawn point
// picked anywhere else on an ocean planet is 95% likely to be open water —
// main.js and travel.js should put the player down here.
export function islandDirection(seed) {
  const rnd = mulberry32((seed ^ 0x151a4d) | 0);
  const y = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(th) * rad, y, Math.sin(th) * rad];
}

// The direction a player should be dropped at, or null for "anywhere".
export function spawnDirection(seed, presetId = PRESET_ID) {
  return getPreset(presetId).island ? islandDirection(seed) : null;
}

// --- temperate patches ------------------------------------------------------
//
// Material choice is a hash of the column, which can mottle a world but
// cannot make regions of it: the hash is white noise, so "30% grass" comes
// out as confetti rather than as somewhere to live. A preset that wants
// pockets of ordinary ground therefore needs one spatially coherent field of
// its own, and that is the only new machinery here — everything else below is
// the existing shape/band/material path with a second set of lists hung off it.
//
// It is one octave of value noise, not an fbm: a mask does not need the
// detail, and a fifth octave on every column is real time at radius 800. The
// frequency is below FREQ so a patch is a region you can walk across rather
// than a clearing.

const PATCH_FREQ = 2.2;
const PATCH_SOFT = 0.05;      // ramp width, in field units, at the patch rim
const PATCH_SAMPLES = 1024;   // directions used to solve for the threshold

// The living tiles: the surface materials that mean "there is soil here".
// No specialised band uses one, so a column carrying one is a patch column.
const SOIL_TOPS = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND];

// Threshold leaving `frac` of the sphere above it. Value noise is bell-shaped
// about 0.5 with no closed form, so solve it by sampling: 1024 evaluations
// once per world against millions per column, and the answer is exact rather
// than a fitted guess that drifts with the seed.
function patchGate(pat, frac) {
  const v = new Float64Array(PATCH_SAMPLES);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < PATCH_SAMPLES; i++) {
    const y = 1 - ((i + 0.5) / PATCH_SAMPLES) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y)), th = golden * i;
    v[i] = pat.noise(Math.cos(th) * r * PATCH_FREQ + 70,
      y * PATCH_FREQ + 70, Math.sin(th) * r * PATCH_FREQ + 70);
  }
  v.sort();
  return v[Math.min(PATCH_SAMPLES - 1, Math.floor((1 - frac) * PATCH_SAMPLES))];
}

// The patch weight of the column the height field was last asked about.
// rawColumn needs it to pick the material lists, and the mask's noise is
// already in hand inside the height field — evaluating it a second time in
// rawColumn would double what the mask costs. Only one planet is resident at
// a time and the read is the statement after the call, so the coupling is
// tight enough to be safe; nothing else may read this.
let lastPatch = 0;
// ...and the same channel for the canyon cut, so a column can be given rock
// for a surface when the ground it stands on has been cut away from under it.
let lastCut = 0;
// ...and, for the second generation, whether this column is a cliff face, an
// outcrop or a ravine wall: ground too steep or too broken to hold soil,
// which comes up bare rock (see rawColumn).
let lastRock = 0;
// ...and how much mountain range this column stands in (the third
// generation reads the slope, which costs four more samples, only there)
let lastMount = 0;
// ...and how much HILL COUNTRY it is (the fifth generation): 0 on the plains,
// 1 among the hills. The woods and the boulders read it.
let lastRough = 0;

// Terrain height (radius) for a unit direction. Exported for the tests.
// R and AMP are captured, not read live: columns now materialise long after
// construction, and setWorldSize may have moved on by then. So is the preset,
// for the same reason.
//
// The preset only ever reshapes the profile in units of AMP and the result is
// clamped to +/- 1, so the shell always covers the terrain whatever a shape
// function does.
export function makeHeightField(seed = 1337, presetObj = PRESET) {
  const P = presetObj || PRESETS.terran;
  const noise = new Noise3D(seed);
  const r = R, amp = AMP;
  const shape = P.shape || ID;
  // a second, finer field, only for the presets that ask for it
  const det = P.detail ? new Noise3D((seed ^ 0x0de7a11) | 0) : null;
  const dFreq = FREQ * (P.detailFreq || 4.3);
  // and the patch mask, only for the presets that want ordinary ground in
  // among their own; the threshold is solved once, here, not per column
  const pat = P.patch ? new Noise3D((seed ^ 0x9a7c4e) | 0) : null;
  const gate = pat ? patchGate(pat, P.patch) : 0;
  // Mountains: a low-frequency mask that says where a RANGE is, and a ridged
  // field that gives it peaks and saddles once you are inside one. Two fields
  // rather than one because a single noise raised to a power gives domes —
  // the mask decides where mountains happen, the ridge decides what they look
  // like, and only the mask is smooth, so a range has foothills and an edge.
  const M = P.mountains || null;
  const mt = M ? new Noise3D((seed ^ 0x3e11a) | 0) : null;
  const mFreq = M ? FREQ * (M.freq || 0.55) : 0;
  const mGate = M ? (M.gate === undefined ? 0.55 : M.gate) : 0;
  // How far above the gate the mask has to climb for a full-height peak.
  // Normalising by (1 - gate) instead looks tidy and is wrong: fbm is a sum
  // of octaves, so it is a bell around 0.5 and almost never approaches 1 —
  // the ranges came out as low swells because the top of the scale was never
  // reached. This is the width of the part of the distribution that is
  // actually up there.
  const mSpan = M ? (M.span === undefined ? 0.16 : M.span) : 1;
  // How fine the ridges are, as a multiple of the range frequency. This is
  // the number that decides whether a mountain can be WALKED UP: the peaks
  // carry the full height either way, and a fine ridge spends it over a few
  // blocks — a cliff — where a coarse one spends it over fifty.
  const mRough = M ? (M.rough === undefined ? 1.6 : M.rough) : 1;
  // Terracing, and it is the whole of what makes a cliff. A smooth height
  // field has no cliffs in it at any amplitude: raise the peaks and you get a
  // taller ramp, which is why the old ranges read as hills however high they
  // were pushed. Snapping the mountain term to STEPS levels gives flat shelves
  // with the whole step between them falling in one column — a wall you have
  // to walk round or pillar up, which is what Minecraft's cliffs are.
  //
  // `cliff` is how much of the way to the stepped height to go: at 1 the range
  // is a wedding cake, at 0 it is the old smooth ridge. Part way keeps the
  // shelves reading as ground rather than as masonry.
  const mSteps = M ? (M.terrace === undefined ? 5 : M.terrace) : 0;
  const mCliff = M ? (M.cliff === undefined ? 0 : M.cliff) : 0;
  // From the PRESET, not from the module's PEAK. main.js samples this
  // function for every OTHER world in the system to draw the overview, with
  // this world's R and AMP still loaded — so reading module state here gave
  // every sibling the mountains of whichever planet you happened to be
  // standing on, and made the height field ignore its own argument.
  // The same cap setWorldPreset applies to PEAK, and it has to be applied
  // HERE too or the two disagree: PEAK only sizes the shell, this is the
  // terrain. A range is never more than 40% of the radius, which does nothing
  // to a real planet and stops a marble from being all mountain.
  const peak = Math.min(amp * (M ? M.height : 0), r * 0.4);
  // Canyons. A gorge is a LINE, and the only cheap way to get lines out of
  // noise is the crest of a ridged field — the same trick the mountains use to
  // get a range instead of a dome, read the other way up and cut instead of
  // raised. Taking only the top few per cent of the crest is what makes it
  // narrow: the band is a thin strip either side of the level set, and it runs
  // as far as the level set does, which is hundreds of blocks.
  //
  // Three fields, not one, and each does a job the others cannot:
  //   mask    where canyon COUNTRY is, so most of the world has none. A planet
  //           scored with gorges everywhere is not dramatic, it is corduroy.
  //   crest   the line itself
  //   depth   how deep this stretch runs, so a canyon deepens and shallows
  //           along its length instead of being an extruded trench
  const CV = P.canyons || null;
  const cvt = CV ? new Noise3D((seed ^ 0x0ca27b) | 0) : null;
  const cvFreq = CV ? FREQ * (CV.freq ?? 1.5) : 0;
  const cvMFreq = CV ? FREQ * (CV.maskFreq ?? 0.45) : 0;
  const cvGate = CV ? (CV.gate ?? 0.90) : 1;
  const cvMask = CV ? (CV.mask ?? 0.54) : 1;
  const cvSoft = CV ? (CV.soft ?? 0.08) : 1;
  const cvDepth = CV ? Math.min(amp * CV.depth, r * 0.32) : 0;
  // A shallow cut is not a canyon, it is a ditch, and the tails of every
  // gorge are shallow cuts — they were four fifths of what this made. Under
  // this many blocks nothing is cut at all, which both throws the ditches away
  // and gives what survives an abrupt rim you can stand on and look over.
  // That rim IS the feature: the ground ending is what tells you it is there.
  const cvMin = Math.max(3, cvDepth * 0.15);
  // Sea level in the same units the field returns. A canyon is never cut
  // below it: a trench whose floor is under the sea fills to the brim and
  // reads as a channel, not a gorge — you cannot walk down into it, and the
  // one thing a canyon has to offer is that you can.
  const seaR = P.seaLevel === null ? -Infinity : r + amp * P.seaLevel;
  // ...which means depth has to be EARNED by altitude: on ground a few blocks
  // above the water there is only room for a ditch, and cutting one there was
  // most of what this made. So a canyon does not start at all unless the
  // ground it is cutting stands high enough to take most of one. Fewer of
  // them, and the ones left are gorges rather than gutters.
  const cvRoom = CV ? cvDepth * (CV.room ?? 0.55) : 0;
  // THE SECOND GENERATION (see TERRAIN_GEN). Not on the drafting table, not
  // under a city, not on an empty world: a table is flat on purpose.
  const V2 = TERRAIN_GEN >= 2 && !P.plane && !P.city && !P.empty;
  const V3 = V2 && TERRAIN_GEN >= 3;
  const V5 = V3 && TERRAIN_GEN >= 5;
  // what the fifth generation's relief is counted up from: the sill the
  // preset floods below, so no lake is made deeper or shallower by it
  const sill5 = P.seaLevel === null ? -1 : P.seaLevel;
  const gw = V2 ? new GradNoise3D((seed ^ 0x57a2b1) | 0) : null;   // the warp
  const gr = V2 ? new GradNoise3D((seed ^ 0x2e70d5) | 0) : null;   // the rock
  // how tall one step of an escarpment is, in blocks: a cliff you notice,
  // on any planet big enough to have them, and never taller than the relief
  const stepLo = Math.max(3, amp * 0.5), stepHi = Math.max(4, Math.min(16, amp * 1.25));
  // how deep a ravine may go: a slot you could lose a house in
  const ravDeep = Math.min(amp * 1.5 + 6, 26);
  // what the steps are counted up from: the sea, or on a dry world the
  // bottom of its ordinary relief
  const land0 = Number.isFinite(seaR) ? seaR : r - amp;
  // The island mask is one bell around a seeded direction. It is what makes
  // the ocean world a single island rather than a scattering of them: the
  // emergent set is a level set of a function that decreases with angle.
  let ix = 0, iy = 0, iz = 0, iw = 0;
  if (P.island) {
    const c = islandDirection(seed);
    ix = c[0]; iy = c[1]; iz = c[2];
    iw = P.island;
  }

  const natural = (nx, ny, nz) => {
    let bx = nx * FREQ + 100, by = ny * FREQ + 100, bz = nz * FREQ + 100;
    if (V2) {
      // Bend the ground before it is drawn: the rolling field read through a
      // slow warp of itself. A lump in a height field is a lump however it is
      // scaled; pulled sideways by a smoother field it becomes a spur, a
      // saddle, a valley that winds — the shapes water and time leave.
      const wf = FREQ * 0.85;
      bx += (gw.fbm(nx * wf + 3, ny * wf + 3, nz * wf + 3, 2) - 0.5) * 0.7;
      by += (gw.fbm(nx * wf + 19, ny * wf + 19, nz * wf + 19, 2) - 0.5) * 0.7;
      bz += (gw.fbm(nx * wf + 37, ny * wf + 37, nz * wf + 37, 2) - 0.5) * 0.7;
    }
    let n = (noise.fbm(bx, by, bz, 4) - 0.5) * 2;
    if (V2) {
      // ...and its finest scale out of gradient noise, which runs in small
      // ridges and runnels where value noise sat in pimples
      const fd = FREQ * 7;
      n += (gw.fbm(nx * fd + 51, ny * fd + 51, nz * fd + 51, 2) - 0.5) * 0.05;
      // ...which widens the spread of the field, and a wider spread under the
      // same sea level is more sea: a nudge up gives the land back. (Less of
      // one in the third generation, whose mountains no longer terrace their
      // foothills down into the lakes round them: with the second's nudge its
      // worlds came out a third drier, one at 7% sea where the second had 14;
      // measured over three seeds, this puts the sea back at 19% to the
      // second's 18.6%.)
      n += V3 ? 0.03 : 0.1;
    }
    let d = 0, isl = 0;
    if (det) {
      d = (det.fbm(nx * dFreq + 17, ny * dFreq + 17, nz * dFreq + 17, 2) - 0.5)
        * 2;
    }
    if (iw) {
      // angle from the island centre, in the mask's own width units
      const c = nx * ix + ny * iy + nz * iz;
      const a = Math.acos(c > 1 ? 1 : c < -1 ? -1 : c) / iw;
      isl = Math.exp(-a * a);
    }
    let t = 0;
    if (pat) {
      const p = pat.noise(nx * PATCH_FREQ + 70, ny * PATCH_FREQ + 70,
        nz * PATCH_FREQ + 70);
      t = (p - gate) / PATCH_SOFT + 0.5;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    lastPatch = t;
    let s = shape(n, d, isl, t);
    if (s > 1) s = 1; else if (s < -1) s = -1;
    lastRough = 0;
    if (V5 && s > sill5) {
      // KINDS OF COUNTRY. One slow field says how rough the land is here:
      // under it the same swell is pressed nearly flat (plains — and a
      // village wants nothing better), left as it was, or stood up to almost
      // twice its height. Averaged over the planet the relief is what it
      // was; it is the CONTRAST that is new — you walk out of a plain into
      // hills, which a world that was all one gentle roll never let you do.
      const rf = gw.fbm(nx * FREQ * 0.6 + 211, ny * FREQ * 0.6 + 211,
        nz * FREQ * 0.6 + 211, 2);
      const rough = sstep(0.45, 0.70, rf);
      lastRough = rough;
      s = sill5 + (s - sill5) * (0.42 + 0.95 * rough);
      // HILLS AND TABLES, in the rough country: a billow field read through
      // a step, so each one is a hill standing on its own with a rounded
      // shoulder and — where the field runs high — a flat top you can build
      // on. That flat top is the whole difference between a hill and a
      // bump: the eye reads the shape against the sky.
      if (rough > 0.02) {
        const hf = FREQ * 2.7;
        const b = gr.noise(nx * hf + 171, ny * hf + 171, nz * hf + 171);
        const hill = sstep(0.42, 0.84, b);
        s += rough * hill * hill * 0.36;
      }
      if (s > 1) s = 1;
    }
    let m = 0;
    lastMount = 0;
    if (mt) {
      const g = mt.fbm(nx * mFreq + 31, ny * mFreq + 31, nz * mFreq + 31, 3);
      let k = (g - mGate) / mSpan;
      if (k > 0) {
        lastMount = k > 1 ? 1 : k;
        if (k > 1) k = 1;
        k = k * k * (3 - 2 * k);                  // smooth foothills
        // ridged, so a range is a line of peaks with cols between them and
        // not one long whaleback
        const rg = 1 - 2 * Math.abs(
          mt.noise(nx * mFreq * mRough + 7, ny * mFreq * mRough + 7,
            nz * mFreq * mRough + 7) - 0.5);
        // A range is a line of PEAKS, and this is where they get their shape.
        // The old profile handed 45% of the height to everything inside the
        // mask and put only the remaining 55% on the ridge, which builds a
        // massif with bumps on it — a mountain with a summit you could land a
        // plane on. Cubing the ridge and giving it nearly all of the height
        // pulls the mass in toward the crest, so the flanks fall away from a
        // narrow top.
        // ...and one ridge on its own is a WALL: its crest is a level set, so
        // the height stays at the maximum all the way along it and the
        // "summit" is fifty blocks of ridgeline. A second ridged field at a
        // different frequency, multiplied in, is high only where both crests
        // cross — which is a point. That product is what makes peaks instead
        // of a rampart, and it is the whole trick.
        const rg2 = 1 - 2 * Math.abs(
          mt.noise(nx * mFreq * mRough * PEAK_BEAT + 53,
            ny * mFreq * mRough * PEAK_BEAT + 53,
            nz * mFreq * mRough * PEAK_BEAT + 53) - 0.5);
        const rg3 = rg * rg * rg2 * rg2;
        m = k * (0.20 + 0.80 * rg3);
        if (V3) {
          // CRAGS, not terraces. The second generation snapped its ranges
          // to shelves, and from the next hill a mountain was a stack of
          // contour rings with a flat top — a cake. The third leaves the
          // ridge its own shape and roughens its upper half with a finer
          // ridged field: spurs and pinnacles, steepest where it is highest.
          const jg = 1 - 2 * Math.abs(mt.noise(nx * mFreq * mRough * 3.3 + 17,
            ny * mFreq * mRough * 3.3 + 17, nz * mFreq * mRough * 3.3 + 17) - 0.5);
          m += k * 0.1 * jg * jg * jg * (0.25 + 0.75 * m);
          // ...and BENCHES on the lower flanks, which are what keeps a range
          // walkable (without them a quarter of the world's dry ground was
          // steeper than 26 degrees). Not the second generation's contour
          // rings: the level each bench is cut at drifts round the mountain
          // by up to half a step, so the shelves wander in and out of each
          // other the way a real hillside's do, and the top fifth is left
          // to its crags.
          if (mSteps > 0) {
            const drift = (mt.noise(nx * mFreq * 2.2 + 73, ny * mFreq * 2.2 + 73,
              nz * mFreq * 2.2 + 73) - 0.5) / mSteps;
            const q = Math.round((m + drift) * mSteps) / mSteps - drift;
            // (faded in over the lowest foothills, where a wandering level
            // rounding the ground up would lift a range's lake shores dry)
            m += (q - m) * 0.95 * k * (1 - m * m) * sstep(0.03, 0.12, m);
          }
        } else if (mCliff > 0 && mSteps > 0) {
          // toward the shelf, but scaled by k as well: the terracing has to
          // fade out with the range itself, or the foothills end at a step and
          // the mountain starts with a wall standing in open ground.
          //
          // ...and by (1 - m^2), which is the other half of the pointed top.
          // A terrace is a flat shelf; snapping the summit to one is exactly
          // how the peak became a table. Full terracing on the flanks, where
          // it is the cliffs, and none at all in the last fifth.
          const q = Math.round(m * mSteps) / mSteps;
          m += (q - m) * mCliff * k * (1 - m * m);
        }
      }
    }
    // (the third generation's hills are the second's height: taller ones
    // were measured to cost a world a fifth of its village sites and to tip
    // its ground past walkable — the drama is in the ranges and the coasts)
    let base = r + s * amp + m * peak;
    let rock = 0;
    if (V3 && Number.isFinite(seaR)) {
      // SEA CLIFFS. Where the coast is high country, the land does not
      // shelve down to a beach: it stands straight up out of the water, a
      // face of about the ordinary relief, and the sea is deep at its foot.
      //
      // The low coastal ground is raised onto the cliff's top and eased
      // back into the country behind it: the raise is the cliff's full
      // height at the water and falls away as the ground climbs, gone by
      // twice that height. So behind the face the land is a little FLATTER
      // than it was, never steeper — a headland, then the hills. Below the
      // water the bed drops away from the face and comes back up to the
      // sea's own floor further out.
      //
      // The regions, and the height of the face, change over hundreds of
      // blocks: a raise that varies quickly ACROSS the country tilts it, and
      // the first cut, whose regions changed every few dozen blocks, took
      // the world's median slope from 12 degrees to 17. They sit where the
      // continent is low — beside the oceans, not round the lakes in the
      // hills. (Drowning the low coast instead, which tilts nothing, was
      // measured too: it took one world's sea from 14% of the surface to 43%.)
      const cm = gr.fbm(nx * FREQ * 0.35 + 131, ny * FREQ * 0.35 + 131, nz * FREQ * 0.35 + 131, 2);
      let ck = sstep(0.46, 0.6, cm);
      if (ck > 0) {
        const lp = (noise.noise(nx * FREQ * 0.4 + 7, ny * FREQ * 0.4 + 7, nz * FREQ * 0.4 + 7) - 0.5) * 2;
        ck *= 1 - sstep(-0.25, 0.25, lp);
      }
      if (ck > 0) {
        const C = amp * (0.65 + 0.5 * gr.noise(nx * FREQ * 0.6 + 151,
          ny * FREQ * 0.6 + 151, nz * FREQ * 0.6 + 151));
        const x = base - seaR;
        if (x >= 0 && x < 2 * C) {
          base += ck * (C - 0.5 * x);
          // the lip: the first blocks of land stand on the face itself
          if (ck > 0.5 && x < 1.2) rock = 1;
        } else if (x < 0 && x > -C) base -= 0.6 * C * ck * (1 + x / C);
      }
    }
    if (V2 && base > land0 + 1) {
      // ESCARPMENTS. In cliff country the ground climbs in steps: a shelf
      // that rises gently, then a face of rock taking the whole step in a
      // column or two, then the next shelf. The steps are not a contour
      // drawn round the hill — their height and where they fall wander with
      // the ground — and a shelf keeps a fifth of its own slope, so it reads
      // as ground and not as masonry. Bare rock on the face, soil on the top.
      const em = gr.fbm(nx * FREQ * 0.75 + 61, ny * FREQ * 0.75 + 61,
        nz * FREQ * 0.75 + 61, 2);
      // rarer in the third generation, and ragged: a step whose edge wanders
      // at the scale of a few blocks is a cliff; one that follows the
      // contour exactly is a staircase somebody laid
      const k = V3 ? sstep(0.61, 0.65, em) : sstep(0.56, 0.6, em);
      if (k > 0) {
        const sh = stepLo + (stepHi - stepLo)
          * gr.noise(nx * FREQ * 2.3 + 7, ny * FREQ * 2.3 + 7, nz * FREQ * 2.3 + 7);
        let ph = sh * gr.noise(nx * FREQ * 1.7 + 13, ny * FREQ * 1.7 + 13,
          nz * FREQ * 1.7 + 13);
        if (V3) {
          ph += sh * 0.12 * (gr.noise(nx * FREQ * 9 + 43, ny * FREQ * 9 + 43,
            nz * FREQ * 9 + 43) - 0.5);
        }
        const hb = base - land0;
        const t = (hb + ph) / sh, kf = Math.floor(t), fr = t - kf;
        const RW = 0.12;
        const rise = sstep(1 - RW, 1, fr);
        const stepped = (kf + rise) * sh - ph;
        const target = stepped * 0.8 + hb * 0.2;
        base += (target - hb) * k;
        // the face, and the lip just before it: bare rock from the edge of
        // the shelf down, so the soil stops at the top of the cliff
        if (k > 0.3 && fr > 1 - RW - 0.06 && rise < 0.95) rock = 1;
      }
      // OUTCROPS. Along the high ground, where a ridge of harder rock stands
      // out of the soil: a spine of bare stone a block or three proud of the
      // turf, following the line of the hill.
      const hb2 = base - land0;
      if (hb2 > 3) {
        const tm = gr.noise(nx * FREQ * 1.4 + 83, ny * FREQ * 1.4 + 83, nz * FREQ * 1.4 + 83);
        if (tm > 0.6) {
          const tr = 1 - 2 * Math.abs(gr.noise(nx * FREQ * 5.5 + 71,
            ny * FREQ * 5.5 + 71, nz * FREQ * 5.5 + 71) - 0.5);
          if (tr > 0.8) {
            base += ((tr - 0.8) / 0.2) * 3.2 * sstep(0.6, 0.7, tm) * sstep(4, 9, hb2);
            rock = 1;
          }
        }
      }
      // RAVINES. A crack in the country: a few blocks across, as deep as a
      // house is tall and more, its walls falling sheer from the turf to a
      // floor of stone. The crest of a ridged field, taken very thin, drawn
      // only where ravine country is, and never down to the water.
      const hb3 = base - land0;
      if (hb3 > 6) {
        const rm = gr.fbm(nx * FREQ * 0.6 + 91, ny * FREQ * 0.6 + 91, nz * FREQ * 0.6 + 91, 2);
        if (rm > 0.58) {
          const rr = 1 - 2 * Math.abs(gr.noise(nx * FREQ * 3 + 97,
            ny * FREQ * 3 + 97, nz * FREQ * 3 + 97) - 0.5);
          if (rr > 0.9) {
            const w = (rr - 0.9) / 0.1;
            const room = hb3 - 3;
            const cutR = Math.min(room, ravDeep) * sstep(0.58, 0.64, rm) * Math.sqrt(w);
            if (cutR > 3) { base -= cutR; rock = 1; }
          }
        }
      }
    }
    lastRock = rock;

    let cut = 0;
    if (cvt && base > seaR + cvRoom) {
      const mk = cvt.fbm(nx * cvMFreq + 41, ny * cvMFreq + 41, nz * cvMFreq + 41, 2);
      if (mk > cvMask) {
        // country first: how much canyon this stretch of the world is allowed
        let strength = (mk - cvMask) / cvSoft;
        if (strength > 1) strength = 1;
        const rg = 1 - 2 * Math.abs(
          cvt.noise(nx * cvFreq + 9, ny * cvFreq + 9, nz * cvFreq + 9) - 0.5);
        if (rg > cvGate) {
          // 0 at the lip, 1 in the middle. The square root is the profile:
          // it rises almost vertically off the lip and flattens in the
          // middle, which is a gorge with walls and a floor. Linear gives a
          // V — a valley, which the terrain already has plenty of.
          const w = (rg - cvGate) / (1 - cvGate);
          cut = cvDepth * strength * Math.sqrt(w > 1 ? 1 : w);
          // never below the water line: see seaR
          const room = base - (seaR + 2);
          if (cut > room) cut = room > 0 ? room : 0;
          if (cut < cvMin) cut = 0;
        }
      }
    }
    lastCut = cut;
    return base - cut;
  };
  if (!V3) return natural;

  // CAVE ENTRANCES (the third generation). Sites are chosen once, for the
  // whole planet, from its own seed: about one candidate every forty blocks
  // of surface, kept only on a dry HILLSIDE — not flat ground, where the
  // villages want to be, and not a cliff. Each is a cut that runs straight
  // up the slope into the hill: its floor sinks gently while the hill
  // rises, so it deepens as it goes, and at its end a tunnel carries on into
  // the hill, descending (see caveMask3 — the tunnel is the cave's, the cut
  // is the ground's, and both read these same sites).
  const ent = entranceSites(seed, r, seaR, natural);
  const withEntrances = (nx, ny, nz) => {
    const h = natural(nx, ny, nz);
    if (h < seaR + 1) return h;
    const floor = ent.cutFloor(nx, ny, nz);
    if (floor < h) { lastRock = 1; return floor; }
    return h;
  };
  withEntrances.entrances = ent;
  return withEntrances;
}

// The third generation's cave entrances, as sites on the sphere with a small
// bucket grid over them, so a column looks at the handful near it and never
// the planet's whole list. `near(dir, fn)` calls fn(site, along, across) for
// every site whose cut or tunnel could reach dir, with along/across in
// blocks in that site's own frame: along runs up the slope from the mouth.
function entranceSites(seed, r, seaR, height) {
  const rand = mulberry32((seed ^ 0x3e17a5) | 0);
  const n = Math.round((4 * Math.PI * r * r) / (38 * 38));
  const B = Math.max(1, Math.floor(r / 96));   // buckets per unit of direction: ~96 blocks
  const grid = new Map();
  const key = (i, j, k) => ((i + 64) * 131 + (j + 64)) * 131 + (k + 64);
  const e = 2 / r;
  for (let i = 0; i < n; i++) {
    const z = rand() * 2 - 1, a = rand() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    const c = [q * Math.cos(a), q * Math.sin(a), z];
    const roll = rand(), lr = rand(), wr = rand(), tr = rand();
    if (roll > 0.55) continue;
    const hc = height(c[0], c[1], c[2]);
    if (hc < seaR + 4) continue;
    // a tangent frame, and the slope across it
    const t1 = Math.abs(c[1]) < 0.9 ? [c[2], 0, -c[0]] : [0, -c[2], c[1]];
    const l1 = Math.hypot(t1[0], t1[1], t1[2]);
    t1[0] /= l1; t1[1] /= l1; t1[2] /= l1;
    const t2 = [c[1] * t1[2] - c[2] * t1[1], c[2] * t1[0] - c[0] * t1[2], c[0] * t1[1] - c[1] * t1[0]];
    const at = (s1, s2) => height(c[0] + (t1[0] * s1 + t2[0] * s2) * e,
      c[1] + (t1[1] * s1 + t2[1] * s2) * e, c[2] + (t1[2] * s1 + t2[2] * s2) * e);
    const gx = (at(1, 0) - at(-1, 0)) / 4, gy = (at(0, 1) - at(0, -1)) / 4;
    const g = Math.hypot(gx, gy);
    if (g < 0.42 || g > 2.2) continue;
    // up the slope
    const tx = (t1[0] * gx + t2[0] * gy) / g, ty = (t1[1] * gx + t2[1] * gy) / g,
      tz = (t1[2] * gx + t2[2] * gy) / g;
    const st = {
      c, hc, t: [tx, ty, tz],
      s: [c[1] * tz - c[2] * ty, c[2] * tx - c[0] * tz, c[0] * ty - c[1] * tx],
      L: 10 + lr * 6,               // blocks of open cut
      w: 1.5 + wr * 1.1,            // its half width
      tube: 18 + tr * 16,           // blocks of tunnel beyond it
      rad: 1.5 + wr * 0.8,
    };
    const b = key(Math.floor(c[0] * B), Math.floor(c[1] * B), Math.floor(c[2] * B));
    if (!grid.has(b)) grid.set(b, []);
    grid.get(b).push(st);
  }
  return {
    count: [...grid.values()].reduce((m, l) => m + l.length, 0),
    // every site, for a check that wants to go and look at one
    sites: () => [...grid.values()].flat(),
    // Whether any entrance's mouth is within `blocks` of dir — the village
    // planner's question: a settlement levels its plot, and one laid across
    // a cut builds its ground back up out of the trench in pillars.
    within(nx, ny, nz, blocks) {
      const lim = blocks * blocks;
      const fx = nx * B - 0.5, fy = ny * B - 0.5, fz = nz * B - 0.5;
      const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
      for (let i = i0; i <= i0 + 1; i++) {
        for (let j = j0; j <= j0 + 1; j++) {
          for (let k = k0; k <= k0 + 1; k++) {
            const list = grid.get(key(i, j, k));
            if (!list) continue;
            for (const st of list) {
              const dx = (nx - st.c[0]) * r, dy = (ny - st.c[1]) * r, dz = (nz - st.c[2]) * r;
              if (dx * dx + dy * dy + dz * dz < lim) return true;
            }
          }
        }
      }
      return false;
    },
    // The floor of whichever entrance cut `dir` is in, or Infinity: the
    // height field's read, called for every column, so no callback in it.
    cutFloor(nx, ny, nz) {
      let out = Infinity;
      const fx = nx * B - 0.5, fy = ny * B - 0.5, fz = nz * B - 0.5;
      const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
      for (let i = i0; i <= i0 + 1; i++) {
        for (let j = j0; j <= j0 + 1; j++) {
          for (let k = k0; k <= k0 + 1; k++) {
            const list = grid.get(key(i, j, k));
            if (!list) continue;
            for (let q = 0; q < list.length; q++) {
              const st = list[q];
              const dx = (nx - st.c[0]) * r, dy = (ny - st.c[1]) * r, dz = (nz - st.c[2]) * r;
              const along = dx * st.t[0] + dy * st.t[1] + dz * st.t[2];
              if (along < -1 || along > st.L) continue;
              const across = dx * st.s[0] + dy * st.s[1] + dz * st.s[2];
              const w = st.w * (along < 1.5 ? 0.6 + 0.16 * (along + 1) : 1);
              if (across > w || across < -w) continue;
              const floor = st.hc - (along > 0 ? along * 0.35 : 0) - (along < 0 ? 1 + along : 1);
              if (floor < out) out = floor;
            }
          }
        }
      }
      return out;
    },
    near(nx, ny, nz, fn) {
      const fx = nx * B - 0.5, fy = ny * B - 0.5, fz = nz * B - 0.5;
      const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
      for (let i = i0; i <= i0 + 1; i++) {
        for (let j = j0; j <= j0 + 1; j++) {
          for (let k = k0; k <= k0 + 1; k++) {
            const list = grid.get(key(i, j, k));
            if (!list) continue;
            for (const st of list) {
              const dx = (nx - st.c[0]) * r, dy = (ny - st.c[1]) * r, dz = (nz - st.c[2]) * r;
              const along = dx * st.t[0] + dy * st.t[1] + dz * st.t[2];
              if (along < -2 || along > st.L + st.tube + 2) continue;
              const across = dx * st.s[0] + dy * st.s[1] + dz * st.s[2];
              if (across > 4 || across < -4) continue;
              fn(st, along, across);
            }
          }
        }
      }
    },
  };
}

// --- storage ---------------------------------------------------------------
//
// One flat Uint8Array over the shell cannot scale: at radius 800 it is
// 6 x 1264 x 1264 x 144 = 1.4 GB, and filling it eagerly takes minutes. But
// generation is a *height field* — a column is stone, a little dirt, one
// surface block, then maybe water — and that profile is a pure function of
// the column's direction. So the world keeps only:
//
//   colTop/colMat  the column's terrain record, computed on first touch.
//                  colMat 0 means "not computed yet": AIR is never a surface
//                  material, so the sentinel costs nothing.
//   ore            a hash of the cell coordinates. Not storage at all.
//   ov             a Uint16Array(H) override, allocated only for the columns
//                  that trees, villages or the player actually changed.
//
// Five bytes per column instead of 2H bytes per cell: 48 MB at radius 800,
// 0.5 MB at radius 78, and construction is a couple of array allocations.
//
// A cell used to be a BYTE, and that byte was the ceiling on the whole BLOCK
// enum — 255 was this sentinel, so the last usable id was 254 and the last
// three families in that list were sized by what was left rather than by what
// they wanted. It is a Uint16 now. That doubles the column record and the
// override arrays and buys nothing else, which is the right trade exactly once:
// when the alternative is renumbering ids that are written into every saved
// world's edit diff.

const NONE = 0xffff;        // override sentinel: this cell has no override
export const FEATURE = 32;  // trees are generated per FEATURE x FEATURE region
// one tree per 614 columns is what the old whole-planet pass achieved
const TREE_DENSITY = 1 / 614;
// The woods. FOREST_FREQ is lattice cells per planet radius, so ~7 gives
// stands a couple of hundred blocks across on a radius-156 world; the gate
// decides how much of the surface is wooded at all, and FOREST_PACK how many
// more trees are asked for so that the wooded part is properly full. The two
// move together: raising the gate alone gives the same thin scatter in a
// smaller area, which is not a forest either.
//
// PACK looks enormous next to TREE_DENSITY, and it is: that density was set
// when a tree could not stand next to a tree (see plantTree), so asking for
// more of them simply wasted the attempts. With that fixed, 20 puts a trunk
// every fifty columns inside a wood and closes the canopy over about seventy
// per cent of it — dense enough that you push through rather than stroll.
const FOREST_FREQ = 7;
const FOREST_PACK = 20;
const FOREST_GATE = 0.60;

// --- deserts ------------------------------------------------------------------
//
// A desert is a REGION, not a band of latitude: one low-frequency field with a
// high gate, so a world grows a handful of them and everything between them is
// the countryside it always was. Three things bound where one can be.
//
//   size      only worlds of DESERT_MIN radius and up grow any at all. On a
//             radius-50 planet a desert of any believable size IS the planet,
//             and the whole appeal of one is being somewhere you can walk into
//             and back out of.
//   latitude  they sit in the hot half of the world, |dir.y| under DESERT_LAT,
//             for the same reason the equator's grass is drier — it is where
//             the sun stands overhead.
//   ground    they take the LIVING ground, grass and the beach beside it, and
//             leave rock, snow, canyon floors and the sea bed alone. A dune
//             painted up a cliff face is not a desert, it is a paint error.
//
// The gate is high on purpose: measured over a radius-400 terran world it
// leaves a few per cent of the land as desert. Deserts, but not many.
const DESERT_MIN = 150;        // smallest world radius that grows one
const DESERT_FREQ = 3.0;       // lattice cells per planet radius: big regions
const DESERT_GATE = 0.635;     // field value a column has to beat
const DESERT_SOFT = 0.075;     // ...dithered over this much, so the rim frays
const DESERT_LAT = 0.5;        // |dir.y| past which it is too cool for one
const DESERT_LAT_SOFT = 0.16;  // ...and the band it cools off over
const DESERT_DEPTH = 5;        // blocks of sand before you are into the rock

// WHICH TREE GROWS WHERE. The caps are on Y, so |y| of a cell's direction is
// how far from the equator it stands, and the belts are read off that: the
// spruce belt toward the caps, birch and oak below it, oak and the dark wood
// in the warm belt, acacia in the tropics. Within a belt that offers two, a
// wood is ONE species — the choice is hashed off the sixteen-column patch the
// trunk stands in, the way a berry patch is one berry — so what you walk into
// is a birch wood and then an oak wood, not a salad. The shape is the
// species': trunk courses, crown radius, how far the crown reaches under and
// over the top of the trunk, and how squashed it is (a spruce is a spire, an
// acacia a plate).
//
// Species by index into WOOD_SPECIES: 0 oak, 1 birch, 2 spruce, 3 acacia,
// 4 dark. `logId` turns one into the block the trunk is laid in.
const TREE_KINDS = {
  oak: { species: 0, trunk: [4, 6], radius: 2.4, below: -1, above: 2, squash: 1.3 },
  birch: { species: 1, trunk: [5, 7], radius: 2.0, below: -1, above: 2, squash: 1.1 },
  spruce: { species: 2, trunk: [6, 9], radius: 1.9, below: -3, above: 2, squash: 0.7 },
  acacia: { species: 3, trunk: [4, 6], radius: 3.2, below: 0, above: 1, squash: 2.6 },
  dark: { species: 4, trunk: [5, 7], radius: 2.9, below: -1, above: 2, squash: 1.3 },
};
const _tk = [0, 0, 0];
// The planet whose climate the species are read off, when it has one (the
// fifth generation): the belts are still latitude, pushed toward the caps or
// the equator by how warm this country is, so a cold upland grows spruce in
// the oak belt and a warm valley keeps its oaks a long way north.
let CLIMATE = null;
export function treeKindAt(f, u, v) {
  const d = dirFromCell(f, u + 0.5, v + 0.5, _tk);
  let lat = Math.abs(d[1]);
  if (CLIMATE) lat = Math.max(0, Math.min(1, lat + (0.5 - CLIMATE.warmth(d[0], d[1], d[2])) * 0.6));
  // one species a patch: the patch's own hash, nothing off the shared stream
  let hsh = (f * 8191 + (u >> 4) * 92837111 + (v >> 4) * 689287499) | 0;
  hsh = Math.imul(hsh ^ (hsh >>> 15), 2246822507) | 0;
  hsh = Math.imul(hsh ^ (hsh >>> 13), 3266489909) | 0;
  const coin = ((hsh ^ (hsh >>> 16)) >>> 0) % 100;
  if (lat > 0.78) return TREE_KINDS.spruce;
  if (lat > 0.52) return coin < 55 ? TREE_KINDS.birch : TREE_KINDS.oak;
  if (lat > 0.28) return coin < 65 ? TREE_KINDS.oak : TREE_KINDS.dark;
  return coin < 75 ? TREE_KINDS.acacia : TREE_KINDS.oak;
}

// How far a crown reaches from its trunk, in columns. Named because two places
// need to agree on it: plantTree draws the leaves, and the village keep-out
// stands this far further out again so a crown cannot overhang a roof.
const CROWN = 2;
// How deep the ground has to be cut before the surface is bare rock rather
// than whatever grows at that altitude. Two blocks: enough that the lip of a
// canyon keeps its grass and the walls below it do not.
const CANYON_ROCK = 2;
// The second ridge that turns a range's crest into separate summits, as a
// multiple of the first one's frequency. Deliberately not a round number: at
// a whole multiple the two crests line up over and over and the peaks come
// out evenly spaced, which reads as a fence.
const PEAK_BEAT = 1.73;

// --- caves, rivers, plants: the tuning constants ---------------------------
//
// Caves are a pure function of position (see caveSlot below), rivers are
// traced once at load and carved lazily per region, plants are scattered with
// the trees. INTEGRATION-terrain.md explains why each is where it is.

// Solid cells always left between a cave and the surface.
//
// Ten everywhere put the whole underground out of reach: the only way to find
// a cave was to dig at random and get lucky, which is not an underground, it
// is a rumour. Five on dry land — one swing of a pickaxe through the soil and
// you are in the roof of something.
//
// It cannot go lower than five without a second, larger change. surfaceRadius
// and hardTop answer from the height field and know nothing about caves, on
// the documented promise that a cave never reaches the top; break that and
// the player walks on air over every hole. Five is also the smallest value
// that clears the deepest soil profile any preset has (four), which is what
// keeps genKind and terrain agreeing about which cells a cave may take.
//
// Under water it stays at ten, and that is not fussiness: nothing here models
// flowing water, so a cave that breached a sea floor would be a dry hole with
// an ocean hanging over it.
const CAVE_CRUST = 5;
const CAVE_CRUST_WET = 10;
const CAVE_BAND = 26;    // caves live in this band, so one mask is 32 bits
const CAVE_MINH = 2;     // never carve the bedrock floor out from under you

// The planet's own core, a few layers above the unbreakable floor at h=0.
// Absolute height, not depth-from-surface, so it is the same few layers
// everywhere regardless of world size or preset — the same shape as bedrock
// itself, and for the same reason: nothing is modelled below h=0, so mining
// has to stop before it gets there. Lava makes that stop a place instead of
// an arbitrary wall, and gives someone tunnelling to the middle of the
// planet a reason it isn't a shortcut to the far side. A diamond seam right
// above it gives the trip down there something worth finding.
// exported so main.js can refuse to mine the lava band with the same "this
// is the floor" logic bedrock already gets, rather than duplicating the
// height constant on both sides of the module boundary
export const CORE_LAVA_TOP = 3;      // h = 1..3: unbreakable lava, h=0 bedrock
export const CORE_DIAMOND_TOP = 8;   // h = 4..8: diamond-rich, ordinarily minable
const CAVE_SCALE = 1 / 11;   // noise units per block: ~11-block cave features
const CAVE_T = 0.135;    // tube radius in noise units; ~3 blocks across
const CAVE_GATE = 0.55;  // below this the province has no caves at all
const CAVE_SOFT = 0.08;  // gate ramp, so a cave province fades out smoothly
const CAVE_PROV = 5;     // gate lattice cells per planet radius: ~10 provinces
// ...and the second generation's (see caveMask2): more of the planet with an
// underground, tunnels on a lattice a little coarser so they run further,
// and the caverns on one coarser still
const CAVE2_GATE = 0.44;
const CAVE2_SCALE = 1 / 13;
const CAVE2_T = 0.075;
const CAVE2_ROOM = 1 / 17;
// ...and the third's (see caveMask3): a band two words deep, provinces a
// little wider again, and caverns out of a 3D field rather than a level
const CAVE_BAND3 = 64;
const CAVE3_GATE = 0.40;
const CAVE3_ROOM = 1 / 19;
const CAVE3_CHEESE = 0.78;
const CAVE_SLOTS = 8192; // direct-mapped column cache: 8192 * 14 B = 112 KB

const RIVER_PROBES = 110;   // water probes per river wanted; see traceRivers
const RIVER_PER = 13;       // rivers per 256 columns of face edge
const RIVER_CUT = 6;        // floor for the gorge budget, in blocks
const RIVER_GORGE = 0.22;   // ...which otherwise scales with AMP: the fine
                            // octaves of the terrain are 24 blocks tall at
                            // R=800, and a river has to saw through them
const RIVER_RISE = 1;       // blocks the water surface may climb per step
const RIVER_FILL = 4;       // tallest bank the channel may build up
const RIVER_MAX = 320;      // steps before a river is called long enough
const RIVER_EST = 48;       // columns to walk out of the water to a shore
const RIVER_MIN = 12;       // steps below which it was only ever a puddle
const RIVER_STEP = 2;       // columns per step; the gap is filled in after,
                            // so this halves the height samples, not the river
const RIVER_DEPTH = 2;      // water cells above the bed; also the marker's key

const PLANT_PATCH = 3;      // flowers clump per 2^PLANT_PATCH columns
const PLANT_PATCHES = 56;   // of 256: how many patches carry anything
const PLANT_MUSH = 16;      // of those, how many are mushrooms not flowers
const PLANT_FILL = 54;      // of 256: density inside a patch

// --- bamboo -------------------------------------------------------------------
//
// A cane wants warm, wet and low, and all three of those are already answers
// this file can give without storing anything: latitude off the column's own
// direction, height above the sea off the height field, and a low-frequency
// field for where the groves are. So bamboo is the forest pass's rule with a
// different gate — nothing new is remembered, and two machines given the same
// (radius, seed, preset) grow the same grove.
//
// It is a GROVE and not a scatter for the same reason a wood is: one cane on
// its own reads as a mistake, and forty in a clump read as somewhere you have
// arrived at. FREQ is lattice cells per planet radius, so the groves come out
// a few tens of columns across on a small world.
const BAMBOO_FREQ = 9;
const BAMBOO_GATE = 0.66;   // how much of the tropics is grove at all
const BAMBOO_FILL = 78;     // of 256: how many columns inside one carry a cane
const BAMBOO_LAT = 0.5;     // |y| of the direction: the tropics, near enough
const BAMBOO_RISE = 9;      // cells above the sea it will still stand at
const BAMBOO_MIN = 3, BAMBOO_MAX = 7;   // canes in a stalk

// --- the wild gourds ----------------------------------------------------------
//
// A pumpkin and a melon you did not plant. Rare on purpose: the point of them
// is that you come across one in the open and it is worth the walk, which a
// field of them would not be. They go in RIPE, because nobody sowed them and
// there is nothing tracking them to bring them on — a wild gourd is the crop
// the world grew on its own while you were somewhere else.
const GOURD_PATCH = 5;      // one roll per 2^GOURD_PATCH columns square
const GOURD_ODDS = 26;      // of 256: patches that carry a gourd at all
const GOURD_FILL = 5;       // of 256: columns inside one that carry it

export const columnIndex = (f, u, v) => ((f * S + u) * S + v);

// scratch, one set per call site so no two can alias
const _sd = [0, 0, 0], _sc = [0, 0, 0];   // seam reprojection
const _cd = [0, 0, 0];                    // column record
const _wc = [0, 0, 0];                    // world point
const _fd = [0, 0, 0], _fc = [0, 0, 0];   // feature region
const _cv = [0, 0, 0];                    // cave column direction
const _cn = [0, 0, 0];                    // a neighbour's direction, for slope
const _pair = [0, 0];                     // caveMask3's two words
const _nd = [0, 0, 0], _nc = [0, 0, 0];   // nbCol reprojection
const _nb = [0, 0, 0], _nb2 = [0, 0, 0];  // nbCol results (carve, trace)

// neighbourColumn without the allocation — the river carver calls this a few
// million times over the life of a big world
function nbCol(f, u, v, du, dv, out) {
  const nu = u + du, nv = v + dv;
  if (nu >= 0 && nv >= 0 && nu < S && nv < S) {
    out[0] = f; out[1] = nu; out[2] = nv;
    return out;
  }
  if (FLAT) {   // the plane's rim, same clamp neighborColumn uses
    out[0] = f; out[1] = cellIdx(nu); out[2] = cellIdx(nv);
    return out;
  }
  const d = dirFromCell(f, nu + 0.5, nv + 0.5, _nd);
  const c = cellFromDir(d[0], d[1], d[2], _nc);
  out[0] = c[0]; out[1] = cellIdx(c[1]); out[2] = cellIdx(c[2]);
  return out;
}

// the eight lateral neighbours as (du, dv) pairs, in angular order, so
// (d +/- 1) & 7 is "the same heading, turned 45 degrees"
const DIR8 = [1, 0, 1, 1, 0, 1, -1, 1, -1, 0, -1, -1, 0, -1, 1, -1];

function hash4(a, b, c, d) {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = (n + Math.imul(c, 2654435761) + Math.imul(d, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  return (n ^ (n >>> 15)) >>> 0;
}

// Ore is a function, not data. A 2x2x2 lattice cell is picked as a vein with
// probability p, then about 60% of the cells inside it become ore, which gives
// clumps of two to eight blocks — the size the old random-walk veins were.
// Depth still decides what can appear, so digging down is still worth it. The
// table itself comes from the preset (ORE_BASE above), so an iron world is the
// same veins in the same places, far more of them.
function oreAt(seed, ores, subDepth, host, f, u, v, h, top) {
  const depth = top - h;
  // above subDepth the terrain block is the soil layer, not host rock, so
  // there is no ore there
  if (h < 1 || depth < subDepth) return host;
  const key = (seed ^ Math.imul(f, 0x51ed27)) | 0;
  for (let i = 0; i < ores.length; i++) {
    const o = ores[i];
    if (depth < o.minDepth) continue;
    if (hash4(u >> 1, v >> 1, h >> 1, (key ^ o.salt) | 0) >= o.t) continue;
    if ((hash4(u, v, h, (key ^ (o.salt + 7)) | 0) & 255) > 153) continue;
    return o.block;
  }
  return BLOCK.STONE;
}

// Diamond in the core band, clumped the same way an ordinary vein is (a
// coarse lattice cell decides whether one starts here, a finer hash decides
// which cells inside it are actually diamond) — still far more generous than
// the 0.09% an ordinary deep vein gets. This is the reward for reaching the
// bottom, so it is a seam you can work rather than a lucky-strike roll.
//
// It used to be two cells in five, which is not a seam, it is a floor made of
// diamond — you came out of one trip richer than the rest of the planet could
// make you. Now it is a fifth of that, about one cell in thirteen. The cut is
// taken entirely out of the LATTICE gate (620 -> 124 of 1024), not out of the
// fill inside a vein: a clump you find is the same handful it always was,
// there are simply a fifth as many of them. Thinning the fill instead would
// have scattered single cells through the whole band, which reads as speckle
// and means chipping at rock for one gem at a time.
//   0.121 * 0.648 = 0.0785, against the old 0.605 * 0.648 = 0.3926.
const CORE_DIAMOND_SALT = 0x0c0de;
function coreDiamondAt(seed, f, u, v, h) {
  const key = (seed ^ Math.imul(f, 0x51ed27) ^ CORE_DIAMOND_SALT) | 0;
  if ((hash4(u >> 1, v >> 1, h >> 1, key) & 1023) >= 124) return false;
  return (hash4(u, v, h, (key + 7) | 0) & 255) <= 165;
}

// --- world ----------------------------------------------------------------

export class Planet {
  constructor(seed = 1337) {
    this.S = S; this.H = H; this.R0 = R0;
    const n = 6 * S * S;
    this.nCols = n;
    this.colTop = new Int16Array(n);
    this.colMat = new Uint16Array(n);  // 0 = column not computed yet
    this.ovFlag = new Uint8Array(n);   // 1 = this column has an override array
    this.ov = new Map();               // colIdx -> Uint16Array(H), NONE = clear
    this.baked = new Set();            // feature regions already generated
    this.nreg = Math.ceil(S / FEATURE);
    // 1 = this region's river channel has been cut into the height field
    this.carved = new Uint8Array(6 * this.nreg * this.nreg);
    // captured, like the height field: columns materialise long after the
    // constructor, and setWorldSize may have moved on by then
    this.sea = SEA; this.rock = ROCK_LINE;
    // The snow line, in the same absolute radius as sea and rock. Expressed in
    // AMP units by the preset so it moves with the world's own relief: a
    // fixed number of blocks would be halfway up a small planet's mountains
    // and a dusting on a big one's.
    const snowP = (PRESET || PRESETS.terran).snowLevel;
    // (the third generation's lies lower, so a mountain's upper slopes are
    // snowfields and not only its last few blocks)
    this.snowLine = snowP == null ? null
      : R + AMP * (snowP - (TERRAIN_GEN >= 3 && !FLAT ? 0.9 : 0));
    this.gen3 = TERRAIN_GEN >= 3 && !FLAT;
    // ...and the fourth's villages, which are the third's round a hall on
    // the green (see village.js)
    this.gen4 = TERRAIN_GEN >= 4 && !FLAT;
    // ...and the fifth's country: kinds of ground, a climate, and woods
    // with something in them (see TERRAIN_GEN)
    this.gen5 = TERRAIN_GEN >= 5 && !FLAT;
    // and the band it frays over, so the line is weather rather than a
    // contour drawn round the peak — the polar caps do the same
    this.snowBand = Math.max(2, AMP * 0.55);
    this.seaTop = Math.min(H - 1, Math.floor(SEA - R0));
    this.villageSites = [];

    // the preset, unpacked into the fields the hot paths read
    const P = PRESET || PRESETS.terran;
    this.preset = P;
    this.presetId = P.id;
    this.mats = P.mats;
    this.soil = P.soil || null;
    this.shore = P.shore === undefined ? 0.7 : P.shore;
    this.subDepth = P.mats.subDepth;
    this.host = P.mats.deep;
    // Only pay for the column hash on a world that can use it: a preset whose
    // every band is one material and which has no patches always answers the
    // same block, and terran is that preset.
    this.mottled = !!this.soil || [P.mats.beach, P.mats.low, P.mats.high]
      .some((l) => l.length > 1);
    // What lies under the surface follows the *surface tile*, not the preset:
    // a temperate pocket on a rust world wants dirt under its grass while the
    // ridge beside it is stone all the way down, and the surface material is
    // the only thing a column stores. Grass, dirt and sand are the living
    // tiles and no specialised band puts one down, so carrying one is exactly
    // the same statement as "this column was a patch".
    this.subFor = new Uint16Array(BLOCK_IDS).fill(P.mats.sub);
    this.subDepthFor = new Uint8Array(BLOCK_IDS).fill(P.mats.subDepth);
    if (this.soil) {
      for (const b of SOIL_TOPS) {
        this.subFor[b] = this.soil.sub;
        this.subDepthFor[b] = this.soil.subDepth;
      }
    }
    // Whether this world grows deserts at all — see the DESERT_* constants.
    // Both halves of the answer are part of the world's identity: the preset
    // says whether the kind of world has them, and R says whether this one is
    // big enough, so the same (radius, seed, preset) still names one world.
    this.desert = !!P.deserts && R >= DESERT_MIN;
    // A desert is sand all the way down to the rock, not a dusting over
    // dirt: dig a hole in a dune and you are in sand, which is the whole
    // difference between a desert and a field somebody has painted.
    this.subFor[BLOCK.SAND_ORANGE] = BLOCK.SAND_ORANGE;
    this.subDepthFor[BLOCK.SAND_ORANGE] = DESERT_DEPTH;
    if (TERRAIN_GEN >= 5 && !FLAT && this.desert) {
      this.subFor[BLOCK.SAND] = BLOCK.SAND;
      this.subDepthFor[BLOCK.SAND] = DESERT_DEPTH;
    }
    // The second generation's bare rock is rock the whole way down. A cliff
    // cut from columns of stone with three courses of the preset's soil under
    // each top came out with a band of earth running along its face half way
    // down, which no cliff has.
    if (TERRAIN_GEN >= 2 && !FLAT) {
      for (const b of P.mats.high) {
        this.subFor[b] = P.mats.deep ?? b;
        this.subDepthFor[b] = 0;
      }
    }
    // ...and the third's snow lies ON the rock: a snowfield two cells deep,
    // then stone. With the soil's subsoil under it, every snowy summit stood
    // on a ring of brown earth where the slope fell away, and read as a cake.
    if (TERRAIN_GEN >= 3 && !FLAT) {
      this.subFor[BLOCK.SNOW] = BLOCK.SNOW;
      this.subDepthFor[BLOCK.SNOW] = 1;
    }
    // ...and the fifth's seams in a cliff are the cliff's own rock under
    // their one face, and its gravel bars and clay beds are a spade deep
    if (TERRAIN_GEN >= 5 && !FLAT) {
      for (const b of [BLOCK.COAL, BLOCK.IRON]) {
        this.subFor[b] = P.mats.deep ?? BLOCK.STONE;
        this.subDepthFor[b] = 0;
      }
      this.subFor[BLOCK.GRAVEL] = BLOCK.GRAVEL;
      this.subDepthFor[BLOCK.GRAVEL] = 2;
      this.subFor[BLOCK.CLAY] = BLOCK.CLAY;
      this.subDepthFor[BLOCK.CLAY] = 2;
    }
    this.ores = P.oreList;
    this.fluid = P.fluid;
    // a frozen sea: the topmost fluid cell of every column is ICE, which is
    // HARD, so hardTop() and genKind() both have to know
    this.iceCap = !!P.iceCap && P.seaLevel !== null;
    // where to put the player down, for the presets that care (ocean)
    this.spawnDir = P.island ? islandDirection(seed) : null;
    // { from, soft } in |y|, or null on a world with no caps
    this.poles = P.poles || null;

    // Cave columns: one 32-bit mask each, in a small direct-mapped cache.
    // The mesher reads a five-column stencil at a time and every one of them
    // stays resident, so the noise is evaluated once per column, not per read.
    // Eviction is free: caves are a pure function, so a recomputed column is
    // identical to the one that was thrown away.
    this.caveKey = new Int32Array(CAVE_SLOTS).fill(-1);
    this.caveMask = new Uint32Array(CAVE_SLOTS);
    // the third generation's underground is two words deep (see caveMask3)
    this.caveMaskHi = new Uint32Array(CAVE_SLOTS);
    this.caveLo = new Int16Array(CAVE_SLOTS);

    // River paths: column id, water-surface height and half-width per node,
    // plus a region index the lazy carver walks. Coordinates only — the
    // channel itself is not cut until you go there.
    this.rvCol = new Int32Array(0);
    this.rvH = new Int16Array(0);
    this.rvW = new Uint8Array(0);
    this.rvIndex = new Map();   // region key -> Int32Array of node indices
    this.rivers = 0;            // node count; 0 disables the carve check
    this.rvBytes = 0;

    // Legacy view: callers used to read planet.data[cellIndex(f,u,v,h)].
    // There is no flat array behind it any more, so decode the index instead.
    this.data = new Proxy(Object.create(null), {
      get: (_t, k) => (typeof k === 'string' ? this.atIndex(+k) : undefined),
      set: (_t, k, val) => {
        if (typeof k === 'string') this.setAtIndex(+k, val);
        return true;
      },
    });

    this.generate(seed);
  }

  // Terrain is a pure function of direction, so there is nothing to fill in:
  // this only fixes the seed. Columns materialise in column().
  generate(seed) {
    this.seed = seed;
    this.height = makeHeightField(seed, this.preset);
    this.matSeed = (seed ^ 0x3a7e1a) | 0;
    this.oreSeed = (seed ^ 0x5eed07e) | 0;
    this.treeSeed = (seed ^ 0x9e3779b9) | 0;
    this.plantSeed = (seed ^ 0x51f0e21) | 0;
    // Where the woods are. Trees were scattered at one uniform density over
    // the whole planet, which gives parkland everywhere and forest nowhere:
    // the eye reads a wood by its EDGE, and a uniform scatter has none. This
    // is a low-frequency field, so candidates are accepted in patches and
    // refused between them — the same number of trees, gathered.
    this.forest = new Noise3D((seed ^ 0x1e5a7) | 0);
    // Where the canes are. Its own field rather than the forest's, or every
    // grove would sit inside a wood and the two would never be told apart.
    this.grove = new Noise3D((seed ^ 0xba3b00) | 0);
    // Where the dune fields are. Its own salt, so turning deserts on moves
    // no wood, no cave and no river of any world that already existed.
    this.desertField = new Noise3D((seed ^ 0xde5e27) | 0);
    // The fifth generation's CLIMATE: warmth and wet, each its own slow
    // field with its own salt, so no wood, cave or river of an older world
    // moves for their sake.
    this.warmField = this.gen5 ? new Noise3D((seed ^ 0x7e3a91) | 0) : null;
    this.wetField = this.gen5 ? new Noise3D((seed ^ 0x2c9d47) | 0) : null;
    this.wildSeed = (seed ^ 0x61d5ee) | 0;
    CLIMATE = this.gen5 ? this : null;
    this.caveA = new Noise3D((seed ^ 0x0ca7e5) | 0);
    this.caveB = new Noise3D((seed ^ 0x71b3d9) | 0);
    this.caveGate = new Noise3D((seed ^ 0x3ea17f) | 0);
    // the second generation's caves: tunnels out of gradient noise, a field
    // that swells and narrows them, and the caverns (see caveSlot)
    this.caveGen = FLAT ? 1 : TERRAIN_GEN;
    if (this.caveGen >= 2) {
      this.cave2A = new GradNoise3D((seed ^ 0x6a11e5) | 0);
      this.cave2B = new GradNoise3D((seed ^ 0x13c0de) | 0);
      this.cave2W = new GradNoise3D((seed ^ 0x2b1d7f) | 0);
      this.cave2C = new GradNoise3D((seed ^ 0x5ca7e2) | 0);
    }
    this.colMat.fill(0);
    this.ovFlag.fill(0);
    this.ov.clear();
    this.baked.clear();
    this.carved.fill(0);
    this.caveKey.fill(-1);
    // the tracer wants heights, not ground: every column it materialises is
    // thrown away below, so the slope that picks a column's ground is not
    // paid for while it walks
    this.tracing = true;
    this.traceRivers();
    this.tracing = false;
    // the trace materialised the columns it walked; drop them, or those
    // columns would sit in regions that never get their channel cut
    this.colMat.fill(0);
  }

  atIndex(i) {
    if (!Number.isInteger(i)) return undefined;
    const h = i % H;
    let r = (i - h) / H;
    const v = r % S; r = (r - v) / S;
    const u = r % S;
    return this.get((r - u) / S, u, v, h);
  }

  setAtIndex(i, b) {
    if (!Number.isInteger(i)) return;
    const h = i % H;
    let r = (i - h) / H;
    const v = r % S; r = (r - v) / S;
    const u = r % S;
    this.set((r - u) / S, u, v, h, b);
  }

  // The bare height-field record: one fbm evaluation, no river. The tracer
  // and the carver use this; everything else goes through column().
  rawColumn(ci, f, u, v) {
    let mat = this.colMat[ci];
    if (mat !== 0) return mat;
    // A plane is ONE face. The height field is a constant there, so without
    // this the other five faces of the lattice would grow the same ground
    // and the drafting table would come out a hollow cube. STONE is only the
    // cache marker — with top at -1 no cell of the column ever renders.
    if (FLAT && f !== 2) {
      this.colTop[ci] = -1;
      this.colMat[ci] = BLOCK.STONE;
      return BLOCK.STONE;
    }
    dirFromCell(f, u + 0.5, v + 0.5, _cd);
    const surf = this.height(_cd[0], _cd[1], _cd[2]);
    let top = Math.floor(surf - R0);
    if (top > H - 1) top = H - 1;
    else if (top < -1) top = -1;
    // patch weight for this very column, left by the height field above
    const t = this.soil === null ? 0 : lastPatch;
    // one hash serves both decisions, which is one hash per column either
    // way: the high byte dithers the rim of a patch so its edge is a band of
    // mixed ground rather than a drawn line, and the rest picks from the band
    const hsh = this.mottled || this.poles || this.desert
      ? hash4(u, v, f, this.matSeed) : 0;
    const m = t > 0 && (hsh >>> 24) < t * 256 ? this.soil : this.mats;
    const wet = surf < this.sea;
    // A canyon is cut THROUGH the ground, so what it exposes is what the
    // ground is made of. Without this the floor of a gorge comes up grass,
    // because the material bands are read off the radius and a deep floor
    // reads as ordinary low ground — a lawn at the bottom of a rock cleft.
    const cutHere = lastCut;
    // ...and a cliff face, an outcrop or a ravine wall (the second
    // generation's): ground too steep or too broken to hold any soil
    const rockHere = lastRock;
    const mountHere = lastMount;
    // THE GROUND BY SLOPE (the third generation). The first two chose it by
    // HEIGHT — above the rock line everything was stone — so a mountain was
    // grey from its foot to its snow. Ground holds soil where it is gentle
    // and sheds it where it is steep, whatever the altitude: meadows high up,
    // bare rock on every face and every lip. `steep` is how far this column
    // stands above the lowest of its four neighbours: two blocks is a step
    // you cannot walk up, and that is where the grass gives out. Read only
    // in mountain country — four more samples a column, and a quarter of a
    // million columns are read to build a world. Everywhere else the cliffs
    // come marked as rock by what made them (escarpments, outcrops, ravines,
    // the sea cliffs' lips, the entrance cuts), and the rest is grass.
    let steep = 0;
    if (this.gen3 && !this.tracing && mountHere > 0.02 && !wet && surf > this.sea + 1
        && cutHere <= CANYON_ROCK) {
      const hN = (du, dv) => {
        dirFromCell(f, u + 0.5 + du, v + 0.5 + dv, _cn);
        return this.height(_cn[0], _cn[1], _cn[2]);
      };
      steep = Math.max(surf - hN(1, 0), surf - hN(-1, 0), surf - hN(0, 1), surf - hN(0, -1));
    }
    const list = cutHere > CANYON_ROCK || rockHere ? m.high
      : surf < this.sea + this.shore ? m.beach
        : this.gen3 ? (steep >= 2.5 || (steep >= 1.6 && surf > this.rock) ? m.high : m.low)
          : surf > this.rock ? m.high : m.low;
    // one entry is the common case and costs nothing; a longer list mottles
    // the world from a hash, which is far cheaper than a second noise field
    mat = list.length === 1 ? list[0] : list[hsh % list.length];
    if (this.gen5 && !this.tracing) {
      const h5 = hash4(u, v, f, this.wildSeed);
      if (mat === BLOCK.SAND && !wet) {
        // A SHORE IS NOT ONE THING. Sand, and in patches a bar of gravel or
        // a bed of clay — a potter's whole trade, lying on the beach.
        const pn = this.forest.noise(_cd[0] * 31 + 77, _cd[1] * 31 + 77, _cd[2] * 31 + 77);
        if (pn > 0.66) mat = BLOCK.GRAVEL;
        else if (pn < 0.3 && (h5 & 3) !== 0) mat = BLOCK.CLAY;
      } else if (mat === BLOCK.STONE && (rockHere || steep >= 2.5) && !wet) {
        // ...AND A CLIFF SHOWS WHAT IS IN IT. A seam of coal or a streak of
        // iron in a face you can walk up to: the first ore anybody finds is
        // the one they can see, and a wall of plain grey had nothing to say.
        const k = h5 % 61;
        if (k < 4) mat = BLOCK.COAL;
        else if (k === 4) mat = BLOCK.IRON;
      }
    }

    // Snow on the tops. Altitude, where the caps below are latitude, and the
    // same dithered edge for the same reason: a snow line at an exact height
    // is a contour drawn round the mountain, and one that frays into the rock
    // under it is weather. Not in a canyon — a gorge floor is not a summit
    // however deep the world has cut it.
    if (this.snowLine && surf > this.snowLine && cutHere <= CANYON_ROCK && steep < 3.5) {
      const k = (surf - this.snowLine) / this.snowBand;
      if (k >= 1 || ((hsh >>> 8) & 255) < k * 255) mat = BLOCK.SNOW;
    }

    // The desert.
    //
    // It takes the LIVING ground and nothing else: grass, and the beach sand
    // beside it where a dune field runs down to the water. Rock, snow, a
    // canyon floor and a sea bed all keep what they had, which is what stops
    // a dune field from being a coat of paint over the terrain rather than a
    // place in it. Dithered on the same hash and for the same reason as the
    // snow line above — a desert whose edge is a drawn circle reads as a
    // texture seam, and one that frays into the grass reads as a margin.
    if (this.desert && !wet && cutHere <= CANYON_ROCK
        && (mat === BLOCK.GRASS || mat === BLOCK.SAND)) {
      const k = this.desertness(_cd[0], _cd[1], _cd[2]);
      if (k >= 1 || ((hsh >>> 12) & 255) < k * 255) {
        // (the fifth generation's deserts are PALE sand with the red in
        // streaks through it: a dune field the colour of turned earth read,
        // from the next hill, as a ploughed field a mile across)
        mat = this.gen5 && this.forest.noise(_cd[0] * 13 + 41, _cd[1] * 13 + 41,
          _cd[2] * 13 + 41) < 0.6 ? BLOCK.SAND : BLOCK.SAND_ORANGE;
      }
    }

    // The polar caps.
    //
    // There is no axis on a cube-sphere and no seasons in the sky, so this is
    // simply latitude: |y| of the column's own direction, which the height
    // field has already worked out. The edge is DITHERED over a band rather
    // than cut at a threshold — a snow line that is a circle drawn round the
    // pole reads as a texture seam, and one that frays into the ground below
    // it reads as weather.
    //
    // Wet columns take ICE as their bed material. Nothing ever sees a sea
    // bed, so the byte is free to carry "this column's sea is frozen", which
    // is what frozen() reads and what puts a lid on the polar ocean.
    if (this.poles) {
      const lat = _cd[1] < 0 ? -_cd[1] : _cd[1];
      if (lat > this.poles.from) {
        const k = (lat - this.poles.from) / this.poles.soft;
        if (k >= 1 || ((hsh >>> 16) & 255) < k * 255) {
          mat = wet ? BLOCK.ICE : BLOCK.SNOW;
        }
      }
    }
    this.colTop[ci] = top;
    this.colMat[ci] = mat;
    return mat;
  }

  // THE CLIMATE (the fifth generation). Two numbers a direction, nought to
  // one: how warm, and how wet. Slow fields — a country is hundreds of
  // blocks across — and pure functions of the direction, so every machine
  // reads the same weather off the same world.
  warmth(x, y, z) {
    return this.warmField.fbm(x * 2.1 + 5, y * 2.1 + 5, z * 2.1 + 5, 2);
  }

  wetness(x, y, z) {
    return this.wetField.fbm(x * 2.6 + 9, y * 2.6 + 9, z * 2.6 + 9, 2);
  }

  // What kind of country that makes: 0 open (meadow and parkland — a tree
  // here and there, copses, the flowers thick), 1 woodland, 2 the old deep
  // wood, where the trees stand shoulder to shoulder and the great ones grow.
  wood(x, y, z) {
    const w = this.wetness(x, y, z);
    return w < 0.46 ? 0 : w < 0.56 ? 1 : 2;
  }

  // How strongly this direction wants to be desert: 0 nowhere near one, 1
  // well inside a dune field, and the band between them is the rim rawColumn
  // dithers. One noise read, and only for the columns that got as far as
  // asking — grass and beach on a world big enough to have deserts at all.
  desertness(x, y, z) {
    const lat = y < 0 ? -y : y;
    if (lat >= DESERT_LAT) return 0;
    const n = this.desertField.noise(x * DESERT_FREQ + 11,
      y * DESERT_FREQ + 11, z * DESERT_FREQ + 11);
    let k = (n - DESERT_GATE) / DESERT_SOFT;
    if (k <= 0) return 0;
    if (k > 1) k = 1;
    // ...and let it cool off toward the poles rather than stopping dead at
    // DESERT_LAT, or every desert on the planet would share one straight edge
    // running round it at the same latitude.
    const cool = (DESERT_LAT - lat) / DESERT_LAT_SOFT;
    return cool < 1 ? k * cool : k;
  }

  // Compute and cache a column's terrain record. One fbm evaluation, so
  // callers may hit this as freely as they used to hit the array.
  column(ci, f, u, v) {
    const mat = this.colMat[ci];
    if (mat !== 0) return mat;
    // A river region must be cut before any of its columns can be observed,
    // or the mesher would see the natural ground and the channel would open
    // later, under geometry that already exists. carveRegion is idempotent
    // and only reachable on a cold column, so this costs nothing warm.
    if (this.rivers) {
      this.carveRegion(f, (u / FEATURE) | 0, (v / FEATURE) | 0);
      const m = this.colMat[ci];
      if (m !== 0) return m;
    }
    return this.rawColumn(ci, f, u, v);
  }

  // Top of the standing water in a column. The sea everywhere, except in a
  // carved channel, where the bed is always RIVER_DEPTH below its own water
  // surface — so the gravel marker stores a whole river's levels for free.
  waterTopAt(ci) {
    // `this.rivers` gates the marker: a preset with no rivers is free to use
    // GRAVEL as a surface material (the ash flats do), and without this guard
    // every such column would report two cells of standing water over it
    if (!this.rivers || this.colMat[ci] !== BLOCK.GRAVEL) return this.seaTop;
    const w = this.colTop[ci] + RIVER_DEPTH;
    return w > this.seaTop ? w : this.seaTop;
  }

  // --- caves ---------------------------------------------------------------
  //
  // Caves are a pure function of position, the way ore is: nothing is stored,
  // so the 1.2 billion cells of a radius-800 planet cost nothing for the
  // caves you never walk into. Two noise fields are read as a pair and cells
  // within CAVE_T of the point where both cross their midline are carved —
  // the locus of A = B = 0.5 is a *curve*, not a surface, which is why this
  // gives connected tubes rather than blobs. A third, far lower-frequency
  // field gates whole provinces, so most of the planet is solid rock.
  //
  // The fields are sampled in *world* space, not (u, v, h), so a tunnel runs
  // straight across a cube-face seam instead of kinking at it.
  //
  // Two invariants make the rest of the file safe:
  //   * a cave never rises above colTop - CAVE_CRUST, so there are always
  //     ten solid cells over it and it can breach neither the ground nor the
  //     sea floor (colTop is the sea *bed* under water);
  //   * a cave never touches an override, because get() reads the override
  //     first — so no cave can delete a cell the player, a tree or a village
  //     put there.
  //
  // Evaluating the field per read would be far too slow: the mesher does
  // about seven get() calls per cell. So a whole column is evaluated at once
  // and kept as a single 32-bit mask in a direct-mapped cache. The band is
  // CAVE_BAND deep, so 26 bits is the whole column.

  // cache slot holding this column's cave mask, filling it if need be
  caveSlot(ci, f, u, v) {
    const s = ci & (CAVE_SLOTS - 1);
    if (this.caveKey[s] === ci) return s;
    if (this.colMat[ci] === 0) this.column(ci, f, u, v);

    const top = this.colTop[ci];
    const hi = top - (top > this.seaTop ? CAVE_CRUST : CAVE_CRUST_WET);
    let lo = Math.max(CAVE_MINH, hi - CAVE_BAND + 1);
    let mask = 0;
    this.caveMaskHi[s] = 0;
    if (!FLAT && this.caveGen >= 3) {
      lo = Math.max(CAVE_MINH, hi - CAVE_BAND3 + 1);
      if (hi >= lo) {
        const pair = this.caveMask3(f, u, v, lo, hi, top);
        mask = pair[0];
        this.caveMaskHi[s] = pair[1];
      }
    } else if (hi >= lo && !FLAT && this.caveGen >= 2) {
      mask = this.caveMask2(f, u, v, lo, hi);
    } else
    // No caves under the drafting table: a tunnel is exactly the hillside
    // the flat preset exists to not have, found from underneath.
    if (hi >= lo && !FLAT) {
      dirFromCell(f, u + 0.5, v + 0.5, _cv);
      const dx = _cv[0], dy = _cv[1], dz = _cv[2];
      const g = this.caveGate.noise(dx * CAVE_PROV + 40,
        dy * CAVE_PROV + 40, dz * CAVE_PROV + 40);
      if (g > CAVE_GATE) {
        // the province fades in, so its rim is a few narrow tubes rather
        // than a wall with full-size tunnels butted against it
        const t = CAVE_T * Math.min(1, (g - CAVE_GATE) / CAVE_SOFT);
        const t2 = t * t;
        for (let h = lo; h <= hi; h++) {
          const r = (R0 + h + 0.5) * CAVE_SCALE;
          const x = dx * r, y = dy * r, z = dz * r;
          // the first field rejects ~85% of cells, so the second and its
          // eight lattice lookups are rarely paid for
          const a = this.caveA.noise(x, y, z) - 0.5;
          if (a * a >= t2) continue;
          const b = this.caveB.noise(x + 31.7, y + 11.3, z + 57.1) - 0.5;
          if (a * a + b * b >= t2) continue;
          mask |= 1 << (h - lo);
        }
      }
    }
    this.caveKey[s] = ci;
    this.caveMask[s] = mask;
    this.caveLo[s] = lo;
    return s;
  }

  // The second generation's underground, one column of it as a bit mask
  // (the same contract as the first's: nothing above `hi`, which keeps the
  // crust over every cave, and nothing below `lo`).
  //
  // TUNNELS the way the first generation made them — where two fields both
  // cross their midline, which is a curve and not a sheet — but out of
  // gradient noise, so they wind instead of kinking, and with a third field
  // swelling and pinching them: a crawl, then a gallery you can stand up in.
  // Wider provinces, so an underground is something a hillside usually has.
  // Where the crust above a tunnel is a CLIFF, the tunnel comes out of the
  // cliff face — the crust is measured from this column's own top, and the
  // ground in front of a cliff is lower than that. That is the cave mouth.
  //
  // CAVERNS: a slow field taken above a threshold that tightens away from a
  // level of its own for the column, so a chamber is wider than it is tall,
  // with a floor and a roof that wander: the rooms the tunnels open into.
  caveMask2(f, u, v, lo, hi) {
    dirFromCell(f, u + 0.5, v + 0.5, _cv);
    const dx = _cv[0], dy = _cv[1], dz = _cv[2];
    const g = this.caveGate.noise(dx * CAVE_PROV + 40, dy * CAVE_PROV + 40, dz * CAVE_PROV + 40);
    if (g <= CAVE2_GATE) return 0;
    const prov = Math.min(1, (g - CAVE2_GATE) / CAVE_SOFT);
    let mask = 0;
    const tMax = CAVE2_T * 1.6 * prov, tMax2 = tMax * tMax;
    // the cavern level for this column, and how tall its rooms run
    const band = hi - lo;
    const cav = this.cave2C;
    const lv = cav.noise(dx * 9 + 3, dy * 9 + 3, dz * 9 + 3);
    const hc = lo + band * (0.25 + 0.5 * lv);
    const halfH = 2.2 + 4 * cav.noise(dx * 13 + 29, dy * 13 + 29, dz * 13 + 29);
    for (let h = lo; h <= hi; h++) {
      const r = (R0 + h + 0.5) * CAVE2_SCALE;
      const x = dx * r, y = dy * r, z = dz * r;
      const a = this.cave2A.noise(x, y, z) - 0.5;
      if (a * a < tMax2) {
        const b = this.cave2B.noise(x + 31.7, y + 11.3, z + 57.1) - 0.5;
        const d2 = a * a + b * b;
        if (d2 < tMax2) {
          // the swell: 0.45 to 1.6 of the tube's radius, slowly along it
          const sw = 0.45 + 1.15 * this.cave2W.noise(x * 0.4 + 7, y * 0.4 + 7, z * 0.4 + 7);
          const t = CAVE2_T * prov * sw;
          if (d2 < t * t) { mask |= 1 << (h - lo); continue; }
        }
      }
      const dv = (h - hc) / halfH;
      if (dv > -2 && dv < 2) {
        const rc = (R0 + h + 0.5) * CAVE2_ROOM;
        const c = cav.noise(dx * rc + 61, dy * rc + 61, dz * rc + 61);
        if (c > 0.66 + 0.1 * dv * dv - 0.06 * prov) mask |= 1 << (h - lo);
      }
    }
    return mask;
  }

  // The third generation's underground, as the two words of a 64-cell band
  // (same contract: nothing above `hi`, the crust, nothing below `lo`).
  //
  // TUNNELS as the second generation's, in provinces a little wider.
  // CAVERNS out of a slow 3D field taken above a threshold that eases with
  // depth: great irregular rooms, taller than the second's level chambers,
  // with the field's own low places left standing in them as pillars — and
  // never within a dozen blocks of the ground, so a cavern's roof is rock.
  // And the ENTRANCE TUNNELS: from the end of each entrance's cut (see
  // entranceSites) a bore carries on into the hill and down, so the cut in
  // the hillside is the way into the ground and not a dead end.
  caveMask3(f, u, v, lo, hi, top) {
    dirFromCell(f, u + 0.5, v + 0.5, _cv);
    const dx = _cv[0], dy = _cv[1], dz = _cv[2];
    let m1 = 0, m2 = 0;
    const g = this.caveGate.noise(dx * CAVE_PROV + 40, dy * CAVE_PROV + 40, dz * CAVE_PROV + 40);
    const prov = g <= CAVE3_GATE ? 0 : Math.min(1, (g - CAVE3_GATE) / CAVE_SOFT);
    if (prov > 0) {
      const tMax = CAVE2_T * 1.6 * prov, tMax2 = tMax * tMax;
      const cav = this.cave2C;
      for (let h = lo; h <= hi; h++) {
        const rr = R0 + h + 0.5;
        const r = rr * CAVE2_SCALE;
        const x = dx * r, y = dy * r, z = dz * r;
        let carve = false;
        const a = this.cave2A.noise(x, y, z) - 0.5;
        if (a * a < tMax2) {
          const b = this.cave2B.noise(x + 31.7, y + 11.3, z + 57.1) - 0.5;
          const d2 = a * a + b * b;
          if (d2 < tMax2) {
            const sw = 0.45 + 1.15 * this.cave2W.noise(x * 0.4 + 7, y * 0.4 + 7, z * 0.4 + 7);
            const t = CAVE2_T * prov * sw;
            carve = d2 < t * t;
          }
        }
        const depth = top - h;
        if (!carve && depth > 12) {
          const rc = rr * CAVE3_ROOM;
          const c = cav.noise(dx * rc + 61, dy * rc + 61, dz * rc + 61);
          carve = c > CAVE3_CHEESE - 0.05 * prov - 0.04 * Math.min(1, (depth - 12) / 30);
        }
        if (carve) {
          const d = h - lo;
          if (d < 32) m1 |= 1 << d; else m2 |= 1 << (d - 32);
        }
      }
    }
    const ent = this.height.entrances;
    if (ent) {
      ent.near(dx, dy, dz, (st, along, across) => {
        if (along < st.L - 1.5 || along > st.L + st.tube) return;
        const rad = st.rad;
        if (across > rad || across < -rad) return;
        const ex = along - st.L;
        // the bore's centre: level with the cut's floor where it leaves it,
        // then down into the hill a little over a block for every two
        const cy = st.hc - 1 - 0.35 * st.L - (ex > 0 ? 0.55 * ex : 0) + rad * 0.6;
        const half = Math.sqrt(Math.max(0, rad * rad - across * across));
        const h0 = Math.max(lo, Math.ceil(cy - half - R0 - 0.5));
        const h1 = Math.min(hi, Math.floor(cy + half - R0 - 0.5));
        for (let h = h0; h <= h1; h++) {
          const d = h - lo;
          if (d < 32) m1 |= 1 << d; else m2 |= 1 << (d - 32);
        }
      });
    }
    _pair[0] = m1 >>> 0;
    _pair[1] = m2 >>> 0;
    return _pair;
  }

  caveAt(ci, f, u, v, h) {
    const s = this.caveSlot(ci, f, u, v);
    const d = h - this.caveLo[s];
    if (d < 0) return false;
    if (d < 32) return ((this.caveMask[s] >>> d) & 1) === 1;
    return d < 64 && ((this.caveMaskHi[s] >>> (d - 32)) & 1) === 1;
  }

  // Lowest carved cell in a column, or -1. This is what stops columnSolidTop
  // from claiming the rock is unbroken all the way to the surface when a
  // tunnel runs through it.
  caveFloor(ci, f, u, v) {
    const s = this.caveSlot(ci, f, u, v);
    const m = this.caveMask[s];
    if (m !== 0) return this.caveLo[s] + 31 - Math.clz32(m & -m);
    const m2 = this.caveMaskHi[s];
    if (m2 !== 0) return this.caveLo[s] + 32 + 31 - Math.clz32(m2 & -m2);
    return -1;
  }

  // Generated cell as a coarse kind — STONE, WATER or AIR — skipping ore
  // hash. columnTop, columnSolidTop and surfaceRadius all walk columns
  // through this one predicate instead of each re-deriving the profile, which
  // is what keeps them in step with get() now that caves and rivers change it.
  // The caller must have materialised the column first.
  genKind(ci, f, u, v, h) {
    const top = this.colTop[ci];
    // The table is solid to its floor and dry above it — no sea, no core
    // band, no caves. Said once here so every column walker in this file
    // agrees with terrain() below without re-deriving the profile.
    if (FLAT) return h > top || h < 0 ? BLOCK.AIR : BLOCK.STONE;
    if (h > top) {
      const w = this.waterTopAt(ci);
      if (h > w) return BLOCK.AIR;
      // The ice cap is the one fluid cell that holds you up, so it has to
      // report as rock here: STONE and WATER are stand-ins for "HARD" and
      // "fills the cell but does not support you", and every column walker in
      // this file relies on them agreeing with get().
      return this.frozen(ci) && h === w ? BLOCK.STONE : BLOCK.WATER;
    }
    // The core lava band: fluid, so the same WATER stand-in the fluid branch
    // above uses — genKind never distinguishes water from lava, since both
    // mean "fills the cell but does not support you." Checked before the
    // cave carve, or a cave province could hollow the barrier out.
    if (h > 0 && h <= CORE_LAVA_TOP) return BLOCK.WATER;
    if (h <= top - CAVE_CRUST && this.caveAt(ci, f, u, v, h)) return BLOCK.AIR;
    return BLOCK.STONE;
  }

  // the generated block at a cell, before any override
  terrain(ci, f, u, v, h) {
    const mat = this.column(ci, f, u, v);
    const top = this.colTop[ci];
    // The drafting table's whole profile, in three lines: turf to build on,
    // soil to dig out, and one course of rock that is the bottom of the
    // world. Deliberately not routed through the soil/ore/core machinery
    // below — a table has no depth for any of it to mean anything, and an
    // ore seam in a drawing surface is a distraction with a pickaxe in it.
    if (FLAT) {
      if (h > top || h < 0) return BLOCK.AIR;
      if (h === top) return mat;
      return h === 0 ? this.host : this.subFor[mat];
    }
    if (h > top) {
      const w = this.waterTopAt(ci);
      if (h > w) return BLOCK.AIR;
      return this.frozen(ci) && h === w ? BLOCK.ICE : this.fluid;
    }
    if (h === top) return mat;
    // The core bands, absolute h rather than depth-from-surface, checked
    // before soil/cave/ore so nothing generated above can override them:
    // lava first (h=0 stays whatever the preset's host rock is — bedrock,
    // protected from mining elsewhere — the lava sits just above it), then
    // a diamond seam dense enough to be worth the trip once you are past it.
    if (h > 0 && h <= CORE_LAVA_TOP) return BLOCK.LAVA;
    if (h > CORE_LAVA_TOP && h <= CORE_DIAMOND_TOP) {
      return coreDiamondAt(this.oreSeed, f, u, v, h) ? BLOCK.DIAMOND : this.host;
    }
    // soil profile by surface tile — see subFor in the constructor
    const sd = this.subDepthFor[mat];
    if (h > top - sd) return this.subFor[mat];
    // CAVE_CRUST > subDepth on every preset, so the common near-surface read
    // never reaches this line and never touches the cave cache
    if (h <= top - CAVE_CRUST && this.caveAt(ci, f, u, v, h)) return BLOCK.AIR;
    return oreAt(this.oreSeed, this.ores, sd, this.host, f, u, v, h, top);
  }

  // The MESHER's read: one column, layers `lo` to `hi`, straight into `out`
  // at `base` (cell h lands at out[base + h - lo]).
  //
  // This is terrain() above with everything that does not depend on h lifted
  // out of the loop: the column's material, its top, its water lid, its soil
  // depth and its cave mask are all properties of the COLUMN, and get()
  // re-derived every one of them for every cell. Meshing a radius-800 chunk
  // asks for about a hundred thousand cells, so that is a hundred thousand
  // repeats of the same six lookups — and it is most of what made a chunk
  // take a fifth of a second to build.
  //
  // The block-by-block answers must be IDENTICAL to get(). They are checked
  // against each other in tests.js ("fillColumn agrees with get"), because
  // two copies of the terrain profile that drift apart would show up as
  // holes in the ground rather than as anything obviously wrong here.
  fillColumn(f, u, v, lo, hi, out, base) {
    // A chunk on a cube edge has a border column that belongs to another
    // face; that is a handful per chunk, so it goes the slow way rather than
    // duplicating the reprojection.
    if (u < 0 || v < 0 || u >= S || v >= S) {
      for (let h = lo; h <= hi; h++) out[base + h - lo] = this.get(f, u, v, h);
      return;
    }
    const ci = (f * S + u) * S + v;
    const ov = this.ovFlag[ci] ? this.ov.get(ci) : null;
    const mat = this.column(ci, f, u, v);
    const top = this.colTop[ci];
    const sub = this.subFor[mat];

    if (FLAT) {
      for (let h = lo; h <= hi; h++) {
        if (h < 0 || h >= H) { out[base + h - lo] = BLOCK.AIR; continue; }
        let b;
        if (ov && (b = ov[h]) !== NONE) { out[base + h - lo] = b; continue; }
        out[base + h - lo] = h > top ? BLOCK.AIR
          : h === top ? mat : h === 0 ? this.host : sub;
      }
      return;
    }

    const w = this.waterTopAt(ci);
    const frozen = this.frozen(ci);
    const sd = this.subDepthFor[mat];
    // The cave mask is one 32-bit word for the column's cave band, and
    // resolving it is not free — a miss walks the band through two noise
    // fields. So it is resolved on the first cell deep enough to care and not
    // before: most columns of most chunks never reach cave depth at all, and
    // asking every one of them for a mask cost more than the whole of what
    // this method saves.
    const caveTop = top - CAVE_CRUST;
    let caveMask = 0, caveMaskHi = 0, caveLo = 0, caveKnown = false;

    for (let h = lo; h <= hi; h++) {
      // the h range first, then the override, then the profile — the order
      // get() reads them in
      if (h < 0 || h >= H) { out[base + h - lo] = BLOCK.AIR; continue; }
      let b;
      if (ov && (b = ov[h]) !== NONE) { out[base + h - lo] = b; continue; }
      if (h > top) {
        b = h > w ? BLOCK.AIR : frozen && h === w ? BLOCK.ICE : this.fluid;
      } else if (h === top) b = mat;
      // the core bands, absolute h rather than depth-from-surface. h = 0 is
      // bedrock and belongs to NEITHER band, which is why the diamond test
      // carries its lower bound rather than leaning on the lava one above it.
      else if (h > 0 && h <= CORE_LAVA_TOP) b = BLOCK.LAVA;
      else if (h > CORE_LAVA_TOP && h <= CORE_DIAMOND_TOP) {
        b = coreDiamondAt(this.oreSeed, f, u, v, h) ? BLOCK.DIAMOND : this.host;
      } else if (h > top - sd) b = sub;
      else {
        if (h <= caveTop && !caveKnown) {
          const cs = this.caveSlot(ci, f, u, v);
          caveMask = this.caveMask[cs]; caveLo = this.caveLo[cs];
          caveMaskHi = this.caveMaskHi[cs];
          caveKnown = true;
        }
        const d = h - caveLo;
        b = h <= caveTop && caveKnown && d >= 0 && (d < 32
          ? ((caveMask >>> d) & 1) === 1 : d < 64 && ((caveMaskHi >>> (d - 32)) & 1) === 1)
          ? BLOCK.AIR
          : oreAt(this.oreSeed, this.ores, sd, this.host, f, u, v, h, top);
      }
      out[base + h - lo] = b;
    }
  }

  // Top of the highest HARD *generated* cell in a column: the terrain, or the
  // ice cap over a frozen sea. columnSolidTop deliberately does not use this —
  // it wants the unbroken rock from the core, and a cap floats on water.
  // Does this column's sea have a lid on it?
  //
  // A whole frozen world says so in its preset. A polar cap says it one
  // column at a time, and says it through the material the column already
  // stores: rawColumn writes ICE as the bed material inside the cap, which
  // costs no extra memory and no extra hashing on any hot path here. The bed
  // is under water and never seen, so the byte is free to carry the fact.
  frozen(ci) {
    return this.iceCap || this.colMat[ci] === BLOCK.ICE;
  }

  hardTop(ci) {
    const top = this.colTop[ci];
    if (!this.frozen(ci)) return top;
    const w = this.waterTopAt(ci);
    return w > top ? w : top;
  }

  // What the GENERATOR says is here, with the edit diff taken out of the way.
  // The one caller is the water, and the reason it needs to know is the whole
  // of what stops a broken sea wall from draining the ocean: a cell the
  // generator fills with water is a SOURCE and does not empty when water
  // flows out of it, and a cell somebody's bucket filled is not. See
  // js/water.js.
  generated(f, u, v, h) {
    if (h < 0 || h >= H) return BLOCK.AIR;
    if (u < 0 || v < 0 || u >= S || v >= S) {
      if (FLAT) return BLOCK.AIR;
      const d = dirFromCell(f, u + 0.5, v + 0.5, _sd);
      const c = cellFromDir(d[0], d[1], d[2], _sc);
      const u2 = cellIdx(c[1]), v2 = cellIdx(c[2]);
      if (u2 < 0 || v2 < 0 || u2 >= S || v2 >= S) return BLOCK.AIR;
      f = c[0]; u = u2; v = v2;
    }
    return this.terrain((f * S + u) * S + v, f, u, v, h);
  }

  get(f, u, v, h) {
    if (h < 0 || h >= H) return BLOCK.AIR;
    if (u < 0 || v < 0 || u >= S || v >= S) {
      // off the plane's edge there is only sky
      if (FLAT) return BLOCK.AIR;
      // stepped off the face: re-project through the sphere to the neighbour
      const d = dirFromCell(f, u + 0.5, v + 0.5, _sd);
      const c = cellFromDir(d[0], d[1], d[2], _sc);
      const u2 = cellIdx(c[1]), v2 = cellIdx(c[2]);
      if (u2 < 0 || v2 < 0 || u2 >= S || v2 >= S) return BLOCK.AIR;
      f = c[0]; u = u2; v = v2;
    }
    const ci = (f * S + u) * S + v;
    if (this.ovFlag[ci]) {
      const b = this.ov.get(ci)[h];
      if (b !== NONE) return b;
    }
    return this.terrain(ci, f, u, v, h);
  }

  // Highest h such that cells 0..h are ALL solid, i.e. the top of the
  // uninterrupted rock/soil from the core. Meshing uses this to skip buried
  // cells: anything above it may be exposed, because water, a cave and the
  // air gap under a tree canopy all let faces show through.
  //
  // A cave therefore drops this to just under its lowest cell — that is the
  // whole point, it is what makes the mesher walk down and build the tunnel
  // walls. See INTEGRATION-terrain.md for the one caller that wanted the
  // other answer.
  columnSolidTop(f, u, v) {
    if (u < 0 || v < 0 || u >= S || v >= S) {
      if (FLAT) return -1;
      const d = dirFromCell(f, u + 0.5, v + 0.5, _sd);
      const c = cellFromDir(d[0], d[1], d[2], _sc);
      f = c[0]; u = cellIdx(c[1]); v = cellIdx(c[2]);
      if (u < 0 || v < 0 || u >= S || v >= S) return -1;
    }
    const ci = (f * S + u) * S + v;
    this.column(ci, f, u, v);
    const g = this.generatedSolidTop(ci, f, u, v);
    if (!this.ovFlag[ci]) return g;
    // Somebody has written to this column. The generated answer still stands
    // for the terrain; all an override can do is BREAK the run lower down —
    // a dug shaft, a doorway cut into a hillside — so the only question is
    // whether one does, at or below where the terrain's own run ends.
    //
    // This used to walk the column from the core instead, through genKind,
    // and it answered 0 for EVERY column with an override in it. The core
    // lava band sits at h = 1..3 and lava is not HARD, so the walk stopped
    // there and never got anywhere near the ground. Two thirds of the columns
    // in a wooded chunk have an override — every tree writes one — so two
    // thirds of a chunk was meshed from bedrock upward: two hundred and
    // eighty-five layers of buried rock, per column, to emit nothing. It was
    // the single biggest cost left in building a chunk.
    //
    // It also made a liar of the value for everyone else who reads it.
    // village.js's groundTop walks DOWN from here to find the soil, and
    // main.js sites a war chest on it: handed 0, one finds bedrock and the
    // other gives up. Neither could go near a column with a tree on it.
    const col = this.ov.get(ci);
    for (let h = 0; h <= g; h++) {
      const o = col[h];
      if (o === NONE) continue;
      // HARD, not "air or water": a flower or a ladder does not hold the
      // cell below it up, and treating it as solid would bury the ground
      // face under every flower
      if (!HARD[o]) return h - 1;
    }
    return g;
  }

  // columnSolidTop for the GENERATED terrain alone, with the edit diff left
  // out of it. Split out so the override path above can start from the same
  // answer an untouched column gets, instead of deriving its own and drifting.
  generatedSolidTop(ci, f, u, v) {
    const top = this.colTop[ci];
    // A one-cell ice cap sits straight on the bed, with no water between,
    // so the unbroken run really does continue through it. Any deeper water
    // breaks the run and the cap is floating, which is the usual case.
    const capped = this.frozen(ci) && this.waterTopAt(ci) === top + 1;
    if (top < 0) return capped ? top + 1 : -1;
    const cf = this.caveFloor(ci, f, u, v);
    if (cf >= 0) return cf - 1;
    return capped ? top + 1 : top;
  }

  // highest non-air cell in a column, -1 if empty; resolves cross-face
  columnTop(f, u, v) {
    if (u < 0 || v < 0 || u >= S || v >= S) {
      if (FLAT) return -1;
      const d = dirFromCell(f, u + 0.5, v + 0.5, _sd);
      const c = cellFromDir(d[0], d[1], d[2], _sc);
      f = c[0]; u = cellIdx(c[1]); v = cellIdx(c[2]);
      if (u < 0 || v < 0 || u >= S || v >= S) return -1;
    }
    const ci = (f * S + u) * S + v;
    this.column(ci, f, u, v);
    const top = this.colTop[ci];
    // terrain is non-air from 0 up to `base` (rock, then water to the sea or
    // the river surface); caves are far below top, so they cannot raise it
    const w = this.waterTopAt(ci);
    const base = w > top ? w : top;
    if (!this.ovFlag[ci]) return base;
    const col = this.ov.get(ci);
    for (let h = H - 1; h > base; h--) {
      const o = col[h];
      if (o !== NONE && o !== BLOCK.AIR) return h;
    }
    for (let h = base; h >= 0; h--) {
      const o = col[h];
      if (o !== NONE ? o !== BLOCK.AIR
        : this.genKind(ci, f, u, v, h) !== BLOCK.AIR) return h;
    }
    return -1;
  }

  // THE SEA COMES BACK INTO WHAT THE BUILDERS DUG. The village pass levels
  // its streets and pads with plain writes, and where a street ran down to the
  // shore it cleared lake and sea to air: a seven-wide trench standing dry to
  // the bed with the water stood up in walls either side, a pit at every
  // jetty. The water simulation would fill it in a moment — but it only wakes
  // when somebody changes a block, and nobody had. So after generation writes
  // (village layout, a house grown out of sight) every cell the writes made
  // AIR where the terrain had WATER, and which touches water, is water again,
  // cell to cell until nothing more touches. Only cells the terrain filled,
  // so it can never rise above the water it came from; and a room built below
  // the waterline with its walls whole stays dry, because nothing of it
  // touches the lake. Derived, like the rest of the layout: every machine
  // works out the same water from the world's name.
  refill(only = null) {
    const q = [];
    const isW = (ci, f, u, v, h) => this.terrain(ci, f, u, v, h) === BLOCK.WATER;
    // `only`: a list of plots ({f, u0, v0, w, d}) — a house grown out of sight
    // need not have the whole planet's overrides walked again for its sake
    const cols = only ? this.plotCols(only) : this.ov;
    for (const [ci, col] of cols) {
      const f = Math.floor(ci / (S * S)), u = Math.floor(ci / S) % S, v = ci % S;
      for (let h = 0; h < H; h++) {
        if (col[h] === BLOCK.AIR && isW(ci, f, u, v, h)) q.push([ci, f, u, v, h]);
      }
    }
    const wet = (f, u, v, h) => this.get(f, u, v, h) === BLOCK.WATER;
    let filled = 0, changed = true;
    while (changed) {
      changed = false;
      for (const c of q) {
        if (!c) continue;
        const [ci, f, u, v, h] = c;
        const col = this.ov.get(ci);
        if (col[h] !== BLOCK.AIR) continue;
        if (wet(f, u, v, h + 1) || wet(f, u + 1, v, h) || wet(f, u - 1, v, h)
          || wet(f, u, v + 1, h) || wet(f, u, v - 1, h)) {
          col[h] = BLOCK.WATER;
          filled++;
          changed = true;
        }
      }
    }
    // ...AND THE BANK BACK WHERE A BUILDER CUT IT. A street levelled into the
    // ground beside a river took the bank down to air with the river standing
    // at its side: the cell was ground before the builder, so it is ground
    // again — the override is dropped and the terrain shows — rather than the
    // river being let into the street.
    for (const [ci, col] of cols) {
      const f = Math.floor(ci / (S * S)), u = Math.floor(ci / S) % S, v = ci % S;
      for (let h = 1; h < H; h++) {
        if (col[h] !== BLOCK.AIR) continue;
        const was = this.terrain(ci, f, u, v, h);
        if (was === BLOCK.AIR || was === BLOCK.WATER) continue;
        if (wet(f, u + 1, v, h) || wet(f, u - 1, v, h)
          || wet(f, u, v + 1, h) || wet(f, u, v - 1, h)) {
          col[h] = NONE;
          filled++;
        }
      }
    }
    return filled;
  }

  // the override columns over a few plots, a cell round each
  plotCols(plots) {
    const out = [];
    for (const p of plots) {
      for (let u = p.u0 - 2; u <= p.u0 + p.w + 1; u++) {
        for (let v = p.v0 - 2; v <= p.v0 + p.d + 1; v++) {
          if (u < 0 || v < 0 || u >= S || v >= S) continue;
          const ci = (p.f * S + u) * S + v;
          if (this.ovFlag[ci]) out.push([ci, this.ov.get(ci)]);
        }
      }
    }
    return out;
  }

  set(f, u, v, h, b) {
    if (h < 0 || h >= H || u < 0 || v < 0 || u >= S || v >= S) return;
    const ci = (f * S + u) * S + v;
    let col = this.ovFlag[ci] ? this.ov.get(ci) : null;
    if (!col) {
      col = new Uint16Array(H).fill(NONE);
      this.ov.set(ci, col);
      this.ovFlag[ci] = 1;
    }
    col[h] = b;
  }

  // solidity at a world-space point. Lava is excluded for the same reason
  // water is: it is a fluid, and surfaceRadius already answers with the bed
  // under it, so treating it as ground here would put the two at odds.
  solidAtWorld(x, y, z) {
    const b = this.blockAtWorld(x, y, z);
    return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LAVA;
  }

  blockAtWorld(x, y, z) {
    if (FLAT) {
      const h = Math.floor(y - R0);
      if (h < 0 || h >= H) return BLOCK.AIR;
      const u = Math.floor(x + S / 2), v = Math.floor(S / 2 - z);
      if (u < 0 || v < 0 || u >= S || v >= S) return BLOCK.AIR;
      return this.get(2, u, v, h);
    }
    const r = Math.hypot(x, y, z);
    const h = Math.floor(r - R0);
    if (h < 0 || h >= H) return BLOCK.AIR;
    const inv = 1 / (r || 1);
    const c = cellFromDir(x * inv, y * inv, z * inv, _wc);
    const u = cellIdx(c[1]), v = cellIdx(c[2]);
    if (u < 0 || v < 0 || u >= S || v >= S) return BLOCK.AIR;
    return this.get(c[0], u, v, h);
  }

  // radius of the top surface of the highest solid cell in a column
  surfaceRadius(f, u, v) {
    if (u < 0 || v < 0 || u >= S || v >= S) return R0;
    const ci = (f * S + u) * S + v;
    this.column(ci, f, u, v);
    const top = this.hardTop(ci);
    if (!this.ovFlag[ci]) return top < 0 ? R0 : R0 + top + 1;
    const col = this.ov.get(ci);
    for (let h = H - 1; h >= 0; h--) {
      const o = col[h];
      // HARD so you never float on a flower or perch on a ladder's top rung,
      // exactly as the PASSABLE contract at the top of this file promises
      if (o !== NONE) {
        // a fence or closed gate holds you out half a block above its top,
        // which is what makes it animal-proof — see FENCE_EXTRA
        if (HARD[o]) return R0 + h + 1 + (fencelike(o) ? FENCE_EXTRA : 0);
      } else if (this.genKind(ci, f, u, v, h) === BLOCK.STONE) {
        return R0 + h + 1;
      }
    }
    return R0;
  }

  surfaceRadiusAtDir(x, y, z) {
    const c = cellFromDir(x, y, z, _wc);
    return this.surfaceRadius(c[0], cellIdx(c[1]), cellIdx(c[2]));
  }

  // The same question asked with a world POSITION, which is the form every
  // caller actually has in hand. On a sphere the position is normalized down
  // to a direction; on the plane normalizing would destroy the very
  // coordinates the column lives at, so the point is used as it is.
  surfaceRadiusAtWorld(x, y, z) {
    if (FLAT) return this.surfaceRadiusAtDir(x, y, z);
    const inv = 1 / (Math.hypot(x, y, z) || 1);
    return this.surfaceRadiusAtDir(x * inv, y * inv, z * inv);
  }

  // --- rivers --------------------------------------------------------------
  //
  // A river is not a pile of cells: it is an edit to the *height field*. Each
  // channel column has its bed lowered and its material set to GRAVEL, and
  // the water surface is then derived as bed + RIVER_DEPTH — the same rule
  // the sea already uses, one level higher. columnTop, columnSolidTop,
  // surfaceRadius and get() therefore pick a river up for free; there is no
  // second representation to keep in step, and no per-cell storage at all.
  //
  // Only the *paths* are computed at load: a few thousand (column, level,
  // width) triples. Cutting the channel is deferred to the first time
  // something looks at the region, which is why a radius-800 planet still
  // constructs in single-digit milliseconds.

  // Rivers are traced from the mouth *upwards*, not from a peak down.
  // Walking downhill from high ground is the obvious way round and it is a
  // trap: on fbm terrain most descents corner themselves in a basin, so most
  // of the work goes into paths thrown away for dead-ending — and "must
  // reach the sea" becomes a filter rather than a guarantee.
  //
  // So: probe for open water, walk out of it to the nearest shore, and from
  // there climb the valley — the lowest neighbour that is not lower than
  // where we stand, because *steepest* ascent climbs the ridge beside the
  // valley instead of the valley itself. Every river reaches the sea because
  // that is the end it was built from; running out of valley upstream only
  // makes a shorter river.
  //
  // The water surface climbs by at most one block per node, which is also
  // what keeps a river one connected body of water: neighbouring channel
  // columns hold RIVER_DEPTH cells each, so levels one apart still overlap.
  traceRivers() {
    // a preset with no rivers, or no standing fluid at all, has nothing to
    // trace — and a dry world would spend the whole probe budget missing
    if (H <= 0 || !this.preset.rivers || this.seaTop < 0) return;
    // One river per fixed length of coast: coastline grows with S, not with
    // S squared, so a colossal planet gets more rivers but not proportionally
    // more.
    const want = Math.max(5, Math.round(RIVER_PER * S / 256));
    // Only about one column in a hundred is under water, so the probe grid is
    // sized to land RIVER_PROBES hits per river wanted. A miss costs one fbm.
    const per = Math.ceil(Math.sqrt(want * RIVER_PROBES / 6));
    const gap = S / per;
    const cut = Math.max(RIVER_CUT, Math.round(AMP * RIVER_GORGE));
    // a river should cross a fair part of a face, not lap it; the budget is
    // in steps of RIVER_STEP columns each
    const steps = Math.max(24, Math.min(RIVER_MAX, S >> 3));
    const cols = [], lev = [], wid = [];
    const inRiver = new Set();              // committed columns, for merges
    const seen = new Set();                 // this path, to stop it looping
    const nodes = [];                       // (ci, w, halfWidth) triples
    const down = [];                        // the estuary, probe end first

    // Open water, one height sample per probe. About one column in a
    // hundred is under water, so the grid has to be fine — but a probe that
    // misses costs a single fbm, while looking for the coastline any other
    // way costs a search.
    const probes = [];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < per; i++) {
        for (let j = 0; j < per; j++) {
          const su = Math.min(S - 1, Math.floor((i + 0.5) * gap));
          const sv = Math.min(S - 1, Math.floor((j + 0.5) * gap));
          const ci = (f * S + su) * S + sv;
          this.rawColumn(ci, f, su, sv);
          if (this.colTop[ci] < this.seaTop) probes.push(ci);
        }
      }
    }
    // Thin by striding the list, which is in face order, so the rivers stay
    // spread over the whole globe rather than crowding the first face.
    const stride = Math.max(1, Math.floor(probes.length / want));

    for (let m = 0; m < probes.length; m += stride) {
      const start = probes[m];
      seen.clear();
      nodes.length = 0;
      down.length = 0;
      const sf = (start / (S * S)) | 0;
      const srem = start - sf * S * S;
      const su0 = (srem / S) | 0, sv0 = srem - su0 * S;

      // Out of the water to the nearest shore, a column at a time so the
      // channel stays unbroken. Highest neighbour, because on a sea floor
      // every direction descends equally and a river that starts by
      // wandering the seabed never finds land at all.
      let ef = sf, eu = su0, ev = sv0, dry = false;
      for (let k = 0; k < RIVER_EST; k++) {
        const ci = (ef * S + eu) * S + ev;
        this.rawColumn(ci, ef, eu, ev);
        down.push(ci);
        seen.add(ci);
        if (this.colTop[ci] > this.seaTop) { dry = true; break; }
        let bt = -1e9, bf = -1, bu = 0, bv = 0;
        for (let d = 0; d < 8; d++) {
          const c = nbCol(ef, eu, ev, DIR8[d * 2], DIR8[d * 2 + 1], _nb);
          const nci = (c[0] * S + c[1]) * S + c[2];
          if (seen.has(nci)) continue;
          this.rawColumn(nci, c[0], c[1], c[2]);
          if (this.colTop[nci] > bt) {
            bt = this.colTop[nci]; bf = c[0]; bu = c[1]; bv = c[2];
          }
        }
        if (bf < 0) break;
        ef = bf; eu = bu; ev = bv;
      }
      if (!dry) continue;      // an island-free stretch of sea: no river here

      // Lay the levels in, sea end first. A rise the channel cannot follow at
      // a block a node would leave a gap in the water, so give the whole
      // river up rather than break it in two.
      let w = this.seaTop, len = 0, bad = false;
      for (let k = 0; k < down.length; k++) {
        const ci = down[k];
        const top = this.colTop[ci];
        const nw = top < w + RIVER_RISE ? top : w + RIVER_RISE;
        if (nw > w) w = nw;
        if (top - w > cut) { bad = true; break; }
        nodes.push(ci, w, 1 + Math.min(2, (steps - len) >> 6));
        len++;
      }
      if (bad) continue;

      // and on up the valley from the shore
      let cf = ef, cu = eu, cv = ev, hd = -1;
      while (len < steps) {
        const ci = (cf * S + cu) * S + cv;
        this.rawColumn(ci, cf, cu, cv);
        const top = this.colTop[ci];
        const nw = top < w + RIVER_RISE ? top : w + RIVER_RISE;
        if (nw > w) w = nw;
        // past the gorge budget the river simply starts here: an unreachable
        // headwater costs nothing, the mouth is the end that has to be right
        if (top - w > cut) break;
        if (ci !== down[down.length - 1]) {   // already laid in above
          nodes.push(ci, w, 1 + Math.min(2, (steps - len) >> 6));
          seen.add(ci);
        }
        len++;
        // meeting an older channel makes this one a tributary of it
        if (len > 6 && inRiver.has(ci)) break;

        // Up the valley: the lowest neighbour that does not drop. Only the
        // three headings continuing the current course are looked at — all
        // eight costs nearly three times the height samples and lets the
        // path double back — with the full ring kept for the first step and
        // for the moment the valley ahead runs out.
        let bestTop = 1e9, bf = -1, bu = 0, bv = 0, bd = 0;
        for (let pass = 0; pass < 2; pass++) {
          const n = (hd < 0 || pass === 1) ? 8 : 3;
          for (let q = 0; q < n; q++) {
            const d = n === 8 ? q : (hd + (q === 0 ? 0 : q === 1 ? 1 : 7)) & 7;
            const c = nbCol(cf, cu, cv, DIR8[d * 2] * RIVER_STEP,
              DIR8[d * 2 + 1] * RIVER_STEP, _nb);
            const nci = (c[0] * S + c[1]) * S + c[2];
            if (seen.has(nci)) continue;
            this.rawColumn(nci, c[0], c[1], c[2]);
            const t = this.colTop[nci];
            if (t >= top && t < bestTop) {
              bestTop = t; bf = c[0]; bu = c[1]; bv = c[2]; bd = d;
            }
          }
          // the columns are cached now, so the wider retry only pays for the
          // five headings it has not already looked at
          if (bf >= 0) break;
        }
        if (bf < 0) break;                 // the valley ends: this is the head
        // the stride skipped a column; drop a node in it so the channel is
        // continuous without paying for a height sample
        const mid = nbCol(cf, cu, cv, (DIR8[bd * 2] * RIVER_STEP) >> 1,
          (DIR8[bd * 2 + 1] * RIVER_STEP) >> 1, _nb2);
        const mci = (mid[0] * S + mid[1]) * S + mid[2];
        nodes.push(mci, w, 1 + Math.min(2, (steps - len) >> 6));
        seen.add(mci);
        hd = bd; cf = bf; cu = bu; cv = bv;
      }
      if (len < RIVER_MIN) continue;        // a puddle, not a river
      for (let k = 0; k < nodes.length; k += 3) {
        cols.push(nodes[k]); lev.push(nodes[k + 1]); wid.push(nodes[k + 2]);
        inRiver.add(nodes[k]);
      }
    }

    this.rvCol = Int32Array.from(cols);
    this.rvH = Int16Array.from(lev);
    this.rvW = Uint8Array.from(wid);
    this.rivers = cols.length;
    this.indexRivers();
  }

  // Bucket every node into the feature regions its channel can reach, so the
  // carver only ever looks at the handful of nodes that touch its region. A
  // disc is four columns across at most, far less than FEATURE, so the four
  // corners of its bounding box name every region it can land in.
  indexRivers() {
    const buckets = new Map();
    const n = this.nreg, k = FEATURE;
    const add = (f, u, v, idx) => {
      const key = (f * n + ((u / k) | 0)) * n + ((v / k) | 0);
      const b = buckets.get(key);
      if (b === undefined) buckets.set(key, [idx]);
      else if (b[b.length - 1] !== idx) b.push(idx);
    };
    for (let idx = 0; idx < this.rivers; idx++) {
      const ci = this.rvCol[idx], r = this.rvW[idx] + 1;
      const f = (ci / (S * S)) | 0, rem = ci - f * S * S;
      const u = (rem / S) | 0, v = rem - u * S;
      for (let a = -1; a <= 1; a += 2) {
        for (let b = -1; b <= 1; b += 2) {
          const c = nbCol(f, u, v, a * r, b * r, _nb);
          add(c[0], c[1], c[2], idx);
        }
      }
      add(f, u, v, idx);
    }
    this.rvIndex = new Map();
    let bytes = 0;
    for (const [key, list] of buckets) {
      const a = Int32Array.from(list);
      bytes += a.byteLength + 32;
      this.rvIndex.set(key, a);
    }
    this.rvBytes = this.rvCol.byteLength + this.rvH.byteLength
      + this.rvW.byteLength + bytes;
  }

  // Cut every channel that reaches this region, once. Writes only columns
  // that belong to the region, so two regions never fight over one column
  // and the result does not depend on the order regions are visited in.
  carveRegion(f, i, j) {
    const n = this.nreg;
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    const key = (f * n + i) * n + j;
    if (this.carved[key]) return;
    this.carved[key] = 1;
    const list = this.rvIndex.get(key);
    if (list === undefined) return;

    const k = FEATURE;
    const u0 = i * k, v0 = j * k, u1 = u0 + k - 1, v1 = v0 + k - 1;
    // banks first, channel second, so a channel always wins a column it
    // shares with some other node's bank
    for (let pass = 0; pass < 2; pass++) {
      for (let e = 0; e < list.length; e++) {
        const idx = list[e];
        const ci = this.rvCol[idx], w = this.rvH[idx], rad = this.rvW[idx];
        const nf = (ci / (S * S)) | 0, rem = ci - nf * S * S;
        const nu = (rem / S) | 0, nv = rem - nu * S;
        // no levee at the mouth: a ring of sea-level ground there would wall
        // the river off from the ocean it just reached
        if (pass === 0 && w <= this.seaTop) continue;
        const out = pass === 0 ? rad + 1 : rad;
        const lim = out * out + 0.5, inner = rad * rad + 0.5;
        for (let du = -out; du <= out; du++) {
          for (let dv = -out; dv <= out; dv++) {
            const d2 = du * du + dv * dv;
            if (d2 > lim || (pass === 0 && d2 <= inner)) continue;
            const c = nbCol(nf, nu, nv, du, dv, _nb2);
            if (c[0] !== f) continue;
            const cu = c[1], cv = c[2];
            if (cu < u0 || cu > u1 || cv < v0 || cv > v1) continue;
            const cci = (f * S + cu) * S + cv;
            this.rawColumn(cci, f, cu, cv);
            if (pass === 0) {
              // Levee: lift the ground beside the channel up to the water
              // line, or a river crossing a slope shows a wall of water.
              // Never on sea floor, though — a levee there is a bar across
              // the estuary, and the river stops meeting the ocean.
              const t = this.colTop[cci];
              if (this.colMat[cci] !== BLOCK.GRAVEL && t > this.seaTop
                && t < w && w - t <= RIVER_FILL) this.colTop[cci] = w;
            } else {
              const t = this.colTop[cci];
              // a channel cuts down freely but may only be propped up by
              // RIVER_FILL, so the mouth does not raise a mound in the sea
              let bed = w - RIVER_DEPTH;
              if (bed > t + RIVER_FILL) bed = t;
              if (this.colMat[cci] !== BLOCK.GRAVEL || bed < t) {
                this.colTop[cci] = bed;
                this.colMat[cci] = BLOCK.GRAVEL;
              }
            }
          }
        }
      }
    }
  }

  // --- features (trees) ----------------------------------------------------
  //
  // Trees are the only generated thing that has to be *written*, so they are
  // baked per region, on demand, from a region-seeded RNG. Eager planting
  // costs O(planet); this costs O(what you actually walk to or look at, up
  // close). A crown reaches two columns, less than a region, so a chunk is
  // safe to mesh once its own region and the eight around it are baked.

  // Bake every feature region overlapping the column rectangle. Cheap and
  // idempotent, so meshing may call it per chunk.
  ensureFeatures(f, u0, v0, u1, v1) {
    const n = this.nreg, k = FEATURE;
    for (let i = Math.floor(u0 / k); i <= Math.floor(u1 / k); i++) {
      for (let j = Math.floor(v0 / k); j <= Math.floor(v1 / k); j++) {
        if (i >= 0 && j >= 0 && i < n && j < n) { this.bakeRegion(f, i, j); continue; }
        // off the face: the seam neighbour lives on another cube face, and
        // its (u, v) axes are rotated, so ask the sphere where it landed
        const d = dirFromCell(f, i * k + k / 2, j * k + k / 2, _fd);
        const c = cellFromDir(d[0], d[1], d[2], _fc);
        const ni = Math.min(n - 1, Math.floor(cellIdx(c[1]) / k));
        const nj = Math.min(n - 1, Math.floor(cellIdx(c[2]) / k));
        this.bakeRegion(c[0], ni, nj);
      }
    }
  }

  bakeRegion(f, i, j) {
    const key = (f * this.nreg + i) * this.nreg + j;
    if (this.baked.has(key)) return;
    this.baked.add(key);
    const k = FEATURE;
    const u0 = i * k, v0 = j * k;
    const uEnd = Math.min(u0 + k, S), vEnd = Math.min(v0 + k, S);
    const rand = mulberry32((this.treeSeed ^ Math.imul(key, 0x9e3779b1)) | 0);
    // preset.trees is 0 on the worlds where nothing grows, and then the whole
    // planting loop is skipped rather than failing per column
    const wantF = (uEnd - u0) * (vEnd - v0) * TREE_DENSITY * this.preset.trees
      * FOREST_PACK;
    const want = Math.floor(wantF) + (rand() < wantF % 1 ? 1 : 0);
    // the water held in before anything is planted on the banks it makes
    this.sealWater(f, u0, v0, uEnd, vEnd);
    let planted = 0;
    // Ask for the same number of trees, but only accept a candidate where the
    // forest field says there are woods — and give the loop enough tries to
    // find them. Inside a wood the acceptance is near certain and the trees
    // land shoulder to shoulder; between them almost nothing is planted, and
    // that gap is what makes the wood have an edge.
    if (this.gen5) {
      // THE WOODS BY THE COUNTRY (the fifth generation). The old field put a
      // wood on a fifth of the land and nothing on the rest, anywhere on the
      // planet. Now the climate says what kind of country this is and the
      // small field only shapes it: in open country a copse here and there
      // and a lone tree in a meadow; in woodland, woods with glades in them;
      // in the deep wood, trees to the horizon. The deep wood asks for half
      // as many again, and one tree in nine of it is a great one.
      const n5 = Math.floor(want * 1.5);
      for (let t = 0; t < n5 * 12 && planted < n5; t++) {
        const u = u0 + Math.floor(rand() * (uEnd - u0));
        const v = v0 + Math.floor(rand() * (vEnd - v0));
        dirFromCell(f, u + 0.5, v + 0.5, _cd);
        const kind = this.wood(_cd[0], _cd[1], _cd[2]);
        const grove = this.forest.noise(_cd[0] * FOREST_FREQ + 3, _cd[1] * FOREST_FREQ + 3,
          _cd[2] * FOREST_FREQ + 3);
        const odds = kind === 0 ? (grove > 0.62 ? 0.7 : 0.022)
          : kind === 1 ? (grove > 0.4 ? 0.62 : 0.1) : 1;
        const roll = rand();
        if (roll >= odds) continue;
        if (this.inVillage(f, u, v, CROWN + 1)) continue;
        const great = kind === 2 ? roll < 0.11 : kind === 0 && grove <= 0.62 && roll < 0.006;
        if (this.plantTree(f, u, v, rand, undefined, great)) planted++;
      }
      this.scatterWild(f, u0, v0, uEnd, vEnd);
    } else for (let t = 0; t < want * 90 && planted < want; t++) {
      const u = u0 + Math.floor(rand() * (uEnd - u0));
      const v = v0 + Math.floor(rand() * (vEnd - v0));
      dirFromCell(f, u + 0.5, v + 0.5, _cd);
      if (this.forest.noise(_cd[0] * FOREST_FREQ + 3, _cd[1] * FOREST_FREQ + 3,
        _cd[2] * FOREST_FREQ + 3) < FOREST_GATE) continue;
      if (this.inVillage(f, u, v, CROWN + 1)) continue;
      if (this.plantTree(f, u, v, rand)) planted++;
    }
    this.scatterPlants(f, u0, v0, uEnd, vEnd);
    this.scatterBamboo(f, u0, v0, uEnd, vEnd);
    this.scatterGourds(f, u0, v0, uEnd, vEnd);
  }

  // WATER THAT STANDS AGAINST NOTHING. Two things the column-by-column
  // generator leaves at the water's edge, and both read as the same bug from
  // inside the game — air below the water line with the water stood up in a
  // wall beside it:
  //
  //   - a CAVE carved in the rock beside a lake or the sea, below its surface
  //     (a sea cliff's tunnels, a cave mouth at a lake): a dry pocket opening
  //     onto the water. Every cave cell within SEAL_REACH columns of a water
  //     column, and below that water's surface, is water instead.
  //   - a river or lake whose surface stands higher than the bare ground
  //     beside it: a lip of water up to six cells tall with nothing holding it.
  //     That ground gets a bank of its own soil up to the water line.
  //
  // The water simulation would sort out both — but it wakes only when a block
  // changes, so nothing ever did. Done here instead, per region as it bakes,
  // into the override layer and never over a cell that already has one (a
  // village's street, the player's edit). Reads only the generated terrain,
  // so a region comes out the same whatever order the planet is baked in and
  // on every machine.
  sealWater(f, u0, v0, uEnd, vEnd) {
    const R = SEAL_REACH;
    const level = (u, v) => {
      if (u < 0 || v < 0 || u >= S || v >= S) return -1;
      const ci = (f * S + u) * S + v;
      this.column(ci, f, u, v);
      const top = this.colTop[ci], w = this.waterTopAt(ci);
      return top < w ? w : -1;
    };
    const free = (ci, h) => !this.ovFlag[ci] || this.ov.get(ci)[h] === NONE;
    for (let u = u0; u < uEnd; u++) {
      for (let v = v0; v < vEnd; v++) {
        if (level(u, v) >= 0) continue;            // a water column itself
        const ci = (f * S + u) * S + v;
        const top = this.colTop[ci];
        // the highest water within reach, and the highest right beside
        let near = -1, beside = -1;
        for (let du = -R; du <= R; du++) {
          for (let dv = -R; dv <= R; dv++) {
            const w = level(u + du, v + dv);
            if (w > near) near = w;
            if (Math.abs(du) + Math.abs(dv) === 1 && w > beside) beside = w;
          }
        }
        if (near < 0) continue;
        // the bank: dry ground lower than the water beside it
        if (beside > top) {
          const mat = this.colMat[ci] || BLOCK.DIRT;
          for (let h = top + 1; h <= beside; h++) {
            if (free(ci, h)) this.set(f, u, v, h, mat);
          }
        }
        // the caves: below the water line, near the water
        // (not top - CAVE_CRUST: a river's channel is cut after the caves,
        // and leaves a cave under it nearer the surface than the crust rule
        // would say could exist)
        const hi = Math.min(near, top - 1);
        for (let h = Math.max(1, near - SEAL_DEPTH); h <= hi; h++) {
          if (!free(ci, h)) continue;
          if (this.terrain(ci, f, u, v, h) === BLOCK.AIR) {
            this.set(f, u, v, h, this.fluid);
          }
        }
      }
    }
  }

  // Flowers and mushrooms. Hashed rather than drawn from the region RNG, so
  // a patch that straddles a region boundary is the same patch on both
  // sides; the region is only the unit of *when* the work happens.
  // A patch is 2^PLANT_PATCH columns square and carries one species, which is
  // what makes a meadow read as a meadow rather than as confetti.
  scatterPlants(f, u0, v0, uEnd, vEnd) {
    const density = this.preset.plants;
    if (!density) return;      // nothing flowers on rock, ash or ice
    const seed = this.plantSeed, P = 1 << PLANT_PATCH;
    const fill = (seed ^ 0x5b7) | 0;
    // patch by patch, not column by column: four fifths of the planet carries
    // nothing, and that is one hash per 64 columns rather than per column
    for (let pu = u0 - (u0 & (P - 1)); pu < uEnd; pu += P) {
      for (let pv = v0 - (v0 & (P - 1)); pv < vEnd; pv += P) {
        const pk = hash4(pu >> PLANT_PATCH, pv >> PLANT_PATCH, f, seed);
        const kind = pk & 255;
        let lush = 1;
        if (this.gen5) {
          // open country is where the flowers are: a meadow is thick with
          // them, the floor of the deep wood is mushrooms and shade
          dirFromCell(f, pu + P / 2, pv + P / 2, _cd);
          lush = [2.3, 1.1, 0.7][this.wood(_cd[0], _cd[1], _cd[2])];
        }
        if (kind >= PLANT_PATCHES * density * lush) continue;
        const b = kind < PLANT_MUSH ? BLOCK.MUSHROOM
          : BLOCK.FLOWER_RED + ((pk >>> 11) % 3);
        const uB = Math.min(pu + P, uEnd), vB = Math.min(pv + P, vEnd);
        for (let u = Math.max(pu, u0); u < uB; u++) {
          for (let v = Math.max(pv, v0); v < vB; v++) {
            if ((hash4(u, v, f, fill) & 255) >= PLANT_FILL) continue;
            const top = this.columnTop(f, u, v);
            if (top < 0 || top + 1 >= H) continue;
            if (this.get(f, u, v, top) !== BLOCK.GRASS) continue;
            if (this.get(f, u, v, top + 1) !== BLOCK.AIR) continue;
            this.set(f, u, v, top + 1, b);
          }
        }
      }
    }
  }

  // WHAT IS ON THE GROUND BETWEEN THE TREES (the fifth generation).
  //
  // A wood was trunks standing on a lawn. Three things make it a wood, each
  // a hash a column and nothing stored:
  //   bushes     a block of leaves on the turf, thick in the deep wood and
  //              along the edge of any copse
  //   boulders   mossed fieldstone left lying — a stone or a heap of three —
  //              in hill country and under trees
  //   windfalls  a trunk on its side, three to five logs long, where a tree
  //              came down and nobody carried it off
  // All on GRASS only, never in a village's ground, and never over a cell
  // somebody has already written (a tree, a street, a player's block).
  scatterWild(f, u0, v0, uEnd, vEnd) {
    if (!this.preset.trees) return;
    const key = this.wildSeed;
    const onGrass = (u, v) => {
      if (u < 0 || v < 0 || u >= S || v >= S) return -1;
      const top = this.columnTop(f, u, v);
      if (top < 1 || top + 3 >= H) return -1;
      if (this.get(f, u, v, top) !== BLOCK.GRASS) return -1;
      return top;
    };
    for (let u = u0; u < uEnd; u++) {
      for (let v = v0; v < vEnd; v++) {
        const h = hash4(u, v, f, key);
        const roll = h & 1023;
        if (roll >= 30) continue;                 // most of the ground is bare
        dirFromCell(f, u + 0.5, v + 0.5, _cd);
        const kind = this.wood(_cd[0], _cd[1], _cd[2]);
        const top = onGrass(u, v);
        if (top < 0 || this.inVillage(f, u, v, 3)) continue;
        if (roll < (kind === 2 ? 22 : kind === 1 ? 9 : 2)) {
          this.set(f, u, v, top + 1, BLOCK.LEAF);              // a bush
          continue;
        }
        const pick = (h >>> 10) & 255;
        if (roll >= 26 && pick < (kind === 0 ? 30 : 70)) {
          // a boulder: one stone, or three with one on top
          const stone = (h >>> 18) & 1 ? BLOCK.COBBLESTONE_MOSSY : BLOCK.COBBLESTONE;
          this.set(f, u, v, top + 1, stone);
          if (pick < 22) {
            for (const [du, dv] of [[1, 0], [0, 1]]) {
              const t2 = onGrass(u + du, v + dv);
              if (t2 >= 0 && Math.abs(t2 - top) <= 1) this.set(f, u + du, v + dv, t2 + 1, stone);
            }
            this.set(f, u, v, top + 2, stone);
          }
          continue;
        }
        if (roll >= 28 && kind > 0 && pick < 60) {
          // a windfall, lying along u or v on level ground
          const len = 3 + ((h >>> 20) & 3);
          const du = (h >>> 23) & 1, dv = 1 - du;
          const log = logId(treeKindAt(f, u, v).species);
          for (let k = 0; k < len; k++) {
            const t2 = onGrass(u + du * k, v + dv * k);
            if (t2 !== top) break;
            this.set(f, u + du * k, v + dv * k, top + 1, log);
          }
        }
      }
    }
  }

  // Bamboo. A stalk is a column of canes, three to seven high, and a grove is
  // however many of those land inside one patch of the grove field.
  //
  // Three gates, cheapest first: the tropics (a cane is a warm-country plant),
  // then damp — within BAMBOO_RISE of the sea, which is where the water is on
  // a world with no humidity map — and only then the noise. Everything here is
  // a pure function of (f, u, v) and the seed, so a grove is the same grove on
  // every machine and nothing about it is stored.
  scatterBamboo(f, u0, v0, uEnd, vEnd) {
    if (!this.preset.plants) return;      // nothing grows on rock, ash or ice
    const key = (this.plantSeed ^ 0xba3b00) | 0;
    for (let u = u0; u < uEnd; u++) {
      for (let v = v0; v < vEnd; v++) {
        if ((hash4(u, v, f, key) & 255) >= BAMBOO_FILL) continue;
        dirFromCell(f, u + 0.5, v + 0.5, _cd);
        const lat = _cd[1] < 0 ? -_cd[1] : _cd[1];
        if (lat > BAMBOO_LAT) continue;
        const top = this.columnTop(f, u, v);
        if (top < 0 || top - this.seaTop > BAMBOO_RISE) continue;
        if (top + BAMBOO_MAX + 1 >= H) continue;
        if (this.get(f, u, v, top) !== BLOCK.GRASS) continue;
        if (this.get(f, u, v, top + 1) !== BLOCK.AIR) continue;
        if (this.inVillage(f, u, v, 1)) continue;
        if (this.grove.noise(_cd[0] * BAMBOO_FREQ + 11,
          _cd[1] * BAMBOO_FREQ + 11,
          _cd[2] * BAMBOO_FREQ + 11) < BAMBOO_GATE) continue;
        // The height is its own roll, so a grove is ragged: a stand of canes
        // all exactly one height reads as a fence, which is what it looked
        // like before this was hashed separately from the placement.
        const n = BAMBOO_MIN + (hash4(u, v, f, (key + 31) | 0)
          % (BAMBOO_MAX - BAMBOO_MIN + 1));
        for (let k = 1; k <= n; k++) {
          if (this.get(f, u, v, top + k) !== BLOCK.AIR) break;
          this.set(f, u, v, top + k, BLOCK.BAMBOO);
        }
      }
    }
  }

  // A wild pumpkin or a wild melon, standing ripe on the grass. One roll per
  // patch of columns, and at most a handful of cells inside the patch that
  // takes it — see the GOURD_ constants for why they are this rare.
  scatterGourds(f, u0, v0, uEnd, vEnd) {
    if (!this.preset.plants) return;
    const pumpkin = cropId(CROP_TYPES.indexOf('pumpkin'), 1);
    const melon = cropId(CROP_TYPES.indexOf('watermelon'), 1);
    if (pumpkin == null || melon == null) return;
    const key = (this.plantSeed ^ 0x60a2d) | 0, P = 1 << GOURD_PATCH;
    const fill = (key + 7) | 0;
    for (let pu = u0 - (u0 & (P - 1)); pu < uEnd; pu += P) {
      for (let pv = v0 - (v0 & (P - 1)); pv < vEnd; pv += P) {
        const pk = hash4(pu >> GOURD_PATCH, pv >> GOURD_PATCH, f, key);
        if ((pk & 255) >= GOURD_ODDS) continue;
        // one species a patch, so what you find is a pumpkin patch or a melon
        // patch and not a fruit bowl
        const b = (pk >>> 11) & 1 ? pumpkin : melon;
        const uB = Math.min(pu + P, uEnd), vB = Math.min(pv + P, vEnd);
        for (let u = Math.max(pu, u0); u < uB; u++) {
          for (let v = Math.max(pv, v0); v < vB; v++) {
            if ((hash4(u, v, f, fill) & 255) >= GOURD_FILL) continue;
            const top = this.columnTop(f, u, v);
            if (top < 0 || top + 1 >= H) continue;
            if (this.get(f, u, v, top) !== BLOCK.GRASS) continue;
            if (this.get(f, u, v, top + 1) !== BLOCK.AIR) continue;
            if (this.inVillage(f, u, v, 1)) continue;
            this.set(f, u, v, top + 1, b);
          }
        }
      }
    }
  }

  // Is this column inside a settlement, plus `pad` cells of clearance?
  //
  // Villages are laid out BEFORE the woods are baked — they have to be, since
  // a village needs to survey untouched ground — so a village cannot clear the
  // trees that are planted afterwards. It has to be the other way round: the
  // forest pass asks first, and declines. Without this a wood baked over a
  // village put trunks through walls and crowns over the street, which is not
  // a village with trees in it, it is a village nobody has visited in years.
  //
  // Only the GENERATOR asks. A sapling the player plants on the green is their
  // business, and this is not consulted for it.
  inVillage(f, u, v, pad = 0) {
    const sites = this.villageSites;
    if (!sites) return false;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (s.f !== f) continue;
      const r = (s.reach || 0) + pad;
      if (Math.abs(u - s.u) <= r && Math.abs(v - s.v) <= r) return true;
    }
    return false;
  }

  // `put` is how the blocks go down, and it is the same split roadGate is
  // under: the GENERATOR writes straight into the planet, because a wood it
  // planted is derived and must never enter the diff — but a tree grown from
  // a sapling somebody put in the ground is a record of what happened, and
  // has to be saved and shipped like any block they laid. See updateFarming.
  plantTree(f, u, v, rand,
    put = (ff, uu, vv, hh, b) => this.set(ff, uu, vv, hh, b), great = false) {
    let top = this.columnTop(f, u, v);
    // Step down through whatever is already growing on this column: a flower
    // a neighbouring region dropped, or the LEAVES of a crown next door.
    //
    // The leaves are the important half, and they are why a "forest" used to
    // be a grid of lone trees five blocks apart however many were asked for.
    // A crown is five columns across, so the moment one tree goes in, every
    // column under it reports a leaf as its top — not grass — and is refused.
    // The first tree in a stand blackballed its own neighbourhood.
    //
    // A trunk still refuses: stepping down through leaves stops at the LOG,
    // which is not grass, so nothing can ever be planted into another tree.
    let guard = 0;
    while (top > 0 && guard++ < 16) {
      const b = this.get(f, u, v, top);
      if (b !== BLOCK.LEAF && !PLANTS.has(b)) break;
      top--;
    }
    if (top < 0 || top + 9 >= H) return false;
    if (this.get(f, u, v, top) !== BLOCK.GRASS) return false;

    // WHAT KIND OF TREE, from where it stands — see treeKindAt: spruce
    // toward the caps, birch and oak in the temperate belt, oak and the
    // dark wood in the warm belt, acacia in the tropics. The shape follows
    // the species: a spruce is tall and narrow, an acacia low and flat.
    // trunk grows straight up the column — no staircase, because +h is up
    let T = treeKindAt(f, u, v);
    let trunk = T.trunk[0] + Math.floor(rand() * (T.trunk[1] - T.trunk[0] + 1));
    if (this.gen5) {
      // TREES COME IN SIZES. Every oak on the planet was four to six courses
      // of trunk under the same crown, and a wood of them was a hedge with a
      // flat top. A third stand a course or two taller or shorter, with the
      // crown to match; and a GREAT one is the tree a wood is known by —
      // half as tall again, its crown half as wide again.
      const r = rand();
      const k = great ? 1.5 : r < 0.18 ? 0.82 : r > 0.84 ? 1.22 : 1;
      if (k !== 1) {
        trunk = Math.max(3, Math.round(trunk * (great ? 1.6 : k)));
        T = { ...T, radius: T.radius * k,
          above: great ? T.above + 1 : T.above,
          below: great && T.below < 0 ? T.below - 1 : T.below };
      }
    }
    if (top + trunk + 5 >= H) return false;
    const log = logId(T.species);
    for (let k = 1; k <= trunk; k++) put(f, u, v, top + k, log);

    const crown = top + trunk;
    const reach = Math.ceil(T.radius);
    for (let du = -reach; du <= reach; du++) {
      for (let dv = -reach; dv <= reach; dv++) {
        for (let dh = T.below; dh <= T.above; dh++) {
          if (Math.hypot(du, dv, dh * T.squash) > T.radius) continue;
          const uu = u + du, vv = v + dv, hh = crown + dh;
          if (uu < 0 || vv < 0 || uu >= S || vv >= S || hh >= H) continue;
          if (this.get(f, uu, vv, hh) === BLOCK.AIR)
            put(f, uu, vv, hh, BLOCK.LEAF);
        }
      }
    }
    return true;
  }

  // bytes actually committed, for the stats line. Caves add nothing but a
  // fixed cache; rivers add their node list and the carved-region flags.
  memoryBytes() {
    return this.nCols * 5 + this.ov.size * H * 2
      + this.carved.length + this.rvBytes + CAVE_SLOTS * 10;
  }
}
