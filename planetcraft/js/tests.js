// tests.js — automated checks for the cube-sphere planet and the player frame.
//
// Two headline metrics:
//   ROLL      — how far the camera's right axis leans out of the local
//               horizontal plane. Must stay ~0 or the horizon looks tilted.
//   STAIRCASE — the slope of the rendered ground on a perfectly smooth sphere
//               with no terrain at all. On an axis-aligned voxel grid this is
//               forced to ~32 degrees; the cube-sphere exists to make it zero.

import * as THREE from 'three';
import {
  setWorldSize, Planet, makeHeightField, dirFromCell, cellFromDir,
  R, R0, S, H, SEA, BLOCK, stairId, stairFacing, isStair, setTerrainGen,
} from './cubesphere.js';
import { Player, createAvatar } from './player.js';
import * as BP from './blueprint.js';
import { buildVillages } from './village.js';
import {
  STYLES, TILE, buildAtlas, setTextureStyle, currentStyle, setTileOverrides,
  tilePixelsOf,
} from './textures.js';

const RAD2DEG = 180 / Math.PI;
const results = [];
// Which generation of the terrain the terrain tests walk: the first by
// default, and tests.html?terrain=2 for the second — both have to keep the
// ground walkable and the mountains cliffed.
setTerrainGen(Number(new URLSearchParams(location.search).get('terrain') ?? 1));

function check(name, pass, detail) {
  results.push({ name, pass, detail });
}

/**
 * Is a page's stylesheet still a stylesheet?
 *
 * THE CHEAPEST BUG IN THIS PROJECT TO MAKE AND THE DEAREST TO SEE. CSS has no
 * error reporting: one malformed rule does not fail loudly, it makes the
 * parser swallow everything after it until the braces balance again — so a
 * single stray `#modes {` ate the fixed positioning of the HUD, the hotbar,
 * the crosshair and the canvas, and the game came up as a column of text with
 * the world pushed down the page. Nothing in the suite noticed, because every
 * module still worked perfectly.
 *
 * Three things go wrong when a rule is edited by machine, and all three are
 * caught by counting braces: a rule that never closes, a `}` too many, and a
 * rule opened INSIDE another one (which is what a botched search-and-replace
 * leaves behind). At-rules — @media, @supports, @keyframes — are the one
 * legitimate nesting, so they are counted separately.
 */
export function styleProblems(html) {
  const bad = [];
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  if (!blocks.length) bad.push('no <style> block at all');
  blocks.forEach(([, css], bi) => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let line = 1, depth = 0, atDepth = 0, pendingAt = false, selStart = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '\n') { line++; continue; }
      if (ch === '@' && depth === 0) pendingAt = true;
      if (ch === '{') {
        if (pendingAt) { atDepth++; pendingAt = false; }
        else if (depth > 0) bad.push(`block ${bi}: rule inside a rule, line ${line}`);
        else {
          const sel = body.slice(selStart, i).replace(/[{}]/g, '').trim();
          if (!sel) bad.push(`block ${bi}: rule with no selector, line ${line}`);
          depth++;
        }
      } else if (ch === '}') {
        if (depth > 0) { depth--; selStart = i + 1; }
        else if (atDepth > 0) atDepth--;
        else bad.push(`block ${bi}: a } too many, line ${line}`);
      } else if (ch === ';' && depth === 0) {
        pendingAt = false;
        selStart = i + 1;
      }
    }
    if (depth > 0) bad.push(`block ${bi}: ${depth} rule(s) never closed`);
    if (atDepth > 0) bad.push(`block ${bi}: ${atDepth} at-rule(s) never closed`);
  });
  return bad;
}

function sphereDirs(n) {
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  return dirs;
}

function rollDeg(player) {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.camera.quaternion);
  return Math.asin(THREE.MathUtils.clamp(right.dot(player.up), -1, 1)) * RAD2DEG;
}

export function runTests(radius = 40) {
  results.length = 0;
  setWorldSize(radius);
  const planet = new Planet(20260802);
  const makePlayer = () =>
    new Player(planet, new THREE.PerspectiveCamera(75, 1.6, 0.1, 3000));

  // ---- 1. the staircase: axis-aligned grid vs cube-sphere -----------------
  // Both measured on a perfectly smooth sphere, zero terrain noise. This is
  // the whole reason the world representation changed.
  {
    const Rs = 60;
    const topK = (i, j) => {
      const q = Rs * Rs - (i + 0.5) ** 2 - (j + 0.5) ** 2;
      return q <= 0 ? null : Math.floor(Math.sqrt(q) - 0.5);
    };
    const axis = [];
    for (const d of sphereDirs(600)) {
      const c = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)];
      const a = c.indexOf(Math.max(...c));
      const comps = [d.x, d.y, d.z];
      const i0 = Math.round(comps[(a + 1) % 3] * Rs);
      const j0 = Math.round(comps[(a + 2) % 3] * Rs);
      const h0 = topK(i0, j0), h1 = topK(i0 + 1, j0), h2 = topK(i0, j0 + 1);
      if (h0 === null || h1 === null || h2 === null) continue;
      axis.push(Math.atan(Math.hypot(h1 - h0, h2 - h0)) * RAD2DEG);
    }
    const axisAvg = axis.reduce((s, v) => s + v, 0) / axis.length;
    const axisMax = Math.max(...axis);

    // cube-sphere: a smooth sphere is one constant altitude layer, so
    // neighbouring columns have identical surface height everywhere
    const cube = [];
    const cellArc = (Math.PI / 2) * R / S;
    for (const d of sphereDirs(600)) {
      const c = cellFromDir(d.x, d.y, d.z);
      const f = c[0], u = Math.floor(c[1]), v = Math.floor(c[2]);
      if (u < 1 || v < 1 || u >= S - 1 || v >= S - 1) continue;
      // surface of a smooth sphere = constant radius, so height difference
      // between neighbouring columns is zero by construction
      const g0 = Math.floor(R - R0), g1 = Math.floor(R - R0);
      cube.push(Math.atan(Math.abs(g1 - g0) / cellArc) * RAD2DEG);
    }
    const cubeAvg = cube.reduce((s, v) => s + v, 0) / cube.length;

    check('smooth-sphere ground is flat (was 32° on an axis-aligned grid)',
      cubeAvg < 0.01,
      `cube-sphere ${cubeAvg.toFixed(2)}° vs axis-aligned ` +
      `${axisAvg.toFixed(1)}° average / ${axisMax.toFixed(1)}° peak`);
  }

  // ---- 2. every block's top face points away from the planet centre --------
  {
    let worst = 0;
    for (const d of sphereDirs(300)) {
      const c = cellFromDir(d.x, d.y, d.z);
      const f = c[0], u = Math.floor(c[1]), v = Math.floor(c[2]);
      if (u < 0 || v < 0 || u >= S || v >= S) continue;
      // top face normal from its corners
      const p00 = dirFromCell(f, u, v).map(x => x * (R0 + 10));
      const p10 = dirFromCell(f, u + 1, v).map(x => x * (R0 + 10));
      const p01 = dirFromCell(f, u, v + 1).map(x => x * (R0 + 10));
      const a = new THREE.Vector3(p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]);
      const b = new THREE.Vector3(p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]);
      const n = new THREE.Vector3().crossVectors(a, b).normalize();
      const radial = new THREE.Vector3(p00[0], p00[1], p00[2]).normalize();
      worst = Math.max(worst, n.angleTo(radial) * RAD2DEG);
    }
    check('block top faces are perpendicular to local up', worst < 1.5,
      `worst deviation ${worst.toFixed(2)}°`);
  }

  // ---- 3. cell mapping round-trips ----------------------------------------
  {
    let worst = 0;
    for (const d of sphereDirs(400)) {
      const c = cellFromDir(d.x, d.y, d.z);
      const back = dirFromCell(c[0], c[1], c[2]);
      worst = Math.max(worst,
        new THREE.Vector3(back[0], back[1], back[2]).angleTo(d) * RAD2DEG);
    }
    check('direction -> cell -> direction round-trips', worst < 0.001,
      `worst ${worst.toExponential(2)}°`);
  }

  // ---- 4. cells stay near-square (the tangent warp earns its keep) ---------
  {
    let min = Infinity, max = 0;
    for (const d of sphereDirs(200)) {
      const c = cellFromDir(d.x, d.y, d.z);
      const f = c[0], u = Math.floor(c[1]), v = Math.floor(c[2]);
      if (u < 1 || v < 1 || u >= S - 1 || v >= S - 1) continue;
      const p = (a, b) => {
        const q = dirFromCell(f, a, b);
        return new THREE.Vector3(q[0], q[1], q[2]).multiplyScalar(R);
      };
      const o = p(u, v);
      min = Math.min(min, o.distanceTo(p(u + 1, v)), o.distanceTo(p(u, v + 1)));
      max = Math.max(max, o.distanceTo(p(u + 1, v)), o.distanceTo(p(u, v + 1)));
    }
    // A cube-sphere cannot tile a sphere with perfectly equal cells; the
    // tangent warp keeps the angular step uniform, and what remains is the
    // metric distortion between a face centre and its corners. Cells stay
    // under one block and never stretch, so the grid still reads as uniform.
    check('cells stay close to one block square', max / min < 1.45 && max <= 1.05,
      `edge lengths ${min.toFixed(2)}..${max.toFixed(2)} blocks (ratio ${(max / min).toFixed(2)})`);
  }

  // ---- 5. roll is zero everywhere -----------------------------------------
  {
    const p = makePlayer();
    let worst = 0;
    for (const d of sphereDirs(200)) {
      p.spawn(d.clone());
      worst = Math.max(worst, Math.abs(rollDeg(p)));
    }
    check('spawn roll ~0 across 200 directions', worst < 0.01,
      `worst ${worst.toFixed(6)}°`);
  }

  // ---- 6. roll never accumulates ------------------------------------------
  {
    const p = makePlayer();
    p.spawn(new THREE.Vector3(0.4, 0.8, 0.45));
    let worst = 0;
    for (let i = 0; i < 3000; i++) {
      p.onMouse(Math.sin(i * 0.37) * 40, Math.cos(i * 0.11) * 25);
      p.update(1 / 60);
      worst = Math.max(worst, Math.abs(rollDeg(p)));
    }
    check('roll stable over 3000 look+step frames', worst < 0.01,
      `worst ${worst.toFixed(6)}°`);
  }

  // ---- 7. roll stays 0 in third person and across the pitch range ---------
  {
    const p = makePlayer();
    let worst = 0;
    for (const d of sphereDirs(60)) {
      p.spawn(d.clone());
      for (const view of [0, 4.5, -4.5, 9]) {
        p.setView(view);
        for (const pitch of [-1.5, -0.3, 0, 0.4, 1.5]) {
          p.pitch = pitch;
          p.syncCamera();
          worst = Math.max(worst, Math.abs(rollDeg(p)));
        }
      }
    }
    check('roll stays 0 in every view and pitch', worst < 0.01,
      `worst ${worst.toFixed(6)}°`);
  }

  // ---- 8. standing still does not drift -----------------------------------
  {
    const p = makePlayer();
    let worst = 0, worstDir = null;
    for (const d of sphereDirs(40)) {
      p.spawn(d.clone());
      for (let i = 0; i < 120; i++) p.update(1 / 60);
      const a = p.pos.clone();
      for (let i = 0; i < 300; i++) p.update(1 / 60);
      const moved = a.distanceTo(p.pos);
      if (moved > worst) { worst = moved; worstDir = d.toArray().map(v => +v.toFixed(2)); }
    }
    check('no drift while standing (5 s)', worst < 0.01,
      `worst ${worst.toFixed(5)} blocks at ${JSON.stringify(worstDir)}`);
  }

  // ---- 9. walking straight stays on its great circle -----------------------
  // The bug this guards against is a PHANTOM sideways force — "something keeps
  // pushing me to the side". Measuring that on natural terrain does not work:
  // walking 350 blocks over hills means sliding round them, which moves you off
  // the great circle for entirely honest reasons and swamps the signal. So the
  // strict measurement runs on a SMOOTH planet, where the only thing that can
  // bend the path is the movement frame itself. Real terrain is then checked
  // only for a sane bound — an unchecked slide shows up there as tens of
  // degrees, and drift measured before the body first touches anything
  // (player.hitWall) still has to be small.
  {
    const smooth = new Planet(20260802);
    smooth.height = () => R0 + 8;     // set before any column materialises
    // No ice caps either, for the same reason the height is flattened: this
    // planet is entirely below sea level, so its poles freeze, and the edge
    // of an ice shelf is a step of TERRAIN — which is the one thing this
    // measurement is built to exclude. Walking off the shelf deflects you for
    // an honest reason and swamps the signal, exactly as hills do.
    smooth.poles = null;
    const p = new Player(smooth, new THREE.PerspectiveCamera(75, 1.6, 0.1, 3000));
    let worstDeg = 0, worstArc = 0, worstDir = null;
    for (const d of sphereDirs(12)) {
      p.spawn(d.clone());
      for (let i = 0; i < 120; i++) p.update(1 / 60);
      const start = p.pos.clone().normalize();
      const planeN = new THREE.Vector3().crossVectors(start, p.forward).normalize();
      p.keys.add('KeyW');
      let here = 0;
      for (let i = 0; i < 900; i++) {
        p.update(1 / 60);
        const off = Math.abs(p.pos.clone().normalize().dot(planeN));
        here = Math.max(here, Math.asin(THREE.MathUtils.clamp(off, -1, 1)) * RAD2DEG);
      }
      p.keys.clear();
      const arc = start.angleTo(p.pos.clone().normalize()) * RAD2DEG;
      if (here > worstDeg) {
        worstDeg = here; worstArc = arc; worstDir = d.toArray().map(v => +v.toFixed(2));
      }
    }
    check('walking straight stays on its great circle', worstDeg < 0.05,
      `worst sideways deviation ${worstDeg.toFixed(3)}° at ${JSON.stringify(worstDir)} ` +
      `(travelled ${worstArc.toFixed(0)}° of arc, smooth planet)`);
  }

  // ---- 9b. on real terrain the deflection is bounded and contact-driven ----
  {
    const p = makePlayer();
    let worstFree = 0, worstAny = 0;
    for (const d of sphereDirs(12)) {
      p.spawn(d.clone());
      for (let i = 0; i < 120; i++) p.update(1 / 60);
      // The subject is GROUND contact. A start in one of the lakes the
      // terran world now actually has would measure the swim instead.
      if (p.inWater) continue;
      const start = p.pos.clone().normalize();
      const planeN = new THREE.Vector3().crossVectors(start, p.forward).normalize();
      p.keys.add('KeyW');
      let touched = false;
      for (let i = 0; i < 900; i++) {
        p.update(1 / 60);
        // frames in the water are the swim, not the terrain: buoyancy and
        // the shore slide under it move you sideways by design
        if (p.inWater) continue;
        const off = Math.abs(p.pos.clone().normalize().dot(planeN));
        const deg = Math.asin(THREE.MathUtils.clamp(off, -1, 1)) * RAD2DEG;
        worstAny = Math.max(worstAny, deg);
        if (!touched) worstFree = Math.max(worstFree, deg);
        if (p.hitWall) touched = true;
      }
      p.keys.clear();
    }
    // The load-bearing half is the FREE bound: geometry must not push you
    // before you touch it. The ANY bound is a smoke alarm for runaway
    // sliding, not a promise about terrain shape — how far a fifteen-second
    // walk slides depends on which hills and shorelines that walk happens
    // to skirt, and it moved twice in a week as the terran lakes were tuned.
    // 25 is far above any honest slide and far below a resolve going wrong.
    check('terrain only deflects you when you walk into it',
      worstFree < 1.5 && worstAny < 25,
      `${worstFree.toFixed(2)}° drift before first contact, ` +
      `${worstAny.toFixed(1)}° worst including slides around hills and shores`);
  }

  // ---- 10. walking covers ground at full speed ----------------------------
  //
  // Nine starts, and the MEDIAN is what is asserted. One start is not a test
  // of the walk any more, it is a test of what that one heading runs into:
  // since the ranges became cliffs, a route can meet a wall it cannot climb
  // and stop dead, which is the terrain working rather than the walk failing.
  // What must hold is that a typical heading gets you where you are going.
  //
  // Seven and a half seconds, not fifteen. The test planet is radius 40, so
  // fifteen seconds of walking crosses a THIRD of the globe — at that length
  // it stopped measuring the walk and started measuring how much of the world
  // is mountain, which is a different question with its own test above.
  {
    const SECONDS = 7.5;
    const expected = (WALK_REF * SECONDS) / (2 * Math.PI * R) * 360;
    const arcs = [];
    let grounded = 0, frames = 0, swam = 0;
    // Twelve starts rather than nine: the terran world keeps real lakes now,
    // and a heading that spends its time swimming measures the swim, not the
    // walk. Wet headings are dropped and the median taken over the dry ones.
    for (const d of sphereDirs(12)) {
      const p = makePlayer();
      p.spawn(d.clone());
      for (let i = 0; i < 120; i++) p.update(1 / 60);
      const start = p.pos.clone().normalize();
      p.keys.add('KeyW');
      let wet = 0;
      for (let i = 0; i < SECONDS * 60; i++) {
        p.update(1 / 60);
        if (p.inWater) wet++;
        if (p.grounded) grounded++;
        frames++;
      }
      p.keys.clear();
      if (wet > SECONDS * 60 * 0.25) { swam++; continue; }
      arcs.push(start.angleTo(p.pos.clone().normalize()) * RAD2DEG);
    }
    arcs.sort((a, b) => a - b);
    const median = arcs[arcs.length >> 1] ?? 0;
    const blocked = arcs.filter((a) => a < expected * 0.75).length;
    check('walking covers ground at close to full speed',
      arcs.length >= 4 && median > expected * 0.75,
      `median ${median.toFixed(0)}° of arc in ${SECONDS} s over ` +
      `${arcs.length} dry headings of 12 (unobstructed would be ` +
      `${expected.toFixed(0)}°), ${blocked} ran into terrain, ${swam} swam, ` +
      `grounded ${((grounded / frames) * 100).toFixed(0)}% of frames`);
  }

  // ---- 11. the player always rests exactly on the surface ------------------
  {
    const p = makePlayer();
    let worst = 0;
    for (const d of sphereDirs(60)) {
      p.spawn(d.clone());
      for (let i = 0; i < 90; i++) p.update(1 / 60);
      const ground = planet.surfaceRadiusAtDir(
        p.pos.x / p.pos.length(), p.pos.y / p.pos.length(), p.pos.z / p.pos.length());
      worst = Math.max(worst, Math.abs(p.pos.length() - ground));
    }
    check('feet rest exactly on the ground surface', worst < 0.02,
      `worst gap ${worst.toFixed(4)} blocks`);
  }

  // ---- 12. terrain slope, full 2D gradient at each menu size ---------------
  //
  // This used to assert a low AVERAGE and a low 90th percentile, which is the
  // right test for a world made only of rolling ground and the wrong one for a
  // world with cliffs in it: a range whose faces you cannot walk up is now the
  // point, so a mean over the whole sphere just says "some of it is steep"
  // without saying whether the rest is still walkable. So the two halves are
  // measured separately — the ORDINARY ground by its median and upper quartile
  // (they must stay gentle) and the ranges by the steep tail (it must exist).
  for (const rad of [78, 156, 200]) {
    setWorldSize(rad);
    const height = makeHeightField(4242);
    const eps = 1 / rad;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const slopes = [], drySlopes = [], rises = [];
    // Walkable means DRY: the lakebeds are deliberately steepened (see the
    // terran preset's shape) and nobody walks them — they are the floor of
    // the water. The gentle-ground guarantee is a guarantee about land.
    // ...and about land with land round it: a sample whose neighbour is
    // under water is the SHORE, where the third generation's sea cliffs
    // stand — a face you look over, not ground you cross, for exactly the
    // reason a lakebed is left out. Every slope inland still counts.
    // makeHeightField answers in ABSOLUTE radius, the same unit SEA is in.
    const seaOff = SEA;
    let hiDir = null, hiH = -Infinity;
    for (const d of sphereDirs(1500)) {
      if (Math.abs(d.y) < 0.9) t1.set(0, 1, 0).cross(d).normalize();
      else t1.set(1, 0, 0).cross(d).normalize();
      t2.crossVectors(d, t1).normalize();
      const h0 = height(d.x, d.y, d.z);
      rises.push(h0);
      if (h0 > hiH) { hiH = h0; hiDir = d.clone(); }
      a.copy(d).addScaledVector(t1, eps).normalize();
      b.copy(d).addScaledVector(t2, eps).normalize();
      const ha = height(a.x, a.y, a.z), hb = height(b.x, b.y, b.z);
      const g1 = (ha - h0) / (rad * eps);
      const g2 = (hb - h0) / (rad * eps);
      const s = Math.atan(Math.hypot(g1, g2)) * RAD2DEG;
      slopes.push(s);
      if (h0 >= seaOff && ha >= seaOff && hb >= seaOff) drySlopes.push(s);
    }
    slopes.sort((x, y) => x - y);
    drySlopes.sort((x, y) => x - y);
    rises.sort((x, y) => x - y);
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
    const p50 = q(drySlopes, 0.5), p75 = q(drySlopes, 0.75), p90 = q(drySlopes, 0.9);
    const steepest = slopes[slopes.length - 1];
    check(`ordinary ground stays walkable at radius ${rad}`, p50 < 13 && p75 < 22,
      `median ${p50.toFixed(1)}°, upper quartile ${p75.toFixed(1)}°, ` +
      `90th pct ${p90.toFixed(1)}° over ${drySlopes.length} dry samples ` +
      `of ${slopes.length}`);
    // A cliff is a slope you cannot climb: 55 degrees is well past the one
    // block up per block along that a step-up can take.
    const relief = q(rises, 0.999) - q(rises, 0.001);
    check(`mountains are tall and cliffed at radius ${rad}`,
      steepest > 55 && relief > rad * 0.2,
      `steepest ${steepest.toFixed(1)}°, top-to-bottom relief ` +
      `${relief.toFixed(0)} blocks on a radius-${rad} world`);

    // Summits come to a POINT. A ridged field on its own has a level set for a
    // crest, so the height sits at the maximum all the way along it and the
    // top of the mountain is a fifty-block ridgeline you could land on; the
    // second ridge multiplied into it is what breaks that up into peaks. This
    // walks out from a summit and asks how far the ground stays within 8
    // blocks of it.
    //
    // The summit has to be a real local maximum first. 1500 samples over a
    // radius-156 world are 25 blocks apart, so the highest of them is usually
    // a shoulder — and walking out from a shoulder follows the ridge UP to the
    // real top without ever dropping, which measures the length of the ridge
    // and calls it the width of the peak. So climb to the top first, coarse
    // steps then fine.
    if (hiDir) {
      const climb = (step) => {
        for (let iter = 0; iter < 60; iter++) {
          if (Math.abs(hiDir.y) < 0.9) t1.set(0, 1, 0).cross(hiDir).normalize();
          else t1.set(1, 0, 0).cross(hiDir).normalize();
          t2.crossVectors(hiDir, t1).normalize();
          let moved = false;
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            a.copy(t1).multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
            b.copy(hiDir).addScaledVector(a, step / rad).normalize();
            const h = height(b.x, b.y, b.z);
            if (h > hiH) { hiH = h; hiDir.copy(b); moved = true; }
          }
          if (!moved) return;
        }
      };
      climb(8); climb(3); climb(1);
      if (Math.abs(hiDir.y) < 0.9) t1.set(0, 1, 0).cross(hiDir).normalize();
      else t1.set(1, 0, 0).cross(hiDir).normalize();
      t2.crossVectors(hiDir, t1).normalize();
      let widest = 0;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        a.copy(t1).multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
        for (let s = 1; s <= 80; s++) {
          b.copy(hiDir).addScaledVector(a, s / rad).normalize();
          if (hiH - height(b.x, b.y, b.z) >= 8) break;
          widest = Math.max(widest, s);
        }
      }
      check(`summits come to a point at radius ${rad}`, widest < 30,
        `the ground stays within 8 blocks of the summit for ${widest} blocks ` +
        `out, on a peak ${(hiH - R).toFixed(0)} blocks above the mean radius`);
    }
  }
  setWorldSize(radius);

  // ---- 13. blueprints survive the round trip ------------------------------
  //
  // Capture -> encode -> file -> decode -> turn -> stamp is the whole life of
  // a building the player designed, and every step is a chance to transpose a
  // pair of axes. A plain wall hides that; a staircase does not, so the test
  // structure is deliberately asymmetric in all three axes and has a stair in
  // it whose facing has to come back round after four quarter turns.
  {
    setWorldSize(64);
    const planet = new Planet(7);
    const f = 1, u0 = 20, v0 = 24, h0 = 30, w = 4, d = 3, hgt = 2;
    // an L in plan, two courses high, with one stair facing +u
    const put = (u, v, h, b) => planet.set(f, u0 + u, v0 + v, h0 + h, b);
    for (let u = 0; u < w; u++) for (let v = 0; v < d; v++) put(u, v, 0, BLOCK.AIR);
    put(0, 0, 0, BLOCK.COBBLE); put(1, 0, 0, BLOCK.COBBLE);
    put(2, 0, 0, BLOCK.PLANK);  put(3, 0, 0, BLOCK.GLASS);
    put(0, 1, 0, BLOCK.COBBLE); put(0, 2, 0, BLOCK.DIRT);
    put(0, 0, 1, stairId(0, 0));                    // facing +u
    put(3, 2, 1, BLOCK.LANTERN);

    const bp = BP.capture(planet, f, u0, v0, h0, w, d, hgt, 0);
    const there = BP.decode(BP.encode(bp, 'test'));
    let same = there.size.join() === [w, d, hgt].join();
    for (let i = 0; i < bp.cells.length && same; i++) {
      if (bp.cells[i] !== there.cells[i]) same = false;
    }
    check('a blueprint survives encode and decode', same,
      `${w}x${d}x${hgt}, ${BP.encode(bp).runs.length} runs for ` +
      `${bp.cells.length} cells`);

    // four quarter turns is the identity, sizes and stair facings included
    const round = BP.rotate(bp, 4);
    let back = round.size.join() === bp.size.join();
    for (let i = 0; i < bp.cells.length && back; i++) {
      if (round.cells[i] !== bp.cells[i]) back = false;
    }
    const one = BP.rotate(bp, 1);
    const stairTurned = one.size.join() === [d, w, hgt].join()
      && isStair(BP.blockAt(one, d - 1, 0, 1))
      && stairFacing(BP.blockAt(one, d - 1, 0, 1)) === 2;   // +u went to +v
    check('a blueprint turns without losing its bearings', back && stairTurned,
      back ? (stairTurned ? 'four quarter turns is the identity, and one turn '
        + 'takes a +u stair to +v' : 'the stair came back facing the wrong way')
        : 'four quarter turns did not come back');

    // stamped somewhere else it is the same building, block for block
    const su = 40, sv = 44, sh = 34;
    BP.stamp(planet, bp, f, su, sv, sh);
    let copied = 0, wrong = 0;
    for (let u = 0; u < w; u++) {
      for (let v = 0; v < d; v++) {
        for (let h = 0; h < hgt; h++) {
          const want = planet.get(f, u0 + u, v0 + v, h0 + h);
          const got = planet.get(f, su + u, sv + v, sh + h);
          if (want === got) copied++; else wrong++;
        }
      }
    }
    check('a stamped blueprint is the building it came from', wrong === 0,
      `${copied} of ${w * d * hgt} cells identical after stamping ` +
      `${Math.abs(su - u0)} cells away`);
    setWorldSize(radius);
  }

  // ---- 13b. a saved design is part of the world's identity ----------------
  //
  // The rule at the foot of CLAUDE.md says the planet is a pure function of
  // its identity, and this is the check that the design set BELONGS to that
  // identity rather than sitting outside it. A design is not one house: the
  // generator rolls the coded archetypes and the saved designs in a single
  // roll off the village's shared random stream, and a design's own build
  // consumes a different number of numbers than the archetype it stood in
  // for. So one file in blueprints/ moves every village on the planet — how
  // many there are, where they sit and what they are called.
  //
  // Which is why the set is written into the save and shipped with the offer.
  // Left ambient it made the same world two planets: the create path loaded
  // the designs and the load path did not, so reloading a save gave you a
  // planet that was not the one you saved, with the ledger's purses landing
  // on villages that were no longer there.
  //
  // If this check ever fails BOTH ways round — the two sets generating the
  // same villages — the plumbing has come loose somewhere and the save is
  // recording something the generator has stopped reading.
  {
    setWorldSize(156);
    const design = BP.decode({
      version: 1, name: 'test-design', size: [7, 6, 7], front: 0,
      // a plain box: floor, four walls, and nothing else. It only has to be a
      // building for the generator to reach for it instead of an archetype.
      runs: [[BLOCK.PLANK, 42], [BLOCK.COBBLE, 210], [BLOCK.AIR, 42]],
    });
    const sites = (plans) => {
      const planet = new Planet(424242);
      buildVillages(planet, 424242, 2, { blueprints: plans });
      return (planet.villageSites ?? []).map((v) => v.name);
    };
    const bare = sites([]);
    const drawn = sites([design]);
    const twice = sites([design]);
    check('one design changes the whole planet, not one house',
      bare.join() !== drawn.join(),
      `${bare.length} villages from the coded houses, ${drawn.length} with one `
      + `design in the set — ${bare[0] ?? '?'} against ${drawn[0] ?? '?'}`);
    check('the same design set builds the same villages every time',
      drawn.join() === twice.join(),
      `${drawn.length} villages, ${twice.length} the second time`);
    setWorldSize(radius);
  }

  // ---- 14. a skin is the man, and a slim skin is a narrower one -----------
  //
  // The look is a Minecraft-format skin now. Two different skins must not
  // share a texture, and the slim build must actually narrow the arms —
  // otherwise every player wears whoever loaded first, which is exactly the
  // bug the old per-look texture cache existed to stop.
  {
    const px = (c) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      g.fillStyle = c;
      g.fillRect(0, 0, 64, 64);
      return cv.toDataURL('image/png');
    };
    const one = createAvatar({ skin: px('#ff0000') });
    const two = createAvatar({ skin: px('#00ff00') });
    // A body is drawn by lit.js now, whose picture is a uniform and not a
    // `.map` — read whichever the material has.
    const mapOf = (m) => m?.uniforms?.map?.value ?? m?.map ?? null;
    const tex = (rig) => {
      let map = null;
      rig.group.traverse((o) => {
        if (map || !o.isMesh) return;
        map = mapOf(Array.isArray(o.material) ? o.material[0] : o.material);
      });
      return map;
    };
    check('two skins are two textures', tex(one) !== tex(two),
      'each skin record carries its own canvas and texture');

    const armW = (rig) => {
      let w = null;
      rig.group.traverse((o) => {
        if (w === null && o.isMesh && o.name === 'armR') {
          w = o.geometry.parameters.width;
        }
      });
      return w;
    };
    const classic = createAvatar({ skin: null, slim: false });
    const slim = createAvatar({ skin: null, slim: true });
    check('slim arms are narrower than classic arms',
      armW(slim) < armW(classic),
      `arm widths ${armW(slim)?.toFixed(3)} vs ${armW(classic)?.toFixed(3)}`);
  }

  // ---- 15. a painted tile lands on its own style and nowhere else ---------
  //
  // The block maker saves a tile against ONE style. If the override were
  // applied without checking which style is being built, painting the stone of
  // one would repaint the stone of all twelve — and the generated tiles are
  // the fallback for everything nobody has painted, so that would be most of
  // the game.
  {
    const keep = currentStyle().id;
    const px = (styleId) => {
      setTextureStyle(styleId);
      const tex = buildAtlas(42);
      const d = tilePixelsOf(tex, TILE.STONE).data;
      tex.dispose?.();
      const i = (5 * 32 + 5) * 4;
      return [d[i], d[i + 1], d[i + 2]].join();
    };
    const a = STYLES[0].id, b = STYLES[1].id;
    const plainA = px(a), plainB = px(b);
    // one texel of magenta at (5,5), the rest of the tile left as it was
    setTileOverrides([{
      style: a, tile: TILE.STONE,
      palette: [null, '#ff00ff'],
      runs: [[0, 5 * 32 + 5], [1, 1], [0, 32 * 32]],
    }]);
    const paintedA = px(a), untouchedB = px(b);
    setTileOverrides([]);
    const goneA = px(a);
    setTextureStyle(keep);
    check('a painted tile applies to its own style only',
      paintedA === '255,0,255' && untouchedB === plainB && goneA === plainA,
      `${a} ${plainA} -> ${paintedA} painted -> ${goneA} once cleared, ` +
      `while ${b} stayed ${untouchedB}`);
  }

  // ---- the mesher's bulk read agrees with the world's own ------------------
  // fillColumn is get() with everything that belongs to the COLUMN lifted out
  // of the per-cell loop, and it is what makes a chunk cheap enough to stream
  // without a hitch. Two copies of the terrain profile can drift, and when
  // they do the symptom is holes in the ground rather than anything that
  // looks like a bug in a read. So they are held against each other here,
  // over the ordinary surface AND over the deep bands that have their own
  // rules — the core lava, the diamond seam, the caves and the sea bed.
  {
    const buf = new Uint16Array(H);
    let checked = 0, wrong = 0, first = null;
    let n = 987654321 | 0;
    const rnd = () => { n = Math.imul(n ^ (n >>> 15), 2246822519); return n >>> 8; };
    // a spread of ordinary columns, plus the off-face ones a chunk on a cube
    // edge asks for, which take fillColumn's slow path
    for (let t = 0; t < 250; t++) {
      const edge = t >= 220;
      const f = rnd() % 6;
      const u = edge ? (rnd() % 2 ? -1 : S) : rnd() % S;
      const v = rnd() % S;
      // the whole column, so nothing in the profile goes unread
      const lo = 0, hi = H - 1;
      planet.fillColumn(f, u, v, lo, hi, buf, 0);
      for (let h = lo; h <= hi; h++) {
        const a = buf[h - lo], b = planet.get(f, u, v, h);
        checked++;
        if (a !== b && !first) first = `f${f} ${u},${v} h${h}: ${a} != ${b}`;
        if (a !== b) wrong++;
      }
    }
    // ...and again over a column somebody has edited, so the override path is
    // covered too: a block laid in mid-air, and one dug out of the ground.
    {
      const f = 2, u = (S / 2) | 0, v = (S / 2) | 0;
      const top = planet.columnTop(f, u, v);
      planet.set(f, u, v, top + 3, BLOCK.STONE);
      planet.set(f, u, v, top, BLOCK.AIR);
      planet.fillColumn(f, u, v, 0, H - 1, buf, 0);
      for (let h = 0; h < H; h++) {
        const a = buf[h], b = planet.get(f, u, v, h);
        checked++;
        if (a !== b && !first) first = `edited f${f} ${u},${v} h${h}: ${a} != ${b}`;
        if (a !== b) wrong++;
      }
    }
    check('the mesher reads the same world get() does', wrong === 0,
      `${checked} cells, ${wrong} disagreed${first ? ` — first ${first}` : ''}`);
  }

  return results;
}

const WALK_REF = 6; // blocks / s, matches WALK_SPEED in player.js
