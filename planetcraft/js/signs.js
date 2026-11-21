// signs.js — a board on a post with words on it.
//
// The block (SIGN_BASE + facing, see cubesphere.js) is a post and a plank;
// the WORDS are not in the block, because a voxel atlas cannot spell. They
// are kept here per cell, the way a painting's picture is kept by main.js,
// lettered onto a canvas and hung on the board as a quad — the same trick
// the village name boards use — and written down with the world, sent over
// the wire, and swept away when the post is pulled up.
//
// The card for writing on one is here too: four lines of fifteen, like the
// one everybody already knows. It opens the moment a sign is planted and
// again on a bare hand, and it gives the keyboard back when it closes.
import * as THREE from 'three';
import * as CS from './cubesphere.js';
import * as flatten from './flatten.js';

export const SIGN_LINES = 4;
export const SIGN_COLS = 15;
const MAX_TEXT = 80;                     // what the server keeps, per cell

// the board's face, in the cell: see signBoxes in cubemesher.js
const BOARD_W = 0.78, BOARD_H = 0.38;    // the quad
const BOARD_UP = 0.25;                   // the board's middle, above the cell's
const BOARD_OUT = 0.04 + 0.012;          // its face, and a hair proud of it
const STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const CSS = `
.sgn-root { position: fixed; inset: 0; z-index: 46; display: none;
  align-items: center; justify-content: center; background: rgba(6,8,12,.55);
  font: 13px/1.5 system-ui, sans-serif; color: #e8e4da; }
.sgn-root.sgn-open { display: flex; }
.sgn-root, .sgn-root * { box-sizing: border-box; }
.sgn-panel { width: min(360px, 94vw); background: #191b20;
  border: 2px solid #35393f; border-radius: 9px; padding: 14px 16px 12px;
  box-shadow: 0 22px 60px rgba(0,0,0,.6); }
.sgn-panel b { display: block; color: #fff; font-size: 15px; margin-bottom: 2px; }
.sgn-panel p { margin: 0 0 10px; opacity: .65; font-size: 12px; }
.sgn-panel textarea { width: 100%; height: 118px; resize: none;
  background: #d9b77a; color: #2a1c10; border: 3px solid #6b4a25;
  border-radius: 4px; padding: 8px 10px; text-align: center;
  font: 700 17px/1.45 ui-monospace, Menlo, Consolas, monospace; outline: none; }
.sgn-panel textarea:focus { border-color: #d8b04a; }
.sgn-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.sgn-row button { background: #2a2e36; color: #e8e4da; border: 1px solid #454a54;
  border-radius: 5px; padding: 6px 14px; font: inherit; cursor: pointer; }
.sgn-row button.sgn-go { background: #d8b04a; color: #1a1408; border-color: #d8b04a;
  font-weight: 700; }
`;

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

// Four lines of fifteen, whatever was typed or arrived: the board is only so
// big, and a note that runs off it is a note nobody can read.
export function tidySign(text) {
  return String(text ?? '').replace(/\r/g, '').split('\n')
    .slice(0, SIGN_LINES).map((l) => l.slice(0, SIGN_COLS)).join('\n')
    .replace(/\n+$/, '').slice(0, MAX_TEXT);
}

// The lettering. BLACK ON YELLOW, and the yellow is painted: the first pass
// drew the letters straight onto the board's own plank tile, which is a
// wood grain, and dark ink on wood grain at the size a sign is read from is
// a smudge. An opaque painted board with a dark frame is the same answer
// the village name boards give, and it reads from across a street. The
// size comes off the longest line, so a note in capitals is not a note cut
// in half; the canvas is big enough that the letters are crisp up close.
function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3b2a17';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f2cf4a';
  g.fillRect(10, 10, c.width - 20, c.height - 20);
  const lines = text.split('\n');
  g.fillStyle = '#111111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 52;
  const font = (px) => `700 ${px}px ui-sans-serif, system-ui, Helvetica, Arial, sans-serif`;
  g.font = font(size);
  const widest = Math.max(1, ...lines.map((l) => g.measureText(l).width));
  if (widest > c.width - 44) size = Math.max(18, Math.floor(size * (c.width - 44) / widest));
  g.font = font(size);
  const gap = (c.height - 24) / SIGN_LINES;
  const top = (c.height - gap * lines.length) / 2 + gap / 2;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, top + i * gap));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // no mipmaps: a board a few blocks off was being sampled from a blurred
  // level and the letters swam
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

export class Signs {
  // `group`: where the lettering meshes go (main.js's sign group, so they
  // ride the planet); `planet()`: the world, asked fresh every time because
  // it is replaced on every load; `onWrite(cell, text)`: the wire.
  constructor({ group, planet, onWrite = null, onClose = null }) {
    this.group = group;
    this.planet = planet;
    this.onWrite = onWrite;
    this.onClose = onClose;
    this.texts = new Map();       // "f,u,v,h" -> text
    this.meshes = new Map();      // "f,u,v,h" -> Mesh
    this.open_ = false;
    this.cell = null;
    this.sweepIn = 0;
    this._buildCard();
  }

  // ---- the record ------------------------------------------------------------

  get(key) { return this.texts.get(key) ?? ''; }

  // Write a sign. `quiet` is for text that arrived from a save or the wire —
  // it must not go straight back out again.
  set(key, text, { quiet = false } = {}) {
    const t = tidySign(text);
    if (t) this.texts.set(key, t); else this.texts.delete(key);
    this._hang(key);
    if (!quiet) this.onWrite?.(key, t);
  }

  // The post is gone: so are the words.
  forget(key) {
    this.texts.delete(key);
    this._drop(key);
  }

  // Every sign in the world, for the save. Null when there are none, which
  // is most worlds.
  state() {
    return this.texts.size ? Object.fromEntries(this.texts) : null;
  }

  // ...and a whole map back, off a save or a welcome.
  load(map) {
    for (const [key, text] of Object.entries(map ?? {})) {
      if (typeof text !== 'string') continue;
      const t = tidySign(text);
      if (!t) continue;
      this.texts.set(key, t);
      this._hang(key);
    }
  }

  // A new world: nothing on it yet.
  clear() {
    for (const key of [...this.meshes.keys()]) this._drop(key);
    this.texts.clear();
  }

  // Signs pulled up by somebody ELSE come in as plain edits and never pass
  // through setBlock's hook, so once a second the record is checked against
  // the world and a board with no post under it is taken down.
  sweep(dt) {
    if ((this.sweepIn -= dt) > 0) return;
    this.sweepIn = 1;
    const planet = this.planet();
    if (!planet) return;
    for (const key of [...this.texts.keys()]) {
      const [f, u, v, h] = key.split(',').map(Number);
      const b = planet.get(f, u, v, h);
      if (!CS.isSign?.(b)) this.forget(key);
      else if (!this.meshes.has(key)) this._hang(key);
    }
  }

  // ---- the lettering ---------------------------------------------------------

  _drop(key) {
    const m = this.meshes.get(key);
    if (!m) return;
    this.meshes.delete(key);
    this.group?.remove(m);
    m.geometry?.dispose?.();
    m.material?.map?.dispose?.();
    m.material?.dispose?.();
  }

  _hang(key) {
    this._drop(key);
    const text = this.texts.get(key);
    const planet = this.planet();
    if (!text || !planet || !this.group) return;
    const [f, u, v, h] = key.split(',').map(Number);
    const block = planet.get(f, u, v, h);
    if (!CS.isSign?.(block)) return;
    const facing = CS.signFacing(block);
    const [du, dv] = STEP[facing];
    // the board's frame: up out of the planet, out toward the reader, and
    // the reader's right — which is up x out, for somebody stood on the out
    // side looking back at the board
    const c0 = CS.cellCenterWorld(f, u, v, h);
    const c1 = CS.cellCenterWorld(f, u + du, v + dv, h);
    const pos = new THREE.Vector3(c0[0], c0[1], c0[2]);
    const up = pos.clone().normalize();
    const out = new THREE.Vector3(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
    out.addScaledVector(up, -out.dot(up));
    if (out.lengthSq() < 1e-9) return;
    out.normalize();
    const right = new THREE.Vector3().crossVectors(up, out).normalize();
    const centre = pos.clone().addScaledVector(up, BOARD_UP)
      .addScaledVector(out, BOARD_OUT);
    // WORLD coordinates baked into the geometry, subdivided, through the same
    // flatten shader the ground goes through — the name boards' argument, see
    // buildVillageSigns in main.js. A board this small barely needs the
    // subdivision, and it costs eight triangles.
    const SEG = 4, ROWS = 2;
    const verts = new Float32Array((SEG + 1) * (ROWS + 1) * 3);
    const uvs = new Float32Array((SEG + 1) * (ROWS + 1) * 2);
    const idx = [];
    for (let j = 0; j <= ROWS; j++) {
      const b = (j / ROWS) * 2 - 1;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * 2 - 1;
        const k = j * (SEG + 1) + i;
        verts[k * 3] = centre.x + right.x * (BOARD_W / 2) * a + up.x * (BOARD_H / 2) * b;
        verts[k * 3 + 1] = centre.y + right.y * (BOARD_W / 2) * a + up.y * (BOARD_H / 2) * b;
        verts[k * 3 + 2] = centre.z + right.z * (BOARD_W / 2) * a + up.z * (BOARD_H / 2) * b;
        uvs[k * 2] = i / SEG;
        uvs[k * 2 + 1] = j / ROWS;
        if (i < SEG && j < ROWS) {
          const n = k + SEG + 1;
          idx.push(k, k + 1, n + 1, k, n + 1, n);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    // FRONT SIDE ONLY. The triangles wind counter-clockwise for somebody on
    // the `out` side, so that is the face that draws; seen from behind the
    // board's own plank hides it, and a two-sided quad would have shown the
    // words mirrored through any gap. The board is opaque, so no blending.
    const mat = new THREE.MeshBasicMaterial({
      map: signTexture(text), side: THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    flatten.flattenMaterial(mat);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    this.meshes.set(key, m);
    this.group.add(m);
  }

  // ---- the card --------------------------------------------------------------

  _buildCard() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div', 'sgn-root');
    const panel = el('div', 'sgn-panel');
    panel.append(el('b', null, 'write on the sign'),
      el('p', null, `${SIGN_LINES} lines of ${SIGN_COLS} · Enter for a new line · `
        + 'Done, or ctrl+Enter, writes it · Escape leaves it as it was'));
    this.box = document.createElement('textarea');
    this.box.rows = SIGN_LINES;
    this.box.maxLength = MAX_TEXT;
    this.box.spellcheck = false;
    panel.appendChild(this.box);
    const row = el('div', 'sgn-row');
    const no = el('button', null, 'Cancel');
    const go = el('button', 'sgn-go', 'Done');
    row.append(no, go);
    panel.appendChild(row);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
    no.addEventListener('click', () => this.close(false));
    go.addEventListener('click', () => this.close(true));
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close(true);
    });
    // The box swallows its keys — W A S D in a note must not walk — and
    // keeps the note to its four lines as it is typed.
    this.box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(false); return; }
      if (e.key === 'Enter') {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.close(true); return; }
        const lines = this.box.value.split('\n').length;
        if (lines >= SIGN_LINES) e.preventDefault();
      }
    });
    this.box.addEventListener('input', () => {
      const lines = this.box.value.replace(/\r/g, '').split('\n')
        .slice(0, SIGN_LINES).map((l) => l.slice(0, SIGN_COLS));
      const want = lines.join('\n');
      if (want !== this.box.value) this.box.value = want;
    });
  }

  open(cell) {
    const [f, u, v, h] = cell;
    this.cell = cell;
    this.key = `${f},${u},${v},${h}`;
    this.box.value = this.get(this.key);
    this.open_ = true;
    this.root.classList.add('sgn-open');
    setTimeout(() => this.box.focus(), 30);
    return true;
  }

  close(write) {
    if (!this.open_) return;
    this.open_ = false;
    if (write) {
      const t = tidySign(this.box.value);
      if (t !== this.get(this.key)) this.set(this.key, t);
    }
    // the keyboard goes back to the game — a box that kept focus under a
    // closed card ate every key after it
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.classList.remove('sgn-open');
    this.onClose?.();
  }

  isOpen() { return this.open_; }
}

export default Signs;
