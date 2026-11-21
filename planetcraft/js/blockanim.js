// blockanim.js — the moving parts of chests, furnaces and doors.
//
// The chunk mesh is a baked BufferGeometry rebuilt only when a cell changes,
// so a lid that swings open cannot live in it. Every animated part is instead
// an overlay mesh in one THREE.Group, positioned from the cell's own frame.
// Nothing in cubemesher.js has to know, and a lid that is mid-swing costs no
// remesh at all.
//
// The world is a sphere, so "up" is different at every cell: an overlay is
// oriented by the local up from dirFromCell, never by world +Y. Get that wrong
// and the chest on the far side of the planet opens sideways.
//
// This is the only file in the chest/furnace/door feature that imports three;
// blockentity.js stays headless so it can be unit-tested.

import * as THREE from 'three';
import { dirFromCell, R0 } from './cubesphere.js';
import * as CS from './cubesphere.js';
import { KIND } from './blockentity.js';
import { isFlat, flattenObject } from './flatten.js';
import { classMaterial, realBodiesOn } from './realbody.js';

const LID_MAX = 1.9;          // radians, ~109 degrees: past vertical, like a lid
const DOOR_MAX = Math.PI / 2;
const EASE_RATE = 9;          // exponential approach; smoothstep does the rest

const DEFAULT_SOUNDS = {
  // audio.js has no dedicated latch sample; blockPlace is a short wooden
  // click and reads correctly. main.js can override any of these.
  chestOpen: 'blockPlace', chestClose: 'blockPlace',
  doorOpen: 'blockPlace', doorClose: 'blockBreak',
};

let group = null;
let host = null;                 // the scene we were added to
let opts = { onSound: null, sounds: { ...DEFAULT_SOUNDS } };
const anims = new Map();         // "f,u,v,h" -> anim
const LAMP_KIND = 'lamp';
const FIRE_KIND = 'campfire';
const JET_KIND = 'fountain';
const PIPE_KIND = 'shisha';

// smoothstep on an exponentially-approached parameter: the lid leaves and
// arrives slowly and never overshoots, which a raw lerp does not manage
const ease = (t) => t * t * (3 - 2 * t);
const approach = (cur, want, dt) => cur + (want - cur) * Math.min(1, dt * EASE_RATE);

// --- shared assets -----------------------------------------------------------
// One geometry and one material per shape; only the things whose brightness
// varies per instance (the furnace glow, the particles) get a clone.

let assets = null;

function softDot(inner, outer) {
  // a radial blob, for flame and smoke sprites. No atlas edit needed.
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// A lid, a leaf, a latch: its flat colour under every style, and under the
// Realistic style grained timber and brushed iron in the same light as the
// chest it lifts off. Tagged `realLook`, so a change of style re-dresses it.
const realAnim = {};
const ANIM_COLOUR = { wood: 0x8a5a2b, dark: 0x3a2a16, metal: 0xb9c0cc };
function looked(geo, key) {
  const A = buildAssets();
  const look = (real) => (real
    ? (realAnim[key] ??= classMaterial(key === 'metal' ? 'metal' : 'wood',
      { color: ANIM_COLOUR[key], vertexColors: false, faceShade: false }))
    : A[key]);
  const mesh = new THREE.Mesh(geo, look(realBodiesOn()));
  mesh.userData.realLook = look;
  return mesh;
}

function buildAssets() {
  if (assets) return assets;
  assets = {
    lid: new THREE.BoxGeometry(0.86, 0.14, 0.84),
    latch: new THREE.BoxGeometry(0.16, 0.12, 0.08),
    leaf: new THREE.BoxGeometry(0.12, 0.96, 0.9),
    handle: new THREE.BoxGeometry(0.1, 0.1, 0.1),
    glow: new THREE.PlaneGeometry(0.62, 0.5),
    wood: new THREE.MeshBasicMaterial({ color: 0x8a5a2b }),
    dark: new THREE.MeshBasicMaterial({ color: 0x3a2a16 }),
    metal: new THREE.MeshBasicMaterial({ color: 0xb9c0cc }),
    glass: new THREE.MeshBasicMaterial({
      color: 0xa8d8ea, transparent: true, opacity: 0.45, depthWrite: false,
    }),
    glowMat: new THREE.MeshBasicMaterial({
      color: 0xff7a1e, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
      side: THREE.DoubleSide,
    }),
    flameMat: new THREE.SpriteMaterial({
      map: softDot('rgba(255,238,170,1)', 'rgba(255,110,20,0)'),
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
    smokeMat: new THREE.SpriteMaterial({
      map: softDot('rgba(120,120,130,0.8)', 'rgba(90,90,100,0)'),
      transparent: true, depthWrite: false,
    }),
    // the fountain's spray: white at the core, blue at the edge, and it does
    // NOT add its light to what is behind it — water is wet, not lit
    dropMat: new THREE.SpriteMaterial({
      map: softDot('rgba(238,250,255,0.95)', 'rgba(120,190,240,0)'),
      transparent: true, depthWrite: false,
    }),
  };
  return assets;
}

// --- placing an overlay on a curved world ------------------------------------

const _up = new THREE.Vector3();
const _ex = new THREE.Vector3();
const _ez = new THREE.Vector3();
const _m = new THREE.Matrix4();

// The cell's own frame: +Y is the local up, +X is the +u tangent, +Z is
// U x up (which points along -v). Everything below is written in that frame,
// so the same numbers work at the pole and at the equator.
function orient(obj, f, u, v, h) {
  const c = dirFromCell(f, u + 0.5, v + 0.5);
  const du = dirFromCell(f, u + 1.5, v + 0.5);
  // On the plane the anchor is not a direction, so up cannot come from
  // normalizing it — it is simply +Y, and the tangent maths below then
  // reduces to the identity frame it should be.
  if (CS.FLAT) _up.set(0, 1, 0);
  else _up.set(c[0], c[1], c[2]).normalize();
  _ex.set(du[0] - c[0], du[1] - c[1], du[2] - c[2]);
  _ex.addScaledVector(_up, -_ex.dot(_up));      // project the tangent flat
  if (_ex.lengthSq() < 1e-12) _ex.set(1, 0, 0).cross(_up);
  _ex.normalize();
  _ez.copy(_ex).cross(_up).normalize();
  _m.makeBasis(_ex, _up, _ez);
  obj.quaternion.setFromRotationMatrix(_m);
  const rad = R0 + h + 0.5;                      // the cell's mid-radius
  if (CS.FLAT) obj.position.set(c[0], rad, c[2]);
  else obj.position.copy(_up).multiplyScalar(rad);
  obj.updateMatrixWorld?.(true);
  // Where this overlay REALLY stands, kept because the unrolled map is about
  // to move it and the truth has to survive that. See placeOverlays.
  obj.userData.truePos = obj.position.clone();
  obj.userData.trueQuat = obj.quaternion.clone();
  return obj;
}

// --- the unrolled map ---------------------------------------------------------
//
// Every overlay in this file stands at a cell: a lamp's halo, a torch's flame,
// a campfire, a furnace mouth, a fountain's spray. The BLOCK under each of
// them is bent to the flat horizon by the terrain's vertex shader (see
// flatten.js), and until now the overlay was not bent by anything — so the
// two agreed only directly under the player and drifted apart with distance.
// A street lamp across the village had its glow hanging short of the post and
// below it; far enough away, in the ground.
//
// These are points, not landscape, so they take the cheap treatment
// flatten.js keeps for entities: re-place the root, leave its own half-metre
// of geometry alone. Truth is restored first every frame because
// flattenObject PREMULTIPLIES its rotation, and because the projection has to
// be undone when the player leaves first person.
const _op = new THREE.Vector3();
let displaced = false;    // is anything currently sitting off its true cell?

function placeOverlays() {
  const flat = isFlat();
  // On the round globe every overlay is already where it belongs, so there is
  // nothing to do but the one pass that puts them back after the projection
  // was last switched off.
  if (!flat && !displaced) return;
  displaced = flat;
  for (const a of anims.values()) {
    const d = a.root?.userData;
    if (!d?.truePos) continue;
    a.root.position.copy(d.truePos);
    a.root.quaternion.copy(d.trueQuat);
    if (flat) flattenObject(a.root, _op.copy(d.truePos));
  }
}

const keyOf = (f, u, v, h) => `${f},${u},${v},${h}`;

// --- lifecycle ---------------------------------------------------------------

// Call once per world. Travelling to another planet calls buildWorld again, so
// call this again too: it throws the old overlays away rather than leaving a
// lid floating where the old planet's chest used to be.
export function createBlockAnims(scene, options = {}) {
  disposeBlockAnims();
  buildAssets();
  host = scene;
  opts = {
    onSound: options.onSound ?? null,
    sounds: { ...DEFAULT_SOUNDS, ...(options.sounds ?? {}) },
  };
  group = new THREE.Group();
  group.name = 'block-anims';
  scene?.add?.(group);
  return group;
}

export function disposeBlockAnims() {
  for (const key of [...anims.keys()]) removeBlockAnim(...key.split(',').map(Number));
  if (group && host) host.remove?.(group);
  group = null;
  host = null;
}

export const blockAnimGroup = () => group;
export const blockAnimCount = () => anims.size;
// what kind of overlay stands at a cell, so main.js can clear a lamp's glow
// when a paste writes something else over it without touching a chest's lid
export const animKindAt = (f, u, v, h) => anims.get(keyOf(f, u, v, h))?.kind ?? null;

// Every cell in the world that is giving off LIGHT: lamps, lanterns, street
// lamps, campfires. Nothing scans the blocks for a lamp id — this registry
// already knows, because something had to hang a halo on each of them.
//
// It is what the dark is afraid of. A zombie will not come inside the reach of
// one of these (see litNear in main.js), which is what makes a lit street a
// wall to them and a lamp something worth the coal it cost.
export function lightCells(out = []) {
  out.length = 0;
  for (const a of anims.values()) {
    if (a.kind === LAMP_KIND || a.kind === FIRE_KIND) out.push(a);
  }
  return out;
}

function sound(name) {
  const s = opts.sounds[name];
  if (s && opts.onSound) opts.onSound(s, {});
}

// --- use pulse ---------------------------------------------------------------
//
// A short flare around a block you just used. It exists because opening a
// screen is the only feedback some blocks give: a crafting table has no lid
// to lift and no fire to light, so without this you cannot tell a successful
// use from a misclick. It is deliberately not per-block — a transient shell
// works for anything, including blocks with no model of their own.

const PULSE_SECONDS = 0.42;
let pulses = [];
let pulseGeo = null;

export function pulseBlock(f, u, v, h) {
  if (!group) return null;
  if (!pulseGeo) pulseGeo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({
    color: 0xffe6a8, transparent: true, opacity: 0.5, depthWrite: false,
    toneMapped: false,
  }));
  orient(mesh, f, u, v, h);
  group.add(mesh);
  const p = { mesh, t: 0 };
  pulses.push(p);
  return p;
}

function updatePulses(step) {
  if (!pulses.length) return;
  const keep = [];
  for (const p of pulses) {
    p.t += step;
    const k = p.t / PULSE_SECONDS;
    if (k >= 1) {
      group.remove(p.mesh);
      p.mesh.material.dispose();
      continue;
    }
    // swells outward and fades: reads as a tap rather than as a glow
    p.mesh.scale.setScalar(1.02 + k * 0.5);
    p.mesh.material.opacity = 0.5 * (1 - k) * (1 - k);
    keep.push(p);
  }
  pulses = keep;
}

// --- chest -------------------------------------------------------------------

export function addChestAnim(f, u, v, h, entity = null) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);
  // hinged at the BACK top edge, so the lid tips away from you as it opens
  const hinge = new THREE.Object3D();
  hinge.position.set(0, 0.5, -0.42);
  const lid = looked(A.lid, 'wood');
  lid.position.set(0, 0.07, 0.42);
  const latch = looked(A.latch, 'metal');
  latch.position.set(0, 0.0, 0.86);
  lid.add(latch);
  hinge.add(lid);
  root.add(hinge);
  group.add(root);

  const anim = { key, kind: KIND.CHEST, f, u, v, h, root, hinge, entity, t: 0, want: 0 };
  anims.set(key, anim);
  return anim;
}

// open = true swings the lid up. Also called with the viewer count, so two
// players in the same chest keep it open until the last one leaves.
export function setChestOpen(f, u, v, h, open) {
  const a = anims.get(keyOf(f, u, v, h));
  if (!a || a.kind !== KIND.CHEST) return false;
  const want = open ? 1 : 0;
  if (a.want !== want) sound(open ? 'chestOpen' : 'chestClose');
  a.want = want;
  return true;
}

// --- furnace -----------------------------------------------------------------

const FACING_YAW = [0, Math.PI, Math.PI / 2, -Math.PI / 2];  // +u, -u, +v, -v

export function addFurnaceAnim(f, u, v, h, entity = null, facing = 0) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);

  // the mouth: one quad just proud of the chosen side face. cubemesher.js
  // gives every side the same tile, so which side is "front" is ours to pick;
  // main.js can pass the placement facing to make it face the player.
  const yaw = new THREE.Object3D();
  yaw.rotation.y = FACING_YAW[facing & 3] ?? 0;
  const glowMat = A.glowMat.clone();
  const glow = new THREE.Mesh(A.glow, glowMat);
  glow.position.set(0.505, -0.08, 0);
  glow.rotation.y = Math.PI / 2;
  yaw.add(glow);
  root.add(yaw);

  // a flame and a little smoke above the top face
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const smoke = i >= 2;
    const mat = (smoke ? A.smokeMat : A.flameMat).clone();
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    root.add(spr);
    parts.push({ spr, mat, smoke, t: 1 + i * 0.17, seed: Math.random() * 6.28 });
  }

  group.add(root);

  const anim = {
    key, kind: KIND.FURNACE, f, u, v, h, root, glow, glowMat, parts,
    entity, t: 0, want: 0, phase: Math.random() * 6.28,
  };
  anims.set(key, anim);
  return anim;
}

// --- lamps and campfires -----------------------------------------------------
//
// Neither has state to keep, so neither is a block entity: the block id alone
// says "this glows", and main.js adds the overlay wherever one of these ids
// lands in the world. The kinds are local strings because blockentity.js's
// KIND enum is for things with per-cell state, which a steady light is not.


// `head` is where the light sits in the cell's own frame: a lamp glows at its
// shade, a street lamp at the head of its post.
export function addLampAnim(f, u, v, h, head = 0.24) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);
  const mat = A.flameMat.clone();
  mat.color = new THREE.Color(0xffe6b0);
  const halo = new THREE.Sprite(mat);
  halo.position.set(0, head, 0);
  halo.scale.set(1.15, 1.15, 1);
  root.add(halo);
  group.add(root);

  const anim = {
    key, kind: LAMP_KIND, f, u, v, h, root, halo, mat,
    phase: Math.random() * 6.28,
  };
  anims.set(key, anim);
  return anim;
}

export function addCampfireAnim(f, u, v, h) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);
  // more fire than a furnace mouth: four flames and three ribbons of smoke,
  // rising from the ember bed near the cell's floor
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const smoke = i >= 4;
    const mat = (smoke ? A.smokeMat : A.flameMat).clone();
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    root.add(spr);
    parts.push({ spr, mat, smoke, t: (i * 0.31) % 1, seed: Math.random() * 6.28 });
  }
  group.add(root);

  const anim = {
    key, kind: FIRE_KIND, f, u, v, h, root, parts,
    phase: Math.random() * 6.28,
  };
  anims.set(key, anim);
  return anim;
}

// --- the water pipe ----------------------------------------------------------
//
// A SHISHA THAT DOES NOT SMOKE IS AN ORNAMENT. The mesher gives it a lit coal
// on the bowl — one warm speck, the only part of the model that says the thing
// is burning — and a coal with nothing coming off it reads as a bead. The
// smoke is what makes a café full of pipes look like a café.
//
// It is NOT the campfire's plume made smaller. A fire throws smoke; a pipe
// SEEPS it — one thin ribbon, slow, faint, wandering more the higher it gets,
// and gone by the height of a standing man. Two wisps and not seven, on
// staggered clocks so the ribbon is continuous rather than pulsing, because
// twelve of these in one room is twelve times whatever this costs.
//
// It is its own kind and not a `campfire`, which matters for one reason: the
// overlay list is what `lightCells` is built from, and lightCells is what a
// zombie will not walk into. A coal on a water pipe is not a street light,
// and a café full of them must not read as a floodlit square.
const PIPE_WISPS = 2;

export function addShishaAnim(f, u, v, h) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);
  const parts = [];
  for (let i = 0; i < PIPE_WISPS; i++) {
    const mat = A.smokeMat.clone();
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    root.add(spr);
    // staggered, so the ribbon is continuous and not a puff every two seconds
    parts.push({ spr, mat, t: i / PIPE_WISPS, seed: Math.random() * 6.28 });
  }
  group.add(root);

  const anim = { key, kind: PIPE_KIND, f, u, v, h, root, parts,
    phase: Math.random() * 6.28 };
  anims.set(key, anim);
  return anim;
}

function updateShisha(a, dt) {
  for (const p of a.parts) {
    // slow: a full wisp takes about six seconds to leave the bowl and go
    p.t += dt * 0.17;
    if (p.t >= 1) { p.t -= 1; p.seed = Math.random() * 6.28; }
    // out of the BOWL, which is the top of the cell — the model's coal sits
    // at 0.98 of it and the root is at the cell's middle, so the wisp starts
    // at +0.48 and climbs a little over a block
    const rise = 0.48 + p.t * 1.15;
    // it wanders more the further it gets from the bowl: a straight column of
    // smoke is a chimney, and this is a room with no draught in it
    const wander = 0.03 + p.t * 0.16;
    p.spr.visible = true;
    p.spr.position.set(
      Math.sin(p.seed + p.t * 2.3) * wander,
      rise,
      Math.cos(p.seed * 1.7 + p.t * 1.9) * wander,
    );
    // in fast, out slow, and FAINT throughout — this is a wisp off a coal,
    // not a bonfire, and at full strength twelve of them fog a room
    const fade = p.t < 0.12 ? p.t / 0.12 : 1 - (p.t - 0.12) / 0.88;
    p.mat.opacity = 0.17 * fade;
    const sc = 0.11 + p.t * 0.3;
    p.spr.scale.set(sc, sc, 1);
  }
}

// --- the fountain ------------------------------------------------------------
//
// A fountain that does not move is a bowl. The water in it is BLOCKS, and a
// block of water is a still cube — it cannot pour, and the flood simulation
// must not be asked to make it, because water that can run out of a fountain
// is a fountain that ends up empty the first time somebody digs near it.
//
// So the fountain runs the way a campfire burns: an overlay of sprites over
// the head of the jet, thrown up and falling back into the basin. It is what
// makes the middle of a village read as running water from the far end of the
// street, and it costs the world nothing — not a block, not an edit, not a
// line in the diff.
const JETS = 16;

export function addFountainAnim(f, u, v, h) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);
  const parts = [];
  for (let i = 0; i < JETS; i++) {
    const mat = A.dropMat.clone();
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    root.add(spr);
    // spread the drops round the head and round the cycle, so the jet is a
    // steady spray from the first frame rather than a shell going up together
    parts.push({ spr, mat, t: i / JETS, a: (i * 2.4) % 6.283 });
  }
  group.add(root);
  const anim = { key, kind: JET_KIND, f, u, v, h, root, parts };
  anims.set(key, anim);
  return anim;
}

// Each drop leaves the TOP FACE of the head — not its middle, which is inside
// a cube of water and hides the spray in the very block it is supposed to be
// coming out of — arcs outward, and falls a course and a half to the surface
// of the basin. Ballistic, because anything else reads as snow.
//
//   y = 0.45 at t=0   the top of the head block
//     ≈ 0.82 at peak  a hand's breadth of throw, which is a village fountain
//     = -1.5 at t=1   the surface of the basin, two courses down
//
// ...and it lands 0.9 out from the middle, which is inside the three-by-three
// of water and not on the rim somebody is sitting on.
function updateFountain(a, dt) {
  for (const p of a.parts) {
    p.t += dt * 0.85;
    if (p.t >= 1) { p.t -= 1; p.a = Math.random() * 6.283; }
    const t = p.t;
    const y = 0.45 + 3.4 * t - 5.35 * t * t;
    const r = 0.15 + 0.75 * t;
    p.spr.visible = true;
    p.spr.position.set(Math.cos(p.a) * r, y, Math.sin(p.a) * r);
    // fat and bright leaving the head, thin and faint by the time it lands
    const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    p.mat.opacity = 0.3 + 0.55 * fade;
    const sc = 0.32 - 0.12 * t;
    p.spr.scale.set(sc, sc, 1);
  }
}

function updateLamp(a, dt, ctx) {
  a.phase += dt * 2.1;
  // a lamp breathes very slightly — dead-steady reads as a decal — and it
  // earns its keep at night: near-invisible at noon, warm after dark
  const breathe = 0.92 + 0.08 * Math.sin(a.phase) * Math.sin(a.phase * 0.37);
  const dark = 1 - (ctx.daylight ?? 1);
  a.mat.opacity = (0.1 + 0.75 * dark) * breathe;
}

function updateCampfire(a, dt, ctx) {
  a.phase += dt * 9;
  const dark = 1 - (ctx.daylight ?? 1);
  for (const p of a.parts) {
    p.t += dt * (p.smoke ? 0.5 : 1.4);
    if (p.t >= 1) { p.t -= 1; p.seed = Math.random() * 6.28; }
    // the flames lick upward from the embers and the smoke carries on higher,
    // both wandering a little so the fire flows rather than pulses
    const rise = p.smoke ? 0.15 + p.t * 1.5 : -0.28 + p.t * 0.55;
    const sway = Math.sin(p.seed + p.t * 4) * (p.smoke ? 0.14 : 0.07);
    p.spr.visible = true;
    p.spr.position.set(sway, rise, Math.cos(p.seed + p.t * 3) * 0.07);
    const fade = 1 - p.t;
    const flick = 0.8 + 0.2 * Math.sin(a.phase + p.seed);
    p.mat.opacity = p.smoke ? 0.28 * fade
      : (0.7 + 0.3 * dark) * fade * flick;
    const s = p.smoke ? 0.24 + p.t * 0.5 : 0.42 * (0.6 + 0.6 * fade);
    p.spr.scale.set(s, s, 1);
  }
}

// --- door --------------------------------------------------------------------

export function addDoorAnim(f, u, v, h, entity = null, facing = 0, glassy = false) {
  if (!group) return null;
  const key = keyOf(f, u, v, h);
  if (anims.has(key)) return anims.get(key);
  const A = buildAssets();

  const root = new THREE.Object3D();
  orient(root, f, u, v, h);
  const yaw = new THREE.Object3D();
  yaw.rotation.y = FACING_YAW[facing & 3] ?? 0;
  // hinged on one vertical edge; the leaf hangs off it and swings about the
  // LOCAL up, which on a sphere is not world +Y
  const hinge = new THREE.Object3D();
  hinge.position.set(0, 0, -0.45);
  const leaf = glassy ? new THREE.Mesh(A.leaf, A.glass) : looked(A.leaf, 'wood');
  leaf.position.set(0, 0, 0.45);
  const handle = looked(A.handle, 'metal');
  handle.position.set(0.09, 0, 0.34);
  leaf.add(handle);
  hinge.add(leaf);
  yaw.add(hinge);
  root.add(yaw);
  group.add(root);

  const anim = {
    key, kind: KIND.DOOR, f, u, v, h, root, hinge, entity,
    t: entity?.open ? 1 : 0, want: entity?.open ? 1 : 0,
  };
  anims.set(key, anim);
  return anim;
}

export function setDoorOpen(f, u, v, h, open) {
  const a = anims.get(keyOf(f, u, v, h));
  if (!a || a.kind !== KIND.DOOR) return false;
  const want = open ? 1 : 0;
  if (a.want !== want) sound(open ? 'doorOpen' : 'doorClose');
  a.want = want;
  return true;
}

// --- removal -----------------------------------------------------------------

export function removeBlockAnim(f, u, v, h) {
  const key = keyOf(f, u, v, h);
  const a = anims.get(key);
  if (!a) return false;
  anims.delete(key);
  group?.remove?.(a.root);
  // only the per-instance clones are ours to dispose; the shared geometry and
  // materials outlive every individual chest
  a.glowMat?.dispose?.();
  a.mat?.dispose?.();
  for (const p of a.parts ?? []) p.mat?.dispose?.();
  return true;
}

// Make the overlays match a BlockEntities registry — the one call main.js
// needs after loading a save or arriving at a planet. O(entities).
export function syncBlockAnims(entities, { facingOf = null } = {}) {
  if (!group || !entities) return 0;
  const live = new Set();
  for (const ent of entities.entries()) {
    const key = keyOf(ent.f, ent.u, ent.v, ent.h);
    live.add(key);
    if (anims.has(key)) { anims.get(key).entity = ent; continue; }
    const facing = facingOf?.(ent) ?? ent.facing ?? 0;
    if (ent.kind === KIND.CHEST) addChestAnim(ent.f, ent.u, ent.v, ent.h, ent);
    else if (ent.kind === KIND.FURNACE) {
      addFurnaceAnim(ent.f, ent.u, ent.v, ent.h, ent, facing);
    } else if (ent.kind === KIND.DOOR) {
      addDoorAnim(ent.f, ent.u, ent.v, ent.h, ent, facing);
    }
  }
  for (const key of [...anims.keys()]) {
    // lamps, campfires and fountains are not entities — where they are is
    // something the generator wrote down, so an entity sync must not sweep
    // them away
    const kind = anims.get(key)?.kind;
    if (kind === LAMP_KIND || kind === FIRE_KIND || kind === JET_KIND
      || kind === PIPE_KIND) continue;
    if (!live.has(key)) removeBlockAnim(...key.split(',').map(Number));
  }
  return anims.size;
}

// --- the frame ---------------------------------------------------------------

// Called once per frame from main.js. Reads the entities directly, so nothing
// has to push state in: a chest with viewers is open, a lit furnace glows.
export function updateBlockAnims(dt, ctx = {}) {
  if (!group) return;
  const step = Math.min(dt ?? 0, 0.1);   // a restored tab must not fling a lid
  updatePulses(step);                    // pulses exist without any anim entry
  if (anims.size === 0) return;
  placeOverlays();                       // the flat horizon, before anything moves

  for (const a of anims.values()) {
    if (a.kind === KIND.CHEST) {
      if (a.entity && a.entity.viewers !== undefined) {
        const want = a.entity.viewers > 0 ? 1 : 0;
        if (want !== a.want) {
          sound(want ? 'chestOpen' : 'chestClose');
          a.want = want;
        }
      }
      a.t = approach(a.t, a.want, step);
      a.hinge.rotation.x = -ease(a.t) * LID_MAX;
    } else if (a.kind === KIND.DOOR) {
      if (a.entity) a.want = a.entity.open ? 1 : 0;
      a.t = approach(a.t, a.want, step);
      a.hinge.rotation.y = -ease(a.t) * DOOR_MAX;
    } else if (a.kind === KIND.FURNACE) {
      updateFurnace(a, step, ctx);
    } else if (a.kind === LAMP_KIND) {
      updateLamp(a, step, ctx);
    } else if (a.kind === FIRE_KIND) {
      updateCampfire(a, step, ctx);
    } else if (a.kind === JET_KIND) {
      updateFountain(a, step);
    } else if (a.kind === PIPE_KIND) {
      updateShisha(a, step);
    }
  }
}

function updateFurnace(a, dt, ctx) {
  const lit = !!a.entity?.lit;
  a.want = lit ? 1 : 0;
  a.t = approach(a.t, a.want, dt);
  a.phase += dt * 7;
  // flicker, not a steady lamp: a constant glow reads as a decal
  const flicker = 0.78 + 0.22 * Math.sin(a.phase) * Math.sin(a.phase * 0.61);
  a.glowMat.opacity = ease(a.t) * flicker * 0.85;
  a.glow.visible = a.glowMat.opacity > 0.01;

  for (const p of a.parts) {
    if (!lit && p.t >= 1) { p.spr.visible = false; continue; }
    p.t += dt * (p.smoke ? 0.55 : 1.5);
    if (p.t >= 1) {
      if (!lit) { p.spr.visible = false; continue; }
      p.t -= 1;
      p.seed = Math.random() * 6.28;
    }
    const rise = p.smoke ? 0.55 + p.t * 1.15 : 0.52 + p.t * 0.3;
    const sway = Math.sin(p.seed + p.t * 3) * (p.smoke ? 0.12 : 0.04);
    p.spr.visible = true;
    p.spr.position.set(sway, rise, Math.cos(p.seed + p.t * 2) * 0.05);
    const fade = 1 - p.t;
    p.mat.opacity = (p.smoke ? 0.32 : 0.85) * fade * ease(a.t);
    const s = p.smoke ? 0.2 + p.t * 0.42 : 0.3 * (0.7 + 0.5 * fade);
    p.spr.scale.set(s, s, 1);
  }
  if (ctx.daylight != null && a.glow.visible) {
    // brighter against a dark sky, exactly like a torch would read
    a.glowMat.opacity *= 1.25 - 0.35 * ctx.daylight;
  }
}

export default {
  createBlockAnims, updateBlockAnims, syncBlockAnims,
  addChestAnim, addFurnaceAnim, addDoorAnim, addLampAnim, addCampfireAnim,
  addFountainAnim,
  removeBlockAnim, setChestOpen, setDoorOpen, disposeBlockAnims,
};
