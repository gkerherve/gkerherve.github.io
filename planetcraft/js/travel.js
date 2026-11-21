// travel.js — launch pads, the interplanetary flight, and per-planet edits.
//
// Why this file exists in this shape: cubesphere.js keeps the world in
// module-level state (S, H, R, R0), so exactly one planet is resident at a
// time. Travel therefore cannot be "fly there and arrive"; it has to be
//
//     launch sequence -> unload -> buildWorld(destination) -> descend
//
// with the rebuild hidden inside the one moment of the flight where nothing
// of either world is on screen. That moment is the end of the cruise, behind
// a star-streak field and two cheap proxy spheres standing in for the planet
// you left and the one you are aiming at. See INTEGRATION-travel.md.
//
// Everything here is defensive about its neighbours: solar.js is written by
// another agent and may not exist yet, so loadSystem() degrades to a stub
// system rather than taking the game down with a module error. main.js owns
// the render loop and the world; this module never touches either directly,
// it asks through hooks.

import * as THREE from 'three';
import {
  BLOCK, S, H, R, R0, dirFromCell, stairId,
} from './cubesphere.js';

// ---- small helpers ---------------------------------------------------------

// this module is deliberately importable headless (node tests, tooling), so
// every DOM touch goes through here rather than assuming a document exists
const DOC = typeof document !== 'undefined' ? document : null;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// stable id from a name, so a solar.js entry without an explicit id still
// stashes its edits under the same key on every run
export function slug(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'planet';
}

function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 1e9;
}

// ---- the solar system ------------------------------------------------------
//
// solar.js is owned by another agent. Import it defensively and normalise
// whatever shape it turns out to export; fall back to this stub so the
// chooser, the pad and the flight all work before it lands.

const STUB_PLANETS = [
  {
    id: 'verdance', name: 'Verdance', preset: 'temperate', radius: 156,
    orbit: 1.0, period: 365, phase: 0.15, color: '#5fa85c',
    type: 'garden world',
    blurb: 'grass, forest and open water — the ordinary home planet',
  },
  {
    id: 'cinder', name: 'Cinder', preset: 'volcanic', radius: 78,
    orbit: 0.62, period: 180, phase: 0.72, color: '#c9542f',
    type: 'volcanic world',
    blurb: 'black rock and ash — hot, treeless, rich in coal',
  },
  {
    id: 'ferrum', name: 'Ferrum', preset: 'iron', radius: 200,
    orbit: 1.55, period: 690, phase: 0.40, color: '#a8845a',
    type: 'iron world',
    blurb: 'iron world — no soil, ore at the surface',
  },
  {
    id: 'dune', name: 'Dune', preset: 'desert', radius: 200,
    orbit: 2.3, period: 1240, phase: 0.86, color: '#d8bf7e',
    type: 'desert world',
    blurb: 'sand to the horizon, no sea, water only underground',
  },
  {
    id: 'halcyon', name: 'Halcyon', preset: 'ice', radius: 400,
    orbit: 3.4, period: 2200, phase: 0.05, color: '#9fd4e8',
    type: 'ice world',
    blurb: 'a frozen ocean under snow — quiet, bright and very large',
  },
];

const STUB_STAR = { name: 'Kherve', color: '#ffd27a', radius: 1 };

function normalisePlanet(p, i) {
  const name = p?.name ?? p?.title ?? `Planet ${i + 1}`;
  const id = slug(p?.id ?? p?.key ?? name);
  return {
    id,
    name,
    // the preset drives terrain in cubesphere/solar; we only carry it through
    preset: p?.preset ?? p?.kind ?? p?.biome ?? 'temperate',
    radius: Number(p?.radius ?? p?.worldRadius ?? p?.size ?? 156) || 156,
    // orbital radius in whatever unit solar.js chose; only ratios matter here
    orbit: Number(p?.orbit ?? p?.orbitRadius ?? p?.a ?? (1 + i * 0.7)) || 1,
    period: Number(p?.period ?? p?.orbitalPeriod ?? p?.year ?? (200 + i * 400)),
    phase: Number(p?.phase ?? p?.angle ?? ((i * 0.37) % 1)),
    color: p?.color ?? p?.colour ?? '#8fa4c8',
    type: p?.type ?? p?.class ?? 'world',
    blurb: p?.blurb ?? p?.description ?? p?.desc ?? '',
    // the world seed must be stable or a planet regenerates differently every
    // visit; solar.js may supply one, otherwise hash the id
    seed: Number.isFinite(p?.seed) ? p.seed : hashSeed(id),
    gravity: p?.gravity ?? null,
    // a body that exists but is not a destination — solar.js says which, and
    // the only one today is the drafting table. It keeps an id, a seed and a
    // stash like any other; it is just never offered. See makeSystem.
    hidden: !!(p?.hidden ?? (p?.preset === 'flat')),
    raw: p,
  };
}

function makeSystem(list, meta) {
  const all = list.map(normalisePlanet);
  // `planets` is the list you may fly to, and `all` is every body there is.
  // A hidden body still has an id, a seed and a stash — `byId` finds it, the
  // planner opens it, and a save that was written on one loads back onto it —
  // it simply is not a place the chooser or the orbit map will offer you.
  const planets = all.filter((p) => !p.hidden);
  return {
    name: meta?.name ?? meta?.system ?? 'Kherve',
    star: {
      name: meta?.star?.name ?? STUB_STAR.name,
      color: meta?.star?.color ?? meta?.star?.colour ?? STUB_STAR.color,
    },
    planets,
    all,
    byId: (id) => all.find((p) => p.id === id) ?? null,
    stub: !!meta?.__stub,
  };
}

export const STUB_SYSTEM = () =>
  makeSystem(STUB_PLANETS, { name: 'Kherve', star: STUB_STAR, __stub: true });

let _systemPromise = null;

// Never throws and never returns null: a missing or broken solar.js gives the
// stub, so the launch pad is usable the moment this module is wired in.
export function loadSystem() {
  if (_systemPromise) return _systemPromise;
  _systemPromise = import('./solar.js').then((m) => {
    const meta = m?.SOLAR ?? m?.SYSTEM ?? m?.default ?? null;
    const list = Array.isArray(m?.PLANETS) ? m.PLANETS
      : Array.isArray(meta) ? meta
        : Array.isArray(meta?.planets) ? meta.planets
          : Array.isArray(meta?.bodies) ? meta.bodies
            : Array.isArray(m?.planets) ? m.planets : null;
    if (!list || !list.length) throw new Error('solar.js has no planet list');
    return makeSystem(list, Array.isArray(meta) ? null : meta);
  }).catch(() => STUB_SYSTEM());
  return _systemPromise;
}

// angular position on the orbit at a given time, in days since epoch
export function angleAt(p, days = 0) {
  const per = Math.abs(p.period) > 1e-6 ? p.period : 365;
  return (p.phase ?? 0) * Math.PI * 2 + (days / per) * Math.PI * 2;
}

export function positionAt(p, days = 0) {
  const a = angleAt(p, days);
  return [Math.cos(a) * p.orbit, Math.sin(a) * p.orbit];
}

export function separation(a, b, days = 0) {
  if (!a || !b) return 0;
  const [ax, ay] = positionAt(a, days);
  const [bx, by] = positionAt(b, days);
  return Math.hypot(ax - bx, ay - by);
}

// ---- per-planet world edits ------------------------------------------------
//
// main.js keeps one Map<"f,u,v,h", block> for the resident planet and clears
// it on every buildWorld. Travel therefore has to own the other planets'
// diffs: stash before leaving, hand them back on arrival. Base built on the
// iron world is still there when you come back.

const _stash = new Map();   // planetId -> Map<key, block>

export function stashEdits(planetId, edits) {
  if (!planetId) return 0;
  const copy = new Map();
  if (edits) for (const [k, b] of edits) copy.set(k, b);
  if (copy.size) _stash.set(planetId, copy);
  else _stash.delete(planetId);   // an untouched planet costs nothing to hold
  return copy.size;
}

export function hasEdits(planetId) {
  return _stash.has(planetId) && _stash.get(planetId).size > 0;
}

export function editCount(planetId) {
  return _stash.get(planetId)?.size ?? 0;
}

// the exact shape buildWorld's `savedEdits` argument wants: [[f,u,v,h,b], …]
export function editsFor(planetId) {
  const m = _stash.get(planetId);
  if (!m || !m.size) return null;
  const out = [];
  for (const [key, b] of m) {
    const p = key.split(',');
    out.push([+p[0], +p[1], +p[2], +p[3], b]);
  }
  return out;
}

export function clearStash(planetId) {
  if (planetId === undefined) _stash.clear();
  else _stash.delete(planetId);
}

// serialisable form, so save.js can carry the whole system in one slot
export function stashState() {
  const out = {};
  for (const [id, m] of _stash) out[id] = [...m];
  return out;
}

export function loadStashState(obj) {
  _stash.clear();
  for (const id of Object.keys(obj ?? {})) {
    const rows = obj[id];
    if (!Array.isArray(rows)) continue;
    _stash.set(id, new Map(rows));
  }
  return _stash.size;
}

export function stashedPlanetIds() {
  return [..._stash.keys()];
}

// ---- the launch pad --------------------------------------------------------
//
// A pad has to be findable from the ground and readable from orbit, so it is
// deliberately not subtle: a wide cobble apron with a hazard-chevron rim, an
// iron platform with a glass ignition lens dead centre, four masts carrying
// lanterns, and blast screens on the four sides. The centre 5x5 is left
// completely clear — that is the cell you stand on, and anything built into
// it would block the launch.

export const PAD = {
  R: 4,        // apron half-width in cells (9x9 footprint)
  CORE: 1,     // clear central platform half-width
  MAST: 4,     // masts sit at (+-4, +-4), on the apron's rim
  HEIGHT: 5,   // mast height above the floor
  SKIRT: 1,    // levelled ground beyond the apron
  CLEAR: 12,   // headroom cut above the floor, tall enough to eat a tree
};

// MAST - 2 > CORE, always. The gantry arms reach two cells in along each
// diagonal, and the last act of buildLaunchPad is to blow the CORE column
// back to air — so an arm that reaches into the core is written and then
// silently deleted, leaving masts with nothing on top of them.

const GROUND_OK = new Set([
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.SAND_ORANGE, BLOCK.STONE,
  BLOCK.GRAVEL, BLOCK.CLAY, BLOCK.SNOW, BLOCK.PATH,
]);

// top of the real ground, stepping down past whatever is growing on it
function groundTop(planet, f, u, v) {
  let t = planet.columnSolidTop(f, u, v);
  while (t >= 0) {
    const b = planet.get(f, u, v, t);
    if (b !== BLOCK.LOG && b !== BLOCK.LEAF && !isPlantish(b)) return t;
    t--;
  }
  return -1;
}

function isPlantish(b) {
  return b === BLOCK.LEAF || b === BLOCK.SAPLING || b === BLOCK.MUSHROOM
    || b === BLOCK.FLOWER_RED || b === BLOCK.FLOWER_YELLOW
    || b === BLOCK.FLOWER_BLUE || b === BLOCK.WHEAT
    || b === BLOCK.WHEAT_YOUNG;
}

const inFace = (c) => c >= 0 && c < S;

// Survey a candidate centre. Returns { base, spread, wet } or null. Unlike a
// village we accept quite broken ground — the pad cuts and fills hard — but
// never the sea bed, and never a site with no headroom left under H.
function surveyPad(planet, f, cu, cv) {
  const r = PAD.R + PAD.SKIRT;
  if (cu - r < 1 || cv - r < 1 || cu + r > S - 2 || cv + r > S - 2) return null;
  let lo = H, hi = -1, sum = 0, n = 0, wet = 0;
  for (let du = -PAD.R; du <= PAD.R; du++) {
    for (let dv = -PAD.R; dv <= PAD.R; dv++) {
      const u = cu + du, v = cv + dv;
      const t = groundTop(planet, f, u, v);
      if (t < 1 || t >= H - 2) return null;
      const b = planet.get(f, u, v, t);
      if (planet.get(f, u, v, t + 1) === BLOCK.WATER || b === BLOCK.WATER) wet++;
      else if (!GROUND_OK.has(b)) wet++;   // ice, a roof, anything unexpected
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t; n++;
    }
  }
  const base = Math.round(sum / n);
  if (base + PAD.HEIGHT + 3 >= H) return null;
  return { base, spread: hi - lo, wet };
}

// cut and fill the footprint to one level, and clear the air above it
function levelPad(planet, f, cu, cv, base, out) {
  const r = PAD.R + PAD.SKIRT;
  for (let du = -r; du <= r; du++) {
    for (let dv = -r; dv <= r; dv++) {
      const u = cu + du, v = cv + dv;
      if (!inFace(u) || !inFace(v)) continue;
      const t = groundTop(planet, f, u, v);
      for (let h = t + 1; h <= base; h++) out(f, u, v, h, BLOCK.COBBLE);
      for (let h = base + 1; h <= base + PAD.CLEAR && h < H; h++)
        out(f, u, v, h, BLOCK.AIR);
    }
  }
}

// facing id for a stair on the rim, pointing away from the pad centre.
// facings are 0..3 = +u, -u, +v, -v (see cubesphere.js).
function outwardFacing(du, dv) {
  if (Math.abs(du) >= Math.abs(dv)) return du > 0 ? 0 : 1;
  return dv > 0 ? 2 : 3;
}

// The face whose middle looks along +Y (north) or -Y (south). Found by asking
// dirFromCell rather than by hardcoding an index, because the face order is
// cubesphere.js's business and this file should not have an opinion on it.
function poleFace(sign) {
  for (let f = 0; f < 6; f++) {
    const d = dirFromCell(f, S / 2, S / 2, [0, 0, 0]);
    if (d[1] * sign > 0.999) return f;
  }
  return null;
}

/**
 * Build a launch pad on the resident planet.
 *
 * Call after `new Planet(seed)` (and after villages) but BEFORE the saved
 * edits are replayed and before the WorldView is created, so a player who
 * mined the pad keeps their change and nothing has to re-mesh.
 *
 * The site is a POLE, not a survey. A monument that moves from world to world
 * is a monument you have to be told the way to; one that always stands on the
 * ice at the top of the planet is somewhere you can set off for the moment you
 * land, and the minimap shows you which way that is without any help. North is
 * preferred and south is the fallback, so a world whose north pole is
 * unbuildable still has exactly one.
 *
 * @returns {object} pad descriptor — position, the cell to stand on, and the
 *   direction the minimap / compass should point at. Never null: if neither
 *   pole surveys, the north pole is forced, because a planet with no way off
 *   it is a dead end.
 */
export function buildLaunchPad(planet, seed = 0, opts = {}) {
  // `seed` and `opts` are kept for main.js's call and for symmetry with the
  // other builders; the site is the pole now, so neither can move it.
  const margin = PAD.R + PAD.SKIRT + 2;
  // S is a multiple of 16, so the pole itself falls on the corner between the
  // four middle cells; this is the one up and right of it, half a block off a
  // nine-block monument.
  const c = Math.max(margin, Math.min(S - margin - 1, S >> 1));

  // Both poles are surveyed and the flatter one wins, rather than north being
  // taken the moment it is buildable. The pad cuts and fills to one level, so
  // a pole with a canyon through it would be levelled with a thirty-block
  // plinth of cobble — buildable, and hideous. The other end of the planet is
  // free and is usually ordinary ground.
  let best = null;
  for (const sign of [1, -1]) {
    const f = poleFace(sign);
    if (f == null) continue;
    const s = surveyPad(planet, f, c, c);
    if (!s) continue;
    const score = s.wet * 8 + s.spread;
    if (!best || score < best.score) best = { f, cu: c, cv: c, ...s, score };
  }

  if (!best) {
    // Neither pole surveyed — a tiny world, or no headroom. Force the north
    // one; levelPad fills whatever is under it.
    const f = poleFace(1) ?? 2;
    const t = groundTop(planet, f, c, c);
    const base = clamp(t < 1 ? 1 : t, 1, H - PAD.HEIGHT - 4);
    best = { f, cu: c, cv: c, base, spread: 0, wet: 0, score: 999 };
  }

  const { f, cu, cv, base } = best;
  const cells = [];
  // one funnel for every write, so the tests can prove nothing lands
  // out of bounds and main.js could log the pad as edits if it wanted to
  const put = (ff, u, v, h, b) => {
    if (h < 0 || h >= H || !inFace(u) || !inFace(v)) return false;
    planet.set(ff, u, v, h, b);
    cells.push([ff, u, v, h, b]);
    return true;
  };

  levelPad(planet, f, cu, cv, base, put);

  const floor = base;
  const top = base + PAD.HEIGHT;

  // --- floor: lens, platform, lantern ring, apron, hazard rim ---------------
  for (let du = -PAD.R; du <= PAD.R; du++) {
    for (let dv = -PAD.R; dv <= PAD.R; dv++) {
      const d = Math.max(Math.abs(du), Math.abs(dv));
      let b;
      if (du === 0 && dv === 0) b = BLOCK.GLASS;          // ignition lens
      else if (d <= PAD.CORE) b = BLOCK.IRON;             // clear platform
      else if (d === PAD.CORE + 1) {
        // lanterns on the four axes of the ring, glass between them, so the
        // pad is a visible ring of light from a long way off at night
        b = (du === 0 || dv === 0) ? BLOCK.LANTERN : BLOCK.GLASS;
      } else if (d === PAD.R) b = ((du + dv) & 1) ? BLOCK.IRON : BLOCK.COBBLE;
      else b = BLOCK.COBBLE;
      put(f, cu + du, cv + dv, floor, b);
    }
  }

  // --- rim kerb: a ring of outward stairs one cell past the apron -----------
  for (let du = -(PAD.R + 1); du <= PAD.R + 1; du++) {
    for (let dv = -(PAD.R + 1); dv <= PAD.R + 1; dv++) {
      if (Math.max(Math.abs(du), Math.abs(dv)) !== PAD.R + 1) continue;
      put(f, cu + du, cv + dv, floor,
        stairId(BLOCK.COBBLE, outwardFacing(du, dv)));
    }
  }

  // --- four masts, their lanterns, and the top ring -------------------------
  const M = PAD.MAST;
  for (const du of [-M, M]) {
    for (const dv of [-M, M]) {
      for (let h = floor + 1; h < top; h++) put(f, cu + du, cv + dv, h, BLOCK.IRON);
      put(f, cu + du, cv + dv, top, BLOCK.LANTERN);
      // gantry arm: two cells inward along the diagonal, just under the top,
      // so the frame leans over the platform without ever entering it
      for (let k = 1; k <= 2; k++) {
        put(f, cu + du - Math.sign(du) * k, cv + dv - Math.sign(dv) * k,
          top - 1, BLOCK.IRON);
      }
    }
  }
  for (let du = -M; du <= M; du++) {
    for (let dv = -M; dv <= M; dv++) {
      if (Math.max(Math.abs(du), Math.abs(dv)) !== M) continue;
      if (Math.abs(du) === M && Math.abs(dv) === M) continue;   // mast tops
      put(f, cu + du, cv + dv, top, BLOCK.IRON);
      // blast screens: the middle three cells of each side, two courses high.
      // The diagonals stay open, so you walk in at the corners.
      if (Math.abs(du) <= 1 || Math.abs(dv) <= 1) {
        put(f, cu + du, cv + dv, floor + 1, BLOCK.GLASS);
        put(f, cu + du, cv + dv, floor + 2, BLOCK.GLASS);
      }
    }
  }

  // --- make sure the launch column is genuinely empty -----------------------
  // levelPad already cleared it, but the masts and arms are written after, so
  // assert the core one more time. Standing here must never be blocked.
  for (let du = -PAD.CORE; du <= PAD.CORE; du++)
    for (let dv = -PAD.CORE; dv <= PAD.CORE; dv++)
      for (let h = floor + 1; h <= floor + PAD.CLEAR && h < H; h++)
        put(f, cu + du, cv + dv, h, BLOCK.AIR);

  const d = dirFromCell(f, cu + 0.5, cv + 0.5, [0, 0, 0]);
  const standRadius = R0 + floor + 1;
  return {
    f, u: cu, v: cv,
    base: floor,
    h: floor + 1,
    cell: { f, u: cu, v: cv, h: floor + 1 },
    dir: [d[0], d[1], d[2]],
    pos: [d[0] * standRadius, d[1] * standRadius, d[2] * standRadius],
    standRadius,
    radiusCells: PAD.R,
    cellsWritten: cells.length,
    // handy for tests and for a "pad rebuilt" log line
    cells,
  };
}

// world-space distance from a point to the pad's stand position
export function distanceToPad(pad, pos) {
  if (!pad) return Infinity;
  const [x, y, z] = pad.pos;
  return Math.hypot(pos.x - x, pos.y - y, pos.z - z);
}

// Are we close enough to use it? Generous: the whole platform counts, and a
// little slack so a player on the lantern ring is not told to shuffle.
export function onPad(pad, pos, slack = 4.5) {
  return distanceToPad(pad, pos) <= PAD.CORE + slack;
}

// Compass bearing to the pad in degrees, 0 = straight ahead, +90 = right.
// main.js can drop this straight into the HUD next to the minimap.
export function bearingToPad(pad, pos, forward, up) {
  if (!pad) return null;
  const p = new THREE.Vector3(pos.x, pos.y, pos.z);
  const target = new THREE.Vector3(...pad.pos);
  const u = new THREE.Vector3(up.x, up.y, up.z).normalize();
  const to = target.sub(p);
  to.addScaledVector(u, -to.dot(u));           // project onto the local plane
  if (to.lengthSq() < 1e-9) return 0;
  to.normalize();
  const fwd = new THREE.Vector3(forward.x, forward.y, forward.z);
  fwd.addScaledVector(u, -fwd.dot(u)).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, u);
  return Math.atan2(to.dot(right), to.dot(fwd)) * 180 / Math.PI;
}

// ---- the flight timeline ---------------------------------------------------
//
// Pure data and pure functions, so the whole sequence can be stepped in node
// without a renderer. Durations are seconds of real time.

export const PHASE_ORDER = [
  'countdown', 'liftoff', 'ascent', 'cruise', 'approach', 'descent',
  'touchdown',
];

export function makePlan(from, to, days = 0) {
  const dist = separation(from, to, days);
  // cruise carries the sense of distance; everything else is fixed so the
  // set-piece has the same rhythm to every world
  const cruise = clamp(2.6 + 2.6 * dist, 3, 11);
  const durations = {
    countdown: 3.0, liftoff: 3.2, ascent: 3.4, cruise,
    approach: 3.4, descent: 4.4, touchdown: 1.6,
  };
  const phases = PHASE_ORDER.map((key) => ({ key, dur: durations[key] }));
  let acc = 0;
  for (const p of phases) { p.start = acc; acc += p.dur; p.end = acc; }
  const swapAt = phases.find((p) => p.key === 'approach').end;
  return { phases, total: acc, swapAt, distance: dist, from, to };
}

// Where are we at time t? Always returns a phase, and `done` past the end,
// so stepping from any start reaches the same terminal state.
export function timelineAt(t, plan) {
  const { phases, total } = plan;
  if (!(t >= 0)) t = 0;
  if (t >= total) {
    const last = phases[phases.length - 1];
    return { key: 'done', i: phases.length, p: 1, tp: last.dur, t: total,
      done: true, swapped: true };
  }
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (t < ph.end) {
      return {
        key: ph.key, i, tp: t - ph.start, p: (t - ph.start) / ph.dur, t,
        done: false, swapped: t >= plan.swapAt,
      };
    }
  }
  // unreachable given the guard above, but never return undefined
  return { key: 'done', i: phases.length, p: 1, tp: 0, t, done: true,
    swapped: true };
}

// how hard the stars streak, 0..1
export function streakAt(st) {
  switch (st.key) {
    case 'countdown': return 0;
    case 'liftoff': return 0.35 * easeIn(st.p);
    case 'ascent': return lerp(0.35, 0.85, smooth(st.p));
    case 'cruise': return 1;
    case 'approach': return lerp(1, 0.25, smooth(st.p));
    case 'descent': return lerp(0.35, 0, smooth(st.p));
    default: return 0;
  }
}

// Rider radius as a fraction of the relevant planet radius. Before the swap
// that is the departure planet, after it the arrival planet — which is why
// the caller passes both.
export function riderRadius(st, standR, Rdep, standR2, Rarr) {
  switch (st.key) {
    case 'countdown': return standR;
    case 'liftoff': return lerp(standR, Rdep * 2.2, easeIn(st.p));
    case 'ascent': return lerp(Rdep * 2.2, Rdep * 8, easeIn(st.p));
    case 'cruise': case 'approach': return Rdep * 8;
    case 'descent': return lerp(Rarr * 4, standR2, easeOut(st.p));
    case 'touchdown': default: return standR2;
  }
}

// ---- the Travel controller -------------------------------------------------

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _look = new THREE.Vector3();

export class Travel {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {THREE.Camera} o.camera
   * @param {object} o.player            player.js instance
   * @param {function} o.onSwap          (dest) => { pad } — unload + buildWorld
   * @param {function} [o.getPlanetId]   () => id of the resident planet
   * @param {function} [o.getEdits]      () => main.js's edits Map
   * @param {function} [o.setWorldVisible] (bool) — hide the world during cruise
   * @param {function} [o.onHud]         (title, sub) — big centred caption
   * @param {function} [o.onSound]       (name, opts)
   * @param {function} [o.onArrive]      (dest, pad) — after control is back
   */
  constructor(o = {}) {
    this.scene = o.scene ?? null;
    this.camera = o.camera ?? null;
    this.player = o.player ?? null;
    this.onSwap = o.onSwap ?? (() => ({}));
    this.getPlanetId = o.getPlanetId ?? (() => null);
    this.getEdits = o.getEdits ?? (() => null);
    this.setWorldVisible = o.setWorldVisible ?? (() => {});
    this.onHud = o.onHud ?? (() => {});
    this.onSound = o.onSound ?? (() => {});
    this.onArrive = o.onArrive ?? (() => {});
    // fires whenever the chooser goes away, launched or cancelled — main.js
    // uses it to drop the flag that stops a released pointer lock kicking
    // you back to orbit
    this.onChooserClose = o.onChooserClose ?? (() => {});
    this.onError = o.onError ?? ((e) => console.warn('[travel]', e));

    this.system = o.system ?? null;   // set by loadSystem(); may arrive later
    this.pad = null;
    this.active = false;
    this.phase = null;
    this.t = 0;
    this.plan = null;
    this.dest = null;
    this.ui = null;
    this._fx = null;
    this._swapped = false;
    this._saved = null;
    this._onKey = this._onKey.bind(this);

    // resolve the system in the background; the chooser waits on it
    loadSystem().then((s) => { this.system = this.system ?? s; });
  }

  // --- wiring -------------------------------------------------------------

  // main.js calls this after every buildWorld with the pad it just built
  setPad(pad) { this.pad = pad ?? null; return pad; }

  setPlanet(id) { this._planetId = id; }

  currentId() { return this._planetId ?? this.getPlanetId() ?? null; }

  canLaunch(pos) {
    return !this.active && !!this.pad && onPad(this.pad, pos);
  }

  // --- the chooser --------------------------------------------------------

  /** Open the destination chooser. Safe to call any time; a no-op mid-flight. */
  async activate() {
    if (this.active) return false;
    const system = this.system ?? await loadSystem();
    this.system = system;
    if (!this.ui) {
      // lazily imported so a broken UI cannot stop the pad from existing
      try {
        const m = await import('./travelui.js');
        this.ui = new m.TravelUI({
          system,
          onLaunch: (dest) => this.begin(dest),
          onCancel: () => { try { this.onChooserClose(); } catch {} },
        });
      } catch (e) {
        this.onError(e);
        return false;
      }
    }
    this.ui.setSystem(system);
    this.ui.open({ currentId: this.currentId() });
    return true;
  }

  isChooserOpen() { return !!this.ui?.isOpen?.(); }

  closeChooser() { this.ui?.close?.(); }

  // --- the flight ---------------------------------------------------------

  /** Start the launch sequence toward `dest` (a normalised planet). */
  begin(dest) {
    if (this.active || !dest) return false;
    const from = this.system?.byId?.(this.currentId()) ?? null;
    if (from && dest.id === from.id) { this.onHud('you are already here'); return false; }
    try {
      this.ui?.close?.();
      this.dest = dest;
      this.plan = makePlan(from, dest, 0);
      this.t = 0;
      this._swapped = false;
      this.active = true;
      this.phase = 'countdown';
      this._takeControl();
      this._buildFx();
      this.onSound('launch_countdown');
      DOC?.addEventListener('keydown', this._onKey, true);
      return true;
    } catch (e) {
      this.onError(e);
      this._finish(true);
      return false;
    }
  }

  /** Jump to the end: swap if needed, land, hand control back. */
  skip() {
    if (!this.active) return;
    try {
      if (!this._swapped) this._doSwap();
      this.t = this.plan.total;
      this._finish(false);
    } catch (e) {
      this.onError(e);
      this._finish(true);
    }
  }

  /**
   * Bail out. Before the swap this puts you back on the pad you left; after
   * it, you land on the new world — there is no way back, the old one is
   * gone. Either way control is always restored.
   */
  abort() {
    if (!this.active) return;
    if (this._swapped) return this.skip();
    try { this._finish(false); } catch (e) { this.onError(e); this._finish(true); }
  }

  /**
   * Drive one frame. main.js calls this INSTEAD of the player/entity update
   * while `travel.active` is true.
   */
  update(dt) {
    if (!this.active) return;
    try {
      this.t += Math.min(dt, 0.1);   // a tab that was backgrounded must not skip
      const st = timelineAt(this.t, this.plan);
      this.phase = st.key;

      if (!this._swapped && this.t >= this.plan.swapAt) this._doSwap();
      this._caption(st);
      this._pose(st);
      this._updateFx(st);

      if (st.done) this._finish(false);
    } catch (e) {
      // never leave the player stuck: any throw lands them and returns control
      this.onError(e);
      this._finish(true);
    }
  }

  // --- internals ----------------------------------------------------------

  _onKey(e) {
    if (!this.active) return;
    if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();   // Escape must not also drop main.js to orbit
      this.skip();
    }
  }

  _takeControl() {
    const p = this.player, cam = this.camera;
    this._saved = {
      viewDist: p?.viewDist ?? 0,
      fov: cam?.fov ?? 75,
      up: cam ? cam.up.clone() : null,
      avatar: p?.avatar?.visible ?? true,
      head: p?.head?.visible ?? true,
      arm: p?.viewArm?.visible ?? false,
    };
    if (!p) return;
    p.keys?.clear?.();
    p.vel?.set?.(0, 0, 0);
    p.radialVel = 0;
    // third person for the whole sequence: you should see yourself go up
    if (p.avatar) p.avatar.visible = true;
    if (p.head) p.head.visible = true;
    if (p.viewArm) p.viewArm.visible = false;
    // the rider starts where the player is, snapped onto the pad
    this._up = new THREE.Vector3();
    if (this.pad) this._up.set(...this.pad.dir).normalize();
    else this._up.copy(p.pos).normalize();
    this._standR = this.pad?.standRadius ?? p.pos.length();
    this._Rdep = R || this._standR;
    // a stable tangent basis for the camera; recomputing it per frame would
    // let the shot spin as the rider's own basis drifts
    this._tanA = new THREE.Vector3(0, 1, 0);
    if (Math.abs(this._up.y) > 0.9) this._tanA.set(1, 0, 0);
    this._tanA.addScaledVector(this._up, -this._tanA.dot(this._up)).normalize();
    this._tanB = new THREE.Vector3().crossVectors(this._up, this._tanA);
    this._rider = this._up.clone().multiplyScalar(this._standR);
    // the roll the cruise ends on, so approach can unwind exactly that much
    this._cruiseRoll =
      (this.plan?.phases.find((p) => p.key === 'cruise')?.dur ?? 0) * 0.12;
    // arrival basis is only known after the swap
    this._arrUp = this._up.clone();
    this._arrStandR = this._standR;
    this._Rarr = this._Rdep;
  }

  _doSwap() {
    this._swapped = true;
    const dest = this.dest;
    // stash what the player built here before the world is thrown away
    try {
      stashEdits(this.currentId(), this.getEdits());
    } catch (e) { this.onError(e); }

    this.setWorldVisible(true);
    let res = null;
    try {
      res = this.onSwap(dest) ?? null;
    } catch (e) {
      // the world may be half built; there is nothing sane to fall back to
      // except landing the player wherever they now are
      this.onError(e);
    }
    const pad = res?.pad ?? this.pad ?? null;
    this.setPad(pad);
    this.setPlanet(dest.id);

    // rebuild the arrival basis from the new world's own R / R0
    this._Rarr = R || dest.radius;
    if (pad) {
      this._arrUp = new THREE.Vector3(...pad.dir).normalize();
      this._arrStandR = pad.standRadius;
    } else {
      this._arrUp = this._up.clone();
      this._arrStandR = (R0 || 1) + Math.round((R || dest.radius) * 0.08);
    }
    this._arrTanA = new THREE.Vector3(0, 1, 0);
    if (Math.abs(this._arrUp.y) > 0.9) this._arrTanA.set(1, 0, 0);
    this._arrTanA.addScaledVector(this._arrUp, -this._arrTanA.dot(this._arrUp))
      .normalize();
    this.onSound('launch_arrive');
  }

  _caption(st) {
    if (st.key === 'countdown') {
      const left = Math.ceil(this.plan.phases[0].dur - st.tp);
      if (left !== this._lastCount) {
        this._lastCount = left;
        this.onSound('launch_beep');
      }
      this.onHud(String(left), `launching for ${this.dest.name} — esc to skip`);
    } else if (st.key === 'liftoff' && this._lastCount !== 0) {
      this._lastCount = 0;
      this.onHud('lift off', this.dest.name);
      this.onSound('launch_ignite');
    } else if (st.key === 'cruise') {
      this.onHud('', `en route to ${this.dest.name} — esc to skip`);
    } else if (st.key === 'descent') {
      this.onHud('', `entering ${this.dest.name}`);
    } else if (st.key === 'touchdown') {
      this.onHud('', `welcome to ${this.dest.name}`);
    } else {
      this.onHud('', '');
    }
  }

  // camera and rider placement for one frame
  _pose(st) {
    const cam = this.camera;
    const up = st.swapped ? this._arrUp : this._up;
    const tanA = st.swapped ? (this._arrTanA ?? this._tanA) : this._tanA;
    const r = riderRadius(st, this._standR, this._Rdep, this._arrStandR,
      this._Rarr);
    this._rider.copy(up).multiplyScalar(r);

    // keep the avatar on the rocket, and keep world streaming centred on it
    const p = this.player;
    if (p) {
      p.pos.copy(this._rider);
      if (p.avatar) {
        p.avatar.position.copy(this._rider);
        // stand upright along the local up all the way through
        p.avatar.quaternion.setFromUnitVectors(_v.set(0, 1, 0), up);
      }
      p.up.copy(up);
    }
    if (!cam) return;

    cam.up.copy(up);
    const scale = Math.max(6, this._Rdep * 0.05);
    switch (st.key) {
      case 'countdown': {
        // slow orbit around the pad, looking slightly up at the rider
        const a = st.tp * 0.35;
        _v.copy(tanA).multiplyScalar(Math.cos(a) * scale * 2.2)
          .addScaledVector(this._tanB, Math.sin(a) * scale * 2.2)
          .addScaledVector(up, this._standR + scale * 0.9);
        cam.position.copy(_v);
        _look.copy(this._rider).addScaledVector(up, 1.4);
        break;
      }
      case 'liftoff': {
        // first a ground cam tilting up, then a chase from above so the pad
        // and then the whole planet visibly drop away underneath
        const gp = clamp(st.p / 0.35, 0, 1);
        _v.copy(tanA).multiplyScalar(scale * 2.2)
          .addScaledVector(up, this._standR + scale * 0.9);
        _v2.copy(this._rider).addScaledVector(up, scale * 1.1)
          .addScaledVector(tanA, -scale * 0.6);
        cam.position.copy(_v).lerp(_v2, smooth(gp));
        _look.copy(this._rider).lerp(
          _v2.copy(up).multiplyScalar(this._standR), smooth(gp) * 0.55);
        break;
      }
      case 'ascent': {
        // swing round to the side: the limb of the planet comes into frame
        const a = 0.6 + st.p * 1.5;
        const back = lerp(scale * 1.3, scale * 3.0, st.p);
        cam.position.copy(this._rider)
          .addScaledVector(tanA, Math.cos(a) * back)
          .addScaledVector(this._tanB, Math.sin(a) * back)
          .addScaledVector(up, -back * 0.35);
        _look.copy(this._rider);
        break;
      }
      case 'cruise': {
        // Two shots, cut not blended. First from ahead of the rider looking
        // back, so you watch the world you left shrink to nothing — that is
        // what the departure proxy is for, and it covers the frame where the
        // real world is switched off. Then a cut to the forward shot.
        const back = scale * 2.4;
        if (st.p < 0.4) {
          cam.position.copy(this._rider).addScaledVector(up, back * 1.2)
            .addScaledVector(tanA, scale * 0.8);
          _look.set(0, 0, 0);
        } else {
          cam.position.copy(this._rider).addScaledVector(up, -back)
            .addScaledVector(tanA, scale * 0.35);
          _look.copy(this._rider).addScaledVector(up, this._Rdep * 8);
        }
        const roll = st.tp * 0.12;
        cam.up.copy(tanA).multiplyScalar(Math.cos(roll))
          .addScaledVector(this._tanB, Math.sin(roll));
        break;
      }
      case 'approach': {
        // held on the destination, easing the roll back to level so the cut
        // to the real world at the end of this phase is not also a cut in
        // orientation
        const back = scale * 2.4;
        cam.position.copy(this._rider).addScaledVector(up, -back)
          .addScaledVector(tanA, scale * 0.35);
        _look.copy(this._rider).addScaledVector(up, this._Rdep * 8);
        const roll = this._cruiseRoll * (1 - smooth(st.p));
        cam.up.copy(tanA).multiplyScalar(Math.cos(roll))
          .addScaledVector(this._tanB, Math.sin(roll));
        break;
      }
      case 'descent': {
        // above and behind, looking down the way we are falling, so the pad
        // grows in the middle of the frame
        const back = Math.max(8, this._Rarr * 0.05) * lerp(3.0, 1.2, st.p);
        cam.position.copy(this._rider).addScaledVector(up, back * 0.9)
          .addScaledVector(tanA, back * 0.8);
        _look.copy(up).multiplyScalar(this._arrStandR);
        break;
      }
      case 'touchdown':
      default: {
        // ease into something close to the third-person camera main.js will
        // take back over with, so the hand-off does not jump
        const back = Math.max(8, this._Rarr * 0.05);
        _v.copy(this._rider).addScaledVector(up, back * 0.9)
          .addScaledVector(tanA, back * 0.8);
        _v2.copy(this._rider).addScaledVector(up, 2.2)
          .addScaledVector(tanA, 4.5);
        cam.position.copy(_v).lerp(_v2, smooth(st.p));
        _look.copy(this._rider).addScaledVector(up, 1.6);
        break;
      }
    }
    cam.lookAt(_look);
  }

  // --- effects ------------------------------------------------------------

  _buildFx() {
    if (!this.scene) return;
    if (this._fx) { this._fx.group.visible = true; return; }
    const N = 900;
    const base = new Float32Array(N * 3);
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      // a shell around the camera: close enough to streak, far enough that
      // the near plane never clips one
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1;
      let z = Math.random() * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      const d = 30 + Math.random() * 140;
      base[i * 3] = x / len * d;
      base[i * 3 + 1] = y / len * d;
      base[i * 3 + 2] = z / len * d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xdce8ff, transparent: true, opacity: 0, fog: false,
      depthWrite: false,
    });
    const streaks = new THREE.LineSegments(geo, mat);
    streaks.frustumCulled = false;   // the group rides the camera
    streaks.renderOrder = -1;

    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const depMat = new THREE.MeshBasicMaterial({ color: 0x6aa06a, fog: false });
    const arrMat = new THREE.MeshBasicMaterial({ color: 0x8fa4c8, fog: false });
    const depart = new THREE.Mesh(sphere, depMat);
    const arrive = new THREE.Mesh(sphere, arrMat);
    depart.visible = arrive.visible = false;
    depart.frustumCulled = arrive.frustumCulled = false;

    const group = new THREE.Group();
    group.add(streaks);
    this.scene.add(group);
    this.scene.add(depart);
    this.scene.add(arrive);
    this._fx = { group, streaks, base, pos, mat, depart, arrive, depMat, arrMat };
  }

  _updateFx(st) {
    const fx = this._fx;
    if (!fx || !this.camera) return;
    const k = streakAt(st);
    fx.mat.opacity = k * 0.9;
    fx.group.visible = k > 0.01;
    fx.group.position.copy(this.camera.position);

    if (fx.group.visible) {
      // Rewrite the tail of every segment: cheap (5.4k floats) and it lets
      // the streak direction flip between climb and fall without rebuilding.
      // `dir` is the direction of travel; the tail trails the other way, so
      // falling has to negate the local up.
      const dir = st.key === 'descent'
        ? _v.copy(this._arrUp).multiplyScalar(-1) : _v.copy(this._up);
      const L = 2 + k * k * 60;
      const { base, pos } = fx;
      for (let i = 0, n = base.length / 3; i < n; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x - dir.x * L;
        pos[i * 6 + 4] = y - dir.y * L;
        pos[i * 6 + 5] = z - dir.z * L;
      }
      fx.streaks.geometry.attributes.position.needsUpdate = true;
    }

    // The world is hidden for the cruise only. Two proxy spheres cover it:
    // the one you left shrinking behind, and the target growing ahead. The
    // target stops at D/4 so its apparent size exactly matches the real
    // planet seen from 4R at the swap — that is what makes the cut invisible.
    const inSpace = st.key === 'cruise' || st.key === 'approach';
    this.setWorldVisible(!inSpace);
    const D = this._Rdep * 8;
    if (inSpace) {
      // the departure world only has to last as long as the backward shot
      fx.depart.visible = st.key === 'cruise' && st.p < 0.45;
      if (fx.depart.visible) {
        fx.depart.position.set(0, 0, 0);
        fx.depart.scale.setScalar(this._Rdep * (1 - smooth(st.p / 0.45)));
      }
      const grow = st.key === 'cruise' ? clamp((st.p - 0.4) / 0.6, 0, 1) * 0.55
        : lerp(0.55, 1, smooth(st.p));
      fx.arrive.visible = grow > 0.001;
      fx.arrive.position.copy(this._rider).addScaledVector(this._up, D);
      fx.arrive.scale.setScalar(D * 0.25 * grow);
      if (this.dest?.color) fx.arrMat.color.set(this.dest.color);
      const from = this.system?.byId?.(this.currentId());
      if (from?.color) fx.depMat.color.set(from.color);
    } else {
      fx.depart.visible = false;
      fx.arrive.visible = false;
    }
  }

  _disposeFx() {
    const fx = this._fx;
    if (!fx || !this.scene) return;
    fx.group.visible = false;
    fx.depart.visible = false;
    fx.arrive.visible = false;
  }

  // --- landing and hand-off -----------------------------------------------

  _finish(errored) {
    if (!this.active) return;
    this.active = false;
    this.phase = null;
    try { DOC?.removeEventListener('keydown', this._onKey, true); } catch {}
    try { this._disposeFx(); } catch {}
    try { this.setWorldVisible(true); } catch {}

    const p = this.player, cam = this.camera, s = this._saved ?? {};
    try {
      if (cam) {
        if (s.up) cam.up.copy(s.up); else cam.up.set(0, 1, 0);
        cam.fov = s.fov ?? 75;
        cam.updateProjectionMatrix();
      }
      if (p) {
        const up = this._arrUp ?? p.pos.clone().normalize();
        // spawn() re-derives the whole body frame from the ground under the
        // direction, which is the only way to land safely on a world whose
        // R0/H changed under us
        p.spawn(up.clone());
        if (this.pad) {
          p.pos.set(...this.pad.pos);
          p.up.copy(up);
          p.refreshBasis();
        }
        p.vel.set(0, 0, 0);
        p.radialVel = 0;
        p.keys?.clear?.();
        p.setView?.(s.viewDist ?? 0);
        p.syncCamera?.();
      }
    } catch (e) {
      this.onError(e);
    }
    this.onHud('', errored ? 'the flight was cut short — you are on the ground'
      : '');
    try { this.onArrive(this.dest, this.pad); } catch (e) { this.onError(e); }
  }

  /**
   * Go straight there — no countdown, no launch, no flight.
   *
   * The cinematic is worth watching once and is in the way every time after
   * that, so picking a world off the orbit map just puts you on it. This
   * deliberately reuses _doSwap and the same landing code the flight ends
   * with rather than reimplementing either: the stashing of what you built
   * on the world you are leaving, and the respawn against a world whose
   * R0/H changed under you, are exactly the parts that must not be skipped.
   */
  jumpTo(dest) {
    if (!dest || this.active) return false;
    this.dest = dest;
    this._swapped = false;
    this._saved = null;                 // nothing was overridden to restore
    try {
      this._doSwap();
    } catch (e) { this.onError(e); return false; }

    const p = this.player;
    try {
      if (p) {
        const up = this._arrUp ?? p.pos.clone().normalize();
        p.spawn(up.clone());
        if (this.pad) {
          p.pos.set(...this.pad.pos);
          p.up.copy(up);
          p.refreshBasis();
        }
        p.vel.set(0, 0, 0);
        p.radialVel = 0;
        p.keys?.clear?.();
        p.syncCamera?.();
      }
    } catch (e) { this.onError(e); }

    try { this.onArrive(dest, this.pad); } catch (e) { this.onError(e); }
    return true;
  }

  /** Tear everything down (only needed if main.js ever rebuilds the scene). */
  destroy() {
    if (this.active) this._finish(true);
    this.ui?.destroy?.();
    this.ui = null;
    const fx = this._fx;
    if (fx && this.scene) {
      this.scene.remove(fx.group);
      this.scene.remove(fx.depart);
      this.scene.remove(fx.arrive);
      fx.streaks.geometry.dispose();
      fx.mat.dispose();
      fx.depart.geometry.dispose();
      fx.depMat.dispose();
      fx.arrMat.dispose();
    }
    this._fx = null;
  }
}
