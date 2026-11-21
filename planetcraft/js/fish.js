// fish.js — schools of fish in the sea.
//
// Fish are entries in main.js's `entities` array, not a parallel system. That
// array is what meleeTarget() walks, so joining it is what makes a fish
// hittable, killable and lootable without touching the combat code at all —
// an entry only has to offer { kind, mesh, dead, damage(), drops }.
//
// Population is bounded and LOCAL. This project has been bitten hard by
// entity counts before: 1268 entities froze a radius-800 world outright, and
// villages and animals are hard-capped because of it. A planet's ocean has
// millions of cells, so fish can never be placed per-world — they are spawned
// in a shell around the player and recycled when he leaves, so the cost is
// the same on a radius-30 pond and a radius-800 ocean.

import * as THREE from 'three';
import { seaRadius, waterDepth } from './boat.js';
import { classMaterial, realBodiesOn } from './realbody.js';

export const FISH_TUNING = {
  max: 22,             // hard cap, whatever the size of the world
  schools: 5,          // clusters the fish are dealt into
  schoolSpread: 3.2,   // blocks a fish may stray from its school's centre
  spawnArc: 34,        // blocks from the player a school may be seeded in
  despawnArc: 70,      // beyond this a fish is recycled somewhere ahead
  minDepth: 1.2,       // water shallower than this holds no fish
  swim: 1.5,           // blocks/s
  turn: 1.1,           // rad/s of wander
  subSurface: 0.55,    // blocks below the waterline the school swims at
  bob: 0.18,           // vertical sway, in blocks
  respawnEvery: 0.6,   // seconds between recycle attempts: never in bulk
  probes: 14,          // spots tried when looking for water to swim in
  health: 2,
};

// one scratch vector per purpose: a helper that clobbers its caller's basis
// is exactly the bug this file's discipline exists to prevent
const _v = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _spot = new THREE.Vector3();

let _school = null;      // the live state, or null when there is no water

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// two unit tangents perpendicular to `up`, for moving across the surface
function tangentBasis(up, t1, t2) {
  t1.set(0, 1, 0);
  if (Math.abs(t1.dot(up)) > 0.9) t1.set(1, 0, 0);
  t1.addScaledVector(up, -t1.dot(up)).normalize();
  t2.copy(up).cross(t1).normalize();
}

// step `arc` blocks from `dir` along tangent `t`, staying on the sphere
function offsetDir(up, t, arc, r, out) {
  const a = arc / Math.max(1e-6, r);
  return out.copy(up).multiplyScalar(Math.cos(a))
    .addScaledVector(t, Math.sin(a)).normalize();
}

// --- the body ---------------------------------------------------------------
//
// Blocky, like everything else here: a wedge body and a tail fin. Built once
// and shared — a fish is 20 triangles and there are at most 22 of them, so
// the cost is in the draw calls, not the geometry.

function fishGeometry() {
  const g = new THREE.BufferGeometry();
  const P = [], I = [];
  const box = (x0, x1, y0, y1, z0, z1) => {
    const b = P.length / 3;
    for (const [x, y, z] of [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) P.push(x, y, z);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 5, b + 4, b + 7,
      b + 5, b + 7, b + 6, b + 4, b + 0, b + 3, b + 4, b + 3, b + 7,
      b + 1, b + 5, b + 6, b + 1, b + 6, b + 2, b + 3, b + 2, b + 6,
      b + 3, b + 6, b + 7, b + 4, b + 5, b + 1, b + 4, b + 1, b + 0);
  };
  box(-0.30, 0.22, -0.11, 0.11, -0.09, 0.09);   // body
  box(0.22, 0.40, -0.02, 0.02, -0.02, 0.02);    // snout
  box(-0.46, -0.30, -0.17, 0.17, -0.02, 0.02);  // tail fin
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

let _geo = null, _mat = null, _matReal = null;
// under the Realistic style a fish is scaled, with the sheen fish have
const fishLook = (real) => (real
  ? (_matReal ??= classMaterial('scale', { color: 0xc98a4b, vertexColors: false, faceShade: false }))
  : _mat);
function assets() {
  if (!_geo) _geo = fishGeometry();
  if (!_mat) {
    _mat = new THREE.MeshLambertMaterial({ color: 0xc98a4b });
  }
  return { geo: _geo, mat: _mat };
}

// --- one fish ---------------------------------------------------------------

class Fish {
  constructor(planet, seaR, rand) {
    this.planet = planet;
    this.seaR = seaR;
    this.rand = rand;
    this.kind = 'fish';
    this.dead = false;
    this.health = FISH_TUNING.health;
    this.drops = [{ id: 'fish_raw', count: 1 }];
    this.up = new THREE.Vector3(0, 1, 0);
    this.heading = new THREE.Vector3(1, 0, 0);
    this.phase = rand() * 6.283;
    const { geo, mat } = assets();
    this.mesh = new THREE.Mesh(geo, realBodiesOn() ? fishLook(true) : mat);
    this.mesh.userData.realLook = fishLook;
    this.mesh.visible = false;
  }

  // Put this fish in the water at `dir`. Returns false if there is none there,
  // so the caller can try somewhere else rather than leaving a fish in a
  // hillside.
  placeAt(dir) {
    const d = waterDepth(this.planet, dir, this.seaR);
    if (d < FISH_TUNING.minDepth) return false;
    this.up.copy(dir).normalize();
    tangentBasis(this.up, _t1, _t2);
    const a = this.rand() * 6.283;
    this.heading.copy(_t1).multiplyScalar(Math.cos(a))
      .addScaledVector(_t2, Math.sin(a));
    this.mesh.visible = true;
    this.sync(0);
    return true;
  }

  // The waterline here, less a little: a fish that swims at exactly the
  // surface pokes through it from every angle except straight down.
  swimRadius() {
    return this.seaR - FISH_TUNING.subSurface;
  }

  update(dt, t, centre) {
    const T = FISH_TUNING;
    // wander, plus a pull back towards the school's centre — cohesion alone
    // makes a knot, wander alone scatters them across the ocean
    tangentBasis(this.up, _t1, _t2);
    let turn = (this.rand() - 0.5) * T.turn * dt * 2;
    if (centre) {
      _v.copy(centre).addScaledVector(this.up, -centre.dot(this.up));
      if (_v.lengthSq() > 1e-9) {
        _v.normalize();
        // signed angle from heading to the way home, about the local up
        const cross = _fwd.copy(this.heading).cross(_v).dot(this.up);
        const away = this.up.angleTo(centre) * this.seaR;
        if (away > T.schoolSpread) turn += Math.sign(cross) * T.turn * dt * 1.6;
      }
    }
    this.heading.applyAxisAngle(this.up, turn);
    this.heading.addScaledVector(this.up, -this.heading.dot(this.up)).normalize();

    // step forward along the surface, and refuse to leave the water
    const arc = T.swim * dt;
    offsetDir(this.up, this.heading, arc, this.seaR, _spot);
    if (waterDepth(this.planet, _spot, this.seaR) >= T.minDepth) {
      this.up.copy(_spot);
    } else {
      // shore ahead: turn away rather than stopping dead against it
      this.heading.applyAxisAngle(this.up, 1.9);
      this.heading.addScaledVector(this.up, -this.heading.dot(this.up)).normalize();
    }
    this.sync(t);
  }

  sync(t) {
    const bob = Math.sin(t * 1.7 + this.phase) * FISH_TUNING.bob;
    this.mesh.position.copy(this.up).multiplyScalar(this.swimRadius() + bob);
    // face along the heading, with the local up as up — orient by world axes
    // and every fish on the far side of the planet swims on its side
    _fwd.copy(this.heading);
    _v.copy(this.up).cross(_fwd).normalize();
    _m.makeBasis(_fwd, this.up, _v);
    this.mesh.quaternion.setFromRotationMatrix(_m);
    // a tail-flick: yaw a little, in time with the bob
    this.mesh.rotateY(Math.sin(t * 6 + this.phase) * 0.22);
  }

  // The contract main.js's melee already expects: return true if this killed
  // it. entities.js's animals do the same, which is why one code path covers
  // both.
  damage(n) {
    this.health -= n;
    if (this.health > 0) return false;
    this.dead = true;
    this.mesh.visible = false;
    return true;
  }
}

// --- the school -------------------------------------------------------------

export function createFish(scene, planet, seed = 1) {
  disposeFish();
  const seaR = seaRadius(planet);
  if (!seaR || !planet) return null;      // a world with no sea has no fish

  const rand = mulberry32((seed ^ 0xf15be) | 0);
  const group = new THREE.Group();
  group.name = 'fish';
  scene?.add?.(group);

  const fish = [];
  for (let i = 0; i < FISH_TUNING.max; i++) {
    const f = new Fish(planet, seaR, rand);
    group.add(f.mesh);
    fish.push(f);
  }
  _school = { planet, seaR, rand, group, fish, clock: 0, since: 0, seeded: false };
  return _school;
}

export function disposeFish() {
  if (!_school) return;
  _school.group.parent?.remove(_school.group);
  _school = null;
}

export const fishCount = () => _school
  ? _school.fish.filter((f) => !f.dead && f.mesh.visible).length : 0;
export const fishSchool = () => _school;

// Every live fish, for main.js to splice into its entities array. Dead ones
// are left out: an entity that is dead but still listed is what makes a
// corpse keep taking hits.
export const liveFish = () => _school
  ? _school.fish.filter((f) => !f.dead && f.mesh.visible) : [];

// Find water within `arc` blocks of `dir`, or return false.
function findWater(school, dir, arc, out) {
  const { planet, seaR, rand } = school;
  tangentBasis(dir, _t1, _t2);
  for (let i = 0; i < FISH_TUNING.probes; i++) {
    const a = rand() * 6.283;
    const dist = rand() * arc;
    _v.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a));
    offsetDir(dir, _v, dist, seaR, out);
    if (waterDepth(planet, out, seaR) >= FISH_TUNING.minDepth) return true;
  }
  return false;
}

export function updateFish(dt, player = null) {
  const S = _school;
  if (!S || !player) return;
  const T = FISH_TUNING;
  S.clock += dt;
  S.since += dt;

  _up.copy(player.pos).normalize();

  // Seed the school around the player the first time, and thereafter recycle
  // at most one fish per respawnEvery — a bulk respawn is a frame spike, and
  // a school that teleports in front of you is worse than no school at all.
  const perSchool = Math.ceil(T.max / T.schools);
  if (!S.seeded) {
    for (let i = 0; i < S.fish.length; i++) {
      if (findWater(S, _up, T.spawnArc, _spot)) S.fish[i].placeAt(_spot);
    }
    S.seeded = true;
  } else if (S.since >= T.respawnEvery) {
    S.since = 0;
    const gone = S.fish.find((f) => f.dead
      || !f.mesh.visible
      || f.up.angleTo(_up) * S.seaR > T.despawnArc);
    if (gone && findWater(S, _up, T.spawnArc, _spot)) {
      gone.dead = false;
      gone.health = T.health;
      gone.placeAt(_spot);
    }
  }

  // school centres: fish i belongs to school (i / perSchool), and its centre
  // is simply the first live member — cheap, and stable enough to shoal
  for (let i = 0; i < S.fish.length; i++) {
    const f = S.fish[i];
    if (f.dead || !f.mesh.visible) continue;
    const lead = S.fish[Math.floor(i / perSchool) * perSchool];
    f.update(dt, S.clock, lead !== f && !lead.dead ? lead.up : null);
  }
}

export default {
  FISH_TUNING, createFish, disposeFish, updateFish, liveFish, fishCount,
};
