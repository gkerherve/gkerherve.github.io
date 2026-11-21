// hud.js — the survival HUD: hearts, hunger, breath, and the mode chip.
//
// Self-contained the way craftui.js is: it builds its own DOM and injects its
// own <style>, so index.html and main.js do not have to know it exists. Call
// the setters, call show(); there is nothing to construct and nothing to tick.
//
// The icons are real pixel art, not emoji and not fonts: one 9x9 grid per
// frame painted into a single strip canvas, turned into one data URL, and
// every icon is that strip offset with `background-position`. That is the same
// trick craftui.js uses for item tiles, for the same reasons — one decode for
// the whole HUD, and `image-rendering: pixelated` keeps the upscale crisp so
// the hearts sit in the same visual family as the block atlas.
//
// Everything that moves is a CSS animation rather than a per-frame JS update,
// because the HUD has to keep shaking while the render loop is busy and
// because a HUD that costs a frame callback is a HUD that costs 1% of the
// frame budget forever.
//
// The module is import-safe with no DOM at all (node tests, headless tooling):
// the state lives in plain objects and the DOM is built lazily on first use.

const ART = 9;            // pixel-art size of one icon, in art pixels
const SCALE = 2;          // css upscale: 18 real pixels per icon
const ICON = ART * SCALE;

// Live-editable knobs. `low` is the fraction of max health at which the
// hearts start their slow pulse; `hideInCreative` is why creative shows a chip
// and nothing else — you cannot die, so a full row of hearts is just noise.
export const HUD_TUNING = {
  low: 0.3,
  flashDecay: 0.55,       // seconds for the red screen vignette to fade
  hitShake: 0.34,         // seconds of heart shake per hit
  hideInCreative: true,
  maxIcons: 10,           // hearts/hunger/bubbles never exceed one row of ten
};

// ---------------------------------------------------------------------------
// pixel art
//
// One character per art pixel. '.' is transparent. Keeping the frames as text
// is not cuteness: it is the only form in which a 9x9 heart can be reviewed by
// eye in a diff.

const PAL = {
  o: '#2b1013',   // outline, near-black with a red bias
  r: '#d8382c',   // heart body
  h: '#ff9384',   // heart highlight
  e: '#3d2429',   // empty container
  n: '#c8813f',   // meat, lit
  m: '#93542a',   // meat, shade
  b: '#e6dfcb',   // bone
  w: '#f2fbff',   // bubble highlight
  c: '#5fb6ea',   // bubble body
};

const HEART = [
  '.oo...oo.',
  'ohhrorrro',
  'ohrrrrrro',
  'orrrrrrro',
  '.orrrrro.',
  '..orrro..',
  '...oro...',
  '....o....',
  '.........',
];

// meat on the bone, with the bone wide enough to read at 18 real pixels — a
// one-pixel bone looked like a lollipop stick
const FOOD = [
  '..ooooo..',
  '.onnnnno.',
  'onnmmmnno',
  'onmmmmmno',
  '.onmmmno.',
  '..obbo...',
  '.obbbo...',
  'obbbo....',
  '.ooo.....',
];

const BUBBLE = [
  '..ooooo..',
  '.owwwcco.',
  'owwccccco',
  'occccccco',
  'occccccco',
  'occccccco',
  '.occccco.',
  '..ooooo..',
  '.........',
];

// the one that just burst: an empty socket, the same idea as an empty heart
const POP = [
  '.........',
  '...ooo...',
  '..o...o..',
  '..o...o..',
  '...ooo...',
  '.........',
  '.........',
  '.........',
  '.........',
];

// An empty container is the same silhouette with the fill swapped out, so the
// hearts line up pixel for pixel whatever their state — which is what stops
// the row from twitching as it drains.
const hollow = (grid) => grid.map((row) =>
  row.replace(/[rhnmbwc]/g, 'e'));

// Half is the left half of the full frame over the empty one. Column 4 is the
// centre of a 9-wide icon, so 0..3 stay lit.
const halved = (grid) => grid.map((row) => {
  let out = '';
  for (let x = 0; x < row.length; x++) {
    const ch = row[x];
    out += (x >= 4 && ch !== '.' && ch !== 'o') ? 'e' : ch;
  }
  return out;
});

// frame index -> grid. Order is load-bearing: FRAME below indexes into it.
const FRAMES = [
  hollow(HEART), halved(HEART), HEART,
  hollow(FOOD), halved(FOOD), FOOD,
  BUBBLE, POP,
];

const FRAME = {
  heart: 0, heartHalf: 1, heartFull: 2,
  food: 3, foodHalf: 4, foodFull: 5,
  air: 6, airPop: 7,
};

function buildSheet() {
  const cv = document.createElement('canvas');
  cv.width = ART * FRAMES.length;
  cv.height = ART;
  const g = cv.getContext('2d');
  FRAMES.forEach((grid, f) => {
    const ox = f * ART;
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const col = PAL[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(ox + x, y, 1, 1);
      }
    }
  });
  return cv.toDataURL();
}

// ---------------------------------------------------------------------------
// stylesheet
//
// The rows sit above the hotbar (fixed, bottom 18px, ~54px tall) and are the
// same 420px wide, so hearts land under the left of the hotbar and hunger
// under its right — the arrangement everyone already reads without being
// told. combat.js's ammo block is bottom-right and its own health bar hides
// itself while these hearts are up, so nothing collides.

const CSS = `
.kpx-root {
  position: fixed; left: 50%; bottom: 78px; transform: translateX(-50%);
  z-index: 22; width: 420px; max-width: calc(100vw - 24px);
  display: none; flex-direction: column; align-items: stretch; gap: 3px;
  pointer-events: none; user-select: none;
  font: 11px "Segoe UI", system-ui, sans-serif; color: #dbe3f2;
  --kpx-icon: ${ICON}px;
}
.kpx-root.kpx-on { display: flex; }
.kpx-row { display: flex; gap: 1px; min-height: var(--kpx-icon); }
.kpx-row.kpx-right { justify-content: flex-end; }
.kpx-row.kpx-off { display: none; }
.kpx-i {
  width: var(--kpx-icon); height: var(--kpx-icon); flex: none;
  background-repeat: no-repeat;
  background-size: ${FRAMES.length * 100}% 100%;
  image-rendering: pixelated;
  filter: drop-shadow(0 1px 0 rgba(0,0,0,.75));
}
.kpx-mid { display: flex; justify-content: space-between; align-items: flex-end; }
.kpx-chip {
  align-self: flex-start; padding: 1px 7px 2px; border-radius: 3px;
  letter-spacing: 1.4px; text-transform: uppercase; font-size: 10px;
  background: rgba(10,14,24,.6); border: 1px solid rgba(255,255,255,.18);
  color: #b9c6de;
}
.kpx-root.kpx-creative .kpx-chip {
  color: #9fd8ff; border-color: rgba(120,190,255,.45);
  background: rgba(14,34,58,.66);
}
.kpx-vig {
  position: fixed; inset: 0; z-index: 21; opacity: 0; pointer-events: none;
  background: radial-gradient(ellipse at center,
    rgba(150,0,0,0) 42%, rgba(190,14,14,.82) 100%);
  transition: opacity ${HUD_TUNING.flashDecay}s ease-out;
}

/* low health: a slow swell, so the row is doing something in the corner of
   your eye without ever being the thing you are looking at */
@keyframes kpx-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.16); }
}
.kpx-root.kpx-low .kpx-hp .kpx-i {
  animation: kpx-pulse 1.05s ease-in-out infinite;
}

/* a hit: shake, and blow the hearts out to white-hot red for two frames.
   steps() keeps it jerky — a smooth shake reads as a wobble, not a blow. */
@keyframes kpx-shake {
  0%   { transform: translate(0, 0)     scale(1.22); filter: brightness(2.4) saturate(1.6); }
  25%  { transform: translate(-2px, 1px) scale(1.1); filter: brightness(1.8); }
  50%  { transform: translate(2px, -1px) scale(1.14); filter: brightness(1.4); }
  75%  { transform: translate(-1px, -1px) scale(1.04); }
  100% { transform: translate(0, 0)     scale(1); }
}
.kpx-root.kpx-hit .kpx-hp .kpx-i {
  animation: kpx-shake ${HUD_TUNING.hitShake}s steps(5, end);
}
/* the wave runs outward from the first heart, which is where the eye is */
.kpx-root.kpx-hit .kpx-hp .kpx-i:nth-child(n+4) { animation-delay: .02s; }
.kpx-root.kpx-hit .kpx-hp .kpx-i:nth-child(n+8) { animation-delay: .04s; }

/* dead: the row goes cold and stops moving entirely */
.kpx-root.kpx-dead .kpx-i {
  animation: none !important;
  filter: grayscale(1) brightness(.5) drop-shadow(0 1px 0 rgba(0,0,0,.8));
}
.kpx-root.kpx-dead .kpx-chip { color: #8f9099; }

@media (max-width: 520px) {
  .kpx-root { width: calc(100vw - 20px); --kpx-icon: ${ART * 1.5}px; }
}
`;

// ---------------------------------------------------------------------------

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class SurvivalHUD {
  constructor() {
    // state first, so every setter works before (and without) any DOM
    this.max = 20;
    this.hp = 20;
    this.hunger = 20;
    this.hungerMax = 20;
    this.air = 1;
    this.mode = 'survival';
    this.visible = false;
    this.built = false;
    this.root = null;
    this._hungerSeen = false;   // no hunger row until somebody supplies one
    this._hitTimer = 0;
    this._observer = null;
  }

  // --- lifecycle ---------------------------------------------------------

  // Lazily built: importing this module must not touch the document, both so
  // node can import it and so a page that never enters play mode never pays
  // for the icons.
  _build() {
    if (this.built) return true;
    if (typeof document === 'undefined' || !document.body) return false;
    this.built = true;

    if (!document.getElementById('kpx-style')) {
      const s = el('style');
      s.id = 'kpx-style';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.url = buildSheet();

    this.root = el('div', 'kpx-root');
    this.chip = el('div', 'kpx-chip', 'survival');
    this.airRow = el('div', 'kpx-row kpx-air kpx-right kpx-off');
    const mid = el('div', 'kpx-mid');
    this.hpRow = el('div', 'kpx-row kpx-hp');
    this.foodRow = el('div', 'kpx-row kpx-food kpx-right');
    mid.append(this.hpRow, this.foodRow);
    this.root.append(this.chip, this.airRow, mid);
    document.body.appendChild(this.root);

    // the vignette is a sibling of the root, not a child: it covers the whole
    // screen and the root is a 420px strip
    this.vig = el('div', 'kpx-vig');
    document.body.appendChild(this.vig);

    this._syncAll();
    return true;
  }

  show(on = true) {
    this.visible = !!on;
    if (!this._build()) return;
    this.root.classList.toggle('kpx-on', this.visible);
    if (!this.visible) this.vig.style.opacity = '0';
  }

  hide() { this.show(false); }
  isVisible() { return this.visible; }

  // Follow main.js's existing play-mode marker instead of asking main.js to
  // call us: enterPlay()/exitPlay() already add and remove `playing` on the
  // body, and touch.js already reads it, so it is a marker the project keeps
  // honest. An explicit show()/hide() still wins the next time it is called;
  // this only reacts to the class changing.
  autoFollow(className = 'playing') {
    if (this._observer || typeof document === 'undefined') return;
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    const sync = () => this.show(document.body.classList.contains(className));
    this._observer = new MutationObserver(sync);
    this._observer.observe(document.body, {
      attributes: true, attributeFilter: ['class'],
    });
    sync();
  }

  destroy() {
    this._observer?.disconnect();
    this._observer = null;
    this.root?.remove();
    this.vig?.remove();
    this.built = false;
    this.root = null;
  }

  // --- setters -----------------------------------------------------------

  setMaxHealth(max) {
    const m = Math.max(2, Math.round(max) || 20);
    if (m === this.max) return;
    this.max = m;
    this.hp = Math.min(this.hp, m);
    if (this.built) { this._syncHearts(true); }
  }

  // The one setter that reacts: a drop shakes the row and flashes the screen,
  // so main.js and combat.js do not have to remember to call damageFlash too.
  setHealth(hp, opts = {}) {
    const v = clamp(Number(hp) || 0, 0, this.max);
    const lost = this.hp - v;
    this.hp = v;
    if (!this.built) return;
    this._syncHearts();
    if (lost > 0.01 && opts.silent !== true) {
      this._hit();
      this.damageFlash(clamp(0.28 + lost / this.max, 0, 1));
    }
    this.root.classList.toggle('kpx-dead', v <= 0);
    this.root.classList.toggle('kpx-low',
      v > 0 && v <= this.max * HUD_TUNING.low);
  }

  // Accepts either 0..1 or 0..max, because half the callers have a fraction
  // and half have a food level, and guessing wrong is a silently empty bar.
  setHunger(value, max = null) {
    this._hungerSeen = true;
    if (max != null) this.hungerMax = Math.max(1, max);
    let v = Number(value) || 0;
    if (max == null && v > 0 && v <= 1 && !Number.isInteger(v)) {
      v *= this.hungerMax;        // a fraction
    }
    this.hunger = clamp(v, 0, this.hungerMax);
    if (this.built) this._syncFood();
  }

  // 0..1 of breath left. Anything at or above 1 hides the row, which is what
  // makes "an air row when you are underwater" a one-line call site.
  setAir(fraction) {
    this.air = clamp(Number(fraction) ?? 1, 0, 1);
    if (this.built) this._syncAir();
  }

  setMode(mode) {
    this.mode = mode === 'creative' ? 'creative' : 'survival';
    if (!this.built) return;
    this.chip.textContent = this.mode;
    this.root.classList.toggle('kpx-creative', this.mode === 'creative');
    this._syncAll();
  }

  // Red vignette at the screen edge. Strength 0..1; repeated hits stack up to
  // full rather than restarting from the same place.
  damageFlash(strength = 0.7) {
    if (!this._build()) return;
    const s = clamp(strength, 0, 1);
    const now = Math.max(Number(this.vig.style.opacity) || 0, s * 0.9);
    // a transition only runs on a CHANGE, so jump to the new value with the
    // transition suppressed, then let it decay
    this.vig.style.transition = 'none';
    this.vig.style.opacity = String(now);
    // force a reflow so the two writes are not coalesced into no change at all
    void this.vig.offsetWidth;
    this.vig.style.transition = `opacity ${HUD_TUNING.flashDecay}s ease-out`;
    this.vig.style.opacity = '0';
  }

  // --- rendering ---------------------------------------------------------

  _icon(frame) {
    const i = el('i', 'kpx-i');
    this._paint(i, frame);
    return i;
  }

  _paint(node, frame) {
    if (node._f === frame) return;      // most frames change nothing
    node._f = frame;
    node.style.backgroundImage = `url(${this.url})`;
    node.style.backgroundPosition =
      `${(frame / (FRAMES.length - 1)) * 100}% 0`;
  }

  _fit(row, n, frame) {
    while (row.childElementCount > n) row.lastChild.remove();
    while (row.childElementCount < n) row.appendChild(this._icon(frame));
  }

  _hidden() {
    return HUD_TUNING.hideInCreative && this.mode === 'creative';
  }

  _syncAll() {
    this._syncHearts(true);
    this._syncFood();
    this._syncAir();
    this.chip.textContent = this.mode;
    this.root.classList.toggle('kpx-creative', this.mode === 'creative');
  }

  _syncHearts(rebuild = false) {
    const hide = this._hidden();
    this.hpRow.classList.toggle('kpx-off', hide);
    if (hide) return;
    const n = Math.min(HUD_TUNING.maxIcons, Math.ceil(this.max / 2));
    if (rebuild || this.hpRow.childElementCount !== n) {
      this._fit(this.hpRow, n, FRAME.heart);
    }
    // Two health points per heart, so a half heart is a real state and not a
    // rounding artefact: 3 hp is one full, one half, the rest empty.
    const per = this.max / n / 2;
    const kids = this.hpRow.children;
    for (let i = 0; i < n; i++) {
      const v = (this.hp - i * 2 * per) / per;
      this._paint(kids[i],
        v >= 1.75 ? FRAME.heartFull
          : v >= 0.5 ? FRAME.heartHalf : FRAME.heart);
    }
  }

  // Hidden until someone actually supplies a hunger level: a row that is
  // permanently full is a lie, and worse than no row at all.
  _syncFood() {
    const hide = this._hidden() || !this._hungerSeen;
    this.foodRow.classList.toggle('kpx-off', hide);
    if (hide) return;
    const n = Math.min(HUD_TUNING.maxIcons, Math.ceil(this.hungerMax / 2));
    if (this.foodRow.childElementCount !== n) {
      this._fit(this.foodRow, n, FRAME.food);
    }
    const per = this.hungerMax / n / 2;
    const kids = this.foodRow.children;
    // right-aligned, so the bar drains toward the middle of the screen the
    // way the hearts drain away from it
    for (let i = 0; i < n; i++) {
      const v = (this.hunger - (n - 1 - i) * 2 * per) / per;
      this._paint(kids[i],
        v >= 1.75 ? FRAME.foodFull : v >= 0.5 ? FRAME.foodHalf : FRAME.food);
    }
  }

  _syncAir() {
    const show = !this._hidden() && this.air < 0.999;
    this.airRow.classList.toggle('kpx-off', !show);
    if (!show) { this._fit(this.airRow, 0, FRAME.air); return; }
    const n = HUD_TUNING.maxIcons;
    this._fit(this.airRow, n, FRAME.air);
    const left = this.air * n;
    const kids = this.airRow.children;
    for (let i = 0; i < n; i++) {
      // bubbles pop from the right, next to the hunger they sit above
      const idx = n - 1 - i;
      this._paint(kids[i], idx < left - 0.35 ? FRAME.air : FRAME.airPop);
    }
    for (let i = 0; i < n; i++) {
      kids[i].style.display = (n - 1 - i) < Math.ceil(left) + 1 ? '' : 'none';
    }
  }

  // restart the shake: an animation only replays if the class actually leaves
  _hit() {
    this.root.classList.remove('kpx-hit');
    void this.root.offsetWidth;
    this.root.classList.add('kpx-hit');
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      this.root?.classList.remove('kpx-hit');
    }, HUD_TUNING.hitShake * 1000 + 60);
  }
}

// ---------------------------------------------------------------------------
// module-level singleton — the API main.js is expected to use

export const hud = new SurvivalHUD();

export const setHealth = (hp, opts) => hud.setHealth(hp, opts);
export const setMaxHealth = (max) => hud.setMaxHealth(max);
export const setHunger = (v, max) => hud.setHunger(v, max);
export const setAir = (v) => hud.setAir(v);
export const setMode = (m) => hud.setMode(m);
export const show = (on = true) => hud.show(on);
export const hide = () => hud.hide();
export const isVisible = () => hud.isVisible();
export const damageFlash = (s) => hud.damageFlash(s);
export const autoFollow = (cls) => hud.autoFollow(cls);

export default hud;
