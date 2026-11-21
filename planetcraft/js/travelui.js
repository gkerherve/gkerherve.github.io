// travelui.js — the destination chooser: a live map of the solar system.
//
// Self-contained on the craftui.js model: it builds its own DOM and injects
// its own <style>, so index.html and main.js do not have to know it exists.
// Wire it up with `new TravelUI({ system, onLaunch })` and call open().
//
// The map is one inline SVG rather than a canvas: orbit rings, planet discs
// and labels are a dozen elements each, they need hit testing and hover, and
// SVG gives all of that for free and stays crisp at any panel size. Planet
// angles advance in real time from their orbital periods, so the system is
// visibly alive while you are choosing — and the distance and flight time
// shown for the selected world are the ones you will actually fly.

import { positionAt, separation, makePlan } from './travel.js';

const VIEW = 1000;                 // svg user units, square
const C = VIEW / 2;                // centre
const DAYS_PER_SECOND = 6;         // how fast the map's clock runs

const CSS = `
.tui-root {
  position: fixed; inset: 0; z-index: 45; display: none;
  align-items: center; justify-content: center; padding: 14px;
  background: rgba(2,4,10,.74);
  font: 13px "Segoe UI", system-ui, sans-serif; color: #cfd8ea;
  user-select: none; cursor: default;
}
.tui-root, .tui-root * { box-sizing: border-box; }
.tui-root.tui-open { display: flex; }
.tui-panel {
  position: relative; display: grid; gap: 16px; padding: 16px 18px;
  grid-template-columns: minmax(0, 1fr) 290px;
  grid-template-rows: minmax(0, 1fr);
  width: min(1020px, 96vw); max-height: min(92vh, 100%);
  background: #0b1120; border: 1px solid rgba(255,255,255,.14);
  border-radius: 12px; box-shadow: 0 14px 48px rgba(0,0,0,.65);
  overflow: hidden;
}
.tui-x {
  position: absolute; top: 8px; right: 10px; z-index: 3;
  width: 24px; height: 24px; padding: 0; border-radius: 6px;
  border: 1px solid rgba(255,255,255,.18); background: #131b2e;
  color: #cfd8ea; font: 600 14px/22px sans-serif; cursor: pointer;
}
.tui-x:hover { background: #24314f; color: #fff; }
.tui-left { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.tui-h { margin: 0 0 8px; font-size: 12px; letter-spacing: .7px;
  text-transform: uppercase; opacity: .6; }
.tui-map { flex: 1 1 auto; min-height: 0; display: block; width: 100%; }
.tui-map .orbit { fill: none; stroke: rgba(150,180,230,.18); stroke-width: 1.6; }
.tui-map .orbit.sel { stroke: rgba(140,190,255,.5); }
.tui-map .hit { fill: transparent; cursor: pointer; }
.tui-map .body { cursor: pointer; }
.tui-map .lbl { fill: #93a5c4; font: 19px "Segoe UI", sans-serif;
  pointer-events: none; }
.tui-map .lbl.on { fill: #fff; }
.tui-map .here { fill: none; stroke: #6ee06e; stroke-width: 3;
  stroke-dasharray: 7 6; }
.tui-map .ring { fill: none; stroke: #7fb3ff; stroke-width: 3.5; }
.tui-map .route { stroke: #7fb3ff; stroke-width: 2.4; stroke-dasharray: 9 7;
  opacity: .75; }
.tui-right { display: flex; flex-direction: column; min-height: 0; gap: 10px; }
.tui-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0;
  padding: 0; list-style: none; }
.tui-list::-webkit-scrollbar { width: 8px; }
.tui-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2);
  border-radius: 4px; }
.tui-item {
  display: flex; gap: 9px; align-items: flex-start; padding: 7px 8px;
  border-radius: 7px; cursor: pointer; border: 1px solid transparent;
}
.tui-item:hover { background: #16203a; }
.tui-item.sel { background: #18233c; border-color: #7fb3ff; }
.tui-item.here { opacity: .62; cursor: default; }
.tui-item.here:hover { background: none; }
.tui-dot { flex: none; width: 13px; height: 13px; margin-top: 2px;
  border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.5) inset; }
.tui-item b { display: block; color: #fff; font-weight: 600; }
.tui-item small { display: block; opacity: .62; font-size: 11px;
  line-height: 1.35; }
.tui-item .tag { float: right; font-size: 10px; letter-spacing: .5px;
  text-transform: uppercase; color: #6ee06e; }
.tui-card {
  flex: none; padding: 10px 11px; border-radius: 8px; background: #101a30;
  border: 1px solid rgba(255,255,255,.1);
}
.tui-card h3 { margin: 0 0 2px; font-size: 16px; color: #fff; }
.tui-card .type { font-size: 11px; letter-spacing: .5px;
  text-transform: uppercase; opacity: .6; }
.tui-card p { margin: 7px 0 0; font-size: 12px; line-height: 1.45;
  opacity: .85; }
.tui-facts { margin: 9px 0 0; display: grid; grid-template-columns: auto 1fr;
  gap: 2px 10px; font-size: 12px; }
.tui-facts dt { opacity: .55; }
.tui-facts dd { margin: 0; color: #e6ecf8; }
.tui-go {
  flex: none; width: 100%; padding: 11px; border: 0; border-radius: 8px;
  cursor: pointer; background: #3d78d8; color: #fff;
  font: 600 15px "Segoe UI", sans-serif;
}
.tui-go:hover { background: #4d88e8; }
.tui-go:disabled { background: #26324a; color: #7b88a2; cursor: default; }
.tui-note { flex: none; font-size: 11px; opacity: .5; line-height: 1.4; }
/* a phone gets the list, not the map: a 300px orbit diagram is unreadable */
@media (max-width: 760px), (max-height: 520px) {
  .tui-panel { grid-template-columns: minmax(0, 1fr); }
  .tui-left { display: none; }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
const svg = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};

export class TravelUI {
  constructor({ system, onLaunch = () => {}, onCancel = () => {} } = {}) {
    this.system = system ?? { planets: [], byId: () => null, star: {} };
    this.onLaunch = onLaunch;
    this.onCancel = onCancel;
    this.open_ = false;
    this.currentId = null;
    this.selectedId = null;
    this.days = 0;
    this._raf = null;
    this._onKey = this._onKey.bind(this);
    this._tick = this._tick.bind(this);
    this._injectStyle();
    this._build();
  }

  // --- public API ---------------------------------------------------------

  isOpen() { return this.open_; }

  setSystem(system) {
    if (!system || system === this.system) return;
    this.system = system;
    this._buildList();
    this._buildMap();
    if (this.open_) this.render();
  }

  open({ currentId = null } = {}) {
    this.currentId = currentId;
    // default to the nearest world that is not the one you are standing on,
    // so the launch button is live the moment the panel appears
    if (!this.selectedId || this.selectedId === currentId) {
      const here = this.system.byId?.(currentId) ?? null;
      const others = this.system.planets.filter((p) => p.id !== currentId);
      others.sort((a, b) => separation(here, a, this.days)
        - separation(here, b, this.days));
      this.selectedId = others[0]?.id ?? null;
    }
    this.open_ = true;
    this.root.classList.add('tui-open');
    document.addEventListener('keydown', this._onKey, true);
    this.render();
    this._raf = requestAnimationFrame(this._tick);
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.root.classList.remove('tui-open');
    document.removeEventListener('keydown', this._onKey, true);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.onCancel();
  }

  destroy() {
    this.close();
    this.root.remove();
  }

  // --- construction -------------------------------------------------------

  _injectStyle() {
    if (document.getElementById('tui-style')) return;
    const s = el('style');
    s.id = 'tui-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  _build() {
    this.root = el('div', 'tui-root');
    const panel = el('div', 'tui-panel');

    const x = el('button', 'tui-x');
    x.type = 'button';
    x.textContent = '×';
    x.addEventListener('click', () => this.close());
    panel.appendChild(x);

    const left = el('div', 'tui-left');
    const h = el('h2', 'tui-h');
    h.textContent = 'choose a destination';
    left.appendChild(h);
    this.svg = svg('svg', {
      class: 'tui-map', viewBox: `0 0 ${VIEW} ${VIEW}`,
      preserveAspectRatio: 'xMidYMid meet',
    });
    left.appendChild(this.svg);
    panel.appendChild(left);

    const right = el('div', 'tui-right');
    const h2 = el('h2', 'tui-h');
    h2.textContent = 'worlds';
    right.appendChild(h2);
    this.list = el('ul', 'tui-list');
    right.appendChild(this.list);

    this.card = el('div', 'tui-card');
    right.appendChild(this.card);

    this.go = el('button', 'tui-go');
    this.go.type = 'button';
    this.go.textContent = 'Launch';
    this.go.addEventListener('click', () => this._launch());
    right.appendChild(this.go);

    this.note = el('div', 'tui-note');
    right.appendChild(this.note);

    panel.appendChild(right);
    this.root.appendChild(panel);
    // clicking the backdrop closes; clicking the panel must not
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root && e.button === 0) this.close();
    });
    document.body.appendChild(this.root);

    this._buildList();
    this._buildMap();
  }

  // What kind of world this is, in the words the player already knows. The
  // start menu sells worlds as Terran, Ocean, City, Storm…; the chooser used
  // to say only the class — 'garden world', 'city world' — so somebody
  // looking for "the Terran world" scanned the whole list and found nothing
  // by that name. Both vocabularies, menu's first.
  _kind(p) {
    const id = String(p.preset ?? '');
    const menu = id ? id[0].toUpperCase() + id.slice(1) : '';
    const cls = p.type ?? '';
    return menu && !cls.toLowerCase().startsWith(id.toLowerCase())
      ? `${menu} · ${cls}` : (menu || cls);
  }

  _buildList() {
    this.list.textContent = '';
    this.rows = new Map();
    for (const p of this.system.planets) {
      const li = el('li', 'tui-item');
      const dot = el('i', 'tui-dot');
      dot.style.background = p.color;
      const body = el('div');
      const tag = el('span', 'tag');
      const name = el('b');
      name.textContent = p.name;
      name.appendChild(tag);
      const sub = el('small');
      sub.textContent = `${this._kind(p)} · radius ${p.radius}`;
      body.appendChild(name);
      body.appendChild(sub);
      li.appendChild(dot);
      li.appendChild(body);
      li.addEventListener('click', () => this._select(p.id));
      li.addEventListener('dblclick', () => {
        if (p.id !== this.currentId) { this._select(p.id); this._launch(); }
      });
      this.list.appendChild(li);
      this.rows.set(p.id, { li, tag });
    }
  }

  _buildMap() {
    this.svg.textContent = '';
    const planets = this.system.planets;
    const maxOrbit = Math.max(1e-6, ...planets.map((p) => p.orbit));
    // leave room for the labels, which sit outside the outermost orbit
    this.scale = (C - 78) / maxOrbit;

    const defs = svg('defs');
    const glow = svg('radialGradient', { id: 'tui-sun' });
    glow.appendChild(svg('stop', {
      offset: '0%', 'stop-color': this.system.star?.color ?? '#ffd27a',
    }));
    glow.appendChild(svg('stop', {
      offset: '100%', 'stop-color': this.system.star?.color ?? '#ffd27a',
      'stop-opacity': '0',
    }));
    defs.appendChild(glow);
    this.svg.appendChild(defs);

    this.orbits = new Map();
    for (const p of planets) {
      const c = svg('circle', {
        class: 'orbit', cx: C, cy: C, r: p.orbit * this.scale,
      });
      this.svg.appendChild(c);
      this.orbits.set(p.id, c);
    }

    this.svg.appendChild(svg('circle', {
      cx: C, cy: C, r: 64, fill: 'url(#tui-sun)', opacity: '.5',
    }));
    this.svg.appendChild(svg('circle', {
      cx: C, cy: C, r: 15, fill: this.system.star?.color ?? '#ffd27a',
    }));
    const starLbl = svg('text', {
      x: C, y: C + 44, class: 'lbl', 'text-anchor': 'middle',
    });
    starLbl.textContent = this.system.star?.name ?? 'sun';
    this.svg.appendChild(starLbl);

    // the route line sits under the discs so it never eats a click
    this.route = svg('line', { class: 'route', x1: C, y1: C, x2: C, y2: C });
    this.route.style.display = 'none';
    this.svg.appendChild(this.route);

    this.hereRing = svg('circle', { class: 'here', cx: C, cy: C, r: 22 });
    this.selRing = svg('circle', { class: 'ring', cx: C, cy: C, r: 18 });
    this.hereRing.style.display = 'none';
    this.selRing.style.display = 'none';
    this.svg.appendChild(this.hereRing);
    this.svg.appendChild(this.selRing);

    this.marks = new Map();
    for (const p of planets) {
      // disc size is a readable stand-in, not to scale — a real scale would
      // make every world a single pixel next to the star
      const r = 8 + Math.min(14, Math.sqrt(p.radius) * 0.75);
      const disc = svg('circle', { class: 'body', cx: C, cy: C, r, fill: p.color });
      const hit = svg('circle', { class: 'hit', cx: C, cy: C, r: r + 16 });
      const lbl = svg('text', { class: 'lbl', x: C, y: C, 'text-anchor': 'middle' });
      lbl.textContent = p.name;
      this.svg.appendChild(disc);
      this.svg.appendChild(lbl);
      this.svg.appendChild(hit);
      const pick = () => this._select(p.id);
      hit.addEventListener('click', pick);
      disc.addEventListener('click', pick);
      hit.addEventListener('dblclick', () => {
        if (p.id !== this.currentId) { pick(); this._launch(); }
      });
      this.marks.set(p.id, { disc, hit, lbl, r });
    }
  }

  // --- interaction --------------------------------------------------------

  _onKey(e) {
    if (!this.open_) return;
    // the panel owns the keyboard while it is up, or Escape would also drop
    // main.js out of play mode behind it
    e.stopPropagation();
    if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.code === 'Enter') { e.preventDefault(); this._launch(); return; }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const ids = this.system.planets.map((p) => p.id);
      if (!ids.length) return;
      let i = ids.indexOf(this.selectedId);
      const step = e.code === 'ArrowDown' ? 1 : -1;
      for (let n = 0; n < ids.length; n++) {
        i = (i + step + ids.length) % ids.length;
        if (ids[i] !== this.currentId) break;
      }
      this._select(ids[i]);
    }
  }

  _select(id) {
    if (id === this.currentId) return;   // you cannot fly to where you are
    this.selectedId = id;
    this.render();
  }

  _launch() {
    const dest = this.system.byId?.(this.selectedId);
    if (!dest || dest.id === this.currentId) return;
    this.close();
    this.onLaunch(dest);
  }

  _tick() {
    if (!this.open_) return;
    // 60 fps of orbital motion; the panel is small, this is cheap
    this.days += DAYS_PER_SECOND / 60;
    this._placeBodies();
    this._raf = requestAnimationFrame(this._tick);
  }

  // --- rendering ----------------------------------------------------------

  render() {
    const here = this.system.byId?.(this.currentId) ?? null;
    for (const p of this.system.planets) {
      const row = this.rows.get(p.id);
      if (!row) continue;
      row.li.classList.toggle('sel', p.id === this.selectedId);
      row.li.classList.toggle('here', p.id === this.currentId);
      row.tag.textContent = p.id === this.currentId ? 'you are here' : '';
      const orbit = this.orbits.get(p.id);
      if (orbit) orbit.classList.toggle('sel', p.id === this.selectedId);
      const mark = this.marks.get(p.id);
      if (mark) mark.lbl.classList.toggle('on',
        p.id === this.selectedId || p.id === this.currentId);
    }
    this._renderCard(here);
    this._placeBodies();
  }

  _renderCard(here) {
    const p = this.system.byId?.(this.selectedId);
    this.card.textContent = '';
    if (!p) {
      this.card.textContent = 'no destination selected';
      this.go.disabled = true;
      return;
    }
    const h = el('h3');
    h.textContent = p.name;
    const type = el('div', 'type');
    type.textContent = p.type;
    this.card.appendChild(h);
    this.card.appendChild(type);
    if (p.blurb) {
      const para = el('p');
      para.textContent = p.blurb;
      this.card.appendChild(para);
    }
    const dist = separation(here, p, this.days);
    const plan = makePlan(here, p, this.days);
    const facts = el('dl', 'tui-facts');
    const add = (k, v) => {
      const dt = el('dt'); dt.textContent = k;
      const dd = el('dd'); dd.textContent = v;
      facts.appendChild(dt); facts.appendChild(dd);
    };
    add('world', this._kind(p));
    add('radius', `${p.radius} blocks`);
    add('orbit', `${p.orbit.toFixed(2)} AU · ${Math.round(p.period)} d year`);
    add('distance', here ? `${dist.toFixed(2)} AU from here` : 'unknown');
    add('flight', `${plan.total.toFixed(0)} s`);
    this.card.appendChild(facts);

    this.go.disabled = p.id === this.currentId;
    this.go.textContent = p.id === this.currentId
      ? 'you are here' : `Launch for ${p.name}`;
    this.note.textContent = this.system.stub
      ? 'the system chart is provisional until solar.js lands · '
        + 'esc cancels, esc during the flight skips it'
      : 'anything you built here is kept and will be waiting when you return · '
        + 'esc during the flight skips it';
  }

  _placeBodies() {
    const at = (p) => {
      const [x, y] = positionAt(p, this.days);
      return [C + x * this.scale, C + y * this.scale];
    };
    let selXY = null, hereXY = null;
    for (const p of this.system.planets) {
      const m = this.marks.get(p.id);
      if (!m) continue;
      const [x, y] = at(p);
      m.disc.setAttribute('cx', x);
      m.disc.setAttribute('cy', y);
      m.hit.setAttribute('cx', x);
      m.hit.setAttribute('cy', y);
      m.lbl.setAttribute('x', x);
      m.lbl.setAttribute('y', y - m.r - 9);
      if (p.id === this.selectedId) selXY = [x, y];
      if (p.id === this.currentId) hereXY = [x, y];
    }
    if (hereXY) {
      this.hereRing.style.display = '';
      this.hereRing.setAttribute('cx', hereXY[0]);
      this.hereRing.setAttribute('cy', hereXY[1]);
    } else this.hereRing.style.display = 'none';
    if (selXY) {
      this.selRing.style.display = '';
      this.selRing.setAttribute('cx', selXY[0]);
      this.selRing.setAttribute('cy', selXY[1]);
    } else this.selRing.style.display = 'none';
    if (selXY && hereXY) {
      this.route.style.display = '';
      this.route.setAttribute('x1', hereXY[0]);
      this.route.setAttribute('y1', hereXY[1]);
      this.route.setAttribute('x2', selXY[0]);
      this.route.setAttribute('y2', selXY[1]);
    } else this.route.style.display = 'none';
  }
}
