// player.js — the player on the cube-sphere: physics, avatar, camera views.
//
// Because blocks are surface-aligned, the ground under the player is a plain
// height field: every column has one surface radius. Movement is therefore the
// same as on a flat Minecraft world — walk, read the ground height, step up or
// down — which removes the staircase deflection and depenetration drift that
// an axis-aligned voxel sphere forces on you.
//
// Orientation is stored as up + a tangent forward and the body quaternion is
// rebuilt from that basis every step, so camera roll cannot accumulate and the
// horizon stays level by construction.
//
// Collision is done in CELL space, not with sample points in world space. A
// cube-sphere cell is not one block wide — measured, it runs from 0.98 blocks
// near a face centre down to 0.61 at the middle of a face edge low down — and
// the old body was five points at +/-0.3 blocks along the player's own forward
// and right axes. That body is 0.60 wide when you look along a corridor and
// 0.42 when you look diagonally, so in the narrow cells it did not fit, and
// its width changed when you moved the mouse. Now the body is a box measured
// in cells and each axis is clamped separately against the cells it would
// enter, which is the ordinary flat-world resolve: walls slide, corners
// deflect, and a one-cell corridor is a corridor everywhere on the globe.
//
// The avatar IS the KherveSkins figure, wearing a real Minecraft-format
// skin: six boxes — an 8-unit cube of head, an 8x12x4 trunk, one-piece
// 4x12x4 limbs — UV-mapped straight onto the 64x64 (or HD) PNG the built-in
// skin maker exports, base layer plus overlay shell, and nothing else
// modelled at all. The walk swings whole limbs from the shoulder and the
// hip, the classic way; the empty knee/elbow joints survive only as handles
// for the seats and the held item.

import * as THREE from 'three';
// Namespace import as well as the named one: S, R0, the cell mapping and the
// PASSABLE set are all read live here, and cubesphere.js is a file other
// people edit — a namespace read degrades to `undefined` where a missing
// named import would refuse to link the whole game.
import * as CS from './cubesphere.js';
import { BLOCK, R0 } from './cubesphere.js';
import { buildAtlas, tileUV } from './textures.js';
import { makeLit } from './lit.js';
import { dressBody, realBodiesOn } from './realbody.js';
import {
  itemMaterial, terrainMaterial, toTileUV, disposeMats, smoothItemGeometry,
} from './realitem.js';
import { buildItemGeometry, canExtrude, gripOf, leanOf, ITEM_DEPTH } from './itemmodel.js';
import { buildGunModel, GUN_POSE, hasGunModel } from './gunmodels.js';
import { buildToolModel, disposeToolModel } from './toolmodels.js';
// Worn armour. items.js owns which slots exist, which materials there are and
// which material a given breastplate is made of — this file only knows what
// each one LOOKS like, and asks that list rather than keeping a second one.
import { ARMOUR_SLOTS, ARMOUR_KEYS, armourOf } from './items.js';
// The skin maker's OWN layout file: the same units, the same unwrap, the
// same overlay rule — one agreement, shared, so a skin painted in the maker
// cannot disagree with the body wearing it in the world.
import { parts as skinParts, OVER_GROW, BASE, FACES } from './skins/layout.js';

// A jump clears one block, and only one. At 12 / 30 the apex was 2.40 blocks,
// which cleared the two-block steps villages and terraces are made of — and
// that is precisely the problem: a jump that tall flattens the world, because
// nothing built out of blocks is ever an obstacle. 9.4 gives an apex of 1.51,
// so one course is a step up and two is a wall you have to find a way around.
// The margin over 1.0 is what the jump feels like rather than what it clears:
// at 1.26 it cleared a block but only just, and a jump that barely makes its
// own height reads as heavy. Anything up to 1.99 is free to spend, so this
// sits mid-band — springy, and still stopped by two courses.
// Gravity is untouched — falls, buoyancy (SWIM_GRAVITY below) and the landing
// dip were all tuned against 30 and none of them wanted changing.
const GRAVITY = 30;        // blocks / s^2, toward planet centre
const JUMP_SPEED = 9.4;    // apex 9.4^2 / (2*30) = 1.51 blocks, rising in 0.32 s
// Buoyancy was tuned against the old gravity. Keep its absolute value or the
// higher GRAVITY turns swimming into sinking.
const SWIM_GRAVITY = 5.3;  // was GRAVITY(24) * 0.22
const CLIMB_SPEED = 3.6;   // blocks / s up or down a ladder
const WALK_SPEED = 6;      // blocks / s
const SPRINT_MULT = 1.42;  // 8.5 blocks / s
// Creative flight, sideways. It used to be WALK_SPEED — the same six blocks a
// second you cross a room at — which is a reasonable pace for a street and a
// crawl for a planet: a radius-78 world is five hundred blocks round, so a lap
// took a minute and a half of holding W. Flying is the tool you reach for when
// you want to be somewhere else. Measured in the air: 16.7 blocks a second
// against 5.8 on foot. Sprint multiplies it further where it engages, but the
// key for that is the double-tapped W and not shift, because shift is the
// DESCEND key as soon as your feet leave the ground.
const FLY_MULT = 2.8;      // 16.8 blocks / s
const SNEAK_MULT = 0.34;   // 2.0 blocks / s
const GROUND_ACCEL = 55;   // blocks / s^2 toward the wish velocity
const AIR_ACCEL = 22;      // only ever ADDS along the wish direction: see below
const GROUND_FRICTION = 16;
const STOP_SPEED = 1.2;    // friction floor — this is what makes the stop crisp
const EYE = 1.55;          // eye height above feet
const BODY = 1.75;
const STEP_HEIGHT = 1.05;  // ledge walked over without stopping
const STEP_DOWN = 1.1;     // drop followed smoothly instead of falling
const STEP_DT = 1 / 120;
const MOUSE_SENS = 0.006;
const MAX_PITCH = Math.PI / 2 - 0.02;

// --- the body -------------------------------------------------------------
// BODY_R is the body's radius in blocks, but never more than BODY_CELL of the
// local cell, so a one-cell corridor keeps at least 17% of its width free on
// each side wherever you are on the globe. At 0.30 flat (the old figure) the
// narrowest cells on a radius-40 planet left 0.004 blocks of clearance a side,
// which is why they felt like a wall.
const BODY_R = 0.28;
const BODY_CELL = 0.33;
const WALL_SKIN = 0.001;   // cell units held between the body and a wall
const FOOT_LIFT = 0.02;    // the sole is not part of the cell below it
const HEAD_GAP = 0.05;
const FRAME_EPS = 0.02;    // cell units used to differentiate the cell frame

// Doorway assist. A move stopped flat is nearly always a near miss — a corner
// of the body catching a jamb — so probe sideways and, if the blocked axis
// clears there, drift that way and retry within the same step. Without it a
// one-cell gap has to be threaded; with it you are pulled into line.
const ASSIST = 0.42;       // blocks of sideways offset worth probing
const ASSIST_STEPS = [0.35, 0.7, 1];   // fractions of it, smallest first
const ASSIST_SPEED = 5;    // blocks / s the nudge is applied at

// Timing help, both about 0.1 s: below that the player reads it as their own
// input landing, above it as the game jumping for them.
const COYOTE = 0.11;       // grace after walking off a lip
const JUMP_BUFFER = 0.16;  // grace for a jump pressed before landing
const FLY_SPEED = 11;      // creative vertical speed, blocks/s
const UNSTICK_REACH = 14;  // blocks searched upward to get out of solid rock
const BURIED_CREEP = 0.35; // blocks a substep you may move while inside one
const STUCK_GIVE_UP = 0.17; // seconds buried before the body is put on top of it
const DOUBLE_TAP = 0.28;   // window for double-tap-W to start a sprint
const LADDER_GRACE = 0.45; // the top rung holds you up for this long

// --- camera feel ----------------------------------------------------------
const STEP_TAU = 0.08;     // eye catches up with a step in ~80 ms
const BOB_AMP = 0.032;     // blocks, at full walking speed
const BOB_SIDE = 0.55;     // lateral bob as a fraction of the vertical one
const DIP_MAX = 0.30;      // landing dip ceiling — a 40-block fall must not lurch
const DIP_PER_SPEED = 0.011;
const DIP_W = 11;          // spring rate; critically damped, settles in ~0.4 s
const SPRINT_FOV = 7;      // degrees added at full sprint

// Ladders are BLOCK.LADDER_BASE + facing (0..3). Tested locally rather than
// through a cubesphere helper so player.js does not break if that module's
// exports move around.
const LADDER_LO = BLOCK.LADDER_BASE ?? 33;
const isLadderBlock = (b) => b >= LADDER_LO && b < LADDER_LO + 4;

// Blocks the body passes through. The old test was "not air and not water",
// which made every flower an invisible wall — and one you then climbed, since
// the step-up happily lifted you onto it. cubesphere's PASSABLE set is the
// same list surfaceRadius() uses, so ground and body now agree.
const PASSABLE = CS.PASSABLE ?? new Set();
const isPassable = (b) =>
  b === BLOCK.AIR || b === BLOCK.WATER || PASSABLE.has(b);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _test = new THREE.Vector3();
const _try = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qAim = new THREE.Quaternion();
const _qSpin = new THREE.Quaternion();   // the half turn of the front view
const _m = new THREE.Matrix4();
const _c0 = [0, 0, 0], _c1 = [0, 0, 0], _c2 = [0, 0, 0], _cc = [0, 0, 0];

// --- who you are ------------------------------------------------------------
//
// A look is a SKIN now: the same square PNG Minecraft wears — 64x64, or the
// HD 128 and 256 — made in the KherveSkins maker built into this game and
// worn here unchanged, plus one choice: `slim`, the three-pixel arms.
//
//   { skin: <PNG data URL or null>, slim: false, name: 'my-skin' }
//
// The old look was three characters, five complexions, hair styles, noses,
// painted eyes and a wardrobe of frocks, every one of them drawn onto the
// body by five hundred lines of this file — and the man it produced was
// nobody's Minecraft man. All of that belongs to the skin image now, where
// the player can actually paint it. A look with no skin (or an old saved
// look from the character days) wears the built-in fellow below, and a look
// that arrives from an old save simply falls back to him too.
export const DEFAULT_LOOK = { skin: null, slim: false };

// BoxGeometry face order: +x, -x, +y, -y, +z, -z — shaded like world blocks.
const FACE_SHADES = [0.82, 0.82, 1.0, 0.55, 0.68, 0.68];
const PX = 16; // texel grid per ARMOUR face — matches the block atlas

const nowSeconds = () =>
  (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

// draw a small pixel texture; fn gets a 2d context on a PX x PX canvas.
// Only the armour uses these now — the body itself is the skin image.
function partTexture(fn) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = PX;
  const g = cv.getContext('2d');
  fn(g);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const fill = (g, color, x = 0, y = 0, w = PX, h = PX) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

// x,y,w,h quadruples in one call — keeps the pixel art readable at 80 columns
function rects(g, color, q) {
  g.fillStyle = color;
  for (let i = 0; i < q.length; i += 4) g.fillRect(q[i], q[i + 1], q[i + 2], q[i + 3]);
}

// ---------------------------------------------------------------------------
// the skin
// ---------------------------------------------------------------------------
//
// Everything below is KherveSkins' own model brought over whole: the same
// units, the same unwrap, the same two layers. `js/skins/layout.js` IS the
// maker's layout file — one agreement, shared, so a skin painted in the
// maker cannot disagree with the body wearing it.

// One model unit — a sixty-fourth of the classic figure, of which the man is
// 32 — in blocks. 1.80 tall, the stature the old rig stood at.
const PXM = 1.80 / 32;

// Half a percent of overlap between neighbouring boxes: parts that touch
// EXACTLY let the background through as a hairline crack at the shared edge.
const WELD = 1.005;

// With the figure facing -Z the box faces read: his right, his left, the
// top, the underneath, the back, the front.
const FACE_ORDER = ['right', 'left', 'top', 'bottom', 'back', 'front'];

// A twentieth of a texel held back from every rectangle edge, or nearest
// sampling rounds the border into the neighbouring rectangle and a limb
// wears one column of whatever sits beside it in the image.
const BLEED = 0.05;

/**
 * Point one box's faces at their rectangles in the skin — the maker's own
 * setBoxUV, verbatim: the four upright faces read straight, the top and the
 * bottom turn half a circle because Three unwraps a box as though it faced
 * +Z and this one faces the other way.
 *
 * The UVs are size-independent on purpose: layout.js scales a rectangle by
 * (size / 64) and this divides by size, so base-64 coordinates serve a 128
 * or 256 skin unchanged — which is what lets an HD skin land on a standing
 * body without a rebuild.
 */
function setBoxUV(geo, rectsOf, size) {
  const uv = geo.attributes.uv;
  const e = BLEED / size;
  FACE_ORDER.forEach((face, i) => {
    const [rx, ry, rw, rh] = rectsOf[face];
    const u0 = rx / size + e, u1 = (rx + rw) / size - e;
    const v0 = 1 - ry / size - e, v1 = 1 - (ry + rh) / size + e;
    const tl = [u0, v0], tr = [u1, v0], bl = [u0, v1], br = [u1, v1];
    const turn = face === 'top' || face === 'bottom';
    const c = turn ? [br, bl, tr, tl] : [tl, tr, bl, br];
    for (let k = 0; k < 4; k++) uv.setXY(i * 4 + k, c[k][0], c[k][1]);
  });
  uv.needsUpdate = true;
}

// The built-in fellow: drawn in code, so a player with no saved skin is
// dressed before any image could have loaded. The classic arrangement — teal
// shirt, indigo trousers, bare arms, dark hair — painted into the same
// rectangles the maker exports, and nothing else: replace him by opening the
// skin maker and wearing anything at all.
// His colours, named the way a villager's palette names them, because under
// the Realistic style they say what each patch of him is made of (and his
// face is painted afresh from them, as a villager's is — see realbody.js).
const DEFAULT_PAL = {
  skin: '#c8977b', skinDark: '#a87858', hair: '#3b2a1e',
  eye: '#ffffff', iris: '#523d89', mouth: '#8a5a44',
  shirt: '#0d9d9d', shirtDark: '#0a7f7f', legs: '#3f4e9c', boot: '#6f6f6f',
};

function paintDefaultSkin(g) {
  const F = (r, c) => { g.fillStyle = c; g.fillRect(r[0], r[1], r[2], r[3]); };
  const P = DEFAULT_PAL;
  const SKIN = P.skin, SKIN_D = P.skinDark, HAIR = P.hair;
  const SHIRT = P.shirt, SHIRT_D = P.shirtDark;
  const PANTS = P.legs, SHOE = P.boot;
  for (const p of skinParts(false, BASE)) {
    const r = p.rects;
    if (p.key === 'head') {
      for (const f of ['front', 'left', 'right', 'back']) F(r[f], SKIN);
      F(r.top, HAIR);
      F(r.bottom, SKIN_D);
      F([r.front[0], r.front[1], 8, 2], HAIR);              // the fringe
      F([r.left[0], r.left[1], 8, 4], HAIR);
      F([r.right[0], r.right[1], 8, 4], HAIR);
      F([r.back[0], r.back[1], 8, 6], HAIR);                // a full head behind
      const fx = r.front[0], fy = r.front[1];
      F([fx + 1, fy + 4, 1, 1], P.eye);                      // whites out,
      F([fx + 2, fy + 4, 1, 1], P.iris);                     // irises in
      F([fx + 5, fy + 4, 1, 1], P.iris);
      F([fx + 6, fy + 4, 1, 1], P.eye);
      F([fx + 3, fy + 5, 2, 1], SKIN_D);                     // the nose
      F([fx + 3, fy + 6, 2, 1], P.mouth);                    // the mouth
    } else if (p.key === 'body') {
      for (const f of ['front', 'left', 'right', 'back', 'top']) F(r[f], SHIRT);
      F(r.bottom, SHIRT_D);
      F([r.front[0], r.front[1] + 10, 8, 2], SHIRT_D);       // a hem's shadow
    } else if (p.key === 'armR' || p.key === 'armL') {
      for (const f of FACES) F(r[f], SKIN);
      F(r.bottom, SKIN_D);
      F([r.front[0], r.front[1], p.size[0], 1], SHIRT);      // a hint of sleeve
      F([r.back[0], r.back[1], p.size[0], 1], SHIRT);
      F([r.left[0], r.left[1], p.size[2], 1], SHIRT);
      F([r.right[0], r.right[1], p.size[2], 1], SHIRT);
    } else {
      for (const f of FACES) F(r[f], PANTS);
      F(r.bottom, SHOE);
      for (const f of ['front', 'left', 'right', 'back']) {
        F([r[f][0], r[f][1] + 9, r[f][2], 3], SHOE);         // the boots
      }
    }
  }
}

// One record per skin: the canvas, the texture, and the two material sets —
// base and overlay — that every rig wearing that skin shares, exactly as the
// old face textures were shared per look. The default is painted
// synchronously so the first frame is dressed; a real skin decodes over it
// and the texture swaps in place (a new canvas, because resizing one under a
// live Three texture does not reliably reach the card).
const _skins = new Map();

function skinRecord(look) {
  const key = (look && typeof look.skin === 'string' && look.skin) || 'default';
  let rec = _skins.get(key);
  if (rec) {
    // A look may arrive again CARRYING FIRE it did not carry before — the
    // frames ride on the look, not in the key — so a cached record still
    // learns to burn.
    if (look?.frames?.length > 1 && !rec.framesWanted) loadFrames(rec, look.frames);
    return rec;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BASE;
  paintDefaultSkin(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Through lit.js like every other body in the world — the villagers have
  // been lit this way since the light went in, and the one figure left out
  // was yours: standing in a house's shadow at full daylight, and never
  // warmed by the lantern beside it. The face shade stays in the tint, as
  // it does on theirs, and the Realistic style takes it back out.
  // Under the Realistic style the built-in fellow is repainted from his own
  // palette, face and all. A skin somebody made says nothing about what it is
  // made of, so its repaint tells skin from cloth by colour and hair by where
  // it is on the head (see realbody.js) — and it keeps the face its owner
  // drew. It is not repainted until it has arrived: the fellow standing in
  // for it meanwhile is not worth a repaint of his own.
  const front = skinParts(false, BASE).find((p) => p.key === 'head').rects.front;
  const fellow = { ctx: { pal: DEFAULT_PAL, atlas: true,
    faces: [{ x: front[0], y: front[1], w: front[2], pal: DEFAULT_PAL }] } };
  texture.userData.real = key === 'default' ? fellow : null;
  const matsOf = (over) => FACE_SHADES.map((sh) => {
    const m = makeLit({
      map: texture, color: new THREE.Color().setScalar(sh),
      body: true, faceShade: true, cutout: over,
      side: over ? THREE.DoubleSide : THREE.FrontSide,
    });
    m.userData.pixelMap = texture;
    dressBody(m);
    return m;
  });
  rec = { canvas, texture, base: matsOf(false), over: matsOf(true) };
  _skins.set(key, rec);
  // THE FIRE. A skin with effects arrives as a handful of frames — each one
  // a complete, ordinary 64x64 PNG — and burning is nothing more than
  // painting the next one onto this record's canvas on a slow beat. One
  // ticker for every record (see below), so ten burning villagers cost ten
  // drawImage calls every half second and not ten timers.
  if (look?.frames?.length > 1) loadFrames(rec, look.frames);
  if (key !== 'default') {
    const img = new Image();
    img.onload = () => {
      const size = img.width || BASE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0);
      // the old 64x32 format: the legs-and-arms half is missing; carry the
      // top half over and let the maker's importer do the proper conversion
      rec.canvas = cv;
      rec.texture.image = cv;
      rec.texture.needsUpdate = true;
      // the skin it was waiting for has arrived: repaint it if the style asks
      rec.texture.userData.real = rec.frames ? null
        : { ctx: { heuristic: true, fallback: 'cloth', atlas: true } };
      for (const m of [...rec.base, ...rec.over]) dressBody(m);
    };
    // a look that is not a data URL (an old save's 'tan') simply never
    // loads, and the built-in fellow stands in — that is the fallback
    img.onerror = () => {
      if (rec.frames) return;
      rec.texture.userData.real = fellow;
      for (const m of [...rec.base, ...rec.over]) dressBody(m);
    };
    img.src = key;
  }
  return rec;
}

// Load a look's fire frames into its record. Each frame is a full skin, so a
// frame that fails to load simply never joins the cycle and the skin holds
// still on whatever did — a still skin, not a broken one.
function loadFrames(rec, urls) {
  rec.framesWanted = true;
  const imgs = [];
  let left = urls.length;
  for (let i = 0; i < urls.length; i++) {
    const img = new Image();
    img.onload = () => { imgs[i] = img; if (--left === 0) armFrames(rec, imgs); };
    img.onerror = () => { if (--left === 0) armFrames(rec, imgs); };
    img.src = urls[i];
  }
}

function armFrames(rec, imgs) {
  const ok = imgs.filter(Boolean);
  if (ok.length < 2) return;
  rec.frames = ok;
  rec.frame = 0;
  // a burning skin animates its canvas, and a still repaint of it would
  // freeze the fire: it keeps its own pixels, lit all the same
  rec.texture.userData.real = null;
  for (const m of [...rec.base, ...rec.over]) dressBody(m);
}

// One beat for every burning skin in the world. Candle rate: fast enough to
// live, slow enough to cost nothing.
setInterval(() => {
  for (const rec of _skins.values()) {
    if (!rec.frames) continue;
    rec.frame = (rec.frame + 1) % rec.frames.length;
    const img = rec.frames[rec.frame];
    const cv = rec.texture.image;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    rec.texture.needsUpdate = true;
  }
}, 420);

// What a check needs to see the fire: the burning records and which frame
// each is showing. The map itself stays private.
export function burningSkins() {
  const out = [];
  for (const [key, rec] of _skins) {
    if (rec.frames) out.push({ key: key.slice(0, 24), n: rec.frames.length,
      frame: rec.frame });
  }
  return out;
}

// Empty a rig out and free its geometry. NOT its textures or materials: those
// are cached per look and shared with every other body wearing it, so
// disposing them here would blank the next one built.
function disposeRig(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    child.traverse?.((o) => { if (o.isMesh) o.geometry.dispose(); });
    if (child.isMesh) child.geometry.dispose();
    group.remove(child);
  }
}

// One material per box face, shaded like the world blocks.
// Face order is +x, -x, +y, -y, +z, -z. The body quaternion is built as
// makeBasis(right, up, -forward), so the avatar's local +Z points BACKWARD —
// the face texture therefore belongs on -Z, or you meet your own eyes every
// time the camera drops behind you.
function partMaterials(spec, what = 'metal') {
  const pick = ['side', 'side', 'top', 'bottom', 'back', 'front'];
  return pick.map((slot, i) => {
    const map = spec[slot] ?? spec.side;
    map.userData.real ??= { ctx: { fallback: what } };
    const m = makeLit({
      map, color: new THREE.Color().setScalar(FACE_SHADES[i]),
      body: true, faceShade: true,
    });
    m.userData.pixelMap = map;
    dressBody(m);
    return m;
  });
}

// ---------------------------------------------------------------------------
// what a harness is made of
//
// One tone set per armour material. The KEYS are not invented here: items.js
// decides what armour can be made of, and ARMOUR_KEYS is that list — anything
// it grows that this table has not caught up with falls back to iron's greys
// rather than to an untextured white box, so a new metal is a colour somebody
// owes rather than a bug in the wardrobe.
const ARMOUR_TONE = {
  leather: { plate: '#8a5a34', lit: '#a97347', dark: '#5c3a20', stud: '#3a2614' },
  copper: { plate: '#c2703c', lit: '#e08d54', dark: '#8a4a25', stud: '#5e3018' },
  gold: { plate: '#e0b545', lit: '#f7dd80', dark: '#a8801f', stud: '#6d5214' },
  brass: { plate: '#c9a63e', lit: '#e6c869', dark: '#8d7220', stud: '#5c4a14' },
  bronze: { plate: '#a97b3c', lit: '#cc9d58', dark: '#74511e', stud: '#4a3312' },
  iron: { plate: '#b6bcc4', lit: '#dbe0e5', dark: '#7c838c', stud: '#4c525a' },
  silver: { plate: '#cdd6dc', lit: '#f1f5f8', dark: '#93a0aa', stud: '#5e6a72' },
  diamond: { plate: '#5fd6cf', lit: '#9df0eb', dark: '#2d9994', stud: '#166260' },
};
const armourTone = (material) => ARMOUR_TONE[material] ?? ARMOUR_TONE.iron;
// so a metal added to items.js and forgotten here says so once, in the console,
// instead of quietly wearing iron for the rest of the game
for (const k of ARMOUR_KEYS ?? []) {
  if (!ARMOUR_TONE[k]) console.warn(`player.js: no armour tone for "${k}"`);
}

const _armourCache = new Map();

// A plate has to read as METAL at a quarter of a block wide, and the only two
// things that do that at this size are a lit top edge and a rivet. The rivets
// are what separate a breastplate from a shirt in a strong colour.
function armourSpecs(material) {
  const hit = _armourCache.get(material);
  if (hit) return hit;
  const M = armourTone(material);
  const plate = partTexture((g) => {
    fill(g, M.plate);
    fill(g, M.lit, 0, 0, PX, 2);
    fill(g, M.dark, 0, PX - 2, PX, 2);
    rects(g, M.stud, [2, 4, 1, 1, 13, 4, 1, 1, 2, 11, 1, 1, 13, 11, 1, 1]);
  });
  const spec = {
    side: plate,
    // A ridge down the middle, because the front is the face of the piece the
    // player sees most of and a flat rectangle there reads as a tabard.
    front: partTexture((g) => {
      fill(g, M.plate);
      fill(g, M.lit, 0, 0, PX, 2);
      rects(g, M.lit, [7, 2, 2, PX - 4]);
      rects(g, M.dark, [9, 2, 1, PX - 4]);
      rects(g, M.stud, [3, 5, 1, 1, 12, 5, 1, 1, 3, 12, 1, 1, 12, 12, 1, 1]);
    }),
    back: plate,
    top: partTexture((g) => { fill(g, M.lit); rects(g, M.plate, [0, 6, PX, 4]); }),
    bottom: partTexture((g) => fill(g, M.dark)),
  };
  _armourCache.set(material, spec);
  return spec;
}

// ---------------------------------------------------------------------------
// the figure
//
// KherveSkins' model, box for box: six parts — an 8-unit cube of head, an
// 8x12x4 trunk, one-piece 4x12x4 limbs (3 wide on a slim skin) — each part a
// base box and a slightly larger overlay shell wearing the skin's second
// layer, every joint at the same pivot the maker animates. Nothing is
// modelled that the skin does not paint: no hair boxes, no painted-on faces,
// no wardrobe. The man IS his skin, which is the whole point.
//
// The knee, ankle, elbow and wrist survive as EMPTY joints so every pose in
// the game keeps its handles — the boat's seat, the wagon's, the riding pose
// and the held item all address them — but they carry no geometry: a
// one-piece limb that swings whole from the hip is the classic walk, and
// bending it would be somebody else's man.

export function createAvatar(look = DEFAULT_LOOK, into = null,
  worn = look?.armour ?? null) {
  const slim = !!look?.slim;
  const rec = skinRecord(look);
  const group = into ?? new THREE.Group();
  // Reusing a group means REPLACING what is in it — see disposeRig.
  if (into) disposeRig(group);
  group.scale.setScalar(1);      // one stature for everybody, as the classic has it
  const rig = new THREE.Group();
  group.add(rig);
  const parts = {
    group, rig, look: { ...DEFAULT_LOOK, ...look },
    build: { height: 1, slim },
  };

  const made = {};
  const defs = skinParts(slim, BASE);
  const byKey = Object.fromEntries(defs.map((p) => [p.key, p]));

  // One part: a joint at the pivot, the base box, the overlay shell. `oy` is
  // the parent's own height in units, subtracted so a part re-parented under
  // the chest keeps its absolute place.
  const build = (key, parent, oy) => {
    const p = byKey[key];
    const [w, h, d] = p.size;
    const joint = new THREE.Group();
    joint.position.set(p.pivot[0] * PXM, (p.pivot[1] - oy) * PXM, p.pivot[2] * PXM);
    const geo = new THREE.BoxGeometry(w * PXM * WELD, h * PXM * WELD, d * PXM * WELD);
    setBoxUV(geo, p.rects, BASE);
    const mesh = new THREE.Mesh(geo, rec.base);
    mesh.name = p.key;
    mesh.position.set((p.at[0] - p.pivot[0]) * PXM,
      (p.at[1] - p.pivot[1]) * PXM, (p.at[2] - p.pivot[2]) * PXM);
    joint.add(mesh);
    const grow = OVER_GROW[p.key] ?? 0.5;
    const geo2 = new THREE.BoxGeometry(
      (w + grow) * PXM, (h + grow) * PXM, (d + grow) * PXM);
    setBoxUV(geo2, p.overRects, BASE);
    const shell = new THREE.Mesh(geo2, rec.over);
    shell.name = p.key;
    shell.position.copy(mesh.position);
    shell.renderOrder = 1;
    joint.add(shell);
    parent.add(joint);
    made[p.key] = { joint, mesh, shell, def: p };
    return joint;
  };

  // A part joint plus the two empty joints the game's poses expect below it.
  const limb = (key, parent, oy) => {
    const joint = build(key, parent, oy);
    const mid = new THREE.Group();
    mid.position.y = -6 * PXM;
    joint.add(mid);
    const end = new THREE.Group();
    end.position.y = -4 * PXM;
    mid.add(end);
    return [joint, mid, end];
  };

  // The chest group is the waist pivot: body, head and arms hang off it, so
  // the walk's slight counter-twist carries all three, and the legs stay on
  // the rig — the same split the old rig had, at the classic belt line.
  const chest = new THREE.Group();
  chest.position.set(0, 12 * PXM, 0);
  rig.add(chest);
  parts.chest = chest;
  parts.chestY = 12 * PXM;

  build('body', chest, 12);
  build('head', chest, 12);
  const [shR, elbowR, wristR] = limb('armR', chest, 12);
  const [shL, elbowL, wristL] = limb('armL', chest, 12);
  const [hipR, kneeR, ankleR] = limb('legR', rig, 0);
  const [hipL, kneeL, ankleL] = limb('legL', rig, 0);

  parts.arms = {
    R: { shoulder: shR, elbow: elbowR, wrist: wristR, hand: made.armR.mesh },
    L: { shoulder: shL, elbow: elbowL, wrist: wristL, hand: made.armL.mesh },
  };
  parts.legs = {
    R: { hip: hipR, knee: kneeR, ankle: ankleR },
    L: { hip: hipL, knee: kneeL, ankle: ankleL },
  };
  parts.head = made.head.joint;

  // where a held tool or block is gripped: inside the right fist, so it
  // inherits the shoulder and swings when the arm does
  const anchor = (x, parent) => {
    const g = new THREE.Group();
    g.position.set(x, -0.075, -0.01);
    parent.add(g);
    return g;
  };
  parts.handAnchor = anchor(0.005, wristR);
  parts.offAnchor = anchor(-0.005, wristL);

  // names older call sites still use
  parts.legL = hipL;
  parts.legR = hipR;
  parts.armL = shL;
  parts.armR = shR;
  parts.torso = made.body.mesh;
  parts.waist = made.body.mesh;
  dressAvatar(parts, worn);
  return parts;
}

// ---------------------------------------------------------------------------
// the harness
//
// `worn` is four entries in ARMOUR_SLOTS order — helmet, chestplate,
// leggings, boots — each a material key from items.js or null. Every piece
// is a plain box parented to the JOINT the limb under it hangs off, so a
// thigh plate swings with the stride and a helmet turns with the head. The
// leg plates hang off the HIP (the leg is one piece now, so there is no knee
// for a cop to sit on), and the boot rides the same joint at the foot end.
export function dressAvatar(parts, worn = null) {
  for (const m of parts.armourMeshes ?? []) {
    m.geometry.dispose();
    m.parent?.remove(m);
  }
  parts.armourMeshes = [];
  parts.worn = worn && worn.some(Boolean) ? [...worn] : null;
  if (!parts.worn) return parts;

  const u = PXM;
  const AW = (parts.build?.slim ? 3 : 4) * u;    // an arm's width
  const plate = (mat, w, h, d, x, y, z, parent, pivotTop = false) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) geo.translate(0, -h / 2, 0);
    const mesh = new THREE.Mesh(geo, partMaterials(armourSpecs(mat),
      mat === 'leather' ? 'leather' : 'metal'));
    mesh.position.set(x, y, z);
    mesh.name = 'armour';
    parent.add(mesh);
    parts.armourMeshes.push(mesh);
    return mesh;
  };
  const [helm, chest, legs, boots] = ARMOUR_SLOTS.map((_, i) => worn[i] || null);

  // --- helmet: a skull cap at the brow, a rim, a nasal, cheek guards -------
  // Head-local y runs 0 (chin) to 8 units (crown); the face is at z = -4.
  if (helm) {
    const H = parts.head;
    plate(helm, 9.4 * u, 4.4 * u, 9.4 * u, 0, 6.0 * u, 0, H);
    plate(helm, 10.2 * u, 1.5 * u, 10.2 * u, 0, 4.0 * u, 0, H);
    plate(helm, 1.6 * u, 3.0 * u, 1.0 * u, 0, 2.6 * u, -4.8 * u, H);
    for (const s of [-1, 1]) {
      plate(helm, 1.2 * u, 2.8 * u, 3.6 * u, s * 4.8 * u, 2.6 * u, -1.6 * u, H);
    }
  }

  // --- chestplate: breast, faulds, pauldrons, upper-arm bands --------------
  // Chest-local y runs 0 (belt) to 12 units (shoulders); trunk is 8 x 4.
  if (chest) {
    const C = parts.chest;
    plate(chest, 8 * u + 0.05, 5.2 * u, 4 * u + 0.05, 0, 9.2 * u, 0, C);
    plate(chest, 8 * u + 0.04, 4.6 * u, 4 * u + 0.04, 0, 4.4 * u, 0, C);
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      plate(chest, AW + 1.4 * u, 2.2 * u, 4 * u + 1.4 * u,
        s * (4 * u + AW / 2), 11.9 * u, 0, C);
      plate(chest, AW + 0.05, 4.2 * u, AW + 0.05, 0, -1.8 * u, 0,
        parts.arms[side].shoulder, true);
    }
  }

  // --- leggings: a skirt on the hips and a plate down each thigh -----------
  if (legs) {
    plate(legs, 8 * u + 0.05, 3.4 * u, 4 * u + 0.05, 0, 10.5 * u, 0, parts.rig);
    for (const side of ['L', 'R']) {
      plate(legs, 4 * u + 0.045, 6.8 * u, 4 * u + 0.045, 0, 0, 0,
        parts.legs[side].hip, true);
    }
  }

  // --- boots: on the hip joint too, at the foot end, so they swing ---------
  if (boots) {
    for (const side of ['L', 'R']) {
      plate(boots, 4 * u + 0.05, 3.6 * u, 4 * u + 0.05,
        0, -10.3 * u, 0, parts.legs[side].hip);
    }
  }
  return parts;
}

// Drive the rig, the classic way: whole limbs swinging from the shoulder and
// the hip, opposite corners together, and nothing bending in the middle —
// exactly the walk the maker's own preview does. `phase` is the walk cycle,
// `amp` the stride, `t` a free clock for the idle sway, the two swing
// arguments come from the mining swing, and `air` blends a jump over the top.
//
// Every channel here is ASSIGNED, never added to — the rule that stops a
// horse ride leaving your legs crossed for the rest of the session. That
// includes the knee, ankle, elbow and wrist: they are empty joints now, but
// a seated pose still writes them, so this owns them back every frame.
export function poseAvatar(parts, phase, amp, t = nowSeconds(),
  swingK = 0, swingOsc = 0, air = 0) {
  const k = Math.min(1, amp / 0.55);
  const s = Math.sin(phase);
  const breath = Math.sin(t * 1.5);
  const still = 1 - k;
  const lead = s >= 0 ? 1 : -1;
  const A = Math.min(1, air);

  for (const side of ['L', 'R']) {
    const leg = parts.legs[side];
    const ph = side === 'L' ? phase : phase + Math.PI;
    leg.hip.rotation.x = Math.sin(ph) * amp * 1.25;
    leg.hip.rotation.z = 0;
    leg.knee.rotation.x = 0;
    leg.ankle.rotation.x = 0;
    if (A > 0) {
      const leads = (side === 'L' ? 1 : -1) === lead;
      const jHip = leads ? 0.8 : -0.45;
      leg.hip.rotation.x += (jHip - leg.hip.rotation.x) * A;
    }
  }

  for (const side of ['L', 'R']) {
    const arm = parts.arms[side];
    const sign = side === 'L' ? -1 : 1;       // opposite the same-side leg
    arm.shoulder.rotation.x = s * sign * amp;
    arm.shoulder.rotation.z = sign * (0.05 + breath * 0.025 * still);
    arm.elbow.rotation.x = 0;
    arm.wrist.rotation.x = 0;
    if (A > 0) {
      const up = (sign === lead);
      const jShoulder = up ? 1.1 : -0.8;
      arm.shoulder.rotation.x += (jShoulder - arm.shoulder.rotation.x) * A;
      arm.shoulder.rotation.z += (sign * 0.25 - arm.shoulder.rotation.z) * A;
    }
  }

  // mining swing: the whole arm, overhead then down, blended over the walk
  if (swingK > 0) {
    const arm = parts.arms.R;
    const raise = 2.6 - 1.6 * swingOsc;
    arm.shoulder.rotation.x += (raise - arm.shoulder.rotation.x) * swingK;
    arm.shoulder.rotation.z += (0.12 - arm.shoulder.rotation.z) * swingK;
  }

  // a small counter-twist and a breath — subtle, because the classic body is
  // one slab and a big twist reads as the whole man wobbling
  const chest = parts.chest;
  chest.rotation.y = 0.08 * s * k;
  chest.rotation.x = -0.03 * k + breath * 0.015 * still;
  chest.rotation.z = 0;
  chest.position.y = parts.chestY + breath * 0.006 * still;

  parts.head.rotation.y = -chest.rotation.y * 0.85
    + Math.sin(t * 0.37) * 0.10 * still;
  parts.head.rotation.x = -0.03 * k + Math.sin(t * 0.9) * 0.02;
  parts.head.rotation.z = 0;

  parts.rig.position.y = breath * 0.003 * still;
  parts.rig.rotation.z = 0;
  parts.rig.rotation.x = -0.04 * k;

  if (A > 0) {
    chest.rotation.x += (-0.15 - chest.rotation.x) * A;
    parts.head.rotation.x += (0.06 - parts.head.rotation.x) * A;
    parts.rig.rotation.x += (-0.12 - parts.rig.rotation.x) * A;
    parts.rig.position.y += (0 - parts.rig.position.y) * A;
  }
}

// ---------------------------------------------------------------------------
// held item
//
// Tools are a flat sprite of their atlas icon; blocks are a small cube. Both
// are built twice from one geometry: once inside the avatar's fist and once
// on the first-person view arm, so whichever body is visible shows the item
// and the mining swing carries it either way.

const HELD_TOOL = 0.44;    // sprite size in blocks; a pickaxe is ~0.6 diagonal
const HELD_BLOCK = 0.30;
const UV_CORNERS = [[0, 1], [1, 1], [0, 0], [1, 0]];

// --- the first-person arm ----------------------------------------------------
//
// Where your own hand sits on the screen. Every number here is in camera
// space: -Z is into the screen, +X right, +Y up, and the camera is a 60°
// perspective, so at z = -0.6 the visible half-height is about 0.35 — which
// is why the arm lives at y ≈ -0.4 and not at -1.
//
// It reads as one object but it is doing two jobs at once, and they pull in
// opposite directions: the arm has to be far enough into the corner to leave
// the middle of the screen alone, and the ITEM has to be big enough and near
// enough to the centre to be identifiable. Minecraft solves it by putting the
// fist in the bottom-right corner and letting the tool lean up and inward
// across the corner, which is what these values are copying.
//
// Mutable so it can be nudged live: set the fields, call player.buildAvatar().
export const VIEW_ARM = {
  // The corner it sits in is the SCREEN's corner, not a fixed point in camera
  // space, which is what `anchor` buys. A fixed x sat a different distance
  // from the right edge on every window shape: at 900x560 the tool was a third
  // of the picture, and at 1080x880 an empty hand fell clean off the screen,
  // because the frustum's half-width scales with the aspect and the arm did
  // not. These are fractions of the half-width and half-height at the arm's
  // own z, so the fist keeps its place in the corner whatever the window does.
  //
  // Both are past 1.0 on purpose: the fist itself sits OUTSIDE the frame and
  // only what it holds leans back in, which is all Minecraft shows you and all
  // you need — the hotbar already says what you are carrying.
  anchor: [1.18, 1.52],        // right, down — 1.0 is exactly the frame edge
  // A bare fist is a much smaller object than a tool and it hangs at the wrong
  // end of the group, so the same corner that frames a pickaxe hides a hand
  // altogether. It gets its own, pulled in far enough to leave a knuckle.
  emptyAnchor: [1.06, 1.18],
  // ...and the corner for a HAND WITH SOMETHING IN IT. The fist used to sit
  // outside the frame whenever it held anything, so a sword floated in the
  // corner with nobody holding it — right about the blade, wrong about the
  // picture. Now the fist comes in far enough to be seen closing on the
  // grip, and the item leans in from it.
  holdAnchor: [1.10, 1.34],
  // the holding arm: flipped end for end from the empty one, so the fist is
  // the end nearest the middle of the screen and the shoulder runs off the
  // corner. Pitch, yaw, roll; the roll is measured from straight down.
  holdRot: [-0.55, 0.30, Math.PI + 0.42],
  // where the fist closes, relative to the item's own grip — which is the
  // holder's origin: buildSolidRes moves the icon's grip to it (see gripOf)
  // and a block hangs from its middle, so the block's fist sits a little
  // under it. [x, y, z] in the arm's frame.
  fist: { tool: [0.0, -0.02, 0.0], block: [0.0, -0.09, 0.0], standing: [0, -0.04, 0] },
  pos: [0, 0, -0.62],          // x/y are the anchor's, z is the arm's depth
  rot: [0.38, -0.42, 0.05],    // pitch, yaw, roll of the whole arm
  // The swing is not a wiggle. In Minecraft the blade comes up and INWARD
  // across the lower half of the view, so at the top of the stroke the tool is
  // a diagonal bar over the ground you are hitting — that is the frame that
  // says "you swung", and a rotation on its own does not read at all when the
  // grip is parked outside the picture. `in`/`up` are fractions of the frame's
  // half-width and half-height, so the sweep covers the same part of the
  // screen whatever shape the window is.
  swing: { pitch: -1.15, roll: 0.16, depth: -0.14, in: 0.62, up: 0.72 },
  seg: 0.125,                  // arm thickness, in blocks
  reach: [-0.07, -0.24, -0.38],  // z of sleeve, forearm, fist
  hold: [0.02, 0.00, -0.40],   // where the item hangs off the fist
  // With the arm out of the way the item IS the viewmodel, so it is drawn
  // about twice the size it was when it had to share the corner with a fist.
  toolScale: 1.70,             // the sprite is drawn small for the hotbar
  blockScale: 1.55,
  // The extruded item — see itemmodel.js — is posed with these two.
  //
  // `solidTurn` is how far off square it is held. A slab seen exactly
  // face on is a picture of a slab; a few degrees puts the rim in view and
  // that is the whole difference between a sword and a decal of a sword.
  //
  // `solidScale` is why it can now be SMALLER. The flat sprite had to be
  // enormous because size was the only thing it had — a picture with no depth
  // and no edge reads as nothing else until it is big. The reason the player
  // called it pixelated is the same number: sixteen texels of art blown up
  // across a third of the screen is thirty screen pixels a texel. The art is
  // 32 now and the object has a shape, so it can sit where a held tool
  // actually sits and be sharper for both reasons at once.
  solidTurn: 0.34,
  solidScale: 0.74,
};

// main.js can hand us its atlas, but it does not have to: the atlas is a
// deterministic procedural texture, so building our own gives exactly the
// same pixels and the held item cannot silently fail to appear.
let _ownAtlas = null;
const ownAtlas = () => (_ownAtlas ??= buildAtlas());

// point every face of `geo` at its atlas tile (1 tile for a quad, 6 for a box)
function setTileUV(geo, tiles) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < tiles.length; f++) {
    for (let i = 0; i < 4; i++) {
      const [u, v] = UV_CORNERS[i];
      const [au, av] = tileUV(tiles[f], u, v);
      uv.setXY(f * 4 + i, au, av);
    }
  }
  uv.needsUpdate = true;
}

// --- the world gets dark, and so does what you are holding -------------------
//
// The player's own materials are flat MeshBasicMaterials and nothing ever
// dimmed them, so at midnight the figure and the tool in its fist were the
// brightest things on the screen — a pickaxe glowing in a dark forest.
//
// Every one of them is remembered with the colour it was born with and scaled
// together. The base is kept rather than multiplied in place, because dimming
// a colour you have already dimmed is a one-way trip to black; and the face
// shade stays inside the base, because that is which way the face points and
// it does not change with the hour.
const _playerMats = [];
export function registerPlayerMat(mat) {
  const c = mat.color;
  _playerMats.push({ mat, r: c.r, g: c.g, b: c.b });
  return mat;
}
export function setPlayerBright(k) {
  for (const e of _playerMats) e.mat.color.setRGB(e.r * k, e.g * k, e.b * k);
}

// The same item, with a thickness. `solid` is the first-person copy: see
// itemmodel.js for why the icon is extruded rather than modelled by hand, and
// see refreshHeld for why only this copy gets it — at third-person size a
// hundred rim quads buy nothing you can see.
//
// The frame is the flat quad's frame exactly — centred, +x right, +y up — so
// the grip translation and the yaw below are the same two lines either way and
// nothing that poses a held item has to know which kind it got.
function buildSolidRes(atlas, tile, kind) {
  const image = atlas?.image;
  if (!image?.getContext || !canExtrude(image, tile)) return null;
  // under the Realistic style a tool's wall follows its repaint's smooth
  // outline rather than stepping round the icon's texels (see realitem.js)
  const smooth = realBodiesOn() && kind !== 'standing';
  const geo = smooth ? smoothItemGeometry(atlas, tile, HELD_TOOL, HELD_TOOL * ITEM_DEPTH)
    : buildItemGeometry(image, tile, HELD_TOOL);
  if (kind === 'standing') {
    geo.translate(0, HELD_TOOL * 0.34, 0);
  } else {
    // ...and the grip comes off the icon — see gripOf. The flat copy keeps the
    // old fixed corner, because it is the one every remote player and every
    // third-person body has been drawn with.
    const g = gripOf(image, tile);
    geo.translate(HELD_TOOL * (0.5 - g.x), HELD_TOOL * (0.5 - g.y), 0);
  }
  geo.rotateY(Math.PI / 2);
  // How much the pose has to take BACK, so an icon drawn upright and one drawn
  // corner to corner come to rest at the same angle on the screen. A quarter
  // turn is what every pose in here was measured against — see leanOf — so a
  // tool that is already diagonal corrects by nothing at all and the numbers
  // the player set with a protractor stand exactly as they were.
  // A torch is not corrected: it is not held at an angle in the first place,
  // it stands in the hand the way it stands in the ground.
  const roll = kind === 'standing' ? 0 : Math.PI / 4 - leanOf(image, tile);
  // Under the Realistic style the thing itself: a torch or a flower the
  // painted one out of the style's own tiles, anything else its icon
  // repainted as iron, wood, stone or bread (see realitem.js)
  if (realBodiesOn()) {
    if (kind === 'standing') return { geo, mats: terrainMaterial(atlas, true), roll };
    return { geo, mats: itemMaterial(atlas, tile, { vertexColors: true }), roll };
  }
  const mats = registerPlayerMat(new THREE.MeshBasicMaterial({
    map: atlas, alphaTest: 0.5, vertexColors: true, side: THREE.DoubleSide,
  }));
  return { geo, mats, roll };
}

// The same three shapes as below, in the Realistic style's materials: a block
// in the photographs the ground wears, a torch or a flower in the painted
// plant, and a tool its icon repainted — the flat quad here with UVs running
// across the icon's own texture rather than into the atlas.
function buildRealHeld(atlas, tile, kind, tiles) {
  if (kind === 'block') {
    const geo = new THREE.BoxGeometry(HELD_BLOCK, HELD_BLOCK, HELD_BLOCK);
    setTileUV(geo, tiles ?? [tile, tile, tile, tile, tile, tile]);
    return { geo, mats: terrainMaterial(atlas) };
  }
  const geo = new THREE.PlaneGeometry(HELD_TOOL, HELD_TOOL);
  if (kind === 'standing') {
    setTileUV(geo, [tile]);
    geo.translate(0, HELD_TOOL * 0.34, 0);
    geo.rotateY(Math.PI / 2);
    return { geo, mats: terrainMaterial(atlas, true) };
  }
  geo.translate(HELD_TOOL * 0.22, HELD_TOOL * 0.28, 0);
  geo.rotateY(Math.PI / 2);
  return { geo, mats: itemMaterial(atlas, tile) };
}

function buildHeldRes(atlas, tile, kind, tiles) {
  if (realBodiesOn()) return buildRealHeld(atlas, tile, kind, tiles);
  if (kind === 'block') {
    const geo = new THREE.BoxGeometry(HELD_BLOCK, HELD_BLOCK, HELD_BLOCK);
    setTileUV(geo, tiles ?? [tile, tile, tile, tile, tile, tile]);
    const mats = FACE_SHADES.map((sh) => registerPlayerMat(
      new THREE.MeshBasicMaterial({
        map: atlas, alphaTest: 0.5,
        color: new THREE.Color().setScalar(sh),
      })));
    return { geo, mats };
  }
  const geo = new THREE.PlaneGeometry(HELD_TOOL, HELD_TOOL);
  setTileUV(geo, [tile]);
  if (kind === 'standing') {
    // A TORCH IS NOT A CUBE, and neither is a flower. Both are placeable, so
    // both were built as a box with their own tile on all six faces — which
    // puts three torches at three angles in your fist and none of them the
    // right way up. Held as a flat sprite instead, gripped at the FOOT of the
    // icon rather than at a tool's corner, so it stands in the hand the way it
    // stands in the ground. items.js decides which blocks these are.
    geo.translate(0, HELD_TOOL * 0.34, 0);
    geo.rotateY(Math.PI / 2);
    return { geo, mats: registerPlayerMat(new THREE.MeshBasicMaterial({
      map: atlas, alphaTest: 0.5, side: THREE.DoubleSide })) };
  }
  // Every tool icon is drawn with its head at the top right and the butt of
  // the handle near the bottom left. Moving that grip point to the origin is
  // what lets the sprite pivot in the fist instead of about its own middle.
  geo.translate(HELD_TOOL * 0.22, HELD_TOOL * 0.28, 0);
  // the icon's +X (the head end) has to point the way the body faces, and the
  // body faces -Z — same rule as partMaterials
  geo.rotateY(Math.PI / 2);
  const mats = registerPlayerMat(new THREE.MeshBasicMaterial({
    map: atlas, alphaTest: 0.5, side: THREE.DoubleSide,
  }));
  return { geo, mats };
}

// Place one copy. `view` is the first-person one: there the sprite has to be
// yawed to face the camera (edge on, a quad is invisible) and then spun in
// the screen plane so the head points up and inwards, as it does in Minecraft.
function poseHeld(holder, mesh, kind, view, solid = false, roll = 0) {
  mesh.rotation.set(0, 0, 0);
  // A SOLID SEEN SQUARE ON IS A PICTURE AGAIN. The extruded item has a rim,
  // and the rim is the whole reason it was extruded — so the first-person copy
  // is turned a few degrees off the eye, which is enough to put one lit side
  // under the blade and nothing like enough to foreshorten it.
  const turn = solid ? VIEW_ARM.solidTurn : 0;
  if (kind === 'standing') {
    // Upright, and tipped a little away from the eye so it does not read as a
    // sticker on the screen — a torch is carried, not presented.
    if (view) {
      mesh.rotation.y = -Math.PI / 2 + turn;
      holder.position.set(0, 0.01, -0.03);
      holder.rotation.set(0, 0, 0.22);
      holder.scale.setScalar(VIEW_ARM.toolScale * (solid ? VIEW_ARM.solidScale : 1));
    } else {
      holder.position.set(0.012, -0.01, 0);
      holder.rotation.set(0.12, 0.70, 0.10);
    }
    return;
  }
  if (kind === 'block') {
    if (view) {
      holder.position.set(0.01, -0.02, -0.10);
      holder.rotation.set(0.20, 0.60, 0.05);
      holder.scale.setScalar(VIEW_ARM.blockScale);
    } else {
      holder.position.set(0, -0.07, -0.10);
      holder.rotation.set(0.10, 0.50, 0.06);
    }
    return;
  }
  if (view) {
    // Square to the eye, then spun in the screen plane so the head points up
    // and inward across the corner — the tool has to be READABLE, and a
    // sprite seen at an angle is a sliver.
    mesh.rotation.y = -Math.PI / 2 + turn;
    holder.position.set(0, 0.02, -0.02);
    holder.rotation.set(0, 0, 1.15 + roll);
    holder.scale.setScalar(VIEW_ARM.toolScale * (solid ? VIEW_ARM.solidScale : 1));
  } else {
    // Third person the camera sits behind you, and the sprite's normal starts
    // sideways, so a plain grip would be edge on: yaw it across the body until
    // it has some area, and lift the head with a positive x so it reads as a
    // tool being carried rather than a plank hanging from the wrist.
    holder.position.set(0.012, -0.01, 0);
    holder.rotation.set(0.45, 0.70, 0);
  }
}

export class Player {
  // the one burial this session, kept for the report — see snapshotStuck
  static stuckReport = null;
  // opts: { atlas } — the THREE texture main.js built with buildAtlas(). It is
  // optional; when it is missing player.js builds its own identical copy.
  constructor(planet, camera, opts = {}) {
    this.planet = planet;
    this.camera = camera;
    this.pos = new THREE.Vector3();       // feet, world coords
    this.vel = new THREE.Vector3();       // tangential only
    this.radialVel = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(0, 0, -1);
    this.bodyQuat = new THREE.Quaternion();
    this.eye = new THREE.Vector3();
    this.lookDir = new THREE.Vector3();
    this.pitch = 0;
    this.grounded = false;
    // set by moveHorizontal when geometry clamped the body this step
    this.hitWall = false;
    this.inWater = false;
    this.climbing = false;
    this.sprinting = false;
    this.sneaking = false;
    this.keys = new Set();
    this.walkPhase = 0;
    this.animTime = 0;
    this.clock = 0;          // physics clock, advanced per substep
    this.stuckT = 0;         // seconds spent continuously inside the world

    // movement state (see step())
    this.coyote = 0;         // grace left to still jump after leaving ground
    this.jumpBuf = 0;        // grace left for a jump pressed before landing
    this.jumpHeld = false;
    this.fwdHeld = false;
    this.lastFwdTap = -1;
    this.tapSprint = false;
    this.ladderGrace = 0;

    // camera feel: all three are eye-only, so this.pos stays exact
    this.stepLag = 0;        // eye height owed after a step up or down
    this.fenceLo = false;    // see setFenceLo

    this.dip = 0;            // landing dip, a critically damped spring
    this.seat = 0;           // how far the eye is dropped while sat on something
    this.dipVel = 0;
    this.sprintBlend = 0;
    this.fovAdded = 0;       // degrees this module has added to camera.fov

    // reused per-step cell frame; see cellFrame()
    this.frame = {
      f: 0, cu: 0, cv: 0, su: 1, sv: 1, ru: 0.3, rv: 0.3, cos: 0,
      eu: new THREE.Vector3(), ev: new THREE.Vector3(),
    };
    this.swingActive = false;
    // Set by main.js while the player is on a horse. It suppresses the legs
    // (see moveHorizontal) and the walk cycle — entities.js is moving the
    // body, and player.js only has to draw it and aim the camera.
    this.riding = false;
    this.airBlend = 0;     // 0 on the ground, 1 mid-jump; see poseAvatar
    this.flyBlend = 0;     // 1 while creative flight is carrying you
    this.swingTime = 0;
    this.swingK = 0;
    this.swingPhase = 0;
    this.viewDist = 0;
    this.inPlay = false;   // main.js flips this on entering/leaving walk mode
    this.onLand = null;    // optional cb(fallSpeed) — main.js hangs a thump on it
    this.atlas = opts.atlas ?? null;
    this.held = null;      // { tile, kind, tiles, gun } or null
    this.heldRes = null;   // geometry + materials shared by both copies
    this.heldMeshes = [];
    // ...and the other hand, which is the same three things again. Kept
    // separate rather than folded into the pair above, because the two hands
    // change at different moments and for different reasons: the right one
    // follows the hotbar every time you turn the wheel, the left one only
    // when you deliberately put something in it.
    this.offhand = null;
    this.offRes = null;
    this.offMeshes = [];
    // the first-person gun rig, when the held item is a weapon with a real
    // model: { holder, flash, base } — see gunmodels.js and gunFire()
    this.gunRig = null;
    this.gunKick = 0;      // recoil offset, decays every frame
    this.gunFlash = 0;     // frames of muzzle flash left
    this.bladeRig = null;  // the raised blade, when one is held
    this.look = { ...DEFAULT_LOOK, ...(opts.look ?? {}) };
    // The four worn pieces as material keys, kept HERE rather than read back
    // out of the rig: changing character throws the whole rig away, and a man
    // who takes his helmet off by putting a dress on is not what was asked for.
    this.worn = null;
    this.wornKey = '';
    this.buildAvatar();
  }

  buildAvatar() {
    const wasVisible = this.avatar ? this.avatar.visible : false;
    if (this.avatar) disposeRig(this.avatar);
    // Reuse the same group when rebuilding: main.js added it to the scene
    // once, at load, and travel.js keeps its own reference to it.
    this.parts = createAvatar(this.look, this.avatar ?? undefined, this.worn);
    this.avatar = this.parts.group;
    this.legL = this.parts.legL;
    this.legR = this.parts.legR;
    this.armL = this.parts.armL;
    this.armR = this.parts.armR;
    this.head = this.parts.head;
    this.avatar.visible = wasVisible;

    // First-person arm: YOUR OWN right arm, cut from the skin you are
    // wearing — one box, base and overlay, reaching into the screen the way
    // the classic game draws it. It is hidden while you hold something, so a
    // tool never shares the corner with a fist; see refreshHeld.
    if (this.viewArm) {
      this.camera.remove(this.viewArm);
      disposeRig(this.viewArm);
    }
    const V = VIEW_ARM;
    const view = new THREE.Group();
    view.position.set(...V.pos);
    view.rotation.set(...V.rot);
    const rec = skinRecord(this.look);
    const pArm = skinParts(!!this.look?.slim, BASE)
      .find((x) => x.key === 'armR');
    const AS = 0.055;                 // one skin unit, in camera blocks
    const armAt = (size, rectsOf, mats, order) => {
      const geo = new THREE.BoxGeometry(
        size[0] * AS, size[1] * AS, size[2] * AS);
      setBoxUV(geo, rectsOf, BASE);
      const m = new THREE.Mesh(geo, mats);
      // mostly upright, the classic way: the shoulder end reaches up into
      // the corner, the hand runs off the bottom edge, and a small lean
      // shows the arm's length and its inner face rather than its top
      m.rotation.set(0.38, 0.42, 0.06);
      m.position.set(0.02, -0.16, (V.reach[0] + V.reach[2]) / 2);
      m.renderOrder = order;
      view.add(m);
      return m;
    };
    const grow = OVER_GROW.armR ?? 0.5;
    this.viewSegs = [
      armAt(pArm.size, pArm.rects, rec.base, 0),
      armAt([pArm.size[0] + grow, pArm.size[1] + grow, pArm.size[2] + grow],
        pArm.overRects, rec.over, 1),
    ];
    // half the arm's length, for putting its fist end somewhere on purpose
    this.viewArmHalf = (pArm.size[1] * AS) / 2;
    this.viewHold = new THREE.Group();
    this.viewHold.position.set(...V.hold);
    view.add(this.viewHold);
    // The other hand, mirrored across the screen. It hangs off the CAMERA
    // rather than off `view`: the view arm is hidden whenever the right hand
    // is holding something (a tool reads better without a bare fist beside
    // it), and the whole point of this hand is that it keeps holding its lamp
    // while the right one works.
    // The other hand, in the OTHER corner. A group of its own rather than a
    // mirrored copy of the arm: a negative scale would flip the winding on
    // everything inside it, so the mirroring is done by negating the x of the
    // placement and the y/z of the rotation, which is the same picture with
    // the triangles still facing out.
    //
    // It does NOT hang off the camera directly. `viewArm` is positioned every
    // frame from the frustum's own half-width so the fist keeps its corner
    // whatever shape the window is; a group pinned to the camera misses all
    // of that and the lantern ends up a metre from your eye, filling the
    // screen. This one is placed by the same arithmetic, negated.
    const off = new THREE.Group();
    off.position.set(-V.pos[0], V.pos[1], V.pos[2]);
    off.rotation.set(V.rot[0], -V.rot[1], -V.rot[2]);
    this.viewHoldOff = new THREE.Group();
    this.viewHoldOff.position.set(-V.hold[0], V.hold[1], V.hold[2]);
    off.add(this.viewHoldOff);
    off.visible = view.visible;
    this.viewArmOff = off;
    this.camera.add(off);
    // Same rule setView applies, not a flat false: a rebuild happens whenever
    // you change character, and hiding the hand until the next F press is not
    // what anyone asked for.
    view.visible = this.inPlay && this.viewDist === 0;
    if (this.viewArmOff) this.viewArmOff.visible = view.visible && !!this.offhand;
    this.viewArm = view;
    this.camera.add(this.viewArm);

    this.refreshViewSleeve();
    this.refreshHeld();
    this.refreshOffhand();
  }

  /**
   * Put the four worn pieces on the body. `stacks` is an inventory's armour
   * array — four slots in ARMOUR_SLOTS order, each an item stack or null —
   * and everything this needs to know about what is in them it asks items.js.
   *
   * Cheap to call on every inventory change, which is how main.js calls it:
   * a hotbar click, a pickup or a craft leaves the four materials the same and
   * gets out at the first line.
   */
  setArmour(stacks = null) {
    const worn = ARMOUR_SLOTS.map((slot, i) => {
      const a = stacks?.[i] ? armourOf(stacks[i].id) : null;
      return a && a.slot === slot ? a.material : null;
    });
    const key = worn.join(',');
    if (key === this.wornKey) return this.worn;
    this.wornKey = key;
    this.worn = worn.some(Boolean) ? worn : null;
    dressAvatar(this.parts, this.worn);
    this.refreshViewSleeve();
    return this.worn;
  }

  // The first-person sleeve: with a chestplate on, an armour band slips over
  // the view arm's upper half; without one it comes off again. The arm's own
  // skin never changes — the plate is a separate box, as it is on the body.
  refreshViewSleeve() {
    const view = this.viewArm;
    if (!view) return;
    if (this._viewPlate) {
      this._viewPlate.geometry.dispose();
      view.remove(this._viewPlate);
      this._viewPlate = null;
    }
    const mat = this.worn?.[ARMOUR_SLOTS.indexOf('chestplate')] || null;
    const arm = this.viewSegs?.[0];
    if (!mat || !arm) return;
    const box = arm.geometry.parameters;
    const g = new THREE.BoxGeometry(box.width * 1.3, box.height * 0.45,
      box.depth * 1.3);
    g.translate(0, box.height * 0.26, 0);
    const plate = new THREE.Mesh(g, partMaterials(armourSpecs(mat),
      mat === 'leather' ? 'leather' : 'metal'));
    plate.rotation.copy(arm.rotation);
    plate.position.copy(arm.position);
    view.add(plate);
    this._viewPlate = plate;
  }

  /**
   * Change who you are: setLook({ character: 'woman', skin: 'dark' }).
   * Rebuilds the body in place, so anything holding a reference to
   * `player.avatar` keeps working.
   */
  setLook(look = {}) {
    this.look = { ...this.look, ...look };
    this.buildAvatar();
    return this.look;
  }

  // --- held item ----------------------------------------------------------

  // Optional: hand over the atlas main.js already built so the held item does
  // not need a second copy of the same texture.
  setAtlas(atlas) {
    this.atlas = atlas ?? null;
    this.refreshHeld();
  }

  // setHeldItem(item)
  //   item = null                       -> empty hand
  //   item = { tile, kind, tiles? }
  //     tile  : number, atlas tile index (items.js: itemTile(id))
  //     kind  : 'tool' | 'block' | 'none'   ('none' clears, like null)
  //     tiles : optional array of six tile indices in BoxGeometry face order
  //             (+x, -x, +y, -y, +z, -z) for blocks that differ per side
  // Cheap to call every frame: identical items are ignored.
  setHeldItem(item) {
    const kind = item?.kind ?? 'none';
    const tile = kind === 'none' ? null : item?.tile ?? null;
    const gun = kind === 'none' ? null : item?.gun ?? null;
    const blade = kind === 'none' ? false : !!item?.blade;
    // ...and the MODEL a tool or a hand weapon is held as (see toolmodels.js),
    // 'shape:material', or null to hold the icon
    const model = kind === 'none' ? null : item?.model ?? null;
    const cur = this.held;
    if (tile == null && !cur) return;
    if (cur && cur.tile === tile && cur.kind === kind
      && cur.gun === gun && cur.blade === blade && cur.model === model
      && !item?.tiles) return;
    this.held = tile == null ? null
      : { tile, kind, tiles: item.tiles ?? null, gun, blade, model };
    this.refreshHeld();
  }

  // setOffhandItem(item) — the same contract as setHeldItem, for the hand that
  // is not working. No gun rig and no blade rig: this hand carries, it does
  // not swing, so the sprite is all it ever needs.
  setOffhandItem(item) {
    const kind = item?.kind ?? 'none';
    const tile = kind === 'none' ? null : item?.tile ?? null;
    const cur = this.offhand;
    if (tile == null && !cur) return;
    if (cur && cur.tile === tile && cur.kind === kind && !item?.tiles) return;
    this.offhand = tile == null ? null
      : { tile, kind, tiles: item.tiles ?? null };
    this.refreshOffhand();
  }

  refreshOffhand() {
    for (const m of this.offMeshes) m.parent?.remove(m);
    this.offMeshes.length = 0;
    if (this.offRes) {
      this.offRes.geo.dispose();
      disposeMats(this.offRes.mats);
      this.offRes = null;
    }
    if (!this.offhand || !this.parts || !this.viewHoldOff) return;
    const { tile, kind, tiles } = this.offhand;
    this.offRes = buildHeldRes(this.atlas ?? ownAtlas(), tile, kind, tiles);
    for (const [anchor, isView] of
      [[this.parts.offAnchor, false], [this.viewHoldOff, true]]) {
      if (!anchor) continue;
      const holder = new THREE.Group();
      const mesh = new THREE.Mesh(this.offRes.geo, this.offRes.mats);
      holder.add(mesh);
      poseHeld(holder, mesh, kind, isView);
      anchor.add(holder);
      this.offMeshes.push(holder);
    }
  }

  refreshHeld() {
    for (const m of this.heldMeshes) m.parent?.remove(m);
    this.heldMeshes.length = 0;
    for (const m of this.toolModels ?? []) disposeToolModel(m);
    this.toolModels = [];
    if (this.gunRig) {
      this.gunRig.holder.parent?.remove(this.gunRig.holder);
      this.gunRig.holder.traverse((o) => o.geometry?.dispose?.());
      this.gunRig = null;
    }
    this.bladeRig = null;   // its holder is in heldMeshes, removed above
    // THE ARM STAYS. It used to be the item's stand-in — hidden the moment
    // anything was held, so a tool never shared the corner with a fist —
    // and the player looked at the sword floating in the corner and asked
    // where the hand was. So the arm is shown holding, flipped so the fist
    // is the end nearest the screen's middle and closed on the item's grip;
    // only a gun, which brings a rig of its own with the hands modelled in,
    // still hides it.
    const rigged0 = !!(this.held?.gun && hasGunModel(this.held.gun));
    this.viewHolder = null;      // the first-person holder, set below
    // The arm stays for a gun too now: the rig was built with no hands in it,
    // so hiding the arm left the gun floating in the corner exactly as the
    // sword once did. The fist closes on the rig's grip, which is its origin.
    if (this.viewSegs) for (const m of this.viewSegs) m.visible = true;
    for (const key of ['heldRes', 'solidRes']) {
      if (!this[key]) continue;
      this[key].geo.dispose();
      disposeMats(this[key].mats);
      this[key] = null;
    }
    // empty hand, or called before the rig exists
    if (!this.held || !this.parts || !this.viewHold) return;

    const { tile, kind, tiles, gun, model: modelKey } = this.held;
    const rigged = gun && hasGunModel(gun);
    const atlas = this.atlas ?? ownAtlas();
    this.heldRes = buildHeldRes(atlas, tile, kind, tiles);
    // A TOOL OR A HAND WEAPON IS A MODEL: a turned haft, a head cut and
    // bevelled, a blade with an edge (see toolmodels.js) — in both hands, the
    // one you look at and the one over your shoulder. It is built in the frame
    // the extruded icon was built in, so it poses exactly as that did.
    const modelled = !rigged && !!modelKey;
    // ...and anything else keeps the icon given a thickness, for the hand you
    // can see close up. Blocks already are solids, and a gun brings its own rig.
    this.solidRes = (!rigged && !modelled && kind !== 'block')
      ? buildSolidRes(atlas, tile, kind) : null;
    for (const [anchor, isView] of
      [[this.parts.handAnchor, false], [this.viewHold, true]]) {
      // First person, a weapon is a real rig — barrel, stock, sights — posed
      // to cross the corner toward the crosshair. The third-person fist (and
      // every remote player's) keeps the sprite: at that size the icon reads
      // better than geometry.
      if (isView && rigged) {
        const model = buildGunModel(gun, { realistic: realBodiesOn() });
        const pose = GUN_POSE[gun] ?? GUN_POSE.pistol;
        model.group.position.set(...pose.pos);
        model.group.rotation.set(...pose.rot);
        model.group.scale.setScalar(pose.scale);
        anchor.add(model.group);
        this.gunRig = { holder: model.group, flash: model.flash, base: pose };
        this.heldMeshes.push(model.group);
        this.viewHolder = model.group;
        continue;
      }
      // Solid in the hand you are looking at, flat in the one over your
      // shoulder — see buildSolidRes. A modelled tool is the model in both.
      const holder = new THREE.Group();
      let mesh;
      if (modelled) {
        mesh = buildToolModel(modelKey, { realistic: realBodiesOn(), size: HELD_TOOL });
        this.toolModels.push(mesh);
        holder.add(mesh);
        poseHeld(holder, mesh, kind, isView, isView, 0);
      } else {
        const res = (isView && this.solidRes) ? this.solidRes : this.heldRes;
        mesh = new THREE.Mesh(res.geo, res.mats);
        holder.add(mesh);
        poseHeld(holder, mesh, kind, isView, isView && !!this.solidRes,
          isView ? (this.solidRes?.roll ?? 0) : 0);
      }
      // A blade is held the way Minecraft holds one: big, point at the sky,
      // leaning just enough to read. The swing (see the camera sync) sweeps
      // it from that raised guard down toward the middle of the screen.
      if (isView && this.held.blade) {
        // The player measured the lean by protractor: the blade should rest
        // TWENTY degrees anticlockwise of straight up, and the strike should
        // carry it to seventy. z = 0.55 measured thirty clockwise on screen,
        // so rest is 0.55 + 50°, and the swing below adds the other fifty.
        const z = 1.21 + (modelled ? 0 : (this.solidRes?.roll ?? 0));
        holder.position.set(-0.16, 0.12, -0.05);
        holder.rotation.set(0.12, 0, z);
        holder.scale.setScalar(VIEW_ARM.toolScale * 1.25
          * (this.solidRes || modelled ? VIEW_ARM.solidScale : 1));
        this.bladeRig = { holder, baseX: 0.12, baseZ: z };
      }
      anchor.add(holder);
      this.heldMeshes.push(holder);
      if (isView) this.viewHolder = holder;
    }
    // ...and the arm closes on it, now that the item knows where it hangs
    this.poseViewArm(!!this.held);
  }

  // The first-person arm in one of its two poses: the empty fist, mostly
  // upright with the shoulder reaching up into the corner; or the holding
  // arm, flipped end for end so the fist — the −y end of the skin's arm box
  // — closes on the item at VIEW_ARM.fist and the shoulder runs off the
  // corner. Both segments (base and overlay) take the same pose.
  poseViewArm(holding) {
    if (!this.viewSegs) return;
    const V = VIEW_ARM;
    const half = this.viewArmHalf ?? 0.33;
    // where the item's grip is, in the arm group's own frame: the hold
    // point plus wherever poseHeld put the holder
    const hp = this.viewHolder?.position;
    const kind = this.held?.kind === 'block' ? 'block'
      : this.held?.kind === 'standing' ? 'standing' : 'tool';
    const off = V.fist[kind] ?? V.fist.tool;
    for (const m of this.viewSegs) {
      if (!holding || !hp) {
        m.rotation.set(0.38, 0.42, 0.06);
        m.position.set(0.02, -0.16, (V.reach[0] + V.reach[2]) / 2);
        continue;
      }
      m.rotation.set(...V.holdRot);
      // the fist end is at pos + R·(0, −half, 0); put it on the grip
      _v.set(0, half, 0).applyEuler(m.rotation);
      m.position.set(V.hold[0] + hp.x + off[0], V.hold[1] + hp.y + off[1],
        V.hold[2] + hp.z + off[2]).add(_v);
    }
  }

  // The moment of firing, seen from behind the gun: the muzzle blinks at the
  // barrel's own end and the whole rig kicks back and up, then eases home.
  // combat.js calls this through main.js, scaled by the weapon's recoil.
  gunFire(strength = 1) {
    if (!this.gunRig) return;
    this.gunKick = Math.min(1.6, this.gunKick + strength);
    this.gunFlash = 3;                       // frames, ~50 ms at 60
    this.gunRig.flash.visible = true;
    this.gunRig.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.6;
    this.gunRig.flash.scale.setScalar(s * (0.9 + strength * 0.3));
  }

  // ground surface radius for the column under a world position
  groundAt(p) {
    return this.planet.surfaceRadiusAtWorld(p.x, p.y, p.z);
  }

  // The point at "radius" r on the player's own vertical line. On a sphere
  // that is up * r; on the plane the footprint stays put and only y moves.
  // Everything in the vertical step that used to scale `up` or `dir` by a
  // radius goes through here, because on the plane a direction cannot carry
  // the column any more.
  colPoint(r, out = _test) {
    if (CS.FLAT) return out.set(this.pos.x, r, this.pos.z);
    return out.copy(this.up).multiplyScalar(r);
  }

  // --- true 3D collision -------------------------------------------------
  // A height field cannot express an overhang, so a tree was a solid pillar
  // and breaking one block out of it changed nothing. These sample the actual
  // cells instead, which lets you walk under leaves and through holes you dig.

  // Same predicate as the body uses, so ground and walls agree: a ladder is
  // not a ceiling you cannot climb past, and a flower is not a step.
  solidAtR(dir, r) {
    // every caller asks about the player's own column, which on the plane
    // is the footprint at height r, not a scaled direction
    if (CS.FLAT) return this.solidAt(this.pos.x, r, this.pos.z);
    return this.solidAt(dir.x * r, dir.y * r, dir.z * r);
  }

  // top surface radius of the cell containing radius r
  cellTopAt(r) {
    return R0 + Math.floor(r - R0) + 1;
  }

  // first ground within `depth` below fromR, or null
  groundWithin(dir, fromR, depth) {
    for (let t = 0.05; t <= depth; t += 0.2) {
      if (this.solidAtR(dir, fromR - t)) return this.cellTopAt(fromR - t);
    }
    return null;
  }

  blockAtWorld(p) {
    return this.planet.blockAtWorld(p.x, p.y, p.z);
  }

  solidAt(x, y, z) {
    return !isPassable(this.planet.blockAtWorld(x, y, z));
  }

  // --- the body in cell space ---------------------------------------------
  //
  // Everything below works in continuous cell coordinates (cu, cv) on one
  // cube face, because that is the frame the cells are boxes in. Coordinates
  // outside [0, S] are legal: dirFromCell simply extends the face's tangent
  // plane, and planet.get() re-projects an off-face index through the sphere,
  // so a body straddling a seam is handled without a special case.

  // is one cell solid to the body?
  solidCell(f, u, v, h) {
    return !isPassable(this.planet.get(f, u, v, h));
  }

  // The cell grid's local frame at `dir`, at radius r: face, continuous cell
  // coordinates, the world direction of increasing cu / cv, and how many
  // blocks one cell spans along each. The two grid directions are NOT
  // perpendicular (they lean by up to ~19 degrees near a face corner), so
  // `cos` is kept and used to decompose velocity properly — dotting a
  // velocity onto a skewed basis would bend a straight walk.
  cellFrame(dir, r, at = this.pos) {
    const fr = this.frame;
    // On the plane the frame is the identity everywhere: the grid axes are
    // +X and +Z, exactly one block long and exactly perpendicular. `at`
    // carries the position — a direction cannot, which is why it exists.
    if (CS.FLAT) {
      fr.f = 2;
      fr.cu = at.x + CS.S / 2;
      fr.cv = CS.S / 2 - at.z;    // v runs along -Z, matching the chart
      fr.eu.set(1, 0, 0);
      fr.ev.set(0, 0, -1);
      fr.su = 1; fr.sv = 1; fr.cos = 0;
      fr.ru = Math.min(BODY_R, BODY_CELL);
      fr.rv = fr.ru;
      return fr;
    }
    const c = CS.cellFromDir(dir.x, dir.y, dir.z, _cc);
    fr.f = c[0]; fr.cu = c[1]; fr.cv = c[2];
    CS.dirFromCell(fr.f, fr.cu, fr.cv, _c0);
    CS.dirFromCell(fr.f, fr.cu + FRAME_EPS, fr.cv, _c1);
    CS.dirFromCell(fr.f, fr.cu, fr.cv + FRAME_EPS, _c2);
    fr.eu.set(_c1[0] - _c0[0], _c1[1] - _c0[1], _c1[2] - _c0[2]);
    fr.ev.set(_c2[0] - _c0[0], _c2[1] - _c0[1], _c2[2] - _c0[2]);
    fr.su = fr.eu.length() * r / FRAME_EPS;
    fr.sv = fr.ev.length() * r / FRAME_EPS;
    fr.eu.normalize();
    fr.ev.normalize();
    fr.cos = fr.eu.dot(fr.ev);
    fr.ru = Math.min(BODY_R / fr.su, BODY_CELL);
    fr.rv = Math.min(BODY_R / fr.sv, BODY_CELL);
    return fr;
  }

  // put the feet at cell (cu, cv) on face f, radius r
  setFromCell(f, cu, cv, r) {
    if (CS.FLAT) {
      // The plane ends. There is no face round the corner to walk onto, so
      // the last sliver before the rim is a wall — you stop at the edge of
      // the drawing instead of stepping off the table into nothing.
      const lo = 0.35, hi = CS.S - 0.35;
      cu = cu < lo ? lo : cu > hi ? hi : cu;
      cv = cv < lo ? lo : cv > hi ? hi : cv;
      this.pos.set(cu - CS.S / 2, r, CS.S / 2 - cv);
      return;
    }
    CS.dirFromCell(f, cu, cv, _c0);
    this.pos.set(_c0[0], _c0[1], _c0[2]).multiplyScalar(r);
  }

  // altitude layers the body occupies with its feet at radius feetR
  layerLo(feetR) { return Math.floor(feetR + FOOT_LIFT - CS.R0); }
  layerHi(feetR) { return Math.floor(feetR + BODY - HEAD_GAP - CS.R0); }

  // A fence or closed gate holds a body out past the top of its own cell
  // (FENCE_EXTRA — the thing that makes it unjumpable). The layer tests are
  // cell-quantized, so mid-jump the feet can rise clear of the fence's layer
  // while still inside its raised collision — this flag, set from feetR by
  // every caller that knows it, makes the row tests look one layer down for
  // fences whenever the feet sit within that extra margin.
  setFenceLo(feetR) {
    const frac = (feetR + FOOT_LIFT - CS.R0) % 1;
    this.fenceLo = frac < (CS.FENCE_EXTRA ?? 0.5);
    return this.fenceLo;
  }

  fenceAt(f, u, v, h) {
    return this.fenceLo && CS.fencelike?.(this.planet.get(f, u, v, h));
  }

  // solid cell anywhere in the u-slice `iu` under the body's v span?
  rowBlockedU(f, iu, cv, rv, h0, h1) {
    const v0 = Math.floor(cv - rv), v1 = Math.floor(cv + rv);
    for (let h = h0; h <= h1; h++) {
      for (let v = v0; v <= v1; v++) if (this.solidCell(f, iu, v, h)) return true;
    }
    for (let v = v0; v <= v1; v++) if (this.fenceAt(f, iu, v, h0 - 1)) return true;
    return false;
  }

  rowBlockedV(f, iv, cu, ru, h0, h1) {
    const u0 = Math.floor(cu - ru), u1 = Math.floor(cu + ru);
    for (let h = h0; h <= h1; h++) {
      for (let u = u0; u <= u1; u++) if (this.solidCell(f, u, iv, h)) return true;
    }
    for (let u = u0; u <= u1; u++) if (this.fenceAt(f, u, iv, h0 - 1)) return true;
    return false;
  }

  boxBlocked(f, cu, cv, ru, rv, h0, h1) {
    const u0 = Math.floor(cu - ru), u1 = Math.floor(cu + ru);
    for (let u = u0; u <= u1; u++) {
      if (this.rowBlockedU(f, u, cv, rv, h0, h1)) return true;
    }
    return false;
  }

  // How far along u the body may travel before it enters a solid cell. It
  // clamps to the wall's own face rather than refusing the move, so you end
  // up touching the wall instead of one step short of it — which is what
  // makes sliding along it continue smoothly next step.
  slideU(f, from, to, cv, ru, rv, h0, h1) {
    const s = to > from ? 1 : -1;
    const i1 = Math.floor(to + s * ru);
    for (let i = Math.floor(from + s * ru); s > 0 ? i <= i1 : i >= i1; i += s) {
      if (!this.rowBlockedU(f, i, cv, rv, h0, h1)) continue;
      const stop = s > 0 ? i - ru - WALL_SKIN : i + 1 + ru + WALL_SKIN;
      return s > 0 ? Math.min(to, Math.max(from, stop))
        : Math.max(to, Math.min(from, stop));
    }
    return to;
  }

  slideV(f, from, to, cu, ru, rv, h0, h1) {
    const s = to > from ? 1 : -1;
    const i1 = Math.floor(to + s * rv);
    for (let i = Math.floor(from + s * rv); s > 0 ? i <= i1 : i >= i1; i += s) {
      if (!this.rowBlockedV(f, i, cu, ru, h0, h1)) continue;
      const stop = s > 0 ? i - rv - WALL_SKIN : i + 1 + rv + WALL_SKIN;
      return s > 0 ? Math.min(to, Math.max(from, stop))
        : Math.max(to, Math.min(from, stop));
    }
    return to;
  }

  // Ground under every cell the body's footprint covers? This is the sneak
  // edge-guard test: the whole box has to be supported, so you stop with your
  // toes at the lip instead of with half of you over the drop.
  footingUnder(f, cu, cv, ru, rv, feetR) {
    const h1 = Math.floor(feetR - 0.05 - CS.R0);
    const h0 = Math.floor(feetR - STEP_DOWN - CS.R0);
    const u0 = Math.floor(cu - ru), u1 = Math.floor(cu + ru);
    const v0 = Math.floor(cv - rv), v1 = Math.floor(cv + rv);
    for (let u = u0; u <= u1; u++) {
      for (let v = v0; v <= v1; v++) {
        let ok = false;
        for (let h = h1; h >= h0 && !ok; h--) if (this.solidCell(f, u, v, h)) ok = true;
        if (!ok) return false;
      }
    }
    return true;
  }

  // Is the body blocked standing at `centre` with feet at radius feetR?
  // Kept as a public helper; it is the cell-space box test now.
  bodyBlocked(centre, feetR) {
    this.setFenceLo(feetR);
    const fr = this.cellFrame(_dir.copy(centre).normalize(), feetR, centre);
    return this.boxBlocked(fr.f, fr.cu, fr.cv, fr.ru, fr.rv,
      this.layerLo(feetR), this.layerHi(feetR));
  }

  // rebuild the body frame from up + tangent forward; roll cannot accumulate
  refreshBasis() {
    this.forward.addScaledVector(this.up, -this.forward.dot(this.up));
    if (this.forward.lengthSq() < 1e-8) {
      _v.set(this.up.y, this.up.z, -this.up.x);
      this.forward.copy(_v).addScaledVector(this.up, -_v.dot(this.up));
    }
    this.forward.normalize();
    _v.crossVectors(this.forward, this.up);
    _m.makeBasis(_v, this.up, _v2.copy(this.forward).negate());
    this.bodyQuat.setFromRotationMatrix(_m);
  }

  spawn(dir = new THREE.Vector3(0.35, 1, 0.25)) {
    if (CS.FLAT) {
      // `dir` arrives as anything from a unit test vector to a raw camera
      // position; only the footprint matters on a plane. Clamp it onto the
      // table and stand on whatever the ground is there.
      const half = CS.S / 2 - 2;
      const x = THREE.MathUtils.clamp(dir.x, -half, half);
      const z = THREE.MathUtils.clamp(dir.z, -half, half);
      this.pos.set(x, this.planet.surfaceRadiusAtWorld(x, CS.R, z), z);
      dir.set(0, 1, 0);
    } else {
      dir.normalize();
      const ground = this.planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
      this.pos.copy(dir).multiplyScalar(ground);
    }
    this.vel.set(0, 0, 0);
    this.radialVel = 0;
    this.grounded = true;
    this.pitch = 0;
    // every bit of feel state is transient, and main.js re-sets camera.fov
    // around a spawn — so this is the one place the offset must go back to 0
    this.stepLag = 0;
    this.dip = 0;
    this.dipVel = 0;
    this.sprinting = false;
    this.sneaking = false;
    this.tapSprint = false;
    this.sprintBlend = 0;
    this.fovAdded = 0;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.ladderGrace = 0;
    this.up.copy(dir);
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.refreshBasis();
    this.syncCamera();
  }

  onMouse(dx, dy) {
    _q.setFromAxisAngle(this.up, -dx * MOUSE_SENS);
    this.forward.applyQuaternion(_q);
    this.refreshBasis();
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * MOUSE_SENS, -MAX_PITCH, MAX_PITCH);
  }

  // The same turn in RADIANS rather than in mouse pixels. onMouse is in device
  // units and a check has no pointer, so anything that has to aim — and what
  // the crosshair is on decides who an order lands on — could not aim at all.
  turnBy(rad, pitch = null) {
    _q.setFromAxisAngle(this.up, rad);
    this.forward.applyQuaternion(_q);
    this.refreshBasis();
    if (pitch !== null) {
      this.pitch = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
    }
    return this.lookDir;
  }

  // 0 = first person; larger pulls the camera back so the whole body shows
  /**
   * How far the camera sits from the eye, and on which side.
   *
   *    0    first person
   *   >0    behind you, over the shoulder
   *   <0    in FRONT of you, turned round to look back — Minecraft's third
   *         F5 state, and the only view in the game where you see your own
   *         face and the front of what you are carrying
   */
  setView(dist) {
    this.viewDist = dist;
    // In first person hide the entire body, not just the head: the torso and
    // legs otherwise hang below the eye and cover the ground you are standing
    // on. Only the held arm remains, as in Minecraft.
    this.avatar.visible = this.inPlay && dist !== 0;
    this.head.visible = true;
    this.viewArm.visible = this.inPlay && dist === 0;
  }

  triggerSwing() {
    this.swingTime = Math.max(this.swingTime, 0.3);
  }

  update(dt) {
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6) {
      this.step(Math.min(STEP_DT, remaining));
      remaining -= STEP_DT;
    }
    this.updateFeel(dt);
    const swinging = this.swingActive || this.swingTime > 0;
    if (this.swingTime > 0) this.swingTime -= dt;
    this.swingPhase = swinging ? this.swingPhase + dt : 0;
    this.swingK += ((swinging ? 1 : 0) - this.swingK) * Math.min(1, dt * 14);
    this.animTime += dt;

    // one pose per frame, not per physics substep: the joints only have to be
    // right when something draws them
    const speed = this.vel.length();
    let amp = Math.min(0.55, speed / WALK_SPEED * 0.55) *
      (this.flying ? 0 : this.grounded || this.inWater ? 1 : 0.35);
    if (this.climbing) amp = Math.max(amp, 0.5);  // hauling up a ladder
    // Airborne, and only in the sense that a jump means: swimming, climbing
    // and creative flight are all off the ground too, and none of them should
    // hold the body in a permanent leap.
    // ...and riding is not airborne either. A rider's feet ARE off the ground
    // — they are on a horse — so `grounded` is false up there and the body
    // snapped into the leaping pose with both arms thrown out sideways.
    const air = !this.grounded && !this.inWater && !this.climbing
      && !this.flying && !this.riding ? 1 : 0;
    // blended, so take-off and landing are a fifth of a second of movement
    // rather than the pose snapping on
    this.airBlend += (air - this.airBlend) * Math.min(1, dt * 12);

    // Flight is not walking. Being off the ground already scaled the stride to
    // 0.35 above, which is right for a fall — the legs are still the legs that
    // just pushed off — but wrong here: nothing is carrying you but the flight
    // itself, and a third of a stride at flying speed reads as running on thin
    // air. Take the stride to nothing instead and let the idle sway hold the
    // body. Blended like the jump, so lifting off out of a run eases the walk
    // out over a fifth of a second rather than snapping the legs straight.
    this.flyBlend += ((this.flying ? 1 : 0) - this.flyBlend) * Math.min(1, dt * 8);
    amp *= 1 - this.flyBlend;
    // ...and a rider is not walking either. The horse carries the movement;
    // legs pumping on its back read as running on the spot.
    if (this.riding) amp = 0;

    poseAvatar(this.parts, this.walkPhase, amp, this.animTime,
      this.swingK, this.swingOsc(), this.airBlend);
    // The seat. poseAvatar has no idea what a horse is, so the riding pose is
    // an override on top of it: thighs forward and swung out to straddle the
    // barrel, arms down and slightly forward on the reins. Written after the
    // pose call because every channel here is ASSIGNED by it.
    if (this.riding) {
      this.legL.rotation.x = 1.05;
      this.legR.rotation.x = 1.05;
      // Out, not across. A limb hangs along -Y, so a positive rotation.z
      // takes its foot toward +X — and the LEFT leg is the one at -X, so
      // +0.30 on the left swung it over the saddle and past the right one.
      // The straddle is the left leg going further left.
      this.legL.rotation.z = -0.30;
      this.legR.rotation.z = 0.30;
      this.armL.rotation.x = 0.55;
      this.armR.rotation.x = 0.55;
      this.armL.rotation.z = 0.10;
      this.armR.rotation.z = -0.10;
    }
    this.syncCamera();
  }

  swingOsc() {
    return 0.5 + 0.5 * Math.sin(this.swingPhase * 22);
  }

  // Everything the camera does that the feet do not. All of it is an offset
  // applied in syncCamera(), never to this.pos — the physics stays exact and
  // the tests that measure the feet still measure the feet.
  updateFeel(dt) {
    // a step up or down is a discontinuity in the feet; the eye owes that
    // height and pays it back over STEP_TAU, which is what turns a jump cut
    // into a stair
    this.stepLag = THREE.MathUtils.clamp(this.stepLag, -STEP_HEIGHT, STEP_HEIGHT)
      * Math.exp(-dt / STEP_TAU);
    if (Math.abs(this.stepLag) < 1e-4) this.stepLag = 0;

    // Landing dip: a critically damped spring, so a 3-block hop and a fall
    // out of a cave ceiling both settle instead of snapping back.
    //
    // Solved EXACTLY, not integrated. The Euler form this used to be —
    // dipVel -= (w*w*dip + 2*w*dipVel)*dt — is only stable while 2*w*dt < 2,
    // and this runs on the FRAME dt, which the loop caps at 0.1s. At w = 11
    // the velocity's damping factor at a capped frame is 1 - 2.2 = -1.2:
    // every frame FLIPS the sign and grows it by a fifth. On a machine
    // rendering at eleven frames a second — a big world is exactly that —
    // one landing seeded a dip that oscillated and grew without bound, and
    // since the dip is subtracted straight from the eye, the camera swung
    // ever deeper through the ground and back out at frame rate. That is
    // the jitter that was chased through the physics for two days: the feet
    // never moved, because it was never the feet.
    //
    // The closed form costs one exp and cannot diverge at ANY dt, and at 120
    // substeps a second it is indistinguishable from what the old integrator
    // produced when it was stable.
    {
      const e = Math.exp(-DIP_W * dt);
      const b = this.dipVel + DIP_W * this.dip;
      this.dip = (this.dip + b * dt) * e;
      this.dipVel = (this.dipVel - DIP_W * b * dt) * e;
      // ...and a belt for the braces: nothing sane leaves this range, so a
      // state that somehow has — an old save mid-explosion, a NaN from
      // anywhere — is healed here rather than shown to the camera.
      if (!Number.isFinite(this.dip) || !Number.isFinite(this.dipVel)) {
        this.dip = 0; this.dipVel = 0;
      }
      this.dip = THREE.MathUtils.clamp(this.dip, -DIP_MAX, DIP_MAX);
    }

    const speed = this.vel.length();
    this.sprintBlend += ((this.sprinting && speed > 1 ? 1 : 0) - this.sprintBlend)
      * Math.min(1, dt * 7);
  }

  // vertical / lateral head bob at the current gait
  bobAmount() {
    if (!this.grounded || this.inWater) return 0;
    return BOB_AMP * Math.min(1, this.vel.length() / WALK_SPEED);
  }

  // called when the feet hit the ground; `speed` is the fall speed in blocks/s
  land(speed) {
    // The callback comes FIRST and is not gated on the dip: a step down off a
    // kerb is too gentle to shake the camera but is still a foot hitting the
    // ground, and that is what a listener wants to know about.
    if (speed > 0.6) this.onLand?.(speed);
    if (speed < 3) return;
    this.dip = Math.max(this.dip, Math.min(DIP_MAX, speed * DIP_PER_SPEED));
    this.dipVel = 0;
  }

  // record a discontinuous change of foot radius so the eye can lag it
  snapR(from, to) {
    this.stepLag = THREE.MathUtils.clamp(
      this.stepLag + (from - to), -STEP_HEIGHT, STEP_HEIGHT);
    return to;
  }

  // can the player stand at this world position? (feet radius vs column top)
  canStand(p, feetR) {
    const ground = this.groundAt(p);
    return ground - feetR <= STEP_HEIGHT;
  }

  // is the cell under the feet a ladder? (the top-of-climb hand-off)
  ladderUnderfoot(dir, r) {
    if (CS.FLAT) _test.set(this.pos.x, r - 0.08, this.pos.z);
    else _test.copy(dir).multiplyScalar(r - 0.08);
    return isLadderBlock(this.blockAtWorld(_test));
  }

  // -----------------------------------------------------------------------
  // The horizontal move.
  //
  // Substeps are 1/120 s, so even sprinting the body travels under 0.08
  // blocks per call — far less than its own radius. That is why a discrete
  // per-axis clamp is exact here and a swept test would buy nothing: nothing
  // can pass through a cell without a step landing inside it.
  //
  // Order of business: decompose the velocity into cell axes, clamp the
  // dominant axis, clamp the other, try a doorway nudge if the dominant one
  // was stopped, try the whole thing again a step higher if it still is, and
  // finally kill the velocity components that ran into something.
  moveHorizontal(dt, feetR) {
    this.hitWall = false;
    if (this.vel.lengthSq() < 1e-10) return;
    this.setFenceLo(feetR);
    const fr = this.cellFrame(_dir.copy(this.pos).normalize(), feetR);
    const f = fr.f, ru = fr.ru, rv = fr.rv;

    // The grid axes are not perpendicular, so the wanted displacement is the
    // solution of a 2x2 system, not a pair of dot products. Dotting would
    // curve a straight walk near a face corner, where the lean peaks.
    const det = 1 - fr.cos * fr.cos;
    const p = this.vel.dot(fr.eu) * dt, q = this.vel.dot(fr.ev) * dt;
    const dcu = (p - fr.cos * q) / (det * fr.su);
    const dcv = (q - fr.cos * p) / (det * fr.sv);
    const h0 = this.layerLo(feetR), h1 = this.layerHi(feetR);

    // Push out of a marginal overlap first. The body's radius in CELLS is not
    // constant — the same 0.28 blocks is 0.29 of a wide cell and 0.33 of a
    // narrow one — so a body leaning on a wall can find itself a hair inside
    // it a few steps later, as the cells it walks through change size. Left
    // alone that overlap reads as "blocked" on both axes and stops you dead
    // in exactly the tight corridor this rewrite is about.
    let cu = fr.cu, cv = fr.cv;
    cv = this.pushOutV(f, cu, cv, ru, rv, h0, h1);
    cu = this.pushOutU(f, cu, cv, ru, rv, h0, h1);
    // A push-out is lateral motion the player did not ask for, so it counts as
    // contact even though nothing was clamped: overlapping a block means you
    // walked into it. Left unflagged it reads to callers as a force from
    // nowhere, which is the exact bug this whole frame was rebuilt to kill.
    const shoved = cu !== fr.cu || cv !== fr.cv;

    // Still inside something: a block was placed on you, or the world changed
    // under you. Collision would hold you there for ever, so let the move
    // through and walk out.
    if (this.boxBlocked(f, cu, cv, ru, rv, h0, h1)) {
      this.hitWall = true;
      // The move is granted, but CLAMPED. It exists so somebody a block has
      // been placed on can walk out; ungoverned it is a licence to run the
      // whole planet at full speed inside the crust, which is what turned a
      // moment of being stuck into a tour of the underground. A third of a
      // block a substep is enough to walk out of anything and not enough to
      // go anywhere.
      const lim = BURIED_CREEP;
      const mag = Math.hypot(dcu * fr.su, dcv * fr.sv);
      const k = mag > lim ? lim / mag : 1;
      this.setFromCell(f, cu + dcu * k, cv + dcv * k, feetR);
      return;
    }

    // Everything from here on measures against the pushed-out origin, not the
    // raw one, or a push-out would read as progress the move did not make.
    const ou = cu, ov = cv, tu = cu + dcu, tv = cv + dcv;
    const uFirst = Math.abs(dcu * fr.su) >= Math.abs(dcv * fr.sv);
    if (uFirst) {
      cu = this.slideU(f, cu, tu, cv, ru, rv, h0, h1);
      cv = this.slideV(f, cv, tv, cu, ru, rv, h0, h1);
    } else {
      cv = this.slideV(f, cv, tv, cu, ru, rv, h0, h1);
      cu = this.slideU(f, cu, tu, cv, ru, rv, h0, h1);
    }
    let clipU = Math.abs(cu - tu) > 1e-9;
    let clipV = Math.abs(cv - tv) > 1e-9;
    // Remembered before the doorway assist clears the clip flags. The assist
    // helps you through a gap and keeps your speed, but you still touched a
    // wall to get there — callers asking "did geometry move me sideways?"
    // must see that, or the nudge looks like a force out of nowhere.
    const touched = clipU || clipV;

    // Doorway assist, on the axis you were actually travelling along.
    if (uFirst && clipU && Math.abs(dcu) > 1e-9) {
      const off = this.assistOffset(true, f, cu, cv, tu, ru, rv, h0, h1, fr.sv);
      const slice = Math.sign(off)
        * Math.min(Math.abs(off), ASSIST_SPEED * dt / fr.sv);
      if (off !== 0 && !this.boxBlocked(f, cu, cv + slice, ru, rv, h0, h1)) {
        cv += slice;
        cu = this.slideU(f, cu, tu, cv, ru, rv, h0, h1);
        // Not "clipped" any more even if the body has not squeezed past yet:
        // it is about to, and killing the velocity now is what would make the
        // gap need a run-up.
        clipU = false;
        clipV = false;
      }
    } else if (!uFirst && clipV && Math.abs(dcv) > 1e-9) {
      const off = this.assistOffset(false, f, cu, cv, tv, ru, rv, h0, h1, fr.su);
      const slice = Math.sign(off)
        * Math.min(Math.abs(off), ASSIST_SPEED * dt / fr.su);
      if (off !== 0 && !this.boxBlocked(f, cu + slice, cv, ru, rv, h0, h1)) {
        cu += slice;
        cv = this.slideV(f, cv, tv, cu, ru, rv, h0, h1);
        clipU = false;
        clipV = false;
      }
    }

    // Step up. Retried as the whole resolve one STEP_HEIGHT higher, not as a
    // single probe, so a ledge you can only take diagonally still works.
    let lift = 0;
    if (this.grounded && (clipU || clipV)) {
      const g0 = this.layerLo(feetR + STEP_HEIGHT);
      const g1 = this.layerHi(feetR + STEP_HEIGHT);
      if (!this.boxBlocked(f, ou, ov, ru, rv, g0, g1)) {
        let su2 = ou, sv2 = ov;
        if (uFirst) {
          su2 = this.slideU(f, su2, tu, sv2, ru, rv, g0, g1);
          sv2 = this.slideV(f, sv2, tv, su2, ru, rv, g0, g1);
        } else {
          sv2 = this.slideV(f, sv2, tv, su2, ru, rv, g0, g1);
          su2 = this.slideU(f, su2, tu, sv2, ru, rv, g0, g1);
        }
        if (this.gain(fr, ou, ov, su2, sv2) > this.gain(fr, ou, ov, cu, cv) + 1e-6) {
          cu = su2; cv = sv2; lift = STEP_HEIGHT;
          clipU = Math.abs(cu - tu) > 1e-9;
          clipV = Math.abs(cv - tv) > 1e-9;
        }
      }
    }

    // Sneak edge guard, the classic one: back out whichever axis walked the
    // footprint off its support, keeping the other so you can still shuffle
    // along a lip rather than freezing against it.
    if (this.sneaking && this.grounded && lift === 0
      && !this.footingUnder(f, cu, cv, ru, rv, feetR)) {
      if (this.footingUnder(f, cu, ov, ru, rv, feetR)) { cv = ov; clipV = true; }
      else if (this.footingUnder(f, ou, cv, ru, rv, feetR)) { cu = ou; clipU = true; }
      else { cu = ou; cv = ov; clipU = true; clipV = true; }
    }

    this.setFromCell(f, cu, cv, feetR + lift);
    if (lift > 0) this.stepLag = THREE.MathUtils.clamp(
      this.stepLag - lift, -STEP_HEIGHT, STEP_HEIGHT);

    // A clamped axis means a wall whose face is that axis, so the motion that
    // survives is the one along the OTHER grid direction — not the projection
    // onto the axis itself, which is only the same thing when the two are
    // perpendicular, and here they are not.
    // Contact flag for callers and tests: the move ran into geometry, so any
    // course change from here on is the world pushing, not a frame error.
    // A successful step-up counts. It clears its own clip flags — that is what
    // makes it a success — so without `lift` here, climbing a ledge is contact
    // the flag denies, and the small course change every ledge costs you looks
    // like drift on open ground. Terraced cliffs put a lot more ledges under
    // your feet, which is how this surfaced.
    this.hitWall = shoved || touched || clipU || clipV || lift > 0;

    if (clipU && clipV) {
      this.vel.set(0, 0, 0);
    } else if (clipU) {
      const keep = this.vel.dot(fr.ev);       // read before copy() overwrites it
      this.vel.copy(fr.ev).multiplyScalar(keep);
    } else if (clipV) {
      const keep = this.vel.dot(fr.eu);
      this.vel.copy(fr.eu).multiplyScalar(keep);
    }
  }

  // Move off a cell the body is overlapping, when exactly one of the two
  // cells it straddles is solid. Both solid means it is wedged and there is
  // no good direction; neither means there is nothing to do.
  pushOutU(f, cu, cv, ru, rv, h0, h1) {
    const lo = Math.floor(cu - ru), hi = Math.floor(cu + ru);
    if (lo === hi) return cu;
    const loBad = this.rowBlockedU(f, lo, cv, rv, h0, h1);
    if (loBad === this.rowBlockedU(f, hi, cv, rv, h0, h1)) return cu;
    return loBad ? lo + 1 + ru + WALL_SKIN : hi - ru - WALL_SKIN;
  }

  pushOutV(f, cu, cv, ru, rv, h0, h1) {
    const lo = Math.floor(cv - rv), hi = Math.floor(cv + rv);
    if (lo === hi) return cv;
    const loBad = this.rowBlockedV(f, lo, cu, ru, h0, h1);
    if (loBad === this.rowBlockedV(f, hi, cu, ru, h0, h1)) return cv;
    return loBad ? lo + 1 + rv + WALL_SKIN : hi - rv - WALL_SKIN;
  }

  // Blocks actually covered by a resolved move, for comparing two attempts.
  // Measured from the passed origin, not fr.cu/fr.cv: by the time the step-up
  // retry runs the origin is the pushed-out one, and the two attempts being
  // compared start from there.
  gain(fr, fromU, fromV, toU, toV) {
    return Math.hypot((toU - fromU) * fr.su, (toV - fromV) * fr.sv);
  }

  // Smallest sideways offset (in cells, along the axis that is NOT `uAxis`)
  // that gets the blocked axis moving again, or 0 if none does. Smallest
  // first, and both signs at each size, because a one-cell doorway is barely
  // wider than the body: probing the full ASSIST first would step over the
  // gap and into the other jamb.
  assistOffset(uAxis, f, cu, cv, target, ru, rv, h0, h1, span) {
    const from = uAxis ? cu : cv;
    for (let i = 0; i < ASSIST_STEPS.length; i++) {
      for (let s = 1; s >= -1; s -= 2) {
        const off = s * ASSIST_STEPS[i] * ASSIST / span;
        const nu = uAxis ? cu : cu + off, nv = uAxis ? cv + off : cv;
        if (this.boxBlocked(f, nu, nv, ru, rv, h0, h1)) continue;
        const got = uAxis ? this.slideU(f, cu, target, nv, ru, rv, h0, h1)
          : this.slideV(f, cv, target, nu, ru, rv, h0, h1);
        if (Math.abs(got - from) > 1e-6) return off;
      }
    }
    return 0;
  }

  step(dt) {
    const up = this.up;
    // The true guard has to sit here, before anything else touches pos or
    // up: THREE's normalize() on a zero-length vector divides by 1 instead
    // of the length, which quietly returns (0,0,0) rather than throwing —
    // so `up` itself goes to zero, `this.up` (aliased, not copied) carries
    // that into every downstream frame, and moveHorizontal below reads it
    // before the vertical section's own clamp ever runs. Mining now stops
    // at the core floor, so this should be unreachable in fresh play; it
    // exists for a save from before that fix, where the hole already exists.
    if (!CS.FLAT && this.pos.lengthSq() < 1) {
      // `up` (== this.up) is still last frame's valid direction here — nothing
      // has overwritten it yet this step — so falling back to it, or to +Y on
      // the very first frame, recovers instead of compounding the zero.
      if (up.lengthSq() < 0.25) up.set(0, 1, 0);
      this.pos.copy(up).multiplyScalar(R0);
      this.radialVel = 0;
      this.vel.set(0, 0, 0);
    }
    // Up is the whole difference between the two worlds: radial on a globe,
    // the same +Y everywhere on the drafting table's plane.
    if (CS.FLAT) up.set(0, 1, 0);
    else up.copy(this.pos).normalize();
    this.refreshBasis();

    const feetR = CS.FLAT ? this.pos.y : this.pos.length();
    this.colPoint(feetR + 0.6, _test);
    const inWater = this.blockAtWorld(_test) === BLOCK.WATER;
    this.inWater = inWater;

    // A ladder is passable, so the body simply overlaps its cell. Two samples,
    // ankle and chest, keep you attached while the feet cross a cell boundary;
    // the low one is what lets you climb to the very top rung before the
    // ordinary step-up carries you onto the ledge.
    let onLadder = false;
    if (!inWater) {
      for (const hh of [0.15, 1.2]) {
        this.colPoint(feetR + hh, _test);
        if (isLadderBlock(this.blockAtWorld(_test))) { onLadder = true; break; }
      }
    }
    this.climbing = onLadder;
    this.ladderGrace = onLadder ? LADDER_GRACE
      : Math.max(0, this.ladderGrace - dt);

    // --- gait: sprint, sneak, and the key edges they are driven by --------
    this.clock += dt;
    const fwdKey = this.keys.has('KeyW');
    // Double-tap W. main.js hands us a plain Set of held codes, so the press
    // is detected here as an edge rather than from a key event — which also
    // means it cannot go stale when the window loses focus.
    if (fwdKey && !this.fwdHeld) {
      if (this.clock - this.lastFwdTap < DOUBLE_TAP) this.tapSprint = true;
      this.lastFwdTap = this.clock;
    }
    if (!fwdKey) this.tapSprint = false;
    this.fwdHeld = fwdKey;

    const sneak = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    // Shift is the ladder's "down" first — it was bound there before sprint
    // existed — so it only sprints when you are not on one.
    const shift = !onLadder
      && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    this.sneaking = sneak && !inWater;
    this.sprinting = fwdKey && !sneak && (shift || this.tapSprint);

    // --- tangential steering ---------------------------------------------
    const right = _v2.crossVectors(this.forward, up);
    const wish = _v.set(0, 0, 0);
    // A rider's legs do nothing. The movement keys are still held and are
    // still read — main.js turns them into reins — but they must not also
    // push the body, or the player walks out from under the saddle it is
    // being replaced on every frame and the two fight all the way.
    if (!this.riding) {
      if (fwdKey) wish.add(this.forward);
      if (this.keys.has('KeyS')) wish.sub(this.forward);
      if (this.keys.has('KeyD')) wish.add(right);
      if (this.keys.has('KeyA')) wish.sub(right);
    }
    const hasInput = wish.lengthSq() > 0;
    let wishSpeed = WALK_SPEED;
    if (inWater) wishSpeed *= 0.6;
    else if (this.sneaking) wishSpeed *= SNEAK_MULT;
    else if (this.sprinting) wishSpeed *= SPRINT_MULT;
    // ...and flight is not walking with the ground taken away. Applied after
    // the others so sprint still counts: shift is the DESCEND key up here, so
    // the fast one in the air is the double-tapped W.
    if (this.flying) wishSpeed *= FLY_MULT;
    if (hasInput) wish.normalize();

    // Flying belongs with the ground cases, not with the air one. Air control
    // is deliberately one-way — it ADDS along the wish direction and never
    // brakes, so a running jump keeps its momentum — and creative flight fell
    // into that branch: let go of W and there was nothing anywhere in the
    // step to take the speed back off, so you drifted forwards for ever.
    if (this.grounded || inWater || onLadder || this.flying) {
      // On the ground, steer straight at the wish velocity: the lateral part
      // of the correction is what makes a turn bite instead of sliding wide.
      if (hasInput) {
        const delta = _try.copy(wish).multiplyScalar(wishSpeed).sub(this.vel);
        const a = GROUND_ACCEL * dt;
        if (delta.length() > a) delta.setLength(a);
        this.vel.add(delta);
      } else {
        // Friction with a floor under it. A pure exponential has a long tail
        // that reads as ice; the STOP_SPEED term makes the last of the speed
        // bleed off at a constant rate, so the stop has an end.
        const sp = this.vel.length();
        if (sp > 1e-6) {
          const drop = Math.max(sp, STOP_SPEED) * GROUND_FRICTION * dt;
          this.vel.multiplyScalar(Math.max(0, sp - drop) / sp);
        }
      }
    } else if (hasInput) {
      // Air control adds along the wish direction only, and only up to the
      // wish speed measured along it, so momentum carried into a jump is
      // never braked — a running jump stays a running jump.
      const along = this.vel.dot(wish);
      const add = Math.min(AIR_ACCEL * dt, wishSpeed - along);
      if (add > 0) this.vel.addScaledVector(wish, add);
    }
    // keep velocity tangential as the frame turns with the planet
    this.vel.addScaledVector(up, -this.vel.dot(up));

    // --- horizontal move --------------------------------------------------
    this.moveHorizontal(dt, feetR);

    // --- vertical --------------------------------------------------------
    // Nothing is modelled below the core surface (R0): get() answers AIR for
    // every h < 0, for ever. Mining is stopped at that floor now, but this is
    // the backstop for anything that predates the fix — an old save with a
    // shaft already dug through it. Without it, pos collapsing toward (0,0,0)
    // makes normalize() unable to recover a direction, and since `up` is
    // reused every frame rather than recomputed from scratch, one bad frame
    // does not heal — it stays garbage. Keep the last good up instead of
    // adopting a degenerate one.
    if (CS.FLAT) _dir.copy(up);   // up is +Y; the column rides this.pos
    else if (this.pos.lengthSq() > 1e-6) _dir.copy(this.pos).normalize();
    else _dir.copy(up);
    up.copy(_dir);
    let r = Math.max(CS.FLAT ? this.pos.y : this.pos.length(), R0);

    // Coyote time and jump buffer. Both are read here so that a jump pressed
    // in the air fires on the frame the feet land, and one pressed a frame
    // after running off a lip still fires.
    const jumpKey = this.keys.has('Space');
    if (jumpKey && !this.jumpHeld) this.jumpBuf = JUMP_BUFFER;
    this.jumpHeld = jumpKey;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.grounded) this.coyote = COYOTE;
    else this.coyote = Math.max(0, this.coyote - dt);
    const jumping = jumpKey || this.jumpBuf > 0;

    // Creative flight: a double-tap on space lifts off, and while flying
    // gravity is simply skipped. Kept as its own branch alongside swimming and
    // climbing rather than threading a flag through the ground code.
    if (this.creative && jumpKey && !this.wasJumpKey) {
      if (this.lastJumpTap && nowSeconds() - this.lastJumpTap < 0.32) {
        this.flying = !this.flying;
        this.radialVel = 0;
        // clear it, or the press you HOLD to climb counts as a third tap and
        // toggles flight straight back off
        this.lastJumpTap = 0;
      } else {
        this.lastJumpTap = nowSeconds();
      }
    }
    this.wasJumpKey = jumpKey;
    if (this.flying && !this.creative) this.flying = false;

    if (this.flying) {
      const down = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const climb = (jumpKey ? FLY_SPEED : 0) - (down ? FLY_SPEED : 0);
      this.radialVel = climb;
      let nr = r + climb * dt;
      // A CEILING. Flight had none — every other way of going up in this
      // file bumps its head, and flight simply added to the radius, so
      // holding space under a hill flew you straight into the rock and left
      // you inside the planet. Probe the same way the jump does.
      if (climb > 0 && this.solidAtR(_dir, nr + BODY)) {
        nr = r;
        this.radialVel = 0;
      }
      r = nr;
      // landing on the ground cancels flight, so you never sink into rock
      const g = this.groundWithin(_dir, r, Math.max(0.4, climb < 0
        ? -climb * dt + 0.1 : 0.4));
      if (g !== null && climb <= 0) { r = g; this.flying = false; this.grounded = true; }
      else this.grounded = false;
    } else if (inWater) {
      this.radialVel -= SWIM_GRAVITY * dt;
      this.radialVel *= Math.pow(0.35, dt);
      if (jumping) this.radialVel += 26 * dt;
      let nr = r + this.radialVel * dt;
      if (this.radialVel < 0) {
        const g = this.groundWithin(_dir, r, Math.max(0.3, r - nr + 0.1));
        if (g !== null && g >= nr) { nr = g; this.radialVel = 0; }
      }
      r = nr;
      this.grounded = this.solidAtR(_dir, r - 0.08);
    } else if (onLadder) {
      // Climbing replaces gravity, the same way swimming does above: forward
      // or space hauls you up, shift lowers you, and letting go of both holds
      // position instead of dropping you off the ladder.
      const climbDown = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const climbUp = (jumping || this.keys.has('KeyW')) && !climbDown;
      this.radialVel = 0;
      let nr = r;
      if (climbUp) nr = r + CLIMB_SPEED * dt;
      else if (climbDown) nr = r - CLIMB_SPEED * dt;
      if (nr > r && this.solidAtR(_dir, nr + BODY)) nr = r;   // ceiling
      if (nr < r) {
        const g = this.groundWithin(_dir, r, r - nr + 0.1);
        if (g !== null && g >= nr) nr = g;                    // foot of the ladder
      }
      this.walkPhase += Math.abs(nr - r) * 5;   // limbs move with the climb
      r = nr;
      // attached to the ladder: treated as grounded so friction, the walk
      // animation and the coyote grace all behave as they do on the floor
      this.grounded = true;
    } else {
      // Supported right under the feet? A ladder is not solid ground (its
      // cell is passable, and cubesphere's surfaceRadius steps past it), but
      // its TOP face has to hold you up for as long as it takes to walk off
      // onto the ledge it is leaning against — otherwise the last rung drops
      // you back down the shaft you just climbed. LADDER_GRACE is that
      // hand-off and nothing more: let go for half a second and you fall.
      const onGround = this.solidAtR(_dir, r - 0.08);
      if (onGround || (this.ladderGrace > 0 && this.ladderUnderfoot(_dir, r))) {
        if (!this.grounded && this.radialVel < 0) this.land(-this.radialVel);
        // Up onto the ledge — unless there is rock where the head would go.
        //
        // The step had no headroom test at all, so walking at a one-block rise
        // with anything over it lifted the body into the ceiling, which reads
        // as buried, which lifts it again, which is the loop. A step you
        // cannot stand up in is a wall, and moveHorizontal has already decided
        // what to do about walls.
        const up = this.cellTopAt(r - 0.08);
        if (up <= r || !this.solidAtR(_dir, up + BODY)) {
          r = this.snapR(r, up);
        }
        this.radialVel = 0;
        this.grounded = true;
      } else if (this.grounded) {
        // small drop: follow the ground down instead of going airborne
        const g = this.groundWithin(_dir, r, STEP_DOWN);
        if (g !== null) { r = this.snapR(r, g); this.radialVel = 0; }
        else this.grounded = false;
      }

      if (this.grounded) this.coyote = COYOTE;
      if (jumping && this.radialVel <= 0 && (this.grounded || this.coyote > 0)) {
        // the gravity step below runs in the same substep as the launch, so
        // add it back here and the apex stays the documented 9.4^2/60 = 1.51
        this.radialVel = JUMP_SPEED + GRAVITY * dt;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuf = 0;
      }

      if (!this.grounded) {
        this.radialVel -= GRAVITY * dt;
        let nr = r + this.radialVel * dt;
        if (this.radialVel < 0) {
          const g = this.groundWithin(_dir, r, r - nr + 0.1);
          if (g !== null && g >= nr) {
            this.land(-this.radialVel);
            nr = g;
            this.radialVel = 0;
            this.grounded = true;
          }
        } else if (this.solidAtR(_dir, nr + BODY)) {
          this.radialVel = 0;     // head bump
          nr = r;
        }
        r = nr;
      }
    }
    // Same backstop as above, after gravity has had its say this frame: the
    // core is meant to be solid, so a legacy hole reads as a floor here
    // rather than a fall with no bottom.
    if (r < R0) { r = R0; this.radialVel = 0; this.grounded = true; }

    // Last line of defence: if the body has ended up INSIDE the world, rise
    // out of it. Being buried used to be survivable and permanent — the
    // horizontal resolve grants a free move to anything already inside a
    // solid (so a block placed on you cannot trap you), which also meant
    // that once you were in the crust you could run around the entire planet
    // inside it. The free move is still there, but it now only ever lasts
    // the one substep it takes this to push you back out.
    if (this.buried(_dir, r)) {
      // BEFORE unstick, not after. The first report off a real machine came
      // back showing the feet in clear air with everything above them clear
      // too — because by the time it was taken the body had already been
      // lifted out, and it was describing the cure rather than the disease.
      if (!Player.stuckReport) Player.stuckReport = this.snapshotStuck(_dir, r);
      const out = this.unstick(_dir, r);
      if (out > r) {
        r = out;
        this.radialVel = 0;
        // STANDING on what it was just pulled out of, not falling off it.
        //
        // `grounded = false` here is the other half of the loop the reports
        // describe: the body is lifted clear, is told it is in the air, and
        // the next substep's gravity puts it straight back where it came
        // from — up, down, up, down, at sixty a second, which from behind the
        // eyes is the ground flickering past your chin. If there is something
        // solid under the feet after the lift, and there always is when you
        // have just come out of it, then you are standing on it.
        this.grounded = this.solidAtR(_dir, r - 0.08);
      }
      // ...and how long this has been going on.
      //
      // A single test cannot tell "I am climbing out of a block" from "I have
      // been climbing out of the same block for thirty seconds". Both look
      // like one buried frame. The reported bug is the second one and it is a
      // LOOP: the ladder lifts you half a block, `grounded` goes false, the
      // next substep's gravity drops you back into the same cell, and the two
      // hand the body back and forth for ever. That handover is the shaking,
      // and it is why it cannot be waited out.
      //
      // So the state is timed. A sixth of a second of continuous burial is
      // longer than any honest climb-out and shorter than anybody can see, and
      // at that point the argument is settled from outside: onto the top of
      // the column, whatever either side of it wanted.
      this.stuckT += dt;
      // The FIRST frame of a burial, kept whole. Nobody has been able to make
      // this happen on demand off the game's own clock — every synthetic
      // version of the recipe lands clean — so the next best thing is that
      // when it happens to a player it leaves a statement behind instead of
      // just a bad afternoon. It costs one boolean test a substep while
      // everything is fine, and it never overwrites the first one it caught.
      if (this.stuckT > STUCK_GIVE_UP && !CS.FLAT) {
        const top = this.planet.surfaceRadiusAtDir(_dir.x, _dir.y, _dir.z);
        if (top + 0.05 > r) r = top + 0.05;
        this.radialVel = 0;
        this.grounded = false;
        this.stuckT = 0;
      }
    } else this.stuckT = 0;
    if (CS.FLAT) this.pos.y = r;
    else this.pos.copy(_dir).multiplyScalar(r);

    // --- walk cycle ------------------------------------------------------
    this.walkPhase += this.vel.length() * dt * 1.9;
  }

  // Everything about the moment the body ended up inside the world: where it
  // was, how fast, what was carrying it, and the cells around its feet. Read
  // it out of the console with `window.__stuck()`.
  snapshotStuck(dir, r) {
    const cells = [];
    if (!CS.FLAT) {
      for (let dh = -2; dh <= 3; dh++) {
        cells.push([dh, this.planet.blockAtWorld(
          dir.x * (r + dh), dir.y * (r + dh), dir.z * (r + dh))]);
      }
    }
    return {
      when: (typeof performance !== 'undefined' ? performance.now() : 0) | 0,
      pos: [this.pos.x, this.pos.y, this.pos.z].map((n) => +n.toFixed(2)),
      radius: +r.toFixed(2),
      surfaceTop: CS.FLAT ? null
        : +this.planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z).toFixed(2),
      radialVel: +this.radialVel.toFixed(2),
      speed: +this.vel.length().toFixed(2),
      grounded: this.grounded, flying: this.flying, riding: this.riding,
      inWater: this.inWater, climbing: this.climbing,
      hitWall: this.hitWall,
      keys: [...this.keys],
      // the column through the feet: -2 is under them, +3 over the head
      cellsAroundFeet: cells,
    };
  }

  // Is the body inside the world?
  //
  // The cell the FEET are in, first and mainly. `r` is the sole, so the cell
  // it sits in is the AIR you are standing in — the ground is the cell below
  // it, at r - epsilon. That makes this false the whole time you are walking
  // about, and true the moment the world is where you are.
  //
  // This started out as the two torso cells, both of which had to be solid,
  // which only ever caught being fully entombed. Sunk to the waist — a
  // single block under, the common case and the one that put a man standing
  // in the ground up to his chest — left the upper sample in open air and
  // was not detected at all. The torso pair is kept as a second condition
  // for the one case the feet miss: standing on a floor with rock filling
  // the space your body wants.
  buried(dir, r) {
    return this.solidAtR(dir, r + 0.1)
      || (this.solidAtR(dir, r + 0.5) && this.solidAtR(dir, r + 1.2));
  }

  // The first radius above `r` where the body is not inside anything. Gives
  // up beyond UNSTICK_REACH rather than firing you into orbit from the middle
  // of a mountain — deep enough to clear any terrain you can fly into, and
  // if you are somehow deeper than that you can still walk out.
  unstick(dir, r) {
    for (let t = 0.5; t <= UNSTICK_REACH; t += 0.5) {
      if (!this.buried(dir, r + t)) return r + t;
    }
    // Nothing within reach. THIS is the state the bug reports describe: the
    // body inside rock, the search giving up, and the frame after doing
    // exactly the same thing — so you stay there, and because the horizontal
    // resolve grants a free move to anything already inside a solid, you slide
    // about in the crust while gravity and the ground test argue about which
    // radius you belong at. That argument is the shaking.
    //
    // A fourteen-block ladder cannot answer "how do I get out of a mountain".
    // The column can: it knows where its own top is. Coming out ON TOP of the
    // ground you are inside is the one answer that is always right and always
    // reachable, whatever put you there.
    //
    // Deliberately not the first air pocket above — a cave a hundred blocks
    // down is somewhere you can be legitimately buried by a placed block, and
    // firing you to the surface from there would be worse than the bug. The
    // ladder above still handles every ordinary case; this is the floor under
    // it, and it only runs when the ladder has already failed.
    if (CS.FLAT) return r;
    const top = this.planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
    if (top > r && !this.buried(dir, top + 0.05)) return top + 0.05;
    return r;
  }

  // would a block placed here overlap the player?
  intersectsWorld(x, y, z) {
    if (CS.FLAT) {
      const feetR = this.pos.y;
      if (y < feetR - 0.5 || y > feetR + BODY + 0.5) return false;
      // within roughly half a block of the player's own column
      return Math.hypot(x - this.pos.x, z - this.pos.z) < 0.75;
    }
    const r = Math.hypot(x, y, z);
    const feetR = this.pos.length();
    if (r < feetR - 0.5 || r > feetR + BODY + 0.5) return false;
    const len = r || 1;
    const dot = (this.pos.x * x + this.pos.y * y + this.pos.z * z) / (feetR * len);
    // within roughly half a block of the player's own column
    return Math.acos(THREE.MathUtils.clamp(dot, -1, 1)) * feetR < 0.75;
  }

  // Sprint widens the field of view a little, which is most of what sells
  // speed. The change is applied as a DIFFERENCE, so main.js keeps owning the
  // base value (60 orbiting, 75 walking) and nothing has to be negotiated;
  // spawn() zeroes the offset, which is the one moment main.js re-sets it.
  syncFov() {
    const cam = this.camera;
    if (typeof cam?.fov !== 'number' || !cam.updateProjectionMatrix) return;
    const want = this.inPlay ? SPRINT_FOV * this.sprintBlend : 0;
    if (Math.abs(want - this.fovAdded) < 1e-3) return;
    cam.fov += want - this.fovAdded;
    this.fovAdded = want;
    cam.updateProjectionMatrix();
  }

  syncCamera() {
    // The eye is the feet plus EYE plus everything in updateFeel(): the step
    // lag, the landing dip, and a walking bob. First person only for the bob
    // — behind the body it would just shake the whole scene.
    const bob = this.viewDist === 0 ? this.bobAmount() : 0;
    this.eye.copy(this.pos).addScaledVector(this.up,
      EYE + this.stepLag - this.dip - this.seat
      + bob * Math.sin(this.walkPhase * 2));
    if (bob > 0) {
      _v2.crossVectors(this.forward, this.up);
      this.eye.addScaledVector(_v2, bob * BOB_SIDE * Math.sin(this.walkPhase));
    }
    this.syncFov();

    _q.setFromAxisAngle(_v.set(1, 0, 0), this.pitch);
    _qAim.copy(this.bodyQuat).multiply(_q);
    this.lookDir.set(0, 0, -1).applyQuaternion(_qAim);

    if (this.viewDist !== 0) {
      const lift = 0.3;
      const front = this.viewDist < 0;
      const reach = Math.abs(this.viewDist);
      // Behind: the camera keeps your heading and tilts down by the lift.
      // In front it is the mirror of that — spun half a turn about your own
      // up, which is what keeps the horizon level, and pitched the opposite
      // way so that looking up swings the camera up and points it back down
      // at you. Roll stays zero in both because the half turn is about `up`.
      _q.setFromAxisAngle(_v.set(1, 0, 0),
        (front ? -this.pitch : this.pitch) - Math.atan(lift));
      this.camera.quaternion.copy(this.bodyQuat);
      if (front) {
        _qSpin.setFromAxisAngle(_v.set(0, 1, 0), Math.PI);
        this.camera.quaternion.multiply(_qSpin);
      }
      this.camera.quaternion.multiply(_q);
      _v2.copy(this.lookDir);
      if (!front) _v2.negate();
      _v2.addScaledVector(this.up, lift).normalize();
      let dist = reach;
      for (let t = 0.4; t <= reach; t += 0.4) {
        _test.copy(this.eye).addScaledVector(_v2, t);
        if (this.solidAt(_test.x, _test.y, _test.z)) {
          dist = Math.max(0.9, t - 0.4);
          break;
        }
      }
      this.camera.position.copy(this.eye).addScaledVector(_v2, dist);
    } else {
      this.camera.quaternion.copy(_qAim);
      this.camera.position.copy(this.eye);
    }

    this.avatar.position.copy(this.pos);
    this.avatar.quaternion.copy(this.bodyQuat);

    // The rest pose comes from VIEW_ARM and the swing is an offset ON it.
    // These used to be six hardcoded numbers, which quietly made VIEW_ARM.pos
    // and VIEW_ARM.rot dead weight — everything but the x and the yaw was
    // overwritten on the first frame, so tuning the table did nothing.
    const A = VIEW_ARM;
    const osc = this.swingOsc();
    const k = this.swingK;
    // the frame's own corner at the arm's depth, so the fist stays put when
    // the window changes shape (and when sprint widens the fov)
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * Math.abs(A.pos[2]);
    const halfW = halfH * this.camera.aspect;
    const S = A.swing;
    const anc = !this.held ? A.emptyAnchor
      : this.gunRig ? A.anchor : A.holdAnchor;
    this.viewArm.rotation.x = A.rot[0] + S.pitch * osc * k;
    this.viewArm.rotation.z = A.rot[2] + S.roll * osc * k;
    this.viewArm.position.x = halfW * (anc[0] - S.in * osc * k) + A.pos[0];
    this.viewArm.position.z = A.pos[2] + S.depth * osc * k;
    // The walk-bob is a WALK bob. walkPhase advances off speed alone, and
    // flight moves at three times a sprint, so the arms pumped away in mid
    // air like a man on a treadmill. Grounded is the whole test: a jump, a
    // swim and a flight all take the hands off the metronome.
    const bobK = this.grounded ? 1 : 0;
    this.viewArm.position.y = -halfH * (anc[1] - S.up * osc * k) + A.pos[1]
      + Math.sin(this.walkPhase * 2) * 0.012 * bobK;
    // ...and the other hand, in the mirror of that corner. It takes the walk
    // bob but not the SWING: the left hand is carrying, not striking, and a
    // shield that lunges every time you mine reads as a second pickaxe.
    if (this.viewArmOff) {
      const a = A.anchor;    // always the holding anchor — see refreshOffhand
      this.viewArmOff.position.x = -(halfW * a[0]) - A.pos[0];
      this.viewArmOff.position.z = A.pos[2];
      this.viewArmOff.position.y = -halfH * a[1] + A.pos[1]
        + Math.sin(this.walkPhase * 2) * 0.012 * bobK;
      this.viewArmOff.visible = this.viewArm.visible && !!this.offhand;
    }

    // The blade's stroke, to the player's own protractor: rest at twenty
    // degrees anticlockwise of vertical, strike at seventy — the blade
    // sweeps ACROSS the view toward the centre-left and eases back.
    if (this.bladeRig) {
      const b = this.bladeRig;
      const s = this.swingOsc() * this.swingK;
      b.holder.rotation.z = b.baseZ + s * 0.95;
      b.holder.rotation.x = b.baseX + s * 0.5;
    }

    // Gun recoil: the rig slams back and up off its rest pose and eases home
    // over a few frames. Percentage decay rather than dt — the whole life of
    // a kick is a third of a second, and this sync runs once per frame.
    if (this.gunRig) {
      const g = this.gunRig, kk = this.gunKick;
      g.holder.position.z = g.base.pos[2] + kk * 0.13;
      g.holder.position.y = g.base.pos[1] + kk * 0.02;
      g.holder.rotation.x = g.base.rot[0] + kk * 0.16;
      this.gunKick *= 0.85;
      if (this.gunKick < 0.01) this.gunKick = 0;
      if (this.gunFlash > 0 && --this.gunFlash === 0) {
        g.flash.visible = false;
      }
    }
  }
}
