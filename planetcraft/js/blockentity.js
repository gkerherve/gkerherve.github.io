// blockentity.js — the state that hangs off a single cell.
//
// A voxel id is one byte, so a chest cannot carry 27 slots and a furnace
// cannot carry a burn timer. Both live here instead, in a Map keyed by
// "f,u,v,h", exactly the way main.js already keys its edit log. The world
// stays a flat byte array; only the handful of cells the player made
// interesting cost anything.
//
// The shell of a radius-800 planet is over a billion cells, so **nothing here
// ever scans the world**. Furnaces tick from an explicit `active` set that a
// furnace removes itself from the moment it goes idle, so an abandoned smelter
// costs zero per frame and 200 of them cost 200 field updates — never a
// search. Same reasoning as the crop map in items.js.
//
// No DOM and no `three` import: the meshes are blockanim.js's problem, so this
// module unit-tests under node. (It does pull crafting.js/items.js for the
// smelting table and the fuel values, which is data, not rendering.)

import { smeltResult, fuelValue, isFuel } from './crafting.js';
import { stackSize } from './items.js';
import { BLOCK } from './cubesphere.js';
// namespace, not named imports: canBeDoor consults helpers that a stripped
// build of the world module may not export, and a missing NAMED import is a
// link error that takes the whole game down
import * as CS from './cubesphere.js';

export const KIND = { CHEST: 'chest', FURNACE: 'furnace', DOOR: 'door', BIN: 'bin' };

export const CHEST_SLOTS = 27;

// items.js states `fuel` as "how many items one unit smelts", and the smelting
// table's times average ~10 s, so one fuel unit buys 10 seconds of burn. That
// makes a coal lump (fuel 8) smelt exactly 8 iron, which is the number the
// item table already promises.
export const BURN_SECONDS_PER_UNIT = 10;

// which blocks carry state. Doors are not in here: a door is *made* from a
// plank by using it, so its entity is created explicitly, not implied by the
// block id (see toggleDoor below).
export const ENTITY_BLOCKS = new Map([
  [BLOCK.CHEST, KIND.CHEST],
  [BLOCK.FURNACE, KIND.FURNACE],
  // ...and the bin, which is a chest that burns — see Bin below
  ...(BLOCK.BIN != null ? [[BLOCK.BIN, KIND.BIN]] : []),
]);

export const kindForBlock = (b) => ENTITY_BLOCKS.get(b) ?? null;
export const hasBlockEntity = (b) => ENTITY_BLOCKS.has(b);

// Blocks that can be turned into a swinging door by using them bare-handed.
// Any plank and any glass, which now means every timber species and every
// tint: a birch door is as reasonable a thing to want as an oak one, and a
// door made of the wall it sits in is the whole point of the feature.
export const DOOR_BLOCKS = new Set([BLOCK.PLANK, BLOCK.GLASS]);
export const canBeDoor = (b) => DOOR_BLOCKS.has(b)
  || !!CS.isPlank?.(b) || !!CS.isGlass?.(b);

export const cellKey = (f, u, v, h) => `${f},${u},${v},${h}`;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const copyStack = (s) => (s ? { ...s } : null);

// two stacks merge only if they are the same item AND neither carries
// durability — otherwise two half-worn picks would silently become one
// ...and neither may CONTAIN anything: a chest broken with its goods inside
// travels as one stack carrying `keep`, and two of those merged would be one
// chest and somebody's goods gone.
const mergeable = (a, b) =>
  !!a && !!b && a.id === b.id && a.dur === undefined && b.dur === undefined
  && a.keep === undefined && b.keep === undefined
  && a.count < stackSize(a.id);

// --- chest -------------------------------------------------------------------

export class Chest {
  constructor(size = CHEST_SLOTS) {
    this.kind = KIND.CHEST;
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.viewers = 0;      // >0 keeps the lid open; blockanim.js reads it
  }

  get(i) { return this.slots[i] ?? null; }

  setSlot(i, stack) {
    if (i < 0 || i >= this.size) return;
    this.slots[i] = stack && stack.count > 0 ? stack : null;
  }

  isEmpty() { return this.slots.every((s) => !s); }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.count;
    return n;
  }

  // Push a whole stack in, preserving durability. Returns whatever did NOT
  // fit (or null), so a caller never loses items by shift-clicking into a
  // full chest.
  addStack(stack) {
    if (!stack || stack.count <= 0) return null;
    const rest = { ...stack };
    const max = stackSize(rest.id);
    if (max > 1 && rest.dur === undefined) {
      for (let i = 0; i < this.size && rest.count > 0; i++) {
        const s = this.slots[i];
        if (!mergeable(s, rest)) continue;
        const room = Math.min(max - s.count, rest.count);
        s.count += room;
        rest.count -= room;
      }
    }
    for (let i = 0; i < this.size && rest.count > 0; i++) {
      if (this.slots[i]) continue;
      const take = Math.min(max, rest.count);
      this.slots[i] = { ...rest, count: take };
      rest.count -= take;
    }
    return rest.count > 0 ? rest : null;
  }

  // convenience for tests and for anything holding an id, not a stack
  add(id, count = 1) {
    const left = this.addStack({ id, count });
    return left ? left.count : 0;
  }

  remove(id, count = 1) {
    let left = count;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return count - left;
  }

  // everything inside, as stacks, for the break-it-and-it-spills path
  contents() { return this.slots.filter(Boolean).map(copyStack); }

  toJSON() { return { size: this.size, slots: this.slots.map(copyStack) }; }

  load(d) {
    if (!d) return this;
    this.size = d.size ?? this.size;
    this.slots = new Array(this.size).fill(null);
    (d.slots ?? []).forEach((s, i) => {
      if (s && i < this.size && s.count > 0) this.slots[i] = { ...s };
    });
    return this;
  }
}

// --- the bin -------------------------------------------------------------------
//
// A chest for what you do not want. Same shelves, same screen, one clock:
// `lit` is the sun angle when the first thing went in, and a full turn of
// the sun after that — one day — main.js sets fire to it (see updateBins),
// the fire is watched burning out of the top for a few seconds, and the
// shelves are empty. An empty bin has no clock; the next thing dropped in
// starts it again. The clock is kept, so a bin filled the night before a
// save still burns on the morning it was going to.
export class Bin extends Chest {
  constructor() {
    super();
    this.kind = KIND.BIN;
    this.lit = null;        // sun angle at the first item, or null when empty
    this.burning = 0;       // seconds of fire left, 0 when not alight
  }

  toJSON() { return { ...super.toJSON(), lit: this.lit }; }

  load(d) {
    super.load(d);
    this.lit = typeof d?.lit === 'number' ? d.lit : null;
    return this;
  }
}

// --- furnace -----------------------------------------------------------------
//
// Three slots and two clocks. `burn` counts fuel down in seconds; `cook`
// counts the current item up. They are deliberately independent, which is what
// makes running out of fuel a *pause* rather than a loss: the half-smelted
// ingot keeps its progress and resumes the moment more coal goes in. Progress
// is only thrown away when the input itself changes, because it is then
// progress towards something that is no longer there.

export class Furnace {
  constructor() {
    this.kind = KIND.FURNACE;
    this.in = null;
    this.fuel = null;
    this.out = null;
    this.burn = 0;        // seconds of fuel left
    this.burnMax = 0;     // what the current unit started at, for the gauge
    this.cook = 0;        // seconds into the current item
    this.cookTime = 0;    // what the current item needs, for the progress bar
  }

  get lit() { return this.burn > 0; }
  get flame() { return this.burnMax > 0 ? clamp01(this.burn / this.burnMax) : 0; }
  get progress() {
    return this.cookTime > 0 ? clamp01(this.cook / this.cookTime) : 0;
  }

  // room in the output for one more run of `res`
  fits(res) {
    if (!res) return false;
    if (!this.out) return true;
    return this.out.id === res.out
      && this.out.count + res.count <= stackSize(res.out);
  }

  recipe() { return this.in ? smeltResult(this.in.id) : null; }

  // Is there anything left to do? A furnace that answers false is dropped from
  // the registry's active set, which is the whole reason ticking is O(working
  // furnaces) rather than O(furnaces).
  get busy() {
    const res = this.recipe();
    const work = this.fits(res);
    if (this.burn > 0) return true;                    // still burning down
    return work && !!this.fuel && isFuel(this.fuel.id); // could light up
  }

  // Advance by dt seconds. Returns true if anything visible changed, so the
  // caller can repaint a panel or a glow without diffing the object.
  //
  // The loop is not decoration: dt is a whole restored browser tab often
  // enough that a straight `cook += dt` would smelt more items than the fuel
  // in the slot could ever have paid for. Time is therefore spent in chunks no
  // longer than the fire actually lasts, relighting between chunks.
  tick(dt) {
    if (!(dt > 0)) return false;
    let changed = false;
    let left = dt;
    let guard = 0;

    while (left > 1e-9 && guard++ < 64) {
      const res = this.recipe();
      if (!res) this.cook = 0;      // nothing smeltable: forget the progress
      const work = this.fits(res);

      // Light only when there is work: otherwise an idle furnace with a stack
      // of coal in it would quietly burn the lot for nothing.
      if (work && this.burn <= 0 && this.fuel && isFuel(this.fuel.id)) {
        const secs = fuelValue(this.fuel.id) * BURN_SECONDS_PER_UNIT;
        this.burn = secs;
        this.burnMax = secs;
        this.fuel.count -= 1;
        if (this.fuel.count <= 0) this.fuel = null;
        changed = true;
      }
      if (this.burn <= 0) break;    // no fire: the timers simply stand still

      const step = Math.min(left, this.burn);
      this.burn -= step;
      left -= step;
      changed = true;
      if (!work) continue;          // burning off with nothing left to smelt

      this.cookTime = res.time;
      this.cook += step;
      while (this.cook >= res.time && this.fits(res) && this.in) {
        this.cook -= res.time;
        this.out = this.out
          ? { ...this.out, count: this.out.count + res.count }
          : { id: res.out, count: res.count };
        this.in.count -= 1;
        if (this.in.count <= 0) { this.in = null; this.cook = 0; break; }
      }
    }
    return changed;
  }

  contents() {
    return [this.in, this.fuel, this.out].filter(Boolean).map(copyStack);
  }

  toJSON() {
    return {
      in: copyStack(this.in), fuel: copyStack(this.fuel), out: copyStack(this.out),
      burn: this.burn, burnMax: this.burnMax,
      cook: this.cook, cookTime: this.cookTime,
    };
  }

  load(d) {
    if (!d) return this;
    this.in = copyStack(d.in);
    this.fuel = copyStack(d.fuel);
    this.out = copyStack(d.out);
    this.burn = d.burn ?? 0;
    this.burnMax = d.burnMax ?? this.burn;
    this.cook = d.cook ?? 0;
    this.cookTime = d.cookTime ?? 0;
    return this;
  }
}

// --- door --------------------------------------------------------------------
//
// There is no DOOR block in cubesphere.js (ids run to 66 and none of them is a
// door), and adding one would mean editing the world module and the mesher.
// So a door here is an ordinary PLANK or GLASS cell that has been *declared* a
// door: the entity remembers the material and the open state, the block itself
// is removed while the door stands open, and blockanim.js draws the swinging
// leaf in the gap. Nothing new has to exist in the world for it to work, and a
// door that is closed is byte-for-byte an ordinary plank again.

export class Door {
  constructor(block = BLOCK.PLANK, facing = 0) {
    this.kind = KIND.DOOR;
    this.block = block;    // the material to put back when it closes
    this.facing = facing;  // 0..3 = +u, -u, +v, -v: which way the leaf swings
    this.open = false;
  }

  contents() { return []; }   // the block itself drops via items.dropsFor
  toJSON() { return { block: this.block, facing: this.facing, open: this.open }; }

  load(d) {
    if (!d) return this;
    this.block = d.block ?? this.block;
    this.facing = d.facing ?? 0;
    this.open = !!d.open;
    return this;
  }
}

// Flip a door. Returns the block main.js must write into the cell — AIR while
// it stands open, the material again when it shuts — so the caller never has
// to know which material the door was made of.
export function toggleDoor(door) {
  door.open = !door.open;
  return { open: door.open, block: door.open ? BLOCK.AIR : door.block };
}

// --- the registry ------------------------------------------------------------

const NONE = Object.freeze([]);

export class BlockEntities {
  constructor() {
    this.map = new Map();      // "f,u,v,h" -> entity
    this.active = new Set();   // entities that want a tick, currently furnaces
  }

  get size() { return this.map.size; }
  get activeCount() { return this.active.size; }

  get(f, u, v, h) { return this.map.get(cellKey(f, u, v, h)) ?? null; }
  getByKey(key) { return this.map.get(key) ?? null; }
  has(f, u, v, h) { return this.map.has(cellKey(f, u, v, h)); }

  // Make one if it is not there yet; hand back the existing one if it is, so
  // "open the thing I am looking at" is a single call with no null dance.
  ensure(kind, f, u, v, h, ...args) {
    const key = cellKey(f, u, v, h);
    const found = this.map.get(key);
    if (found && found.kind === kind) return found;
    if (found) this.remove(f, u, v, h);      // a chest where a furnace was
    const ent = kind === KIND.CHEST ? new Chest()
      : kind === KIND.BIN ? new Bin()
        : kind === KIND.FURNACE ? new Furnace()
          : kind === KIND.DOOR ? new Door(...args)
            : null;
    if (!ent) return null;
    ent.f = f; ent.u = u; ent.v = v; ent.h = h; ent.key = key;
    this.map.set(key, ent);
    this.wake(ent);
    return ent;
  }

  // create() is ensure() with a clean slate, for a freshly placed block
  create(kind, f, u, v, h, ...args) {
    this.remove(f, u, v, h);
    return this.ensure(kind, f, u, v, h, ...args);
  }

  // Put a furnace back on the tick list. Every write to a furnace slot must
  // go through here (or through setFurnaceSlot) or a furnace that was idle
  // when you filled it would never start.
  wake(ent) {
    if (ent && ent.kind === KIND.FURNACE) this.active.add(ent);
    return ent;
  }

  // the one write path the UI uses, so waking can never be forgotten
  setFurnaceSlot(ent, which, stack) {
    if (!ent || ent.kind !== KIND.FURNACE) return;
    ent[which] = stack && stack.count > 0 ? stack : null;
    this.wake(ent);
  }

  // Break the block: hand back whatever spilled and free the entry. Both
  // halves matter — forgetting the delete is how a registry leaks a slot per
  // chest for the rest of the session.
  remove(f, u, v, h) {
    const key = cellKey(f, u, v, h);
    const ent = this.map.get(key);
    if (!ent) return null;
    this.map.delete(key);
    this.active.delete(ent);
    return { kind: ent.kind, entity: ent, drops: ent.contents?.() ?? [] };
  }

  // Cost is O(active), never O(map) and never O(world). Returns the entities
  // that changed, so a panel or a glow repaints only when it has to.
  tick(dt) {
    if (!(dt > 0) || this.active.size === 0) return NONE;
    let changed = null;
    for (const ent of this.active) {
      if (ent.kind !== KIND.FURNACE) { this.active.delete(ent); continue; }
      if (ent.tick(dt)) (changed ??= []).push(ent);
      // deleting from a Set mid-iteration is safe and is the whole trick:
      // a furnace that has nothing left to do stops costing anything
      if (!ent.busy) this.active.delete(ent);
    }
    return changed ?? NONE;
  }

  // Drop entries whose cell no longer holds the right block — an explosion or
  // another agent's world edit can take a chest out without going through
  // remove(). O(entities), so it is cheap enough to run after a world load.
  prune(getBlock) {
    const dead = [];
    for (const [key, ent] of this.map) {
      const b = getBlock(ent.f, ent.u, ent.v, ent.h);
      const ok = ent.kind === KIND.DOOR
        ? (ent.open ? b === BLOCK.AIR : b === ent.block)
        : kindForBlock(b) === ent.kind;
      if (!ok) dead.push(key);
    }
    for (const key of dead) {
      const ent = this.map.get(key);
      this.map.delete(key);
      this.active.delete(ent);
    }
    return dead.length;
  }

  entries() { return [...this.map.values()]; }

  clear() { this.map.clear(); this.active.clear(); }

  // --- persistence ---------------------------------------------------------
  // Same spirit as save.js: a flat row per entry, [f,u,v,h,kind,payload], so
  // the whole thing is a couple of hundred bytes for a normal base.
  toJSON() {
    const rows = [];
    for (const ent of this.map.values()) {
      rows.push([ent.f, ent.u, ent.v, ent.h, ent.kind, ent.toJSON()]);
    }
    return { v: 1, rows };
  }

  load(data) {
    this.clear();
    const rows = Array.isArray(data) ? data : (data?.rows ?? []);
    for (const row of rows) {
      const [f, u, v, h, kind, payload] = row;
      const ent = this.ensure(kind, f, u, v, h);
      if (!ent) continue;                 // a kind from a newer save: skip it
      ent.load(payload);
      this.wake(ent);                     // tick() prunes the idle ones at once
    }
    return this.map.size;
  }
}

// --- per-planet stash --------------------------------------------------------
//
// travel.js already stashes the block *edits* of every planet you leave, since
// only one world is resident at a time. Block entities need exactly the same
// treatment or your smelter would be empty when you came home. Mirror of
// travel.js's `_stash`, deliberately kept here so that module does not have to
// learn about chests.

const _stash = new Map();   // planetId -> serialised BlockEntities

export function stashBlockEntities(planetId, entities) {
  if (!planetId) return 0;
  const json = entities?.toJSON?.() ?? null;
  if (json && json.rows.length) _stash.set(planetId, json);
  else _stash.delete(planetId);          // an untouched planet costs nothing
  return json?.rows.length ?? 0;
}

export function blockEntitiesFor(planetId) {
  return _stash.get(planetId) ?? null;
}

export function clearBlockEntityStash(planetId) {
  if (planetId === undefined) _stash.clear();
  else _stash.delete(planetId);
}

export function blockEntityStashState() {
  const out = {};
  for (const [id, json] of _stash) out[id] = json;
  return out;
}

export function loadBlockEntityStashState(obj) {
  _stash.clear();
  for (const id of Object.keys(obj ?? {})) {
    const json = obj[id];
    if (json?.rows) _stash.set(id, json);
  }
  return _stash.size;
}

export default BlockEntities;
