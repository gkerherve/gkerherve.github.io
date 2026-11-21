// gunmodels.js — the guns you can actually see yourself holding.
//
// Every held item used to be a flat sprite of its hotbar icon, which made a
// bazooka on your shoulder and a pistol in your fist the same postcard at the
// same angle. The first rigs that replaced them were boxes in flat unlit
// colours — a silhouette, and from any distance a dark bar — and the player
// said the weapons did not look like weapons. These are MODELLED, the way
// the tools in toolmodels.js are and out of the same parts and materials: a
// barrel turned round its bore, a stock cut from a side profile with a wrist
// and a comb and a plate on its butt, a trigger guard that is a loop with a
// hole in it, sights you could line up. Blued steel and walnut, polymer and
// olive paint, lit by the light a Classic model carries (see toolmodels.js)
// or by the sun under the Realistic style.
//
// The frame is the one the rigs always had — barrel down -Z, the origin
// where the hand closes on the grip, +Y up — so the poses below and
// everything in player.js that kicks and flashes them stand as they were.
//
// Nothing here animates itself. The model exposes `muzzle` (where the flash
// and the departing round belong, in the model's own frame) and player.js
// owns the kick; combat.js keeps owning the ballistics.

import * as THREE from 'three';
import { lathe, plate, modelPart } from './toolmodels.js';

let R = false;    // is the rig being built for the Realistic style

// A part cut from a SIDE PROFILE: drawn with `a` forward toward the muzzle
// and `y` up, `w` across. The profile is extruded across and turned so that
// forward is -Z, which is what every rig here is built to.
function side(draw, w, { bevel = 0.005, size = 0.004, segs = 2, curve = 8 } = {}) {
  const geo = plate(draw, { depth: Math.max(0.001, w - 2 * bevel), bevel, size, segs, curve });
  geo.rotateY(Math.PI / 2);
  return geo;
}
// A part turned about the BORE: a profile of [radius, a] pairs, a forward.
function bore(profile, segs = 14) {
  const geo = lathe(profile, segs);
  geo.rotateX(-Math.PI / 2);
  return geo;
}
// A part turned about the vertical, for grips and a bow's string.
const upright = (profile, segs = 10) => lathe(profile, segs);

const put = (g, geo, mat, t = {}) => modelPart(g, geo, mat, R, t);

// A loop with a hole in it: a trigger guard. `o` is the outside, `i` the
// hole, both as [a, y] points.
function loop(o, i) {
  return (s) => {
    s.moveTo(...o[0]);
    for (const p of o.slice(1)) s.lineTo(...p);
    s.lineTo(...o[0]);
    const h = new THREE.Path();
    h.moveTo(...i[0]);
    for (const p of i.slice(1)) h.lineTo(...p);
    h.lineTo(...i[0]);
    s.holes.push(h);
  };
}
const poly = (pts) => (s) => {
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.lineTo(...pts[0]);
};

// A bow's limb: a band down a centreline of [a, y] points, its thickness
// running from `t0` at the first point to `t1` at the last.
function band(pts, t0, t1) {
  return (s) => {
    const n = pts.length;
    const L = [], Rt = [];
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const q = pts[Math.min(n - 1, k + 1)], o = pts[Math.max(0, k - 1)];
      let da = q[0] - o[0], dy = q[1] - o[1];
      const len = Math.hypot(da, dy) || 1;
      da /= len; dy /= len;
      const t = (t0 + (t1 - t0) * (k / (n - 1))) / 2;
      L.push([p[0] - dy * t, p[1] + da * t]);
      Rt.push([p[0] + dy * t, p[1] - da * t]);
    }
    s.moveTo(...L[0]);
    for (const p of L.slice(1)) s.lineTo(...p);
    for (const p of Rt.reverse()) s.lineTo(...p);
    s.lineTo(...L[0]);
  };
}

// --- the families -----------------------------------------------------------

function pistol(g) {
  // the slide, its front chamfered and its top eased
  put(g, side(poly([[-0.05, 0.022], [0.25, 0.022], [0.258, 0.08], [0.244, 0.102],
    [-0.038, 0.102], [-0.056, 0.086]]), 0.066), 'blued');
  // grip serrations at the back of it, and the ejection port on the right
  for (let k = 0; k < 4; k++) {
    const a = -0.043 + k * 0.014;
    put(g, side(poly([[a, 0.03], [a + 0.006, 0.03], [a + 0.006, 0.096], [a, 0.096]]), 0.069,
      { bevel: 0.001, size: 0.001 }), 'gunmetal');
  }
  put(g, side(poly([[0.07, 0.07], [0.14, 0.07], [0.14, 0.092], [0.07, 0.092]]), 0.02,
    { bevel: 0.002 }), 'gunmetal', { x: 0.026 });
  // the barrel's crown, proud of the slide, and the bore in it
  put(g, bore([[0.0145, 0.24], [0.0145, 0.264], [0.011, 0.266], [0, 0.266]]), 'steel',
    { y: 0.06 });
  put(g, bore([[0.0085, 0.262], [0.0085, 0.2672], [0, 0.2672]], 10), 'polymer', { y: 0.06 });
  // the frame under it, the dust cover out to the muzzle
  put(g, side(poly([[-0.048, -0.004], [0.23, -0.004], [0.236, 0.024], [-0.05, 0.024]]),
    0.06), 'polymer');
  // the trigger guard, a real loop, and the trigger in it
  put(g, side(loop([[0.0, 0.0], [0.135, 0.0], [0.14, -0.028], [0.105, -0.072],
    [0.018, -0.072], [0.0, -0.04]], [[0.022, -0.012], [0.118, -0.012], [0.098, -0.056],
    [0.03, -0.056]]), 0.022), 'polymer');
  put(g, side(poly([[0.042, -0.004], [0.058, -0.004], [0.056, -0.028], [0.046, -0.046],
    [0.04, -0.04], [0.046, -0.026]]), 0.012), 'steel');
  // the grip, raked back, with walnut panels either side
  put(g, side(poly([[-0.058, 0.002], [0.03, 0.002], [0.0, -0.165], [-0.03, -0.19],
    [-0.085, -0.182], [-0.098, -0.16]]), 0.064), 'polymer');
  put(g, side(poly([[-0.05, -0.018], [0.016, -0.018], [-0.008, -0.152], [-0.03, -0.168],
    [-0.074, -0.162], [-0.085, -0.146]]), 0.074, { bevel: 0.004 }), 'walnut');
  // the hammer, and the sights: a post up front, a notch at the back
  put(g, side(poly([[-0.07, 0.06], [-0.05, 0.07], [-0.05, 0.1], [-0.068, 0.108],
    [-0.078, 0.09]]), 0.018), 'steel');
  put(g, side(poly([[0.216, 0.1], [0.236, 0.1], [0.232, 0.121], [0.22, 0.121]]), 0.012,
    { bevel: 0.002 }), 'gunmetal');
  put(g, side(poly([[-0.036, 0.1], [0.0, 0.1], [0.0, 0.119], [-0.036, 0.119]]), 0.05,
    { bevel: 0.002 }), 'gunmetal');
  put(g, side(poly([[-0.032, 0.109], [-0.004, 0.109], [-0.004, 0.121], [-0.032, 0.121]]),
    0.012, { bevel: 0.001 }), 'polymer');
  return { muzzle: [0, 0.06, -0.268] };
}

// A walnut stock, cut from one profile: the butt, the comb, the wrist the
// hand closes on, the belly under the action and the fore-end under the
// barrel. `butt` is how far back it runs, `tip` how far forward.
function stock(g, butt, tip, w = 0.058) {
  put(g, side((s) => {
    s.moveTo(butt, 0.066);
    s.lineTo(butt, -0.142);                            // the butt's back
    s.quadraticCurveTo(butt * 0.58, -0.112, -0.1, -0.056);   // up to the wrist
    s.lineTo(-0.02, -0.05);
    s.lineTo(0.13, -0.046);                            // under the action
    s.lineTo(tip - 0.02, -0.03);                       // the fore-end
    s.quadraticCurveTo(tip + 0.008, -0.022, tip, 0.012);
    s.lineTo(0.15, 0.022);                             // the barrel channel
    s.lineTo(-0.02, 0.026);
    s.quadraticCurveTo(-0.07, 0.03, -0.1, 0.047);      // the wrist up to the comb
    s.lineTo(butt, 0.066);
  }, w, { bevel: 0.009, size: 0.006 }), 'walnut');
  // the plate on the butt
  put(g, side(poly([[butt - 0.01, 0.069], [butt + 0.004, 0.069], [butt + 0.004, -0.146],
    [butt - 0.01, -0.146]]), w + 0.004, { bevel: 0.003 }), 'blued');
}

function rifle(g) {
  stock(g, -0.44, 0.47);
  // the action, and the bolt with its handle out to the right
  put(g, side(poly([[-0.03, 0.016], [0.16, 0.016], [0.16, 0.07], [0.142, 0.08],
    [-0.012, 0.08], [-0.03, 0.066]]), 0.05), 'blued');
  put(g, bore([[0.013, -0.045], [0.014, -0.03], [0.014, 0.09], [0, 0.09]], 10), 'steel',
    { y: 0.066 });
  put(g, lathe([[0, 0], [0.007, 0.002], [0.007, 0.05], [0, 0.052]], 8), 'steel',
    { x: 0.025, y: 0.062, z: 0.0, rz: -Math.PI / 2 - 0.5 });
  put(g, lathe([[0, -0.014], [0.012, -0.007], [0.013, 0], [0.012, 0.007], [0, 0.014]], 8),
    'steel', { x: 0.069, y: 0.036, z: 0 });
  // the barrel, stepped down to the muzzle, with a band where it meets the stock
  put(g, bore([[0.0185, 0.14], [0.0185, 0.3], [0.016, 0.34], [0.0155, 0.83],
    [0.0165, 0.832], [0.0165, 0.845], [0.009, 0.847], [0, 0.847]]), 'blued', { y: 0.05 });
  put(g, bore([[0.0072, 0.84], [0.0072, 0.8485], [0, 0.8485]], 10), 'polymer', { y: 0.05 });
  put(g, bore([[0.0245, 0.405], [0.0255, 0.41], [0.0255, 0.43], [0.0245, 0.435]], 12),
    'steel', { y: 0.042 });
  // sights: a blade at the muzzle, a leaf halfway down the barrel
  put(g, side(poly([[0.795, 0.064], [0.815, 0.064], [0.812, 0.088], [0.8, 0.088]]), 0.008,
    { bevel: 0.0015 }), 'steel');
  put(g, side(poly([[0.24, 0.063], [0.27, 0.063], [0.268, 0.08], [0.242, 0.08]]), 0.026,
    { bevel: 0.002 }), 'blued');
  // the trigger guard and the trigger
  put(g, side(loop([[-0.012, -0.045], [0.1, -0.045], [0.095, -0.07], [0.06, -0.1],
    [0.01, -0.1], [-0.015, -0.075]], [[0.006, -0.055], [0.084, -0.055], [0.056, -0.088],
    [0.016, -0.088]]), 0.02), 'blued');
  put(g, side(poly([[0.032, -0.048], [0.046, -0.048], [0.044, -0.07], [0.034, -0.086],
    [0.029, -0.08], [0.034, -0.068]]), 0.01), 'steel');
  return { muzzle: [0, 0.05, -0.848] };
}

function shotgun(g) {
  stock(g, -0.42, 0.37, 0.062);
  // the action: case-hardened steel, and the lever on top of it
  put(g, side(poly([[-0.042, -0.012], [0.1, -0.012], [0.122, 0.018], [0.122, 0.074],
    [-0.018, 0.08], [-0.044, 0.056]]), 0.078), 'steel');
  put(g, side(poly([[-0.03, 0.08], [0.02, 0.08], [0.03, 0.09], [-0.03, 0.092]]), 0.02,
    { bevel: 0.002 }), 'blued', { x: 0.012 });
  // the two barrels side by side, and the rib between them
  for (const x of [-0.021, 0.021]) {
    put(g, bore([[0.021, 0.1], [0.021, 0.18], [0.0195, 0.22], [0.0185, 0.7],
      [0.0195, 0.702], [0.0195, 0.712], [0, 0.712]]), 'blued', { x, y: 0.054 });
    put(g, bore([[0.0135, 0.705], [0.0135, 0.7135], [0, 0.7135]], 12), 'polymer',
      { x, y: 0.054 });
  }
  put(g, side(poly([[0.12, 0.066], [0.7, 0.066], [0.7, 0.077], [0.12, 0.08]]), 0.014,
    { bevel: 0.002 }), 'blued');
  put(g, upright([[0, 0], [0.007, 0.002], [0.0075, 0.008], [0.004, 0.013], [0, 0.014]], 8),
    'brass2', { y: 0.077, z: -0.69 });
  // two triggers in one guard
  put(g, side(loop([[-0.012, -0.012], [0.105, -0.012], [0.098, -0.04], [0.062, -0.072],
    [0.01, -0.072], [-0.016, -0.045]], [[0.004, -0.022], [0.09, -0.022], [0.06, -0.06],
    [0.014, -0.06]]), 0.02), 'blued');
  for (const a of [0.028, 0.05]) {
    put(g, side(poly([[a, -0.016], [a + 0.01, -0.016], [a + 0.008, -0.04], [a, -0.052],
      [a - 0.004, -0.046], [a, -0.036]]), 0.009), 'steel');
  }
  return { muzzle: [0, 0.054, -0.713] };
}

function bow(g) {
  // A RECURVE: the limbs curve back toward you from the grip, and their tips
  // turn forward again — which is the whole silhouette of a bow that has a
  // string on it rather than a bent stick.
  const upper = [[0.0, 0.07], [-0.022, 0.16], [-0.058, 0.25], [-0.094, 0.33],
    [-0.108, 0.385], [-0.098, 0.425], [-0.072, 0.45]];
  const lower = upper.map(([a, y]) => [a, -y]);
  put(g, side(band(upper, 0.036, 0.012), 0.034, { bevel: 0.004, size: 0.003 }), 'walnut');
  put(g, side(band(lower, 0.036, 0.012), 0.034, { bevel: 0.004, size: 0.003 }), 'walnut');
  // the riser, and the grip wound in leather
  put(g, side(poly([[-0.022, -0.1], [0.024, -0.1], [0.03, 0.0], [0.024, 0.1], [-0.022, 0.1],
    [-0.03, 0.0]]), 0.04), 'woodDark');
  put(g, upright([[0, -0.07], [0.028, -0.07], [0.031, -0.05], [0.029, -0.03], [0.031, -0.01],
    [0.029, 0.01], [0.031, 0.03], [0.029, 0.05], [0.028, 0.07], [0, 0.07]], 10), 'leather');
  // the arrow shelf, and the string from nock to nock
  put(g, side(poly([[0.024, 0.07], [0.05, 0.07], [0.05, 0.078], [0.024, 0.082]]), 0.03,
    { bevel: 0.002 }), 'woodDark');
  put(g, upright([[0, -0.432], [0.0035, -0.43], [0.0035, 0.43], [0, 0.432]], 6), 'string',
    { z: 0.098 });
  return { muzzle: [0, 0.075, -0.06] };
}

function bazooka(g) {
  // the tube rides high — it is on your shoulder, not at your hip
  put(g, bore([[0.092, -0.49], [0.086, -0.47], [0.076, -0.43], [0.072, -0.4],
    [0.072, 0.56], [0.08, 0.59], [0.087, 0.63], [0.088, 0.645], [0.07, 0.648]], 18),
    'olive', { y: 0.14 });
  put(g, bore([[0.062, 0.56], [0.062, 0.647], [0, 0.647]], 16), 'polymer', { y: 0.14 });
  put(g, bore([[0.068, -0.492], [0, -0.492], [0, -0.488], [0.068, -0.488]], 16), 'polymer',
    { y: 0.14 });
  // bands round it, the sight frame on top, the grips below
  for (const a of [-0.25, 0.1, 0.42]) {
    put(g, bore([[0.075, a], [0.078, a + 0.005], [0.078, a + 0.03], [0.075, a + 0.035]], 18),
      'oliveDark', { y: 0.14 });
  }
  put(g, side(poly([[0.24, 0.205], [0.3, 0.205], [0.3, 0.215], [0.24, 0.215]]), 0.03,
    { bevel: 0.002 }), 'gunmetal');
  put(g, side(loop([[0.26, 0.21], [0.29, 0.21], [0.292, 0.29], [0.258, 0.29]],
    [[0.266, 0.24], [0.284, 0.24], [0.285, 0.282], [0.265, 0.282]]), 0.006,
    { bevel: 0.001 }), 'gunmetal');
  put(g, side(poly([[-0.04, 0.075], [0.035, 0.075], [0.03, 0.04], [0.01, -0.07],
    [-0.035, -0.075], [-0.045, -0.05]]), 0.046), 'polymer');
  put(g, side(poly([[0.25, 0.075], [0.31, 0.075], [0.3, -0.03], [0.26, -0.035]]), 0.044),
    'polymer');
  put(g, side(loop([[0.04, 0.074], [0.1, 0.074], [0.095, 0.02], [0.05, 0.015]],
    [[0.052, 0.065], [0.09, 0.065], [0.086, 0.028], [0.056, 0.024]]), 0.014), 'gunmetal');
  // the shoulder rest under the back of the tube
  put(g, side(poly([[-0.4, 0.07], [-0.18, 0.07], [-0.2, 0.03], [-0.38, 0.03]]), 0.07,
    { bevel: 0.008 }), 'oliveDark');
  return { muzzle: [0, 0.14, -0.648] };
}

function launcher(g) {
  // four tubes in a housing, their mouths proud of the front plate
  put(g, side(poly([[-0.23, 0.0], [0.47, 0.0], [0.5, 0.02], [0.5, 0.17], [0.47, 0.19],
    [-0.21, 0.19], [-0.23, 0.17]]), 0.21, { bevel: 0.012, size: 0.008 }), 'oliveDark');
  for (const [mx, my] of [[-0.052, 0.05], [0.052, 0.05], [-0.052, 0.14], [0.052, 0.14]]) {
    put(g, bore([[0.036, 0.48], [0.04, 0.5], [0.04, 0.53], [0.03, 0.532]], 14), 'gunmetal',
      { x: mx, y: my });
    put(g, bore([[0.029, 0.5], [0.029, 0.531], [0, 0.531]], 12), 'polymer', { x: mx, y: my });
  }
  // the carry handle, the optic on its rail, and the grip
  put(g, side(loop([[-0.08, 0.19], [0.28, 0.19], [0.26, 0.255], [-0.06, 0.255]],
    [[-0.05, 0.19], [0.25, 0.19], [0.235, 0.232], [-0.035, 0.232]]), 0.04), 'olive');
  put(g, bore([[0.024, -0.05], [0.026, -0.04], [0.026, 0.12], [0.03, 0.14], [0.03, 0.17],
    [0, 0.17]], 14), 'gunmetal', { x: -0.06, y: 0.285 });
  put(g, bore([[0.022, 0.165], [0.022, 0.1705], [0, 0.1705]], 12), 'sight',
    { x: -0.06, y: 0.285 });
  put(g, side(poly([[-0.045, 0.0], [0.035, 0.0], [0.028, -0.04], [0.008, -0.13],
    [-0.035, -0.135], [-0.048, -0.11]]), 0.05), 'polymer');
  return { muzzle: [0, 0.095, -0.532] };
}

const BUILDERS = { pistol, rifle, shotgun, bow, bazooka, launcher };

// How each rig hangs off the view arm's hold point: position, rotation and
// scale chosen so the barrel crosses the lower-right of the frame toward the
// crosshair — the classic first-person carry. The bazooka sits higher and
// nearer the shoulder line.
//
// Brought further into the frame than the box rigs were: with the fist parked
// in the corner a gun was a barrel poking in from the edge and the bow was
// its grip and nothing else. The rotations are the arm's own tilt cancelled,
// so the barrel still points at the crosshair.
export const GUN_POSE = {
  pistol: { pos: [-0.10, 0.15, -0.10], rot: [-0.34, 0.36, -0.05], scale: 1.2 },
  rifle: { pos: [-0.13, 0.13, 0.0], rot: [-0.33, 0.34, -0.04], scale: 1.0 },
  shotgun: { pos: [-0.13, 0.13, 0.0], rot: [-0.33, 0.34, -0.04], scale: 1.0 },
  bow: { pos: [-0.12, 0.20, -0.08], rot: [-0.30, 0.52, 0.35], scale: 1.0 },
  bazooka: { pos: [-0.16, 0.22, 0.06], rot: [-0.28, 0.30, -0.02], scale: 1.0 },
  launcher: { pos: [-0.15, 0.20, 0.04], rot: [-0.29, 0.32, -0.03], scale: 1.0 },
};

/**
 * Build the rig for a weapon id. Returns { group, muzzle, flash } — `flash`
 * is a hidden bloom of quads parked at the muzzle for player.gunFire() to
 * blink, so the bang happens at the barrel and not at the middle of the
 * screen.
 */
export function buildGunModel(id, { realistic = false } = {}) {
  const build = BUILDERS[id];
  if (!build) return null;
  const group = new THREE.Group();
  R = realistic;
  const { muzzle } = build(group);
  R = false;

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Group();
  for (const rz of [0, Math.PI / 2]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    q.rotation.set(0, 0, rz);
    flash.add(q);
  }
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.10), flashMat);
  disc.rotation.y = Math.PI / 2;
  flash.add(disc);
  flash.position.set(...muzzle);
  flash.visible = false;
  group.add(flash);

  return { group, muzzle, flash };
}

export const hasGunModel = (id) => !!BUILDERS[id];
