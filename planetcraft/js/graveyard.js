// graveyard.js — cemeteries on the surface and the catacombs beneath them.
//
// Kept out of village.js for the same reason village.js is kept out of
// cubesphere.js: a churchyard is a structure placed onto a finished planet,
// not something the terrain generator knows about. main.js calls this after
// the villages, the launch pad and the weapon crates are down, so it can
// survey ground that is otherwise final and refuse to build over any of them.
//
// Everything is laid out in one face's (u, v) grid with +h as up, exactly as
// village.js does and for the same reason: the neighbouring face's grid is
// rotated, so a wall that ran off the edge would come out sheared. A site
// that will not fit inside its face with a margin is simply not built.
//
// --- what a graveyard is ---------------------------------------------------
//
// A walled enclosure with ONE way in. The wall is two courses of cobble under
// a slab coping — too high to jump — so the lych-gate is the entrance and not
// a decoration. Inside, an aisle of path runs from the gate to a chapel at the
// far end, with rows of graves either side: a headstone at the head of every
// plot and, on about half of them, a raised mound of earth. Lamps stand at the
// gate and at the corners, so the place is legible after dark, which is when
// you will be in it.
//
// --- and the catacombs -----------------------------------------------------
//
// The stair descends out of the chapel's side aisle and comes out in a
// corridor network carved at ONE level — deliberately flat, because a tomb
// that rambles up and down in the dark is a tomb you get lost in for the wrong
// reason. The corridors are a randomised spanning tree over a lattice of
// junctions, so the complex is connected BY CONSTRUCTION (every chamber is
// reachable from the stair, with nothing to verify afterwards) and still has
// long runs and dead ends, which is what makes it worth walking. Burial niches
// are cut into the corridor walls; the last junctions the walk reached are
// widened into pillared chambers, and those are where the chests are — the
// reward is at the end of the longest walk, not behind the first door.
//
// --- the one rule ----------------------------------------------------------
//
// The planet is a pure function of (radius, seed, preset). Nothing here is
// stored or sent: placement and layout come out of one mulberry32 stream
// salted 0x6b0e5a, and chest CONTENTS are hashed from the chest's own cell
// (see cryptLoot) rather than rolled, because chest contents never cross the
// wire and two people standing in one chamber have to compute the same box.
// No Math.random anywhere in this file.

import { BLOCK, S, H, dirFromCell } from './cubesphere.js';
import * as CS from './cubesphere.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stairs, slabs, panes and chairs degrade to a full block of the same
// material on a world whose cubesphere predates them — the same guard
// village.js keeps, so a crypt built on an older enum is blocky but whole,
// and still walkable.
const MAT = { PLANK: 0, COBBLE: 1, BRICK: 2, THATCH: 3 };
const MAT_BLOCK = [BLOCK.PLANK, BLOCK.COBBLE, BLOCK.BRICK, BLOCK.THATCH];
const stair = CS.stairId ? (m, f) => CS.stairId(m, f) : (m) => MAT_BLOCK[m];
const slab = CS.slabId ? (m, h) => CS.slabId(m, h) : (m) => MAT_BLOCK[m];
const pane = CS.paneId ? (t) => CS.paneId(t) : () => BLOCK.GLASS;
const chair = CS.chairId ? (f) => CS.chairId(f) : () => BLOCK.PLANK;
// stained glass: the two tints that read as a chapel window rather than as a
// hole with a colour in it. Indices into cubesphere's GLASS_TINTS.
const TINT_BLUE = 5, TINT_PURPLE = 6;

// --- dimensions -------------------------------------------------------------

const W = 23;             // cells across (u)
const D = 25;             // ...and deep (v): gate at j=0, chapel at the far end
const OUT = 3;            // cells of levelled ground outside the front wall,
                          // for the lych-gate porch and the two lamp posts
const CHAPEL_W = 11;
const CHAPEL_D = 9;
const CLEAR = 16;         // headroom cleared above the levelled ground
const CRYPT_DROP = 10;    // courses from the chapel floor to the crypt floor
const AIR_H = 3;          // cells of air over the flagstones, everywhere below
                          // ground. Three, not two: on a descending stair a
                          // two-cell ceiling steps down into your head.
const REACH = 16;         // how far a graveyard claims, for the keep-off tests

// --- surveying --------------------------------------------------------------

// Top of the GROUND in a column, ignoring whatever is growing on it. Trees are
// baked before a site is surveyed (see buildGraveyards), so without this a
// wood on the spot would read as fifteen blocks of relief and every wooded
// site would be refused.
const GROWTH = new Set([BLOCK.LEAF, BLOCK.LOG, BLOCK.SAPLING, BLOCK.MUSHROOM,
  BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW, BLOCK.FLOWER_BLUE, BLOCK.SNOW,
  BLOCK.WHEAT, BLOCK.WHEAT_YOUNG]);

function soilTop(planet, f, u, v) {
  let h = planet.columnTop(f, u, v);
  let guard = 0;
  while (h > 0 && guard++ < 24 && GROWTH.has(planet.get(f, u, v, h))) h--;
  return h;
}

// Nine columns instead of seven hundred and seventy-five. The scatter pass
// tries a lot of centres on a planet that is mostly sea, and a full survey of
// every one of them was most of what a graveyard cost to place.
function quickReject(planet, f, u0, v0) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j <= 2; j++) {
      const u = u0 + (i * (W - 1) >> 1), v = v0 + (j * (D - 1) >> 1);
      const t = soilTop(planet, f, u, v);
      if (t < 1 || t + CLEAR >= H) return true;
      const b = planet.get(f, u, v, t + 1);
      if (b === BLOCK.WATER || b === BLOCK.LAVA) return true;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  return hi - lo > 9;
}

// Is this rectangle somewhere a churchyard could stand? Returns the level to
// build at, or null. Water anywhere in it is fatal — a cemetery half in a lake
// is not a cemetery — and so is a spread the levelling would turn into a
// cliff, since cut and fill to one level is all this file knows how to do.
function survey(planet, f, u0, v0) {
  const M = 4;
  if (u0 - 1 < M || v0 - OUT < M
    || u0 + W + M > S || v0 + D + M > S) return null;
  let lo = 1e9, hi = -1e9, sum = 0, n = 0;
  for (let i = -1; i <= W; i++) {
    for (let j = -OUT; j <= D; j++) {
      const u = u0 + i, v = v0 + j;
      const t = soilTop(planet, f, u, v);
      if (t < 1 || t + CLEAR >= H) return null;
      const b = planet.get(f, u, v, t);
      if (b === BLOCK.WATER || b === BLOCK.LAVA || b === BLOCK.ICE) return null;
      // A lake sits ON its bed, so the bed reads as ordinary ground and only
      // the cell above it gives the water away.
      const over = planet.get(f, u, v, t + 1);
      if (over === BLOCK.WATER || over === BLOCK.LAVA) return null;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t; n++;
    }
  }
  if (hi - lo > 9) return null;                  // a hillside, not a meadow
  const g = Math.round(sum / n);
  // the crypt has to fit between the chapel floor and the bedrock
  if (g - CRYPT_DROP - AIR_H - 4 < 2) return null;
  return g;
}

// Does the rectangle collide with something already standing? Villages, the
// weapon crates and the launch pad are all placed before this file runs, and a
// churchyard laid over any of them would DESTROY content that every existing
// world already has — see the one rule at the top.
function clashes(planet, f, u0, v0, placed) {
  // The launch pad sits on the middle cells of a POLE face and travel.js does
  // not publish where, so the middle of a face whose centre is a pole is kept
  // clear. Only a pole face: an early version kept the middle of all six, and
  // since villages start a margin in from every edge that ruled out most of
  // the buildable ground on the planet.
  const c = S >> 1;
  const mid = dirFromCell(f, c + 0.5, c + 0.5);
  if (Math.abs(mid[1]) > 0.9 * Math.hypot(mid[0], mid[1], mid[2])
    && Math.abs(u0 + W / 2 - c) < W / 2 + 16
    && Math.abs(v0 + D / 2 - c) < D / 2 + 16) return true;
  for (let i = -2; i <= W + 2; i += 2) {
    for (let j = -OUT - 2; j <= D + 2; j += 2) {
      if (planet.inVillage?.(f, u0 + i, v0 + j, 4)) return true;
    }
  }
  for (const ch of planet.armoryChests ?? []) {
    if (ch.f !== f) continue;
    if (ch.u >= u0 - 4 && ch.u < u0 + W + 4
      && ch.v >= v0 - OUT - 4 && ch.v < v0 + D + 4) return true;
  }
  for (const g of placed) {
    if (g.f !== f) continue;
    if (Math.abs(g.u - (u0 + W / 2)) < W + 10
      && Math.abs(g.v - (v0 + D / 2)) < D + 10) return true;
  }
  return false;
}

// Cut and fill one rectangle to a single level and clear the air over it.
// Everything the woods put here goes: a churchyard is TENDED, and a trunk
// through the wall is the one thing that would say otherwise.
function level(planet, f, u0, v0, g) {
  for (let i = -1; i <= W; i++) {
    for (let j = -OUT; j <= D; j++) {
      const u = u0 + i, v = v0 + j;
      for (let h = g + 1; h <= g + CLEAR && h < H; h++) {
        planet.set(f, u, v, h, BLOCK.AIR);
      }
      // fill downward until we meet rock, so a dip is made up rather than
      // left as a hole under the wall
      for (let h = g; h > g - 20 && h >= 0; h--) {
        const b = planet.get(f, u, v, h);
        if (b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LAVA) break;
        planet.set(f, u, v, h, BLOCK.DIRT);
      }
      planet.set(f, u, v, g, BLOCK.GRASS);
    }
  }
  // ...and a bank down to whatever the hill was doing. Cut and fill to one
  // level leaves a sheer face of earth wherever the pad meets a slope, which
  // reads as a platform dropped on the landscape rather than as ground someone
  // levelled. Three courses of taper, a course per cell, is enough to lose it.
  for (let ring = 1; ring <= 3; ring++) {
    for (let i = -1 - ring; i <= W + ring; i++) {
      for (let j = -OUT - ring; j <= D + ring; j++) {
        const inner = i >= -ring && i <= W - 1 + ring
          && j >= -OUT - ring + 1 && j <= D - 1 + ring;
        if (inner) continue;
        const u = u0 + i, v = v0 + j;
        const t = soilTop(planet, f, u, v);
        if (t < 1) continue;
        // Ground that is already within a course per cell of the pad is left
        // exactly as it was — the taper only ever pulls a cliff back in, and
        // on flat country it does nothing at all rather than digging a moat.
        const want = Math.max(g - ring, Math.min(g + ring, t));
        if (want === t) continue;
        if (t > want) {
          for (let h = want + 1; h <= t + 6 && h < H; h++) {
            planet.set(f, u, v, h, BLOCK.AIR);
          }
        } else {
          for (let h = t + 1; h <= want; h++) planet.set(f, u, v, h, BLOCK.DIRT);
        }
        planet.set(f, u, v, want, BLOCK.GRASS);
      }
    }
  }
}

// --- the enclosure ----------------------------------------------------------

function buildYard(planet, f, u0, v0, g, rand, out) {
  const set = (i, j, h, b) => planet.set(f, u0 + i, v0 + j, h, b);
  const lamp = (i, j, h) => {
    planet.set(f, u0 + i, v0 + j, h, BLOCK.LANTERN);
    out.glow.push({ f, u: u0 + i, v: v0 + j, h });
  };
  const cu = W >> 1;                             // the gate's centre line
  const chJ = D - 1 - CHAPEL_D;                  // the chapel's front wall
  const crossJ = chJ - 1;                        // the transept path

  // --- the wall: two courses under a slab coping ----------------------------
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < D; j++) {
      if (i !== 0 && j !== 0 && i !== W - 1 && j !== D - 1) continue;
      if (j === 0 && Math.abs(i - cu) <= 1) continue;   // the gateway
      // Brick piers punctuate the rubble every seventh cell and at the
      // corners: a wall with a rhythm reads as built, one long run reads as
      // extruded.
      const along = (i === 0 || i === W - 1) ? j : i;
      const corner = (i === 0 || i === W - 1) && (j === 0 || j === D - 1);
      const pier = corner || along % 7 === 3;
      set(i, j, g + 1, pier ? BLOCK.BRICK : BLOCK.COBBLE);
      set(i, j, g + 2, pier ? BLOCK.BRICK : BLOCK.COBBLE);
      set(i, j, g + 3, slab(pier ? MAT.BRICK : MAT.COBBLE, 0));
    }
  }

  // --- the lych-gate --------------------------------------------------------
  // Posts, a lintel and a little gabled roof over the way in. The leaves are
  // fence gates: the middle one stands open so there is always a way through,
  // and the two beside it are shut and can be pushed.
  for (let h = g + 1; h <= g + 4; h++) {
    set(cu - 2, 0, h, BLOCK.LOG);
    set(cu + 2, 0, h, BLOCK.LOG);
  }
  for (let i = cu - 2; i <= cu + 2; i++) set(i, 0, g + 4, BLOCK.STRIPPED_LOG);
  set(cu - 1, 0, g + 1, BLOCK.GATE);
  set(cu, 0, g + 1, BLOCK.GATE_O);
  set(cu + 1, 0, g + 1, BLOCK.GATE);
  for (let i = cu - 3; i <= cu + 3; i++) {
    set(i, -1, g + 5, stair(MAT.PLANK, 2));      // eaves, facing up the pitch
    set(i, 1, g + 5, stair(MAT.PLANK, 3));
    set(i, 0, g + 5, BLOCK.PLANK);
    set(i, 0, g + 6, slab(MAT.PLANK, 0));        // the ridge
  }
  for (const di of [-4, 4]) {
    set(cu + di, -2, g + 1, BLOCK.LOG);
    set(cu + di, -2, g + 2, BLOCK.LOG);
    lamp(cu + di, -2, g + 3);
  }

  // --- paths ----------------------------------------------------------------
  // The aisle from the gate to the chapel door, a transept across the front of
  // the chapel, and a walk round the inside of the wall.
  for (let j = 1; j <= crossJ; j++) {
    for (let i = cu - 1; i <= cu + 1; i++) set(i, j, g, BLOCK.PATH);
  }
  for (let i = 1; i < W - 1; i++) set(i, crossJ, g, BLOCK.PATH);
  for (let j = 1; j < D - 1; j++) { set(1, j, g, BLOCK.PATH); set(W - 2, j, g, BLOCK.PATH); }
  for (let i = 1; i < W - 1; i++) set(i, 1, g, BLOCK.PATH);

  // --- the graves -----------------------------------------------------------
  //
  // Plots on a 3 x 3 pitch either side of the aisle, laid in rows: a headstone
  // at the head of each and the plot itself running away from it.
  //
  // The PLOT is what makes a grave read as a grave. A first pass had only the
  // stones, and a lawn with grey blocks standing about on it reads as somebody
  // having dropped their building materials. Every plot is bare earth — a path
  // block, dug over and not yet grown back — so the ground itself is laid out
  // in graves before you look at a single stone, and about half of them carry a
  // raised mound on top of that.
  //
  // Four kinds of stone, in descending order of what the family could afford,
  // so a row is not one thing repeated. The stair on top of the better ones is
  // doing real work: a stone that is a plain cube with a slab on it reads as a
  // pillar, and one with a shaped shoulder reads as carved.
  for (let i = 3; i <= W - 4; i += 3) {
    if (i >= cu - 2 && i <= cu + 2) continue;    // the aisle
    for (let j = 2; j + 2 < crossJ; j += 3) {
      for (let dj = 1; dj <= 2; dj++) set(i, j + dj, g, BLOCK.PATH);
      if (rand() < 0.5) {
        for (let dj = 1; dj <= 2; dj++) set(i, j + dj, g + 1, BLOCK.DIRT);
      }
      const kind = rand();
      if (kind < 0.18) {
        set(i, j, g + 1, BLOCK.FENCE);           // a wooden marker, gone grey
        set(i, j, g + 2, BLOCK.FENCE);
      } else if (kind < 0.40) {
        set(i, j, g + 1, slab(MAT.COBBLE, 0));   // a worn stone off the grass
      } else if (kind < 0.84) {
        set(i, j, g + 1, BLOCK.STONE);
        set(i, j, g + 2, stair(MAT.COBBLE, 2));  // shoulder, facing the plot
      } else {
        set(i, j, g, BLOCK.PATH);                // a family stone, on its own
        set(i, j, g + 1, BLOCK.BRICK);           // plinth, with a footstone at
        set(i, j, g + 2, BLOCK.STONE);           // the far end of the plot
        set(i, j, g + 3, stair(MAT.COBBLE, 2));
        if (j + 3 < crossJ) set(i, j + 3, g + 1, slab(MAT.COBBLE, 0));
      }
    }
  }

  // --- the chapel -----------------------------------------------------------
  // Cobble on a brick plinth, a plank floor, stained panes and a thatched
  // pitch. Its NAVE is offset from the crypt stair on purpose: the stair takes
  // the left aisle, so a visitor walks in, sees the altar, and finds the hole
  // in the floor beside them.
  const c0 = cu - (CHAPEL_W >> 1);
  for (let i = 0; i < CHAPEL_W; i++) {
    for (let j = 0; j < CHAPEL_D; j++) {
      const ii = c0 + i, jj = chJ + j;
      set(ii, jj, g, BLOCK.PLANK);
      if (i !== 0 && j !== 0 && i !== CHAPEL_W - 1 && j !== CHAPEL_D - 1) continue;
      set(ii, jj, g + 1, BLOCK.BRICK);
      for (let h = g + 2; h <= g + 4; h++) set(ii, jj, h, BLOCK.COBBLE);
    }
  }
  for (const di of [-1, 0, 1]) {                 // the doorway, on the aisle
    for (let h = g + 1; h <= g + 3; h++) set(cu + di, chJ, h, BLOCK.AIR);
    set(cu + di, chJ, g + 4, BLOCK.STRIPPED_LOG);
  }
  for (let j = 2; j < CHAPEL_D - 1; j += 3) {    // side lights
    set(c0, chJ + j, g + 2, pane(TINT_PURPLE));
    set(c0, chJ + j, g + 3, pane(TINT_PURPLE));
    set(c0 + CHAPEL_W - 1, chJ + j, g + 2, pane(TINT_PURPLE));
    set(c0 + CHAPEL_W - 1, chJ + j, g + 3, pane(TINT_PURPLE));
  }
  for (const di of [-1, 0, 1]) {                 // the east window, over the altar
    set(cu + di, chJ + CHAPEL_D - 1, g + 2, pane(TINT_BLUE));
    set(cu + di, chJ + CHAPEL_D - 1, g + 3, pane(TINT_BLUE));
  }
  for (let k = 0; k <= (CHAPEL_D >> 1); k++) {   // the roof, one rise per run
    for (let i = c0 - 1; i <= c0 + CHAPEL_W; i++) {
      const jn = chJ + k, jf = chJ + CHAPEL_D - 1 - k;
      if (jn >= jf) { set(i, jn, g + 5 + k, slab(MAT.COBBLE, 0)); continue; }
      set(i, jn, g + 5 + k, stair(MAT.THATCH, 2));
      set(i, jf, g + 5 + k, stair(MAT.THATCH, 3));
    }
  }
  const aJ = chJ + CHAPEL_D - 2;                 // the altar bay
  set(cu, aJ, g + 1, BLOCK.TABLE);
  lamp(cu - 1, aJ, g + 1);
  lamp(cu + 1, aJ, g + 1);
  for (let j = chJ + 2; j <= aJ - 2; j += 2) {   // pews, facing the altar
    for (const di of [-1, 1]) set(cu + di, j, g + 1, chair(2));
  }
  lamp(c0 + CHAPEL_W - 2, chJ + 1, g + 1);

  // --- lamps at the corners of the yard -------------------------------------
  for (const [i, j] of [[2, 2], [W - 3, 2], [2, crossJ - 2], [W - 3, crossJ - 2]]) {
    set(i, j, g + 1, BLOCK.LOG);
    set(i, j, g + 2, BLOCK.LOG);
    lamp(i, j, g + 3);
  }

  out.gate = { f, u: u0 + cu, v: v0 - 1, h: g + 1 };
  out.chapel = { f, u: u0 + cu, v: v0 + chJ + 2, h: g };
  // the stair takes the LEFT aisle of the chapel, three cells wide
  return { cu, chJ, stairI: c0 + 2, stairJ: chJ + 2 };
}

// --- underground ------------------------------------------------------------

// The digger.
//
// Two operations, and the whole reason they live on one object: `hollow`
// remembers every cell it opened, and `shell` — the pass that walls a box in
// so it cannot break through into a natural cave — refuses to fill anything
// hollow already claimed. Without that memory the two fight: a corridor cut
// from one junction to the next walls in the junction it started from, a
// staircase walls in the step above it, and what you get is a crypt made
// entirely of dead ends with the chapel's own floor filled in solid. Every
// cell of it was carved correctly first and then bricked up by the next call.
function digger(planet, f) {
  const carved = new Set();
  const key = (u, v, h) => (u * S + v) * H + h;
  return {
    // flagstones, AIR_H cells of air, a ceiling. Everything below ground goes
    // through here, so a corridor and a chamber cannot disagree about how
    // tall the crypt is.
    hollow(u0, u1, v0, v1, floor) {
      for (let u = u0; u <= u1; u++) {
        for (let v = v0; v <= v1; v++) {
          planet.set(f, u, v, floor, BLOCK.COBBLE);
          for (let k = 1; k <= AIR_H; k++) {
            planet.set(f, u, v, floor + k, BLOCK.AIR);
            carved.add(key(u, v, floor + k));
          }
          planet.set(f, u, v, floor + AIR_H + 1, BLOCK.COBBLE);
        }
      }
    },
    // A one-cell skin around a hollowed box, filling only what is already air
    // or fluid and never a cell the crypt itself opened. Without it a corridor
    // cut beside a natural cave opens into it, and a tomb that leaks into a
    // cavern is a tomb with no walls — and, where the cave held water, a
    // flooded one. `ceiling` caps it: the last steps of a stair run out from
    // under a building, and a skin that carried on up would fill the chapel.
    shell(u0, u1, v0, v1, floor, ceiling = Infinity) {
      for (let u = u0 - 1; u <= u1 + 1; u++) {
        for (let v = v0 - 1; v <= v1 + 1; v++) {
          if (u >= u0 && u <= u1 && v >= v0 && v <= v1) continue;
          for (let k = 0; k <= AIR_H + 1; k++) {
            const h = floor + k;
            if (h > ceiling) break;
            if (carved.has(key(u, v, h))) continue;
            const b = planet.get(f, u, v, h);
            if (b === BLOCK.AIR || b === BLOCK.WATER || b === BLOCK.LAVA) {
              planet.set(f, u, v, h, BLOCK.STONE);
            }
          }
        }
      }
    },
    // hollow and shell in one, which is what almost every caller wants
    run(u0, v0, u1, v1, floor, ceiling) {
      const lu = Math.min(u0, u1), hu = Math.max(u0, u1);
      const lv = Math.min(v0, v1), hv = Math.max(v0, v1);
      this.hollow(lu, hu, lv, hv, floor);
      this.shell(lu, hu, lv, hv, floor, ceiling);
    },
    // Fill any air left between a shaft's ceiling and the ground above it. The
    // last steps of the stair run out from under the churchyard and under open
    // country, and on a slope their roof would otherwise break the surface as
    // a cobble scar with a hole beside it. `to` is the ceiling on that: under a
    // building it is the levelled ground, never the underside of the roof.
    bury(u, v, from, to = null) {
      const top = to === null ? soilTop(planet, f, u, v) : to;
      for (let h = from; h <= top; h++) {
        if (carved.has(key(u, v, h))) continue;
        if (planet.get(f, u, v, h) === BLOCK.AIR) planet.set(f, u, v, h, BLOCK.STONE);
      }
    },
    set(u, v, h, b) { planet.set(f, u, v, h, b); },
    get(u, v, h) { return planet.get(f, u, v, h); },
    // Close a gap without ever closing a way through: fills only cells that
    // are air AND that the crypt did not open itself. This is what lets a
    // burial niche wall itself in where it happens to be cut through a
    // corner without also walling in the corridor it is cut from.
    fillAir(u, v, h, b) {
      if (carved.has(key(u, v, h))) return;
      if (planet.get(f, u, v, h) === BLOCK.AIR) planet.set(f, u, v, h, b);
    },
    // a light, and the note main.js needs to hang a halo on it
    lamp(u, v, h, out) {
      planet.set(f, u, v, h, BLOCK.LANTERN);
      out.glow.push({ f, u, v, h });
    },
  };
}

// The stair out of the chapel floor: three cells wide, one course of drop per
// cell of run, walled and roofed as it goes. A shaft you walk down, not a hole
// you fall into.
//
// The first four steps stay INSIDE the chapel, which is what keeps the shaft's
// ceiling from punching through a wall: the roof of step k sits at g-k+4, so it
// is only clear of the walls' footing from k=4 down. The chapel is nine deep
// to make room for exactly that.
function digStair(dig, f, u0, v0, g, si, sj, out) {
  const u = u0 + si;
  // Every step is opened before any of them is walled, or each step's skin
  // bricks up the step above it and the stair becomes ten sealed boxes.
  for (let k = 1; k <= CRYPT_DROP; k++) dig.hollow(u - 1, u + 1, v0 + sj + k - 1, v0 + sj + k - 1, g - k);
  for (let k = 1; k <= CRYPT_DROP; k++) {
    const v = v0 + sj + k - 1, floor = g - k;
    // Capped at the churchyard's own ground level: the first steps are still
    // inside the chapel, and a skin that carried on up would fill the nave.
    dig.shell(u - 1, u + 1, v, v, floor, g);
    const inYard = v - v0 <= D - 1;
    for (let i = -1; i <= 1; i++) {
      dig.bury(u + i, v, floor + AIR_H + 2, inYard ? g : null);
    }
    if (k === 2 || k === CRYPT_DROP) dig.lamp(u + 1, v, floor + 1, out);
  }
  return { u, v: v0 + sj + CRYPT_DROP - 1, h: g - CRYPT_DROP };
}

const PITCH = 7;          // cells between junctions
const NODES = 5;          // junctions along each side of the lattice

// Carve the corridor network. A randomised depth-first spanning tree over the
// lattice: every junction is reached exactly once, so the complex is connected
// by construction and nothing has to be checked afterwards, and the order the
// neighbours are tried in is what gives it long runs and dead ends instead of
// a grid you can see through.
function digCatacombs(dig, f, uc, vc, floor, foot, rand, out) {
  const u0 = uc - (((NODES - 1) * PITCH) >> 1);
  const v0 = vc - (((NODES - 1) * PITCH) >> 1);
  const cellU = (a) => u0 + a * PITCH;
  const cellV = (b) => v0 + b * PITCH;
  const clamp = (x) => Math.max(0, Math.min(NODES - 1, x));
  // the entry junction is whichever lattice point the stair foot came down
  // nearest, so the connector below is short and straight
  const ea = clamp(Math.round((foot.u - u0) / PITCH));
  const eb = clamp(Math.round((foot.v - v0) / PITCH));

  const seen = new Uint8Array(NODES * NODES);
  const order = [[ea, eb]];
  const stack = [[ea, eb]];
  const links = [];
  seen[eb * NODES + ea] = 1;
  while (stack.length) {
    const [a, b] = stack[stack.length - 1];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // Fisher-Yates off the seeded stream: the shuffle IS the layout
    for (let i = 3; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
    }
    let stepped = false;
    for (const [da, db] of dirs) {
      const na = a + da, nb = b + db;
      if (na < 0 || nb < 0 || na >= NODES || nb >= NODES) continue;
      if (seen[nb * NODES + na]) continue;
      seen[nb * NODES + na] = 1;
      links.push([a, b, na, nb]);
      stack.push([na, nb]);
      order.push([na, nb]);
      stepped = true;
      break;
    }
    if (!stepped) stack.pop();
  }

  // Everything is HOLLOWED first and only then walled in, so no box can brick
  // up the box next to it. digger() remembers what it opened; this order is
  // what lets it.
  const boxes = [];
  const run = (ua, va, ub, vb) => {
    const lu = Math.min(ua, ub), hu = Math.max(ua, ub);
    const lv = Math.min(va, vb), hv = Math.max(va, vb);
    dig.hollow(lu, hu, lv, hv, floor);
    boxes.push([lu, hu, lv, hv]);
  };

  for (let b = 0; b < NODES; b++) {
    for (let a = 0; a < NODES; a++) {
      run(cellU(a) - 1, cellV(b) - 1, cellU(a) + 1, cellV(b) + 1);
    }
  }
  for (const [a, b, na, nb] of links) {
    if (a === na) run(cellU(a) - 1, cellV(b), cellU(a) + 1, cellV(nb));
    else run(cellU(a), cellV(b) - 1, cellU(na), cellV(b) + 1);
  }
  // ...and the stair foot to its junction: an L, so the corner is square
  // rather than a diagonal nothing can walk through
  run(foot.u - 1, foot.v, foot.u + 1, cellV(eb));
  run(foot.u, cellV(eb) - 1, cellU(ea), cellV(eb) + 1);

  // --- chambers -------------------------------------------------------------
  // The last junctions the walk reached are the far end of the crypt, so those
  // are the ones widened and given the chests: the reward is at the end of the
  // longest walk, not behind the first door.
  const tail = order.slice(-6);
  const rooms = [];
  const halls = [];
  for (let i = 0; i < tail.length; i++) {
    const [a, b] = tail[i];
    const u = cellU(a), v = cellV(b);
    if (i >= tail.length - 3) {
      run(u - 2, v - 2, u + 2, v + 2);
      halls.push([u, v]);
    } else if (rand() < 0.6) {
      rooms.push({ f, u, v, h: floor, chest: [u + 1, v] });
      continue;
    }
    rooms.push({ f, u, v, h: floor, chest: i >= tail.length - 3 ? [u, v] : null });
  }

  // Only now is any of it walled in — see digger().
  for (const [lu, hu, lv, hv] of boxes) dig.shell(lu, hu, lv, hv, floor);

  // --- burial niches --------------------------------------------------------
  // Cut two cells into the wall on alternate sides at a fixed pitch, each with
  // a slab shelf and a body's worth of nothing on it. They are why a corridor
  // is not a tube: something to look at as you walk, and somewhere for the
  // lantern light to fail to reach. Cut AFTER the walls exist, so a recess has
  // rock to be cut into.
  const niche = (u, v, du, dv) => {
    // the sides, back and lid of the recess, closed before it is opened so it
    // cannot come out in the corridor on the other side of the wall
    for (let k = 1; k <= 3; k++) {
      const nu = u + du * k, nv = v + dv * k;
      for (let s = -1; s <= 1; s++) {
        const su = nu + (du ? 0 : s), sv = nv + (dv ? 0 : s);
        for (let g2 = 0; g2 <= AIR_H + 1; g2++) dig.fillAir(su, sv, floor + g2, BLOCK.COBBLE);
      }
    }
    for (let k = 1; k <= 2; k++) {
      const nu = u + du * k, nv = v + dv * k;
      dig.set(nu, nv, floor, BLOCK.COBBLE);
      dig.set(nu, nv, floor + 1, BLOCK.AIR);
      dig.set(nu, nv, floor + 2, BLOCK.AIR);
      dig.set(nu, nv, floor + 3, BLOCK.COBBLE);
    }
    dig.set(u + du * 2, v + dv * 2, floor + 1, slab(MAT.COBBLE, 1));
  };

  let side = 0;
  for (const [a, b, na, nb] of links) {
    const ua = cellU(a), va = cellV(b), ub = cellU(na), vb = cellV(nb);
    if (ua === ub) {
      const lo = Math.min(va, vb), hi = Math.max(va, vb);
      for (let v = lo + 2; v <= hi - 2; v += 3) {
        const s = (side++ & 1) ? 1 : -1;
        niche(ua + s, v, s, 0);
      }
    } else {
      const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
      for (let u = lo + 2; u <= hi - 2; u += 3) {
        const s = (side++ & 1) ? 1 : -1;
        niche(u, va + s, 0, s);
      }
    }
  }

  // --- the furniture --------------------------------------------------------
  for (const [u, v] of halls) {
    for (const du of [-2, 2]) {                  // pillars: a room, not a box
      for (const dv of [-2, 2]) {
        for (let k = 1; k <= AIR_H; k++) dig.set(u + du, v + dv, floor + k, BLOCK.BRICK);
      }
    }
    dig.lamp(u - 1, v, floor + 1, out);
  }
  for (const r of rooms) {
    if (!r.chest) continue;
    dig.set(r.chest[0], r.chest[1], floor + 1, BLOCK.CHEST);
    out.chests.push({ f, u: r.chest[0], v: r.chest[1], h: floor + 1 });
  }

  // Sparse light: every third junction, and never where a chamber already put
  // one. A crypt you can read end to end is a corridor with the lights on.
  let n = 0;
  for (let b = 0; b < NODES; b++) {
    for (let a = 0; a < NODES; a++) {
      const u = cellU(a), v = cellV(b);
      out.nodes.push({ f, u, v, h: floor });
      if ((n++ % 3) !== 0) continue;
      if (dig.get(u + 1, v, floor + 1) !== BLOCK.AIR) continue;
      dig.lamp(u + 1, v, floor + 1, out);
    }
  }
  out.rooms = rooms;
}

// --- placement --------------------------------------------------------------

// Unit world direction through a cell's centre, which is the form every
// consumer of a site wants — entities.js places creatures by direction, and
// main.js's minimap and flash messages want somewhere to point at.
function cellDir(f, u, v) {
  const d = dirFromCell(f, u + 0.5, v + 0.5);
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

/**
 * Lay a churchyard and its catacombs beside each village and record them on
 * `planet.graveyards`; the loot cells also go on `planet.cryptChests`, the
 * same way village.js leaves `planet.houseChests`, because a chest is one byte
 * in a column and there is no other way to find them again.
 *
 * Placement and layout come out of one stream salted 0x6b0e5a — its own, so
 * the villages, the garrison, the pens, the herds and the weapon crates all
 * draw exactly what they drew before this file existed.
 */
export function buildGraveyards(planet, seed, opts = {}) {
  const rand = mulberry32(seed ^ 0x6b0e5a);
  const list = [];
  planet.graveyards = list;
  planet.cryptChests = [];
  const cap = opts.max ?? 6;
  const want = opts.min ?? 3;
  const span = ((NODES - 1) * PITCH >> 1) + PITCH;

  // Every site is surveyed before any of them is dug, and each is tested
  // against the ones already chosen — a churchyard laid through another
  // churchyard's crypt would be one building through another's walls, and the
  // second one wins.
  const placements = [];
  // Is this centre buildable? The crypt is wider than the yard and has to stay
  // on the face too, even though none of it shows at the surface.
  const trySite = (f, cU, cV) => {
    const u0 = cU - (W >> 1), v0 = cV - (D >> 1);
    if (cU - span < 4 || cV - span < 4
      || cU + span > S - 4 || cV + span > S - 4) return null;
    if (quickReject(planet, f, u0, v0)) return null;
    if (clashes(planet, f, u0, v0, placements)) return null;
    const g = survey(planet, f, u0, v0);
    return g === null ? null : { f, u: cU, v: cV, u0, v0, g, cU, cV };
  };

  const candidates = [];
  for (const site of planet.villageSites ?? []) {
    // Out of the village and clear of its fields. Eight ways out, tried in a
    // shuffled order and at two distances, so two villages on one face do not
    // both bury to the north and one awkward hillside does not cost a site.
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
    }
    const near = (site.reach || 20) + 8 + Math.floor(rand() * 6);
    const far = near + 12 + Math.floor(rand() * 10);
    candidates.push({ site, dirs, rings: [near, far] });
  }
  // Interleaved by ring, so every village gets its first choice before any
  // village gets its second: a planet where the first two settlements have a
  // churchyard each beats one where the first has two.
  for (let ring = 0; ring < 2; ring++) {
    for (const c of candidates) {
      if (c.done) continue;
      for (const [du, dv] of c.dirs) {
        const d = c.rings[ring];
        const hit = trySite(c.site.f, c.site.u + du * d, c.site.v + dv * d);
        if (hit) { placements.push(hit); c.done = true; break; }
      }
    }
  }
  // A world with two villages on it still wants more than two cemeteries —
  // and a crypt is worth finding whether or not anyone lives near it. The
  // rest are scattered on open land, the same way the weapon crates are.
  for (let a = 0; a < 300 && placements.length < want; a++) {
    const f = (rand() * 6) | 0;
    const cU = span + 6 + ((rand() * Math.max(1, S - 2 * span - 12)) | 0);
    const cV = span + 6 + ((rand() * Math.max(1, S - 2 * span - 12)) | 0);
    const hit = trySite(f, cU, cV);
    if (hit) placements.push(hit);
  }

  for (const { f, u0, v0, g, cU, cV } of placements.slice(0, cap)) {
    // Bake the woods over the site BEFORE building, then clear them. Trees are
    // planted lazily per region as chunks mesh, so a graveyard laid on unbaked
    // ground would have a forest grow up through it the moment you walked near
    // enough to see it. bakeRegion is idempotent and region-seeded, so asking
    // early changes nothing about which trees the world has.
    planet.ensureFeatures?.(f, u0 - 4, v0 - OUT - 4, u0 + W + 4, v0 + D + 4);
    level(planet, f, u0, v0, g);

    const out = { glow: [], chests: [], rooms: [], nodes: [], gate: null, chapel: null };
    const shape = buildYard(planet, f, u0, v0, g, rand, out);
    const dig = digger(planet, f);
    const floor = g - CRYPT_DROP;
    // Where the stair will come out, worked out rather than dug, because the
    // CORRIDORS GO FIRST and the stair is cut through them afterwards.
    //
    // The other way round leaves a hole you cannot climb out of. The stair's
    // foot lands on the last row of the lattice, and a junction is three cells
    // across — so the junction re-floored the last two steps to its own level
    // and left a two-block drop where a one-block step had been. You could get
    // down it. You could not get back up, and the crypt became a grave.
    const foot = {
      u: u0 + shape.stairI,
      v: v0 + shape.stairJ + CRYPT_DROP - 1,
      h: floor,
    };
    digCatacombs(dig, f, cU, cV, floor, foot, rand, out);
    digStair(dig, f, u0, v0, g, shape.stairI, shape.stairJ, out);

    list.push({
      f, u: cU, v: cV, g, floor, reach: REACH,
      dir: cellDir(f, cU, cV), u0, v0, w: W, d: D,
      gate: out.gate, chapel: out.chapel,
      stair: { f, u: foot.u, v: foot.v, h: floor },
      glow: out.glow, chests: out.chests,
      rooms: out.rooms, nodes: out.nodes,
    });
    for (const c of out.chests) planet.cryptChests.push(c);
  }
  return list;
}

// --- what is in the boxes ---------------------------------------------------
//
// Grave goods, and the kit of whoever came down here before you and did not
// come back. Tiered by the cell hash — most chests hold what a tomb holds, a
// few hold something that was worth the walk — because chest contents NEVER
// cross the wire: two people standing in one chamber have to compute the same
// box out of the same cell, or one of them empties something the other still
// sees full. Exactly the rule main.js's house larders follow.

const GRAVE = [
  ['bone', 2, 6], ['coal', 2, 5], ['flint', 1, 4], ['leather', 1, 3],
  ['clay', 2, 5], ['torch', 2, 6], ['stick', 2, 6], ['feather', 1, 4],
];
const TOMB = [
  ['gold_ingot', 1, 3], ['iron_ingot', 1, 4], ['brass_ingot', 1, 2],
  ['raw_iron', 2, 5], ['silver_ingot', 1, 2], ['dye_blue', 1, 3],
  ['glass_pane', 2, 6], ['arrow', 6, 16], ['bread', 1, 3], ['apple', 1, 3],
];
// The one thing worth the dark. A tool comes out of a tomb USED — it was
// somebody's, and they are still down here.
const PRIZE = [
  ['diamond', 1, 2], ['gold_block', 1, 1], ['iron_pickaxe', 1, 1],
  ['iron_sword', 1, 1], ['bow', 1, 1], ['spear', 1, 1],
  ['diamond_sword', 1, 1], ['lantern', 1, 2], ['hammer', 1, 1],
];

/**
 * The stock of one crypt chest, derived from its cell and the world seed.
 * Returns [{ id, count, used }] — `used` asks the caller to roll a durability
 * for it, because only main.js knows the tool table.
 *
 * `has(id)` is the caller's items.js lookup: this file never imports the item
 * registry, so a name that is not there yet is skipped rather than thrown.
 */
export function cryptLoot(cell, worldSeed, has = () => true) {
  let h = (cell.f * 8191 + cell.u * 92837111 + cell.v * 689287499 + cell.h * 97) | 0;
  h = (h ^ Math.imul(worldSeed | 0, 2654435761)) | 0;
  const rand = mulberry32(h);
  const out = [];
  const pick = (table) => {
    for (let tries = 0; tries < 6; tries++) {
      const [id, lo, hi] = table[(rand() * table.length) | 0];
      if (!has(id)) continue;
      return { id, count: lo + ((rand() * (hi - lo + 1)) | 0) };
    }
    return null;
  };
  const push = (s) => { if (s && s.count > 0) out.push(s); };
  const n = 2 + ((rand() * 2) | 0);
  for (let i = 0; i < n; i++) push(pick(GRAVE));
  if (rand() < 0.7) push(pick(TOMB));
  if (rand() < 0.45) {
    const s = pick(PRIZE);
    if (s) { s.used = true; push(s); }
  }
  return out;
}
