// blueprint.js — buildings captured out of the world, and stamped back into it.
//
// Why this exists: every house in village.js is a JS function. Changing what a
// village looks like therefore means editing code, and the only way to ask for
// a change is to describe it in words — which is a lossy channel for a shape.
// A blueprint closes that loop. You build the house you want in the world, mark
// its two corners, and the box is written to disk; the generator then stamps
// what you built instead of what a function guessed. The design IS the file.
//
// The format is deliberately dull: a size, a front, and a run-length list of
// block ids in u-major order. It has to survive being read by a human in a
// diff, because that is how a design gets reviewed.
//
// Two things are NOT stored, on purpose:
//   * where the ground was. A blueprint is stamped onto a levelled plot, so
//     layer 0 is "the floor", not "height 63 on the world you built it on".
//   * anything about the world it came from. Same blueprint, any planet.

import {
  BLOCK, S, H, isStair, stairFacing, stairId, isLadder, ladderFacing, ladderId,
  isChair, chairFacing, chairId,
} from './cubesphere.js';

export const VERSION = 1;

// A facing is 0..3 = +u, -u, +v, -v (cubesphere.js owns that convention).
// One quarter turn maps +u to +v and +v to -u, which is this table. Getting it
// wrong is invisible on a plain wall and obvious on a staircase, so the
// round-trip test in tests.js turns a stair through all four and checks it.
const TURN = [2, 3, 1, 0];

export const turnFacing = (facing, turns) => {
  let f = facing;
  for (let i = 0; i < (turns & 3); i++) f = TURN[f];
  return f;
};

// The same turn applied to a block, so a stair or a ladder still faces the way
// it was built relative to the house. Everything else is orientation-free.
export function turnBlock(b, turns) {
  if (!(turns & 3)) return b;
  if (isStair(b)) {
    // stairId takes the material INDEX, not the material block, so this goes
    // back through the encoding rather than through stairMaterial()
    const idx = ((b - BLOCK.STAIR_BASE) / 4) | 0;
    return stairId(idx, turnFacing(stairFacing(b), turns));
  }
  if (isLadder(b)) return ladderId(turnFacing(ladderFacing(b), turns));
  if (isChair(b)) return chairId(turnFacing(chairFacing(b), turns));
  return b;
}

// --- the box ---------------------------------------------------------------

/**
 * Read a box out of the resident planet.
 *
 * `front` is the side the building is meant to show the street, as a facing.
 * The capture UI works it out from where you were standing, which is the one
 * thing a person reliably knows and a heuristic reliably gets wrong.
 */
export function capture(planet, f, u0, v0, h0, w, d, hgt, front = 0) {
  const cells = new Uint16Array(w * d * hgt);
  let i = 0;
  for (let u = 0; u < w; u++) {
    for (let v = 0; v < d; v++) {
      for (let h = 0; h < hgt; h++) {
        const uu = u0 + u, vv = v0 + v, hh = h0 + h;
        cells[i++] = (uu < 0 || vv < 0 || uu >= S || vv >= S || hh < 0 || hh >= H)
          ? BLOCK.AIR : planet.get(f, uu, vv, hh);
      }
    }
  }
  return { size: [w, d, hgt], front, cells };
}

// index into a blueprint's cells
const at = (bp, u, v, h) => (u * bp.size[1] + v) * bp.size[2] + h;

export const blockAt = (bp, u, v, h) => bp.cells[at(bp, u, v, h)];

/** A quarter turn about the vertical, `turns` times. Sizes swap on odd turns. */
export function rotate(bp, turns) {
  const t = turns & 3;
  if (!t) return { ...bp, cells: bp.cells.slice() };
  let cur = bp;
  for (let k = 0; k < t; k++) {
    const [w, d, hgt] = cur.size;
    const out = {
      size: [d, w, hgt],
      front: turnFacing(cur.front, 1),
      cells: new Uint16Array(w * d * hgt),
    };
    for (let u = 0; u < w; u++) {
      for (let v = 0; v < d; v++) {
        // +u goes to +v, +v goes to -u
        const nu = d - 1 - v, nv = u;
        for (let h = 0; h < hgt; h++) {
          out.cells[at(out, nu, nv, h)] = turnBlock(cur.cells[at(cur, u, v, h)], 1);
        }
      }
    }
    cur = out;
  }
  return cur;
}

/** How many quarter turns take `bp.front` round to `want`. */
export function turnsTo(bp, want) {
  for (let t = 0; t < 4; t++) if (turnFacing(bp.front, t) === want) return t;
  return 0;
}

// --- the doorway -----------------------------------------------------------

// Inferred rather than marked, because a marker is one more thing to remember
// and get wrong. A door is a gap you can walk through in the front wall: two
// air cells one above the other, standing on the floor, with something solid
// on both sides. The middle of the front is the fallback, which is also what
// you want for a barn with a cart opening rather than a door.
export function findDoor(bp) {
  const [w, d, hgt] = bp.size;
  const solid = (u, v, h) => {
    if (u < 0 || v < 0 || u >= w || v >= d || h < 0 || h >= hgt) return false;
    return blockAt(bp, u, v, h) !== BLOCK.AIR;
  };
  // walk the front wall. front 0 = +u face, 1 = -u, 2 = +v, 3 = -v
  const line = [];
  if (bp.front === 0 || bp.front === 1) {
    const u = bp.front === 0 ? w - 1 : 0;
    for (let v = 0; v < d; v++) line.push([u, v, 0, 1]);
  } else {
    const v = bp.front === 2 ? d - 1 : 0;
    for (let u = 0; u < w; u++) line.push([u, v, 1, 0]);
  }
  for (const [u, v, du, dv] of line) {
    for (let h = 1; h + 1 < hgt; h++) {
      if (solid(u, v, h) || solid(u, v, h + 1)) continue;
      if (!solid(u, v, h - 1)) continue;                    // must stand on floor
      if (!solid(u + du, v + dv, h) || !solid(u - du, v - dv, h)) continue;
      return { u, v, h };
    }
  }
  const mid = line[line.length >> 1];
  return mid ? { u: mid[0], v: mid[1], h: 1 } : { u: 0, v: 0, h: 1 };
}

// --- writing it back -------------------------------------------------------

/**
 * Stamp a blueprint into the planet with its lowest layer at `base`.
 *
 * Everything in the box is written, air included: a blueprint is the whole of
 * what stands on that plot, so leaving the old blocks where the new building
 * has a window would fill it in with whatever was there before.
 */
export function stamp(planet, bp, f, u0, v0, base, out) {
  const [w, d, hgt] = bp.size;
  let n = 0;
  for (let u = 0; u < w; u++) {
    for (let v = 0; v < d; v++) {
      for (let h = 0; h < hgt; h++) {
        const uu = u0 + u, vv = v0 + v, hh = base + h;
        if (uu < 0 || vv < 0 || uu >= S || vv >= S || hh < 0 || hh >= H) continue;
        const b = bp.cells[at(bp, u, v, h)];
        planet.set(f, uu, vv, hh, b);
        if (out) out(f, uu, vv, hh, b);
        n++;
      }
    }
  }
  return n;
}

// --- the file ---------------------------------------------------------------

// Run-length, because a house is mostly air and mostly repeated wall, and a
// 9x7x9 box is 567 cells that compress to a few dozen runs. Pairs of
// [block, count] rather than a string, so a diff shows what changed.
export function encode(bp, name = 'blueprint') {
  const runs = [];
  let prev = -1, run = 0;
  for (let i = 0; i < bp.cells.length; i++) {
    const b = bp.cells[i];
    if (b === prev) { run++; continue; }
    if (run) runs.push([prev, run]);
    prev = b; run = 1;
  }
  if (run) runs.push([prev, run]);
  return {
    version: VERSION,
    name,
    size: [...bp.size],
    front: bp.front,
    door: findDoor(bp),
    cells: runs.length,
    runs,
  };
}

export function decode(obj) {
  const [w, d, hgt] = obj.size;
  const cells = new Uint16Array(w * d * hgt);
  let i = 0;
  for (const [b, n] of obj.runs) {
    for (let k = 0; k < n && i < cells.length; k++) cells[i++] = b;
  }
  return { size: [w, d, hgt], front: obj.front ?? 0, cells, name: obj.name };
}
