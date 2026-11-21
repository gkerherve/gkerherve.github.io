// inventory.js — the player's slots: a hotbar plus a backpack.
//
// One flat array holds both, hotbar first, so "move this to the hotbar" is
// just an index swap and the crafting UI can treat every slot the same. A
// stack is { id, count } and, for tools, a `dur` counter; tools have stack
// size 1 so two half-worn picks can never merge and lose damage.
//
// `Hunger` lives here too, at the bottom: it is the other half of "what the
// player is carrying and how long they can keep going", and eating is a slot
// operation before it is anything else.
//
// Pure logic (no DOM, no three) so it unit-tests under node.

import {
  stackSize, getItem, toolOf, isFood, armourOf, armourSlot, ARMOUR_SLOTS,
} from './items.js';

export const HOTBAR = 9;
export const BACKPACK = 27;

// --- armour ------------------------------------------------------------------
//
// Defence points -> how much of a hit gets through. items.js decides what each
// piece is worth; this decides what the total buys, and it is the only place
// in the game that does.
//
// A full set is 20 points at the top (diamond) and 7 at the bottom (leather),
// so dividing by ARMOUR_SCALE = 30 gives 67% off in diamond, 50% in iron and
// 23% in leather. Minecraft divides by 25, which is 80% off in diamond, and 80%
// is the number that makes a player in a full set stop reading the health bar
// at all — a zombie's four-point bite becomes 0.8 and three of them cost you
// less than one unarmoured hit. Thirty leaves diamond feeling like diamond and
// still leaves a pack of them dangerous, which is the whole bargain: armour
// buys you TIME to get out, never immunity. Nothing here can ever return zero.
const ARMOUR_SCALE = 30;
const ARMOUR_CAP = 20;      // points above this buy nothing, whatever is added
// Wear per hit, on each worn piece: one point, and more for a big hit. The
// divisor means an ordinary bite costs one point of every piece and a rocket
// costs several, so what wears a harness out is being hit HARD, not often.
const WEAR_PER = 4;

export class Inventory {
  constructor(hotbar = HOTBAR, backpack = BACKPACK) {
    this.hotbarSize = hotbar;
    this.size = hotbar + backpack;
    this.slots = new Array(this.size).fill(null);
    // The four worn pieces, in ARMOUR_SLOTS order. They are NOT part of
    // `slots`: everything that walks the bag — count(), add(), the crafting
    // cost check, the creative palette — would otherwise spend the breastplate
    // off your chest to pay for a recipe.
    this.armour = new Array(ARMOUR_SLOTS.length).fill(null);
    // THE OTHER HAND. One stack, and out of `slots` for exactly the reason
    // the armour is: everything that walks the bag — count(), add(), the
    // crafting cost check, the creative palette — would otherwise spend the
    // shield off your arm to pay for a recipe.
    //
    // It is a hand you carry something in and do not usually DO anything
    // with. A shield lives here, and so does the lamp you want burning while
    // both your tools stay in the right hand, which is the whole point of it
    // down a mine.
    this.offhand = null;
    this.selected = 0;
    this._listeners = new Set();
  }

  // Grow or shrink the backpack. Creative needs room for every item in the
  // game, which is far more than a survival bag holds; the hotbar never
  // changes size, so nothing that indexes it has to know about this.
  // Anything that would fall off the end is dropped rather than silently
  // reappearing later in a slot that no longer exists.
  resize(backpack) {
    const size = this.hotbarSize + Math.max(0, backpack | 0);
    if (size === this.size) return this;
    const old = this.slots;
    this.slots = new Array(size).fill(null);
    for (let i = 0; i < Math.min(old.length, size); i++) this.slots[i] = old[i];
    this.size = size;
    if (this.selected >= this.hotbarSize) this.selected = 0;
    this.changed();
    return this;
  }

  // --- change notification ------------------------------------------------
  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  off(fn) { this._listeners.delete(fn); }
  changed() { for (const fn of this._listeners) fn(this); }

  // --- reads ---------------------------------------------------------------
  get(i) { return this.slots[i] ?? null; }
  isHotbar(i) { return i >= 0 && i < this.hotbarSize; }
  selectedStack() { return this.slots[this.selected] ?? null; }
  selectedId() { return this.selectedStack()?.id ?? null; }
  offhandId() { return this.offhand?.id ?? null; }

  // Move what is in the fist to the other hand and back. A straight exchange
  // rather than a copy, so nothing is created or lost and an empty hand is a
  // legal thing to swap in either direction.
  swapOffhand() {
    const held = this.slots[this.selected] ?? null;
    this.slots[this.selected] = this.offhand;
    this.offhand = held;
    this.changed();
    return this.offhand;
  }

  select(i) {
    if (i < 0 || i >= this.hotbarSize || i === this.selected) return;
    this.selected = i;
    this.changed();
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.count;
    return n;
  }

  has(id, n = 1) { return this.count(id) >= n; }

  // ordered { id, count } summary, for a UI or a save file
  contents() {
    const tally = new Map();
    for (const s of this.slots) {
      if (s) tally.set(s.id, (tally.get(s.id) ?? 0) + s.count);
    }
    return [...tally].map(([id, count]) => ({ id, count }));
  }

  // --- writes --------------------------------------------------------------

  // Make the stack a slot should hold: tools get their own durability, so a
  // fresh pick is always full even if the previous one was nearly gone.
  static newStack(id, count = 1) {
    const tool = toolOf(id);
    return tool ? { id, count: 1, dur: tool.durability } : { id, count };
  }

  // Adds up to `count`; returns what did NOT fit, so callers can drop the
  // remainder in the world rather than silently deleting it.
  add(id, count = 1, quiet = false) {
    if (!getItem(id) || count <= 0) return count;
    const max = stackSize(id);
    let left = count;

    if (max > 1) {                       // top up partial stacks first
      for (let i = 0; i < this.size && left > 0; i++) {
        const s = this.slots[i];
        if (s?.id !== id || s.count >= max) continue;
        const room = Math.min(max - s.count, left);
        s.count += room;
        left -= room;
      }
    }
    // then fill empty slots, hotbar first so new loot is reachable
    for (let i = 0; i < this.size && left > 0; i++) {
      if (this.slots[i]) continue;
      const take = Math.min(max, left);
      this.slots[i] = Inventory.newStack(id, take);
      left -= take;
    }
    if (left !== count && !quiet) this.changed();
    return left;
  }

  // Adds a whole drop list, e.g. items.dropsFor(). Returns leftovers.
  addAll(drops) {
    const left = [];
    for (const d of drops) {
      const rest = this.add(d.id, d.count ?? 1, true);
      if (rest > 0) left.push({ id: d.id, count: rest });
    }
    if (drops.length) this.changed();
    return left;
  }

  // Removes up to `count`, back to front so the hotbar keeps its stack
  // longest. Returns how many were actually removed.
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
    const removed = count - left;
    if (removed) this.changed();
    return removed;
  }

  // --- slot-level moves (what the crafting UI drives) ----------------------

  setSlot(i, stack) {
    this.slots[i] = stack && stack.count > 0 ? stack : null;
    this.changed();
  }

  // Pull `n` out of a slot (n = Infinity for the whole stack).
  take(i, n = Infinity) {
    const s = this.slots[i];
    if (!s) return null;
    const take = Math.min(s.count, n);
    const out = { ...s, count: take };
    s.count -= take;
    if (s.count <= 0) this.slots[i] = null;
    this.changed();
    return out;
  }

  // Put a stack into a slot: merge if compatible, otherwise swap. Returns
  // whatever is now "in hand" (the displaced stack, or the unmerged rest).
  put(i, stack) {
    if (!stack) return null;
    const s = this.slots[i];
    const max = stackSize(stack.id);
    if (s && s.id === stack.id && max > 1 && s.dur === undefined
      && s.keep === undefined && stack.keep === undefined) {
      const room = Math.min(max - s.count, stack.count);
      s.count += room;
      const left = stack.count - room;
      this.changed();
      return left > 0 ? { ...stack, count: left } : null;
    }
    this.slots[i] = stack;
    this.changed();
    return s ?? null;
  }

  // --- tool wear -----------------------------------------------------------

  // Spend one use of the selected tool. Tools with no durability left break,
  // which is the whole reason durability exists: it forces a re-craft.
  damageSelected(amount = 1) {
    const i = this.selected;
    const s = this.slots[i];
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    if (s.dur <= 0) {
      this.slots[i] = null;
      this.changed();
      return true;      // broke
    }
    this.changed();
    return false;
  }

  // Wear the OFF HAND by one hit. Same shape as damageSelected and for the
  // same reason: a shield takes the blow it stopped, and a shield that broke
  // has to leave the hand it was in — see the shield in items.js.
  damageOffhand(amount = 1) {
    const s = this.offhand;
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    if (s.dur <= 0) {
      this.offhand = null;
      this.changed();
      return true;      // broke
    }
    this.changed();
    return false;
  }

  // --- armour ---------------------------------------------------------------
  //
  // Four worn slots, and three things the rest of the game asks of them:
  // what they are worth (protection), what a hit is reduced to (reduce), and
  // what wearing that hit costs them (damageArmour). absorbHit does the last
  // two together, because doing one without the other is always a bug.

  getArmour(i) { return this.armour[i] ?? null; }

  // Put a stack in an armour slot. Refuses anything that is not the right
  // piece and returns false, so a caller cannot wedge a pickaxe onto your
  // head; passing null takes the piece off. Returns true if the slot changed.
  setArmour(i, stack) {
    if (i < 0 || i >= this.armour.length) return false;
    if (stack && armourOf(stack.id)?.slot !== ARMOUR_SLOTS[i]) return false;
    this.armour[i] = stack && (stack.count ?? 1) > 0 ? stack : null;
    this.changed();
    return true;
  }

  // Wear a piece straight from wherever it is. Returns whatever came OFF —
  // the displaced piece, or the stack itself if it is not armour at all — so
  // no caller can lose an item by equipping over a full slot.
  equip(stack) {
    const i = stack ? armourSlot(stack.id) : -1;
    if (i < 0) return stack ?? null;
    const off = this.armour[i];
    this.armour[i] = { ...stack, count: 1 };
    this.changed();
    return off ?? null;
  }

  // Total defence points of what is worn. This is the number the HUD shows
  // and the number reduce() spends; 0 means nothing is on.
  protection() {
    let n = 0;
    for (const s of this.armour) n += (s ? armourOf(s.id)?.defence : 0) ?? 0;
    return n;
  }

  // What `n` damage becomes after armour. Pure: no wear, no side effects, so
  // a HUD or a test can ask "what would this hit cost me" for free.
  reduce(n) {
    if (!(n > 0)) return 0;
    return n * (1 - Math.min(this.protection(), ARMOUR_CAP) / ARMOUR_SCALE);
  }

  // Spend one hit's worth of life on every worn piece. `n` is the RAW damage,
  // before reduction — a harness is worn out by what hit it, not by what got
  // through it. Pieces at zero break and are gone, exactly as a tool is, and
  // their ids come back so the caller can say so out loud.
  damageArmour(n) {
    if (!(n > 0)) return [];
    const cost = Math.max(1, (n / WEAR_PER) | 0);
    const broke = [];
    let any = false;
    this.armour.forEach((s, i) => {
      if (!s || s.dur === undefined) return;
      s.dur -= cost;
      any = true;
      if (s.dur <= 0) { this.armour[i] = null; broke.push(s.id); }
    });
    if (any) this.changed();
    return broke;
  }

  // The one call the damage path wants: what gets through, with the harness
  // worn for having stopped the rest. See Hunger.shield below.
  absorbHit(n) {
    if (!(n > 0)) return 0;
    const left = this.reduce(n);
    this.damageArmour(n);
    return left;
  }

  // --- crafting glue -------------------------------------------------------

  // Can this recipe cost (from crafting.recipeCost) be paid from the slots?
  canAfford(cost) {
    return cost.every((c) => this.count(c.id) >= c.count);
  }

  // Take the ingredients and give back the result. Returns false (and changes
  // nothing) if the cost cannot be paid.
  craft(cost, out, count = 1) {
    if (!this.canAfford(cost)) return false;
    for (const c of cost) this.remove(c.id, c.count);
    const left = this.add(out, count);
    this.changed();
    return left === 0;
  }

  // --- persistence ---------------------------------------------------------
  // A COPY, not the live arrays. This handed back `this.slots` itself, which
  // is fine for a save — serialize stringifies it in the same breath — and
  // quietly wrong for anything that keeps the snapshot and then touches the
  // bag: F4 stashed your survival kit, cleared the slots, and found the
  // stash empty when it went to put it back, because the stash WAS the
  // slots. Every stack is copied too, or a stack later spent in place would
  // come back short.
  toJSON() {
    const copy = (a) => a.map((s) => (s ? { ...s } : null));
    return {
      selected: this.selected,
      slots: copy(this.slots),
      armour: copy(this.armour),
    };
  }

  load(data) {
    if (!data) return;
    this.slots = new Array(this.size).fill(null);
    (data.slots ?? []).forEach((s, i) => {
      if (s && i < this.size && getItem(s.id)) this.slots[i] = { ...s };
    });
    // Worn armour comes back the same way the slots do, and through the same
    // check the equip path uses: a save written before armour existed simply
    // has no `armour` key and leaves you bare, and a piece that has since been
    // renamed out of the registry is dropped rather than worn as `undefined`.
    this.armour = new Array(ARMOUR_SLOTS.length).fill(null);
    (data.armour ?? []).forEach((s, i) => {
      if (!s || i >= this.armour.length || !getItem(s.id)) return;
      if (armourOf(s.id)?.slot !== ARMOUR_SLOTS[i]) return;
      this.armour[i] = { ...s };
    });
    this.selected = Math.min(data.selected ?? 0, this.hotbarSize - 1);
    this.changed();
  }

  // --- eating ---------------------------------------------------------------

  // Eat one of the selected stack into `hunger`. Returns true if something was
  // actually eaten, so main.js can forward a key press without first having to
  // ask whether the held item is food or whether the player is already full.
  // `returns` is the empty vessel a food leaves behind — a bucket of milk is
  // three iron ingots with milk in it, and swallowing the pail with the milk
  // is not a cost anybody would call fair. It goes back in the bag by id, so
  // any future bowl or bottle works without another line here.
  eatSelected(hunger) {
    const id = this.selectedId();
    if (!id || !hunger?.eat) return false;
    if (!hunger.eat(id)) return false;
    this.remove(id, 1);
    const back = getItem(id)?.returns;
    if (back) this.add(back, 1);
    return true;
  }

  // Starter kit, so a new world is not an empty-handed grind. The hoe and the
  // seeds are here because a field takes real time to ripen: start the clock
  // on minute one rather than after the first tool chain.
  giveStarter() {
    this.add('wood_pickaxe', 1, true);
    this.add('wood_axe', 1, true);
    this.add('wood_shovel', 1, true);
    this.add('wood_hoe', 1, true);
    this.add('plank', 16, true);
    this.add('torch', 8, true);
    this.add('seeds', 4, true);
    this.add('bread', 2, true);
    this.changed();
  }
}

// --- hunger ------------------------------------------------------------------
//
// Hunger is not a timer, it is a cost of *doing things*. Exhaustion builds up
// from walking, jumping and mining; every PER_POINT of it spends one point of
// saturation, or — once saturation is gone — one point of food. That is why a
// well-fed player can cross a continent while a starving one cannot cross a
// field, and why nothing drains away while you stand still reading the map. A
// small idle trickle still exists so that a camp is not a permanent one.
//
// Saturation is the hidden buffer above the visible bar. It can never exceed
// the food level, which is what stops one steak from carrying you for an hour
// and is the reason cooked meat (high saturation) beats bread even though they
// refill the bar by similar amounts.
//
// Pure numbers, no DOM: main.js draws the bars and applies the damage.

// exhaustion per unit of activity — walk/sprint/swim are *per block moved*
export const EXHAUSTION = {
  walk: 0.01, sprint: 0.1, swim: 0.015, jump: 0.2,
  mine: 0.005, attack: 0.1, hurt: 0.1, idle: 0.006,
};

const PER_POINT = 4;      // exhaustion that costs one saturation or food
const REGEN_AT = 18;      // food level at or above which health comes back
const REGEN_EVERY = 4;    // seconds per point healed
const STARVE_EVERY = 4;   // seconds per point of starvation damage

export class Hunger {
  constructor({ max = 20, maxHealth = 20 } = {}) {
    this.max = max;
    this.maxHealth = maxHealth;
    this.food = max;
    this.saturation = 5;
    this.exhaustion = 0;
    this.health = maxHealth;
    this._regen = 0;
    this._starve = 0;
    this.absorb = 0;        // temporary hearts, spent before real ones
    this.regenLeft = 0;     // hearts a food still owes you
    this.regenEvery = 1;
    this._boost = 0;
    // What the player is WEARING: an Inventory, or null for bare skin. Set by
    // main.js once; see shield() for why the armour lives on this side of the
    // wall rather than in combat.js.
    this.armour = null;
  }

  get starving() { return this.food <= 0; }
  get dead() { return this.health <= 0; }
  get full() { return this.food >= this.max; }

  addExhaustion(x) { if (x > 0) this.exhaustion += x; }

  // wrappers so the call sites in main.js read as prose
  walked(blocks, sprinting = false) {
    this.addExhaustion(blocks
      * (sprinting ? EXHAUSTION.sprint : EXHAUSTION.walk));
  }
  swam(blocks) { this.addExhaustion(blocks * EXHAUSTION.swim); }
  jumped() { this.addExhaustion(EXHAUSTION.jump); }
  mined() { this.addExhaustion(EXHAUSTION.mine); }
  attacked() { this.addExhaustion(EXHAUSTION.attack); }

  // `always` lets a future golden-apple be eaten on a full stomach
  canEat(id) { return isFood(id) && (!this.full || !!getItem(id)?.always); }

  // Eat one item. Returns false if it is not food or there is no room, which
  // is what tells the caller not to consume the stack.
  //
  // Beyond filling the belly, a food may carry three things — `heal` for
  // hearts back on the spot, `regen` for hearts back over time, and `absorb`
  // for a pool of temporary ones that soak damage before real health does.
  // The golden apple is what they exist for; ordinary bread carries none of
  // them and behaves exactly as it always did.
  eat(id) {
    if (!this.canEat(id)) return false;
    const it = getItem(id);
    this.food = Math.min(this.max, this.food + (it.food ?? 0));
    this.saturation = Math.min(this.food,
      this.saturation + (it.sat ?? (it.food ?? 0) * 0.6));
    if (it.heal) this.health = Math.min(this.maxHealth, this.health + it.heal);
    if (it.absorb) this.absorb = Math.max(this.absorb ?? 0, it.absorb);
    if (it.regen) {
      this.regenLeft = (it.regen.points ?? 0);
      this.regenEvery = (it.regen.seconds ?? 8) / Math.max(1, it.regen.points ?? 1);
      this._boost = 0;
    }
    return true;
  }

  // Advance by dt seconds. Returns { damage, healed } — main.js applies the
  // damage to the player and can flash the bar on either.
  tick(dt) {
    if (!(dt > 0)) return { damage: 0, healed: 0 };
    this.addExhaustion(EXHAUSTION.idle * dt);

    while (this.exhaustion >= PER_POINT) {
      this.exhaustion -= PER_POINT;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }

    let healed = 0;
    if (this.food >= REGEN_AT && this.saturation > 0
      && this.health < this.maxHealth) {
      this._regen += dt;
      while (this._regen >= REGEN_EVERY && this.health < this.maxHealth) {
        this._regen -= REGEN_EVERY;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.saturation = Math.max(0, this.saturation - 1);
        healed += 1;
      }
    } else {
      this._regen = 0;
    }

    // A golden apple's regeneration outranks the ordinary well-fed heal:
    // it runs on its own clock and does not spend saturation, which is the
    // whole point of eating one in a fight rather than a loaf.
    if (this.regenLeft > 0) {
      this._boost = (this._boost ?? 0) + dt;
      while (this._boost >= this.regenEvery && this.regenLeft > 0) {
        this._boost -= this.regenEvery;
        this.regenLeft -= 1;
        if (this.health < this.maxHealth) {
          this.health = Math.min(this.maxHealth, this.health + 1);
          healed += 1;
        }
      }
    }

    let damage = 0;
    if (this.starving) {
      this._starve += dt;
      while (this._starve >= STARVE_EVERY) {
        this._starve -= STARVE_EVERY;
        damage += 1;
      }
      this.health = Math.max(0, this.health - damage);
    } else {
      this._starve = 0;
    }

    return { damage, healed };
  }

  // Everything a hit has to get through before it reaches a health bar, in
  // order: the armour, then the absorption pool. Returns what is left.
  //
  // The order is not a preference. Absorption is a pool of hearts and armour
  // is a percentage off, so soaking first and reducing second would shrink the
  // pool by the full hit and then discount what was already spent — a golden
  // apple would be worth four hearts in the nude and four hearts in diamond,
  // which is to say the armour would buy nothing for as long as the pool
  // lasted. Reduce first and the four temporary hearts stop twelve points of
  // damage while you are wearing iron, which is what both things are for.
  //
  // This is the single door: combat.js's PlayerHealth keeps the real hearts
  // and does not know armour exists, so it hands the raw number here and
  // applies whatever comes back. Wearing the harness out is part of stopping
  // the hit and happens here too — see Inventory.absorbHit.
  shield(n) {
    if (!(n > 0)) return 0;
    let left = this.armour?.absorbHit ? this.armour.absorbHit(n) : n;
    if (this.absorb > 0) {
      const taken = Math.min(this.absorb, left);
      this.absorb -= taken;
      left -= taken;
    }
    return left;
  }

  // Absorption soaks damage BEFORE real health, and does not come back on
  // its own — that is what makes a golden apple worth eating before a fight
  // rather than after one. Armour comes before both; see shield().
  hurt(n) {
    this.health = Math.max(0, this.health - this.shield(n));
    this.addExhaustion(EXHAUSTION.hurt);
    return this.health;
  }

  // respawn, without losing the max values a caller configured
  reset() {
    this.food = this.max;
    this.saturation = 5;
    this.exhaustion = 0;
    this.health = this.maxHealth;
    this._regen = 0;
    this._starve = 0;
  }

  toJSON() {
    return {
      food: this.food, saturation: this.saturation,
      exhaustion: this.exhaustion, health: this.health,
    };
  }

  load(d) {
    if (!d) return;
    this.food = d.food ?? this.food;
    this.saturation = d.saturation ?? this.saturation;
    this.exhaustion = d.exhaustion ?? 0;
    this.health = d.health ?? this.health;
  }
}
