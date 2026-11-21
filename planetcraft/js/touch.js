// touch.js — on-screen controls so the game is playable on a phone.
//
// Self-contained on purpose, like craftui.js: it builds its own DOM and
// injects its own <style>, so index.html and main.js do not have to know it
// exists. `new TouchControls({ canvas: renderer.domElement })` is enough to
// get a working phone build; passing `keys` and `hooks` replaces the
// synthetic-DOM-event fallback with direct calls. See INTEGRATION-touch.md.
//
// Design notes that are easy to get wrong and expensive to rediscover:
//
// * Every touch is tracked by `identifier`. Walking while looking is the
//   whole point, so nothing here may assume there is one finger — and a
//   finger released outside the element it started on must still clear,
//   which is why touchend/touchcancel are listened for on `document`.
// * There is no full-screen capture layer. The root is pointer-events:none
//   and only the buttons take events; world touches are picked up from a
//   document-level listener and classified by coordinate. That way the
//   hotbar, the HUD links and the crafting panel keep working untouched.
// * The layout is computed in JS, not in media queries, so it can be tested
//   headlessly and so safe-area insets participate in the arithmetic rather
//   than silently pushing a control off the bottom of the screen.

const VERSION = 1;

// key codes we synthesise. player.js reads KeyboardEvent.code, so these are
// the same strings a real keyboard would produce.
export const KEYS = {
  fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------
// capability
// ---------------------------------------------------------------------------

// No user-agent sniffing: a coarse pointer plus a touch-capable navigator is
// the honest question ("can this thing be poked with a finger?"), and a real
// touchstart is the honest answer. Hybrid laptops report a coarse pointer for
// their touchscreen while being driven by a trackpad, so they only get the
// controls once someone actually touches the glass — see `watchForTouch`.
export function coarsePointer() {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(pointer: coarse)').matches ||
      matchMedia('(any-pointer: coarse)').matches;
  } catch { return false; }
}

export function touchCapable() {
  const n = typeof navigator === 'object' ? navigator : null;
  const points = n && typeof n.maxTouchPoints === 'number' ? n.maxTouchPoints : 0;
  const hasEvent = typeof window === 'object' && 'ontouchstart' in window;
  return points > 0 || hasEvent;
}

// true only when the device is plainly a touch device (phone/tablet): coarse
// pointer, touch points, and no fine pointer to contradict it.
export function touchPrimary() {
  if (!touchCapable() || !coarsePointer()) return false;
  if (typeof matchMedia !== 'function') return true;
  try { return !matchMedia('(any-pointer: fine)').matches; } catch { return true; }
}

// ---------------------------------------------------------------------------
// suggested quality profile
// ---------------------------------------------------------------------------

// Phones are roughly an order of magnitude behind a desktop GPU and have no
// thermal headroom, so the profile trades pixels and draw distance — the two
// things that cost the most — before it touches anything the player notices.
// Values are multipliers on the desktop defaults unless the name says px.
export const QUALITY = {
  low: {
    name: 'low',
    pixelRatio: 1,        // renderer.setPixelRatio: 1 physical px per CSS px
    antialias: false,     // MSAA on a 3x panel is the single biggest cost
    viewDistance: 0.5,    // multiplier on WorldView's default viewDist
    fogFar: 0.62,         // pull the fog in with it or you see the cut
    chunkBudgetMs: 2.5,   // per-frame meshing budget (desktop uses 5)
    zombies: 2, animals: 8, birdFlocks: 1, livingVillages: 3,
    clouds: 0.35,
    maxRadius: 156,
  },
  mid: {
    name: 'mid',
    pixelRatio: 1.25,
    antialias: false,
    viewDistance: 0.65,
    fogFar: 0.75,
    chunkBudgetMs: 3,
    zombies: 3, animals: 14, birdFlocks: 2, livingVillages: 4,
    clouds: 0.5,
    maxRadius: 200,
  },
  high: {
    name: 'high',
    pixelRatio: 1.5,
    antialias: false,
    viewDistance: 0.8,
    fogFar: 0.85,
    chunkBudgetMs: 4,
    zombies: 4, animals: 20, birdFlocks: 3, livingVillages: 6,
    clouds: 0.7,
    maxRadius: 400,
  },
};

// World radii the menu offers, and whether a phone can hold them. The cost
// driver is chunk count: S = ceil(pi/2*R/16)*16 columns per face edge, and a
// chunk is 32 columns, so chunks = 6*(S/32)^2 — 96 at r78, 384 at r156, 600
// at r200, 2400 at r400, 9600 at r800.
export const WORLD_SIZES = {
  78:  { chunks: 96,   phone: 'yes' },
  156: { chunks: 384,  phone: 'yes' },
  200: { chunks: 600,  phone: 'recent phones' },
  400: { chunks: 2400, phone: 'tablet only' },
  800: { chunks: 9600, phone: 'no' },
};

// Rough tiering from what the browser will admit to. deviceMemory and
// hardwareConcurrency are both optional and both lie a little, so this only
// has to be right to within one tier — the profile differences are gentle.
export function suggestQuality(hint = {}) {
  const n = typeof navigator === 'object' ? navigator : {};
  const mem = hint.deviceMemory ?? n.deviceMemory ?? 4;
  const cores = hint.cores ?? n.hardwareConcurrency ?? 4;
  const dpr = hint.dpr ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 2);
  const shortEdge = hint.shortEdge ??
    (typeof innerWidth === 'number' ? Math.min(innerWidth, innerHeight) : 360);
  if (mem <= 2 || cores <= 4) return { ...QUALITY.low, dpr };
  if (mem >= 6 && cores >= 8 && shortEdge >= 700) return { ...QUALITY.high, dpr };
  return { ...QUALITY.mid, dpr };
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

// Pure function so it can be asserted on headlessly. Everything is in CSS
// pixels from the top-left, insets already subtracted, and every rect is
// guaranteed to sit inside the viewport for any viewport down to 300x300.
//
// The arrangement, in both orientations:
//
//   stick ring        bottom-left, floating (this is its resting home)
//   action pad        bottom-right, one column: [use] over [jump]
//   utility strip     bottom-centre, one row, sitting above the hotbar
//   hotbar (theirs)   bottom-centre, re-flowed to 44px slots on two rows
//
// Bottom-centre is shared between the strip and the hotbar because the top
// of the screen already belongs to the HUD (top-left) and the minimap plus
// #hud2 (top-right, ~220px tall), and the middle must stay clear for looking.
export function computeLayout(W, H, ins = { l: 0, r: 0, t: 0, b: 0 }, opts = {}) {
  const short = Math.min(W, H);
  const edge = short < 380 ? 8 : 12;
  const gap = short < 380 ? 6 : 8;
  // 44px is the smallest reliable touch target; nothing here goes under it.
  const btn = clamp(Math.round(short * 0.155), 52, 68);
  const small = clamp(Math.round(short * 0.115), 44, 50);
  const ring = clamp(Math.round(short * 0.32), 96, 136);
  const knob = Math.round(ring * 0.44);

  const stripN = opts.stripCount ?? 4;
  const stripW = stripN * small + (stripN - 1) * gap;

  // hotbar: 9 slots of 44 with `gap` between and 8px of panel padding. Give
  // it whichever whole number of columns fits the width we are willing to
  // spend, which is a hard cap in landscape so the stick and pad keep their
  // corners, and near-full width in portrait where the corners are lower.
  // ONE ROW, ALWAYS. The bar is ten slots and the numbers on them are the
  // one thing a thumb never reads — you pick a slot by its picture — so the
  // digits go and the SIZE is solved for instead of picked: whatever fits
  // the width this screen can spare, floored at 24 so an icon stays an
  // icon. Two stacked rows was the thing that ate the bottom of a phone.
  const hbPad = 6;
  const portrait = H >= W;
  // TEN CELLS, not nine. The bar is the nine numbered slots AND the offhand
  // that sits at the left of them, and this counted nine — so the width it
  // handed the CSS was one slot short, the bar wrapped onto a second row, and
  // that second row came up underneath the button strip. Two rows of hotbar
  // with `craft` and `order` printed across the top of them is what a tablet
  // has been showing.
  const hbCells = 10;
  // ...and the offhand's own margin. `.slot.off` is set apart from the nine by
  // ten pixels so the eye reads it as a hand rather than as slot zero — a real
  // ten pixels in the row that this arithmetic did not know about, which is
  // enough on its own to push the last slot onto a second line.
  const hbOff = 10;
  // ...plus the bar's own 1px border either side, which border-box folds into
  // the width and so has to be asked for.
  const hbEdge = 2;
  // What the bar may spend, and then the biggest slot that fits ten of them
  // across it. Landscape leaves the corners to the stick and the buttons —
  // and BOTH leave room for the menu button, which rides at the left end of
  // the same row, just outside the off-hand.
  const menuW = clamp(Math.round(short * 0.115), 40, 46);
  const hbBudget = (portrait
    ? W - ins.l - ins.r - 2 * edge
    : W - ins.l - ins.r - 2 * (ring + 2 * edge) - 24) - menuW - gap;
  const slotFits = (hbBudget - 2 * hbPad - hbOff - hbEdge
    - (hbCells - 1) * gap) / hbCells;
  const slot = clamp(Math.floor(slotFits), 24, 40);
  const cols = hbCells, rows = 1;
  const hbW = cols * slot + (cols - 1) * gap + hbOff + 2 * hbPad + hbEdge;
  const hbH = slot + 2 * hbPad;

  // TWO BUTTONS, NOT FOUR. A phone thumb gets one big context button — tap
  // places the block in hand, tap with somebody under the crosshair hits
  // them, hold digs at whatever is in front — and jump under it, where the
  // thumb rests. Sneak and a separate mine button were the two nobody could
  // find in a fight.
  const bigBtn = clamp(Math.round(short * 0.2), 60, 84);
  const padW = bigBtn, padH = 2 * bigBtn + gap;
  const padL = W - ins.r - edge - padW;
  const padT = H - ins.b - edge - padH;

  // In landscape the hotbar shares the bottom strip with the stick and pad,
  // so it sits at the very bottom; in portrait the corners are already tall,
  // so it is lifted clear of both.
  const hbBottom = portrait
    ? ins.b + edge + Math.max(padH, ring) + gap
    : ins.b + edge;
  const stripBottom = hbBottom + hbH + gap;

  const L = {
    W, H, ins, portrait, edge, gap, btn, small, ring, knob,
    // stick resting centre; the live stick is re-centred under the thumb
    stick: {
      cx: ins.l + edge + ring / 2,
      cy: H - ins.b - edge - ring / 2,
      r: ring / 2,
      maxR: (ring - knob) / 2 + knob * 0.18,   // travel before the knob clips
      dead: 0.16,                              // fraction of maxR
      run: 0.72,                               // magnitude that counts as run
    },
    pad: { x: padL, y: padT, w: padW, h: padH, cell: bigBtn },
    // (clamped to the screen: on a narrow portrait phone nine buttons in a
    // row are wider than the glass — the fan below is what is actually
    // drawn, and it wraps, but this rect is still a promise about bounds)
    strip: {
      x: Math.max(ins.l + edge, Math.round((W - stripW) / 2)), y: H - stripBottom - small,
      w: Math.min(stripW, W - ins.l - ins.r - 2 * edge), h: small, n: stripN,
    },
    // THE MENU RIDES THE BAR'S OWN ROW, at its left end just outside the
    // off-hand — one line of controls instead of a button orbiting the
    // screen. Its fan opens straight UP from it, so the column climbs the
    // free left edge and never crosses the bar.
    //
    // ...and where the bar runs the full width (a phone held upright) there
    // is no "just outside" left: the button sat twenty-six pixels off the
    // left edge of the glass, and with it the only door to crafting, the
    // book and the orders. There it rides the row ABOVE the bar instead.
    menu: (() => {
      const x = Math.round((W - hbW) / 2) - menuW - gap;
      const y = Math.round(H - hbBottom - hbH + (hbH - menuW) / 2);
      if (x >= ins.l + 2) return { x, y, w: menuW, h: menuW };
      return { x: ins.l + edge, y: Math.round(H - hbBottom - hbH - gap - menuW),
        w: menuW, h: menuW };
    })(),
    hotbar: { bottom: hbBottom, width: hbW, height: hbH, cols, rows, slot },
    // touch classification: a world touch in this box drives the stick
    zone: {
      maxX: Math.min(W * 0.5, ring * 2.4),
      minY: Math.min(H - ring * 1.75, H * 0.62),
    },
  };
  // the two pad cells, top-left origin
  L.pad.cells = {
    act: { x: padL, y: padT, w: bigBtn, h: bigBtn },
    jump: { x: padL, y: padT + bigBtn + gap, w: bigBtn, h: bigBtn },
  };
  return L;
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

// Only sizes that never change live here; positions come from JS so the
// layout is one testable arithmetic pass instead of a pile of media queries.
const CSS = `
.kt-root {
  position: fixed; inset: 0; z-index: 30; display: none;
  pointer-events: none; user-select: none; -webkit-user-select: none;
  font: 600 11px/1 "Segoe UI", system-ui, sans-serif;
  color: #dbe4f5; text-shadow: 0 1px 3px rgba(0,0,0,.85);
}
.kt-root.kt-show { display: block; }
.kt-root * { box-sizing: border-box; }

/* the stick: a ring that sits at its home spot until a thumb lands, then
   re-centres under it. transform-only movement keeps it off the layout. */
.kt-stick {
  position: absolute; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.30);
  background: rgba(10,16,30,.28);
  transform: translate(-50%, -50%);
  opacity: .38; transition: opacity .12s linear;
}
.kt-stick.kt-live { opacity: .92; }
.kt-knob {
  position: absolute; left: 50%; top: 50%; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.55);
  background: rgba(207,216,234,.30);
  transform: translate(-50%, -50%);
}

.kt-btn {
  position: absolute; pointer-events: auto; touch-action: none;
  display: flex; align-items: center; justify-content: center;
  text-align: center; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.28);
  background: rgba(13,19,34,.52);
  -webkit-tap-highlight-color: transparent;
}
.kt-btn.kt-sq { border-radius: 12px; }
.kt-btn.kt-down { background: rgba(61,120,216,.62); border-color: #9ec1ff; }
.kt-btn.kt-hot { border-color: rgba(255,255,255,.65); }
.kt-mine { font-size: 13px; }

/* the page must never scroll, bounce or zoom under a game gesture */
body.kt-on { overscroll-behavior: none; touch-action: none; }
body.kt-on canvas { touch-action: none; }
body.kt-on, body.kt-on canvas {
  -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
}

/* their hotbar, made thumb-sized. Slots become 44px and the bar re-flows to
   however many columns fit; JS supplies the width and the offset. */
body.kt-on #hotbar {
  /* BORDER-BOX, so the width JS works out is the width the browser uses. The
     bar and its slots were content-box, so a 44px slot really occupied 48 and
     a 538px bar really occupied 556 — the arithmetic and the layout were
     measuring two different things, the last slot fell onto a second row, and
     that row came up underneath the button strip. */
  box-sizing: border-box;
  left: 50%; right: auto; transform: translateX(-50%);
  flex-wrap: wrap; justify-content: center; align-content: center;
  gap: var(--kt-gap, 8px); padding: 8px;
  width: var(--kt-hb-w, 268px);
  bottom: var(--kt-hb-b, 12px);
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
}
body.kt-on #hotbar .slot { box-sizing: border-box;
  width: var(--kt-slot, 34px); height: var(--kt-slot, 34px); }
/* THE NUMBERS GO. There is no keyboard to press 1..9 on, so the digit in the
   corner of every slot is ink over the picture that actually names it. The
   off-hand keeps its dashed border, which is what says 'other hand' without
   a letter in the way. */
body.kt-on #hotbar .slot span { display: none; }
body.kt-on #hotbar { padding: 6px; }

/* the desktop HUD is a wall of key hints on a 5in screen. Keep the line that
   flash() writes to, drop the rest, and keep it out of the minimap's corner. */
body.kt-on #hud { font-size: 11px; max-width: 44vw; }
body.kt-on #stats, body.kt-on #hud .links { display: none; }
/* #hud2 sits under the minimap in the right-hand column, which on a short
   landscape screen ends where the action pad begins; tighten it so the two
   never meet. It is pointer-events:none, so this is purely cosmetic. */
body.kt-on #hud2 { font-size: 10px; line-height: 1.35; }

/* THINGS A SMALL SCREEN CANNOT AFFORD, found by looking at one. The relay's
   running commentary ("joined — radius 156, 0 blocks changed") is a desktop
   corner's worth of text and on a phone it lay under the guide; the ammo
   counter sat in the corner the jump button lives in. The first goes while
   you are playing; the second moves in beside the bar and shrinks. */
body.kt-on #netHud { display: none; }
body.kt-on .cbt-ammo {
  right: calc(var(--kt-pad-w, 76px) + 22px); bottom: 10px;
  transform: scale(.72); transform-origin: right bottom;
}
/* ...and the guide gives up the width the minimap and the clock need */
body.kt-on #road { max-width: min(56vw, 520px); font-size: 11px; padding: 5px 11px 6px; }
body.kt-on #road b { font-size: 13px; }

/* menu: thumb-sized buttons, and the two world sizes a phone cannot really
   hold are dimmed rather than hidden — a tablet may still want them. */
body.kt-touch #menuCard { padding: 20px 18px; }
body.kt-touch #sizes { flex-wrap: wrap; }
body.kt-touch #menu .size { min-height: 56px; flex: 1 0 30%; }
body.kt-touch #menu .size[data-r="400"] { opacity: .55; }
body.kt-touch #menu .size[data-r="800"] { opacity: .35; }
body.kt-touch #createBtn { padding: 15px; font-size: 16px; }
body.kt-touch #hud .act, body.kt-touch #exitBtn, body.kt-touch #newWorldBtn {
  display: inline-block; padding: 4px 2px;
}
`;

// ---------------------------------------------------------------------------
// synthetic DOM events — the zero-integration fallback
// ---------------------------------------------------------------------------

// main.js already listens for keydown/keyup on document, mousedown on the
// canvas and mouseup on the window, so dispatching those covers every intent
// without editing it. Passing real `hooks` skips all of this.
function fireKey(type, code) {
  if (typeof document !== 'object' || !document.dispatchEvent) return;
  let ev;
  try {
    ev = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
  } catch { ev = { type, code, key: code, bubbles: true, preventDefault() {} }; }
  document.dispatchEvent(ev);
}

function fireMouse(el, type, button, init = {}) {
  if (!el || !el.dispatchEvent) return;
  let ev;
  const opts = {
    bubbles: true, cancelable: true, button,
    buttons: type === 'mouseup' ? 0 : (button === 2 ? 2 : 1),
    clientX: init.clientX ?? 0, clientY: init.clientY ?? 0,
  };
  try { ev = new MouseEvent(type, { ...opts, ...init }); } catch { ev = { type, ...opts, ...init }; }
  // movementX/Y are part of MouseEventInit but not everywhere; shadow them on
  // the instance so `e.movementX` reads back what we meant either way.
  if (init.movementX !== undefined && ev.movementX !== init.movementX) {
    try {
      Object.defineProperty(ev, 'movementX', { value: init.movementX });
      Object.defineProperty(ev, 'movementY', { value: init.movementY });
    } catch { ev.movementX = init.movementX; ev.movementY = init.movementY; }
  }
  el.dispatchEvent(ev);
}

export function domHooks(canvas) {
  // clientX/Y sit at the viewport centre on purpose: main.js runs an
  // edge-turn helper off the last cursor position whenever pointer lock is
  // absent — which it always is on a phone — so a synthetic mousemove near
  // an edge would spin the camera forever.
  const cx = () => (typeof innerWidth === 'number' ? innerWidth : 800) / 2;
  const cy = () => (typeof innerHeight === 'number' ? innerHeight : 600) / 2;
  return {
    onLook: (dx, dy) => fireMouse(canvas, 'mousemove', 0, {
      movementX: dx, movementY: dy, clientX: cx(), clientY: cy(),
    }),
    onMineStart: () => fireMouse(canvas, 'mousedown', 0, { clientX: cx(), clientY: cy() }),
    onMineEnd: () => fireMouse(canvas, 'mouseup', 0, { clientX: cx(), clientY: cy() }),
    onPlace: () => {
      fireMouse(canvas, 'mousedown', 2, { clientX: cx(), clientY: cy() });
      fireMouse(canvas, 'mouseup', 2, { clientX: cx(), clientY: cy() });
    },
    onCraft: () => { fireKey('keydown', 'KeyE'); fireKey('keyup', 'KeyE'); },
    // The order card and the chronicle. Synthesised as keys like everything
    // else here, so a phone build with no hooks passed still gets them.
    onOrder: () => { fireKey('keydown', 'KeyZ'); fireKey('keyup', 'KeyZ'); },
    onBook: () => { fireKey('keydown', 'KeyJ'); fireKey('keyup', 'KeyJ'); },
    onView: () => { fireKey('keydown', 'KeyF'); fireKey('keyup', 'KeyF'); },
    onWeapon: () => { fireKey('keydown', 'KeyG'); fireKey('keyup', 'KeyG'); },
    onReload: () => { fireKey('keydown', 'KeyR'); fireKey('keyup', 'KeyR'); },
    onOrbit: () => { fireKey('keydown', 'Escape'); fireKey('keyup', 'Escape'); },
    onSlot: (i) => {
      fireKey('keydown', `Digit${i + 1}`);
      fireKey('keyup', `Digit${i + 1}`);
    },
  };
}

// ---------------------------------------------------------------------------
// the controller
// ---------------------------------------------------------------------------

// The top strip: the things you OPEN. It had the crafting bench and nothing
// else that has been added since, so on a tablet there was no way at all to
// give an order or read the book — two of the three screens the game is now
// played through. A control that exists only on a keyboard is a control a
// tablet does not have.
// BEHIND ONE BUTTON. Six little buttons in a row was a keyboard drawn on a
// phone; the strip now folds behind a single `menu`, fans out for one tap,
// and folds back the moment any of them fires. Fullscreen joins the fan,
// because a control nobody can find is a control that does not exist.
const STRIP = [
  { act: 'craft', label: 'craft' },
  { act: 'order', label: 'order' },
  { act: 'book', label: 'book' },
  // the other worlds — the L key, which a phone does not have. Without it
  // the fifth ring of the game was a place a tablet could not go.
  { act: 'travel', label: 'worlds' },
  { act: 'view', label: 'view' },
  { act: 'weapon', label: 'gun' },
  { act: 'full', label: 'full' },
  // the ? card — keys, the speed dial and the other settings. It used to be
  // a link in the corner of a HUD a phone does not show, so without this
  // there is no way to reach it with a thumb at all.
  { act: 'help', label: '?' },
  { act: 'orbit', label: 'orbit' },
];
const MENU = { act: 'menu', label: 'menu' };

const PAD = [
  // ONE CONTEXT BUTTON. Tap: place the block in hand — or, with somebody
  // under the crosshair, hit them. Hold: dig at what is in front until the
  // thumb lifts. See _press/_release.
  { act: 'act', label: 'use', cls: 'kt-mine' },
  { act: 'jump', label: 'jump', hold: true },
];

export class TouchControls {
  constructor(opts = {}) {
    this.version = VERSION;
    this.canvas = opts.canvas ?? null;
    this.keySet = opts.keys ?? null;          // e.g. player.keys
    this.hooks = { ...domHooks(this.canvas), ...(opts.hooks ?? {}) };
    this.lookSens = opts.lookSensitivity ?? 1.5;   // mouse px per CSS px
    this.tapMs = opts.tapMs ?? 260;                // tap window
    this.tapSlop = opts.tapSlop ?? 14;             // px a tap may drift
    this.tapMineMs = opts.tapMineMs ?? 170;        // hold a tap synthesises
    this.doc = opts.document ?? (typeof document === 'object' ? document : null);
    this.win = opts.window ?? (typeof window === 'object' ? window : null);

    // --- public state -----------------------------------------------------
    this.enabled = false;      // touch has been detected
    this.visible = false;      // controls are on screen (play mode, not paused)
    this.mode = 'orbit';
    this.paused = false;
    this.move = { x: 0, y: 0 };   // unit vector, y > 0 is forward
    this.magnitude = 0;           // 0..1 after the dead zone
    this.running = false;
    this.jump = false;
    this.sneak = false;
    this.mining = false;
    this.lookDX = 0;
    this.lookDY = 0;

    this.quality = suggestQuality();
    this.layout = null;
    this._menuOpen = false;
    this._touches = new Map();     // identifier -> role record
    this._held = new Set();        // key codes WE put into keySet
    this._repeat = new Map();      // act -> interval id
    this._autoMode = opts.autoMode !== false;
    this._bound = false;

    if (this.doc) { this._injectStyle(); this._build(); }
    // a plainly-touch device gets the controls before the first touch, so the
    // menu is already thumb-sized; anything else waits for real evidence.
    if (opts.force || touchPrimary()) this.enable();
    else this._watchForTouch();
    if (this._autoMode) this._watchPlaying();
    if (this.win?.addEventListener) {
      this._onResize = () => this.relayout();
      this.win.addEventListener('resize', this._onResize);
      this.win.addEventListener('orientationchange', this._onResize);
      this._onBlur = () => this.releaseAll();
      this.win.addEventListener('blur', this._onBlur);
    }
    if (this.doc?.addEventListener) {
      this._onVis = () => { if (this.doc.hidden) this.releaseAll(); };
      this.doc.addEventListener('visibilitychange', this._onVis);
    }
  }

  // --- public API ---------------------------------------------------------

  // Turn the controls on. Idempotent; called automatically on the first real
  // touch, so a mouse-only desktop never sees any of this.
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.doc?.body?.classList?.add('kt-touch');
    this._bind();
    this.relayout();
    this._applyVisible();
  }

  setMode(mode) {
    this._autoMode = false;
    this._setMode(mode);
  }

  pause() { this.paused = true; this.releaseAll(); this._applyVisible(); }
  resume() { this.paused = false; this._applyVisible(); }

  // Re-assert the keys we believe are held. main.js may clear player.keys
  // (opening the crafting panel does), so a per-frame call keeps the two in
  // step; it is a handful of Set writes and safe to skip.
  applyKeys(set = this.keySet) {
    if (!set) return set;
    for (const code of this._held) set.add(code);
    return set;
  }
  sync() { return this.applyKeys(); }

  // Pull style: mouse-pixel deltas accumulated since the last call. Only
  // useful when no onLook hook is installed (the hook is push style).
  consumeLook() {
    const d = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return d;
  }

  snapshot() {
    return {
      enabled: this.enabled, visible: this.visible, mode: this.mode,
      move: { ...this.move }, magnitude: +this.magnitude.toFixed(4),
      running: this.running, jump: this.jump, sneak: this.sneak,
      mining: this.mining, touches: this._touches.size,
      keys: [...this._held].sort(),
      look: { dx: +this.lookDX.toFixed(2), dy: +this.lookDY.toFixed(2) },
    };
  }

  releaseAll() {
    for (const [, rec] of this._touches) this._end(rec, true);
    this._touches.clear();
    this._resetStick();
    if (this.mining) { this.mining = false; this.hooks.onMineEnd?.(); }
    for (const code of [...this._held]) this._key(code, false);
    for (const [, id] of this._repeat) clearInterval(id);
    this._repeat.clear();
    this.jump = this.sneak = false;
    for (const b of this._buttons ?? []) b.el.classList.remove('kt-down');
  }

  destroy() {
    this.releaseAll();
    this._unbind();
    this._obs?.disconnect?.();
    if (this.win?.removeEventListener) {
      this.win.removeEventListener('resize', this._onResize);
      this.win.removeEventListener('orientationchange', this._onResize);
      this.win.removeEventListener('blur', this._onBlur);
    }
    this.doc?.removeEventListener?.('visibilitychange', this._onVis);
    this.root?.remove?.();
    this.doc?.body?.classList?.remove('kt-touch', 'kt-on');
  }

  // --- construction --------------------------------------------------------

  _injectStyle() {
    if (this.doc.getElementById?.('kt-style')) return;
    const s = this.doc.createElement('style');
    s.id = 'kt-style';
    s.textContent = CSS;
    (this.doc.head ?? this.doc.body)?.appendChild(s);
  }

  _el(tag, cls, text) {
    const e = this.doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  _build() {
    this.root = this._el('div', 'kt-root');
    this.stick = this._el('div', 'kt-stick');
    this.knob = this._el('div', 'kt-knob');
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);

    this._buttons = [];
    for (const spec of [...PAD, MENU, ...STRIP]) {
      const el = this._el('div', `kt-btn ${spec.cls ?? ''}`.trim(), spec.label);
      el.dataset.act = spec.act;
      this.root.appendChild(el);
      this._buttons.push({ ...spec, el });
    }
    this.doc.body?.appendChild(this.root);
  }

  // --- layout --------------------------------------------------------------

  // env() insets are read from a probe rather than assumed, because a notch
  // steals real estate that the arithmetic below has to know about.
  _insets() {
    const zero = { l: 0, r: 0, t: 0, b: 0 };
    if (!this.doc?.body || typeof getComputedStyle !== 'function') return zero;
    try {
      const p = this.doc.createElement('div');
      p.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left)';
      this.doc.body.appendChild(p);
      const cs = getComputedStyle(p);
      const n = (v) => (parseFloat(v) || 0);
      const out = {
        t: n(cs.paddingTop), r: n(cs.paddingRight),
        b: n(cs.paddingBottom), l: n(cs.paddingLeft),
      };
      p.remove();
      return out;
    } catch { return zero; }
  }

  relayout() {
    if (!this.doc) return null;
    const W = this.win?.innerWidth ?? 360;
    const H = this.win?.innerHeight ?? 640;
    const L = computeLayout(W, H, this._insets(), { stripCount: STRIP.length });
    this.layout = L;
    if (!this.root) return L;

    const px = (v) => `${Math.round(v)}px`;
    this.stick.style.width = px(L.ring);
    this.stick.style.height = px(L.ring);
    this.knob.style.width = px(L.knob);
    this.knob.style.height = px(L.knob);
    this._resetStick();

    for (const b of this._buttons) {
      const cell = L.pad.cells[b.act];
      if (cell) {
        b.el.style.left = px(cell.x);
        b.el.style.top = px(cell.y);
        b.el.style.width = px(cell.w);
        b.el.style.height = px(cell.h);
        b.rect = cell;
      } else if (b.act === 'menu') {
        const m = L.menu;
        b.el.style.left = px(m.x);
        b.el.style.top = px(m.y);
        b.el.style.width = px(m.w);
        b.el.style.height = px(m.h);
        b.el.classList.add('kt-sq');
        b.rect = { ...m };
      } else {
        // the fan: a column climbing straight up from the menu, spilling
        // into a second column to its left when the screen is too short —
        // it never crosses the bar and never runs off the top
        const i = STRIP.findIndex((s) => s.act === b.act);
        const step = L.small + L.gap;
        const room = Math.max(1, Math.floor(
          (L.menu.y - L.ins.t - L.edge) / step));
        const col = Math.floor(i / room), row = i % room;
        // to the left while there is glass to the left, else to the right
        const cols = Math.ceil(STRIP.length / room);
        const side = L.menu.x - (cols - 1) * step >= L.ins.l ? -1 : 1;
        const x = L.menu.x + side * col * step;
        const y = L.menu.y - (row + 1) * step;
        b.el.style.left = px(x);
        b.el.style.top = px(y);
        b.el.style.width = px(L.small);
        b.el.style.height = px(L.small);
        b.el.classList.add('kt-sq');
        b.el.style.display = this._menuOpen ? '' : 'none';
        b.rect = { x, y, w: L.small, h: L.small };
      }
    }

    // hand the hotbar its geometry through custom properties so the CSS above
    // stays declarative and index.html keeps owning the markup
    const rootEl = this.doc.documentElement;
    rootEl?.style?.setProperty?.('--kt-hb-w', px(L.hotbar.width));
    rootEl?.style?.setProperty?.('--kt-hb-b', px(L.hotbar.bottom));
    rootEl?.style?.setProperty?.('--kt-gap', px(L.gap));
    rootEl?.style?.setProperty?.('--kt-slot', px(L.hotbar.slot));
    return L;
  }

  // --- binding -------------------------------------------------------------

  // A hybrid laptop reports a coarse pointer for a touchscreen it is not
  // being driven by, so it waits for real evidence. A machine with no touch
  // hardware at all gets no listener whatsoever: nothing to fire, nothing to
  // go wrong, desktop untouched.
  _watchForTouch() {
    if (!this.doc?.addEventListener || !touchCapable()) return;
    this._first = (e) => {
      this.doc.removeEventListener('touchstart', this._first, { capture: true });
      this.enable();
      // the touch that revealed the controls should still do something
      this._onStart(e);
    };
    this.doc.addEventListener('touchstart', this._first, { capture: true, passive: false });
  }

  // Without an explicit setMode, follow the class main.js already toggles on
  // <body> when play starts and stops. Zero integration, no polling.
  _watchPlaying() {
    if (typeof MutationObserver !== 'function' || !this.doc?.body) return;
    const read = () => this._setMode(
      this.doc.body.classList.contains('playing') ? 'play' : 'orbit');
    this._obs = new MutationObserver(read);
    this._obs.observe(this.doc.body, { attributes: true, attributeFilter: ['class'] });
    read();
  }

  _bind() {
    if (this._bound || !this.doc?.addEventListener) return;
    this._bound = true;
    this._h = {
      start: (e) => this._onStart(e),
      move: (e) => this._onMove(e),
      end: (e) => this._onEnd(e, false),
      cancel: (e) => this._onEnd(e, true),
      gesture: (e) => { if (this.visible) e.preventDefault?.(); },
    };
    // capture + non-passive: we must be able to preventDefault the touches we
    // claim, or the page scrolls, rubber-bands or pulls to refresh mid-game
    const o = { capture: true, passive: false };
    this.doc.addEventListener('touchstart', this._h.start, o);
    this.doc.addEventListener('touchmove', this._h.move, o);
    this.doc.addEventListener('touchend', this._h.end, o);
    this.doc.addEventListener('touchcancel', this._h.cancel, o);
    // Safari pinch-zooms the page even with user-scalable=no
    this.doc.addEventListener('gesturestart', this._h.gesture, o);
    this.doc.addEventListener('dblclick', this._h.gesture, o);
  }

  _unbind() {
    if (!this._bound || !this.doc?.removeEventListener) return;
    this._bound = false;
    const o = { capture: true };
    this.doc.removeEventListener('touchstart', this._h.start, o);
    this.doc.removeEventListener('touchmove', this._h.move, o);
    this.doc.removeEventListener('touchend', this._h.end, o);
    this.doc.removeEventListener('touchcancel', this._h.cancel, o);
    this.doc.removeEventListener('gesturestart', this._h.gesture, o);
    this.doc.removeEventListener('dblclick', this._h.gesture, o);
  }

  _setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode !== 'play') this.releaseAll();
    this._applyVisible();
  }

  _applyVisible() {
    const v = this.enabled && !this.paused && this.mode === 'play';
    if (v === this.visible) return;
    this.visible = v;
    this.root?.classList?.[v ? 'add' : 'remove']('kt-show');
    this.doc?.body?.classList?.[v ? 'add' : 'remove']('kt-on');
    if (v) this.relayout(); else this.releaseAll();
  }

  // --- touch routing -------------------------------------------------------

  // A touch is claimed by exactly one role for its whole life, keyed on its
  // identifier. Nothing here iterates e.touches: only changedTouches matter,
  // and the live set is our own map.
  _onStart(e) {
    if (!this.enabled || !this.visible) return;
    let claimed = false;
    for (const t of list(e.changedTouches)) {
      if (this._touches.has(t.identifier)) continue;
      const role = this._classify(t);
      if (!role) continue;                    // let the DOM have it
      claimed = true;
      const rec = {
        id: t.identifier, role, x: t.clientX, y: t.clientY,
        x0: t.clientX, y0: t.clientY, t0: now(), btn: role.btn ?? null,
      };
      this._touches.set(t.identifier, rec);
      if (role.kind === 'stick') this._stickTo(rec, t.clientX, t.clientY, true);
      else if (role.kind === 'look') this._lookId = t.identifier;
      else if (role.kind === 'btn') this._press(rec.btn);
    }
    if (claimed) e.preventDefault?.();
  }

  _classify(t) {
    const el = t.target;
    // 1. one of ours
    const hit = el?.closest?.('.kt-btn');
    if (hit) {
      const btn = this._buttons.find((b) => b.el === hit);
      if (btn) return { kind: 'btn', btn };
    }
    // 2. someone else's interactive DOM — hotbar, HUD links, craft panel.
    //    Not claimed and not prevented, so their click handlers still fire.
    if (el?.closest?.('#hotbar, #hud, #menu, .cui-root, .kt-pass')) return null;
    // 3. the crafting panel owns the screen while it is open
    if (this.doc?.querySelector?.('.cui-open')) return null;
    // 4. the world
    const L = this.layout ?? this.relayout();
    const inStick = t.clientX <= L.zone.maxX && t.clientY >= L.zone.minY;
    if (inStick && !this._stickId) return { kind: 'stick' };
    if (!this._lookId) return { kind: 'look' };
    return null;
  }

  _onMove(e) {
    if (!this._touches.size) return;
    let claimed = false;
    for (const t of list(e.changedTouches)) {
      const rec = this._touches.get(t.identifier);
      if (!rec) continue;
      claimed = true;
      if (rec.role.kind === 'stick') {
        this._stickTo(rec, t.clientX, t.clientY, false);
      } else if (rec.role.kind === 'look') {
        const dx = (t.clientX - rec.x) * this.lookSens;
        const dy = (t.clientY - rec.y) * this.lookSens;
        if (this.hooks.onLook) this.hooks.onLook(dx, dy);
        else { this.lookDX += dx; this.lookDY += dy; }
      } else if (rec.role.kind === 'btn') {
        // sliding off a held button releases it, the way a real pad does
        const r = rec.btn.rect;
        const inside = r && t.clientX >= r.x - 12 && t.clientX <= r.x + r.w + 12 &&
          t.clientY >= r.y - 12 && t.clientY <= r.y + r.h + 12;
        if (!inside && rec.btn.hold) { this._release(rec.btn); rec.btn = null; }
      }
      rec.x = t.clientX;
      rec.y = t.clientY;
    }
    if (claimed) e.preventDefault?.();
  }

  _onEnd(e, cancel) {
    if (!this._touches.size) return;
    // THE FIRST TAP GOES FULLSCREEN. A browser only grants fullscreen inside
    // a user gesture, and 'find the tiny link' is not a thing anybody does
    // mid-game — so the first touch that ends in play mode asks for it (and
    // the landscape lock that rides on it in main.js). Once per session, so
    // somebody who deliberately leaves fullscreen is left alone; skipped
    // entirely when the game is installed, which is already fullscreen.
    if (!cancel && this.visible && !this._wentFull) {
      this._wentFull = true;
      const standalone = this.win?.matchMedia?.('(display-mode: fullscreen), '
        + '(display-mode: standalone)')?.matches;
      if (!standalone && !this.doc.fullscreenElement) this.hooks.onFull?.();
    }
    let claimed = false;
    for (const t of list(e.changedTouches)) {
      const rec = this._touches.get(t.identifier);
      if (!rec) continue;
      claimed = true;
      this._touches.delete(t.identifier);
      this._end(rec, cancel);
    }
    if (claimed) e.preventDefault?.();
  }

  _end(rec, cancel) {
    if (rec.role.kind === 'stick') {
      this._stickId = null;
      this._resetStick();
      this._applyMove(0, 0, 0);
    } else if (rec.role.kind === 'look') {
      this._lookId = null;
      const moved = Math.hypot(rec.x - rec.x0, rec.y - rec.y0);
      const quick = now() - rec.t0 <= this.tapMs;
      if (!cancel && quick && moved <= this.tapSlop) this._tap();
    } else if (rec.role.kind === 'btn') {
      if (rec.btn) this._release(rec.btn);
    }
  }

  // A short tap on the world acts on whatever the crosshair is over. There is
  // no separate aim step: the crosshair is the cursor, so tapping is a brief
  // mine — long enough for main.js to register a hit, short enough not to
  // chew through a block by accident.
  _tap() {
    if (this.hooks.onTap) return this.hooks.onTap();
    this.hooks.onMineStart?.();
    setTimeout(() => { if (!this.mining) this.hooks.onMineEnd?.(); }, this.tapMineMs);
  }

  // --- stick ---------------------------------------------------------------

  _stickTo(rec, x, y, fresh) {
    const L = this.layout ?? this.relayout();
    if (fresh) {
      this._stickId = rec.id;
      // the ring appears under the thumb, but never so close to an edge that
      // half of its travel is off-screen
      const m = L.ring / 2 + 4;
      rec.cx = clamp(x, m, L.W - m);
      rec.cy = clamp(y, m, L.H - m);
      this._moveStick(rec.cx, rec.cy, true);
    }
    let dx = x - rec.cx, dy = y - rec.cy;
    const len = Math.hypot(dx, dy);
    const maxR = L.stick.maxR;
    // past the ring the stick follows the thumb instead of stopping dead: you
    // can shove past the edge and keep running, which is what thumbs do
    if (len > maxR && len > 0) {
      rec.cx += dx * (1 - maxR / len);
      rec.cy += dy * (1 - maxR / len);
      rec.cx = clamp(rec.cx, L.ring / 2 + 4, L.W - L.ring / 2 - 4);
      rec.cy = clamp(rec.cy, L.ring / 2 + 4, L.H - L.ring / 2 - 4);
      this._moveStick(rec.cx, rec.cy, true);
      dx = x - rec.cx; dy = y - rec.cy;
    }
    const l2 = Math.hypot(dx, dy);
    const dead = maxR * L.stick.dead;
    const mag = l2 <= dead ? 0 : clamp((l2 - dead) / (maxR - dead), 0, 1);
    const nx = l2 > 0 ? dx / l2 : 0;
    const ny = l2 > 0 ? -dy / l2 : 0;    // screen y grows downwards
    this._knobTo(clamp(dx, -maxR, maxR), clamp(dy, -maxR, maxR));
    this._applyMove(mag ? nx : 0, mag ? ny : 0, mag);
  }

  _moveStick(cx, cy, live) {
    if (!this.stick) return;
    this.stick.style.left = `${Math.round(cx)}px`;
    this.stick.style.top = `${Math.round(cy)}px`;
    this.stick.classList[live ? 'add' : 'remove']('kt-live');
  }

  _knobTo(dx, dy) {
    if (!this.knob) return;
    this.knob.style.transform =
      `translate(-50%, -50%) translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
  }

  _resetStick() {
    const L = this.layout;
    if (!L || !this.stick) return;
    this._moveStick(L.stick.cx, L.stick.cy, false);
    this._knobTo(0, 0);
  }

  // Analogue in, digital out: player.js steers from a key Set, so the vector
  // is quantised onto WASD with a 20-degree dead cone around each pure
  // direction. `magnitude` and `running` stay available for whenever the
  // player grows a real analogue input.
  _applyMove(nx, ny, mag) {
    this.move.x = nx;
    this.move.y = ny;
    this.magnitude = mag;
    const L = this.layout;
    this.running = mag >= (L?.stick.run ?? 0.72);
    const ax = nx * mag, ay = ny * mag;
    const T = 0.35;
    this._key(KEYS.fwd, ay > T);
    this._key(KEYS.back, ay < -T);
    this._key(KEYS.right, ax > T);
    this._key(KEYS.left, ax < -T);
    this._key(KEYS.sprint, this.running);
  }

  // --- buttons -------------------------------------------------------------

  _press(btn) {
    if (!btn) return;
    btn.el.classList.add('kt-down');
    switch (btn.act) {
      case 'act':
        // the decision is made at RELEASE for a tap and at the hold
        // threshold for a dig, so nothing fires on the way down
        this._actMining = false;
        this._actTimer = setTimeout(() => {
          this._actMining = true;
          this.mining = true;
          this.hooks.onMineStart?.();
        }, this.tapMs);
        break;
      case 'jump':
        this.jump = true;
        this._key(KEYS.jump, true);
        break;
      // main.js clears player.keys when the crafting panel opens and when
      // play ends, so let go of everything first or we would believe we are
      // still holding keys that no longer exist anywhere else
      case 'menu': this._setMenu(!this._menuOpen); break;
      case 'craft': this._setMenu(false); this._letGo(); this.hooks.onCraft?.(); break;
      case 'order': this._setMenu(false); this._letGo(); this.hooks.onOrder?.(); break;
      case 'book': this._setMenu(false); this._letGo(); this.hooks.onBook?.(); break;
      case 'travel': this._setMenu(false); this._letGo(); this.hooks.onTravel?.(); break;
      case 'view': this._setMenu(false); this.hooks.onView?.(); break;
      case 'weapon':
        // one button, two jobs: tap draws or holsters, and a second tap while
        // armed reloads. Screen space is the scarcest resource on a phone.
        this._setMenu(false);
        if (this._armed) this.hooks.onReload?.();
        else this.hooks.onWeapon?.();
        break;
      case 'full': this._setMenu(false); this.hooks.onFull?.(); break;
      case 'help': this._setMenu(false); this._letGo(); this.hooks.onHelp?.(); break;
      case 'orbit': this._setMenu(false); this._letGo(); this.hooks.onOrbit?.(); break;
      default: break;
    }
  }

  _release(btn) {
    if (!btn) return;
    btn.el.classList.remove('kt-down');
    const id = this._repeat.get(btn.act);
    if (id !== undefined) { clearInterval(id); this._repeat.delete(btn.act); }
    switch (btn.act) {
      case 'act':
        clearTimeout(this._actTimer);
        this._actTimer = null;
        if (this._actMining) {
          // the hold was a dig: stop swinging
          this._actMining = false;
          this.mining = false;
          this.hooks.onMineEnd?.();
        } else if (this.hooks.hasTarget?.()) {
          // a quick tap with somebody in front is a swing at them
          this.hooks.onTap?.();
        } else {
          this.hooks.onPlace?.();
        }
        break;
      case 'jump': this.jump = false; this._key(KEYS.jump, false); break;
      default: break;
    }
  }

  _setMenu(open) {
    this._menuOpen = !!open;
    for (const b of this._buttons ?? []) {
      if (STRIP.some((x) => x.act === b.act)) {
        b.el.style.display = this._menuOpen ? '' : 'none';
      }
      if (b.act === 'menu') b.el.classList.toggle('kt-down', this._menuOpen);
    }
  }

  // main.js can tell us a weapon is drawn so the gun button becomes reload
  setArmed(on) {
    this._armed = !!on;
    const b = this._buttons?.find((x) => x.act === 'weapon');
    if (b) {
      b.el.textContent = on ? 'reload' : 'gun';
      b.el.classList[on ? 'add' : 'remove']('kt-hot');
    }
  }

  // --- keys ----------------------------------------------------------------

  // drop every key and the mine hold, without forgetting which touches are
  // still down — the stick simply re-asserts itself on the next move
  _letGo() {
    for (const code of [...this._held]) this._key(code, false);
    if (this.mining) { this.mining = false; this.hooks.onMineEnd?.(); }
    this._applyMove(0, 0, 0);
  }

  _key(code, down) {
    const had = this._held.has(code);
    if (down === had) return;
    if (down) this._held.add(code); else this._held.delete(code);
    if (this.keySet) {
      if (down) this.keySet.add(code); else this.keySet.delete(code);
    } else {
      fireKey(down ? 'keydown' : 'keyup', code);
    }
  }
}

// TouchList is array-like but not an array in every engine
function list(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  const out = [];
  for (let i = 0; i < x.length; i++) out.push(x[i] ?? x.item?.(i));
  return out;
}

function now() {
  return typeof performance === 'object' && performance.now
    ? performance.now() : Date.now();
}

export default TouchControls;
