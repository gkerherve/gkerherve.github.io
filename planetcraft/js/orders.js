// orders.js — the card you give an order through.
//
// One vocabulary covers a dog, a wolf, a cat and a hired villager (see ORDERS
// in entities.js), so one card commands any of them, and commands a whole
// company at once when you are pointing at nothing in particular.
//
// It is a list and not a radial wheel on purpose. A wheel looks better in a
// screenshot and is worse to use: eight words at arm's length beat eight
// wedges you have to aim at, the keys 1..8 fall out of a list for free, and
// the blurb under each word is the thing that actually teaches the system.

import { ORDERS, ordersFor, orderLabel } from './entities.js';

// What each row is labelled and what key gives it. Digits first because they
// are what a hotbar-shaped hand reaches for, then letters, skipping the two
// that already mean something with the card up (Z closes it, and Q is the key
// that opened it).
// Long enough for the whole vocabulary, with room to grow. A woman's card is
// every trade plus the two that are hers — twenty-two rows — and when the list
// ran out at twenty the last rows came up with a blank chip beside them: an
// order you can only reach with the mouse, on a card whose entire argument for
// being a list is that the keys fall out of it for free. Count the rows before
// adding another trade.
const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'm',
  'n', 'p', 'r', 's', 't', 'v', 'w', 'x'];

const CSS = `
.ord-root { position: fixed; inset: 0; display: none; z-index: 45;
  background: rgba(6,8,12,0.45); font: 13px/1.4 system-ui, sans-serif;
  color: #e8e4da; }
.ord-root.ord-open { display: flex; align-items: center; justify-content: center; }
.ord-card { width: min(360px, 92vw); background: #191b20;
  border: 2px solid #343840; border-radius: 8px; overflow: hidden;
  box-shadow: 0 16px 44px rgba(0,0,0,0.55);
  /* The card has to hold every order a hand can be given, and there are more
     of those than there used to be — the trades kept arriving. Taller than the
     window and the last few are off the bottom of a card that cannot scroll,
     which is a game where the mine simply does not exist on a small screen. */
  max-height: 86vh; display: flex; flex-direction: column; }
.ord-head { padding: 11px 15px 9px; border-bottom: 1px solid #2b2f36; }
.ord-head b { display: block; font-size: 14px; }
.ord-head span { color: #8e949e; font-size: 12px; }
.ord-list { padding: 6px; overflow-y: auto; }
.ord-item { display: flex; align-items: baseline; gap: 10px; padding: 7px 9px;
  border-radius: 5px; cursor: pointer; }
.ord-item:hover { background: #262a31; }
.ord-item.ord-now { background: #2c3a2c; }
.ord-key { flex: none; width: 17px; height: 17px; line-height: 17px;
  text-align: center; border-radius: 3px; background: #2e323a; color: #b9bfc9;
  font-size: 11px; font-weight: 600; }
.ord-nm { flex: none; width: 78px; font-weight: 600; }
.ord-bl { flex: 1; color: #8e949e; font-size: 12px; }
.ord-foot { padding: 7px 15px 10px; border-top: 1px solid #2b2f36;
  color: #767c86; font-size: 11px; }
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class OrderUI {
  constructor({ onOrder = null, onClose = null, onSound = null } = {}) {
    this.onOrder = onOrder;
    this.onClose = onClose;
    this.onSound = onSound;
    this.open_ = false;
    this.targets = [];
    this._build();
  }

  isOpen() { return this.open_; }

  // `targets` is everything the order will land on. One entity is "tell this
  // dog"; a whole company is "everybody".
  open(targets, title = null) {
    const list = (targets ?? []).filter(Boolean);
    if (!list.length) return false;
    this.targets = list;
    const hand = list.every((e) => e.hired);
    this.hand = hand;
    // The trades a woman does — the cooking and the bed-making — only appear
    // when every one of them is a woman. A card that offered an order half
    // the people it was open on could not take would be a card that lies.
    const sex = list.every((e) => e.sex === 'woman') ? 'woman' : null;
    this.sex = sex;
    const one = list.length === 1 ? list[0] : null;
    this.titleEl.textContent = title
      ?? (one ? (one.hired ? 'your hand' : `your ${one.kind}`)
        : `${list.length} following you`);
    // What they are doing NOW. A card that does not say so makes you guess
    // whether the last order landed.
    const now = new Set(list.map((e) => e.order ?? 'follow'));
    this.subEl.textContent = now.size === 1
      ? `now: ${orderLabel([...now][0], hand)}`
      : 'they are doing different things';
    this._fill(hand, sex, now.size === 1 ? [...now][0] : null);
    this.open_ = true;
    this.root.classList.add('ord-open');
    document.addEventListener('keydown', this._onKey, true);
    return true;
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.targets = [];
    // a button that kept focus under the closed card would fire again on
    // Space — which is the jump key
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.classList.remove('ord-open');
    document.removeEventListener('keydown', this._onKey, true);
    this.onClose?.();
  }

  destroy() { this.close(); this.root.remove(); }

  // Give it. The card closes on any order — an order card you have to dismiss
  // is a card you are looking at while the thing you gave the order about is
  // being eaten.
  give(id) {
    const list = this.targets.slice();
    this.close();
    this.onOrder?.(id, list);
  }

  _fill(hand, sex, current) {
    this.listEl.textContent = '';
    const list = ordersFor(hand, sex);
    list.forEach((o, i) => {
      const row = el('div', `ord-item${o.id === current ? ' ord-now' : ''}`);
      row.append(
        el('div', 'ord-key', KEY_LABELS[i] ?? ''),
        el('div', 'ord-nm', orderLabel(o.id, hand)),
        el('div', 'ord-bl', o.blurb));
      row.addEventListener('click', () => this.give(o.id));
      this.listEl.appendChild(row);
    });
    this._keys = list.map((o) => o.id);
  }

  _build() {
    if (!document.getElementById('ord-style')) {
      const st = el('style');
      st.id = 'ord-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'ord-root');
    const card = el('div', 'ord-card');
    const head = el('div', 'ord-head');
    this.titleEl = el('b', null, '');
    this.subEl = el('span', null, '');
    head.append(this.titleEl, this.subEl);
    this.listEl = el('div', 'ord-list');
    const foot = el('div', 'ord-foot',
      'a number or a click gives the order · Z again, or Escape, to leave it');
    card.append(head, this.listEl, foot);
    this.root.appendChild(card);

    this._onKey = (e) => {
      if (!this.open_) return;
      if (e.code === 'Escape' || e.code === 'KeyZ') {
        e.preventDefault(); e.stopPropagation();
        this.close();
        return;
      }
      // 1-9, then the letters. There are more trades than there are digits.
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
        ?? /^Key([A-Z])$/.exec(e.code);
      if (!m) return;
      const i = KEY_LABELS.indexOf(m[1].toLowerCase());
      if (i < 0) return;
      const id = this._keys[i];
      if (!id) return;
      // Captured, so the hotbar never sees it: the whole point of a card is
      // that while it is up the number keys mean orders.
      e.preventDefault();
      e.stopPropagation();
      this.give(id);
    };
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.body.appendChild(this.root);
  }
}

export { ORDERS };
export default OrderUI;
