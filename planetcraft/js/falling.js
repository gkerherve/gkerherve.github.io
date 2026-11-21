// falling.js — the blocks on their way down.
//
// A tree used to leave the world in a single frame. Every cell of it became
// air on the same tick and the whole of it arrived as one pile of stacks at
// the foot of the stump, which is correct about the blocks and wrong about
// the picture: nothing FELL. What a player watching a tree come down wants to
// see is the tree coming down — the trunk letting go, the crown following it,
// and the litter landing where the branches were.
//
// So every cell a fell takes gets a cube of its own, standing exactly where
// the block stood, which then drops to whatever is under it and bursts.
//
// IT IS A PICTURE AND NOTHING ELSE. The cell is already air, the item it gives
// has already been counted, and nobody else in the world is told: this never
// touches setBlock, never reaches the diff and never goes over the wire. A
// machine with the effect off — or one that misses the whole thing because it
// was looking the other way — plays the identical game. That is the only terms
// on which a purely visual system may exist in this project (see the rule at
// the foot of CLAUDE.md).
//
// The world is a sphere, so "down" is a different direction at every cell.
// Each cube carries the local up it was born with and falls along it; nothing
// in here may use world -Y, or a tree felled on the far side of the planet
// falls sideways.

import * as THREE from 'three';
import * as CS from './cubesphere.js';
import { isFlat, flattenObject } from './flatten.js';
import { realBodiesOn } from './realbody.js';
import { terrainMaterial } from './realitem.js';

export const FALL = {
  // How many cubes may be in the air at once. A crown is three hundred cells
  // and three hundred meshes on one swing is a stutter you can feel, so the
  // caller SAMPLES the tree down to this rather than showing the first
  // hundred and eighty of it — see fallSample in main.js. A tree that comes
  // down half-shown still reads as a tree coming down; a tree that drops a
  // solid block of its lower half does not.
  cap: 190,
  // Very slightly under a cell, so two cubes side by side read as two things
  // rather than as one surface.
  size: 0.94,
  // Blocks a second per second. Snappier than a body falls: this is debris,
  // and debris that hangs in the air reads as a bug.
  gravity: 21,
  // How far a cube drifts off the column it started in. Small on purpose —
  // "where they were built" is the whole point, and a crown that explodes
  // outward is a bomb going off in a tree.
  drift: 0.9,
  spin: 2.6,
  // A backstop. Nothing should live this long — every cube has ground under
  // it somewhere — but a cell over a shaft with no floor found would
  // otherwise fall for ever.
  life: 7,
};

let group = null;          // the planetGroup, so travel hides these with it
let material = null;
let atlasRef = null;
const geo = new Map();     // tile -> BoxGeometry with that tile's UVs on it
const live = [];
let hooks = { onLand: null, heightAt: null, tileUV: null };

const _up = new THREE.Vector3();
const _side = new THREE.Vector3();
const _world = new THREE.Vector3();
const _spin = new THREE.Quaternion();
const _base = new THREE.Quaternion();
const _YUP = new THREE.Vector3(0, 1, 0);

// Height measured the way the world measures it: a radius on a planet, an
// altitude on the drafting table. Everything below compares against whatever
// this answers and never against a component of the position.
const heightOf = (p) => (CS.FLAT ? p.y : p.length());

// Hand over the atlas and the two things only main.js knows: where the ground
// under a cell is, and what to do when a cube gets there. Called once, and
// again on a world change — the geometry cache is keyed by tile and survives.
export function createFalling(parent, opts = {}) {
  group = parent ?? null;
  hooks = {
    onLand: opts.onLand ?? null,
    // (f,u,v,h) -> the height a block dropped from this cell comes to rest at,
    // or null for "nothing under it". main.js owns the planet; this file only
    // owns the arc.
    restAt: opts.restAt ?? null,
    tileUV: opts.tileUV ?? null,
  };
  if (!material && opts.atlas) {
    material = new THREE.MeshBasicMaterial({ map: opts.atlas, alphaTest: 0.5 });
  }
  atlasRef = opts.atlas ?? atlasRef;
  return true;
}

// One cube's worth of geometry, with the tile's own corner of the atlas baked
// into its UVs. Cached by tile: a felled oak is two of these however many
// hundred cells it had.
function cubeGeo(tile) {
  let g = geo.get(tile);
  if (g) return g;
  g = new THREE.BoxGeometry(FALL.size, FALL.size, FALL.size);
  const uv = g.getAttribute('uv');
  const [u0, v0] = hooks.tileUV(tile, 0, 0);
  const [u1, v1] = hooks.tileUV(tile, 1, 1);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  geo.set(tile, g);
  return g;
}

// Let one cell go. `delay` staggers it — a tree that comes apart all on one
// frame is a tree that was deleted, and a tenth of a second between the trunk
// and the crown is the whole difference between the two.
//
// Returns false when it could not be shown (no atlas yet, the air is full,
// nothing under the cell), and the caller loses nothing by it: the block is
// already out of the world and its drop is already counted.
export function dropBlock(f, u, v, h, tile, delay = 0) {
  if (!group || !material || !hooks.tileUV) return false;
  if (live.length >= FALL.cap) return false;
  const rest = hooks.restAt?.(f, u, v, h);
  if (rest == null) return false;
  const p = CS.cellCenterWorld(f, u, v, h);
  const pos = new THREE.Vector3(p[0], p[1], p[2]);
  const up = new THREE.Vector3();
  if (CS.FLAT) up.set(0, 1, 0); else up.copy(pos).normalize();
  // Already at or under the ground — a cell with a solid floor immediately
  // below it, which is most of a trunk's foot. There is nothing to watch, so
  // it lands on the spot rather than costing a mesh for two frames.
  if (heightOf(pos) <= rest + 0.02) {
    hooks.onLand?.(pos, up, tile);
    return false;
  }
  // A little sideways, away from nothing in particular: the crown of a felled
  // tree spreads as it comes down, and cubes that fall in perfect columns read
  // as a lift going down rather than as a tree coming apart. Rolled off the
  // CELL, not off Math.random, so two people watching the same tree see the
  // same litter — it costs nothing to be consistent and it is one less thing
  // that can look different on two screens.
  const r = ((Math.imul(f * 8191 + u, 0x9e3779b1) ^ Math.imul(v * 40503 + h, 0x85ebca6b))
    >>> 8) / 0x1000000;
  const ang = r * Math.PI * 2;
  _side.set(1, 0, 0);
  if (Math.abs(up.x) > 0.9) _side.set(0, 1, 0);
  const ex = new THREE.Vector3().crossVectors(up, _side).normalize();
  const ez = new THREE.Vector3().crossVectors(up, ex).normalize();
  const vel = new THREE.Vector3()
    .addScaledVector(ex, Math.cos(ang) * FALL.drift * r)
    .addScaledVector(ez, Math.sin(ang) * FALL.drift * r);
  // under the Realistic style a falling block wears the photograph the block
  // it was wore, in the same light
  const look = (real) => (real && atlasRef ? terrainMaterial(atlasRef) : material);
  const mesh = new THREE.Mesh(cubeGeo(tile), look(realBodiesOn()));
  mesh.userData.realLook = look;
  group.add(mesh);
  live.push({
    tile, mesh, pos, up, vel, rest,
    // A tumble about a horizontal axis: a block that spins about its own up
    // looks like a top and a block that does not spin at all looks like a
    // lift. Half of them turn the other way.
    axis: ex.clone().applyAxisAngle(up, ang),
    spin: 0, rate: (r < 0.5 ? -1 : 1) * FALL.spin * (0.5 + r),
    delay, age: 0,
  });
  return true;
}

// The arc, and the landing. Called from BOTH loops — the render one and
// window.tick's — or it works in the game and does nothing in every check.
export function updateFalling(dt, tint = null) {
  if (!live.length) return;
  if (tint && material) material.color.copy(tint);
  for (let i = live.length - 1; i >= 0; i--) {
    const b = live[i];
    if (b.delay > 0) {
      b.delay -= dt;
      // held at the cell it came out of, and not drawn until it lets go: a
      // cube standing still in the middle of a tree is a block that has not
      // been broken yet
      b.mesh.visible = false;
      continue;
    }
    b.mesh.visible = true;
    b.age += dt;
    b.vel.addScaledVector(b.up, -FALL.gravity * dt);
    b.pos.addScaledVector(b.vel, dt);
    b.spin += b.rate * dt;
    if (heightOf(b.pos) <= b.rest || b.age > FALL.life) {
      // put it down exactly on the floor before the burst, so the dust comes
      // off the ground and not out of the air above it
      if (CS.FLAT) b.pos.y = b.rest; else b.pos.setLength(b.rest);
      hooks.onLand?.(b.pos, b.up, b.tile);
      group.remove(b.mesh);
      live.splice(i, 1);
    }
  }
}

// Where they are drawn, on the same terms every other loose thing is — see
// placeLoose in main.js. Separate from the physics because the flat-horizon
// projection is aimed once a frame and everything is bent through it after.
export function placeFalling(flat = isFlat()) {
  for (const b of live) {
    if (!b.mesh.visible) continue;
    _base.setFromUnitVectors(_YUP, _up.copy(b.up));
    _spin.setFromAxisAngle(b.axis, b.spin);
    b.mesh.quaternion.copy(_spin).multiply(_base);
    b.mesh.position.copy(b.pos);
    if (flat) flattenObject(b.mesh, _world.copy(b.pos));
  }
}

// Everything in the air, gone. A world change, a flight, a teardown: a cube
// that outlived the planet it was falling on is the worst kind of leak.
export function clearFalling() {
  for (const b of live) group?.remove(b.mesh);
  live.length = 0;
}

export const fallingCount = () => live.length;
