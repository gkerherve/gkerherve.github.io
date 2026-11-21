// artui.js — choosing what hangs in a frame.
//
// A painting is one block id per facing and the picture is an index resolved
// per cell (see ART in cubemesher.js), so "which drawing" is a choice the
// player makes about a CELL rather than a different block they place. This is
// the panel that lets them make it: right-click a frame with an empty hand and
// pick from the wall of pictures.
//
// The thumbnails are the atlas itself, scaled up with nearest-neighbour — the
// same trick every other icon in this game uses, and the reason a picture in
// the panel is exactly the picture on the wall rather than an artist's
// impression of it.

import { ATLAS } from './textures.js';

const CSS = `
.art-root { position: fixed; inset: 0; z-index: 42; display: none;
  align-items: center; justify-content: center; background: rgba(6,8,12,.62);
  font: 13px/1.45 system-ui, sans-serif; color: #e8e4da; }
.art-root.art-open { display: flex; }
.art-panel { width: min(560px, 92vw); background: #1b1d22;
  border: 2px solid #34383f; border-radius: 8px;
  box-shadow: 0 18px 50px rgba(0,0,0,.55); padding: 14px 16px 16px; }
.art-head { display: flex; align-items: baseline; gap: 10px;
  margin-bottom: 12px; }
.art-head b { font-size: 15px; letter-spacing: .02em; }
.art-head span { color: #9aa0aa; font-size: 12px; }
.art-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.art-cell { border: 2px solid #34383f; border-radius: 6px; padding: 6px;
  background: #24272d; cursor: pointer; text-align: center; }
.art-cell:hover { border-color: #6f778a; background: #2c3037; }
.art-cell.art-on { border-color: #d8b04a; }
.art-cell i { display: block; width: 100%; aspect-ratio: 1; margin-bottom: 5px;
  image-rendering: pixelated; background-repeat: no-repeat; }
.art-cell b { display: block; font-weight: 500; font-size: 11px; color: #cfcabc; }
.art-foot { margin-top: 12px; color: #8c919b; font-size: 11px; }
`;

export class ArtUI {
  // `art` is the ART table out of cubemesher; `pictures` the indices a player
  // may choose between (the bay badges are not among them).
  constructor({ art, pictures, atlasImage, onPick, onClose } = {}) {
    this.art = art ?? [];
    this.pictures = pictures ?? [];
    this.onPick = onPick;
    this.onClose = onClose;
    this.cell = null;
    this.open_ = false;
    this.url = atlasImage?.toDataURL ? atlasImage.toDataURL() : (atlasImage?.src ?? '');

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'art-root';
    this.root.innerHTML = `<div class="art-panel">
      <div class="art-head"><b>what hangs here</b><span>click a picture</span></div>
      <div class="art-grid"></div>
      <div class="art-foot">escape closes &middot; the frame keeps what you choose</div>
    </div>`;
    document.body.appendChild(this.root);
    this.grid = this.root.querySelector('.art-grid');
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this._onKey = (e) => {
      if (!this.open_) return;
      if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') {
        e.preventDefault(); e.stopPropagation(); this.close();
      }
    };
  }

  // The atlas is one image; a tile is a window onto it. The percentage in
  // background-position aligns the same fraction of the IMAGE with that
  // fraction of the box, which is why it is (c / (COLS - 1)) and not -c * 100%
  // — the obvious formula puts every thumbnail on the wrong tile, and on a
  // 4-column atlas it puts most of them off the edge entirely.
  _paint(el, tile) {
    const { COLS, ROWS } = ATLAS;
    const c = tile % COLS, r = (tile / COLS) | 0;
    el.style.backgroundImage = `url(${this.url})`;
    el.style.backgroundSize = `${COLS * 100}% ${ROWS * 100}%`;
    el.style.backgroundPosition =
      `${(c / (COLS - 1)) * 100}% ${(r / (ROWS - 1)) * 100}%`;
  }

  open(cell, current) {
    this.cell = cell;
    this.open_ = true;
    this.grid.textContent = '';
    for (const i of this.pictures) {
      const a = this.art[i];
      if (!a) continue;
      const b = document.createElement('div');
      b.className = 'art-cell' + (i === current ? ' art-on' : '');
      const ico = document.createElement('i');
      this._paint(ico, a.tile);
      const nm = document.createElement('b');
      nm.textContent = a.name;
      b.append(ico, nm);
      b.addEventListener('click', () => { this.onPick?.(this.cell, i); this.close(); });
      this.grid.appendChild(b);
    }
    this.root.classList.add('art-open');
    document.addEventListener('keydown', this._onKey, true);
    return true;
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    this.root.classList.remove('art-open');
    document.removeEventListener('keydown', this._onKey, true);
    this.onClose?.();
  }

  isOpen() { return this.open_; }
}

export default ArtUI;
