// THE WAY THERE.
//
// Nothing in this game could find a path. A villager aimed himself at where
// he was going and walked; when a wall stopped him he rubbed along it, and
// when that had failed for a few seconds he was let THROUGH it — to his bed,
// to a seat in the café, to the privy and back out of it, home with a load.
// "No steering fix has ever beaten every fence a village can build" was true,
// and passing through the fence was the answer for a long time. The player's
// answer is the right one: they cannot go through walls. So this is a path.
//
// It is A* over the cells a body can STAND in, on the planet's own lattice,
// under exactly the rules the body is moved by (see groundAt, floorNear and
// tryMove in entities.js): a floor to stand on, two clear cells over it, a
// step up of one, a drop of three, never into water, never onto a fence. A
// shut door is a way through that costs a moment — whoever walks the path
// opens it (openDoorAhead in work.js) — and furniture is ground of the last
// resort, so a route keeps to the aisles and crosses a table only when a
// room leaves nothing else.
//
// IT READS THE WORLD AND CHANGES NOTHING. A path is one body's plan for the
// next few seconds: never stored, never sent, worked out again on every
// machine from the same blocks. It is a picture of the world and not a cause
// in it, which is why it may live outside the edit diff.
//
// AND IT IS BOUNDED, twice. A search stops after `each` cells and hands back
// the way to the cell NEAREST the goal it found, which the walker follows and
// then asks again from there — so a walk of a hundred blocks is a few short
// searches and not one long one. And all the searches of one frame share one
// allowance (`frame`): a village sent to bed at once plans over a few frames
// and nobody's frame is spent on it.

import * as CS from './cubesphere.js';

const { BLOCK } = CS;

export const NAV = {
  each: 1400,        // cells one search may open
  big: 4500,         // ...and one that has already failed once
  frame: 4500,       // cells every search of one frame may open between them
  least: 400,        // not worth starting a search with less than this left
  reach: 56,         // cells from where he stands that a search may wander
  drop: 3,           // cells a body will step DOWN (floorNear looks four)
  jump: 8,           // ...and how far he will jump down under an open sky
  door: 2.5,         // what a shut door costs, in cells of walking
  soft: 7,           // ...and climbing over the furniture
  weight: 1.25,      // how hard the search leans toward the goal
  leg: 46,           // blocks: further off than this is walked toward in legs
  stride: 36,        // ...of this many blocks each
};

export const navStats = { plans: 0, cells: 0, none: 0, partial: 0, ms: 0 };

let left = NAV.frame;
// Once a frame, from updateEntities: the frame's allowance is whole again.
export function navFrame() { left = NAV.frame; }
export const navLeft = () => left;

// What a cell IS, to a body: looked up once per block id and kept.
const CLEAR = 0, DOOR = 1, FOOT = 2, SOFT = 3, WALL = 4, WET = 5, RUNG = 6;
const KIND = new Int8Array(4096).fill(-1);
function kindOf(b) {
  if (b === BLOCK.AIR) return CLEAR;
  let k = b < 4096 ? KIND[b] : -1;
  if (k >= 0) return k;
  if (b === BLOCK.WATER || b === BLOCK.LAVA) k = WET;
  else if (CS.isDoorBlock(b)) k = CS.doorOpen(b) ? CLEAR : DOOR;
  else if (CS.isLadder(b)) k = RUNG;
  else if (CS.PASSABLE.has(b)) k = CLEAR;
  else if (CS.fencelike(b)) k = WALL;
  else if (CS.isFurniture(b) || b === BLOCK.CHEST || b === BLOCK.FURNACE
    || b === BLOCK.CRAFTING) k = SOFT;
  else k = FOOT;
  if (b < 4096) KIND[b] = k;
  return k;
}

const QUARTER = Math.PI / 4;

// A direction as continuous cell coordinates ON A GIVEN FACE — which may be
// past that face's edge, exactly as planet.get() reads a cell past the edge
// by re-projecting it. Null when the direction is nowhere near that face.
export function cellOnFace(f, x, y, z, out = [0, 0]) {
  const F = CS.FACES[f];
  const nd = x * F.n[0] + y * F.n[1] + z * F.n[2];
  if (nd < 0.45) return null;
  const a = (x * F.u[0] + y * F.u[1] + z * F.u[2]) / nd;
  const b = (x * F.v[0] + y * F.v[1] + z * F.v[2]) / nd;
  out[0] = (Math.atan(a) / QUARTER + 1) * 0.5 * CS.S;
  out[1] = (Math.atan(b) / QUARTER + 1) * 0.5 * CS.S;
  return out;
}

// --- the search's own storage, reused between searches ----------------------
let cap = 4096;
let nU = new Int32Array(cap), nV = new Int32Array(cap), nH = new Int16Array(cap);
let nG = new Float32Array(cap), nF = new Float32Array(cap);
let nP = new Int32Array(cap), nS = new Uint8Array(cap);   // parent, state bits
let count = 0;
const index = new Map();      // cell key -> node
const kinds = new Map();      // cell key -> kind, for this search
let heap = new Int32Array(cap), heapN = 0;

function grow() {
  cap *= 2;
  const g = (A, T) => { const B = new T(cap); B.set(A); return B; };
  nU = g(nU, Int32Array); nV = g(nV, Int32Array); nH = g(nH, Int16Array);
  nG = g(nG, Float32Array); nF = g(nF, Float32Array);
  nP = g(nP, Int32Array); nS = g(nS, Uint8Array);
  heap = g(heap, Int32Array);
}

const OFF = 4096;
const keyOf = (u, v, h) => ((u + OFF) * 16384 + (v + OFF)) * 512 + h;

function push(i) {
  let c = heapN++;
  heap[c] = i;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (nF[heap[p]] <= nF[heap[c]]) break;
    const t = heap[p]; heap[p] = heap[c]; heap[c] = t;
    c = p;
  }
}
function pop() {
  const top = heap[0];
  const last = heap[--heapN];
  if (heapN > 0) {
    heap[0] = last;
    let c = 0;
    for (;;) {
      const l = c * 2 + 1, r = l + 1;
      let m = c;
      if (l < heapN && nF[heap[l]] < nF[heap[m]]) m = l;
      if (r < heapN && nF[heap[r]] < nF[heap[m]]) m = r;
      if (m === c) break;
      const t = heap[m]; heap[m] = heap[c]; heap[c] = t;
      c = m;
    }
  }
  return top;
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Find a way. `from` and `to` are cells on face `f` ({u, v, h}; `to.h` may be
// null for "whatever floor that column has"), `reach` is how many cells short
// of the goal counts as there — one, for a goal that is a thing and not a
// place to stand: a bed, a chair, a tree.
//
// Answers { path, partial, door } — the cells to walk through, start left
// out — or null when no step in any direction gets him nearer.
export function findPath(planet, f, from, to, opts = {}) {
  const reach = opts.reach ?? 0;
  const wade = !!opts.wade;
  // A SEARCH GETS ITS WHOLE ALLOWANCE OR IT WAITS A FRAME. Cut short by what
  // the frame had left, it comes back saying "no way" about a way it simply
  // had not reached yet — a chief on his throne with the café behind the
  // hall was told twice there was no route to it, by searches that had been
  // handed four hundred cells each. The first search of a frame always runs.
  const want = opts.max ?? NAV.each;
  if (left < want && left < NAV.frame) return undefined;   // not this frame
  const t0 = performance.now();
  count = 0; heapN = 0;
  index.clear(); kinds.clear();
  const H = CS.H;

  const kind = (u, v, h) => {
    if (h < 0 || h >= H) return h < 0 ? FOOT : CLEAR;
    const k = keyOf(u, v, h);
    let c = kinds.get(k);
    if (c === undefined) {
      c = kindOf(planet.get(f, u, v, h));
      kinds.set(k, c);
    }
    return c;
  };
  const open = (k) => k === CLEAR || k === DOOR || k === RUNG || (wade && k === WET);
  // Where a body stepping into this column from height `h` would end up:
  // the floor topping out highest within a step up and a short drop, with
  // room over it — floorNear's own rule. -1 for a wall.
  const stepTo = (u, v, h) => {
    for (let c = h; c >= h - NAV.drop - 1; c--) {
      const k = kind(u, v, c);
      if (k === CLEAR || k === DOOR || k === WET || k === RUNG) continue;
      if (k !== FOOT && k !== SOFT) return -1;
      const h2 = c + 1;
      // room for him where he lands, and nothing in the way of his feet on
      // the way down to it. (Not his head at the height he LEFT: a chief
      // gets up off a throne set under a shelf, and the floor in front of it
      // is no less a floor for the shelf.)
      const top = h2 >= h ? h2 + 1 : Math.max(h2 + 1, h);
      for (let a = h2; a <= top; a++) if (!open(kind(u, v, a))) return -1;
      return h2;
    }
    // NOTHING UNDER HIM FOR FOUR CELLS: the edge of a roof, a bank, a quarry.
    // Out of doors a body walks off one and lands (the height field has no
    // opinion about how far down the ground is), so a route may too — it is
    // how a man who has got onto a roof comes off it, and without it he
    // stood on the eaves all night looking at a five-cell drop to his own
    // street. Only onto the top of the column, under the open sky.
    const t = planet.columnTop(f, u, v);
    if (t + 1 >= h - NAV.jump && t + 1 < h) {
      const k = kind(u, v, t);
      if ((k === FOOT || k === SOFT) && open(kind(u, v, t + 1))) return t + 1;
    }
    return -1;
  };

  let gh = to.h;
  let near = reach;
  // a goal he could never stand IN is one he walks up to
  if (gh != null) {
    const k = kind(to.u, to.v, gh - 1);
    const ok = (k === FOOT || k === SOFT)
      && open(kind(to.u, to.v, gh)) && open(kind(to.u, to.v, gh + 1));
    if (!ok) near = Math.max(near, 1);
  }
  const gu = to.u, gv = to.v;
  const dist = (u, v, h) => {
    const du = Math.abs(u - gu), dv = Math.abs(v - gv);
    const d = (du > dv ? du + 0.4142 * dv : dv + 0.4142 * du);
    return d + (gh == null ? 0 : 0.5 * Math.abs(h - gh));
  };
  const there = (u, v, h) => Math.abs(u - gu) <= near && Math.abs(v - gv) <= near
    && (gh == null || Math.abs(h - gh) <= 1);

  const add = (u, v, h, g, parent, bits) => {
    if (count >= cap) grow();
    const i = count++;
    nU[i] = u; nV[i] = v; nH[i] = h; nG[i] = g;
    nF[i] = g + NAV.weight * dist(u, v, h);
    nP[i] = parent; nS[i] = bits;
    index.set(keyOf(u, v, h), i);
    push(i);
    return i;
  };

  const relax = (i, u2, v2, h2, cost, bits) => {
    const g = nG[i] + cost;
    const j = index.get(keyOf(u2, v2, h2));
    if (j !== undefined) {
      if (nS[j] & 1 || nG[j] <= g) return;
      nG[j] = g; nF[j] = g + NAV.weight * dist(u2, v2, h2);
      nP[j] = i; nS[j] = bits;
      push(j);
    } else add(u2, v2, h2, g, i, bits);
  };

  add(from.u, from.v, from.h, 0, -1, 0);
  let best = 0, bestD = dist(from.u, from.v, from.h);
  let goal = there(from.u, from.v, from.h) ? 0 : -1;
  let opened = 0;
  while (goal < 0 && heapN > 0 && opened < want) {
    const i = pop();
    if (nS[i] & 1) continue;                 // already settled by a better road
    nS[i] |= 1;
    opened++;
    const u = nU[i], v = nV[i], h = nH[i];
    if (there(u, v, h)) { goal = i; break; }
    const d = dist(u, v, h);
    if (d < bestD) { bestD = d; best = i; }
    // THE LADDER. A rung in the cell his feet are in takes him up one; a rung
    // in the cell under them takes him down one. Neither end is a floor —
    // the body is on the ladder, and the walker carries it along the route
    // at the route's own height (see navTo) until it steps off onto boards.
    if (kind(u, v, h) === RUNG && open(kind(u, v, h + 1)) && open(kind(u, v, h + 2))) {
      relax(i, u, v, h + 1, 1.3, 4);
    }
    if (h > 1 && kind(u, v, h - 1) === RUNG && open(kind(u, v, h))) {
      relax(i, u, v, h - 1, 1.1, 4);
    }
    for (let s = 0; s < 8; s++) {
      const du = STEPS[s][0], dv = STEPS[s][1];
      const u2 = u + du, v2 = v + dv;
      if (Math.abs(u2 - from.u) > NAV.reach || Math.abs(v2 - from.v) > NAV.reach) continue;
      const h2 = stepTo(u2, v2, h);
      // ...and onto the TOP of one: the hatch is a hole in the floor, which
      // is a drop to anything that does not know there are rungs in it
      if (s < 4 && h2 !== h && kind(u2, v2, h - 1) === RUNG
        && open(kind(u2, v2, h)) && open(kind(u2, v2, h + 1))) {
        relax(i, u2, v2, h, 1.2, 4);
        continue;
      }
      if (h2 < 0) continue;
      let cost = s < 4 ? 1 : 1.4142;
      if (s >= 4) {
        // NO CUTTING A CORNER: a diagonal is two steps taken at once, and
        // both of them have to be steps he could take
        const a = stepTo(u2, v, h), b = stepTo(u, v2, h);
        if (a < 0 || b < 0 || Math.abs(a - h) > 1 || Math.abs(b - h) > 1) continue;
        if (kind(u2, v, a) === DOOR || kind(u, v2, b) === DOOR) continue;
      }
      let bits = 0;
      const feet = kind(u2, v2, h2);
      if (feet === DOOR || kind(u2, v2, h2 + 1) === DOOR) { cost += NAV.door; bits |= 2; }
      if (feet === WET) cost += 4;
      if (kind(u2, v2, h2 - 1) === SOFT) cost += NAV.soft;
      if (h2 !== h) cost += h - h2 > NAV.drop ? 4 : 0.6;
      relax(i, u2, v2, h2, cost, bits);
    }
  }
  left -= opened;
  navStats.plans++;
  navStats.cells += opened;
  const end = goal >= 0 ? goal : best;
  const out = [];
  let door = false;
  for (let i = end; i > 0; i = nP[i]) {
    const isDoor = (nS[i] & 2) !== 0;
    door = door || isDoor;
    out.push({ u: nU[i], v: nV[i], h: nH[i], door: isDoor, lad: (nS[i] & 4) !== 0 });
  }
  out.reverse();
  navStats.ms += performance.now() - t0;
  if (goal < 0) {
    if (!out.length) { navStats.none++; return null; }
    navStats.partial++;
  }
  return { path: out, partial: goal < 0, door, short: bestD };
}

// The floor of a column nearest a height: where a goal that is only a
// direction actually is. Null when the column has nowhere to stand.
export function floorAt(planet, f, u, v, nearH) {
  const top = Math.min(CS.H - 2, planet.columnTop(f, u, v) + 1);
  let best = null, bestD = Infinity;
  const lo = Math.max(1, Math.min(nearH - 12, top - 40));
  for (let h = top; h >= lo; h--) {
    const below = kindOf(planet.get(f, u, v, h - 1));
    if (below !== FOOT && below !== SOFT) continue;
    const a = kindOf(planet.get(f, u, v, h)), b = kindOf(planet.get(f, u, v, h + 1));
    const free = (k) => k === CLEAR || k === DOOR || k === RUNG;
    if (!free(a) || !free(b)) continue;
    const d = Math.abs(h - nearH);
    if (d < bestD) { bestD = d; best = h; }
  }
  return best;
}
