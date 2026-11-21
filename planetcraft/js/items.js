// items.js — the item registry: everything that can sit in a slot.
//
// Blocks and items are deliberately different things. A block is a cell value
// in the world; an item is what you hold. Some items place a block, most do
// not (an ingot, a pickaxe), and some blocks drop a *different* item when
// mined (stone drops cobble). Keeping the two apart is what lets mining feed
// crafting instead of just handing the block straight back.
//
// This module is pure data + lookups, so it can be unit-tested under node.

import { TILE } from './textures.js';
import { BLOCK } from './cubesphere.js';
// Namespace import for everything the world module may or may not export yet:
// a *named* import of a missing export is a link-time error that would take
// the whole game down, so optional helpers are read off the namespace instead.
import * as CS from './cubesphere.js';

// First tile that exists, falling back to a stick so a texture that has not
// landed yet degrades to a placeholder instead of painting tile `undefined`.
const T = (...names) => {
  for (const n of names) if (Number.isInteger(TILE[n])) return TILE[n];
  return TILE.STICK;
};

// what a block is made of — tools are effective on classes, not on blocks
export const CLASS = {
  ROCK: 'rock',
  SOIL: 'soil',
  WOOD: 'wood',
  PLANT: 'plant',
  GLASS: 'glass',
  LIQUID: 'liquid',
  OTHER: 'other',
};

// harvest tiers. 0 is bare hands, so a plain `>=` compares tools and blocks.
export const TIER = { HAND: 0, WOOD: 1, STONE: 2, IRON: 3, DIAMOND: 4 };
export const TIER_NAME = ['hand', 'wooden', 'stone', 'iron', 'diamond'];

export const TOOL = {
  PICKAXE: 'pickaxe',
  AXE: 'axe',
  SHOVEL: 'shovel',
  SWORD: 'sword',
  HOE: 'hoe',
  // Armour is not a tool, but it wears out like one, and every piece of
  // machinery for that — `stack.dur`, the bar in craftui.js, the fresh
  // durability Inventory.newStack hands out — reads `item.tool`. So a helmet
  // carries a tool block with no classes in it, exactly as the clubs and
  // spears down in weapon() do. See the armour section below.
  ARMOUR: 'armour',
  // Shears are a tool in every mechanical sense — they wear out, they have a
  // tier — and they cut exactly one thing that is not a block: a sheep. The
  // shearing lives in main.js; this is only what makes the durability bar,
  // the repair recipe and the hotbar treat them like the other tools.
  SHEARS: 'shears',
};

// --- item registry ----------------------------------------------------------

export const ITEMS = {};

function def(o) {
  // stack 64 unless said otherwise; tools never stack (they carry damage)
  const item = { stack: o.tool ? 1 : 64, block: null, ...o };
  ITEMS[item.id] = item;
  return item;
}

// Block items. `BLOCK.X ?? null` on purpose: blocks such as GLASS or FURNACE
// may not exist in cubesphere.js yet. The item, its texture and its recipes
// still work; only placing it is a no-op until the block id appears.
const B = (id, name, tile, key) =>
  def({ id, name, tile, block: BLOCK[key] ?? null });

B('grass', 'grass block', TILE.GRASS_TOP, 'GRASS');
B('dirt', 'soil', TILE.DIRT, 'DIRT');
B('stone', 'rock', TILE.STONE, 'STONE');
// THE NAME MOVED. What this game called "cobblestone" is squared masonry in
// mortar — cobble BRICK, and it answers to that now. The id stays, because
// every saved world, recipe and village shelf holds stacks of it; only the
// label was wrong. True cobblestone — the light-grey rounds — is the family
// under it, and it is what a mined rock actually breaks into.
B('cobblestone', 'cobble brick', TILE.COBBLE, 'COBBLE');
B('cobblestone_round', 'cobblestone', TILE.COBBLESTONE, 'COBBLESTONE');
B('cobblestone_mossy', 'mossy cobblestone', TILE.COBBLESTONE_MOSSY,
  'COBBLESTONE_MOSSY');
B('cobblestone_dark', 'dark cobblestone', TILE.COBBLESTONE_DARK,
  'COBBLESTONE_DARK');
B('sand', 'sand', TILE.SAND, 'SAND');
B('sand_orange', 'desert sand', TILE.SAND_ORANGE, 'SAND_ORANGE');
B('log', 'wood log', TILE.LOG_SIDE, 'LOG');
B('plank', 'planks', TILE.PLANK, 'PLANK');
B('leaves', 'leaves', TILE.LEAF, 'LEAF');
B('coal_ore', 'coal ore', TILE.COAL, 'COAL');
B('iron_ore', 'iron ore', TILE.IRON, 'IRON');
B('silver_ore', 'silver ore', TILE.SILVER, 'SILVER');
B('diamond_ore', 'diamond ore', TILE.DIAMOND, 'DIAMOND');
B('glass', 'glass', TILE.GLASS, 'GLASS');
B('brick', 'bricks', TILE.BRICK, 'BRICK');
B('thatch', 'thatch', TILE.THATCH, 'THATCH');
B('tilled', 'tilled soil', TILE.TILLED, 'TILLED');
B('path', 'path', TILE.PATH, 'PATH');
B('furnace', 'furnace', TILE.FURNACE_FRONT, 'FURNACE');
B('crafting_table', 'crafting table', TILE.CRAFT_TOP, 'CRAFTING_TABLE');
B('gravel', 'gravel', TILE.GRAVEL, 'GRAVEL');
B('snow', 'snow', TILE.SNOW, 'SNOW');
B('clay', 'clay', TILE.CLAY, 'CLAY');
B('ice', 'ice', TILE.ICE, 'ICE');
B('chest', 'chest', TILE.CHEST, 'CHEST');
B('torch', 'torch', TILE.TORCH, 'TORCH');
B('farmland', 'farmland', T('FARMLAND', 'TILLED'), 'FARMLAND');
B('fence', 'fence', T('FENCE_ITEM', 'FENCE', 'PLANK'), 'FENCE');
B('gate', 'fence gate', T('GATE_ITEM', 'GATE', 'PLANK'), 'GATE');
B('lantern', 'lantern', T('LANTERN', 'TORCH'), 'LANTERN');
B('stripped_log', 'stripped log', T('STRIPPED_LOG', 'LOG_SIDE'), 'STRIPPED_LOG');

// --- gold, and the metals worth pressing into a block -----------------------
// A storage block is nine ingots or nine gems in one cell. It mines back as
// ITSELF and uncrafts into the nine on the bench, which is the Minecraft
// round trip and the only one that survives a full bag: you carry the block
// home, not the pile.
B('gold_ore', 'gold ore', T('GOLD', 'IRON'), 'GOLD');
B('iron_block', 'block of iron', T('BLOCK_IRON', 'IRON_INGOT'), 'BLOCK_IRON');
B('gold_block', 'block of gold', T('BLOCK_GOLD', 'GOLD_INGOT'), 'BLOCK_GOLD');
B('diamond_block', 'block of diamond',
  T('BLOCK_DIAMOND', 'DIAMOND_GEM'), 'BLOCK_DIAMOND');
B('brass_block', 'block of brass',
  T('BLOCK_BRASS', 'BRASS_INGOT'), 'BLOCK_BRASS');

// --- copper, zinc and tin ----------------------------------------------------
// The three ores the real alloys are made of. Copper is the only metal a
// WOODEN pick will lift, which is what makes it the first one you own; zinc
// and tin need stone, exactly as iron and gold do.
B('copper_ore', 'copper ore', T('COPPER', 'IRON'), 'COPPER');
B('zinc_ore', 'zinc ore', T('ZINC', 'SILVER'), 'ZINC');
B('tin_ore', 'tin ore', T('TIN', 'SILVER'), 'TIN');
B('copper_block', 'block of copper',
  T('BLOCK_COPPER', 'COPPER_INGOT'), 'BLOCK_COPPER');
B('bronze_block', 'block of bronze',
  T('BLOCK_BRONZE', 'BRONZE_INGOT'), 'BLOCK_BRONZE');
B('zinc_block', 'block of zinc', T('BLOCK_ZINC', 'ZINC_INGOT'), 'BLOCK_ZINC');
B('tin_block', 'block of tin', T('BLOCK_TIN', 'TIN_INGOT'), 'BLOCK_TIN');
// Silver was the one metal you could mine by the stackful and not press into
// anything, which is the exact problem a storage block exists to solve.
B('silver_block', 'block of silver',
  T('BLOCK_SILVER', 'SILVER_INGOT'), 'BLOCK_SILVER');

// A POST: a fence's centre post without its rails, so it is a tenth of a cell
// wide and stacks into a mast. Village lamp posts stand on these — a lamp on a
// column of full blocks is a lamp on top of a wall.
B('post', 'wooden post', T('POST', 'LOG_SIDE'), 'POST');

// --- glass: eight tints, and a pane of every one ----------------------------
// The tint order is cubesphere's GLASS_TINTS. The block ids, the atlas tiles
// and these item ids are all indexed by it, so a colour cannot come to mean
// two different things in two files.
export const TINT_NAMES = CS.GLASS_TINTS ?? [];
export const GLASS_ITEMS = [];        // the full blocks, tinted only
export const PANE_ITEMS = ['glass_pane'];   // clear first, then the tints

// A pane is a sheet through the middle of its cell rather than a cube: a
// one-block gap in a wall glazed with one of these reads as a window instead
// of as a glass brick, which is the whole reason it exists.
def({
  id: 'glass_pane', name: 'glass pane', tile: TILE.GLASS,
  block: CS.paneId ? CS.paneId(-1) : null,
});
TINT_NAMES.forEach((tint, i) => {
  const tile = T(`GLASS_${tint.toUpperCase()}`, 'GLASS');
  GLASS_ITEMS.push(`glass_${tint}`);
  PANE_ITEMS.push(`pane_${tint}`);
  def({
    id: `glass_${tint}`, name: `${tint} glass`, tile, tint: i,
    block: CS.tintedGlassId ? CS.tintedGlassId(i) : null,
  });
  def({
    id: `pane_${tint}`, name: `${tint} glass pane`, tile, tint: i,
    block: CS.paneId ? CS.paneId(i) : null,
  });
});

// --- cement ------------------------------------------------------------------
// Eight colours, off the SAME list the glass uses, so a red wall and the red
// window in it are one colour decided once. Unlike the glass it is a plain
// opaque cube — the appeal is a solid field of colour with no grain in it, and
// it is the only building material in the game that has none.
export const CEMENT_ITEMS = [];
const CEMENT_GREYS = [
  ['cement_grey_light', 'light grey cement', 'CEMENT_GREY_LIGHT'],
  ['cement_grey', 'grey cement', 'CEMENT_GREY'],
  ['cement_grey_dark', 'dark grey cement', 'CEMENT_GREY_DARK'],
];
TINT_NAMES.forEach((tint, i) => {
  CEMENT_ITEMS.push(`cement_${tint}`);
  def({
    id: `cement_${tint}`, name: `${tint} cement`,
    tile: T(`CEMENT_${tint.toUpperCase()}`, 'STONE'), tint: i,
    block: CS.cementId ? CS.cementId(i) : null,
  });
});
// ...and the greys between the family's white and black — what the city's
// towers are actually poured in, and now yours to build with too
CEMENT_GREYS.forEach(([id, name, tile], i) => {
  def({
    id, name, tile: T(tile, 'STONE'),
    block: CS.cementGreyId ? CS.cementGreyId(i) : null,
  });
});

// --- wool, and the bed --------------------------------------------------------
// Ten fleeces. The first eight are the dye colours, in the dyes' order, so a
// red bed and a red window are the same red; the last two are brown and grey,
// which no bottle of dye produces and only a sheep does.
//
// That split is the point of the family. You get white, brown, grey and black
// by keeping sheep, and the other six by putting a dye to a fleece — so a
// brown bed says something about how you played that a blue one cannot.
export const WOOL_NAMES = CS.WOOL_COLOURS ?? [];
export const WOOL_ITEMS = [];
export const BED_ITEMS = [];
WOOL_NAMES.forEach((c, i) => {
  WOOL_ITEMS.push(`wool_${c}`);
  BED_ITEMS.push(`bed_${c}`);
  def({
    id: `wool_${c}`, name: `${c} wool`,
    tile: T(`WOOL_${c.toUpperCase()}`, 'THATCH'), tint: i,
    block: CS.woolId ? CS.woolId(i) : null,
  });
  def({
    id: `bed_${c}`, name: `${c} bed`,
    tile: T(`BED_${c.toUpperCase()}`, 'PLANK'), tint: i, stack: 1,
    // A bed carries a facing in its block id, exactly as a stair does, and
    // exactly as a stair the ITEM has none: placedBlock turns the item into
    // the id for the way you were looking. See below.
    block: CS.bedId ? CS.bedId(i, 0) : null,
    bed: i,
  });
});

// Shears. The one tool that takes a fleece off a live sheep and leaves the
// sheep — everything else in this game that gets you wool involves killing the
// animal, and a flock you can keep is worth more than a flock you eat.
def({
  id: 'shears', name: 'shears', tile: T('SHEARS', 'IRON_INGOT'),
  // The same `tool` block every pickaxe in this file carries, so the shears
  // wear out, draw a durability bar and break through machinery that already
  // exists. The classes list is PLANT and nothing else: shears cut wool and
  // leaves, they are not a secret axe.
  tool: {
    type: TOOL.SHEARS, tier: TIER.IRON, speed: 4, classes: [CLASS.PLANT],
    durability: 240, damage: 1,
  },
});

// --- money --------------------------------------------------------------------
// A gold coin. Gold had exactly one use before this — alloying into brass —
// and a metal you dig for and cannot spend is a metal nobody digs for. Nine
// coins to the ingot and nine back, the same round trip every storage block in
// this file makes, so a purse and a bar are the same wealth in two shapes.
def({
  id: 'coin', name: 'gold coin', tile: T('COIN', 'GOLD_INGOT'), stack: 64,
  // What one coin is worth to a shop. Everything priced in items.js's `worth`
  // is priced in these.
  coin: true,
});

// THE MINT: the machine coin is struck at, and the one building fitting every
// settlement on the planet has. It stands in the shop, because the shop is
// where a village's money already is — see `shop` in village.js — and a
// villager set to `make materials` works it exactly as they work a bench.
//
// It makes NOTHING FROM NOTHING. Nine coins out of one gold ingot, which is
// the player's own recipe up in crafting.js and the same nine that melt back
// into a bar; the press only saves somebody standing at a bench. A machine
// that minted coin out of air would break the one number the whole game is
// scored on.
B('mint', 'mint', T('MINT', 'BLOCK_IRON', 'IRON_INGOT'), 'MINT');

// --- books --------------------------------------------------------------------
// Wheat was worth exactly one thing — bread — and every field grew more of it
// than anyone could eat. Pulped it is paper, and paper bound in leather is a
// book: which is what a bookshelf is made of, and what village libraries are
// built out of.
def({ id: 'paper', name: 'paper', tile: T('PAPER', 'SEEDS') });
def({ id: 'book', name: 'book', tile: T('BOOK', 'PAPER', 'BREAD'), stack: 16 });
B('bookshelf', 'bookshelf', T('BOOKSHELF', 'PLANK'), 'BOOKSHELF');
// A reading desk. Furniture, like the table and the chair — see FURN_LECTERN
// in cubemesher.js — and it wears the bookshelf's own tile for the book on it,
// so it costs no texture of its own.
B('lectern', 'reading desk', T('LECTERN', 'BOOKSHELF', 'PLANK'), 'LECTERN');

// --- doors --------------------------------------------------------------------
// Seven leaves, off cubesphere's DOOR_TYPES: the five timbers, then iron and
// glass. One ITEM per leaf and thirty-two block ids behind it — the facing and
// the open/shut state live in the block, never in the thing you hold, exactly
// as they do for a stair. See placedBlock below.
//
// The item icon is the leaf's LOWER half, which is the half with the handle on
// it: at 32 pixels in a hotbar a panel with a lever reads as a door, and half
// of one drawn twice as small does not.
export const DOOR_NAMES = CS.DOOR_TYPES ?? [];
export const DOOR_ITEMS = [];
const doorIdOf = CS.doorBlockId ?? (() => null);
// `dark` is dark oak everywhere it is shown; SPECIES_LABEL below says the same
// thing for the timbers, and it is declared after this block
const DOOR_LABEL = { dark: 'dark oak' };
DOOR_NAMES.forEach((type, i) => {
  const label = DOOR_LABEL[type] ?? type;
  DOOR_ITEMS.push(`${type}_door`);
  def({
    id: `${type}_door`, name: `${label} door`,
    tile: T(`DOOR_${type.toUpperCase()}_BOT`, 'PLANK'),
    block: doorIdOf(i, 0, false), door: i,
  });
});

// The bell: bronze on a headstock between two posts. It has no state — ringing
// it is main.js's to do, and nothing here knows how.
B('bell', 'bell', T('BELL', 'BLOCK_BRONZE', 'IRON_INGOT'), 'BELL');

// --- the four timbers after oak ---------------------------------------------
// Oak is `log` and `plank` and always was; these are the rest. Nothing GROWS
// them — a species in the generator would change what a seed means, and the
// planet is a pure function of (radius, seed, preset) — so they come off the
// bench instead. Oak is STAINED into the other four, on the same pattern that
// stains glass (crafting.js), and a stained log then saws into four of its own
// planks like any log.
const SPECIES_LABEL = { dark: 'dark oak' };
export const LOG_ITEMS = ['log'];
export const PLANK_ITEMS = ['plank'];
(CS.WOOD_SPECIES ?? ['oak']).slice(1).forEach((sp, i) => {
  const U = sp.toUpperCase(), label = SPECIES_LABEL[sp] ?? sp;
  LOG_ITEMS.push(`${sp}_log`);
  PLANK_ITEMS.push(`${sp}_plank`);
  def({
    id: `${sp}_log`, name: `${label} log`, fuel: 1.5,
    tile: T(`LOG_SIDE_${U}`, 'LOG_SIDE'),
    block: CS.logId ? CS.logId(i + 1) : null,
  });
  def({
    id: `${sp}_plank`, name: `${label} planks`, fuel: 1.5,
    tile: T(`PLANK_${U}`, 'PLANK'),
    block: CS.plankId ? CS.plankId(i + 1) : null,
  });
});

// Furniture. Box-union shapes (see cubemesher.js FURNITURE) wearing existing
// materials, so their icons borrow the tile they are mostly made of until a
// dedicated one is painted. The chair is oriented — see placedBlock below.
B('table', 'table', T('TABLE', 'PLANK'), 'TABLE');
B('lamp', 'lamp', T('LAMP', 'TORCH'), 'LAMP');
B('street_lamp', 'street lamp', T('STREET_LAMP', 'TORCH'), 'STREET_LAMP');
B('campfire', 'campfire', T('CAMPFIRE', 'LOG_SIDE'), 'CAMPFIRE');

// Plants. They are cross-planes in the world but ordinary items in a slot.
B('flower_red', 'red flower', T('FLOWER_RED', 'TUFT'), 'FLOWER_RED');
B('flower_yellow', 'yellow flower', T('FLOWER_YELLOW', 'TUFT'), 'FLOWER_YELLOW');
B('flower_blue', 'blue flower', T('FLOWER_BLUE', 'TUFT'), 'FLOWER_BLUE');
B('mushroom', 'mushroom', T('MUSHROOM', 'TUFT'), 'MUSHROOM');
B('sapling', 'sapling', T('SAPLING', 'LEAF'), 'SAPLING');
// mushrooms are a nibble, not a meal — the point is that they are free
ITEMS.mushroom.food = 1;
ITEMS.mushroom.sat = 0.6;

// Materials. `fuel` counts how many items one unit smelts, so the furnace
// never has to know about individual items.
// --- the trade goods ---------------------------------------------------------
//
// One export per world, and the only reason to carry anything home from
// another planet. Nothing crafts them and nothing smelts them: they are made
// where they are made, and the way you get one is to go there. That is the
// whole design — a good you cannot manufacture is a good that has to be
// FETCHED, and fetching is what a solar system is for.
//
// `trade` is the culture that makes it, keyed by preset id, and TRADE_GOODS
// below is the index the world generator reads to stock a village.
const TRADE = (id, name, tile, preset, worth) =>
  def({ id, name, tile, trade: preset, worth, stack: 16 });

TRADE('pitch', 'pot of pitch', TILE.PITCH, 'coal', 6);
TRADE('brass_gear', 'cast gear', TILE.BRASS_GEAR, 'iron', 9);
TRADE('sea_salt', 'sea salt', TILE.SEA_SALT, 'ocean', 5);
TRADE('tea_brick', 'brick of tea', TILE.TEA_BRICK, 'ice', 7);
TRADE('saffron', 'saffron', TILE.SAFFRON, 'storm', 12);
TRADE('obsidian_shard', 'obsidian shard', TILE.OBSIDIAN, 'volcanic', 8);
TRADE('honeycomb', 'honeycomb', TILE.HONEYCOMB, 'terran', 4);

// Which world makes which, by preset id. Read by village.js to stock the
// shop and the house chests, and by the ruins pass to decide what a fallen
// building of that culture still has in it.
export const TRADE_GOODS = {};
for (const it of Object.values(ITEMS)) if (it.trade) TRADE_GOODS[it.trade] = it.id;

// Honeycomb is food as well as cargo — it is the one export you can eat, and
// on a long trip that matters more than what it is worth.
ITEMS.honeycomb.food = 4;
ITEMS.honeycomb.sat = 3;

def({ id: 'coal', name: 'coal lump', tile: TILE.COAL_LUMP, fuel: 8 });
def({ id: 'raw_iron', name: 'iron ore chunk', tile: TILE.RAW_IRON });
def({ id: 'raw_silver', name: 'silver ore chunk', tile: TILE.RAW_SILVER });
def({ id: 'raw_gold', name: 'gold ore chunk', tile: T('RAW_GOLD', 'RAW_IRON') });
def({ id: 'iron_ingot', name: 'iron ingot', tile: TILE.IRON_INGOT });
def({ id: 'silver_ingot', name: 'silver ingot', tile: TILE.SILVER_INGOT });
def({ id: 'gold_ingot', name: 'gold ingot',
  tile: T('GOLD_INGOT', 'IRON_INGOT') });
// The three metals the alloys are actually made of, and the two alloys.
// Brass used to be a gold ingot beaten into an iron one, which was a stand-in
// from before copper existed; it is copper and zinc now, bronze is copper and
// tin, and gold is back to being gold. `brass_ingot` keeps its id, so every
// brass tool and the block of brass carry straight over — only the way you
// come by the metal has changed.
def({ id: 'raw_copper', name: 'copper ore chunk',
  tile: T('RAW_COPPER', 'RAW_IRON') });
def({ id: 'raw_zinc', name: 'zinc ore chunk',
  tile: T('RAW_ZINC', 'RAW_SILVER') });
def({ id: 'raw_tin', name: 'tin ore chunk', tile: T('RAW_TIN', 'RAW_SILVER') });
def({ id: 'copper_ingot', name: 'copper ingot',
  tile: T('COPPER_INGOT', 'IRON_INGOT') });
def({ id: 'zinc_ingot', name: 'zinc ingot',
  tile: T('ZINC_INGOT', 'SILVER_INGOT') });
def({ id: 'tin_ingot', name: 'tin ingot',
  tile: T('TIN_INGOT', 'SILVER_INGOT') });
def({ id: 'brass_ingot', name: 'brass ingot',
  tile: T('BRASS_INGOT', 'IRON_INGOT') });
def({ id: 'bronze_ingot', name: 'bronze ingot',
  tile: T('BRONZE_INGOT', 'IRON_INGOT') });
def({ id: 'diamond', name: 'diamond gem', tile: TILE.DIAMOND_GEM });
def({ id: 'stick', name: 'stick', tile: TILE.STICK, fuel: 0.5 });
def({ id: 'flint', name: 'flint', tile: TILE.FLINT });
def({ id: 'seeds', name: 'seeds', tile: TILE.SEEDS });
def({ id: 'wheat', name: 'wheat', tile: TILE.WHEAT });

// Food. `food` is hunger points restored, `sat` is saturation — the buffer
// that is spent before the hunger bar itself moves, which is what makes
// cooked meat worth the fuel even though bread refills nearly as much.
def({ id: 'bread', name: 'bread', tile: TILE.BREAD, food: 5, sat: 6,
  stack: 16 });
def({ id: 'apple', name: 'apple', tile: TILE.APPLE, food: 4, sat: 2.4,
  stack: 16 });
def({ id: 'silver_apple', name: 'silver apple', tile: TILE.APPLE, food: 10,
  sat: 12, stack: 8 });
// The golden apple: eight ingots of gold beaten round one apple, and the best
// thing in the game to eat. It fills the bar and the saturation buffer behind
// it outright, and it carries three flags on top of that:
//
//   always   already read by inventory.js's Hunger.canEat — this is the one
//            food you may eat on a full stomach, which is what makes it worth
//            carrying for the effects rather than for the hunger
//   heal     hearts back immediately, on the spot
//   regen    { points, seconds } — hearts back over time after that
//   absorb   temporary hearts ABOVE the maximum, which fade
//
// Only `food`, `sat` and `always` do anything today; the other three are
// numbers waiting for the call site that applies them. Nothing in the game
// calls Hunger.eat yet, so this is the item's half of the contract and the
// rest is main.js's.
def({ id: 'golden_apple', name: 'golden apple',
  tile: T('GOLDEN_APPLE', 'APPLE'), food: 20, sat: 20, stack: 8,
  always: true, heal: 4, absorb: 4, regen: { points: 4, seconds: 8 } });
def({ id: 'meat_raw', name: 'raw meat', tile: T('MEAT_RAW', 'APPLE'),
  food: 3, sat: 1.8, stack: 16 });
def({ id: 'meat_cooked', name: 'cooked meat', tile: T('MEAT_COOKED', 'BREAD'),
  food: 8, sat: 12.8, stack: 16 });
// Fish. Raw is barely worth eating and cooked is a proper meal, the same
// bargain raw meat strikes — which is what makes fuel worth carrying.
def({ id: 'fish_raw', name: 'raw fish', tile: T('MEAT_RAW', 'APPLE'),
  food: 2, sat: 1.2, stack: 16 });
def({ id: 'fish_cooked', name: 'cooked fish', tile: T('MEAT_COOKED', 'BREAD'),
  food: 6, sat: 9.6, stack: 16 });

// --- the kitchen garden -------------------------------------------------------
//
// Wheat grew and nothing else did, and wheat is worth exactly one thing: a
// loaf. These four are vegetables you eat as they come out of the ground.
//
// EVERY ONE OF THEM PLANTS ITSELF. There is no carrot seed and no lettuce
// seed: you put a carrot in the soil and pull three out, which is Minecraft's
// rule for its roots and tubers and it is the right one — a seed item per crop
// would be four more ids, four more icons and four more recipes to teach, for
// exactly the same loop. It also makes the payoff legible without a wiki: what
// you planted is what you count when you harvest.
//
// Salad is a leaf and fills you least; the potato is the filling one but only
// once it has been near a fire — raw it is barely a mouthful, baked it is the
// best thing a field grows. Pepper sits between them. See CROPS at the foot of
// this file for how long each takes and dropsFor for what a bed pays out.
def({ id: 'carrot', name: 'carrot', tile: T('CARROT', 'SEEDS'),
  food: 3, sat: 3.6, stack: 32 });
def({ id: 'potato', name: 'potato', tile: T('POTATO', 'CLAY'),
  food: 1, sat: 0.6, stack: 32 });
def({ id: 'baked_potato', name: 'baked potato',
  tile: T('POTATO_BAKED', 'POTATO', 'BREAD'), food: 6, sat: 7.2, stack: 16 });
def({ id: 'pepper', name: 'pepper', tile: T('PEPPER', 'APPLE'),
  food: 3, sat: 2.4, stack: 32 });
def({ id: 'salad', name: 'salad', tile: T('SALAD', 'LEAF'),
  food: 2, sat: 1.2, stack: 32 });
// The two gourds, on the same rule as the four above: each plants itself, and
// each is the whole payout of its own bed. They are the slow half of the
// garden — a pumpkin takes nearly twice a salad's time — and what they buy for
// the wait is bulk: a pumpkin is the most filling thing a field grows without
// a fire under it, and a melon is the one you eat by the armful because each
// slice is barely a mouthful. They are also the only two crops the WORLD grows
// on its own (see scatterGourds in cubesphere.js), which is why a wild patch
// of either is worth walking to.
def({ id: 'pumpkin', name: 'pumpkin', tile: T('PUMPKIN', 'POTATO'),
  food: 4, sat: 4.8, stack: 16 });
def({ id: 'watermelon', name: 'watermelon', tile: T('WATERMELON', 'APPLE'),
  food: 2, sat: 1.2, stack: 32 });

// --- bamboo -------------------------------------------------------------------
//
// A cane, and the only thing in this game you can turn into sticks without
// owning an axe: it grows in the tropics at sea level, a hand takes it down,
// and two of them are a stick. That is what makes a grove worth crossing a
// world for early — everything a bench asks for begins with a stick, and until
// bamboo the only road to one went through a tree.
//
// It also burns, badly, which is exactly what a cane does: a quarter of a
// stick's worth, so a grove is fuel you can carry but never fuel you would
// choose.
B('bamboo', 'bamboo', T('BAMBOO_CANE', 'BAMBOO', 'STICK'), 'BAMBOO');
ITEMS.bamboo.fuel = 0.25;

// --- what a kitchen makes -----------------------------------------------------
//
// The two dishes that are not one thing cooked but several things put
// together, which is the whole difference between a furnace and a bench. A
// furnace can only ever hand back a better version of what went in; a kitchen
// is where the field, the herd and the hive meet.
//
// The cake fills you further than anything short of the golden apple and it
// does NOT keep you full — that is what the low saturation says, and it is the
// honest thing for a cake to say. The stew is the other way round: it sits
// where cooked meat sits, and its point is that it is made mostly of the
// potato, which is the one crop nobody wants to eat as it comes out of the
// ground.
def({ id: 'cake', name: 'cake', tile: T('CAKE', 'BREAD'),
  food: 12, sat: 7.2, stack: 4 });
def({ id: 'potato_stew', name: 'potato stew',
  tile: T('POTATO_STEW', 'POTATO_BAKED', 'BREAD'),
  food: 8, sat: 12, stack: 8 });

// --- buckets ------------------------------------------------------------------
//
// A pail and the three things you can carry in one. The BEHAVIOUR — scooping,
// pouring, drinking — belongs to main.js; what lives here is the table it acts
// on, so no other file has to hard-code which item becomes which:
//
//   bucket.fills   on the empty pail: fluid name -> the item you end up with
//   bucket.fluid   on a full one: what is in it
//   bucket.empty   on a full one: what you are left holding once it is out
//   bucket.places  the BLOCK a full one pours into a cell, or null for milk,
//                  which is not a fluid you can put down — you drink it
//
// The empty bucket stacks to sixteen and a full one does not. Sixteen because
// an empty pail is a pail and you may want a few, and not sixty-four because
// each one is three iron: a full stack would be a hundred and ninety-two
// ingots sitting in one slot. A full one stacks to ONE because it is carrying
// something — sixteen buckets of water in a slot is sixteen lakes in a slot,
// and the moment two of them stack there is no way to pour just the one.
def({
  id: 'bucket', name: 'bucket', tile: T('BUCKET', 'IRON_INGOT'), stack: 16,
  bucket: {
    fills: { water: 'water_bucket', lava: 'lava_bucket', milk: 'milk_bucket' },
  },
});
def({
  id: 'water_bucket', name: 'bucket of water',
  tile: T('BUCKET_WATER', 'BUCKET', 'WATER'), stack: 1,
  bucket: { fluid: 'water', empty: 'bucket', places: BLOCK.WATER ?? null },
});
def({
  id: 'lava_bucket', name: 'bucket of lava',
  tile: T('BUCKET_LAVA', 'BUCKET', 'LAVA'), stack: 1,
  bucket: { fluid: 'lava', empty: 'bucket', places: BLOCK.LAVA ?? null },
});
// Milk is the one that gives the bucket a reason to exist before you own a
// lake: you get it off a cow and you drink it. `returns` is read by
// Inventory.eatSelected — eating this hands the empty pail back rather than
// swallowing three iron ingots with the milk.
def({
  id: 'milk_bucket', name: 'bucket of milk',
  tile: T('BUCKET_MILK', 'BUCKET'), stack: 1,
  food: 3, sat: 3.6, returns: 'bucket',
  bucket: { fluid: 'milk', empty: 'bucket', places: null, drink: true },
});

export const bucketOf = (id) => getItem(id)?.bucket ?? null;
// what an empty bucket becomes when it is dipped in `fluid`, or null
export const bucketFill = (id, fluid) => bucketOf(id)?.fills?.[fluid] ?? null;
// ...and what a full one leaves you holding once it is empty, or null
export const bucketEmpty = (id) => bucketOf(id)?.empty ?? null;

// Animal drops. entities.js hands these out; they only need to exist here so
// the ids resolve to a name and a tile the moment an animal dies.
def({ id: 'leather', name: 'leather', tile: T('LEATHER', 'DIRT') });
def({ id: 'feather', name: 'feather', tile: T('FEATHER', 'STICK') });
def({ id: 'bone', name: 'bone', tile: T('BONE', 'STICK') });
// ground bone: a right-click on anything planted and it comes on at once —
// a crop a stage, a sapling straight to its tree, a cane a cell
def({ id: 'bone_meal', name: 'bone meal', tile: T('BONE_MEAL', 'BONE') });

// Dyes. Eight of them now, and no longer inert: one dye stains eight blocks
// of glass, which is what the whole family was waiting for. Three come
// straight off a flower, two off the ground (bone, coal) and three are the
// secondaries — mix two primaries on the bench.
// `dye` is the tint index, in the one order this whole game keeps colours in.
// It is what lets a dye be pointed at a live sheep without main.js keeping a
// second table of which bottle means which colour.
def({ id: 'dye_white', name: 'white dye', tile: T('DYE_WHITE', 'BONE', 'SEEDS'),
  dye: 0 });
def({ id: 'dye_red', name: 'red dye',
  tile: T('DYE_RED', 'FLOWER_RED', 'SEEDS'), dye: 1 });
def({ id: 'dye_orange', name: 'orange dye',
  tile: T('DYE_ORANGE', 'FLOWER_YELLOW', 'SEEDS'), dye: 2 });
def({ id: 'dye_yellow', name: 'yellow dye',
  tile: T('DYE_YELLOW', 'FLOWER_YELLOW', 'SEEDS'), dye: 3 });
def({ id: 'dye_green', name: 'green dye',
  tile: T('DYE_GREEN', 'LEAF', 'SEEDS'), dye: 4 });
def({ id: 'dye_blue', name: 'blue dye',
  tile: T('DYE_BLUE', 'FLOWER_BLUE', 'SEEDS'), dye: 5 });
def({ id: 'dye_purple', name: 'purple dye',
  tile: T('DYE_PURPLE', 'FLOWER_BLUE', 'SEEDS'), dye: 6 });
def({ id: 'dye_black', name: 'black dye',
  tile: T('DYE_BLACK', 'COAL_LUMP', 'SEEDS'), dye: 7 });

// --- guns -------------------------------------------------------------------
// combat.js owns the ballistics; the item only *names* the weapon so that
// module can look the behaviour up, with a stat block here as the default.

export const GUNS = {
  pistol: {
    damage: 5, pellets: 1, spread: 0.02, cooldown: 0.34, range: 60,
    ammo: 'bullet', perShot: 1, reload: 1.1, clip: 8,
  },
  rifle: {
    damage: 9, pellets: 1, spread: 0.006, cooldown: 0.6, range: 140,
    ammo: 'bullet', perShot: 1, reload: 1.6, clip: 6,
  },
  shotgun: {
    damage: 3, pellets: 8, spread: 0.09, cooldown: 0.95, range: 28,
    ammo: 'bullet', perShot: 2, reload: 2.2, clip: 4,
  },
  // combat.js's WEAPONS carries the live ballistics (blast radius included);
  // these entries exist so the ITEMS exist — same ids, that is the whole link
  bazooka: {
    damage: 14, pellets: 1, spread: 0.006, cooldown: 1.2, range: 220,
    ammo: 'rocket', perShot: 1, reload: 2.8, clip: 1,
  },
  launcher: {
    damage: 8, pellets: 1, spread: 0.02, cooldown: 0.6, range: 240,
    ammo: 'rocket', perShot: 1, reload: 3.4, clip: 4,
  },
};

for (const [name, gun] of Object.entries(GUNS)) {
  def({
    id: name, name, stack: 1,
    tile: T(`GUN_${name.toUpperCase()}`, 'GUN', 'STICK'),
    weapon: name,   // combat.js: GUNS[item.weapon]
    gun,
  });
}
ITEMS.launcher.name = 'rocket launcher';   // the id stays one word
def({ id: 'bullet', name: 'bullet', tile: T('BULLET', 'FLINT') });
def({ id: 'rocket', name: 'rocket', tile: T('ROCKET', 'BULLET', 'FLINT'),
  stack: 16 });

// --- dynamite -----------------------------------------------------------------
// The one explosive you do not need a gun for. It is thrown rather than fired,
// so it carries `throwable` and a `fuse` in seconds — the delay is the whole
// weapon: a charge that went off on contact would just be a worse rocket, and
// one you can bounce round a corner and count down is a different thing.
//
// `blast` is deliberately the SAME { radius, damage } shape combat.js's
// WEAPONS already use for the bazooka and the rocket launcher, so _explode()
// takes this object as it stands and there is one explosion in this game
// rather than two. It sits between the two of them on both numbers: bigger
// than a rocket (3.2 / 18), smaller than a bazooka shell (4.6 / 34), because
// what you are paying for is the fuse, not the yield.
def({
  id: 'dynamite', name: 'dynamite', tile: T('DYNAMITE', 'ROCKET', 'BRICK'),
  stack: 16, throwable: true, fuse: 3, throwSpeed: 17, gravity: 1,
  blast: { radius: 4.2, damage: 26 },
});

export const weaponOf = (id) => getItem(id)?.weapon ?? null;
export const gunStats = (id) => GUNS[weaponOf(id)] ?? null;
export const isGun = (id) => weaponOf(id) != null;
export const isFood = (id) => (getItem(id)?.food ?? 0) > 0;

// logs and planks burn, which is why the tier-1 loop is self-sustaining
ITEMS.log.fuel = 1.5;
ITEMS.plank.fuel = 1.5;

// --- tools ------------------------------------------------------------------
// speed is the mining multiplier over bare hands; durability is uses.

const TOOL_TIERS = [
  { key: 'WOOD', tier: TIER.WOOD, mat: 'plank', speed: 2.2, dur: 60 },
  // stone tools are knapped from the rounds a mined rock drops, not from
  // dressed cobble brick — brick is for building
  { key: 'STONE', tier: TIER.STONE, mat: 'cobblestone_round', speed: 4, dur: 132 },
  { key: 'IRON', tier: TIER.IRON, mat: 'iron_ingot', speed: 6, dur: 251 },
  { key: 'DIAMOND', tier: TIER.DIAMOND, mat: 'diamond', speed: 9, dur: 1562 },
];

// which classes each shape is *for*. Off-class blocks fall back to bare-hand
// speed, so a shovel is not a secret pickaxe.
const TOOL_SHAPES = [
  { type: TOOL.PICKAXE, tile: 'PICK', classes: [CLASS.ROCK], damage: 2 },
  { type: TOOL.AXE, tile: 'AXE', classes: [CLASS.WOOD], damage: 3 },
  { type: TOOL.SHOVEL, tile: 'SHOVEL', classes: [CLASS.SOIL], damage: 2 },
  { type: TOOL.SWORD, tile: 'SWORD', classes: [CLASS.PLANT], damage: 5 },
  { type: TOOL.HOE, tile: 'HOE', classes: [CLASS.SOIL], damage: 1 },
];

export const TOOL_MATERIAL = {};   // tier -> the item you craft it from

for (const t of TOOL_TIERS) {
  TOOL_MATERIAL[t.tier] = t.mat;
  for (const s of TOOL_SHAPES) {
    const name = `${TIER_NAME[t.tier]} ${s.type}`;
    def({
      id: `${t.key.toLowerCase()}_${s.type}`,
      name,
      tile: TILE[`${s.tile}_${t.key}`],
      tool: {
        type: s.type,
        tier: t.tier,
        speed: s.type === TOOL.SWORD ? 1 + t.speed * 0.25 : t.speed,
        classes: s.classes,
        durability: s.type === TOOL.SWORD ? t.dur * 1.2 | 0 : t.dur,
        damage: s.damage + t.tier,
      },
    });
  }
}

// --- the metals: the tier between the tiers ----------------------------------
//
// None of these gets a rung on the harvest ladder. That ladder is four rungs
// wide and every one of them is a `>=` in another module — main.js indexes an
// array by it — so slipping a fifth value in between two of them would move
// every rung above it. They get what the rung would have bought instead:
// stone's REACH, and speed and life of their own. A copper pickaxe mines
// everything cobble mines and no more, so silver and diamond stay behind IRON
// exactly where they have always been, whatever metal is in your hand.
//
// What separates the four is therefore how fast they cut and how long they
// last, and each one is a different bargain:
//
//   copper  barely above stone, and shorter-lived than iron by half. It is the
//           metal you own before you own a stone pick, so it must not make
//           stone pointless — it makes it early.
//   brass   unchanged, to the number: copper alloyed with zinc, and better
//           than either of the metals that went into it.
//   bronze  the best of the four and the only reason to dig for tin, but still
//           under iron on both counts — an alloy you can reach is not a tier.
//   gold    faster than IRON on forty uses. Soft, quick, spent — you carry one
//           for a seam you want out of the wall now, not for the day's work.
const METALS = [
  { key: 'copper', speed: 4.4, dur: 150, damage: 2.2,
    spear: [6, 90], hammer: [8, 110] },
  { key: 'brass', speed: 5.2, dur: 210, damage: 2.5,
    spear: [7, 130], hammer: [9, 165] },
  { key: 'bronze', speed: 5.6, dur: 240, damage: 2.8,
    spear: [7.5, 150], hammer: [9.5, 190] },
  { key: 'gold', speed: 8.5, dur: 40, damage: 2,
    spear: [6, 30], hammer: [8, 38] },
];

// the metal each rack is made from, for crafting.js — one list, so a metal
// cannot have tools here and no recipe there
export const METAL_KEYS = METALS.map((m) => m.key);

for (const m of METALS) {
  const U = m.key.toUpperCase();
  for (const s of TOOL_SHAPES) {
    def({
      id: `${m.key}_${s.type}`, name: `${m.key} ${s.type}`,
      tile: T(`${s.tile}_${U}`, `${s.tile}_IRON`),
      tool: {
        type: s.type,
        tier: TIER.STONE,
        speed: s.type === TOOL.SWORD ? 1 + m.speed * 0.25 : m.speed,
        classes: s.classes,
        durability: s.type === TOOL.SWORD ? m.dur * 1.2 | 0 : m.dur,
        damage: s.damage + m.damage,
      },
    });
  }
}

// --- hand weapons: the prehistoric and the medieval racks ---------------------
//
// A hand weapon is an item with a top-level `damage` — the number main.js's
// trySwing reads on a melee hit — and a `tool` block so it wears out like
// every other tool (empty `classes`, so none of them mine anything faster
// than a bare hand). Spears also carry `reach`, extra blocks of melee range:
// the whole point of a spear is hitting what cannot yet hit you.
//
// The prehistoric rack is what the ground gives you on day one: a club is a
// branch, flint knaps into an edge. The medieval rack is what a furnace
// unlocks. Damage overlaps the sword tiers on purpose — a spear trades power
// for reach, a hammer reach for power.

function weapon(id, name, tile, dmg, { tier = TIER.HAND, dur = 40,
  reach = 0 } = {}) {
  return def({
    id, name, tile, stack: 1, damage: dmg, ...(reach ? { reach } : {}),
    tool: {
      type: TOOL.SWORD, tier, speed: 1, classes: [],
      durability: dur, damage: dmg,
    },
  });
}

weapon('club', 'wooden club', T('CLUB', 'STICK'), 4,
  { tier: TIER.WOOD, dur: 45 });
weapon('flint_knife', 'flint knife', T('FLINT_KNIFE', 'FLINT'), 5,
  { dur: 30 });
weapon('flint_spear', 'flint spear', T('FLINT_SPEAR', 'STICK'), 6,
  { dur: 45, reach: 5.2 });
weapon('spear', 'iron spear', T('SPEAR', 'STICK'), 8,
  { tier: TIER.IRON, dur: 140, reach: 5.2 });
// The hammers come in the tool tiers: a wooden mallet you can make on day
// one, the iron war hammer, and the diamond one that ends arguments. `hammer`
// stays the iron one's id — it was in the crates first.
weapon('wood_hammer', 'wooden hammer', T('HAMMER_WOOD', 'HAMMER', 'STICK'), 6,
  { tier: TIER.WOOD, dur: 60 });
weapon('hammer', 'war hammer', T('HAMMER', 'STICK'), 10,
  { tier: TIER.IRON, dur: 180 });
weapon('diamond_hammer', 'diamond hammer',
  T('HAMMER_DIAMOND', 'HAMMER', 'STICK'), 13,
  { tier: TIER.DIAMOND, dur: 700 });

// The other four metals' spears and hammers. A metal you can make five tools
// out of makes these two as well, or the rack is not a rack — and the two
// shapes are the two the medieval rack already had in iron. They sit at
// TIER.STONE like the rest of their racks, which for a weapon only decides
// what it could mine (nothing: `classes` is empty), never what it hits for.
for (const m of METALS) {
  const U = m.key.toUpperCase();
  weapon(`${m.key}_spear`, `${m.key} spear`,
    T(`SPEAR_${U}`, 'SPEAR', 'STICK'), m.spear[0],
    { tier: TIER.STONE, dur: m.spear[1], reach: 5.2 });
  weapon(`${m.key}_hammer`, `${m.key} hammer`,
    T(`HAMMER_${U}`, 'HAMMER', 'STICK'), m.hammer[0],
    { tier: TIER.STONE, dur: m.hammer[1] });
}

// The bow. combat.js has carried its ballistics from the start — slow,
// silent, a real arc — but the item never existed, so no one could hold it.
def({ id: 'bow', name: 'bow', stack: 1, tile: T('BOW', 'STICK'),
  weapon: 'bow' });
def({ id: 'arrow', name: 'arrow', tile: T('ARROW', 'STICK'), stack: 32 });

// --- armour -------------------------------------------------------------------
//
// Four slots — head, chest, legs, feet — in eight materials. A piece carries
// an `armour` block: which slot it goes in, and how many DEFENCE POINTS it is
// worth. inventory.js adds the four worn pieces up and turns the total into a
// reduction; nothing outside this file decides what a helmet is worth.
//
// It also carries a `tool` block, for its durability alone. That is not a
// trick: it is the same one weapon() plays a hundred lines up, and it is what
// makes a helmet wear out through machinery that already exists and is already
// tested — Inventory.newStack fills `dur` in, craftui.js's slot bar draws it,
// and a piece at zero is dropped by the same code that snaps a pickaxe. The
// classes list is empty, so no piece of armour mines anything faster than a
// bare hand, and craftui.js's categoryOf checks `armour` BEFORE it checks for
// a tool, so a breastplate files under armour rather than under weapons.
//
// WHICH MATERIALS. The rule is the one the tool racks already follow: a metal
// that makes tools makes armour. That gives copper, brass, bronze and gold off
// METALS, plus leather, iron and diamond. Zinc and tin are deliberately left
// out — neither has a tool rack either, they exist to be alloyed into brass
// and bronze, and armour would hand the two ores a use their own tools deny
// them (they are also, in life, the two worst metals to stand in: tin is soft
// and zinc is brittle). Silver is the one addition to the tool list, and it
// earns it: silver ore is the only ore behind an IRON pickaxe, so a silver set
// is strictly later than an iron one, and this is the first thing besides an
// apple that the deepest metal in the game is good for.
//
// THE NUMBERS. Points per piece follow the shape every armour set in every
// game uses, because it is the shape a real harness has: the breastplate is
// the biggest plate on the body and the helmet the smallest.
//
//   leather   1/3/2/1 = 7    what a cow buys you, and it is better than skin
//   copper    2/4/3/1 = 10   the first METAL you can be wearing, and early
//   gold      2/5/3/1 = 11   see below
//   brass     2/5/3/2 = 12   copper alloyed, and better than either half
//   bronze    2/5/4/2 = 13   the best you can reach without iron
//   iron      2/6/5/2 = 15   the working set
//   silver    3/6/5/2 = 16   behind an iron pick, so behind the iron set
//   diamond   3/8/6/3 = 20   the top, and the only 20 in the table
//
// Gold is showy and fragile, as it is everywhere else in this game: a gold
// pickaxe out-cuts iron and dies in forty swings, and a gold harness protects
// like brass and dies in fifty hits. `unit` below is what one point of the
// wear table costs in durability, and gold's is 4 against iron's 16.
export const ARMOUR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];

// Per-slot durability weight. A breastplate is the biggest piece of metal and
// takes the most punishment before it gives; a helmet is the least.
const ARMOUR_PIECES = [
  { slot: 'helmet', wear: 11, tile: 'HELMET' },
  { slot: 'chestplate', wear: 16, tile: 'CHESTPLATE' },
  { slot: 'leggings', wear: 15, tile: 'LEGGINGS' },
  { slot: 'boots', wear: 13, tile: 'BOOTS' },
];

// `fall` is the tile a piece wears until a real one is painted: the material
// it is made of, so a copper helmet at least reads as copper. See T() at the
// top of this file — a tile that does not exist yet costs nothing.
const ARMOUR_MATERIALS = [
  { key: 'leather', mat: 'leather', fall: 'LEATHER', unit: 5, def: [1, 3, 2, 1] },
  { key: 'copper', mat: 'copper_ingot', fall: 'COPPER_INGOT', unit: 9,
    def: [2, 4, 3, 1] },
  { key: 'gold', mat: 'gold_ingot', fall: 'GOLD_INGOT', unit: 4,
    def: [2, 5, 3, 1] },
  { key: 'brass', mat: 'brass_ingot', fall: 'BRASS_INGOT', unit: 12,
    def: [2, 5, 3, 2] },
  { key: 'bronze', mat: 'bronze_ingot', fall: 'BRONZE_INGOT', unit: 14,
    def: [2, 5, 4, 2] },
  { key: 'iron', mat: 'iron_ingot', fall: 'IRON_INGOT', unit: 16,
    def: [2, 6, 5, 2] },
  { key: 'silver', mat: 'silver_ingot', fall: 'SILVER_INGOT', unit: 20,
    def: [3, 6, 5, 2] },
  { key: 'diamond', mat: 'diamond', fall: 'DIAMOND_GEM', unit: 34,
    def: [3, 8, 6, 3] },
];

// the material each rack is made from, for crafting.js — one list, exactly as
// TOOL_MATERIAL and METAL_KEYS are, so a material cannot have armour here and
// no recipe there
export const ARMOUR_KEYS = ARMOUR_MATERIALS.map((m) => m.key);
export const ARMOUR_MATERIAL = {};

for (const m of ARMOUR_MATERIALS) {
  ARMOUR_MATERIAL[m.key] = m.mat;
  const U = m.key.toUpperCase();
  ARMOUR_PIECES.forEach((p, i) => {
    const durability = m.unit * p.wear;
    def({
      id: `${m.key}_${p.slot}`, name: `${m.key} ${p.slot}`, stack: 1,
      tile: T(`${p.tile}_${U}`, p.tile, m.fall),
      armour: {
        slot: p.slot, defence: m.def[i], durability, material: m.key,
      },
      tool: {
        type: TOOL.ARMOUR, tier: TIER.HAND, speed: 1, classes: [],
        durability, damage: 0,
      },
    });
  });
}

// --- rails and the wagon ------------------------------------------------------
//
// A rail is a block you lay and a wagon is a thing you put ON one. The rail
// carries its own axis, chosen at placement from the way you are facing, so
// there is one item and two block ids — exactly the arrangement stairs are on.
def({
  id: 'rail', name: 'rail', tile: T('RAIL_ITEM', 'BLOCK_IRON', 'IRON_INGOT'),
  block: CS.railId ? CS.railId(0) : null, rail: true, material: 'iron_ingot',
});
def({
  id: 'wagon', name: 'wagon', stack: 1,
  tile: T('WAGON_ITEM', 'PLANK', 'BLOCK_IRON'),
  wagon: true,
});

// --- the shield ---------------------------------------------------------------
//
// The one piece of defence that is not worn: it is HELD, in the off hand, and
// it works by being there. A shield takes a share of every blow that lands on
// you and wears out doing it — which is the whole trade, because the off hand
// is also where a torch goes, and choosing between seeing in the dark and
// taking half a hit is a real choice in a mine.
//
// Iron over planks, which is what a shield is: a board with a boss on it.
def({
  id: 'shield', name: 'shield', stack: 1,
  tile: T('BLOCK_IRON', 'IRON_INGOT', 'PLANK'),
  shield: { block: 0.5, durability: 220 },
  // it wears like a tool, through the same durability the rest of the game
  // already knows how to draw on a hotbar slot
  tool: { type: TOOL.ARMOUR, tier: TIER.HAND, speed: 1, classes: [],
    durability: 220, damage: 0 },
});
export const shieldOf = (id) => getItem(id)?.shield ?? null;

export const armourOf = (id) => getItem(id)?.armour ?? null;
export const isArmour = (id) => !!armourOf(id);
// which of the four slots this item goes in, or -1 — the one lookup every
// equip path needs, so nobody has to compare slot names by hand
export const armourSlot = (id) =>
  ARMOUR_SLOTS.indexOf(armourOf(id)?.slot ?? '');

// --- stairs, slabs and ladders ----------------------------------------------
//
// Orientation lives in the *block* id, never in the item: you cannot hold a
// "north-facing stair". So there is exactly one item per material and the
// facing is decided at placement time by main.js, which knows which face was
// clicked and which way the player is looking:
//
//   setBlock(f, u, v, h, placedBlock(itemId, { facing, half }))
//
// `facing` is 0..3 (+u, -u, +v, -v) and `half` is 0 bottom / 1 top, exactly as
// cubesphere.js encodes them. `blockForItem()` still answers, with facing 0,
// so older placement code keeps working — it just always faces +u.

// index into cubesphere's STAIR_MATERIALS, *not* a block id
// `slabTile` and `stairTile` are the shapes CUT from `tile` after the atlas is
// built — see shapeTiles in textures.js. A slab wearing the full block's face
// is three identical squares of timber with three different words under them,
// and you cannot tell what you are holding.
const SHAPE_MATS = [
  { i: 0, item: 'plank', adj: 'wooden', tile: 'PLANK',
    slabTile: 'PLANK_SLAB', stairTile: 'PLANK_STAIRS',
    cls: CLASS.WOOD, hardness: 1 },
  { i: 1, item: 'cobblestone', adj: 'cobble brick', tile: 'COBBLE',
    slabTile: 'COBBLE_SLAB', stairTile: 'COBBLE_STAIRS',
    cls: CLASS.ROCK, hardness: 1.9, harvest: TIER.WOOD },
  { i: 2, item: 'brick', adj: 'brick', tile: 'BRICK',
    slabTile: 'BRICK_SLAB', stairTile: 'BRICK_STAIRS',
    cls: CLASS.ROCK, hardness: 2, harvest: TIER.WOOD },
  { i: 3, item: 'thatch', adj: 'thatch', tile: 'THATCH',
    slabTile: 'THATCH_SLAB', stairTile: 'THATCH_STAIRS',
    cls: CLASS.PLANT, hardness: 0.4 },
];

// optional world helpers — see the namespace-import note at the top
const stairIdOf = CS.stairId ?? (() => null);
const slabIdOf = CS.slabId ?? (() => null);
const LADDER_BASE = BLOCK.LADDER_BASE ?? BLOCK.LADDER ?? null;
export const ladderIdOf = CS.ladderId
  ?? ((facing = 0) => (LADDER_BASE == null ? null : LADDER_BASE + (facing & 3)));

export const STAIR_ITEMS = [];
export const SLAB_ITEMS = [];

for (const m of SHAPE_MATS) {
  STAIR_ITEMS.push(`${m.item}_stairs`);
  SLAB_ITEMS.push(`${m.item}_slab`);
  def({
    id: `${m.item}_stairs`, name: `${m.adj} stairs`,
    tile: T(m.stairTile, m.tile),
    block: stairIdOf(m.i, 0), stair: m.i, material: m.item,
  });
  def({
    id: `${m.item}_slab`, name: `${m.adj} slab`,
    tile: T(m.slabTile, m.tile),
    block: slabIdOf(m.i, 0), slab: m.i, material: m.item,
  });
}

// BANK TWO: stairs for the rest of the world's materials, the way Minecraft
// gives most solids a stair. Same item shape as SHAPE_MATS — one item per
// material, facing decided at placement — and `i` continues the SHARED
// material index stairId reads, so 4 is the first of the second bank. Stairs
// only: a slab bank can follow the same road when it is wanted.
const STAIR2_MATS = [
  { i: 4, item: 'path', adj: 'path', tile: 'PATH',
    stairTile: 'PATH_STAIRS', cls: CLASS.SOIL, hardness: 0.6 },
  { i: 5, item: 'stone', adj: 'stone', tile: 'STONE',
    stairTile: 'STONE_STAIRS', cls: CLASS.ROCK, hardness: 2.2,
    harvest: TIER.WOOD },
  { i: 6, item: 'dirt', adj: 'soil', tile: 'DIRT',
    stairTile: 'DIRT_STAIRS', cls: CLASS.SOIL, hardness: 0.5 },
  { i: 7, item: 'sand', adj: 'sand', tile: 'SAND',
    stairTile: 'SAND_STAIRS', cls: CLASS.SOIL, hardness: 0.5 },
  { i: 8, item: 'sand_orange', adj: 'desert sand', tile: 'SAND_ORANGE',
    stairTile: 'SAND_ORANGE_STAIRS', cls: CLASS.SOIL, hardness: 0.5 },
  { i: 9, item: 'gravel', adj: 'gravel', tile: 'GRAVEL',
    stairTile: 'GRAVEL_STAIRS', cls: CLASS.SOIL, hardness: 0.6 },
  { i: 10, item: 'clay', adj: 'clay', tile: 'CLAY',
    stairTile: 'CLAY_STAIRS', cls: CLASS.SOIL, hardness: 0.6 },
  { i: 11, item: 'snow', adj: 'snow', tile: 'SNOW',
    stairTile: 'SNOW_STAIRS', cls: CLASS.SOIL, hardness: 0.2 },
  { i: 12, item: 'log', adj: 'log', tile: 'LOG_SIDE',
    stairTile: 'LOG_STAIRS', cls: CLASS.WOOD, hardness: 1.4 },
  { i: 13, item: 'glass', adj: 'glass', tile: 'GLASS',
    stairTile: 'GLASS_STAIRS', cls: CLASS.GLASS, hardness: 0.3 },
];

for (const m of STAIR2_MATS) {
  STAIR_ITEMS.push(`${m.item}_stairs`);
  def({
    id: `${m.item}_stairs`, name: `${m.adj} stairs`,
    tile: T(m.stairTile, m.tile),
    block: stairIdOf(m.i, 0), stair: m.i, material: m.item,
  });
}

def({
  id: 'ladder', name: 'ladder', tile: T('LADDER', 'STICK'),
  block: ladderIdOf(0), ladder: true, material: 'stick',
});

// the chair joins the oriented family: one item, four block ids
const chairIdOf = CS.chairId ?? (() => null);
def({
  id: 'chair', name: 'chair', tile: T('CHAIR', 'PLANK'),
  block: chairIdOf(0), chair: true, material: 'plank',
});

// ...and the street's two pieces, on the same terms: the bench oriented like
// the chair it is a long cousin of, the hydrant one id you walk round
const benchIdOf = CS.benchId ?? (() => null);
def({
  id: 'bench', name: 'bench', tile: T('CHAIR', 'PLANK'),
  block: benchIdOf(0), bench: true, material: 'plank',
});
def({
  id: 'hydrant', name: 'fire hydrant', tile: T('CEMENT_RED', 'STONE'),
  block: BLOCK.HYDRANT ?? null,
});

// --- the café, and the smallest room ------------------------------------------
// A water pipe: what the men of a village smoke in the café house of an
// evening — see cafeHouse in village.js and the café hour in entities.js.
// One id, square in plan. It is furniture, box-built off tiles the atlas has
// (see SHISHA_BOXES in cubemesher.js), so it costs no picture of its own.
def({
  id: 'shisha', name: 'shisha pipe', tile: T('BLOCK_BRONZE', 'GOLD_INGOT'),
  block: BLOCK.SHISHA ?? null,
});
// ...and a toilet, which is oriented exactly like the chair: the facing is
// the wall the cistern stands against, and you put it down with its back to
// the wall you are facing. Some houses are built with one — see furnish in
// village.js — and everybody in a village visits one every six hours.
// ...and the glasses the bartender pours into. Two, because a village with a
// mosque does not serve ale: tea in a tulip glass, ale in a tankard. Both are
// furniture, box-built off tiles the atlas already has — see the glasses in
// cubemesher.js — so neither costs a picture of its own.
def({
  id: 'tea_glass', name: 'glass of tea', tile: T('GLASS_ORANGE', 'GLASS'),
  block: BLOCK.TEA_GLASS ?? null,
});
def({
  id: 'tankard', name: 'tankard of ale', tile: T('WOOL_YELLOW', 'GLASS'),
  block: BLOCK.TANKARD ?? null,
});
const toiletIdOf = CS.toiletId ?? (() => null);
// ...and a BIN, for what you do not want. Use it holding a stack and the
// stack is gone — see the bin in useBlock, main.js.
def({
  id: 'bin', name: 'bin', tile: T('BLOCK_IRON', 'IRON_INGOT'),
  block: BLOCK.BIN ?? null,
});
// ...and a SIGN: a board on a post you write on. One item, four ids, the
// facing decided at placement — it is put down facing YOU, because the
// person who plants a notice is the person who is going to read it back.
const signIdOf = CS.signId ?? (() => null);
def({
  id: 'sign', name: 'sign', tile: T('PLANK', 'LOG'),
  block: signIdOf(0), sign: true, material: 'plank',
});
def({
  id: 'toilet', name: 'toilet', tile: T('WOOL_WHITE', 'STONE'),
  block: toiletIdOf(0), toilet: true,
});

// --- masonry walls -----------------------------------------------------------
// A wall thinner than a block: a post that reaches for its neighbours, laid
// exactly like a fence and animal-proof on the same terms — a brick fence, as
// asked. Order matches cubesphere's WALL_MATS, which is what wallId(i) counts.
export const WALL_ITEMS = [
  ['brick_wall', 'brick wall', 'brick', 'BRICK'],
  ['cobble_brick_wall', 'cobble brick wall', 'cobblestone', 'COBBLE'],
  ['stone_wall', 'stone wall', 'stone', 'STONE'],
  ['cobblestone_wall', 'cobblestone wall', 'cobblestone_round', 'COBBLESTONE'],
  ['cobblestone_mossy_wall', 'mossy cobblestone wall', 'cobblestone_mossy',
    'COBBLESTONE_MOSSY'],
  ['cobblestone_dark_wall', 'dark cobblestone wall', 'cobblestone_dark',
    'COBBLESTONE_DARK'],
];
WALL_ITEMS.forEach(([id, name, matItem, tileKey], i) => {
  def({
    id, name, tile: TILE[tileKey] ?? TILE.STONE,
    block: CS.wallId ? CS.wallId(i) : null, material: matItem,
  });
});

// --- power --------------------------------------------------------------------
//
// Four things you lay and one thing you do with them: a dynamo turns, wire
// carries what it turns into, a switch stands in the way of it, and a lamp on
// the end of the run comes on. They are ordinary placeable blocks — see
// js/power.js for the network, which is walked out from these and never
// stored.
// `power: true` is not decoration. It is what puts these in a tab of their
// own — see categoryOf — and it is a FACT about the item rather than a list
// somebody has to remember to add to, which is the rule the categories are
// under. Anything that joins the network gets it and files itself.
def({
  id: 'wire', name: 'wire', tile: T('WIRE_ITEM', 'BLOCK_IRON', 'IRON_INGOT'),
  block: BLOCK.WIRE ?? null, material: 'iron_ingot', power: true,
});
def({
  id: 'switch', name: 'switch', tile: T('SWITCH_ITEM', 'BLOCK_BRONZE', 'STONE'),
  block: CS.switchId ? CS.switchId(false) : null, material: 'cobblestone',
  power: true,
});
def({
  id: 'dynamo', name: 'dynamo', tile: T('DYNAMO_ITEM', 'BLOCK_BRONZE', 'IRON_INGOT'),
  block: BLOCK.DYNAMO ?? null, material: 'iron_ingot', power: true,
});
def({
  id: 'power_lamp', name: 'electric lamp',
  tile: T('POWER_LAMP_ITEM', 'LANTERN', 'GLASS'),
  block: CS.powerLampId ? CS.powerLampId(false) : null, material: 'iron_ingot',
  power: true,
});

// WHICH JAMB A PLAYER'S DOOR HANGS ON.
//
// A stair takes its facing from where you are LOOKING; a door takes its hinge
// from where in the cell you are looking, which is the same idea one notch
// finer. Aim at the half of the doorway nearer one jamb and the leaf hangs on
// that jamb — so a matched pair is two clicks, one at each side of a two-wide
// opening, and there is nothing new to learn to hang one. The generator has
// been able to mirror a leaf since the day the pair went in; this is the same
// choice handed to the player, through the door he already uses.
//
// It answers TRUE for the low end of the axis the doorway spans, because the
// hinge BIT is not the same thing as an end of the wall and this file is not
// the place that knows that table — `doorHingeFor` in cubesphere.js is.
//
// `eye` and `look` are the ray the crosshair already is: main.js hands the
// same two to raycastVoxel. Nothing here reads the world, because a doorway's
// two jambs are its own two ends and the cell is enough to find them.
const xyz = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function doorAimLow(f, u, v, h, facing, eye, look) {
  // a build of the world module without the grid helpers keeps the leaf the
  // game has always hung rather than throwing at a placement
  if (!CS.dirFromCell || !CS.cellCenterWorld || !eye || !look) return true;
  const base = CS.dirFromCell(f, u + 0.5, v + 0.5);
  const unit = (a) => {
    const x = a[0] - base[0], y = a[1] - base[1], z = a[2] - base[2];
    const n = Math.hypot(x, y, z) || 1;
    return [x / n, y / n, z / n];
  };
  const eU = unit(CS.dirFromCell(f, u + 1.5, v + 0.5));
  const eV = unit(CS.dirFromCell(f, u + 0.5, v + 1.5));
  // the leaf's thickness runs along the WALL axis and the doorway spans the
  // other one — facings 0 and 1 hang in a ±u wall, 2 and 3 in a ±v one
  const wall = (facing & 3) < 2 ? eU : eV;
  const jamb = (facing & 3) < 2 ? eV : eU;
  const C = CS.cellCenterWorld(f, u, v, h);
  const E = xyz(eye), L = xyz(look);
  const den = dot3(L, wall);
  // A ray running ALONG the wall never crosses the plane the leaf lies in, and
  // one aimed away from the cell crosses it behind the player. Neither has a
  // half to read, so neither gets to choose.
  if (Math.abs(den) < 1e-6) return true;
  const t = dot3([C[0] - E[0], C[1] - E[1], C[2] - E[2]], wall) / den;
  if (!(t > 0)) return true;
  return dot3([E[0] + L[0] * t - C[0], E[1] + L[1] * t - C[1],
    E[2] + L[2] * t - C[2]], jamb) < 0;
}

// The block this item actually places. Orientation-free items ignore the
// options, so main.js can call this unconditionally.
export function placedBlock(id, { facing = 0, half = 0, low = null } = {}) {
  const it = getItem(id);
  if (!it) return null;
  if (it.stair != null) return stairIdOf(it.stair, facing & 3);
  if (it.slab != null) return slabIdOf(it.slab, half ? 1 : 0);
  if (it.ladder) return ladderIdOf(facing & 3);
  if (it.chair) return chairIdOf(facing & 3);
  if (it.bench) return benchIdOf(facing & 3);
  if (it.toilet) return toiletIdOf(facing & 3);
  // the board faces you: the placement facing is the way you are looking,
  // and the reader's side is the opposite one
  if (it.sign) return signIdOf((facing & 3) ^ 1);
  // A RAIL runs along one of the two axes, and which one is decided by the
  // way you are standing: facings 0 and 1 are the u axis, 2 and 3 the v. Same
  // arrangement as the stair — orientation lives in the block, never in the
  // item, so you cannot hold "the east-west rail".
  if (it.rail) return CS.railId ? CS.railId((facing & 3) < 2 ? 0 : 1) : null;
  // A bed's facing names the side the pillow is on, so it is laid down with
  // its head AWAY from you: you put a bed against the wall you are facing.
  if (it.bed != null) return CS.bedId ? CS.bedId(it.bed, facing & 3) : null;
  // A door is always placed SHUT: you hang it, then you open it. WHICH JAMB it
  // hangs on comes from `low` — see doorAimLow above. A caller that says
  // nothing gets the leaf this game has always hung, so nothing that predates
  // the choice has to be told about it.
  if (it.door != null) {
    const hinge = low === null ? 0 : (CS.doorHingeFor?.(facing & 3, low) ?? 0);
    return doorIdOf(it.door, facing & 3, false, hinge);
  }
  return it.block ?? null;
}

// does placing this item need a facing / half from the player?
export const isOriented = (id) => {
  const it = getItem(id);
  return !!it && (it.stair != null || it.slab != null || !!it.ladder
    || !!it.chair || !!it.bench || !!it.toilet || !!it.sign || it.door != null
    || it.bed != null || !!it.rail);
};

// --- block metadata ---------------------------------------------------------
// Keyed by the BLOCK *name* so a block another module has not added yet is
// simply skipped rather than poisoning the table with `undefined`.

const BLOCK_TABLE = {
  GRASS: { cls: CLASS.SOIL, hardness: 0.65, item: 'grass', drop: 'dirt' },
  DIRT: { cls: CLASS.SOIL, hardness: 0.6, item: 'dirt' },
  SAND: { cls: CLASS.SOIL, hardness: 0.45, item: 'sand' },
  SAND_ORANGE: { cls: CLASS.SOIL, hardness: 0.45, item: 'sand_orange' },
  GRAVEL: { cls: CLASS.SOIL, hardness: 0.6, item: 'gravel', drop: 'flint' },
  CLAY: { cls: CLASS.SOIL, hardness: 0.6, item: 'clay' },
  SNOW: { cls: CLASS.SOIL, hardness: 0.25, item: 'snow' },
  PATH: { cls: CLASS.SOIL, hardness: 0.6, item: 'path', drop: 'dirt' },
  TILLED: { cls: CLASS.SOIL, hardness: 0.6, item: 'tilled', drop: 'dirt' },
  STONE: {
    cls: CLASS.ROCK, hardness: 1.6, harvest: TIER.WOOD,
    // rock breaks into ROUNDS, the way it always should have: the squared
    // brick is what a mason makes of them afterwards, at the bench or on
    // the crafting grid
    item: 'stone', drop: 'cobblestone_round',
  },
  COBBLE: {
    cls: CLASS.ROCK, hardness: 1.9, harvest: TIER.WOOD, item: 'cobblestone',
  },
  COBBLESTONE: {
    cls: CLASS.ROCK, hardness: 1.8, harvest: TIER.WOOD,
    item: 'cobblestone_round',
  },
  COBBLESTONE_MOSSY: {
    cls: CLASS.ROCK, hardness: 1.8, harvest: TIER.WOOD,
    item: 'cobblestone_mossy',
  },
  COBBLESTONE_DARK: {
    cls: CLASS.ROCK, hardness: 1.8, harvest: TIER.WOOD,
    item: 'cobblestone_dark',
  },
  BRICK: { cls: CLASS.ROCK, hardness: 2, harvest: TIER.WOOD, item: 'brick' },
  FURNACE: {
    cls: CLASS.ROCK, hardness: 2.4, harvest: TIER.WOOD, item: 'furnace',
  },
  ICE: { cls: CLASS.ROCK, hardness: 0.5, item: 'ice' },
  COAL: {
    cls: CLASS.ROCK, hardness: 2.2, harvest: TIER.WOOD,
    item: 'coal_ore', drop: 'coal',
  },
  IRON: {
    cls: CLASS.ROCK, hardness: 3.2, harvest: TIER.STONE,
    item: 'iron_ore', drop: 'raw_iron',
  },
  SILVER: {
    cls: CLASS.ROCK, hardness: 4, harvest: TIER.IRON,
    item: 'silver_ore', drop: 'raw_silver',
  },
  DIAMOND: {
    cls: CLASS.ROCK, hardness: 6, harvest: TIER.IRON,
    item: 'diamond_ore', drop: 'diamond',
  },
  // Gold sits where it does in the ore table: shallower than silver, rarer
  // than iron, and a stone pick is enough — you find it long before you can
  // work silver, which is what makes brass an early alloy rather than a late
  // one.
  GOLD: {
    cls: CLASS.ROCK, hardness: 3.4, harvest: TIER.STONE,
    item: 'gold_ore', drop: 'raw_gold',
  },
  // The storage blocks. Each needs whatever its material needed in the
  // ground, so a block of diamond is the one you cannot chisel out with a
  // stone pick — the same gate the ore itself is behind.
  BLOCK_IRON: {
    cls: CLASS.ROCK, hardness: 5, harvest: TIER.STONE, item: 'iron_block',
  },
  BLOCK_GOLD: {
    cls: CLASS.ROCK, hardness: 3, harvest: TIER.STONE, item: 'gold_block',
  },
  BLOCK_BRASS: {
    cls: CLASS.ROCK, hardness: 4.5, harvest: TIER.STONE, item: 'brass_block',
  },
  BLOCK_DIAMOND: {
    cls: CLASS.ROCK, hardness: 5, harvest: TIER.IRON, item: 'diamond_block',
  },
  // Copper is the one ore a WOODEN pick lifts. That is the whole of its place
  // in the game: a metal before the stone tier, so the first pickaxe you ever
  // whittle is worth taking underground.
  COPPER: {
    cls: CLASS.ROCK, hardness: 3, harvest: TIER.WOOD,
    item: 'copper_ore', drop: 'raw_copper',
  },
  // Zinc and tin sit with iron and gold: stone reaches them, and they are what
  // turn a heap of copper into brass and bronze.
  ZINC: {
    cls: CLASS.ROCK, hardness: 3.3, harvest: TIER.STONE,
    item: 'zinc_ore', drop: 'raw_zinc',
  },
  TIN: {
    cls: CLASS.ROCK, hardness: 3.3, harvest: TIER.STONE,
    item: 'tin_ore', drop: 'raw_tin',
  },
  BLOCK_COPPER: {
    cls: CLASS.ROCK, hardness: 3.6, harvest: TIER.STONE, item: 'copper_block',
  },
  BLOCK_BRONZE: {
    cls: CLASS.ROCK, hardness: 4.6, harvest: TIER.STONE, item: 'bronze_block',
  },
  BLOCK_ZINC: {
    cls: CLASS.ROCK, hardness: 3.8, harvest: TIER.STONE, item: 'zinc_block',
  },
  BLOCK_TIN: {
    cls: CLASS.ROCK, hardness: 3.4, harvest: TIER.STONE, item: 'tin_block',
  },
  // silver's ore needs iron in the ground, so its block needs iron on a wall
  BLOCK_SILVER: {
    cls: CLASS.ROCK, hardness: 4.4, harvest: TIER.IRON, item: 'silver_block',
  },
  LOG: { cls: CLASS.WOOD, hardness: 1.1, item: 'log' },
  PLANK: { cls: CLASS.WOOD, hardness: 1, item: 'plank' },
  CRAFTING_TABLE: { cls: CLASS.WOOD, hardness: 1.2, item: 'crafting_table' },
  CHEST: { cls: CLASS.WOOD, hardness: 1.2, item: 'chest' },
  FENCE: { cls: CLASS.WOOD, hardness: 1, item: 'fence' },
  // both states of the gate mine back to the one item
  GATE: { cls: CLASS.WOOD, hardness: 1, item: 'gate' },
  GATE_O: { cls: CLASS.WOOD, hardness: 1, item: 'gate', drop: 'gate' },
  STRIPPED_LOG: { cls: CLASS.WOOD, hardness: 1.05, item: 'stripped_log' },
  // a post is a fence post on its own: same timber, same effort to break
  POST: { cls: CLASS.WOOD, hardness: 1, item: 'post' },
  // A shelf comes back whole. Scattering the books instead would be the
  // Minecraft rule, and it exists there because enchanting spends them; here
  // it would only mean a library you cannot move.
  BOOKSHELF: { cls: CLASS.WOOD, hardness: 1.5, item: 'bookshelf' },
  LECTERN: { cls: CLASS.WOOD, hardness: 1.4, item: 'lectern' },
  // A bell is a casting on a frame. Rock, not wood, because what you have to
  // get through is the bronze — and it takes the same pick a block of it does.
  BELL: {
    cls: CLASS.ROCK, hardness: 3.5, harvest: TIER.STONE, item: 'bell',
  },
  // The press. An iron frame bolted to a stone bed, so it comes out on the
  // bell's terms and then some: it is the heaviest piece of ironmongery in a
  // village and it should not come out of a shop with a wooden pick.
  MINT: {
    cls: CLASS.ROCK, hardness: 4.5, harvest: TIER.STONE, item: 'mint',
  },
  LEAF: { cls: CLASS.PLANT, hardness: 0.25, item: 'leaves', drop: null },
  THATCH: { cls: CLASS.PLANT, hardness: 0.4, item: 'thatch' },
  TORCH: { cls: CLASS.OTHER, hardness: 0.05, item: 'torch' },
  LANTERN: { cls: CLASS.OTHER, hardness: 0.3, item: 'lantern' },
  TABLE: { cls: CLASS.WOOD, hardness: 1, item: 'table' },
  LAMP: { cls: CLASS.OTHER, hardness: 0.4, item: 'lamp' },
  STREET_LAMP: { cls: CLASS.OTHER, hardness: 0.5, item: 'street_lamp' },
  CAMPFIRE: { cls: CLASS.WOOD, hardness: 0.6, item: 'campfire' },
  // farming. Breaking farmland loses the tilling, which is why a field wants
  // a fence: walking over it is not punished, but mining it is.
  FARMLAND: { cls: CLASS.SOIL, hardness: 0.55, item: 'farmland', drop: 'dirt' },
  // crops drop through the special case in dropsFor(), not through `drop`
  WHEAT: { cls: CLASS.PLANT, hardness: 0.05, item: null, drop: null },
  WHEAT_YOUNG: { cls: CLASS.PLANT, hardness: 0.05, item: null, drop: null },
  FLOWER_RED: { cls: CLASS.PLANT, hardness: 0.05, item: 'flower_red' },
  FLOWER_YELLOW: { cls: CLASS.PLANT, hardness: 0.05, item: 'flower_yellow' },
  FLOWER_BLUE: { cls: CLASS.PLANT, hardness: 0.05, item: 'flower_blue' },
  MUSHROOM: { cls: CLASS.PLANT, hardness: 0.05, item: 'mushroom' },
  SAPLING: { cls: CLASS.PLANT, hardness: 0.05, item: 'sapling' },
  // A cane comes back whole and comes back fast: it is a plant, so a hand
  // takes it, and there is no roll on it because a grove you have to gamble
  // with is a grove nobody harvests. An axe is still worth carrying — bamboo
  // is WOOD to a tool, so an axe swings through a stand of it.
  BAMBOO: { cls: CLASS.WOOD, hardness: 0.15, item: 'bamboo' },
  // Glass no longer shatters. The rule it was copying exists in the game it
  // came from because silk touch is the reward for getting the pane back, and
  // there is no silk touch here — so all shattering ever did was cost you the
  // window you had just glazed, one mis-click at a time. Sand and a furnace
  // are cheap; a wall of forty panes fitted by hand is not.
  GLASS: { cls: CLASS.GLASS, hardness: 0.5, item: 'glass' },
  WATER: { cls: CLASS.LIQUID, hardness: Infinity, item: null, drop: null },
};

const BLOCK_INFO = new Map();
for (const [key, info] of Object.entries(BLOCK_TABLE)) {
  const id = BLOCK[key];
  if (id === undefined) continue;   // block not in this build of the world
  BLOCK_INFO.set(id, {
    block: id,
    name: key.toLowerCase(),
    cls: info.cls,
    hardness: info.hardness,
    harvest: info.harvest ?? TIER.HAND,
    item: info.item,
    // `drop: null` means "drops nothing"; omitted means "drops itself"
    drop: 'drop' in info ? info.drop : info.item,
  });
}

// The three ranged families — tinted glass, panes and the timbers — are a
// base id plus an index rather than a name apiece, so they are registered by
// walking the same lists the items came off. Writing them into BLOCK_TABLE
// would be thirty-four entries that can only ever go out of step with the id
// arithmetic in cubesphere.js.
GLASS_ITEMS.forEach((item, i) => {
  const b = CS.tintedGlassId?.(i);
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.GLASS, hardness: 0.5,
    harvest: TIER.HAND, item, drop: item,
  });
});
WOOL_ITEMS.forEach((item, i) => {
  const b = CS.woolId?.(i);
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.PLANT, hardness: 0.8,
    harvest: TIER.HAND, item, drop: item,
  });
});
// A bed mines back as a bed of its own colour, whichever way it was facing —
// and from EITHER half. A bed is two cells (see BED_FOOT_BASE in
// cubesphere.js) and breaking one takes both (see breakBlock in main.js), so
// whichever end the swing landed on has to be the end that pays. Without the
// foot in this table a bed broken from the wrong end came out of the room and
// gave back nothing at all.
BED_ITEMS.forEach((item, i) => {
  for (let facing = 0; facing < 4; facing++) {
    for (const b of [CS.bedId?.(i, facing), CS.bedFootId?.(i, facing)]) {
      if (b == null) continue;
      BLOCK_INFO.set(b, {
        block: b, name: item, cls: CLASS.WOOD, hardness: 0.6,
        harvest: TIER.HAND, item, drop: item,
      });
    }
  }
});
CEMENT_ITEMS.forEach((item, i) => {
  const b = CS.cementId?.(i);
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.ROCK, hardness: 1.8,
    harvest: TIER.WOOD, item, drop: item,
  });
});
CEMENT_GREYS.forEach(([item], i) => {
  const b = CS.cementGreyId?.(i);
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.ROCK, hardness: 1.8,
    harvest: TIER.WOOD, item, drop: item,
  });
});
PANE_ITEMS.forEach((item, i) => {
  // index 0 is the clear pane, which cubesphere spells as tint -1
  const b = CS.paneId?.(i - 1);
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.GLASS, hardness: 0.4,
    harvest: TIER.HAND, item, drop: item,
  });
});
LOG_ITEMS.forEach((item, i) => {
  const b = CS.logId?.(i);
  if (b == null || i === 0) return;      // oak is in BLOCK_TABLE already
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.WOOD, hardness: 1.1,
    harvest: TIER.HAND, item, drop: item,
  });
});
PLANK_ITEMS.forEach((item, i) => {
  const b = CS.plankId?.(i);
  if (b == null || i === 0) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.WOOD, hardness: 1,
    harvest: TIER.HAND, item, drop: item,
  });
});

// Stairs and slabs are 24 block ids sharing 8 items, so they are registered in
// a loop rather than written out in BLOCK_TABLE. Every orientation maps back
// to the same item, which is what makes "mine it, place it the other way
// round" work without a rotation tool.
for (const m of [...SHAPE_MATS, ...STAIR2_MATS]) {
  for (let facing = 0; facing < 4; facing++) {
    const b = stairIdOf(m.i, facing);
    if (b == null) break;
    BLOCK_INFO.set(b, {
      block: b, name: `${m.item}_stairs`, cls: m.cls, hardness: m.hardness,
      harvest: m.harvest ?? TIER.HAND,
      item: `${m.item}_stairs`, drop: `${m.item}_stairs`,
    });
  }
  if (m.i >= 4) continue;           // bank two is stairs only — no slab ids
  for (let half = 0; half < 2; half++) {
    const b = slabIdOf(m.i, half);
    if (b == null) break;
    BLOCK_INFO.set(b, {
      block: b, name: `${m.item}_slab`, cls: m.cls, hardness: m.hardness * 0.8,
      harvest: m.harvest ?? TIER.HAND,
      item: `${m.item}_slab`, drop: `${m.item}_slab`,
    });
  }
}
for (let facing = 0; facing < 4; facing++) {
  const b = ladderIdOf(facing);
  if (b == null) break;
  BLOCK_INFO.set(b, {
    block: b, name: 'ladder', cls: CLASS.WOOD, hardness: 0.4,
    harvest: TIER.HAND, item: 'ladder', drop: 'ladder',
  });
}
// Doors: sixteen block ids over seven items — four facings, two states and two
// HINGE SIDES apiece — and every one of them mines back to the leaf you hung.
// The hinge side is the half of this that is easy to forget: the right-hand
// leaf of a double door is its own block id, and left out of this table it
// would be a door you could not pick up. An IRON door takes a pickaxe, which is
// also what stops a village's front door coming off in somebody's bare hands.
DOOR_ITEMS.forEach((item, i) => {
  const wood = i < (CS.WOOD_SPECIES?.length ?? 5);
  for (let k = 0; k < 16; k++) {
    const b = doorIdOf(i, (k >> 1) & 3, (k & 1) === 1, k >> 3);
    if (b == null) break;
    BLOCK_INFO.set(b, {
      block: b, name: item,
      cls: wood ? CLASS.WOOD : i === DOOR_ITEMS.length - 1
        ? CLASS.GLASS : CLASS.ROCK,
      hardness: wood ? 1.4 : i === DOOR_ITEMS.length - 1 ? 0.8 : 3.6,
      harvest: wood || i === DOOR_ITEMS.length - 1 ? TIER.HAND : TIER.STONE,
      item, drop: item,
    });
  }
});

// chairs: four ids, one item, exactly like stairs
for (let facing = 0; facing < 4; facing++) {
  const b = chairIdOf(facing);
  if (b == null) break;
  BLOCK_INFO.set(b, {
    block: b, name: 'chair', cls: CLASS.WOOD, hardness: 0.8,
    harvest: TIER.HAND, item: 'chair', drop: 'chair',
  });
}
// ...and the bench, the same way
for (let facing = 0; facing < 4; facing++) {
  const b = benchIdOf(facing);
  if (b == null) break;
  BLOCK_INFO.set(b, {
    block: b, name: 'bench', cls: CLASS.WOOD, hardness: 0.9,
    harvest: TIER.HAND, item: 'bench', drop: 'bench',
  });
}
if (BLOCK.HYDRANT != null) {
  BLOCK_INFO.set(BLOCK.HYDRANT, {
    block: BLOCK.HYDRANT, name: 'fire hydrant', cls: CLASS.STONE,
    hardness: 1.6, harvest: TIER.HAND, item: 'hydrant', drop: 'hydrant',
  });
}
// the water pipe, and the toilet's four ids
if (BLOCK.SHISHA != null) {
  BLOCK_INFO.set(BLOCK.SHISHA, {
    block: BLOCK.SHISHA, name: 'shisha pipe', cls: CLASS.OTHER,
    hardness: 0.6, harvest: TIER.HAND, item: 'shisha', drop: 'shisha',
  });
}
for (const [id, item] of [[BLOCK.TEA_GLASS, 'tea_glass'],
  [BLOCK.TANKARD, 'tankard']]) {
  if (id == null) continue;
  BLOCK_INFO.set(id, {
    block: id, name: item === 'tankard' ? 'tankard of ale' : 'glass of tea',
    cls: CLASS.GLASS, hardness: 0.3, harvest: TIER.HAND, item, drop: item,
  });
}
for (let facing = 0; facing < 4; facing++) {
  const b = toiletIdOf(facing);
  if (b == null) break;
  BLOCK_INFO.set(b, {
    block: b, name: 'toilet', cls: CLASS.STONE, hardness: 1.2,
    harvest: TIER.HAND, item: 'toilet', drop: 'toilet',
  });
}
// ...and the bin, which mines back as itself
if (BLOCK.BIN != null) {
  BLOCK_INFO.set(BLOCK.BIN, {
    block: BLOCK.BIN, name: 'bin', cls: CLASS.ROCK, hardness: 1.2,
    harvest: TIER.HAND, item: 'bin', drop: 'bin',
  });
}
// ...and the sign's four, which all mine back to the one board
for (let facing = 0; facing < 4; facing++) {
  const b = signIdOf(facing);
  if (b == null) break;
  BLOCK_INFO.set(b, {
    block: b, name: 'sign', cls: CLASS.WOOD, hardness: 0.5,
    harvest: TIER.HAND, item: 'sign', drop: 'sign',
  });
}

// --- rails and the power fittings: many ids, one item each -------------------
// None of these were in the table, so a rail you took back up was a rail
// GONE — the pick paid out nothing at all, and so with a wire, a switch, a
// dynamo and a lamp. Every id of each family mines back to the one item that
// laid it, bends and live states included.
const fitting = (b, item, hardness) => {
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: item, cls: CLASS.ROCK, hardness,
    harvest: TIER.HAND, item, drop: item,
  });
};
fitting(BLOCK.RAIL_BASE, 'rail', 0.7);
fitting(BLOCK.RAIL_BASE != null ? BLOCK.RAIL_BASE + 1 : null, 'rail', 0.7);
if (BLOCK.RAIL_TURN_BASE != null) {
  for (let k = 0; k < 4; k++) fitting(BLOCK.RAIL_TURN_BASE + k, 'rail', 0.7);
}
fitting(BLOCK.WIRE, 'wire', 0.3);
fitting(BLOCK.WIRE_LIVE, 'wire', 0.3);
if (BLOCK.SWITCH_BASE != null) {
  fitting(BLOCK.SWITCH_BASE, 'switch', 0.5);
  fitting(BLOCK.SWITCH_BASE + 1, 'switch', 0.5);
}
fitting(BLOCK.DYNAMO, 'dynamo', 1.4);
if (BLOCK.POWER_LAMP_BASE != null) {
  fitting(BLOCK.POWER_LAMP_BASE, 'power_lamp', 0.5);
  fitting(BLOCK.POWER_LAMP_BASE + 1, 'power_lamp', 0.5);
}
// ...and the masonry walls, which mine back to the wall you laid
WALL_ITEMS.forEach(([id], i) => {
  const b = CS.wallId ? CS.wallId(i) : null;
  if (b == null) return;
  BLOCK_INFO.set(b, {
    block: b, name: id, cls: CLASS.ROCK, hardness: 1.9,
    harvest: TIER.WOOD, item: id, drop: id,
  });
});

// The kitchen garden: eight block ids over four crops, registered off
// cubesphere's CROP_TYPES rather than written out, exactly as the glass and
// the timbers are. `item: null, drop: null` matches WHEAT above — what a crop
// pays out is not one fixed item, it is the roll in dropsFor.
export const CROP_KINDS = CS.CROP_TYPES ?? [];
const cropIdOf = CS.cropId ?? (() => null);
CROP_KINDS.forEach((crop, i) => {
  for (let stage = 0; stage < 2; stage++) {
    const b = cropIdOf(i, stage);
    if (b == null) continue;
    BLOCK_INFO.set(b, {
      block: b, name: stage ? crop : `${crop}_young`,
      cls: CLASS.PLANT, hardness: 0.05, harvest: TIER.HAND,
      item: null, drop: null,
    });
  }
});

const DEFAULT_INFO = {
  cls: CLASS.OTHER, hardness: 1, harvest: TIER.HAND, item: null, drop: null,
};

export const blockInfo = (b) => BLOCK_INFO.get(b) ?? DEFAULT_INFO;
export const blockClass = (b) => blockInfo(b).cls;
export const blockHardness = (b) => blockInfo(b).hardness;
export const harvestTier = (b) => blockInfo(b).harvest;
export const itemForBlock = (b) => blockInfo(b).item;

export const getItem = (id) => (id ? ITEMS[id] ?? null : null);
export const itemTile = (id) => getItem(id)?.tile ?? TILE.STONE;
export const itemName = (id) => getItem(id)?.name ?? id;
// --- what a thing is worth ----------------------------------------------------
//
// One number per item, in gold coins, and it is the same number everywhere:
// the shop asks for it, the shop pays a fraction of it, and a hired hand's
// wages are counted in it. Money only means anything if the prices behind it
// are consistent, so this is a FUNCTION of what an item already is rather than
// a hand-written list of four hundred rows that would drift apart the first
// time somebody added a block.
//
// The anchor is the mint: nine coins to a gold ingot, so a gold ingot is nine
// and every other metal is priced against gold by how hard it is to get out of
// the ground. Everything else falls out of the families items.js already has —
// tool tier, armour points, how filling a food is, how hard a block is to
// break — with an override table for the handful that no rule covers.
const PRICE = {
  coin: 1,
  // The metals, priced off the mint. Copper is the shallow one a wooden pick
  // lifts; diamond is the floor of the world.
  copper_ingot: 6, zinc_ingot: 7, tin_ingot: 9, gold_ingot: 9,
  iron_ingot: 12, brass_ingot: 16, bronze_ingot: 18, silver_ingot: 20,
  diamond: 44,
  raw_copper: 4, raw_zinc: 5, raw_tin: 6, raw_gold: 6, raw_iron: 8,
  raw_silver: 14,
  // What a sheep and a bench are worth. Wool is dear because the only way to
  // get any is to keep something alive.
  leather: 5, bone: 2, bone_meal: 1, feather: 1, flint: 1, string: 3,
  paper: 2, book: 9, stick: 1,
  // Food, by how far it goes. The two apples are the exceptions the rule
  // could never guess.
  bread: 4, apple: 3, meat_raw: 3, meat_cooked: 7,
  silver_apple: 70, golden_apple: 130,
  // Ammunition and the things you point at people.
  arrow: 2, bow: 26, gunpowder: 6,
};
// Every fleece the same: a dyed one costs the dye on top, which the bench
// charges for already.
for (const c of (CS.WOOL_COLOURS ?? [])) PRICE[`wool_${c}`] = 7;
for (const c of (CS.WOOL_COLOURS ?? [])) PRICE[`bed_${c}`] = 30;
for (const t of TINT_NAMES) PRICE[`dye_${t}`] = 3;

// The rules, in the order they are asked. Each returns a price or null.
function priceRules(it) {
  // A trade good is already priced — `worth` is what one is worth to the
  // world that does not make it, and this is the same currency.
  if (it.worth) return it.worth * 3;
  // A tool or a weapon is its material plus the work: the tier is most of it
  // and the durability tells the two hammers of one tier apart.
  if (it.tool && it.tool.type !== TOOL.ARMOUR) {
    return Math.round(3 + (it.tool.tier ?? 0) * 8
      + (it.tool.durability ?? 60) / 70 + (it.tool.damage ?? 0) * 1.5);
  }
  // Armour by the points it stops, which is the only thing a buyer cares
  // about, plus a little for the plate it is made of.
  if (it.armour) return Math.round(9 + (it.armour.defence ?? 1) * 11);
  // Food by how far it goes. Saturation counts half: a thing that fills you
  // and keeps you full is worth more than a thing that only fills you.
  if (it.food) return Math.max(2, Math.round(it.food * 0.8 + (it.sat ?? 0) * 0.4));
  // A block, by how much work the ground makes of it. The hardness table is
  // the closest thing this game has to a measure of that, and the harvest
  // tier says whether you could have picked it up at all.
  if (it.block != null) {
    const info = BLOCK_INFO.get(it.block);
    if (info) {
      return Math.max(1, Math.round(1 + (info.hardness ?? 1) * 1.4
        + (info.harvest ?? 0) * 1.5));
    }
    return 2;
  }
  return null;
}

const _price = new Map();

// What a shop charges for one of these. Never zero — an item with no price at
// all would be free money in both directions.
export function priceOf(id) {
  if (_price.has(id)) return _price.get(id);
  const it = getItem(id);
  let p = it ? (PRICE[id] ?? priceRules(it)) : null;
  if (!(p > 0)) p = 3;
  p = Math.max(1, Math.round(p));
  _price.set(id, p);
  return p;
}

// ...and what it pays you for one. A shop lives on the spread: two fifths is
// harsh enough that buying to resell is never a living, and generous enough
// that clearing out a chest of ore is worth the walk.
export const SELL_RATE = 0.4;
export const sellPriceOf = (id) =>
  Math.max(1, Math.round(priceOf(id) * SELL_RATE));

// SIXTY-FOUR OF ANYTHING. A bed took a slot apiece, an apple stacked to
// sixteen, a book to eight — a chest of beds was a chest with twenty-seven
// beds in it, and a larder was full of nothing. A tool is the one thing that
// cannot stack, because each one carries its own wear.
export const stackSize = (id) => (getItem(id)?.tool ? 1 : 64);
export const isPlaceable = (id) => getItem(id)?.block != null;

// HELD FLAT, not as a cube.
//
// A held block is drawn as a little cube with the block's own tiles on it,
// which is right for anything that IS a cube and wrong for everything that is
// not: a torch in the fist came out as a box with a torch painted on all six
// faces, three of them visible at once and none of them upright, and a flower
// is the same picture in a different colour. Minecraft has the same rule and
// draws these as the item sprite instead.
//
// The test is the one the world already keeps: a block you can walk THROUGH is
// not a solid cube, so it is not held as one. The lights are named on top of
// that because a torch and a lantern stop you but are still a stick and a
// hanging box, not a cube of anything.
const HELD_STANDING = new Set([
  CS.BLOCK.TORCH, CS.BLOCK.LANTERN, CS.BLOCK.LAMP, CS.BLOCK.STREET_LAMP,
].filter((b) => b != null));
export const heldStanding = (id) => {
  const b = getItem(id)?.block;
  if (b == null) return false;
  return HELD_STANDING.has(b) || (CS.PASSABLE?.has(b) ?? false);
};
export const blockForItem = (id) => getItem(id)?.block ?? null;
export const toolOf = (id) => getItem(id)?.tool ?? null;

// --- what KIND of thing this is ---------------------------------------------
//
// One bucket per item, and `materials` is the catch-all that cannot miss. It
// lives here rather than in the UI that first needed it because it is a fact
// about the item, and two places now sort by it: the crafting screen's tabs
// and the bays of a shop's stockroom. A shelf and a cellar that disagreed
// about what a thing was would be two different shops.
const MINING_TOOLS = new Set(['pickaxe', 'axe', 'shovel', 'hoe']);
// `power` is the seventh, and it is the one that was hardest to live without.
// A rail, a wire, a switch, a dynamo and an electric lamp are all placeable,
// so every one of them filed itself under `building` and went to the bottom of
// a tab holding several hundred blocks — eight tints of glass, five timbers,
// every stair and slab of each. The one machine in this game you BUILD rather
// than mine was the hardest thing in it to find.
export const CATEGORIES = [
  'building', 'nature', 'tools', 'weapons', 'armour', 'food', 'power',
  'materials',
];

// WHAT THE WORLD IS MADE OF, as against what you build out of it.
//
// The building tab was every placeable block in the game, which is planks and
// bricks and glass and thatch AND the grass, dirt, sand, stone, logs, leaves
// and saplings the planet is made of — three hundred entries deep, with the
// wall you were looking for somewhere under the hillside. They are two
// different shelves in a player's head: one is a builder's merchant and the
// other is the ground outside, and the tab reads as the second one now.
//
// Logs are here rather than in `building` on purpose. A log is a tree; a
// PLANK is a building material, and the bench between them is the whole of
// what `make materials` means in this game.
const NATURE = new Set([
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.SAND_ORANGE, BLOCK.GRAVEL,
  BLOCK.STONE, BLOCK.CLAY, BLOCK.SNOW, BLOCK.ICE, BLOCK.LEAF, BLOCK.WATER,
  BLOCK.PATH, BLOCK.FARMLAND, BLOCK.LAVA,
].filter((b) => b != null));

function isNature(id) {
  const b = getItem(id)?.block;
  if (b == null) return false;
  // every species of log and every plant the generator sows — flowers, grass
  // tufts, saplings, crops, cactus, mushrooms — without listing one of them
  if (CS.isLog?.(b) || CS.PLANTS?.has?.(b)) return true;
  return NATURE.has(b);
}
// ---- THE FAMILY AN ITEM BELONGS TO -------------------------------------------
//
// The palette is a flat run of three hundred things, and most of that is the
// same thing in nine materials: nine planks, nine logs, nine doors, four
// slabs, four stairs, a sword and a pickaxe and an axe per metal. Scrolling
// past eight oaks to reach the birch is not browsing, it is filing.
//
// So the list is a TREE one level deep: a family opens into its members. The
// families are DERIVED and not listed, for the same reason the categories are
// — anything added later files itself. Explicit fields first, because they are
// the truth (a slab knows it is a slab); the last word of the NAME after that,
// which works because this game's names are systematic: "birch door", "oak
// door", "iron door" are three doors and say so.
const FAMILY_FIELD = (it, id) => {
  if (it.slab != null) return 'slab';
  if (it.stair != null) return 'stairs';
  if (it.armour ?? it.armor) return (it.armour ?? it.armor).slot ?? null;
  const t = toolOf(id);
  if (t?.type) return t.type;
  return null;
};

const FAMILY_STOP = new Set(['block', 'item', 'of', 'a', 'the']);

export function familyOf(id) {
  const it = getItem(id);
  if (!it) return null;
  const byField = FAMILY_FIELD(it, id);
  if (byField) return byField;
  const words = String(it.name ?? id).trim().toLowerCase().split(/\s+/);
  if (words.length < 2) return null;          // a one-word name is its own thing
  const last = words[words.length - 1];
  if (FAMILY_STOP.has(last)) return null;
  return last;
}

// What the family is CALLED in the list, which is the plural of it.
export function familyName(fam) {
  if (!fam) return '';
  if (fam.endsWith('s')) return fam;
  if (fam.endsWith('h') || fam.endsWith('x')) return `${fam}es`;
  return `${fam}s`;
}

export function categoryOf(id) {
  const it = getItem(id);
  if (!it) return 'materials';
  // armour before tools: a piece of armour may carry tool-ish fields for its
  // own durability, and it is armour first
  if (it.armour ?? it.armor) return 'armour';
  const tool = toolOf(id);
  if (tool) return MINING_TOOLS.has(tool.type) ? 'tools' : 'weapons';
  // A GUN IS A WEAPON. It carries `weapon` (the name combat.js looks its
  // ballistics up by) and a `gun` stat block, and none of the other tests
  // below catch either: a pistol has no tool, is not thrown, is not food and
  // places no block — so every firearm in the game fell through to `materials`
  // and the weapons tab was swords and a stick of dynamite. The ammo is not
  // here on purpose: a bullet is a material, and it is what the shelf full of
  // them should be filed under.
  if (it.weapon || it.gun) return 'weapons';
  // a thing you throw at somebody is a weapon, whatever it is made of
  if (it.throwable) return 'weapons';
  // THE NETWORK AND THE TRACK, before `building` can claim them for being
  // placeable. Rails and power fittings are the two things in this game that
  // only work as part of something else, and a player looking for the second
  // rail is looking for a set and not for a block.
  if (it.power || it.rail || it.wagon) return 'power';
  if (it.food != null) return 'food';
  // ...the ground, before `building` claims it for being placeable. See
  // NATURE: a hillside and a builder's merchant are two different shelves.
  if (isNature(id)) return 'nature';
  if (isPlaceable(id)) return 'building';
  return 'materials';
}

// --- mining -----------------------------------------------------------------

// Can this item break the block at all? Under-tiered tools spin forever, which
// is the signal that you need to go and craft something better.
export function canHarvest(itemId, block) {
  const tool = toolOf(itemId);
  return (tool?.tier ?? TIER.HAND) >= harvestTier(block);
}

// Mining speed multiplier over bare hands. Off-class tools give no bonus.
export function miningSpeed(itemId, block) {
  const tool = toolOf(itemId);
  if (!tool) return 1;
  return tool.classes.includes(blockClass(block)) ? tool.speed : 1;
}

// seconds to break, for a HUD or for main.js's progress bar
export function breakTime(itemId, block) {
  return blockHardness(block) / miningSpeed(itemId, block);
}

// What mining this block gives you. `rnd` is injectable so tests are stable.
// `smashed` opens the harvest gate. It is for the one caller that is not a
// tool at all: a blast brings stone down whether or not anybody is holding a
// pick, and asking "could this bare hand have mined it" of a rocket gets the
// answer "no" and drops nothing, which is not what a crater looks like. The
// price of opening it is paid at the call site, where only a fraction of what
// was destroyed leaves anything at all.
export function dropsFor(block, itemId = null, rnd = Math.random,
  smashed = false) {
  if (!smashed && !canHarvest(itemId, block)) return [];
  const info = blockInfo(block);
  const tool = toolOf(itemId);

  // leaves are the odd one out: mostly nothing, occasionally a sapling's worth
  // of sticks or an apple, which is where a hand-made tool chain starts
  if (info.cls === CLASS.PLANT && info.name === 'leaf') {
    const out = [];
    if (rnd() < 0.15) out.push({ id: 'stick', count: 1 });
    if (rnd() < 0.04) out.push({ id: 'apple', count: 1 });
    if (rnd() < 0.1) out.push({ id: 'seeds', count: 1 });
    if (rnd() < 0.07) out.push({ id: 'sapling', count: 1 });
    return out;
  }
  // Crops. Ripe wheat pays for the field — grain plus more seed than you
  // sowed — while an unripe stalk only ever gives the seed back, so there is
  // a real cost to harvesting early.
  if (block === BLOCK.WHEAT) {
    return [
      { id: 'wheat', count: 1 },
      { id: 'seeds', count: 1 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0) },
    ];
  }
  if (block === BLOCK.WHEAT_YOUNG) return [{ id: 'seeds', count: 1 }];
  // The kitchen garden, on wheat's terms. Every one of these plants ITSELF, so
  // "more than you sowed" is the whole payout and it is countable at a glance:
  // a ripe bed gives two to four of the vegetable for the one you put in, and
  // a plant pulled early gives back exactly the one — pulling early costs you
  // the increase, never the stock.
  const cropDrop = CROP_DROPS[block];
  if (cropDrop) {
    let n = cropDrop.min;
    for (const chance of cropDrop.extra) if (rnd() < chance) n += 1;
    return [{ id: cropDrop.id, count: n }];
  }
  // glass shatters unless you are careful; nothing here is careful yet
  if (!info.drop) return [];
  // gravel usually stays gravel, flint is the lucky roll
  if (info.name === 'gravel') {
    return [{ id: rnd() < 0.12 ? 'flint' : 'gravel', count: 1 }];
  }
  // an axe on wood also shaves off a stick now and then
  const out = [{ id: info.drop, count: 1 }];
  if (tool?.type === TOOL.AXE && info.cls === CLASS.WOOD && rnd() < 0.2) {
    out.push({ id: 'stick', count: 1 });
  }
  return out;
}

// every item id, in registry order — handy for a creative palette or tests
export const allItemIds = () => Object.keys(ITEMS);

// --- farming ----------------------------------------------------------------
//
// The world has no flat array and no per-cell tick: at radius 800 the shell is
// over a billion cells, so *scanning* for crops is not merely slow, it is
// impossible. Growth is therefore driven from a small explicit set of planted
// positions (`Crops`) that only ever gains an entry when the player plants
// one, and loses it the moment the crop ripens or the cell stops matching.
// Cost per tick is O(planted), typically tens, and independent of world size.

const defined = (...b) => b.filter((x) => x !== undefined && x !== null);

const FARMLAND_BLOCKS = new Set(defined(BLOCK.FARMLAND, BLOCK.TILLED));
// NOTHING GROWS IN A ROAD. A path was on this list, so a sapling, a flower, a
// mushroom and every crop in the game could be planted in the middle of a
// street — and a village that had just paved its green spent the next week
// sprouting through it. A path is trodden earth: the treading is the point,
// and it is the one soil in the game that is deliberately dead.
//
// It stays TILLABLE, which is a different question and a deliberate one: a
// hoe turns a path back into farmland, so ground you have given up on as a
// road can be made a field again by somebody who wants it.
const PLANT_SOIL = new Set(defined(
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.FARMLAND, BLOCK.TILLED,
));

export const isFarmland = (b) => FARMLAND_BLOCKS.has(b);
export const isPlantSoil = (b) => PLANT_SOIL.has(b);
export const isTillable = (b) =>
  b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.PATH;

// What a hoe does to this block, or null if nothing. Only a hoe tills, which
// is the hoe's entire reason to exist — it mines nothing faster than a shovel.
export function tillResult(itemId, block) {
  if (toolOf(itemId)?.type !== TOOL.HOE) return null;
  if (!isTillable(block)) return null;
  return BLOCK.FARMLAND ?? BLOCK.TILLED ?? null;
}

// A crop is a seed item plus the blocks it passes through. `grow` marks a
// plant that turns into something the world module must build (a tree), so
// the last step reports it rather than swapping a block.
export const CROPS = {
  wheat: {
    seed: 'seeds', stages: defined(BLOCK.WHEAT_YOUNG, BLOCK.WHEAT),
    time: 45, vary: 0.35, soil: 'farmland',
  },
  sapling: {
    seed: 'sapling', stages: defined(BLOCK.SAPLING),
    time: 150, vary: 0.4, soil: 'ground', grow: 'tree',
  },
  // Bamboo is the one plant that does not turn into anything: it gets TALLER.
  // So it has one stage and `grow: 'up'`, and what tickCrops reports when it
  // comes on is a new cane one cell ABOVE the old one — which means the change
  // goes through main.js's ordinary setBlock with nothing there knowing that
  // bamboo is different from wheat. See tickCrops at the foot of this file.
  bamboo: {
    seed: 'bamboo', stages: defined(BLOCK.BAMBOO),
    time: 55, vary: 0.4, soil: 'ground', grow: 'up',
  },
};

// How tall a stalk gets on its own. The same ceiling the generator plants to,
// so a grove you grow and a grove you find are the same height.
const STALK_MAX = 7;

// The four after wheat. `time` is seconds to ripen and it is the one number
// that separates them as a thing to grow rather than a thing to eat: a salad
// is a leaf and comes in well under a minute, a pepper has to set fruit and
// takes nearly twice as long. `extra` is the chances of a bonus on top of
// `min` when the bed is pulled ripe — see dropsFor.
const GARDEN = [
  { crop: 'carrot', time: 50, min: 2, extra: [0.55, 0.3] },
  { crop: 'potato', time: 55, min: 2, extra: [0.6, 0.3] },
  { crop: 'pepper', time: 65, min: 2, extra: [0.45] },
  { crop: 'salad', time: 35, min: 2, extra: [0.35] },
  // The gourds. Both are slower than anything above them, which is the price
  // of the bulk — and they part company on what the wait buys. A pumpkin is
  // ONE big thing: you get two, sometimes three, and each is worth four of
  // the salad. A melon is many small ones, so it pays the most heads of any
  // crop in the game and the least food per head.
  { crop: 'pumpkin', time: 85, min: 2, extra: [0.4] },
  { crop: 'watermelon', time: 70, min: 3, extra: [0.5, 0.3] },
];

// block id -> what pulling it up pays. Built here so dropsFor above needs no
// knowledge of the id arithmetic, and so a stage that a build of cubesphere
// has not got simply does not appear.
const CROP_DROPS = {};

for (const g of GARDEN) {
  const i = CROP_KINDS.indexOf(g.crop);
  if (i < 0) continue;                    // this build of the world has no crops
  const young = cropIdOf(i, 0), ripe = cropIdOf(i, 1);
  CROPS[g.crop] = {
    seed: g.crop, stages: defined(young, ripe),
    time: g.time, vary: 0.32, soil: 'farmland',
  };
  if (young != null) CROP_DROPS[young] = { id: g.crop, min: 1, extra: [] };
  if (ripe != null) CROP_DROPS[ripe] = { id: g.crop, min: g.min, extra: g.extra };
}

export const SEED_OF = {};
for (const [kind, spec] of Object.entries(CROPS)) SEED_OF[spec.seed] = kind;

// growth steps: one per stage change, plus one more if it turns into a tree
const stepCount = (spec) => spec.stages.length - 1 + (spec.grow ? 1 : 0);
const stageBlock = (spec, stage) =>
  spec.stages[Math.min(stage, spec.stages.length - 1)];
// stagger the field: identical planting times must not ripen in lockstep
const stepTime = (spec, rnd) =>
  spec.time * (1 - spec.vary + rnd() * 2 * spec.vary);

export const isCropBlock = (b) =>
  Object.values(CROPS).some((s) => s.stages.includes(b));
// "ready to pull": the LAST stage of any crop that has more than one, which is
// wheat's rule generalised rather than wheat's rule plus four special cases
export const isRipe = (b) => Object.values(CROPS).some(
  (s) => s.stages.length > 1 && s.stages[s.stages.length - 1] === b);

// Will this item stand on that block? Seeds want tilled soil; flowers and
// mushrooms only need something soft; everything else is unrestricted.
export function canPlantOn(itemId, below) {
  // A cane stands on the ground OR on another cane. Without the second half a
  // bamboo you can only ever lay one course of is not bamboo, it is a shrub.
  if (BLOCK.BAMBOO != null && blockForItem(itemId) === BLOCK.BAMBOO) {
    return isPlantSoil(below) || below === BLOCK.BAMBOO;
  }
  const kind = SEED_OF[itemId];
  if (kind) {
    return CROPS[kind].soil === 'farmland'
      ? isFarmland(below) : isPlantSoil(below);
  }
  const b = blockForItem(itemId);
  return CS.PLANTS?.has?.(b) ? isPlantSoil(below) : true;
}

// The tracked planted cells. Keys are strings so the set survives a change of
// world size (S and H are not baked into them).
export class Crops {
  constructor() { this.map = new Map(); }

  static key(f, u, v, h) { return `${f},${u},${v},${h}`; }

  get size() { return this.map.size; }

  // Register a planted cell. Returns the block to place, or null.
  plant(f, u, v, h, kind = 'wheat', rnd = Math.random) {
    const spec = CROPS[kind];
    if (!spec || !spec.stages.length) return null;
    this.map.set(Crops.key(f, u, v, h), {
      f, u, v, h, kind, stage: 0, t: 0, need: stepTime(spec, rnd),
    });
    return spec.stages[0];
  }

  at(f, u, v, h) { return this.map.get(Crops.key(f, u, v, h)) ?? null; }
  forget(f, u, v, h) { return this.map.delete(Crops.key(f, u, v, h)); }
  list() { return [...this.map.values()]; }
  clear() { this.map.clear(); }

  toJSON() { return this.list(); }

  load(data) {
    this.map.clear();
    for (const e of data ?? []) {
      if (!CROPS[e?.kind]) continue;
      this.map.set(Crops.key(e.f, e.u, e.v, e.h), { ...e });
    }
  }
}

// Plant a seed item at a cell. Checks the cell is free and the soil below is
// right, registers the crop and hands back the block for main.js to set.
export function plantSeed(planet, crops, f, u, v, h, itemId,
  rnd = Math.random) {
  const kind = SEED_OF[itemId];
  if (!kind) return null;
  if (planet) {
    const here = planet.get(f, u, v, h);
    if (here !== BLOCK.AIR) return null;
    if (!canPlantOn(itemId, planet.get(f, u, v, h - 1))) return null;
  }
  return crops.plant(f, u, v, h, kind, rnd);
}

// Advance every tracked crop by `dt` seconds. Returns the cells that changed,
// `[{ f, u, v, h, kind, stage, block, ripe, grow }]`, for main.js to apply
// with its own setBlock so the chunk remesh happens exactly once per cell.
//
// Entries whose cell no longer holds the expected block are dropped: that is
// how harvesting, trampling and "I built a house on my field" all clean up
// without anyone having to call forget().
export function tickCrops(planet, crops, dt, { rnd = Math.random,
  max = Infinity } = {}) {
  const changes = [];
  if (!crops || !(dt > 0)) return changes;
  let seen = 0;
  // New entries are collected and added AFTER the walk. A Map visits keys
  // added during its own iteration, so a cane that grew would be ticked again
  // in the same call — and a stalk would shoot up a whole grove in one frame.
  const born = [];
  for (const [key, c] of crops.map) {
    if (seen++ >= max) break;
    const spec = CROPS[c.kind];
    if (!spec) { crops.map.delete(key); continue; }
    if (planet && planet.get(c.f, c.u, c.v, c.h) !== stageBlock(spec, c.stage)) {
      crops.map.delete(key);
      continue;
    }
    // a crop whose soil was dug out simply stops — it does not die
    if (planet && spec.soil === 'farmland'
      && !isFarmland(planet.get(c.f, c.u, c.v, c.h - 1))) continue;

    c.t += dt;
    const steps = stepCount(spec);
    let moved = false;
    while (c.t >= c.need && c.stage < steps) {
      c.t -= c.need;
      c.stage += 1;
      c.need = stepTime(spec, rnd);
      moved = true;
    }
    if (!moved) continue;
    const ripe = c.stage >= steps;

    // The one plant that grows UPWARD instead of onward. Everything about it
    // stays in this branch: the cell that changes is the one above, the new
    // cane is what carries on growing, and the stalk stops at STALK_MAX or at
    // whatever is over its head. A caller that only knows how to setBlock a
    // reported cell gets bamboo for nothing.
    if (ripe && spec.grow === 'up') {
      crops.map.delete(key);
      if (!planet) continue;
      const h2 = c.h + 1;
      if (planet.H != null && h2 >= planet.H) continue;
      if (planet.get(c.f, c.u, c.v, h2) !== BLOCK.AIR) continue;
      let tall = 0;
      const top = stageBlock(spec, 0);
      while (tall < STALK_MAX
        && planet.get(c.f, c.u, c.v, c.h - tall) === top) tall++;
      if (tall >= STALK_MAX) continue;
      changes.push({
        f: c.f, u: c.u, v: c.v, h: h2, kind: c.kind, stage: 0,
        block: top, ripe: false, grow: null,
      });
      born.push({ f: c.f, u: c.u, v: c.v, h: h2, kind: c.kind, stage: 0,
        t: 0, need: stepTime(spec, rnd) });
      continue;
    }

    changes.push({
      f: c.f, u: c.u, v: c.v, h: c.h, kind: c.kind, stage: c.stage,
      block: stageBlock(spec, c.stage), ripe,
      grow: ripe ? spec.grow ?? null : null,
    });
    if (ripe) crops.map.delete(key);   // nothing left to tick
  }
  for (const b of born) crops.map.set(Crops.key(b.f, b.u, b.v, b.h), b);
  return changes;
}
