// sky.js — the cloud layer.
//
// Clouds over a globe cannot be the usual flat plane far overhead: walk a
// quarter of the way round and the plane is edge-on, then behind you. So the
// layer is a SHELL — clumps of blocky slabs scattered over a sphere at a fixed
// altitude, each lying flat on its own local tangent plane, which is the same
// trick the terrain uses to keep block tops perpendicular to the local up.
//
// Cost is the point. Slabs are instanced, the wind is one quaternion on the
// parent group per frame, and the far hemisphere is switched off wholesale, so
// there is no per-cloud work at any point. Face shading is baked into vertex
// colours, so the material needs no lighting either.
//
// Fog: the world fog saturates ~80 blocks out, which is *below* the clouds, so
// fogged clouds would grey out directly overhead. The material therefore opts
// OUT of fog (`fog: false`) and the horizon is handled by hiding the far side
// instead. Set `fog: true` in the options if you would rather have them fade.

import * as THREE from 'three';
import { R, AMP } from './cubesphere.js';
import { flattenMaterialWorld, isFlat } from './flatten.js';

export const CLOUD_TUNING = {
  patches: 220,      // candidate clumps spread over the whole shell
  coverage: 0.62,    // fraction that get a cloud, so the sky keeps its gaps
  slabs: 5,          // boxes per clump, at most
  altitude: 0,       // blocks above mean radius; 0 = auto, clear of the hills
  thickness: 2.4,    // slab height in blocks — thin ones read as paper plates
  minSize: 6,        // slab footprint, in blocks
  maxSize: 18,
  drift: 0.005,      // rad/s the shell turns: this is the wind
  opacity: 1,        // < 1 turns on blending (and its sorting artefacts)
  fog: false,        // true = let the world fog eat them at the horizon
  sectors: 32,       // shell is split this many ways for horizon culling
  seed: 0xc10d,
};

// deterministic, so the same seed gives the same sky twice
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Evenly spread unit directions with no polar clumping, which a naive
// lat/long loop gives you every time.
function fibonacciDir(i, n, out) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * 2.39996323;                 // golden angle
  return out.set(Math.cos(th) * rad, y, Math.sin(th) * rad).normalize();
}

// A cube with per-face brightness in its vertex colours: bright top, mid
// sides, dark underside. Without it a white box reads as a flat white blob.
function slabGeometry() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const shade = [0.9, 0.9, 1.0, 0.6, 0.82, 0.82];   // +x -x +y -y +z -z
  const n = geo.attributes.position.count;          // 24: four per face
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = shade[(i / 4) | 0];
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const _dir = new THREE.Vector3();
const _sec = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _inst = new THREE.Matrix4();
const _up = new THREE.Vector3();
const _iq = new THREE.Quaternion();

function tangentBasis(up, t1, t2) {
  if (Math.abs(up.x) < 0.9) _ax.set(1, 0, 0);
  else _ax.set(0, 1, 0);
  t1.crossVectors(_ax, up).normalize();
  t2.crossVectors(t1, up);        // z = x cross y, so the frame is right handed
}

let _active = null;   // the layer updateClouds() drives

// Build a cloud shell around `planet` and add it to `scene`. Returns a handle;
// keep it if you want more than one layer, or ignore it and use the module
// level updateClouds() / disposeClouds().
//
// `planet` is only read for its radius, so passing null is harmless.
export function createClouds(planet, scene, opts = {}) {
  const o = { ...CLOUD_TUNING, ...opts };
  const rand = mulberry32(o.seed | 0);
  // auto altitude clears the tallest terrain with room to spare: peaks reach
  // about R + AMP, and you want sky between you and the cloud, not fog
  const alt = o.altitude || Math.max(18, AMP * 1.35 + 14);
  const shell = R + alt;

  // Which patches belong to which sector, worked out once. A sector is a cone
  // of the shell that gets its own mesh so it can be hidden in one flag.
  const nSec = Math.max(1, o.sectors | 0);
  const secDirs = [];
  for (let i = 0; i < nSec; i++) {
    secDirs.push(fibonacciDir(i, nSec, new THREE.Vector3()));
  }
  const buckets = secDirs.map(() => []);

  for (let i = 0; i < o.patches; i++) {
    fibonacciDir(i, o.patches, _dir);
    if (rand() > o.coverage) continue;
    let best = 0, bestDot = -2;
    for (let s = 0; s < nSec; s++) {
      const d = secDirs[s].dot(_dir);
      if (d > bestDot) { bestDot = d; best = s; }
    }
    buckets[best].push(_dir.clone());
  }

  const geo = slabGeometry();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: o.opacity < 1,
    opacity: o.opacity,
    depthWrite: true,        // solid-looking blocks; they are not glass
    fog: o.fog,
  });
  // The sky has to be unrolled with the ground or it does not agree with it.
  // On the true globe a cloud at arc distance d sits a height R*(cos(d/R) - 1)
  // BELOW the tangent plane — 20 blocks down at 100 blocks out on a radius-200
  // world — so while the shader was lifting the far terrain up to a flat
  // horizon, the clouds went on curving away and sank into the treeline.
  // flattenMaterialWorld and not flattenMaterial: see flatten.js, these are
  // instanced slabs under a group the wind turns.
  flattenMaterialWorld(mat);

  const group = new THREE.Group();
  const sectors = [];
  let total = 0;

  for (let s = 0; s < nSec; s++) {
    const patches = buckets[s];
    if (!patches.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, patches.length * o.slabs);
    // the mesh sits at the origin and wraps a chunk of sky: culling its
    // bounding sphere against the frustum can only ever get the answer wrong
    mesh.frustumCulled = false;
    let k = 0;

    for (const d of patches) {
      tangentBasis(d, _t1, _t2);
      _m.makeBasis(_t1, d, _t2);
      _q.setFromRotationMatrix(_m);

      const slabs = 2 + Math.floor(rand() * Math.max(1, o.slabs - 1));
      const size = o.minSize + rand() * (o.maxSize - o.minSize);
      for (let n = 0; n < slabs && k < mesh.count; n++) {
        // slabs overlap and step sideways, which is what makes a blocky
        // cloud read as a chunky outline rather than a single rectangle
        const w = size * (0.5 + rand() * 0.6);
        const dp = size * (0.5 + rand() * 0.6);
        const dx = (rand() - 0.5) * size * 1.1;
        const dz = (rand() - 0.5) * size * 1.1;
        const dy = (rand() - 0.5) * o.thickness * 0.8;
        _pos.copy(d).multiplyScalar(shell + dy)
          .addScaledVector(_t1, dx).addScaledVector(_t2, dz);
        _scale.set(w, o.thickness * (0.7 + rand() * 0.7), dp);
        _inst.compose(_pos, _q, _scale);
        mesh.setMatrixAt(k++, _inst);
      }
    }
    mesh.count = k;                     // unused instances never get drawn
    mesh.instanceMatrix.needsUpdate = true;
    total += k;
    sectors.push({ dir: secDirs[s], mesh });
    group.add(mesh);
  }

  scene.add(group);

  // A cloud at `shell` drops below the horizon of someone standing at R once
  // it is this far round the planet; widen it by the angular radius of a
  // sector so a sector is only hidden when every cloud in it has gone.
  const horizon = Math.acos(THREE.MathUtils.clamp(R / Math.max(1, shell), -1, 1));
  const secRadius = Math.acos(THREE.MathUtils.clamp(1 - 2 / nSec, -1, 1));
  const cullDot = Math.cos(Math.min(Math.PI, horizon + secRadius));

  // drift axis is fixed per layer, so clouds near its equator race and the
  // ones near the poles barely move — which is what real wind looks like
  const a = rand() * 6.283, b = rand() * 3.14;
  const axis = new THREE.Vector3(
    Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)).normalize();

  const handle = {
    group, sectors, material: mat, geometry: geo,
    altitude: alt, shell, axis, angle: 0, slabs: total, cullDot,

    // dt in seconds; `ctx` may be a plain daylight number (0..1) or
    // { daylight, up }. `up` is the player's local up — pass player.pos and
    // the far side of the shell is switched off, which is most of it. Leave
    // it out (orbit view) and the whole shell is drawn.
    update(dt, ctx = {}) {
      const c = typeof ctx === 'number' ? { daylight: ctx } : (ctx || {});
      this.angle += o.drift * dt;
      group.quaternion.setFromAxisAngle(axis, this.angle);
      // The same night floor the ground keeps, and for the same reason. This
      // was 0.32, which is three times what the world under it goes down to —
      // so at midnight the deck was the brightest thing in the sky, a row of
      // white slabs hanging over a landscape you could barely make out. A
      // cloud is lit by the sun like everything else; when the sun is down it
      // is a shape against the stars, not a light of its own.
      const s = 0.10 + 0.90 * (c.daylight ?? 1);
      mat.color.setRGB(s, s, s);

      const up = c.up ?? c.playerPos ?? null;
      if (!up) {
        for (const sec of sectors) sec.mesh.visible = true;
        return;
      }
      // How far round the planet a sector may be and still be drawn.
      //
      // On the globe that is the horizon: a cloud further round than this has
      // genuinely gone over the edge. On the UNROLLED map there is no edge —
      // a cloud at any angle maps to a point on a flat ceiling — so culling
      // at the horizon would end the sky in a hard ring a hundred blocks out
      // with clear air past it, which is the same disagreement with the
      // ground read the other way round. Flat, the limit is simply how far
      // the world is drawn, which is the caller's business to know.
      const dot = isFlat() && c.maxDist
        ? Math.cos(Math.min(Math.PI, c.maxDist / R + secRadius))
        : this.cullDot;
      // compare in shell-local space, so the wind cannot drift a sector out
      // of step with its own visibility test
      _up.copy(up).normalize()
        .applyQuaternion(_iq.copy(group.quaternion).invert());
      for (const sec of sectors) {
        sec.mesh.visible = sec.dir.dot(_up) > dot;
      }
    },

    // paint them sunset orange, or any sky colour you like
    tint(color) { mat.color.set(color); },
    setVisible(v) { group.visible = v; },
    dispose() {
      scene.remove(group);
      for (const sec of sectors) sec.mesh.dispose();
      geo.dispose();
      mat.dispose();
      if (_active === handle) _active = null;
    },
  };
  if (_active) _active.dispose();     // one layer at a time unless you keep it
  _active = handle;
  return handle;
}

// Convenience for main.js: drives whichever layer was created last.
export function updateClouds(dt, ctx = {}) {
  _active?.update(dt, ctx);
}

export function disposeClouds() {
  _active?.dispose();
}

export const activeClouds = () => _active;
