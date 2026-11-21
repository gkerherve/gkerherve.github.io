// power.js — wire, switches, and what happens at the end of the run.
//
// The first machinery in this world that is not a person. Four blocks and one
// idea: a DYNAMO makes power, WIRE carries it, a SWITCH lets it through or
// does not, and a consumer on the end does something when it arrives.
//
// --- what is stored, and what is not ----------------------------------------
//
// Nothing here is stored, and that is the whole design. Every one of the four
// is an ordinary block, so laying one is an edit — it ships on the wire and
// comes back out of the save exactly like a plank. The NETWORK is then walked
// out from the sources whenever anything changes, the same way the bell
// re-derives its village from the edit that is the bell (see "founding a
// settlement" in main.js, and the rule at the foot of CLAUDE.md: if two
// machines can work it out from what is already stored, it must not be
// stored).
//
// The one thing somebody DECIDED is a switch's position, and that is stored,
// because it is which of the two block ids the cell holds.
//
// --- what it costs ----------------------------------------------------------
//
// A walk over the player's own power blocks, and nothing else: main.js keeps
// the register of where they are (every one came through setBlock), so this
// never scans the world. A hundred wires is a hundred lookups, done only when
// something changed.

import { BLOCK, S, H, dirFromCell, cellFromDir, cellIdx } from './cubesphere.js';
import * as CS from './cubesphere.js';

export const POWER = {
  // How far one dynamo's current will run. A bound is needed or a mile of
  // wire is a mile of walk every time somebody flicks a switch; a hundred
  // cells is a long street and nobody has laid one yet.
  reach: 240,
  // ...and the ceiling on one network, for the same reason.
  cells: 4096,
};

export const key = (f, u, v, h) => `${f},${u},${v},${h}`;

// The neighbour one step away, ACROSS A FACE SEAM if that is where it is.
//
// A power run laid over the edge of a cube face would otherwise stop dead at
// the seam — and the seam is invisible, so it would read as wire that
// sometimes does not work. planet.get already re-projects through the sphere
// to answer what is there (see get in cubesphere.js); this does the same walk
// but keeps the cell it landed on, because a flood fill has to carry on from
// where it arrived.
export function stepCell(f, u, v, du, dv, out = [0, 0, 0]) {
  const nu = u + du, nv = v + dv;
  if (nu >= 0 && nv >= 0 && nu < S && nv < S) {
    out[0] = f; out[1] = nu; out[2] = nv;
    return out;
  }
  const d = dirFromCell(f, nu + 0.5, nv + 0.5);
  const c = cellFromDir(d[0], d[1], d[2]);
  out[0] = c[0]; out[1] = cellIdx(c[1]); out[2] = cellIdx(c[2]);
  return out;
}

// The six cells a current may step to: four along the ground and one either
// way up the wall. Diagonals are deliberately absent — a cable that carried
// round a corner it does not touch is a cable nobody can trace by eye.
const _n = [0, 0, 0];
export function neighbours(f, u, v, h, out = []) {
  out.length = 0;
  for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    stepCell(f, u, v, du, dv, _n);
    out.push([_n[0], _n[1], _n[2], h]);
  }
  if (h + 1 < H) out.push([f, u, v, h + 1]);
  if (h - 1 >= 0) out.push([f, u, v, h - 1]);
  return out;
}

/**
 * Walk the network and answer which cells are live.
 *
 * `cells` is main.js's register — a Map of key -> {f,u,v,h} for every power
 * block the player has laid. `get` reads a block. Returns a Set of the keys
 * of every LIVE cell: the sources themselves, the wire the current reached,
 * and the consumers standing on the end of it.
 *
 * A switch is a source when it is closed and a plain conductor when it is
 * open — which is to say an open switch conducts nothing, which is what a
 * switch is. That one line is the whole of the logic.
 */
export function solve(cells, get) {
  const live = new Set();
  if (!cells || !cells.size) return live;
  // The sources: a dynamo always, a switch only when somebody has closed it.
  const queue = [];
  for (const c of cells.values()) {
    const b = get(c.f, c.u, c.v, c.h);
    if (b === BLOCK.DYNAMO || (CS.isSwitch(b) && CS.switchOn(b))) {
      const k = key(c.f, c.u, c.v, c.h);
      live.add(k);
      queue.push(c);
    }
  }
  // ...and out along the wire from each of them, breadth first, so `reach` is
  // a real distance in cells rather than a walk order.
  let head = 0;
  const depth = new Map(queue.map((c) => [key(c.f, c.u, c.v, c.h), 0]));
  const nb = [];
  while (head < queue.length && live.size < POWER.cells) {
    const c = queue[head++];
    const d = depth.get(key(c.f, c.u, c.v, c.h)) ?? 0;
    if (d >= POWER.reach) continue;
    neighbours(c.f, c.u, c.v, c.h, nb);
    for (const [nf, nu, nv, nh] of nb) {
      const k = key(nf, nu, nv, nh);
      if (live.has(k)) continue;
      const b = get(nf, nu, nv, nh);
      // Wire carries the current on. Everything else on the end of a run is
      // lit by it but does not pass it along — so a lamp is not a junction
      // box, and a switch on the far end of a live wire is a switch you can
      // still turn a second circuit on with.
      if (CS.isWire(b)) {
        live.add(k);
        depth.set(k, d + 1);
        queue.push({ f: nf, u: nu, v: nv, h: nh });
      } else if (CS.isPowerLamp(b) || CS.isDoorBlock?.(b)) {
        live.add(k);
      }
    }
  }
  return live;
}

/**
 * What the world should look like, given which cells are live.
 *
 * Returns the list of block changes to make — [{f,u,v,h,b}] — and nothing
 * else: this module never writes to the planet. main.js puts every one of
 * them through setBlock, which is the door every other block change in this
 * game goes through (rule 1 in CLAUDE.md), so a lamp coming on is an ordinary
 * edit that ships to the other players and is there when you load the world
 * again.
 *
 * Two consumers, and both are things the game already knows how to draw:
 *
 *   a LAMP lights while the current reaches it
 *   a DOOR opens while it does, and shuts when it stops — which is a door
 *     somebody else can open from across the room, and the first thing
 *     anybody builds with a switch
 */
export function apply(cells, live, get) {
  const out = [];
  for (const c of cells.values()) {
    const b = get(c.f, c.u, c.v, c.h);
    const on = live.has(key(c.f, c.u, c.v, c.h));
    if (CS.isPowerLamp(b)) {
      const want = CS.powerLampId(on);
      if (want !== b) out.push({ ...c, b: want });
    } else if (CS.isWire(b)) {
      // ...and the cable itself, which goes yellow with current in it. It is
      // the only feedback a long run gives you: with the lamp round a corner,
      // the wire is how you find where the circuit stops.
      const want = CS.wireId(on);
      if (want !== b) out.push({ ...c, b: want });
    }
  }
  return out;
}

/**
 * The doors a live wire touches, and whether each should stand open.
 *
 * Doors are not in the register — there are thousands of them in a city and
 * none of them is a power block — so they are found the other way round:
 * from each live cell, look at the six neighbours for a door. That keeps the
 * cost proportional to the WIRE somebody laid rather than to the doors in the
 * world.
 */
export function doorsFor(live, get) {
  const out = [];
  const seen = new Set();
  const nb = [];
  for (const k of live) {
    const [f, u, v, h] = k.split(',').map(Number);
    neighbours(f, u, v, h, nb);
    for (const [nf, nu, nv, nh] of nb) {
      const nk = key(nf, nu, nv, nh);
      if (seen.has(nk)) continue;
      const b = get(nf, nu, nv, nh);
      if (!CS.isDoorBlock?.(b)) continue;
      seen.add(nk);
      out.push({ f: nf, u: nu, v: nv, h: nh, b, open: true });
    }
  }
  return out;
}

export default { POWER, solve, apply, doorsFor, neighbours, stepCell, key };
