// almanac.js — the chronicle of the planet, as a book you can read.
//
// The chief's brief is a page of numbers for ONE village, twice a day, and
// nobody but the chief ever sees it. This is the other half: every settlement
// on the world at once, where each one is, how it is doing, and what it has
// done since day one — because "the neighbours" is a whole ring of this game
// (see CLAUDE.md) and you cannot play a ring you cannot see.
//
// Everything in here comes off the ledger's chronicle (one row a day a
// village) and off the same survey the chief is given. There is nothing in
// this book the player could not have counted by walking there, which is the
// same rule the chief is held to: no private information.

import { harvestTotals, harvestSeries } from './ledger.js';
import { itemName, itemTile } from './items.js';
import { ATLAS } from './textures.js';

const CSS = `
.alm-root { position: fixed; inset: 0; z-index: 44; display: none;
  align-items: center; justify-content: center; background: rgba(6,8,12,.72);
  font: 13px/1.5 system-ui, sans-serif; color: #e8e4da; }
.alm-root.alm-open { display: flex; }
.alm-root, .alm-root * { box-sizing: border-box; }
.alm-panel { width: min(1180px, 96vw); height: min(88vh, 860px);
  display: grid; grid-template-columns: 250px minmax(0, 1fr) 340px;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0; background: #191b20; border: 2px solid #35393f; border-radius: 9px;
  box-shadow: 0 22px 60px rgba(0,0,0,.6); overflow: hidden; }
.alm-head { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 14px;
  padding: 12px 18px; border-bottom: 1px solid #2b2f36; background: #15171b; }
.alm-head b { font-size: 16px; letter-spacing: .03em; }
.alm-head span { color: #9aa0aa; font-size: 12px; }
.alm-head .alm-x { margin-left: auto; color: #8c919b; font-size: 11px; }
/* TWO BOOKS IN ONE COVER. The chronicle is every settlement on the planet;
   "my village" is the handful of people who work for you, and it is a page you
   act on rather than read — names get typed into it and places get marked from
   it. They are tabs and not two keys because they answer the same question
   from two ends: how is this world doing, and how am I doing in it. */
.alm-tabs { display: flex; gap: 6px; margin-left: 6px; }
/* One column when the book is on your own village: the settlement list and
   the chart of the world have nothing to say about your roster, and a page
   squeezed into the middle column of a three-column grid is a page you read
   four words at a time. */
.alm-panel.alm-solo { grid-template-columns: minmax(0, 1fr); }
.alm-news { max-width: 720px; padding: 12px 0 14px; border-bottom: 1px solid #262a30; }
.alm-news-day { color: #8f959f; font-size: 11px; text-transform: uppercase;
  letter-spacing: .05em; }
.alm-news-head { font: 600 19px/1.3 Georgia, 'Times New Roman', serif;
  color: #f0e6cc; margin: 4px 0 6px; }
.alm-news p { margin: 0; color: #cfcabc; line-height: 1.6; }
.alm-step { border: 1px solid #b8923f; background: #231f15; border-radius: 10px;
  padding: 12px 16px; margin: 12px 0 4px; max-width: 760px; }
.alm-step em { display: block; color: #c9b877; font-style: normal; font-size: 11px;
  text-transform: uppercase; letter-spacing: .06em; }
.alm-step b { display: block; color: #ffe9a8; font: 600 19px/1.3 Georgia, 'Times New Roman', serif;
  margin: 3px 0 5px; }
.alm-step p { margin: 0; color: #d7d2c4; line-height: 1.55; }
.alm-step span { display: block; margin-top: 6px; color: #b9c7a4; font-size: 12px; }
.alm-rings { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px;
  margin: 12px 0 18px; }
.alm-ring { border: 1px solid #2c3139; border-radius: 10px; padding: 10px 12px;
  background: #1a1d22; }
.alm-ring em { display: inline-grid; place-items: center; width: 22px; height: 22px;
  border-radius: 50%; background: #2a2f37; color: #aab1bc; font: 600 12px system-ui;
  font-style: normal; margin-right: 8px; }
.alm-ring b { color: #e9e2cf; font: 600 14px Georgia, 'Times New Roman', serif; }
.alm-ring p { margin: 8px 0 0; color: #a9a597; font-size: 12px; line-height: 1.5; }
.alm-ring.done { border-color: #5d7a48; background: #1b2219; }
.alm-ring.done em { background: #4f7a3a; color: #f1f7ea; }
.alm-ring.now { border-color: #b8923f; background: #231f15; }
.alm-ring.now em { background: #b8923f; color: #1a1408; }
.alm-road-two { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 26px; }
.alm-road-two h4 { margin: 0 0 8px; color: #cfc6ab; font: 600 13px system-ui, sans-serif;
  text-transform: uppercase; letter-spacing: .05em; }
.alm-hold { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.3fr) 110px 86px;
  gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid #23272d; }
.alm-hold b { color: #e6e0d0; font-weight: 600; }
.alm-hold span { color: #9aa1ac; font-size: 12px; }
.alm-hold em { color: #9aa1ac; font-size: 11px; font-style: normal; text-align: right; }
.alm-hold.mine b { color: #f1d98c; }
.alm-hold.mine span { color: #c9b877; }
.alm-fav { position: relative; height: 6px; border-radius: 3px; background: #2a2e35; }
.alm-fav i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: #6f7b8c; }
.alm-fav i.ok { background: #c9a251; }
.alm-fav u { position: absolute; top: -3px; bottom: -3px; width: 1px; background: #d9c58a; }
.alm-road-note { color: #8f959f; font-size: 12px; line-height: 1.55; margin: 12px 0 18px; }
.alm-road-log { color: #b9b4a5; font-size: 12px; padding: 3px 0; }
@media (max-width: 900px) { .alm-rings { grid-template-columns: 1fr 1fr; }
  .alm-road-two { grid-template-columns: 1fr; } }
.alm-tabs button { background: #22262d; color: #b9bfc9; border: 1px solid #333842;
  border-radius: 6px; padding: 4px 12px; cursor: pointer;
  font: 12px system-ui, sans-serif; }
.alm-tabs button:hover { color: #fff; border-color: #4a515c; }
.alm-tabs button.on { background: #d8b04a; color: #221a06; border-color: #d8b04a;
  font-weight: 600; }
/* the roster: a row per hand, and the name is an input because renaming
   somebody should be typing over what is there, not opening a dialog */
.alm-crew { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
.alm-crew th { text-align: left; font-weight: 500; color: #8f959f;
  font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
  padding: 0 8px 6px; }
.alm-crew td { padding: 5px 8px; font-size: 13px; border-top: 1px solid #23262b;
  color: #cfcabc; vertical-align: middle; }
.alm-crew input { width: 100%; background: #14161a; color: #fff;
  border: 1px solid #2f333a; border-radius: 5px; padding: 5px 8px;
  font: 13px system-ui, sans-serif; }
.alm-crew input:focus { outline: none; border-color: #d8b04a; }
.alm-crew .alm-job { color: #8f959f; font-size: 12px; }
.alm-crew .alm-why { color: #9aa0aa; font-size: 12px; }
.alm-crew .alm-arm { color: #d8b04a; }
/* the places: what a spot is for, where it is, and the one button that sets
   it — which is always "here", because standing somewhere is how you say
   where in this game */
.alm-spots { width: 100%; border-collapse: collapse; }
.alm-spots td { padding: 5px 8px; font-size: 13px; border-top: 1px solid #23262b; }
.alm-spots td:first-child { color: #e8e4da; font-weight: 600; width: 130px; }
.alm-spots .alm-blurb { color: #8f959f; font-size: 12px; }
.alm-spots .alm-at { color: #b9bfc9; font-variant-numeric: tabular-nums;
  font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 6px;
  justify-content: flex-end; }
.alm-spots .alm-none { color: #6b717b; }
.alm-spots .alm-place { display: inline-flex; align-items: center; gap: 4px;
  background: #1b1f25; border: 1px solid #2f333a; border-radius: 999px;
  padding: 1px 3px 1px 9px; white-space: nowrap; }
.alm-spots .alm-place button { border: 0; background: none; padding: 0 5px;
  line-height: 1; font-size: 11px; }
.alm-spots button { background: #22262d; color: #cfd8ea; border: 1px solid #333842;
  border-radius: 5px; padding: 3px 10px; cursor: pointer;
  font: 12px system-ui, sans-serif; }
.alm-spots button:hover { border-color: #7fb3ff; color: #fff; }
.alm-spots button.alm-clr { color: #d4766a; }
.alm-note { color: #8f959f; font-size: 12px; margin: 0 0 12px; }
/* the name of a settlement you founded, typed over rather than read */
.alm-title-in { background: #14161a; color: #fff; border: 1px solid #2f333a;
  border-radius: 6px; padding: 4px 9px; font: 600 15px system-ui, sans-serif;
  min-width: 220px; }
.alm-title-in:focus { outline: none; border-color: #d8b04a; }
.alm-pick { background: #14161a; color: #e8e4da; border: 1px solid #2f333a;
  border-radius: 5px; padding: 4px 8px; font: 12px system-ui, sans-serif; }
.alm-pick:focus { outline: none; border-color: #d8b04a; }
.alm-doing { width: 100%; max-width: 170px; }
.alm-cap2 { color: #cfcabc; font-size: 13px; margin: 0 0 14px; }
.alm-cap2 b { color: #fff; }

.alm-list { border-right: 1px solid #2b2f36; overflow-y: auto; padding: 8px 0; }
.alm-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px;
  padding: 7px 14px; cursor: pointer; border-left: 3px solid transparent; }
.alm-row:hover { background: #21242a; }
.alm-row.alm-on { background: #262a31; border-left-color: #d8b04a; }
.alm-row b { font-weight: 600; font-size: 13px; }
.alm-row i { grid-column: 1 / -1; font-style: normal; color: #8f959f;
  font-size: 11px; }
.alm-row em { font-style: normal; color: #cfcabc; font-variant-numeric: tabular-nums; }

.alm-main { overflow-y: auto; padding: 14px 18px; }
.alm-title { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.alm-title b { font-size: 18px; }
.alm-title span { color: #9aa0aa; font-size: 12px; }
.alm-where { color: #9aa0aa; font-size: 12px; margin-bottom: 12px; }
.alm-verdict { background: #21242a; border: 1px solid #2f333a; border-radius: 6px;
  padding: 9px 12px; margin-bottom: 14px; color: #ddd6c4; font-size: 12.5px; }
.alm-verdict b { color: #e8c05a; }

table.alm-tab { width: 100%; border-collapse: collapse; margin-bottom: 16px;
  font-variant-numeric: tabular-nums; }
table.alm-tab th { text-align: right; font-weight: 500; color: #8f959f;
  font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #2f333a; }
table.alm-tab th:first-child { text-align: left; }
table.alm-tab td { text-align: right; padding: 4px 8px; font-size: 13px;
  border-bottom: 1px solid #23262b; }
table.alm-tab td:first-child { text-align: left; color: #b9bec7; }
table.alm-tab .up { color: #7fc46a; }
table.alm-tab .dn { color: #d4766a; }

/* the roll of who lives here. Second column left-aligned and given the room:
   it is a sentence, not a figure, and the rest of this table is numbers. */
.alm-rollhead { font-size: 11px; color: #9aa0aa; text-transform: uppercase;
  letter-spacing: .04em; margin: 2px 0 5px; }
table.alm-roll { margin-bottom: 16px; }
table.alm-roll th:nth-child(2) { text-align: left; }
table.alm-roll td:nth-child(2) { width: 62%; font-size: 12.5px; }
table.alm-roll td:first-child { white-space: nowrap; }

.alm-plots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px; }
.alm-plot { background: #14161a; border: 1px solid #282c33; border-radius: 6px;
  padding: 8px 10px 6px; }
.alm-plot h4 { margin: 0 0 6px; font-size: 11px; font-weight: 500;
  color: #9aa0aa; letter-spacing: .04em; text-transform: uppercase; }
.alm-plot svg { display: block; width: 100%; height: 92px; }

.alm-side { border-left: 1px solid #2b2f36; padding: 14px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px; }
/* flex: none, or the chart of the world is the first thing to go. The side is
   a flex column that scrolls, and a flex item with no height of its own gives
   its aspect ratio up the moment the column overflows — which it now does, so
   the map collapsed to a one-pixel line and the caption underneath said "click
   a dot to read it" over nothing at all. */
.alm-map { position: relative; width: 100%; aspect-ratio: 2 / 1; flex: none;
  border: 1px solid #2f333a; border-radius: 5px; overflow: hidden;
  background: #0d1018; cursor: crosshair; }
.alm-map canvas { position: absolute; inset: 0; width: 100%; height: 100%;
  image-rendering: pixelated; }
.alm-map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.alm-cap { color: #8f959f; font-size: 11px; margin-top: -6px; }
.alm-near b { display: block; font-size: 11px; color: #9aa0aa;
  text-transform: uppercase; letter-spacing: .04em; margin-bottom: 5px; }
.alm-near div { display: flex; justify-content: space-between; gap: 8px;
  padding: 3px 0; border-bottom: 1px solid #23262b; font-size: 12px; }
.alm-near div span { color: #8f959f; font-variant-numeric: tabular-nums; }
.alm-empty { color: #8f959f; padding: 24px; text-align: center; }

/* the day's work, and the one list on this page you can click INTO.
   It has to LOOK clickable: every other list in this book is a read-only
   column of numbers, so a row that quietly changes the plot under it reads as
   scenery, and the plot stays on whatever the village gathered most of. The
   pointer and the hover were already here and neither is visible until the
   mouse is on top of one — hence the standing marker on every row and the
   line of instruction in the heading. */
.alm-got div { cursor: pointer; align-items: center; padding: 3px 4px;
  border-left: 3px solid #2b2f36; transition: background .08s; }
.alm-got div:hover { background: #21242a; border-left-color: #6d6350; }
.alm-got div.alm-pick { background: #262a31; border-left-color: #d8b04a; }
.alm-got div.alm-pick em { color: #f0e6cf; }
.alm-got small.alm-tip { display: block; color: #8f959f; font-size: 11px;
  text-transform: none; letter-spacing: 0; margin: -3px 0 5px; }
.alm-got i { width: 17px; height: 17px; flex: none; border-radius: 2px;
  image-rendering: pixelated; background-repeat: no-repeat; }
.alm-got em { font-style: normal; flex: 1; color: #cfcabc; }
/* the chosen item's plot, tucked under the list it belongs to. It is a SIBLING
   of the list and not a child, because .alm-near div lays its children out as
   a two-column row and a plot laid out that way puts its title beside its
   chart instead of over it. */
.alm-side > .alm-plot { margin-top: -8px; }
`;

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) n.setAttribute(k, String(v));
  return n;
};

// The same percentage trick shop.js and craftui.js use: a background sized
// COLS x ROWS of the element puts one atlas tile exactly on it, at whatever
// size the CSS picks, with no arithmetic in JS. An icon here because a book
// that lists "oak_log" is a debug dump and the shop window already knows how
// to show a log.
function paintIcon(node, url, id) {
  if (!url || !id) return;
  const t = itemTile(id);
  const c = t % ATLAS.COLS;
  const r = (t / ATLAS.COLS) | 0;
  node.style.backgroundImage = `url(${url})`;
  node.style.backgroundSize = `${ATLAS.COLS * 100}% ${ATLAS.ROWS * 100}%`;
  node.style.backgroundPosition =
    `${(c / (ATLAS.COLS - 1)) * 100}% ${(r / (ATLAS.ROWS - 1)) * 100}%`;
}

// A direction on the sphere to a pixel on an equirectangular chart. It is the
// exact inverse of the projection the minimap paints with — theta down from
// +Y, phi round from -X — and it has to stay the exact inverse or every dot
// on this map is somewhere the village is not.
export function dirToMap(d) {
  const y = Math.max(-1, Math.min(1, d[1]));
  const theta = Math.acos(y);
  let phi = Math.atan2(d[2], -d[0]);
  if (phi < 0) phi += Math.PI * 2;
  return { x: phi / (Math.PI * 2), y: theta / Math.PI };
}

// A line plot with no axes, no gridlines and no legend: a shape and two end
// labels. At this size that is all that survives, and the shape is the whole
// message — a village losing people has a line that goes down and you can see
// it across the room.
function plot(title, rows, pick, colour, fmt = (n) => String(Math.round(n))) {
  const box = el('div', 'alm-plot');
  box.appendChild(el('h4', null, title));
  const W = 260, Hh = 92, P = 14;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: 'none' });
  const vals = rows.map(pick);
  if (vals.length < 2) {
    svg.appendChild(svgEl('text', { x: W / 2, y: Hh / 2, fill: '#5d636d',
      'font-size': 11, 'text-anchor': 'middle' })).textContent =
      'one day so far';
    box.appendChild(svg);
    return box;
  }
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const X = (i) => P + (i / (vals.length - 1)) * (W - 2 * P);
  const Y = (val) => Hh - 16 - ((val - lo) / (hi - lo)) * (Hh - 30);
  // the area under the line, so a plot reads as a quantity rather than a wire
  const area = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  svg.appendChild(svgEl('polygon', {
    points: `${P},${Hh - 16} ${area} ${W - P},${Hh - 16}`,
    fill: colour, 'fill-opacity': 0.16,
  }));
  svg.appendChild(svgEl('polyline', {
    points: area, fill: 'none', stroke: colour, 'stroke-width': 1.8,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));
  svg.appendChild(svgEl('circle', {
    cx: X(vals.length - 1), cy: Y(vals[vals.length - 1]), r: 2.6, fill: colour,
  }));
  // The axis says WHEN, the dot says HOW MUCH, and they stay apart. These
  // used to share one string — "day 1 · 15" — which reads as easily as a
  // range as it does as a day and a value, and with only two days on the
  // books nobody could tell which. The value now sits by its own dot in the
  // line's own colour, the ends of the axis are purely days, and a span
  // worth dividing gets a midpoint tick so "day 0 … day 15" cannot be
  // mistaken for two days of data.
  const d0 = rows[0][0], d1 = rows[rows.length - 1][0];
  const lastX = X(vals.length - 1), lastY = Y(vals[vals.length - 1]);
  const tv = svgEl('text', {
    x: Math.min(lastX - 5, W - P), y: Math.max(11, lastY - 6),
    fill: colour, 'font-size': 10, 'font-weight': 600, 'text-anchor': 'end',
  });
  tv.textContent = fmt(vals[vals.length - 1]);
  const t0 = svgEl('text', { x: P, y: Hh - 4, fill: '#6b717b', 'font-size': 9 });
  t0.textContent = `day ${d0}`;
  const t1 = svgEl('text', { x: W - P, y: Hh - 4, fill: '#6b717b',
    'font-size': 9, 'text-anchor': 'end' });
  t1.textContent = `day ${d1}`;
  svg.append(tv, t0, t1);
  if (d1 - d0 >= 4) {
    const dm = Math.round((d0 + d1) / 2);
    const mi = rows.findIndex((r) => r[0] >= dm);
    if (mi > 0 && mi < rows.length - 1) {
      svg.appendChild(svgEl('line', {
        x1: X(mi), y1: 12, x2: X(mi), y2: Hh - 16,
        stroke: '#3a4048', 'stroke-width': 1,
      }));
      const tm = svgEl('text', { x: X(mi), y: Hh - 4, fill: '#6b717b',
        'font-size': 9, 'text-anchor': 'middle' });
      tm.textContent = `day ${rows[mi][0]}`;
      svg.appendChild(tm);
    }
  }
  box.appendChild(svg);
  return box;
}

export class Almanac {
  // `read` is a function returning everything this book shows, so the almanac
  // never reaches into the world itself — main.js owns what a village is.
  constructor({ read, onClose, atlasImage,
    onName = null, onMark = null, onClear = null, onOrder = null,
    onBed = null, onBedTake = null, onTitle = null, onKind = null } = {}) {
    this.read = read;
    this.onClose = onClose;
    // The three things this book can DO. Everything else in it is reading:
    // these name one of your people, mark a place for a trade, and clear one.
    // They are handed in for the same reason `read` is — almanac.js has no
    // idea what a villager or a cell is and must not learn.
    this.onName = onName;
    this.onMark = onMark;
    this.onClear = onClear;
    this.onOrder = onOrder;
    this.onBed = onBed;
    this.onBedTake = onBedTake;
    this.onKind = onKind;
    this.onTitle = onTitle;
    this.tab = 'world';
    this.open_ = false;
    this.pick = null;        // the selected village's key
    // ...and which of its goods the harvest plot is drawing. Kept on the
    // instance rather than worked out per render so that clicking a village,
    // a neighbour or the map does not throw away what you were looking at.
    this.item = null;
    this.data = null;
    // the block atlas, once, so every icon on the page is a background offset
    this.url = atlasImage?.toDataURL ? atlasImage.toDataURL()
      : (atlasImage?.src ?? '');

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = el('div', 'alm-root');
    const panel = el('div', 'alm-panel');
    this.panel = panel;
    this.head = el('div', 'alm-head');
    this.list = el('div', 'alm-list');
    this.main = el('div', 'alm-main');
    this.side = el('div', 'alm-side');
    panel.append(this.head, this.list, this.main, this.side);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this._onKey = (e) => {
      if (!this.open_) return;
      // J closes the book — but not a J typed into a name. This runs in the
      // capture phase, ahead of the box's own handler, so without the check
      // naming a hand "Jory" shut the chronicle on the first letter.
      const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName ?? '');
      if (e.key === 'Escape' || (!typing && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault(); e.stopPropagation(); this.close();
      }
    };
  }

  open() {
    this.data = this.read?.() ?? null;
    if (!this.data) return false;
    this.open_ = true;
    if (!this.data.villages.some((v) => v.key === this.pick)) {
      this.pick = this.data.villages[0]?.key ?? null;
    }
    this.render();
    this.root.classList.add('alm-open');
    document.addEventListener('keydown', this._onKey, true);
    return true;
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    // GIVE THE KEYBOARD BACK. A name box or an order picker that kept focus
    // under a closed book went on taking every key — the boxes stop
    // propagation, so W A S D never reached the game, and a focused picker
    // read the letters as choices and changed somebody's order.
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.classList.remove('alm-open');
    document.removeEventListener('keydown', this._onKey, true);
    this.onClose?.();
  }

  isOpen() { return this.open_; }

  render() {
    const d = this.data;
    this.head.textContent = '';
    this.head.append(
      el('b', null, `the chronicle of ${d.world}`),
      el('span', null, `day ${d.day} · ${d.villages.length} settlements · `
        + `${d.souls} souls · ${d.purse} coin between them`),
    );
    const tabs = el('div', 'alm-tabs');
    for (const [id, label] of [['world', 'the planet'], ['mine', 'my village'],
      ['road', 'the road'], ['news', 'the dispatch']]) {
      const b = el('button', this.tab === id ? 'on' : null, label);
      b.addEventListener('click', () => { this.tab = id; this.render(); });
      tabs.appendChild(b);
    }
    this.head.append(tabs, el('span', 'alm-x', 'J or escape closes'));

    if (this.tab === 'mine') { this._renderMine(); return; }
    if (this.tab === 'news') { this._renderNews(); return; }
    if (this.tab === 'road') { this._renderRoad(); return; }

    this.list.style.display = '';
    this.side.style.display = '';
    this.panel.classList.remove('alm-solo');
    this.list.textContent = '';
    for (const v of d.villages) {
      const row = el('div', 'alm-row' + (v.key === this.pick ? ' alm-on' : ''));
      row.append(el('b', null, (v.mine ? '★ ' : '') + v.name),
        el('em', null, `${v.souls}`),
        el('i', null, `${v.roofs} roofs · ${v.purse} coin · ${v.away} away`
          + (v.mine ? (v.own ? '' : ' · sworn to you')
            : v.lord ? ` · sworn to ${v.lord}` : '')));
      row.addEventListener('click', () => { this.pick = v.key; this.render(); });
      this.list.appendChild(row);
    }

    this._renderMain();
    this._renderSide();
  }

  // --- MY VILLAGE ------------------------------------------------------------
  //
  // Your people and your places, on one page, and both of them editable. The
  // two side columns go away: a roster is a wide list of rows and a chart of
  // the world has nothing to say about it.
  // THE ROAD: what the game is for, as a page. The five rings with where you
  // stand on each, every settlement on this world and who it answers to, and
  // every world in the system and whether it is yours. Every number on it is
  // one the chiefs are shown too (their brief's `realm` line) — see js/realm.js.
  _renderRoad() {
    const r = this.data?.road;
    this.list.style.display = 'none';
    this.side.style.display = 'none';
    this.panel.classList.add('alm-solo');
    this.main.textContent = '';
    const title = el('div', 'alm-title');
    title.append(el('b', null, 'the road'),
      el('span', null, r?.line || 'a village, coin, the neighbours, the planet, the other planets'));
    this.main.appendChild(title);
    if (!r) return;
    if (r.step) {
      const now = el('div', 'alm-step');
      now.append(el('em', null, `what to do next — step ${r.step.n} of ${r.step.of}`),
        el('b', null, r.step.title), el('p', null, r.step.how));
      if (r.step.prog) now.appendChild(el('span', null, r.step.prog));
      this.main.appendChild(now);
    }
    const rings = el('div', 'alm-rings');
    for (const row of r.rings) {
      const box = el('div', 'alm-ring' + (row.done ? ' done' : row.n === r.ring ? ' now' : ''));
      box.append(el('em', null, row.done ? '✓' : String(row.n)),
        el('b', null, row.name), el('p', null, row.line));
      rings.appendChild(box);
    }
    this.main.appendChild(rings);

    const two = el('div', 'alm-road-two');
    const left = el('div');
    left.appendChild(el('h4', null, `the settlements of ${r.world} — ${r.mine} of ${r.total} yours`));
    for (const v of r.villages) {
      const row = el('div', 'alm-hold' + (v.mine ? ' mine' : ''));
      const who = v.mine ? (v.own ? 'yours — your own bell' : 'yours — sworn to you')
        : v.holder ? `sworn to ${v.holder}` : 'free';
      row.append(el('b', null, (v.mine ? '★ ' : '') + v.name), el('span', null, who));
      if (!v.mine) {
        const bar = el('div', 'alm-fav');
        const fill = el('i');
        fill.style.width = `${Math.max(0, Math.min(100, v.favour))}%`;
        if (v.favour >= r.oathAt) fill.classList.add('ok');
        const mark = el('u');
        mark.style.left = `${r.oathAt}%`;
        bar.append(fill, mark);
        row.append(bar, el('em', null, `goodwill ${v.favour}`));
      }
      left.appendChild(row);
    }
    left.appendChild(el('p', 'alm-road-note',
      `Goodwill rises with every coin across a village's counter and with a gift `
      + `to its chief, and falls with every wrong. At ${r.oathAt} its chief will `
      + 'take a purse for his oath — ask him. Or march: a raid your company wins '
      + 'ends in the same oath. A sworn village keeps its people and sends you a '
      + 'share of its takings at dawn, and you may set its people to work with Z.'));
    const right = el('div');
    right.appendChild(el('h4', null, `the worlds — ${r.planets.held} of ${r.planets.total} held`));
    for (const w of r.worlds) {
      const row = el('div', 'alm-hold' + (w.held ? ' mine' : ''));
      row.append(el('b', null, (w.held ? '♛ ' : '') + w.name),
        el('span', null, w.held ? 'under one chief: you' : w.here ? 'you are here' : 'not yours'));
      right.appendChild(row);
    }
    right.appendChild(el('p', 'alm-road-note',
      'L opens the way to another world. The hands standing with you at the pad '
      + 'come too, with their arms; the rest stay where they are until you are '
      + 'back. A world you hold sends its tribute after you, every dawn.'));
    if (r.log?.length) {
      right.appendChild(el('h4', null, 'lately'));
      for (const l of r.log) right.appendChild(el('div', 'alm-road-log', `day ${l.day} — ${l.line}`));
    }
    two.append(left, right);
    this.main.appendChild(two);
  }

  // THE DISPATCH: every dawn's front page, newest first — js/dispatch.js.
  // Written by the game's own AI when it is awake and out of the numbers when
  // it is not, and it says which, because a story and a sum are not worth the
  // same and the reader should know which one they are holding.
  _renderNews() {
    const news = this.data?.news ?? [];
    this.list.style.display = 'none';
    this.side.style.display = 'none';
    this.panel.classList.add('alm-solo');
    this.main.textContent = '';
    const title = el('div', 'alm-title');
    title.append(el('b', null, 'the dispatch'),
      el('span', null, news.length
        ? `${news.length} day${news.length === 1 ? '' : 's'} written up`
        : 'nothing yet — the first is written at the first dawn'));
    this.main.appendChild(title);
    for (const [day, headline, story, by] of news) {
      const box = el('div', 'alm-news');
      box.append(el('div', 'alm-news-day', `day ${day}`
        + (by ? ` · written by ${by}` : ' · from the books')),
      el('div', 'alm-news-head', headline),
      el('p', null, story));
      this.main.appendChild(box);
    }
  }

  _renderMine() {
    const m = this.data?.mine ?? { hands: [], spots: [] };
    this.list.style.display = 'none';
    this.side.style.display = 'none';
    this.panel.classList.add('alm-solo');
    this.main.textContent = '';

    const title = el('div', 'alm-title');
    title.append(el('b', null, 'my village'),
      el('span', null, `${m.hands.length} on the books · `
        + `${m.beds} bed${m.beds === 1 ? '' : 's'} · `
        + `${m.room} more can be taken on`));
    this.main.appendChild(title);

    const cap = el('p', 'alm-cap2');
    cap.innerHTML = '';
    cap.append(document.createTextNode('You may employ as many hands as you '
      + 'have beds. '));
    cap.appendChild(el('b', null, m.beds
      ? `${m.hands.length} of ${m.beds} taken.`
      : 'You have laid no beds, so you can take nobody on.'));
    this.main.appendChild(cap);

    // --- the people
    const crew = el('table', 'alm-crew');
    const ch = el('tr');
    for (const h of ['name', 'trade', 'told to', 'what is happening',
      'carrying', 'in hand'])
      ch.appendChild(el('th', null, h));
    crew.appendChild(ch);
    if (!m.hands.length) {
      const tr = el('tr');
      const td = el('td', null, 'nobody works for you yet — point at a villager '
        + 'and press Z, or use the button over your hearts');
      td.colSpan = 6;
      td.style.color = '#8f959f';
      tr.appendChild(td);
      crew.appendChild(tr);
    }
    for (const p of m.hands) {
      const tr = el('tr');
      const nameCell = el('td');
      const inp = document.createElement('input');
      inp.value = p.name ?? '';
      inp.placeholder = p.job;
      inp.maxLength = 24;
      inp.title = 'type a name — it goes on the plate over his head';
      const commit = () => this.onName?.(p.hid, inp.value.trim());
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); }
      });
      nameCell.appendChild(inp);
      tr.appendChild(nameCell);
      tr.appendChild(el('td', 'alm-job',
        `${p.job}${p.sex === 'woman' ? ' ♀' : ''}`));
      // WHAT HE IS ON, as a thing you change from here. Setting a village to
      // work by walking up to seven people one at a time is the chore this
      // page exists to end. It is the order card's own vocabulary, so the two
      // always offer the same words.
      const doing = el('td');
      if (p.can?.length) {
        const pick = document.createElement('select');
        pick.className = 'alm-pick alm-doing';
        for (const o of p.can) {
          const opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = o.name;
          pick.appendChild(opt);
        }
        pick.value = p.order;
        pick.title = p.doing;
        pick.addEventListener('change', () => {
          this.onOrder?.(p.hid, pick.value);
          this.refresh();
        });
        doing.appendChild(pick);
      } else {
        doing.textContent = p.doing;
      }
      tr.appendChild(doing);
      // ...AND WHAT IS COMING OF IT. The order is what you told him and this
      // is what has happened about it — walking to it, at it, or the reason
      // there is nothing to do. A row that said only "make a bed" could not
      // tell a man laying one from a man who has been standing in a field
      // with no bedroom in sight since you told him.
      tr.appendChild(el('td', 'alm-why', p.status ?? '—'));
      tr.appendChild(el('td', null, p.carry ?? '—'));
      tr.appendChild(el('td', p.armed ? 'alm-arm' : null, p.hand ?? '—'));
      crew.appendChild(tr);
    }
    this.main.appendChild(crew);

    // --- the beds
    //
    // The answer to "why does my village keep filling up with people who are
    // nothing to do with me". A bed you laid inside a settlement raises ITS
    // cap unless you say who it is for; give it to one of your own and it is
    // spoken for, and their chief may not raise a child into it.
    const btitle = el('div', 'alm-title');
    btitle.append(el('b', null, 'the beds'),
      el('span', null, `${m.beds} laid · ${m.spare} not given to anybody`));
    this.main.appendChild(btitle);
    this.main.appendChild(el('p', 'alm-note',
      'A bed you lay inside a settlement counts toward THAT settlement — it is '
      + 'the cap on how many people live there, so laying beds in somebody '
      + "else's village is how their village grows. Give one to a hand of "
      + 'yours and it is spoken for: he sleeps in it, and nobody else may be '
      + 'born into it.'));
    const bt = el('table', 'alm-spots');
    if (!m.bedList.length) {
      const tr = el('tr');
      const td = el('td', null, 'you have laid no beds — and you may employ '
        + 'one hand for every bed you lay');
      td.colSpan = 4;
      td.style.color = '#8f959f';
      tr.appendChild(td);
      bt.appendChild(tr);
    }
    for (const b of m.bedList) {
      const tr = el('tr');
      tr.appendChild(el('td', null, b.at));
      tr.appendChild(el('td', 'alm-blurb', b.village
        ? `stands in ${b.village}${b.hid ? '' : ' — counts toward its people'}`
        : 'out in the open, no settlement near'));
      const pick = document.createElement('select');
      pick.className = 'alm-pick';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'nobody';
      pick.appendChild(none);
      for (const p of m.hands) {
        const o = document.createElement('option');
        o.value = String(p.hid);
        o.textContent = p.name || p.job;
        pick.appendChild(o);
      }
      pick.value = b.hid == null ? '' : String(b.hid);
      pick.addEventListener('change', () => {
        this.onBed?.(b.key, pick.value ? Number(pick.value) : null);
        this.refresh();
      });
      const cell = el('td');
      cell.appendChild(pick);
      tr.appendChild(cell);
      // TAKE IT UP. A bed you laid in somebody else's village is a bed that
      // grows THEIR village, and until now the only way to stop it was to
      // walk there with a pick. The button pulls the bed out of the world
      // from here — both cells — and it comes back to your bag; whoever of
      // yours had it sleeps somewhere else tonight.
      const take = el('td');
      const x = el('button', 'alm-clr', '✕');
      x.title = b.village && !b.hid
        ? `take this bed up — it is growing ${b.village}, not you`
        : 'take this bed up and put it in your bag';
      x.addEventListener('click', () => {
        this.onBedTake?.(b.key);
        this.refresh();
      });
      take.appendChild(x);
      tr.appendChild(take);
      bt.appendChild(tr);
    }
    this.main.appendChild(bt);

    // --- the places
    const ptitle = el('div', 'alm-title');
    ptitle.append(el('b', null, 'the places'),
      el('span', null, 'where each trade is done'));
    this.main.appendChild(ptitle);
    this.main.appendChild(el('p', 'alm-note',
      'Mark a place and every hand you set to that trade goes there, whatever '
      + 'corner of the world you were standing in when you told them. Mark '
      + 'MORE than one and a gang is split between them — two copses, two '
      + 'fields, a bed in each house. "here" is where you are stood right '
      + 'now, so the book closes when you press it.'));
    const tab = el('table', 'alm-spots');
    for (const sp of m.spots) {
      const tr = el('tr');
      tr.appendChild(el('td', null, sp.name));
      tr.appendChild(el('td', 'alm-blurb', sp.blurb));
      // EVERY PLACE MARKED FOR THIS TRADE, each with its own clear. One field
      // is never the answer for long — a village with three beds has them in
      // two houses — and a gang set to a trade is dealt across the list, so
      // the number of places here is the number of work parties you get.
      const at = el('td', 'alm-at');
      const places = sp.build ? [] : (sp.at ?? []);
      if (sp.build) {
        at.append(el('span', 'alm-none', sp.count
          ? `${sp.count} raised` : 'none up yet'));
      } else if (!places.length) {
        at.append(el('span', 'alm-none', 'nowhere yet'));
      }
      places.forEach((where, i) => {
        const row = el('span', 'alm-place');
        row.append(el('em', null, where));
        const x = el('button', 'alm-clr', '✕');
        x.title = `forget this ${sp.name}`;
        x.addEventListener('click', () => {
          this.onClear?.(sp.id, i);
          this.refresh();
        });
        row.appendChild(x);
        at.appendChild(row);
      });
      tr.appendChild(at);
      const act = el('td');
      // The plot row also says WHICH house goes up on it. 'any that fits'
      // is the roll every village makes; a named kind is a player deciding.
      if (sp.kinds) {
        const sel = el('select');
        const any = el('option', null, 'any that fits');
        any.value = '';
        sel.appendChild(any);
        for (const k of sp.kinds) {
          const o = el('option', null, k);
          o.value = k;
          sel.appendChild(o);
        }
        sel.value = sp.kind ?? '';
        sel.addEventListener('change', () => {
          this.onKind?.(sp.id, sel.value || null);
          this.refresh();
        });
        act.appendChild(sel);
        act.appendChild(el('span', null, ' '));
      }
      // ...and what it is built of: the walls, then the roof. 'as the
      // village builds' is the settlement's own vernacular.
      for (const [list, val, which, word] of [
        [sp.walls, sp.wall, 'wall', 'walls'], [sp.roofs, sp.roof, 'roof', 'roof']]) {
        if (!list) continue;
        const sel = el('select');
        sel.title = `the ${word}`;
        const any = el('option', null, `${word}: as the village builds`);
        any.value = '';
        sel.appendChild(any);
        for (const k of list) {
          const o = el('option', null, `${word}: ${k}`);
          o.value = k;
          sel.appendChild(o);
        }
        sel.value = val ?? '';
        sel.addEventListener('change', () => {
          this.onKind?.(sp.id, sel.value || null, which);
          this.refresh();
        });
        act.appendChild(sel);
        act.appendChild(el('span', null, ' '));
      }
      // The gate row takes the NAME the board will carry — prefilled with
      // the settlement you are standing in, and yours to overtype. A typed
      // name renames the settlement; in open country it becomes the gate's
      // own.
      let nameBox = null;
      if (sp.build) {
        nameBox = el('input');
        nameBox.type = 'text';
        nameBox.placeholder = 'name over the arch';
        nameBox.value = sp.nameHere ?? '';
        nameBox.style.width = '130px';
        act.appendChild(nameBox);
        act.appendChild(el('span', null, ' '));
      }
      // A place you MARK is remembered; a thing you BUILD goes up where you
      // stand and there is nothing to remember, so it says so.
      const b = el('button', null, sp.build ? 'raise it here'
        : places.length ? 'add here' : 'mark here');
      b.addEventListener('click', () => {
        this.onMark?.(sp.id, nameBox?.value ?? null);
        this.close();
      });
      act.appendChild(b);
      tr.appendChild(act);
      tab.appendChild(tr);
    }
    this.main.appendChild(tab);
  }

  // Read the world again and repaint, for the buttons that change it.
  refresh() {
    this.data = this.read?.() ?? this.data;
    this.render();
  }

  _renderMain() {
    const d = this.data;
    const v = d.villages.find((x) => x.key === this.pick);
    this.main.textContent = '';
    if (!v) {
      this.main.appendChild(el('div', 'alm-empty', 'nowhere to read about yet'));
      return;
    }
    const title = el('div', 'alm-title');
    if (v.own ?? v.mine) {
      // YOUR OWN, so the name is a box and not a label. A settlement is named
      // from a hash of its cell the moment its bell goes down, which is a name
      // nobody chose — see renameVillage.
      const inp = document.createElement('input');
      inp.className = 'alm-title-in';
      inp.value = v.name;
      inp.maxLength = 32;
      inp.title = 'your settlement — type a name for it';
      const go = () => { this.onTitle?.(v.key, inp.value); this.refresh(); };
      inp.addEventListener('change', go);
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); go(); inp.blur(); }
      });
      title.append(inp, el('span', null, `${v.culture ?? 'terran'} · yours, `
        + 'founded on your own bell'));
    } else {
      title.append(el('b', null, v.name),
        el('span', null, `${v.culture ?? 'terran'} · founded before you got here`));
    }
    this.main.appendChild(title);
    this.main.appendChild(el('div', 'alm-where',
      `face ${v.at.f}, column ${v.at.u}/${v.at.v} · `
      + `${v.lat}° ${v.latH}, ${v.lon}° ${v.lonH} · ${v.away} blocks from you`));

    const verdict = el('div', 'alm-verdict');
    verdict.innerHTML = '';
    verdict.append(document.createTextNode(v.verdict + ' '));
    const b = el('b', null, `furthest behind: ${v.behind}`);
    verdict.appendChild(b);
    this.main.appendChild(verdict);

    // now / at the last muster / at founding — the chief's own scoreboard, so
    // the player is reading exactly what the chief is reading
    const tab = el('table', 'alm-tab');
    const head = el('tr');
    for (const h of ['', 'now', 'last muster', 'at founding', 'change'])
      head.appendChild(el('th', null, h));
    tab.appendChild(head);
    for (const r of v.rows) {
      const tr = el('tr');
      tr.appendChild(el('td', null, r.name));
      tr.appendChild(el('td', null, r.now));
      tr.appendChild(el('td', null, r.last ?? '—'));
      tr.appendChild(el('td', null, r.found ?? '—'));
      const dcell = el('td', r.delta > 0 ? 'up' : r.delta < 0 ? 'dn' : null,
        r.delta == null ? '—' : (r.delta > 0 ? `+${r.delta}` : String(r.delta)));
      tr.appendChild(dcell);
      tab.appendChild(tr);
    }
    this.main.appendChild(tab);

    // WHO THEY ARE, before the graphs. A settlement is people with jobs, and
    // the numbers above are what those people did — so the roster goes between
    // them, where you read it as the explanation of the table rather than as
    // an appendix to the charts.
    const folk = v.folk ?? [];
    const roll = el('table', 'alm-tab alm-roll');
    const rh = el('tr');
    for (const h of ['who', 'doing', 'brought in'])
      rh.appendChild(el('th', null, h));
    roll.appendChild(rh);
    if (!folk.length) {
      const tr = el('tr');
      const td = el('td', null, v.away > 0
        ? 'nobody is standing in it while you are this far away — '
          + 'walk closer and the village fills'
        : 'nobody lives here');
      td.colSpan = 3;
      td.style.color = '#8f959f';
      tr.appendChild(td);
      roll.appendChild(tr);
    }
    for (const p of folk) {
      const tr = el('tr');
      const who = el('td', null, `${p.job}${p.sex === 'woman' ? ' ♀' : ''}`);
      who.title = `#${p.id}`;
      tr.appendChild(who);
      const what = el('td', null, p.doing);
      what.style.textAlign = 'left';
      what.style.color = '#cfcabc';
      // A hand that has written off spots it could not reach is the one row
      // on this page that is a PROBLEM, and it says so where it happens.
      if (p.stuck > 0) {
        what.append(el('span', null,
          ` · gave up on ${p.stuck} spot${p.stuck > 1 ? 's' : ''}`));
        what.lastChild.style.color = '#d4766a';
      }
      tr.appendChild(what);
      tr.appendChild(el('td', null, p.brought ? String(p.brought) : '—'));
      roll.appendChild(tr);
    }
    // ...and it says when it is not the whole village. Only eight settlements
    // have live inhabitants at once, so a roll of two in a village of eleven
    // is the map's limit and not a village that has lost nine people, and a
    // book that did not say so would be lying by omission.
    const short = Math.max(0, (v.souls ?? 0) - folk.length);
    this.main.appendChild(el('div', 'alm-rollhead', folk.length
      ? `${folk.length} on the ground${short
        ? ` · ${short} more live here, too far off to be standing in it` : ''}`
      : 'who is here'));
    this.main.appendChild(roll);

    const plots = el('div', 'alm-plots');
    const h = v.hist ?? [];
    plots.append(
      plot('souls', h, (r) => r[1], '#7fc46a'),
      plot('beds', h, (r) => r[2], '#6fa8dc'),
      plot('roofs', h, (r) => r[3], '#c9a227'),
      plot('purse', h, (r) => r[4], '#d8b04a'),
      plot('taken over the counter, all told', h, (r) => r[5], '#b98cd6'),
      plot('takings a day', h.map((r, i) => (i
        ? [r[0], r[5] - h[i - 1][5] - (r[6] - h[i - 1][6])] : [r[0], 0])),
      (r) => r[1], '#e0866a'),
    );
    this.main.appendChild(plots);
  }

  _renderSide() {
    const d = this.data;
    const v = d.villages.find((x) => x.key === this.pick);
    this.side.textContent = '';

    const map = el('div', 'alm-map');
    if (d.map) {
      const cv = document.createElement('canvas');
      cv.width = d.map.width; cv.height = d.map.height;
      cv.getContext('2d').drawImage(d.map, 0, 0);
      map.appendChild(cv);
    }
    const svg = svgEl('svg', { viewBox: '0 0 200 100', preserveAspectRatio: 'none' });
    for (const s of d.villages) {
      const p = s.map;
      const on = s.key === this.pick;
      const dot = svgEl('circle', {
        cx: (p.x * 200).toFixed(2), cy: (p.y * 100).toFixed(2),
        r: on ? 3.4 : 2, fill: on ? '#e8c05a' : '#f2efe6',
        stroke: '#15171b', 'stroke-width': 0.9, style: 'cursor:pointer',
      });
      dot.addEventListener('click', () => { this.pick = s.key; this.render(); });
      const t = svgEl('title');
      t.textContent = s.name;
      dot.appendChild(t);
      svg.appendChild(dot);
      if (on) {
        svg.appendChild(svgEl('circle', {
          cx: (p.x * 200).toFixed(2), cy: (p.y * 100).toFixed(2), r: 7,
          fill: 'none', stroke: '#e8c05a', 'stroke-width': 1, opacity: 0.8,
        }));
      }
    }
    if (d.you) {
      // a cross, not a dot: you are not a settlement and should not read as one
      const x = d.you.x * 200, y = d.you.y * 100;
      for (const [a, b, c, e2] of [[x - 4, y, x + 4, y], [x, y - 4, x, y + 4]]) {
        svg.appendChild(svgEl('line', { x1: a, y1: b, x2: c, y2: e2,
          stroke: '#63d2ff', 'stroke-width': 1.4 }));
      }
    }
    map.appendChild(svg);
    this.side.appendChild(map);
    this.side.appendChild(el('div', 'alm-cap',
      v ? `${v.name} is ringed · the cross is you · click a dot to read it`
        : 'click a dot to read it'));

    if (v?.near?.length) {
      const near = el('div', 'alm-near');
      near.appendChild(el('b', null, 'nearest neighbours'));
      for (const n of v.near) {
        const row = el('div');
        row.append(el('span', null, n.name), el('span', null, `${n.away} away`));
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          const hit = d.villages.find((x) => x.name === n.name);
          if (hit) { this.pick = hit.key; this.render(); }
        });
        near.appendChild(row);
      }
      this.side.appendChild(near);
    }

    // WHAT THE VILLAGE ITSELF BROUGHT IN, and the one list on this page you
    // can click INTO. The shelf below says what is standing in the shop; this
    // says whether anybody is still fetching it, which is a different
    // question and the one you ask to know if a village is getting anywhere.
    // "Four hundred logs on the shelf" is a warehouse; "forty logs a day" is
    // a woodcutter, and only the second one can fall to nothing while you are
    // not looking.
    if (v) {
      const got = harvestTotals(v.hist);
      const box = el('div', 'alm-near alm-got');
      let chart = null;
      const all = got.reduce((n, g) => n + g.count, 0);
      box.appendChild(el('b', null, got.length
        ? `gathered — ${got.length} kinds, ${all} things`
        : 'gathered'));
      if (!got.length) {
        const row = el('div');
        row.style.cursor = 'default';
        row.append(el('em', null, 'nothing yet — nobody is out working'),
          el('span', null, ''));
        box.appendChild(row);
      } else {
        // ...and SAY that you can, when there is more than one thing to
        // choose between. The plot has always followed the row you pick; what
        // it never did was admit it, so it read as a graph permanently welded
        // to whatever the village had most of.
        if (got.length > 1) {
          box.appendChild(el('small', 'alm-tip', 'pick one to plot it'));
        }
        // A village that has never gathered what you last clicked shows its
        // own biggest instead, rather than an empty plot with a name on it —
        // but what you clicked is NOT forgotten, so walking down the list of
        // settlements looking at everybody's wool gets you everybody's wool
        // and not whatever each of them happens to have most of.
        const shown = got.some((g) => g.id === this.item) ? this.item : got[0].id;
        for (const g of got) {
          const row = el('div', g.id === shown ? 'alm-pick' : null);
          const icon = el('i');
          paintIcon(icon, this.url, g.id);
          row.append(icon, el('em', null, itemName(g.id)),
            el('span', null, `${g.count}`));
          row.addEventListener('click', () => { this.item = g.id; this.render(); });
          box.appendChild(row);
        }
        chart = plot(`${itemName(shown)} a day`,
          harvestSeries(v.hist, shown), (r) => r[1], '#c98f4a');
      }
      this.side.appendChild(box);
      if (chart) this.side.appendChild(chart);
    }

    // THE WHOLE SHELF. This used to be handed the first six rows, which for a
    // well-stocked village is a third of the shop — and the one thing a book
    // about villages you are not standing in is FOR is knowing whether it is
    // worth the walk. Everything the counter would sell you is here, with what
    // it costs, what there is of it, and what the till has taken today.
    if (v?.shelf?.length) {
      const shop = el('div', 'alm-near');
      const n = v.shelf.reduce((k, r) => k + (r.count || 0), 0);
      shop.appendChild(el('b', null,
        `on the shelf — ${v.shelf.length} kinds, ${n} things`));
      for (const r of v.shelf) {
        const row = el('div');
        row.append(el('span', null, r.id.replace(/_/g, ' ')),
          el('span', null, `${r.count} · ${r.price}c`));
        shop.appendChild(row);
      }
      if (v.till && (v.till.in || v.till.out)) {
        const row = el('div');
        row.append(el('span', null, 'over the counter'),
          el('span', null, `+${v.till.in} / -${v.till.out}`));
        shop.appendChild(row);
      }
      this.side.appendChild(shop);
    } else if (v) {
      const shop = el('div', 'alm-near');
      shop.appendChild(el('b', null, 'on the shelf'));
      const row = el('div');
      row.append(el('span', null, 'nothing — no counter, or bare'),
        el('span', null, ''));
      shop.appendChild(row);
      this.side.appendChild(shop);
    }
  }
}

export default Almanac;
