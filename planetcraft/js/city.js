// city.js — a planet-wide city: avenues, towers, and the tube under them.
//
// The problem this file exists to solve is memory, not geometry. A cell the
// generator has not touched costs nothing — terrain is a height field plus a
// sparse override, so a column is only allocated when something writes to it,
// and that allocation is H bytes plus a map entry. Paving a radius-156 world
// cell by cell would touch 393,000 columns: sixty megabytes to say "this
// ground is grey".
//
// So the roads are not built at all. The `city` preset's own low band IS
// asphalt (see cubesphere.js), which means the whole planet arrives already
// paved, for free, and this file only has to place the things that STAND on
// it: pavements, towers, lamps, lane markings and the tube. That is about a
// quarter of the surface instead of all of it, and it is why a city planet
// generates in the same breath as an empty one.
//
// --- the layout ------------------------------------------------------------
//
// Each cube face carries a square grid of city blocks separated by roads:
//
//     road  ┌──────────┐ road ┌──────────┐
//           │ pavement │      │          │      period = road + block
//           │  ┌────┐  │      │  ┌────┐  │      a plot per building
//           │  │plot│  │      │  │plot│  │
//           │  └────┘  │      │  └────┘  │
//           └──────────┘      └──────────┘
//
// The period is a constant, so a block is the same size on every world and a
// bigger planet simply has more of them. What is bounded instead is how many
// get BUILT: past `maxBlocks` the surplus becomes parkland, which keeps a
// radius-400 city inside the same generation budget as a radius-156 one
// without shrinking the streets to something you cannot walk down.
//
// Blocks whose ground is too broken or too wet to survey are left alone, and
// the preset's temperate patches show through as parks. That is deliberate:
// a city with no gaps reads as wallpaper.
//
// --- terracing -------------------------------------------------------------
//
// Plots are cut and filled to one level each; the roads between them are left
// on the natural ground. A city on rolling terrain therefore comes out
// terraced, with the streets running up and down between flat blocks, which
// is what a real city on hills does.

import { BLOCK, S, H, dirFromCell } from './cubesphere.js';
import * as CS from './cubesphere.js';
import { placeName, cellar } from './village.js';

// --- tuning -----------------------------------------------------------------

export const CITY_TUNING = {
  // The block period is FIXED, not scaled to the world: a city block is a
  // city block, and a radius-400 planet should have more of them rather than
  // bigger ones. What scales instead is `maxBlocks` — see parkChance below.
  period: 22,         // road + block, in cells
  maxBlocks: 560,     // built blocks planet-wide; the cost knob
  margin: 26,         // cells kept clear of the face seam
  road: 6,            // road width, in cells
  pavement: 2,        // pavement depth around a block, in cells
  plot: 12,           // a building plot is about this many cells square
  alley: 2,           // gap between plots inside one block
  // Cells of height range a plot may have before it is refused and left as
  // open ground. Generous on purpose: this is Wenax's terrain, which has real
  // relief, and a city that only builds on the flat builds almost nowhere.
  // The cut and fill turns the rest into terraces.
  spread: 14,
  towerHigh: 13,      // storeys, the tall ones
  storey: 3,          // cells per storey — a Minecraft room, and a third off
  //                     the height of every tower in the city
  parkChance: 0.14,   // blocks left green, at least
  laneMarks: true,    // dashed centre line down every road
  tubeEvery: 3,       // a tube line under every Nth avenue
  tubeDepth: 7,       // cells from the street down to the tunnel ceiling
  stationEvery: 3,    // blocks between stations on a line
};

// --- materials --------------------------------------------------------------
//
// The atlas has no tile called concrete, so the city pours its own out of
// what the world already has — cement, clay, stone and gravel, the grey
// ladder below — with panes for every window, stone for the kerbs, iron for
// the rails and lanterns for the street lights.

const slab = CS.slabId ? (m, half) => CS.slabId(m, half) : () => BLOCK.COBBLE;
const MAT = { PLANK: 0, COBBLE: 1, BRICK: 2, THATCH: 3 };
const stair = CS.stairId
  ? (m, facing) => CS.stairId(m, facing) : () => BLOCK.COBBLE;
// A window is a PANE, never a block of glass — the project rule, and also the
// cheap option: a pane is a sheet, two faces, where a glass cube next to
// another glass cube draws all six of both.
const pane = CS.paneId ? CS.paneId(-1) : BLOCK.GLASS;
const cement = (i) => (CS.cementId ? CS.cementId(i) : BLOCK.CLAY);
const hangFlat = CS.doorBlockId
  ? (facing, open = false) => CS.doorBlockId(0, facing, open)
  : null;
const bedHead = CS.bedId ? (c, fc) => CS.bedId(c, fc) : null;
const bedFoot = CS.bedFootId ? (c, fc) => CS.bedFootId(c, fc) : null;
const chairAt = CS.chairId ? (fc) => CS.chairId(fc) : (fc) => stair(0, fc);

// Every building is CEMENT and nothing but, and every building is ONE
// colour: a grey off the five-step ladder from white to black. The coloured
// towers were tried and the player called the street a toy box — what a
// poured city wears is gradients of grey, and the eye tells buildings apart
// by VALUE, which is how real skylines read. Trim equals wall, so each
// tower is a monolith; the greys between white and black are the family's
// own new pours (see CEMENT_GREY_BASE).
const grey = (i) => (CS.cementGreyId ? CS.cementGreyId(i) : cement(0));
const CONCRETES = [
  { name: 'white', wall: cement(0), trim: cement(0), weight: 4 },
  { name: 'light grey', wall: grey(0), trim: grey(0), weight: 5 },
  { name: 'grey', wall: grey(1), trim: grey(1), weight: 5 },
  { name: 'dark grey', wall: grey(2), trim: grey(2), weight: 3 },
  { name: 'black', wall: cement(7), trim: cement(7), weight: 1 },
];
const CONCRETE_TOTAL = CONCRETES.reduce((n, c) => n + c.weight, 0);
function pickConcrete(rand) {
  let r = rand() * CONCRETE_TOTAL;
  for (const c of CONCRETES) { r -= c.weight; if (r <= 0) return c; }
  return CONCRETES[2];
}

// Each style is one building SHAPE: how tall it gets and how much of its
// wall is window. The material no longer distinguishes them — every one is
// concrete off the grey ladder above — so the glazing does all the talking,
// and that is the point: some apartment houses have far more glass than
// others, and you can tell which from the street.
//   glass    two-tall panes in every bay: the glass tower
//   curtain  two-tall panes in every other bay
//   ribbon   single panes in every other bay
//   punched  a pane every third bay: the most masonry, the least window
// `brick` keeps its name because the districts call it by it; it is the
// mid-rise apartment house, in concrete like everything else.
const STYLES = [
  { name: 'tower', band: 'glass', min: 7, max: 13, weight: 2 },
  { name: 'slab', band: 'curtain', min: 5, max: 9, weight: 3 },
  { name: 'brick', band: 'ribbon', min: 3, max: 6, weight: 4 },
  { name: 'shops', band: 'punched', min: 2, max: 3, weight: 3 },
];

// --- districts ---------------------------------------------------------------
//
// A city where every block is the same block reads as wallpaper. A DISTRICT is
// a run of blocks that share a character — which styles get built there, how
// tall they are allowed to go, how much of it is left green, and the one prop
// that gives the street its own furniture.
//
// The unit is a square of `DISTRICT_SIZE` blocks, not a single block, and that
// is the whole point: you have to be able to walk out of one and into the
// next. At the default period of 22 cells a district is about 90 cells across,
// which is a couple of minutes end to end.
//
// It is a pure function of (face, district cell, seed) — no noise field and
// nothing stored — so two machines on one world name lay out the same city.
//
//   styles   weight per STYLES name; a name left out is not built here at all
//   tall     multiplier on the world's own height cap
//   park     multiplier on the parkland chance
//   prop     extra street furniture, laid once per block
//
const DISTRICTS = [
  {
    // The towers. Few parks, no brick, and the full height the world allows:
    // this is the part of the city you see from the next district over.
    name: 'downtown', weight: 3,
    styles: { tower: 6, slab: 4 },
    tall: 1, park: 0.45, prop: null,
  },
  {
    // The old quarter: brick and shopfronts, three or four storeys, streets
    // you can see the sky from. Walking out of the towers into this is the
    // moment a city planet stops being a texture and starts being a place.
    name: 'old quarter', weight: 3,
    styles: { brick: 6, shops: 4 },
    tall: 0.45, park: 0.7, prop: null,
  },
  {
    // The market. Low, dense, and the one district with colour in it: an
    // awning of coloured slabs runs the length of a pavement.
    name: 'market', weight: 2,
    styles: { shops: 7, brick: 3 },
    tall: 0.35, park: 0.5, prop: 'awning',
  },
  {
    // Works and warehouses: the low, close-set half of the skyline.
    // The chimneys the district used to run on are gone — a column of brick
    // a storey taller than everything round it was the one thing the player
    // could see from anywhere, and asked to have taken down.
    name: 'works', weight: 2,
    styles: { slab: 5, brick: 5 },
    tall: 0.6, park: 0.6, prop: null,
  },
  {
    // Parkland with a building here and there. Mostly this district is what
    // it does NOT build, and the city needs somewhere to breathe.
    name: 'park', weight: 1,
    styles: { shops: 5, brick: 3 },
    tall: 0.4, park: 3.2, prop: null,
  },
];

const DISTRICT_TOTAL = DISTRICTS.reduce((n, d) => n + d.weight, 0);

// How many blocks square one district is. Small enough that a face carries
// several, large enough that you are inside one for a while.
const DISTRICT_SIZE = 4;

// Which district a block belongs to. Hashed off the district CELL rather than
// the block, so neighbours agree and the boundary between two of them falls
// on a street.
function districtAt(f, bi, bj, seed) {
  const du = Math.floor(bi / DISTRICT_SIZE), dv = Math.floor(bj / DISTRICT_SIZE);
  let n = (f * 73856093) ^ (du * 19349663) ^ (dv * 83492791) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  let r = ((n ^ (n >>> 16)) >>> 0) / 4294967296 * DISTRICT_TOTAL;
  for (const d of DISTRICTS) { r -= d.weight; if (r <= 0) return d; }
  return DISTRICTS[DISTRICTS.length - 1];
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inFace = (u, v) => u >= 0 && v >= 0 && u < S && v < S;

// Every light the city places goes through here, so the block being built
// can write it down. The rule is the village's: nothing ever scans the world
// for lamp ids — the generator records where it put them, and main.js
// streams halos for the blocks nearest the player off that record. This is
// why the street lamps actually LIGHT now: they were being placed and never
// logged, so no halo was ever drawn for one.
let glowLog = null;
function lit(planet, f, u, v, h, id) {
  planet.set(f, u, v, h, id);
  glowLog?.push({ f, u, v, h });
}
// ...and every bed and every front door, written down the same way: the
// boroughs below are real settlements, and a settlement's population cap is
// the length of its bed list, exactly as a village's is.
let bedLog = null;
let doorLog = null;
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.STONE,
  BLOCK.COAL, BLOCK.GRAVEL, BLOCK.CLAY, BLOCK.COBBLE]);
// ...and the roadway itself, which is black cement now, plus the white the
// paint pass lays on it — dryTop has to keep answering on a painted cell or
// the second coat refuses the ground the first one made
for (let i = 0; i < 8; i++) GROUND.add(BLOCK.CEMENT_BASE + i);

// Highest solid cell, ignoring anything growing on it.
//
// Derived from surfaceRadius rather than from columnSolidTop, and that is not
// a style choice. columnSolidTop scans UPWARD from the planet's centre and
// answers with the first cell that does not hold you up, which is what the
// mesher wants for caves — but the core is molten, and lava is a fluid, so on
// any column that carries an override it answers with the floor of the core
// rather than the ground. surfaceRadius scans down from the sky, which is the
// question being asked here. The city surveys the same column repeatedly as
// it builds, so this matters from the second write onward.
function groundTop(planet, f, u, v) {
  let t = Math.round(planet.surfaceRadius(f, u, v)) - CS.R0 - 1;
  if (t >= H) t = H - 1;
  while (t >= 0) {
    const b = planet.get(f, u, v, t);
    if (b !== BLOCK.LOG && b !== BLOCK.LEAF) return t;
    t--;
  }
  return -1;
}

// Dry, solid land you could stand on. The sea bed reports a solid top like
// anything else, so the water check is the one that matters.
function dryTop(planet, f, u, v) {
  const t = groundTop(planet, f, u, v);
  if (t < 1 || t >= H - 3) return -1;
  if (!GROUND.has(planet.get(f, u, v, t))) return -1;
  const above = planet.get(f, u, v, t + 1);
  if (above === BLOCK.WATER || above === BLOCK.LAVA) return -1;
  return t;
}

// --- surveying and earthworks -----------------------------------------------

function survey(planet, f, u0, v0, w, d, spread) {
  let lo = H, hi = -1, sum = 0, n = 0;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const t = dryTop(planet, f, u, v);
      if (t < 0) return null;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t; n++;
    }
  }
  if (hi - lo > spread) return null;
  return { base: Math.round(sum / n), lo, hi };
}

// Cut and fill to one level. The fill is cobble under a stone cap, so a
// terrace edge reads as a retaining wall rather than as a cliff of soil.
function levelTo(planet, f, u0, v0, w, d, base, cap, skirt = 0, clear = 8) {
  for (let u = u0 - skirt; u < u0 + w + skirt; u++) {
    for (let v = v0 - skirt; v < v0 + d + skirt; v++) {
      if (!inFace(u, v)) continue;
      const t = groundTop(planet, f, u, v);
      if (t < 0) continue;
      for (let h = t + 1; h <= base; h++) {
        planet.set(f, u, v, h, h === base ? cap : cement(7));
      }
      if (t >= base) planet.set(f, u, v, base, cap);
      for (let h = base + 1; h <= base + clear && h < H; h++) {
        planet.set(f, u, v, h, BLOCK.AIR);
      }
    }
  }
}

// --- the street -------------------------------------------------------------

// Pavement round the edge of a block: the one thing that turns "buildings on
// asphalt" into "buildings on a street". It follows the ground rather than
// being levelled, so it runs up and down the hill with the road beside it.
function pave(planet, f, u0, v0, size, depth) {
  let n = 0;
  for (let u = u0; u < u0 + size; u++) {
    for (let v = v0; v < v0 + size; v++) {
      const edge = u < u0 + depth || v < v0 + depth
        || u >= u0 + size - depth || v >= v0 + size - depth;
      if (!edge) continue;
      const t = dryTop(planet, f, u, v);
      if (t < 0) continue;
      // the outer ring is the KERB, cut stone against the tarmac; the walk
      // behind it stays path. Two materials is what makes it a street edge
      // rather than a two-cell smear of one
      const kerb = u === u0 || v === v0
        || u === u0 + size - 1 || v === v0 + size - 1;
      planet.set(f, u, v, t, kerb ? BLOCK.STONE : BLOCK.PATH);
      // fell anything standing in the pavement
      for (let h = t + 1; h <= t + 8 && h < H; h++) {
        const b = planet.get(f, u, v, h);
        if (b === BLOCK.LEAF || b === BLOCK.LOG) planet.set(f, u, v, h, BLOCK.AIR);
      }
      n++;
    }
  }
  return n;
}

// A dashed centre line. Two cells painted, two skipped: enough to read as a
// carriageway from a first-floor window, and a quarter of the cost of a solid
// line. WHITE cement, because road paint is white — the clay it used to be
// read as a strip of bathroom floor down every avenue.
function laneLine(planet, f, ax, at, from, to) {
  for (let i = from; i < to; i++) {
    if ((i & 3) > 1) continue;
    const u = ax ? at : i, v = ax ? i : at;
    if (!inFace(u, v)) continue;
    const t = dryTop(planet, f, u, v);
    if (t < 0) continue;
    planet.set(f, u, v, t, cement(0));
  }
}

// A zebra crossing: bars of white paint across the road, parallel to the
// traffic and three cells long, one at the middle of every block side. It is
// the cheapest thing on the street and it carries most of the reading — a
// road with crossings on it is a road people use on foot, which since the
// cars went is the truth.
function crossing(planet, f, ax, at, c, road) {
  for (let j = 0; j < road; j++) {
    if (j & 1) continue;
    for (let e = -1; e <= 1; e++) {
      const u = ax ? at + j : c + e, v = ax ? c + e : at + j;
      if (!inFace(u, v)) continue;
      const t = dryTop(planet, f, u, v);
      if (t < 0) continue;
      planet.set(f, u, v, t, cement(0));
    }
  }
}

// A street light: a cobble post with a lantern on top. Three blocks, and a
// street without them reads as a car park.
function lamp(planet, f, u, v) {
  const t = dryTop(planet, f, u, v);
  if (t < 0 || t + 5 >= H) return;
  for (let h = t + 1; h <= t + 4; h++) planet.set(f, u, v, h, BLOCK.FENCE);
  lit(planet, f, u, v, t + 5, BLOCK.LANTERN);
}

// The roadway round a built block, PAVED. The roads have always been the
// preset's own ground wearing black — free, and right almost everywhere —
// but the terrain has bands the preset keeps for its parks, beaches and
// hills, and where a road crossed one it came out grass, sand or bare rock.
// So every road cell in the ring round a built block is painted black cement
// unless it already is some cement, anything growing over the carriageway is
// felled, and a wet cell is left wet — a ford is a ford. Bounded by
// maxBlocks like everything else: the ring is per BUILT block, so a huge
// world pays for the city it actually got, not for the grid.
const isCementBlock = (b) =>
  b >= BLOCK.CEMENT_BASE && b < BLOCK.CEMENT_BASE + 8;
function paveRoads(planet, f, u0, v0, size, road) {
  let n = 0;
  for (let u = u0 - road; u < u0 + size + road; u++) {
    for (let v = v0 - road; v < v0 + size + road; v++) {
      const inBlock = u >= u0 && u < u0 + size && v >= v0 && v < v0 + size;
      if (inBlock || !inFace(u, v)) continue;
      const t = groundTop(planet, f, u, v);
      if (t < 1 || t >= H - 2) continue;
      const above = planet.get(f, u, v, t + 1);
      if (above === BLOCK.WATER || above === BLOCK.LAVA) continue;
      if (!isCementBlock(planet.get(f, u, v, t))) {
        planet.set(f, u, v, t, cement(7));
        n++;
      }
      // fell the tree or the shrubs the park grew over the road
      for (let h = t + 1; h <= t + 7 && h < H; h++) {
        const b = planet.get(f, u, v, h);
        if (b === BLOCK.LOG || b === BLOCK.LEAF || PLANT_LIKE.has(b)) {
          planet.set(f, u, v, h, BLOCK.AIR);
        }
      }
    }
  }
  return n;
}
const PLANT_LIKE = new Set([BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW,
  BLOCK.FLOWER_BLUE, BLOCK.SNOW]);

// A street tree: a pit cut into the pavement, a short trunk, a head of
// leaves. Planted on the inner pavement ring, clear of the corner lamps, and
// nothing does more for a street of grey concrete per block spent — which is
// most of what the player meant by beautiful.
// What counts as pavement underfoot: the path, the stone kerb — and the
// building plot's own white-cement skirt, which levelTo lays a cell past
// the plot edge and OVER the inner pavement ring after pave() has painted
// it. When the cap went from stone to cement, this guard silently refused
// every tree, verge and bench spot in the city — the trees the player
// liked, gone in a repaint of the ground they stood on.
const PAVE_TOPS = new Set([BLOCK.PATH, BLOCK.STONE, cement(0)]);
function streetTree(planet, f, u, v) {
  const t = dryTop(planet, f, u, v);
  if (t < 0 || t + 6 >= H) return false;
  if (!PAVE_TOPS.has(planet.get(f, u, v, t))) return false;   // pavement only
  planet.set(f, u, v, t, BLOCK.DIRT);                 // the tree pit
  planet.set(f, u, v, t + 1, BLOCK.LOG);
  planet.set(f, u, v, t + 2, BLOCK.LOG);
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      if (Math.abs(a) + Math.abs(b) === 2) continue;  // no square heads
      // only into open air: the inner pavement ring stands one cell off the
      // building line, so an unguarded canopy grew INTO the wall beside it
      if (planet.get(f, u + a, v + b, t + 3) === BLOCK.AIR) {
        planet.set(f, u + a, v + b, t + 3, BLOCK.LEAF);
      }
    }
  }
  if (planet.get(f, u, v, t + 4) === BLOCK.AIR) {
    planet.set(f, u, v, t + 4, BLOCK.LEAF);
  }
  return true;
}

// ...and between the trees, a verge: one cell of grass with a flower in it.
const VERGE_FLOWERS = [BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW, BLOCK.FLOWER_BLUE];
function verge(planet, f, u, v, rand) {
  const t = dryTop(planet, f, u, v);
  if (t < 0) return false;
  if (!PAVE_TOPS.has(planet.get(f, u, v, t))) return false;
  planet.set(f, u, v, t, BLOCK.GRASS);
  planet.set(f, u, v, t + 1,
    VERGE_FLOWERS[(rand() * VERGE_FLOWERS.length) | 0]);
  return true;
}

// The block's planting and furniture, all four sides of the inner pavement
// ring: a tree every seventh cell, a flowered verge on one off-beat, a BENCH
// on the other — its back to the building, facing the street, which is what
// a bench on a pavement is for. Two hydrants per block on the kerb, one at
// either end of a diagonal, red against the black.
const bench = CS.benchId ? (fc) => CS.benchId(fc) : null;
function streetPlanting(planet, f, u0, v0, size, rand) {
  const ring = 1;
  // spot list order is the facing list order: v0 side, far v side, u0 side,
  // far u side — the bench's back goes toward the building every time
  const BACKS = [2, 3, 0, 1];
  for (let k = 3; k < size - 3; k++) {
    const spots = [
      [u0 + k, v0 + ring], [u0 + k, v0 + size - 1 - ring],
      [u0 + ring, v0 + k], [u0 + size - 1 - ring, v0 + k],
    ];
    if (k % 7 === 3) for (const [u, v] of spots) streetTree(planet, f, u, v);
    else if (k % 7 === 0) for (const [u, v] of spots) verge(planet, f, u, v, rand);
    else if (k % 7 === 5 && bench) {
      spots.forEach(([u, v], i) => {
        const t = dryTop(planet, f, u, v);
        if (t >= 0 && PAVE_TOPS.has(planet.get(f, u, v, t))
          && planet.get(f, u, v, t + 1) === BLOCK.AIR) {
          planet.set(f, u, v, t + 1, bench(BACKS[i]));
        }
      });
    }
  }
  if (BLOCK.HYDRANT != null) {
    for (const [u, v] of [[u0 + 2, v0], [u0 + size - 3, v0 + size - 1]]) {
      const t = dryTop(planet, f, u, v);
      if (t >= 0 && planet.get(f, u, v, t + 1) === BLOCK.AIR) {
        planet.set(f, u, v, t + 1, BLOCK.HYDRANT);
      }
    }
  }
}

// THE KIOSK: a booth two cells deep and three long on the pavement, in a
// coloured cement of its own — walls, a serving counter under an open
// window, a flat roof with a lantern on it. Half of them TRADE: the counter
// goes on planet.shopList exactly as a shopfront does, with the keeper's
// spot in the booth, so a kiosk is the smallest shop in the game and not a
// prop pretending. New street object, as commissioned.
function kiosk(planet, f, u0, v0, size, rand, dist) {
  const side = (rand() * 4) | 0;
  const off = 4 + ((rand() * (size - 10)) | 0);      // clear of trees at 3
  // cell(i, r): i runs 0..2 along the booth, r is 0 kerb row, 1 inner row
  const cell = (i, r) => {
    if (side === 0) return [u0 + off + i, v0 + r];
    if (side === 1) return [u0 + off + i, v0 + size - 1 - r];
    if (side === 2) return [u0 + r, v0 + off + i];
    return [u0 + size - 1 - r, v0 + off + i];
  };
  // one level for the whole booth. The pavement follows the ground and the
  // ground is allowed a step, so a single step is tolerated and filled — the
  // booth stands on a little plinth — and anything steeper is no booth.
  const tops = [];
  for (let i = 0; i < 3; i++) {
    for (let r = 0; r < 2; r++) {
      const [u, v] = cell(i, r);
      const t = dryTop(planet, f, u, v);
      if (t < 0) return false;
      tops.push([u, v, t]);
    }
  }
  const t0 = Math.max(...tops.map((x) => x[2]));
  if (tops.some(([, , t]) => t0 - t > 1) || t0 + 5 >= H) return false;
  const tint = 1 + ((rand() * 6) | 0);               // never white, never black
  const wall = cement(tint);
  for (const [u, v, t] of tops) {
    if (t < t0) planet.set(f, u, v, t0, wall);       // the plinth course
  }
  for (let i = 0; i < 3; i++) {
    for (let r = 0; r < 2; r++) {
      const [u, v] = cell(i, r);
      for (let h = t0 + 1; h <= t0 + 2; h++) {
        // the serving window: an open counter cell in the middle of the
        // kerb row, table below, air above; the middle of the back row is
        // the keeper's spot and stays open too
        const open = i === 1;
        if (open && r === 0 && h === t0 + 1) planet.set(f, u, v, h, BLOCK.TABLE);
        else if (open) planet.set(f, u, v, h, BLOCK.AIR);
        else planet.set(f, u, v, h, wall);
      }
      planet.set(f, u, v, t0 + 3, wall);             // the flat roof
    }
  }
  const [lu, lv] = cell(0, 0);
  lit(planet, f, lu, lv, t0 + 4, BLOCK.LANTERN);
  // half the kiosks are the smallest shop in the game
  if (rand() < 0.5) {
    const [cu, cv] = cell(1, 0);
    const [ku, kv] = cell(1, 1);
    const sdir = dirFromCell(f, ku + 0.5, kv + 0.5);
    (planet.shopList ??= []).push({
      f, u0: cu, v0: cv, w: 1, d: 1, base: t0,
      counter: [{ u: cu, v: cv }], h: t0 + 1,
      // ...and WHICH WAY HE FACES, which is over his own counter. Nothing ever
      // told a keeper that: `dir` is where he stands, and a spawned villager
      // takes an arbitrary tangent for a heading — so the man in the booth had
      // an even chance of serving the back wall. See spawnKeepers.
      keeper: { u: ku, v: kv, h: t0 + 1, dir: [sdir[0], sdir[1], sdir[2]],
        at: [...dirFromCell(f, cu + 0.5, cv + 0.5)] },
      culture: 'city',
      site: { f, u: cu, v: cv, dir: [...sdir], name: 'kiosk', houses: 0 },
    });
    return 'shop';
  }
  return true;
}


// --- the stock house ---------------------------------------------------------
//
// "A building of several floors of different animals." A city of concrete
// still eats, and nothing in it said where the food came from. So some plots
// outside downtown carry a BYRE instead of a tower: the same poured cement as
// everything else on the street — never brick, this is the city — three or
// four storeys of it, with a different species on every floor. Cattle on the
// ground, where the doors are wide enough to drive them in; then pigs, then
// sheep, then the hen loft under the roof.
//
// Two things make an upper floor liveable for an animal, and both are rules
// the rest of the game already runs on:
//
//   * every pen entry carries an `h`, the cell its stock stands in, and the
//     spawner pins them to it — `buried`, which means "I know exactly which
//     cell this one is in" (see CLAUDE.md). Without it they read the height
//     field, which anywhere under a roof answers with the ridge, and the
//     whole herd is put on the roof.
//   * the stair bay is railed off from the pen with a gate in it, so the
//     stock keeps to its own floor and the farmer still walks through.
//
// One farmer per floor then costs nothing at all: a floor IS a pen entry, and
// entities.js puts a hand on every pen on the planet — see spawnFarmhands.
const BYRE = {
  storey: 5,          // a deck and four clear courses: headroom for a cow
  floors: 4,          // at most — the world's own headroom may allow fewer
  // ground floor first, and the heaviest beast on it. `n` is how many head.
  stock: [
    { kind: 'cow', n: 2 },
    { kind: 'pig', n: 3 },
    { kind: 'sheep', n: 3 },
    { kind: 'chicken', n: 4 },
  ],
};

function stockHouse(planet, f, u0, v0, w, d, base, rand, door) {
  const ST = BYRE.storey;
  const u1 = u0 + w - 1, v1 = v0 + d - 1;
  if (w < 9 || d < 9) return false;
  // as many floors as the headroom allows, never more than there are species
  const floors = Math.min(BYRE.floors, BYRE.stock.length,
    Math.floor((H - 4 - base) / ST));
  if (floors < 2) return false;
  const top = base + floors * ST;            // the roof deck's own course
  const skin = pickConcrete(rand);
  const [du, dv] = door;
  const ax = du !== 0;

  // --- the shell -----------------------------------------------------------
  // Poured cement, exactly like the towers either side of it: a byre on this
  // world is a city building, not a barn somebody carted in. What tells it
  // apart from the street is the RAILS — a course of fence round every floor
  // in place of the tower's band of glass — so you can see the stock from the
  // pavement, and the floors breathe.
  for (let h = base + 1; h <= top; h++) {
    const k = (h - base - 1) % ST;           // course within the storey
    for (let u = u0; u <= u1; u++) {
      for (let v = v0; v <= v1; v++) {
        const edge = u === u0 || v === v0 || u === u1 || v === v1;
        if (edge) {
          const corner = (u === u0 || u === u1) && (v === v0 || v === v1);
          const along = (u === u0 || u === u1) ? v - v0 : u - u0;
          // a rail is a full cell to anything that walks — the same block a
          // village pen is fenced with — so an open wall is still a wall to
          // the stock behind it
          // TWO courses of it, with a post every fourth bay: one course read
          // as a row of little windows from the street, and what a byre wants
          // is an open side you can see the stock through. A rail is a full
          // cell to anything that walks — and since floorNear learned that a
          // fence is not a floor, it is not a step up either.
          const rail = !corner && (k === 1 || k === 2) && along % 4 !== 0;
          planet.set(f, u, v, h, rail ? BLOCK.FENCE
            : (k === ST - 1 ? skin.trim : skin.wall));
        } else if (k === ST - 1) {
          planet.set(f, u, v, h, skin.wall);        // the floor above's deck
        } else {
          planet.set(f, u, v, h, BLOCK.AIR);        // the storey under it
        }
      }
    }
  }
  // the parapet, and a light on the roof: the byre is the one building on the
  // block you can stand on top of without a tower's thirteen storeys
  for (let u = u0; u <= u1; u++) {
    for (let v = v0; v <= v1; v++) {
      const edge = u === u0 || v === v0 || u === u1 || v === v1;
      if (edge && top + 1 < H) planet.set(f, u, v, top + 1, skin.wall);
    }
  }
  if (top + 1 < H) lit(planet, f, u0 + 1, v1 - 1, top + 1, BLOCK.LANTERN);

  // --- the stair -----------------------------------------------------------
  // One flight a storey against the v0 wall, switching direction each floor
  // and cutting its own well through the deck it arrives at — the same fire
  // stair the towers climb. The last flight goes to the roof.
  const sv = v0 + 1;
  const iu0 = u0 + 1, iu1 = u1 - 1;
  for (let m = 0; m < floors; m++) {
    const from = base + m * ST;              // the deck you leave
    const to = base + (m + 1) * ST;          // the one you arrive at
    const dirU = (m & 1) === 0 ? 1 : -1;
    const startU = dirU > 0 ? iu0 : iu1;
    for (let i = 0; i <= to - from; i++) {
      const u = startU + dirU * i;
      if (u < iu0 || u > iu1) break;
      // headroom opens a tread EARLY: the step-up retries the whole body a
      // block higher at the cell it starts from, so a ceiling that clears the
      // geometry by eye still stops the climb. See the towers' own stair.
      if (i >= to - from - 3) planet.set(f, u, sv, to, BLOCK.AIR);
      if (i >= 1) {
        planet.set(f, u, sv, from + i, stair(MAT.COBBLE, dirU > 0 ? 0 : 1));
      }
    }
  }

  // --- the floors, and what stands on them ---------------------------------
  const pens = [];
  const gu = u0 + (w >> 1);                  // where the gate in the rail is
  for (let m = 0; m < floors; m++) {
    const deck = base + m * ST;              // this floor's own surface
    const stand = deck + 1;                  // the cell its stock stands in
    const S0 = BYRE.stock[m];
    // earth on the ground floor — cattle stand on ground, even in a city —
    // and the poured deck above it, swept
    if (m === 0) {
      for (let u = u0 + 1; u < u1; u++) {
        for (let v = v0 + 1; v < v1; v++) {
          planet.set(f, u, v, deck, rand() < 0.3 ? BLOCK.GRASS : BLOCK.DIRT);
        }
      }
    }
    // the rail that keeps the stock off the stair, and the gate the farmer
    // walks through. Without it the herd finds the stairwell and the whole
    // building is one pen.
    for (let u = u0 + 1; u < u1; u++) {
      planet.set(f, u, v0 + 2, stand, u === gu ? BLOCK.GATE : BLOCK.FENCE);
    }
    // the manger along the far wall: bales of hay, and a trough sunk INTO
    // the deck at the end of it, so the water is flush with the floor and
    // has solid cement on all four sides — a full cell of water on a first
    // floor would be a hole in the ceiling below
    for (let u = u0 + 2; u < u1 - 1; u += 2) {
      planet.set(f, u, v1 - 1, stand, slab(MAT.THATCH, 0));
    }
    planet.set(f, u0 + 1, v1 - 1, deck, BLOCK.WATER);
    // a lantern hung from the deck above, so every floor is lit at night
    lit(planet, f, u1 - 1, v0 + 3, deck + 4, BLOCK.LANTERN);

    // ...and the pen itself. The rectangle stops one short of the manger row
    // and starts one past the rail, so nothing is ever put down standing in
    // a hay bale, in the trough, or on the wrong side of the gate.
    pens.push({
      f, u: u0, v: v0 + 2, w, d: v1 - v0 - 2,
      kind: S0.kind, count: S0.n,
      h: stand,
      // where this floor's farmer stands: just inside his own gate
      keep: { u: gu, v: v0 + 3, h: stand },
    });
  }
  (planet.penList ??= []).push(...pens);

  // --- the doors -----------------------------------------------------------
  // Two cells wide and gated, on the street wall of the ground floor: wide
  // enough to drive cattle through, and shut, because they are cattle.
  const mid = ax ? v0 + ((d - 2) >> 1) : u0 + ((w - 2) >> 1);
  const dwu = du > 0 ? u1 : du < 0 ? u0 : mid;
  const dwv = dv > 0 ? v1 : dv < 0 ? v0 : mid;
  for (let i = 0; i < 2; i++) {
    const u = ax ? dwu : dwu + i, v = ax ? dwv + i : dwv;
    for (let h = base + 2; h <= base + 3; h++) planet.set(f, u, v, h, BLOCK.AIR);
    planet.set(f, u, v, base + 1, BLOCK.GATE);
    lit(planet, f, u, v, base + 4, BLOCK.LANTERN);
  }
  return true;
}

// --- buildings --------------------------------------------------------------

// Which building goes on this plot. The DISTRICT decides: its `styles` map is
// a weight per style name, and a style the district does not name is not built
// there at all — which is what stops a glass tower turning up in the middle of
// the old quarter.
function pickStyle(rand, district = null) {
  const w = district?.styles ?? null;
  let total = 0;
  for (const s of STYLES) total += w ? (w[s.name] ?? 0) : s.weight;
  if (total <= 0) return STYLES[STYLES.length - 1];
  let r = rand() * total;
  for (const s of STYLES) {
    r -= w ? (w[s.name] ?? 0) : s.weight;
    if (r <= 0) return s;
  }
  return STYLES[STYLES.length - 1];
}

// Is this cell a window?
//
// Windows are PANES now — sheets, not cubes — so the old rule about keeping
// glass cells isolated is retired: a pane costs two faces whoever its
// neighbour is, and a run of them is a curtain wall at curtain-net prices.
// `k` is the course within the storey (0 floor edge, 1 sill, 2 head), and a
// two-course window is what makes a glass tower read as one from the street.
function isWindow(style, k, along) {
  if (style.band === 'glass') return k >= 1;
  if (style.band === 'curtain') return k >= 1 && along % 2 === 1;
  if (style.band === 'ribbon') return k === 1 && along % 2 === 0;
  return k === 1 && along % 3 === 1;
}

/**
 * One building on a levelled plot, furnished all the way up.
 *
 * The towers used to be solid above the lobby — a cheap silhouette with two
 * floors of game at the bottom — and the way up was a ladder in a lift shaft.
 * Now every storey is a real floor: a staircase (stairs, never a ladder)
 * switchbacks up one wall from the ground to the top storey, each floor is
 * split into two rooms by a partition with a hung door in it, and the rooms
 * are furnished — beds with their feet on, a kitchen with a stove, a table
 * and its chairs, a lamp standing on a bookshelf. The bill for hollowing them
 * out is paid twice over by what left: the glass CUBES whose every face drew,
 * replaced by panes, and the traffic that used to drive the streets.
 */
function building(planet, f, u0, v0, w, d, base, style, storeys, rand, door) {
  const ST = CITY_TUNING.storey;
  const top = Math.min(H - 3, base + storeys * ST);
  const u1 = u0 + w - 1, v1 = v0 + d - 1;
  const skin = pickConcrete(rand);

  // --- the shell: walls, windows, floors -----------------------------------
  // Floors land on the first course of each storey; everything else inside
  // is air. The ground storey keeps the full three courses of headroom the
  // arithmetic gives it, which is what makes the lobby read as a lobby.
  for (let h = base + 1; h <= top; h++) {
    const k = (h - base - 1) % ST;          // course within the storey
    for (let u = u0; u <= u1; u++) {
      for (let v = v0; v <= v1; v++) {
        const edge = u === u0 || v === v0 || u === u1 || v === v1;
        if (edge) {
          const corner = (u === u0 || u === u1) && (v === v0 || v === v1);
          const along = (u === u0 || u === u1) ? v - v0 : u - u0;
          // corners are always solid: they are the structure, and a glass
          // corner reads as a hole in the silhouette
          const win = !corner && isWindow(style, k, along);
          planet.set(f, u, v, h, win
            ? pane
            : (k === ST - 1 ? skin.trim : skin.wall));
        } else if (k === 0 && h > base + 1) {
          planet.set(f, u, v, h, cement(0));          // the floor deck
        } else {
          planet.set(f, u, v, h, BLOCK.AIR);          // the room over it
        }
      }
    }
  }

  // --- roof: a solid deck, a parapet round it, a light and a mast on the
  // tall ones. Laid BEFORE the stair, which then cuts its well through it —
  // the other order paves the hole back over and the roof goes back to
  // being a lid.
  for (let u = u0; u <= u1; u++) {
    for (let v = v0; v <= v1; v++) {
      planet.set(f, u, v, top + 1, skin.wall);
      const edge = u === u0 || v === v0 || u === u1 || v === v1;
      // a full-height cement parapet, not a slab of cobble: the stair puts
      // people up here now, and the wall is the same pour as the building
      if (edge) planet.set(f, u, v, top + 2, skin.wall);
    }
  }
  if (storeys >= CITY_TUNING.towerHigh - 3) {
    lit(planet, f, u0 + 1, v0 + 1, top + 2, BLOCK.LANTERN);
    // the mast: a slim antenna on the far corner, a light at its head — the
    // skyline detail that says somebody broadcasts from up here
    const P = BLOCK.POST ?? BLOCK.FENCE;
    for (let h = top + 2; h <= top + 4; h++) planet.set(f, u1 - 1, v1 - 1, h, P);
    lit(planet, f, u1 - 1, v1 - 1, top + 5, BLOCK.LANTERN);
  }

  // --- the stair -----------------------------------------------------------
  // One straight flight per storey against the v0 wall, switching direction
  // each storey like a fire stair, cut through the floor it arrives at. The
  // ground flight is four risers — the lobby is a course taller — and every
  // one above is three.
  // The LAST flight goes to the ROOF: the deck up there gets a stairwell
  // hole like any other floor, because the top of the building is a place
  // the player asked to stand on, not a lid.
  const sv = v0 + 1;
  const iu0 = u0 + 1, iu1 = u1 - 1;
  if (iu1 - iu0 >= 4) {
    for (let m = 0; m < storeys; m++) {
      const from = m === 0 ? base : base + 1 + ST * m;  // the floor you leave
      const to = m === storeys - 1
        ? top + 1                                       // the roof deck
        : base + 1 + ST * (m + 1);                      // the next floor
      const dirU = (m & 1) === 0 ? 1 : -1;
      const startU = dirU > 0 ? iu0 : iu1;              // the landing end
      for (let i = 0; i <= to - from; i++) {
        const u = startU + dirU * i;
        // headroom: the deck above opens over the top of the flight AND one
        // tread earlier — the step-up retries the whole body a block higher
        // AT THE CELL IT STARTS FROM, so a ceiling that clears the geometry
        // by eye still stops the climb unless it opens a cell early. This is
        // the broken ceiling that lets you actually walk up, and on the last
        // flight it is the hole in the roof.
        if (i >= to - from - 3) planet.set(f, u, sv, to, BLOCK.AIR);
        if (i >= 1) {
          planet.set(f, u, sv, from + i, stair(MAT.COBBLE, dirU > 0 ? 0 : 1));
        }
      }
    }
  }

  // --- rooms and what is in them -------------------------------------------
  // Each upper storey is an apartment: a partition with a hung door splits
  // the kitchen-diner (stair side) from the bedroom, and the handful of
  // pieces that make either read as one. The rule from the villages holds
  // here: a room is mostly floor, the light stands on top of something, and
  // a chair's facing names the side its back is on.
  const vP = v0 + (d >> 1);                 // the partition row
  const roomy = d >= 10 && w >= 8;          // enough floor to split at all
  const bedTint = [0, 4, 5, 8, 9][(rand() * 5) | 0];   // one house, one linen
  for (let m = 1; m < storeys; m++) {
    const deck = base + 1 + ST * m;         // this storey's floor course
    const fh = deck + 1;                    // where furniture stands
    if (fh + 1 > top) break;
    if (roomy) {
      // the partition, and the door in it — hung closed: the people who
      // live here are out on the pavement, not stood in their own hall
      for (let u = iu0; u <= iu1; u++) {
        for (let h = deck + 1; h < deck + ST; h++) {
          planet.set(f, u, vP, h, skin.trim);
        }
      }
      const uD = u0 + (w >> 1);
      for (let h = deck + 1; h < deck + ST; h++) {
        planet.set(f, uD, vP, h, BLOCK.AIR);
      }
      if (hangFlat) planet.set(f, uD, vP, deck + 1, hangFlat(2, false));

      // the bedroom, beyond the partition: beds with their heads on the
      // street wall, feet into the room, matching linen
      if (bedHead && bedFoot) {
        const beds = 2 + (rand() < 0.4 ? 1 : 0);
        for (let b = 0; b < beds; b++) {
          const ub = u0 + 2 + b * 2;
          if (ub > iu1 - 1) break;
          planet.set(f, ub, v1 - 1, fh, bedHead(bedTint, 2));
          planet.set(f, ub, v1 - 2, fh, bedFoot(bedTint, 2));
          bedLog?.push({ f, u: ub, v: v1 - 1, h: fh });
        }
      }
      // the light, on top of the bookshelf in the corner
      planet.set(f, iu1, v1 - 1, fh, BLOCK.BOOKSHELF);
      lit(planet, f, iu1, v1 - 1, fh + 1, BLOCK.LAMP);

      // the kitchen-diner, stair side: stove and bench on the wall, the
      // table in the floor with a chair either side, backs outward
      planet.set(f, iu1, v0 + 3, fh, BLOCK.FURNACE);
      planet.set(f, iu1, v0 + 4, fh, BLOCK.CRAFTING_TABLE);
      const uT = u0 + (w >> 1);
      planet.set(f, uT, v0 + 3, fh, BLOCK.TABLE);
      planet.set(f, uT - 1, v0 + 3, fh, chairAt(1));
      planet.set(f, uT + 1, v0 + 3, fh, chairAt(0));
    } else {
      // a plot too small to split still gets lived in: bed, light, table
      if (bedHead && bedFoot) {
        planet.set(f, iu0 + 1, v1 - 1, fh, bedHead(bedTint, 2));
        planet.set(f, iu0 + 1, v1 - 2, fh, bedFoot(bedTint, 2));
        bedLog?.push({ f, u: iu0 + 1, v: v1 - 1, h: fh });
      }
      planet.set(f, iu1, v1 - 1, fh, BLOCK.BOOKSHELF);
      lit(planet, f, iu1, v1 - 1, fh + 1, BLOCK.LAMP);
    }
  }

  // --- the door: two cells wide and three tall, CENTRED on the street wall.
  // An even front takes the two middle cells — the old sum put the opening a
  // cell off centre, three courses of wall one side and five the other, and
  // you could see it without being able to say what was wrong.
  // A corner plot is offered both roads; taking both used to put the
  // opening ON the corner, notched into the structure itself. One wall,
  // middle of it.
  let [du, dv] = door;
  if (du && dv) dv = 0;
  const mid = du ? v0 + ((d - 2) >> 1) : u0 + ((w - 2) >> 1);
  const wu = du > 0 ? u1 : du < 0 ? u0 : mid;
  const wv = dv > 0 ? v1 : dv < 0 ? v0 : mid;
  for (let i = 0; i < 2; i++) {
    const u = du ? wu : wu + i;
    const v = du ? wv + i : wv;
    for (let h = base + 1; h <= base + 3; h++) planet.set(f, u, v, h, BLOCK.AIR);
    // a lit canopy over the entrance
    lit(planet, f, u, v, base + 4, BLOCK.LANTERN);
  }
  {
    // the front door, on the borough's book: the same record a village door
    // leaves, so a citizen can be given this doorstep to walk to
    const u = du ? wu : wu, v = du ? wv : wv;
    const dd = dirFromCell(f, u + 0.5, v + 0.5);
    doorLog?.push({ f, u, v, h: base + 1, du: du || 0, dv: dv || 0,
      dir: [dd[0], dd[1], dd[2]] });
  }
  // the lobby: a light, and a bench of a kitchen for the ground floor —
  // stove, table, chairs — kept to the wall the stair does not use
  lit(planet, f, u0 + (w >> 1), v0 + (d >> 1), base + 3, BLOCK.LAMP);
  if (roomy) {
    planet.set(f, iu1, v1 - 1, base + 1, BLOCK.FURNACE);
    planet.set(f, iu1 - 1, v1 - 1, base + 1, BLOCK.CRAFTING_TABLE);
    const uT = u0 + (w >> 1), vT = v1 - 2;
    planet.set(f, uT, vT, base + 1, BLOCK.TABLE);
    planet.set(f, uT - 1, vT, base + 1, chairAt(1));
    planet.set(f, uT + 1, vT, base + 1, chairAt(0));
  }
  return {
    f, u0, v0, w, d, base, top, storeys,
    style: style.name,
    skin: skin.name,
    // which quarter it went up in — the only way to tell afterwards, since a
    // finished building carries no record of the rules that shaped it
    district: style.district ?? null,
    // where the way in is — the first cell of the two-wide opening and the
    // way it faces. The borough pass needs it to dress its hall's ground
    // floor without re-deriving the plot arithmetic that carved it.
    door: { u: wu, v: wv, du: du || 0, dv: dv || 0 },
  };
}

// --- the shopfront -----------------------------------------------------------
//
// A 'shops' building's ground floor IS a shop: a counter across the walk-in,
// the keeper's spot behind it, and an entry on planet.shopList — the same
// list a village shop goes on, so the counter opens the same window, the
// same shelves derive from (cell, seed, day), and buying goes through the
// same ledger. The entry carries a little site of its own (the ledger keys
// off any {f,u,v}), named for the district, so the till has a book to write
// in on a planet with no villages.
function shopFront(planet, f, u0, v0, w, d, base, du, dist) {
  const u1 = u0 + w - 1, v1 = v0 + d - 1;
  const uC = u0 + (w >> 1);
  const counter = [];
  for (let v = v0 + 2; v <= v1 - 2; v++) {
    planet.set(f, uC, v, base + 1, BLOCK.TABLE);
    counter.push({ u: uC, v });
  }
  if (!counter.length) return null;
  // the keeper stands on the far side of the counter from the door
  const uK = du > 0 ? uC - 1 : uC + 1;
  const vK = v0 + (d >> 1);
  const sdir = dirFromCell(f, uK + 0.5, vK + 0.5);
  const entry = {
    f, u0, v0, w, d, base,
    counter, h: base + 1,
    keeper: { u: uK, v: vK, h: base + 1, dir: [sdir[0], sdir[1], sdir[2]] },
    culture: 'city',
    // the pseudo-site: enough identity for a ledger record and a name over
    // the window, and nothing that would make the village machinery think a
    // settlement stands here
    site: { f, u: u0, v: v0, dir: [...sdir], name: dist.name, houses: 0 },
  };
  (planet.shopList ??= []).push(entry);
  // ...AND THE STOCKROOM UNDER IT, "full of boxes like the other planets":
  // the same cellar a village shop digs — six bays, twelve chests, a ladder
  // up through the floor — through the same exported function, so main.js's
  // syncStore fills these boxes from this counter's own shelf with nothing
  // city-shaped anywhere in it. Poured walls, because this is the city.
  // The ladder must not surface into the stair row (v0+1 carries the flight
  // to the flats above) nor into the doorway, the counter or the keeper.
  const avoid = [...counter, { u: uK, v: vK }];
  for (let u = u0 + 1; u <= u1 - 1; u++) avoid.push({ u, v: v0 + 1 });
  if (du) {
    const wu = du > 0 ? u1 - 1 : u0 + 1;         // just inside the door wall
    const mid = v0 + ((d - 2) >> 1);
    avoid.push({ u: wu, v: mid }, { u: wu, v: mid + 1 });
  }
  entry.store = cellar(planet, { f, u0, v0, w, d }, base,
    { masonry: grey(1), light: BLOCK.LANTERN }, { u: uK, v: vK }, avoid);
  return entry;
}

// --- the tube ---------------------------------------------------------------
//
// A tunnel under every third avenue, following the ground rather than running
// level: a metro that held one altitude would surface on the hills and be
// buried a hundred cells deep in the valleys. Stations are a widening of the
// tunnel with a stair shaft up to the pavement, and half of them have a train
// standing at the platform.

function tubeTunnel(planet, f, ax, at, from, to, out) {
  const D = CITY_TUNING.tubeDepth;
  const half = 2;              // 5 cells wide
  for (let i = from; i < to; i++) {
    const cu = ax ? at : i, cv = ax ? i : at;
    const t = groundTop(planet, f, cu, cv);
    if (t < 12) continue;                       // no room under this column
    const ceil = t - D;
    const floor = ceil - 4;
    if (floor < 2) continue;
    for (let j = -half; j <= half; j++) {
      const u = ax ? at + j : i, v = ax ? i : at + j;
      if (!inFace(u, v)) continue;
      planet.set(f, u, v, floor, BLOCK.COBBLE);           // trackbed
      for (let h = floor + 1; h < ceil; h++) planet.set(f, u, v, h, BLOCK.AIR);
      planet.set(f, u, v, ceil, BLOCK.STONE);             // crown
      if (j === -half || j === half) {
        for (let h = floor + 1; h < ceil; h++) {
          planet.set(f, u, v, h, BLOCK.STONE);            // tunnel wall
        }
      }
    }
    // rails, and a lamp every eight cells so the tunnel is not pitch dark
    for (const j of [-1, 1]) {
      const u = ax ? at + j : i, v = ax ? i : at + j;
      if (inFace(u, v)) planet.set(f, u, v, floor + 1, BLOCK.IRON);
    }
    if (i % 8 === 0) {
      const u = ax ? at : i, v = ax ? i : at;
      planet.set(f, u, v, ceil - 1, BLOCK.LANTERN);
    }
    out.cells++;
  }
}

// A station: platforms either side of the track, a stair shaft to the street
// and an entrance on the pavement.
function tubeStation(planet, f, ax, at, i, rand, out) {
  const D = CITY_TUNING.tubeDepth;
  const t = groundTop(planet, f, ax ? at : i, ax ? i : at);
  if (t < 14) return null;
  const ceil = t - D, floor = ceil - 4;
  if (floor < 2) return null;
  const LEN = 11;
  const half = 3;                       // widened by one either side

  for (let n = -((LEN - 1) >> 1); n <= (LEN - 1) >> 1; n++) {
    const along = i + n;
    for (let j = -half; j <= half; j++) {
      const u = ax ? at + j : along, v = ax ? along : at + j;
      if (!inFace(u, v)) continue;
      planet.set(f, u, v, floor, BLOCK.COBBLE);
      for (let h = floor + 1; h <= ceil; h++) planet.set(f, u, v, h, BLOCK.AIR);
      planet.set(f, u, v, ceil + 1, BLOCK.STONE);
      // platforms: one course up, on both flanks, in pale tile
      if (Math.abs(j) >= 2) {
        planet.set(f, u, v, floor + 1, BLOCK.CLAY);
        if (Math.abs(j) === half) {
          for (let h = floor + 2; h <= ceil; h++) {
            planet.set(f, u, v, h, BLOCK.BRICK);
          }
        }
      }
    }
    for (const j of [-1, 1]) {
      const u = ax ? at + j : along, v = ax ? along : at + j;
      if (inFace(u, v)) planet.set(f, u, v, floor + 1, BLOCK.IRON);
    }
    if (((along % 4) + 4) % 4 === 0) {
      const u = ax ? at + 2 : along, v = ax ? along : at + 2;
      if (inFace(u, v)) planet.set(f, u, v, ceil - 1, BLOCK.LANTERN);
    }
  }

  // the shaft: a 2x2 well from the platform up to daylight, climbed by a
  // SPIRAL STAIR — a riser per cell, turning a quarter each step, the way a
  // 2x2 stairwell is actually built. No ladders in this city.
  const su = ax ? at + half : i + 4;
  const sv = ax ? i + 4 : at + half;
  // cell order round the well, and the facing that climbs INTO each cell
  const TURN = [[0, 0, 3], [1, 0, 0], [1, 1, 2], [0, 1, 1]];
  for (let h = floor + 2; h <= t + 1; h++) {
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        if (inFace(su + a, sv + b)) planet.set(f, su + a, sv + b, h, BLOCK.AIR);
      }
    }
    const [a, b, fc] = TURN[(h - (floor + 2)) % 4];
    if (inFace(su + a, sv + b)) planet.set(f, su + a, sv + b, h, stair(MAT.COBBLE, fc));
  }
  // an entrance surround on the street, so the hole is not a trap — and its
  // lanterns in a light bucket of their own, so a station glows at night
  // like everything else on the street
  glowLog = [];
  for (let a = -1; a <= 2; a++) {
    for (let b = -1; b <= 2; b++) {
      const u = su + a, v = sv + b;
      if (!inFace(u, v)) continue;
      const ring = a === -1 || b === -1 || a === 2 || b === 2;
      if (!ring) continue;
      planet.set(f, u, v, t + 1, cement(0));
      planet.set(f, u, v, t + 2, cement(0));
      lit(planet, f, u, v, t + 3, BLOCK.LANTERN);
    }
  }
  if (glowLog.length) {
    const cd = dirFromCell(f, su + 0.5, sv + 0.5);
    _stationGlow.push({ f, u: su, v: sv, dir: [cd[0], cd[1], cd[2]],
      glow: glowLog });
  }
  glowLog = null;

  // a train standing at the platform, half the time: two carriages of iron
  // and glass with a lit interior
  if (rand() < 0.5) {
    for (let n = -4; n <= 4; n++) {
      if (n === 0) continue;                     // the gap between carriages
      const along = i + n;
      for (let j = -1; j <= 1; j++) {
        const u = ax ? at + j : along, v = ax ? along : at + j;
        if (!inFace(u, v)) continue;
        const end = n === -4 || n === 4 || n === -1 || n === 1;
        for (let h = floor + 2; h <= floor + 4; h++) {
          const side = Math.abs(j) === 1;
          planet.set(f, u, v, h,
            (side || end) ? (h === floor + 3 ? BLOCK.GLASS : BLOCK.IRON)
              : BLOCK.AIR);
        }
        planet.set(f, u, v, floor + 5, BLOCK.IRON);
        if (!end && j === 0) planet.set(f, u, v, floor + 4, BLOCK.LANTERN);
      }
    }
  }

  const dir = dirFromCell(f, (ax ? su : i) + 0.5, (ax ? i : sv) + 0.5);
  out.stations.push({
    f, u: ax ? at : i, v: ax ? i : at, top: t, floor,
    entrance: { u: su, v: sv, h: t + 1 },
    dir: [dir[0], dir[1], dir[2]],
  });
  return true;
}

// --- the whole thing --------------------------------------------------------

/**
 * Build the city over the entire planet and record it on `planet.city`.
 *
 *   buildCity(planet, seed);
 *   planet.city   // { period, road, margin, blocks, towers, stations, ... }
 *
 * The descriptor is what citylife.js drives traffic and crowds off — the
 * road grid is arithmetic, so nothing has to store where the streets are.
 */
// --- district props ---------------------------------------------------------

// The market's awning: a run of coloured slabs on brackets, projecting over
// the pavement along one edge of the block. Colour is the whole point — it is
// the only strongly-coloured thing at street level anywhere in the city, so a
// market district reads as one from the far end of the avenue.
//
// Slabs, not full blocks: a shopper has to be able to walk under it, and the
// physics treats a half block as full height, so the awning has to be a
// course ABOVE head height rather than something you could stand on.
function awning(planet, f, u0, v0, size, rand) {
  const tint = 1 + Math.floor(rand() * 6);      // never white and never black
  const cloth = CS.cementId ? CS.cementId(tint) : BLOCK.BRICK;
  const side = Math.floor(rand() * 4);
  let n = 0;
  for (let k = 2; k < size - 2; k++) {
    const u = side === 0 ? u0 + k : side === 1 ? u0 + k : u0 + 1;
    const v = side === 0 ? v0 + 1 : side === 1 ? v0 + size - 2 : v0 + k;
    const uu = side < 2 ? u : (side === 2 ? u0 + 1 : u0 + size - 2);
    const vv = side < 2 ? v : v0 + k;
    const t = dryTop(planet, f, uu, vv);
    if (t < 0) continue;
    // the bracket, then the cloth over it a course higher
    if (k % 3 === 0) planet.set(f, uu, vv, t + 3, BLOCK.POST ?? BLOCK.LOG);
    planet.set(f, uu, vv, t + 4, slab(MAT.COBBLE, 0));
    // ...and the cloth reaching one cell further out over the kerb
    const ou = side === 0 ? uu : side === 1 ? uu : (side === 2 ? uu - 1 : uu + 1);
    const ov = side === 0 ? vv - 1 : side === 1 ? vv + 1 : vv;
    const ot = dryTop(planet, f, ou, ov);
    if (ot >= 0) planet.set(f, ou, ov, ot + 4, cloth);
    n++;
  }
  return n;
}

// --- the city hall -----------------------------------------------------------
//
// "I do not see a mayor — is there a house?" There was not. The mayor sat on
// a chair in the corner of an ordinary tower lobby, indistinguishable from
// every other lobby in the borough, and the borough's name was written
// nowhere in the world at all. This dresses the chosen tower's ground floor
// as a hall of office: the lobby cleared of its kitchen, a dais with the
// throne on it facing the room, white stone jambs and a lintel round the
// entrance — and the borough's NAME on a board over the door, through the
// same record a village hangs over its road gates, so main.js letters it
// without knowing anything about cities.
function cityHall(planet, hall) {
  const { f, u0, v0, w, d, base } = hall;
  const u1 = u0 + w - 1, v1 = v0 + d - 1;
  const door = hall.door;
  if (!door) return null;
  const white = cement(0);
  const glow = [];

  // The lobby, cleared. The ground floor of a city hall is a court, not a
  // kitchen-diner — but the stair row keeps its flight: the storeys above
  // are still homes, and the way up is not the mayor's to close.
  for (let u = u0 + 1; u < u1; u++) {
    for (let v = v0 + 1; v < v1; v++) {
      if (v === v0 + 1) continue;                   // the stair's row
      for (let h = base + 1; h <= base + 3; h++) {
        planet.set(f, u, v, h, BLOCK.AIR);
      }
    }
  }

  // The dais: against the wall opposite the door, throne facing the room.
  // When the door is on the +v wall the opposite row belongs to the stair,
  // so the dais steps aside to the far u wall — a throne looking across the
  // room is still a throne, and a throne inside a staircase is not.
  // A chair's facing names the side its BACK stands on: 0 +u, 1 -u, 2 +v,
  // 3 -v — see "What is in a room" in CLAUDE.md.
  let bu, bv, face;
  if (door.du > 0) { bu = u0 + 1; bv = v0 + (d >> 1); face = 1; }
  else if (door.du < 0) { bu = u1 - 1; bv = v0 + (d >> 1); face = 0; }
  else if (door.dv < 0) { bu = u0 + (w >> 1); bv = v1 - 1; face = 2; }
  else { bu = u1 - 1; bv = v0 + (d >> 1); face = 0; }
  const along = (face === 2 || face === 3) ? [1, 0] : [0, 1];
  for (const k of [-1, 0, 1]) {
    const pu = bu + along[0] * k, pv = bv + along[1] * k;
    if (pu <= u0 || pu >= u1 || pv <= v0 + 1 || pv >= v1) continue;
    planet.set(f, pu, pv, base + 1, white);          // the dais course
    if (k !== 0) {
      planet.set(f, pu, pv, base + 2, BLOCK.LAMP);   // a light either side
      glow.push({ f, u: pu, v: pv, h: base + 2 });
    }
  }
  planet.set(f, bu, bv, base + 2,
    CS.chairId ? CS.chairId(face) : BLOCK.TABLE);
  const backOf = { 0: [1, 0], 1: [-1, 0], 2: [0, 1], 3: [0, -1] }[face];
  const seat = {
    f, u: bu, v: bv, h: base + 2,
    // the cell the man on it should be LOOKING at — spawnChief turns him
    // toward it, so a mayor holds court facing his own room whichever wall
    // his door happens to be on
    gaze: { u: bu - backOf[0], v: bv - backOf[1] },
  };

  // The entrance, dressed: white jambs up both sides of the opening, a white
  // lintel across it, and the name board's own course above that — a run of
  // white cement main.js hangs the lettered canvas on. The board is what
  // answers "I do not see any city name": it is the same board a village
  // gate carries, on the one building in the borough that holds an office.
  const ax = door.du !== 0 ? 1 : 0;         // 1: opening runs along v
  const wu = door.u, wv = door.v;
  const cells = (h, from, to) => {
    for (let k = from; k <= to; k++) {
      const u = ax ? wu : wu + k, v = ax ? wv + k : wv;
      if (u < u0 || u > u1 || v < v0 || v > v1) continue;
      planet.set(f, u, v, h, white);
    }
  };
  for (const k of [-1, 2]) {                // the jambs
    const u = ax ? wu : wu + k, v = ax ? wv + k : wv;
    if (u >= u0 && u <= u1 && v >= v0 && v <= v1) {
      for (let h = base + 1; h <= base + 3; h++) planet.set(f, u, v, h, white);
    }
  }
  cells(base + 4, -1, 2);                   // the lintel
  cells(base + 5, -1, 2);                   // the board's timber, in stone
  for (const k of [-2, 3]) {                // lanterns flanking the board
    const u = ax ? wu : wu + k, v = ax ? wv + k : wv;
    if (u >= u0 && u <= u1 && v >= v0 && v <= v1) {
      planet.set(f, u, v, base + 5, BLOCK.LANTERN);
      glow.push({ f, u, v, h: base + 5 });
    }
  }

  // the board record, exactly the shape roadGate hands back: the CENTRE of
  // the opening (fractional — cellCenterWorld takes it), which way is out,
  // and how wide the board may be
  const cu = ax ? wu : wu + 0.5, cv = ax ? wv + 0.5 : wv;
  const d0 = dirFromCell(f, cu + 0.5, cv + 0.5);
  const d1 = dirFromCell(f, cu + door.du + 0.5, cv + door.dv + 0.5);
  const sign = {
    f, u: cu, v: cv, h: base + 5,
    dir: [d0[0], d0[1], d0[2]],
    out: [d1[0] - d0[0], d1[1] - d0[1], d1[2] - d0[2]],
    span: 4,
  };
  return { seat, sign, glow };
}

// A borough's name over its tube stations, on the same board machinery: a
// course of white cement laid over one side of the entrance surround, and the
// record main.js letters. A city with its name at every station is a city you
// can find your way round, which is what stations are for.
function stationSign(planet, st) {
  const { f } = st;
  const su = st.entrance.u, sv = st.entrance.v, t = st.top;
  if (t + 4 >= H) return null;
  for (let k = -1; k <= 2; k++) planet.set(f, su + k, sv - 1, t + 4, cement(0));
  const cu = su + 0.5, cv = sv - 1;
  const d0 = dirFromCell(f, cu + 0.5, cv + 0.5);
  const d1 = dirFromCell(f, cu + 0.5, cv - 0.5);
  return {
    f, u: cu, v: cv, h: t + 4,
    dir: [d0[0], d0[1], d0[2]],
    out: [d1[0] - d0[0], d1[1] - d0[1], d1[2] - d0[2]],
    span: 4,
  };
}

// Station entrance lights, collected while the tube is cut and folded onto
// the descriptor at the end — tubeStation cannot reach `out` from where it
// runs.
let _stationGlow = [];

export function buildCity(planet, seed = 1, opts = {}) {
  const T = { ...CITY_TUNING, ...opts };
  const rand = mulberry32((seed ^ 0xc17e5) | 0);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

  // The margin keeps buildings off the face seam, where the neighbouring
  // grid is rotated and a wall running across would come out sheared. It is
  // a fraction of the face rather than a constant, or a radius-50 world —
  // 80 cells to a face — would be all margin and hold two blocks.
  const margin = Math.min(T.margin, Math.max(6, Math.round(S * 0.08)));
  const usable = S - 2 * margin;
  const period = T.period;
  const nb = Math.floor(usable / period);
  const size = period - T.road;               // a block, pavement included

  // Parkland is the cost governor. The grid covers the whole planet at every
  // world size, but a radius-800 world has thirty-six times the blocks of a
  // radius-156 one, and building all of them would cost minutes and a
  // gigabyte. So above `maxBlocks` the extra blocks become parks instead:
  // the city still reaches pole to pole, it just has more green in it. The
  // figure is reported on the descriptor rather than being silently applied.
  // How tall the tallest tower may be, in storeys. A 13-storey tower is 52
  // blocks, which is a skyline on a radius-400 world and a spike sticking a
  // tenth of the way to orbit on a radius-50 one. Height therefore follows
  // the planet: the city looks the same from the street either way, and the
  // silhouette from orbit stays a city rather than a sea urchin.
  const tall = Math.max(3, Math.min(CITY_TUNING.towerHigh,
    Math.round(CS.R / 14)));
  const total = 6 * nb * nb;
  const parkChance = Math.min(0.8,
    Math.max(T.parkChance, 1 - T.maxBlocks / Math.max(1, total)));

  const out = {
    period, road: T.road, margin: margin, size, nb, parkChance,
    // citylife.js reads this to put people ON the pavement. It was never
    // written down, so every crowd spawn rolled its offset off `undefined`,
    // got NaN, and failed — a city of empty streets with the machinery for
    // crowds running every frame.
    pavement: T.pavement,
    gridBlocks: total,
    blocks: 0, parks: 0, towers: [], stations: [], cells: 0,
    // how many built blocks each quarter got, for the stats line and the tests
    byDistrict: {},
    districts: DISTRICTS.map((d) => d.name),
  };
  if (nb < 1 || size < 8) { planet.city = out; return out; }

  for (let f = 0; f < 6; f++) {
    for (let bi = 0; bi < nb; bi++) {
      for (let bj = 0; bj < nb; bj++) {
        const u0 = margin + bi * period + T.road;
        const v0 = margin + bj * period + T.road;
        // A block whose four corners are wet is sea; skipping it here saves
        // surveying every plot on it.
        if (dryTop(planet, f, u0, v0) < 0
          && dryTop(planet, f, u0 + size - 1, v0 + size - 1) < 0) continue;
        // Which quarter of the city this block stands in. It decides what
        // gets built here, how tall, how green, and what furniture the
        // street carries — see DISTRICTS.
        const dist = districtAt(f, bi, bj, seed);
        if (rand() < Math.min(0.92, parkChance * dist.park)) {
          out.parks++;
          out.byDistrict[dist.name] = (out.byDistrict[dist.name] ?? 0);
          // a park keeps its green — but the ROADS round it are still roads,
          // and unpaved they came out in whatever the terrain band was
          // wearing: sand by the sea, grass in the patches. Same budget rule
          // as the buildings: inside it every ring is paved, beyond it the
          // deep parkland keeps its country roads.
          if (out.blocks + out.parks <= T.maxBlocks) {
            paveRoads(planet, f, u0, v0, size, T.road);
          }
          continue;
        }

        // every light this block places lands in its own bucket, which is
        // what main.js streams halos from for the nearest blocks — and the
        // beds and doors land beside them, for the borough's book
        glowLog = [];
        bedLog = [];
        doorLog = [];
        paveRoads(planet, f, u0, v0, size, T.road);
        pave(planet, f, u0, v0, size, T.pavement);
        out.blocks++;
        out.byDistrict[dist.name] = (out.byDistrict[dist.name] ?? 0) + 1;

        // lamps at the block's four corners, out on the pavement
        for (const [a, b] of [[0, 0], [size - 1, 0], [0, size - 1],
          [size - 1, size - 1]]) {
          lamp(planet, f, u0 + a, v0 + b);
        }

        // Plots inside the pavement, on a grid of their own. A block only
        // ever holds whole plots of about `plot` cells, so a bigger world
        // gets more buildings per block rather than one enormous one.
        const inner = size - 2 * T.pavement;
        const np = Math.max(1, Math.floor(inner / T.plot));
        const plot = Math.min(T.plot,
          Math.floor((inner - (np - 1) * T.alley) / np));
        if (plot < 6) continue;
        // centre the row of plots in the block, so the setback is even
        const inset = Math.floor((inner - (np * plot + (np - 1) * T.alley)) / 2);
        for (let pi = 0; pi < np; pi++) {
          for (let pj = 0; pj < np; pj++) {
            const pu = u0 + T.pavement + inset + pi * (plot + T.alley);
            const pv = v0 + T.pavement + inset + pj * (plot + T.alley);
            const s = survey(planet, f, pu, pv, plot, plot, T.spread);
            if (!s) continue;                  // broken ground: leave it
            // the door faces the nearest road, which is the block edge this
            // plot sits against; a middle plot faces the alley
            const door = [pi === 0 ? -1 : pi === np - 1 ? 1 : 0,
              pj === 0 ? -1 : pj === np - 1 ? 1 : 0];
            if (!door[0] && !door[1]) door[0] = 1;
            if (door[0] && door[1]) door[1] = 0;
            // ...or the plot is the district's STOCK HOUSE: a yard of live
            // pigs and chickens behind a brick wall, which is where the food
            // for all these people comes from. Never downtown — nobody keeps
            // pigs under a glass tower — and roughly one plot in eight
            // elsewhere, so every quarter eats without reading as farmland.
            if (dist.name !== 'downtown' && rand() < 0.12) {
              levelTo(planet, f, pu, pv, plot, plot, s.base, cement(0), 1);
              if (stockHouse(planet, f, pu, pv, plot, plot, s.base, rand,
                door)) {
                out.stockyards = (out.stockyards ?? 0) + 1;
                continue;
              }
            }
            const style = { ...pickStyle(rand, dist), district: dist.name };
            const room = Math.floor((H - 4 - s.base) / T.storey);
            // the district's own ceiling: an old quarter is low because it is
            // an old quarter, not because the world ran out of headroom
            const cap = Math.max(2, Math.round(tall * dist.tall));
            const storeys = Math.max(2, Math.min(room, cap,
              style.min + Math.floor(rand() * (style.max - style.min + 1))));
            if (storeys < 2) continue;
            levelTo(planet, f, pu, pv, plot, plot, s.base, cement(0), 1);
            out.towers.push(building(planet, f, pu, pv, plot, plot, s.base,
              style, storeys, rand, door));
            // a 'shops' building trades off its ground floor — counter,
            // keeper's spot, and a page in the ledger
            if (style.name === 'shops') {
              if (shopFront(planet, f, pu, pv, plot, plot, s.base,
                door[0], dist)) out.shops = (out.shops ?? 0) + 1;
            }
          }
        }
        // ...and the market's awning, once the pavement it hangs over exists
        if (dist.prop === 'awning') awning(planet, f, u0, v0, size, rand);
        // street trees, verges, benches and hydrants on every other block —
        // the awning district keeps its ring clear for the cloth
        else {
          // the kiosk stakes its pavement first; the planting then only
          // takes cells that are still pavement, so nothing grows through
          // a booth or stands a tree on its roof
          if (rand() < 0.6) {
            const k = kiosk(planet, f, u0, v0, size, rand, dist);
            if (k) out.kiosks = (out.kiosks ?? 0) + 1;
            if (k === 'shop') out.shops = (out.shops ?? 0) + 1;
          }
          streetPlanting(planet, f, u0, v0, size, rand);
        }
        // close the block's bucket
        if (glowLog.length || bedLog.length) {
          const cd = dirFromCell(f, u0 + (size >> 1) + 0.5, v0 + (size >> 1) + 0.5);
          (out.lampBlocks ??= []).push({
            f, bi, bj, u: u0 + (size >> 1), v: v0 + (size >> 1),
            dir: [cd[0], cd[1], cd[2]], glow: glowLog,
            beds: bedLog, doors: doorLog,
          });
        }
        glowLog = null;
        bedLog = null;
        doorLog = null;
      }
    }

    // lane markings down the middle of every road on this face, and a
    // zebra crossing at the middle of every block side
    if (T.laneMarks) {
      const lo = margin, hi = margin + nb * period;
      for (let b = 0; b <= nb; b++) {
        const at = margin + b * period + (T.road >> 1);
        if (at >= hi) continue;
        laneLine(planet, f, 0, at, lo, hi);
        laneLine(planet, f, 1, at, lo, hi);
      }
      for (let b = 0; b <= nb; b++) {
        const road0 = margin + b * period;          // the road's own cells
        if (road0 + T.road > hi) continue;
        for (let cb = 0; cb < nb; cb++) {
          const c = margin + cb * period + T.road + (size >> 1);
          crossing(planet, f, 0, road0, c, T.road);
          crossing(planet, f, 1, road0, c, T.road);
        }
      }
    }

    // The tube: a line under every Nth avenue, stations every few blocks
    // along it. The spacing grows with the face so a face always carries
    // about three lines and three stations on each — on a huge world a fixed
    // "every third avenue" would be nine hundred stations and most of the
    // generation budget.
    const lineEvery = Math.max(T.tubeEvery, Math.round(nb / 3));
    const stopEvery = Math.max(T.stationEvery, Math.round(nb / 3));
    for (let b = 0; b < nb; b += lineEvery) {
      const at = margin + b * period + (T.road >> 1);
      const lo = margin + 2, hi = margin + nb * period - 2;
      tubeTunnel(planet, f, 1, at, lo, hi, out);
      // ...and the TRAM over it: a pair of flush metal rails down the same
      // avenue, either side of the painted line. Pressed iron, set INTO the
      // road surface, so the rails read from a window and trip nobody —
      // and they run straight through the zebra stripes, as rails do.
      for (let i = lo; i < hi; i++) {
        for (const off of [-1, 1]) {
          const t = dryTop(planet, f, at + off, i);
          if (t >= 0) planet.set(f, at + off, i, t, BLOCK.BLOCK_IRON);
        }
      }
      out.rails = (out.rails ?? 0) + (hi - lo) * 2;
      for (let sb = 1; sb < nb; sb += stopEvery) {
        tubeStation(planet, f, 1, at, margin + sb * period + (period >> 1),
          rand, out);
      }
    }
  }

  if (_stationGlow.length) {
    (out.lampBlocks ??= []).push(..._stationGlow);
    _stationGlow = [];
  }

  // --- the BOROUGHS: the city as settlements --------------------------------
  //
  // "It should be like the other world." The grid is carved into boroughs of
  // six blocks square — about thirty buildings under one name — and each is
  // registered on planet.villageSites as a real settlement: a name off the
  // same generator the villages use, the beds and front doors its buildings
  // logged, a ledger the borough's shops already pay into, a chronicle row a
  // day, a page in the almanac — and a chief, who in a city is called the
  // MAYOR, sitting in the lobby of the tallest tower, mustered twice a day
  // and competing with every other settlement on the four aims like any
  // other chief. `city: true` is the flag the village-only machinery guards
  // on: no garrison is raised (the streets have their own watch), no plots
  // are laid by growVillages, and the crowds come from citylife.
  {
    const BOROUGH = 6;                       // blocks to a side
    const groups = new Map();
    for (const blk of out.lampBlocks ?? []) {
      if (blk.bi == null) continue;
      const key = `${blk.f},${Math.floor(blk.bi / BOROUGH)},${Math.floor(blk.bj / BOROUGH)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(blk);
    }
    const sites = [];
    for (const blks of groups.values()) {
      if (blks.length < 8) continue;         // a hamlet of towers is no city
      // the centre-most block carries the name and the pin
      const mu = blks.reduce((n, b) => n + b.u, 0) / blks.length;
      const mv = blks.reduce((n, b) => n + b.v, 0) / blks.length;
      const c = blks.reduce((best, b) =>
        (Math.hypot(b.u - mu, b.v - mv) < Math.hypot(best.u - mu, best.v - mv)
          ? b : best));
      const f = c.f;
      // the mayor's seat: a chair in the lobby of the borough's tallest
      // tower, facing the room
      const inB = (t) => t.f === f && blks.some((b) =>
        Math.floor((t.u0 - margin) / period) === b.bi
        && Math.floor((t.v0 - margin) / period) === b.bj);
      const hall = out.towers.filter(inB)
        .reduce((a, b) => (a && a.storeys >= b.storeys ? a : b), null);
      // ...dressed as the CITY HALL: dais, throne facing the room, white
      // stone round the door and the borough's name on a board over it.
      // The mayor used to sit unmarked in an ordinary lobby, and the name
      // was written nowhere in the world — see cityHall above.
      const court = hall ? cityHall(planet, hall) : null;
      sites.push({
        f, u: c.u, v: c.v, dir: [...c.dir],
        name: placeName('city', f, c.u, c.v, planet.seed ?? seed),
        city: true, culture: 'city',
        reach: (BOROUGH * period) >> 1,
        houses: blks.length,
        doors: blks.flatMap((b) => b.doors ?? []),
        beds: blks.flatMap((b) => b.beds ?? []),
        // the street lights stay on the finer-grained lampBlocks stream — a
        // borough that ALSO carried them would fight it halo for halo. What
        // rides here is only the hall's own: the dais lamps and the two
        // lanterns flanking the name board.
        glow: court?.glow ?? [],
        farms: [], gates: [], signs: court?.sign ? [court.sign] : [],
        posts: [],
        jet: null,
        seat: court?.seat ?? null,
        hall: hall ? { f, u0: hall.u0, v0: hall.v0, w: hall.w, d: hall.d,
          base: hall.base } : null,
      });
    }
    // ...and the borough's name over its tube stations, so the city says
    // what it is called from the street and not only at the hall door.
    for (const st of out.stations) {
      const near = sites.find((s) => s.f === st.f
        && Math.abs(st.u - s.u) <= s.reach && Math.abs(st.v - s.v) <= s.reach);
      if (!near) continue;
      const sg = stationSign(planet, st);
      if (sg) near.signs.push(sg);
    }
    if (sites.length) {
      planet.villageSites = [...(planet.villageSites ?? []), ...sites];
      out.boroughs = sites.length;
      // the borough's shops pay the borough's mayor: every counter in reach
      // moves its till onto the borough's own book
      for (const sh of planet.shopList ?? []) {
        if (sh.culture !== 'city') continue;
        const near = sites.find((st) => st.f === sh.f
          && Math.abs(sh.u0 - st.u) <= st.reach + T.road
          && Math.abs(sh.v0 - st.v) <= st.reach + T.road);
        if (near) sh.site = near;
      }
    }
  }

  out.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  planet.city = out;
  return out;
}

// --- reading the grid back --------------------------------------------------
//
// citylife.js needs to know where the tarmac is without storing a map of it.
// Everything below is arithmetic on the descriptor.

/** The centre line of the nearest road to (u, v) on the given axis. */
export function roadCentre(city, coord) {
  const rel = coord - city.margin;
  const b = Math.round(rel / city.period);
  return city.margin + b * city.period + (city.road >> 1);
}

/** Is this cell on a road (as opposed to a block)? */
export function onRoad(city, u, v) {
  const a = ((u - city.margin) % city.period + city.period) % city.period;
  const b = ((v - city.margin) % city.period + city.period) % city.period;
  return a < city.road || b < city.road;
}

/** Is the cell inside the built grid at all? */
export function inCity(city, u, v) {
  const lo = city.margin, hi = city.margin + city.nb * city.period;
  return u >= lo && v >= lo && u < hi && v < hi;
}
