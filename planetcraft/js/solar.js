// solar.js — the rest of the system.
//
// Only ONE voxel planet can exist at a time: cubesphere.js holds S, H, R, R0,
// AMP and SEA as module state and Planet reads them, so a second world would
// have to be a second copy of the module. That is not a limitation to fight —
// it is the design. This file holds everything about the *other* worlds, which
// is very little: a name, a preset, a size, an orbit and a colour. A planet you
// are not standing on is a sphere a few pixels across.
//
// So there are three views of the same data here, in increasing cost:
//
//   1. the layout      plain numbers, serialisable, no three.js. Orbits are
//                      advanced by updateOrbits(sys, dt).
//   2. the night sky   a handful of sprites over the loaded world, positioned
//                      from the layout each frame. ~10 objects.
//   3. the map         sun, orbit rings and a sphere per body, for the travel
//                      screen. ~40 objects, all sharing two geometries.
//
// three.js is passed IN rather than imported. cubesphere.js is deliberately
// free of three so it can be tested in node, and the same is worth having
// here: (1) is pure arithmetic and node runs it directly. Callers already
// import three, so `buildSystemScene(THREE, sys)` costs them nothing.
//
// Travelling is: pick a body, read its `seed`, `presetId` and `radius`, call
// setWorldPreset(radius, presetId) and build a new Planet. See
// INTEGRATION-solar.md.

import { PRESETS, getPreset } from './cubesphere.js';

// --- deterministic noise ----------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash2 = (a, b) => {
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

// --- names ------------------------------------------------------------------
//
// Names are generated, not drawn from a list, so a system always has as many
// as it needs and two seeds never share one.
//
// EASY ON PURPOSE. The first syllable set was alien for alien's sake — Nyxmiia,
// Quelraus, Selsoeth — and the player said plainly that they could not hold
// the names in their head, which on a chart of eight worlds is the chart not
// working. So the syllables are the ones real star and planet names are made
// of: every head ends on a soft consonant, every joint and ending starts on a
// vowel, and the space includes Juno, Orion, Helios, Nova and Solaris — names
// you can say once and remember. Same THREE draws per name as before, so an
// existing world keeps its orbits, sizes and presets exactly and only the
// labels on its chart change.

// Heads end on a consonant, joints end on a consonant (or are `i`, the one
// vowel that glides — Orion, Helios), endings start on a vowel: every seam in
// every name is consonant-into-vowel, which is most of what pronounceable IS.
const HEAD = ['al', 'bel', 'cal', 'dor', 'el', 'fen', 'gal', 'hel', 'jun',
  'kal', 'lor', 'mar', 'nov', 'or', 'pal', 'rin', 'sol', 'tal', 'vel', 'zan'];
const MID = ['', '', 'i', 'an', 'en', 'ar', 'or', 'el', 'in', 'ol'];
const TAIL = ['a', 'ia', 'o', 'on', 'os', 'us', 'is', 'ora', 'ea', 'una'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// `used` keeps one system's names apart, twice over: no two names may match,
// and no two may even share their FIRST syllable — Hela and Helia on one
// chart are two planets the eye files as one. Both dodges are deterministic
// and cost no extra draws — a clash walks the head or tail list until it
// clears — because a retry that pulled on `rnd` would shift every roll after
// it, and with them the sizes and moons of every planet further out in a
// world somebody saved.
function makeName(rnd, used = null) {
  let hi = (rnd() * HEAD.length) | 0;
  const mi = (rnd() * MID.length) | 0;
  const ti = (rnd() * TAIL.length) | 0;
  if (used) {
    for (let k = 0; used.has(`h${hi}`) && k < HEAD.length; k++) {
      hi = (hi + 1) % HEAD.length;
    }
    used.add(`h${hi}`);
  }
  const make = (t) => {
    let m = MID[mi];
    // the glide glides into everything except an e — "Paliea" is nobody's
    // planet — and a doubled i is caught by the letter collapse below
    if (m === 'i' && TAIL[t][0] === 'e') m = '';
    // "Dororon" is Doron and "Zanana" is Zana: a repeated pair is assembly
    // showing, not a name, and so is a doubled letter
    const s = (HEAD[hi] + m + TAIL[t])
      .replace(/(..)\1+/g, '$1').replace(/(.)\1+/g, '$1');
    return s[0].toUpperCase() + s.slice(1);
  };
  let name = make(ti);
  for (let k = 1; used?.has(name) && k < TAIL.length; k++) {
    name = make((ti + k) % TAIL.length);
  }
  used?.add(name);
  return name;
}

// --- the layout -------------------------------------------------------------

// World sizes a body may have, in cubesphere radii — the menu's own sizes,
// anything else is untested ground. The list is weighted by repetition: most
// worlds should be walkable in an evening, and radius 400 is a rare monster
// (radius 800 is deliberately absent; half a second of load for a world you
// are only visiting is the wrong trade).
const SIZES = [30, 50, 78, 78, 156, 156, 156, 200, 200, 400];

// Orbits are circles seen from a fixed viewpoint, so all that is needed is a
// radius, a period and a phase. `a` is in system units, and the map view
// normalises so the outermost orbit is 1.
const A0 = 0.42;          // innermost orbit
const A_STEP = 0.30;      // and the gap between them, before jitter
// Seconds for a body at a = 1, at timeScale 1. A game day is 180 s, so this
// is a 23-day year for the middle of the system: from the ground the other
// planets creep across the sky over several nights, which is what makes them
// read as planets. The travel screen sets sys.timeScale high (40-80) so the
// map visibly turns while you look at it.
const PERIOD = 4200;

// Presets every system carries, however the draw falls. The storm world and
// the city are destinations rather than scenery — a system that happened not
// to roll them would be missing half the map — so they are guaranteed.
const REQUIRED = ['storm', 'city'];

// A system always carries one of each preset when it is big enough, because
// the point of the whole thing is somewhere new to go; the rest are drawn at
// random. The home world is terran and is never the first or last orbit.
function presetPlan(n, rnd) {
  // the guaranteed worlds are appended by makeSystem, so drawing them here as
  // well would only ever produce a duplicate
  const ids = Object.keys(PRESETS).filter((id) => !REQUIRED.includes(id));
  const plan = [];
  for (const id of ids) if (plan.length < n) plan.push(id);
  // extras come from another pass over the list, not from repeated draws, so a
  // system never lands three ash worlds in a row
  let extra = ids.slice();
  while (plan.length < n) {
    if (!extra.length) extra = ids.slice();
    plan.push(extra.splice((rnd() * extra.length) | 0, 1)[0]);
  }
  // shuffle, then force a terran home somewhere in the middle
  for (let i = plan.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  const home = 1 + ((rnd() * Math.max(1, n - 2)) | 0);
  const at = plan.indexOf('terran');
  if (at >= 0) [plan[home], plan[at]] = [plan[at], plan[home]];
  else plan[home] = 'terran';
  return { plan, home };
}

/**
 * Build a system from a seed. Pure data — no three.js, no Planet.
 *
 * opts: { planets, timeScale, sizes }
 */
export function makeSystem(seed = 1337, opts = {}) {
  const rnd = mulberry32((seed ^ 0x50_1a2) | 0);
  const n = opts.planets || 5 + ((rnd() * 4) | 0);       // 5..8
  const { plan, home } = presetPlan(n, rnd);
  const sizes = opts.sizes || SIZES;
  // Worlds the system must contain whatever the draw says, on the outermost
  // orbits. They are appended AFTER the drawn bodies rather than mixed into
  // the plan on purpose: every rnd() call below happens in the same order it
  // did before, so the worlds a player already knows keep their names, sizes
  // and presets exactly, and these two arrive beyond them.
  const required = opts.required || REQUIRED;

  const bodies = [];
  const named = new Set();       // one system never shows one name twice
  let a = A0;
  for (let i = 0; i < n + required.length; i++) {
    const presetId = i < n ? plan[i] : required[i - n];
    const P = getPreset(presetId);
    a += A_STEP * (0.7 + rnd() * 0.7);
    // The home world is a comfortable size; everything else is drawn from the
    // weighted list, with the two innermost orbits held to small worlds so a
    // system reads as scorched rocks close in and proper planets further out.
    const drawn = sizes[(rnd() * sizes.length) | 0];
    const size = i === home || i >= n ? 156
      : i < 2 ? Math.min(drawn, 78) : drawn;
    const nMoons = rnd() < 0.45 ? 0 : rnd() < 0.8 ? 1 : 2;
    const name = makeName(rnd, named);
    const moons = [];
    for (let m = 0; m < nMoons; m++) {
      moons.push({
        name: `${name} ${ROMAN[m]}`,
        dist: 0.055 + 0.035 * m + rnd() * 0.02,   // in system units
        period: 9 + m * 7 + rnd() * 6,            // seconds at timeScale 1
        phase: rnd() * Math.PI * 2,
        radius: 0.25 + rnd() * 0.2,               // fraction of the planet
        color: 0x9aa3ad,
        pos: [0, 0, 0],
      });
    }
    bodies.push({
      id: `b${i}`,
      index: i,
      name,
      title: `${name} · ${P.name}`,
      presetId,
      preset: P,
      desc: P.desc,
      // the seed the world is generated from when you land on it. Derived, so
      // a save only has to store the system seed.
      seed: (hash2(seed, i * 7919 + 13) & 0x7fffffff) | 0,
      radius: size,
      orbit: a,
      period: PERIOD * Math.pow(a, 1.5),          // Kepler, near enough
      phase: rnd() * Math.PI * 2,
      // a small inclination each, so the map is not a flat disc seen edge-on
      incl: (rnd() - 0.5) * 0.22,
      color: P.color,
      ring: P.ring,
      home: i === home,
      moons,
      pos: [0, 0, 0],
      angle: 0,
    });
  }

  const sys = {
    seed,
    name: makeName(rnd, named),
    time: 0,
    timeScale: opts.timeScale === undefined ? 1 : opts.timeScale,
    star: {
      name: 'Kherve',
      color: 0xffe9a8,
      // display radius in system units; the star is not to scale and should
      // not be — at scale it would be a pixel or the planets would be
      radius: 0.16,
    },
    extent: bodies[bodies.length - 1].orbit,
    bodies,
    homeId: bodies[home].id,
  };
  setSystemTime(sys, 0);
  return sys;
}

export const bodyById = (sys, id) => sys.bodies.find((b) => b.id === id) || null;

// --- the flat view, for travel.js -------------------------------------------
//
// travel.js was written before this file existed and reads a *static* list off
// the module: `PLANETS`, or a `SOLAR` object with `.planets`. It also wants
// plain values — a preset id string rather than the preset object, a CSS
// colour rather than an int, and a phase in turns rather than radians. That is
// a reasonable thing to want, so the adapter lives here rather than making
// them change.
//
// This is ONE system, from a fixed seed. Anything that wants a system per save
// should call makeSystem(saveSeed) and use the rich model above.

export const DEFAULT_SEED = 20260802;
const css = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export function flatBodies(sys) {
  return sys.bodies.map((b) => ({
    id: b.id,
    name: b.name,
    preset: b.presetId,               // a string: travel.js passes it through
    presetId: b.presetId,
    radius: b.radius,
    seed: b.seed,
    orbit: b.orbit,
    // travel.js counts in days and turns; only the ratios matter to it, so a
    // "day" here is a minute of system time
    period: b.period / 60,
    phase: b.phase / (Math.PI * 2),
    color: css(b.color),
    type: b.preset.class,
    blurb: b.desc,
    home: b.home,
    moons: b.moons.length,
    // A BODY THAT IS NOT A PLACE. The drafting table is the one preset that
    // is not a world — no sky over it, no launch monument on it, nothing
    // generated and nothing to go there for except the thing you are
    // designing. Rolled into the system like anything else it came out as a
    // planet hanging over your own with a name on it, and a destination in
    // the chooser you could fly to and be stranded on.
    //
    // It keeps its place in the system rather than being dropped, because
    // the ids are positional (`b0`, `b4`) and every world already saved is
    // filed under one: taking it out would move every body after it onto
    // somebody else's planet. So it stays, and it is simply not shown — the
    // chooser and the overview both drop it, and the planner still reaches
    // it by id. See travel.js's `makeSystem` and main.js's `systemBodies`.
    hidden: b.presetId === 'flat',
  }));
}

export const DEFAULT_SYSTEM = makeSystem(DEFAULT_SEED);
export const PLANETS = flatBodies(DEFAULT_SYSTEM);
export const SOLAR = {
  name: DEFAULT_SYSTEM.name,
  star: { name: DEFAULT_SYSTEM.star.name, color: css(DEFAULT_SYSTEM.star.color) },
  planets: PLANETS,
  bodies: PLANETS,
  system: DEFAULT_SYSTEM,
};
export default SOLAR;

// Positions at an absolute system time. Circular orbits, so this is one sin
// and one cos per body — cheap enough to call every frame for every body,
// which is what makes the map and the night sky the same data.
export function setSystemTime(sys, t) {
  sys.time = t;
  for (const b of sys.bodies) {
    const th = b.phase + (t / b.period) * Math.PI * 2;
    b.angle = th;
    const x = Math.cos(th) * b.orbit, z = Math.sin(th) * b.orbit;
    // tilt the circle about the x axis, so orbits are not coplanar
    b.pos[0] = x;
    b.pos[1] = z * Math.sin(b.incl);
    b.pos[2] = z * Math.cos(b.incl);
    for (const m of b.moons) {
      const mt = m.phase + (t / m.period) * Math.PI * 2;
      // a circle in a tilted plane, not a squashed one: the two coefficients
      // are a unit vector, so the moon keeps its distance all the way round
      m.pos[0] = b.pos[0] + Math.cos(mt) * m.dist;
      m.pos[1] = b.pos[1] + Math.sin(mt) * m.dist * 0.35;
      m.pos[2] = b.pos[2] + Math.sin(mt) * m.dist * 0.9367;
    }
  }
  return sys;
}

// Advance the system. dt is real seconds; sys.timeScale turns it into system
// time, so the travel screen can run the clock fast without touching periods.
export function updateOrbits(sys, dt) {
  return setSystemTime(sys, sys.time + dt * sys.timeScale);
}

// Distance between two bodies right now, in system units. The travel UI wants
// it for a flight time; nothing here decides what a unit costs.
export function bodyDistance(a, b) {
  return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1],
    a.pos[2] - b.pos[2]);
}

// Everything a save needs. The bodies are all derived from the seed, so only
// the seed, the clock and where the player is have to survive.
export function systemLayout(sys) {
  return {
    seed: sys.seed, time: sys.time, name: sys.name,
    bodies: sys.bodies.map((b) => ({
      id: b.id, name: b.name, presetId: b.presetId, radius: b.radius,
      seed: b.seed, orbit: b.orbit, period: b.period, color: b.color,
      moons: b.moons.length, home: b.home, desc: b.desc,
    })),
  };
}

// --- the night sky ----------------------------------------------------------
//
// From the ground the other planets are points, and the nearest of them a
// small disc. The direction is just the difference of two orbit positions, so
// it costs nothing to keep it exact — and it *moves*, which is the whole
// reason to draw them: a wandering star is recognisably a planet.
//
// System space is used directly as world space. The loaded planet does not
// rotate (main.js moves the sun instead), so any fixed mapping is as good as
// any other, and identity keeps this readable.

/**
 * Where each other body appears from `currentId`, right now.
 * Returns [{ id, name, dir:[x,y,z], dist, size, mag, color }], brightest
 * first. `size` is an angular size in radians, `mag` a 0..1 brightness.
 */
export function skyBodies(sys, currentId, out = []) {
  out.length = 0;
  const here = bodyById(sys, currentId);
  if (!here) return out;
  for (const b of sys.bodies) {
    if (b === here) continue;
    // the drafting table is not a light in anybody's sky — see `hidden` in
    // flatBodies for why it is in the list at all
    if (b.presetId === 'flat') continue;
    let dx = b.pos[0] - here.pos[0];
    let dy = b.pos[1] - here.pos[1];
    let dz = b.pos[2] - here.pos[2];
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    dx /= d; dy /= d; dz /= d;
    // A planet's disc is its radius over its distance. Radii here are world
    // radii in blocks and distances are system units, so the constant below
    // is a scale choice, not physics: it makes a close big world about a
    // third of a degree across, roughly the moon.
    const size = (b.radius / 156) * 0.006 / Math.max(0.25, d);
    // brightness falls off with distance and rises with size, then is
    // flattened hard — the range is 200:1 and the eye wants 4:1
    const mag = Math.min(1, Math.pow((b.radius / 156) / (d * d), 0.35) * 0.75);
    out.push({
      id: b.id, name: b.name, dir: [dx, dy, dz], dist: d,
      size, mag, color: b.color, preset: b.presetId,
    });
  }
  out.sort((p, q) => q.mag - p.mag);
  return out;
}

/**
 * Sprites for the above, ready to add to the game scene.
 *
 *   const sky = createSkyBodies(THREE, sys, 'b2', { distance: R * 8 });
 *   scene.add(sky.group);
 *   ... every frame:  sky.update(daylight);     // 1 = day, 0 = night
 *
 * They sit at a fixed distance with depthWrite off, so they read as sky
 * whatever the terrain does, and they fade out in daylight like the stars.
 */
export function createSkyBodies(THREE, sys, currentId, opts = {}) {
  const distance = opts.distance || 4000;
  const scale = opts.scale || 1;
  const group = new THREE.Group();
  group.renderOrder = -1;
  // keyed by body, never by position in the list: skyBodies sorts by
  // brightness and that order changes as the orbits move, so an index would
  // swap the colours around under you
  const byId = new Map();
  const discs = [];
  for (const s of skyBodies(sys, currentId)) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTexture(THREE, s.color),
      transparent: true, depthWrite: false, depthTest: false,
      color: 0xffffff, opacity: 0,
    }));
    spr.userData.bodyId = s.id;
    group.add(spr);
    byId.set(s.id, spr);
    discs.push(spr);
  }

  // A true angular size is under a pixel for everything but the nearest
  // neighbour, so the disc is exaggerated and floored — the point is to tell
  // the planets apart, not to be an ephemeris.
  const px = (s) => Math.max(distance * 0.010, distance * s.size * 26) * scale;

  function update(daylight = 0) {
    const night = 1 - Math.min(1, Math.max(0, daylight));
    const now = skyBodies(sys, currentId);
    for (const s of now) {
      const spr = byId.get(s.id);
      if (!spr) continue;
      spr.position.set(s.dir[0] * distance, s.dir[1] * distance,
        s.dir[2] * distance);
      spr.material.opacity = night * (0.25 + 0.75 * s.mag);
      const p = px(s);
      spr.scale.set(p, p, 1);
    }
    return now;
  }

  function dispose() {
    for (const s of discs) s.material.dispose();
    group.clear();
    byId.clear();
  }

  update(0);
  return { group, update, dispose, sprites: discs, byId };
}

// A soft disc, painted once per colour. Sprites need a texture and a canvas
// gradient is smaller than any file and matches the sun main.js already draws.
const _discCache = new Map();
function discTexture(THREE, color) {
  const key = color;
  if (_discCache.has(key)) return _discCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = (color >> 16) & 255, gg = (color >> 8) & 255, b = color & 255;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(255,255,255,1)`);
  grad.addColorStop(0.35, `rgba(${r},${gg},${b},0.95)`);
  grad.addColorStop(0.62, `rgba(${r},${gg},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  _discCache.set(key, tex);
  return tex;
}

// --- the map ----------------------------------------------------------------
//
// The travel screen: sun, orbit rings, a sphere per planet and per moon. Two
// geometries are shared by everything, so the whole system is a few dozen
// draw calls of a hundred triangles each — it can sit in its own scene beside
// the game or replace it, whichever the UI wants.

/**
 *   const map = buildSystemScene(THREE, sys, { scale: 100 });
 *   scene.add(map.group);
 *   ... every frame:  updateOrbits(sys, dt); map.update();
 *
 * `map.pickables` is the array to raycast; each mesh carries
 * `userData.bodyId`. `map.setCurrent(id)` rings the world you are on.
 */
export function buildSystemScene(THREE, sys, opts = {}) {
  // one system unit -> this many scene units. The default puts the outermost
  // orbit at 100, which frames well with a camera at ~220.
  const scale = (opts.scale || 100) / (sys.extent || 1);
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, opts.segments || 20,
    (opts.segments || 20) / 2);
  const ringGeo = ringGeometry(THREE, opts.ringSegments || 128);
  const dispose = [sphere, ringGeo];
  const pickables = [];
  const items = [];

  // the star. Basic material, like everything else in this game — there are
  // no lights in the scene and adding one for this view would light nothing.
  const star = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({
    color: sys.star.color,
  }));
  star.scale.setScalar(sys.star.radius * scale);
  group.add(star);
  dispose.push(star.material);
  if (opts.glow !== false) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: discTexture(THREE, sys.star.color), transparent: true,
      depthWrite: false, opacity: 0.75,
    }));
    const g = sys.star.radius * scale * 7;
    glow.scale.set(g, g, 1);
    group.add(glow);
    dispose.push(glow.material);
  }

  for (const b of sys.bodies) {
    if (b.presetId === 'flat') continue;   // not a world; see flatBodies
    const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
      color: b.ring, transparent: true, opacity: 0.28,
    }));
    ring.scale.setScalar(b.orbit * scale);
    ring.rotation.x = -Math.PI / 2 + b.incl;
    group.add(ring);
    dispose.push(ring.material);

    const mat = new THREE.MeshBasicMaterial({ color: b.color });
    const mesh = new THREE.Mesh(sphere, mat);
    // Radii span 30..800 blocks, a 26:1 range that would make the small
    // worlds invisible next to the big ones, so the map uses the cube root —
    // the same trick a log scale is, with a shape that keeps discs round.
    const rr = Math.cbrt(b.radius / 156) * (opts.bodySize || 0.055) * scale;
    mesh.scale.setScalar(rr);
    mesh.userData.bodyId = b.id;
    mesh.userData.body = b;
    group.add(mesh);
    pickables.push(mesh);
    dispose.push(mat);

    const moons = b.moons.map((m) => {
      const mm = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({
        color: m.color,
      }));
      mm.scale.setScalar(rr * m.radius + 0.004 * scale);
      group.add(mm);
      dispose.push(mm.material);
      return mm;
    });
    items.push({ b, mesh, moons, rr });
  }

  // a ring drawn round whichever world you are standing on
  const marker = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9,
  }));
  marker.visible = false;
  group.add(marker);
  dispose.push(marker.material);
  let current = null;

  function update() {
    for (const it of items) {
      const p = it.b.pos;
      it.mesh.position.set(p[0] * scale, p[1] * scale, p[2] * scale);
      for (let i = 0; i < it.moons.length; i++) {
        const mp = it.b.moons[i].pos;
        it.moons[i].position.set(mp[0] * scale, mp[1] * scale, mp[2] * scale);
      }
      if (current === it.b.id) {
        marker.position.copy(it.mesh.position);
        marker.scale.setScalar(it.rr * 2.1);
        marker.visible = true;
      }
    }
  }

  function setCurrent(id) {
    current = id;
    marker.visible = false;
    update();
  }

  function faceCamera(camera) {
    // the selection ring is flat, so it only reads if it faces the viewer
    marker.quaternion.copy(camera.quaternion);
  }

  update();
  return {
    group, update, setCurrent, faceCamera, pickables, scale,
    dispose() {
      for (const d of dispose) d.dispose();
      group.clear();
    },
  };
}

function ringGeometry(THREE, segments) {
  const pts = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts[i * 3] = Math.cos(t);
    pts[i * 3 + 1] = Math.sin(t);
    pts[i * 3 + 2] = 0;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  return g;
}
