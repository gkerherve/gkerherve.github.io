// craftui.js — the crafting screen: recipe book, a grid, your bags and you.
// Plus ContainerUI at the bottom: the chest and world-furnace screens, which
// share this file's CSS, its icon painting and its cursor-stack rules so that
// every container in the game feels like the same object.
//
// Self-contained on purpose: it builds its own DOM and injects its own <style>
// so index.html and main.js do not have to know it exists. Wire it up with
// `new CraftUI({ inventory, atlasImage: atlas.image })` and call toggle() on a
// key. See INTEGRATION-craft.md and INTEGRATION-blocks.md.
//
// Slot icons come from the texture atlas as a CSS background rather than a
// canvas per slot: one data URL is decoded once and every slot just offsets
// into it, which keeps ~60 slots cheap to re-render.

import * as THREE from 'three';
import { ATLAS } from './textures.js';
// Only the two builders, never their internals: the body is somebody else's
// to change, and this screen wants whatever it currently builds.
import { createAvatar, poseAvatar } from './player.js';
import {
  itemName, itemTile, stackSize, toolOf, allItemIds, isPlaceable, getItem,
  armourOf, armourSlot, ARMOUR_SLOTS, categoryOf,
  // ...and the family an item belongs to, which is what the palette's tree
  // is built out of. See familyOf: derived, never listed.
  familyOf, familyName,
} from './items.js';
import {
  match, consume, listRecipes, smeltResult, isFuel, SLOTS,
} from './crafting.js';
import { KIND, CHEST_SLOTS } from './blockentity.js';

const ICON = 34;   // default slot size; CSS shrinks it on short screens
// How soon after a press a second one on the same row counts as a double
// click. The DOM's own dblclick event is no use for this: it arrives after
// both presses have already acted, and by then the first has put a stack on
// the cursor and the second has thrown that stack away.
const DOUBLE_MS = 400;

// --- what you can make in your two hands -------------------------------------
//
// E is what you are CARRYING. A bench and a furnace are things you walk up to,
// so neither belongs in it — but taking crafting out of E altogether would end
// the game on the first morning, because `crafting_table` is itself a recipe
// (four planks, 2x2, see crafting.js) and there would be no way left to craft
// the thing you now need in order to craft. So E keeps a HAND grid: two by two,
// which is exactly big enough for planks, sticks and the table itself, and not
// big enough for anything a bench is for.
//
// It is the same nine-cell array underneath — `match` slides a pattern over the
// grid, so a 2x2 laid in the top-left corner matches on its own — with the five
// cells outside the hand simply not on screen. One grid, one matcher, one set
// of rules; the only difference is how much of it you can reach.
const HAND_CELLS = [0, 1, 3, 4];

// Does this recipe fit in the hand grid? Shaped recipes are trimmed to their
// own bounding box by crafting.js, so the answer is just how big that box is;
// a shapeless recipe only cares how many things go in.
function fitsHand(r) {
  const rec = r.recipe;
  if (!rec) return false;
  return rec.kind === 'shaped'
    ? rec.w <= 2 && rec.h <= 2
    : rec.need.length <= HAND_CELLS.length;
}

// --- categories --------------------------------------------------------------
//
// One flat list was fine at forty items. It is not fine at several hundred —
// eight tints of glass, five timbers, a rack of tools for every metal — and
// scrolling for the thing you want is not searching for it.
//
// An item's category is DERIVED from what the item is, never from a hand-kept
// membership list. This game gains items faster than any such list would be
// maintained, and the failure mode matters: a wrongly-filed item is annoying,
// an item that appears in NO category has effectively been deleted from the
// screen. Every id therefore falls out of `categoryOf` into exactly one
// bucket, with `materials` as the catch-all that cannot miss.
// `categoryOf` moved to items.js: the shop's stockroom sorts its bays by the
// same buckets, and a cellar that disagreed with these tabs about what a thing
// was would be two different shops.
// How many of a thing it takes before they get a shelf of their own. Two oaks
// and a birch is a list; nine doors is a drawer.
const FAMILY_MIN = 3;

const CATEGORIES = [
  { id: 'all', name: 'all' },
  { id: 'building', name: 'building' },
  // The ground, on its own shelf. `building` used to be every placeable block
  // in the game — the planks and bricks you make AND the grass, stone, logs
  // and leaves the world is made of — which is three hundred entries with the
  // wall you wanted somewhere under a hillside. See NATURE in items.js.
  { id: 'nature', name: 'nature' },
  { id: 'tools', name: 'tools' },
  { id: 'weapons', name: 'weapons' },
  { id: 'armour', name: 'armour' },
  { id: 'food', name: 'food' },
  // The track and the network. Named for what a player would go looking for
  // rather than for what the code calls it: nobody hunting for a second rail
  // thinks of it as "power".
  { id: 'power', name: 'rail & electric' },
  { id: 'materials', name: 'materials' },
];

// Layout contract. document.body is overflow:hidden behind a full-screen
// canvas, so anything taller than the viewport is not scrolled to — it is
// simply gone. Hence: the panel is capped, it owns overflow:hidden, and every
// child that can grow without bound has its OWN scrollbar. The grid and the
// result slot are in the never-shrink group, so the things you need in order to
// craft at all are always on screen; only the recipe book and
// the backpack scroll. On short windows the slot size drops instead of the
// panel spilling, which is why --cui-icon is a variable and the icons are
// painted with percentages rather than pixels.
const CSS = `
.cui-root {
  position: fixed; inset: 0; z-index: 40; display: none;
  align-items: center; justify-content: center;
  padding: 12px; --cui-icon: ${ICON}px;
  background: rgba(3,5,12,.66);
  font: 13px "Segoe UI", system-ui, sans-serif; color: #cfd8ea;
  user-select: none; cursor: default;
}
.cui-root, .cui-root * { box-sizing: border-box; }
.cui-root.cui-open { display: flex; }
.cui-panel {
  position: relative;
  display: grid; grid-template-columns: 232px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 16px; padding: 14px 16px;
  background: #0d1322; border: 1px solid rgba(255,255,255,.14);
  border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.6);
  max-height: min(90vh, 100%); max-width: 96vw; overflow: hidden;
}
.cui-h { margin: 0 0 8px; font-size: 12px; letter-spacing: .6px;
  text-transform: uppercase; opacity: .6; }
.cui-col { display: flex; flex-direction: column; min-height: 0;
  min-width: 0; }
/* default: never shrink. Only the two scrollers below opt out.
   flex-basis stays auto, not 0: a 0 basis makes the scroller contribute
   nothing to the column's intrinsic height, so the panel shrink-wraps to the
   bench and the backpack spills straight back out under the clip. */
.cui-col > * { flex: 0 0 auto; }
.cui-book, .cui-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto;
  overflow-x: hidden; }
.cui-book::-webkit-scrollbar, .cui-scroll::-webkit-scrollbar { width: 8px; }
.cui-book::-webkit-scrollbar-thumb, .cui-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,.2); border-radius: 4px;
}
.cui-x {
  position: absolute; top: 8px; right: 10px; z-index: 2;
  width: 22px; height: 22px; padding: 0; border-radius: 6px;
  border: 1px solid rgba(255,255,255,.18); background: #131b2e;
  color: #cfd8ea; font: 600 13px/20px sans-serif; cursor: pointer;
}
.cui-x:hover { background: #24314f; color: #fff; }
.cui-search {
  width: 100%; margin-bottom: 8px; padding: 6px 8px;
  background: #131b2e; border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px; color: #cfd8ea; font: inherit; outline: none;
}
.cui-search:focus { border-color: #7fb3ff; }
/* The category strip wraps rather than scrolls: it is a handful of short
   words and a row that scrolls sideways hides the very tabs it exists to
   offer. flex: none keeps it out of the panel's shrink group with the
   bench, so the book is what gives up height on a short window. */
.cui-cats {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; flex: none;
}
.cui-cat {
  padding: 3px 9px; border-radius: 999px; cursor: pointer;
  background: #131b2e; border: 1px solid rgba(255,255,255,.15);
  color: #9fb0cc; font: inherit; font-size: 12px; outline: none;
}
.cui-cat:hover { background: #18233c; color: #cfd8ea; }
.cui-cat.cui-cat-on {
  background: #2b3f68; border-color: #7fb3ff; color: #fff;
}
.cui-headrow { display: flex; align-items: center; gap: 8px; }
.cui-headrow .cui-h { flex: 1; }
.cui-empty {
  flex: none; background: #1b2540; color: #cfd8ea; cursor: pointer;
  border: 1px solid rgba(255,255,255,.2); border-radius: 6px;
  padding: 2px 9px; font: 11px "Segoe UI", sans-serif;
}
.cui-empty:hover { border-color: #ff9c9c; color: #fff; }
.cui-empty[hidden] { display: none; }
.cui-fam .cui-into { margin-left: auto; color: #7fb3ff; font-size: 15px;
  padding-right: 6px; }
.cui-fam b::after { content: ''; }
.cui-back b { color: #7fb3ff; }
.cui-book { padding-right: 4px; }
.cui-rec {
  display: flex; align-items: center; gap: 8px; padding: 4px 6px;
  border-radius: 6px; cursor: pointer; opacity: .42;
}
.cui-rec.cui-can { opacity: 1; }
.cui-rec:hover { background: #18233c; }
.cui-rec .cui-icon { width: 26px; height: 26px; flex: none; }
.cui-rec b { font-weight: 600; color: #fff; }
.cui-rec small { display: block; opacity: .6; font-size: 11px; }
/* ingredient tallies: green when you have enough, amber when you are short,
   so a glance down the book tells you what is blocking each recipe */
.cui-rec .cui-cost { opacity: .95; }
.cui-rec .cui-ok { color: #8fe08f; }
.cui-rec .cui-short { color: #e0b45a; }
.cui-rec .cui-plus { opacity: .45; }
.cui-rec .cui-need { color: #e0b45a; opacity: .95; margin-top: 1px; }
.cui-msg { font-size: 12px; color: #e0b45a; min-height: 15px; margin-top: 3px; }
.cui-bench { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.cui-grid3 { display: grid; grid-template-columns: repeat(3, auto); gap: 4px; }
/* the hand: the same nine cells with five of them not on screen, so the grid
   has to narrow to two columns or the four that are left sit in an L */
.cui-grid3.cui-grid2 { grid-template-columns: repeat(2, auto); }
.cui-arrow { font-size: 20px; opacity: .5; }
.cui-slot {
  position: relative; flex: none; border-radius: 4px;
  width: var(--cui-icon); height: var(--cui-icon);
  background: #131b2e; border: 2px solid rgba(255,255,255,.16);
  cursor: pointer;
}
.cui-slot:hover { border-color: #7fb3ff; }
.cui-slot.cui-out { border-color: rgba(255,255,255,.4); background: #18233c; }
.cui-icon {
  width: 100%; height: 100%; image-rendering: pixelated;
  background-repeat: no-repeat;
}
.cui-n {
  position: absolute; right: 1px; bottom: 0; font: 700 11px/1 sans-serif;
  color: #fff; text-shadow: 0 1px 2px #000, 0 0 2px #000; pointer-events: none;
}
.cui-dur {
  position: absolute; left: 2px; right: 2px; bottom: 2px; height: 3px;
  border-radius: 2px; background: rgba(0,0,0,.6); overflow: hidden;
}
.cui-dur i { display: block; height: 100%; background: #6ee06e; }
.cui-bags { display: grid; grid-template-columns: repeat(9, auto);
  gap: 4px; justify-content: start; }
/* --- the four worn slots --------------------------------------------------
   A strip beside the backpack, not inside it: what you are wearing is not
   part of the bag and must not scroll away with it. The strip is in the
   never-shrink group and the bags keep their own scrollbar, so on a short
   window it is the backpack that gives up height, never your armour. */
.cui-gear { display: flex; gap: 12px; align-items: stretch;
  flex: 1 1 auto; min-height: 0; }
.cui-armour { display: grid; grid-template-columns: auto auto;
  align-items: center; gap: 4px 6px; align-content: start; flex: none; }
.cui-armour .cui-h { grid-column: 1 / -1; margin: 0 0 2px; }
.cui-armlab { font-size: 11px; opacity: .55; }
/* --- you ------------------------------------------------------------------
   Four boxes in a column are an equipment list. The same four boxes standing
   next to the body they go on are a paper doll, and you can SEE what you are
   wearing. Its own tiny renderer on its own canvas, for the reason the
   dressing room has one: this panel is DOM and sits in FRONT of the game's
   canvas, so nothing drawn into that canvas can appear here.
   flex: none on both — the doll and the strip are the never-shrink group and
   it is still the backpack that gives up height on a short window. */
.cui-you { display: flex; gap: 10px; align-items: flex-start; flex: none; }
.cui-doll {
  display: block; flex: none; width: 104px; height: 178px;
  border-radius: 8px; border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(#16203a, #0a0f1c); cursor: grab;
}
.cui-doll:active { cursor: grabbing; }
.cui-def { grid-column: 1 / -1; margin-top: 4px; font-size: 11px;
  color: #8fe08f; }
/* an empty armour slot says what it is for, so four blank boxes are not a
   puzzle: the letter fades out the moment a piece covers it */
.cui-slot.cui-arm::before {
  content: attr(data-tag); position: absolute; inset: 0;
  font: 700 13px/1 sans-serif; color: rgba(255,255,255,.22);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.cui-slot.cui-arm.cui-worn::before { content: none; }
.cui-bags .cui-hot { border-color: rgba(255,255,255,.42); }
.cui-bags .cui-sel { border-color: #ffffff; }
.cui-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cui-note { font-size: 11px; opacity: .55; line-height: 1.6; }
/* The panel is shrink-to-fit, so a run of prose on one line is what decides
   how wide it is — and the hint is a long sentence. Capped, it wraps and the
   panel is sized by the bags and the doll, which is what should be setting it:
   uncapped, the screen came out nearly the width of the window with a field of
   empty background beside the slots. */
.cui-wrap { max-width: 46ch; }
.cui-btn {
  padding: 6px 12px; border: 0; border-radius: 6px; cursor: pointer;
  background: #3d78d8; color: #fff; font: 600 12px "Segoe UI", sans-serif;
}
.cui-btn:disabled { background: #2a3550; color: #8895ad; cursor: default; }
.cui-btn:not(:disabled):hover { background: #4d88e8; }
.cui-held {
  position: fixed; pointer-events: none;
  width: var(--cui-icon); height: var(--cui-icon);
  z-index: 60; display: none; transform: translate(-50%, -50%);
}
.cui-sep { height: 1px; background: rgba(255,255,255,.12); margin: 12px 0; }

/* --- containers: the chest and the world furnace -------------------------
   Same panel, one column. The chest grid and the backpack are the only
   scrollers; the furnace row is in the never-shrink group for the same
   reason the bench is — you must be able to reach the fuel slot even on a
   420px-tall window. */
.cui-panel.cui-one { grid-template-columns: minmax(0, 1fr); min-width: 340px; }
.cui-furn {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 4px 0;
}
.cui-stack { display: flex; flex-direction: column; align-items: center;
  gap: 6px; }
/* the fuel gauge: a flame that burns down, drawn as a clipped wedge so it
   reads as a fire and not as a battery */
.cui-flame {
  position: relative; width: 18px; height: 20px; overflow: hidden;
  background: rgba(255,255,255,.10);
  clip-path: polygon(50% 0%, 78% 34%, 100% 70%, 76% 100%, 24% 100%, 0% 70%,
    22% 34%);
}
.cui-flame i {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: linear-gradient(to top, #ff6a1e 0%, #ffc247 65%, #ffe9a8 100%);
  transition: height .12s linear;
}
.cui-prog {
  position: relative; width: 86px; height: 12px; border-radius: 6px;
  background: rgba(255,255,255,.10); overflow: hidden;
}
.cui-prog i {
  display: block; height: 100%; width: 0%;
  background: linear-gradient(to right, #7fb3ff, #cfe3ff);
}
.cui-prog b {
  position: absolute; inset: 0; font: 700 9px/12px sans-serif;
  text-align: center; color: #0d1322; letter-spacing: .4px;
}
.cui-chest { display: grid; grid-template-columns: repeat(9, auto);
  gap: 4px; justify-content: start; }
.cui-lit { color: #ffb45c; }

/* Short windows: give up icon size and padding before giving up reachability.
   At 600px tall everything still fits with no scrolling at all. */
@media (max-height: 760px) {
  .cui-root { --cui-icon: 30px; }
  .cui-panel { gap: 12px; padding: 12px 14px; }
  .cui-sep { margin: 8px 0; }
  /* the doll shrinks with the slots it stands beside, or it is suddenly the
     tallest thing in the panel and pushes the backpack under the clip */
  .cui-doll { width: 92px; height: 158px; }
}
@media (max-height: 620px) {
  .cui-root { --cui-icon: 26px; padding: 6px; }
  .cui-panel { gap: 10px; padding: 10px 12px;
    grid-template-columns: 204px minmax(0, 1fr); }
  .cui-panel.cui-one { grid-template-columns: minmax(0, 1fr); }
  .cui-sep { margin: 6px 0; }
  .cui-h { margin-bottom: 4px; }
  .cui-note { line-height: 1.45; }
  .cui-doll { width: 78px; height: 134px; }
}
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function injectStyle() {
  if (document.getElementById('cui-style')) return;
  const s = el('style');
  s.id = 'cui-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// Percentages, not pixels: the slot size is a CSS variable that shrinks on
// short windows, and a percentage background follows it with no relayout in
// JS. A background sized COLS x ROWS of the slot puts tile (c, r) exactly on
// screen at position c/(COLS-1), r/(ROWS-1).
function paintIcon(url, iconEl, id) {
  if (!id) { iconEl.style.backgroundImage = 'none'; return; }
  const t = itemTile(id);
  const c = t % ATLAS.COLS;
  const r = (t / ATLAS.COLS) | 0;
  iconEl.style.backgroundImage = `url(${url})`;
  iconEl.style.backgroundSize = `${ATLAS.COLS * 100}% ${ATLAS.ROWS * 100}%`;
  iconEl.style.backgroundPosition =
    `${(c / (ATLAS.COLS - 1)) * 100}% ${(r / (ATLAS.ROWS - 1)) * 100}%`;
}

function drawSlot(url, slotEl, stack) {
  paintIcon(url, slotEl.firstChild, stack?.id ?? null);
  slotEl.querySelector('.cui-n')?.remove();
  slotEl.querySelector('.cui-dur')?.remove();
  slotEl.title = stack ? itemName(stack.id) : '';
  if (!stack) return;
  if (stack.count > 1) {
    slotEl.appendChild(el('div', 'cui-n', String(stack.count)));
  }
  const tool = toolOf(stack.id);
  if (tool && stack.dur !== undefined && stack.dur < tool.durability) {
    const bar = el('div', 'cui-dur');
    const fill = el('i');
    fill.style.width = `${Math.max(0, stack.dur / tool.durability) * 100}%`;
    bar.appendChild(fill);
    slotEl.appendChild(bar);
  }
}

// Push as much of `stack` as fits into one target slot. Returns the new slot
// contents and whatever is left over, so no caller can silently eat items.
function pushInto(cur, stack) {
  if (!stack || stack.count <= 0) return { slot: cur, rest: null };
  if (!cur) return { slot: { ...stack }, rest: null };
  if (cur.id !== stack.id || cur.dur !== undefined || stack.dur !== undefined) {
    return { slot: cur, rest: stack };
  }
  const room = stackSize(cur.id) - cur.count;
  if (room <= 0) return { slot: cur, rest: stack };
  const n = Math.min(room, stack.count);
  const left = stack.count - n;
  return {
    slot: { ...cur, count: cur.count + n },
    rest: left > 0 ? { ...stack, count: left } : null,
  };
}

// One rule for every slot in the game: get the stack, maybe replace it. Pick
// up, drop, merge and swap all fall out of that. `owner.held` is the cursor
// stack — the crafting screen and the container screens each keep their own,
// but they behave identically, which is the whole point of sharing this.
function interactSlot(owner, get, set, e) {
  const one = e.button === 2;              // right click = half / single
  const cur = get();
  if (owner.held) {
    if (!cur) {
      const n = one ? 1 : owner.held.count;
      set({ ...owner.held, count: n });
      owner.held.count -= n;
      if (owner.held.count <= 0) owner.held = null;
    } else if (cur.id === owner.held.id && cur.dur === undefined
      && owner.held.dur === undefined && cur.count < stackSize(cur.id)) {
      const room = stackSize(cur.id) - cur.count;
      const n = one ? 1 : Math.min(owner.held.count, room);
      cur.count += n;
      set(cur);
      owner.held.count -= n;
      if (owner.held.count <= 0) owner.held = null;
    } else {
      set(owner.held);
      owner.held = cur;
    }
  } else if (cur) {
    if (one && cur.count > 1) {
      const n = Math.ceil(cur.count / 2);
      owner.held = { ...cur, count: n };
      cur.count -= n;
      set(cur);
    } else {
      owner.held = cur;
      set(null);
    }
  }
}

export class CraftUI {
  constructor({
    inventory, atlasImage, onClose = null, onDrop = null, look = null,
    // "empty my bags", creative only. This was passed by main.js and quietly
    // dropped on the floor here, so the button drew, hovered and did nothing
    // at all — the constructor's destructuring is a contract, and an option
    // it does not name does not exist.
    onEmpty = null,
  } = {}) {
    this.inv = inventory;
    this.onClose = onClose;
    this.onEmpty = onEmpty;
    // Who the doll is. A function, read fresh every time the panel repaints,
    // because you can change character mid-game and put a helmet on mid-panel
    // — a look copied once at construction would be somebody you used to be.
    // Absent, createAvatar falls back to its own default and the box still
    // shows a person rather than a hole.
    this.lookOf = typeof look === 'function' ? look : () => look ?? undefined;
    this.doll = null;        // see _startDoll: built on first open, not before
    // Hands a stack to the world; see _dropDouble. Returns false when there
    // is nowhere to put it, and then the stack stays on the cursor — this
    // screen must never be a way to lose items.
    this.onDrop = onDrop;
    this.grid = new Array(SLOTS).fill(null);
    this.held = null;
    this.filter = '';
    this.open_ = false;
    this.creative = false;   // see setCreative: the book becomes the palette
    this.benchMode = false;  // see open(): a crafting table, not the E screen
    this.result = null;      // what the grid currently makes; see _craft
    this._lastTake = null;   // see _armDouble: the palette's double click
    this._lastBag = null;    // see _armBagDouble: the bags' double click
    this._dollRaf = null;    // the turntable, and null whenever it is stopped

    // the atlas is a canvas; one data URL feeds every slot's background
    this.url = atlasImage?.toDataURL ? atlasImage.toDataURL()
      : (atlasImage?.src ?? '');

    this._injectStyle();
    this._build();
    this._unsub = this.inv?.on(() => { if (this.open_) this.render(); });
  }

  // --- public API ---------------------------------------------------------
  isOpen() { return this.open_; }

  // `bench` is the crafting table standing in the world: the full 3x3, and
  // every recipe in the book laid out on it. E is the same screen with the
  // grid cut down to the two-by-two you have in your hands — because E is
  // what you are CARRYING, and a bench and a furnace are things you walk up
  // to. The furnace has no place in either: the one in the world is
  // ContainerUI's, and it burns whether you are watching or not.
  open({ bench = false } = {}) {
    if (this.open_) return;
    this._setMode(bench);
    this.open_ = true;
    this.root.classList.add('cui-open');
    document.addEventListener('keydown', this._onKey, true);
    document.addEventListener('mousemove', this._onMove);
    this._startDoll();
    this.render();
  }

  openBench() { this.open({ bench: true }); }

  // One panel, two sizes of grid. The book stays in BOTH: it is where a 3x3
  // pattern is looked up, and hiding it at the bench — the one place the big
  // patterns can be laid out at all — would mean the only way to make a
  // pickaxe was to have memorised it.
  //
  // Whatever is on the grid goes back to the bags first, so nothing can be
  // stranded in a cell that is about to stop being on screen.
  _setMode(bench) {
    this._returnGrid();
    this.benchMode = bench;
    this.gridEls.forEach((s, i) => {
      s.style.display = (bench || HAND_CELLS.includes(i)) ? '' : 'none';
    });
    this.gridWrap.classList.toggle('cui-grid2', !bench);
    this.benchHead.textContent = bench ? 'crafting' : 'crafting by hand';
    // the line that used to be the furnace strip, saying why the grid is small
    this.handNote.style.display = bench ? 'none' : '';
    this._setHint();
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.root.classList.remove('cui-open');
    document.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('mousemove', this._onMove);
    // THE SEARCH BOX LETS GO OF THE KEYBOARD. Closing the panel hid the box
    // and left it focused, and a focused box that is not on screen is a
    // leak: the next W typed itself into the search, the panel opened on
    // "wwasd", and the player was walking and searching at once. Focus goes
    // back to the page, which is the only thing that should have it while
    // the panel is shut.
    if (document.activeElement && this.root.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this._stopDoll();
    this._returnAll();
    this.onClose?.();
  }

  toggle() { this.open_ ? this.close() : this.open(); }

  destroy() {
    this.close();
    this._unsub?.();
    this.doll?.renderer.dispose();
    this.doll = null;
    this.root.remove();
  }

  // --- you, in the panel ---------------------------------------------------
  //
  // The dressing room's trick one size down: one avatar, one turntable, its
  // own little renderer on its own canvas. Built on the first open and then
  // KEPT — a WebGL context is expensive to make and costs nothing to leave
  // idle — but the frame loop stops dead the moment the panel closes, so an
  // inventory opened and shut twenty times leaves one canvas and nothing
  // running.
  _startDoll() {
    if (!this.dollEl) return;
    if (!this.doll) {
      let renderer = null;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: this.dollEl, antialias: true, alpha: true,
        });
      } catch (err) { renderer = null; }
      // No context to be had — a machine already out of them, or a page with
      // no GL at all. The panel is still the panel; it just has no picture in
      // it, which is what it looked like yesterday.
      if (!renderer) { this.dollEl.style.display = 'none'; return; }
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      const scene = new THREE.Scene();
      // No lights: the avatar is painted in MeshBasicMaterial, so a lamp in
      // here would do nothing but cost a uniform.
      // Far enough back that the whole person is in the box with air over the
      // head and under the boots — measured, not guessed: at 3.6 the feet were
      // four pixels off the bottom edge, which reads as a body in a box that
      // is too small rather than a body standing in a box.
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
      camera.position.set(0, 1, 3.95);
      camera.lookAt(0, 0.92, 0);
      const parts = createAvatar(this.lookOf());
      scene.add(parts.group);
      // Half a turn, because the avatar's local +Z points BACKWARD and an
      // unrotated body in front of a camera on +Z shows you the back of its
      // head — and four labels reading head, chest, legs, feet against a pair
      // of shoulder blades is not a paper doll.
      this.doll = {
        renderer, scene, camera, parts, spin: Math.PI, drag: null, t: 0,
        w: 0, h: 0, key: null,
      };
      // Drag to turn, as in the dressing room: a turntable on its own is
      // always facing away at the moment you want to see the breastplate.
      this.dollEl.addEventListener('pointerdown', (e) => {
        this.doll.drag = e.clientX;
        this.dollEl.setPointerCapture?.(e.pointerId);
      });
      this.dollEl.addEventListener('pointermove', (e) => {
        if (!this.doll || this.doll.drag === null) return;
        this.doll.spin += (e.clientX - this.doll.drag) * 0.01;
        this.doll.drag = e.clientX;
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        this.dollEl.addEventListener(ev, () => {
          if (this.doll) this.doll.drag = null;
        });
      }
    }
    this._dressDoll();
    this._dollLoop();
  }

  // Who the doll is, checked on every repaint — so putting a helmet on two
  // slots away changes the body while you are looking at it. createAvatar
  // reuses the group it is handed, so the person changes in place rather than
  // the scene collecting one of each.
  //
  // The worn pieces are in the KEY as well as the look, because whether armour
  // reaches the body through the look or straight off the inventory is the
  // avatar's business and not this screen's: either way, the moment a slot
  // changes is the moment to rebuild.
  _dressDoll() {
    const d = this.doll;
    if (!d) return;
    const look = this.lookOf();
    // MATERIAL KEYS, and HANDED OVER. Two halves of the same mistake: the body
    // wants to know what a piece is made of — items.js is what answers that,
    // and it is the same question player.setArmour asks for the man in the
    // world — and the look this panel is given carries no armour at all, so
    // leaving createAvatar to find it meant it never found any. The first pass
    // put the item ids in the key and nothing in the call, which rebuilt the
    // doll at exactly the right moment and rebuilt it bare every time.
    const worn = ARMOUR_SLOTS.map((slot, i) => {
      const a = this.inv?.armour?.[i] ? armourOf(this.inv.armour[i].id) : null;
      return a && a.slot === slot ? a.material : null;
    });
    const key = JSON.stringify([look ?? null, worn]);
    if (key !== d.key) {
      d.key = key;
      d.parts = createAvatar(look, d.parts.group,
        worn.some(Boolean) ? worn : null);
    }
    // The CSS decides how big the box is — short windows shrink it — so the
    // renderer asks the element rather than telling it.
    const w = this.dollEl.clientWidth || 104;
    const h = this.dollEl.clientHeight || 178;
    if (w !== d.w || h !== d.h) {
      d.w = w;
      d.h = h;
      d.renderer.setSize(w, h, false);
      d.camera.aspect = w / h;
      d.camera.updateProjectionMatrix();
    }
  }

  _dollLoop() {
    if (this._dollRaf != null) return;
    if (!this.doll || typeof requestAnimationFrame !== 'function') return;
    const clock = () => (typeof performance !== 'undefined'
      ? performance.now() : Date.now());
    let last = clock();
    const step = () => {
      const d = this.doll;
      if (!this.open_ || !d) { this._dollRaf = null; return; }
      const now = clock();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      d.t += dt;
      if (d.drag === null) d.spin += dt * 0.55;   // a slow turntable
      d.parts.group.rotation.y = d.spin;
      // Standing, breathing, not walking: amp 0 leaves the idle sway that
      // poseAvatar puts in on its own, which is what stops it reading as a
      // shop dummy without pretending you are going anywhere.
      poseAvatar(d.parts, 0, 0, d.t, 0, 0, 0);
      d.renderer.render(d.scene, d.camera);
      this._dollRaf = requestAnimationFrame(step);
    };
    this._dollRaf = requestAnimationFrame(step);
  }

  _stopDoll() {
    if (this._dollRaf != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._dollRaf);
    }
    this._dollRaf = null;
  }

  // --- construction --------------------------------------------------------

  _injectStyle() { injectStyle(); }

  _slot(kind, index, extra = '') {
    const s = el('div', `cui-slot ${extra}`.trim());
    s.dataset.kind = kind;
    s.dataset.index = String(index);
    s.appendChild(el('div', 'cui-icon'));
    return s;
  }

  _build() {
    this.root = el('div', 'cui-root');
    const panel = el('div', 'cui-panel');
    this.root.appendChild(panel);

    // left: the recipe book, or the creative palette in its place
    const left = el('div', 'cui-col');
    // The heading, and — in creative only — the one button that belongs
    // beside it. A creative bag is a shelf you pull things off, and after
    // twenty minutes of building it is thirty-six slots of things you took
    // out once. Emptying it by hand is thirty-six double-clicks; this is the
    // button that should always have been next to the palette that fills it.
    const headRow = el('div', 'cui-headrow');
    this.bookHead = el('div', 'cui-h', 'recipes');
    this.emptyBtn = el('button', 'cui-empty', 'empty my bags');
    this.emptyBtn.type = 'button';
    this.emptyBtn.title = 'throw away everything you are carrying — '
      + 'creative only, and nothing here is ever lost for good';
    this.emptyBtn.hidden = true;
    this.emptyBtn.addEventListener('click', () => {
      this.onEmpty?.();
      this.render();
    });
    headRow.append(this.bookHead, this.emptyBtn);
    left.appendChild(headRow);
    this.search = el('input', 'cui-search');
    this.search.placeholder = 'search…';
    this.search.addEventListener('input', () => {
      this.filter = this.search.value.trim().toLowerCase();
      this._renderBook();
    });
    left.appendChild(this.search);
    // The category strip. The list used to be one flat run of everything, and
    // it was fine at forty items; it is not fine now that there are eight
    // tints of glass, five timbers and a rack of tools per metal. Categories
    // are DERIVED from what an item is (see CATEGORIES), not hand-listed, so
    // anything added later files itself instead of landing in a bucket
    // somebody forgot to update.
    this.category = 'all';
    // which family the palette is inside, or null at the top of the tree
    this.family = null;
    this.catRow = el('div', 'cui-cats');
    this.catEls = new Map();
    for (const c of CATEGORIES) {
      const b = el('button', 'cui-cat', c.name);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.category = c.id;
        this.family = null;      // a new shelf starts at its own top
        this._syncCats();
        this._renderBook();
      });
      this.catEls.set(c.id, b);
      this.catRow.appendChild(b);
    }
    left.appendChild(this.catRow);
    this.book = el('div', 'cui-book');
    // The palette is also the bin. Clicking the list anywhere that is not an
    // item, while carrying a stack, destroys it — which is how you get rid of
    // something in creative, and it is the same gesture as putting it back on
    // the shelf you took it from.
    this.book.addEventListener('mousedown', (e) => {
      if (!this.creative || !this.held) return;
      if (e.target.closest('.cui-rec')) return;    // the row handles its own
      e.preventDefault();
      this._binHeld();
    });
    left.appendChild(this.book);
    panel.appendChild(left);

    // right: the grid, and your bags
    const right = el('div', 'cui-col');

    this.benchHead = el('div', 'cui-h', 'crafting');
    right.appendChild(this.benchHead);
    const bench = el('div', 'cui-bench');
    const g3 = el('div', 'cui-grid3');
    this.gridWrap = g3;
    this.gridEls = [];
    for (let i = 0; i < SLOTS; i++) {
      const s = this._slot('grid', i);
      this.gridEls.push(s);
      g3.appendChild(s);
    }
    bench.appendChild(g3);
    bench.appendChild(el('div', 'cui-arrow', '→'));
    this.resultEl = this._slot('result', 0, 'cui-out');
    bench.appendChild(this.resultEl);
    this.resultLabel = el('div', 'cui-note', '');
    bench.appendChild(this.resultLabel);
    // Its own element, because render() rewrites resultLabel every time and
    // would wipe the message before it could be read.
    this.msgEl = el('div', 'cui-msg', '');
    bench.appendChild(this.msgEl);
    right.appendChild(bench);

    // Where the furnace strip used to be. This screen carried a second,
    // hand-cranked furnace with a "smelt" button on it, which meant the fire
    // followed you around in your pocket — and the one built into the world
    // (ContainerUI, at the bottom of this file) burns on a clock whether you
    // are watching or not, which is the one that should exist. So the strip is
    // gone, and the line that replaces it says what the small grid is for.
    this.handNote = el('div', 'cui-note cui-wrap',
      'two by two, in your hands · a crafting table opens the full three by '
      + 'three, and a furnace is a block you stand at');
    right.appendChild(this.handNote);

    right.appendChild(el('div', 'cui-sep'));

    right.appendChild(el('div', 'cui-h', 'inventory'));
    // What you are wearing, beside what you are carrying. Four slots down the
    // left of the backpack in the order they sit on a body, head to foot, with
    // the total defence under them — the number is the whole point of the
    // strip, and a player who cannot see it is guessing at their own armour.
    const gear = el('div', 'cui-gear');
    // ...and beside the four slots, the body they go on. See _startDoll.
    const you = el('div', 'cui-you');
    this.dollEl = el('canvas', 'cui-doll');
    this.dollEl.title = 'drag to turn';
    you.appendChild(this.dollEl);
    const armour = el('div', 'cui-armour');
    armour.appendChild(el('div', 'cui-h', 'armour'));
    this.armEls = [];
    ARMOUR_SLOTS.forEach((slot, i) => {
      const s = this._slot('arm', i, 'cui-arm');
      s.dataset.tag = slot[0].toUpperCase();
      s.title = slot;
      this.armEls.push(s);
      armour.appendChild(s);
      armour.appendChild(el('div', 'cui-armlab', slot));
    });
    this.defEl = el('div', 'cui-def', '');
    armour.appendChild(this.defEl);
    you.appendChild(armour);
    gear.appendChild(you);
    // the backpack is the one part that may need to scroll — it is last, so
    // the bench and the furnace above it are never pushed off the panel
    const bagScroll = el('div', 'cui-scroll');
    this.bags = el('div', 'cui-bags');
    this.bagEls = [];
    // backpack first, hotbar last, so the hotbar sits nearest the screen edge
    const order = [];
    for (let i = this.inv.hotbarSize; i < this.inv.size; i++) order.push(i);
    for (let i = 0; i < this.inv.hotbarSize; i++) order.push(i);
    this.bagOrder = order;
    for (const i of order) {
      const s = this._slot('inv', i, i < this.inv.hotbarSize ? 'cui-hot' : '');
      this.bagEls.push(s);
      this.bags.appendChild(s);
    }
    bagScroll.appendChild(this.bags);
    gear.appendChild(bagScroll);
    right.appendChild(gear);
    this.hintEl = el('div', 'cui-note cui-wrap', '');
    right.appendChild(this.hintEl);
    panel.appendChild(right);
    this._setHint();

    // an explicit way out, since the panel no longer runs off the screen edge
    this.closeBtn = el('button', 'cui-x', '✕');
    this.closeBtn.title = 'close (esc)';
    this.closeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
    panel.appendChild(this.closeBtn);

    // the cursor stack: drawn by the same _drawSlot path as a real slot
    this.heldEl = el('div', 'cui-held');
    this.heldEl.appendChild(el('div', 'cui-icon'));
    this.root.appendChild(this.heldEl);

    // one delegated handler for every slot in the panel
    const handle = (e) => {
      // A text field has to keep the browser's own mousedown behaviour or it
      // never takes focus, and a box you cannot focus is a box you cannot
      // type into. The preventDefault below used to run before anything was
      // known about the target, which is exactly why the search box looked
      // dead: every click that would have focused it was cancelled.
      if (e.target.closest?.('input, textarea')) return;
      const slot = e.target.closest?.('.cui-slot');
      e.preventDefault();
      if (!slot) {
        // clicking the backdrop closes; clicking the panel does nothing
        if (e.target === this.root && e.button === 0) this.close();
        return;
      }
      this._click(slot.dataset.kind, Number(slot.dataset.index), e);
    };
    this.root.addEventListener('mousedown', handle);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this._onKey = (e) => {
      const typing = e.target === this.search;
      if (e.code === 'Escape' || (e.code === 'KeyE' && !typing)) {
        e.preventDefault();
        this.close();
      }
      // Swallow everything else so the player does not walk while crafting.
      // stopPropagation does not cancel the default action, so the search box
      // still receives its characters.
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    this._onMove = (e) => {
      this.heldEl.style.left = `${e.clientX}px`;
      this.heldEl.style.top = `${e.clientY}px`;
    };

    document.body.appendChild(this.root);
  }

  // --- rendering -----------------------------------------------------------

  // both shared with ContainerUI; see paintIcon / drawSlot above
  _paint(iconEl, id) { paintIcon(this.url, iconEl, id); }

  _drawSlot(slotEl, stack) { drawSlot(this.url, slotEl, stack); }

  render() {
    if (!this.open_) return;
    // the inventory fires this on every change, which is exactly when the
    // body might need rebuilding — a helmet on, a character swapped
    this._dressDoll();
    for (let i = 0; i < SLOTS; i++) {
      this._drawSlot(this.gridEls[i], this.grid[i]);
    }

    const m = match(this.grid);
    this.result = m;
    this._drawSlot(this.resultEl,
      m ? { id: m.id, count: m.count } : null);
    this.resultLabel.textContent = m ? `${itemName(m.id)} x${m.count}` : '';

    // the worn pieces, through the same drawSlot every other slot uses — so
    // the durability bar on a half-dented breastplate is the one that was
    // already there, drawn by the code that draws it on a pickaxe
    this.armEls.forEach((s, i) => {
      const worn = this.inv.getArmour?.(i) ?? null;
      this._drawSlot(s, worn);
      s.classList.toggle('cui-worn', !!worn);
      if (!worn) s.title = ARMOUR_SLOTS[i];
    });
    const def = this.inv.protection?.() ?? 0;
    this.defEl.textContent = def > 0 ? `defence ${def}` : 'no armour';
    this.defEl.style.color = def > 0 ? '' : 'rgba(255,255,255,.4)';

    this.bagOrder.forEach((slotIndex, i) => {
      const s = this.bagEls[i];
      this._drawSlot(s, this.inv.get(slotIndex));
      s.classList.toggle('cui-sel', slotIndex === this.inv.selected);
    });

    this._drawSlot(this.heldEl, this.held);
    this.heldEl.style.display = this.held ? 'block' : 'none';

    this._renderBook();
  }

  // --- creative -------------------------------------------------------------
  //
  // In creative the recipe book is replaced by every item in the game, and
  // the bags start empty. That is the whole mode: you do not craft what you
  // need, you take it — and the list you took it from is also where you throw
  // things away.
  //
  //   click an item      a full stack onto the cursor (one, for a tool)
  //   double-click       a full stack straight into the bags
  //   shift-click        the same, for anyone who already knows the shortcut
  //   click while full   what you are carrying is destroyed
  //
  // The one rule worth stating: a full cursor NEVER picks anything up here.
  // Making the list both a shop and a bin depending on what your hand is
  // doing is the only version of this that can be explained in a line.
  setCreative(on) {
    const was = this.creative;
    this.creative = !!on;
    if (was === this.creative) return this.creative;
    this.bookHead.textContent = this.creative ? 'every item' : 'recipes';
    if (this.emptyBtn) this.emptyBtn.hidden = !this.creative;
    this.search.placeholder = this.creative ? 'search items…' : 'search…';
    this._setHint();
    if (this.open_) this.render();
    return this.creative;
  }

  _setHint() {
    const bags = 'click to pick up · right click for half · '
      + 'shift-click to move, or to wear a piece of armour · '
      + 'double-click a slot to throw it on the ground';
    // the hint has to describe the screen actually in front of you: in the
    // hand the book is half greyed out, and saying why is the whole job of
    // this line
    const lay = this.benchMode
      ? 'click a recipe to lay it out'
      : 'click a recipe to lay it out — the greyed ones need a crafting table';
    this.hintEl.textContent = this.creative
      ? 'click an item for a stack · double-click puts it in your bags · '
        + 'drop what you are carrying on the list to delete it · esc or E to close'
      : `${bags} · ${lay} · esc or E to close`;
  }

  // Throw away whatever the cursor is carrying.
  _binHeld() {
    if (!this.held) return;
    const gone = `${itemName(this.held.id)}${this.held.count > 1
      ? ` x${this.held.count}` : ''}`;
    this.held = null;
    this._note(`deleted ${gone}`);
    this.render();
  }

  // A stack of one item, from nowhere. Tools come as a single fresh one: a
  // stack of 64 pickaxes is noise, and they carry durability.
  _creativeStack(id) {
    const tool = toolOf(id);
    const n = tool ? 1 : stackSize(id);
    return tool ? { id, count: 1, dur: tool.durability } : { id, count: n };
  }

  _creativeTake(id, toBags) {
    // a full hand means you came to throw something away, not to shop
    if (this.held) { this._binHeld(); return; }
    const stack = this._creativeStack(id);
    if (toBags) {
      const left = this.inv.add(stack.id, stack.count);
      this._note(left > 0 ? 'no room in the bags'
        : `${itemName(stack.id)} x${stack.count - left}`);
    } else {
      this.held = stack;
    }
    this.render();
  }

  // --- the double click ------------------------------------------------------
  //
  // Double-clicking an item is what everybody tries first, and until now it
  // did the worst thing in the file: the first press put a stack on the
  // cursor, the second press found a full cursor and DELETED it. You came
  // away with nothing and a message saying something had been thrown out.
  //
  // So the second press is caught here instead, in the same gesture that
  // caused the problem. It takes the first press back — the stack came from
  // nowhere, so putting it back costs nothing — and sends one to the bags.

  // Arm the gesture, if this press was a pick-up. A press that EMPTIED the
  // cursor (the bin) must not arm it, or a double click would undo a
  // deletion the player meant.
  _armDouble(id) {
    this._lastTake = this.held
      ? { id, at: performance.now(), stack: this.held } : null;
  }

  _isDouble(id) {
    const d = this._lastTake;
    return !!d && d.id === id && performance.now() - d.at < DOUBLE_MS;
  }

  _creativeDouble(id) {
    // Identity, not equality: this must only ever take back the very stack
    // the first press created, never something the player was already
    // carrying when they arrived.
    if (this.held === this._lastTake.stack) this.held = null;
    this._lastTake = null;
    this._creativeTake(id, true);
  }

  // Show only the chips this list can actually fill, so `armour` is absent
  // until there is armour rather than being a tab that opens on nothing.
  _applyCats(ids) {
    const seen = new Set();
    for (const id of ids) seen.add(categoryOf(id));
    for (const c of CATEGORIES) {
      const b = this.catEls.get(c.id);
      if (b) b.style.display = (c.id === 'all' || seen.has(c.id)) ? '' : 'none';
    }
    // a selected category that has just emptied would render a blank list
    // that looks broken rather than empty
    if (this.category !== 'all' && !seen.has(this.category)) this.category = 'all';
    this._syncCats();
  }

  _syncCats() {
    for (const [id, b] of this.catEls) {
      b.classList.toggle('cui-cat-on', id === this.category);
    }
  }

  _inCat(id) {
    return this.category === 'all' || categoryOf(id) === this.category;
  }

  _renderPalette() {
    this.book.textContent = '';
    const q = this.filter;
    // the creative palette sorts the same way, for the same reason
    const all = [...allItemIds()]
      .sort((a, b) => itemName(a).localeCompare(itemName(b)));
    this._applyCats(all);
    const inCat = all.filter((id) => this._inCat(id));

    // ---- THE TREE, one level deep ------------------------------------------
    //
    // Most of this list is the same thing in nine materials — nine planks,
    // nine logs, nine doors, a sword and a pickaxe per metal — and scrolling
    // past eight oaks to reach the birch is filing, not browsing. So a family
    // with FAMILY_MIN or more members collapses to one row that opens into
    // them, and everything else stays where it is.
    //
    // A SEARCH IGNORES ALL OF IT. If you have typed something you are looking
    // for a thing, not a shelf, and putting it behind one more click would be
    // the drawer closing on your hand.
    const grouped = new Map();
    if (!q) {
      for (const id of inCat) {
        const fam = familyOf(id);
        if (!fam) continue;
        if (!grouped.has(fam)) grouped.set(fam, []);
        grouped.get(fam).push(id);
      }
      for (const [fam, list] of [...grouped]) {
        if (list.length < FAMILY_MIN) grouped.delete(fam);
      }
    }

    // Inside a family: a way back, and then its members and nothing else.
    if (this.family && grouped.has(this.family)) {
      const back = el('div', 'cui-rec cui-can cui-back');
      back.append(el('div', 'cui-icon'), (() => {
        const t = el('div');
        t.appendChild(el('b', null, `\u2190 back`));
        t.appendChild(el('small', 'cui-cost',
          `all the ${familyName(this.family)}`));
        return t;
      })());
      back.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.family = null;
        this._renderBook();
      });
      this.book.appendChild(back);
      for (const id of grouped.get(this.family)) this._paletteRow(id);
      return;
    }
    this.family = null;

    // The top of the tree: every family as one row, then everything that is
    // not in one.
    const fams = [...grouped.keys()].sort((a, b) =>
      familyName(a).localeCompare(familyName(b)));
    for (const fam of fams) {
      const list = grouped.get(fam);
      const row = el('div', 'cui-rec cui-can cui-fam');
      const icon = el('div', 'cui-icon');
      this._paint(icon, list[0]);
      row.appendChild(icon);
      const txt = el('div');
      txt.appendChild(el('b', null, familyName(fam)));
      txt.appendChild(el('small', 'cui-cost', `${list.length} kinds`));
      row.appendChild(txt);
      row.appendChild(el('span', 'cui-into', '\u203a'));
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.family = fam;
        this._renderBook();
      });
      this.book.appendChild(row);
    }
    const inFam = new Set([...grouped.values()].flat());
    for (const id of inCat) {
      if (inFam.has(id)) continue;
      const name = itemName(id);
      if (q && !name.toLowerCase().includes(q) && !id.includes(q)) continue;
      this._paletteRow(id);
    }
  }

  // One item, as a row you can pick up from. Pulled out of _renderPalette so
  // the family view and the top of the tree draw the same thing.
  _paletteRow(id) {
    {
      const name = itemName(id);
      const row = el('div', 'cui-rec cui-can');
      const icon = el('div', 'cui-icon');
      this._paint(icon, id);
      row.appendChild(icon);
      const txt = el('div');
      txt.appendChild(el('b', null, name));
      const tool = toolOf(id);
      txt.appendChild(el('small', 'cui-cost',
        tool ? 'tool · one at a time'
          : `${isPlaceable(id) ? 'block' : 'item'} · x${stackSize(id)}`));
      row.appendChild(txt);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (e.button !== 0 || e.shiftKey) {
          this._creativeTake(id, e.shiftKey);
          this._lastTake = null;
          return;
        }
        if (this._isDouble(id)) { this._creativeDouble(id); return; }
        this._creativeTake(id, false);
        this._armDouble(id);
      });
      this.book.appendChild(row);
    }
  }

  _renderBook() {
    if (!this.open_) return;
    if (this.creative) { this._renderPalette(); return; }
    this.book.textContent = '';
    const q = this.filter;
    // Alphabetical by what it makes. The book used to list in definition
    // order, which is the order the recipes happened to be written into
    // crafting.js — coherent to whoever wrote the file and a mess to anyone
    // reading the screen. A book is looked things up in; it sorts.
    const recipes = [...listRecipes()]
      .sort((a, b) => a.name.localeCompare(b.name));
    // the book files a recipe under what it MAKES, which is what you are
    // looking for when you open it
    this._applyCats(recipes.map((r) => r.out));
    for (const r of recipes) {
      if (!this._inCat(r.out)) continue;
      const hit = !q || r.name.toLowerCase().includes(q) || r.out.includes(q);
      if (!hit) continue;
      const row = el('div', 'cui-rec');
      // A recipe too big for your hands is still LISTED — it is where you look
      // the pattern up, and a book that hid everything you cannot make today
      // would be no use for planning. It just does not light up, and it says
      // what it is waiting for.
      const big = !this.benchMode && !fitsHand(r);
      if (!big && this.inv.canAfford(r.cost)) row.classList.add('cui-can');
      const icon = el('div', 'cui-icon');
      this._paint(icon, r.out);               // CSS sizes book icons smaller
      row.appendChild(icon);
      const txt = el('div');
      txt.appendChild(el('b', null,
        r.count > 1 ? `${r.name} x${r.count}` : r.name));
      // Each ingredient carries its own have/need count, and the ones you are
      // short of are marked. "3 stick" tells you nothing when you have two;
      // "stick 2/3" tells you exactly what to go and get.
      const cost = el('small', 'cui-cost');
      r.cost.forEach((c, i) => {
        const have = this.inv.count(c.id);
        if (i) cost.appendChild(el('span', 'cui-plus', ' + '));
        cost.appendChild(el('span', have >= c.count ? 'cui-ok' : 'cui-short',
          `${itemName(c.id)} ${Math.min(have, c.count)}/${c.count}`));
      });
      txt.appendChild(cost);
      const short = r.cost.filter((c) => this.inv.count(c.id) < c.count);
      if (big) {
        txt.appendChild(el('small', 'cui-need', 'needs a crafting table'));
      } else if (short.length) {
        txt.appendChild(el('small', 'cui-need', 'need '
          + short.map((c) => `${c.count - this.inv.count(c.id)} more `
            + itemName(c.id)).join(', ')));
      }
      row.appendChild(txt);
      row.addEventListener('click', () => this._layout(r));
      this.book.appendChild(row);
    }
  }

  // --- slot interaction ----------------------------------------------------

  // shared with ContainerUI: see interactSlot at the top of the file
  _interact(get, set, e) { interactSlot(this, get, set, e); }

  _click(kind, index, e) {
    if (kind === 'result') { this._craft(e.shiftKey); return; }

    if (kind === 'inv') {
      if (e.shiftKey && !this.held) {
        this._lastBag = null;
        // shift-click on a piece of armour puts it ON. Anywhere else in this
        // screen shift-click means "send this where it obviously goes", and
        // where a helmet obviously goes is your head — bouncing it between
        // the bag and the hotbar instead would be the one slot in the panel
        // where the shortcut ignores what the item is.
        if (this._quickEquip(index)) return;
        this._quickMove(index);
        return;
      }
      if (this._isBagDouble(index)) { this._dropDouble(); return; }
      this._interact(() => this.inv.get(index),
        (s) => this.inv.setSlot(index, s), e);
      this._armBagDouble(index);
    } else if (kind === 'arm') {
      this._clickArmour(index, e);
    } else if (kind === 'grid') {
      this._interact(() => this.grid[index],
        (s) => { this.grid[index] = s && s.count > 0 ? s : null; }, e);
    }
    this.render();
  }

  // shift-click: bounce a stack between the backpack and the hotbar
  _quickMove(from) {
    const stack = this.inv.get(from);
    if (!stack) return;
    const toHotbar = from >= this.inv.hotbarSize;
    const lo = toHotbar ? 0 : this.inv.hotbarSize;
    const hi = toHotbar ? this.inv.hotbarSize : this.inv.size;
    for (let i = lo; i < hi; i++) {
      const s = this.inv.get(i);
      if (s && s.id === stack.id && s.dur === undefined
        && s.count < stackSize(s.id)) {
        const room = Math.min(stackSize(s.id) - s.count, stack.count);
        s.count += room;
        stack.count -= room;
        if (stack.count <= 0) {
          this.inv.setSlot(from, null);
          this.render();
          return;
        }
      }
    }
    for (let i = lo; i < hi; i++) {
      if (this.inv.get(i)) continue;
      this.inv.setSlot(i, stack);
      this.inv.setSlot(from, null);
      break;
    }
    this.render();
  }

  // --- the armour slots ------------------------------------------------------
  //
  // Same cursor rules as every other slot in this file — interactSlot does the
  // picking up, the putting down and the swapping — with one extra law on top:
  // only the right piece goes in. A helmet in the boots slot is not a mistake
  // worth being permissive about, so setArmour refuses it and the click says
  // why rather than silently doing nothing.

  _clickArmour(i, e) {
    // shift-click takes a piece OFF, which is the mirror of shift-clicking one
    // on from the bag. It must move the stack itself, never inv.add(): add()
    // builds a FRESH stack, and a fresh stack of armour is a repaired one —
    // taking your dented helmet off would mend it.
    if (e.shiftKey && !this.held) {
      const worn = this.inv.getArmour(i);
      if (!worn) return;
      const free = this._freeSlot();
      if (free < 0) { this._note('no room in the bags'); return; }
      this.inv.setSlot(free, worn);
      this.inv.setArmour(i, null);
      return;
    }
    if (this.held && armourSlot(this.held.id) !== i) {
      this._note(armourOf(this.held.id)
        ? `${itemName(this.held.id)} does not go there`
        : `${itemName(this.held.id)} is not armour`);
      return;
    }
    this._interact(() => this.inv.getArmour(i),
      (s) => this.inv.setArmour(i, s), e);
  }

  // shift-click a piece in the bag straight onto the body. Whatever it
  // displaces lands in the slot it came out of, so the gesture can never cost
  // you the piece you were already wearing.
  _quickEquip(from) {
    const stack = this.inv.get(from);
    if (!stack || armourSlot(stack.id) < 0) return false;
    const off = this.inv.equip(stack);
    this.inv.setSlot(from, off);
    this.render();
    return true;
  }

  _freeSlot() {
    for (let i = 0; i < this.inv.size; i++) if (!this.inv.get(i)) return i;
    return -1;
  }

  // --- throwing a stack out --------------------------------------------------
  //
  // "I should be able to remove the items that I have. I should double click
  // on an item and it will be dropped on the ground." Caught the same way the
  // palette's double click is (see _armDouble above), and for the same
  // reason: by the time the DOM's own dblclick arrives the first press has
  // already lifted the stack onto the cursor and the second has put it back
  // down, so both are spent. So the second press is intercepted here and
  // throws whatever the FIRST press picked up.
  //
  // Which is also the answer to "one item or the whole stack": the gesture
  // drops exactly what it lifted. A plain double click lifts the whole stack
  // and throws the whole stack; right-click-then-left-click lifts half and
  // throws half, with no new rule to learn — right click has meant "half" in
  // every slot in this file since it was written.
  //
  // Identity, never equality: it may only ever throw the very stack the first
  // press lifted, so a stack the player was already carrying when they
  // clicked cannot be thrown by a click that merely put something down.
  _armBagDouble(index) {
    this._lastBag = this.held
      ? { index, at: performance.now(), stack: this.held } : null;
  }

  _isBagDouble(index) {
    const d = this._lastBag;
    return !!d && d.index === index && this.held === d.stack
      && performance.now() - d.at < DOUBLE_MS;
  }

  _dropDouble() {
    const stack = this.held;
    this._lastBag = null;
    if (!stack) return;
    // No world to throw it into (in orbit, or no onDrop wired at all): the
    // stack stays exactly where it was, on the cursor, and close() will put
    // it back in the bags.
    if (!this.onDrop || this.onDrop(stack) === false) {
      this._note('nowhere to drop that');
      this.render();
      return;
    }
    this.held = null;
    this._note(`dropped ${itemName(stack.id)}`
      + (stack.count > 1 ? ` x${stack.count}` : ''));
    this.render();
  }

  // --- crafting ------------------------------------------------------------

  _craft(all) {
    const m = this.result;
    if (!m) return;
    let guard = 0;
    do {
      const made = { id: m.id, count: m.count };
      if (this.held && this.held.id === made.id
        && this.held.count + made.count <= stackSize(made.id)) {
        this.held.count += made.count;       // craft straight into the cursor
      } else {
        // roll back a partial add rather than duplicating the ingredients
        const left = this.inv.add(made.id, made.count);
        if (left > 0) { this.inv.remove(made.id, made.count - left); break; }
      }
      this.grid = consume(this.grid);
    } while (all && match(this.grid)?.id === m.id && ++guard < 512);
    this.render();
  }

  // A transient line under the bench. Clears itself so a stale complaint does
  // not sit there after you have gone and got the missing pieces.
  _note(msg) {
    if (!this.msgEl) return;
    this.msgEl.textContent = msg;
    clearTimeout(this._noteTimer);
    this._noteTimer = setTimeout(() => {
      if (this.msgEl) this.msgEl.textContent = '';
    }, 4000);
  }

  // Where a recipe's pieces go. A shaped pattern is already trimmed to its own
  // corner, so a 2x2 one lands on the hand cells with nothing to move; a
  // shapeless one has no shape at all and is simply dealt into them in order —
  // which it has to be, because crafting.js deals it along the top ROW, and
  // the third cell of that row is not on screen in the hand.
  _cellsFor(r) {
    if (this.benchMode) return r.layout;
    const g = new Array(SLOTS).fill(null);
    if (r.kind === 'shapeless') {
      r.layout.filter(Boolean)
        .forEach((id, i) => { g[HAND_CELLS[i]] = id; });
    } else {
      for (const i of HAND_CELLS) g[i] = r.layout[i];
    }
    return g;
  }

  // Lay a recipe out on the bench, pulling the pieces from the inventory.
  _layout(r) {
    this._returnGrid();                       // free the bench first, so its
    if (!this.benchMode && !fitsHand(r)) {
      this._note(`${r.name}: you need a crafting table for that`);
      this.render();
      return;
    }
    if (!this.inv.canAfford(r.cost)) {        // contents count towards the cost
      // Silence was the whole problem here: clicking a recipe you cannot
      // afford did nothing at all, with no way to tell that from a bug.
      const short = r.cost
        .filter((c) => this.inv.count(c.id) < c.count)
        .map((c) => `${c.count - this.inv.count(c.id)} more ${itemName(c.id)}`);
      this._note(`${r.name}: you need ${short.join(' and ')}`);
      this.render();
      return;
    }
    const cells = this._cellsFor(r);
    for (let i = 0; i < SLOTS; i++) {
      const id = cells[i];
      if (!id) continue;
      if (this.inv.remove(id, 1) === 1) this.grid[i] = { id, count: 1 };
    }
    this.render();
  }

  // --- closing tidy-up -----------------------------------------------------

  // Put a stack back in the bags without MENDING it. Inventory.add builds a
  // fresh stack out of the id alone, and a fresh stack of anything that
  // carries damage is a repaired one — so closing the screen with a half-worn
  // pickaxe on the cursor handed it back like new, and would have done the
  // same to a dented breastplate. Anything with `dur` on it is therefore moved
  // as the object it is. Returns false only when there is nowhere for it.
  _giveBack(s) {
    if (!s) return true;
    if (s.dur === undefined) return this.inv.add(s.id, s.count) === 0;
    const free = this._freeSlot();
    if (free < 0) return false;
    this.inv.setSlot(free, s);
    return true;
  }

  _returnGrid() {
    for (let i = 0; i < SLOTS; i++) {
      const s = this.grid[i];
      if (!s) continue;
      this.grid[i] = null;
      if (!this._giveBack(s)) this.grid[i] = s;               // no room: keep
    }
  }

  // Never eat the player's items: anything on the grid or on the cursor goes
  // back to the bags when the screen closes.
  _returnAll() {
    this._returnGrid();
    if (this.held && this._giveBack(this.held)) this.held = null;
    this.heldEl.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// ContainerUI — the chest and the world furnace.
//
// A sibling panel rather than a second mode of CraftUI, because the two screens
// answer different questions ("what is in this box" vs "what am I making") and
// because a chest must never be able to eat the bench's contents. It reuses
// this file's CSS, its icon painting and interactSlot, so click-takes-all,
// right-click-takes-half and shift-click-moves behave exactly as they do on
// the crafting bench.
//
// Everything it writes goes straight into the block entity, so walking away
// mid-edit cannot lose anything: only the cursor stack is transient, and close()
// puts that back. See INTEGRATION-blocks.md.
// ---------------------------------------------------------------------------

export class ContainerUI {
  constructor({
    inventory, atlasImage, entities = null, onClose = null, onSound = null,
  } = {}) {
    this.inv = inventory;
    this.entities = entities;   // BlockEntities: furnace writes must wake it
    this.onClose = onClose;
    this.onSound = onSound;
    this.held = null;
    this.ent = null;
    this.mode = null;           // KIND.CHEST | KIND.FURNACE
    this.open_ = false;
    this._raf = null;

    this.url = atlasImage?.toDataURL ? atlasImage.toDataURL()
      : (atlasImage?.src ?? '');

    injectStyle();
    this._build();
    this._unsub = this.inv?.on(() => { if (this.open_) this.render(); });
  }

  // --- public API ---------------------------------------------------------
  isOpen() { return this.open_; }
  entity() { return this.ent; }

  // the single call main.js needs: hand it whatever the crosshair found
  openAt(entity) {
    if (!entity) return false;
    if (entity.kind === KIND.CHEST) return this.openChest(entity);
    if (entity.kind === KIND.BIN) return this.openChest(entity);   // same shelves
    if (entity.kind === KIND.FURNACE) return this.openFurnace(entity);
    return false;
  }

  openChest(chest) {
    if (!chest) return false;
    this._open(KIND.CHEST, chest);
    // viewers, not a boolean: blockanim.js keeps the lid up while any screen
    // is looking into this chest
    chest.viewers = (chest.viewers ?? 0) + 1;
    return true;
  }

  openFurnace(furnace) {
    if (!furnace) return false;
    this._open(KIND.FURNACE, furnace);
    this.entities?.wake?.(furnace);
    return true;
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    if (this.mode === KIND.CHEST && this.ent) {
      this.ent.viewers = Math.max(0, (this.ent.viewers ?? 1) - 1);
    }
    this._returnHeld();
    this.root.classList.remove('cui-open');
    document.removeEventListener('keydown', this._onKey, true);
    document.removeEventListener('mousemove', this._onMove);
    if (this._raf != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._raf);
    }
    this._raf = null;
    this.ent = null;
    this.mode = null;
    this.onClose?.();
  }

  // repaint now — the render loop drives this itself, but tests and a
  // headless page need a way in
  refresh() { this.render(); }

  destroy() {
    this.close();
    this._unsub?.();
    this.root.remove();
  }

  // --- construction --------------------------------------------------------

  _open(mode, ent) {
    if (this.open_) this.close();
    this.mode = mode;
    this.ent = ent;
    this.open_ = true;
    this.chestWrap.style.display = mode === KIND.CHEST ? 'block' : 'none';
    this.furnWrap.style.display = mode === KIND.FURNACE ? 'block' : 'none';
    // A chest may say what it is for. Nothing sets this but a shop's
    // stockroom, where the bay's own name is the only thing telling you which
    // of twelve identical boxes you have just opened.
    this.title.textContent = mode === KIND.CHEST
      ? (ent?.label ?? (ent?.kind === KIND.BIN
        ? 'bin — a day after the first thing goes in, it burns' : 'chest'))
      : 'furnace';
    this.root.classList.add('cui-open');
    document.addEventListener('keydown', this._onKey, true);
    document.addEventListener('mousemove', this._onMove);
    this.render();
    this._loop();
  }

  // The furnace burns whether or not you are watching, so the panel has to
  // repaint itself: main.js already ticks the entity, this only draws it.
  _loop() {
    if (typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      if (!this.open_) { this._raf = null; return; }
      if (this.mode === KIND.FURNACE) this._renderFurnace();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _slot(kind, index, extra = '') {
    const s = el('div', `cui-slot ${extra}`.trim());
    s.dataset.kind = kind;
    s.dataset.index = String(index);
    s.appendChild(el('div', 'cui-icon'));
    return s;
  }

  _build() {
    this.root = el('div', 'cui-root');
    const panel = el('div', 'cui-panel cui-one');
    this.root.appendChild(panel);
    const col = el('div', 'cui-col');
    panel.appendChild(col);

    this.title = el('div', 'cui-h', 'chest');
    col.appendChild(this.title);

    // --- chest view: 27 slots, its own scroller
    this.chestWrap = el('div', 'cui-scroll');
    this.chestGrid = el('div', 'cui-chest');
    this.chestEls = [];
    for (let i = 0; i < CHEST_SLOTS; i++) {
      const s = this._slot('chest', i);
      this.chestEls.push(s);
      this.chestGrid.appendChild(s);
    }
    this.chestWrap.appendChild(this.chestGrid);
    col.appendChild(this.chestWrap);

    // --- furnace view: never shrinks, so the fuel slot is always reachable
    this.furnWrap = el('div', 'cui-furn');
    const inCol = el('div', 'cui-stack');
    this.fInEl = this._slot('fin', 0);
    this.flame = el('div', 'cui-flame');
    this.flameFill = el('i');
    this.flame.appendChild(this.flameFill);
    this.fFuelEl = this._slot('ffuel', 0);
    inCol.append(this.fInEl, this.flame, this.fFuelEl);
    this.furnWrap.appendChild(inCol);

    const arrow = el('div', 'cui-stack');
    this.prog = el('div', 'cui-prog');
    this.progFill = el('i');
    this.progText = el('b', null, '');
    this.prog.append(this.progFill, this.progText);
    arrow.append(el('div', 'cui-arrow', '→'), this.prog);
    this.furnWrap.appendChild(arrow);

    this.fOutEl = this._slot('fout', 0, 'cui-out');
    this.furnWrap.appendChild(this.fOutEl);
    this.burnLabel = el('div', 'cui-note', '');
    this.furnWrap.appendChild(this.burnLabel);
    col.appendChild(this.furnWrap);

    col.appendChild(el('div', 'cui-sep'));
    col.appendChild(el('div', 'cui-h', 'inventory'));

    // the backpack is last and is the other scroller, so the chest grid and
    // the furnace row above it can never be pushed off the panel
    const bagScroll = el('div', 'cui-scroll');
    this.bags = el('div', 'cui-bags');
    this.bagEls = [];
    const order = [];
    for (let i = this.inv.hotbarSize; i < this.inv.size; i++) order.push(i);
    for (let i = 0; i < this.inv.hotbarSize; i++) order.push(i);
    this.bagOrder = order;
    for (const i of order) {
      const s = this._slot('inv', i, i < this.inv.hotbarSize ? 'cui-hot' : '');
      this.bagEls.push(s);
      this.bags.appendChild(s);
    }
    bagScroll.appendChild(this.bags);
    col.appendChild(bagScroll);
    col.appendChild(el('div', 'cui-note',
      'click to pick up · right click for half · shift-click to move · ' +
      'esc or E to close'));

    this.closeBtn = el('button', 'cui-x', '✕');
    this.closeBtn.title = 'close (esc)';
    this.closeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
    panel.appendChild(this.closeBtn);

    this.heldEl = el('div', 'cui-held');
    this.heldEl.appendChild(el('div', 'cui-icon'));
    this.root.appendChild(this.heldEl);

    const handle = (e) => {
      const slot = e.target.closest?.('.cui-slot');
      e.preventDefault();
      if (!slot) {
        if (e.target === this.root && e.button === 0) this.close();
        return;
      }
      this._click(slot.dataset.kind, Number(slot.dataset.index), e);
    };
    this.root.addEventListener('mousedown', handle);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this._onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        this.close();
      }
      // swallow the rest so the player does not walk off while rummaging
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    this._onMove = (e) => {
      this.heldEl.style.left = `${e.clientX}px`;
      this.heldEl.style.top = `${e.clientY}px`;
    };

    document.body.appendChild(this.root);
  }

  // --- rendering -----------------------------------------------------------

  render() {
    if (!this.open_ || !this.ent) return;
    if (this.mode === KIND.CHEST) {
      for (let i = 0; i < CHEST_SLOTS; i++) {
        drawSlot(this.url, this.chestEls[i], this.ent.get(i));
      }
    } else {
      this._renderFurnace();
    }
    this.bagOrder.forEach((slotIndex, i) => {
      const s = this.bagEls[i];
      drawSlot(this.url, s, this.inv.get(slotIndex));
      s.classList.toggle('cui-sel', slotIndex === this.inv.selected);
    });
    drawSlot(this.url, this.heldEl, this.held);
    this.heldEl.style.display = this.held ? 'block' : 'none';
  }

  // the live half: three slots, a bar and a flame, cheap enough for 60 Hz
  _renderFurnace() {
    const f = this.ent;
    if (!f || f.kind !== KIND.FURNACE) return;
    drawSlot(this.url, this.fInEl, f.in);
    drawSlot(this.url, this.fFuelEl, f.fuel);
    drawSlot(this.url, this.fOutEl, f.out);
    const pct = Math.round(f.progress * 100);
    this.progFill.style.width = `${pct}%`;
    this.progText.textContent = pct > 0 ? `${pct}%` : '';
    this.flameFill.style.height = `${Math.round(f.flame * 100)}%`;
    this.burnLabel.textContent = f.lit
      ? `burning — ${f.burn.toFixed(0)}s of fuel left`
      : (f.in ? 'no fuel' : 'empty');
    this.burnLabel.classList.toggle('cui-lit', f.lit);
  }

  // --- slot interaction ----------------------------------------------------

  _setFurnace(which, stack) {
    if (this.entities?.setFurnaceSlot) {
      this.entities.setFurnaceSlot(this.ent, which, stack);
    } else {
      this.ent[which] = stack && stack.count > 0 ? stack : null;
    }
  }

  // A DOUBLE CLICK MOVES A STACK ACROSS — bag to box, box to bag — the
  // same thing a shift-click does, for the player who was never told about
  // shift. Caught the way the bag's throw is (see _armBagDouble in CraftUI):
  // the DOM's dblclick is no use, because by the time it arrives the first
  // press has lifted the stack and the second has put it back. So the second
  // press on the same slot, inside the interval and still holding what the
  // first press lifted, puts the stack down and sends it across.
  _double(kind, index, e) {
    const now = performance.now();
    const last = this._lastPress;
    this._lastPress = { kind, index, at: now, stack: this.held };
    return !!(last && last.kind === kind && last.index === index
      && now - last.at < 380 && this.held && last.stack === null
      && e.button === 0);
  }

  _click(kind, index, e) {
    if (!this.ent) return;
    if (kind === 'inv') {
      if (e.shiftKey && !this.held) { this._quickOut(index); return; }
      if (this.mode === KIND.CHEST && this._double(kind, index, e)) {
        this.inv.setSlot(index, this.held);
        this.held = null;
        this._quickOut(index);
        return;
      }
      interactSlot(this, () => this.inv.get(index),
        (s) => this.inv.setSlot(index, s), e);
    } else if (kind === 'chest') {
      if (this.mode !== KIND.CHEST) return;
      if (e.shiftKey && !this.held) { this._quickIn(index); return; }
      if (this._double(kind, index, e)) {
        this.ent.setSlot(index, this.held);
        this.held = null;
        this._quickIn(index);
        return;
      }
      interactSlot(this, () => this.ent.get(index),
        (s) => this.ent.setSlot(index, s), e);
    } else if (kind === 'fout') {
      if (this.mode !== KIND.FURNACE) return;
      const out = this.ent.out;
      if (!out) return;
      if (e.shiftKey) {
        this._setFurnace('out', this._giveToInventory(out));
      } else if (!this.held) {
        this.held = out;
        this._setFurnace('out', null);
      }
    } else if (kind === 'fin' || kind === 'ffuel') {
      if (this.mode !== KIND.FURNACE) return;
      const which = kind === 'fin' ? 'in' : 'fuel';
      interactSlot(this, () => this.ent[which],
        (s) => this._setFurnace(which, s), e);
      this.entities?.wake?.(this.ent);
    }
    this.render();
  }

  // shift-click out of the container, into the backpack
  _quickIn(index) {
    const stack = this.ent.get(index);
    if (!stack) return;
    this.ent.setSlot(index, this._giveToInventory(stack));
    this.render();
  }

  // shift-click out of the backpack, into whatever slot makes sense here:
  // the chest, or the furnace's input if it smelts and its fuel slot if it
  // burns. Guessing is the whole value of shift-click.
  _quickOut(index) {
    const stack = this.inv.get(index);
    if (!stack) return;
    if (this.mode === KIND.CHEST) {
      this.inv.setSlot(index, this.ent.addStack(stack));
      this.render();
      return;
    }
    const dest = smeltResult(stack.id) ? 'in' : isFuel(stack.id) ? 'fuel' : null;
    if (!dest) return;
    const { slot, rest } = pushInto(this.ent[dest], stack);
    this._setFurnace(dest, slot);
    this.inv.setSlot(index, rest);
    this.render();
  }

  // merge-then-fill, the same order Inventory.add uses, but stack-aware so a
  // half-worn pickaxe keeps its durability on the way out of a chest
  _giveToInventory(stack) {
    if (!stack) return null;
    let rest = { ...stack };
    const max = stackSize(rest.id);
    if (max > 1 && rest.dur === undefined) {
      for (let i = 0; i < this.inv.size && rest; i++) {
        const cur = this.inv.get(i);
        if (!cur || cur.id !== rest.id) continue;
        const r = pushInto(cur, rest);
        this.inv.setSlot(i, r.slot);
        rest = r.rest;
      }
    }
    for (let i = 0; i < this.inv.size && rest; i++) {
      if (this.inv.get(i)) continue;
      const take = Math.min(max, rest.count);
      this.inv.setSlot(i, { ...rest, count: take });
      rest = rest.count > take ? { ...rest, count: rest.count - take } : null;
    }
    return rest;
  }

  // Never eat the player's items: the cursor stack goes back to the bags, and
  // to the container itself if the bags are full.
  _returnHeld() {
    if (!this.held) return;
    let left = this._giveToInventory(this.held);
    if (left && this.mode === KIND.CHEST) left = this.ent.addStack(left);
    if (left && this.mode === KIND.FURNACE) {
      const { slot, rest } = pushInto(this.ent.in, left);
      if (rest !== left) { this._setFurnace('in', slot); left = rest; }
    }
    this.held = left;             // still nowhere to go: keep it on the cursor
    this.heldEl.style.display = this.held ? 'block' : 'none';
  }
}

export default CraftUI;
