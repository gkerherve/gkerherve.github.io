// wagon.js — a cart that runs on rails.
//
// The second vehicle in this world, and it is deliberately the boat's own
// shape of thing: a body you get into, a heading, a speed, and a rule about
// where it may go. A boat's rule is "water deep enough to float"; a wagon's
// is "there is a rail under me, and the next one is that way".
//
// --- how a wagon knows where the track goes ----------------------------------
//
// It does not remember a route and nothing stores one. At each cell it asks
// the world what is under it: a rail block carries its own axis (see railId in
// cubesphere.js), so the wagon reads the axis, keeps whichever of the two
// directions along it is nearer to the way it is already going, and looks one
// cell ahead — level, then one up, then one down, because a line has to be
// able to climb. If there is no rail there, it stops. That is the whole
// navigation, it costs three block reads a cell, and it means a junction is
// simply where two lines cross: the wagon holds its own bearing through it.
//
// --- what is stored ----------------------------------------------------------
//
// The rails are ordinary blocks, so a line somebody laid is in the edit diff
// like any wall. A wagon standing on it is a THING, and things in this world
// are not stored: it is placed from an item, and if you leave the world it is
// gone — the same terms the boats are on.

import * as THREE from 'three';
import { BLOCK, R0 } from './cubesphere.js';
import * as CS from './cubesphere.js';
import { voxelGeometry, voxelLook } from './boat.js';
import { realBodiesOn } from './realbody.js';
import { poseAvatar } from './player.js';

export const WAGON_TUNING = {
  max: 8,              // wagons in a world at once
  boardReach: 3.2,     // blocks from your feet to the cart to get in
  accel: 7.0,          // blocks/s^2 under power
  drag: 0.55,          // 1/s of rolling resistance: a wagon coasts
  maxSpeed: 12,        // blocks/s — faster than a horse, on rails only
  reverse: 0.6,        // fraction of the power available backwards
  seat: 0.42,          // the rider's feet above the rail
  brake: 5.0,          // 1/s when nothing is pressed and the line ends
};

// Where the cart's wheels ride: the top of the irons, which cubemesher draws
// 0.11 of a cell above the rail cell's floor. The cart used to be seated at
// R0 + h + 1 — the TOP of the rail's cell, which is where you would stand on
// a solid block, and the rail is not one: it is a thin fitting at the bottom
// of its cell, so the cart hovered nine tenths of a block above its own
// track. This is the number that puts the wheels ON the irons, and it is the
// bug the player reported as "the wagon does not mount onto the track".
const RAIL_TOP = 0.11;

// A tipper body: an open box of planks on an iron underframe, with four
// wheels. Colours rather than tiles, exactly as the boat is drawn — this is a
// voxel model, not a block.
const OAK = [0.55, 0.38, 0.20];
const IRON = [0.62, 0.64, 0.68];
const DARK = [0.34, 0.23, 0.12];
const BODY = [
  { x: 0, y: 0.30, z: 0, w: 1.30, h: 0.10, d: 0.90, c: OAK },      // the floor
  { x: 0, y: 0.55, z: 0.45, w: 1.30, h: 0.42, d: 0.10, c: OAK },   // sides
  { x: 0, y: 0.55, z: -0.45, w: 1.30, h: 0.42, d: 0.10, c: OAK },
  { x: 0.65, y: 0.55, z: 0, w: 0.10, h: 0.42, d: 0.90, c: DARK },  // ends
  { x: -0.65, y: 0.55, z: 0, w: 0.10, h: 0.42, d: 0.90, c: DARK },
  { x: 0, y: 0.22, z: 0, w: 1.36, h: 0.10, d: 0.60, c: IRON },     // the frame
  { x: 0.42, y: 0.12, z: 0.42, w: 0.26, h: 0.26, d: 0.10, c: IRON },  // wheels
  { x: 0.42, y: 0.12, z: -0.42, w: 0.26, h: 0.26, d: 0.10, c: IRON },
  { x: -0.42, y: 0.12, z: 0.42, w: 0.26, h: 0.26, d: 0.10, c: IRON },
  { x: -0.42, y: 0.12, z: -0.42, w: 0.26, h: 0.26, d: 0.10, c: IRON },
];

let _geo = null;
let _mat = null;
function wagonMaterial() {
  if (!_geo) {
    _geo = voxelGeometry(BODY);
    _mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  }
  return { geo: _geo, mat: _mat };
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
// scratch for the bend: the two arm tangents, the cell centre, and the way
// there — kept apart from _t1/_t2, which syncMesh owns
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _cc = new THREE.Vector3();
const _cd = new THREE.Vector3();

function tangentBasis(up, t1, t2) {
  t1.set(0, 1, 0);
  if (Math.abs(up.dot(t1)) > 0.9) t1.set(1, 0, 0);
  t2.copy(up).cross(t1).normalize();
  t1.copy(t2).cross(up).normalize();
}

// Where a cell's centre is, and which cell a point is over. Both are the
// cubesphere's own arithmetic; a wagon only ever needs them for the cell it
// is standing on and the one in front of it.
function cellUnder(planet, pos) {
  const c = CS.cellFromDir(pos.x, pos.y, pos.z);
  // The cart rides at R0 + h + RAIL_TOP, so the cell it is IN is the floor of
  // its height over R0 — not a round, which with the low seat answered the
  // cell below and made every climb invisible.
  return { f: c[0], u: CS.cellIdx(c[1]), v: CS.cellIdx(c[2]),
    h: Math.floor(pos.length() - R0 + 1e-4) };
}

// The rail under a point, within a step up or down, or null. `h` is the cell
// the rail block itself is in. A bend answers with its two arms instead of an
// axis — see drive for what a wagon does with them.
function railAt(planet, f, u, v, h) {
  for (const dh of [0, -1, 1]) {
    const b = planet.get(f, u, v, h + dh);
    if (CS.isRail(b)) return { f, u, v, h: h + dh, axis: CS.railAxis(b) };
    if (CS.isRailTurn?.(b)) {
      const [su, sv] = CS.railTurnArms(b);
      return { f, u, v, h: h + dh, turn: true, su, sv };
    }
  }
  return null;
}

// The tangent one cell out from a rail's centre along (du, dv), projected
// onto the ground plane. Every direction a wagon ever needs is one of these.
const _ra = new THREE.Vector3();
function armTangent(rail, du, dv, up, out) {
  const a = CS.dirFromCell(rail.f, rail.u + 0.5 + du, rail.v + 0.5 + dv);
  _ra.set(a[0], a[1], a[2]);
  out.copy(_ra).addScaledVector(up, -_ra.dot(up));
  if (out.lengthSq() < 1e-9) out.set(1, 0, 0);
  return out.normalize();
}

// The direction a rail's line runs in, as a unit tangent at that cell. Which
// END of it a wagon is going to is the wagon's business — see drive. On a
// bend this answers the u arm, which is only ever used to point a cart that
// was PLACED on one; a cart that arrives picks its arm in drive.
function railTangent(rail, up, out) {
  if (rail.turn) return armTangent(rail, rail.su, 0, up, out);
  return armTangent(rail, rail.axis ? 0 : 1, rail.axis ? 1 : 0, up, out);
}

export class Wagon {
  constructor(planet, rail) {
    this.planet = planet;
    this.rail = rail;
    const c = CS.dirFromCell(rail.f, rail.u + 0.5, rail.v + 0.5);
    this.up = new THREE.Vector3(c[0], c[1], c[2]).normalize();
    this.pos = this.up.clone().multiplyScalar(R0 + rail.h + RAIL_TOP);
    this.speed = 0;
    this.rider = null;
    // The bearing starts along the rail it was set on: a wagon put down on a
    // line is already on it, pointing the way the line runs.
    this.heading = new THREE.Vector3();
    railTangent(rail, this.up, this.heading);
    const { geo, mat } = wagonMaterial();
    const look = voxelLook(mat);
    this.mesh = new THREE.Mesh(geo, look(realBodiesOn()));
    this.mesh.userData.realLook = look;
    this.syncMesh();
  }

  // Put the model where the cart is, standing on the rail and pointing along
  // it. Same basis every vehicle in this game uses: up is out of the planet,
  // forward is the heading, and the third axis falls out of the two.
  syncMesh() {
    // The basis must be RIGHT-handed: x is the heading, y is up, so z has to
    // be heading x up — it was up x heading, which is the same three axes
    // mirrored, and a reflection is not a rotation: setFromRotationMatrix
    // quietly made something else of it and the cart drew tipped on its nose
    // beside the track instead of standing on it.
    _t1.copy(this.heading);
    _t2.copy(_t1).cross(this.up).normalize();
    _m.makeBasis(_t1, this.up, _t2);
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.mesh.position.copy(this.pos);
  }

  // Where the rider's feet go.
  seatPos(out) {
    return out.copy(this.pos).addScaledVector(this.up, WAGON_TUNING.seat);
  }

  /**
   * One step along the line.
   *
   * The throttle is W and S, exactly as a boat's is, and there is no steering
   * at all — the track does that. What this has to get right is the moment the
   * cart leaves one cell for the next: it re-reads the rail under it, snaps
   * its heading to that rail's axis (keeping the direction it was already
   * going), and stops dead if the line has run out.
   */
  drive(dt, keys) {
    const T = WAGON_TUNING;
    const fwd = keys.has('KeyW') || keys.has('ArrowUp');
    const back = keys.has('KeyS') || keys.has('ArrowDown');
    if (fwd) this.speed += T.accel * dt;
    else if (back) this.speed -= T.accel * T.reverse * dt;
    this.speed -= this.speed * T.drag * dt;
    this.speed = Math.max(-T.maxSpeed * T.reverse,
      Math.min(T.maxSpeed, this.speed));
    if (Math.abs(this.speed) < 0.02) { this.speed = 0; return; }

    // Move along the tangent, and THEN find out what is under the new spot.
    //
    // The position that comes out of this is kept. An earlier version snapped
    // the cart to the centre of whatever cell it was over, which is a wagon
    // that can never leave the cell it started in: it moved four tenths of a
    // block, was still over the same rail, and was put back where it began —
    // full throttle, top speed, and stationary for ever.
    _v.copy(this.pos).addScaledVector(this.heading, this.speed * dt);
    const cell = cellUnder(this.planet, _v);
    const rail = railAt(this.planet, cell.f, cell.u, cell.v, cell.h);
    if (!rail) {
      // THE END OF THE LINE. A wagon that ran off the rails and kept going
      // would be a wagon you could drive anywhere, which is a horse.
      this.speed *= Math.max(0, 1 - T.brake * dt);
      if (Math.abs(this.speed) < 0.4) this.speed = 0;
      return;
    }
    this.rail = rail;
    // Keep where the step put it and re-seat it at the height of the rail it
    // is now over, so a line that climbs takes the cart up with it.
    this.pos.copy(_v).normalize().multiplyScalar(R0 + rail.h + RAIL_TOP);
    this.up.copy(this.pos).normalize();
    if (rail.turn) {
      // A BEND. Two arms; the one the cart came in along is its entry, so it
      // leaves along the other. It holds its course to the middle of the
      // cell, then takes the exit arm — a sharp little elbow, which is
      // exactly the corner the irons draw.
      armTangent(rail, rail.su, 0, this.up, _e1);
      armTangent(rail, 0, rail.sv, this.up, _e2);
      const exit = _e1.dot(this.heading) < _e2.dot(this.heading) ? _e2 : _e1;
      const c = CS.dirFromCell(rail.f, rail.u + 0.5, rail.v + 0.5);
      _cc.set(c[0], c[1], c[2]).normalize()
        .multiplyScalar(R0 + rail.h + RAIL_TOP);
      _cd.copy(_cc).sub(this.pos);
      _cd.addScaledVector(this.up, -_cd.dot(this.up));
      if (_cd.dot(this.heading) <= 0.04) this.heading.copy(exit);
    } else {
      // ...and point along the track, keeping the way we were already going:
      // a rail says which LINE it is, never which end of it you are headed
      // for.
      railTangent(rail, this.up, _t1);
      if (_t1.dot(this.heading) < 0) _t1.negate();
      this.heading.copy(_t1);
    }
    this.syncMesh();
  }
}

// --- the fleet ---------------------------------------------------------------

let _wagons = [];
let _rider = null;
let _scene = null;

export function wagons() { return _wagons; }
export function ridingWagon() { return _rider; }

export function disposeWagons() {
  for (const w of _wagons) _scene?.remove(w.mesh);
  _wagons = [];
  _rider = null;
}

/** Put a wagon on the rail at this cell. Returns it, or null. */
export function placeWagon(scene, planet, f, u, v, h) {
  const rail = railAt(planet, f, u, v, h);
  if (!rail) return null;
  if (_wagons.length >= WAGON_TUNING.max) {
    const old = _wagons.shift();
    if (old === _rider) _rider = null;
    scene.remove(old.mesh);
  }
  _scene = scene;
  const w = new Wagon(planet, rail);
  scene.add(w.mesh);
  _wagons.push(w);
  return w;
}

/** Get in the nearest one, or out of the one you are in. */
export function toggleWagon(player) {
  if (_rider) {
    const w = _rider;
    _rider = null;
    w.rider = null;
    w.speed = 0;
    // step off to the side, onto whatever is there
    tangentBasis(w.up, _t1, _t2);
    player.pos.copy(w.pos).addScaledVector(_t2, 1.4);
    const g = w.planet.surfaceRadiusAtDir(
      player.pos.x, player.pos.y, player.pos.z);
    player.pos.normalize().multiplyScalar(g);
    player.up.copy(player.pos).normalize();
    player.vel.set(0, 0, 0);
    player.radialVel = 0;
    player.grounded = true;
    player.refreshBasis?.();
    player.syncCamera?.();
    return null;
  }
  let best = null, bestD = WAGON_TUNING.boardReach;
  for (const w of _wagons) {
    const d = w.pos.distanceTo(player.pos);
    if (d < bestD) { best = w; bestD = d; }
  }
  if (!best) return null;
  _rider = best;
  best.rider = player;
  best.speed = 0;
  player.vel.set(0, 0, 0);
  player.radialVel = 0;
  player.grounded = true;
  return best;
}

// Sit the avatar down, the boat's way: thighs forward, shins to the floor.
function poseSeated(player, t) {
  const parts = player.parts;
  if (!parts) return;
  poseAvatar(parts, 0, 0, t, player.swingK ?? 0, 0);
  for (const side of ['L', 'R']) {
    const leg = parts.legs[side];
    leg.hip.rotation.x = 1.35;
    leg.knee.rotation.x = -1.45;
    leg.ankle.rotation.x = 0.15;
  }
}

let _clock = 0;
export function updateWagons(dt, player = null) {
  _clock += dt;
  const w = _rider;
  if (!w || !player) return;
  w.drive(Math.min(dt, 0.05), player.keys ?? new Set());
  w.seatPos(player.pos);
  player.up.copy(w.up);
  player.refreshBasis?.();
  player.grounded = true;
  player.inWater = false;
  player.vel.copy(w.heading).multiplyScalar(w.speed);
  poseSeated(player, _clock);
  player.syncCamera?.();
}

export default { WAGON_TUNING, placeWagon, toggleWagon, updateWagons,
  ridingWagon, wagons, disposeWagons };
