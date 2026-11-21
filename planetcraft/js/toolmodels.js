// toolmodels.js — the tools and hand weapons you can see yourself holding.
//
// A held tool used to be its hotbar icon pushed out into a slab (itemmodel.js)
// — and under the Realistic style, the slab's outline smoothed and its pixels
// repainted, which turned a sixteen-pixel pickaxe into a pale bent pretzel.
// The player's verdict: "it's not how a weapon should look". It could not
// be: an icon is a picture of a tool seen flat, and no amount of extruding a
// picture gives it a haft you could close a hand on or an edge that catches
// the light.
//
// So these are MODELLED. A turned wooden haft with a knob at the butt; a head
// cut from a profile and bevelled, so a blade thins to an edge and a pick to
// its points; a leather-bound grip, a crossguard and a pommel on a sword; a
// knapped flint that is faceted rather than smooth. Each is built in the
// frame the extruded icon was built in — grip at the origin, the head up and
// to the right along the diagonal the icons are drawn on, the flat of it
// facing the eye — so every pose, swing and lean player.js was measured
// against by protractor holds exactly as it was.
//
// Two looks, the two styles: under Classic each material is a sixteen-texel
// pixel texture, lit by a shade baked into the vertices from a light over
// your shoulder (nothing in Classic is lit by the sun, so the shape has to
// carry its own light); under Realistic the same parts wear the style's own
// materials — steel, wood, leather, stone, gem — in the sun.

import * as THREE from 'three';
import { makeLit } from './lit.js';
import { classMaterial } from './realbody.js';

// --- what things are made of --------------------------------------------------

// `cls` is the Realistic style's material class (see CLASS in realbody.js);
// `ramp` is the Classic pixel texture's palette, dark to light; `paint` is
// how its sixteen texels are laid out.
const MATS = {
  wood: { color: 0x9c6b3c, cls: 'wood', ramp: ['5e3d1f', '7d5230', '9c6b3c', 'b3834f', 'c79a64'], paint: 'grain' },
  woodDark: { color: 0x654326, cls: 'wood', ramp: ['38230f', '4d321a', '654326', '7a5431', '8f663e'], paint: 'grain' },
  plank: { color: 0xb08850, cls: 'wood', ramp: ['6e4f28', '8e6a38', 'b08850', 'c6a066', 'd8b67e'], paint: 'grain' },
  leather: { color: 0x5c3a22, cls: 'leather', ramp: ['2f1c0e', '452a17', '5c3a22', '74492b', '8a5a36'], paint: 'wrap' },
  stone: { color: 0x8e8e8a, cls: 'stone', ramp: ['4f4f4d', '6c6c69', '8e8e8a', 'a6a6a1', 'bdbdb8'], paint: 'speckle' },
  flint: { color: 0x3e4046, cls: 'stone', ramp: ['1c1d21', '2a2c31', '3e4046', '575a61', '767a82'], paint: 'chips' },
  iron: { color: 0xd3d8de, cls: 'metal', ramp: ['5f656d', '848a92', 'a4aab2', 'c0c6cd', 'dfe3e8'], paint: 'brushed' },
  ironDark: { color: 0x5d636b, cls: 'metal', ramp: ['2a2d32', '3d4147', '52575e', '6a7078', '858b93'], paint: 'brushed' },
  copper: { color: 0xc9713f, cls: 'metal', ramp: ['6e3417', '94492a', 'c26a3c', 'dd8a57', 'f0ae80'], paint: 'brushed' },
  brass: { color: 0xd4ad4a, cls: 'metal', ramp: ['7a5c1c', 'a4802c', 'caa444', 'e0c064', 'f4dc92'], paint: 'brushed' },
  bronze: { color: 0xa9763b, cls: 'metal', ramp: ['5a3a18', '7c5326', '9f6f37', 'bd8b4d', 'd8aa6c'], paint: 'brushed' },
  gold: { color: 0xf0c542, cls: 'metal', ramp: ['8c6410', 'b88b1c', 'e2b532', 'f4d25e', 'fff0a6'], paint: 'brushed' },
  diamond: { color: 0x7ce8ee, cls: 'gem', ramp: ['1f7f8a', '38a9b3', '5fd2da', '9aeef2', 'e4ffff'], paint: 'facets' },
  // ...and what the guns are made of
  gunmetal: { color: 0x4a5058, cls: 'metal', ramp: ['1b1e22', '272b30', '363b41', '474d54', '5e656d'], paint: 'brushed' },
  blued: { color: 0x2c3340, cls: 'metal', ramp: ['0f1217', '171c24', '222936', '2f3847', '46526a'], paint: 'brushed' },
  steel: { color: 0x9aa2ac, cls: 'metal', ramp: ['4c525a', '6a7179', '8a929b', 'a8b0b9', 'c8cfd6'], paint: 'brushed' },
  walnut: { color: 0x6e4526, cls: 'wood', ramp: ['2e1a0b', '462913', '5f391c', '7a4b27', '955f35'], paint: 'grain' },
  polymer: { color: 0x2a2b2d, cls: 'paint', ramp: ['131415', '1c1d1f', '252628', '303133', '3d3e41'], paint: 'speckle' },
  olive: { color: 0x5c6440, cls: 'paint', ramp: ['2c311d', '3c4228', '4d5433', '5f6740', '747d52'], paint: 'speckle' },
  oliveDark: { color: 0x3b4029, cls: 'paint', ramp: ['1a1d10', '252918', '30351f', '3d4328', '4c5334'], paint: 'speckle' },
  brass2: { color: 0xc9a14a, cls: 'metal', ramp: ['6b4f18', '8f6d26', 'b48d3a', 'd1ab55', 'ecd08a'], paint: 'brushed' },
  sight: { color: 0xe8ecef, cls: 'paint', ramp: ['9aa0a6', 'b8bdc2', 'd4d8dc', 'e8ecef', 'ffffff'], paint: 'speckle' },
  string: { color: 0xe6dcc4, cls: 'cloth', ramp: ['9c927c', 'b8ae96', 'd0c6ae', 'e6dcc4', 'f6eed8'], paint: 'speckle' },
};

// the metal a tool's head is made of, off its id
const HEAD_OF = {
  wood: 'plank', stone: 'stone', iron: 'iron', diamond: 'diamond',
  copper: 'copper', brass: 'brass', bronze: 'bronze', gold: 'gold', flint: 'flint',
};

// --- the Classic look: sixteen-texel textures -----------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEX = {};
function pixelTexture(name) {
  if (TEX[name]) return TEX[name];
  const M = MATS[name];
  const N = 16;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const R = rng(name.length * 7919 + name.charCodeAt(0) * 131 + name.charCodeAt(1));
  const col = (i) => `#${M.ramp[Math.max(0, Math.min(M.ramp.length - 1, i))]}`;
  const px = (x, y, i) => { g.fillStyle = col(i); g.fillRect(x & 15, y & 15, 1, 1); };
  g.fillStyle = col(2);
  g.fillRect(0, 0, N, N);
  if (M.paint === 'grain') {
    // grain runs along V, which is along a haft: a few long streaks, a knot
    for (let x = 0; x < N; x++) {
      const tone = [2, 2, 1, 2, 3, 2, 2, 1][Math.floor(R() * 8)];
      for (let y = 0; y < N; y++) px(x, y, tone + (R() < 0.08 ? (R() < 0.5 ? -1 : 1) : 0));
    }
    const kx = Math.floor(R() * N), ky = Math.floor(R() * N);
    px(kx, ky, 0); px(kx + 1, ky, 1); px(kx, ky + 1, 1);
  } else if (M.paint === 'wrap') {
    // a strap wound diagonally, its edge catching the light
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = (x + y * 2) % 8;
        px(x, y, k === 0 ? 4 : k === 1 ? 3 : k === 7 ? 0 : 2 - (R() < 0.15 ? 1 : 0));
      }
    }
  } else if (M.paint === 'speckle') {
    for (let i = 0; i < 70; i++) {
      px(Math.floor(R() * N), Math.floor(R() * N), [0, 1, 1, 3, 3, 4][Math.floor(R() * 6)]);
    }
  } else if (M.paint === 'chips') {
    // knapped: conchoidal scars, each a small bright crescent over a shadow
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(R() * N), y = Math.floor(R() * N);
      px(x, y, 4); px(x + 1, y, 3); px(x + 2, y + 1, 3);
      px(x, y + 1, 1); px(x + 1, y + 2, 0);
    }
  } else if (M.paint === 'brushed') {
    // the grind: faint streaks along U, a few bright specks
    for (let y = 0; y < N; y++) {
      const tone = R() < 0.3 ? 3 : R() < 0.2 ? 1 : 2;
      for (let x = 0; x < N; x++) px(x, y, R() < 0.9 ? tone : tone + 1);
    }
    for (let i = 0; i < 5; i++) px(Math.floor(R() * N), Math.floor(R() * N), 4);
  } else if (M.paint === 'facets') {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = ((x * 3 + y * 5) >> 2) % 5;
        px(x, y, [2, 3, 2, 1, 3][k]);
      }
    }
    for (let i = 0; i < 6; i++) px(Math.floor(R() * N), Math.floor(R() * N), 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return (TEX[name] = t);
}

const CLASSIC = {};
const REAL = {};
function material(name, realistic) {
  if (realistic) {
    return (REAL[name] ??= classMaterial(MATS[name].cls,
      { color: MATS[name].color, vertexColors: false, faceShade: false }));
  }
  return (CLASSIC[name] ??= makeLit({
    map: pixelTexture(name), vertexColors: true, side: THREE.DoubleSide,
  }));
}
// the materials are shared by every model; only geometry belongs to one
const SHARED = new WeakSet();

// --- the light a Classic tool carries with it ------------------------------------
//
// Over the right shoulder and a little toward you, in the frame the parts are
// built in (the haft up +Y, the flat of the head facing +Z, the eye). Held,
// the tool is turned a quarter of a radian from that, which keeps the light
// where a light over your shoulder would be.
const LIGHT = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();
const HALF = LIGHT.clone().add(new THREE.Vector3(0, 0, 1)).normalize();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
function bake(mesh, shine) {
  const geo = mesh.geometry;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  mesh.updateMatrix();
  _m3.getNormalMatrix(mesh.matrix);
  const col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    _n.fromBufferAttribute(nrm, i).applyMatrix3(_m3).normalize();
    const d = Math.max(0, _n.dot(LIGHT));
    let s = 0.46 + 0.62 * d;
    if (shine) s += shine * Math.max(0, _n.dot(HALF)) ** 18;
    s = Math.min(1.14, s);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// --- the parts ----------------------------------------------------------------------

// A turned part, revolved about +Y from a profile of [radius, y] pairs, with
// its texture laid in units — round the circumference and along the length —
// so a haft's grain runs along it at sixteen texels a unit whatever its size.
function lathe(profile, segs = 10) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const geo = new THREE.LatheGeometry(pts, segs);
  const rMax = Math.max(...profile.map(([r]) => r));
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * rMax, pos.getY(i));
  }
  geo.computeVertexNormals();
  return geo;
}

// A cut part: a profile in the flat of the tool (x across, y along the haft),
// given a thickness and bevelled. A large bevel on a thin plate is a BLADE —
// full width at its middle plane and thinning to the faces — which is the
// one shape an edge is.
function plate(draw, { depth = 0.04, bevel = 0.012, size = 0.012, segs = 2, curve = 10 } = {}) {
  const s = new THREE.Shape();
  draw(s);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: size,
    bevelSegments: segs, curveSegments: curve,
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

// Put one part into the model, in its material, its Classic light baked in.
function part(group, geo, mat, realistic, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(geo, material(mat, realistic));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (!realistic) bake(m, MATS[mat].cls === 'metal' ? 0.55 : MATS[mat].cls === 'gem' ? 0.8 : 0.12);
  group.add(m);
  return m;
}

// THE HAFT: from a knob at the butt, a shade under the grip, to `top`.
function haft(g, R, top, mat = 'wood', r = 0.031) {
  part(g, lathe([[0, -0.2], [r * 1.35, -0.2], [r * 1.5, -0.185], [r * 1.3, -0.165],
    [r, -0.15], [r * 1.04, 0.3], [r * 0.96, top - 0.02], [r * 0.8, top], [0, top]]), mat, R);
}

// A grip wound in leather: a run of low ridges, one per turn of the strap.
function wrapped(g, R, y0, y1, r = 0.036, mat = 'leather') {
  const prof = [[0, y0], [r * 0.95, y0]];
  const turns = Math.max(3, Math.round((y1 - y0) / 0.045));
  for (let i = 0; i <= turns; i++) {
    const y = y0 + ((y1 - y0) * i) / turns;
    prof.push([r * (i % 2 ? 1.1 : 0.98), y]);
  }
  prof.push([r * 0.95, y1], [0, y1]);
  part(g, lathe(prof, 10), mat, R);
}

// --- the shapes ------------------------------------------------------------------

function pickaxe(g, R, head) {
  haft(g, R, 0.9);
  part(g, plate((s) => {
    s.moveTo(-0.43, 0.68);
    s.quadraticCurveTo(-0.24, 0.905, 0, 0.92);
    s.quadraticCurveTo(0.24, 0.905, 0.43, 0.68);
    s.quadraticCurveTo(0.22, 0.795, 0, 0.8);
    s.quadraticCurveTo(-0.22, 0.795, -0.43, 0.68);
  }, { depth: 0.034, bevel: 0.022, size: 0.014 }), head, R);
  // the eye the haft goes through: a collar of the same stuff
  part(g, plate((s) => {
    s.moveTo(-0.065, 0.76); s.lineTo(0.065, 0.76); s.lineTo(0.06, 0.93);
    s.lineTo(-0.06, 0.93); s.lineTo(-0.065, 0.76);
  }, { depth: 0.08, bevel: 0.01, size: 0.008 }), head, R);
}

function axe(g, R, head) {
  haft(g, R, 0.95);
  part(g, plate((s) => {
    s.moveTo(0.12, 0.78);
    s.lineTo(0.12, 0.915);
    s.lineTo(0.05, 0.935);
    s.lineTo(-0.11, 0.935);
    s.quadraticCurveTo(-0.22, 0.955, -0.31, 1.0);        // the toe
    s.quadraticCurveTo(-0.44, 0.83, -0.34, 0.62);        // the edge
    s.quadraticCurveTo(-0.19, 0.69, -0.08, 0.775);       // the beard
    s.lineTo(0.05, 0.775);
    s.lineTo(0.12, 0.78);
  }, { depth: 0.022, bevel: 0.024, size: 0.02 }), head, R);
  // the poll's cheeks, thicker than the blade, round the eye
  part(g, plate((s) => {
    s.moveTo(-0.07, 0.775); s.lineTo(0.13, 0.78); s.lineTo(0.13, 0.925);
    s.lineTo(-0.07, 0.935); s.lineTo(-0.07, 0.775);
  }, { depth: 0.07, bevel: 0.012, size: 0.008 }), head, R);
}

function shovel(g, R, head) {
  haft(g, R, 0.7);
  // the socket, and the blade dished a little so it holds what it lifts
  part(g, lathe([[0.034, 0.55], [0.046, 0.6], [0.05, 0.7], [0.03, 0.74]], 10),
    head === 'plank' || head === 'stone' ? 'woodDark' : head, R);
  const blade = plate((s) => {
    s.moveTo(-0.15, 0.7);
    s.lineTo(-0.165, 0.97);
    s.quadraticCurveTo(-0.14, 1.09, 0, 1.13);
    s.quadraticCurveTo(0.14, 1.09, 0.165, 0.97);
    s.lineTo(0.15, 0.7);
    s.quadraticCurveTo(0, 0.64, -0.15, 0.7);
  }, { depth: 0.012, bevel: 0.012, size: 0.01 });
  const pos = blade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) - 0.35 * x * x);
  }
  blade.computeVertexNormals();
  part(g, blade, head, R);
}

function hoe(g, R, head) {
  haft(g, R, 0.93);
  part(g, plate((s) => {
    s.moveTo(0.07, 0.83);
    s.lineTo(0.07, 0.925);
    s.lineTo(-0.29, 0.935);
    s.quadraticCurveTo(-0.37, 0.935, -0.375, 0.86);
    s.lineTo(-0.36, 0.63);          // the blade, down toward the ground
    s.lineTo(-0.27, 0.655);
    s.lineTo(-0.27, 0.83);
    s.lineTo(0.07, 0.83);
  }, { depth: 0.03, bevel: 0.014, size: 0.012 }), head, R);
}

function sword(g, R, head) {
  const soft = head === 'plank' || head === 'stone';
  const fitting = soft ? 'woodDark' : head === 'diamond' ? 'gold' : head;
  // grip, pommel and guard
  wrapped(g, R, -0.13, 0.115);
  part(g, lathe([[0, -0.235], [0.03, -0.232], [0.056, -0.205], [0.058, -0.175],
    [0.04, -0.14], [0.02, -0.128], [0, -0.128]], 10), fitting, R);
  part(g, plate((s) => {
    s.moveTo(-0.215, 0.13);
    s.quadraticCurveTo(-0.235, 0.15, -0.215, 0.185);   // a quillon's end, turned up
    s.quadraticCurveTo(-0.1, 0.165, 0, 0.17);
    s.quadraticCurveTo(0.1, 0.165, 0.215, 0.185);
    s.quadraticCurveTo(0.235, 0.15, 0.215, 0.13);
    s.quadraticCurveTo(0, 0.112, -0.215, 0.13);
  }, { depth: 0.05, bevel: 0.014, size: 0.01 }), fitting, R);
  // the blade: diamond in section, so it has two edges and a spine
  part(g, plate((s) => {
    s.moveTo(-0.04, 0.17);
    s.lineTo(-0.036, 0.9);
    s.quadraticCurveTo(-0.032, 1.03, 0, 1.13);
    s.quadraticCurveTo(0.032, 1.03, 0.036, 0.9);
    s.lineTo(0.04, 0.17);
    s.lineTo(-0.04, 0.17);
  }, { depth: 0.004, bevel: 0.016, size: 0.022, segs: 1 }), head, R);
  // ...and a fuller down the middle of each face
  if (!soft) {
    part(g, plate((s) => {
      s.moveTo(-0.009, 0.2); s.lineTo(0.009, 0.2); s.lineTo(0.007, 0.8);
      s.lineTo(0, 0.83); s.lineTo(-0.007, 0.8); s.lineTo(-0.009, 0.2);
    }, { depth: 0.038, bevel: 0 }), head === 'diamond' ? 'diamond' : 'ironDark', R);
  }
}

function club(g, R) {
  part(g, lathe([[0, -0.2], [0.04, -0.2], [0.046, -0.17], [0.044, 0.05], [0.06, 0.35],
    [0.085, 0.62], [0.105, 0.84], [0.1, 0.96], [0.07, 1.02], [0, 1.04]], 11), 'woodDark', R);
  // knots where the branches were taken off
  const K = [[0.62, 0.3], [0.8, 2.4], [0.47, 4.1], [0.9, 5.3]];
  for (const [y, a] of K) {
    const r = 0.022 + y * 0.012;
    const rad = 0.045 + y * 0.065;
    part(g, lathe([[0, -r], [r * 0.9, -r * 0.4], [r, 0], [r * 0.9, r * 0.4], [0, r]], 6),
      'wood', R, { x: Math.cos(a) * rad, y, z: Math.sin(a) * rad, rz: Math.PI / 2, ry: a });
  }
}

function knife(g, R, head) {
  wrapped(g, R, -0.15, 0.13, 0.038);
  part(g, plate((s) => {
    s.moveTo(-0.048, 0.12);
    s.lineTo(-0.058, 0.28);
    s.lineTo(-0.04, 0.44);
    s.lineTo(-0.016, 0.58);
    s.lineTo(0, 0.63);
    s.lineTo(0.022, 0.55);
    s.lineTo(0.046, 0.39);
    s.lineTo(0.052, 0.22);
    s.lineTo(0.046, 0.12);
    s.lineTo(-0.048, 0.12);
  }, { depth: 0.006, bevel: 0.016, size: 0.022, segs: 1, curve: 1 }), head, R);
}

function spear(g, R, head) {
  const flint = head === 'flint';
  part(g, lathe([[0, -0.42], [0.03, -0.42], [0.03, 0.2], [0.028, 0.72], [0, 0.72]], 9),
    'wood', R);
  // the socket, or for a flint point the thong it is bound on with
  if (flint) wrapped(g, R, 0.62, 0.76, 0.034);
  else part(g, lathe([[0.03, 0.6], [0.04, 0.63], [0.038, 0.76], [0.025, 0.8]], 10), head, R);
  part(g, plate((s) => {
    s.moveTo(0, 0.72);
    s.quadraticCurveTo(-0.085, 0.82, -0.055, 0.96);
    s.quadraticCurveTo(-0.028, 1.06, 0, 1.12);
    s.quadraticCurveTo(0.028, 1.06, 0.055, 0.96);
    s.quadraticCurveTo(0.085, 0.82, 0, 0.72);
  }, flint ? { depth: 0.006, bevel: 0.018, size: 0.02, segs: 1, curve: 3 }
    : { depth: 0.004, bevel: 0.016, size: 0.02, segs: 2 }), head, R);
}

function hammer(g, R, head) {
  if (head === 'plank') {
    // a mallet: a turned wooden head across the haft
    haft(g, R, 0.84);
    part(g, lathe([[0, -0.19], [0.085, -0.19], [0.1, -0.17], [0.1, 0.17], [0.085, 0.19],
      [0, 0.19]], 12), 'woodDark', R, { y: 0.86, rz: Math.PI / 2 });
    return;
  }
  haft(g, R, 0.93, 'woodDark');
  // the head: a squared face on one side, a spike on the other, a point on top
  part(g, plate((s) => {
    s.moveTo(-0.07, 0.775); s.lineTo(0.21, 0.765); s.lineTo(0.235, 0.79);
    s.lineTo(0.235, 0.95); s.lineTo(0.21, 0.975); s.lineTo(-0.07, 0.965);
    s.lineTo(-0.07, 0.775);
  }, { depth: 0.1, bevel: 0.016, size: 0.012 }), head, R);
  part(g, plate((s) => {
    s.moveTo(-0.07, 0.8);
    s.quadraticCurveTo(-0.2, 0.83, -0.33, 0.8);
    s.quadraticCurveTo(-0.2, 0.9, -0.07, 0.94);
    s.lineTo(-0.07, 0.8);
  }, { depth: 0.03, bevel: 0.018, size: 0.012, segs: 1 }), head, R);
  part(g, lathe([[0.035, 0.96], [0.03, 1.01], [0, 1.07]], 6), head, R);
  // a band round the haft under the head
  part(g, lathe([[0.032, 0.72], [0.038, 0.73], [0.038, 0.77], [0.032, 0.78]], 10),
    head === 'diamond' ? 'gold' : 'ironDark', R);
}

const SHAPES = { pickaxe, axe, shovel, hoe, sword, club, knife, spear, hammer };

// --- which model an item is ----------------------------------------------------

/**
 * The model an item is held as — 'shape:material' — or null for anything that
 * is not a tool or a hand weapon (it keeps its icon). Read off the item's id,
 * which is where items.js writes both.
 */
export function toolModelKey(item) {
  if (!item?.id) return null;
  const id = item.id;
  if (id === 'club') return 'club:wood';
  if (id === 'flint_knife') return 'knife:flint';
  if (id === 'flint_spear') return 'spear:flint';
  if (id === 'spear') return 'spear:iron';
  if (id === 'wood_hammer') return 'hammer:wood';
  if (id === 'hammer') return 'hammer:iron';
  const m = /^([a-z]+)_(pickaxe|axe|shovel|hoe|sword|spear|hammer)$/.exec(id);
  if (!m || !HEAD_OF[m[1]]) return null;
  return `${m[2]}:${m[1]}`;
}

/**
 * Build a held model. `size` is how big a unit is in blocks — the extruded
 * icon's own size, so the model and the icon it replaces come out the same
 * size in the hand. Returns a group whose origin is the grip and whose frame
 * is the one the extruded icon's geometry ends up in (see buildSolidRes in
 * player.js), so it poses exactly as that did.
 */
export function buildToolModel(key, { realistic = false, size = 0.44 } = {}) {
  const [shape, matKey] = String(key).split(':');
  const build = SHAPES[shape];
  if (!build) return null;
  const head = HEAD_OF[matKey] ?? 'iron';
  const inner = new THREE.Group();
  build(inner, realistic, head);
  // up the icon's diagonal, then turned as the icon's geometry is turned
  inner.rotation.set(0, Math.PI / 2, -Math.PI / 4);
  inner.scale.setScalar(size);
  const group = new THREE.Group();
  group.add(inner);
  group.userData.toolModel = key;
  return group;
}

/** Let go of a model's geometry. The materials are shared and stay. */
export function disposeToolModel(group) {
  group?.traverse((o) => {
    if (o.isMesh) o.geometry?.dispose();
  });
}

export const TOOL_MODEL_SHAPES = Object.keys(SHAPES);

// The parts, for gunmodels.js: the same materials, the same Classic light and
// the same two ways of making a part, so a rifle's stock and an axe's haft
// are the same wood under the same sun.
export { lathe, plate, part as modelPart };
