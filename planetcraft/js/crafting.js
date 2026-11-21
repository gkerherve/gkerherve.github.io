// crafting.js — shaped/shapeless recipes over a 3x3 grid, plus smelting.
//
// A shaped recipe is stored as a trimmed pattern ("MMM", " S ", " S ") and is
// matched by sliding that pattern over the grid: that way a pickaxe laid out
// in the bottom-left corner of the bench still works, without writing the
// recipe out nine times. Shapeless recipes only compare multisets.
//
// Everything here is pure (grid in, result out) so it unit-tests under node.

import {
  ITEMS, TOOL_MATERIAL, TIER, getItem, STAIR_ITEMS, SLAB_ITEMS,
  TINT_NAMES, GLASS_ITEMS, PANE_ITEMS, LOG_ITEMS, PLANK_ITEMS, METAL_KEYS,
  CEMENT_ITEMS, DOOR_NAMES, ARMOUR_MATERIAL, WOOL_NAMES, WOOL_ITEMS,
  BED_ITEMS,
} from './items.js';

export const GRID = 3;
export const SLOTS = GRID * GRID;

// --- recipe construction ----------------------------------------------------

export const RECIPES = [];

function trim(pattern) {
  // strip empty border rows/columns so the pattern can slide
  let rows = pattern.map((r) => r.split(''));
  const empty = (r) => r.every((c) => c === ' ');
  while (rows.length && empty(rows[0])) rows.shift();
  while (rows.length && empty(rows[rows.length - 1])) rows.pop();
  const w = Math.max(0, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < w) r.push(' ');
  const col = (i) => rows.every((r) => r[i] === ' ');
  while (rows.length && rows[0].length && col(0)) {
    rows.forEach((r) => r.shift());
  }
  while (rows.length && rows[0].length && col(rows[0].length - 1)) {
    rows.forEach((r) => r.pop());
  }
  return rows;
}

export function shaped(out, count, pattern, key) {
  const rows = trim(pattern);
  RECIPES.push({
    kind: 'shaped', out, count, rows, key,
    h: rows.length, w: rows[0]?.length ?? 0,
  });
}

export function shapeless(out, count, ingredients) {
  RECIPES.push({
    kind: 'shapeless', out, count,
    need: [...ingredients].sort(),
  });
}

// --- the recipe book --------------------------------------------------------

shapeless('plank', 4, ['log']);
shaped('stick', 4, ['P', 'P'], { P: 'plank' });
shaped('crafting_table', 1, ['PP', 'PP'], { P: 'plank' });
shaped('chest', 1, ['PPP', 'P P', 'PPP'], { P: 'plank' });
// the furnace is built of the ROUNDS a mined rock drops, as it always was in
// the game this one nods to — cobble brick is dressed stone and too good for it
shaped('furnace', 1, ['CCC', 'C C', 'CCC'], { C: 'cobblestone_round' });
// --- the cobblestone family ---------------------------------------------------
// Rounds are what the pick gives you; everything squarer is work done to them.
// Four rounds dress into four cobble brick — the wall material every village
// is already built of — and the two weathered varieties are a round plus what
// weathered it: leaves for moss, coal for soot.
shaped('cobblestone', 4, ['CC', 'CC'], { C: 'cobblestone_round' });
shapeless('cobblestone_mossy', 1, ['cobblestone_round', 'leaves']);
shapeless('cobblestone_dark', 1, ['cobblestone_round', 'coal']);
// --- masonry walls ------------------------------------------------------------
// Six of the material make six lengths of wall, the way Minecraft counts it:
// a wall spends the same stone a course of blocks would and buys thinness.
shaped('brick_wall', 6, ['MMM', 'MMM'], { M: 'brick' });
shaped('cobble_brick_wall', 6, ['MMM', 'MMM'], { M: 'cobblestone' });
shaped('stone_wall', 6, ['MMM', 'MMM'], { M: 'stone' });
shaped('cobblestone_wall', 6, ['MMM', 'MMM'], { M: 'cobblestone_round' });
shaped('cobblestone_mossy_wall', 6, ['MMM', 'MMM'], { M: 'cobblestone_mossy' });
shaped('cobblestone_dark_wall', 6, ['MMM', 'MMM'], { M: 'cobblestone_dark' });
shaped('torch', 4, ['C', 'S'], { C: 'coal', S: 'stick' });
shaped('thatch', 1, ['WWW', 'WWW', 'WWW'], { W: 'wheat' });
shaped('bread', 1, ['WWW'], { W: 'wheat' });
shaped('brick', 1, ['BB', 'BB'], { B: 'clay' });
shapeless('seeds', 1, ['wheat']);
shapeless('bone_meal', 3, ['bone']);
shaped('fence', 3, ['PSP', 'PSP'], { P: 'plank', S: 'stick' });
// the inverse weave of the fence, exactly as Minecraft has it
shaped('gate', 1, ['SPS', 'SPS'], { S: 'stick', P: 'plank' });
shaped('lantern', 1, [' I ', 'ITI', ' I '],
  { I: 'iron_ingot', T: 'torch' });
// the one thing silver is good for: an apple worth carrying
shaped('silver_apple', 1, ['III', 'IAI', 'III'],
  { I: 'silver_ingot', A: 'apple' });

// --- bamboo -------------------------------------------------------------------
// What a cane is FOR. Two of them stood on end are a stick, which is the whole
// argument for the plant: every tool, every torch and every fence in this game
// begins with a stick, and until bamboo the only road to one went through an
// axe and a tree. A row of three pulps into paper on the same terms wheat
// does, so a grove is also a library nobody had to farm for.
shaped('stick', 2, ['B', 'B'], { B: 'bamboo' });
shaped('paper', 2, ['BBB'], { B: 'bamboo' });

// --- what a kitchen makes -----------------------------------------------------
//
// A cake is milk, sweetening and flour, and this world's sweetening is honey —
// there is no sugar in it and inventing one would be a whole crop chain for a
// single ingredient. So: a pail of milk poured over a sheaf between two combs,
// standing on three more sheaves. The pail comes BACK (see `consume`), because
// a cake that eats three iron ingots is a cake nobody makes twice.
//
// The honey is the part that makes it a journey. A comb comes off a hive, and
// a hive is somewhere you have to go — which is exactly the shape this game
// wants a luxury to have.
shaped('cake', 1, [' M ', 'HWH', 'WWW'],
  { M: 'milk_bucket', H: 'honeycomb', W: 'wheat' });

// The stew: two potatoes and a carrot over a piece of cooked meat, and two
// crocks out of it. It is the only thing in the book that makes the RAW potato
// worth pulling — one point of food each in the hand, eight in the crock — and
// the cooked meat in the bottom is the fire it was made over, since a bench
// cannot light one of its own.
shaped('potato_stew', 2, ['PCP', ' M '],
  { P: 'potato', C: 'carrot', M: 'meat_cooked' });

// Ladders. The H of sticks is the classic shape and it reads as a ladder in
// the recipe book, which matters more here than the exact stick count.
shaped('ladder', 3, ['S S', 'SSS', 'S S'], { S: 'stick' });

// The prehistoric rack: what the ground hands you before you own a furnace.
// Flint comes out of gravel, sticks out of leaves — day-one weapons.
shaped('club', 1, ['L', 'S'], { L: 'log', S: 'stick' });
shaped('flint_knife', 1, ['F', 'S'], { F: 'flint', S: 'stick' });
// A spear is laid out on the DIAGONAL, and not, as it was, as a head over two
// sticks in a column. That column is the shovel's pattern to the character:
// one head, two sticks under it. `match` takes the first recipe that fits and
// the spear is registered first, so an iron ingot over two sticks has been
// handing out a spear and the IRON SHOVEL has been uncraftable — you could
// make one in wood, stone and diamond and not in the tier between them. The
// diagonal collides with nothing, and a spear laid corner to corner is also
// simply what a long weapon looks like on a bench.
const SPEAR_SHAPE = ['  M', ' S ', 'S  '];
shaped('flint_spear', 1, SPEAR_SHAPE, { M: 'flint', S: 'stick' });
// ...and the medieval one, once iron runs. The spear is the knapped shape
// grown up; the hammer is most of an ingot bar on a haft.
shaped('spear', 1, SPEAR_SHAPE, { M: 'iron_ingot', S: 'stick' });
// hammers share one silhouette across three materials, like the tool tiers
shaped('wood_hammer', 1, ['PPP', 'PSP', ' S '], { P: 'plank', S: 'stick' });
shaped('hammer', 1, ['III', 'ISI', ' S '], { I: 'iron_ingot', S: 'stick' });
shaped('diamond_hammer', 1, ['DDD', 'DSD', ' S '],
  { D: 'diamond', S: 'stick' });
// the bow is bent sticks strung with leather; arrows are flint, shaft,
// fletching — four per feather, which is what makes birds worth following
shaped('bow', 1, [' SL', 'S L', ' SL'], { S: 'stick', L: 'leather' });
shaped('arrow', 4, ['F', 'S', 'E'],
  { F: 'flint', S: 'stick', E: 'feather' });

// Furniture. Each pattern is the thing's own silhouette: a tabletop on legs,
// a chair in profile, a torch under a shade, a torch up a post, logs round
// coal. The chair's profile reads left-to-right; where its back lands in the
// world is the placement's decision, not the recipe's.
shaped('table', 1, ['PPP', 'S S'], { P: 'plank', S: 'stick' });
shaped('chair', 2, ['P ', 'PP', 'SS'], { P: 'plank', S: 'stick' });
// a sign: six boards and a stick to stand it on, three at a time, because
// nobody writes one notice
shaped('sign', 3, ['PPP', 'PPP', ' S '], { P: 'plank', S: 'stick' });
// a bin: an iron drum, open at the top
shaped('bin', 1, ['I I', 'I I', 'III'], { I: 'iron_ingot' });
shaped('lamp', 1, ['T', 'S', 'P'], { T: 'torch', S: 'stick', P: 'plank' });
shaped('street_lamp', 2, ['T', 'L'], { T: 'torch', L: 'log' });
shaped('campfire', 1, [' C ', 'LLL'], { C: 'coal', L: 'log' });

// Stairs and slabs, one pair per material. Six blocks laid out as a staircase
// give four stairs, three in a row give six slabs — the standard trade, where
// stairs lose material and slabs gain volume.
STAIR_ITEMS.forEach((out, i) => {
  const M = ITEMS[out]?.material;
  if (M) shaped(out, 4, ['M  ', 'MM ', 'MMM'], { M });
});
SLAB_ITEMS.forEach((out) => {
  const M = ITEMS[out]?.material;
  if (M) shaped(out, 6, ['MMM'], { M });
});

// --- dye --------------------------------------------------------------------
// Two dye per flower, so a meadow is worth walking through. The other five
// come off the ground or off the bench: bone and coal are the two ends of the
// scale, and the secondaries are one primary mixed into another. Every one of
// them is now worth having, because a dye stains eight blocks of glass or
// eight of timber.
shapeless('dye_red', 2, ['flower_red']);
shapeless('dye_yellow', 2, ['flower_yellow']);
shapeless('dye_blue', 2, ['flower_blue']);
shapeless('dye_white', 3, ['bone']);
shapeless('dye_black', 3, ['coal']);
shapeless('dye_orange', 2, ['dye_red', 'dye_yellow']);
shapeless('dye_green', 2, ['dye_yellow', 'dye_blue']);
shapeless('dye_purple', 2, ['dye_red', 'dye_blue']);

// --- the alloys --------------------------------------------------------------
// The two real ones, made of the metals they are really made of. Brass was a
// gold ingot beaten into an iron one — a stand-in from before copper existed,
// which left gold with a job it never had in the ground and iron paying for
// it. Copper and zinc make brass; copper and tin make bronze; gold is gold.
//
// Two ingots come out for the two that go in, so an alloy is worth exactly
// what its halves are and neither half is a dead end. Copper is the metal you
// find first and the metal both alloys are mostly made of, which is what makes
// a seam of it worth going back for after you already have iron.
shapeless('brass_ingot', 2, ['copper_ingot', 'zinc_ingot']);
shapeless('bronze_ingot', 2, ['copper_ingot', 'tin_ingot']);

// The storage blocks, and the uncrafting that gets the nine back. This is the
// pair that matters: nine ingots go in, one block comes out, the block mines
// back as itself and the bench opens it again. A deep mine now runs out of
// ore before it runs out of bag.
const STORAGE = [
  ['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'],
  ['diamond_block', 'diamond'], ['brass_block', 'brass_ingot'],
  // ...and one for every metal that can now fill a bag: the three new ores'
  // ingots, the second alloy, and silver, which never had one
  ['copper_block', 'copper_ingot'], ['bronze_block', 'bronze_ingot'],
  ['zinc_block', 'zinc_ingot'], ['tin_block', 'tin_ingot'],
  ['silver_block', 'silver_ingot'],
];
for (const [block, unit] of STORAGE) {
  shaped(block, 1, ['MMM', 'MMM', 'MMM'], { M: unit });
  shapeless(unit, 9, [block]);
}

// The metal racks. Seven shapes apiece — the five tool silhouettes every tier
// wears, plus the spear and the war hammer the medieval rack has carried in
// iron since it landed. A metal is a material, not a new kind of tool, so
// there is one pattern table and four metals through it.
const METAL_PATTERNS = {
  pickaxe: ['MMM', ' S ', ' S '],
  axe: ['MM', 'MS', ' S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', ' S', ' S'],
  spear: SPEAR_SHAPE,
  hammer: ['MMM', 'MSM', ' S '],
};
for (const metal of METAL_KEYS) {
  for (const [type, pattern] of Object.entries(METAL_PATTERNS)) {
    shaped(`${metal}_${type}`, 1, pattern,
      { M: `${metal}_ingot`, S: 'stick' });
  }
}

// --- armour -------------------------------------------------------------------
// Four silhouettes, and each one is the piece seen from the front: a helmet is
// a band with a face-hole under it, a breastplate is shoulders over a body, the
// leggings are a waist over two legs, the boots are two feet. One pattern table
// and eight materials through it, exactly as the tool racks are built — a
// material is a material, not a new kind of armour.
//
// The gap in each pattern is what stops them colliding with anything already in
// the book: a solid 3x3 of a metal is its storage block, and every one of these
// is a 3x3 with a hole in it. See items.js for the points and the durability.
const ARMOUR_PATTERNS = {
  helmet: ['MMM', 'M M'],
  chestplate: ['M M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M M', 'M M'],
  boots: ['M M', 'M M'],
};
for (const [key, mat] of Object.entries(ARMOUR_MATERIAL)) {
  for (const [slot, pattern] of Object.entries(ARMOUR_PATTERNS)) {
    shaped(`${key}_${slot}`, 1, pattern, { M: mat });
  }
}

// --- the bucket ---------------------------------------------------------------
// Three ingots in a V, which is the shape of the thing: two sides folded up
// off a base. It is also Minecraft's, so anyone who has held one before does
// not have to look it up. One bucket, not two — it is three iron, and the
// point of a bucket is that you own one and keep re-using it.
shaped('bucket', 1, ['I I', ' I '], { I: 'iron_ingot' });

// --- dynamite -----------------------------------------------------------------
// There is no gunpowder in this world and inventing one would be a whole ore
// chain for a single item, so a stick of dynamite is what the shelf already
// holds: a charge of coal cut with sand, wrapped in paper. Two sticks a craft,
// and the paper is the only part a field cannot make in an afternoon.
shaped('dynamite', 2, ['PPP', 'CSC', 'PPP'],
  { P: 'paper', C: 'coal', S: 'sand' });

// --- rails and the wagon ------------------------------------------------------
// Six irons over a course of sticks makes sixteen rails, which is a length of
// line worth walking; the wagon is a box of planks on an iron underframe.
shaped('rail', 16, ['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' });
shaped('wagon', 1, ['P P', 'PPP'], { P: 'plank' });

// --- the shield ---------------------------------------------------------------
// A board with an iron boss on it: planks for the body, one ingot for the
// centre. Cheap on purpose — a shield you cannot afford early is a shield
// that never saves anybody from the first zombie.
shaped('shield', 1, ['PIP', 'PPP', ' P '], { P: 'plank', I: 'iron_ingot' });

// --- power --------------------------------------------------------------------
// Iron and bronze, which is what an electrical fitting is made of and also
// what this world has by the time anybody wants one: you need a furnace, an
// iron seam and the bronze the mint already taught you to pour.
//
// Wire comes eight to a craft because a run of it is a street long, and the
// dynamo is the dear one — it is the machine, and everything else on the
// circuit is a fitting hung off it.
shaped('wire', 8, ['III'], { I: 'iron_ingot' });
shaped('switch', 1, [' B ', 'CCC'], { B: 'bronze_ingot', C: 'cobblestone' });
shaped('dynamo', 1, ['III', 'IBI', 'CCC'],
  { I: 'iron_ingot', B: 'bronze_ingot', C: 'cobblestone' });
shaped('power_lamp', 2, [' G ', 'GIG', ' I '],
  { G: 'glass', I: 'iron_ingot' });

// --- the golden apple ---------------------------------------------------------
// The silver apple's shape in gold, which is the whole idea: the same gesture
// twice, once for the metal you can work early and once for the one you carry
// home. It is the best thing in the game to eat — see items.js for what it
// does beyond filling the bar.
shaped('golden_apple', 1, ['III', 'IAI', 'III'],
  { I: 'gold_ingot', A: 'apple' });

// A post is a log planed down: one column of two logs saws into six of them,
// the same trade three blocks in a row makes into six slabs. Cheap on purpose
// — a lamp post is five of these and a village puts up a street of them.
shaped('post', 6, ['L', 'L'], { L: 'log' });

// --- glass: the tints, and the panes ----------------------------------------
// Eight of the material round one dye is the shape for staining anything, and
// it is used twice below — once on glass and once on timber — so the gesture
// only has to be learnt once.
//
// A pane is the other half of what the player asked for: six blocks of glass
// drawn out flat give sixteen panes, which is the trade that makes glazing a
// whole wall of windows affordable. Tinted panes come from tinted glass, so
// the colour is decided once, at the glassworks, and not again per pane.
const STAIN = ['GGG', 'GDG', 'GGG'];
const DRAW_OUT = ['GGG', 'GGG'];
shaped('glass_pane', 16, DRAW_OUT, { G: 'glass' });
TINT_NAMES.forEach((tint, i) => {
  shaped(GLASS_ITEMS[i], 8, STAIN, { G: 'glass', D: `dye_${tint}` });
  shaped(PANE_ITEMS[i + 1], 16, DRAW_OUT, { G: GLASS_ITEMS[i] });
});

// --- cement -------------------------------------------------------------------
// Aggregate, sand and a pigment, which is what cement actually is: four gravel
// and four sand round one dye make eight blocks. The dye in the middle is the
// same gesture that stains glass and stains timber, so the eight colours are
// learnt once and spent three ways — and a dye that used to buy eight windows
// now also buys eight walls to put them in.
TINT_NAMES.forEach((tint, i) => {
  shaped(CEMENT_ITEMS[i], 8, ['GSG', 'SDS', 'GSG'],
    { G: 'gravel', S: 'sand', D: `dye_${tint}` });
});

// --- wool, and the bed --------------------------------------------------------
//
// There is no recipe that MAKES wool. It comes off a sheep and only off a
// sheep, which is the whole point of the material: the bed you sleep in is
// downstream of a flock you kept alive, and the four colours you can get
// without a bench are the four a flock is born in.
//
// What the bench does is change wool's colour and turn it into furniture:
//
//   any wool + a dye     ->  that colour of wool
//   three wool, three planks -> a bed of that colour
//
// The dyeing is written as every fleece against every dye rather than as
// white-only, because a bag ends up full of the colour your flock happens to
// be and telling a player their brown wool is the wrong wool is a rule with
// nothing behind it. It is eighty shapeless recipes and they cost nothing.
WOOL_ITEMS.forEach((wool) => {
  WOOL_NAMES.forEach((tint, i) => {
    // The two naturals have no dye — brown and grey are what a sheep gives
    // you and there is no bottle of either, which is exactly what makes a
    // brown bed mean something a blue one does not.
    if (i >= 8) return;
    if (WOOL_ITEMS[i] === wool) return;      // already that colour
    shapeless(WOOL_ITEMS[i], 1, [wool, `dye_${tint}`]);
  });
});
// A bed is a mattress on a frame, and the recipe is that in plan: a course of
// fleece over a course of boards.
WOOL_ITEMS.forEach((wool, i) => {
  shaped(BED_ITEMS[i], 1, ['WWW', 'PPP'], { W: wool, P: 'plank' });
});

// --- money --------------------------------------------------------------------
// Gold used to be worth exactly one thing — alloying into brass — and a metal
// you dig for and cannot spend is a metal nobody digs for. An ingot strikes
// nine coins and nine coins melt back into an ingot, the same round trip every
// storage block in this game makes, so a purse and a bar are the same wealth
// in two shapes and neither is a trap.
shapeless('coin', 9, ['gold_ingot']);
shaped('gold_ingot', 1, ['CCC', 'CCC', 'CCC'], { C: 'coin' });
// The MINT: the press a village strikes its coin at, and its own silhouette on
// the bench — a bar over a frame over a stone bed. It is a convenience and
// never a shortcut: it strikes the same nine coins to the ingot the line above
// does, so the only thing it buys is somebody able to stand at it all day.
// Every village has one whether anybody crafts it or not; this is here because
// a machine the player cannot build is a power only a village has.
shaped('mint', 1, ['III', ' I ', 'CSC'],
  { I: 'iron_ingot', C: 'cobblestone', S: 'stone' });

// Shears: two blades on a sprung bow, which is one piece of steel bent back on
// itself. Laid out on the diagonal, like the spear, because a pair of shears
// is not a tool head on a haft and should not look like one on the bench.
shaped('shears', 1, [' I', 'I '], { I: 'iron_ingot' });

// --- paper, books and the shelf they stand on ---------------------------------
// Wheat was worth exactly one thing — bread — and a field grows far more of it
// than anyone can eat. A sheaf pulps into four sheets, three sheets bound in a
// hide make a book, and six planks round three books make a shelf.
//
// The pulp is a 2x2 and not a row, because a row of three wheat is BREAD and
// `match` takes the first recipe that fits: paper laid out that way would
// simply never be craftable.
shaped('paper', 4, ['WW', 'WW'], { W: 'wheat' });
shapeless('book', 1, ['paper', 'paper', 'paper', 'leather']);
shaped('bookshelf', 1, ['PPP', 'BBB', 'PPP'], { P: 'plank', B: 'book' });
// A reading desk: a shelf's worth of boards under a slab, with the book on
// top. The book is what makes it a lectern rather than a stand.
shaped('lectern', 1, ['SBS', 'PPP', ' P '],
  { S: 'plank', B: 'book', P: 'plank' });

// --- doors ---------------------------------------------------------------------
// Six of the material standing on end, which is the door's own silhouette on
// the bench and gives three leaves — a house needs more than one. Iron is the
// same shape in ingots. Glass is the odd one: two courses of glass over a
// timber bottom rail, because a door glazed all the way to the floor is a
// window somebody has hung on hinges.
PLANK_ITEMS.forEach((plank, i) => {
  shaped(`${DOOR_NAMES[i]}_door`, 3, ['PP', 'PP', 'PP'], { P: plank });
});
shaped('iron_door', 3, ['MM', 'MM', 'MM'], { M: 'iron_ingot' });
shaped('glass_door', 2, ['GG', 'GG', 'PP'], { G: 'glass', P: 'plank' });

// The bell: a headstock of planks over the casting. Bronze because that is
// what a bell is cast in, and the only reason the metal needs beyond tools.
shaped('bell', 1, ['PPP', 'MMM', ' M '], { P: 'plank', M: 'bronze_ingot' });
// ...and cast in iron, for a founder who has a mine before he has an alloy.
// Bronze is copper AND tin smelted and mixed; iron is one ore and one
// furnace, so this is the early road to a village of your own. Same bell,
// same voice — the metal is the maker's business.
shaped('bell', 1, ['PPP', 'III', ' I '], { P: 'plank', I: 'iron_ingot' });

// --- the four timbers after oak ---------------------------------------------
// Nothing GROWS a second species. Putting one in the generator would change
// what every forest on every existing world is made of, and the planet is a
// pure function of (radius, seed, preset) — so the other timbers are STAINED,
// on exactly the pattern that stains glass. Bleach oak with bone and it is
// birch; char it with coal and it is dark oak. A stained log still saws into
// four of its own planks, like any log.
const TIMBER_DYE = { birch: 'white', spruce: 'red', acacia: 'orange', dark: 'black' };
LOG_ITEMS.forEach((log, i) => {
  if (!i) return;                                   // oak needs no staining
  const tint = TIMBER_DYE[log.replace('_log', '')];
  // a species with no dye against its name gets no recipe rather than a
  // recipe asking for `dye_undefined`, which would silently be uncraftable
  if (!tint) return;
  const dye = `dye_${tint}`;
  shaped(log, 8, ['LLL', 'LDL', 'LLL'], { L: 'log', D: dye });
  shaped(PLANK_ITEMS[i], 8, ['PPP', 'PDP', 'PPP'], { P: 'plank', D: dye });
  shapeless(PLANK_ITEMS[i], 4, [log]);
});

// --- guns -------------------------------------------------------------------
// Iron for barrels, wood for stocks, silver for the shotgun so the deepest ore
// finally has a second use. Bullets are the running cost.

shaped('bullet', 8, ['I', 'C'], { I: 'iron_ingot', C: 'coal' });
shaped('pistol', 1, ['II', 'P '], { I: 'iron_ingot', P: 'plank' });
shaped('rifle', 1, ['III', 'PS '], { I: 'iron_ingot', P: 'plank', S: 'stick' });
shaped('shotgun', 1, ['AA', 'II', 'PS'],
  { A: 'silver_ingot', I: 'iron_ingot', P: 'plank', S: 'stick' });
// The heavy weapons. A bazooka is a lot of iron tube; the rocket launcher
// buys its magazine with silver. Rockets are dear on purpose — the supply
// crates scattered over the world are the cheaper way to stay fed.
shaped('bazooka', 1, ['III', 'III', 'PS '],
  { I: 'iron_ingot', P: 'plank', S: 'stick' });
shaped('launcher', 1, ['AII', 'AII', 'PS '],
  { A: 'silver_ingot', I: 'iron_ingot', P: 'plank', S: 'stick' });
shaped('rocket', 3, ['I', 'C', 'S'],
  { I: 'iron_ingot', C: 'coal', S: 'stick' });

// Tools: one shape per row, generated for every tier. `M` is the tier's
// material (planks, cobble, ingots, gems), `S` is always a stick.
const TOOL_PATTERNS = {
  pickaxe: ['MMM', ' S ', ' S '],
  axe: ['MM', 'MS', ' S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', ' S', ' S'],
};
const TOOL_PREFIX = {
  [TIER.WOOD]: 'wood', [TIER.STONE]: 'stone',
  [TIER.IRON]: 'iron', [TIER.DIAMOND]: 'diamond',
};
for (const [tier, mat] of Object.entries(TOOL_MATERIAL)) {
  const prefix = TOOL_PREFIX[tier];
  for (const [type, pattern] of Object.entries(TOOL_PATTERNS)) {
    shaped(`${prefix}_${type}`, 1, pattern, { M: mat, S: 'stick' });
  }
}

// --- smelting ---------------------------------------------------------------
// `time` is seconds in a furnace; a fuel unit (see items.fuel) burns one item.

export const SMELTING = {
  raw_iron: { out: 'iron_ingot', count: 1, time: 10 },
  raw_silver: { out: 'silver_ingot', count: 1, time: 12 },
  raw_gold: { out: 'gold_ingot', count: 1, time: 11 },
  // Copper melts at about half iron's temperature and it shows in the times:
  // the first metal you find is also the quickest to smelt. Tin is quicker
  // still in life, but a furnace with one dial cannot say "and it is soft", so
  // tin and zinc sit with the rest.
  raw_copper: { out: 'copper_ingot', count: 1, time: 8 },
  raw_zinc: { out: 'zinc_ingot', count: 1, time: 10 },
  raw_tin: { out: 'tin_ingot', count: 1, time: 10 },
  iron_ore: { out: 'iron_ingot', count: 1, time: 10 },
  silver_ore: { out: 'silver_ingot', count: 1, time: 12 },
  gold_ore: { out: 'gold_ingot', count: 1, time: 11 },
  copper_ore: { out: 'copper_ingot', count: 1, time: 8 },
  zinc_ore: { out: 'zinc_ingot', count: 1, time: 10 },
  tin_ore: { out: 'tin_ingot', count: 1, time: 10 },
  coal_ore: { out: 'coal', count: 1, time: 8 },
  diamond_ore: { out: 'diamond', count: 1, time: 14 },
  sand: { out: 'glass', count: 1, time: 8 },
  // Desert sand is sand: it melts to the same glass. Anything else would mean
  // a player who lives in a dune field cannot make a window out of the only
  // ground they have.
  sand_orange: { out: 'glass', count: 1, time: 8 },
  clay: { out: 'brick', count: 1, time: 8 },
  cobblestone: { out: 'stone', count: 1, time: 8 },
  cobblestone_round: { out: 'stone', count: 1, time: 8 },
  log: { out: 'coal', count: 1, time: 10 },   // charcoal, without a new item
  // cooking. Raw meat is barely worth eating; the furnace nearly triples it,
  // which is what turns a herd into a reason to carry fuel.
  meat_raw: { out: 'meat_cooked', count: 1, time: 12 },
  fish_raw: { out: 'fish_cooked', count: 1, time: 10 },
  // The potato is the only one of the four vegetables the fire is worth
  // lighting for, and it is worth it six times over: raw it is one point of
  // food, baked it is six. That gap is the whole reason the crop is in the
  // game — the other three are eaten as they are pulled.
  potato: { out: 'baked_potato', count: 1, time: 9 },
};

export const smeltResult = (id) => SMELTING[id] ?? null;
export const fuelValue = (id) => getItem(id)?.fuel ?? 0;
export const isFuel = (id) => fuelValue(id) > 0;

// --- matching ---------------------------------------------------------------

// a cell may be null, an id string or a stack object — only the id counts
const idOf = (cell) =>
  (!cell ? null : typeof cell === 'string' ? cell : cell.id);
const normalize = (grid) => {
  const g = new Array(SLOTS).fill(null);
  for (let i = 0; i < SLOTS; i++) g[i] = idOf(grid[i]) || null;
  return g;
};

function matchShaped(r, g) {
  if (!r.h) return false;
  for (let dr = 0; dr + r.h <= GRID; dr++) {
    for (let dc = 0; dc + r.w <= GRID; dc++) {
      let ok = true;
      for (let y = 0; y < GRID && ok; y++) {
        for (let x = 0; x < GRID && ok; x++) {
          const inside = y >= dr && y < dr + r.h && x >= dc && x < dc + r.w;
          const ch = inside ? r.rows[y - dr][x - dc] : ' ';
          const want = ch === ' ' ? null : r.key[ch];
          if (g[y * GRID + x] !== (want ?? null)) ok = false;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

function matchShapeless(r, g) {
  const have = g.filter(Boolean).sort();
  if (have.length !== r.need.length) return false;
  return have.every((id, i) => id === r.need[i]);
}

// match(grid) -> { id, item, count, recipe } or null.
export function match(grid) {
  const g = normalize(grid);
  if (!g.some(Boolean)) return null;
  for (const r of RECIPES) {
    const hit = r.kind === 'shaped' ? matchShaped(r, g) : matchShapeless(r, g);
    if (!hit) continue;
    return { id: r.out, item: ITEMS[r.out] ?? null, count: r.count, recipe: r };
  }
  return null;
}

// One craft consumes exactly one item from every occupied cell. Returns a new
// array of stacks (or nulls) — the caller decides whether to commit it.
//
// A CONTAINER is the exception, and it is the only one: an item with a
// `returns` is a thing carried in something, and what the recipe wanted was
// the thing. So the last one out of the cell leaves the empty behind rather
// than the cell going null — which is how a cake costs a bucket of milk and
// not a bucket. `returns` is already on milk_bucket for eating (items.js), so
// this is the same fact read by a second door and not a new rule.
//
// Only on the last one, because a full pail stacks to one: there is never a
// cell holding two of them for the empties to have to go somewhere else.
export function consume(grid) {
  return grid.map((cell) => {
    if (!cell) return null;
    if (typeof cell === 'string') return null;
    const left = (cell.count ?? 1) - 1;
    if (left > 0) return { ...cell, count: left };
    const back = ITEMS[cell.id]?.returns;
    return back ? { id: back, count: 1 } : null;
  });
}

// How many times this grid can be crafted without refilling.
export function maxCrafts(grid) {
  let n = Infinity;
  for (const cell of grid) {
    if (!cell) continue;
    n = Math.min(n, typeof cell === 'string' ? 1 : (cell.count ?? 1));
  }
  return Number.isFinite(n) ? n : 0;
}

// --- listing (for the crafting UI) ------------------------------------------

// A canonical 3x3 layout for every recipe, so the UI can draw it and offer a
// one-click "lay this out for me".
export function recipeLayout(r) {
  const g = new Array(SLOTS).fill(null);
  if (r.kind === 'shaped') {
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const ch = r.rows[y][x];
        if (ch !== ' ') g[y * GRID + x] = r.key[ch];
      }
    }
  } else {
    r.need.forEach((id, i) => { g[i] = id; });
  }
  return g;
}

// Flat ingredient tally, e.g. [{ id: 'plank', count: 3 }, ...].
export function recipeCost(r) {
  const tally = new Map();
  for (const id of recipeLayout(r)) {
    if (id) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  return [...tally].map(([id, count]) => ({ id, count }));
}

export function listRecipes() {
  return RECIPES.map((r, i) => ({
    index: i,
    kind: r.kind,
    out: r.out,
    name: ITEMS[r.out]?.name ?? r.out,
    count: r.count,
    layout: recipeLayout(r),
    cost: recipeCost(r),
    recipe: r,
  }));
}

export function listSmelting() {
  return Object.entries(SMELTING).map(([id, s]) => ({
    in: id, out: s.out, count: s.count, time: s.time,
    name: ITEMS[s.out]?.name ?? s.out,
  }));
}

// recipes that produce a given item — used by the UI's search box
export const recipesFor = (id) => listRecipes().filter((r) => r.out === id);
