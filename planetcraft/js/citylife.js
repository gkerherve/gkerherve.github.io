// citylife.js — what moves in the city: crowds, guards and dogs.
//
// city.js builds the place; this file is the reason it is not a model of a
// city. Both halves lean on the same fact: the road grid is ARITHMETIC —
// there is no map of the streets anywhere, so a pavement cell or a block
// circuit is a sum, never a search.
//
// Everything here lives in a bubble around the player and is recycled at its
// edge, the way fish.js does it. A planet-wide city has room for a hundred
// thousand people; a frame has room for about sixty. Spawning them ahead of
// you and retiring them behind is what makes the difference invisible — you
// never see the same crowd twice, and the cost is flat wherever you stand.
//
// The cars are GONE — the player asked for a city on foot, and the streets
// belong to the crowds now. What their budget bought instead is more people,
// and the men who watch them: guards on the pavement, armed and in pairs,
// walking the same block circuits as everybody else. People, guards and dogs
// are all entities, pushed into main.js's own list so combat, melee and the
// sweep see them without knowing the city exists.

import * as THREE from 'three';
import { BLOCK, S, H, dirFromCell } from './cubesphere.js';
import * as CS from './cubesphere.js';
import { Entity, JOBS, SOLDIER_ARM_LIST } from './entities.js';

export const TRAFFIC_TUNING = {
  crowd: 84,          // pedestrians alive at once — the player asked for a
  //                     LOT more, and the villager brain is cheap enough
  crowdRange: 78,
  guards: 14,         // armed watch on the pavements
  guardRange: 80,
  dogs: 12,           // and dogs, because a city without them is a diagram
  dogRange: 60,
  respawnGap: 0.3,    // seconds between top-up attempts, so a fresh arrival
  //                     never spawns sixty entities in one frame
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _d = [0, 0, 0];

/**
 * The living city. Give it the planet city.js has already built.
 *
 *   const life = createCityLife(scene, planet, seed);
 *   ... every frame, in play:
 *   life.update(dt, { pos: player.pos, entities, playing, daylight });
 *
 * `entities` is main.js's own live array: pedestrians and dogs are pushed
 * into it, so they are updated, swept and shot at by the code that already
 * handles villagers. Retiring one is a matter of setting `dead`, which the
 * sweep in main.js already understands.
 */
export function createCityLife(scene, planet, seed = 1, opts = {}) {
  const T = { ...TRAFFIC_TUNING, ...opts };
  const city = planet?.city ?? null;
  const rand = mulberry32((seed ^ 0x1a7e5) | 0);
  const group = new THREE.Group();
  scene.add(group);

  const people = [];       // entities we own, held so they can be retired
  const guards = [];
  const dogs = [];
  let topUp = 0;
  let armNext = (rand() * SOLDIER_ARM_LIST.length) | 0;

  // --- crowds and dogs ---------------------------------------------------

  // Somewhere to stand: a pavement cell, which is the ring of a city block.
  // Picked by arithmetic rather than by searching — the ring is at a known
  // offset from every block corner.
  function pavementCell(cell) {
    const p = city.pavement ?? 2;
    const bu = Math.round((cell.u - city.margin) / city.period)
      + (rand() < 0.5 ? 0 : (rand() < 0.5 ? -1 : 1));
    const bv = Math.round((cell.v - city.margin) / city.period)
      + (rand() < 0.5 ? 0 : (rand() < 0.5 ? -1 : 1));
    if (bu < 0 || bv < 0 || bu >= city.nb || bv >= city.nb) return null;
    const u0 = city.margin + bu * city.period + city.road;
    const v0 = city.margin + bv * city.period + city.road;
    // one of the four sides of the ring, at a random point along it
    const side = (rand() * 4) | 0;
    const t = Math.floor(rand() * city.size);
    const off = Math.floor(rand() * p);
    const far = city.size - 1 - off;
    switch (side) {
      case 0: return { u: u0 + t, v: v0 + off };
      case 1: return { u: u0 + t, v: v0 + far };
      case 2: return { u: u0 + off, v: v0 + t };
      default: return { u: u0 + far, v: v0 + t };
    }
  }

  function walkable(f, u, v) {
    dirFromCell(f, u + 0.5, v + 0.5, _d);
    const r = planet.surfaceRadiusAtDir(_d[0], _d[1], _d[2]);
    const b = planet.blockAtWorld(_d[0] * (r + 0.5), _d[1] * (r + 0.5),
      _d[2] * (r + 0.5));
    return b !== BLOCK.WATER && b !== BLOCK.LAVA;
  }

  // A circuit for a pedestrian: four corners of the block they were born on,
  // so a crowd walks round the block rather than milling on the spot. The
  // villager brain already knows how to follow waypoints.
  function blockCircuit(f, u, v) {
    const bu = Math.floor((u - city.margin) / city.period);
    const bv = Math.floor((v - city.margin) / city.period);
    const u0 = city.margin + bu * city.period + city.road;
    const v0 = city.margin + bv * city.period + city.road;
    const e = city.size - 1;
    const out = [];
    for (const [a, b] of [[1, 1], [e - 1, 1], [e - 1, e - 1], [1, e - 1]]) {
      dirFromCell(f, u0 + a + 0.5, v0 + b + 0.5, _d);
      out.push(new THREE.Vector3(_d[0], _d[1], _d[2]));
    }
    return out;
  }

  // Which borough a street cell belongs to — the crowds are that borough's
  // SOULS: the mayor's chronicle counts them, its watch answers for them,
  // and a block you break belongs to somebody's town.
  function boroughAt(f, u, v) {
    let best = null, bd = Infinity;
    for (const st of planet.villageSites ?? []) {
      if (!st.city || st.f !== f) continue;
      const d = Math.max(Math.abs(u - st.u), Math.abs(v - st.v));
      if (d <= (st.reach ?? 60) + 8 && d < bd) { best = st; bd = d; }
    }
    return best;
  }

  function spawnPerson(cell, list, entities, kind) {
    const spot = pavementCell(cell);
    if (!spot) return false;
    const { u, v } = spot;
    if (u < 1 || v < 1 || u >= S - 1 || v >= S - 1) return false;
    if (!walkable(cell.f, u, v)) return false;
    dirFromCell(cell.f, u + 0.5, v + 0.5, _d);
    const dir = new THREE.Vector3(_d[0], _d[1], _d[2]);
    const borough = kind === 'dog' ? null : boroughAt(cell.f, u, v);
    // A guard is a soldier on a beat: armed, walking the same block circuit
    // as the crowd, and issued their weapon off a rack in turn so no street
    // corner ends up with four of the same spear.
    const e = kind === 'dog'
      ? new Entity(planet, 'dog', dir, { rand })
      : kind === 'guard'
        ? new Entity(planet, 'villager', dir, {
          job: 'soldier',
          arm: SOLDIER_ARM_LIST[armNext++ % SOLDIER_ARM_LIST.length],
          waypoints: blockCircuit(cell.f, u, v), rand,
          ...(borough ? { village: borough } : {}),
        })
        : new Entity(planet, 'villager', dir, {
          job: JOBS[(rand() * JOBS.length) | 0],
          waypoints: blockCircuit(cell.f, u, v), rand,
          ...(borough ? { village: borough } : {}),
        });
    scene.add(e.mesh);
    entities.push(e);
    list.push(e);
    return true;
  }

  // --- the frame ---------------------------------------------------------

  function sweep(list, pos, range) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      // killed, or wandered out of the bubble: either way it leaves this
      // list, and `dead` is what main.js's own sweep removes the mesh on
      if (e.dead) { list.splice(i, 1); continue; }
      // Written as "not near enough" rather than "too far": a position that
      // has gone non-finite fails `>` as surely as it fails `<=`, so the old
      // form kept a broken entity in the list for ever — and it is the one
      // the bark below eventually picks.
      if (!(e.pos.distanceTo(pos) <= range * 1.6)) {
        e.dead = true;
        list.splice(i, 1);
      }
    }
  }

  const handle = {
    group, people, guards, dogs,
    barkT: 3,
    get counts() {
      return {
        people: people.length, guards: guards.length, dogs: dogs.length,
      };
    },

    update(dt, ctx = {}) {
      const playing = ctx.playing !== false && !!ctx.pos && !!city;
      group.visible = playing;
      if (!playing) return;
      const pos = ctx.pos;
      const cell = CS.cellAtWorld(pos.x, pos.y, pos.z);
      if (!cell) return;
      const here = { f: cell[0], u: cell[1], v: cell[2] };

      // Top-ups are rationed: arriving in a new district would otherwise
      // build sixty bodies in one frame and drop it.
      topUp -= dt;
      if (topUp <= 0) {
        topUp = T.respawnGap;
        if (ctx.entities) {
          if (people.length < T.crowd) {
            spawnPerson(here, people, ctx.entities, 'villager');
          }
          if (guards.length < T.guards) {
            spawnPerson(here, guards, ctx.entities, 'guard');
          }
          if (dogs.length < T.dogs) {
            spawnPerson(here, dogs, ctx.entities, 'dog');
          }
        }
      }

      sweep(people, pos, T.crowdRange);
      sweep(guards, pos, T.guardRange);
      sweep(dogs, pos, T.dogRange);

      // one of them barks now and then, from wherever it happens to be
      this.barkT -= dt;
      if (this.barkT <= 0 && dogs.length) {
        this.barkT = 1.5 + Math.random() * 5;
        const d = dogs[(Math.random() * dogs.length) | 0];
        ctx.onSound?.('bark', { dist: d.pos.distanceTo(pos) });
      }
    },

    dispose() {
      for (const e of [...people, ...guards, ...dogs]) e.dead = true;
      people.length = 0; guards.length = 0; dogs.length = 0;
      scene.remove(group);
      group.clear();
      if (_active === handle) _active = null;
    },
  };

  if (_active) _active.dispose();
  _active = handle;
  return handle;
}

let _active = null;

export function updateCityLife(dt, ctx) { _active?.update(dt, ctx); }
export function disposeCityLife() { _active?.dispose(); }
export const activeCityLife = () => _active;
