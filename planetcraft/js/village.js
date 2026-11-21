// village.js — settlements placed onto a generated planet.
//
// Kept out of cubesphere.js so world generation and structure generation can
// evolve independently. Called by main.js after the Planet is built.
//
// Everything is laid out in one face's (u, v) grid with +h as up, so a house
// is built exactly as it would be on a flat world. Structures never cross a
// face seam: sites keep a margin and anything running off the edge is skipped,
// because the neighbouring face's grid is rotated and a wrapped wall would
// come out sheared.
//
// --- the architecture ------------------------------------------------------
//
// A village is one settlement, not a sampler of styles. Every building in a
// village shares a vernacular (a plinth material, a wall material, a framing
// timber and a roof covering) picked once per village, and differs from its
// neighbours in size, storeys and detail rather than in style. The shared
// grammar is:
//
//   plinth course  stone or brick where the wall meets the wet ground
//   quoins         a corner post or alternating stones on every corner
//   sill / lintel  a pale timber under and over every opening
//   wall plate     a continuous timber band along the top of every wall,
//                  which is also the lintel of every window below it
//   bays           windows spaced from the wall's own length, symmetric
//   eaves          a half-block fascia projecting past the wall, then the
//                  pitch, so the roof edge is thin instead of a cliff
//   roof           stairs, one cell of rise per cell of run, capped with a
//                  slab ridge; gables closed and carried past the wall as a
//                  verge, with a chimney or a dormer breaking the line
//
// Buildings stand in rows along four streets that meet at a green, set back
// behind a fenced front garden, so the settlement reads as addressed to the
// street rather than scattered.
//
// Slabs and stairs are decoration only, never floor: the physics treats a
// half block as full height, so a player standing on a slab path would float.
// Sills, eaves, ridges, canopies and furniture are safe; walkways are not.

import { BLOCK, S, H, dirFromCell } from './cubesphere.js';
// namespace import as well, for the parts of the enum that arrived later:
// cubesphere.js is owned elsewhere and a missing *named* import is a hard
// module error that would take the whole game down with it.
import * as CS from './cubesphere.js';
import * as BP from './blueprint.js';
import { ART_BADGE } from './cubemesher.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A cell hash. cubesphere.js keeps its own and does not export it — this file
// already keeps its own mulberry32 for the same reason, and a generator that
// reaches into another module's private helpers is a generator that breaks
// the day that module tidies up.
function cellHash(a, b, c, d) {
  let n = (a * 374761393 + b * 668265263 + c * 2147483647 + d) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

// --- blocks this file would like to have -----------------------------------
//
// cubesphere.js and textures.js are owned elsewhere, so these ids are a
// request rather than a fact — see INTEGRATION-village.md for the textures
// each one wants. Resolution order per name:
//   1. BLOCK[name], the moment the real enum gains it (nothing to do here),
//   2. the provisional id below, if the name is listed in LIVE,
//   3. a fallback existing block chosen so the SHAPE still reads — a missing
//      glass block becomes an open window rather than a blind wall.
const EXTRA = {
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
  TABLE: 67,
  LAMP: 72,
  STREET_LAMP: 73,
  CAMPFIRE: 74,
};

const FALLBACK = {
  GLASS: BLOCK.AIR,          // a hole beats a solid pane-shaped wall
  BRICK: BLOCK.COBBLE,
  THATCH: BLOCK.LEAF,        // organic and non-plank, so roofs still contrast
  PATH: BLOCK.DIRT,
  FARMLAND: BLOCK.DIRT,
  WHEAT: BLOCK.LEAF,
  FENCE: BLOCK.LOG,
  LANTERN: BLOCK.SAND,       // palest existing tile, reads as a light
  CHEST: BLOCK.LOG,
  STRIPPED_LOG: BLOCK.PLANK,
  TABLE: BLOCK.PLANK,
  LAMP: BLOCK.SAND,
  STREET_LAMP: BLOCK.SAND,
  CAMPFIRE: BLOCK.LOG,
};

// every name below is now real in the BLOCK enum, so the provisional ids and
// fallbacks are only kept for safety
const LIVE = new Set(Object.keys(EXTRA));

const B = {};
for (const name of Object.keys(EXTRA)) {
  B[name] = BLOCK[name] ?? (LIVE.has(name) ? EXTRA[name] : FALLBACK[name]);
}
// The library's shelves. Deliberately not in EXTRA: there is no provisional
// id worth guessing for it, so it is either the real block or planks — and a
// wall of planks still reads as joinery rather than as a hole, which is the
// whole point of the fallback table above.
B.BOOKSHELF = BLOCK.BOOKSHELF ?? BLOCK.PLANK;
// The reading desk a priest stands at. It was NEVER DECLARED: the church and
// the mosque both ask for `B.LECTERN`, `B` only carries the names in EXTRA and
// the few written out here, so both of them have been setting a cell to
// `undefined` — which is to say leaving it empty — since the day the priest was
// written. The chief's hall got its desk because it asks for BLOCK.LECTERN
// direct. A table is the stand-in, because a man reading to a hall off a table
// is a man reading to a hall.
B.LECTERN = BLOCK.LECTERN ?? BLOCK.TABLE ?? BLOCK.PLANK;
// The shop's coining press. A block of iron is the honest stand-in — it is
// mostly what the press IS — and it still reads as a machine behind the
// counter rather than as a gap in the floorboards.
B.MINT = BLOCK.MINT ?? BLOCK.BLOCK_IRON ?? BLOCK.FURNACE ?? BLOCK.COBBLE;
// The tower's bell. A cast bell is a lump of bronze, so a block of metal is
// the honest stand-in until the real one exists — it still reads as
// something deliberate hanging in the belfry rather than as a gap.
B.BELL = BLOCK.BELL ?? BLOCK.BLOCK_BRASS ?? BLOCK.BLOCK_GOLD ?? BLOCK.LOG;
// The lamp mast. Falls back to a whole timber, which is what it used to be
// and what the player asked to be rid of — so the fallback is honest but
// the real block is the point.
B.POST = BLOCK.POST ?? BLOCK.LOG;
// The café's water pipe. Nothing stands in for a shisha — a café with no
// pipes in it is a café with nothing to smoke, and that is what it gets.
B.SHISHA = BLOCK.SHISHA ?? null;
// ...and what the bartender puts on the counter. Tea in the café, ale in the
// pub, and nothing stands in for either: a bar with no glasses on it is a
// shelf, and a shelf is what a world without these blocks gets.
B.TEA_GLASS = BLOCK.TEA_GLASS ?? null;
B.TANKARD = BLOCK.TANKARD ?? null;
// ...and what each room stacks on the keeper's own side of the counter. A pub
// has casks of it; a café has the brass urn the tea comes out of, which is
// the one thing on a café's back bar you can see from the door.
B.CASK = BLOCK.STRIPPED_LOG ?? BLOCK.LOG;
B.URN = BLOCK.BLOCK_BRONZE ?? BLOCK.BLOCK_BRASS ?? B.CASK;
// ...and the toilet, oriented like a chair: the facing is where the cistern
// stands, which is the wall it backs onto.
const toilet = CS.toiletId ?? (() => null);
// WHAT GOES IN A WINDOW. A pane, not a block of glass: a solid cube of glass
// in a wall reads as a wall somebody forgot to build, and every house on the
// planet had them. A pane is a thin sheet that joins up with whatever is next
// to it, so a two-cell light comes out as one window with a bar down it — see
// emitPane in cubemesher.js — and a lone pane is a full sheet rather than a
// stub. Falls back to the old glass block on a world whose enum predates it.
B.PANE = CS.paneId ? CS.paneId(-1) : B.GLASS;
// ...and the coloured ones, in the glass-tint order: white, red, orange,
// yellow, green, blue, purple, black.
const pane = CS.paneId ? (tint) => CS.paneId(tint) : () => B.GLASS;

// Hanging a door needs the facing the wall runs in, which is what the
// outward normal gives us. Returns null on a world whose block enum predates
// doors, and then carveDoor simply leaves the opening it always left.
const DOOR_TIMBERS = [0, 1, 2, 3, 4];   // the five timber species, not iron/glass
// `low` says which END of the opening this leaf hangs on: true for the one
// nearer the start of the wall, false for the one nearer its end. It is only
// asked of a PAIR. A lone leaf passes null and keeps the hinge this game has
// always given it — which is not the same end of the wall on all four facings
// and never was, and a single front door that quietly changed side is exactly
// what a double door is not worth.
const hangDoor = CS.doorBlockId
  ? (du, dv, low = null) => {
    // stairs' facing order: +u, -u, +v, -v — the side the leaf's hinge wall is
    const facing = du > 0 ? 0 : du < 0 ? 1 : dv > 0 ? 2 : 3;
    // the timber is picked from the cell so one village's doors match each
    // other rather than flickering species house to house
    const t = DOOR_TIMBERS[Math.abs((facing * 7 + 3)) % DOOR_TIMBERS.length];
    const hinge = low == null || !CS.doorHingeFor
      ? 0 : CS.doorHingeFor(facing, low);
    return CS.doorBlockId(t, facing, true, hinge);
  }
  : null;

// --- stairs, slabs and ladders ---------------------------------------------
//
// Orientation lives in the block id. Facing 0..3 is +u, -u, +v, -v and means
// "the side of the cell the raised half sits on", so a roof stair's facing
// points UP the pitch, toward the ridge, and its exposed step looks outward
// and downslope. Slabs take a half: 0 bottom, 1 top.

const MAT = { PLANK: 0, COBBLE: 1, BRICK: 2, THATCH: 3 };
const MAT_BLOCK = [BLOCK.PLANK, BLOCK.COBBLE, B.BRICK, B.THATCH];

// degrade to a full block of the same material if the world predates them,
// so a village built on an older cubesphere is blocky but still whole
const stair = CS.stairId
  ? (m, facing) => CS.stairId(m, facing) : (m) => MAT_BLOCK[m];
const slab = CS.slabId
  ? (m, half) => CS.slabId(m, half) : (m) => MAT_BLOCK[m];
const ladder = CS.ladderId ? (facing) => CS.ladderId(facing) : () => BLOCK.LOG;
// a chair degrades to the stool it used to be: a stair with its back the
// same way round
const chair = CS.chairId
  ? (facing) => CS.chairId(facing) : (facing) => stair(MAT.PLANK, facing);
// ...and a bed to the block of trim it used to be drawn as, on a world built
// before wool existed. `facing` names the side the pillow is on.
const bed = CS.bedId
  ? (tint, facing) => CS.bedId(tint, facing) : () => BLOCK.PLANK;
const bedFoot = CS.bedFootId
  ? (tint, facing) => CS.bedFootId(tint, facing) : () => BLOCK.PLANK;

// LAY A BED — both cells of it, and write it down once.
//
// A bed is two cells (see BED_FOOT_BASE in cubesphere.js) and every one in the
// world goes down through here, so the step from head to foot is worked out in
// exactly one place and no room has to remember which way its own beds run.
// `u, v` is the HEAD — the end with the pillow, which is the end that goes
// against the wall — and `facing` names the side the pillow is on.
//
// The foot only goes down if the cell for it is empty and is not `avoid` — the
// doorstep, where nothing may stand (see furnish). A bed jammed into a corner
// with something already in its other half would otherwise eat that something,
// and a bed grown across a doorway would wall the house up. A head on its own
// still draws and can still be slept in, which is what an old one-cell bed in a
// save is too, so losing the foot costs the look and nothing else.
//
// Either way the bed is logged once, because a bed is one bed however many
// cells it takes — and that count is the village's population cap.
function layBed(planet, f, u, v, h, tint, facing, avoid = null) {
  planet.set(f, u, v, h, bed(tint, facing));
  const [fu, fv] = CS.bedFootCell(u, v, facing);
  const barred = avoid && avoid.u === fu && avoid.v === fv;
  if (!barred && planet.get(f, fu, fv, h) === BLOCK.AIR) {
    planet.set(f, fu, fv, h, bedFoot(tint, facing));
  }
  logBed(f, u, v, h);
}

// --- lights the renderer should know about ----------------------------------
//
// There is no light propagation, so a lamp "being lit" is an overlay sprite
// main.js adds per cell (see blockanim.js). Nothing scans the world for lamp
// ids — that is the rule — so the generator writes down where it put them.
// buildVillage collects into this log and hangs it off the site as
// `site.glow`; main.js walks the first few villages' logs after buildWorld,
// the same cap the villagers use.
let glowLog = null;

// --- every bed in the village, written down ---------------------------------
//
// A bed is not decoration any more: it is a place for somebody to sleep, and a
// village only grows to the number of beds it has (see main.js's pairing). So
// each one has to be findable without scanning the world for bed ids, which is
// the rule this whole file is written to — nothing ever searches the blocks
// for what the generator already knows it put there.
//
// Same shape as glowLog: buildVillage points it at the site's own list for the
// length of the build and nulls it afterwards, so a bed laid by a builder that
// runs outside a village (a wreck, a ruin) simply is not counted.
let bedLog = null;
export function logBed(f, u, v, h) {
  if (bedLog) bedLog.push({ f, u, v, h });
}
const glow = (f, u, v, h) => { glowLog?.push({ f, u, v, h }); };

// --- every bell in the village, written down ---------------------------------
//
// The bell is the village's RIGHT TO BE ONE. Take it down and the settlement
// is unfounded — its people stop working for its chief and walk off to find
// work somewhere that still has a bell — and hang one of your own in the
// empty belfry and the place is yours. main.js does all of that; this only
// writes down where the generator hung them, on exactly the terms the lamps
// and the beds are written down, so that nothing ever has to scan a tower
// for a bell block to know whether the village still stands.
let bellLog = null;
const noteBell = (f, u, v, h) => { bellLog?.push({ f, u, v, h }); };

// --- every water pipe in the village, written down ---------------------------
//
// Same shape as glowLog and for the same reason: a lit shisha SMOKES (see the
// water pipe in blockanim.js), the smoke is an overlay main.js hangs on a
// cell, and nothing in this game ever scans the world for a block id. It is a
// list of its own and not part of `glow` because `glow` is what litColumn asks
// "is this street already lit" — a coal on a pipe indoors is not a lamp, and
// filing it as one would leave a dark lane outside every café.
let pipeLog = null;
const puff = (f, u, v, h) => { pipeLog?.push({ f, u, v, h }); };

// --- the lettered plaques ----------------------------------------------------
//
// A name board over a gate says which VILLAGE this is. A plaque says which
// BUILDING, and it is the same machinery — a canvas hung on a cell by main.js,
// because a voxel atlas cannot spell. A room whose door is one hole in one
// wall among twenty is a room you find by opening every door; three letters
// over the lintel and you find it from the street.
//
// The record is the gate board's record, so main.js can letter both from one
// loop and size both with one boardRun: `ax`/`sgn` name the way the door
// faces, and `out` is the step from the plaque's cell to the cell in front of
// it, which is what says which way the lettering is turned.
let plaqueLog = null;
function plaque(planet, f, door, label, b, span = 3) {
  if (!plaqueLog || !door || !label) return;
  const { u, v, du, dv } = door;
  const h = b + 3;                     // the lintel course, over a two-tall door
  if (planet.get(f, u, v, h) === BLOCK.AIR) return;   // nothing to nail it to
  const d0 = dirFromCell(f, u + 0.5, v + 0.5);
  const d1 = dirFromCell(f, u + du + 0.5, v + dv + 0.5);
  plaqueLog.push({
    f, u, v, h, label, span,
    // ONE SIDED, unlike a gate board. A gate is read coming in and going out
    // and its board is lettered on both faces; a plaque is on the front of a
    // building and the other side of it is somebody's ceiling. It changes two
    // things: only the outward quad is drawn, and only the outward face has
    // to be clear for a cell to count as part of the board — the wall beside
    // a privy's door has the privy behind it, and asking for air on both
    // sides shrank every one of them to the single cell over the lintel.
    oneSided: true,
    ax: du ? 0 : 1,
    sgn: du ? Math.sign(du) : Math.sign(dv),
    dir: [d0[0], d0[1], d0[2]],
    out: [d1[0] - d0[0], d1[1] - d0[1], d1[2] - d0[2]],
  });
}

// --- every toilet in the village, written down --------------------------------
//
// Same shape and same argument as the beds: a villager goes to one every six
// hours (see tryLoo in entities.js), and nothing may search the blocks for
// what the generator already knows it put there. buildVillage points this at
// the site's own list for the length of the build, growSite at the same list
// while a house goes up, and a toilet the player puts down is added to the
// nearest village's list by main.js when it is placed — so a house you build
// yourself counts, exactly as a bed you lay does.
let looLog = null;
export function logLoo(f, u, v, h, facing) {
  if (looLog) looLog.push({ f, u, v, h, facing });
}

// --- which buildings are somebody's HOME ------------------------------------
//
// A bed goes in a bedroom, and a village has fewer of those than it has
// buildings. work.js used to pick the spot for a new bed out of EVERY building
// the generator had written down, so the beds a villager made turned up in the
// chief's hall, on the shop floor and along the nave of the church — a bed in
// a room that was never a bedroom.
//
// The test does not look at a single block, because it does not have to: the
// generator knows which builder it just ran, and a builder that lays a bed is
// building somewhere people sleep. A cottage furnishes one, a barracks lays
// three a floor, and the hall, the shop, the church, the smithy, the barn and
// the watchtower lay none — so none of those is a home and none of them gets
// another bed put in it.
// ...and WHICH FLOOR of it people sleep on. A house with a loft puts its beds
// UP there (see bedroom() below), and a bed somebody makes later has to extend
// that row rather than start a new one across the front door — so work.js
// needs the height, and the generator is the only thing that knows it.
//
// Read the same way the bed count is: bedMark() before the build wipes the
// slate, sleepsAt() after it answers what the builder wrote on it. A builder
// with no loft writes nothing and answers null, which is the honest answer —
// its beds are on the ground floor with the door.
let sleepFloor = null;
const bedMark = () => { sleepFloor = null; return bedLog?.length ?? 0; };
const laidBed = (mark) => (bedLog?.length ?? 0) > mark;
const sleepsAt = () => sleepFloor;

// --- vernaculars -----------------------------------------------------------
//
// One per village. `roof` is a stair/slab material index; everything else is a
// block id. The three differ in what the walls are made of, not in how a
// building is put together, which is the point: a stone village and a timber
// village are recognisably the same architecture.
const VERNACULARS = [
  {                                  // timber framing under thatch
    name: 'thatch',
    plinth: BLOCK.COBBLE, wall: BLOCK.PLANK, upper: BLOCK.PLANK,
    frame: BLOCK.LOG, trim: B.STRIPPED_LOG,
    quoinA: BLOCK.LOG, quoinB: BLOCK.LOG,
    roof: MAT.THATCH, roofBlock: B.THATCH, hearth: BLOCK.COBBLE,
  },
  {                                  // brick below, timber above, shingle roof
    name: 'brick',
    plinth: B.BRICK, wall: B.BRICK, upper: BLOCK.PLANK,
    frame: B.STRIPPED_LOG, trim: B.STRIPPED_LOG,
    quoinA: B.BRICK, quoinB: BLOCK.COBBLE,
    roof: MAT.PLANK, roofBlock: BLOCK.PLANK, hearth: B.BRICK,
  },
  {                                  // rubble stone under thatch
    name: 'stone',
    plinth: BLOCK.COBBLE, wall: BLOCK.COBBLE, upper: BLOCK.PLANK,
    frame: BLOCK.LOG, trim: B.STRIPPED_LOG,
    quoinA: BLOCK.COBBLE, quoinB: B.BRICK,
    roof: MAT.THATCH, roofBlock: B.THATCH, hearth: BLOCK.COBBLE,
  },
];

// --- cultures ---------------------------------------------------------------
//
// A CULTURE is a people, and it belongs to the PRESET rather than to the body:
// every Cinder world in every system is built by the same hands, so a player
// who has learned to read one has learned to read all of them. It is also part
// of the world's identity for free — the preset already is — so nothing has to
// be stored or shipped for two machines to build the same village.
//
// The whole thing is carried on the vernacular object every builder already
// takes. That is the point of the design: `storey`, `roof`, `carveDoor` and
// the light fixtures read these fields off `vern`, so a culture is mostly a
// data row and the ten coded archetypes come out in its materials without
// knowing it happened.
//
// The fields a culture may set, over and above the materials above:
//
//   style      the roof grammar — see roof() below. 'gable' is the pitched
//              stair roof this file has always laid and the default.
//   glass      what fills a window. null means the opening is a HOLE, which
//              is what a people who cannot make glass actually build.
//   light      the block a fixture uses. A torch instead of a lantern changes
//              what a whole village looks like after dark.
//   door       false to leave the doorway open — no leaf, no hinge.
//   finial     a block set at each end of the ridge, for the roofs that have
//              one. Nothing else in the game has finials, so they read.
//   eaves      extra cells the fascia projects. 1 is the eave this file has
//              always had; 2 or 3 is a temple.
//   specials   the public buildings this culture keeps, replacing the default
//              church/tower/smithy/shop/library. Same shape as SPECIALS.
//
const CULTURES = {};

// Register one. `verns` is the list a village of this culture picks from —
// one entry is a monoculture, which is right for a people who all build the
// same way, and several is the variety terran has always had.
function culture(id, o) {
  const dress = (v) => ({
    // the culture's own defaults, then the vernacular's own overrides, so a
    // single row inside a culture can still break ranks where it needs to
    style: o.style ?? 'gable',
    glass: o.glass === undefined ? B.PANE : o.glass,
    light: o.light ?? B.LANTERN,
    // the two fixtures that are not the hanging lantern: the head of a
    // street lamp, and the lamp that stands on a table indoors
    streetLight: o.streetLight ?? B.STREET_LAMP,
    roomLight: o.roomLight ?? B.LAMP,
    door: o.door !== false,
    finial: o.finial ?? null,
    eaves: o.eaves ?? 1,
    racks: o.racks ?? 0,
    // the one piece of furniture that belongs to this people — see FITTINGS
    fitting: o.fitting ?? null,
    // What colour this people's blankets are, as a pair of WOOL_COLOURS
    // indices: the dyed one they favour and the undyed one their own flock
    // gives them. Every bedroom rolls between the two, so a street has both
    // in it and neither is the "wrong" bed — see furnish.
    bed: o.bed ?? [1, 8],
    culture: id,
    ...v,
  });
  const verns = o.verns.map(dress);
  CULTURES[id] = {
    id, name: o.name, verns,
    // The one vernacular no street ever gets: what this people build when
    // they build on water. Absent on a culture with no lake dwellers, and
    // then buildVillages simply lays no fen village on that world.
    fen: o.fen ? dress(o.fen) : null,
    specials: o.specials ?? null,
    // archetypes this people does not build — see rankPools
    drop: o.drop ? new Set(o.drop) : null,
  };
  return CULTURES[id];
}

// --- what a place is called ---------------------------------------------------
//
// Every settlement has a name, and the name is a pure function of (its cell,
// the world seed) — the same rule the whole planet is built on. Nothing is
// stored, nothing is sent, and two machines in one world read the same name
// off the same board.
//
// The syllables are the culture's. That is the point of doing it here rather
// than with one global list: Ashcombe and Meghpur and Kazemura are three
// different peoples before you have met any of them, and the sign at the road
// mouth is usually the first thing you do meet.
const PLACE_WORDS = {
  terran: {
    head: ['Ash', 'Brook', 'Elm', 'Old', 'Hart', 'Fern', 'Mill', 'Stan',
      'Ox', 'Well', 'Wye', 'Bram', 'Thorn', 'Grey', 'Hollow', 'Marl'],
    tail: ['ford', 'bury', 'ton', 'field', 'combe', 'stead', 'wick', 'moor',
      'bridge', 'ley', 'hurst', 'dean'],
  },
  // Cinder: short, hard, and mostly consonant. A people who name a place
  // after what it cost to hold it.
  coal: {
    head: ['Kor', 'Vash', 'Drum', 'Gorr', 'Hask', 'Mur', 'Brak', 'Thurn'],
    tail: ['grim', 'hold', 'dun', 'reik', 'mor', 'gard', 'skar'],
  },
  // Thalassa: the water, the wind and the shore, in the language of a people
  // who build on stilts and read the tide.
  ocean: {
    head: ['Kaze', 'Shio', 'Mizu', 'Hama', 'Ura', 'Tsuki', 'Nami', 'Ao',
      'Suna', 'Kiri'],
    tail: ['mura', 'gawa', 'saki', 'ura', 'domari', 'hama', 'shima', 'no'],
  },
  // Rime: the north. Every one of these is a thing you can see from a
  // doorway on an ice world.
  ice: {
    head: ['Fross', 'Vind', 'Skar', 'Hvit', 'Isen', 'Nord', 'Kald', 'Bjor'],
    tail: ['vik', 'fjell', 'heim', 'strand', 'dal', 'nes', 'fors'],
  },
  // Tempest: the monsoon world, named for the sky it lives under.
  storm: {
    head: ['Megh', 'Vayu', 'Chandra', 'Nila', 'Suraj', 'Amba', 'Jala',
      'Ratna', 'Sindh'],
    tail: ['pur', 'garh', 'bad', 'nagar', 'kot', 'ganj', 'palli'],
  },
  // Ferrum: a works, and the town that grew round it.
  iron: {
    head: ['Fore', 'Ham', 'Slag', 'Cog', 'Rivet', 'Ward', 'Coke', 'Anvil'],
    tail: ['gate', 'forge', 'mill', 'bank', 'works', 'yard', 'row'],
  },
  // Vulcan: everything here is named after the mountain that made it.
  volcanic: {
    head: ['Pyra', 'Fumar', 'Sulph', 'Obsid', 'Cald', 'Scoria', 'Tephra'],
    tail: ['crag', 'vent', 'ash', 'fell', 'rise', 'mouth', 'spire'],
  },
};

// One 32-bit hash of four numbers, so a name can be drawn from a cell without
// a random stream that anything else could disturb.
function nameHash(a, b, c, d) {
  let n = (a * 0x9e3779b1 ^ b * 0x85ebca6b ^ c * 0xc2b2ae35 ^ d * 0x27d4eb2f) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x2545f491);
  n = Math.imul(n ^ (n >>> 13), 0x1b873593);
  return (n ^ (n >>> 16)) >>> 0;
}

// The name of the settlement at this cell. Some come out as one word and
// some as two — "Ashcombe", but "Upper Ashcombe" — which is what stops a
// planet of thirty villages reading as a list.
export function placeName(cultureId, f, u, v, seed = 0) {
  const w = PLACE_WORDS[cultureId] ?? PLACE_WORDS.terran;
  const h = nameHash(f * 977 + u, v, seed | 0, 0x1a3b5c);
  const head = w.head[h % w.head.length];
  const tail = w.tail[(h >>> 7) % w.tail.length];
  // Millley and Ashshaw: a head that ends on the letter its tail starts with
  // gives a doubled consonant no English place name has, so one of the two
  // goes. It is the difference between a generator and a name.
  const base = head[head.length - 1].toLowerCase() === tail[0]
    ? head + tail.slice(1) : head + tail;
  // one in five carries a qualifier, and it is always a real one — a village
  // called "Lower" something implies an upper one over the hill, which is
  // exactly the impression a planet full of them should give
  const PRE = ['Upper', 'Lower', 'Little', 'Great', 'North', 'South', 'Old'];
  return ((h >>> 14) % 5) === 0
    ? `${PRE[(h >>> 17) % PRE.length]} ${base}` : base;
}

// The culture of a world, or terran's if the preset has none of its own. A
// preset nobody has written a people for still gets villages, and they are
// the ones the game has always built.
function cultureFor(planet) {
  return CULTURES[planet?.presetId] ?? CULTURES.terran;
}

// Home. Three vernaculars, the pitched roof, glass in the windows: exactly
// what this file built before cultures existed, stated as a culture so that
// nothing about home is a special case in the code below.
culture('terran', {
  name: 'Terran',
  // Home dyes its blankets red and keeps brown sheep.
  bed: [1, 8],
  fitting: 'larder',
  verns: VERNACULARS,
  // ...and one more that no street ever gets: what the lake people build.
  // Boards and thatch, no masonry at all — there is nothing under a fen hut
  // to stand a plinth on, and a course of cobble hanging off a post would be
  // a lie about how the building works.
  fen: {
    name: 'fen',
    plinth: BLOCK.PLANK, wall: BLOCK.PLANK, upper: BLOCK.PLANK,
    frame: BLOCK.LOG, trim: B.STRIPPED_LOG,
    quoinA: BLOCK.LOG, quoinB: BLOCK.LOG,
    roof: MAT.THATCH, roofBlock: B.THATCH, hearth: BLOCK.COBBLE,
    board: BLOCK.PLANK, masonry: BLOCK.COBBLE,
    style: 'gable', glass: B.PANE, light: B.LANTERN,
    streetLight: B.STREET_LAMP, roomLight: B.LAMP, door: true, eaves: 1,
  },
});

// --- test hook -------------------------------------------------------------
//
// The node harness needs to know where each roof and ladder went, and there is
// no way to recover a roof's footprint from the finished blocks. Off in the
// game, where it costs one boolean test per building.
export const audit = { on: false, roofs: [], ladders: [] };

// --- constants -------------------------------------------------------------

// a village plus its outlying farms reaches ~30 columns from the centre; stay
// that far from a face edge so nothing ever has to wrap
const MARGIN = 31;

// street geometry, in columns from the village centre
const GREEN = 5;      // half-width of the green; street arms start here
const STREET = 24;    // how far each of the four arms runs
const ROAD = 3;       // lane width
const FRONT = 5;      // plot frontage line, measured from the street centre

// blocks a foundation is allowed to stand on
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.STONE]);

const inFace = (u, v) => u >= 0 && v >= 0 && u < S && v < S;

// --- small primitives ------------------------------------------------------

function fillRect(planet, f, u0, v0, w, d, h, b) {
  for (let u = u0; u < u0 + w; u++)
    for (let v = v0; v < v0 + d; v++) planet.set(f, u, v, h, b);
}

// perimeter of a rect at one height
function ring(planet, f, u0, v0, w, d, h, b) {
  if (w < 1 || d < 1) return;
  for (let u = u0; u < u0 + w; u++) {
    planet.set(f, u, v0, h, b);
    planet.set(f, u, v0 + d - 1, h, b);
  }
  for (let v = v0 + 1; v < v0 + d - 1; v++) {
    planet.set(f, u0, v, h, b);
    planet.set(f, u0 + w - 1, v, h, b);
  }
}

// Top of the real ground in a column, stepping down past anything growing on
// it — trees, plants, water, and the air gap under a canopy.
//
// This walks down from columnTop rather than asking columnSolidTop, and the
// difference is not cosmetic: columnSolidTop answers for the MESHER, so on
// any column with an override it scans up from the core and stops at the
// first non-supporting cell — which on a terran world is the lava band at
// the bottom, three cells up. Every planet.set() therefore used to turn a
// column's groundTop into 0, which was survivable while surveys always ran
// on virgin ground and fatal the moment the village pad levelled the ground
// before the surveys.
function groundTop(planet, f, u, v) {
  let t = planet.columnTop(f, u, v);
  while (t >= 0) {
    const b = planet.get(f, u, v, t);
    if (b === BLOCK.AIR || b === BLOCK.LOG || b === BLOCK.LEAF
      || CS.PASSABLE.has(b) || CS.FLUIDS.has(b)) { t--; continue; }
    return t;
  }
  return -1;
}

// --- siting and earthworks -------------------------------------------------

// Survey a footprint. Returns a plot {f,u0,v0,w,d,base} or null when the
// ground is unusable: off the face, in the sea, or so broken that levelling
// would leave a cliff. `need` is the headroom the building wants above `base`.
// `want`, when given, is the village's floor level: the plot is placed AT that
// height rather than at its own mean, so every house in a settlement shares
// one floor and the village reads as level ground rather than as a staircase.
// A plot whose natural ground is too far from it is refused — better a
// smaller village on a hillside than one house standing on a tower of fill.
function survey(planet, f, u0, v0, w, d, need, want = null) {
  // 3, not 2: the roof's verge and the eave fascia both hang one cell past
  // the wall, and the garden fence one further
  if (u0 < 3 || v0 < 3 || u0 + w > S - 3 || v0 + d > S - 3) return null;
  const spread = Math.min(5, 3 + Math.round((w + d) / 6));

  let lo = H, hi = -1, sum = 0;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const t = groundTop(planet, f, u, v);
      if (t < 1 || t >= H - 2) return null;
      if (!GROUND.has(planet.get(f, u, v, t))) return null;
      // water directly over the ground means shore or sea bed
      if (planet.get(f, u, v, t + 1) === BLOCK.WATER) return null;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t;
    }
  }
  if (hi - lo > spread) return null;
  // the mean is the level with the least total cut and fill
  let base = Math.round(sum / (w * d));
  if (want !== null) {
    if (Math.abs(base - want) > 4) return null;
    base = want;
  }
  if (base + need >= H) return null;
  return { f, u0, v0, w, d, base, ax: 0 };
}

// Cut and fill a plot to one floor level, plus a skirt so the ground meets the
// walls. This is why villages can sit on rolling terrain at all: the previous
// generator demanded perfectly flat grass and so almost never found a site.
// clear defaults to 11 because that clears a whole tree: trunk up to 6 plus a
// crown two cells above it, measured from ground that may sit below base.
function levelPlot(planet, p, skirt = 1, clear = 11) {
  const { f, base } = p;
  for (let u = p.u0 - skirt; u < p.u0 + p.w + skirt; u++) {
    for (let v = p.v0 - skirt; v < p.v0 + p.d + skirt; v++) {
      if (!inFace(u, v)) continue;
      const t = groundTop(planet, f, u, v);
      // fill: stone plinth under a dirt cap, so terraces read as masonry
      for (let h = t + 1; h <= base; h++)
        planet.set(f, u, v, h, h === base ? BLOCK.DIRT : BLOCK.COBBLE);
      // cut: shave the hill and anything growing on it out of the way
      for (let h = base + 1; h <= base + clear && h < H; h++)
        planet.set(f, u, v, h, BLOCK.AIR);
    }
  }
}

// Level the village's public space — the green and the four street arms — to
// the village floor, once the houses standing around it are known.
//
// The plots level themselves, but the ground BETWEEN them never was: streets
// are painted onto whatever they cross ("paths are painted, not levelled",
// below), so a village on rolling terrain came out as flat terraces joined by
// lanes that rode up and down over the hillside, with trees still standing in
// the gaps. Levelling the plots and not the space between them is what made
// villages look built on a slope rather than built on a site.
//
// Only the plus-shape is touched, not the whole square the streets span. On a
// small planet a face is about 48 cells across and the arms reach 24 in each
// direction, so "flatten the village footprint" would mean flattening most of
// a face — the village occupies nearly the whole face there, and levelling it
// wholesale would erase the planet rather than tidy the village.
//
// The far ends of the arms taper back to the natural ground so each road
// leaves the village on a slope instead of ending at a cliff.
// `built` is every plot that already has a BUILDING standing on it. The band
// this levels is wider than the lane the layout reserves — the green is
// thirteen cells across and its reservation is five, and each arm clears three
// cells either side of a centre line that reserves one — so anything sited by
// a RING SEARCH rather than on a frontage can land inside it. This then took
// eleven courses out of it, which is how a chief's hall came to be standing on
// the green with the bottom of its walls missing and the roof open.
//
// Skipping those cells changes no ground: a plot has already cut its own
// terrace to this same floor before this runs. What it saves is the wall.
function levelStreets(planet, f, cu, cv, base, built = null) {
  const HALF = (ROAD >> 1) + 2;        // lane, plus a verge each side
  const APRON = 5;                     // cells over which the arm ends ease off
  // ...and the air ROUND one, on a world of the third generation: its houses
  // oversail their plots — a jetty and the eave over it stand two cells out
  // over the street — and this cut eleven courses of air through the street's
  // verge, which took the front eave clean off every townhouse on a street.
  // The ground under that margin is the plot's own levelled skirt already.
  const m = planet.gen3 ? 2 : 0;
  const standing = (u, v) => !!built && built.some((r) => r.built
    && u >= r.u0 - m && u < r.u0 + r.w + m && v >= r.v0 - m && v < r.v0 + r.d + m);
  for (let u = cu - STREET; u <= cu + STREET; u++) {
    for (let v = cv - STREET; v <= cv + STREET; v++) {
      if (!inFace(u, v)) continue;
      const au = Math.abs(u - cu), av = Math.abs(v - cv);
      // how far into the tapered end of an arm this cell is; -1 = not village
      let into = -1;
      if (au <= GREEN + 1 && av <= GREEN + 1) into = 0;            // the green
      else if (av <= HALF && au <= STREET) into = Math.max(0, au - (STREET - APRON));
      else if (au <= HALF && av <= STREET) into = Math.max(0, av - (STREET - APRON));
      if (into < 0) continue;
      if (standing(u, v)) continue;

      const nat = groundTop(planet, f, u, v);
      if (nat < 1 || nat >= H - 2) continue;
      const target = into === 0 ? base
        : Math.round(base + (nat - base) * (into / APRON));
      if (target < 1 || target >= H - 2) continue;
      // fill: stone plinth under a dirt cap, the masonry read the plots use
      for (let h = nat + 1; h <= target; h++)
        planet.set(f, u, v, h, h === target ? BLOCK.DIRT : BLOCK.COBBLE);
      // cut: the hill, whatever was growing on it, and any standing water
      for (let h = target + 1; h <= target + 11 && h < H; h++)
        planet.set(f, u, v, h, BLOCK.AIR);
    }
  }
}

// --- walls, openings, rhythm -----------------------------------------------

// sides: 0 = -v, 1 = +v, 2 = -u, 3 = +u. Returns the middle cell of that wall
// and the outward step, which is what doors and lanes need.
function wallCell(p, side) {
  if (side === 0) return { u: p.u0 + (p.w >> 1), v: p.v0, du: 0, dv: -1 };
  if (side === 1)
    return { u: p.u0 + (p.w >> 1), v: p.v0 + p.d - 1, du: 0, dv: 1 };
  if (side === 2) return { u: p.u0, v: p.v0 + (p.d >> 1), du: -1, dv: 0 };
  return { u: p.u0 + p.w - 1, v: p.v0 + (p.d >> 1), du: 1, dv: 0 };
}

// Where the windows go along a wall of L cells, as offsets from its start.
// The count comes from the wall's own length — one bay per three cells — and
// the positions are symmetric about the wall's centre, which is the whole
// difference between a facade and a row of holes. Corners are never used:
// that is where the quoins are.
function windowBays(L) {
  const n = Math.max(1, Math.floor((L - 1) / 3));
  const out = [];
  for (let i = 0; i < n; i++)
    out.push(1 + Math.round(((i + 0.5) / n) * (L - 3)));
  return out;
}

// Hollow shell between two heights. `pick(h)` chooses the course material, so
// a plinth, an infill and a wall plate are one call.
function shell(planet, p, h0, h1, pick) {
  const f = p.f;
  for (let h = h0; h <= h1; h++) {
    ring(planet, f, p.u0, p.v0, p.w, p.d, h, pick(h));
    for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
      for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++)
        planet.set(f, u, v, h, BLOCK.AIR);
  }
}

// Corner quoins. Two blocks alternating by course reads as dressed stone on a
// masonry vernacular and as a plain post when both are the same timber.
function quoins(planet, p, h0, h1, vern) {
  for (const u of [p.u0, p.u0 + p.w - 1])
    for (const v of [p.v0, p.v0 + p.d - 1])
      for (let h = h0; h <= h1; h++)
        planet.set(p.f, u, v, h, (h & 1) ? vern.quoinA : vern.quoinB);
}

// LEADED LIGHTS. A glazing function for storey(): each course of each bay
// takes its own jewel, so a three-course light comes out as three bands and
// the window next to it comes out as three different ones.
//
// It is a pure function of the plot's own cell, which is what keeps it derived
// — same seed, same world, same windows — while looking like nobody planned
// it. The only rule imposed on the roll is that no band matches the one under
// it and no bay opens with the colour the last one opened with: two identical
// courses read as one tall course, and the banding is the whole point.
const JEWELS = [1, 2, 3, 4, 5, 6];   // red, orange, yellow, green, blue, purple
function stainedGlass(p) {
  const salt = ((p.f + 1) * 2654435761 ^ p.u0 * 40503 ^ p.v0 * 2246822519) >>> 0;
  return (side, bay, course) => {
    let n = (salt ^ Math.imul(bay + 1, 0x9e3779b1) ^ Math.imul(course + 1, 0x85ebca6b)) >>> 0;
    n = Math.imul(n ^ (n >>> 15), 0x2545f491) >>> 0;
    // `>>> 0` is load-bearing: `^` yields a SIGNED int32, so half the hashes
    // come out negative, a negative modulo stays negative, and JEWELS[-5] is
    // undefined — which paneId reads as "no tint" and glazes clear. Two thirds
    // of every stained window was plain glass.
    let k = ((n ^ (n >>> 13)) >>> 0) % JEWELS.length;
    // ...and step off a repeat rather than re-rolling, which would need a
    // second hash and could repeat again anyway
    const prev = (salt ^ Math.imul(bay + 1, 0x9e3779b1)
      ^ Math.imul(course, 0x85ebca6b)) >>> 0;
    const pk = (Math.imul(prev ^ (prev >>> 15), 0x2545f491) >>> 0);
    if (course > 0 && k === ((pk ^ (pk >>> 13)) >>> 0) % JEWELS.length) {
      k = (k + 1 + (n % (JEWELS.length - 1))) % JEWELS.length;
    }
    return pane(JEWELS[k]);
  };
}

// One storey of wall: plinth, infill, wall plate, and a window in every bay
// with its own sill and the plate above doing duty as its lintel. `skip` is
// the doorway, which owns its cells and must not be glazed.
//
//   hPlinth = h0, sill = h0+1, light = h0+2 .. h0+tall, plate = h1
//
function storey(planet, p, h0, h1, vern, opts = {}) {
  const f = p.f;
  const wall = opts.wall ?? vern.wall;
  const plinth = opts.plinth ?? null;
  shell(planet, p, h0, h1, (h) => (
    h === h1 ? vern.trim : (plinth && h === h0 ? plinth : wall)));
  quoins(planet, p, h0, h1, vern);

  const tall = Math.max(1, Math.min(opts.light ?? 1, h1 - h0 - 1));
  const sill = h1 - tall - 1;                  // one course under the glass
  if (sill < h0) return;
  const skip = opts.skip;

  // `vern.glass` is what fills a light. A culture that cannot make glass sets
  // it to null and the opening is simply a hole in the wall, which is what
  // those people actually build — and the sill and lintel still frame it, so
  // it reads as a window rather than as a wall that failed to finish.
  // `opts.glass` lets ONE building glaze differently from the houses around
  // it — a block, or a function of (side, which bay, which course) for a
  // window that changes colour up its own height. It is what a church is: the
  // same wall as a cottage with light coming through it in colours.
  const fill = opts.glass !== undefined ? opts.glass
    : (vern.glass === undefined ? B.PANE : vern.glass);
  const at = typeof fill === 'function' ? fill : () => fill;
  let bay = 0;
  const put = (u, v, side) => {
    if (skip && skip.side === side && Math.abs(skip.at - (side < 2 ? u : v))
      <= skip.half) return;
    planet.set(f, u, v, sill, vern.trim);
    for (let k = 1; k <= tall; k++) {
      planet.set(f, u, v, sill + k, at(side, bay, k - 1, tall) ?? BLOCK.AIR);
    }
  };
  for (const j of windowBays(p.w)) {
    put(p.u0 + j, p.v0, 0);
    put(p.u0 + j, p.v0 + p.d - 1, 1);
    bay++;
  }
  for (const j of windowBays(p.d)) {
    put(p.u0, p.v0 + j, 2);
    put(p.u0 + p.w - 1, p.v0 + j, 3);
    bay++;
  }
}

// Exposed timber framing: a stud between every pair of window bays plus a
// mid-rail, which is what makes an upper storey read as jettied timber rather
// than as more of the same wall.
function halfTimber(planet, p, h0, h1, vern) {
  const f = p.f;
  const studs = (L) => {
    const bays = windowBays(L);
    const out = [];
    for (let i = 0; i <= bays.length; i++) {
      const a = i === 0 ? 0 : bays[i - 1];
      const b = i === bays.length ? L - 1 : bays[i];
      const m = (a + b) >> 1;
      if (m > 0 && m < L - 1 && !bays.includes(m)) out.push(m);
    }
    return out;
  };
  for (const j of studs(p.w))
    for (let h = h0; h <= h1; h++) {
      planet.set(f, p.u0 + j, p.v0, h, vern.frame);
      planet.set(f, p.u0 + j, p.v0 + p.d - 1, h, vern.frame);
    }
  for (const j of studs(p.d))
    for (let h = h0; h <= h1; h++) {
      planet.set(f, p.u0, p.v0 + j, h, vern.frame);
      planet.set(f, p.u0 + p.w - 1, p.v0 + j, h, vern.frame);
    }
}

// A string course: the timber band that marks a floor line on the outside.
const stringCourse = (planet, p, h, vern) =>
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, h, vern.trim);

// Doorway with jambs, a lintel and a threshold step outside, so villagers get
// a flat cell to stand on. Returns the door record.
//
// The step is a full block on purpose: a slab would render half height but
// hold the walker up a whole one, and they would float on the doorstep.
function carveDoor(planet, p, side, floor, vern, wide = 1, tall = 2) {
  const f = p.f;
  const c = wallCell(p, side);
  const au = c.du === 0 ? 1 : 0, av = c.du === 0 ? 0 : 1;  // along the wall
  const half = (wide - 1) >> 1;
  for (let k = -half - 1; k <= wide - half; k++) {
    const u = c.u + au * k, v = c.v + av * k;
    const jamb = k < -half || k > wide - 1 - half;
    if (jamb) {
      for (let h = 1; h <= tall; h++) planet.set(f, u, v, floor + h, vern.trim);
      continue;
    }
    for (let h = 1; h <= tall; h++) planet.set(f, u, v, floor + h, BLOCK.AIR);
    planet.set(f, u, v, floor + tall + 1, vern.trim);      // lintel beam
    planet.set(f, u, v, floor, BLOCK.PLANK);               // threshold
    planet.set(f, u + c.du, v + c.dv, floor, B.PATH);      // step outside
    for (let h = 1; h <= tall; h++)
      planet.set(f, u + c.du, v + c.dv, floor + h, BLOCK.AIR);
    // ...and hang a door in the opening. One block id carries the leaf,
    // which draws two cells tall, so the lintel above it stays clear. Hung
    // OPEN, because a village door is a door people are using: closed, the
    // villagers who live behind it would stand at it all day, having no
    // hands to work a latch with.
    // `vern.door === false` is a people with no hinges: the opening stays an
    // opening, with the jambs and lintel around it doing all the work.
    //
    // A WIDE OPENING GETS A PAIR, not one door repeated. `k` runs along the
    // wall, so the leaves in the first half of the opening hang on the end it
    // starts at and the rest on the end it finishes at — they part in the
    // middle and fold back against their own jambs instead of stacking up
    // against one of them. A one-cell doorway is not a pair and is left alone.
    if (hangDoor && vern.door !== false) {
      const low = wide > 1 ? (k + half) * 2 < wide : null;
      planet.set(f, u, v, floor + 1, hangDoor(c.du, c.dv, low));
    }
  }
  return { f, u: c.u, v: c.v, h: floor + 1, du: c.du, dv: c.dv };
}

// --- roofs -----------------------------------------------------------------
//
// A pitched roof out of stairs. The ridge runs along `p.ax` (0 = along u,
// 1 = along v) and the roof spans the other axis. Working in a (r, s) frame —
// r along the ridge, s across the span — makes both orientations one piece of
// code, and the stair facing falls out of which axis s is.
//
// Profile across the span, from the eave up:
//
//   ...___                     a half-block fascia projecting past the wall
//         \__                  then one stair per cell, rising one per cell
//            \__               the raised half of each stair points at the
//               \_[=]          ridge, so the step you see is the downslope
//                   \__        face; the ridge itself is a top slab laid
//                              between the two topmost steps
//
// which is a true 45 degree plane instead of a terrace of full blocks.

// (r, s) -> planet.set, in the plot's ridge frame
function roofPut(planet, p, r, s, h, b) {
  if (p.ax) planet.set(p.f, s, r, h, b);
  else planet.set(p.f, r, s, h, b);
}

// highest layer a roof of this span occupies above its eave
const roofRise = (span) => Math.max(0, (span >> 1) - 1);

// headroom a building wants: its eave, its roof, and a cell of air over it
const roofNeed = (eave, span) => eave + roofRise(span) + 2;

function gableRoof(planet, p, eave, vern, opts = {}) {
  const mat = opts.mat ?? vern.roof;
  const gable = opts.gable ?? vern.upper;
  const over = opts.over ?? 1;      // fascia cells projecting past the eave
  const verge = opts.verge ?? 1;    // roof cells projecting past the gable
  const put = (r, s, h, b) => roofPut(planet, p, r, s, h, b);

  // ridge extent (r) and span extent (s), in the plot's own frame
  const r0 = p.ax ? p.v0 : p.u0, rn = p.ax ? p.d : p.w;
  const s0 = p.ax ? p.u0 : p.v0, sn = p.ax ? p.w : p.d;
  const up = p.ax ? 0 : 2;          // stair facing that climbs toward +s
  const dn = p.ax ? 1 : 3;
  const ra = r0 - verge, rb = r0 + rn - 1 + verge;
  const rec = audit.on ? { kind: 'roof', f: p.f, u0: p.u0, v0: p.v0,
    w: p.w, d: p.d, eave, top: eave + roofRise(sn) + 1, stairs: [] } : null;

  // fascia: the thin lip that gives the roof edge an edge
  for (let r = ra; r <= rb; r++)
    for (let k = 1; k <= over; k++) {
      put(r, s0 - k, eave, slab(mat, 0));
      put(r, s0 + sn - 1 + k, eave, slab(mat, 0));
    }

  let a = s0, b = s0 + sn - 1, h = eave;
  for (; a < b && h < H - 2; a++, b--, h++) {
    for (let r = ra; r <= rb; r++) {
      put(r, a, h, stair(mat, up));
      put(r, b, h, stair(mat, dn));
      if (rec) {
        const A = p.ax ? { u: a, v: r } : { u: r, v: a };
        const Bb = p.ax ? { u: b, v: r } : { u: r, v: b };
        rec.stairs.push({ ...A, h, want: up }, { ...Bb, h, want: dn });
      }
    }
    // close the gable triangle so the loft is not open to the wind
    for (let s = a + 1; s < b; s++) {
      put(r0, s, h, gable);
      put(r0 + rn - 1, s, h, gable);
    }
  }
  // odd span: a single ridge line, laid as a slab between the two top steps
  if (a === b) {
    for (let r = ra; r <= rb; r++) put(r, a, h - 1, slab(mat, 1));
    // and a solid apex where the ridge crosses each gable wall, so the gable
    // closes right to the top instead of leaving a slot under the ridge
    put(r0, a, h - 1, gable);
    put(r0 + rn - 1, a, h - 1, gable);
  }
  if (rec) audit.roofs.push(rec);
  return { top: h - 1, ridge: (s0 + s0 + sn - 1) >> 1, r0, rn, s0, sn };
}

// --- the roof grammars ------------------------------------------------------
//
// Every builder in this file calls roof(); which shape it gets is the
// culture's, taken off `vern.style`. This is the one place a culture is more
// than a data row, and it is deliberately where the effort went: the roof is
// what you read first, from further away than any wall, and four buildings
// under one roof grammar look like one people even when their plans differ.
//
// All of them return the same record gableRoof does — `top` at least — so the
// chimneys and steeples that build off a roof do not care which one ran.

// A DEEP EAVE, the temple roof. The pitch is the ordinary one; what changes is
// the edge, which steps out twice before it falls. That overhang is the whole
// silhouette of a building in a rainy climate, and it costs a ring of slabs.
function eaveRoof(planet, p, eave, vern, opts = {}) {
  const mat = opts.mat ?? vern.roof;
  const over = Math.max(2, vern.eaves ?? 2);
  // the lower, wider step: a course BELOW the eave, projecting further out,
  // so the shadow line under it is two cells deep rather than one
  const r0 = p.ax ? p.v0 : p.u0, rn = p.ax ? p.d : p.w;
  const s0 = p.ax ? p.u0 : p.v0, sn = p.ax ? p.w : p.d;
  const put = (r, s, h, b) => roofPut(planet, p, r, s, h, b);
  for (let r = r0 - over; r <= r0 + rn - 1 + over; r++) {
    for (let k = 1; k <= over; k++) {
      put(r, s0 - k, eave - 1, slab(mat, 1));
      put(r, s0 + sn - 1 + k, eave - 1, slab(mat, 1));
    }
  }
  // ...and the gable ends of that same lower step, so the overhang goes all
  // the way round instead of stopping at the corners
  for (let s = s0 - over; s <= s0 + sn - 1 + over; s++) {
    for (let k = 1; k <= over; k++) {
      put(r0 - k, s, eave - 1, slab(mat, 1));
      put(r0 + rn - 1 + k, s, eave - 1, slab(mat, 1));
    }
  }
  return gableRoof(planet, p, eave, vern,
    { ...opts, over: 1, verge: Math.max(2, over - 1) });
}

// A SWEEPING roof with finials. The same deep eave, plus a block standing
// proud at each end of the ridge — nothing else in the game has one, so a
// finial is legible as ornament at any distance.
function sweepRoof(planet, p, eave, vern, opts = {}) {
  const rec = eaveRoof(planet, p, eave, vern, opts);
  if (vern.finial) {
    const r0 = p.ax ? p.v0 : p.u0, rn = p.ax ? p.d : p.w;
    const verge = Math.max(2, (vern.eaves ?? 2) - 1);
    for (const r of [r0 - verge, r0 + rn - 1 + verge]) {
      roofPut(planet, p, r, rec.ridge, rec.top + 1, vern.finial);
    }
  }
  return rec;
}

// FLAT, with a parapet. No pitch at all, which is the fastest way to make a
// skyline stop reading as a village: a deck you can walk on, a solid rail
// round it, and a coping slab on top of the rail so the edge has a line.
//
// The deck is FULL blocks, not slabs, because the physics treats a half block
// as full height — a slab roof terrace would have you floating an inch above
// it. Everything decorative above the deck is free to be a slab.
function flatRoof(planet, p, eave, vern, opts = {}) {
  const f = p.f;
  const deck = opts.deckBlock ?? vern.roofBlock ?? BLOCK.COBBLE;
  const rail = vern.trim;
  const over = vern.eaves ?? 1;
  // the deck, projecting a cell past the wall so the wall head has a shadow
  for (let u = p.u0 - over; u < p.u0 + p.w + over; u++)
    for (let v = p.v0 - over; v < p.v0 + p.d + over; v++)
      planet.set(f, u, v, eave, deck);
  // the parapet, and its coping
  ring(planet, f, p.u0 - over, p.v0 - over, p.w + 2 * over, p.d + 2 * over,
    eave + 1, rail);
  for (let u = p.u0 - over; u < p.u0 + p.w + over; u++) {
    for (let v = p.v0 - over; v < p.v0 + p.d + over; v++) {
      const edge = u === p.u0 - over || u === p.u0 + p.w + over - 1
        || v === p.v0 - over || v === p.v0 + p.d + over - 1;
      if (edge) planet.set(f, u, v, eave + 2, slab(vern.roof, 0));
    }
  }
  return {
    top: eave + 1,
    ridge: p.ax ? p.u0 + (p.w >> 1) : p.v0 + (p.d >> 1),
    r0: p.ax ? p.v0 : p.u0, rn: p.ax ? p.d : p.w,
    s0: p.ax ? p.u0 : p.v0, sn: p.ax ? p.w : p.d,
    flat: true,
  };
}

// A CONE — really a stepped pyramid, since the grid has no cones in it. Used
// by the people who have no saw and no ridge beam: the roof closes in from
// every side at once onto a smoke hole. It rises over the SHORT side, so a
// cone never needs more headroom than the pitched roof the plot was surveyed
// for.
function coneRoof(planet, p, eave, vern, opts = {}) {
  const f = p.f;
  const mat = opts.mat ?? vern.roof;
  let u0 = p.u0 - 1, v0 = p.v0 - 1, w = p.w + 2, d = p.d + 2;
  let h = eave;
  const lim = Math.min(H - 2, eave + roofRise(Math.min(p.w, p.d)) + 1);
  while (w > 2 && d > 2 && h < lim) {
    // stairs facing inward, so the step you see is the outward, downslope one
    for (let u = u0; u < u0 + w; u++) {
      planet.set(f, u, v0, h, stair(mat, 2));
      planet.set(f, u, v0 + d - 1, h, stair(mat, 3));
    }
    for (let v = v0 + 1; v < v0 + d - 1; v++) {
      planet.set(f, u0, v, h, stair(mat, 0));
      planet.set(f, u0 + w - 1, v, h, stair(mat, 1));
    }
    // close the ring behind the course so the loft is not open to the sky
    for (let u = u0 + 1; u < u0 + w - 1; u++)
      for (let v = v0 + 1; v < v0 + d - 1; v++)
        if (h > eave) planet.set(f, u, v, h, BLOCK.AIR);
    u0++; v0++; w -= 2; d -= 2; h++;
  }
  // the smoke hole is left open on purpose: it is where the fire below goes
  for (let u = u0; u < u0 + w; u++)
    for (let v = v0; v < v0 + d; v++)
      planet.set(f, u, v, h, w <= 1 || d <= 1 ? slab(mat, 1) : BLOCK.AIR);
  return {
    top: h - 1,
    ridge: p.ax ? p.u0 + (p.w >> 1) : p.v0 + (p.d >> 1),
    r0: p.ax ? p.v0 : p.u0, rn: p.ax ? p.d : p.w,
    s0: p.ax ? p.u0 : p.v0, sn: p.ax ? p.w : p.d,
    cone: true,
  };
}

const ROOF_STYLES = {
  gable: gableRoof,
  eave: eaveRoof,
  sweep: sweepRoof,
  flat: flatRoof,
  cone: coneRoof,
};

// What every builder in this file calls. The culture picks the shape; the
// caller only ever says where the eave is.
function roof(planet, p, eave, vern, opts = {}) {
  return (ROOF_STYLES[vern.style] ?? gableRoof)(planet, p, eave, vern, opts);
}

// A dormer: three cells of the pitch pushed out into a little flat-topped
// bay with a window in it. One of these on a long roof is the difference
// between a house and a shed. `k` is how far up the pitch it sits.
//
// It only fits when the pitch is long enough for the cap to stay below the
// ridge, which is why dormers are a feature of the bigger houses.
function dormer(planet, p, eave, span, vern, rc, k, low) {
  // Only a PITCHED roof has a pitch to push a dormer out of. On a flat deck
  // or a cone it would be a box floating beside the building.
  if (vern.style && vern.style !== 'gable' && vern.style !== 'eave'
    && vern.style !== 'sweep') return false;
  if (k < 1 || k > roofRise(span) - 1) return false;
  const s0 = p.ax ? p.u0 : p.v0, sn = p.ax ? p.w : p.d;
  const sf = low ? s0 + k : s0 + sn - 1 - k;
  const hf = eave + k;
  const put = (r, s, h, b) => roofPut(planet, p, r, s, h, b);
  for (let r = rc - 1; r <= rc + 1; r++) {
    // the middle is the light; the two cheeks close the bay at its sides
    put(r, sf, hf, r === rc ? (vern.glass ?? B.PANE) : vern.upper);
    put(r, sf, hf + 1, slab(vern.roof, 0));       // the dormer's flat cap
  }
  return true;
}

// A chimney is what makes a roofline look inhabited from orbit. It rises in
// the gable's centre column, which is exactly the column the hearth below it
// sits in, so the flue is real rather than decorative.
//
// THREE COURSES IN THE SKY, no more. The stack used to run to rf.top+3 with
// its cap above that — five or six blocks proud of the thatch, which reads
// as a factory. Stack to rf.top+1 and the cap at +2 leaves about three
// showing above the roofline, which is a house.
function chimney(planet, f, u, v, floor, top, vern) {
  // A culture with no hearth block has no flue either: its fire is in the
  // middle of the floor and the smoke goes out of the hole in the roof. A
  // stack rising out of one of those houses would be a lie about how it works.
  if (!vern.hearth) return;
  const cap = Math.min(top, H - 2);
  for (let h = floor; h <= cap; h++) planet.set(f, u, v, h, vern.hearth);
  planet.set(f, u, v, cap + 1, vern.plinth);
}

// A little pyramid of stairs over a 3x3: the well head and the market stalls.
// Stairs face inward so the eave is the low edge all the way round.
function pyramidCap(planet, f, u0, v0, h, mat) {
  planet.set(f, u0 + 1, v0, h, stair(mat, 2));
  planet.set(f, u0 + 1, v0 + 2, h, stair(mat, 3));
  planet.set(f, u0, v0 + 1, h, stair(mat, 0));
  planet.set(f, u0 + 2, v0 + 1, h, stair(mat, 1));
  planet.set(f, u0, v0, h, stair(mat, 0));
  planet.set(f, u0 + 2, v0, h, stair(mat, 1));
  planet.set(f, u0, v0 + 2, h, stair(mat, 0));
  planet.set(f, u0 + 2, v0 + 2, h, stair(mat, 1));
  planet.set(f, u0 + 1, v0 + 1, h, slab(mat, 1));
}

// --- interiors -------------------------------------------------------------

// A chest indoors, remembered. Nothing here decides what goes in one — the
// contents belong to the world, not to the architecture — but a caller that
// wants to stock every house has no way to find them again afterwards: a
// chest block is one byte in a column and there is no index of them. So each
// one is recorded as it is laid, and `planet.houseChests` is the list. The
// market stall's chest deliberately does not go through here; it is stock in
// the open, not a household's.
// TWO MEN ON A DOOR. The cells either side of an opening, one step OUT of it,
// which is where a guard stands: inside the jamb he is in the way of everybody
// using the door, and in the middle of it he is the door.
//
// `wide` is the same number carveDoor was given, because the opening runs from
// k = 0 to k = wide-1 and the jambs sit at -1 and wide — so the posts are one
// further out again.
function doorPosts(planet, door, wide = 1) {
  if (!door) return [];
  const au = door.du === 0 ? 1 : 0, av = door.du === 0 ? 0 : 1;
  const out = [];
  // One cell beyond each jamb, whichever side of the doorway that lands on.
  // carveDoor puts the jambs at -half-1 and wide-half, and `half` is not zero
  // for an odd opening — so the old fixed pair stood one man against the jamb
  // and the other two cells clear of it the moment the arch went to three.
  const half = (wide - 1) >> 1;
  for (const k of [-half - 2, wide - half + 1]) {
    const u = door.u + au * k + door.du;
    const v = door.v + av * k + door.dv;
    if (!inFace(u, v)) continue;
    const d = dirFromCell(door.f, u + 0.5, v + 0.5);
    // ...and he looks the way somebody arriving would come from
    const face = dirFromCell(door.f, u + door.du * 2 + 0.5, v + door.dv * 2 + 0.5);
    out.push({ f: door.f, u, v, h: door.h,
      dir: [d[0], d[1], d[2]], face: [face[0], face[1], face[2]] });
  }
  return out;
}

// A door, in the shape everything outside this file expects: the cell, the way
// out of it, and the DIRECTION, which is what entities.js turns into a place to
// walk to. Two builders were pushing the raw carveDoor return instead — no `f`
// and no `dir` — and villageWaypoints threw on the first one it read, which
// killed populate for the whole world rather than for that village. So there is
// one door shape now and one place that makes it.
function doorEntry(planet, f, door) {
  if (!door) return null;
  const d = dirFromCell(f, door.u + 0.5, door.v + 0.5);
  return { f, u: door.u, v: door.v, h: door.h,
    du: door.du, dv: door.dv, dir: [d[0], d[1], d[2]] };
}

// A CHEST NEVER OVERWRITES WHAT IS ALREADY IN THE ROOM.
//
// It used to be a plain `set`, and the corner it is aimed at is a corner other
// furniture is aimed at too: in a bedroom only three cells deep the far corner
// IS the second bed, so the chest was dropped straight on top of it. That does
// not read as a chest beside a bed, it reads as a box standing inside one —
// and because a bed is two cells, the half that was not overwritten stayed
// behind as an orphaned foot with no head, which is the shape the player
// photographed.
//
// So the target is tried, and if something is there the alternates are tried
// in turn — a caller passes the other corners of the same room, which is where
// a chest would have gone if a person were putting it down. If every candidate
// is taken the room simply has no chest: a room with one less chest is tidy,
// and a room with a chest inside the bed is broken.
function houseChest(planet, f, u, v, h, alts = []) {
  for (const [cu, cv] of [[u, v], ...alts]) {
    if (planet.get(f, cu, cv, h) !== BLOCK.AIR) continue;
    planet.set(f, cu, cv, h, B.CHEST);
    (planet.houseChests ??= []).push({ f, u: cu, v: cv, h });
    return true;
  }
  return false;
}

// The hearth sits against the middle of a gable wall and the chimney goes up
// the same column, so a house has one fire and one flue in line with it.
// Returns the outside column of the flue.
function hearth(planet, p, floor, vern, atLowEnd) {
  const f = p.f;
  // The gable wall is the end wall the ridge runs into, and its middle cell
  // is the ridge column, so the flue leaves the roof exactly at the apex.
  const end = (low) => {
    if (p.ax) {                     // ridge along v: gables at v0 / v0+d-1
      const u = p.u0 + (p.w >> 1);
      const v = low ? p.v0 : p.v0 + p.d - 1;
      return { u, v, iu: u, iv: low ? v + 1 : v - 1 };
    }                               // ridge along u: gables at u0 / u0+w-1
    const u = low ? p.u0 : p.u0 + p.w - 1;
    const v = p.v0 + (p.d >> 1);
    return { u, v, iu: low ? u + 1 : u - 1, iv: v };
  };
  // The gable the hearth backs onto is often the very wall the door is cut
  // into, and then the fire stands on the doorstep — you walked into it on
  // the way in. Take the other gable when that happens; the flue follows.
  const dc = p.side == null ? null : wallCell(p, p.side);
  const clash = (g) => dc
    && ((dc.u === g.u && dc.v === g.v)                       // sealing the door
      || (dc.u - dc.du === g.iu && dc.v - dc.dv === g.iv));  // fire on the step
  // A culture with no hearth block builds no fireplace: the fire stands in
  // the MIDDLE of the floor and the smoke leaves by the hole in the roof,
  // which is both what a roundhouse is and why coneRoof leaves that hole.
  if (!vern.hearth) {
    const cu = p.u0 + (p.w >> 1), cv = p.v0 + (p.d >> 1);
    planet.set(f, cu, cv, floor, BLOCK.COBBLE);          // the fire ring
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      planet.set(f, cu + du, cv + dv, floor, BLOCK.COBBLE);
    planet.set(f, cu, cv, floor + 1, B.CAMPFIRE);
    glow(f, cu, cv, floor + 1);
    return { u: cu, v: cv };
  }

  let g = end(atLowEnd);
  if (clash(g)) {
    const alt = end(!atLowEnd);
    if (!clash(alt)) g = alt;
  }
  const { u, v, iu, iv } = g;
  planet.set(f, u, v, floor + 1, vern.hearth);      // fireback
  planet.set(f, u, v, floor + 2, vern.hearth);
  planet.set(f, iu, iv, floor, vern.hearth);        // hearthstone
  // the fire itself: crossed logs over embers, with real flames — blockanim
  // keeps them licking, which is what makes a house read as lived in
  planet.set(f, iu, iv, floor + 1, B.CAMPFIRE);
  glow(f, iu, iv, floor + 1);
  return { u, v };
}

// Furniture. Real pieces now — a table stands on legs and a chair has a back
// (see cubemesher.js FURNITURE) — but the layout is the one the slabs and
// stairs established: it is a handful of blocks, and it is the difference
// between a room and a crate.
function furnish(planet, p, floor, vern, rand, opts = {}) {
  const f = p.f;
  const iu = p.u0 + 1, iv = p.v0 + 1;
  const iw = p.w - 2, id = p.d - 2;
  if (iw < 2 || id < 2) return;

  // THE DOORSTEP IS NOT A SEAT. `carveDoor` puts the opening at the middle of
  // whichever wall it is given, and the cell one step inside that opening is
  // the only floor in the room every single person who lives here has to
  // cross. A chair standing on it is not quite a wall — furniture is a block
  // tall and a villager's step-up is 1.15, so he climbs OVER his own dining
  // chair to get through his own front door — but a man clambering across the
  // furniture every dusk is not a man going to bed, and about one house in
  // twenty was built that way.
  //
  // The table was already kept off the centre line for this reason; the
  // chairs either side of it never were, which is what put them in the
  // doorway. Guard the cell once, here, and every piece below has to respect
  // it rather than each one remembering separately.
  const side = opts.side ?? p.side;
  const step = side === undefined || side === null
    ? null
    : (() => { const c = wallCell(p, side);
      return { u: c.u - c.du, v: c.v - c.dv }; })();
  const onStep = (u, v) => step !== null && u === step.u && v === step.v;

  // HOW MUCH FLOOR THERE IS TO FURNISH, and therefore how much of this list
  // the room can afford.
  //
  // The same handful of pieces that reads as a home in a seven-by-five reads
  // as a jumble sale in a three-by-five — and the three-by-five is the common
  // house. A cottage was coming out with ten things on fifteen cells: a
  // ladder, a bed, a bedside slab, a table, two chairs, a lamp, a chest and a
  // culture fitting, which left five squares of floor and no way to walk
  // round your own table. A room is mostly floor or it is a store cupboard.
  //
  // So the bed and the chest are what a house IS and they always go in.
  // Everything after them has to earn its cell against the size of the room.
  const cells = iw * id;
  const roomFor = { slab: cells >= 22, table: cells >= 12,
    chair: cells >= 15, pair: cells >= 20, fitting: cells >= 28,
    loo: cells >= 15 };

  // Bed against the far corner, head to the wall. Not the near corner — that
  // one belongs to the ladder.
  //
  // It used to be a block of trim with a slab beside it, which is a bed the
  // way a pile of stones is a fireplace: you knew what it meant because there
  // was nothing else it could be. It is a real bed now, in one of the two
  // colours this people keeps (see `bed` in culture()), and you can lie down
  // in it — which is the whole difference between scenery and a village.
  //
  // ...unless the house has a floor over this one, in which case the beds are
  // UP there and this room is the room you live in — see bedroom() below.
  if (!opts.noBed) {
    const tint = vern.bed[rand() < 0.55 ? 0 : 1];
    layBed(planet, f, iu + iw - 1, iv, floor + 1, tint, 0, step);
    // THE NIGHTSTAND MOVED. It used to stand one step down the bed from the
    // pillow, which is the cell the foot of the bed occupies now — so it goes
    // alongside the head instead, against the same wall. Not in a room only
    // two cells deep: the chest already has the one cell that leaves.
    if (roomFor.slab && id > 2)
      planet.set(f, iu + iw - 1, iv + 1, floor + 1, slab(MAT.PLANK, 0));
  }

  // table off the centre line so it never stands in a doorway, with a chair
  // either side — a chair's facing is where its back stands, so each one's
  // back is away from the table and its sitter faces it. A small room gets
  // ONE chair rather than two: a table you can get to from one side is a
  // table, and a table with a chair jammed against each wall is a corridor.
  const tu = iu + ((iw - 1) >> 1), tv = iv + ((id - 1) >> 1);
  if (roomFor.table && !opts.noTable && !onStep(tu, tv)) {
    planet.set(f, tu, tv, floor + 1, B.TABLE);
    if (iw > 2 && roomFor.chair) {
      if (!onStep(tu - 1, tv)) planet.set(f, tu - 1, tv, floor + 1, chair(1));
      if (roomFor.pair && !onStep(tu + 1, tv))
        planet.set(f, tu + 1, tv, floor + 1, chair(0));
    }
  }

  // chest in the far corner, a lamp standing ON it, and a shelf over the two
  // of them. The lamp used to have a cell of its own on the floor between the
  // bed and the chest, which is a lamp somebody left in the middle of the
  // room: a light belongs on top of something, and putting it there buys back
  // a square of floor in every house in the world. On the CHEST rather than
  // the bedside slab, because the slab is half a block tall and a lamp on it
  // hangs in the air.
  houseChest(planet, f, iu + iw - 1, iv + id - 1, floor + 1);
  planet.set(f, iu + iw - 1, iv + id - 1, floor + 2, vern.roomLight ?? B.LAMP);
  glow(f, iu + iw - 1, iv + id - 1, floor + 2);
  planet.set(f, iu + iw - 1, iv + id - 1, floor + 4, slab(MAT.PLANK, 1));
  // ...and the odd second shelf, HIGH. It used to go a course lower, which is
  // head height with nothing under it: a plank you walk into in the corner of
  // your own house.
  if (roomFor.slab && rand() < 0.6)
    planet.set(f, iu, iv + id - 1, floor + 3, slab(MAT.PLANK, 1));

  // ...and NO toilet in the corner. Half the houses used to roll for one,
  // and the café and the pub always had one: a village with eight pans in it,
  // seven of them in other people's back rooms. The player's rule is one
  // toilet per village, and it is the privy — the little house on the street
  // with WC over the door, which is the one building a village can queue
  // outside of. See privy below, and looFor in main.js for the queue.

  // ...and the one thing in the room that belongs to THIS people. Everything
  // above is the same in every house on every world — a bed, a table, a
  // chest — which is right, because those are what a house is. The fitting is
  // what makes walking into one worth doing twice.
  const fit = FITTINGS[vern.fitting];
  if (fit && iw >= 3 && id >= 3 && roomFor.fitting) {
    // Never write over anything: the room is already furnished, the ladder is
    // at (iu, iv) and the door is a hole in one of the walls, so a fitting
    // that overwrote cells could seal a house with somebody in it.
    const put = (u, v, h, b) => {
      if (u < iu || v < iv || u > iu + iw - 1 || v > iv + id - 1) return;
      if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
      planet.set(f, u, v, h, b);
    };
    fit(planet, p, floor, vern, rand, put, { iu, iv, iw, id });
  }
}

// --- what a room says about the people in it ---------------------------------
//
// One fitting per culture, laid in the free corner of an ordinary house. Each
// is a handful of blocks and each answers a different question: what do these
// people MAKE, what do they keep, what do they pray to, how do they keep warm.
//
// The corner used is the one opposite the bed and away from the ladder, and
// every fitting writes through a `put` that refuses to overwrite anything —
// a house is already furnished by the time this runs.
const FITTINGS = {
  // Cinder: a hide stretched on a frame, and the gravel floor they knap on.
  // The two things a people with no loom and no forge actually do indoors.
  hides(planet, p, floor, vern, rand, put, R) {
    const u = R.iu, v = R.iv + R.id - 1;
    // The posts go either side and the hide fills the gap BETWEEN them. A
    // first pass stood the posts on the same two cells the hide wanted, and
    // since `put` refuses to overwrite, the frame came out with nothing
    // stretched on it — a rack of two bare poles.
    for (let z = 1; z <= 3; z++) {
      put(u, v, floor + z, B.POST);
      put(u, v - 2, floor + z, B.POST);
    }
    for (let z = 1; z <= 3; z++) put(u, v - 1, floor + z, B.THATCH);
    put(u + 1, v, floor, BLOCK.GRAVEL);
    put(u + 1, v, floor + 1, BLOCK.CLAY);
  },

  // Ferrum: a bench with the work still on it. A block of iron beside a
  // crafting table is a vice, at this scale and at this distance.
  bench(planet, p, floor, vern, rand, put, R) {
    const u = R.iu, v = R.iv + R.id - 1;
    put(u, v, floor + 1, BLOCK.CRAFTING_TABLE);
    put(u + 1, v, floor + 1, BLOCK.BLOCK_IRON ?? BLOCK.COBBLE);
    put(u, v, floor + 3, slab(MAT.COBBLE, 1));          // shelf over it
    put(u + 1, v, floor + 3, slab(MAT.COBBLE, 1));
  },

  // Thalassa: a shrine alcove — a step, a light on it, a post either side.
  // Small, and the only thing in the room raised off the floor.
  alcove(planet, p, floor, vern, rand, put, R) {
    const f = p.f, u = R.iu, v = R.iv + R.id - 1;
    put(u, v, floor + 1, BLOCK.COBBLE);
    put(u, v, floor + 2, vern.light);
    glow(f, u, v, floor + 2);
    put(u, v - 1, floor + 1, vern.frame);
    put(u + 1, v, floor + 1, vern.frame);
  },

  // Rime: the stove bench. A run of warm brick along the wall with the fire
  // at one end of it — which is how you survive a winter on that world, and
  // the only fitting here you can sit on.
  stove(planet, p, floor, vern, rand, put, R) {
    const f = p.f, v = R.iv + R.id - 1;
    for (let k = 0; k < Math.min(3, R.iw); k++) {
      put(R.iu + k, v, floor + 1, B.BRICK);
    }
    put(R.iu, v, floor + 2, B.CAMPFIRE);
    glow(f, R.iu, v, floor + 2);
  },

  // Tempest: water jars and a rug. Everything about the storm world is water
  // arriving and water being kept, and the rug is the one soft thing in any
  // house in the game.
  jars(planet, p, floor, vern, rand, put, R) {
    const clay = CS.cementId ? CS.cementId(2) : BLOCK.CLAY;
    const rug = CS.cementId ? CS.cementId(1) : B.PATH;
    const v = R.iv + R.id - 1;
    put(R.iu, v, floor + 1, clay);
    put(R.iu + 1, v, floor + 1, clay);
    put(R.iu, v, floor + 2, slab(MAT.BRICK, 0));
    for (let k = 0; k < Math.min(2, R.iw); k++)
      for (let j = 0; j < Math.min(2, R.id - 1); j++)
        put(R.iu + k, R.iv + j, floor, rug);
  },

  // Vulcan: a furnace built into the wall and a stone bench beside it. On a
  // world where nothing burns, the fire is the one thing indoors.
  forge(planet, p, floor, vern, rand, put, R) {
    const v = R.iv + R.id - 1;
    put(R.iu, v, floor + 1, BLOCK.FURNACE);
    put(R.iu + 1, v, floor + 1, slab(MAT.COBBLE, 1));
    put(R.iu + 1, v, floor + 3, slab(MAT.COBBLE, 1));
  },

  // Terran: a barrel and the herbs hung to dry over it. Home gets the
  // quietest fitting of the seven on purpose — it is the one you are meant to
  // stop noticing, so that the others read as different.
  larder(planet, p, floor, vern, rand, put, R) {
    const v = R.iv + R.id - 1;
    put(R.iu, v, floor + 1, BLOCK.LOG);
    put(R.iu, v, floor + 3, B.WHEAT);
    put(R.iu + 1, v, floor + 3, B.WHEAT);
  },
};

// TWO BEDS, UPSTAIRS.
//
// A house with a floor over it does not sleep on the ground one. Downstairs is
// the fire, the table and the door — a bed in the middle of that is a bedsit,
// and every house in the world was one. So the beds go up: it is what the
// ladder, the hatch and the whole extra course of headroom under the eaves
// were already there for, and the ground floor gets its corner back.
//
// TWO of them, because a household is not one person. It is also the reason
// this is worth doing at all rather than moving one bed up a ladder: a village
// holds as many people as it has beds (see `beds` in the site record), so a
// street of houses that sleeps two to a room holds twice what it did, and a
// chief with somewhere to put people has something to grow into.
//
// The pair go against the far wall with a nightstand between them, heads to
// the wall, and the near corner is left alone — that one is the ladder's, and
// a bed across the hatch is a bed you fall through.
function bedroom(planet, p, floorH, vern, rand) {
  const f = p.f;
  const iu = p.u0 + 1, iv = p.v0 + 1;
  const iw = p.w - 2, id = p.d - 2;
  if (iw < 2 || id < 3) return 0;
  const u = iu + iw - 1;                       // the far wall from the ladder
  // Two colours, and not the same one twice: two beds in one room is where a
  // people's second bed colour finally has somewhere to be.
  const first = rand() < 0.55 ? 0 : 1;
  let laid = 0;
  for (const [k, v] of [[first, iv], [1 - first, iv + 2]]) {
    layBed(planet, f, u, v, floorH + 1, vern.bed[k], 0);
    laid++;
  }
  planet.set(f, u, iv + 1, floorH + 1, slab(MAT.PLANK, 0));   // between them
  // Written down for work.js: this is the row a made bed joins the end of.
  sleepFloor = floorH + 1;
  return laid;
}

// A loft floor with a hatch and a ladder up to it. The ladder hangs on the
// -u wall of the room, one cell in from the corner post, which is a cell the
// window bays never use.
//
// HEADROOM. Every building with one of these carries a wall course between
// the loft floor and the eave that exists for no other reason. A gable roof
// starts AT the eave and closes in from both sides as it climbs, so a loft
// whose eave sits one cell above its floor is a room you can only crouch in:
// the pitch is already on your head at the walls, and the standing room is a
// strip under the ridge. One more course lifts the whole pitch clear and
// turns the loft into a floor you can walk across.
function loft(planet, p, floorH, vern) {
  const f = p.f;
  const lu = p.u0 + 1, lv = p.v0 + 1;
  for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
    for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++)
      planet.set(f, u, v, floorH, BLOCK.PLANK);
  // joist band on the inside face of the wall, visible from below
  ring(planet, f, p.u0, p.v0, p.w, p.d, floorH, vern.trim);
  // the bottom rung has to be the cell your feet stand in, or the ladder
  // starts out of reach of the floor
  const h0 = p.base + 1;
  for (let h = h0; h <= floorH; h++) planet.set(f, lu, lv, h, ladder(1));
  planet.set(f, lu, lv, floorH + 1, BLOCK.AIR);
  planet.set(f, lu + 1, lv, floorH, BLOCK.PLANK);   // landing to step onto
  if (audit.on)
    audit.ladders.push({ f, u: lu, v: lv, h0, h1: floorH });
  return { u: lu, v: lv };
}

// --- house archetypes ------------------------------------------------------
//
// All of them are the same building put together at different sizes: plinth,
// walls with bays, a wall plate, a stair roof. What varies is storeys, the
// roof covering and which details a building of that size earns.

function cottage(planet, p, side, vern, rand) {
  if (houses3(planet, vern)) return cottage3(planet, p, side, vern, rand);
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  // walls one course above the loft floor at b+4, so the roof clears it
  storey(planet, p, b + 1, b + 5, vern, {
    plinth: vern.plinth,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  loft(planet, p, b + 4, vern);
  furnish(planet, p, b, vern, rand, { noBed: true, side });
  bedroom(planet, p, b + 4, vern, rand);           // ...they sleep up there
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  planet.set(p.f, p.u0 + 1, p.v0 + p.d - 2, b + 5, vern.light);   // loft light
  const rf = roof(planet, p, b + 6, vern);
  if (span >= 6 && rand() < 0.5) {
    const rc = p.ax ? p.v0 + (p.d >> 1) : p.u0 + (p.w >> 1);
    dormer(planet, p, b + 6, span, vern, rc, 1, true);
  }
  chimney(planet, p.f, hz.u, hz.v, b + 1, rf.top + 1, vern);
  return carveDoor(planet, p, side, b, vern);
}

// A storey and a half: taller walls, a string course, and a dormer, so it is
// visibly a bigger version of the cottage rather than a different idea.
function house(planet, p, side, vern, rand) {
  if (houses3(planet, vern)) return house3(planet, p, side, vern, rand);
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(7, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  // walls one course above the loft floor at b+5, so the roof clears it
  storey(planet, p, b + 1, b + 6, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  halfTimber(planet, p, b + 3, b + 6, vern);
  stringCourse(planet, p, b + 2, vern);
  loft(planet, p, b + 5, vern);
  furnish(planet, p, b, vern, rand, { noBed: true, side });
  bedroom(planet, p, b + 5, vern, rand);
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  planet.set(p.f, p.u0 + 1, p.v0 + p.d - 2, b + 6, vern.light);
  const rf = roof(planet, p, b + 7, vern);
  const rc = p.ax ? p.v0 + (p.d >> 1) : p.u0 + (p.w >> 1);
  dormer(planet, p, b + 7, span, vern, rc, 1, true);
  dormer(planet, p, b + 7, span, vern, rc, 1, false);
  chimney(planet, p.f, hz.u, hz.v, b + 1, rf.top + 1, vern);
  return carveDoor(planet, p, side, b, vern);
}

// Two full storeys: masonry below, timber framing above, one chimney. The
// material change at the string course is what reads as two floors from a
// distance, before any window is legible.
function twoStorey(planet, p, side, vern, rand) {
  if (houses3(planet, vern)) return townhouse3(planet, p, side, vern, rand);
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(9, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 4, vern, {
    plinth: vern.plinth,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  furnish(planet, p, b, vern, rand, { noBed: true, side });
  loft(planet, p, b + 4, vern);                    // the first floor
  // timber over masonry: the material change at the string course is what
  // reads as two floors from a distance, before any window is legible
  // one course above the top loft floor at b+7, the same as everywhere else.
  // The floor below it keeps the two clear cells it always had — a flat
  // ceiling two cells up is a room; a pitched one is not.
  storey(planet, p, b + 5, b + 8, vern, { wall: vern.upper });
  halfTimber(planet, p, b + 5, b + 8, vern);
  loft(planet, p, b + 7, vern);                    // relays the ladder shaft
  // The upstairs room already had the chest and the nightstand standing in it
  // and no bed — a bedroom furnished round a bed that was one floor below it.
  bedroom(planet, p, b + 4, vern, rand);
  // The far wall is the BEDS' wall (see bedroom), so the chest goes to the
  // other side of the room — the near-u wall at the far end, under the loft
  // light and well clear of the hatch, which sits at (u0+1, v0+1) and is
  // AIR on purpose: a chest is allowed into any empty cell, so a hatch is
  // exactly the empty cell it must never be offered.
  houseChest(planet, p.f, p.u0 + 1, p.v0 + p.d - 2, b + 5,
    [[p.u0 + 2, p.v0 + p.d - 2], [p.u0 + 1, p.v0 + p.d - 3]]);
  planet.set(p.f, p.u0 + 1, p.v0 + p.d - 2, b + 8, vern.light);
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  const rf = roof(planet, p, b + 9, vern);
  const rc = p.ax ? p.v0 + (p.d >> 1) : p.u0 + (p.w >> 1);
  dormer(planet, p, b + 9, span, vern, rc, 1, true);
  chimney(planet, p.f, hz.u, hz.v, b + 1, rf.top + 1, vern);
  return carveDoor(planet, p, side, b, vern);
}

// The hall: the largest plan, always nearest the green, with a porch on posts
// over its door and a chimney at each gable. A village needs one building
// that is obviously the public one.
function hall(planet, p, side, vern, rand) {
  if (houses3(planet, vern)) return hall3(planet, p, side, vern, rand);
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(7, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  // walls one course above the loft floor at b+5, so the roof clears it
  storey(planet, p, b + 1, b + 6, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  halfTimber(planet, p, b + 2, b + 6, vern);
  // The hall gets a bed, a chest and a lamp like any other room, and NOT a
  // table: it lays its own long one across the same middle two lines a
  // moment later. Both went in before, so a hall came out with a spare table
  // stranded in the seating row with a chair either side of it and nothing
  // to sit at — two thirds of the floor covered, in the one room that is
  // supposed to have people standing about in it.
  furnish(planet, p, b, vern, rand, { noTable: true, noBed: true, side });
  // a long table down the hall, which is what tells you it is not a house —
  // real tables end to end now, with a chair at every other place so the row
  // reads as seating rather than as a picket fence
  const tv = p.v0 + (p.d >> 1);
  for (let u = p.u0 + 2; u < p.u0 + p.w - 2; u++) {
    planet.set(p.f, u, tv, b + 1, B.TABLE);
    if ((u - p.u0) & 1) continue;
    planet.set(p.f, u, tv - 1, b + 1, chair(3));
    planet.set(p.f, u, tv + 1, b + 1, chair(2));
  }
  loft(planet, p, b + 5, vern);
  // ...and the chief sleeps over his own hall, not in the corner of it
  bedroom(planet, p, b + 5, vern, rand);
  planet.set(p.f, p.u0 + 2, p.v0 + 1, b + 6, vern.light);
  const hz = hearth(planet, p, b, vern, true);
  const hz2 = hearth(planet, p, b, vern, false);
  const rf = roof(planet, p, b + 7, vern, { verge: 1, over: 2 });
  const rc = p.ax ? p.v0 + (p.d >> 1) : p.u0 + (p.w >> 1);
  dormer(planet, p, b + 7, span, vern, rc - 2, 1, true);
  dormer(planet, p, b + 7, span, vern, rc + 2, 1, true);
  chimney(planet, p.f, hz.u, hz.v, b + 1, rf.top + 1, vern);
  chimney(planet, p.f, hz2.u, hz2.v, b + 1, rf.top + 1, vern);
  const door = carveDoor(planet, p, side, b, vern, 1, 3);
  porch(planet, p, side, b, vern);
  return door;
}

// A porch: two posts, a beam and a slab canopy, one cell out from the door.
function porch(planet, p, side, floor, vern) {
  const c = wallCell(p, side);
  const au = c.du === 0 ? 1 : 0, av = c.du === 0 ? 0 : 1;
  for (const k of [-1, 1]) {
    const u = c.u + au * k + c.du, v = c.v + av * k + c.dv;
    for (let h = floor + 1; h <= floor + 3; h++)
      planet.set(p.f, u, v, h, B.FENCE);
  }
  for (let k = -1; k <= 1; k++)
    planet.set(p.f, c.u + au * k + c.du, c.v + av * k + c.dv,
      floor + 4, slab(vern.roof, 0));
  planet.set(p.f, c.u + c.du, c.v + c.dv, floor + 3, vern.light);
  glow(p.f, c.u + c.du, c.v + c.dv, floor + 3);
}

// A barn: no plinth windows, a heavy frame every other bay, a cart doorway
// and hay to the rafters. Same roof as everything else, one course taller.
function barn(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.DIRT);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 5, vern, {
    // boarding, not the house wall: a barn is a shed, whatever the village is
    // built of — so the culture names its own boarding rather than getting
    // sawn planks on a world where nobody has a saw.
    wall: vern.board ?? BLOCK.PLANK, plinth: vern.plinth,
    skip: { side, at: side < 2 ? c.u : c.v, half: 2 },
  });
  // heavy frame: a post every other cell, which is what reads as a barn
  for (let u = p.u0 + 2; u < p.u0 + p.w - 1; u += 2)
    for (let h = b + 1; h <= b + 5; h++) {
      planet.set(p.f, u, p.v0, h, vern.frame);
      planet.set(p.f, u, p.v0 + p.d - 1, h, vern.frame);
    }
  // hay stacked against the back wall, and a loft of it over the far bay
  for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++) {
    planet.set(p.f, p.u0 + p.w - 2, v, b + 1, B.THATCH);
    if (rand() < 0.5) planet.set(p.f, p.u0 + p.w - 2, v, b + 2, B.THATCH);
  }
  houseChest(planet, p.f, p.u0 + 1, p.v0 + 1, b + 1);
  planet.set(p.f, p.u0 + 1, p.v0 + p.d - 2, b + 4, vern.light);
  roof(planet, p, b + 6, vern, { over: 2 });
  return carveDoor(planet, p, side, b, vern, 3, 3);
}

// --- the third generation's houses -----------------------------------------
//
// THE PLAYER ASKED FOR NICER HOUSES, and a world of the third generation (see
// TERRAIN_GEN in cubesphere.js) is where they go. Only there: a house is
// generation, and a village rebuilt differently under a world that was
// already standing would put every edit its player made into somebody else's
// wall. So the builders above keep building exactly what they always built
// for the first two generations, and these are what a new world's homes are.
//
// What was wrong with the old ones, looked at from the street:
//   * every wall was a sampler — planks, cobble, brick, logs, and a corner
//     that changed material every course — so no house had a colour;
//   * the windows were slits, and a cottage's sat above its own ceiling;
//   * the roof sat ON the walls with a half-slab lip, so a house had no
//     eaves and never cast a shadow on itself;
//   * the chimney came up out of the ridge, and a dormer was a box.
//
// They are now built in one grammar, the one a timber-framed village is
// built in: a rubble plinth; dark posts and beams with plaster between them;
// lights two panes tall between the posts; a roof that OVERSAILS the walls by
// a cell on every side, its eave level with the top of the wall and its
// verges finished with barge boards; a gable framed round an attic light; a
// chimney stack standing outside one gable; a window box of flowers under the
// street windows; and on a two-storey house that fronts a street, the upper
// floor JETTIED a cell out over the front door. A brick or a stone village
// raises its ground floors in its own masonry, with timber lintels, and
// frames the floor above.
//
// What a house IS does not change: the same rooms at the same heights, the
// same furniture, the same beds, ladder and hearth — and the same numbers
// taken off the village's random stream in the same order, so a village of
// the third generation stands exactly where it would have stood and only
// looks better. What the new look chooses for itself (which flowers, which
// stones are mossy) it chooses off the plot's own cell.

// Whether a house is built in this grammar: a world of the third generation,
// and a people who build under a pitched roof. The cone, the deep eave, the
// sweep and the flat roof are grammars of their own and keep their builders.
const houses3 = (planet, vern) => !!planet?.gen3
  && (vern.style ?? 'gable') === 'gable';

// ...and what every OTHER building of such a village is dressed in. The
// church, the shop, the tower and the rest are still the builders they
// always were, but on a new world they take two lessons from the houses: a
// corner is one stone all the way up — the old quoin changed material every
// course, and every corner in the village was a chequerboard — and the
// plinth under the wall is fieldstone, the course the new houses stand on.
// Home's only: every other people's corners were drawn to be what they are.
const VERN3 = new Map();
function vern3(planet, vern) {
  if (!planet?.gen3 || vern.culture !== 'terran' || vern.name === 'fen') return vern;
  let v = VERN3.get(vern);
  if (!v) {
    v = { ...vern, quoinB: vern.quoinA, plinth: BLOCK.COBBLESTONE ?? vern.plinth };
    // ...and the brick village's houses are roofed in slate (see dress3), so
    // its church and its shop are too, rather than in the old boards
    if (vern.name === 'brick') { v.roof = MAT.COBBLE; v.roofBlock = BLOCK.COBBLE; }
    VERN3.set(vern, v);
  }
  return v;
}

// the stair material a log is, for barge boards; -1 on a world without it
const MAT_LOG = CS.STAIR_MATERIALS ? CS.STAIR_MATERIALS.indexOf(BLOCK.LOG) : -1;

const MASONRY = new Set([BLOCK.COBBLE, BLOCK.STONE, B.BRICK, BLOCK.COBBLESTONE,
  BLOCK.COBBLESTONE_MOSSY, BLOCK.COBBLESTONE_DARK].filter((b) => b != null));

// WHAT ONE OF THESE HOUSES IS MADE OF, read off the village's vernacular.
//
// Home's three vernaculars get the palette the grammar was drawn in — dark
// oak and plaster over fieldstone — and differ where the old ones differed:
// what the ground floor is raised in and what the roof is covered with. Any
// other people who roof with a gable (Ferrum, Vulcan) builds the same shapes
// out of its own blocks, and so does a house the player ordered in the
// materials they chose.
function dress3(p, vern) {
  const dark = CS.logId ? CS.logId(4) : BLOCK.LOG;
  const plaster = CS.cementId ? CS.cementId(0) : BLOCK.PLANK;
  const rubble = BLOCK.COBBLESTONE ?? BLOCK.COBBLE;
  const moss = BLOCK.COBBLESTONE_MOSSY ?? null;
  const wallBlock = (i) => (CS.wallId ? CS.wallId(i) : null);
  const S = {
    post: vern.frame, beam: vern.frame,
    plaster: vern.upper, mason: vern.wall,
    masonry: MASONRY.has(vern.wall),
    plinth: vern.plinth, moss: null,
    quoin: vern.quoinA ?? vern.wall,
    roof: vern.roof, verge: vern.roof,
    stack: vern.hearth ?? vern.plinth, pot: null,
    glass: vern.glass === undefined ? B.PANE : vern.glass,
    box: slab(MAT.PLANK, 1),
    flower: null,
  };
  if (vern.culture === 'terran' && !vern.chose && vern.name !== 'fen') {
    S.post = S.beam = dark;
    S.plaster = plaster;
    S.plinth = rubble;
    S.moss = moss;
    S.quoin = BLOCK.COBBLE;
    S.stack = rubble;
    S.pot = wallBlock(3);
    S.mason = rubble;
    S.masonry = false;
    S.roof = MAT.THATCH;
    S.verge = MAT_LOG >= 0 ? MAT_LOG : MAT.THATCH;
    if (vern.name === 'brick') {
      // brick below and slate over: the one of the three with a hard roof
      S.mason = B.BRICK;
      S.masonry = true;
      S.quoin = BLOCK.STONE;
      S.stack = B.BRICK;
      S.pot = wallBlock(0);
      S.roof = S.verge = MAT.COBBLE;
    } else if (vern.name === 'stone') {
      S.masonry = true;
    }
  }
  // one colour of flowers a house, which reads as somebody's choice
  const r = mulberry32(cellHash(p.f, p.u0, p.v0, 0x51f3));
  S.flower = [BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW, BLOCK.FLOWER_BLUE][
    Math.floor(r() * 3)];
  return S;
}

// fieldstone, with the odd mossy one near the ground
function stone3(S, f, u, v, h, base) {
  if (S.moss == null || h > base + 2) return S.plinth;
  return (cellHash(f * 31 + h, u, v, 0x70c4) & 7) < 2 ? S.moss : S.plinth;
}
function mason3(S, f, u, v, h, base) {
  if (S.mason !== S.plinth || S.moss == null) return S.mason;
  return stone3(S, f, u, v, h, base);
}

// WHICH CELL OF A WALL IS WHAT: 'P' a post, 'W' a light, 'F' a plaster panel,
// 'D' the door. A post at each corner, and one in the middle of any run too
// long to leave unbraced; between posts, lights sit in plaster, centred on
// their own panel, and a door stands in plaster with its lights further out.
// That is box framing, and it reads as a frame round white walls — the close
// studding the first cut tried, a post every other cell, read as a dark wall
// with gaps in it. `posts` are cells that must be posts: the middle of the
// gable the chimney stack stands against.
function bays3(L, door = -1, posts = []) {
  const a = new Array(L).fill('');
  a[0] = a[L - 1] = 'P';
  for (const k of posts ?? []) if (k > 0 && k < L - 1) a[k] = 'P';
  const hasDoor = door > 0 && door < L - 1;
  if (hasDoor) a[door] = 'D';
  // brace a long run in its middle, unless the door is what is there
  for (let i = 1; i < L - 1;) {
    if (a[i] === 'P') { i++; continue; }
    let j = i;
    while (j < L - 1 && a[j] !== 'P') j++;
    if (j - i > 5) {
      const m = (i + j - 1) >> 1;
      if (!a.slice(i, j).includes('D')) a[m] = 'P';
    }
    i = j;
  }
  for (let i = 1; i < L - 1;) {
    if (a[i]) { i++; continue; }
    let j = i;
    while (j < L - 1 && !a[j]) j++;
    const n = j - i;
    const byDoorL = a[i - 1] === 'D', byDoorR = a[j] === 'D';
    let run;
    if ((byDoorL || byDoorR) && n < 4) {
      // lights away from the door, a panel beside it
      run = [...seg3(n - 1), 'F'];
      if (byDoorL) run.reverse();
    } else run = seg3(n);
    for (let k = 0; k < n; k++) a[i + k] = run[k];
    i = j;
  }
  return a;
}

// A panel run of n cells between two posts, symmetric about its middle.
function seg3(n) {
  if (n <= 0) return [];
  if (n === 1) return ['W'];
  if (n === 2) return ['W', 'W'];
  if (n === 4) return ['F', 'W', 'W', 'F'];
  const out = [];
  for (let k = 0; k < n; k++) out.push(k & 1 ? 'W' : 'F');
  // even: the far half mirrors the near one, so it meets itself in the middle
  if (!(n & 1)) for (let k = 0; k < n >> 1; k++) out[n - 1 - k] = out[k];
  return out;
}

// The cell of wall `side` of rect q that is `k` cells along it, and the way out.
function wallAt3(q, side, k) {
  if (side === 0) return [q.u0 + k, q.v0, 0, -1];
  if (side === 1) return [q.u0 + k, q.v0 + q.d - 1, 0, 1];
  if (side === 2) return [q.u0, q.v0 + k, -1, 0];
  return [q.u0 + q.w - 1, q.v0 + k, 1, 0];
}

// The middle of the GABLE the hearth backs onto — `hz`, the wall cell hearth()
// returned — as an index along the matching wall of q, which may be wider (a
// jettied floor). A post goes there on every storey, so the chimney stack
// standing outside it never has a light behind it.
function stackPost3(p, hz, q = p) {
  if (p.ax) return { [hz.v === p.v0 ? 0 : 1]: [hz.u - q.u0] };
  return { [hz.u === p.u0 ? 2 : 3]: [hz.v - q.v0] };
}

// The fire's back is the wall's own cell, two courses of it: walls laid after
// the hearth put it back.
function fireback3(planet, p, hz, floor, vern) {
  if (!vern.hearth) return;
  planet.set(p.f, hz.u, hz.v, floor + 1, vern.hearth);
  planet.set(p.f, hz.u, hz.v, floor + 2, vern.hearth);
}

// ONE STOREY OF WALL on the rect q, a course per entry of `roles` from h0 up:
// 'plinth' (fieldstone all round), 'light' (glass in the lights), 'panel'
// (the lights built up) and 'beam' (the timber band a floor or a wall plate
// is). A timber storey is dark posts and beams with plaster between; a
// masonry storey builds its posts and panels in its own stone, with a quoin
// at each corner and a timber lintel over each light. Every light of the
// storey's first glazed course is pushed onto `o.lights`, for window boxes.
function walls3(planet, q, h0, roles, S, o = {}) {
  const f = q.f;
  const mason = !!o.mason;
  const base = o.base ?? h0 - 1;
  for (let side = 0; side < 4; side++) {
    const L = side < 2 ? q.w : q.d;
    const bays = bays3(L, o.door?.side === side ? o.door.at : -1, o.posts?.[side]);
    for (let k = 0; k < L; k++) {
      const [u, v, du, dv] = wallAt3(q, side, k);
      const t = bays[k];
      const corner = k === 0 || k === L - 1;
      let lit = false;
      for (let i = 0; i < roles.length; i++) {
        const h = h0 + i, role = roles[i];
        let b;
        if (role === 'plinth') b = stone3(S, f, u, v, h, base);
        else if (role === 'beam') {
          b = mason && t !== 'W' ? (corner ? S.quoin : mason3(S, f, u, v, h, base))
            : S.beam;
        } else if (t === 'W' && role === 'light') {
          b = S.glass ?? BLOCK.AIR;
          if (!lit && o.lights) o.lights.push({ u, v, h, du, dv, side });
          lit = true;
        } else if (corner) b = mason ? S.quoin : S.post;
        else if (t === 'P') b = mason ? mason3(S, f, u, v, h, base) : S.post;
        else b = mason ? mason3(S, f, u, v, h, base) : (o.fill ?? S.plaster);
        planet.set(f, u, v, h, b);
      }
    }
  }
}

// The rect q grown by a cell on the side the door is on: the jettied floor.
function jettied3(p, side) {
  const q = { ...p };
  if (side === 0) { q.v0--; q.d++; }
  else if (side === 1) q.d++;
  else if (side === 2) { q.u0--; q.w++; }
  else q.w++;
  return q;
}

// The floor over the ground floor, across the whole of q, with a hatch and a
// ladder up to it from the room below: loft() for a floor that may be wider
// than the room it covers, and without loft()'s joist band, which here is
// the beam course the walls have already laid.
function loft3(planet, p, q, floorH) {
  const f = p.f;
  for (let u = q.u0 + 1; u < q.u0 + q.w - 1; u++)
    for (let v = q.v0 + 1; v < q.v0 + q.d - 1; v++)
      planet.set(f, u, v, floorH, BLOCK.PLANK);
  const lu = p.u0 + 1, lv = p.v0 + 1;
  const h0 = p.base + 1;
  for (let h = h0; h <= floorH; h++) planet.set(f, lu, lv, h, ladder(1));
  planet.set(f, lu, lv, floorH + 1, BLOCK.AIR);
  planet.set(f, lu + 1, lv, floorH, BLOCK.PLANK);
  if (audit.on) audit.ladders.push({ f, u: lu, v: lv, h0, h1: floorH });
}

// Which gable end of p the hearth went to: 0 the low one, 1 the high one.
const stackEnd3 = (p, hz) => (p.ax ? (hz.v === p.v0 ? 0 : 1) : (hz.u === p.u0 ? 0 : 1));

// THE ROOF, OVERSAILING. Its first row stands a cell OUTSIDE each eave wall,
// level with the wall's top course, so the walls stand in under an eave that
// throws a shadow down them; the pitch climbs one in one to the ridge and
// runs a cell past each gable as a verge, the verge's own stairs being the
// barge boards. The gable itself is closed in `o.fill` round a king post and,
// on the gable the chimney is not on, an attic light. Returns what roof()
// returns, so a stack can be built off it.
function roof3(planet, q, E, S, o = {}) {
  const put = (r, s, h, b) => roofPut(planet, q, r, s, h, b);
  const r0 = q.ax ? q.v0 : q.u0, rn = q.ax ? q.d : q.w;
  const s0 = q.ax ? q.u0 : q.v0, sn = q.ax ? q.w : q.d;
  const up = q.ax ? 0 : 2, dn = q.ax ? 1 : 3;
  const ra = r0 - 1, rb = r0 + rn;
  const fill = o.fill ?? S.plaster;
  const rec = audit.on ? { kind: 'roof', f: q.f, u0: q.u0, v0: q.v0,
    w: q.w, d: q.d, eave: E, top: 0, stairs: [] } : null;
  const rows = [];
  let a = s0 - 1, b = s0 + sn, h = E;
  for (; a < b && h < H - 2; a++, b--, h++) {
    for (let r = ra; r <= rb; r++) {
      const m = r === ra || r === rb ? S.verge : S.roof;
      put(r, a, h, stair(m, up));
      put(r, b, h, stair(m, dn));
      if (rec) {
        rec.stairs.push({ ...(q.ax ? { u: a, v: r } : { u: r, v: a }), h, want: up },
          { ...(q.ax ? { u: b, v: r } : { u: r, v: b }), h, want: dn });
      }
    }
    if (h > E) rows.push([h, a + 1, b - 1]);
  }
  const odd = a === b;
  // an odd span closes on a single ridge, a slab laid between the top steps
  if (odd) for (let r = ra; r <= rb; r++) put(r, a, h - 1, slab(S.roof, 1));
  for (const [rg, end] of [[r0, 0], [r0 + rn - 1, 1]]) {
    const stacked = o.stack === end || o.stack === 2;
    for (const [hh, lo, hi] of rows) {
      const n = hi - lo + 1;
      const mid = (lo + hi) / 2;
      for (let s = lo; s <= hi; s++) {
        const centre = Math.abs(s - mid) < 0.6;
        let blk = fill;
        if (hh === E + 1 && n >= 3 && centre && !stacked) blk = S.glass ?? BLOCK.AIR;
        else if (centre && (n & 1) && (hh > E + 1 || stacked)) blk = S.post;
        put(rg, s, hh, blk);
      }
    }
    if (odd) put(rg, a, h - 1, S.post);          // the king post's head
  }
  if (rec) { rec.top = h - 1; audit.roofs.push(rec); }
  return { top: h - 1, ridge: (s0 + s0 + sn - 1) >> 1, r0, rn, s0, sn };
}

// A CHIMNEY STACK, standing outside the gable the hearth backs onto: masonry
// from the ground to a course over the ridge, and a pot on top. The fire is
// against the inside of that wall (see hearth), so the stack is where its
// smoke would actually go.
function stack3(planet, p, hz, floor, top, S) {
  const [du, dv] = p.ax ? [0, hz.v === p.v0 ? -1 : 1] : [hz.u === p.u0 ? -1 : 1, 0];
  const u = hz.u + du, v = hz.v + dv;
  const cap = Math.min(top + 1, H - 3);
  for (let h = floor + 1; h <= cap; h++) planet.set(p.f, u, v, h, S.stack);
  if (S.pot != null) planet.set(p.f, u, v, cap + 1, S.pot);
}

// The doorway: a threshold, the leaf, a timber lintel, and the step outside.
// carveDoor without its jambs — here the posts either side ARE the jambs.
function door3(planet, p, side, floor, vern, S, tall = 2) {
  const f = p.f;
  const c = wallCell(p, side);
  planet.set(f, c.u, c.v, floor, BLOCK.PLANK);
  for (let h = 1; h <= tall; h++) {
    planet.set(f, c.u, c.v, floor + h, BLOCK.AIR);
    planet.set(f, c.u + c.du, c.v + c.dv, floor + h, BLOCK.AIR);
  }
  planet.set(f, c.u, c.v, floor + tall + 1, S.beam);
  planet.set(f, c.u + c.du, c.v + c.dv, floor, B.PATH);
  // hung OPEN, for the reason carveDoor gives
  if (hangDoor && vern.door !== false) {
    planet.set(f, c.u, c.v, floor + 1, hangDoor(c.du, c.dv, null));
  }
  return { f, u: c.u, v: c.v, h: floor + 1, du: c.du, dv: c.dv };
}

// WINDOW BOXES: under each light on the given sides, a board a cell out from
// the wall with its top level with the sill, and the house's flowers in it.
// Never on the doorstep or the path out of it, and never over anything.
function boxes3(planet, f, lights, sides, door, S) {
  // the step, and the second column of the path frontGarden lays out of it
  const au = door && door.du === 0 ? 1 : 0, av = door && door.du === 0 ? 0 : 1;
  const onPath = (u, v) => !!door && ((u === door.u + door.du && v === door.v + door.dv)
    || (u === door.u + door.du + au && v === door.v + door.dv + av));
  for (const L of lights) {
    if (!sides.includes(L.side)) continue;
    const u = L.u + L.du, v = L.v + L.dv, h = L.h - 1;
    if (onPath(u, v)) continue;
    if (planet.get(f, u, v, h) !== BLOCK.AIR || planet.get(f, u, v, h + 1) !== BLOCK.AIR) {
      continue;
    }
    planet.set(f, u, v, h, S.box);
    planet.set(f, u, v, h + 1, S.flower);
  }
}

// A lantern hung beside the door, a cell out, under whatever is over it —
// the eave, the jetty or a hood.
function doorLamp3(planet, door, h, vern) {
  if (!door || !vern.light) return;
  const au = door.du === 0 ? 1 : 0, av = door.du === 0 ? 0 : 1;
  const u = door.u + door.du + au, v = door.v + door.dv + av;
  if (planet.get(door.f, u, v, h) !== BLOCK.AIR) return;
  planet.set(door.f, u, v, h, vern.light);
  glow(door.f, u, v, h);
}

// A hood over a door in a gable, where no eave comes down to shelter it.
function hood3(planet, door, h, S) {
  const au = door.du === 0 ? 1 : 0, av = door.du === 0 ? 0 : 1;
  for (let k = -1; k <= 1; k++) {
    planet.set(door.f, door.u + door.du + au * k, door.v + door.dv + av * k, h,
      slab(S.roof, 0));
  }
}

// Whether the door of p is in a gable rather than under an eave.
const gableDoor3 = (p, side) => (p.ax === 0) === (side >= 2);

// THE ORDER THESE ARE BUILT IN is not the order of the old builders, and it
// is not arbitrary. The rooms are furnished and the hearth placed FIRST —
// the three calls that take numbers off the village's stream, in the order
// the old builders took them — and the walls go up round them afterwards,
// because the walls want to know which gable the chimney stands against and
// that is one of those numbers.

// A COTTAGE: one storey and a sleeping loft under a big low roof, its eave
// coming down to the top of the ground-floor lights.
function cottage3(planet, p, side, vern, rand) {
  const b = p.base, f = p.f;
  const S = dress3(p, vern);
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, f, p.u0, p.v0, p.w, p.d, b, S.plinth);
  furnish(planet, p, b, vern, rand, { noBed: true, side });
  bedroom(planet, p, b + 4, vern, rand);           // ...they sleep up there
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  // the old dormer's roll, taken so the village's stream is not moved
  if (span >= 6) rand();
  const c = wallCell(p, side);
  const at = side < 2 ? c.u - p.u0 : c.v - p.v0;
  const lights = [];
  walls3(planet, p, b + 1, ['plinth', 'light', 'light', 'beam', 'panel'], S,
    { mason: S.masonry, door: { side, at }, posts: stackPost3(p, hz), lights, base: b });
  fireback3(planet, p, hz, b, vern);
  loft3(planet, p, p, b + 4);
  planet.set(f, p.u0 + 1, p.v0 + p.d - 2, b + 5, vern.light);   // loft light
  const rf = roof3(planet, p, b + 5, S, { stack: stackEnd3(p, hz),
    fill: S.masonry ? S.mason : S.plaster });
  stack3(planet, p, hz, b, rf.top, S);
  const door = door3(planet, p, side, b, vern, S);
  const gd = gableDoor3(p, side);
  if (gd) hood3(planet, door, b + 4, S);
  doorLamp3(planet, door, gd ? b + 3 : b + 4, vern);
  boxes3(planet, f, lights, [side, side ^ 1], door, S);
  return door;
}

// A HOUSE: a storey and a half. The ground floor of the cottage, then a
// floor over it with a knee wall two courses high — lights under the eave —
// and the roof over that.
function house3(planet, p, side, vern, rand) {
  // the large one is a townhouse: two full storeys, jettied to the street
  if ((p.ax ? p.d : p.w) >= 9) {
    return townhouse3(planet, p, side, vern, rand, (S) => S.masonry);
  }
  const b = p.base, f = p.f;
  const S = dress3(p, vern);
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(7, span)));
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, f, p.u0, p.v0, p.w, p.d, b, S.plinth);
  furnish(planet, p, b, vern, rand, { noBed: true, side });
  bedroom(planet, p, b + 4, vern, rand);
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  const c = wallCell(p, side);
  const at = side < 2 ? c.u - p.u0 : c.v - p.v0;
  const lights = [];
  const posts = stackPost3(p, hz);
  walls3(planet, p, b + 1, ['plinth', 'light', 'light', 'beam'], S,
    { mason: S.masonry, door: { side, at }, posts, lights, base: b });
  walls3(planet, p, b + 5, ['light', 'beam'], S, { posts, base: b });
  fireback3(planet, p, hz, b, vern);
  loft3(planet, p, p, b + 4);
  planet.set(f, p.u0 + 1, p.v0 + p.d - 2, b + 5, vern.light);
  const rf = roof3(planet, p, b + 6, S, { stack: stackEnd3(p, hz) });
  stack3(planet, p, hz, b, rf.top, S);
  const door = door3(planet, p, side, b, vern, S);
  hood3(planet, door, b + 4, S);
  doorLamp3(planet, door, b + 3, vern);
  boxes3(planet, f, lights, [side, side ^ 1], door, S);
  return door;
}

// A TOWNHOUSE: two full storeys. On a street, with its door under an eave,
// the upper floor is JETTIED a cell out over the street — a floor you can
// see is a floor from the far end of the road — and the roof is carried over
// the jetty. `masonGround` says whether the ground floor is raised in the
// village's masonry (the two-storey always is; the large house only in a
// brick or stone village).
function townhouse3(planet, p, side, vern, rand, masonGround = () => true) {
  const b = p.base, f = p.f;
  const S = dress3(p, vern);
  const jetty = !!p.street && !gableDoor3(p, side);
  const q = jetty ? jettied3(p, side) : p;
  const span = q.ax ? q.w : q.d;
  levelPlot(planet, p, jetty ? 2 : 1, Math.max(11, roofNeed(9, span)));
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, f, p.u0, p.v0, p.w, p.d, b, S.plinth);
  furnish(planet, p, b, vern, rand, { noBed: true, side });
  bedroom(planet, q, b + 4, vern, rand);
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  const c = wallCell(p, side);
  const at = side < 2 ? c.u - p.u0 : c.v - p.v0;
  const lights = [];
  const upper = [];
  walls3(planet, p, b + 1, ['plinth', 'light', 'light', 'beam'], S,
    { mason: masonGround(S), door: { side, at }, posts: stackPost3(p, hz), lights, base: b });
  walls3(planet, q, b + 4, ['beam', 'light', 'light', 'beam'], S,
    { posts: stackPost3(p, hz, q), lights: upper, base: b });
  fireback3(planet, p, hz, b, vern);
  loft3(planet, p, q, b + 4);
  // a chest upstairs on the near wall, and a lamp standing on it
  const was = planet.houseChests?.length ?? 0;
  houseChest(planet, f, p.u0 + 1, p.v0 + p.d - 2, b + 5,
    [[p.u0 + 2, p.v0 + p.d - 2], [p.u0 + 1, p.v0 + p.d - 3]]);
  const ch = (planet.houseChests?.length ?? 0) > was ? planet.houseChests.at(-1) : null;
  if (ch) planet.set(f, ch.u, ch.v, b + 6, vern.roomLight ?? B.LAMP);
  const rf = roof3(planet, q, b + 7, S, { stack: stackEnd3(p, hz) });
  stack3(planet, p, hz, b, rf.top, S);
  const door = door3(planet, p, side, b, vern, S);
  if (!jetty) hood3(planet, door, b + 4, S);
  doorLamp3(planet, door, b + 3, vern);
  boxes3(planet, f, lights, [side, side ^ 1], door, S);
  boxes3(planet, f, upper, [side], null, S);
  return door;
}

// THE HALL: the long public house on the green. One tall storey — lights
// three panes high — with a loft over it, a stack at each gable and a porch
// on posts over the door.
function hall3(planet, p, side, vern, rand) {
  const b = p.base, f = p.f;
  const S = dress3(p, vern);
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(7, span)));
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, f, p.u0, p.v0, p.w, p.d, b, S.plinth);
  // see hall(): the same room, laid in the same order
  furnish(planet, p, b, vern, rand, { noTable: true, noBed: true, side });
  const tv = p.v0 + (p.d >> 1);
  for (let u = p.u0 + 2; u < p.u0 + p.w - 2; u++) {
    planet.set(f, u, tv, b + 1, B.TABLE);
    if ((u - p.u0) & 1) continue;
    planet.set(f, u, tv - 1, b + 1, chair(3));
    planet.set(f, u, tv + 1, b + 1, chair(2));
  }
  bedroom(planet, p, b + 5, vern, rand);
  const hz = hearth(planet, p, b, vern, true);
  const hz2 = hearth(planet, p, b, vern, false);
  const c = wallCell(p, side);
  const at = side < 2 ? c.u - p.u0 : c.v - p.v0;
  const lights = [];
  const posts = stackPost3(p, hz);
  Object.assign(posts, stackPost3(p, hz2));
  walls3(planet, p, b + 1, ['plinth', 'light', 'light', 'light', 'beam', 'panel'], S,
    { mason: S.masonry, door: { side, at }, posts, lights, base: b });
  fireback3(planet, p, hz, b, vern);
  fireback3(planet, p, hz2, b, vern);
  loft3(planet, p, p, b + 5);
  planet.set(f, p.u0 + 2, p.v0 + 1, b + 6, vern.light);
  const rf = roof3(planet, p, b + 6, S, { stack: 2 });
  stack3(planet, p, hz, b, rf.top, S);
  if (hz2.u !== hz.u || hz2.v !== hz.v) stack3(planet, p, hz2, b, rf.top, S);
  const door = door3(planet, p, side, b, vern, S, 3);
  // the porch: two posts, a canopy of the roof's own covering, a light
  const au = c.du === 0 ? 1 : 0, av = c.du === 0 ? 0 : 1;
  for (const k of [-1, 1]) {
    for (let h = b + 1; h <= b + 3; h++) {
      planet.set(f, c.u + au * k + c.du, c.v + av * k + c.dv, h, B.FENCE);
    }
  }
  hood3(planet, door, b + 4, S);
  planet.set(f, c.u + c.du, c.v + c.dv, b + 3, vern.light);
  glow(f, c.u + c.du, c.v + c.dv, b + 3);
  boxes3(planet, f, lights, [side ^ 1], null, S);
  return door;
}

// The watchtower: the one building allowed to break the vernacular, because
// it is the one building with a different job. Stone to the top, arrow slits
// on the bay rhythm, a ladder up the shaft and a beacon on the parapet.
function tower(planet, p, side, vern, rand) {
  const b = p.base;
  const f = p.f;
  levelPlot(planet, p, 1, 17);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.COBBLE);
  shell(planet, p, b + 1, b + 8, () => BLOCK.COBBLE);
  quoins(planet, p, b + 1, b + 8, vern);
  // arrow slits: one per side, twice up the shaft
  for (const h of [b + 3, b + 6]) {
    const slit = vern.glass ?? B.PANE;
    planet.set(f, p.u0 + (p.w >> 1), p.v0, h, slit);
    planet.set(f, p.u0 + (p.w >> 1), p.v0 + p.d - 1, h, slit);
    planet.set(f, p.u0, p.v0 + (p.d >> 1), h, slit);
    planet.set(f, p.u0 + p.w - 1, p.v0 + (p.d >> 1), h, slit);
  }
  // mid floor, then the parapet walk, with a hatch and a ladder through both
  for (const fl of [b + 4, b + 8]) {
    for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
      for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++)
        planet.set(f, u, v, fl, BLOCK.PLANK);
    ring(planet, f, p.u0, p.v0, p.w, p.d, fl, BLOCK.COBBLE);
  }
  const lu = p.u0 + 1, lv = p.v0 + 1;
  for (let h = b + 1; h <= b + 8; h++) planet.set(f, lu, lv, h, ladder(1));
  planet.set(f, lu, lv, b + 9, BLOCK.AIR);
  if (audit.on) audit.ladders.push({ f, u: lu, v: lv, h0: b + 1, h1: b + 8 });
  // crenellations: a merlon every other cell, with a slab coping between
  ring(planet, f, p.u0, p.v0, p.w, p.d, b + 9, BLOCK.COBBLE);
  for (let u = p.u0; u < p.u0 + p.w; u++)
    for (let v = p.v0; v < p.v0 + p.d; v++) {
      const edge = u === p.u0 || v === p.v0
        || u === p.u0 + p.w - 1 || v === p.v0 + p.d - 1;
      if (!edge) continue;
      planet.set(f, u, v, b + 10,
        ((u + v) & 1) ? B.BRICK : slab(MAT.COBBLE, 0));
    }
  planet.set(f, p.u0 + p.w - 2, p.v0 + 1, b + 9, vern.light);
  houseChest(planet, f, p.u0 + p.w - 2, p.v0 + p.d - 2, b + 1);
  // THE BELL, and the frame that holds it up. It is the tower's whole point
  // from the ground: a watchtower with a bell is something a village rings,
  // not just something it climbs.
  //
  // It used to stand ON the parapet boards with a single post either side and
  // a beam laid straight across its head — which is a bell in a crate. A bell
  // hangs. So the bell swings from a stick under the beam, with a clear course
  // of air beneath it and sky either side of it.
  const bu = p.u0 + (p.w >> 1), bv = p.v0 + (p.d >> 1);
  // The legs stand out ON THE WALLS, one at each end of the parapet, and not
  // on the boards either side of the bell. Posts a cell from the bell put
  // timber, bronze and timber shoulder to shoulder, and three courses of that
  // reads from the street as a crate of wood with nothing hung in it. Out on
  // the walls there is a clear cell either side of the bell and you can see
  // sky through the frame, which is the whole difference.
  //
  // They are POSTS, the slim dark timber the street lamps and the stall
  // canopies stand on. A leg of log or plank is a column, and a column that
  // wide either side of the bell is the crate again by another name — the
  // frame wants to be the thing you see the bell THROUGH.
  //
  // And they run down THROUGH the parapet to the walk boards rather than
  // standing on top of it, taking the place of the wall head and the merlon
  // they would otherwise sit on. A post is a fifth of a cell wide, so a leg
  // where a parapet was is a gap with a stick in it: it is the notch below,
  // cut for nothing, on the two walls a notch cannot be cut in.
  for (const k of [-2, 2]) {
    for (let h = b + 9; h <= b + 12; h++) planet.set(f, bu + k, bv, h, B.POST);
  }
  // The headstock runs the full width, wall to wall, and it is SLABS: half a
  // course is all a beam ever was, and a full block across the top of two thin
  // posts is a lintel sat on matchsticks.
  //
  // And the bell hangs ONE course clear of the merlons, not three. It used to
  // ride high enough for the whole street to see it and two courses too high
  // for anybody to touch, and a bell nobody can reach is a decoration with a
  // rope painted on. Now it sits just over the head of somebody standing on
  // the parapet walk — within arm's length of the one place you have to be to
  // strike it.
  //
  // The long view is bought back by CUTTING THE PARAPET rather than by hanging
  // the bell higher — see the notch below.
  for (let du = -2; du <= 2; du++)
    planet.set(f, bu + du, bv, b + 13, slab(MAT.PLANK, 0));
  planet.set(f, bu, bv, b + 12, B.FENCE);        // the stick it hangs from
  planet.set(f, bu, bv, b + 11, B.BELL);         // ...and the bell, in the air
  noteBell(f, bu, bv, b + 11);
  // THE NOTCH. A bell one course over the merlons is a bell the merlons take:
  // the line from somebody in the street twenty cells off crosses this wall at
  // about b+10, and b+10 is exactly where the coping sits. So the coping comes
  // off the two cells the bell looks out over — one in each of the walls its
  // mouth swings toward — and the bronze breaks the skyline through the gap
  // without the bell moving an inch.
  //
  // A NOTCH, not a shorter wall. Taking the whole ring down a course buys the
  // same sightline and costs the tower its crenellations, and a uniformly
  // shortened parapet just reads as a parapet somebody built too low. A gap
  // cut in one place, exactly where the bell is, reads as a belfry somebody
  // built on purpose.
  //
  // Cut on BOTH axes, because a village does not agree with you about which
  // way its street runs. The plot's frontage can be any of the four sides, so
  // a notch cut in one pair of walls is a bell visible from half the approaches
  // and hidden from the other half — and which half is a roll of the dice. On
  // this pair the coping comes out; on the pair the headstock runs along, the
  // legs already did it, standing in the merlon's cell instead of on it. The
  // opening is a cross through the middle of the parapet with the bell at the
  // centre of it, which is the one place a cut in a wall explains itself.
  //
  // ...and a RAIL where the wall was. The cut goes down to the boards, which
  // leaves a hole at the foot of a parapet eleven courses up, in the exact
  // cell somebody stands in to ring the bell — a trap, and one this building
  // dug for itself. A fence is the answer and a slab is not: a slab is a wall
  // again and takes the sightline straight back, whereas a fence is a stick
  // and two rails with daylight round them, and it costs the view almost
  // nothing. It is also already the one thing in this world you cannot step
  // up onto or over — see "nobody stands on a fence" — so it stops the ringer
  // walking out of the gap it guards without stopping anybody seeing through
  // it. Which is what a parapet rail IS.
  for (const v of [p.v0, p.v0 + p.d - 1]) {
    planet.set(f, bu, v, b + 10, BLOCK.AIR);
    planet.set(f, bu, v, b + 9, B.FENCE);
  }
  return carveDoor(planet, p, side, b, vern);
}

// The church: a tall-windowed nave with pews down both sides of an aisle,
// and a steeple over the door end rising past the ridge to a cap and a
// cross — two fence posts and their rails, which is what a cross is when
// your fences are real. The one building you can find from anywhere.
function church(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(19, roofNeed(7, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  // STAINED GLASS, IN BANDS. Three courses tall and a different jewel in
  // each — yellow over red over green, and the next window not the same — so
  // a light reads as leaded work rather than as a coloured slot. One colour
  // held the whole height was a tinted window; three stacked is a window
  // somebody made.
  //
  // The bands are drawn from the BUILDING'S OWN CELL, not from `rand`: pulling
  // from the shared stream here would move every herd and bear rolled after
  // it, and a church has to come out the same on every machine that generates
  // this world. Adjacent courses never match, and neither do adjacent bays.
  //
  // A people with no glass (vern.glass null) keeps its open lights: a stained
  // window is still a window, and one you cannot make you do not have.
  const glazing = vern.glass === null ? null : stainedGlass(p);
  storey(planet, p, b + 1, b + 6, vern, {
    plinth: vern.plinth, light: 3, glass: glazing,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  const alongU = p.ax === 0;
  // The altar stands against the end wall FARTHEST FROM THE DOOR, measured
  // from the door cell itself. Inferring the far end from the street side
  // instead is what used to plant the altar — and its lamps — in the porch,
  // so you opened the church door into a lamp. The two lamps flank it ALONG
  // that wall; the old offsets were on the wrong axis for half the churches,
  // which put both of them, and the table, in a single cell.
  let au, av, lu, lv;
  if (alongU) {                     // ridge along u: end walls at u0 / u0+w-1
    au = (c.u - p.u0) < (p.u0 + p.w - 1 - c.u) ? p.u0 + p.w - 2 : p.u0 + 1;
    av = p.v0 + (p.d >> 1);
    lu = 0; lv = 1;
  } else {                          // ridge along v: end walls at v0 / v0+d-1
    au = p.u0 + (p.w >> 1);
    av = (c.v - p.v0) < (p.v0 + p.d - 1 - c.v) ? p.v0 + p.d - 2 : p.v0 + 1;
    lu = 1; lv = 0;
  }
  // pews: chairs down both sides of the aisle, all facing the altar end
  const pew = alongU
    ? (au > p.u0 + (p.w >> 1) ? 1 : 0)
    : (av > p.v0 + (p.d >> 1) ? 3 : 2);
  if (alongU) {
    for (let u = p.u0 + 2; u < p.u0 + p.w - 3; u += 2) {
      planet.set(p.f, u, p.v0 + 1, b + 1, chair(pew));
      planet.set(p.f, u, p.v0 + p.d - 2, b + 1, chair(pew));
    }
  } else {
    for (let v = p.v0 + 2; v < p.v0 + p.d - 3; v += 2) {
      planet.set(p.f, p.u0 + 1, v, b + 1, chair(pew));
      planet.set(p.f, p.u0 + p.w - 2, v, b + 1, chair(pew));
    }
  }
  planet.set(p.f, au, av, b + 1, B.TABLE);
  planet.set(p.f, au - lu, av - lv, b + 1, vern.roomLight ?? B.LAMP);
  planet.set(p.f, au + lu, av + lv, b + 1, vern.roomLight ?? B.LAMP);
  glow(p.f, au - lu, av - lv, b + 1);
  glow(p.f, au + lu, av + lv, b + 1);
  // ...and a reading desk beside the altar, because the man who stands here
  // reads to them — and it is the same desk the chief has, which opens the
  // same book. A priest with nothing to read from is a man standing at a table.
  planet.set(p.f, au - lu * 2, av - lv * 2, b + 1, B.LECTERN);
  // WHERE THE PRIEST STANDS: one step off the altar, on the nave side of it,
  // so he faces the door and you meet him coming up the aisle. Written down
  // rather than searched for, which is the rule this whole file is built on.
  const pu = au - (alongU ? (au > p.u0 + (p.w >> 1) ? 1 : -1) : 0);
  const pv = av - (alongU ? 0 : (av > p.v0 + (p.d >> 1) ? 1 : -1));
  const pdir = dirFromCell(p.f, pu + 0.5, pv + 0.5);
  planet.priestList ??= [];
  planet.priestList.push({
    f: p.f, u: pu, v: pv, h: b + 1, u0: p.u0, v0: p.v0, w: p.w, d: p.d,
    dir: [pdir[0], pdir[1], pdir[2]], faith: 'church',
  });
  const rf = roof(planet, p, b + 7, vern);
  // The steeple: square over the door end, rising through the roof and past
  // the ridge. It starts at the wall tops, not the floor — a ring dropped to
  // the ground would wall the porch off from the nave from the inside.
  const sx = c.u - c.du, sy = c.v - c.dv;   // one cell inside the door wall
  const topH = rf.top + 4;
  for (let h = b + 5; h <= topH; h++) {
    ring(planet, p.f, sx - 1, sy - 1, 3, 3, h, vern.quoinA);
  }
  // THE BELL, hanging in the belfry with the ring cut open around it so it can
  // be seen and heard. It is what calls the village to prayer — see the
  // worship schedule in main.js — and a steeple with nothing in it is a spire.
  for (const [du, dv] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    planet.set(p.f, sx + du, sy + dv, topH, BLOCK.AIR);
    planet.set(p.f, sx + du, sy + dv, topH - 1, BLOCK.AIR);
  }
  planet.set(p.f, sx, sy, topH, B.BELL);
  noteBell(p.f, sx, sy, topH);
  (planet.belfries ??= []).push({
    f: p.f, u: sx, v: sy, h: topH, faith: 'church',
    u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b,
  });
  pyramidCap(planet, p.f, sx - 1, sy - 1, topH + 1, vern.roof);
  planet.set(p.f, sx, sy, topH + 2, B.FENCE);
  planet.set(p.f, sx, sy, topH + 3, B.FENCE);
  planet.set(p.f, sx + 1, sy, topH + 3, B.FENCE);
  planet.set(p.f, sx - 1, sy, topH + 3, B.FENCE);
  return carveDoor(planet, p, side, b, vern, 1, 3);
}

// The smithy: cobble to the eaves, a doubled doorway, the hearth burning
// and TWO furnaces along the back wall — the one house whose chimney youd
// expect to smoke. The village finally has somewhere its iron comes from.
function smithy(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.COBBLE);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 5, vern, {
    // a forge is built of whatever the village calls stone: it has to stand
    // next to a fire all day, which is the one thing every culture agrees on
    wall: vern.masonry ?? BLOCK.COBBLE, plinth: vern.masonry ?? BLOCK.COBBLE,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  const hz = hearth(planet, p, b, vern, rand() < 0.5);
  // the furnaces, worked from the room's side, along the wall by the hearth
  const fu = p.u0 + 1, fv = p.v0 + 1;
  planet.set(p.f, fu, fv, b + 1, BLOCK.FURNACE);
  planet.set(p.f, fu + (p.ax ? 1 : 0), fv + (p.ax ? 0 : 1), b + 1,
    BLOCK.FURNACE);
  // workbench and stock
  planet.set(p.f, p.u0 + p.w - 2, p.v0 + p.d - 2, b + 1, B.TABLE);
  houseChest(planet, p.f, p.u0 + p.w - 2, p.v0 + 1, b + 1);
  const rf = roof(planet, p, b + 6, vern);
  chimney(planet, p.f, hz.u, hz.v, b + 1, rf.top + 1, vern);
  return carveDoor(planet, p, side, b, vern, 2, 2);
}

// THE STOCKROOM. What a shop sells had to be kept somewhere, and until now it
// was kept nowhere at all: the shelf was a list of rows the counter made up on
// the spot. So every shop is dug out underneath — one room the size of the
// room above it, walled and floored in stone, a ladder down through the boards
// behind the counter, and the goods in BOXES round the walls, sorted.
//
// Six bays, one per category — building, tools, weapons, armour, food,
// materials — two chests to a bay and a course of coloured wool over each so
// you can tell one from the next before you open it. Twelve chests of
// twenty-seven slots is far more than a village shop will ever fill, which is
// the point: it is a stockroom, not a cupboard, and it has room for what you
// sell them as well as for what they sell you.
//
// The chests are NOT house chests and are deliberately not in that list: a
// larder full of somebody's bread is exactly what this is not. main.js fills
// them from the shop's own shelf — see stockShopStores — so what is in the
// boxes is what is for sale, and taking it out of a box takes it off the
// shelf.
const CELLAR = {
  drop: 5,          // courses from the shop's floor down to the cellar's
  // A BADGE over each bay, not a colour. Wool said which bay was which by a
  // legend you had to learn and then remember in a cellar; a badge says it
  // with a picture — a brick, a pick, a blade, a helm, a loaf, an ingot. They
  // are hung in painting frames because the block enum has one id left in it
  // and a painting's canvas can wear any tile in the atlas: see ART in
  // cubemesher.js.
  bays: ['building', 'tools', 'weapons', 'armour', 'food', 'materials'],
  perBay: 2,
};

// WHAT A FRAME IS HUNG WITH. The picture is not the block — there is one block
// id left in the enum and fourteen pictures — so the generator writes down
// which cell got which, exactly the way it writes down where it put a lamp or
// a bed. It is derived like everything else in here: the same seed builds the
// same village and hangs the same badges.
function hangArt(planet, f, u, v, h, art) {
  (planet.artMap ??= new Map()).set(`${f},${u},${v},${h}`, art);
}

// The cells of a rectangle's edge, walked as one ring, so the bays come out
// in order round the room instead of scattered.
function ringCells(u0, v0, w, d) {
  const out = [];
  for (let u = u0; u < u0 + w; u++) out.push({ u, v: v0 });
  for (let v = v0 + 1; v < v0 + d; v++) out.push({ u: u0 + w - 1, v });
  for (let u = u0 + w - 2; u >= u0; u--) out.push({ u, v: v0 + d - 1 });
  for (let v = v0 + d - 2; v > v0; v--) out.push({ u: u0, v });
  return out;
}

// Dig the room under a building whose floor is at `b`. Returns the store —
// { chests: [{u,v,h,cat}], ladder: {u,v} } — or null when there is not enough
// planet underneath to put one in.
//
// EXPORTED for the city: a shopfront on the concrete world is the same
// counter, the same ledger and the same syncStore, so it gets the same
// stockroom rather than a second version of this going stale beside it.
export function cellar(planet, p, b, vern, keep, avoid = []) {
  const f = p.f;
  const floor = b - CELLAR.drop;             // the solid course you stand on
  if (floor < 6) return null;                // too near the core to dig
  const top = b - 1;                         // the boards under the shop floor
  const iu0 = p.u0 + 1, iv0 = p.v0 + 1;
  const iw = p.w - 2, id = p.d - 2;
  if (iw < 3 || id < 3) return null;

  const masonry = vern.masonry ?? BLOCK.COBBLE;
  // Solid first, hollow second. A cellar cut straight out of the height field
  // opens into raw dirt on a slope and into thin air on a bank — filling the
  // whole box and then taking the middle out is the only version that is a
  // room wherever the shop happens to stand.
  for (let h = floor; h <= top; h++) {
    for (let u = p.u0; u < p.u0 + p.w; u++) {
      for (let v = p.v0; v < p.v0 + p.d; v++) planet.set(f, u, v, h, masonry);
    }
  }
  for (let h = floor + 1; h < top; h++) {
    for (let u = iu0; u < iu0 + iw; u++) {
      for (let v = iv0; v < iv0 + id; v++) planet.set(f, u, v, h, BLOCK.AIR);
    }
  }
  // boards overhead rather than more stone: from below it reads as the
  // underside of the shop's floor, which is what it is
  for (let u = iu0; u < iu0 + iw; u++) {
    for (let v = iv0; v < iv0 + id; v++) planet.set(f, u, v, top, BLOCK.PLANK);
  }

  // THE LADDER, on the shopkeeper's side of the counter, so you walk past him
  // to reach the stock. It comes up THROUGH the shop's floorboards, so the
  // cell it takes at `b` has to be one nothing upstairs is standing on — a
  // counter table or the keeper's own boxes over a ladder shaft is a hole you
  // cannot get into. So: every cell against a wall, minus what is spoken for,
  // nearest his stand wins.
  const blocked = new Set(avoid.map((c) => `${c.u},${c.v}`));
  let lu = iu0, lv = iv0, bestD = Infinity;
  for (const c of ringCells(iu0, iv0, iw, id)) {
    if (blocked.has(`${c.u},${c.v}`)) continue;
    const du = c.u - keep.u, dv = c.v - keep.v, dd = du * du + dv * dv;
    if (dd >= bestD) continue;
    bestD = dd; lu = c.u; lv = c.v;
  }
  if (bestD === Infinity) return null;       // a room with nothing spare in it
  // facing names the side the ladder's back is against: the nearer wall
  const face = lu === iu0 ? 1 : lu === iu0 + iw - 1 ? 0 : lv === iv0 ? 3 : 2;
  for (let h = floor + 1; h <= b; h++) planet.set(f, lu, lv, h, ladder(face));

  // THE BAYS. Round the wall, two chests to a category, a wool course over
  // each pair, and the ladder's own cell left clear.
  const chests = [];
  const shelf = floor + 1;
  const ring = ringCells(iu0, iv0, iw, id).filter((c) => !(c.u === lu && c.v === lv));
  // Which wall a bay cell has behind it, in the facing order paintings and
  // stairs share: +u, -u, +v, -v. A badge hung the wrong way round faces the
  // masonry and shows the room its back.
  const wallFacing = (c) => (c.u === iu0 + iw - 1 ? 0 : c.u === iu0 ? 1
    : c.v === iv0 + id - 1 ? 2 : 3);
  let i = 0;
  for (const cat of CELLAR.bays) {
    for (let k = 0; k < CELLAR.perBay && i < ring.length; k++, i++) {
      const c = ring[i];
      planet.set(f, c.u, c.v, shelf, B.CHEST);
      if (CS.paintingId && ART_BADGE[cat] !== undefined) {
        planet.set(f, c.u, c.v, shelf + 1, CS.paintingId(wallFacing(c)));
        hangArt(planet, f, c.u, c.v, shelf + 1, ART_BADGE[cat]);
      }
      chests.push({ u: c.u, v: c.v, h: shelf, cat });
    }
  }

  // ...and light, or it is a room nobody can read the colours in
  for (const c of [{ u: iu0 + (iw >> 1), v: iv0 + (id >> 1) }]) {
    planet.set(f, c.u, c.v, top - 1, vern.light ?? BLOCK.LAMP);
    glow(f, c.u, c.v, top - 1);
  }
  return { chests, ladder: { u: lu, v: lv }, floor, base: b };
}

// The shop: a counter of tables across the room, shelves behind it, two
// chests of stock and an awning over a wide door — the market stall grown
// a roof and a ledger.
//
// `opts.afloat` is the one thing a caller may change, and it changes exactly
// one line: the plot is a DECK over water, so there is no ground to cut and
// fill and whoever asked for it has already laid the boards and the pier. The
// lake people needed a counter and there is no version of this where they get
// a second shop function — the counter, the keeper, the stockroom, the till
// and the press are all written down here, and a copy of them somewhere else
// is four of them going stale the next time one changes.
function shop(planet, p, side, vern, rand, opts = {}) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  if (!opts.afloat) levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 5, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  // The counter: tables across the middle, facing the door. Where it is
  // written down matters — main.js turns these exact cells into the thing you
  // use to trade, and the shopkeeper is put down on the far side of them, so
  // this list IS the shop as far as everything outside village.js is
  // concerned.
  const counter = [];
  if (p.ax === 0) {
    const cv2 = p.v0 + (p.d >> 1);
    for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++) {
      planet.set(p.f, u, cv2, b + 1, B.TABLE);
      counter.push({ u, v: cv2 });
    }
  } else {
    const cu2 = p.u0 + (p.w >> 1);
    for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++) {
      planet.set(p.f, cu2, v, b + 1, B.TABLE);
      counter.push({ u: cu2, v });
    }
  }
  // Which side of the counter the shopkeeper stands on: the side the door is
  // NOT on. `side` is 0..3 in the wall order carveDoor takes, and the counter
  // splits the room in two, so "away from the door" is the whole rule.
  const backU = side === 0 ? p.u0 + 1 : side === 1 ? p.u0 + p.w - 2
    : p.u0 + (p.w >> 1);
  const backV = side === 2 ? p.v0 + 1 : side === 3 ? p.v0 + p.d - 2
    : p.v0 + (p.d >> 1);
  const keep = counter.length
    ? { u: p.ax === 0 ? counter[counter.length >> 1].u : backU,
      v: p.ax === 0 ? backV : counter[counter.length >> 1].v }
    : { u: backU, v: backV };
  // step off the counter itself, onto the shopkeeper's side of it
  if (p.ax === 0) keep.v = backV === counter[0]?.v ? backV + 1 : backV;
  else keep.u = backU === counter[0]?.u ? backU + 1 : backU;
  const sdir = dirFromCell(p.f, keep.u + 0.5, keep.v + 0.5);
  const entry = {
    f: p.f, u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b,
    counter, h: b + 1,
    keeper: { u: keep.u, v: keep.v, h: b + 1,
      dir: [sdir[0], sdir[1], sdir[2]],
      // ...and the cell he faces, which is the middle of his own counter. See
      // the note on the kiosk's keeper in city.js: `dir` says where a man
      // stands and has never said which way he is turned.
      at: counter.length
        ? [...dirFromCell(p.f, counter[counter.length >> 1].u + 0.5,
          counter[counter.length >> 1].v + 0.5)]
        : null },
    culture: vern.culture ?? 'terran',
  };
  (planet.shopList ??= []).push(entry);
  // ...and the stockroom under it, which is where the goods actually are.
  // After the floor is laid, never before: the ladder comes up THROUGH the
  // boards and fillRect would put a plank back over the hole.
  entry.store = cellar(planet, p, b, vern, keep, [
    ...counter, keep,
    { u: p.u0 + 1, v: p.v0 + 1 },                    // his own two boxes
    { u: p.u0 + p.w - 2, v: p.v0 + p.d - 2 },
  ]);
  // the shopkeeper's own boxes, which are his and not the shop's
  houseChest(planet, p.f, p.u0 + 1, p.v0 + 1, b + 1);
  houseChest(planet, p.f, p.u0 + p.w - 2, p.v0 + p.d - 2, b + 1);

  // THE MINT, behind the counter.
  //
  // Every settlement on the planet has to have one — coin is the meter the
  // whole game is scored on, and a village with no press can only ever spend
  // what somebody else struck. So it goes in the SHOP, and that is the whole
  // argument: the shop is the one building every village is guaranteed (it is
  // sorted to the head of every culture's list, with a free-standing plot as a
  // second chance if the frontage will not take one), so a mint laid here
  // inherits that guarantee for nothing. The smithy is where a village's metal
  // is worked and would have been the prettier answer, but it is fourth on a
  // list that regularly runs out of street, and "most villages have a mint" is
  // not what was asked for.
  //
  // It is also simply true: the till is on the counter and the press is behind
  // it, which is where a mint has always been.
  const spoken = new Set([...counter, keep,
    { u: p.u0 + 1, v: p.v0 + 1 }, { u: p.u0 + p.w - 2, v: p.v0 + p.d - 2 },
    ...(entry.store ? [entry.store.ladder] : []),
    // ...and the two cells just inside the doorway, or the first thing anybody
    // walking in does is walk into a coining press
    ...[0, 1].map((k) => ({
      u: c.u - c.du + (c.du === 0 ? k : 0),
      v: c.v - c.dv + (c.du === 0 ? 0 : k),
    })),
  ].map((q) => `${q.u},${q.v}`));
  const room = [];
  for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++) {
    for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++) {
      if (!spoken.has(`${u},${v}`)) room.push({ u, v });
    }
  }
  const nearKeeper = (q) => (q.u - keep.u) ** 2 + (q.v - keep.v) ** 2;
  const onWall = (q) => q.u === p.u0 + 1 || q.u === p.u0 + p.w - 2
    || q.v === p.v0 + 1 || q.v === p.v0 + p.d - 2;
  room.sort((a, z) => nearKeeper(a) - nearKeeper(z));
  // Against a wall if there is one going spare and anywhere on the floor if
  // there is not. A room is mostly floor, but a village with no press is a
  // bug and a shop with a press in the middle of it is a tidiness complaint.
  const press = room.find(onWall) ?? room[0];
  if (press) {
    planet.set(p.f, press.u, press.v, b + 1, B.MINT);
    entry.mint = { u: press.u, v: press.v, h: b + 1 };
  }
  planet.set(p.f, p.u0 + 1, p.v0 + p.d - 2, b + 3, slab(MAT.PLANK, 1));
  planet.set(p.f, p.u0 + p.w - 2, p.v0 + 1, b + 3, slab(MAT.PLANK, 1));
  planet.set(p.f, p.u0 + (p.w >> 1), p.v0 + (p.d >> 1), b + 4, vern.light);
  glow(p.f, p.u0 + (p.w >> 1), p.v0 + (p.d >> 1), b + 4);
  const rf = roof(planet, p, b + 6, vern);
  // the awning: a slab eyebrow over the doorway on two fence posts
  for (let k = -1; k <= 1; k++) {
    planet.set(p.f, c.u + (c.du === 0 ? k : c.du), c.v + (c.dv === 0 ? k : c.dv),
      b + 4, slab(vern.roof, 0));
  }
  const door = carveDoor(planet, p, side, b, vern, 2, 2);
  // ...and two on the shop door as well. The counter is where a village's
  // money is and the room under it is where its goods are, so it is the second
  // building in the settlement worth standing outside.
  entry.posts = doorPosts(planet, door, 2);
  return door;
}

// The BARRACKS. A square tower of three billet floors with three beds on each
// — nine soldiers under one roof — and a fighting top over them.
//
// It is the one building in the village that exists for a JOB rather than for
// a household, and that is what the plan says: no hearth, no table, no larder,
// just three beds to a floor round a ladder, a rack of arms on the ground
// floor, and a parapet you can actually stand a watch on. The garrison sleeps
// here instead of standing in the road all night.
//
// Nine beds is not decoration either. A village grows to the number of beds it
// has (see main.js's pairing), so a barracks is a real decision about the
// settlement: it houses soldiers and it houses them INSTEAD of families.
// THE CHIEF'S HALL. The one building in a village that is not a household and
// not a workplace: it is where the person who decides what everybody else does
// sits while he decides it.
//
// Everything in it is there to be looked at from the door. A red runner from
// the threshold to the foot of the dais, a throne on two steps at the far end,
// pictures on both long walls, a lamp over each of them, and enough clear
// floor between the door and the dais that you have to walk the length of the
// room to reach him. That walk IS the building.
// The footprint took a correction: at nine by thirteen only eight villages in
// nineteen could find ground that would take one, and a chief's hall is not an
// optional building. Seven by eleven still walks long and fits nearly
// everywhere.
const HALL = {
  w: 7,            // across the front
  d: 11,           // door to dais — the length is the whole effect
  // Eight, not six. Six put the wall plate two courses over the throne, which
  // is a chief with a shelf beside him and bare masonry over his head — the
  // books ran out exactly where they were supposed to close over him. Eight
  // is a hall you look UP in, and it is what makes the wall behind the dais
  // read as a library rather than a bookcase.
  wall: 8,         // courses to the eaves
  dais: 2,         // how many steps up the throne stands
};

function chiefHall(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  const top = b + HALL.wall;
  levelPlot(planet, p, 1, HALL.wall + 6);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, vern.masonry ?? BLOCK.COBBLE);
  shell(planet, p, b + 1, top, () => vern.wall);
  quoins(planet, p, b + 1, top, vern);

  const uLo = p.u0 + 1, uHi = p.u0 + p.w - 2;
  const vLo = p.v0 + 1, vHi = p.v0 + p.d - 2;
  const mid = (uLo + uHi) >> 1;

  // Boards over the whole floor: a hall with a mud floor is a barn.
  for (let u = uLo; u <= uHi; u++) {
    for (let v = vLo; v <= vHi; v++) planet.set(f, u, v, b, BLOCK.PLANK);
  }

  // THE DAIS at the far end — two courses of dressed stone, wall to wall, so
  // the throne is looked UP at from anywhere on the floor.
  const dv0 = vHi - 2;
  for (let step = 0; step < HALL.dais; step++) {
    for (let u = uLo; u <= uHi; u++) {
      for (let v = dv0 + step; v <= vHi; v++) {
        planet.set(f, u, v, b + step, vern.masonry ?? BLOCK.COBBLE);
      }
    }
  }
  const seatH = b + HALL.dais;

  // THE THRONE, and a lamp standing at each shoulder of it.
  // Back to the FAR wall, so he faces the length of the room and the door at
  // the end of it. Facing names the side the back stands on (see CHAIR_BACK
  // in cubemesher.js): 2 is +v, which is the far wall — 3 put the back on the
  // near side and sat him staring at the masonry behind him.
  planet.set(f, mid, vHi, seatH, chair(2));
  for (const du of [-2, 2]) {
    planet.set(f, mid + du, vHi, seatH, BLOCK.LAMP);
    glow(f, mid + du, vHi, seatH);
  }

  // THE RED RUNNER, from just inside the door to the foot of the dais and up
  // over the steps — three wide, because a carpet you can miss is a mat.
  const carpet = CS.carpetId ? CS.carpetId(1) : null;   // 1 is red
  if (carpet !== null) {
    for (let v = vLo; v < dv0; v++) {
      for (let du = -1; du <= 1; du++) planet.set(f, mid + du, v, b + 1, carpet);
    }
    for (let step = 0; step < HALL.dais; step++) {
      for (let du = -1; du <= 1; du++) {
        planet.set(f, mid + du, dv0 + step, b + step + 1, carpet);
      }
    }
    // ...and the top of the dais, either side of the throne. At seatH, which
    // is the level the chair stands on — a course higher and the rug floats
    // over the dais with the chief apparently sunk into it.
    //
    // Not the throne's own cell: that is where the chief is, and a rug laid
    // through him reads as a rug laid through him.
    for (const du of [-1, 1]) planet.set(f, mid + du, vHi, seatH, carpet);
  }

  // PICTURES down both long walls, with a lamp between each pair. Facing 0 is
  // the +u wall and 1 the -u wall, which is what puts them face to face.
  // Each picture is TWO cells wide and two courses tall — one cell of canvas
  // reads as a coloured splinter from the middle of the room, which is the
  // only place anybody ever looks at it from.
  if (CS.paintingId) {
    for (let k = 0; k < 3; k++) {
      const v = vLo + 1 + k * 3;
      if (v >= dv0) break;
      planet.set(f, uHi, v, b + 3, CS.paintingId(0));
      planet.set(f, uLo, v, b + 3, CS.paintingId(1));
      // a lamp between each pair, so the pictures are lit rather than guessed
      if (v + 2 < dv0) {
        planet.set(f, uHi, v + 2, b + 4, BLOCK.LAMP); glow(f, uHi, v + 2, b + 4);
        planet.set(f, uLo, v + 2, b + 4, BLOCK.LAMP); glow(f, uLo, v + 2, b + 4);
      }
    }
    // Nothing behind the throne: that wall is books now, straight over his
    // head — see below.
  }

  // THE LIBRARY. Shelves the full height of the wall behind the dais, either
  // side of the throne — the one wall in the village that is books from the
  // floor to the wall plate. A chief who reads is a chief who has a reason to
  // know things, and it is the second thing you see after the crown.
  for (let du = 2; du <= (p.w >> 1); du++) {
    for (const su of [-1, 1]) {
      const u = mid + su * du;
      if (u <= p.u0 || u >= p.u0 + p.w - 1) continue;
      for (let h = seatH; h < top - 1; h++) {
        planet.set(f, u, vHi, h, BLOCK.BOOKSHELF);
      }
    }
  }
  // ...and over his head, and a course higher again. He sits UNDER the books:
  // the shelves come round and close over the throne rather than stopping
  // either side of it.
  //
  // From seatH + 2, which is the first course clear of his crown: he sits in
  // cell seatH + 1 and the crown tops out just inside it. seatH + 1 itself has
  // to stay air at `mid` — floorNear wants one clear cell over the seat and
  // answers null without it, which is a chief left floating where he was put.
  // So: the cell he is in, then books, then books again to the wall plate.
  for (let du = -1; du <= 1; du++) {
    const u = mid + du;
    if (u <= p.u0 || u >= p.u0 + p.w - 1) continue;
    for (let h = seatH + 2; h < top - 1; h++) {
      planet.set(f, u, vHi, h, BLOCK.BOOKSHELF);
    }
  }
  // ...and the shoulders of the alcove, beside him at his own height, so the
  // books come round him on three sides and he sits in a niche of them.
  for (const du of [-1, 1]) {
    const u = mid + du;
    if (u <= p.u0 || u >= p.u0 + p.w - 1) continue;
    planet.set(f, u, vHi, seatH + 1, BLOCK.BOOKSHELF);
  }
  // ...and more of it down the near end of the long walls, so the room is a
  // library you hold court in rather than a hall with a shelf in it.
  for (let v = vLo; v <= vLo + 2 && v < dv0; v++) {
    for (let h = b + 1; h < b + 4; h++) {
      planet.set(f, uLo, v, h, BLOCK.BOOKSHELF);
      planet.set(f, uHi, v, h, BLOCK.BOOKSHELF);
    }
  }

  // THE READING DESK, at the foot of the dais and facing the room: what he
  // stands at to read to them, which is what a hall is for.
  planet.set(f, mid, dv0 - 2, b + 1, BLOCK.LECTERN);

  // A long table down one side, for the business of a hall.
  for (let v = vLo + 4; v <= vLo + 6 && v < dv0 - 2; v++) {
    planet.set(f, uLo + 1, v, b + 1, BLOCK.TABLE);
  }

  roof(planet, p, top, vern);
  // THE WAY IN. The hall is closed on all four sides and roofed — it is the
  // one building in the village that has to keep the weather off a man who
  // never moves — but the way in is an OPEN ARCH and not a door: two cells
  // wide, three tall, jambs and a lintel round it and no leaf hung in it.
  //
  // A chief holds court. A court you have to work a latch to get into is not
  // one, and a hall you can be shut out of is a hall you will never walk into
  // by accident. So: enclosed, and open.
  //
  // THREE WIDE, and that is not a taste: carveDoor centres an ODD opening on
  // the wall's middle cell and pushes an even one half a cell off it, so a
  // two-wide arch in a seven-wide front had three courses of masonry down one
  // side of it and two down the other. Nobody could say why it looked wrong
  // and everybody could see that it did.
  const arch = carveDoor(planet, p, side, b, { ...vern, door: false }, 3, 3);
  // ...and two men on it, every hour of every day. A hall with an open arch
  // and nobody standing in it is a hall anybody can walk into, which is fine
  // for a court and wrong for a chief: the arch says come in, the guards say
  // he knows you did.
  arch.posts = doorPosts(planet, arch, 3);
  return arch;
}

const BARRACK_FLOORS = 3;
const BARRACK_STEP = 4;          // courses per floor: 3 clear plus the boards

function barracks(planet, p, side, vern, rand) {
  const b = p.base;
  const f = p.f;
  const top = b + BARRACK_FLOORS * BARRACK_STEP;
  levelPlot(planet, p, 1, BARRACK_FLOORS * BARRACK_STEP + 4);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, vern.masonry ?? BLOCK.COBBLE);
  shell(planet, p, b + 1, top, () => vern.wall);
  quoins(planet, p, b + 1, top, vern);

  // The ladder runs the whole height in one corner, and every floor is cut
  // open around it — a billet you cannot climb to is a store room.
  const lu = p.u0 + 1, lv = p.v0 + 1;

  for (let fl = 0; fl < BARRACK_FLOORS; fl++) {
    const floor = b + fl * BARRACK_STEP;          // the boards under this level
    if (fl > 0) {
      for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
        for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++)
          planet.set(f, u, v, floor, BLOCK.PLANK);
      planet.set(f, lu, lv, floor, BLOCK.AIR);    // the hatch
    }
    // Three beds a floor, heads to the far wall, spaced so a man can get out
    // of one without climbing over the next.
    const tint = vern.bed[fl % 2];
    for (let i = 0; i < 3; i++) {
      const u = p.u0 + 2 + i * 2;
      const v = p.v0 + p.d - 2;
      if (u >= p.u0 + p.w - 1) break;
      layBed(planet, f, u, v, floor + 1, tint, 2);
      // a footlocker at the end of each, which is what makes a row of beds
      // read as a billet rather than as a dormitory in a doll's house
      if (i < 2) planet.set(f, u + 1, v, floor + 1, slab(MAT.PLANK, 0));
    }
    // one window per floor on the two long sides, and a light by the ladder
    for (const v of [p.v0, p.v0 + p.d - 1]) {
      planet.set(f, p.u0 + (p.w >> 1), v, floor + 2, vern.glass ?? B.PANE);
    }
    planet.set(f, p.u0 + p.w - 2, p.v0 + 1, floor + 2, vern.roomLight ?? B.LAMP);
    glow(f, p.u0 + p.w - 2, p.v0 + 1, floor + 2);
  }

  for (let h = b + 1; h < top; h++) planet.set(f, lu, lv, h, ladder(1));

  // The fighting top: boards, a crenellated parapet, and a brazier so the
  // watch can see what it is watching.
  for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
    for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++)
      planet.set(f, u, v, top, BLOCK.PLANK);
  planet.set(f, lu, lv, top, BLOCK.AIR);
  ring(planet, f, p.u0, p.v0, p.w, p.d, top, vern.wall);
  ring(planet, f, p.u0, p.v0, p.w, p.d, top + 1, vern.masonry ?? BLOCK.COBBLE);
  for (let u = p.u0; u < p.u0 + p.w; u++)
    for (let v = p.v0; v < p.v0 + p.d; v++) {
      const edge = u === p.u0 || v === p.v0
        || u === p.u0 + p.w - 1 || v === p.v0 + p.d - 1;
      if (edge && ((u + v) & 1)) {
        planet.set(f, u, v, top + 2, vern.masonry ?? BLOCK.COBBLE);
      }
    }
  planet.set(f, p.u0 + p.w - 2, p.v0 + p.d - 2, top + 1, B.CAMPFIRE);
  glow(f, p.u0 + p.w - 2, p.v0 + p.d - 2, top + 1);

  // the arms on the ground floor: a chest of kit and a rack of spears
  houseChest(planet, f, p.u0 + p.w - 2, p.v0 + p.d - 2, b + 1);
  for (const u of [p.u0 + 2, p.u0 + 3]) {
    if (u < p.u0 + p.w - 1) planet.set(f, u, p.v0 + 1, b + 1, B.FENCE);
  }
  return carveDoor(planet, p, side, b, vern, 1, 2);
}

// The mosque, which some villages raise where others raise a church. A
// square prayer hall under a stepped dome, a mihrab niche in the wall the
// door does NOT stand in, and a minaret at one corner carrying the height
// the church gets from its steeple. The floor is left open on purpose —
// the church has its pews, and a hall you pray in standing is the
// difference between the two buildings rather than a missing feature.
function mosque(planet, p, side, vern, rand) {
  const b = p.base;
  const f = p.f;
  levelPlot(planet, p, 1, 22);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  // The same banded lights the church gets: a house of worship is the one
  // building on the street that does not take its light plain, whichever of
  // the two this village built.
  storey(planet, p, b + 1, b + 6, vern, {
    plinth: vern.plinth, light: 3,
    glass: vern.glass === null ? null : stainedGlass(p),
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  // the dome: rings stepping in as they rise. Hollow, so the hall keeps its
  // height inside instead of gaining a solid ceiling of masonry over it.
  const half = Math.min(p.w, p.d) >> 1;
  for (let i = 0; i < half; i++) {
    const w = p.w - i * 2, d = p.d - i * 2;
    if (w < 3 || d < 3) break;
    ring(planet, f, p.u0 + i, p.v0 + i, w, d, b + 7 + i, vern.quoinA);
  }
  const mu = p.u0 + (p.w >> 1), mv = p.v0 + (p.d >> 1);
  planet.set(f, mu, mv, b + 6 + half, vern.quoinA);      // the dome's crown
  planet.set(f, mu, mv, b + 7 + half, slab(MAT.COBBLE, 0));
  // the mihrab: a niche in the wall opposite the door, lit, so the hall has
  // a direction to face
  const nu = mu - c.du * ((p.w >> 1) - 1), nv = mv - c.dv * ((p.d >> 1) - 1);
  for (let h = b + 1; h <= b + 3; h++) planet.set(f, nu, nv, h, BLOCK.AIR);
  planet.set(f, nu, nv, b + 4, vern.quoinA);
  planet.set(f, nu - c.du, nv - c.dv, b + 4, vern.light);
  glow(f, nu - c.du, nv - c.dv, b + 4);
  // ...and the man who stands in front of it. Two cells off the niche, facing
  // the door, which is where the person leading a hall of people stands.
  //
  // IN FRONT OF IT MEANS BACK TOWARD THE DOOR. `c.du`/`c.dv` is the doorway's
  // OUTWARD normal, so `- c.du` is the way the niche was walked to and `+ c.du`
  // is the way back into the room. Stepping off the niche the same way it was
  // reached carried the imam two cells PAST the far wall and his lectern three,
  // and he stood on the grass outside his own mosque — which is where the
  // player photographed him. The church has always had this the right way
  // round: its priest is one step off the altar toward the room and its lectern
  // two, so the desk stands between him and the congregation.
  const iu = nu + c.du * 2, iv = nv + c.dv * 2;
  const idir = dirFromCell(f, iu + 0.5, iv + 0.5);
  planet.set(f, iu + c.du, iv + c.dv, b + 1, B.LECTERN);
  // THE CARPET. A mosque is prayed in on the floor, so the floor is what it
  // dresses: red carpet across the whole hall, wall to wall, with the step
  // inside the door left bare for the shoes. Carpet is PASSABLE, so the
  // prayer spots (main.js) and everybody walking to them stand on it.
  const rug = CS.carpetId ? CS.carpetId(1) : null;
  if (rug !== null) {
    const su = c.u - c.du, sv = c.v - c.dv;     // the step inside the door
    for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++) {
      for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++) {
        if (u === su && v === sv) continue;
        if (planet.get(f, u, v, b + 1) !== BLOCK.AIR) continue;
        if (planet.get(f, u, v, b) === BLOCK.AIR) continue;   // over floor only
        planet.set(f, u, v, b + 1, rug);
      }
    }
  }
  planet.priestList ??= [];
  planet.priestList.push({
    f, u: iu, v: iv, h: b + 1, u0: p.u0, v0: p.v0, w: p.w, d: p.d,
    dir: [idir[0], idir[1], idir[2]], faith: 'mosque',
  });
  // the minaret, in the corner furthest from the door: a slender shaft, a
  // balcony ring where the call goes out from, and a cap
  const cu2 = c.du > 0 || c.dv > 0 ? p.u0 : p.u0 + p.w - 2;
  const cv2 = c.du > 0 || c.dv > 0 ? p.v0 : p.v0 + p.d - 2;
  const top = b + 16;
  for (let h = b + 1; h <= top; h++) {
    ring(planet, f, cu2, cv2, 2, 2, h, vern.quoinA);
  }
  ring(planet, f, cu2 - 1, cv2 - 1, 4, 4, top - 3, slab(MAT.COBBLE, 1));
  for (let h = top + 1; h <= top + 2; h++) {
    planet.set(f, cu2, cv2, h, vern.quoinA);
  }
  planet.set(f, cu2, cv2, top + 3, vern.light);
  glow(f, cu2, cv2, top + 3);
  // WHERE THE CALL GOES OUT FROM. A mosque has no bell — the call is a voice,
  // and it goes from the balcony — so what is written down here is the SPOT
  // rather than a fixture. main.js sounds it from this cell at prayer time.
  (planet.belfries ??= []).push({
    f, u: cu2, v: cv2, h: top - 2, faith: 'mosque',
    u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b,
  });
  houseChest(planet, f, p.u0 + p.w - 2, p.v0 + p.d - 2, b + 1);
  return carveDoor(planet, p, side, b, vern, 2, 3);
}

// The library: shelves two courses high down the long walls, reading desks
// with chairs along the middle, and a lantern over them. The shelves stop
// clear of the doorway — the one thing a room full of furniture must never
// do is brick up its own entrance, which is how the hearths ended up in the
// porches.
function library(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 5, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  const iu0 = p.u0 + 1, iu1 = p.u0 + p.w - 2;
  const iv0 = p.v0 + 1, iv1 = p.v0 + p.d - 2;
  const step = c.u - c.du, stev = c.v - c.dv;   // the cell you walk in to
  const clear = (u, v) => Math.abs(u - step) + Math.abs(v - stev) > 1;
  // shelves against the two long walls, so the gable ends keep their windows
  const along = p.ax === 0;
  const shelf = (u, v) => {
    if (!clear(u, v)) return;
    planet.set(p.f, u, v, b + 1, B.BOOKSHELF);
    planet.set(p.f, u, v, b + 2, B.BOOKSHELF);
  };
  if (along) {
    for (let u = iu0; u <= iu1; u++) { shelf(u, iv0); shelf(u, iv1); }
  } else {
    for (let v = iv0; v <= iv1; v++) { shelf(iu0, v); shelf(iu1, v); }
  }
  // Reading desks down the middle, a chair drawn up to each — and drawn up to
  // it FACING it. A chair's facing names the side its back stands on, so a
  // seat one step to the -v side of a desk wants its back on -v, which is 3,
  // and one to the -u side wants 1. It had 2 and 0: the reader sat with their
  // back to the desk in every library on every world, which is the one seat
  // in this game that was the wrong way round.
  const cu2 = p.u0 + (p.w >> 1), cv2 = p.v0 + (p.d >> 1);
  if (along) {
    for (let u = iu0 + 1; u <= iu1 - 1; u += 2) {
      if (!clear(u, cv2)) continue;
      planet.set(p.f, u, cv2, b + 1, B.TABLE);
      if (clear(u, cv2 - 1)) planet.set(p.f, u, cv2 - 1, b + 1, chair(3));
    }
  } else {
    for (let v = iv0 + 1; v <= iv1 - 1; v += 2) {
      if (!clear(cu2, v)) continue;
      planet.set(p.f, cu2, v, b + 1, B.TABLE);
      if (clear(cu2 - 1, v)) planet.set(p.f, cu2 - 1, v, b + 1, chair(1));
    }
  }
  planet.set(p.f, cu2, cv2, b + 4, vern.light);
  glow(p.f, cu2, cv2, b + 4);
  houseChest(planet, p.f, iu1, iv1, b + 1);
  roof(planet, p, b + 6, vern);
  return carveDoor(planet, p, side, b, vern, 1, 2);
}

// --- the café house -------------------------------------------------------------
//
// Where a village goes for the hour before bed. TWELVE tables, a chair either
// side of each and a water pipe on every one, laid out four across and three
// deep with an aisle between every column and between every row — a room you
// can walk through with a pipe in every hand is a café, and a room where the
// chairs touch is a waiting room. Nobody sleeps here: it lays no bed, so it is
// not a home and work.js will not fill it with beds.
//
// Every seat is written down with the pipe it has to hand, the way the beds
// are written down, because main.js seats the village off this list at dusk
// (see the café hour) and nothing searches the blocks for chairs.
//
// The room in its own frame: `a` runs along the long axis and `k` across it,
// so the same plan serves a plot laid either way round. Tables stand at
// a = 1, 5, 9 and k = 1, 3, 5, 7; their chairs at a ± 1; which leaves a = 3
// and 7 and every even k as floor.
// ...and it is THIRTEEN BY THIRTEEN and not thirteen by eleven, because a bar
// costs two of the room's columns — the counter and the keeper's own side
// behind it — and the twelve tables were already using every one it had. The
// frontage is untouched: `len` is what a plot spends on the street and it is
// the depth that grew.
const CAFE_LEN = 13, CAFE_DEP = 13;
function cafeHouse(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 5, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  const room = roomFrame(planet, p, c, b);
  const { la, ca, cell, put, seat, seats } = room;
  // THE BAR FIRST, and the tables in what it leaves. Which two columns it
  // takes depends on which wall the door came in through, so the table grid
  // cannot be a fixed range any more: it starts two clear columns off the
  // counter and runs to the far wall, which is four columns of three tables
  // either way round — the same twelve, and an aisle still between every one.
  const bar = barCounter(planet, p, room, b, vern, B.TEA_GLASS, B.URN);
  const k0 = bar.bk === 1 ? 3 : 1;
  const k1 = bar.bk === 1 ? ca - 2 : bar.bk - 2;
  // TWO PIPES, NOT TWELVE. A pipe on every table was a room with twelve
  // coals smoking at once, which is a fire and not a café; a café keeps a
  // couple, on the tables at the back — the row furthest from the door,
  // which is where the regulars sit — and whoever wants one sits there. The
  // old man who never leaves (see spawnElders in entities.js) takes the
  // first of them.
  const rows = [];
  for (let a = 1; a < la - 1; a += 4) rows.push(a);
  const pipeRow = rows.reduce((best, a) => (
    Math.abs(a - room.doorA) > Math.abs(best - room.doorA) ? a : best), rows[0]);
  let pipes = 0;
  for (const a of rows) {
    for (let k = k0; k <= k1; k += 2) {
      const [tu, tv] = cell(a, k);
      if (!put(tu, tv, b + 1, B.TABLE)) continue;
      if (a === pipeRow && pipes < 2 && put(tu, tv, b + 2, B.SHISHA)) {
        puff(p.f, tu, tv, b + 2);
        pipes++;
      }
      seat(a - 1, k, -1, 0, chair);
      seat(a + 1, k, 1, 0, chair);
    }
  }
  markPipes(planet, p.f, seats, b);
  // lanterns over the two aisles
  for (const a of [3, 7]) {
    const [lu, lv] = cell(Math.min(a, la - 1), ca >> 1);
    planet.set(p.f, lu, lv, b + 4, vern.light);
    glow(p.f, lu, lv, b + 4);
  }
  roof(planet, p, b + 6, vern);
  (planet.cafes ??= []).push({
    kind: 'café', f: p.f, u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b, seats,
    keeper: bar.keeper,
  });
  const door = carveDoor(planet, p, side, b, vern, 1, 2);
  plaque(planet, p.f, door, 'Café', b);
  return door;
}

// The bones every seated room shares: the interior in its own frame, a
// writer that refuses to land on the doorstep or on anything already there,
// and a seat-layer that records what it laid. `backAt(da, dk)` turns a
// direction in the room's frame into a chair's facing — the side its back
// stands on, +u, -u, +v, -v.
function roomFrame(planet, p, c, b) {
  const iu0 = p.u0 + 1, iu1 = p.u0 + p.w - 2;
  const iv0 = p.v0 + 1, iv1 = p.v0 + p.d - 2;
  const iw = iu1 - iu0 + 1, id = iv1 - iv0 + 1;
  const step = c.u - c.du, stev = c.v - c.dv;   // the cell you walk in to
  const clear = (u, v) => Math.abs(u - step) + Math.abs(v - stev) > 1;
  const inside = (u, v) => u >= iu0 && u <= iu1 && v >= iv0 && v <= iv1;
  // A SEAT keeps a cell clear all round the doorstep — a chair beside the
  // step is a chair somebody climbs over on the way in. A table only keeps
  // off the step itself: the cells either side of the step stay floor, and
  // a table straight ahead of the door is something you walk round, which
  // is what a café's door opening onto its tables looks like.
  const put = (u, v, h, block, strict = false) => {
    if (block == null || !inside(u, v)) return false;
    if (strict ? !clear(u, v) : (u === step && v === stev)) return false;
    if (planet.get(p.f, u, v, h) !== BLOCK.AIR) return false;
    planet.set(p.f, u, v, h, block);
    return true;
  };
  const long = iw >= id;
  const la = long ? iw : id, ca = long ? id : iw;
  const cell = (a, k) => (long ? [iu0 + a, iv0 + k] : [iu0 + k, iv0 + a]);
  const backAt = (da, dk) => {
    const du = long ? da : dk, dv = long ? dk : da;
    return du > 0 ? 0 : du < 0 ? 1 : dv > 0 ? 2 : 3;
  };
  const seats = [];
  const seat = (a, k, da, dk, block) => {
    if (a < 0 || k < 0 || a >= la || k >= ca) return;
    const [u, v] = cell(a, k);
    if (!put(u, v, b + 1, block(backAt(da, dk)), true)) return;
    seats.push({ u, v, h: b + 1, facing: backAt(da, dk) });
  };
  const doorA = long ? step - iu0 : stev - iv0;
  const doorK = long ? stev - iv0 : step - iu0;
  return { la, ca, cell, backAt, put, seat, seats, doorA, doorK, clear, inside,
    face: p.f };
}

// --- the bar ------------------------------------------------------------------
//
// The one fitting the café and the pub share, and the reason either room has
// anybody working in it. A counter along the long wall the door is NOT against;
// the keeper's own side behind it, with something stacked at BOTH ENDS of that
// and the middle left clear, because the middle is where he stands; glasses
// down the counter and a lamp on each end; two stools in front of it, backs to
// the room.
//
// It returns where the man behind it stands and what he faces, written in the
// same shape the shop's keeper is — `dir` says where somebody stands and has
// never said which way he is turned — because entities.js staffs a bar off
// exactly the record it staffs a counter off, and one keeper is enough code
// for both. It also hands back the two rows it took, so the caller can lay
// its tables in what is left and keep the lavatory off the barman's side.
function barCounter(planet, p, room, b, vern, drink, back) {
  const { la, ca, cell, put, seat, doorK } = room;
  const bk = doorK <= 1 ? ca - 2 : 1;          // the counter's row
  const kk = bk === 1 ? 0 : ca - 1;            // ...and the keeper's, behind it
  let laid = 0;
  for (let a = 1; a < la - 1; a++) {
    const [u, v] = cell(a, bk);
    if (put(u, v, b + 1, B.TABLE)) laid++;
  }
  if (!laid) return { bk, kk, keeper: null };
  for (const a of [1, 2, la - 3, la - 2]) {
    const [u, v] = cell(a, kk);
    if (back != null && put(u, v, b + 1, back)) {
      planet.set(p.f, u, v, b + 2, back);
    }
  }
  // a lamp on each end of the counter...
  for (const a of [1, la - 2]) {
    const [u, v] = cell(a, bk);
    if (planet.get(p.f, u, v, b + 1) === B.TABLE) {
      planet.set(p.f, u, v, b + 2, vern.roomLight ?? B.LAMP);
      glow(p.f, u, v, b + 2);
    }
  }
  // ...and a glass on every cell between them. A bar with nothing on it is a
  // shelf, and it is the glasses and not the counter that say what is being
  // served here — and it is the ROW of them that says it, because four spaced
  // down thirteen blocks reads as somebody left their drink behind.
  if (drink != null) {
    for (let a = 2; a <= la - 3; a++) {
      const [u, v] = cell(a, bk);
      if (planet.get(p.f, u, v, b + 1) === B.TABLE) put(u, v, b + 2, drink);
    }
  }
  // stools at the bar, backs to the room
  const sk = bk === 1 ? 2 : ca - 3;
  const dk = sk > bk ? 1 : -1;
  seat(3, sk, 0, dk, chair);
  seat(la - 4, sk, 0, dk, chair);
  // WHERE THE BARTENDER STANDS: the middle of his own side of the counter,
  // facing the middle of the counter. Written down rather than searched for,
  // which is the rule this whole file is built on — and it is the only reason
  // there is ever anybody there, because entities.js has no way to look at a
  // room and work out which cell is behind the bar.
  const [ku, kv] = cell(la >> 1, kk);
  const [cu, cv] = cell(la >> 1, bk);
  if (planet.get(p.f, ku, kv, b + 1) !== BLOCK.AIR) return { bk, kk, keeper: null };
  const kd = dirFromCell(p.f, ku + 0.5, kv + 0.5);
  const cd = dirFromCell(p.f, cu + 0.5, cv + 0.5);
  return {
    bk,
    kk,
    keeper: {
      u: ku, v: kv, h: b + 1,
      dir: [kd[0], kd[1], kd[2]],
      at: [cd[0], cd[1], cd[2]],
    },
  };
}

// The café and the pub used to keep a toilet in whichever corner the plan
// left free. They do not any more: a village has ONE toilet, and it is the
// privy on the street — see the note in furnish, and privy below.

// which seats have a pipe to hand: one on the table in front, or one on the
// floor beside
function markPipes(planet, f, seats, b) {
  for (const s of seats) {
    s.pipe = false;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (planet.get(f, s.u + du, s.v + dv, b + 2) === B.SHISHA
        || planet.get(f, s.u + du, s.v + dv, b + 1) === B.SHISHA) {
        s.pipe = true;
      }
    }
  }
}

// --- the pub -----------------------------------------------------------------------
//
// Where a village with a CHURCH spends its evening; the café with the pipes
// is where a village with a mosque spends it. A bar along one long wall with
// casks stacked behind it, four tables down the room with an aisle between
// them, two stools at the bar, a fire in the far gable and a chimney over it.
// No pipes — a pub is for talking — but its seats go on the same list the
// café's do, and the evening fills it the same way.
const PUB_LEN = 11, PUB_DEP = 7;
function pub(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(11, roofNeed(6, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 1, b + 5, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  halfTimber(planet, p, b + 2, b + 5, vern);
  const room = roomFrame(planet, p, c, b);
  const { la, ca, cell, put, seat, seats } = room;
  // the bar — the counter, the casks behind it, the glasses on it, the lamps
  // and the two stools — is the same fitting the café keeps, and it is laid
  // by the same hand: see barCounter.
  const bar = barCounter(planet, p, room, b, vern, B.TANKARD, B.CASK);
  // the tables, on the other side of the room, an aisle between the pairs,
  // and a glass on each: a pub table with nothing on it is a bench.
  const tk = bar.bk === 1 ? ca - 2 : 1;
  for (const a of [2, la - 3]) {
    const [u, v] = cell(a, tk);
    if (!put(u, v, b + 1, B.TABLE)) continue;
    put(u, v, b + 2, B.TANKARD);
    seat(a - 1, tk, -1, 0, chair);
    seat(a + 1, tk, 1, 0, chair);
  }
  markPipes(planet, p.f, seats, b);
  const hz = hearth(planet, p, b, vern, false);
  const rf = roof(planet, p, b + 6, vern);
  if (vern.hearth) chimney(planet, p.f, hz.u, hz.v, b + 1, rf.top + 1, vern);
  (planet.cafes ??= []).push({
    kind: 'pub', f: p.f, u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b, seats,
    keeper: bar.keeper,
  });
  const door = carveDoor(planet, p, side, b, vern, 1, 2);
  plaque(planet, p.f, door, 'Pub', b);
  return door;
}

// --- the privy ----------------------------------------------------------------
//
// THE SMALLEST ROOM, AS A ROOM. A toilet in the corner of a café is a fitting;
// a hut of its own on the street with WC over the door is a BUILDING — and a
// building is the thing a village can queue outside of, which a corner of
// somebody else's back room never was.
//
// Five by four is the whole of it: a door in the middle of the front — odd, on
// an odd front, for the reason every opening in this game is — a pan against
// the back wall with its cistern to that wall and its seat to the door, and
// four cells of floor, which is exactly enough to shut the door behind you.
// A light, because the one room you want to be able to find in the dark is
// this one.
const PRIVY_LEN = 5, PRIVY_DEP = 4;
function privy(planet, p, side, vern, rand) {
  const b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 1, Math.max(8, roofNeed(4, span)));
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.PLANK);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b, vern.plinth);
  const c = wallCell(p, side);
  // no windows: it is four walls and a door, and that is the point of it.
  // THREE COURSES, NOT FOUR, and a ceiling over the top two: the room is
  // two cells of headroom and no more. floorNear (entities.js) will not put
  // a foot anywhere with less than two clear cells over it, so nobody can
  // climb onto the pan — and with four cells of air in here somebody always
  // did, and stood on the cistern all afternoon. A seated man is a block
  // and a half tall, so he fits under it with room to spare.
  storey(planet, p, b + 1, b + 3, vern, {
    plinth: vern.plinth, light: 0,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  fillRect(planet, p.f, p.u0 + 1, p.v0 + 1, p.w - 2, p.d - 2, b + 3, BLOCK.PLANK);
  // two steps in from the door wall is the back row; the cistern goes on the
  // wall behind it, which is the way the door was walked IN from reversed
  const tu = c.u - c.du * 2, tv = c.v - c.dv * 2;
  const facing = c.du > 0 ? 1 : c.du < 0 ? 0 : c.dv > 0 ? 3 : 2;
  const pan = toilet(facing);
  if (pan != null && planet.get(p.f, tu, tv, b + 1) === BLOCK.AIR) {
    planet.set(p.f, tu, tv, b + 1, pan);
    logLoo(p.f, tu, tv, b + 1, facing);
  }
  // the light is IN the ceiling, beside the pan: the one room you want to
  // be able to find in the dark, lit from over your head
  const lu = tu + (c.du ? 0 : 1), lv = tv + (c.du ? 1 : 0);
  planet.set(p.f, lu, lv, b + 3, vern.roomLight ?? B.LAMP);
  glow(p.f, lu, lv, b + 3);
  roof(planet, p, b + 4, vern);
  const door = carveDoor(planet, p, side, b, vern, 1, 2);
  plaque(planet, p.f, door, 'WC', b);
  return door;
}

// --- Cinder: the buildings of a people with fire and no metal ---------------
//
// Both of these stand in for something the default village keeps. They are
// not houses and they have no door, so each returns the plot's own wall cell
// as its door record — the layout loop wants one to lay a path and a flower
// strip against, and a track worn up to a stone circle is right anyway.

// The stone circle, which is what this culture has instead of a church. Piers
// of undressed rubble on a ring, lintels laid across each pair, and a fire in
// the middle: the one piece of architecture these people build to last, and
// the only thing on the planet taller than a hut.
function standingStones(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 2, 11);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.GRAVEL);
  const cu = p.u0 + (p.w >> 1), cv = p.v0 + (p.d >> 1);
  const rad = Math.min(p.w, p.d) >> 1;

  // Eight piers on a ring. Their heights alternate by one course, because a
  // circle of identical posts reads as a fence and a circle of unequal ones
  // reads as something raised by hand.
  const feet = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const u = cu + Math.round(Math.cos(a) * rad);
    const v = cv + Math.round(Math.sin(a) * rad);
    const tall = 3 + (i & 1);
    for (let h = 1; h <= tall; h++) planet.set(f, u, v, b + h, BLOCK.COBBLE);
    feet.push({ u, v, top: b + tall });
  }
  // Lintels: a timber laid from each pier to the next one of the same height,
  // so the ring is a series of gateways rather than a row of stumps.
  for (let i = 0; i < feet.length; i += 2) {
    const a = feet[i], c = feet[(i + 1) % feet.length];
    if (a.top !== c.top) continue;
    const du = Math.sign(c.u - a.u), dv = Math.sign(c.v - a.v);
    let u = a.u, v = a.v, guard = 0;
    while ((u !== c.u || v !== c.v) && guard++ < 12) {
      planet.set(f, u, v, a.top + 1, BLOCK.LOG);
      u += du; v += dv;
    }
    planet.set(f, c.u, c.v, a.top + 1, BLOCK.LOG);
  }
  // the fire at the centre, ringed in stone and never let out
  for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]])
    planet.set(f, cu + du, cv + dv, b, BLOCK.COBBLE);
  planet.set(f, cu, cv, b + 1, B.CAMPFIRE);
  glow(f, cu, cv, b + 1);
  const c = wallCell(p, side);
  return { f, u: c.u, v: c.v, h: b + 1, du: c.du, dv: c.dv };
}

// The lookout: a heaped mound with a ramp cut round it and a fire basket on
// top. It is the watchtower of a people who cannot build a wall — you gain
// the height by piling up the ground rather than by standing on masonry, and
// you can walk to the top of it, which no tower in this file lets you do.
function lookoutMound(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 2, 13);
  // the mound: courses shrinking by one cell a side, earth with a stone skin
  let u0 = p.u0, v0 = p.v0, w = p.w, d = p.d, h = b;
  while (w > 2 && d > 2) {
    for (let u = u0; u < u0 + w; u++)
      for (let v = v0; v < v0 + d; v++) {
        const edge = u === u0 || v === v0 || u === u0 + w - 1 || v === v0 + d - 1;
        planet.set(f, u, v, h, edge ? BLOCK.GRAVEL : BLOCK.DIRT);
      }
    u0++; v0++; w -= 2; d -= 2; h++;
  }
  // the ramp: one step per cell up the outside, so it is genuinely walkable
  const ru = p.u0, rv = p.v0;
  for (let k = 0; k < Math.min(p.w, p.d) - 1; k++) {
    planet.set(f, ru + k, rv + k, b + k, BLOCK.GRAVEL);
    planet.set(f, ru + k, rv + k, b + k + 1, BLOCK.AIR);
    planet.set(f, ru + k, rv + k, b + k + 2, BLOCK.AIR);
  }
  // the basket: four posts round a fire, which is the beacon
  const cu = p.u0 + (p.w >> 1), cv = p.v0 + (p.d >> 1);
  for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    planet.set(f, cu + du, cv + dv, h, B.POST);
  planet.set(f, cu, cv, h, BLOCK.COBBLE);
  planet.set(f, cu, cv, h + 1, B.CAMPFIRE);
  glow(f, cu, cv, h + 1);
  const c = wallCell(p, side);
  return { f, u: c.u, v: c.v, h: b + 1, du: c.du, dv: c.dv };
}

// --- Thalassa: the buildings of a people who live on the water --------------

// The shrine. A hall on a raised stone terrace, reached up a flight of steps,
// with a gate of two posts and two lintels standing in front of it. The gate
// is the thing you see from out at sea, and it is four blocks.
function shrine(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  const span = p.ax ? p.w : p.d;
  levelPlot(planet, p, 2, Math.max(14, roofNeed(6, span)));
  // the terrace: a solid stone podium the hall stands on, so the building is
  // lifted clear of the ground the way a shrine always is
  for (let u = p.u0 - 1; u < p.u0 + p.w + 1; u++)
    for (let v = p.v0 - 1; v < p.v0 + p.d + 1; v++)
      planet.set(f, u, v, b, BLOCK.COBBLE);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b + 1, BLOCK.PLANK);
  ring(planet, f, p.u0, p.v0, p.w, p.d, b + 1, vern.plinth);
  const c = wallCell(p, side);
  storey(planet, p, b + 2, b + 6, vern, {
    plinth: vern.plinth, light: 2,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  halfTimber(planet, p, b + 2, b + 6, vern);
  // the steps up to the terrace, on the street side
  for (let k = 1; k <= 2; k++) {
    const u = c.u + c.du * k, v = c.v + c.dv * k;
    const facing = c.du > 0 ? 1 : c.du < 0 ? 0 : c.dv > 0 ? 3 : 2;
    planet.set(f, u, v, b + 1 - (k - 1), stair(MAT.COBBLE, facing));
  }
  roof(planet, p, b + 7, vern);
  // the gate: two posts and two lintels, out in front of the steps
  const gu = c.u + c.du * 5, gv = c.v + c.dv * 5;
  const au = c.du === 0 ? 1 : 0, av = c.du === 0 ? 0 : 1;
  const red = CS.cementId ? CS.cementId(1) : BLOCK.LOG;
  for (const k of [-2, 2]) {
    for (let h = 1; h <= 4; h++)
      planet.set(f, gu + au * k, gv + av * k, b + h, red);
  }
  for (let k = -3; k <= 3; k++) {
    planet.set(f, gu + au * k, gv + av * k, b + 5, red);      // upper lintel
    if (Math.abs(k) <= 2) planet.set(f, gu + au * k, gv + av * k, b + 3, red);
  }
  return carveDoor(planet, p, side, b + 1, vern);
}

// The pagoda. Storeys that shrink as they rise, each with its own overhanging
// eave, which is the only building in the game whose silhouette is a stack.
// It replaces the watchtower, and like the watchtower it is the tallest thing
// in the village — but you read it as ornament rather than as defence.
function pagoda(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 2, 20);
  for (let u = p.u0 - 1; u < p.u0 + p.w + 1; u++)
    for (let v = p.v0 - 1; v < p.v0 + p.d + 1; v++)
      planet.set(f, u, v, b, BLOCK.COBBLE);

  let u0 = p.u0, v0 = p.v0, w = p.w, d = p.d, h = b + 1;
  const tiers = 4;
  for (let t = 0; t < tiers && w >= 3 && d >= 3 && h < H - 8; t++) {
    const q = { f, u0, v0, w, d, base: h, ax: p.ax };
    // the storey: posts at the corners, panels between, open at the front
    shell(planet, q, h, h + 2, (z) => (z === h + 2 ? vern.trim : vern.wall));
    quoins(planet, q, h, h + 2, vern);
    // its eave: a ring of slabs stepping out two cells, which is the tier
    for (let k = 1; k <= 2; k++)
      ring(planet, f, u0 - k, v0 - k, w + 2 * k, d + 2 * k, h + 3,
        slab(vern.roof, 1));
    ring(planet, f, u0, v0, w, d, h + 3, slab(vern.roof, 0));
    // floor of the tier above
    for (let u = u0 + 1; u < u0 + w - 1; u++)
      for (let v = v0 + 1; v < v0 + d - 1; v++)
        planet.set(f, u, v, h + 3, BLOCK.PLANK);
    u0++; v0++; w -= 2; d -= 2; h += 4;
  }
  // the mast on top, which is what finishes a pagoda
  const cu = p.u0 + (p.w >> 1), cv = p.v0 + (p.d >> 1);
  for (let k = 0; k < 3 && h + k < H - 2; k++)
    planet.set(f, cu, cv, h + k, B.POST);
  planet.set(f, cu, cv, Math.min(H - 2, h + 3), vern.light);
  glow(f, cu, cv, Math.min(H - 2, h + 3));
  const c = wallCell(p, side);
  return { f, u: c.u, v: c.v, h: b + 1, du: c.du, dv: c.dv };
}

// --- Rime: the buildings of a people who shut the weather out ---------------

// The courtyard house. Four ranges around an open square, entered through one
// gate — which is a genuinely different PLAN from everything else in this
// file, where a building is a box that faces a street. You walk past a blank
// wall and all the life is on the other side of it.
function courtyardHouse(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 1, 14);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.COBBLE);

  // the four ranges: a band two cells deep round the inside of the plot, with
  // the court paved and open in the middle
  const inU = p.u0 + 2, inV = p.v0 + 2;
  const inW = p.w - 4, inD = p.d - 4;
  const c = wallCell(p, side);
  const gateAt = side < 2 ? c.u : c.v;

  // outer wall, all the way round and blank
  for (let h = b + 1; h <= b + 4; h++)
    ring(planet, f, p.u0, p.v0, p.w, p.d, h,
      h === b + 4 ? vern.trim : vern.wall);
  quoins(planet, p, b + 1, b + 4, vern);
  // ...and the inner face of the ranges, which is where the windows are
  if (inW > 0 && inD > 0) {
    for (let h = b + 1; h <= b + 4; h++)
      ring(planet, f, inU, inV, inW, inD, h, h === b + 4 ? vern.trim : vern.wall);
    // hollow the ranges out, so they are rooms and not solid blocks
    for (let h = b + 1; h <= b + 3; h++) {
      for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
        for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++) {
          const inCourt = u > inU && u < inU + inW - 1
            && v > inV && v < inV + inD - 1;
          const inRange = !inCourt
            && !(u === inU || u === inU + inW - 1 || v === inV || v === inV + inD - 1);
          if (inRange || inCourt) planet.set(f, u, v, h, BLOCK.AIR);
        }
    }
    // the court itself: paved, open to the sky, with a tree's worth of green
    for (let u = inU + 1; u < inU + inW - 1; u++)
      for (let v = inV + 1; v < inV + inD - 1; v++) {
        planet.set(f, u, v, b, B.PATH);
        for (let h = b + 1; h <= b + 5; h++) planet.set(f, u, v, h, BLOCK.AIR);
      }
    // windows onto the court, which is the only side that has any
    for (const j of windowBays(inW)) {
      for (const v of [inV, inV + inD - 1]) {
        planet.set(f, inU + j, v, b + 1, vern.trim);
        planet.set(f, inU + j, v, b + 2, vern.glass ?? BLOCK.AIR);
      }
    }
  }

  // The roofs: one pitched range per side, laid as four narrow roofs rather
  // than one big one, which is what gives a courtyard its stepped skyline.
  for (const q of [
    { u0: p.u0, v0: p.v0, w: p.w, d: 2, ax: 0 },
    { u0: p.u0, v0: p.v0 + p.d - 2, w: p.w, d: 2, ax: 0 },
    { u0: p.u0, v0: p.v0 + 2, w: 2, d: p.d - 4, ax: 1 },
    { u0: p.u0 + p.w - 2, v0: p.v0 + 2, w: 2, d: p.d - 4, ax: 1 },
  ]) {
    if (q.w < 2 || q.d < 2) continue;
    roof(planet, { ...q, f, base: b }, b + 5, vern, { verge: 0 });
  }

  // the gate: a wide opening in the street wall under its own little roof
  const au = c.du === 0 ? 1 : 0, av = c.du === 0 ? 0 : 1;
  for (let k = -1; k <= 1; k++) {
    const u = c.u + au * k, v = c.v + av * k;
    for (let h = b + 1; h <= b + 3; h++) planet.set(f, u, v, h, BLOCK.AIR);
    planet.set(f, u, v, b, B.PATH);
  }
  for (let k = -2; k <= 2; k++)
    planet.set(f, c.u + au * k, c.v + av * k, b + 4, vern.frame);
  // ...and the red posts either side of it, which is the one strong colour
  for (const k of [-2, 2])
    for (let h = b + 1; h <= b + 3; h++)
      planet.set(f, c.u + au * k, c.v + av * k, h, vern.column ?? vern.frame);
  planet.set(f, c.u + c.du, c.v + c.dv, b, B.PATH);
  planet.set(f, c.u - au * 2 + c.du, c.v - av * 2 + c.dv, b + 3, vern.light);
  glow(f, c.u - au * 2 + c.du, c.v - av * 2 + c.dv, b + 3);
  houseChest(planet, f, inU + 1, inV + 1, b + 1);
  return { f, u: c.u, v: c.v, h: b + 1, du: c.du, dv: c.dv };
}

// The gatehouse, with the drum tower over it. It stands where a watchtower
// would and does the same job, but you go THROUGH it — the arch is the way
// into the village, which is what makes the wall around one mean something.
function gatehouse(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 1, 15);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, BLOCK.COBBLE);
  // the base: solid masonry with an arch cut clean through it
  for (let h = b + 1; h <= b + 4; h++)
    for (let u = p.u0; u < p.u0 + p.w; u++)
      for (let v = p.v0; v < p.v0 + p.d; v++)
        planet.set(f, u, v, h, vern.masonry ?? BLOCK.COBBLE);
  const cu = p.u0 + (p.w >> 1), cv = p.v0 + (p.d >> 1);
  const ax = p.ax;
  for (let k = 0; k < (ax ? p.d : p.w); k++) {
    const u = ax ? cu : p.u0 + k, v = ax ? p.v0 + k : cv;
    for (let h = b + 1; h <= b + 3; h++) planet.set(f, u, v, h, BLOCK.AIR);
    planet.set(f, u, v, b, B.PATH);
    if (ax) { planet.set(f, u - 1, v, b + 4, vern.trim); planet.set(f, u + 1, v, b + 4, vern.trim); }
    else { planet.set(f, u, v - 1, b + 4, vern.trim); planet.set(f, u, v + 1, b + 4, vern.trim); }
  }
  // the drum chamber above, open on all four sides, with the bell in it
  const q = { f, u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b + 5, ax };
  shell(planet, q, b + 5, b + 7, (h) => (h === b + 7 ? vern.trim : vern.wall));
  quoins(planet, q, b + 5, b + 7, vern);
  for (const j of windowBays(p.w)) {
    planet.set(f, p.u0 + j, p.v0, b + 6, BLOCK.AIR);
    planet.set(f, p.u0 + j, p.v0 + p.d - 1, b + 6, BLOCK.AIR);
  }
  planet.set(f, cu, cv, b + 5, B.BELL);
  noteBell(f, cu, cv, b + 5);
  roof(planet, q, b + 8, vern);
  planet.set(f, cu, cv, b + 4, vern.light);
  glow(f, cu, cv, b + 4);
  const c = wallCell(p, side);
  return { f, u: c.u, v: c.v, h: b + 1, du: c.du, dv: c.dv };
}

// --- Tempest: the buildings of a people who live under rain -----------------

// The stepwell. A square shaft cut down to standing water with stairs running
// down all four sides of it, arcaded at the top. It is the one building here
// that goes DOWN, and on a world where the storm never lifts it is where the
// whole village keeps its water.
function stepwell(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 2, 8);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, vern.masonry ?? BLOCK.COBBLE);

  const depth = 6;
  let u0 = p.u0 + 1, v0 = p.v0 + 1, w = p.w - 2, d = p.d - 2;
  // each course down is one cell narrower a side, which IS the flight of steps
  for (let k = 0; k < depth && w > 2 && d > 2; k++) {
    const h = b - k;
    if (h < 2) break;
    for (let u = u0; u < u0 + w; u++)
      for (let v = v0; v < v0 + d; v++) {
        const edge = u === u0 || v === v0 || u === u0 + w - 1 || v === v0 + d - 1;
        // the tread is solid; everything inside it is cut away
        planet.set(f, u, v, h, edge ? (vern.masonry ?? BLOCK.COBBLE) : BLOCK.AIR);
      }
    u0++; v0++; w -= 2; d -= 2;
  }
  // the water at the bottom, which is the point of the whole excavation
  const floor = Math.max(2, b - depth);
  for (let u = u0 - 1; u < u0 + w + 1; u++)
    for (let v = v0 - 1; v < v0 + d + 1; v++) {
      planet.set(f, u, v, floor - 1, vern.masonry ?? BLOCK.COBBLE);
      planet.set(f, u, v, floor, BLOCK.WATER);
    }
  // the arcade round the head of the shaft: a pillar at each corner of every
  // side, carrying a lintel, so you look down through a colonnade
  for (let u = p.u0; u < p.u0 + p.w; u++)
    for (let v = p.v0; v < p.v0 + p.d; v++) {
      const edge = u === p.u0 || v === p.v0
        || u === p.u0 + p.w - 1 || v === p.v0 + p.d - 1;
      if (!edge) continue;
      const post = ((u - p.u0) % 2 === 0) && ((v - p.v0) % 2 === 0);
      if (post) for (let h = 1; h <= 3; h++) planet.set(f, u, v, b + h, vern.column ?? vern.frame);
      planet.set(f, u, v, b + 4, vern.trim);
      planet.set(f, u, v, b + 5, slab(vern.roof, 0));
    }
  const c = wallCell(p, side);
  planet.set(f, c.u, c.v, b + 4, vern.light);
  glow(f, c.u, c.v, b + 4);
  return { f, u: c.u, v: c.v, h: b + 1, du: c.du, dv: c.dv };
}

// The temple, under a stepped tower. A stack of shrinking rings is the
// cheapest thing in this file to generate and the least mistakable at range:
// nothing else on any world tapers.
function stepTemple(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 2, 20);
  // the plinth the whole thing stands on, one cell proud all round
  for (let u = p.u0 - 1; u < p.u0 + p.w + 1; u++)
    for (let v = p.v0 - 1; v < p.v0 + p.d + 1; v++)
      planet.set(f, u, v, b, vern.masonry ?? BLOCK.COBBLE);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b + 1, B.PATH);
  const c = wallCell(p, side);
  storey(planet, p, b + 2, b + 5, vern, {
    plinth: vern.plinth,
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  flatRoof(planet, p, b + 6, vern);
  // the tower: rings shrinking by a cell a side, each one course tall
  let u0 = p.u0 + 1, v0 = p.v0 + 1, w = p.w - 2, d = p.d - 2, h = b + 7;
  while (w >= 3 && d >= 3 && h < H - 3) {
    for (let k = 0; k < 2 && h + k < H - 3; k++)
      ring(planet, f, u0, v0, w, d, h + k, vern.wall);
    ring(planet, f, u0, v0, w, d, h + 2, vern.trim);
    u0++; v0++; w -= 2; d -= 2; h += 3;
  }
  const cu = p.u0 + (p.w >> 1), cv = p.v0 + (p.d >> 1);
  if (h < H - 2) {
    planet.set(f, cu, cv, h, vern.column ?? vern.trim);
    planet.set(f, cu, cv, h + 1, vern.light);
    glow(f, cu, cv, h + 1);
  }
  return carveDoor(planet, p, side, b + 1, vern);
}

// --- Ferrum: the buildings of a people a century ahead ----------------------

// The clock tower. It stands where the church steeple would and is exactly as
// tall, but what is at the top is a FACE and a bell rather than a cross — the
// quickest possible way to say that these people organise their day by a
// timetable rather than by the sun.
function clockTower(planet, p, side, vern, rand) {
  const f = p.f, b = p.base;
  levelPlot(planet, p, 1, 15);
  fillRect(planet, f, p.u0, p.v0, p.w, p.d, b, vern.masonry ?? BLOCK.COBBLE);
  shell(planet, p, b + 1, b + 9, (h) => (h % 4 === 0 ? vern.trim : vern.wall));
  quoins(planet, p, b + 1, b + 9, vern);
  // a tall light in each face, three courses up the shaft
  for (const h of [b + 3, b + 6]) {
    for (const [u, v] of [
      [p.u0 + (p.w >> 1), p.v0], [p.u0 + (p.w >> 1), p.v0 + p.d - 1],
      [p.u0, p.v0 + (p.d >> 1)], [p.u0 + p.w - 1, p.v0 + (p.d >> 1)],
    ]) {
      planet.set(f, u, v, h, vern.glass ?? B.PANE);
      planet.set(f, u, v, h + 1, vern.glass ?? B.PANE);
    }
  }
  // the floors and the ladder up to them
  for (const fl of [b + 4, b + 9]) {
    for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++)
      for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++)
        planet.set(f, u, v, fl, BLOCK.PLANK);
  }
  const lu = p.u0 + 1, lv = p.v0 + 1;
  for (let h = b + 1; h <= b + 9; h++) planet.set(f, lu, lv, h, ladder(1));
  planet.set(f, lu, lv, b + 10, BLOCK.AIR);
  if (audit.on) audit.ladders.push({ f, u: lu, v: lv, h0: b + 1, h1: b + 9 });
  // THE FACE: a pale disc in a dark surround, on all four sides, high up
  const white = CS.cementId ? CS.cementId(0) : B.GLASS;
  const dark = CS.cementId ? CS.cementId(7) : BLOCK.COBBLE;
  const cw = p.u0 + (p.w >> 1), cd = p.v0 + (p.d >> 1);
  for (let k = -1; k <= 1; k++) {
    for (let h = b + 10; h <= b + 12; h++) {
      const mid = k === 0 && h === b + 11;
      for (const [u, v] of [[cw + k, p.v0], [cw + k, p.v0 + p.d - 1]])
        planet.set(f, u, v, h, mid ? dark : white);
      for (const [u, v] of [[p.u0, cd + k], [p.u0 + p.w - 1, cd + k]])
        planet.set(f, u, v, h, mid ? dark : white);
    }
  }
  // the belfry over the face, and the bell in it
  shell(planet, p, b + 10, b + 13, (h) => (h === b + 13 ? vern.trim : vern.wall));
  quoins(planet, p, b + 10, b + 13, vern);
  planet.set(f, cw, cd, b + 12, B.BELL);
  noteBell(f, cw, cd, b + 12);
  roof(planet, p, b + 14, vern, { over: 1, verge: 1 });
  planet.set(f, cw, cd, b + 9, vern.light);
  glow(f, cw, cd, b + 9);
  const c = wallCell(p, side);
  return carveDoor(planet, p, side, b, vern);
}

// --- the archetype table ---------------------------------------------------
//
// `len` is the frontage along the street and `dep` the depth back from it, so
// a row of plots is laid out in street order without anything being rotated
// after the fact. `rank` is how near the green a building of this kind wants
// to be: 0 is on the green, 2 is the edge of the village.

// `name` is what the planner's "houses in this world" list calls it. Two
// entries can share a builder and differ only in size, so the name carries
// the size where that is the whole difference.
const HOUSES = [
  // `eave` has to match what the builder actually lays, or the plot is
  // surveyed for a shorter building than the one that turns up on it.
  { name: 'hall', len: 11, dep: 6, rank: 0, weight: 3, build: hall, eave: 7 },
  { name: 'two-storey', len: 7, dep: 6, rank: 0, weight: 3, build: twoStorey, eave: 9 },
  { name: 'house (large)', len: 9, dep: 6, rank: 0, weight: 2, build: house, eave: 7 },
  { name: 'house', len: 7, dep: 6, rank: 1, weight: 4, build: house, eave: 7 },
  { name: 'cottage', len: 7, dep: 5, rank: 1, weight: 4, build: cottage, eave: 6 },
  { name: 'barn', len: 9, dep: 7, rank: 1, weight: 2, build: barn, eave: 6 },
  { name: 'cottage (small)', len: 6, dep: 5, rank: 2, weight: 5, build: cottage, eave: 6 },
  { name: 'cottage (end)', len: 7, dep: 5, rank: 2, weight: 3, build: cottage, eave: 6 },
  { name: 'barn (outer)', len: 9, dep: 7, rank: 2, weight: 3, build: barn, eave: 6 },
  { name: 'tower', len: 5, dep: 5, rank: 2, weight: 1, build: tower, eave: 0, need: 17 },
];

// What one saved design is worth against the coded archetypes above, whose
// ranks total 8, 10 and 12. At 3 a single saved house turns up on roughly a
// quarter of the plots in its rank and four of them on about half — present
// in every village without being the whole of it.
//
// This number is the entire fix for the thing that was wrong here: a saved
// design used to win EVERY plot, so the first house anybody saved became
// every house in every village, and the ten archetypes below might as well
// not have been written.
const DESIGN_WEIGHT = 3;

// headroom this archetype needs, given the span its roof ends up covering
const needOf = (a, span) => a.need ?? roofNeed(a.eave, span);

// One weighted pool per rank, built once per CULTURE: this is picked from a
// few thousand times on a big planet and a filter() per call is pure garbage.
// A culture's `drop` list is how it refuses an archetype that does not belong
// to it — a crenellated stone watchtower in a village of roundhouses is the
// case this exists for.
const rankPools = (drop) => [0, 1, 2].map((rank) => {
  const pool = HOUSES.filter((a) => a.rank === rank && !drop?.has(a.name));
  return { pool, total: pool.reduce((s, a) => s + a.weight, 0) };
});
const RANKS = rankPools(null);

function pickArchetype(rand, rank, ranks = RANKS) {
  const { pool, total } = ranks[rank];
  if (!pool.length) return HOUSES[0];
  let r = rand() * total;
  for (const a of pool) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return pool[pool.length - 1];
}

// Sort the saved designs into the two things a design can be.
//
// An archetype is a function, so it cannot be edited — but it CAN be stood
// down. A design saved under an archetype's own name takes that archetype's
// place: same rank, same weight, same spot in the village, your building. A
// design saved under any other name is simply one more kind of house.
//
// That naming rule is the whole mechanism, and it is deliberate: it needs no
// second file to record which design replaced what, nothing to keep in step
// with the blueprint folder, and it reads the same to every machine — the
// designs are served from one place, so everyone builds the same village.
function buildingPools(plans, drop = null) {
  const byName = new Map(plans.map((p) => [p.name, p]));
  const ranks = rankPools(drop).map(({ pool, total }) => ({
    entries: pool.map((a) => ({ a, bp: byName.get(a.name) ?? null })),
    total,
  }));
  const named = new Set(HOUSES.map((a) => a.name));
  return { ranks, extras: plans.filter((p) => !named.has(p.name)) };
}

// One roll across BOTH pools: this rank's archetypes — each of which may have
// been replaced by a design of the same name — and the designs that are not
// standing in for anything. Returns { plan, a, kind }: `plan` for a design,
// `a` for a coded archetype, never both.
function pickBuilding(rand, rank, pools, side) {
  const { entries, total } = pools.ranks[rank];
  const { extras } = pools;
  let r = rand() * (total + DESIGN_WEIGHT * extras.length);
  for (const e of entries) {
    r -= e.a.weight;
    if (r > 0) continue;
    // the archetype's slot, filled by your building if you saved one for it
    return e.bp
      ? { plan: blueprintPlan(e.bp, side), a: null, kind: e.a.name }
      : { plan: null, a: e.a, kind: e.a.name };
  }
  const bp = extras[Math.min(extras.length - 1, Math.floor(r / DESIGN_WEIGHT))];
  return { plan: blueprintPlan(bp, side), a: null, kind: bp.name || 'saved design' };
}

// The names the generator knows, so the planner can say which kinds exist and
// which of them you have already taken over.
export const ARCHETYPE_NAMES = HOUSES.map((a) => a.name);

// --- village furniture -----------------------------------------------------

// The well is what makes a scatter of houses read as a village: a brick rim
// over a shaft of water, four posts, a windlass and a small stair canopy.
function buildWell(planet, p, vern) {
  const b = p.base;
  levelPlot(planet, p, 1, 7);
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.COBBLE);
  const iu = p.u0 + 1, iv = p.v0 + 1;
  ring(planet, p.f, iu, iv, 3, 3, b + 1, vern.plinth);
  for (let h = Math.max(1, b - 2); h <= b; h++)
    planet.set(p.f, iu + 1, iv + 1, h, BLOCK.WATER);
  for (const u of [iu, iu + 2])
    for (const v of [iv, iv + 2])
      for (let h = b + 2; h <= b + 3; h++)
        planet.set(p.f, u, v, h, vern.frame);
  // windlass across the head
  for (let v = iv; v <= iv + 2; v++)
    planet.set(p.f, iu + 1, v, b + 3, vern.trim);
  pyramidCap(planet, p.f, iu, iv, b + 4, vern.roof);
  planet.set(p.f, iu + 1, iv + 1, b + 4, vern.light);
  glow(p.f, iu + 1, iv + 1, b + 4);
  // a bench on two sides of the well, facing it
  planet.set(p.f, iu - 1, iv, b + 1, stair(MAT.PLANK, 1));
  planet.set(p.f, iu - 1, iv + 2, b + 1, stair(MAT.PLANK, 1));
}

// A fountain, on the same five-by-five plot the well stands on: a low rim
// you can sit on, a basin of standing water, and a stepped plinth in the
// middle with the water welling out of its head. Some greens get this
// instead of a well — water somebody laid on rather than water you have to
// wind up in a bucket, which is the difference between a village that works
// and a village that is doing well.
function fountain(planet, p, vern) {
  const b = p.base;
  levelPlot(planet, p, 1, 7);
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, BLOCK.COBBLE);
  const iu = p.u0 + 1, iv = p.v0 + 1;
  // the rim: a slab course, low enough to see the water over and to perch on
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b + 1, slab(MAT.COBBLE, 0));
  for (const u of [p.u0, p.u0 + p.w - 1]) {
    for (const v of [p.v0, p.v0 + p.d - 1]) {
      planet.set(p.f, u, v, b + 1, vern.plinth);   // corner piers
    }
  }
  for (let u = iu; u < iu + 3; u++) {
    for (let v = iv; v < iv + 3; v++) planet.set(p.f, u, v, b + 1, BLOCK.WATER);
  }
  planet.set(p.f, iu + 1, iv + 1, b + 1, vern.plinth);
  // A TOP slab, not a bottom one. A bottom slab left half a cell of daylight
  // between the head of the plinth and the water above it, so the water read
  // as a cube hanging in the air over a post — which is most of why nobody
  // believed this thing was a fountain.
  planet.set(p.f, iu + 1, iv + 1, b + 2, slab(MAT.BRICK, 1));
  planet.set(p.f, iu + 1, iv + 1, b + 3, BLOCK.WATER);
  // Where the jet is, so main.js can hang the spray over it. The water in a
  // fountain is blocks and blocks do not pour — see addFountainAnim — so the
  // running of it is an overlay, and this is the cell it runs from.
  return { f: p.f, u: iu + 1, v: iv + 1, h: b + 3 };
}

// A market stall: posts, a counter of slabs, a canopy and something to sell.
function marketStall(planet, f, u0, v0, vern, rand) {
  const t = groundTop(planet, f, u0 + 1, v0 + 1);
  if (t < 1 || t + 5 >= H) return;
  for (let u = u0; u < u0 + 3; u++)
    for (let v = v0; v < v0 + 2; v++) {
      const g = groundTop(planet, f, u, v);
      if (g < 0 || Math.abs(g - t) > 1) return;
      for (let h = t + 1; h <= t + 4; h++)
        if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
    }
  for (let u = u0; u < u0 + 3; u++) {
    planet.set(f, u, v0, t + 1, slab(MAT.PLANK, 1));       // the counter
    planet.set(f, u, v0, t + 4, slab(vern.roof, 0));       // the awning
    planet.set(f, u, v0 + 1, t + 4, slab(vern.roof, 0));
  }
  for (const u of [u0, u0 + 2])                            // posts, above it
    for (let h = t + 2; h <= t + 3; h++)
      planet.set(f, u, v0, h, B.FENCE);
  // Stock, behind the counter. Remembered separately from the house chests:
  // a stall is a TRADE, so main.js fills it with what this world sends out
  // rather than with somebody's bread and spare nails.
  planet.set(f, u0, v0 + 1, t + 1, B.CHEST);
  (planet.stallChests ??= []).push({ f, u: u0, v: v0 + 1, h: t + 1 });
  planet.set(f, u0 + 1, v0, t + 3, rand() < 0.5 ? B.WHEAT : vern.light);
}

// A drying rack: two posts and a beam. Three blocks, and it says "people work
// here" louder than anything else this cheap.
function dryingRack(planet, f, u0, v0, len, vern) {
  const t = groundTop(planet, f, u0, v0);
  if (t < 1 || t + 4 >= H) return;
  for (let k = 0; k < len; k++) {
    if (groundTop(planet, f, u0 + k, v0) !== t) return;
    if (planet.get(f, u0 + k, v0, t + 1) !== BLOCK.AIR) return;
  }
  for (const u of [u0, u0 + len - 1])
    for (let h = t + 1; h <= t + 2; h++)
      planet.set(f, u, v0, h, vern.frame);
  for (let k = 0; k < len; k++)
    planet.set(f, u0 + k, v0, t + 3, vern.trim);
}

// The palisade: a fence ring around everything the village built, following
// the ground, with a gap where each road leaves — the road gates already
// stand in those gaps, so walking in is walking under an arch. It is what
// turns "some houses near a well" into a place with an inside and an
// outside, and it gives the guards a line to walk.
// The village stands on FLAT ground now — the player looked down on one
// draped over a hillside and called it what it was. One square pad, all of
// it brought to the well's own floor, grassed on top, with a taper at the
// rim so the pad meets the land as a slope rather than a cliff. Everything
// after this — plots, streets, lanes — builds on level ground, which is
// most of what "organised" looks like from above.
// The head of the green, surveyed for the chief's hall (see greenHall). Not
// `survey`, which wants every cell to be grass, dirt, sand or stone and is
// right to on open ground: this is the village's own pad, levelled already
// wherever it could be, and what the pad could not level — the desert's
// orange sand, which it passes over — the hall's own terrace will. What it
// must not be is standing in water, or so far off the village floor that
// levelling it would leave a cliff at the top of the green.
function greenSite(planet, f, u0, v0, w, d, floor) {
  if (u0 < 3 || v0 < 3 || u0 + w > S - 3 || v0 + d > S - 3) return null;
  if (floor + HALL.wall + 5 >= H) return null;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const t = groundTop(planet, f, u, v);
      if (t < 1 || t >= H - 2) return null;
      if (planet.get(f, u, v, t + 1) === BLOCK.WATER) return null;
      if (Math.abs(t - floor) > 6) return null;
    }
  }
  return { f, u0, v0, w, d, base: floor, ax: 0 };
}

function levelVillagePad(planet, f, cu, cv, r, floor) {
  const taper = 6;
  for (let du = -r; du <= r; du++) {
    for (let dv = -r; dv <= r; dv++) {
      const u = cu + du, v = cv + dv;
      if (!inFace(u, v)) continue;
      const t = groundTop(planet, f, u, v);
      if (t < 1 || t + 2 >= H) continue;
      if (!GROUND.has(planet.get(f, u, v, t))) continue;
      // leave water be: a lakebed is sand, and sand alone would pass
      if (planet.get(f, u, v, t + 1) === BLOCK.WATER) continue;
      const edge = Math.max(Math.abs(du), Math.abs(dv));
      let target = floor;
      if (edge > r - taper) {
        const k = (edge - (r - taper)) / taper;   // 0 flat .. 1 natural
        target = Math.round(floor + (t - floor) * k);
      }
      if (t > target) {
        // cut: the hill goes, and whatever stood on it goes with it
        for (let h = target + 1; h <= Math.min(H - 1, t + 11); h++) {
          if (planet.get(f, u, v, h) !== BLOCK.AIR) {
            planet.set(f, u, v, h, BLOCK.AIR);
          }
        }
      } else if (t < target) {
        for (let h = t + 1; h < target; h++) planet.set(f, u, v, h, BLOCK.DIRT);
      } else {
        // level already: just fell what grows here
        for (let h = t + 1; h <= Math.min(H - 1, t + 11); h++) {
          const a = planet.get(f, u, v, h);
          if (a === BLOCK.LOG || a === BLOCK.LEAF) {
            planet.set(f, u, v, h, BLOCK.AIR);
          }
        }
      }
      // and between the paths, green grass — exactly as asked
      planet.set(f, u, v, target, BLOCK.GRASS);
    }
  }
}

// A stock pen: the fences finally put to their real use — a small fold of
// pigs or chickens beside the village, with a gap for the farmer to walk
// in. The animals themselves are spawned by entities.js off planet.penList.
function animalPen(planet, f, u0, v0, w, d, kind) {
  const t = groundTop(planet, f, u0 + (w >> 1), v0 + (d >> 1));
  if (t < 1 || t + 3 >= H) return false;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const g = groundTop(planet, f, u, v);
      if (g < 1 || Math.abs(g - t) > 1) return false;
      if (!GROUND.has(planet.get(f, u, v, g))) return false;
    }
  }
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const edge = u === u0 || v === v0 || u === u0 + w - 1 || v === v0 + d - 1;
      if (!edge) continue;
      const g = groundTop(planet, f, u, v);
      // the ring is closed: where the walk-in gap was there now hangs a
      // gate, closed until somebody lifts the latch
      const gate = u === u0 + (w >> 1) && v === v0;
      planet.set(f, u, v, g + 1, gate ? BLOCK.GATE : B.FENCE);
    }
  }
  (planet.penList ??= []).push({ f, u: u0, v: v0, w, d, kind, count: 3 });
  return true;
}

// A fire pit on the green: a hearthstone, a fire and a chair either side.
// The one spot in a village people would gather after dark, and the flames
// say so from the far end of the street.
function firePit(planet, f, u0, v0) {
  const t = groundTop(planet, f, u0, v0);
  if (t < 1 || t + 3 >= H) return;
  if (planet.get(f, u0, v0, t + 1) !== BLOCK.AIR) return;
  planet.set(f, u0, v0, t, BLOCK.COBBLE);
  planet.set(f, u0, v0, t + 1, B.CAMPFIRE);
  glow(f, u0, v0, t + 1);
  for (const [du, facing] of [[-1, 1], [1, 0]]) {
    const u = u0 + du;
    if (!inFace(u, v0)) continue;
    if (Math.abs(groundTop(planet, f, u, v0) - t) > 1) continue;
    if (planet.get(f, u, v0, t + 1) !== BLOCK.AIR) continue;
    planet.set(f, u, v0, t + 1, chair(facing));
  }
}

// Lamp post: a mast with a light on top. Refuses to spear anything that is
// already standing there, so it never grows through a roof.
function lampPost(planet, f, u, v, vern) {
  if (!inFace(u, v)) return;
  const t = groundTop(planet, f, u, v);
  if (t < 1 || t + 5 >= H) return;
  const under = planet.get(f, u, v, t);
  if (!GROUND.has(under) && under !== B.PATH) return;
  for (let h = t + 1; h <= t + 5; h++)
    if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
  // a slim post, not a full timber: a lamp standing on a whole block of
  // wood read as a tree trunk with a light on it
  for (let k = 1; k <= 3; k++) planet.set(f, u, v, t + k, vern.mast ?? B.POST);
  // the head is a real street lamp now — its own short post, a lit shade and
  // a cap — and main.js gives it a halo that comes up as the sun goes down.
  // A culture that has no lamp says so and gets its own fixture up the post:
  // a street of torches is the single loudest thing about a village at night.
  planet.set(f, u, v, t + 4, vern.streetLight ?? B.STREET_LAMP);
  glow(f, u, v, t + 4);
}

// A village gate where a street leaves the settlement: two posts and a beam
// over the road, which gives the village an edge instead of a fade-out.
// `put` is how the blocks go down, and it is the whole difference between a
// gate the GENERATOR lays and one a player raises. The generator writes
// straight into the planet, because a generated village is derived and must
// never be in the diff; a gate you put up yourself goes through main.js's
// setBlock like any block you laid, so it is saved and shipped. Same posts,
// same beam, same board either way.
function roadGate(planet, f, cu, cv, ax, sgn, t, vern,
  put = (ff, uu, vv, hh, b) => planet.set(ff, uu, vv, hh, b)) {
  const bu = ax ? cu : cu + sgn * t;
  const bv = ax ? cv + sgn * t : cv;
  const half = ROAD >> 1;
  const posts = [-half - 1, half + 1];
  let base = -1;
  for (const k of posts) {
    const u = ax ? bu + k : bu, v = ax ? bv : bv + k;
    const g = groundTop(planet, f, u, v);
    if (g < 1 || g + 6 >= H) return;
    if (base < 0) base = g; else if (Math.abs(g - base) > 1) return;
  }
  for (let k = posts[0]; k <= posts[1]; k++) {
    const u = ax ? bu + k : bu, v = ax ? bv : bv + k;
    put(f, u, v, base + 5, vern.trim);           // the beam across
  }
  for (const k of posts) {
    const u = ax ? bu + k : bu, v = ax ? bv : bv + k;
    for (let h = base + 1; h <= base + 4; h++)
      put(f, u, v, h, vern.frame);
  }
  // lanterns hang inside the arch, clear of the road's head height
  for (const k of [posts[0] + 1, posts[1] - 1]) {
    put(f, ax ? bu + k : bu, ax ? bv : bv + k, base + 4, vern.light);
    glow(f, ax ? bu + k : bu, ax ? bv : bv + k, base + 4);
  }
  // ...and the name board over the beam. The blocks are only the BOARD — a
  // course of planks a road wide — because a voxel atlas cannot spell. The
  // lettering is a canvas hung on this cell by main.js, which is why the spot
  // is handed back rather than just built.
  for (let k = posts[0]; k <= posts[1]; k++) {
    const u = ax ? bu + k : bu, v = ax ? bv : bv + k;
    put(f, u, v, base + 6, vern.upper ?? BLOCK.PLANK);
  }
  const d0 = dirFromCell(f, bu + 0.5, bv + 0.5);
  // one cell further OUT along the road, so main.js can work out which way
  // the board faces without knowing anything about faces or axes
  const d1 = dirFromCell(f, bu + (ax ? 0 : sgn) + 0.5, bv + (ax ? sgn : 0) + 0.5);
  return {
    f, u: bu, v: bv, h: base + 6, ax, sgn,
    dir: [d0[0], d0[1], d0[2]],
    out: [d1[0] - d0[0], d1[1] - d0[1], d1[2] - d0[2]],
    span: posts[1] - posts[0] + 1,
  };
}

// THE GATE YOU PUT UP YOURSELF.
//
// A village the generator laid gets a gate at every road mouth, and the name
// board over its beam is what tells you whose street you have walked into. A
// settlement you founded on a bell has no streets and so had no gate, no beam
// and nowhere for its name to be written — you could stand in the middle of a
// village of your own and nothing on the ground said what it was called.
//
// This is the same gate, raised where you ask for it. Everything about it is
// `roadGate`'s — two posts, the beam, a lantern either side and a course of
// board over the top — and it hands back the same sign record, so main.js
// hangs the same lettering on it and a village you rename repaints it with
// everything else. The blocks go down through main.js's setBlock like any
// block you laid, so a gate is in the diff, in the save and on the wire.
//
// `ax` and `sgn` are which way the road runs through it: the caller works
// those out from where the player was looking, because "the entrance" is a
// direction and only they know which one.
export function raiseGate(planet, f, u, v, ax, sgn, put = null) {
  const cult = cultureFor(planet);
  return roadGate(planet, f, u, v, ax, sgn, 0, cult.verns[0],
    put ?? undefined) ?? null;
}

// Fenced plot of tilled rows with an irrigation channel down the middle, so
// the field reads as worked ground rather than a patch of dirt.
function buildFarm(planet, p, rand) {
  const b = p.base;
  levelPlot(planet, p, 0, 5);
  fillRect(planet, p.f, p.u0, p.v0, p.w, p.d, b, B.FARMLAND);
  ring(planet, p.f, p.u0, p.v0, p.w, p.d, b + 1, B.FENCE);
  const chan = p.v0 + (p.d >> 1);
  // The far side of the channel is the kitchen garden: one gourd bed per farm,
  // ripe, so a village reads as somewhere that grows more than bread. Which
  // gourd is rolled from the farm's own stream, so a settlement is a pumpkin
  // village or a melon village and stays that way on every machine.
  const gourd = CS.cropId?.(
    CS.CROP_TYPES?.indexOf(rand() < 0.5 ? 'pumpkin' : 'watermelon') ?? -1, 1);
  for (let u = p.u0 + 1; u < p.u0 + p.w - 1; u++) {
    for (let v = p.v0 + 1; v < p.v0 + p.d - 1; v++) {
      if (v === chan) { planet.set(p.f, u, v, b, BLOCK.WATER); continue; }
      // a gourd sprawls, so its bed is planted thinner than the wheat is
      const bed = gourd != null && v > chan;
      if (rand() < (bed ? 0.5 : 0.88)) {
        planet.set(p.f, u, v, b + 1, bed ? gourd : B.WHEAT);
      }
    }
  }
  const g = wallCell(p, 0);
  planet.set(p.f, g.u, g.v, b + 1, BLOCK.AIR);   // gate
  // Written down, the way the doors and the beds are. Nothing outside this
  // function could ask where a settlement's allotments were, which is how a
  // farmhand came to till the green: work.js could see grass and could not
  // see that it was somebody's front garden. `base` is the FARMLAND course
  // and the fence stands one above it, so a plot is enough to say what is
  // rows, what is fence and where the way in is. The channel is the middle
  // row of the interior — see `chan` above — and nothing sows it.
  return {
    f: p.f, u0: p.u0, v0: p.v0, w: p.w, d: p.d, base: b,
    fence: B.FENCE, gate: { u: g.u, v: g.v }, chan,
  };
}

// --- ground, paths and streets ---------------------------------------------

// Paths are painted, not levelled: they follow the ground so a village on a
// slope keeps its lanes. Only the surface block changes, and anything growing
// on it is cleared.
function paintPath(planet, f, u, v, known) {
  if (!inFace(u, v)) return;
  const t = known === undefined ? groundTop(planet, f, u, v) : known;
  if (t < 1 || t >= H - 2) return;
  if (!GROUND.has(planet.get(f, u, v, t))) return;  // not soil
  if (planet.get(f, u, v, t + 1) === BLOCK.WATER) return;
  planet.set(f, u, v, t, B.PATH);
  // fell whatever is standing in the lane; 11 is a whole tree
  for (let h = t + 1; h <= t + 11 && h < H; h++) {
    const a = planet.get(f, u, v, h);
    if (a === BLOCK.LEAF || a === BLOCK.LOG) planet.set(f, u, v, h, BLOCK.AIR);
  }
}

// One street arm, paved outward from the green. Where the road meets standing
// water it is decked and railed instead of stopping: a river should divide a
// village into two banks, not into two villages.
function paveStreet(planet, f, cu, cv, ax, sgn, from, to, vern) {
  const half = ROAD >> 1;
  const cells = [];
  // one survey pass over the whole arm: the bridge decision needs to see both
  // banks before anything is painted, and the tops are then reused rather
  // than resolved a second time
  for (let t = from; t <= to; t++) {
    const bu = ax ? cu : cu + sgn * t;
    const bv = ax ? cv + sgn * t : cv;
    let wet = false, top = -1;
    const tops = [];
    for (let k = -half; k <= half; k++) {
      const u = ax ? bu + k : bu, v = ax ? bv : bv + k;
      if (!inFace(u, v)) { wet = true; break; }
      const g = groundTop(planet, f, u, v);
      tops.push(g);
      if (g < 1 || g >= H - 3) { wet = true; break; }
      if (planet.get(f, u, v, g + 1) === BLOCK.WATER) wet = true;
      if (g > top) top = g;
    }
    cells.push({ bu, bv, wet, top, tops });
  }

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c.wet) {
      for (let k = -half; k <= half; k++)
        paintPath(planet, f, ax ? c.bu + k : c.bu, ax ? c.bv : c.bv + k,
          c.tops[k + half]);
      continue;
    }
    // a wet run: bridge it if both banks are dry and it is short enough
    let j = i;
    while (j < cells.length && cells[j].wet) j++;
    const span = j - i;
    const left = i > 0 ? cells[i - 1] : null;
    const right = j < cells.length ? cells[j] : null;
    if (span <= 10 && left && right && left.top >= 1 && right.top >= 1) {
      const deck = Math.max(left.top, right.top);
      for (let m = i; m < j; m++) {
        const c2 = cells[m];
        for (let k = -half; k <= half; k++) {
          const u = ax ? c2.bu + k : c2.bu, v = ax ? c2.bv : c2.bv + k;
          if (!inFace(u, v) || deck + 3 >= H) continue;
          planet.set(f, u, v, deck, BLOCK.PLANK);
          planet.set(f, u, v, deck + 1,
            Math.abs(k) === half ? B.FENCE : BLOCK.AIR);
          planet.set(f, u, v, deck + 2, BLOCK.AIR);
        }
      }
    }
    i = j - 1;
  }
}

// L-shaped lane between two columns, `width` cells across.
function carveLane(planet, f, u1, v1, u2, v2, width) {
  const half = width >> 1;
  const lo = -half, hi = width - 1 - half;
  let u = u1, v = v1;
  const su = Math.sign(u2 - u), sv = Math.sign(v2 - v);
  let guard = 0;
  while (u !== u2 && guard++ < 64) {
    for (let k = lo; k <= hi; k++) paintPath(planet, f, u, v + k);
    u += su;
  }
  while (v !== v2 && guard++ < 128) {
    for (let k = lo; k <= hi; k++) paintPath(planet, f, u + k, v);
    v += sv;
  }
  for (let a = lo; a <= hi; a++)
    for (let c = lo; c <= hi; c++) paintPath(planet, f, u + a, v + c);
}

// The front garden: a fence along the street boundary with a gap on the axis
// of the door, and a path from the doorstep out to the road. This is the one
// thing that makes a row of buildings read as addressing a street.
function frontGarden(planet, p, side, door, cu, cv) {
  const f = p.f;
  const along = side < 2 ? 0 : 1;       // 0: fence runs along u, 1: along v
  const out = side === 0 ? -1 : side === 1 ? 1 : side === 2 ? -1 : 1;
  const gu = along ? (side === 2 ? p.u0 - 3 : p.u0 + p.w + 2) : p.u0 - 1;
  const gv = along ? p.v0 - 1 : (side === 0 ? p.v0 - 3 : p.v0 + p.d + 2);
  const n = along ? p.d + 2 : p.w + 2;
  const gate = along ? door.v : door.u;

  // No garden fences any more — fences belong to the stock pens now — but
  // the flowers stay: a strip of them along the old frontage line, hashed
  // from the cell so the same garden blooms the same way every time.
  for (let k = 0; k < n; k++) {
    const u = along ? gu : gu + k;
    const v = along ? gv + k : gv;
    if (!inFace(u, v)) continue;
    if ((along ? v : u) === gate) continue;   // the doorway's line stays clear
    let fn = (f * 8191 + u * 92837111 + v * 689287499) | 0;
    fn = Math.imul(fn ^ (fn >>> 15), 2246822519);
    if (((fn >>> 8) & 255) > 84) continue;
    const t = groundTop(planet, f, u, v);
    if (t < 1 || t + 2 >= H) continue;
    if (planet.get(f, u, v, t) !== BLOCK.GRASS) continue;
    if (planet.get(f, u, v, t + 1) !== BLOCK.AIR) continue;
    planet.set(f, u, v, t + 1, BLOCK.FLOWER_RED + ((fn >>> 11) % 3));
  }
  // and the garden path from the doorstep out through the gate to the road
  // — two cells wide now, so the lanes between houses read as lanes from
  // any height instead of vanishing into the grass
  const su = along ? out : 0, sv = along ? 0 : out;
  for (let k = 1; k <= 4; k++) {
    paintPath(planet, f, door.u + su * k, door.v + sv * k);
    paintPath(planet, f, door.u + su * k + (along ? 0 : 1),
      door.v + sv * k + (along ? 1 : 0));
  }
  carveLane(planet, f, door.u + su * 4, door.v + sv * 4,
    along ? cu : door.u, along ? door.v : cv, 2);
}

// A road from one village's gate toward the next village's, laid straight-
// ish across whatever lies between: two cells of path on land, a plank deck
// where it crosses water, and a hole in any fence standing exactly in the
// way — a road through a fence IS a gate.
function roadBetween(planet, f, u1, v1, u2, v2) {
  const lay = (u, v) => {
    for (const [a, b] of [[0, 0], [1, 0], [0, 1]]) {
      const uu = u + a, vv = v + b;
      if (!inFace(uu, vv)) continue;
      const ct = planet.columnTop(f, uu, vv);
      if (ct > 0 && planet.get(f, uu, vv, ct) === BLOCK.WATER) {
        planet.set(f, uu, vv, ct, BLOCK.PLANK);
        continue;
      }
      const t = groundTop(planet, f, uu, vv);
      if (t >= 1 && planet.get(f, uu, vv, t + 1) === B.FENCE) {
        planet.set(f, uu, vv, t + 1, BLOCK.AIR);
      }
      paintPath(planet, f, uu, vv);
    }
  };
  let u = u1, v = v1, err = 0, guard = 0;
  const du = Math.sign(u2 - u1), dv = Math.sign(v2 - v1);
  const w = Math.abs(u2 - u1), h = Math.abs(v2 - v1);
  while ((u !== u2 || v !== v2) && guard++ < 400) {
    lay(u, v);
    if (w >= h) {
      if (u !== u2) {
        u += du; err += h;
        if (err * 2 >= w && v !== v2) { err -= w; v += dv; }
      } else v += dv;
    } else if (v !== v2) {
      v += dv; err += w;
      if (err * 2 >= h && u !== u2) { err -= h; u += du; }
    } else u += du;
  }
  lay(u2, v2);
}

// --- assembly --------------------------------------------------------------

// `gap` is the clearance between two buildings — two roof overhangs plus a
// cell to walk between them. A reserved rect (the well, a street corridor)
// carries its own, or a road three cells wide would fence off the whole
// frontage that is supposed to face it.
const overlaps = (rects, u0, v0, w, d, gap) => rects.some((r) => {
  const g = r.gap ?? gap;
  return u0 - g < r.u0 + r.w && u0 + w + g > r.u0
    && v0 - g < r.v0 + r.d && v0 + d + g > r.v0;
});

// The eight plot rows: one per side of each of the four street arms.
// ax  0 = the street runs along u, 1 = along v
// sgn which way along the street this arm goes
// sd  which side of it this row is on
// side the wall of a plot in this row that faces the street
// village.js numbers the sides of a plot by where the wall is; cubesphere.js
// numbers facings by which way they point. side 0 is the wall at low v, so it
// faces -v, which is facing 3.
const SIDE_FACING = [3, 2, 1, 0];

// A blueprint dressed up as an archetype. The layout loop asks a building for
// its footprint and its headroom before it surveys a plot, and a stamped
// blueprint can answer both — but only once it knows which side of the street
// it will stand on, because that decides how far it is turned and therefore
// which way round its footprint goes.
function blueprintPlan(bp, side) {
  const rotated = BP.rotate(bp, BP.turnsTo(bp, SIDE_FACING[side]));
  const [w, d, hgt] = rotated.size;
  return {
    len: side < 2 ? w : d,      // along the street
    dep: side < 2 ? d : w,      // back from the frontage
    need: hgt + 2,
    rotated,
  };
}

// Stamp one onto a levelled plot and report its doorway, so the villagers get
// a waypoint and the garden knows which way the path runs.
function stampHouse(planet, p, side, bp) {
  // A skirt of 2 and never less than a tree's worth of headroom.
  //
  // This used to be `levelPlot(planet, p, 1, bp.size[2] + 2)`, which is the
  // one place in the file that could clear LESS than levelPlot's own default
  // of 11 — every coded archetype passes at least that. A player blueprint
  // five cells tall asked for seven, so a pine standing over the plot kept
  // its crown and the new house was delivered with a tree through the roof.
  // The building's own height is the wrong measure: what has to come out is
  // whatever is growing there, and that is a property of the forest.
  levelPlot(planet, p, 2, Math.max(11, bp.size[2] + 2));
  BP.stamp(planet, bp, p.f, p.u0, p.v0, p.base);
  const door = BP.findDoor(bp);
  const c = wallCell(p, side);
  return {
    f: p.f, u: p.u0 + door.u, v: p.v0 + door.v, h: p.base + door.h,
    du: c.du, dv: c.dv,
  };
}

// One frontage: a side of a street, running one way from the centre. `off` is
// the street's own offset across itself, so the same eight entries describe
// the middle street of an axis and the parallel ones either side of it.
const ROWS = [
  { ax: 0, sgn: 1, sd: 1, side: 0 },
  { ax: 0, sgn: 1, sd: -1, side: 1 },
  { ax: 1, sgn: 1, sd: 1, side: 2 },
  { ax: 1, sgn: 1, sd: -1, side: 3 },
  { ax: 0, sgn: -1, sd: 1, side: 0 },
  { ax: 0, sgn: -1, sd: -1, side: 1 },
  { ax: 1, sgn: -1, sd: 1, side: 2 },
  { ax: 1, sgn: -1, sd: -1, side: 3 },
];

// How big a settlement grows. Most are the cross of four streets this has
// always laid out; roughly one in four is a TOWN, which puts a second street
// either side of the middle one on both axes — a grid of blocks rather than
// a crossroads, with three times the frontage and the houses to fill it.
//
// BACK is why the parallel streets sit 24 apart and not 15: two streets that
// close have their houses' back walls in each other's gardens, every plot
// fails its overlap test, and a "town" comes out emptier than a hamlet.
const BACK = 2 * (FRONT + 7);        // frontage plus the deepest plan, twice
const LAYOUTS = [
  { name: 'hamlet', weight: 3, arm: 17, offs: [0], want: [5, 4] },
  { name: 'village', weight: 6, arm: 24, offs: [0], want: [8, 6] },
  { name: 'town', weight: 4, arm: 30, offs: [0, -BACK, BACK], want: [20, 13] },
];
const LAYOUT_TOTAL = LAYOUTS.reduce((s, l) => s + l.weight, 0);

function pickLayout(rand) {
  let r = rand() * LAYOUT_TOTAL;
  for (const l of LAYOUTS) if ((r -= l.weight) < 0) return l;
  return LAYOUTS[LAYOUTS.length - 1];
}

// Where a plot sits on a frontage: `t` cells down the street from the green,
// front on the frontage line. The distance ALONG the street is measured from
// the village centre — every street's arm starts there — while the distance
// ACROSS is measured from that street's own centre line, which is what `off`
// moves. Getting those two mixed up stacks a town's outer blocks on its
// middle one, so both callers share this.
function plotOrigin(row, cu, cv, t, len, dep) {
  const acu = cu + (row.ax ? row.off : 0);
  const acv = cv + (row.ax ? 0 : row.off);
  return {
    u0: row.ax
      ? (row.sd > 0 ? acu + FRONT : acu - FRONT - dep + 1)
      : (row.sgn > 0 ? cu + t : cu - t - len + 1),
    v0: row.ax
      ? (row.sgn > 0 ? cv + t : cv - t - len + 1)
      : (row.sd > 0 ? acv + FRONT : acv - FRONT - dep + 1),
  };
}

function buildVillage(planet, f, cu, cv, rand, pools) {
  // Where the chief's throne ends up, filled in when the hall is sited. Null
  // on a village whose surveys all failed — there is nothing to sit on, and
  // entities.js stands the chief on the green instead.
  let hallSeat = null;
  let hallPosts = [];
  // the well plot doubles as the site test: if the centre is unusable there is
  // no point laying out anything around it
  const wellPlot = survey(planet, f, cu - 2, cv - 2, 5, 5, 9);
  if (!wellPlot) return null;
  glowLog = [];      // every light this village places lands in site.glow
  bedLog = [];       // ...and every bed lands in site.beds
  looLog = [];       // ...and every toilet in site.loos
  pipeLog = [];      // ...and every water pipe in site.pipes
  plaqueLog = [];
  bellLog = [];      // ...and every bell in site.bells
  const lay = pickLayout(rand);
  const arm = lay.arm;
  const spread = Math.max(...lay.offs.map(Math.abs));
  // the pad has to cover the outermost street's back gardens, not just the
  // arms, or a town's far blocks are built on unlevelled ground
  const pad = Math.max(arm, spread + FRONT + 8) + 6;
  // flatten the whole pad FIRST: everything below builds on level ground
  levelVillagePad(planet, f, cu, cv, pad, wellPlot.base);
  // Which people built this. The culture is the world's — see CULTURES — so
  // every village on a planet shares an architecture, and two planets of the
  // same kind in different systems share it too.
  const cult = cultureFor(planet);
  const vern = vern3(planet, cult.verns[Math.floor(rand() * cult.verns.length)]);
  // the well is the centre of the village, so its floor is the village's
  const floor = wellPlot.base;

  // Reserved: the well plot, and a corridor along every street the layout
  // has. The green itself is deliberately NOT reserved as one block — plots
  // are meant to stand on its edge and look at it.
  // THE CHIEF'S HALL ON THE GREEN (the fourth generation). It used to be
  // put down on a ring round the village at a random bearing with its door
  // always to the same side of the plot — so it stood at the edge of the
  // settlement, as often as not with its arch opening onto the fields, and
  // the player said so: the chief's house is the centre of a village, not
  // its end. So on a new world it stands at the HEAD OF THE GREEN, square
  // across the top of it, its arch looking straight down the green at the
  // fountain; and the street arm that would have left the green there gives
  // way to it, which is what a street does when it arrives at a hall.
  // The green is surveyed for it before anything else is laid out, because
  // whether that arm exists decides every frontage after it. Where the
  // ground there will not take a hall, it goes to the ring as it always did.
  let greenHall = null;
  if (planet.gen4) {
    for (const [hw, hd] of [[HALL.w, HALL.d], [5, 9]]) {
      const u0 = cu - (hw >> 1), v0 = cv + GREEN + 1;
      if (!inFace(u0, v0) || !inFace(u0 + hw - 1, v0 + hd - 1)) continue;
      const p = greenSite(planet, f, u0, v0, hw, hd, floor);
      if (p) { greenHall = { p, hw, hd }; break; }
    }
  }
  // the arm the hall closes, off the middle cross only
  const closed = (off, ax, sgn) => !!greenHall && off === 0 && ax === 1 && sgn === 1;

  const taken = [{ u0: cu - 2, v0: cv - 2, w: 5, d: 5, gap: 1 }];
  for (const off of lay.offs) {
    taken.push({ u0: cu - arm, v0: cv + off - 1, w: 2 * arm + 1, d: 3, gap: 1 });
    taken.push(closed(off, 1, 1)
      ? { u0: cu + off - 1, v0: cv - arm, w: 3, d: arm + GREEN + 1, gap: 1 }
      : { u0: cu + off - 1, v0: cv - arm, w: 3, d: 2 * arm + 1, gap: 1 });
  }
  // every frontage of every street, the middle one first so the public
  // buildings below take the central corners rather than an outer block
  const rows = [];
  for (const off of lay.offs) {
    for (const r of ROWS) if (!closed(off, r.ax, r.sgn)) rows.push({ ...r, off });
  }
  const doors = [];
  // ...and every allotment, so that a farmhand has somewhere his hoe is
  // allowed. See buildFarm and `farms` in the site record below.
  const farms = [];
  // where the name boards went — one over each road mouth. Blocks only; the
  // lettering is main.js's, since a voxel atlas cannot spell.
  const signs = [];
  // THE CHIEF'S HALL, FIRST. Before a house, a farm, a barracks or a pen has
  // taken any ground — because when it went in last it competed with all of
  // them and eighteen villages in nineteen ended up with no hall at all.
  //
  // It is also simply right that it goes first: the hall is the building the
  // settlement is arranged around, and a chief who got whatever plot was left
  // over at the end is not a chief.
  for (const [hw, hd] of [[HALL.w, HALL.d], [5, 9]]) {
    if (hallSeat) break;
    if (greenHall && greenHall.hw !== hw) continue;
    for (let attempt = 0; attempt < 70; attempt++) {
      let u0, v0, p;
      if (greenHall) {
        ({ p } = greenHall);
        ({ u0, v0 } = p);
      } else {
        const ang = rand() * 6.283;
        const rr = spread + 4 + Math.floor(rand() * 12);
        u0 = cu + Math.round(Math.cos(ang) * rr) - (hw >> 1);
        v0 = cv + Math.round(Math.sin(ang) * rr) - (hd >> 1);
        if (!inFace(u0, v0) || !inFace(u0 + hw - 1, v0 + hd - 1)) continue;
        if (overlaps(taken, u0, v0, hw, hd, 2)) continue;
        p = survey(planet, f, u0, v0, hw, hd, HALL.wall + 5);
        if (!p) continue;
      }
      p.ax = 0;
      p.side = 0;
      const door = chiefHall(planet, p, 0, vern, rand);
      if (door) doors.push({
        f, u: door.u, v: door.v, h: door.h, du: door.du, dv: door.dv,
        dir: (() => { const dd = dirFromCell(f, door.u + 0.5, door.v + 0.5);
          return [dd[0], dd[1], dd[2]]; })(),
      });
      taken.push({ u0, v0, w: hw, d: hd, built: true });
      (planet.houseList ??= []).push({
        kind: 'hall', f, u0, v0, base: p.base, w: hw, d: hd,
        hgt: HALL.wall + 5, design: false,
        // A court, not a bedroom. Nobody sleeps in here and nobody may lay a
        // bed in here either — see `laidBed` above.
        chief: true, home: false,
      });
      // Where the throne stands, so entities.js can put the chief ON it
      // rather than somewhere in the road outside.
      hallPosts = door?.posts ?? [];
      hallSeat = {
        f, u: u0 + 1 + ((hw - 3) >> 1), v: v0 + hd - 2,
        // The THRONE's own course, not the one above it. Spawning him a cell
        // high left him to fall onto the chair, which he could only do while
        // the cell over his head was open sky — and it is books now, so
        // floorNear answers null and whatever radius he was given is the one
        // he keeps. Give him the right one.
        h: p.base + HALL.dais, u0, v0, w: hw, d: hd, base: p.base,
      };
      break;
    }
  }

  const wanted = lay.want[0] + Math.floor(rand() * lay.want[1]);
  const cursor = rows.map(() => 6);
  // How many of the large plans this village gets. A settlement has one
  // building that is obviously the public one, occasionally two; the rest of
  // the frontage nearest the green is ordinary houses. A town, having far
  // more frontage to fill, carries a couple more.
  let grand = 1 + (rand() < 0.4 ? 1 : 0) + (lay.offs.length > 1 ? 2 : 0);

  // The public buildings every village KEEPS rather than rolls dice for: a
  // church, a watchtower, a smithy, a shop and — where there is street enough
  // for it — a library. They go in before the houses, take the frontage
  // nearest the green, and start two rows apart so they spread around the
  // centre instead of piling up one street. `minArm` is why a hamlet does not
  // get a library: five public buildings around six houses is not a hamlet.
  // A settlement has ONE house of worship, and which one it is is settled
  // per village rather than per world: two villages a day's walk apart can
  // reasonably have built different things.
  const faith = rand() < 0.35
    ? { name: 'mosque', len: 9, dep: 9, eave: 6, need: 22, build: mosque }
    : { name: 'church', len: 7, dep: 12, eave: 7, need: 19, build: church, gable: true };
  // THE SHOP FIRST. It was fourth, and by the time its turn came the frontage
  // nearest the green was spent — which cost a radius-78 world three of its
  // four shops and a radius-30 world both of them. A planet with no counter on
  // it has no coin in it, and coin is the second ring of the whole game: a
  // village without a shop is a village you cannot trade with, cannot earn
  // from, and whose chief has no way to want money. The church can wait.
  const SHOP_PLAN = { name: 'shop', len: 7, dep: 6, eave: 6, build: shop };
  // ...and the shop goes first WHATEVER PEOPLE THESE ARE. Every culture lists
  // one — Cinder calls it a barter post, because those people mint nothing and
  // it is the hut they deal with outsiders in — but most of them list it
  // fourth or fifth, which is the position that lost it. Sorting by "is this
  // the counter" is stable, so the rest of each people's list keeps the order
  // they chose; only the shop moves.
  //
  // It is measurable and it was measured: Ferrum and Rime came out with two
  // shops between nine villages, against Terran's eight in ten.
  // ...and EVERY village has somewhere to spend the evening, and which room
  // it is follows its faith: a village with a CHURCH keeps a PUB, a village
  // with a MOSQUE keeps a CAFÉ with pipes on the tables — see the café hour.
  // A culture's own list is only extended, never reordered: the room goes on
  // the end, so the roll for everything before it does not move.
  const VENUE = faith.build === mosque
    ? { name: 'café', len: CAFE_LEN, dep: CAFE_DEP, eave: 6, build: cafeHouse }
    : { name: 'pub', len: PUB_LEN, dep: PUB_DEP, eave: 6, build: pub };
  const listed = cult.specials ? cult.specials(faith) : [
    SHOP_PLAN,
    faith,
    VENUE,
    { name: 'tower', len: 5, dep: 5, eave: 0, need: 17, build: tower },
    { name: 'smithy', len: 7, dep: 6, eave: 6, build: smithy },
    { name: 'library', len: 9, dep: 7, eave: 6, build: library, minArm: 24 },
  ];
  if (!listed.some((a) => a.build === cafeHouse || a.build === pub)) listed.push(VENUE);
  // ...AND A PRIVY, on every world and for every people. Same argument as the
  // venue and the same care: a culture's own list is only ever EXTENDED, never
  // reordered, so the roll for everything before it does not move. It goes on
  // the end because it is the least of the specials and the first that should
  // give way when the frontage runs out — a village with no room for a privy
  // still has the toilets in its houses and in its café.
  if (!listed.some((a) => a.build === privy)) {
    listed.push({ name: 'privy', len: PRIVY_LEN, dep: PRIVY_DEP, eave: 4,
      build: privy });
  }
  const SPECIALS = listed.slice()
    .sort((a, z) => (z.build === shop ? 1 : 0) - (a.build === shop ? 1 : 0));
  let hasShop = false;
  let hasVenue = false;
  let hasPrivy = false;
  // Specials only ever take the MIDDLE cross, however many streets the town
  // has: a church on an outer block is a church nobody walks past.
  const core = rows.filter((r) => r.off === 0).length;
  for (let si = 0; si < SPECIALS.length; si++) {
    const a = SPECIALS[si];
    if (a.minArm && arm < a.minArm) continue;
    for (let ri = 0; ri < core; ri++) {
      const i = (si * 2 + ri) % core;
      const row = rows[i];
      const t = cursor[i];
      const len = a.len, dep = a.dep;
      if (t + len > arm - 1) continue;
      const w = row.ax ? dep : len, d = row.ax ? len : dep;
      const { u0, v0 } = plotOrigin(row, cu, cv, t, len, dep);
      // the church turns its gable — and its steeple — to the street
      const ax = row.ax ? (a.gable ? 0 : 1) : (a.gable ? 1 : 0);
      const span = ax ? w : d;
      if (overlaps(taken, u0, v0, w, d, 3)) continue;
      const p = survey(planet, f, u0, v0, w, d, needOf(a, span), floor);
      if (!p) continue;
      p.ax = ax;
      p.side = row.side;      // which wall the door goes in; fixtures dodge it
      const bm = bedMark();
      const door = a.build(planet, p, row.side, vern, rand);
      taken.push({ u0, v0, w, d, built: true });
      (planet.houseList ??= []).push({
        kind: a.name, f, u0, v0, base: p.base, w, d,
        hgt: needOf(a, span), design: false, home: laidBed(bm),
        sleep: sleepsAt(),
      });
      cursor[i] = t + len + 2 + Math.floor(rand() * 2);
      frontGarden(planet, p, row.side, door,
        cu + (row.ax ? row.off : 0), cv + (row.ax ? 0 : row.off));
      const entry = doorEntry(planet, f, door);
      if (entry) doors.push(entry);
      if (a.build === shop) hasShop = true;
      if (a.build === cafeHouse || a.build === pub) hasVenue = true;
      if (a.build === privy) hasPrivy = true;
      break;
    }
  }

  // ...and if the frontage would not take one, the shop gets the same second
  // chance the hall gets: a free-standing plot on a ring round the green. A
  // village with a hall and no counter is a chief with nothing to sell.
  // ...and if the frontage would not take one, ANY culture's village gets the
  // second chance the hall gets. It was gated on the default culture, which is
  // most of why the worlds that are not home had no counters on them.
  //
  // ...and a THIRD chance, on its own level. The ring search asks `survey` to
  // put the plot at the village's floor and refuses anything more than four
  // courses off it, which is right for a street — a village reads as level
  // ground — and is the last thing that should stand between a settlement on
  // broken country and a counter. So the last sixty tries drop that one
  // condition and let the shop cut its own terrace wherever the ground will
  // take it. A shop up the bank is a shop; no shop is a village with no coin
  // in it. It cost about one settlement in two hundred, which is one too many.
  if (!hasShop) {
    for (let attempt = 0; attempt < 120 && !hasShop; attempt++) {
      const level = attempt < 60;
      const ang = rand() * 6.283;
      const rr = spread + 6 + Math.floor(rand() * (level ? 14 : 22));
      const u0 = cu + Math.round(Math.cos(ang) * rr) - 3;
      const v0 = cv + Math.round(Math.sin(ang) * rr) - 3;
      if (!inFace(u0, v0) || !inFace(u0 + 6, v0 + 5)) continue;
      if (overlaps(taken, u0, v0, 7, 6, 2)) continue;
      const p = survey(planet, f, u0, v0, 7, 6, 11, level ? floor : null);
      if (!p) continue;
      p.ax = 0;
      p.side = 0;
      const entry = doorEntry(planet, f, shop(planet, p, 0, vern, rand));
      if (entry) doors.push(entry);
      taken.push({ u0, v0, w: 7, d: 6, built: true });
      (planet.houseList ??= []).push({
        kind: 'shop', f, u0, v0, base: p.base, w: 7, d: 6,
        hgt: 11, design: false, home: false,
      });
      hasShop = true;
    }
  }

  // ...and the evening's room gets the shop's second chance, a free-standing
  // plot on the ring round the green, for the same reason on a smaller
  // scale: a village's frontage on a small world is spent by the time its
  // turn comes, and a village with nowhere to spend the evening is a village
  // that stands on its doorsteps at dusk.
  if (!hasVenue) {
    const cw = VENUE.len, cd = VENUE.dep, need = roofNeed(6, cd);
    for (let attempt = 0; attempt < 120 && !hasVenue; attempt++) {
      const level = attempt < 60;
      const ang = rand() * 6.283;
      const rr = spread + 8 + Math.floor(rand() * (level ? 16 : 26));
      const u0 = cu + Math.round(Math.cos(ang) * rr) - (cw >> 1);
      const v0 = cv + Math.round(Math.sin(ang) * rr) - (cd >> 1);
      if (!inFace(u0, v0) || !inFace(u0 + cw - 1, v0 + cd - 1)) continue;
      if (overlaps(taken, u0, v0, cw, cd, 2)) continue;
      const p = survey(planet, f, u0, v0, cw, cd, need, level ? floor : null);
      if (!p) continue;
      p.ax = 0;
      p.side = 0;
      const entry = doorEntry(planet, f, VENUE.build(planet, p, 0, vern, rand));
      if (entry) doors.push(entry);
      taken.push({ u0, v0, w: cw, d: cd, built: true });
      (planet.houseList ??= []).push({
        kind: VENUE.name, f, u0, v0, base: p.base, w: cw, d: cd,
        hgt: need, design: false, home: false,
      });
      hasVenue = true;
    }
  }

  // ...AND THE PRIVY, on the same ring and for a blunter reason than either.
  // It is last in the list, so on a small world its turn never comes at all —
  // eighteen settlements were surveyed and not one of them got a privy off the
  // frontage. It is also the smallest building in the village, five by four,
  // which means the ring will take it almost anywhere: a settlement that
  // cannot fit a shop can fit this. And it is the one building that has to be
  // OUTSIDE, on the street, where somebody can queue for it — a village whose
  // only toilets are in other people's back rooms is a village where a queue
  // has nowhere to stand.
  //
  // It also tries HARDER than the other two, and the numbers are why: at a
  // hundred and twenty tries on the shop's own ring, a third of the villages
  // on a radius-156 world ended with no toilet anywhere in them — not on the
  // street and not in a house, because looHouse is a coin toss per plot and a
  // three-house village can lose it three times. So this one gets three
  // hundred tries, a wider ring, and a margin of one cell rather than two: a
  // privy tucked against the gable of the house next door is exactly where a
  // privy goes, and it is the whole reason the building is five by four.
  if (!hasPrivy) {
    const pw = PRIVY_LEN, pd = PRIVY_DEP, need = roofNeed(4, pd);
    for (let attempt = 0; attempt < 300 && !hasPrivy; attempt++) {
      const level = attempt < 120;
      const ang = rand() * 6.283;
      const rr = spread + 3 + Math.floor(rand() * (level ? 18 : 32));
      const u0 = cu + Math.round(Math.cos(ang) * rr) - (pw >> 1);
      const v0 = cv + Math.round(Math.sin(ang) * rr) - (pd >> 1);
      if (!inFace(u0, v0) || !inFace(u0 + pw - 1, v0 + pd - 1)) continue;
      if (overlaps(taken, u0, v0, pw, pd, 1)) continue;
      const p = survey(planet, f, u0, v0, pw, pd, need, level ? floor : null);
      if (!p) continue;
      p.ax = 0;
      p.side = 0;
      const entry = doorEntry(planet, f, privy(planet, p, 0, vern, rand));
      if (entry) doors.push(entry);
      taken.push({ u0, v0, w: pw, d: pd, built: true });
      (planet.houseList ??= []).push({
        kind: 'privy', f, u0, v0, base: p.base, w: pw, d: pd,
        hgt: need, design: false, home: false,
      });
      hasPrivy = true;
    }
  }

  // Every pass visits every row, so a village grows outward evenly instead of
  // filling one street before starting the next. Size comes from how far down
  // the street a plot sits, not from the pass, so the gradient survives a row
  // that keeps failing its survey.
  for (let pass = 0; pass < 3 && doors.length < wanted; pass++) {
    for (let i = 0; i < rows.length && doors.length < wanted; i++) {
      const row = rows[i];
      for (let attempt = 0; attempt < 5; attempt++) {
        const t = cursor[i];
        if (t > arm - 7) break;
        const rank = (t <= 10 && grand > 0) ? 0 : (t <= 16 ? 1 : 2);
        // Your designs and the village's own, drawn from one pool — see
        // DESIGN_WEIGHT. What you saved turns up among the archetypes rather
        // than in place of all of them.
        const { plan, a, kind } = pickBuilding(rand, rank, pools, row.side);
        // most buildings put their ridge along the street; a few turn the
        // gable to it, which is a real variation and not a random angle
        const gableEnd = a ? (rand() < 0.25 && a.len - a.dep <= 3) : false;
        const len = plan ? plan.len : (gableEnd ? a.dep : a.len);
        const dep = plan ? plan.dep : (gableEnd ? a.len : a.dep);
        // a plot must end before the road gate does, or the village would
        // have a building standing in its own gateway
        if (t + len > arm - 1) continue;

        const w = row.ax ? dep : len, d = row.ax ? len : dep;
        const { u0, v0 } = plotOrigin(row, cu, cv, t, len, dep);

        // the plot's ridge axis: along the street unless the gable faces it
        const ax = row.ax ? (gableEnd ? 0 : 1) : (gableEnd ? 1 : 0);
        const span = ax ? w : d;

        if (overlaps(taken, u0, v0, w, d, 3)) { cursor[i] = t + 2; continue; }
        const p = survey(planet, f, u0, v0, w, d,
          plan ? plan.need : needOf(a, span), floor);
        if (!p) { cursor[i] = t + 2; continue; }
        p.ax = ax;
        p.side = row.side;    // which wall the door goes in; fixtures dodge it
        // ...and that it fronts a street, with nothing but the road in front
        // of it: the licence a third-generation townhouse needs to jetty its
        // upper floor out over the pavement (see townhouse3)
        p.street = true;

        const bm = bedMark();
        const door = plan
          ? stampHouse(planet, p, row.side, plan.rotated)
          : a.build(planet, p, row.side, vern, rand);
        if (!plan && rank === 0) grand--;
        taken.push({ u0, v0, w, d, built: true });
        // The register of what actually got built, and where. The planner
        // reads it to list the kinds of house standing in this world and to
        // lift one back out into your hands — you cannot edit an archetype,
        // it is a function, but you can always copy the house it made.
        (planet.houseList ??= []).push({
          kind, f, u0, v0, base: p.base, w, d,
          hgt: plan ? plan.rotated.size[2] : needOf(a, span),
          design: !!plan,
          // A saved design standing in a house row is a house: nobody stamps
          // their own building into the street and means it for a warehouse.
          home: plan ? true : laidBed(bm),
          sleep: sleepsAt(),
        });
        cursor[i] = t + len + 2 + Math.floor(rand() * 2);
        frontGarden(planet, p, row.side, door,
          cu + (row.ax ? row.off : 0), cv + (row.ax ? 0 : row.off));
        const dir = dirFromCell(f, door.u + 0.5, door.v + 0.5);
        doors.push({
          f, u: door.u, v: door.v, h: door.h,
          du: door.du, dv: door.dv, dir: [dir[0], dir[1], dir[2]],
        });
        break;
      }
    }
  }
  // ...AND A VILLAGE HAS HOMES IN IT (the fifth generation). On a small
  // frontage the hall, the shop, the evening's room and the privy can take
  // every plot there is: measured, three settlements in seventeen stood with
  // four or five doors and NOT ONE BED, eighteen people each, all of them
  // on a doorstep at dusk for the whole of the world's life — and a village
  // with no beds cannot grow, because beds are the cap. So what the shop and
  // the privy get, the people get: two cottages on the ring round the green
  // when the streets have given them fewer than two beds. Only on worlds of
  // the fifth generation — it draws on the village's own random stream, and
  // an older world keeps every village exactly where it was.
  if (planet.gen5 && doors.length && (bedLog?.length ?? 0) < 2) {
    let put = 0;
    const cw = 7, cd = 5, need = roofNeed(6, cd);
    for (let attempt = 0; attempt < 160 && put < 2; attempt++) {
      const level = attempt < 90;
      const ang = rand() * 6.283;
      const rr = spread + 5 + Math.floor(rand() * (level ? 18 : 30));
      const u0 = cu + Math.round(Math.cos(ang) * rr) - (cw >> 1);
      const v0 = cv + Math.round(Math.sin(ang) * rr) - (cd >> 1);
      if (!inFace(u0, v0) || !inFace(u0 + cw - 1, v0 + cd - 1)) continue;
      if (overlaps(taken, u0, v0, cw, cd, 2)) continue;
      const p = survey(planet, f, u0, v0, cw, cd, need, level ? floor : null);
      if (!p) continue;
      p.ax = 0;
      p.side = 0;
      const bm = bedMark();
      const entry = doorEntry(planet, f, cottage(planet, p, 0, vern, rand));
      if (entry) doors.push(entry);
      taken.push({ u0, v0, w: cw, d: cd, built: true });
      (planet.houseList ??= []).push({
        kind: 'cottage', f, u0, v0, base: p.base, w: cw, d: cd,
        hgt: need, design: false, home: laidBed(bm), sleep: sleepsAt(),
      });
      put++;
    }
  }

  // no houses stood up, so leave the ground untouched rather than stranding a
  // well in open country
  if (!doors.length) {
    glowLog = null; bedLog = null; looLog = null; pipeLog = null;
    bellLog = null;
    return null;
  }

  // Earthworks before paving. The plots have each cut their own terrace to
  // the shared floor; this brings the ground between them to the same level,
  // so the paving that follows is laid on flat ground rather than draped over
  // whatever the lane happened to cross. It runs here, after the village is
  // known to have houses, so a site that failed to stand anything up is left
  // exactly as it was found rather than scarred with an empty flat cross.
  levelStreets(planet, f, cu, cv, floor, taken);

  // Streets before the green, so the green paves over their inner ends. The
  // middle cross starts at the green's edge and ends in a road gate; a town's
  // outer streets run the whole way through instead — they have no green in
  // the middle to start from, and gating them would give a town twelve
  // gateways when what a gateway means is "the road out".
  for (const off of lay.offs) {
    for (const sgn of [1, -1]) {
      for (const ax of [0, 1]) {
        if (closed(off, ax, sgn)) continue;
        const scu = cu + (ax ? off : 0), scv = cv + (ax ? 0 : off);
        paveStreet(planet, f, scu, scv, ax, sgn, off ? 0 : GREEN - 1, arm, vern);
        if (!off) {
          const bd = roadGate(planet, f, cu, cv, ax, sgn, arm, vern);
          if (bd) signs.push(bd);
        }
      }
    }
  }
  // the green, chamfered at the corners so it reads as a square with the
  // four roads leaving it rather than as a paved block
  for (let u = cu - GREEN; u <= cu + GREEN; u++)
    for (let v = cv - GREEN; v <= cv + GREEN; v++) {
      const du = Math.abs(u - cu), dv = Math.abs(v - cv);
      if (du <= 2 && dv <= 2) continue;          // the well plot
      if (du + dv > GREEN + 3) continue;
      paintPath(planet, f, u, v);
    }

  // THE GREEN HOLDS ONE THING, and it is the fountain.
  //
  // It used to hold five: a fountain or a well, two market stalls, a drying
  // rack — a row of them on a fishing world — and a fire pit, all inside the
  // same eleven cells. That is a car park with a monument in it. The centre
  // of a village should read as the centre from the far end of the street,
  // and it cannot do that with four other objects competing for the eye.
  //
  // So the fountain stands alone, and everything that used to crowd it moves
  // out to the ring just beyond the green — still in the middle of the
  // village, off the middle of it. The well goes too: it is a fine thing and
  // it is not the thing this square is for.
  const jet = fountain(planet, wellPlot, vern);

  // Somewhere just outside the green for a piece of village furniture. The
  // diagonals first, because the four streets leave on the axes and a stall
  // in the road is a stall in the way; then further out, a ring at a time,
  // and it gives up rather than wedging a rack between two houses.
  const OFF_GREEN = [
    [-1, -1], [1, -1], [1, 1], [-1, 1],
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ];
  let offSlot = 0;
  const nearGreen = (w, d) => {
    for (let k = 0; k < OFF_GREEN.length; k++) {
      const [su, sv] = OFF_GREEN[(offSlot + k) % OFF_GREEN.length];
      for (const out of [GREEN + 3, GREEN + 6, GREEN + 9]) {
        const u0 = cu + su * out - (w >> 1);
        const v0 = cv + sv * out - (d >> 1);
        if (!inFace(u0, v0) || !inFace(u0 + w - 1, v0 + d - 1)) continue;
        if (overlaps(taken, u0, v0, w, d, 2)) continue;
        offSlot += k + 1;
        taken.push({ u0, v0, w, d });
        return { u0, v0 };
      }
    }
    return null;
  };

  // The well, on a plot of its own now rather than on the fountain's.
  const wellOff = nearGreen(5, 5);
  if (wellOff) {
    const wp = survey(planet, f, wellOff.u0, wellOff.v0, 5, 5, 9, floor);
    if (wp) buildWell(planet, wp, vern);
  }
  for (let i = 0; i < 2; i++) {
    const st = nearGreen(3, 2);
    if (st) marketStall(planet, f, st.u0, st.v0, vern, rand);
  }
  const rack = nearGreen(3, 1);
  if (rack) dryingRack(planet, f, rack.u0, rack.v0, 3, vern);
  // A fishing village dries what it catches, and a lot of it. The racks are
  // the one piece of village furniture that says how a people EAT, so an
  // island world gets a row of them where everyone else gets the one.
  for (let i = 0; i < (vern.racks ?? 0); i++) {
    const more = nearGreen(4, 1);
    if (more) dryingRack(planet, f, more.u0, more.v0, 4, vern);
  }
  const pit = nearGreen(1, 1);
  if (pit) firePit(planet, f, pit.u0, pit.v0);

  // Farms sit beyond the last house, on the diagonals where no street runs.
  // Proper fields now — a village that feeds itself needs more than four
  // allotments — big enough that the rows and the irrigation channel read
  // from the street.
  for (const [su, sv] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    // A big field needs flatter ground than an allotment did, so each
    // diagonal gets a few tries at different distances before giving up —
    // one failed survey used to cost the village a quarter of its farmland.
    for (let attempt = 0; attempt < 3; attempt++) {
      const w = 11, d = 8;
      // measured from the OUTERMOST street, not the centre, or a town's
      // fields would be laid out in the middle of its own blocks
      const rr = spread + 15 + attempt * 6 + Math.floor(rand() * 4);
      const u0 = cu + su * rr - (w >> 1);
      const v0 = cv + sv * rr - (d >> 1);
      if (overlaps(taken, u0, v0, w, d, 2)) continue;
      // farms sit outside the built village, so they keep their own level:
      // a field is allowed to follow the land the way a street is not
      const p = survey(planet, f, u0, v0, w, d, 4);
      if (!p) continue;
      farms.push(buildFarm(planet, p, rand));
      taken.push({ u0, v0, w, d });
      break;
    }
  }

  // The BARRACKS, on the edge of the settlement rather than on its high
  // street.
  //
  // It is placed here and not in SPECIALS on purpose, and the reason is
  // structural: the specials are laid along the middle cross in the order
  // they are written and stop the moment the frontage runs out, so a
  // barracks at the top of that list took the plot the shop wanted and one
  // at the bottom was never built at all off home. Out here it competes with
  // nothing, and a garrison post at the edge of a village is where a
  // garrison post belongs anyway — you pass it on the way in.
  //
  // Only settlements with a real street get one: three floors of billet over
  // a hamlet of five houses is a fort with a village attached.
  if (arm >= 20) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const ang = rand() * 6.283;
      const rr = spread + 10 + Math.floor(rand() * 16);
      const bw = 8, bd = 7;
      const u0 = cu + Math.round(Math.cos(ang) * rr) - (bw >> 1);
      const v0 = cv + Math.round(Math.sin(ang) * rr) - (bd >> 1);
      if (!inFace(u0, v0) || !inFace(u0 + bw - 1, v0 + bd - 1)) continue;
      if (overlaps(taken, u0, v0, bw, bd, 2)) continue;
      // No `floor` argument: like the farms, it keeps its own level. Pinning
      // it to the village's floor means every attempt on rolling ground
      // outside the levelled pad fails the survey, and most worlds got no
      // barracks at all.
      const p = survey(planet, f, u0, v0, bw, bd, 18);
      if (!p) continue;
      p.ax = 0;
      p.side = 0;
      const door = barracks(planet, p, 0, vern, rand);
      if (door) doors.push({
        f, u: door.u, v: door.v, h: door.h,
        du: door.du, dv: door.dv,
        dir: (() => { const d = dirFromCell(f, door.u + 0.5, door.v + 0.5);
          return [d[0], d[1], d[2]]; })(),
      });
      taken.push({ u0, v0, w: bw, d: bd });
      (planet.houseList ??= []).push({
        kind: 'barracks', f, u0, v0, base: p.base, w: bw, d: bd,
        // Three beds a floor of its own, so it IS somewhere people sleep.
        hgt: 18, design: false, home: true,
      });
      break;
    }
  }

  // The stock pens — where the fences went when they came off the walls: a
  // fold of pigs and a run of chickens on the flat ground just past the
  // houses. entities.js reads planet.penList and puts the animals in them.
  for (const [kind, pw, pd] of [['pig', 7, 6], ['chicken', 6, 5]]) {
    for (let attempt = 0; attempt < 18; attempt++) {
      const ang = rand() * 6.283;
      const rr = spread + 13 + Math.floor(rand() * 12);
      const u0 = cu + Math.round(Math.cos(ang) * rr) - (pw >> 1);
      const v0 = cv + Math.round(Math.sin(ang) * rr) - (pd >> 1);
      if (!inFace(u0, v0) || !inFace(u0 + pw - 1, v0 + pd - 1)) continue;
      if (overlaps(taken, u0, v0, pw, pd, 1)) continue;
      if (animalPen(planet, f, u0, v0, pw, pd, kind)) {
        taken.push({ u0, v0, w: pw, d: pd });
        break;
      }
    }
  }

  // lamps at a fixed interval down every street, which is what a regular
  // spacing buys: the lane reads as laid out rather than lit at random
  const half = (ROAD >> 1) + 1;
  for (const off of lay.offs) {
    for (const sgn of [1, -1]) {
      for (const ax of [0, 1]) {
        if (closed(off, ax, sgn)) continue;
        const scu = cu + (ax ? off : 0), scv = cv + (ax ? 0 : off);
        // stop well short of the arm's end: the road gate stands there and
        // hangs its own lanterns, and a lamp post one cell in front of it
        // reads as a stray post stuck to the side of the arch
        for (let t = off ? 2 : GREEN + 2; t < arm - 4; t += 8) {
          const u = ax ? scu + half : cu + sgn * t;
          const v = ax ? cv + sgn * t : scv + half;
          lampPost(planet, f, u, v, vern);
        }
      }
    }
  }
  for (const [lu, lv] of [[-GREEN, -GREEN], [GREEN, -GREEN],
    [-GREEN, GREEN], [GREEN, GREEN]])
    lampPost(planet, f, cu + lu, cv + lv, vern);

  // How far this settlement actually reaches, in cells from its centre: the
  // outermost corner of anything built, and never less than the street arms.
  // cubesphere.js needs it to keep the woods out — villages are laid out
  // before the trees are baked, so without a footprint to consult the forest
  // pass plants straight through the roofs. It is measured rather than
  // assumed because a village that failed most of its surveys is small, and
  // clearing the whole 31-cell margin around it would leave a bald ring.
  let reach = arm;
  for (const t of taken) {
    reach = Math.max(reach,
      Math.abs(t.u0 - cu), Math.abs(t.u0 + t.w - 1 - cu),
      Math.abs(t.v0 - cv), Math.abs(t.v0 + t.d - 1 - cv));
  }

  // No wall — the player tried one and wanted the open green back. The
  // "gates" the guards keep are the four road mouths where the lantern
  // arches stand: a village you walk into, watched but not fenced.
  const gates = [
    { f, u: cu, v: cv - arm }, { f, u: cu, v: cv + arm },
    { f, u: cu - arm, v: cv }, { f, u: cu + arm, v: cv },
  ];

  const dc = dirFromCell(f, cu + 0.5, cv + 0.5);
  const glowSpots = glowLog;
  const beds = bedLog;
  const loos = looLog;
  const pipes = pipeLog;
  const plaques = plaqueLog;
  const bells = bellLog;
  looLog = null;
  glowLog = null;
  pipeLog = null;
  plaqueLog = null;
  bellLog = null;
  looLog = null;
  bedLog = null;
  return {
    f, u: cu, v: cv, dir: [dc[0], dc[1], dc[2]],
    reach,
    bells,
    houses: doors.length, doors,
    glow: glowSpots,
    // the fountain on the green, and the cell its water comes out of
    jet,
    gates,
    // What this place is called, and where it says so. The name is derived
    // from the cell and the seed — see placeName — so it costs nothing to
    // carry and is the same on every machine in the world.
    name: placeName(cult.id, f, cu, cv, planet.seed ?? 0),
    signs,
    // Every bed this settlement has. The population it can hold is the length
    // of this list — see main.js's pairing — so a village that wants to grow
    // has to build more of them, and a woman put to work on it does exactly
    // that. Player-laid beds are added to the nearest village's list when they
    // are placed, so a house you build yourself counts.
    beds,
    // Every fenced allotment this settlement has, and the only ground a
    // farmhand may put a hoe in — see findField in work.js. A field is the
    // one thing a village grows that has a boundary, and a village that
    // could not say where its boundaries were had its people tilling the
    // green, the verge and the gap between two houses. The list is added to
    // at runtime when the hands mark out a new one, which is why it is a
    // record and not a getter.
    farms,
    // The throne. entities.js puts the chief on it — see populate — so he is
    // sitting in his hall the moment the world opens rather than walking a
    // circuit of the green like everybody else.
    seat: hallSeat,
    // the two men on the arch — see doorPosts
    posts: hallPosts,
    // Every toilet this settlement has, for the six-hourly walk — see
    // tryLoo in entities.js. Added to at runtime when the player puts one
    // down, on the same terms as the beds.
    loos,
    // ...and every water pipe, so the smoke off them can be hung on and taken
    // off the cells as the player walks — see the café house.
    pipes,
    // ...and every lettered plaque, which main.js hangs a canvas on — see the
    // plaques above, and buildVillageSigns there.
    plaques,
  };
}

// Places villages and records their centres on planet.villageSites, which
// entities.js uses to decide where villagers live. Each site also carries a
// `doors` list ({f,u,v,h,du,dv,dir}) so villagers can be given somewhere to
// walk to.
// --- the fen village --------------------------------------------------------
//
// Terran floods about an eighth of its surface now, so there are real lakes on
// it — and the one thing the street machinery above cannot do is build on
// water. `survey` refuses any plot with water standing over the ground, which
// is right for a village of houses with gardens and wrong for people who live
// on a lake.
//
// So this is its own builder rather than a layout. It shares everything above
// the floor — the walls, the roof, the loft, the furniture, the door all come
// from the same functions every other house uses — and differs entirely below
// it: there is no cut and fill, no plinth and no ground. A hut stands on posts
// driven into the bed, and what joins them is a plank walk rather than a lane.
//
// That is true of the huts and it is NOT true of the shop, which these people
// went without for years because a builder with no street was assumed to owe
// no frontage. It owes the counter anyway — see `buildFenVillage` — so one of
// the plots along the walk is the shop's, and the one thing under it is a
// stone pier with the stockroom cut out of the middle of it. See `quay`.

const FEN = {
  reach: 13,        // cells from the centre the survey looks
  minWet: 0.6,      // fraction of that disc that has to be water
  minDeep: 1,       // shallowest bed the posts are worth driving into
  maxDeep: 6,       // ...and the deepest, before it is a lake not a shallows
  span: 12,         // how far the walk runs either way from the centre
  huts: 6,          // how many it tries to stand along it
};

// The water surface of a wet column, or -1 if the column is dry. Walks up from
// the bed rather than trusting the sea level, because a lake sitting in a
// hollow is at its own height and the polar cap has a lid on it.
function waterTop(planet, f, u, v) {
  const bed = groundTop(planet, f, u, v);
  if (bed < 0) return -1;
  let h = bed + 1;
  if (planet.get(f, u, v, h) !== BLOCK.WATER) return -1;
  while (h + 1 < H && planet.get(f, u, v, h + 1) === BLOCK.WATER) h++;
  // A polar lake has a lid on it: the topmost cell of a frozen column is ICE
  // rather than water, so the walk above stops one course under it. Building
  // there would put the whole village inside the ice — and people who live on
  // a lake do not choose the one that freezes over.
  if (h + 1 < H && planet.get(f, u, v, h + 1) === BLOCK.ICE) return -1;
  return h;
}

// Is this a lake worth building on? Wanted: mostly water, of a depth posts can
// reach, with dry land somewhere in sight — a hut on the open sea is a
// shipwreck, and the whole charm of a fen village is that it has a shore.
function fenSite(planet, f, cu, cv) {
  const R = FEN.reach;
  if (cu < MARGIN || cv < MARGIN || cu > S - MARGIN || cv > S - MARGIN) return null;
  let wet = 0, n = 0, shore = false, sum = 0;
  for (let du = -R; du <= R; du += 2) {
    for (let dv = -R; dv <= R; dv += 2) {
      if (du * du + dv * dv > R * R) continue;
      const u = cu + du, v = cv + dv;
      n++;
      const top = waterTop(planet, f, u, v);
      if (top < 0) { shore = true; continue; }
      const bed = groundTop(planet, f, u, v);
      const deep = top - bed;
      if (deep < FEN.minDeep || deep > FEN.maxDeep) continue;
      wet++; sum += top;
    }
  }
  if (!shore || !n || wet / n < FEN.minWet) return null;
  // TWO courses over the water, not one. At one the deck sits straight on the
  // surface and every post is submerged, so the village reads as huts floating
  // on a pond; at two there is a course of bare timber showing above the
  // waterline and you can see what the place is standing on, which is the
  // entire point of building it this way.
  const deck = Math.round(sum / wet) + 2;
  if (deck + 12 >= H) return null;
  return { f, cu, cv, deck };
}

// Is this footprint standing on the lake rather than beside it? Two tests,
// and both matter: enough of it has to be water, and NONE of it may have
// ground reaching the deck — a hut with the bank coming up through its floor
// is a hut somebody built on the shore and called a stilt house.
function overWater(planet, f, u0, v0, w, d, deck) {
  let wet = 0, n = 0;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      if (u < 2 || v < 2 || u >= S - 2 || v >= S - 2) return false;
      const bed = groundTop(planet, f, u, v);
      if (bed < 0 || bed >= deck) return false;
      n++;
      if (waterTop(planet, f, u, v) >= 0) wet++;
    }
  }
  return n > 0 && wet >= n * 0.8;
}

// Posts from the bed up to the deck. This is the whole idea of the place, so
// they are LOG rather than the slim POST: you are meant to see what the
// village is standing on when you swim under it.
function stilt(planet, f, u, v, deck) {
  const bed = groundTop(planet, f, u, v);
  if (bed < 0 || bed >= deck) return false;
  for (let h = bed + 1; h < deck; h++) planet.set(f, u, v, h, BLOCK.LOG);
  return true;
}

// A deck: planks at `deck`, on posts at its corners and every third cell round
// its edge. Everything in this village stands on one of these.
function platform(planet, f, u0, v0, w, d, deck, mat = BLOCK.PLANK) {
  let laid = 0;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      if (u < 1 || v < 1 || u >= S - 1 || v >= S - 1) continue;
      // Where the bed has risen to meet the deck we are on the bank, and a
      // plank laid into a hillside is not a jetty. Stopping here is what
      // makes the walk run out at the shore on its own, with no separate
      // idea of where the shore is.
      if (groundTop(planet, f, u, v) >= deck) continue;
      planet.set(f, u, v, deck, mat);
      laid++;
      for (let h = deck + 1; h <= deck + 8 && h < H; h++)
        planet.set(f, u, v, h, BLOCK.AIR);
      // A post every third cell round the edge. The first pass asked for BOTH
      // indices to land on three, which on a three-wide walk is one rail only
      // and on a seven-wide deck is four corners — the village came out
      // hanging in the air. Summing the two indices puts one on every edge.
      const edge = u === u0 || v === v0 || u === u0 + w - 1 || v === v0 + d - 1;
      if (edge && ((u - u0 + v - v0) % 3 === 0)) stilt(planet, f, u, v, deck);
    }
  }
  return laid;
}

// A GAP IN THE RAIL, where a spur leaves the walk — and it has to be cut
// BEFORE the spur's planks go down, which is not a tidiness question.
// `platform` refuses any column whose ground has already risen to the deck,
// and a rail standing on the line reads as exactly that: the boards never went
// down under it, and every spur in every fen village has been coming out with
// two of its three planks missing ever since. Cut the rail, then lay them.
//
// Only the RAIL, though. The lamps stand on this same line and are posted on
// the same spacing, so "clear the course" would have taken out the light down
// one whole side of the jetty to widen three doorsteps. A lamp is a thing to
// walk round; a fence is a thing to walk through.
function railGap(planet, f, u0, v, deck) {
  for (let u = u0; u < u0 + 3; u++) {
    if (planet.get(f, u, v, deck + 1) === B.FENCE) {
      planet.set(f, u, v, deck + 1, BLOCK.AIR);
    }
  }
}

// A PRIVY ON THE WATER. The same deck-on-posts a hut stands on, three by
// three, with a pan in the one cell inside it and WC over the door — which is
// what an outhouse is, and over a lake it is what an outhouse has always been.
//
// It takes a plot the way the shop does, and for the same kind of reason. A
// fen hut rolls for a toilet on `furnish`'s own coin toss like every other
// house in the game, and on a village of three huts that toss loses more often
// than it wins: ten of thirty-six settlements on a radius-156 world had no
// toilet anywhere in them. A village is a hut down and a privy up, and that is
// a trade worth making.
const FEN_PRIVY = 3;
function fenPrivy(planet, f, u0, v0, deck, side, vern, doors) {
  const p = { f, u0, v0, w: FEN_PRIVY, d: FEN_PRIVY, base: deck, ax: 0, side };
  platform(planet, f, u0 - 1, v0 - 1, FEN_PRIVY + 2, FEN_PRIVY + 2, deck);
  const c = wallCell(p, side);
  // two cells of headroom and a ceiling, for the reason the land privy
  // gives: nobody may stand on the pan
  storey(planet, p, deck + 1, deck + 3, vern, {
    light: 0, skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  const tu = u0 + 1, tv = v0 + 1;      // the one cell inside a three by three
  planet.set(f, tu, tv, deck + 3, BLOCK.PLANK);
  const facing = c.du > 0 ? 1 : c.du < 0 ? 0 : c.dv > 0 ? 3 : 2;
  const pan = toilet(facing);
  if (pan != null && planet.get(f, tu, tv, deck + 1) === BLOCK.AIR) {
    planet.set(f, tu, tv, deck + 1, pan);
    logLoo(f, tu, tv, deck + 1, facing);
  }
  roof(planet, p, deck + 4, vern);
  const door = carveDoor(planet, p, side, deck, vern, 1, 2);
  plaque(planet, f, door, 'WC', deck);
  (planet.houseList ??= []).push({
    kind: 'privy', f, u0, v0, base: deck, w: FEN_PRIVY, d: FEN_PRIVY,
    hgt: roofNeed(4, FEN_PRIVY), design: false, home: false,
  });
  const entry = doorEntry(planet, f, door);
  if (entry) doors.push(entry);
  return entry;
}

// One hut: a deck on posts, then the ordinary walls, loft, hearth, furniture,
// roof and door every other house in the game is built from.
function fenHut(planet, f, u0, v0, w, d, deck, side, vern, rand, doors) {
  const p = { f, u0, v0, w, d, base: deck, ax: 0, side };
  platform(planet, f, u0 - 1, v0 - 1, w + 2, d + 2, deck);
  const c = wallCell(p, side);
  storey(planet, p, deck + 1, deck + 5, vern, {
    skip: { side, at: side < 2 ? c.u : c.v, half: 1 },
  });
  loft(planet, p, deck + 4, vern);
  furnish(planet, p, deck, vern, rand, { side });
  hearth(planet, p, deck, vern, rand() < 0.5);
  planet.set(f, u0 + 1, v0 + d - 2, deck + 5, vern.light);
  glow(f, u0 + 1, v0 + d - 2, deck + 5);
  roof(planet, p, deck + 6, vern);
  houseChest(planet, f, u0 + 1, v0 + 1, deck + 1);
  const door = doorEntry(planet, f, carveDoor(planet, p, side, deck, vern));
  if (door) doors.push(door);
}

// THE QUAY: the one foundation in a village that has none.
//
// A hut on the lake stands on posts and has nothing under its floor, which is
// exactly what a shop cannot do — the stockroom goes UNDER the counter, and a
// room slung between four sticks is a crate, not a cellar. So the shop's
// footprint is filled from the lake bed up to the boards and `cellar` then
// hollows its room out of the middle of that, the same way it cuts one out of
// a hillside anywhere else. What is left standing in the water is a stone pier
// with a room inside it: the village's money and its goods are the only things
// here that are not resting on a stick, and you can see that from the shore.
function quay(planet, f, u0, v0, w, d, deck, vern) {
  const mat = vern.masonry ?? BLOCK.COBBLE;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const bed = groundTop(planet, f, u, v);
      if (bed < 0) continue;
      for (let h = bed + 1; h < deck; h++) planet.set(f, u, v, h, mat);
    }
  }
}

// The counter, on the water. Everything above the boards is the ordinary shop
// — same walls, same door, same tables, same man behind them, same room of
// boxes underneath, same press — and everything below them is the fen: a pier
// where the cut and fill would be, and a deck one cell proud of the walls all
// round so the two on the door have somewhere to stand.
function fenShop(planet, f, u0, v0, w, d, deck, side, vern, rand, doors) {
  const p = { f, u0, v0, w, d, base: deck, ax: 0, side };
  quay(planet, f, u0, v0, w, d, deck, vern);
  platform(planet, f, u0 - 1, v0 - 1, w + 2, d + 2, deck);
  const shopped = planet.shopList?.length ?? 0;
  const door = doorEntry(planet, f, shop(planet, p, side, vern, rand,
    { afloat: true }));
  if (door) doors.push(door);
  (planet.houseList ??= []).push({
    kind: 'shop', f, u0, v0, base: deck, w, d,
    hgt: roofNeed(6, d), design: false, home: false,
  });
  return planet.shopList?.[shopped] ?? null;
}

// THE CHIEF'S HUT, and the reason it exists is that he had nowhere at all.
//
// spawnChief puts a man ON a throne when his village records a `seat`, and
// falls back to scattering him round the village centre when it does not. A
// fen village records none — it lays huts and a counter and no hall — so the
// chief of every lake settlement on every world was dropped onto the middle
// of the plank walk, standing in the street in his crown with the boats going
// past. A settlement with a chief and nowhere to put him is a settlement whose
// most important building is missing.
//
// It is a hut, because that is what these people build, and it is the hall,
// because that is what it is for: seven across so a three-wide arch centres on
// it, enclosed and roofed, one step of a dais at the far end with the throne
// on it, and the way in an OPEN ARCH with jambs and a lintel and no leaf hung
// in it. That last part is the doctrine and not a detail — a court you have to
// work a latch to get into is not one.
//
// The dais is BOARDS. Every other hall in the game steps its throne up in
// dressed stone, and there is no stone in a fen village: nothing here rests on
// anything but sticks, which is the whole look of the place.
function fenHall(planet, f, u0, v0, w, d, deck, side, vern, rand, doors) {
  const p = { f, u0, v0, w, d, base: deck, ax: 0, side };
  platform(planet, f, u0 - 1, v0 - 1, w + 2, d + 2, deck);
  const top = deck + 6;
  storey(planet, p, deck + 1, top, vern);
  // The floor, and one step of it at the far end for the throne to stand on.
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) planet.set(f, u, v, deck, BLOCK.PLANK);
  }
  const mid = u0 + (w >> 1);
  // THE THRONE STANDS OPPOSITE THE ARCH, and which wall that is depends on
  // which side of the walk the plot is on. A hut on the shore side of the
  // boards opens toward them and a hut on the far side opens back at them —
  // `side` is already that answer (0 is -v, 1 is +v), and getting this wrong
  // is not a cosmetic error: carveDoor cut its three-wide arch straight
  // through the chair, and the chief sat in a hole in his own wall.
  const back = side === 1 ? v0 : v0 + d - 1;    // the wall he sits against
  const step = side === 1 ? 1 : -1;             // ...and the way the room runs
  // Facing names the side the seat's BACK stands on: 2 is +v, 3 is -v. Get it
  // the wrong way round and he holds court with his back to the room.
  const facing = side === 1 ? 3 : 2;
  const seatH = deck + 2;
  // One step of a dais, in BOARDS. Every other hall in the game steps its
  // throne up in dressed stone and there is no stone in a fen village.
  for (let u = u0 + 1; u < u0 + w - 1; u++) {
    planet.set(f, u, back, deck + 1, BLOCK.PLANK);
    planet.set(f, u, back + step, deck + 1, BLOCK.PLANK);
  }
  planet.set(f, mid, back, seatH, chair(facing));
  for (const du of [-2, 2]) {
    if (mid + du <= u0 || mid + du >= u0 + w - 1) continue;
    planet.set(f, mid + du, back, seatH, vern.light);
    glow(f, mid + du, back, seatH);
  }
  // The desk he reads from, at the foot of the step and facing the room, and
  // a table down one side for the business of a hall.
  planet.set(f, mid, back + step * 3, deck + 1, BLOCK.LECTERN);
  for (let k = 1; k <= 2; k++) {
    planet.set(f, u0 + 1, back + step * k, deck + 1, BLOCK.TABLE);
  }
  roof(planet, p, top, vern);
  const arch = doorEntry(planet, f,
    carveDoor(planet, p, side, deck, { ...vern, door: false }, 3, 3));
  if (arch) {
    arch.posts = doorPosts(planet, arch, 3);
    doors.push(arch);
  }
  (planet.houseList ??= []).push({
    kind: 'hall', f, u0, v0, base: deck, w, d,
    hgt: roofNeed(6, d), design: false,
    // A court, not a bedroom: nobody sleeps in here and nobody may lay a bed.
    chief: true, home: false,
  });
  // `gaze` is the cell he looks at, because spawnChief's default assumes the
  // land hall's layout — door on the -v side of the throne — and half of
  // these are the other way round.
  return { f, u: mid, v: back, h: seatH, u0, v0, w, d, base: deck,
    gaze: { u: mid, v: back + step } };
}

// The village: a plank walk out over the shallows with huts down both sides, a
// mooring at the end of it, and a boat tied up.
function buildFenVillage(planet, f, cu, cv, rand, cult) {
  const site = fenSite(planet, f, cu, cv);
  if (!site) return null;
  const { deck } = site;
  const vern = cult.fen ?? cult.verns[0];
  glowLog = [];
  pipeLog = [];
  plaqueLog = [];
  bedLog = [];
  bellLog = [];
  // ...AND THE TOILETS, which this builder has been throwing on the floor
  // since the day they existed. `fenHut` calls `furnish` like every other
  // house in the game, so a fen hut rolls for a privy of its own on exactly
  // the same coin toss — but `looLog` was left pointing at whatever the last
  // LAND village set, which buildVillage nulls on its way out. So every
  // toilet in every fen village on every world was written to nothing, and a
  // third of the settlements on a radius-156 world had nowhere at all to go.
  looLog = [];
  const doors = [];

  // the walk: three planks wide, running the long way over the water. If the
  // lake is not big enough to carry it, this is a puddle and not a fen.
  const u0 = cu - FEN.span, w = FEN.span * 2 + 1;
  // A jetty is meant to START on the bank — platform simply stops where the
  // ground rises, so what matters is how much of it ended up over water.
  if (platform(planet, f, u0, cv - 1, w, 3, deck, B.PATH) < w * 1.5) return null;
  // a rail down both sides, so it reads as a jetty rather than a raft
  for (let u = u0; u < u0 + w; u += 2) {
    planet.set(f, u, cv - 2, deck + 1, B.FENCE);
    planet.set(f, u, cv + 2, deck + 1, B.FENCE);
  }
  // lamps along it, every few paces
  for (let u = u0 + 4; u < u0 + w - 3; u += 8) {
    for (let k = 1; k <= 2; k++) planet.set(f, u, cv - 2, deck + k, B.POST);
    planet.set(f, u, cv - 2, deck + 3, vern.streetLight ?? B.STREET_LAMP);
    glow(f, u, cv - 2, deck + 3);
  }

  // The plots along the walk: alternating sides, low then high, marching away
  // from the shore. Written down once because the shop takes one of them and
  // has to land on the same grid the huts do — a counter squeezed into the
  // gaps between finished huts has no gaps to squeeze into, which is why the
  // first attempt at this built one on about a third of the lakes.
  const slot = (i, w, d) => {
    const low = (i & 1) === 0;
    const hw = w ?? 5 + ((i % 3 === 0) ? 2 : 0), hd = d ?? 5;
    return { low, hw, hd,
      hu: cu - FEN.span + 2 + Math.floor(i / 2) * (hw + 3),
      hv: low ? cv - 3 - hd : cv + 4 };
  };
  const fits = (s) => s.hu >= 3 && s.hv >= 3 && s.hu + s.hw <= S - 4
    && s.hv + s.hd <= S - 3
    // the deck of a building reaches a cell past its walls all round, so that
    // is the footprint the lake has to be under
    && overWater(planet, f, s.hu - 1, s.hv - 1, s.hw + 2, s.hd + 2, deck);

  // THE COUNTER GOES IN FIRST, and it takes a PLOT rather than the leftovers.
  //
  // A fen village is a named settlement with a chief and a chronicle, and it
  // was the one kind of settlement on the planet with nothing to sell over and
  // no till to sell it into: no shelf, no prices, no takings, and a chief whose
  // second aim — earn gold — could not be scored at all. "Every village gets a
  // shop" is not a rule the street layout happens to satisfy; it is the rule,
  // and a builder that lays no street still owes it.
  //
  // It is chosen from the MOORING end back toward the shore, because that is
  // where the boats tie up and where anybody who is not from here arrives; and
  // it is one cell deeper than a hut, which is what a counter with a room
  // under it costs. Whichever hut it displaces, the village is a hut down and
  // a shop up, which is the trade every other settlement on the planet makes.
  const SHOP_W = 7, SHOP_D = 6;
  let shopSlot = -1;
  for (let i = FEN.huts - 1; i >= 0 && shopSlot < 0; i--) {
    if (fits(slot(i, SHOP_W, SHOP_D))) shopSlot = i;
  }
  const shopRect = shopSlot < 0 ? null : (() => {
    const s = slot(shopSlot, SHOP_W, SHOP_D);
    return { u0: s.hu, v0: s.hv, w: s.hw, d: s.hd };
  })();

  // ...AND THE HALL, on the same terms. It is chosen from the SHORE end
  // outward, the opposite way round from the counter: the counter belongs at
  // the mooring where the boats come in, and the man who runs the place
  // belongs at the end you walk in from. Same width as the shop so its arch
  // centres, one cell shallower because it has no cellar to carry.
  const HALL_W = 7, HALL_D = 5;
  let hallSlot = -1;
  for (let i = 0; i < FEN.huts && hallSlot < 0; i++) {
    if (i === shopSlot) continue;
    const s = slot(i, HALL_W, HALL_D);
    if (!fits(s)) continue;
    if (shopRect && overlaps([shopRect], s.hu, s.hv, s.hw, s.hd, 1)) continue;
    hallSlot = i;
  }
  const hallRect = hallSlot < 0 ? null : (() => {
    const s = slot(hallSlot, HALL_W, HALL_D);
    return { u0: s.hu, v0: s.hv, w: s.hw, d: s.hd };
  })();

  // ...and a plot for the privy, chosen from the SHORE end outward, which is
  // the opposite end from the counter: nobody's front door should be the last
  // thing on the walk before it. Three by three, so it fits where a hut will
  // not.
  let privySlot = -1;
  for (let i = 0; i < FEN.huts && privySlot < 0; i++) {
    if (i === shopSlot || i === hallSlot) continue;
    const s = slot(i, FEN_PRIVY, FEN_PRIVY);
    if (!fits(s)) continue;
    if (shopRect && overlaps([shopRect], s.hu, s.hv, s.hw, s.hd, 1)) continue;
    if (hallRect && overlaps([hallRect], s.hu, s.hv, s.hw, s.hd, 1)) continue;
    privySlot = i;
  }

  // the huts, on every other plot
  let made = 0;
  for (let i = 0; i < FEN.huts; i++) {
    if (i === shopSlot || i === hallSlot || i === privySlot) continue;
    const s = slot(i);
    // ...and never through the shop or the hall: both plots are wider and
    // deeper than the hut whose place they took, so the neighbour on that
    // side can foul them
    if (shopRect && overlaps([shopRect], s.hu, s.hv, s.hw, s.hd, 1)) continue;
    if (hallRect && overlaps([hallRect], s.hu, s.hv, s.hw, s.hd, 1)) continue;
    if (!fits(s)) continue;
    // a spur off the walk to the hut's door, through a gap cut in the rail —
    // see the shop's below for why the cut has to come first. Two planks in
    // every three were missing from these for as long as they have existed,
    // which is a hut you leave by the one cell the rail happened to miss.
    const side = s.low ? 1 : 0;            // the wall the walk is on
    const hspu = s.hu + (s.hw >> 1) - 1;
    railGap(planet, f, hspu, s.low ? cv - 2 : cv + 2, deck);
    for (let k = 0; k < 4; k++) {
      const v = s.low ? cv - 2 - k : cv + 2 + k;
      platform(planet, f, hspu, v, 3, 1, deck, B.PATH);
    }
    fenHut(planet, f, s.hu, s.hv, s.hw, s.hd, deck, side, vern, rand, doors);
    made++;
  }
  // fewer than three roofs is a shed on a pond — and the counter is a roof,
  // and so is the hall
  if (made + (shopSlot < 0 ? 0 : 1) + (hallSlot < 0 ? 0 : 1) < 3) return null;

  // the mooring at the far end: posts to tie up to, and a chest of tackle
  const mu = u0 + w - 2;
  for (const v of [cv - 2, cv + 2]) {
    for (let k = 1; k <= 2; k++) planet.set(f, mu, v, deck + k, B.POST);
  }
  planet.set(f, mu, cv, deck + 1, B.CHEST);

  // ...and the hall on the plot that was kept for it, with its spur off the
  // walk through a gap in the rail, exactly like a hut's.
  let fenSeat = null;
  if (hallSlot >= 0) {
    const s = slot(hallSlot, HALL_W, HALL_D);
    const hpu = s.hu + (HALL_W >> 1) - 1, hrv = s.low ? cv - 2 : cv + 2;
    railGap(planet, f, hpu, hrv, deck);
    for (let k = 0; k < 4; k++) {
      const v = s.low ? cv - 2 - k : cv + 2 + k;
      platform(planet, f, hpu, v, 3, 1, deck, B.PATH);
    }
    fenSeat = fenHall(planet, f, s.hu, s.hv, HALL_W, HALL_D, deck,
      s.low ? 1 : 0, vern, rand, doors);
  }

  // ...and the privy on the plot that was kept for it, with the same spur off
  // the walk through the same gap in the rail every other door here gets — a
  // toilet you have to climb a rail to reach is a toilet nobody queues for.
  if (privySlot >= 0) {
    const s = slot(privySlot, FEN_PRIVY, FEN_PRIVY);
    const ppu = s.hu + (FEN_PRIVY >> 1) - 1, prv = s.low ? cv - 2 : cv + 2;
    railGap(planet, f, ppu, prv, deck);
    for (let k = 0; k < 4; k++) {
      const v = s.low ? cv - 2 - k : cv + 2 + k;
      platform(planet, f, ppu, v, 3, 1, deck, B.PATH);
    }
    fenPrivy(planet, f, s.hu, s.hv, deck, s.low ? 1 : 0, vern, doors);
  }

  // ...and the shop on the plot that was kept for it.
  let fenShopEntry = null;
  if (shopSlot >= 0) {
    const s = slot(shopSlot, SHOP_W, SHOP_D);
    // the spur from the walk to its door, through the same gap in the rail
    const spu = s.hu + (SHOP_W >> 1) - 1, rv = s.low ? cv - 2 : cv + 2;
    railGap(planet, f, spu, rv, deck);
    platform(planet, f, spu, rv, 3, 1, deck, B.PATH);
    fenShopEntry = fenShop(planet, f, s.hu, s.hv, SHOP_W, SHOP_D, deck,
      s.low ? 1 : 0, vern, rand, doors);
  }

  // ...AND THE PRESS, which now rides in on the shop's guarantee the way it
  // does in every other settlement: `shop` puts one behind its own counter, so
  // a fen village with a counter has a mint without anybody asking for one.
  //
  // The jetty press stays as the fallback, for the lake too small or too
  // crowded to take a shop. It goes where their trade happens without one: on
  // the boards at the landing, beside the tackle chest, where a boat ties up —
  // on the walk's EDGE, never its middle, because three planks wide is the
  // whole street these people own and a coining press in the middle of it is a
  // village whose own people cannot get home.
  let fenMint = fenShopEntry?.mint ?? null;
  for (const [du, dv] of fenMint ? []
    : [[-1, 1], [-1, -1], [-2, 1], [-2, -1], [-3, 1], [-3, -1]]) {
    const mv = cv + dv, muu = mu + du;
    const under = planet.get(f, muu, mv, deck);
    if (under === BLOCK.AIR || under === BLOCK.WATER) continue;
    if (planet.get(f, muu, mv, deck + 1) !== BLOCK.AIR) continue;
    planet.set(f, muu, mv, deck + 1, B.MINT);
    fenMint = { u: muu, v: mv, h: deck + 1 };
    break;
  }

  const dir = dirFromCell(f, cu + 0.5, cv + 0.5, [0, 0, 0]);
  const out = {
    f, u: cu, v: cv, dir: [dir[0], dir[1], dir[2]],
    houses: doors.length, doors, glow: glowLog, beds: bedLog, fen: true,
    loos: looLog, pipes: pipeLog, plaques: plaqueLog,
    mint: fenMint,
    // Where the throne is, so spawnChief puts the man ON it instead of on the
    // walk outside. Null on a lake too small or too crowded to take a hall,
    // and then he stands in the street as he always did — which is a fen
    // village that could not afford a court, not a bug.
    seat: fenSeat,
    name: placeName(`${cult.id}`, f, cu, cv, (planet.seed ?? 0) ^ 0x5e17),
    bells: bellLog,
  };
  glowLog = null;
  pipeLog = null;
  plaqueLog = null;
  bedLog = null;
  bellLog = null;
  return out;
}

// --- villages that grow ------------------------------------------------------
//
// Nothing in the world changed on its own except the sky. A village that is
// the same village on the hundredth day as on the first is a diorama, and the
// cheapest possible cure is one more house every day or so.
//
// THE RULE THIS HAS TO OBEY. The planet is a pure function of (radius, seed,
// preset) plus the edit diff, and nothing ever stores or ships blocks. So
// growth is NOT an edit: it is a pure function of (seed, day), computed
// identically on every machine from a clock the server already shares. A
// player who joins on day nine gets the day-nine village because they build
// days one to nine on load, not because anybody sent them a house.
//
// That also means growth costs nothing to save and nothing to transmit, and
// two people standing in a village watch the same house go up.

const GROWTH = {
  perDay: 1,       // houses a village adds per whole day of world time
  cap: 5,          // ...and the most it will ever add. A hamlet becomes a
  //                  village; it does not become a town while your back is
  //                  turned, and the cap is what stops a long game turning
  //                  every settlement into one continuous suburb.
  ring: 14,        // blocks out from the green the first new plot goes
  step: 5,         // ...and how much further out each later one is
  tries: 26,       // candidate directions per house before giving up
};

// The plot for the nth house a village grows: out beyond the existing ones,
// on a hashed bearing so the settlement spreads round its green rather than
// growing a spur in one direction.
// --- keeping houses apart ------------------------------------------------------
//
// A HOUSE STANDS THREE CLEAR CELLS FROM THE LAST ONE. `survey` refuses ground
// that is not natural, so a plot never lands ON a house — but nothing stopped
// it landing against one, gable to gable, with a garden fence pressed to the
// neighbour's wall and no way to walk between them. Every building the
// generator has written down (`planet.houseList`, which is what a bed-maker
// and a chief count roofs off) keeps this much street round it, and so does
// anything still going up, which the caller passes in because a rising plot
// is not on the list until its last block is laid.
export const HOUSE_GAP = 3;
export function clearOfHouses(planet, f, u0, v0, w, d, also = null,
  gap = HOUSE_GAP) {
  const hit = (h) => h && h.f === f
    && u0 < h.u0 + h.w + gap && u0 + w + gap > h.u0
    && v0 < h.v0 + h.d + gap && v0 + d + gap > h.v0;
  for (const h of planet.houseList ?? []) if (hit(h)) return false;
  for (const h of also ?? []) if (hit(h)) return false;
  return true;
}

function growPlot(planet, site, n, len, dep) {
  const f = site.f;
  const reach = GROWTH.ring + n * GROWTH.step;
  for (let t = 0; t < GROWTH.tries; t++) {
    // golden angle, offset by the village's own cell, so two villages on one
    // world do not grow in step with each other
    const a = (n * 2.39996323 + t * 0.7 + site.u * 0.013 + site.v * 0.017);
    const du = Math.round(Math.cos(a) * (reach + t * 1.5));
    const dv = Math.round(Math.sin(a) * (reach + t * 1.5));
    const u0 = site.u + du - (len >> 1);
    const v0 = site.v + dv - (dep >> 1);
    if (!clearOfHouses(planet, f, u0, v0, len, dep)) continue;
    const p = survey(planet, f, u0, v0, len, dep, roofNeed(6, len));
    if (p) return p;
  }
  return null;
}

// Build every house this village should have by `day`, and no more. Returns
// the plots it built, so the caller can tell the mesher what changed.
//
// Idempotent by construction: `site.grown` is how many it has already put up,
// so calling this every frame does nothing until the day rolls over.
// --- watching one go up -------------------------------------------------------
//
// Every builder in this file writes through `planet.set` and nothing else, so
// wrapping that one method for the length of one house captures exactly what
// that house is, in the order it was laid, and nothing else at all.
//
// The recording is then REWOUND — every cell put back to what it held — and
// handed to the caller as a script. main.js plays it forward a few blocks a
// second with people standing on the plot, which is the whole of "you can
// watch a house being built". Nothing about the house changes: it is the same
// deterministic building, arriving over a minute instead of in a frame.
function recordBuild(planet, fn) {
  const own = Object.prototype.hasOwnProperty.call(planet, 'set');
  const real = planet.set;
  const writes = [];
  planet.set = function (f, u, v, h, b) {
    const was = planet.get(f, u, v, h);
    if (was !== b) writes.push(f, u, v, h, b, was);
    return real.call(planet, f, u, v, h, b);
  };
  try { fn(); } finally {
    if (own) planet.set = real; else delete planet.set;
  }
  // rewind, last write first, so a cell written twice ends on what it held
  // before the first of them
  for (let i = writes.length - 6; i >= 0; i -= 6) {
    real.call(planet, writes[i], writes[i + 1], writes[i + 2], writes[i + 3],
      writes[i + 5]);
  }
  return writes;
}

function growSite(planet, site, seed, day, out, budget, stage, afford) {
  if (site.serai || site.fen) return;          // a halt and a jetty do not sprawl
  const want = Math.min(GROWTH.cap, Math.floor(day * GROWTH.perDay));
  if ((site.grown ?? 0) >= want) return;
  if (out.length >= budget) return;            // out of frame; next time
  const cult = cultureFor(planet);
  const vern = vern3(planet, cult.verns[0]);
  for (let n = site.grown ?? 0; n < want; n++) {
    // One stream per house, from the seed and the village and the index, so
    // the same house is built on every machine and rebuilding day four never
    // moves the house from day two.
    const rand = mulberry32((seed ^ 0x9e0117) + n * 2654435761
      + site.f * 8191 + site.u * 92837 + site.v * 68927);
    const a = pickArchetype(rand, 1 + (n % 2));
    const p = growPlot(planet, site, n, a.len, a.dep);
    if (!p) { site.grown = n + 1; continue; }  // no ground: skip this one
    // CAN THE VILLAGE PAY FOR IT? A house is planks and bricks and thatch,
    // and somebody had to stand at a bench and make them — see MATERIALS in
    // js/work.js. If the shelf is short, the plot WAITS: `grown` is not
    // advanced, so the same house is offered again next time somebody looks,
    // and the village builds it the day it can afford to.
    //
    // The plot is still derived — the same house on the same ground on every
    // machine. What is not derived is whether these people managed to build
    // it, and that is a record, which is exactly the split the ledger is on.
    if (afford && !afford(site, { w: p.w, d: p.d, kind: a.name, n })) return;
    site.grown = n + 1;
    p.ax = 0;
    const side = Math.floor(rand() * 4);
    p.side = side;
    glowLog = site.glow ?? [];
    bedLog = site.beds ??= [];
    looLog = site.loos ??= [];
    pipeLog = site.pipes ??= [];
    plaqueLog = site.plaques ??= [];
    // Somewhere the player could actually watch it happen? Then the house is
    // recorded and rewound rather than raised, and the caller plays it out.
    // Everywhere else it simply goes up, because a half-built house nobody is
    // standing near is only a house that has not finished loading.
    const watched = stage ? stage(site.f, p.u0, p.v0, p.w, p.d) : false;
    let door = null;
    const bm = bedMark();
    const writes = watched
      ? recordBuild(planet, () => { door = a.build(planet, p, side, vern, rand); })
      : (door = a.build(planet, p, side, vern, rand), null);
    const entry = doorEntry(planet, site.f, door);
    if (entry) (site.doors ??= []).push(entry);
    (planet.houseList ??= []).push({
      kind: a.name, f: site.f, u0: p.u0, v0: p.v0, base: p.base,
      w: p.w, d: p.d, hgt: roofNeed(6, a.len), design: false, grown: true,
      home: laidBed(bm), sleep: sleepsAt(),
    });
    glowLog = null;
    pipeLog = null;
    plaqueLog = null;
    bedLog = null;
    looLog = null;
    out.push({
      f: site.f, u0: p.u0 - 1, v0: p.v0 - 1, w: p.w + 2, d: p.d + 2,
      // where the builders stand, and the script they are working from
      base: p.base, kind: a.name, site,
      dir: dirFromCell(site.f, p.u0 + p.w / 2, p.v0 + p.d / 2),
      writes,
    });
    if (out.length >= budget) return;
  }
}

// ---- A HOUSE THE PLAYER ORDERED ----------------------------------------------
//
// growSite lays plots for a settlement the GENERATOR built: it surveys that
// village's own ring, rolls its own stream, and the result is derived — the
// same house on the same ground on every machine, rebuilt from scratch every
// load. A settlement you founded on a bell has none of that. It has no
// survey, no ring and no roll, which is why a hand told to build in one stood
// about saying "no house is going up": there was nothing to go up.
//
// This is the other door. You say WHERE — the plot you marked — and it looks
// for ground round that spot that will take a house, picks an archetype that
// fits, and hands back the same script growSite hands back. What it does NOT
// do is write anything: recordBuild rewinds every cell, and main.js plays the
// script forward through setBlock with your own people standing on the plot.
// That is the whole difference and it is the important one — a house you
// ordered is a record of what you did, so it goes in the diff and comes back
// with the world, where a village's own growth is re-derived.
//
// `seed` only has to differ between two houses; nothing about this is
// reproducible from the world's name, and it must not pretend to be.
// Kinds a player may order that a village never rolls: they live OUTSIDE the
// rank pools on purpose, because adding a name to HOUSES changes what every
// village on every existing world generates (see the rule at the foot of
// CLAUDE.md), and a player asking for a guard house must not do that.
const ORDERED_ONLY = [
  { name: 'guard house', len: 8, dep: 7, need: 18,
    build: (planet, p, side, vern, rand) => barracks(planet, p, 0, vern, rand),
    eave: 0 },
  // ...and the rooms a village keeps for itself, which a village of your
  // own has nobody to lay for it: the café with its two pipes and the old
  // man on one of them, the pub for a people that drinks, and the privy —
  // the one toilet a village has. Same builders the generator uses, so a
  // café you ordered is the café everybody else's village has.
  { name: 'café', len: CAFE_LEN, dep: CAFE_DEP, eave: 6, build: cafeHouse },
  { name: 'pub', len: PUB_LEN, dep: PUB_DEP, eave: 6, build: pub },
  { name: 'privy', len: PRIVY_LEN, dep: PRIVY_DEP, eave: 4, build: privy },
];

// The kinds a player may ask for by name — every coded archetype, because a
// player paying out of their own store may order the hall a village would
// only put up when it had earned one — and the ordered-only kinds after them.
export const houseKinds = () => [...HOUSES.map((h) => h.name),
  ...ORDERED_ONLY.map((h) => h.name)];

// WHAT A HOUSE OF YOURS IS MADE OF. The village's own vernacular is the
// default — a house you order looks like its neighbours — but the book lets
// you say otherwise: walls of planks, logs, bricks, cobble or dressed stone,
// and a roof of thatch, planks, bricks or cobble. The vernacular is a set
// of blocks the builders read, so a choice is a copy of it with those
// blocks swapped, and every builder from the cottage to the café obeys it.
export const HOUSE_WALLS = ['planks', 'logs', 'bricks', 'cobble', 'stone'];
export const HOUSE_ROOFS = ['thatch', 'planks', 'bricks', 'cobble'];
function vernWith(vern, mats) {
  if (!mats || (!mats.wall && !mats.roof)) return vern;
  const walls = {
    planks: BLOCK.PLANK, logs: BLOCK.LOG, bricks: B.BRICK ?? BLOCK.COBBLE,
    cobble: BLOCK.COBBLE, stone: BLOCK.STONE,
  };
  const roofs = {
    thatch: [MAT.THATCH, B.THATCH ?? BLOCK.PLANK], planks: [MAT.PLANK, BLOCK.PLANK],
    bricks: [MAT.BRICK, B.BRICK ?? BLOCK.COBBLE], cobble: [MAT.COBBLE, BLOCK.COBBLE],
  };
  const v = { ...vern, chose: mats };
  if (mats.wall && walls[mats.wall] != null) {
    v.wall = walls[mats.wall];
    v.upper = walls[mats.wall];
    // a stone or brick house sits on its own material; timber keeps the
    // cobble plinth it always had, which is what keeps its feet dry
    if (mats.wall === 'bricks' || mats.wall === 'cobble' || mats.wall === 'stone') {
      v.plinth = walls[mats.wall];
    }
  }
  if (mats.roof && roofs[mats.roof]) [v.roof, v.roofBlock] = roofs[mats.roof];
  return v;
}

export function markOutHouse(planet, f, cu, cv, seed = 1, want = null,
  mats = null, rising = null) {
  const cult = cultureFor(planet);
  const vern = vernWith(vern3(planet, cult.verns[0]), mats);
  const rand = mulberry32((seed * 2654435761 + f * 8191 + cu * 92837
    + cv * 68927) | 0);
  // A dwelling, not a church: rank 1 is the ordinary house row, which is what
  // somebody asking for "a house" means. Tried a few times because an
  // archetype that does not fit the ground you picked is not a reason to
  // refuse — the next one along may.
  // MANY TRIES, over a WIDE ring. `survey` is strict — it wants natural
  // ground under every cell of the footprint, no water, and the whole thing
  // within a few courses of level — and a player marking a plot is pointing
  // at a patch of countryside, not measuring it. Sixty candidates spiralling
  // out to twenty cells is the difference between "mark roughly here" and
  // "mark the one square the survey happens to accept".
  // A named kind wins the roll: sixty tries of the SAME archetype over the
  // same widening ring, because "a barn here" refused for want of flat
  // ground is better answered a step away than answered with a cottage.
  const asked = want
    ? HOUSES.find((x) => x.name === want)
      ?? ORDERED_ONLY.find((x) => x.name === want) ?? null
    : null;
  for (let t = 0; t < 60; t++) {
    const a = asked ?? pickArchetype(rand, 1);
    // spiral out from the cell you marked: the spot you stood on may be a
    // yard short of enough flat ground, and a house half a step away is the
    // house you asked for.
    const ang = t * 2.39996323;
    const rad = t === 0 ? 0 : 1.5 + t * 0.32;
    const u0 = cu + Math.round(Math.cos(ang) * rad) - (a.len >> 1);
    const v0 = cv + Math.round(Math.sin(ang) * rad) - (a.dep >> 1);
    // ...and never hard against a neighbour, standing or still going up
    if (!clearOfHouses(planet, f, u0, v0, a.len, a.dep, rising)) continue;
    const p = survey(planet, f, u0, v0, a.len, a.dep,
      a.need ?? roofNeed(6, a.len));
    if (!p) continue;
    p.ax = 0;
    const side = Math.floor(rand() * 4);
    p.side = side;
    glowLog = [];
    pipeLog = [];
    plaqueLog = [];
    bedLog = [];
    looLog = [];
    const bm = bedMark();
    let door = null;
    const writes = recordBuild(planet, () => {
      door = a.build(planet, p, side, vern, rand);
    });
    const glow = glowLog, beds = bedLog, loos = looLog, pipes = pipeLog;
    const plaques = plaqueLog;
    glowLog = null;
    pipeLog = null;
    plaqueLog = null;
    bedLog = null;
    looLog = null;
    return {
      f, u0: p.u0 - 1, v0: p.v0 - 1, w: p.w + 2, d: p.d + 2,
      base: p.base, kind: a.name,
      dir: dirFromCell(f, p.u0 + p.w / 2, p.v0 + p.d / 2),
      writes,
      // what main.js has to register once the script has played out
      house: {
        kind: a.name, f, u0: p.u0, v0: p.v0, base: p.base, w: p.w, d: p.d,
        hgt: roofNeed(6, a.len), design: false, grown: true,
        home: laidBed(bm), sleep: sleepsAt(),
      },
      door, glow, beds, loos, pipes, plaques,
    };
  }
  return null;
}

// Bring every village on this world up to `day`. Called once at load with the
// world's current day, and again whenever the day rolls over while you play.
// `budget` is how many houses this call may put up. A whole world catching up
// several days at once is a hundred buildings, and surveying and raising them
// all in one frame is a visible stall — so growth trickles in over as many
// frames as it needs. Returns { built, done }: `done` is false while there is
// still growing to do, and the caller keeps asking.
export function growVillages(planet, seed, day, budget = Infinity, stage = null,
  afford = null) {
  const out = [];
  if (!(day > 0)) return { built: out, done: true };
  let done = true;
  for (const site of planet.villageSites ?? []) {
    // A founded village is the player's own build: the generator laying
    // plots in it would be somebody else extending your house. A borough is
    // already a city — growth laying cottages in its avenues would be worse.
    if (site.founded || site.city) continue;
    // ...and a village with no bell has nobody to build for. See
    // unfoundVillage in main.js.
    if (site.unfounded) continue;
    growSite(planet, site, seed, day, out, budget, stage, afford);
    const want = Math.min(GROWTH.cap, Math.floor(day * GROWTH.perDay));
    if (!site.serai && !site.fen && (site.grown ?? 0) < want) done = false;
  }
  return { built: out, done };
}

// --- the peoples ------------------------------------------------------------
//
// Registered down here rather than beside VERNACULARS because a culture may
// name its own building functions, and those have to exist first. Everything
// above this line is written without knowing any of them.

// CINDER — the ash world. Fire, but no metal.
//
// The culture is mostly a SUBTRACTION, and that is what makes it read: no
// glass in the windows, no leaf on the doors, no lantern anywhere, and no
// chimney, because the fire is in the middle of the floor under a hole in the
// roof. What is left has to be built differently, and the ten coded
// archetypes come out as roundhouses without being told.
//
// The one thing it keeps is a rubble footing. Undressed stone under a mud
// wall is genuinely what these people build — it is dressed stone they cannot
// make — and without it every hut reads as sitting in a puddle.
culture('coal', {
  name: 'Cinder',
  // Cinder has no dye worth the name: black from the soot and brown off the animal.
  bed: [7, 8],
  fitting: 'hides',
  style: 'cone',          // no ridge beam: the roof closes in from every side
  glass: null,            // the openings are holes, framed but unglazed
  door: false,            // a hide over the gap, which is no block at all
  light: BLOCK.TORCH,     // the whole village after dark, in one field
  streetLight: BLOCK.TORCH,
  roomLight: BLOCK.TORCH,
  // A crenellated stone watchtower is the one archetype that would give the
  // game away: everything else comes out as a roundhouse in their materials,
  // but a tower is masonry however you paint it.
  drop: ['tower'],
  verns: [
    {
      name: 'hide',
      // Daub between the posts, on a footing of rubble. The trim is STRIPPED
      // timber and the frame is bark-on: three full rings of a building are
      // trim — the wall plate, the string course and the loft joists — so
      // making trim the same block as the frame buries the wall material
      // under its own timber, which is exactly what the first pass did.
      plinth: BLOCK.COBBLE, wall: BLOCK.CLAY, upper: BLOCK.CLAY,
      // Trim is daub too, not a sawn timber: three whole rings of a small
      // building are trim — the wall plate, the string course and the loft
      // joists — so a timber trim buries the daub under its own frame and
      // the hut comes out a log cabin. The posts at the corners are the only
      // structural timber that shows, which is what a roundhouse is.
      frame: BLOCK.LOG, trim: BLOCK.CLAY,
      quoinA: BLOCK.LOG, quoinB: BLOCK.LOG,
      board: BLOCK.LOG,          // a store is stacked timber, not sawn boards
      masonry: BLOCK.COBBLE,
      roof: MAT.THATCH, roofBlock: B.THATCH,
      hearth: null,       // null is what puts the fire in the middle
    },
  ],
  // Their public buildings. The stone circle takes the church's place on the
  // green; the mound takes the watchtower's. There is no shop and no library,
  // because there is no coin and no writing — a hamlet of this people is a
  // hamlet, and that is the whole point of letting a culture set this list.
  specials: () => [
    { name: 'stones', len: 9, dep: 9, eave: 0, need: 11, build: standingStones },
    // The trading post. These people mint nothing and write nothing down, so
    // it is not a shop of theirs — it is the hut they use to deal with
    // OUTSIDERS, and the coin that changes hands over the counter is the coin
    // you walked in with. A world you cannot buy a loaf on is a world with a
    // third of the game missing, and "they have no money of their own" is an
    // argument for a barter post rather than for nothing at all.
    //
    // Second in the list on purpose: the specials are laid in order until the
    // street runs out of frontage, and at the bottom of it only the biggest
    // Cinder villages ever got one.
    { name: 'barter', len: 7, dep: 6, eave: 6, build: shop },
    { name: 'lookout', len: 7, dep: 7, eave: 0, need: 15, build: lookoutMound },
    { name: 'longhouse', len: 11, dep: 6, eave: 6, build: hall },
    { name: 'store', len: 9, dep: 7, eave: 6, build: barn },
  ],
});

// THALASSA — the ocean world. Timber, paper and deep shade.
//
// One vernacular, because these people all build the same way, and the whole
// read is the ROOF: a wide overhang that steps out twice before it falls.
// That one grammar change lands on all ten archetypes at once, which is why
// it is worth more than any single new building would be.
//
// White panels between dark posts are the other half of it. Cement is the
// only genuinely flat, matte, strongly-coloured block in the game, and a flat
// white panel is exactly what a paper screen looks like from outside.
culture('ocean', {
  name: 'Thalassa',
  // Thalassa dyes with the sea's own indigo, and keeps white sheep.
  bed: [5, 0],
  fitting: 'alcove',
  style: 'eave',
  // The pagoda is this village's tall building; a crenellated stone
  // watchtower standing next to one is two answers to the same question.
  drop: ['tower'],
  eaves: 2,               // how far the lower step of the overhang reaches
  racks: 3,               // they live off the sea — see the drying racks
  // Shoji: a white panel, not a hole and not a pane of glass. It is opaque,
  // which is right — you cannot see through a paper screen either.
  glass: CS.cementId ? CS.cementId(0) : BLOCK.PLANK,
  verns: [
    {
      name: 'shoin',
      plinth: BLOCK.COBBLE,
      wall: CS.cementId ? CS.cementId(0) : BLOCK.PLANK,   // white plaster
      upper: BLOCK.PLANK,
      frame: CS.logId ? CS.logId(4) : BLOCK.LOG,          // dark timber posts
      trim: CS.plankId ? CS.plankId(3) : BLOCK.PLANK,     // acacia beams
      quoinA: CS.logId ? CS.logId(4) : BLOCK.LOG,
      quoinB: CS.logId ? CS.logId(4) : BLOCK.LOG,
      roof: MAT.COBBLE, roofBlock: BLOCK.COBBLE,          // grey tile
      hearth: BLOCK.COBBLE,
      board: CS.plankId ? CS.plankId(2) : BLOCK.PLANK,
      masonry: BLOCK.COBBLE,
    },
  ],
  // A shrine instead of a church, and a pagoda instead of a watchtower. The
  // smithy, shop and library stay: these people trade and read.
  specials: () => [
    { name: 'shrine', len: 9, dep: 9, eave: 6, need: 16, build: shrine },
    { name: 'pagoda', len: 7, dep: 7, eave: 0, need: 20, build: pagoda },
    { name: 'smithy', len: 7, dep: 6, eave: 6, build: smithy },
    { name: 'shop', len: 7, dep: 6, eave: 6, build: shop },
    { name: 'library', len: 9, dep: 7, eave: 6, build: library, minArm: 24 },
  ],
});

// RIME — the ice world. A village that shuts the weather out.
//
// Where Thalassa turns its face to the water, Rime turns its back on the
// cold. Red columns and white walls under grey tiles with a finial at each
// end of the ridge — and a courtyard house, which is the one plan in this
// file where a building faces INWARD.
culture('ice', {
  name: 'Rime',
  // Rime: undyed white, and the grey the flock comes in.
  bed: [0, 9],
  fitting: 'stove',
  style: 'sweep',
  eaves: 2,
  drop: ['tower'],       // the gatehouse is the tall building here
  finial: CS.cementId ? CS.cementId(1) : BLOCK.COBBLE,
  verns: [
    {
      name: 'vermilion',
      plinth: BLOCK.COBBLE,
      wall: CS.cementId ? CS.cementId(0) : BLOCK.PLANK,      // whitewash
      upper: CS.cementId ? CS.cementId(0) : BLOCK.PLANK,
      frame: CS.logId ? CS.logId(4) : BLOCK.LOG,             // dark timber
      trim: CS.plankId ? CS.plankId(4) : BLOCK.PLANK,
      quoinA: CS.cementId ? CS.cementId(1) : BLOCK.LOG,      // red corner posts
      quoinB: CS.cementId ? CS.cementId(1) : BLOCK.LOG,
      column: CS.cementId ? CS.cementId(1) : BLOCK.LOG,      // the one strong colour
      roof: MAT.COBBLE, roofBlock: BLOCK.COBBLE,             // grey tile
      hearth: B.BRICK,
      board: CS.plankId ? CS.plankId(4) : BLOCK.PLANK,
      masonry: BLOCK.COBBLE,
      // red paper lanterns rather than the iron-and-glass ones
      streetLight: B.LANTERN,
    },
  ],
  specials: () => [
    { name: 'gatehouse', len: 7, dep: 7, eave: 0, need: 16, build: gatehouse },
    { name: 'courtyard house', len: 11, dep: 11, eave: 0, need: 14,
      build: courtyardHouse },
    { name: 'smithy', len: 7, dep: 6, eave: 6, build: smithy },
    { name: 'shop', len: 7, dep: 6, eave: 6, build: shop },
    { name: 'library', len: 9, dep: 7, eave: 6, build: library, minArm: 24 },
  ],
});

// TEMPEST — the storm world. Monsoon building, on a planet where the weather
// is already permanent: weather.js keeps a storm over this one for good.
//
// Flat roofs with a parapet, which changes the skyline the moment you arrive
// and gives every house a second storey of open space you can actually stand
// on. Ochre brick, deep verandas, and a stepwell where the water is kept.
culture('storm', {
  name: 'Tempest',
  // Tempest: the purple and the saffron its caravans are paid in.
  bed: [6, 3],
  fitting: 'jars',
  style: 'flat',
  eaves: 1,
  verns: [
    {
      name: 'monsoon',
      plinth: B.BRICK,
      wall: B.BRICK,
      upper: CS.cementId ? CS.cementId(2) : B.BRICK,          // ochre render
      frame: B.STRIPPED_LOG,
      // Limewash, not yellow. The coping and the veranda columns are the
      // pale band that every course of ochre brick is read against; a
      // saturated yellow next to a saturated orange is two shouts.
      trim: CS.cementId ? CS.cementId(0) : B.STRIPPED_LOG,
      quoinA: B.BRICK, quoinB: CS.cementId ? CS.cementId(2) : BLOCK.COBBLE,
      column: CS.cementId ? CS.cementId(0) : B.STRIPPED_LOG,
      roof: MAT.BRICK, roofBlock: B.BRICK,
      hearth: B.BRICK,
      board: B.STRIPPED_LOG,
      masonry: B.BRICK,
    },
  ],
  specials: () => [
    { name: 'stepwell', len: 11, dep: 11, eave: 0, need: 9, build: stepwell },
    { name: 'temple', len: 9, dep: 9, eave: 0, need: 22, build: stepTemple },
    { name: 'smithy', len: 7, dep: 6, eave: 6, build: smithy },
    { name: 'shop', len: 7, dep: 6, eave: 6, build: shop },
    { name: 'library', len: 9, dep: 7, eave: 6, build: library, minArm: 24 },
  ],
});

// FERRUM — the iron world, and the one that is AHEAD of home.
//
// The reason is in the ground: rust in every seam and green valleys to feed a
// town. Somewhere that started with metal ends up with machines, so Ferrum is
// meant to feel like arriving a century later than Terran — brick and cement
// under iron roofs, iron doors, big clear windows, and a clock instead of a
// steeple.
culture('iron', {
  name: 'Ferrum',
  // Ferrum: works grey and a municipal green.
  bed: [9, 4],
  fitting: 'bench',
  style: 'gable',
  verns: [
    {
      name: 'foundry',
      plinth: BLOCK.COBBLE,
      wall: B.BRICK,
      upper: CS.cementId ? CS.cementId(0) : BLOCK.PLANK,     // rendered above
      frame: CS.plankId ? CS.plankId(4) : BLOCK.PLANK,
      trim: CS.cementId ? CS.cementId(0) : B.STRIPPED_LOG,
      quoinA: BLOCK.COBBLE, quoinB: B.BRICK,
      column: BLOCK.BLOCK_IRON ?? BLOCK.COBBLE,
      roof: MAT.COBBLE, roofBlock: BLOCK.COBBLE,             // slate and iron
      hearth: B.BRICK,
      board: B.BRICK,
      masonry: BLOCK.COBBLE,
      mast: BLOCK.POST,
    },
  ],
  specials: (faith) => [
    { name: 'clock tower', len: 5, dep: 5, eave: 0, need: 15, build: clockTower },
    faith,
    { name: 'smithy', len: 7, dep: 6, eave: 6, build: smithy },
    { name: 'shop', len: 7, dep: 6, eave: 6, build: shop },
    { name: 'library', len: 9, dep: 7, eave: 6, build: library, minArm: 24 },
  ],
});

// VULCAN — the volcanic world. Nothing that burns.
//
// The one culture whose materials argue for themselves: thatch on a lava
// planet is a house that has not caught fire yet. All stone, small openings,
// dark shutters instead of glass, and an iron roof.
culture('volcanic', {
  name: 'Vulcan',
  // Vulcan: the orange of the vents, and ash black.
  bed: [2, 7],
  fitting: 'forge',
  style: 'gable',
  // Shutters, not panes. A dark board in the opening reads as somewhere that
  // closes itself up, which is the whole posture of the place.
  glass: CS.plankId ? CS.plankId(4) : BLOCK.PLANK,
  verns: [
    {
      name: 'basalt',
      plinth: BLOCK.STONE, wall: BLOCK.COBBLE, upper: BLOCK.STONE,
      frame: BLOCK.STONE, trim: BLOCK.COBBLE,
      quoinA: BLOCK.STONE, quoinB: BLOCK.COBBLE,
      column: BLOCK.BLOCK_IRON ?? BLOCK.STONE,
      roof: MAT.COBBLE, roofBlock: BLOCK.COBBLE,
      hearth: BLOCK.STONE,
      board: BLOCK.COBBLE,
      masonry: BLOCK.STONE,
    },
  ],
});

// --- the wreck ---------------------------------------------------------------
//
// A hull broken on a reef, in water shallow enough to swim down to and dark
// enough that you have to want to. It is the one thing on an ocean world that
// rewards going UNDER the surface, which until now was somewhere you fell
// into by accident and climbed straight out of.
//
// Built as a ship rather than as a box with a chest in it: a keel, ribs
// standing off it, a stub of mast lying where it fell, and the cargo still
// aboard. Half the ribs are missing on the side that struck.

const WRECK = {
  minDepth: 3,      // shallowest water worth calling a reef
  maxDepth: 8,      // ...and deep enough that you have to hold your breath
  len: 11,
  attempts: 900,
  apart: 120,
};

function wreckSite(planet, f, cu, cv) {
  const L = WRECK.len, h = L >> 1;
  if (cu - h < MARGIN || cv - 4 < MARGIN
    || cu + h > S - MARGIN || cv + 4 > S - MARGIN) return null;
  let sum = 0, n = 0;
  for (let du = -h; du <= h; du += 2) {
    for (let dv = -3; dv <= 3; dv += 2) {
      const u = cu + du, v = cv + dv;
      const top = waterTop(planet, f, u, v);
      if (top < 0) return null;                  // any dry cell and it is a beach
      const bed = groundTop(planet, f, u, v);
      const deep = top - bed;
      if (deep < WRECK.minDepth || deep > WRECK.maxDepth) return null;
      sum += bed; n++;
    }
  }
  if (!n) return null;
  return { f, cu, cv, bed: Math.round(sum / n) };
}

function buildWreck(planet, f, cu, cv, rand) {
  const site = wreckSite(planet, f, cu, cv);
  if (!site) return null;
  const b = site.bed;
  const L = WRECK.len, h = L >> 1;
  const timber = CS.plankId ? CS.plankId(4) : BLOCK.PLANK;   // dark, waterlogged
  const rib = CS.logId ? CS.logId(4) : BLOCK.LOG;

  // the keel, lying along u with a list to one side
  for (let k = -h; k <= h; k++) {
    const u = cu + k;
    const lean = Math.round(k / 5);            // she went over as she struck
    for (let dv = -1; dv <= 1; dv++) {
      planet.set(f, u, cv + dv + lean, b + 1, timber);
    }
  }
  // ribs, standing off the keel — and gone entirely along the struck side
  for (let k = -h + 1; k <= h - 1; k += 2) {
    const u = cu + k;
    const lean = Math.round(k / 5);
    const struck = k > 1;                       // the bow took it
    for (const [dv, up] of [[-2, 3], [2, struck ? 1 : 3]]) {
      for (let z = 1; z <= up; z++) {
        planet.set(f, u, cv + dv + lean, b + z, rib);
      }
    }
  }
  // the mast, down and lying across her
  for (let k = 0; k < 7; k++) {
    const u = cu - 2 + k, v = cv + 3 + Math.round(k / 3);
    if (v >= S - 1) break;
    planet.set(f, u, v, b + 1, rib);
  }
  // ...and what she was carrying, still aboard amidships
  planet.set(f, cu, cv, b + 2, B.CHEST);
  (planet.wreckChests ??= []).push({ f, u: cu, v: cv, h: b + 2 });
  // a scatter of ballast and spilled cargo round the hull
  for (let k = -h; k <= h; k++) {
    const u = cu + k;
    for (const dv of [-4, 4]) {
      if (((u + dv) & 3) !== 0) continue;
      if (planet.get(f, u, cv + dv, b + 1) === BLOCK.WATER)
        planet.set(f, u, cv + dv, b + 1, BLOCK.GRAVEL);
    }
  }
  const dir = dirFromCell(f, cu + 0.5, cv + 0.5, [0, 0, 0]);
  return { f, u: cu, v: cv, dir: [dir[0], dir[1], dir[2]], kind: 'wreck' };
}

// --- the caravanserai --------------------------------------------------------
//
// A walled halt on the sand, between one village and the next. Four ranges
// round a courtyard with one gate, a well in the middle, stalls along the
// inside wall and a fire that never goes out — which is what a caravanserai
// is: not a village, not a fort, a place to spend a night with animals.
//
// It exists because the deserts and the camels do. A dune field you cross and
// never stop in is scenery; a walled halt halfway over it is a destination,
// and it is the natural home for the trade goods — every stall in it carries
// what this world sends out.
//
// The plan is deliberately the courtyard house's, one size up: blank outside,
// everything within. That is the right building for the job and it is also
// the one plan already in this file that faces inward.

const SERAI = {
  size: 19,        // outside wall, in cells
  range: 3,        // depth of the roofed ranges round the court
  wall: 5,         // courses of outer wall
  attempts: 2600,  // desert is a few per cent of a world; search wide
  apart: 90,       // keep them off each other and off the villages
};

// Is this square all desert, and flat enough to build a walled yard on?
function serailSite(planet, f, cu, cv) {
  const n = SERAI.size, h = n >> 1;
  if (cu - h < MARGIN || cv - h < MARGIN
    || cu + h > S - MARGIN || cv + h > S - MARGIN) return null;
  // One read first. Almost every candidate on a world is not desert at all,
  // and the full square is a hundred column reads — bailing on the centre
  // makes the wide search that finding a dune field needs actually cheap.
  const ct = groundTop(planet, f, cu, cv);
  if (ct < 1 || planet.get(f, cu, cv, ct) !== BLOCK.SAND_ORANGE) return null;

  let lo = H, hi = -1, sum = 0, cells = 0, sand = 0;
  for (let du = -h; du <= h; du += 2) {
    for (let dv = -h; dv <= h; dv += 2) {
      const u = cu + du, v = cv + dv;
      const t = groundTop(planet, f, u, v);
      if (t < 1 || t >= H - 14) return null;
      if (planet.get(f, u, v, t + 1) === BLOCK.WATER) return null;
      const b = planet.get(f, u, v, t);
      // Mostly sand rather than only sand: a dune field frays into grass at
      // its rim, and a halt that refuses to touch a single blade of it can
      // only ever stand in the exact middle of the biggest desert on the
      // planet — which is nowhere, most worlds.
      if (b === BLOCK.SAND_ORANGE || b === BLOCK.SAND) sand++;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t; cells++;
    }
  }
  if (!cells || hi - lo > 8 || sand < cells * 0.82) return null;
  return { f, cu, cv, base: Math.round(sum / cells) };
}

function buildCaravanserai(planet, f, cu, cv, rand, vern) {
  const site = serailSite(planet, f, cu, cv);
  if (!site) return null;
  const b = site.base;
  const n = SERAI.size, h = n >> 1;
  const u0 = cu - h, v0 = cv - h;
  glowLog = [];
  pipeLog = [];
  plaqueLog = [];
  bedLog = [];

  // Level the whole footprint plus a skirt, and pave the yard. The apron
  // outside is what stops a walled square looking dropped on the dunes.
  for (let u = u0 - 2; u < u0 + n + 2; u++) {
    for (let v = v0 - 2; v < v0 + n + 2; v++) {
      if (u < 1 || v < 1 || u >= S - 1 || v >= S - 1) continue;
      for (let z = b + 1; z <= b + 16 && z < H; z++) planet.set(f, u, v, z, BLOCK.AIR);
      for (let z = Math.max(1, b - 3); z <= b; z++)
        if (planet.get(f, u, v, z) === BLOCK.AIR)
          planet.set(f, u, v, z, BLOCK.SAND_ORANGE);
      const inside = u >= u0 && v >= v0 && u < u0 + n && v < v0 + n;
      planet.set(f, u, v, b, inside ? B.PATH : BLOCK.SAND_ORANGE);
    }
  }

  // The outer wall, blank all the way round bar the one gate.
  for (let z = b + 1; z <= b + SERAI.wall; z++) {
    ring(planet, f, u0, v0, n, n, z, z === b + SERAI.wall ? vern.trim : vern.wall);
  }
  // ...and a parapet you can walk, which is what makes it read as a halt that
  // expects trouble rather than as a big shed
  for (let u = u0; u < u0 + n; u++) {
    for (let v = v0; v < v0 + n; v++) {
      const edge = u === u0 || v === v0 || u === u0 + n - 1 || v === v0 + n - 1;
      if (!edge) continue;
      if (((u - u0) + (v - v0)) % 2 === 0)
        planet.set(f, u, v, b + SERAI.wall + 1, vern.masonry ?? BLOCK.COBBLE);
    }
  }

  // The ranges: a roofed band inside the wall, open to the court, which is
  // where the animals and the sleepers go.
  const iu = u0 + SERAI.range, iv = v0 + SERAI.range;
  const iw = n - 2 * SERAI.range;
  for (let u = u0 + 1; u < u0 + n - 1; u++) {
    for (let v = v0 + 1; v < v0 + n - 1; v++) {
      const inCourt = u >= iu && v >= iv && u < iu + iw && v < iv + iw;
      if (inCourt) continue;
      planet.set(f, u, v, b + 4, vern.roofBlock ?? BLOCK.PLANK);   // the roof
      // posts along the courtyard edge, holding it up
      const lip = u === iu - 1 || v === iv - 1
        || u === iu + iw || v === iv + iw;
      if (lip && ((u + v) % 3 === 0))
        for (let z = b + 1; z <= b + 3; z++) planet.set(f, u, v, z, vern.column ?? vern.frame);
    }
  }

  // The gate: a wide arch through the wall on one side, with a lamp either
  // side of it and a threshold you can see from out on the sand.
  const gside = Math.floor(rand() * 4);
  const gc = gside === 0 ? [cu, v0] : gside === 1 ? [cu, v0 + n - 1]
    : gside === 2 ? [u0, cv] : [u0 + n - 1, cv];
  const along = gside < 2 ? [1, 0] : [0, 1];
  for (let k = -2; k <= 2; k++) {
    const gu = gc[0] + along[0] * k, gv = gc[1] + along[1] * k;
    for (let z = b + 1; z <= b + 4; z++) planet.set(f, gu, gv, z, BLOCK.AIR);
    planet.set(f, gu, gv, b, B.PATH);
    planet.set(f, gu, gv, b + 5, vern.trim);
  }
  for (const k of [-3, 3]) {
    const gu = gc[0] + along[0] * k, gv = gc[1] + along[1] * k;
    for (let z = b + 1; z <= b + 3; z++)
      planet.set(f, gu, gv, z, vern.column ?? vern.frame);
    planet.set(f, gu, gv, b + 4, vern.light);
    glow(f, gu, gv, b + 4);
  }

  // The well, in the middle of the court, and the fire beside it. Water on a
  // desert world is the whole reason the place is here.
  const wp = { f, u0: cu - 2, v0: cv - 2, w: 5, d: 5, base: b, ax: 0 };
  buildWell(planet, wp, vern);
  for (const [du, dv] of [[4, 0], [4, 1], [5, 0], [5, 1]])
    planet.set(f, cu + du, cv + dv, b, BLOCK.COBBLE);
  planet.set(f, cu + 4, cv, b + 1, B.CAMPFIRE);
  glow(f, cu + 4, cv, b + 1);

  // Stalls along the inside of the wall — this is a market that happens to
  // have a roof over it, and their chests carry what the world exports.
  for (const [su, sv] of [[u0 + 2, v0 + 2], [u0 + n - 5, v0 + 2],
    [u0 + 2, v0 + n - 4], [u0 + n - 5, v0 + n - 4]]) {
    marketStall(planet, f, su, sv, vern, rand);
  }

  // ...and the rail the camels are tied to, outside the gate.
  for (let k = -4; k <= 4; k++) {
    const ru = gc[0] + along[0] * k - (gside === 2 ? 3 : gside === 3 ? -3 : 0);
    const rv = gc[1] + along[1] * k - (gside === 0 ? 3 : gside === 1 ? -3 : 0);
    if (ru < 1 || rv < 1 || ru >= S - 1 || rv >= S - 1) continue;
    const t = groundTop(planet, f, ru, rv);
    if (t < 1 || t + 2 >= H) continue;
    if (Math.abs(k) === 4 || k === 0) planet.set(f, ru, rv, t + 1, B.POST);
    else planet.set(f, ru, rv, t + 1, B.FENCE);
  }

  const dir = dirFromCell(f, cu + 0.5, cv + 0.5, [0, 0, 0]);
  const out = { f, u: cu, v: cv, dir: [dir[0], dir[1], dir[2]],
    kind: 'caravanserai', glow: glowLog, beds: bedLog, serai: true,
    houses: 0, doors: [] };
  glowLog = null;
  pipeLog = null;
  plaqueLog = null;
  bedLog = null;
  return out;
}

// --- ruins ------------------------------------------------------------------
//
// Something built by people who are not from here, and who are not here any
// more. A stepwell in a Terran meadow, a ring of fallen stones on Ferrum, the
// arch of a gatehouse standing on its own in the snow.
//
// The point is entirely about ORDER: you meet a culture's architecture before
// you meet its planet, so the next thing you launch for is a place you have
// already seen a piece of. It costs almost nothing to build, because the
// buildings already exist — a ruin is one of them put up in another people's
// materials and then weathered until it is obviously old.
//
// A ruin never carries the culture of the world it stands on. That is the
// whole trick, and it is one line in pickRuin.

const RUINS = {
  // What each people leaves behind. The chosen building is the one whose
  // SHAPE survives being half knocked down — a stone circle reads as a stone
  // circle with two piers missing, where a cottage with a hole in it reads as
  // a cottage somebody has not finished.
  coal: { name: 'fallen stones', len: 9, dep: 9, need: 11, build: standingStones,
    decay: 0.42 },
  ocean: { name: 'drowned shrine', len: 9, dep: 9, need: 16, build: shrine,
    decay: 0.5 },
  ice: { name: 'broken gatehouse', len: 7, dep: 7, need: 16, build: gatehouse,
    decay: 0.5 },
  storm: { name: 'silted stepwell', len: 11, dep: 11, need: 9, build: stepwell,
    decay: 0.3 },
  iron: { name: 'ruined clock tower', len: 5, dep: 5, need: 15, build: clockTower,
    decay: 0.48 },
  terran: { name: 'abandoned hall', len: 11, dep: 6, need: 13, build: hall,
    decay: 0.52 },
};
const RUIN_IDS = Object.keys(RUINS);

// How long ago it fell, cell by cell. Two ideas, and both are needed or it
// reads as vandalism rather than as time:
//
//   the HIGHER a cell, the likelier it has gone. Roofs and upper walls come
//   down first because there is nothing holding them up once the timber goes;
//   a plinth is still a plinth after a thousand years.
//
//   what comes down does not vanish. Rubble lands on the floor, which is what
//   makes the inside of a ruin a floor of broken stone rather than a clean
//   room with no lid.
//
// Deterministic from the cell, like everything else in this file.
function weather(planet, f, u0, v0, w, d, base, top, decay, salt) {
  const rubble = [];
  for (let u = u0 - 1; u < u0 + w + 1; u++) {
    for (let v = v0 - 1; v < v0 + d + 1; v++) {
      if (u < 1 || v < 1 || u >= S - 1 || v >= S - 1) continue;
      for (let h = base + 1; h <= top; h++) {
        const b = planet.get(f, u, v, h);
        if (b === BLOCK.AIR) continue;
        // 0 at the floor, 1 at the top of what was built
        const k = (h - base) / Math.max(1, top - base);
        const n = cellHash(u * 3 + h, v * 5 + h, f, salt) & 1023;
        if (n / 1024 > decay * (0.25 + 0.95 * k)) continue;
        planet.set(f, u, v, h, BLOCK.AIR);
        if (rubble.length < 220 && (n & 3) === 0) rubble.push([u, v]);
      }
    }
  }
  // ...and what fell, lying where it fell
  for (const [u, v] of rubble) {
    const g = groundTop(planet, f, u, v);
    if (g < 0 || g + 1 >= H) continue;
    if (planet.get(f, u, v, g + 1) !== BLOCK.AIR) continue;
    const n = cellHash(u, v, f, salt ^ 0x5b) & 7;
    planet.set(f, u, v, g + 1, n < 5 ? BLOCK.COBBLE : BLOCK.GRAVEL);
  }
}

// One ruin, or null if the ground will not take it.
function buildRuin(planet, f, cu, cv, rand, worldCulture) {
  // never this world's own people: a ruin you cannot place is a ruin you have
  // already seen standing, and then it says nothing
  const pool = RUIN_IDS.filter((id) => id !== worldCulture && CULTURES[id]);
  if (!pool.length) return null;
  const id = pool[Math.floor(rand() * pool.length)];
  const R = RUINS[id];
  const cult = CULTURES[id];
  const vern = cult.verns[0];

  const p = survey(planet, f, cu, cv, R.len, R.dep, R.need);
  if (!p) return null;
  p.ax = rand() < 0.5 ? 0 : 1;
  p.side = Math.floor(rand() * 4);
  glowLog = [];                      // a ruin's lamps went out long ago
  pipeLog = [];
  plaqueLog = [];
  R.build(planet, p, p.side, vern, rand);
  glowLog = null;
  pipeLog = null;
  plaqueLog = null;

  const top = Math.min(H - 2, p.base + R.need);
  weather(planet, f, p.u0, p.v0, p.w, p.d, p.base, top, R.decay,
    (f * 977 + cu * 31 + cv) ^ 0x2a11ed);

  // What is still in it. One chest on the floor, carrying the trade good of
  // the people who built it — which is the only place in the system you will
  // find that good without going to their world, and the reason to open it.
  const bu = p.u0 + (p.w >> 1), bv = p.v0 + (p.d >> 1);
  const bh = groundTop(planet, f, bu, bv);
  if (bh > 0 && bh + 1 < H && planet.get(f, bu, bv, bh + 1) === BLOCK.AIR) {
    planet.set(f, bu, bv, bh + 1, B.CHEST);
    (planet.ruinChests ??= []).push({ f, u: bu, v: bv, h: bh + 1, culture: id });
  }
  const dir = dirFromCell(f, cu + 0.5, cv + 0.5, [0, 0, 0]);
  return { f, u: cu, v: cv, dir: [dir[0], dir[1], dir[2]],
    kind: R.name, culture: id };
}

// The third generation's cave entrances (see entranceSites in cubesphere.js)
// are part of the ground's own shape, cut before any settlement is sited. A
// village laid across one levels its plot over the trench and builds its
// ground back up out of it in pillars, so a centre within a town's reach —
// about forty cells, and the cut's own length on top — is refused. Both are
// read off the world's name alone, so every machine refuses the same ones.
const ENTRANCE_CLEAR = 44;
function nearEntrance(planet, f, cu, cv, reach = ENTRANCE_CLEAR) {
  const ent = planet.height?.entrances;
  if (!ent) return false;
  const d = dirFromCell(f, cu + 0.5, cv + 0.5, [0, 0, 0]);
  return ent.within(d[0], d[1], d[2], reach);
}

export function buildVillages(planet, seed, radiusScale = 1, opts = {}) {
  // Buildings the player saved with the in-game planner. Empty on a fresh
  // clone, and then the coded archetypes are what a village is made of.
  // The world's people decide which of the coded archetypes they build at
  // all, so a village of roundhouses never gets a crenellated stone tower.
  const pools = buildingPools(opts.blueprints ?? [], cultureFor(planet).drop);
  const rand = mulberry32(seed ^ 0x711a6e);
  const count = Math.max(2, Math.round(3 * radiusScale ** 2));
  const span = Math.max(1, S - 2 * MARGIN);
  planet.villageSites = [];
  planet.houseChests = [];
  planet.stallChests = [];
  planet.ruinChests = [];
  planet.ruins = [];
  planet.wreckChests = [];
  planet.wrecks = [];
  planet.houseList = [];
  planet.penList = [];
  planet.shopList = [];
  planet.priestList = [];
  planet.belfries = [];
  planet.cafes = [];
  if (audit.on) { audit.roofs.length = 0; audit.ladders.length = 0; }

  // How hard to look for each centre. Eight tries is plenty on a world with
  // thirty villages to place — one that fails costs nothing, there are
  // twenty-nine more. On a TINY world the count floor is two and a failure is
  // half the planet's settlements, so a radius-50 world regularly came out
  // with one village on it. The smaller the target the harder we look.
  // ...and the third generation's ground is rougher — sea cliffs, crags,
  // steeper hills — so it looks a little harder for the same count.
  const tries = count <= 6 ? 40 : planet.gen3 ? 14 : 8;
  for (let n = 0; n < count; n++) {
    // A centre refused for standing by a cave entrance has not been tried:
    // it gets its attempt back, up to a point, or the worlds that have
    // entrances would simply have fewer villages on them.
    let spare = 24;
    // try a few centres before giving up: most of a planet is sea, rock or
    // mountain with no headroom left under H
    for (let attempt = 0; attempt < tries; attempt++) {
      const f = Math.floor(rand() * 6);
      const cu = MARGIN + Math.floor(rand() * span);
      const cv = MARGIN + Math.floor(rand() * span);
      // keep villages apart: two overlapping layouts would build through each
      // other's walls, and the second one wins
      // 100, not 70: a town reaches about 40 cells, so two of them at 70
      // would lay their outer blocks through each other
      if (planet.villageSites.some((s) => s.f === f
        && Math.abs(s.u - cu) < 100 && Math.abs(s.v - cv) < 100)) continue;
      if (nearEntrance(planet, f, cu, cv)) {
        if (spare-- > 0) attempt--;
        continue;
      }
      const site = buildVillage(planet, f, cu, cv, rand, pools);
      if (site) { planet.villageSites.push(site); break; }
    }
  }
  // The lake people. Their own salted stream and their own siting rule: they
  // want water where every other village wants ground, so there is no point
  // asking the same survey. One or two a world — a fen village is somewhere
  // you come across, not somewhere every lake has.
  const cult = cultureFor(planet);
  if (cult.fen) {
    const frand = mulberry32(seed ^ 0xfe4a17);
    const want = Math.max(1, Math.round(radiusScale));
    // A lake big enough and shallow enough for this is a small fraction of a
    // world, so the search has to be wide before it is reliable: at ninety
    // tries half the worlds found nothing and simply had no lake people on
    // them, which reads as the feature being broken rather than as the lakes
    // being unsuitable.
    for (let n = 0, tries = 0; n < want && tries < 400; tries++) {
      const f = Math.floor(frand() * 6);
      const cu = MARGIN + Math.floor(frand() * span);
      const cv = MARGIN + Math.floor(frand() * span);
      if (planet.villageSites.some((t) => t.f === f
        && Math.abs(t.u - cu) < 70 && Math.abs(t.v - cv) < 70)) continue;
      const site = buildFenVillage(planet, f, cu, cv, frand, cult);
      if (site) { planet.villageSites.push(site); n++; }
    }
  }

  // The halt on the sand. Only where there ARE deserts — the preset decides
  // that and only the bigger terran worlds grow any — so on most worlds this
  // pass finds nothing and there is no caravanserai, which is the right
  // answer rather than a gap to paper over.
  if (planet.desert) {
    const srand = mulberry32(seed ^ 0xca7a5e);
    const want = Math.max(1, Math.round(radiusScale));
    for (let m = 0, tries = 0; m < want && tries < SERAI.attempts; tries++) {
      const f = Math.floor(srand() * 6);
      const cu = MARGIN + Math.floor(srand() * span);
      const cv = MARGIN + Math.floor(srand() * span);
      const near = (list) => list.some((t) => t.f === f
        && Math.abs(t.u - cu) < SERAI.apart && Math.abs(t.v - cv) < SERAI.apart);
      if (near(planet.villageSites) || near(planet.ruins)) continue;
      if (nearEntrance(planet, f, cu, cv)) continue;
      const cult = cultureFor(planet);
      const site = buildCaravanserai(planet, f, cu, cv, srand, cult.verns[0]);
      if (site) { planet.villageSites.push(site); m++; }
    }
  }

  // Wrecks, on worlds with enough sea to lose a ship in. Ocean gets several;
  // anywhere with real water gets one or two, because a hull on a reef is
  // worth finding wherever you find it.
  {
    const wrand = mulberry32(seed ^ 0x37e11);
    const want = planet.presetId === 'ocean'
      ? Math.max(2, Math.round(2 * radiusScale)) : 1;
    planet.wrecks = [];
    for (let m = 0, tries = 0; m < want && tries < WRECK.attempts; tries++) {
      const f = Math.floor(wrand() * 6);
      const cu = MARGIN + Math.floor(wrand() * span);
      const cv = MARGIN + Math.floor(wrand() * span);
      if (planet.wrecks.some((t) => t.f === f
        && Math.abs(t.u - cu) < WRECK.apart && Math.abs(t.v - cv) < WRECK.apart)) continue;
      const w = buildWreck(planet, f, cu, cv, wrand);
      if (w) { planet.wrecks.push(w); m++; }
    }
  }

  // The ruins. Last of the settlement passes and on its own salted stream, so
  // adding them moved no village, no herd and no house on any world that
  // already existed. They keep well clear of the living settlements — a
  // fallen gatehouse on the green would read as a building site — and they
  // are deliberately FEW: three or four on a world, so meeting one is an
  // event rather than scenery.
  {
    const rrand = mulberry32(seed ^ 0x2a11ed);
    const want = Math.max(2, Math.round(2 * radiusScale));
    const mine = cultureFor(planet).id;
    for (let n = 0, tries = 0; n < want && tries < 200; tries++) {
      const f = Math.floor(rrand() * 6);
      const cu = MARGIN + Math.floor(rrand() * span);
      const cv = MARGIN + Math.floor(rrand() * span);
      if (planet.villageSites.some((t) => t.f === f
        && Math.abs(t.u - cu) < 60 && Math.abs(t.v - cv) < 60)) continue;
      if (planet.ruins.some((t) => t.f === f
        && Math.abs(t.u - cu) < 80 && Math.abs(t.v - cv) < 80)) continue;
      if (nearEntrance(planet, f, cu, cv, 40)) continue;
      const r = buildRuin(planet, f, cu, cv, rrand, mine);
      if (r) { planet.ruins.push(r); n++; }
    }
  }

  // --- the roads between them --------------------------------------------
  // Every village runs a road to its nearest neighbour on the same face,
  // gate to gate — the closest pair, so the road arrives at a doorway and
  // not at a stretch of fence. Pure function of the sites, no dice: two
  // machines lay the same roads. Faces are not crossed; a road sheared
  // across a cube seam would be worse than no road.
  const linked = new Set();
  for (const a of planet.villageSites) {
    let bestSite = null, bd = 1e9;
    for (const b of planet.villageSites) {
      if (a === b || b.f !== a.f) continue;
      const d = Math.abs(a.u - b.u) + Math.abs(a.v - b.v);
      if (d < bd) { bd = d; bestSite = b; }
    }
    if (!bestSite || bd > 160) continue;
    const key = a.u * 1000 + a.v <= bestSite.u * 1000 + bestSite.v
      ? `${a.u},${a.v}:${bestSite.u},${bestSite.v}`
      : `${bestSite.u},${bestSite.v}:${a.u},${a.v}`;
    if (linked.has(key)) continue;
    linked.add(key);
    let g1 = null, g2 = null, gd = 1e9;
    for (const x of a.gates ?? []) {
      for (const y of bestSite.gates ?? []) {
        const d = Math.abs(x.u - y.u) + Math.abs(x.v - y.v);
        if (d < gd) { gd = d; g1 = x; g2 = y; }
      }
    }
    if (g1 && g2) roadBetween(planet, a.f, g1.u, g1.v, g2.u, g2.v);
  }

  return planet.villageSites;
}
