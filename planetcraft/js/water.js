// --- water that finds its level ---------------------------------------------
//
// Break the wall of a pond and the pond comes out. That is the whole of it,
// and it is the one thing a voxel world is expected to do that this one did
// not: every drop sat exactly where the generator put it, so a channel dug
// from the sea to a hollow was a dry channel and a hole knocked in a dam was
// a hole with the lake still sitting behind it.
//
// Three rules, and between them they answer the two ways this could go wrong.
//
// **Water only ever moves downhill.** It falls if there is space under it;
// failing that it steps sideways, but only toward a drop it can see within
// FLOW.reach cells. Water with nowhere lower to go is water at rest. That is
// what makes the whole thing STOP: every move takes the world one step nearer
// a state with no moves left in it.
//
// **The sea does not empty.** A cell the generator fills with water is a
// SOURCE: water flows out of it and it stays full, because the sea is bigger
// than any hole you can dig and pretending otherwise means a bucket-sized pit
// leaves a bucket-sized dent in the ocean surface for ever. A cell somebody's
// bucket filled is not a source and empties like anything else. Planet's
// `generated` is what tells the two apart, and it is the only thing in here
// that needs to know how the world was made.
//
// **It cannot flood upwards.** Downhill-only plus sources-at-sea-level means
// the sea can fill anything below it and nothing above it. One broken block
// cannot drown a planet.
//
// **...and water finds its LEVEL, six cells of it.** Downhill-only on its own
// was not enough, and the case that showed it is the simplest one there is:
// knock the ground out beside a pond, leaving a hole whose floor is level with
// the water, and the hole stayed dry — there was no drop for the water to aim
// at, so nothing moved and the pond sat there with a dent in its bank. Water
// does not do that.
//
// So a cell that has nowhere lower to go SPREADS: it wets the air beside it at
// its own level, and what it wets can wet the cell beyond, up to FLOW.spread
// steps from the sea or lake that is feeding the run. Three things keep that
// from being the planet-drowning flood the downhill rule was written to
// prevent:
//
//   - Only a SPRING starts one. A cell the generator filled is at distance
//     zero; every cell a spread creates knows how far it is from that spring
//     and refuses to pass six. A bucket of water is not a spring and does not
//     spread at all — it falls, like it always did.
//   - Every step is strictly further from the spring than the cell that made
//     it, so the run is a breadth-first walk six deep and it cannot circle.
//   - A spread cell with nothing feeding it any more DRAINS. Dam the channel
//     and the water beyond the dam goes, one cell a tick, back to air — which
//     is the behaviour that makes a canal you cut something you can also
//     un-cut.
//
// The distances live in a Map beside the live list, not in the world: they are
// a fact about a flood in progress, not about the blocks. A cell that is still
// wet when the map is thrown away is simply water, and the next thing to poke
// it treats it as water somebody's bucket left.
//
// Every cell it changes goes through main.js's `setBlock` — into the edit
// diff, out over the wire, saved with the session — because water arriving
// somewhere the generator did not put it is a record of what happened, not
// something a second machine could work out from the world's name. That is
// rule 1 of the chief, applied to a puddle.

import { BLOCK, PLANTS, neighborColumn } from './cubesphere.js';

export const FLOW = {
  reach: 10,       // how far it will look sideways for a way down. A channel
                   // longer than this, cut dead level, does not fill on its
                   // own — water with no drop in sight is water at rest, and
                   // that is the price of never flooding anything upward
  perTick: 24,     // cells moved in one flow tick. Every one of them is an
                   // edit on the wire, so this is a network budget as much as
                   // a frame one
  every: 0.14,     // seconds between flow ticks — a current, not a teleport
  range: 90,       // only near the player: a flood nobody is watching is a
                   // few thousand diff entries nobody asked for
  active: 4000,    // cells on the watch list at once, a runaway backstop
  spread: 6,       // how far water runs SIDEWAYS at its own level, in cells
                   // from the sea or lake feeding it. See "water finds its
                   // level" below — this is the number that makes a hole dug
                   // beside a pond fill, and the number that stops a broken
                   // block wetting a continent
};

const key = (f, u, v, h) => `${f},${u},${v},${h}`;

// A cell water can move into: air, or something growing that the water simply
// washes away. Everything else — rock, planks, a fence, another fluid — stops
// it, which is what makes a wall a wall.
const passable = (b) => b === BLOCK.AIR || PLANTS.has(b);

// The four ways round a column, in the order they are tried. Face-crossing is
// neighborColumn's problem and not this file's, which is the whole reason the
// water works at the seam between two faces of the cube.
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// ...and the columns an edit wakes: everything within two steps of it.
const POKE = [];
for (let du = -2; du <= 2; du++) {
  for (let dv = -2; dv <= 2; dv++) {
    if (Math.abs(du) + Math.abs(dv) <= 2) POKE.push([du, dv]);
  }
}

export class Water {
  // `planet` reads the world, `set` writes it — main.js owns the blocks and
  // this owns the argument about where they should be, the same split work.js
  // is built on. `near` answers "is this cell worth simulating", so a flood on
  // the far side of the planet is somebody else's problem.
  constructor(planet, set, near) {
    this.planet = planet;
    this.set = set;
    this.near = near ?? (() => true);
    this.live = new Map();      // cells that might still have a move in them
    // How far each spread cell is from the spring feeding it. Absent means
    // "not part of a run" — a spring, or water a bucket left — and only the
    // spring may start one.
    this.dist = new Map();
    this.clock = 0;
    this.moved = 0;             // cells moved since the world was loaded
  }

  // Something changed at this cell. Wake everything within two columns of it
  // and a course either side: the block you just broke may be a hole for the
  // water beside it, and the block you just placed may be a dam.
  //
  // TWO and not one, which looks like belt and braces and is not. Cut a
  // channel to the shore leaving the last block in, then pull that block, and
  // the nearest water is two cells away across the gap you dug yesterday —
  // wake only what the block touched and the sea never hears about it.
  poke(f, u, v, h) {
    for (const [du, dv] of POKE) {
      const [nf, nu, nv] = du || dv ? neighborColumn(f, u, v, du, dv) : [f, u, v];
      for (let dh = -1; dh <= 1; dh++) this.wake(nf, nu, nv, h + dh);
    }
  }

  // Only water goes on the list. A cell with nothing in it cannot move, and a
  // poke that wakes thirteen columns three courses deep would otherwise spend
  // the whole tick's budget looking at air — the flood would run at a fifth
  // the speed for exactly no gain.
  wake(f, u, v, h) {
    if (h < 0 || this.live.size >= FLOW.active) return;
    if (this.planet.get(f, u, v, h) !== BLOCK.WATER) return;
    this.live.set(key(f, u, v, h), [f, u, v, h]);
  }

  clear() { this.live.clear(); this.dist.clear(); }

  // How far this cell is from the water feeding it. A spring is the water
  // feeding it, so it is zero; a cell nothing is known about cannot start a
  // run, which is what keeps a bucket of water a bucket of water.
  levelOf(f, u, v, h) {
    if (this.spring(f, u, v, h)) return 0;
    const d = this.dist.get(key(f, u, v, h));
    // NULL, not "as far away as it gets". A cell nothing is known about is not
    // at the end of a run — it is not IN one, and the difference matters at
    // both ends: it may not start a spread, and it may not be drained by one
    // either. That is what keeps a bucket of water, or the water standing in a
    // village fountain, exactly where somebody put it.
    return d === undefined ? null : d;
  }

  // Wet a cell at this level. Not a `pour`: nothing leaves the cell that did
  // it, because the sea does not get smaller when a puddle appears beside it.
  wet(f, u, v, h, d) {
    this.set(f, u, v, h, BLOCK.WATER);
    this.dist.set(key(f, u, v, h), d);
    this.moved++;
    this.poke(f, u, v, h);
  }

  // Is anything still feeding this cell? Something directly above it, or a
  // neighbour at its own level that is nearer the spring than it is. When the
  // answer is no, the run has been cut and this cell is on its way out.
  fed(f, u, v, h, d) {
    if (this.planet.get(f, u, v, h + 1) === BLOCK.WATER) return true;
    for (const [du, dv] of SIDES) {
      const [nf, nu, nv] = neighborColumn(f, u, v, du, dv);
      if (this.planet.get(nf, nu, nv, h) !== BLOCK.WATER) continue;
      // water beside it that is not part of this run at all — a lake, a
      // fountain, somebody's bucket — is water holding it up
      const nl = this.levelOf(nf, nu, nv, h);
      if (nl === null || nl < d) return true;
    }
    return false;
  }

  // Water finds its level: wet the air beside it, one step further from the
  // spring. Returns true if anything was wetted, which is what tells the tick
  // this cell was worth a turn.
  spread(f, u, v, h) {
    const d = this.levelOf(f, u, v, h);
    if (d === null || d >= FLOW.spread) return false;
    let any = false;
    for (const [du, dv] of SIDES) {
      const [nf, nu, nv] = neighborColumn(f, u, v, du, dv);
      if (!passable(this.planet.get(nf, nu, nv, h))) continue;
      // ...and only into a HOLE, not off a shelf into thin air: a cell with
      // nothing under it is a drop, and a drop is wayDown's business — it
      // pours there rather than standing a sheet of water on the edge.
      if (passable(this.planet.get(nf, nu, nv, h - 1))) continue;
      this.wet(nf, nu, nv, h, d + 1);
      any = true;
    }
    return any;
  }

  // Is this cell one the generator filled? A source: water leaves it and it
  // is still full afterwards.
  spring(f, u, v, h) {
    return this.planet.generated(f, u, v, h) === BLOCK.WATER;
  }

  // The step that takes this water nearest a way down, or null if there is no
  // way down within reach. A breadth-first walk over the passable cells at
  // this level, so it goes round a corner in the dam rather than only
  // straight at it — and it is bounded by FLOW.reach, which is what stops one
  // pond from searching a continent every tick.
  wayDown(f, u, v, h) {
    const seen = new Set([key(f, u, v, h)]);
    // each entry: the cell, and the FIRST step that led to it
    let edge = [[f, u, v, null]];
    for (let step = 0; step < FLOW.reach && edge.length; step++) {
      const next = [];
      for (const [cf, cu, cv, first] of edge) {
        for (const [du, dv] of SIDES) {
          const [nf, nu, nv] = neighborColumn(cf, cu, cv, du, dv);
          const k = key(nf, nu, nv, h);
          if (seen.has(k)) continue;
          seen.add(k);
          if (!passable(this.planet.get(nf, nu, nv, h))) continue;
          const from = first ?? [nf, nu, nv];
          // a drop: this cell has nothing holding it up
          if (passable(this.planet.get(nf, nu, nv, h - 1))) return from;
          next.push([nf, nu, nv, from]);
        }
      }
      edge = next;
    }
    return null;
  }

  // Move one cell of water from a to b. The cell it leaves goes to air unless
  // the generator put water there, in which case it was a source and stays.
  pour(f, u, v, h, to) {
    this.set(to[0], to[1], to[2], to[3], BLOCK.WATER);
    // water that has fallen somewhere is not a spread cell any more: it is
    // where it landed, and the run it belonged to has moved on
    this.dist.delete(key(f, u, v, h));
    this.dist.delete(key(to[0], to[1], to[2], to[3]));
    if (!this.spring(f, u, v, h)) this.set(f, u, v, h, BLOCK.AIR);
    this.moved++;
    this.poke(f, u, v, h);
    this.poke(to[0], to[1], to[2], to[3]);
  }

  // One cell's turn. Returns true if it moved, which is all the tick needs to
  // know to spend its budget on the water that is actually going somewhere.
  step(f, u, v, h) {
    if (this.planet.get(f, u, v, h) !== BLOCK.WATER) return false;
    if (!this.near(f, u, v, h)) return false;
    // THE RUN WAS CUT. A spread cell with nothing feeding it any more goes
    // back to air — first, before it is asked to do anything else, or a
    // stranded arm of a canal would go on wetting the cells past it while the
    // cells behind it were draining.
    const d = this.levelOf(f, u, v, h);
    if (d !== null && d > 0 && !this.fed(f, u, v, h, d)) {
      this.set(f, u, v, h, BLOCK.AIR);
      this.dist.delete(key(f, u, v, h));
      this.poke(f, u, v, h);
      return true;
    }
    // straight down first: falling beats looking for somewhere to fall
    if (h > 0 && passable(this.planet.get(f, u, v, h - 1))) {
      this.pour(f, u, v, h, [f, u, v, h - 1]);
      return true;
    }
    const way = this.wayDown(f, u, v, h);
    if (way) {
      this.pour(f, u, v, h, [way[0], way[1], way[2], h]);
      return true;
    }
    // nowhere lower to go: find the level instead
    return this.spread(f, u, v, h);
  }

  // The flow tick. Not every frame — water that crossed a field in one frame
  // would be a wall of water arriving rather than a stream running — and
  // never more than perTick cells, so a dam breaking costs the same as a
  // dripping tap and the frame loop cannot be made to wait on either.
  update(dt) {
    if (!this.live.size) return 0;
    this.clock += dt;
    if (this.clock < FLOW.every) return 0;
    this.clock = 0;
    let budget = FLOW.perTick, moved = 0;
    // A copy, because a move wakes cells and a Map you add to while iterating
    // it is a loop that runs until the water stops, which is exactly the
    // frame-long stall this is written to avoid.
    const round = [...this.live.values()];
    this.live.clear();
    for (const [f, u, v, h] of round) {
      if (budget <= 0) { this.wake(f, u, v, h); continue; }
      budget--;
      if (this.step(f, u, v, h)) moved++;
    }
    // WHILE ANYTHING IS STILL MOVING, EVERYTHING KEEPS LOOKING. A move only
    // wakes the cells it touches, and that is too small a circle: the lake
    // behind a breach is four cells back from the water going through it, it
    // finds its way blocked by the last cell that went, and it is never asked
    // again — so a burst dam let exactly one bucket through and stopped. A
    // round that moved nothing drops the lot and the water goes to sleep,
    // which is what keeps this from being a loop that never ends.
    if (moved) {
      for (const [f, u, v, h] of round) {
        if (this.planet.get(f, u, v, h) === BLOCK.WATER) this.wake(f, u, v, h);
      }
    }
    return moved;
  }
}
