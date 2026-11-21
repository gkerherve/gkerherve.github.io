// boat.js — free boats, already moored along the coasts, that you can ride.
//
// A boat is deliberately NOT an Entity. It has no brain, it never walks, and
// only the one you are sitting in does any work per frame — the rest are
// static meshes with a bob on them. That is what keeps the whole system under
// the entity budget this project has been bitten by before: the pool is fixed
// at BOAT_TUNING.max meshes for the life of a world, and a boat far from the
// player is re-moored near you rather than a new one being allocated.
//
// Everything is built from the local cell frame. `up` is the normalised
// position, the heading is a tangent vector, and the body basis is rebuilt
// from those two EVERY frame:
//
//     right = heading x up;  basis = makeBasis(right, up, -heading)
//
// which is exactly what player.js's refreshBasis and entities.js's syncMesh
// do, and the reason a boat cannot accumulate roll or end up on its side on
// the far side of the globe. There is no world +Y anywhere in this file.
//
// Riding REPLACES the player's physics rather than adding to it: while
// ridingBoat() is non-null main.js calls updateBoats(dt, player) instead of
// player.update(dt), and this module writes player.pos / player.up and then
// calls the player's own refreshBasis() and syncCamera(). Look, third-person
// view and the avatar therefore keep working with no change to player.js.
//
// See INTEGRATION-boats.md for the exact wiring.

import * as THREE from 'three';
import { BLOCK, R0 } from './cubesphere.js';
import { poseAvatar } from './player.js';
import { classMaterial, realBodiesOn } from './realbody.js';

export const BOAT_TUNING = {
  max: 14,             // hard cap on boats in a world, whatever its size
  nearby: 2,           // boats kept moored within nearArc of the player
  perHarbour: 2,       // ...and how many tie up at each shore village
  nearArc: 95,         // blocks of surface distance that counts as "nearby"
  recycleArc: 240,     // a boat further off than this may be re-moored
  recycleEvery: 1.7,   // seconds between relocation attempts: never bulk
  probes: 20,          // candidate spots tried per mooring attempt
  probeBudget: 900,    // total spot probes createBoats may spend, then it stops
  scanArc: 26,         // blocks around a candidate a mooring is looked for in
  boardReach: 3.4,     // blocks from the player's feet to the hull to board
  accel: 8.0,          // blocks/s^2 with the throttle open
  drag: 1.15,          // 1/s of water resistance; with accel this sets the top
  maxSpeed: 8.5,       // blocks/s, hard clamp
  reverse: 0.45,       // fraction of the forward power available astern
  turn: 2.0,           // rad/s of rudder with way on
  turnStill: 0.9,      // rad/s dead in the water: a boat still pivots, slowly
  // Least water a mooring may have. A mooring must also be beside a shore,
  // and the shelf there is shallow, so this cannot be raised much: at 2.2 no
  // spot on an archipelago satisfies both and you get no boats at all. The
  // seaward bow is what actually gets you off the beach.
  moorDepth: 1.4,
  // Water this deep or less drags the hull. It must be BELOW the depth of an
  // ordinary sea, or the boat is always being dragged and never gets under
  // way: on a small world the whole ocean is one or two blocks deep, and at
  // 2.0 a rowing boat could not cross any of it.
  shallow: 1.0,
  beach: 0.35,         // speed kept after grounding: bump, not bounce
  bob: 0.055,          // blocks of heave
  bobRate: 1.15,
  seat: 0.20,          // player's feet above the waterline while aboard
  drawArc: 380,        // boats further away than this are not drawn
};

// water shallower than this will not float a hull
const MIN_FLOAT = 0.9;
// how far the slide fans out when the bow meets a shore, in radians
const SLIDE_FAN = [0.55, -0.55, 1.05, -1.05];

// scratch — one set per purpose so a helper cannot clobber its caller
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _try = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _spot = new THREE.Vector3();
const _up = new THREE.Vector3();
// isShore runs INSIDE findMooring's loop, so it must not share a vector with
// it — a helper that clobbers its caller's tangent basis is exactly the bug
// this file's scratch discipline exists to prevent
const _s1 = new THREE.Vector3();
const _s2 = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _so = new THREE.Vector3();

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// two unit vectors spanning the tangent plane at `up`; the seed axis is the
// one least aligned with up, so the cross product never degenerates
function tangentBasis(up, t1, t2) {
  if (Math.abs(up.x) < 0.9) _ax.set(1, 0, 0);
  else _ax.set(0, 1, 0);
  t1.crossVectors(_ax, up).normalize();
  t2.crossVectors(up, t1);
}

// surface distance in blocks between two directions on a sphere of radius r
function arcBetween(a, b, r) {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * r;
}

// walk `arc` blocks from `up` along the tangent `t`, staying on the sphere
function offsetDir(up, t, arc, r, out) {
  const ang = arc / Math.max(1, r);
  return out.copy(up).multiplyScalar(Math.cos(ang))
    .addScaledVector(t, Math.sin(ang)).normalize();
}

// ---------------------------------------------------------------------------
// the water
//
// One definition of "is this floatable water", used by the mooring search, the
// movement resolution and (imported) by fish.js, so the three can never drift
// apart and disagree about where the sea is.

// Radius of the sea surface. Read off the PLANET, not the module: a Planet
// freezes SEA at construction and an interplanetary jump moves the module
// level one on. Returns 0 for a world with no sea at all, which is the cheap
// "this preset gets no boats" answer.
export function seaRadius(planet) {
  const top = planet?.seaTop ?? -1;
  if (top < 0) return 0;
  return (planet?.R0 ?? R0) + top + 1;
}

// Depth of open water at `dir` in blocks, or 0 for land, ice, a puddle too
// shallow to float a hull, or a lake someone has filled in.
export function waterDepth(planet, dir, seaR = seaRadius(planet)) {
  if (!seaR) return 0;
  const depth = seaR - planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
  if (depth < MIN_FLOAT) return 0;
  // surfaceRadius answers with the BED under a fluid, so the cell just under
  // the surface is what says whether this is water or an ice cap
  const t = seaR - 0.5;
  return planet.blockAtWorld(dir.x * t, dir.y * t, dir.z * t) === BLOCK.WATER
    ? depth : 0;
}

// ---------------------------------------------------------------------------
// model
//
// Vertex-coloured boxes merged into ONE BufferGeometry, so a boat is a single
// draw call and needs no canvas, no atlas and no lighting. Face brightness is
// baked in the same order the block mesher uses, which is what stops a plain
// box reading as flat plastic beside the pixel-art world.

// +x, -x, +y, -y, +z, -z; wound counter-clockwise seen from outside
const FACE_SHADE = [0.82, 0.82, 1.0, 0.55, 0.68, 0.68];
const FACE_CORNERS = [
  [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
  [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
  [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
  [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
];

// boxes: [{ x, y, z, w, h, d, c: [r, g, b] }] in the model's own frame, where
// +Y is up and -Z is forward — the same convention as every other body in the
// game, because the shared basis puts local -Z along the heading.
// The boxes' timber first and their iron after, as two groups: under the
// Realistic style the one is grained and the other brushed (see voxelLook).
// A box is iron when its colour is a grey. The UVs run across each face in
// blocks, so the grain is the same size on a thwart as on the keel.
const isIron = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 0.08;
export function voxelGeometry(boxes) {
  const n = boxes.length;
  const pos = new Float32Array(n * 24 * 3);
  const col = new Float32Array(n * 24 * 3);
  const uvs = new Float32Array(n * 24 * 2);
  const idx = new Uint16Array(n * 36);
  const order = [...boxes].sort((a, b) => isIron(a.c) - isIron(b.c));
  const wood = order.filter((b) => !isIron(b.c)).length;
  let p = 0, c = 0, t = 0, i = 0, base = 0;
  for (const b of order) {
    const hw = b.w / 2, hh = b.h / 2, hd = b.d / 2;
    for (let f = 0; f < 6; f++) {
      const s = FACE_SHADE[f];
      for (const [sx, sy, sz] of FACE_CORNERS[f]) {
        const x = b.x + sx * hw, y = b.y + sy * hh, z = b.z + sz * hd;
        pos[p++] = x; pos[p++] = y; pos[p++] = z;
        col[c++] = b.c[0] * s;
        col[c++] = b.c[1] * s;
        col[c++] = b.c[2] * s;
        // the two axes lying in this face
        const [a1, a2] = f < 2 ? [z, y] : f < 4 ? [x, z] : [x, y];
        uvs[t++] = a1; uvs[t++] = a2;
      }
      idx[i++] = base; idx[i++] = base + 1; idx[i++] = base + 2;
      idx[i++] = base; idx[i++] = base + 2; idx[i++] = base + 3;
      base += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.addGroup(0, wood * 36, 0);
  geo.addGroup(wood * 36, (n - wood) * 36, 1);
  return geo;
}

// A voxel model's look: its flat colours under every style, and under the
// Realistic style timber and iron, lit. Tagged on the mesh as `realLook`, so
// a change of style re-dresses it (see onRealChange in main.js).
let _voxelReal = null;
export function voxelLook(flat) {
  return (real) => (real
    ? (_voxelReal ??= [classMaterial('wood'), classMaterial('metal')])
    : [flat, flat]);
}

const OAK = [0.63, 0.45, 0.25];
const OAK2 = [0.55, 0.38, 0.21];      // the next plank along, a shade darker
const TRIM = [0.41, 0.28, 0.15];
const KEEL = [0.32, 0.22, 0.12];

// A rowing boat, three blocks long: planked floor, two gunwales, a raised
// prow, a transom and two thwarts. Everything is axis-aligned in the model's
// own frame, so it reads as built out of the same blocks as the world.
function boatBoxes() {
  const b = [];
  const box = (x, y, z, w, h, d, c) => b.push({ x, y, z, w, h, d, c });
  // deck: five slats, alternating shade, so the floor reads as planking
  for (let i = 0; i < 5; i++) {
    box(0, 0.07, -1.0 + i * 0.5, 1.06, 0.14, 0.46, i % 2 ? OAK2 : OAK);
  }
  box(0, -0.09, 0, 0.26, 0.16, 2.5, KEEL);            // keel, under the water
  for (const s of [-1, 1]) {
    box(s * 0.58, 0.30, 0, 0.14, 0.46, 2.7, OAK);     // gunwale
    box(s * 0.58, 0.56, 0, 0.18, 0.08, 2.74, TRIM);   // rubbing strake on top
  }
  box(0, 0.30, 1.42, 1.18, 0.46, 0.16, OAK2);         // transom (stern)
  box(0, 0.32, -1.42, 0.86, 0.50, 0.18, OAK2);        // bow, narrowed
  box(0, 0.36, -1.60, 0.40, 0.58, 0.22, TRIM);        // stem post
  box(0, 0.38, -0.55, 1.16, 0.10, 0.32, OAK2);        // forward thwart
  box(0, 0.38, 0.62, 1.16, 0.10, 0.32, OAK2);         // after thwart (the seat)
  return b;
}

let _geo = null;
let _mat = null;

function boatMaterial() {
  _geo ??= voxelGeometry(boatBoxes());
  _mat ??= new THREE.MeshBasicMaterial({ vertexColors: true });
  return { geo: _geo, mat: _mat };
}

// ---------------------------------------------------------------------------
// a boat

class Boat {
  constructor(planet, dir, seaR, rand = Math.random) {
    this.planet = planet;
    this.seaR = seaR;
    this.up = dir.clone().normalize();
    this.pos = this.up.clone().multiplyScalar(seaR);
    this.heading = new THREE.Vector3();
    this.speed = 0;
    this.rider = null;
    this.bobPhase = rand() * 6.283;

    const { geo, mat } = boatMaterial();
    // outer group carries the world basis, inner mesh carries the heave and
    // the roll — a bob written onto the outer one would be overwritten by the
    // basis next frame, which is the bug this split exists to avoid
    this.mesh = new THREE.Group();
    const look = voxelLook(mat);
    this.hull = new THREE.Mesh(geo, look(realBodiesOn()));
    this.hull.userData.realLook = look;
    this.mesh.add(this.hull);

    // Bow to seaward. A random heading points a moored boat at the beach it
    // is moored against about half the time, and since the shallows drag the
    // hull the first thing you do aboard is grind to a halt facing a cliff.
    // Pick the tangent with the deepest water ahead of it instead.
    tangentBasis(this.up, _t1, _t2);
    let bestA = rand() * 6.283, bestD = -1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283;
      _sv.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a));
      offsetDir(this.up, _sv, 5, seaR, _so);
      const d = waterDepth(planet, _so, seaR);
      if (d > bestD) { bestD = d; bestA = a; }
    }
    this.heading.copy(_t1).multiplyScalar(Math.cos(bestA))
      .addScaledVector(_t2, Math.sin(bestA));
    this.projectHeading();
    this.syncMesh(0);
  }

  // keep the heading tangential; this is what makes roll impossible
  projectHeading() {
    this.heading.addScaledVector(this.up, -this.heading.dot(this.up));
    if (this.heading.lengthSq() < 1e-8) {
      this.heading.set(this.up.y, -this.up.x, 0);
      this.heading.addScaledVector(this.up, -this.heading.dot(this.up));
    }
    this.heading.normalize();
  }

  // move an unridden boat to a new mooring
  moorTo(dir, rand = Math.random) {
    this.up.copy(dir).normalize();
    this.pos.copy(this.up).multiplyScalar(this.seaR);
    tangentBasis(this.up, _t1, _t2);
    const a = rand() * 6.283;
    this.heading.copy(_t1).multiplyScalar(Math.cos(a))
      .addScaledVector(_t2, Math.sin(a));
    this.projectHeading();
    this.speed = 0;
    this.syncMesh(0);
  }

  depthHere() {
    return waterDepth(this.planet, this.up, this.seaR);
  }

  // Slide `dist` blocks along the heading, staying on water.
  //
  // The boat only ever moves along its own heading — it has no strafe — so a
  // shore is dealt with by fanning the step sideways rather than by clamping
  // per axis: the cube-face axes are an arbitrary frame for a coastline, and
  // resolving against them would make the same beach behave differently on
  // either side of a seam. Returns 'run' if it moved as asked, 'slide' if it
  // had to fan, or 'stop' if the bow is against the shore.
  advance(dist, preferSide = 0) {
    if (Math.abs(dist) < 1e-6) return 'run';
    const seaR = this.seaR;
    _try.copy(this.pos).addScaledVector(this.heading, dist).setLength(seaR);
    _v.copy(_try).normalize();
    if (waterDepth(this.planet, _v, seaR) > 0) {
      this.pos.copy(_try);
      this.up.copy(_v);
      return 'run';
    }
    // fan out, nearest angle first, preferring the side the rudder is asking
    // for so steering off a beach does what the player just told it to
    for (const a of SLIDE_FAN) {
      const ang = preferSide < 0 ? -a : a;
      _v2.copy(this.heading).applyAxisAngle(this.up, ang);
      _try.copy(this.pos).addScaledVector(_v2, dist * 0.7).setLength(seaR);
      _v.copy(_try).normalize();
      if (waterDepth(this.planet, _v, seaR) <= 0) continue;
      this.pos.copy(_try);
      this.up.copy(_v);
      return 'slide';
    }
    return 'stop';
  }

  // one frame of helm. `keys` is the player's own Set of held key codes, so
  // there is no second input path to keep in step.
  drive(dt, keys) {
    const T = BOAT_TUNING;
    const fwd = keys.has('KeyW') ? 1 : 0;
    const back = keys.has('KeyS') ? 1 : 0;
    let rudder = 0;
    if (keys.has('KeyA')) rudder += 1;
    if (keys.has('KeyD')) rudder -= 1;

    // rudder bites harder with way on, but never falls to nothing: a boat you
    // cannot turn while stopped is a boat you cannot get off a beach
    if (rudder) {
      const bite = Math.min(1, Math.abs(this.speed) / (T.maxSpeed * 0.5));
      const rate = T.turnStill + (T.turn - T.turnStill) * bite;
      const way = this.speed < -0.05 ? -1 : 1;   // rudder reverses astern
      this.heading.applyAxisAngle(this.up, rudder * way * rate * dt);
      this.projectHeading();
    }

    const power = (fwd - back * T.reverse) * T.accel;
    this.speed += power * dt;
    // water resistance, applied as an exponential so it is frame-rate free
    this.speed *= Math.exp(-T.drag * dt);
    // shallows drag the hull: this is what turns a grounding into a beaching
    const depth = this.depthHere();
    if (depth > 0 && depth < T.shallow) {
      this.speed *= Math.exp(-(1.8 * (1 - depth / T.shallow)) * dt);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -T.maxSpeed * T.reverse,
      T.maxSpeed);

    const how = this.advance(this.speed * dt, rudder);
    if (how === 'stop') this.speed *= BOAT_TUNING.beach;
    else if (how === 'slide') this.speed *= 0.94;
    return how;
  }

  // rebuild the world transform from up + heading. Assigning (never adding)
  // the heave and roll means neither can accumulate.
  syncMesh(t) {
    this.up.copy(this.pos).normalize();
    this.projectHeading();
    _v.crossVectors(this.heading, this.up);
    _m.makeBasis(_v, this.up, _v2.copy(this.heading).negate());
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.mesh.position.copy(this.pos);

    const T = BOAT_TUNING;
    const ph = this.bobPhase + t * T.bobRate;
    const way = Math.min(1, Math.abs(this.speed) / T.maxSpeed);
    this.hull.position.y = Math.sin(ph) * T.bob;
    this.hull.rotation.z = Math.sin(ph * 0.83) * 0.035 * (1 - way * 0.6);
    // bow lifts as she gathers way, and pitches on the swell when she has none
    this.hull.rotation.x = Math.sin(ph * 1.31) * 0.025 - way * 0.05;
  }

  // where the rider's feet go: on the deck, on the local up
  seatPos(out) {
    return out.copy(this.up).multiplyScalar(this.seaR + BOAT_TUNING.seat);
  }
}

// ---------------------------------------------------------------------------
// mooring
//
// A moored boat is a water column with land within a couple of blocks — the
// waterline of a beach, not the middle of the ocean, so a boat is something
// you find by walking down to the shore.

function isShore(planet, dir, seaR, r) {
  tangentBasis(dir, _s1, _s2);
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2);
    _sv.copy(_s1).multiplyScalar(Math.cos(a)).addScaledVector(_s2, Math.sin(a));
    offsetDir(dir, _sv, 2.6, r, _so);
    if (waterDepth(planet, _so, seaR) <= 0) return true;
  }
  return false;
}

// Find a mooring within scanArc of `dir`. `budget` caps the probes spent, so
// a caller can bound the whole search rather than one call at a time; the
// spots used are returned through `out`. Returns the probes actually spent,
// or -1 if nothing was found.
function findMooring(planet, dir, seaR, rand, budget, out) {
  const T = BOAT_TUNING;
  const r = seaR;
  tangentBasis(dir, _t1, _t2);
  const tries = Math.min(T.probes, budget);
  for (let i = 0; i < tries; i++) {
    const a = rand() * 6.283;
    const dist = rand() * T.scanArc;
    _v.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a));
    offsetDir(dir, _v, dist, r, _spot);
    // Enough water to float AND to get under way. A hull moored in one block
    // of water is inside the shallow-drag band from the moment you board it,
    // so it never builds speed and reads as broken rather than as beached.
    if (waterDepth(planet, _spot, seaR) < T.moorDepth) continue;
    if (!isShore(planet, _spot, seaR, r)) continue;
    out.copy(_spot);
    return i + 1;
  }
  return -1;
}

// evenly spread unit directions with no polar clumping
function fibonacciDir(i, n, out) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * 2.39996323;
  return out.set(Math.cos(th) * rad, y, Math.sin(th) * rad).normalize();
}

// ---------------------------------------------------------------------------
// the fleet

let _fleet = null;

// Build the boats for a world and add them to `scene`. Returns a handle, or
// null on a world with no sea — a dry planet costs nothing at all.
//
// opts.near — optional direction (Vector3 or [x,y,z]) a couple of boats are
// moored close to, for a world where you already know where the player lands.
export function createBoats(scene, planet, seed = 1, opts = {}) {
  disposeBoats();
  const seaR = seaRadius(planet);
  if (!seaR || !planet) return null;

  const T = BOAT_TUNING;
  const rand = mulberry32((seed ^ 0xb0a7) | 0);
  const boats = [];
  const group = new THREE.Group();
  let budget = T.probeBudget;

  const moor = (dir) => {
    if (budget <= 0 || boats.length >= T.max) return false;
    const spent = findMooring(planet, dir, seaR, rand, budget, _v2);
    budget -= spent < 0 ? T.probes : spent;
    if (spent < 0) return false;
    const b = new Boat(planet, _v2, seaR, rand);
    group.add(b.mesh);
    boats.push(b);
    return true;
  };

  const toDir = (n) => new THREE.Vector3(
    Array.isArray(n) ? n[0] : n.x,
    Array.isArray(n) ? n[1] : n.y,
    Array.isArray(n) ? n[2] : n.z).normalize();

  const n = opts.near ?? planet.spawnDir ?? null;
  const near = n ? toDir(n) : null;
  if (near) for (let i = 0; i < T.nearby; i++) moor(near);

  // Boats where the PEOPLE are. A fleet spread evenly over an ocean is a
  // fleet nobody owns — the boats end up on empty coasts a thousand blocks
  // from anybody, which reads as flotsam. `harbours` is a list of directions
  // (main.js passes the shore villages on a world that has them), and each
  // gets its own moorings first, before whatever is left is spread about.
  for (const h of opts.harbours ?? []) {
    if (boats.length >= T.max || budget <= 0) break;
    const d = toDir(h);
    for (let i = 0; i < T.perHarbour; i++) moor(d);
  }

  // the rest spread over the globe: a golden-angle spiral, each candidate
  // walked to the nearest coast, and the whole search bounded by `budget`
  const spread = new THREE.Vector3();
  for (let i = 0; boats.length < T.max && budget > 0; i++) {
    if (i >= T.max * 3) break;      // the sea ran out; take what we have
    fibonacciDir(i, T.max * 3, spread);
    moor(spread);
  }

  scene.add(group);
  _fleet = {
    scene, planet, group, boats, seaR, rider: null,
    clock: 0, recycle: T.recycleEvery,
    // horizon cull, the same trick sky.js uses: one dot product per boat
    cullDot: Math.cos(Math.min(Math.PI, T.drawArc / Math.max(1, seaR))),
  };
  return _fleet;
}

export function disposeBoats() {
  const F = _fleet;
  if (!F) return;
  F.scene.remove(F.group);
  F.boats.length = 0;
  F.rider = null;
  _fleet = null;
}

export const boatFleet = () => _fleet;
export const boatCount = () => _fleet?.boats.length ?? 0;
export const ridingBoat = () => _fleet?.rider ?? null;

// ---------------------------------------------------------------------------
// boarding

// Board the nearest free boat within BOAT_TUNING.boardReach of the player's
// feet. Returns the boat, or null if there is none in reach.
export function tryBoard(player) {
  const F = _fleet;
  if (!F || F.rider || !player) return null;
  let best = null, bestD = BOAT_TUNING.boardReach;
  for (const b of F.boats) {
    const d = b.pos.distanceTo(player.pos);
    if (d < bestD) { best = b; bestD = d; }
  }
  if (!best) return null;

  F.rider = best;
  best.rider = player;
  // set off the way you were facing, so boarding never spins the world
  best.heading.copy(player.forward);
  best.projectHeading();
  best.speed = 0;
  player.vel.set(0, 0, 0);
  player.radialVel = 0;
  player.grounded = true;
  player.inWater = false;
  return best;
}

// Put the rider ashore. Looks for solid, unobstructed ground within a few
// blocks; failing that the player is left standing on the deck, which is
// still a legal place to be — they are never dropped into the sea or pushed
// inside a hill.
export function disembark(player) {
  const F = _fleet;
  const boat = F?.rider;
  if (!boat) return false;
  const p = player ?? boat.rider;
  F.rider = null;
  boat.rider = null;
  boat.speed = 0;
  if (!p) return true;

  const planet = F.planet;
  tangentBasis(boat.up, _t1, _t2);
  let placed = false;
  for (let i = 0; i < 12 && !placed; i++) {
    const a = (i / 12) * 6.283;
    const dist = 1.6 + (i % 3) * 0.7;
    _v.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a));
    offsetDir(boat.up, _v, dist, F.seaR, _probe);
    // dry land only, and no further above the water than a step
    const ground = planet.surfaceRadiusAtDir(_probe.x, _probe.y, _probe.z);
    if (ground <= F.seaR - 0.5 || ground > F.seaR + 2.5) continue;
    _try.copy(_probe).multiplyScalar(ground);
    if (p.bodyBlocked?.(_try, ground)) continue;
    p.pos.copy(_try);
    placed = true;
  }
  if (!placed) boat.seatPos(p.pos);      // no shore: stand up in the boat

  p.up.copy(p.pos).normalize();
  p.vel.set(0, 0, 0);
  p.radialVel = 0;
  p.grounded = placed;
  p.refreshBasis?.();
  p.syncCamera?.();
  return true;
}

// Board if you are not aboard, step ashore if you are. This is the one call a
// key binding wants.
export function toggleBoat(player) {
  return ridingBoat() ? (disembark(player), null) : tryBoard(player);
}

// ---------------------------------------------------------------------------
// per frame

// Sit the avatar down. poseAvatar ASSIGNS every joint it touches, so running
// it first and overriding afterwards cannot accumulate — the same layering
// entities.js uses for its hurt lurch.
function poseSeated(player, t) {
  const parts = player.parts;
  if (!parts) return;
  poseAvatar(parts, 0, 0, t, player.swingK ?? 0, 0);
  for (const side of ['L', 'R']) {
    const leg = parts.legs[side];
    leg.hip.rotation.x = 1.35;      // thighs forward along the thwart
    leg.knee.rotation.x = -1.45;    // shins down to the deck
    leg.ankle.rotation.x = 0.15;
    const arm = parts.arms[side];
    arm.shoulder.rotation.x = 0.45;
    arm.elbow.rotation.x = 0.55;
  }
  parts.rig.position.y = -0.34;     // hips drop to the seat
  parts.rig.rotation.x = -0.06;
}

// Drive the fleet for one frame.
//
// While a boat is ridden this REPLACES player.update(dt): it steers from the
// player's own key set, writes their position and up, and then calls their own
// refreshBasis / syncCamera so look and the camera views are untouched.
// Returns the ridden boat, or null.
export function updateBoats(dt, player = null) {
  const F = _fleet;
  if (!F) return null;
  F.clock += dt;
  const T = BOAT_TUNING;
  const boat = F.rider;

  if (boat && player) {
    boat.drive(Math.min(dt, 0.05), player.keys ?? new Set());
    boat.syncMesh(F.clock);
    boat.seatPos(player.pos);
    player.up.copy(boat.up);
    // the body faces where you look, not where the hull points: the forward
    // vector is the player's own and is only re-projected onto the new up
    player.refreshBasis?.();
    player.grounded = true;
    player.inWater = false;
    player.vel.copy(boat.heading).multiplyScalar(boat.speed);
    poseSeated(player, F.clock);
    player.syncCamera?.();
  }

  // Everything below is bookkeeping for the boats you are NOT in: a bob, a
  // horizon cull, and at most one re-mooring every recycleEvery seconds. It
  // is a handful of dot products, and it is the whole per-frame cost of the
  // rest of the fleet.
  // its own vector, not the shared _v: keepBoatsNear passes it straight into
  // findMooring, which claims _v for itself
  const up = player?.pos ? _up.copy(player.pos).normalize() : null;
  for (const b of F.boats) {
    if (b === boat) continue;
    if (up) {
      const vis = b.up.dot(up) > F.cullDot;
      b.mesh.visible = vis;
      if (!vis) continue;
    }
    b.syncMesh(F.clock);
  }

  if (up) {
    F.recycle -= dt;
    if (F.recycle <= 0) {
      F.recycle = T.recycleEvery;
      keepBoatsNear(F, up);
    }
  }
  return boat;
}

// Re-moor one distant boat near the player if there are none to hand. The
// pool never grows: a boat you left behind on the far side of the planet is
// the one that comes back, which is what bounds the whole system.
function keepBoatsNear(F, up) {
  const T = BOAT_TUNING;
  let near = 0, far = null, farD = T.recycleArc;
  for (const b of F.boats) {
    if (b === F.rider) { near++; continue; }
    const d = arcBetween(b.up, up, F.seaR);
    if (d < T.nearArc) near++;
    else if (d > farD) { far = b; farD = d; }
  }
  if (near >= T.nearby || !far) return;
  // only useful if there is sea nearby at all; the probe budget is one
  // mooring search, which is the pacing
  if (findMooring(F.planet, up, F.seaR, Math.random, T.probes, _v2) < 0) return;
  far.moorTo(_v2);
}
