// shop.js — what a village sells, and the window you buy it through.
//
// Money is the whole of the design here. A shop is not a chest with a nicer
// front on it: everything on its shelves has a PRICE, in gold coins, and the
// only way to get coins is to strike them from gold you dug up or to sell a
// shopkeeper something they want. That loop — dig, mint, spend — is what makes
// gold worth anything at all, and it is why prices live in items.js where
// every other module can see them rather than in here.
//
// THE STOCK IS DERIVED, NEVER STORED. Exactly the rule the chests follow: a
// shop's shelves are a pure function of (its cell, the world seed, the day),
// so two machines in one world see the same shop, nothing about a shop is ever
// sent over the wire, and the whole thing costs one hash per open. Restocking
// is free as a consequence — the day rolls over, the hash changes, the shelves
// are different.
//
// ...and the shelf now has a ROOM. Every shop is dug out underneath and the
// goods stand in twelve chests round the cellar walls, sorted by category —
// see cellar() in village.js and syncStore in main.js. That does not change
// the rule above by one word: the boxes are filled FROM this function and the
// ledger's deltas whenever a lid is lifted, and what you take out of one goes
// back into the ledger as stock that has left. Nothing about a shop is stored
// that was not stored before.

import {
  ITEMS, getItem, itemName, itemTile, toolOf, stackSize,
  priceOf, sellPriceOf, TRADE_GOODS,
} from './items.js';
import { ATLAS } from './textures.js';

// --- a deal, wherever it is struck -------------------------------------------
//
// Money for goods, in one place. The shop window calls these and so does a
// conversation with the shopkeeper — "have you four loaves" is the same
// transaction as clicking the bread row four times, and it had better cost the
// same and leave the same hole in the shelf.
//
// Both refuse rather than half-complete: a purchase that takes the coins and
// then finds the bag full is a purchase that ate them.

export function strikeBuy(row, n, inv, till, coin = 'coin') {
  if (!row || n <= 0) return { ok: false, why: null };
  const want = Math.min(n, row.count);
  if (want <= 0) return { ok: false, why: 'none of that left today' };
  const cost = row.price * want;
  if ((inv?.count(coin) ?? 0) < cost) {
    return { ok: false, why: 'not enough coin' };
  }
  const left = inv.addAll([{ id: row.id, count: want }]);
  const got = want - left.reduce((s, x) => s + x.count, 0);
  if (got <= 0) return { ok: false, why: 'no room in your bag' };
  inv.remove(coin, row.price * got);
  row.count -= got;
  // ...and the village is that much richer, and that much emptier. This is
  // the line that makes a shop a shop rather than a vending machine.
  till?.took(row.id, got, row.price * got);
  return { ok: true, n: got, coin: row.price * got };
}

// What a shop pays is SELL_RATE of what it would charge, and that spread is
// the whole of how a shopkeeper eats.
export function strikeSell(id, n, inv, till, coin = 'coin', who = 'the shop') {
  if (!id || id === coin) return { ok: false, why: null };
  const have = inv?.count(id) ?? 0;
  let give = Math.min(n, have);
  if (give <= 0) return { ok: false, why: `you have no ${id.replace(/_/g, ' ')}` };
  // A shop can only buy with money it has. If the till is short it takes what
  // it can afford rather than refusing outright — which is both what a real
  // shop does and the moment the purse stops being a number on a scoreboard
  // and starts being a constraint you can feel.
  const unit = sellPriceOf(id);
  if (till) {
    const canBuy = Math.floor(till.purse() / unit);
    if (canBuy <= 0) return { ok: false, why: `${who} has no coin left today` };
    if (canBuy < give) give = canBuy;
  }
  const pay = unit * give;
  inv.remove(id, give);
  const left = inv.addAll([{ id: coin, count: pay }]);
  // Coins that will not fit go back as the goods they came from rather than
  // into thin air — a full bag must never cost you the sale AND the item.
  if (left.length) {
    inv.remove(coin, pay - left.reduce((s, x) => s + x.count, 0));
    inv.addAll([{ id, count: give }]);
    return { ok: false, why: 'no room for the coin' };
  }
  till?.gave(id, give, pay);
  return { ok: true, n: give, coin: pay };
}

// --- what is on the shelves --------------------------------------------------

// The staples. Every shop in every village has these, because a shop you can
// rely on for rope and bread is the reason you walk into the next village at
// all. They are cheap things you can also make yourself: what you are buying
// is not having to go and find them.
const STAPLES = [
  { id: 'bread', lot: 6 },
  { id: 'torch', lot: 16 },
  { id: 'plank', lot: 32 },
  { id: 'stick', lot: 32 },
  { id: 'seeds', lot: 8 },
  { id: 'coal', lot: 12 },
];

// The rotating stock: three of these, picked per shop per day. A shop is a
// place you come back to, and a shelf that never changes is a shelf you stop
// looking at.
const ROTATION = [
  { id: 'apple', lot: 6 }, { id: 'meat_cooked', lot: 4 },
  { id: 'leather', lot: 6 }, { id: 'bone', lot: 8 },
  { id: 'arrow', lot: 16 }, { id: 'paper', lot: 8 },
  { id: 'book', lot: 2 }, { id: 'glass', lot: 12 },
  { id: 'brick', lot: 16 }, { id: 'iron_ingot', lot: 4 },
  { id: 'copper_ingot', lot: 6 }, { id: 'gold_ingot', lot: 2 },
  { id: 'lantern', lot: 3 }, { id: 'chest', lot: 2 },
  { id: 'ladder', lot: 8 }, { id: 'bucket', lot: 2 },
  { id: 'shears', lot: 1 }, { id: 'stone_pickaxe', lot: 1 },
  { id: 'stone_axe', lot: 1 }, { id: 'iron_shovel', lot: 1 },
  { id: 'bow', lot: 1 }, { id: 'wheat', lot: 12 },
  { id: 'dye_red', lot: 4 }, { id: 'dye_blue', lot: 4 },
  { id: 'dye_yellow', lot: 4 }, { id: 'wool_white', lot: 4 },
  { id: 'wool_brown', lot: 3 }, { id: 'bed_white', lot: 1 },
  // What the farm out the back actually grows. Every village farm now carries
  // a gourd bed (see buildFarm in village.js), and a counter that sold no part
  // of its own harvest was a shop with somebody else's stock in it. Bamboo
  // rides along because it is the one thing on this shelf a village near a
  // grove has by the armful and a village inland has none of.
  { id: 'pumpkin', lot: 4 }, { id: 'watermelon', lot: 8 },
  { id: 'bamboo', lot: 16 },
];

// One 32-bit hash of four numbers. Same shape as the one village.js uses for
// its chests, and for the same reason: a shop has to look the same on every
// machine that opens it without anything about it being written down.
function hash4(a, b, c, d) {
  let n = (a * 0x9e3779b1 ^ b * 0x85ebca6b ^ c * 0xc2b2ae35 ^ d * 0x27d4eb2f) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x2545f491);
  n = Math.imul(n ^ (n >>> 13), 0x1b873593);
  return (n ^ (n >>> 16)) >>> 0;
}

// A little stream off that hash, so a shop can draw a dozen numbers without
// twelve hashes.
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What this shop has today. `shop` is an entry off planet.shopList, `seed` the
// world seed, `day` the world day — see main.js's worldDay(). Returns rows of
// { id, count, price }, most useful first.
export function shopStock(shop, seed, day, presetId = null) {
  const key = hash4(shop.f * 131 + shop.u0, shop.v0, seed | 0, day | 0);
  const rand = stream(key);
  const rows = [];
  const seen = new Set();
  const push = (id, lot, mark) => {
    if (!getItem(id) || seen.has(id)) return;
    seen.add(id);
    const cap = stackSize(id);
    const count = Math.max(1, Math.min(cap, Math.round(lot * (0.6 + rand()))));
    rows.push({ id, count, price: Math.max(1, Math.round(priceOf(id) * mark)) });
  };

  // Every shop marks up a little differently, and it holds for the whole day:
  // a village where one shop is dearer than the next is a village worth
  // walking across.
  const mark = 1.05 + rand() * 0.3;

  // This world's own export, first and cheapest — you are standing where it
  // is made, and a saffron merchant on Tempest should not be charging what a
  // Tempest merchant charges on Rime.
  const local = TRADE_GOODS?.[presetId];
  if (local) push(local, 6, 0.8);

  for (const st of STAPLES) push(st.id, st.lot, mark);

  // ...and three off the rotation, drawn without replacement
  const pool = ROTATION.slice();
  for (let i = 0; i < 3 && pool.length; i++) {
    const [pick] = pool.splice((rand() * pool.length) | 0, 1);
    push(pick.id, pick.lot, mark);
  }
  return rows;
}

// --- the window ----------------------------------------------------------------

const CSS = `
.shop-root { position: fixed; inset: 0; display: none; z-index: 40;
  background: rgba(8,10,14,0.62); font: 13px/1.45 system-ui, sans-serif;
  color: #e8e4da; }
.shop-root.shop-open { display: flex; align-items: center; justify-content: center; }
.shop-panel { width: min(760px, 94vw); max-height: 86vh; display: flex;
  flex-direction: column; background: #1b1d22; border: 2px solid #34383f;
  border-radius: 8px; box-shadow: 0 18px 50px rgba(0,0,0,0.55); }
.shop-head { display: flex; align-items: baseline; gap: 12px; padding: 12px 16px;
  border-bottom: 1px solid #2b2f36; }
.shop-head b { font-size: 15px; letter-spacing: 0.02em; }
.shop-head .shop-sub { color: #9aa0aa; font-size: 12px; }
.shop-purse { margin-left: auto; display: flex; align-items: center; gap: 6px;
  font-weight: 600; color: #e8c877; }
.shop-purse i { width: 18px; height: 18px; display: inline-block;
  image-rendering: pixelated; }
.shop-cols { display: flex; gap: 0; min-height: 0; flex: 1; }
.shop-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
.shop-col + .shop-col { border-left: 1px solid #2b2f36; }
.shop-col h4 { margin: 0; padding: 9px 16px 7px; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.09em; color: #8e949e;
  font-weight: 600; }
.shop-list { overflow-y: auto; padding: 0 8px 10px; }
.shop-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px;
  border-radius: 5px; cursor: pointer; }
.shop-row:hover { background: #262a31; }
.shop-row.shop-no { opacity: 0.42; cursor: default; }
.shop-row.shop-no:hover { background: none; }
.shop-ico { width: 30px; height: 30px; flex: none; image-rendering: pixelated;
  background: #12141a; border: 1px solid #2e323a; border-radius: 4px; }
.shop-nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.shop-nm em { font-style: normal; color: #8e949e; }
.shop-pr { flex: none; font-weight: 600; color: #e8c877; }
.shop-pr.shop-get { color: #8fd18a; }
.shop-foot { padding: 8px 16px 11px; border-top: 1px solid #2b2f36;
  color: #8e949e; font-size: 12px; display: flex; gap: 14px; }
.shop-foot b { color: #cfd4dc; font-weight: 600; }
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Same percentage trick craftui.js uses: a background sized COLS x ROWS of the
// element puts tile (c, r) exactly on it, and it follows any size the CSS
// picks with no arithmetic in JS.
function paintIcon(url, node, id) {
  if (!id || !url) { node.style.backgroundImage = 'none'; return; }
  const t = itemTile(id);
  const c = t % ATLAS.COLS;
  const r = (t / ATLAS.COLS) | 0;
  node.style.backgroundImage = `url(${url})`;
  node.style.backgroundSize = `${ATLAS.COLS * 100}% ${ATLAS.ROWS * 100}%`;
  node.style.backgroundPosition =
    `${(c / (ATLAS.COLS - 1)) * 100}% ${(r / (ATLAS.ROWS - 1)) * 100}%`;
}

export class ShopUI {
  constructor({ inventory, atlasImage, onClose = null, onSound = null,
    coin = 'coin' } = {}) {
    this.inv = inventory;
    this.onClose = onClose;
    this.onSound = onSound;
    this.coin = coin;
    this.open_ = false;
    this.stock = [];
    this.title = 'shop';
    this.url = atlasImage?.toDataURL ? atlasImage.toDataURL()
      : (atlasImage?.src ?? '');
    this._build();
    this._unsub = this.inv?.on(() => { if (this.open_) this.render(); });
  }

  isOpen() { return this.open_; }
  purse() { return this.inv?.count(this.coin) ?? 0; }

  // `stock` is whatever the shelves hold; `till` is the village's money — see
  // ledger.js. Without a till the window still works and simply cannot run
  // out of coin, which is what an unledgered world looks like.
  open(stock, title = 'shop', sub = '', till = null) {
    this.stock = stock ?? [];
    this.till = till;
    this.title = title;
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
    this.open_ = true;
    this.root.classList.add('shop-open');
    document.addEventListener('keydown', this._onKey, true);
    this.render();
    return true;
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.root.classList.remove('shop-open');
    document.removeEventListener('keydown', this._onKey, true);
    this.onClose?.();
  }

  destroy() { this.close(); this._unsub?.(); this.root.remove(); }

  // --- trading --------------------------------------------------------------

  // Buy `n` of a row, and sell `n` of an item. Both are one line each now:
  // the accounting is in strikeBuy and strikeSell below, because the window is
  // no longer the only place a deal can be struck. You can also ask the
  // shopkeeper for four loaves in so many words — see main.js — and a second
  // implementation of "money for goods" is exactly the thing that ends up
  // paying twice or charging nothing.
  buy(row, n = 1) {
    const out = strikeBuy(row, n, this.inv, this.till, this.coin);
    if (!out.ok) { if (out.why) this._say(out.why); return false; }
    this.onSound?.('blockPlace');
    this.render();
    return true;
  }

  sell(id, n = 1) {
    const out = strikeSell(id, n, this.inv, this.till, this.coin,
      this.title ?? 'the shop');
    if (!out.ok) { if (out.why) this._say(out.why); return false; }
    this.onSound?.('blockPlace');
    this.render();
    return true;
  }

  // --- drawing ---------------------------------------------------------------

  _say(msg) {
    this.note.textContent = msg;
    clearTimeout(this._noteT);
    this._noteT = setTimeout(() => { this.note.textContent = ''; }, 2200);
  }

  _build() {
    if (!document.getElementById('shop-style')) {
      const st = el('style');
      st.id = 'shop-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'shop-root');
    const panel = el('div', 'shop-panel');
    this.root.appendChild(panel);

    const head = el('div', 'shop-head');
    this.titleEl = el('b', null, 'shop');
    this.subEl = el('span', 'shop-sub', '');
    this.purseEl = el('div', 'shop-purse');
    this.purseIco = el('i');
    this.purseN = el('span', null, '0');
    this.purseEl.append(this.purseIco, this.purseN);
    head.append(this.titleEl, this.subEl, this.purseEl);
    panel.appendChild(head);

    const cols = el('div', 'shop-cols');
    const left = el('div', 'shop-col');
    left.appendChild(el('h4', null, 'for sale'));
    this.buyList = el('div', 'shop-list');
    left.appendChild(this.buyList);
    const right = el('div', 'shop-col');
    right.appendChild(el('h4', null, 'your bag — click to sell'));
    this.sellList = el('div', 'shop-list');
    right.appendChild(this.sellList);
    cols.append(left, right);
    panel.appendChild(cols);

    const foot = el('div', 'shop-foot');
    foot.appendChild(el('span', null, 'click to trade one · shift-click for ten'));
    // What the shop itself has to spend. It is the other half of the price
    // list: a village with an empty till cannot buy your ore however much it
    // is worth, and you should be able to see that before you try.
    this.tillEl = el('span', null, '');
    foot.appendChild(this.tillEl);
    this.note = el('b', null, '');
    foot.appendChild(this.note);
    panel.appendChild(foot);

    this._onKey = (e) => {
      if (!this.open_) return;
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.body.appendChild(this.root);
  }

  _row(id, count, price, sub, can, get) {
    const r = el('div', `shop-row${can ? '' : ' shop-no'}`);
    const ico = el('div', 'shop-ico');
    paintIcon(this.url, ico, id);
    const nm = el('div', 'shop-nm');
    nm.append(document.createTextNode(itemName(id)));
    if (sub) nm.appendChild(el('em', null, `  ${sub}`));
    const pr = el('div', `shop-pr${get ? ' shop-get' : ''}`,
      `${get ? '+' : ''}${price}`);
    r.append(ico, nm, pr);
    return r;
  }

  render() {
    if (!this.open_) return;
    paintIcon(this.url, this.purseIco, this.coin);
    this.purseN.textContent = String(this.purse());
    this.tillEl.textContent = this.till
      ? `the till holds ${this.till.purse()}` : '';

    this.buyList.textContent = '';
    for (const row of this.stock) {
      if (row.count <= 0) continue;
      const can = this.purse() >= row.price;
      const node = this._row(row.id, row.count, row.price,
        `x${row.count}`, can, false);
      node.addEventListener('click', (e) => this.buy(row, e.shiftKey ? 10 : 1));
      this.buyList.appendChild(node);
    }
    if (!this.buyList.childElementCount) {
      this.buyList.appendChild(el('div', 'shop-row shop-no', 'sold out for today'));
    }

    this.sellList.textContent = '';
    for (const { id, count } of this.inv.contents()) {
      if (id === this.coin) continue;
      const node = this._row(id, count, sellPriceOf(id), `x${count}`, true, true);
      node.addEventListener('click', (e) => this.sell(id, e.shiftKey ? 10 : 1));
      this.sellList.appendChild(node);
    }
    if (!this.sellList.childElementCount) {
      this.sellList.appendChild(el('div', 'shop-row shop-no', 'nothing to sell'));
    }
  }
}

export default ShopUI;
