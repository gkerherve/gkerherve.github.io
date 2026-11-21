// weather.js — the storm: rain, overcast, lightning and thunder.
//
// Rain on a globe has the same problem clouds do (see sky.js): there is no
// "down" to point a particle system at, and a plane of falling quads is only
// correct for the one spot it was built over. So rain is not a field over the
// world at all — it is a COLUMN OF DROPS AROUND THE PLAYER, ~40 blocks across,
// that travels with them. Every drop falls along its own radius, which is the
// local up wherever it happens to be, so the rain stays vertical all the way
// round the planet and nothing has to be rebuilt when you walk.
//
// That also caps the cost dead: the storm covers a whole world but only ever
// pays for the drops you could actually see. One InstancedMesh, one matrix per
// drop per frame, no allocation after construction.
//
// Two things the storm hands back to main.js rather than doing itself, because
// they belong to the renderer's own sky code and would fight it from here:
//
//   `flash`     0..1, the lightning's contribution to the sky and the ground
//               brightness this frame,
//   `gloom`     0..1, how much of the daylight the cloud deck eats.
//
// Thunder is delayed behind its flash by the distance the strike was drawn at,
// divided by the speed of sound in blocks per second. It is the one piece of
// physics in the file and it is worth it: a bolt that cracks a second and a
// half after it lights the ground is what makes the storm feel large.

import * as THREE from 'three';
import { R, AMP } from './cubesphere.js';

export const STORM_TUNING = {
  drops: 1500,        // rain drops alive at once
  radius: 34,         // blocks of ground the rain column covers
  top: 30,            // blocks above the player the drops start from
  fall: 34,           // blocks/second — heavy rain, not drizzle
  slant: 0.22,        // sideways drift as a fraction of the fall speed
  length: 1.5,        // a drop is a streak this many blocks long
  width: 0.055,
  colour: 0xa8c4dc,
  opacity: 0.5,
  splashes: 90,       // ground splashes alive at once
  splashLife: 0.35,
  strikes: 5,         // lightning strikes a minute
  boltLife: 0.16,     // seconds the bolt itself is drawn for
  flashLife: 0.42,    // seconds the sky stays lit
  sound: 331,         // blocks a second, for the thunder delay
  gloom: 0.55,        // fraction of the daylight the cloud deck eats
  // --- where it is actually raining ----------------------------------------
  //
  // A storm used to be a property of the WORLD: switch it on and it rained on
  // every square of the planet at once, for ever, and there was no such thing
  // as walking out of it. That is a filter over the game, not weather.
  //
  // So the rain lives in a handful of CELLS — patches of sky that drift over
  // the surface and carry their downpour with them. Inside one it rains and
  // the light goes out of the day; outside it does not, and the edge is a
  // thing you can walk across. The rain column still follows the player, for
  // the reason at the top of this file, but now its strength is how far
  // inside a cell they are.
  cells: 5,           // patches of rain over the whole globe
  cellArc: 0.30,      // radians of surface each one covers — about a fifth of
                      // the way to the horizon on a small world
  cellEdge: 0.35,     // the outer fraction of that is the soft edge
  cellDrift: 0.011,   // radians a second the patch moves over the ground
};

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _sq = new THREE.Quaternion();      // splashes: their own, per-splash
const _zAxis = new THREE.Vector3(0, 0, 1);
const _basis = new THREE.Matrix4();
const _inst = new THREE.Matrix4();

function tangentBasis(up, t1, t2) {
  if (Math.abs(up.x) < 0.9) _ax.set(1, 0, 0);
  else _ax.set(0, 1, 0);
  t1.crossVectors(_ax, up).normalize();
  t2.crossVectors(t1, up);
}

/**
 * Build a storm around `planet` and add it to `scene`.
 *
 *   const storm = createWeather(scene, planet, preset.weather);
 *   ... every frame:  storm.update(dt, { pos: player.pos, playing, daylight });
 *   storm.flash        // 0..1, add to your sky brightness
 *   storm.dispose();
 *
 * `opts` is the preset's own `weather` block: { rain, thunder, overcast }.
 * rain and overcast are 0..1 multipliers; thunder is strikes a minute.
 */
export function createWeather(scene, planet, opts = {}) {
  const T = STORM_TUNING;
  const rain = opts.rain ?? 1;
  const strikes = opts.thunder ?? T.strikes;
  const overcast = opts.overcast ?? 0.9;
  const group = new THREE.Group();
  group.frustumCulled = false;

  // --- rain ----------------------------------------------------------------
  const n = Math.max(0, Math.round(T.drops * rain));
  const dropGeo = new THREE.BoxGeometry(T.width, T.length, T.width);
  const dropMat = new THREE.MeshBasicMaterial({
    color: T.colour, transparent: true, opacity: T.opacity,
    depthWrite: false, fog: false,
  });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, Math.max(1, n));
  drops.frustumCulled = false;      // it wraps the camera; culling can only lie
  drops.count = n;
  group.add(drops);

  // one record per drop: where it is in the tangent frame it was born in, how
  // far it still has to fall, and the ground under it (sampled once at birth,
  // not every frame — that lookup is the only expensive thing here)
  const dy = new Float32Array(n), dg = new Float32Array(n);
  const dv = new Float32Array(n);                 // per-drop fall speed
  const ddir = new Float32Array(n * 3);

  // `invR` turns blocks of ground distance into the tangent offset a UNIT
  // direction takes: the frame vectors are unit vectors, so adding whole
  // blocks to one of them would scatter the rain over a quarter of the planet.
  function respawn(i, centre, t1, t2, fresh, invR) {
    // uniform over a disc: sqrt keeps the middle from being a downpour and
    // the rim a drizzle
    const a = Math.random() * 6.283;
    const rr = Math.sqrt(Math.random()) * T.radius;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    _dir.copy(centre).addScaledVector(t1, x * invR)
      .addScaledVector(t2, z * invR).normalize();
    ddir[i * 3] = _dir.x; ddir[i * 3 + 1] = _dir.y; ddir[i * 3 + 2] = _dir.z;
    dg[i] = planet
      ? planet.surfaceRadiusAtDir(_dir.x, _dir.y, _dir.z) : R;
    // `fresh` fills the column on the first frame instead of dropping the
    // whole sky in one sheet a second after you arrive
    dy[i] = fresh ? Math.random() * T.top : T.top * (0.85 + Math.random() * 0.3);
    dv[i] = T.fall * (0.85 + Math.random() * 0.35);
  }

  // --- splashes ------------------------------------------------------------
  // A flat cross of two quads at ground level, popped where a drop lands. Rain
  // you cannot see arrive reads as falling past the world rather than onto it.
  const sn = Math.max(0, Math.round(T.splashes * rain));
  const splashGeo = new THREE.PlaneGeometry(0.5, 0.5);
  splashGeo.rotateX(-Math.PI / 2);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xcfe2f2, transparent: true, opacity: 0.45,
    depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const splashes = new THREE.InstancedMesh(splashGeo, splashMat,
    Math.max(1, sn));
  splashes.frustumCulled = false;
  splashes.count = sn;
  group.add(splashes);
  const sLife = new Float32Array(sn);
  const sDir = new Float32Array(sn * 3);
  const sRad = new Float32Array(sn);
  let sNext = 0;

  // --- lightning -----------------------------------------------------------
  // The bolt is a polyline from the cloud deck to the ground, redrawn from
  // scratch on every strike: a stored zigzag repeats and the eye catches it.
  const BOLT_SEGS = 14;
  const boltPos = new Float32Array((BOLT_SEGS + 1) * 3);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const boltMat = new THREE.LineBasicMaterial({
    color: 0xdfe9ff, transparent: true, opacity: 0, fog: false,
    depthWrite: false,
  });
  const bolt = new THREE.Line(boltGeo, boltMat);
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);

  scene.add(group);

  let started = false;
  let nextStrike = 2 + Math.random() * 4;
  const cloudTop = Math.max(30, AMP * 1.35 + 26);

  function strike(centre, t1, t2, invR, onSound) {
    // 40 to 190 blocks out: close enough that the bolt is worth looking at,
    // far enough that the thunder has a delay to have
    const a = Math.random() * 6.283;
    const dist = 40 + Math.random() * 150;
    _dir.copy(centre)
      .addScaledVector(t1, Math.cos(a) * dist * invR)
      .addScaledVector(t2, Math.sin(a) * dist * invR).normalize();
    const ground = planet
      ? planet.surfaceRadiusAtDir(_dir.x, _dir.y, _dir.z) : R;
    tangentBasis(_dir, _t1, _t2);
    const top = ground + cloudTop + 40;
    for (let i = 0; i <= BOLT_SEGS; i++) {
      const t = i / BOLT_SEGS;
      // the jag dies out at both ends, so the bolt leaves the cloud and meets
      // the ground cleanly instead of ending in a kink
      const wobble = Math.sin(t * Math.PI) * 7;
      const rad = top + (ground - top) * t;
      _pos.copy(_dir).multiplyScalar(rad)
        .addScaledVector(_t1, (Math.random() - 0.5) * wobble)
        .addScaledVector(_t2, (Math.random() - 0.5) * wobble);
      boltPos[i * 3] = _pos.x;
      boltPos[i * 3 + 1] = _pos.y;
      boltPos[i * 3 + 2] = _pos.z;
    }
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.computeBoundingSphere();
    handle.boltT = T.boltLife;
    handle.flashT = T.flashLife;
    // near strikes are brighter and crack sooner; both come from the one
    // distance, so they always agree
    handle.flashPeak = THREE.MathUtils.clamp(1.15 - dist / 260, 0.3, 1);
    onSound?.('thunder', {
      delay: dist / T.sound,
      gain: THREE.MathUtils.clamp(1.2 - dist / 300, 0.25, 1),
      dist: 0,
    });
  }

  // The drifting patches. Each is a direction on the sphere and an axis it
  // turns about, so it walks a great circle at a steady rate and comes back
  // round — no edges to fall off and nothing to respawn.
  // EVERY world's rain is local now, the Tempest's included: a planet set to
  // rain constantly was the one thing the player asked the weather to stop
  // doing. What makes a storm world a storm world is the dial, not a flag —
  // more cells, bigger cells, so the dry gaps are the exception — and the
  // preset says so through opts.cells / opts.cellArc.
  // `everywhere` used to mean the whole planet was one storm with no way
  // out from under it. Nothing asks for that any more, but an old world
  // state naming it should still rain — as the biggest local weather the
  // dial goes to, not as a filter over the game.
  const everywhere = !!opts.everywhere;
  const nCells = Math.max(0, opts.cells ?? (everywhere ? 9 : T.cells));
  const arc = opts.cellArc ?? (everywhere ? 0.52 : T.cellArc);
  const cells = Array.from({ length: nCells }, () => {
    const dir = new THREE.Vector3(
      Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    // an axis square to the patch, so turning about it sweeps it along the
    // ground rather than spinning it on the spot
    const axis = new THREE.Vector3(
      Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .cross(dir);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    return {
      dir, axis,
      arc: arc * (0.6 + Math.random() * 0.8),
      speed: T.cellDrift * (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1),
    };
  });
  const _cellUp = new THREE.Vector3();

  // How hard it is raining where this point is: 1 in the middle of a patch,
  // easing to 0 through its outer edge, 0 outside every one of them.
  function wetnessAt(pos) {
    if (!cells.length || !pos) return 0;
    _cellUp.copy(pos).normalize();
    let best = 0;
    for (const c of cells) {
      const ang = Math.acos(THREE.MathUtils.clamp(_cellUp.dot(c.dir), -1, 1));
      if (ang >= c.arc) continue;
      const inner = c.arc * (1 - T.cellEdge);
      const w = ang <= inner ? 1 : 1 - (ang - inner) / (c.arc - inner);
      if (w > best) best = w;
    }
    return best;
  }

  // --- the cloud that carries the rain ---------------------------------------
  //
  // The fair-weather deck (sky.js) is a wash of small white slabs spread over
  // the whole globe, and it says nothing about where the rain is. So each
  // rain cell carries its own CLUSTER: a knot of bigger, darker slabs riding
  // the cell's centre as it drifts, which is what lets you see a storm
  // standing on the horizon and walk toward it — or away.
  //
  // World-anchored, unlike the rain column, which follows the player. A
  // cloud is a thing that is SOMEWHERE; only the drops are an effect.
  const cloudGroup = new THREE.Group();
  cloudGroup.frustumCulled = false;
  scene.add(cloudGroup);
  const CLUSTER = { slabs: 11, alt: 30, altJitter: 8, thick: 3.2, grey: 0.42 };
  const clusterMat = new THREE.MeshBasicMaterial({ color: 0x6a7076, fog: true });
  const clusters = cells.map((cell) => {
    const boxes = [];
    const spread = cell.arc * R * 0.75;
    for (let i = 0; i < CLUSTER.slabs; i++) {
      const w = 10 + Math.random() * 16, dpt = 8 + Math.random() * 14;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, CLUSTER.thick, dpt), clusterMat);
      // polar coords in the cell's tangent plane, denser toward the middle
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * spread;
      m.userData.off = [Math.cos(ang) * rad, Math.sin(ang) * rad,
        CLUSTER.alt + (Math.random() - 0.5) * CLUSTER.altJitter];
      cloudGroup.add(m);
      boxes.push(m);
    }
    return { cell, boxes };
  });
  const _ct = new THREE.Vector3(), _cb = new THREE.Vector3();
  const _cp = new THREE.Vector3(), _cq = new THREE.Quaternion();
  const _cm = new THREE.Matrix4();
  function placeClusters(playerPos, bend, daylight) {
    // storm cloud is DARKER than the deck it floats under, and it keeps the
    // same night floor the rest of the world does
    const k = CLUSTER.grey * (0.10 + 0.90 * (daylight ?? 1));
    clusterMat.color.setRGB(k, k, k);
    const up = playerPos ? _cp.copy(playerPos).normalize() : null;
    for (const { cell, boxes } of clusters) {
      // the far side of the globe casts no gloom anybody can see
      const show = !up || cell.dir.dot(up) > 0.15;
      for (const m of boxes) m.visible = show;
      if (!show) continue;
      // a tangent frame at the cell's centre, rebuilt as it drifts
      _ct.set(0, 1, 0);
      if (Math.abs(cell.dir.y) > 0.9) _ct.set(1, 0, 0);
      _ct.cross(cell.dir).normalize();
      // _ct × dir, NOT dir × _ct: makeBasis wants a right-handed frame, and
      // the flipped cross product handed it a REFLECTION — determinant -1 —
      // which setFromRotationMatrix quietly mangled into a wrong rotation.
      // That was the storm cloud the whole planet saw lying on its side:
      // every slab in the cluster stood up to ninety degrees off level, rain
      // falling past a wall of cloud instead of out of a deck of it.
      _cb.crossVectors(_ct, cell.dir);
      _cm.makeBasis(_ct, cell.dir, _cb);
      _cq.setFromRotationMatrix(_cm);
      for (const m of boxes) {
        const [ou, oa, oh] = m.userData.off;
        m.position.copy(cell.dir).multiplyScalar(R + oh)
          .addScaledVector(_ct, ou).addScaledVector(_cb, oa);
        m.quaternion.copy(_cq);
        if (bend) bend(m.position, m.position);
      }
    }
  }

  const handle = {
    group,
    cloudGroup,
    cells,
    wetnessAt,
    // 0..1, how much of the rain is falling where the player stands. Every
    // consumer reads this: the drops, the gloom, the lightning and the
    // villagers deciding whether to go indoors.
    wet: 0,
    flash: 0,          // 0..1, this frame's lightning brightness
    // How much daylight the deck eats RIGHT NOW. It used to be a constant
    // fixed at build, which made a storm world a single unchanging shade of
    // grey — the rain never got heavier and never eased, so there was no such
    // thing as waiting one out. See `surge`.
    gloom: overcast * T.gloom,
    // 0..1, how hard it is coming down. Two slow waves of different periods
    // beating against each other, so squalls arrive at irregular intervals
    // rather than on a metronome, and every consumer — the drops, the sky,
    // and the villagers deciding whether to go indoors — reads this one
    // number so they can never disagree about the weather.
    surge: 0.5,
    clock: 0,
    boltT: 0,
    flashT: 0,
    flashPeak: 0,
    strikes,

    /**
     * dt in seconds. ctx: { pos, playing, onSound }.
     *   pos      the player's world position (the rain follows it)
     *   playing  false in orbit view — the storm stops drawing but keeps time
     *   onSound  (name, opts) => void, for thunder
     */
    update(dt, ctx = {}) {
      // The squall cycle keeps time whether or not anything is drawing it, so
      // going to orbit and coming back does not reset the weather.
      this.clock += dt;
      const a = Math.sin(this.clock / 47) * 0.5 + 0.5;
      const b = Math.sin(this.clock / 83 + 1.7) * 0.5 + 0.5;
      // The patches walk their great circles whether or not anybody is under
      // one, so a storm that was over the next valley when you went to bed
      // has moved on by morning.
      for (const c of cells) c.dir.applyAxisAngle(c.axis, c.speed * dt).normalize();
      this.wet = ctx.pos ? wetnessAt(ctx.pos) : 0;
      // ...and everything about the storm is scaled by whether you are IN one.
      // Outside every patch the surge is nothing, the deck is clear and the
      // sky is the sky.
      this.surge = Math.min(1, a * 0.62 + b * 0.62) * this.wet;
      this.gloom = overcast * T.gloom * (0.62 + 0.5 * this.surge) * this.wet;

      // Nothing to draw at all when you are not under a patch — no drops, no
      // splashes, no bolt. That is the whole feature: it rains THERE.
      // The clusters stand wherever their cells stand, rain or shine at the
      // player's own feet — that is the point of them.
      cloudGroup.visible = ctx.playing !== false;
      if (cloudGroup.visible) placeClusters(ctx.pos, ctx.bend, ctx.daylight);
      const playing = ctx.playing !== false && !!ctx.pos && this.wet > 0.01;
      group.visible = playing;
      if (!playing) { this.flash = 0; return; }
      // ...and the rain you can see follows it. Half the drops in a lull and
      // all of them in a squall, which is the difference between weather and
      // a wallpaper of falling lines.
      drops.count = Math.max(1, Math.round(n * (0.45 + 0.55 * this.surge)));
      dropMat.opacity = T.opacity * (0.6 + 0.4 * this.surge);

      _up.copy(ctx.pos).normalize();
      tangentBasis(_up, _t1, _t2);
      const invR = 1 / Math.max(1, ctx.pos.length());
      // every drop is a streak along ITS own up, but within a 34-block column
      // those are all within a degree of each other, so one shared rotation is
      // exact enough and saves a quaternion per drop per frame
      _basis.makeBasis(_t1, _up, _t2);
      _q.setFromRotationMatrix(_basis);
      // the wind, as a lean on that one rotation. Drifting the drops sideways
      // instead would mean re-deriving a direction per drop per frame, and a
      // slanted streak is what actually reads as wind anyway.
      _tilt.setFromAxisAngle(_zAxis, -Math.atan(T.slant));
      _q.multiply(_tilt);

      if (!started) {
        for (let i = 0; i < n; i++) respawn(i, _up, _t1, _t2, true, invR);
        started = true;
      }

      for (let i = 0; i < n; i++) {
        dy[i] -= dv[i] * dt;
        if (dy[i] <= 0) {
          if (sn > 0) {
            const s = sNext++ % sn;
            sLife[s] = T.splashLife;
            sDir[s * 3] = ddir[i * 3];
            sDir[s * 3 + 1] = ddir[i * 3 + 1];
            sDir[s * 3 + 2] = ddir[i * 3 + 2];
            sRad[s] = dg[i];
          }
          respawn(i, _up, _t1, _t2, false, invR);
        }
        _dir.set(ddir[i * 3], ddir[i * 3 + 1], ddir[i * 3 + 2]);
        _pos.copy(_dir).multiplyScalar(dg[i] + dy[i] + T.length * 0.5);
        _scale.set(1, 1, 1);
        _inst.compose(_pos, _q, _scale);
        drops.setMatrixAt(i, _inst);
      }
      if (n > 0) drops.instanceMatrix.needsUpdate = true;

      for (let s = 0; s < sn; s++) {
        if (sLife[s] <= 0) {
          _inst.makeScale(0, 0, 0);      // parked: zero area draws nothing
          splashes.setMatrixAt(s, _inst);
          continue;
        }
        sLife[s] -= dt;
        const t = Math.max(0, sLife[s]) / T.splashLife;
        _dir.set(sDir[s * 3], sDir[s * 3 + 1], sDir[s * 3 + 2]);
        tangentBasis(_dir, _t1, _t2);
        _basis.makeBasis(_t1, _dir, _t2);
        _pos.copy(_dir).multiplyScalar(sRad[s] + 0.06);
        // a ring opening as it fades, which is what a splash on wet ground
        // actually does
        const k = 0.5 + (1 - t) * 1.5;
        _inst.compose(_pos, _sq.setFromRotationMatrix(_basis),
          _scale.set(k, 1, k));
        splashes.setMatrixAt(s, _inst);
      }
      if (sn > 0) splashes.instanceMatrix.needsUpdate = true;

      // --- lightning ---------------------------------------------------
      if (this.strikes > 0) {
        nextStrike -= dt;
        if (nextStrike <= 0) {
          // Poisson-ish rather than metronomic: a storm that flashes on the
          // beat is a lighthouse.
          nextStrike = (60 / this.strikes) * (0.35 + Math.random() * 1.3);
          strike(_up, _t1, _t2, invR, ctx.onSound);
        }
      }
      if (this.boltT > 0) {
        this.boltT -= dt;
        bolt.visible = this.boltT > 0;
        // two quick flickers inside the one strike, the way a real return
        // stroke goes
        boltMat.opacity = this.boltT > 0
          ? 0.55 + 0.45 * Math.abs(Math.sin(this.boltT * 90)) : 0;
      } else bolt.visible = false;
      if (this.flashT > 0) {
        this.flashT -= dt;
        const t = Math.max(0, this.flashT) / T.flashLife;
        this.flash = this.flashPeak * t * t;
      } else this.flash = 0;
    },

    setVisible(v) { group.visible = v; },

    dispose() {
      scene.remove(cloudGroup);
      for (const { boxes } of clusters) for (const m of boxes) m.geometry.dispose();
      clusterMat.dispose();
      scene.remove(group);
      drops.dispose(); splashes.dispose();
      dropGeo.dispose(); dropMat.dispose();
      splashGeo.dispose(); splashMat.dispose();
      boltGeo.dispose(); boltMat.dispose();
      group.clear();
      if (_active === handle) _active = null;
    },
  };

  if (_active) _active.dispose();
  _active = handle;
  return handle;
}

// Module-level convenience, matching sky.js: main.js drives whichever storm
// was created last and a world with no weather simply has none.
let _active = null;

export function updateWeather(dt, ctx) { _active?.update(dt, ctx); }
export function disposeWeather() { _active?.dispose(); }
export const activeWeather = () => _active;
// 0 when there is no storm, so callers can add it unconditionally
export const stormFlash = () => _active?.flash ?? 0;
export const stormGloom = () => _active?.gloom ?? 0;
